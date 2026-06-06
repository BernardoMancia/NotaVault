const jwt = require('jsonwebtoken');
const { db } = require('../config/database');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = db.prepare(`
      SELECT id, username, email, role, is_approved, is_active, force_password_change, mfa_enabled
      FROM users WHERE id = ? AND is_active = 1
    `).get(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado ou inativo' });
    }

    if (!user.is_approved) {
      return res.status(403).json({ error: 'Conta aguardando aprovação do administrador' });
    }

    req.user = { ...user, mfa_verified: decoded.mfa_verified || false };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Acesso negado. Permissão insuficiente' });
    }
    next();
  };
}

function checkForcePasswordChange(req, res, next) {
  if (req.user && req.user.force_password_change === 1) {
    return res.status(403).json({
      error: 'Alteração de senha obrigatória',
      force_password_change: true,
      redirect: '/change-password'
    });
  }
  next();
}

function checkMfaVerified(req, res, next) {
  if (req.user && req.user.mfa_enabled === 1 && !req.user.mfa_verified) {
    return res.status(403).json({
      error: 'Verificação MFA necessária',
      mfa_required: true,
      redirect: '/mfa-verify'
    });
  }
  next();
}

module.exports = { authenticateToken, requireRole, checkForcePasswordChange, checkMfaVerified };
