#!/usr/bin/env node
// Pipeline: inking, stage 3c. Puts a fitted drawing's vector strokes in the order a person draws them: the big forms of the
// whole sheet first, then each form's structure, then detail, then texture and tone last (src/paint/methods/form-order.mjs).
// Each stroke gets `play` (its place in the replay) and `pass` (1 construction .. 6 accents); seq, the order the ink is
// laid in, is kept, so the fit's own strokes are laid as before (a line may be played from its other end). An ink drawing's
// mass that no line of its own places gets a light pencil lay-in: graphite strokes (medium 'graphite', piece 'layin', seq
// before the ink, pass 1) added to the strokes, the document marked `layin: 'graphite'`; made again on every run.
// usage: node tools/seg/form-order.mjs IN-vectors.json OUT-vectors.json [--things LABELS.json] [--regions LABELMAP.png] [--from ORDERED.json] [--layin 0|keep]
// --from: IN was laid by a hand (pen-physics.mjs) from a fit already ordered (ORDERED): its strokes take their lines' order.
// --things: the subject's named things (thing labels: kind and box as fractions of the picture); a portrait is then placed
// feature by feature. --regions: the subject's object regions as a label map (one grey level per region, the picture's
// aspect; the segmentation's <stem>.png); a line along a region's edge bounds a form. Prints the count per pass.
import fs from 'node:fs';
import sharp from 'sharp';
import { formOrder, carryOrder, PASS_NAMES } from '../../src/paint/methods/form-order.mjs';

const [inFile, outFile, ...rest] = process.argv.slice(2);
if (!inFile || !outFile) { console.error('usage: form-order.mjs IN-vectors.json OUT-vectors.json [--things LABELS.json] [--regions LABELMAP.png] [--from ORDERED.json]'); process.exit(2); }
const arg = k => (rest.includes(k) ? rest[rest.indexOf(k) + 1] : null);
const doc = JSON.parse(fs.readFileSync(inFile, 'utf8')), W = doc.sheetMm, H = doc.heightMm;
if (!(W > 0 && H > 0) || !Array.isArray(doc.strokes)) { console.error(`${inFile}: not a vectors document (sheetMm, heightMm, strokes)`); process.exit(2); }
if (arg('--from')) {
  const ordered = JSON.parse(fs.readFileSync(arg('--from'), 'utf8'));
  if (!ordered.strokes?.every(s => s.play != null)) { console.error(`--from ${arg('--from')}: its strokes have no play order (run form-order.mjs on it first)`); process.exit(2); }
  const r = carryOrder(doc, ordered.strokes);
  fs.writeFileSync(outFile, JSON.stringify({ ...r, order: ordered.order }) + '\n');
  console.log(JSON.stringify({ strokes: r.strokes.length, carriedFrom: arg('--from'), unplaced: r.strokes.filter(s => s.play == null).length }));
  process.exit(0);
}
const things = arg('--things') ? (JSON.parse(fs.readFileSync(arg('--things'), 'utf8')).things ?? []).filter(t => Array.isArray(t.box) && t.box.length === 4).map(t => { const f = Math.max(...t.box) > 1.5 ? 1000 : 1, b = t.box.map(v => v / f); return { name: t.name ?? t.thing, kind: t.kind, box: [Math.min(b[0], b[2]) * W, Math.min(b[1], b[3]) * H, Math.max(b[0], b[2]) * W, Math.max(b[1], b[3]) * H] }; }) : null;
let regionAt = null;
if (arg('--regions')) {
  const { data, info } = await sharp(arg('--regions')).greyscale().raw().toBuffer({ resolveWithObject: true });
  if (Math.abs(info.width / info.height - W / H) > 0.02) { console.error(`--regions: the label map is ${info.width}x${info.height}, not the sheet's aspect (${W.toFixed(1)} by ${H.toFixed(1)} mm)`); process.exit(2); }
  const sx = info.width / W, sy = info.height / H;
  regionAt = (x, y) => { const i = Math.floor(x * sx), j = Math.floor(y * sy); return i >= 0 && j >= 0 && i < info.width && j < info.height ? data[j * info.width + i] : 0; };
}
// --layin 0: no pencil lay-in (a drawing whose artist's own line is to be kept as it is: an old master's)
// --layin keep: the document's own lay-in strokes (a plate already laid with them) kept and played first, none made again
const r = formOrder(doc, { things, regionAt, opts: arg('--layin') === '0' ? { layinCover: 0 } : arg('--layin') === 'keep' ? { keepLayin: true } : {} });
const { layin: _l, ...rest0 } = doc, layins = r.strokes.filter(s => s.piece === 'layin').length;
fs.writeFileSync(outFile, JSON.stringify({ ...rest0, order: 'form passes: construction, structure, detail, shading, texture, accents (form-order.mjs)', ...(layins ? { layin: 'graphite' } : {}), strokes: r.strokes }) + '\n');
const count = [1, 2, 3, 4, 5, 6].map(p => r.strokes.filter(s => s.pass === p).length);
console.log(JSON.stringify({ strokes: r.strokes.length, centre: r.centre.map(v => +v.toFixed(1)), portrait: r.portrait, pencilLayin: layins, ...Object.fromEntries(count.map((n, k) => [PASS_NAMES[k + 1], n])) }));
