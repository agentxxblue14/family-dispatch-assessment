// Builds the two fictional proof-of-delivery PDFs in seed-files/ (run once: node scripts/make-sample-pods.js).
// Written with plain PDF drawing commands so it needs no PDF library. All names are invented.
const fs = require('node:fs');
const path = require('node:path');

const PODS = [
  {
    file: 'POD-A-1002.pdf',
    company: 'Alpha Transport',
    color: [0.122, 0.373, 0.682], // navy, same as the app
    mc: 'MC 000101 (sample)',
    pod: 'POD-A-1002',
    load: 'A-1002',
    shipper: ['Lone Star Paper Supply', '4100 Industrial Blvd', 'Austin, TX 78744'],
    consignee: ['Bayou Print and Pack', '2250 Harbor Rd', 'Houston, TX 77029'],
    pickup: '10/23/2026  08:10',
    delivery: '10/23/2026  13:05',
    driver: 'Jordan Lee',
    truck: 'T-102',
    trailer: 'TR-53-07',
    seal: 'SL 448120',
    freight: [
      ['18', 'Pallets, copier paper (boxed)', '21,600', 'Good'],
      ['2', 'Pallets, packing cartons (flat)', '1,150', 'Good'],
    ],
    receiver: 'M. Alvarez',
  },
  {
    file: 'POD-B-2002.pdf',
    company: 'Beta Logistics',
    color: [0.059, 0.463, 0.431], // teal, same as the app
    mc: 'MC 000202 (sample)',
    pod: 'POD-B-2002',
    load: 'B-2002',
    shipper: ['Coastal Peach Growers Co-op', '18 River St', 'Savannah, GA 31401'],
    consignee: ['First Coast Fresh Market', '900 Bay St', 'Jacksonville, FL 32202'],
    pickup: '10/23/2026  06:40',
    delivery: '10/23/2026  10:55',
    driver: 'Ben Ward',
    truck: 'B-202',
    trailer: 'RF-48-12 (reefer, 34 F)',
    seal: 'SL 772031',
    freight: [
      ['22', 'Pallets, fresh peaches (cased)', '28,400', 'Good'],
      ['4', 'Pallets, pecans (bagged)', '3,200', 'Good'],
    ],
    receiver: 'D. Okafor',
  },
];

// ---------- tiny PDF writer ----------

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const rgb = ([r, g, b]) => `${r} ${g} ${b}`;
const INK = [0.071, 0.125, 0.184];
const MUTED = [0.275, 0.322, 0.373];
const LINE = [0.8, 0.78, 0.74];

function page(p) {
  const ops = [];
  const text = (x, y, s, { size = 10, font = 'F1', color = INK } = {}) =>
    ops.push(`BT /${font} ${size} Tf ${rgb(color)} rg ${x} ${y} Td (${esc(s)}) Tj ET`);
  const box = (x, y, w, h, { fill, stroke = LINE } = {}) => {
    if (fill) ops.push(`${rgb(fill)} rg ${x} ${y} ${w} ${h} re f`);
    if (stroke) ops.push(`${rgb(stroke)} RG 0.8 w ${x} ${y} ${w} ${h} re S`);
  };
  const label = (x, y, s) => text(x, y, s.toUpperCase(), { size: 7.5, font: 'F2', color: MUTED });

  // Watermark, drawn first so everything sits on top of it.
  ops.push('BT /F2 96 Tf 0.94 0.94 0.94 rg 0.7071 0.7071 -0.7071 0.7071 150 230 Tm (SAMPLE) Tj ET');

  // Header: company colour bar, company, title.
  box(0, 772, 612, 20, { fill: p.color, stroke: null });
  text(48, 735, p.company, { size: 20, font: 'F2' });
  text(48, 718, `${p.mc}  |  Fictional carrier for a software assessment`, { size: 8.5, color: MUTED });
  text(388, 735, 'PROOF OF DELIVERY', { size: 16, font: 'F2', color: p.color });
  text(388, 718, `${p.pod}   Load ${p.load}`, { size: 9.5, font: 'F2' });

  // Shipper and consignee.
  const party = (x, title, lines, when, whenLabel) => {
    box(x, 600, 252, 96);
    label(x + 12, 680, title);
    lines.forEach((l, i) => text(x + 12, 662 - i * 14, l, { size: i === 0 ? 11 : 10, font: i === 0 ? 'F2' : 'F1' }));
    label(x + 12, 615, whenLabel);
    text(x + 92, 615, when, { size: 10, font: 'F2' });
  };
  party(48, 'Shipper (pickup)', p.shipper, p.pickup, 'Picked up');
  party(312, 'Consignee (delivery)', p.consignee, p.delivery, 'Delivered');

  // Carrier details.
  box(48, 538, 516, 46);
  [
    ['Driver', p.driver],
    ['Truck', p.truck],
    ['Trailer', p.trailer],
    ['Seal no.', p.seal],
  ].forEach(([k, v], i) => {
    const x = 60 + i * 129;
    label(x, 568, k);
    text(x, 550, v, { size: 10, font: 'F2' });
  });

  // Freight table.
  const cols = [60, 120, 420, 500];
  box(48, 494, 516, 24, { fill: [0.96, 0.95, 0.93] });
  ['Pieces', 'Description', 'Weight (lb)', 'Condition'].forEach((h, i) => label(cols[i], 503, h));
  p.freight.forEach((row, r) => {
    const y = 470 - r * 24; // each row sits directly under the one above
    box(48, y, 516, 24, { stroke: LINE });
    row.forEach((cell, i) => text(cols[i], y + 8, cell, { size: 10 }));
  });
  const total = p.freight.reduce((sum, row) => sum + Number(row[2].replace(/,/g, '')), 0).toLocaleString('en-US');
  text(330, 424, 'Total weight', { size: 10, font: 'F2' });
  text(420, 424, `${total} lb`, { size: 10, font: 'F2' });

  // Exceptions.
  label(48, 370, 'Exceptions (shortage, damage, refused)');
  box(48, 344, 10, 10, { stroke: INK });
  text(50, 346, 'X', { size: 9, font: 'F2' });
  text(66, 346, 'None. Received in good order, count and condition as listed above.', { size: 10 });

  // Signatures.
  const sign = (x, title, name, signature) => {
    label(x, 300, title);
    text(x, 262, signature, { size: 18, font: 'F3', color: [0.12, 0.2, 0.45] });
    ops.push(`${rgb(INK)} RG 0.8 w ${x} 255 m ${x + 230} 255 l S`);
    text(x, 241, `${name}   ${p.delivery}`, { size: 9, color: MUTED });
  };
  sign(48, 'Received by (consignee)', p.receiver, p.receiver);
  sign(334, 'Delivered by (driver)', p.driver, p.driver);

  // Footer.
  ops.push(`${rgb(LINE)} RG 0.8 w 48 96 m 564 96 l S`);
  text(48, 80, 'Fictional sample document created for a software assessment. Not a real shipment, company or person.', {
    size: 8,
    color: MUTED,
  });
  text(48, 68, `Attached to load ${p.load} in the Family Dispatch prototype.`, { size: 8, color: MUTED });
  return ops.join('\n');
}

function pdf(content, title) {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>',
    `<< /Title (${esc(title)}) /Producer (Family Dispatch prototype sample generator) >>`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${objs.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

for (const p of PODS) {
  const file = path.join(__dirname, '..', 'seed-files', p.file);
  fs.writeFileSync(file, pdf(page(p), `Proof of delivery ${p.pod} (sample)`), 'latin1');
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
