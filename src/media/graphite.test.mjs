import test from 'node:test';
import assert from 'node:assert/strict';
import { toothTake } from './graphite.mjs';

test('the tooth breaks a light pencil line more than a firm one, and crests take more than hollows', () => {
  const n = 1000, proud = Float32Array.from({ length: n }, (_, i) => i / n - 0.5), paper = { proud };
  const share = v => { let s = 0; for (let i = 0; i < n; i++) s += toothTake(paper, i, v, 0.6); return s / n; };
  assert.ok(share(0.3) < share(0.9), 'lighter takes less');
  assert.ok(toothTake(paper, 950, 0.5, 0.6) > toothTake(paper, 50, 0.5, 0.6), 'crest over hollow');
  assert.equal(toothTake(paper, 10, 0.5, 0), 1);
  assert.equal(toothTake({}, 10, 0.5, 0.6), 1);
});
