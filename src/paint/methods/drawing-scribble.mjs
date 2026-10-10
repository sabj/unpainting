// --drawinglogic 3: the first pen as a person's opening drawing. Long joined lines of varied weight, left open where
// they run along a light, and dark masses inked as a looping scribble rather than a fill. DOM free.
// --scribblejoin: join gap in cells (14). --scribblemin: drop lines under this share of the short side (0.02).
// --scribblestroke: stroke length per dip, share of the short side (0.2). --scribbleloop: loop size, same unit (0.008).
// --scribblelit: leave a line open where the source is under this on both sides (0.15).
// --scribbledark: darkest share of the sheet read as a mass (0.06). --scribblemass: smallest mass, share of sheet (0.002).
// --scribblehole: lights in a mass under this share of its darkness stay open (0.35).
import { components } from '../../raster.js';

const hash = s => { let x = (s * 2654435761) >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); };

// Cut a gesture where it runs along a light: both sides of the line pale in the source.
export function breakOnLights(g, D, w, h, { lit = 0.15, reach = 2, minPts = 3 } = {}) {
  const at = (x, y) => D[Math.max(0, Math.min(h - 1, Math.round(y))) * w + Math.max(0, Math.min(w - 1, Math.round(x)))];
  const P = g.points, out = [];
  let cur = [];
  for (let k = 0; k < P.length; k++) {
    const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)];
    let nx = -(b.y - a.y), ny = b.x - a.x; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const side = Math.max(at(P[k].x + reach * nx, P[k].y + reach * ny), at(P[k].x - reach * nx, P[k].y - reach * ny), at(P[k].x, P[k].y));
    if (side < lit) { if (cur.length >= minPts) out.push({ ...g, points: cur }); cur = []; }
    else cur.push(P[k]);
  }
  if (cur.length >= minPts) out.push({ ...g, points: cur });
  return out;
}

// The dark masses as looping scribble gestures, in plan cells, each point with its own pressure share.
export function scribbleMasses(D, w, h, gaussian, { K = 1, dark = 0.06, minMass = 0.002, loop = 0.008, hole = 0.35, seed = 7, subject = null } = {}) {
  const n = w * h, short = Math.min(w, h), B = gaussian(D, w, h, 2 * K);
  const vals = Float32Array.from(B).sort(), cut = vals[Math.floor(n * (1 - dark))] ?? Infinity;
  const M = Uint8Array.from(B, (v, i) => (v >= cut && v > 0.4 && (!subject || subject[i] > 0.3) ? 1 : 0));
  const { labels, areas, count } = components(M, w, h);
  const r = Math.max(1.2 * K, loop * short), rnd = hash(seed), gestures = [];
  for (let id = 1; id <= count; id++) {
    if (areas[id] < minMass * n) continue;
    const cells = []; let top = 0;
    for (let i = 0; i < n; i++) if (labels[i] === id) { cells.push(i); top = Math.max(top, B[i]); }
    // seeds on a jittered grid, kept with a chance that rises with darkness, lights left out
    const step = 1.1 * r, pts = [];
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      const px = x + (rnd() - 0.5) * step, py = y + (rnd() - 0.5) * step, i = Math.min(h - 1, Math.max(0, Math.round(py))) * w + Math.min(w - 1, Math.max(0, Math.round(px)));
      if (labels[i] !== id) continue;
      const v = B[i] / top;
      if (v < hole) continue;
      if (rnd() < 0.55 + 0.45 * v) pts.push({ x: px, y: py, v });
    }
    if (pts.length < 2) continue;
    // a path through them, nearest first: the hand scribbles across the mass rather than row by row
    const order = [pts.shift()];
    while (pts.length) { const a = order.at(-1); let b = 0, bd = Infinity; pts.forEach((p, k) => { const d = Math.hypot(p.x - a.x, p.y - a.y); if (d < bd) { bd = d; b = k; } }); order.push(pts.splice(b, 1)[0]); }
    // loops along the path: the pen travels from seed to seed while circling, a trochoid, loops tighter where darker
    let cur = [], phase = rnd() * 6.28;
    const flush = () => { if (cur.length >= 4) gestures.push({ points: cur, role: 'mass', weight: 1 }); cur = []; };
    for (let k = 1; k < order.length; k++) {
      const a = order[k - 1], b = order[k], d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d > 4 * step) { flush(); continue; }
      const steps = Math.max(4, Math.ceil(d / (0.35 * r)));
      for (let t = 0; t < steps; t++) {
        const u = t / steps, v = a.v + (b.v - a.v) * u, rr = r * (1.1 - 0.5 * v);
        phase += (2 * Math.PI * d / Math.max(1, steps)) / (1.3 * r);
        // a flattened loop, long across the way the hand travels, as a quick scribble is, not a round ring
        const tx = (b.x - a.x) / (d || 1), ty = (b.y - a.y) / (d || 1), c = rr * 0.45 * Math.cos(phase), sn = rr * Math.sin(phase);
        const x = a.x + (b.x - a.x) * u + c * tx - sn * ty, y = a.y + (b.y - a.y) * u + c * ty + sn * tx;
        const i = Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)));
        if (labels[i] !== id || B[i] / top < hole) { flush(); continue; }
        cur.push({ x, y, s: Math.min(1, 0.45 + 0.55 * v), v: 1.2 });
      }
    }
    flush();
  }
  return gestures;
}
