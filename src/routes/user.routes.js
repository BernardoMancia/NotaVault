const express = require('express');
const bcrypt = require('bcrypt');
const { db } = require('../config/database');
const { authenticateToken, checkMfaVerified } = require('../middleware/auth');
const {
  generateSecret,
  generateQRCode,
  verifyToken,
  generateBackupCodes,
  hashBackupCodes,
  encryptSecret,
  decryptSecret,
} = require('../services/mfa.service');

const router = express.Router();

router.use(authenticateToken);
router.use(checkMfaVerified);

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

router.get('/profile', (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, username, email, role, is_approved, is_active, force_password_change, mfa_enabled, email_confirmed_at, created_at, updated_at FROM users WHERE id = ? AND is_active = 1'
    ).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ data: user });
  } catch (err) {
    console.error('Erro ao buscar perfil:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.patch('/profile', (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'E-mail é obrigatório' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Formato de e-mail inválido' });
    }

    const emailExists = db.prepare(
      'SELECT id FROM users WHERE email = ? AND id != ?'
    ).get(email, req.user.id);

    if (emailExists) {
      return res.status(409).json({ error: 'E-mail já está em uso' });
    }

    db.prepare(
      'UPDATE users SET email = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(email, req.user.id);

    logAudit(req.user.id, 'PROFILE_UPDATE_EMAIL', { newEmail: email }, req);

    res.json({ message: 'Perfil atualizado com sucesso' });
  } catch (err) {
    console.error('Erro ao atualizar perfil:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/mfa/setup', async (req, res) => {
  try {
    const user = db.prepare(
      'SELECT username, mfa_enabled FROM users WHERE id = ? AND is_active = 1'
    ).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (user.mfa_enabled) {
      return res.status(400).json({ error: 'MFA já está ativado' });
    }

    const { secret, otpauthUrl } = generateSecret(user.username);
    const qrCode = await generateQRCode(otpauthUrl);

    res.json({
      data: {
        qrCode,
        secret,
        otpauthUrl,
      },
    });
  } catch (err) {
    console.error('Erro no setup MFA:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/mfa/enable', async (req, res) => {
  try {
    const { token, secret } = req.body;

    if (!token || !secret) {
      return res.status(400).json({ error: 'Token e secret são obrigatórios' });
    }

    const isValid = verifyToken(secret, token);

    if (!isValid) {
      return res.status(400).json({ error: 'Código TOTP inválido' });
    }

    const encryptedSecret = encryptSecret(secret);
    const backupCodes = generateBackupCodes();
    const hashedCodes = await hashBackupCodes(backupCodes);

    db.prepare(
      'UPDATE users SET mfa_enabled = 1, mfa_secret = ?, mfa_backup_codes = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(encryptedSecret, JSON.stringify(hashedCodes), req.user.id);

    logAudit(req.user.id, 'MFA_ENABLED', null, req);

    res.json({
      message: 'MFA ativado com sucesso',
      data: {
        backupCodes,
      },
    });
  } catch (err) {
    console.error('Erro ao ativar MFA:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/mfa/disable', async (req, res) => {
  try {
    const { password, token } = req.body;

    if (!password || !token) {
      return res.status(400).json({ error: 'Senha e token TOTP são obrigatórios' });
    }

    const user = db.prepare(
      'SELECT * FROM users WHERE id = ? AND is_active = 1'
    ).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (!user.mfa_enabled) {
      return res.status(400).json({ error: 'MFA não está ativado' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    const secret = decryptSecret(user.mfa_secret);
    const validToken = verifyToken(secret, token);

    if (!validToken) {
      return res.status(400).json({ error: 'Código TOTP inválido' });
    }

    db.prepare(
      'UPDATE users SET mfa_enabled = 0, mfa_secret = NULL, mfa_backup_codes = NULL, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(req.user.id);

    logAudit(req.user.id, 'MFA_DISABLED', null, req);

    res.json({ message: 'MFA desativado com sucesso' });
  } catch (err) {
    console.error('Erro ao desativar MFA:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/mfa/backup-codes', async (req, res) => {
  try {
    const user = db.prepare(
      'SELECT mfa_enabled FROM users WHERE id = ? AND is_active = 1'
    ).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (!user.mfa_enabled) {
      return res.status(400).json({ error: 'MFA não está ativado' });
    }

    const backupCodes = generateBackupCodes();
    const hashedCodes = await hashBackupCodes(backupCodes);

    db.prepare(
      'UPDATE users SET mfa_backup_codes = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(JSON.stringify(hashedCodes), req.user.id);

    logAudit(req.user.id, 'MFA_BACKUP_CODES_REGENERATED', null, req);

    res.json({
      message: 'Códigos de backup regenerados',
      data: { backupCodes },
    });
  } catch (err) {
    console.error('Erro ao gerar backup codes:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/mfa/status', (req, res) => {
  try {
    const user = db.prepare(
      'SELECT mfa_enabled FROM users WHERE id = ? AND is_active = 1'
    ).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ data: { mfa_enabled: !!user.mfa_enabled } });
  } catch (err) {
    console.error('Erro ao verificar status MFA:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
