// --dogscribble 1 (with --dogpaint): technique for a dark curly dog coat, laid by the pen as loose looping scribble
// over a pale wash, not as ruled hatch or flat fills. Highlights and flecks stay paper; no outline is traced. DOM free.

// Loop strokes over the dog. `dark` is 0..1 per cell (the share of the darkest), `keep` 1 where the pen may go.
// Each stroke loops at about `loop` of the width while drifting down the coat; `fly` of them may pass the silhouette.
function scribbleStrokes({ mask, keep, dark, w, h, rnd, width, budget = 2.2, loop = 0.022, len = [0.12, 0.35], fly = 0.25, flyLen = 0.06, hatch = 0.15, step = 0.8 }) {
  const n = w * h, cover = new Float32Array(n), strokes = [];
  const cells = []; let want = 0;
  for (let i = 0; i < n; i++) if (mask[i] && keep[i]) { cells.push(i); want += dark[i]; }
  if (!cells.length) return strokes;
  // the fall of the coat: a gradient of the distance into the dog, turned along the silhouette, blended with down
  const inside = distanceInside(mask, w, h);
  const total = budget * want;                                          // cells of stroke length to lay, all told
  const rLoop = Math.max(1.2, loop * width), kLoop = 1 / rLoop;
  let laid = 0, tries = 0;
  const pick = () => {
    // a few candidates, the one lacking most wins
    let best = -1, bestV = -Infinity;
    for (let t = 0; t < 6; t++) { const i = cells[Math.floor(rnd() * cells.length)], v = dark[i] - 0.35 * cover[i] + 0.1 * rnd(); if (v > bestV) { bestV = v; best = i; } }
    return best;
  };
  while (laid < total && tries++ < 20000) {
    const i0 = pick(); if (i0 < 0 || dark[i0] < 0.05) continue;
    let x = (i0 % w) + rnd() - 0.5, y = ((i0 / w) | 0) + rnd() - 0.5;
    let a = Math.PI / 2 + (rnd() - 0.5) * 2.4, turn = (rnd() < 0.5 ? -1 : 1) * kLoop * (0.7 + 0.6 * rnd());
    const L = width * (len[0] + (len[1] - len[0]) * rnd()), flyaway = rnd() < fly;
    let run = [], t = 0, outside = 0;
    const flush = () => { if (run.length >= 4) strokes.push(run); run = []; };
    while (t < L) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= w || yi >= h) break;
      const i = yi * w + xi;
      if (!mask[i]) { if (!flyaway || (outside += step) > flyLen * width) break; }
      else if (!keep[i]) { flush(); }
      else {
        const s = Math.max(0.15, Math.min(1, 0.25 + 0.75 * dark[i]));
        run.push({ x, y, s });
        cover[i] += 1;
      }
      if (!mask[i] && flyaway) run.push({ x, y, s: 0.3 });
      // the loop, the drift down the coat and along its edge, and now and then a change of hand
      if (rnd() < 0.04) turn = -turn;
      const fx = gradX(inside, w, h, xi, yi), fy = gradY(inside, w, h, xi, yi), near = Math.max(0, 1 - inside[i] / (0.08 * width));
      const along = Math.atan2(fx, -fy), down = Math.PI / 2, drift = near > 0.3 ? along : down;
      a += turn * step + 0.08 * Math.sin(drift - a);
      x += Math.cos(a) * step; y += Math.sin(a) * step; t += step; laid += step;
    }
    flush();
  }
  // crossing hatch in the darkest: short strokes at two angles
  if (hatch > 0) {
    const deep = cells.filter(i => dark[i] > 0.8);
    const count = Math.round(hatch * deep.length / Math.max(4, 0.05 * width));
    for (let k = 0; k < count && deep.length; k++) {
      const i = deep[Math.floor(rnd() * deep.length)], a = (k % 2 ? 0.6 : -0.9) + (rnd() - 0.5) * 0.4, l = 0.04 * width * (0.6 + 0.8 * rnd());
      const pts = [];
      for (let t = -l / 2; t <= l / 2; t += step) {
        const x = (i % w) + Math.cos(a) * t, y = ((i / w) | 0) + Math.sin(a) * t, xi = Math.round(x), yi = Math.round(y);
        if (xi < 0 || yi < 0 || xi >= w || yi >= h || !mask[yi * w + xi] || !keep[yi * w + xi]) break;
        pts.push({ x, y, s: 0.5 + 0.5 * dark[yi * w + xi] });
      }
      if (pts.length >= 3) strokes.push(pts);
    }
  }
  return strokes;
}

function distanceInside(mask, w, h) {
  const d = new Float32Array(w * h).fill(1e9);
  for (let i = 0; i < w * h; i++) if (!mask[i]) d[i] = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (x) d[i] = Math.min(d[i], d[i - 1] + 1); if (y) d[i] = Math.min(d[i], d[i - w] + 1); }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (x < w - 1) d[i] = Math.min(d[i], d[i + 1] + 1); if (y < h - 1) d[i] = Math.min(d[i], d[i + w] + 1); }
  return d;
}
const gradX = (f, w, h, x, y) => (x > 0 && x < w - 1 ? (f[y * w + x + 1] - f[y * w + x - 1]) / 2 : 0);
const gradY = (f, w, h, x, y) => (y > 0 && y < h - 1 ? (f[(y + 1) * w + x] - f[(y - 1) * w + x]) / 2 : 0);

// the pass: strokes in batches, each a frame, with the sheet's ink pigment
export async function scribblePass(P, { part, of }) {
  const { w, h, n, SC, W2, H2, mask, flecks, sheen, num, log, setStage, snap, drawGestures, inkAt, sheetK, sheet, O, SRC } = P;
  if (inkAt == null) { log('dog scribble: the sheet carries no ink (use --outlinemedium ink)'); return; }
  if (!P.scribble) {
    let s = (Math.round(P.SEED) + 4409) | 0 || 1; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    // the dark: the source's density inside the dog, from the reserve's sheen level (0) to its 95th percentile (1)
    const v = []; for (let i = 0; i < n; i++) if (mask[i]) v.push(SRC[i]); v.sort((a, b) => a - b);
    const lo = num('dogsheenod', 0.9), hi = Math.max(lo + 0.1, v[Math.floor(0.95 * (v.length - 1))]);
    const dark = Float32Array.from(SRC, (d, i) => (mask[i] ? Math.max(0, Math.min(1, (d - lo) / (hi - lo))) : 0));
    const keep = Uint8Array.from(mask, (m, i) => (m && !flecks[i] && !sheen[i] ? 1 : 0));
    const [l0, l1] = P.opt('dogscribblelen', '0.12,0.35').split(',').map(Number);
    P.scribble = scribbleStrokes({ mask, keep, dark, w, h, rnd, width: P.width, budget: num('dogscribble', 1) * num('dogscribblebudget', 2.2), loop: num('dogscribbleloop', 0.022), len: [l0, l1], fly: num('dogscribblefly', 0.25), hatch: num('dogscribblehatch', 0.15) });
    log(`dog scribble: ${P.scribble.length} strokes, ${P.scribble.reduce((a, g) => a + g.length, 0)} points, over a dark of ${lo.toFixed(2)} to ${hi.toFixed(2)} source density`);
  }
  const all = P.scribble, per = Math.ceil(all.length / of), mine = all.slice(part * per, (part + 1) * per);
  const batches = 3, each = Math.ceil(mine.length / batches), want = new Float32Array(W2 * H2).fill(1);
  const ink = new Array(sheetK).fill(0); ink[inkAt] = num('dogscribbleconc', num('inkconc', 10));
  const pen = { nib: num('dogscribblenib', 0.8), flex: 1.5, travel: 1.5, reach: 12, reservoir: 250, feed: 1.2 };
  for (let b = 0; b < batches; b++) {
    const gs = mine.slice(b * each, (b + 1) * each).map(g => ({ points: g.map(q => ({ x: q.x * SC, y: q.y * SC, s: q.s })) }));
    if (!gs.length) continue;
    P.clock('strokes', () => drawGestures(sheet, gs, want, W2, H2, { ink, pen, O, peak: 1 }));
    setStage({ stage: 'dog paint', step: `scribble ${part + 1} of ${of}, batch ${b + 1} of ${batches}`, strokes: gs.length });
    snap();
  }
  P.count('dog scribble', mine.length);
  log(`dog scribble: part ${part + 1} of ${of}, ${mine.length} strokes; the dog holds ${P.held(mask)}`);
}
