// The order of work, reserves, the drawing passes and the preparation stage.
// Stage 5 of 7 of tools/paint-plate.mjs. The stages run in order and share one object, ctx: see the entry file.
import {check} from '../../src/media/checks.mjs';
import {setTextureFlow, flowField} from '../../src/paint/techniques/shaped-marks.mjs';
import {DEFAULT_SHEET_MM} from '../../src/media/sheet-size.mjs';
import {validateProductionDetails} from '../painter/semantic-production-details.mjs';
import {sha256} from '../painter/semantic-areas.mjs';
import {measurePaperDry} from '../../src/paint/methods/wetdry.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {step, thickness, layersChanged} from '../../src/media/sheet.mjs';
import {assertDeviceHealthy} from '../../src/media/gpu/device-health.mjs';
import {renderLayers} from '../../src/media/km.mjs';
import {channelDensity} from '../../src/crop/pigments.mjs';
import {accentCells, accentFamilies} from '../../src/paint/methods/final-darks.mjs';
import {tipTouchMm2} from '../../src/paint/methods/final-dark-marks.mjs';
import {roleBrushMm} from '../../src/paint/methods/brush-footprint.mjs';
import {dropMask} from '../../src/crop/blockin.mjs';
import {brushedWashPaths, sweepCover, containPaths, gradientSweepAngle, prewetArea} from '../../src/media/wash.mjs';
import {loadSubject, splitFirstWash} from '../../src/paint/methods/first-wash.mjs';
import {pencilBatches, prepFade} from '../../src/paint/methods/pencil-stage.mjs';
import {painterOrder, subjectRegions} from '../../src/paint/methods/painter-order.mjs';
import {hasLines, loadLines} from '../../src/crop/lines.mjs';
import {deferredFirstWash} from '../../src/paint/methods/colour-budget.mjs';
import {distanceToZero} from '../../src/raster.js';
import {components, removeSmall, dilate, erode} from '../../src/raster.js';
import {gaussian} from '../../src/keyframes/density.mjs';
import {applyResist} from '../../src/media/sheet.mjs';
import {breakLights} from '../../src/paint/methods/lights-shape.mjs';
import {shapeFlecks} from '../../src/paint/methods/flecks.mjs';
import {softMask} from '../../src/paint/methods/soft-mask.mjs';
import {longShare} from '../../src/crop/gestures.mjs';
import {fillReserved} from '../../src/crop/lights.mjs';
import {erasePrep} from '../../src/paint/methods/pencil-erase.mjs';
import {localLights} from '../../src/paint/methods/local-lights.mjs';
import {makeMopLanes} from '../../src/paint/methods/mop-lanes.mjs';
import {paintPenWash} from '../../src/paint/methods/pen-wash.mjs';
import {writeWashPlan} from '../../src/paint/methods/wash-plan-image.mjs';
import {joinResist} from '../../src/paint/methods/modulate.mjs';
import {sealAtBirth, sealTargetMaps} from '../guard/seal-maps.mjs';

export async function drawing(ctx) {
const { JSONL, opt, num, NATIVE_PAINT_MODE, measurePaper, liftResist, SPEED_PROFILE, root, out, EARLY_LINES, 
  VALUE_CONFIG, VALUE_ENABLED, MAJOR_INTENT, phaseMark, PX_RAW, TARGET_GUARD, w, h, n, SUBJECTS, createBrush, 
  ANCHORS, paperRGB, PIGS, COLOUR_BUDGET, LIGHT_CELLS, SMALL, setClip, MOD, FIRST_FLOOR, TECHNIQUE, techniqueOf, SEP, 
  PREP_ERASE, STAGE_PLAN, STYLE_ON, INKLOAD, OUTLINE_MEDIUM, INK, PENCIL, PENCIL_STAGE, GRAPHITE, SHEET_PIGS, 
  GRAPHITE_AT, FINISH_FILE, AREA_FILE, AREA_EXEC, dry, dip, stroke, pencilDraw, SC, W2, H2, N2, PB, paper, INKRES, 
  PEN_STATE_AUDIT, drawingCapsFor, penDraw, OUT_W, OUT_H, O, GPU_INFO, base, WETPOL, render, view, BRUSH, UPRIGHT, 
  highlights, expected, sheetDensity, drainFrames, mark, WET, CAL, snap, shoot, FILM_BY_PAINT, PEN_FRAMES, 
  PENWASH_PLAN, penWashFlat, SOURCE_INK, TIER_MASK, ML_LINES, planPen } = ctx;
Object.assign(ctx, { drawPass });
// The plan's density before anything is laid: every passage booked at its full amount, the way the loop books one it
// lays whole. The pen-first order needs it to know what the washes will not carry.
const planDensityOfLayers = () => {
  const D = new Float32Array(n);
  for (const L2 of ctx.layers) for (const sh of L2.shapes) {
    const kk = sh.mix.reduce((s, v, j) => s + v * (PIGS[j].K[0] + PIGS[j].K[1] + PIGS[j].K[2]) / 3, 0);
    // a graded passage lays its own amount in each cell, at the same colour
    const gr = sh.graded, denom = gr ? Math.max(1e-6, sh.amount) : 1;
    if(sh._runs) {
      if (gr) { for(let r=0;r<sh._runs.length;r+=2)for(let i=sh._runs[r],e=sh._runs[r+1];i<e;i++)D[i]+=kk*gr[i]/denom; }
      else { for(let r=0;r<sh._runs.length;r+=2)for(let i=sh._runs[r],e=sh._runs[r+1];i<e;i++)D[i]+=kk; }
    }
    else if(sh.box&&sh.ids) { const b=sh.box,ids=sh.ids,id=sh.id;for(let y=b.y0;y<=b.y1;y++)for(let i=y*w+b.x0,e=y*w+b.x1;i<=e;i++)if(ids[i]===id)D[i]+=gr?kk*gr[i]/denom:kk; }
    else { const m=sh.mask,b=sh._mbox??sh.box??{x0:0,y0:0,x1:w-1,y1:h-1};for(let y=b.y0;y<=b.y1;y++)for(let i=y*w+b.x0,e=y*w+b.x1;i<=e;i++)if(m[i])D[i]+=gr?kk*gr[i]/denom:kk; }
    dropMask(sh);   // one passage's field at a time, not the plan's worth of them
  }
  return D;
};
phaseMark('drawing');
const up = mask => { if (SC === 1) return mask; const m = new Uint8Array(N2); for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) m[y * W2 + x] = mask[((y / SC) | 0) * w + ((x / SC) | 0)]; return m; };
// --seed s: seeds every random choice of the process; paper and scrap calibration stay fixed, so seeds compare process only.
const SEED = Math.round(num('seed', 0)) * 7919; ctx.SEED = SEED;
const t0 = Date.now();
// where the time goes, so a slow run is diagnosed rather than guessed at
const spent = { paths: 0, strokes: 0, flow: 0, dry: 0, frames: 0 };
const clock = (key, fn) => { const a = Date.now(); const r = fn(); spent[key] += Date.now() - a; return r; }; ctx.clock = clock;
// a finer profile inside the big clocks: printed as `profile:`, changes no output
const PROF = {}, prof = (key, fn) => { const a = performance.now(); const r = fn(); PROF[key] = (PROF[key] || 0) + performance.now() - a; return r; };
// How often the sheet is advanced while paint is laid: the interval grows with a passage's sweeps, so fluid work is per passage.
// --handangle: the direction a hand takes a passage that has none of its own. Diagonal on the whole, as a wrist sweeps,
// and different from passage to passage, seeded so a run repeats.
const handAngle = k => { let s = (k * 2654435761 + 97) >>> 0; s = (s ^ (s >>> 13)) * 1274126177 >>> 0; const r = ((s ^ (s >>> 16)) >>> 0) / 4294967296; return num('handmean', 0.35) + (r - 0.5) * num('handspread', 1.4); };
// --flowmul: scales the fluid step interval while lanes are laid; fewer steps let each lane meet a wet edge. Default 1.
const flowEvery = sweeps => Math.max(24, Math.round(24 * num('flowmul', 1) * Math.sqrt(Math.max(1, sweeps))));
const SHAPE_LOAD_BUFFER = new Float32Array(n);
ctx.laid = 0; ctx.dropped = 0; ctx.droppedMass = 0; ctx.plannedMass = 0;
// --lightfill: under --smalllights the brush follows each passage with its reserved lights filled back (fillReserved),
// and goes over the masking fluid on them rather than round them
const brushMask = sh => (SMALL && opt('lightfill', '1') !== '0' ? (sh._brushMask ??= fillReserved(sh.mask, SMALL, w, h, { reach: LIGHT_CELLS })) : sh.mask);
for (const L2 of ctx.layers) for (const sh of L2.shapes) ctx.plannedMass += sh.amount * sh.area;
// --washplanpng 1: the wash plan drawn before any paint, with the segment boundaries (src/paint/methods/wash-plan-image.mjs)
if (num('washplanpng', 0) > 0) await writeWashPlan({ layers: ctx.layers, steps: ctx.steps, w, h, out, image: opt('image', ''), subjects: SUBJECTS, log: console.log });
// each passage's booking as planned, before the finish field clips it, so the film's shares add up to the plan's mass
const FILM_MASS = new WeakMap(); for (const L2 of ctx.layers) for (const sh of L2.shapes) FILM_MASS.set(sh, sh.amount * sh.area);
// --firstwash: the opening wash paler, off the subject, held to its passage and softened (src/paint/methods/first-wash.mjs)
const FW = !VALUE_ENABLED && num('firstwash', 0) > 0;
const FW_SUBJ = FW ? await loadSubject({ file: opt('fwmask', '') ? path.resolve(root, opt('fwmask', '')) : '', w, h, sharp, log: console.log }) : null; ctx.FW_SUBJ = FW_SUBJ;
// --fwrepay 1: the ground's first wash is laid at --fwopen of its plan; lay the rest as a second light ground wash. Default 0.
const FW_REPAY = FW && !COLOUR_BUDGET && num('fwrepay', 0) > 0;
// the broad first wash (--firstfloor) is not split at the subject or deferred: it is the light tone the subject wants,
// laid whole at --firstopen of its plan (1: all of it, since nothing later comes back for a pale tone)
const isFirst = l => l.shapes.some(sh => sh.firstWash);
const FW_LAYERS = FIRST_FLOOR > 0 ? ctx.layers.filter(l => !isFirst(l)) : ctx.layers;
if (FIRST_FLOOR > 0) for (const l of ctx.layers) for (const sh of l.shapes) if (sh.firstWash) sh._opening = num('firstopen', 1);
const COLOUR_LATER = FW && (COLOUR_BUDGET || FW_REPAY) ? deferredFirstWash(FW_LAYERS,{subject:FW_SUBJ,n,open:num('fwopen',0.22),tint:FW_REPAY ? 1 : num('fwtint',0)}) : [];
if (FW) { const r = splitFirstWash(FW_LAYERS, { subject: FW_SUBJ, n, open: num('fwopen', 0.22), tint: num('fwtint', 0), film: FILM_MASS }); console.log(`first wash: ${r.split} value-1 passages split, ${(100 * r.ground / n).toFixed(1)}% of the sheet as ground at ${num('fwopen', 0.22)}, ${(100 * r.subj / n).toFixed(1)}% as subject at ${num('fwtint', 0)} (summed over the pans)`); }
if(COLOUR_LATER.length) {
  for(const l of ctx.layers) if(l.value===1) for(const sh of l.shapes) FILM_MASS.set(sh,(FILM_MASS.get(sh)??0)*(sh._opening??1));
  for(const later of COLOUR_LATER) {
    // After the first dilute value, before this pan's deeper glazes.
    let at=ctx.layers.findIndex(l=>l.pigment===later.pigment && l.value>=2);
    if(at<0) at=ctx.layers.length;
    for(const sh of later.shapes) FILM_MASS.set(sh,sh.amount*sh.area);
    ctx.layers.splice(at,0,later);
  }
  console.log(`${FW_REPAY ? 'first wash repaid' : 'colour budget'}: ${COLOUR_LATER.length} suppressed first washes deferred, all mix components retained`);
}
// --order painter|ladder|legacy-painter: pass order (src/paint/methods/painter-order.mjs). Default painter: ground, subject, mids, darks.
// --ordermask: the subject (default --fwmask); --orderlight, --orderdark place the bands; --orderregions: rows of ground regions.
const ORDER = opt('order', 'painter');
if (!['ladder', 'painter', 'legacy-painter'].includes(ORDER)) throw new Error(`--order: ladder or painter, not ${ORDER}`);
if (!VALUE_ENABLED && ['painter','legacy-painter'].includes(ORDER)) {
  const file = opt('ordermask', opt('fwmask', ''));
  const subject = FW_SUBJ ?? (file ? await loadSubject({ file: path.resolve(root, file), w, h, sharp, log: console.log }) : null);
  // --ordersubject whole|drawing: drawing lays the subject's light washes by regions the drawing file's lines close off.
  // --ordersubjmax: most regions; --ordersubjmin: least share of the subject; --ordersubjwall: line thickening in cells.
  const OS = opt('ordersubject', 'whole');
  if (!['whole', 'drawing'].includes(OS)) throw new Error(`--ordersubject: whole or drawing, not ${OS}`);
  let subjectLabels = null;
  if (OS === 'drawing') {
    const base = opt('drawingfile', '');
    if (!subject || !base || !hasLines(base)) throw new Error('--ordersubject drawing needs a subject mask and --drawingfile');
    const sr = subjectRegions(subject, loadLines(base, w, h, { keepOrder: true }), { w, n, max: Math.max(2, Math.round(num('ordersubjmax', 6))), minShare: num('ordersubjmin', 0.04), dilate: Math.max(0, Math.round(num('ordersubjwall', 0))) });
    subjectLabels = sr?.label ?? null;
    console.log(sr ? `order painter: subject in ${sr.areas.length} drawing regions, ${sr.areas.map(a => (100 * a / sr.subjArea).toFixed(0) + '%').join(' ')} of it` : 'order painter: the drawing closes off fewer than two subject regions, subject laid whole');
  }
  const r = painterOrder(ctx.layers, { darkFirst: num('darkfirst', 0) > 0, subject, w, n, steps: ctx.steps, light: num('orderlight', 0.25), dark: num('orderdark', 0.6), regions: Math.max(1, Math.round(num('orderregions', 4))), minPart: num('orderminpart', 0.08), minRegion: num('orderminregion', 0.1), film: FILM_MASS, subjectLabels, far: num('orderfar', 0) > 0 });
  ctx.layers = r.layers;
  console.log(`order painter: ${ctx.layers.length} passes; ${r.summary.map(s => `${s.phase} ${s.layers} passes, ${s.passages} passages, ${(100 * s.area).toFixed(1)}% of the sheet`).join('; ')}`);
  // --bgfirst 1: every background pass goes on before the first pass on the figure, each side in painter order. Default 0.
  if (num('bgfirst', 0) > 0) {
    const bg = ctx.layers.filter(L => L._order?.side === 'ground'), fg = ctx.layers.filter(L => L._order?.side !== 'ground');
    ctx.layers = [...bg, ...fg];
    console.log(`background first: ${bg.length} background passes before ${fg.length} on the figure`);
  }
}
const FILM_FRAMES = Math.max(1, Math.round(num('frames', 40)));
ctx.filmPass = 0;
// under --smalllights the fluid goes on the small lights too, whether or not the big lights were worth masking
// (--lightresist 0, a probe: the plan and the brush leave the lights out, and nothing seals them)
const FLUID = SMALL && opt('lightresist', '1') !== '0' ? SMALL : null;
// --resistmin s: masking fluid only on lights of at least s of the sheet's cells; a masked speck dries as a rimmed hole. Default 0.
const bigLights = (mask, min) => (min > 0 ? removeSmall(mask, w, h, Math.round(min * n)) : mask);
const RESIST0 = FLUID ? Uint8Array.from(FLUID, (v, i) => (v || (ctx.masked > n * 0.01 && highlights[i]) ? 1 : 0)) : ctx.masked > n * 0.01 ? bigLights(highlights, num('resistmin', 0)) : null;
// --locallights: the lightest share of each segment masked too (src/paint/methods/local-lights.mjs)
const LOCAL_LIGHTS = breakLights(await localLights({ A: ctx.A, K: PIGS.length, w, h, n, image: opt('image', ''), opt, num, log: console.log, path }), { w, h, paper, SC, gaussian, num, log: console.log });
const RESIST_BASE = await shapeFlecks(LOCAL_LIGHTS ? Uint8Array.from({ length: n }, (_, i) => ((RESIST0 && RESIST0[i]) || LOCAL_LIGHTS[i] ? 1 : 0)) : RESIST0, { w, h, n, SRC: ctx.SRC, paper, SC, gaussian, image: opt('image', ''), path, num, opt, log: console.log, seed: SEED });
// --softmask: the fluid thin at each light's rim, so it lifts to a soft broken edge (src/paint/methods/soft-mask.mjs)
const RESIST_SOFT_BASE = softMask(RESIST_BASE, { w, h, n, paper, SC, gaussian, num });
if(ctx.AREA_PLAN&&MOD&&validateProductionDetails(ctx.AREA_PLAN.doc))MOD.lights=Uint8Array.from(ctx.AREA_PLAN.reserves,(v,i)=>v||ctx.AREA_PLAN.film[i]?1:0);
let { R: RESIST$, S: RESIST_SOFT } = MOD&&!ctx.AREA_PLAN ? joinResist(RESIST_BASE, RESIST_SOFT_BASE, MOD, { w, h, n, distanceToZero }) : { R: RESIST_BASE, S: RESIST_SOFT_BASE }; ctx.RESIST = RESIST$;
if(ctx.AREA_PLAN){ctx.RESIST??=new Uint8Array(n);RESIST_SOFT??=new Float32Array(n);for(let i=0;i<n;i++)if(ctx.AREA_PLAN.film[i]){ctx.RESIST[i]=1;RESIST_SOFT[i]=1;}}
if(ctx.VALUE_PLAN){
 // The same target-white mask owns planning and physical film; inferred highlights include pale painted planes.
 // --locallights cells join it: they were laid in RESIST_BASE above and would otherwise be dropped here.
 ctx.RESIST=Uint8Array.from(ctx.VALUE_PLAN.protectedCells,(v,i)=>v||LOCAL_LIGHTS?.[i]?1:0);RESIST_SOFT=Float32Array.from(ctx.RESIST);
}
// Plan reserves are already in RESIST through the value plan's protectedCells: the target's own light inside each
// box (src/paint/methods/light-reserves.mjs), not the box. Only the film record and its dry-paper check remain here.
if(ctx.VALUE_PLAN&&VALUE_CONFIG?.reserves?.length){const paper=measurePaperDry(ctx.sheet);check('essential light film requires dry paper',paper.dry,{waterMax:paper.waterMax,saturationMax:paper.saturationMax});JSONL.append(path.join(out,'value-commands.jsonl'),JSON.stringify({kind:'essential-light-film-plan',paper,operation:'real applyResist through existing union lifecycle; full strength; remove after last dry shadow',cells:'the value plan protectedCells: the target light inside each reserve box',reserves:VALUE_CONFIG.reserves})+'\n');}
const upF = f => { if (SC === 1) return f; const m = new Float32Array(N2); for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) m[y * W2 + x] = f[((y / SC) | 0) * w + ((x / SC) | 0)]; return m; };
const used = {};
const TECHS = [], LAST = new Uint8Array(n);
// --feedback: charge later passes for what the sheet lacks of each pigment, read once per pass, not what the ledger booked.
// --drawing first|detect|last|both|none: order of the line. first (default) draws in --outlinemedium, lets it dry, then washes.
// detect: draw first only if the source shows --penfirst per cent of line (default 0.5), else ink at the end. last: wash, then ink.
// both: draw first, wash, ink again. none: no line.
// --prep 1: a full preparatory drawing: no ink budget, a lower floor so fainter contours are found, and the outline pass.
const PREP = opt('prep', '0') !== '0'; ctx.PREP = PREP;
const DRAWING = PREP && opt('drawing', 'first') === 'detect' ? 'first' : opt('drawing', 'first');
if (!['detect', 'first', 'last', 'both', 'none'].includes(DRAWING)) throw new Error(`--drawing: detect, first, last, both or none, not ${DRAWING}`);
const PEN_FIRST = DRAWING === 'first' || DRAWING === 'both' ? true
  : DRAWING === 'last' || DRAWING === 'none' ? false
  : num('penfirst', 0.5) > 0 && 100 * SOURCE_INK >= num('penfirst', 0.5); ctx.PEN_FIRST = PEN_FIRST;
// `both` runs the closing pass as well, which a pen-first sheet otherwise skips
const DRAW_LAST = DRAWING === 'both' || DRAWING === 'last' || (DRAWING === 'detect' && !PEN_FIRST); ctx.DRAW_LAST = DRAW_LAST;
if (PREP) console.log(`prep: a full preparatory drawing in ${OUTLINE_MEDIUM}, every contour before any paint`);
if (DRAWING !== 'detect') console.log(`drawing order: ${DRAWING}${DRAWING === 'none' ? '' : ` in ${OUTLINE_MEDIUM}`}, set by --drawing`);
// The pen's drawing, planned before the first mark.
const PEN_PLANS = {};
if (opt('draw', '1') !== '0') {
  const PLAN_D = planDensityOfLayers();
  if (PEN_FIRST && DRAWING !== 'none') PEN_PLANS.first = await planPen(PLAN_D, { first: true });
  if (DRAW_LAST && DRAWING !== 'none') PEN_PLANS.last = await planPen(PLAN_D);
  if (opt('finish', '0') !== '0') PEN_PLANS.fine = await planPen(PLAN_D, { fine: true });
}
// --texflow d: short texture marks follow the reference's value smoothed over about 2 mm (direction only); d scales density.
if (num('texflow', 0) > 0) {
  const R = Math.max(1, Math.round(2 / (num('sheetmm', DEFAULT_SHEET_MM) / w))), L0 = Float32Array.from({ length: n }, (_, i) => .2126 * PX_RAW[3 * i] + .7152 * PX_RAW[3 * i + 1] + .0722 * PX_RAW[3 * i + 2]);
  const tmp = new Float32Array(n), Lb = new Float32Array(n);
  for (let y = 0; y < h; y++) { let a = 0, c = 0; for (let x = -R; x < w + R; x++) { if (x + R < w) { a += L0[y * w + x + R]; c++; } if (x - R - 1 >= 0) { a -= L0[y * w + x - R - 1]; c--; } if (x >= 0 && x < w) tmp[y * w + x] = a / c; } }
  for (let x = 0; x < w; x++) { let a = 0, c = 0; for (let y = -R; y < h + R; y++) { if (y + R < h) { a += tmp[(y + R) * w + x]; c++; } if (y - R - 1 >= 0) { a -= tmp[(y - R - 1) * w + x]; c--; } if (y >= 0 && y < h) Lb[y * w + x] = a / c; } }
  setTextureFlow(flowField(Lb, w, h, { minGrad: 1.5, density: num('texflow', 1) }));
  console.log(`texture flow: marks follow the ${R}-cell smoothed value contours (direction only), density x${num('texflow', 1)} per shape`);
}
// --skywarm: the warm cells (red over blue) a sky passage leaves to the ladder, read off the reference before painting
const SKY_WARM_RB = opt('skywarm', '') !== '' ? sealAtBirth(TARGET_GUARD, 'SKY_WARM_RB', Float32Array.from({ length: n }, (_, i) => PX_RAW[i * 3] - PX_RAW[i * 3 + 2])) : null;
// each passage's technique, read off the source inside it, is chosen here for the whole plan (planning, before the
// first mark), not when the brush reaches it
for (const L2 of ctx.layers) for (const sh of L2.shapes) {
  if (!(NATIVE_PAINT_MODE.mode==='fast'&&sh._valuePlan&&!WETPOL&&!MAJOR_INTENT&&!sh._semantic) && sh.mask) techniqueOf(sh);
  // Label-backed passages rebuild the same mask on demand. Keeping every expanded
  // mask here costs one full sheet per shape, even before the first stroke.
  if (sh.ids) dropMask(sh);
}
// a graded wash's sweep direction and its prewet reach (onto paper as pale as its own pale end) are read off the plan
// and the source here, before painting, not when the brush reaches the passage
for (const L2 of ctx.layers) for (const sh of L2.shapes) if (sh.graded && !sh._follow && sh.mask) {
  sh._gradedAngle = gradientSweepAngle(sh.graded, sh.mask, w, h);
  sh._prewet = prewetArea(sh.mask, ctx.SRC, w, h, { reach: Math.round(num('gradedprewet', 0.03) * Math.min(w, h)) });
  if (sh.ids) dropMask(sh);
}
// From here to phaseMark('painting') the target and its per-cell maps are closed (--targetguard, default gentle). The
// only way back to the reference is TARGET_GUARD.look: shape-level means at a peek, a review or a passage.
// --touchpoints R: once the planned passes are laid, R rounds comparing each planning shape's mean with the reference (TARGET_GUARD.look).
// A shape that reads lighter gets one corrective glaze; only deficits are glazed, nothing is read cell by cell.
const TP_ROUNDS = Math.max(0, Math.round(num('touchpoints', 0)));
ctx.TP_SHAPES = null;
if (TP_ROUNDS > 0) {
  const { planningShapes, lineMask } = await import('../../src/paint/methods/shape-refit.mjs');
  const lf = v => (!v ? null : v.includes('/') ? path.resolve(root, v + '-lines.json') : path.resolve(root, 'work/lines', v + '-lines.json'));
  const PENCELLS = lineMask([...new Set([lf(opt('drawingfile', '')), lf(opt('drawinglast', ''))])], w, h, { pad: Math.round(num('touchlinepad', 1)), fs });
  const groups = planningShapes(channelDensity(ctx.px, n, paperRGB), w, h, { families: num('touchfamilies', 24), minCells: Math.max(64, Math.round(num('touchmincells', 0.0008) * n)), pool: false, smooth: Math.round(num('touchsmoothmm', 1) / (num('sheetmm', DEFAULT_SHEET_MM) / w)) });
  ctx.TP_SHAPES = groups.map(cells => { const mask = new Uint8Array(n), look = new Uint8Array(n); for (const i of cells) { mask[i] = 1; if (!PENCELLS[i]) look[i] = 1; } const t = { mask, area: cells.length, amount: 0, mix: PIGS.map(() => 0), _look: look }; techniqueOf(t); return t; });
  console.log(`touchpoints: ${TP_ROUNDS} rounds over ${ctx.TP_SHAPES.length} planning shapes (${ctx.TP_SHAPES.reduce((a, t) => a + t.area, 0)} cells), cut before painting`);
}
// --finaldarks 1: after the touch-up rounds, one round of small decisive darks (src/paint/methods/final-darks.mjs), laid
// as marks of the detail brush's tip, accent pieces no smaller than one tip touch (final-dark-marks.mjs). The
// accent cells and their families are cut here, before painting; at the end each family gets one shape-level look.
ctx.FD_SHAPES = null;
if (num('finaldarks', 0) > 0) {
  const mmCell = (PB?.mm ?? num('sheetmm', DEFAULT_SHEET_MM)) / w, pen = new Uint8Array(n);
  for (const P of [PEN_PLANS.first, PEN_PLANS.last]) for (const g of P?.scaled ?? []) if (g.draw !== false) for (const q of g.points ?? []) {
    const x = Math.round(q.x / SC), y = Math.round(q.y / SC);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) pen[yy * w + xx] = 1; }
  }
  const cells = accentCells(channelDensity(ctx.px, n, paperRGB), w, h, { mmPerCell: mmCell, pen, darkQ: num('fdquantile', 0.9), minValue: num('fdmin', 0.45), contrast: num('fdcontrast', 0.08), surroundMm: num('fdsurroundmm', 2.5), minMm2: num('fdminmm2', tipTouchMm2(PB ? 2 * PB.detailR * PB.mmPerCell : roleBrushMm(root, 'detail', { brushes: opt('brushes', 'src/paint/brushes.json') }))) });
  const fams = accentFamilies(cells, w, h, { mmPerCell: mmCell, tileMm: num('fdtilemm', 10), minCells: 64 });
  const T0 = { name: 'wet on dry', water: 0.62, wetMix: 0.55, bridge: 0.78, bridgeSoft: 2.2, intoWet: false, dryAfter: true, passes: 1 };
  ctx.FD_SHAPES = fams.map(f => { const mask = new Uint8Array(n); for (const i of f.cells) mask[i] = 1; const t = { mask, area: f.cells.length, amount: 0, mix: PIGS.map(() => 0), _look: mask }; TECHNIQUE.set(t, T0); return t; });
  let a = 0; for (const v of cells) a += v;
  console.log(`final darks: ${a} accent cells (${(100 * a / n).toFixed(2)}% of the sheet) in ${ctx.FD_SHAPES.length} families, ${ctx.FD_SHAPES.reduce((s, t) => s + t.area, 0)} cells, cut before painting`);
}
const PREP_KEEP = num('prepfade', 0) > 0 ? up(dilate(SEP.ink, w, h, Math.round(num('prepkeep', 2)))) : null;
SPEED_PROFILE?.add('planningAndSetup', process.uptime() * 1000);
const PROVENANCE_TARGET_SHA = crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,opt('image','')))).digest('hex');
TARGET_GUARD.beginPaint(); if (TARGET_GUARD.mode !== 'off') { const sealed = sealTargetMaps(TARGET_GUARD, ctx); TARGET_GUARD.assertCleanContext('paint step', ctx); console.log(`target guard: ${TARGET_GUARD.mode}, target sealed for the paint step (also ${sealed.join(', ') || 'no other map'})`); }
if (!ctx.RESUMING && ctx.RESIST) { if(ctx.AREA_PLAN){const cells=Array.from(up(ctx.AREA_PLAN.film),(v,i)=>v?i:-1).filter(i=>i>=0);if(cells.length){const paper=measurePaper(ctx.sheet,cells);check('semantic film requires actual dry paper before apply',paper.dry,{waterMax:paper.waterMax,saturationMax:paper.saturationMax});AREA_EXEC.command('physical film apply and establish',{cells,paper,areaPassIds:ctx.AREA_PLAN.schedule.filter(s=>s.pass.lights.mode==='film').map(s=>s.key),semanticPlanned:true,establishedStrength:1,solventDryingModel:'not separately modeled'},()=>applyResist(ctx.sheet,up(ctx.RESIST),RESIST_SOFT&&upF(RESIST_SOFT)));}else applyResist(ctx.sheet,up(ctx.RESIST),RESIST_SOFT&&upF(RESIST_SOFT));}else applyResist(ctx.sheet, up(ctx.RESIST), RESIST_SOFT && upF(RESIST_SOFT)); ctx.STAGE = { stage: 'frisket', cells: ctx.RESIST.reduce((a, v) => a + v, 0) }; await shoot(); }
// The planned drawing, laid (planPen made every decision before the first mark).
// Linked stages: each stage's own layer (what it laid) and the sheet as it stands after it, as layer-<stage>.jpg and
// stage-<stage>.jpg, so the stages can be judged one at a time.
const stageShot = async (name, before) => {
  const now = thickness(ctx.sheet), raw = { raw: { width: W2, height: H2, channels: 3 } };
  const layer = now.map((a, j) => Float32Array.from(a, (v, i) => Math.max(0, v - (before ? before[j][i] : 0))));
  await sharp(Buffer.from(renderLayers([layer], SHEET_PIGS, base, N2, 1).buffer), raw).jpeg({ quality: 90 }).toFile(path.join(out, `layer-${name}.jpg`));
  await sharp(view(), raw).jpeg({ quality: 90 }).toFile(path.join(out, `stage-${name}.jpg`));
};
// The prep stage: the pencil placement, laid dry and light before the first pen, in three passes (big shapes light, then
// the features with the big shapes restated, then the detail), each filmed (pencil-stage.mjs pencilBatches). Its lines
// carry their pass as `rank` (drawing-stages.mjs). Pressure is a share of the pencil's opening cap.
async function drawPrepStage(PEN) {
  const doc = JSON.parse(fs.readFileSync(STAGE_PLAN.files.prep + '-lines.json', 'utf8'));
  const sx = W2 / doc.image.w, sy = H2 / doc.image.h, P0 = drawingCapsFor('opening', true).pressure;
  const strokes = doc.lines.map(g => ({ rank: g.rank ?? 1, points: g.points.map(([x, y], k) => ({ x: x * sx, y: y * sy, s: P0 * Math.max(0.15, Math.min(1, g.weights?.[k] ?? g.weight ?? 1)) })) }));
  const batches = pencilBatches(strokes, { frames: String(opt('prepframes', '3,2,2')).split(',').map(Number), first: num('prepfirst', 0.45) });
  const want = new Float32Array(N2).fill(1), before = thickness(ctx.sheet).map(a => Float32Array.from(a));
  let drawn = 0;
  for (const [bi, b] of batches.entries()) {
    for (const q of b.parts) { const r = clock('strokes', () => penDraw(ctx.sheet, q.strokes.map(g => ({ ...g, points: g.points.map(p => ({ ...p, s: p.s * q.gain })) })), want, W2, H2, { ink: SHEET_PIGS.map((_, j) => (j === GRAPHITE_AT ? 1 : 0)), pen: PEN, O, peak: 1 })); drawn += r.drawn ?? 0; }
    ctx.STAGE = { stage: 'prep', step: `pencil ${b.name}`, batch: bi + 1, of: batches.length };
    await shoot();
  }
  ctx.drawnCount += drawn; ctx.prepDrawn += drawn;
  console.log(`prep stage: ${strokes.length} pencil lines in ${batches.length} frames (${[0, 1, 2].map(p => `${['big shapes', 'features', 'detail'][p]} ${strokes.filter(g => (g.rank === 1 ? 0 : g.rank === 2 ? 1 : 2) === p).length}`).join(', ')}), ${drawn} strokes laid`);
  await stageShot('prep', before);
}
async function drawPass(_unused, { first = false, fine = false } = {}) {
  const speedDrawStart = performance.now();
  try {
  const PLAN = PEN_PLANS[first ? 'first' : fine ? 'fine' : 'last'];
  if (!PLAN) throw new Error('drawing: this pen pass was not planned before painting');
  const { preparing, PEN, K, graphiteFirst, inkPig, scaled, wantT1, big, peak, inkVerdict, frozenPeak, per, SELECTED, outlines, gestures } = PLAN;
  ctx.VALUE_ACTIVE=null;
  ctx.AREA_DRAW_STAGE=first?'opening':'closing';
  if (first && STAGE_PLAN?.files.prep && GRAPHITE) await drawPrepStage(PEN);
  const stageBefore = STAGE_PLAN && !fine ? thickness(ctx.sheet).map(a => Float32Array.from(a)) : null;
  // --penoutline (pen first only, default on): the main shapes' outlines first, so the drawing alone states the subject.
  if (first && PREP && GRAPHITE && ANCHORS) {
    const points=Object.fromEntries(ANCHORS.landmarks.map(a=>[a.id,{x:a.painting[0]*W2/ANCHORS.canvas[0],y:a.painting[1]*H2/ANCHORS.canvas[1]}]));
    const skeleton=Object.entries(ANCHORS.curves).filter(([name])=>/eye_axis|face_axis|jaw_planes|ear_near|ear_far/.test(name)).map(([,ids])=>({points:ids.map(id=>points[id])}));
    const constructionWant=new Float32Array(N2).fill(.3);
    penDraw(ctx.sheet,skeleton,constructionWant,W2,H2,{ink:SHEET_PIGS.map((_,j)=>j===GRAPHITE_AT?.65:0),pen:{...PEN,nib:.45*K},O,peak:1});
    ctx.STAGE={stage:'construction',anchors:true}; await shoot();
  }
  if (outlines) {
    const wantO = new Float32Array(N2).fill(num('outlinewant', 0.6));
    const perO = Math.max(1, Math.ceil(outlines.length / 4));
    for (let k = 0; k < outlines.length; k += perO) {
      const outlinePig = GRAPHITE ? GRAPHITE_AT : inkPig, outlineConc = GRAPHITE ? (STYLE_ON()?3*ctx.VALUE_PLAN.style.graphite:num('graphiteconc', 3)) : INKLOAD();
      const r0 = clock('strokes', () => penDraw(ctx.sheet, outlines.slice(k, k + perO).filter(g => g.draw), wantO, W2, H2, { ink: SHEET_PIGS.map((_, j) => (j === outlinePig ? outlineConc : 0)), pen: PEN, O, peak: 1 }));
      ctx.drawnCount += r0.drawn;
      ctx.STAGE = { stage: first ? (GRAPHITE && !PENCIL ? 'prep' : 'pen') : 'ink', step: 'outlines', batch: 0, of: Math.ceil(scaled.length / Math.max(1, Math.ceil(scaled.length / 8))), outline: true };
      // under --filmby paint the outline pass is filmed twice, halfway and at its end, so the pen shows in the film
      const ob = k / perO + 1, ofO = Math.ceil(outlines.length / perO);
      if (!FILM_BY_PAINT || ob === ofO || ob === Math.ceil(ofO / 2)) await shoot();
    }
    const drew = outlines.filter(g => g.draw);
    console.log(`pen outline: ${drew.length} outlines${drew.length === outlines.length ? '' : ` of ${outlines.length}`}, ${drew.reduce((a, g) => a + g.points.length, 0)} points`);
  }
  // --pencilstage 1: the pencil drawing in three passes, big shapes light first, then the features, then the detail,
  // each filmed over several frames (pencil-stage.mjs); the loop below is skipped
  if (PENCIL_STAGE && first && SELECTED) {
    const batches = pencilBatches(scaled.filter(g => g.tier === 1 && g.draw !== false), { frames: String(opt('pencilframes', '4,3,3')).split(',').map(Number), first: num('pencilfirst', 0.45) });
    console.log(`pencil stage: ${[0, 1, 2].map(p => `${['big shapes', 'features', 'detail'][p]} ${batches.filter(b => b.pass === p).reduce((a, b) => a + b.parts.reduce((c, q) => c + q.strokes.length, 0), 0)} strokes in ${batches.filter(b => b.pass === p).length} frames`).join(', ')}`);
    for (const [bi, b] of batches.entries()) {
      if (!PENCIL) for (const q of b.parts) { const r1 = clock('strokes', () => penDraw(ctx.sheet, q.strokes, wantT1, W2, H2, { ink: SHEET_PIGS.map((_, j) => (j === inkPig ? INKLOAD() * q.gain : 0)), pen: PEN, O, peak: 1 })); ctx.drawnCount += r1.drawn; }
      if (PENCIL) for (const q of b.parts) { const r1 = clock('strokes', () => pencilDraw(ctx.sheet, q.strokes, GRAPHITE_AT, { amount: PENCIL.pig.strength * num('pencilgain', 1) * q.gain, pressureReference: num('pencilpressure', 0) > 0 ? num('pencilpressure', 0) : null, width: num('pencilw', 1.2) * SC, vary: num('pencilvary', 0.35), tooth: num('penciltooth', 0.4), seed: SEED + 31 * bi + (q.gain < 1 ? 7 : 0) })); ctx.drawnCount += r1.drawn; }
      ctx.STAGE = { stage: 'pen', step: `pencil ${b.name}`, batch: bi + 1, of: batches.length };
      await shoot();
    }
  }
  for (let k = 0; k < (PENCIL_STAGE && first && SELECTED ? 0 : scaled.length); k += per) {
    const batch = scaled.slice(k, k + per), main = batch.filter(g => !g.outline && g.tier !== 1), thin = batch.filter(g => g.outline);
    const first1 = batch.filter(g => g.tier === 1);
    const peakMain = peak ?? (inkVerdict ? frozenPeak(main) : null), peakThin = peak ?? (inkVerdict ? frozenPeak(thin) : null);
    const drawMain = inkVerdict ? main.filter(g => g.draw) : main, drawThin = inkVerdict ? thin.filter(g => g.draw) : thin;
    const drawT1 = inkVerdict ? first1.filter(g => g.draw) : first1;
    if (drawT1.length && PENCIL && first && SELECTED) { const r1 = clock('strokes', () => pencilDraw(ctx.sheet, drawT1, GRAPHITE_AT, { amount: PENCIL.pig.strength * num('pencilgain', 1), pressureReference: num('pencilpressure', 0) > 0 ? num('pencilpressure', 0) : null, width: num('pencilw', 1.2) * SC, vary: num('pencilvary', 0.35), tooth: num('penciltooth', 0.4), seed: SEED + k })); ctx.drawnCount += r1.drawn; }
    else if (drawT1.length) { const r1 = clock('strokes', () => penDraw(ctx.sheet, drawT1, wantT1, W2, H2, { ink: SHEET_PIGS.map((_, j) => (j === inkPig ? (graphiteFirst && !preparing ? (STYLE_ON()?3*ctx.VALUE_PLAN.style.graphite:num('graphiteconc', 3)) : INKLOAD()) : 0)), pen: PEN, O, peak: 1 })); ctx.drawnCount += r1.drawn; }
    // --mlwant: a line from the learned map is drawn at a constant pressure, like the outline tier (ml-lines.mjs)
    const mlWant = ML_LINES ? ML_LINES.want : 0;
    const drawML = mlWant ? drawMain.filter(g => g.ml) : [], drawRest = mlWant ? drawMain.filter(g => !g.ml) : drawMain;
    if (drawML.length) { const wantML = new Float32Array(N2).fill(mlWant); const rm = clock('strokes', () => penDraw(ctx.sheet, drawML, wantML, W2, H2, { ink: SHEET_PIGS.map((_, j) => (j === inkPig ? (graphiteFirst && !preparing ? (STYLE_ON()?3*ctx.VALUE_PLAN.style.graphite:num('graphiteconc', 3)) : INKLOAD()) : 0)), pen: PEN, O, peak: 1 })); ctx.drawnCount += rm.drawn; }
    const r = clock('strokes', () => penDraw(ctx.sheet, drawRest, big, W2, H2, { ink: SHEET_PIGS.map((_, j) => (j === inkPig ? (graphiteFirst && !preparing ? (STYLE_ON()?3*ctx.VALUE_PLAN.style.graphite:num('graphiteconc', 3)) : INKLOAD()) : 0)), pen: PEN, O, peak: peakMain }));
    if (drawThin.length) { const r2 = clock('strokes', () => penDraw(ctx.sheet, drawThin, big, W2, H2, { ink: SHEET_PIGS.map((_, j) => (j === inkPig ? (graphiteFirst ? (STYLE_ON()?3*ctx.VALUE_PLAN.style.graphite:num('graphiteconc', 3)) : num('outlineconc', 6.5)) : 0)), pen: PEN, O, peak: peakThin })); ctx.drawnCount += r2.drawn; }
    ctx.drawnCount += r.drawn;
    ctx.STAGE = { stage: first ? (GRAPHITE && !PENCIL ? 'prep' : 'pen') : 'ink', step: fine ? 'fine' : 'gestures', batch: k / per + 1, of: Math.ceil(scaled.length / per) };
    // under --filmby paint the pen is filmed about PEN_FRAMES times, the last batch always
    const ofB = Math.ceil(scaled.length / per), bi = k / per + 1;
    if (!FILM_BY_PAINT || bi === ofB || bi % Math.max(1, Math.round(ofB / PEN_FRAMES)) === 0) await shoot();
  }
  clock('dry', () => dry(ctx.sheet, 20000, O, { levelMax: 200 }));
  if (stageBefore && (first ? STAGE_PLAN.files.prepInk && STAGE_PLAN.stages.prepInk : STAGE_PLAN.files.finishInk)) await stageShot(first ? 'prepink' : 'finishink', stageBefore);
  if (INKRES) { INKRES.settle(); console.log(`inkres ${INKRES.N}: the pens on a ${INKRES.width} x ${INKRES.height} sheet, ${INKRES.stats.calls} calls, ${(INKRES.stats.ms / 1000).toFixed(1)} s so far`); }
  console.log(`drawing: ${ctx.drawnCount} pen gestures${ctx.prepDrawn ? ` (${ctx.prepDrawn} of them the prep pencil, in pigment ${GRAPHITE_AT})` : ''} in pigment ${inkPig}, long share ${longShare(gestures, w).toFixed(2)}`);
  } finally { SPEED_PROFILE?.add('drawing', performance.now() - speedDrawStart); }
}
ctx.INK_THK = null; ctx.WASH_THK = null;
if (!ctx.RESUMING && PEN_FIRST && opt('draw', '1') !== '0' && DRAWING !== 'none') {
  console.log(`pen first: source line ${(100 * SOURCE_INK).toFixed(1)}% of cells`);
  const before = thickness(ctx.sheet).map(a => Float32Array.from(a));
  await drawPass(null, { first: true });
  if (PREP_ERASE && STAGE_PLAN?.files.prep && GRAPHITE) erasePrep({ sheet: ctx.sheet, k: GRAPHITE_AT, dabs: PREP_ERASE, strength: num('preperase', 0.85), SC, w, W2, layersChanged, log: console.log });
  ctx.INK_THK = thickness(ctx.sheet).map((a, j) => Float32Array.from(a, (v, i) => Math.max(0, v - before[j][i])));
  await sharp(INKRES ? INKRES.compose(view()) : render(), { raw: { width: OUT_W, height: OUT_H, channels: 3 } }).png().toFile(path.join(out, 'drawing-opening.png'));
  if (PENWASH_PLAN) {
    // the flat plan over the actual dry ink, multiplied as a transparent wash would sit on it
    const ink = render(), flat = penWashFlat(), mix = Buffer.alloc(N2 * 3);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) { const i = y * W2 + x, j = ((y / SC) | 0) * w + ((x / SC) | 0); for (let c = 0; c < 3; c++) mix[i * 3 + c] = Math.round(ink[i * 3 + c] * flat[j * 3 + c] / Math.max(1, paperRGB[c])); }
    await sharp(mix, { raw: { width: W2, height: H2, channels: 3 } }).png().toFile(path.join(out, 'penwash-preview.png'));
    if (ctx.PENWASH_LINES) fs.writeFileSync(path.join(out, 'penwash-lines.json'), JSON.stringify(ctx.PENWASH_LINES, null, 2));
  }
}
// An actual dry-pen checkpoint, using the same planned strokes and physics as
// the full painting. The process exit hook still writes the strict guard report.
if (num('drawingonly', 0) > 0) {
  // --copylinesfloor can leave a source with no pen lines; its dry opening is the bare sheet
  const noPenLines = DRAWING === 'none' && EARLY_LINES?.source === 'none' && EARLY_LINES?.requested === 'source-ink';
  if (ctx.RESUMING || (!noPenLines && (!PEN_FIRST || opt('draw', '1') === '0' || DRAWING === 'none'))) throw new Error('--drawingonly requires an opening drawing');
  assertDeviceHealthy(ctx.sheet);
  if (noPenLines) await sharp(render(), { raw: { width: W2, height: H2, channels: 3 } }).png().toFile(path.join(out, 'painting.png'));
  else fs.copyFileSync(path.join(out, 'drawing-opening.png'), path.join(out, 'painting.png'));
  fs.writeFileSync(path.join(out, 'pen-state-audit.json'), JSON.stringify(PEN_STATE_AUDIT));
  fs.writeFileSync(path.join(out, 'drawing-checkpoint.json'), JSON.stringify({ stage: 'dry opening drawing', paintExecuted: false, gestures: ctx.drawnCount, backend: GPU_INFO }));
  await drainFrames(); if (ctx.FRAMER) ctx.FRAMER.close(); ctx.sheet._gpu?.close();
  console.log('drawing-only: dry opening complete, before washes'); process.exit(0);
}
if(MAJOR_INTENT)await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'major-drawing-opening.png'));
// A semantic run records the real preparation before washes obscure it; guide and trace stay separate source artifacts.
if(ctx.AREA_PLAN && PEN_FIRST && opt('draw','1')!=='0' && DRAWING!=='none'){
  const guide=opt('penpencil',''),base=opt('drawingfile','');
  const traceFile=base?path.resolve(root,'work/lines',base+'-lines.json'):null;
  await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'semantic-drawing-opening.png'));
  fs.writeFileSync(path.join(out,'semantic-drawing-opening.json'),JSON.stringify({
   kind:'actual production opening drawing before washes; not artistic acceptance',
   target:ctx.AREA_PLAN.doc.target,planSHA256:sha256(path.resolve(root,AREA_FILE||FINISH_FILE)),
   guide:guide?{path:path.resolve(root,guide),sha256:sha256(path.resolve(root,guide))}:null,
   trace:traceFile&&fs.existsSync(traceFile)?{path:traceFile,sha256:sha256(traceFile)}:null,
   material:PENCIL?'physical dry graphite':'existing production outline material',
   drawingCommands:AREA_EXEC.records.filter(r=>r.operation==='actual dry graphite'||r.operation==='physical pen gesture'),
   prepfadeRequested:num('prepfade',0)>0,closingInkExecuted:false,paintExecuted:false,backend:GPU_INFO
  },null,2));
}
if(opt('areastop','')==='drawing-opening'){
 if(!ctx.AREA_PLAN||!PEN_FIRST||opt('draw','1')==='0'||DRAWING==='none')throw new Error('drawing-opening requires semantic physical opening drawing');
 await drainFrames();if(ctx.FRAMER)ctx.FRAMER.close();ctx.sheet._gpu?.close();console.log('semantic drawing-opening checkpoint before paint');process.exit(0);
}
// Bounded material proof after actual opening drawing and ordinary dry, not preparation.
if(process.env.PHASE_EXIT==='drawing-material-opening'){
  if(!PEN_FIRST || !PENCIL || DRAWING==='none' || opt('draw','1')==='0')
    throw new Error('drawing-material-opening requires actual dry graphite opening via --penpencil');
  fs.writeFileSync(path.join(out,'pen-state-audit.json'),JSON.stringify(PEN_STATE_AUDIT,null,2));
  await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'graphite-opening-ordinary-dried.png'));
  await drainFrames();if(ctx.FRAMER)ctx.FRAMER.close();
  fs.writeFileSync(path.join(out,'drawing-material-opening.json'),JSON.stringify({stage:'actual dry graphite opening after ordinary dry',preparationBinding:opt('preparationbinding','')||null,graphiteCommands:(num('recordgraphite',0)>0||opt('preparationbinding',''))?'preparation-graphite.jsonl':null,graphiteRecordScope:num('recordgraphite',0)>0?'All actual executed production opening batches; geometry selection unchanged':null,guide:opt('penpencil',''),drawing:opt('drawingfile',''),pressureReference:num('pencilpressure',0)||null,prepfadeExecuted:false,closingInkExecuted:false,paintExecuted:false,backend:GPU_INFO},null,2));
  ctx.sheet._gpu?.close();phaseMark('drawing-material-opening');
}
// --prepfade 1: the opening drawing recedes as the washes cover it (pencil-stage.mjs prepFade): its pigment is the
// graphite when the first pen drew in pencil, else the separate ink, which the closing pen uses only once the washes are down
const PREPF = num('prepfade', 0) > 0 && PEN_FIRST && DRAWING !== 'none' ? (() => {
  const k = GRAPHITE && (STAGE_PLAN?.files.prep || OUTLINE_MEDIUM === 'graphite' || PENCIL || opt('firstpen', 'ink') === 'graphite') ? GRAPHITE_AT : INK ? PIGS.length : -1;
  if (k < 0) { console.log('prep fade: the first pen drew in a wash pigment, nothing to fade'); return null; }
  const keep = PREP_KEEP;
  console.log(`prep fade: pigment ${k}, ${ctx.sheet.layers.length} layers hold the drawing, ${(100 * keep.reduce((a, v) => a + (v ? 1 : 0), 0) / N2).toFixed(1)}% of the sheet kept as the finish's line`);
  return { k, upto: ctx.sheet.layers.length, keep, applied: new Float32Array(N2).fill(1), kk: PIGS.map(p => (p.K[0] + p.K[1] + p.K[2]) / 3 / 0.55) };
})() : null;
// Install only after opening/prep calibration. Keep every plane a pending fade,
// pencil erase or resist removal may edit; GPU archive placeholders are excluded by the compactor.
ctx.sheet._layerStoragePolicy = () => ({from:Math.max(1,PREPF?.upto??1),
  retainPigments:num('pencilerase',0)>0?[GRAPHITE_AT]:[]});
const fadePrep = () => {
  if (!PREPF) return 0;
  ctx.sheet._gpu?.syncLower(ctx.sheet, process.env.GPU_COMPOSITE === '1' ? PREPF.upto : Infinity);
  const P = PIGS.length, paint = new Float32Array(n);
  for (let i = 0; i < n; i++) { let v = 0; for (let j = 0; j < P; j++) v += expected[i * P + j] * PREPF.kk[j]; paint[i] = v; }
  const planes = [ctx.sheet.G[PREPF.k], ctx.sheet.D[PREPF.k], ctx.sheet.P[PREPF.k], ...ctx.sheet.layers.slice(0, PREPF.upto).map(L => L[PREPF.k])];
  const faded = prepFade(planes, PREPF.applied, PREPF.keep, paint, { under: num('prepunder', 0.7), clean: num('prepclean', 0.1), SC, w, W2 });
  layersChanged(ctx.sheet, ctx.sheet.layers.slice(0, PREPF.upto)); // it scaled dried layers in place: the cached sums of them are stale
  return faded;
};
const mopLanes = makeMopLanes({ num });
const setStage = s => { ctx.STAGE = s; };
if (PENWASH_PLAN) {
  const r = await paintPenWash({
    createBrush, stroke, step, dry, thickness, sheet: ctx.sheet, w, h, n, W2, H2, PIGS, O, SEED, UPRIGHT, CAL, WET, mopLanes, handAngle, flowEvery, dip, up, clock, shoot, setStage, num, log: console.log, expected, used,
    mmPerCell: num('sheetmm', DEFAULT_SHEET_MM) / W2,
    checkpoint: async (k, id) => sharp(render(), { raw: { width: W2, height: H2, channels: 3 } }).png().toFile(path.join(out, `penwash-${String(k).padStart(2, '0')}-${id}.png`)),
  }, PENWASH_PLAN);
  ctx.laid += r.laid;
  fs.writeFileSync(path.join(out, 'penwash-run.json'), JSON.stringify({ passages: r.records, lines: ctx.PENWASH_LINES }, null, 2));
}
Object.assign(ctx, { up, t0, spent, PROF, prof, handAngle, flowEvery, SHAPE_LOAD_BUFFER, brushMask, FILM_MASS, FW, 
  isFirst, FILM_FRAMES, used, TECHS, LAST, DRAWING, SKY_WARM_RB, TP_ROUNDS, PROVENANCE_TARGET_SHA, PREPF, 
  fadePrep, mopLanes, setStage });
}
