// Load status workflow: Assigned > Picked Up > Delivered, decided by the server.
const { makeApp, agentFor } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

test('dispatcher moves a load one step at a time, then gets 409 at the end', async () => {
  const { app, ids } = await makeApp();
  const agent = await agentFor(app, 'dispatch@alpha.test');
  const url = `/api/loads/${ids.loads['A-1001']}/advance`;

  const one = await agent.post(url);
  assert.equal(one.status, 200);
  assert.equal(one.body.load.status, 'Picked Up');

  const two = await agent.post(url);
  assert.equal(two.status, 200);
  assert.equal(two.body.load.status, 'Delivered');

  const three = await agent.post(url);
  assert.equal(three.status, 409);
  assert.deepEqual(three.body, { error: 'Load is already Delivered' });
});

test('driver moves their own load to Delivered', async () => {
  const { app, ids } = await makeApp();
  const agent = await agentFor(app, 'driver1@alpha.test');
  const res = await agent.post(`/api/loads/${ids.loads['A-1003']}/advance`);
  assert.equal(res.status, 200);
  assert.equal(res.body.load.status, 'Delivered');
});

test('load history records who made each move, in order', async () => {
  const { app, ids } = await makeApp();
  const agent = await agentFor(app, 'dispatch@alpha.test');
  const id = ids.loads['A-1001'];
  await agent.post(`/api/loads/${id}/advance`);
  await agent.post(`/api/loads/${id}/advance`);
  const res = await agent.get(`/api/loads/${id}`);
  assert.deepEqual(
    res.body.events.map((e) => [e.by, e.fromStatus, e.toStatus]),
    [
      ['Sam Ortiz', 'Assigned', 'Picked Up'],
      ['Sam Ortiz', 'Picked Up', 'Delivered'],
    ],
  );
});

test('the browser cannot choose the status: a sent status is ignored', async () => {
  const { app, ids } = await makeApp();
  const agent = await agentFor(app, 'owner@beta.test');
  const res = await agent.post(`/api/loads/${ids.loads['B-2001']}/advance`).send({ status: 'Delivered' });
  assert.equal(res.status, 200);
  assert.equal(res.body.load.status, 'Picked Up');
});
