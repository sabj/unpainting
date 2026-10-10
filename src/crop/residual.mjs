// What the washes cannot account for, which is what the pen must have done.
// A brush of radius r cannot leave more density in its footprint than the least the target wants there, so the most
// the washes can deliver is the grayscale opening of the target by the brush's disc. The residual is the drawing.
// Subtracting what the ink delivers gives the washes their own target. DOM free.

/** Grayscale erosion by a disc: the least value under the disc at each cell. Separable is wrong for a disc, so this
 *  runs the true footprint; r is small (a brush radius in cells) and it is called a few times, not per step. */
function erodeDisc(F, w, h, r) {
  const out = new Float32Array(w * h), rr = r * r, offs = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= rr) offs.push([dx, dy]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = Infinity;
    for (const [dx, dy] of offs) {
      const xx = x + dx, yy = y + dy;
      // outside the sheet counts as paper, so a wash cannot be claimed to run off the edge and back
      const v = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : F[yy * w + xx];
      if (v < m) m = v;
    }
    out[y * w + x] = m;
  }
  return out;
}

function dilateDisc(F, w, h, r) {
  const out = new Float32Array(w * h), rr = r * r, offs = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= rr) offs.push([dx, dy]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = -Infinity;
    for (const [dx, dy] of offs) {
      const xx = x + dx, yy = y + dy;
      const v = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : F[yy * w + xx];
      if (v > m) m = v;
    }
    out[y * w + x] = m;
  }
  return out;
}

/** The most a brush of this radius can deliver without overshooting the target anywhere. */
export function washable(D, w, h, radius) {
  const r = Math.max(1, Math.round(radius));
  return dilateDisc(erodeDisc(D, w, h, r), w, h, r);
}

/**
 * Split a target into what the washes will do and what is left for the pen.
 *
 * @param radius   the smallest brush that will be used, in cells. Everything narrower than it is the pen's.
 * @param softness how much of the residual to forgive: a wash edge is not perfectly smooth and its own grain would
 *                 otherwise read as line. Subtracted from the residual before it is kept.
 */
export function splitInkFromWash(D, w, h, { radius = 6, softness = 0.04 } = {}) {
  const wash = washable(D, w, h, radius);
  const ink = new Float32Array(w * h);
  let inkMass = 0, washMass = 0, total = 0;
  for (let i = 0; i < w * h; i++) {
    ink[i] = Math.max(0, D[i] - wash[i] - softness);
    inkMass += ink[i]; washMass += wash[i]; total += D[i];
  }
  return { ink, wash, inkShare: total > 0 ? inkMass / total : 0, washShare: total > 0 ? washMass / total : 0 };
}

