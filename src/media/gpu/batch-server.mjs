// GPU thread of a paint batch (tools/gpu/paint-batch.mjs): one device and one SheetBatch, handling each painter's ops
// as worker.mjs does for one sheet. Each painter's ops run in order; steps from all sheets merge in the batch.
import { parentPort, workerData, threadId } from 'node:worker_threads';
import { performance as perf } from 'node:perf_hooks';
const elu0 = perf.eventLoopUtilization();
// BATCH_PROF=<file>: a CPU profile of this thread alone, written when the driver asks for stats
import { Session } from 'node:inspector/promises';
import fsProf from 'node:fs';
const prof = process.env.BATCH_PROF ? new Session() : null;
if (prof) { prof.connect(); await prof.post('Profiler.enable'); await prof.post('Profiler.start'); }
const opStats = {}; // per op: count and wall ms in its handler (awaits included)
import { openGpu } from './stepfull.mjs';
import { SheetBatch } from './sheet-batch.mjs';
import { GpuOpticalComposite } from './optical-gpu.mjs';
import { writeAdapterEvidence } from './adapter-evidence.mjs';
import { watchDevice, markBroken } from './device-health.mjs';

const RING_FLOATS = 6144;
const NS = workerData.sheets;
let core = null, coreReady = null, device = null, adapter = null;
// every sheet's device state (device-health.mjs): one device error breaks all the sheets on the device
const HEALTH = new Set(); let BROKEN = '';
const asyncDry = process.env.GPU_ASYNC_DRY === '1' && process.env.GPU_RESIDENT === '1';
function signedZero(a) { const bits = new Uint32Array(a.buffer, a.byteOffset, a.length); return bits.includes(0x80000000); }

async function deviceOnce() {
  if (device) return;
  const webgpu = await import('webgpu'); Object.assign(globalThis, webgpu.globals);
  ({ device, adapter } = await openGpu(webgpu.create(process.env.DAWN_FLAGS ? process.env.DAWN_FLAGS.split(' ') : [])));
  watchDevice(device, text => { BROKEN = text; console.error('[batch gpu] device error:', text); for (const h of HEALTH) markBroken(h, text); });
}
// the batch is made by the first sheet to arrive (all share its size and step options)
function coreFor(sheet, O) { return coreReady ??= (async () => { await deviceOnce(); core = await SheetBatch.create(device, NS, sheet, O); return core; })(); }

function sheetHandler(sid, port) {
  let wd = null, ring, done, sumData, ctrl, rectData, layerData, err;
  let gpu = null, chain = Promise.resolve(), pendingSteps = 0, fullBrushPigments = false;
  const queuedDrys = [], brushMasks = new Map(); let workerWetMask = 0, workerTopMask = 0;
  let framePort = null, frameChain = Promise.resolve();
  const ack = () => { Atomics.store(ctrl, 0, 1); Atomics.notify(ctrl, 0); };
  const fail = (msg, status = 0) => { console.error(`[batch gpu] sheet ${sid}:`, msg); const b = new TextEncoder().encode(String(msg).slice(0, err.length - 1)); err.fill(0); err.set(b); ctrl[2] = 1; if (status) Atomics.store(ctrl, 3, status); ack(); };
  const toFrames = (p, build) => { frameChain = frameChain.then(() => p).then(v => { const { msg, transfer } = build(v); framePort.postMessage(msg, transfer); }).catch(e => fail(e.stack ?? e.message)); };
  const brushPigments = m => { if (m.op !== 'stroke') return; fullBrushPigments ||= m.data[35] !== 0; if (fullBrushPigments) m.data[35] = 1; };
  const strokeMask = m => { if (!asyncDry) return; workerWetMask |= (m.info.mask ?? 0) | (brushMasks.get(m.info.restore ?? m.info.state) ?? 0); const mask = (workerWetMask | workerTopMask) >>> 0; gpu.setAct(mask); brushMasks.set(m.info.state, mask); };
  const driedMask = r => { if (!asyncDry) return; workerWetMask = 0; if (r.pushed) workerTopMask = r.topMask ?? 0; gpu.setAct(workerTopMask); };
  const flushSteps = async () => { if (!pendingSteps) return; const n = pendingSteps; pendingSteps = 0; await gpu.advance(n); };
  // ops the painter waits on: meet the other sheets at the barrier first, so their pending work goes in one submit
  const NO_BARRIER = new Set(['init', 'opts', 'act', 'framePort', 'snap', 'stroke', 'splat', 'close', 'up', 'upNoop', 'resist', 'topUp', 'fixedBedUp', 'opticalInit']);

  async function handle(m) {
    const t0 = perf.now(); try { return await handleOp(m); } finally { const e = opStats[m.op] ??= [0, 0]; e[0]++; e[1] += perf.now() - t0; }
  }
  async function handleOp(m) {
    if (m.op === 'hello') { wd = m.data; if (wd.health) { HEALTH.add(wd.health); if (BROKEN) markBroken(wd.health, BROKEN); } ring = new Float32Array(wd.ring); done = new Int32Array(wd.done); sumData = new Float32Array(wd.sum); ctrl = new Int32Array(wd.ctrl); rectData = new Float32Array(wd.rect); layerData = new Float32Array(wd.layer); err = new Uint8Array(wd.err); return; }
    if (m.op === 'step') { pendingSteps += m.n; return; }
    if (m.op !== 'init') await flushSteps();
    // BATCH_URGENT=1: a painter blocked on a read does not wait for the GPU to drain (dry loops still do)
    if (core && gpu && !NO_BARRIER.has(m.op)) await core.flushSoon(sid, m.op !== 'dryQueued');
    switch (m.op) {
      case 'init': {
        const sheet = m.sheet; sheet.layers = m.top ? [m.top] : [];
        fullBrushPigments = [...sheet.G, ...sheet.D, ...sheet.P, ...(m.top ?? [])].some(signedZero);
        try { await coreFor(sheet, m.O); gpu = await core.attach(sid, sheet, m.O); await gpu.idle(); } catch (e) { return fail(`the batch GPU sheet could not start (${e.stack ?? e.message})`, 2); }
        if (wd.strokePlanMetadata) new Float64Array(wd.strokePlanMetadata).set([gpu.strokePlanBudget.requestedMiB, gpu.strokePlanBudget.effectiveMiB, device.limits.maxStorageBufferBindingSize, device.limits.maxBufferSize]);
        const adapterInfo = Object.fromEntries(['vendor', 'architecture', 'device', 'description'].map(key => [key, String(adapter.info?.[key] ?? '')]));
        writeAdapterEvidence(wd.adapterMetadata ? new Uint8Array(wd.adapterMetadata) : null, { adapterInfo, dawnFlags: process.env.DAWN_FLAGS ? process.env.DAWN_FLAGS.split(' ') : [], batch: { sheets: NS, sheet: sid } });
        err.fill(0); err.set(new TextEncoder().encode(String(m.adapterNote ?? 'webgpu batch')));
        if (asyncDry) { for (let k = 0; k < gpu.K; k++) { if ([sheet.G[k], sheet.D[k], sheet.P[k]].some(a => a.some(v => v !== 0))) workerWetMask |= 1 << k; if (m.top?.[k]?.some(v => v !== 0)) workerTopMask |= 1 << k; } gpu.setAct(workerWetMask | workerTopMask); }
        Atomics.store(ctrl, 3, 1); break;
      }
      case 'opticalInit': { gpu.flushStrokes(); gpu.optical?.destroy(); gpu.optical = await GpuOpticalComposite.create(gpu.device, gpu.n, gpu.pigments, m.micro, gpu.w); for (const layer of m.lower) gpu.optical.append(layer); gpu.opticalCount = m.count; break; }
      case 'opticalFrame': { gpu.flushStrokes(); const wet = gpu.optical.sumWet(gpu.b.G, gpu.b.D, gpu.b.P); const rgb = await gpu.optical.frame(m.base, gpu.hasTop ? [gpu.b.TOP, wet] : [wet], true); new Uint8Array(rectData.buffer, 0, rgb.length).set(rgb); break; }
      case 'opts': gpu.setOptions(m.o); return;
      case 'act': if (!asyncDry) gpu.setAct(m.mask); return;
      case 'down': { rectData.set(await gpu.readRect(m.rect)); break; }
      case 'paperDown': { rectData.set(await gpu.readPaperRect(m.rect)); break; }
      case 'up': { fullBrushPigments ||= m.signedZero || signedZero(m.data ?? rectData); if (asyncDry) { workerWetMask |= m.mask ?? 0; gpu.setAct(workerWetMask | workerTopMask); } const [, , rw, rh] = m.rect; gpu.writeRect(m.rect, m.data ?? rectData.slice(0, rw * rh * gpu.planes()), m.logicalRect); break; }
      case 'upNoop': { fullBrushPigments ||= m.signedZero; if (asyncDry) { workerWetMask |= m.mask ?? 0; gpu.setAct(workerWetMask | workerTopMask); } gpu.writeRect(null, null, m.logicalRect); break; }
      case 'upReduced': {
        gpu.writeRect(m.rect, m.data ?? null, m.logicalRect);
        const metadata = await gpu.uploadMetadata(m.logicalRect); fullBrushPigments ||= metadata.signedZero;
        if (asyncDry) { workerWetMask |= metadata.mask; gpu.setAct(workerWetMask | workerTopMask); }
        ctrl[10] = metadata.mask; ctrl[11] = metadata.signedZero ? 1 : 0; break;
      }
      case 'dryQueued': {
        gpu.setOptions(m.o); const steps = await gpu.dry(m.max, m.o, m.params), oldMask = gpu.topMask ?? m.initialTopMask ?? 0;
        const r = await gpu.fix(null, oldMask, true); driedMask(r); queuedDrys.push([steps, r.hadTop ? 1 : 0, r.pushed ? 1 : 0, r.topMask ?? oldMask, r.archive ?? 0, oldMask]); break;
      }
      case 'drainDrys': { if (queuedDrys.length * 6 > rectData.length) throw new Error('Dry metadata queue exceeded shared mailbox'); new Uint32Array(rectData.buffer).set(queuedDrys.flat()); ctrl[1] = queuedDrys.length; queuedDrys.length = 0; break; }
      case 'dry': case 'dryEnd': {
        if (m.op === 'dry') { gpu.setOptions(m.o); ctrl[1] = await gpu.dry(m.max, m.o, m.params); } else ctrl[1] = await gpu.dryEnd();
        const defer = gpu.resident && !framePort;
        const r = await gpu.fix(gpu.hasTop && !defer ? layerData.subarray(0, gpu.K * gpu.n) : null, m.topMask, defer);
        driedMask(r); ctrl[9] = r.archive ?? 0; ctrl[4] = r.hadTop ? 1 : 0; ctrl[5] = r.pushed ? 1 : 0; ctrl[7] = r.topMask ?? 0;
        if (framePort && r.pushed && r.hadTop) {
          const K = gpu.K, n = gpu.n, ks = []; for (let k = 0; k < K; k++) if (m.topMask === undefined || (m.topMask >>> k) & 1) ks.push(k);
          const data = new Float32Array(ks.length * n); ks.forEach((k, q) => data.set(layerData.subarray(k * n, (k + 1) * n), q * n));
          toFrames(null, () => ({ msg: { type: 'lower', ks, data }, transfer: [data.buffer] }));
        }
        break;
      }
      case 'framePort': framePort = m.port; return;
      case 'snap': { const p = gpu.snapshot(m); toFrames(p, v => ({ msg: { type: 'snap', id: m.id, ...v }, transfer: [v.data.buffer] })); return; }
      case 'dryBegin': gpu.setOptions(m.o); gpu.dryBegin(m.max, m.o, m.params); break;
      case 'dryAdvance': { const r = await gpu.dryAdvance(m.until ?? Infinity); ctrl[1] = r.t; ctrl[8] = r.done ? 1 : 0; break; }
      case 'sums': { await gpu.wetSums(sumData, m.mask); break; }
      case 'lowerBatch': { await gpu.readArchives(m.ids, new Float32Array(m.output)); break; }
      case 'lowerDown': { await gpu.readArchive(m.id, layerData); break; }
      case 'topDownRect': { await gpu.readTopRect(layerData, m.rect, m.mask); break; }
      case 'topDown': { await gpu.readTop(layerData, m.mask); break; }
      case 'fixedBedUp': { gpu.flushStrokes(); gpu.device.queue.writeBuffer(gpu.b.DEP, gpu.n * 8, m.bed); break; }
      case 'topUp': { fullBrushPigments ||= signedZero(layerData); if (asyncDry) { workerTopMask = m.mask ?? 0; gpu.setAct(workerWetMask | workerTopMask); } gpu.uploadTop(layerData.subarray(0, gpu.K * gpu.n)); break; }
      case 'resist': { gpu.setResist(m.mask); break; }
      case 'brushState': { const out = await gpu.brushState(m.state, m.seq); ring.set(m.splat ? new Float32Array([out[3]]) : out, m.slot * RING_FLOATS); Atomics.store(done, m.slot, m.seq); Atomics.notify(done, m.slot); break; }
      case 'stroke': case 'splat': {
        brushPigments(m); strokeMask(m);
        (m.op === 'stroke' ? gpu.runStroke(m.data, { ...m.info, slot: m.slot, seq: m.seq }) : gpu.runSplat(m.data, m.info)).then(out => { if (out === null) return; ring.set(out, m.slot * RING_FLOATS); Atomics.store(done, m.slot, m.seq); Atomics.notify(done, m.slot); }).catch(e => fail(e.stack ?? e.message));
        return;
      }
      // the plan queue's backpressure: the batch staged the plans at queue time, so meeting the pump (above) is enough
      case 'idle': if (!m.planQueue) await gpu.idle(); break;
      case 'counters': { const c = await gpu.counters(); ctrl[1] = c[1]; ctrl[6] = c[4]; break; }
      case 'dryStats': { const t = gpu.dryTelemetry ?? {}; ctrl[1] = t.calls ?? 0; ctrl[4] = t.fastChunk ?? 50; ctrl[6] = t.lastWetCounter ?? -1; ctrl[12] = t.counterReads ?? 0; ctrl[13] = 0; ctrl[14] = t.fastIterations ?? 0; ctrl[15] = t.fastChunks ?? 0; break; }
      case 'prof': { gpu.flushStrokes(); const b = new TextEncoder().encode(JSON.stringify({ batch: core.stats })); new Uint8Array(rectData.buffer).set(b); ctrl[1] = b.length; break; }
      case 'close': core?.close(sid); core?.flushNow(); parentPort.postMessage({ type: 'closed', sid }); port.close(); return;
      default: throw new Error(`batch gpu: op ${m.op} is not supported`);
    }
    if (m.wait !== false) ack();
  }
  port.on('message', m => { chain = chain.then(() => handle(m)).catch(e => fail(e.stack ?? e.message)); });
}

parentPort.on('message', m => {
  if (m.type === 'sheet') sheetHandler(m.sid, m.port);
  if (m.type === 'gone') core?.close(m.sid);
  if (m.type === 'stats' && prof) { prof.post('Profiler.stop').then(({ profile }) => { fsProf.writeFileSync(process.env.BATCH_PROF.replace(/(\\.cpuprofile)?$/, `.${threadId}.cpuprofile`), JSON.stringify(profile)); parentPort.postMessage({ type: 'stats', stats: core?.stats ?? null, workers: core?.workers, ops: opStats, gpuThreadBusy: +perf.eventLoopUtilization(elu0).utilization.toFixed(3) }); }); return; }
  if (m.type === 'stats') parentPort.postMessage({ ops: opStats, type: 'stats', stats: core?.stats ?? null, workers: core?.workers, gpuThreadBusy: +perf.eventLoopUtilization(elu0).utilization.toFixed(3) });
});
await deviceOnce(); // open the device while the painters plan
parentPort.postMessage({ type: 'ready' });
