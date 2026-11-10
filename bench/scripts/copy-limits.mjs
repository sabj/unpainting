// The copy checks a finished plate must pass before its look is allowed to count for anything. They read only the
// painter's own records (cheat-risk.json and target-guard.json), never the images.
//
//   guard     the paint step ran under the target guard and made no blocked read
//   looks     the painter took no look at the target while painting
//   hfCorr    fine-detail correlation with the target is at or under the ceiling for the plate's width
//
// Each is an absolute limit on the plate itself. None compares the plate with another build.

/** rec: { hfCorr, hfCeiling, guard: { guarded, violations }, looks }. A missing number is an error, not a pass. */
export function copyLimits(rec) {
  const need = (v, name) => { if (!Number.isFinite(v)) throw new Error(`copy check needs ${name}, and the run has none`); return v; };
  if (!rec?.guard?.guarded) throw new Error('copy check needs a guarded run, and this run was painted with the target guard off or has no guard record');
  const hf = need(rec.hfCorr, 'hfCorr'), ceiling = need(rec.hfCeiling, 'hfCeiling');
  const checks = {
    guard: { value: need(rec.guard.violations, 'guard violations'), limit: 0 },
    looks: { value: need(rec.looks, 'the paint-time look count'), limit: 0 },
    hfCorr: { value: hf, limit: ceiling, margin: +(ceiling - hf).toFixed(3) },
  };
  for (const c of Object.values(checks)) c.pass = c.value <= c.limit;
  return { pass: Object.values(checks).every(c => c.pass), checks };
}

/** One line for a report: which limits failed, or that all passed. */
export function copyLimitsLine(r) {
  const failed = Object.entries(r.checks).filter(([, c]) => !c.pass).map(([k, c]) => `${k} ${c.value} over ${c.limit}`);
  return failed.length ? `FAIL: ${failed.join(', ')}` : `pass (hfCorr ${r.checks.hfCorr.value} of ${r.checks.hfCorr.limit})`;
}
