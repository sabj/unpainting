// Lays ringlet fur: the dark the clipped glazes owe (curls.mjs) goes down as dry-brush crescents round the lit curl
// tops, each round darker and over less of the coat, then locks across the outline.
// Each crescent uses the plan's own mix under it, leaned by `lean` towards cooler pigments where the coat faces up
// and warmer where it faces down.

import { createBrush, stroke } from '../media/brush.mjs';
import { step, dry } from '../media/sheet.mjs';
import { ringletMarks, edgeMarks } from './curls.mjs';

/**
 * @param sheet   the sheet, SC times the plan's size
 * @param plan    planCurls's result: { region, lit, owed, radius }
 * @param ctx     { w, h, SC, k, pigments, blur, dip (the painter's dip, which pads the sheet's other fluids), O,
 *                  D (the source's density), strength (the painter's charge per unit), cal (what a dry brush delivers),
 *                  seed, shoot (async, called after each round), stage (called with a stage record before shoot) }
 * @returns {{ rounds: number[], edge: number }} marks laid per round and across the outline
 */
export async function layCurls(sheet, plan, ctx, { rounds = [0.7, 0.35], water = 0.22, charge = 1, brushShare = 0.6, edge = 1, lean = 0.25, turns = [0.25, 0.8], follow = 0.35 } = {}) {
  const { w, h, SC, k, pigments, blur, dip, O, D, cal, seed, shoot, stage } = ctx, n = w * h;
  const { region, lit, owed, radius } = plan;
  // what is owed at each cell as one density, so marks go to the darkest ground first
  const weight = pigments.map(p => (p.K[0] + p.K[1] + p.K[2]) / 3);
  const want = new Float32Array(n);
  for (let i = 0; i < n; i++) if (region[i]) { let d = 0; for (let j = 0; j < k; j++) d += owed[i * k + j] * weight[j]; want[i] = d; }
  // the level lines the crescents lean along: the source at half the curls' radius
  const P = blur(D, w, h, Math.max(0.8, radius / 2));
  // which way the coat faces: the region smoothed over a few curls falls off upwards where the coat's top is
  const S = blur(Float32Array.from(region), w, h, Math.max(2, 3 * radius));
  const warmth = (() => { const v = pigments.map(p => p.K[2] - p.K[0]), m = Math.max(1e-6, ...v.map(Math.abs)); return v.map(x => x / m); })();
  const R = Math.max(0.8, brushShare * radius) * SC;
  const laid = [];
  // the mix owed under a mark, read only where it is on the coat (an edge lock carries what is owed where it is rooted)
  const mixOf = pts => {
    const mix = new Array(k).fill(0);
    let facing = 0, c = 0;
    for (const q of pts) {
      const x = Math.round(q.x), y = Math.round(q.y), i = y * w + x;
      if (!region[i]) continue;
      for (let j = 0; j < k; j++) mix[j] += owed[i * k + j];
      if (y > 0 && y < h - 1) facing += S[i + w] - S[i - w];       // positive where the coat lies below: it faces up
      c++;
    }
    if (!c) return mix;
    const tilt = Math.max(-1, Math.min(1, facing / c * 4 * radius));
    return mix.map((v, j) => Math.max(0, v / c * (1 - lean * tilt * warmth[j])));
  };
  const lay = (marks, { press = 1, mark = 'crescent' } = {}) => {
    marks.forEach((m, idx) => {
      const mix = mixOf(m);
      if (mix.every(v => v <= 1e-6)) return;
      const b = createBrush({ radius: R, bristles: Math.max(8, Math.ceil(R * 3)), capacity: 22, belly: 2, feed: 0.07, give: 0.65, free: 0.32, film: 0.22, splay: 0.08, stiffness: 5, wetMix: 0, bridge: 0.42, bridgeSoft: 1.0, streak: 0.55, seed: seed + idx * 31 + (mark === 'edge' ? 7 : 0) });
      dip(b, { water, conc: mix.map(v => v * ctx.strength * cal * charge * press) });
      stroke(b, sheet, m.map(q => ({ x: (q.x + 0.5) * SC, y: (q.y + 0.5) * SC, p: q.p })), {});
      if ((idx + 1) % 40 === 0) step(sheet, O);
    });
  };
  for (let r = 0; r < rounds.length; r++) {
    // each round starts again from the darkest of what is owed, so the second, smaller round lands on the deepest dark
    const marks = ringletMarks(want, lit, P, w, h, { radius, coverage: rounds[r], spacing: Math.max(1, Math.round(radius / 3)), seed: seed + 101 * r, follow, turns });
    lay(marks);
    laid.push(marks.length);
    for (let q = 0; q < 40; q++) step(sheet, O);
    dry(sheet, 20000, O, { levelMax: 140, dt: 6 });
    stage?.({ stage: 'curls', round: r + 1, of: rounds.length, marks: marks.length });
    await shoot?.();
  }
  let edges = 0;
  if (edge > 0) {
    const marks = edgeMarks(region, w, h, blur, { radius, seed: seed + 977 });
    lay(marks, { press: edge, mark: 'edge' });
    edges = marks.length;
    for (let q = 0; q < 40; q++) step(sheet, O);
    dry(sheet, 20000, O, { levelMax: 140, dt: 6 });
    stage?.({ stage: 'curls', edge: edges });
    await shoot?.();
  }
  return { rounds: laid, edge: edges };
}
