// Long straight thin lines (whiskers, lashes, grass blades), found whole instead of walked. The ridge walk curls over
// texture, so this takes the mean ridge response along a `len`-cell segment at each of `angles` orientations and keeps
// the best. A straight line scores its full strength; texture scores a fraction of it.
// Either polarity: pass the dark ridge response for ink lines and the light one for reserved paper or gouache. DOM free.

const sampleAt = (F, w, h, x, y) => F[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))];

/**
 * The straight-line score of every cell: the mean of F along the best straight segment of `len` cells through it.
 * @returns { score, angle } Float32Arrays; angle in radians, 0 along x
 */
export function lineScore(F, w, h, { len = 25, angles = 45, margin = 0 } = {}) {
  const n = w * h, score = new Float32Array(n), angle = new Float32Array(n), half = (len - 1) / 2;
  for (let a = 0; a < angles; a++) {
    const th = Math.PI * a / angles, cx = Math.cos(th), cy = Math.sin(th);
    for (let y = margin; y < h - margin; y++) for (let x = margin; x < w - margin; x++) {
      const i = y * w + x;
      if (F[i] <= 0) continue;
      let s = 0;
      for (let t = -half; t <= half; t++) s += sampleAt(F, w, h, x + cx * t, y + cy * t);
      s /= len;
      if (s > score[i]) { score[i] = s; angle[i] = th; }
    }
  }
  return { score, angle };
}

/**
 * Straight segments, strongest first. Each starts at the best unclaimed cell, runs both ways along that cell's angle
 * while F holds at least `hold` of the seed's score (a gap of `gap` cells is crossed), and claims a corridor `clear`
 * cells wide so the next segment is another line.
 *
 * @param F        the ridge response, one polarity
 * @param minLen   a segment shorter than this is texture, not a line
 * @param minScore the seed's line score has to reach this; 0 takes everything down to the `top` cap
 * @returns [{ ax, ay, bx, by, len, angle, score, points }] with points every `step` cells for the pen, on the ridge
 */
export function straightSegments(F, w, h, { len = 25, angles = 45, top = 40, minLen = 20, minScore = 0, hold = 0.35, gap = 3, clear = 3, step = 2, margin = 0 } = {}) {
  const n = w * h, { score, angle } = lineScore(F, w, h, { len, angles, margin });
  const used = new Uint8Array(n), order = [];
  for (let i = 0; i < n; i++) if (score[i] > minScore && score[i] > 0) order.push(i);
  order.sort((a, b) => score[b] - score[a]);
  const out = [];
  for (const i of order) {
    if (out.length >= top) break;
    if (used[i]) continue;
    const x0 = i % w, y0 = (i / w) | 0, th = angle[i], cx = Math.cos(th), cy = Math.sin(th), nx = -cy, ny = cx, floor = score[i] * hold;
    // Run out both ways. A line a degree or two off the nearest orientation drifts off the run, so the run looks one
    // cell either side and eases across to stay on the ridge.
    const halves = [];
    for (const sgn of [1, -1]) {
      const pts = [];
      let dry = 0, off = 0;
      for (let t = 0; t < Math.max(w, h); t++) {
        const px = x0 + sgn * cx * t + nx * off, py = y0 + sgn * cy * t + ny * off;
        let best = sampleAt(F, w, h, px, py), at = 0;
        for (const d of [-1, 1]) { const v = sampleAt(F, w, h, px + nx * d, py + ny * d); if (v > best) { best = v; at = d; } }
        if (best >= floor) { dry = 0; off += at * 0.5; pts.push({ x: px + nx * at * 0.5, y: py + ny * at * 0.5 }); } else if (++dry > gap) break; else pts.push({ x: px, y: py });
      }
      // the dry tail is not part of the line
      while (pts.length && sampleAt(F, w, h, pts[pts.length - 1].x, pts[pts.length - 1].y) < floor) pts.pop();
      halves.push(pts);
    }
    const path = [...halves[1].slice(1).reverse(), { x: x0, y: y0 }, ...halves[0].slice(1)];
    const length = path.length;
    used[i] = 1;
    if (length < minLen) continue;
    const a = path[0], b = path[path.length - 1];
    for (const p of path) for (let s = -clear; s <= clear; s++) {
      const xx = Math.round(p.x + nx * s), yy = Math.round(p.y + ny * s);
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) used[yy * w + xx] = 1;
    }
    const points = path.filter((_, k) => k % Math.max(1, Math.round(step)) === 0 || k === path.length - 1);
    out.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, len: length, angle: th, score: score[i], points });
  }
  return out;
}
