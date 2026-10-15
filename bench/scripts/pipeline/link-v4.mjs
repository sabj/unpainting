// --link-v4-try1: use a model's V4 try 1 as its V5 try 1, then V5 runs from try 2. V5 try 1 has no feedback yet, so it
// is the same task as V4 try 1. The published models were linked this way (V5 first, V4 linked back), so this keeps a
// new model comparable with them. Off by default: a fresh V5 try 1 is the fairer start.
import fs from 'node:fs';
import path from 'node:path';
import { validateRun, writeJson, readJson } from '../lib.mjs';

export const LINK_NOTE = 'V4 try 1: the same session and painting';

/** Copy outRoot/v4-pipeline/<model>/1 to outRoot/v5-self-study/<model>/1 as a V5 record. V4 try 1 must be scored (or a dry run). */
export function linkV4Try1({ outRoot, modelKey }) {
  const src = path.join(outRoot, 'v4-pipeline', modelKey, '1'), dst = path.join(outRoot, 'v5-self-study', modelKey, '1');
  if (!fs.existsSync(path.join(src, 'run.json'))) throw new Error(`--link-v4-try1 needs ${src}/run.json`);
  const v4 = readJson(path.join(src, 'run.json'));
  if (!['scored', 'dry-run'].includes(v4.score.status)) throw new Error(`${src} is ${v4.score.status}; score it first, since V5 try 2's feedback reads its scores`);
  const link = e => ({ ...e, pipeline: e.pipeline ? { ...e.pipeline, linkedFrom: LINK_NOTE } : e.pipeline });
  const relink = o => Object.fromEntries(Object.entries(o).map(([c, e]) => [c, link(e)]));
  const run = {
    ...v4, round: 'V5', settings: { ...v4.settings, learnsBetweenTries: true },
    crops: relink(v4.crops), ...(v4.unpainted ? { unpainted: relink(v4.unpainted) } : {}),
  };
  const errs = validateRun(run);
  if (errs.length) throw new Error(`linked run.json failed its checks: ${errs.join('; ')}`);
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });
  writeJson(path.join(dst, 'run.json'), run);
  return run;
}
