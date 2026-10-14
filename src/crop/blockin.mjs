// Block in the washes as flat layers of tone, then work out what is left for the pen.
// Texture inside a region is left to the wash's grain rather than drawn. DOM free.
// closeLocal and openLocal: close and open worked inside each mask's box.
import { components, removeSmall, closeLocal as close, openLocal as openMask } from '../raster.js';
import { splitByPuddle } from './palettewide.mjs';

/**
 * One passage of a pass, held as a label in the pass's component field.
 * `mask` builds a full-sheet 0/1 field on first ask; walk `box` and test `ids` instead where possible.
 */
export function passage(ids, id, box, amount, area, w) {
  return {
    ids, id, box, amount, area, w, _mask: null,
    get mask() {
      if (this._mask || !this.ids) return this._mask;
      const m = new Uint8Array(this.ids.length), b = this.box, W = this.w, q = this.id, f = this.ids;
      for (let y = b.y0; y <= b.y1; y++) { const r = y * W; for (let x = b.x0; x <= b.x1; x++) if (f[r + x] === q) m[r + x] = 1; }
      return (this._mask = m);
    },
    // replacing the mask detaches the passage from its label
    set mask(m) { this._mask = m; this.ids = null; this.box = null; },
  };
}

/** Let a passage's full-sheet mask go; it is rebuilt from the label field if it is asked for again. */
export const dropMask = sh => { sh._mask = null; };

/** A quantile of a field, ignoring what the picture never touched. */
function quantile(F, q, floor = 1e-4) {
  const v = []; for (let i = 0; i < F.length; i++) if (F[i] > floor) v.push(F[i]);
  if (!v.length) return 0;
  v.sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(v.length * q))];
}

/**
 * Block in per pigment rather than per luminance, so a hue change at equal value becomes two washes.
 * @param A  per-pixel pigment amounts, n * k, from unmix()
 * @param k  how many pigments
 * @returns layers, each { mask, mix, area }, oldest first, and `delivered` as amounts per pigment
 */
export function blockInPigments(A, k, w, h, {
  glaze = 0.22, maxValues = 14, minShape = null, quantileIn = 0.12, maskBlur = 1, floorShape = 8, washFloor = 0.6,
  // share of a passage's want the early passes deliver; later passes reach the rest
  headroom = 0.5,
  // follow (--planfollow): lay each cell's remaining want, clamped to followFloor..followCap times the flat amount.
  // 0: flat. Needs preMix off.
  follow = 0, followCap = 3, followFloor = 0.5,
  // followMask, followMaskShare (--figurelayers): only passages with at least this share of cells on the mask follow.
  followMask = null, followMaskShare = 0.25,
  // smallest shape shrinks over the passes from bigShape to this share of it
  finest = 0.08,
  preMix = true,
  sampleSupport = false,
  // quantile of a passage's want the last passes reach, so the darks get their depth
  deepQ = 0.55,
  // cells no wash may take in (0/1 field or null), held for a later accent pass
  hold = null,
  // cells no passage may cover (masking-fluid lights, lights.mjs). Removed from each passage after its region and
  // strength are set, so the plan is otherwise unchanged.
  reserve = null,
  // per-cell puddle labels (palettewide.mjs) or null: each pass's regions are split by local colour
  puddles = null,
  // per-cell wash groups (subject-clusters.mjs, --subjectwash) or null: each pass's regions are cut at them as well
  regions = null,
  // cells held out of every pass after the first value (each subject's own lights) or null
  lateHold = null,
  // a pan under this share of a premixed passage's mix is left out of it and stays owed (0 keeps every pan)
  puddleFloor = 0,
  // firstFloor: open with one broad light wash of local colour over cells whose planned total is at least this. 0: off.
  // The first rung is set by the darkest thing, so pale tones would otherwise get no paint.
  // firstMax: cap on the first wash's tone (default one glaze). firstWhite: cells under this total stay paper.
  firstFloor = 0,
  firstMax = null,
  firstWhite = null,
  firstLabels = null,
  // firstOnly: a mask the first wash stays inside (null: everywhere)
  firstOnly = null,
} = {}) {
  const n = w * h, delivered = new Float32Array(n * k), layers = [];
  const scale = Math.sqrt(n) / 1086;
  const bigShape = minShape ?? Math.max(40, Math.round(220 * scale * scale));

  // how strong the picture gets in each pigment, so each gets the number of passes its own range asks for
  const peaks = [];
  for (let j = 0; j < k; j++) {
    const v = []; for (let i = 0; i < n; i++) if (A[i * k + j] > 1e-4) v.push(A[i * k + j]);
    v.sort((a, b) => a - b);
    peaks.push(v.length ? v[Math.floor(v.length * 0.97)] : 0);
  }
  const steps = Math.max(2, Math.min(maxValues, Math.round(Math.max(...peaks) / glaze)));
  // total still owed, recorded after each pass
  const owed = () => { let s = 0; for (let i = 0; i < n * k; i++) s += Math.max(0, A[i] - delivered[i]); return s; };
  const history = [];
  if (firstFloor > 0) {
    const fw = firstWash(A, k, w, h, { floor: firstFloor, max: firstMax ?? glaze, white: firstWhite ?? firstFloor / 2, labels: firstLabels, quantileIn, minArea: bigShape, radius: Math.max(1, Math.round(2 * scale * maskBlur)), hold, reserve, only: firstOnly, delivered });
    if (fw) { layers.push(fw); history.push(owed()); }
  }

  // Repeat the ladder so passages that wanted more than one pass's strength come round again.
  const rounds = Math.max(1, Math.round(maxValues / steps) || 1);
  for (let round = 0; round < rounds; round++)
  for (let v = 1; v <= steps; v++) {
    for (let j = 0; j < k; j++) {
      if (peaks[j] <= 0) continue;
      const level = peaks[j] * (v / (steps + 0.4));
      const t = (v - 1) / Math.max(1, steps - 1);
      // smallest shape this pass keeps: bigShape at the first pass, falling by `finest` to the last
      const small = Math.max(floorShape, Math.round(bigShape * Math.pow(finest, t)));
      // --maskblur scales the open/close radius: two cells per unit of scale early, a third of that late
      const blurR = Math.max(1, Math.round(2 * scale * (1 - 0.7 * t) * maskBlur));
      let m = new Uint8Array(n);
      // --washfloor: a cell joins a pass when it still owes this share of one glaze. Capped at the pass level, so it
      // barely moves coverage.
      const entry = Math.min(level, glaze * washFloor);
      for (let i = 0; i < n; i++) m[i] = A[i * k + j] - delivered[i * k + j] >= entry && A[i * k + j] >= level * 0.5 ? 1 : 0;
      m = removeSmall(openMask(close(m, w, h, blurR), w, h, blurR), w, h, small);
      if (hold) for (let i = 0; i < n; i++) if (hold[i]) m[i] = 0;
      if (lateHold && v > 1) for (let i = 0; i < n; i++) if (lateHold[i]) m[i] = 0;
      const split = puddles && regions ? Int32Array.from(puddles, (p, i) => p * 65536 + regions[i]) : puddles ?? regions;
      const { labels, areas, count } = split ? splitByPuddle(components(m, w, h).labels, split, w, h, small) : components(m, w, h);
      // gathered in one pass over the sheet, not one per region
      const want = new Array(count + 1);
      for (let id = 1; id <= count; id++) want[id] = areas[id] >= small ? [] : null;
      for (let i = 0; i < n; i++) { const id = labels[i]; if (id && want[id]) {
        const residual = Math.max(0, A[i * k + j] - delivered[i * k + j]);
        // Closing a fragmented mixture mask bridges cells assigned to another puddle.
        // Those cells must not veto the supported passage by making its quantile zero.
        if (!sampleSupport || residual > 0.01) want[id].push(residual);
      } }
      const amountOf = new Float32Array(count + 1);
      for (let id = 1; id <= count; id++) {
        if (!want[id] || !want[id].length) continue;
        want[id].sort((a, b) => a - b);
      // the low quantile: what the brush may lay everywhere without flooding the highlights
        const a = want[id][Math.floor(want[id].length * quantileIn)];
        // early, broad passes hold most back; late, small ones deliver what the passage asks
        const hold = headroom + (1 - headroom) * t;
        // the last passes take the passage's own depth, since nothing comes after them
        const deep = want[id][Math.floor(want[id].length * (quantileIn + (deepQ - quantileIn) * t))];
        amountOf[id] = a > 0.01 ? Math.max(a, deep * t) * hold : 0;
      }
      // One component-id field per pass and one id and box per passage: a full-sheet mask per passage costs gigabytes.
      // G: per-cell amounts under --planfollow, one field per pass (passages are disjoint).
      const holdT = headroom + (1 - headroom) * t;
      const G = follow > 0 && !preMix ? new Float32Array(n) : null;
      const onMask = followMask ? new Int32Array(count + 1) : null;
      const maskCells = followMask ? new Int32Array(count + 1) : null;
      if (G && followMask) {
        for (let i = 0; i < n; i++) {
          const id = labels[i];
          if (!id || !amountOf[id] || (reserve && reserve[i])) continue;
          maskCells[id]++; if (followMask[i]) onMask[id]++;
        }
        // Decide before booking pigment: an ungraded passage must book its flat
        // amount, including the minority of its cells that touch the figure.
        for (let id = 1; id <= count; id++) onMask[id] = maskCells[id] > 0 && onMask[id] / maskCells[id] >= followMaskShare ? 1 : 0;
      }
      if (G) for (let i = 0; i < n; i++) {
        const id = labels[i]; if (!id || !amountOf[id]) continue;
        const a = amountOf[id], r = Math.max(0, A[i * k + j] - delivered[i * k + j]) * holdT;
        const on = !followMask || (onMask[id] && followMask[i]);
        G[i] = on ? (1 - follow) * a + follow * Math.min(followCap * a, Math.max(followFloor * a, r)) : a;
      }
      const ids = count < 65535 ? new Uint16Array(n) : new Int32Array(n);
      const bx0 = new Int32Array(count + 1).fill(w), by0 = new Int32Array(count + 1).fill(h);
      const bx1 = new Int32Array(count + 1).fill(-1), by1 = new Int32Array(count + 1).fill(-1), held = new Int32Array(count + 1);
      // Reserved cells are booked as if laid, so later values are cut the same.
      // Under preMix the booking waits until the mixes exist.
      for (let i = 0; i < n; i++) {
        const id = labels[i]; if (!id || !amountOf[id]) continue;
        if (!preMix) delivered[i * k + j] += G ? G[i] : amountOf[id];
        if (reserve && reserve[i]) continue;
        ids[i] = id; held[id]++;
        const x = i % w, y = (i - x) / w;
        if (x < bx0[id]) bx0[id] = x; if (x > bx1[id]) bx1[id] = x; if (y < by0[id]) by0[id] = y; if (y > by1[id]) by1[id] = y;
      }
      // One pass is one strength of one colour; its regions are where the brush goes within it.
      const shapes = [];
      for (let id = 1; id <= count; id++) if (amountOf[id]) shapes.push(passage(ids, id, { x0: bx0[id], y0: by0[id], x1: bx1[id], y1: by1[id], area: held[id] }, amountOf[id], areas[id], w));
      if (!shapes.length) continue;
      if (G) {
        const sum = new Float64Array(count + 1), cnt = new Int32Array(count + 1);
        for (let i = 0; i < n; i++) { const id = ids[i]; if (id) { sum[id] += G[i]; cnt[id]++; } }
        for (const sh of shapes) {
          // scoped follow: a passage mostly off the mask stays the flat passage it was
          if (onMask && !onMask[sh.id]) continue;
          sh.graded = G; sh._follow = true; if (cnt[sh.id]) sh.amount = sum[sh.id] / cnt[sh.id];
        }
      }
      // Each passage gets its own charge, mixed in the well from every pan it still owes, in proportion.
      // --premix 0 lays one pan per pass instead.
      const owedAll = preMix ? new Float64Array((count + 1) * k) : null, cellsAll = preMix ? new Int32Array(count + 1) : null;
      if (preMix) for (let i = 0; i < n; i++) {
        const id = labels[i]; if (!id) continue;
        cellsAll[id]++;
        for (let q = 0; q < k; q++) owedAll[id * k + q] += Math.max(0, A[i * k + q] - delivered[i * k + q]);
      }
      for (const sh of shapes) {
        sh.mix = new Array(k).fill(0);
        if (!preMix) { sh.mix[j] = sh.amount; continue; }
        const owedOf = owedAll.subarray(sh.id * k, sh.id * k + k), cells = cellsAll[sh.id];
        if (!cells) { sh.mix[j] = sh.amount; continue; }
        // scaled so this pass's pan lands at the asked strength and the others ride with it
        const lead = owedOf[j] / cells;
        const scale = lead > 1e-6 ? sh.amount / lead : 0;
        if (scale <= 0) { sh.mix[j] = sh.amount; continue; }
        for (let q = 0; q < k; q++) sh.mix[q] = (owedOf[q] / cells) * scale;
        // --puddlefloor: pans under this share of the mix are left out and stay owed; traces dull the colour
        if (puddleFloor > 0) {
          const tot = sh.mix.reduce((a, v) => a + v, 0);
          if (tot > 0) for (let q = 0; q < k; q++) if (q !== j && sh.mix[q] < puddleFloor * tot) sh.mix[q] = 0;
        }
      }
      // book every pan the mixed charge lays, or the pans that rode along are asked for again
      if (preMix) {
        const mixOf = new Map();
        for (const sh of shapes) mixOf.set(sh.id, sh.mix);
        for (let i = 0; i < n; i++) {
          const id = labels[i]; if (!id || !amountOf[id]) continue;
          const m = mixOf.get(id);
          if (!m) { delivered[i * k + j] += amountOf[id]; continue; }
          for (let q = 0; q < k; q++) if (m[q] > 0) delivered[i * k + q] += m[q];
        }
      }
      const strengths = shapes.map(sh => sh.amount).sort((a, b) => a - b);
      const amount = strengths[Math.floor(strengths.length / 2)];
      const mix = new Array(k).fill(0); mix[j] = amount;
      // the pass's own mask is every cell any of its passages covers, which is every cell the id field marks
      layers.push({ value: v, pigment: j, ids, _mask: null, get mask() { return (this._mask ??= Uint8Array.from(this.ids, id => (id ? 1 : 0))); }, set mask(m) { this._mask = m; }, shapes, mix, amount, area: shapes.reduce((a, sh) => a + sh.area, 0) });
      history.push(owed());
    }
  }
  return { layers, delivered, steps, owed: history };
}

// The broad first wash (blockInPigments firstFloor). Books what it lays into `delivered` and returns the layer, or null.
function firstWash(A, k, w, h, { floor, max, white, labels: colourLabels, quantileIn, minArea, radius, hold, reserve, only, delivered }) {
  const n = w * h, tot = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < k; j++) s += A[i * k + j]; tot[i] = s; }
  // a 3x3 box twice: a planned tone that flickers round the floor cell by cell is one shape, not a scatter of dots
  const box = F => { const o = new Float32Array(n); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += F[yy * w + xx]; c++; } } o[y * w + x] = s / c; } return o; };
  const tb = box(box(tot));
  let m = Uint8Array.from(tb, v => (v >= floor ? 1 : 0));
  m = removeSmall(openMask(close(m, w, h, radius + 1), w, h, radius), w, h, minArea);
  for (let i = 0; i < n; i++) if (tot[i] < white || (hold && hold[i]) || (reserve && reserve[i]) || (only && !only[i])) m[i] = 0;
  const { labels, areas, count } = colourLabels ? splitByPuddle(components(m, w, h).labels, colourLabels, w, h, minArea) : components(m, w, h);
  const vals = Array.from({ length: count + 1 }, () => []), owedOf = new Float64Array((count + 1) * k);
  for (let i = 0; i < n; i++) { const id = labels[i]; if (!id || areas[id] < minArea) continue; vals[id].push(tot[i]); for (let q = 0; q < k; q++) owedOf[id * k + q] += Math.max(0, A[i * k + q] - delivered[i * k + q]); }
  const mixOf = new Array(count + 1).fill(null), amountOf = new Float32Array(count + 1);
  for (let id = 1; id <= count; id++) {
    const v = vals[id]; if (!v.length) continue;
    v.sort((a, b) => a - b);
    const a = Math.min(max, v[Math.floor(v.length * quantileIn)]);
    let s = 0; for (let q = 0; q < k; q++) s += owedOf[id * k + q];
    if (a < white || s <= 1e-9) continue;
    mixOf[id] = Array.from({ length: k }, (_, q) => (owedOf[id * k + q] / s) * a); amountOf[id] = a;
  }
  const ids = count < 65535 ? new Uint16Array(n) : new Int32Array(n);
  const bx0 = new Int32Array(count + 1).fill(w), by0 = new Int32Array(count + 1).fill(h), bx1 = new Int32Array(count + 1).fill(-1), by1 = new Int32Array(count + 1).fill(-1), held = new Int32Array(count + 1);
  for (let i = 0; i < n; i++) {
    const id = labels[i]; if (!id || !amountOf[id]) continue;
    for (let q = 0; q < k; q++) delivered[i * k + q] += mixOf[id][q];
    ids[i] = id; held[id]++;
    const x = i % w, y = (i - x) / w;
    if (x < bx0[id]) bx0[id] = x; if (x > bx1[id]) bx1[id] = x; if (y < by0[id]) by0[id] = y; if (y > by1[id]) by1[id] = y;
  }
  const shapes = [], sum = new Array(k).fill(0);
  for (let id = 1; id <= count; id++) if (amountOf[id]) {
    const sh = passage(ids, id, { x0: bx0[id], y0: by0[id], x1: bx1[id], y1: by1[id], area: held[id] }, amountOf[id], areas[id], w);
    sh.mix = mixOf[id]; sh.firstWash = true; shapes.push(sh);
    for (let q = 0; q < k; q++) sum[q] += mixOf[id][q] * held[id];
  }
  if (!shapes.length) return null;
  const area = shapes.reduce((a, sh) => a + sh.area, 0);
  let lead = 0; for (let q = 1; q < k; q++) if (sum[q] > sum[lead]) lead = q;
  const strengths = shapes.map(sh => sh.amount).sort((a, b) => a - b);
  return { value: 1, pigment: lead, firstWash: true, ids, _mask: null, get mask() { return (this._mask ??= Uint8Array.from(this.ids, id => (id ? 1 : 0))); }, set mask(mm) { this._mask = mm; },
    shapes, mix: sum.map(v => v / Math.max(1, area)), amount: strengths[strengths.length >> 1], area };
}

/**
 * Fold soft-edged passages into the enclosing passage of the same recipe and lay it once, graded.
 * Flat values cut from a smooth ramp leave a dried edge at every level line.
 * The graded amount follows the picture inside the passage, rescaled to what the folded staircase laid.
 * DOM free: the caller passes the blur. The layers given are not changed.
 *
 * @param A      per-pixel pigment amounts, n * k
 * @param soft   (shape, layer) => whether this passage's edge fades in the source, so it may be folded
 * @param host   (shape, layer) => whether this passage may take the soft passages inside it
 * @param blur   (field, w, h, sigma) => a blurred copy
 * @returns the layers with folded passages gone, graded ones carrying `graded` and `merged`, and emptied layers dropped
 */
export function gradeSmoothPassages(layers, A, k, w, h, { soft, host: canHost = () => true, blur, contain = 0.9, sigma = null } = {}) {
  const n = w * h;
  // every passage kept, per pigment in the order laid, with its box and the staircase folded into it so far
  const roots = Array.from({ length: k }, () => []);
  // A shared leading pan does not make two puddles the same colour.
  const recipe = sh => Array.from({ length: k }, (_, j) => (sh.mix[j] ?? 0) / Math.max(1e-12, sh.amount));
  const sameRecipe = (a, b) => {
    const x = recipe(a), y = recipe(b);
    return x.length === y.length && x.every((v, j) => Math.abs(v - y[j]) < 1e-6);
  };
  const kept = layers.map(layer => {
    const shapes = [];
    for (const sh of layer.shapes) {
      const box = sh.box ?? boxOf(sh.mask, w, h);
      const inner = soft(sh, layer) ? roots[layer.pigment].findLast(R => sameRecipe(sh, R.shape) && shareInside(sh.mask, box, R.shape.mask, R.box, w, contain) >= contain) : null;
      const host = inner && canHost(inner.shape, inner.layer) ? inner : null;
      if (host) {
        host.sum ??= Float32Array.from(host.shape.mask, v => (v ? host.shape.amount : 0));
        // the soft passage's cells all lie in its box: walk that, not the sheet (the same cells in the same order)
        const m = sh.mask, hm = host.shape.mask, hs = host.sum;
        for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0, i = y * w + box.x0; x <= box.x1; x++, i++) if (m[i] && hm[i]) hs[i] += sh.amount;
        host.merged++;
        continue;
      }
      const R = { shape: sh, layer, box, pigment: layer.pigment, sum: null, merged: 0 };
      roots[layer.pigment].push(R); shapes.push(R);
    }
    // drop masks built for these tests until the passage is painted
    for (const sh of layer.shapes) dropMask(sh);
    return { layer, shapes };
  });
  // Blur on the passage's box widened by 3 sigma, not the sheet. Fields are zero outside the passage, so results match.
  const graded = ({ shape: sh, box, pigment: j, sum, merged }) => {
    const s = sigma ?? Math.max(2, 0.5 * Math.sqrt(box.area) / (merged + 1));
    const ratios = recipe(sh), norm = ratios.reduce((a, v) => a + v * v, 0), mask = sh.mask;
    const r = Math.ceil(s * 3), X0 = Math.max(0, box.x0 - r), X1 = Math.min(w - 1, box.x1 + r), Y0 = Math.max(0, box.y0 - r), Y1 = Math.min(h - 1, box.y1 + r);
    const ww = X1 - X0 + 1, hh = Y1 - Y0 + 1, wm = new Float32Array(ww * hh), wsum = new Float32Array(ww * hh), wa = new Float32Array(ww * hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < ww; x++) {
      const i = (Y0 + y) * w + X0 + x, q = y * ww + x;
      wm[q] = mask[i]; wsum[q] = sum[i];
      if (!mask[i] || norm <= 1e-12) continue;
      let dot = 0;
      for (let c = 0; c < k; c++) dot += A[i * k + c] * ratios[c];
      wa[q] = dot / norm;
    }
    const bm = blur(wm, ww, hh, s), bs = blur(wsum, ww, hh, s), ba = blur(wa, ww, hh, s);
    const G = new Float32Array(n);
    let got = 0, want = 0;
    for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
      const i = y * w + x; if (!mask[i]) continue;
      const q = (y - Y0) * ww + x - X0;
      // where the picture holds none of this pigment nearby, the staircase's own local mean stands in
      G[i] = ba[q] > 1e-4 ? wa[q] * bs[q] / ba[q] : bs[q] / Math.max(1e-6, bm[q]);
      got += G[i]; want += sum[i];
    }
    const scale = got > 1e-9 ? want / got : 1;
    for (let y = box.y0; y <= box.y1; y++) for (let i = y * w + box.x0, e = y * w + box.x1; i <= e; i++) G[i] *= scale;
    const amount = want / Math.max(1, box.area), mix = ratios.map(v => v * amount);
    return { ...sh, graded: G, amount, mix, merged };
  };
  return kept.filter(o => o.shapes.length).map(({ layer, shapes }) => {
    if (shapes.length === layer.shapes.length && shapes.every(R => !R.sum)) return layer;
    const out = shapes.map(R => (R.sum ? graded(R) : R.shape));
    const strengths = out.map(sh => sh.amount).sort((a, b) => a - b), amount = strengths[Math.floor(strengths.length / 2)];
    const mask = new Uint8Array(n);
    out.forEach((sh, q) => { const m = sh.mask, b = shapes[q].box; for (let y = b.y0; y <= b.y1; y++) for (let i = y * w + b.x0, e = y * w + b.x1; i <= e; i++) if (m[i]) mask[i] = 1; });
    const mix = layer.mix.map(v => v * amount / Math.max(1e-12, layer.amount));
    return { ...layer, shapes: out, mask, mix, amount, area: out.reduce((a, sh) => a + sh.area, 0) };
  });
}

/** A mask's bounding box and cell count. */
function boxOf(mask, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1, area = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; area++; }
  return { x0, y0, x1, y1, area };
}

/** The share of one mask's cells that lie in another, counted inside the first one's box; zero early when the boxes
 *  cannot overlap by that much. */
function shareInside(inner, ib, outer, ob, w, contain) {
  const ox = Math.max(0, Math.min(ib.x1, ob.x1) - Math.max(ib.x0, ob.x0) + 1), oy = Math.max(0, Math.min(ib.y1, ob.y1) - Math.max(ib.y0, ob.y0) + 1);
  if (!ib.area || ox * oy < contain * ib.area) return 0;
  let c = 0;
  for (let y = ib.y0; y <= ib.y1; y++) for (let x = ib.x0; x <= ib.x1; x++) { const i = y * w + x; if (inner[i] && outer[i]) c++; }
  return c / ib.area;
}
