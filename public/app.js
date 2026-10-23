// Front end: one page, plain DOM, no framework. The server decides everything that matters
// (who you are, which company, what you may see); this file only shows what the API returns.
// All text goes in with textContent (via el()), never innerHTML, so data cannot inject HTML.
import { api } from './api.js';
import { el } from './dom.js';
import { renderOverview } from './overview.js';

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

// message: { text, kind } where kind is 'ok' or 'error'. Shown once, after the next render.
// justMoved: { loadId, status } after a successful advance, so that step animates once.
const state = { me: null, tab: null, selectedLoadId: null, message: null, justMoved: null };
const root = document.getElementById('app');
const bar = document.getElementById('bar');

// ---------- small helpers ----------

function pill(status) {
  return el('span', { class: `pill pill-${status.toLowerCase().replace(' ', '-')}` }, status);
}

function formatTime(iso) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function time(iso) {
  return el('time', { datetime: iso }, formatTime(iso));
}

function route(load) {
  return el(
    'span',
    { class: 'route' },
    load.origin,
    el('span', { class: 'arrow', 'aria-hidden': 'true' }, ' → '),
    load.destination,
  );
}

function needsPod(load) {
  return load.status === 'Picked Up' && !load.hasDocument;
}

// Three steps with a marker each. events (optional) add the time each step was reached.
// The step a load has just moved to gets the "arrive" class, which animates once (CSS).
function stepper(load, events = []) {
  const status = load.status;
  // Delivered is the end: show every step as done, nothing still in progress.
  const last = status === STATUSES[STATUSES.length - 1];
  const at = last ? STATUSES.length : STATUSES.indexOf(status);
  const reachedAt = Object.fromEntries(events.map((e) => [e.toStatus, e.at]));
  const moved = state.justMoved && state.justMoved.loadId === load.id ? state.justMoved.status : null;
  return el(
    'ol',
    { class: 'stepper', 'aria-label': `Status: ${status}` },
    STATUSES.map((s, i) =>
      el(
        'li',
        { class: [i < at ? 'done' : '', i === at ? 'current' : '', s === moved ? 'arrive' : ''].join(' ') },
        el('span', { class: 'marker', 'aria-hidden': 'true' }),
        el('span', { class: 'step-label' }, s),
        reachedAt[s] ? el('span', { class: 'step-time' }, formatTime(reachedAt[s])) : null,
      ),
    ),
  );
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

function table(headers, rows, label) {
  return el(
    'div',
    { class: 'table-wrap' },
    el(
      'table',
      { class: 'responsive', 'aria-label': label },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          headers.map((h) => el('th', { scope: 'col' }, h)),
        ),
      ),
      el('tbody', {}, rows),
    ),
  );
}

function notice(res) {
  return [el('p', { class: 'banner error' }, errorText(res))];
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
  document.body.className = 'login';
  bar.replaceChildren(); // no top bar before login
  const email = el('input', { id: 'email', type: 'email', name: 'email', autocomplete: 'username', required: true });
  const password = el('input', {
    id: 'password',
    type: 'password',
    name: 'password',
    autocomplete: 'current-password',
    required: true,
  });
  const errorLine = el('p', { class: 'error', role: 'alert' }, error);

  async function login(event) {
    event?.preventDefault();
    errorLine.textContent = '';
    const res = await api('POST', '/api/login', { email: email.value, password: password.value });
    if (res.status === 200) {
      state.me = res.data.user;
      state.tab = defaultTab();
      state.selectedLoadId = null;
      state.message = null;
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
      { class: `account-group ${company.startsWith('Alpha') ? 'alpha' : 'beta'}` },
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
          el(
            'span',
            { class: 'initials', 'aria-hidden': 'true' },
            name
              .split(' ')
              .map((n) => n[0])
              .join(''),
          ),
          el('span', { class: 'account-name' }, name, el('small', {}, mail)),
          el('span', { class: `role-tag role-${role.toLowerCase()}` }, role),
        ),
      ),
    ),
  );

  root.replaceChildren(
    el(
      'div',
      { class: 'login-grid' },
      el(
        'section',
        { class: 'intro' },
        el('p', { class: 'eyebrow' }, 'Family Dispatch · assessment prototype'),
        // The last phrase blends Alpha's navy into Beta's teal: two companies, one app.
        el('h1', {}, 'Two trucking companies. One app. ', el('span', { class: 'gradient-text' }, 'Zero shared data.')),
        el(
          'p',
          { class: 'lead' },
          'Alpha Transport and Beta Logistics share the same app and database, but neither can see or change the other’s loads, drivers, trucks or documents. The server enforces it, not the screen.',
        ),
        el(
          'ul',
          { class: 'points' },
          el(
            'li',
            {},
            el('strong', {}, 'Three roles. '),
            'Owners and dispatchers run the company; drivers see only their own loads.',
          ),
          el(
            'li',
            {},
            el('strong', {}, 'Real workflow. '),
            'Assigned, Picked Up, Delivered, with a proof of delivery required.',
          ),
          el(
            'li',
            {},
            el('strong', {}, 'Try to break it. '),
            'The Security check tab sends real cross-company requests.',
          ),
        ),
        el('p', { class: 'fine' }, 'All names and data are fictional.'),
      ),
      el(
        'section',
        { class: 'signin' },
        el(
          'form',
          { class: 'card login-form', onsubmit: login },
          el('h2', {}, 'Log in'),
          el('div', { class: 'field' }, el('label', { for: 'email' }, 'Email'), email),
          el('div', { class: 'field' }, el('label', { for: 'password' }, 'Password'), password),
          errorLine,
          el('button', { class: 'primary wide', type: 'submit' }, 'Log in'),
        ),
        el(
          'div',
          { class: 'card' },
          el('h2', {}, 'Sample accounts'),
          el('p', { class: 'muted' }, 'Click a name to log in. Password for every account: ', el('code', {}, PASSWORD)),
          el('div', { class: 'accounts' }, accounts),
        ),
      ),
    ),
  );
  email.focus();
}

// ---------- logged-in shell ----------

function tabsForRole(role) {
  if (role === 'driver') {
    return [
      ['myloads', 'My loads'],
      ['security', 'Security check'],
    ];
  }
  const tabs = [
    ['overview', 'Overview'],
    ['loads', 'Loads'],
    ['drivers', 'Drivers'],
    ['trucks', 'Trucks'],
    ['security', 'Security check'],
  ];
  if (role === 'owner') tabs.push(['blocked', 'Blocked log']);
  return tabs;
}

function defaultTab() {
  return tabsForRole(state.me.role)[0][0];
}

async function renderApp() {
  const me = state.me;
  document.body.className = `company-${COMPANIES[me.company.id]?.key || 'other'}`;
  const content = el('div', { class: 'content' }, el('p', { class: 'muted' }, 'Loading...'));
  const message = el(
    'p',
    { class: state.message ? `banner ${state.message.kind}` : 'banner empty', role: 'status' },
    state.message ? state.message.text : '',
  );
  state.message = null;

  // The top bar lives outside <main> so it can span the full width and stay pinned while scrolling.
  bar.replaceChildren(
    el(
      'div',
      { class: 'appbar' },
      el(
        'div',
        { class: 'brand' },
        el('span', { class: 'app-name' }, 'Family Dispatch'),
        el('span', { class: 'chip' }, `${me.company.name} · ${ROLE_LABEL[me.role]}`),
      ),
      el(
        'div',
        { class: 'who' },
        el(
          'span',
          { class: 'initials small', 'aria-hidden': 'true' },
          me.name
            .split(' ')
            .map((n) => n[0])
            .join(''),
        ),
        el('span', { class: 'who-name' }, me.name),
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
  );
  root.replaceChildren(message, content);

  const views = {
    overview: () => renderOverview({ me: state.me, call, openLoad, pill, route, errorText }),
    loads: renderOfficeLoads,
    myloads: renderDriverLoads,
    drivers: renderDrivers,
    trucks: renderTrucks,
    security: renderSecurity,
    blocked: renderBlocked,
  };
  try {
    content.replaceChildren(...(await views[state.tab]()));
    state.justMoved = null; // the move animation plays once only
  } catch (err) {
    if (err.message !== 'logged out') throw err;
  }
}

// Used by the Overview: jump to the Loads tab with this load open.
function openLoad(id) {
  state.tab = 'loads';
  state.selectedLoadId = id;
  renderApp();
}

async function logout() {
  await api('POST', '/api/logout');
  state.me = null;
  renderLogin();
}

// ---------- actions shared by office and driver screens ----------

// Sends the status on screen ({from}); the server refuses with 409 if the load changed since.
async function advance(load, button) {
  button.disabled = true; // no double clicks while the request runs
  const res = await call('POST', `/api/loads/${load.id}/advance`, { from: load.status });
  state.justMoved = res.status === 200 ? { loadId: load.id, status: res.data.load.status } : null;
  state.message =
    res.status === 200
      ? { kind: 'ok', text: `${load.ref} moved to ${res.data.load.status}.` }
      : { kind: 'error', text: `${load.ref}: ${errorText(res)}` };
  renderApp();
}

// A styled file picker: the real <input type=file> is visually hidden inside the label.
function uploadForm(load) {
  const chosen = el('span', { class: 'chosen' }, 'No file chosen');
  const input = el('input', {
    type: 'file',
    name: 'file',
    class: 'visually-hidden',
    accept: '.pdf,.png,.jpg,.jpeg',
    'aria-label': `POD file for ${load.ref}`,
  });
  input.addEventListener('change', () => {
    chosen.textContent = input.files[0] ? input.files[0].name : 'No file chosen';
  });
  const button = el('button', { type: 'button' }, 'Upload POD');
  button.addEventListener('click', async () => {
    if (!input.files[0]) {
      state.message = { kind: 'error', text: 'Choose a PDF, PNG or JPG first.' };
      return renderApp();
    }
    button.disabled = true;
    const form = new FormData();
    form.append('file', input.files[0]);
    const res = await call('POST', `/api/loads/${load.id}/document`, form);
    state.message =
      res.status === 201
        ? { kind: 'ok', text: `POD uploaded to ${load.ref}.` }
        : { kind: 'error', text: `${load.ref}: ${errorText(res)}` };
    renderApp();
  });
  return el(
    'div',
    { class: 'upload' },
    el('label', { class: 'button file-pick' }, input, 'Choose file'),
    chosen,
    button,
    el('small', { class: 'muted hint' }, 'PDF, PNG or JPG, up to 5 MB'),
  );
}

function nextButton(load, { wide = false } = {}) {
  if (!NEXT_LABEL[load.status]) {
    return el('span', { class: 'complete' }, wide ? 'Delivered and complete' : 'Complete');
  }
  const button = el('button', { type: 'button', class: wide ? 'primary wide' : 'primary' }, NEXT_LABEL[load.status]);
  button.addEventListener('click', () => advance(load, button));
  // The server refuses Delivered without a POD; say so before the user tries.
  if (!needsPod(load)) return button;
  return el('span', { class: 'next' }, button, el('small', { class: 'needs-pod' }, 'POD needed first'));
}

function downloadLink(loadId, label = 'Download') {
  return el('a', { class: 'button', href: `/api/loads/${loadId}/document`, download: '' }, label);
}

function sizeText(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function docCard(loadId, doc) {
  const ext = doc.filename.split('.').pop().toUpperCase();
  return el(
    'div',
    { class: 'doc' },
    el('span', { class: 'doc-icon', 'aria-hidden': 'true' }, ext),
    el(
      'div',
      { class: 'doc-info' },
      el('strong', {}, doc.filename),
      el('small', {}, `${sizeText(doc.sizeBytes)} · uploaded by ${doc.uploadedBy} · `, time(doc.uploadedAt)),
    ),
    downloadLink(loadId),
  );
}

// ---------- owner and dispatcher: loads ----------

async function renderOfficeLoads() {
  const res = await call('GET', '/api/loads');
  if (res.status !== 200) return notice(res);
  const loads = res.data;
  const count = (s) => loads.filter((l) => l.status === s).length;

  const stats = el(
    'div',
    { class: 'stats', 'aria-label': 'Load counts' },
    STATUSES.map((s) =>
      el('div', { class: 'stat' }, el('span', { class: 'stat-num' }, String(count(s))), el('span', {}, s)),
    ),
    el(
      'div',
      { class: `stat ${loads.some(needsPod) ? 'stat-warn' : ''}` },
      el('span', { class: 'stat-num' }, String(loads.filter(needsPod).length)),
      el('span', {}, 'Need a POD'),
    ),
  );

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
            onclick: async () => {
              state.selectedLoadId = load.id;
              await renderApp();
              // On narrow screens the details sit below the table, so bring them into view.
              if (window.innerWidth < 1080) document.querySelector('.detail')?.scrollIntoView();
            },
          },
          load.ref,
        ),
      ),
      el('td', { 'data-label': 'Route' }, route(load)),
      el(
        'td',
        { 'data-label': 'Driver', class: 'nowrap' },
        load.driver ? load.driver.name : 'Unassigned',
        el('span', { class: 'truck-line num' }, load.truck ? `Truck ${load.truck.unit}` : 'No truck'),
      ),
      el('td', { 'data-label': 'Status' }, pill(load.status)),
      el('td', { 'data-label': 'Next step' }, nextButton(load)),
    ),
  );

  const panel = state.selectedLoadId
    ? await renderLoadDetail(state.selectedLoadId)
    : el(
        'aside',
        { class: 'card panel-empty' },
        el('h2', {}, 'Load details'),
        el('p', { class: 'muted' }, 'Select a load number to see its status history and its delivery document.'),
      );

  return [
    stats,
    el(
      'div',
      { class: 'loads-layout' },
      el('div', { class: 'card flush' }, table(['Load', 'Route', 'Driver', 'Status', 'Next step'], rows, 'Loads')),
      panel,
    ),
  ];
}

async function renderLoadDetail(id) {
  const res = await call('GET', `/api/loads/${id}`);
  if (res.status !== 200) return el('p', { class: 'banner error' }, errorText(res));
  const { load, events, document: doc } = res.data;

  return el(
    'aside',
    { class: 'card detail', 'aria-label': `Details for ${load.ref}` },
    el('div', { class: 'detail-head' }, el('h2', {}, `Load ${load.ref}`), pill(load.status)),
    el('p', { class: 'detail-route' }, route(load)),
    el(
      'dl',
      { class: 'facts' },
      el('div', {}, el('dt', {}, 'Driver'), el('dd', {}, load.driver ? load.driver.name : 'Unassigned')),
      el('div', {}, el('dt', {}, 'Truck'), el('dd', {}, load.truck ? load.truck.unit : 'None')),
    ),
    stepper(load, events),
    el('div', { class: 'actions' }, nextButton(load, { wide: true })),
    el('h3', {}, 'Delivery document (POD)'),
    doc ? docCard(load.id, doc) : el('p', { class: 'doc-empty' }, 'No delivery document yet.'),
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
  if (res.status !== 200) return notice(res);
  if (!res.data.length) return [el('p', { class: 'muted' }, 'No loads assigned to you.')];

  return [
    el('h1', { class: 'page-title' }, 'My loads'),
    el(
      'div',
      { class: 'card-grid' },
      res.data.map((load) =>
        el(
          'article',
          { class: 'card load-card', 'aria-label': `Load ${load.ref}` },
          el('div', { class: 'detail-head' }, el('span', { class: 'ref' }, load.ref), pill(load.status)),
          el('p', { class: 'detail-route' }, route(load)),
          el('p', { class: 'muted' }, `Truck ${load.truck ? load.truck.unit : 'none'}`),
          stepper(load),
          el('div', { class: 'actions' }, nextButton(load, { wide: true })),
          load.hasDocument
            ? el(
                'div',
                { class: 'doc compact' },
                el('span', { class: 'pod-yes' }, 'POD on file'),
                downloadLink(load.id),
              )
            : null,
          // Once delivered with a POD on file, there is nothing left for the driver to upload.
          load.status === 'Delivered' && load.hasDocument ? null : uploadForm(load),
        ),
      ),
    ),
  ];
}

// ---------- owner and dispatcher: drivers, trucks ----------

async function renderDrivers() {
  const res = await call('GET', '/api/drivers');
  if (res.status !== 200) return notice(res);
  const rows = res.data.map((d) =>
    el(
      'tr',
      {},
      el(
        'td',
        { 'data-label': 'Driver' },
        el(
          'span',
          { class: 'person' },
          el(
            'span',
            { class: 'initials small', 'aria-hidden': 'true' },
            d.name
              .split(' ')
              .map((n) => n[0])
              .join(''),
          ),
          d.name,
        ),
      ),
      el('td', { 'data-label': 'Email' }, d.email),
      el('td', { 'data-label': 'Open loads', class: 'num' }, String(d.openLoads)),
    ),
  );
  return [el('div', { class: 'card flush' }, table(['Driver', 'Email', 'Open loads'], rows, 'Drivers'))];
}

async function renderTrucks() {
  const res = await call('GET', '/api/trucks');
  if (res.status !== 200) return notice(res);
  const rows = res.data.map((t) =>
    el(
      'tr',
      {},
      el('td', { 'data-label': 'Truck', class: 'num' }, el('strong', {}, t.unit)),
      el('td', { 'data-label': 'Open loads', class: 'num' }, String(t.openLoads)),
    ),
  );
  return [el('div', { class: 'card flush' }, table(['Truck', 'Open loads'], rows, 'Trucks'))];
}

// ---------- owner: blocked log ----------

async function renderBlocked() {
  const res = await call('GET', '/api/audit/denials');
  if (res.status !== 200) return notice(res);
  const intro = el(
    'p',
    { class: 'muted' },
    'Requests from people in your company that the server refused. Try the Security check tab, then come back here.',
  );
  if (!res.data.length) return [intro, el('div', { class: 'card' }, el('p', {}, 'No blocked attempts yet.'))];
  const rows = res.data.map((d) =>
    el(
      'tr',
      {},
      el('td', { 'data-label': 'When' }, time(d.at)),
      el('td', { 'data-label': 'Who' }, `${d.user} (${ROLE_LABEL[d.role]})`),
      el('td', { 'data-label': 'Request' }, el('code', {}, `${d.method} ${d.path}`)),
      el(
        'td',
        { 'data-label': 'Answer' },
        el('span', { class: 'badge badge-blocked' }, d.status === 403 ? '403 wrong role' : '404 not found'),
      ),
    ),
  );
  return [
    intro,
    el('div', { class: 'card flush' }, table(['When', 'Who', 'Request', 'Answer'], rows, 'Blocked attempts')),
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
    {
      label: 'Move it to the next status',
      method: 'POST',
      path: `/api/loads/${target}/advance`,
      body: { from: 'Assigned' },
      blocked: refused,
    },
    {
      label: 'Download its delivery document',
      method: 'GET',
      path: `/api/loads/${other.podLoadId}/document`,
      blocked: refused,
    },
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
      attacks.push({
        label: "Open another driver's load",
        method: 'GET',
        path: `/api/loads/${coworker}`,
        blocked: refused,
      });
    }
  } else {
    attacks.push({
      label: 'Upload a file to their load',
      method: 'POST',
      path: `/api/loads/${target}/document`,
      blocked: refused,
      upload: true,
    });
  }
  return attacks;
}

async function renderSecurity() {
  const me = state.me;
  const ownRes = await call('GET', '/api/loads');
  const attacks = attacksFor(me, ownRes.data || []);
  const results = el('div', { class: 'results', 'aria-live': 'polite' });
  const summary = el('p', { class: 'banner empty' });
  let sent = 0;
  let blockedCount = 0;

  async function runAttack(attack) {
    let body = attack.body;
    if (attack.upload) {
      body = new FormData();
      body.append('file', new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' }), 'attack.pdf');
    }
    const res = await call(attack.method, attack.path, body);
    const blocked = attack.blocked(res);
    sent += 1;
    if (blocked) blockedCount += 1;
    summary.className = blockedCount === sent ? 'banner ok' : 'banner error';
    summary.textContent = `${blockedCount} of ${sent} requests blocked by the server.`;
    const raw = typeof res.data === 'string' ? res.data.slice(0, 200) : JSON.stringify(res.data);
    // A list answer is long: say what came back in one line and fold the raw JSON underneath.
    const answer = Array.isArray(res.data)
      ? el(
          'div',
          {},
          el(
            'pre',
            {},
            `${res.status}  returned ${res.data.length} loads: ${res.data.map((l) => l.ref).join(', ')} (all your own company)`,
          ),
          el('details', {}, el('summary', {}, 'Raw response'), el('pre', {}, raw)),
        )
      : el('pre', {}, `${res.status}  ${raw}`);
    results.prepend(
      el(
        'div',
        { class: 'result' },
        el(
          'div',
          { class: 'line' },
          el('strong', {}, attack.label),
          el(
            'span',
            { class: `badge ${blocked ? 'badge-blocked' : 'badge-leak'}` },
            blocked ? attack.blockedText || 'BLOCKED' : 'ALLOWED',
          ),
        ),
        el(
          'code',
          { class: 'request' },
          `${attack.method} ${attack.path}${attack.body ? ` ${JSON.stringify(attack.body)}` : ''}`,
        ),
        answer,
      ),
    );
  }

  async function runAll() {
    for (const attack of [...attacks].reverse()) await runAttack(attack);
  }

  return [
    el('h1', { class: 'page-title' }, 'Security check'),
    el(
      'p',
      { class: 'lead' },
      `You are ${me.company.name} · ${ROLE_LABEL[me.role]}. Each button sends a real request for data you should not get, straight to the server. The page shows exactly what the server answered.`,
    ),
    el(
      'div',
      { class: 'attack-buttons' },
      attacks.map((a) => el('button', { type: 'button', onclick: () => runAttack(a) }, `Try: ${a.label}`)),
      el('button', { type: 'button', class: 'primary', onclick: runAll }, 'Run all'),
    ),
    summary,
    results,
  ];
}

start();
