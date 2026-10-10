// Gestures sampled as whole trajectories rather than pixel chains repaired afterwards, so marks can run long.
//   propose   start where ink is still wanted and follow its direction with momentum: turn towards it gently and
//             carry across short gaps
//   score     ink explained, less paper crossed, less the effort of the turns
//   accept    keep it if it explains enough, and claim what it covered so the next gesture goes elsewhere
// DOM free.

/** Bilinear sample of a field, clamped at the edges. */
function at(F, w, h, x, y) {
  x = Math.max(0, Math.min(w - 1.001, x)); y = Math.max(0, Math.min(h - 1.001, y));
  const ix = x | 0, iy = y | 0, u = x - ix, v = y - iy, i = iy * w + ix;
  return (1 - v) * ((1 - u) * F[i] + u * F[i + 1]) + v * ((1 - u) * F[i + w] + u * F[i + w + 1]);
}

/** The direction the ink runs at a point and how strongly, from the structure tensor of D.
 *  Returned as a unit vector along the line and a coherence 0..1. */
export function flowAt(D, w, h, x, y, r = 2) {
  let xx = 0, xy = 0, yy = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const gx = (at(D, w, h, x + dx + 1, y + dy) - at(D, w, h, x + dx - 1, y + dy)) / 2;
    const gy = (at(D, w, h, x + dx, y + dy + 1) - at(D, w, h, x + dx, y + dy - 1)) / 2;
    xx += gx * gx; xy += gx * gy; yy += gy * gy;
  }
  const tr = xx + yy, det = xx * yy - xy * xy;
  const root = Math.sqrt(Math.max(0, tr * tr / 4 - det)), big = tr / 2 + root, small = tr / 2 - root;
  let ax = xy, ay = big - xx;
  if (Math.abs(ax) + Math.abs(ay) < 1e-9) { ax = big - yy; ay = xy; }
  const m = Math.hypot(ax, ay) || 1;
  // along the line is perpendicular to the dominant gradient
  return { x: -ay / m, y: ax / m, coherence: big > 1e-9 ? (big - small) / big : 0, strength: Math.sqrt(big) };
}

/** The strongest ink within `reach` across the walking direction, and its offset, so slight drift does not lose
 *  the line. */
function seeAcross(D, w, h, x, y, dx, dy, reach) {
  const nx = -dy, ny = dx;
  let best = at(D, w, h, x, y), off = 0;
  for (let d = -reach; d <= reach; d += 0.5) {
    if (!d) continue;
    const v = at(D, w, h, x + nx * d, y + ny * d);
    if (v > best) { best = v; off = d; }
  }
  return { ink: best, off, nx, ny };
}

/** Walk a trajectory from a point, turning towards the ink but limited by momentum. */
function walk(D, claimed, w, h, x0, y0, dx0, dy0, o) {
  const pts = [{ x: x0, y: y0 }];
  let x = x0, y = y0, dx = dx0, dy = dy0, dry = 0, run = 0;
  for (let step = 0; step < o.maxSteps; step++) {
    const f = flowAt(D, w, h, x, y, o.tensor);
    let tx = f.x, ty = f.y;
    if (tx * dx + ty * dy < 0) { tx = -tx; ty = -ty; }          // a line has no direction; keep the current heading
    // Momentum caps the turn; weak or incoherent flow turns it less, so noise cannot spin the gesture round.
    const pull = o.turn * f.coherence * Math.min(1, f.strength / o.strong);
    let nx = dx + (tx - dx) * pull, ny = dy + (ty - dy) * pull;
    // a little wander, so two gestures over the same form are not the same line twice
    const a = o.rnd() * 2 - 1;
    const c = Math.cos(a * o.wander), s = Math.sin(a * o.wander);
    [nx, ny] = [nx * c - ny * s, nx * s + ny * c];
    const m = Math.hypot(nx, ny) || 1; dx = nx / m; dy = ny / m;
    x += dx * o.step; y += dy * o.step;
    run += o.step;
    // Start a new gesture after maxRun to bound stroke length.
    if (run > o.maxRun) break;
    if (x < 1 || y < 1 || x > w - 2 || y > h - 2) break;
    // settle onto the line it can see beside it, gently, so the path rides the ink instead of drifting off it
    const seen = seeAcross(D, w, h, x, y, dx, dy, o.reach);
    if (seen.ink >= o.floor && seen.off) { x += seen.nx * seen.off * o.settle; y += seen.ny * seen.off * o.settle; }
    pts.push({ x, y });
    // crossing bare paper is allowed for up to `carry` px, then the gesture stops
    const ink = seen.ink;
    dry = ink < o.floor ? dry + o.step : 0;
    if (dry > o.carry) { pts.length = Math.max(2, pts.length - Math.ceil(dry / o.step)); break; }
  }
  return pts;
}

/**
 * Boundary or texture: the share of the mean cross-mark difference that survives averaging along the mark.
 * 1 is a boundary held on one side all the way, 0 is texture.
 */
function sidedness(D, w, h, pts, reach = 5) {
  if (pts.length < 4) return 0;
  let sum = 0, absSum = 0, count = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], q = pts[i - 1];
    let dx = p.x - q.x, dy = p.y - q.y; const m = Math.hypot(dx, dy); if (m < 1e-6) continue;
    dx /= m; dy /= m;
    const nx = -dy, ny = dx;
    // far enough out to be clear of the mark's own ink on both sides
    const left = at(D, w, h, p.x + nx * reach, p.y + ny * reach);
    const right = at(D, w, h, p.x - nx * reach, p.y - ny * reach);
    const diff = left - right;
    sum += diff; absSum += Math.abs(diff); count++;
  }
  if (!count || absSum < 1e-6) return 0;
  return Math.abs(sum) / absSum;
}

/** What a path is worth: the ink it explains, less the paper it crosses, less the effort of its turns. */
function score(D, claimed, w, h, pts, o) {
  if (pts.length < 2) return { value: -Infinity, gain: 0, length: 0 };
  let gain = 0, waste = 0, length = 0, bend = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], q = pts[i - 1], d = Math.hypot(p.x - q.x, p.y - q.y);
    length += d;
    const ink = at(D, w, h, p.x, p.y), had = at(claimed, w, h, p.x, p.y);
    const fresh = Math.max(0, ink - had);
    if (ink >= o.floor) gain += fresh * d; else waste += d;
    if (i > 1) {
      const r = pts[i - 2];
      const a1 = Math.atan2(q.y - r.y, q.x - r.x), a2 = Math.atan2(p.y - q.y, p.x - q.x);
      let t = a2 - a1; while (t > Math.PI) t -= 2 * Math.PI; while (t < -Math.PI) t += 2 * Math.PI;
      bend += t * t;
    }
  }
  // length is rewarded, so of two gestures explaining the same ink the longer wins
  const value = gain * (1 + o.longer * Math.log1p(length / o.unit)) - o.wasteCost * waste - o.bendCost * bend;
  return { value, gain, length, waste };
}

/** Scores the path as walked; no perturbation is applied. */
function refine(D, claimed, w, h, pts, o) {
  return { pts, ...score(D, claimed, w, h, pts, o) };
}

/** A cheap separable blur, for looking at the picture from further away. */
function blur(F, w, h, sigma) {
  if (!sigma) return F;
  const r = Math.max(1, Math.ceil(sigma * 2.5)), k = new Float32Array(2 * r + 1);
  let sum = 0; for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) a += F[y * w + Math.min(w - 1, Math.max(0, x + i))] * k[i + r]; tmp[y * w + x] = a; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) a += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * k[i + r]; out[y * w + x] = a; }
  return out;
}

const makeRnd = seed => { let s = (seed | 0) || 1; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); };

/**
 * Plan a drawing as gestures.
 *
 * @param D  the density the drawing should explain, at the resolution the marks will be made in
 * @returns  paths, longest first, each with the ink it explains and its length
 */
function planPass(D, w, h, {
  seed = 7,
  // a gesture starts where the picture still wants ink and the ink runs coherently
  floor = 0.05, strong = 0.25,
  // how it carries: the step it takes, how much of the ink's direction it takes per step, how far it will cross paper
  step = 1.5, turn = 0.35, wander = 0.05, carry = 14, maxSteps = 900, tensor = 2,
  // how far one gesture can run before the arm has to be moved, as a share of the sheet's short side
  reachShare = 0.55,
  // how far to either side the hand looks for the line, and how much of that offset it takes per step
  reach = 3, settle = 0.5,
  // what a path is worth
  longer = 0.9, unit = 40, wasteCost = 0.004, bendCost = 0.02,

  refines = 24, nudge = 1.2, smoothSpan = 6,

  tries = 400, keep = Infinity, minLength = 8, minGain = 0.4, claimed: given = null, pass = 0,
  // the density a gesture claims against (the unblurred picture), so coarse passes do not leave lines unspent
  spend = null,
  // the picture itself, for telling a boundary from texture, and how sure it has to be
  sides = null, sideReach = 5, minSided = 0,
  // stop when what is left unexplained is this small a share of what the picture wanted
  explain = 0.12,
  // how wide a stroke's claim is: ink under an accepted gesture is spent
  claimRadius = 2,
} = {}) {
  const n = w * h, rnd = makeRnd(seed);
  const o = { floor, strong, step, turn, wander, carry, maxSteps, tensor, reach, settle, maxRun: reachShare * Math.min(w, h), longer, unit, wasteCost, bendCost, refines, nudge, smoothSpan, rnd };
  const claimed = given || new Float32Array(n);

  // where to start: cells the picture wants and nothing has claimed, taken strongest first but not in strict order,
  // so the gestures are not all drawn from the same corner
  const order = [];
  for (let i = 0; i < n; i++) if (D[i] > floor) order.push(i);
  order.sort((a, b) => D[b] - D[a]);

  const out = [];
  let cursor = 0;
  for (let t = 0; t < tries && out.length < keep; t++) {
    // pick a seed cell: mostly the strongest unclaimed, sometimes further down, so the sampler explores
    let i = -1;
    for (let scan = 0; scan < 400 && cursor < order.length; scan++) {
      const pick = order[Math.min(order.length - 1, cursor + (rnd() < 0.7 ? 0 : Math.floor(rnd() * 60)))];
      if ((spend ? spend[pick] : D[pick]) - claimed[pick] > minGain * floor) { i = pick; break; }
      cursor++;
    }
    if (i < 0) break;
    if (t % 8 === 0) {
      let left = 0, all = 0;
      for (let q = 0; q < n; q++) if (D[q] > floor) { all += D[q]; left += Math.max(0, D[q] - claimed[q]); }
      if (all > 0 && left / all < explain) break;      // the picture is explained; a person would stop here
    }
    const sx = i % w, sy = (i / w) | 0;
    const f = flowAt(D, w, h, sx, sy, tensor);
    if (f.coherence < 0.2) { cursor++; continue; }

    // walk both ways from the seed and join the halves, so one mark can cover a whole form
    const fore = walk(D, claimed, w, h, sx, sy, f.x, f.y, o);
    const back = walk(D, claimed, w, h, sx, sy, -f.x, -f.y, o);
    const pts = [...back.slice(1).reverse(), { x: sx, y: sy }, ...fore.slice(1)];
    const done = refine(D, claimed, w, h, pts, o);
    if (done.length < minLength || done.gain <= 0) { cursor++; continue; }
    // boundary test on the picture, not the residual, which has had the regions taken out
    const sided = sides ? sidedness(sides, w, h, done.pts, sideReach) : 1;
    if (sided < minSided) { cursor++; continue; }


    for (const p of done.pts) {
      const x0 = Math.max(0, Math.round(p.x - claimRadius)), x1 = Math.min(w - 1, Math.round(p.x + claimRadius));
      const y0 = Math.max(0, Math.round(p.y - claimRadius)), y1 = Math.min(h - 1, Math.round(p.y + claimRadius));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - p.x, y - p.y); if (d > claimRadius) continue;
        const j = y * w + x;
        // ink under the stroke is fully spent; a tapered claim left lines to be redrawn many times
        const strength = spend ? spend[j] : D[j];
        claimed[j] = Math.max(claimed[j], strength * Math.min(1, claimRadius + 0.5 - d));
      }
    }
    out.push({ points: done.pts, length: done.length, gain: done.gain, waste: done.waste, pass, sided });
  }

  // kept in the order found: each gesture claims what it covered, so the order already spreads across the sheet
  const kept = Number.isFinite(keep) ? out.slice(0, keep) : out;
  return { gestures: kept, considered: out.length, claimed };
}

/** The statistic that separates a drawing from a tangle: the share of mark length that is in long marks. */
export function longShare(gestures, sheetWidth, fraction = 0.1) {
  const total = gestures.reduce((a, g) => a + g.length, 0);
  if (!total) return 0;
  return gestures.filter(g => g.length > sheetWidth * fraction).reduce((a, g) => a + g.length, 0) / total;
}

/**
 * Plan a drawing coarse to fine: run the sampler over a sequence of blur scales, each pass claiming what it drew.
 * A mark's `pass` is the order to draw it in. Coarse passes get a longer carry and a slower turn.
 */
export function planGestures(D, w, h, options = {}) {
  const { scales = [6, 2.5, 0], perPass = null, keep = Infinity, seed = 7, ...rest } = options;
  const n = w * h, claimed = new Float32Array(n);
  const all = [];
  for (let p = 0; p < scales.length; p++) {
    const sigma = scales[p], coarse = sigma > 0;
    const field = blur(D, w, h, sigma);
    // blurring spreads the ink thinner; the floor follows it down so a coarse pass still finds its lines
    const floorScale = coarse ? 1 / (1 + sigma * 0.55) : 1;
    const budget = perPass ? perPass[p] ?? perPass[perPass.length - 1] : (Number.isFinite(keep) ? Math.max(1, Math.round(keep / scales.length)) : Infinity);
    const { gestures } = planPass(field, w, h, {
      ...rest, seed: seed + p * 101, claimed, pass: p, keep: budget, spend: D,
      floor: (rest.floor ?? 0.05) * floorScale,
      carry: (rest.carry ?? 14) * (coarse ? 2.2 : 1),
      turn: (rest.turn ?? 0.35) * (coarse ? 0.6 : 1),
      minLength: (rest.minLength ?? 8) * (coarse ? 4 : 1),
      claimRadius: (rest.claimRadius ?? 2) * (coarse ? 1 + sigma * 0.35 : 1),
    });
    all.push(...gestures);
  }
  return { gestures: all, claimed };
}
