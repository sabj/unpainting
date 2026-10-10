// Shared helpers: polyline geometry and small numeric functions. DOM free for Node and the page.

const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;

// Polylines are arrays of {x, y, w?} objects.

export function polylineLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return len;
}

/** Cumulative arc length per vertex. */
export function arcLengths(points) {
  const s = new Float64Array(points.length);
  for (let i = 1; i < points.length; i++) s[i] = s[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return s;
}

/** Resample at a fixed spacing, keeping the last point; w is interpolated. */
export function resample(points, spacing) {
  if (points.length < 2) return points.map(p => ({ ...p }));
  const s = arcLengths(points), total = s[points.length - 1];
  if (total < spacing) return [{ ...points[0] }, { ...points[points.length - 1] }];
  const n = Math.max(2, Math.round(total / spacing));
  const out = [];
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const target = (i / n) * total;
    while (j < points.length - 2 && s[j + 1] < target) j++;
    const a = points[j], b = points[j + 1], span = s[j + 1] - s[j] || 1;
    const t = clamp((target - s[j]) / span);
    out.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w ?? 1, b.w ?? 1, t) });
  }
  return out;
}

/** Douglas-Peucker simplification with a tolerance in pixels. */
export function simplify(points, tolerance) {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = points[a].x, ay = points[a].y, bx = points[b].x, by = points[b].y;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
    let best = -1, bestD = tol2;
    for (let i = a + 1; i < b; i++) {
      const px = points[i].x - ax, py = points[i].y - ay;
      const t = clamp((px * dx + py * dy) / len2);
      const ex = px - t * dx, ey = py - t * dy;
      const d = ex * ex + ey * ey;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

