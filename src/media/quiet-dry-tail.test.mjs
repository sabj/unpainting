import test from 'node:test';
import assert from 'node:assert/strict';
import { createSheet, DEFAULTS, dry, quietDryTail, thickness, totals } from './sheet.mjs';
import { makePaper } from './paper.mjs';

const pigments = [
  { K: [1, .5, .2], S: [.02, .02, .02], rho: .05, omega: 1, gamma: .2 },
  { K: [.2, .5, 1], S: [.02, .02, .02], rho: .04, omega: 2, gamma: .1 },
];
function pores() {
  const s = createSheet(makePaper(64, 48, { seed: 7 }), pigments);
  for (let i = 0; i < s.n; i++) {
    s.ever[i] = 1;
    s.s[i] = (.1 + .2 * (i % 11) / 10) * s.paper.capacity[i];
    for (let k = 0; k < s.K; k++) {
      s.G[k][i] = .001 * (1 + (i + k) % 3);
      s.P[k][i] = .01 * (1 + (i + k) % 5);
      s.D[k][i] = .002 * (1 + (i + k) % 7);
    }
  }
  s.wetDirty = 1;
  return s;
}

test('a previously wetted pore-only tail dries in place with the iterative pigment distribution and water balance', t => {
  const slow = pores(), fast = pores(), before = totals(fast);
  const surface = fast.G.map(p => p.slice());
  let start = performance.now();
  const slowSteps = dry(slow, 40000, DEFAULTS, { dt: 14 });
  const slowMs = performance.now() - start;
  start = performance.now();
  const fastSteps = dry(fast, 40000, DEFAULTS, { dt: 14, analyticTail: true });
  const fastMs = performance.now() - start;
  const a = thickness(slow), b = thickness(fast);
  assert.deepEqual(fast.G, surface); assert.deepEqual(slow.G, surface);
  let max = 0;
  for (let k = 0; k < fast.K; k++) for (let i = 0; i < fast.n; i++) max = Math.max(max, Math.abs(a[k][i] - b[k][i]));
  assert.ok(slowSteps > 0); assert.equal(fastSteps, 0);
  const peak = Math.max(...b.map(p => p.reduce((m, v) => Math.max(m, v), 0)));
  assert.ok(max < 1e-5 * peak, `local pigment changed by ${max} at peak ${peak}`);
  assert.ok(Math.abs(fast.evaporated - before.water) < 1e-8);
  for (const plane of [fast.W, fast.s, fast.M]) assert.ok(plane.every(v => v === 0));
  const after = totals(fast);
  for (let k = 0; k < fast.K; k++) assert.ok(Math.abs(after.pig[k] - before.pig[k]) < 1e-5);
  t.diagnostic(JSON.stringify({ slowSteps, fastSteps, slowMs, fastMs, maxCellPigmentError: max, waterEvaporated: fast.evaporated }));
});

test('the tail preserves every positive film, wet mask and capillary donor without changing the sheet', () => {
  for (const change of [
    s => { s.W[10] = .003; },
    s => { s.W[10] = 1e-12; },
    s => { s.M[10] = 1; },
    s => { s.s[10] = .8 * s.paper.capacity[10]; },
  ]) {
    const s = pores(); change(s);
    const before = structuredClone({ W: s.W, s: s.s, M: s.M, P: s.P, D: s.D });
    assert.equal(quietDryTail(s), false);
    assert.deepEqual({ W: s.W, s: s.s, M: s.M, P: s.P, D: s.D }, before);
    assert.equal(s.evaporated ?? 0, 0);
  }
  const sealed = pores();
  assert.equal(quietDryTail(sealed, { ...DEFAULTS, paperDry: 0 }), false);
  assert.ok(sealed.s.some(v => v > 0));
});
