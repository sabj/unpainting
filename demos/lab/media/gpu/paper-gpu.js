// Generated from src/media/gpu/paper-gpu.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Metal/WebGPU procedural paper relief, grain field, and makePaper generator (physical & non-physical).
// Dual-purpose & browser-safe: pairs with CPU paperRelief / makePaper / subcellSpread init with zero Node-only imports.
import { dispatch1D } from './dispatch-1d.js';
import { PAPER_GPU_WGSL } from './paper-gpu-wgsl.js';
import { reliefFieldData, HEIGHT_SPAN_UM } from '../paper-relief.js';
import { GRAIN_MM, grainUnit } from '../grain-field.js';
import { SURFACE_MM, makePaper } from '../paper.js';
import { fibreThroat } from '../fibre-throat.js';

const PIPELINES = new WeakMap();
const TILE_CACHE = new WeakMap();

async function getPipelines(device) {
  let cached = PIPELINES.get(device);
  if (cached) return cached;
  device.pushErrorScope('validation');
  const module = device.createShaderModule({ code: PAPER_GPU_WGSL });

  const reliefLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const fieldLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const reliefPl = device.createPipelineLayout({ bindGroupLayouts: [reliefLayout] });
  const fieldPl = device.createPipelineLayout({ bindGroupLayouts: [fieldLayout] });

  const p = {
    eval_relief: device.createComputePipeline({ label: 'paper-eval_relief', layout: reliefPl, compute: { module, entryPoint: 'eval_relief' } }),
  };
  for (const name of [
    'box_x', 'box_y', 'gauss_x', 'gauss_y', 'sub_scale', 'norm_scale', 'reduce_stats',
    'finalize_tooth_cap_proud', 'finalize_fibres', 'finalize_hollow_rel2',
    'nonphys_height', 'upsample_bil',
    'cockle_raw', 'cockle_center_sq', 'cockle_surface',
  ]) {
    p[name] = device.createComputePipeline({ label: 'paper-' + name, layout: fieldPl, compute: { module, entryPoint: name } });
  }

  const err = await device.popErrorScope();
  if (err) throw new Error(`paper-gpu pipeline error: ${err.message}`);
  cached = { reliefLayout, fieldLayout, p };
  PIPELINES.set(device, cached);
  return cached;
}

function cachedTileBuffer(device, arr) {
  let map = TILE_CACHE.get(device);
  if (!map) { map = new WeakMap(); TILE_CACHE.set(device, map); }
  let buf = map.get(arr);
  if (!buf) {
    buf = device.createBuffer({
      size: Math.max(16, arr.byteLength),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buf, 0, arr);
    map.set(arr, buf);
  }
  return buf;
}

function mkBuf(device, bytes) {
  return device.createBuffer({
    size: Math.max(16, Math.ceil(bytes / 4) * 4),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
}

async function readFloatBufs(device, entries) {
  const reads = entries.map(([buf, bytes]) => ({
    src: buf,
    bytes,
    rd: device.createBuffer({ size: Math.max(16, bytes), usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }),
  }));
  try {
    const enc = device.createCommandEncoder();
    for (const r of reads) enc.copyBufferToBuffer(r.src, 0, r.rd, 0, r.bytes);
    device.queue.submit([enc.finish()]);
    await Promise.all(reads.map(r => r.rd.mapAsync(GPUMapMode.READ)));
    return reads.map(r => {
      const out = new Float32Array(r.rd.getMappedRange(0, r.bytes)).slice();
      r.rd.unmap();
      return out;
    });
  } finally {
    for (const r of reads) r.rd.destroy();
  }
}

function gaussKernel(sigma) {
  const r = Math.max(1, Math.ceil(3 * sigma));
  const k = new Float32Array(2 * r + 1);
  let t = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + r] = v;
    t += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= t;
  return { r, k };
}

function cockleKnotGrid(w, h, mmPerCell, seed, waveMm) {
  const [broad, fine] = waveMm;
  const maxX = (w - 0.5) * mmPerCell, maxY = (h - 0.5) * mmPerCell;
  const hash = (x, y, s) => {
    const q = Math.sin(x * 127.1 + y * 311.7 + s * 74.7 + seed * 19.9) * 43758.5453;
    return q - Math.floor(q);
  };
  const gw0 = Math.floor(maxX / broad) + 2, gh0 = Math.floor(maxY / broad) + 2;
  const g0 = new Float32Array(gw0 * gh0);
  for (let y = 0; y < gh0; y++) for (let x = 0; x < gw0; x++) g0[y * gw0 + x] = hash(x, y, 1);

  const ox1 = Math.floor(7.3), oy1 = Math.floor(2.9);
  const gw1 = Math.floor(maxX / fine + 7.3) - ox1 + 2;
  const gh1 = Math.floor(maxY / fine + 2.9) - oy1 + 2;
  const g1 = new Float32Array(gw1 * gh1);
  for (let y = 0; y < gh1; y++) for (let x = 0; x < gw1; x++) g1[y * gw1 + x] = hash(x + ox1, y + oy1, 2);
  return { g0, gw0, gh0, g1, gw1, gh1 };
}

function nonPhysKnotGrids(w, h, ts, ps, seed) {
  const hash = (x, y) => {
    const q = Math.sin(x * 127.1 + y * 311.7 + seed * 17.3) * 43758.5453;
    return q - Math.floor(q);
  };
  const s0 = 2.5 * ts, s1 = 7 * ps;
  const gw0 = Math.floor((w - 1) / s0) + 2, gh0 = Math.floor((h - 1) / s0) + 2;
  const g0 = new Float32Array(gw0 * gh0);
  for (let y = 0; y < gh0; y++) for (let x = 0; x < gw0; x++) g0[y * gw0 + x] = hash(x, y);

  const gw1 = Math.floor((w - 1) / s1) + 2, gh1 = Math.floor((h - 1) / s1) + 2;
  const g1 = new Float32Array(gw1 * gh1);
  for (let y = 0; y < gh1; y++) for (let x = 0; x < gw1; x++) g1[y * gw1 + x] = hash(x + 11, y + 3);
  return { g0, gw0, gh0, g1, gw1, gh1, s0, s1 };
}

// O(n) in-place Floyd-Rivest / Hoare quickselect: matches Float32Array.sort()[k] exactly without O(n log n) sort cost.
function nthElement(arr, k, left = 0, right = arr.length - 1) {
  while (right > left) {
    if (right - left > 600) {
      const n = right - left + 1, m = k - left + 1, z = Math.log(n);
      const s = 0.5 * Math.exp((2 * z) / 3);
      const sd = 0.5 * Math.sqrt((z * s * (n - s)) / n) * (m - n / 2 < 0 ? -1 : 1);
      nthElement(arr, k, Math.max(left, Math.floor(k - (m * s) / n + sd)), Math.min(right, Math.floor(k + ((n - m) * s) / n + sd)));
    }
    const t = arr[k];
    let i = left, j = right;
    arr[k] = arr[left]; arr[left] = t;
    if (arr[right] > t) { arr[left] = arr[right]; arr[right] = t; }
    while (i < j) {
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      i++; j--;
      while (arr[i] < t) i++;
      while (arr[j] > t) j--;
    }
    if (arr[left] === t) { arr[left] = arr[j]; arr[j] = t; }
    else { j++; arr[right] = arr[j]; arr[j] = t; }
    if (j <= k) left = j + 1;
    if (k <= j) right = j - 1;
  }
  return arr[k];
}

function encodeRelief(device, pipe, dummy, w, h, mmPerCell, fieldData, outZUm, outHeight) {
  const maxPerDim = device.limits.maxComputeWorkgroupsPerDimension;
  const { tiles, off, rmsUm, strength } = fieldData;
  const k = Math.max(1, Math.min(8, Math.ceil(mmPerCell / 0.04)));
  const bT0 = cachedTileBuffer(device, tiles[0].z);
  const bT1 = tiles.length > 1 ? cachedTileBuffer(device, tiles[1].z) : dummy;
  const bS = strength ? cachedTileBuffer(device, strength.z) : dummy;

  const splitStep = s => { const hi = Math.round(s * 256) / 256; return [hi, s - hi]; };
  const [s0Hi, s0Lo] = splitStep(mmPerCell / tiles[0].dx);
  const [s1Hi, s1Lo] = tiles.length > 1 ? splitStep(mmPerCell / tiles[1].dx) : [0, 0];
  const [sSHi, sSLo] = strength ? splitStep(mmPerCell / strength.dx) : [0, 0];
  const wrapOff = (o, dx, n) => ((o / dx) % n + n) % n;

  const uBuf = new ArrayBuffer(80);
  const u32 = new Uint32Array(uBuf), f32 = new Float32Array(uBuf);
  u32[0] = w; u32[1] = h; u32[2] = k; u32[3] = tiles.length;
  u32[4] = tiles[0].n; u32[5] = tiles.length > 1 ? tiles[1].n : 1;
  u32[6] = strength ? strength.n : 1; u32[7] = strength ? 1 : 0;
  f32[8] = rmsUm; f32[9] = 1 / HEIGHT_SPAN_UM;
  f32[10] = s0Hi; f32[11] = s0Lo;
  f32[12] = s1Hi; f32[13] = s1Lo;
  f32[14] = sSHi; f32[15] = sSLo;
  f32[16] = wrapOff(off[0][0], tiles[0].dx, tiles[0].n);
  f32[17] = wrapOff(off[0][1], tiles[0].dx, tiles[0].n);
  f32[18] = tiles.length > 1 ? wrapOff(off[1][0], tiles[1].dx, tiles[1].n) : 0;
  f32[19] = tiles.length > 1 ? wrapOff(off[1][1], tiles[1].dx, tiles[1].n) : 0;

  const uGpu = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(uGpu, 0, uBuf);
  const bg = device.createBindGroup({
    layout: pipe.reliefLayout,
    entries: [uGpu, bT0, bT1, bS, outZUm, outHeight].map((buffer, binding) => ({ binding, resource: { buffer } })),
  });
  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(pipe.p.eval_relief);
  pass.setBindGroup(0, bg);
  dispatch1D(pass, w * h, 256, maxPerDim);
  pass.end();
  device.queue.submit([enc.finish()]);
  return uGpu;
}

/**
 * Evaluate paperRelief(w, h, mmPerCell, { seed, relief }) on Metal/WebGPU.
 * Matches CPU paperRelief tightly (< 1e-5 um difference).
 */
export async function paperReliefGpu(device, w, h, mmPerCell, { seed = 1, relief = 'cold' } = {}) {
  if (!(mmPerCell > 0)) throw new Error('paper-gpu: mmPerCell must be positive');
  const pipe = await getPipelines(device);
  const fieldData = reliefFieldData(relief, seed);
  const n = w * h, bytes = n * 4;
  const dummy = mkBuf(device, 16);
  const outZUm = mkBuf(device, bytes);
  const outHeight = mkBuf(device, bytes);
  let uGpu = null;
  try {
    device.pushErrorScope('validation');
    uGpu = encodeRelief(device, pipe, dummy, w, h, mmPerCell, fieldData, outZUm, outHeight);
    const err = await device.popErrorScope();
    if (err) throw new Error(`paper-gpu relief validation error: ${err.message}`);
    const [zUm, height] = await readFloatBufs(device, [[outZUm, bytes], [outHeight, bytes]]);
    return { zUm, height, rmsUm: fieldData.rmsUm, hollowRmsUm: fieldData.hollowRmsUm, preset: fieldData.preset };
  } finally {
    uGpu?.destroy(); dummy.destroy(); outZUm.destroy(); outHeight.destroy();
  }
}

/**
 * Compute fine paper height + granulation deltaZ = (zref - z) / unit on Metal/WebGPU in one pass.
 * Eliminates the redundant second paperRelief + 2 CPU Gaussian blurs during finish.mjs!
 */
export async function finishReliefAndGrainGpu(device, FW, FH, fineMm, N, { seed = 1, relief = 'cold' } = {}) {
  const pipe = await getPipelines(device);
  const fieldData = reliefFieldData(relief, seed);
  const FN = FW * FH, bytes = FN * 4;
  const maxPerDim = device.limits.maxComputeWorkgroupsPerDimension;

  const dummy = mkBuf(device, 16);
  const dummyB = mkBuf(device, 16);
  const dummyC = mkBuf(device, 16);
  const bZUm = mkBuf(device, bytes);
  const bHeight = mkBuf(device, bytes);
  const bTmp = mkBuf(device, bytes);
  const bZ = mkBuf(device, bytes);
  const bZref = mkBuf(device, bytes);
  const bDeltaZ = mkBuf(device, bytes);

  const g1 = gaussKernel(GRAIN_MM / fineMm);
  const g2 = gaussKernel(N);
  const bK1 = mkBuf(device, g1.k.byteLength);
  const bK2 = mkBuf(device, g2.k.byteLength);
  const uF = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  let uRel = null;

  const unit = grainUnit({ seed, relief }) * HEIGHT_SPAN_UM;

  try {
    device.pushErrorScope('validation');
    uRel = encodeRelief(device, pipe, dummy, FW, FH, fineMm, fieldData, bZUm, bHeight);
    device.queue.writeBuffer(bK1, 0, g1.k);
    device.queue.writeBuffer(bK2, 0, g2.k);

    const runField = (name, r, p0, sA, sB, sC, dA, dB = dummyB, dC = dummyC) => {
      const ab = new ArrayBuffer(64);
      const u32 = new Uint32Array(ab), f32 = new Float32Array(ab);
      u32[0] = FW; u32[1] = FH; u32[2] = FN; u32[3] = r; f32[8] = p0;
      device.queue.writeBuffer(uF, 0, ab);
      const bg = device.createBindGroup({
        layout: pipe.fieldLayout,
        entries: [uF, sA, sB, sC, dA, dB, dC].map((buffer, binding) => ({ binding, resource: { buffer } })),
      });
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipe.p[name]);
      pass.setBindGroup(0, bg);
      dispatch1D(pass, FN, 256, maxPerDim);
      pass.end();
      device.queue.submit([enc.finish()]);
    };

    runField('gauss_x', g1.r, 0, bZUm, bK1, dummy, bTmp);
    runField('gauss_y', g1.r, 0, bTmp, bK1, dummy, bZ);
    runField('gauss_x', g2.r, 0, bZ, bK2, dummy, bTmp);
    runField('gauss_y', g2.r, 0, bTmp, bK2, dummy, bZref);
    runField('sub_scale', 0, 1 / unit, bZref, bZ, dummy, bDeltaZ);

    const err = await device.popErrorScope();
    if (err) throw new Error(`paper-gpu finishReliefAndGrain validation error: ${err.message}`);

    const [height, deltaZ] = await readFloatBufs(device, [[bHeight, bytes], [bDeltaZ, bytes]]);
    return { height, deltaZ };
  } finally {
    uRel?.destroy(); uF.destroy(); dummy.destroy(); dummyB.destroy(); dummyC.destroy();
    bZUm.destroy(); bHeight.destroy(); bTmp.destroy(); bZ.destroy(); bZref.destroy(); bDeltaZ.destroy();
    bK1.destroy(); bK2.destroy();
  }
}

/**
 * Compute fine granulation deltaZ = (hRef - hFine) / hollowUnit on WebGPU from a coarse height field
 * for non-physical papers (which have no physical reliefOf preset).
 */
export async function fineDeltaZFromHeightGpu(device, height, w, h, N, hollowUnit) {
  const pipe = await getPipelines(device);
  const FW = w * N, FH = h * N, FN = FW * FH, bytes = FN * 4;
  const maxPerDim = device.limits.maxComputeWorkgroupsPerDimension;
  const g = gaussKernel(N);

  const dummy = mkBuf(device, 16);
  const dummyB = mkBuf(device, 16);
  const dummyC = mkBuf(device, 16);
  const bCoarse = mkBuf(device, height.byteLength);
  const bFine = mkBuf(device, bytes);
  const bTmp = mkBuf(device, bytes);
  const bRef = mkBuf(device, bytes);
  const bDeltaZ = mkBuf(device, bytes);
  const bK = mkBuf(device, g.k.byteLength);
  const uF = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  const runField = (name, params, sA, sB, sC, dA) => {
    const ab = new ArrayBuffer(64);
    const u32 = new Uint32Array(ab), f32 = new Float32Array(ab);
    u32[0] = FW; u32[1] = FH; u32[2] = FN; u32[3] = params.radius ?? 0;
    u32[4] = params.gw0 ?? 0; u32[5] = params.gh0 ?? 0;
    f32[8] = params.p0 ?? 0;
    device.queue.writeBuffer(uF, 0, ab);
    const bg = device.createBindGroup({
      layout: pipe.fieldLayout,
      entries: [uF, sA, sB, sC, dA, dummyB, dummyC].map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipe.p[name]);
    pass.setBindGroup(0, bg);
    dispatch1D(pass, FN, 256, maxPerDim);
    pass.end();
    device.queue.submit([enc.finish()]);
  };

  try {
    device.pushErrorScope('validation');
    device.queue.writeBuffer(bCoarse, 0, height);
    device.queue.writeBuffer(bK, 0, g.k);
    runField('upsample_bil', { radius: N, gw0: w, gh0: h }, bCoarse, dummy, dummy, bFine);
    runField('gauss_x', { radius: g.r }, bFine, bK, dummy, bTmp);
    runField('gauss_y', { radius: g.r }, bTmp, bK, dummy, bRef);
    runField('sub_scale', { p0: 1 / (hollowUnit || 1) }, bRef, bFine, dummy, bDeltaZ);
    const err = await device.popErrorScope();
    if (err) throw new Error(`paper-gpu fineDeltaZFromHeight validation error: ${err.message}`);
    const [deltaZ] = await readFloatBufs(device, [[bDeltaZ, bytes]]);
    return deltaZ;
  } finally {
    uF.destroy(); dummy.destroy(); dummyB.destroy(); dummyC.destroy();
    bCoarse.destroy(); bFine.destroy(); bTmp.destroy(); bRef.destroy(); bDeltaZ.destroy(); bK.destroy();
  }
}

/**
 * Full procedural makePaper(w, h, options) accelerated on Metal/WebGPU for BOTH physical
 * (mmPerCell / coldPress) and non-physical (Paint Lab surface presets) sheets.
 * Falls back cleanly to CPU makePaper when no WebGPU device is provided.
 */
export async function makePaperGpu(device, w, h, options = {}) {
  // Full-size planes dominate normal paper bindings. Check before pipelines or host arrays.
  const bytesNeeded = Math.max(64, w * h * 4);
  if (!device || !Number.isSafeInteger(bytesNeeded) || bytesNeeded > device.limits.maxStorageBufferBindingSize || bytesNeeded > device.limits.maxBufferSize) return makePaper(w, h, options);
  const {
    seed = 1, fibres = 0.5, tooth: toothWeight = 0.5, fibreLength = 14, cmin = 0.2, cmax = 0.55, scale = 1,
    toothScale = 1, patternScale = 1, proudBlur = 1, coldPress = null, mmPerCell = 0,
    relief = 'cold', grainMm = 0, cockle = {},
  } = options ?? {};
  const physMm = coldPress ? coldPress.mmPerCell : mmPerCell;
  const isPhys = physMm > 0;

  const fieldData = isPhys ? reliefFieldData(relief, seed) : null;
  const maxPerDim = device.limits.maxComputeWorkgroupsPerDimension;
  const n = w * h, bytes = n * 4;
  const fs = mmPerCell > 0 ? (280 / 1086) / mmPerCell : scale;
  const ts = coldPress ? 0.4 / coldPress.mmPerCell : (mmPerCell > 0 ? fs : scale) * toothScale;
  const ps = (mmPerCell > 0 ? fs : scale) * patternScale;
  const blur = r => Math.max(1, Math.round(r * ts));
  const r1 = blur(1), r2 = blur(2), rProud = Math.max(1, Math.round(proudBlur * (mmPerCell > 0 ? fs : 1)));

  // Knot grids and the physical Gaussian can exceed a plane at unusual scales.
  const sizes = [16, bytes, Math.ceil(n/256)*12];
  if (isPhys) {
    sizes.push((2*Math.max(1,Math.ceil(3*(grainMm > 0 ? grainMm : GRAIN_MM)/physMm))+1)*4);
    for (const tile of fieldData.tiles) sizes.push(tile.z.byteLength);
    if (fieldData.strength) sizes.push(fieldData.strength.z.byteLength);
    if ((cockle.rmsMm ?? .03) > 0) {
      const [broad,fine]=cockle.waveMm ?? [14,4], x=(w-.5)*physMm, y=(h-.5)*physMm;
      sizes.push((Math.floor(x/broad)+2)*(Math.floor(y/broad)+2)*4,
        (Math.floor(x/fine+7.3)-7+2)*(Math.floor(y/fine+2.9)-2+2)*4);
    }
  } else for (const scale of [2.5*ts,7*ps]) sizes.push((Math.floor((w-1)/scale)+2)*(Math.floor((h-1)/scale)+2)*4);
  if (sizes.some(size => !Number.isSafeInteger(size) || size > device.limits.maxStorageBufferBindingSize || size > device.limits.maxBufferSize) || device.limits.maxBufferSize < 80) return makePaper(w,h,options);
  const pipe = await getPipelines(device);

  // Fibres: fast serial LCG strand scatter (bit-identical to paper.mjs)
  const fib = new Float32Array(n), c2 = new Float32Array(n), s2 = new Float32Array(n);
  let s = seed * 9301 + 49297;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const count = Math.round(n / (9 * fs * fs));
  const stepL = 0.7 * fs;
  const bendScale = mmPerCell > 0 ? 1 : scale;
  for (let f = 0; f < count; f++) {
    let x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI, bend = (rnd() - 0.5) * 0.12;
    const L = fibreLength * fs * (0.4 + rnd());
    for (let t = 0; t < L; t += stepL) {
      a += bend * bendScale;
      x += Math.cos(a) * stepL;
      y += Math.sin(a) * stepL;
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= w || yi >= h) break;
      const wt = (0.6 + 0.4 * Math.sin((Math.PI * t) / L)) * fs;
      const idx = yi * w + xi;
      fib[idx] += wt;
      c2[idx] += wt * Math.cos(2 * a);
      s2[idx] += wt * Math.sin(2 * a);
    }
  }

  const gMm = grainMm > 0 ? grainMm : GRAIN_MM;
  const gKern = isPhys ? gaussKernel(gMm / physMm) : null;
  let hollowUnit = isPhys ? grainUnit({ seed, relief }, gMm) : 1;

  const ckRms = cockle.rmsMm ?? 0.03;
  const ckWave = cockle.waveMm ?? [14, 4];
  const ckFineShare = cockle.fineShare ?? 0.35;
  const doCockle = isPhys && ckRms > 0;
  const ckKnots = doCockle ? cockleKnotGrid(w, h, physMm, seed, ckWave) : null;
  const npKnots = !isPhys ? nonPhysKnotGrids(w, h, ts, ps, seed) : null;

  const numWg = Math.ceil(n / 256);
  const dummy = mkBuf(device, 16);
  const dummyB = mkBuf(device, 16);
  const dummyC = mkBuf(device, 16);
  const bZUm = isPhys ? mkBuf(device, bytes) : null;
  const bHeight = mkBuf(device, bytes);
  const bValley = !isPhys ? mkBuf(device, bytes) : null;
  const bTmp1 = mkBuf(device, bytes);
  const bTmp2 = mkBuf(device, bytes);
  const bTmp3 = mkBuf(device, bytes);
  const bFib = mkBuf(device, bytes);
  const bC2 = mkBuf(device, bytes);
  const bS2 = mkBuf(device, bytes);
  const bBf = mkBuf(device, bytes);
  const bTooth = mkBuf(device, bytes);
  const bCap = mkBuf(device, bytes);
  const bProud = mkBuf(device, bytes);
  const bFdx = mkBuf(device, bytes);
  const bFdy = mkBuf(device, bytes);
  const bGrain = mkBuf(device, bytes);
  const bGrainH = isPhys ? mkBuf(device, bytes) : null;
  const bHollow = mkBuf(device, bytes);
  const bSurface = doCockle ? mkBuf(device, bytes) : null;
  const bReduce = mkBuf(device, numWg * 12);
  const bGaussK = gKern ? mkBuf(device, gKern.k.byteLength) : null;
  const bCk0 = doCockle ? mkBuf(device, ckKnots.g0.byteLength) : null;
  const bCk1 = doCockle ? mkBuf(device, ckKnots.g1.byteLength) : null;
  const bNp0 = npKnots ? mkBuf(device, npKnots.g0.byteLength) : null;
  const bNp1 = npKnots ? mkBuf(device, npKnots.g1.byteLength) : null;
  const uF = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  let uRel = null;

  const destroyList = [
    uF, dummy, dummyB, dummyC, bHeight, bTmp1, bTmp2, bTmp3, bFib, bC2, bS2, bBf,
    bTooth, bCap, bProud, bFdx, bFdy, bGrain, bHollow, bReduce,
    ...(bZUm ? [bZUm] : []), ...(bValley ? [bValley] : []), ...(bGrainH ? [bGrainH] : []),
    ...(bGaussK ? [bGaussK] : []), ...(bSurface ? [bSurface] : []),
    ...(bCk0 ? [bCk0] : []), ...(bCk1 ? [bCk1] : []),
    ...(bNp0 ? [bNp0] : []), ...(bNp1 ? [bNp1] : []),
  ];

  const runField = (name, params, sA, sB, sC, dA, dB = dummyB, dC = dummyC) => {
    const ab = new ArrayBuffer(64);
    const u32 = new Uint32Array(ab), f32 = new Float32Array(ab);
    u32[0] = w; u32[1] = h; u32[2] = n; u32[3] = params.radius ?? 0;
    u32[4] = params.gw0 ?? 0; u32[5] = params.gh0 ?? 0; u32[6] = params.gw1 ?? 0; u32[7] = params.gh1 ?? 0;
    f32[8] = params.p0 ?? 0; f32[9] = params.p1 ?? 0; f32[10] = params.p2 ?? 0; f32[11] = params.p3 ?? 0;
    f32[12] = params.p4 ?? 0; f32[13] = params.p5 ?? 0;
    device.queue.writeBuffer(uF, 0, ab);
    const bg = device.createBindGroup({
      layout: pipe.fieldLayout,
      entries: [uF, sA, sB, sC, dA, dB, dC].map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipe.p[name]);
    pass.setBindGroup(0, bg);
    dispatch1D(pass, n, 256, maxPerDim);
    pass.end();
    device.queue.submit([enc.finish()]);
  };

  const reduceStats = async srcBuf => {
    runField('reduce_stats', {}, srcBuf, dummy, dummy, bReduce);
    const [raw] = await readFloatBufs(device, [[bReduce, numWg * 12]]);
    let lo = Infinity, hi = -Infinity, sum = 0;
    for (let i = 0; i < numWg; i++) {
      if (raw[i * 3] < lo) lo = raw[i * 3];
      if (raw[i * 3 + 1] > hi) hi = raw[i * 3 + 1];
      sum += raw[i * 3 + 2];
    }
    return { lo, hi, sum };
  };

  try {
    device.pushErrorScope('validation');
    device.queue.writeBuffer(bFib, 0, fib);
    device.queue.writeBuffer(bC2, 0, c2);
    device.queue.writeBuffer(bS2, 0, s2);
    if (gKern) device.queue.writeBuffer(bGaussK, 0, gKern.k);
    if (doCockle) {
      device.queue.writeBuffer(bCk0, 0, ckKnots.g0);
      device.queue.writeBuffer(bCk1, 0, ckKnots.g1);
    }
    if (npKnots) {
      device.queue.writeBuffer(bNp0, 0, npKnots.g0);
      device.queue.writeBuffer(bNp1, 0, npKnots.g1);
    }

    // 1. Fibre blurs: bf = box(fib, r1), blurred = box(bf, r1)
    runField('box_x', { radius: r1 }, bFib, dummy, dummy, bTmp1);
    runField('box_y', { radius: r1 }, bTmp1, dummy, dummy, bBf);
    runField('box_x', { radius: r1 }, bBf, dummy, dummy, bTmp1);
    runField('box_y', { radius: r1 }, bTmp1, dummy, dummy, bTmp2); // blurred

    // 2. Height (and valley for non-physical)
    let fm = 0;
    if (isPhys) {
      uRel = encodeRelief(device, pipe, dummy, w, h, physMm, fieldData, bZUm, bHeight);
      fm = (await reduceStats(bTmp2)).hi;
    } else {
      fm = (await reduceStats(bTmp2)).hi;
      const fscale = fm > 0 ? 1 / (fm * 0.5) : 0;
      runField('nonphys_height', {
        gw0: npKnots.gw0, gh0: npKnots.gh0, gw1: npKnots.gw1, gh1: npKnots.gh1,
        p0: npKnots.s0, p1: npKnots.s1, p2: fibres, p3: fscale, p4: toothWeight,
      }, bNp0, bNp1, bTmp2, bTmp3);
      const { lo: hLo, hi: hHi } = await reduceStats(bTmp3);
      runField('norm_scale', { p0: hLo, p1: 1 / (hHi - hLo || 1), p2: 0 }, bTmp3, dummy, dummy, bHeight);
      // valley = normalized box(height, r1)
      runField('box_x', { radius: r1 }, bHeight, dummy, dummy, bTmp1);
      runField('box_y', { radius: r1 }, bTmp1, dummy, dummy, bTmp3);
      const { lo: vLo, hi: vHi } = await reduceStats(bTmp3);
      runField('norm_scale', { p0: vLo, p1: 1 / (vHi - vLo || 1), p2: 0 }, bTmp3, dummy, dummy, bValley);
    }

    // 3. Tooth 3x box blur of height at r2 -> bTmp3 (toothRaw)
    runField('box_x', { radius: r2 }, bHeight, dummy, dummy, bTmp1);
    runField('box_y', { radius: r2 }, bTmp1, dummy, dummy, bTmp3);
    runField('box_x', { radius: r2 }, bTmp3, dummy, dummy, bTmp1);
    runField('box_y', { radius: r2 }, bTmp1, dummy, dummy, bTmp3);
    runField('box_x', { radius: r2 }, bTmp3, dummy, dummy, bTmp1);
    runField('box_y', { radius: r2 }, bTmp1, dummy, dummy, bTmp3);

    // 4. Cockle raw -> bSurface (temporarily)
    if (doCockle) {
      runField('cockle_raw', {
        gw0: ckKnots.gw0, gh0: ckKnots.gh0, gw1: ckKnots.gw1, gh1: ckKnots.gh1,
        p0: physMm, p1: ckWave[0], p2: ckWave[1], p3: ckFineShare, p4: 7.3, p5: 2.9,
      }, bCk0, bCk1, dummy, bSurface);
    }

    const { lo: tl, hi: th } = await reduceStats(bTmp3);
    const toothLo = tl, toothSpan = th - tl || 1;
    const ckMean = doCockle ? (await reduceStats(bSurface)).sum / n : 0;

    // 5. proudLow = box(height, rProud) -> bTmp2, then finalize toothH, capacity, proud
    runField('box_x', { radius: rProud }, bHeight, dummy, dummy, bTmp1);
    runField('box_y', { radius: rProud }, bTmp1, dummy, dummy, bTmp2);
    runField('finalize_tooth_cap_proud', { p0: toothLo, p1: toothSpan, p2: cmin, p3: cmax }, bHeight, bTmp3, bTmp2, bTooth, bCap, bProud);
    if (!isPhys) {
      // Non-physical capacity comes from valley, not height
      runField('norm_scale', { p0: 0, p1: cmax - cmin, p2: cmin }, bValley, dummy, dummy, bCap);
    }

    // 6. bc, bs -> fdx, fdy, grain
    runField('box_x', { radius: r1 }, bC2, dummy, dummy, bTmp1);
    runField('box_y', { radius: r1 }, bTmp1, dummy, dummy, bTmp2); // bc
    runField('box_x', { radius: r1 }, bS2, dummy, dummy, bTmp1);
    runField('box_y', { radius: r1 }, bTmp1, dummy, dummy, bTmp3); // bs
    runField('finalize_fibres', { p0: fm * 0.3 }, bTmp2, bTmp3, bBf, bFdx, bFdy, bGrain);

    // 7. grainH & hollow & rel^2
    let relSqSum = 0;
    if (isPhys) {
      runField('gauss_x', { radius: gKern.r }, bHeight, bGaussK, dummy, bTmp1);
      runField('gauss_y', { radius: gKern.r }, bTmp1, bGaussK, dummy, bGrainH);
      runField('finalize_hollow_rel2', { p0: toothLo, p1: toothSpan, p2: hollowUnit }, bHeight, bTooth, bGrainH, bHollow, bTmp2);
      relSqSum = (await reduceStats(bTmp2)).sum;
    } else {
      // First pass computes raw hollow into bTmp1 and rel^2 into bTmp2 to get hollowUnit = sqrt(sum(rel^2)/n) || 1
      runField('finalize_hollow_rel2', { p0: toothLo, p1: toothSpan, p2: 1 }, bHeight, bTooth, bHeight, bTmp1, bTmp2);
      relSqSum = (await reduceStats(bTmp2)).sum;
      hollowUnit = Math.sqrt(relSqSum / n) || 1;
      runField('norm_scale', { p0: 0, p1: 1 / hollowUnit, p2: 0 }, bTmp1, dummy, dummy, bHollow);
    }

    // 8. cockle centering, RMS, and surface
    let hasSurface = false;
    if (doCockle) {
      runField('cockle_center_sq', { p0: ckMean }, bSurface, dummy, dummy, bTmp1, bTmp2);
      const { sum: ckSs } = await reduceStats(bTmp2);
      if (ckSs > 0) {
        const ckScale = (ckRms / Math.sqrt(ckSs / n)) / SURFACE_MM;
        runField('cockle_surface', { p0: ckScale }, bHeight, bTmp1, dummy, bSurface);
        hasSurface = true;
      }
    }

    const err = await device.popErrorScope();
    if (err) throw new Error(`paper-gpu makePaper validation error: ${err.message}`);

    // Read back all paper planes in ONE parallel batched readback!
    if (isPhys) {
      const toRead = [
        [bZUm, bytes], [bHeight, bytes], [bGrainH, bytes], [bCap, bytes], [bProud, bytes],
        [bTooth, bytes], [bFdx, bytes], [bFdy, bytes], [bGrain, bytes], [bHollow, bytes],
        ...(hasSurface ? [[bSurface, bytes]] : []),
      ];
      const bufsOut = await readFloatBufs(device, toRead);
      const [zUm, height, grainH, capacity, proud, tooth, fdx, fdy, grain, hollow] = bufsOut;
      const surface = hasSurface ? bufsOut[10] : null;
      const valley = Float32Array.from(height);
      const full = fieldData.hollowRmsUm / HEIGHT_SPAN_UM;
      const reliefSpread = 2.56 * full;
      const subRelief = Math.sqrt(Math.max(0, full * full - relSqSum / n));
      const fibreHalf = 0.45 * fibreLength * fs;
      const throat = fibreThroat({ w, h, fibre: fib, proud, fdx, fdy }, fibreHalf);

      return {
        w, h, n, height, grainH, capacity, valley,
        ...(surface ? { surface } : {}),
        proud, fibre: fib, fibreHalf, throat, tooth, toothLo, toothSpan, fdx, fdy, grain,
        relief: reliefSpread, subRelief, mmPerCell: physMm,
        hollow, hollowUnit,
        zUm, reliefUm: fieldData.rmsUm, reliefOf: { seed, relief },
      };
    }

    const toRead = [
      [bHeight, bytes], [bValley, bytes], [bCap, bytes], [bProud, bytes],
      [bTooth, bytes], [bFdx, bytes], [bFdy, bytes], [bGrain, bytes], [bHollow, bytes],
    ];
    const [height, valley, capacity, proud, tooth, fdx, fdy, grain, hollow] = await readFloatBufs(device, toRead);
    const rel = new Float32Array(n);
    for (let i = 0; i < n; i++) rel[i] = height[i] - (toothLo + toothSpan * tooth[i]);
    const k10 = Math.floor(n * 0.1), k90 = Math.floor(n * 0.9);
    const q10 = nthElement(rel, k10);
    const q90 = nthElement(rel, k90, k10, n - 1);
    const reliefSpread = Math.max(1e-4, q90 - q10);
    const fibreHalf = 0.45 * fibreLength * fs;
    const throat = fibreThroat({ w, h, fibre: fib, proud, fdx, fdy }, fibreHalf);

    return {
      w, h, n, height, grainH: height, capacity, valley,
      proud, fibre: fib, fibreHalf, throat, tooth, toothLo, toothSpan, fdx, fdy, grain,
      relief: reliefSpread, subRelief: 0, mmPerCell: 0,
      hollow, hollowUnit,
    };
  } finally {
    uRel?.destroy();
    for (const b of destroyList) b.destroy();
  }
}
