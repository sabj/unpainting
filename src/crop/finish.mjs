// The finish field: how far each part of the sheet is carried, 1 where finished, lower where it stops early as paper.
// A passage is laid only where the field reaches its place in the run, so the background keeps its first light washes.
// The subject is where the source is busy (and, with `lab`, distinct from the border colours), with a centre bias.
// DOM free: callers pass the blur.

/**
 * @param D        Float32Array, the source's density
 * @param blur     (F, w, h, sigma) => Float32Array
 * @param opts.background  the finish of the quietest parts (0 leaves them paper, 1 finishes everything)
 * @param opts.subject     the share of the sheet counted as fully finished
 * @param opts.centre      how much the centre is favoured (0 none)
 * @returns Float32Array in [background, 1]
 */
export function finishField(D, w, h, blur, { background = 0.35, subject = 0.35, centre = 0.35, scale = 0.06, lab = null, distinct = 0.6 } = {}) {
  const n = w * h, side = Math.min(w, h);
  const B = blur(D, w, h, Math.max(2, 0.02 * side));
  const busy = blur(Float32Array.from(D, (v, i) => Math.abs(v - B[i])), w, h, Math.max(2, scale * side));
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, busy[i]);
  // Distinct from the ground: busy clouds or sand texture are not subject. A cell's distance to the nearest
  // border colour (sky, sea, sand, a wall) says how much it stands out.
  let dist = null;
  if (lab) {
    const ring = [], mx = Math.round(0.06 * w), my = Math.round(0.06 * h);
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (x < mx || y < my || x >= w - mx || y >= h - my) ring.push(y * w + x);
    let cen = [0, 0.33, 0.66, 0.99].map(q => { const i = ring[Math.floor(q * (ring.length - 1))]; return [lab.L[i], lab.a[i], lab.b[i]]; });
    for (let it = 0; it < 8; it++) {
      const acc = cen.map(() => [0, 0, 0, 0]);
      for (const i of ring) { let b = 0, bd = Infinity; for (let c = 0; c < cen.length; c++) { const d = (lab.L[i] - cen[c][0]) ** 2 + (lab.a[i] - cen[c][1]) ** 2 + (lab.b[i] - cen[c][2]) ** 2; if (d < bd) { bd = d; b = c; } } acc[b][0] += lab.L[i]; acc[b][1] += lab.a[i]; acc[b][2] += lab.b[i]; acc[b][3]++; }
      cen = acc.map((q, c) => (q[3] ? [q[0] / q[3], q[1] / q[3], q[2] / q[3]] : cen[c]));
    }
    dist = new Float32Array(n); let dPeak = 0;
    for (let i = 0; i < n; i++) { let bd = Infinity; for (const c of cen) bd = Math.min(bd, Math.hypot(lab.L[i] - c[0], lab.a[i] - c[1], lab.b[i] - c[2])); dist[i] = bd; dPeak = Math.max(dPeak, bd); }
    dist = blur(Float32Array.from(dist, v => (dPeak > 1e-9 ? v / dPeak : 0)), w, h, Math.max(2, 0.02 * side));
  }
  const S = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, dx = (x - w / 2) / (w / 2), dy = (y - h / 2) / (h / 2), c = Math.max(0, 1 - Math.hypot(dx, dy) / Math.SQRT2);
    const b = peak > 1e-9 ? busy[i] / peak : 0, s = dist ? distinct * dist[i] + (1 - distinct) * b : b;
    S[i] = s * (1 - centre) + c * centre;
  }
  const sorted = Float32Array.from(S).sort(), top = sorted[Math.floor(n * (1 - subject))], low = sorted[Math.floor(n * 0.1)];
  return Float32Array.from(S, v => {
    const t = Math.max(0, Math.min(1, (v - low) / Math.max(1e-6, top - low)));
    return background + (1 - background) * t * t * (3 - 2 * t);
  });
}

/** A passage's mask clipped to the cells whose finish reaches its place in the run (0 first value, 1 last). */
export function clipToFinish(mask, finish, through) {
  const out = new Uint8Array(mask.length); let area = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] && finish[i] >= through) { out[i] = 1; area++; }
  return { mask: out, area };
}
