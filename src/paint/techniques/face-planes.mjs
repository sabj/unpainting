// --faceplanes <2|3>: technique for faces: a few large, soft value planes (lit, half tone, shadow) instead of many small
// hard-edged passages that read as blotches. Uses the face mask work/masks/<name>-face.png (tools/seg/face-mask.py).
// Returns a new amounts field, or null when off or when there is no mask. DOM free.
//   --faceplanesigma  blur radius for the value the planes are cut from, as a share of the face's width
//   --faceplaneslit   the lit plane's share of its median mix
//   --faceplanesdark  darkest share of the face (eyes, nostrils, mouth), kept as planned for the late darks
//   --faceplanessoft  plane-edge softening and rim feather, as a share of the face's width
export async function facePlanes({ A, K, px, w, h, n, paperL, image, path, gaussian, num, log, root = null, fs = null, sharp = null }) {
  const P = Math.round(num('faceplanes', 0));
  if (!(P >= 2)) return null;
  const base = image ? path.basename(image, path.extname(image)) : '';
  const file = base && root ? path.resolve(root, `work/masks/${base}-face.png`) : '';
  if (!file || !fs.existsSync(file)) { log(`face planes: no face mask for ${base}, left as planned`); return null; }
  const { data } = await sharp(file).resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  // skin only: warm (red over blue by --faceplaneswarm levels) and not dark (over --faceplanesfloor of the paper's
  // lightness). The mask's ellipse takes in glasses and hair, which a flat plane would wipe out.
  const warm = num('faceplaneswarm', 20), floor = num('faceplanesfloor', 0.4);
  const face = Uint8Array.from(data, (v, i) => { const r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2]; return v >= 128 && r - b > warm && r >= g && 0.2126 * r + 0.7152 * g + 0.0722 * b > floor * paperL ? 1 : 0; });
  let cells = 0, x0 = w, x1 = 0;
  for (let i = 0; i < n; i++) if (face[i]) { cells++; const x = i % w; if (x < x0) x0 = x; if (x > x1) x1 = x; }
  if (cells < 30) { log(`face planes: ${cells} face cells, too few, left as planned`); return null; }
  const width = x1 - x0 + 1;
  const SRC = Float32Array.from({ length: n }, (_, i) => Math.max(0, -Math.log(Math.max(0.02, Math.min(1, (0.2126 * px[i * 3] + 0.7152 * px[i * 3 + 1] + 0.0722 * px[i * 3 + 2]) / paperL)))));
  // the value inside the face only, blurred without the background bleeding in (normalised convolution)
  const sigma = Math.max(1, num('faceplanesigma', 0.12) * width), F = Float32Array.from(face);
  const norm = gaussian(F, w, h, sigma), Dm = gaussian(Float32Array.from(SRC, (v, i) => v * face[i]), w, h, sigma);
  const D = Float32Array.from(Dm, (v, i) => v / Math.max(1e-6, norm[i]));
  const vals = []; for (let i = 0; i < n; i++) if (face[i]) vals.push(D[i]);
  vals.sort((a, b) => a - b);
  const cuts = Array.from({ length: P - 1 }, (_, k) => vals[Math.floor(vals.length * (k + 1) / P)]);
  const plane = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (face[i]) { let p = 1; while (p < P && D[i] > cuts[p - 1]) p++; plane[i] = p; }
  // the face's own darks, read unblurred: kept as planned
  const raw = []; for (let i = 0; i < n; i++) if (face[i]) raw.push(SRC[i]);
  raw.sort((a, b) => a - b);
  const darkCut = raw[Math.min(raw.length - 1, Math.floor(raw.length * (1 - num('faceplanesdark', 0.06))))];
  const keepDark = Uint8Array.from(face, (f, i) => (f && SRC[i] >= darkCut ? 1 : 0));
  const lit = num('faceplaneslit', 0.6), soft = Math.max(1, num('faceplanessoft', 0.05) * width);
  const med = Array.from({ length: P + 1 }, (_, p) => Array.from({ length: K }, (_, j) => {
    if (!p) return 0;
    const c = []; for (let i = 0; i < n; i++) if (plane[i] === p && !keepDark[i]) c.push(A[i * K + j]);
    c.sort((a, b) => a - b); return c.length ? c[c.length >> 1] * (p === 1 ? lit : 1) : 0;
  }));
  // the flat planes, softened at their edges; blurred within the face so the rim does not pull in paper
  const wFace = gaussian(F, w, h, soft), feather = Float32Array.from(wFace, (v, i) => (face[i] ? Math.max(0, Math.min(1, 2 * (v - 0.5))) : 0));
  const out = Float32Array.from(A), flat = new Float32Array(n);
  for (let j = 0; j < K; j++) {
    for (let i = 0; i < n; i++) flat[i] = face[i] ? med[plane[i]][j] : 0;
    const b = gaussian(flat, w, h, soft);
    for (let i = 0; i < n; i++) {
      if (!face[i] || keepDark[i]) continue;
      const planeAmt = b[i] / Math.max(1e-6, wFace[i]), f = feather[i];
      out[i * K + j] = f * planeAmt + (1 - f) * A[i * K + j];
    }
  }
  const cnt = new Array(P + 1).fill(0); for (let i = 0; i < n; i++) cnt[plane[i]]++;
  let kd = 0; for (let i = 0; i < n; i++) kd += keepDark[i];
  log(`face planes: ${cells} face cells (${(100 * cells / n).toFixed(1)}% of the sheet, ${width} wide), ${P} planes at ${sigma.toFixed(1)} cells [${cnt.slice(1).join(', ')}], lit at ${lit} of its median, ${kd} darkest kept as planned, edges soft over ${soft.toFixed(1)} cells`);
  return out;
}
