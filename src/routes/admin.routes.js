const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { db } = require('../config/database');
const { authenticateToken, requireRole, checkMfaVerified } = require('../middleware/auth');
const { generateTempPassword } = require('../utils/password');
const { sendApprovalEmail, sendPasswordResetEmail, sendRegistrationEmail } = require('../services/email.service');

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole('admin'));
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

router.get('/users', (req, res) => {
  try {
    const { status } = req.query;

    let query = 'SELECT id, username, email, role, is_approved, is_active, force_password_change, mfa_enabled, email_confirmed_at, created_at, updated_at FROM users WHERE 1=1';
    const params = [];

    if (status === 'pending') {
      query += ' AND is_approved = 0 AND is_active = 1';
    } else if (status === 'active') {
      query += ' AND is_approved = 1 AND is_active = 1';
    } else if (status === 'inactive') {
      query += ' AND is_active = 0';
    }

    query += ' ORDER BY id DESC';

    const users = db.prepare(query).all(...params);
    res.json({ data: users });
  } catch (err) {
    console.error('Erro ao listar usuários:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/users/:id', (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, username, email, role, is_approved, is_active, force_password_change, mfa_enabled, email_confirmed_at, created_at, updated_at FROM users WHERE id = ?'
    ).get(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ data: user });
  } catch (err) {
    console.error('Erro ao buscar usuário:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/users/:id/receipts', (req, res) => {
  try {
    const userId = req.params.id;
    const {
      date_from, date_to, value_min, value_max,
      store, type, sort_by, sort_order,
      page = 1, per_page = 20,
    } = req.query;

    const allowedSortColumns = ['purchase_date', 'total_value', 'store_name', 'created_at', 'type'];
    const sortColumn = allowedSortColumns.includes(sort_by) ? sort_by : 'created_at';
    const sortDir = sort_order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereClause = 'WHERE user_id = ? AND is_deleted = 0';
    const params = [userId];

    if (date_from) {
      whereClause += ' AND purchase_date >= ?';
      params.push(date_from);
    }
    if (date_to) {
      whereClause += ' AND purchase_date <= ?';
      params.push(date_to);
    }
    if (value_min) {
      whereClause += ' AND total_value >= ?';
      params.push(parseFloat(value_min));
    }
    if (value_max) {
      whereClause += ' AND total_value <= ?';
      params.push(parseFloat(value_max));
    }
    if (store) {
      whereClause += ' AND store_name LIKE ?';
      params.push(`%${store}%`);
    }
    if (type) {
      whereClause += ' AND type = ?';
      params.push(type);
    }

    const countResult = db.prepare(
      `SELECT COUNT(*) as total FROM receipts ${whereClause}`
    ).get(...params);
    const total = countResult.total;

    const limit = Math.min(Math.max(parseInt(per_page, 10) || 20, 1), 100);
    const currentPage = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (currentPage - 1) * limit;
    const totalPages = Math.ceil(total / limit);

    const receipts = db.prepare(
      `SELECT * FROM receipts ${whereClause} ORDER BY ${sortColumn} ${sortDir} LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    res.json({
      data: receipts,
      pagination: {
        page: currentPage,
        per_page: limit,
        total,
        total_pages: totalPages,
      },
    });
  } catch (err) {
    console.error('Erro ao buscar recibos do usuário:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/users', async (req, res) => {
  try {
    const { username, email, role } = req.body;

    if (!username || !email) {
      return res.status(400).json({ error: 'Usuário e e-mail são obrigatórios' });
    }

    const existing = db.prepare(
      'SELECT id FROM users WHERE username = ? OR email = ?'
    ).get(username, email);

    if (existing) {
      return res.status(409).json({ error: 'Usuário ou e-mail já cadastrado' });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const userRole = role === 'admin' ? 'admin' : 'user';

    const result = db.prepare(
      'INSERT INTO users (username, email, password_hash, role, is_approved, is_active, force_password_change, temp_password, email_confirmed_at, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, 1, ?, datetime(\'now\'), datetime(\'now\'), datetime(\'now\'))'
    ).run(username, email, passwordHash, userRole, tempPassword);

    const newUser = { id: result.lastInsertRowid, username, email };

    try {
      await sendApprovalEmail(newUser, tempPassword);
    } catch (_) {}

    logAudit(req.user.id, 'ADMIN_CREATE_USER', { targetUser: username, targetEmail: email }, req);

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      data: {
        id: newUser.id,
        username,
        email,
        role: userRole,
        temp_password: tempPassword,
      },
    });
  } catch (err) {
    console.error('Erro ao criar usuário:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.patch('/users/:id/approve', async (req, res) => {
  try {
    const userId = req.params.id;

    const user = db.prepare(
      'SELECT * FROM users WHERE id = ? AND is_active = 1'
    ).get(userId);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (user.is_approved) {
      return res.status(400).json({ error: 'Usuário já está aprovado' });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    db.prepare(
      'UPDATE users SET is_approved = 1, password_hash = ?, force_password_change = 1, temp_password = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(passwordHash, tempPassword, userId);

    try {
      await sendApprovalEmail({ id: userId, username: user.username, email: user.email }, tempPassword);
    } catch (_) {}

    logAudit(req.user.id, 'ADMIN_APPROVE_USER', { targetUserId: userId, targetUser: user.username }, req);

    res.json({ message: 'Usuário aprovado com sucesso' });
  } catch (err) {
    console.error('Erro ao aprovar usuário:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.patch('/users/:id/reset-password', async (req, res) => {
  try {
    const userId = req.params.id;

    const user = db.prepare(
      'SELECT * FROM users WHERE id = ? AND is_active = 1'
    ).get(userId);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    db.prepare(
      'UPDATE users SET password_hash = ?, force_password_change = 1, temp_password = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(passwordHash, tempPassword, userId);

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000).toISOString();

    db.prepare(
      'UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?'
    ).run(resetToken, expires, userId);

    try {
      await sendApprovalEmail({ id: userId, username: user.username, email: user.email }, tempPassword);
    } catch (_) {}

    logAudit(req.user.id, 'ADMIN_RESET_PASSWORD', { targetUserId: userId, targetUser: user.username }, req);

    res.json({ message: 'Senha redefinida com sucesso', temp_password: tempPassword });
  } catch (err) {
    console.error('Erro ao redefinir senha:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.patch('/users/:id/email', (req, res) => {
  try {
    const userId = req.params.id;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Novo e-mail é obrigatório' });
    }

    const user = db.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).get(userId);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const emailExists = db.prepare(
      'SELECT id FROM users WHERE email = ? AND id != ?'
    ).get(email, userId);

    if (emailExists) {
      return res.status(409).json({ error: 'E-mail já está em uso' });
    }

    db.prepare(
      'UPDATE users SET email = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(email, userId);

    logAudit(req.user.id, 'ADMIN_UPDATE_EMAIL', { targetUserId: userId, newEmail: email }, req);

    res.json({ message: 'E-mail atualizado com sucesso' });
  } catch (err) {
    console.error('Erro ao atualizar e-mail:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.delete('/users/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Não é possível desativar a própria conta' });
    }

    const user = db.prepare(
      'SELECT * FROM users WHERE id = ? AND is_active = 1'
    ).get(userId);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    db.prepare(
      'UPDATE users SET is_active = 0, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(userId);

    logAudit(req.user.id, 'ADMIN_DEACTIVATE_USER', { targetUserId: userId, targetUser: user.username }, req);

    res.json({ message: 'Usuário desativado com sucesso' });
  } catch (err) {
    console.error('Erro ao desativar usuário:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/users/:id/resend-email', async (req, res) => {
  try {
    const userId = req.params.id;

    const user = db.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).get(userId);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    let tempPassword = user.temp_password;
    if (!tempPassword) {
      tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 12);
      db.prepare(
        'UPDATE users SET password_hash = ?, force_password_change = 1, temp_password = ?, updated_at = datetime(\'now\') WHERE id = ?'
      ).run(passwordHash, tempPassword, userId);
    }

    if (user.is_approved) {
      await sendApprovalEmail({ id: userId, username: user.username, email: user.email }, tempPassword);
    } else {
      await sendRegistrationEmail({ id: userId, username: user.username, email: user.email }, tempPassword);
    }

    logAudit(req.user.id, 'ADMIN_RESEND_EMAIL', { targetUserId: userId, targetUser: user.username }, req);

    res.json({ message: 'E-mail reenviado com sucesso' });
  } catch (err) {
    console.error('Erro ao reenviar e-mail:', err.message);
    res.status(500).json({ error: 'Erro ao enviar e-mail: ' + err.message });
  }
});

router.patch('/users/:id/reactivate', (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    const user = db.prepare(
      'SELECT * FROM users WHERE id = ? AND is_active = 0'
    ).get(userId);

    if (!user) {
      return res.status(404).json({ error: 'Usuário inativo não encontrado' });
    }

    db.prepare(
      'UPDATE users SET is_active = 1, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(userId);

    logAudit(req.user.id, 'ADMIN_REACTIVATE_USER', { targetUserId: userId, targetUser: user.username }, req);

    res.json({ message: 'Usuário reativado com sucesso' });
  } catch (err) {
    console.error('Erro ao reativar usuário:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/stats', (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const startOfMonth = `${year}-${month}-01`;
    const endOfMonth = `${year}-${month}-31`;

    const totalUsers = db.prepare(
      'SELECT COUNT(*) as count FROM users WHERE is_active = 1'
    ).get().count;

    const pendingApproval = db.prepare(
      'SELECT COUNT(*) as count FROM users WHERE is_approved = 0 AND is_active = 1'
    ).get().count;

    const activeUsers = db.prepare(
      'SELECT COUNT(*) as count FROM users WHERE is_approved = 1 AND is_active = 1'
    ).get().count;

    const totalReceipts = db.prepare(
      'SELECT COUNT(*) as count FROM receipts WHERE is_deleted = 0'
    ).get().count;

    const monthlyValue = db.prepare(
      'SELECT COALESCE(SUM(total_value), 0) as total FROM receipts WHERE purchase_date >= ? AND purchase_date <= ? AND is_deleted = 0'
    ).get(startOfMonth, endOfMonth).total;

    res.json({
      data: {
        totalUsers,
        pendingApproval,
        totalReceipts,
        totalValue: monthlyValue,
        activeUsers,
      },
    });
  } catch (err) {
    console.error('Erro ao buscar estatísticas:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
