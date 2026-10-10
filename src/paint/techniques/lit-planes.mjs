// Technique for faces and skin. --litplanes <share>: cuts the skin into lit, half and shadow planes before the plan
// is made, so the lit side reads as a pale tint, the half tone as one wash, and the shadow keeps its detail.
//
// Skin: warm (red over blue by --litwarm levels), lightness over --litfloor of paper, inside --litsegs (default figure).
// Its density, blurred over --litblur cells, is cut at its thirds. The lit third keeps --litplanes of its plan; the half
// third is pulled --lithalf of the way to its median; the shadow third stays as planned. Returns new amounts, or null.
export async function litPlanes({ A, K, px, w, h, n, paperL, image, path, gaussian, num, opt, log, root = null, fs = null, sharp = null }) {
  const keep = num('litplanes', 0);
  if (!(keep > 0)) return null;
  const { hasSegments, loadSegments } = await import('../../crop/segments.mjs');
  const base = image ? path.basename(image, path.extname(image)) : '';
  const inSeg = new Uint8Array(n), names = opt('litsegs', 'figure').split(',');
  if (base && hasSegments(base)) { const seg = await loadSegments(base, w, h); for (const r of seg.regions) if (names.includes(r.name)) for (let i = 0; i < n; i++) if (r.mask[i]) inSeg[i] = 1; }
  else inSeg.fill(1);
  // --litface 1: also require the face mask (tools/seg/face-mask.py, work/masks/<name>-face.png), so warm arms and
  // hands are left out
  if (opt('litface', '0') !== '0') {
    const file = base && root ? path.resolve(root, `work/masks/${base}-face.png`) : '';
    if (!file || !fs.existsSync(file)) { log(`lit planes: no face mask for ${base}, left as planned`); return null; }
    const { data } = await sharp(file).resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < n; i++) if (data[i] < 128) inSeg[i] = 0;
  }
  const warm = num('litwarm', 25), floor = num('litfloor', 0.45), skin = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2], L = 0.2126 * r + 0.7152 * g + 0.0722 * b; if (inSeg[i] && r - b > warm && r >= g && L > floor * paperL) skin[i] = 1; }
  const SRC = Float32Array.from({ length: n }, (_, i) => Math.max(0, -Math.log(Math.max(0.02, Math.min(1, (0.2126 * px[i * 3] + 0.7152 * px[i * 3 + 1] + 0.0722 * px[i * 3 + 2]) / paperL)))));
  // --litsmooth 1: planes from the skin's value blurred at --litsigma of the face width, so they form a few connected
  // shapes, not cell-scale blocks. Lit and half planes are laid flat at their median, edges softened over --litsoft cells.
  if (opt('litsmooth', '0') !== '0') return smoothPlanes({ A, K, SRC, skin, w, h, n, keep, gaussian, num, opt, log });
  const D = gaussian(SRC, w, h, num('litblur', 1.2)), v = [];
  for (let i = 0; i < n; i++) if (skin[i]) v.push(D[i]);
  if (v.length < 30) { log(`lit planes: ${v.length} skin cells, too few, left as planned`); return null; }
  v.sort((a, b) => a - b);
  const t1 = v[Math.floor(v.length / 3)], t2 = v[Math.floor(2 * v.length / 3)], half = num('lithalf', 0.6);
  const med = new Float64Array(K); { const cols = Array.from({ length: K }, () => []); for (let i = 0; i < n; i++) if (skin[i] && D[i] > t1 && D[i] <= t2) for (let j = 0; j < K; j++) cols[j].push(A[i * K + j]); cols.forEach((c, j) => { c.sort((a, b) => a - b); med[j] = c.length ? c[c.length >> 1] : 0; }); }
  const out = Float32Array.from(A); let lit = 0, mid = 0, sh = 0;
  for (let i = 0; i < n; i++) {
    if (!skin[i]) continue;
    if (D[i] <= t1) { for (let j = 0; j < K; j++) out[i * K + j] = A[i * K + j] * keep; lit++; }
    else if (D[i] <= t2) { for (let j = 0; j < K; j++) out[i * K + j] = A[i * K + j] + half * (med[j] - A[i * K + j]); mid++; }
    else sh++;
  }
  log(`lit planes: ${lit + mid + sh} skin cells (${(100 * (lit + mid + sh) / n).toFixed(1)}% of the sheet), lit ${lit} at ${keep} of plan, half ${mid} pulled ${half} to one wash, shadow ${sh} as planned`);
  return out;
}

import { components } from '../../raster.js';
function smoothPlanes({ A, K, SRC, skin, w, h, n, keep, gaussian, num, opt, log }) {
  const { labels, areas, count } = components(skin, w, h);
  let big = 0; for (let id = 1; id <= count; id++) if (areas[id] > areas[big] || !big) big = id;
  let x0 = w, x1 = 0; for (let i = 0; i < n; i++) if (labels[i] === big) { const x = i % w; if (x < x0) x0 = x; if (x > x1) x1 = x; }
  const width = Math.max(4, x1 - x0 + 1), sigma = Math.max(1, num('litsigma', 0.25) * width / 2);
  const S = Float32Array.from(skin), norm = gaussian(S, w, h, sigma), Dm = gaussian(Float32Array.from(SRC, (v, i) => v * skin[i]), w, h, sigma);
  const D = Float32Array.from(Dm, (v, i) => v / Math.max(1e-6, norm[i])), v = [];
  for (let i = 0; i < n; i++) if (skin[i]) v.push(D[i]);
  v.sort((a, b) => a - b);
  const t1 = v[Math.floor(v.length / 3)], t2 = v[Math.floor(2 * v.length / 3)];
  const plane = new Uint8Array(n); for (let i = 0; i < n; i++) if (skin[i]) plane[i] = D[i] <= t1 ? 1 : D[i] <= t2 ? 2 : 3;
  const med = [1, 2].map(p => Array.from({ length: K }, (_, j) => { const c = []; for (let i = 0; i < n; i++) if (plane[i] === p) c.push(A[i * K + j]); c.sort((a, b) => a - b); return c.length ? c[c.length >> 1] : 0; }));
  const out = Float32Array.from(A), soft = num('litsoft', 1.5), flat = new Float32Array(n), inPl = Float32Array.from(plane, p => (p === 1 || p === 2 ? 1 : 0)), nb = gaussian(inPl, w, h, soft);
  for (let j = 0; j < K; j++) {
    // --litflat 0: the lit plane keeps its own variation at --litplanes of its depth instead of flat at its median,
    // which reads as airbrushed
    const litFlat = opt('litflat', '1') !== '0';
    for (let i = 0; i < n; i++) flat[i] = plane[i] === 1 ? (litFlat ? med[0][j] : A[i * K + j]) * keep : plane[i] === 2 ? med[1][j] : 0;
    const b = gaussian(flat, w, h, soft);
    for (let i = 0; i < n; i++) if (plane[i] === 1 || plane[i] === 2) out[i * K + j] = b[i] / Math.max(1e-6, nb[i]);
  }
  const cnt = [0, 0, 0, 0], parts = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) cnt[plane[i]]++;
  for (let p = 1; p <= 3; p++) parts[p] = components(Uint8Array.from(plane, q => (q === p ? 1 : 0)), w, h).count;
  log(`lit planes (smoothed at ${sigma.toFixed(1)} cells, face ${width} wide): lit ${cnt[1]} cells in ${parts[1]} shapes at ${keep} of its median, half ${cnt[2]} in ${parts[2]} as one flat wash, shadow ${cnt[3]} in ${parts[3]} as planned`);
  return out;
}
