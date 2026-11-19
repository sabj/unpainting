// Film frames and the plan of the pen drawing.
// Stage 4 of 7 of tools/paint-plate.mjs. The stages run in order and share one object, ctx: see the entry file.
import {fastPaintFrame} from '../speed/frame-policy.mjs';
import {scaleDrawingGestures} from '../../src/paint/methods/drawing-hand.mjs';
import {cutInDarkWash} from '../../src/paint/methods/ink-dark-skip.mjs';
import {prepareDrawing} from '../../src/paint/methods/material-profiles.mjs';
import {weighGraphiteDrawing} from '../../src/paint/methods/graphite-pool.mjs';
import {plannedEdges, supportedLines} from '../../src/paint/methods/line-support.mjs';
import {selectValueInk, drawsWholeFile, valueInkVerdict} from '../../src/paint/methods/light-to-dark.mjs';
import {DEFAULT_SHEET_MM} from '../../src/media/sheet-size.mjs';
import {cachedStep, codeHash} from '../../src/paint/run-cache.mjs';
import {startStrokeLedger} from '../../src/paint/stroke-ledger.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {tapeSheet} from '../../src/media/sheet.mjs';
import {renderLayers} from '../../src/media/km.mjs';
import {dilate, erode, closeLocal} from '../../src/raster.js';
import {gaussian} from '../../src/keyframes/density.mjs';
import {planGestures} from '../../src/crop/gestures.mjs';
import {joinLines} from '../../src/crop/joinlines.mjs';
import {lineField, lineBudget} from '../../src/media/draw.mjs';
import {classifyInkPaths, inkFilterCounts, inkFilterOverlay} from '../../src/crop/inkfilter.mjs';
import {pathLength, straightness, meanContrast, insideShare, onShare, inkTierOverlay} from '../../src/crop/inktiers.mjs';
import {silhouette, traceOutlines} from '../../src/crop/outline.mjs';
import {edgeChains} from '../../src/crop/contours.mjs';
import {drawAs} from '../../src/crop/simplify.mjs';
import {selectedDrawing, drawingWant} from '../../src/paint/methods/drawing-file.mjs';
import {planPenWash, describePlan, passageAmounts} from '../../src/paint/methods/pen-wash-plan.mjs';
import {prunePenLines} from '../../src/paint/methods/pen-wash-lines.mjs';
import {fillSheetBase} from '../../src/paint/methods/sheet-tone.mjs';

export async function penPlan(ctx) {
const { opt, num, STROKE_BUDGET, optTrack, NATIVE_PAINT_MODE, FRAME_POLICY, root, out, RUN_CACHE, VALUE_CONFIG, 
  VALUE_ENABLED, phaseMark, srcMeta, PX_RAW, TARGET_GUARD, w, h, n, paperRGB, PIGS, COLOUR_BUDGET, MASS_BUDGET, 
  DRAW_STYLE, EDGE, FINISH, SEP, STAGE_PLAN, FACE_INK, REQUESTED_DRAW_MEDIUM, STYLE_ON, STYLE_INK_DEFAULT, 
  GRAPHITE_PROFILE, OUTLINE_MEDIUM, INK, PENCIL, GRAPHITE, GRAPHITE_AT, SC, W2, H2, N2, PB, paper, INKRES, 
  TARGET_DRAW_EDGE, sourceInkDrawing, drawingCapsFor, OUT_W, OUT_H, base, SHADE, TONE_STAGE, view, framer, 
  drainFrames } = ctx;
Object.assign(ctx, { planPen });
ctx.frame = 0;
// Every frame is recorded with the stage it shows: which pass of how many, which value, and what is under way.
const FRAMES = [];
ctx.STAGE = { stage: 'paper', pass: 0, value: 0 };
// Frames taken inside the sheet's synchronous physics (while a passage is laid or dries) are rendered at once and
// written at the next shoot, in order.
const SNAPS = [];
const snap = extra => { if(!FRAME_POLICY.all || NATIVE_PAINT_MODE.mode==='fast')return; const F = framer(); SNAPS.push(F ? { id: F.capture(), stage: { ...ctx.STAGE, ...extra } } : { buf: INKRES ? INKRES.compose(view()) : view(), stage: { ...ctx.STAGE, ...extra } }); };

// --marks 1: record the mark tape: every stroke as a brush index and a path, with the water schedule between them.
// Without it the stroke ledger still records what the stroke gate measures (src/paint/stroke-ledger.mjs).
if (!['warn', 'reject', 'off'].includes(opt('strokegate', 'warn'))) throw new Error('strokegate must be warn, reject or off');
const FULL_TAPE = opt('marks', '0') !== '0' || Boolean(STROKE_BUDGET), MARKTAPE = startStrokeLedger({ full: FULL_TAPE });
if (MARKTAPE) tapeSheet(MARKTAPE);
// --pausedir DIR: the painter offers a stop at every passage boundary and a harness decides where it stops
// (tools/aware/pause.mjs). --resumestate DIR: a fresh process takes over a painting saved at a boundary (state.json
// there), with the plan files as they now stand: the planning runs again, nothing before the boundary is painted
// again, and the sheet, the ledger, the recording and the counters come back as they were. Until they are loaded
// (RESUMING) no frame is taken.
const AWARE_DIR = opt('pausedir', ''), RESUME_DIR = opt('resumestate', '');
ctx.RESUMING = Boolean(RESUME_DIR);
const RESUME_AT = RESUME_DIR ? JSON.parse(fs.readFileSync(path.join(RESUME_DIR, 'boundary.json'), 'utf8')) : null;

// Playback ships the marks, not the pictures.
ctx.LAST_FRAME_STAGE=null;
const shoot = async () => {
  if (ctx.RESUMING) return; // a fresh process taking over a saved painting: its frames are already on disk
  if (!FRAME_POLICY.keep(ctx.STAGE)) return;
  // Fast films only completed paint boundaries: every fourth pass and every dried value band; all other stages survive.
  if(FRAME_POLICY.all && NATIVE_PAINT_MODE.mode==='fast' && !fastPaintFrame(ctx.STAGE))return;
  const stageKey=JSON.stringify(ctx.STAGE);
  if(NATIVE_PAINT_MODE.mode==='fast' && ctx.LAST_FRAME_STAGE===stageKey)return;
  ctx.LAST_FRAME_STAGE=stageKey;
  // a marker in the tape at every frame, so a replay can render at exactly the points the painter did
  if (MARKTAPE) MARKTAPE.push({ k: 'm', i: ctx.frame });
  for (const s of SNAPS.splice(0)) {
    const name = `f${String(ctx.frame).padStart(4, '0')}.jpg`;
    if (s.id !== undefined) ctx.FRAMER.name(s.id, name);
    else await sharp(s.buf, { raw: { width: OUT_W, height: OUT_H, channels: 3 } }).jpeg({ quality: 88 }).toFile(path.join(out, name));
    FRAMES.push({ src: name, ...s.stage });
    ctx.frame++;
  }
  const name = `f${String(ctx.frame).padStart(4, '0')}.jpg`;
  const F = framer();
  if (F) F.name(F.capture(), name);
  else {
    const cur = INKRES ? INKRES.compose(view()) : view();
    await sharp(cur, { raw: { width: OUT_W, height: OUT_H, channels: 3 } }).jpeg({ quality: 88 }).toFile(path.join(out, name));
  }
  FRAMES.push({ src: name, ...ctx.STAGE });
  ctx.frame++;
};
// --wetframes N: film every Nth pass while wet, after each quarter of its passages and at widening drying steps. Default 0.
const WETFRAMES = Math.round(num('wetframes', 0));
// --passframes N: a frame every Nth passage inside a pass. Default 0; stroke playback comes from the mark tape (--marks).
const PASSFRAMES = Math.round(num('passframes', 0));
const WET_STEPS = new Set([10, 40, 120, 300, 800, 2000]);
// --filmby paint|pass: paint (default) gives the washes --frames frames at equal shares of planned mass laid; pass films by pass count.
const FILM_BY_PAINT = opt('filmby', 'paint') === 'paint';
const PEN_FRAMES = 4;
ctx.filmLaid = 0; ctx.filmNext = 1;
await shoot();
if (TONE_STAGE) {
  fillSheetBase(base, paper.height, paperRGB, SHADE);
  ctx.RENDER_MEMO = null; ctx.LOOK1 = null;
  if (ctx.FRAMER) { await drainFrames(); ctx.FRAMER = false; }
  ctx.STAGE = { stage: 'tone', step: 'paper colour selected (no paint applied)' };
  await shoot();
}

phaseMark('sheet');
// --penwash 1 (--style penwash, src/paint/recipe.mjs): pen and wash. The ink drawing is drawn whole from its prepared
// file with its small repeated marks pruned (pen-wash-lines.mjs), then three to six simple washes planned here from a
// three-value simplification (--penwashplan values) or, for comparison, from colour regions (--penwashplan colour)
// replace the value ladder (pen-wash-plan.mjs, pen-wash.mjs). Planned now, before the target guard seals the target.
const PENWASH = num('penwash', 0) > 0;
ctx.PENWASH_LINES = null; let PENWASH_INK_GROUPS = null;
const PENWASH_PLAN = PENWASH ? (() => {
  const planArgs = { px: PX_RAW, w, h, pigments: PIGS, paperRGB, mmPerCell: num('sheetmm', DEFAULT_SHEET_MM) / w,
    options: { lightness: num('pwlightness', 0.5), minLight: num('pwminlight', 0.45), maxDark: num('pwmaxdark', 0.22), blurMm: num('pwblur', 2.5), minArea: num('pwminarea', 0.006), hueGap: num('pwhuegap', 10), chroma: num('pwchroma', 1), lightChroma: num('pwlightchroma', 0), localMax: num('pwlocalmax', 0.26), capLWeight: num('pwcaplweight', 1), shadowBlurMm: num('pwshadowblur', 0), shadowMaxDark: num('pwshadowmaxdark', 0.3), darkHueGap: num('pwdarkhuegap', 12), foliageGreen: num('pwfoliage', 0), foliageMax: num('pwfoliagemax', 0.3), shadowOneMm: num('pwshadowone', 0), skyStrength: num('pwsky', 0), skyTo: num('pwskyto', 0.3), deepContrast: num('pwdeepcontrast', 0), deepShare: num('pwdeepshare', 0.06), deepRingMm: num('pwdeepring', 2), keepLights: num('pwkeeplights', 0), keepLightsMm2: num('pwkeeplightsmm2', 4), monoLocal: opt('pwmonolocal', '') ? Object.fromEntries(opt('pwmonolocal', '').split(',').map(t => t.split(':')).map(([k, v]) => [k, +v])) : undefined, shadowMin: num('pwshadowmin', 0.12), deepMin: num('pwdeepmin', 0.1), joinMm: num('pwjoin', 2), minPiece: num('pwminpiece', 0.008),
      whiteMm: num('pwwhitemm', 0.8), fineMm: num('pwfinemm', 0.8), holeMm2: num('pwholemm2', 0), hueSmoothMm: num('pwhuesmooth', 5), shadowPiece: num('pwshadowpiece', 0.004), firstC: num('pwfirstc', 0.35), firstMaxDL: num('pwfirstmax', 9), shadowC: num('pwshadowc', 0.55), shadowMaxDL: num('pwshadowmax', 16), darkC: num('pwdarkc', 0.65), darkMaxDL: num('pwdarkmax', 14), darkShare: num('pwdarkshare', 0.04), darkContrast: num('pwdarkcontrast', 12), darkBrushMm: num('pwdarkbrush', 3), softGrad: num('pwsoftgrad', 0), softBandMm: num('pwsoftband', 1.5), softBlurMm: num('pwsoftblur', 0.8) } };
  const plan = planPenWash({ planner: opt('penwashplan', 'values'), ...planArgs });
  PENWASH_INK_GROUPS = opt('penwashplan', 'values') === 'values' ? plan.groups : opt('penwashplan', 'values') === 'stages' ? planPenWash({ planner: 'values', ...planArgs }).groups : null;
  const doc = { planner: opt('penwashplan', 'values'), palette: PIGS.map(p => p.name ?? null), ...describePlan(plan, n, PIGS) };
  fs.writeFileSync(path.join(out, 'penwash-plan.json'), JSON.stringify(doc, null, 2));
  console.log(`pen wash: ${plan.passages.length} passages planned from ${doc.planner}${plan.monochrome ? ', monochrome target, palette roles' : ''}: ${doc.passages.map(q => `${q.id} ${(100 * q.area).toFixed(0)}%`).join(', ')}`);
  return plan;
})() : null;
// Flat previews of the plan before any mark: the value map and the washes laid flat on paper (no physics).
const penWashFlat = () => {
  const flat = new Uint8ClampedArray(n * 3); for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) flat[3 * i + c] = paperRGB[c];
  return renderLayers(PENWASH_PLAN.passages.map(p => { const a = passageAmounts(p, w, h, PIGS.length); return PIGS.map((_, j) => Float32Array.from({ length: n }, (_, i) => a[i * PIGS.length + j])); }), PIGS, flat, n, 1);
};
if (PENWASH_PLAN) {
  const grey = [250, 165, 70], vm = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) vm.fill(PENWASH_PLAN.groups[i] < 3 && opt('penwashplan', 'values') === 'values' ? grey[PENWASH_PLAN.groups[i]] : Math.round(40 + 200 * PENWASH_PLAN.groups[i] / 6), i * 3, i * 3 + 3);
  await sharp(vm, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(out, 'penwash-values.png'));
  await sharp(Buffer.from(penWashFlat()), { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(out, 'penwash-plan.png'));
}
// Wrap the target and its per-cell maps (--targetguard): planning may read them until TARGET_GUARD.beginPaint()
// closes them before the first mark. The look gets shape-level means only.
TARGET_GUARD.provide('px', PX_RAW, { stride: 3 }); TARGET_GUARD.provide('A', ctx.A, { stride: PIGS.length }); if (ctx.AL !== ctx.A) TARGET_GUARD.provide('AL', ctx.AL, { stride: PIGS.length });
const LOOK_AL = ctx.AL !== ctx.A ? 'AL' : 'A', LOOK_PLAN = COLOUR_BUDGET ? LOOK_AL : 'A';
if (TARGET_GUARD.mode !== 'off') {
  TARGET_GUARD.register('A', ctx.A); ctx.px = TARGET_GUARD.seal('px', ctx.px); ctx.D_SOURCE = TARGET_GUARD.seal('D_SOURCE', ctx.D_SOURCE); ctx.A = TARGET_GUARD.seal('A', ctx.A); ctx.AL = TARGET_GUARD.seal('AL', ctx.AL); ctx.SRC = TARGET_GUARD.seal('SRC', ctx.SRC);
  // the value plan's per-cell amounts (sh.graded): one amount per shape while painting, so they are closed too
  const sealedG = new Map();
  for (const L2 of ctx.layers) for (const sh of L2.shapes) if (sh.graded && typeof sh.graded === 'object') { if (!sealedG.has(sh.graded)) sealedG.set(sh.graded, TARGET_GUARD.seal('G', sh.graded)); sh.graded = sealedG.get(sh.graded); }
}
// What the washes cannot carry is drawn with a pen: take the planned washes out of the picture and what is left is ink.
// The pen's layer is the thickness each pigment gained while drawing, not a separate buffer.
ctx.drawnCount = 0; ctx.prepDrawn = 0;
// The share of the source's cells the separator reads as pen line, and the washes the plan lays, both known before a
// mark is made, so the drawing can come first.
const SOURCE_INK = SEP.stats.ink / n;
// --finish (nonzero) also adds a finishing stage on the dry sheet: fine lines, closing ink accents and catchlights.
// Its pen walk uses a finer scale, a lower floor and a fine nib.
// --drawingguide file: an aligned construction reference; the pen draws its paths, its pixels never enter the painting.
const DRAW_GUIDE = await (async () => {
  const file = opt('drawingguide');
  if (!file) return null;
  const resolved = path.resolve(root, file), input = sharp(resolved), meta = await input.metadata();
  if (Math.abs(meta.width / meta.height - w / h) > 0.005) throw new Error('Drawing guide must preserve the source aspect ratio');
  const data = await input.resize(w, h).flatten({ background: '#fff' }).removeAlpha().raw().toBuffer();
  const hash = crypto.createHash('sha256').update(fs.readFileSync(resolved)).digest('hex');
  console.log(`drawing guide: ${file}, sha256 ${hash}; paths only, preparation only`);
  fs.writeFileSync(path.join(out, 'drawing-guide.json'), JSON.stringify({ file, sha256: hash, role: 'preparatory pen paths only' }, null, 2));
  return Float32Array.from({ length: n }, (_, i) => Math.max(0, -Math.log(Math.max(0.02, (data[3 * i] + data[3 * i + 1] + data[3 * i + 2]) / 765))));
})();
// --inkfilter 1: draw only paths the source supports as drawn line (src/crop/inkfilter.mjs); wash and texture paths are dropped.
// Selection only: batches and pressure normalisation come from the unfiltered set, so survivors draw exactly as without it.
const INKFILTER = opt('inkfilter', '0') !== '0';
const INK_FILTER_LOG = [];
// The accepted/rejected paths as a picture and as evidence, rewritten after each drawing pass so a run that is stopped
// early still leaves what it decided.
const writeInkFilter = async (D) => {
  fs.writeFileSync(path.join(out, 'ink-filter.json'), JSON.stringify({
    source: opt('image'), width: w, height: h, kept: INK_FILTER_LOG.filter(e => e.kept).length, total: INK_FILTER_LOG.length,
    classes: inkFilterCounts(INK_FILTER_LOG),
    paths: INK_FILTER_LOG.map(({ points, ...e }) => e),
  }, null, 2));
  const rgb = inkFilterOverlay(D, w, h, INK_FILTER_LOG, { width: num('inkfilterwidth', 2) });
  await sharp(Buffer.from(rgb.buffer, rgb.byteOffset, rgb.length), { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(out, 'ink-filter.png'));
};
// --inktiers 1: spend the ink budget in tiers before the greedy walk takes the rest (src/crop/inktiers.mjs).
//   tier 1: the subject boundary and long near-straight step edges, --tier1 of the budget (default 0.3).
//   tier 2: short paths inside the subject, ranked by contrast with their own ground, --tier2 (default 0.3).
//   tier 3: the greedy walk with the rest; its faint second pass is guaranteed --tier3faint of the budget (default 0.1).
// Selection and order only: pressure normalisation and batch boundaries are frozen as under --inkfilter.
const INKTIERS = opt('inktiers', '0') !== '0';
const INK_TIER_LOG = [];
// Where the subject is, for the tiers alone: without --mask, the source's mask is read as a ranking priority, never a veto.
const TIER_MASK = await (async () => {
  if (!INKTIERS) return null;
  if (ctx.SUBJECT) { console.log('ink tiers: the subject comes from --mask'); return ctx.SUBJECT; }
  const image = opt('image', '');
  const base = image ? path.basename(image, path.extname(image)) : '';
  const file = base ? path.resolve(root, `work/masks/${base}.png`) : '';
  if (!file || !fs.existsSync(file)) { console.log(`ink tiers: no subject mask for ${base || 'this source'}; tier 1 is edges only and tier 2 is the whole sheet`); return null; }
  const { data } = await sharp(file).resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const soft = Math.max(1, Math.round(num('masksoft', 0.01) * Math.min(w, h)));
  const m = gaussian(Float32Array.from({ length: n }, (_, i) => data[i] / 255), w, h, soft);
  let subj = 0; for (let i = 0; i < n; i++) if (m[i] > 0.5) subj++;
  console.log(`ink tiers: subject from work/masks/${base}.png, ${(100 * subj / n).toFixed(1)}% of the sheet, for ranking only`);
  return m;
})();
const writeInkTiers = async (D) => {
  const rgb = inkTierOverlay(D, w, h, INK_TIER_LOG, { width: num('inktierswidth', 2) });
  await sharp(Buffer.from(rgb.buffer, rgb.byteOffset, rgb.length), { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(out, 'ink-tiers.png'));
};
// The pen's drawing is planned whole before the first mark: where every line goes and how
// hard, from the reference and the plan, never from the sheet. drawPass, after TARGET_GUARD.beginPaint(), only draws it.
async function planPen(planD0, opts = {}) {
  const prev = [ctx.VALUE_ACTIVE, ctx.AREA_DRAW_STAGE];
  try { return await planPenInner(planD0, opts); } finally { [ctx.VALUE_ACTIVE, ctx.AREA_DRAW_STAGE] = prev; }
}
async function planPenInner(planD0, { first = false, fine = false } = {}) {
  ctx.VALUE_ACTIVE=null;
  ctx.AREA_DRAW_STAGE=first?'opening':'closing';
  const preparing = first && ctx.PREP;
  const DRAW_SOURCE = first && DRAW_GUIDE ? DRAW_GUIDE : ctx.SRC;
  const planD = planD0;
  const inkWant = new Float32Array(n);
  // --penwant src|glaze|residual: src follows the source's darks; residual what the washes leave. Default src first, residual after.
  // glaze: lines where src puts them, laying only the density the glazes over them will not supply.
  const penWant = opt('penwant', first ? 'src' : 'residual'), planShare = penWant === 'residual' ? 1 : 0;
  if (fine) console.log(`finish: a fine pass for the lines the washes cannot carry`);
  for (let i = 0; i < n; i++) inkWant[i] = Math.max(0, DRAW_SOURCE[i] - planShare * planD[i] - num('forgive', 0.10));
  // A pen follows thin dark ridges (lineField); the walk turns hard and crosses at most a few cells of paper.
  // --cellscale 1: scale the pen's cell sizes by sheet width over 420, so they are sizes on the paper. Default 0.
  const K = opt('cellscale', '0') !== '0' ? w / 420 : 1;
  // --penfacenib f: the nib a face is drawn with, as a multiple of the usual one (thin, 0.5)
  const PEN = { nib: 0.8 * K * (STYLE_ON() ? ctx.VALUE_PLAN.style.ink : num('penfacenib', 1)), flex: 1.5 * K, travel: 1.5 * K, reach: 12 * K, reservoir: num('penreservoir',250) * K * K, feed: 1.2 * K };
  if(!(PEN.reservoir>0)||!Number.isFinite(PEN.reservoir))throw Error('--penreservoir must be finite and positive');
  // --penblur: scale of the ridge field the pen reads (default 1); coarser gives one line to follow, not a braid.
  const PENBLUR = num('penblur', 1);
  const sigmas = [0.8,1.2,1.8].map(v=>v*K*PENBLUR);
  const field = (await cachedStep({...RUN_CACHE,name:'pen-field',code:codeHash(root,[],{dependencies:['src/media/draw.mjs']}),track:optTrack,inputs:{DRAW_SOURCE,inkWant,w,h,sigmas}},async()=>lineField(DRAW_SOURCE,inkWant,w,h,{sigmas}))).value;
  for (let i = 0; i < n; i++) if (EDGE(i)) field[i] = 0;
  // drawn first, the pen also keeps off the scan's border (--silmargin, default 0.04), which the separator reads as line
  if (first) { const mg = num('silmargin', 0.04), mx = Math.round(mg * w), my = Math.round(mg * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < mx || y < my || x >= w - mx || y >= h - my) field[y * w + x] = 0; }
  // --inkgate r: the pen goes only within r cells of separator pen line (default 7), not along wash texture edges. 0 is off.
  if (!(first && DRAW_GUIDE) && opt('inkgate', '7') !== '0') {
    const near = dilate(SEP.ink, w, h, Math.round(num('inkgate', 7) * K));
    for (let i = 0; i < n; i++) if (!near[i]) field[i] = 0;
  }
  const nz = Array.from(field).filter(v => v > 0).sort((a, b) => a - b);
  // --carry: cells without ink a walk may cross (default 8); --floorq: ink quantile that may seed a line (default 0.5).
  // --inkconc, --outlineconc: ink concentrations (defaults 10 and 6.5).
  const floor = nz.length ? nz[Math.floor(nz.length * num('floorq', preparing ? 0.25 : 0.5))] : 0.05;
  // --penfrom walk|chains: chains draws form edges as chains (src/crop/contours.mjs), lines by construction, not a ridge walk.
  const chainPen = () => edgeChains(DRAW_SOURCE, w, h, gaussian, {
    sigma: num('edgesigma', 1.5) * K * PENBLUR, minLength: Math.round(num('penchainmin', 14) * K),
    margin: num('silmargin', 0.04), step: Math.max(1, Math.round(2 * K)), high: num('penchainhigh', 0.7),
  }).map(g => ({ points: g.points }));
  const walkPen = () => (fine
    ? planGestures(field, w, h, { seed: 31 + ctx.SEED, floor: floor * num('finefloor', 0.45), keep: num('finekeep', 260),
        claimRadius: Math.max(1, num('fineclaim', 1.2) * K), reachShare: num('finereach', 0.05),
        turn: num('fineturn', 0.92), carry: num('finecarry', 14) * K, scales: [num('finescale', 0.6), 0], tries: 4000 }).gestures
    : planGestures(field, w, h, { seed: 7 + ctx.SEED, floor, keep: num('keep', 400), claimRadius: 3 * K, reachShare: num('penreach', 0.12), turn: num('turn', 0.8), carry: num('carry', 8) * K, scales: [1.5, 0], tries: 3000 }).gestures);
  // --pensimplify c: reduce each pen path to the points it needs within c cells, then resample evenly. Default 0, off.
  const SIMPLIFY = num('pensimplify', 0) * K;
  const simplifyAll = gs => (SIMPLIFY > 0 ? gs.map(g => ({ ...g, points: drawAs(g.points, { tolerance: SIMPLIFY, step: Math.max(1, 2 * K) }) })).filter(g => g.points.length >= 2) : gs);
  // Hybrid logic consumes the walker even with an authored drawing.
  // Diagnostic gesture dumps also promise the original walked paths.
  const fileReplacesWalk = !!(first ? opt('drawingfile','') : !fine && opt('drawinglast',''))
    && num(first ? 'drawinglogic' : 'drawinglastlogic', num('drawinglogic',0)) === 0
    && !opt('dumpgestures');
  const gestures = fileReplacesWalk ? [] : simplifyAll(ctx.clock('paths', () => (opt('penfrom', 'walk') === 'chains' ? chainPen() : walkPen())));
  // the ink is the darkest fluid on the palette, as walnut ink is darker than any wash made from it
  // --firstpen graphite: the first pen's drawing as a light pencil lay-in, ink kept for the closing pen. Needs a graphite
  // outline medium; --prep does the same.
  // linked stages: the pencil is its own pass (prep), and the first pen is ink
  const graphiteFirst = first && GRAPHITE && !(STAGE_PLAN && OUTLINE_MEDIUM === 'ink') && (preparing || !!PENCIL || OUTLINE_MEDIUM==='graphite' || GRAPHITE_PROFILE.kind==='graphite');
  const inkPig = graphiteFirst ? GRAPHITE_AT : INK ? PIGS.length : PIGS.map((p, j) => [j, p.K[0] + p.K[1] + p.K[2]]).sort((a, b) => b[1] - a[1])[0][0];
  // As much line as the source shows, and no more: see lineBudget. --inkbudget 0 draws every gesture found.
  // --drawfloor s: ink share assumed when the source is not a drawing, so it still gets a preparatory drawing (default 0.04 with --prep).
  const share = Math.max(SOURCE_INK, num('drawfloor', preparing ? 0.04 : 0));
  // --closingshare c: with both an opening and a closing pen, the two share one budget, c of it for the closing pass
  // (default 0.3), so the drawing as a whole carries as much line as the source shows, not twice that.
  const passShare = ctx.PEN_FIRST && ctx.DRAW_LAST && !fine && num('closingshare', 0) > 0 ? (first ? 1 - num('closingshare', 0) : num('closingshare', 0)) : 1;
  const CELLS = share * n * num('inkbudget', 6) * passShare, NIB = 1.5 * K;
  const cellsOf = gs => gs.reduce((a, g) => a + (g.length ?? pathLength(g.points)) * NIB, 0);
  const TIERED = INKTIERS && num('inkbudget', preparing ? 0 : 6) > 0;
  const FAINT_CELLS = CELLS * num('tier3faint', 0.1);
  // --inktiers: the same CELLS, reserved before the greedy walk may use them.
  const tiered = TIERED && !fileReplacesWalk ? (() => {
    const t1Cells = CELLS * num('tier1', 0.3), t2Cells = CELLS * num('tier2', 0.3);
    const stride = Math.max(1, Math.round(2 * K));
    // Tier 1a: the subject's own boundary; traceOutlines returns ordered, smoothed, longest-first chains.
    const maskC = (TIER_MASK
      ? traceOutlines(Uint8Array.from(TIER_MASK, v => (v >= num('pendrawat', 0.5) ? 1 : 0)), w, h, { minLength: Math.round(num('silmin', 12) * K), step: stride })
      : []).map(g => ({ points: g.points, length: pathLength(g.points), tier: 1 }));
    // Tier 1b: long near-straight runs through the ground, away from gated pen line (a horizon), let past --inkgate here only.
    const gated = dilate(SEP.ink, w, h, Math.round(num('inkgate', 7) * K));
    const longMin = num('tier1long', 0.10) * Math.min(w, h);
    const stepC = [...edgeChains(DRAW_SOURCE, w, h, gaussian, { sigma: num('edgesigma', 1.5) * K, minLength: Math.round(num('edgemin', 20) * K), margin: num('silmargin', 0.04), step: stride, high: num('edgehigh', 0.85) })
      .filter(g => pathLength(g.points) >= longMin
        && straightness(g.points) >= num('tier1straight', 0.85)
        && onShare(g.points, gated, w, h) < num('tier1gated', 0.5)
        // the subject's own long edges are tier 1a's business; this half is for the lines through the ground
        && (!TIER_MASK || insideShare(g.points, TIER_MASK, w, h, num('pendrawat', 0.5)) < 0.5))
      .map(g => ({ points: g.points, length: pathLength(g.points), tier: 1 }))];
    // the boundary first, then the horizon, then whatever of the boundary is still affordable
    const a = lineBudget(maskC, t1Cells * num('tier1mask', 0.6), { width: NIB });
    const b = lineBudget(stepC, t1Cells - cellsOf(a), { width: NIB });
    const done = new Set(a);
    const c = lineBudget(maskC.filter(g => !done.has(g)), t1Cells - cellsOf(a) - cellsOf(b), { width: NIB });
    const t1 = [...a, ...b, ...c];
    // Tier 2: short paths inside the subject, ranked by how far they stand above their lighter flank, not by darkness.
    // A faint-scale walk restricted to the subject adds short candidates, since the main walk's gestures are mostly long.
    const featLen = num('featlen', 0.08) * Math.min(w, h);
    const featField = Float32Array.from(field, (v, i) => (TIER_MASK && TIER_MASK[i] < num('pendrawat', 0.5) ? 0 : v));
    const fnz = Array.from(featField).filter(v => v > 0).sort((p, q) => p - q);
    const featWalk = fnz.length
      ? planGestures(featField, w, h, { seed: 17 + ctx.SEED, floor: fnz[Math.floor(fnz.length * num('featfloorq', 0.35))], keep: num('keep', 400),
          claimRadius: 2 * K, reachShare: num('featrun', 0.05), turn: 1, carry: num('outlinecarry', 6) * K, scales: [0], tries: 3000 }).gestures
      : [];
    const t2cand = [...gestures, ...featWalk]
        .filter(g => g.points.length >= 2 && (g.length ?? pathLength(g.points)) <= featLen
          && (!TIER_MASK || insideShare(g.points, TIER_MASK, w, h, num('pendrawat', 0.5)) >= num('featinside', 0.6)))
        .map(g => ({ from: g, contrast: meanContrast(DRAW_SOURCE, w, h, g.points, { reach: num('featreach', 4) * K }) }))
        .sort((p, q) => q.contrast - p.contrast)
        .map(e => ({ ...e.from, tier: 2, from: e.from }));
    const t2 = lineBudget(t2cand, t2Cells, { width: NIB });
    // Tier 3: the existing greedy darkest-first walk, with what is left once the faint pass's share is held back.
    const spentOn2 = new Set(t2.map(g => g.from));
    // --tier3: cap on the greedy walk's share of the budget. Default 1.
    const t3Cells = Math.min(CELLS * num('tier3', 1), Math.max(0, CELLS - cellsOf(t1) - cellsOf(t2) - FAINT_CELLS));
    const t3cand = gestures.filter(g => !spentOn2.has(g)).map(g => ({ ...g, tier: 3 }));
    const t3 = lineBudget(t3cand, t3Cells, { width: NIB });
    console.log(`ink tier 1 outline:  ${t1.length}/${maskC.length + stepC.length} paths, ${Math.round(cellsOf(t1))} of ${Math.round(t1Cells)} cells (mask boundary ${a.length + c.length} of ${maskC.length}, step edges ${b.length} of ${stepC.length})`);
    console.log(`ink tier 2 features: ${t2.length}/${t2cand.length} paths, ${Math.round(cellsOf(t2))} of ${Math.round(t2Cells)} cells, at ${featLen.toFixed(0)} cells or shorter`);
    console.log(`ink tier 3 rest:     ${t3.length}/${t3cand.length} paths, ${Math.round(cellsOf(t3))} of ${Math.round(t3Cells)} cells`);
    // Short marks cost few cells, so the tiers may not draw more marks than the plain budget would keep.
    // The excess comes off the tail of the greedy walk, the least structural part of the set.
    return { paths: [...t1, ...t2, ...t3], cap: lineBudget(gestures, CELLS, { width: NIB }).length, t1n: t1.length, t2n: t2.length, t3n: t3.length };
  })() : null;
  const budgeted = (tiered ? tiered.paths : (num('inkbudget', preparing ? 0 : 6) > 0 ? lineBudget(gestures, CELLS, { width: 1.5 * K }) : gestures)).slice();
  console.log(`line budget: source ink ${(100 * share).toFixed(1)}% of cells, ${budgeted.length} of ${gestures.length} gestures`);
  // --outline 0|1: a lighter second pass on fainter ridges away from what is drawn, within the line budget. Default 1.
  // --outlinemin p: run it only when the source shows at least p per cent of its cells as line. Default 0.
  if (!fileReplacesWalk && opt('outline', '1') !== '0' && share >= num('outlinemin', 0) / 100) {
    const drawn = new Uint8Array(n);
    for (const g of budgeted) for (const q of g.points) { const x = Math.round(q.x), y = Math.round(q.y); if (x >= 0 && y >= 0 && x < w && y < h) drawn[y * w + x] = 1; }
    const away = dilate(drawn, w, h, Math.round(2 * K)), faint = Float32Array.from(field, (v, i) => (away[i] ? 0 : v));
    const nzf = Array.from(faint).filter(v => v > 0).sort((a, b) => a - b);
    const floorF = nzf.length ? nzf[Math.floor(nzf.length * num('outlinefloorq', 0.35))] : 0.05;
    // --outlinecarry: cells without ink the faint pass may cross (default 6); it draws a face's defining lines.
    const more = planGestures(faint, w, h, { floor: floorF, keep: num('keep', 400), claimRadius: 2 * K, reachShare: num('outlinereach', 0.05), turn: 1, carry: num('outlinecarry', 6) * K, scales: [0], tries: 3000 }).gestures;
    const used0 = budgeted.reduce((a, g) => a + (g.length ?? g.points.length) * 1.5 * K, 0);
    // --tier3faint: under --inktiers the faint pass gets a floor of its own, not only the leftovers.
    const left = TIERED ? Math.max(FAINT_CELLS, CELLS - used0) : Math.max(0, CELLS - used0);
    const extra = lineBudget(more, left, { width: 1.5 * K });
    console.log(TIERED
      ? `ink tier 3 faint:    ${extra.length}/${more.length} paths, ${Math.round(cellsOf(extra))} of ${Math.round(left)} cells`
      : `outline: ${extra.length} of ${more.length} fainter gestures`);
    budgeted.push(...extra.map(g => (TIERED ? { ...g, outline: true, tier: 3 } : { ...g, outline: true })));
  }
  // the mark cap, applied once the faint pass has been counted: see the tier block
  if (tiered && budgeted.length > tiered.cap) {
    const cut = Math.min(budgeted.length - tiered.cap, tiered.t3n);
    budgeted.splice(tiered.t1n + tiered.t2n + tiered.t3n - cut, cut);
    console.log(`ink tiers: ${cut} of the greedy walk's marks let go to hold the plain budget's ${tiered.cap}, ${budgeted.length} paths drawn`);
  }
  // --joingap g: join fragments whose ends face, tangents agree and gap runs along both (src/crop/joinlines.mjs). Default 0, off.
  // --dumpgestures path: the pen's gestures before joining, as JSON in sheet cells, one file per pass (-first, -last, -fine).
  if (opt('dumpgestures')) fs.writeFileSync(path.resolve(root, opt('dumpgestures').replace(/\.json$/, '') + `-${first ? 'first' : fine ? 'fine' : 'last'}.json`),
    JSON.stringify({ w, h, K, gestures: budgeted.map(g => ({ outline: !!g.outline, pass: g.pass, length: g.length, points: g.points.map(q => ({ x: +q.x.toFixed(2), y: +q.y.toFixed(2) })) })) }));
  const drawn = num('joingap', 0) > 0
    ? (() => { const r = joinLines(budgeted, { gap: num('joingap', 0) * K, cos: num('joincos', 0.94), aim: num('joinaim', 0.9) });
        console.log(`joined ${r.joined} line fragments: ${budgeted.length} gestures into ${r.gestures.length}`); return r.gestures; })()
    : budgeted;
  // The pen follows the subject, else the finish field, as the washes do. Ground texture is a cross hatch,
  // never a traced contour.
  const PEN_FIELD = ctx.SUBJECT ?? FINISH;
  const penKeep = PEN_FIELD ? (g => { let inside = 0; for (const q of g.points) { const x = Math.min(w - 1, Math.max(0, Math.round(q.x))), y = Math.min(h - 1, Math.max(0, Math.round(q.y))); if (PEN_FIELD[y * w + x] >= num('pendrawat', 0.5)) inside++; } return inside >= g.points.length * num('penkeep', 0.5); }) : null;
  // --drawingfile <base>: the first pen draws a selected drawing whole, in strokes of a person's length, and nothing
  // the walker found (src/paint/methods/drawing-file.mjs)
  // --massbudget cuts the closing pen inside the masses; the opening drawing keeps them unless --masscutfirst 1
  const cutPen = MASS_BUDGET && (!first || num('masscutfirst', 0) > 0) ? MASS_BUDGET.cutPen : g => g;
  const penWashPrune = PENWASH_PLAN && first && !fine ? lines => { const r = prunePenLines(lines, { w, h, mmPerCell: num('sheetmm', DEFAULT_SHEET_MM) / w, groups: PENWASH_INK_GROUPS, seed: 1 + Math.round(num('seed', 0)), options: { tileInkMm: num('pwtileink', 9), keepAbove: num('pwkeep', 0), minMm: num('pwspeck', 0.8), vary: num('pwpenvary', 0), structMm: num('pwpenstruct', 15) } }); ctx.PENWASH_LINES = r.stats; console.log(`pen wash lines: ${r.stats.out} of ${r.stats.in} lines kept (${r.stats.short} specks, ${r.stats.omitted} omitted, ${r.stats.duplicate} repeats, ${r.stats.density} over density), ink ${r.stats.inkMmOut} of ${r.stats.inkMmIn} mm`); return r.lines; } : null;
  const SELECTED = cutPen(selectedDrawing({ first, fine, w, h, opt, num, log: console.log, walked: drawn.length, D: DRAW_SOURCE, want: inkWant, cells: CELLS, K, style: DRAW_STYLE, prune: penWashPrune, families: VALUE_CONFIG?.families ?? null }));
  let kept = SELECTED ? SELECTED : cutPen(penKeep ? drawn.filter(penKeep) : drawn);
  // --inkskin x0,y0,x1,y1 (sheet fractions): the closing pen keeps off warm skin interiors of the figure in the box. Default off.
  // --inkskinerode: interior erosion in cells (default 3); --inkskinshare: share of points inside that drops a gesture (default 0.6).
  if (!first && opt('inkskin', '') !== '') {
    const [bx0, by0, bx1, by1] = String(opt('inkskin', '0,0,1,1')).split(',').map(Number);
    const fig = ctx.FW_SUBJ || ctx.SUBJECT || TIER_MASK, S0 = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const x = i % w, y = (i / w) | 0;
      if (x < bx0 * w || x > bx1 * w || y < by0 * h || y > by1 * h) continue;
      if (fig && fig[i] <= 0.5) continue;
      const r = ctx.px[i * 3], g = ctx.px[i * 3 + 1], b = ctx.px[i * 3 + 2], Y = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (r - b < num('inkskinwarm', 14) || Y < num('inkskinmin', 0.12) || Y > num('inkskinmax', 0.92)) continue;
      S0[i] = 1;
    }
    const interior = erode(S0, w, h, Math.max(1, Math.round(num('inkskinerode', 3) * K)));
    const skinShare = num('inkskinshare', 0.6);
    const before = kept.length;
    kept = kept.filter(g => {
      if (g.outline || g.tier === 1 || g.tier === 2) return true;
      let inside = 0; for (const q of g.points) { const x = Math.min(w - 1, Math.max(0, Math.round(q.x))), y = Math.min(h - 1, Math.max(0, Math.round(q.y))); inside += interior[y * w + x]; }
      return inside < g.points.length * skinShare;
    });
    console.log(`ink skin: ${before - kept.length} of ${before} closing gestures lie on skin interiors and are left off`);
  }
  // --inkoffbox x0,y0,x1,y1: every pen pass drops gestures with --inkoffshare (default 0.5) of points in the box, off the figure.
  // --inkoffoutline 1: the box also drops outlines. --inkoffline r: keep gestures with --inkofflineshare of points near reference line.
  // --inkofffoliage d: the same rule on foliage cells (green beats red and blue by d), smoothed by --inkofffoliager, cut at --inkofffoliagecut.
  // --inkoffsand 1: keep the pen off warm ground, found from the source and its sky and figure masks.
  const SAND_OFF = num('inkoffsand', 0) > 0 ? await (async () => {
    const { hasSegments, loadSegments } = await import('../../src/crop/segments.mjs');
    const base = path.basename(opt('image', ''), path.extname(opt('image', '')));
    const seg = hasSegments(base) ? await loadSegments(base, w, h) : null;
    const sky = seg?.regions.find(r => r.name === 'sky')?.mask;
    const fig = ctx.FW_SUBJ || ctx.SUBJECT;
    const m = Uint8Array.from({ length: n }, (_, i) => {
      if ((fig && fig[i] > 0.5) || (sky && sky[i])) return 0;
      const r = ctx.px[i * 3], g = ctx.px[i * 3 + 1], b = ctx.px[i * 3 + 2];
      return i >= Math.floor(h * num('sandfrom', 0.45)) * w && r - b > 8 && r >= g - 5 ? 1 : 0;
    });
    const radius = Math.max(1, Math.round(2 / (num('sheetmm', DEFAULT_SHEET_MM) / w)));
    return closeLocal(m, w, h, radius);
  })() : null;
  const INKOFF = opt('inkoffbox', '') !== '' || num('inkofffoliage', 0) > 0 || SAND_OFF ? (() => {
    const box = opt('inkoffbox', '') !== '' ? String(opt('inkoffbox', '0,0,1,1')).split(',').map(Number) : null;
    const fig = ctx.FW_SUBJ || ctx.SUBJECT, share = num('inkoffshare', 0.5);
    const at = (x, y) => Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)));
    const fd = num('inkofffoliage', 0);
    const fol = fd > 0 ? (() => {
      const g0 = Float32Array.from({ length: n }, (_, i) => (ctx.px[i * 3 + 1] - ctx.px[i * 3] >= fd && ctx.px[i * 3 + 1] - ctx.px[i * 3 + 2] >= fd ? 1 : 0));
      const s = gaussian(g0, w, h, Math.max(1, num('inkofffoliager', 2) * K));
      const cut = num('inkofffoliagecut', 0.5);
      let c = 0; const F = Uint8Array.from(s, v => (v > cut ? (c++, 1) : 0));
      console.log(`ink off foliage: ${(100 * c / n).toFixed(1)}% of the sheet reads as foliage`);
      return F;
    })() : null;
    const inBox = (x, y) => !(fig && fig[at(x, y)] > 0.5) && ((SAND_OFF && SAND_OFF[at(x, y)] === 1) || (fol && fol[at(x, y)] === 1) || (box && x >= box[0] * w && x <= box[2] * w && y >= box[1] * h && y <= box[3] * h));
    const lineR = num('inkoffline', 0), near = lineR > 0 ? dilate(SEP.ink, w, h, Math.max(1, Math.round(lineR * K))) : null;
    const lineShare = near ? num('inkofflineshare', 0.7) : 0;
    const off = g => { let c = 0, on = 0; for (const q of g.points) if (inBox(q.x, q.y)) { c++; if (near && near[at(q.x, q.y)]) on++; } return c >= g.points.length * share && !(near && on >= c * lineShare); };
    return { off, outlinesToo: num('inkoffoutline', 0) > 0 };
  })() : null;
  if (INKOFF) {
    const before = kept.length;
    kept = kept.filter(g => (g.outline && !INKOFF.outlinesToo) || !INKOFF.off(g));
    console.log(`ink off box: ${before - kept.length} of ${before} ${first ? 'opening' : fine ? 'fine' : 'closing'} gestures lie in the box and are left off`);
  }
  // --inkwiggle t: drop gestures whose back-and-forth turning exceeds t radians per 10 cells (resampled, smoothed). Default 0, off.
  const WIGGLE = num('inkwiggle', 0);
  const wiggleOf = g => {
    const step = 3 * K, R = [g.points[0]];
    for (let i = 1; i < g.points.length; i++) { const a = R[R.length - 1], b = g.points[i]; if (Math.hypot(b.x - a.x, b.y - a.y) >= step) R.push(b); }
    if (R.length < 5) return 0;
    const S = R.map((_, i) => { let x = 0, y = 0, s = 0; for (let j = -2; j <= 2; j++) { const q = R[Math.max(0, Math.min(R.length - 1, i + j))], k = 3 - Math.abs(j); x += k * q.x; y += k * q.y; s += k; } return { x: x / s, y: y / s }; });
    let sumAbs = 0, sum = 0, L = 0;
    for (let i = 1; i < S.length; i++) L += Math.hypot(S[i].x - S[i - 1].x, S[i].y - S[i - 1].y);
    for (let i = 2; i < S.length; i++) {
      let t = Math.atan2(S[i].y - S[i - 1].y, S[i].x - S[i - 1].x) - Math.atan2(S[i - 1].y - S[i - 2].y, S[i - 1].x - S[i - 2].x);
      while (t > Math.PI) t -= 2 * Math.PI;
      while (t < -Math.PI) t += 2 * Math.PI;
      sumAbs += Math.abs(t); sum += t;
    }
    return (sumAbs - Math.abs(sum)) / Math.max(1, L / (10 * K));
  };
  const wiggleLog = (gs, what) => { const v = gs.map(wiggleOf).sort((a, b) => a - b), q = p => (v.length ? v[Math.min(v.length - 1, Math.floor(v.length * p))].toFixed(2) : '-'); return `${what}: ${v.filter(x => x > WIGGLE).length} of ${v.length} turn back and forth over ${WIGGLE} and are left off (wiggle median ${q(0.5)}, 75th ${q(0.75)}, 90th ${q(0.9)})`; };
  if (WIGGLE > 0) {
    console.log(`ink wiggle, ${first ? 'opening' : fine ? 'fine' : 'closing'} gestures, ${wiggleLog(kept, 'gestures')}`);
    kept = kept.filter(g => wiggleOf(g) <= WIGGLE);
  }
  // --penface r: keep only gestures with --penfaceshare (default 0.7) of points within r cells of reference pen line. Default 0, off.
  const faceNear = num('penface', 0) > 0 ? dilate(FACE_INK(), w, h, Math.max(1, Math.round(num('penface', 0) * K))) : null;
  const faceOnLine = g => { let c = 0; for (const q of g.points) { const x = Math.min(w - 1, Math.max(0, Math.round(q.x))), y = Math.min(h - 1, Math.max(0, Math.round(q.y))); c += faceNear[y * w + x] ? 1 : 0; } return c >= g.points.length * num('penfaceshare', 0.7); };
  if (faceNear && !SELECTED) {
    const before = kept.length;
    kept = kept.filter(faceOnLine);
    console.log(`pen face: ${before - kept.length} of ${before} ${first ? 'opening' : fine ? 'fine' : 'closing'} gestures are off the reference's lines and are left off`);
  }
  if (penKeep && kept.length !== drawn.length) console.log(`pen: ${kept.length} of ${drawn.length} gestures lie on ${ctx.SUBJECT ? 'the subject' : 'the part of the sheet that is carried'}`);
  // Which tier paid for each path that reaches the nib, as a picture: the source in light grey, the outline tier blue,
  // the features green, the greedy walk red. Rewritten after each drawing pass, so a run stopped early leaves it.
  if (TIERED) {
    INK_TIER_LOG.push(...kept.filter(g => g.tier).map(g => ({ tier: g.tier, points: g.points })));
    await writeInkTiers(DRAW_SOURCE);
  }
  // --inkfilter: classify each path on the density the walker followed, once the budget and subject clip are applied.
  // The paths stay in the array either way: the schedule below is built from all of them.
  // --inkdarkskip v: no closing pen line inside the plan's darkest washes (planned value above v); the opening drawing
  // goes under the washes as a painter's does. src/paint/methods/ink-dark-skip.mjs
  if (ctx.VALUE_PLAN && !first && num('inkdarkskip', 0) > 0) { const before = kept.length; kept = cutInDarkWash(kept, ctx.VALUE_PLAN.value.values, w, h, num('inkdarkskip', 0)); console.log(`ink dark skip: ${before} ${first ? 'opening' : 'closing'} gestures cut to ${kept.length} runs outside planned value ${num('inkdarkskip', 0)}`); }
  // A prepared pencil drawing describes the same contours as pen, including paper-light borders.
  if(ctx.VALUE_PLAN){const before=kept,sourceInk=drawsWholeFile({first,fine,graphiteFirst,drawingFile:opt('drawingfile',''),closingFile:opt('drawinglast',''),sourceInk:sourceInkDrawing()});
    kept=selectValueInk(before,{first,w,h,sourceInk,density:ctx.VALUE_PLAN.value.values,reserves:ctx.VALUE_PLAN.protectedCells,shaped:ctx.VALUE_PLAN.instructions[0]?.shaped,subject:VALUE_CONFIG?.subject,styleSelection:VALUE_CONFIG?.styleSelection});
    // --lineedges 0 turns it off. A line from the plan's drawing file is drawn only when at least half of it lies on an
    // edge of a planned passage (src/paint/methods/line-support.mjs); a line inside one planned mass is left off whole.
    // The slack is one source pixel. A source's own pen lines are drawn as they are.
    if(num('lineedges',1)>0&&!sourceInkDrawing()&&drawsWholeFile({first,fine,graphiteFirst,drawingFile:opt('drawingfile',''),closingFile:opt('drawinglast','')})){
      ctx.LINE_EDGES??=plannedEdges(ctx.VALUE_PLAN.instructions,n);
      const r=supportedLines(kept,{edges:ctx.LINE_EDGES,w,h,tol:Math.max(1,Math.round(w/srcMeta.width))});kept=r.kept;
      console.log(`line support, ${first?'opening':fine?'fine':'closing'}: ${r.kept.length} of ${r.kept.length+r.dropped.length} lines lie mostly on planned passage edges and are drawn; ${r.dropped.length} inside planned masses are left off`);
    }
    const tally={};for(const g of before){const r=valueInkVerdict(g,{first,w,h,density:ctx.VALUE_PLAN.value.values,reserves:ctx.VALUE_PLAN.protectedCells});if(r!=='kept')tally[r]=(tally[r]??0)+1;}
    console.log(`value ink, ${first?'opening':fine?'fine':'closing'}: ${kept.length} of ${before.length} lines kept${sourceInk?' (drawn whole)':''}; the line filter marks ${Object.entries(tally).map(([k,v])=>`${v} ${k}`).join(', ')||'none'}`);}
  const passName = first ? 'first' : fine ? 'fine' : 'last';
  const inkVerdict = INKFILTER && !SELECTED ? classifyInkPaths(kept, DRAW_SOURCE, w, h, { scale: num('inkfilterscale', K), accent: num('inkfilteraccent', 10) * K }) : null;
  if (inkVerdict) {
    INK_FILTER_LOG.push(...inkVerdict.map((e, i) => ({ ...e, pass: passName, points: kept[i].points })));
    const c = inkFilterCounts(inkVerdict);
    console.log(`ink filter: kept ${c.kept} of ${c.total} (contour ${c.contour}, accent ${c.accent}; dropped wash ${c.wash}, dry ${c.dry}, texture ${c.texture})`);
    await writeInkFilter(DRAW_SOURCE);
  }
  // a selected drawing's points may carry their own pressure share and contact width (drawing-file.mjs), in plan cells
  let scaled = scaleDrawingGestures(kept, SC).map((g,i)=>({...g,ml:!!g.ml,draw:!inkVerdict||inkVerdict[i].kept}));
  // the graphite pool drawing: each line presses as dark as the subject's own line there, by a scrap of this paper (graphite-pool.mjs)
  if(graphiteFirst){const r=weighGraphiteDrawing(scaled,{medium:opt('graphiteprofile',REQUESTED_DRAW_MEDIUM.startsWith('graphite-')?REQUESTED_DRAW_MEDIUM:'graphite-HB'),mmPerCell:(PB?.mm??num('sheetmm', DEFAULT_SHEET_MM))/W2,paperOpts:ctx.PAPER_OPTS,out,log:console.log});scaled=r.strokes;if(r.stats&&ctx.GRAPHITE_POOL)ctx.GRAPHITE_POOL.lineWeight=r.stats;}
  scaled=prepareDrawing(scaled,{medium:graphiteFirst?opt('graphiteprofile',REQUESTED_DRAW_MEDIUM.startsWith('graphite-')?REQUESTED_DRAW_MEDIUM:'graphite-HB'):opt('inkprofile',REQUESTED_DRAW_MEDIUM.endsWith('-ink')?REQUESTED_DRAW_MEDIUM:STYLE_INK_DEFAULT),stage:first?'opening':'closing',mmPerCell:(PB?.mm??num('sheetmm', DEFAULT_SHEET_MM))/W2,edgeStrength:TARGET_DRAW_EDGE,w:W2,h:H2,caps:{...drawingCapsFor(first?'opening':'closing',graphiteFirst),share:SELECTED?1:num('drawshare',1)}});
  // the pressure along each gesture: the ridge's strength, or under --penwant glaze that times the share left to the ink
  // once the glazes are over it, not below --penfloor (default 0.2). The full-pressure point comes from ridge strength alone.
  const press = penWant !== 'glaze' ? field : Float32Array.from(field, (v, i) => v * Math.max(num('penfloor', 0.2), Math.min(1, (DRAW_SOURCE[i] - planD[i]) / Math.max(1e-3, DRAW_SOURCE[i]))));
  const peakOf = (() => { const v = []; for (const g of budgeted) for (const q of g.points) { const x = Math.round(q.x), y = Math.round(q.y); if (x >= 0 && y >= 0 && x < w && y < h) v.push(field[y * w + x]); } v.sort((a, b) => a - b); return v.length ? Math.max(1e-4, v[Math.floor(v.length * 0.95)]) : null; })();
  const peak = penWant === 'glaze' ? peakOf : null;
  const big = SC === 1 ? press : Float32Array.from({ length: N2 }, (_, i) => press[(((i / W2) | 0) / SC | 0) * w + ((i % W2) / SC | 0)]);
  let outlines = null;
  if (first && !SELECTED && opt('penoutline', VALUE_ENABLED ? '0' : '1') !== '0') {
    const sil = silhouette(DRAW_SOURCE, w, h, gaussian, { scale: num('silscale', 4) * K });
    // --outlineskip 1: cut the outline where the source has a line within --outlineskipr cells (default 3), so it is not doubled.
    const skipNear = opt('outlineskip', '0') !== '0' ? dilate(SEP.ink, w, h, Math.round(num('outlineskipr', 3) * K)) : null;
    const minPts = Math.max(3, Math.round(num('silmin', 12) * K / 2));
    // --outlinesource edges: the pencil follows form edges (src/crop/contours.mjs), else the outline of tone masses. Default edges.
    const traced = opt('outlinesource', 'edges') === 'edges'
      ? edgeChains(DRAW_SOURCE, w, h, gaussian, { sigma: num('edgesigma', 1.5) * K, minLength: Math.round(num('edgemin', 20) * K), margin: num('silmargin', 0.04), step: Math.max(1, Math.round(2 * K)), high: num('edgehigh', 0.85) })
      : traceOutlines(sil, w, h, { minLength: Math.round(num('silmin', 12) * K), step: Math.max(1, Math.round(2 * K)) });
    const outlineCells = traced
      // --silmargin: cut chains within this share of the sheet's side of its edge, so a scan's border is not drawn. Default 0.04.
      .flatMap(g => {
        const mg = num('silmargin', 0.04), mx = mg * w, my = mg * h, inside = q => q.x >= mx && q.y >= my && q.x < w - mx && q.y < h - my;
        if (mg <= 0) return [g];
        const runs = []; let cur = [];
        for (const q of g.points) { if (inside(q)) cur.push(q); else { if (cur.length >= minPts) runs.push({ points: cur }); cur = []; } }
        if (cur.length >= minPts) runs.push({ points: cur });
        return runs;
      })
      .flatMap(g => {
        if (!skipNear) return [g];
        const runs = []; let cur = [];
        for (const q of g.points) { const i = Math.round(q.y) * w + Math.round(q.x); if (skipNear[i]) { if (cur.length >= minPts) runs.push({ points: cur }); cur = []; } else cur.push(q); }
        if (cur.length >= minPts) runs.push({ points: cur });
        return runs;
      })
      // The outline pass is clipped too, here, in sheet coordinates, before the scale up.
      .filter(g => !penKeep || penKeep(g))
      .filter(g => !faceNear || faceOnLine(g))
      .filter(g => !INKOFF || !INKOFF.outlinesToo || !INKOFF.off(g))
      .filter((g, i, all) => { if (!(WIGGLE > 0)) return true; if (i === 0) console.log(`ink wiggle, ${wiggleLog(all, 'outlines')}`); return wiggleOf(g) <= WIGGLE; });
    // The silhouette pass is filtered on the same evidence: a chain traced round a patch of texture is as unwanted as
    // a walked one. Its want is a constant and its peak is already fixed at 1, so only the batch boundaries are frozen.
    const outlineVerdict = INKFILTER ? classifyInkPaths(outlineCells, DRAW_SOURCE, w, h, { scale: num('inkfilterscale', K), accent: num('inkfilteraccent', 10) * K }) : null;
    if (outlineVerdict) {
      INK_FILTER_LOG.push(...outlineVerdict.map((e, i) => ({ ...e, pass: `${passName}-silhouette`, points: outlineCells[i].points })));
      const c = inkFilterCounts(outlineVerdict);
      console.log(`ink filter: kept ${c.kept} of ${c.total} (contour ${c.contour}, accent ${c.accent}; dropped wash ${c.wash}, dry ${c.dry}, texture ${c.texture})`);
      await writeInkFilter(DRAW_SOURCE);
    }
    outlines = outlineCells.map((g, i) => ({ draw: !outlineVerdict || outlineVerdict[i].kept, points: g.points.map(q => ({ x: q.x * SC, y: q.y * SC })) }));
  }
  // Batches and pressure come from the whole planned set, not the survivors: drawGestures normalises pressure to the
  // 95th percentile of the want under its paths. So the peak and batch boundaries come from the unfiltered batch.
  const frozenPeak = gs => { const v = []; for (const g of gs) for (const q of g.points) v.push(big[Math.max(0, Math.min(H2 - 1, Math.round(q.y))) * W2 + Math.max(0, Math.min(W2 - 1, Math.round(q.x)))]); v.sort((a, b) => a - b); return v.length ? Math.max(1e-4, v[Math.floor(v.length * 0.95)]) : 1; };
  // The outline tier lies where the ridge field is gated to zero, so it takes a constant want at a fixed peak,
  // as the silhouette pass does; other paths in the batch cannot change its pressure.
  // a selected drawing brings its own pressure, stroke by stroke (--drawwant times each line's weight)
  const wantT1 = SELECTED ? drawingWant(SELECTED, W2, H2, SC, { base: num('drawwant', num('tier1want', 0.6)), floor: num('drawfloorwant', 0.15) }) : TIERED ? new Float32Array(N2).fill(num('tier1want', 0.6)) : null;
  const per = Math.max(1, Math.ceil(scaled.length / 8));
  return { preparing, PEN, K, graphiteFirst, inkPig, scaled, wantT1, big, peak, inkVerdict, frozenPeak, per, SELECTED, outlines, gestures };
}
Object.assign(ctx, { FRAMES, snap, FULL_TAPE, MARKTAPE, AWARE_DIR, RESUME_DIR, RESUME_AT, shoot, WETFRAMES, 
  PASSFRAMES, WET_STEPS, FILM_BY_PAINT, PEN_FRAMES, PENWASH, PENWASH_PLAN, penWashFlat, LOOK_AL, 
  LOOK_PLAN, SOURCE_INK, TIER_MASK });
}
