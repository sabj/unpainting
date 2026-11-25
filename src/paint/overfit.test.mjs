// No subject-fitted settings (docs/techniques.md, Tuned settings): the painter has no presets, no fitted-settings recipe,
// no folder of fitted values and no module of constants fitted to one benchmark subject, and painting code never
// branches on a benchmark subject id. The architecture preset, the V096 recipe, src/paint/tuned/ and the Trumbull,
// dog-coat, olive-tree, mass-plan and registered-anatomy modules were removed in 0.3.3. tools/guard/subject-scan.mjs (src/paint/overfit-scan.test.mjs) covers subject names.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandRecipe } from './recipe.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Subject ids of the benchmark images.
const SUBJECT_IDS = ['Cape', 'G1', 'G2', 'G3', 'G4', 'Jones', 'SF', 'Y1', 'Y2', 'Y3', 'subject-a', 'subject-b', 'subject-c', 'subject-d', 'subject-e'];
// Painting code: everything in src/ but tests, and the painter command.
function paintingCode() {
  const files = [path.join(ROOT, 'tools/paint-plate.mjs')];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (/\.(mjs|json)$/.test(e.name) && !e.name.endsWith('.test.mjs')) files.push(p);
    }
  };
  for (const dir of ['src', 'tools/plate', 'tools/speed', 'bench/scripts']) walk(path.join(ROOT, dir));
  return files;
}

test('no painting code branches on a subject id', () => {
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

// A folder or file named for fitted settings is where fitted values hide under neutral names (Sam, 0.3.3).
const FITTED_NAME = /tuned|fitted|per-?subject|subject-?specific/i;

test('no folder or file under src/, tools/ or bench/scripts is named tuned, fitted or per-subject', () => {
  const found = [];
  const walk = rel => {
    for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(rel, e.name);
      if (FITTED_NAME.test(e.name)) found.push(p);
      if (e.isDirectory()) walk(p);
    }
  };
  for (const dir of ['src', 'tools', 'bench/scripts']) walk(dir);
  assert.deepEqual(found, []);
  assert.ok(FITTED_NAME.test('src/paint/tuned') && FITTED_NAME.test('per-subject.mjs') && FITTED_NAME.test('fitted-values.json'));
  assert.ok(!FITTED_NAME.test('shape-refit.mjs') && !FITTED_NAME.test('fit-mix.mjs'));
});

test('the fitted modules are gone', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'src/paint/tuned')), 'src/paint/tuned');
  for (const f of ['src/paint/techniques/dog-paint.mjs', 'src/paint/techniques/passages/dog.mjs', 'src/paint/techniques/passages/sand.mjs',
    'src/paint/techniques/passages/treelayers.mjs', 'src/paint/methods/mass-wash.mjs', 'tools/seg/select-drawing.py'])
    assert.ok(!fs.existsSync(path.join(ROOT, f)), f);
});

test('presets and the v096 recipe fail the run instead of painting without them', () => {
  assert.throws(() => expandRecipe({ argv: ['--recipe', 'general+architecture'] }), /presets were removed/);
  assert.throws(() => expandRecipe({ argv: ['--recipe', 'v096'] }), /unknown recipe|recipe/);
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? '/tmp'), 'overfit-')), plan = path.join(dir, 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({ presets: ['architecture'] }));
  assert.throws(() => expandRecipe({ argv: ['--recipe', 'general', '--valueplan', plan] }), /presets were removed/);
  fs.rmSync(dir, { recursive: true });
});

