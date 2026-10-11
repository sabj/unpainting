// Delivery calibration from the sheet's own ledger (--deliverycal). The swatch calibration charges each technique for
// what it lays on a scrap, but on the sheet a passage keeps less: lanes overlap edges, water carries pigment past the
// shape, and the last pass of a shape has no later pass to make up its shortfall. This module compares, per pigment,
// what the sheet holds with what the brush was charged for, and scales later charges by the inverse.
//
// It reads only the sheet and the ledger, never the target. The ratio is a whole-sheet sum per pigment, one number per
// pan, so it cannot carry any spatial detail into the strokes.

/**
 * @param {number} pigments number of wash pigments
 * @param {{ max?: number, min?: number, minMass?: number, smooth?: number }} options
 *   max/min: clamp on the charge factor (default 1.8 and 1); minMass: least charged mass before a pan is calibrated;
 *   smooth: weight of the newest reading against the previous factor (default 0.7).
 */
export function createDeliveryCal(pigments, { max = 1.8, min = 1, minMass = 1e-3, smooth = 0.7 } = {}) {
  if (!(pigments > 0)) throw new Error('delivery calibration needs at least one pigment');
  if (!(max >= min && min > 0)) throw new Error('delivery calibration: max must be at least min, and min positive');
  const charged = new Float64Array(pigments);
  const factor = new Float64Array(pigments).fill(1);
  const history = [];
  return {
    /** The factor a passage is charged with for pigment j, frozen by the caller at the passage's first dip. */
    factor: j => factor[j],
    factors: () => Array.from(factor),
    /** Book what the brush was charged for: ledger mass for pigment j times the extra factors that passage used. */
    book(j, mass) { if (mass > 0) charged[j] += mass; },
    charged: () => Array.from(charged),
    /**
     * A full read of the sheet: held[j] is the pigment mass the sheet holds, on the same grid as the ledger.
     * Returns the new factors.
     */
    observe(held) {
      const row = [];
      for (let j = 0; j < pigments; j++) {
        if (!(charged[j] > minMass)) { row.push(null); continue; }
        const kept = held[j] / charged[j];
        row.push(+kept.toFixed(3));
        if (!(kept > 0)) continue;
        const want = Math.max(min, Math.min(max, 1 / kept));
        factor[j] = smooth * want + (1 - smooth) * factor[j];
      }
      history.push({ kept: row, factor: Array.from(factor, v => +v.toFixed(3)) });
      return Array.from(factor);
    },
    history: () => history.slice(),
  };
}
