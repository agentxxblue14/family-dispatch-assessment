// Lock 1 on its own: Row Level Security is switched OFF for this app, so any isolation
// seen here comes only from the application layer (session company + scoped repository).
const { makeApp, agentFor } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { withTenant } = require('../src/db');

let app, db, ids;
test.before(async () => {
  ({ app, db, ids } = await makeApp({ enforceRls: false }));
});

test('control: with RLS off, an unfiltered query really sees all 8 loads', async () => {
  const { rows } = await withTenant(db, ids.companies.alpha, (tx) => tx.query('SELECT count(*)::int AS n FROM loads'), {
    enforceRls: false,
  });
  assert.equal(rows[0].n, 8);
});

test('RLS cannot be switched off outside tests', () => {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(() => withTenant(db, 1, async () => {}, { enforceRls: false }), /only be disabled in tests/);
  } finally {
    process.env.NODE_ENV = saved;
  }
});

test('Alpha owner still lists only Alpha loads', async () => {
  const agent = await agentFor(app, 'owner@alpha.test');
  const res = await agent.get('/api/loads');
  assert.deepEqual(res.body.map((l) => l.ref).sort(), ['A-1001', 'A-1002', 'A-1003', 'A-1004']);
});

test('Alpha owner still gets 404 for a Beta load, and drivers lists stay Alpha only', async () => {
  const agent = await agentFor(app, 'owner@alpha.test');
  assert.equal((await agent.get(`/api/loads/${ids.loads['B-2001']}`)).status, 404);
  const drivers = await agent.get('/api/drivers');
  assert.deepEqual(drivers.body.map((d) => d.name).sort(), ['Jordan Lee', 'Miguel Cruz']);
});

test('Alpha dispatcher still cannot move a Beta load', async () => {
  const agent = await agentFor(app, 'dispatch@alpha.test');
  assert.equal((await agent.post(`/api/loads/${ids.loads['B-2004']}/advance`)).status, 404);
  const { rows } = await db.query('SELECT status FROM loads WHERE id = $1', [ids.loads['B-2004']]);
  assert.equal(rows[0].status, 'Assigned');
});
