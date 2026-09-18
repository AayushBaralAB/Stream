// Environment variable validation. Called once at server startup.
// Never logs the actual secret values.
function validateEnv() {
  const missing = [];

  if (!process.env.MONGODB_URI) missing.push('MONGODB_URI');
  else if (!/^mongodb(\+srv)?:\/\/.+/.test(process.env.MONGODB_URI)) {
    console.error('[ENV] MONGODB_URI is not a valid mongodb:// or mongodb+srv:// connection string');
    process.exit(1);
  }

  if (!process.env.MONGODB_DB) missing.push('MONGODB_DB');
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  else if (process.env.JWT_SECRET.length < 16) {
    console.error('[ENV] JWT_SECRET must be at least 16 characters long');
    process.exit(1);
  }

  if (!process.env.ENCRYPTION_KEY) {
    missing.push('ENCRYPTION_KEY');
  } else {
    const key = process.env.ENCRYPTION_KEY;
    const isHex64 = /^[0-9a-fA-F]{64}$/.test(key);
    const isAscii = /^[\x21-\x7E]{16,}$/.test(key);
    if (isHex64) {
      console.log('[ENV] ENCRYPTION_KEY: 64-char hex (used directly as the 32-byte AES key)');
    } else if (isAscii) {
      console.log('[ENV] ENCRYPTION_KEY: string passphrase (SHA-256-derived to a 32-byte AES key)');
    } else {
      console.error('[ENV] ENCRYPTION_KEY must be either a 64-character hexadecimal key (recommended: `openssl rand -hex 32`) or a printable string of at least 16 characters. It is never used with a different length.');
      process.exit(1);
    }
  }

  if (missing.length > 0) {
    console.error(`[ENV] Missing required environment variables: ${missing.join(', ')}`);
    console.error('      Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }

  console.log('[ENV] Configuration OK (MONGODB_URI set, MONGODB_DB set, JWT_SECRET set, ENCRYPTION_KEY set)');
}

module.exports = { validateEnv };