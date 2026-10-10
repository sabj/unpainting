// Fibre permeability of the paper, shared by the GPU sheet modules.
/** Fibre permeability towards +x and +y; identical to sheet.mjs permeability(), kept here because that one is private. */
export function permeability(paper) {
  const { w, h, fdx, fdy, grain } = paper, px = new Float32Array(w * h), py = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    px[i] = x < w - 1 ? 0.5 * (Math.abs(fdx[i]) * grain[i] + Math.abs(fdx[i + 1]) * grain[i + 1]) : 0;
    py[i] = y < h - 1 ? 0.5 * (Math.abs(fdy[i]) * grain[i] + Math.abs(fdy[i + w]) * grain[i + w]) : 0;
  }
  return { px, py };
}
