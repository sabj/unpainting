// Every setting a recipe or preset turns on must be one the painter can act on in that recipe: it has a reader, its
// switch is on, and nothing about it is inert. A setting that fails these ran as a silent no-op in a past release.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandRecipe } from './recipe.mjs';
import { PRESETS } from './tuned/presets.mjs';
import { ignoredSettings } from './option-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pairs = argv => { const m = {}; for (let i = 0; i < argv.length;) { const k = argv[i++]; if (!k.startsWith('--')) continue; m[k.slice(2)] = i < argv.length && !argv[i].startsWith('--') ? argv[i++] : ''; } return m; };
const profiles = () => ({
  ...Object.fromEntries(['default', 'general', 'combined', 'v096', 'penwash', 'person'].map(r => [`recipe ${r}`, pairs(expandRecipe({ argv: ['--recipe', r], root: ROOT }).argv)])),
  // a preset rides on the default recipe, which supplies switches such as --touchpoints
  ...Object.fromEntries(Object.keys(PRESETS).map(n => [`default+${n}`, pairs(expandRecipe({ argv: ['--recipe', `default+${n}`], root: ROOT }).argv)])),
});

test('no recipe or preset sets a gated-off or inert setting', () => {
  for (const [name, flags] of Object.entries(profiles())) {
    const bad = ignoredSettings({ given: Object.keys(flags), value: k => flags[k] });
    assert.deepEqual(bad.map(b => `--${b.flag}`), [], `${name}: ${bad.map(b => b.reason).join('; ')}`);
  }
});

test('every setting a recipe or preset sets has a reader in the painter source', () => {
  const files = execSync('git ls-files tools src', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(f => /\.(mjs|js)$/.test(f) && !/\.test\./.test(f));
  const source = files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const exempt = new Set(['recipe']);
  for (const [name, flags] of Object.entries(profiles())) {
    for (const k of Object.keys(flags)) {
      if (exempt.has(k)) continue;
      assert.ok(new RegExp(`\\b(?:opt|num)\\(\\s*['"\`]${k}['"\`]|includes\\(\\s*['"]--${k}['"]`).test(source), `${name}: --${k} has no reader`);
    }
  }
});
