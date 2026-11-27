import test from 'node:test';
import assert from 'node:assert/strict';
import { waitBesideDamp, BESIDE_DAMP } from './beside-damp.mjs';

test('beside damp: waits while the neighbour is glossy, then lays; never asks its own dry cells to be a wet bed', () => {
  let water = 0.6; const steps = [];
  const r = waitBesideDamp({ observe: () => ({ waterP50: water, moistShare: 0 }), step: o => { steps.push(o); water *= 0.97; }, O: { dt: 1 } });
  assert.ok(r.paper.waterP50 <= BESIDE_DAMP.glossy && r.waits > 0 && steps.length === r.waits);
});

test('beside damp: a neighbour already past its shine, or dry paper, is laid against at once', () => {
  const r = waitBesideDamp({ observe: () => ({ waterP50: 0, moistShare: 0 }), step: () => { throw new Error('no step'); }, O: {} });
  assert.equal(r.waits, 0);
  assert.throws(() => waitBesideDamp({ observe: () => ({ moistShare: 0 }), step: () => {}, O: {} }), /waterP50/);
});

test('beside damp: measured ramp saves steps while keeping the original admission-time resolution', () => {
  const run = ramp => {
    let water = .6, elapsed = 0, calls = 0; const dts = [];
    const observe = () => ({ waterP50: water });
    const step = o => { elapsed += o.dt; water -= .001 * o.dt; calls++; dts.push(o.dt); };
    if (ramp) {
      const result = waitBesideDamp({ observe, step, O: { dt: .1 } });
      assert.ok(Math.abs(result.elapsed - elapsed) < 1e-9);
    } else while (water > BESIDE_DAMP.glossy) for (let i = 0; i < 10; i++) step({ dt: .1 });
    return { water, elapsed, calls, dts };
  };
  const slow = run(false), fast = run(true);
  assert.ok(fast.calls < slow.calls / 8, `${fast.calls} against ${slow.calls}`);
  assert.ok(Math.abs(fast.elapsed - slow.elapsed) <= 1.01, 'one original observation batch');
  assert.ok(fast.water <= BESIDE_DAMP.glossy && fast.water > BESIDE_DAMP.glossy - .0011);
  assert.ok(Math.max(...fast.dts) <= 2);
  assert.equal(fast.dts.at(-1), .1, 'approach returns to the original clock');
});

test('beside damp: changing or rising water is remeasured, and invalid observations fail', () => {
  let water = .6, calls = 0;
  const r = waitBesideDamp({ observe: () => ({ waterP50: water }), step: o => { water += (++calls < 30 ? .01 : -.02) * o.dt; }, O: { dt: .1 } });
  assert.ok(r.paper.waterP50 <= BESIDE_DAMP.glossy);
  assert.throws(() => waitBesideDamp({ observe: () => ({ waterP50: NaN }), step() {}, O: { dt: .1 } }), /waterP50/);
  assert.throws(() => waitBesideDamp({ observe: () => ({ waterP50: .6 }), step() {}, O: { dt: 0 } }), /dt/);
});
