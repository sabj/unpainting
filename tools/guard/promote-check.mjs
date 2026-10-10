#!/usr/bin/env node
// Promotion check: may a run be shown as a result (a gallery, a post, a best-of list)?
//
// A run fails when
//   1. it was not painted with the target guard blocking (target-guard.json, mode gentle or hard),
//   2. its paint step read the target at cell level, or
//   3. it has no cheat-risk.json.
// A run whose cheat-risk level is high passes with review: true. A person looks at its stage strip before it is shown.
// The score also rises on weak technique, so it never excludes a run by itself.
//
//   node tools/guard/promote-check.mjs RUNDIR [RUNDIR...]     exit 0 when every run passes, 1 otherwise; one JSON line per run
import fs from 'node:fs';
import path from 'node:path';

const BLOCKING = new Set(['gentle', 'hard', 'strict']);

function readJson(run, f) {
  const p = path.join(run, f);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { throw new Error(`${p}: ${e.message}`); }
}

export function promoteCheck(run) {
  const reasons = [];
  const guard = readJson(run, 'target-guard.json'), risk = readJson(run, 'cheat-risk.json');
  if (!guard) reasons.push('not guarded: no target-guard.json (paint with the default --targetguard gentle, or hard)');
  else if (!BLOCKING.has(guard.mode)) reasons.push(`not guarded: target guard was ${guard.mode}`);
  else if (guard.violations > 0) reasons.push(`paint step read the target ${guard.violations} time(s): ${Object.keys(guard.byName ?? {}).join(', ')}`);
  if (!risk) reasons.push('no cheat-risk.json (node tools/guard/cheat-risk.mjs RUN TARGET SHEETMM)');
  const review = risk?.level === 'high';
  return {
    run: path.basename(run), pass: reasons.length === 0, review, risk: risk?.risk ?? null, level: risk?.level ?? null, reasons,
    ...(review ? { reviewWhy: `cheat risk high (${risk.risk}): ${(risk.flags ?? []).join(', ') || 'copy or small strokes'}` } : {}),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runs = process.argv.slice(2);
  if (!runs.length) { console.error('usage: promote-check.mjs RUNDIR [RUNDIR...]'); process.exit(2); }
  const results = runs.map(promoteCheck);
  results.forEach(r => console.log(JSON.stringify(r)));
  process.exit(results.every(r => r.pass) ? 0 : 1);
}
