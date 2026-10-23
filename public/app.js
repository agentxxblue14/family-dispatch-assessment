// Front end: one page, plain DOM, no framework. The server decides everything that matters
// (who you are, which company, what you may see); this file only shows what the API returns.
// All text goes in with textContent (via el()), never innerHTML, so data cannot inject HTML.
import { api } from './api.js';

const PASSWORD = 'Demo2026!';
const SAMPLE_ACCOUNTS = {
  'Alpha Transport': [
    ['Dana Reyes', 'Owner', 'owner@alpha.test'],
    ['Sam Ortiz', 'Dispatcher', 'dispatch@alpha.test'],
    ['Miguel Cruz', 'Driver', 'driver1@alpha.test'],
    ['Jordan Lee', 'Driver', 'driver2@alpha.test'],
  ],
  'Beta Logistics': [
    ['Priya Shah', 'Owner', 'owner@beta.test'],
    ['Tom Hale', 'Dispatcher', 'dispatch@beta.test'],
    ['Ana Silva', 'Driver', 'driver1@beta.test'],
    ['Ben Ward', 'Driver', 'driver2@beta.test'],
  ],
};

// The seed always inserts Alpha first, so ids are fixed: Alpha is company 1 with loads 1 to 4,
// Beta is company 2 with loads 5 to 8. The Security check uses these to aim at the OTHER company.
const COMPANIES = {
  1: { key: 'alpha', name: 'Alpha Transport', loadIds: [1, 2, 3, 4], podLoadId: 2 },
  2: { key: 'beta', name: 'Beta Logistics', loadIds: [5, 6, 7, 8], podLoadId: 6 },
};

const STATUSES = ['Assigned', 'Picked Up', 'Delivered'];
const NEXT_LABEL = { Assigned: 'Mark Picked Up', 'Picked Up': 'Mark Delivered' };
const ROLE_LABEL = { owner: 'Owner', dispatcher: 'Dispatcher', driver: 'Driver' };

const state = { me: null, tab: null, selectedLoadId: null, message: '' };
const root = document.getElementById('app');

// ---------- small helpers ----------

// Creates an element. Strings and numbers become text nodes, so nothing is ever parsed as HTML.
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function pill(status) {
  return el('span', { class: `pill pill-${status.toLowerCase().replace(' ', '-')}` }, status);
}

function tracker(status) {
  const at = STATUSES.indexOf(status);
  return el(
    'ol',
    { class: 'tracker', 'aria-label': `Status: ${status}` },
    STATUSES.map((s, i) => el('li', { class: [i <= at ? 'done' : '', i === at ? 'current' : ''].join(' ') }, s)),
  );
}

function time(iso) {
  const d = new Date(iso);
  return el('time', { datetime: iso }, d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
}

function route(load) {
  return `${load.origin} > ${load.destination}`;
}

// Shared handling for error answers from the API.
function errorText(res) {
  if (res.status === 403) return 'Your role cannot view this.';
  if (res.status === 404) return 'Not found.';
  if (res.status === 409) return res.data.error;
  if (res.status === 400) return res.data.error || 'Invalid input.';
  return `Something went wrong (${res.status}).`;
}

async function call(method, path, body) {
  const res = await api(method, path, body);
  if (res.status === 401 && path !== '/api/login') {
    state.me = null;
    renderLogin('Your session ended. Please log in again.');
    throw new Error('logged out');
  }
  return res;
}

// ---------- start ----------

async function start() {
  const res = await api('GET', '/api/me');
  if (res.status === 200) {
    state.me = res.data;
    state.tab = defaultTab();
    renderApp();
  } else {
    renderLogin();
  }
}

// ---------- login ----------

function renderLogin(error = '') {
  document.body.className = '';
  const email = el('input', { id: 'email', type: 'email', name: 'email', autocomplete: 'username', required: true });
  const password = el('input', { id: 'password', type: 'password', name: 'password', autocomplete: 'current-password', required: true });
  const errorLine = el('p', { class: 'error', role: 'alert' }, error);

  async function login(event) {
    event?.preventDefault();
    errorLine.textContent = '';
    const res = await api('POST', '/api/login', { email: email.value, password: password.value });
    if (res.status === 200) {
      state.me = res.data.user;
      state.tab = defaultTab();
      state.selectedLoadId = null;
      state.message = '';
      renderApp();
    } else if (res.status === 429) {
      errorLine.textContent = res.data.error;
    } else {
      errorLine.textContent = 'Invalid email or password.';
    }
  }

  const accounts = Object.entries(SAMPLE_ACCOUNTS).map(([company, users]) =>
    el(
      'div',
      { class: company.startsWith('Alpha') ? 'alpha' : 'beta' },
      el('h3', {}, company),
      users.map(([name, role, mail]) =>
        el(
          'button',
          {
            type: 'button',
            class: 'account',
            'aria-label': `Log in as ${name}, ${role}, ${company}`,
            onclick: () => {
              email.value = mail;
              password.value = PASSWORD;
              login();
            },
          },
          el('span', {}, name),
          el('span', { class: 'muted' }, role),
        ),
      ),
    ),
  );

  root.replaceChildren(
    el('h1', {}, 'Family Dispatch: multi-tenant prototype'),
    el('p', { class: 'muted' }, 'Fictional sample data. Two companies, three roles, isolation enforced by the server.'),
    el(
      'form',
      { class: 'card login-form', onsubmit: login },
      el('div', {}, el('label', { for: 'email' }, 'Email'), email),
      el('div', {}, el('label', { for: 'password' }, 'Password'), password),
      el('button', { class: 'primary', type: 'submit' }, 'Log in'),
    ),
    errorLine,
    el(
      'section',
      { class: 'card' },
      el('h2', {}, 'Sample accounts'),
      el('p', { class: 'muted' }, `Click a name to log in. Password for every account: ${PASSWORD}`),
      el('div', { class: 'accounts' }, accounts),
    ),
  );
  email.focus();
}

// ---------- logged-in shell ----------

function tabsForRole(role) {
  if (role === 'driver') return [['myloads', 'My loads'], ['security', 'Security check']];
  const tabs = [['loads', 'Loads'], ['drivers', 'Drivers'], ['trucks', 'Trucks'], ['security', 'Security check']];
  if (role === 'owner') tabs.push(['blocked', 'Blocked log']);
  return tabs;
}

function defaultTab() {
  return tabsForRole(state.me.role)[0][0];
}

async function renderApp() {
  const me = state.me;
  document.body.className = `company-${COMPANIES[me.company.id]?.key || 'other'}`;
  const content = el('div', {}, el('p', { class: 'muted' }, 'Loading...'));
  const message = el('p', { class: 'muted', role: 'status' }, state.message);
  state.message = '';

  root.replaceChildren(
    el(
      'header',
      { class: 'topbar' },
      el('span', { class: 'chip' }, `${me.company.name} · ${ROLE_LABEL[me.role]}`),
      el(
        'div',
        { class: 'who' },
        el('span', {}, me.name),
        el('button', { type: 'button', onclick: logout }, 'Log out'),
      ),
    ),
    el(
      'nav',
      { class: 'tabs', role: 'tablist' },
      tabsForRole(me.role).map(([key, label]) =>
        el(
          'button',
          {
            type: 'button',
            role: 'tab',
            'aria-selected': String(state.tab === key),
            onclick: () => {
              state.tab = key;
              state.selectedLoadId = null;
              renderApp();
            },
          },
          label,
        ),
      ),
    ),
    message,
    content,
  );

  const views = {
    loads: renderOfficeLoads,
    myloads: renderDriverLoads,
    drivers: renderDrivers,
    trucks: renderTrucks,
    security: renderSecurity,
    blocked: renderBlocked,
  };
  try {
    content.replaceChildren(...(await views[state.tab]()));
  } catch (err) {
    if (err.message !== 'logged out') throw err;
  }
}

async function logout() {
  await api('POST', '/api/logout');
  state.me = null;
  renderLogin();
}

// ---------- actions shared by office and driver screens ----------

async function advance(load) {
  const res = await call('POST', `/api/loads/${load.id}/advance`);
  state.message = res.status === 200 ? `${load.ref} moved to ${res.data.load.status}.` : `${load.ref}: ${errorText(res)}`;
  renderApp();
}

function uploadForm(load) {
  const input = el('input', { type: 'file', name: 'file', accept: '.pdf,.png,.jpg,.jpeg', 'aria-label': `POD file for ${load.ref}` });
  const button = el('button', { type: 'button' }, 'Upload POD');
  button.addEventListener('click', async () => {
    if (!input.files[0]) {
      state.message = 'Choose a PDF, PNG or JPG first.';
      return renderApp();
    }
    const form = new FormData();
    form.append('file', input.files[0]);
    const res = await call('POST', `/api/loads/${load.id}/document`, form);
    state.message = res.status === 201 ? `POD uploaded to ${load.ref}.` : `${load.ref}: ${errorText(res)}`;
    renderApp();
  });
  return el('div', { class: 'upload' }, input, button);
}

function nextButton(load) {
  if (!NEXT_LABEL[load.status]) return el('span', { class: 'muted' }, 'Complete');
  return el('button', { type: 'button', class: 'primary', onclick: () => advance(load) }, NEXT_LABEL[load.status]);
}

function podLink(load) {
  if (!load.hasDocument) return el('span', { class: 'muted' }, 'None');
  return el('a', { href: `/api/loads/${load.id}/document` }, 'Open POD');
}

// ---------- owner and dispatcher: loads ----------

async function renderOfficeLoads() {
  const res = await call('GET', '/api/loads');
  if (res.status !== 200) return [el('p', { class: 'notice' }, errorText(res))];
  const loads = res.data;
  const count = (s) => loads.filter((l) => l.status === s).length;

  const rows = loads.map((load) =>
    el(
      'tr',
      { class: load.id === state.selectedLoadId ? 'selected' : '' },
      el(
        'td',
        { 'data-label': 'Load' },
        el(
          'button',
          {
            type: 'button',
            class: 'ref',
            'aria-label': `Open details for ${load.ref}`,
            onclick: () => {
              state.selectedLoadId = load.id;
              renderApp();
            },
          },
          load.ref,
        ),
      ),
      el('td', { 'data-label': 'Route' }, route(load)),
      el('td', { 'data-label': 'Driver' }, load.driver ? load.driver.name : 'Unassigned'),
      el('td', { 'data-label': 'Truck', class: 'num' }, load.truck ? load.truck.unit : 'None'),
      el('td', { 'data-label': 'Status' }, pill(load.status)),
      el('td', { 'data-label': 'Next step' }, nextButton(load)),
      el('td', { 'data-label': 'POD' }, podLink(load)),
    ),
  );

  const out = [
    el(
      'div',
      { class: 'counts', 'aria-label': 'Load counts' },
      STATUSES.map((s) => el('span', {}, el('strong', { class: 'num' }, String(count(s))), ` ${s}`)),
    ),
    el(
      'div',
      { class: 'table-wrap' },
      el(
        'table',
        { class: 'responsive' },
        el('thead', {}, el('tr', {}, ['Load', 'Route', 'Driver', 'Truck', 'Status', 'Next step', 'POD'].map((h) => el('th', { scope: 'col' }, h)))),
        el('tbody', {}, rows),
      ),
    ),
    el('p', { class: 'muted' }, 'Click a load number to see its history and upload a delivery document.'),
  ];
  if (state.selectedLoadId) out.push(await renderLoadDetail(state.selectedLoadId));
  return out;
}

async function renderLoadDetail(id) {
  const res = await call('GET', `/api/loads/${id}`);
  if (res.status !== 200) return el('p', { class: 'notice' }, errorText(res));
  const { load, events, document: doc } = res.data;

  return el(
    'section',
    { class: 'card detail', 'aria-label': `Details for ${load.ref}` },
    el('h2', {}, `Load ${load.ref}`),
    el(
      'dl',
      {},
      el('dt', {}, 'Route'),
      el('dd', {}, route(load)),
      el('dt', {}, 'Driver'),
      el('dd', {}, load.driver ? load.driver.name : 'Unassigned'),
      el('dt', {}, 'Truck'),
      el('dd', {}, load.truck ? load.truck.unit : 'None'),
      el('dt', {}, 'Status'),
      el('dd', {}, pill(load.status)),
    ),
    tracker(load.status),
    el('div', { class: 'actions' }, nextButton(load)),
    el('h3', {}, 'Delivery document (POD)'),
    doc
      ? el('p', {}, el('a', { href: `/api/loads/${load.id}/document` }, doc.filename), ` · uploaded by ${doc.uploadedBy} · `, time(doc.uploadedAt))
      : el('p', { class: 'muted' }, 'No document yet.'),
    uploadForm(load),
    el('h3', {}, 'History'),
    events.length
      ? el(
          'ol',
          { class: 'history' },
          events.map((e) => el('li', {}, `${e.by} moved ${e.fromStatus} to ${e.toStatus} · `, time(e.at))),
        )
      : el('p', { class: 'muted' }, 'No moves yet.'),
  );
}

// ---------- driver: my loads ----------

async function renderDriverLoads() {
  const res = await call('GET', '/api/loads');
  if (res.status !== 200) return [el('p', { class: 'notice' }, errorText(res))];
  if (!res.data.length) return [el('p', { class: 'muted' }, 'No loads assigned to you.')];

  return [
    el('h1', {}, 'My loads'),
    ...res.data.map((load) =>
      el(
        'article',
        { class: 'card load-card', 'aria-label': `Load ${load.ref}` },
        el('div', { class: 'topbar' }, el('span', { class: 'ref' }, load.ref), pill(load.status)),
        el('div', {}, route(load)),
        el('div', { class: 'muted' }, `Truck ${load.truck ? load.truck.unit : 'none'}`),
        tracker(load.status),
        el('div', { class: 'actions' }, nextButton(load), load.hasDocument ? podLink(load) : null),
        uploadForm(load),
      ),
    ),
  ];
}

// ---------- owner and dispatcher: drivers, trucks ----------

async function renderDrivers() {
  const res = await call('GET', '/api/drivers');
  if (res.status !== 200) return [el('p', { class: 'notice' }, errorText(res))];
  return [
    el(
      'div',
      { class: 'table-wrap' },
      el(
        'table',
        { class: 'responsive' },
        el('thead', {}, el('tr', {}, ['Driver', 'Email', 'Open loads'].map((h) => el('th', { scope: 'col' }, h)))),
        el(
          'tbody',
          {},
          res.data.map((d) =>
            el(
              'tr',
              {},
              el('td', { 'data-label': 'Driver' }, d.name),
              el('td', { 'data-label': 'Email' }, d.email),
              el('td', { 'data-label': 'Open loads', class: 'num' }, String(d.openLoads)),
            ),
          ),
        ),
      ),
    ),
  ];
}

async function renderTrucks() {
  const res = await call('GET', '/api/trucks');
  if (res.status !== 200) return [el('p', { class: 'notice' }, errorText(res))];
  return [
    el(
      'div',
      { class: 'table-wrap' },
      el(
        'table',
        { class: 'responsive' },
        el('thead', {}, el('tr', {}, ['Truck', 'Open loads'].map((h) => el('th', { scope: 'col' }, h)))),
        el(
          'tbody',
          {},
          res.data.map((t) =>
            el(
              'tr',
              {},
              el('td', { 'data-label': 'Truck', class: 'num' }, t.unit),
              el('td', { 'data-label': 'Open loads', class: 'num' }, String(t.openLoads)),
            ),
          ),
        ),
      ),
    ),
  ];
}

// ---------- owner: blocked log ----------

async function renderBlocked() {
  const res = await call('GET', '/api/audit/denials');
  if (res.status !== 200) return [el('p', { class: 'notice' }, errorText(res))];
  const intro = el('p', { class: 'muted' }, 'Requests from people in your company that the server refused. Try the Security check tab, then come back here.');
  if (!res.data.length) return [intro, el('p', {}, 'No blocked attempts yet.')];
  return [
    intro,
    el(
      'div',
      { class: 'table-wrap' },
      el(
        'table',
        { class: 'responsive' },
        el('thead', {}, el('tr', {}, ['When', 'Who', 'Request', 'Answer'].map((h) => el('th', { scope: 'col' }, h)))),
        el(
          'tbody',
          {},
          res.data.map((d) =>
            el(
              'tr',
              {},
              el('td', { 'data-label': 'When' }, time(d.at)),
              el('td', { 'data-label': 'Who' }, `${d.user} (${ROLE_LABEL[d.role]})`),
              el('td', { 'data-label': 'Request', class: 'num' }, `${d.method} ${d.path}`),
              el('td', { 'data-label': 'Answer' }, d.status === 403 ? '403 wrong role' : '404 not yours'),
            ),
          ),
        ),
      ),
    ),
  ];
}

// ---------- security check ----------
// Each button sends a REAL request that the UI would never normally make, straight to the API,
// and prints exactly what the server answered. Nothing here is hidden or faked by the page.

function attacksFor(me, ownLoads) {
  const own = COMPANIES[me.company.id];
  const otherId = me.company.id === 1 ? 2 : 1;
  const other = COMPANIES[otherId];
  const target = other.loadIds[0];
  // A request is BLOCKED when the server refuses it (403 or 404).
  const refused = (res) => res.status === 403 || res.status === 404;
  // For the company_id trick the server answers 200, so check that only our own loads came back.
  const onlyOwn = (res) =>
    res.status === 200 && Array.isArray(res.data) && res.data.every((l) => own.loadIds.includes(l.id));

  const attacks = [
    { label: `Open a ${other.name} load`, method: 'GET', path: `/api/loads/${target}`, blocked: refused },
    { label: 'Move it to the next status', method: 'POST', path: `/api/loads/${target}/advance`, blocked: refused },
    { label: 'Download its delivery document', method: 'GET', path: `/api/loads/${other.podLoadId}/document`, blocked: refused },
    {
      label: `Send company_id=${otherId} (${other.name}) in the URL`,
      method: 'GET',
      path: `/api/loads?company_id=${otherId}`,
      blocked: onlyOwn,
      blockedText: 'BLOCKED: only your own loads came back',
    },
  ];
  if (me.role === 'driver') {
    const mine = ownLoads.map((l) => l.id);
    const coworker = own.loadIds.find((id) => !mine.includes(id));
    if (coworker) {
      attacks.push({ label: "Open another driver's load", method: 'GET', path: `/api/loads/${coworker}`, blocked: refused });
    }
  } else {
    attacks.push({ label: 'Upload a file to their load', method: 'POST', path: `/api/loads/${target}/document`, blocked: refused, upload: true });
  }
  return attacks;
}

async function renderSecurity() {
  const me = state.me;
  const ownRes = await call('GET', '/api/loads');
  const attacks = attacksFor(me, ownRes.data || []);
  const results = el('div', { 'aria-live': 'polite' });

  async function runAttack(attack) {
    let body;
    if (attack.upload) {
      body = new FormData();
      body.append('file', new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' }), 'attack.pdf');
    }
    const res = await call(attack.method, attack.path, body);
    const blocked = attack.blocked(res);
    const shownBody = typeof res.data === 'string' ? res.data.slice(0, 200) : JSON.stringify(res.data);
    results.prepend(
      el(
        'div',
        { class: 'result' },
        el('div', { class: 'line' }, el('strong', {}, attack.label), el('span', { class: `badge ${blocked ? 'badge-blocked' : 'badge-leak'}` }, blocked ? attack.blockedText || 'BLOCKED' : 'ALLOWED')),
        el('div', { class: 'line' }, el('span', {}, `${attack.method} ${attack.path}`)),
        el('pre', {}, `${res.status}  ${shownBody}`),
      ),
    );
  }

  async function runAll() {
    for (const attack of [...attacks].reverse()) await runAttack(attack);
  }

  return [
    el('h1', {}, 'Security check'),
    el('p', {}, `You are ${me.company.name} · ${ROLE_LABEL[me.role]}. Each button sends a real request for data you should not get, straight to the server.`),
    el(
      'div',
      { class: 'attack-buttons' },
      attacks.map((a) => el('button', { type: 'button', onclick: () => runAttack(a) }, `Try: ${a.label}`)),
      el('button', { type: 'button', class: 'primary', onclick: runAll }, 'Run all'),
    ),
    results,
  ];
}

start();
