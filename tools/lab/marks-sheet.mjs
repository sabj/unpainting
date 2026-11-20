#!/usr/bin/env node
// The marks test sheet: every mark of the vocabulary (src/paint/methods/marks.mjs) laid by the section brush on the
// painter's paper, flowed and dried by the sheet, at three sizes, labelled; and markFor's choice for a few shapes.
//   node tools/lab/marks-sheet.mjs --out <file.jpg> [--mm 0.1]
import path from 'node:path';
import sharp from 'sharp';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, step, dry, layersOf, DEFAULTS } from '../../src/media/sheet.mjs';
import { createBrush, dip, stroke } from '../../src/media/brush.mjs';
import { renderLayers } from '../../src/media/km.mjs';
import { BOX, boxPigment } from '../../src/crop/box.mjs';
import { physicsFields } from '../../src/media/pigment-physical.mjs';
import * as M from '../../src/paint/methods/marks.mjs';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(arg('out', 'marks.jpg')), MM = Number(arg('mm', '0.1')), PX = 12;
const PHYSICS = { ...DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, granFill: 0, slideCap: 1 };
const pigments = ['ultramarine', 'sienna'].map(k => { const paint = BOX.find(p => p.key === k); return { ...boxPigment(paint), ...physicsFields(paint.physics), key: k }; });
const PAPER_RGB = [246, 245, 239];
const paperOptions = mm => ({ seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, mmPerCell: mm, coldPress: { mmPerCell: mm, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } });

// 3 sizes of one mark side by side, each on a sheet about 22 x 30 mm, larger for the largest size
const SIZES = [0.5, 1, 2], CELL = 30;
const MARKS = {
  sweep: (x, y, s) => [M.sweep([x - 9 * s, y], [x + 9 * s, y], 5 * s, { flat: true })],
  taper: (x, y, s) => [M.taper([[x - 9 * s, y + 3 * s], [x, y - 2 * s], [x + 9 * s, y + 1 * s]], 2.5 * s)],
  leaf: (x, y, s) => [M.leaf(x, y, -0.6, 8 * s, 3 * s)],
  comma: (x, y, s) => [M.comma(x - 3 * s, y - 3 * s, 0.4, 9 * s, 2.5 * s)],
  line: (x, y, s) => [M.line([[x - 10 * s, y + 2 * s], [x + 10 * s, y - 2 * s]], 0.5 * s)],
  edge: (x, y, s) => [M.edge([[x - 10 * s, y - 3 * s], [x + 10 * s, y + 3 * s]], 0.4 * s)],
  wedge: (x, y, s) => [M.wedge(x, y, 0.2, 4 * s, 6 * s)],
  push: (x, y, s) => [M.push([[x - 7 * s, y], [x + 7 * s, y - 1 * s]], 3 * s)],
  twist: (x, y, s) => [M.twist([[x - 10 * s, y + 2 * s], [x, y - 2 * s], [x + 10 * s, y + 2 * s]], 5 * s)],
  drag: (x, y, s) => [M.drag([[x - 10 * s, y], [x + 10 * s, y + 1 * s]], 4 * s)],
  dot: (x, y, s) => [M.dot(x - 3 * s, y, 1.5 * s), M.dot(x + 3 * s, y + 1 * s, 1.2 * s, { seed: 2 })],
  contour: (x, y, s) => [M.contour(Array.from({ length: 13 }, (_, k) => { const a = Math.PI * (1.1 + 0.8 * k / 12); return [x + 9 * s * Math.cos(a), y + 6 * s + 9 * s * Math.sin(a)]; }).reverse(), 2.5 * s)],
  scumble: (x, y, s) => M.scumble(x, y, 14 * s, 2 * s, { seed: 5 }),
};

// each mark at each size on its own small sheet (a sheet the size of the whole page flowed every few steps is far too slow)
const names = Object.keys(MARKS), cellMm = s => CELL * Math.max(1, s) * 0.75;
const lay = (sheet, st, colour) => {
  const b = createBrush({ model: 'section', flat: !!st.flat, ...(st.angle != null ? { bladeAngle: st.angle } : {}), radius: st.radiusMm / MM, bristles: Math.max(12, Math.ceil(st.radiusMm / MM * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, seed: 41 });
  const load = st.charge ?? 1; dip(b, { water: st.dry ? 0.35 : 1, conc: colour.map(c => c * load) });
  let k = 0; stroke(b, sheet, st.points.map(q => ({ x: q[0] / MM, y: q[1] / MM, p: q[2], ...(q[3] ? { v: q[3] } : {}), r: st.radiusMm / MM * (q[4] ?? 1) })), { between: () => { if (++k % 8 === 0) step(sheet, PHYSICS); } });
};
async function panel(name, s) {
  const wmm = cellMm(s), hmm = CELL * 1.5 * Math.max(1, s) / 1.5, w = Math.round(wmm / MM), h = Math.round(hmm / MM);
  const paper = makePaper(w, h, paperOptions(MM)), sheet = createSheet(paper, pigments);
  for (const st of MARKS[name](wmm / 2, hmm / 2, s)) lay(sheet, st, [2.5, 0.8]);
  dry(sheet, 30000, PHYSICS, { levelMax: 140, dt: 14 });
  const n = w * h, base = Buffer.alloc(n * 3); for (let i = 0; i < n; i++) { const t = 0.96 + 0.04 * paper.height[i]; for (let c = 0; c < 3; c++) base[i * 3 + c] = Math.round(PAPER_RGB[c] * t); }
  const rgb = Buffer.from(renderLayers(layersOf(sheet), pigments, base, n));
  return { img: await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).resize(Math.round(wmm * PX), Math.round(hmm * PX), { kernel: 'lanczos3' }).png().toBuffer(), w: Math.round(wmm * PX), h: Math.round(hmm * PX) };
}
const HEAD = 30, GAP = 12, comps = [], labels = [];
let y = 0, W = 0, colX = 0, rowH0 = 0;
for (const [mi, name] of names.entries()) {
  const col = mi % 2; if (col === 0) { colX = GAP; } 
  labels.push({ x: colX, y: y + 22, text: `${name}: ${M.MARKS[name]}` });
  let x = colX, rowH = 0;
  for (const s of SIZES) { const p = await panel(name, s); comps.push({ input: p.img, left: x, top: y + HEAD }); x += p.w + GAP; rowH = Math.max(rowH, p.h); }
  W = Math.max(W, x); rowH0 = Math.max(rowH0, rowH); colX = x + 3 * GAP;
  if (col === 1 || mi === names.length - 1) { y += HEAD + rowH0 + GAP; rowH0 = 0; }
  console.log(name);
}
const H = y;
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${labels.map(l => `<text x="${l.x}" y="${l.y}" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#333">${esc(l.text)}</text>`).join('')}</svg>`;
await sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } } }).composite([...comps, { input: Buffer.from(svg), left: 0, top: 0 }]).jpeg({ quality: 88 }).toFile(OUT);
console.log(`${OUT}: ${W}x${H}, ${names.length} marks at ${SIZES.length} sizes, ${MM} mm cells`);
