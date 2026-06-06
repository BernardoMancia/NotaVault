const cron = require('node-cron');
const { db } = require('../config/database');
const { sendDailyReport, sendMonthlyReport } = require('./email.service');

let isDailyRunning = false;
let isMonthlyRunning = false;

function getActiveUsers() {
  return db.prepare(
    'SELECT id, username, email FROM users WHERE is_active = 1 AND is_approved = 1'
  ).all();
}

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentMonth() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
}

async function runDailyReports() {
  if (isDailyRunning) return;
  isDailyRunning = true;

  try {
    const users = getActiveUsers();
    const today = getTodayString();

    for (const user of users) {
      try {
        const stats = db.prepare(
          'SELECT COUNT(*) as totalReceipts, COALESCE(SUM(total_value), 0) as totalValue FROM receipts WHERE user_id = ? AND purchase_date = ? AND is_deleted = 0'
        ).get(user.id, today);

        if (stats.totalReceipts > 0) {
          await sendDailyReport(user, {
            totalReceipts: stats.totalReceipts,
            totalValue: stats.totalValue,
            date: today,
          });
        }
      } catch (err) {
        console.error(`Erro ao enviar relatório diário para ${user.username}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Erro no job de relatório diário:', err.message);
  } finally {
    isDailyRunning = false;
  }
}

async function runMonthlyReports() {
  if (isMonthlyRunning) return;
  isMonthlyRunning = true;

  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getDate() !== 1) {
      isMonthlyRunning = false;
      return;
    }

    const users = getActiveUsers();
    const { year, month } = getCurrentMonth();
    const monthStr = String(month).padStart(2, '0');
    const startDate = `${year}-${monthStr}-01`;
    const endDate = `${year}-${monthStr}-31`;

    for (const user of users) {
      try {
        const totals = db.prepare(
          'SELECT COUNT(*) as totalReceipts, COALESCE(SUM(total_value), 0) as totalValue FROM receipts WHERE user_id = ? AND purchase_date >= ? AND purchase_date <= ? AND is_deleted = 0'
        ).get(user.id, startDate, endDate);

        const byTypeRows = db.prepare(
          'SELECT type, COUNT(*) as count, COALESCE(SUM(total_value), 0) as value FROM receipts WHERE user_id = ? AND purchase_date >= ? AND purchase_date <= ? AND is_deleted = 0 GROUP BY type'
        ).all(user.id, startDate, endDate);

        const byType = {
          nota_fiscal: { count: 0, value: 0 },
          credito: { count: 0, value: 0 },
          debito: { count: 0, value: 0 },
        };

        for (const row of byTypeRows) {
          if (row.type === 'nota_fiscal') {
            byType.nota_fiscal = { count: row.count, value: row.value };
          } else if (row.type === 'recibo_cartao_credito') {
            byType.credito = { count: row.count, value: row.value };
          } else if (row.type === 'recibo_cartao_debito') {
            byType.debito = { count: row.count, value: row.value };
          }
        }

        if (totals.totalReceipts > 0) {
          await sendMonthlyReport(user, {
            totalReceipts: totals.totalReceipts,
            totalValue: totals.totalValue,
            month,
            year,
            byType,
          });
        }
      } catch (err) {
        console.error(`Erro ao enviar relatório mensal para ${user.username}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Erro no job de relatório mensal:', err.message);
  } finally {
    isMonthlyRunning = false;
  }
}

function initScheduler() {
  const hour = process.env.DAILY_REPORT_HOUR || '23';
  const minute = process.env.DAILY_REPORT_MINUTE || '0';

  cron.schedule(`${minute} ${hour} * * *`, () => {
    runDailyReports();
  }, {
    timezone: 'America/Sao_Paulo',
  });

  cron.schedule('30 23 * * *', () => {
    runMonthlyReports();
  }, {
    timezone: 'America/Sao_Paulo',
  });

  console.log(`[Scheduler] Relatório diário agendado para ${hour}:${String(minute).padStart(2, '0')} (America/Sao_Paulo)`);
  console.log('[Scheduler] Relatório mensal agendado para 23:30 no último dia do mês');
}

module.exports = { initScheduler };
