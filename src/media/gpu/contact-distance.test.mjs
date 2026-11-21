import test from 'node:test';
import assert from 'node:assert/strict';
import { contactDistance, cellEdgeFlux } from '../contact-distance.mjs';
import { GpuContactDistance, contactGrid } from './contact-distance.mjs';
import { openGpu } from './stepfull.mjs';

const w = 185, h = 161, mm = 0.28, E = 1.2;
const normalLimits = { maxBufferSize: 1 << 27, maxStorageBufferBindingSize: 1 << 27, maxComputeWorkgroupsPerDimension: 65535 };

test('small marks, wide edge bands and boxes above device limits use the CPU geometry', () => {
  assert.equal(contactGrid([0,0,10,10], mm, E, normalLimits), null);
  assert.equal(contactGrid([0,0,180,150], 0.001, E, normalLimits), null);
  assert.equal(contactGrid([0,0,180,150], mm, E, { ...normalLimits, maxStorageBufferBindingSize: 1024 }), null);
  assert.equal(contactGrid([0,0,180,150], mm, E, { ...normalLimits, maxComputeWorkgroupsPerDimension: 1 }), null);
});

test('WebGPU half-cell distances give exactly the CPU evaporation at corners, holes and cropped sheet edges', async t => {
  const impl = await import('webgpu');
  Object.assign(globalThis, impl.globals);
  let device;
  try { ({ device } = await openGpu(impl.create([]))); }
  catch (error) {
    if (error.message !== 'no WebGPU adapter') throw error;
    t.skip(error.message); return;
  }
  const runner = new GpuContactDistance(device);
  const packed = new Uint32Array(Math.ceil(w * h / 8));
  const gpuMask = device.createBuffer({ size: packed.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  try {
    for (const { box, span, empty } of [
      { box: [0, 0, w-1, h-1], span: 0 },
      { box: [11, 6, 170, 147], span: 3 },
      { box: [7, 3, 181, 148], span: 0, empty: true },
    ]) {
      const mask = new Uint8Array(w * h), whole = new Uint8Array(w * h);
      const [left, top, right, bottom] = box;
      packed.fill(0);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const wet = !empty && (x + 0.65*y < 83 || x > 71 && y > 39) &&
          !(x >= 32 && x < 34 && y >= 25 && y < 27) && (x !== 60 || y % 11 < 3);
        if (!wet) continue;
        whole[i] = 1;
        if (x >= left && x <= right && y >= top && y <= bottom) mask[i] = 1;
        packed[i >>> 3] |= (i % 3 ? 2 : 5) << (4 * (i % 8));
      }
      const inside = (x, y) => x >= 0 && x < w && y >= 0 && y < h;
      const pinned = (x, y) => inside(x, y) && !mask[y*w+x] &&
        ![[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dy]) => {
          for (let k=1; k<=span; k++) {
            const xx=x+k*dx, yy=y+k*dy;
            if (inside(xx, yy) && whole[yy*w+xx]) return true;
          }
          return false;
        });
      device.queue.writeBuffer(gpuMask, 0, packed);
      const grid = contactGrid(box, mm, E, device.limits);
      const actual = await runner.field(gpuMask, w, h, grid, span);
      const expected = contactDistance(mask, w, h, pinned, box);
      assert.equal(actual.width, expected.width);
      for (let i = 0; i < expected.distance.length; i++) {
        assert.equal(actual.distance[i], Math.min(grid.radius / 2, expected.distance[i]), 'half-cell ' + i);
      }
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
        assert.equal(cellEdgeFlux(actual, x, y, mm, E), cellEdgeFlux(expected, x, y, mm, E));
      }
    }
  } finally { gpuMask.destroy(); runner.destroy(); device.destroy(); }
});
