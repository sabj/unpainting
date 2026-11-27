// Dedicated Metal/WebGPU worker for the two-grid solver (`GpuFineTransport` + coarse water step).
// Keeps fine pigment planes (G, P, D, top) resident on the GPU across consecutive steps and whole drys
// while sharing zero-copy SharedArrayBuffers with the painter thread.
import { parentPort, workerData } from 'node:worker_threads';
import { openGpu } from './stepfull.mjs';
import { GpuFineTransport } from './fine-transport.mjs';
import { writeAdapterEvidence } from './adapter-evidence.mjs';
import { watchDevice, markBroken, assertHealthy } from './device-health.mjs';
import { createSheet, step } from '../sheet.mjs';
import { attachFine } from '../fine-pigment.mjs';
import { resetEdgeFeed } from '../edge-feed.mjs';
import { timeChunks } from '../time-chunks.mjs';
import { runTwoGridDry } from './two-grid-sheet.mjs';

const keepAlive = setInterval(() => {}, 1000);
const ctrl = new Int32Array(workerData.ctrl);
const err = new Uint8Array(workerData.err);
const statsBuf = new Float64Array(workerData.stats);
const health = new Int32Array(workerData.health);

function ack() {
  Atomics.store(ctrl, 0, 1);
  Atomics.notify(ctrl, 0);
}

function fail(msg, status = 0) {
  const b = new TextEncoder().encode(String(msg).slice(0, err.length - 1));
  err.fill(0);
  err.set(b);
  ctrl[2] = 1;
  if (status) {
    Atomics.store(ctrl, 3, status);
    Atomics.notify(ctrl, 3);
  }
  ack();
}

process.on('uncaughtException', e => {
  markBroken(health, e.message);
  fail(e.stack ?? e.message, Atomics.load(ctrl, 3) === 0 ? 2 : 0);
});
process.on('unhandledRejection', reason => {
  const msg = reason?.stack ?? reason?.message ?? String(reason);
  markBroken(health, msg);
  fail(msg, Atomics.load(ctrl, 3) === 0 ? 2 : 0);
});

let device = null, transport = null, coarse = null, F = null, watcher = null;
let totalCoarseMs = 0, totalFineMs = 0, totalSubSteps = 0;

async function init() {
  let webgpu;
  try { webgpu = await import('webgpu'); }
  catch (e) { return fail(`the webgpu package is not installed (${e.code ?? e.message})`, 2); }
  let adapter;
  try {
    Object.assign(globalThis, webgpu.globals);
    const flags = process.env.DAWN_FLAGS ? process.env.DAWN_FLAGS.split(' ') : [];
    ({ device, adapter } = await openGpu(webgpu.create(flags)));
  } catch (e) {
    return fail(`no WebGPU adapter (${e.message})`, 2);
  }
  watcher = watchDevice(device, text => {
    markBroken(health, text);
    fail('GPU device error: ' + text);
  });
  const adapterInfo = Object.fromEntries(
    ['vendor', 'architecture', 'device', 'description'].map(key => [key, String(adapter.info?.[key] ?? '')]),
  );
  writeAdapterEvidence(
    workerData.adapterMetadata ? new Uint8Array(workerData.adapterMetadata) : null,
    { adapterInfo, dawnFlags: process.env.DAWN_FLAGS ? process.env.DAWN_FLAGS.split(' ') : [] },
  );

  const { coarsePaper, finePaper, pigments, opts, N, sabs } = workerData;
  coarse = createSheet(coarsePaper, pigments);
  coarse.W = new Float32Array(sabs.coarseW);
  coarse.s = new Float32Array(sabs.coarseS);
  coarse.M = new Uint8Array(sabs.coarseM);
  coarse.ever = new Uint8Array(sabs.coarseEver);
  coarse.edge = new Float32Array(sabs.coarseEdge);
  coarse.edgePending = new Float64Array(sabs.coarseEdgePending);

  F = attachFine(coarse, finePaper, N, opts);
  F.G = sabs.fineG.map(b => new Float32Array(b));
  F.P = sabs.fineP.map(b => new Float32Array(b));
  F.D = sabs.fineD.map(b => new Float32Array(b));
  F.M = new Uint8Array(sabs.fineM);
  F.ever = new Uint8Array(sabs.fineEver);
  F.blockMaskCount = new Uint16Array(sabs.blockMaskCount);
  F.blockEverCount = new Uint16Array(sabs.blockEverCount);

  transport = new GpuFineTransport(device);
  Atomics.store(ctrl, 3, 1);
  Atomics.notify(ctrl, 3);
}

let chain = init();

async function handleOp(m) {
  if (m.op === 'close') {
    try { transport?.destroy(); } catch {}
    try { watcher?.stop?.(); } catch {}
    try { device?.destroy(); } catch {}
    clearInterval(keepAlive);
    ack();
    process.exit(0);
  }
  assertHealthy(health);
  switch (m.op) {
    case 'step': {
      coarse.wetDirty = 1;
      F.maskVersion = m.maskVersion;
      F.everVersion = m.everVersion;
      F.o = m.o;
      const chunks = timeChunks(m.o.dt, m.chunkDt);
      const sub = chunks > 1 ? { ...m.o, dt: m.o.dt / chunks } : m.o;
      let wet = false, ran = 0;
      for (let c = 0; c < chunks; c++) {
        const t0 = performance.now();
        wet = step(coarse, sub, null, m.chunkDt);
        const t1 = performance.now();
        totalCoarseMs += t1 - t0;
        if (!wet) break;
        await F.stepAsync(transport, { keepResident: true });
        totalFineMs += performance.now() - t1;
        ran++; totalSubSteps++;
      }
      ctrl[1] = wet ? 1 : 0;
      ctrl[4] = F.maskVersion;
      ctrl[5] = F.everVersion;
      ctrl[6] = ran;
      ack();
      break;
    }
    case 'dry': {
      coarse.wetDirty = 1;
      F.maskVersion = m.maskVersion;
      F.everVersion = m.everVersion;
      const res = await runTwoGridDry(F, transport, m.max, m.o, m.dryOpts);
      totalCoarseMs += res.coarseMs;
      totalFineMs += res.fineMs;
      totalSubSteps += res.subSteps;
      ctrl[1] = res.steps;
      ctrl[4] = F.maskVersion;
      ctrl[5] = F.everVersion;
      ctrl[6] = res.stillWet;
      ack();
      break;
    }
    case 'syncHost': {
      const t0 = performance.now();
      await transport.syncHost(F);
      totalFineMs += performance.now() - t0;
      ack();
      break;
    }
    case 'setTop': {
      await transport.syncHost(F);
      F.maskVersion = m.maskVersion;
      F.everVersion = m.everVersion;
      if (m.resetEdge) resetEdgeFeed(coarse);
      if (m.planes) {
        const zero = F.zeroLayer ??= new Float32Array(F.fn);
        F.layers = [m.planes.map(sab => sab ? new Float32Array(sab) : zero)];
      } else {
        F.layers = [];
      }
      ack();
      break;
    }
    case 'setResist': {
      coarse.resist = m.resist ? new Uint8Array(m.resist) : null;
      coarse.resistStrength = m.strength ? new Float32Array(m.strength) : null;
      coarse.resistFrom = m.resistFrom ?? null;
      ack();
      break;
    }
    case 'stats': {
      statsBuf[0] = transport ? transport.bytes() : 0;
      statsBuf[1] = totalCoarseMs;
      statsBuf[2] = totalFineMs;
      statsBuf[3] = totalSubSteps;
      ack();
      break;
    }
    default:
      throw new Error(`unknown two-grid worker op: ${m.op}`);
  }
}

parentPort.on('message', m => {
  chain = chain.then(() => handleOp(m)).catch(e => {
    markBroken(health, e.message);
    fail(e.stack ?? e.message);
  });
});
