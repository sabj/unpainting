// N sheets of one size advanced together on one device. Each sheet owns a block of every
// per-sheet buffer, and stepfull.wgsl offsets each access by the tile's sheet. A step is one dispatch per kernel over the
// union of active tiles; everything else runs through a SheetView, GpuSheet code over a device proxy that offsets buffers.
import { GpuSheet, SRC, UBYTES, analyse, HASH } from './stepfull.mjs';
import { permeability } from './permeability.mjs';
import { workerCount } from './workers.mjs';
import { paperPlanes } from './paper-planes.mjs';
import { strokePlanBudget, strokePlanShader, planMiB } from './stroke-plan-budget.mjs';

const INFLIGHT = Number(process.env.BATCH_INFLIGHT ?? 2), URGENT = process.env.BATCH_URGENT === '1';
// BATCH_DRY_WAIT_MS: before a submit, wait up to this long for every drying sheet to pend its next chunk, so drys of
// different sheets fall into phase and share step rounds instead of alternating between submissions (0: off)
const DRY_WAIT_MS = Number(process.env.BATCH_DRY_WAIT_MS ?? 0);
const TILE = 16, ALIGN = 256, SLOT = 256, DYN_SLOTS = 1024;
const up256 = b => Math.ceil(Math.max(16, b) / ALIGN) * ALIGN;
// uniform fields every sheet holds the same value for: read from UA[0] so loops with barriers stay uniform
const GLOBAL_U = new Set(['w', 'h', 'n', 'tw', 'th', 'ntiles', 'K', 'p3', 'padB', 'capE', 'edgeWidth', 'cap']);
// entry points that work on one sheet, named by the dispatch's SEL slot
const SEL_ENTRIES = ['sparse_start', 'tiles_prep', 'tiles_build', 'tiles_args', 'fix_args', 'fix_a', 'fix_b', 'gdp_sum', 'mark_rect', 'upload_metadata_rect',
  'pack_rect', 'unpack_rect', 'quiet_dry_tail', 'quiet_dry_clear'];
// brush entry points: workgroup k lays the stroke of the k-th sheet in SEL's list (or SEL.x)
const BRUSH_ENTRIES = ['stroke_run', 'stroke_end', 'splat_run', 'stroke_metered'];

/** Per-sheet byte sizes of the stacked buffers (shader name -> bytes, element bytes). */
function sheetLayout(n, K, ntiles, o, bstrBytes) {
  const f = n * 4, kf = f * Math.max(1, K), L = {};
  for (const k of ['M', 'EVER', 'RESIST', 'W', 'S', 'S2', 'EA', 'EB', 'FX', 'FY', 'WSC', 'WENT', 'NEWF']) L[k] = [f, 4];
  L.DEP = [o.fixedBed > 0 ? f * 3 : f, 4];
  for (const k of ['PAPER', 'PAPER2', 'PAPER3', 'BPAP']) L[k] = [f * 4, 16];
  for (const k of ['G', 'P', 'D', 'TOP', 'QX', 'QY', 'SC', 'OUTM', 'PN', 'DD']) L[k] = [kf, 4];
  L.FXY = [f * 2, 8]; L.QXY = [kf * 2, 8]; L.OUT4 = [kf * 4, 16];
  L.FLAGS = [ntiles * 4, 4]; L.TLS = [ntiles * 4, 4]; L.ARGS = [48, 4]; L.FLAGS2 = [(5 * ntiles + 3) * 4, 4]; L.CTR = [64, 4]; L.BSTR = [bstrBytes, 4];
  for (const k of Object.keys(L)) L[k] = { bytes: up256(L[k][0]), elem: L[k][1] };
  return L;
}

function wrapIndex(src, name, base) {
  const re = new RegExp(`(?<![\\w.])${name}\\[`, 'g'); let out = '', last = 0, m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length; let depth = 1, j = start;
    while (depth) { const c = src[j++]; if (c === undefined) throw new Error(`unbalanced ${name}[`); if (c === '[') depth++; else if (c === ']') depth--; }
    out += src.slice(last, start) + `${base} + (` + wrapIndex(src.slice(start, j - 1), name, base) + ')]';
    last = j; re.lastIndex = j;
  }
  return out + src.slice(last);
}

const SPARSE_ALL_BATCH = `// each sheet's own tiles of its last step (TL holds the union, rebuilt by every step of any sheet)
@group(0) @binding(44) var<storage, read_write> TLS: array<u32>;
var<workgroup> lsCount: u32;
// level_k for the SEL sheet over the tiles of its own last step
@compute @workgroup_size(16, 16)
fn level_sheet(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  setSheet(SEL.x);
  if (lid.x == 0u && lid.y == 0u) { lsCount = atomicLoad(&CTR[0]); }
  let count = workgroupUniformLoad(&lsCount);
  for (var k = wid.x; k < count; k += u32(u.padB)) {
    let t = TLS[k]; let x = (t % u.tw) * 16u + lid.x; let y = (t / u.tw) * 16u + lid.y;
    if (x < u.w && y < u.h) {
      let i = y * u.w + x;
      if (M[i] == 1u) {
        var m = 0.0;
        if (x < u.w - 1u && M[i + 1u] == 1u) { m = max(m, abs(W[i] - W[i + 1u])); }
        if (y < u.h - 1u && M[i + u.w] == 1u) { m = max(m, abs(W[i] - W[i + u.w])); }
        if (m > 0.0) { atomicMax(&CTR[2], bitcast<u32>(m)); }
      }
    }
  }
}
var<workgroup> saCount: u32;
var<workgroup> saTotal: atomic<u32>;
@compute @workgroup_size(256)
fn sparse_all(@builtin(local_invocation_index) li: u32) {
  let mask = SEL.y;
  if (li == 0u) { atomicStore(&saTotal, 0u); }
  for (var s = 0u; s < NS; s++) {
    if (((mask >> s) & 1u) == 0u) { continue; }
    setSheet(s);
    workgroupBarrier();
    if (li == 0u) {
      atomicStore(&CTR[0], 0u); atomicStore(&CTR[1], 0u); atomicStore(&CTR[6], 0u); atomicStore(&CTR[7], 0u);
      saCount = atomicLoad(&FLAGS2[2u * u.ntiles]);
    }
    storageBarrier();
    let count = workgroupUniformLoad(&saCount);
    for (var g = li; g < count; g += 256u) {
      let t = atomicLoad(&FLAGS2[u.ntiles + g]);
      atomicStore(&FLAGS2[t], 0u);
      let tx = i32(t % u.tw); let ty = i32(t / u.tw);
      for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) {
        let x = tx + dx; let y = ty + dy;
        if (x < 0 || y < 0 || x >= i32(u.tw) || y >= i32(u.th)) { continue; }
        let a = u32(y) * u.tw + u32(x);
        markDirty(a);
        if (atomicExchange(&FLAGS[a], 1u) == 0u) { TL[atomicAdd(&saTotal, 1u)] = s * NTL + a; TLS[atomicAdd(&CTR[0], 1u)] = a; }
      } }
    }
    storageBarrier(); workgroupBarrier();
    if (li == 0u) {
      let c = atomicLoad(&CTR[0]);
      atomicAdd(&CTR[8], c); atomicAdd(&CTR[10], 1u);
      if (u.p3 != 0u) { atomicStore(&FLAGS2[2u * u.ntiles], 0u); }
    }
  }
  storageBarrier(); workgroupBarrier();
  if (li == 0u) {
    let c = atomicLoad(&saTotal);
    TL[TLC] = c; ARGS[0] = c; ARGS[1] = 1u; ARGS[2] = 1u; ARGS[3] = c; ARGS[4] = 1u; ARGS[5] = 1u;
  }
}

`;

/** stepfull.wgsl (with the prelude) for NS sheets: every per-sheet buffer access offset by the owning sheet's block. */
function batchShader(src, { NS, ntiles, layout }) {
  const a = src.indexOf('var<workgroup> saCount: u32;'), b = src.indexOf('// ---- tile list');
  if (a < 0 || b < a) throw new Error('batchShader: sparse_all not found');
  if (/(?<![\w.])tlAt\(|(?<![\w.])setSheet\(/.test(src)) throw new Error('batchShader: names taken');
  src = src.slice(0, a) + SPARSE_ALL_BATCH + src.slice(b);
  const decl = '@group(0) @binding(0) var<uniform> u: U;';
  if (!src.includes(decl)) throw new Error('batchShader: uniform declaration not found');
  src = src.replace('array<atomic<u32>, 16>;', 'array<atomic<u32>>;').replace('ARGS: array<u32, 12>;', 'ARGS: array<u32>;');
  src = src.replaceAll('TL[u.ntiles]', 'TL[TLC]').replaceAll('TL[wid.x]', 'tlAt(wid.x)');
  src = src.replace(/(?<![\w.])u\.(\w+)/g, (_, f) => `UA[${GLOBAL_U.has(f) ? '0' : 'SI'}].${f}`);
  for (const [name, { bytes, elem }] of Object.entries(layout)) src = wrapIndex(src, name, `SI * ${bytes / elem}u`);
  src = wrapIndex(src, 'EDGE', `SI * ${layout.EA.bytes / 4}u`);
  for (const name of BRUSH_ENTRIES) {
    const m = new RegExp(`\\nfn ${name}\\(`).exec(src); if (!m) continue;
    const at = m.index + m[0].length, brace = src.indexOf('{', at);
    src = src.slice(0, at) + '@builtin(workgroup_id) wgB: vec3<u32>, ' + src.slice(at, brace + 1) + ' setSheet(selSheet(wgB.x));' + src.slice(brace + 1);
  }
  for (const name of SEL_ENTRIES) {
    const m = new RegExp(`\\nfn ${name}\\(`).exec(src); if (!m) continue;
    const brace = src.indexOf('{', m.index);
    src = src.slice(0, brace + 1) + ' setSheet(SEL.x);' + src.slice(brace + 1);
  }
  // at least two uniform slots: with one, the compiler folds UA[SI] to UA[0] and contracts float arithmetic differently
  // (fields 2e-9 apart after 24 steps), so a 1-sheet batch would not equal a sheet of a larger batch
  const head = `@group(0) @binding(0) var<uniform> UA: array<U, ${Math.max(2, NS)}>;
struct Sel { x: u32, y: u32, n: u32, pad: u32, list: array<vec4<u32>, 8> }
// x: the sheet of a one-sheet dispatch, y: the sheets a step advances (bit mask), n > 0: brush workgroup k runs sheet list[k]
@group(1) @binding(0) var<uniform> SEL: Sel;
fn selSheet(k: u32) -> u32 { if (SEL.n == 0u) { return SEL.x; } return SEL.list[k >> 2u][k & 3u]; }
const NS: u32 = ${NS}u; const NTL: u32 = ${ntiles}u; const TLC: u32 = ${NS * ntiles}u;
var<private> SI: u32;
fn setSheet(s: u32) { SI = s; }
fn tlAt(x: u32) -> u32 { let g = TL[x]; SI = g / NTL; return g % NTL; }`;
  return src.replace(decl, head);
}

export class SheetBatch {
  /** `sheet0`/`o0`: the size and the options every sheet shares (edgeWidth, flowIters, fixedBed). */
  static async create(device, NS, sheet0, o0) { const g = new SheetBatch(); await g.init(device, NS, sheet0, o0); return g; }

  async init(device, NS, sheet0, o) {
    if (NS < 1 || NS > 32) throw new Error('SheetBatch: 1 to 32 sheets');
    if (process.env.GPU_RESIDENT !== '1' || process.env.GPU_PERSISTENT === '0' || process.env.GPU_SPARSE_ALL === '0' || process.env.GPU_STEP === 'old') throw new Error('SheetBatch: needs the resident persistent fused step');
    if (o.edgeWidth + 1 > 7) throw new Error('SheetBatch: edgeWidth up to 6');
    const { w, h, n, K } = sheet0, d = device;
    Object.assign(this, { device: d, NS, w, h, n, K, o: { ...o } });
    this.tw = Math.ceil(w / TILE); this.th = Math.ceil(h / TILE); this.ntiles = this.tw * this.th;
    this.workers = workerCount(this.ntiles * NS, true);
    this.strokePlanBudget = strokePlanBudget(planMiB(process.env.GPU_STROKE_PLAN_MIB, n), n, d.limits); this.SB = this.strokePlanBudget.words;
    this.layout = sheetLayout(n, K, this.ntiles, o, this.strokePlanBudget.gpuBufferBytes);
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    const B = this.b = {}; this.stride = new Map();
    for (const [name, { bytes }] of Object.entries(this.layout)) {
      if (bytes * NS > d.limits.maxBufferSize || bytes * NS > d.limits.maxStorageBufferBindingSize) throw new Error(`SheetBatch: ${name} needs ${bytes * NS} bytes, over the device limit`);
      B[name] = d.createBuffer({ label: name, size: bytes * NS, usage: name === 'ARGS' ? usage | GPUBufferUsage.INDIRECT : usage }); this.stride.set(B[name], bytes);
    }
    B.TL = d.createBuffer({ size: (NS * this.ntiles + 1) * 4, usage });
    B.RC = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    B.U = d.createBuffer({ size: UBYTES * Math.max(2, NS), usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }); this.stride.set(B.U, UBYTES);
    if (UBYTES % 16) throw new Error('SheetBatch: uniform stride');
    B.UPLOAD_META = d.createBuffer({ size: 16, usage }); // demand uploads may ask for it in any mode
    this.sel = d.createBuffer({ size: (NS + DYN_SLOTS) * SLOT, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const selInit = new Uint32Array((NS + DYN_SLOTS) * SLOT / 4);
    for (let s = 0; s < NS; s++) selInit.set([s, 1 << s >>> 0], s * SLOT / 4);
    d.queue.writeBuffer(this.sel, 0, selInit);
    this.selLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true } }] });
    this.selGroup = d.createBindGroup({ layout: this.selLayout, entries: [{ binding: 0, resource: { buffer: this.sel, offset: 0, size: 144 } }] });
    // pipelines: as GpuSheet.init, over the batch shader, every layout with the SEL group
    let source = strokePlanShader(SRC, this.SB).replace('const FIXED_BED: bool = false;', `const FIXED_BED: bool = ${o.fixedBed > 0};`);
    this.source = batchShader(source, { NS, ntiles: this.ntiles, layout: this.layout });
    const info = analyse(this.source), kind = Object.fromEntries(info.decl.map(x => [x.binding, x.kind]));
    d.pushErrorScope('validation');
    const module = d.createShaderModule({ code: this.source });
    const ci = await module.getCompilationInfo?.();
    const errs = (ci?.messages ?? []).filter(m => m.type === 'error');
    if (errs.length) throw new Error('batch shader: ' + errs.slice(0, 5).map(m => `${m.lineNum}:${m.linePos} ${m.message} | ${this.source.split('\n')[m.lineNum - 1]?.trim().slice(0, 160)}`).join('\n'));
    this.p = {}; this.bgl = {}; this.uses = {};
    this.names = Object.fromEntries(info.decl.map(x => [x.binding, x.name]));
    this.edgeFinal = (o.edgeWidth + 1) % 2 === 1 ? 'EB' : 'EA';
    for (const name of info.entries) {
      const use = [0, ...info.uses(name).filter(b => b !== 0)]; this.uses[name] = use;
      this.bgl[name] = d.createBindGroupLayout({ entries: use.map(binding => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: kind[binding] === 'uniform' ? 'uniform' : kind[binding] === 'storage, read' ? 'read-only-storage' : 'storage' } })) });
      const layout = d.createPipelineLayout({ bindGroupLayouts: [this.bgl[name], this.selLayout] });
      this.p[name] = d.createComputePipeline({ label: name, layout, compute: { module, entryPoint: name } });
      if (name === 'stroke_run' || name === 'stroke_metered') this.p[name + '_full'] = this.source.includes('override FULL_BRUSH_PIGMENTS')
        ? d.createComputePipeline({ label: name + '_full', layout, compute: { module, entryPoint: name, constants: { FULL_BRUSH_PIGMENTS: 1 } } }) : this.p[name];
    }
    this.bg = {};
    for (const name of info.entries) this.bg[name] = this.bindFor(name);
    this.bg.stroke_run_full = this.bg.stroke_run; this.bg.stroke_metered_full = this.bg.stroke_metered;
    const v = await d.popErrorScope(); if (v) throw new Error('SheetBatch: ' + v.message);
    this.views = []; this.pending = new Map(); this.waiters = []; this.flushTimer = null; this.trash = []; this.inflight = 0; this.arena = new Uint8Array(1 << 20); this.arenaUsed = 0; this.arenaBuf = null;
    this.stats = { flushes: 0, groups: 0, steps: 0, sheetSteps: 0, maskHist: {} };
  }
  bufFor(name) { return name === 'EDGE' ? this.b[this.edgeFinal] : name === 'UA' ? this.b.U : name === 'rc' ? this.b.RC : name === 'PACK' ? this.pack() : this.b[name]; }
  pack() { return this.b.PACK ?? (this.b.PACK = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE })); }
  ensurePack(need) {
    if (this.b.PACK && this.b.PACK.size >= need) return;
    if (this.b.PACK) this.b.PACK.destroy();
    this.b.PACK = this.device.createBuffer({ size: Math.ceil(Math.max(need * 1.5, 1 << 20) / 4) * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    for (const name of ['pack_rect', 'unpack_rect']) this.bg[name] = this.bindFor(name);
  }
  bindFor(name) { return this.device.createBindGroup({ layout: this.bgl[name], entries: this.uses[name].map(binding => ({ binding, resource: { buffer: this.bufFor(this.names[binding]) } })) }); }

  /** A view of sheet `s` with the GpuSheet API, its fields uploaded. */
  async attach(s, sheet, o) {
    if (this.views[s] && !this.views[s].closed) throw new Error(`SheetBatch: sheet ${s} attached twice`);
    if (this.views[s]) this.reuse(s);
    if (sheet.w !== this.w || sheet.h !== this.h || sheet.K !== this.K) throw new Error('SheetBatch: every sheet must have the same size and pigment count');
    for (const k of ['edgeWidth', 'flowIters', 'fixedBed']) if ((o[k] ?? 0) !== (this.o[k] ?? 0)) throw new Error(`SheetBatch: option ${k} differs between sheets`);
    const v = new SheetView(); v.attachTo(this, s, sheet, o); this.views[s] = v; return v;
  }

  // Lockstep: each sheet's pending GPU work is a list of items in its own order.
  // { t: 'steps', steps, damp, slide } | { t: 'level' } | { t: 'copy', src, so, dst, do, size } | { t: 'brush', kernel }
  // A flush walks all lists together: copies at the heads, then a level check, then the brush dispatches at the heads
  // (one dispatch per kernel, one workgroup per sheet), then a step shared by every sheet whose head is a step.
  list(s) { let l = this.pending.get(s); if (!l) this.pending.set(s, l = []); return l; }
  pend(view, steps, req) {
    if (steps <= 0 && !req.level) return;
    const list = this.list(view.s);
    if (req.level) { list.push({ t: 'level' }); return; }
    const last = list.at(-1);
    if (last && last.t === 'steps' && last.damp === req.damp && last.slide === req.slide) last.steps += steps;
    else list.push({ t: 'steps', steps, damp: req.damp, slide: req.slide });
  }
  /** Copy bytes into this flush's upload arena; returns their offset (items name it with src null). */
  stage(bytes) {
    const at = this.arenaUsed, end = at + Math.ceil(bytes.byteLength / 4) * 4;
    if (end > this.arena.byteLength) { const a = new Uint8Array(Math.max(end, 2 * this.arena.byteLength)); a.set(this.arena.subarray(0, at)); this.arena = a; }
    this.arena.set(bytes, at); this.arenaUsed = end; return at;
  }
  // one writeBuffer of everything staged since the last flush; queue order puts it after earlier submissions' copies
  uploadArena() {
    if (!this.arenaUsed) return;
    if (!this.arenaBuf || this.arenaBuf.size < this.arenaUsed) {
      if (this.arenaBuf) this.trash.push(this.arenaBuf);
      this.arenaBuf = this.device.createBuffer({ size: Math.ceil(this.arena.byteLength / 4) * 4, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    }
    this.device.queue.writeBuffer(this.arenaBuf, 0, this.arena, 0, this.arenaUsed);
    this.stats.arenaBytes = (this.stats.arenaBytes ?? 0) + this.arenaUsed; this.arenaUsed = 0;
  }
  pendItems(s, items) { const list = this.list(s); for (const it of items) { if (it.t === 'steps') { if (it.steps > 0) this.pend({ s }, it.steps, it); } else list.push(it); } }
  /** Encode and submit every pending item, all sheets advancing together. */
  flushNow() {
    if (!this.pending.size) return;
    const t0 = performance.now();
    this.uploadArena();
    const d = this.device, rem = new Map([...this.pending].map(([s, list]) => [s, list.map(x => x.t === 'steps' ? { ...x } : x)]));
    this.pending = new Map();
    let enc = d.createCommandEncoder(), slots = new Map();
    const slotFor = sheets => {
      if (sheets.length === 1) return sheets[0];
      const key = sheets.join(',');
      let i = slots.get(key);
      if (i === undefined) {
        if (slots.size >= DYN_SLOTS) { this.submitSlots(enc, slots); enc = d.createCommandEncoder(); slots = new Map(); }
        i = this.NS + slots.size; slots.set(key, i);
      }
      return i;
    };
    for (;;) {
      let moved = false;
      for (const [, list] of rem) while (list.length && list[0].t === 'copy') { const c = list.shift(); enc.copyBufferToBuffer(c.src ?? this.arenaBuf, c.so, c.dst, c.do, c.size); moved = true; }
      const levels = []; for (const [s, list] of rem) if (list.length && list[0].t === 'level') { list.shift(); levels.push(s); }
      if (levels.length) { this.encodeLevels(enc, levels); continue; }
      const brushes = new Map();
      for (const [s, list] of rem) if (list.length && list[0].t === 'brush') { const k = list[0].kernel; if (!brushes.has(k)) brushes.set(k, []); brushes.get(k).push(s); }
      if (brushes.size) {
        const pass = enc.beginComputePass();
        for (const [k, sheets] of brushes) {
          pass.setPipeline(this.p[k]); pass.setBindGroup(0, this.bg[k]); pass.setBindGroup(1, this.selGroup, [slotFor(sheets) * SLOT]); pass.dispatchWorkgroups(sheets.length);
          for (const s of sheets) rem.get(s).shift();
          this.stats.brushDispatches = (this.stats.brushDispatches ?? 0) + 1; this.stats.brushSheets = (this.stats.brushSheets ?? 0) + sheets.length;
        }
        pass.end(); continue;
      }
      const sheets = []; let run = Infinity, damp = true, slide = false;
      for (const [s, list] of rem) if (list.length && list[0].t === 'steps') { sheets.push(s); run = Math.min(run, list[0].steps); damp &&= list[0].damp; slide ||= list[0].slide; }
      if (!sheets.length) { if (moved) continue; break; }
      sheets.sort((a, b) => a - b);
      const pass = enc.beginComputePass(); pass.setBindGroup(1, this.selGroup, [slotFor(sheets) * SLOT]);
      this.encodeSteps(pass, run, damp, slide); pass.end();
      for (const s of sheets) { const h = rem.get(s)[0]; h.steps -= run; if (!h.steps) rem.get(s).shift(); }
      this.stats.groups++; this.stats.steps += run; this.stats.sheetSteps += run * sheets.length; this.stats.maskHist[sheets.length] = (this.stats.maskHist[sheets.length] ?? 0) + run;
    }
    for (const [s, list] of rem) if (list.length) throw new Error(`SheetBatch: sheet ${s} left ${list[0].t} unflushed`);
    this.submitSlots(enc, slots);
    this.stats.flushes++; this.stats.encodeMs = +((this.stats.encodeMs ?? 0) + performance.now() - t0).toFixed(1);
  }
  submitSlots(enc, slots) {
    for (const [key, i] of slots) {
      const sheets = key.split(',').map(Number), w = new Uint32Array(4 + 32); let mask = 0;
      for (const s of sheets) mask |= 1 << s;
      w.set([sheets[0], mask >>> 0, sheets.length, 0]); w.set(sheets, 4);
      this.device.queue.writeBuffer(this.sel, i * SLOT, w);
    }
    this.device.queue.submit([enc.finish()]);
    for (const b of this.trash) b.destroy(); this.trash = [];
    this.inflight++;
    this.device.queue.onSubmittedWorkDone().then(() => { this.inflight--; if (this.waiters.length && !this.flushTimer) this.flushTimer = setImmediate(() => this.tryFlush()); });
  }
  encodeLevels(enc, sheets) {
    for (const s of sheets) enc.clearBuffer(this.b.CTR, s * this.layout.CTR.bytes + 8, 4);
    const pass = enc.beginComputePass(); pass.setPipeline(this.p.level_sheet); pass.setBindGroup(0, this.bg.level_sheet);
    for (const s of sheets) { pass.setBindGroup(1, this.selGroup, [s * SLOT]); pass.dispatchWorkgroups(this.workers); }
    pass.end();
  }
  encodeSteps(pass, steps, damp, slide) {
    const go = (name, n = this.workers) => { pass.setPipeline(this.p[name]); pass.setBindGroup(0, this.bg[name]); pass.dispatchWorkgroups(n); };
    for (let s = 0; s < steps; s++) {
      go('sparse_all', 1);
      if (damp) { go('cap_sp'); go('p5a'); go('p5c'); go('wetscan'); continue; }
      go('edge_phase1');
      for (let it = 0; it < this.o.flowIters; it++) { go('faces_wsc'); go('pflux_sc'); go(it === 0 ? 'apply_f0' : 'apply_f1'); }
      go('p3a_dep');
      if (slide) { go('slide_out_all'); go('slide_apply_all'); }
      go('cap_sp'); go('p5a'); go('p5b'); go('p5c'); go('wetscan');
    }
  }
  /**
   * The pump: resolves once sheet `s`'s pending work is submitted. While the GPU still has BATCH_INFLIGHT (default 2) of
   * the batch's submissions to run, requests gather; the next submission carries every sheet's pending work at once.
   * Painters never wait for each other: the busier the GPU, the more sheets each submission carries.
   */
  flushSoon(s, urgent = false) {
    return new Promise(resolve => {
      this.waiters.push(resolve); if (urgent && URGENT) this.urgent = true;
      if (!this.flushTimer) this.flushTimer = setImmediate(() => this.tryFlush());
    });
  }
  tryFlush() {
    this.flushTimer = null;
    if (!this.waiters.length || (this.inflight >= INFLIGHT && !this.urgent)) return;
    if (DRY_WAIT_MS > 0) {
      const now = performance.now(); this.firstReady ??= now;
      const lagging = this.views.some(v => v && !v.closed && v.dryS && !v.dryS.done && !this.pending.has(v.s));
      if (lagging && now - this.firstReady < DRY_WAIT_MS) { this.flushTimer = setImmediate(() => this.tryFlush()); return; }
      if (lagging) this.stats.dryWaitTimeouts = (this.stats.dryWaitTimeouts ?? 0) + 1;
      this.firstReady = null;
    }
    this.urgent = false;
    const w = this.waiters; this.waiters = [];
    this.stats.pumps = (this.stats.pumps ?? 0) + 1; this.stats.pumpWaiters = (this.stats.pumpWaiters ?? 0) + w.length;
    try { this.flushNow(); } finally { w.forEach(r => r()); }
  }
  /** Free slot `s` for a new sheet: its old view's work submitted, its blocks zeroed as a new buffer's are. */
  reuse(s) {
    this.flushNow();
    const old = this.views[s]; this.views[s] = undefined; old.destroy();
    const enc = this.device.createCommandEncoder();
    for (const [buf, stride] of this.stride) if (buf !== this.b.U) enc.clearBuffer(buf, s * stride, stride);
    this.device.queue.submit([enc.finish()]);
    this.stats.reused = (this.stats.reused ?? 0) + 1;
  }
  close(s) { const v = this.views[s]; if (v) v.closed = true; }
}
const popcount = m => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
// The device a view's GpuSheet code talks to: buffer offsets and bindings moved to its sheet's block; every submit and
// write first submits the batch's pending steps, so a sheet's commands stay in its own order.
function viewDevice(core, s) {
  // only this sheet's own pending steps must land before its next command (other sheets' steps touch other blocks; TL
  // is rebuilt by every step and read only by the step's own kernels and a level check placed right after it)
  const flush = () => { if (core.pending.has(s)) core.flushNow(); };
  const real = core.device, base = buf => (core.stride.get(buf) ?? 0) * s, isStacked = buf => core.stride.has(buf);
  const queue = {
    writeBuffer(buf, off, data, dOff, size) {
      // a write to this sheet's block while it has work pending joins its list (a copy from staging), so it lands in order
      // without submitting anyone's work early
      if (isStacked(buf) && core.pending.has(s)) {
        const elem = ArrayBuffer.isView(data) ? data.BYTES_PER_ELEMENT ?? 1 : 1, buffer = ArrayBuffer.isView(data) ? data.buffer : data;
        const start = (ArrayBuffer.isView(data) ? data.byteOffset : 0) + (dOff ?? 0) * elem;
        const bytes = size !== undefined ? size * elem : (ArrayBuffer.isView(data) ? data.byteLength : data.byteLength) - (dOff ?? 0) * elem;
        const so = core.stage(new Uint8Array(buffer, start, bytes));
        core.list(s).push({ t: 'copy', src: null, so, dst: buf, do: off + base(buf), size: Math.ceil(bytes / 4) * 4 });
        return;
      }
      flush(); return size === undefined ? (dOff === undefined ? real.queue.writeBuffer(buf, off + base(buf), data) : real.queue.writeBuffer(buf, off + base(buf), data, dOff)) : real.queue.writeBuffer(buf, off + base(buf), data, dOff, size); },
    submit(cbs) { flush(); return real.queue.submit(cbs); },
    onSubmittedWorkDone() { core.flushNow(); return real.queue.onSubmittedWorkDone(); },
  };
  const encoder = e => ({
    copyBufferToBuffer(a, ao, b, bo, size) { return e.copyBufferToBuffer(a, ao + base(a), b, bo + base(b), size); },
    clearBuffer(buf, off = 0, size) { return e.clearBuffer(buf, off + base(buf), size ?? (isStacked(buf) ? core.stride.get(buf) - off : buf.size - off)); },
    beginComputePass(desc) {
      const p = e.beginComputePass(desc);
      return { setPipeline: x => p.setPipeline(x), setBindGroup: (...a) => p.setBindGroup(...a), dispatchWorkgroups: (...a) => p.dispatchWorkgroups(...a),
        dispatchWorkgroupsIndirect: (buf, off) => p.dispatchWorkgroupsIndirect(buf, off + base(buf)), end: () => p.end(),
        writeTimestamp: (...a) => p.writeTimestamp?.(...a), pushDebugGroup() {}, popDebugGroup() {}, insertDebugMarker() {} };
    },
    resolveQuerySet(...a) { return e.resolveQuerySet(...a); },
    finish(desc) { return e.finish(desc); },
  });
  return new Proxy(real, {
    get(t, k) {
      if (k === 'queue') return queue;
      if (k === 'createCommandEncoder') return desc => encoder(real.createCommandEncoder(desc));
      if (k === 'createBindGroup') return desc => real.createBindGroup({ ...desc, entries: desc.entries.map(e => {
        const buf = e.resource?.buffer; if (!buf || !isStacked(buf) || e.resource.offset !== undefined) return e;
        return { ...e, resource: { buffer: buf, offset: base(buf), size: core.stride.get(buf) } };
      }) });
      const v = Reflect.get(t, k); return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}

/** One sheet of a SheetBatch, with GpuSheet's methods; steps are pended to the batch instead of submitted. */
class SheetView extends GpuSheet {
  attachTo(core, s, sheet, o) {
    this.core = core; this.s = s;
    this.allocationGeneration = 1; this.demandSetup = null; this.demandSetupCount = 0;
    this.resident = true; this.persistent = true; this.workers = core.workers;
    this.batch = process.env.GPU_BATCH !== '0'; this.batchItems = []; this.brushSlots = new Map(); this.archives = new Map(); this.archiveSequence = 0;
    const { w, h, n, K, paper } = sheet;
    this.o = { ...o }; this.device = viewDevice(core, s);
    const selOff = s * SLOT;
    this.timestamps = { begin: enc => { const p = enc.beginComputePass(); p.setBindGroup(1, core.selGroup, [selOff]); return p; }, result: async () => ({ enabled: false }), destroy() {} };
    Object.assign(this, { w, h, n, K, tw: core.tw, th: core.th, ntiles: core.ntiles, pigments: sheet.pigments, b: core.b, p: core.p, bg: core.bg, bgl: core.bgl, uses: core.uses, names: core.names, edgeFinal: core.edgeFinal });
    this.act = Array.from({ length: K }, (_, k) => k);
    this.strokePlanBudget = core.strokePlanBudget; this.SB = core.SB; this.resistMask = null;
    const put = (buf, arr, off = 0) => this.device.queue.writeBuffer(buf, off, arr), B = this.b;
    const { P4, P2, P3, PB } = sheet.paperPlanes ?? paperPlanes(paper, n); // built by the painter thread when it can
    put(B.PAPER, P4); put(B.PAPER2, P2); put(B.PAPER3, P3); put(B.BPAP, PB); put(B.BSTR, paper.capacity, this.SB * 4);
    this.cap = this.ntiles; this.hold = 0; this.epoch = 0; this.knownDry = false; this.lastCount = this.ntiles; this.pending = false;
    this.setOptions(this.o);
    this.upload(sheet);
  }
  ensurePack(area) { this.core.ensurePack(area * this.planes() * 4); }
  async ensureUploadMetadata() { if (!this.b.UPLOAD_META) throw new Error('SheetView: GPU_DEMAND_READBACK must be set before the batch starts'); }
  // strokes are items in the batch's lists, submitted by the next flush or by any submit of this sheet's own commands
  flushStrokes() {}
  brushBuffer(state, bytes) {
    let saved = this.brushSlots.get(state);
    if (!saved || saved.buffer.size < bytes) {
      if (saved) this.core.trash.push(saved.buffer); // still read by pending copies: destroyed once the next submit is done
      saved = { buffer: this.core.device.createBuffer({ size: Math.max(16, bytes), usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }) };
      this.brushSlots.set(state, saved);
    }
    return saved;
  }
  // the plan goes into the batch's upload arena (one write a flush): a mapped buffer per stroke is slow on the GPU thread
  staged(data) { return this.core.stage(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)); }
  // GpuSheet.queueStroke as items: the plan copied into this sheet's BSTR block, the brush runs, the flows between them as
  // steps (shared with the other sheets' steps), the brush state copied out
  queueStroke(data, info) {
    const { planFloats, nSteps, sp, s0, lift, cont, h0, seq, state, restore } = info;
    if (data.length > this.SB || planFloats > 6144) throw new Error('stroke exceeds GPU slot');
    const U = new Uint32Array(data.buffer, data.byteOffset, data.length), BS = this.b.BSTR, bb = this.core.stride.get(BS) * this.s;
    const at = this.staged(data), items = [], copy = (a, ao, b, bo, size) => { if (size > 0) items.push({ t: 'copy', src: a, so: ao, dst: b, do: bo, size }); };
    if (restore !== undefined) {
      const prev = this.brushSlots.get(restore); if (!prev) throw new Error('missing resident brush');
      copy(prev.buffer, 22 * 4, BS, bb + 22 * 4, 8);
      if (cont === 2) copy(prev.buffer, h0 * 4, BS, bb + h0 * 4, (s0 - h0) * 4);
    }
    const cp = (a, b) => copy(null, at + a * 4, BS, bb + a * 4, (b - a) * 4);
    if (cont === 2) { cp(0, 22); cp(24, h0); cp(s0, data.length); } else if (cont === 1) { cp(0, 22); cp(24, data.length); } else cp(0, data.length);
    const serial = data[34] > 0 && process.env.GPU_METERED_SERIAL !== '0';
    const kernel = (serial ? 'stroke_metered' : 'stroke_run') + (data[35] > 0 ? '_full' : '');
    const step = { t: 'steps', damp: !!this.dryS?.dampOnly, slide: (this.o.slide ?? 0) > 0 };
    for (let k = 0; k < nSteps; k++) {
      const flows = U[s0 + k * sp + 6]; if (!flows && k < nSteps - 1) continue;
      items.push({ t: 'brush', kernel }); if (flows) items.push({ ...step, steps: flows });
    }
    if (lift) items.push({ t: 'brush', kernel: 'stroke_end' });
    const saved = this.brushBuffer(state, planFloats * 4);
    copy(BS, bb, saved.buffer, 0, planFloats * 4); Object.assign(saved, { seq, bytes: planFloats * 4 });
    this.core.pendItems(this.s, items);
    this.epoch++; this.knownDry = false; this.gpuAhead = true;
    return null;
  }
  queueSplat(data, { nRec, offRec, flowsBefore, state, restore, seq }) {
    if (data.length > this.SB) throw new Error('GpuSheet: the splat plan is too long');
    const words = new Uint32Array(data.buffer, data.byteOffset, data.length), BS = this.b.BSTR, bb = this.core.stride.get(BS) * this.s;
    const at = this.staged(data), items = [{ t: 'copy', src: null, so: at, dst: BS, do: bb, size: data.byteLength }];
    if (restore !== undefined) {
      const prev = this.brushSlots.get(restore); if (!prev) throw new Error('missing resident splat brush');
      items.push({ t: 'copy', src: prev.buffer, so: 12, dst: BS, do: bb + 12, size: 4 });
    }
    const step = { t: 'steps', damp: !!this.dryS?.dampOnly, slide: (this.o.slide ?? 0) > 0 };
    if (flowsBefore) items.push({ ...step, steps: flowsBefore });
    for (let k = 0; k < nRec; k++) {
      const flows = words[offRec + 6 * k + 5]; if (!flows && k < nRec - 1) continue;
      items.push({ t: 'brush', kernel: 'splat_run' }); if (flows) items.push({ ...step, steps: flows });
    }
    const saved = this.brushBuffer(state, 16);
    items.push({ t: 'copy', src: BS, so: bb, dst: saved.buffer, do: 0, size: 16 }); Object.assign(saved, { seq, bytes: 16 });
    this.core.pendItems(this.s, items);
    this.epoch++; this.knownDry = false; this.gpuAhead = true;
    return null;
  }
  step(steps = 1) {
    this.flushStrokes();
    this.core.pend(this, steps, { damp: !!this.dryS?.dampOnly, slide: (this.o.slide ?? 0) > 0 });
    this.gpuAhead = true;
  }
  // cap sizes direct dispatches only (p3 0); the batch's persistent steps never read it, so no uniform write (and no flush)
  setCap(cap) { this.cap = Math.max(1, Math.min(this.ntiles, Math.ceil(cap))); }
  encodeLevel() { this.flushStrokes(); this.core.pend(this, 0, { level: true }); }
  async surfaceLevel() { this.core.pend(this, 0, { level: true }); const c = await this.counters(); return new Float32Array(c.buffer)[2]; }
  async counters() { await this.core.flushSoon(this.s); return super.counters(); }
  async idle() { this.flushStrokes(); this.core.flushNow(); await this.core.device.queue.onSubmittedWorkDone(); }
  destroy() { this.flushStrokes(); for (const a of this.archives.values()) a.buffer.destroy(); for (const v of this.brushSlots.values()) v.buffer.destroy(); this.optical?.destroy(); }
}
