// Delivery calibration per technique from the sheet's own ledger (--techcal). The swatch calibration charges each
// technique for what it lays on a 50-cell square swept by one wide brush. On the sheet a passage is laid with a real
// brush along a long path, and some techniques keep far less: in 0.2.0 the graded shadow glazes (value bands 4 and 5)
// lay about half of what they are charged for. This module compares, between two full reads of the sheet, the pigment
// the sheet gained with what the brush was charged for, and gives the technique that laid most of that window a charge
// factor for its later passages.
//
// It reads only the sheet and the ledger, never the target. One number per technique, so it carries no spatial detail.

/**
 * @param {{ max?: number, min?: number, share?: number, minMass?: number, smooth?: number }} options
 *   max/min: clamp on a factor (default 2.5 and 0.8); share: least share of a window's charge one technique must hold
 *   for the window to calibrate it (default 0.8); minMass: least charged mass in a window; smooth: weight of the newest
 *   reading against the previous factor (default 0.7).
 */
export function createTechniqueCal({ max = 2.5, min = 0.8, share = 0.8, minMass = 1e-3, smooth = 0.7 } = {}) {
  if (!(max >= min && min > 0)) throw new Error('technique calibration: max must be at least min, and min positive');
  if (!(share > 0.5 && share <= 1)) throw new Error('technique calibration: share must be over 0.5 and at most 1');
  const factor = new Map(), window = new Map(), history = [];
  let last = null;
  return {
    /** The factor for a technique; 1 until a window has measured it. */
    factor: key => factor.get(key) ?? 1,
    factors: () => Object.fromEntries(factor),
    /** Book what a passage's brush was charged for: ledger mass times every factor it used, this one included. */
    book(key, mass) { if (mass > 0) window.set(key, (window.get(key) ?? 0) + mass); },
    /** A full read of the sheet: `held` is the total pigment mass on it, in ledger units. Returns the window's record. */
    observe(held) {
      const charged = [...window.values()].reduce((a, v) => a + v, 0);
      const gained = last == null ? null : held - last;
      let record = { charged: +charged.toFixed(4), gained: gained == null ? null : +gained.toFixed(4), technique: null, kept: null };
      if (gained != null && charged > minMass) {
        const [key, mass] = [...window.entries()].reduce((a, b) => (b[1] > a[1] ? b : a));
        if (mass / charged >= share) {
          const kept = gained / charged;
          record = { ...record, technique: key, kept: +kept.toFixed(3) };
          // the booked charge already carries the factor, so kept is the technique's own yield
          if (kept > 0) factor.set(key, smooth * Math.max(min, Math.min(max, 1 / kept)) + (1 - smooth) * (factor.get(key) ?? 1));
        }
      }
      // a window is measured once; the next read starts from this one
      window.clear();
      last = held;
      history.push({ ...record, factors: Object.fromEntries([...factor].map(([k, v]) => [k, +v.toFixed(3)])) });
      return record;
    },
    history: () => history.slice(),
  };
}
