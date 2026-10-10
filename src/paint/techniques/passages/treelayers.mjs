// Background trees as a watercolourist lays them, after a standalone study of the technique ("the study" below), run
// inside the tree region of the plate's own sheet, between the background washes and the figure:
//
//   0. masking fluid on the paper flecks inside the trees, kept through every layer, rubbed off at the end
//   1. first wash: pale blue-grey over the big cool shapes (far ridge), pale warm ochre over the rest, in one go
//   2. local colour: the deeper field bands (washed if broad, dabbed with a #12 round if broken)
//   3. light olive mass: a flat-brush wash inside it, rounded #12 clumps worked into its edge while wet
//   4. mid clumps (#8), 5. dark clumps (#4, drier), 6. darkest accents (#4 on its tip)
// A tier covers every tree cell at least as dark as its threshold (quantiles 0.96, 0.62, 0.32, 0.10 of the squinted
// reference). A darker tier lands on the shadowed part of the dried clumps above it, and their lit shoulders stay light.
// Each tier is mixed from up to three puddles. Each is tested on a scrap of the same paper and adjusted until the scrap
// carries the wanted density: the plan's pigment over the cells that stop at that tier, less what is on the sheet.
//
// The region is found, not drawn: the plate's ground segment less its sky segment and less the figure mask; in it the
// olive and blue-grey cells by colour (the study's families), kept where a connected mass is mostly olive, closed over
// the field bands and flecks between the clumps. Owned cells are kept off the ladder (use --passexact 1).
//
// --treetechnique 1 (default): choose wet blend or dry layer per connected region and tier from the reference's shadow
// edges; keep a wet predecessor for charging and measure the paper before each shadow touch. 0 lays every layer wet on
// dry and dries the whole sheet before the next. Plans and paper readings go to technique-plan.json and technique-strokes.json.
// Flags: --treelayersdump 1 writes tree-region.png (region, families) to the run's folder; --treelayerslog 1 prints a
// line per layer (wanted density, laid density, marks). Scale 1 only (the sheet is the plan's grid).
import fs from 'node:fs';
import path from 'node:path';
import { createSheet, thickness as thicknessOf } from '../../../media/sheet.mjs';
import { distanceToZero, removeSmall, dilate, erode, components } from '../../../raster.js';
import { shadowEdges, chooseShadowTechnique, compoundClump, fitMoistStroke, strokeCells, enforcePaper, measurePaper, measureBrush, describeLayer, PAPER_STATE } from '../../methods/wetdry.mjs';
import { renderLayers } from '../../../media/km.mjs';
import { DEFAULT_SHEET_MM } from '../../../media/sheet-size.mjs';
import { OLIVE_FAMILIES } from '../../tuned/olive-families.mjs';

export const when = 'washes';
export const dryAfter = true;

const STUDY_MM = 0.259;   // the study's sheet: one cell a pixel of the 1086 plate, 0.259 mm
const lumOf = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const F = { paper: 0, sky: 1, ground: 2, terra: 3, cool: 4, olive: 5 };

function rng(seed) { let a = (seed * 2654435761) >>> 0 || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// mean over a (2r+1) square, clipped at the border
function boxMean(f, w, h, r) {
  if (r < 1) return Float32Array.from(f);
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { let s = 0, c = 0; const row = y * w; for (let x = -r; x < w + r; x++) { const xa = x + r, xr = x - r - 1; if (xa < w && xa >= 0) { s += f[row + xa]; c++; } if (xr >= 0 && xr < w) { s -= f[row + xr]; c--; } if (x >= 0 && x < w) tmp[row + x] = s / c; } }
  for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let y = -r; y < h + r; y++) { const ya = y + r, yr = y - r - 1; if (ya < h && ya >= 0) { s += tmp[ya * w + x]; c++; } if (yr >= 0 && yr < h) { s -= tmp[yr * w + x]; c--; } if (y >= 0 && y < h) out[y * w + x] = s / c; } }
  return out;
}

// The squinted reference channels are taken once, before the paint step: paint-plate calls precomputeTree before
// TARGET_GUARD.beginPaint() seals the target. The passage uses these copies only through clump means and the family
// map, both planning at clump level, never one cell's colour.
let PRE = null;
export function precomputeTree({ w, h, px, mmCell }) {
  const n = w * h, sq = mmCell < 0.4 ? 1 : 0;
  const ch = c => boxMean(Float32Array.from({ length: n }, (_, i) => px[i * 3 + c]), w, h, sq);
  PRE = { n, R: ch(0), G: ch(1), B: ch(2) };
}
export function treeRegion({ w, h, px, fig = null, seg = null, mmCell }) {
  const n = w * h, f = STUDY_MM / mmCell;
  // the study squinted 3x3 at 0.26 mm; a 540 source pixel is already about that average
  const sq = mmCell < 0.4 ? 1 : 0;
  const ch = c => boxMean(Float32Array.from({ length: n }, (_, i) => px[i * 3 + c]), w, h, sq);
  const R = PRE?.n === n ? PRE.R : ch(0), G = PRE?.n === n ? PRE.G : ch(1), B = PRE?.n === n ? PRE.B : ch(2);
  const L = new Float32Array(n); for (let i = 0; i < n; i++) L[i] = lumOf(R[i], G[i], B[i]);
  // the paper: the light end of the whole plate (between the 0.5th and the 3rd percent, past blown whites)
  const order = Array.from(L.keys()).sort((a, b) => L[b] - L[a]), top = order.slice(Math.round(n * 0.005), Math.max(5, Math.round(n * 0.03)));
  const paper = [R, G, B].map(C => top.reduce((s, i) => s + C[i], 0) / top.length), pl = lumOf(...paper);
  const cool = boxMean(Float32Array.from({ length: n }, (_, i) => B[i] - (R[i] + G[i]) / 2), w, h, Math.max(1, Math.round(2 * f)));
  const fam = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = R[i], g = G[i], b = B[i], l = L[i], chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (Math.hypot(r - paper[0], g - paper[1], b - paper[2]) < OLIVE_FAMILIES.paperDist || (l > pl - OLIVE_FAMILIES.paperL && chroma < OLIVE_FAMILIES.paperChroma)) fam[i] = F.paper;
    else if (r - g > OLIVE_FAMILIES.terraRG && r - b > OLIVE_FAMILIES.terraRB && r > OLIVE_FAMILIES.terraR) fam[i] = F.terra;
    else if (b - r > OLIVE_FAMILIES.skyBR && l > OLIVE_FAMILIES.skyL) fam[i] = F.sky;
    else if (r - b > OLIVE_FAMILIES.groundRB && l > OLIVE_FAMILIES.groundL) fam[i] = F.ground;
    else if (cool[i] > OLIVE_FAMILIES.coolMin) fam[i] = F.cool;
    else fam[i] = F.olive;
  }
  // Finding the trees on a whole plate needs a stricter olive than painting them. An olive tree is green against red as
  // well as blue; a warm shadow on sand or a pale grey-green sea is not. Inside the region the study's families decide
  // the layers, so yellow-olive bushes stay trees.
  const strictOlive = i => fam[i] === F.olive && R[i] - G[i] <= OLIVE_FAMILIES.strictRG && L[i] <= OLIVE_FAMILIES.strictL;
  const sky = seg && seg.regions ? seg.regions.find(r => r.name === 'sky') : null;
  const allowed = Uint8Array.from({ length: n }, (_, i) => ((fig && fig[i] > 0.5) || (sky && sky.mask[i]) ? 0 : 1));
  // trees: olive masses on the skyline (background trees stand against the sky), with the smaller blue-grey masses joined
  // to them (a far ridge, shadowed clumps; a sea or sky beside a treeline is larger and is not a tree)
  const minA = 12 / (mmCell * mmCell);
  const olive = Uint8Array.from({ length: n }, (_, i) => (allowed[i] && strictOlive(i) ? 1 : 0));
  // the skyline: in each column, the first solid warm or olive cell of the ground below the sky (blue-grey far ridges and
  // water are looked through), and the 6 mm under it
  const solid = removeSmall(Uint8Array.from({ length: n }, (_, i) => (allowed[i] && (fam[i] === F.olive || fam[i] === F.ground || fam[i] === F.terra) ? 1 : 0)), w, h, Math.round(minA));
  const skyline = new Uint8Array(n), reach = Math.round(6 / mmCell);
  // (the figure is looked past, but ground within 3 mm under the figure is foreground it stands on or shadows, and has
  // no skyline)
  const under = Math.round(3 / mmCell);
  for (let x = 0; x < w; x++) {
    let y = 0, lastFig = -1e9;
    while (y < h && !solid[y * w + x]) { if (fig && fig[y * w + x] > 0.5) lastFig = y; y++; }
    if (y >= h || y - lastFig <= under) continue;
    for (let k = 0; k <= reach && y + k < h; k++) skyline[(y + k) * w + x] = 1;
  }
  const oc = components(olive, w, h), onSky = new Float64Array(oc.areas.length);
  for (let i = 0; i < n; i++) if (oc.labels[i] && skyline[i]) onSky[oc.labels[i]]++;
  const keep = new Uint8Array(oc.areas.length);
  for (let l = 1; l < oc.areas.length; l++) if (oc.areas[l] >= minA && onSky[l] >= 2 / mmCell) keep[l] = 1;
  // a clump of olive below the skyline belongs to the trees when it lies within a closing's reach of them
  const rc = Math.max(1, Math.round(2.5 / mmCell));
  // (clumps of 2 mm² or more, at most three rounds, so small dark flecks do not chain the trees to nearby shadows)
  const minClump = 2 / (mmCell * mmCell);
  for (let round = 0; round < 3; round++) {
    const near = dilate(Uint8Array.from(oc.labels, l => (l && keep[l] ? 1 : 0)), w, h, rc);
    let added = 0; for (let i = 0; i < n; i++) { const l = oc.labels[i]; if (l && !keep[l] && near[i] && oc.areas[l] >= minClump) { keep[l] = 1; added++; } }
    if (!added) break;
  }
  const core = Uint8Array.from(oc.labels, l => (l && keep[l] ? 1 : 0));
  // blue-grey masses joined to a group of trees and smaller than it: a far ridge, shadowed clumps (a sea is larger)
  const groups = components(dilate(core, w, h, rc), w, h), gArea = new Float64Array(groups.areas.length);
  for (let i = 0; i < n; i++) if (core[i]) gArea[groups.labels[i]]++;
  const coolM = Uint8Array.from({ length: n }, (_, i) => (allowed[i] && fam[i] === F.cool ? 1 : 0));
  const cc = components(coolM, w, h), joinArea = new Float64Array(cc.areas.length), coreNear = dilate(core, w, h, 1);
  for (let i = 0; i < n; i++) if (cc.labels[i] && coreNear[i]) joinArea[cc.labels[i]] = Math.max(joinArea[cc.labels[i]], gArea[groups.labels[i]] || 0);
  const trees = Uint8Array.from({ length: n }, (_, i) => (core[i] || (cc.labels[i] && cc.areas[cc.labels[i]] < joinArea[cc.labels[i]]) ? 1 : 0));
  // the mass, closed over the field bands and paper flecks between the clumps, never onto the figure or the sky
  const hull = erode(dilate(trees, w, h, rc), w, h, rc);
  for (let i = 0; i < n; i++) if (!allowed[i]) hull[i] = 0; else if (trees[i]) hull[i] = 1;
  const region = removeSmall(hull, w, h, Math.round(40 / (mmCell * mmCell)));
  return { region, fam, L, R, G, B, paper, trees: Uint8Array.from({ length: n }, (_, i) => (region[i] && (fam[i] === F.olive || fam[i] === F.cool) ? 1 : 0)), f };
}

export async function region(ctx) {
  const { w, h, n, px, fwSubject, subject, seg, num, opt, log, outDir } = ctx;
  if ((ctx.SC || 1) !== 1) throw new Error('treelayers: --scale 1 only');
  const mmCell = num('sheetmm', DEFAULT_SHEET_MM) / w;
  const T = treeRegion({ w, h, px, fig: fwSubject || subject || null, seg, mmCell });
  let c = 0, t = 0; for (let i = 0; i < n; i++) { c += T.region[i]; t += T.trees[i]; }
  log(`tree layers: region ${c} cells (${(100 * c / n).toFixed(1)}% of the sheet), ${t} of them trees; ${mmCell.toFixed(3)} mm a cell; from ${seg ? 'the segments, ' : ''}${fwSubject || subject ? 'the figure mask and ' : ''}colour`);
  if (num('treelayersdump', 0) > 0 && outDir) {
    const sharp = (await import('sharp')).default, PAL = [[255, 255, 255], [150, 180, 255], [235, 205, 140], [230, 120, 40], [90, 110, 160], [110, 125, 60]];
    const o = Buffer.alloc(n * 3);
    for (let i = 0; i < n; i++) { const p = T.region[i] ? PAL[T.fam[i]] : [px[i * 3] * 0.35 + 160, px[i * 3 + 1] * 0.35 + 160, px[i * 3 + 2] * 0.35 + 160]; for (let k = 0; k < 3; k++) o[i * 3 + k] = Math.min(255, p[k]); }
    fs.mkdirSync(outDir, { recursive: true });
    await sharp(o, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(outDir, 'tree-region.png'));
  }
  const M = T.region; M.treeInfo = T;
  return M;
}

export async function paint(ctx) {
  const { sheet, w, h, n, K, A, O, SEED, createBrush, dip, stroke, step, dry, applyResist, liftResist, setClip, clock, snap, stage, num, log, used, region: M } = ctx;
  if (!M || !M.treeInfo) { log('tree layers: no region'); return; }
  const T = M.treeInfo, { fam, L, f } = T;
  const mmCell = num('sheetmm', DEFAULT_SHEET_MM) / w, cells = mm => mm / mmCell, VERB = num('treelayerslog', 1) > 0;
  const KIT = { flatHalfInch: cells(12.7) / 2, round12: cells(7) / 2, round8: cells(5) / 2, round4: cells(3) / 2 };
  const TECHNIQUE = num('treetechnique', 1) > 0;
  const L5 = boxMean(L, w, h, Math.max(1, Math.round(2 * f)));
  const rnd = rng((SEED | 0) + 1);
  let seedN = 100, marks = 0;
  const W = w, H = h;
  const book = (k, c) => { used[k] = (used[k] || 0) + c; marks += c; };
  const settleOn = sh => { for (let q = 0; q < 30; q++) step(sh, O); };
  const dryAll = () => { clock('flow', () => settleOn(sheet)); clock('dry', () => dry(sheet, 30000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) })); };
  const maskOf = pred => { const m = new Uint8Array(n); for (let i = 0; i < n; i++) m[i] = pred(i) ? 1 : 0; return m; };
  const listOf = m => { const a = []; for (let i = 0; i < n; i++) if (m[i]) a.push(i); return a; };
  const clean = (m, r) => removeSmall(dilate(erode(m, W, H, r), W, H, r), W, H, Math.max(1, Math.round(Math.PI * r * r * 2)));

  // Choices are made before any paint lands, from the reference alone.
  const techniqueLog = [], techniquePlan = [];
  let activeTechnique = null, techniqueStroke = 0, baseLayer = 'first wash';
  const startedBaseLayers = new Set();
  const groups = TECHNIQUE ? components(M, W, H) : null;
  const regionIds = TECHNIQUE ? Array.from(groups.areas.keys()).filter(id => id && groups.areas[id] > 0) : [0];
  if (TECHNIQUE) for (const id of regionIds) {
    const canopy = maskOf(i => groups.labels[i] === id && T.trees[i]);
    const values = listOf(canopy).map(i => L5[i]).sort((a, b) => a - b);
    if (values.length < 50) {
      const skipped = { region: id, cells: values.length, layers: [], reason: 'fewer than 50 canopy cells; no brushable tier' };
      techniquePlan.push(skipped); log(`technique plan ${JSON.stringify(skipped)}`); continue;
    }
    const q = v => values[Math.min(values.length - 1, Math.floor(v * values.length))];
    const overall = shadowEdges(L, canopy, W, H, mmCell);
    const layers = [0.96, 0.62, 0.32, 0.1].map((at, k) => ({
      layer: ['light olive', 'mid olive', 'dark olive', 'darkest'][k], threshold: q(at),
      ...(k ? chooseShadowTechnique(shadowEdges(L, canopy, W, H, mmCell, q(at), L5), overall) :
        { technique: 'dry layer', paperState: 'fully dry', edge: 'broken outer edge', evidence: 'foundation wash' })
    }));
    for (const [k, layer] of layers.entries()) {
      const water = layer.technique === 'wet blend' ? 0.30 : [0.62, 0.60, 0.58, 0.55][k];
      layer.brush = { waterLoadRange: [water * 0.85, water * 1.15],
        move: layer.technique === 'wet blend' ? 'blotted concentrated charge' : 'wet paint on dry paper',
        mix: 'palette premix, strength calibrated with this paper state' };
    }
    techniquePlan.push({ region: id, cells: values.length,
      underpainting: ['first wash', 'field bands'].map(layer => ({ layer, technique: 'dry layer',
        paperState: 'fully dry at wash start; join the wet edge within the wash', edge: 'reference mass boundary',
        move: 'wet on dry, then wet on wet at connected wet edges', referenceCue: 'reference colour families and connected field bands',
        intendedResult: 'connected pale underpainting preserving reference mass boundaries',
        brush: { shape: 'flat or round for narrow field bands', management: 'reload each sweep; measure remaining water and pigment before every stroke' },
        pigment: 'reference-fitted premix calibrated on the same paper', protectedLights: 'masked paper flecks',
        failureSigns: ['dry bands', 'flooded lights', 'unwanted mixing'] })),
      order: 'light to dark within each connected reference region; background passage before foreground subject',
      unusedMoves: { 'wet on wet': 'foundation wet-edge joining only', 'dry on dry': 'none selected', 'add water': 'none selected; retain existing wet wash', lift: 'none selected' },
      materials: { wash: 'variegated; premixed reference colours', lights: 'masked paper flecks',
        texture: 'physical paper tooth and pigment granulation', lifting: 'none', pen: 'none in this passage' }, layers: layers.map(describeLayer) });
    for (const layer of techniquePlan.at(-1).layers) log(`technique plan ${JSON.stringify({ region: id, ...layer })}`);
  }
  const writeTechnique = () => {
    if (!TECHNIQUE || !ctx.outDir) return;
    fs.mkdirSync(ctx.outDir, { recursive: true });
    fs.writeFileSync(path.join(ctx.outDir, 'technique-plan.json'), JSON.stringify({ defaultEnabled: true, legacyOverride: '--treetechnique 0', paperThresholds: PAPER_STATE,
      regions: techniquePlan }, null, 2));
    fs.writeFileSync(path.join(ctx.outDir, 'technique-plan.md'), techniquePlan.map(region => `## Region ${region.region}\n${region.reason ?? region.order ?? ''}\n` + (region.underpainting ?? []).map(layer => `- ${layer.layer}: ${layer.move}. Cue: ${layer.referenceCue}. Start: ${layer.paperState}. Preserve: ${layer.protectedLights}.`).join('\n') + '\n' + region.layers.map(layer => `- ${layer.layer}: ${layer.move}; ${layer.referenceCue}. Start: ${layer.startingState}. Brush: round ${layer.brush.size}. Preserve: ${layer.protectedLights}. Watch: ${layer.failureSigns.join(', ')}.`).join('\n')).join('\n\n'));
    fs.writeFileSync(path.join(ctx.outDir, 'technique-strokes.json'), JSON.stringify(techniqueLog, null, 2));
  };
  writeTechnique();

  // Foundation washes start on verified dry paper, then deliberately join their wet edge.
  // Their per-stroke readings remain in the same audit as the gated shadow strokes.
  const auditBaseStroke = (sh, pts, radius, water, conc, b) => {
    if (!TECHNIQUE || sh !== sheet) return;
    const cells = strokeCells(sh, pts, radius), label = `${baseLayer}/${++techniqueStroke}`;
    const brush = { radius, requestedWaterLoad: water, requestedPigmentConcentration: conc, measured: measureBrush(b) };
    if (!startedBaseLayers.has(baseLayer)) {
      enforcePaper({ sheet: sh, cells, technique: 'dry layer', step, dry, O, log, label,
        record: e => techniqueLog.push({ ...e, brush, operation: 'foundation wash start' }) });
      startedBaseLayers.add(baseLayer);
    } else {
      const entry = { label, technique: 'dry layer', operation: 'join foundation wet edge',
        requirement: 'measured state; no inter-stroke drying within foundation wash', ...measurePaper(sh, cells), brush };
      techniqueLog.push(entry); log(`technique stroke ${JSON.stringify(entry)}`);
    }
  };

  // what the sheet holds and what the plan wants, per cell and pigment (the wash palette only)
  const onSheet = () => { const th = thicknessOf(sheet), on = new Float32Array(n * K); for (let j = 0; j < K; j++) { const t = th[j]; for (let i = 0; i < n; i++) on[i * K + j] = t[i]; } return on; };
  // The mix, as the study mixed it: the optical density still missing between a set of cells' squinted mean colour and
  // what the sheet holds there, fitted with up to three pans (every such set is fitted, each extra pan penalised) and
  // checked through the sheet's own Kubelka-Munk rendering. The plan's every-pan unmixing, laid as clumps, mixes to grey.
  const paperRGB = ctx.paperRGB || T.paper, PG = ctx.PIGS.slice(0, K), Ks = PG.map(p => p.K.map(v => v / 0.55));
  const base1 = Uint8ClampedArray.from(paperRGB);
  const odOf = rgb => [0, 1, 2].map(c => -Math.log(Math.max(1, rgb[c]) / paperRGB[c]));
  const renderMean = a => renderLayers([a.map(v => Float32Array.of(Math.max(0, v)))], PG, base1, 1, 1);
  const nnls = (want, cols, x0) => {
    let x = x0 ? x0.slice() : cols.map(() => 0.1);
    const L = Math.max(1e-6, cols.reduce((t, a) => t + a[0] * a[0] + a[1] * a[1] + a[2] * a[2], 0));
    for (let it = 0; it < 400; it++) {
      const r = [0, 1, 2].map(c => cols.reduce((t, a, j) => t + a[c] * x[j], 0) - want[c]);
      x = x.map((v, j) => Math.max(0, v - (0.9 / L) * (r[0] * cols[j][0] + r[1] * cols[j][1] + r[2] * cols[j][2])));
    }
    return x;
  };
  const SETS = []; for (let a = 0; a < K; a++) { SETS.push([a]); for (let b = a + 1; b < K; b++) { SETS.push([a, b]); for (let c = b + 1; c < K; c++) SETS.push([a, b, c]); } }
  const fitMix = (targetRGB, onMean) => {
    const Dt = odOf(targetRGB);
    let best = null;
    for (const set of SETS) {
      const cols = set.map(j => Ks[j]);
      const full = x => { const a = onMean.slice(); set.forEach((j, q) => { a[j] += x[q]; }); return a; };
      let x = nnls(Dt.map((d, c) => d - odOf(renderMean(onMean))[c]), cols);
      for (let it = 0; it < 2; it++) {   // correct the straight-line fit through the rendering, as the plan's refit does
        const Dr = odOf(renderMean(full(x))), lin = [0, 1, 2].map(c => cols.reduce((t, a, q) => t + a[c] * x[q], 0));
        x = nnls(lin.map((v, c) => v + Dt[c] - Dr[c]), cols, x);
      }
      const Dr = odOf(renderMean(full(x))), err = [0, 1, 2].reduce((t, c) => t + (Dr[c] - Dt[c]) ** 2, 0), score = err + 0.0004 * set.length;
      if (!best || score < best.score) best = { set, x, score };
    }
    const mix = new Array(K).fill(0); best.set.forEach((j, q) => { mix[j] = best.x[q]; });
    return mix;
  };
  const wantOver = (list, on) => {
    if (!list.length) return new Array(K).fill(0);
    const rgb = [0, 0, 0]; for (const i of list) { rgb[0] += T.R[i]; rgb[1] += T.G[i]; rgb[2] += T.B[i]; }
    const o = new Array(K).fill(0); for (const i of list) for (let j = 0; j < K; j++) o[j] += on[i * K + j];
    return fitMix(rgb.map(v => v / list.length), o.map(v => v / list.length));
  };
  const meanOver = (list, arr) => { const v = new Array(K).fill(0); for (const i of list) for (let j = 0; j < K; j++) v[j] += arr[i * K + j]; return v.map(x => x / Math.max(1, list.length)); };
  const sum = v => v.reduce((a, b) => a + b, 0);
  const mixText = c => (c ? c.map((v, j) => (v > 0.005 ? `${(ctx.PIGS[j].name || 'pan ' + j).split(' ').slice(-1)[0]} ${v.toFixed(2)}` : '')).filter(Boolean).join(', ') : 'none');
  const rgbText = list => { const m = [0, 0, 0]; for (const i of list) { m[0] += T.R[i]; m[1] += T.G[i]; m[2] += T.B[i]; } return m.map(v => (v / Math.max(1, list.length)).toFixed(0)).join('/'); };

  // Marks follow the study's grammar, its cell sizes scaled to this sheet by f.
  const roundBrush = (r, seed) => createBrush({ radius: r, bristles: Math.max(8, Math.ceil(r * 2.5)), capacity: 60, belly: 6, feed: 0.25, give: 0.85, free: 0.4, film: 0.25, splay: 0.07, stiffness: Math.max(2, Math.round(r * 0.5)), streak: 0.4, seed });
  const PROFILE = [0.45, 0.9, 1, 0.9, 0.55];
  const touch = (ox, oy, ang, len, scale = 1) => { const dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2; return PROFILE.map((p, k) => { const u = (k / (PROFILE.length - 1)) * 2 - 1; return { x: ox + dx * u, y: oy + dy * u, p: p * scale }; }); };
  // a clump: two or three short pressed touches of a round's belly crossing near the centre, and a lobe or two at the
  // rim, the top half more often (foliage catches the light above)
  function clumpTouches(cx, cy, R, rb, r0) {
    const k = R < rb * 1.4 ? 2 : 3, base = r0() * Math.PI, out = [];
    for (let j = 0; j < k; j++) {
      const ang = base + (Math.PI * j) / k + (r0() - 0.5) * 0.5, len = Math.max(1.5 * f, (R - rb * 0.7) * (1.6 + 0.6 * r0()));
      out.push(touch(cx + (r0() - 0.5) * R * 0.35, cy + (r0() - 0.5) * R * 0.35, ang, len));
    }
    const lobes = R > rb ? 1 + (r0() < 0.5 ? 1 : 0) : 0;
    for (let j = 0; j < lobes; j++) {
      const t = -Math.PI / 2 + (r0() - 0.5) * 3.6, d = R * (0.55 + 0.25 * r0());
      out.push(touch(cx + d * Math.cos(t), cy + d * Math.sin(t), t + Math.PI / 2 + (r0() - 0.5), Math.max(1.5 * f, rb * 0.8), 0.8));
    }
    return out;
  }
  function paintDab(sh, cx, cy, R, rb, water, conc, r0, seed, trialTechnique = null) {
    const b = roundBrush(rb, seed);
    dip(b, { water, conc });
    const touches = clumpTouches(cx, cy, R, rb, r0);
    const paths = TECHNIQUE && ((sh === sheet && activeTechnique) || trialTechnique) ? [compoundClump(touches)] : touches;
    for (const plannedPts of paths) {
      let pts = plannedPts;
      if (TECHNIQUE && sh === sheet && activeTechnique) {
        let fitted = activeTechnique.technique === 'wet blend' ? fitMoistStroke(sh, pts, rb) :
          { points: pts, cells: strokeCells(sh, pts, rb), adjustment: null };
        pts = fitted.points;
        const cells = fitted.cells;
        if (!enforcePaper({ sheet: sh, cells, technique: activeTechnique.technique, step, dry, O, log,
          label: `${activeTechnique.region}/${activeTechnique.layer}/${++techniqueStroke}`,
          refit: () => { fitted = fitMoistStroke(sh, plannedPts, rb); pts = fitted.points; return fitted.cells; },
          record: e => { techniqueLog.push({ ...e, brush: { radius: rb, requestedWaterLoad: water, requestedPigmentConcentration: conc, measured: measureBrush(b), seed }, adjustment: fitted.adjustment }); if (!e.passed) writeTechnique(); } })) continue;
      }
      if (trialTechnique) {
        let fitted = trialTechnique === 'wet blend' ? fitMoistStroke(sh, pts, rb) :
          { points: pts, cells: strokeCells(sh, pts, rb) };
        pts = fitted.points;
        enforcePaper({ sheet: sh, cells: fitted.cells, technique: trialTechnique, step, dry, O,
          label: 'calibration scrap', refit: () => { fitted = fitMoistStroke(sh, plannedPts, rb); pts = fitted.points; return fitted.cells; } });
      }
      if (!activeTechnique) auditBaseStroke(sh, pts, rb, water, conc, b);
      stroke(b, sh, pts);
    }
    step(sh, O);
  }
  // cover a shape with clumps: centres taken in random order from what is not yet covered, each as big as the tier's
  // brush allows and not much past the shape's edge, then painted in rows the way a hand travels
  function placeClumps(mask, Wm, Hm, { rMin, rMax, spill = 2, cover = 0.75 }, r0 = rnd) {
    const dist = distanceToZero(mask, Wm, Hm), covered = new Uint8Array(Wm * Hm), cand = [];
    for (let i = 0; i < Wm * Hm; i++) if (mask[i]) cand.push(i);
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(r0() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    const out = [];
    for (const i of cand) {
      if (covered[i] || dist[i] < 1.5 * f) continue;
      const x = i % Wm, y = (i / Wm) | 0, want = rMin + (rMax - rMin) * r0();
      const R = Math.max(rMin * 0.6, Math.min(want, dist[i] + spill));
      out.push({ x: x + 0.5, y: y + 0.5, R });
      const rc = R * cover;
      for (let yy = Math.max(0, Math.floor(y - rc)); yy <= Math.min(Hm - 1, Math.ceil(y + rc)); yy++) for (let xx = Math.max(0, Math.floor(x - rc)); xx <= Math.min(Wm - 1, Math.ceil(x + rc)); xx++) if ((xx - x) ** 2 + (yy - y) ** 2 <= rc * rc) covered[yy * Wm + xx] = 1;
    }
    const band = Math.max(8 * f, rMax * 2);
    out.sort((a, b) => { const ba = Math.floor(a.y / band), bb = Math.floor(b.y / band); return ba !== bb ? ba - bb : (ba % 2 ? b.x - a.x : a.x - b.x); });
    return out;
  }
  // a flat wash: horizontal sweeps of a flat brush, each catching the bead of the last while it is wet; the brush
  // narrows where the shape narrows, is lifted over what is to stay paper, and is reloaded every 15 mm or so
  function washSweeps(mask, Wm, Hm, rMax, r0) {
    const dist = distanceToZero(mask, Wm, Hm), paths = [], gap = rMax * 1.3, dx = Math.max(1, Math.round(2 * f)), load = 60 * f;
    for (let yc = rMax * 0.6; yc < Hm; yc += gap) {
      let run = [];
      const flush = () => { if (run.length > 2) paths.push(run); run = []; };
      const ph = r0() * 6.28, amp = (1 + r0()) * f;
      for (let x = 0; x < Wm; x += dx) {
        const yf = yc + amp * Math.sin(ph + x / (23 * f)), y = Math.max(0, Math.min(Hm - 1, Math.round(yf))), d = dist[y * Wm + x], r = Math.min(rMax, d + 1.5 * f);
        if (r >= 2.5 * f) { run.push({ x: x + 0.5, y: yf, r, p: 1 }); if (run.length * dx >= load) { const last = run[run.length - 1]; flush(); run.push(last); } } else flush();
      }
      flush();
    }
    return paths;
  }
  function paintWash(sh, mask, conc, { rMax, water = 0.85, seed }, r0) {
    const paths = washSweeps(mask, sh.w, sh.h, rMax, r0), every = Math.max(3, Math.round(6 * f));
    for (const [k, pts] of paths.entries()) {
      const b = createBrush({ flat: true, radius: rMax, bristles: Math.max(12, Math.ceil(rMax * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.3, seed: seed + k });
      dip(b, { water, conc });
      auditBaseStroke(sh, pts, rMax, water, conc, b);
      stroke(b, sh, pts, { between: s => { if (s % every === 0) step(sh, O); } });
    }
    return paths.length;
  }

  // The scrap: a corner of the same paper, to test a mix before it goes on.
  const SN = Math.max(72, Math.round(96 * f));
  const scrapPaper = (() => {
    const p = sheet.paper, out = { w: SN, h: SN, n: SN * SN };
    for (const [k, v] of Object.entries(p)) {
      if (k === 'w' || k === 'h' || k === 'n') continue;
      if (ArrayBuffer.isView(v) && v.length === p.n) { const a = new v.constructor(SN * SN); for (let y = 0; y < SN; y++) for (let x = 0; x < SN; x++) a[y * SN + x] = v[(y + 8) * p.w + x + 8]; out[k] = a; }
      else out[k] = v;
    }
    return out;
  })();
  const trial = (mark, conc) => {
    const sc = createSheet(scrapPaper, sheet.pigments), read = mark(sc, conc);
    settleOn(sc); dry(sc, 30000, O, { levelMax: 140, dt: 14 });
    const th = thicknessOf(sc); let s = 0; for (let j = 0; j < K; j++) for (const i of read) s += th[j][i];
    return s / Math.max(1, read.length);
  };
  const tuned = (mark, mix, want) => {
    const total = sum(want); if (total < 0.004) return null;
    let c = mix.map(v => v * 2.2);
    for (let it = 0; it < 3; it++) {
      const got = trial(mark, c), s = total / Math.max(1e-4, got);
      c = c.map(v => v * Math.min(4, s));
      if (Math.abs(s - 1) < 0.05) break;
    }
    return c;
  };
  const sc64 = v => Math.round(v * SN / 64);
  const washTrial = (rMax, water) => (sc, conc) => {
    const m = new Uint8Array(SN * SN); for (let y = sc64(6); y < sc64(58); y++) for (let x = sc64(4); x < sc64(60); x++) m[y * SN + x] = 1;
    paintWash(sc, m, conc, { rMax, water, seed: 7 }, rng(7));
    const read = []; for (let y = sc64(20); y < sc64(44); y++) for (let x = sc64(16); x < sc64(48); x++) read.push(y * SN + x); return read;
  };
  // A tier is tested as it will be laid: a patch of its clumps (and, for the first tier, the wash inside it), so the
  // trial carries the overlap of neighbouring clumps at this sheet's scale.
  const patchTrial = (t, withWash, technique = null) => (sc, conc) => {
    const c = SN / 2, pr = SN * 0.42, m = new Uint8Array(SN * SN);
    for (let y = 0; y < SN; y++) for (let x = 0; x < SN; x++) if ((x + 0.5 - c) ** 2 + (y + 0.5 - c) ** 2 < pr * pr) m[y * SN + x] = 1;
    const r0 = rng(11);
    // Match the planned paper timing on the scrap. Clean water is the wet-test
    // foundation so the measured pigment is solely the additional shadow mix.
    if (technique === 'wet blend') paintWash(sc, new Uint8Array(SN * SN).fill(1), new Array(K).fill(0),
      { rMax: Math.min(KIT.flatHalfInch, 6 * f), water: 0.7, seed: 13 }, rng(13));
    if (withWash) { const inner = erode(m, SN, SN, t.rMin * 0.9); paintWash(sc, inner, conc.map(v => v * 0.8), { rMax: Math.min(KIT.flatHalfInch, pr * 0.6), water: 0.7, seed: 13 }, r0); }
    for (const cl of placeClumps(m, SN, SN, { rMin: t.rMin, rMax: t.rMax, spill: t.spill * f, cover: 0.85 }, r0)) paintDab(sc, cl.x, cl.y, cl.R, Math.min(t.rb, cl.R * 0.6), t.water, conc, r0, 17, technique);
    const read = [], rr = SN * 0.25; for (let y = 0; y < SN; y++) for (let x = 0; x < SN; x++) if ((x + 0.5 - c) ** 2 + (y + 0.5 - c) ** 2 < rr * rr) read.push(y * SN + x); return read;
  };
  const dabTrial = (R, rb, water) => (sc, conc) => {
    const c = SN / 2; paintDab(sc, c, c, R, rb, water, conc, rng(5), 5);
    const read = [], r = R * 0.5; for (let y = 0; y < SN; y++) for (let x = 0; x < SN; x++) if ((x + 0.5 - c) ** 2 + (y + 0.5 - c) ** 2 < r * r) read.push(y * SN + x); return read;
  };
  // a mix is the plan's pigments in the proportions wanted; the trial sets its strength
  const mixOf = want => { const s = sum(want); return s > 0 ? want.map(v => v / s * Math.min(1, s)) : want; };

  const prevClip = sheet.clip ?? null;
  const fig = ctx.fwSubject || ctx.subject || null;
  const reachOut = dilate(M, W, H, Math.max(1, Math.round(cells(1))));
  setClip(sheet, maskOf(i => reachOut[i] && !(fig && fig[i] > 0.5)));
  const layerLog = [];
  let tLayer = Date.now();
  const settle = (name, label, keepWet = false) => {
    if (!keepWet) dryAll();
    const on = onSheet();
    for (const Lg of layerLog) if (Lg.got == null) { Lg.got = sum(meanOver(Lg.list, on)) - (Lg.before ?? 0); Lg.ms = Date.now() - tLayer; }
    tLayer = Date.now();
    stage({ step: `trees: ${label}` }); snap();
  };
  // the background is dry before the trees go on
  dryAll();
  log(`tree layers: brushes flat ${KIT.flatHalfInch.toFixed(1)}, #12 ${KIT.round12.toFixed(1)}, #8 ${KIT.round8.toFixed(1)}, #4 ${KIT.round4.toFixed(1)} cells in radius; scrap ${SN} cells`);

  // 0. masking fluid on the flecks
  const reserve = maskOf(i => M[i] && fam[i] === F.paper);
  let masked = false;
  if (!sheet.resist) { let c = 0; for (const v of reserve) c += v; if (c) { applyResist(sheet, reserve); masked = true; log(`tree layers: masking fluid on ${c} fleck cells`); } }
  else log('tree layers: the sheet already holds masking fluid; the flecks are not masked');

  // 1. the first wash, variegated
  const WASH_WATER = 0.85;
  let lightGroundL = 255;
  {
    const notPaper = maskOf(i => M[i] && fam[i] !== F.paper);
    const coolBig = removeSmall(maskOf(i => M[i] && (fam[i] === F.cool || fam[i] === F.sky)), W, H, Math.max(1, Math.round(0.02 * listOf(M).length)));
    const skyM = maskOf(i => M[i] && coolBig[i]), restM = maskOf(i => M[i] && !coolBig[i]);
    const on = onSheet();
    for (const [name, m] of [['first wash, blue-grey', skyM], ['first wash, warm', restM]]) {
      const list = listOf(m); if (list.length < 50) continue;
      const light = list.filter(i => notPaper[i]).sort((a, b) => L[b] - L[a]).slice(0, Math.max(1, Math.round(list.length * 0.12)));
      if (m === restM) lightGroundL = light.reduce((a, i) => a + L[i], 0) / Math.max(1, light.length);
      const want = wantOver(light, on);
      const d = distanceToZero(m, W, H), ds = list.map(i => d[i]).sort((a, b) => a - b), rWash = ds[Math.floor(ds.length * 0.9)] > KIT.flatHalfInch ? KIT.flatHalfInch : KIT.round12;
      const c0 = tuned(washTrial(rWash, WASH_WATER), mixOf(want), want); if (!c0) continue;
      // a big wash on the sheet runs a quarter darker than the scrap trial (more strokes into wet paint)
      const conc = c0.map(v => v * 0.8);
      if (VERB) log(`tree layers: ${name} aims at ${rgbText(light)}, puddle ${mixText(conc)}`);
      const s = paintWash(sheet, m, conc, { rMax: rWash, water: WASH_WATER, seed: seedN += 10 }, rnd);
      book('tree layers: first wash', s); layerLog.push({ name, list, want: sum(want), marks: s, before: sum(meanOver(list, on)) });
    }
    settle('1', 'first wash, dried');
  }

  // 2. local colour: the deeper field bands
  baseLayer = 'field bands';
  {
    const m = clean(maskOf(i => M[i] && fam[i] === F.ground && L5[i] < lightGroundL - 18), 1.5 * f);
    const list = listOf(m);
    if (list.length >= 50) {
      const on = onSheet(), want = wantOver(list, on);
      const d = distanceToZero(m, W, H), broad = list.reduce((a, i) => Math.max(a, d[i]), 0) > KIT.flatHalfInch * 1.2;
      let s = 0;
      if (broad) {
        const c0 = tuned(washTrial(KIT.flatHalfInch, WASH_WATER), mixOf(want), want);
        if (c0) s = paintWash(sheet, m, c0.map(v => v * 0.8), { rMax: KIT.flatHalfInch, water: WASH_WATER, seed: seedN += 10 }, rnd);
      } else {
        const R = KIT.round12 * 1.6, rb = KIT.round12 * 0.8, water = 0.8;
        const c0 = tuned(dabTrial(R, rb, water), mixOf(want), want);
        if (c0) { const cl = placeClumps(m, W, H, { rMin: KIT.round12 * 1.2, rMax: KIT.round12 * 2, spill: 1 * f, cover: 0.8 }); for (const c of cl) paintDab(sheet, c.x, c.y, c.R, Math.min(rb, c.R * 0.6), water, c0, rnd, seedN++); s = cl.length; }
      }
      book('tree layers: field bands', s); layerLog.push({ name: 'deeper field bands', list, want: sum(want), marks: s, before: sum(meanOver(list, on)) });
      settle('2', 'field bands, dried');
    }
  }

  // 3 to 6. Per-region shadow techniques, or (--treetechnique 0) tiers dried in between.
  for (const regionId of regionIds) {
  baseLayer = `${regionId}/light olive`;
  const regionalPlan = techniquePlan.find(r => r.region === regionId);
  if (TECHNIQUE && !regionalPlan?.layers.length) continue;
  const trees = maskOf(i => M[i] && (!TECHNIQUE || groups.labels[i] === regionId) && (fam[i] === F.olive || fam[i] === F.cool));
  if (TECHNIQUE) dryAll();
  const treeL = listOf(trees).map(i => L5[i]).sort((a, b) => a - b), q = p => treeL[Math.min(treeL.length - 1, Math.floor(p * treeL.length))];
  const tiers = [
    { name: 'light olive', label: 'light clumps, dried', at: 0.96, rMin: KIT.round12 * 0.8, rMax: KIT.round12 * 1.3, rb: KIT.round12, water: 0.62, open: 2, spill: 0.5, thin: 0.85 },
    { name: 'mid olive', label: 'mid clumps, dried', at: 0.62, rMin: KIT.round8 * 0.8, rMax: KIT.round8 * 1.3, rb: KIT.round8, water: 0.6, open: 1.5, spill: 0, thin: 0.88 },
    { name: 'dark olive', label: 'dark clumps, dried', at: 0.32, rMin: KIT.round4 * 1.1, rMax: KIT.round4 * 1.8, rb: KIT.round4 * 1.2, water: 0.58, open: 1, spill: -0.5 },
    { name: 'darkest', label: 'darkest accents, dried', at: 0.1, rMin: KIT.round4 * 0.7, rMax: KIT.round4 * 1.2, rb: KIT.round4, water: 0.55, open: 1, spill: -0.5 },
  ];
  if (treeL.length >= 50) tiers.forEach((t, k) => { t.thr = q(t.at); t.lo = k + 1 < tiers.length ? q(tiers[k + 1].at) : -1; });
  for (const [k, t] of (treeL.length >= 50 ? tiers : []).entries()) {
    // A blotted, concentrated charge adds pigment without repeatedly flooding the wet wash.
    if (TECHNIQUE && k > 0 && regionalPlan.layers[k].technique === 'wet blend') t.water = 0.30;
    const on = onSheet();
    const m = clean(maskOf(i => trees[i] && L5[i] <= t.thr), (k === 0 ? t.open * f : Math.max(t.open * f, t.rMin * 0.5)));
    const stop = maskOf(i => m[i] && L5[i] > t.lo);
    const clumps = placeClumps(m, W, H, { rMin: t.rMin, rMax: t.rMax, spill: t.spill * f, cover: 0.85 });
    if (!clumps.length) continue;
    // what the painter sees at each clump: the colour of the cells there that stop at this tier (squinted)
    const meanRGB = list => { const m = [0, 0, 0]; for (const i of list) { m[0] += T.R[i]; m[1] += T.G[i]; m[2] += T.B[i]; } return m.map(v => v / Math.max(1, list.length)); };
    for (const c of clumps) {
      const near = [], all = [], r = c.R;
      for (let y = Math.max(0, Math.floor(c.y - r)); y <= Math.min(H - 1, Math.ceil(c.y + r)); y++) for (let x = Math.max(0, Math.floor(c.x - r)); x <= Math.min(W - 1, Math.ceil(c.x + r)); x++) {
        const i = y * W + x; if ((x + 0.5 - c.x) ** 2 + (y + 0.5 - c.y) ** 2 > r * r || !m[i]) continue; all.push(i); if (stop[i]) near.push(i);
      }
      c.cells = near.length >= 4 ? near : all;
      c.see = near.length >= 4 ? meanRGB(near) : null;
    }
    const tierSee = meanRGB(listOf(stop));
    for (const c of clumps) if (!c.see) c.see = tierSee;
    // up to three puddles, the colours seen at the clumps grouped by k-means (a yellower olive, a greyer one, a blue-grey)
    const kP = Math.min(3, Math.max(1, Math.round(clumps.length / 40)));
    const lum3 = c => lumOf(c[0], c[1], c[2]), sorted = clumps.map(c => c.see).sort((a, b) => lum3(a) - lum3(b));
    let cent = Array.from({ length: kP }, (_, j) => sorted[Math.floor(((j + 0.5) / kP) * sorted.length)].slice());
    const lab = new Int32Array(clumps.length);
    for (let it = 0; it < 20; it++) {
      clumps.forEach((c, i) => { let bj = 0, bd = Infinity; cent.forEach((mm, j) => { const d = (c.see[0] - mm[0]) ** 2 + (c.see[1] - mm[1]) ** 2 + 1.5 * (c.see[2] - mm[2]) ** 2; if (d < bd) { bd = d; bj = j; } }); lab[i] = bj; });
      cent = cent.map((mm, j) => { const mine = clumps.filter((_, i) => lab[i] === j); return mine.length ? [0, 1, 2].map(p => mine.reduce((s, c) => s + c.see[p], 0) / mine.length) : mm; });
    }
    const R = (t.rMin + t.rMax) / 2, puddles = [];
    for (let pi = 0; pi < kP; pi++) {
      const mine = clumps.filter((_, i) => lab[i] === pi); if (!mine.length) { puddles.push(null); continue; }
      const inP = new Uint8Array(n); for (const c of mine) for (const i of c.cells) if (stop[i]) inP[i] = 1;
      if (!inP.some(v => v)) for (const c of mine) for (const i of c.cells) inP[i] = 1;
      const cellsP = listOf(inP), want = wantOver(cellsP, on);
      // clumps laid edge to edge overlap and the next tier spills onto this one: the light tiers are mixed thinner
      const trialTechnique = TECHNIQUE && k > 0 ? regionalPlan.layers[k].technique : null;
      const c0 = tuned(patchTrial(t, k === 0, trialTechnique), mixOf(want), want);
      puddles.push(c0 ? c0.map(v => v * (t.thin ?? 1)) : null);
      if (VERB) log(`tree layers: ${t.name} puddle ${pi + 1} for ${mine.length} clumps aims at ${rgbText(cellsP)}, wants ${mixText(want)}, puddle ${mixText(puddles[puddles.length - 1])}`);
      const lst = listOf(maskOf(i => stop[i] && inP[i]));
      layerLog.push({ name: `${t.name} ${pi + 1}`, list: lst, want: sum(wantOver(lst, on)), marks: mine.length, before: sum(meanOver(lst, on)) });
    }
    if (k === 0) {
      // the first tier is a mass: its inside washed with the flat brush in the tier's middle colour, its clumps touched
      // into the wash while wet; the trial above tests the wash and the clumps together
      const inner = erode(m, W, H, t.rMin * 0.9), cellsT = listOf(stop), want = wantOver(cellsT, on);
      const c0 = tuned(patchTrial(t, true), mixOf(want), want);
      if (c0 && listOf(inner).length > 20) { const s = paintWash(sheet, inner, c0.map(v => v * 0.8 * (t.thin ?? 1)), { rMax: KIT.flatHalfInch, water: 0.7, seed: seedN += 10 }, rnd); book('tree layers: light mass wash', s); }
    }
    activeTechnique = TECHNIQUE && k > 0 ? { region: regionId, ...regionalPlan.layers[k] } : null;
    let laid = 0;
    for (const [i, c] of clumps.entries()) { const conc = puddles[lab[i]]; if (!conc) continue; paintDab(sheet, c.x, c.y, c.R, Math.min(t.rb, c.R * 0.6), t.water * (0.85 + 0.3 * rnd()), conc, rnd, seedN++); laid++; }
    book(`tree layers: ${t.name}`, laid);
    activeTechnique = null;
    const keepWet = TECHNIQUE && regionalPlan.layers[k + 1]?.technique === 'wet blend';
    settle(String(3 + k), keepWet ? `${t.name}, kept wet for charging` : t.label, keepWet);
  }
  }
  if (TECHNIQUE) dryAll(); // finish the last wet chain before removing masking fluid
  writeTechnique();

  if (masked) liftResist(sheet);
  setClip(sheet, prevClip);
  if (VERB) {
    const on = onSheet();
    for (const Lg of layerLog) log(`tree layers: ${Lg.name.padEnd(22)} ${String(Lg.marks).padStart(4)} marks, on its stop cells wanted ${Lg.want.toFixed(3)} laid ${(Lg.got ?? 0).toFixed(3)} final ${sum(meanOver(Lg.list, on)).toFixed(3)} of (plan not read while painting) planned, ${((Lg.ms ?? 0) / 1000).toFixed(1)} s`);
  }
  log(`tree layers: ${marks} marks in all`);
}
