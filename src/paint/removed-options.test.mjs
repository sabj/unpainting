import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REMOVED_OPTIONS, refuseRemoved } from './removed-options.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('a removed option stops the run before painting, with its reason', () => {
  assert.throws(() => refuseRemoved(['--image', 'x.png', '--subjectwash', '1']), /--subjectwash was removed: .+/);
  assert.throws(() => refuseRemoved(['--deepaccent', '85', '--eyering', '.01']), /--deepaccent was removed: .+--eyering was removed: .+/s);
  assert.doesNotThrow(() => refuseRemoved(['--image', 'x.png', '--width', '480']));
});

test('move 1: subject washes, the deep accents and the eye ring are removed options', () => {
  for (const k of ['subjectwash', 'subjectform', 'subjectbands', 'deepaccent', 'deepgrow', 'deepaccentin', 'eyering'])
    assert.ok(Object.hasOwn(REMOVED_OPTIONS, k), k);
});

test('move 3: --glazepasses is a removed option', () => {
  assert.ok(Object.hasOwn(REMOVED_OPTIONS, 'glazepasses'));
});

test('no removed option is still in the option ledger or a recipe', () => {
  const ledger = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/paint/option-ledger.json'), 'utf8')).options);
  const recipes = fs.readFileSync(path.join(ROOT, 'src/paint/recipe.mjs'), 'utf8');
  for (const k of Object.keys(REMOVED_OPTIONS)) {
    assert.ok(!ledger.has(k), `${k} is removed but still in option-ledger.json`);
    assert.doesNotMatch(recipes, new RegExp(`--${k}\\b`), `${k} is removed but a recipe still sets it`);
  }
});
