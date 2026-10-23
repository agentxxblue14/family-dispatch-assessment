// Browser check: drives a real (headless) Chrome through the UI as all 8 sample users.
//
// For each user it logs in by clicking their name, checks the chip, tabs and the loads they
// see, opens a load detail, runs every Security check button (each must say BLOCKED), and
// records any browser console messages. It saves screenshots at 1440 and 390 px wide to
// docs/screenshots/ and writes a summary to docs/BROWSER-CHECK.md.
//
// Run: npm run browser-check   (needs Google Chrome; set CHROME_PATH if it is not found)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

process.env.UPLOAD_DIR = path.join(os.tmpdir(), `fd-browser-check-${process.pid}`);
const { openDb } = require('../src/db');
const { seed } = require('../src/db/seed');
const { createApp } = require('../src/app');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const POD = path.join(ROOT, 'seed-files', 'POD-A-1002.pdf');
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const ALPHA = ['A-1001', 'A-1002', 'A-1003', 'A-1004'];
const BETA = ['B-2001', 'B-2002', 'B-2003', 'B-2004'];
const USERS = [
  { name: 'Dana Reyes', role: 'Owner', company: 'Alpha Transport', refs: ALPHA },
  { name: 'Sam Ortiz', role: 'Dispatcher', company: 'Alpha Transport', refs: ALPHA },
  { name: 'Miguel Cruz', role: 'Driver', company: 'Alpha Transport', refs: ['A-1001', 'A-1003'] },
  { name: 'Jordan Lee', role: 'Driver', company: 'Alpha Transport', refs: ['A-1002', 'A-1004'] },
  { name: 'Priya Shah', role: 'Owner', company: 'Beta Logistics', refs: BETA },
  { name: 'Tom Hale', role: 'Dispatcher', company: 'Beta Logistics', refs: BETA },
  { name: 'Ana Silva', role: 'Driver', company: 'Beta Logistics', refs: ['B-2001', 'B-2003'] },
  { name: 'Ben Ward', role: 'Driver', company: 'Beta Logistics', refs: ['B-2002', 'B-2004'] },
];

const results = []; // { who, ok, what }
const consoleLog = []; // { who, type, text }
const check = (who, ok, what) => results.push({ who, ok: Boolean(ok), what });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- page helpers ----------

async function settled(page) {
  await page.waitForFunction(() => !document.querySelector('#app')?.textContent.includes('Loading...'));
}

async function clickText(page, selector, text) {
  await settled(page);
  for (const handle of await page.$$(selector)) {
    const label = await handle.evaluate((n) => n.textContent.trim());
    if (label === text || label.startsWith(text)) return handle.click();
  }
  throw new Error(`no ${selector} with text "${text}"`);
}

async function openTab(page, label) {
  await clickText(page, '.tabs button', label);
  await page.waitForFunction(
    (l) => document.querySelector('.tabs button[aria-selected="true"]')?.textContent === l,
    {},
    label,
  );
  await settled(page);
}

async function waitForMessage(page, text) {
  await page.waitForFunction((t) => document.querySelector('[role=status]')?.textContent.includes(t), {}, text);
  await settled(page);
}

let currentUser = ''; // whose run the screenshots belong to

async function shot(page, name, widths = [1440, 390]) {
  for (const width of widths) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 150));
    // No sideways scrolling: the page must fit the screen width.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    check(currentUser, scrollWidth <= width, `${name} fits ${width}px wide (page is ${scrollWidth}px)`);
    await page.screenshot({ path: path.join(SHOTS, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewport({ width: 1440, height: 900 });
}

// ---------- one user ----------

async function checkUser(browser, base, u, first) {
  currentUser = u.name;
  const context = await browser.createBrowserContext(); // fresh cookies per user
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warn') consoleLog.push({ who: u.name, type: m.type(), text: m.text() });
  });
  page.on('pageerror', (e) => consoleLog.push({ who: u.name, type: 'pageerror', text: String(e) }));

  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.account');
  if (first) await shot(page, 'login');

  await page.click(`button[aria-label="Log in as ${u.name}, ${u.role}, ${u.company}"]`);
  await page.waitForSelector('.chip');
  await settled(page);
  check(
    u.name,
    (await page.$eval('.chip', (n) => n.textContent)) === `${u.company} · ${u.role}`,
    'company and role chip',
  );
  const tabs = await page.$$eval('.tabs button', (b) => b.map((x) => x.textContent));

  if (u.role === 'Driver') {
    check(u.name, same(tabs, ['My loads', 'Security check']), `tabs: ${tabs.join(', ')}`);
    const refs = await page.$$eval('.load-card .ref', (n) => n.map((x) => x.textContent).sort());
    check(u.name, same(refs, u.refs), `sees only own loads: ${refs.join(', ')}`);
    if (u.name === 'Miguel Cruz') await shot(page, 'driver-view');
  } else {
    const wanted = ['Loads', 'Drivers', 'Trucks', 'Security check', ...(u.role === 'Owner' ? ['Blocked log'] : [])];
    check(u.name, same(tabs, wanted), `tabs: ${tabs.join(', ')}`);
    const refs = await page.$$eval('tbody .ref', (n) => n.map((x) => x.textContent).sort());
    check(u.name, same(refs, u.refs), `loads table: ${refs.join(', ')}`);
    if (u.name === 'Dana Reyes') await shot(page, 'owner-dashboard');

    await clickText(page, 'tbody .ref', u.refs[1]); // the Delivered load, seeded with history and a POD
    await page.waitForSelector('.detail');
    const historyRows = await page.$$eval('.history li', (n) => n.length);
    const showsPod = await page.$eval('.detail', (n) => n.textContent.includes('.pdf'));
    check(u.name, historyRows === 2 && showsPod, `detail of ${u.refs[1]}: ${historyRows} history rows, POD shown`);
    if (u.name === 'Dana Reyes') await shot(page, 'load-detail');

    await openTab(page, 'Drivers');
    check(u.name, (await page.$$eval('tbody tr', (n) => n.length)) === 2, 'drivers tab shows 2 own drivers');
    await openTab(page, 'Trucks');
    check(u.name, (await page.$$eval('tbody tr', (n) => n.length)) === 2, 'trucks tab shows 2 own trucks');
  }

  await openTab(page, 'Security check');
  const attackCount = await page.$$eval('.attack-buttons button', (n) => n.length - 1); // minus "Run all"
  await clickText(page, '.attack-buttons button', 'Run all');
  await page.waitForFunction((n) => document.querySelectorAll('.result').length === n, { timeout: 15000 }, attackCount);
  const badges = await page.$$eval('.result .badge', (n) => n.map((x) => x.textContent));
  check(
    u.name,
    badges.length === 5 && badges.every((b) => b.startsWith('BLOCKED')),
    `security check: ${badges.length} of 5 BLOCKED`,
  );
  if (u.name === 'Dana Reyes') await shot(page, 'security-check');

  if (u.role === 'Owner') {
    await openTab(page, 'Blocked log');
    // 4 refused attacks are logged; the company_id try returns 200 (own data), not a denial.
    const rows = await page.$$eval('tbody tr', (n) => n.length);
    check(u.name, rows === 4, `blocked log lists the ${rows} refused attempts`);
    if (u.name === 'Dana Reyes') await shot(page, 'blocked-log', [1440]);
  }

  // Workflow from the UI, after the owner screenshots so those show the starting data.
  if (u.name === 'Sam Ortiz') {
    await openTab(page, 'Loads');
    await clickText(page, 'tbody .ref', 'A-1001');
    await page.waitForSelector('.detail');
    await clickText(page, '.detail button.primary', 'Mark Picked Up');
    await waitForMessage(page, 'A-1001 moved to Picked Up');
    const input = await page.$('.detail input[type=file]');
    await input.uploadFile(POD);
    await clickText(page, '.detail button', 'Upload POD');
    await waitForMessage(page, 'POD uploaded to A-1001');
    const text = await page.$eval('.detail', (n) => n.textContent);
    check(
      u.name,
      text.includes('Sam Ortiz moved Assigned to Picked Up') && text.includes('uploaded by Sam Ortiz'),
      'moves A-1001 and uploads a POD from the UI',
    );
    await shot(page, 'after-advance-and-upload', [1440]);
  }
  if (u.name === 'Miguel Cruz') {
    await openTab(page, 'My loads');
    // A-1003 has no POD yet: the server must refuse Delivered and the page must say why.
    const cards = await page.$$('.load-card');
    const lastButton = await cards[cards.length - 1].$('button.primary');
    await lastButton.click();
    await waitForMessage(page, 'A-1003: Upload the delivery document (POD) before marking Delivered');
    const a1003 = await page.$$eval(
      '.load-card',
      (cards) => cards.find((c) => c.textContent.includes('A-1003'))?.querySelector('.pill')?.textContent,
    );
    check(
      u.name,
      a1003 === 'Picked Up',
      `Delivered without a POD is refused with a clear message (A-1003 still ${a1003})`,
    );
    // A-1001 now has Sam's POD, so Miguel can deliver it.
    await clickText(page, '.load-card button.primary', 'Mark Delivered');
    await waitForMessage(page, 'A-1001 moved to Delivered');
    const a1001 = await page.$$eval(
      '.load-card',
      (cards) => cards.find((c) => c.textContent.includes('A-1001'))?.querySelector('.pill')?.textContent,
    );
    check(
      u.name,
      a1001 === 'Delivered',
      `driver marks own load Delivered once the POD is on file (A-1001 now ${a1001})`,
    );
    await shot(page, 'driver-after-delivery', [390]);
  }

  await clickText(page, 'button', 'Log out');
  await page.waitForSelector('.account');
  await context.close();
}

// ---------- run ----------

async function main() {
  const executablePath = CHROME_PATHS.find((p) => fs.existsSync(p));
  if (!executablePath) throw new Error('Chrome not found. Set CHROME_PATH to your Chrome executable.');

  const db = await openDb();
  await seed(db);
  const server = createApp(db).listen(0);
  await new Promise((ok) => server.once('listening', ok));
  const base = `http://localhost:${server.address().port}`;
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-first-run'] });
  const version = await browser.version();
  try {
    for (const [i, u] of USERS.entries()) await checkUser(browser, base, u, i === 0);
  } finally {
    await browser.close();
    server.close();
    await db.close();
    fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.ok);
  // Chrome logs every 4xx answer as a console error. Those are expected here: the Security
  // check requests are meant to be refused, and the page asks /api/me before anyone logs in.
  const expectedNetwork = (c) =>
    /Failed to load resource: the server responded with a status of (401|404|409)/.test(c.text);
  const otherConsole = consoleLog.filter((c) => !expectedNetwork(c));
  fs.writeFileSync(path.join(ROOT, 'docs', 'BROWSER-CHECK.md'), report({ version, failed, otherConsole }));

  console.log(
    `${results.length} checks, ${failed.length} failed; console: ${consoleLog.length} expected network notices, ${otherConsole.length} other messages`,
  );
  failed.forEach((f) => console.log(`FAILED ${f.who}: ${f.what}`));
  process.exit(failed.length || otherConsole.length ? 1 : 0);
}

function report({ version, failed, otherConsole }) {
  const date = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const users = [...new Set(results.map((r) => r.who))];
  return [
    '# Browser check',
    '',
    `Generated by \`npm run browser-check\` (scripts/browser-check.js) on ${date} UTC with headless ${version}.`,
    'The script starts the app, then drives Chrome through the real page as each of the 8 sample users.',
    '',
    '| User | Checks passed | What was checked |',
    '|---|---|---|',
    ...users.map((who) => {
      const mine = results.filter((r) => r.who === who);
      return `| ${who} | ${mine.filter((r) => r.ok).length} of ${mine.length} | ${mine.map((r) => (r.ok ? '' : 'FAILED: ') + r.what).join('; ')} |`;
    }),
    '',
    `**${results.length - failed.length} of ${results.length} checks passed.**`,
    '',
    '## Browser console',
    '',
    `Script errors and other console messages: **${otherConsole.length}**.`,
    'Chrome also prints a red "Failed to load resource" line for every 4xx answer. Those are expected here and not counted above:',
    'the Security check requests are meant to be refused (404), the page asks /api/me (401) before anyone logs in, and the',
    'Delivered-without-POD check is refused (409).',
    ...otherConsole.map((c) => `- ${c.who}: ${c.type}: ${c.text}`),
    '',
    'Screenshots from this run are in [screenshots/](screenshots/).',
    '',
  ].join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
