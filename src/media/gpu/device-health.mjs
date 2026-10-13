// GPU device health. Dawn reports a device error (out of memory, validation, internal) as an uncaptured error and
// carries on: with no listener it prints "out of memory:" or "validation:" and the message, the buffer it could not
// make is invalid, every command buffer that touches that buffer is dropped at submit ("Invalid CommandBuffer"), and
// later read-backs return stale or zero data without failing. A painting read back from such a device is wrong. So the
// first device error, or an unexpected device loss, marks the device broken for good, and the painter stops the run
// with an error instead of writing painting.png. A CPU retry mid-painting is not safe: the GPU copy of the sheet is
// ahead of the CPU copy, and the dropped work cannot be recovered. A device error while the GPU sheet starts, before
// the first mark, falls back to the CPU sheet with a warning (link.mjs attachGpu).
//
// The state is shared between the painter thread and the GPU thread: an Int32Array over a SharedArrayBuffer, slot 0 set
// once the device broke, the first error's text (UTF-8) from byte 4.
//
//   deviceHealth()                   a new shared state; link.mjs passes it to the GPU thread in workerData
//   watchDevice(device, onBroken)    GPU thread (worker.mjs, batch-server.mjs): calls onBroken(text) once, on the first
//                                    uncaptured error or a loss that was not asked for. Returns { tick() }.
//   markBroken(health, text)         GPU thread: records the first error; later ones keep the first text
//   brokenReason(health)             the recorded text, or ''
//   assertHealthy(health)            painter thread (GpuLink.call and post): throws once the device broke
//   assertDeviceHealthy(sheet)       paint-plate.mjs, before it writes painting.png
//
// GPU_FAKE_DEVICE_ERROR=N (diagnosis only, off by default): the GPU thread reports a synthetic device error on the Nth
// message it handles (watchDevice's tick), to check that a run stops without writing a painting.
const BYTES = 1024;

class GpuDeviceError extends Error {
  constructor(reason) {
    super(`GPU device error: ${reason}. The device dropped work, so the sheet on it is wrong; the run stops and writes no painting. Rerun, or use --gpu off for the CPU sheet.`);
    this.name = 'GpuDeviceError';
  }
}

export const deviceHealth = () => new Int32Array(new SharedArrayBuffer(BYTES));

export function markBroken(health, text) {
  if (!health || Atomics.load(health, 0)) return false;
  const bytes = new TextEncoder().encode(String(text)).subarray(0, BYTES - 5), view = new Uint8Array(health.buffer, 4, BYTES - 4);
  view.fill(0); view.set(bytes); Atomics.store(health, 0, 1);
  return true;
}

export function brokenReason(health) {
  if (!health || !Atomics.load(health, 0)) return '';
  const view = new Uint8Array(health.buffer, 4, BYTES - 4), end = view.indexOf(0);
  return new TextDecoder().decode(view.slice(0, end < 0 ? view.length : end)) || 'unknown device error';
}

export function assertHealthy(health) { if (health && Atomics.load(health, 0)) throw new GpuDeviceError(brokenReason(health)); }

export function assertDeviceHealthy(sheet) { assertHealthy(sheet?._gpu?.health); }

const KINDS = { GPUOutOfMemoryError: 'out of memory', GPUValidationError: 'validation', GPUInternalError: 'internal' };
const errorText = e => {
  const err = e?.error ?? e, type = err?.constructor?.name ?? 'GPUError';
  return `${KINDS[type] ?? type}: ${String(err?.message ?? err).trim().split('\n')[0]}`;
};

export function watchDevice(device, onBroken, { fakeAfterOps = Number(process.env.GPU_FAKE_DEVICE_ERROR) || 0 } = {}) {
  let broken = false, ops = 0;
  const once = text => { if (broken) return; broken = true; onBroken(text); };
  device.addEventListener('uncapturederror', e => { e.preventDefault?.(); once(errorText(e)); });
  device.lost?.then(info => { if (info?.reason !== 'destroyed') once(`device lost (${info?.reason ?? 'unknown'}) ${info?.message ?? ''}`.trim()); });
  return { tick() { if (fakeAfterOps > 0 && ++ops === fakeAfterOps) once(`synthetic device error on GPU message ${fakeAfterOps} (GPU_FAKE_DEVICE_ERROR)`); } };
}
