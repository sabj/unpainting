// Kept separate from the GPU CLI so the complete recipe can also be checked on
// the CPU reference. Physical dimensions and hand time do not change with grid.
export function paintLandscape(proof, mm) {
  const { S, B, sheet, O, w, h, raw, timed, capture, dry } = proof;
  const F = 0.8, X = v => 4 + F * v;
  const brush = (r, seed, flat = true) => B.createBrush({ model: 'section', flat, radius: F * r / mm, bristles: Math.max(12, Math.ceil(F * r / mm * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.3, seed });
  const lay = (b, pts, opts = {}) => timed(() => {
    const perStep = 0.7 * mm / (opts.speed ?? 60); let t = 0;
    B.stroke(b, sheet, pts.map(q => ({ ...q, x: X(q.x) / mm, y: X(q.y) / mm })), { upright: 'sweep', ...opts, between: () => { for (t += perStep; t >= O.dt; t -= O.dt) S.step(sheet, O); } });
  });
  const wait = sec => timed(() => { for (let t = 0; t < sec; t += O.dt) S.step(sheet, O); });
  const drop = (cx, cy, r, water, conc) => raw(() => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot((x + 0.5) * mm - X(cx), (y + 0.5) * mm - X(cy)) < F * r) S.deposit(sheet, y * w + x, water, conc.map(c => c * water));
  });
  // Graded sky: five connected flat sweeps, each picking up the bead.
  [1.5, 1.1, 0.7, 0.35, 0.12].forEach((c, k) => {
    const b = brush(5, 10 + k); B.dip(b, { water: 1, conc: [c, 0] });
    const [a, z] = k % 2 ? [39, 1] : [1, 39];
    lay(b, [{ x: a, y: 3 + k * 4.5, p: 1 }, { x: z, y: 3 + k * 4.5, p: 1 }], { speed: 50 });
  });
  capture('sky'); wait(40);
  const hill = []; for (let x = 0; x <= 40; x += 2) hill.push({ x, y: 27 + 3 * Math.sin(x / 6), p: 1 });
  for (const [seed, pts] of [[21, hill], [22, hill.map(q => ({ ...q, y: q.y + 6 })).reverse()]]) {
    const b = brush(4, seed); B.dip(b, { water: 0.9, conc: [0.5, 1.3] }); lay(b, pts, { speed: 45 });
  }
  capture('hill'); wait(60); drop(12, 27, 2.5, 0.2, [0.05, 0.02]); capture('drop');
  dry('band-1-dried');
  const shadow = []; for (let x = 18; x <= 40; x += 2) shadow.push({ x, y: 30 + 2 * Math.sin(x / 5), p: 0.9 });
  const b = brush(3, 31); B.dip(b, { water: 0.8, conc: [1.2, 1.0] }); lay(b, shadow, { speed: 60 });
  dry('band-2-dried'); capture('shadow');
  // Tree is a late dark painted accent, not an ink drawing under the washes.
  const curve = (x0, y0, x1, y1, bend, p0, p1, p2) => {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const s = i / 12, nx = -(y1 - y0), ny = x1 - x0, L = Math.hypot(nx, ny) || 1, k = bend * 4 * s * (1 - s);
      pts.push({ x: x0 + (x1 - x0) * s + nx / L * k, y: y0 + (y1 - y0) * s + ny / L * k, p: s < 0.5 ? p0 + (p1 - p0) * s * 2 : p1 + (p2 - p1) * (s - 0.5) * 2 });
    }
    return pts;
  };
  [[29, 33, 29.5, 14, 0.6, 0.5, 0.9, 0.2], [29.3, 22, 24, 15, -1.2, 0.6, 0.7, 0.1], [29.4, 19, 34, 12, 1, 0.5, 0.6, 0.1], [29.4, 25, 33, 20, 0.8, 0.4, 0.5, 0.1], [29.5, 16, 27, 11, -0.6, 0.4, 0.4, 0.1]].forEach((q, k) => {
    const tree = brush(0.8, 41 + k, false); B.dip(tree, { water: 0.6, conc: [1.4, 1.8] }); lay(tree, curve(...q), { speed: 40, upright: undefined });
  });
  const foreground = brush(5, 51); B.dip(foreground, { water: 0.6, conc: [1.6, 1.2] });
  lay(foreground, [{ x: 2, y: 37, p: 0.9 }, { x: 38, y: 36, p: 0.9 }], { speed: 250 });
  dry('painting');
}
