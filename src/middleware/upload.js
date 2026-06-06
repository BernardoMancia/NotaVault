const multer = require('multer');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const storage = multer.memoryStorage();

const maxSizeMB = parseInt(process.env.UPLOAD_MAX_SIZE_MB, 10) || 10;

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato de arquivo não permitido. Use JPEG, PNG ou WebP.'), false);
    }
  },
  limits: {
    fileSize: maxSizeMB * 1024 * 1024
  }
});

module.exports = { upload };
