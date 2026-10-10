// For dark curly dog coats (--dogroute paint): a varied warm and cool dark wash, with the curls carried by reserved
// light marks. The pale ground goes first, lock strokes are masked, the dark goes over in two layers, and the fluid
// comes off once dry to show pale curving strokes. DOM free.

// Lock strokes over the dog, as centre lines in cells with a half-width: short tapered S and C curves falling down the
// coat, denser where `weight` is high. `ringlet`: each stroke is instead a tight C opening downward (a 150 to 250 degree
// turn), the crown of one ringlet of a wet coat.
export function lockStrokes({ mask, weight, w, h, rnd, width, share = 0.12, len = [0.03, 0.08], thick = [0.004, 0.009], step = 0.6, ringlet = false }) {
  const n = w * h, cells = []; let area = 0, wsum = 0;
  for (let i = 0; i < n; i++) if (mask[i]) { area++; if (weight[i] > 0) { cells.push(i); wsum += weight[i]; } }
  if (!cells.length) return { strokes: [], raster: new Uint8Array(n) };
  const raster = new Uint8Array(n), strokes = [];
  let covered = 0, tries = 0;
  const target = share * area;
  while (covered < target && tries++ < 200000) {
    const i0 = cells[Math.floor(rnd() * cells.length)];
    if (rnd() > weight[i0]) continue;
    const L = width * (len[0] + (len[1] - len[0]) * rnd()), r0 = Math.max(0.55, width * (thick[0] + (thick[1] - thick[0]) * rnd()));
    // falling down the coat, leaning either way; an S (two bends) or a C (one)
    const turn = (2.6 + 1.8 * rnd()) * (rnd() < 0.5 ? -1 : 1);
    const a0 = ringlet ? (turn > 0 ? Math.PI : 0) - turn / 2 + (rnd() - 0.5) * 0.8 : Math.PI / 2 + (rnd() - 0.5) * 1.6;
    const bend = ringlet ? turn : (0.8 + 1.2 * rnd()) * (rnd() < 0.5 ? -1 : 1), s = !ringlet && rnd() < 0.55, ph = rnd() * Math.PI;
    let x = (i0 % w) + rnd() - 0.5, y = ((i0 / w) | 0) + rnd() - 0.5;
    const pts = [];
    for (let t = 0; t <= L; t += step) {
      const u = t / L, a = ringlet ? a0 + bend * u : a0 + bend * (s ? Math.sin(2 * Math.PI * u + ph) : u - 0.5);
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= w || yi >= h || !mask[yi * w + xi]) break;
      pts.push({ x, y, r: r0 * Math.max(0.35, Math.sin(Math.PI * Math.min(1, 0.1 + 0.8 * u + 0.1))) });
      x += Math.cos(a) * step; y += Math.sin(a) * step;
    }
    if (pts.length < 4) continue;
    strokes.push(pts);
    for (const p of pts) {
      const R = Math.ceil(p.r);
      for (let yy = Math.max(0, Math.floor(p.y) - R); yy <= Math.min(h - 1, Math.ceil(p.y) + R); yy++) for (let xx = Math.max(0, Math.floor(p.x) - R); xx <= Math.min(w - 1, Math.ceil(p.x) + R); xx++) {
        const i = yy * w + xx;
        if (mask[i] && !raster[i] && (xx - p.x) ** 2 + (yy - p.y) ** 2 <= p.r * p.r) { raster[i] = 1; covered++; }
      }
    }
  }
  return { strokes, raster };
}

// one layer of the dark as a wash: sweeps of a flat brush over `area`, each charged at the plan's dark there and leaned
// warm or cool in turn, so the colours meet wet and mix on the paper (wet in wet into the damp layer)
export async function darkWash(P, area, { share, water, label, seed }) {
  const { w, h, SC, K, sheet, createBrush, dip, stroke, clock, brushedWashPaths, containPaths, distanceToZero, SEED, UPRIGHT, STRENGTH, calWet, num, setStage, snap } = P;
  const M2 = P.upMask(area), W2 = w * SC, H2 = h * SC, dist = distanceToZero(M2, W2, H2);
  let paths = brushedWashPaths(M2, W2, H2, { pad: 0.6 * SC, minRadius: SC, minLength: 3 * SC, maxRadius: Math.max(SC, Math.round(num('doglockbrush', 0.05) * P.width * SC)), seed: seed + SEED, overlap: 0.25, walk: true });
  paths = containPaths(paths, dist, W2, H2, { minRadius: 0.7 * SC, minLength: 2 * SC, slack: 0.35 * SC });
  P.shieldOn();
  let k = 0;
  for (const pts of paths) {
    const r = Math.max(SC, Math.max(...pts.map(q => q.r)));
    const b = createBrush({ flat: true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.7, bridge: 0.95, bridgeSoft: 2.8, breakup: 1.0, seed: seed + 11 * k + SEED });
    const q = pts[pts.length >> 1], i = Math.min(h - 1, Math.max(0, Math.floor(q.y / SC))) * w + Math.min(w - 1, Math.max(0, Math.floor(q.x / SC)));
    // warm plum and maroon, then violet and blue-black, by turns, with the plan's value at the sweep
    const lean = k % 2 ? num('doglockcool', 0.8) : -num('doglockwarm', 0.6);
    dip(b, { water, conc: P.lean(P.dark.map(d => d * P.valueAt(i) * share * (0.85 + 0.3 * P.rnd())), lean).map(v => v * STRENGTH * calWet) });
    clock('strokes', () => stroke(b, sheet, pts, { upright: UPRIGHT }));
    k++;
  }
  P.settle(num('dogsettle', 30));
  P.darkDry();
  setStage({ stage: 'dog paint', step: label, strokes: k });
  snap();
  return k;
}

// A wet curly coat as rounded clumps of ringlets a clump spacing apart, with dark gaps between them. A ringlet may carry
// a thin uneven crescent of light on its upper rim, mostly on the clump's upper side. Sizes are shares of the dog's width.
//   clump      clump spacing; a clump's ringlets lie within `fill` of half that spacing of its centre
//   ring       ringlet radius range; `thick` the crescent's width range
//   arc        the crescent's turn, degrees, centred on up; `upper`/`lower` the chance a ringlet on the clump's upper or
//              lower half carries one, scaled by `weight` (the lit side 1, the shade less)
//   cap        the clump's own lighter top edge: a crescent band on the clump's upper rim, `cap` of its radius thick
//              (0 off), broken where the ringlets' own crescents are
export function clumpCrescents({ mask, weight, w, h, rnd, width, clump = 0.1, fill = 0.8, ring = [0.009, 0.014], thick = [0.003, 0.007], arc = [90, 230], upper = 0.85, lower = 0.2, cap = 0 }) {
  const n = w * h, raster = new Uint8Array(n), clumps = [];
  const gc = Math.max(3, clump * width), rc = 0.5 * gc * fill;
  const cells = []; for (let i = 0; i < n; i++) if (mask[i]) cells.push(i);
  for (let k = cells.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); const t = cells[k]; cells[k] = cells[j]; cells[j] = t; }
  const near = (list, x, y, d) => list.some(p => (p.x - x) ** 2 + (p.y - y) ** 2 < d * d);
  for (const i of cells) { const x = i % w, y = (i / w) | 0; if (!near(clumps, x, y, gc)) clumps.push({ x, y, i }); }
  let rings = 0, crests = 0;
  for (const c of clumps) {
    const members = [], tries = 40;
    for (let t = 0; t < tries; t++) {
      const r = Math.max(0.9, width * (ring[0] + (ring[1] - ring[0]) * rnd())), a = rnd() * 2 * Math.PI, d = Math.sqrt(rnd()) * Math.max(0, rc - r);
      const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d, xi = Math.round(x), yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= w || yi >= h || !mask[yi * w + xi]) continue;
      if (members.some(m => Math.hypot(m.x - x, m.y - y) < 1.7 * Math.max(r, m.r))) continue;
      members.push({ x, y, r, i: yi * w + xi });
    }
    rings += members.length;
    for (const m of members) {
      const up = m.y <= c.y, wgt = weight[m.i] ?? 0;
      if (rnd() > (up ? upper : lower) * wgt) continue;
      crests++;
      const turn = (arc[0] + (arc[1] - arc[0]) * rnd()) * Math.PI / 180, mid = -Math.PI / 2 + (rnd() - 0.5) * 0.7;
      const tw = Math.max(0.7, width * (thick[0] + (thick[1] - thick[0]) * rnd()));
      const R = Math.ceil(m.r + tw) + 1;
      for (let yy = Math.max(0, Math.floor(m.y) - R); yy <= Math.min(h - 1, Math.ceil(m.y) + R); yy++) for (let xx = Math.max(0, Math.floor(m.x) - R); xx <= Math.min(w - 1, Math.ceil(m.x) + R); xx++) {
        const dx = xx - m.x, dy = yy - m.y, d = Math.hypot(dx, dy);
        if (d < 1e-6) continue;
        let da = Math.atan2(dy, dx) - mid; da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) > turn / 2) continue;
        // thickest at the crown, tapering to nothing at the ends, so the crescent is uneven, not a ring
        const taper = Math.cos((da / (turn / 2)) * Math.PI / 2), half = 0.5 * tw * (0.3 + 0.7 * taper);
        if (Math.abs(d - m.r) <= half && mask[yy * w + xx]) raster[yy * w + xx] = 1;
      }
    }
  }
  if (cap > 0) for (const c of clumps) {
    if (rnd() > (weight[c.i] ?? 0) + 0.3) continue;
    const mid = -Math.PI / 2 + (rnd() - 0.5) * 0.8, turn = (100 + 60 * rnd()) * Math.PI / 180, R = Math.ceil(rc) + 1;
    for (let yy = Math.max(0, c.y - R); yy <= Math.min(h - 1, c.y + R); yy++) for (let xx = Math.max(0, c.x - R); xx <= Math.min(w - 1, c.x + R); xx++) {
      const dx = xx - c.x, dy = yy - c.y, d = Math.hypot(dx, dy);
      let da = Math.atan2(dy, dx) - mid; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > turn / 2 || !mask[yy * w + xx]) continue;
      const band = cap * rc * Math.cos((da / (turn / 2)) * Math.PI / 2);
      if (d <= rc && d >= rc - band && rnd() < 0.85) raster[yy * w + xx] = 1;
    }
  }
  return { clumps, rings, crests, raster };
}
