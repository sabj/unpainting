// Bounding box of a mask's set cells, { x0, y0, x1, y1 } (x1 < 0 when empty), identical to a full walk.
// Rows come from the first and last set cells; middle rows are scanned only from their ends inward.
export function boundsOf(M, w, h) {
  const n = w * h;
  let first = -1, last = -1;
  if (M instanceof Uint8Array && M.byteOffset % 4 === 0) {
    const words = new Uint32Array(M.buffer, M.byteOffset, n >> 2), tail = words.length << 2;
    for (let j = 0; j < words.length; j++) if (words[j]) { for (let i = j << 2; ; i++) if (M[i]) { first = i; break; } break; }
    if (first < 0) for (let i = tail; i < n; i++) if (M[i]) { first = i; break; }
    if (first >= 0) {
      for (let i = n - 1; i >= tail; i--) if (M[i]) { last = i; break; }
      if (last < 0) for (let j = words.length - 1; j >= 0; j--) if (words[j]) { for (let i = (j << 2) + 3; ; i--) if (M[i]) { last = i; break; } break; }
    }
  } else {
    for (let i = 0; i < n; i++) if (M[i]) { first = i; break; }
    if (first >= 0) for (let i = n - 1; i >= 0; i--) if (M[i]) { last = i; break; }
  }
  if (first < 0) return { x0: 0, y0: 0, x1: -1, y1: -1 };
  const y0 = (first / w) | 0, y1 = (last / w) | 0;
  let x0 = first % w, x1 = last % w;
  if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
  for (let y = y0; y <= y1; y++) {
    const r = y * w;
    for (let x = 0; x < x0; x++) if (M[r + x]) { x0 = x; break; }
    for (let x = w - 1; x > x1; x--) if (M[r + x]) { x1 = x; break; }
  }
  return { x0, y0, x1, y1 };
}
