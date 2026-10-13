// Flow-shaped passages (--flowshape mm). A value passage is a threshold of the target's value field, so its outline
// is a cell staircase and, in fur and hair, a scatter of isotropic patches: the leopard dabs and topographic rims the
// review panels name. A painter lays such a passage as strokes that follow the form: along the fur, along a lid, along
// a curl. Here each passage mask is smoothed along the target's structure direction (a short streamline average,
// line-integral style) and lightly across it, then cut at one half. Where the target has a clear direction the shape
// becomes streaks that follow it; where it has none the shape only loses its staircase. Planning only: no paint, no
// target read after the guard seals it. Reserved lights stay out and no cell outside `allowed` is added.

// The structure direction of a value field: the gradient's dominant orientation turned a quarter (along stripes and
// edges), with its coherence 0..1. sigma in cells.
export function flowField(V, w, h, { sigma = 3 } = {}) {
  const n = w * h, gx = new Float32Array(n), gy = new Float32Array(n);
  const B = boxBlur(V, w, h, 1);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; gx[i] = (B[i + 1] - B[i - 1]) / 2; gy[i] = (B[i + w] - B[i - w]) / 2; }
  const r = Math.max(1, Math.round(sigma));
  const Jxx = boxBlur(gx.map((v) => v * v), w, h, r), Jyy = boxBlur(gy.map((v) => v * v), w, h, r), Jxy = boxBlur(gx.map((v, i) => v * gy[i]), w, h, r);
  const dx = new Float32Array(n), dy = new Float32Array(n), coherence = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = 0.5 * Math.atan2(2 * Jxy[i], Jxx[i] - Jyy[i]) + Math.PI / 2;
    dx[i] = Math.cos(a); dy[i] = Math.sin(a);
    const tr = Jxx[i] + Jyy[i], det = Math.sqrt((Jxx[i] - Jyy[i]) ** 2 + 4 * Jxy[i] ** 2);
    coherence[i] = tr > 1e-9 ? det / tr : 0;
  }
  return { dx, dy, coherence };
}

// Two passes of a separable box mean of radius r (close to a gaussian).
export function boxBlur(src, w, h, r) {
  let a = Float32Array.from(src);
  for (let pass = 0; pass < 2; pass++) {
    const t = new Float32Array(w * h), o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) { let s = 0; const row = y * w; for (let x = -r; x <= r; x++) s += a[row + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { t[row + x] = s / (2 * r + 1); s += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { o[y * w + x] = s / (2 * r + 1); s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
    a = o;
  }
  return a;
}

// The mask smoothed along the field and cut at one half. along: streamline half-length in cells at full coherence;
// across: cells sampled each side across the flow (the staircase smoothing everywhere). Cells not in `allowed`
// (when given) and cells in `protect` are never set.
export function flowShapeMask(M, w, h, field, { along = 6, across = 1, minCoherence = 0.25, allowed = null, protect = null } = {}) {
  const n = w * h, out = new Uint8Array(n), reach = Math.ceil(along + across + 1);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < n; i++) if (M[i]) { const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return out;
  const at = (x, y) => { const xi = Math.round(x), yi = Math.round(y); return xi < 0 || yi < 0 || xi >= w || yi >= h ? 0 : M[yi * w + xi]; };
  for (let y = Math.max(0, y0 - reach); y <= Math.min(h - 1, y1 + reach); y++) for (let x = Math.max(0, x0 - reach); x <= Math.min(w - 1, x1 + reach); x++) {
    const i = y * w + x;
    if (protect?.[i] || (allowed && !allowed[i] && !M[i])) continue;
    const c = field.coherence[i], L = Math.round(along * Math.max(0, Math.min(1, (c - minCoherence) / (1 - minCoherence))));
    const ux = field.dx[i], uy = field.dy[i];
    // across the flow: the cell itself and `across` cells each side
    let sum = 0, wt = 0;
    for (let a = -across; a <= across; a++) { const q = 1 - Math.abs(a) / (across + 1); sum += q * at(x - a * uy, y + a * ux); wt += q; }
    // along the flow: a streamline each way, following the field as it turns
    for (const sgn of [1, -1]) {
      let px = x, py = y, vx = sgn * ux, vy = sgn * uy;
      for (let s = 1; s <= L; s++) {
        px += vx; py += vy;
        const xi = Math.round(px), yi = Math.round(py);
        if (xi < 0 || yi < 0 || xi >= w || yi >= h) break;
        const j = yi * w + xi; let fx = field.dx[j], fy = field.dy[j];
        if (fx * vx + fy * vy < 0) { fx = -fx; fy = -fy; }
        vx = fx; vy = fy;
        const q = 1 - s / (L + 1);
        sum += q * M[j]; wt += q;
      }
    }
    if (sum / wt >= 0.5) out[i] = 1;
  }
  return out;
}

// A painter's wash has no pinholes: enclosed gaps of at most maxArea cells inside a passage are painted through,
// except cells in `protect` (reserved lights), which stay bare paper.
export function fillSmallHoles(M, w, h, maxArea, protect = null) {
  const n = w * h, out = Uint8Array.from(M), lab = new Int32Array(n).fill(-1), q = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (M[s] || lab[s] >= 0) continue;
    let qh = 0, qt = 0, border = false;
    q[qt++] = s; lab[s] = s;
    while (qh < qt) {
      const i = q[qh++], x = i % w, y = (i / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && !M[j] && lab[j] < 0) { lab[j] = s; q[qt++] = j; }
    }
    if (!border && qt <= maxArea) for (let k = 0; k < qt; k++) if (!protect?.[q[k]]) out[q[k]] = 1;
  }
  return out;
}
