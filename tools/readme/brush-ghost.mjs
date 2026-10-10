// The brush ghost for README films: the outline of the brush that is laying a stroke, drawn at its place along the
// stroke's recorded path, with a faint trail of the path behind it. Everything comes from the painter's mark tape
// (marks.json): nothing is inferred from the pictures. The outline matches the Mona player on samjackson.org: a white
// 3 px line under a 1 px #863d2c line.
import fs from 'node:fs';
import zlib from 'node:zlib';

const INK = '#863d2c';

// The mark tape, plain or gzipped.
export function readTape(file) {
  const raw = fs.readFileSync(file);
  return JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(raw) : raw);
}

// The tape's strokes in order, in sheet pixels: { at (index on the tape), kind ('brush' | 'pen'), flat, points: [{x, y,
// p, r}] }. A brush stroke ('s') stores x, y and radius times `scale` and pressure times 100; a pen line ('P') has no
// brush and gets a nib marker.
export function tapeStrokes(tape) {
  const s = tape.scale ?? 1, out = [];
  tape.marks.forEach((m, at) => {
    if (m.k !== 's' && m.k !== 'P') return;
    const pts = (m.d ?? []).map(q => ({ x: q[0] / s, y: q[1] / s, p: (q[2] ?? 100) / 100, r: (q[3] ?? 0) / s }));
    if (!pts.length) return;
    const opts = m.k === 's' ? tape.brushOpts?.[tape.brushes?.[m.b] ?? m.b] : null;
    out.push({ at, kind: m.k === 's' ? 'brush' : 'pen', flat: Boolean(opts?.flat), points: pts });
  });
  return out;
}

// The point a fraction `f` (0..1) of the way along a stroke's path, with the path's heading there.
export function along(stroke, f) {
  const pts = stroke.points;
  if (pts.length === 1) return { ...pts[0], heading: 0, upto: 0 };
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(d); total += d; }
  let goal = Math.max(0, Math.min(1, f)) * total, i = 0;
  while (i < seg.length - 1 && goal > seg[i]) { goal -= seg[i]; i++; }
  const a = pts[i], b = pts[i + 1], t = seg[i] > 0 ? goal / seg[i] : 0;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, p: a.p + (b.p - a.p) * t, r: a.r + (b.r - a.r) * t, heading: Math.atan2(b.y - a.y, b.x - a.x), upto: i };
}

const pathOf = (pts, k) => pts.map(q => `${(q.x * k).toFixed(1)},${(q.y * k).toFixed(1)}`).join(' ');

// SVG elements (no <svg> wrapper) for one moment, in a panel `k` panel pixels per sheet pixel. `done` are the strokes
// laid since the last saved frame (their paint shows only at the next frame), drawn as faint trails; `current` is the
// stroke under the brush and `f` how far along it the brush is. A stroke with `area: true` gets an "[area wash]" tag in
// place of the brush outline.
export function ghostSvg({ done = [], current = null, f = 0, k = 1 }) {
  const parts = [];
  for (const s of done) parts.push(`<polyline points="${pathOf(s.points, k)}" fill="none" stroke="${INK}" stroke-opacity="0.18" stroke-width="1" stroke-linecap="round"/>`);
  if (!current) return parts.join('');
  const at = along(current, f), trail = [...current.points.slice(0, at.upto + 1), at];
  parts.push(`<polyline points="${pathOf(trail, k)}" fill="none" stroke="${INK}" stroke-opacity="0.45" stroke-width="1.2" stroke-linecap="round"/>`);
  const x = at.x * k, y = at.y * k;
  // An area wash (a stroke marked `area`) is wider than any outline would read: it gets a small tag instead.
  if (current.area) return parts.join('') + `<text x="${(x + 4).toFixed(1)}" y="${(y - 4).toFixed(1)}" font-size="10" style="font-family:-apple-system,Helvetica,Arial,sans-serif;fill:${INK};stroke:white;stroke-width:2.5;paint-order:stroke">[area wash]</text>`;
  const outline = shape => `${shape.replace('/>', ' fill="none" stroke="white" stroke-width="3"/>')}${shape.replace('/>', ` fill="none" stroke="${INK}" stroke-width="1"/>`)}`;
  if (current.kind === 'pen') return parts.join('') + outline(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5"/>`);
  const r = Math.max(2, at.r * k);
  if (current.flat) {
    // A flat brush lies across its travel: its width is the brush's, its thickness a fifth of that.
    const deg = (at.heading * 180) / Math.PI + 90, t = Math.max(2, r * 0.4);
    return parts.join('') + outline(`<rect x="${(x - r).toFixed(1)}" y="${(y - t / 2).toFixed(1)}" width="${(2 * r).toFixed(1)}" height="${t.toFixed(1)}" rx="1" transform="rotate(${deg.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`);
  }
  return parts.join('') + outline(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`);
}
