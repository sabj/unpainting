// Shadow glazes charged against what the plan has already laid.
//
// The nested value bands split a cell's paint by its value, and each band's wash is one flat charge over a connected
// shape. Cells darker than the sheet's value peak share one value, and a flat charge cannot serve cells whose
// paint differs by a factor of two, so the deepest cells ended a whole value step too light. A painter sets the
// shadow load from the gap that is left: she looks at what the washes laid and glazes the cells that are still too
// light, a limited step at a time, each glaze dried before the next.
//
// Here the gap is measured in the plan's own forward model (mass-tone.mjs), never against the picture: the cell's
// ideal light is the light its own fitted paint returns, its laid light is the light of what the earlier passes
// booked. A glaze covers the cells whose gap is still visible, asks each one the paint that closes at most one value
// step of the gap, and is charged at its shape's mass tone by the caller. Plan time only.
import { filmLight } from './mass-tone.mjs';

/** The gap in L* below which a glaze leaves a cell alone: about the smallest lightness step the eye reads. */
export const GAP_FLOOR_L = 2;
/** Most glazes after the washes. A glaze closes one value step, so four reach past any picture's dark end. */
export const MAX_GLAZES = 4;

/** CIE lightness of a light, with the paper's light as 100. */
export function lightnessOf(light, paperLight) {
  const t = Math.max(0, light) / paperLight;
  return t > 216 / 24389 ? 116 * Math.cbrt(t) - 16 : (24389 / 27) * t;
}

/** The light that has lightness L, the inverse of lightnessOf. */
export function lightOfLightness(L, paperLight) {
  return paperLight * (L > 8 ? ((L + 16) / 116) ** 3 : (27 / 24389) * L);
}

/** One step of the picture's nine-step value scale in L*: its lightest (99th percentile) to its darkest (0.1th), over 8. */
export function valueStepL(lightness) {
  const n = lightness.length;
  if (!n) throw new Error('shadow glazes: an empty picture has no value scale');
  const s = Float32Array.from(lightness).sort(), q = f => s[Math.min(n - 1, Math.floor(f * n))];
  return (q(0.99) - q(0.001)) / 8;
}

/**
 * The ledger of one plan. `demand` is the fitted paint per cell (n * k, after the cell-light match); `eligible(i, glaze)`
 * (glaze is the options object glaze() was called with) says which cells a glaze may cover: false, true, or 'fine' for a small dark that is read cell by cell; `squint(field)` blurs a per-cell field over the distance a wash can hold (the
 * planner's own squint), so a glaze answers the shape of the gap and never traces a feature finer than a wash.
 * lay(list, mix) books a pass as the planner makes it. glaze({ last }) returns, for the cells still too light, `wt` (1
 * where the glaze covers), `ask` (n * k, the paint each cell asks) and the gap seen.
 */
export function createShadowGlazes({ n, k, pigments, paperRGB, demand, eligible, squint = field => field, floorL = GAP_FLOOR_L }) {
  if (demand.length !== n * k) throw new Error('shadow glazes: demand does not match the grid');
  const paper = Array.from(paperRGB, v => v / 255), paperLight = filmLight([0, 0, 0], [0, 0, 0], paper);
  const laid = new Float32Array(n * k), kx = [0, 0, 0], sx = [0, 0, 0], rk = [0, 0, 0], rs = [0, 0, 0];
  const sums = (i, amount, K, S) => { K[0] = K[1] = K[2] = S[0] = S[1] = S[2] = 0; for (let j = 0; j < k; j++) { const a = amount(i, j); if (a > 0) for (let c = 0; c < 3; c++) { K[c] += a * pigments[j].K[c]; S[c] += a * pigments[j].S[c]; } } };
  // the light each cell's own fitted paint returns, and its squint
  const ideal = new Float32Array(n);
  for (let i = 0; i < n; i++) { sums(i, (q, j) => demand[q * k + j], kx, sx); ideal[i] = filmLight(kx, sx, paper); }
  const idealSquint = squint(ideal);
  const step = valueStepL(Float32Array.from(ideal, v => lightnessOf(v, paperLight)));
  return {
    step,
    lay(list, mix) { for (const i of list) for (let j = 0; j < k; j++) laid[i * k + j] += mix[j]; },
    glaze(options = {}) {
      const { remaining = Infinity } = options;
      const wt = new Float32Array(n), ask = new Float32Array(n * k), gaps = [], now = new Float32Array(n), gapAt = new Float32Array(n);
      for (let i = 0; i < n; i++) { sums(i, (q, j) => laid[q * k + j], kx, sx); now[i] = filmLight(kx, sx, paper); }
      const nowSquint = squint(now), seen = [];
      for (let i = 0; i < n; i++) {
        const kind = eligible(i, options);
        if (!kind) continue;
        // a small dark (kind 'fine') is read cell by cell: squinting would blur it away, and it asks only for its own gap
        const gap = kind === 'fine' ? lightnessOf(now[i], paperLight) - lightnessOf(ideal[i], paperLight) : lightnessOf(nowSquint[i], paperLight) - lightnessOf(idealSquint[i], paperLight);
        if (gap >= floorL) { gapAt[i] = gap; seen.push(gap); }
      }
      // A glaze closes one value step. When the glazes still to come could not close the gap seen at that rate, the
      // step grows to what they can: the load is set from the measured gap.
      seen.sort((a, b) => a - b);
      const gap95 = seen.length ? seen[Math.min(seen.length - 1, Math.floor(0.95 * seen.length))] : 0, limit = Math.max(step, gap95 / Math.max(1, remaining));
      for (let i = 0; i < n; i++) {
        const gap = gapAt[i];
        if (!(gap >= floorL)) continue;
        sums(i, (q, j) => laid[q * k + j], kx, sx);
        sums(i, (q, j) => Math.max(0, demand[q * k + j] - laid[q * k + j]), rk, rs);
        if (!(rk[0] + rk[1] + rk[2] + rs[0] + rs[1] + rs[2] > 0)) continue;
        let s = 1;
        if (gap > limit) {
          const want = lightOfLightness(lightnessOf(now[i], paperLight) - limit, paperLight), at = f => filmLight([kx[0] + f * rk[0], kx[1] + f * rk[1], kx[2] + f * rk[2]], [sx[0] + f * rs[0], sx[1] + f * rs[1], sx[2] + f * rs[2]], paper);
          let lo = 0, hi = 1;
          for (let it = 0; it < 24; it++) { const mid = (lo + hi) / 2; if (at(mid) > want) lo = mid; else hi = mid; }
          s = (lo + hi) / 2;
        }
        wt[i] = 1; gaps.push(gap);
        for (let j = 0; j < k; j++) ask[i * k + j] = s * Math.max(0, demand[i * k + j] - laid[i * k + j]);
      }
      return { wt, ask, cells: gaps.length, gap95, limit };
    },
  };
}
