// Overview tab (owner and dispatcher): one screen that answers the daily dispatch questions.
// How many loads are where? Who is carrying what? Which deliveries still need a POD?
//
// It only reads the same company-scoped API the other tabs use (loads, drivers, trucks and, for
// the owner, the blocked log), so it cannot show anything the user could not already see.
// Charts are plain SVG, so no chart library and no outside requests.
import { el, svg, countUp } from './dom.js';

const STATUSES = ['Assigned', 'Picked Up', 'Delivered'];
const KEY = { Assigned: 'assigned', 'Picked Up': 'picked-up', Delivered: 'delivered' };

// deps: { me, call, openLoad(id), pill(status), route(load), errorText(res) } from app.js
export async function renderOverview(deps) {
  const { me, call } = deps;
  const requests = [call('GET', '/api/loads'), call('GET', '/api/drivers'), call('GET', '/api/trucks')];
  if (me.role === 'owner') requests.push(call('GET', '/api/audit/denials'));
  const [loadsRes, driversRes, trucksRes, denialsRes] = await Promise.all(requests);
  const failed = [loadsRes, driversRes, trucksRes].find((r) => r.status !== 200);
  if (failed) return [el('p', { class: 'banner error' }, deps.errorText(failed))];

  const loads = loadsRes.data;
  const drivers = driversRes.data;
  const trucks = trucksRes.data;
  const count = (status) => loads.filter((l) => l.status === status).length;
  const needsPod = loads.filter((l) => l.status === 'Picked Up' && !l.hasDocument);

  // The table and the status chart share one filter, so clicking a bar filters the table.
  const filter = { status: 'All', text: '' };
  const tableBody = el('tbody');
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by status' });
  const search = el('input', {
    type: 'search',
    class: 'search',
    placeholder: 'Search load, city or driver',
    'aria-label': 'Search loads',
  });
  search.addEventListener('input', () => {
    filter.text = search.value.trim().toLowerCase();
    drawTable();
  });

  function pickStatus(status) {
    filter.status = status;
    drawTable();
    tableBody.closest('.card')?.scrollIntoView({ block: 'nearest' });
  }

  function drawTable() {
    chips.replaceChildren(
      ...['All', ...STATUSES].map((s) =>
        el(
          'button',
          {
            type: 'button',
            class: 'chip-filter',
            'aria-pressed': String(filter.status === s),
            onclick: () => pickStatus(s),
          },
          s === 'All' ? `All ${loads.length}` : `${s} ${count(s)}`,
        ),
      ),
    );
    const shown = loads.filter((l) => {
      const haystack = `${l.ref} ${l.origin} ${l.destination} ${l.driver ? l.driver.name : ''}`.toLowerCase();
      return (filter.status === 'All' || l.status === filter.status) && haystack.includes(filter.text);
    });
    tableBody.replaceChildren(
      ...(shown.length
        ? shown.map((l) =>
            el(
              'tr',
              { class: 'row-in' },
              el(
                'td',
                { 'data-label': 'Load' },
                el(
                  'button',
                  {
                    type: 'button',
                    class: 'ref',
                    'aria-label': `Open ${l.ref} on the Loads tab`,
                    onclick: () => deps.openLoad(l.id),
                  },
                  l.ref,
                ),
              ),
              el('td', { 'data-label': 'Route' }, deps.route(l)),
              el('td', { 'data-label': 'Driver', class: 'nowrap' }, l.driver ? l.driver.name : 'Unassigned'),
              el('td', { 'data-label': 'Status' }, deps.pill(l.status)),
              el(
                'td',
                { 'data-label': 'POD' },
                l.hasDocument ? el('span', { class: 'pod-yes' }, 'On file') : el('span', { class: 'muted' }, 'None'),
              ),
            ),
          )
        : [el('tr', {}, el('td', { colspan: '5', class: 'muted' }, 'No loads match this filter.'))]),
    );
  }
  drawTable();

  const tiles = [
    tile('Loads', loads.length, `${trucks.filter((t) => t.openLoads > 0).length} of ${trucks.length} trucks in use`),
    tile('In transit', count('Picked Up'), 'Picked up, not yet delivered'),
    tile('Delivered', count('Delivered'), `${count('Assigned')} still waiting for pickup`),
    tile(
      'Need a POD',
      needsPod.length,
      needsPod.length ? needsPod.map((l) => l.ref).join(', ') : 'All paperwork on file',
      needsPod.length > 0,
    ),
  ];
  if (denialsRes && denialsRes.status === 200) {
    tiles.push(tile('Blocked attempts', denialsRes.data.length, 'Refused by the server (see Blocked log)', false));
  }

  return [
    el(
      'div',
      { class: 'overview-head' },
      el('h1', { class: 'page-title' }, 'Overview'),
      el(
        'p',
        { class: 'muted' },
        `${me.company.name} only. Every number comes from the same company-scoped API as the other tabs.`,
      ),
    ),
    el('div', { class: 'kpis' }, tiles),
    el(
      'div',
      { class: 'charts' },
      panel('Loads by status', 'Click a bar to filter the table below.', statusChart(loads, pickStatus)),
      panel('Workload by driver', 'Every load assigned to each driver, by status.', driverChart(drivers, loads)),
      panel('Proof of delivery', 'Delivered loads with a POD on file.', podChart(loads, needsPod, deps.openLoad)),
    ),
    el(
      'div',
      { class: 'card flush' },
      el('div', { class: 'table-tools' }, el('h2', {}, 'All loads'), chips, search),
      el(
        'div',
        { class: 'table-wrap' },
        el(
          'table',
          { class: 'responsive', 'aria-label': 'All loads' },
          el(
            'thead',
            {},
            el(
              'tr',
              {},
              ['Load', 'Route', 'Driver', 'Status', 'POD'].map((h) => el('th', { scope: 'col' }, h)),
            ),
          ),
          tableBody,
        ),
      ),
    ),
  ];
}

// ---------- pieces ----------

function tile(label, value, note, warn = false) {
  const num = el('span', { class: 'kpi-num' }, '0');
  countUp(num, value);
  return el(
    'div',
    { class: `kpi${warn ? ' kpi-warn' : ''}` },
    el('span', { class: 'kpi-label' }, label),
    num,
    el('span', { class: 'kpi-note' }, note),
  );
}

function panel(title, note, chart) {
  return el(
    'section',
    { class: 'card chart-card' },
    el('h2', {}, title),
    el('p', { class: 'muted small' }, note),
    chart,
  );
}

// Horizontal bars, one per status. Each bar grows in (CSS) with a short stagger.
function statusChart(loads, onPick) {
  const max = Math.max(1, loads.length);
  const rowH = 38;
  return svg(
    'svg',
    { viewBox: `0 0 320 ${STATUSES.length * rowH}`, class: 'chart', role: 'img', 'aria-label': 'Loads by status' },
    STATUSES.map((status, i) => {
      const n = loads.filter((l) => l.status === status).length;
      const w = Math.max(n ? 6 : 0, (n / max) * 190);
      const y = i * rowH + 8;
      const pick = () => onPick(status);
      return svg(
        'g',
        {
          class: 'bar-row',
          tabindex: '0',
          role: 'button',
          'aria-label': `${n} ${status}. Filter the table to ${status}.`,
          onclick: pick,
          onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick()),
        },
        svg('text', { x: 0, y: y + 13, class: 'chart-label' }, status),
        svg('rect', { x: 86, y, width: 190, height: 18, rx: 4, class: 'track' }),
        svg('rect', {
          x: 86,
          y,
          width: w,
          height: 18,
          rx: 4,
          class: `bar bar-${KEY[status]} grow`,
          style: `animation-delay: ${i * 90}ms`,
        }),
        svg('text', { x: 286, y: y + 13, class: 'chart-value' }, String(n)),
      );
    }),
  );
}

// One stacked bar per driver: Assigned, Picked Up and Delivered segments.
function driverChart(drivers, loads) {
  const rows = drivers.map((d) => ({
    name: d.name,
    parts: STATUSES.map((s) => loads.filter((l) => l.driver && l.driver.id === d.id && l.status === s).length),
  }));
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((a, b) => a + b, 0)));
  const rowH = 38;
  const chart = svg(
    'svg',
    {
      viewBox: `0 0 320 ${Math.max(1, rows.length) * rowH}`,
      class: 'chart',
      role: 'img',
      'aria-label': 'Workload by driver',
    },
    rows.map((r, i) => {
      const y = i * rowH + 8;
      let x = 96;
      const total = r.parts.reduce((a, b) => a + b, 0);
      const segments = r.parts.map((n, j) => {
        const w = (n / max) * 180;
        const seg = n
          ? svg('rect', {
              x,
              y,
              width: w,
              height: 18,
              class: `bar bar-${KEY[STATUSES[j]]} grow`,
              style: `animation-delay: ${i * 90 + j * 60}ms`,
            })
          : null;
        x += w;
        return seg;
      });
      return svg(
        'g',
        {},
        svg('title', {}, `${r.name}: ${r.parts.map((n, j) => `${n} ${STATUSES[j]}`).join(', ')}`),
        svg('text', { x: 0, y: y + 13, class: 'chart-label' }, r.name),
        segments,
        svg('text', { x: x + 8, y: y + 13, class: 'chart-value' }, `${total}`),
      );
    }),
  );
  const legend = el(
    'div',
    { class: 'legend' },
    STATUSES.map((s) => el('span', {}, el('span', { class: `swatch bar-${KEY[s]}`, 'aria-hidden': 'true' }), s)),
  );
  return el('div', {}, chart, legend);
}

// A ring that draws itself to the share of delivered loads with a POD, plus what is still missing.
function podChart(loads, needsPod, openLoad) {
  const delivered = loads.filter((l) => l.status === 'Delivered');
  const withPod = delivered.filter((l) => l.hasDocument).length;
  const share = delivered.length ? withPod / delivered.length : 1;
  const r = 42;
  const full = 2 * Math.PI * r;
  const ring = svg(
    'svg',
    {
      viewBox: '0 0 110 110',
      class: 'ring',
      role: 'img',
      'aria-label': `${withPod} of ${delivered.length} delivered loads have a POD`,
    },
    svg('circle', { cx: 55, cy: 55, r, class: 'ring-track' }),
    svg('circle', {
      cx: 55,
      cy: 55,
      r,
      class: 'ring-value draw',
      'stroke-dasharray': `${full}`,
      'stroke-dashoffset': `${full * (1 - share)}`,
      style: `--full: ${full}`,
      transform: 'rotate(-90 55 55)',
    }),
    svg('text', { x: 55, y: 53, class: 'ring-num' }, `${Math.round(share * 100)}%`),
    svg('text', { x: 55, y: 70, class: 'ring-sub' }, `${withPod} of ${delivered.length}`),
  );
  const waiting = needsPod.length
    ? el(
        'div',
        { class: 'waiting' },
        el('strong', {}, 'Waiting for a POD'),
        el(
          'ul',
          {},
          needsPod.map((l) =>
            el(
              'li',
              {},
              el('button', { type: 'button', class: 'link', onclick: () => openLoad(l.id) }, l.ref),
              ` ${l.origin} to ${l.destination}`,
            ),
          ),
        ),
        el('small', { class: 'muted' }, 'A load cannot be marked Delivered until its POD is uploaded.'),
      )
    : el('p', { class: 'muted' }, 'No load is waiting for paperwork.');
  return el('div', { class: 'pod-panel' }, ring, waiting);
}
