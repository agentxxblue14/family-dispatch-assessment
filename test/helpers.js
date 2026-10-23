// Shared test setup. Every test file requires this first.
const os = require('node:os');
const path = require('node:path');

// Tests run with NODE_ENV=test (needed by lock1.test.js) and write uploads to a temp folder,
// so running the suite never touches the real uploads/ folder.
process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `fd-test-uploads-${process.pid}`);

const test = require('node:test');

const PASSWORD = 'Demo2026!';

// Every database opened by makeApp is closed when the test file finishes.
const openDbs = [];
test.after(async () => {
  for (const db of openDbs) await db.close();
});

// Opens a fresh database, seeds it and builds an app. Each call is fully independent.
async function makeApp(options = {}) {
  const { openDb } = require('../src/db');
  const { seed } = require('../src/db/seed');
  const { createApp } = require('../src/app');
  const db = await openDb();
  openDbs.push(db);
  const ids = await seed(db);
  const app = createApp(db, options);
  return { app, db, ids };
}

// Logs in as the given sample user and returns a supertest agent that keeps the session cookie.
async function agentFor(app, email) {
  const request = require('supertest');
  const agent = request.agent(app);
  const res = await agent.post('/api/login').send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  return agent;
}

module.exports = { makeApp, agentFor, PASSWORD };
