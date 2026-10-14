// A wet stroke into a fresh wash waits for the shine to go off while the footprint stays damp, then is laid. A
// just-laid wash holds 0.6-0.8 standing water for hundreds of steps, and on a large footprint the edges dry before the
// middle's puddle soaks in, so no moment may meet both limits. The stroke is laid once the damp share would drop below
// the limit, and paper that never met both is counted (src/media/checks.mjs), never a stop unless --strict 1.
import { check } from '../../src/media/checks.mjs';

export const WET_BED = { moistShare: .7, waterMax: .15, maxWaits: 20000, batch: 10, slowSteps: 140 };

/**
 * paper: the footprint as measured now; observe(): measure it again; step(o): one physics step with options o.
 * Returns { paper, wetWaits }: the paper the stroke will meet and the steps waited.
 */
export function layIntoWetBed({ paper, observe, step, O, info = {} }) {
  const fast = { ...O, dt: 2 };
  let wetWaits = 0;
  if (paper.moistShare >= WET_BED.moistShare && paper.waterMax > WET_BED.waterMax) {
    while (paper.waterMax > WET_BED.waterMax && wetWaits < WET_BED.maxWaits) {
      const before = wetWaits;
      for (let j = 0; j < WET_BED.batch; j++) step(before >= WET_BED.slowSteps ? fast : O);
      wetWaits += WET_BED.batch;
      paper = observe();
      if (paper.moistShare < WET_BED.moistShare) break;
    }
  }
  check('wet wash laid on uneven paper', paper.moistShare >= WET_BED.moistShare && paper.waterMax <= WET_BED.waterMax,
    { ...info, moistShare: +paper.moistShare.toFixed(3), waterMax: +paper.waterMax.toFixed(3), wetWaits });
  return { paper, wetWaits };
}
