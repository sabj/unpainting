// The palette, pigment demand, masks and the order of the layers.
// Stage 2 of 7 of tools/paint-plate.mjs. The stages run in order and share one object, ctx: see the entry file.
import {materialProfile} from '../../src/paint/methods/material-profiles.mjs';
import {boundsOf} from '../../src/mask-bounds.mjs';
import {DEFAULT_SHEET_MM} from '../../src/media/sheet-size.mjs';
import {resolveOutlineMedium, describeOutlineMedium} from '../../src/paint/methods/outline-medium.mjs';
import {earlyDryBoundary} from '../painter/early-dry-boundary.mjs';
import {cachedStep, codeHash} from '../../src/paint/run-cache.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {pickPalette, paletteOptions} from '../../src/crop/palettepick.mjs';
import {widePalette} from '../../src/crop/palettewide.mjs';
import {paintGuardOptions} from '../../src/crop/paint-guard.mjs';
import {channelDensity} from '../../src/crop/pigments.mjs';
import {measureLine} from '../../src/paint/methods/pencil-line.mjs';
import {components, minFilter, maxFilter} from '../../src/raster.js';
import {gaussian} from '../../src/keyframes/density.mjs';
import {setClip as physicalSetClip, stableClipMask} from '../../src/media/sheet.mjs';
import {styleTarget} from '../../src/crop/styletarget.mjs';
import {separate} from '../../src/crop/inkwash.mjs';
import {finishField} from '../../src/crop/finish.mjs';
import {smallLights, paperDensity, cellShare, keepLargestLights} from '../../src/crop/lights.mjs';
import {pigmentPhysics} from '../../src/paint/methods/pigment-physics.mjs';
import {planLinework} from '../../src/paint/methods/linework-plan.mjs';
import {inkCapOnScrap} from '../../src/paint/methods/ink-scrap.mjs';
import {inkKFromSource} from '../../src/paint/methods/ink-hue.mjs';
import {sourcePenShare} from '../../src/paint/methods/pen-share.mjs';
import {chooseDrawingStages} from '../../src/paint/methods/drawing-stages-auto.mjs';
import {eraseWeights, eraserDabs, ERASER_MM} from '../../src/paint/methods/pencil-erase.mjs';
import {planLines as planLineChoice} from '../../src/paint/drawing-plan.mjs';
import {measureStyle} from '../../src/paint/methods/practice-style.mjs';

export async function plan(ctx) {
const { JSONL, argv0, argv, PIPELINE, opt, num, DRAWING_STAGE_INTENT, optTrack, SPEED_PROFILE, 
  root, out, INK_RECIPE, DRAWING_REGISTRATION, RUN_CACHE, holdInk, VALUE_CONFIG, 
  phaseMark, PX_SOURCE, PX_RAW, TARGET_GUARD, w, h, n, lum, paperRGB, CODE_HASH, 
  PALETTE_FROM_FILE, paletteFitStarted } = ctx;
const PALETTE = (await cachedStep({ ...RUN_CACHE, name: 'palette', code: codeHash(root,[],{dependencies:['src/crop/palettepick.mjs','src/crop/palettewide.mjs','src/crop/paint-guard.mjs']}), track: optTrack, inputs: { px: ctx.px, w, h, paperRGB, from: PALETTE_FROM_FILE } }, async () => {
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
const PIGS = pigmentPhysics({ pigments: PALETTE.pigments, opt, num, log: console.log });
const COLOUR_BUDGET = num('colourbudget', 0) > 0 && PIGS.length > 1;
console.log(`palette: ${PIGS.length} pigments, ${PALETTE.monochrome ? 'one fluid' : `paint chroma ${PALETTE.paintChroma.toFixed(2)}`}`);
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
// The subject is not fitted cell by cell into pigment amounts (the per-cell pigment fit ctx.A was removed in 0.4): every
// wash's mix is chosen for its shape as a whole from one colour (src/paint/methods/study-washes.mjs).

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
ctx.HOLD = null; ctx.FUR_HOLD = null;
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
// --drawinglogic 3 draws its scribble only on an ink-led piece
const DRAW_STYLE = num('drawinglogic', 0) === 3 ? (await measureStyle({ SRC: ART_DENSITY(), w, h, n, px: ctx.px, gaussian, minFilter, maxFilter, log: console.log })) : null;
const COLOUR_TRACE = num('colourtrace', 0) > 0;
// Whites are kept by masking, not by painting round them: a wash flows over the mask and leaves it clean.
const pl = 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2];
ctx.SRC = TARGET_GUARD.register('SRC', new Float32Array(n));
for (let i = 0; i < n; i++) ctx.SRC[i] = Math.max(0, -Math.log(Math.max(0.02, Math.min(1, lum(i) / pl))));
const peakD = [...ctx.SRC].sort((a, b) => b - a)[Math.floor(n * 0.03)] || 1;

// The rows and columns a passage's cells lie in, found once: the loops that walk its mask walk only these, in the same order
// (a cell outside the box is not in the mask, so it is skipped either way). Empty mask: y1 < y0.
const maskBox = (M) => {
  if (process.env.NOBOX) return { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  return boundsOf(M, w, h);
};
const FULLBOX = { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
// --edgeclear e: share of width and height at each edge read as structureless, so a scan's mount is not grain. Default 0.
const EDGE = (() => { const e = num('edgeclear', 0), ex = Math.round(e * w), ey = Math.round(e * h); return i => { const x = i % w, y = (i / w) | 0; return x < ex || y < ey || x >= w - ex || y >= h - ey; }; })();
// the wash plan's passes (sheet.mjs) replace this before painting
ctx.layers = []; ctx.steps = 5;


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
    const field = Float32Array.from(noise);
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

// The separator's reading of the source: which cells are pen line, which are wash. Read once; the ink's colour, the
// line budget and the gate on the pen all use it.
const SEP = (await cachedStep({...RUN_CACHE,name:'separator',code:codeHash(root,[],{dependencies:['src/crop/inkwash.mjs']}),track:optTrack,inputs:{PX_SOURCE,w,h,paperRGB}},async()=>separate(PX_SOURCE,w,h,paperRGB))).value;
// the pen-and-wash ink recipe is for pen drawings; on a brush or photo source it adds pen lines the source lacks
if (INK_RECIPE.recipe === 'wash' && opt('drawing','first') !== 'none' && 100 * SEP.stats.ink / n < num('penfirst', 0.5)) console.log(`!!! --inkrecipe wash: the target shows ${(100 * SEP.stats.ink / n).toFixed(2)}% pen line, under --penfirst ${num('penfirst', 0.5)}%; the recipe is meant for pen drawings and pen-and-wash, and will draw pen lines this source may not have`);
// The pen-line share every pen or pencil choice below reads (outline medium, drawing stages, line source): one
// reading at 1200 px wide (pen-share.mjs), so --width does not change what is pen. SEP is at the run's grid.
// A run with a graphite outline, no line source and no ink plan never asks, so it skips the extra reading.
const PEN_ASKED = opt('outlinemedium', 'graphite') !== 'graphite' || PIPELINE?.drawing?.medium === 'ink';
const PEN_SHARE = PEN_ASKED && fs.existsSync(path.resolve(root, opt('image', ''))) ? await sourcePenShare({ image: path.resolve(root, opt('image', '')), sharp }) : SEP.stats.ink / n;
// Removing ink from the wash target must not erase the evidence used to select finish ink.
const DRAW_DENSITY = PX_RAW === PX_SOURCE ? ctx.SRC : TARGET_GUARD.register('drawing-density', Float32Array.from({length:n},(_,i)=>Math.max(0,-Math.log(Math.max(.02,Math.min(1,(.2126*PX_SOURCE[3*i]+.7152*PX_SOURCE[3*i+1]+.0722*PX_SOURCE[3*i+2])/pl))))));
// The plan's line set and its linked stages (src/paint/methods/linework-plan.mjs): the lines
// come from the drawing file, --stages cuts prep (pencil), prep ink and finish ink from that one set. Planning only, before the seal.
// --outlinemedium auto|ink|graphite|<profile>: preparatory drawing medium. graphite (default): the drawing is pencil
// unless ink is asked for (--outlinemedium ink or a plan's medium); ink is being reworked. auto is ink when the source
// shows --penfirst per cent of line or more, else graphite.
const OUTLINE_REQUESTED = opt('outlinemedium', 'graphite');
const OUTLINE = resolveOutlineMedium({ requested: ['auto', 'ink', 'graphite'].includes(OUTLINE_REQUESTED) ? OUTLINE_REQUESTED : (OUTLINE_REQUESTED === 'none' ? 'graphite' : materialProfile(OUTLINE_REQUESTED).kind), share: PEN_SHARE, threshold: num('penfirst', 0.5) });
console.log(describeOutlineMedium(OUTLINE));
// the plan states its medium with a reason (plan drawing.reason); the subject's medium may still override it (subject-medium.mjs)
{ const d = VALUE_CONFIG?.drawing ?? PIPELINE?.drawing; if (d?.reason != null) { if (typeof d.reason !== 'string' || !d.reason.trim()) throw new Error('drawing.reason: a sentence saying why the medium'); console.log(`the plan's medium: ${d.medium ?? 'not named'}, because ${d.reason.trim()}`); } }
DRAWING_STAGE_INTENT.planMedium ??= PIPELINE?.drawing?.medium ?? OUTLINE.medium;
// the drawing's stages for this image: planner model, rule and gate (drawing-stages-auto.mjs); the prep pencil's erase
// weights are made now, before the target is sealed (pencil-erase.mjs)
const DRAWING_CHOICE = await chooseDrawingStages({ opt, argv, image: path.resolve(root, opt('image','')), root, out, rgb: PX_SOURCE, w, h, penLine: PEN_SHARE, log: console.log, intent: DRAWING_STAGE_INTENT });
// planned as kneaded-eraser dabs, so painting lays a plan and reads no map made from the target
const PREP_ERASE = num('preperase', 0.85) > 0 ? eraserDabs(eraseWeights(PX_SOURCE, w, h), w, h, { tile: ERASER_MM / (num('sheetmm', DEFAULT_SHEET_MM) / w) }) : null;
const LINEWORK = await planLinework({ drawingOverride: argv0.includes('--drawing') ? argv0[argv0.lastIndexOf('--drawing')+1] : null, opt, num, argv, out, density: { D: DRAW_DENSITY, w, h }, grid: { w, h }, log: console.log,
  planLines: (ls, image) => { const skip = new Set(opt('drawingskip', '').split(',').map(r => r.trim()).filter(Boolean)); const scaled = ls.filter(g => !skip.has(g.role)).map(g => ({ ...g, length: g.length ?? g.points.reduce((a, q, k) => (k ? a + Math.hypot(q[0] - g.points[k - 1][0], q[1] - g.points[k - 1][1]) : 0), 0) })); return planLineChoice(scaled, num); } });
// Linked stages write new opening and closing files after the hold above; hold those too, so the ink flags reach the
// pens on a staged run as they do on a run with a prepared line file.
if (LINEWORK.files?.prepInk || LINEWORK.files?.finishInk) ctx.INK_LINES = (await holdInk()) ?? ctx.INK_LINES;
if (DRAWING_REGISTRATION) LINEWORK.registration = DRAWING_REGISTRATION;
if (DRAWING_CHOICE) LINEWORK.drawingChoice = DRAWING_CHOICE;
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
// precise-watercolor is the identity profile for the shaped planner; other styles scale ink and graphite by their weights
const STYLE_ON=()=>!!ctx.VALUE_PLAN?.style&&ctx.VALUE_PLAN.style.name!=='precise-watercolor';
// The pen's ink load. --closingconc f dilutes the closing pen's ink (default 1): a closing accent restates an edge over
// dried washes and should not come out darker than the darkest of them.
const INKLOAD_PLANNED=()=>(STYLE_ON()?num('inkconc',8)*ctx.VALUE_PLAN.style.ink:num('inkconc', 4))*(ctx.DRAW_STAGE==='closing'?num('closingconc',1):1);
const INKLOAD=()=>INKLOAD_PLANNED()*inkDarkCap(ctx.DRAW_STAGE);
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
const STYLE_INK_DEFAULT='sepia-ink';
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
// An ink drawing with a pencil lay-in under it (strokes of its vectors file marked medium 'graphite') needs graphite on the
// sheet: the lay-in is laid in graphite before the ink, in the opening pen (drawing.mjs layExactVectors; from 3e27d30c)
const DRAWING_DOC=(()=>{const base=opt('drawingfile','');if(!base||opt('drawing','first')==='none')return null;const f=(base.endsWith('-lines.json')?base.slice(0,-'-lines.json'.length):base)+'-vectors.json';return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):null;})();
const LAYIN_GRAPHITE=DRAWING_DOC?.medium==='ink'&&DRAWING_DOC.strokes.some(q=>q.medium==='graphite'&&!q.wash);
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
const GRAPHITE_OWN = PENCIL ? (({ strength, ...pig }) => pig)(PENCIL.pig) : (STAGE_PLAN?.files.prep || OUTLINE_MEDIUM === 'graphite' || (OUTLINE_MEDIUM !== 'ink' && OUTLINE_MEDIUM !== 'none' && (OUTLINE_MEDIUM === 'none' ? materialProfile('graphite') : materialProfile(OUTLINE_MEDIUM)).kind==='graphite')) && opt('drawing', 'first') !== 'none' && DRAWS_FIRST
  ? GRAPHITE_PROFILE.pigment
  : null;
// (graphite only for an ink drawing's lay-in: LAYIN_ONLY, so nothing else in the run draws in pencil)
const LAYIN_ONLY = !GRAPHITE_OWN && LAYIN_GRAPHITE && DRAWS_FIRST && opt('drawing', 'first') !== 'none';
const GRAPHITE = GRAPHITE_OWN ?? (LAYIN_ONLY ? GRAPHITE_PROFILE.pigment : null);
if (LAYIN_ONLY) console.log(`pencil lay-in: ${DRAWING_DOC.strokes.filter(q => q.medium === 'graphite').length} strokes of the ink drawing are graphite, laid before the ink`);
// --wickfloor f: least share of a granulating paint's water-borne pigment the pores take, 0..0.9, so peaks stay pale. Default 0.
// A comma list sets it per pigment in palette order; the last value carries on, 0 leaves a pigment alone.
const WICK_FLOORS = String(opt('wickfloor', '0')).split(',').map(v => Math.min(0.9, Math.max(0, Number(v) || 0)));
const wickFloorOf = j => WICK_FLOORS[Math.min(j, WICK_FLOORS.length - 1)];
const WICK_FLOOR = Math.max(...WICK_FLOORS);
// Surface marks, coat strokes, final lights in white gouache and thin darks were planned here from the subject's fine
// detail; they failed the planted-pattern copy test and were removed in 0.4 (last at commit 49447027).
const SHEET_PIGS = [...(WICK_FLOOR > 0 ? PIGS.map((p, j) => (wickFloorOf(j) > 0 ? { ...p, wick: Math.max(wickFloorOf(j), p.wick ?? Math.max(0.05, Math.min(0.9, 1 - p.gamma))) } : p)) : PIGS), ...(INK ? [INK] : []), ...(GRAPHITE ? [GRAPHITE] : [])]; ctx.SHEET_PIGS = SHEET_PIGS;
const GRAPHITE_AT = PIGS.length + (INK ? 1 : 0);
// every brush is dipped for the wash palette; with a separate ink or accent paints on the sheet it carries none of them
ctx.DRAW_STAGE='opening';
const EARLY_DRY_VALUE=num('earlydryvalue',0);earlyDryBoundary({minValue:EARLY_DRY_VALUE,value:0,fullBoundary:false});
if(EARLY_DRY_VALUE)fs.writeFileSync(path.join(out,'early-dry-before.json'),JSON.stringify({minValue:EARLY_DRY_VALUE,scope:'completed original full numeric pan/value dry boundaries; firstwash and intentional connected wet passages unchanged',order:'ordinary physical dry before baseline idle settle, not perstroke dry',water:'original unchanged',pigment:'original requested load and planned demand unchanged'},null,2));ctx.EARLY_DRY_CAPTURED=false;
Object.assign(ctx, { PALETTE, PIGS, COLOUR_BUDGET, STYLE, D_AIM, LIGHT_CELLS, GOUACHE_LIGHTS, LIGHT_SHARE, 
  SMALL, setClip, DRAW_STYLE, COLOUR_TRACE, 
  EDGE, maskBox, FULLBOX, 
  FINISH, SEP, OUTLINE, PREP_ERASE, STAGE_PLAN, FACE_INK, REQUESTED_DRAW_MEDIUM, STYLE_ON, 
  INKLOAD, INK_WIDTH_FLOOR_MM, INK_DAMP, STYLE_INK_DEFAULT, INK_PROFILE, GRAPHITE_PROFILE, OUTLINE_MEDIUM, INK, 
  PENCIL, PENCIL_STAGE, GRAPHITE, GRAPHITE_AT, LAYIN_ONLY, 
  EARLY_DRY_VALUE });
}
