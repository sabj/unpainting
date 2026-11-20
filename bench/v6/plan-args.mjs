// DRAFT, not yet run: the painter command for a bench/v6 plan (bench/v6/TASK.md). The painter does not read the plan's
// drawing and washes.layers sections yet, so this maps them to its options: the drawing file, the wash studies and the box.
import path from 'node:path';

const fail = msg => { throw new Error(`v6 plan: ${msg}`); };

/** paint-plate arguments for a v6 plan folder: [script, --option, value, ...]. */
export function v6Args({ plan, planDir, target, width, out }) {
  if (!plan || typeof plan !== 'object') fail('plan.json must be an object');
  const sheet = plan.sheet ?? {};
  if (!(sheet.widthMm > 0)) fail('sheet.widthMm is required');
  const args = ['tools/paint-plate.mjs', '--image', target, '--width', String(width), '--sheetmm', String(sheet.widthMm), '--seed', String(sheet.seed ?? 0), '--out', out];
  const d = plan.drawing ?? { medium: 'none' };
  if (d.medium === 'none') args.push('--drawing', 'none');
  else {
    if (!['ink', 'pencil'].includes(d.medium)) fail('drawing.medium: ink, pencil or none');
    if (!d.file) fail('drawing.file: a traced, ordered line file (trace-drawing.py, order-strokes.mjs)');
    const stem = path.join(planDir, d.file).replace(/-lines\.json$/, '');
    args.push('--drawingfile', stem, '--drawing', 'first', ...(d.medium === 'ink' ? ['--inkrecipe', 'wash'] : ['--outlinemedium', 'graphite']));
  }
  const layers = plan.washes?.layers ?? [];
  if (!layers.length) fail('washes.layers: at least one block-in study');
  args.push('--washplan', layers.map(l => [path.join(planDir, l.study), l.leastMm2 ?? '', l.glaze ? 'glaze' : ''].join(':').replace(/:+$/, '')).join(','));
  if (plan.washes?.paints?.length) args.push('--paints', plan.washes.paints.join(','));
  return args;
}
