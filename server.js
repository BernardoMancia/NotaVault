require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const { db, initDatabase } = require('./src/config/database');
const { securityMiddleware, apiLimiter } = require('./src/middleware/security');

const app = express();

securityMiddleware.forEach(mw => app.use(mw));

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=UTF-8');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    }
  }
}));

app.use('/api', apiLimiter);
app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/admin', require('./src/routes/admin.routes'));
app.use('/api/receipts', require('./src/routes/receipts.routes'));
app.use('/api/user', require('./src/routes/user.routes'));

const cleanRoutes = {
  '/login': 'index.html',
  '/register': 'register.html',
  '/dashboard': 'dashboard.html',
  '/admin': 'admin.html',
  '/change-password': 'change-password.html',
  '/mfa-setup': 'mfa-setup.html',
};

Object.entries(cleanRoutes).forEach(([route, file]) => {
  app.get(route, (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', file));
  });
});

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.includes('.')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

app.use((err, req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Arquivo excede o tamanho máximo permitido' });
  }

  if (err.message && err.message.includes('Formato de arquivo')) {
    return res.status(400).json({ error: err.message });
  }

  console.error(`[ERROR] ${new Date().toISOString()} - ${err.stack || err.message}`);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

initDatabase();

async function createDefaultAdmin() {
  const admin = db.prepare(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`).get();

  if (!admin) {
    const passwordHash = await bcrypt.hash('1234', 12);
    db.prepare(`
      INSERT INTO users (username, email, password_hash, role, is_approved, is_active, force_password_change)
      VALUES (?, ?, ?, 'admin', 1, 1, 1)
    `).run('Luke_Arwolf', 'admin@notavault.local', passwordHash);

    console.log('[INIT] Admin padrão criado: Luke_Arwolf (senha temporária: 1234)');
  }
}

const PORT = process.env.PORT || 3000;

createDefaultAdmin().then(() => {
  try {
    const { initScheduler } = require('./src/services/scheduler.service');
    initScheduler();
  } catch (e) {
    console.log('[INIT] Scheduler não disponível ainda:', e.message);
  }

  app.listen(PORT, () => {
    console.log(`[NotaVault] Servidor rodando na porta ${PORT}`);
    console.log(`[NotaVault] Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });
}).catch(err => {
  console.error('[FATAL] Erro ao inicializar:', err);
  process.exit(1);
});

module.exports = app;
