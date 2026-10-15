// Shape-level Kubelka-Munk refit of the pigment plan, before painting: the plan's linear unmix renders off-hue through
// KM, so each planning shape's mean mix is corrected towards the shape's mean colour by one vector for all its cells.
// Never fitted cell by cell (anti-cheat rule); the value structure inside a shape stays the plan's.
import { components } from "../../raster.js";

function families(D, n, K, rounds = 8) {
  const C = [[0, 0, 0]], idx = [];
  for (let i = 0; i < n; i++) if (D[i * 3] + D[i * 3 + 1] + D[i * 3 + 2] > 0.03) idx.push(i);
  for (let k = 1; k < K; k++) { const i = idx.length ? idx[Math.floor((k - 0.5) * idx.length / (K - 1))] : Math.floor((k + 0.5) * n / K); C.push([D[i * 3], D[i * 3 + 1], D[i * 3 + 2]]); }
  const lab = new Int32Array(n);
  for (let r = 0; r < rounds; r++) {
    const S = C.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) { let b = 0, bd = Infinity; for (let k = 0; k < K; k++) { const d = (D[i * 3] - C[k][0]) ** 2 + (D[i * 3 + 1] - C[k][1]) ** 2 + (D[i * 3 + 2] - C[k][2]) ** 2; if (d < bd) { bd = d; b = k; } } lab[i] = b; const s = S[b]; s[0] += D[i * 3]; s[1] += D[i * 3 + 1]; s[2] += D[i * 3 + 2]; s[3]++; }
    S.forEach((s, k) => { if (s[3]) C[k] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  return lab;
}

/** Planning shapes: connected runs of one colour family; runs under minCells pooled into one group per family. */
export function planningShapes(D, w, h, { families: K = 24, minCells = 200, pool = true, smooth = 0 } = {}) {
  // smooth r: cut shapes from the reference box-blurred over (2r+1) cells, so a textured area is one shape, not tiny runs
  if (smooth > 0) { const S = new Float32Array(D.length), n0 = w * h; for (let c = 0; c < 3; c++) { const t = new Float32Array(n0); for (let y = 0; y < h; y++) { let a = 0; const row = y * w; for (let x = -smooth; x < w; x++) { if (x + smooth < w) a += D[(row + x + smooth) * 3 + c]; if (x - smooth - 1 >= 0) a -= D[(row + x - smooth - 1) * 3 + c]; if (x >= 0) t[row + x] = a / (Math.min(w - 1, x + smooth) - Math.max(0, x - smooth) + 1); } } for (let x = 0; x < w; x++) { let a = 0; for (let y = -smooth; y < h; y++) { if (y + smooth < h) a += t[(y + smooth) * w + x]; if (y - smooth - 1 >= 0) a -= t[(y - smooth - 1) * w + x]; if (y >= 0) S[(y * w + x) * 3 + c] = a / (Math.min(h - 1, y + smooth) - Math.max(0, y - smooth) + 1); } } } D = S; }
  const n = w * h, lab = families(D, n, K), groups = [], pooled = new Map();
  for (let k = 0; k < K; k++) {
    const m = Uint8Array.from(lab, v => (v === k ? 1 : 0));
    const { labels, areas, count } = components(m, w, h);
    const runs = Array.from({ length: count + 1 }, () => []);
    for (let i = 0; i < n; i++) if (labels[i] > 0) runs[labels[i]].push(i);
    for (let c = 1; c <= count; c++) { if (!runs[c].length) continue; if (areas[c] >= minCells) groups.push(runs[c]); else { if (!pooled.has(k)) pooled.set(k, []); pooled.get(k).push(...runs[c]); } }
  }
  if (pool) for (const g of pooled.values()) if (g.length) groups.push(g);
  return groups;
}

/**
 * Correct the plan A (n x K amounts) shape by shape. aim: the reference's channel density (n x 3). render(amounts) ->
 * channel density of one mix laid on the paper. unmix1(d3) -> K amounts for a density triple.
 */
export function shapeRefit(A, aim, K, shapes, { render, unmix1, rounds = 3, log = () => {} } = {}) {
  let before = 0, after = 0, moved = 0;
  for (const cells of shapes) {
    const m = cells.length, aimMean = [0, 0, 0];
    for (const i of cells) for (let c = 0; c < 3; c++) aimMean[c] += aim[i * 3 + c] / m;
    const shift = new Float64Array(K);
    for (let r = 0; r < rounds; r++) {
      const mean = new Float64Array(K);
      for (const i of cells) for (let j = 0; j < K; j++) mean[j] += Math.max(0, A[i * K + j] + shift[j]) / m;
      const got = render(mean), d = aimMean.map((v, c) => v - got[c]);
      if (r === 0) before += Math.hypot(...d) * m;
      const up = unmix1(d.map(v => Math.max(0, v))), down = unmix1(d.map(v => Math.max(0, -v)));
      for (let j = 0; j < K; j++) shift[j] += up[j] - down[j];
    }
    const mean = new Float64Array(K);
    for (const i of cells) for (let j = 0; j < K; j++) { A[i * K + j] = Math.max(0, A[i * K + j] + shift[j]); mean[j] += A[i * K + j] / m; }
    const got = render(mean); after += Math.hypot(...aimMean.map((v, c) => v - got[c])) * m; moved += m;
  }
  log(`shape refit: ${shapes.length} planning shapes over ${moved} cells, one correction each; shape colour error ${(before / Math.max(1, moved)).toFixed(3)} to ${(after / Math.max(1, moved)).toFixed(3)} (channel density)`);
  return A;
}

/** The planned pen drawing as a cell mask (line files are planning assets, not the reference): the cells a line will
 * cover, grown by pad cells, so a step-back compares paint with paint and not with the ink still to come. */
export function lineMask(files, w, h, { pad = 1, fs } = {}) {
  const m = new Uint8Array(w * h);
  for (const f of files) {
    if (!f || !fs.existsSync(f)) continue;
    const d = JSON.parse(fs.readFileSync(f, 'utf8')), iw = d.image?.w ?? w, ih = d.image?.h ?? h, sx = w / iw, sy = h / ih;
    for (const l of d.lines ?? []) {
      const r = Math.max(1, Math.ceil(((l.width ?? 1) * sx) / 2)) + pad, P = l.points ?? [];
      for (let k = 0; k < P.length; k++) {
        const [x1, y1] = P[k], [x0, y0] = P[Math.max(0, k - 1)], steps = Math.max(1, Math.ceil(Math.hypot((x1 - x0) * sx, (y1 - y0) * sy)));
        for (let s = 0; s <= steps; s++) { const cx = Math.round((x0 + (x1 - x0) * s / steps) * sx), cy = Math.round((y0 + (y1 - y0) * s / steps) * sy);
          for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < w && y < h && dx * dx + dy * dy <= r * r) m[y * w + x] = 1; } }
      }
    }
  }
  return m;
}
