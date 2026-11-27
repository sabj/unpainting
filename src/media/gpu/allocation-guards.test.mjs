import test from 'node:test';
import assert from 'node:assert/strict';
import { GpuOpticalComposite } from './optical-gpu.mjs';
import { makePaperGpu } from './paper-gpu.mjs';
import { makePaper } from '../paper.mjs';

function device(limit, other = 'maxStorageBufferBindingSize') {
  return { limits: { maxStorageBufferBindingSize: 1e9, maxBufferSize: 1e9, [other]: limit },
    createBuffer() { assert.fail('must reject before any GPU buffer allocation'); },
    pushErrorScope() { assert.fail('must reject before pipeline creation'); } };
}
for (const limit of ['maxStorageBufferBindingSize', 'maxBufferSize']) {
  test(`optical checks matrices and pigment bindings against ${limit} upfront`, async () => {
    await assert.rejects(GpuOpticalComposite.create(device(100, limit), 2, []), /exceeds device limits/);
    await assert.rejects(GpuOpticalComposite.create(device(200, limit), 1, Array(4).fill({})), /exceeds device limits/);
  });
  test(`oversized paper falls back identically before GPU allocation (${limit})`, async () => {
    const options = { seed: 7 };
    assert.deepEqual(await makePaperGpu(device(128, limit), 16, 12, options), makePaper(16, 12, options));
  });
}
test('paper also checks knot-grid bindings larger than full-size planes', async () => {
  const options = { seed: 2, toothScale: .05 };
  assert.deepEqual(await makePaperGpu(device(4096), 8, 8, options), makePaper(8, 8, options));
});
