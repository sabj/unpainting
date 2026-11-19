// The point's load: the line's paint over its ground, only where it is dense enough to hold a continuous line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineLoad } from './thin-darks-lay.mjs';

const palette = [{ K: [1.6, 1.5, 1.2] }, { K: [0.4, 0.8, 2.2] }];
const swatch = { depositPerLoad: 0.1, stableLoad: 6 };   // the lightest line that holds is 6 x 0.1 x 1.07 = 0.64 OD

test('a strongly dark line over a light ground takes the paints that make its colour, at the load that holds', () => {
  const l = lineLoad([1.8, 1.8, 1.7], [0.2, 0.2, 0.2], [2.5, 2.5, 2.5], palette, 3, swatch);
  assert.ok(l.conc && l.conc[0] > 0 && l.conc[2] === 0, JSON.stringify(l.conc));
  const added = l.mix.reduce((s, m) => s + m.amount * palette[m.pigment].K[0], 0);
  assert.ok(added > 1.0, `the paint adds ${added} OD`);
});

test('a line too faint to hold, or no darker than its ground, is not laid; and a line is never darker than the cap', () => {
  assert.equal(lineLoad([0.5, 0.5, 0.5], [0.2, 0.2, 0.2], [2.5, 2.5, 2.5], palette, 3, swatch).conc, null, 'a faint line would break');
  assert.equal(lineLoad([0.3, 0.3, 0.3], [0.6, 0.6, 0.6], [2.5, 2.5, 2.5], palette, 3, swatch).conc, null);
  const capped = lineLoad([4, 4, 4], [0.2, 0.2, 0.2], [1.2, 1.2, 1.2], palette, 3, swatch), free = lineLoad([4, 4, 4], [0.2, 0.2, 0.2], [4, 4, 4], palette, 3, swatch);
  assert.ok(capped.need[0] <= 1.0 + 1e-9 && free.need[0] > 3, 'the cap holds the need to the darkest wash less the ground');
});
