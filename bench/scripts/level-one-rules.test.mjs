// Level 1's rules as the owner set them (23 Nov 2026): one attempt, a budget of 3 paintings, how it paints free (no
// limit on strokes), work measured and never capped, one runaway guard, the clock a far safety stop. The kit, the
// runner, the brief, the prompts and the run record say the same.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BENCH, V2, loadRuns, loadLevelOneCrops, validateRun } from './lib.mjs';
import { attemptMinutes, guarded, LEVEL_ONE_MINUTES, SAFETY_STOP_MINUTES } from './v3.mjs';
import { DEFAULT_WALL_MINUTES } from '../../tools/paint/session.mjs';

const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

test('no limit on strokes at level 1: not in the kit, the brief or the prompts', () => {
  const kit = read(V2, 'kit', 'kit.mjs');
  assert.doesNotMatch(kit, /stroke budget of|export const BUDGET|2,500|2500/, 'the kit stops no painting at a stroke count');
  assert.match(kit, /budget: null/, 'stats.json says so');
  for (const f of ['BRIEF.md', 'prompts.json', 'README.md']) assert.doesNotMatch(read(BENCH, 'v3', f), /2,500|2500 strokes|30 minutes|32 minutes|stopped at 30/, `bench/v3/${f}`);
  assert.match(read(BENCH, 'v3', 'BRIEF.md'), /There is no limit on strokes\./);
  assert.match(read(BENCH, 'v3', 'BRIEF.md'), /budget of 3 paintings/);
});

test('the session has 60 minutes; the six-hour stop of levels 2 to 4 is the most; the brief and the docs say the limit in force', () => {
  assert.equal(attemptMinutes({}), 60); assert.equal(LEVEL_ONE_MINUTES, 60); assert.equal(SAFETY_STOP_MINUTES, DEFAULT_WALL_MINUTES);
  assert.equal(attemptMinutes({ BENCH_V3_ATTEMPT_MIN: '45' }), 45, 'another may be stated');
  assert.equal(attemptMinutes({ BENCH_V3_ATTEMPT_MIN: '9999' }), 360, 'never past six hours');
  const brief = read(BENCH, 'v3', 'BRIEF.md');
  assert.match(brief, /The session has \{LIMIT_MIN\} minutes on the clock/); assert.doesNotMatch(brief, /no deadline|far safety stop/);
  assert.match(read(BENCH, 'v3', 'README.md'), /The session has 60 minutes on the clock/);
  assert.match(read(BENCH, 'README.md'), /the session has 60 minutes on the clock/);
  assert.match(read(BENCH, 'docs', 'rules.md'), /60 minutes on the clock \(`--wallminutes 60`/);
});

test('a target without its rendering unit has no runaway guard and is refused by name', () => {
  const specs = loadLevelOneCrops();
  assert.doesNotThrow(() => guarded(['mittens-closeup-full'], specs));
  assert.throws(() => guarded(['mittens-closeup-full', 'h36-full'], specs), /level 1 target h36-full: no rendering unit.*Not started/);
  assert.throws(() => guarded(['not-a-target'], specs), /not-a-target/);
});

test('a level 1 record of 0.4 has no stroke budget; the published V1 to V3 records keep 2,500', () => {
  const old = structuredClone(loadRuns().find(e => e.run.round === 'V3').run);
  assert.equal(old.settings.strokeBudget, 2500); assert.deepEqual(validateRun(old), []);
  assert.match(validateRun({ ...old, settings: { ...old.settings, strokeBudget: null } }).join(), /strokeBudget must be 2500/, 'an old record cannot drop its limit');
  const now = { ...old, settings: { ...old.settings, strokeBudget: null, paintingsPerAttempt: 3 } };
  const crop = Object.keys(now.crops)[0]; now.crops = { ...now.crops, [crop]: { ...now.crops[crop], strokes: 6000 } };
  assert.deepEqual(validateRun(now), [], '6,000 strokes is a valid level 1 painting');
  assert.match(validateRun({ ...old, crops: now.crops }).join(), /strokes must be 0\.\.2500/);
});
