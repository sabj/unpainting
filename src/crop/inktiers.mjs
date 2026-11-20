// Measurements for spending the ink budget in tiers (outline, features, then the rest) rather than darkest first,
// so structural lines are not priced out by darker hair and fur. Decides no budget. DOM free. No file IO.

/** Arc length of a polyline, in the cells its points are on. */
export function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

/** How straight a path is: its chord over its arc. A horizon is about 1, a hair loop about 0. */
export function straightness(points) {
  if (points.length < 2) return 0;
  const arc = pathLength(points);
  if (arc < 1e-6) return 0;
  const a = points[0], b = points[points.length - 1];
  return Math.min(1, Math.hypot(b.x - a.x, b.y - a.y) / arc);
}

/**
 * How far a path stands above the lighter of its two flanks, averaged along it. Inside a dark mass both flanks are
 * dark and the answer is near zero; a boundary stands clear of at least one side.
 *
 * @param D      the source optical density the walker read
 * @param reach  how far out along the normal the flanks are read, in cells
 */
export function meanContrast(D, w, h, points, { reach = 3 } = {}) {
  if (points.length < 2) return 0;
  const at = (x, y) => D[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))];
  let sum = 0, count = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const m = Math.hypot(dx, dy);
    if (m < 1e-6) continue;
    dx /= m; dy /= m;
    const nx = -dy, ny = dx, p = points[i];
    // the lighter flank: a boundary is clear of its ground on one side even where the other side is as dark as it is
    const flank = Math.min(at(p.x + nx * reach, p.y + ny * reach), at(p.x - nx * reach, p.y - ny * reach));
    sum += at(p.x, p.y) - flank;
    count++;
  }
  return count ? sum / count : 0;
}



const stamp = (rgb, w, h, x, y, colour, radius) => {
  const r = Math.max(1, Math.ceil(radius));
  for (let yy = Math.round(y) - r; yy <= Math.round(y) + r; yy++) for (let xx = Math.round(x) - r; xx <= Math.round(x) + r; xx++) {
    if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
    if (Math.hypot(xx + 0.5 - x, yy + 0.5 - y) > radius) continue;
    const i = 3 * (yy * w + xx);
    rgb[i] = colour[0]; rgb[i + 1] = colour[1]; rgb[i + 2] = colour[2];
  }
};

const polyline = (rgb, w, h, points, colour, width) => {
  const radius = Math.max(0.5, width / 2);
  for (let j = 1; j < points.length; j++) {
    const a = points[j - 1], b = points[j], L = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(L * 2));
    for (let q = 0; q <= steps; q++) stamp(rgb, w, h, a.x + (b.x - a.x) * q / steps, a.y + (b.y - a.y) * q / steps, colour, radius);
  }
  if (points.length === 1) stamp(rgb, w, h, points[0].x, points[0].y, colour, radius);
};

