// Stored V4/V5 plans that name a planner the painter no longer has are refused before painting, with the reason,
// never painted as if the setting had acted (reasoning inventory moves 1-4).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolvePlan, checkExtraArgs } from './pipeline/plan-args.mjs';
import { BENCH } from './lib.mjs';

const resolveIn = (dir, config, variant, extra = null) => {
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config));
  if (extra) fs.writeFileSync(path.join(dir, 'extra-args.json'), JSON.stringify(extra)); else fs.rmSync(path.join(dir, 'extra-args.json'), { force: true });
  return resolvePlan({ spec: { width: 96, sheetmm: 280 }, planDir: dir, variant, target: path.join(BENCH, 'v2/targets/hills.png'), out: '/out' }).problems;
};

test('move 1: the deep-accent and eye-ring tokens and --deepaccent are refused with the reason', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'removed-'));
  for (const t of ['dg2', 'eye10']) {
    const p = resolveIn(dir, { families: [] }, 'region_w13_' + t);
    assert.ok(p.some(m => m.includes(`"${t}" is refused`) && /removed/.test(m)), t + ': ' + JSON.stringify(p));
  }
  assert.ok(resolveIn(dir, { families: [] }, 'region_w13_dp80').some(m => m.includes('"dp80" is refused')));
  for (const flag of ['deepaccent', 'deepgrow', 'deepaccentin', 'eyering'])
    assert.match(checkExtraArgs(['--' + flag, '1'], '/p')[0] ?? '', new RegExp(`--${flag} was removed: .+`), flag);
  assert.ok(resolveIn(dir, { families: [{ id: 'a', bounds: [0, 0, 1, 1] }], washes: { deepAccent: { max: 80, families: ['a'] } } }, 'region_w13').some(m => /washes\.deepAccent was removed/.test(m)));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('move 1: the stored V5 Mittens plan that sets --deepaccent is refused, not painted without it', () => {
  const dir = path.join(BENCH, 'runs/v5-self-study/argon/2/mittens-plan');
  const variant = fs.readFileSync(path.join(dir, 'variant.txt'), 'utf8').trim();
  const p = resolvePlan({ spec: { width: 96, sheetmm: 280 }, planDir: dir, variant, target: path.join(BENCH, 'v2/targets/mittens.png'), out: '/out' }).problems;
  assert.ok(p.some(m => /--deepaccent was removed/.test(m)), JSON.stringify(p));
});
