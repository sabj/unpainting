// The GPU half of the sheet backend, in a worker thread. The painter's main thread runs the brush and blocks on
// Atomics.wait for the few results it needs (a rectangle of the sheet, a dry, a layer); everything else is posted and
// runs in order. Rectangles and layers travel in SharedArrayBuffers named in workerData.
import { parentPort, workerData } from 'node:worker_threads';
import { openGpu, GpuSheet } from './stepfull.mjs';
import { writeAdapterEvidence } from './adapter-evidence.mjs';
import { GpuOpticalComposite } from './optical-gpu.mjs';
import { createHash } from 'node:crypto';
import { observeFrontier } from './frontier-layout.mjs';
import { instrumentDispatches } from './dispatch-profile.mjs';

if (process.env.GPU_STROKES === 'capdebug') globalThis.GPU_CAP_DEBUG = true; // say when a step in a stroke had more active tiles than it was sized for
const RING_FLOATS = 6144; // must match link.mjs
const ring = new Float32Array(workerData.ring), done = new Int32Array(workerData.done), sumData = new Float32Array(workerData.sum);
const ctrl = new Int32Array(workerData.ctrl), rectData = new Float32Array(workerData.rect), layerData = new Float32Array(workerData.layer), err = new Uint8Array(workerData.err);
// ctrl: 0 ack, 1 int result, 2 failed, 3 status (0 booting, 1 ready, 2 unavailable), 4 layer returned by a dry, 5 layer pushed by a dry, 6 wet tiles left by the last step
let gpu = null, sheet = null, chain = Promise.resolve();
const queuedDrys=[];
let fullBrushPigments = false;
function signedZero(a) { const bits = new Uint32Array(a.buffer, a.byteOffset, a.length); return bits.includes(0x80000000); }
// GPU_SIGNED_ZERO=ignore (Fast): a -0 pigment value is zero; strokes keep the active-pigment kernel instead of switching
// every later stroke to the all-pigment one for bit-exact signed zeros
const IGNORE_SIGNED_ZERO = process.env.GPU_SIGNED_ZERO === 'ignore';
function brushPigments(m) { if (m.op !== 'stroke') return; if (IGNORE_SIGNED_ZERO) { m.data[35] = 0; return; } fullBrushPigments ||= m.data[35] !== 0; if (fullBrushPigments) m.data[35] = 1; }

const asyncDry=process.env.GPU_ASYNC_DRY==='1' && process.env.GPU_RESIDENT==='1';let workerWetMask=0,workerTopMask=0;const brushMasks=new Map();
function strokeMask(m){if(!asyncDry)return;workerWetMask|=(m.info.mask??0)|(brushMasks.get(m.info.restore??m.info.state)??0);const mask=(workerWetMask|workerTopMask)>>>0;gpu.setAct(mask);brushMasks.set(m.info.state,mask);}
function driedMask(r){if(!asyncDry)return;workerWetMask=0;if(r.pushed)workerTopMask=r.topMask??0;gpu.setAct(workerTopMask);}

// the frame worker's port (framer.mjs), and the order frames and finished layers are handed to it in: the order they were
// taken in the queue, whatever order their read-backs land in
let framePort = null, frameChain = Promise.resolve();
const toFrames = (p, build) => { frameChain = frameChain.then(() => p).then(v => { const { msg, transfer } = build(v); framePort.postMessage(msg, transfer); }).catch(e => { console.error('gpu worker frame error', e); fail(e.stack ?? e.message); }); };
const ack = () => { Atomics.store(ctrl, 0, 1); Atomics.notify(ctrl, 0); };
const fail = (msg, status = 0) => { const b = new TextEncoder().encode(String(msg).slice(0, err.length - 1)); err.fill(0); err.set(b); ctrl[2] = 1; if (status) Atomics.store(ctrl, 3, status); ack(); };

// Normal profiling preserves scheduling. Serial profiling is diagnostic only: its wall timings include queue waits.
const PROF = process.env.GPU_PROF === '1' ? {} : null;
const SERIAL_PROF = !!PROF && process.env.GPU_PROF_SERIAL === '1';
globalThis.GPU_PROF = SERIAL_PROF ? PROF : null;
const padd = (k, ms, n = 1) => { const e = PROF[k] ??= { ms: 0, n: 0 }; e.ms += ms; e.n += n; };

// Consecutive step messages collapse into one gpu.step(n): the steps are only needed when something reads or writes the sheet
// (a rectangle, a dry, a finish), and one submit per step costs more than the step does on a small wet area.
let pendingSteps = 0;
const flushSteps = async () => {
  if (!pendingSteps) return;
  const n = pendingSteps, t = PROF ? performance.now() : 0; pendingSteps = 0; await gpu.advance(n);
  if (PROF) { if (SERIAL_PROF) await gpu.idle(); padd('advance', performance.now() - t, n); }
};

async function handle(m) {
  if (m.op === 'step') { pendingSteps += m.n; return; }
  if (m.op !== 'init') await flushSteps();
  if (SERIAL_PROF && m.op !== 'init' && m.op !== 'prof') {
    const t = performance.now();
    if (m.op === 'stroke' || m.op === 'splat') {
      brushPigments(m); strokeMask(m);
      const out = await (m.op === 'stroke' ? gpu.runStroke(m.data, {...m.info,slot:m.slot,seq:m.seq}) : gpu.runSplat(m.data, m.info)); if(out===null) return; ring.set(out, m.slot * RING_FLOATS); Atomics.store(done, m.slot, m.seq); Atomics.notify(done, m.slot);
      padd(m.op, performance.now() - t); return;
    }
    await handleOp(m); await gpu.idle(); padd(m.op, performance.now() - t); return;
  }
  if (!PROF || m.op === 'init' || m.op === 'prof') return handleOp(m);
  const t = performance.now();
  try { return await handleOp(m); } finally { padd(m.op, performance.now() - t); }
}
async function handleOp(m) {
  switch (m.op) {
    case 'init': {
      let webgpu;
      try { webgpu = await import('webgpu'); } catch (e) { return fail(`the webgpu package is not installed (${e.code ?? e.message})`, 2); }
      let device, adapter;
      try { Object.assign(globalThis, webgpu.globals); ({ device, adapter } = await openGpu(webgpu.create(process.env.DAWN_FLAGS ? process.env.DAWN_FLAGS.split(' ') : []))); } catch (e) { return fail(`no WebGPU adapter (${e.message})`, 2); }
      if (PROF || process.env.GPU_TIMESTAMPS === '1') instrumentDispatches(device);
      sheet = m.sheet; sheet.layers = m.top ? [m.top] : [];
      fullBrushPigments = [...sheet.G, ...sheet.D, ...sheet.P, ...(m.top ?? [])].some(signedZero);
      try { gpu = await GpuSheet.create(device, sheet, m.O); await gpu.idle(); } catch (e) { return fail(`the GPU sheet could not start (${e.message})`, 2); }
      if(workerData.strokePlanMetadata)new Float64Array(workerData.strokePlanMetadata).set([gpu.strokePlanBudget.requestedMiB,gpu.strokePlanBudget.effectiveMiB,device.limits.maxStorageBufferBindingSize,device.limits.maxBufferSize]);
      const adapterInfo = Object.fromEntries(['vendor', 'architecture', 'device', 'description'].map(key => [key, String(adapter.info?.[key] ?? '')]));
      writeAdapterEvidence(workerData.adapterMetadata ? new Uint8Array(workerData.adapterMetadata) : null, { adapterInfo, dawnFlags: process.env.DAWN_FLAGS ? process.env.DAWN_FLAGS.split(' ') : [] });
      err.fill(0); err.set(new TextEncoder().encode(String(m.adapterNote ?? 'webgpu')));
      if(asyncDry){for(let k=0;k<gpu.K;k++){if([sheet.G[k],sheet.D[k],sheet.P[k]].some(a=>a.some(v=>v!==0)))workerWetMask|=1<<k;if(m.top?.[k]?.some(v=>v!==0))workerTopMask|=1<<k;}gpu.setAct(workerWetMask|workerTopMask);}
      Atomics.store(ctrl, 3, 1); break;
    }
    case 'opticalInit': {
      gpu.flushStrokes(); gpu.optical?.destroy(); gpu.optical = null;
      gpu.optical = await GpuOpticalComposite.create(gpu.device, gpu.n, gpu.pigments, m.micro, gpu.w);
      for (const layer of m.lower) gpu.optical.append(layer);
      gpu.opticalCount = m.count; break;
    }
    case 'opticalFrame': {
      gpu.flushStrokes();const wet=gpu.optical.sumWet(gpu.b.G,gpu.b.D,gpu.b.P);
      const rgb=await gpu.optical.frame(m.base,gpu.hasTop?[gpu.b.TOP,wet]:[wet],true);
      new Uint8Array(rectData.buffer,0,rgb.length).set(rgb);break;
    }
    case 'opts': gpu.setOptions(m.o); return;
    case 'act': if(!asyncDry)gpu.setAct(m.mask); return;
    case 'down': { const p = await gpu.readRect(m.rect); rectData.set(p); break; }
    case 'paperDown': { const p = await gpu.readPaperRect(m.rect); rectData.set(p); break; }
    case 'up': { fullBrushPigments ||= m.signedZero || signedZero(m.data ?? rectData); if(asyncDry){workerWetMask|=m.mask??0;gpu.setAct(workerWetMask|workerTopMask);} const [, , rw, rh] = m.rect; gpu.writeRect(m.rect, m.data ?? rectData.slice(0, rw * rh * gpu.planes()), m.logicalRect); break; }
    case 'upNoop': { fullBrushPigments ||= m.signedZero; if(asyncDry){workerWetMask|=m.mask??0;gpu.setAct(workerWetMask|workerTopMask);} gpu.writeRect(null, null, m.logicalRect); break; }
    case 'upReduced': {
      gpu.writeRect(m.rect, m.data ?? null, m.logicalRect);
      const metadata = await gpu.uploadMetadata(m.logicalRect);
      fullBrushPigments ||= metadata.signedZero;
      if (asyncDry) { workerWetMask |= metadata.mask; gpu.setAct(workerWetMask | workerTopMask); }
      // 7/8/9 belong to dry routes. These dedicated slots are written before ACK.
      ctrl[10] = metadata.mask; ctrl[11] = metadata.signedZero ? 1 : 0;
      break;
    }
    case 'dryQueued': {
      gpu.setOptions(m.o);const steps=await gpu.dry(m.max,m.o,m.params),oldMask=gpu.topMask??m.initialTopMask??0;
      const r=await gpu.fix(null,oldMask,true);driedMask(r);queuedDrys.push([steps,r.hadTop?1:0,r.pushed?1:0,r.topMask??oldMask,r.archive??0,oldMask]);break;
    }
    case 'drainDrys': {
      if(queuedDrys.length*6>rectData.length)throw new Error('Dry metadata queue exceeded shared mailbox');
      new Uint32Array(rectData.buffer).set(queuedDrys.flat());ctrl[1]=queuedDrys.length;queuedDrys.length=0;break;
    }
    case 'dry': case 'dryEnd': {
      if (m.op === 'dry') { gpu.setOptions(m.o); ctrl[1] = await gpu.dry(m.max, m.o, m.params); } else ctrl[1] = await gpu.dryEnd();
      // fix(): the layer it supersedes comes back through layerData, the deposit becomes the new top layer
      const defer = gpu.resident && !framePort;
      const r = await gpu.fix(gpu.hasTop && !defer ? layerData.subarray(0, gpu.K * gpu.n) : null, m.topMask, defer);
      driedMask(r);ctrl[9] = r.archive ?? 0;
      ctrl[4] = r.hadTop ? 1 : 0; ctrl[5] = r.pushed ? 1 : 0; ctrl[7] = r.topMask ?? 0;
      // the superseded layer is now under the top: the frame worker lays it into its composite
      if (framePort && r.pushed && r.hadTop) {
        const K = gpu.K, n = gpu.n, ks = []; for (let k = 0; k < K; k++) if (m.topMask === undefined || (m.topMask >>> k) & 1) ks.push(k);
        const data = new Float32Array(ks.length * n); ks.forEach((k, q) => data.set(layerData.subarray(k * n, (k + 1) * n), q * n));
        toFrames(null, () => ({ msg: { type: 'lower', ks, data }, transfer: [data.buffer] }));
      }
      break;
    }
    case 'framePort': framePort = m.port; return;
    case 'snap': {
      const p = gpu.snapshot(m);
      toFrames(p, v => ({ msg: { type: 'snap', id: m.id, ...v }, transfer: [v.data.buffer] }));
      return;
    }
    // a dry in parts (link.mjs dry with a watcher): ctrl[1] the steps taken, ctrl[8] 1 once the sheet is dry
    case 'dryBegin': gpu.setOptions(m.o); gpu.dryBegin(m.max, m.o, m.params); break;
    case 'dryAdvance': { const r = await gpu.dryAdvance(m.until ?? Infinity); ctrl[1] = r.t; ctrl[8] = r.done ? 1 : 0; break; }
    case 'sums': { await gpu.wetSums(sumData, m.mask); break; }
    case 'lowerBatch': { await gpu.readArchives(m.ids, new Float32Array(m.output)); break; }
    case 'lowerDown': { await gpu.readArchive(m.id, layerData); break; }
    case 'topDownRect': { await gpu.readTopRect(layerData, m.rect, m.mask); break; }
    case 'topDown': { await gpu.readTop(layerData, m.mask); break; }
    case 'fixedBedUp': { gpu.flushStrokes(); gpu.device.queue.writeBuffer(gpu.b.DEP,gpu.n*8,m.bed); break; }
    case 'topUp': { fullBrushPigments ||= signedZero(layerData); if(asyncDry){workerTopMask=m.mask??0;gpu.setAct(workerWetMask|workerTopMask);} const K = gpu.K, n = gpu.n; gpu.uploadTop(layerData.subarray(0, K * n)); break; }
    case 'resist': { gpu.setResist(m.mask); break; }
    case 'brushState': {
      const out=await gpu.brushState(m.state,m.seq); ring.set(m.splat ? new Float32Array([out[3]]) : out,m.slot*RING_FLOATS);
      Atomics.store(done,m.slot,m.seq); Atomics.notify(done,m.slot); break;
    }
    case 'stroke': case 'splat': {
      brushPigments(m); strokeMask(m);
      // not awaited: the next message is handled while the GPU lays this one; its brush state lands in the ring when it is done
      (m.op === 'stroke' ? gpu.runStroke(m.data, {...m.info,slot:m.slot,seq:m.seq}) : gpu.runSplat(m.data, m.info)).then(out => { if(out===null) return; ring.set(out, m.slot * RING_FLOATS); Atomics.store(done, m.slot, m.seq); Atomics.notify(done, m.slot); }).catch(e => { console.error('gpu worker error', e); fail(e.stack ?? e.message); });
      return;
    }
    case 'idle': await gpu.idle(); break;
    case 'counters': { const c = await gpu.counters(); ctrl[1] = c[1]; ctrl[6] = c[4]; break; }
    case 'demandCheckState': {
      if(process.env.GPU_DEMAND_CHECK!=='1')throw new Error('Demand diagnostic is disabled');
      const hashes={};let frontier=null;
      for(const [name,buffer] of Object.entries(gpu.b)){
        if(['PACK','RC','UPLOAD_META','U'].includes(name))continue;
        let bytes=await gpu.readWords(name,buffer.size);
        if(name==='FLAGS2' && process.env.GPU_DEMAND_RAW==='1'){
          frontier=observeFrontier(new Uint32Array(bytes),gpu.ntiles);
        }
        if(name==='TL'){
          const raw=new Uint32Array(bytes),count=raw[gpu.ntiles];
          bytes=new Uint32Array([count,...Array.from(raw.subarray(0,count)).sort((a,b)=>a-b)]).buffer;
        }
        hashes[name]=createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
      }
      const data=new TextEncoder().encode(JSON.stringify({...(process.env.GPU_DEMAND_LIFECYCLE==='1'?{demandResources:{allocated:!!gpu.b.UPLOAD_META,setupCount:gpu.demandSetupCount??0,generation:gpu.allocationGeneration}}:{}),hashes,act:gpu.act,fullBrushPigments,workerWetMask,workerTopMask,...(frontier?{frontier}:{}),hostEpoch:gpu.epoch,hold:gpu.hold,knownDry:gpu.knownDry}));
      new Uint8Array(rectData.buffer).set(data);ctrl[1]=data.length;break;
    }
    case 'dryStats': {const m=gpu.dryTelemetry??{};ctrl[1]=m.calls??0;ctrl[4]=m.fastChunk??50;ctrl[6]=m.lastWetCounter??-1;ctrl[12]=m.counterReads??0;ctrl[13]=Math.min(2147483647,Math.round((m.counterReadMs??0)*1000));ctrl[14]=m.fastIterations??0;ctrl[15]=m.fastChunks??0;break;}
    case 'prof': { gpu.flushStrokes(); const b = new TextEncoder().encode(JSON.stringify({ ...(PROF ?? {}), timingScope: SERIAL_PROF ? 'legacy serialized worker wall time' : 'worker handling wall time; data-dependent readbacks include queued GPU work; unawaited stroke execution excluded', dispatchBatches: gpu.device.dispatchProfile?.snapshot(), timestamps: await gpu.timestamps.result(), optical: gpu.optical ? { ...gpu.optical.stats, timestamps: await gpu.optical.timestamps.result() } : null })); new Uint8Array(rectData.buffer).set(b); ctrl[1] = b.length; break; }
    case 'close': process.exit(0);
  }
  if (m.wait !== false) ack();
}
parentPort.on('message', m => { chain = chain.then(() => handle(m)).catch(e => { console.error('gpu worker error', e); fail(e.stack ?? e.message); }); });
