// Which boundaries of a passage are soft (--softchoice). The planner's cell test (low contrast with the next cell) calls
// 86 to 96% of boundaries soft, because almost no value steps much within one cell; opening them all blurs the plate. A
// painter softens an edge where the wash is meant to die away, and keeps it where the form turns sharply. So a boundary
// cell is soft only when the passage's own demand has faded there, the target has no step within reach of the brush tip,
// and enough such cells run together to read as an edge. Planning only, from the plan's fields.

/**
 * @param candidates boundary cells the planner's cell test passed
 * @param G the passage's demand field, amount its mean charge
 * @param values the plan's value field (0..1)
 * @returns {{soft: number[], hard: number[]}} every candidate lands in one of the two
 */
export function chooseSoftCells({ candidates, G, amount, values, w, h, cellMm, fade = 0.5, step = 0.14, reachMm = 1.5, minChainMm = 5 }) {
  const reach = Math.max(1, Math.round(reachMm / cellMm)), minChain = Math.max(3, Math.round(minChainMm / cellMm));
  const passes = new Set();
  for (const i of candidates) {
    if (!(G[i] <= fade * amount)) continue;
    const x = i % w, y = Math.floor(i / w);
    let lo = Infinity, hi = -Infinity;
    for (let yy = Math.max(0, y - reach); yy <= Math.min(h - 1, y + reach); yy++) {
      for (let xx = Math.max(0, x - reach); xx <= Math.min(w - 1, x + reach); xx++) {
        const v = values[yy * w + xx];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (hi - lo < step) passes.add(i);
  }
  const soft = [], seen = new Set();
  for (const s of passes) {
    if (seen.has(s)) continue;
    const chain = [s];
    seen.add(s);
    for (let p = 0; p < chain.length; p++) {
      const x = chain[p] % w, y = Math.floor(chain[p] / w);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy, j = yy * w + xx;
        if ((dx || dy) && xx >= 0 && xx < w && yy >= 0 && yy < h && passes.has(j) && !seen.has(j)) { seen.add(j); chain.push(j); }
      }
    }
    if (chain.length >= minChain) soft.push(...chain);
  }
  const softSet = new Set(soft);
  return { soft, hard: candidates.filter(i => !softSet.has(i)) };
}

/**
 * The direction lanes should run so each lane lies along one strength of the passage's demand: the iso-line direction of
 * the least-squares plane through G, in radians. Null when the plane spans under `minSpan` of the mean across the
 * passage, since a nearly flat wash has no gradient to follow and its lanes should follow its shape.
 */
export function gradientAngle(list, G, w, { minSpan = 0.25 } = {}) {
  const c = list.length;
  if (c < 3) return null;
  let sx = 0, sy = 0, sg = 0;
  for (const i of list) { sx += i % w; sy += Math.floor(i / w); sg += G[i]; }
  const mx = sx / c, my = sy / c, mg = sg / c;
  if (!(mg > 0)) return null;
  let xx = 0, yy = 0, xy = 0, xg = 0, yg = 0;
  for (const i of list) {
    const x = i % w - mx, y = Math.floor(i / w) - my, g = G[i] - mg;
    xx += x * x; yy += y * y; xy += x * y; xg += x * g; yg += y * g;
  }
  const det = xx * yy - xy * xy;
  if (!(Math.abs(det) > 1e-9)) return null;
  const a = (xg * yy - yg * xy) / det, b = (yg * xx - xg * xy) / det, norm = Math.hypot(a, b);
  if (!(norm > 0)) return null;
  // the plane's span over the passage along its gradient
  let lo = Infinity, hi = -Infinity;
  for (const i of list) { const t = (i % w - mx) * a + (Math.floor(i / w) - my) * b; if (t < lo) lo = t; if (t > hi) hi = t; }
  if ((hi - lo) / mg < minSpan) return null;
  return Math.atan2(a, -b);
}
