// Pipeline: painting, stage 3 (washes).
// --massplan 1: the shared mass planner (mass-plan.mjs) driving the watercolour's washes. A painter decides a few
// masses first (background, figure, face) and mixes a few colours for each, so a pass does not break into a lace.
// Each mass-colour piece is a puddle label; passages are laid mass by mass (MASS_ORDER) and melt by MASS_EDGES.
import { planMasses, coloursByMass, modeFilter, lab, MASS_ORDER, MASS_EDGES, MASS_NAMES } from '../tuned/mass-plan.mjs';

/** Mass labels and mass-colour puddle labels for the whole sheet, or null when --massplan is off. */
export function massPuddles({ px, w, h, figure, focus, gaussian, num, log }) {
  if (num('massplan', 0) <= 0) return null;
  const n = w * h, sigma = num('massblur', 2) * w / 1086;
  // the source in 0..1, blurred to the block-in's scale so a colour cluster is a shape and not the grain
  const rgb = new Float32Array(n * 3);
  for (let c = 0; c < 3; c++) {
    const ch = Float32Array.from({ length: n }, (_, i) => px[i * 3 + c] / 255);
    const b = sigma > 0.3 ? gaussian(ch, w, h, sigma) : ch;
    for (let i = 0; i < n; i++) rgb[i * 3 + c] = b[i];
  }
  let s = 12345;
  const rng = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const fig = figure ?? new Uint8Array(n), foc = focus ?? new Float32Array(n);
  // planMasses' figure rules assume one portrait layout (hair above 0.3 of the height, dress below 0.53) and can cut a
  // face along a level line. Without a focus map the figure is split by colour alone (genericMasses).
  const { labels: mass, stats } = focus || num('massgeneric', 0) < 0
    ? planMasses({ rgb, w, h, focus: foc, figure: fig, landBottom: num('masslandbottom', 0.58), rng })
    : genericMasses({ rgb, w, h, figure: fig, gaussian, k: Math.max(1, Math.round(num('massfigure', 5))), smooth: Math.max(3, Math.round(num('massfigsmooth', 10) * w / 1086)), place: num('massplace', 120) });
  // --masscolours K: colours in a mass over 15% of the sheet; K - 1 over 3%, else 1
  const K = num('masscolours', 3);
  const kOf = id => { const a = stats[id]?.area ?? 0; if (!a) return 0; return a > 0.15 * n ? K : a > 0.03 * n ? Math.max(1, K - 1) : 1; };
  const cols = coloursByMass(rgb, mass, w, h, kOf, rng);
  // one id per (mass, colour), in mass order so the ids sort the way the masses are laid
  const ids = new Map(), raw = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const key = `${mass[i]}|${cols[i * 3].toFixed(4)}|${cols[i * 3 + 1].toFixed(4)}|${cols[i * 3 + 2].toFixed(4)}`;
    let id = ids.get(key);
    if (id == null) { id = ids.size; if (id > 254) id = 254; ids.set(key, id); }
    raw[i] = id;
  }
  const labels = modeFilter(raw, w, h, Math.max(2, Math.round(num('masssmooth', 4) * w / 1086)), Math.min(255, ids.size));
  const shown = stats.filter(t => t.area).map(t => `${t.name || 'unassigned'} ${(100 * t.area / n).toFixed(1)}% (${kOf(t.id)})`).join(', ');
  log(`mass plan: ${stats.filter(t => t.area).length} masses, ${ids.size} mass colours: ${shown}`);
  return { mass, labels, stats, count: ids.size };
}

/** Each passage's mass (the majority under it), then every pass's passages sorted by MASS_ORDER. */
export function orderByMass(layers, M, n) {
  if (!M) return;
  const rank = new Map(MASS_ORDER.map((id, r) => [id, r]));
  for (const L of layers) {
    for (const sh of L.shapes) {
      if (sh._mass != null) continue;
      // walk the passage's own box when it has one, so no full-sheet mask is built and kept per passage
      const cnt = new Int32Array(MASS_NAMES.length);
      if (sh.ids && sh.box) { const b = sh.box, W = sh.w; for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (sh.ids[y * W + x] === sh.id) cnt[M.mass[y * W + x]]++; }
      else if (sh.mask) { const m = sh.mask; for (let i = 0; i < n; i++) if (m[i]) cnt[M.mass[i]]++; }
      let b = 0; for (let j = 1; j < cnt.length; j++) if (cnt[j] > cnt[b]) b = j;
      sh._mass = b;
    }
    // a new array: sorting in place would reorder a list other stages still hold
    L.shapes = L.shapes.map((sh, k) => [sh, k]).sort((a, b) => ((rank.get(a[0]._mass) ?? 99) - (rank.get(b[0]._mass) ?? 99)) || a[1] - b[1]).map(([sh]) => sh);
  }
}

/** How far past its own edge a passage's clip reaches, in floor radii, from its mass's edge type. */
export function edgeReach(sh, num) {
  const e = MASS_EDGES[sh?._mass];
  return e === 'lost' ? num('masslost', 1) : e === 'soft' ? num('masssoft', 0.5) : 0;
}

/**
 * Masses for a picture with no focus map: everything off the subject is one ground mass (id 1, 'sky', a lost edge);
 * the subject is split into k masses by colour (k-means in Lab on the blurred source), smoothed by majority so a mass
 * is a shape, and numbered 6, 7, 8 from the lightest to the darkest, so MASS_ORDER lays the figure light to dark.
 * Same result shape as planMasses.
 */
function genericMasses({ rgb, w, h, figure, k = 3, smooth = 10, place = 0 }) {
  // `place` weights position against colour (Lab units across the whole sheet), so a mass is a region and not every
  // cell of one colour wherever it lies: 0 splits by colour alone
  const n = w * h, D = 5, F = new Float32Array(n * D), fig = [], S = Math.max(w, h);
  for (let i = 0; i < n; i++) { const q = lab([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]]); F[i * D] = q[0]; F[i * D + 1] = 1.5 * q[1]; F[i * D + 2] = 1.5 * q[2]; F[i * D + 3] = place * (i % w) / S; F[i * D + 4] = place * Math.floor(i / w) / S; if (figure[i]) fig.push(i); }
  const labels = new Uint8Array(n), ids = [6, 7, 8, 9, 10, 11].slice(0, Math.min(6, k));
  if (fig.length) {
    const sample = fig.filter((_, j) => j % 5 === 0);
    const byL = sample.slice().sort((a, b) => F[b * D] - F[a * D]);
    let cs = ids.map((_, j) => { const i = byL[Math.floor((j + 0.5) / ids.length * (byL.length - 1))]; return Array.from(F.subarray(i * D, i * D + D)); });
    const near = i => { let b = 0, bd = Infinity; cs.forEach((c, j) => { let d = 0; for (let q = 0; q < D; q++) d += (F[i * D + q] - c[q]) ** 2; if (d < bd) { bd = d; b = j; } }); return b; };
    for (let it = 0; it < 15; it++) {
      const acc = cs.map(() => new Array(D + 1).fill(0));
      for (const i of sample) { const j = near(i); for (let c = 0; c < D; c++) acc[j][c] += F[i * D + c]; acc[j][D]++; }
      cs = cs.map((c, j) => (acc[j][D] ? acc[j].slice(0, D).map(v => v / acc[j][D]) : c));
    }
    // lightest first
    const rank = cs.map((c, j) => [c[0], j]).sort((a, b) => b[0] - a[0]).map(([, j]) => j), idOf = new Array(cs.length);
    rank.forEach((j, r) => { idOf[j] = ids[r]; });
    for (const i of fig) labels[i] = idOf[near(i)];
  }
  for (let i = 0; i < n; i++) if (!figure[i]) labels[i] = 1;
  const sm = modeFilter(labels, w, h, smooth, MASS_NAMES.length);
  // the subject's outline stays the mask's: smoothing only moves boundaries inside the figure
  for (let i = 0; i < n; i++) { if (!figure[i]) sm[i] = 1; else if (sm[i] === 1) sm[i] = labels[i]; }
  const stats = MASS_NAMES.map((name, id) => ({ id, name: id === 1 ? 'ground' : id >= 6 ? `figure ${id - 5}` : name, area: 0, cx: 0, cy: 0 }));
  for (let i = 0; i < n; i++) { const s = stats[sm[i]]; s.area++; s.cx += i % w; s.cy += Math.floor(i / w); }
  for (const s of stats) if (s.area) { s.cx /= s.area; s.cy /= s.area; }
  return { labels: sm, stats };
}
