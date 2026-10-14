// A whole sheet.mjs step on the GPU with the sheet resident (see stepfull.wgsl). Node with the `webgpu` package (Dawn),
// or a browser's navigator.gpu passed to openGpu. sheet.mjs stays the reference and the fallback.
import fs from 'node:fs';
import {FINISH_WET_SCAN} from './finish-wet-scan.mjs';
import {edgePingPong} from './edge-pingpong.mjs';
import {fastDryChunk} from './fast-dry-chunk.mjs';
import {strokePlanBudget,strokePlanShader,planMiB} from './stroke-plan-budget.mjs';
import { runStrokePrefixDiagnostic } from './stroke-prefix-diagnostic.mjs';
import { GpuTimestamps } from './gpu-timestamps.mjs';
import { BrushReadbacks } from './brush-readbacks.mjs';
import { permeability } from './permeability.mjs';
import { workerCount } from './workers.mjs';

// GPU_WGSL_FILE: another copy of the shader, for timing experiments on a variant without editing this one
const WGSL = fs.readFileSync(typeof process !== 'undefined' && process.env.GPU_WGSL_FILE ? process.env.GPU_WGSL_FILE : new URL('./stepfull.wgsl', import.meta.url), 'utf8');
const TILE = 16;
// Fast drys (analyticTail) run their fast phase at GPU_FAST_DRY_DT_SCALE times the caller's dt (default 2). The slow
// level phase, the quiet-film switch and the analytic tail keep the caller's dt.
const envNum = (k, d) => { const v = Number(typeof process === 'undefined' ? d : process.env[k] ?? d); return Number.isFinite(v) ? v : d; };
const FAST_DRY_DT_SCALE = Math.max(0.01, envNum('GPU_FAST_DRY_DT_SCALE', 2));
// one dispatch builds a step's tile list (GPU_SPARSE_ALL=0: three separate dispatches)
const SPARSE_ALL = typeof process === 'undefined' || process.env.GPU_SPARSE_ALL !== '0';
const KEEP = []; // Dawn's instance, adapter and device must stay reachable or the GC frees them under the running device

export async function openGpu(gpu) {
  KEEP.push(gpu);
  const adapter = await gpu.requestAdapter(); if (!adapter) throw new Error('no WebGPU adapter'); KEEP.push(adapter);
  const L = adapter.limits;
  const device = await adapter.requestDevice({ requiredFeatures: process.env.GPU_TIMESTAMPS === '1' && adapter.features.has('timestamp-query') ? ['timestamp-query'] : [], requiredLimits: {
    maxStorageBuffersPerShaderStage: Math.min(process.env.GPU_FUSE_WETSCAN === '1' ? 14 : 12, L.maxStorageBuffersPerShaderStage),
    maxStorageBufferBindingSize: L.maxStorageBufferBindingSize, maxBufferSize: L.maxBufferSize,
    // the brush kernel keeps its hairs (16 KB) and the feed's log (9.6 KB) in workgroup memory
    maxComputeWorkgroupStorageSize: Math.min(32768, L.maxComputeWorkgroupStorageSize),
  } });
  KEEP.push(device); return { adapter, device };
}

const UF = [['w', 'u'], ['h', 'u'], ['n', 'u'], ['tw', 'u'], ['th', 'u'], ['ntiles', 'u'], ['K', 'u'], ['hasTop', 'u'], ['holdOn', 'u'], ['cap', 'u'], ['nAct', 'u'], ['p3', 'u'],
  ...['dt', 'evap', 'edgeEvap', 'edgeWidth', 'capE', 'absorb', 'film', 'flow', 'ff', 'flowDepth', 'diffuse', 'cd', 'settle', 'liftDepth', 'rewetLift', 'granFill', 'holdCap', 'slide', 'slideFill', 'capStep', 'capEps', 'capDelta', 'sizing', 'wickFilter', 'wetEps', 'paperDry', 'capSigma', 'spill', 'spillHeight', 'dampEase', 'pinning', 'pinFibre',
  // encloseEase and slideCap, holeFill and holeSpan in cells, marangoni and slope; pads keep the pigment table that
  // follows on a 16-byte boundary
  'enclose', 'slideCap', 'holeFill', 'padB', 'filmDiff', 'filmDepth', 'holeSpan', 'mar', 'slope', 'padC', 'padD', 'padE'].map(k => [k, 'f'])];
export { UF, UBYTES_EXPORT as UBYTES, SRC_EXPORT as SRC, analyse, HASH };
const UOFF = Object.fromEntries(UF.map(([k], i) => [k, i * 4]));
const UBYTES = UF.length * 4 + 512 + 64; const UBYTES_EXPORT = UBYTES;
const PRELUDE = `struct U {\n${UF.map(([k, t]) => `  ${k}: ${t === 'u' ? 'u32' : 'f32'},`).join('\n')}\n  pa: array<vec4<f32>, 16>,\n  pb: array<vec4<f32>, 16>,\n  kl: array<vec4<u32>, 4>,\n}\n@group(0) @binding(0) var<uniform> u: U;\nfn pigA(k: u32) -> vec4<f32> { return u.pa[k]; }\nfn pigB(k: u32) -> vec4<f32> { return u.pb[k]; }\n`;
const SRC = PRELUDE + (process.env.GPU_EDGE_PINGPONG === '1' ? edgePingPong(WGSL) : WGSL); const SRC_EXPORT = SRC;

// which bindings each entry point touches, found from the source: its own body plus the helpers it calls
function analyse(src) {
  const decl = [...src.matchAll(/@group\(0\) @binding\((\d+)\) var<([^>]*)> (\w+)/g)].map(m => ({ binding: +m[1], kind: m[2], name: m[3] }));
  const code = src.replace(/^@group\(0\).*$/gm, '').replace(/\/\/.*$/gm, ''); // declarations must not count as part of the function before them
  const starts = [...code.matchAll(/^(?:@compute[^\n]*\n)?fn (\w+)\(/gm)].map(m => ({ name: m[1], at: m.index }));
  const bodies = new Map(starts.map((s, i) => [s.name, code.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : code.length)]));
  const uses = name => {
    const seen = new Set(), out = new Set(), walk = f => {
      if (seen.has(f)) return; seen.add(f); const b = bodies.get(f);
      for (const d of decl) if (new RegExp(`\\b${d.name}\\b`).test(b)) out.add(d.binding);
      for (const g of bodies.keys()) if (g !== f && new RegExp(`\\b${g}\\(`).test(b)) walk(g);
    }; walk(name); return [...out].sort((a, b) => a - b);
  };
  const entries = [...src.matchAll(/@compute[^\n]*\nfn (\w+)\(/g)].map(m => m[1]);
  return { decl, entries, uses };
}
const HASH = j => { const v = Math.sin(j * 12.9898) * 43758.5453; return v - Math.floor(v) - 0.5; };

/** The largest per-sheet storage buffers for n cells and K pigments, and which pass the device's binding/buffer limits. */
export function sheetBufferFit(n, K, fixedBed, limits) {
  const f = n * 4, kf = f * Math.max(1, K), sizes = { OUT4: kf * 4, QXY: kf * 2, PAPER: f * 4, G: kf, DEP: fixedBed ? f * 3 : f };
  const limit = Math.min(limits.maxStorageBufferBindingSize, limits.maxBufferSize);
  return { sizes, limit, over: Object.entries(sizes).filter(([, b]) => b > limit) };
}

export class GpuSheet {
  static async create(device, sheet, o) {
    const g = new GpuSheet(); let failure = null;
    // out of memory while the sheet starts is a failed start (the CPU sheet takes over), not an uncaptured device error
    device.pushErrorScope('out-of-memory'); device.pushErrorScope('validation');
    try { await g.init(device, sheet, o); } catch (error) { failure = error; }
    const scoped = await device.popErrorScope(), oom = await device.popErrorScope(), validation = scoped ?? oom;
    if (failure || validation) {
      for (const buffer of Object.values(g.b ?? {})) buffer.destroy();
      throw failure ?? new Error(`GpuSheet initialization failed: ${validation.message}`);
    }
    return g;
  }

  async init(device, sheet, o) {
    this.allocationGeneration=(this.allocationGeneration??0)+1;
    this.demandSetup=null;this.demandSetupCount=0;
    const { w, h, n, K, paper } = sheet, d = device;
    if (K > 16) throw new Error('GpuSheet: at most 16 pigments');
    this.resident = process.env.GPU_RESIDENT === '1';
    this.persistent = this.resident && process.env.GPU_PERSISTENT !== '0';
    this.batch = this.resident && process.env.GPU_BATCH !== '0'; this.batchItems = []; this.brushSlots = new Map(); this.archives = new Map(); this.archiveSequence = 0;
    this.o = { ...o }; this.device = d; this.timestamps = new GpuTimestamps(d); this.w = w; this.h = h; this.n = n; this.K = K; this.act = Array.from({ length: K }, (_, k) => k);
    this.tw = Math.ceil(w / TILE); this.th = Math.ceil(h / TILE); this.ntiles = this.tw * this.th;
    this.workers = workerCount(this.ntiles);
    this.pigments = sheet.pigments;
    // every field is bound whole: a plane set past the device's binding limit (OUT4 is 16 bytes x pigments x cells) cannot
    // run; say which and how big instead of failing in validation
    const fit = sheetBufferFit(n, K, o.fixedBed > 0, d.limits);
    if (fit.over.length) throw new Error(`GpuSheet: ${w}x${h} with ${K} pigments needs ${fit.over.map(([k, b]) => `${k} ${(b / 2 ** 30).toFixed(2)} GiB`).join(', ')}, over this device's ${(fit.limit / 2 ** 30).toFixed(2)} GiB binding limit; use fewer pigments or a smaller sheet`);
    const mk = (bytes, usage = 0) => d.createBuffer({ size: Math.max(16, bytes), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST | usage });
    const f = n * 4, B = this.b = {};
    for (const k of ['M', 'EVER', 'RESIST', 'W', 'S', 'S2', 'EA', 'EB', 'FX', 'FY', 'WSC', 'WENT', 'DEP', 'NEWF']) B[k] = mk(f);
    if (o.fixedBed > 0) { B.DEP.destroy(); B.DEP = mk(f * 3); }
    for (const k of ['PAPER', 'PAPER2', 'PAPER3', 'BPAP']) B[k] = mk(f * 4);
    // the stroke plan and the hairs (up to SB floats), then the brush's last touch of each cell and the paper's capacity
    this.strokePlanBudget=strokePlanBudget(planMiB(process.env.GPU_STROKE_PLAN_MIB,n),n,d.limits);this.SB=this.strokePlanBudget.words;const strokeSource=strokePlanShader(SRC,this.SB)+(process.env.GPU_FUSE_WETSCAN==='1'&&d.limits.maxStorageBuffersPerShaderStage>=13?FINISH_WET_SCAN:'');B.BSTR=mk(this.strokePlanBudget.gpuBufferBytes);
    this.resistMask = null;
    for (const k of ['G', 'P', 'D', 'TOP', 'QX', 'QY', 'SC', 'OUTM', 'PN', 'DD']) B[k] = mk(f * K);
    B.FXY = mk(f * 2); B.QXY = mk(f * 2 * K);   // the fused step's fluxes (stepsInPass)
    // Split OUT4 by pigment planes when one binding would exceed the device limit.
    const out4Max = d.limits.maxStorageBufferBindingSize, planeBytes = f * 4;
    this.out4Planes = planeBytes * K > out4Max ? Math.max(1, Math.floor(out4Max / planeBytes)) : 4096;
    if (this.out4Planes < K && planeBytes * (K - this.out4Planes) > out4Max) throw Error('OUT4 needs more than two bindings at this sheet size');
    B.OUT4 = mk(planeBytes * Math.min(K, this.out4Planes)); B.OUT4B = mk(this.out4Planes < K ? planeBytes * (K - this.out4Planes) : 16);
    B.TL = mk((this.ntiles + 1) * 4); for (const k of ['FLAGS', 'FLAGS2']) B[k] = mk((k === 'FLAGS2' ? 5 * this.ntiles + 3 : this.ntiles) * 4);
    B.RC = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }); B.CTR = mk(64); B.ARGS = mk(48, GPUBufferUsage.INDIRECT); B.U = d.createBuffer({ size: UBYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    if (process.env.GPU_DEMAND_READBACK === '1') B.UPLOAD_META = mk(8);
    const put = (buf, arr, off = 0) => d.queue.writeBuffer(buf, off, arr);
    // paper: constant for a sheet
    const { px, py } = permeability(paper), P4 = new Float32Array(n * 4), P2 = new Float32Array(n * 4), P3 = new Float32Array(n * 4), hv = paper.valley || paper.height;
    for (let i = 0; i < n; i++) {
      P4.set([paper.capacity[i], paper.grain[i], paper.fdx[i], paper.fdy[i]], i * 4); P2.set([px[i], py[i], 0, 0], i * 4);
      P3.set([paper.tooth[i], HASH(i), hv[i], paper.height[i]], i * 4);
    }
    put(B.PAPER, P4); put(B.PAPER2, P2); put(B.PAPER3, P3);
    // what a brush reads of the paper: height, tooth, valley and how proud the fibres stand (brush.mjs)
    const PB = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) PB.set([paper.height[i], paper.tooth[i], hv[i], paper.proud ? paper.proud[i] : paper.height[i] - hv[i]], i * 4);
    put(B.BPAP, PB); put(B.BSTR, paper.capacity, this.SB * 4);
    this.cap = this.ntiles; this.hold = 0; this.epoch = 0; this.knownDry = false; this.lastCount = this.ntiles; this.pending = false;
    this.setOptions(this.o);
    const info = analyse(strokeSource); if (globalThis.DEBUG_USES) for (const e of info.entries) console.log(e, info.uses(e).map(b => info.decl.find(x => x.binding === b)?.name).join(","));
    if (process.env.GPU_DEMAND_READBACK !== '1') info.entries = info.entries.filter(name => name !== 'upload_metadata_rect');
    const kind = Object.fromEntries(info.decl.map(x => [x.binding, x.kind]));
    this.demandShaderSource=strokeSource.replace('const FIXED_BED: bool = false;', `const FIXED_BED: bool = ${this.o.fixedBed > 0};`).replace('const OUT4_CUT: u32 = 4294967295u;', `const OUT4_CUT: u32 = ${this.out4Planes < K ? this.out4Planes * n : 4294967295}u;`);
    const ordinarySource=process.env.GPU_DEMAND_READBACK==='1'?this.demandShaderSource:this.demandShaderSource.replace(/@compute[^\n]*\nfn upload_metadata_rect[\s\S]*?\n}/,'').replace(/^@group\(0\) @binding\(43\).*$/m,'');
    const module = d.createShaderModule({ code: ordinarySource });
    this.p = {}; this.bgl = {}; this.uses = {};
    for (const name of info.entries) {
      const use = [0, ...info.uses(name).filter(b => b !== 0)]; this.uses[name] = use;
      this.bgl[name] = d.createBindGroupLayout({ entries: use.map(binding => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: kind[binding] === 'uniform' ? 'uniform' : kind[binding] === 'storage, read' ? 'read-only-storage' : 'storage' } })) });
      this.p[name] = d.createComputePipeline({ label: name, layout: d.createPipelineLayout({ bindGroupLayouts: [this.bgl[name]] }), compute: { module, entryPoint: name } });
    }
    this.names = Object.fromEntries(info.decl.map(x => [x.binding, x.name]));
    const passes = this.o.edgeWidth + 1; this.edgeFinal = passes % 2 === 1 ? 'EB' : 'EA';
    this.bg = {};
    for (const name of info.entries) this.bg[name] = d.createBindGroup({ layout: this.bgl[name], entries: this.uses[name].map(binding => ({ binding, resource: { buffer: this.bufFor(this.names[binding]) } })) });
    // Specialize the rare signed-zero fallback so ordinary contacts have no runtime branch.
    for (const name of ['stroke_run', 'stroke_metered']) {
      this.p[name + '_full'] = strokeSource.includes('override FULL_BRUSH_PIGMENTS')
        ? d.createComputePipeline({ label: name + '_full', layout: d.createPipelineLayout({bindGroupLayouts:[this.bgl[name]]}), compute:{module,entryPoint:name,constants:{FULL_BRUSH_PIGMENTS:1}} })
        : this.p[name];
      this.bg[name + '_full'] = this.bg[name];
    }
    this.upload(sheet);
  }

  bufFor(name) { return name === 'EDGE' ? this.b[this.edgeFinal] : name === 'u' ? this.b.U : name === 'rc' ? this.b.RC : name === 'PACK' ? this.pack() : this.b[name]; }
  pack() { return this.b.PACK ?? (this.b.PACK = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE })); }

  /** Uniform values for the options and pigments. dt changes between dry()'s phases: call again with { dt }. */
  setOptions(o) {
    this.flushStrokes();
    const { device: d } = this, sheet = this, u = new ArrayBuffer(UBYTES), U32 = new Uint32Array(u), F32 = new Float32Array(u);
    this.o = { ...this.o, ...o }; o = this.o;
    const set = (k, v) => { const i = UOFF[k] / 4; if (UF.find(x => x[0] === k)[1] === 'u') U32[i] = v; else F32[i] = v; };
    set('w', this.w); set('h', this.h); set('n', this.n); set('tw', this.tw); set('th', this.th); set('ntiles', this.ntiles); set('K', this.K);
    set('p3', this.resident ? (this.persistent ? 2 : 1) : 0); set('cap', this.cap); set('hasTop', this.hasTop ? 1 : 0); set('holdOn', Number.isFinite(o.hold ?? Infinity) ? 1 : 0);
    const dt = o.dt ?? 1;
    Object.entries({
      dt, evap: o.evap, edgeEvap: o.edgeEvap, edgeWidth: o.edgeWidth, capE: o.edgeWidth + 1, absorb: o.absorb, film: o.film, flow: o.flow, ff: o.fibreFlow ?? 0.6,
      flowDepth: o.flowDepth ?? 0.12, diffuse: Math.min(0.25, Math.max(0, o.diffuse)), cd: o.carryDepth ?? 0.08, settle: o.settle, liftDepth: o.liftDepth ?? 0.15,
      rewetLift: o.rewetLift, granFill: o.granFill ?? 0, holdCap: Number.isFinite(o.hold ?? Infinity) ? o.hold : 0, slide: o.slide ?? 0, slideFill: o.slideFill ?? 1,
      capStep: Math.min(2 / 3, Math.max(0, o.capRate * dt * 10)), capEps: o.capEps, capDelta: o.capDelta, sizing: o.sizing ?? 0.85, wickFilter: o.wickFilter ?? 0.2,
      wetEps: o.wetEps, paperDry: o.paperDry, capSigma: o.capSigma, spill: o.spill, spillHeight: o.spillHeight, dampEase: o.dampEase, pinning: o.pinning ?? 0, pinFibre: o.pinFibre ?? 0,
      enclose: o.encloseEase ?? 0, slideCap: o.slideCap ?? 0, holeFill: o.holeFill ?? 0, padB: this.workers, filmDiff: Math.max(0, o.filmDiffuse ?? 0), filmDepth: o.filmDepth ?? 0.03,
      holeSpan: o.holeSpan ?? 0, mar: o.marangoni ?? 0, slope: o.slope ?? 0,
    }).forEach(([k, v]) => set(k, v));
    const base = UF.length;
    const gran = o.gran ?? 1, scour = o.scour ?? 0;
    (this.pigments ?? []).forEach((p, k) => {
      const gg = p.gamma * gran, mob = p.wick ?? Math.max(0.05, Math.min(0.9, 1 - p.gamma));
      F32.set([gg, (p.rho / p.omega) * o.lift * o.looseLift, scour / p.omega, gg > 0 ? (o.repose ?? 0) / gg : 0], base + k * 4);
      F32.set([p.rho, p.omega, p.floc ?? 0, mob], base + 64 + k * 4);
    });
    set('nAct', this.act.length); this.act.forEach((k, a) => { U32[UF.length + 128 + a] = k; });
    d.queue.writeBuffer(this.b.U, 0, u);
  }
  /** The pigments that may hold mass (bit k of `mask`): the per-pigment kernels work on these alone. */
  setAct(mask) {
    const list = []; for (let k = 0; k < this.K; k++) if ((mask >>> k) & 1) list.push(k);
    if (list.length === this.act.length && list.every((k, a) => k === this.act[a])) return;
    this.act = list; this.setOptions({});
  }

  /** Copy a whole CPU sheet to the GPU. */
  upload(sheet) {
    const { device: d, b: B, n, K, w, h } = this, put = (buf, arr, off = 0) => d.queue.writeBuffer(buf, off, arr);
    const u32 = a => { const o = new Uint32Array(n); for (let i = 0; i < n; i++) o[i] = a[i]; return o; };
    put(B.W, sheet.W); put(B.S, sheet.s); put(B.M, u32(sheet.M)); put(B.EVER, u32(sheet.ever));
    this.resistMask = sheet.resist ? Uint8Array.from(sheet.resist) : null; this.writeResist();
    for (let k = 0; k < K; k++) { put(B.G, sheet.G[k], k * n * 4); put(B.P, sheet.P[k], k * n * 4); put(B.D, sheet.D[k], k * n * 4); }
    this.hasTop = sheet.layers.length > 0;
    if (this.hasTop) { const top = sheet.layers[sheet.layers.length - 1]; for (let k = 0; k < K; k++) put(B.TOP, top[k], k * n * 4); }
    if (this.o.fixedBed > 0) {
      const bed = sheet.fixedBedLower ?? new Float32Array(n);
      if (!sheet.fixedBedLower) for (const layer of sheet.layers.slice(0,-1)) for (const plane of layer) for (let i=0;i<n;i++) bed[i] += plane[i];
      put(B.DEP, bed, n * 8);
    }
    this.setOptions({});
    // wet tiles: any cell wet or holding pore water
    const fl = new Uint32Array(2 * this.ntiles + 1), cap = sheet.paper.capacity;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (sheet.M[i] || sheet.s[i] > 0.02 * cap[i]) fl[((y / TILE) | 0) * this.tw + ((x / TILE) | 0)] = 1; }
    if (this.resident) for (let t = 0; t < this.ntiles; t++) if (fl[t]) fl[this.ntiles + fl[2 * this.ntiles]++] = t;
    put(B.FLAGS2, fl);
    if (this.resident) {
      const dirty = new Uint32Array(3 * this.ntiles + 2), top = sheet.layers.at(-1);
      for (let i = 0; i < n; i++) {
        let any = !!(sheet.ever[i] || sheet.M[i] || sheet.s[i]);
        for (let k = 0; k < K && !any; k++) any = !!(sheet.G[k][i] || sheet.P[k][i] || sheet.D[k][i] || top?.[k][i]);
        if (any) dirty[Math.floor(Math.floor(i / w) / 16) * this.tw + Math.floor((i % w) / 16)] = 1;
      }
      for (let t = 0; t < this.ntiles; t++) if (dirty[t]) dirty[this.ntiles + dirty[3 * this.ntiles]++] = t;
      put(B.FLAGS2, dirty, (2 * this.ntiles + 1) * 4);
    }
    this.gpuAhead = false; this.epoch++; this.knownDry = false;
  }

  /** Encode `steps` steps into one compute pass. */
  encodeSteps(enc, steps) { const pass = this.timestamps.begin(enc, 'encodeSteps'); this.stepsInPass(pass, steps); pass.end(); }
  stepsInPass(pass, steps) {
    const o = this.o, K = this.K, B = this.b;
    const nD = this.cap;
    const go = (name, indirectOffset = 0, dispatch = null) => { if (indirectOffset === 12 && !this.act.length) return; pass.setPipeline(this.p[name]); pass.setBindGroup(0, this.bg[name]); if (dispatch) pass.dispatchWorkgroups(...dispatch); else if (this.persistent && indirectOffset < 24) pass.dispatchWorkgroups(this.workers, indirectOffset === 12 ? this.act.length : 1); else if (this.resident) pass.dispatchWorkgroupsIndirect(B.ARGS, indirectOffset); else pass.dispatchWorkgroups(nD, indirectOffset ? this.act.length : 1); };
    const nT = Math.ceil(this.ntiles / 64);
    const finish = () => { if (this.p.p5c_wetscan) go('p5c_wetscan'); else { go('p5c'); go('wetscan'); } };
    // Once M is empty, no wet front can form without a stamped source. Keep
    // capillary transport and pore drying, but skip the surface-only passes.
    if (this.resident && this.dryS?.dampOnly) {
      for(let s=0;s<steps;s++) {
        if (SPARSE_ALL) go('sparse_all',0,[1]); else { go('sparse_start',0,[1]); go('sparse_build',24); go('tiles_args',0,[1]); }
        if (process.env.GPU_STEP !== 'old' && o.edgeWidth + 1 <= 7) go('cap_sp'); else { go('cap_s'); go('cap_p', 12); }
        go('p5a'); finish();
      }
      return;
    }
    // the fused step (18 dispatches a step; its edge region holds edgeWidth up to 6); GPU_STEP=old: the 29-dispatch step
    if (!(typeof process !== 'undefined' && process.env.GPU_STEP === 'old') && o.edgeWidth + 1 <= 7) {
      for (let s = 0; s < steps; s++) {
        if (this.resident && SPARSE_ALL) go('sparse_all', 0, [1]); else { if (this.resident) { go('sparse_start', 0, [1]); go('sparse_build', 24); } else { go('tiles_prep', 0, [nT]); go('tiles_build', 0, [nT]); } go('tiles_args', 0, [1]); }
        go('edge_phase1');
        for (let it = 0; it < o.flowIters; it++) { go('faces_wsc'); go('pflux_sc'); go(it === 0 ? 'apply_f0' : 'apply_f1'); }
        go('p3a_dep');
        if ((o.slide ?? 0) > 0) { go('slide_out_all'); go('slide_apply_all'); }
        go('cap_sp'); go('p5a'); go('p5b'); finish();
      }
      return;
    }
    for (let s = 0; s < steps; s++) {
      if (this.resident) { go('sparse_start', 0, [1]); go('sparse_build', 24); } else { go('tiles_prep', 0, [nT]); go('tiles_build', 0, [nT]); } go('tiles_args', 0, [1]);
      go('edge_first'); for (let r = 1; r < o.edgeWidth + 1; r++) go(r % 2 ? 'edge_b2a' : 'edge_a2b');
      go('phase1');
      for (let it = 0; it < o.flowIters; it++) {
        go('faces'); go('wsc'); if (K) { go('pflux_k', 12); go('ppout', 12); }
        go(it === 0 ? 'apply_w0' : 'apply_w1'); if (K) go('apply_g', 12);
      }
      go('p3a');
      if ((o.slide ?? 0) > 0) { go('dep_k'); go('slide_out', 12); go('slide_apply', 12); }
      go('cap_s'); go('cap_p', 12); go('p5a'); go('p5b'); finish();
    }
  }

  /**
   * Lay one planned stroke: the brush's steps in order, the sheet's flow after each step the plan flags (a count of flows
   * in the step record's word 15), then the lift-off. `data` is the plan (Float32Array, ints bitcast), `planFloats` the
   * floats before the steps, `rect` the box the stroke can touch. Returns the floats before the steps as they stand
   * after it (header, hairs, belly) for the brush to take back.
   */
  async strokePrefixDiagnostic(data,info,request) {
    if(process.env.GPU_STROKE_PREFIX_CHECK!=='1')throw Error('Stroke-prefix diagnostic disabled');
    return runStrokePrefixDiagnostic(this,data,info,request);
  }
  async runStroke(data, { planFloats, nSteps, sp, s0, rect, lift, cont, h0, slot, seq, state, restore }) {
    if (this.batch && slot !== undefined) return this.queueStroke(data, { planFloats, nSteps, sp, s0, rect, lift, cont, h0, slot, seq, state, restore });
    const d = this.device, U32 = new Uint32Array(data.buffer, data.byteOffset, data.length);
    if (data.length > this.SB) throw new Error('GpuSheet: the stroke plan is too long');
    // A stroke that carries straight on from the last one leaves the generator's two words (22, 23) as that one left them,
    // and, with cont 2, the hairs, belly and pool (words h0 up to s0) too.
    const wr = (from, to) => { if (to > from) d.queue.writeBuffer(this.b.BSTR, from * 4, data, from, to - from); };
    if (cont === 2) { wr(0, 22); wr(24, h0); wr(s0, data.length); }
    else if (cont === 1) { wr(0, 22); wr(24, data.length); }
    else wr(0, data.length);
    this.bumpFor(rect); this.gpuAhead = true;
    if (globalThis.GPU_PROF) return this.runStrokeProf(data, { planFloats, nSteps, sp, s0, lift });
    const enc = d.createCommandEncoder(), pass = this.timestamps.begin(enc, 'runStroke');
    const run = () => { pass.setPipeline(this.p[data[35]>0?'stroke_run_full':'stroke_run']); pass.setBindGroup(0, this.bg.stroke_run); pass.dispatchWorkgroups(1); };
    let done = 0;
    for (let s = 0; s < nSteps; s++) {
      const flows = U32[s0 + s * sp + 6];
      if (!flows && s < nSteps - 1) continue;
      run(); done = s + 1;
      for (let q = 0; q < flows; q++) this.stepsInPass(pass, 1);
    }
    if (lift) { pass.setPipeline(this.p.stroke_end); pass.setBindGroup(0, this.bg.stroke_end); pass.dispatchWorkgroups(1); }
    pass.end();
    // the brush's state (header, hairs, belly) is copied to a staging buffer behind the stroke and read when it lands
    const bytes = planFloats * 4, rb = d.createBuffer({ size: Math.max(16, bytes), usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    enc.copyBufferToBuffer(this.b.BSTR, 0, rb, 0, bytes);
    d.queue.submit([enc.finish()]);
    this.readCountLater(false);
    if (globalThis.GPU_CAP_DEBUG) { const c = await this.counters(); if (c[4]) console.error(`gpu: a step in a stroke saw ${c[4]} active tiles with room for ${this.cap}`); d.queue.writeBuffer(this.b.CTR, 16, new Uint32Array([0])); }
    await rb.mapAsync(GPUMapMode.READ, 0, bytes);
    const out = new Float32Array(rb.getMappedRange(0, bytes).slice(0)); rb.destroy(); return out;
  }

  // Uploads live in the command stream, so a later plan cannot overwrite BSTR before
  // an earlier dispatch reads it. Brush results stay in a GPU ring until requested.
  queueStroke(data, info) {
    const { planFloats, nSteps, sp, s0, rect, lift, cont, h0, slot, seq, state, restore } = info;
    if (data.length > this.SB || planFloats > 6144) throw new Error('stroke exceeds GPU slot');
    const d = this.device, U = new Uint32Array(data.buffer, data.byteOffset, data.length);
    const enc = this.batchEncoder ??= d.createCommandEncoder();
    const src = d.createBuffer({size: data.byteLength, usage: GPUBufferUsage.COPY_SRC, mappedAtCreation: true});
    new Float32Array(src.getMappedRange()).set(data); src.unmap();
    if(restore!==undefined) {
      const prev=this.brushSlots.get(restore); if(!prev) throw new Error('missing resident brush');
      enc.copyBufferToBuffer(prev.buffer,22*4,this.b.BSTR,22*4,8);
      if(cont===2) enc.copyBufferToBuffer(prev.buffer,h0*4,this.b.BSTR,h0*4,(s0-h0)*4);
    }
    const cp = (a,b) => { if (b>a) enc.copyBufferToBuffer(src,a*4,this.b.BSTR,a*4,(b-a)*4); };
    if (cont === 2) { cp(0,22); cp(24,h0); cp(s0,data.length); }
    else if (cont === 1) { cp(0,22); cp(24,data.length); }
    else cp(0,data.length);
    const serial=data[34]>0 && process.env.GPU_METERED_SERIAL!=='0';
    const kernel=(serial?'stroke_metered':'stroke_run')+(data[35]>0?'_full':'');
    const pass = this.timestamps.begin(enc, serial?'meteredStroke':'queueStroke');
    for (let s=0;s<nSteps;s++) {
      const flows=U[s0+s*sp+6]; if (!flows && s<nSteps-1) continue;
      pass.setPipeline(this.p[kernel]); pass.setBindGroup(0,this.bg[kernel]); pass.dispatchWorkgroups(1);
      if (flows) this.stepsInPass(pass,flows);
    }
    if(lift) { pass.setPipeline(this.p.stroke_end); pass.setBindGroup(0,this.bg.stroke_end); pass.dispatchWorkgroups(1); }
    pass.end();
    const saved = this.brushBuffer(state, planFloats * 4);
    enc.copyBufferToBuffer(this.b.BSTR,0,saved.buffer,0,planFloats*4);
    Object.assign(saved,{seq,bytes:planFloats*4});
    this.batchItems.push(src); this.batchBytes=(this.batchBytes??0)+data.byteLength;
    this.epoch++; this.knownDry=false; this.gpuAhead=true;
    if(this.batchItems.length>=32 || this.batchBytes>=8*1024*1024) this.flushStrokes();
    return null;
  }
  brushBuffer(state, bytes) {
    let saved = this.brushSlots.get(state);
    if (!saved || saved.buffer.size < bytes) {
      // Keep an old buffer alive until commands restoring it have been submitted.
      if (saved) this.batchItems.push(saved.buffer);
      saved = { buffer: this.device.createBuffer({ size: Math.max(16, bytes), usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }) };
      this.brushSlots.set(state, saved);
    }
    return saved;
  }
  flushStrokes() {
    if(!this.batchEncoder) return;
    this.device.queue.submit([this.batchEncoder.finish()]); this.batchEncoder=null;
    for(const b of this.batchItems) b.destroy(); this.batchItems=[]; this.batchBytes=0;
  }
  async brushState(state,seq) {
    this.flushStrokes();
    const item=this.brushSlots.get(state);
    if(!item || item.seq!==seq) throw new Error('stale GPU brush slot');
    const readbacks = this.brushReadbacks ??= new BrushReadbacks(this.device);
    return readbacks.read(item.buffer, item.bytes);
  }

  // GPU_PROF: the same stroke with the brush's runs and the flows between them submitted and waited for one at a time, so the
  // GPU's time splits into brush and flow (each submit adds its own small latency to both)
  async runStrokeProf(data, { planFloats, nSteps, sp, s0, lift }) {
    const d = this.device, U32 = new Uint32Array(data.buffer, data.byteOffset, data.length), P = globalThis.GPU_PROF;
    const book = (k, t, n = 1) => { const e = P[k] ??= { ms: 0, n: 0 }; e.ms += performance.now() - t; e.n += n; };
    const one = async (fn) => { const enc = d.createCommandEncoder(), pass = this.timestamps.begin(enc, 'runStrokeProf'); fn(pass); pass.end(); d.queue.submit([enc.finish()]); await d.queue.onSubmittedWorkDone(); };
    let brushSteps = 0, last = 0; P._lastBrushMs = 0;
    for (let s = 0; s < nSteps; s++) {
      const flows = U32[s0 + s * sp + 6];
      if (!flows && s < nSteps - 1) continue;
      let t = performance.now();
      await one(pass => { pass.setPipeline(this.p[data[35]>0?'stroke_run_full':'stroke_run']); pass.setBindGroup(0, this.bg.stroke_run); pass.dispatchWorkgroups(1); });
      P._lastBrushMs += performance.now() - t; book('brush', t, s + 1 - last); brushSteps += s + 1 - last; last = s + 1;
      if (flows) { t = performance.now(); await one(pass => this.stepsInPass(pass, flows)); book('strokeFlow', t, flows); const e = P.strokeFlowTiles ??= { ms: 0, n: 0 }; e.n += flows * this.cap; }
    }
    { // by the brush's hair count: where the brush's time goes (cells from the plan's cell block: a table of lanes + 1 words a step, two words a cell)
      const lanes = U32[0], cells = (U32[33] - U32[31] - nSteps * (lanes + 1)) / 2, b = lanes <= 16 ? 'h16' : lanes <= 32 ? 'h32' : lanes <= 64 ? 'h64' : lanes <= 128 ? 'h128' : 'hbig';
      const e = (P.brushBy ??= {})[b] ??= { ms: 0, steps: 0, cells: 0, n: 0 }; e.ms += P._lastBrushMs ?? 0; e.steps += nSteps; e.cells += cells; e.n++;
    }
    const t = performance.now(), bytes = planFloats * 4, rb = d.createBuffer({ size: Math.max(16, bytes), usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = d.createCommandEncoder();
    if (lift) { const pass = this.timestamps.begin(enc, 'runStrokeProf'); pass.setPipeline(this.p.stroke_end); pass.setBindGroup(0, this.bg.stroke_end); pass.dispatchWorkgroups(1); pass.end(); }
    enc.copyBufferToBuffer(this.b.BSTR, 0, rb, 0, bytes); d.queue.submit([enc.finish()]);
    this.readCountLater(false);
    await rb.mapAsync(GPUMapMode.READ, 0, bytes); book('strokeEnd', t);
    const out = new Float32Array(rb.getMappedRange(0, bytes).slice(0)); rb.destroy(); return out;
  }

  /** Lay planned splats, the flows between them where the plan says, and return the brush's water left ([W]). */
  async runSplat(data, info) {
    if (this.batch) return this.queueSplat(data, info);
    const { nRec, offRec, flowsBefore, rect } = info;
    this.flushStrokes();
    const d = this.device, U32 = new Uint32Array(data.buffer, data.byteOffset, data.length);
    if (data.length > this.SB) throw new Error('GpuSheet: the splat plan is too long');
    d.queue.writeBuffer(this.b.BSTR, 0, data);
    this.bumpFor(rect); this.gpuAhead = true;
    const enc = d.createCommandEncoder(), pass = this.timestamps.begin(enc, 'runSplat');
    for (let q = 0; q < flowsBefore; q++) this.stepsInPass(pass, 1);
    for (let s = 0; s < nRec; s++) {
      const flows = U32[offRec + 6 * s + 5];
      if (!flows && s < nRec - 1) continue;
      pass.setPipeline(this.p.splat_run); pass.setBindGroup(0, this.bg.splat_run); pass.dispatchWorkgroups(1);
      for (let q = 0; q < flows; q++) this.stepsInPass(pass, 1);
    }
    pass.end();
    const rb = d.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    enc.copyBufferToBuffer(this.b.BSTR, 0, rb, 0, 16); d.queue.submit([enc.finish()]);
    this.readCountLater(false);
    await rb.mapAsync(GPUMapMode.READ); const out = new Float32Array(rb.getMappedRange().slice(0)); rb.unmap(); rb.destroy();
    return new Float32Array([out[3]]);
  }

  queueSplat(data, { nRec, offRec, flowsBefore, state, restore, seq }) {
    if (data.length > this.SB) throw new Error('GpuSheet: the splat plan is too long');
    const d = this.device, words = new Uint32Array(data.buffer, data.byteOffset, data.length);
    const enc = this.batchEncoder ??= d.createCommandEncoder();
    const src = d.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.COPY_SRC, mappedAtCreation: true });
    new Float32Array(src.getMappedRange()).set(data); src.unmap();
    enc.copyBufferToBuffer(src, 0, this.b.BSTR, 0, data.byteLength);
    if (restore !== undefined) {
      const prev = this.brushSlots.get(restore); if (!prev) throw new Error('missing resident splat brush');
      enc.copyBufferToBuffer(prev.buffer, 12, this.b.BSTR, 12, 4);
    }
    const pass = this.timestamps.begin(enc, 'queueSplat');
    if (flowsBefore) this.stepsInPass(pass, flowsBefore);
    for (let s = 0; s < nRec; s++) {
      const flows = words[offRec + 6 * s + 5];
      if (!flows && s < nRec - 1) continue;
      pass.setPipeline(this.p.splat_run); pass.setBindGroup(0, this.bg.splat_run); pass.dispatchWorkgroups(1);
      if (flows) this.stepsInPass(pass, flows);
    }
    pass.end();
    const saved = this.brushBuffer(state, 16);
    enc.copyBufferToBuffer(this.b.BSTR, 0, saved.buffer, 0, 16);
    Object.assign(saved, { seq, bytes: 16 });
    this.batchItems.push(src); this.batchBytes = (this.batchBytes ?? 0) + data.byteLength;
    this.epoch++; this.knownDry = false; this.gpuAhead = true;
    if (this.batchItems.length >= 32 || this.batchBytes >= 8 * 1024 * 1024) this.flushStrokes();
    return null;
  }

  setCap(cap) {
    this.cap = (typeof process !== 'undefined' && process.env.GPU_FULLCAP) ? this.ntiles : Math.max(1, Math.min(this.ntiles, Math.ceil(cap)));
    this.device.queue.writeBuffer(this.b.U, UOFF.cap, new Uint32Array([this.cap]));
  }
  // Direct dispatches are cheaper than indirect ones (Dawn validates indirect arguments with an extra pass), so the host
  // sizes them from the last tile count it read back, with room for growth; the shader flags an undersized dispatch.
  noteCount(count) {
    this.lastCount = count;
    const want = count * 1.5 + 16 + 3 * Math.sqrt(count);
    this.setCap(this.hold > 0 ? Math.max(this.cap, want) : want);
  }
  // `canDry` false: the count only sizes the next dispatches. Read at a brush stroke, it predates paint laid past the
  // stroke's last flow step, so "nothing wet" there must not skip later steps.
  readCountLater(canDry = true) {
    if (this.resident) return;
    if (this.pending) return; this.pending = true;
    const d = this.device, rb = this.cbuf ?? (this.cbuf = d.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }));
    const enc = d.createCommandEncoder(); enc.copyBufferToBuffer(this.b.CTR, 0, rb, 0, 16); d.queue.submit([enc.finish()]);
    const epoch = this.epoch;
    rb.mapAsync(GPUMapMode.READ).then(() => { const v = new Uint32Array(rb.getMappedRange(0, 16).slice(0)); rb.unmap(); this.pending = false; if (this.hold > 0) this.hold--; this.noteCount(v[0]); if (canDry && v[1] === 0 && epoch === this.epoch) this.knownDry = true; }, () => { this.pending = false; });
  }
  step(steps = 1, chunk = 20) {
    this.flushStrokes();
    for (let done = 0; done < steps;) {
      const enc = this.device.createCommandEncoder(), k = Math.min(chunk, steps - done);
      this.encodeSteps(enc, k); this.device.queue.submit([enc.finish()]); done += k;
    }
    this.readCountLater(); this.gpuAhead = true;
  }
  /**
   * Advance `steps` steps: the active tile count is read back every `chunk` steps and sizes the
   * next chunk, as dry() does. A bare step(n) never yields, so its readback cannot land and every step of a long batch would
   * dispatch for the whole sheet (about 1.1 ms a step on an empty one). Short batches take the plain path.
   */
  async advance(steps, chunk = 25) {
    if (this.resident) { this.step(steps, chunk); return; }
    if (this.knownDry) return; // nothing wet and nothing written since: a step changes nothing (the CPU sheet returns early too)
    if (steps <= chunk) { this.step(steps, chunk); return; }
    for (let done = 0; done < steps; done += chunk) {
      this.step(Math.min(chunk, steps - done), chunk);
      const c = await this.counters(); this.noteCount(c[0]);
      if (globalThis.GPU_PROF) { const f = globalThis.GPU_PROF.advanceTiles ??= { ms: 0, n: 0 }; f.n += Math.min(chunk, steps - done) * c[0]; }
      if (c[1] === 0) { this.knownDry = true; return; }
    }
  }
  async idle() { this.flushStrokes(); await this.device.queue.onSubmittedWorkDone(); }

  async readWords(name, byteLength, offset = 0) {
    this.flushStrokes();
    const d = this.device, rb = d.createBuffer({ size: Math.max(16, byteLength), usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = d.createCommandEncoder(); enc.copyBufferToBuffer(this.b[name], offset, rb, 0, byteLength); d.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ); const out = rb.getMappedRange().slice(0); rb.destroy(); return out;
  }
  /** [active tile count of the last step, wet tile count after it, largest face depth difference (if level_k ran)] */
  // one staging buffer kept for it: a dry reads the counters every 25 steps
  async counters() {
    this.flushStrokes();
    if (this.ctrBusy) return new Uint32Array(await this.readWords('CTR', 32));
    const d = this.device, rb = this.ctrRb ?? (this.ctrRb = d.createBuffer({ size: 32, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }));
    this.ctrBusy = true;
    try {
      const enc = d.createCommandEncoder(); enc.copyBufferToBuffer(this.b.CTR, 0, rb, 0, 32); d.queue.submit([enc.finish()]);
      await rb.mapAsync(GPUMapMode.READ); const out = new Uint32Array(rb.getMappedRange().slice(0)); rb.unmap(); return out;
    } finally { this.ctrBusy = false; }
  }

  /** Copy the GPU state back into a CPU sheet (fields the step changes). */
  async download(sheet) {
    const { n, K } = this;
    const f32 = async (name, k = 0) => new Float32Array(await this.readWords(name, n * 4, k * n * 4));
    const u32 = async name => new Uint32Array(await this.readWords(name, n * 4));
    sheet.W.set(await f32('W')); sheet.s.set(await f32('S'));
    const M = await u32('M'), E = await u32('EVER'); for (let i = 0; i < n; i++) { sheet.M[i] = M[i]; sheet.ever[i] = E[i]; }
    for (let k = 0; k < K; k++) { sheet.G[k].set(await f32('G', k)); sheet.P[k].set(await f32('P', k)); sheet.D[k].set(await f32('D', k)); }
    if (this.hasTop) { const top = sheet.layers[sheet.layers.length - 1]; for (let k = 0; k < K; k++) top[k].set(await f32('TOP', k)); }
    sheet.wetDirty = 1; this.gpuAhead = false;
  }

  planes() { return 4 + 3 * this.K; }
  ensurePack(area) {
    const need = area * this.planes() * 4;
    if (this.b.PACK && this.b.PACK.size >= need) return;
    if (this.b.PACK) this.b.PACK.destroy();
    // a storage binding's size must be a multiple of 4 bytes: need * 1.5 is not when the rectangle's area times the planes is odd
    this.b.PACK = this.device.createBuffer({ size: Math.ceil(Math.max(need * 1.5, 1 << 20) / 4) * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    for (const name of ['pack_rect', 'unpack_rect']) this.bg[name] = this.device.createBindGroup({ layout: this.bgl[name], entries: this.uses[name].map(binding => ({ binding, resource: { buffer: this.bufFor(this.names[binding]) } })) });
  }
  rectPass(enc, name, [x0, y0, rw, rh]) {
    const pass = this.timestamps.begin(enc, 'rectPass'); pass.setPipeline(this.p[name]); pass.setBindGroup(0, this.bg[name]);
    pass.dispatchWorkgroups(Math.ceil(rw / 16), Math.ceil(rh / 16)); pass.end();
  }
  /** Read a rectangle [x0, y0, w, h] into packed planes: W, s, M, ever, G[K], P[K], D[K]. */
  async readRect(rect) {
    this.flushStrokes();
    const [x0, y0, rw, rh] = rect, area = rw * rh, bytes = area * this.planes() * 4, d = this.device;
    this.ensurePack(area); d.queue.writeBuffer(this.b.RC, 0, new Uint32Array([x0, y0, rw, rh]));
    const rb = this.rb && this.rb.size >= bytes ? this.rb : (this.rb?.destroy(), this.rb = d.createBuffer({ size: Math.ceil(Math.max(bytes * 1.5, 1 << 20) / 4) * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }));
    const enc = d.createCommandEncoder(); this.rectPass(enc, 'pack_rect', rect); enc.copyBufferToBuffer(this.b.PACK, 0, rb, 0, bytes); d.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ, 0, bytes); const out = new Float32Array(rb.getMappedRange(0, bytes).slice(0)); rb.unmap(); return out;
  }
  /** Observation only: packed W/s plus required wet-recipient M, no pigment/layer read or simulator arithmetic. */
  async readPaperRect(rect) {
    this.flushStrokes();
    const [x,y,rw,rh]=rect, area=rw*rh, bytes=area*12, d=this.device;
    const rb=this.paperRb&&this.paperRb.size>=bytes?this.paperRb:(this.paperRb?.destroy(),this.paperRb=d.createBuffer({size:Math.max(16,bytes),usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}));
    // pack_rect converts uint32 M to the numeric header readRect uses. One contiguous copy avoids per-row host work.
    this.ensurePack(area);d.queue.writeBuffer(this.b.RC,0,new Uint32Array(rect));
    const enc=d.createCommandEncoder();this.rectPass(enc,'pack_rect',rect);
    enc.copyBufferToBuffer(this.b.PACK,0,rb,0,bytes);d.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ,0,bytes);const result=new Float32Array(rb.getMappedRange(0,bytes).slice(0));rb.unmap();return result;
  }
  /** Write packed planes back (the layout readRect returns) and flag the tiles that hold water. */
  async ensureUploadMetadata() {
    if (this.b.UPLOAD_META) return;
    if (process.env.GPU_DEMAND_READBACK === '0') throw new Error('GPU demand readback is disabled');
    if (this.demandSetup) return this.demandSetup;
    this.demandSetupCount=(this.demandSetupCount??0)+1;
    this.demandSetup=(async()=>{
      const generation=this.allocationGeneration,B=this.b,d=this.device,name='upload_metadata_rect',info=analyse(this.demandShaderSource),kind=Object.fromEntries(info.decl.map(x=>[x.binding,x.kind]));
      const use=[0,...info.uses(name).filter(b=>b!==0)];
      const buffer=d.createBuffer({size:16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
      try {
        const module=d.createShaderModule({code:this.demandShaderSource});
        const layout=d.createBindGroupLayout({entries:use.map(binding=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:kind[binding]==='uniform'?'uniform':kind[binding]==='storage, read'?'read-only-storage':'storage'}}))});
        const descriptor={label:name,layout:d.createPipelineLayout({bindGroupLayouts:[layout]}),compute:{module,entryPoint:name}};
        const pipeline=await d.createComputePipelineAsync(descriptor);
        if(this.allocationGeneration!==generation||this.b!==B||this.device!==d)throw new Error('GPU demand metadata allocation changed during setup');
        B.UPLOAD_META=buffer;
        const group=d.createBindGroup({layout,entries:use.map(binding=>({binding,resource:{buffer:this.bufFor(this.names[binding])}}))});
        this.uses[name]=use;this.bgl[name]=layout;this.p[name]=pipeline;this.bg[name]=group;
      }catch(error){if(B.UPLOAD_META===buffer)delete B.UPLOAD_META;buffer.destroy();throw error;}
    })();
    return this.demandSetup;
  }
  async uploadMetadata(rect) {
    await this.ensureUploadMetadata();
    this.flushStrokes();
    const d = this.device;
    d.queue.writeBuffer(this.b.RC, 0, new Uint32Array(rect));
    const enc = d.createCommandEncoder();
    enc.clearBuffer(this.b.UPLOAD_META);
    this.rectPass(enc, 'upload_metadata_rect', rect);
    d.queue.submit([enc.finish()]);
    // synchronous by design; the counter buffer is not reused
    const words = new Uint32Array(await this.readWords('UPLOAD_META', 8));
    return { mask: words[0], signedZero: words[1] !== 0 };
  }
  writeRect(rect, packed, logicalRect = null) {
    this.flushStrokes();
    const d = this.device;
    if (rect) {
      this.ensurePack(rect[2] * rect[3]); d.queue.writeBuffer(this.b.RC, 0, new Uint32Array(rect)); d.queue.writeBuffer(this.b.PACK, 0, packed);
      const enc = d.createCommandEncoder(); this.rectPass(enc, 'unpack_rect', rect); d.queue.submit([enc.finish()]);
    }
    if (logicalRect) {
      // the host changed only the payload: mark the logical rectangle's dirty and wet tiles without copying the rest
      d.queue.writeBuffer(this.b.RC, 0, new Uint32Array(logicalRect));
      const enc = d.createCommandEncoder(); this.rectPass(enc, 'mark_rect', logicalRect); d.queue.submit([enc.finish()]);
    }
    this.bumpFor(logicalRect ?? rect);
  }
  /** Pull a rectangle of the GPU state into the CPU sheet. */
  async syncDown(sheet, rect) {
    const [x0, y0, rw, rh] = rect, a = rw * rh, K = this.K, p = await this.readRect(rect), w = sheet.w;
    for (let y = 0; y < rh; y++) {
      const o = (y0 + y) * w + x0, j = y * rw;
      sheet.W.set(p.subarray(j, j + rw), o); sheet.s.set(p.subarray(a + j, a + j + rw), o);
      for (let x = 0; x < rw; x++) { sheet.M[o + x] = p[2 * a + j + x]; sheet.ever[o + x] = p[3 * a + j + x]; }
      for (let k = 0; k < K; k++) {
        sheet.G[k].set(p.subarray((4 + k) * a + j, (4 + k) * a + j + rw), o); sheet.P[k].set(p.subarray((4 + K + k) * a + j, (4 + K + k) * a + j + rw), o); sheet.D[k].set(p.subarray((4 + 2 * K + k) * a + j, (4 + 2 * K + k) * a + j + rw), o);
      }
    }
    sheet.wetDirty = 1;
  }
  /** Push a rectangle of the CPU sheet to the GPU. */
  syncUp(sheet, rect) {
    const [x0, y0, rw, rh] = rect, a = rw * rh, K = this.K, p = new Float32Array(a * this.planes()), w = sheet.w;
    for (let y = 0; y < rh; y++) {
      const o = (y0 + y) * w + x0, j = y * rw;
      p.set(sheet.W.subarray(o, o + rw), j); p.set(sheet.s.subarray(o, o + rw), a + j);
      for (let x = 0; x < rw; x++) { p[2 * a + j + x] = sheet.M[o + x]; p[3 * a + j + x] = sheet.ever[o + x]; }
      for (let k = 0; k < K; k++) { p.set(sheet.G[k].subarray(o, o + rw), (4 + k) * a + j); p.set(sheet.P[k].subarray(o, o + rw), (4 + K + k) * a + j); p.set(sheet.D[k].subarray(o, o + rw), (4 + 2 * K + k) * a + j); }
    }
    this.writeRect(rect, p);
  }
  bumpFor(rect) { this.epoch++; this.knownDry = false; this.hold = 3; this.setCap(this.cap + 1.2 * Math.ceil(rect[2] / 16 + 1) * Math.ceil(rect[3] / 16 + 1)); }

  async resetCounters(...words) { for (const i of words) this.device.queue.writeBuffer(this.b.CTR, i * 4, new Uint32Array([0])); }
  async surfaceLevel() {
    await this.resetCounters(2);
    const enc = this.device.createCommandEncoder();
    const p2 = this.timestamps.begin(enc, 'surfaceLevel'); p2.setPipeline(this.p.level_k); p2.setBindGroup(0, this.bg.level_k); if (this.persistent) p2.dispatchWorkgroups(this.workers); else p2.dispatchWorkgroupsIndirect(this.b.ARGS, 0); p2.end();
    this.device.queue.submit([enc.finish()]);
    const c = await this.counters(); return new Float32Array(c.buffer)[2];
  }
  /** GPU version of sheet.mjs dry(): same schedule (dt, level check every 25 steps, faster time once level). Returns steps taken. */
  async dry(max = 40000, O = this.o, params = {}) { this.dryBegin(max, O, params); await this.dryAdvance(); return this.dryEnd(); }
  // The same dry in parts, so a caller can look at the sheet part way (sheet.mjs dry with onStep): dryBegin, then dryAdvance(t)
  // as often as wanted (each runs until t steps have been taken, the sheet is dry or the limit is reached), then dryEnd. The
  // schedule's decisions fall at the same steps however it is split: the level check at multiples of 25 from `level` on and
  // at levelMax, the faster time from then on.
  dryBegin(max = 40000, O = this.o, { level = 60, levelMax = 4000, levelTol = 0.02, dt = 2, analyticTail = false, allowWet = false } = {}) {
    const oLevel = O.dt ?? 1; this.setOptions({ dt: oLevel });
    if (analyticTail) dt *= FAST_DRY_DT_SCALE;
    this.dryS = { analyticTail, allowWet, t: 0, fast: false, done: false, max, level, levelMax, levelTol, dt, oLevel, fastChunk:fastDryChunk(process.env.GPU_FAST_DRY_CHUNK??50),counterReads:0,counterReadMs:0,fastIterations:0,fastChunks:0 };
  }
  /** Returns { t, done }: steps taken so far, and whether the sheet was found dry (no step after that changes it). */
  async dryAdvance(until = Infinity) {
    const S = this.dryS; let nextSurface = null;
    while (S.t < S.max && S.t < until && !S.done) {
      if (!S.fast && S.t >= S.level && (S.t >= S.levelMax || (S.t % 25 === 0 && (nextSurface ?? await this.surfaceLevel()) < S.levelTol))) { S.fast = true; S.fastAt = S.t; this.setOptions({ dt: S.dt }); }
      let stop = S.max;
      if (!S.fast) {
        if (S.t < S.levelMax) stop = Math.min(stop, S.levelMax);
        stop = Math.min(stop, Math.max(Math.floor(S.t / 25) * 25 + 25, Math.ceil(S.level / 25) * 25));
      } else stop = Math.min(stop, S.t + S.fastChunk);
      const chunk = Math.max(1, Math.min(stop, until) - S.t);
      this.step(chunk, 25); S.t += chunk;if(S.fast){S.fastIterations+=chunk;S.fastChunks++;}
      // fold the next surface-level query into the counter readback; it sees the same post-step state
      const needLevel=this.resident && !S.fast && S.t>=S.level && S.t<S.levelMax && S.t%25===0;
      if(needLevel)this.encodeLevel();
      const readStarted=performance.now(),c = await this.counters();S.counterReads++;S.counterReadMs+=performance.now()-readStarted;this.noteCount(c[0]);
      nextSurface=needLevel?new Float32Array(c.buffer)[2]:null;S.lastCounters=c;S.lastEpoch=this.epoch;
      if (globalThis.GPU_PROF) { const P = globalThis.GPU_PROF, e = P.drySteps ??= { ms: 0, n: 0 }; e.n += chunk; const f = P.dryTiles ??= { ms: 0, n: 0 }; f.n += chunk * c[0]; }
      if (globalThis.DRY_TRACE) console.error(`dry t=${S.t} count=${c[0]} wet=${c[1]} cap=${this.cap} ${(performance.now() - (this._t0 ??= performance.now())).toFixed(0)}ms`);
      if (process.env.DRY_TRACE2) (S.hist??=[]).push(S.t+":"+c[0]+":"+c[1]+":"+new Float32Array(c.buffer)[7].toExponential(1));
      if (this.resident && c[6] === 0 && process.env.GPU_DAMP !== '0') { if(!S.dampOnly) S.dampAt=S.t; S.dampOnly = true; }
      if (S.analyticTail && S.fast && until === Infinity && new Float32Array(c.buffer, c.byteOffset, c.length)[7] <= 3 * this.o.wetEps) {
        this.setOptions({ dt: Math.max(S.dt, 140) }); S.adaptiveUsed = true;
      }
      if (S.analyticTail && until === Infinity && (new Float32Array(c.buffer, c.byteOffset, c.length)[7] <= this.o.wetEps)) {
        const e = this.device.createCommandEncoder(), pass = this.timestamps.begin(e, 'quiet-dry-tail');
        pass.setPipeline(this.p.quiet_dry_tail); pass.setBindGroup(0, this.bg.quiet_dry_tail);
        pass.dispatchWorkgroups(Math.ceil(this.n / 256)); pass.end();
        const clear = this.timestamps.begin(e, 'quiet-dry-clear');
        clear.setPipeline(this.p.quiet_dry_clear); clear.setBindGroup(0, this.bg.quiet_dry_clear);
        clear.dispatchWorkgroups(Math.ceil(this.n / 256)); clear.end(); this.device.queue.submit([e.finish()]);
        this.epoch++; S.lastEpoch = -1; S.done = true;
        S.analyticTailUsed = true;
        if (globalThis.GPU_PROF) { const entry = globalThis.GPU_PROF.quietDryTail ??= {ms:0,n:0}; entry.n++; }
      }
      if (c[1] === 0) S.done = true;
    }
    return { t: S.t, done: S.done };
  }
  /** sheet.mjs evaporateInPlace: the water left stands where it is and dries there (a dry past its limit, sent with allowWet). */
  evaporateInPlace() {
    const e = this.device.createCommandEncoder(), pass = this.timestamps.begin(e, 'quiet-dry-tail');
    pass.setPipeline(this.p.quiet_dry_tail); pass.setBindGroup(0, this.bg.quiet_dry_tail); pass.dispatchWorkgroups(Math.ceil(this.n / 256)); pass.end();
    const clear = this.timestamps.begin(e, 'quiet-dry-clear');
    clear.setPipeline(this.p.quiet_dry_clear); clear.setBindGroup(0, this.bg.quiet_dry_clear); clear.dispatchWorkgroups(Math.ceil(this.n / 256)); clear.end();
    this.device.queue.submit([e.finish()]); this.epoch++;
  }
  /** level_k once the last step is done, its maximum into CTR[2] (SheetView pends it behind its batched steps). */
  encodeLevel(){const e=this.device.createCommandEncoder();e.clearBuffer(this.b.CTR,8,4);const pass=this.timestamps.begin(e,'dry-level');pass.setPipeline(this.p.level_k);pass.setBindGroup(0,this.bg.level_k);if(this.persistent)pass.dispatchWorkgroups(this.workers);else pass.dispatchWorkgroupsIndirect(this.b.ARGS,0);pass.end();this.device.queue.submit([e.finish()]);}
  async dryEnd() {
    const S = this.dryS; this.dryS = null;
    if (process.env.DRY_TRACE2) { const z=new Uint32Array(await this.readWords("CTR",64)); console.error(`CUM tileSteps=${z[8]} mTileSteps=${z[9]} steps=${z[10]} wetTileSteps=${z[11]}`); }
    if (process.env.DRY_TRACE2) console.error(`DRYT t=${S.t} fastAt=${S.fastAt} level=${S.level} levelMax=${S.levelMax} dt=${S.dt} tail=${S.analyticTail} tailUsed=${!!S.analyticTailUsed} adaptive=${!!S.adaptiveUsed} damp=${!!S.dampOnly} dampAt=${S.dampAt} cnt=${S.lastCounters?.[0]} hist=${(S.hist??[]).join(",")}`);
    let c;if(this.resident&&S.lastCounters&&S.lastEpoch===this.epoch)c=S.lastCounters;else{const readStarted=performance.now();c=await this.counters();S.counterReads++;S.counterReadMs+=performance.now()-readStarted;} this.lastStillWet = 0; if (c[1] !== 0) { if (!S.allowWet) throw new Error(`Sheet is still wet after dry() limit of ${S.max} steps`); this.lastStillWet = c[1]; this.evaporateInPlace(); }
    this.setOptions({ dt: S.oLevel });
    const m=this.dryTelemetry??(this.dryTelemetry={calls:0,counterReads:0,counterReadMs:0,fastIterations:0,fastChunks:0});m.calls++;m.counterReads+=S.counterReads;m.counterReadMs+=S.counterReadMs;m.fastIterations+=S.fastIterations;m.fastChunks+=S.fastChunks;m.fastChunk=S.fastChunk;m.lastWetCounter=c[1];m.analyticTailCalls=(m.analyticTailCalls??0)+(S.analyticTailUsed?1:0);
    return S.t;
  }
  /**
   * sheet.mjs fix(): pores into the deposit, then the deposit becomes the top dried layer. When there was a top layer its
   * final contents go to `topOut` (K planes of n floats). Returns { hadTop, pushed }.
   */
  async fix(topOut = null, topMask = undefined, deferTop = false) {
    await this.resetCounters(3, 5);
    const d = this.device, enc = d.createCommandEncoder(), pass = this.timestamps.begin(enc, 'fix');
    if (this.resident) { pass.setPipeline(this.p.fix_args); pass.setBindGroup(0, this.bg.fix_args); pass.dispatchWorkgroups(1); }
    pass.setPipeline(this.p.fix_a); pass.setBindGroup(0, this.bg.fix_a);
    if (this.resident) pass.dispatchWorkgroupsIndirect(this.b.ARGS, 36); else pass.dispatchWorkgroups(Math.ceil(this.w / 16), Math.ceil(this.h / 16)); pass.end();
    d.queue.submit([enc.finish()]);
    const cf = await this.counters();
    if (cf[3] === 0) return { hadTop: false, pushed: false };
    this.topMask = cf[5]; // the pigments in the layer being fixed: all that is left on the sheet once it has dried
    const hadTop = this.hasTop;
    if (this.optical) {
      // Only resident fix_args prepares the sparse tile list and indirect dispatch.
      // Ordinary fix still archives a complete TOP layer; compose it in full.
      if (hadTop && this.opticalCount > 1) this.optical.append(this.b.TOP, this.resident ? {sparse:true,flags:this.b.FLAGS2,args:this.b.ARGS} : {});
      this.opticalCount++;
    }
    // the superseded layer's planes, only those of the pigments it holds (`topMask`, the link's; the others are zero)
    if (hadTop && topOut) await this.readTop(topOut, topMask);
    const e2 = d.createCommandEncoder();
    let archive = 0;
    if (hadTop && deferTop) {
      const ks = []; for (let k = 0; k < this.K; k++) if (topMask === undefined || (topMask >>> k) & 1) ks.push(k);
      const bytes = Math.max(16, ks.length * this.n * 4);
      const buffer = d.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
      ks.forEach((k, q) => e2.copyBufferToBuffer(this.b.TOP, k * this.n * 4, buffer, q * this.n * 4, this.n * 4));
      archive = ++this.archiveSequence; this.archives.set(archive, { buffer, ks });
    }
    const p2 = this.timestamps.begin(e2, 'fix');
    p2.setPipeline(this.p.fix_b); p2.setBindGroup(0, this.bg.fix_b);
    if (this.resident) p2.dispatchWorkgroupsIndirect(this.b.ARGS, 36); else p2.dispatchWorkgroups(Math.ceil(this.w / 16), Math.ceil(this.h / 16)); p2.end();
    if (this.resident) {
      // Copy only tile metadata, never full sheet fields. A temporary buffer is
      // needed because WebGPU does not allow copying a buffer onto itself.
      const tmp = this.fixQueue ??= d.createBuffer({ size: (this.ntiles + 1) * 4, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
      e2.copyBufferToBuffer(this.b.FLAGS2, (4 * this.ntiles + 1) * 4, tmp, 0, this.ntiles * 4);
      e2.copyBufferToBuffer(this.b.FLAGS2, (5 * this.ntiles + 2) * 4, tmp, this.ntiles * 4, 4);
      e2.copyBufferToBuffer(tmp, 0, this.b.FLAGS2, (3 * this.ntiles + 1) * 4, this.ntiles * 4);
      e2.copyBufferToBuffer(tmp, this.ntiles * 4, this.b.FLAGS2, (5 * this.ntiles + 1) * 4, 4);
    }
    d.queue.submit([e2.finish()]);
    this.hasTop = true; this.setOptions({});
    return { hadTop, pushed: true, topMask: cf[5], archive };
  }
  /** Bring down an immutable lower layer only when a CPU consumer needs it. */
  async readArchive(id, out) {
    this.flushStrokes();
    const item = this.archives.get(id); if (!item) throw new Error(`Unknown GPU layer ${id}`);
    const d = this.device, bytes = item.buffer.size;
    const rb = d.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = d.createCommandEncoder(); enc.copyBufferToBuffer(item.buffer, 0, rb, 0, bytes); d.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(rb.getMappedRange());
    item.ks.forEach((k, q) => out.set(data.subarray(q * this.n, (q + 1) * this.n), k * this.n));
    rb.unmap(); rb.destroy(); item.buffer.destroy(); this.archives.delete(id);
  }

  /** Read immutable layers in one bounded transfer, retaining their exact CPU contents. */
  async readArchives(ids, out) {
    this.flushStrokes();
    const items = ids.map(id => { const item = this.archives.get(id); if (!item) throw new Error("Unknown GPU layer " + id); return item; });
    const bytes = items.reduce((n, item) => n + item.ks.length * this.n * 4, 0);
    if (bytes) {
      const d = this.device, rb = d.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = d.createCommandEncoder(); let offset = 0;
      for (const item of items) { const size = item.ks.length * this.n * 4; if (size) enc.copyBufferToBuffer(item.buffer, 0, rb, offset, size); offset += size; }
      d.queue.submit([enc.finish()]);
      await rb.mapAsync(GPUMapMode.READ); out.set(new Float32Array(rb.getMappedRange()));
      rb.unmap(); rb.destroy();
    }
    for (const id of ids) { this.archives.get(id).buffer.destroy(); this.archives.delete(id); }
  }

  /** One transfer for all requested top-layer planes, instead of a round trip per pigment. */
  async readTop(out, mask = undefined) {
    this.flushStrokes();
    const d = this.device, pb = this.n * 4, ks = [];
    for (let k = 0; k < this.K; k++) if (mask === undefined || (mask >>> k) & 1) ks.push(k);
    if (!ks.length) return;
    const bytes = ks.length * pb;
    if (!this.topRb || this.topRb.size < bytes) {
      this.topRb?.destroy();
      this.topRb = d.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    }
    const enc = d.createCommandEncoder();
    ks.forEach((k, q) => enc.copyBufferToBuffer(this.b.TOP, k * pb, this.topRb, q * pb, pb));
    d.queue.submit([enc.finish()]);
    await this.topRb.mapAsync(GPUMapMode.READ, 0, bytes);
    const data = new Float32Array(this.topRb.getMappedRange(0, bytes));
    ks.forEach((k, q) => out.set(data.subarray(q * this.n, (q + 1) * this.n), k * this.n));
    this.topRb.unmap();
  }

  /** Pack TOP rows into pigment-major regional planes. */
  async readTopRect(out, rect, mask = undefined) {
    this.flushStrokes();
    const [x0, y0, rw, rh] = rect;
    if (!rect.every(Number.isInteger) || x0 < 0 || y0 < 0 || rw < 1 || rh < 1 || x0 + rw > this.w || y0 + rh > this.h) throw new RangeError('invalid top rectangle');
    const d = this.device, a = rw * rh, ks = [];
    for (let k = 0; k < this.K; k++) if (mask === undefined || (mask >>> k) & 1) ks.push(k);
    if (!ks.length) return;
    const bytes = ks.length * a * 4;
    if (!this.topRb || this.topRb.size < bytes) {
      this.topRb?.destroy();
      this.topRb = d.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    }
    const enc = d.createCommandEncoder();
    ks.forEach((k, q) => {
      for (let y = 0; y < rh; y++) enc.copyBufferToBuffer(this.b.TOP, (k * this.n + (y0 + y) * this.w + x0) * 4, this.topRb, (q * a + y * rw) * 4, rw * 4);
    });
    d.queue.submit([enc.finish()]);
    await this.topRb.mapAsync(GPUMapMode.READ, 0, bytes);
    try {
      const data = new Float32Array(this.topRb.getMappedRange(0, bytes));
      ks.forEach((k, q) => out.set(data.subarray(q * a, (q + 1) * a), k * a));
    } finally { this.topRb.unmap(); }
  }

  /** fix() for a CPU sheet whose layer list should follow: the superseded layer is filled in and a placeholder is pushed. */
  async fixInto(sheet) {
    const K = this.K, n = this.n, out = this.hasTop ? new Float32Array(K * n) : null, r = await this.fix(out);
    if (!r.pushed) return;
    if (r.hadTop) { const top = sheet.layers[sheet.layers.length - 1]; for (let k = 0; k < K; k++) top[k].set(out.subarray(k * n, (k + 1) * n)); }
    sheet.layers.push(sheet.pigments.map(() => new Float32Array(n)));
  }
  /**
   * G + D + P per pigment into `out` (K planes of n floats), computed here: a third of what coming down whole would carry.
   * With `mask`, only the planes of those pigments come down (the others hold nothing and are left as they are in `out`).
   */
  async wetSums(out, mask = undefined) {
    this.flushStrokes();
    const d = this.device, K = this.K, n = this.n, bytes = K * n * 4, pb = n * 4;
    const rb = this.sumRb ?? (this.sumRb = d.createBuffer({ size: Math.max(16, bytes), usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }));
    const enc = d.createCommandEncoder(), pass = this.timestamps.begin(enc, 'wetSums');
    pass.setPipeline(this.p.gdp_sum); pass.setBindGroup(0, this.bg.gdp_sum); pass.dispatchWorkgroups(Math.ceil(this.w / 16), Math.ceil(this.h / 16)); pass.end();
    const want = k => mask === undefined || (mask >>> k) & 1;
    for (let k = 0; k < K; k++) if (want(k)) enc.copyBufferToBuffer(this.b.DD, k * pb, rb, k * pb, pb);
    d.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ, 0, bytes);
    const all = new Float32Array(rb.getMappedRange(0, bytes));
    for (let k = 0; k < K; k++) if (want(k)) out.set(all.subarray(k * n, (k + 1) * n), k * n);
    rb.unmap();
  }
  /**
   * What a frame is rendered from, copied out in queue order and read back without holding anything up (framer.mjs): the
   * wet sums (G + D + P) of the pigments in `sumMask`, the top dried layer's planes in `topMask`, and the water if `wantW`,
   * packed in that order. Returns a promise of the Float32Array; the GPU carries on meanwhile.
   */
  snapshot({ sumMask, topMask, wantW }) {
    this.flushStrokes();
    const d = this.device, K = this.K, n = this.n, pb = n * 4;
    const ks = m => { const a = []; for (let k = 0; k < K; k++) if ((m >>> k) & 1) a.push(k); return a; };
    const S = ks(sumMask), T = this.hasTop ? ks(topMask) : [], planes = S.length + T.length + (wantW ? 1 : 0);
    const bytes = Math.max(16, planes * pb), rb = d.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = d.createCommandEncoder();
    if (S.length) { const pass = this.timestamps.begin(enc, 'snapshot'); pass.setPipeline(this.p.gdp_sum); pass.setBindGroup(0, this.bg.gdp_sum); pass.dispatchWorkgroups(Math.ceil(this.w / 16), Math.ceil(this.h / 16)); pass.end(); }
    let at = 0;
    for (const k of S) { enc.copyBufferToBuffer(this.b.DD, k * pb, rb, at, pb); at += pb; }
    for (const k of T) { enc.copyBufferToBuffer(this.b.TOP, k * pb, rb, at, pb); at += pb; }
    if (wantW) { enc.copyBufferToBuffer(this.b.W, 0, rb, at, pb); at += pb; }
    d.queue.submit([enc.finish()]);
    return rb.mapAsync(GPUMapMode.READ).then(() => { const out = new Float32Array(rb.getMappedRange().slice(0, Math.max(4, at))); rb.unmap(); rb.destroy(); return { data: out, sums: S, top: T, hasTop: this.hasTop }; });
  }
  /** Replace the top dried layer (K planes of n floats). */
  uploadTop(planes) {
    if (this.resident) {
      // A CPU layer replacement is an exceptional full upload. Conservatively
      // mark its tiles once; subsequent fixes prune the queue on the GPU.
      const dirty = new Uint32Array(3 * this.ntiles + 1); dirty.fill(1, 0, this.ntiles);
      for (let t = 0; t < this.ntiles; t++) dirty[this.ntiles + t] = t;
      dirty[3 * this.ntiles] = this.ntiles;
      this.device.queue.writeBuffer(this.b.FLAGS2, (2 * this.ntiles + 1) * 4, dirty);
    }
    this.device.queue.writeBuffer(this.b.TOP, 0, planes); this.hasTop = true; this.setOptions({}); }
  /** Replace the masking-fluid mask. */
  setResist(mask) { if(mask && !this.resistMask)this.optical?.beginMask(mask,this.opticalCount>1?this.b.TOP:null);if(!mask && this.resistMask)this.optical?.endMask();this.resistMask = mask ? Uint8Array.from(mask) : null; this.writeResist(); }
  writeResist() {
    this.flushStrokes();
    const u = new Uint32Array(this.n), r = this.resistMask;
    for (let i = 0; i < this.n; i++) u[i] = r && r[i] === 1 ? 1 : 0;
    this.device.queue.writeBuffer(this.b.RESIST, 0, u);
  }

  destroy() { this.allocationGeneration=(this.allocationGeneration??0)+1;this.demandSetup=null; this.optical?.destroy(); this.timestamps.destroy(); this.flushStrokes(); this.fixQueue?.destroy(); this.brushReadbacks?.destroy(); this.topRb?.destroy(); this.paperRb?.destroy(); for(const a of this.archives.values()) a.buffer.destroy(); for(const v of this.brushSlots.values()) v.buffer.destroy(); for (const k of Object.keys(this.b)) this.b[k].destroy(); }
}
