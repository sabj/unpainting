// Containment of overfit settings (docs/overfitting.md): the general recipe sets no fitted flag, and painting code
// never branches on a benchmark subject id. Fitted rules live in src/paint/tuned/ and run only through a preset that
// the plan or --recipe names.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandRecipe } from './recipe.mjs';
import { PRESETS, presetFlagNames, presetFlags } from './tuned/presets.mjs';
import { TUNED_DEFAULT_FLAGS } from './tuned/default-flags.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TUNED_DIR = path.join(ROOT, 'src/paint/tuned');
const names = argv => argv.filter(a => a.startsWith('--')).map(a => a.slice(2));

// Subject ids of the benchmark images: every key of subjects.json.
const SUBJECT_IDS = Object.keys(JSON.parse(fs.readFileSync(path.join(TUNED_DIR, 'subjects.json'), 'utf8')));
// Painting code: everything in src/ but the tuned folder and tests, and the painter command.
function paintingCode() {
  const files = [path.join(ROOT, 'tools/paint-plate.mjs')];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (p !== TUNED_DIR) walk(p); } else if (/\.(mjs|json)$/.test(e.name) && !e.name.endsWith('.test.mjs')) files.push(p);
    }
  };
  walk(path.join(ROOT, 'src'));
  return files;
}

test('the general recipe sets no tuned flag', () => {
  const given = new Set(names(expandRecipe({ argv: ['--recipe', 'general'] }).argv));
  const tuned = new Set([...presetFlagNames(), ...names(TUNED_DEFAULT_FLAGS.split(' '))]);
  assert.deepEqual([...given].filter(n => tuned.has(n)), []);
});

test('no painting code outside src/paint/tuned branches on a subject id', () => {
  const literal = new RegExp(`(['"\`])(${SUBJECT_IDS.join('|')})\\1`);
  const named = /\b(TRUMBULL_SUBJECTS?|PORTRAIT_SUBJECT|V096_SUBJECT_PRESETS)\b/;
  const found = [];
  for (const file of paintingCode()) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (literal.test(line) || named.test(line)) found.push(`${path.relative(ROOT, file)}:${i + 1}`);
    });
  }
  assert.deepEqual(found, []);
});

test('presets apply only when the plan or --recipe names them', () => {
  const plain = expandRecipe({ argv: ['--recipe', 'general', '--valueplan', 'examples/plans/trumbull-values.json', '--presetless'] });
  assert.match(plain.note, /presets architecture, glaze-gains(,|$)/);
  const typed = expandRecipe({ argv: ['--recipe', 'general+architecture'] }).argv;
  for (const flag of presetFlags(['architecture']).filter(a => a.startsWith('--'))) assert.ok(typed.includes(flag), flag);
  assert.throws(() => expandRecipe({ argv: ['--recipe', 'general+nosuch'] }), /unknown preset nosuch/);
});

test('no preset names a subject or turns on a per-subject rule', () => {
  for (const [name, flags] of Object.entries(PRESETS)) {
    assert.ok(!SUBJECT_IDS.some(id => name === id || flags.split(' ').includes(id)), name);
    for (const flag of ['--trumbullrules', '--portraitrules', '--drawsubject']) assert.ok(!flags.includes(flag), `${name} ${flag}`);
  }
});

test('every preset is flag and value pairs', () => {
  for (const [name, flags] of Object.entries(PRESETS)) {
    const t = flags.split(' ');
    assert.equal(t.length % 2, 0, name);
    assert.ok(t.every((a, i) => (i % 2 === 0) === a.startsWith('--')), name);
  }
});
