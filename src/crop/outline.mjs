// The outlines of the main shapes, traced as long chains for the pen to draw before any wash. Figure against ground at
// a hand's scale, because ridges and accents alone do not read as a figure. DOM free: callers pass the blur.

/**
 * Figure against ground: the source blurred to `scale`, split halfway between its ground (10th percentile) and its
 * figures (90th), where a blurred edge sits on the edge itself, with components under `minArea` of the sheet dropped.
 */
export function silhouette(D, w, h, blur, { scale = 4, minArea = 0.002 } = {}) {
  const n = w * h, B = blur(D, w, h, scale), s = Float32Array.from(B).sort();
  const split = (s[Math.floor(n * 0.1)] + s[Math.floor(n * 0.9)]) / 2;
  const m = Uint8Array.from(B, v => (v > split ? 1 : 0));
  const label = new Int32Array(n); let next = 0;
  for (let i = 0; i < n; i++) if (m[i] && !label[i]) {
    next++; const stack = [i], cells = []; label[i] = next;
    while (stack.length) { const j = stack.pop(); cells.push(j); const x = j % w, y = (j / w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { const q = yy * w + xx; if (m[q] && !label[q]) { label[q] = next; stack.push(q); } } } }
    if (cells.length < minArea * n) for (const j of cells) m[j] = 0;
  }
  return m;
}

/**
 * The edge of a mask as chains of points, every `step` cells, lightly smoothed, longest first.
 * @returns [{ points: [{x, y}] }]
 */
export function traceOutlines(mask, w, h, { minLength = 12, step = 2 } = {}) {
  const n = w * h, edge = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!mask[i]) continue;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) continue; // the sheet's own border is not an outline
    if (!mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) edge[i] = 1;
  }
  const seen = new Uint8Array(n), chains = [];
  const N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const walk = (start, dir0) => {
    const path = [start]; let cur = start, dir = dir0;
    for (;;) {
      const x = cur % w, y = (cur / w) | 0; let best = -1, bestTurn = 9, bestDir = dir;
      for (let k = 0; k < 8; k++) {
        const [dx, dy] = N8[k], xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = yy * w + xx; if (!edge[q] || seen[q]) continue;
        const turn = dir < 0 ? 0 : Math.min((k - dir + 8) % 8, (dir - k + 8) % 8);
        if (turn < bestTurn) { bestTurn = turn; best = q; bestDir = k; }
      }
      if (best < 0) return path;
      seen[best] = 1; path.push(best); cur = best; dir = bestDir;
    }
  };
  for (let i = 0; i < n; i++) if (edge[i] && !seen[i]) {
    seen[i] = 1;
    const a = walk(i, -1), b = walk(i, -1); // both ways from the start
    const cells = [...b.slice(1).reverse(), ...a];
    if (cells.length < minLength) continue;
    const pts = cells.map(c => ({ x: c % w, y: (c / w) | 0 }));
    const smooth = pts.map((p, k) => { const lo = Math.max(0, k - 2), hi = Math.min(pts.length - 1, k + 2); let sx = 0, sy = 0; for (let j = lo; j <= hi; j++) { sx += pts[j].x; sy += pts[j].y; } return { x: sx / (hi - lo + 1), y: sy / (hi - lo + 1) }; });
    const points = smooth.filter((_, k) => k % step === 0 || k === smooth.length - 1);
    chains.push({ points });
  }
  return chains.sort((p, q) => q.points.length - p.points.length);
}
