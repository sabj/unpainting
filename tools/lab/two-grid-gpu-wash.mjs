// Real-device engineering proof, no fallback. Coarse water, absorption and
// final pore drying use CPU; the fine flow and material phases run on WebGPU.
import { create, globals } from 'webgpu';
import { openGpu } from '../../src/media/gpu/stepfull.mjs';
import { GpuFineTransport } from '../../src/media/gpu/fine-transport.mjs';
import { runWash } from './two-grid-wash.mjs';

Object.assign(globalThis, globals);
const { device } = await openGpu(create([]));
const transport = new GpuFineTransport(device);
try { await runWash(transport); }
finally { transport.destroy(); device.destroy(); }
