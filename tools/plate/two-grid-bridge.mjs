// Bridge connecting the two-grid solver (coarse water at 2x cell size + fine pigment at ratio N = 2/4/8)
// into tools/paint-plate.mjs cleanly, dual-purpose on CPU and Metal WebGPU.
import { makePaper } from '../../src/media/paper.mjs';
import { makePaperGpu } from '../../src/media/gpu/paper-gpu.mjs';
import { renderFine } from '../../src/media/fine-optics.mjs';
import { renderSubgridLayersGpu } from '../../src/media/gpu/finish-gpu.mjs';
import { createTwoGridSheet } from '../../src/media/gpu/two-grid-sheet.mjs';
import { overlay } from '../../src/media/gouache.mjs';
import { check } from '../../src/media/checks.mjs';
import { invalidatePaperCertificate, certifyDryFixed } from '../../src/media/paper-certificate.mjs';

const VALID_RATIOS = new Set([1, 2, 4, 8]);
const PAPER_STATE = Object.freeze({ dryWater: 0.004, drySaturation: 0.02, moistWater: 0.015, moistSaturation: 0.6 });
const quantile = (a, q) => (a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : null);

/** Validate --twogrid value (1 = single-grid default; 2 = 0.52/0.26, 4 = 0.52/0.13, 8 = 0.52/0.065 mm on a 0.26 mm sheet). */
export function parseTwoGrid(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || !VALID_RATIOS.has(n)) {
    throw new Error(`--twogrid takes 1 (single-grid), 2, 4, or 8; received ${value}`);
  }
  return n;
}

/** Derive coarse-water and fine-pigment grid dimensions and physical cell sizes for sheet W2 x H2. */
export function twoGridGeometry(W2, H2, sheetMmPerCell, N) {
  const waterRatio = 2;
  const pigmentScale = N / waterRatio;
  const cw = Math.max(4, Math.ceil(W2 / waterRatio));
  const ch = Math.max(4, Math.ceil(H2 / waterRatio));
  const FW = cw * N, FH = ch * N;
  const fineMm = sheetMmPerCell / pigmentScale;
  const coarseMm = fineMm * N;
  return { N, waterRatio, pigmentScale, cw, ch, FW, FH, coarseMm, fineMm };
}

/** Build coarse-water and fine-pigment papers (Metal GPU via makePaperGpu when available, CPU makePaper otherwise). */
export async function createTwoGridPapers({ W2, H2, sheetMmPerCell, N, paperOpts, auxDevice = null, cacheStep = null }) {
  const geom = twoGridGeometry(W2, H2, sheetMmPerCell, N);
  const scaleBase = paperOpts.scale ?? 1;
  const coarseOpts = {
    ...paperOpts,
    mmPerCell: geom.coarseMm,
    scale: scaleBase / geom.waterRatio,
    ...(paperOpts.coldPress ? { coldPress: { ...paperOpts.coldPress, mmPerCell: geom.coarseMm } } : {}),
  };
  const fineOpts = {
    ...paperOpts,
    mmPerCell: geom.fineMm,
    scale: scaleBase * geom.pigmentScale,
    ...(paperOpts.coldPress ? { coldPress: { ...paperOpts.coldPress, mmPerCell: geom.fineMm } } : {}),
  };
  const build = async (tag, w, h, opts) => {
    const run = () => (auxDevice ? makePaperGpu(auxDevice, w, h, opts) : makePaper(w, h, opts));
    if (!cacheStep) return run();
    return (await cacheStep(tag, { w, h, opts }, run)).value;
  };
  const coarsePaper = await build('twogrid-coarse-paper', geom.cw, geom.ch, coarseOpts);
  const finePaper = await build('twogrid-fine-paper', geom.FW, geom.FH, fineOpts);

  let hostPaper;
  if (geom.pigmentScale === 1 && geom.FW === W2 && geom.FH === H2) {
    hostPaper = finePaper;
  } else {
    hostPaper = deriveHostPaper(finePaper, W2, H2, geom.pigmentScale, sheetMmPerCell);
  }
  return { geom, coarsePaper, finePaper, hostPaper };
}

/** Derive a lightweight W2 x H2 host paper from the fine paper (for candidateContact, base shading, and gouache). */
function deriveHostPaper(finePaper, W2, H2, S, mmPerCell) {
  const N2 = W2 * H2, FW = finePaper.w, ss = S * S;
  const down = src => {
    if (!src) return undefined;
    const out = new Float32Array(N2);
    if (S === 1) {
      for (let y = 0; y < H2; y++) out.set(src.subarray(y * FW, y * FW + W2), y * W2);
      return out;
    }
    for (let y = 0; y < H2; y++) {
      const fy0 = y * S;
      for (let x = 0; x < W2; x++) {
        const fx0 = x * S;
        let sum = 0;
        for (let dy = 0; dy < S; dy++) {
          const row = (fy0 + dy) * FW + fx0;
          for (let dx = 0; dx < S; dx++) sum += src[row + dx];
        }
        out[y * W2 + x] = sum / ss;
      }
    }
    return out;
  };
  const height = down(finePaper.height);
  return {
    w: W2, h: H2, n: N2, mmPerCell,
    height,
    valley: down(finePaper.valley) ?? height,
    ...(finePaper.surface ? { surface: down(finePaper.surface) } : {}),
    capacity: down(finePaper.capacity),
    tooth: down(finePaper.tooth),
    proud: down(finePaper.proud),
    hollow: down(finePaper.hollow),
    grainH: down(finePaper.grainH),
    grain: down(finePaper.grain),
    fdx: down(finePaper.fdx),
    fdy: down(finePaper.fdy),
    throat: down(finePaper.throat),
    toothLo: finePaper.toothLo, toothSpan: finePaper.toothSpan,
    relief: finePaper.relief, subRelief: finePaper.subRelief,
    hollowUnit: finePaper.hollowUnit, reliefUm: finePaper.reliefUm,
    reliefOf: finePaper.reliefOf,
    ...(finePaper.zUm ? { zUm: down(finePaper.zUm) } : {}),
  };
}

function downsampleFinePlane(src, FW, dst, W2, H2, S) {
  if (S === 1) {
    if (FW === W2 && dst.length === src.length) { dst.set(src); return; }
    for (let y = 0; y < H2; y++) dst.set(src.subarray(y * FW, y * FW + W2), y * W2);
    return;
  }
  const inv = 1 / (S * S);
  for (let y = 0; y < H2; y++) {
    const fy0 = y * S, rowOut = y * W2;
    for (let x = 0; x < W2; x++) {
      const fx0 = x * S;
      let sum = 0;
      for (let dy = 0; dy < S; dy++) {
        const row = (fy0 + dy) * FW + fx0;
        for (let dx = 0; dx < S; dx++) sum += src[row + dx];
      }
      dst[rowOut + x] = sum * inv;
    }
  }
}

function boxAverageRgb(fineRgb, FW, FH, W2, H2, S) {
  if (S === 1 && FW === W2 && FH === H2) return Buffer.from(fineRgb.buffer, fineRgb.byteOffset, fineRgb.byteLength);
  const out = Buffer.alloc(W2 * H2 * 3);
  if (S === 1) {
    for (let y = 0; y < H2; y++) {
      const srcOff = y * FW * 3, dstOff = y * W2 * 3;
      out.set(fineRgb.subarray(srcOff, srcOff + W2 * 3), dstOff);
    }
    return out;
  }
  const inv = 1 / (S * S);
  for (let y = 0; y < H2; y++) {
    const fy0 = y * S;
    for (let x = 0; x < W2; x++) {
      const fx0 = x * S;
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < S; dy++) {
        let p = ((fy0 + dy) * FW + fx0) * 3;
        for (let dx = 0; dx < S; dx++, p += 3) { r += fineRgb[p]; g += fineRgb[p + 1]; b += fineRgb[p + 2]; }
      }
      const o = (y * W2 + x) * 3;
      out[o] = Math.round(r * inv);
      out[o + 1] = Math.round(g * inv);
      out[o + 2] = Math.round(b * inv);
    }
  }
  return out;
}

function cropRgb(fineRgb, FW, outW, outH) {
  if (FW === outW && fineRgb.length === outW * outH * 3) return Buffer.from(fineRgb.buffer, fineRgb.byteOffset, fineRgb.byteLength);
  const out = Buffer.alloc(outW * outH * 3);
  for (let y = 0; y < outH; y++) {
    out.set(fineRgb.subarray(y * FW * 3, y * FW * 3 + outW * 3), y * outW * 3);
  }
  return out;
}

/**
 * Attach the two-grid solver onto `ctx.sheet` via the standard `sheet._gpu` and `sheet._twoGridStroke` hooks.
 * Keeps `ctx.sheet` at `W2 x H2` so every existing paint-plate stage (masks, contact prediction,
 * wet/dry gates, drawing, INKRES, gouache, marks, finish) operates unchanged.
 */
export function attachTwoGridBridge({ sheet, coarsePaper, finePaper, pigments, opts, geom, gpuMode = 'auto' }) {
  const { N, pigmentScale: S, cw, ch, FW, FH } = geom;
  const W2 = sheet.w, H2 = sheet.h, N2 = sheet.n, K = sheet.K;
  const engine = createTwoGridSheet({ coarsePaper, finePaper, pigments, opts, N, gpuMode });
  const { F, coarse } = engine;
  const directAlias = S === 1 && FW === W2 && FH === H2;

  if (directAlias) {
    sheet.G = F.G;
    sheet.P = F.P;
    sheet.D = F.D;
    sheet.layers = F.layers;
  }

  let version = 0;
  let hostPigmentVer = -1;
  let hostLayerCount = 0;
  let syncedResist = null;
  let cachedClipSrc = null;
  let cachedClipFine = null;
  let snapG = null, snapD = null, snapP = null, snapW = null, snapS = null;
  let snapLayers = [];

  const ensureSnap = () => {
    if (directAlias) return;
    if (!snapG) {
      snapG = Array.from({ length: K }, () => new Float32Array(N2));
      snapD = Array.from({ length: K }, () => new Float32Array(N2));
      snapP = Array.from({ length: K }, () => new Float32Array(N2));
      snapW = new Float32Array(N2);
      snapS = new Float32Array(N2);
    }
  };

  const syncWaterRectToHost = rect => {
    const [rx, ry, rw, rh] = rect ?? [0, 0, W2, H2];
    const x0 = Math.max(0, rx), y0 = Math.max(0, ry);
    const x1 = Math.min(W2 - 1, rx + rw - 1), y1 = Math.min(H2 - 1, ry + rh - 1);
    const cW = coarse.W, cS = coarse.s, cM = coarse.M, cEver = coarse.ever, cCap = coarse.paper.capacity;
    const hCap = sheet.paper.capacity, nn = N * N, bmc = F.blockMaskCount, bec = F.blockEverCount, Fm = F.M, Fe = F.ever;
    for (let y = y0; y <= y1; y++) {
      const cy = y >> 1, rowOut = y * W2;
      for (let x = x0; x <= x1; x++) {
        const cx = x >> 1, c = cy * cw + cx, i = rowOut + x;
        const cnt = bmc[c], partial = cnt > 0 && cnt < nn;
        let wet = cM[c] !== 0;
        if (wet && partial) {
          if (S === 1) wet = Fm[y * FW + x] !== 0;
          else {
            wet = false;
            const fy0 = y * S, fx0 = x * S;
            for (let dy = 0; dy < S && !wet; dy++) for (let dx = 0; dx < S; dx++) if (Fm[(fy0 + dy) * FW + fx0 + dx]) { wet = true; break; }
          }
        }
        const eCnt = bec[c], ePartial = eCnt > 0 && eCnt < nn;
        let inEver = cEver[c] !== 0;
        if (ePartial) {
          if (S === 1) inEver = Fe[y * FW + x] !== 0;
          else {
            inEver = false;
            const fy0 = y * S, fx0 = x * S;
            for (let dy = 0; dy < S && !inEver; dy++) for (let dx = 0; dx < S; dx++) if (Fe[(fy0 + dy) * FW + fx0 + dx]) { inEver = true; break; }
          }
        }
        sheet.W[i] = wet ? cW[c] : 0;
        sheet.M[i] = wet ? 1 : 0;
        sheet.ever[i] = inEver ? 1 : 0;
        sheet.s[i] = (!ePartial || inEver) && cCap[c] > 0 ? cS[c] * (hCap[i] / cCap[c]) : 0;
      }
    }
  };

  const syncPigmentToHost = () => {
    engine.syncHost();
    if (directAlias) {
      sheet._zeroLayer = F.zeroLayer;
      hostPigmentVer = version;
      hostLayerCount = F.layers.length;
      return;
    }
    if (hostPigmentVer === version && hostLayerCount === F.layers.length) return;
    ensureSnap();
    for (let k = 0; k < K; k++) {
      downsampleFinePlane(F.G[k], FW, sheet.G[k], W2, H2, S);
      downsampleFinePlane(F.D[k], FW, sheet.D[k], W2, H2, S);
      downsampleFinePlane(F.P[k], FW, sheet.P[k], W2, H2, S);
      snapG[k].set(sheet.G[k]);
      snapD[k].set(sheet.D[k]);
      snapP[k].set(sheet.P[k]);
    }
    const zeroHost = sheet._zeroLayer ??= new Float32Array(N2);
    while (sheet.layers.length > F.layers.length) { sheet.layers.pop(); snapLayers.pop(); }
    for (let L = hostLayerCount; L < F.layers.length; L++) {
      const fLayer = F.layers[L];
      const hLayer = fLayer.map(a => {
        if (a === F.zeroLayer) return zeroHost;
        const out = new Float32Array(N2);
        downsampleFinePlane(a, FW, out, W2, H2, S);
        return out;
      });
      sheet.layers[L] = hLayer;
      snapLayers[L] = hLayer.map(a => (a === zeroHost ? zeroHost : Float32Array.from(a)));
    }
    hostLayerCount = F.layers.length;
    hostPigmentVer = version;
  };

  const applyHostDeltaToFine = (hostArr, snapArr, fineArr) => {
    for (let y = 0; y < H2; y++) {
      const row = y * W2, fy0 = y * S;
      for (let x = 0; x < W2; x++) {
        const i = row + x, cur = hostArr[i], prev = snapArr[i];
        if (cur === prev) continue;
        snapArr[i] = cur;
        const fx0 = x * S;
        if (cur > prev) {
          const add = cur - prev;
          for (let dy = 0; dy < S; dy++) {
            const fRow = (fy0 + dy) * FW + fx0;
            for (let dx = 0; dx < S; dx++) fineArr[fRow + dx] += add;
          }
        } else {
          const ratio = prev > 0 ? Math.max(0, cur / prev) : 0;
          for (let dy = 0; dy < S; dy++) {
            const fRow = (fy0 + dy) * FW + fx0;
            for (let dx = 0; dx < S; dx++) fineArr[fRow + dx] *= ratio;
          }
        }
      }
    }
  };

  const pushHostEditsToFine = () => {
    engine.syncHost();
    // 1. Resist lifecycle (applyResist / liftResist on ctx.sheet)
    if (sheet.resist && sheet.resist !== syncedResist) {
      const fineMask = new Uint8Array(F.fn);
      const fineStr = sheet.resistStrength ? new Float32Array(F.fn) : null;
      for (let y = 0; y < H2; y++) {
        const row = y * W2, fy0 = y * S;
        for (let x = 0; x < W2; x++) {
          const r = sheet.resist[row + x]; if (!r) continue;
          const st = sheet.resistStrength ? sheet.resistStrength[row + x] : 1;
          const fx0 = x * S;
          for (let dy = 0; dy < S; dy++) {
            const fRow = (fy0 + dy) * FW + fx0;
            for (let dx = 0; dx < S; dx++) { fineMask[fRow + dx] = 1; if (fineStr) fineStr[fRow + dx] = st; }
          }
        }
      }
      const cMask = new Uint8Array(coarse.n);
      const cStr = sheet.resistStrength ? new Float32Array(coarse.n) : null;
      const nn = N * N;
      for (let c = 0; c < coarse.n; c++) {
        let cnt = 0, sSum = 0;
        for (let a = 0; a < nn; a++) {
          const f = F.blockCells[c * nn + a];
          if (fineMask[f]) { cnt++; sSum += fineStr ? fineStr[f] : 1; }
        }
        if (cnt === nn) { cMask[c] = 1; if (cStr) cStr[c] = sSum / nn; }
      }
      engine.setResist(cMask, cStr, fineMask, fineStr);
      syncedResist = sheet.resist;
    } else if (!sheet.resist && syncedResist) {
      engine.liftResist();
      syncedResist = null;
      hostPigmentVer = -1;
      version++;
      syncWaterRectToHost([0, 0, W2, H2]);
      syncPigmentToHost();
      return;
    }

    // 2. Direct pigment/water writes (INKRES.carry, pencilDraw, penDraw, blot, erasePrep, fadePrep, pencilerase)
    if (!directAlias && snapG) {
      for (let k = 0; k < K; k++) {
        applyHostDeltaToFine(sheet.G[k], snapG[k], F.G[k]);
        applyHostDeltaToFine(sheet.D[k], snapD[k], F.D[k]);
        applyHostDeltaToFine(sheet.P[k], snapP[k], F.P[k]);
      }
      const zeroHost = sheet._zeroLayer;
      for (let L = 0; L < Math.min(sheet.layers.length, F.layers.length); L++) {
        for (let k = 0; k < K; k++) {
          const hA = sheet.layers[L][k], sA = snapLayers[L]?.[k], fA = F.layers[L][k];
          if (!sA || hA === zeroHost || fA === F.zeroLayer) continue;
          applyHostDeltaToFine(hA, sA, fA);
        }
      }
      // Propagate any direct host water/pore additions (e.g. penStroke without INKRES, blot)
      let waterEdited = false;
      for (let y = 0; y < H2; y++) {
        const row = y * W2;
        for (let x = 0; x < W2; x++) {
          const i = row + x;
          if (sheet.W[i] !== snapW[i] || sheet.s[i] !== snapS[i]) { waterEdited = true; break; }
        }
        if (waterEdited) break;
      }
      if (waterEdited) restrictHostWaterToCoarse();
    } else if (directAlias) {
      // Pigment arrays are already aliased directly to F.G/P/D/layers; only sync water if host modified W/s directly.
      if (snapW) {
        let waterEdited = false;
        for (let i = 0; i < N2; i++) if (sheet.W[i] !== snapW[i] || sheet.s[i] !== snapS[i]) { waterEdited = true; break; }
        if (waterEdited) restrictHostWaterToCoarse();
      }
    }
    engine.syncTopToWorker();
    version++;
    if (directAlias) hostPigmentVer = version;
  };

  const restrictHostWaterToCoarse = () => {
    const nn = N * N, hCap = sheet.paper.capacity, cCap = coarse.paper.capacity;
    let maskChanged = false, everChanged = false;
    for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
      const c = cy * cw + cx;
      let wSum = 0, sSum = 0, wetCnt = 0, everCnt = 0, anyEver = 0;
      for (let b = 0; b < 2; b++) {
        const y = cy * 2 + b; if (y >= H2) continue;
        for (let a = 0; a < 2; a++) {
          const x = cx * 2 + a; if (x >= W2) continue;
          const i = y * W2 + x, wv = sheet.W[i], sv = sheet.s[i], mv = sheet.M[i] || wv > 0 ? 1 : 0;
          if (sheet.ever[i]) anyEver = 1;
          const fy0 = y * S, fx0 = x * S;
          for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
            const f = (fy0 + dy) * FW + fx0 + dx;
            if (F.M[f] !== mv) { F.M[f] = mv; maskChanged = true; }
            if (mv) { wSum += wv; wetCnt++; if (!F.ever[f]) { F.ever[f] = 1; everChanged = true; } }
            if (F.ever[f]) everCnt++;
            sSum += hCap[i] > 0 ? sv * (cCap[c] / hCap[i]) : 0;
          }
        }
      }
      F.blockMaskCount[c] = wetCnt; F.blockEverCount[c] = everCnt;
      coarse.W[c] = wetCnt > 0 ? wSum / wetCnt : 0;
      coarse.s[c] = sSum / nn;
      coarse.M[c] = wetCnt > 0 ? 1 : 0;
      coarse.ever[c] = anyEver || coarse.ever[c];
    }
    if (maskChanged) F.maskVersion++;
    if (everChanged) F.everVersion++;
    coarse.wetDirty = 1;
    invalidatePaperCertificate(coarse);
  };

  const fineClipFor = clip => {
    if (!clip) return null;
    if (S === 1 && FW === W2 && FH === H2) return clip;
    if (cachedClipSrc === clip && cachedClipFine) return cachedClipFine;
    const out = cachedClipFine ??= new Uint8Array(F.fn);
    out.fill(0);
    for (let y = 0; y < H2; y++) {
      const row = y * W2, fy0 = y * S;
      for (let x = 0; x < W2; x++) {
        if (!clip[row + x]) continue;
        const fx0 = x * S;
        for (let dy = 0; dy < S; dy++) {
          const fRow = (fy0 + dy) * FW + fx0;
          for (let dx = 0; dx < S; dx++) out[fRow + dx] = 1;
        }
      }
    }
    cachedClipSrc = clip;
    return out;
  };

  // Scale a W2-grid brush to the fine grid (S > 1) preserving exact physical volume (mm^3) and travel speed (mm/s),
  // then unscale back after contact so measureBrush() and multi-stroke depletion stay exact in W2 units.
  const strokeTwoGrid = (brush, path, options = {}) => {
    coarse.wetting = Boolean(sheet.wetting);
    const clipFine = fineClipFor(sheet.clip);
    let result;
    const tapeOpts = { tape: sheet._tape, tapeRes: S > 1 ? S : undefined };
    if (S === 1) {
      result = engine.strokeFine(brush, path, { ...options, ...tapeOpts, clip: clipFine });
    } else {
      const volScale = brush.model === 'section' && !(brush.loadWater > 0) ? S : S * S;
      const origRadius = brush.radius, origLoad = brush.loadWater, origCap = brush.capacity, origCapB = brush._capB;
      brush.radius = origRadius * S;
      brush.loadWater = origLoad * volScale;
      brush.capacity = origCap * volScale;
      if (origCapB != null) brush._capB = origCapB * volScale;
      brush.resW *= volScale;
      if (brush.resP) for (let k = 0; k < brush.resP.length; k++) brush.resP[k] *= volScale;
      for (const hr of brush.hairs) {
        hr.water *= volScale;
        if (hr.pig) for (let k = 0; k < hr.pig.length; k++) hr.pig[k] *= volScale;
      }
      brush.travel *= S;
      brush.carry *= S;
      if (brush._chain) {
        for (let i = 0; i < brush._chain.length; i++) brush._chain[i] *= S;
        if (brush._seg != null) brush._seg *= S;
      }
      const finePath = path.map(q => ({ ...q, x: q.x * S, y: q.y * S, ...(q.r !== undefined ? { r: q.r * S } : {}) }));
      const fineOpts = { ...options, ...tapeOpts, clip: clipFine, spacing: (options.spacing ?? 0.7) * S };
      try {
        result = engine.strokeFine(brush, finePath, fineOpts);
      } finally {
        brush.radius = origRadius;
        brush.loadWater = origLoad;
        brush.capacity = origCap;
        brush._capB = origCapB;
        brush.resW /= volScale;
        if (brush.resP) for (let k = 0; k < brush.resP.length; k++) brush.resP[k] /= volScale;
        for (const hr of brush.hairs) {
          hr.water /= volScale;
          if (hr.pig) for (let k = 0; k < hr.pig.length; k++) hr.pig[k] /= volScale;
        }
        brush.travel /= S;
        brush.carry /= S;
        if (brush._chain) {
          for (let i = 0; i < brush._chain.length; i++) brush._chain[i] /= S;
          if (brush._seg != null) brush._seg /= S;
        }
      }
    }
    coarse.wetting = false;
    version++;
    invalidatePaperCertificate(sheet);
    return result;
  };

  // Standard `sheet._gpu`-compatible link object so sheet.mjs, wetdry.mjs, draw.mjs,
  // pencil.mjs, ink-res.mjs, render-cache.mjs, and finish.mjs work transparently.
  const link = {
    get version() { return version; },
    set version(v) { version = v; },
    paused: false,
    resident: false,
    stroke: null,
    stale: true,
    health: engine.health,
    lastStillWet: 0,
    lastDryZero: false,
    pendingLayers: [],
    get stats() { return engine.getStats(); },
    flushDrys() {},
    invalidateOptical() {},

    step(_sh, o) {
      const wet = engine.step(o);
      version++;
      invalidatePaperCertificate(sheet);
      return wet;
    },

    dry(_sh, max, o, dryOpts = {}, watch = null) {
      const res = engine.dry(max, o, { ...dryOpts, ...(watch?.onStep ? { onStep: watch.onStep } : {}) });
      this.lastStillWet = res.stillWet;
      this.lastDryZero = res.stillWet === 0;
      version++;
      if (!directAlias) {
        hostPigmentVer = -1;
        syncPigmentToHost();
      }
      syncWaterRectToHost([0, 0, W2, H2]);
      if (res.stillWet === 0) certifyDryFixed(sheet);
      else invalidatePaperCertificate(sheet);
      return res.steps;
    },

    // Measure wetness directly from coarse water + fine wet/ever masks without any GPU pigment readback!
    measurePaperGate(_sh, cells, _reach, _rect, _paperOnly, full = false) {
      if (!cells.length) return { waterMax: 0, saturationMax: 0, ...(full ? { waterP95: 0, waterP50: 0 } : {}), moistShare: 0, dry: true };
      const cW = coarse.W, cS = coarse.s, cM = coarse.M, cCap = coarse.paper.capacity;
      const bmc = F.blockMaskCount, bec = F.blockEverCount, Fm = F.M, Fe = F.ever, nn = N * N;
      let waterMax = 0, saturationMax = 0, moist = 0, firstWater, index = 0, waters = full ? [] : null;
      for (const i of cells) {
        const y = (i / W2) | 0, x = i - y * W2;
        const c = (y >> 1) * cw + (x >> 1);
        const cnt = bmc[c], partial = cnt > 0 && cnt < nn;
        let wet = cM[c] !== 0;
        if (wet && partial) {
          const fy = S === 1 ? y : y * S + (S >> 1), fx = S === 1 ? x : x * S + (S >> 1);
          wet = Fm[fy * FW + fx] !== 0;
        }
        const eCnt = bec[c], ePartial = eCnt > 0 && eCnt < nn;
        let hasPore = !ePartial;
        if (ePartial) {
          const fy = S === 1 ? y : y * S + (S >> 1), fx = S === 1 ? x : x * S + (S >> 1);
          hasPore = Fe[fy * FW + fx] !== 0;
        }
        const water = wet ? cW[c] : 0;
        const sat = hasPore && cCap[c] > 0 ? cS[c] / cCap[c] : 0;
        if (!Number.isFinite(water) || !Number.isFinite(sat)) throw new Error('Non-finite two-grid paper state');
        if (waters) waters.push(water);
        else if (full && index === 0) firstWater = water;
        index++;
        if (water > waterMax) waterMax = water;
        if (sat > saturationMax) saturationMax = sat;
        if (water >= PAPER_STATE.moistWater || sat >= PAPER_STATE.moistSaturation) moist++;
      }
      if (waters) waters.sort((a, b) => a - b);
      return {
        waterMax, saturationMax,
        ...(full ? { waterP95: waters ? quantile(waters, 0.95) : firstWater, waterP50: waters ? quantile(waters, 0.5) : firstWater } : {}),
        moistShare: moist / cells.length,
        dry: waterMax <= PAPER_STATE.dryWater && saturationMax <= PAPER_STATE.drySaturation,
      };
    },

    ensurePaperFresh(_sh, rect) {
      syncWaterRectToHost(rect);
    },

    ensureFresh(_sh, rect) {
      syncWaterRectToHost(rect);
      syncPigmentToHost();
    },

    syncAll(_sh) {
      syncWaterRectToHost([0, 0, W2, H2]);
      syncPigmentToHost();
      if (!snapW) { snapW = new Float32Array(N2); snapS = new Float32Array(N2); }
      snapW.set(sheet.W);
      snapS.set(sheet.s);
    },

    syncTop(_sh) {
      syncPigmentToHost();
    },

    syncLower(_sh) {
      syncPigmentToHost();
    },

    wetSums(_sh, channelMask = null) {
      syncPigmentToHost();
      const out = new Array(K);
      for (let k = 0; k < K; k++) {
        if (channelMask != null && !(channelMask & (1 << k))) continue;
        const Gk = sheet.G[k], Dk = sheet.D[k], Pk = sheet.P[k], a = new Float32Array(N2);
        for (let i = 0; i < N2; i++) a[i] = Gk[i] + Dk[i] + Pk[i];
        out[k] = a;
      }
      return out;
    },

    cpuWroteAll() {
      pushHostEditsToFine();
      invalidatePaperCertificate(sheet);
    },

    fixedLayersChanged(_sh, _changed) {
      pushHostEditsToFine();
    },

    close() {
      engine.close();
    },
  };

  sheet._gpu = link;
  sheet._twoGridStroke = strokeTwoGrid;

  /**
   * Native fine-resolution final render for N = 4 (0.13 mm) and N = 8 (0.065 mm):
   * uses Metal GPU KM compositing (finish-gpu.mjs at N=1, gain=0, edges=false) when available and
   * within device buffer limits, falling back cleanly to bounded CPU renderFine().
   */
  async function renderFinal({ auxDevice = null, paperRGB, shade = 0.04, gouache = null }) {
    engine.syncHost();
    const outFineW = W2 * S, outFineH = H2 * S;
    let fineFullRgb = null;
    const fineLayers = [
      ...F.layers,
      F.G.map((g, k) => {
        const d = F.D[k], p = F.P[k];
        if (!g.some(v => v !== 0) && !d.some(v => v !== 0) && !p.some(v => v !== 0)) return F.zeroLayer ??= new Float32Array(F.fn);
        return Float32Array.from(g, (v, i) => v + d[i] + p[i]);
      }),
    ];
    let usedGpuFinish = false;
    if (auxDevice) {
      const maxBind = Math.min(auxDevice.limits.maxStorageBufferBindingSize, auxDevice.limits.maxBufferSize);
      // finish-gpu needs 40*fn aux bytes + 4*activeCh*fn layer bytes; check exact fit and keep CPU fallback safe.
      let maxActive = 0;
      for (const L of fineLayers) {
        let act = 0;
        for (const p of L) if (p && p !== F.zeroLayer) act++;
        if (act > maxActive) maxActive = act;
      }
      if (F.fn * 40 <= maxBind && F.fn * 4 * Math.max(1, maxActive) <= maxBind) {
        try {
          const res = await renderSubgridLayersGpu({
            device: auxDevice,
            sheetLayers: fineLayers,
            pigments,
            paper: F.paper,
            heightFine: F.paper.height,
            deltaZFine: new Float32Array(F.fn),
            paperRGB,
            shade,
            W2: FW, H2: FH, N: 1, gain: 0, edges: false, wantCoarse: false,
            zeroLayer: F.zeroLayer,
          });
          fineFullRgb = res.fine;
          usedGpuFinish = true;
        } catch {
          fineFullRgb = null;
        }
      }
    }
    if (!fineFullRgb) {
      const fbase = new Uint8Array(F.fn * 3);
      const p0 = paperRGB[0], p1 = paperRGB[1], p2 = paperRGB[2], s0 = 1 - shade, hF = F.paper.height;
      for (let i = 0; i < F.fn; i++) {
        const sh = s0 + shade * hF[i], o = i * 3;
        fbase[o] = Math.min(255, Math.round(p0 * sh));
        fbase[o + 1] = Math.min(255, Math.round(p1 * sh));
        fbase[o + 2] = Math.min(255, Math.round(p2 * sh));
      }
      fineFullRgb = renderFine(F, fbase, 1);
    }

    let fine = cropRgb(fineFullRgb, FW, outFineW, outFineH);
    let coarseRgb = boxAverageRgb(fineFullRgb, FW, FH, W2, H2, S);
    if (gouache) {
      coarseRgb = overlay(coarseRgb, gouache.cover, gouache.rgb, N2);
      if (S === 1) fine = overlay(fine, gouache.cover, gouache.rgb, outFineW * outFineH);
      else {
        const covFine = new Float32Array(outFineW * outFineH);
        for (let y = 0; y < outFineH; y++) {
          const sy = Math.floor(y / S) * W2, row = y * outFineW;
          for (let x = 0; x < outFineW; x++) covFine[row + x] = gouache.cover[sy + Math.floor(x / S)];
        }
        fine = overlay(fine, covFine, gouache.rgb, outFineW * outFineH);
      }
    }
    return { coarse: coarseRgb, fine, fineW: outFineW, fineH: outFineH, usedGpuFinish };
  }

  const GPU_INFO = {
    ...engine.backendInfo,
    twoGrid: {
      N, waterRatio: geom.waterRatio, pigmentScale: S,
      waterWidth: cw, waterHeight: ch, fineWidth: FW, fineHeight: FH,
      waterMm: +geom.coarseMm.toFixed(4), pigmentMm: +geom.fineMm.toFixed(4),
    },
  };

  check('two-grid coarse sheet starts pigment-free', coarse.G.every(a => a.every(v => v === 0)));

  return {
    engine, F, coarse, geom, N, pigmentScale: S, link, GPU_INFO,
    stroke: strokeTwoGrid,
    renderFinal,
    stats: () => engine.getStats(),
    close: () => engine.close(),
  };
}
