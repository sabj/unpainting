import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseInkRecipe, penShare, DRAWING_FLAGS } from './ink-recipe-auto.mjs';

test('auto picks wash from the pen-line share and the --penfirst threshold', () => {
  assert.equal(chooseInkRecipe('auto', [], () => 0.01).recipe, 'wash');
  assert.equal(chooseInkRecipe('auto', [], () => 0.005).recipe, 'wash');
  assert.equal(chooseInkRecipe('auto', [], () => 0.002).recipe, 'none');
  assert.equal(chooseInkRecipe('auto', [], () => 0.01, 2).recipe, 'none');
});

test('auto leaves a run that sets its own drawing alone and does not measure the picture', () => {
  for (const f of DRAWING_FLAGS) {
    const r = chooseInkRecipe('auto', ['--seed', '0', f, 'x'], () => { throw new Error('measured'); });
    assert.equal(r.recipe, 'none');
    assert.match(r.why, new RegExp(f));
  }
});

test('a named recipe is returned unchanged', () => {
  for (const n of ['wash', 'v2', 'none']) assert.deepEqual(chooseInkRecipe(n, ['--drawing', 'both'], () => 0), { recipe: n, why: null });
});

test('a white sheet with a few dark pen strokes reads as some pen line, blank paper as none', () => {
  const w = 120, h = 90, px = new Uint8Array(w * h * 3).fill(250);
  assert.equal(penShare(px, w, h), 0);
  for (let x = 10; x < 110; x++) for (const y of [20, 45, 70]) for (let dy = 0; dy < 2; dy++) { const i = ((y + dy) * w + x) * 3; px[i] = px[i + 1] = px[i + 2] = 40; }
  assert.ok(penShare(px, w, h) > 0);
});
