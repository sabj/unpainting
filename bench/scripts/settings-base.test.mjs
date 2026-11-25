// The V4 and V5 base recipe must not carry settings the painter cannot act on (see src/paint/option-check.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { argsBuilder, layerBase, optionMap, BASE } from './pipeline/plan-args.mjs';
import { ignoredSettings } from '../../src/paint/option-check.mjs';

const BENCH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = argsBuilder({ planDir: '<plan>', target: '<t>', width: 1000, sheetmm: 280, targetPixels: [1000, 800] });

test('the base recipe sets no gated-off or inert setting', () => {
  const layered = layerBase({ variant: 'region_w13', build });
  const flags = Object.fromEntries(optionMap(layered.args));
  const bad = ignoredSettings({ given: Object.keys(flags), value: k => flags[k] });
  assert.deepEqual(bad.map(b => `--${b.flag}`), [], bad.map(b => b.reason).join('; '));
});

test('the model brief quotes the same base recipe the harness applies', () => {
  assert.ok(fs.readFileSync(path.join(BENCH, 'v4v5', 'TASK.md'), 'utf8').includes('`' + BASE + '`'));
});

test('the benchmark inherits the default recipe wash and method settings', async () => {
  const { expandRecipe } = await import('../../src/paint/recipe.mjs');
  const template = layerBase({ variant: 'region_w13', build }).args;
  const at = template.indexOf('--valueplan');
  const raw = template.filter((_, i) => i !== at && i !== at + 1);
  const actual = optionMap([raw[0], ...expandRecipe({ argv: raw.slice(1) }).argv]);
  const expected = optionMap(['tools/paint-plate.mjs', ...expandRecipe({ argv: [] }).argv]);
  for (const key of ['midlayers', 'smallmarks', 'washjoin', 'undercover', 'brushchoice',
    'huechroma', 'lightfamilies', 'palelights', 'washsession', 'subjectorder', 'finaldarks']) {
    assert.equal(actual.get(key), expected.get(key), key);
  }
  for (const key of ['skylanes', 'skysplit', 'wetgate', 'strokeplan', 'laneadapt']) {
    assert.equal(actual.get(key), expected.get(key), key);
  }
});
