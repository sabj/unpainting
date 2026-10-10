// --practice 1: the paint planned in value passes over all colours, as painters work, not one pigment and value band at
// a time. Passes: light local colour wet in a few big shapes, mid-values on dry paper, darks mixed thick, focal detail.
// Pure functions over the plan grid, no sheet; practice-paint.mjs lays the plan with the painter's brushes and frisket.
//   --practicegroups 6       at most this many first-pass shapes; --practicegroupmin 0.008 smaller regions are merged
//   --practicelights 0.12    the lightest share of each group kept as paper, --practicelightsmax 0.35 units cap, and
//                            every cell whose source density is under --practicesheen 0.10 (paper white and pale sheen)
//   --practiceq1 0.3         the first pass's value: this quantile of the group's density, --practicecap1 0.2 of the painted sheet's 90th percentile at most
//   --practicecolours 3      local colours per group, --practicecolourmerge 0.14 closer colours are one
//   --practicehalf 0.5       the second pass covers this share of the first pass's area, up to the --practicecap2 0.95
//                            quantile of the painted sheet
//   --practiceload2 0.9      the second pass lays this share of what is left under it; --practicecolours2 5 its colours
//   --practicedarks 0.03     the darks' share of the sheet, chosen before pass 2 and left out of it so they go on
//                            paper that has had only the first wash; --practicedarkmin 0.05 left for a cell to count
//   --practicecap4 1.2       the most the small brush lays in a cell
//
// Amounts are in the plan's pigment units (paint-plate.mjs A), the same units every other module books.
//   --practicefocus 0.06     the focal share of the sheet, in at most --practiceblobs 3 blobs
//   --practicefalloff 0.3    how much of the second and third passes fades away from the focus
//   --practicelight x,y      the light's direction on the sheet (x right, y down); read from the picture when absent
import { hasSegments, loadSegments } from '../../crop/segments.mjs';
import { components, removeSmall, dilate, erode, fillHoles, minFilter, maxFilter } from '../../raster.js';
import { lineBarrier, lineRegions, shapeLights } from './practice-regions.mjs';
import { targetStages } from './practice-keyframes.mjs';
import { looseStages } from './practice-loose.mjs';
import { measureStyle, styleDials } from './practice-style.mjs';

export const DENSITY_SCALE = 0.55;   // unmix() solves against K / 0.55 (paint-plate.mjs)

export const quantile = (vals, q) => {
  if (!vals.length) return 0;
  const s = Float32Array.from(vals).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
};

function totalsOf(A, K, n) {
  const T = new Float32Array(n);
  for (let i = 0; i < n; i++) { let t = 0; for (let j = 0; j < K; j++) t += A[i * K + j]; T[i] = t; }
  return T;
}

const count = m => { let c = 0; for (let i = 0; i < m.length; i++) c += m[i]; return c; };
const and = (a, b) => Uint8Array.from(a, (v, i) => (v && b[i] ? 1 : 0));

// k-means with a farthest-point start, so the same picture always gives the same clusters.
export function kmeans(points, k, { iters = 12 } = {}) {
  const m = points.length, d = m ? points[0].length : 0;
  if (!m) return { labels: new Int32Array(0), centres: [] };
  const dist = (a, b) => { let s = 0; for (let q = 0; q < d; q++) { const t = a[q] - b[q]; s += t * t; } return s; };
  const mean = new Float64Array(d); for (const p of points) for (let q = 0; q < d; q++) mean[q] += p[q] / m;
  const centres = [];
  let far = 0; for (let i = 1; i < m; i++) if (dist(points[i], mean) > dist(points[far], mean)) far = i;
  centres.push(Float64Array.from(points[far]));
  while (centres.length < Math.min(k, m)) {
    let best = -1, bd = -1;
    for (let i = 0; i < m; i++) { let md = Infinity; for (const c of centres) md = Math.min(md, dist(points[i], c)); if (md > bd) { bd = md; best = i; } }
    if (bd <= 1e-12) break;
    centres.push(Float64Array.from(points[best]));
  }
  const labels = new Int32Array(m);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < m; i++) { let b = 0, bd = Infinity; centres.forEach((c, q) => { const t = dist(points[i], c); if (t < bd) { bd = t; b = q; } }); labels[i] = b; }
    const sum = centres.map(() => new Float64Array(d)), cnt = new Array(centres.length).fill(0);
    for (let i = 0; i < m; i++) { cnt[labels[i]]++; for (let q = 0; q < d; q++) sum[labels[i]][q] += points[i][q]; }
    centres.forEach((c, q) => { if (cnt[q]) for (let r = 0; r < d; r++) c[r] = sum[q][r] / cnt[q]; });
  }
  return { labels, centres };
}

// Each cell's colour as a direction in pigment space (amounts over their sum) and a value, blurred to a mop's scale.
function features({ A, K, T, w, h, n, gaussian, sigma }) {
  const planes = [];
  for (let j = 0; j < K; j++) planes.push(gaussian(Float32Array.from({ length: n }, (_, i) => A[i * K + j]), w, h, sigma));
  const Tb = gaussian(T, w, h, sigma);
  return i => { const t = Math.max(1e-4, Tb[i]); const f = new Float64Array(K + 1); for (let j = 0; j < K; j++) f[j] = planes[j][i] / t; f[K] = 1.5 * Math.log1p(4 * Tb[i]); return f; };
}

// The first pass's shapes. From SAM segments when the source has them: the largest regions each a group, the small ones
// merged into the group whose colour they are nearest. Otherwise the plan's own large regions: k-means over colour and
// value at a mop's blur, cleaned by a majority filter, small clusters merged.
async function groupRegions({ A, K, T, w, h, n, image, gaussian, num, log, path, barrier = null }) {
  const maxG = Math.max(1, Math.round(num('practicegroups', 6))), minShare = num('practicegroupmin', 0.008);
  const sigma = Math.max(1, 0.025 * Math.min(w, h));
  const feat = features({ A, K, T, w, h, n, gaussian, sigma });
  const meanFeat = mask => { const f = new Float64Array(K + 1); let c = 0; for (let i = 0; i < n; i++) if (mask[i]) { const g = feat(i); for (let q = 0; q <= K; q++) f[q] += g[q]; c++; } return c ? f.map(v => v / c) : f; };
  const d2 = (a, b) => a.reduce((s, v, q) => s + (v - b[q]) ** 2, 0);
  const base = image ? path.basename(image, path.extname(image)) : '';
  if (base && hasSegments(base)) {
    const seg = await loadSegments(base, w, h);
    const regions = seg.regions.filter(r => r.area > 0).sort((a, b) => b.area - a.area);
    const kept = regions.filter(r => r.area >= minShare).slice(0, maxG).map(r => ({ name: r.name, foreground: r.foreground, mask: Uint8Array.from(r.mask), f: meanFeat(r.mask) }));
    for (const r of regions) {
      if (kept.some(g => g.name === r.name)) continue;
      const f = meanFeat(r.mask); let best = kept[0];
      for (const g of kept) if (d2(f, g.f) < d2(f, best.f)) best = g;
      for (let i = 0; i < n; i++) if (r.mask[i]) best.mask[i] = 1;
      best.name += `+${r.name}`;
    }
    // cells no segment claims go to the group nearest in colour
    const claimed = new Uint8Array(n); for (const g of kept) for (let i = 0; i < n; i++) if (g.mask[i]) claimed[i] = 1;
    for (let i = 0; i < n; i++) if (!claimed[i]) { const f = feat(i); let best = kept[0]; for (const g of kept) if (d2(f, g.f) < d2(f, best.f)) best = g; best.mask[i] = 1; }
    log(`practice: ${kept.length} first-pass shapes from the segments: ${kept.map(g => `${g.name} ${(100 * count(g.mask) / n).toFixed(0)}%`).join(', ')}`);
    return kept.map(({ f, ...g }) => g);
  }
  // no segments, but a drawing: the regions its lines bound, grouped by colour and value
  if (barrier) {
    const { labels, count: R } = lineRegions(barrier, w, h, { minShare: num('practicelinemin', 0.003) });
    const feats = Array.from({ length: R }, () => ({ f: new Float64Array(K + 1), c: 0 }));
    for (let i = 0; i < n; i++) { const r = labels[i] - 1; if (r < 0) continue; const g = feat(i); for (let q = 0; q <= K; q++) feats[r].f[q] += g[q]; feats[r].c++; }
    const pts = feats.map(o => o.f.map(v => v / Math.max(1, o.c)));
    const { labels: lab } = kmeans(pts, Math.max(2, maxG - 1));
    const groups = [];
    for (let q = 0; q < Math.max(2, maxG - 1); q++) {
      const mask = Uint8Array.from(labels, v => (v > 0 && lab[v - 1] === q ? 1 : 0));
      if (count(mask) >= minShare * n) groups.push({ name: `drawn region ${groups.length + 1}`, foreground: false, mask });
    }
    log(`practice: no segments for ${base || 'this source'}; ${R} regions bounded by the drawing's lines, in ${groups.length} first-pass groups: ${groups.map(g => `${(100 * count(g.mask) / n).toFixed(0)}%`).join(', ')}`);
    // lines that close almost nothing give one region: the plan's own regions do better then
    if (groups.length >= 3) return groups;
  }
  // no segments and no drawing: the plan's large regions
  const stride = Math.max(1, Math.round(Math.sqrt(n / 6000)));
  const sample = [];
  for (let y = 0; y < h; y += stride) for (let x = 0; x < w; x += stride) sample.push(feat(y * w + x));
  const { centres } = kmeans(sample, Math.max(2, maxG - 1));
  const nearest = f => { let b = 0, bd = Infinity; centres.forEach((c, q) => { const t = d2(f, c); if (t < bd) { bd = t; b = q; } }); return b; };
  let label = Int32Array.from({ length: n }, (_, i) => nearest(feat(i)));
  // a majority filter at a mop's scale: a first-pass shape is big
  const vote = () => {
    const planes = centres.map((_, q) => gaussian(Float32Array.from(label, v => (v === q ? 1 : 0)), w, h, sigma));
    label = Int32Array.from({ length: n }, (_, i) => { let b = 0; for (let q = 1; q < planes.length; q++) if (planes[q][i] > planes[b][i]) b = q; return b; });
  };
  vote();
  // clusters under twice the merge share go to the nearest surviving centre
  const share = centres.map((_, q) => { let c = 0; for (let i = 0; i < n; i++) if (label[i] === q) c++; return c / n; });
  const alive = centres.map((_, q) => share[q] >= 2 * minShare);
  if (!alive.some(Boolean)) alive[share.indexOf(Math.max(...share))] = true;
  const remap = centres.map((c, q) => { if (alive[q]) return q; let b = -1, bd = Infinity; centres.forEach((c2, r) => { if (alive[r] && d2(c, c2) < bd) { bd = d2(c, c2); b = r; } }); return b; });
  label = Int32Array.from(label, v => remap[v]);
  const groups = [];
  for (let q = 0; q < centres.length; q++) {
    if (!alive[q]) continue;
    const mask = Uint8Array.from(label, v => (v === q ? 1 : 0));
    if (count(mask)) groups.push({ name: `region ${groups.length + 1}`, foreground: false, mask });
  }
  log(`practice: no segments for ${base || 'this source'}; ${groups.length} first-pass shapes from the plan's large regions: ${groups.map(g => `${(100 * count(g.mask) / n).toFixed(0)}%`).join(', ')}`);
  return groups;
}

// Where detail and contrast go: saliency times edge energy. Saliency is the u2net mask in work/masks when there is one,
// the foreground segments when there are those, and a centre prior otherwise.
export async function focusMap({ SRC, w, h, n, image, gaussian, num, log, path, fs, sharp, root, fg = null }) {
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
  log(`practice: focus from ${from} times edges, ${(100 * count(focal) / n).toFixed(1)}% of the sheet in ${blobs.length} blobs at ${blobs.map(b => `(${b.x.toFixed(2)}, ${b.y.toFixed(2)}) ${(100 * b.area).toFixed(1)}%`).join(', ')}`);
  // how far the second and third passes carry: 1 at the focus, falling with distance over a quarter of the sheet
  const broad = gaussian(Float32Array.from(focal), w, h, Math.max(2, 0.12 * Math.min(w, h)));
  const bt = Math.max(1e-6, quantile(Array.from(broad), 0.995));
  return { F, focal, blobs, broad: Float32Array.from(broad, v => Math.min(1, v / bt)) };
}

// The light's direction: the mean of minus the density gradient over the subject (or the painted sheet), pointing to the
// lit side. --practicelight x,y overrides it.
function lightDirection({ T, w, h, gaussian, fg, opt }) {
  const given = opt('practicelight', '');
  if (given) { const [x, y] = given.split(',').map(Number); const L = Math.hypot(x, y) || 1; return { x: x / L, y: y / L, given: true }; }
  const B = gaussian(T, w, h, Math.max(1, 0.01 * Math.min(w, h)));
  // inside the subject, away from its silhouette: an outline against a pale ground points every way at once
  const inner = fg ? erode(fg, w, h, Math.max(2, Math.round(0.03 * Math.min(w, h)))) : null;
  let sx = 0, sy = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (inner ? !inner[i] : T[i] < 0.05) continue;
    sx -= B[i + 1] - B[i - 1]; sy -= B[i + w] - B[i - w];
  }
  const L = Math.hypot(sx, sy) || 1;
  return { x: sx / L, y: sy / L, given: false };
}

// The palette's blue and its earth: the pan that absorbs red most against blue, and the one that absorbs blue most
// against red. A one-pan palette uses its one pan for both.
export function darkPair(PIGS) {
  const tilt = p => (p.K[0] - p.K[2]) / Math.max(1e-6, p.K[0] + p.K[1] + p.K[2]);
  let blue = 0; PIGS.forEach((p, j) => { if (tilt(p) > tilt(PIGS[blue])) blue = j; });
  let earth = blue === 0 && PIGS.length > 1 ? 1 : 0;
  PIGS.forEach((p, j) => { if (j !== blue && tilt(p) < tilt(PIGS[earth])) earth = j; });
  return { blue, earth: PIGS.length > 1 ? earth : blue };
}

// The amounts of the two pans whose densities, summed, best match a target density per channel (least squares, both
// amounts at least zero). This is the dark mixed on the palette, not built up on the paper.
export function fitDark(target, PIGS, { blue, earth }) {
  const kb = PIGS[blue].K.map(v => v / DENSITY_SCALE), ke = PIGS[earth].K.map(v => v / DENSITY_SCALE);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const one = (k) => Math.max(0, dot(k, target) / Math.max(1e-9, dot(k, k)));
  const err = (a, b) => { let s = 0; for (let c = 0; c < 3; c++) { const t = a * kb[c] + b * ke[c] - target[c]; s += t * t; } return s; };
  let a = 0, b = 0;
  if (blue !== earth) {
    const bb = dot(kb, kb), ee = dot(ke, ke), be = dot(kb, ke), bt = dot(kb, target), et = dot(ke, target), det = bb * ee - be * be;
    if (det > 1e-12) { a = (bt * ee - et * be) / det; b = (et * bb - bt * be) / det; }
    if (!(a >= 0 && b >= 0)) { const a1 = one(kb), b1 = one(ke); if (err(a1, 0) <= err(0, b1)) { a = a1; b = 0; } else { a = 0; b = b1; } }
  } else a = one(kb);
  const mix = new Array(PIGS.length).fill(0); mix[blue] += a; mix[earth] += b;
  return mix;
}

// Colour directions inside a group: up to --practicecolours clusters of the cells' pigment direction, merged when
// closer than --practicecolourmerge (L1) or smaller than a tenth of the group.
function localColours({ A, K, T, cells, num }) {
  const stride = Math.max(1, Math.round(cells.length / 3000));
  const pts = [];
  for (let q = 0; q < cells.length; q += stride) { const i = cells[q], t = Math.max(1e-4, T[i]); pts.push(Float64Array.from({ length: K }, (_, j) => A[i * K + j] / t)); }
  const { labels, centres } = kmeans(pts, Math.max(1, Math.round(num('practicecolours', 3))));
  const size = centres.map((_, q) => labels.reduce((a, v) => a + (v === q ? 1 : 0), 0) / Math.max(1, pts.length));
  const out = [];
  centres.map((c, q) => ({ c, s: size[q] })).sort((a, b) => b.s - a.s).forEach(({ c, s }) => {
    const l1 = o => o.c.reduce((a, v, j) => a + Math.abs(v - c[j]), 0);
    const near = out.find(o => l1(o) < num('practicecolourmerge', 0.14));
    if (near || s < 0.1) { (near ?? out[0]).s += s; return; }
    out.push({ c: Array.from(c), s });
  });
  return out.map(o => { const t = o.c.reduce((a, v) => a + Math.max(0, v), 0) || 1; return { dir: o.c.map(v => Math.max(0, v) / t), share: o.s }; });
}

// The whole plan: groups, lights, four passes and the focus, each pass's planned amounts in pigment units per cell.
export async function planPractice(ctx) {
  const { A, K, PIGS, w, h, n, SRC, image, gaussian, num, opt, log, path, fs, sharp, root, RESIST = null } = ctx;
  const T = totalsOf(A, K, n);
  const floor = num('practicefloor', 0.06);
  const painted = Uint8Array.from(T, v => (v >= floor ? 1 : 0));
  const short = Math.min(w, h), cell = r => Math.max(1, Math.round(r * short));
  const base = image ? path.basename(image, path.extname(image)) : '';
  // the drawing the pen draws from: its lines bound the passages, as a painter's shapes follow the drawing
  const barrier = opt('practicelines', '1') !== '0' ? lineBarrier(opt('drawingfile', '') || `${base}-seg`, w, h, { grow: 1 }) : null;
  if (barrier) log(`practice: passages are cut along the drawing's lines (${(100 * count(barrier) / n).toFixed(1)}% of the sheet)`);
  const groups = await groupRegions({ A, K, T, w, h, n, image, gaussian, num, log, path, barrier });
  const fg = groups.some(g => g.foreground) ? Uint8Array.from({ length: n }, (_, i) => (groups.some(g => g.foreground && g.mask[i]) ? 1 : 0)) : null;
  const focus = await focusMap({ SRC, w, h, n, image, gaussian, num, log, path, fs, sharp, root, fg });
  const L = lightDirection({ T, w, h, gaussian, fg, opt });
  log(`practice: the light from (${L.x.toFixed(2)}, ${L.y.toFixed(2)})${L.given ? ', as given' : ', read from the picture'}`);

  // the lights: the lightest share of each group, kept as paper under frisket through the first pass
  const lights = RESIST ? Uint8Array.from(RESIST) : new Uint8Array(n);
  const lshare = num('practicelights', 0.12), lcap = num('practicelightsmax', 0.35);
  for (const g of groups) {
    const cells = []; for (let i = 0; i < n; i++) if (g.mask[i]) cells.push(i);
    if (cells.length < 50) continue;
    const cut = quantile(cells.map(i => T[i]), lshare);
    for (const i of cells) if (T[i] <= cut && T[i] <= lcap && painted[i]) lights[i] = 1;
  }
  // and the source's paper white and pale sheen wherever they are (--practicesheen, the source's own density)
  const sheen = num('practicesheen', 0.10);
  if (sheen > 0) for (let i = 0; i < n; i++) if (SRC[i] < sheen) lights[i] = 1;
  // shapes, not specks: read soft, with a wandering edge, and specks left to the brush (practice-regions.mjs)
  let LIGHTS = shapeLights(lights, { w, h, n, gaussian, num });
  // the region lights (these, and only these, may be toned pale at the end); then the paper the source leaves white,
  // which the first pass's big shapes would otherwise sweep over, and the painter's own masked lights (RESIST)
  const REGION_LIGHTS = Uint8Array.from(LIGHTS);
  const bare = removeSmall(Uint8Array.from(painted, v => 1 - v), w, h, Math.max(8, Math.round(num('practicelightmin', 0.0006) * n)));
  LIGHTS = Uint8Array.from(LIGHTS, (v, i) => (v || bare[i] || (RESIST && RESIST[i]) ? 1 : 0));

  const pair = darkPair(PIGS);
  const tone = toneLights(REGION_LIGHTS, focus, { w, h, n, num });
  const focalZone0 = dilate(focus.focal, w, h, cell(0.01));
  const kfDir = opt('practicekf', '');
  const mode = opt('practicemode', 'loose');
  if (mode === 'loose') {
    const style = await measureStyle({ SRC, w, h, n, px: ctx.px ?? null, gaussian, minFilter, maxFilter, log });
    const dials = styleDials(style, opt);
    log(`practice: loose, from the style: ${Object.entries(dials).map(([k, v]) => `${k} ${(+v).toFixed(2)}`).join(', ')}`);
    const stages = looseStages({ A, K, T, PIGS, w, h, n, painted, LIGHTS, groups, fg, barrier, focus, pair, gaussian, num, log, SRC, dials });
    return { T, painted, lights: LIGHTS, tone, focus, light: L, focalZone: focalZone0, stages, style, dials };
  }
  if (kfDir) throw new Error('--practicekf is retired: its A/B/D/H/I files were style plates, not stages; supply a reference film with genuine process stages');
  if (mode === 'target') {
    log('practice: the four stages read off the plan itself (--practicemode target)');
    const stages = targetStages({ A, K, T, PIGS, w, h, n, painted, LIGHTS, groups, barrier, focus, pair, gaussian, num, log });
    return { T, painted, lights: LIGHTS, tone, focus, light: L, focalZone: focalZone0, stages };
  }

  // pass 1: one light pass of local colour, a wet shape per group
  const Tb = gaussian(T, w, h, cell(0.015));
  // values relative to the sheet's own range: the plan's units run to 10 on a black subject and to 0.1 on a pale sky
  const paintedT = []; for (let i = 0; i < n; i++) if (painted[i]) paintedT.push(T[i]);
  const q1 = num('practiceq1', 0.3), cap1 = num('practicecap1', 0.2) * quantile(paintedT, 0.9);
  const p1 = new Float32Array(n * K);
  const pass1 = [];
  let area1 = 0;
  const order = groups.slice().sort((a, b) => (a.foreground - b.foreground) || (meanY(a.mask, w, n) - meanY(b.mask, w, n)));
  for (const g of order) {
    let M = and(g.mask, painted);
    const r = cell(0.01);
    M = removeSmall(erode(dilate(M, w, h, r), w, h, r), w, h, Math.max(20, Math.round(0.002 * n)));
    M = and(M, g.mask);
    const cells = []; for (let i = 0; i < n; i++) if (M[i]) cells.push(i);
    if (cells.length < 20) continue;
    const unlit = cells.filter(i => !LIGHTS[i]);
    const v1 = Math.min(cap1, quantile((unlit.length ? unlit : cells).map(i => T[i]), q1));
    if (v1 < 0.5 * floor) continue;
    let meanTb = 0; for (const i of cells) meanTb += Tb[i]; meanTb /= cells.length;
    const colours = localColours({ A, K, T, cells: unlit.length > 30 ? unlit : cells, num });
    // each colour's pull at every cell of the shape: its cells blurred at a mop's scale, so colours meet softly
    const near = cells.map(i => { const t = Math.max(1e-4, T[i]); let b = 0, bd = Infinity; colours.forEach((c, q) => { let s = 0; for (let j = 0; j < K; j++) s += Math.abs(A[i * K + j] / t - c.dir[j]); if (s < bd) { bd = s; b = q; } }); return b; });
    const pull = colours.map((_, q) => { const f = new Float32Array(n); cells.forEach((i, k) => { if (near[k] === q) f[i] = 1; }); return gaussian(f, w, h, cell(0.02)); });
    const grade = new Float32Array(n);
    for (const i of cells) {
      grade[i] = Math.max(0.6, Math.min(1.5, Tb[i] / Math.max(1e-4, meanTb)));
      let s = 0; for (let q = 0; q < colours.length; q++) s += pull[q][i];
      for (let j = 0; j < K; j++) { let d = 0; for (let q = 0; q < colours.length; q++) d += (s > 1e-6 ? pull[q][i] / s : q === 0 ? 1 : 0) * colours[q].dir[j]; p1[i * K + j] = d * v1 * grade[i]; }
    }
    area1 += cells.length;
    pass1.push({ name: g.name, foreground: g.foreground, mask: M, value: v1, colours, area: cells.length });
  }
  log(`practice pass 1: ${pass1.length} wet shapes over ${(100 * area1 / n).toFixed(0)}% of the sheet (${pass1.map(s => `${s.name} ${(100 * s.area / n).toFixed(0)}% at ${s.value.toFixed(2)} OD in ${s.colours.length} colour${s.colours.length > 1 ? 's' : ''}`).join('; ')}), ${(100 * count(LIGHTS) / n).toFixed(1)}% kept as paper`);

  // the darks chosen first, so the second pass can leave them on near-bare paper
  const fall = num('practicefalloff', 0.3), fade = i => 1 - fall + fall * focus.broad[i];
  const sum1 = i => { let t = 0; for (let j = 0; j < K; j++) t += p1[i * K + j]; return t; };
  const tDark = quantile(Array.from(T), 1 - num('practicedarks', 0.03));
  const dmin = num('practicedarkmin', 0.05);
  // read at a small brush's scale so a dark is a shape, not a scatter of the darkest cells
  const Td = gaussian(T, w, h, Math.max(0.7, 0.005 * short));
  const tDarkB = quantile(Array.from(Td), 1 - num('practicedarks', 0.03));
  let M3 = Uint8Array.from({ length: n }, (_, i) => (Td[i] >= tDarkB && T[i] - sum1(i) > dmin ? 1 : 0));
  M3 = removeSmall(fillHoles(M3, w, h, Math.round(0.0005 * n)), w, h, Math.max(4, Math.round(num('practicemin3', 0.0001) * n)));
  M3 = Uint8Array.from(M3, (v, i) => (v && !LIGHTS[i] ? 1 : 0));   // no dark goes over a reserved light

  // pass 2: mid-values on dry paper, about half the first pass's area, off the darks
  // mid-values stop at the --practicecap2 quantile of the painted sheet: the rest of the depth is the darks'
  const cap2 = quantile(paintedT, num('practicecap2', 0.95));
  const R2 = Float32Array.from({ length: n }, (_, i) => (painted[i] && !LIGHTS[i] && !M3[i] ? Math.max(0, Math.min(T[i], cap2) - sum1(i)) : 0));
  const R2b = gaussian(R2, w, h, cell(0.008));
  const cand = []; for (let i = 0; i < n; i++) if (painted[i] && !LIGHTS[i] && !M3[i]) cand.push(R2b[i]);
  const want2 = num('practicehalf', 0.5) * area1;
  const t2 = quantile(cand, Math.max(0, 1 - want2 / Math.max(1, cand.length)));
  let M2 = Uint8Array.from(R2b, (v, i) => (v > Math.max(t2, 0.02) && painted[i] && !LIGHTS[i] ? 1 : 0));
  M2 = removeSmall(fillHoles(erode(dilate(M2, w, h, 1), w, h, 1), w, h, Math.round(0.001 * n)), w, h, Math.max(12, Math.round(num('practicemin2', 0.001) * n)));
  M2 = Uint8Array.from(M2, (v, i) => (v && !LIGHTS[i] && !M3[i] && !(barrier && barrier[i]) ? 1 : 0));
  const load2 = num('practiceload2', 0.9);
  const p2 = new Float32Array(n * K);
  const pass2 = [];
  {
    // one mixed colour a shape: the mask cut by the colour of what is still owed, so a jacket and a face are two shapes
    const idx = []; for (let i = 0; i < n; i++) if (M2[i]) idx.push(i);
    const dirOf = i => { const r = Float64Array.from({ length: K }, (_, j) => Math.max(0, A[i * K + j] - p1[i * K + j])); const t = r.reduce((a, v) => a + v, 0) || 1; return r.map(v => v / t); };
    const stride = Math.max(1, Math.round(idx.length / 4000));
    const { centres } = kmeans(idx.filter((_, q) => q % stride === 0).map(dirOf), Math.max(1, Math.round(num('practicecolours2', 5))));
    const keep = []; for (const c of centres) if (!keep.some(k => k.reduce((a, v, j) => a + Math.abs(v - c[j]), 0) < num('practicecolourmerge', 0.14))) keep.push(c);
    const lab = new Int32Array(n).fill(-1);
    for (const i of idx) { const d = dirOf(i); let b = 0, bd = Infinity; keep.forEach((c, q) => { let s2 = 0; for (let j = 0; j < K; j++) s2 += Math.abs(d[j] - c[j]); if (s2 < bd) { bd = s2; b = q; } }); lab[i] = b; }
    const votes = keep.map((_, q) => gaussian(Float32Array.from(lab, v => (v === q ? 1 : 0)), w, h, 1.5));
    for (const i of idx) { let b = 0; for (let q = 1; q < keep.length; q++) if (votes[q][i] > votes[b][i]) b = q; lab[i] = b; }
    for (let q = 0; q < keep.length; q++) {
      const Mq = removeSmall(Uint8Array.from(lab, v => (v === q ? 1 : 0)), w, h, Math.max(12, Math.round(num('practicemin2', 0.001) * n)));
      const { labels } = components(Mq, w, h);
      const byId = new Map();
      for (let i = 0; i < n; i++) if (labels[i]) { if (!byId.has(labels[i])) byId.set(labels[i], []); byId.get(labels[i]).push(i); }
      for (const [, cells] of byId) {
        const mixSum = new Float64Array(K);
        for (const i of cells) for (let j = 0; j < K; j++) mixSum[j] += Math.max(0, A[i * K + j] - p1[i * K + j]);
        const tot = mixSum.reduce((a, v) => a + v, 0) || 1, dir = Array.from(mixSum, v => v / tot);
        const mask = new Uint8Array(n); let amount = 0;
        for (const i of cells) {
          mask[i] = 1;
          const a = R2[i] * load2 * fade(i);
          for (let j = 0; j < K; j++) p2[i * K + j] = dir[j] * a;
          amount += a;
        }
        pass2.push({ mask, dir, amount: amount / cells.length, area: cells.length, y: meanY(mask, w, n) });
      }
    }
    pass2.sort((a, b) => a.y - b.y);
  }
  const area2 = pass2.reduce((a, s2) => a + s2.area, 0);
  log(`practice pass 2: ${pass2.length} shapes over ${(100 * area2 / n).toFixed(0)}% of the sheet, ${(100 * area2 / Math.max(1, area1)).toFixed(0)}% of the first pass, mean ${(pass2.reduce((a, s2) => a + s2.amount * s2.area, 0) / Math.max(1, area2)).toFixed(2)} units`);

  // pass 3: the darks, mixed thick from the blue and the earth, on paper that has had only the first pass
  const p3 = new Float32Array(n * K);
  const pass3 = [];
  {
    const { labels } = components(Uint8Array.from(M3, (v, i) => (v && !(barrier && barrier[i]) ? 1 : 0)), w, h);
    const byId = new Map();
    for (let i = 0; i < n; i++) if (labels[i]) { if (!byId.has(labels[i])) byId.set(labels[i], []); byId.get(labels[i]).push(i); }
    for (const [, cells] of byId) {
      const target = [0, 0, 0]; let f = 0;
      for (const i of cells) {
        f += fade(i);
        for (let j = 0; j < K; j++) { const r = Math.max(0, A[i * K + j] - p1[i * K + j]); for (let c = 0; c < 3; c++) target[c] += r * PIGS[j].K[c] / DENSITY_SCALE; }
      }
      f /= cells.length;
      const mix = fitDark(target.map(v => v / cells.length), PIGS, pair).map(v => v * f * num('practiceload3', 0.9));
      const amount = mix.reduce((a, v) => a + v, 0);
      if (amount < dmin) continue;
      const mask = new Uint8Array(n);
      for (const i of cells) { mask[i] = 1; for (let j = 0; j < K; j++) p3[i * K + j] = mix[j]; }
      pass3.push({ mask, mix, amount, area: cells.length, y: meanY(mask, w, n) });
    }
    pass3.sort((a, b) => a.y - b.y);
  }
  const area3 = pass3.reduce((a, s2) => a + s2.area, 0);
  log(`practice pass 3: ${pass3.length} darks over ${(100 * area3 / n).toFixed(1)}% of the sheet, mixed from ${PIGS[pair.blue].name ?? `pan ${pair.blue}`} and ${PIGS[pair.earth].name ?? `pan ${pair.earth}`}, mean ${(pass3.reduce((a, s2) => a + s2.amount * s2.area, 0) / Math.max(1, area3)).toFixed(2)} units, dark threshold ${tDark.toFixed(2)}`);

  // pass 4: what is still owed at the focus, for the small brush
  const focalZone = dilate(focus.focal, w, h, cell(0.01));
  const want4 = new Float32Array(n), dir4 = new Float32Array(n * K);
  for (let i = 0; i < n; i++) {
    if (!focalZone[i] || LIGHTS[i]) continue;
    let t = 0; const r = new Float64Array(K);
    for (let j = 0; j < K; j++) { r[j] = Math.max(0, A[i * K + j] - p1[i * K + j] - p2[i * K + j] - p3[i * K + j]); t += r[j]; }
    want4[i] = Math.min(num('practicecap4', 1.2), t) * (0.5 + 0.5 * focus.F[i]);
    if (t > 1e-6) for (let j = 0; j < K; j++) dir4[i * K + j] = r[j] / t;
  }
  let owed4 = 0; for (let i = 0; i < n; i++) owed4 += want4[i];
  log(`practice pass 4: ${(100 * count(focalZone) / n).toFixed(1)}% of the sheet at the focus, ${owed4.toFixed(0)} OD-cells still owed there`);

  const cellsOf = m => { const c = []; for (let i = 0; i < n; i++) if (m[i]) c.push(i); return Int32Array.from(c); };
  const stages = [
    { key: '1', name: 'light local colour, wet', P: p1, passages: pass1.map(x => ({ name: x.name, cells: cellsOf(x.mask), tech: 'wet', prewet: true, soften: 'none', ground: !x.foreground })) },
    { key: '2', name: 'mid-values on dry paper', P: p2, passages: pass2.map((x, k) => ({ name: `mid ${k + 1}`, cells: cellsOf(x.mask), tech: 'dry', soften: 'far' })) },
    { key: '3', name: 'darks, mixed thick', P: p3, passages: pass3.map((x, k) => ({ name: `dark ${k + 1}`, cells: cellsOf(x.mask), tech: 'thick', soften: 'far' })) },
    { key: '4', name: 'focal detail', P: new Float32Array(n * K), passages: [], marks: { want: want4, dir: dir4 } },
  ];
  return { T, painted, lights: LIGHTS, tone, focus, light: L, focalZone, stages };
}

// Some region lights toned pale at the very end, once the frisket comes off: the half farthest from the focus
// (--practicepure 0.5 stay paper); the bare paper and the painter's masked lights are never toned.
function toneLights(REGION_LIGHTS, focus, { w, h, n, num }) {
  const tone = new Uint8Array(n);
  const { labels, count: nl } = components(REGION_LIGHTS, w, h);
  const score = new Float64Array(nl + 1), cnt = new Float64Array(nl + 1);
  for (let i = 0; i < n; i++) if (labels[i]) { score[labels[i]] += focus.F[i]; cnt[labels[i]]++; }
  const ids = [...Array(nl).keys()].map(k => k + 1).sort((a, b) => score[b] / cnt[b] - score[a] / cnt[a]);
  const pure = new Set(ids.slice(0, Math.round(num('practicepure', 0.5) * ids.length)));
  for (let i = 0; i < n; i++) if (labels[i] && !pure.has(labels[i])) tone[i] = 1;
  return tone;
}

function meanY(mask, w, n) { let y = 0, c = 0; for (let i = 0; i < n; i++) if (mask[i]) { y += (i / w) | 0; c++; } return c ? y / c : 0; }

// The closing pen on the focal darks only: each stroke cut to its runs inside the zone.
export function focalDarkCut({ zone, w, h, minPoints = 2 }) {
  return gs => {
    if (!gs) return gs;
    const inside = q => { const x = Math.min(w - 1, Math.max(0, Math.round(q.x))), y = Math.min(h - 1, Math.max(0, Math.round(q.y))); return zone[y * w + x] === 1; };
    const out = [];
    for (const g of gs) {
      let cur = [];
      for (const q of g.points) { if (inside(q)) cur.push(q); else { if (cur.length >= minPoints) out.push({ ...g, points: cur }); cur = []; } }
      if (cur.length >= minPoints) out.push({ ...g, points: cur });
    }
    return out;
  };
}
