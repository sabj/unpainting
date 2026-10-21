// --paintguard: a forced box checked against the painter's own pick.
import test from 'node:test';
import assert from 'node:assert/strict';
import { guardForcedBox, guardNote, paintGuardOptions } from './paint-guard.mjs';
import { widePalette } from './palettewide.mjs';
import { paperOf, pickPalette } from './palettepick.mjs';

const P = key => ({ key });
// a toy score: each wanted key missing costs 3, each other paint costs 0.1
const scoreFor = want => paints => want.filter(k => !paints.some(p => p.key === k)).length * 3 + paints.filter(p => !want.includes(p.key)).length * 0.1;

test('a forced box within the threshold is kept', () => {
  const { paints, decision } = guardForcedBox({ forced: [P('a'), P('b')], own: [P('a'), P('c')], score: scoreFor(['a', 'b']), threshold: 2 });
  assert.deepEqual(paints.map(p => p.key), ['a', 'b']);
  assert.equal(decision.action, 'kept');
  assert.match(guardNote(decision), /kept the forced box/);
});

test('add mode adds the own pick\'s missing paints, best first, until the gap closes', () => {
  const forced = [P('sepia'), P('ochre')], own = [P('hansa'), P('cerulean'), P('rose')];
  const { paints, decision } = guardForcedBox({ forced, own, score: scoreFor(['hansa', 'cerulean']), threshold: 1 });
  assert.equal(decision.action, 'added');
  assert.deepEqual(decision.added.sort(), ['cerulean', 'hansa']);
  assert.deepEqual(paints.slice(0, 2).map(p => p.key), ['sepia', 'ochre']);
  assert.ok(decision.finalError - decision.ownError <= 1);
  assert.match(guardNote(decision), /added/);
});

test('add mode merges when the cap stops it: the own pick keeps the forced paints that fit', () => {
  const forced = [P('sepia'), P('ochre')], own = [P('hansa'), P('cerulean')];
  const { paints, decision } = guardForcedBox({ forced, own, score: scoreFor(['hansa', 'cerulean']), threshold: 0.15, max: 3 });
  assert.equal(decision.action, 'merged');
  assert.deepEqual(paints.map(p => p.key), ['hansa', 'cerulean', 'sepia']);
  assert.match(decision.reason, /gap/);
  assert.match(guardNote(decision), /with sepia kept/);
});

test('a bigger box can fit worse: add stops when no paint helps, then merges', () => {
  // every paint past three costs 1, so adding to a four-paint forced box never helps
  const score = ps => (ps.some(p => p.key === 'rose') ? 0 : 5) + Math.max(0, ps.length - 3);
  const forced = [P('a'), P('b'), P('c'), P('d')], own = [P('rose'), P('a')];
  const { decision } = guardForcedBox({ forced, own, score, threshold: 1 });
  assert.equal(decision.action, 'merged');
  assert.deepEqual(decision.paints, ['rose', 'a', 'b', 'c']);
});

test('replace mode takes the own pick', () => {
  const { paints, decision } = guardForcedBox({ forced: [P('sepia')], own: [P('hansa')], score: scoreFor(['hansa']), threshold: 1, mode: 'replace' });
  assert.deepEqual(paints.map(p => p.key), ['hansa']);
  assert.equal(decision.action, 'replaced');
  assert.equal(decision.gap, 3.1);
});

test('bad settings fail loudly', () => {
  assert.throws(() => guardForcedBox({ forced: [P('a')], own: [P('a')], score: () => 0, threshold: 0 }), /threshold/);
  assert.throws(() => guardForcedBox({ forced: [P('a')], own: [P('a')], score: () => 0, threshold: 1, mode: 'swap' }), /mode/);
  const opts = o => [(k, d) => o[k] ?? d, (k, d) => Number(o[k] ?? d)];
  assert.equal(paintGuardOptions(...opts({})), null);
  assert.deepEqual(paintGuardOptions(...opts({ paintguard: '2' })), { threshold: 2, mode: 'add', max: 8 });
  assert.throws(() => paintGuardOptions(...opts({ paintguard: '2', paintguardmode: 'x' })), /add, merge, replace/);
  assert.throws(() => paintGuardOptions(...opts({ paintguard: '-1' })), /0 or more/);
});

const W = 60, H = 48, N = W * H;
// a lemon-green field under a blue sky: a sepia and ochre box cannot reach either colour
function meadow() {
  const px = new Uint8ClampedArray(N * 3).fill(250);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px.set(y < 16 ? [110, 150, 215] : [170, 200, 60], (y * W + x) * 3);
  return px;
}

test('widePalette with a forced sepia box: the guard records its decision and clears the gap', () => {
  const px = meadow(), { paperRGB } = paperOf(px, W, H), lean = pickPalette(px, W, H, paperRGB, { boxpick: false }).palette;
  const plain = widePalette(px, W, H, paperRGB, lean, { keys: ['sepia', 'ochre'] });
  assert.equal(plain.palette.box.guard, undefined);
  const { palette, note } = widePalette(px, W, H, paperRGB, lean, { keys: ['sepia', 'ochre'], guard: { threshold: 1, mode: 'add', max: 8 } });
  const g = palette.box.guard;
  assert.ok(g.gap > 1, note);
  assert.notEqual(g.action, 'kept');
  assert.ok(g.finalError < g.forcedError);
  assert.ok(palette.box.keys.length > 2);
  assert.ok(palette.box.sampleError < plain.palette.box.sampleError);
  assert.match(note, /paint guard/);
});
