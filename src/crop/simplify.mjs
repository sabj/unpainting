// A drawn line is a simplification of the edge it follows. A watercolour's edge is irregular at the cell, and a pen
// that follows it faithfully draws the wobble. Douglas-Peucker keeps the corners, then an even resample gives the pen
// a continuous path. DOM free.

/** Douglas-Peucker: the fewest points that keep every other point within `tolerance` of the path. */
export function simplify(points, tolerance = 2) {
  if (points.length < 3 || tolerance <= 0) return points.slice();
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const ax = points[a].x, ay = points[a].y, bx = points[b].x, by = points[b].y;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let far = -1, best = tolerance;
    for (let i = a + 1; i < b; i++) {
      const px = points[i].x - ax, py = points[i].y - ay;
      const t = len2 > 1e-18 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
      const d = Math.hypot(px - t * dx, py - t * dy);
      if (d > best) { best = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/** Points every `step` along the simplified path, so the pen has a continuous line to follow. */
export function resample(points, step = 2) {
  if (points.length < 2) return points.slice();
  const out = [points[0]];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    let t = step - carry;
    while (t <= len) { out.push({ x: a.x + (dx * t) / len, y: a.y + (dy * t) / len }); t += step; }
    carry = (len - (t - step)) % step;
  }
  const last = points[points.length - 1];
  if (Math.hypot(out[out.length - 1].x - last.x, out[out.length - 1].y - last.y) > 0.5 * step) out.push(last);
  return out;
}

/**
 * A chain as a person would draw it: simplified to its corners, then resampled evenly.
 * @param tolerance how far the line may sit from the edge it draws, in cells
 */
export function drawAs(points, { tolerance = 2, step = 2 } = {}) {
  return resample(simplify(points, tolerance), step);
}
