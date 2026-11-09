// Middle washes cut by scale, not by value (--scalelayers). Layers cut at value quantiles step a smooth form into flat
// bands with a hard edge at every cut, however smooth the target is there. A painter lays one graded wash for the form,
// lets it dry, and then lays only the darker shapes that are really there, each with a smaller brush. So each layer here
// takes what a brush of its size can carry: the lower envelope of what is still owed at that scale. A ramp goes wholly
// into the first layer; a real dark shape stays a shape of its own, with the base wash light under it, and where such a
// shape meets the base it has one sharp side and one side that fades. One wash carries at most `maxStep` of value, since
// a dark mass is built in stages, lights first, not laid at full strength. Planning only, from the plan's value field.

// Half widths in mm of the kit's flat, large round, medium round and small round (passage-brush.mjs): a layer carries
// what the brush that lays it can hold.
const KIT_RADII = Object.freeze([12.7, 3.5, 2.5, 1.5]);

export function radiiForLayers(count) {
  if (count <= 1) return [KIT_RADII[0]];
  if (count === 2) return [KIT_RADII[0], KIT_RADII[1]];
  if (count === 3) return [KIT_RADII[0], KIT_RADII[1], KIT_RADII[3]];
  return [...KIT_RADII];
}

// A sliding minimum or maximum along one row or column (monotonic queue), with `dead` cells ignored.
function slide1d(src, live, start, stride, len, r, sign, out) {
  const q = new Int32Array(len);
  let head = 0, tail = 0, next = 0;
  for (let p = 0; p < len; p++) {
    const reach = Math.min(len - 1, p + r);
    for (; next <= reach; next++) {
      const at = start + next * stride;
      if (!live[at]) continue;
      const v = sign * src[at];
      while (tail > head && sign * src[start + q[tail - 1] * stride] >= v) tail--;
      q[tail++] = next;
    }
    while (tail > head && q[head] < p - r) head++;
    out[start + p * stride] = tail > head ? src[start + q[head] * stride] : sign > 0 ? Infinity : -Infinity;
  }
}

function slide(src, live, w, h, r, sign) {
  const rows = new Float32Array(w * h), out = new Float32Array(w * h), anyLive = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) slide1d(src, live, y * w, 1, w, r, sign, rows);
  for (let i = 0; i < w * h; i++) anyLive[i] = Number.isFinite(rows[i]) ? 1 : 0;
  for (let x = 0; x < w; x++) slide1d(rows, anyLive, x, w, h, r, sign, out);
  return out;
}

/**
 * Grey opening over a square of half width r: what survives where a shape of that size fits under the field. Cells with
 * live 0 take no paint (reserved lights, recesses laid later), so they neither pull the opening down nor hold it up.
 */
export function maskedOpening(F, live, w, h, r) {
  const eroded = slide(F, live, w, h, r, 1);
  const O = slide(eroded, Uint8Array.from(eroded, v => (Number.isFinite(v) ? 1 : 0)), w, h, r, -1);
  return Float32Array.from(O, (v, i) => (live[i] && Number.isFinite(v) ? Math.min(v, F[i]) : 0));
}

function maskedBlur(F, live, w, h, r) {
  const n = w * h, row = new Float32Array(n), rowN = new Float32Array(n), out = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    let s = 0, c = 0;
    for (let x = -r; x < w; x++) {
      const a = x + r, b = x - r - 1;
      if (a < w && live[y * w + a]) { s += F[y * w + a]; c++; }
      if (b >= 0 && live[y * w + b]) { s -= F[y * w + b]; c--; }
      if (x >= 0) { row[y * w + x] = s; rowN[y * w + x] = c; }
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0, c = 0;
    for (let y = -r; y < h; y++) {
      const a = y + r, b = y - r - 1;
      if (a < h) { s += row[a * w + x]; c += rowN[a * w + x]; }
      if (b >= 0) { s -= row[b * w + x]; c -= rowN[b * w + x]; }
      if (y >= 0) out[y * w + x] = c > 0 ? s / c : 0;
    }
  }
  return out;
}

/**
 * What one brush size can lay under the field: its opening, blurred at the same size so a step in it becomes a ramp a
 * lane can follow, and never above the field, since a wash laid too dark cannot be taken back.
 */
export function lowerEnvelope(F, live, w, h, r) {
  const blurred = maskedBlur(maskedOpening(F, live, w, h, r), live, w, h, r);
  return Float32Array.from(blurred, (v, i) => (live[i] ? Math.min(v, F[i]) : 0));
}

function keepShapes(mask, w, h, minShape) {
  const n = w * h, seen = new Uint8Array(n), out = new Uint8Array(n), q = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (!mask[s] || seen[s]) continue;
    let head = 0, tail = 0;
    q[tail++] = s; seen[s] = 1;
    while (head < tail) {
      const i = q[head++], x = i % w;
      for (const j of [x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i + w < n ? i + w : -1]) {
        if (j >= 0 && mask[j] && !seen[j]) { seen[j] = 1; q[tail++] = j; }
      }
    }
    if (tail >= minShape) for (let p = 0; p < tail; p++) out[q[p]] = 1;
  }
  return out;
}

/**
 * @param field value each live cell owes in the middle washes
 * @param radiiMm one half width per layer, broadest first
 * @param minStep the smallest value step worth a wash of its own
 * @param maxStep the most value one layer may carry; the last layer takes whatever is left
 * @returns {{cover: Uint8Array[], share: Float32Array[]}} per layer, its cells and the share of a cell's middle demand
 *   it carries. Shares of a live cell sum to 1. A later layer's cell with too small a step stays with the layers under it.
 */
export function scaleLayers({ field, live, w, h, cellMm, radiiMm, minStep, maxStep = Infinity, minShape }) {
  const n = w * h, L = radiiMm.length, parts = [];
  let rest = Float32Array.from(field, (v, i) => (live[i] ? v : 0));
  radiiMm.forEach((mm, j) => {
    const r = Math.max(1, Math.round(mm / cellMm));
    const part = j === L - 1 ? rest : Float32Array.from(lowerEnvelope(rest, live, w, h, r), v => Math.min(v, maxStep));
    parts.push(part);
    rest = Float32Array.from(rest, (v, i) => Math.max(0, v - part[i]));
  });
  const cover = parts.map((part, j) => {
    if (j === 0) return Uint8Array.from(live, v => (v ? 1 : 0));
    return keepShapes(Uint8Array.from(part, (v, i) => (live[i] && v >= minStep ? 1 : 0)), w, h, minShape);
  });
  const share = parts.map(() => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    if (!live[i]) continue;
    let sum = 0;
    for (let j = 0; j < L; j++) if (cover[j][i]) sum += parts[j][i];
    if (sum > 0) { for (let j = 0; j < L; j++) if (cover[j][i]) share[j][i] = parts[j][i] / sum; } else share[0][i] = 1;
  }
  // A layer's cell with no share of its own leaves the layer, so a passage holds only cells that ask for its paint.
  for (let j = 1; j < L; j++) for (let i = 0; i < n; i++) if (cover[j][i] && !(share[j][i] > 0)) cover[j][i] = 0;
  return { cover, share };
}
