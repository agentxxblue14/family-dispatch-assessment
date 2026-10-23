// Load status workflow: Assigned > Picked Up > Delivered, decided by the server.
// The browser sends only the status it is looking at ({from}); the server picks the next one.
const { makeApp, agentFor } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

const PDF = Buffer.from('%PDF-1.4\n% proof of delivery\n%%EOF\n');

test('dispatcher moves a load one step at a time, then gets 409 at the end', async () => {
  const { app, ids } = await makeApp();
  const agent = await agentFor(app, 'dispatch@alpha.test');
  const id = ids.loads['A-1001'];

  const one = await agent.post(`/api/loads/${id}/advance`).send({ from: 'Assigned' });
  assert.equal(one.status, 200);
  assert.equal(one.body.load.status, 'Picked Up');

  await agent.post(`/api/loads/${id}/document`).attach('file', PDF, 'pod.pdf');
  const two = await agent.post(`/api/loads/${id}/advance`).send({ from: 'Picked Up' });
  assert.equal(two.status, 200);
  assert.equal(two.body.load.status, 'Delivered');

  const three = await agent.post(`/api/loads/${id}/advance`).send({ from: 'Delivered' });
  assert.equal(three.status, 409);
  assert.deepEqual(three.body, { error: 'Load is already Delivered' });
});

test('a load cannot be marked Delivered until its POD is uploaded', async () => {
  const { app, ids } = await makeApp();
  const agent = await agentFor(app, 'driver1@alpha.test');
  const id = ids.loads['A-1003']; // Picked Up, no document yet

  const blocked = await agent.post(`/api/loads/${id}/advance`).send({ from: 'Picked Up' });
  assert.equal(blocked.status, 409);
  assert.deepEqual(blocked.body, { error: 'Upload the delivery document (POD) before marking Delivered' });

  assert.equal((await agent.post(`/api/loads/${id}/document`).attach('file', PDF, 'pod.pdf')).status, 201);
  const done = await agent.post(`/api/loads/${id}/advance`).send({ from: 'Picked Up' });
  assert.equal(done.status, 200);
  assert.equal(done.body.load.status, 'Delivered');
});

test('load history records who made each move, in order', async () => {
  const { app, ids } = await makeApp();
  const agent = await agentFor(app, 'dispatch@alpha.test');
  const id = ids.loads['A-1001'];
  await agent.post(`/api/loads/${id}/advance`).send({ from: 'Assigned' });
  await agent.post(`/api/loads/${id}/document`).attach('file', PDF, 'pod.pdf');
  await agent.post(`/api/loads/${id}/advance`).send({ from: 'Picked Up' });
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
  const res = await agent
    .post(`/api/loads/${ids.loads['B-2001']}/advance`)
    .send({ from: 'Assigned', status: 'Delivered' });
  assert.equal(res.status, 200);
  assert.equal(res.body.load.status, 'Picked Up');
});

// Review B, risk 4: a double click (or two people on stale screens) moved a load two steps.
test('a stale screen gets 409 and the load does not move', async () => {
  const { app, ids } = await makeApp();
  const agent = await agentFor(app, 'dispatch@alpha.test');
  const id = ids.loads['A-1003']; // already Picked Up
  const res = await agent.post(`/api/loads/${id}/advance`).send({ from: 'Assigned' });
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: 'This load has changed. Refresh and try again.' });
  assert.equal((await agent.get(`/api/loads/${id}`)).body.load.status, 'Picked Up');
});

test('ten clicks at the same moment move the load exactly one step', async () => {
  const { app, ids } = await makeApp();
  const agent = await agentFor(app, 'dispatch@alpha.test');
  const id = ids.loads['A-1001'];
  const results = await Promise.all(
    Array.from({ length: 10 }, () => agent.post(`/api/loads/${id}/advance`).send({ from: 'Assigned' })),
  );
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [200, 409, 409, 409, 409, 409, 409, 409, 409, 409]);
  const detail = await agent.get(`/api/loads/${id}`);
  assert.equal(detail.body.load.status, 'Picked Up');
  assert.equal(detail.body.events.length, 1);
});

test('advance without a valid "from" status is refused with 400', async () => {
  const { app, ids } = await makeApp();
  const agent = await agentFor(app, 'dispatch@alpha.test');
  const url = `/api/loads/${ids.loads['A-1001']}/advance`;
  for (const body of [undefined, {}, { from: 'Lost' }, { from: 1 }]) {
    const res = await agent.post(url).send(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.deepEqual(res.body, { error: 'Invalid input' });
  }
});
