import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTargetGuard, TargetGuardError } from './no-target.mjs';
import { sealTargetMaps, sealAtBirth, TARGET_MAPS, TARGET_MAP_HOLDERS } from './seal-maps.mjs';
import { lint, lintSource } from './lint-target-use.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('every target map on ctx and in its holders is closed for the paint step, in gentle and hard', () => {
  for (const mode of ['gentle', 'hard']) {
    const g = createTargetGuard({ mode });
    const ctx = { SEP: { ink: new Float32Array(4), wash: new Float32Array(4), stats: { ink: 2 } }, MOD: null, FINE: { D: new Float32Array(4) }, plain: new Float32Array(4) };
    for (const k of Object.keys(TARGET_MAPS)) ctx[k] = new Float32Array(4).fill(1);
    const sealed = sealTargetMaps(g, ctx);
    assert.deepEqual(new Set(sealed), new Set([...Object.keys(TARGET_MAPS), 'SEP.ink', 'SEP.wash', 'FINE.D']));
    assert.equal(ctx.HP[0], 1, 'planning still reads a sealed map');
    g.beginPaint();
    for (const k of [...Object.keys(TARGET_MAPS)]) assert.throws(() => ctx[k][0], TargetGuardError, k);
    assert.throws(() => ctx.SEP.ink[1], TargetGuardError);
    assert.throws(() => ctx.FINE.D[0], TargetGuardError);
    assert.equal(ctx.plain[0], 0, 'a map not made from the target stays open');
    assert.equal(ctx.SEP.stats.ink, 2, 'counts made at planning stay readable');
    assert.doesNotThrow(() => g.assertCleanContext('paint step', ctx));
    g.endPaint();
  }
});

test('a map sealed where it is made is closed in the closures that keep it', () => {
  const g = createTargetGuard();
  const edge = sealAtBirth(g, 'TARGET_DRAW_EDGE', Float32Array.of(0.1, 0.9));
  const cut = i => edge[i] < 0.22;       // a pen executor's per-point cut, as sheet.mjs had it
  assert.equal(cut(0), true);
  g.beginPaint();
  assert.throws(() => cut(1), TargetGuardError);
  g.endPaint();
  assert.throws(() => sealAtBirth(g, 'NOT_A_MAP', new Float32Array(1)), /not a listed target map/);
  assert.equal(sealAtBirth(createTargetGuard({ mode: 'off' }), 'HP', Float32Array.of(1))[0], 1);
});

test('a raw target map still handed on through ctx at beginPaint is refused', () => {
  const g = createTargetGuard();
  const raw = g.register('px', new Uint8Array(9));
  g.beginPaint();
  assert.throws(() => g.assertCleanContext('paint step', { PX_COPY: raw }), TargetGuardError);
  g.endPaint();
});

test('the painter seals the maps where the paint step begins and where closures keep them', () => {
  const src = f => fs.readFileSync(path.join(ROOT, 'tools', 'plate', f), 'utf8');
  assert.match(src('drawing.mjs'), /TARGET_GUARD\.beginPaint\(\);[^\n]*sealTargetMaps\(TARGET_GUARD, ctx\);[^\n]*assertCleanContext\('paint step', ctx\)/);
  assert.match(src('sheet.mjs'), /const TARGET_DRAW_EDGE=sealAtBirth\(ctx\.TARGET_GUARD,'TARGET_DRAW_EDGE',/);
  assert.match(src('plan.mjs'), /const PREP_ERASE = [^\n]*eraserDabs\(/, 'the pencil eraser is planned as dabs');
  assert.match(src('drawing.mjs'), /const SKY_WARM_RB = [^\n]*sealAtBirth\(TARGET_GUARD, 'SKY_WARM_RB'/);
  for (const k of Object.keys(TARGET_MAP_HOLDERS)) assert.ok(/^[A-Z]+$/.test(k));
});

test('lint: the paint step is read where it now lives, drawing.mjs from beginPaint through finish.mjs', () => {
  const read = ['const L = px[0];', 'TARGET_GUARD.beginPaint();', 'const b = HP[i];', 'erase({ weights: D_AIM });'].join('\n');
  assert.deepEqual(lintSource('tools/plate/drawing.mjs', read).map(f => f.line), [3, 4]);
  assert.equal(lintSource('tools/plate/paint.mjs', 'const v = SKY_WARM_RB[i] > t;').length, 1);
  assert.equal(lintSource('tools/plate/finish.mjs', "const a = D_AIM[i];\nphaseMark('painting');\nconst b = D_AIM[i];").length, 1);
  assert.equal(lintSource('tools/plate/plan.mjs', 'const b = HP[i];').length, 0, 'planning may read');
  assert.equal(lintSource('tools/plate/paint.mjs', 'const { HP, maskBox, D_AIM } = ctx;').length, 0, 'a destructure hands nothing on');
});

test('lint: the painter\'s paint step has no target read that is not acknowledged', () => {
  const allow = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/guard/target-use-allow.json'), 'utf8')).allow;
  const cwd = process.cwd(); process.chdir(ROOT);
  try {
    const { findings, allowed } = lint({ roots: ['tools', 'src'], allow });
    assert.deepEqual(findings.map(f => `${f.file}:${f.line} ${f.rule}`), []);
    assert.ok(allowed.some(f => f.cat === 'd'), 'the paint-step check runs on the real tree');
  } finally { process.chdir(cwd); }
});
