#!/usr/bin/env node
// Extracts a compact stroke list from a painter run's mark tape, for the README cheat demo's cheat #2. Run where the
// tape is (marks.json is tens of MB and is not kept in the repo):
//   node tools/readme/extract-strokes.mjs <run>/marks.json <out>/strokes.json.gz
//
// Output (gzipped JSON): { w, h, unit, strokes }, with w and h in sheet cells and every stroke, brush ('s') and pen
// ('P') alike, in tape order as [frame, kind, radius, x0, y0, x1, y1, ...]. `frame` is the saved frame the stroke was
// laid before (from the tape's 'm' markers), `kind` is 0 for a round brush, 1 for a pen and 2 for a flat brush, and
// radius and points are in `unit` cells. Points are subsampled: a point closer than a third of the radius (at least one
// cell) to the last one kept is dropped, and each stroke keeps its last point. A brush stroke's radius is the median of
// its points' own radii when the path carries them, else its brush's radius; a pen line's is half its nib.
import fs from 'node:fs';
import zlib from 'node:zlib';

const [tapeFile, outFile] = process.argv.slice(2);
if (!tapeFile || !outFile) throw new Error('usage: extract-strokes.mjs <marks.json> <strokes.json.gz>');
const UNIT = 0.5;

const tape = JSON.parse(fs.readFileSync(tapeFile, 'utf8'));
const s = tape.scale ?? 1;
const median = v => { const a = [...v].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
const q = v => Math.round(v / UNIT);

function radiusOf(m) {
  if (m.k === 'P') { const pen = tape.penOpts?.[tape.pens?.[m.pen] ?? m.pen]; return Math.max(0.5, (pen?.nib ?? 1) / 2); }
  const brush = tape.brushOpts?.[tape.brushes?.[m.b] ?? m.b];
  const own = m.d.map(p => p[3]).filter(r => Number.isFinite(r) && r >= 0);
  return own.length ? median(own) / s : brush?.radius ?? 1;
}

const strokes = [];
let frame = 0, points = 0;
for (const m of tape.marks) {
  if (m.k === 'm') { frame = m.i; continue; }
  if ((m.k !== 's' && m.k !== 'P') || !m.d?.length) continue;
  const r = radiusOf(m), step = Math.max(1, r / 3), path = [];
  let last = null;
  m.d.forEach((p, j) => {
    const x = p[0] / s, y = p[1] / s;
    if (last && j < m.d.length - 1 && Math.hypot(x - last.x, y - last.y) < step) return;
    last = { x, y }; path.push(q(x), q(y));
  });
  points += path.length / 2;
  const flat = m.k === 's' && Boolean(tape.brushOpts?.[tape.brushes?.[m.b] ?? m.b]?.flat);
  strokes.push([frame, m.k === 'P' ? 1 : flat ? 2 : 0, Math.max(1, q(r)), ...path]);
}
const body = zlib.gzipSync(JSON.stringify({ w: tape.w, h: tape.h, unit: UNIT, strokes }), { level: 9 });
fs.writeFileSync(outFile, body);
console.log(`${strokes.length} strokes over ${points} points, ${(body.length / 1024).toFixed(0)} KB`);
