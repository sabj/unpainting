// The V4 and V5 base recipe must not carry settings the painter cannot act on (see src/paint/option-check.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { argsBuilder, layerBase, optionMap, BASE } from './pipeline/plan-args.mjs';
import { ignoredSettings } from '../../src/paint/option-check.mjs';

const BENCH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = trumbull => argsBuilder({ planDir: '<plan>', target: '<t>', width: 1000, sheetmm: 280, targetPixels: [1000, 800], trumbull });

test('the base recipe sets no gated-off or inert setting, for any subject', () => {
  for (const trumbull of [false, true]) {
    const layered = layerBase({ variant: 'region_w13', build: build(trumbull), architecture: trumbull, trumbull });
    const flags = Object.fromEntries(optionMap(layered.args));
    const bad = ignoredSettings({ given: Object.keys(flags), value: k => flags[k] });
    assert.deepEqual(bad.map(b => `--${b.flag}`), [], `trumbull ${trumbull}: ${bad.map(b => b.reason).join('; ')}`);
  }
});

test('the model brief quotes the same base recipe the harness applies', () => {
  assert.ok(fs.readFileSync(path.join(BENCH, 'v4v5', 'TASK.md'), 'utf8').includes('`' + BASE + '`'));
});
