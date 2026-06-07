const { sendMail } = require('../config/email');
const { db } = require('../config/database');

function baseTemplate(title, content) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#0a0a0f 0%,#12121a 100%);padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.05);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:28px;font-weight:700;color:#00d4ff;letter-spacing:-0.5px;">◆ NotaVault</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;border-top:1px solid rgba(255,255,255,0.05);">
              <p style="margin:0;font-size:12px;color:#64748b;text-align:center;">
                Este é um e-mail automático do NotaVault. Por favor, não responda.
              </p>
              <p style="margin:8px 0 0;font-size:12px;color:#475569;text-align:center;">
                &copy; ${new Date().getFullYear()} NotaVault - Gerenciamento Inteligente de Comprovantes
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buttonStyle() {
  return 'display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#00d4ff,#0099cc);color:#0a0a0f;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.5px;';
}

function logEmail(userId, emailType, recipientEmail, subject, success, errorMessage) {
  try {
    db.prepare(
      'INSERT INTO email_logs (user_id, email_type, recipient_email, subject, sent_at, success, error_message) VALUES (?, ?, ?, ?, datetime(\'now\'), ?, ?)'
    ).run(userId, emailType, recipientEmail, subject, success ? 1 : 0, errorMessage || null);
  } catch (_) {}
}

async function sendWelcomeEmail(user, confirmToken, baseUrl) {
  const subject = 'Confirme seu cadastro - NotaVault';
  const confirmUrl = `${baseUrl}/api/auth/confirm-email/${confirmToken}`;

  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;color:#e2e8f0;font-weight:600;">Bem-vindo ao NotaVault!</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#94a3b8;line-height:1.6;">
      Olá <strong style="color:#e2e8f0;">${user.username}</strong>, sua conta foi criada com sucesso.
      Para continuar, confirme seu endereço de e-mail clicando no botão abaixo.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td>
          <a href="${confirmUrl}" style="${buttonStyle()}">Confirmar E-mail</a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:13px;color:#64748b;">
      Ou copie e cole este link no navegador:
    </p>
    <p style="margin:0;font-size:12px;color:#00d4ff;word-break:break-all;">
      ${confirmUrl}
    </p>
    <div style="margin:24px 0 0;padding:16px;background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.2);border-radius:8px;">
      <p style="margin:0;font-size:13px;color:#a855f7;">
        ⓘ Após confirmar o e-mail, um administrador precisará aprovar sua conta antes que você possa acessar o sistema.
      </p>
    </div>`;

  try {
    await sendMail(user.email, subject, baseTemplate(subject, content));
    logEmail(user.id, 'welcome', user.email, subject, true, null);
  } catch (err) {
    logEmail(user.id, 'welcome', user.email, subject, false, err.message);
    throw err;
  }
}

async function sendApprovalEmail(user, tempPassword) {
  const subject = 'Conta aprovada - NotaVault';

  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;color:#e2e8f0;font-weight:600;">Conta Aprovada! 🎉</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#94a3b8;line-height:1.6;">
      Olá <strong style="color:#e2e8f0;">${user.username}</strong>, sua conta no NotaVault foi aprovada por um administrador.
      Você já pode acessar o sistema usando as credenciais abaixo.
    </p>
    <div style="margin:0 0 24px;padding:20px;background:rgba(0,212,255,0.05);border:1px solid rgba(0,212,255,0.15);border-radius:8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;">
            <span style="font-size:13px;color:#64748b;">Usuário:</span>
            <span style="font-size:14px;color:#e2e8f0;font-weight:600;margin-left:8px;">${user.username}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:4px 0;">
            <span style="font-size:13px;color:#64748b;">Senha temporária:</span>
            <span style="font-size:14px;color:#00ff88;font-family:'Courier New',monospace;font-weight:700;margin-left:8px;">${tempPassword}</span>
          </td>
        </tr>
      </table>
    </div>
    <div style="margin:0 0 0;padding:16px;background:rgba(255,107,53,0.1);border:1px solid rgba(255,107,53,0.2);border-radius:8px;">
      <p style="margin:0;font-size:13px;color:#ff6b35;">
        ⚠ Você será obrigado a alterar esta senha no primeiro acesso. Escolha uma senha forte com letras, números e caracteres especiais.
      </p>
    </div>`;

  try {
    await sendMail(user.email, subject, baseTemplate(subject, content));
    logEmail(user.id, 'approval', user.email, subject, true, null);
  } catch (err) {
    logEmail(user.id, 'approval', user.email, subject, false, err.message);
    throw err;
  }
}

async function sendPasswordResetEmail(user, resetToken, baseUrl) {
  const subject = 'Redefinição de Senha - NotaVault';
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;color:#e2e8f0;font-weight:600;">Redefinição de Senha</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#94a3b8;line-height:1.6;">
      Olá <strong style="color:#e2e8f0;">${user.username}</strong>, recebemos uma solicitação para redefinir sua senha.
      Clique no botão abaixo para criar uma nova senha.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td>
          <a href="${resetUrl}" style="${buttonStyle()}">Redefinir Senha</a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:13px;color:#64748b;">
      Ou copie e cole este link no navegador:
    </p>
    <p style="margin:0 0 24px;font-size:12px;color:#00d4ff;word-break:break-all;">
      ${resetUrl}
    </p>
    <div style="margin:0;padding:16px;background:rgba(255,51,102,0.1);border:1px solid rgba(255,51,102,0.2);border-radius:8px;">
      <p style="margin:0;font-size:13px;color:#ff3366;">
        ⚠ Este link expira em 1 hora. Se você não solicitou a redefinição, ignore este e-mail.
      </p>
    </div>`;

  try {
    await sendMail(user.email, subject, baseTemplate(subject, content));
    logEmail(user.id, 'password_reset', user.email, subject, true, null);
  } catch (err) {
    logEmail(user.id, 'password_reset', user.email, subject, false, err.message);
    throw err;
  }
}

async function sendDailyReport(user, stats) {
  const subject = `Relatório Diário - ${stats.date}`;
  const formattedValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalValue || 0);

  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;color:#e2e8f0;font-weight:600;">Relatório Diário 📊</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#94a3b8;line-height:1.6;">
      Olá <strong style="color:#e2e8f0;">${user.username}</strong>, aqui está o resumo dos seus comprovantes de <strong style="color:#e2e8f0;">${stats.date}</strong>.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td width="50%" style="padding:16px;background:rgba(0,212,255,0.05);border:1px solid rgba(0,212,255,0.1);border-radius:8px;">
          <p style="margin:0 0 8px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Comprovantes</p>
          <p style="margin:0;font-size:32px;font-weight:700;color:#00d4ff;">${stats.totalReceipts}</p>
        </td>
        <td width="8"></td>
        <td width="50%" style="padding:16px;background:rgba(0,255,136,0.05);border:1px solid rgba(0,255,136,0.1);border-radius:8px;">
          <p style="margin:0 0 8px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Valor Total</p>
          <p style="margin:0;font-size:32px;font-weight:700;color:#00ff88;">${formattedValue}</p>
        </td>
      </tr>
    </table>`;

  try {
    await sendMail(user.email, subject, baseTemplate(subject, content));
    logEmail(user.id, 'daily_report', user.email, subject, true, null);
  } catch (err) {
    logEmail(user.id, 'daily_report', user.email, subject, false, err.message);
    throw err;
  }
}

async function sendMonthlyReport(user, stats) {
  const subject = `Relatório Mensal - ${String(stats.month).padStart(2, '0')}/${stats.year}`;
  const formattedValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalValue || 0);

  const nfValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.byType?.nota_fiscal?.value || 0);
  const creditValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.byType?.credito?.value || 0);
  const debitValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.byType?.debito?.value || 0);

  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;color:#e2e8f0;font-weight:600;">Relatório Mensal 📈</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#94a3b8;line-height:1.6;">
      Olá <strong style="color:#e2e8f0;">${user.username}</strong>, aqui está o resumo mensal de <strong style="color:#e2e8f0;">${String(stats.month).padStart(2, '0')}/${stats.year}</strong>.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td width="50%" style="padding:16px;background:rgba(0,212,255,0.05);border:1px solid rgba(0,212,255,0.1);border-radius:8px;">
          <p style="margin:0 0 8px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Total Comprovantes</p>
          <p style="margin:0;font-size:32px;font-weight:700;color:#00d4ff;">${stats.totalReceipts}</p>
        </td>
        <td width="8"></td>
        <td width="50%" style="padding:16px;background:rgba(0,255,136,0.05);border:1px solid rgba(0,255,136,0.1);border-radius:8px;">
          <p style="margin:0 0 8px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Valor Total</p>
          <p style="margin:0;font-size:32px;font-weight:700;color:#00ff88;">${formattedValue}</p>
        </td>
      </tr>
    </table>
    <h2 style="margin:0 0 16px;font-size:16px;color:#e2e8f0;font-weight:600;">Detalhamento por Tipo</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid rgba(255,255,255,0.05);border-radius:8px;overflow:hidden;">
      <tr style="background:rgba(255,255,255,0.03);">
        <td style="padding:12px 16px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid rgba(255,255,255,0.05);">Tipo</td>
        <td style="padding:12px 16px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:center;">Qtd</td>
        <td style="padding:12px 16px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:right;">Valor</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:14px;color:#e2e8f0;border-bottom:1px solid rgba(255,255,255,0.03);">Nota Fiscal</td>
        <td style="padding:12px 16px;font-size:14px;color:#00d4ff;text-align:center;border-bottom:1px solid rgba(255,255,255,0.03);">${stats.byType?.nota_fiscal?.count || 0}</td>
        <td style="padding:12px 16px;font-size:14px;color:#00ff88;text-align:right;font-family:'Courier New',monospace;border-bottom:1px solid rgba(255,255,255,0.03);">${nfValue}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:14px;color:#e2e8f0;border-bottom:1px solid rgba(255,255,255,0.03);">Cartão de Crédito</td>
        <td style="padding:12px 16px;font-size:14px;color:#00d4ff;text-align:center;border-bottom:1px solid rgba(255,255,255,0.03);">${stats.byType?.credito?.count || 0}</td>
        <td style="padding:12px 16px;font-size:14px;color:#00ff88;text-align:right;font-family:'Courier New',monospace;border-bottom:1px solid rgba(255,255,255,0.03);">${creditValue}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:14px;color:#e2e8f0;">Cartão de Débito</td>
        <td style="padding:12px 16px;font-size:14px;color:#00d4ff;text-align:center;">${stats.byType?.debito?.count || 0}</td>
        <td style="padding:12px 16px;font-size:14px;color:#00ff88;text-align:right;font-family:'Courier New',monospace;">${debitValue}</td>
      </tr>
    </table>`;

  try {
    await sendMail(user.email, subject, baseTemplate(subject, content));
    logEmail(user.id, 'monthly_report', user.email, subject, true, null);
  } catch (err) {
    logEmail(user.id, 'monthly_report', user.email, subject, false, err.message);
    throw err;
  }
}

async function sendRegistrationEmail(user, tempPassword) {
  const subject = 'Cadastro recebido - NotaVault';

  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;color:#e2e8f0;font-weight:600;">Cadastro Recebido! ✅</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#94a3b8;line-height:1.6;">
      Olá <strong style="color:#e2e8f0;">${user.username}</strong>, seu cadastro no NotaVault foi recebido com sucesso.
      Abaixo estão suas credenciais temporárias para quando sua conta for aprovada.
    </p>
    <div style="margin:0 0 24px;padding:20px;background:rgba(0,212,255,0.05);border:1px solid rgba(0,212,255,0.15);border-radius:8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;">
            <span style="font-size:13px;color:#64748b;">Usuário:</span>
            <span style="font-size:14px;color:#e2e8f0;font-weight:600;margin-left:8px;">${user.username}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:4px 0;">
            <span style="font-size:13px;color:#64748b;">Senha temporária:</span>
            <span style="font-size:14px;color:#00ff88;font-family:'Courier New',monospace;font-weight:700;margin-left:8px;">${tempPassword}</span>
          </td>
        </tr>
      </table>
    </div>
    <div style="margin:0 0 16px;padding:16px;background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.2);border-radius:8px;">
      <p style="margin:0;font-size:13px;color:#a855f7;">
        ⓘ Sua conta precisa ser aprovada por um administrador antes que você possa acessar o sistema.
      </p>
    </div>
    <div style="margin:0;padding:16px;background:rgba(255,107,53,0.1);border:1px solid rgba(255,107,53,0.2);border-radius:8px;">
      <p style="margin:0;font-size:13px;color:#ff6b35;">
        ⚠ No primeiro acesso, você será obrigado a alterar a senha temporária.
      </p>
    </div>`;

  try {
    await sendMail(user.email, subject, baseTemplate(subject, content));
    logEmail(user.id, 'welcome', user.email, subject, true, null);
  } catch (err) {
    logEmail(user.id, 'welcome', user.email, subject, false, err.message);
    throw err;
  }
}

module.exports = {
  sendWelcomeEmail,
  sendApprovalEmail,
  sendRegistrationEmail,
  sendPasswordResetEmail,
  sendDailyReport,
  sendMonthlyReport,
};
