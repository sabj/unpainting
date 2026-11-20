import test from 'node:test';
import assert from 'node:assert/strict';
import { inkMoved, INK_MOVED_MOST } from './ink-held.mjs';

const line = () => { const a = new Float32Array(100); for (let x = 2; x < 8; x++) a[50 + x] = 1; return a; };

test('ink that stays where it was laid reads as held, whichever layer holds it', () => {
  const r = inkMoved(line(), line());
  assert.equal(r.moved, 0); assert.equal(r.lost, 0);
  assert.ok(r.moved <= INK_MOVED_MOST);
});

test('a bleed (ink carried sideways, none lost) reads as moved', () => {
  const after = line();
  for (let x = 2; x < 8; x++) { after[50 + x] -= 0.3; after[60 + x] += 0.3; }
  const r = inkMoved(line(), after);
  assert.ok(Math.abs(r.moved - 0.3) < 1e-6); assert.ok(r.lost < 1e-6);
  assert.ok(r.moved > INK_MOVED_MOST);
});

test('ink lifted off the sheet reads as moved and lost', () => {
  const after = line(); after[52] = 0;
  const r = inkMoved(line(), after);
  assert.ok(Math.abs(r.moved - 1 / 6) < 1e-6); assert.ok(Math.abs(r.lost - 1 / 6) < 1e-6);
});

test('a reading with no ink is refused', () => { assert.throws(() => inkMoved(new Float32Array(4), new Float32Array(4)), /no ink/); });
