// Shared main-thread WebGPU device for auxiliary GPU stages (palette, paper, finish).
// Dual-purpose: returns null when GPU is disabled or unavailable in 'auto' mode; throws loudly in 'on' mode.
// Keeps Dawn handles reachable so GC never frees them under a running device.
export { dispatch1D } from './dispatch-1d.mjs';

const KEEP = [];
let cached = null;
let pending = null;

/** Open a WebGPU device from a GPU implementation (Node `webgpu` or browser `navigator.gpu`). */
async function openAuxGpu(gpu) {
  if (!gpu) throw new Error('no WebGPU implementation');
  KEEP.push(gpu);
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error('no WebGPU adapter');
  KEEP.push(adapter);
  const L = adapter.limits;
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBuffersPerShaderStage: Math.min(12, L.maxStorageBuffersPerShaderStage),
      maxStorageBufferBindingSize: L.maxStorageBufferBindingSize,
      maxBufferSize: L.maxBufferSize,
      maxComputeWorkgroupStorageSize: Math.min(32768, L.maxComputeWorkgroupStorageSize),
    },
  });
  KEEP.push(device);
  return { adapter, device };
}

/**
 * Acquire (and cache) the shared main-thread auxiliary WebGPU device.
 * @param {'auto'|'on'|'off'} [mode='auto']
 * @returns {Promise<{device: GPUDevice, adapter: GPUAdapter}|null>}
 */
export async function getAuxGpuDevice(mode = 'auto') {
  if (mode === 'off') return null;
  if (cached) return cached;
  if (pending) return pending;
  pending = (async () => {
    try {
      let gpu = typeof navigator !== 'undefined' ? navigator.gpu : null;
      if (!gpu) {
        const webgpu = await import('webgpu');
        if (webgpu.globals) Object.assign(globalThis, webgpu.globals);
        const flags = typeof process !== 'undefined' && process.env.DAWN_FLAGS ? process.env.DAWN_FLAGS.split(' ') : [];
        gpu = webgpu.create(flags);
      }
      cached = await openAuxGpu(gpu);
      return cached;
    } catch (err) {
      if (mode === 'on') throw new Error(`--gpu on but auxiliary GPU device is unavailable: ${err.message}`);
      return null;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** Destroy the cached auxiliary WebGPU device (for clean shutdown and tests). */
export function destroyAuxGpuDevice() {
  if (!cached) return;
  try { cached.device.destroy(); } catch {}
  cached = null;
}
