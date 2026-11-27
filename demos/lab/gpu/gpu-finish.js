// Browser- and Node-loadable 2x sub-cell smooth Kubelka-Munk finish & export driver for Paint Lab.
// Shares the worker's WebGPU device (zero new devices, zero Node-only imports) and pairs with
// media/gpu/finish-gpu.js + media/gpu/paper-gpu.js. Falls back cleanly if device limits are exceeded.
import { renderSubgridLayersGpu } from '../media/gpu/finish-gpu.js';
import { finishReliefAndGrainGpu, fineDeltaZFromHeightGpu } from '../media/gpu/paper-gpu.js';
import { SUBCELL_GAIN } from '../media/subcell-grain.js';

const clampByte = v => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));

/** Bilinearly upsample coarse float reflectance [0..1] (w*h*3) to fine u8 RGB (w*N * h*N * 3). */
function upsampleBaseRgb(baseR, w, h, N) {
  const FW = w * N, FH = h * N, out = new Uint8Array(FW * FH * 3);
  const ax0 = new Int32Array(FW), ax1 = new Int32Array(FW), tx = new Float32Array(FW);
  for (let x = 0; x < FW; x++) {
    const u = Math.min(w - 1, Math.max(0, (x + 0.5) / N - 0.5)), i0 = Math.floor(u);
    ax0[x] = i0; ax1[x] = Math.min(w - 1, i0 + 1); tx[x] = u - i0;
  }
  for (let y = 0; y < FH; y++) {
    const v = Math.min(h - 1, Math.max(0, (y + 0.5) / N - 0.5)), y0 = Math.floor(v), y1 = Math.min(h - 1, y0 + 1), fy = v - y0;
    const r0 = y0 * w, r1 = y1 * w, w0 = 1 - fy, w1 = fy;
    for (let x = 0; x < FW; x++) {
      const x0 = ax0[x], x1 = ax1[x], fx = tx[x], wx0 = 1 - fx;
      const i00 = (r0 + x0) * 3, i10 = (r0 + x1) * 3, i01 = (r1 + x0) * 3, i11 = (r1 + x1) * 3;
      const dst = (y * FW + x) * 3;
      for (let c = 0; c < 3; c++) {
        const a = baseR[i00 + c] * wx0 + baseR[i10 + c] * fx;
        const b = baseR[i01 + c] * wx0 + baseR[i11 + c] * fx;
        out[dst + c] = clampByte((a * w0 + b * w1) * 255);
      }
    }
  }
  return out;
}

/** Bilinearly upsample coarse graphite density into RGB transmittance multipliers exp(-g * 0.9), or null if blank. */
function upsampleGraphiteRatio(graphite, w, h, N) {
  if (!graphite) return null;
  let any = false;
  for (let i = 0; i < graphite.length; i++) if (graphite[i] > 1e-6) { any = true; break; }
  if (!any) return null;
  const FW = w * N, FH = h * N, out = new Float32Array(FW * FH * 3);
  const ax0 = new Int32Array(FW), ax1 = new Int32Array(FW), tx = new Float32Array(FW);
  for (let x = 0; x < FW; x++) {
    const u = Math.min(w - 1, Math.max(0, (x + 0.5) / N - 0.5)), i0 = Math.floor(u);
    ax0[x] = i0; ax1[x] = Math.min(w - 1, i0 + 1); tx[x] = u - i0;
  }
  for (let y = 0; y < FH; y++) {
    const v = Math.min(h - 1, Math.max(0, (y + 0.5) / N - 0.5)), y0 = Math.floor(v), y1 = Math.min(h - 1, y0 + 1), fy = v - y0;
    const r0 = y0 * w, r1 = y1 * w, w0 = 1 - fy, w1 = fy;
    for (let x = 0; x < FW; x++) {
      const x0 = ax0[x], x1 = ax1[x], fx = tx[x], wx0 = 1 - fx;
      const g = (graphite[r0 + x0] * wx0 + graphite[r0 + x1] * fx) * w0 + (graphite[r1 + x0] * wx0 + graphite[r1 + x1] * fx) * w1;
      const ratio = Math.exp(-g * 0.9);
      const dst = (y * FW + x) * 3;
      out[dst] = ratio; out[dst + 1] = ratio; out[dst + 2] = ratio;
    }
  }
  return out;
}

/** Expand packed RGB uint8 bytes to RGBA Uint8ClampedArray for Canvas ImageData / WebGPU blit. */
function rgbToRgba(rgb, w, h) {
  const n = w * h, rgba = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const s = i * 3, d = i * 4;
    rgba[d] = rgb[s]; rgba[d + 1] = rgb[s + 1]; rgba[d + 2] = rgb[s + 2]; rgba[d + 3] = 255;
  }
  return rgba;
}

export class GpuFinish {
  constructor(device, N = 2) {
    this.device = device;
    this.N = N;
    this.paperRef = null;
    this.deltaZFine = null;
    this.fineBase = null;
    this.fineW = 0;
    this.fineH = 0;
  }

  /** Clear cached fine base (call when sheet/baseR is reset, restored, or modified directly). */
  invalidate(dropPaper = false) {
    this.fineBase = null;
    if (dropPaper) { this.paperRef = null; this.deltaZFine = null; }
  }

  /** Ensure fine granulation deltaZ for `paper` at N x N is ready (cached per paper object). */
  async ensurePaper(paper) {
    if (this.paperRef === paper && this.deltaZFine) return this.deltaZFine;
    const { w, h } = paper, N = this.N, FW = w * N, FH = h * N;
    this.fineW = FW; this.fineH = FH;
    if (paper.reliefOf && paper.mmPerCell > 0) {
      const { deltaZ } = await finishReliefAndGrainGpu(this.device, FW, FH, paper.mmPerCell / N, N, paper.reliefOf);
      this.deltaZFine = deltaZ;
    } else {
      this.deltaZFine = await fineDeltaZFromHeightGpu(this.device, paper.height, w, h, N, paper.hollowUnit || 1);
    }
    this.paperRef = paper;
    return this.deltaZFine;
  }

  /** Fold a superseded dried layer into the persistent 2x fine RGB base on WebGPU (flat O(1) memory). */
  async foldLayer({ layer, pigments, paper, baseR }) {
    const { w, h } = paper, N = this.N;
    const deltaZFine = await this.ensurePaper(paper);
    const fbase = this.fineBase ?? upsampleBaseRgb(baseR, w, h, N);
    const { fine } = await renderSubgridLayersGpu({
      device: this.device,
      sheetLayers: [layer],
      pigments,
      paper,
      fbase,
      deltaZFine,
      W2: w,
      H2: h,
      N,
      gain: SUBCELL_GAIN,
      edges: true,
      wantCoarse: false,
    });
    this.fineBase = new Uint8Array(fine);
  }

  /**
   * Render the current sheet at N x N sub-cell resolution on WebGPU with smooth traced edges,
   * granulation spread, double-single KM compositing, and fused graphite transmittance.
   */
  async render({ sheet, pigments, paper, baseR, graphite = null, wantCoarse = false }) {
    const { w, h, n } = sheet, N = this.N, FW = w * N, FH = h * N;
    const deltaZFine = await this.ensurePaper(paper);
    const fbase = this.fineBase ?? upsampleBaseRgb(baseR, w, h, N);

    // Gather un-folded layers: dried layers in sheet.layers + any active G+D+P mass
    const sheetLayers = [...sheet.layers];
    let hasCurrent = false;
    const current = sheet.G.map((Gk, k) => {
      const out = new Float32Array(n), Dk = sheet.D[k], Pk = sheet.P[k];
      for (let i = 0; i < n; i++) {
        const v = Gk[i] + Dk[i] + Pk[i];
        if (v > 0) { out[i] = v; hasCurrent = true; }
      }
      return out;
    });
    if (hasCurrent) sheetLayers.push(current);

    const inkRatio = upsampleGraphiteRatio(graphite, w, h, N);
    const { fine, coarse } = await renderSubgridLayersGpu({
      device: this.device,
      sheetLayers,
      pigments,
      paper,
      fbase,
      deltaZFine,
      W2: w,
      H2: h,
      N,
      gain: SUBCELL_GAIN,
      edges: true,
      wantCoarse,
      inkRatio,
    });

    return {
      fineWidth: FW,
      fineHeight: FH,
      fineRgba: rgbToRgba(fine, FW, FH),
      coarseRgba: coarse ? rgbToRgba(coarse, w, h) : null,
    };
  }
}
