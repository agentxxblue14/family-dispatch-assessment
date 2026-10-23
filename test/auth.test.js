// Login, logout, sessions and the security headers around them.
const { makeApp, agentFor, PASSWORD } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

let app;
test.before(async () => {
  ({ app } = await makeApp());
});

test('wrong password is refused with 401', async () => {
  const res = await request(app).post('/api/login').send({ email: 'owner@alpha.test', password: 'wrong' });
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'Invalid email or password' });
});

test('unknown email gets the exact same 401 (no account discovery)', async () => {
  const res = await request(app).post('/api/login').send({ email: 'nobody@alpha.test', password: PASSWORD });
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'Invalid email or password' });
});

test('malformed login body is refused with 400 before any lookup', async () => {
  const res = await request(app).post('/api/login').send({ email: 'not-an-email', password: '' });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'Invalid input' });
});

test('good login returns the user with company and role, never the password hash', async () => {
  const agent = request.agent(app);
  const login = await agent.post('/api/login').send({ email: 'OWNER@alpha.test', password: PASSWORD });
  assert.equal(login.status, 200);
  const me = await agent.get('/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.name, 'Dana Reyes');
  assert.equal(me.body.role, 'owner');
  assert.equal(me.body.company.name, 'Alpha Transport');
  assert.doesNotMatch(JSON.stringify(login.body) + JSON.stringify(me.body), /password|hash|\$2[aby]\$/i);
});

test('no session means 401 on every data route', async () => {
  for (const path of ['/api/me', '/api/loads', '/api/loads/1', '/api/drivers', '/api/trucks', '/api/audit/denials']) {
    const res = await request(app).get(path);
    assert.equal(res.status, 401, path);
  }
});

test('logout ends the session', async () => {
  const agent = await agentFor(app, 'dispatch@alpha.test');
  assert.equal((await agent.post('/api/logout')).status, 204);
  assert.equal((await agent.get('/api/me')).status, 401);
});

test('11th failed login in a row is rate limited with 429', async () => {
  const { app: fresh } = await makeApp();
  for (let i = 0; i < 10; i++) {
    const res = await request(fresh).post('/api/login').send({ email: 'owner@beta.test', password: 'guess' + i });
    assert.equal(res.status, 401);
  }
  const blocked = await request(fresh).post('/api/login').send({ email: 'owner@beta.test', password: PASSWORD });
  assert.equal(blocked.status, 429);
});

test('session id changes at login (no session fixation)', async () => {
  const agent = request.agent(app);
  const first = await agent.post('/api/login').send({ email: 'driver1@alpha.test', password: PASSWORD });
  const second = await agent.post('/api/login').send({ email: 'driver2@alpha.test', password: PASSWORD });
  const sid = (res) => res.headers['set-cookie'][0].split(';')[0];
  assert.notEqual(sid(first), sid(second));
  assert.equal((await agent.get('/api/me')).body.name, 'Jordan Lee');
});

test('session cookie is httpOnly and SameSite=Strict', async () => {
  const res = await request(app).post('/api/login').send({ email: 'owner@beta.test', password: PASSWORD });
  const cookie = res.headers['set-cookie'][0];
  assert.match(cookie, /^fd\.sid=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
});

test('security headers are set (helmet)', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.match(res.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(res.headers['x-powered-by'], undefined);
});
