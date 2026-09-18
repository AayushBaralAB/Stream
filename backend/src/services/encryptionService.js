const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

// AES-256 requires an exact 32-byte key.
// ENCRYPTION_KEY format support:
//   - 64-character hex string  -> used directly as the 32-byte key (recommended: `openssl rand -hex 32`)
//   - any other string value   -> deterministically hashed (SHA-256) into a 32-byte key
function deriveKey(raw) {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

const KEY = process.env.ENCRYPTION_KEY
  ? deriveKey(process.env.ENCRYPTION_KEY)
  : crypto.randomBytes(32);

function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(encryptedText) {
  if (!encryptedText) return '';
  try {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    return '';
  }
}

function maskKey(key) {
  if (!key) return '************';
  if (key.length <= 8) return '********';
  return '*'.repeat(key.length - 4) + key.slice(-4);
}

module.exports = { encrypt, decrypt, maskKey };