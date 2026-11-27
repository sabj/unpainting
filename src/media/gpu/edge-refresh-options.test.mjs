import test from 'node:test';
import assert from 'node:assert/strict';
import { GpuSheet } from './stepfull.mjs';
import { DEFAULTS } from '../sheet.mjs';

// Run the production option writer; only the device's uniform upload is a stub.
function host() {
  const g = Object.assign(new GpuSheet(), {
    o: { ...DEFAULTS }, paper: { mmPerCell: .25, hollowUnit: 1 }, mmPerCell: .25,
    w: 16, h: 16, n: 256, K: 0, act: [], b: { U: {} }, ef: { stale: true },
    flushStrokes() {}, device: { queue: { writeBuffer() {} } },
  });
  g.setOptions({}); g.ef.stale = false;
  return g;
}

test('solver budgets, pigment lists and unchanged options keep the edge geometry valid', () => {
  const g = host();
  for (const o of [{}, { level: .6 }, { settle: .5 }, { dt: .2 }, { capRate: .06 }]) {
    g.setOptions(o);
    assert.equal(g.ef.stale, false, JSON.stringify(o));
  }
  g.ef.stale = true; g.setOptions({});
  assert.equal(g.ef.stale, true, 'a pending footprint change stays pending');
});

test('pressure settings and changes to the pore halo invalidate the edge geometry', () => {
  for (const o of [
    { edgeMm: 2 }, { edgeEvap: .002 }, { reachMm: 2 }, { holeSpan: 2 },
    { mmPerCell: .2 }, { dt: 2, capRate: 2 },
  ]) {
    const g = host(); g.setOptions(o);
    assert.equal(g.ef.stale, true, JSON.stringify(o));
  }
  const g = host(); g.setOptions({ mmPerCell: .25 });
  assert.equal(g.ef.stale, false, 'explicit and paper cell width describe the same geometry');
});
