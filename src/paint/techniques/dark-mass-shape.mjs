// For dark fur and other dark masses (dark-mass.mjs): the mass's shape and the curl paths its fur is brushed along.
// The shape comes from the artwork's density, since a segment traced on a photograph overhangs the painted form.
import { hasLines, loadLines } from '../../crop/lines.mjs';

// the connected cells of `free` reachable from the sheet's border, 4-connected
function exterior(free, w, h) {
  const out = new Uint8Array(w * h), stack = [];
  const seed = i => { if (free[i] && !out[i]) { out[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    if (x > 0) seed(i - 1); if (x < w - 1) seed(i + 1); if (y > 0) seed(i - w); if (y < h - 1) seed(i + w);
  }
  return out;
}

// The mass: cells inside the segment grown by --darkmassgrow cells whose artwork density is at least --darkmasssrc of
// the segment's median. Also its holes up to --darkmassfleck cells (flecks, kept paper) and the mass with them filled.
export function artworkMass({ seg, SRC, w, h, n, dilate, erode, components, num }) {
  const grown = dilate(seg, w, h, Math.max(0, Math.round(num('darkmassgrow', 4))));
  const v = []; for (let i = 0; i < n; i++) if (seg[i]) v.push(SRC[i]);
  v.sort((a, b) => a - b);
  const cut = num('darkmasssrc', 0.5) * (v[v.length >> 1] || 0);
  let m = Uint8Array.from(grown, (g, i) => (g && SRC[i] >= cut ? 1 : 0));
  const close = Math.max(0, Math.round(num('darkmassclose', 1)));
  if (close) m = Uint8Array.from(erode(dilate(m, w, h, close), w, h, close), (c, i) => (c && grown[i] ? 1 : 0));
  const { labels, areas, count } = components(m, w, h);
  const min = Math.max(4, Math.round(num('darkmassmin', 30)));
  const keep = new Set(); for (let id = 1; id <= count; id++) if (areas[id] >= min) keep.add(id);
  const mask = Uint8Array.from(labels, l => (keep.has(l) ? 1 : 0));
  // holes: what is not mass and not reachable from outside; small ones are flecks, filled in the mass the washes cover
  const out = exterior(Uint8Array.from(mask, v2 => 1 - v2), w, h);
  const hole = Uint8Array.from(mask, (v2, i) => (!v2 && !out[i] ? 1 : 0));
  const hc = components(hole, w, h), maxFleck = Math.round(num('darkmassfleck', 12));
  const flecks = new Uint8Array(n), filled = Uint8Array.from(mask);
  for (let i = 0; i < n; i++) if (hole[i]) { filled[i] = 1; if (hc.areas[hc.labels[i]] <= maxFleck) flecks[i] = 1; }
  return { mask, filled, flecks, cut };
}

// the cells of `mask` next to its outside (not next to a hole inside it)
export function outerEdge(mask, w, h) {
  const out = exterior(Uint8Array.from(mask, v => 1 - v), w, h), edge = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!mask[i]) continue;
    if ((x > 0 && out[i - 1]) || (x < w - 1 && out[i + 1]) || (y > 0 && out[i - w]) || (y < h - 1 && out[i + w]) || x === 0 || y === 0 || x === w - 1 || y === h - 1) edge[i] = 1;
  }
  return edge;
}

// the curl paths on a mass (--darkmasscurls <base>): traced lines with most of their points on the mass grown by a few
// cells, in pieces of --darkmasscurlmin to --darkmasscurlmax cells; they may run past the silhouette
export function curlPaths({ base, mass, w, h, dilate, num, rnd, log }) {
  if (!base) return [];
  if (!hasLines(base)) { log(`dark mass: no work/lines/${base}-lines.json, no curls`); return []; }
  const near = dilate(mass, w, h, Math.max(1, Math.round(num('darkmasscurlreach', 3))));
  const on = q => { const x = Math.min(w - 1, Math.max(0, Math.round(q.x))), y = Math.min(h - 1, Math.max(0, Math.round(q.y))); return near[y * w + x] === 1; };
  const lines = loadLines(base, w, h).filter(g => g.points.filter(on).length >= 0.6 * g.points.length);
  const lo = num('darkmasscurlmin', 10), hi = num('darkmasscurlmax', 30), out = [];
  for (const g of lines) {
    let cur = [g.points[0]], d = 0, want = lo + (hi - lo) * rnd();
    for (let k = 1; k < g.points.length; k++) {
      d += Math.hypot(g.points[k].x - g.points[k - 1].x, g.points[k].y - g.points[k - 1].y);
      cur.push(g.points[k]);
      if (d >= want && k < g.points.length - 1) { out.push(cur); cur = [g.points[k]]; d = 0; want = lo + (hi - lo) * rnd(); }
    }
    if (cur.length >= 2 && (d >= 3 || !out.length)) out.push(cur);
  }
  log(`dark mass: ${out.length} curl strokes from ${lines.length} traced lines of work/lines/${base}-lines.json on the mass`);
  return out;
}

// The pen walker's gestures on a mass (points in plan cells), as curl paths: the greedy walk wanders curls through
// the dark, which reads as fur under glazes. Cut to pieces of at most --darkmasscurlmax cells.
export function walkerCurls({ gestures, mass, w, h, dilate, num, log }) {
  const near = dilate(mass, w, h, 2);
  const on = q => { const x = Math.min(w - 1, Math.max(0, Math.round(q.x))), y = Math.min(h - 1, Math.max(0, Math.round(q.y))); return near[y * w + x] === 1; };
  const max = num('darkmasscurlmax', 40), out = [];
  let used = 0;
  for (const g of gestures || []) {
    if (!g.points || g.points.length < 2 || g.points.filter(on).length < 0.6 * g.points.length) continue;
    used++;
    let cur = [g.points[0]], d = 0;
    for (let k = 1; k < g.points.length; k++) {
      d += Math.hypot(g.points[k].x - g.points[k - 1].x, g.points[k].y - g.points[k - 1].y);
      cur.push(g.points[k]);
      if (d >= max && k < g.points.length - 1) { out.push(cur); cur = [g.points[k]]; d = 0; }
    }
    if (cur.length >= 2) out.push(cur);
  }
  log(`dark mass: ${out.length} curl strokes from ${used} of the walker's ${(gestures || []).length} gestures, on the mass`);
  return out;
}

// Paper flecks as slivers: short thin runs beside a curl and along it, --darkmassslivers of the mass in all, each
// --darkmassslivermin to --darkmassslivermax cells long. Flecks in fur are slivers where the brush skipped between
// curls; round holes read as pinpoints.
export function sliverFlecks({ curls, mass, w, h, n, num, rnd, log }) {
  let area = 0; for (let i = 0; i < n; i++) area += mass[i];
  const want = num('darkmassslivers', 0.015) * area, lo = num('darkmassslivermin', 2), hi = num('darkmassslivermax', 5);
  const out = new Uint8Array(n);
  let got = 0, count = 0;
  for (let t = 0; t < curls.length * 4 && got < want; t++) {
    const g = curls[Math.floor(rnd() * curls.length)];
    if (g.length < 3) continue;
    const k0 = Math.floor(rnd() * (g.length - 2)), side = rnd() < 0.5 ? -1 : 1, len = lo + (hi - lo) * rnd();
    let d = 0;
    for (let k = k0; k < g.length - 1 && d < len; k++) {
      const a = g[k], b = g[k + 1], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      // beside the curl by a cell and a half, on one side, walked every half cell so a sliver is a continuous run
      for (let u = 0; u < L && d + u < len; u += 0.5) {
        const px = a.x + dx * u / L, py = a.y + dy * u / L;
        const x = Math.round(px - side * 1.5 * dy / L), y = Math.round(py + side * 1.5 * dx / L);
        if (x >= 0 && y >= 0 && x < w && y < h && mass[y * w + x] && !out[y * w + x]) { out[y * w + x] = 1; got++; }
      }
      d += L;
    }
    count++;
  }
  log(`dark mass: ${count} sliver flecks beside the curls, ${got} cells (${(100 * got / Math.max(1, area)).toFixed(1)}% of the mass) under frisket`);
  return out;
}
