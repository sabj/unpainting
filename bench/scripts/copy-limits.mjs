// The copy checks a finished plate must pass before its look is allowed to count for anything. They read only the
// painter's own records (cheat-risk.json, target-guard.json, run-card.json), never the images.
//
//   guard     the paint step ran under the target guard and made no blocked read
//   looks     the painter took no look at the target while painting
//   hfCorr    fine-detail correlation with the target is at or under the ceiling for the plate's width
//   strokes   paint strokes are at or under the sheet's stroke ceiling (tools/guard/cheat-risk.mjs)
//
// Each is an absolute ceiling on the plate itself. None compares the plate with another build, so a change that
// repaints the whole sheet another way is judged by the same limits as a one-line fix. What a change costs in
// strokes and render time is reported beside the limits (cost, costChange) and never passes or fails anything.
import { strokeCeiling } from '../../tools/guard/cheat-risk.mjs';

/** rec: { hfCorr, hfCeiling, guard: { guarded, violations }, looks, strokes, sheetMm, width, height, smallShare?,
 *  seconds? }; sheetMm is the sheet's width, width and height the painting's pixels. A missing number is an error,
 *  not a pass. */
export function copyLimits(rec) {
  const need = (v, name) => { if (!Number.isFinite(v)) throw new Error(`copy check needs ${name}, and the run has none`); return v; };
  if (!rec?.guard?.guarded) throw new Error('copy check needs a guarded run, and this run was painted with the target guard off or has no guard record');
  const hf = need(rec.hfCorr, 'hfCorr'), ceiling = need(rec.hfCeiling, 'hfCeiling'), strokes = need(rec.strokes, 'the stroke count');
  const heightMm = rec.sheetMm * rec.height / rec.width, most = strokeCeiling(rec.sheetMm, heightMm);
  const checks = {
    guard: { value: need(rec.guard.violations, 'guard violations'), limit: 0 },
    looks: { value: need(rec.looks, 'the paint-time look count'), limit: 0 },
    hfCorr: { value: hf, limit: ceiling, margin: +(ceiling - hf).toFixed(3) },
    strokes: { value: strokes, limit: most },
  };
  for (const c of Object.values(checks)) c.pass = c.value <= c.limit;
  const cost = {
    strokes, strokesPer100Cm2: +(strokes / (rec.sheetMm * heightMm / 1e4)).toFixed(1), sheetCover: +(strokes / most).toFixed(3),
    smallShare: Number.isFinite(rec.smallShare) ? rec.smallShare : null, seconds: Number.isFinite(rec.seconds) ? rec.seconds : null,
  };
  return { pass: Object.values(checks).every(c => c.pass), checks, cost };
}

/** What B costs as a multiple of A. For the report only. */
export function costChange(a, b) {
  const ratio = (x, y) => (Number.isFinite(x) && Number.isFinite(y) && x > 0 ? +(y / x).toFixed(2) : null);
  return { strokes: ratio(a.cost.strokes, b.cost.strokes), seconds: ratio(a.cost.seconds, b.cost.seconds) };
}

/** One line for a report: which limits failed, or that all passed. */
export function copyLimitsLine(r) {
  const failed = Object.entries(r.checks).filter(([, c]) => !c.pass).map(([k, c]) => `${k} ${c.value} over ${c.limit}`);
  return failed.length ? `FAIL: ${failed.join(', ')}` : `pass (hfCorr ${r.checks.hfCorr.value} of ${r.checks.hfCorr.limit})`;
}
