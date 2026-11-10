// The CPU plan preview of a V4 or V5 plan, and what a try cost.
//
// The painter's planning step (--valuepreviewonly) books every passage of the plan flat and renders that ledger through
// the sheet's optics on flat paper (tools/painter/plan-value-check.mjs). It takes seconds on the CPU and paints nothing.
// The check hands it to the model as the main feedback: iterate on it, then render once. It shows values and colour
// areas; it does not show edges, brush marks or texture, which only a render does.
//
// Copied into the model's worktree as bench/preview.mjs beside check.mjs, so it imports only sharp (the worktree's
// node_modules).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

/** The planning step's preview files in an output folder. Missing files are an error, never an empty preview. */
export function readPreview(outDir) {
  const ledger = path.join(outDir, 'plan-ledger.png'), file = path.join(outDir, 'plan-value-check.json');
  if (!fs.existsSync(ledger)) throw new Error(`the plan preview was not written: no plan-ledger.png in ${outDir}`);
  if (!fs.existsSync(file)) throw new Error(`the plan preview has no statistics: no plan-value-check.json in ${outDir}`);
  return { ledger, report: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

/** The target and the plan ledger side by side as one JPEG, at the ledger's own size. */
export async function writePreviewCompare({ target, ledger, dest }) {
  const { width, height } = await sharp(ledger).metadata();
  const left = await sharp(target).resize({ width, height, fit: 'fill' }).flatten({ background: '#fff' }).removeAlpha().png().toBuffer();
  await sharp({ create: { width: width * 2, height, channels: 3, background: '#fff' } })
    .composite([{ input: left, left: 0, top: 0 }, { input: ledger, left: width, top: 0 }]).jpeg({ quality: 88 }).toFile(dest);
  return dest;
}

/** What the model is told after an admitted check. */
export function previewText({ report, compare }) {
  const p = report.plan, t = report.target;
  return [
    'Plan preview (CPU, a few seconds, nothing painted): your plan booked flat and rendered through the sheet optics, at 300 px, against the target.',
    `  dark share ${p.darkShare} (target ${t.darkShare}); mean L* ${p.meanL} (target ${t.meanL}); L5 ${p.L5} (target ${t.L5}); paper share ${p.paperShare} (target ${t.paperShare})`,
    `  Open ${compare} (target left, plan preview right).`,
    'It predicts the painted values; it shows values and colour areas, not edges, brush marks or texture. Change the plan and run the check again as often as you like: it costs nothing. Render once.',
  ].join('\n');
}

/**
 * The cost of one try. checks: [{ seconds, previewSeconds }] one per admission check run (the model's, the start's and
 * the harness's); renders: painter runs started; renderSeconds: their wall time. An unmeasured preview time is an
 * error: a cost record never rounds a missing number to zero.
 */
export function costRecord({ checks, renders, renderSeconds }) {
  for (const c of checks) {
    if (!Number.isFinite(c.seconds)) throw new Error('a check has no seconds');
    if (!Number.isFinite(c.previewSeconds)) throw new Error('a check has no previewSeconds');
  }
  const sum = k => +checks.reduce((a, c) => a + c[k], 0).toFixed(1);
  return { checks: checks.length, checkSeconds: sum('seconds'), previewSeconds: sum('previewSeconds'), renders, renderSeconds };
}
