// End-to-end cross-company security test against a real running server.
//
// Starts the app on a free port, logs in as the Alpha owner and tries 16 things against Beta,
// then logs in as the Beta owner and tries the same 16 against Alpha. Writes the results to
// docs/SECURITY-TEST.md and exits with code 1 if anything leaked.
//
// Run: npm run security-test
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.UPLOAD_DIR = path.join(os.tmpdir(), `fd-security-test-${process.pid}`);
const { openDb } = require('../src/db');
const { seed } = require('../src/db/seed');
const { createApp } = require('../src/app');

const PASSWORD = 'Demo2026!';
const OUT = path.join(__dirname, '..', 'docs', 'SECURITY-TEST.md');

async function main() {
  const db = await openDb();
  const ids = await seed(db);
  const server = createApp(db).listen(0);
  await new Promise((ok) => server.once('listening', ok));
  const base = `http://localhost:${server.address().port}`;

  // Status of every load before the attack, to prove afterwards that no write landed.
  const before = (await db.query('SELECT id, status FROM loads ORDER BY id')).rows;
  const countDocs = async () => (await db.query('SELECT count(*)::int AS n FROM documents')).rows[0].n;
  const countEvents = async () => (await db.query('SELECT count(*)::int AS n FROM load_events')).rows[0].n;
  const docsBefore = await countDocs();
  const eventsBefore = await countEvents();

  async function login(email) {
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (res.status !== 200) throw new Error(`login failed for ${email}`);
    return res.headers.get('set-cookie').split(';')[0];
  }

  async function send(cookie, method, url, body) {
    const headers = { Cookie: cookie };
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + url, { method, headers, body: body && JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, statusText: res.statusText, text, headers: res.headers };
  }

  const rows = [];
  let raw = null;

  for (const [attacker, victim] of [
    ['alpha', 'beta'],
    ['beta', 'alpha'],
  ]) {
    const email = `owner@${attacker}.test`;
    const cookie = await login(email);
    const own = attacker === 'alpha' ? 'A-' : 'B-';
    const victimRefs = Object.keys(ids.loads).filter((ref) => !ref.startsWith(own));
    const victimCompany = ids.companies[victim];
    const ownLoadRef = Object.keys(ids.loads).find((ref) => ref.startsWith(own));

    // Direct requests for the other company's records: each must be 404 Not found.
    const direct = [];
    for (const ref of victimRefs) direct.push(['GET', `/api/loads/${ids.loads[ref]}`, `view ${ref}`]);
    // An attacker would send a valid body too, so the move requests carry {from: "Assigned"}.
    for (const ref of victimRefs) {
      direct.push(['POST', `/api/loads/${ids.loads[ref]}/advance`, `move ${ref}`, { from: 'Assigned' }]);
    }
    for (const ref of victimRefs) direct.push(['GET', `/api/loads/${ids.loads[ref]}/document`, `POD of ${ref}`]);
    for (const [method, url, what, body] of direct) {
      const res = await send(cookie, method, url, body);
      const blocked = res.status === 404 && res.text === '{"error":"Not found"}';
      if (!raw) raw = { email, method, url, res };
      rows.push({
        who: email,
        what,
        request: body ? `${method} ${url} body ${JSON.stringify(body)}` : `${method} ${url}`,
        expected: '404',
        res,
        result: blocked ? 'BLOCKED' : 'LEAK',
      });
    }

    // Spoofing: send the other company's id in the query or body. The server must ignore it
    // and answer with the caller's own data only.
    const leaksOther = (text) => {
      const otherNames =
        victim === 'beta' ? /Beta|B-20|Priya|Tom Hale|Ana Silva|Ben Ward/ : /Alpha|A-10|Dana|Sam Ortiz|Miguel|Jordan/;
      return otherNames.test(text);
    };
    const spoofs = [
      ['GET', `/api/loads?company_id=${victimCompany}`, 'list loads with company_id'],
      ['GET', `/api/drivers?company_id=${victimCompany}`, 'list drivers with company_id'],
      ['GET', `/api/trucks?company_id=${victimCompany}`, 'list trucks with company_id'],
      [
        'POST',
        `/api/loads/${ids.loads[ownLoadRef]}/advance`,
        `move own ${ownLoadRef} with body company_id`,
        { from: 'Assigned', company_id: victimCompany },
      ],
    ];
    for (const [method, url, what, body] of spoofs) {
      const res = await send(cookie, method, url, body);
      const ok = res.status === 200 && !leaksOther(res.text);
      const shown = body ? `${method} ${url} body ${JSON.stringify(body)}` : `${method} ${url}`;
      rows.push({
        who: email,
        what,
        request: shown,
        expected: '200, own data only',
        res,
        result: ok ? 'OWN DATA ONLY' : 'LEAK',
      });
    }
  }

  // Write check: the only writes allowed are the two "move own load" spoof requests, which must
  // each move their caller's own load exactly one step (A-1001 and B-2001: Assigned > Picked Up).
  // Every other load must be unchanged, no document added, and exactly two history rows added.
  const after = (await db.query('SELECT id, status FROM loads ORDER BY id')).rows;
  const ownMoves = [ids.loads['A-1001'], ids.loads['B-2001']];
  const statusesOk = after.every((row, i) =>
    ownMoves.includes(row.id) ? row.status === 'Picked Up' : row.status === before[i].status,
  );
  const writesOk = statusesOk && (await countDocs()) === docsBefore && (await countEvents()) === eventsBefore + 2;

  server.close();
  await db.close();

  const leaks = rows.filter((r) => r.result === 'LEAK').length + (writesOk ? 0 : 1);
  const summary = `${rows.length} cross-company attempts, ${leaks} leaks`;
  fs.writeFileSync(OUT, report({ rows, raw, base, summary, writesOk }));
  console.log(rows.map((r) => `${r.result.padEnd(13)} ${r.res.status} ${r.who} ${r.request}`).join('\n'));
  console.log(`Write check: ${writesOk ? 'no cross-company write landed' : 'A CROSS-COMPANY WRITE LANDED'}`);
  console.log(summary);
  console.log(`Report written to ${path.relative(process.cwd(), OUT)}`);
  process.exit(leaks ? 1 : 0);
}

function excerpt(text) {
  const oneLine = text.replace(/\s+/g, ' ');
  return (oneLine.length > 70 ? `${oneLine.slice(0, 70)}...` : oneLine).replace(/\|/g, '\\|');
}

function report({ rows, raw, base, summary, writesOk }) {
  const date = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const lines = [
    '# Cross-company security test',
    '',
    'Generated by `npm run security-test` (scripts/security-test.js). The script starts the real server, logs in',
    "as the owner of one company and sends requests for the other company's records straight to the API, the way",
    'an attacker with a valid login would. Then it does the same in the other direction.',
    '',
    `Run at ${date} UTC.`,
    '',
    '## One request in full',
    '',
    `Logged in as ${raw.email}, asking for a ${raw.email.includes('alpha') ? 'Beta Logistics' : 'Alpha Transport'} load by its id. The curl line is the equivalent command; the response under it is exactly what the server sent the script:`,
    '',
    '```',
    `curl -i -b "fd.sid=<session cookie from login>" ${base}${raw.url}`,
    '',
    `HTTP/1.1 ${raw.res.status} ${raw.res.statusText}`,
    `Content-Type: ${raw.res.headers.get('content-type')}`,
    '',
    raw.res.text,
    '```',
    '',
    'The answer is the same as for a load id that does not exist at all, so the caller cannot even learn that',
    'the record exists.',
    '',
    '## Every attempt',
    '',
    'BLOCKED: the server refused (404). OWN DATA ONLY: the server ignored the forged company_id and returned only',
    "the caller's own company. LEAK: any other company data in the answer, or any write that landed.",
    '',
    '| # | Who | Trying to | Request | Expected | Status | Body excerpt | Result |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r, i) =>
        `| ${i + 1} | ${r.who} | ${r.what} | \`${r.request}\` | ${r.expected} | ${r.res.status} | \`${excerpt(r.res.text)}\` | ${r.result} |`,
    ),
    '',
    '## Write check',
    '',
    writesOk
      ? 'After all attempts the script read the database directly: no load of the other company changed status and no document was added. The only status changes are A-1001 and B-2001, each moved by its own company\'s owner in the "move own load with body company_id" rows.'
      : 'After all attempts a load of the other company changed status or a document was added. THIS IS A LEAK.',
    '',
    `**${summary}**`,
    '',
  ];
  return lines.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
