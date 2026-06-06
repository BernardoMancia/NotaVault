const express = require('express');
const path = require('path');
const fs = require('fs');
const { db } = require('../config/database');
const { authenticateToken, checkForcePasswordChange, checkMfaVerified } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { receiptFilterValidator } = require('../middleware/validators');
const { processImage } = require('../services/image.service');
const { extractReceiptData } = require('../services/ocr.service');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

router.use(authenticateToken);
router.use(checkForcePasswordChange);
router.use(checkMfaVerified);

router.post('/upload', upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    }

    const { buffer, mimetype } = req.file;
    const userId = req.user.id;

    const imageResult = await processImage(buffer, mimetype, userId);

    let ocrData = {};
    try {
      ocrData = await extractReceiptData(imageResult.compressedBuffer, 'image/webp');
    } catch (_) {
      ocrData = { full_text: null, error: 'OCR failed' };
    }

    const structuredData = JSON.stringify(ocrData.items || null);
    const now = new Date().toISOString();

    const result = db.prepare(
      `INSERT INTO receipts (
        user_id, type, original_image_hash, compressed_image_hash,
        image_path, original_mime_type, original_size_bytes, compressed_size_bytes,
        transcribed_text, structured_data, store_name, total_value,
        payment_method, purchase_date, purchase_time, captured_at,
        is_deleted, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`
    ).run(
      userId,
      ocrData.document_type || 'outro',
      imageResult.originalHash,
      imageResult.compressedHash,
      imageResult.imagePath,
      mimetype,
      imageResult.originalSize,
      imageResult.compressedSize,
      ocrData.full_text || null,
      structuredData,
      ocrData.store_name || null,
      ocrData.total || null,
      ocrData.payment_method || null,
      ocrData.date || null,
      ocrData.time || null,
      now
    );

    const receipt = db.prepare(
      'SELECT * FROM receipts WHERE id = ?'
    ).get(result.lastInsertRowid);

    res.status(201).json({ data: receipt });
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({ error: err.message });
    }
    console.error('Erro no upload:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/', receiptFilterValidator, (req, res) => {
  try {
    const userId = req.user.id;
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
    console.error('Erro ao listar recibos:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/stats/daily', (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const stats = db.prepare(
      'SELECT COUNT(*) as totalReceipts, COALESCE(SUM(total_value), 0) as totalValue FROM receipts WHERE user_id = ? AND purchase_date = ? AND is_deleted = 0'
    ).get(userId, today);

    res.json({
      data: {
        date: today,
        totalReceipts: stats.totalReceipts,
        totalValue: stats.totalValue,
      },
    });
  } catch (err) {
    console.error('Erro ao buscar stats diárias:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/stats/monthly', (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthStr = String(month).padStart(2, '0');
    const startDate = `${year}-${monthStr}-01`;
    const endDate = `${year}-${monthStr}-31`;

    const totals = db.prepare(
      'SELECT COUNT(*) as totalReceipts, COALESCE(SUM(total_value), 0) as totalValue FROM receipts WHERE user_id = ? AND purchase_date >= ? AND purchase_date <= ? AND is_deleted = 0'
    ).get(userId, startDate, endDate);

    const byTypeRows = db.prepare(
      'SELECT type, COUNT(*) as count, COALESCE(SUM(total_value), 0) as value FROM receipts WHERE user_id = ? AND purchase_date >= ? AND purchase_date <= ? AND is_deleted = 0 GROUP BY type'
    ).all(userId, startDate, endDate);

    const byType = {};
    for (const row of byTypeRows) {
      byType[row.type] = { count: row.count, value: row.value };
    }

    res.json({
      data: {
        year,
        month,
        totalReceipts: totals.totalReceipts,
        totalValue: totals.totalValue,
        byType,
      },
    });
  } catch (err) {
    console.error('Erro ao buscar stats mensais:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const receipt = db.prepare(
      'SELECT * FROM receipts WHERE id = ? AND user_id = ? AND is_deleted = 0'
    ).get(req.params.id, req.user.id);

    if (!receipt) {
      return res.status(404).json({ error: 'Comprovante não encontrado' });
    }

    res.json({ data: receipt });
  } catch (err) {
    console.error('Erro ao buscar recibo:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/:id/image', (req, res) => {
  try {
    const receipt = db.prepare(
      'SELECT image_path FROM receipts WHERE id = ? AND user_id = ? AND is_deleted = 0'
    ).get(req.params.id, req.user.id);

    if (!receipt) {
      return res.status(404).json({ error: 'Comprovante não encontrado' });
    }

    const fullPath = path.join(UPLOAD_DIR, receipt.image_path);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Arquivo de imagem não encontrado' });
    }

    res.set('Content-Type', 'image/webp');
    res.set('Cache-Control', 'private, max-age=86400');
    res.sendFile(fullPath);
  } catch (err) {
    console.error('Erro ao servir imagem:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const receipt = db.prepare(
      'SELECT id FROM receipts WHERE id = ? AND user_id = ? AND is_deleted = 0'
    ).get(req.params.id, req.user.id);

    if (!receipt) {
      return res.status(404).json({ error: 'Comprovante não encontrado' });
    }

    db.prepare(
      'UPDATE receipts SET is_deleted = 1, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(receipt.id);

    res.json({ message: 'Comprovante removido com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar recibo:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
