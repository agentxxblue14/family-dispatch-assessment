// Lock 2 on its own: these tests talk to the database directly, with no routes and no repository.
// They prove Postgres Row Level Security isolates companies even if application code forgets a filter.
require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb, withTenant } = require('../src/db');
const { seed } = require('../src/db/seed');

let db, ids;
test.before(async () => {
  db = await openDb();
  ids = await seed(db);
});
test.after(() => db.close());

test('unfiltered select returns only own company', async () => {
  const { rows } = await withTenant(db, ids.companies.alpha, (tx) => tx.query('SELECT ref FROM loads'));
  assert.deepEqual(rows.map((r) => r.ref).sort(), ['A-1001', 'A-1002', 'A-1003', 'A-1004']);
});

test('direct select of other company id returns nothing', async () => {
  const { rows } = await withTenant(db, ids.companies.alpha, (tx) =>
    tx.query('SELECT * FROM loads WHERE id = $1', [ids.loads['B-2001']]),
  );
  assert.equal(rows.length, 0);
});

test('update of other company row changes nothing', async () => {
  const r = await withTenant(db, ids.companies.alpha, (tx) =>
    tx.query("UPDATE loads SET status = 'Delivered' WHERE id = $1", [ids.loads['B-2001']]),
  );
  assert.equal(r.affectedRows, 0);
});

test('insert into other company is rejected', async () => {
  await assert.rejects(
    withTenant(db, ids.companies.alpha, (tx) =>
      tx.query("INSERT INTO access_denials (company_id, user_id, method, path, status) VALUES ($1, 1, 'GET', '/x', 404)", [
        ids.companies.beta,
      ]),
    ),
    /row-level security/,
  );
});

test('no company set returns nothing (fails closed)', async () => {
  const rows = await db.transaction(async (tx) => {
    await tx.exec('SET LOCAL ROLE app_user');
    return (await tx.query('SELECT * FROM loads')).rows;
  });
  assert.equal(rows.length, 0);
});

test('database rejects an Alpha load pointing at a Beta driver', async () => {
  await assert.rejects(
    db.query(
      "INSERT INTO loads (company_id, ref, origin, destination, driver_id, status) VALUES ($1,'A-9','x','y',$2,'Assigned')",
      [ids.companies.alpha, ids.users['driver1@beta.test']],
    ),
    /foreign key/,
  );
});

test('other tenant tables are isolated too (users, trucks, documents)', async () => {
  const counts = await withTenant(db, ids.companies.alpha, async (tx) => {
    const one = async (sql, params) => (await tx.query(sql, params)).rows[0].n;
    return {
      users: await one('SELECT count(*)::int AS n FROM users'),
      trucks: await one('SELECT count(*)::int AS n FROM trucks'),
      documents: await one('SELECT count(*)::int AS n FROM documents'),
      foreign: await one('SELECT count(*)::int AS n FROM users WHERE company_id = $1', [ids.companies.beta]),
    };
  });
  assert.deepEqual(counts, { users: 4, trucks: 2, documents: 1, foreign: 0 });
});
