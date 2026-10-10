// Fur as dry-brush flicks. Hair direction is a structure tensor of the source tone at the scale of a few hairs.
// Each flick starts on the darker side, follows that field and thins as the brush lifts. DOM free: callers pass the blur.

/**
 * The direction the picture changes least at each cell, and how sure that is.
 * @returns {{dx: Float32Array, dy: Float32Array, coherence: Float32Array}}
 */
export function orientationField(D, w, h, blur, { sigma = 2 } = {}) {
  const n = w * h, gx = new Float32Array(n), gy = new Float32Array(n);
  const B = blur(D, w, h, 0.8);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    gx[i] = (B[i + 1] - B[i - 1]) / 2; gy[i] = (B[i + w] - B[i - w]) / 2;
  }
  const Jxx = blur(gx.map((v, i) => v * v), w, h, sigma), Jyy = blur(gy.map((v, i) => v * v), w, h, sigma), Jxy = blur(gx.map((v, i) => v * gy[i]), w, h, sigma);
  const dx = new Float32Array(n), dy = new Float32Array(n), coherence = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // the gradient's dominant direction, turned a quarter: along the stripe
    const a = 0.5 * Math.atan2(2 * Jxy[i], Jxx[i] - Jyy[i]) + Math.PI / 2;
    dx[i] = Math.cos(a); dy[i] = Math.sin(a);
    const tr = Jxx[i] + Jyy[i], det = Math.sqrt((Jxx[i] - Jyy[i]) ** 2 + 4 * Jxy[i] ** 2);
    coherence[i] = tr > 1e-9 ? det / tr : 0;
  }
  return { dx, dy, coherence };
}

/**
 * Flicks over the cells that want marking.
 * @param want   Float32Array per cell, how much a mark is wanted there
 * @param O      orientationField of the source
 * @returns [[{x, y, want, p}]] each flick root first, with the pressure falling from its landing to its tip
 */
export function furMarks(want, O, w, h, { length = 12, spacing = 3, seed = 7, coverage = 0.3, minWant = 0.02, land = 0.95, tip = 0.15, curl = 0.25 } = {}) {
  let s = (seed | 0) || 1;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const at = (x, y) => { const xi = Math.round(x), yi = Math.round(y); return xi < 0 || yi < 0 || xi >= w || yi >= h ? 0 : want[yi * w + xi]; };
  const cells = [];
  for (let i = 0; i < w * h; i++) if (want[i] > minWant) cells.push(i);
  cells.sort((a, b) => want[b] - want[a]);
  const budget = Math.round(cells.length * coverage / Math.max(1, length));
  const taken = new Uint8Array(w * h), marks = [];
  for (const i of cells) {
    if (marks.length >= budget) break;
    if (taken[i]) continue;
    const x0 = i % w, y0 = (i / w) | 0;
    // which way along the hair: towards the lighter side, as a flick goes from root to tip
    let ux = O.dx[i], uy = O.dy[i];
    if (at(x0 + 3 * ux, y0 + 3 * uy) > at(x0 - 3 * ux, y0 - 3 * uy)) { ux = -ux; uy = -uy; }
    const len = length * (0.7 + 0.6 * rnd()), bend = (rnd() - 0.5) * curl;
    const pts = [{ x: x0, y: y0, want: want[i] }];
    let x = x0, y = y0;
    for (let t = 1; t <= len; t++) {
      // follow the field as it turns, keeping the sense the flick started with
      const j = Math.round(y) * w + Math.round(x);
      let vx = O.dx[j], vy = O.dy[j];
      if (vx * ux + vy * uy < 0) { vx = -vx; vy = -vy; }
      const c = Math.cos(bend), sn = Math.sin(bend);
      ux = 0.7 * ux + 0.3 * (vx * c - vy * sn); uy = 0.7 * uy + 0.3 * (vx * sn + vy * c);
      const m = Math.hypot(ux, uy) || 1; ux /= m; uy /= m;
      x += ux; y += uy;
      if (x < 0 || y < 0 || x >= w - 0.5 || y >= h - 0.5) break;
      const wv = at(x, y);
      if (wv <= minWant * 0.5) break;
      pts.push({ x, y, want: wv });
    }
    if (pts.length < 3) { taken[i] = 1; continue; }
    const last = pts.length - 1;
    pts.forEach((q, k) => { q.p = land + (tip - land) * Math.pow(k / last, 0.8); });
    for (const q of pts) {
      const px = Math.round(q.x), py = Math.round(q.y);
      for (let oy = -spacing; oy <= spacing; oy++) for (let ox = -spacing; ox <= spacing; ox++) {
        const xx = px + ox, yy = py + oy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && ox * ox + oy * oy <= spacing * spacing) taken[yy * w + xx] = 1;
      }
    }
    marks.push(pts);
  }
  return marks;
}
