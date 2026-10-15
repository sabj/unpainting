// Whole-sheet paper toning stage for drawings and washes on toned antique paper (--tonestage auto|1|0, default 0).
// When the target is on a warm toned sheet (or --tonestage 1 is given), the painting starts on bright white paper at
// frame 0 (stage: 'paper'), tones the whole sheet evenly to its paper colour as its own first stage (stage: 'tone'),
// records that paper choice before ink and wash begin. This changes the substrate colour; it deposits no paint.

export const WHITE_PAPER_RGB = Object.freeze([252, 251, 248]);

const DEFAULTS = Object.freeze({
  margin: 0.04,
  upperShare: 0.45,
  minWarmth: 18,
  minGreenOverBlue: 6,
  minBlueDrop: 20,
  minLum: 185,
  minSheetShare: 0.25,
  minBorderShare: 0.35,
});

/**
 * Detect whether a target image (`rgb`, w x h, 3 bytes a cell) sits on a warm toned antique sheet.
 * Pure, planning only (before the target guard seals `rgb`).
 */
export function detectSheetTone(rgb, w, h, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const n = w * h;
  if (!rgb || n <= 0) return { toned: false, paperRGB: null, whiteRGB: [...WHITE_PAPER_RGB], share: 0, borderShare: 0 };
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.2126 * rgb[3 * i] + 0.7152 * rgb[3 * i + 1] + 0.0722 * rgb[3 * i + 2];
  const sorted = Float32Array.from(lum).sort();
  const cut = sorted[Math.floor(n * (1 - o.upperShare))] ?? 0;
  let sr = 0, sg = 0, sb = 0, count = 0;
  for (let i = 0; i < n; i++) {
    const r = rgb[3 * i], g = rgb[3 * i + 1], b = rgb[3 * i + 2];
    if (lum[i] >= cut && lum[i] >= o.minLum && r - b >= o.minWarmth && g - b >= o.minGreenOverBlue) {
      sr += r; sg += g; sb += b; count++;
    }
  }
  const share = count / n;
  if (count === 0 || share < o.minSheetShare) {
    return { toned: false, paperRGB: null, whiteRGB: [...WHITE_PAPER_RGB], share: +share.toFixed(4), borderShare: 0 };
  }
  const mean = [Math.round(sr / count), Math.round(sg / count), Math.round(sb / count)];
  const mx = Math.max(1, Math.round(o.margin * w)), my = Math.max(1, Math.round(o.margin * h));
  let borderTotal = 0, borderMatch = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= mx && y >= my && x < w - mx && y < h - my) continue;
      borderTotal++;
      const i = y * w + x;
      if (Math.abs(rgb[3 * i] - mean[0]) <= 22 && Math.abs(rgb[3 * i + 1] - mean[1]) <= 22 && Math.abs(rgb[3 * i + 2] - mean[2]) <= 24) {
        borderMatch++;
      }
    }
  }
  const borderShare = borderTotal > 0 ? borderMatch / borderTotal : 0;
  const toned = mean[0] - mean[2] >= o.minWarmth && WHITE_PAPER_RGB[2] - mean[2] >= o.minBlueDrop && borderShare >= o.minBorderShare;
  return {
    toned,
    paperRGB: toned ? mean : null,
    whiteRGB: [...WHITE_PAPER_RGB],
    share: +share.toFixed(4),
    borderShare: +borderShare.toFixed(4),
  };
}

/** Fill `base` (N * 3 bytes) with `rgb` shaded by the cold-press `height` field. */
export function fillSheetBase(base, height, rgb, shade = 0.04) {
  const n = height.length;
  for (let i = 0; i < n; i++) {
    const t = 1 - shade + shade * height[i];
    for (let c = 0; c < 3; c++) base[i * 3 + c] = Math.min(255, rgb[c] * t);
  }
  return base;
}
