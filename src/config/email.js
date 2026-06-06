const nodemailer = require('nodemailer');
const { db } = require('./database');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

async function sendMail(to, subject, html, userId, emailType) {
  const sentAt = new Date().toISOString();
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html
    });

    if (userId && emailType) {
      const stmt = db.prepare(`
        INSERT INTO email_logs (user_id, email_type, recipient_email, subject, sent_at, success)
        VALUES (?, ?, ?, ?, ?, 1)
      `);
      stmt.run(userId, emailType, to, subject, sentAt);
    }

    return { success: true };
  } catch (error) {
    if (userId && emailType) {
      const stmt = db.prepare(`
        INSERT INTO email_logs (user_id, email_type, recipient_email, subject, sent_at, success, error_message)
        VALUES (?, ?, ?, ?, ?, 0, ?)
      `);
      stmt.run(userId, emailType, to, subject, sentAt, error.message);
    }
    throw error;
  }
}

module.exports = { transporter, sendMail };
