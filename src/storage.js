// File storage for delivery documents: uploads/<companyId>/<random uuid>.<ext>
// The browser never chooses the stored name or folder, so a file name like "../../x" cannot
// write outside the company folder. Production would swap this file for object storage.
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const config = require('./config');

// Allowed types, recognised by the file's first bytes, not by its name or the browser's claim.
const SIGNATURES = [
  { ext: 'pdf', mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { ext: 'png', mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'jpg', mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
];

function detectType(buffer) {
  return SIGNATURES.find((s) => s.bytes.every((b, i) => buffer[i] === b)) || null;
}

// Display name only: letters, digits, dot, dash, underscore; no leading dots; max 100 chars.
function safeDisplayName(original, ext) {
  let name = String(original || '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .slice(0, 100);
  if (!name) name = 'document';
  if (!name.toLowerCase().endsWith(`.${ext}`)) name = `${name}.${ext}`;
  return name;
}

async function saveFile(companyId, buffer, ext) {
  const dir = path.join(config.UPLOAD_DIR, String(companyId));
  await fs.mkdir(dir, { recursive: true });
  const storedName = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(dir, storedName), buffer, { flag: 'wx' });
  return storedName;
}

function filePath(companyId, storedName) {
  return path.join(config.UPLOAD_DIR, String(companyId), path.basename(storedName));
}

// The database is rebuilt on every start, so files from the last run point at nothing.
// Deletes ONLY files this app created: <dir>/<company id>/<uuid>.<pdf|png|jpg>. Anything else
// in the folder is left alone, so a wrong UPLOAD_DIR can never wipe unrelated files.
const STORED_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg)$/;

function clearUploads(dir = config.UPLOAD_DIR) {
  if (!fsSync.existsSync(dir)) return;
  for (const company of fsSync.readdirSync(dir)) {
    const companyDir = path.join(dir, company);
    if (!/^\d+$/.test(company) || !fsSync.statSync(companyDir).isDirectory()) continue;
    for (const name of fsSync.readdirSync(companyDir)) {
      if (STORED_FILE.test(name)) fsSync.unlinkSync(path.join(companyDir, name));
    }
  }
}

module.exports = { detectType, safeDisplayName, saveFile, filePath, clearUploads };
