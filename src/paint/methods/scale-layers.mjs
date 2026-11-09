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

// A sliding minimum (sign 1) or maximum (sign -1) along one row, reach r either side, with dead cells ignored. Writes one
// value per cell of the row into `row`; a window with no live cell gets +/-Infinity.
function slideRow(src, live, start, len, r, sign, row, q) {
  let head = 0, tail = 0, next = 0;
  for (let p = 0; p < len; p++) {
    const reach = Math.min(len - 1, p + r);
    for (; next <= reach; next++) {
      if (!live[start + next]) continue;
      const v = sign * src[start + next];
      while (tail > head && sign * src[start + q[tail - 1]] >= v) tail--;
      q[tail++] = next;
    }
    while (tail > head && q[head] < p - r) head++;
    row[p] = tail > head ? src[start + q[head]] : sign > 0 ? Infinity : -Infinity;
  }
}

// The same over a disc of radius r: a brush is round, and a square window leaves axis-aligned edges in the washes.
function slideDisc(src, live, w, h, r, sign) {
  const out = new Float32Array(w * h).fill(sign > 0 ? Infinity : -Infinity), row = new Float32Array(w), q = new Int32Array(w);
  for (let dy = -r; dy <= r; dy++) {
    const reach = Math.floor(Math.sqrt(r * r - dy * dy));
    for (let y = Math.max(0, -dy); y < Math.min(h, h - dy); y++) {
      slideRow(src, live, (y + dy) * w, w, reach, sign, row, q);
      const at = y * w;
      if (sign > 0) { for (let x = 0; x < w; x++) if (row[x] < out[at + x]) out[at + x] = row[x]; }
      else for (let x = 0; x < w; x++) if (row[x] > out[at + x]) out[at + x] = row[x];
    }
  }
  return out;
}

// One coarse cell per `s` fine ones, each holding the least live value under it, so the coarse field never overstates.
function poolMin(F, live, w, h, s) {
  const cw = Math.ceil(w / s), ch = Math.ceil(h / s), v = new Float32Array(cw * ch).fill(Infinity), alive = new Uint8Array(cw * ch);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!live[i]) continue;
    const c = Math.floor(y / s) * cw + Math.floor(x / s);
    if (F[i] < v[c]) v[c] = F[i];
    alive[c] = 1;
  }
  return { v, alive, cw, ch };
}

/**
 * Grey opening over a disc of radius r: what survives where a brush of that size fits under the field. Cells with live 0
 * take no paint (reserved lights, recesses laid later), so they neither pull the opening down nor hold it up. A large
 * radius is worked on a coarser grid, near eight cells to the radius; the blur that follows hides the difference.
 */
export function maskedOpening(F, live, w, h, r) {
  const s = Math.max(1, Math.floor(r / 8)), R = Math.max(1, Math.round(r / s));
  const { v, alive, cw, ch } = s > 1 ? poolMin(F, live, w, h, s) : { v: F, alive: live, cw: w, ch: h };
  const eroded = slideDisc(v, alive, cw, ch, R, 1);
  const opened = slideDisc(eroded, Uint8Array.from(eroded, q => (Number.isFinite(q) ? 1 : 0)), cw, ch, R, -1);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!live[i]) continue;
    const q = opened[Math.floor(y / s) * cw + Math.floor(x / s)];
    out[i] = Number.isFinite(q) ? Math.min(q, F[i]) : 0;
  }
  return out;
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
