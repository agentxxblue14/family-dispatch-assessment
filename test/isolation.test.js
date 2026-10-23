// Cross-company attacks through the real API, with both locks on.
const { makeApp, agentFor } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

const NOT_FOUND = { error: 'Not found' };

let app, ids;
test.before(async () => {
  ({ app, ids } = await makeApp());
});

test('Alpha owner lists only Alpha loads', async () => {
  const agent = await agentFor(app, 'owner@alpha.test');
  const res = await agent.get('/api/loads');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((l) => l.ref).sort(), ['A-1001', 'A-1002', 'A-1003', 'A-1004']);
  assert.doesNotMatch(JSON.stringify(res.body), /Beta|B-20|Priya|Ana Silva|Ben Ward/);
});

test('Alpha owner opening a Beta load by id gets 404 Not found', async () => {
  const agent = await agentFor(app, 'owner@alpha.test');
  const res = await agent.get(`/api/loads/${ids.loads['B-2001']}`);
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, NOT_FOUND);
});

test('Beta owner opening an Alpha load by id gets 404 Not found', async () => {
  const agent = await agentFor(app, 'owner@beta.test');
  const res = await agent.get(`/api/loads/${ids.loads['A-1001']}`);
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, NOT_FOUND);
});

test('a foreign load and a missing load look exactly the same (no enumeration)', async () => {
  const agent = await agentFor(app, 'owner@alpha.test');
  const foreign = await agent.get(`/api/loads/${ids.loads['B-2001']}`);
  const missing = await agent.get('/api/loads/9999');
  assert.equal(foreign.status, missing.status);
  assert.deepEqual(foreign.body, missing.body);
});

test('Alpha dispatcher cannot move a Beta load, and the Beta load is unchanged', async () => {
  const { app: fresh, ids: freshIds } = await makeApp();
  const alpha = await agentFor(fresh, 'dispatch@alpha.test');
  const res = await alpha.post(`/api/loads/${freshIds.loads['B-2001']}/advance`);
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, NOT_FOUND);
  const beta = await agentFor(fresh, 'owner@beta.test');
  const check = await beta.get(`/api/loads/${freshIds.loads['B-2001']}`);
  assert.equal(check.body.load.status, 'Assigned');
  assert.deepEqual(check.body.events, []);
});

test('company_id sent in the query, body or a header is ignored', async () => {
  const { app: fresh, ids: freshIds } = await makeApp();
  const alpha = await agentFor(fresh, 'owner@alpha.test');
  const beta = String(freshIds.companies.beta);

  const list = await alpha.get(`/api/loads?company_id=${beta}`).set('X-Company-Id', beta);
  assert.deepEqual(list.body.map((l) => l.ref).sort(), ['A-1001', 'A-1002', 'A-1003', 'A-1004']);

  const drivers = await alpha.get(`/api/drivers?company_id=${beta}`);
  assert.deepEqual(drivers.body.map((d) => d.name).sort(), ['Jordan Lee', 'Miguel Cruz']);

  const trucks = await alpha.get(`/api/trucks?company_id=${beta}`);
  assert.deepEqual(trucks.body.map((t) => t.unit).sort(), ['T-101', 'T-102']);

  const foreign = await alpha.get(`/api/loads/${freshIds.loads['B-2001']}?company_id=${beta}`).set('X-Company-Id', beta);
  assert.equal(foreign.status, 404);

  // Advancing an Alpha load with a Beta company_id in the body moves the Alpha load only.
  const moved = await alpha.post(`/api/loads/${freshIds.loads['A-1001']}/advance`).send({ company_id: Number(beta) });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.load.ref, 'A-1001');
  const betaOwner = await agentFor(fresh, 'owner@beta.test');
  const betaLoads = await betaOwner.get('/api/loads');
  assert.deepEqual(betaLoads.body.map((l) => l.status), ['Assigned', 'Delivered', 'Picked Up', 'Assigned']);
});

test('SQL injection in the id is rejected as bad input (400)', async () => {
  const agent = await agentFor(app, 'owner@alpha.test');
  for (const bad of ['1%20OR%201=1', '5;DROP%20TABLE%20loads', '-1', '0', '1.5', 'abc', '99999999999']) {
    const res = await agent.get(`/api/loads/${bad}`);
    assert.equal(res.status, 400, bad);
    assert.deepEqual(res.body, { error: 'Invalid input' });
  }
});

test("blocked attempts are logged for the attacker's own company owner only", async () => {
  const { app: fresh, ids: freshIds } = await makeApp();
  const alpha = await agentFor(fresh, 'owner@alpha.test');
  await alpha.get(`/api/loads/${freshIds.loads['B-2002']}`);
  await alpha.post(`/api/loads/${freshIds.loads['B-2003']}/advance`);

  const log = await alpha.get('/api/audit/denials');
  assert.equal(log.status, 200);
  const paths = log.body.map((d) => `${d.method} ${d.path}`);
  assert.ok(paths.includes(`GET /api/loads/${freshIds.loads['B-2002']}`));
  assert.ok(paths.includes(`POST /api/loads/${freshIds.loads['B-2003']}/advance`));
  assert.ok(log.body.every((d) => d.user === 'Dana Reyes'));

  // Beta's owner sees none of Alpha's attempts.
  const beta = await agentFor(fresh, 'owner@beta.test');
  assert.deepEqual((await beta.get('/api/audit/denials')).body, []);
});
