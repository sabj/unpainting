#!/usr/bin/env node
// Run a stroke plan (docs/plan-format.md) on a fresh sheet and write the dried result.
//   node tools/run-plan.mjs examples/plans/graded-wash.json [--out work/plan-graded-wash]
// Each command is executed in order: a stroke dips a brush with the stated water and pigment and drags it along its
// paths; a dry dries the whole sheet and fixes the layer. Text fields (title, caption, criteria) are ignored.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { admitStrokePlan, printGate } from './stroke-gate.mjs';
import { makePaper } from '../src/media/paper.mjs';
import { createSheet, step, dry, layersOf, DEFAULTS } from '../src/media/sheet.mjs';
import { createBrush, dip, stroke, candidateContact } from '../src/media/brush.mjs';
import { measurePaper } from '../src/paint/methods/wetdry.mjs';
import { renderLayers } from '../src/media/km.mjs';
import { BOX, boxPigment } from '../src/crop/box.mjs';

const STEP_EVERY = 8; // sheet physics steps once per this many brush samples
const DRY_OPTIONS = { levelMax: 140, dt: 14 };
const WET_SHARE = 0.7; // share of contact cells that must be moist for requiredPaper 'wet'

const fail = m => { console.error(`run-plan: ${m}`); process.exit(1); };
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
if (!file) fail('usage: node tools/run-plan.mjs <plan.json> [--out <dir>]');
const outIdx = args.indexOf('--out');
const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
const out = path.resolve(outIdx >= 0 ? args[outIdx + 1] : `work/plan-${plan.id ?? path.basename(file, '.json')}`);

function validate(p) {
  const g = p.grid;
  if (!g || !(g.w > 0 && g.h > 0 && g.mmPerCell > 0)) fail('grid {w,h,mmPerCell} required');
  if (!Array.isArray(p.palette) || !p.palette.length) fail('palette of BOX pigment keys required');
  for (const k of p.palette) if (!BOX.some(b => b.key === k)) fail(`unknown pigment ${k}; see src/crop/box.mjs`);
  if (!Array.isArray(p.commands) || !p.commands.length) fail('commands required');
  for (const c of p.commands) {
    if (c.operation === 'dry') continue;
    if (c.operation !== 'stroke') fail(`unsupported operation ${c.operation} in ${c.id}`);
    if (!['flat', 'round'].includes(c.brush?.kind) || !(c.brush.widthMm > 0)) fail(`brush {kind,widthMm} required in ${c.id}`);
    if (!(c.load?.capacityMm3 > 0) || !(c.load.waterQuantityMm3 >= 0) || c.load.waterQuantityMm3 > c.load.capacityMm3) fail(`load out of range in ${c.id}`);
    for (const k of Object.keys(c.load.concentration ?? {})) if (!p.palette.includes(k)) fail(`${c.id} uses ${k}, not in the palette`);
    if (!Array.isArray(c.paths) || !c.paths.every(ps => Array.isArray(ps) && ps.length >= 2)) fail(`paths need two or more points in ${c.id}`);
  }
}

function brushFor(c, g, seed) {
  const b = c.brush;
  return createBrush({
    flat: b.kind === 'flat', radius: b.widthMm / 2 / g.mmPerCell, bristles: 24,
    loadWater: c.load.capacityMm3 / g.mmPerCell ** 2, belly: 12, give: 0.9,
    feed: b.feed ?? 0.4, free: b.free ?? 0.4, film: b.film ?? 0.25, wetMix: b.wetMix ?? 0.85,
    splay: 0.03, stiffness: Math.max(1, Math.round(3 / g.mmPerCell)), bridge: 0.98, bridgeSoft: 3,
    seed: seed + parseInt(crypto.createHash('sha256').update(c.id).digest('hex').slice(0, 7), 16),
  });
}

function checkFiniteSheet(command) {
  const fields = [['W', sheet.W], ['s', sheet.s], ...['G', 'P', 'D'].flatMap(name => sheet[name].map((values, k) => [`${name}[${k}]`, values]))];
  for (const [name, values] of fields) {
    const bad = values.findIndex(value => !Number.isFinite(value));
    if (bad >= 0) fail(`${command}: non-finite sheet field ${name} at cell ${bad}`);
  }
}

validate(plan);
const gateModeIdx = args.indexOf('--stroke-gate');
const gateConfigIdx = args.indexOf('--stroke-gate-config');
const strokeGate = admitStrokePlan(plan, {
  mode: gateModeIdx >= 0 ? args[gateModeIdx + 1] : 'warn',
  config: gateConfigIdx >= 0 ? JSON.parse(fs.readFileSync(args[gateConfigIdx + 1], 'utf8')) : {},
});
printGate(strokeGate);
if (!strokeGate.ok) fail('stroke-size admission refused; use larger connected washes and fewer fine marks');
const g = plan.grid, n = g.w * g.h;
const pigments = plan.palette.map(k => ({ ...boxPigment(BOX.find(p => p.key === k)), key: k }));
const paper = makePaper(g.w, g.h, { ...plan.paper, seed: plan.paperSeed ?? 1, mmPerCell: g.mmPerCell,
  coldPress: plan.paper?.coldPress ? { ...plan.paper.coldPress, mmPerCell: g.mmPerCell } : undefined });
const sheet = createSheet(paper, pigments);
const paperRGB = Buffer.alloc(n * 3);
const [pr, pg, pb] = plan.paperRGB ?? [246, 245, 239];
for (let i = 0; i < n; i++) { paperRGB[i * 3] = pr; paperRGB[i * 3 + 1] = pg; paperRGB[i * 3 + 2] = pb; }

const t0 = Date.now();
let strokes = 0;
for (const c of plan.commands) {
  if (c.operation === 'dry') { dry(sheet, 30000, DEFAULTS, DRY_OPTIONS); checkFiniteSheet(c.id); console.log(`${c.id}: dried`); continue; }
  const brush = brushFor(c, g, plan.paperSeed ?? 1);
  dip(brush, { water: c.load.waterQuantityMm3 / c.load.capacityMm3, conc: plan.palette.map(k => c.load.concentration?.[k] ?? 0) });
  const upright = c.brush.orientation === 'sweep' ? 'sweep' : false;
  const paths = c.paths.map(ps => ps.map(q => ({ x: q.x * g.w, y: q.y * g.h, p: q.p, r: (q.rMm ?? c.brush.widthMm / 2) / g.mmPerCell })));
  const cells = [...new Set(paths.flatMap(pts => candidateContact(brush, sheet, pts, { upright }).cells))];
  const before = measurePaper(sheet, cells);
  const paperOk = c.requiredPaper === 'dry' ? before.dry : c.requiredPaper === 'wet' ? before.moistShare >= WET_SHARE : true;
  if (!paperOk) console.warn(`${c.id}: wanted ${c.requiredPaper} paper, found moist share ${before.moistShare.toFixed(2)}`);
  let samples = 0;
  sheet.wetting = c.role === 'clean-water';
  for (const pts of paths) {
    stroke(brush, sheet, pts, { upright, between: () => { if (++samples % STEP_EVERY === 0) step(sheet, DEFAULTS); } });
    strokes++;
  }
  sheet.wetting = false;
  checkFiniteSheet(c.id);
  console.log(`${c.id}: ${c.paths.length} path(s), ${c.role ?? 'paint'}`);
}
if (plan.commands.at(-1)?.operation !== 'dry') dry(sheet, 30000, DEFAULTS, DRY_OPTIONS);

checkFiniteSheet('final drying');
fs.mkdirSync(out, { recursive: true });
const rgb = renderLayers(layersOf(sheet), pigments, paperRGB, n);
const png = path.join(out, 'result.png');
await sharp(Buffer.from(rgb), { raw: { width: g.w, height: g.h, channels: 3 } }).png().toFile(png);
fs.writeFileSync(path.join(out, 'run.json'), JSON.stringify({ plan: path.resolve(file), strokes, strokeGate, seconds: (Date.now() - t0) / 1000 }, null, 2));
console.log(png);
