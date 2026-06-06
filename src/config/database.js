const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'notavault.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user' CHECK(role IN ('admin','user')),
      is_approved INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      force_password_change INTEGER DEFAULT 1,
      temp_password TEXT,
      mfa_enabled INTEGER DEFAULT 0,
      mfa_secret TEXT,
      mfa_backup_codes TEXT,
      email_confirmed_at TEXT,
      email_confirm_token TEXT,
      password_reset_token TEXT,
      password_reset_expires TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT CHECK(type IN ('nota_fiscal','recibo_cartao_credito','recibo_cartao_debito','outro')),
      original_image_hash TEXT NOT NULL,
      compressed_image_hash TEXT NOT NULL,
      image_path TEXT NOT NULL,
      original_mime_type TEXT NOT NULL,
      original_size_bytes INTEGER NOT NULL,
      compressed_size_bytes INTEGER NOT NULL,
      transcribed_text TEXT,
      structured_data TEXT,
      store_name TEXT,
      total_value REAL,
      payment_method TEXT,
      purchase_date TEXT,
      purchase_time TEXT,
      captured_at TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      email_type TEXT CHECK(email_type IN ('welcome','approval','password_reset','daily_report','monthly_report')),
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      success INTEGER DEFAULT 1,
      error_message TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_is_approved ON users(is_approved)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_receipts_user_id ON receipts(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_receipts_is_deleted ON receipts(is_deleted)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_receipts_store_name ON receipts(store_name)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_receipts_purchase_date ON receipts(purchase_date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_receipts_total_value ON receipts(total_value)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_receipts_type ON receipts(type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_receipts_user_deleted ON receipts(user_id, is_deleted)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_email_logs_user_id ON email_logs(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_email_logs_email_type ON email_logs(email_type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)`);
}

module.exports = { db, initDatabase };
