// --dogroute strands: technique for a curly dog's windblown edge: long wavy pen strands grown from the drawing file's
// short coat strands (work/lines/<base>-lines.json), some running --dogwisp of the dog's width past the silhouette.
// No loops: the curvature never holds one sign long enough to close. DOM free except for reading the lines file.
import fs from 'node:fs';
import path from 'node:path';

// the file's strands as cell paths, with their kind kept (src/crop/lines.mjs drops it)
function readStrands(file, w, h, kinds = ['strand']) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8')), sx = w / (doc.image?.w || w), sy = h / (doc.image?.h || h);
  return (doc.lines || []).filter(l => kinds.includes(l.kind)).map(l => l.points.map(([x, y]) => ({ x: x * sx, y: y * sy }))).filter(p => p.length >= 2);
}

// One strand grown to `len` cells (--dogstrandlen of the dog's width): forward from its end and back from its start,
// each an S wave of wavelength `wave` (--dogwave of the width)
function growStrand(pts, len, rnd, { wave = 20, amp = 0.9, step = 0.7, allow = null, w = 0, h = 0 } = {}) {
  const own = pts.reduce((a, p, k) => a + (k ? Math.hypot(p.x - pts[k - 1].x, p.y - pts[k - 1].y) : 0), 0);
  const extra = Math.max(0, len - own), fwd = extra * (0.55 + 0.3 * rnd()), back = extra - fwd;
  const walk = (from, prev, L) => {
    let a = Math.atan2(from.y - prev.y, from.x - prev.x), x = from.x, y = from.y;
    const out = [], ph = rnd() * 2 * Math.PI, k0 = (2 * Math.PI / wave) * amp;
    for (let t = step; t <= L; t += step) {
      a += k0 * Math.sin(2 * Math.PI * t / wave + ph) * step;
      x += Math.cos(a) * step; y += Math.sin(a) * step;
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= w || yi >= h || (allow && !allow[yi * w + xi])) break;
      out.push({ x, y });
    }
    return out;
  };
  const n = pts.length;
  const ahead = walk(pts[n - 1], pts[Math.max(0, n - 3)], fwd);
  const behind = walk(pts[0], pts[Math.min(n - 1, 2)], back).reverse();
  return [...behind, ...pts, ...ahead];
}

// the pressure along a strand: up from the tip, a varied body, down to a hair at the end
const strandPressure = (path, peak) => path.map((q, k) => {
  const u = k / Math.max(1, path.length - 1);
  return { ...q, s: Math.max(0.12, peak * Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + 0.92 * u)), 0.55)) };
});

export async function strandPass(P) {
  const { w, h, n, SC, W2, H2, sheet, O, num, opt, log, setStage, snap, drawGestures, inkAt, sheetK, zone, whole, width } = P;
  if (inkAt == null) { log('dog strands: no ink pigment'); return; }
  const base = opt('dogstrandfile', '') || opt('drawingfile', '');
  const file = path.join('work/lines', `${base}-lines.json`);
  if (!base || !fs.existsSync(file)) { log(`dog strands: no lines file ${file}`); return; }
  let s = (Math.round(P.SEED) + 3301) | 0 || 1; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const strands = readStrands(file, w, h, opt('dogstrandkinds', 'strand').split(','));
  const inZone = p => { let c = 0; for (const q of p) { const x = Math.round(q.x), y = Math.round(q.y); if (x >= 0 && y >= 0 && x < w && y < h && zone[y * w + x]) c++; } return c >= 0.5 * p.length; };
  // how far past the silhouette a wisp may run
  const reach = P.dilate(whole, w, h, Math.max(1, Math.round(num('dogwisp', 0.06) * width)));
  const [l0, l1] = opt('dogstrandlen', '0.07,0.16').split(',').map(Number);
  let chosen = strands.filter(inZone);
  const max = Math.round(num('dogstrandmax', 140));
  for (let k = chosen.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); const t = chosen[k]; chosen[k] = chosen[j]; chosen[j] = t; }
  chosen = chosen.slice(0, max);
  const gs = chosen.map(p => {
    const len = width * (l0 + (l1 - l0) * rnd());
    const grown = growStrand(p, len, rnd, { wave: num('dogwave', 0.08) * width, amp: num('dogwaveamp', 0.9), allow: reach, w, h });
    return { points: strandPressure(grown, num('dogstrandpress', 0.75) * (0.6 + 0.4 * rnd())).map(q => ({ x: q.x * SC, y: q.y * SC, s: q.s })) };
  }).filter(g => g.points.length >= 4);
  const ink = new Array(sheetK).fill(0); ink[inkAt] = num('dogstrandconc', num('inkconc', 10));
  const pen = { nib: num('dogstrandnib', 0.8), flex: 1.5, travel: 1.5, reach: 12, reservoir: 250, feed: 1.2 };
  const want = new Float32Array(W2 * H2).fill(1), batches = 2, each = Math.ceil(gs.length / batches);
  for (let b = 0; b < batches; b++) {
    const part = gs.slice(b * each, (b + 1) * each);
    if (!part.length) continue;
    P.clock('strokes', () => drawGestures(sheet, part, want, W2, H2, { ink, pen, O, peak: 1 }));
    setStage({ stage: 'dog paint', step: `wavy strands at the edge, batch ${b + 1} of ${batches}`, strokes: part.length });
    snap();
  }
  const cells = gs.reduce((a, g) => a + g.points.length, 0);
  P.count('dog strands', gs.length);
  log(`dog strands: ${gs.length} of ${strands.length} file strands grown in the edge zone, ${cells} points`);
}
