const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const { db } = require('../config/database');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

function calculateHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function processImage(buffer, mimeType, userId) {
  const originalHash = calculateHash(buffer);
  const originalSize = buffer.length;

  const existing = db.prepare(
    'SELECT id FROM receipts WHERE original_image_hash = ? AND is_deleted = 0'
  ).get(originalHash);

  if (existing) {
    const err = new Error('Imagem duplicada detectada. Este comprovante já foi enviado.');
    err.status = 409;
    throw err;
  }

  const quality = parseInt(process.env.IMAGE_QUALITY, 10) || 80;

  const compressedBuffer = await sharp(buffer)
    .rotate()
    .resize({
      width: 1920,
      withoutEnlargement: true,
    })
    .webp({ quality })
    .toBuffer();

  const compressedHash = calculateHash(compressedBuffer);
  const compressedSize = compressedBuffer.length;

  const filename = `${uuidv4()}.webp`;
  const imagePath = `${userId}/${filename}`;
  const userDir = path.join(UPLOAD_DIR, String(userId));

  fs.mkdirSync(userDir, { recursive: true });

  const fullPath = path.join(userDir, filename);
  fs.writeFileSync(fullPath, compressedBuffer);

  return {
    originalHash,
    compressedHash,
    imagePath,
    originalSize,
    compressedSize,
    compressedBuffer,
  };
}

module.exports = { processImage };
