// What made a plate, for its log, run card and stroke tape: the line source, the wash plan, and the legacy routes used.
// Since 0.4 there is no legacy route (the rejected methods were deleted; see src/paint/removed-options.mjs), so `legacy`
// is always empty; it is recorded so an old plate that lacks the field reads as made before 0.4.
import path from 'node:path';

/** { lineSource, lineFile, washPlan, studies, legacy } from the run's line source and wash plan choice. */
export function runMethods({ lineSource = null, washPlan = '', areaPlan = '', drawingOnly = false }) {
  const studies = washPlan ? washPlan.split(',').map(s => path.basename(s.split(':')[0])) : [];
  const plan = areaPlan ? 'area plan' : washPlan ? 'block-in study' : drawingOnly ? 'none (drawing only)' : 'none';
  return { lineSource: lineSource?.source ?? 'none', lineFile: lineSource?.file ? path.basename(lineSource.file) : null, washPlan: plan, studies, legacy: [] };
}

/** The log line for the record. */
export function describeMethods(m) {
  return `methods: line ${m.lineSource}${m.lineFile ? ` (${m.lineFile})` : ''}; washes ${m.washPlan}${m.studies.length ? ` (${m.studies.join(', ')})` : ''}; legacy routes: none (deleted in 0.4)`;
}
