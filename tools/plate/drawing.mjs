// The order of work, reserves, the drawing passes and the preparation stage.
// Stage 5 of 7 of tools/paint-plate.mjs. The stages run in order and share one object, ctx: see the entry file.
import {check} from '../../src/media/checks.mjs';
import {setTextureFlow, flowField} from '../../src/paint/techniques/shaped-marks.mjs';
import {DEFAULT_SHEET_MM} from '../../src/media/sheet-size.mjs';
import {measurePaperDry} from '../../src/paint/methods/wetdry.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {step, thickness, layersChanged} from '../../src/media/sheet.mjs';
import {assertDeviceHealthy} from '../../src/media/gpu/device-health.mjs';
import {renderLayers} from '../../src/media/km.mjs';
import {channelDensity} from '../../src/crop/pigments.mjs';
import {roleBrushMm} from '../../src/paint/methods/brush-footprint.mjs';
import {dropMask} from '../../src/crop/blockin.mjs';
import {brushedWashPaths, sweepCover, containPaths, gradientSweepAngle, prewetArea} from '../../src/media/wash.mjs';
import {pencilBatches, prepFade} from '../../src/paint/methods/pencil-stage.mjs';
import {renderInkProof} from '../../src/paint/methods/ink-res.mjs';
import {layVectors, inkForDarkness} from '../../src/paint/methods/ink-vectors.mjs';
import {drawingBatches, drawingTimeMm, bigFormsFirst} from '../../src/paint/methods/drawing-film.mjs';
import {coherent} from '../../src/media/sheet.mjs';
import {components, removeSmall, dilate, erode} from '../../src/raster.js';
import {gaussian} from '../../src/keyframes/density.mjs';
import {applyResist} from '../../src/media/sheet.mjs';
import {longShare} from '../../src/crop/gestures.mjs';
import {fillReserved} from '../../src/crop/lights.mjs';
import {erasePrep} from '../../src/paint/methods/pencil-erase.mjs';
import {followErase} from '../../src/paint/methods/fine-erase.mjs';
import {strokesToLay} from '../../src/paint/methods/drawing-default.mjs';
import {planPhases, phaseRunner} from './drawing-phases-run.mjs';
import {makeMopLanes} from '../../src/paint/methods/mop-lanes.mjs';
import {sealAtBirth, sealTargetMaps} from '../guard/seal-maps.mjs';

export async function drawing(ctx) {
const { JSONL, opt, num, measurePaper, liftResist, SPEED_PROFILE, root, out, 
  VALUE_CONFIG, phaseMark, PX_RAW, TARGET_GUARD, w, h, n, createBrush, 
  ANCHORS, paperRGB, PIGS, LIGHT_CELLS, SMALL, setClip, SEP, 
  PREP_ERASE, STAGE_PLAN, STYLE_ON, INKLOAD, OUTLINE_MEDIUM, INK, PENCIL, PENCIL_STAGE, GRAPHITE, SHEET_PIGS, 
  GRAPHITE_AT, dry, dip, stroke, pencilDraw, SC, W2, H2, N2, PB, paper, INKRES, 
  PEN_STATE_AUDIT, drawingCapsFor, penDraw, OUT_W, OUT_H, O, GPU_INFO, base, render, view, BRUSH, UPRIGHT, 
  highlights, expected, sheetDensity, drainFrames, mark, WET, CAL, snap, shoot, FILM_BY_PAINT, PEN_FRAMES, 
  SOURCE_INK, planPen, FRAME_POLICY } = ctx;
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
// each passage's booking as planned, before the finish field clips it, so the film's shares add up to the plan's mass
const FILM_MASS = new WeakMap(); for (const L2 of ctx.layers) for (const sh of L2.shapes) FILM_MASS.set(sh, sh.amount * sh.area);
const FILM_FRAMES = Math.max(1, Math.round(num('frames', 40)));
const DRAWING_FILM_FRAMES = Math.max(1, Math.round(num('drawingfilm', 0.2) * FILM_FRAMES));
// --drawingorder forms|file (default forms): the order the drawing's strokes are laid in on film. forms: big forms first,
// detail last, over the whole sheet (drawing-film.mjs bigFormsFirst); file: the file's own order (form by form).
const DRAWING_ORDER = opt('drawingorder', 'forms');
if (!['forms', 'file'].includes(DRAWING_ORDER)) throw new Error(`--drawingorder: forms or file, not ${DRAWING_ORDER}`);
ctx.filmPass = 0;
// under --smalllights the fluid goes on the small lights too, whether or not the big lights were worth masking
// (--lightresist 0, a probe: the plan and the brush leave the lights out, and nothing seals them)
const FLUID = SMALL && opt('lightresist', '1') !== '0' ? SMALL : null;
// --resistmin s: masking fluid only on lights of at least s of the sheet's cells; a masked speck dries as a rimmed hole. Default 0.
const bigLights = (mask, min) => (min > 0 ? removeSmall(mask, w, h, Math.round(min * n)) : mask);
const RESIST0 = FLUID ? Uint8Array.from(FLUID, (v, i) => (v || (ctx.masked > n * 0.01 && highlights[i]) ? 1 : 0)) : ctx.masked > n * 0.01 ? bigLights(highlights, num('resistmin', 0)) : null;
const RESIST_BASE = RESIST0;
const RESIST_SOFT_BASE = null;
let RESIST_SOFT = RESIST_SOFT_BASE; ctx.RESIST = RESIST_BASE;
if(ctx.VALUE_PLAN?.protectedCells){
 // The same target-white mask owns planning and physical film; inferred highlights include pale painted planes.
 ctx.RESIST=Uint8Array.from(ctx.VALUE_PLAN.protectedCells);RESIST_SOFT=Float32Array.from(ctx.RESIST);
}
// Plan reserves are already in RESIST through the value plan's protectedCells: the target's own light inside each
// box (src/paint/methods/light-reserves.mjs), not the box. Only the film record and its dry-paper check remain here.
if(ctx.VALUE_PLAN&&VALUE_CONFIG?.reserves?.length){const paper=measurePaperDry(ctx.sheet);check('essential light film requires dry paper',paper.dry,{waterMax:paper.waterMax,saturationMax:paper.saturationMax});JSONL.append(path.join(out,'value-commands.jsonl'),JSON.stringify({kind:'essential-light-film-plan',paper,operation:'real applyResist through existing union lifecycle; full strength; remove after last dry shadow',cells:'the value plan protectedCells: the target light inside each reserve box',reserves:VALUE_CONFIG.reserves})+'\n');}
const upF = f => { if (SC === 1) return f; const m = new Float32Array(N2); for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) m[y * W2 + x] = f[((y / SC) | 0) * w + ((x / SC) | 0)]; return m; };
const used = {};
const TECHS = [], LAST = new Uint8Array(n);
// --feedback: charge later passes for what the sheet lacks of each pigment, read once per pass, not what the ledger booked.
// --drawing first|last|both|none: order of the line. first (default) draws in --outlinemedium, lets it dry, then washes.
// last: wash, then ink.
// both: draw first, wash, ink again. none: no line.
// --prep 1: a full preparatory drawing: no ink budget, a lower floor so fainter contours are found, and the outline pass.
const PREP = opt('prep', '0') !== '0'; ctx.PREP = PREP;
const DRAWING = opt('drawing', 'first');
if (!['first', 'last', 'both', 'none'].includes(DRAWING)) throw new Error(`--drawing: first, last, both or none, not ${DRAWING}`);
const PEN_FIRST = DRAWING === 'first' || DRAWING === 'both'; ctx.PEN_FIRST = PEN_FIRST;
// `both` runs the closing pass as well, which a pen-first sheet otherwise skips
const DRAW_LAST = DRAWING === 'both' || DRAWING === 'last'; ctx.DRAW_LAST = DRAW_LAST;
if (PREP) console.log(`prep: a full preparatory drawing in ${OUTLINE_MEDIUM}, every contour before any paint`);
console.log(`drawing order: ${DRAWING}${DRAWING === 'none' ? '' : ` in ${OUTLINE_MEDIUM}`}, set by --drawing`);
// The pen's drawing, planned before the first mark.
const PEN_PLANS = {};
if (opt('draw', '1') !== '0') {
  const PLAN_D = planDensityOfLayers();
  if (PEN_FIRST && DRAWING !== 'none') PEN_PLANS.first = await planPen(PLAN_D, { first: true });
  if (DRAW_LAST && DRAWING !== 'none') PEN_PLANS.last = await planPen(PLAN_D);
}
// The opening drawing's phases (drawing-phases.mjs): which of its lines go down before the first washes and which
// with the painting's later washes, planned here from the drawing and the plan, before the first mark.
if (opt('draw', '1') !== '0' && PEN_FIRST && DRAWING !== 'none' && vectorFile('drawingfile')) {
  const V = ctx.OPENING_VECTORS = chosenVectors(vectorFile('drawingfile'));
  const P = planPhases({ layers: ctx.layers, w, h, sheetMm: PB?.mm ?? num('sheetmm', DEFAULT_SHEET_MM), strokes: V.doc.strokes, penLed: V.doc.medium !== 'pencil', washSession: ctx.WASH_SESSION ?? 0 });
  for (const m of P.warnings) console.log(`!!! drawing phases: ${m}`);
  console.log(`drawing phases: ${P.opening.length} of ${V.doc.strokes.length} lines before the first washes, ${P.phases.length} later phases (${Object.entries(P.why).map(([k, v]) => `${v} ${k}`).join('; ')})`);
  if (P.phases.length) {
    ctx.DRAWING_PHASES = P;
    ctx.DRAWING_PHASE_RUN = phaseRunner(P, { sheet: () => ctx.sheet, measurePaperDry, dry: () => clock('dry', () => dry(ctx.sheet, 30000, O, { levelMax: 140, dt: 2 })),
      inkres: INKRES, out, log: m => console.log(m), onLaid: k => ctx.onDrawingPhase?.(k) });
  }
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
const PREP_KEEP = num('prepfade', 0) > 0 ? up(dilate(SEP.ink, w, h, Math.round(num('prepkeep', 2)))) : null;
SPEED_PROFILE?.add('planningAndSetup', process.uptime() * 1000);
const PROVENANCE_TARGET_SHA = crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,opt('image','')))).digest('hex');
TARGET_GUARD.beginPaint(); if (TARGET_GUARD.mode !== 'off') { const sealed = sealTargetMaps(TARGET_GUARD, ctx); TARGET_GUARD.assertCleanContext('paint step', ctx); console.log(`target guard: ${TARGET_GUARD.mode}, target sealed for the paint step (also ${sealed.join(', ') || 'no other map'})`); }
if (!ctx.RESUMING && ctx.RESIST) { applyResist(ctx.sheet, up(ctx.RESIST), RESIST_SOFT && upF(RESIST_SOFT)); ctx.STAGE = { stage: 'frisket', cells: ctx.RESIST.reduce((a, v) => a + v, 0) }; await shoot(); }
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
// A prepared drawing fitted as vector strokes (tools/seg/ink-vectors.py, <drawingfile>-vectors.json beside the line file)
// is laid exactly: each stroke's outline rasterised on the pen's sheet and inked to the drawing's own darkness, stroke by
// stroke in the drawing's order. The vectors are the recording (copied to ink-vectors.json): the replay advances each
// stroke along its path.
function vectorFile(key = 'drawingfile') {
  const base = opt(key, '');
  if (!base) return null;
  const f = (base.endsWith('-lines.json') ? base.slice(0, -'-lines.json'.length) : base) + '-vectors.json';
  return fs.existsSync(f) ? f : null;
}
// What a drawing file lays: an author's choice exactly, else Auto's default from the drawing's medium and tags
// (drawing-default.mjs; the line file beside the vectors gives each line's importance, which Auto's pencil lay-in reads)
function chosenVectors(file) {
  const bytes = fs.readFileSync(file), whole = JSON.parse(bytes.toString('utf8'));
  const linesFile = file.replace(/-vectors\.json$/, '-lines.json'), lines = fs.existsSync(linesFile) ? JSON.parse(fs.readFileSync(linesFile, 'utf8')) : null;
  const TM = ctx.THING_MASKS, forms = TM ? { width: TM.width, height: TM.height, ids: TM.ids, list: TM.names.map((name, i) => ({ id: i + 1, name, kind: TM.kinds[i] })) } : null;
  const chosen = strokesToLay(whole, lines, forms);
  return { file, bytes, whole, chosen, doc: { ...whole, strokes: chosen.strokes } };
}
// The hand that lays a drawing file's strokes: lay(strokes) lays them, a pencil drawing in graphite, an ink drawing in
// ink (its strokes marked graphite, its pencil lay-in, in graphite first), each on the fine sheet when there is one
// (--inkres: set for a pencil drawing as for a pen's, ink-recipe.mjs drawingInkRes), carried down onto the painting's
// sheet. With the film on, each call is laid and filmed as a hand draws: big forms first, detail last
// (--drawingorder), a few strokes to a frame at equal shares of the hand's time (drawing-film.mjs). --drawingfilm s
// (default 0.2): the whole opening drawing's frames as a share of the washes' --frames, wherever its phases fall; a
// closing pen is filmed at the same pace. What is laid is the same as in one step.
function vectorHand(V, { closing = false } = {}) {
  const { file, doc } = V, sheetMm = PB?.mm ?? num('sheetmm', DEFAULT_SHEET_MM);
  if (Math.abs(doc.sheetMm - sheetMm) > 0.01 * sheetMm) throw new Error(`ink vectors: ${path.basename(file)} is for a ${doc.sheetMm} mm sheet, this sheet is ${sheetMm} mm`);
  const pencil = doc.medium === 'pencil';
  if (pencil && !GRAPHITE) throw new Error(`ink vectors: ${path.basename(file)} is a pencil drawing but this run has no graphite (--outlinemedium graphite)`);
  const onFine = c => Boolean(INKRES && INKRES.channels.includes(c)), chan = pencil ? GRAPHITE_AT : PIGS.length;
  const fineSheet = onFine(chan);
  const sheetOf = () => (fineSheet ? INKRES.fine : ctx.sheet), w = fineSheet ? INKRES.width : W2, h = fineSheet ? INKRES.height : H2, at = fineSheet ? INKRES.channel(chan) : chan;
  const white = Buffer.alloc(3, 255);
  const darkOf = t => { const ink = renderLayers([[Float32Array.of(t)]], [sheetOf().pigments[at]], white, 1, 1); return 1 - (ink[0] + ink[1] + ink[2]) / 765; };
  // --inkfill (0..1, default 1: the drawing is laid exactly as drawn, under paint too). Below 1 a FILL stroke (a mass of ink
  // the fitter marked: a leaf mass, a dark pane) is laid as one pale soft shape at that share of its darkness; lines are laid
  // whole and nothing is dropped. Tried at 0.25 as the default under paint and rejected (flat grey patches, mud under
  // colour): the code stays, unused unless asked for.
  const fill = Math.max(0, Math.min(1, num('inkfill', 1)));
  // the film: the drawing's frames, shared between a pencil lay-in and the ink over it, and between the phases, by the hand's time
  const allTime = drawingTimeMm(doc.strokes) || 1;
  if (!closing) ctx.DRAWING_FILM_PACE = DRAWING_FILM_FRAMES / allTime;
  const pace = ctx.DRAWING_FILM_PACE ?? DRAWING_FILM_FRAMES / allTime, filmedOf = Math.max(1, Math.round(pace * allTime));
  let filmed = 0;
  const inBatches = async (strokes, lay, step) => {
    const sum = { strokes: 0, cells: 0, fills: 0, widened: 0 };
    const batches = FRAME_POLICY.film ? drawingBatches(DRAWING_ORDER === 'forms' ? bigFormsFirst(strokes) : strokes, pace * drawingTimeMm(strokes), { given: DRAWING_ORDER === 'forms' }) : [{ strokes, done: 1 }];
    for (const b of batches) {
      const q = lay(b.strokes); for (const k of Object.keys(sum)) sum[k] += q[k] ?? 0;
      if (FRAME_POLICY.film) { ctx.STAGE = { stage: closing ? 'ink' : 'drawing', step, batch: ++filmed, of: filmedOf, strokes: sum.strokes, laying: true, ids: b.strokes.map(q => q.seq) }; await shoot(); }
    }
    return sum;
  };
  // An ink drawing's pencil lay-in (strokes marked medium 'graphite') is laid first, in graphite on the painting's sheet, at
  // its own darkness; the ink goes over it (from 3e27d30c). Laid exact: this painter has no paper tooth for vector strokes.
  // (the closing pen lays only the ink: the lay-in belongs to the opening drawing, under the washes)
  const graphiteMarked = !pencil && doc.strokes.some(q => q.medium === 'graphite');
  // (an author's closing file that holds pencil says so, pencilAfterWashes: that pencil is laid over the dry washes, and a
  // sheet without graphite stops the run rather than leave the lines out)
  const pencilOver = closing && doc.pencilAfterWashes === true && graphiteMarked;
  if (pencilOver && !(GRAPHITE_AT != null && GRAPHITE)) throw new Error(`ink vectors: ${path.basename(file)} draws pencil over the dry washes but this run has no graphite on the sheet`);
  const withLayin = (!closing || pencilOver) && graphiteMarked && GRAPHITE_AT != null && GRAPHITE;
  /** Lays `strokes` (a whole drawing, or one phase of it: `phase` names it); returns {graphite, ink}: what it laid. */
  async function lay(strokes, { phase = null } = {}) {
    const layin = withLayin ? strokes.filter(q => q.medium === 'graphite' && !q.wash) : [];
    if (layin.length) {
      const gp = ctx.sheet.pigments[GRAPHITE_AT], gDark = t => { const c = renderLayers([[Float32Array.of(t)]], [gp], white, 1, 1); return 1 - (c[0] + c[1] + c[2]) / 765; };
      if (!ctx.sheet.D[GRAPHITE_AT]) throw new Error('ink vectors: the pencil lay-in has no graphite layer on the sheet');
      coherent(ctx.sheet);
      // on the fine sheet beside the ink when there is one, as the pencil drawing is
      const gFine = onFine(GRAPHITE_AT);
      const g = await inBatches(layin, sub => {
        if (gFine) { const q = layVectors({ ...doc, strokes: sub }, INKRES.fine.D[INKRES.channel(GRAPHITE_AT)], INKRES.width, INKRES.height, sheetMm / INKRES.width, inkForDarkness(gDark), { fill }); INKRES.changed(); INKRES.carry(); return q; }
        coherent(ctx.sheet); const q = layVectors({ ...doc, strokes: sub }, ctx.sheet.D[GRAPHITE_AT], W2, H2, sheetMm / W2, inkForDarkness(gDark), { fill }); layersChanged(ctx.sheet); ctx.sheet._gpu?.cpuWroteAll?.(); return q;
      }, phase ? `pencil lay-in, ${phase}` : 'pencil lay-in');
      ctx.drawnCount += g.strokes;
      console.log(`pencil lay-in${phase ? `, ${phase}` : ''}: ${g.strokes} graphite strokes laid ${pencilOver ? 'over the dry washes' : 'before the ink'}, ${g.cells} cells${gFine ? ` on the fine sheet (--inkres ${INKRES.N})` : ''}`);
    }
    const rest = graphiteMarked ? strokes.filter(q => q.medium !== 'graphite') : strokes;
    // (a whole drawing is laid and told even with no line of its own medium; a phase only when it has some)
    if (phase && !rest.length) return { graphite: layin.length > 0, ink: false };
    const sheet = sheetOf();
    const r = await inBatches(rest, sub => {
      if (!fineSheet) coherent(sheet);
      const q = layVectors({ ...doc, strokes: sub }, sheet.D[at], w, h, sheetMm / w, inkForDarkness(darkOf), { fill });
      if (fineSheet) { INKRES.changed(); INKRES.carry(); } else { layersChanged(sheet); sheet._gpu?.cpuWroteAll?.(); }
      return q;
    }, phase ? `${pencil ? 'pencil' : 'pen'}, ${phase}` : pencil ? 'pencil' : 'pen');
    // a drawing that inked nothing is a sheet too coarse for its lines: said, never passed over
    if (r.strokes && !r.cells) throw new Error(`ink vectors: ${r.strokes} strokes of ${path.basename(file)} inked no cell of the ${w} x ${h} sheet (${(sheetMm / w).toFixed(2)} mm cells): the lines are too fine for it`);
    ctx.drawnCount += r.strokes;
    console.log(`ink vectors${phase ? `, ${phase}` : ''}: ${r.strokes} strokes laid exactly from ${path.basename(file)} (${pencil ? 'graphite' : 'ink'}) on a ${w} x ${h} sheet (${(sheetMm / w).toFixed(3)} mm cells), ${r.cells} cells inked${fill < 1 ? `, ${r.fills} fills at ${fill} inside` : ''}${r.widened ? `, ${r.widened} lines finer than a cell laid a cell wide` : ''}; no tracer, no pen gestures`);
    return { graphite: layin.length > 0 || (pencil && rest.length > 0), ink: !pencil && rest.length > 0 };
  }
  return { lay };
}
// The painter's own record of what a drawing file lays, for the drawing harness (tools/drawing-harness): ids and their
// hash, and for the opening drawing when each goes down (drawing-phases.mjs)
function writeLaid(V, closing, schedule = null) {
  const ids = V.chosen.strokes.map(q => q.seq);
  fs.writeFileSync(path.join(out, closing ? 'drawing-laid-closing.json' : 'drawing-laid.json'), JSON.stringify({ file: path.basename(V.file), fileSha256: crypto.createHash('sha256').update(V.bytes).digest('hex'),
    medium: V.whole.medium, chosen: V.whole.chosen ?? null, rule: V.chosen.rule, when: closing ? 'after' : 'before', strokes: V.whole.strokes.length, laid: ids.length, left: V.chosen.left.length,
    laidSha256: crypto.createHash('sha256').update(ids.join(',')).digest('hex'), laidIds: ids,
    ...(schedule ? { opening: schedule.opening.map(q => q.seq), phases: schedule.phases.map(p => ({ beforeWash: p.at, stage: p.stage ?? null, ids: p.strokes.map(q => q.seq) })) } : {}) }) + '\n');
}
async function layExactVectors(file, { closing = false } = {}) {
  const V = !closing && ctx.OPENING_VECTORS?.file === file ? ctx.OPENING_VECTORS : chosenVectors(file);
  const P = closing ? null : ctx.DRAWING_PHASES;
  console.log(`drawing ${closing ? 'after the washes' : 'before the washes'}: ${V.chosen.strokes.length} of ${V.whole.strokes.length} strokes of ${path.basename(file)}, ${V.chosen.rule}${P?.phases.length ? `; ${P.opening.length} before the first washes, ${V.chosen.strokes.length - P.opening.length} with the painting's later washes in ${P.phases.length} phases (drawing-phases.mjs)` : ''}`);
  writeLaid(V, closing, P);
  const hand = vectorHand(V, { closing });
  if (P) P.hand = hand;
  await hand.lay(P ? P.opening : V.doc.strokes);
  fs.copyFileSync(file, path.join(out, closing ? 'ink-vectors-closing.json' : 'ink-vectors.json'));
}
async function drawPass(_unused, { first = false, fine = false } = {}) {
  const speedDrawStart = performance.now();
  // the opening pen lays --drawingfile, the closing pen --drawinglast (a staged run writes both, each with its vectors)
  const KEY = first ? 'drawingfile' : !fine ? 'drawinglast' : null, VECTORS = KEY ? vectorFile(KEY) : null;
  // a prepared drawing is laid only as its vector strokes: there is no traced-line pen route to fall back on
  if (KEY && opt(KEY, '') && !VECTORS) throw new Error(`--${KEY} ${opt(KEY, '')}: no vector strokes beside it (${opt(KEY, '').replace(/-lines\.json$/, '')}-vectors.json). Make them with tools/seg/ink-vectors.py; the pen no longer lays traced lines (removed in 0.4, replay/VECTOR-PEN.md)`);
  if (VECTORS) { await layExactVectors(VECTORS, { closing: !first }); if (INKRES) INKRES.settle(); return; }
  try {
  const PLAN = PEN_PLANS[first ? 'first' : fine ? 'fine' : 'last'];
  if (!PLAN) throw new Error('drawing: this pen pass was not planned before painting');
  const { preparing, PEN, K, graphiteFirst, inkPig, scaled, wantT1, big, peak, inkVerdict, frozenPeak, per, SELECTED, outlines, gestures } = PLAN;
  ctx.VALUE_ACTIVE=null;
  ctx.DRAW_STAGE=first?'opening':'closing';
  if (first && STAGE_PLAN?.files.prep && GRAPHITE) await drawPrepStage(PEN);
  const stageBefore = STAGE_PLAN && !fine ? thickness(ctx.sheet).map(a => Float32Array.from(a)) : null;
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
    if (PENCIL) {
      if (drawT1.length) { const r1 = clock('strokes', () => pencilDraw(ctx.sheet, drawT1, GRAPHITE_AT, { amount: PENCIL.pig.strength * num('pencilgain', 1), pressureReference: num('pencilpressure', 0) > 0 ? num('pencilpressure', 0) : null, width: num('pencilw', 1.2) * SC, vary: num('pencilvary', 0.35), tooth: num('penciltooth', 0.4), seed: SEED + k })); ctx.drawnCount += r1.drawn; }
      if (drawMain.length) { const r = clock('strokes', () => pencilDraw(ctx.sheet, drawMain, GRAPHITE_AT, { amount: PENCIL.pig.strength * num('pencilgain', 1), pressureReference: num('pencilpressure', 0) > 0 ? num('pencilpressure', 0) : null, width: num('pencilw', 1.2) * SC, vary: num('pencilvary', 0.35), tooth: num('penciltooth', 0.4), seed: SEED + k + 2 })); ctx.drawnCount += r.drawn; }
      if (drawThin.length) { const r2 = clock('strokes', () => pencilDraw(ctx.sheet, drawThin, GRAPHITE_AT, { amount: PENCIL.pig.strength * num('pencilgain', 1) * 0.7, pressureReference: num('pencilpressure', 0) > 0 ? num('pencilpressure', 0) : null, width: num('pencilw', 1.2) * SC * 0.7, vary: num('pencilvary', 0.35), tooth: num('penciltooth', 0.4), seed: SEED + k + 3 })); ctx.drawnCount += r2.drawn; }
    } else if (INK || graphiteFirst) {
      if (drawT1.length) { const r1 = clock('strokes', () => penDraw(ctx.sheet, drawT1, wantT1, W2, H2, { ink: SHEET_PIGS.map((_, j) => (j === inkPig ? (graphiteFirst && !preparing ? (STYLE_ON()?3*ctx.VALUE_PLAN.style.graphite:num('graphiteconc', 3)) : INKLOAD()) : 0)), pen: PEN, O, peak: 1 })); ctx.drawnCount += r1.drawn; }
      const r = clock('strokes', () => penDraw(ctx.sheet, drawMain, big, W2, H2, { ink: SHEET_PIGS.map((_, j) => (j === inkPig ? (graphiteFirst && !preparing ? (STYLE_ON()?3*ctx.VALUE_PLAN.style.graphite:num('graphiteconc', 3)) : INKLOAD()) : 0)), pen: PEN, O, peak: peakMain }));
      if (drawThin.length) { const r2 = clock('strokes', () => penDraw(ctx.sheet, drawThin, big, W2, H2, { ink: SHEET_PIGS.map((_, j) => (j === inkPig ? (graphiteFirst ? (STYLE_ON()?3*ctx.VALUE_PLAN.style.graphite:num('graphiteconc', 3)) : num('outlineconc', 6.5)) : 0)), pen: PEN, O, peak: peakThin })); ctx.drawnCount += r2.drawn; }
      ctx.drawnCount += r.drawn;
    }
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
  // the pencil dries into the paper before the first wash, by the sheet's own dry (on the GPU the GPU's own fix): a
  // layer pushed onto the sheet from the CPU here (pencil-set.mjs, 04422c61) was not the GPU's, and the film lost the
  // first washes laid over it (Mittens Auto at rc5: the face's base wash shown, then gone at pass 7)
  if (GRAPHITE) { clock('dry', () => dry(ctx.sheet, 20000, O, { levelMax: 200 })); console.log('pencil set: the opening drawing dried into the paper before the washes'); }
  if (PREP_ERASE && STAGE_PLAN?.files.prep && GRAPHITE) followErase(INKRES, ctx.sheet, GRAPHITE_AT, () => erasePrep({ sheet: ctx.sheet, k: GRAPHITE_AT, dabs: PREP_ERASE, strength: num('preperase', 0.85), SC, w, W2, layersChanged, log: console.log }));
  ctx.INK_THK = thickness(ctx.sheet).map((a, j) => Float32Array.from(a, (v, i) => Math.max(0, v - before[j][i])));
  await sharp(INKRES ? INKRES.compose(view()) : render(), { raw: { width: OUT_W, height: OUT_H, channels: 3 } }).png().toFile(path.join(out, 'drawing-opening.png'));
}
// An actual dry-pen checkpoint, using the same planned strokes and physics as
// the full painting. The process exit hook still writes the strict guard report.
if (num('drawingonly', 0) > 0) {
  if (ctx.RESUMING || !PEN_FIRST || opt('draw', '1') === '0' || DRAWING === 'none') throw new Error('--drawingonly requires an opening drawing (--drawingfile)');
  assertDeviceHealthy(ctx.sheet);
  fs.copyFileSync(path.join(out, 'drawing-opening.png'), path.join(out, 'painting.png'));
  const after = thickness(ctx.sheet);
  const nativeInk = INKRES ? INKRES.nativeInk() : renderInkProof({ thickness: after, pigments: SHEET_PIGS, inkAt: PIGS.length, width: W2, height: H2 });
  await sharp(nativeInk.pixels, { raw: { width: nativeInk.width, height: nativeInk.height, channels: 3 } }).png().toFile(path.join(out, "ink-native.png"));
  fs.writeFileSync(path.join(out, "ink-native.json"), JSON.stringify({ width: nativeInk.width, height: nativeInk.height, sheetWidthMm: PB?.mm ?? num("sheetmm", DEFAULT_SHEET_MM), kind: INKRES ? "deposited ink on native pen sheet, before wash redistribution" : "final deposited coarse ink, including wash redistribution", resized: false }) + "\n");
  fs.writeFileSync(path.join(out, 'pen-state-audit.json'), JSON.stringify(PEN_STATE_AUDIT));
  fs.writeFileSync(path.join(out, 'drawing-checkpoint.json'), JSON.stringify({ stage: 'dry opening drawing', paintExecuted: false, gestures: ctx.drawnCount, backend: GPU_INFO }));
  // --marks 1: the pen's tape too (the finish stage, which writes it for a whole painting, is not reached)
  if (ctx.FULL_TAPE && ctx.MARKTAPE) {
    const { markTapeJSON } = await import('../../src/media/mark-tape-json.mjs'), { PENS, PENOPTS } = await import('../../src/media/brush.mjs');
    const asTape = p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, ArrayBuffer.isView(v) ? Array.from(v) : v]));
    const fineN = INKRES?.N ?? 1;   // the pens draw on the fine sheet: the marks are in its cells
    const tape = { w: W2 * fineN, h: H2 * fineN, scale: 10, sheetWidthMm: PB?.mm ?? num('sheetmm', DEFAULT_SHEET_MM), version: 2, methods: ctx.RUN_METHODS, drawingOnly: true, paperRGB,
      base: Array.from(base.subarray(0, 3)), pigments: SHEET_PIGS.map(asTape), penOpts: PENOPTS, pens: PENS, marks: ctx.MARKTAPE,
      strokeCount: ctx.MARKTAPE.filter(m => ['s', 'P', 'g'].includes(m.k)).length };
    const fd = fs.openSync(path.join(out, 'marks.json'), 'w');
    try { for (const chunk of markTapeJSON(tape)) fs.writeFileSync(fd, chunk); } finally { fs.closeSync(fd); }
    console.log(`marks: drawing only, ${tape.strokeCount} pen marks`);
  }
  await drainFrames(); if (ctx.FRAMER) ctx.FRAMER.close(); ctx.sheet._gpu?.close();
  console.log('drawing-only: dry opening complete, before washes'); process.exit(0);
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
Object.assign(ctx, { up, t0, spent, PROF, prof, handAngle, flowEvery, SHAPE_LOAD_BUFFER, brushMask, FILM_MASS, 
  FILM_FRAMES, used, TECHS, LAST, DRAWING, SKY_WARM_RB, PROVENANCE_TARGET_SHA, PREPF, 
  fadePrep, mopLanes, setStage });
}
