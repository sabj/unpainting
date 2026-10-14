// Per-image drawing stages at paint time (--drawingstages auto, the default): measures the image, asks the planner model
// (drawing-planner.mjs), gates its choice with the rule (drawing-choice.mjs) and pushes the linked-stage flags that
// linework-plan.mjs cuts the stages from, so a painting gets a graphite prep, an ink prep and an ink finish in any
// combination. An explicit --stages (a plan's drawing.stages) or --drawing none wins and skips the choice;
// --drawingstages off leaves the pens alone, as before. Writes <out>/drawing-choice.json and logs the model's choice,
// the rule's, the gate's verdict per stage and the final stages. Planning only: it reads the target before the guard
// seals it. Reads --drawingstages, --drawingplanner, --sketchpython, --penwash.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { edgeEvidence } from './line-evidence.mjs';
import { ruleChoice, gateChoice, stageFlags } from './drawing-choice.mjs';
import { plannerChoice, PLANNER_MODEL } from './drawing-planner.mjs';

/** Vanishing-point structure (tools/seg/perspective.py), or null when the python lacks OpenCV. */
function perspectiveOf(python, root, image, width) {
  const ok = spawnSync(python, ['-c', 'import cv2, numpy'], { encoding: 'utf8', timeout: 60000 });
  if (ok.error || ok.status !== 0) return null;
  const r = spawnSync(python, [path.join(root, 'tools/seg/perspective.py'), image, '--width', String(width)], { encoding: 'utf8', timeout: 300000 });
  if (r.error || r.status !== 0) throw new Error(`perspective failed: ${r.error?.message ?? r.stderr}`);
  return JSON.parse(r.stdout.trim().split('\n').at(-1));
}

const said = c => `graphite prep ${c.graphitePrep}, ink prep ${c.inkPrep}, ink finish ${c.inkFinish}`;

/**
 * Choose and push the stages. `rgb` is the target on the plan grid (w x h, 3 bytes a cell); `penLine` the separator's
 * pen-line share. Returns the record (also in drawing-choice.json), or null when the choice does not run.
 */
export async function chooseDrawingStages({ opt, argv, image, root, out, rgb, w, h, penLine, log = () => {}, fetcher = fetch }) {
  const mode = opt('drawingstages', 'auto');
  if (!['auto', 'off'].includes(mode)) throw new Error(`--drawingstages: auto or off, not ${mode}`);
  if (mode === 'off' || opt('drawing', 'first') === 'none' || argv.includes('--stages')) return null;
  const choiceFile = path.join(out, 'drawing-choice.json');
  if (opt('resumestate', '')) {
    if (!fs.existsSync(choiceFile)) return null;
    const record = JSON.parse(fs.readFileSync(choiceFile, 'utf8'));
    argv.push(...record.flags);
    return record;
  }
  const style = Number(opt('penwash', 0)) > 0 ? 'penwash' : null;
  const ev = edgeEvidence(rgb, w, h, { margin: Math.max(2, Math.round(0.04 * Math.min(w, h))) });
  let edges = 0; for (const v of ev.edge) edges += v;
  const features = { edgeShare: +(edges / (w * h)).toFixed(4), penLine: +penLine.toFixed(4), perspective: perspectiveOf(opt('sketchpython', 'python3'), root, image, w) };
  const rule = ruleChoice(features);
  const model = await plannerChoice({ image, root, model: opt('drawingplanner', PLANNER_MODEL), fetcher, log });
  const { final, verdicts } = gateChoice(model.choice ?? null, rule, { style });
  const flags = stageFlags(final, { style });
  const record = { features, model, rule, style, verdicts, final, flags };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'drawing-choice.json'), JSON.stringify(record, null, 1) + '\n');
  log(`drawing stages: model ${model.choice ? `${model.model} chose ${said(model.choice)}${model.cached ? ' (cached)' : ` ($${(model.usd ?? 0).toFixed(4)})`}` : `unavailable (${model.unavailable})`}; rule ${said(rule.choice)}`);
  for (const [k, v] of Object.entries(verdicts)) if (v.model !== v.final || v.rule !== v.final) log(`  ${k}: ${v.final} (${v.why})`);
  if (final.graphitePrep === 'none' && final.inkPrep === 'none' && final.inkFinish === 'none') log(`drawing stages: none, since ${model.reasons?.graphitePrep ?? model.unavailable ?? 'the model said none'} and ${rule.why.graphitePrep}`);
  log(`drawing stages: ${said(final)} (${flags.join(' ')})`);
  argv.push(...flags);
  return record;
}
