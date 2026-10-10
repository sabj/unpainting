// The cheat the guard forbids, run for real so the README can show it: hill-climbing toward the photo, annealed.
// Starting from blank paper, it proposes one dab or short stroke at a time (random place, small size shrinking over the
// run, soft round or flat footprint, partly transparent). Early colours are mostly random and drift toward the target's
// colour as the run cools. A mark that lowers the squared error against the target is kept; one that raises it is still
// For each stroke it draws many candidates and picks one by Boltzmann weight exp(-cost / T),
// the energy being the squared error; T falls to zero, so the sheet starts as noise and settles onto the photo. See bench/docs/anti-cheat.md. Nothing here is used by the painter.

// mulberry32: a small seeded generator, so every build makes the same marks.
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const R_MAX = 22, R_MIN = 3, A_MIN = 0.35, A_MAX = 0.85, JITTER = 10, T0 = 400, CANDIDATES = 48; // T0: per-pixel squared-error units

// Coverage of one footprint at offset (dx, dy) from its centre: a soft round dab, or a flat stroke 2.6r long and 0.8r
// wide along angle `cos, sin`. Both fade over their outer edge.
function coverage(mark, dx, dy) {
  if (!mark.flat) {
    const d = Math.hypot(dx, dy) / mark.r;
    return d >= 1 ? 0 : 1 - d * d;
  }
  const u = Math.abs(dx * mark.cos + dy * mark.sin) / (1.3 * mark.r);
  const v = Math.abs(-dx * mark.sin + dy * mark.cos) / (0.4 * mark.r);
  if (u >= 1 || v >= 1) return 0;
  return Math.min(1, 4 * (1 - u)) * Math.min(1, 3 * (1 - v));
}

function propose(next, target, width, height, progress) {
  const r = R_MIN + (R_MAX - R_MIN) * (1 - progress) ** 2;
  const x = Math.floor(next() * width), y = Math.floor(next() * height), p = (y * width + x) * 3;
  const angle = next() * Math.PI;
  const heat = (1 - progress) ** 2, wild = [next() * 255, next() * 255, next() * 255];
  const colour = [0, 1, 2].map(c => Math.max(0, Math.min(255, wild[c] * heat + target[p + c] * (1 - heat) + (next() - 0.5) * 2 * JITTER)));
  return { x, y, r, colour, flat: next() < 0.5, cos: Math.cos(angle), sin: Math.sin(angle), alpha: A_MIN + next() * (A_MAX - A_MIN) };
}

// The change in squared error if `mark` were laid on `canvas` (Float32 RGB), per covered pixel, or null if it covers nothing.
function costOf(canvas, target, width, height, mark) {
  const reach = Math.ceil(mark.flat ? 1.3 * mark.r : mark.r);
  const x0 = Math.max(0, mark.x - reach), x1 = Math.min(width - 1, mark.x + reach);
  const y0 = Math.max(0, mark.y - reach), y1 = Math.min(height - 1, mark.y + reach);
  let delta = 0, n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const a = mark.alpha * coverage(mark, x - mark.x, y - mark.y);
    if (a <= 0) continue;
    const p = (y * width + x) * 3; n++;
    for (let c = 0; c < 3; c++) {
      const now = canvas[p + c], then = now + (mark.colour[c] - now) * a, t = target[p + c];
      delta += (then - t) ** 2 - (now - t) ** 2;
    }
  }
  return n ? { delta, perPixel: delta / (3 * n) } : null;
}

function layMark(canvas, width, height, mark) {
  const reach = Math.ceil(mark.flat ? 1.3 * mark.r : mark.r);
  const x0 = Math.max(0, mark.x - reach), x1 = Math.min(width - 1, mark.x + reach);
  const y0 = Math.max(0, mark.y - reach), y1 = Math.min(height - 1, mark.y + reach);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const a = mark.alpha * coverage(mark, x - mark.x, y - mark.y);
    if (a <= 0) continue;
    const p = (y * width + x) * 3;
    for (let c = 0; c < 3; c++) canvas[p + c] += (mark.colour[c] - canvas[p + c]) * a;
  }
}

const errorOf = (canvas, target) => canvas.reduce((sum, v, p) => sum + (v - target[p]) ** 2, 0);

// A hill-climber over `paper` toward `target` (both RGB Uint8 buffers, width x height) that may keep `budget` marks in
// all, the same number of strokes the painter laid. `runTo(share)` advances it until that share of the budget is kept
// and returns { rgba, tried, kept, fresh, closed }: `fresh` holds the marks kept by this call ({ x, y, r, ... } in
// pixels), and `closed` is the share of the starting error removed so far.
export function hillClimber({ paper, target, width, height, budget, seed = 1908, maxTries = 100 * budget }) {
  const next = random(seed), canvas = Float32Array.from(paper), goal = Float32Array.from(target);
  const start = errorOf(canvas, goal);
  let error = start, tried = 0, kept = 0;
  return function runTo(share) {
    const fresh = [];
    const until = Math.round(budget * Math.min(1, share));
    for (; kept < until && tried < maxTries; tried++) {
      // Each stroke: draw CANDIDATES proposals and pick one by Boltzmann weight exp(-cost / T) on its per-pixel energy
      // change. Hot early, so poor marks still win often; as T falls the pick becomes the lowest-energy candidate.
      const progress = kept / budget, temperature = T0 * (1 - progress) ** 3 + 1e-6, options = [];
      for (let k = 0; k < CANDIDATES; k++, tried++) { const mark = propose(next, goal, width, height, progress), cost = costOf(canvas, goal, width, height, mark); if (cost) options.push({ mark, cost }); }
      if (!options.length) continue;
      const best = Math.min(...options.map(o => o.cost.perPixel)), w = options.map(o => Math.exp(-(o.cost.perPixel - best) / temperature));
      let pick = next() * w.reduce((a, b) => a + b, 0), chosen = options[0];
      for (let k = 0; k < options.length; k++) { pick -= w[k]; if (pick <= 0) { chosen = options[k]; break; } }
      layMark(canvas, width, height, chosen.mark); fresh.push(chosen.mark); error += chosen.cost.delta; kept++; tried--;
    }
    const rgba = Buffer.alloc(width * height * 4);
    for (let p = 0, q = 0; p < canvas.length; p += 3, q += 4) {
      rgba[q] = Math.round(canvas[p]); rgba[q + 1] = Math.round(canvas[p + 1]); rgba[q + 2] = Math.round(canvas[p + 2]); rgba[q + 3] = 255;
    }
    return { rgba, tried, kept, fresh, closed: Math.max(0, 1 - error / start) };
  };
}
