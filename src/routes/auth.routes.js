const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { db } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { loginValidator, registerValidator, passwordValidator } = require('../middleware/validators');
const { validatePasswordStrength, generateTempPassword } = require('../utils/password');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../services/email.service');
const { decryptSecret, verifyToken, verifyBackupCode } = require('../services/mfa.service');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

function getBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function logAudit(userId, action, details, req) {
  try {
    db.prepare(
      'INSERT INTO audit_log (user_id, action, details, ip_address, user_agent, created_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))'
    ).run(
      userId,
      action,
      typeof details === 'object' ? JSON.stringify(details) : details,
      req.ip || req.connection?.remoteAddress,
      req.get('user-agent')
    );
  } catch (_) {}
}

router.post('/login', loginValidator, async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = db.prepare(
      'SELECT * FROM users WHERE username = ? AND is_active = 1'
    ).get(username);

    if (!user) {
      logAudit(null, 'LOGIN_FAILED', { username, reason: 'user_not_found' }, req);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (!user.is_approved) {
      logAudit(user.id, 'LOGIN_FAILED', { reason: 'not_approved' }, req);
      return res.status(403).json({ error: 'Conta aguardando aprovação do administrador' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      logAudit(user.id, 'LOGIN_FAILED', { reason: 'invalid_password' }, req);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (user.mfa_enabled) {
      const mfaToken = jwt.sign(
        { id: user.id, type: 'mfa_pending' },
        JWT_SECRET,
        { expiresIn: '5m' }
      );

      logAudit(user.id, 'MFA_REQUIRED', null, req);
      return res.json({ mfa_required: true, mfa_token: mfaToken });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        mfa_verified: true,
        force_password_change: !!user.force_password_change,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    logAudit(user.id, 'LOGIN_SUCCESS', null, req);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        force_password_change: !!user.force_password_change,
      },
    });
  } catch (err) {
    console.error('Erro no login:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/mfa/verify', async (req, res) => {
  try {
    const { mfa_token, token: totpToken, backup_code } = req.body;

    if (!mfa_token) {
      return res.status(400).json({ error: 'Token MFA ausente' });
    }

    let decoded;
    try {
      decoded = jwt.verify(mfa_token, JWT_SECRET);
    } catch (_) {
      return res.status(401).json({ error: 'Token MFA expirado ou inválido' });
    }

    if (decoded.type !== 'mfa_pending') {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const user = db.prepare(
      'SELECT * FROM users WHERE id = ? AND is_active = 1'
    ).get(decoded.id);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    let verified = false;

    if (totpToken) {
      const secret = decryptSecret(user.mfa_secret);
      verified = verifyToken(secret, totpToken);
    } else if (backup_code) {
      const storedCodes = JSON.parse(user.mfa_backup_codes || '[]');
      const result = await verifyBackupCode(backup_code, storedCodes);

      if (result.valid) {
        verified = true;
        db.prepare(
          'UPDATE users SET mfa_backup_codes = ?, updated_at = datetime(\'now\') WHERE id = ?'
        ).run(JSON.stringify(result.remainingCodes), user.id);
      }
    }

    if (!verified) {
      logAudit(user.id, 'MFA_VERIFY_FAILED', null, req);
      return res.status(401).json({ error: 'Código de verificação inválido' });
    }

    const fullToken = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        mfa_verified: true,
        force_password_change: !!user.force_password_change,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    logAudit(user.id, 'MFA_VERIFY_SUCCESS', null, req);

    res.json({
      token: fullToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        force_password_change: !!user.force_password_change,
      },
    });
  } catch (err) {
    console.error('Erro na verificação MFA:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/register-request', registerValidator, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const strengthResult = validatePasswordStrength(password);
    if (!strengthResult.valid) {
      return res.status(400).json({ error: strengthResult.message });
    }

    const existingUser = db.prepare(
      'SELECT id FROM users WHERE username = ? OR email = ?'
    ).get(username, email);

    if (existingUser) {
      return res.status(409).json({ error: 'Usuário ou e-mail já cadastrado' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const confirmToken = crypto.randomBytes(32).toString('hex');

    const result = db.prepare(
      'INSERT INTO users (username, email, password_hash, role, is_approved, is_active, force_password_change, email_confirm_token, created_at, updated_at) VALUES (?, ?, ?, \'user\', 0, 1, 0, ?, datetime(\'now\'), datetime(\'now\'))'
    ).run(username, email, passwordHash, confirmToken);

    const newUser = { id: result.lastInsertRowid, username, email };

    try {
      await sendWelcomeEmail(newUser, confirmToken, getBaseUrl(req));
    } catch (_) {}

    logAudit(newUser.id, 'REGISTER_REQUEST', { username, email }, req);

    res.status(201).json({
      message: 'Solicitação de cadastro enviada. Verifique seu e-mail para confirmar e aguarde a aprovação do administrador.',
    });
  } catch (err) {
    console.error('Erro no registro:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/change-password', authenticateToken, passwordValidator, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.user.id;

    const user = db.prepare(
      'SELECT * FROM users WHERE id = ? AND is_active = 1'
    ).get(userId);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (!user.force_password_change) {
      if (!current_password) {
        return res.status(400).json({ error: 'Senha atual é obrigatória' });
      }
      const validCurrent = await bcrypt.compare(current_password, user.password_hash);
      if (!validCurrent) {
        return res.status(401).json({ error: 'Senha atual incorreta' });
      }
    }

    const strengthResult = validatePasswordStrength(new_password);
    if (!strengthResult.valid) {
      return res.status(400).json({ error: strengthResult.message });
    }

    const newHash = await bcrypt.hash(new_password, 12);

    db.prepare(
      'UPDATE users SET password_hash = ?, force_password_change = 0, temp_password = NULL, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(newHash, userId);

    logAudit(userId, 'PASSWORD_CHANGED', null, req);

    res.json({ message: 'Senha alterada com sucesso' });
  } catch (err) {
    console.error('Erro ao alterar senha:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, new_password } = req.body;

    if (!token || !new_password) {
      return res.status(400).json({ error: 'Token e nova senha são obrigatórios' });
    }

    const user = db.prepare(
      'SELECT * FROM users WHERE password_reset_token = ? AND password_reset_expires > datetime(\'now\') AND is_active = 1'
    ).get(token);

    if (!user) {
      return res.status(400).json({ error: 'Token inválido ou expirado' });
    }

    const strengthResult = validatePasswordStrength(new_password);
    if (!strengthResult.valid) {
      return res.status(400).json({ error: strengthResult.message });
    }

    const newHash = await bcrypt.hash(new_password, 12);

    db.prepare(
      'UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL, force_password_change = 0, temp_password = NULL, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(newHash, user.id);

    logAudit(user.id, 'PASSWORD_RESET', null, req);

    res.json({ message: 'Senha redefinida com sucesso' });
  } catch (err) {
    console.error('Erro ao redefinir senha:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/request-reset', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'E-mail é obrigatório' });
    }

    const user = db.prepare(
      'SELECT * FROM users WHERE email = ? AND is_active = 1'
    ).get(email);

    if (!user) {
      return res.json({ message: 'Se o e-mail estiver cadastrado, você receberá um link de redefinição.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000).toISOString();

    db.prepare(
      'UPDATE users SET password_reset_token = ?, password_reset_expires = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(resetToken, expires, user.id);

    try {
      await sendPasswordResetEmail(user, resetToken, getBaseUrl(req));
    } catch (_) {}

    logAudit(user.id, 'PASSWORD_RESET_REQUESTED', null, req);

    res.json({ message: 'Se o e-mail estiver cadastrado, você receberá um link de redefinição.' });
  } catch (err) {
    console.error('Erro ao solicitar reset:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/confirm-email/:token', (req, res) => {
  try {
    const { token } = req.params;

    const user = db.prepare(
      'SELECT * FROM users WHERE email_confirm_token = ?'
    ).get(token);

    if (!user) {
      return res.status(400).send(`<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Erro - NotaVault</title></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;">
  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:16px;padding:48px;text-align:center;max-width:480px;">
    <div style="font-size:48px;margin-bottom:16px;">❌</div>
    <h1 style="color:#ff3366;font-size:24px;margin:0 0 16px;">Token Inválido</h1>
    <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0;">O link de confirmação é inválido ou já foi utilizado.</p>
  </div>
</body>
</html>`);
    }

    db.prepare(
      'UPDATE users SET email_confirmed_at = datetime(\'now\'), email_confirm_token = NULL, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(user.id);

    logAudit(user.id, 'EMAIL_CONFIRMED', null, req);

    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>E-mail Confirmado - NotaVault</title></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;">
  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:16px;padding:48px;text-align:center;max-width:480px;">
    <div style="font-size:48px;margin-bottom:16px;">✅</div>
    <h1 style="color:#00ff88;font-size:24px;margin:0 0 16px;">E-mail Confirmado!</h1>
    <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 24px;">Seu e-mail foi confirmado com sucesso. Aguarde a aprovação do administrador para acessar o sistema.</p>
    <span style="display:inline-block;font-size:28px;font-weight:700;color:#00d4ff;letter-spacing:-0.5px;">◆ NotaVault</span>
  </div>
</body>
</html>`);
  } catch (err) {
    console.error('Erro ao confirmar e-mail:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
