// Predict drawable edge chains from paired source images and drawings.
//
// A chain's features, scaled to the sheet so sheet sizes agree:
//   length     how far it runs, as a share of the sheet's short side
//   contrast   the mean gradient along it
//   depth      how much darker the dark side is than the light side
//   straight   end-to-end distance over path length (1 is a straight line, low is a curl)
//   centre     how near the middle of the sheet it runs
//   dark       the mean density under it
//
// The fit is a logistic regression by gradient descent. DOM free.

/** Features of one chain, in the order the weights expect. */
export function chainFeatures(chain, D, w, h, grad) {
  const pts = chain.points, side = Math.min(w, h), n = pts.length;
  let contrast = 0, dark = 0, cen = 0;
  for (const p of pts) {
    const i = Math.round(p.y) * w + Math.round(p.x);
    contrast += grad[i]; dark += D[i];
    const dx = (p.x - w / 2) / (w / 2), dy = (p.y - h / 2) / (h / 2);
    cen += Math.max(0, 1 - Math.hypot(dx, dy) / Math.SQRT2);
  }
  let path = 0;
  for (let k = 1; k < n; k++) path += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
  const span = Math.hypot(pts[n - 1].x - pts[0].x, pts[n - 1].y - pts[0].y);
  // the two sides of the chain, a few cells out along its normal, say how deep the step across it is
  let deep = 0, deepN = 0;
  for (let k = 1; k < n; k++) {
    const ux = pts[k].x - pts[k - 1].x, uy = pts[k].y - pts[k - 1].y, m = Math.hypot(ux, uy) || 1;
    const nx = -uy / m, ny = ux / m, r = 3;
    const ax = Math.round(pts[k].x + nx * r), ay = Math.round(pts[k].y + ny * r);
    const bx = Math.round(pts[k].x - nx * r), by = Math.round(pts[k].y - ny * r);
    if (ax < 0 || ay < 0 || bx < 0 || by < 0 || ax >= w || ay >= h || bx >= w || by >= h) continue;
    deep += Math.abs(D[ay * w + ax] - D[by * w + bx]); deepN++;
  }
  return [
    Math.min(1, path / side),
    Math.min(1, contrast / n / 0.2),
    Math.min(1, deepN ? deep / deepN / 0.5 : 0),
    path > 0 ? span / path : 0,
    cen / n,
    Math.min(1, dark / n),
  ];
}

/** Was this chain drawn? The share of its points within `reach` cells of ink in the drawing. */
export function chainDrawn(chain, ink, w, h, { reach = 3, threshold = 0.08 } = {}) {
  let on = 0;
  for (const p of chain.points) {
    let hit = false;
    for (let dy = -reach; dy <= reach && !hit; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const x = Math.round(p.x) + dx, y = Math.round(p.y) + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (ink[y * w + x] >= threshold) { hit = true; break; }
    }
    if (hit) on++;
  }
  return on / chain.points.length;
}

/** Logistic regression by gradient descent. Returns { weights, bias, accuracy }. */
export function fitDrawable(rows, labels, { rounds = 400, rate = 0.5, l2 = 0.01 } = {}) {
  const k = rows[0]?.length ?? 0;
  let weights = new Float64Array(k), bias = 0;
  const sig = z => 1 / (1 + Math.exp(-z));
  for (let r = 0; r < rounds; r++) {
    const gw = new Float64Array(k); let gb = 0;
    for (let i = 0; i < rows.length; i++) {
      let z = bias; for (let j = 0; j < k; j++) z += weights[j] * rows[i][j];
      const e = sig(z) - labels[i];
      for (let j = 0; j < k; j++) gw[j] += e * rows[i][j];
      gb += e;
    }
    for (let j = 0; j < k; j++) weights[j] -= rate * (gw[j] / rows.length + l2 * weights[j]);
    bias -= rate * gb / rows.length;
  }
  let right = 0;
  for (let i = 0; i < rows.length; i++) {
    let z = bias; for (let j = 0; j < k; j++) z += weights[j] * rows[i][j];
    if ((sig(z) >= 0.5 ? 1 : 0) === (labels[i] >= 0.5 ? 1 : 0)) right++;
  }
  return { weights: Array.from(weights), bias, accuracy: right / rows.length };
}

/** How likely a person is to draw this chain, given a fit. */
export function drawableScore(features, { weights, bias }) {
  let z = bias; for (let j = 0; j < weights.length; j++) z += weights[j] * features[j];
  return 1 / (1 + Math.exp(-z));
}
