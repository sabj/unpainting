import { recoverWash, remainingMix } from './colour-budget.mjs';
import { needCells, thickness } from '../../media/sheet.mjs';
// --modulate 1: the base plan and marks kept, with washes scaled by 1 - pale x field in a detail field around the focus.
// What the scaling took out is laid late as dry brush along the form, so the lights stay open and form is built with
// strokes. The measured style (practice-style.mjs) sets pale and coverage; lights in the field get soft frisket.
//   --modpale, --modcover          override the style's strengths
//   --modreach 0.06                the detail field's blur, as a share of the short side
//   --modlight 0.12                source density under which a cell in the detail field is a light to reserve
import { measureStyle } from './practice-style.mjs';
import { shapeLights } from './practice-regions.mjs';
import { minFilter, maxFilter, components } from '../../raster.js';
import { orientationField, furMarks } from '../../crop/fur.mjs';

const quantile = (vals, q) => {
  if (!vals.length) return 0;
  const s = Float32Array.from(vals).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
};
const count = m => { let c = 0; for (let i = 0; i < m.length; i++) c += m[i]; return c; };

// Where detail and contrast go: saliency times edge energy. Saliency is the u2net mask in work/masks when there is one,
// the foreground segments when there are those, and a centre prior otherwise.
async function focusMap({ SRC, w, h, n, image, gaussian, num, log, path, fs, sharp, root, fg = null }) {
  const base = image ? path.basename(image, path.extname(image)) : '';
  let sal = null, from = 'a centre prior';
  const maskFile = base ? path.resolve(root, `work/masks/${base}.png`) : '';
  if (maskFile && fs.existsSync(maskFile)) {
    const { data } = await sharp(maskFile).resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
    sal = Float32Array.from({ length: n }, (_, i) => data[i] / 255); from = `work/masks/${base}.png`;
    // the u2net mask can miss a second subject that the foreground segments hold
    if (fg) for (let i = 0; i < n; i++) sal[i] = Math.max(sal[i], fg[i]);
  } else if (fg) { sal = gaussian(Float32Array.from(fg), w, h, 0.01 * Math.min(w, h)); from = 'the foreground segments'; }
  if (!sal) sal = Float32Array.from({ length: n }, (_, i) => { const x = (i % w) / w - 0.5, y = ((i / w) | 0) / h - 0.45; return Math.exp(-(x * x + y * y) / (2 * 0.25 * 0.25)); });
  const S = gaussian(SRC, w, h, 1), E = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = S[i - w + 1] + 2 * S[i + 1] + S[i + w + 1] - S[i - w - 1] - 2 * S[i - 1] - S[i + w - 1];
    const gy = S[i + w - 1] + 2 * S[i + w] + S[i + w + 1] - S[i - w - 1] - 2 * S[i - w] - S[i - w + 1];
    E[i] = Math.hypot(gx, gy);
  }
  const raw = Float32Array.from(E, (v, i) => v * (0.25 + 0.75 * sal[i]));
  const B = gaussian(raw, w, h, Math.max(1, 0.03 * w));
  const top = Math.max(1e-6, quantile(Array.from(B), 0.99));
  const F = Float32Array.from(B, v => Math.min(1, v / top));
  const share = num('practicefocus', 0.06), cut = quantile(Array.from(F), 1 - share);
  const { labels, count: nb } = components(Uint8Array.from(F, v => (v >= cut ? 1 : 0)), w, h);
  const sum = new Float64Array(nb + 1); for (let i = 0; i < n; i++) if (labels[i]) sum[labels[i]] += F[i];
  const keep = new Set([...Array(nb).keys()].map(k => k + 1).sort((a, b) => sum[b] - sum[a]).slice(0, Math.round(num('practiceblobs', 3))));
  const focal = Uint8Array.from(labels, v => (keep.has(v) ? 1 : 0));
  const blobs = [...keep].map(id => { let x = 0, y = 0, c = 0; for (let i = 0; i < n; i++) if (labels[i] === id) { x += i % w; y += (i / w) | 0; c++; } return { x: x / c / w, y: y / c / h, area: c / n }; });
  log(`modulate: focus from ${from} times edges, ${(100 * count(focal) / n).toFixed(1)}% of the sheet in ${blobs.length} blobs at ${blobs.map(b => `(${b.x.toFixed(2)}, ${b.y.toFixed(2)}) ${(100 * b.area).toFixed(1)}%`).join(', ')}`);
  // how far the second and third passes carry: 1 at the focus, falling with distance over a quarter of the sheet
  const broad = gaussian(Float32Array.from(focal), w, h, Math.max(2, 0.12 * Math.min(w, h)));
  const bt = Math.max(1e-6, quantile(Array.from(broad), 0.995));
  return { F, focal, blobs, broad: Float32Array.from(broad, v => Math.min(1, v / bt)) };
}

export async function planModulation(c) {
  const { A, K, w, h, n, SRC, px, image, gaussian, num, opt, log, path, fs, sharp, root } = c;
  if (num('modulate', 0) <= 0) return null;
  const style = await measureStyle({ SRC, w, h, n, px, gaussian, minFilter, maxFilter, log });
  const pale = opt('modpale', '') !== '' ? num('modpale', 0.5) : Math.min(0.75, 0.5 + 0.25 * style.dry);
  const cover = opt('modcover', '') !== '' ? num('modcover', 0.4) : Math.min(0.8, 0.3 + 0.5 * style.dry);
  const focus = await focusMap({ SRC, w, h, n, image, gaussian, num, log, path, fs, sharp, root, fg: null });
  const short = Math.min(w, h);
  // the detail field: the focal blobs blurred to about a head's size, normalised to 1 at their core
  const Fb = gaussian(Float32Array.from(focus.focal), w, h, Math.max(1, num('modreach', 0.06) * short));
  let top = 0; for (const v of Fb) top = Math.max(top, v);
  const field = Float32Array.from(Fb, v => Math.min(1, v / Math.max(1e-6, 0.6 * top)));
  const scale = Float32Array.from(field, v => 1 - pale * v);
  const Aw = new Float32Array(n * K), Ad = new Float32Array(n * K);
  for (let i = 0; i < n; i++) for (let j = 0; j < K; j++) { const a = A[i * K + j]; Aw[i * K + j] = a * scale[i]; Ad[i * K + j] = a - Aw[i * K + j]; }
  // Reserve only the textured budget that the dry brush can actually carry. Smooth local
  // colour still builds through transparent glazes, not through an absent detail pass.
  if (c.colourBudget) {
    const B = gaussian(SRC,w,h,2), tx=gaussian(Float32Array.from(SRC,(v,i)=>Math.abs(v-B[i])),w,h,1.5);
    recoverWash({Aw,Ad},Float32Array.from(tx,v=>Math.min(1,v/num('modtex',0.035))),K);
  }
  // the lights in the detail field, reserved soft
  const raw = Uint8Array.from({ length: n }, (_, i) => (field[i] > 0.25 && SRC[i] < num('modlight', 0.12) ? 1 : 0));
  const lights = shapeLights(raw, { w, h, n, gaussian, num });
  let nl = 0, nf = 0; for (let i = 0; i < n; i++) { nl += lights[i]; if (field[i] > 0.25) nf++; }
  log(`modulate: style ink ${style.ink}, dry ${style.dry}, wet ${style.wet}; washes scaled to ${(100 * (1 - pale)).toFixed(0)}% at the core of a detail field over ${(100 * nf / n).toFixed(1)}% of the sheet, ${nl} light cells reserved there, dry-brush coverage ${cover.toFixed(2)}`);
  return { style, pale, cover, field, Aw, Ad, lights, focus };
}

// The soft reserve for the modulation's lights, joined to the painter's own resist and its soft strength.
export function joinResist(R0, S0, M, { w, h, n, distanceToZero }) {
  if (!M || !M.lights) return { R: R0, S: S0 };
  const R = new Uint8Array(n); for (let i = 0; i < n; i++) R[i] = (R0 && R0[i]) || M.lights[i] ? 1 : 0;
  const d = distanceToZero(M.lights, w, h);
  const S = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!R[i]) continue;
    if (R0 && R0[i]) { S[i] = S0 ? S0[i] : 1; continue; }
    const t = Math.min(1, Math.max(0, (d[i] - 1) / 3)); S[i] = 0.15 + 0.85 * t * t * (3 - 2 * t);
  }
  return { R, S };
}

// The dry brush: short strokes with a wide, wet brush, only where the source has texture at the stroke's scale (hair,
// fur, cloth folds) and never on skin. Each is a pale mix of the local wash, charged no more than the paling took out
// there, so a stroke never ends darker than the plan.
//   --modtex 0.035                  the source's texture (density against its own blur at 2 cells) a cell needs
//   --modlen 0.025 --modgap 0.012   stroke length and spacing, shares of the short side
//   --modbrush 0.008                stroke radius, share of the short side; --modwater 0.5, --modstrength 0.8, --modpaler 0.7
// --drymark 1: the mark lands light, swells to its belly a third of the way along and lifts to a point, bends with the
// form, splays, and breaks up in streaks. At 0 it is a straight, flat-butted wedge that stipples into hard shapes.
// --drymarkcurl, --drymarkstreak, --drymarkbridge override the shape's defaults.
const dryMarkShape = num => (num('drymark', 0) > 0 ? { width: num('drymarkwidth', 0.6), length: num('drymarklen', 1.8), water: num('drymarkwater', 0.42) } : null);
export function dryMarkPath(m, { SC, rB, shape }) {
  if (!shape) return m.map(x => ({ x: (x.x + 0.5) * SC, y: (x.y + 0.5) * SC, r: rB, p: x.p != null ? x.p : 0.8 }));
  const last = Math.max(1, m.length - 1), r = rB * shape.width;
  return m.map((x, k) => {
    const s = Math.pow(Math.sin(Math.PI * Math.pow(k / last, 0.6)), 0.8);
    return { x: (x.x + 0.5) * SC, y: (x.y + 0.5) * SC, r: r * (0.3 + 0.7 * s), p: 0.22 + 0.73 * s };
  });
}
export function dryMarkBrush({ rB, shape, seed, len = 20, num = (_, d) => d }) {
  if (!shape) return { radius: rB, bristles: Math.max(12, Math.ceil(rB * 3)), capacity: 30, belly: 3, feed: 0.1, give: 0.7, free: 0.35, film: 0.22, splay: 0.05, stiffness: 6, wetMix: 0.2, bridge: 0.6, bridgeSoft: 1.3, streak: 0.4, seed };
  return { radius: rB * shape.width, bristles: Math.max(16, Math.ceil(rB * 3)), capacity: 22, belly: 2, feed: 0.05, give: 0.7, free: 0.45, film: 0.22,
    splay: num('drymarksplay', 0.12), stiffness: num('drymarkstiff', 20), fine: num('drymarkfine', 0.1), coarse: num('drymarkcoarse', 0.1), wetMix: 0.2, bridge: num('drymarkbridge', 0.88), bridgeSoft: 2.2,
    streak: num('drymarkstreak', 0.75), streakLength: Math.max(6, 0.5 * len), breakup: 2.2, seed };
}
