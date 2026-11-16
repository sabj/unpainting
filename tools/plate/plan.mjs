// The palette, pigment demand, masks and the order of the layers.
// Stage 2 of 7 of tools/paint-plate.mjs. The stages run in order and share one object, ctx: see the entry file.
import {materialProfile} from '../../src/paint/methods/material-profiles.mjs';
import {resolveStyle} from '../../src/paint/styles/loader.mjs';
import {boundsOf} from '../../src/mask-bounds.mjs';
import {DEFAULT_SHEET_MM} from '../../src/media/sheet-size.mjs';
import {resolveOutlineMedium, describeOutlineMedium} from '../../src/paint/methods/outline-medium.mjs';
import {bindFinishingArea, finishingPaletteKeys} from '../painter/finishing-area.mjs';
import {validateProductionDetails, validateCompiledAreaStop} from '../painter/semantic-production-details.mjs';
import {lowerAuthoredGestures} from '../painter/authored-gestures.mjs';
import {authoredPalette} from '../painter/authored-paint.mjs';
import {validateAreaDocument, rasterAreaPlan, compileAreaLayers, createAreaExecution, sha256} from '../painter/semantic-areas.mjs';
import {earlyDryBoundary} from '../painter/early-dry-boundary.mjs';
import {cachedStep, codeHash} from '../../src/paint/run-cache.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {renderLayers} from '../../src/media/km.mjs';
import {pickPalette, paletteOptions} from '../../src/crop/palettepick.mjs';
import {widePalette, puddleLabels} from '../../src/crop/palettewide.mjs';
import {paintGuardOptions} from '../../src/crop/paint-guard.mjs';
import {channelDensity, unmix} from '../../src/crop/pigments.mjs';
import {blockInPigments, gradeSmoothPassages} from '../../src/crop/blockin.mjs';
import {choosePlateMixes, toMixAmounts, panMix} from '../../src/crop/mixes.mjs';
import {loadSubject} from '../../src/paint/methods/first-wash.mjs';
import {measureLine} from '../../src/paint/methods/pencil-line.mjs';
import {components, dilate, minFilter, maxFilter} from '../../src/raster.js';
import {chooseTechnique} from '../../src/crop/technique.mjs';
import {gaussian} from '../../src/keyframes/density.mjs';
import {setClip as physicalSetClip, stableClipMask} from '../../src/media/sheet.mjs';
import {detailLayers} from '../../src/paint/methods/detail-passes.mjs';
import {styleTarget, massesOf} from '../../src/crop/styletarget.mjs';
import {separate} from '../../src/crop/inkwash.mjs';
import {orientationField} from '../../src/crop/fur.mjs';
import {edgeChains} from '../../src/crop/contours.mjs';
import {finishField} from '../../src/crop/finish.mjs';
import {labPlanes} from '../../src/eval/colour.mjs';
import {smallLights, paperDensity, cellShare, keepLargestLights} from '../../src/crop/lights.mjs';
import {planCurls} from '../../src/crop/curls.mjs';
import {pigmentPhysics} from '../../src/paint/methods/pigment-physics.mjs';
import {planLinework} from '../../src/paint/methods/linework-plan.mjs';
import {inkCapOnScrap} from '../../src/paint/methods/ink-scrap.mjs';
import {inkKFromSource} from '../../src/paint/methods/ink-hue.mjs';
import {sourcePenShare} from '../../src/paint/methods/pen-share.mjs';
import {chooseDrawingStages} from '../../src/paint/methods/drawing-stages-auto.mjs';
import {eraseWeights, eraserDabs, ERASER_MM} from '../../src/paint/methods/pencil-erase.mjs';
import {planLines as planLineChoice} from '../../src/paint/drawing-plan.mjs';
import {massBudget} from '../../src/paint/methods/mass-budget.mjs';
import {planModulation} from '../../src/paint/methods/modulate.mjs';
import {loadFocus} from '../../src/paint/methods/stroke-budget.mjs';
import {measureStyle} from '../../src/paint/methods/practice-style.mjs';

export async function plan(ctx) {
const { JSONL, argv0, argv, PIPELINE, opt, num, DRAWING_STAGE_INTENT, optTrack, SPEED_VALUE_ONLY, SPEED_PROFILE, 
  root, out, INK_RECIPE, DRAWING_REGISTRATION, RUN_CACHE, EARLY_LINES, holdInk, VALUE_CONFIG, VALUE_ENABLED, 
  phaseMark, PX_SOURCE, PX_RAW, TARGET_GUARD, w, h, n, lum, paperRGB, CODE_HASH, 
  PALETTE_FROM_FILE, paletteFitStarted } = ctx;
const PALETTE = (await cachedStep({ ...RUN_CACHE, name: 'palette', code: codeHash(root,[],{dependencies:['src/crop/palettepick.mjs','src/crop/palettewide.mjs','src/crop/paint-guard.mjs','tools/painter/authored-paint.mjs']}), track: optTrack, inputs: { px: ctx.px, w, h, paperRGB, from: PALETTE_FROM_FILE, authored: opt('areaplan','') ? fs.readFileSync(path.resolve(root,opt('areaplan',''))) : null } }, async () => {
  const authoredFile=opt('areaplan','');const explicit=authoredFile?authoredPalette(JSON.parse(fs.readFileSync(path.resolve(root,authoredFile)))):null;if(explicit)return {pigments:explicit,authored:true,monochrome:explicit.length===1,paintChroma:0,note:'explicit authored production palette; no source palette fit'};
  const from = opt('palettefrom', '');
  let source = ctx.px, sw = w, sh_ = h;
  if (from) {
    const f = path.resolve(root, from);
    if (!fs.existsSync(f)) console.log(`palette: ${from} not found, fitting to the photograph`);
    else {
      const { data, info } = await sharp(f).resize(w, h, { fit: 'inside' }).flatten({ background: '#fff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      source = data; sw = info.width; sh_ = info.height;
      console.log(`palette: fitted to ${path.basename(f)}, painting ${path.basename(opt('image', ''))} with those pans`);
    }
  }
  // --palettecells c: fit the palette on the picture resized to at most c pixels. Default 1.6 M.
  const PALETTE_CELLS = num('palettecells', 1600000);
  if (sw * sh_ > PALETTE_CELLS) {
    const f = Math.sqrt(PALETTE_CELLS / (sw * sh_)), rw = Math.max(1, Math.floor(sw * f)), rh = Math.max(1, Math.floor(sh_ * f));
    source = await sharp(Buffer.from(source.buffer, source.byteOffset, source.byteLength), { raw: { width: sw, height: sh_, channels: 3 } }).resize(rw, rh, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer();
    console.log(`palette: fitted on the picture at ${rw}x${rh} (--palettecells ${PALETTE_CELLS})`); sw = rw; sh_ = rh;
  }
  const { palette, note } = pickPalette(source, sw, sh_, paperRGB, paletteOptions(opt, num));
  if (note) console.log(note);
  // --paintguard dE: check a forced box (--paints) against the painter's own pick (src/crop/paint-guard.mjs). Default 0, off.
  // --paintguardmode add|replace (default add); --paintguardmax: most paints after adding (default 8).
  // --paintsextend 0: keep a named --paints box as it is. Default 1: it gains pans only for a large hue cluster it cannot reach.
  // --palettewide 1: box paints chosen to reach the picture's local colours (src/crop/palettewide.mjs)
  if (num('palettewide', 0) > 0) {
    const wide = widePalette(source, sw, sh_, paperRGB, palette, { weight: num('pwweight', 1), gain: num('pwgain', 0.5), min: num('pwmin', 3), max: num('pwmax', 6), K: num('pwcolours', 8), keys: opt('paints', '') ? opt('paints', '').split(',') : null, add: opt('paintsadd', '') ? opt('paintsadd', '').split(',') : null, extend: num('paintsextend', 1) > 0, guard: paintGuardOptions(opt, num) });
    console.log(wide.note);
    return wide.palette;
  }
  return palette;
})).value;
SPEED_PROFILE?.add('setup:palette-fit', performance.now() - paletteFitStarted);
// --pigphys: each pigment given a physics by its hue (src/paint/methods/pigment-physics.mjs)
// Box paints carry their published settling physics (granulation, flocculation, staining, density): pigment-physics.mjs.
const PIGS = (() => {
  const planFile=opt('areaplan','');const direct=planFile?authoredPalette(JSON.parse(fs.readFileSync(path.resolve(root,planFile)))):null;
  if(direct)return pigmentPhysics({pigments:direct,opt,num,log:console.log});
  const existing = pigmentPhysics({ pigments: PALETTE.pigments, opt, num, log: console.log });
  return opt('finishareaplan','')?finishingPaletteKeys(existing):existing;
})();
const COLOUR_BUDGET = num('colourbudget', 0) > 0 && PIGS.length > 1;
console.log(`palette: ${PIGS.length} pigments, ${PALETTE.authored ? 'explicit authored BOX mixtures; source chroma not fitted' : PALETTE.monochrome ? 'one fluid' : `paint chroma ${PALETTE.paintChroma.toFixed(2)}`}`);
PIGS.forEach((p, j) => console.log(`  ${j}: K ${p.K.map(v => v.toFixed(2)).join('/')}${p.name ? ` ${p.name}` : ''}`));
phaseMark('palette');

// --style s: plan from a styled watercolour target (src/crop/styletarget.mjs), not the photograph. 0..1, default 0.
const STYLE = num('style', 0);
ctx.D_SOURCE = TARGET_GUARD.register('D_SOURCE', channelDensity(ctx.px, n, paperRGB));
// --aim file: match the photograph's per-channel density distribution to this artwork's: its tone and colour, the photograph's drawing.
// It subsumes --shorten and most of --groundpaper; stacking them counts the paper twice.
await (async () => {
  const from = opt('aim', '');
  if (!from) return;
  const f = path.resolve(root, from);
  if (!fs.existsSync(f)) { console.log(`aim: ${from} not found`); return; }
  const { data, info } = await sharp(f).resize(Math.min(w, 420), null).flatten({ background: '#fff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const an = info.width * info.height;
  const apaper = [0, 1, 2].map(c => { const v = Float32Array.from({ length: an }, (_, i) => data[i * 3 + c]).sort(); return v[Math.floor(an * 0.99)]; });
  const AD = channelDensity(data, an, apaper);
  // Over the artwork's painted cells only, so its bare margin does not send light content to paper white.
  const painted = [];
  for (let i = 0; i < an; i++) if ((AD[i * 3] + AD[i * 3 + 1] + AD[i * 3 + 2]) / 3 > num('aimfloor', 0.06)) painted.push(i);
  const pool = painted.length > an * 0.05 ? painted : Array.from({ length: an }, (_, i) => i);
  console.log(`aim: ${(100 * pool.length / an).toFixed(0)}% of ${path.basename(f)} is painted, and that is what the photograph is matched to`);
  const mix = Math.max(0, Math.min(1, num('aimmix', 1)));
  // By value, not by rank: a quantile curve gives equal inputs equal outputs and keeps a flat passage flat.
  const STEPS = 256;
  for (let c = 0; c < 3; c++) {
    const want = Float32Array.from(pool.map(i => AD[i * 3 + c])).sort();
    const have = Float32Array.from({ length: n }, (_, i) => ctx.D_SOURCE[i * 3 + c]).sort();
    const curveX = new Float32Array(STEPS + 1), curveY = new Float32Array(STEPS + 1);
    for (let k = 0; k <= STEPS; k++) {
      curveX[k] = have[Math.min(n - 1, Math.round(k / STEPS * (n - 1)))];
      curveY[k] = want[Math.min(want.length - 1, Math.round(k / STEPS * (want.length - 1)))];
    }
    const at = v => {
      let lo = 0, hi = STEPS;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (curveX[mid] < v) lo = mid + 1; else hi = mid; }
      if (lo === 0) return curveY[0];
      const x0 = curveX[lo - 1], x1 = curveX[lo], t = x1 > x0 ? (v - x0) / (x1 - x0) : 0;
      return curveY[lo - 1] + t * (curveY[lo] - curveY[lo - 1]);
    };
    for (let i = 0; i < n; i++) {
      const v = ctx.D_SOURCE[i * 3 + c];
      ctx.D_SOURCE[i * 3 + c] = v + mix * (at(v) - v);
    }
  }
  let d = 0; for (let i = 0; i < n; i++) d = Math.max(d, (ctx.D_SOURCE[i * 3] + ctx.D_SOURCE[i * 3 + 1] + ctx.D_SOURCE[i * 3 + 2]) / 3);
  console.log(`aim: ${path.basename(f)} for tone and colour, the photograph for drawing; darkest now ${d.toFixed(2)}`);
})();
const D_AIM = STYLE > 0
  ? styleTarget(ctx.D_SOURCE, w, h, null, { radius: num('styleradius', 5), range: num('stylerange', 0.12), values: num('stylevalues', 9), paperAt: num('stylepaper', 0.06), deepest: num('styledeepest', 0.7), chroma: num('stylechroma', 1) })
  : ctx.D_SOURCE;
if (STYLE > 0) {
  // mixed back towards the photograph at --style below 1, so the pass can be brought in gradually
  if (STYLE < 1) for (let i = 0; i < n * 3; i++) D_AIM[i] = ctx.D_SOURCE[i] + STYLE * (D_AIM[i] - ctx.D_SOURCE[i]);
  let deep = 0, paper = 0;
  for (let i = 0; i < n; i++) { const m = (D_AIM[i * 3] + D_AIM[i * 3 + 1] + D_AIM[i * 3 + 2]) / 3; if (m > deep) deep = m; if (m <= 0) paper++; }
  console.log(`style target: aiming at a watercolour, not the photograph; darkest ${deep.toFixed(2)}, ${(100 * paper / n).toFixed(1)}% left as paper`);
}
// --planmasses r: plan from big shapes, an edge-preserving mean over r cells at 540 px, scaled with width (massesOf). Plan only.
// --planmassrange: how far apart two values may be and still count as one mass. Not --masses (the mop washes).
const PLAN_MASSES = num('planmasses', 0), PM_R = Math.max(1, Math.round(PLAN_MASSES * w / 540));
// --figurelayers 1: paint the figure mask (--fwmask, required) in a few layers.
// On the mask: plan massed over --figuremassr cells (default 2); optional --figurefollow, --figurecap 6, --figurefloor 0.25.
const FIG_LAYERS = num('figurelayers', 0) > 0;
const FIG_MASK = FIG_LAYERS && opt('fwmask', '') ? Uint8Array.from(await sharp(path.resolve(root, opt('fwmask', ''))).resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer(), v => (v >= 128 ? 1 : 0)) : null;
if (FIG_LAYERS && !FIG_MASK) console.log('figure layers: no --fwmask, the flag does nothing');
let D_PLAN = PLAN_MASSES > 0 ? massesOf(D_AIM, w, h, { radius: PM_R, range: num('planmassrange', 0.12) }) : D_AIM;
if (PLAN_MASSES > 0) console.log(`plan masses: an edge-preserving mean over ${PM_R} cells, range ${num('planmassrange', 0.12)}`);
if (FIG_MASK && PLAN_MASSES <= 0) {
  const r = Math.max(1, Math.round(num('figuremassr', 2) * (280 / 540) / (num('sheetmm', DEFAULT_SHEET_MM) / w)));
  const massed = massesOf(D_AIM, w, h, { radius: r, range: num('figuremassrange', 0.12) });
  D_PLAN = Float32Array.from(D_AIM);
  for (let c = 0; c < n; c++) if (FIG_MASK[c]) { D_PLAN[c * 3] = massed[c * 3]; D_PLAN[c * 3 + 1] = massed[c * 3 + 1]; D_PLAN[c * 3 + 2] = massed[c * 3 + 2]; }
  console.log(`figure layers: the figure's plan is an edge-preserving mean over ${r} cells; its hard-edged passages are dried before they are laid`);
}
// each pixel as amounts of those pigments: this is what a painter mixes, not a grey level
const pigmentFitStarted = performance.now();
ctx.A = (await cachedStep({ ...RUN_CACHE, name:'pigment-fit', code:CODE_HASH, track:optTrack, inputs:{D_PLAN,D_AIM,px: ctx.px,n,PIGS,paperRGB,PLAN_MASSES,COLOUR_BUDGET,SHAPE_REFIT:[num("shaperefit",0),num("refitfamilies",24),num("refitmin",0.0005)]} }, async()=>{
let A = unmix(D_PLAN, n, PIGS.map(p => p.K.map(v => v / 0.55)));
// Under --planmasses the shape refit aims at the simplified plan, not the source, so the speckle stays out.
{
  const Ks = PIGS.map(p => p.K.map(v => v / 0.55)), D0 = (PLAN_MASSES > 0 || D_PLAN !== D_AIM) ? D_PLAN : channelDensity(ctx.px, n, paperRGB);
  const flat = new Uint8ClampedArray(n * 3); for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) flat[i * 3 + c] = paperRGB[c];
  // The plan is the straight unmix; it only sets each shape's amount and mix.
  if (num('refit', 0) > 0) throw new Error('--refit was removed by the anti-cheat rules (render-compare-correct against the target)');
  void D0; void Ks; void flat;
  // --shaperefit R: R rounds of Kubelka-Munk correction per planning shape, not per cell (src/paint/methods/shape-refit.mjs). Planning only.
  if (num('shaperefit', 0) > 0) {
    const { planningShapes, shapeRefit } = await import('../../src/paint/methods/shape-refit.mjs');
    const shapes = planningShapes(D0, w, h, { families: num('refitfamilies', 24), minCells: Math.max(16, Math.round(num('refitmin', 0.0005) * n)) });
    const K = PIGS.length, one = new Uint8ClampedArray(3); for (let c = 0; c < 3; c++) one[c] = paperRGB[c];
    const render = mean => { const R = renderLayers([PIGS.map((_, j) => Float32Array.of(mean[j]))], PIGS, one, 1, 1); return channelDensity(R, 1, paperRGB); };
    const unmix1 = d => unmix(Float32Array.from(d), 1, Ks);
    shapeRefit(A, D0, K, shapes, { render, unmix1, rounds: num('shaperefit', 3), log: console.log });
  }

}
return A;
})).value;
SPEED_PROFILE?.add('setup:pigment-fit', performance.now() - pigmentFitStarted);
// --paperkeep L: book no pigment where the source is within L of the paper's lightness and under --paperchroma (default 8).
// Unmixing does not know paper white is a colour and would lay a weak pan there. Default 0, off.
if (num('paperkeep', 0) > 0) {
  const keep = num('paperkeep', 0), maxC = num('paperchroma', 8), k = PIGS.length;
  const lab = labPlanes(ctx.px, n, paperRGB), pl = 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2];
  let left = 0;
  for (let i = 0; i < n; i++) {
    const lum = 0.2126 * ctx.px[i * 3] + 0.7152 * ctx.px[i * 3 + 1] + 0.0722 * ctx.px[i * 3 + 2];
    if (lum < pl - keep || Math.hypot(lab.a[i], lab.b[i]) > maxC) continue;
    for (let j = 0; j < k; j++) ctx.A[i * k + j] = 0;
    left++;
  }
  console.log(`paper kept: ${left} cells (${(100 * left / n).toFixed(1)}% of the sheet) booked as paper, not paint`);
}

if (opt('accents', '0') !== '0') throw new Error('--accents was removed by the anti-cheat rules (keep-if-closer against the target)');
// --white frisket|gouache|both|none: how small lights are kept. frisket masks them before the washes; gouache touches them in last.
// --smalllights 0|1|frisket|gouache|both: the same choice (1 is frisket); --white wins when given.
// Lights are found on the source at up to --finewidth px (src/crop/lights.mjs); frisket takes a cell at --lightcover of it.
// --lightcells: closing radius in sheet cells (default 4). --lightdepth, --lightwhite, --lightenclose, --lighthold: see src/crop/lights.mjs.
const WHITE = opt('white', '');
if (WHITE && !['frisket', 'gouache', 'both', 'none'].includes(WHITE)) throw new Error(`--white: frisket, gouache, both or none, not ${WHITE}`);
const LIGHT_CELLS = num('lightcells', 4);
const LIGHT_MODE = WHITE ? (WHITE === 'none' ? '0' : WHITE) : opt('smalllights', '0');
if (!['0', '1', 'frisket', 'gouache', 'both'].includes(LIGHT_MODE)) throw new Error(`--smalllights: 0, 1, frisket, gouache or both, not ${LIGHT_MODE}`);
if (WHITE) console.log(`white: ${WHITE}, by choice`);
const FRISKET = ['1', 'frisket', 'both'].includes(LIGHT_MODE), GOUACHE_LIGHTS = ['gouache', 'both'].includes(LIGHT_MODE);
const LIGHT_SHARE = await (async () => {
  if (!FRISKET && !GOUACHE_LIGHTS) return null;
  const big = sharp(path.resolve(root, opt('image'))).flatten({ background: '#ffffff' }).resize({ width: num('finewidth', 1400), withoutEnlargement: true });
  const { data, info } = await big.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const radius = Math.max(1, Math.round(LIGHT_CELLS * info.width / w));
  const { mask: fine } = smallLights(paperDensity(data, info.width * info.height, paperRGB), info.width, info.height, { radius, depth: num('lightdepth', 0.25), white: num('lightwhite', 0.12), ratio: num('lightratio', 0), enclose: num('lightenclose', 6), hold: num('lighthold', 0.5) });
  const share = cellShare(fine, info.width, info.height, w, h);
  let any = 0; for (let i = 0; i < n; i++) if (share[i] > 0) any++;
  console.log(`small lights: found at ${info.width} wide within ${radius} pixels, touching ${any} cells (${(100 * any / n).toFixed(2)}% of the sheet)`);
  return share;
})();
// --lightmin, --lightmax: frisket keeps lights of --lightmin cells or more (default 2), at most --lightmax (default 24), largest first.
const SMALL = (() => {
  if (!FRISKET) return null;
  const raw = Uint8Array.from(LIGHT_SHARE, v => (v >= num('lightcover', 0.15) ? 1 : 0));
  const { mask, kept, dropped } = keepLargestLights(raw, w, h, { min: num('lightmin', 2), max: num('lightmax', 24) });
  console.log(`frisket: ${kept} lights masked, ${dropped} specks dropped`);
  return mask;
})();
if (SMALL) { let c = 0; for (let i = 0; i < n; i++) c += SMALL[i]; console.log(`frisket: ${c} cells (${(100 * c / n).toFixed(2)}% of the sheet) reserved`); }
// --shorten r: carry the plan's deepest note down by ratio r (0..1), the rest along --shortencurve (default 0.75), keeping dark order.
// A painting has a shorter value range than its photograph. Off unless 0 < r < 1.
(() => {
  const keep = num('shorten', 0);
  if (keep <= 0 || keep >= 1) return;
  const k = PIGS.length, tot = new Float32Array(n);
  for (let i = 0; i < n; i++) { let t = 0; for (let j = 0; j < k; j++) t += ctx.A[i * k + j]; tot[i] = t; }
  const sorted = Float32Array.from(tot).sort();
  const deepest = sorted[Math.floor(n * 0.995)], want = deepest * keep;
  // a curve, not a clip: a clip flattens every dark to one tone and loses the edges inside the darks
  for (let i = 0; i < n; i++) {
    if (tot[i] <= 0) continue;
    const f = (want * Math.pow(tot[i] / deepest, num('shortencurve', 0.75))) / tot[i];
    for (let j = 0; j < k; j++) ctx.A[i * k + j] *= f;
  }
  console.log(`range: plan's darkest note ${deepest.toFixed(2)} shortened to ${want.toFixed(2)} (x${keep}), curve ${num('shortencurve', 0.75)}`);
})();
// --whitefloor f: cells whose whole planned depth is under f of one glaze join no mask, so no sweep aims at them. Default 0.5.
// An area plan's lights are the ones it lists (pass.lights); no target-light cell is held out of its passes.
const WHITE_HOLD = (() => {
  if (opt('areaplan', '')) return null;
  const f = num('whitefloor', 0.5);
  if (f <= 0) return null;
  const floor = f * num('glaze', 0.12), k = PIGS.length, held = new Uint8Array(n);
  let c = 0;
  for (let i = 0; i < n; i++) { let t = 0; for (let j = 0; j < k; j++) t += ctx.A[i * k + j]; if (t < floor) { held[i] = 1; c++; } }
  console.log(`whites: ${c} cells (${(100 * c / n).toFixed(1)}% of the sheet) under ${floor.toFixed(3)} held out of every pass`);
  return c ? held : null;
})();
// Plan reserves (VALUE_CONFIG.reserves) are not boxes on the hold: the value planner reserves the target's own light
// inside each box (src/paint/methods/light-reserves.mjs) and HOLD takes its protectedCells after the plan.
ctx.HOLD = WHITE_HOLD; ctx.FUR_HOLD = null;
// --mixes K: mix K plate puddles before loading the brush (src/crop/mixes.mjs); each pass is one puddle at one strength. Default 0.
const NMIX = Math.max(0, Math.round(num('mixes', 0)));
const MIXES = NMIX > 1 && PIGS.length > 1 ? choosePlateMixes(ctx.A, n, PIGS.length, NMIX, { floor: num('mixfloor', 0.1) }) : null;
const MIXED = MIXES ? toMixAmounts(ctx.A, n, PIGS.length, MIXES, { perCell: Math.round(num('mixpercell', 3)), over: num('mixover', 0.12) }) : null;
if (MIXES) {
  console.log(`${MIXES.length} mixed colours on the palette, holding ${(100 * MIXED.kept).toFixed(1)}% of the picture's pigment:`);
  for (const m of MIXES) console.log(`  ${[...m].map((v, j) => (v > 0 ? `${(100 * v).toFixed(0)}% ${PIGS[j].name}` : null)).filter(Boolean).join(' + ')}`);
}
// --modulate: washes scaled down in the highlight and detail areas, the rest kept for dry brush
// (src/paint/methods/modulate.mjs)
const ART_DENSITY = () => { const pl0 = 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2]; return Float32Array.from({ length: n }, (_, i) => Math.max(0, -Math.log(Math.max(0.02, Math.min(1, lum(i) / pl0))))); };
const combinedClipCache=new WeakMap();
let clipBaseSource=null, clipBaseWidth=0, clipBaseHeight=0, clipBase=null;
const setClip=(target,mask,box=null)=>{
  const excluded=target===ctx.sheet?(ctx.VALUE_PLAN?.protectedCells):null;
  if(!excluded)return physicalSetClip(target,box?stableClipMask(mask):mask);
  if(clipBaseSource!==excluded||clipBaseWidth!==target.w||clipBaseHeight!==target.h){
    clipBase=new Uint8Array(target.n);
    for(let y=0;y<target.h;y++){
      const sourceRow=Math.floor(y*h/target.h)*w, targetRow=y*target.w;
      for(let x=0;x<target.w;x++)clipBase[targetRow+x]=excluded[sourceRow+Math.floor(x*w/target.w)]?0:1;
    }
    clipBaseSource=excluded;clipBaseWidth=target.w;clipBaseHeight=target.h;
  }
  if(!mask)return physicalSetClip(target,stableClipMask(clipBase));
  const prior=combinedClipCache.get(mask);
  if(prior?.base===clipBase)return physicalSetClip(target,prior.mask);
  const combined=new Uint8Array(target.n);
  if(box){for(let y=box.y0;y<=box.y1;y++)for(let i=y*target.w+box.x0,e=y*target.w+box.x1;i<=e;i++)combined[i]=clipBase[i]&&mask[i]?1:0;}
  else if(mask instanceof Uint8Array&&mask.byteOffset%4===0&&mask.length>=target.n){
    const words=target.n>>>2,baseWords=new Uint32Array(clipBase.buffer,0,words),maskWords=new Uint32Array(mask.buffer,mask.byteOffset,words),outWords=new Uint32Array(combined.buffer,0,words);
    for(let i=0;i<words;i++){
      const v=maskWords[i];
      if((v&0xfefefefe)===0)outWords[i]=baseWords[i]&v;
      else for(let j=i*4,end=j+4;j<end;j++)combined[j]=clipBase[j]&&mask[j]?1:0;
    }
    for(let i=words*4;i<target.n;i++)combined[i]=clipBase[i]&&mask[i]?1:0;
  }else for(let i=0;i<target.n;i++)combined[i]=clipBase[i]&&mask[i]?1:0;
  // Cache only masks whose owner explicitly supplies a stable bounding box.
  if(box)combinedClipCache.set(mask,{base:clipBase,mask:combined});
  physicalSetClip(target,stableClipMask(combined));
};
const MOD = await planModulation({ A: ctx.A, K: PIGS.length, w, h, n, px: ctx.px, image: opt('image', ''), root, fs, path, sharp, gaussian, num, opt, log: console.log, SRC: ART_DENSITY(), colourBudget: COLOUR_BUDGET });
const MASS_BUDGET = massBudget({ A: ctx.A, MOD, K: PIGS.length, SRC: ART_DENSITY(), rgb: ctx.px, w, h, gaussian, components, num, log: console.log });
// --drawinglogic 3 draws its scribble only on an ink-led piece; the style read is the modulation's when there is one
const DRAW_STYLE = num('drawinglogic', 0) === 3 ? (MOD?.style ?? await measureStyle({ SRC: ART_DENSITY(), w, h, n, px: ctx.px, gaussian, minFilter, maxFilter, log: console.log })) : null;
// the ladder's own amounts: under --modulate, the scaled plan, so its feedback does not charge the thinned washes back up
ctx.AL = TARGET_GUARD.register('AL', MOD ? MOD.Aw : ctx.A);
const COLOUR_TRACE = num('colourtrace', 0) > 0;
async function colourPlan(name, amounts) {
  if (!COLOUR_TRACE) return;
  const flat = new Uint8ClampedArray(n * 3);
  for (let i=0;i<n;i++) for(let c=0;c<3;c++) flat[3*i+c]=paperRGB[c];
  const rgb=renderLayers([PIGS.map((_,j)=>Float32Array.from({length:n},(_,i)=>amounts[i*PIGS.length+j]))],PIGS,flat,n,1);
  await sharp(Buffer.from(rgb), {raw:{width:w,height:h,channels:3}}).png().toFile(path.join(out,`colour-${name}.png`));
}
await colourPlan('unmixed', ctx.A);
await colourPlan('wash-budget', ctx.AL);
const PLANA = MIXED ? MIXED.AM : MOD ? MOD.Aw : ctx.A, PLANK = MIXES ? MIXES.length : PIGS.length;
// --premix 1: charge each passage with every pigment it owes, mixed in the well. Default 0: one pan per pass, colours meet on paper.
// --puddles K: cut each pass's regions by K local colours, each passage charged with its own mix (src/crop/palettewide.mjs). Default 0.
const NPUDDLES = MIXES ? 0 : Math.max(0, Math.round(num('puddles', 0)));
const PUDDLES = NPUDDLES > 1 && PLANK > 1 ? puddleLabels(PLANA, PLANK, w, h, { K: NPUDDLES }) : null;
if (PUDDLES) console.log(`puddles: ${PUDDLES.centres.length} local mixes, each passage charged with its own: ${PUDDLES.centres.map(c => c.map((v, j) => (v >= 0.1 ? `${(100 * v).toFixed(0)}% ${PIGS[j].name ?? j}` : null)).filter(Boolean).join(' + ')).join('; ')}`);
const FIRST_FLOOR = num('firstfloor', 0);
// --firstfloorsubject r: keep the broad first wash on the figure (--fwmask) grown by r cells at 540 px, scaled with width. Default 0.
const FIRST_ONLY = FIRST_FLOOR > 0 && num('firstfloorsubject', 0) > 0 && opt('fwmask', '') ? dilate(await loadSubject({ file: path.resolve(root, opt('fwmask', '')), w, h, sharp, log: () => {} }), w, h, Math.max(1, Math.round(num('firstfloorsubject', 0) * w / 540))) : null;
if (FIRST_ONLY) { let a = 0; for (const v of FIRST_ONLY) a += v ? 1 : 0; console.log(`first floor: kept to the figure grown by ${num('firstfloorsubject', 0)} cells, ${(100 * a / n).toFixed(1)}% of the sheet`); }
// --planfollow given on the command line stays global and unscoped; --figurelayers scopes it.
const PLANFOLLOW = num('planfollow', 0);
const BLOCK_OPTIONS = { glaze: num('glaze', 0.12), maxValues: num('maxvalues', 24), deepQ: num('deepq', 0.55), headroom: num('headroom', 0.5), follow: PLANFOLLOW || (FIG_MASK ? num('figurefollow', 0) : 0), followCap: num('followcap', PLANFOLLOW > 0 ? 3 : FIG_MASK ? num('figurecap', 6) : 3), followFloor: num('followfloor', PLANFOLLOW > 0 ? 0.5 : FIG_MASK ? num('figurefloor', 0.25) : 0.5), followMask: PLANFOLLOW > 0 ? null : FIG_MASK, followMaskShare: num('figureshare', 0.25), quantileIn: num('quantilein', 0.12), maskBlur: num('maskblur', 1), minShape: num('minshape', 0) || null, finest: num('finest', 0.08), floorShape: num('floorshape', 8), washFloor: num('washfloor', 0.6), sampleSupport: MIXES && opt('mixsupport', '1') !== '0', preMix: MIXES ? false : PUDDLES ? true : opt('premix', '0') !== '0', puddles: PUDDLES?.labels ?? null, puddleFloor: PUDDLES ? num('puddlefloor', 0) : 0, reserve: opt('lightplan', '1') !== '0' ? SMALL : null, hold: ctx.HOLD,
  // --firstfloor f: open the ladder with one broad light wash of local colour over cells planned at f or more (src/crop/blockin.mjs).
  // --firstwhite w (default f/2): stays-white threshold; --firstcolours K (default 4): local colours; --firstmax m (default --glaze): deepest.
  ...(FIRST_FLOOR > 0 ? { firstFloor: FIRST_FLOOR, firstMax: opt('firstmax', '') !== '' ? num('firstmax', 0.12) : null, firstWhite: opt('firstwhite', '') !== '' ? num('firstwhite', 0) : null, firstLabels: num('firstcolours', 4) > 1 && PLANK > 1 ? puddleLabels(PLANA, PLANK, w, h, { K: Math.round(num('firstcolours', 4)), floor: FIRST_FLOOR }).labels : null, firstOnly: FIRST_ONLY } : {}) };
const AUTHORED_INPUT=opt('areaplan','')&&JSON.parse(fs.readFileSync(path.resolve(root,opt('areaplan','')))).areas.some(a=>a.passes.some(p=>p.source==='authored'));
const blockPlanStarted = performance.now();
// The target value planner replaces this ladder before execution. Optional
// legacy adapters that consume its demand or geometry keep the original path.
const SKIP_DISCARDED_PLAN=SPEED_VALUE_ONLY&&VALUE_ENABLED&&!MOD&&!MIXES&&!opt('finishareaplan','')&&opt('curls','0')==='0'&&num('bgfirst',0)===0&&num('detailpasses',0)===0&&num('detailtrim',0)===0&&num('figurevalues',0)===0&&num('numericplanledger',0)===0&&num('plandiag',0)===0;
let { layers: blocked, steps$, delivered: PLAN_DELIVERED } = SKIP_DISCARDED_PLAN
 ? {layers:[],steps:1,delivered:new Float32Array(PLANA.length)}
 : (await cachedStep({ ...RUN_CACHE, name:'block-plan',code:CODE_HASH,track:optTrack,inputs:{PLANA,PLANK,w,h,BLOCK_OPTIONS,AUTHORED_INPUT} },async()=>AUTHORED_INPUT?{layers:[],steps:1,delivered:new Float32Array(PLANA.length)}:blockInPigments(PLANA, PLANK, w, h, BLOCK_OPTIONS))).value; ctx.steps = steps$;
SPEED_PROFILE?.add('setup:block-plan', performance.now() - blockPlanStarted);
// --figurevalues N: the figure gets its own ladder of N values; the background keeps its plan. Needs --figurelayers. Default 0.
const clipPlannedRegions = (ls, inside, scope) => {
    for (const l of ls) {
      // One clipped label field per layer, as blockInPigments does: a full-sheet mask per small shape costs gigabytes.
      const ids = new l.ids.constructor(n), boxes = new Map(l.shapes.map(sh => [sh.id, { x0: w, y0: h, x1: -1, y1: -1, area: 0 }]));
      for (let i = 0; i < n; i++) {
        const id = l.ids[i], box = boxes.get(id);
        if (!id || !box || !!scope[i] !== inside) continue;
        ids[i] = id; box.area++;
        const x = i % w, y = Math.floor(i / w);
        box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x);
        box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y);
      }
      l.shapes = l.shapes.filter(sh => {
        const box = boxes.get(sh.id); if (!box.area) return false;
        sh.ids = ids; sh._mask = null; sh.box = box; sh.area = box.area; sh._brushMask = null; return true;
      });
      l.ids = ids; l._mask = null; l.area = l.shapes.reduce((a, sh) => a + sh.area, 0);
    }
  };
const FIG_VALUES = FIG_MASK ? Math.max(0, Math.round(num('figurevalues', 0))) : 0;
if (FIG_VALUES > 0) {
  const figureA = Float32Array.from(PLANA, (v, i) => FIG_MASK[Math.floor(i / PLANK)] ? v : 0);
  const figureHold = Uint8Array.from(FIG_MASK, (v, i) => !v || (ctx.HOLD && ctx.HOLD[i]) ? 1 : 0);
  const fp = blockInPigments(figureA, PLANK, w, h, { ...BLOCK_OPTIONS, maxValues: FIG_VALUES, hold: figureHold, firstOnly: FIG_MASK });
  clipPlannedRegions(blocked, false, FIG_MASK); clipPlannedRegions(fp.layers, true, FIG_MASK);
  // --figuremerge 1: disconnected shapes at one value of one pan share a loaded brush; the graded field keeps local demand.
  if (num('figuremerge', 0) > 0) for (const l of fp.layers) {
    const group = l.shapes;
    if (group.length < 2 || !group.every(sh => sh._follow && sh.graded === group[0].graded)) continue;
    const m = new Uint8Array(n), box = { x0: w, y0: h, x1: -1, y1: -1 };
    let area = 0, charge = 0;
    for (let i = 0; i < n; i++) if (l.ids[i]) {
      m[i] = 1; area++; charge += group[0].graded[i];
      const x = i % w, y = Math.floor(i / w);
      box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x);
      box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y);
    }
    const sh = group[0], amount = charge / Math.max(1, area);
    sh.mix = sh.mix.map(v => v * amount / Math.max(1e-9, sh.amount));
    sh.amount = amount; sh.mask = m; sh.ids = m; sh.id = 1; sh.box = box; sh.area = area; sh._brushMask = null;
    l.shapes = [sh]; l.ids = m; l._mask = null; l.amount = amount; l.mix = sh.mix.slice(); l.area = area;
  }
  for (const l of fp.layers) {
    // All downstream handling uses the original ladder's light-to-dark fraction.
    l.value = 1 + Math.round((l.value - 1) * (ctx.steps - 1) / Math.max(1, fp.steps - 1));
    blocked.push(l);
  }
  blocked.sort((a, b) => a.value - b.value);
  for (let i = 0; i < n; i++) if (FIG_MASK[i]) for (let k = 0; k < PLANK; k++) PLAN_DELIVERED[i * PLANK + k] = fp.delivered[i * PLANK + k];
  console.log(`figure values: ${fp.steps} value layers, ${fp.layers.reduce((a,l)=>a+l.shapes.length,0)} shapes`);
}
// Back into pan space. A pass planned in mix space is one puddle, so its charge is that puddle's recipe at the pass's
// own strength; `pigment` stays the puddle's leading pan so the per-pan reports, the drying rule and the trace still
// name something real.
if (MIXES) for (const layer of blocked) {
  const m = layer.pigment, mix = MIXES[m];
  let lead = 0;
  for (let j = 1; j < PIGS.length; j++) if (mix[j] > mix[lead]) lead = j;
  layer.mixIndex = m; layer.mixv = mix; layer.pigment = lead;
  layer.mix = panMix(mix, PIGS.length, layer.amount);
  for (const sh of layer.shapes) sh.mix = panMix(mix, PIGS.length, sh.amount);
}
if(SKIP_DISCARDED_PLAN)console.log('setup: skipped legacy ladder replaced by the executable target value plan');
else console.log(`${blocked.length} glazes over ${ctx.steps} values, each one region of one mixed colour`);
// What share of the sheet the plan touches at all: a plan that covers everything cannot leave paper.
if(!SKIP_DISCARDED_PLAN)(() => {
  const touched = new Uint8Array(n);
  for (const L of blocked) for (const sh of L.shapes) { const m = sh.mask; if (m) for (let i = 0; i < n; i++) if (m[i]) touched[i] = 1; }
  let c = 0;
  for (let i = 0; i < n; i++) if (touched[i]) c++;
  console.log(`plan covers ${(100 * c / n).toFixed(1)}% of the sheet, leaving ${(100 - 100 * c / n).toFixed(1)}% as paper (the artworks leave 71%)`);
  // --plandiag 1 (log only): how many cells wanting paint (0.02+) no passage covers, and how many sit under every first rung
  if (num('plandiag', 0) > 0) {
    const K = PLANK, peaks = [];
    for (let j = 0; j < K; j++) { const v = []; for (let i = 0; i < n; i++) if (PLANA[i * K + j] > 1e-4) v.push(PLANA[i * K + j]); v.sort((a, b) => a - b); peaks.push(v.length ? v[Math.floor(v.length * 0.97)] : 0); }
    const g = num('glaze', 0.12), wf = num('washfloor', 0.6), lv = peaks.map(p => p / (ctx.steps + 0.4));
    let want = 0, unc = 0, under = 0, held = 0; const tots = [];
    for (let i = 0; i < n; i++) {
      let t = 0; for (let j = 0; j < K; j++) t += PLANA[i * K + j];
      if (t < 0.02) continue; want++;
      if (touched[i]) continue; unc++; tots.push(t);
      if (ctx.HOLD && ctx.HOLD[i]) { held++; continue; }
      let ok = false; for (let j = 0; j < K; j++) { const a = PLANA[i * K + j]; if (a >= lv[j] * 0.5 && a >= Math.min(lv[j], g * wf)) ok = true; }
      if (!ok) under++;
    }
    tots.sort((a, b) => a - b);
    console.log(`plan diag: ${(100 * want / n).toFixed(1)}% of the sheet wants paint (0.02+); ${(100 * unc / Math.max(1, want)).toFixed(1)}% of that no passage covers (median planned ${(tots[tots.length >> 1] ?? 0).toFixed(3)}); of those ${(100 * held / Math.max(1, unc)).toFixed(1)}% held out, ${(100 * under / Math.max(1, unc)).toFixed(1)}% under every pan's first rung, the rest cut by the masks' opening and size floor; first rungs ${lv.map(v => v.toFixed(3)).join(' ')} over ${ctx.steps} values`);
  }
})();

// Whites are kept by masking, not by painting round them: a wash flows over the mask and leaves it clean.
const pl = 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2];
ctx.SRC = TARGET_GUARD.register('SRC', new Float32Array(n));
for (let i = 0; i < n; i++) ctx.SRC[i] = Math.max(0, -Math.log(Math.max(0.02, Math.min(1, lum(i) / pl))));
const peakD = [...ctx.SRC].sort((a, b) => b - a)[Math.floor(n * 0.03)] || 1;

// The technique is decided on the source at its own resolution: a downsized sheet has its dry-brush texture averaged away.
const FINE = await (async () => {
  const big = sharp(path.resolve(root, opt('image'))).flatten({ background: '#ffffff' }).resize({ width: num('finewidth', 1400), withoutEnlargement: true });
  const { data, info } = await big.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const fw = info.width, fh = info.height, fn = fw * fh;
  const flum = i => 0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2];
  const fl = [...Array(fn).keys()].sort((a, b) => flum(b) - flum(a)).slice(0, Math.max(1, fn / 10 | 0));
  const fp = fl.reduce((s2, i) => s2 + flum(i), 0) / fl.length;
  const D = new Float32Array(fn);
  for (let i = 0; i < fn; i++) D[i] = Math.max(0, -Math.log(Math.max(0.02, Math.min(1, flum(i) / fp))));
  return { D, w: fw, h: fh, scale: fw / w };
})();
// What the source's fine structure adds above its local tone: grain a glaze cannot carry but a later dry brush can.
// --edgeclear e: share of width and height at each edge read as structureless, so a scan's mount is not grain. Default 0.
const EDGE = (() => { const e = num('edgeclear', 0), ex = Math.round(e * w), ey = Math.round(e * h); return i => { const x = i % w, y = (i / w) | 0; return x < ex || y < ey || x >= w - ex || y >= h - ey; }; })();
const HP = (() => { const b = gaussian(ctx.SRC, w, h, num('texsigma', 1.6)); return Float32Array.from(ctx.SRC, (v, i) => (EDGE(i) ? 0 : Math.max(0, v - b[i]))); })();
// The part of the fine grid a passage's cells can map to (with a margin): everything outside it is empty, so what walks the
// passage's mask there can stay inside, in the same order, and give the same numbers.
const maskWindow = (mask, F, box = null) => {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = box?.y0 ?? 0; y <= (box?.y1 ?? h-1); y++) { const r = y * w; for (let x = box?.x0 ?? 0; x <= (box?.x1 ?? w-1); x++) if (mask[r + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  if (x1 < 0) return { x0: 0, y0: 0, x1: -1, y1: -1 };
  return { x0: Math.max(0, Math.floor(x0 * F.scale) - 2), y0: Math.max(0, Math.floor(y0 * F.scale) - 2), x1: Math.min(F.w - 1, Math.ceil((x1 + 1) * F.scale) + 2), y1: Math.min(F.h - 1, Math.ceil((y1 + 1) * F.scale) + 2) };
};
// The rows and columns a passage's cells lie in, found once: the loops that walk its mask walk only these, in the same order
// (a cell outside the box is not in the mask, so it is skipped either way). Empty mask: y1 < y0.
const maskBox = (M) => {
  if (process.env.NOBOX) return { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  return boundsOf(M, w, h);
};
const FULLBOX = { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
const upTo = (mask, F, win = null) => {
  const m = new Uint8Array(F.w * F.h);
  for (let y = win ? win.y0 : 0, yb = win ? win.y1 : F.h - 1; y <= yb; y++) for (let x = win ? win.x0 : 0, xb = win ? win.x1 : F.w - 1; x <= xb; x++) {
    const sx = Math.min(w - 1, Math.floor(x / F.scale)), sy = Math.min(h - 1, Math.floor(y / F.scale));
    m[y * F.w + x] = mask[sy * w + sx];
  }
  return m;
};
// what each passage asks for, read off the source once: how wet, into wet paper or dry, dragged or laid
// --wetedge: share of a passage's edge that must fade in the source for it to go in wet on wet. Default 0.5.
// keyed on the passage, and weakly, so a pass that is finished with can let everything it held go
// --drypieces: bare-paper pieces per 1000 cells a dragged passage needs. 30, not the library default 9: a pale
// passage over photographic grain (a flat sky) has many tiny bare specks and was dry-brushed into a speckled field.
const DRY_PIECES = 30;
const TECHNIQUE = new WeakMap();
// Source-inferred techniques before runtime and semantic overrides; execution uses used[T.name] below.
// Counted per passage and by area, since one big wet-in-wet passage and forty small dry-brush ones differ.
const TECHNIQUE_USE = new Map();
const techniqueOf = sh => {
  if (!TECHNIQUE.has(sh)) {
    const win = maskWindow(sh.mask, FINE, sh.box ?? sh._mbox);
    const T = chooseTechnique(FINE.D, upTo(sh.mask, FINE, win), FINE.w, FINE.h, { win, peak: peakD, wetEdge: num('wetedge', 0.5), dryTooth: num('drytooth', 0.06), dryPieces: num('drypieces', DRY_PIECES) });
    TECHNIQUE.set(sh, T);
    const u = TECHNIQUE_USE.get(T.name) ?? { n: 0, area: 0 };
    u.n++; u.area += sh.area ?? 0;
    TECHNIQUE_USE.set(T.name, u);
  }
  return TECHNIQUE.get(sh);
};
const reportTechniques = () => {
  if (!TECHNIQUE_USE.size) return;
  const rows = [...TECHNIQUE_USE.entries()].sort((a, b) => b[1].area - a[1].area);
  const passages = rows.reduce((a, [, u]) => a + u.n, 0), area = rows.reduce((a, [, u]) => a + u.area, 0) || 1;
  console.log(`source technique inference (before execution overrides): ${passages} passages, by share of planned area`);
  for (const [name, u] of rows) console.log(`  ${name.padEnd(18)}${String(u.n).padStart(5)} passages${(100 * u.area / area).toFixed(1).padStart(7)}% of area`);
};
// --gradedwash 0|1: lay a smooth gradient as one graded wash, not a staircase of flat values that dry with rims. Default 1.
// Soft passages fold into their pigment's host (gradeSmoothPassages), see --gradedchunk, --gradedshare, --gradedprewet.
// --gradedsmooth s: fold only where the source's mean departure from its 1.6-cell blur is under s. Default 0.008.
const SMOOTH = (() => {
  if (opt('gradedwash', '1') === '0') return null;
  const B = gaussian(ctx.SRC, w, h, 1.6), cache = new WeakMap();
  return sh => {
    if (!cache.has(sh)) {
      let a = 0, c = 0;
      // over the passage's own box where it is held as one, which reads the same cells in the same order
      const b = sh.box, f = sh.ids;
      if (b && f) { const q = sh.id; for (let y = b.y0; y <= b.y1; y++) { const r = y * w; for (let x = b.x0; x <= b.x1; x++) if (f[r + x] === q) { a += Math.abs(ctx.SRC[r + x] - B[r + x]); c++; } } }
      else { const m = sh.mask; for (let i = 0; i < n; i++) if (m[i]) { a += Math.abs(ctx.SRC[i] - B[i]); c++; } }
      cache.set(sh, c ? a / c : 1);
    }
    return cache.get(sh) < num('gradedsmooth', 0.008);
  };
})();
const VALUE_ORDER = SMOOTH
  ? gradeSmoothPassages(blocked, ctx.A, PIGS.length, w, h, { soft: sh => SMOOTH(sh) && techniqueOf(sh).name === 'wet on wet', host: SMOOTH, blur: gaussian, contain: num('gradedcontain', 0.9) })
  : blocked;
// --layerorder colour: one colour at a time, lightest colour first, light to dark within each. Default colour; other values order by value.
const ORDERED = opt('layerorder', 'colour') === 'colour'
  ? (() => {
      const weight = j => PIGS[j].K[0] + PIGS[j].K[1] + PIGS[j].K[2];
      // under --mixes a colour is a puddle, not a pan: order by the puddle's own weight so the palest mix goes down
      // first and the sheet builds one colour at a time, as washes do
      const keyOf = l => l.mixIndex ?? l.pigment;
      const wOf = l => (l.mixv ? l.mixv.reduce((s, v, j) => s + v * weight(j), 0) : weight(l.pigment));
      const wt = new Map(); for (const l of VALUE_ORDER) if (!wt.has(keyOf(l))) wt.set(keyOf(l), wOf(l));
      const order = [...wt.keys()].sort((a, b) => wt.get(a) - wt.get(b));
      return VALUE_ORDER.slice().sort((a, b) => order.indexOf(keyOf(a)) - order.indexOf(keyOf(b)) || a.value - b.value);
    })()
  : VALUE_ORDER;
if (ORDERED !== blocked) {
  const folded = blocked.reduce((a, L) => a + L.shapes.length, 0) - ORDERED.reduce((a, L) => a + L.shapes.length, 0);
  const graded = ORDERED.reduce((a, L) => a + L.shapes.filter(sh => sh.graded).length, 0);
  console.log(`graded washes: ${folded} soft passages folded into ${graded}, ${ORDERED.length} glazes left`);
}
// --curls 1: ringlet fur (src/crop/curls.mjs): glazes stop at the lit curl tops, the rest of the dark is laid later (layCurls).
// --curlbox x0,y0,x1,y1 (sheet fractions) limits it; --curlshare fixes the glazes' share of the dark (default read from the lights).
const CURLS = opt('curls', '0') !== '0'
  ? planCurls(ctx.px, w, h, ORDERED, ctx.SRC, PIGS, gaussian, { box: opt('curlbox', '') ? opt('curlbox').split(',').map(Number) : null, share: opt('curlshare', '') === '' ? null : num('curlshare', 0.4), shareMin: num('curlsharemin', 0.5), shareMax: num('curlsharemax', 0.75), split: num('curlsplit', 0) > 0 })
  : null;
if (CURLS) console.log(`curls: ${(100 * CURLS.area / n).toFixed(1)}% of the sheet, curl radius ${CURLS.radius.toFixed(1)} cells, glazes carry ${(100 * CURLS.share).toFixed(0)}% of its dark, ${CURLS.parts.filter(p => p.curly).length} of ${CURLS.parts.length} dark regions curly`);
// --detailpasses: small late passages where the detail is (src/paint/methods/detail-passes.mjs)
const { layers: DETAIL_LAYERS, region: DETAIL_REGION } = MIXES ? { layers: [], region: null } : await detailLayers({ A: ctx.A, K: PIGS.length, delivered: PLAN_DELIVERED, SRC: ctx.SRC, w, h, n, steps: ctx.steps, image: opt('image', ''), root, path, fs, sharp, gaussian, num, log: console.log });
ctx.layers = DETAIL_LAYERS.length ? [...(CURLS ? CURLS.layers : ORDERED), ...DETAIL_LAYERS] : CURLS ? CURLS.layers : ORDERED;

// The way the source's hair and grain lie, for --fur: read once, when a fur pass first asks for it.
// --finish f: how far each part of the sheet is carried (src/crop/finish.mjs); f is the background's finish. Default 0, off.
// --mask: the subject from u2net (tools/seg/segment.py, work/masks), used as the finish field directly.
// --vignette inset: a ragged wash edge; ground is carried inside it and paper left outside. The subject is never faded.
const vignetteField = () => {
  const inset = num('vignette', 0);
  if (inset <= 0) return null;
  const soft = Math.max(1e-3, num('vigsoft', 0.6)) * inset, ragged = num('vigragged', 0.35) * inset;
  const V = new Float32Array(n);
  // A wash edge wanders at every scale: four octaves, each half the amplitude of the last, wander like a brush running out.
  const wave = (t, k) => {
    let v = 0, amp = 1, f = k, norm = 0;
    for (let o = 0; o < 4; o++) { v += amp * Math.sin(t * f * 6.283 + o * 1.7); norm += amp; amp *= 0.5; f *= 2.3; }
    return v / norm;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = Math.min(x, w - 1 - x) / w, dy = Math.min(y, h - 1 - y) / h;
    const d = Math.min(dx, dy) + ragged * (dx < dy ? wave(y / h, num('vigwander', 5)) : wave(x / w, num('vigwander', 5)));
    const t = (d - (inset - soft)) / Math.max(1e-6, soft);
    V[y * w + x] = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  }
  let inSheet = 0;
  for (let i = 0; i < n; i++) inSheet += V[i];
  console.log(`vignette: inset ${inset}, ${(100 * inSheet / n).toFixed(1)}% of the sheet inside the wash edge`);
  return V;
};
const VIGNETTE = vignetteField();

// Where the subject is, kept apart from how far paint is carried: the ground may be carried yet is no place for ink.
ctx.SUBJECT = null;
const MASK_FINISH = await (async () => {
  const name = opt('mask', '');
  // --vigpaper t: with no mask, cells where the vignette is under t get finish -1, so no pass reaches them. Default 0.
  if (!name) return VIGNETTE ? (() => { const F = new Float32Array(n); const g = num('maskground', 1), vp = num('vigpaper', 0); for (let i = 0; i < n; i++) F[i] = vp > 0 && VIGNETTE[i] < vp ? -1 : g * VIGNETTE[i]; return F; })() : null;
  const file = path.resolve(root, name.includes('/') ? name : `work/masks/${name}.png`);
  if (!fs.existsSync(file)) { console.log(`mask: ${path.relative(root, file)} not found, falling back to --finish`); return null; }
  const { data, info } = await sharp(file).resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  // the mask is the subject at 1 and the ground at 0; the finish field wants how far each cell is carried, so the
  // ground keeps --maskground of the run and the subject is finished
  const ground = num('maskground', 0), soft = Math.max(1, Math.round(num('masksoft', 0.01) * Math.min(w, h)));
  const m = gaussian(Float32Array.from({ length: info.width * info.height }, (_, i) => data[i] / 255), w, h, soft);
  const F = new Float32Array(n);
  let subj = 0;
  // the vignette fades the ground, never the subject
  ctx.SUBJECT = m;
  for (let i = 0; i < n; i++) { F[i] = Math.max(m[i], ground * (VIGNETTE ? VIGNETTE[i] : 1)); if (m[i] > 0.5) subj++; }
  // --groundpaper g: share of the ground set below finish 0, so no pass reaches it, in patches, not speckle. Default 0.
  // A low finish is not paper: clipToFinish still lets it take every early wash.
  const gp = num('groundpaper', 0);
  if (gp > 0) {
    const scale = Math.max(2, Math.round(num('groundpaperscale', 0.04) * Math.min(w, h)));
    let seed = 20260919;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const noise = gaussian(Float32Array.from({ length: n }, () => rnd()), w, h, scale);
    // --groundpapertone t: weights the noise so a ground cell is likelier left as paper the lighter its plan. Default 0.
    const tone = num('groundpapertone', 0);
    const field = new Float32Array(n);
    if (tone > 0) {
      const k = PIGS.length, dep = new Float32Array(n);
      for (let i = 0; i < n; i++) { let t = 0; for (let j = 0; j < k; j++) t += ctx.A[i * k + j]; dep[i] = t; }
      const ds = Float32Array.from(dep).sort(), top = Math.max(1e-6, ds[Math.floor(n * 0.95)]);
      for (let i = 0; i < n; i++) field[i] = noise[i] + tone * Math.min(1, dep[i] / top);
    } else field.set(noise);
    // threshold among GROUND cells only, so the share is of the ground and not of the sheet
    const vals = [];
    for (let i = 0; i < n; i++) if (m[i] <= 0.5) vals.push(field[i]);
    vals.sort((a, b) => a - b);
    const cut = vals[Math.floor(vals.length * Math.min(0.95, gp))] ?? -1;
    // Soft, not binary: the reservation falls off over --groundpapersoft (default 0.35) of the field's spread, so patches are not cut-outs.
    const soft = Math.max(1e-6, num('groundpapersoft', 0.35));
    const lo = vals[Math.floor(vals.length * Math.max(0, Math.min(0.95, gp) - soft * Math.min(0.95, gp)))] ?? cut;
    let left = 0;
    for (let i = 0; i < n; i++) {
      if (m[i] > 0.5 || field[i] > cut) continue;
      const t = cut > lo ? (field[i] - lo) / (cut - lo) : 0;
      const keep = Math.max(0, Math.min(1, t));
      // fully reserved at the core of a patch, carried a little at its edge
      F[i] = keep <= 0.02 ? -1 : keep * F[i];
      if (keep <= 0.02) left++;
    }
    console.log(`ground paper: ${(100 * left / n).toFixed(1)}% of the sheet reserved, in patches about ${scale} cells across`);
  }
  console.log(`mask: ${path.basename(file)} as the finish field, subject ${(100 * subj / n).toFixed(1)}% of the sheet, ground carried to ${ground}`);
  return F;
})();
// --vigfinish 1: with --vignette and no --mask, the --finish field also cuts the vignette's. Default 0.
const VIGFINISH = MASK_FINISH && !opt('mask', '') && num('vigfinish', 0) > 0;
const FINISH_FIELD = (!MASK_FINISH || VIGFINISH) && num('finish', 0) > 0
  ? await (async () => {
      const { labPlanes } = await import('../../src/eval/colour.mjs');
      const blurred = new Uint8ClampedArray(n * 3);
      for (let c = 0; c < 3; c++) { const Bc = gaussian(Float32Array.from({ length: n }, (_, i) => ctx.px[i * 3 + c]), w, h, 3); for (let i = 0; i < n; i++) blurred[i * 3 + c] = Bc[i]; }
      return finishField(ctx.SRC, w, h, gaussian, { background: num('finish', 0), subject: num('finishsubject', 0.35), centre: num('finishcentre', 0.35), lab: labPlanes(blurred, n, paperRGB) });
    })()
  : null;
const FINISH = VIGFINISH && FINISH_FIELD ? Float32Array.from(MASK_FINISH, (v, i) => (v < 0 ? v : Math.min(v, FINISH_FIELD[i]))) : (MASK_FINISH ?? FINISH_FIELD);
if (VIGFINISH && FINISH_FIELD) console.log(`vignette finish: cut by the finish field (background ${num('finish', 0)})`);
let FUR_CACHE = null;
const FUR_FIELD = () => (FUR_CACHE ??= orientationField(ctx.SRC, w, h, gaussian, { sigma: num('fursigma', 2) }));

// The separator's reading of the source: which cells are pen line, which are wash. Read once; the ink's colour, the
// line budget and the gate on the pen all use it.
const SEP = (await cachedStep({...RUN_CACHE,name:'separator',code:codeHash(root,[],{dependencies:['src/crop/inkwash.mjs']}),track:optTrack,inputs:{PX_SOURCE,w,h,paperRGB}},async()=>separate(PX_SOURCE,w,h,paperRGB))).value;
// the pen-and-wash ink recipe is for pen drawings; on a brush or photo source it adds pen lines the source lacks
if (INK_RECIPE.recipe === 'wash' && opt('drawing','first') !== 'none' && 100 * SEP.stats.ink / n < num('penfirst', 0.10)) console.log(`!!! --inkrecipe wash: the target shows ${(100 * SEP.stats.ink / n).toFixed(2)}% pen line, under --penfirst ${num('penfirst', 0.10)}%; the recipe is meant for pen drawings and pen-and-wash, and will draw pen lines this source may not have`);
// The pen-line share every pen or pencil choice below reads (outline medium, drawing stages, line source): one
// reading at 1200 px wide (pen-share.mjs), so --width does not change what is pen. SEP is at the run's grid.
// A run with a graphite outline, no line source and no ink plan never asks, so it skips the extra reading.
const PEN_ASKED = opt('outlinemedium', 'graphite') !== 'graphite' || opt('linesource', 'none') !== 'none' || Number(opt('penwash', 0)) > 0 || PIPELINE?.drawing?.medium === 'ink';
const PEN_SHARE = PEN_ASKED && fs.existsSync(path.resolve(root, opt('image', ''))) ? await sourcePenShare({ image: path.resolve(root, opt('image', '')), sharp }) : SEP.stats.ink / n;
// Removing ink from the wash target must not erase the evidence used to select finish ink.
const DRAW_DENSITY = PX_RAW === PX_SOURCE ? ctx.SRC : TARGET_GUARD.register('drawing-density', Float32Array.from({length:n},(_,i)=>Math.max(0,-Math.log(Math.max(.02,Math.min(1,(.2126*PX_SOURCE[3*i]+.7152*PX_SOURCE[3*i+1]+.0722*PX_SOURCE[3*i+2])/pl))))));
// The plan's line set and its linked stages (src/paint/methods/linework-plan.mjs): --linesource picks where the lines
// come from, --stages cuts prep (pencil), prep ink and finish ink from that one set. Planning only, before the seal.
// --outlinemedium auto|ink|graphite|<profile>: preparatory drawing medium. graphite (default): the drawing is pencil
// unless ink is asked for (--outlinemedium ink or a plan's medium); ink is being reworked. auto is ink when the source
// shows --penfirst per cent of line or more, else graphite.
const OUTLINE_REQUESTED = opt('outlinemedium', 'graphite');
const OUTLINE = resolveOutlineMedium({ requested: ['auto', 'ink', 'graphite'].includes(OUTLINE_REQUESTED) ? OUTLINE_REQUESTED : (OUTLINE_REQUESTED === 'none' ? 'graphite' : materialProfile(OUTLINE_REQUESTED).kind), share: PEN_SHARE, threshold: num('penfirst', 0.10) });
console.log(describeOutlineMedium(OUTLINE));
// the plan states its medium with a reason (plan drawing.reason); the subject's medium may still override it (subject-medium.mjs)
{ const d = VALUE_CONFIG?.drawing ?? PIPELINE?.drawing; if (d?.reason != null) { if (typeof d.reason !== 'string' || !d.reason.trim()) throw new Error('drawing.reason: a sentence saying why the medium'); console.log(`the plan's medium: ${d.medium ?? 'not named'}, because ${d.reason.trim()}`); } }
DRAWING_STAGE_INTENT.planMedium ??= PIPELINE?.drawing?.medium ?? OUTLINE.medium;
// the drawing's stages for this image: planner model, rule and gate (drawing-stages-auto.mjs); the prep pencil's erase
// weights are made now, before the target is sealed (pencil-erase.mjs)
const DRAWING_CHOICE = await chooseDrawingStages({ opt, argv, image: path.resolve(root, opt('image','')), root, out, rgb: PX_SOURCE, w, h, penLine: PEN_SHARE, log: console.log, intent: DRAWING_STAGE_INTENT });
// planned as kneaded-eraser dabs, so painting lays a plan and reads no map made from the target
const PREP_ERASE = num('preperase', 0.85) > 0 ? eraserDabs(eraseWeights(PX_SOURCE, w, h), w, h, { tile: ERASER_MM / (num('sheetmm', DEFAULT_SHEET_MM) / w) }) : null;
const LINEWORK = await planLinework({ drawingOverride: argv0.includes('--drawing') ? argv0[argv0.lastIndexOf('--drawing')+1] : null, opt, num, argv, out, root, inkShare: PEN_SHARE, density: { D: DRAW_DENSITY, w, h }, grid: { w, h }, rgb: PX_SOURCE, log: console.log,
  edges: () => edgeChains(ctx.SRC, w, h, gaussian, { sigma: 1.5, minLength: 20, margin: num('silmargin', 0.04), step: 2, high: num('edgehigh', 0.85) }),
  planLines: (ls, image) => { const skip = new Set(opt('drawingskip', '').split(',').map(r => r.trim()).filter(Boolean)); const scaled = ls.filter(g => !skip.has(g.role)).map(g => ({ ...g, length: g.length ?? g.points.reduce((a, q, k) => (k ? a + Math.hypot(q[0] - g.points[k - 1][0], q[1] - g.points[k - 1][1]) : 0), 0) })); return planLineChoice(scaled, num); } });
// Linked stages write new opening and closing files after the hold above; hold those too, so the ink flags reach the
// pens on a staged run as they do on a run with a prepared line file.
if (LINEWORK.files?.prepInk || LINEWORK.files?.finishInk) ctx.INK_LINES = (await holdInk()) ?? ctx.INK_LINES;
if (EARLY_LINES) Object.assign(LINEWORK, {source:EARLY_LINES.source, extractor:EARLY_LINES.extractor, python:EARLY_LINES.python});
if (DRAWING_REGISTRATION) LINEWORK.registration = DRAWING_REGISTRATION;
if (DRAWING_CHOICE) LINEWORK.drawingChoice = DRAWING_CHOICE;
if (ctx.LINEWORK_STAGE) Object.assign(LINEWORK, {source:`universal ${ctx.LINEWORK_STAGE.source}`, universal:{gate:ctx.LINEWORK_STAGE.gate, features:ctx.LINEWORK_STAGE.features, lines:ctx.LINEWORK_STAGE.lines}});
fs.writeFileSync(path.join(out, 'linework.json'), JSON.stringify(LINEWORK, null, 2));
const STAGE_PLAN = LINEWORK.stages ? LINEWORK : null;
// --penfacelong e: face rule and face-detail walks read only line-shaped ink marks (longest side squared over area >= e). Default 0.
// --penfacelongmin: shortest such mark, in cells at 540 px (default 6).
let FACE_INK_CACHE = null;
const FACE_INK = () => FACE_INK_CACHE ??= (num('penfacelong', 0) > 0 ? (() => {
  const { labels, areas, count } = components(SEP.ink, w, h);
  const bx0 = new Int32Array(count + 1).fill(w), by0 = new Int32Array(count + 1).fill(h), bx1 = new Int32Array(count + 1).fill(-1), by1 = new Int32Array(count + 1).fill(-1);
  for (let i = 0; i < n; i++) { const id = labels[i]; if (!id) continue; const x = i % w, y = (i - x) / w; if (x < bx0[id]) bx0[id] = x; if (x > bx1[id]) bx1[id] = x; if (y < by0[id]) by0[id] = y; if (y > by1[id]) by1[id] = y; }
  const e = num('penfacelong', 0), minLen = num('penfacelongmin', 6) * w / 540, keep = new Uint8Array(count + 1);
  let kept = 0;
  for (let id = 1; id <= count; id++) { const L = Math.max(bx1[id] - bx0[id], by1[id] - by0[id]) + 1; if (L >= minLen && L * L / areas[id] >= e) { keep[id] = 1; kept++; } }
  console.log(`face lines: ${kept} of ${count} marks of the reference are line-shaped`);
  return Uint8Array.from(labels, id => (id && keep[id] ? 1 : 0));
})() : SEP.ink);

// Ink uses a separate material profile. --inkprofile chooses it; --inkk and --inkkscale control absorption.
// --inkfast auto|1|0: 1 sets the ink before washes (waterproof); 0 keeps the material's rewetting. auto (default) is
// waterproof for black ink and soluble for sepia, as a plan's drawing.ink.waterproof defaults. --inkcolour is unused.
const REQUESTED_DRAW_MEDIUM=OUTLINE_REQUESTED==='auto'?OUTLINE.medium:OUTLINE_REQUESTED;
const SUBJECT_STYLE=VALUE_CONFIG?.styleSelection?resolveStyle(VALUE_CONFIG.subject,null,VALUE_CONFIG.styleSelection):null;
// precise-watercolor is the identity profile for the shaped planner; other styles scale ink and graphite by their weights
const STYLE_ON=()=>!!ctx.VALUE_PLAN?.style&&ctx.VALUE_PLAN.style.name!=='precise-watercolor';
// The pen's ink load. --closingconc f dilutes the closing pen's ink (default 1): a closing accent restates an edge over
// dried washes and should not come out darker than the darkest of them.
const INKLOAD_PLANNED=()=>(STYLE_ON()?num('inkconc',8)*ctx.VALUE_PLAN.style.ink:num('inkconc', VALUE_ENABLED ? 4 : 10))*(ctx.AREA_DRAW_STAGE==='closing'?num('closingconc',1):1);
const INKLOAD=()=>INKLOAD_PLANNED()*inkDarkCap(ctx.AREA_DRAW_STAGE);
// --inkwidthfloor f (default 0 off): no ink line is thinner than f target pixels on the sheet (the nib's widest contact
// rises to it too). --inkdamp d (0..1, default 0): the pen finds the paper at least d damp, so the line feathers a
// little, as on a sheet not yet quite dry (src/media/pen.mjs).
// with --inkres N the floor is at most one fine cell, so the finer sheet can draw the finer line
const INK_WIDTH_FLOOR_MM=Math.min(num('inkwidthfloor',0)*(ctx.INK_LINES?.pixelMm??0), num('inkres',1)>1 ? num('sheetmm', DEFAULT_SHEET_MM)/(w*Math.round(num('inkres',1))) : Infinity), INK_DAMP=num('inkdamp',0);
if(!(INK_DAMP>=0&&INK_DAMP<=1))throw Error('--inkdamp: a dampness from 0 to 1');
if(num('inkwidthfloor',0)>0&&!ctx.INK_LINES)console.log('ink width floor: no target measured (no --image or --drawing none), so no floor');
// --inkdarkcap c (default 0 off): before each pen stage, a test line on a scrap of the same paper sets the ink load so
// the pen's line on blank paper is c times as dark (in absorbance) as the target's own lines are against what is beside
// them (src/paint/methods/ink-scrap.mjs). It only ever thins the ink. Measured on the stage's line file; a stage with
// no file keeps its load.
const INK_DARK_CAPS={};
function inkDarkCap(stage){
 const c=num('inkdarkcap',0);if(!(c>0))return 1;
 if(INK_DARK_CAPS[stage])return INK_DARK_CAPS[stage].factor;
 const A=ctx.INK_LINES?.[stage]?.stats?.absorbance;
 if(!(A>0)){INK_DARK_CAPS[stage]={factor:1,why:'no measured target lines for this stage'};console.log(`ink dark cap, ${stage}: no measured target lines, load unchanged`);return 1;}
 const mmPerCell=(ctx.PB?.mm??num('sheetmm', DEFAULT_SHEET_MM))/ctx.W2,p=INK_PROFILE,widthMm=Math.max(INK_WIDTH_FLOOR_MM,p.widthMm[0]+(p.widthMm[1]-p.widthMm[0])*.5**p.pressureExponent);
 const r=inkCapOnScrap({targetAbsorbance:A,cap:c,conc:INKLOAD_PLANNED(),pigment:INK,mmPerCell,widthMm,pen:{damp:INK_DAMP},paperOpts:ctx.PAPER_OPTS});
 INK_DARK_CAPS[stage]={...r,target:A,widthMm,load:INKLOAD_PLANNED()};
 console.log(`ink dark cap, ${stage}: target lines ${A.toFixed(2)} absorbance against what is beside them; a ${widthMm.toFixed(2)} mm scrap line at load ${INKLOAD_PLANNED().toFixed(2)} reads ${r.before.toFixed(2)}, so the load is scaled by ${r.factor.toFixed(3)} (scrap ${r.after.toFixed(2)})`);
 fs.writeFileSync(path.join(out,'ink-dark-cap.json'),JSON.stringify(INK_DARK_CAPS,null,1)+'\n');
 return r.factor;
}
const STYLE_INK_DEFAULT=SUBJECT_STYLE?.pigment==='black'?'black-ink':'sepia-ink';
const INK_PROFILE=materialProfile(opt('inkprofile',REQUESTED_DRAW_MEDIUM.endsWith('-ink')?REQUESTED_DRAW_MEDIUM:STYLE_INK_DEFAULT));
const GRAPHITE_PROFILE=materialProfile(opt('graphiteprofile',REQUESTED_DRAW_MEDIUM.startsWith('graphite-')?REQUESTED_DRAW_MEDIUM:'graphite-HB'));
if(INK_PROFILE.kind!=='ink'||GRAPHITE_PROFILE.kind!=='graphite')throw Error('inkprofile/graphiteprofile must use the corresponding material family');
if(!['ink','graphite'].includes(opt('firstpen','ink')))materialProfile(opt('firstpen','ink'));
const OUTLINE_MEDIUM=REQUESTED_DRAW_MEDIUM;
if(!['ink','graphite','none'].includes(OUTLINE_MEDIUM))materialProfile(OUTLINE_MEDIUM);
// --inkk r,g,b overrides the profile's absorption; --inkkscale multiplies it.
const INK_K_DECLARED=opt('inkk','')?opt('inkk','').split(',').map(Number):null;
if(INK_K_DECLARED&&(INK_K_DECLARED.length!==3||INK_K_DECLARED.some(v=>!(v>0))))throw Error('--inkk needs three positive numbers');
const INK_FAST=opt('inkfast','auto')==='auto'?!INK_PROFILE.rewets:num('inkfast',0)>0;
// --inkhue source: the ink takes the hue of the target's own pen lines (src/paint/methods/ink-hue.mjs); --inkk wins.
// --inkhuegain g (default 1): raises each channel's share of that hue to the power g, so g > 1 is browner.
if(!['profile','source'].includes(opt('inkhue','profile')))throw Error('--inkhue: profile or source');
const INK_HUE=opt('inkhue','profile')==='source'&&!INK_K_DECLARED?inkKFromSource(PX_SOURCE,SEP.ink,paperRGB,INK_PROFILE.pigment.K,{gain:num('inkhuegain',1)}):null;
if(opt('inkhue','profile')==='source')console.log(INK_HUE?`ink hue from the target's lines: K ${INK_HUE.K.join(',')} over ${INK_HUE.cells} line cells (profile ${INK_PROFILE.pigment.K.join(',')})`:'ink hue: too few target line cells, profile hue kept');
const INK={...INK_PROFILE.pigment,omega:INK_FAST?60:INK_PROFILE.pigment.omega,K:(INK_K_DECLARED??INK_HUE?.K??INK_PROFILE.pigment.K).map(v=>v*num('inkkscale',1))};
console.log('drawing material profiles:',JSON.stringify({ink:{...INK_PROFILE,pigment:INK,rewets:INK.omega<60},graphite:GRAPHITE_PROFILE}));
// --outlinemedium graphite: pen-first outlines in pencil, not ink; graphite is a neutral grey, waterproof and light.
// only on a sheet that will be drawn first (the same test as PEN_FIRST below), so a sheet washed first carries no unused pigment
const DRAWS_FIRST = opt('prep', '0') !== '0' || ['first', 'both'].includes(opt('drawing', 'first'));
// --penpencil <stage.png>: the opening drawing in dry pencil, coloured as the target stage's line (pencil-line.mjs)
const PENCIL = opt('penpencil', '') && DRAWS_FIRST ? await (async () => {
  const m = await measureLine({ file: path.resolve(root, opt('penpencil', '')), w, h, sharp, cut: num('pencilcut', 12), log: console.log });
  return { ...m, pig: {...GRAPHITE_PROFILE.pigment,strength:GRAPHITE_PROFILE.concentration} };
})() : null;
const PENCIL_STAGE = DRAWS_FIRST && num('pencilstage', 0) > 0;
const GRAPHITE = PENCIL ? (({ strength, ...pig }) => pig)(PENCIL.pig) : (STAGE_PLAN?.files.prep || OUTLINE_MEDIUM === 'graphite' || (OUTLINE_MEDIUM !== 'ink' && OUTLINE_MEDIUM !== 'none' && (OUTLINE_MEDIUM === 'none' ? materialProfile('graphite') : materialProfile(OUTLINE_MEDIUM)).kind==='graphite')) && opt('drawing', 'first') !== 'none' && DRAWS_FIRST
  ? GRAPHITE_PROFILE.pigment
  : null;
// --wickfloor f: least share of a granulating paint's water-borne pigment the pores take, 0..0.9, so peaks stay pale. Default 0.
// A comma list sets it per pigment in palette order; the last value carries on, 0 leaves a pigment alone.
const WICK_FLOORS = String(opt('wickfloor', '0')).split(',').map(v => Math.min(0.9, Math.max(0, Number(v) || 0)));
const wickFloorOf = j => WICK_FLOORS[Math.min(j, WICK_FLOORS.length - 1)];
const WICK_FLOOR = Math.max(...WICK_FLOORS);
const SHEET_PIGS = [...(WICK_FLOOR > 0 ? PIGS.map((p, j) => (wickFloorOf(j) > 0 ? { ...p, wick: Math.max(wickFloorOf(j), p.wick ?? Math.max(0.05, Math.min(0.9, 1 - p.gamma))) } : p)) : PIGS), ...(INK ? [INK] : []), ...(GRAPHITE ? [GRAPHITE] : [])]; ctx.SHEET_PIGS = SHEET_PIGS;
const GRAPHITE_AT = PIGS.length + (INK ? 1 : 0);
// every brush is dipped for the wash palette; with a separate ink or accent paints on the sheet it carries none of them
const FINISH_FILE=opt('finishareaplan','');
if(FINISH_FILE&&opt('semanticcalibration','legacy')!=='actual')throw Error('finishareaplan requires actual authored instrument calibration');
if(FINISH_FILE&&opt('areaplan',''))throw Error('finishareaplan appends to original numeric route; areaplan cannot coexist');
ctx.FINISH_PLAN=null; ctx.FINISH_COMPILED=null; ctx.FINISH_START=-1; ctx.FINISH_MASS_BEFORE=null;
const AREA_FILE=opt('areaplan','');ctx.AREA_PLAN=null; ctx.AREA_COMPILED=null; ctx.AREA_DRAW_STAGE='opening'; ctx.AREA_FILM_REMOVED=false;const AREA_LOADS=new WeakMap(),AREA_COMPLETED=new Set(),AREA_PREPARED=new Set();
ctx.AREA_NUMERIC_SEQUENCE=null; ctx.AREA_NUMERIC_CONTACT_STOP=null; let MOD_DRY_CAL_GAIN=null;
const AREA_EXEC=createAreaExecution({emit:r=>{if(ctx.AREA_PLAN)JSONL.append(path.join(out,'semantic-commands.jsonl'),JSON.stringify(r)+'\n');}});
if(AREA_FILE){
 const doc=JSON.parse(fs.readFileSync(path.resolve(root,AREA_FILE))),imageFile=path.resolve(root,opt('image','')),meta=await sharp(imageFile).metadata();
 const targetFile=path.resolve(root,doc.target.path),targetMeta=await sharp(targetFile).metadata();if(targetMeta.width!==doc.target.width||targetMeta.height!==doc.target.height)throw Error('semantic target frame mismatch');
 ctx.AREA_PLAN=rasterAreaPlan(validateAreaDocument(doc,{targetSHA:sha256(targetFile),imageSHA:sha256(imageFile),sourceWidth:meta.width,sourceHeight:meta.height}),w,h);
 // Existing independently owned adapters cannot double-paint semantic-owned demand.
 const productionDetails=validateProductionDetails(doc);
 if(productionDetails&&(!MOD||doc.areas.some(a=>a.passes.some(p=>p.source==='authored'))))throw Error('production-modulate details require existing numeric modulation route');
 for(const key of ['passages','shapes','modulate','curls'])if(!(key==='modulate'&&productionDetails)&&opt(key,'')&&!['0','none'].includes(opt(key,'')))throw Error(`--areaplan conflicts with legacy adapter --${key}`);
 fs.writeFileSync(path.join(out,'semantic-area-plan.json'),JSON.stringify(doc,null,2));
 for(const [name,a] of [['ownership',ctx.AREA_PLAN.owner],['paper-reserves',ctx.AREA_PLAN.reserves],['film',ctx.AREA_PLAN.film]])fs.writeFileSync(path.join(out,`semantic-${name}.json`),JSON.stringify({w,h,coordinateSpace:'execution-grid',data:Array.from(a)}));
 if(num('areaplanonly',0)){let c;try{c=compileAreaLayers(ctx.AREA_PLAN,ctx.layers,PIGS,{mmPerCell:num('sheetmm',DEFAULT_SHEET_MM)/w});}catch(e){fs.writeFileSync(path.join(out,'semantic-coverage.json'),JSON.stringify(e.diagnostics??{error:e.message},null,2));throw e;}validateCompiledAreaStop(opt('areastop',''),c.layers);fs.writeFileSync(path.join(out,'semantic-coverage.json'),JSON.stringify({...c.diagnostics,stage:'CPU pre-sheet compiler; physical execution NOT RUN'},null,2));fs.writeFileSync(path.join(out,'semantic-numerical-shapes.json'),JSON.stringify({w,h,stage:'CPU numerical shapes; not executed gestures',shapes:c.layers.flatMap(l=>l.shapes.map(sh=>({areaId:l._semantic.area.id,passId:l._semantic.key,pass:l._semantic.pass,value:l.value,amount:sh.amount,mix:sh.mix,cells:Array.from(sh.mask,(v,i)=>v?i:-1).filter(i=>i>=0)})))}));if(c.diagnostics.numericFitBypassed){const executionWidth=w*num('scale',1),executionHeight=h*num('scale',1);fs.writeFileSync(path.join(out,'semantic-authored-paths.json'),JSON.stringify({executionWidth,executionHeight,physicalExecution:false,passes:c.layers.map(l=>({passId:l._semantic.key,paths:lowerAuthoredGestures(l._semantic,{target:ctx.AREA_PLAN.doc.target,crop:ctx.AREA_PLAN.crop,width:executionWidth,height:executionHeight,sheetWidthMm:num('sheetmm', DEFAULT_SHEET_MM)*ctx.AREA_PLAN.doc.target.width/ctx.AREA_PLAN.crop[2]})}))}));}const first=c.layers[0];if(first)fs.writeFileSync(path.join(out,'semantic-first-numerical-shape.json'),JSON.stringify({w,h,areaId:first._semantic.area.id,passId:first._semantic.key,value:first.value,cells:Array.from(first.shapes[0].mask,(v,i)=>v?i:-1).filter(i=>i>=0)}));process.exit(0);}
}
if(FINISH_FILE){
 const doc=JSON.parse(fs.readFileSync(path.resolve(root,FINISH_FILE))),imageFile=path.resolve(root,opt('image','')),meta=await sharp(imageFile).metadata();
 const bound=bindFinishingArea(doc,{targetSHA:sha256(doc.target.path),imageSHA:sha256(imageFile),sourceWidth:meta.width,sourceHeight:meta.height,w,h,palette:PIGS});
 ctx.FINISH_PLAN=bound.plan;ctx.FINISH_COMPILED=bound.compiled;
 fs.writeFileSync(path.join(out,'finishing-area-before.json'),JSON.stringify({kind:'BEFORE appended authored glaze; numerical geometry retained; no execution proof',inputSHA:sha256(path.resolve(root,FINISH_FILE)),target:doc.target,instructions:doc.areas,coverage:ctx.FINISH_COMPILED.diagnostics,paths:ctx.FINISH_PLAN.schedule.map(q=>({id:q.key,paths:lowerAuthoredGestures(q,{target:doc.target,crop:ctx.FINISH_PLAN.crop,width:w*num('scale',1),height:h*num('scale',1),sheetWidthMm:num('sheetmm', DEFAULT_SHEET_MM)})}))},null,2));
}
const EARLY_DRY_VALUE=num('earlydryvalue',0);earlyDryBoundary({minValue:EARLY_DRY_VALUE,value:0,fullBoundary:false});if(EARLY_DRY_VALUE&&ctx.AREA_PLAN)throw Error('earlydryvalue supports original numeric boundaries only');
if(EARLY_DRY_VALUE)fs.writeFileSync(path.join(out,'early-dry-before.json'),JSON.stringify({minValue:EARLY_DRY_VALUE,scope:'completed original full numeric pan/value dry boundaries; firstwash and intentional connected wet passages unchanged',order:'ordinary physical dry before baseline idle settle, not perstroke dry',water:'original unchanged',pigment:'original requested load and planned demand unchanged'},null,2));ctx.EARLY_DRY_CAPTURED=false;
Object.assign(ctx, { PALETTE, PIGS, COLOUR_BUDGET, STYLE, D_AIM, FIG_MASK, LIGHT_CELLS, GOUACHE_LIGHTS, LIGHT_SHARE, 
  SMALL, WHITE_HOLD, MIXES, setClip, MOD, MASS_BUDGET, DRAW_STYLE, COLOUR_TRACE, PUDDLES, 
  FIRST_FLOOR, AUTHORED_INPUT, EDGE, HP, maskBox, FULLBOX, TECHNIQUE, techniqueOf, reportTechniques, CURLS, 
  DETAIL_REGION, FINISH, FUR_FIELD, SEP, OUTLINE, PREP_ERASE, STAGE_PLAN, FACE_INK, REQUESTED_DRAW_MEDIUM, STYLE_ON, 
  INKLOAD, INK_WIDTH_FLOOR_MM, INK_DAMP, STYLE_INK_DEFAULT, INK_PROFILE, GRAPHITE_PROFILE, OUTLINE_MEDIUM, INK, 
  PENCIL, PENCIL_STAGE, GRAPHITE, GRAPHITE_AT, FINISH_FILE, AREA_FILE, AREA_LOADS, AREA_COMPLETED, AREA_EXEC, 
  EARLY_DRY_VALUE });
}
