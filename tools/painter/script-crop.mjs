// A painting script cut to a window of its sheet, for trying a piece of a painting fast: the regions clipped to the
// window and moved to its origin, each touch count scaled by the share of its region that falls inside, the lines cut
// to their parts inside, the charges outside dropped. The window's own sheet is its width.
//
//   node tools/painter/script-crop.mjs IN.json OUT.json X Y W H     (all in the script's sheet mm)
import fs from 'node:fs';
import { areaOf } from '../../src/paint/methods/script-marks.mjs';

/** Sutherland-Hodgman: a polygon clipped to the rectangle [x0, x1] x [y0, y1]. */
export function clipPolygon(P, x0, y0, x1, y1) {
  const edges = [[p => p[0] >= x0, (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])]], [p => p[0] <= x1, (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])]],
    [p => p[1] >= y0, (a, b) => [a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0]], [p => p[1] <= y1, (a, b) => [a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1]]];
  let out = P;
  for (const [inside, cut] of edges) {
    const src = out; out = [];
    for (let i = 0; i < src.length; i++) { const a = src[(i + src.length - 1) % src.length], b = src[i]; if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b)); }
    if (!out.length) break;
  }
  return out;
}

/** A polyline cut to the rectangle: its runs inside (each at least two points). */
function clipPath(P, x0, y0, x1, y1) {
  const runs = []; let cur = [];
  const ins = p => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
  for (let i = 0; i < P.length; i++) {
    if (ins(P[i])) cur.push(P[i]);
    else { if (cur.length >= 2) runs.push(cur); cur = []; }
    if (i + 1 < P.length) { // a segment that crosses: sample it so a long one keeps its part inside
      const a = P[i], b = P[i + 1], m = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1);
      for (let j = 1; j < m; j++) { const q = [a[0] + (b[0] - a[0]) * j / m, a[1] + (b[1] - a[1]) * j / m]; if (ins(q)) cur.push(q); else { if (cur.length >= 2) runs.push(cur); cur = []; } }
    }
  }
  if (cur.length >= 2) runs.push(cur);
  return runs;
}

/** The script cut to the window (x, y, w, h). */
export function cropScript(script, x, y, w, h) {
  const x1 = x + w, y1 = y + h, mv = P => P.map(([a, b]) => [+(a - x).toFixed(2), +(b - y).toFixed(2)]);
  const passages = [];
  for (const p of script.passages) {
    const q = { ...p };
    if (p.mark === 'line') {
      q.paths = (p.paths ?? []).flatMap(P => clipPath(P, x, y, x1, y1)).map(mv); if (!q.paths.length) continue;
    } else {
      const regs = p.regions?.length ? p.regions : [p.region], kept = regs.map(P => clipPolygon(P, x, y, x1, y1)).filter(P => P.length >= 3);
      const share = areaOf(kept) / Math.max(1e-6, areaOf(regs)); if (!kept.length || share < 0.02) continue;
      delete q.region; q.regions = kept.map(mv);
      if (p.mark !== 'sweep' && p.strokes) q.strokes = Math.max(1, Math.round(p.strokes * share));
    }
    if (p.paths && p.mark !== 'line') q.paths = p.paths.flatMap(P => clipPath(P, x, y, x1, y1)).map(mv);
    q.charges = (p.charges ?? []).map(c => ({ ...c, at: (c.at ?? []).filter(([a, b]) => a >= x && a <= x1 && b >= y && b <= y1).map(([a, b]) => [+(a - x).toFixed(2), +(b - y).toFixed(2)]) })).filter(c => c.at.length);
    passages.push(q);
  }
  // a passage `into` one that was cut away goes on its own
  const ids = new Set(passages.map(p => p.id));
  for (const p of passages) if (p.into && !ids.has(p.into)) delete p.into;
  return { ...script, sheet: { widthMm: w, heightMm: h }, cropOf: { x, y, w, h, sheet: script.sheet }, passages };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [inp, out, ...nums] = process.argv.slice(2), [x, y, w, h] = nums.map(Number);
  if (!out || ![x, y, w, h].every(Number.isFinite)) { console.error('usage: script-crop.mjs IN.json OUT.json X Y W H'); process.exit(2); }
  const s = cropScript(JSON.parse(fs.readFileSync(inp, 'utf8')), x, y, w, h);
  fs.writeFileSync(out, JSON.stringify(s, null, 1));
  console.log(`${s.passages.length} passages in the window ${w} x ${h} mm at ${x}, ${y}`);
}
