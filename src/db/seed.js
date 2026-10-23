// Fictional sample data. Runs as the database owner at startup (documented exception to
// "tenant SQL only in repo.js"). Alpha is inserted first, so Alpha loads are ids 1 to 4
// and Beta loads are ids 5 to 8 on every start.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const config = require('../config');

const PASSWORD = 'Demo2026!';

const COMPANIES = [
  {
    key: 'alpha',
    name: 'Alpha Transport',
    users: [
      ['Dana Reyes', 'owner@alpha.test', 'owner'],
      ['Sam Ortiz', 'dispatch@alpha.test', 'dispatcher'],
      ['Miguel Cruz', 'driver1@alpha.test', 'driver'],
      ['Jordan Lee', 'driver2@alpha.test', 'driver'],
    ],
    trucks: ['T-101', 'T-102'],
    // ref, origin, destination, driver email, truck unit, status
    loads: [
      ['A-1001', 'Dallas TX', 'Tulsa OK', 'driver1@alpha.test', 'T-101', 'Assigned'],
      ['A-1002', 'Austin TX', 'Houston TX', 'driver2@alpha.test', 'T-102', 'Delivered'],
      ['A-1003', 'Waco TX', 'El Paso TX', 'driver1@alpha.test', 'T-101', 'Picked Up'],
      ['A-1004', 'Fort Worth TX', 'Shreveport LA', 'driver2@alpha.test', 'T-102', 'Assigned'],
    ],
    pod: { ref: 'A-1002', file: 'POD-A-1002.pdf' },
  },
  {
    key: 'beta',
    name: 'Beta Logistics',
    users: [
      ['Priya Shah', 'owner@beta.test', 'owner'],
      ['Tom Hale', 'dispatch@beta.test', 'dispatcher'],
      ['Ana Silva', 'driver1@beta.test', 'driver'],
      ['Ben Ward', 'driver2@beta.test', 'driver'],
    ],
    trucks: ['B-201', 'B-202'],
    loads: [
      ['B-2001', 'Atlanta GA', 'Charlotte NC', 'driver1@beta.test', 'B-201', 'Assigned'],
      ['B-2002', 'Savannah GA', 'Jacksonville FL', 'driver2@beta.test', 'B-202', 'Delivered'],
      ['B-2003', 'Macon GA', 'Birmingham AL', 'driver1@beta.test', 'B-201', 'Picked Up'],
      ['B-2004', 'Augusta GA', 'Columbia SC', 'driver2@beta.test', 'B-202', 'Assigned'],
    ],
    pod: { ref: 'B-2002', file: 'POD-B-2002.pdf' },
  },
];

async function insert(db, sql, params) {
  const { rows } = await db.query(sql, params);
  return rows[0].id;
}

async function seed(db) {
  // Hash once and reuse: hashing 8 times at cost 10 would slow every test file.
  const hash = await bcrypt.hash(PASSWORD, 10);
  const ids = { companies: {}, users: {}, trucks: {}, loads: {} };

  for (const c of COMPANIES) {
    const companyId = await insert(db, 'INSERT INTO companies (name) VALUES ($1) RETURNING id', [c.name]);
    ids.companies[c.key] = companyId;

    for (const [name, email, role] of c.users) {
      ids.users[email] = await insert(
        db,
        'INSERT INTO users (company_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [companyId, name, email, hash, role],
      );
    }
    for (const unit of c.trucks) {
      ids.trucks[unit] = await insert(db, 'INSERT INTO trucks (company_id, unit) VALUES ($1, $2) RETURNING id', [
        companyId,
        unit,
      ]);
    }
    const dispatcherId = ids.users[c.users[1][1]];
    for (const [ref, origin, destination, driverEmail, unit, status] of c.loads) {
      const loadId = await insert(
        db,
        `INSERT INTO loads (company_id, ref, origin, destination, driver_id, truck_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [companyId, ref, origin, destination, ids.users[driverEmail], ids.trucks[unit], status],
      );
      ids.loads[ref] = loadId;
      // Loads that already moved get a believable history (dispatcher, then driver).
      if (status !== 'Assigned') {
        await db.query(
          `INSERT INTO load_events (company_id, load_id, from_status, to_status, user_id, at)
           VALUES ($1, $2, 'Assigned', 'Picked Up', $3, now() - interval '5 hours')`,
          [companyId, loadId, dispatcherId],
        );
      }
      if (status === 'Delivered') {
        await db.query(
          `INSERT INTO load_events (company_id, load_id, from_status, to_status, user_id, at)
           VALUES ($1, $2, 'Picked Up', 'Delivered', $3, now() - interval '1 hour')`,
          [companyId, loadId, ids.users[driverEmail]],
        );
      }
    }

    // Copy the fake POD into uploads/<companyId>/ under a random name, like a real upload.
    const dir = path.join(config.UPLOAD_DIR, String(companyId));
    fs.mkdirSync(dir, { recursive: true });
    const storedName = `${crypto.randomUUID()}.pdf`;
    const source = path.join(__dirname, '..', '..', 'seed-files', c.pod.file);
    fs.copyFileSync(source, path.join(dir, storedName));
    await db.query(
      `INSERT INTO documents (company_id, load_id, filename, stored_name, mime, size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, 'application/pdf', $5, $6)`,
      [companyId, ids.loads[c.pod.ref], c.pod.file, storedName, fs.statSync(source).size, dispatcherId],
    );
  }
  return ids;
}

module.exports = { seed, PASSWORD };
