// Role rules inside one company: owner, dispatcher, driver.
const { makeApp, agentFor } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

let app, ids;
test.before(async () => {
  ({ app, ids } = await makeApp());
});

test('driver cannot list drivers or trucks (403), dispatcher sees only own company drivers', async () => {
  const driver = await agentFor(app, 'driver1@alpha.test');
  const d1 = await driver.get('/api/drivers');
  assert.equal(d1.status, 403);
  assert.deepEqual(d1.body, { error: 'Forbidden' });
  assert.equal((await driver.get('/api/trucks')).status, 403);

  const dispatcher = await agentFor(app, 'dispatch@alpha.test');
  const d2 = await dispatcher.get('/api/drivers');
  assert.equal(d2.status, 200);
  assert.deepEqual(d2.body.map((d) => d.name).sort(), ['Jordan Lee', 'Miguel Cruz']);
});

test('owner sees own company trucks', async () => {
  const owner = await agentFor(app, 'owner@beta.test');
  const res = await owner.get('/api/trucks');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((t) => t.unit).sort(), ['B-201', 'B-202']);
});

test('driver lists only loads assigned to them', async () => {
  const driver = await agentFor(app, 'driver1@alpha.test');
  const res = await driver.get('/api/loads');
  assert.deepEqual(res.body.map((l) => l.ref).sort(), ['A-1001', 'A-1003']);
});

test("driver opening another driver's load gets 404, same as a foreign load", async () => {
  const driver = await agentFor(app, 'driver1@alpha.test');
  const res = await driver.get(`/api/loads/${ids.loads['A-1002']}`);
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'Not found' });
  assert.equal((await driver.get(`/api/loads/${ids.loads['B-2001']}`)).status, 404);
});

test("driver cannot move another driver's load, and it stays Assigned", async () => {
  const { app: fresh, ids: freshIds } = await makeApp();
  const driver = await agentFor(fresh, 'driver1@alpha.test');
  const res = await driver.post(`/api/loads/${freshIds.loads['A-1004']}/advance`);
  assert.equal(res.status, 404);
  const dispatcher = await agentFor(fresh, 'dispatch@alpha.test');
  const check = await dispatcher.get(`/api/loads/${freshIds.loads['A-1004']}`);
  assert.equal(check.body.load.status, 'Assigned');
});

test('only the owner can read the blocked attempts log', async () => {
  const dispatcher = await agentFor(app, 'dispatch@alpha.test');
  assert.equal((await dispatcher.get('/api/audit/denials')).status, 403);
  const driver = await agentFor(app, 'driver2@beta.test');
  assert.equal((await driver.get('/api/audit/denials')).status, 403);
  const owner = await agentFor(app, 'owner@alpha.test');
  assert.equal((await owner.get('/api/audit/denials')).status, 200);
});

test('a role denial (403) is also written to the blocked log', async () => {
  const { app: fresh } = await makeApp();
  const driver = await agentFor(fresh, 'driver2@beta.test');
  await driver.get('/api/drivers');
  const owner = await agentFor(fresh, 'owner@beta.test');
  const log = await owner.get('/api/audit/denials');
  assert.ok(log.body.some((d) => d.user === 'Ben Ward' && d.path === '/api/drivers' && d.status === 403));
});

test('driver load list carries no fleet-wide data', async () => {
  const driver = await agentFor(app, 'driver2@alpha.test');
  const res = await driver.get('/api/loads');
  assert.deepEqual(res.body.map((l) => l.ref).sort(), ['A-1002', 'A-1004']);
  assert.ok(res.body.every((l) => l.driver.name === 'Jordan Lee'));
});
