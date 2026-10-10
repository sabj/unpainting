// Medium-independent mass plan (used by --medium oil): named masses laid back to front, their edge types, and the
// strokes inside a mass. Pigments, optics and stroke laying belong to the medium. DOM free.
// Mass names and split thresholds are tuned on the Mona Lisa's layout (a figure before a landscape, parapet below).

const lin = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
/** CIE Lab of an sRGB colour in 0..1 (D65). */
export function lab(rgb) {
  const r = lin(rgb[0]), g = lin(rgb[1]), b = lin(rgb[2]);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.9505, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089;
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export const MASS_NAMES = ['', 'sky', 'far landscape', 'middle landscape', 'near landscape', 'parapet', 'dress', 'sleeves', 'hair and veil', 'neck and chest', 'face', 'hands'];
// lay order in each stage: back to front, large to small, face and hands last (Inverse Painting)
export const MASS_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
// how a mass meets its neighbours: lost (melts into them), soft (a short turn) or hard (a crisp contour).
// The face is lost into neck and veil (sfumato); the value target sharpens edges where the source is crisp.
export const MASS_EDGES = { 1: 'lost', 2: 'lost', 3: 'soft', 4: 'soft', 5: 'hard', 6: 'soft', 7: 'soft', 8: 'soft', 9: 'lost', 10: 'lost', 11: 'soft' };

/**
 * Mass labels for a whole picture.
 * @param rgb     Float32Array n * 3 in 0..1
 * @param focus   Float32Array n, 0..1 (face and hands >= 0.75)
 * @param figure  Uint8Array n, 1 inside the subject
 * @param landBottom share of the height where the landscape meets the parapet
 * @returns { labels: Uint8Array, stats: [{ id, name, area, cx, cy }] }
 */
export function planMasses({ rgb, w, h, focus, figure, landBottom = 0.58, rng }) {
  const n = w * h, L = new Float32Array(n), B = new Float32Array(n), A = new Float32Array(n), labels = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const q = lab([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]]); L[i] = q[0]; A[i] = q[1]; B[i] = q[2]; }
  const yb = landBottom * h;
  // the background above the parapet: four bands by colour, value and height (k-means), named by their height
  const bg = []; for (let i = 0; i < n; i += 5) if (!figure[i] && Math.floor(i / w) < yb) bg.push(i);
  const feat = i => [L[i], A[i] * 1.5, B[i] * 1.5, 80 * Math.floor(i / w) / h];
  let cs = [0.1, 0.3, 0.5, 0.8].map(p => feat(bg[Math.floor(p * (bg.length - 1))] ?? 0));
  const near = f => { let b = 0, bd = Infinity; cs.forEach((c, j) => { const d = c.reduce((s, v, k) => s + (v - f[k]) ** 2, 0); if (d < bd) { bd = d; b = j; } }); return b; };
  for (let it = 0; it < 15 && bg.length; it++) {
    const acc = cs.map(() => [0, 0, 0, 0, 0]);
    for (const i of bg) { const f = feat(i), j = near(f); for (let k = 0; k < 4; k++) acc[j][k] += f[k]; acc[j][4]++; }
    cs = cs.map((c, j) => (acc[j][4] ? acc[j].slice(0, 4).map(v => v / acc[j][4]) : c));
  }
  const byHeight = cs.map((c, j) => [c[3], j]).sort((a, b) => a[0] - b[0]).map(([, j]) => j), bandName = {};
  byHeight.forEach((j, r) => { bandName[j] = 1 + r; });
  for (let i = 0; i < n; i++) {
    const y = Math.floor(i / w);
    if (!figure[i]) { labels[i] = y >= yb ? 5 : bandName[near(feat(i))]; continue; }
    const f = focus[i];
    if (f >= 0.75) { labels[i] = y < 0.5 * h ? 10 : 11; continue; }
    if (y < 0.3 * h) { labels[i] = 8; continue; }
    if (y < 0.53 * h) { labels[i] = f >= 0.35 && L[i] > 45 && y > 0.33 * h ? 9 : 8; continue; }
    labels[i] = 0;
  }
  // the lower figure: sleeves (the lighter, warmer folds) and dress (the dark mass), split on value and warmth
  const lower = []; for (let i = 0; i < n; i++) if (figure[i] && labels[i] === 0) lower.push(i);
  const warm = i => L[i] + 0.8 * B[i];
  const vals = lower.map(warm).sort((a, b) => a - b), cut = vals.length ? vals[Math.floor(vals.length * 0.62)] : 0;
  for (const i of lower) labels[i] = warm(i) > cut ? 7 : 6;

  const sm = modeFilter(labels, w, h, Math.max(3, Math.round(6 * w / 1086)), MASS_NAMES.length);
  // the face and hands keep their exact outline (the focus map already draws it)
  for (let i = 0; i < n; i++) if (labels[i] === 10 || labels[i] === 11) sm[i] = labels[i]; else if (sm[i] === 10 || sm[i] === 11) sm[i] = labels[i];
  const stats = MASS_NAMES.map((name, id) => ({ id, name, area: 0, cx: 0, cy: 0 }));
  for (let i = 0; i < n; i++) { const s = stats[sm[i]]; s.area++; s.cx += i % w; s.cy += Math.floor(i / w); }
  for (const s of stats) if (s.area) { s.cx /= s.area; s.cy /= s.area; }
  return { labels: sm, stats };
}

/**
 * A stage's simplified colour target: inside each mass, `k` colours (k-means), every cell given its nearest.
 * @param rgb Float32Array n * 3 (0..1), already blurred to the stage's scale
 */
export function coloursByMass(rgb, labels, w, h, kOf, rng) {
  const n = w * h, out = new Float32Array(n * 3), ids = [...new Set(labels)];
  for (const id of ids) {
    const k = kOf(id); if (!k) continue;
    const cells = []; for (let i = 0; i < n; i++) if (labels[i] === id) cells.push(i);
    const sample = cells.filter((_, j) => j % 7 === 0);
    // seed the centres at value quantiles, so the colours span the mass's lights and darks
    const byL = sample.slice().sort((a, b) => (rgb[a * 3] + rgb[a * 3 + 1] + rgb[a * 3 + 2]) - (rgb[b * 3] + rgb[b * 3 + 1] + rgb[b * 3 + 2]));
    let cs = []; for (let j = 0; j < k; j++) { const i = byL[Math.floor((j + 0.5) / k * (byL.length - 1))]; cs.push([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]]); }
    const near = i => { let b = 0, bd = Infinity; for (let j = 0; j < k; j++) { const d = (rgb[i * 3] - cs[j][0]) ** 2 + (rgb[i * 3 + 1] - cs[j][1]) ** 2 + (rgb[i * 3 + 2] - cs[j][2]) ** 2; if (d < bd) { bd = d; b = j; } } return b; };
    for (let it = 0; it < 10; it++) {
      const acc = cs.map(() => [0, 0, 0, 0]);
      for (const i of sample) { const j = near(i); acc[j][0] += rgb[i * 3]; acc[j][1] += rgb[i * 3 + 1]; acc[j][2] += rgb[i * 3 + 2]; acc[j][3]++; }
      cs = cs.map((c, j) => (acc[j][3] ? [acc[j][0] / acc[j][3], acc[j][1] / acc[j][3], acc[j][2] / acc[j][3]] : c));
    }
    for (const i of cells) { const c = cs[near(i)]; out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  }
  return out;
}

/** A label map smoothed by majority in a (2r+1) square, so specks join their surroundings. */
export function modeFilter(labels, w, h, r, k) {
  const out = new Uint8Array(w * h), cnt = new Int32Array(k);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    cnt.fill(0);
    for (let dy = -r; dy <= r; dy += Math.max(1, r >> 1)) for (let dx = -r; dx <= r; dx += Math.max(1, r >> 1)) { const X = Math.min(w - 1, Math.max(0, x + dx)), Y = Math.min(h - 1, Math.max(0, y + dy)); cnt[labels[Y * w + X]]++; }
    let b = 0; for (let j = 1; j < k; j++) if (cnt[j] > cnt[b]) b = j; out[y * w + x] = b;
  }
  return out;
}

