// All settings in one place. Values come from environment variables with safe demo defaults.
const crypto = require('node:crypto');
const path = require('node:path');

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  // A random secret per boot is fine for a demo: sessions reset on restart anyway (in-memory store).
  SESSION_SECRET: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  UPLOAD_DIR: process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'),
  MAX_UPLOAD_BYTES: 5 * 1024 * 1024,
  LOGIN_MAX_FAILURES: 10,
  LOGIN_WINDOW_MS: 15 * 60 * 1000,
};
