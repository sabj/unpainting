// Generated from src/media/gpu/finish-gpu.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Metal/WebGPU sub-cell grain spreading + Kubelka-Munk layered finish compositor.
// Dual-purpose & browser-safe: pairs with CPU renderSubgridLayers (tools/plate/subcell-finish.mjs) with zero Node-only imports.
import { dispatch1D } from './dispatch-1d.js';
import { FINISH_GPU_WGSL } from './finish-gpu-wgsl.js';
import { paperRelief, HEIGHT_SPAN_UM } from '../paper-relief.js';
import { gaussianField, grainField, grainUnit } from '../grain-field.js';
import { SUBCELL_GAIN } from '../subcell-grain.js';

const PIPELINES = new WeakMap();
const toBytes = view => (typeof Buffer === 'function' ? Buffer.from(view) : new Uint8Array(view));

const ENTRIES = [
  'init_under_bytes', 'init_under_height',
  'layer_total', 'layer_pres', 'layer_blur_x', 'layer_blur_y', 'layer_edge_raster',
  'spread_base_sum', 'spread_edge_want', 'spread_edge_reduce',
  'spread_factor', 'spread_factor_fill', 'spread_finalize',
  'km_compose_layer', 'pack_fine', 'downsample_coarse',
];

async function getPipelines(device) {
  let cached = PIPELINES.get(device);
  if (cached) return cached;
  device.pushErrorScope('validation');
  const layout = device.createBindGroupLayout({
    entries: Array.from({ length: 10 }, (_, binding) => ({
      binding,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: binding === 0 ? 'uniform' : [1, 2, 3, 9].includes(binding) ? 'read-only-storage' : 'storage' },
    })),
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const module = device.createShaderModule({ code: FINISH_GPU_WGSL, strictMath: true });
  const p = {};
  for (const entryPoint of ENTRIES) {
    p[entryPoint] = device.createComputePipeline({
      label: 'finish-' + entryPoint,
      layout: pipelineLayout,
      compute: { module, entryPoint },
    });
  }
  const err = await device.popErrorScope();
  if (err) throw new Error(`finish-gpu pipeline error: ${err.message}`);
  cached = { layout, p };
  PIPELINES.set(device, cached);
  return cached;
}

function pairs(values) {
  const out = new Float32Array(values.length * 2);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    out[2 * i] = v;
    out[2 * i + 1] = v - out[2 * i];
  }
  return out;
}

/**
 * Scan one layer on CPU to find active pigment indices and tight bounding boxes.
 * Matches subcell-grain.mjs bounding-box semantics exactly.
 */
function scanLayer(layer, w, h, zeroLayer) {
  const active = [];
  let cx0 = w, cx1 = -1, cy0 = h, cy1 = -1;
  for (let k = 0; k < layer.length; k++) {
    const cells = layer[k];
    if (zeroLayer && cells === zeroLayer) continue;
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (cells[row + x] > 0) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 >= 0) {
      active.push({ k, cells, x0, x1, y0, y1 });
      if (x0 < cx0) cx0 = x0;
      if (x1 > cx1) cx1 = x1;
      if (y0 < cy0) cy0 = y0;
      if (y1 > cy1) cy1 = y1;
    }
  }
  return { active, cx0, cx1, cy0, cy1 };
}

/**
 * Render all settled sheet layers at N x N sub-cell resolution on Metal/WebGPU.
 * Matches CPU renderSubgridLayers + subcellSpread tightly (max |dRGB| <= 1).
 *
 * @param {object} opts
 * @param {GPUDevice} opts.device
 * @param {Array<Float32Array[]>} opts.sheetLayers
 * @param {Array<{K:number[], S:number[], gamma?:number}>} opts.pigments
 * @param {object} opts.paper - sheet paper with w, h, mmPerCell, reliefOf
 * @param {Uint8Array|Buffer|null} [opts.fbase] - precomputed fine RGB base (optional if heightFine + paperRGB given)
 * @param {Float32Array|null} [opts.heightFine] - fine paper height (optional, avoids redundant paperRelief)
 * @param {Float32Array|null} [opts.zUmFine] - fine paper zUm (optional, avoids redundant paperRelief)
 * @param {Float32Array|null} [opts.deltaZFine] - precomputed (zref - z) / unit (optional, e.g. from paper-gpu)
 * @param {number[]|null} [opts.paperRGB]
 * @param {number} [opts.shade=0.04]
 * @param {number} opts.W2
 * @param {number} opts.H2
 * @param {number} opts.N
 * @param {number} [opts.gain=SUBCELL_GAIN]
 * @param {boolean} [opts.edges=true]
 * @param {boolean} [opts.wantCoarse=true]
 * @param {Float32Array|null} [opts.zeroLayer=null]
 * @param {Float32Array|null} [opts.inkRatio=null] - optional INKRES invInkL to fuse composeFine directly on GPU
 * @returns {Promise<{coarse: Buffer|null, fine: Buffer}>}
 */
export async function renderSubgridLayersGpu({
  device, sheetLayers, pigments, paper, fbase = null, heightFine = null, zUmFine = null, deltaZFine = null,
  paperRGB = null, shade = 0.04, W2, H2, N, gain = SUBCELL_GAIN, edges = true, wantCoarse = true,
  zeroLayer = null, inkRatio = null,
}) {
  if (!device) throw new Error('finish-gpu: WebGPU device is required');
  if (!(N >= 1 && Number.isInteger(N))) throw new Error('finish-gpu: N must be a whole number');
  const FW = W2 * N, FH = H2 * N, FN = FW * FH, N2 = W2 * H2;
  const K = pigments.length;
  const maxPerDim = device.limits.maxComputeWorkgroupsPerDimension;

  // Scan all layers up front to know max active pigments in any single layer
  const scanned = [];
  let maxActive = 1;
  for (let q = 0; q < sheetLayers.length; q++) {
    const sc = scanLayer(sheetLayers[q], W2, H2, zeroLayer);
    if (sc.active.length) {
      scanned.push(sc);
      if (sc.active.length > maxActive) maxActive = sc.active.length;
    }
  }

  const finePackedBytes = Math.ceil((FN * 3) / 4) * 4;
  const coarsePackedBytes = Math.ceil((N2 * 3) / 4) * 4;
  const maxWg = Math.ceil(N2 / 256);
  const reduceBytes = Math.max(finePackedBytes, maxWg * 8);
  const extraBytes = inkRatio ? FN * 3 * 4 : Math.max(finePackedBytes, heightFine ? FN * 4 : 16);

  // Check GPU buffer limits cleanly before allocating
  const maxBind = Math.min(device.limits.maxStorageBufferBindingSize, device.limits.maxBufferSize);
  const underBytes = FN * 3 * 8;
  const accumBytes = FN * 32;
  const fineWorkBytes = FN * 16;
  const auxBytes = N2 * 10 * 4;
  if (Math.max(16, underBytes, accumBytes, fineWorkBytes, auxBytes, maxActive * N2 * 4,
    K * 6 * 8, FN * 4, reduceBytes, extraBytes) > maxBind) {
    throw new Error(`finish-gpu: ${FW}x${FH} buffers exceed device binding limit ${(maxBind / 2 ** 30).toFixed(2)} GiB`);
  }

  // Prepare fine granulation deltaZ = (zref - z) / unit (or use precomputed from paper-gpu)
  let deltaZ = deltaZFine;
  if (!deltaZ) {
    const { seed, relief } = paper.reliefOf;
    const zUm = zUmFine ?? paperRelief(FW, FH, paper.mmPerCell / N, { seed, relief }).zUm;
    const z = grainField(zUm, FW, FH, paper.mmPerCell / N);
    const zref = gaussianField(z, FW, FH, N);
    const unit = grainUnit({ seed, relief }) * HEIGHT_SPAN_UM;
    deltaZ = new Float32Array(FN);
    const invUnit = 1 / unit;
    for (let i = 0; i < FN; i++) deltaZ[i] = (zref[i] - z[i]) * invUnit;
  }

  const gg = pigments.map(p => Math.max(0, (p.gamma ?? 0) * gain));
  const { layout, p } = await getPipelines(device);

  const mk = (size, usage = 0) => device.createBuffer({
    size: Math.max(16, Math.ceil(size / 4) * 4),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST | usage,
  });

  const pigData = pairs(pigments.flatMap(q => [...q.K, ...q.S]));

  const bufs = {
    u: device.createBuffer({ size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
    pigTable: mk(pigData.byteLength),
    deltaZ: mk(deltaZ.byteLength),
    coarseLayers: mk(maxActive * N2 * 4),
    coarseAux: mk(auxBytes),
    fineWork: mk(fineWorkBytes),
    accum: mk(accumBytes),
    under: mk(underBytes),
    reduceOut: mk(reduceBytes),
    extraRead: mk(extraBytes),
  };
  let readBuf = null;
  let readCoarseBuf = null;

  try {
    device.pushErrorScope('validation');
    device.queue.writeBuffer(bufs.pigTable, 0, pigData);
    device.queue.writeBuffer(bufs.deltaZ, 0, deltaZ);

    const uBuf = new ArrayBuffer(160);
    const u32 = new Uint32Array(uBuf);
    const f32 = new Float32Array(uBuf);
    u32[0] = W2; u32[1] = H2; u32[2] = N2; u32[3] = N;
    u32[4] = FW; u32[5] = FH; u32[6] = FN; u32[7] = edges ? 1 : 0;
    u32[28] = 0; // zeroPad = 0
    u32[29] = inkRatio ? 1 : 0;
    f32[33] = paperRGB ? paperRGB[0] : 255;
    f32[34] = paperRGB ? paperRGB[1] : 255;
    f32[35] = paperRGB ? paperRGB[2] : 255;
    f32[36] = shade;

    const bg = device.createBindGroup({
      layout,
      entries: [
        bufs.u, bufs.pigTable, bufs.deltaZ, bufs.coarseLayers, bufs.coarseAux,
        bufs.fineWork, bufs.accum, bufs.under, bufs.reduceOut, bufs.extraRead,
      ].map((buffer, binding) => ({ binding, resource: { buffer } })),
    });

    // Helper: write uniform + encode a single pass
    const runPass = (name, count) => {
      device.queue.writeBuffer(bufs.u, 0, uBuf);
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(p[name]);
      pass.setBindGroup(0, bg);
      dispatch1D(pass, count, 256, maxPerDim);
      pass.end();
      device.queue.submit([enc.finish()]);
    };

    // Step 1: initialize under reflectance buffer from fbase or heightFine
    if (fbase) {
      const padded = new Uint8Array(finePackedBytes);
      padded.set(fbase);
      device.queue.writeBuffer(bufs.extraRead, 0, padded);
      runPass('init_under_bytes', FN * 3);
    } else if (heightFine && paperRGB) {
      device.queue.writeBuffer(bufs.extraRead, 0, heightFine);
      runPass('init_under_height', FN);
    } else {
      throw new Error('finish-gpu: provide either fbase or (heightFine + paperRGB)');
    }

    // Step 2: composite each non-empty layer using a pooled uniform ring per layer so all dispatches
    // of a layer run in ONE single CommandEncoder + queue.submit!
    // Max dispatches per layer: 5 (edge) + 6 * maxActive (spread) + 1 (km)
    const maxSlots = 6 + 6 * maxActive;
    const stride = 256; // uniform buffer offset alignment (256 bytes)
    const uRing = device.createBuffer({ size: maxSlots * stride, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const uStaging = new Uint8Array(maxSlots * stride);
    const ringBgs = [];
    for (let s = 0; s < maxSlots; s++) {
      ringBgs.push(device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: uRing, offset: s * stride, size: 160 } },
          ...[bufs.pigTable, bufs.deltaZ, bufs.coarseLayers, bufs.coarseAux, bufs.fineWork, bufs.accum, bufs.under, bufs.reduceOut, bufs.extraRead]
            .map((buffer, i) => ({ binding: i + 1, resource: { buffer } })),
        ],
      }));
    }

    try {
      for (const sc of scanned) {
        const lx0 = Math.max(0, sc.cx0 - 1), lx1 = Math.min(W2 - 1, sc.cx1 + 1);
        const ly0 = Math.max(0, sc.cy0 - 1), ly1 = Math.min(H2 - 1, sc.cy1 + 1);
        const rx0 = Math.max(0, lx0 - 1), rx1 = Math.min(W2 - 1, lx1 + 1);
        const ry0 = Math.max(0, ly0 - 1), ry1 = Math.min(H2 - 1, ly1 + 1);

        // Upload only the active rows [ry0..ry1] of each active pigment plane!
        const rowOff = ry0 * W2;
        const rowLen = (ry1 - ry0 + 1) * W2;
        for (let s = 0; s < sc.active.length; s++) {
          const cells = sc.active[s].cells;
          device.queue.writeBuffer(bufs.coarseLayers, (s * N2 + rowOff) * 4, cells, rowOff, rowLen);
        }

        let slot = 0;
        const ops = [];
        const pushOp = (name, count, isSingleWg = false) => {
          uStaging.set(new Uint8Array(uBuf), slot * stride);
          ops.push({ name, count, slot, isSingleWg });
          slot++;
        };

        u32[8] = lx0; u32[9] = lx1; u32[10] = ly0; u32[11] = ly1;
        u32[12] = rx0; u32[13] = rx1; u32[14] = ry0; u32[15] = ry1;
        u32[24] = sc.active.length;

        const rCount = (rx1 - rx0 + 1) * (ry1 - ry0 + 1);
        const lCount = (lx1 - lx0 + 1) * (ly1 - ly0 + 1);
        pushOp('layer_total', rCount);
        if (edges) {
          pushOp('layer_pres', rCount);
          pushOp('layer_blur_x', rCount);
          pushOp('layer_blur_y', rCount);
        }
        pushOp('layer_edge_raster', lCount);

        for (let s = 0; s < sc.active.length; s++) {
          const a = sc.active[s];
          const px0 = Math.max(lx0, a.x0 - 1), px1 = Math.min(lx1, a.x1 + 1);
          const py0 = Math.max(ly0, a.y0 - 1), py1 = Math.min(ly1, a.y1 + 1);
          const prx0 = Math.max(0, px0 - 1), prx1 = Math.min(W2 - 1, px1 + 1);
          const pry0 = Math.max(0, py0 - 1), pry1 = Math.min(H2 - 1, py1 + 1);
          const pCount = (px1 - px0 + 1) * (py1 - py0 + 1);
          const prCount = (prx1 - prx0 + 1) * (pry1 - pry0 + 1);
          const numWg = Math.ceil(pCount / 256);

          u32[16] = px0; u32[17] = px1; u32[18] = py0; u32[19] = py1;
          u32[20] = prx0; u32[21] = prx1; u32[22] = pry0; u32[23] = pry1;
          u32[25] = s; u32[26] = a.k; u32[27] = numWg;
          f32[32] = gg[a.k];

          pushOp('spread_base_sum', pCount);
          pushOp('spread_edge_want', pCount);
          pushOp('spread_edge_reduce', 256, true);
          pushOp('spread_factor', prCount);
          pushOp('spread_factor_fill', pCount);
          pushOp('spread_finalize', pCount);
        }

        const fineBoxCount = (lx1 - lx0 + 1) * N * (ly1 - ly0 + 1) * N;
        pushOp('km_compose_layer', fineBoxCount);

        device.queue.writeBuffer(uRing, 0, uStaging, 0, slot * stride);
        const enc = device.createCommandEncoder();
        const pass = enc.beginComputePass();
        for (const op of ops) {
          pass.setPipeline(p[op.name]);
          pass.setBindGroup(0, ringBgs[op.slot]);
          if (op.isSingleWg) pass.dispatchWorkgroups(1, 1, 1);
          else dispatch1D(pass, op.count, 256, maxPerDim);
        }
        pass.end();
        device.queue.submit([enc.finish()]);
      }
    } finally {
      uRing.destroy();
    }

    // Step 3: pack fine RGB (optionally fused with INKRES inkRatio) and optional coarse downsample
    if (inkRatio) {
      device.queue.writeBuffer(bufs.extraRead, 0, inkRatio);
    }
    u32[29] = inkRatio ? 1 : 0;
    device.queue.writeBuffer(bufs.u, 0, uBuf);

    readBuf = device.createBuffer({ size: finePackedBytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(p.pack_fine);
    pass.setBindGroup(0, bg);
    dispatch1D(pass, Math.ceil((FN * 3) / 4), 256, maxPerDim);
    pass.end();
    enc.copyBufferToBuffer(bufs.reduceOut, 0, readBuf, 0, finePackedBytes);

    if (wantCoarse) {
      enc.copyBufferToBuffer(bufs.reduceOut, 0, bufs.extraRead, 0, finePackedBytes);
      const cpass = enc.beginComputePass();
      cpass.setPipeline(p.downsample_coarse);
      cpass.setBindGroup(0, bg);
      dispatch1D(cpass, Math.ceil((N2 * 3) / 4), 256, maxPerDim);
      cpass.end();
      readCoarseBuf = device.createBuffer({ size: coarsePackedBytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      enc.copyBufferToBuffer(bufs.reduceOut, 0, readCoarseBuf, 0, coarsePackedBytes);
    }
    device.queue.submit([enc.finish()]);

    const err = await device.popErrorScope();
    if (err) throw new Error(`finish-gpu validation error: ${err.message}`);

    await Promise.all([
      readBuf.mapAsync(GPUMapMode.READ),
      ...(readCoarseBuf ? [readCoarseBuf.mapAsync(GPUMapMode.READ)] : []),
    ]);
    const fine = toBytes(new Uint8Array(readBuf.getMappedRange(), 0, FN * 3));
    readBuf.unmap();
    let coarse = null;
    if (readCoarseBuf) {
      coarse = toBytes(new Uint8Array(readCoarseBuf.getMappedRange(), 0, N2 * 3));
      readCoarseBuf.unmap();
    }
    return { coarse, fine };
  } finally {
    readBuf?.destroy();
    readCoarseBuf?.destroy();
    for (const b of Object.values(bufs)) b.destroy();
  }
}
