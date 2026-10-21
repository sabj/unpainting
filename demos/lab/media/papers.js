// The papers a visitor can paint on. Each is the paper model's own parameters (paper.js): how much of the surface is
// fibre and how much tooth, how coarse the tooth and the larger unevenness are, how much the surface shades the paper's
// colour, its sizing (how slowly water wicks into dry paper, sheet.js) and its colour. DOM free.
//
// The model sizes its fibres and tooth in cells. Up to PAPER_DPI that is the paper as it has always been drawn; above it
// every length is scaled by dpi / PAPER_DPI, so a finer resolution draws the same paper with more cells instead of a
// paper with smaller fibres. At 120 dpi the cold press tooth is about half a millimetre across, as on a real sheet.
const PAPER_DPI = 120;

export const SURFACES = Object.freeze({
  hot: { name: 'Hot press', shade: 0.025, texture: 0.018, sizing: 0.95, colour: [249, 247, 241], model: { fibres: 0.35, tooth: 0.12, patternScale: 1.5 } },
  cold: { name: 'Cold press', shade: 0.045, texture: 0.055, sizing: 0.9, colour: [247, 244, 236], model: {} },
  rough: { name: 'Rough', shade: 0.07, texture: 0.075, sizing: 0.85, colour: [245, 241, 232], model: { fibres: 0.45, tooth: 0.85, toothScale: 1.6, patternScale: 1.4 } },
  toned: { name: 'Toned', shade: 0.045, texture: 0.055, sizing: 0.9, colour: [232, 223, 205], model: {} },
});
export const DEFAULT_SURFACE = 'cold';

/** The paper model's options for a surface at a resolution. */
export function paperOptions(key, dpi, seed) {
  const scale = Math.max(1, dpi / PAPER_DPI), surface = SURFACES[key] ?? SURFACES[DEFAULT_SURFACE];
  return { seed, ...surface.model, scale, proudBlur: scale };
}

/** Optical light on the existing fibre relief; never changes contact, pores or pigment. */
export function paperReflectance(paper, key, dpi = PAPER_DPI) {
  const { colour, shade, texture } = SURFACES[key] ?? SURFACES[DEFAULT_SURFACE];
  const { w, h, n, height, proud, relief } = paper, out = new Float32Array(n * 3);
  const reach = Math.max(1, Math.round(dpi / PAPER_DPI)), contrast = new Float32Array(n);
  let mean = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const slope = height[y * w + Math.max(0, x - reach)] - height[y * w + Math.min(w - 1, x + reach)]
      + height[Math.max(0, y - reach) * w + x] - height[Math.min(h - 1, y + reach) * w + x];
    // Fine ridges and their light-facing edges, at the same physical scale at each dpi.
    contrast[i] = Math.max(-1, Math.min(1, (2 * proud[i] + 0.4 * slope) / relief));
    mean += contrast[i];
  }
  mean /= n;
  for (let i = 0; i < n; i++) {
    // Balanced relief retains a light stock; highlights cannot exceed the paper's own white.
    const t = Math.max(0.88, Math.min(1, 1 - shade + shade * height[i] + texture * (contrast[i] - mean)));
    for (let c = 0; c < 3; c++) out[i * 3 + c] = colour[c] * t / 255;
  }
  return out;
}
