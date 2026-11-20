// A prepared drawing's exact vector pen (tools/seg/ink-vectors.py: STEM-vectors.json, beside its ordered line file
// STEM-lines.json) cut to a window of its sheet, for a crop: the SAME strokes, those that reach into the window, moved to
// its origin, in the same order; never traced again. The line file is cut the same way (in the drawing's pixels) and
// both are stamped with the crop image's hash, so the painter accepts them for the crop. Fails loudly when either file
// is missing.
//
//   node tools/painter/pen-crop.mjs STEM X Y W H CROP_IMAGE OUT_STEM     (X Y W H in sheet mm)
import fs from 'node:fs';
import crypto from 'node:crypto';

/** The vector doc cut to the window: strokes whose outline reaches into it, moved; seq renumbered in order. */
export function cropVectors(doc, x, y, w, h) {
  const box = P => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [a, b] of P) { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, a); y1 = Math.max(y1, b); } return { x0, y0, x1, y1 }; };
  const mv = P => P.map(([a, b]) => [+(a - x).toFixed(3), +(b - y).toFixed(3)]);
  const kept = doc.strokes.filter(s => { const b = box(s.outline.flat()); return b.x1 >= x && b.x0 <= x + w && b.y1 >= y && b.y0 <= y + h; })
    .sort((a, b) => a.seq - b.seq).map((s, i) => ({ ...s, seq: i, outline: s.outline.map(mv), path: mv(s.path) }));
  const px = doc.drawing.w / doc.sheetMm;
  return { ...doc, sheetMm: w, heightMm: h, drawing: { w: Math.round(w * px), h: Math.round(h * px) }, cropOf: { x, y, w, h, sheetMm: doc.sheetMm }, strokes: kept };
}

/** The ordered line file cut to the same window (its points are the drawing's pixels): lines reaching in, moved. */
export function cropLines(doc, x, y, w, h, sheetMm) {
  const px = doc.image.w / sheetMm, X = x * px, Y = y * px, X1 = (x + w) * px, Y1 = (y + h) * px;
  const lines = doc.lines.filter(l => l.points.some(([a, b]) => a >= X && a <= X1 && b >= Y && b <= Y1))
    .map(l => ({ ...l, points: l.points.map(([a, b]) => [+(a - X).toFixed(3), +(b - Y).toFixed(3)]) }));
  return { ...doc, image: { w: Math.round(w * px), h: Math.round(h * px) }, cropOf: { x, y, w, h, sheetMm }, lines };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [stem, xs, ys, ws, hs, image, out] = process.argv.slice(2), [x, y, w, h] = [xs, ys, ws, hs].map(Number);
  const vf = `${stem}-vectors.json`, lf = `${stem}-lines.json`;
  for (const f of [vf, lf]) if (!fs.existsSync(f)) { console.error(`pen-crop: no ${f}: the exact vector pen is required (make it with tools/seg/ink-vectors.py); refusing to crop`); process.exit(2); }
  const sha = crypto.createHash('sha256').update(fs.readFileSync(image)).digest('hex');
  const V = JSON.parse(fs.readFileSync(vf, 'utf8')), L = JSON.parse(fs.readFileSync(lf, 'utf8'));
  const v = { ...cropVectors(V, x, y, w, h), targetSHA256: sha }, l = { ...cropLines(L, x, y, w, h, V.sheetMm), targetSHA256: sha };
  fs.writeFileSync(`${out}-vectors.json`, JSON.stringify(v)); fs.writeFileSync(`${out}-lines.json`, JSON.stringify(l));
  console.log(`pen: ${v.strokes.length} vector strokes (of ${V.strokes.length}), ${l.lines.length} lines, cut to ${w} x ${h} mm at ${x}, ${y}`);
}
