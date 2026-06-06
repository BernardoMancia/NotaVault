const crypto = require('crypto');
const { TOTP, Secret } = require('otpauth');
const QRCode = require('qrcode');
const bcrypt = require('bcrypt');

const MFA_ISSUER = process.env.MFA_ISSUER || 'NotaVault';
const ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

function getDerivedKey() {
  const hex = ENCRYPTION_KEY || '';
  if (hex.length >= KEY_LENGTH * 2) {
    return Buffer.from(hex.slice(0, KEY_LENGTH * 2), 'hex');
  }
  return crypto.createHash('sha256').update(hex).digest();
}

function generateSecret(username) {
  const secret = new Secret();

  const totp = new TOTP({
    issuer: MFA_ISSUER,
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

  return {
    secret: secret.base32,
    otpauthUrl: totp.toString(),
  };
}

async function generateQRCode(otpauthUrl) {
  const dataUri = await QRCode.toDataURL(otpauthUrl, {
    width: 256,
    margin: 2,
    color: {
      dark: '#e2e8f0',
      light: '#0a0a0f',
    },
  });
  return dataUri;
}

function verifyToken(secret, token) {
  const totp = new TOTP({
    issuer: MFA_ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });

  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

function generateBackupCodes() {
  const codes = [];
  for (let i = 0; i < 8; i++) {
    const bytes = crypto.randomBytes(6);
    const code = bytes.toString('base64url').slice(0, 8).toUpperCase();
    codes.push(code);
  }
  return codes;
}

async function hashBackupCodes(codes) {
  const hashed = await Promise.all(
    codes.map((code) => bcrypt.hash(code, 10))
  );
  return hashed;
}

async function verifyBackupCode(code, hashedCodes) {
  for (let i = 0; i < hashedCodes.length; i++) {
    const match = await bcrypt.compare(code.toUpperCase(), hashedCodes[i]);
    if (match) {
      const remainingCodes = [...hashedCodes];
      remainingCodes.splice(i, 1);
      return { valid: true, remainingCodes };
    }
  }
  return { valid: false, remainingCodes: hashedCodes };
}

function encryptSecret(plainSecret) {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainSecret, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptSecret(encryptedString) {
  const key = getDerivedKey();
  const [ivHex, authTagHex, encrypted] = encryptedString.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = {
  generateSecret,
  generateQRCode,
  verifyToken,
  generateBackupCodes,
  hashBackupCodes,
  verifyBackupCode,
  encryptSecret,
  decryptSecret,
};
