// The edge feed's geometry box by box (stepfull.mjs efRefresh): a box's geometry is a function of the box, the options
// and the footprint (M or ever) and fluid mask it reads. prepareEdgeGeometry reads the footprint and mask inside the box
// (and the footprint up to holeSpan beyond it, for held holes); the contact distance reads the footprint one cell beyond
// the box and holeSpan further. So a box whose key is unchanged since the last refresh keeps its geometry, to the bit,
// and only the boxes that changed are solved again (a dry that loses a puddle, a stroke that wets one more box).

/** The key of one box's geometry: its corners, the options, and a hash of what it reads. */
export function boxGeometryKey({ w, h, M, ever, resist }, box, options, holeSpan = 0) {
  const [x0, y0, x1, y1] = box, g = 1 + holeSpan;
  const a0 = Math.max(0, x0 - g), b0 = Math.max(0, y0 - g), a1 = Math.min(w - 1, x1 + g), b1 = Math.min(h - 1, y1 + g);
  // two 32-bit hashes (FNV-1a and a multiplicative one), so a collision needs both to agree
  let hash = 0x811c9dc5, hash2 = 0x2545f491;
  const mix = v => { hash = Math.imul(hash ^ v, 16777619) >>> 0; hash2 = Math.imul((hash2 ^ (hash2 >>> 15)) + v, 0x9e3779b1) >>> 0; };
  for (let y = b0; y <= b1; y++) for (let x = a0; x <= a1; x++) {
    const i = y * w + x;
    if (M[i] || ever[i]) mix(i);
    if (resist?.[i] && x >= x0 && x <= x1 && y >= y0 && y <= y1) mix(~i >>> 0);
  }
  return `${options}|${x0},${y0},${x1},${y1}|${hash}:${hash2}`;
}

/** One box's geometry as the refresh uses it, copied out of the shared scratch (null: the box has no feed). */
export function keepGeometry(geo) {
  if (!geo) return null;
  const { order } = geo, n = order.length, ex = new Float64Array(n), fx = new Float64Array(n), fy = new Float64Array(n);
  for (let q = 0; q < n; q++) { const i = order[q]; ex[q] = geo.ex[i]; fx[q] = geo.fx[i]; fy[q] = geo.fy[i]; }
  return { order: Int32Array.from(order), ex, fx, fy };
}
