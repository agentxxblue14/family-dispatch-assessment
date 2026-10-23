// Exhaustive check: every user x every load x every load action = 8 x 8 x 3 = 192 requests.
// The expected result for each request comes from the rules written out below, NOT from the
// app's own can() function, so a bug in can() cannot hide itself.
const { makeApp, agentFor } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

const USERS = [
  { email: 'owner@alpha.test', company: 'A', role: 'owner' },
  { email: 'dispatch@alpha.test', company: 'A', role: 'dispatcher' },
  { email: 'driver1@alpha.test', company: 'A', role: 'driver' },
  { email: 'driver2@alpha.test', company: 'A', role: 'driver' },
  { email: 'owner@beta.test', company: 'B', role: 'owner' },
  { email: 'dispatch@beta.test', company: 'B', role: 'dispatcher' },
  { email: 'driver1@beta.test', company: 'B', role: 'driver' },
  { email: 'driver2@beta.test', company: 'B', role: 'driver' },
];

const LOADS = [
  { ref: 'A-1001', company: 'A', driver: 'driver1@alpha.test', status: 'Assigned', pod: false },
  { ref: 'A-1002', company: 'A', driver: 'driver2@alpha.test', status: 'Delivered', pod: true },
  { ref: 'A-1003', company: 'A', driver: 'driver1@alpha.test', status: 'Picked Up', pod: false },
  { ref: 'A-1004', company: 'A', driver: 'driver2@alpha.test', status: 'Assigned', pod: false },
  { ref: 'B-2001', company: 'B', driver: 'driver1@beta.test', status: 'Assigned', pod: false },
  { ref: 'B-2002', company: 'B', driver: 'driver2@beta.test', status: 'Delivered', pod: true },
  { ref: 'B-2003', company: 'B', driver: 'driver1@beta.test', status: 'Picked Up', pod: false },
  { ref: 'B-2004', company: 'B', driver: 'driver2@beta.test', status: 'Assigned', pod: false },
];

// The written-out rule.
function expected(user, load) {
  const otherCompany = user.company !== load.company;
  const otherDriver = user.role === 'driver' && user.email !== load.driver;
  if (otherCompany || otherDriver) return { view: 404, document: 404, advance: 404 };
  return { view: 200, document: load.pod ? 200 : 404, advance: load.status === 'Delivered' ? 409 : 200 };
}

test('matrix: every user against every load and action', async (t) => {
  const { app, ids } = await makeApp();
  const unexpected = [];
  let checks = 0;

  for (const user of USERS) {
    const agent = await agentFor(app, user.email);
    // Advancing changes data, so each user gets a fresh app for the advance requests.
    const fresh = await makeApp();
    const writer = await agentFor(fresh.app, user.email);

    for (const load of LOADS) {
      const want = expected(user, load);
      const got = {
        view: (await agent.get(`/api/loads/${ids.loads[load.ref]}`)).status,
        document: (await agent.get(`/api/loads/${ids.loads[load.ref]}/document`)).status,
        advance: (await writer.post(`/api/loads/${fresh.ids.loads[load.ref]}/advance`)).status,
      };
      for (const action of ['view', 'document', 'advance']) {
        checks++;
        if (got[action] !== want[action]) {
          unexpected.push(`${user.email} ${action} ${load.ref}: expected ${want[action]}, got ${got[action]}`);
        }
      }
    }
  }

  const summary = `matrix: ${checks} checks, ${unexpected.length} unexpected`;
  t.diagnostic(summary);
  console.log(summary);
  assert.equal(checks, 192);
  assert.deepEqual(unexpected, []);
});
