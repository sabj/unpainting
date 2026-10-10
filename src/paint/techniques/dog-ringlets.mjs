// For a curly black dog's coat: the ringlets laid out before any paint (dog-paint.mjs), each with a pale crescent of
// sheen on the light side, where a black coat's lights live. Ringlets are coloured into non-touching sets, so each set
// can be laid wet and dried before the next. The crescents join the no-dark mask. DOM free.

// Ringlet centres at least `2 * r0` apart over `allow`, each with its own radius, lit flag and crescent
export function ringletLayout(allow, lit, w, h, rnd, { r0 = 4, spread = 0.25, light = [-0.35, -0.94], jitter = 0.5, arc = 70, band = 0.32, shadowShare = 0.6, shadowBand = 0.6 } = {}) {
  const n = w * h, cells = [];
  for (let i = 0; i < n; i++) if (allow[i]) cells.push(i);
  for (let k = cells.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); const t = cells[k]; cells[k] = cells[j]; cells[j] = t; }
  const gap = 2 * r0, G = Math.max(1, gap), gw = Math.ceil(w / G), grid = new Map(), curls = [];
  const la = Math.atan2(light[1], light[0]);
  for (const i of cells) {
    const x = (i % w) + rnd() - 0.5, y = ((i / w) | 0) + rnd() - 0.5, gx = Math.floor(x / G), gy = Math.floor(y / G);
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) for (const p of grid.get((gy + dy) * gw + gx + dx) || []) if ((p.x - x) ** 2 + (p.y - y) ** 2 < gap * gap) { ok = false; break; }
    if (!ok) continue;
    const r = r0 * (1 + spread * (2 * rnd() - 1)), isLit = !!lit[i];
    // a lit ringlet always carries its crescent; one in shadow only sometimes, and thinner
    const crest = isLit || rnd() < shadowShare;
    const c = { x, y, i, r, lit: isLit, crest, ang: la + jitter * (2 * rnd() - 1), band: band * (isLit ? 1 : shadowBand) };
    curls.push(c);
    const key = gy * gw + gx; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(c);
  }
  // the crescents: cells at the rim of a ringlet (between 1 - band and 1 of its radius) within `arc` degrees of the
  // light's direction
  const crescent = new Uint8Array(n), cosArc = Math.cos(arc * Math.PI / 180);
  for (const c of curls) {
    if (!c.crest) continue;
    const ux = Math.cos(c.ang), uy = Math.sin(c.ang), R = Math.ceil(c.r) + 1;
    for (let yy = Math.max(0, Math.floor(c.y) - R); yy <= Math.min(h - 1, Math.floor(c.y) + R); yy++) for (let xx = Math.max(0, Math.floor(c.x) - R); xx <= Math.min(w - 1, Math.floor(c.x) + R); xx++) {
      const dx = xx - c.x, dy = yy - c.y, d = Math.hypot(dx, dy);
      if (d < c.r * (1 - c.band) || d > c.r || d < 1e-6) continue;
      if ((dx * ux + dy * uy) / d >= cosArc && allow[yy * w + xx]) crescent[yy * w + xx] = 1;
    }
  }
  // sets: greedy colouring, two ringlets conflict when their discs come within a tenth of their radii of touching
  const set = new Int32Array(curls.length).fill(-1);
  let sets = 0;
  for (let a = 0; a < curls.length; a++) {
    const used = new Set();
    for (let b = 0; b < a; b++) { const A = curls[a], B = curls[b]; if (Math.hypot(A.x - B.x, A.y - B.y) < 1.1 * (A.r + B.r)) used.add(set[b]); }
    let k = 0; while (used.has(k)) k++;
    set[a] = k; curls[a].set = k; sets = Math.max(sets, k + 1);
  }
  return { curls, crescent, sets };
}
