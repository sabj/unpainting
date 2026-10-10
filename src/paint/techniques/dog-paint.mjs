// --dogpaint <segment|1>: a black curly-coated dog in paint with no line, its curls as loaded blots built up in dried
// layers so each keeps its rim. The ladder's glazes are clipped off the dog and every pen is cut where it crosses it.
// Four acts run over the ladder (--dogpaintat): local colour wet in wet, the dark, the darkest, and the edge.
//
// Flags, all off unless --dogpaint is given (--dogcoat presets in tuned/dog-coats.mjs override some defaults):
//   --dogpaintat 0,0.25,0.55,0.8  where in the ladder each act runs, as shares of its passes
//   --dogdab 0.03,0.07            blot radius, as shares of the dog's width (so the crop and the whole sheet agree);
//                                 --dogfit 1.2: no blot wider than that share of its distance to the silhouette
//   --dog1 0.25                   act 1's charges carry this share of the plan (lit cells --doglitmul 0.35 of it);
//                                 --dog1wash 0.15 of the plan in the wetting sweeps themselves
//   --dog2 0.4                    act 2's share of the plan's dark mix, scaled by the plan's value there (--dogmodel 1)
//   --dog3 0.3                    act 3's share, over cells above the --dog3q 0.4 quantile of the plan
//   --dog4 0.18                   act 4's edge blots; --dog4gap 2.2 radii apart along the silhouette, --dog4out 0.5 radii
//   --dogcharge 0.4               share of act 2 blots charged wet in wet with a second mix
//   --dogwater 1                  how loaded the blot brush is
//   --dogclip 1                   acts 1 to 3 are clipped to the silhouette grown by this many cells
//   --doglitskip 0.25             share of blots on lit cells left out
//   --dogedge <evap>              edge evaporation while the dog dries (default the sheet's own)
//   --doglit 0.2                  the lit cells: this palest share of the dog by plan, and a band along its top
import fs from 'node:fs';
import { hasSegments, loadSegments } from '../../crop/segments.mjs';
import { artworkMass, outerEdge } from './dark-mass-shape.mjs';
import { cutStrokes } from './dark-mass.mjs';
import { ringletLayout } from './dog-ringlets.mjs';
import { lockStrokes, clumpCrescents, darkWash } from './dog-locks.mjs';
import { scribblePass } from './dog-scribble.mjs';
import { strandPass } from './dog-strands.mjs';
import { minFilter, maxFilter } from '../../raster.js';
import { setClip } from '../../media/sheet.mjs';
import { COATS } from '../tuned/dog-coats.mjs';

const quantileOver = (F, mask, q) => {
  const v = []; for (let i = 0; i < mask.length; i++) if (mask[i]) v.push(F[i]);
  if (!v.length) return 0;
  v.sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.max(0, Math.floor(q * (v.length - 1))))];
};

// the dog's width in cells: the widest row of the mass, which a crop that cuts the dog's lower half still measures
function widthOf(mask, w, h) {
  let best = 0;
  for (let y = 0; y < h; y++) { let x0 = w, x1 = -1; for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (x < x0) x0 = x; x1 = x; } if (x1 >= x0) best = Math.max(best, x1 - x0 + 1); }
  return best;
}

// Blot centres inside `allow` (cells), at least `gap` apart: dart throwing over the cells in a seeded order, which is a
// Poisson-disc set without a grid showing through
export function blotCentres(allow, w, h, gap, rnd, { limit = Infinity } = {}) {
  const cells = []; for (let i = 0; i < allow.length; i++) if (allow[i]) cells.push(i);
  for (let k = cells.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); const t = cells[k]; cells[k] = cells[j]; cells[j] = t; }
  const G = Math.max(1, gap), gw = Math.ceil(w / G), gh = Math.ceil(h / G), grid = new Map(), out = [];
  for (const i of cells) {
    if (out.length >= limit) break;
    const x = (i % w) + rnd() - 0.5, y = ((i / w) | 0) + rnd() - 0.5, gx = Math.floor(x / G), gy = Math.floor(y / G);
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) {
      if (gx + dx < 0 || gy + dy < 0 || gx + dx >= gw || gy + dy >= gh) continue;
      for (const p of grid.get((gy + dy) * gw + gx + dx) || []) if ((p.x - x) ** 2 + (p.y - y) ** 2 < G * G) { ok = false; break; }
    }
    if (!ok) continue;
    const p = { x, y, i }; out.push(p);
    const key = gy * gw + gx; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(p);
  }
  return out;
}

// One blot's path in sheet pixels: a press (the tip set down and rolled a little) or a short C turned by the tip
export function blotPath(cx, cy, r, rnd, { cShare = 0.3 } = {}) {
  if (rnd() >= cShare) {
    // a press: the tip set down and rolled once round, so the blot is round and not the hairs' rectangle
    const a0 = rnd() * 2 * Math.PI, d = 0.35 * r, pts = [];
    for (let k = 0; k <= 8; k++) { const a = a0 + (k / 8) * 2 * Math.PI; pts.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r: 0.85 * r, p: 0.9 }); }
    pts.push({ x: cx, y: cy, r: 0.8 * r, p: 1 });
    return pts;
  }
  const a0 = rnd() * 2 * Math.PI, sweep = (0.8 + 0.8 * rnd()) * Math.PI * (rnd() < 0.5 ? -1 : 1), ra = 0.6 * r, steps = 7, pts = [];
  for (let k = 0; k < steps; k++) {
    const u = k / (steps - 1), a = a0 + sweep * u;
    pts.push({ x: cx + Math.cos(a) * ra, y: cy + Math.sin(a) * ra, r: r * (0.75 + 0.25 * Math.sin(Math.PI * u)), p: 0.75 + 0.25 * Math.sin(Math.PI * u) });
  }
  return pts;
}

export async function dogPaint(ctx0) {
  const spec = ctx0.opt('dogpaint', '');
  if (!spec || spec === '0') return null;
  const coat = ctx0.opt('dogcoat', 'wet');
  if (!COATS[coat]) throw new Error(`--dogcoat: wet or dry, not ${coat}`);
  const preset = COATS[coat];
  const ctx = { ...ctx0, opt: (k, d) => ctx0.opt(k, k in preset ? String(preset[k]) : d), num: (k, d) => ctx0.num(k, k in preset ? preset[k] : d) };
  ctx.log(`dog paint: the ${coat} coat`);
  const { w, h, n, K, A, image, path, dilate, erode, components, num, opt, log } = ctx;
  // --dogseg <base>: the segments file to take the dog from (work/segments/<base>), for a source whose own segments
  // name the dog wrongly (a portrait, where the rule-named 'figure' is the dog; tools/seg/sam-points.py)
  const base = opt('dogseg', '') || (image ? path.basename(image, path.extname(image)) : '');
  if (!base || !hasSegments(base)) { log(`dog paint: no segments for ${base || 'this source'}`); return null; }
  const seg = await loadSegments(base, w, h);
  const name = spec === '1' ? 'dog' : spec;
  const region = seg.regions.find(r => r.name === name && r.area);
  if (!region) { log(`dog paint: no segment named ${name}`); return null; }
  const PLAN = new Float32Array(n);
  for (let i = 0; i < n; i++) { let t = 0; for (let j = 0; j < K; j++) t += A[i * K + j]; PLAN[i] = t; }
  // the silhouette from the artwork's own density inside the grown segment, its small holes filled (they are left to
  // the gaps between blots, not to a frisket)
  const shaped = ctx.SRC ? artworkMass({ seg: region.mask, SRC: ctx.SRC, w, h, n, dilate, erode, components, num }) : null;
  let mask = shaped ? shaped.filled : Uint8Array.from(region.mask);
  const whole = mask;
  // --dogown <density>: the passage owns only the dog's dark coat, the cells of the source at this density or more
  // (closed by a cell, pieces under --dogownmin cells dropped); the rest of the dog (a white face, grey legs) is left to
  // the ladder as the control paints it. For a dog that is not black all over (for example black ears and a white face).
  if (opt('dogown', '') !== '' && ctx.SRC) {
    const od = num('dogown', 0.9);
    let m = Uint8Array.from(mask, (v, i) => (v && ctx.SRC[i] >= od ? 1 : 0));
    m = Uint8Array.from(erode(dilate(m, w, h, 1), w, h, 1), (v, i) => (v && mask[i] ? 1 : 0));
    const { labels, areas, count } = components(m, w, h), min = Math.round(num('dogownmin', 60)), keep = new Set();
    for (let id = 1; id <= count; id++) if (areas[id] >= min) keep.add(id);
    mask = Uint8Array.from(labels, l => (keep.has(l) ? 1 : 0));
  }
  let area = 0; for (let i = 0; i < n; i++) area += mask[i];
  const width = widthOf(mask, w, h);
  log(`dog paint: ${name}, ${area} cells, ${width} cells wide, plan density median ${quantileOver(PLAN, mask, 0.5).toFixed(2)}, 90th ${quantileOver(PLAN, mask, 0.9).toFixed(2)}`);
  const penCut = dilate(mask, w, h, 1);
  const at = opt('dogpaintat', '0,0.25,0.55,0.8').split(',').map(Number);
  if (at.length !== 4 || at.some(v => !Number.isFinite(v))) throw new Error(`--dogpaintat: four shares of the ladder, not ${opt('dogpaintat', '')}`);
  // Highlights are reserved before any dark goes down: the source's own lights inside the dog, measured as
  // src/eval/curls.mjs does (top-hat opening of radius --doglightr 2, lighter by over 0.08 of the source's light level).
  // Flecks: lights near paper (density --doglightod 0.35 or less) and the artwork's small holes, under masking fluid
  // through all four acts. Sheen: the other lights and every cell under --dogsheenod 0.9, a no-dark mask that only
  // act 1's pale cool sweep may cross.
  const SRC = ctx.SRC || new Float32Array(n), lightOD = num('doglightod', 0.35), sheenOD = num('dogsheenod', 0.9);
  const Lrel = Float32Array.from(SRC, v => Math.exp(-v));
  const lightLevel = Float32Array.from(Lrel).sort()[Math.floor(0.9 * (n - 1))];
  const Ls = ctx.gaussian(Lrel, w, h, 0.7), lr = Math.max(1, Math.round(num('doglightr', 2)));
  const opened = maxFilter(minFilter(Ls, w, h, lr), w, h, lr);
  const flecks = new Uint8Array(n), sheen = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (mask[i]) {
    // --dogsrclift 0 drops the source's local lights that are not near paper, for a source where they are an even
    // speckle; the coat's lights then come from the clumps
    const lifted = num('dogsrclift', 1) > 0 && Ls[i] - opened[i] > 0.08 * lightLevel;
    if ((lifted && SRC[i] <= lightOD) || (shaped && shaped.flecks[i]) || SRC[i] <= lightOD) flecks[i] = 1;
    else if (lifted || SRC[i] <= sheenOD) sheen[i] = 1;
  }
  if (num('dogflecks', 1) <= 0) flecks.fill(0);
  if (num('dogsheen', 1) <= 0) sheen.fill(0);
  let fc = 0, sc = 0; for (let i = 0; i < n; i++) { fc += flecks[i]; sc += sheen[i]; }
  log(`dog paint: highlights reserved from the source: flecks ${fc} cells (${(100 * fc / Math.max(1, area)).toFixed(1)}% of the dog) under fluid, sheen ${sc} cells (${(100 * sc / Math.max(1, area)).toFixed(1)}%) kept from the darks`);
  // the mask and the reserves, so each frame can be measured against the source's own shares
  if (opt('out', '')) {
    const runs = m => { const r = []; for (let i = 0; i < n; i++) if (m[i]) { const a = i; while (i < n && m[i]) i++; r.push(a, i - a); } return r; };
    let srcLight = 0, srcSheen = 0; for (let i = 0; i < n; i++) if (mask[i]) { if (SRC[i] <= lightOD) srcLight++; else if (SRC[i] <= sheenOD) srcSheen++; }
    fs.mkdirSync(opt('out', ''), { recursive: true });
    fs.writeFileSync(path.join(opt('out', ''), 'dog-mask.json'), JSON.stringify({ w, h, SC: ctx.SC, image: ctx.image, lightOD, sheenOD, source: { light: srcLight / area, sheen: srcSheen / area }, mask: runs(mask), flecks: runs(flecks), sheen: runs(sheen) }));
  }
  const P = makeKit({ ...ctx, PLAN, mask, width, flecks, sheen });
  // --dogroute: how the dark coat is made. paint (default): a varied mixed wash with the curl texture in reserved
  // light strokes along the locks (dog-locks.mjs); scribble: the pen lays the coat as looping scribble over the pale
  // ground (dog-scribble.mjs); ringlets: dark cores under reserved crescents (dog-ringlets.mjs)
  const route = opt('dogroute', 'paint');
  if (!['paint', 'scribble', 'ringlets', 'accent', 'strands'].includes(route)) throw new Error(`--dogroute: paint, scribble, ringlets, accent or strands, not ${route}`);
  // accent: the ladder paints the dog as usual (nothing owned, no pen cut) and sparse scribble curls go on last, only
  // along the silhouette band (ear edges and tips) and the topknot (top --dogtop of the dog's height). The muzzle, eyes,
  // nose and chest lie inside and get none. strands: the same zone with long wavy pen strands (dog-strands.mjs).
  const accent = route === 'accent' || route === 'strands';
  if (accent) {
    const band = Math.max(1, num('dogedgeband', 0.05) * width), dIn = ctx.distanceToZero(whole, w, h);
    let y0 = h, y1 = -1; for (let i = 0; i < n; i++) if (whole[i]) { const y = (i / w) | 0; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const topY = y0 + num('dogtop', 0.18) * (y1 - y0), zone = new Uint8Array(n);
    // the strands take the whole dog's band (its wisps are pale, outside the dark coat); the accent loops the coat's
    const base0 = route === 'strands' ? whole : mask;
    for (let i = 0; i < n; i++) if (base0[i] && (dIn[i] <= band || ((i / w) | 0) <= topY)) zone[i] = 1;
    let zc = 0; for (let i = 0; i < n; i++) zc += zone[i];
    log(`dog paint: accent curls over ${zc} cells, the coat within ${band.toFixed(1)} cells of the silhouette and the top ${num('dogtop', 0.18)} of the dog`);
    P.zone = zone; P.whole = whole;
  }
  if (route === 'ringlets') {
    let rs = (Math.round(ctx.SEED) + 7331) | 0 || 1; const rr = () => ((rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const allow = Uint8Array.from(mask, (v, i) => (v && !flecks[i] ? 1 : 0));
    P.ring = ringletLayout(allow, P.lit, w, h, rr, { r0: Math.max(1.5, num('dogring', 0.025) * width), band: num('dogband', 0.32), arc: num('dogarc', 70), shadowShare: num('dogshadowcrest', 0.6) });
    let cc = 0, hl = 0; for (let i = 0; i < n; i++) { if (P.ring.crescent[i] && !sheen[i]) { sheen[i] = 1; cc++; } if (mask[i] && (sheen[i] || flecks[i])) hl++; }
    log(`dog paint: ${P.ring.curls.length} ringlets in ${P.ring.sets} sets, radius ${(num('dogring', 0.025) * width).toFixed(1)} cells; crescents add ${cc} cells; highlights reserved ${(100 * hl / Math.max(1, area)).toFixed(1)}% of the dog`);
  }
  if (route === 'paint') {
    // the light strokes, planned before the dark and added to the no-dark mask: most on the lit side and the chest
    let rs = (Math.round(ctx.SEED) + 6151) | 0 || 1; const rr = () => ((rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const weight = Float32Array.from(mask, (v, i) => (v && !flecks[i] && !sheen[i] ? (P.lit[i] ? 1 : num('doglockshade', 0.35)) : 0));
    const [l0, l1] = opt('doglocklen', '0.03,0.08').split(',').map(Number), [t0, t1] = opt('doglockthick', '0.004,0.009').split(',').map(Number);
    const shape = opt('doglockshape', 'lock');
    const locks = shape === 'clump'
      ? clumpCrescents({ mask, weight, w, h, rnd: rr, width, clump: num('dogclump', 0.1), fill: num('dogclumpfill', 0.8), ring: opt('dogringr', '0.009,0.014').split(',').map(Number), thick: opt('dogcrest', '0.003,0.007').split(',').map(Number), upper: num('dogupper', 0.85), lower: num('doglower', 0.2), cap: num('dogcap', 0) })
      : lockStrokes({ mask, weight, w, h, rnd: rr, width, share: num('doglockshare', 0.12), len: [l0, l1], thick: [t0, t1], ringlet: shape === 'ringlet' });
    if (shape === 'clump') log(`dog paint: ${locks.clumps.length} clumps, ${locks.rings} ringlets, ${locks.crests} crescents`);
    P.locks = locks;
    locks.strokes = locks.strokes || [];
    let lc = 0, hl = 0; for (let i = 0; i < n; i++) { if (locks.raster[i] && !sheen[i]) { sheen[i] = 1; lc++; } if (mask[i] && (sheen[i] || flecks[i])) hl++; }
    log(`dog paint: ${locks.strokes.length} light strokes along the locks, ${lc} cells; highlights reserved ${(100 * hl / Math.max(1, area)).toFixed(1)}% of the dog`);
  }
  const none = async () => {};
  const accentAct = async Q => { await scribblePass({ ...Q, mask: Q.zone, flecks: new Uint8Array(n), sheen: new Uint8Array(n) }, { part: 0, of: 1 }); };
  const acts = accent ? [none, none, none, route === 'strands' ? strandPass : accentAct]
    : route === 'ringlets' ? [act1, act2, act3, act4]
    : route === 'scribble' ? [act1, Q => scribblePass(Q, { part: 0, of: 2 }), Q => scribblePass(Q, { part: 1, of: 2 }), actEdge]
    : [act1, paintDark1, paintDark2, actEdge];
  let next = 0;
  return {
    owned: accent ? new Uint8Array(n) : mask,
    masses: [{ name, mask, whole: true }],
    clip(m) {
      if (accent) return m;
      let hit = 0; for (let i = 0; i < n; i++) if (m[i] && mask[i]) { hit = 1; break; }
      if (!hit) return m;
      const k = Uint8Array.from(m, (v, i) => (v && !mask[i] ? 1 : 0));
      let a = 0; for (let i = 0; i < n; i++) a += k[i];
      return a ? { mask: k, area: a } : null;
    },
    // --dogpen keep: the drawing's own strokes stay on the dog (the coat strands of a pen-and-wash source)
    cutPen: strokes => (accent || opt('dogpen', 'cut') === 'keep' ? strokes : cutStrokes(strokes, penCut, w, h)),
    takeGestures() {},
    async at(share) {
      while (next < 4 && share >= at[next]) { await acts[next](P); next++; }
    },
  };
}

// the shared machinery: the sheet's holdings, the dark mix, a blot brush, settling and drying
function makeKit(ctx) {
  const { sheet, w, h, n, SC, K, A, PIGS, SEED, UPRIGHT, CAL, PLAN, mask, width, thickness, createBrush, dip, stroke, step, dry, clock, num, opt, log, O } = ctx;
  let s = (Math.round(SEED) + 9127) | 0 || 1;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const STRENGTH = num('strength', 2.2), calWet = CAL?.['wet on dry'] ?? 1;
  const [dlo, dhi] = opt('dogdab', '0.03,0.07').split(',').map(Number);
  const rLo = Math.max(1, dlo * width), rHi = Math.max(rLo, dhi * width);
  // the cool pigment: the one that absorbs red most against blue; the rest are the warm earths
  const cool = PIGS?.length ? PIGS.map((p, j) => [j, (p.K?.[0] ?? 0) - (p.K?.[2] ?? 0)]).sort((a, b) => b[1] - a[1])[0][0] : -1;
  // the dog's dark mix: the plan's own amounts at its --dogmixq 0.7 quantile per pigment
  const dark = new Array(K).fill(0);
  for (let j = 0; j < K; j++) { const v = []; for (let i = 0; i < n; i++) if (mask[i]) v.push(A[i * K + j]); v.sort((a, b) => a - b); dark[j] = v[Math.floor(num('dogmixq', 0.7) * (v.length - 1))] ?? 0; }
  // lit cells: the palest share of the dog by plan, and a band along its top edge
  // and the head: the top --doghead 0.22 of the dog's height where the plan is no darker than the dog's median
  const lit = new Uint8Array(n);
  { const cut = quantileOver(PLAN, mask, num('doglit', 0.2)), top = Math.max(1, Math.round(num('dogtop', 0.07) * width)), med = quantileOver(PLAN, mask, 0.5);
    let y0 = h, y1 = -1; for (let i = 0; i < n; i++) if (mask[i]) { const y = (i / w) | 0; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const headY = y0 + num('doghead', 0.22) * (y1 - y0);
    for (let i = 0; i < n; i++) if (mask[i]) {
      const x = i % w, y = (i / w) | 0;
      if (PLAN[i] <= cut || (y <= headY && PLAN[i] <= med)) { lit[i] = 1; continue; }
      for (let d = 1; d <= top; d++) if (y - d < 0 || !mask[(y - d) * w + x]) { lit[i] = 1; break; }
    } }
  const onSheet = () => {
    const th = thickness(sheet), on = new Float32Array(n * K), H2 = h * SC, W2 = w * SC;
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) { const i = ((y / SC) | 0) * w + ((x / SC) | 0), c = y * W2 + x; for (let j = 0; j < K; j++) on[i * K + j] += th[j][c] / (SC * SC); }
    return on;
  };
  const held = m => { const on = onSheet(); let t = 0, p = 0, c = 0; for (let i = 0; i < n; i++) if (m[i]) { for (let j = 0; j < K; j++) t += on[i * K + j]; p += PLAN[i]; c++; } return c ? `${(t / c).toFixed(2)} of the plan's ${(p / c).toFixed(2)}` : '-'; };
  // the dog's own drying: --dogedge is the evaporation at a wet edge, which is what pulls a blot's pigment out to a dark
  // rim as it dries (Deegan); the sheet's default leaves the rim faint
  const OD = opt('dogedge', '') !== '' ? { ...O, edgeEvap: num('dogedge', O.edgeEvap) } : O;
  const settle = q => clock('flow', () => { for (let t = 0; t < q; t++) step(sheet, OD); });
  const dryAll = () => clock('dry', () => dry(sheet, 20000, OD, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));
  // a mix leaning cool (+1) or warm (-1): the cool pigment scaled up or down, the dark's total kept
  const lean = (mix, t) => {
    if (cool < 0 || !t) return mix;
    const tot = mix.reduce((a, v) => a + v, 0), m = mix.map((v, j) => (j === cool ? v * (1 + t) : v * (1 - 0.5 * t)));
    const t2 = m.reduce((a, v) => a + v, 0) || 1;
    return m.map(v => Math.max(0, v * tot / t2));
  };
  const brushes = new Map();
  const blotBrush = r => {
    const key = Math.max(1, Math.round(r * 2));
    if (!brushes.has(key)) {
      const R = key / 2;
      brushes.set(key, createBrush({ radius: R, bristles: Math.max(8, Math.ceil(3 * R)), capacity: 120, belly: 10, feed: 0.4, give: 0.9, free: 0.45, film: 0.25, splay: 0.08, stiffness: 4,
        wetMix: 0.5, bridge: num('dogbridge', 0.9), bridgeSoft: 2.4, breakup: 0.8, seed: 9300 + key + SEED }));
    }
    return brushes.get(key);
  };
  // one blot: dip at `mix` (pan amounts), laid along its path in sheet pixels
  const blot = (pts, mix, water) => {
    const b = blotBrush(Math.max(...pts.map(p => p.r)));
    dip(b, { water, conc: mix.map(v => v * STRENGTH * calWet) });
    clock('strokes', () => stroke(b, sheet, pts, { upright: UPRIGHT }));
  };
  const radius = () => rLo + (rHi - rLo) * rnd() ** 1.5;
  const toSheet = p => ({ x: (p.x + 0.5) * SC, y: (p.y + 0.5) * SC });
  const count = (k, v) => { ctx.used[k] = (ctx.used[k] || 0) + v; };
  const book = (m, share) => { for (let i = 0; i < n; i++) if (m[i]) for (let j = 0; j < K; j++) ctx.expected[i * K + j] = Math.max(ctx.expected[i * K + j], A[i * K + j] * share); };
  const centres = (allow, gap) => blotCentres(allow, w, h, gap, rnd);
  const near = ctx.flecks ? ctx.dilate(ctx.flecks, w, h, Math.max(1, Math.round(0.5 * rLo))) : null;
  const clearOfFlecks = allow => (near ? Uint8Array.from(allow, (v, i) => (v && !near[i] ? 1 : 0)) : allow);
  // masking fluid on the flecks, joined to any the sheet already carries; lifted at the end if the sheet had none
  let ownResist = false;
  const reserve = (extra = null) => {
    if (!ctx.flecks) return;
    const W2 = w * SC, H2 = h * SC, was = sheet.resist, st = sheet.resistStrength, both = new Uint8Array(W2 * H2);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) { const c = y * W2 + x; const i = ((y / SC) | 0) * w + ((x / SC) | 0); both[c] = ctx.flecks[i] || (extra && extra[i]) || (was && was[c]) ? 1 : 0; }
    const str = st ? Float32Array.from(both, (v, c) => (was && was[c] ? st[c] : 1)) : null;
    if (!was) ownResist = true;
    ctx.applyResist(sheet, both, str);
  };
  // The sheen and crescents go under masking fluid for each dark step, over act 1's pale cool ground, and come off once
  // dry, before the frame is taken, so the lights show as that tinted ground. Any earlier mask is restored each time.
  // --dogsheenfluid 0 leaves the sheen to the clip alone.
  let shielded = null;
  const shieldOn = () => {
    if (num('dogsheenfluid', 1) <= 0 || !ctx.sheen || shielded) return;
    shielded = { was: sheet.resist, st: sheet.resistStrength, own: ownResist };
    reserve(ctx.sheen);
  };
  const darkDry = () => {
    dryAll();
    if (!shielded) return;
    ctx.liftResist(sheet);
    if (shielded.was) ctx.applyResist(sheet, shielded.was, shielded.st);
    ownResist = shielded.own;
    shielded = null;
  };
  const release = () => { if (ownResist) { ctx.liftResist(sheet); ownResist = false; } };
  // a blot is no wider than the form it sits in (--dogfit, a share of the distance to the silhouette plus a cell), so
  // the narrow head and muzzle take small blots and keep their shape
  const inside = ctx.distanceToZero(mask, w, h), fit = num('dogfit', 1.2);
  const fitR = (i, r) => (fit > 0 ? Math.min(r, fit * inside[i] + 1) : r);
  // the plan's own value at a blot, against the dog's median: the lit head lighter, the shadow side darker
  // (--dogmodel 1 follows it fully, 0 lays one dark everywhere)
  const med = quantileOver(PLAN, mask, 0.5) || 1, model = num('dogmodel', 1);
  const valueAt = i => Math.max(0.4, Math.min(1.6, 1 + model * (PLAN[i] / med - 1)));
  // the brush stops at the silhouette (grown by `grow` cells): the sheet's clip, as a painter cuts a wash to its edge
  const W2c = w * SC, H2c = h * SC;
  const upMask = m => { if (SC === 1) return m; const o = new Uint8Array(W2c * H2c); for (let y = 0; y < H2c; y++) for (let x = 0; x < W2c; x++) o[y * W2c + x] = m[((y / SC) | 0) * w + ((x / SC) | 0)]; return o; };
  // `dark` true: the sheen is taken out of the clip, so no dark step touches it
  const clipTo = (grow, { dark = true } = {}) => {
    if (grow == null) { setClip(sheet, null); return; }
    let m = grow > 0 ? ctx.dilate(mask, w, h, Math.round(grow)) : mask;
    if (dark && ctx.sheen) m = Uint8Array.from(m, (v, i) => (v && !ctx.sheen[i] ? 1 : 0));
    const o = new Uint8Array(W2c * H2c); for (let y = 0; y < H2c; y++) for (let x = 0; x < W2c; x++) o[y * W2c + x] = m[((y / SC) | 0) * w + ((x / SC) | 0)];
    setClip(sheet, o);
  };
  return { ...ctx, clearOfFlecks, reserve, release, shieldOn, darkDry, STRENGTH, calWet, rnd, dark, lit, cool, rLo, rHi, radius, lean, blot, blotCentres: centres, fitR, valueAt, clipTo, upMask, toSheet, held, settle, dryAll, count, book };
}

// 1. local colour wet in wet: clean water over the body, then charges of a mid mix that run together
async function act1(P) {
  const { w, h, n, K, A, SC, mask, lit, num, log, STRENGTH, setStage, snap, erode, createBrush, dip, stroke, sheet, UPRIGHT, SEED, clock, brushedWashPaths, containPaths, distanceToZero } = P;
  const body = erode(mask, w, h, 1), share = num('dog1', 0.25), litMul = num('doglitmul', 0.35);
  // the water: a flat brush over the body, no pigment; nothing runs past the silhouette (--dogclip cells out)
  P.reserve();
  P.clipTo(num('dogclip', 1), { dark: false });
  const W2 = w * SC, H2 = h * SC, up = m => { if (SC === 1) return m; const o = new Uint8Array(W2 * H2); for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) o[y * W2 + x] = m[((y / SC) | 0) * w + ((x / SC) | 0)]; return o; };
  const M2 = up(body), dist = distanceToZero(M2, W2, H2);
  let paths = brushedWashPaths(M2, W2, H2, { pad: 0.6 * SC, minRadius: SC, minLength: 3 * SC, maxRadius: Math.max(SC, Math.round(P.rHi * SC)), seed: 9401 + SEED, overlap: 0.25, walk: true });
  paths = containPaths(paths, dist, W2, H2, { minRadius: 0.7 * SC, minLength: 2 * SC, slack: 0.35 * SC });
  for (const pts of paths) {
    const r = Math.max(SC, Math.max(...pts.map(p => p.r)));
    const wet = createBrush({ flat: true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, seed: 9402 + SEED });
    // the water carries a pale tint of the plan's own mix under the sweep (--dog1wash of the plan, cool on the lit
    // cells), so the whole body has a first value and no bare paper is left where the charges do not reach
    const tint = new Array(K).fill(0); let c = 0, litN = 0;
    for (const q of pts) { const i = Math.min(h - 1, Math.max(0, Math.floor(q.y / SC))) * w + Math.min(w - 1, Math.max(0, Math.floor(q.x / SC))); for (let j = 0; j < K; j++) tint[j] += A[i * K + j]; litN += lit[i]; c++; }
    const tw = num('dog1wash', 0.15) * STRENGTH * P.calWet / Math.max(1, c);
    dip(wet, { water: num('dog1wet', 0.7), conc: P.lean(tint.map(v => v * tw), litN > c / 2 ? 0.6 : 0) });
    clock('strokes', () => stroke(wet, sheet, pts, { upright: UPRIGHT }));
  }
  P.settle(8);
  // the charges keep off the sheen: only the pale sweep goes there
  P.clipTo(num('dogclip', 1));
  // the charges: large blots touched into the damp body, cool on the lit cells, the plan's own mix elsewhere
  const r0 = P.rHi * 1.2, cs = P.blotCentres(body, r0 * 1.3);
  for (const c of cs) {
    const i = c.i, l = lit[i], mix = A.slice(i * K, i * K + K).map(v => v * share * (l ? litMul : 1));
    const p = P.toSheet(c), r = P.fitR(i, r0 * (0.8 + 0.4 * P.rnd()));
    P.blot(blotPathScaled(p, r * SC, P.rnd), P.lean(Array.from(mix), l ? 0.8 : 0.4 - 0.6 * P.rnd()), num('dog1water', 0.8));
  }
  P.settle(num('dogsettle', 30));
  P.dryAll();
  P.clipTo(null);
  P.book(mask, share);
  P.count('dog wet in wet', paths.length + cs.length);
  log(`dog paint: 1, ${paths.length} strokes of clean water, ${cs.length} charges of a mid mix wet in wet; the dog holds ${P.held(mask)}`);
  setStage({ stage: 'dog paint', step: '1, local colour charged wet in wet', strokes: cs.length });
  snap();
}
const blotPathScaled = (p, r, rnd) => blotPath(p.x, p.y, r, rnd);

// blots over `allow`, in `sets` sets each dried before the next, each at `share` of the dark mix
async function blotSets(P, allow, { sets, share, gapR, water, charge, bloom = 0, rScale = 1, label }) {
  const { SC, num, snap, setStage, lit } = P;
  let laid = 0, charged = 0, blooms = 0;
  for (let k = 0; k < sets; k++) {
    const rMean = 0.5 * (P.rLo + P.rHi) * rScale, cs = P.blotCentres(P.clearOfFlecks(allow), gapR * rMean);
    const wet = [];
    for (const c of cs) {
      const r = P.fitR(c.i, P.radius() * rScale), p = P.toSheet(c), l = lit[c.i], v = P.valueAt(c.i);
      // the lit back: --doglitskip of its blots skipped, the rest paler
      if (l && P.rnd() < num('doglitskip', 0.25)) continue;
      // lit blots: paler and cool, the blue-grey of black fur under sky (--doglitmul, --doglitcool)
      const mix = P.lean(P.dark.map(d => d * v * share * (l ? num('doglitmul', 0.35) : 1) * (0.85 + 0.3 * P.rnd())), l ? num('doglitcool', 0.8) : (P.rnd() - 0.5) * 0.6);
      P.blot(blotPath(p.x, p.y, r * SC, P.rnd), mix, water);
      laid++;
      // a second touch while the blot is wet: a cooler or warmer dark dropped into it, which blooms
      if (P.rnd() < charge) {
        const a = P.rnd() * 2 * Math.PI, d = 0.3 * r * SC, cr = 0.5 * r * SC;
        P.blot([{ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, r: cr, p: 1 }, { x: p.x + Math.cos(a) * d * 0.5, y: p.y + Math.sin(a) * d * 0.5, r: cr, p: 0.9 }],
          P.lean(P.dark.map(d => d * v * share * 1.2), P.rnd() < 0.5 ? 0.8 : -0.6), water);
        charged++;
      }
      wet.push({ ...p, r: r * SC });
    }
    // a drop of clean water into some of the blots once they have begun to set: a backrun
    if (bloom > 0) {
      P.settle(num('dogbloomwait', 60));
      for (const b of wet) if (P.rnd() < bloom) {
        P.blot([{ x: b.x, y: b.y, r: 0.45 * b.r, p: 1 }, { x: b.x + 0.2 * b.r, y: b.y, r: 0.4 * b.r, p: 0.9 }], P.dark.map(() => 0), num('dogbloomwater', 1));
        blooms++;
      }
    }
    P.settle(num('dogsettle', 30));
    P.dryAll();
    setStage({ stage: 'dog paint', step: `${label}, set ${k + 1} of ${sets}`, strokes: laid });
    snap();
  }
  return { laid, charged, blooms };
}

// 2. the curls: rounded blots of the dark, wet on dry, in sets
async function act2(P) {
  const { mask, num, log, SC, setStage, snap, ring } = P;
  // the ringlets, set by set: each a dark core pressed a little below its centre, away from the light, so the pale
  // ground stays on its crown as the crescent (the crescents are out of the clip). A core is charged warm or cool.
  P.clipTo(num('dogclip', 1));
  const share = num('dog2', 0.4), water = num('dogwater', 1), drop = num('dogcoredrop', 0.15), size = num('dogcorer', 1.7);
  let laid = 0, charged = 0;
  for (let k = 0; k < ring.sets; k++) {
    P.shieldOn();
    for (const c of ring.curls) {
      if (c.set !== k) continue;
      const v = P.valueAt(c.i), cx = c.x - Math.cos(c.ang) * drop * c.r, cy = c.y - Math.sin(c.ang) * drop * c.r;
      const p = P.toSheet({ x: cx, y: cy }), r = P.fitR(c.i, size * c.r) * SC;
      const mix = P.lean(P.dark.map(d => d * v * share * (c.lit ? num('doglitmul', 0.35) * 2 : 1) * (0.85 + 0.3 * P.rnd())), c.lit ? 0.5 : (P.rnd() - 0.5) * 0.8);
      P.blot(blotPath(p.x, p.y, r, P.rnd, { cShare: 0 }), mix, water);
      laid++;
      if (P.rnd() < num('dogcharge', 0.4)) {
        P.blot([{ x: p.x, y: p.y + 0.2 * r, r: 0.5 * r, p: 1 }], P.lean(P.dark.map(d => d * v * share * 1.3), P.rnd() < 0.5 ? 0.8 : -0.6), water);
        charged++;
      }
    }
    P.settle(num('dogsettle', 30));
    P.darkDry();
    setStage({ stage: 'dog paint', step: `2, ringlet cores, set ${k + 1} of ${ring.sets}`, strokes: laid });
    snap();
  }
  // the dark between the ringlets: one wash of the dark over everything the clip leaves (the crescents, the sheen and
  // the flecks are out of it), a painter's negative painting round the lights (--dogfill of the dark, 0 off)
  const fill = num('dogfill', 0.3);
  let fillPaths = 0;
  if (fill > 0) {
    const { w, h, K, sheet, createBrush, dip, stroke, clock, brushedWashPaths, SEED, UPRIGHT, STRENGTH, calWet } = P;
    const M2 = P.upMask(mask), W2 = w * SC, H2 = h * SC;
    P.shieldOn();
    const paths = brushedWashPaths(M2, W2, H2, { pad: 0.6 * SC, minRadius: SC, minLength: 3 * SC, maxRadius: Math.max(SC, Math.round(0.6 * P.rHi * SC)), seed: 9501 + SEED, overlap: 0.2, walk: true });
    for (const pts of paths) {
      const r = Math.max(SC, Math.max(...pts.map(q => q.r)));
      const b = createBrush({ radius: r, bristles: Math.max(8, Math.ceil(r * 2)), capacity: 60, belly: 6, feed: 0.3, give: 0.85, free: 0.4, film: 0.25, splay: 0.05, stiffness: 6, wetMix: 0.4, bridge: 0.9, bridgeSoft: 2.4, breakup: 1.0, seed: 9502 + SEED });
      const q = pts[pts.length >> 1], i = Math.min(h - 1, Math.max(0, Math.floor(q.y / SC))) * w + Math.min(w - 1, Math.max(0, Math.floor(q.x / SC)));
      dip(b, { water: num('dogfillwater', 0.75), conc: P.lean(P.dark.map(d => d * P.valueAt(i) * fill), (P.rnd() - 0.5) * 0.6).map(v => v * STRENGTH * calWet) });
      clock('strokes', () => stroke(b, sheet, pts, { upright: UPRIGHT }));
    }
    fillPaths = paths.length;
    P.settle(num('dogsettle', 30));
    P.darkDry();
    setStage({ stage: 'dog paint', step: '2, the dark between the ringlets, round the crescents', strokes: fillPaths });
    snap();
  }
  P.clipTo(null);
  P.book(mask, share);
  P.count('dog ringlet cores', laid + charged + fillPaths);
  log(`dog paint: 2, ${laid} ringlet cores in ${ring.sets} sets, ${charged} charged wet in wet; the dog holds ${P.held(mask)}`);
}

// 3. the dark pools in the gap under each loop, in the shadow half, the full dark from a small tip
async function act3(P) {
  const { n, mask, lit, PLAN, num, log, SC, setStage, snap, ring } = P;
  const cut = quantileOver(PLAN, mask, num('dog3q', 0.4));
  P.clipTo(num('dogclip', 1));
  const share = num('dog3', 0.3), water = num('dogwater', 1);
  P.shieldOn();
  let k = 0;
  for (const c of ring.curls) {
    if (lit[c.i] || PLAN[c.i] < cut) continue;
    const x = c.x - Math.cos(c.ang) * 1.05 * c.r, y = c.y - Math.sin(c.ang) * 1.05 * c.r;
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= P.w || yi >= P.h || !mask[yi * P.w + xi]) continue;
    const p = P.toSheet({ x, y }), r = Math.max(0.6, P.fitR(yi * P.w + xi, 0.5 * c.r)) * SC;
    P.blot([{ x: p.x - 0.3 * r, y: p.y, r, p: 0.9 }, { x: p.x + 0.3 * r, y: p.y, r: 0.9 * r, p: 1 }], P.lean(P.dark.map(d => d * P.valueAt(c.i) * share), (P.rnd() - 0.5) * 0.6), water);
    k++;
  }
  P.settle(num('dogsettle', 30));
  P.darkDry();
  P.clipTo(null);
  P.book(mask, 1);
  P.count('dog pools', k);
  log(`dog paint: 3, ${k} dark pools under the loops; the dog holds ${P.held(mask)}`);
  setStage({ stage: 'dog paint', step: '3, the dark pooled under each loop', strokes: k });
  snap();
}

// 4. the edge: small blots on the silhouette, pushed out past it, so the outline is knobbly and broken
async function act4(P) {
  const { w, h, n, SC, mask, num, log, snap, setStage, gaussian } = P;
  const edge = outerEdge(mask, w, h), S = gaussian(Float32Array.from(mask), w, h, 1.6);
  const rMean = 0.5 * (P.rLo + P.rHi) * 0.6, cs = P.blotCentres(edge, num('dog4gap', 2.2) * rMean);
  const share = num('dog4', 0.18), out = num('dog4out', 0.5);
  P.clipTo(Math.ceil(P.rHi) + 2);
  P.shieldOn();
  let k = 0;
  for (const c of cs) {
    const i = c.i, x = i % w, y = (i / w) | 0;
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
    let gx = -(S[i + 1] - S[i - 1]), gy = -(S[i + w] - S[i - w]); const m = Math.hypot(gx, gy) || 1; gx /= m; gy /= m;
    const r = P.radius() * 0.6, push = out * r * P.rnd(), p = P.toSheet({ x: c.x + gx * push, y: c.y + gy * push });
    P.blot(blotPath(p.x, p.y, r * SC, P.rnd), P.lean(P.dark.map(v => v * share), (P.rnd() - 0.5) * 0.6), num('dogwater', 1));
    k++;
  }
  P.settle(num('dogsettle', 30));
  P.darkDry();
  P.clipTo(null);
  P.count('dog edge blots', k);
  log(`dog paint: 4, ${k} blots on the silhouette, pushed out up to ${out} of a radius; the dog holds ${P.held(mask)}`);
  setStage({ stage: 'dog paint', step: '4, the broken edge as blots', strokes: k });
  snap();
  const c = curlsPastEdge(P, edge, S);
  P.release();
  if (c) { setStage({ stage: 'dog paint', step: '4, curls past the edge with the tip', strokes: c }); snap(); }
}

// the paint route's dark: one wash over the whole coat, then a second over the shadow half, each shielded
async function paintDark1(P) {
  const { mask, num, log } = P;
  P.clipTo(num('dogclip', 1));
  const k = await darkWash(P, mask, { share: num('doglock1', 0.5), water: num('doglockwater', 0.8), label: '2, the dark as a mixed wash round the light strokes', seed: 9601 });
  P.clipTo(null);
  P.book(mask, num('doglock1', 0.5));
  P.count('dog dark wash', k);
  log(`dog paint: 2, ${k} sweeps of a mixed dark wash; the dog holds ${P.held(mask)}`);
}
async function paintDark2(P) {
  const { n, mask, lit, PLAN, num, log } = P;
  const cut = quantileOver(PLAN, mask, num('dog3q', 0.4)), deep = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (mask[i] && !lit[i] && PLAN[i] >= cut) deep[i] = 1;
  // with clumps, the gaps between them go dark too: cells farther from every clump centre than its ringlets reach
  if (P.locks?.clumps?.length) {
    const reach = 0.5 * num('dogclump', 0.1) * P.width * num('dogclumpfill', 0.8);
    for (let i = 0; i < n; i++) if (mask[i] && !deep[i]) { const x = i % P.w, y = (i / P.w) | 0; if (!P.locks.clumps.some(c => (c.x - x) ** 2 + (c.y - y) ** 2 < reach * reach)) deep[i] = 1; }
  }
  P.clipTo(num('dogclip', 1));
  const k = await darkWash(P, deep, { share: num('doglock2', 0.5), water: num('doglockwater', 0.8), label: '3, the dark again over the shadow half', seed: 9701 });
  P.clipTo(null);
  P.book(deep, 1);
  P.count('dog dark wash', k);
  log(`dog paint: 3, ${k} sweeps over the shadow half; the dog holds ${P.held(mask)}`);
}
// the last act of the paint and scribble routes: curls past the edge with the tip, and the fluid off
async function actEdge(P) {
  const { w, h, mask, gaussian, setStage, snap } = P;
  const edge = outerEdge(mask, w, h), S = gaussian(Float32Array.from(mask), w, h, 1.6);
  const c = curlsPastEdge(P, edge, S);
  P.release();
  setStage({ stage: 'dog paint', step: '4, curls past the edge with the tip', strokes: c });
  snap();
}

// One curl's centre line in cells: from a root just inside the silhouette out along `ang`, turning as a U or C (one
// bend) or an S (the bend flips halfway), `len` cells long
function curlLine(x0, y0, ang, len, rnd, { inside = 0.25 } = {}) {
  const s = rnd() < 0.35, turn = (0.9 + 0.8 * rnd()) * Math.PI * (rnd() < 0.5 ? -1 : 1), st = 0.6, pts = [];
  let x = x0 - Math.cos(ang) * inside * len, y = y0 - Math.sin(ang) * inside * len, a = ang;
  for (let t = 0; t <= len; t += st) {
    pts.push({ x, y, u: t / len });
    const k = turn / len * (s && t > len / 2 ? -1 : 1) * (t < inside * len ? 0.2 : 1);
    a += k * st; x += Math.cos(a) * st; y += Math.sin(a) * st;
  }
  return pts;
}

// Curls with the tip of a small round brush, rooted at the silhouette and running out past it, dark on the paper:
// U, C and S strokes pressed at the root and lifted at the tip. None run inside the dog. --dogcurls 0 turns them off;
// --dogcurlgap 0.05 and --dogcurllen 0.06,0.13 of the dog's width, --dogcurlr 0.009 of it for the tip, --dogcurl 0.5
// of the plan's dark
function curlsPastEdge(P, edge, S) {
  const { w, h, SC, num, opt, log, width, lit, createBrush, dip, stroke, sheet, clock, SEED, STRENGTH, calWet } = P;
  if (num('dogcurls', 1) <= 0) return 0;
  const cs = P.blotCentres(edge, Math.max(2, num('dogcurlgap', 0.05) * width));
  const [llo, lhi] = opt('dogcurllen', '0.06,0.13').split(',').map(Number);
  const r = Math.max(0.6, num('dogcurlr', 0.009) * width) * SC;
  const brush = createBrush({ radius: r, bristles: Math.max(5, Math.ceil(3 * r)), capacity: 40, belly: 4, feed: 0.35, give: 0.85, free: 0.4, film: 0.25, splay: 0.05, stiffness: 3, wetMix: 0.3, bridge: 0.8, bridgeSoft: 1.6, breakup: 1.0, seed: 9700 + SEED });
  let k = 0;
  P.clipTo(Math.ceil(lhi * width) + 2);
  P.shieldOn();
  for (const c of cs) {
    const i = c.i, x = i % w, y = (i / w) | 0;
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
    const gx = -(S[i + 1] - S[i - 1]), gy = -(S[i + w] - S[i - w]);
    if (Math.hypot(gx, gy) < 1e-4) continue;
    const ang = Math.atan2(gy, gx) + (P.rnd() - 0.5) * 1.0, len = width * (llo + (lhi - llo) * P.rnd());
    const pts = curlLine(c.x, c.y, ang, len, P.rnd).map(q => ({ x: (q.x + 0.5) * SC, y: (q.y + 0.5) * SC, r: r * (1 - 0.6 * q.u), p: Math.max(0.3, 0.95 - 0.6 * q.u) }));
    // a curl off the lit head is the lit blue-grey, elsewhere the dark
    const mix = P.lean(P.dark.map(d => d * num('dogcurl', 0.5) * (lit[i] ? 0.7 : 1)), lit[i] ? 0.6 : (P.rnd() - 0.5) * 0.4);
    dip(brush, { water: num('dogcurlwater', 0.55), conc: mix.map(v => v * STRENGTH * calWet) });
    clock('strokes', () => stroke(brush, sheet, pts, { upright: P.UPRIGHT }));
    k++;
  }
  P.clipTo(null);
  P.settle(12);
  P.darkDry();
  P.count('dog curls', k);
  log(`dog paint: 4, ${k} curls past the edge with the tip`);
  return k;
}
