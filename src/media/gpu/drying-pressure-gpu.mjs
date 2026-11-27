import { dryingPressure } from '../drying-pressure.mjs';
import { dryingPressureWgsl, structuredPressureWgsl } from './drying-pressure-wgsl.mjs';

const GROUP = 256, INNER = 32, MIN_CELLS = 4096, MAX_PASSES = 8, STOP = 5e-7;
const ENTRIES = {
  clear: [1, 7], smooth0: [0, 1, 2, 3, 7, 9], smooth1: [0, 1, 2, 3, 7, 9],
  restrictResidual: [0, 1, 2, 7, 9], prolong: [0, 1, 7, 9], coarseCycle: [0, 1, 2, 3, 7, 8, 9],
  dot: [1, 2, 3, 7, 9], initial: [3, 7, 9], direction0: [1, 4, 7, 9],
  multiply: [0, 3, 4, 5, 7, 9], alpha: [3, 7, 9], update: [2, 4, 5, 6, 7, 9],
  beta: [3, 7, 9], direction: [1, 4, 7, 9],
};
// Scratch and GPU storage grow only. Topology is reused only after an exact cell-by-cell comparison.
function array(owner, key, Type, size) {
  if (!owner[key] || owner[key].length < size) owner[key] = new Type(Math.max(size, Math.ceil((owner[key]?.length ?? 0) * 1.5)));
  return owner[key];
}
function footprint(owner, order, count, index, width, sink, pressure) {
  const F = owner.foot ??= {}, n0 = pressure.length;
  let same = F.count === count && F.width === width && F.size === n0;
  if (same) for (let q = 0; q < count; q++) if (F.cell[q] !== order[q]) { same = false; break; }
  F.count = count; F.width = width; F.size = n0;
  if (!same) {
    owner.hierarchy = null;
    const cell = array(F, 'cell', Int32Array, count); cell.set(order.subarray(0, count));
    const nb = array(F, 'nb', Int32Array, 4 * count); nb.fill(-1, 0, 4 * count);
    const degree = array(F, 'degree', Float32Array, count);
    const comp = array(F, 'comp', Int32Array, count); comp.fill(0, 0, count);
    const anchor = array(F, 'anchor', Uint8Array, count); anchor.fill(0, 0, count);
    const X = array(F, 'X', Int32Array, count), Y = array(F, 'Y', Int32Array, count);
    const loc = array(owner, 'loc', Int32Array, n0), queue = array(F, 'queue', Int32Array, count);
    for (let q = 0; q < count; q++) loc[cell[q]] = q;
    let x0 = width, y0 = n0, x1 = 0, y1 = 0;
    for (let q = 0; q < count; q++) {
      const i = cell[q], x = i % width, y = (i / width) | 0, e = 4 * q;
      X[q] = x; Y[q] = y; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      if (x && index[i - 1]) nb[e] = loc[i - 1];
      if (x + 1 < width && index[i + 1]) nb[e + 1] = loc[i + 1];
      if (i >= width && index[i - width]) nb[e + 2] = loc[i - width];
      if (i + width < n0 && index[i + width]) nb[e + 3] = loc[i + width];
      degree[q] = (nb[e] >= 0) + (nb[e + 1] >= 0) + (nb[e + 2] >= 0) + (nb[e + 3] >= 0);
    }
    for (let q = 0; q < count; q++) { X[q] -= x0; Y[q] -= y0; }
    F.gridWidth = x1 - x0 + 1; F.gridHeight = y1 - y0 + 1;
    let components = 0;
    const sizes = array(F, 'sizes', Int32Array, count + 1), gauges = array(F, 'gauges', Int32Array, count + 1);
    for (let seed = 0; seed < count; seed++) {
      if (comp[seed]) continue;
      const label = ++components; let head = 0, tail = 1, cx = 0, cy = 0;
      queue[0] = seed; comp[seed] = label;
      while (head < tail) {
        const q = queue[head++]; cx += X[q]; cy += Y[q];
        for (let a = 4 * q; a < 4 * q + 4; a++) { const j = nb[a]; if (j >= 0 && !comp[j]) { comp[j] = label; queue[tail++] = j; } }
      }
      sizes[label] = tail; cx /= tail; cy /= tail;
      let gauge = seed, best = Infinity;
      for (let k = 0; k < tail; k++) {
        const q = queue[k], d = (X[q] - cx) ** 2 + (Y[q] - cy) ** 2;
        if (d < best || d === best && cell[q] < cell[gauge]) { best = d; gauge = q; }
      }
      anchor[gauge] = 1; gauges[label] = gauge;
    }
    F.components = components;
  }
  const rhs = array(F, 'rhs', Float64Array, count), solution = array(F, 'solution', Float64Array, count);
  array(F, 'residual', Float64Array, count); array(F, 'upload', Float32Array, count);
  const means = array(F, 'means', Float64Array, F.components + 1); means.fill(0, 0, F.components + 1);
  const compNorm = array(F, 'compNorm', Float64Array, F.components + 1); compNorm.fill(0, 0, F.components + 1);
  let norm = 0;
  for (let q = 0; q < count; q++) { const c = F.comp[q]; means[c] += sink[F.cell[q]] - sink[F.cell[F.gauges[c]]]; }
  for (let c = 1; c <= F.components; c++) means[c] = sink[F.cell[F.gauges[c]]] + means[c] / F.sizes[c];
  for (let q = 0; q < count; q++) {
    rhs[q] = means[F.comp[q]] - sink[F.cell[q]];
    compNorm[F.comp[q]] += rhs[q] ** 2; norm += rhs[q] ** 2;
    solution[q] = pressure[F.cell[q]] - pressure[F.cell[F.gauges[F.comp[q]]]];
  }
  F.norm = norm;
  return F;
}

// Unsmoothed 2x2 aggregation, A_coarse = P^T A P, with four cardinal off-diagonal slots.
function hierarchy(owner, F) {
  const scratch = owner.levelScratch ??= [], levels = [];
  function level(l, n) {
    const L = scratch[l] ??= {}; L.n = n; L.skip = null; L.agg = null;
    for (const key of ['X', 'Y', 'comp']) array(L, key, Int32Array, n);
    array(L, 'nb', Int32Array, 4 * n).fill(-1, 0, 4 * n);
    array(L, 'wt', Float32Array, 4 * n).fill(0, 0, 4 * n);
    array(L, 'diag', Float32Array, n).fill(0, 0, n);
    array(L, 'children', Int32Array, 4 * n).fill(-1, 0, 4 * n);
    levels.push(L); return L;
  }
  const top = level(0, F.count); top.skip = F.anchor;
  top.X.set(F.X.subarray(0, F.count)); top.Y.set(F.Y.subarray(0, F.count)); top.comp.set(F.comp.subarray(0, F.count));
  for (let q = 0; q < F.count; q++) {
    top.diag[q] = F.anchor[q] ? 1 : F.degree[q];
    if (F.anchor[q]) continue;
    for (let e = 0; e < 4; e++) {
      const j = F.nb[4 * q + e]; if (j >= 0 && !F.anchor[j]) { top.nb[4 * q + e] = j; top.wt[4 * q + e] = 1; }
    }
  }
  const counts = array(owner, 'counts', Int32Array, F.components + 1);
  for (let l = 0; l < 15; l++) {
    const L = levels[l]; counts.fill(0, 0, F.components + 1);
    let most = 0, W = 0, H = 0;
    for (let q = 0; q < L.n; q++) {
      W = Math.max(W, L.X[q]); H = Math.max(H, L.Y[q]);
      if (!L.skip?.[q]) most = Math.max(most, ++counts[L.comp[q]]);
    }
    if (most <= 16) break;
    const cw = (W >> 1) + 1, K = F.components + 1, slots = cw * ((H >> 1) + 1) * K;
    const dense = slots <= 2_000_000;
    const hashSize = dense ? slots : 2 ** Math.ceil(Math.log2(Math.max(4, 2 * L.n)));
    const flat = array(owner, 'flat', Int32Array, hashSize); flat.fill(-1, 0, hashSize);
    const keys = dense ? null : array(owner, 'keys', Float64Array, hashSize);
    const agg = array(L, 'aggregate', Int32Array, L.n); agg.fill(-1, 0, L.n); L.agg = agg;
    // Allocate for at most the finer count, then retain the actual coarse count.
    const C = level(l + 1, L.n); let cn = 0;
    for (let q = 0; q < L.n; q++) {
      if (L.skip?.[q]) continue;
      const x = L.X[q] >> 1, y = L.Y[q] >> 1, key = (y * cw + x) * K + L.comp[q];
      let slot = dense ? key : Math.imul(key, 0x9e3779b1) >>> 0 & (hashSize - 1);
      if (!dense) while (flat[slot] >= 0 && keys[slot] !== key) slot = (slot + 1) & (hashSize - 1);
      let a = flat[slot];
      if (a < 0) { a = cn++; flat[slot] = a; if (keys) keys[slot] = key; C.X[a] = x; C.Y[a] = y; C.comp[a] = L.comp[q]; }
      agg[q] = a;
    }
    if (cn >= L.n) { levels.pop(); L.agg = null; break; }
    C.n = cn;
    const used = array(owner, 'used', Uint8Array, cn); used.fill(0, 0, cn);
    for (let q = 0; q < L.n; q++) {
      const a = agg[q]; if (a < 0) continue;
      C.children[4 * a + used[a]++] = q; C.diag[a] += L.diag[q];
      for (let e = 0; e < 4; e++) {
        const j = L.nb[4 * q + e]; if (j < 0) continue;
        const c = agg[j], weight = L.wt[4 * q + e];
        if (c === a) C.diag[a] -= weight;
        else if (c >= 0) {
          const dx = C.X[c] - C.X[a], dy = C.Y[c] - C.Y[a];
          const slot = dy === 0 ? (dx < 0 ? 0 : 1) : (dy < 0 ? 2 : 3);
          C.nb[4 * a + slot] = c; C.wt[4 * a + slot] += weight;
        }
      }
    }
  }
  let total = 0;
  for (const L of levels) { L.offset = total; total += L.n; }
  const words = array(owner, 'graphWords', Int32Array, total * 16), floats = new Float32Array(words.buffer);
  for (let l = 0; l < levels.length; l++) {
    const L = levels[l];
    for (let q = 0; q < L.n; q++) {
      const base = 16 * (L.offset + q);
      for (let e = 0; e < 4; e++) {
        const j = L.nb[4 * q + e]; words[base + e] = j < 0 ? -1 : L.offset + j; floats[base + 4 + e] = L.wt[4 * q + e];
      }
      for (let e = 0; e < 4; e++) { const c = L.children[4 * q + e]; words[base + 8 + e] = l === 0 || c < 0 ? -1 : levels[l - 1].offset + c; }
      floats[base + 12] = L.diag[q]; words[base + 13] = L.agg?.[q] >= 0 ? levels[l + 1].offset + L.agg[q] : -1;
      words[base + 14] = 0; words[base + 15] = 0;
    }
  }
  // Components are compact integer labels. Group and factor without JS Maps or per-block allocations.
  const C = levels.at(-1), heads = array(owner, 'heads', Int32Array, F.components + 1); heads.fill(-1, 0, F.components + 1);
  const next = array(owner, 'next', Int32Array, C.n), at = array(owner, 'at', Int32Array, C.n), nodes = array(owner, 'nodes', Int32Array, C.n);
  for (let q = C.n - 1; q >= 0; q--) { next[q] = heads[C.comp[q]]; heads[C.comp[q]] = q; }
  const terms = array(owner, 'terms', Int32Array, Math.max(2, 32 * C.n)), tf = new Float32Array(terms.buffer);
  let nt = 0;
  counts.fill(0, 0, F.components + 1);
  for (let q = 0; q < C.n; q++) if (++counts[C.comp[q]] > 16) return null;
  for (let c = 1; c <= F.components; c++) {
    let m = 0; for (let q = heads[c]; q >= 0; q = next[q]) { at[q] = m; nodes[m++] = q; }
    if (!m) continue;
    const A = array(owner, 'A', Float64Array, m * m); A.fill(0, 0, m * m);
    const inv = array(owner, 'inv', Float64Array, m * m), y = array(owner, 'y', Float64Array, m);
    for (let k = 0; k < m; k++) {
      const q = nodes[k]; A[k * m + k] = C.diag[q];
      for (let e = 0; e < 4; e++) { const j = C.nb[4 * q + e]; if (j >= 0) A[k * m + at[j]] = -C.wt[4 * q + e]; }
    }
    for (let j = 0; j < m; j++) {
      let v = A[j * m + j]; for (let k = 0; k < j; k++) v -= A[j * m + k] ** 2;
      A[j * m + j] = Math.sqrt(Math.max(v, 1e-300));
      for (let i = j + 1; i < m; i++) { let v = A[i * m + j]; for (let k = 0; k < j; k++) v -= A[i * m + k] * A[j * m + k]; A[i * m + j] = v / A[j * m + j]; }
    }
    for (let col = 0; col < m; col++) {
      for (let i = 0; i < m; i++) { let v = i === col ? 1 : 0; for (let k = 0; k < i; k++) v -= A[i * m + k] * y[k]; y[i] = v / A[i * m + i]; }
      for (let i = m - 1; i >= 0; i--) { let v = y[i]; for (let k = i + 1; k < m; k++) v -= A[k * m + i] * inv[k * m + col]; inv[i * m + col] = v / A[i * m + i]; }
    }
    for (let k = 0; k < m; k++) {
      const base = 16 * (C.offset + nodes[k]); words[base + 14] = nt / 2; words[base + 15] = m;
      for (let j = 0; j < m; j++) { terms[nt++] = C.offset + nodes[j]; tf[nt++] = inv[k * m + j]; }
    }
  }
  return { levels, total, graph: words.subarray(0, total * 16), inverse: terms.subarray(0, Math.max(2, nt)) };
}

// Components retain independent fine-grid gauges. Aggregation may share a
// coarse unknown across disconnected components: this is still P^T A P, and
// introduces no fine-grid faces. Dense multi-component washes therefore need
// no host graph either; sparse boxes retain the compact component graph.
// No host hierarchy construction: only a 4-byte mask is uploaded. All stencil
// weights, restriction and prolongation indices are derived on the device.
function structuredHierarchy(owner, F) {
  let w = F.gridWidth, h = F.gridHeight;
  const fine = w * h, levels = []; let total = 0;
  do {
    levels.push({ offset: total, n: w * h, w, h }); total += w * h;
    if (w * h <= 16) break;
    w = (w + 1) >> 1; h = (h + 1) >> 1;
  } while (levels.length < 15);
  if (levels.at(-1).n > 16) return null;
  const mask = array(owner, 'gridMask', Uint32Array, fine); mask.fill(0, 0, fine);
  const at = array(F, 'gridAt', Int32Array, F.count);
  for (let q = 0; q < F.count; q++) { const i = F.Y[q] * levels[0].w + F.X[q]; at[q] = i; mask[i] = F.anchor[q] ? 2 : 1; }
  return { structured: true, fine, levels, total, mask: mask.subarray(0, fine) };
}

function defect(F) {
  const { count, degree, solution, nb, rhs, residual: r, anchor } = F;
  const compRes = array(F, 'compRes', Float64Array, F.components + 1); compRes.fill(0, 0, F.components + 1);
  let residual = 0, scale = 0;
  for (let q = 0, e = 0; q < count; q++, e += 4) {
    let lap = degree[q] * solution[q];
    const w = nb[e], east = nb[e + 1], n = nb[e + 2], south = nb[e + 3];
    if (w >= 0) lap -= solution[w]; if (east >= 0) lap -= solution[east];
    if (n >= 0) lap -= solution[n]; if (south >= 0) lap -= solution[south];
    const v = rhs[q] - lap; residual += v * v; compRes[F.comp[q]] += v * v;
    const value = anchor[q] ? 0 : v; r[q] = value;
    scale = Math.max(scale, Math.abs(value));
  }
  let relativeResidual = 0;
  for (let c = 1; c <= F.components; c++) {
    // A uniform component has no centered forcing. Keep an absolute floor for
    // roundoff, but never let another component's sink hide a local defect.
    const relative = compRes[c] <= 1e-30 ? 0 : Math.sqrt(compRes[c] / Math.max(F.compNorm[c], 1e-30));
    relativeResidual = Math.max(relativeResidual, relative);
  }
  return { relativeResidual, globalResidual: residual, scale };
}

export class GpuDryingPressure {
  constructor(device) {
    this.device = device; this.buffers = {}; this.uniforms = []; this.bindings = null;
    const module = device.createShaderModule({ label: 'drying pressure MG-PCG', code: dryingPressureWgsl });
    this.pipelines = {}; this.structuredPipelines = {};
    const structuredModule = device.createShaderModule({ label: 'structured pressure MG-PCG', code: structuredPressureWgsl });
    for (const entryPoint of [...Object.keys(ENTRIES), 'buildFine', 'buildCoarse', 'buildInverse']) this.structuredPipelines[entryPoint] = device.createComputePipeline({ label: 'grid pressure ' + entryPoint, layout: 'auto', compute: { module: structuredModule, entryPoint } });
    for (const entryPoint of Object.keys(ENTRIES)) this.pipelines[entryPoint] = device.createComputePipeline({ label: 'pressure ' + entryPoint, layout: 'auto', compute: { module, entryPoint } });
  }

  storage(name, bytes, usage) {
    const limit = usage & GPUBufferUsage.STORAGE ? Math.min(this.device.limits.maxBufferSize, this.device.limits.maxStorageBufferBindingSize) : this.device.limits.maxBufferSize;
    if (bytes > limit) throw new RangeError(`${name}: ${bytes} bytes exceeds device limit ${limit}`);
    const old = this.buffers[name];
    if (old && old.size >= bytes) return old;
    old?.destroy(); this.bindings = null;
    return this.buffers[name] = this.device.createBuffer({ size: Math.min(limit, Math.max(4, Math.ceil(bytes * 1.25 / 4) * 4)), usage });
  }

  async solve(order, count, index, width, sink, fluxX, fluxY, pressure) {
    const cpu = reason => ({ ...dryingPressure(order, count, index, width, sink, fluxX, fluxY, pressure), backend: 'cpu', fallback: reason !== 'small', reason });
    if (count < MIN_CELLS) return cpu('small');
    const started = performance.now();
    const F = footprint(this, order, count, index, width, sink, pressure);
    const footprintMs = performance.now() - started; let hierarchyMs = 0, gpuMs = 0, defectMs = 0;
    const defectStart = performance.now();
    let status = defect(F), passes = 0, iterations = 0;
    defectMs += performance.now() - defectStart;
    const passResiduals = [];
    if (status.relativeResidual > STOP) {
      const hierarchyStart = performance.now();
      // At 25% occupancy, 16-byte grid stencils use no more fine-level
      // storage than the compact graph's 64-byte nodes.
      const fresh = !this.hierarchy, H = this.hierarchy ??= (F.components === 1 || F.gridWidth * F.gridHeight <= 4 * count ? structuredHierarchy(this, F) : hierarchy(this, F)), d = this.device;
      hierarchyMs = performance.now() - hierarchyStart;
      if (!H) return cpu('hierarchy limits');
      const fine = H.fine ?? count, structured = H.structured, pipelines = structured ? this.structuredPipelines : this.pipelines;
      const graphBytes = structured ? H.total * 16 : H.graph.byteLength;
      const inverseBytes = structured ? 8 * H.levels.at(-1).n ** 2 : H.inverse.byteLength;
      const vecBytes = 4 * H.total, fineBytes = 4 * fine, maskBytes = structured ? fineBytes : 0;
      const storageLimit = Math.min(d.limits.maxBufferSize, d.limits.maxStorageBufferBindingSize);
      if ([graphBytes, inverseBytes, vecBytes, fineBytes, maskBytes, 32].some(bytes => bytes > storageLimit)
        || fineBytes + 32 > d.limits.maxBufferSize || 528 > d.limits.maxBufferSize
        || Math.ceil(H.total / GROUP) > d.limits.maxComputeWorkgroupsPerDimension) return cpu('device limits');
      const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
      const graph = this.storage('graph', graphBytes, storage), inverse = this.storage('inverse', inverseBytes, storage);
      const x = this.storage('x', vecBytes, storage), b = this.storage('b', vecBytes, storage), tmp = this.storage('tmp', vecBytes, storage);
      const p = this.storage('p', fineBytes, storage), ap = this.storage('ap', fineBytes, storage), out = this.storage('out', fineBytes, storage | GPUBufferUsage.COPY_SRC);
      const scalar = this.storage('scalar', 32, storage | GPUBufferUsage.COPY_SRC), read = this.storage('read', fineBytes + 32, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
      const groups = Math.ceil(fine / GROUP);
      const mask = structured ? this.storage('mask', maskBytes, storage) : null;
      let coarseStart = H.levels.findIndex(L => L.n <= 512);
      if (coarseStart < 0) coarseStart = H.levels.length - 1;
      if (fresh) this.bindings = null;
      if (fresh || !this.bindings) {
        if (structured) d.queue.writeBuffer(mask, 0, H.mask);
        else { d.queue.writeBuffer(graph, 0, H.graph); d.queue.writeBuffer(inverse, 0, H.inverse); }
        const bindings = this.bindings ??= [];
        for (let l = 0; l < H.levels.length; l++) {
          const L = H.levels[l], uniform = this.uniforms[l] ??= d.createBuffer({ size: 528, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
          const words = new Uint32Array(132); words.set([L.offset, L.n, fine, groups]);
          H.levels.forEach((level, k) => words.set([level.offset, level.n, H.levels.length, coarseStart], 4 + 4 * k));
          if (structured) { H.levels.forEach((level, k) => words.set([level.w, level.h, 0, 0], 68 + 4 * k)); words[128] = l; }
          d.queue.writeBuffer(uniform, 0, words);
          if (!bindings[l]) {
            const all = [graph, x, b, tmp, p, ap, out, scalar, inverse, uniform, mask], result = bindings[l] = {};
            for (const [name, pipeline] of Object.entries(pipelines)) {
              // Scalar/PCG kernels run only on level zero; the shared-memory
              // coarse cycle needs no per-level bind groups for smoothing.
              if (name === 'buildInverse' ? l !== H.levels.length - 1
                : name === 'buildCoarse' || name === 'restrictResidual' ? l === 0
                : ['smooth0', 'smooth1', 'prolong'].includes(name) ? l >= coarseStart : l !== 0) continue;
              const entries = name === 'buildFine' ? [0, 9, 10] : name === 'buildCoarse' ? [0, 9] : name === 'buildInverse' ? [0, 8, 9] : structured && name === 'restrictResidual' ? [0, 1, 2, 3, 7, 9] : ENTRIES[name];
              result[name] = d.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: entries.map(binding => ({ binding, resource: { buffer: all[binding] } })) });
            }
          }
        }
      }
      const bindings = this.bindings, rhs = structured ? array(F, 'gridUpload', Float32Array, fine) : F.upload;
      if (structured) rhs.fill(0, 0, fine);
      // A hard wash is much cheaper to refine on-device than to rebuild and
      // solve on the CPU. Check the original equations after every pass.
      for (; passes < MAX_PASSES && status.relativeResidual > STOP; passes++) {
        if (!(status.scale > 0) || !Number.isFinite(status.scale)) break;
        for (let q = 0; q < count; q++) rhs[structured ? F.gridAt[q] : q] = F.residual[q] / status.scale;
        d.queue.writeBuffer(b, 0, rhs, 0, fine);
        const gpuStart = performance.now();
        const encoder = d.createCommandEncoder(); encoder.clearBuffer(out);
        // Active before the first preconditioner; convergence makes every subsequent dispatch a no-op.
        d.queue.writeBuffer(scalar, 0, new Float32Array([0, 0, 0, 0, 1, 0, 0, 0]));
        const pass = encoder.beginComputePass();
        const run = (name, l = 0, workgroups = Math.ceil(H.levels[l].n / GROUP)) => {
          pass.setPipeline(pipelines[name]); pass.setBindGroup(0, bindings[l][name]); pass.dispatchWorkgroups(workgroups);
        };
        const precondition = () => {
          run('clear', 0, Math.ceil(H.total / GROUP));
          for (let l = 0; l < coarseStart; l++) { run('smooth0', l); run('smooth1', l); run('restrictResidual', l + 1); }
          run('coarseCycle', 0, 1);
          for (let l = coarseStart - 1; l >= 0; l--) { run('prolong', l); run('smooth0', l); run('smooth1', l); }
        };
        if (structured && fresh && passes === 0) { run('buildFine'); for (let l = 1; l < H.levels.length; l++) run('buildCoarse', l); run('buildInverse', H.levels.length - 1, 1); }
        precondition(); run('dot'); run('initial', 0, 1); run('direction0');
        for (let it = 0; it < INNER; it++) {
          run('multiply'); run('alpha', 0, 1); run('update'); precondition(); run('dot'); run('beta', 0, 1); run('direction');
        }
        pass.end(); encoder.copyBufferToBuffer(out, 0, read, 0, fine * 4); encoder.copyBufferToBuffer(scalar, 0, read, fine * 4, 32); d.queue.submit([encoder.finish()]);
        await read.mapAsync(GPUMapMode.READ, 0, fine * 4 + 32);
        try {
          const mapped = read.getMappedRange(0, fine * 4 + 32), correction = new Float32Array(mapped, 0, fine);
          iterations += new Float32Array(mapped, fine * 4, 8)[5];
          for (let q = 0; q < count; q++) F.solution[q] += correction[structured ? F.gridAt[q] : q] * status.scale;
        }
        finally { read.unmap(); }
        gpuMs += performance.now() - gpuStart;
        const defectStart = performance.now(); status = defect(F); defectMs += performance.now() - defectStart; passResiduals.push(status.relativeResidual);
      }
    }
    if (!Number.isFinite(status.relativeResidual) || status.relativeResidual > 1e-6) {
      // Retain a finite GPU correction if an unusually difficult footprint still
      // needs the double-precision solver. Never restart that solve from zero.
      if (Number.isFinite(status.relativeResidual)) for (let q = 0; q < count; q++) pressure[F.cell[q]] = F.solution[q];
      return { ...cpu('refinement tolerance'), gpuResidual: status.relativeResidual, passes, passResiduals };
    }
    for (let q = 0; q < count; q++) {
      const i = F.cell[q], e = 4 * q, v = F.solution[q]; pressure[i] = v;
      fluxX[i] = F.nb[e + 1] >= 0 ? v - F.solution[F.nb[e + 1]] : 0;
      fluxY[i] = F.nb[e + 3] >= 0 ? v - F.solution[F.nb[e + 3]] : 0;
    }
    return { components: F.components, iterations, relativeResidual: status.relativeResidual, backend: 'gpu', fallback: false, passes, passResiduals, structured: this.hierarchy?.structured ?? false, timings: { footprintMs, hierarchyMs, gpuMs, defectMs } };
  }

  release() {
    for (const buffer of Object.values(this.buffers)) buffer.destroy();
    for (const buffer of this.uniforms) buffer.destroy();
    this.buffers = {}; this.uniforms = []; this.bindings = null; this.hierarchy = null;
  }
  destroy() { this.release(); this.foot = null; this.levelScratch = null; this.loc = null; }
}
