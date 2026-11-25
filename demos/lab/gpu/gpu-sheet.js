// The lab's sheet physics on WebGPU: the whole step and dry() as compute kernels (gpu-wgsl.js), with the sheet resident on
// the GPU. Adapted from src/media/gpu/stepfull.mjs: the WGSL is a module, the
// device comes from navigator.gpu, and nothing blocks (every read is a promise). sheet.js stays the reference and the
// CPU fallback.
import { slideRate, reposeStep } from '../media/grain-field.js';
import { permeability } from '../media/sheet.js';
import { settleSpeed, settleDiffusion } from '../media/settling.js';
import { WGSL } from './gpu-wgsl.js';
import { flowTime, poreTime } from '../media/flow-time.js';
import { EF_RMAX, EF_BMAX } from '../media/gpu/edge-feed-wgsl.js';
import { wetBoxes, edgeGeometry } from '../media/gpu/edge-geometry.js';
import { levelOn, levelBudget, levelBuffers, levelUniforms, encodeLevel, adaptLevel } from '../media/gpu/film-level-host.js';
import { channelList, observeSheetChannels, observePackedChannels } from './gpu-active-channels.js';

const TILE = 16;

/** A device with the limits the kernels need. Throws when there is no WebGPU or no adapter. */
export async function openDevice(gpu = globalThis.navigator?.gpu) {
  if (!gpu) throw new Error('no navigator.gpu');
  const adapter = await gpu.requestAdapter(); if (!adapter) throw new Error('no WebGPU adapter');
  // a software adapter (SwiftShader, llvmpipe) is slower than the CPU physics and can fail mid-painting
  const soft = adapter.info ?? {};
  if (adapter.isFallbackAdapter || soft.isFallbackAdapter || /swiftshader|llvmpipe|lavapipe|software/i.test(`${soft.vendor} ${soft.architecture} ${soft.description}`)) throw new Error('software WebGPU adapter');
  const L = adapter.limits;
  const device = await adapter.requestDevice({ requiredFeatures: adapter.features.has('timestamp-query') ? ['timestamp-query'] : [], requiredLimits: {
    maxStorageBuffersPerShaderStage: Math.min(12, L.maxStorageBuffersPerShaderStage),
    maxStorageBufferBindingSize: L.maxStorageBufferBindingSize, maxBufferSize: L.maxBufferSize,
  } });
  const info = adapter.info ?? {};
  return { adapter, device, name: [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') || 'webgpu' };
}

const UF = [['w', 'u'], ['h', 'u'], ['n', 'u'], ['tw', 'u'], ['th', 'u'], ['ntiles', 'u'], ['K', 'u'], ['hasTop', 'u'], ['holdOn', 'u'], ['cap', 'u'], ['p2', 'u'], ['p3', 'u'],
  ...['dt', 'evap', 'edgeEvap', 'edgeWidth', 'capE', 'absorb', 'film', 'flow', 'ff', 'flowDepth', 'diffuse', 'cd', 'settle', 'liftDepth', 'rewetLift', 'granFill', 'holdCap', 'slide', 'slideFill', 'capStep', 'capEps', 'capDelta', 'sizing', 'wickFilter', 'wetEps', 'paperDry', 'capSigma', 'spill', 'spillHeight', 'dampEase', 'pinning', 'pinFibre',
  'enclose', 'slideCap', 'holeFill', 'padB', 'filmDiff', 'filmDepth', 'holeSpan', 'mar', 'slope', 'padC', 'mmPerCell', 'edgeFlowDepth',
  'toothLo', 'toothSpan', 'hollowUnit', 'groundPhys', 'poreHalo', 'poreReach', 'padTime2', 'lvFloor',
  // the painter's film sheet (media/gpu/film-level-host.js levelUniforms)
  'holdDepth', 'coSettle', 'fillRef', 'lvK0', 'lvTx', 'lvTy', 'lvTan', 'lvDm', 'lvR', 'lvIt', 'lvSubs', 'lvBoxes', 'brC', 'brPush', 'brHead', 'brPad2'].map(k => [k, 'f'])];
const UOFF = Object.fromEntries(UF.map(([k], i) => [k, i * 4]));
const UBYTES = UF.length * 4 + 512 + 64 + 256;
const PRELUDE = `struct U {\n${UF.map(([k, t]) => `  ${k}: ${t === 'u' ? 'u32' : 'f32'},`).join('\n')}\n  pa: array<vec4<f32>, 16>,\n  pb: array<vec4<f32>, 16>,\n  act: array<vec4<u32>, 4>,\n  pc: array<vec4<f32>, 16>,\n}\n@group(0) @binding(0) var<uniform> u: U;\nfn pigA(k: u32) -> vec4<f32> { return u.pa[k]; }\nfn pigB(k: u32) -> vec4<f32> { return u.pb[k]; }\nfn pigC(k: u32) -> vec4<f32> { return u.pc[k]; }\nfn physicalChannel(a: u32) -> u32 { return u.act[a / 4u][a % 4u]; }\n`;
const SRC = PRELUDE + WGSL;

// which bindings each entry point touches, found from the source: its own body plus the helpers it calls
function analyse(src) {
  const decl = [...src.matchAll(/@group\(0\) @binding\((\d+)\) var<([^>]*)> (\w+)/g)].map(m => ({ binding: +m[1], kind: m[2], name: m[3] }));
  const code = src.replace(/^@group\(0\).*$/gm, '').replace(/\/\/.*$/gm, '');
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

// A rectangle buffer with room to grow: half again what is needed, at least a megabyte, and a whole number of 256-byte
// blocks. Half again an odd number of planes (an odd pigment count) is not a multiple of four bytes, and a storage binding
// of that size fails validation, which dropped every stroke written through it.
const roomFor = bytes => Math.ceil(Math.max(bytes * 1.5, 1 << 20) / 256) * 256;

export class GpuSheet {
  /** Compile the kernels once for this device; attach() gives them a sheet. */
  static async create(device, pigments, o) {
    const g = new GpuSheet(); await g.build(device, pigments, o); return g;
  }

  async build(device, pigments, o) {
    if ((o.marangoni ?? 0) !== 0 || (o.slope ?? 0) !== 0) throw new Error('GpuSheet: marangoni and slope must be 0');
    if (pigments.length > 16) throw new Error('GpuSheet: at most 16 pigments');
    const d = device; this.device = d; this.pigments = pigments; this.K = pigments.length; this.o = { ...o };
    const info = analyse(SRC);
    this.kind = Object.fromEntries(info.decl.map(x => [x.binding, x.kind]));
    this.names = Object.fromEntries(info.decl.map(x => [x.binding, x.name]));
    d.pushErrorScope('validation');
    const module = d.createShaderModule({ code: SRC }); this.module = module;
    this.p = {}; this.bgl = {}; this.uses = {};
    for (const name of info.entries) {
      const use = [0, ...info.uses(name).filter(b => b !== 0)]; this.uses[name] = use;
      this.bgl[name] = d.createBindGroupLayout({ entries: use.map(binding => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: this.kind[binding] === 'uniform' ? 'uniform' : this.kind[binding] === 'storage, read' ? 'read-only-storage' : 'storage' } })) });
    }
    const layoutError = await d.popErrorScope(); if (layoutError) throw new Error(layoutError.message);
    d.pushErrorScope('validation');
    // pipelines compile off the main path; a failure surfaces here, not on the first frame
    await Promise.all(info.entries.map(async name => {
      this.p[name] = await d.createComputePipelineAsync({ layout: d.createPipelineLayout({ bindGroupLayouts: [this.bgl[name]] }), compute: { module, entryPoint: name } });
    }));
    const err = await d.popErrorScope(); if (err) throw new Error(`WGSL: ${err.message.slice(0, 300)}`);
    this.entries = info.entries; this.b = null;
  }

  /** Give the kernels a sheet: allocate its buffers, upload the paper and the state. Replaces any earlier sheet. */
  attach(sheet) {
    this.detach();
    const { w, h, n, paper } = sheet, K = this.K, d = this.device;
    this.w = w; this.h = h; this.n = n;
    this.channelMask = 0; // Only fresh buffer allocations may forget historical TOP channels.
    this.tw = Math.ceil(w / TILE); this.th = Math.ceil(h / TILE); this.ntiles = this.tw * this.th;
    const mk = (bytes, usage = 0) => d.createBuffer({ size: Math.max(16, bytes), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST | usage });
    const f = n * 4, B = this.b = {};
    for (const k of ['M', 'EVER', 'RESIST', 'W', 'S', 'S2', 'FX', 'FY', 'WSC', 'WENT', 'DEP', 'NEWF']) B[k] = mk(f);
    for (const k of ['PAPER', 'PAPER2', 'PAPER3']) B[k] = mk(f * 4);
    for (const k of ['G', 'P', 'D', 'TOP', 'QX', 'QY', 'SC', 'OUTM', 'PN', 'DD']) B[k] = mk(f * K);
    B.OUT4 = mk(f * 4 * K);
    B.PIG = mk(this.ntiles * 4);
    B.TL = mk((2 * this.ntiles + 1) * 4); for (const k of ['FLAGS', 'FLAGS2']) B[k] = mk(this.ntiles * 4);
    B.RC = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }); B.CTR = mk(48); B.ARGS = mk(36, GPUBufferUsage.INDIRECT);
    B.U = d.createBuffer({ size: UBYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    B.PACK = d.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE });
    const put = (buf, arr, off = 0) => d.queue.writeBuffer(buf, off, arr);
    // paper: constant for a sheet
    const { px, py } = permeability(paper), P4 = new Float32Array(n * 4), P2 = new Float32Array(n * 4), P3 = new Float32Array(n * 4), hv = paper.surface || paper.valley || paper.height;
    for (let i = 0; i < n; i++) {
      P4.set([paper.capacity[i], paper.grain[i], paper.fdx[i], paper.fdy[i]], i * 4); P2.set([px[i], py[i], 0, 0], i * 4);
      P3.set([paper.tooth[i], HASH(i), hv[i], paper.grainH[i]], i * 4);
    }
    put(B.PAPER, P4); put(B.PAPER2, P2); put(B.PAPER3, P3);
    // settling's hollows are worked out from the tooth and the grain field with these (paper.js toothHollow; the
    // painter's src/media/grain-field.mjs), and the slide's rate and resting step follow the paper's cell (slideRate, reposeStep)
    if (!paper.grainH) throw new Error('GPU sheet: the paper has no grainH (make it with makePaper)');
    this.paperMm = paper.mmPerCell ?? 0;
    if (!(paper.hollowUnit > 0)) throw new Error('GPU sheet: the paper has no hollowUnit (make it with makePaper)');
    this.paperHollow = { toothLo: paper.toothLo, toothSpan: paper.toothSpan, hollowUnit: paper.hollowUnit, physical: !!paper.zUm };
    this.cap = this.ntiles; this.hold = 0; this.epoch = 0; this.knownDry = false; this.hasTop = false;
    this.efAlloc(B);
    // the CPU step's boxes and the film's levelling (media/gpu/film-level-wgsl.js)
    const lvSize = levelBuffers(w, h, n, this.ntiles, true); for (const k of Object.keys(lvSize)) B[k] = mk(lvSize[k]);
    this.lv = levelBudget(); this.tilt = sheet.tilt ?? null;
    this.setOptions({});
    this.bg = {};
    this.bindAll();
    this.upload(sheet);
  }
  detach() {
    this.channelMask = 0; this.act = [];
    this.snapshotRb?.destroy(); this.snapshotRb = null;
    if (!this.b) return;
    for (const k of Object.keys(this.b)) this.b[k].destroy();
    this.b = null; this.rb?.destroy(); this.rb = null;
  }
  bindAll(names = this.entries) {
    for (const name of names) this.bg[name] = this.device.createBindGroup({ layout: this.bgl[name], entries: this.uses[name].map(binding => ({ binding, resource: { buffer: this.bufFor(this.names[binding]) } })) });
  }
  // ---- the pinned-edge feed: geometry on the host (media/gpu/edge-geometry.js), transport in the kernels -----------
  efAlloc(B) {
    const d = this.device, n = this.n, mk = bytes => d.createBuffer({ size: Math.max(16, bytes), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    B.EFL = mk((1 + 2 * n) * 4); B.EFG = mk(n * 16); B.EFS = mk(n * 16); B.EFC = mk(n * 4 * this.K); B.EFB = mk((16 + EF_BMAX * (EF_RMAX + 1)) * 4); B.EFP = mk(Math.ceil(n / 8) * 4);
    this.ef = { count: 0, rounds: 16, key: null, scratch: {}, stale: true };
  }
  get efOn() { return (this.o.edgeEvap ?? 0) > 0 && !!this.b; }
  efPipe(kind, r) {
    const key = `${kind}#${r}`;
    return this.p[key] ??= this.device.createComputePipeline({ layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bgl[kind]] }), compute: { module: this.module, entryPoint: kind, constants: { ROUND: Number(r) } } });
  }
  /** Before queuing steps: whether the footprint moved since the geometry was made (ef_watch), more rounds if a step used them all, and the geometry again where needed. */
  async efReady() {
    if (!this.efOn) return;
    const st = new Uint32Array(await this.readWords('EFB', 20)), ef = this.ef;
    if (st[4]) ef.stale = true;
    if (st[3] > 0.75 * ef.rounds && ef.rounds < EF_RMAX) { ef.rounds = Math.min(EF_RMAX, 2 * ef.rounds); this.device.queue.writeBuffer(this.b.EFB, 4, new Uint32Array([ef.rounds])); }
    if (!ef.stale) return;
    const { n, w, h, o } = this, cap = this.capacity;
    const [Mw, Ew, Sw, Ww] = await Promise.all([this.readWords('M', n * 4), this.readWords('EVER', n * 4), this.readWords('S', n * 4), this.readWords('W', n * 4)]);
    const M = new Uint32Array(Mw), ever = new Uint32Array(Ew), s = new Float32Array(Sw), W = new Float32Array(Ww), mm = o.mmPerCell ?? 0.3;
    const boxes = wetBoxes({ w, h, M, s, capacity: cap }, Math.max(2, this.poreTime.iters));
    if (boxes.length > EF_BMAX) throw new Error(`GPU edge feed: ${boxes.length} wet boxes, more than ${EF_BMAX}`);
    let foot = 0, bx0 = 0xffffffff, by0 = 0xffffffff, bx1 = 0, by1 = 0;
    for (let i = 0; i < n; i++) {
      if (M[i] || ever[i]) foot++;
      if (M[i] || s[i] > 0.02 * cap[i]) { const x = i % w, y = (i / w) | 0; if (x < bx0) bx0 = x; if (y < by0) by0 = y; if (x > bx1) bx1 = x; if (y > by1) by1 = y; }
    }
    const q = this.device.queue;
    q.writeBuffer(this.b.EFB, 16, new Uint32Array([0, 0, 0xffffffff, 0xffffffff, 0, 0, foot, bx0, by0, bx1, by1]));
    ef.stale = false;
    // a box with no surface water has no feed (edgeFeed returns before its geometry); the rest keep their geometry while
    // the footprint in them is the same (edgeFeed's cache)
    const feeding = boxes.filter(([x0, y0, x1, y1]) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (W[y * w + x] > 0) return true; return false; });
    const res = this.resist; let hash = 0x811c9dc5; const mix = v => { hash = Math.imul(hash ^ v, 16777619) >>> 0; };
    for (const [x0, y0, x1, y1] of feeding) { mix(0xb0c5); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * w + x; if (M[i] || ever[i]) mix(res?.[i] ? ~i : i); } }
    const key = `${[mm, o.edgeMm, o.edgeEvap, o.reachMm, o.holeSpan].join(',')}:${feeding.length}:${hash}`;
    if (key === ef.key) return;
    ef.key = key;
    const list = [], G = new Float32Array(4 * n); let b = 0;
    for (const box of feeding) {
      const geo = edgeGeometry({ w, h, M, ever, resist: this.resist }, o, box, mm, ef.scratch);
      if (!geo) continue;
      const { order, ex, fx, fy } = geo;
      for (const i of order) { G[4 * i] = ex[i]; G[4 * i + 1] = fx[i]; G[4 * i + 2] = fy[i]; }
      for (const i of order) {
        if (fx[i] > 0) G[4 * i + 3] += fx[i]; else if (fx[i] < 0) G[4 * (i + 1) + 3] -= fx[i];
        if (fy[i] > 0) G[4 * i + 3] += fy[i]; else if (fy[i] < 0) G[4 * (i + w) + 3] -= fy[i];
      }
      for (const i of order) list.push(i, b);
      b++;
    }
    const L = new Uint32Array(1 + list.length); L[0] = list.length / 2; L.set(list, 1);
    q.writeBuffer(this.b.EFL, 0, L); q.writeBuffer(this.b.EFG, 0, G); q.writeBuffer(this.b.EFB, 0, new Uint32Array([b, ef.rounds]));
    ef.count = L[0];
  }
  /** Before queuing steps: the levelling's budgets brought up to what the last steps needed (film-level-host.js adaptLevel). */
  async levelReady() {
    if (!levelOn(this.o)) return;
    const v = new Uint32Array(await this.readWords('LVS', 48));
    this.device.queue.writeBuffer(this.b.LVS, 12, new Uint32Array(9));
    if (adaptLevel(this.lv, v)) this.setOptions({});
  }
  bufFor(name) { return name === 'u' ? this.b.U : name === 'rc' ? this.b.RC : this.b[name]; }

  /** Uniform values for the options and pigments. dt changes between dry()'s phases: call again with { dt }. */
  setOptions(o) {
    const d = this.device, u = new ArrayBuffer(UBYTES), U32 = new Uint32Array(u), F32 = new Float32Array(u);
    this.o = { ...this.o, ...o }; o = this.o;
    const set = (k, v) => { const i = UOFF[k] / 4; if (UF.find(x => x[0] === k)[1] === 'u') U32[i] = v; else F32[i] = v; };
    set('w', this.w ?? 0); set('h', this.h ?? 0); set('n', this.n ?? 0); set('tw', this.tw ?? 0); set('th', this.th ?? 0); set('ntiles', this.ntiles ?? 0); set('K', this.K);
    set('p2', o.optimized === false ? 0 : 1); set('cap', this.cap ?? 0); set('hasTop', this.hasTop ? 1 : 0); set('holdOn', Number.isFinite(o.hold ?? Infinity) ? 1 : 0);
    // physical time (flow-time.js): a step's time in chunks of at most 2, flow and pore passes from dt and the cell size
    const requestedDt = o.dt ?? 1;
    if (!Number.isFinite(requestedDt) || requestedDt < 0) throw new RangeError('dt must be finite and nonnegative');
    this.timeChunks = Math.max(1, Math.ceil(requestedDt / 2));
    const dt = requestedDt / this.timeChunks, sub = { ...o, dt }, at = { paper: { mmPerCell: o.mmPerCell ?? 0.3 } };
    this.flowTime = flowTime(at, sub); this.poreTime = poreTime(at, sub);
    const fraction = this.flowTime.fraction;
    if (this.ef) this.ef.stale = true;   // the edge feed's geometry depends on the options and dt
    Object.entries({
      dt, evap: o.evap, edgeEvap: o.edgeEvap, edgeWidth: o.edgeWidth, capE: o.edgeWidth + 1, absorb: o.absorb, film: o.film, flow: o.flow * fraction, ff: o.fibreFlow ?? 0.6,
      flowDepth: o.flowDepth ?? 0.12, diffuse: Math.min(0.25, Math.max(0, o.diffuse * fraction)), cd: o.carryDepth ?? 0.08, settle: o.settle, liftDepth: o.liftDepth ?? 0.15,
      rewetLift: o.rewetLift, granFill: o.granFill ?? 0, holdCap: Number.isFinite(o.hold ?? Infinity) ? o.hold : 0, slide: slideRate(o.slide ?? 0, this.paperMm ?? 0), slideFill: o.slideFill ?? 1,
      capStep: this.poreTime.fraction, capEps: o.capEps, capDelta: o.capDelta, sizing: o.sizing ?? 0.85, wickFilter: o.wickFilter ?? 0.2,
      wetEps: o.wetEps, paperDry: o.paperDry, capSigma: o.capSigma, spill: o.spill, spillHeight: o.spillHeight, dampEase: o.dampEase, pinning: o.pinning ?? 0, pinFibre: o.pinFibre ?? 0,
      enclose: o.encloseEase ?? 0, slideCap: o.slideCap ?? 0, holeFill: o.holeFill ?? 0, padB: 0,
      filmDiff: Math.max(0, (o.filmDiffuse ?? 0) * fraction), filmDepth: o.filmDepth ?? 0.03, holeSpan: o.holeSpan ?? 0, mar: o.marangoni ?? 0, slope: o.slope ?? 0,
      padC: 0, mmPerCell: o.mmPerCell ?? 0.3, edgeFlowDepth: o.edgeFlowDepth ?? 0.06,
      poreHalo: Math.max(1, Math.ceil(this.poreTime.iters / TILE)), poreReach: Math.max(2, this.poreTime.iters),
      toothLo: this.paperHollow?.toothLo ?? 0, toothSpan: this.paperHollow?.toothSpan ?? 0, hollowUnit: this.paperHollow?.hollowUnit ?? 1, groundPhys: this.paperHollow?.physical ? 1 : 0,
      ...levelUniforms({ ...o, tiltX: this.tilt?.x ?? 0, tiltY: this.tilt?.y ?? 0 }, dt, o.mmPerCell ?? 0.3, this.lv ?? levelBudget()),
    }).forEach(([k, v]) => set(k, v));
    const base = UF.length, gran = o.gran ?? 1, scour = o.scour ?? 0;
    this.pigments.forEach((p, k) => {
      const gg = p.gamma * gran, mob = p.wick ?? Math.max(0.05, Math.min(0.9, 1 - p.gamma));
      F32.set([gg, (p.rho / p.omega) * o.lift * o.looseLift, scour / p.omega, gg > 0 ? reposeStep(o.repose ?? 0, this.paperMm ?? 0) / gg : 0], base + k * 4);
      // pb.x, pc.x: the Stokes speed and the Brownian diffusion of the paint's particles, times settle (settling.js)
      F32.set([settleSpeed(p) * (o.settle ?? 1), p.omega, p.floc ?? 0, mob], base + 64 + k * 4);
      F32.set([settleDiffusion(p) * (o.settle ?? 1), 0, 0, 0], base + 144 + k * 4);
    });
    this.act = o.activeChannelDispatch !== false && o.optimized !== false
      ? channelList(this.K, this.channelMask ?? 0) : Array.from({ length: this.K }, (_, k) => k);
    set('p3', this.act.length); this.act.forEach((k, a) => { U32[UF.length + 128 + a] = k; });
    if (this.b) d.queue.writeBuffer(this.b.U, 0, u);
  }

  /** Copy a whole CPU sheet to the GPU. */
  upload(sheet) {
    const { device: d, b: B, n, w, h } = this, K = this.K, put = (buf, arr, off = 0) => d.queue.writeBuffer(buf, off, arr);
    const u32 = a => { const o = new Uint32Array(n); for (let i = 0; i < n; i++) o[i] = a[i]; return o; };
    put(B.W, sheet.W); put(B.S, sheet.s); put(B.M, u32(sheet.M)); put(B.EVER, u32(sheet.ever));
    put(B.RESIST, sheet.resist ? u32(sheet.resist) : new Uint32Array(n));
    this.capacity = sheet.paper.capacity; this.resist = sheet.resist ? Uint8Array.from(sheet.resist) : null;
    // the edge feed's unmet demand is the sheet's own state (edge-feed.js), carried with it
    { const v = new Float32Array(4 * n); if (sheet.edgePending?.length === n) for (let i = 0; i < n; i++) v[4 * i + 2] = sheet.edgePending[i]; put(B.EFS, v); this.ef.stale = true; }
    for (let k = 0; k < K; k++) { put(B.G, sheet.G[k], k * n * 4); put(B.P, sheet.P[k], k * n * 4); put(B.D, sheet.D[k], k * n * 4); }
    this.hasTop = sheet.layers.length > 0;
    if (this.hasTop) { const top = sheet.layers[sheet.layers.length - 1]; for (let k = 0; k < K; k++) put(B.TOP, top[k], k * n * 4); }
    this.channelMask = observeSheetChannels(this.channelMask ?? 0, sheet, K);
    this.tilt = sheet.tilt ?? null;   // the board's tilt (sheet.js setTilt), for the levelling
    this.setOptions({ mmPerCell: sheet.paper?.mmPerCell ?? 0.3 });
    const fl = new Uint32Array(this.ntiles), cap = sheet.paper.capacity;
    // The active-tile reduction covers every nonzero W only if loaded surface
    // water has its M flag. Imported states violating this invariant keep the
    // ordinary solver until a subsequent whole-sheet upload proves coverage.
    this.zeroWaterCovered = true;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (sheet.W[i] !== 0 && sheet.M[i] !== 1) this.zeroWaterCovered = false;
      if (sheet.M[i] || sheet.s[i] > 0.02 * cap[i]) fl[((y / TILE) | 0) * this.tw + ((x / TILE) | 0)] = 1;
    }
    const pigments = new Uint32Array(this.ntiles);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, t = ((y / TILE) | 0) * this.tw + ((x / TILE) | 0);
      for (let k = 0; k < K; k++) if (sheet.G[k][i] || sheet.P[k][i] || sheet.D[k][i] || sheet.layers.at(-1)?.[k][i]) pigments[t] |= 1 << k;
    }
    put(B.PIG, pigments); put(B.FLAGS2, fl); this.epoch++; this.knownDry = false; this.zeroWaterKnown = false; this.surfaceWet = sheet.M.some(v => v);
  }

  /** Encode `steps` steps into one compute pass. */
  encodeSteps(enc, steps, timer = null, stopSurface = false) {
    const pass = timer ? null : enc.beginComputePass(), o = this.o, K = this.K;
    const nD = this.cap, zeroWater = this.o.zeroWaterOptimization !== false && this.zeroWaterKnown === true;
    const go = (name, indirectOffset = 0, dispatch = null) => {
      if (indirectOffset && this.act.length === 0) return;
      const p = timer ? timer.pass(enc, name) : pass; p.setPipeline(this.p[name]); p.setBindGroup(0, this.bg[name]);
      if (stopSurface && name !== 'tiles_args' && name !== 'surface_boundary') p.dispatchWorkgroupsIndirect(this.b.ARGS, dispatch ? 24 : indirectOffset);
      else if (dispatch) p.dispatchWorkgroups(...dispatch);
      else p.dispatchWorkgroups(nD, indirectOffset ? this.act.length : 1);
      if (timer) p.end();
    };
    const nT = Math.ceil(this.ntiles / 64);
    if (o.dt === 0) { pass?.end(); return; }
    steps *= this.timeChunks;
    const ef = (name, groups) => { const p = timer ? timer.pass(enc, name) : pass; p.setPipeline(this.p[name] ?? this.efPipe(...name.split('#'))); p.setBindGroup(0, this.bg[name.split('#')[0]]); p.dispatchWorkgroups(groups); if (timer) p.end(); };
    for (let s = 0; s < steps; s++) {
      // the pinned edge's feed first, as the CPU sheet's step (edge-feed.js), on the geometry efRefresh made
      if (this.efOn && this.ef.count) {
        const groups = Math.ceil(this.ef.count / 256);
        ef('ef_reset', 1); ef('ef_begin', groups);
        for (let r = 0; r < this.ef.rounds; r++) { ef(`ef_prep#${r}`, groups); ef(`ef_apply#${r}`, groups); }
      }
      go('tiles_prep', 0, [nT]); go('tiles_build', 0, [nT]); go('tiles_args', 0, [1]);
      if (o.optimized !== false) { go('pigment_scan', 12); go('pigment_masks', 0, [nT]); }
      // the boxes and the levelling, after the feed as the CPU step's (sheet.js levelFilm); their kernels loop over their
      // work, so any number of workgroups covers it
      if (!zeroWater) encodeLevel((name, groups, constants = null) => {
        if (!constants) return go(name, 0, [groups]);
        const p = timer ? timer.pass(enc, name) : pass, key = `${name}#${JSON.stringify(constants)}`;
        p.setPipeline(this.p[key] ??= this.device.createComputePipeline({ layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bgl[name]] }), compute: { module: this.module, entryPoint: name, constants } }));
        p.setBindGroup(0, this.bg[name]);
        if (stopSurface) p.dispatchWorkgroupsIndirect(this.b.ARGS, 24); else p.dispatchWorkgroups(groups);
        if (timer) p.end();
      }, o, o.mmPerCell ?? 0.3, this.lv, Math.max(1, nD));
      // Proven W==0 is invariant until upload/writeRect. The retained p3a,
      // capillary and wet-front passes still run at the original dt.
      if (!zeroWater) {
        go('phase1');
        for (let it = 0; it < this.flowTime.iters; it++) {
          go('faces'); go('wsc'); if (K) { if (o.fusedTransport !== false) go('pflux_out', 12); else { go('pflux_k', 12); go('ppout', 12); } }
          go(it === 0 ? 'apply_w0' : 'apply_w1'); if (K) go('apply_g', 12);
        }
      }
      go('p3a');
      if (!zeroWater && (o.slide ?? 0) > 0) { go('dep_k'); go('slide_out', 12); go('slide_apply', 12); }
      // Cell-wise pigment loops improved the measured large sheets with one to
      // three channels. Keep the parallel passes for small or water-only work.
      // pore passes split in physical time (flow-time.js poreTime), each published before the next gathers it
      for (let p = 0; p < this.poreTime.iters; p++) {
        if (o.fusedCapillary !== false && this.n >= 480000 && this.act.length > 0 && this.act.length <= 3) go('cap_sp');
        else { go('cap_s'); go('cap_p', 12); }
        if (p + 1 < this.poreTime.iters) go('cap_commit');
      }
      go('p5a'); go('p5b'); go('p5c'); go('wetscan');
      if (this.efOn) { ef('ef_watch', Math.ceil(this.n / 256)); ef('ef_watch_end', 1); }
      if (stopSurface) go('surface_boundary', 0, [1]);
    }
    pass?.end();
  }

  setCap(cap) {
    this.cap = Math.max(1, Math.min(this.ntiles, Math.ceil(cap)));
    this.device.queue.writeBuffer(this.b.U, UOFF.cap, new Uint32Array([this.cap]));
  }
  // Direct dispatches are cheaper than indirect ones, so the host sizes them from the last tile count it read back, with
  // room for growth; the shader flags an undersized dispatch.
  noteCount(count) {
    const want = count * 1.5 + 16 + 3 * Math.sqrt(count);
    this.setCap(this.hold > 0 ? Math.max(this.cap, want) : want);
  }
  /** Queue `steps` steps (no waiting). */
  step(steps = 1, chunk = 20, stopSurface = false) {
    for (let done = 0; done < steps;) {
      const enc = this.device.createCommandEncoder(), k = Math.min(chunk, steps - done);
      this.encodeSteps(enc, k, null, stopSurface); this.device.queue.submit([enc.finish()]); done += k;
    }
  }
  /**
   * `steps` steps, then the active and wet tile counts read back and used to size the next dispatch. Resolves to whether any
   * tile is still wet. Nothing is queued when the sheet is known dry and nothing was written since: a step would change nothing.
   * `surfaceWet` follows whether any water still stands on the surface (damp pores alone do not count), as the CPU sheet's M.
   */
  async advance(steps) {
    if (this.knownDry) { this.surfaceWet = false; return false; }
    await this.efReady(); await this.levelReady();
    const epoch = this.epoch;
    this.step(steps);
    const c = await this.counters();
    this.zeroWaterKnown = this.zeroWaterCovered === true && c[7] === 0 && c[4] === 0 && epoch === this.epoch;
    if (this.hold > 0) this.hold--;
    this.noteCount(c[0]);
    if (c[1] === 0 && epoch === this.epoch) this.knownDry = true;
    this.wetTiles = c[1]; this.surfaceTiles = c[5];
    this.surfaceWet = c[5] > 0 || epoch !== this.epoch;
    return c[1] > 0;
  }
  /** Queue a bounded wave but stop at the first original surface-observation boundary.
   * All later global/tile/pigment dispatches are GPU no-ops. Only the executed
   * steps are returned; dry pores are preserved for the next glaze. */
  async advanceSurface(steps, quantum) {
    if (!Number.isInteger(quantum) || quantum < 1 || !Number.isInteger(steps) || steps < quantum || steps % quantum) throw new Error('surface batch needs whole observation quanta');
    if (this.knownDry) { this.surfaceWet = false; return { wet: false, steps: 0 }; }
    await this.efReady(); await this.levelReady();
    const epoch = this.epoch, d = this.device;
    // CTR[8..11]: enabled, executed steps, original quantum, terminal latch.
    // ARGS[6..8]: global tile-list/mask work; ordinary kernels use ARGS[0..5].
    d.queue.writeBuffer(this.b.CTR, 32, new Uint32Array([1, 0, quantum, 0]));
    d.queue.writeBuffer(this.b.ARGS, 24, new Uint32Array([Math.ceil(this.ntiles / 64), 1, 1]));
    // Every active kernel uses the freshly computed tile count, so a wet front
    // growing inside this wave cannot exceed a stale host dispatch estimate.
    this.step(steps, 20, true);
    const c = new Uint32Array(await this.readWords('CTR', 48)), ran = c[9];
    d.queue.writeBuffer(this.b.CTR, 32, new Uint32Array(4));
    this.zeroWaterKnown = this.zeroWaterCovered === true && c[7] === 0 && c[4] === 0 && epoch === this.epoch;
    if (this.hold > 0) this.hold = Math.max(0, this.hold - ran / quantum);
    this.noteCount(c[0]);
    if (c[1] === 0 && epoch === this.epoch) this.knownDry = true;
    this.wetTiles = c[1]; this.surfaceTiles = c[5]; this.surfaceWet = c[5] > 0 || epoch !== this.epoch;
    return { wet: c[1] > 0, steps: ran };
  }
  async idle() { await this.device.queue.onSubmittedWorkDone(); }

  async readWords(name, byteLength, offset = 0) {
    const d = this.device, rb = d.createBuffer({ size: Math.max(16, byteLength), usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = d.createCommandEncoder(); enc.copyBufferToBuffer(this.b[name], offset, rb, 0, byteLength); d.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ); const out = rb.getMappedRange().slice(0); rb.destroy(); return out;
  }
  /** [active tile count of the last step, wet tile count after it, largest face depth difference (if level_k ran)] */
  async counters() { return new Uint32Array(await this.readWords('CTR', 32)); }

  /** Copy the whole GPU state back into a CPU sheet, top layer included. */
  async download(sheet) {
    const { n } = this, K = this.K;
    if (this.efOn) { const v = new Float32Array(await this.readWords('EFS', n * 16)), p = sheet.edgePending?.length === n ? sheet.edgePending : (sheet.edgePending = new Float64Array(n)); for (let i = 0; i < n; i++) p[i] = v[4 * i + 2]; }
    const top = this.hasTop && sheet.layers.length ? sheet.layers[sheet.layers.length - 1] : null;
    const planes = [['W', [sheet.W]], ['S', [sheet.s]], ['M', [sheet.M]], ['EVER', [sheet.ever]],
      ['G', sheet.G], ['P', sheet.P], ['D', sheet.D], ...(top ? [['TOP', top]] : [])];
    const bytes = n * 4 * (4 + K * (top ? 4 : 3));
    // One snapshot submission and mapping, rather than a GPU round trip for
    // each pigment field. Keep the old bounded reads for oversized sheets.
    if (bytes <= this.device.limits.maxBufferSize) {
      // Reuse the sheet's staging allocation: repeatedly allocating hundreds
      // of MB improved median time but caused slower outlier snapshots.
      if (!this.snapshotRb || this.snapshotRb.size < bytes) {
        this.snapshotRb?.destroy();
        this.snapshotRb = this.device.createBuffer({ size: Math.max(16, bytes), usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      }
      const rb = this.snapshotRb;
      try {
        const enc = this.device.createCommandEncoder(); let offset = 0;
        for (const [name, fields] of planes) {
          const size = fields.length * n * 4;
          enc.copyBufferToBuffer(this.b[name], 0, rb, offset, size); offset += size;
        }
        this.device.queue.submit([enc.finish()]);
        await rb.mapAsync(GPUMapMode.READ);
        const data = rb.getMappedRange(); offset = 0;
        for (const [name, fields] of planes) {
          const ArrayType = name === 'M' || name === 'EVER' ? Uint32Array : Float32Array;
          for (const field of fields) { field.set(new ArrayType(data, offset, n)); offset += n * 4; }
        }
        sheet.wetDirty = 1;
      } catch (error) {
        rb.destroy(); this.snapshotRb = null; throw error;
      } finally { if (this.snapshotRb === rb) rb.unmap(); }
      return;
    }
    const f32 = async (name, k = 0) => new Float32Array(await this.readWords(name, n * 4, k * n * 4));
    const u32 = async name => new Uint32Array(await this.readWords(name, n * 4));
    sheet.W.set(await f32('W')); sheet.s.set(await f32('S'));
    const M = await u32('M'), E = await u32('EVER'); for (let i = 0; i < n; i++) { sheet.M[i] = M[i]; sheet.ever[i] = E[i]; }
    for (let k = 0; k < K; k++) { sheet.G[k].set(await f32('G', k)); sheet.P[k].set(await f32('P', k)); sheet.D[k].set(await f32('D', k)); }
    if (this.hasTop && sheet.layers.length) { const top = sheet.layers[sheet.layers.length - 1]; for (let k = 0; k < K; k++) top[k].set(await f32('TOP', k)); }
    sheet.wetDirty = 1;
  }

  // ---- rectangles: what a brush stroke needs -------------------------------------------------------------------
  planes() { return 4 + 3 * this.K; }
  ensurePack(area) {
    const need = area * this.planes() * 4;
    if (this.b.PACK.size >= need) return;
    this.b.PACK.destroy();
    this.b.PACK = this.device.createBuffer({ size: roomFor(need), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    this.bindAll(['pack_rect', 'unpack_rect']);
  }
  rectPass(enc, name, [, , rw, rh]) {
    const pass = enc.beginComputePass(); pass.setPipeline(this.p[name]); pass.setBindGroup(0, this.bg[name]);
    pass.dispatchWorkgroups(Math.ceil(rw / 16), Math.ceil(rh / 16)); pass.end();
  }
  /** Read a rectangle [x0, y0, w, h] into packed planes: W, s, M, ever, G[K], P[K], D[K]. */
  async readRect(rect) {
    const [x0, y0, rw, rh] = rect, area = rw * rh, bytes = area * this.planes() * 4, d = this.device;
    this.ensurePack(area); d.queue.writeBuffer(this.b.RC, 0, new Uint32Array([x0, y0, rw, rh]));
    const rb = this.rb && this.rb.size >= bytes ? this.rb : (this.rb?.destroy(), this.rb = d.createBuffer({ size: roomFor(bytes), usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }));
    const enc = d.createCommandEncoder(); this.rectPass(enc, 'pack_rect', rect); enc.copyBufferToBuffer(this.b.PACK, 0, rb, 0, bytes); d.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ, 0, bytes); const out = new Float32Array(rb.getMappedRange(0, bytes).slice(0)); rb.unmap(); return out;
  }
  /** Write packed planes back (the layout readRect returns) and flag the tiles that hold water. */
  writeRect(rect, packed) {
    const [x0, y0, rw, rh] = rect, d = this.device;
    const area = rw * rh;
    const mask = observePackedChannels(this.channelMask ?? 0, packed, area, this.K);
    if (mask !== this.channelMask) { this.channelMask = mask; this.setOptions({}); }
    for (let i = 0; i < area; i++) if (packed[i] !== 0 && packed[2 * area + i] !== 1) this.zeroWaterCovered = false;
    this.ensurePack(rw * rh); d.queue.writeBuffer(this.b.RC, 0, new Uint32Array([x0, y0, rw, rh])); d.queue.writeBuffer(this.b.PACK, 0, packed);
    const enc = d.createCommandEncoder(); this.rectPass(enc, 'unpack_rect', rect); d.queue.submit([enc.finish()]); this.bumpFor(rect); this.ef.stale = true;
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
  bumpFor(rect) { this.epoch++; this.knownDry = false; this.zeroWaterKnown = false; this.surfaceWet = true; this.hold = 3; this.setCap(this.cap + 1.2 * Math.ceil(rect[2] / 16 + 1) * Math.ceil(rect[3] / 16 + 1)); }

  // ---- dry() and fix() -------------------------------------------------------------------------------------------
  resetCounters(...words) { for (const i of words) this.device.queue.writeBuffer(this.b.CTR, i * 4, new Uint32Array([0])); }
  async surfaceLevel() {
    this.resetCounters(2);
    const enc = this.device.createCommandEncoder();
    const p2 = enc.beginComputePass(); p2.setPipeline(this.p.level_k); p2.setBindGroup(0, this.bg.level_k); p2.dispatchWorkgroupsIndirect(this.b.ARGS, 0); p2.end();
    this.device.queue.submit([enc.finish()]);
    const c = await this.counters(); return new Float32Array(c.buffer)[2];
  }
  /** GPU version of sheet.js dry(): same schedule (dt, level check every 25 steps, faster time once level). Returns steps taken. */
  async dry(max = 40000, { level = 60, levelMax = 4000, levelTol = 0.02, dt = 2 } = {}) {
    const oLevel = this.o.dt ?? 1;
    let t = 0, fast = false; this.setOptions({ dt: oLevel });
    while (t < max) {
      if (!fast && t >= level && (t >= levelMax || (t % 25 === 0 && await this.surfaceLevel() < levelTol))) { fast = true; this.setOptions({ dt }); }
      let stop = max;
      if (!fast) {
        if (t < levelMax) stop = Math.min(stop, levelMax);
        stop = Math.min(stop, Math.max(Math.floor(t / 25) * 25 + 25, Math.ceil(level / 25) * 25));
      } else stop = Math.min(stop, t + 50);
      const chunk = Math.max(1, stop - t);
      await this.efReady(); this.step(chunk, 25); t += chunk;
      const c = await this.counters(); this.noteCount(c[0]); if (c[1] === 0) break;
    }
    const c = await this.counters(); if (c[1] !== 0) throw new Error(`Sheet is still wet after dry() limit of ${max} steps`);
    this.setOptions({ dt: oLevel }); this.knownDry = true;
    return t;
  }
  /** sheet.js fix(): pores into the deposit, then the deposit becomes the top dried layer. The superseded layer goes to `topOut`. */
  async fix(topOut = null) {
    // a fixed wash has no contact-line demand left (edge-feed.js resetEdgeFeed)
    { const e = this.device.createCommandEncoder(); e.clearBuffer(this.b.EFS); this.device.queue.submit([e.finish()]); this.ef.stale = true; }
    this.resetCounters(3);
    const d = this.device, enc = d.createCommandEncoder(), pass = enc.beginComputePass();
    pass.setPipeline(this.p.fix_a); pass.setBindGroup(0, this.bg.fix_a); pass.dispatchWorkgroups(Math.ceil(this.w / 16), Math.ceil(this.h / 16)); pass.end();
    d.queue.submit([enc.finish()]);
    if ((await this.counters())[3] === 0) return { hadTop: false, pushed: false };
    const hadTop = this.hasTop;
    if (hadTop && topOut) for (let k = 0; k < this.K; k++) topOut.set(new Float32Array(await this.readWords('TOP', this.n * 4, k * this.n * 4)), k * this.n);
    const e2 = d.createCommandEncoder(), p2 = e2.beginComputePass();
    p2.setPipeline(this.p.fix_b); p2.setBindGroup(0, this.bg.fix_b); p2.dispatchWorkgroups(Math.ceil(this.w / 16), Math.ceil(this.h / 16)); p2.end();
    d.queue.submit([e2.finish()]);
    this.hasTop = true; this.setOptions({});
    return { hadTop, pushed: true };
  }
  /** fix() for a CPU sheet whose layer list should follow: the superseded layer is filled in and a placeholder is pushed. */
  async fixInto(sheet) {
    const K = this.K, n = this.n, out = this.hasTop ? new Float32Array(K * n) : null, r = await this.fix(out);
    if (!r.pushed) return false;
    if (r.hadTop) { const top = sheet.layers[sheet.layers.length - 1]; for (let k = 0; k < K; k++) top[k].set(out.subarray(k * n, (k + 1) * n)); }
    sheet.layers.push(sheet.pigments.map(() => new Float32Array(n)));
    return true;
  }
  destroy() { this.detach(); }
}
