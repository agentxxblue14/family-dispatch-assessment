// Database setup and the two lookups that must run before a company is known.
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

// PGlite is real Postgres compiled to WebAssembly, running in this process (in memory).
// Every start builds the schema and policies from scratch.
async function openDb() {
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname, 'rls.sql'), 'utf8'));
  return db;
}

// Lock 2: every tenant query runs as app_user with the company set for this transaction only.
// set_config(..., true) and SET LOCAL both end with the transaction, so one request's company
// can never carry over into the next request.
// enforceRls=false exists ONLY so lock1.test.js can prove Lock 1 on its own; it throws outside tests.
function withTenant(db, companyId, fn, { enforceRls = true } = {}) {
  if (!enforceRls && process.env.NODE_ENV !== 'test') throw new Error('RLS can only be disabled in tests');
  if (!Number.isInteger(companyId)) throw new Error('withTenant needs an integer company id');
  return db.transaction(async (tx) => {
    await tx.query("SELECT set_config('app.company_id', $1, true)", [String(companyId)]);
    if (enforceRls) await tx.exec('SET LOCAL ROLE app_user');
    return fn(tx);
  });
}

// Documented exception to "tenant SQL only in repo.js": login happens before we know the
// company, so this is the one lookup outside withTenant. It returns only the matching user.
async function findUserForLogin(db, email) {
  const { rows } = await db.query(
    'SELECT id, company_id, name, email, role, password_hash FROM users WHERE email = $1',
    [email.toLowerCase()],
  );
  return rows[0] || null;
}

// Second documented exception: loads the logged-in user from the id stored in the session.
// This is where the company id comes from for every request. It never reads the browser.
async function findUserById(db, id) {
  const { rows } = await db.query(
    `SELECT u.id, u.company_id, u.name, u.role, c.name AS company_name
       FROM users u JOIN companies c ON c.id = u.company_id
      WHERE u.id = $1`,
    [id],
  );
  return rows[0] || null;
}

module.exports = { openDb, withTenant, findUserForLogin, findUserById };
