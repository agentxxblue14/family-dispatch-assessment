// Delivery documents (POD): upload, download, file checks and isolation.
const { makeApp, agentFor } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');

const PDF = Buffer.from('%PDF-1.4\n% fake proof of delivery for tests\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);
const RULE = { error: 'Only PDF, PNG or JPG up to 5 MB' };

// supertest buffers binary responses only when told how; this collects the raw bytes.
function binary(res, done) {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => done(null, Buffer.concat(chunks)));
}

test('dispatcher uploads a PDF and downloads the same bytes back', async () => {
  const { app, ids } = await makeApp();
  const agent = await agentFor(app, 'dispatch@alpha.test');
  const id = ids.loads['A-1001'];
  const up = await agent.post(`/api/loads/${id}/document`).attach('file', PDF, 'pod.pdf');
  assert.equal(up.status, 201);
  assert.equal(up.body.document.filename, 'pod.pdf');
  assert.equal(up.body.document.uploadedBy, 'Sam Ortiz');
  assert.equal(up.body.document.stored_name, undefined);

  const down = await agent.get(`/api/loads/${id}/document`).buffer(true).parse(binary);
  assert.equal(down.status, 200);
  assert.equal(down.headers['content-type'], 'application/pdf');
  assert.match(down.headers['content-disposition'], /^attachment; filename="?pod\.pdf"?$/);
  assert.deepEqual(down.body, PDF);
  assert.equal((await agent.get(`/api/loads/${id}`)).body.load.hasDocument, true);
});

test("Alpha owner cannot download Beta's POD (404)", async () => {
  const { app, ids } = await makeApp();
  const agent = await agentFor(app, 'owner@alpha.test');
  const res = await agent.get(`/api/loads/${ids.loads['B-2002']}/document`);
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'Not found' });
});

test('Alpha owner cannot upload to a Beta load, and Beta keeps its own POD', async () => {
  const { app, ids } = await makeApp();
  const alpha = await agentFor(app, 'owner@alpha.test');
  const res = await alpha.post(`/api/loads/${ids.loads['B-2002']}/document`).attach('file', PDF, 'evil.pdf');
  assert.equal(res.status, 404);
  const beta = await agentFor(app, 'owner@beta.test');
  const detail = await beta.get(`/api/loads/${ids.loads['B-2002']}`);
  assert.equal(detail.body.document.filename, 'POD-B-2002.pdf');
});

test('an .exe renamed to .pdf is refused by its first bytes (400)', async () => {
  const { app, ids } = await makeApp();
  const agent = await agentFor(app, 'dispatch@alpha.test');
  const res = await agent.post(`/api/loads/${ids.loads['A-1001']}/document`).attach('file', EXE, 'pod.pdf');
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, RULE);
});

test('a 6 MB file is refused (400)', async () => {
  const { app, ids } = await makeApp();
  const agent = await agentFor(app, 'dispatch@alpha.test');
  const big = Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024)]);
  const res = await agent.post(`/api/loads/${ids.loads['A-1001']}/document`).attach('file', big, 'big.pdf');
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, RULE);
});

test("driver cannot upload to another driver's load (404)", async () => {
  const { app, ids } = await makeApp();
  const agent = await agentFor(app, 'driver1@alpha.test');
  const res = await agent.post(`/api/loads/${ids.loads['A-1004']}/document`).attach('file', PDF, 'pod.pdf');
  assert.equal(res.status, 404);
});

test('driver uploads a PNG photo to their own load (201)', async () => {
  const { app, ids } = await makeApp();
  const agent = await agentFor(app, 'driver1@alpha.test');
  const res = await agent.post(`/api/loads/${ids.loads['A-1003']}/document`).attach('file', PNG, 'photo.png');
  assert.equal(res.status, 201);
  assert.equal(res.body.document.mime, 'image/png');
});

test('upload without a session is refused before the file is read (401)', async () => {
  const { app, ids } = await makeApp();
  const res = await request(app).post(`/api/loads/${ids.loads['A-1001']}/document`).attach('file', PDF, 'pod.pdf');
  assert.equal(res.status, 401);
});

test('missing file or wrong field name is refused (400)', async () => {
  const { app, ids } = await makeApp();
  const agent = await agentFor(app, 'dispatch@alpha.test');
  const url = `/api/loads/${ids.loads['A-1001']}/document`;
  assert.equal((await agent.post(url)).status, 400);
  assert.equal((await agent.post(url).attach('other', PDF, 'pod.pdf')).status, 400);
});

test('path tricks in the file name cannot escape the company upload folder', async () => {
  const { app, ids } = await makeApp();
  const agent = await agentFor(app, 'owner@alpha.test');
  const res = await agent
    .post(`/api/loads/${ids.loads['A-1001']}/document`)
    .attach('file', PDF, '../../..\\windows\\evil<script>.pdf');
  assert.equal(res.status, 201);
  assert.doesNotMatch(res.body.document.filename, /[/\\<>]|\.\./);

  // Every stored file sits directly inside uploads/<companyId>/ under a random name.
  const folder = path.join(process.env.UPLOAD_DIR, String(ids.companies.alpha));
  const names = fs.readdirSync(folder);
  assert.ok(names.every((n) => /^[0-9a-f-]{36}\.(pdf|png|jpg)$/.test(n)));
});

// Review A round 2, finding 2: a file that starts with %PDF but carries HTML is stored as a PDF.
// It must never render as a page: forced download, no sniffing, and a sandbox CSP as a backstop.
test('downloads can never run as a web page (attachment, nosniff, sandbox CSP)', async () => {
  const { app, ids } = await makeApp();
  const agent = await agentFor(app, 'dispatch@alpha.test');
  const id = ids.loads['A-1001'];
  const polyglot = Buffer.from('%PDF-1.4\n<script>alert(document.domain)</script>\n');
  assert.equal((await agent.post(`/api/loads/${id}/document`).attach('file', polyglot, 'x.pdf')).status, 201);
  const res = await agent.get(`/api/loads/${id}/document`).buffer(true).parse(binary);
  assert.match(res.headers['content-disposition'], /^attachment/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.match(res.headers['content-security-policy'], /sandbox/);
  assert.match(res.headers['content-security-policy'], /default-src 'none'/);
});

// Review A round 2, finding 4: uploaded files piled up across restarts.
test('startup cleanup removes only stored upload files, nothing else', async () => {
  const { clearUploads } = require('../src/storage');
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'fd-clear-'));
  fs.mkdirSync(path.join(dir, '1'));
  const stored = path.join(dir, '1', '3f2b8c1e-0d4a-4b7e-9c55-1a2b3c4d5e6f.pdf');
  const other = path.join(dir, '1', 'notes.txt');
  const outside = path.join(dir, 'keep.pdf');
  for (const f of [stored, other, outside]) fs.writeFileSync(f, 'x');
  clearUploads(dir);
  assert.equal(fs.existsSync(stored), false);
  assert.equal(fs.existsSync(other), true);
  assert.equal(fs.existsSync(outside), true);
  clearUploads(path.join(dir, 'does-not-exist')); // a missing folder is fine
  fs.rmSync(dir, { recursive: true, force: true });
});
