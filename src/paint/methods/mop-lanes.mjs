// The mop's lanes over a shape, for the broad washes (masses.mjs) and the passages (src/paint/techniques/passages).
// The disc is never clamped to the shape: across a gap wider than the mop the hand lifts, and each sweep overhangs.
//   --mopgap 1.0    lanes this many mop radii apart
//   --mopover 0.2   each sweep overhangs its run of the shape by this many radii at both ends
//   --moparc 0.08   a wrist's sweep bows by this share of its length

// A lane maker read against the command line: (M, W, H, R, angle, seed) to the paths of a mop of radius R laid
// across mask M (W by H) at angle, each a list of { x, y, r, p } points, alternate lanes run back the other way.
export function makeMopLanes({ num }) {
  return (M, W, H, R, angle, seed) => {
    let s = seed * 7919 + 13; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const ca = Math.cos(angle), sa = Math.sin(angle), nx = -sa, ny = ca;
    let lo = Infinity, hi = -Infinity, alo = Infinity, ahi = -Infinity;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (M[y * W + x]) { const t = x * nx + y * ny, u = x * ca + y * sa; if (t < lo) lo = t; if (t > hi) hi = t; if (u < alo) alo = u; if (u > ahi) ahi = u; }
    if (!(hi >= lo)) return [];
    const paths = [], gap = num('mopgap', 1.0) * R, over = num('mopover', 0.2) * R, stepLen = Math.max(2, R / 4), wob = 0.06 * R, arc = num('moparc', 0.08);
    let k = 0;
    for (let t = lo + gap * 0.5; t <= hi; t += gap, k++) {
      // where this lane crosses the shape: runs of it, and runs closer than a mop are one sweep
      const runs = []; let a = null, b = null;
      for (let u = alo; u <= ahi; u += 1) {
        const x = Math.round(t * nx + u * ca), y = Math.round(t * ny + u * sa);
        const inside = x >= 0 && y >= 0 && x < W && y < H && M[y * W + x];
        if (inside) { if (a === null) a = u; b = u; }
        else if (a !== null && u - b > 1.2 * R) { runs.push([a, b]); a = null; }
      }
      if (a !== null) runs.push([a, b]);
      const forward = k % 2 === 0;
      for (const [u0r, u1r] of forward ? runs : runs.slice().reverse()) {
        const u0 = u0r - over, u1 = u1r + over, len = u1 - u0, pts = [], phase = rnd() * 6.28;
        for (let d = 0; d <= len + 1e-6; d += stepLen) {
          const u = forward ? u0 + Math.min(d, len) : u1 - Math.min(d, len);
          const w0 = wob * Math.sin(d / (2.5 * R) * 6.28 + phase) + arc * len * Math.sin(Math.PI * Math.min(1, d / len)); // a wrist's sweep bows a little
          pts.push({ x: t * nx + u * ca + w0 * nx, y: t * ny + u * sa + w0 * ny, r: R, p: 1 });
        }
        if (pts.length >= 2) paths.push(pts);
      }
    }
    return paths;
  };
}
