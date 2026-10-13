import test from 'node:test';
import assert from 'node:assert/strict';
import { GpuLink } from './link.mjs';

const bits = a => new Uint32Array(a.buffer, a.byteOffset, a.length);
function fixture(budget = 48) {
  const n = 4, K = 2, zero = new Float32Array(n);
  const sheet = { n, pigments: [{}, {}], _zeroLayer: zero, layers: [] };
  const link = Object.assign(Object.create(GpuLink.prototype), {
    n, K, sheet, archiveBudgetBytes: budget, pendingLayers: [], stats: { drys: 0, dryMs: 0 },
    queuedDrys: 0, drainingDrys: false, ctrl: new Int32Array(16), rectData: new Float32Array(24),
    needFullUp: false, resident: false, topMask: 1, fresh: { stale() {} },
    notPlanning() {}, applyOptions() {}, syncAct() {},
  });
  const archives = new Map(), reads = [];
  link.call = message => {
    assert.equal(message.op, 'lowerBatch');
    reads.push(message.ids.slice());
    const out = new Uint32Array(message.output); let at = 0;
    for (const id of message.ids) {
      for (const plane of archives.get(id)) { out.set(bits(plane), at); at += n; }
      archives.delete(id);
    }
  };
  const add = (id, mask, values) => {
    const planes = values.map(a => Float32Array.from(a));
    archives.set(id, planes);
    const index = sheet.layers.length;
    sheet.layers.push(link.layerPlanes(sheet, mask));
    link.pendingLayers.push({ index, mask, id });
    return planes;
  };
  return { link, sheet, archives, reads, add };
}

test('dense deferred archives drain repeatedly without changing layer values or order', () => {
  const f = fixture(), expected = [];
  for (let id = 1; id <= 100; id++) {
    expected.push(f.add(id, 1, [[id, -0, id / 7, id + .125]])[0]);
    f.link.boundDeferredLayers(f.sheet);
    assert.ok(f.archives.size <= 2);
  }
  const top = [Float32Array.of(9, 8, 7, 6), f.sheet._zeroLayer];
  f.sheet.layers.push(top);
  f.link.syncLower(f.sheet);
  for (let i = 0; i < expected.length; i++) {
    assert.deepEqual(bits(f.sheet.layers[i][0]), bits(expected[i]));
    assert.equal(f.sheet.layers[i][1], f.sheet._zeroLayer);
  }
  assert.equal(f.sheet.layers.at(-1), top);
  assert.deepEqual(Array.from(top[0]), [9, 8, 7, 6]);
  assert.equal(f.archives.size, 0);
  assert.equal(f.link.stats.maxDeferredArchiveBytes, 48);
  assert.equal(f.link.stats.deferredArchiveDrains, 33);
});

test('budget counts only archived pigment planes and leaves small archives deferred', () => {
  const f = fixture(64);
  f.add(1, 2, [[1, 2, 3, 4]]);
  f.link.boundDeferredLayers(f.sheet);
  assert.equal(f.reads.length, 0);
  assert.equal(f.link.stats.maxDeferredArchiveBytes, 16);
  f.add(2, 3, [[5, 6, 7, 8], [9, 10, 11, 12]]);
  f.link.boundDeferredLayers(f.sheet);
  assert.equal(f.reads.length, 0);
  assert.equal(f.link.stats.maxDeferredArchiveBytes, 48);
  f.add(3, 1, [[13, 14, 15, 16]]);
  f.link.boundDeferredLayers(f.sheet);
  assert.deepEqual(f.reads, [[1, 2, 3]]);
  assert.equal(f.link.pendingLayers.length, 0);
});

test('queued drying bounds archives after metadata while preserving the current top', () => {
  const f = fixture(24), originalCall = f.link.call;
  f.sheet.layers.push(f.link.layerPlanes(f.sheet, 1));
  f.archives.set(10, [Float32Array.of(1, 2, 3, 4)]);
  f.archives.set(11, [Float32Array.of(5, 6, 7, 8)]);
  f.link.queuedDrys = 2;
  f.link.call = message => {
    if (message.op !== 'drainDrys') return originalCall(message);
    f.link.ctrl[1] = 2;
    new Uint32Array(f.link.rectData.buffer).set([7, 1, 1, 2, 10, 1, 8, 1, 1, 1, 11, 2]);
  };
  f.link.flushDrys(f.sheet);
  assert.deepEqual(Array.from(f.sheet.layers[0][0]), [1, 2, 3, 4]);
  assert.deepEqual(Array.from(f.sheet.layers[1][1]), [5, 6, 7, 8]);
  assert.deepEqual(Array.from(f.sheet.layers[2][0]), [0, 0, 0, 0]);
  assert.equal(f.sheet.layers[2][1], f.sheet._zeroLayer);
  assert.deepEqual(f.reads, [[10, 11]]);
  assert.equal(f.link.stats.drySolverCalls, 2);
  assert.equal(f.link.stats.drySolverIterations, 15);
  assert.equal(f.link.drainingDrys, false);
});

test('synchronous drying also releases superseded archives at the budget', () => {
  const f = fixture(16), originalCall = f.link.call;
  f.sheet.layers.push(f.link.layerPlanes(f.sheet, 1));
  f.archives.set(12, [Float32Array.of(1, -0, 3, 4)]);
  f.link.call = message => {
    if (message.op !== 'dry') return originalCall(message);
    Object.assign(f.link.ctrl, { 1: 9, 4: 1, 5: 1, 7: 2, 9: 12 });
  };
  const steps = f.link.dry(f.sheet, 20000, {}, {});
  assert.equal(steps, 9);
  assert.deepEqual(bits(f.sheet.layers[0][0]), bits(Float32Array.of(1, -0, 3, 4)));
  assert.equal(f.sheet.layers[1][0], f.sheet._zeroLayer);
  assert.deepEqual(Array.from(f.sheet.layers[1][1]), [0, 0, 0, 0]);
  assert.deepEqual(f.reads, [[12]]);
  assert.equal(f.link.pendingLayers.length, 0);
});
