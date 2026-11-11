// Scrap test: passes named in one wet session (pass.session) are laid back to back with no drying between, as the
// painter does (tools/plate/paint.mjs asks semanticSameSession before each dry). Two neighbouring squares in two
// colours: in one session the second wash meets the first while it is wet and the colours run into each other across
// the boundary (a lost edge); dried between, the first is set and the boundary stays a hard line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, thickness, DEFAULTS } from '../../src/media/sheet.mjs';
import { BOX, boxPigment } from '../../src/crop/box.mjs';
import { layPassage, dryFully, TECHNIQUES } from '../../src/paint/methods/lay.mjs';
import { semanticSessions, semanticSameSession, semanticTechnique } from './semantic-areas.mjs';

const O = { ...DEFAULTS, edgeEvap: 0.0012, gran: 0.25 };
const pigs = ['sienna', 'ultramarine'].map(k => boxPigment(BOX.find(p => p.key === k)));
const W = 72, H = 48, N = W * H;
const square = (x0, x1) => { const m = new Uint8Array(N); for (let y = 8; y < 40; y++) for (let x = x0; x < x1; x++) m[y * W + x] = 1; return m; };
const left = square(6, 36), right = square(36, 66);
const pass = (key, session) => ({ key, pass: { move: 'wet on dry', load: { water: TECHNIQUES['wet on dry'].water }, ...(session ? { session: { id: session, reason: 'meet wet' } } : {}) } });

// the brush reaches the boundary (pad 0), so the two washes meet. The painter's schedule: lay each pass, and dry before the next unless both are in one wet session
function paint(schedule) {
  const sheet = createSheet(makePaper(W, H, { seed: 5, scale: 1, toothScale: 0.2 }), pigs);
  schedule.forEach((s, k) => {
    if (k && !semanticSameSession(schedule[k - 1], s)) dryFully(sheet, O);
    layPassage(sheet, k ? right : left, k ? [0, 1] : [1, 0], { w: W, h: H, T: semanticTechnique(s, {}), maxRadius: 6, seed: 3 + k, O, settle: 0, pad: 0 });
  });
  dryFully(sheet, O);
  // blue that ran into the sienna square, in a strip three cells deep along the boundary
  const blue = thickness(sheet)[1]; let s = 0, c = 0;
  for (let y = 12; y < 36; y++) for (let x = 33; x < 36; x++) { s += blue[y * W + x]; c++; }
  return s / c;
}

test('one wet session: the second wash runs into the first across the boundary; dried between, it does not', () => {
  const joined = paint([pass('a/wash', 'cat'), pass('b/wash', 'cat')]), dried = paint([pass('a/wash'), pass('b/wash')]);
  assert.ok(joined > 2 * dried && joined > 0.01, `blue in the sienna edge strip: session ${joined.toFixed(4)}, dried between ${dried.toFixed(4)}`);
});

test('a session is two or more passes, consecutive, wet on wet or wet on dry, not authored', () => {
  const s = (key, move, id, extra = {}) => ({ key, pass: { move, ...(id ? { session: { id, reason: 'one wet go' } } : {}), ...extra } });
  assert.deepEqual([...semanticSessions([s('a/1', 'wet on dry', 'x'), s('b/1', 'wet on wet', 'x'), s('c/1', 'wet on dry')])], [['x', ['a/1', 'b/1']]]);
  assert.throws(() => semanticSessions([s('a/1', 'wet on dry', 'x'), s('b/1', 'wet on dry')]), /at least two/);
  assert.throws(() => semanticSessions([s('a/1', 'wet on dry', 'x'), s('c/1', 'wet on dry'), s('b/1', 'wet on dry', 'x')]), /consecutive/);
  assert.throws(() => semanticSessions([s('a/1', 'dry brush', 'x'), s('b/1', 'wet on dry', 'x')]), /dry paper/);
  assert.throws(() => semanticSessions([s('a/1', 'wet on dry', 'x', { source: 'authored' }), s('b/1', 'wet on dry', 'x')]), /authored/);
  assert.throws(() => semanticSessions([{ key: 'a/1', pass: { move: 'wet on dry', session: { id: 'x' } } }, s('b/1', 'wet on dry', 'x')]), /reason/);
  assert.equal(semanticSameSession(s('a/1', 'wet on dry', 'x'), s('b/1', 'wet on dry', 'x')), true);
  assert.equal(semanticSameSession(s('a/1', 'wet on dry', 'x'), s('b/1', 'wet on dry', 'y')), false);
  assert.equal(semanticSameSession(s('a/1', 'wet on dry'), s('a/1', 'wet on dry')), false);
  assert.equal(semanticSameSession(undefined, s('a/1', 'wet on dry', 'x')), false);
});
