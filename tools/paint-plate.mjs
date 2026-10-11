#!/usr/bin/env node
import { drawFineMaterial } from '../src/paint/methods/fine-material.mjs';
import {framePolicy} from './speed/frame-policy.mjs';
import {startSpeedProfile} from './speed/profile.mjs';
import {estimatePaper} from '../src/paint/methods/light-to-dark.mjs';
import {splitLoadsFeathered} from '../src/paint/methods/brushes.mjs';
import {writeInkLines} from '../src/crop/ink-lines-file.mjs';
import {cutInDarkWash} from '../src/paint/methods/ink-dark-skip.mjs';
import {createDeliveryCal} from '../src/paint/methods/delivery-cal.mjs';
import {materialProfile,drawMaterial,prepareDrawing,drawingCaps,sourceDrawingCaps} from '../src/paint/methods/material-profiles.mjs';
import {passageBrushPaths} from '../src/paint/methods/passage-brush.mjs';
import {resolveStyle,loadSubjects} from '../src/paint/styles/loader.mjs';
import {shapedPlanePaths} from '../src/paint/techniques/shaped-marks.mjs';
import {shapeStoneDemand} from '../src/paint/tuned/stone-demand.mjs';
import {GROUND} from '../src/paint/tuned/trumbull.mjs';
import {TEX_ZONE,TRACE_BOX} from '../src/paint/tuned/portrait.mjs';
import {setTextureVariety,setTextureFlow,flowField} from '../src/paint/techniques/shaped-marks.mjs';
import {planLightToDark,valueTechnique,selectValueInk,softBoundaryPaths} from '../src/paint/methods/light-to-dark.mjs';
import {unsupportedAxisEdges} from '../src/paint/methods/target-regions.mjs';
import {writeValuePreview} from './painter/value-plan-preview.mjs';
import {removePlannedInk} from '../src/crop/ink-free.mjs';
import {subjectField,orderBySubject,OVERLAP} from '../src/paint/methods/subject-order.mjs';
import { availableParallelism } from 'node:os';
import { boundsOf } from '../src/mask-bounds.mjs';
import { DEFAULT_SHEET_MM } from '../src/media/sheet-size.mjs';
import { resolveOutlineMedium, describeOutlineMedium } from '../src/paint/methods/outline-medium.mjs';
import {recordGraphiteBatch} from './painter/record-graphite.mjs';
import {createReceiverObserver} from './painter/numeric-receiver-observer.mjs';
import {bindFinishingArea,appendFinishingLayers,finishingPaletteKeys} from './painter/finishing-area.mjs';
import {nativeBodyCadence} from './painter/native-body-cadence.mjs';
import {numericalGlazePasses} from './painter/numerical-glaze-passes.mjs';
import {numericTuftEligible,calibrateNumericTuft} from './painter/numeric-tuft-calibration.mjs';
import {validateProductionDetails,productionDetailContext,productionChargeLink,productionContinuationReady,prepareProductionDryContact,productionChargeSupported,validateCompiledAreaStop} from './painter/semantic-production-details.mjs';
import { allocateShapeLocalCharge, ownedComponentLoad } from '../src/paint/methods/shape-local-charge.mjs';
import {connectedSkyBoundary,connectedSkyContact,chooseMajorBaseWash, legacyIntentFamily, validateLegacyIntent, prepareMajorDryBase, sameUnliftedMajorGesture} from './painter/legacy-major-intents.mjs';
import {nativePaintMode, nativeDryOptions, nativeUploadPolicy} from './painter/native-paint-mode.mjs';

import {semanticBrushObservation} from './painter/semantic-brush-observation.mjs';
import {lowerAuthoredGestures,admitAuthoredContact} from './painter/authored-gestures.mjs';
import { settleAuthoredWetEdge, observeFreeFilmStroke,authoredPalette,waitForAuthoredDry} from './painter/authored-paint.mjs';
// PAINT_MEMLOG=s: print process.memoryUsage (MB) every s seconds, to find what grows on big sheets.
if(Number(process.env.PAINT_MEMLOG)>0){const t0=Date.now();setInterval(()=>{const m=process.memoryUsage();console.log(`memlog ${((Date.now()-t0)/1000).toFixed(0)}s rss ${(m.rss/1048576)|0} heapUsed ${(m.heapUsed/1048576)|0} heapTotal ${(m.heapTotal/1048576)|0} external ${(m.external/1048576)|0} arrayBuffers ${(m.arrayBuffers/1048576)|0}`);},Number(process.env.PAINT_MEMLOG)*1000).unref();}
// Paint a plate with the simulated instruments: glazes of recovered pigment laid by a brush on absorbent paper.
// Usage: node tools/paint-plate.mjs --image <reference> --width 700 --out work/plate
import {AUTHORING_CONTRACT,validateAreaDocument,rasterAreaPlan,compileAreaLayers,semanticTechnique,createAreaExecution,semanticMaterialReady,semanticDrawingGroups,semanticBrushOptions,semanticHighlights,semanticUsesNumericClip,semanticMaterialContact,semanticPreparation,withSemanticWaterClip,semanticPrewetLoad,prepareSemanticContact,semanticGesture,semanticPreparationGesture,semanticReferenceLengths, calibrateSemanticInstrument,semanticCalibrationGain,semanticCalibrationStages,semanticCalibrationSelection,requireAuthoredCalibration,semanticFilmRemovalReady,sha256} from './painter/semantic-areas.mjs';
import {measurePaper,measureBrush} from '../src/paint/methods/wetdry.mjs';
import {productionWaterLoad} from './painter/production-water-load.mjs';
import {earlyDryBoundary} from './painter/early-dry-boundary.mjs';
if(process.argv.includes('--areahelp')){console.log(JSON.stringify(AUTHORING_CONTRACT,null,2));process.exit(0);}
import { smoothUp } from '../src/paint/methods/smoothup.mjs';
import { cachedStep, codeHash } from '../src/paint/run-cache.mjs';
import {cachedSemanticInstrument,instrumentCodeHash} from './painter/semantic-instrument-cache.mjs';
import { loadStats, panelSVG } from './stroke-stats.mjs';
import { evaluateGate, printGate } from './stroke-gate.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { prepareOutputDirectory } from '../src/paint/output-directory.mjs';
import { execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { makePaper, coldPressField } from '../src/media/paper.mjs';
import { createSheet, step, dry as physicalDry, layersOf, thickness, layersChanged, DEFAULTS, tapeSheet, blot, setThreads, threadStats, coherent } from '../src/media/sheet.mjs';
import { attachGpu, gpuStats } from '../src/media/gpu/link.mjs';
import { renderLayers, renderLayersCached, renderCells, microAmps } from '../src/media/km.mjs';
import { renderSheet } from '../src/media/render-cache.mjs';
import { createFramer } from '../src/media/gpu/framer.mjs';
import { createBrush as createBrushRaw, dip as dipBrush, stroke as physicalStrokeRaw, candidateContact as candidateContactRaw, recordMarks, thirsty, setWashSplat } from '../src/media/brush.mjs';
import { paperOf, pickPalette, paletteOptions } from '../src/crop/palettepick.mjs';
import { widePalette, puddleLabels } from '../src/crop/palettewide.mjs';
import { channelDensity, unmix } from '../src/crop/pigments.mjs';
import { accentCells, accentFamilies } from '../src/paint/methods/final-darks.mjs';
import { blockInPigments, gradeSmoothPassages, dropMask } from '../src/crop/blockin.mjs';
import { choosePlateMixes, toMixAmounts, panMix } from '../src/crop/mixes.mjs';
import { shapeDeficit, shapeCharge, shapeOwedColour } from '../src/paint/methods/shape-deficit.mjs';
import { washPaths, brushedWashPaths, sweepCover, sweepCount, containPaths, gradientSweepAngle, openEdgeShare, prewetArea, softArcs, soften } from '../src/media/wash.mjs';
import { loadSubject, splitFirstWash, softenFirstWash } from '../src/paint/methods/first-wash.mjs';
import { faceDetail } from '../src/paint/techniques/face-detail.mjs';
import { measureLine, pencilDraw as physicalPencilDraw } from '../src/paint/methods/pencil-line.mjs';
import { localSubjectWash } from '../src/paint/techniques/subject-local.mjs';
import { pencilBatches, penEndPosition, eraseFactor, prepFade } from '../src/paint/methods/pencil-stage.mjs';
import { tintRegions, tintSubject } from '../src/paint/techniques/subject-tint.mjs';
import { painterOrder, subjectRegions } from '../src/paint/methods/painter-order.mjs';
import { hasLines, loadLines, linePaths } from '../src/crop/lines.mjs';
import { deferredFirstWash } from '../src/paint/methods/colour-budget.mjs';
import { retimeRun, codeForImage, concatList, phaseAt, phaseShares, PHASES, labelFrames } from '../src/paint/film-timeline.mjs';
import { distanceToZero } from '../src/raster.js';
import { components, removeSmall, open as openMask, dilate, erode, minFilter, maxFilter, closeLocal } from '../src/raster.js';
import { chooseTechnique, detailMarks } from '../src/crop/technique.mjs';
import { intermediates, execution } from '../src/eval/composite.mjs';
import { gaussian } from '../src/keyframes/density.mjs';
import { applyResist, liftResist, setClip as physicalSetClip } from '../src/media/sheet.mjs';
import { makeCrisp } from '../src/paint/methods/crisp-edges.mjs';
import { breakLights } from '../src/paint/methods/lights-shape.mjs';
import { detailLayers, trimPassage } from '../src/paint/methods/detail-passes.mjs';
import { shapeFlecks } from '../src/paint/methods/flecks.mjs';
import { litPlanes } from '../src/paint/techniques/lit-planes.mjs';
import { facePlanes } from '../src/paint/techniques/face-planes.mjs';
import { softMask } from '../src/paint/methods/soft-mask.mjs';
import { planGestures, longShare } from '../src/crop/gestures.mjs';
import { joinLines } from '../src/crop/joinlines.mjs';
import { styleTarget, massesOf } from '../src/crop/styletarget.mjs';
import { lineField, lineBudget } from '../src/media/draw.mjs';
import { classifyInkPaths, inkFilterCounts, inkFilterOverlay } from '../src/crop/inkfilter.mjs';
import { pathLength, straightness, meanContrast, insideShare, onShare, inkTierOverlay } from '../src/crop/inktiers.mjs';
import { separate } from '../src/crop/inkwash.mjs';
import { orientationField, furMarks } from '../src/crop/fur.mjs';
import { silhouette, traceOutlines } from '../src/crop/outline.mjs';
import { edgeChains } from '../src/crop/contours.mjs';
import { drawAs } from '../src/crop/simplify.mjs';
import { finishField, clipToFinish } from '../src/crop/finish.mjs';
import { labPlanes } from '../src/eval/colour.mjs';
import { smallLights, paperDensity, cellShare, fillReserved, keepLargestLights } from '../src/crop/lights.mjs';
import { gouacheCover, dryCover, overlay } from '../src/media/gouache.mjs';
import { planCurls } from '../src/crop/curls.mjs';
import { layCurls } from '../src/crop/curlpaint.mjs';
// Optional stages, one module each, off unless their flag is given.
import { furLightReserves } from '../src/paint/methods/finish-texture.mjs';
import { sameWash } from '../src/paint/methods/wash-session.mjs';
import { expandRecipe } from '../src/paint/recipe.mjs';
import { versionStamp, versionLine } from '../src/painter-version.mjs';
import { pigmentPhysics } from '../src/paint/methods/pigment-physics.mjs';
import { segmentInk } from '../src/paint/methods/seg-ink.mjs';
import { mlLines } from '../src/paint/methods/ml-lines.mjs';
import {prepareReviewedCropDrawing,reviewedOpeningStrategy} from '../src/paint/methods/drawing-logic.mjs';
import { selectedDrawing, drawingWant } from '../src/paint/methods/drawing-file.mjs';
import { prepareLineSource, planLinework } from '../src/paint/methods/linework-plan.mjs';
import { scaleLines } from '../src/crop/lines.mjs';
import { planLines as planLineChoice } from '../src/paint/drawing-plan.mjs';
import { makeInkRes } from '../src/paint/methods/ink-res.mjs';
import { localLights } from '../src/paint/methods/local-lights.mjs';
import { makeMopLanes } from '../src/paint/methods/mop-lanes.mjs';
import { paintMasses } from '../src/paint/methods/masses.mjs';
import { paintShapes } from '../src/paint/methods/shapes.mjs';
import { passageHook } from '../src/paint/methods/passages.mjs';
import { leftToTheWashes } from '../src/paint/methods/ladder-seg.mjs';
import { massBudget } from '../src/paint/methods/mass-budget.mjs';
import { darkMass } from '../src/paint/techniques/dark-mass.mjs';
import { dogPaint } from '../src/paint/techniques/dog-paint.mjs';
import { paintPractice } from '../src/paint/methods/practice-paint.mjs';
import { planModulation, joinResist, layDryBrush, dryMarkPath, dryMarkBrush } from '../src/paint/methods/modulate.mjs';
import { dragRegion, thinForDrags, layDrags } from '../src/paint/methods/drags.mjs';
import { loadFocus, mergeShapes, completeBudget, budgetPaths, strokeBudgetDefaults } from '../src/paint/methods/stroke-budget.mjs';
import { loadPhysical, splitLoads } from '../src/paint/methods/brushes.mjs';
import { massPuddles, orderByMass, edgeReach } from '../src/paint/methods/mass-wash.mjs';
import { measureStyle } from '../src/paint/methods/practice-style.mjs';
import { createTargetGuard, writeGuardReport, DEFAULT_MODE, HARD_LOOK_BUDGET } from './guard/no-target.mjs';
import { cheatRisk } from './guard/cheat-risk.mjs';
import { createPause } from './aware/pause.mjs';
import { writeState, readState } from './aware/state-io.mjs';
import { tapeState, restoreTapeState } from '../src/media/brush.mjs';

// the last of a repeated flag wins, so a batch script can append overrides to a shared set
// GPU paths default on for painter runs; set 0 to turn one off.
// The defaults live here because generic dry() callers may depend on synchronous counts.
process.env.GPU_RESIDENT ??= '1';
process.env.GPU_COMPOSITE ??= '1';
process.env.GPU_ASYNC_DRY ??= '1';

const argv0 = process.argv.slice(2);
// --recipe: a named preset of flags put in front of the command line (src/paint/recipe.mjs)
const { argv, note: RECIPE_NOTE, pipeline: PIPELINE } = expandRecipe({ argv: argv0, root: path.dirname(path.dirname(fileURLToPath(import.meta.url))) });
// every option name the painter asks for, so options given but never read are reported at the end
const OPTS_READ = new Set(['recipe']);
// OPT_TRACK: while a cached step runs (src/paint/run-cache.mjs), every option it reads and the raw value it found
let OPT_TRACK = null;
const opt = (n, d) => { OPTS_READ.add(n); const i = argv.lastIndexOf('--' + n); if (OPT_TRACK) OPT_TRACK.push([n, i >= 0 ? argv[i + 1] ?? null : null]); return i >= 0 ? argv[i + 1] : d; }, num = (n, d) => Number(opt(n, d));
// An explicit budget changes planning only; absent/zero preserves every default.
const STROKE_BUDGET = num('strokebudget', 0);
for(const [key,value] of Object.entries(strokeBudgetDefaults(STROKE_BUDGET))) if(!argv0.includes('--'+key)) argv.push('--'+key,String(value));
// --texvariety v: how much the short texture marks vary in length and pressure (src/paint/techniques/shaped-marks.mjs)
setTextureVariety(num('texvariety', 0));
// Per-subject rules, on only when a preset the plan or --recipe names sets them (src/paint/tuned/presets.mjs):
// --trumbullrules 1 (trumbull), --portraitrules 1 (portrait-3t), --recesses 1 (architecture).
const TRUMBULL_RULES = num('trumbullrules', 0) > 0, PORTRAIT_RULES = num('portraitrules', 0) > 0, RECESSES = num('recesses', 0) > 0;
const optTrack = {
  start() { OPT_TRACK = []; },
  stop() { const r = OPT_TRACK; OPT_TRACK = null; return r; },
  current(n) { const i = argv.lastIndexOf('--' + n); return i >= 0 ? argv[i + 1] ?? null : null; },
  replay(names) { for (const k of names) OPTS_READ.add(k); },
};
const NATIVE_PAINT_MODE = nativePaintMode(opt('mode', 'fast'));
// Reuse the tracked, exact CPU fallback transfer path independently of Fast physics.
const SPEED_TRANSFERS = num('speedtransfers', 1) > 0;
const SPEED_PAPER = num('speedpaper', 0) > 0;
const SPEED_GPU_OPTICS = num('speedopticalgpu', 0) > 0;
if (SPEED_TRANSFERS) process.env.GPU_DEMAND_READBACK ??= 'fast';
const NATIVE_UPLOAD_POLICY = nativeUploadPolicy(NATIVE_PAINT_MODE.mode, process.env.GPU_DIRTY_UPLOAD);
if (SPEED_TRANSFERS && process.env.GPU_DIRTY_UPLOAD == null) {
  Object.assign(NATIVE_UPLOAD_POLICY, { value: '1', enabled: true, selection: 'speed-transfer-default' });
}
process.env.GPU_DIRTY_UPLOAD ??= NATIVE_UPLOAD_POLICY.value;
NATIVE_PAINT_MODE.uploadPolicy = NATIVE_UPLOAD_POLICY;
// --video 0|1: 0 keeps stage images and passage checkpoints; 1 retains and encodes the film. Default 1.
const OUTPUT_VIDEO = num('video', 1);
if (![0,1].includes(OUTPUT_VIDEO)) throw Error('--video takes 0 or 1');
// Diagnostic counters preserve dispatch ordering; GPU times are sampled, not serialized.
process.env.GPU_FUSE_WETSCAN = String(num('speedscan', 1));
process.env.GPU_EDGE_PINGPONG = String(num('speededge', 1));
// Parallel optics improved the 540-cell runs; native-size trials showed no gain.
const SPEED_RENDER_THREADS = Math.max(1, Math.min(16, Math.floor(num('speedrenderthreads', opt('gpu', 'auto') === 'off' || num('width', 700) > 540 ? 1 : Math.min(4, availableParallelism())))));
process.env.KM_PARALLEL_CELLS = SPEED_RENDER_THREADS > 1 ? '1' : '0';
const FRAME_POLICY = framePolicy({ video: OUTPUT_VIDEO, keepAll: num('keepallframes', 0) > 0 });
const SPEED_PROFILE = startSpeedProfile(num('speedprofile', 0) > 0);
const CPU_PROFILE = num('speedcpu', 0) > 0 ? await import('./speed/cpu-profile.mjs').then(m => m.startCpuProfile()) : null;
void opt('downtrace', '0'); // tracing is selected from argv while GPU modules load

if (RECIPE_NOTE) console.log(RECIPE_NOTE);
// The release, painter and sim versions and the git commit, recorded in frames.json and backend.json (docs/versions.md)
const PAINTER = versionStamp();
console.log(`${versionLine(PAINTER)}${PAINTER.commit ? ` at ${PAINTER.commit.slice(0, 12)}` : ''}`);
// --threads N: large wet boxes step in row bands on N threads (src/media/sheet-par.mjs); output is bit-identical.
// Default up to 6 in fast mode, 1 in full mode.
const THREADS_DEFAULT = NATIVE_PAINT_MODE.mode === 'fast' ? Math.max(1, Math.min(6, availableParallelism() - 2)) : 1;
if (await setThreads(num('threads', THREADS_DEFAULT)) > 1) process.on('exit', () => console.log(`threads: ${num('threads', THREADS_DEFAULT)}, boxes stepped in bands and serially: ${JSON.stringify(threadStats())}`));
let opticalThreads = 1;
if (SPEED_RENDER_THREADS > 1) {
  const opticsPool = await import('../src/media/sheet-par.mjs');
  opticalThreads = opticsPool.threads() > 1 ? opticsPool.threads() : opticsPool.start(SPEED_RENDER_THREADS, { opticsOnly: true });
}
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.resolve(root, opt('out', 'work/plate'));
// a fresh process taking over a saved painting (--resumestate) continues in the painting's own folder
if (opt('resumestate', '')) { if (!fs.existsSync(path.join(out, 'f0000.jpg'))) throw new Error('--resumestate: ' + out + ' holds no painting to continue'); } else prepareOutputDirectory(out);
// Legacy extraction flags remain CLI aliases; the plan has one source choice.
if (!argv0.includes('--linesource')) {
  if (num('copylines',0)>0) argv.push('--linesource','source-ink');
  else if (num('sketchlines',0)>0) argv.push('--linesource','photo-sketch');
  else if (num('sourcelines',0)>0) argv.push('--linesource','source-ink');
}
const EARLY_LINES = !opt('resumestate','') && !['none','auto'].includes(opt('linesource','none'))
  ? await prepareLineSource({opt,num,argv,out,root,log:console.log}) : null;
process.env.GPU_DEMAND_READBACK ??= NATIVE_PAINT_MODE.mode==='fast'?'fast':'0';
process.env.GPU_SIGNED_ZERO ??= NATIVE_PAINT_MODE.mode==='fast'?'ignore':'exact';
const FAST_PAPER_OBSERVE=num('fastpaperobserve',NATIVE_PAINT_MODE.mode==='fast'?1:0);
if(![0,1].includes(FAST_PAPER_OBSERVE))throw Error('--fastpaperobserve takes 0 or 1');
const PAPER_OBSERVE_POLICY={requested:FAST_PAPER_OBSERVE,enabled:NATIVE_PAINT_MODE.mode==='fast'&&FAST_PAPER_OBSERVE===1&&process.env.GPU_PAPER_OBSERVE!=='0',scope:'fresh regional W/s plus wet-recipient M observation only; pigment/layer freshness independent; CPU stroke/demand windows use original full observation'};
process.env.GPU_PAPER_OBSERVE=PAPER_OBSERVE_POLICY.enabled?'1':'0';NATIVE_PAINT_MODE.paperObservation=PAPER_OBSERVE_POLICY;
NATIVE_PAINT_MODE.syncPolicy={demand:process.env.GPU_DEMAND_READBACK,paperObservation:PAPER_OBSERVE_POLICY.enabled,frames:!FRAME_POLICY.all?'completed passage checkpoints at 10/25/50/75/100 percent; first wash and other stages retained':NATIVE_PAINT_MODE.mode==='fast'?'completed paint boundary every fourth pass; other stages retained; no within-stroke snapshots':'full existing cadence',optical:NATIVE_PAINT_MODE.mode==='fast'||SPEED_GPU_OPTICS?'GPU optical RGB for frame and density feedback':'CPU composite',mask:NATIVE_PAINT_MODE.mode==='fast'?'demand CPU uploads conservatively retain all pigment lanes and signed zero':'original'};
fs.writeFileSync(path.join(out,'native-paper-observation.json'),JSON.stringify(PAPER_OBSERVE_POLICY,null,2));
fs.writeFileSync(path.join(out,'native-mode.json'),JSON.stringify(NATIVE_PAINT_MODE,null,2));
const FAST_BODY_ENABLED=num('fastbodycadence',NATIVE_PAINT_MODE.mode==='fast'?1:0);
if(![0,1].includes(FAST_BODY_ENABLED))throw Error('--fastbodycadence takes 0 or 1');
const FAST_BODY_SPACING=num('fastbodyspacing',1.4);
nativeBodyCadence({mode:NATIVE_PAINT_MODE.mode,enabled:Boolean(FAST_BODY_ENABLED),spacing:FAST_BODY_SPACING});
const BODY_CADENCE_RECORD={mode:NATIVE_PAINT_MODE.mode,enabled:Boolean(FAST_BODY_ENABLED),selection:opt('fastbodycadence',null)===null?'paint-mode default':'explicit CLI',spacingCells:FAST_BODY_SPACING,sourceSweepsSelected:0,numericalCallsAttempted:0,approximatedCallsAttempted:0,approximatedCallsReturned:0,scope:'Fast-default broad numerical pigment only, including majorintent; --fastbodycadence0 retains prior sampling; semantic authored/drawing/prewet/calibration/detail unchanged',approximation:'travel samples reduced; nominal distance between flow callbacks retained; legacy calibration retained, transfer may differ',calibrationMatchedToApproximation:false,speedGainEstablished:false};
process.on('exit',()=>fs.writeFileSync(path.join(out,'native-body-cadence.json'),JSON.stringify(BODY_CADENCE_RECORD,null,2)));
const FAST_SPARSE_CONTACT=num('fastsparsecontact',0);
if(![0,1].includes(FAST_SPARSE_CONTACT))throw Error('--fastsparsecontact takes 0 or 1');
const SPARSE_CONTACT_RECORD={mode:NATIVE_PAINT_MODE.mode,enabled:NATIVE_PAINT_MODE.mode==='fast'&&Boolean(FAST_SPARSE_CONTACT),selectedRowContacts:0,scope:'majorintent actual ROW footprint enumeration only; same masks/halos/live paper checks, no contact thinning or stale state',speedGainEstablished:false};
process.on('exit',()=>fs.writeFileSync(path.join(out,'native-sparse-contact.json'),JSON.stringify(SPARSE_CONTACT_RECORD,null,2)));


console.log(`native paint mode: ${NATIVE_PAINT_MODE.mode}; ${NATIVE_PAINT_MODE.approximation}`);
console.log(`native tracked CPU upload: ${NATIVE_UPLOAD_POLICY.value}; ${NATIVE_UPLOAD_POLICY.selection}`);
if (PIPELINE) fs.writeFileSync(path.join(out, 'pipeline-plan.json'), JSON.stringify({plan:PIPELINE, overrides:argv0},null,2));
const VALUE_CONFIG=(()=>{let c=opt('valueplan','')?JSON.parse(fs.readFileSync(path.resolve(root,opt('valueplan','')))):null;
  if (c && PIPELINE) c = {...c, subjectOrder: PIPELINE.order.subjects};
  // --regionstyle family=style[,family=style]: per-run region style override on top of subjects.json; needs --valueplan.
  if(!c||!opt('regionstyle',''))return c;const base=c.styleSelection??loadSubjects()[c.subject];if(!base)throw Error('--regionstyle needs a subject style mapping');
  const regions={...(base.regions??{})};for(const kv of opt('regionstyle','').split(',')){const [family,style]=kv.split('=');if(!family||!style)throw Error('--regionstyle family=style');regions[family]={style,reason:'run override --regionstyle for an A/B test'};}
  return {...c,styleSelection:{...base,regions}};})();
const VALUE_ENABLED=!opt('areaplan','') && opt('order','painter')==='painter';
let VALUE_PLAN=null,VALUE_ACTIVE=null,VALUE_OWN_CONTACT=new Set(),VALUE_COMMAND=0;const VALUE_COUNTS=Array.from({length:5},(_,i)=>({band:i+1,strokes:0,contacts:0}));
// --washsession 1: the shapes of one pass (the fragments of one passage) are laid in one wet session, with no drying
// between them; the sheet dries before the pass and after it. 2: also the passes of one band and region in other
// pigments, charged into the same wet wash. 0 (default): every value-plan shape starts on a dry sheet.
const WASH_SESSION = Math.max(0, Math.round(num('washsession', 0)));
let WASH_LAST = null;

const MAJOR_FILE=opt('majorintent',''), MAJOR_INTENT=MAJOR_FILE?validateLegacyIntent(JSON.parse(fs.readFileSync(path.resolve(root,MAJOR_FILE))),{imageSHA:sha256(path.resolve(root,opt('image'))),loadedContact:num('loadedcontact',0)}):null;let MAJOR_TECHNIQUE=null,MAJOR_COMMAND=0,MAJOR_PREVIOUS=null,MAJOR_PLANE_CONTACT=null;
if(MAJOR_INTENT)fs.writeFileSync(path.join(out,'major-intents-before.json'),JSON.stringify(MAJOR_INTENT,null,2));
const NUMERIC_TUFT_SHAPES=opt('numerictuftshapes','').split(',').filter(Boolean),NUMERIC_TUFT_CAL=new Map();
const MOD_PAINT_FLOOR_SKIP=num('modpaintfloorskip',0);if(![0,1].includes(MOD_PAINT_FLOOR_SKIP)||MOD_PAINT_FLOOR_SKIP&&!opt('modpaintplanes',''))throw Error('modpaintfloorskip requires explicit owned plane input and0or1');
if(NUMERIC_TUFT_SHAPES.length&&!MAJOR_INTENT)throw Error('numerictuftshapes requires target-bound major material instructions');
// where the wall clock goes between the big sections, printed at the end as `phases:` (changes no output)
const WALL_PHASES = [`load ${process.uptime().toFixed(1)}s`]; let phaseT = performance.now();
const phaseMark = name => { const t = performance.now(); WALL_PHASES.push(`${name} ${((t - phaseT) / 1000).toFixed(1)}s`); phaseT = t; if (process.env.PHASE_EXIT === name) { console.log(`phases: ${WALL_PHASES.join(', ')} (PHASE_EXIT)`); process.exit(0); } };

const src = sharp(path.resolve(root, opt('image'))).flatten({ background: '#ffffff' }).resize({ width: num('width', 700) });
const { data: PX_SOURCE, info } = await src.removeAlpha().raw().toBuffer({ resolveWithObject: true });
const paperSetupStarted = performance.now();
// --washinkfree 1 (needs --drawingfile): the planner reads the target with the planned pen lines filled from their
// surroundings (src/crop/ink-free.mjs), so the wash carries mass and the pen carries line, not both. Pre-paint only.
const PX_RAW = num('washinkfree', 0) > 0 ? (() => {
  const base = opt('drawingfile', ''); if (!base) throw Error('--washinkfree needs --drawingfile');
  const doc = JSON.parse(fs.readFileSync(path.resolve(root, linePaths(base).lines), 'utf8'));
  const r = removePlannedInk(PX_SOURCE, info.width, info.height, doc, { sheetMm: num('sheetmm', DEFAULT_SHEET_MM), marginMm: num('washinkmargin', 0.3) });
  console.log(`wash target: planned ink removed from ${r.changed} cells (${(100 * r.changed / (info.width * info.height)).toFixed(1)}% of the sheet)`);
  return Buffer.from(r.rgb);
})() : PX_SOURCE;
// --targetguard gentle|hard|warn|off (tools/guard/no-target.mjs): from the first mark on, px and maps made from it are sealed.
// gentle (default) blocks reads but allows shape-level looks; hard also caps looks (--lookbudget, default 100); warn only records.
const TARGET_GUARD = createTargetGuard({ mode: opt('targetguard', DEFAULT_MODE), targetPaths: [path.resolve(root, opt('image', ''))], log: null, lookBudget: opt('lookbudget', '') === '' ? null : num('lookbudget', HARD_LOOK_BUDGET) });
if (TARGET_GUARD.mode !== 'off') process.on('exit', () => { try { fs.mkdirSync(out, { recursive: true }); writeGuardReport(TARGET_GUARD, out, { image: opt('image', '') }); } catch (e) { console.error(`target guard: could not write target-guard.json: ${e.message}`); } });
let px = TARGET_GUARD.register('px', PX_RAW);
const w = info.width, h = info.height, n = w * h;
// Above 540 px, bristles are capped so GPU strokes fit workgroup memory: (hairs + 2) x (4 + pigments) <= 4000 floats, at most 576.
// Uncapped strokes fall back to the CPU. HAIR_CAP=0 turns the cap off.
const createBrush = o => createBrushRaw(gpuHairCap(o));
// --mmspacing 0|1: space brush dabs by sheet size, not cells, so marks match at any resolution. Default 1 above 540 px.
const MM_SPACING_ON = () => { try { return num('mmspacing', w > 540 ? 1 : 0) > 0; } catch { return false; } };
const dabSpacing = o => { if (!MM_SPACING_ON()) return o; const f = w / 540; return { ...(o ?? {}), spacing: (o?.spacing ?? 0.7) * f }; };
const physicalStroke = (b, t, p, o) => physicalStrokeRaw(b, t, p, dabSpacing(o));
const candidateContact = (b, t, p, o) => candidateContactRaw(b, t, p, dabSpacing(o));
function gpuHairCap(o) {
  let K; try { K = SHEET_PIGS.length; } catch { K = 16; }
  if (!(w > 540) || process.env.HAIR_CAP === '0' || !(o?.bristles > 0)) return o;
  const cap = Math.min(576, Math.floor(4000 / (4 + K)) - 2);
  return o.bristles > cap ? { ...o, bristles: cap } : o;
}
const ANCHORS = opt('anchors') ? JSON.parse(fs.readFileSync(path.resolve(root,opt('anchors')),'utf8')) : null;
if (ANCHORS) {
 const sha=crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,opt('image')))).digest('hex');
 if(sha!==ANCHORS.source_sha256) throw new Error('Anchor source hash mismatch');
 if(Math.abs(w/h-ANCHORS.canvas[0]/ANCHORS.canvas[1])>.001) throw new Error('Anchor canvas mismatch');
}


const lum = i => 0.2126 * px[i * 3] + 0.7152 * px[i * 3 + 1] + 0.0722 * px[i * 3 + 2];
// Paper and palette flags (--papermargin, --paper, --pigs, --gain, --neutral, --palettepick, --greypick, --widepick,
// --palettemargin, --greymargin, --boxpick, --boxmargin, --boxgain) are documented in src/crop/palettepick.mjs.
// --paperbase auto|source|white: paper colour, independent of the --paper texture. Without it, --paper decides.
const PAPER_PICK = paperOf(px, w, h, { margin: num('papermargin', 0.03), mode: opt('paperbase', ['auto', 'source', 'white'].includes(opt('paper', 'coldpress')) ? opt('paper', 'coldpress') : 'auto') });
// --paperrgb r,g,b|auto|source: declared sheet colour (source uses paperbase). auto keeps a cream target sheet (red 10+ above blue), else bright white 252,251,248.
// auto reads the sheet from the largest connected bright region (estimatePaper), not the lightest tenth.
const PAPER_EST = opt('paperrgb', '') === 'auto' ? estimatePaper(px, w, h, new Float32Array(w * h)) : null;
const PAPER_AUTO = opt('paperrgb', '') === 'auto' ? (PAPER_EST && PAPER_EST.touchesBorder && PAPER_EST.rgb[0] - PAPER_EST.rgb[2] >= 10 ? PAPER_EST.rgb.map(v => Math.round(v)) : [252, 251, 248]) : null;
const PAPER_DECLARED = opt('paperrgb', '') === 'source' ? PAPER_PICK.paperRGB : PAPER_AUTO ?? (opt('paperrgb', '') ? opt('paperrgb', '').split(',').map(Number) : null);
if (PAPER_AUTO) console.log(`paper: auto sheet ${PAPER_AUTO.join('/')} from the largest bright region ${PAPER_EST ? PAPER_EST.rgb.map(v => v.toFixed(0)).join('/') + ' (' + (100 * PAPER_EST.cells / (w * h)).toFixed(1) + '% of the sheet)' : 'none (under 1%)'}`);
if (PAPER_DECLARED && (PAPER_DECLARED.length !== 3 || PAPER_DECLARED.some(v => !(v > 0 && v <= 255)))) throw Error('--paperrgb needs three values in 1..255');
const { lightest, white: whitePaper } = PAPER_PICK, paperRGB = PAPER_DECLARED ?? PAPER_PICK.paperRGB;
if(opt('revieweddrawingcrop',''))await prepareReviewedCropDrawing(opt('revieweddrawingcrop',''),paperRGB);
if(opt('reviewedwholebinding',''))await prepareReviewedCropDrawing(opt('reviewedwholebinding',''),paperRGB);
if (whitePaper) console.log(`paper: the lightest tenth reads ${lightest.map(v => v.toFixed(0)).join('/')}, painting on white paper`);
// --palettefrom file: fit the pans to this artwork and paint the photograph with them; content still comes from the photograph.
// --washsplat 1: loaded wash brushes (capacity 50+, dip 0.3+) lay soft round splats instead of hairs (src/media/brush.mjs). Default off.
// --splatwater s: splat water and wet-film trade, as a multiple of one hair's touch along a sweep. Default 2.
const WASH_SPLAT_SETTINGS={enabled:num('washsplat',0)>0,water:num('splatwater',2)};
setWashSplat(WASH_SPLAT_SETTINGS.enabled,{water:WASH_SPLAT_SETTINGS.water});
// --runcache 0: refit the palette every run instead of reading it from work/cache (src/paint/run-cache.mjs). Default 1.
// Sweep jobs unpack into a private /root/sweepwork/<job> tree which is removed after painting.
// Keep pure, code-and-input-hashed planner entries beside those trees so a repeat target can reuse them on that box.
const SWEEP_CACHE = path.dirname(root) === '/root/sweepwork' ? '/root/sweepwork/cache' : null;
const RUN_CACHE = { dir: process.env.W2_CACHE_DIR || SWEEP_CACHE || path.join(root, 'work', 'cache'), enabled: opt('runcache', '1') !== '0' };
const CODE_HASH = RUN_CACHE.enabled ? codeHash(root, [fileURLToPath(import.meta.url)]) : '';
const PALETTE_FROM_FILE = opt('palettefrom', '') && fs.existsSync(path.resolve(root, opt('palettefrom', ''))) ? crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root, opt('palettefrom', '')))).digest('hex') : '';
SPEED_PROFILE?.add('setup:paper-and-cache-key', performance.now() - paperSetupStarted);
const paletteFitStarted = performance.now();
const PALETTE = (await cachedStep({ ...RUN_CACHE, name: 'palette', code: CODE_HASH, track: optTrack, inputs: { px, w, h, paperRGB, from: PALETTE_FROM_FILE, authored: opt('areaplan','') ? fs.readFileSync(path.resolve(root,opt('areaplan',''))) : null } }, async () => {
  const authoredFile=opt('areaplan','');const explicit=authoredFile?authoredPalette(JSON.parse(fs.readFileSync(path.resolve(root,authoredFile)))):null;if(explicit)return {pigments:explicit,authored:true,monochrome:explicit.length===1,paintChroma:0,note:'explicit authored production palette; no source palette fit'};
  const from = opt('palettefrom', '');
  let source = px, sw = w, sh_ = h;
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
  // --palettewide 1: box paints chosen to reach the picture's local colours (src/crop/palettewide.mjs)
  if (num('palettewide', 0) > 0) {
    const wide = widePalette(source, sw, sh_, paperRGB, palette, { weight: num('pwweight', 1), gain: num('pwgain', 0.5), min: num('pwmin', 3), max: num('pwmax', 6), K: num('pwcolours', 8), keys: opt('paints', '') ? opt('paints', '').split(',') : null, add: opt('paintsadd', '') ? opt('paintsadd', '').split(',') : null });
    console.log(wide.note);
    return wide.palette;
  }
  return palette;
})).value;
SPEED_PROFILE?.add('setup:palette-fit', performance.now() - paletteFitStarted);
// --pigphys: each pigment given a physics by its hue (src/paint/methods/pigment-physics.mjs)
// --skyblue 1: a second, granulating tube of the palette's blue, used for the sky only.
// --skygran: its granulation as a multiple of --gran (default 1.2); --skybluewick: stain on the paper's peaks (default 0.6).
const PIGS = (() => {
  const planFile=opt('areaplan','');const direct=planFile?authoredPalette(JSON.parse(fs.readFileSync(path.resolve(root,planFile)))):null;
  if(direct)return pigmentPhysics({pigments:direct,opt,num,log:console.log});
  const existing = pigmentPhysics({ pigments: PALETTE.pigments, opt, num, log: console.log });
  const base=opt('finishareaplan','')?finishingPaletteKeys(existing):existing;
  if (!(num('skyblue', 0) > 0)) return base;
  let jb = -1, best = 0;
  // the blue: the pan that absorbs red and green and passes blue (a phthalo green absorbs red too, but not green)
  base.forEach((p, j) => { const [r, g, b] = Array.from(p.K), s = (r + g) / 2 - b; if (s > best) { best = s; jb = j; } });
  if (jb < 0) { console.log('sky blue: the palette has no blue; no second tube'); return base; }
  const gamma = num('skygran', 1.2) / Math.max(1e-3, num('gran', 0.25));
  // --skyfloc f: flocculation of the sky tube, 0..1, so it granulates as a soft larger mottle. Default 0.
  const floc = Math.min(1, Math.max(0, num('skyfloc', 0) || 0));
  const tube = { ...base[jb], name: `${base[jb].name || 'blue'}, granulating, for the sky`, rho: 0.08, gamma, wick: num('skybluewick', 0.6), kind: 'blue', _skyOf: jb, ...(floc > 0 ? { floc } : {}) };
  console.log(`sky blue: a second tube of ${base[jb].name || 'pigment ' + jb} for the sky, granulation ${gamma.toFixed(2)} x ${num('gran', 0.25)}, stain ${tube.wick}${floc > 0 ? `, floc ${floc}` : ''}`);
  return [...base, tube];
})();
const COLOUR_BUDGET = num('colourbudget', 0) > 0 && PIGS.length > 1;
console.log(`palette: ${PIGS.length} pigments, ${PALETTE.authored ? 'explicit authored BOX mixtures; source chroma not fitted' : PALETTE.monochrome ? 'one fluid' : `paint chroma ${PALETTE.paintChroma.toFixed(2)}`}`);
PIGS.forEach((p, j) => console.log(`  ${j}: K ${p.K.map(v => v.toFixed(2)).join('/')}${p.name ? ` ${p.name}` : ''}`));
phaseMark('palette');

// --style s: plan from a styled watercolour target (src/crop/styletarget.mjs), not the photograph. 0..1, default 0.
const STYLE = num('style', 0);
let D_SOURCE = TARGET_GUARD.register('D_SOURCE', channelDensity(px, n, paperRGB));
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
    const have = Float32Array.from({ length: n }, (_, i) => D_SOURCE[i * 3 + c]).sort();
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
      const v = D_SOURCE[i * 3 + c];
      D_SOURCE[i * 3 + c] = v + mix * (at(v) - v);
    }
  }
  let d = 0; for (let i = 0; i < n; i++) d = Math.max(d, (D_SOURCE[i * 3] + D_SOURCE[i * 3 + 1] + D_SOURCE[i * 3 + 2]) / 3);
  console.log(`aim: ${path.basename(f)} for tone and colour, the photograph for drawing; darkest now ${d.toFixed(2)}`);
})();
const D_AIM = STYLE > 0
  ? styleTarget(D_SOURCE, w, h, null, { radius: num('styleradius', 5), range: num('stylerange', 0.12), values: num('stylevalues', 9), paperAt: num('stylepaper', 0.06), deepest: num('styledeepest', 0.7), chroma: num('stylechroma', 1) })
  : D_SOURCE;
if (STYLE > 0) {
  // mixed back towards the photograph at --style below 1, so the pass can be brought in gradually
  if (STYLE < 1) for (let i = 0; i < n * 3; i++) D_AIM[i] = D_SOURCE[i] + STYLE * (D_AIM[i] - D_SOURCE[i]);
  let deep = 0, paper = 0;
  for (let i = 0; i < n; i++) { const m = (D_AIM[i * 3] + D_AIM[i * 3 + 1] + D_AIM[i * 3 + 2]) / 3; if (m > deep) deep = m; if (m <= 0) paper++; }
  console.log(`style target: aiming at a watercolour, not the photograph; darkest ${deep.toFixed(2)}, ${(100 * paper / n).toFixed(1)}% left as paper`);
}
// --planmasses r: plan from big shapes, an edge-preserving mean over r cells at 540 px, scaled with width (massesOf). Plan only.
// --planmassrange: how far apart two values may be and still count as one mass. Not --masses (the mop washes).
const PLAN_MASSES = num('planmasses', 0), PM_R = Math.max(1, Math.round(PLAN_MASSES * w / 540));
// --figurelayers 1: paint the figure mask (--fwmask, required) in a few layers, drying before its hard-edged shapes.
// On the mask: plan massed over --figuremassr cells (default 2); optional --figurefollow, --figurecap 6, --figurefloor 0.25.
// The sheet dries before passages with --figureshare (default 0.25) of their cells on the figure; --figuredry 0 turns that off.
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
let A = (await cachedStep({ ...RUN_CACHE, name:'pigment-fit', code:CODE_HASH, track:optTrack, inputs:{D_PLAN,D_AIM,px,n,PIGS,paperRGB,PLAN_MASSES,COLOUR_BUDGET,SHAPE_REFIT:[num("shaperefit",0),num("refitfamilies",24),num("refitmin",0.0005)]} }, async()=>{
let A = unmix(D_PLAN, n, PIGS.map(p => p.K.map(v => v / 0.55)));
// Under --planmasses the shape refit aims at the simplified plan, not the source, so the speckle stays out.
{
  const Ks = PIGS.map(p => p.K.map(v => v / 0.55)), D0 = (PLAN_MASSES > 0 || D_PLAN !== D_AIM) ? D_PLAN : channelDensity(px, n, paperRGB);
  const flat = new Uint8ClampedArray(n * 3); for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) flat[i * 3 + c] = paperRGB[c];
  // The plan is the straight unmix; it only sets each shape's amount and mix.
  if (num('refit', 0) > 0) throw new Error('--refit was removed by the anti-cheat rules (render-compare-correct against the target)');
  void D0; void Ks; void flat;
  // --shaperefit R: R rounds of Kubelka-Munk correction per planning shape, not per cell (src/paint/methods/shape-refit.mjs). Planning only.
  if (num('shaperefit', 0) > 0) {
    const { planningShapes, shapeRefit } = await import('../src/paint/methods/shape-refit.mjs');
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
// --skyblue: the plan's blue in the sky cells comes from the granulating tube. The sky is the plate's sky segment
// (work/segments); without one, the blue cells off the figure mask.
if (PIGS.length && PIGS[PIGS.length - 1]._skyOf !== undefined) {
  const K = PIGS.length, js = K - 1, jb = PIGS[js]._skyOf;
  const { hasSegments, loadSegments } = await import('../src/crop/segments.mjs');
  const image = opt('image', ''), base = image ? path.basename(image, path.extname(image)) : '';
  const seg = base && hasSegments(base) ? await loadSegments(base, w, h) : null;
  const skySeg = seg?.regions.find(r => r.name === 'sky') ?? null;
  const fig = opt('fwmask', '') ? (await sharp(path.resolve(root, opt('fwmask', ''))).resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer()) : null;
  // the blue cells of the sky: its pale and grey edges keep the plain blue, since a pale wash shows little grain
  // --skywide 1: every sky cell takes the granulating tube, so texture fades with the wash, not at a hard edge. Default 0.
  const WIDE = num('skywide', 0) > 0;
  const isSky = i => (skySeg ? skySeg.mask[i] === 1 : !(fig && fig[i] >= 128)) && (WIDE || px[i * 3 + 2] - px[i * 3] > 8);
  let c = 0;
  for (let i = 0; i < n; i++) { const t = A[i * K + jb] + A[i * K + js], sky = isSky(i); A[i * K + jb] = sky ? 0 : t; A[i * K + js] = sky ? t : 0; if (sky && t > 0) c++; }
  console.log(`sky blue: ${c} cells (${(100 * c / n).toFixed(1)}%) take their blue from the granulating tube, the blue cells of ${skySeg ? 'the sky segment' : 'the ground off the figure (no sky segment)'}`);
}
// --paperkeep L: book no pigment where the source is within L of the paper's lightness and under --paperchroma (default 8).
// Unmixing does not know paper white is a colour and would lay a weak pan there. Default 0, off.
if (num('paperkeep', 0) > 0) {
  const keep = num('paperkeep', 0), maxC = num('paperchroma', 8), k = PIGS.length;
  const lab = labPlanes(px, n, paperRGB), pl = 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2];
  let left = 0;
  for (let i = 0; i < n; i++) {
    const lum = 0.2126 * px[i * 3] + 0.7152 * px[i * 3 + 1] + 0.0722 * px[i * 3 + 2];
    if (lum < pl - keep || Math.hypot(lab.a[i], lab.b[i]) > maxC) continue;
    for (let j = 0; j < k; j++) A[i * k + j] = 0;
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
  for (let i = 0; i < n; i++) { let t = 0; for (let j = 0; j < k; j++) t += A[i * k + j]; tot[i] = t; }
  const sorted = Float32Array.from(tot).sort();
  const deepest = sorted[Math.floor(n * 0.995)], want = deepest * keep;
  // a curve, not a clip: a clip flattens every dark to one tone and loses the edges inside the darks
  for (let i = 0; i < n; i++) {
    if (tot[i] <= 0) continue;
    const f = (want * Math.pow(tot[i] / deepest, num('shortencurve', 0.75))) / tot[i];
    for (let j = 0; j < k; j++) A[i * k + j] *= f;
  }
  console.log(`range: plan's darkest note ${deepest.toFixed(2)} shortened to ${want.toFixed(2)} (x${keep}), curve ${num('shortencurve', 0.75)}`);
})();
// --whitefloor f: cells whose whole planned depth is under f of one glaze join no mask, so no sweep aims at them. Default 0.5.
const WHITE_HOLD = (() => {
  const f = num('whitefloor', 0.5);
  if (f <= 0) return null;
  const floor = f * num('glaze', 0.12), k = PIGS.length, held = new Uint8Array(n);
  let c = 0;
  for (let i = 0; i < n; i++) { let t = 0; for (let j = 0; j < k; j++) t += A[i * k + j]; if (t < floor) { held[i] = 1; c++; } }
  console.log(`whites: ${c} cells (${(100 * c / n).toFixed(1)}% of the sheet) under ${floor.toFixed(3)} held out of every pass`);
  return c ? held : null;
})();
let HOLD = WHITE_HOLD;
if(VALUE_ENABLED&&VALUE_CONFIG?.reserves?.length){HOLD??=new Uint8Array(n);for(const r of VALUE_CONFIG.reserves){const b=r.bounds;for(let y=Math.floor(b[1]*h);y<Math.ceil(b[3]*h);y++)for(let x=Math.floor(b[0]*w);x<Math.ceil(b[2]*w);x++)if(x<w&&y<h)HOLD[y*w+x]=1;}}
// --mixes K: mix K plate puddles before loading the brush (src/crop/mixes.mjs); each pass is one puddle at one strength. Default 0.
const NMIX = Math.max(0, Math.round(num('mixes', 0)));
const MIXES = NMIX > 1 && PIGS.length > 1 ? choosePlateMixes(A, n, PIGS.length, NMIX, { floor: num('mixfloor', 0.1) }) : null;
const MIXED = MIXES ? toMixAmounts(A, n, PIGS.length, MIXES, { perCell: Math.round(num('mixpercell', 3)), over: num('mixover', 0.12) }) : null;
if (MIXES) {
  console.log(`${MIXES.length} mixed colours on the palette, holding ${(100 * MIXED.kept).toFixed(1)}% of the picture's pigment:`);
  for (const m of MIXES) console.log(`  ${[...m].map((v, j) => (v > 0 ? `${(100 * v).toFixed(0)}% ${PIGS[j].name}` : null)).filter(Boolean).join(' + ')}`);
}
// --litplanes: the skin cut into lit, half and shadow planes before the plan (src/paint/techniques/lit-planes.mjs)
{ const L = MIXED ? null : await litPlanes({ A, K: PIGS.length, px, w, h, n, paperL: 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2], image: opt('image', ''), path, gaussian, num, opt, log: console.log, root, fs, sharp }); if (L) A = L; }
// --faceplanes: the face laid as two or three large soft value planes, not many small passages
// (src/paint/techniques/face-planes.mjs)
{ const F = MIXED ? null : await facePlanes({ A, K: PIGS.length, px, w, h, n, paperL: 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2], image: opt('image', ''), path, gaussian, num, log: console.log, root, fs, sharp }); if (F) A = F; }
// --modulate: washes scaled down in the highlight and detail areas, the rest kept for dry brush
// (src/paint/methods/modulate.mjs)
const ART_DENSITY = () => { const pl0 = 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2]; return Float32Array.from({ length: n }, (_, i) => Math.max(0, -Math.log(Math.max(0.02, Math.min(1, lum(i) / pl0))))); };
let clipBaseSource=null, clipBaseWidth=0, clipBaseHeight=0, clipBase=null;
const setClip=(target,mask)=>{
  const excluded=target===sheet?(MOD?.furPlan?.negative??VALUE_PLAN?.protectedCells):null;
  if(!excluded)return physicalSetClip(target,mask);
  if(clipBaseSource!==excluded||clipBaseWidth!==target.w||clipBaseHeight!==target.h){
    clipBase=new Uint8Array(target.n);
    for(let y=0;y<target.h;y++){
      const sourceRow=Math.floor(y*h/target.h)*w, targetRow=y*target.w;
      for(let x=0;x<target.w;x++)clipBase[targetRow+x]=excluded[sourceRow+Math.floor(x*w/target.w)]?0:1;
    }
    clipBaseSource=excluded;clipBaseWidth=target.w;clipBaseHeight=target.h;
  }
  if(!mask)return physicalSetClip(target,clipBase);
  const combined=new Uint8Array(target.n);
  if(mask instanceof Uint8Array&&mask.byteOffset%4===0&&mask.length>=target.n){
    const words=target.n>>>2,baseWords=new Uint32Array(clipBase.buffer,0,words),maskWords=new Uint32Array(mask.buffer,mask.byteOffset,words),outWords=new Uint32Array(combined.buffer,0,words);
    for(let i=0;i<words;i++){
      const v=maskWords[i];
      if((v&0xfefefefe)===0)outWords[i]=baseWords[i]&v;
      else for(let j=i*4,end=j+4;j<end;j++)combined[j]=clipBase[j]&&mask[j]?1:0;
    }
    for(let i=words*4;i<target.n;i++)combined[i]=clipBase[i]&&mask[i]?1:0;
  }else for(let i=0;i<target.n;i++)combined[i]=clipBase[i]&&mask[i]?1:0;
  physicalSetClip(target,combined);
};
const MOD = await planModulation({ A, K: PIGS.length, w, h, n, px, image: opt('image', ''), root, fs, path, sharp, gaussian, num, opt, log: console.log, SRC: ART_DENSITY(), colourBudget: COLOUR_BUDGET });
// --drags (src/paint/methods/drags.mjs): the washes thinned where the dry-brush drags will carry their share
const DRAGS = dragRegion({ w, h, n, SRC: ART_DENSITY(), num, opt });
const DRAG_TARGET = DRAGS ? Float32Array.from(A) : null;
if (DRAGS) { thinForDrags(DRAGS, MOD ? MOD.Aw : A, PIGS.length); console.log(`drags: ${(100 * DRAGS.cells / n).toFixed(1)}% of the sheet, washes thinned by ${(100 * DRAGS.share).toFixed(0)}% there`); }
const MASS_BUDGET = massBudget({ A, MOD, K: PIGS.length, SRC: ART_DENSITY(), rgb: px, w, h, gaussian, components, num, log: console.log });
// --drawinglogic 3 draws its scribble only on an ink-led piece; the style read is the modulation's when there is one
const DRAW_STYLE = num('drawinglogic', 0) === 3 ? (MOD?.style ?? await measureStyle({ SRC: ART_DENSITY(), w, h, n, px, gaussian, minFilter, maxFilter, log: console.log })) : null;
// the ladder's own amounts: under --modulate, the scaled plan, so its feedback does not charge the thinned washes back up
let AL = TARGET_GUARD.register('AL', MOD ? MOD.geometryAw??MOD.Aw : A);
const COLOUR_TRACE = num('colourtrace', 0) > 0;
async function colourPlan(name, amounts) {
  if (!COLOUR_TRACE) return;
  const flat = new Uint8ClampedArray(n * 3);
  for (let i=0;i<n;i++) for(let c=0;c<3;c++) flat[3*i+c]=paperRGB[c];
  const rgb=renderLayers([PIGS.map((_,j)=>Float32Array.from({length:n},(_,i)=>amounts[i*PIGS.length+j]))],PIGS,flat,n,1);
  await sharp(Buffer.from(rgb), {raw:{width:w,height:h,channels:3}}).png().toFile(path.join(out,`colour-${name}.png`));
}
await colourPlan('unmixed', A);
await colourPlan('wash-budget', AL);
const PLANA = MIXED ? MIXED.AM : MOD ? MOD.geometryAw??MOD.Aw : A, PLANK = MIXES ? MIXES.length : PIGS.length;
// --premix 1: charge each passage with every pigment it owes, mixed in the well. Default 0: one pan per pass, colours meet on paper.
// --puddles K: cut each pass's regions by K local colours, each passage charged with its own mix (src/crop/palettewide.mjs). Default 0.
const NPUDDLES = MIXES ? 0 : Math.max(0, Math.round(num('puddles', 0)));
// --massplan 1 (src/paint/methods/mass-wash.mjs): the puddles are the mass planner's mass colours instead
const MASSP = MIXES ? null : massPuddles({ px, w, h, figure: opt('fwmask', '') ? await loadSubject({ file: path.resolve(root, opt('fwmask', '')), w, h, sharp, log: () => {} }) : null, focus: await loadFocus({ opt, w, h, sharp, path, root }), gaussian, num, log: console.log });
const PUDDLES = MASSP && PLANK > 1 ? { labels: MASSP.labels, centres: [] } : NPUDDLES > 1 && PLANK > 1 ? puddleLabels(PLANA, PLANK, w, h, { K: NPUDDLES }) : null;
if (PUDDLES && !MASSP) console.log(`puddles: ${PUDDLES.centres.length} local mixes, each passage charged with its own: ${PUDDLES.centres.map(c => c.map((v, j) => (v >= 0.1 ? `${(100 * v).toFixed(0)}% ${PIGS[j].name ?? j}` : null)).filter(Boolean).join(' + ')).join('; ')}`);
const FIRST_FLOOR = num('firstfloor', 0);
// --firstfloorsubject r: keep the broad first wash on the figure (--fwmask) grown by r cells at 540 px, scaled with width. Default 0.
const FIRST_ONLY = FIRST_FLOOR > 0 && num('firstfloorsubject', 0) > 0 && opt('fwmask', '') ? dilate(await loadSubject({ file: path.resolve(root, opt('fwmask', '')), w, h, sharp, log: () => {} }), w, h, Math.max(1, Math.round(num('firstfloorsubject', 0) * w / 540))) : null;
if (FIRST_ONLY) { let a = 0; for (const v of FIRST_ONLY) a += v ? 1 : 0; console.log(`first floor: kept to the figure grown by ${num('firstfloorsubject', 0)} cells, ${(100 * a / n).toFixed(1)}% of the sheet`); }
// --planfollow given on the command line stays global and unscoped; --figurelayers scopes it.
const PLANFOLLOW = num('planfollow', 0);
const BLOCK_OPTIONS = { glaze: num('glaze', 0.12), maxValues: num('maxvalues', 24), deepQ: num('deepq', 0.55), headroom: num('headroom', 0.5), follow: PLANFOLLOW || (FIG_MASK ? num('figurefollow', 0) : 0), followCap: num('followcap', PLANFOLLOW > 0 ? 3 : FIG_MASK ? num('figurecap', 6) : 3), followFloor: num('followfloor', PLANFOLLOW > 0 ? 0.5 : FIG_MASK ? num('figurefloor', 0.25) : 0.5), followMask: PLANFOLLOW > 0 ? null : FIG_MASK, followMaskShare: num('figureshare', 0.25), quantileIn: num('quantilein', 0.12), maskBlur: num('maskblur', 1), minShape: num('minshape', 0) || null, finest: num('finest', 0.08), floorShape: num('floorshape', 8), washFloor: num('washfloor', 0.6), sampleSupport: MIXES && opt('mixsupport', '1') !== '0', preMix: MIXES ? false : PUDDLES ? true : opt('premix', '0') !== '0', puddles: PUDDLES?.labels ?? null, puddleFloor: PUDDLES ? num('puddlefloor', 0) : 0, reserve: opt('lightplan', '1') !== '0' ? SMALL : null, hold: HOLD,
  // --firstfloor f: open the ladder with one broad light wash of local colour over cells planned at f or more (src/crop/blockin.mjs).
  // --firstwhite w (default f/2): stays-white threshold; --firstcolours K (default 4): local colours; --firstmax m (default --glaze): deepest.
  ...(FIRST_FLOOR > 0 ? { firstFloor: FIRST_FLOOR, firstMax: opt('firstmax', '') !== '' ? num('firstmax', 0.12) : null, firstWhite: opt('firstwhite', '') !== '' ? num('firstwhite', 0) : null, firstLabels: num('firstcolours', 4) > 1 && PLANK > 1 ? puddleLabels(PLANA, PLANK, w, h, { K: Math.round(num('firstcolours', 4)), floor: FIRST_FLOOR }).labels : null, firstOnly: FIRST_ONLY } : {}) };
const AUTHORED_INPUT=opt('areaplan','')&&JSON.parse(fs.readFileSync(path.resolve(root,opt('areaplan','')))).areas.some(a=>a.passes.some(p=>p.source==='authored'));
const blockPlanStarted = performance.now();
let { layers: blocked, steps, delivered: PLAN_DELIVERED } = (await cachedStep({ ...RUN_CACHE, name:'block-plan',code:CODE_HASH,track:optTrack,inputs:{PLANA,PLANK,w,h,BLOCK_OPTIONS,AUTHORED_INPUT} },async()=>AUTHORED_INPUT?{layers:[],steps:1,delivered:new Float32Array(PLANA.length)}:blockInPigments(PLANA, PLANK, w, h, BLOCK_OPTIONS))).value;
SPEED_PROFILE?.add('setup:block-plan', performance.now() - blockPlanStarted);
if(MOD?.paintOwnedTransfer)throw Error('--modpaintplanes was removed by the anti-cheat rules: per-cell residual charge inside a shape');
if(MOD?.paintOwnedTransfer){MOD.paintOwnedCharge=allocateShapeLocalCharge({layers:blocked,K:PIGS.length,n,residual:MOD.paintOwnedResidual,selected:MOD.paintOwnedTransfer.selected,lights:MOD.lights,planned:PLAN_DELIVERED,fixtureCells:MOD.paintOwnedFixtureCells??[],excludeMixedFirstWash:MOD_PAINT_FLOOR_SKIP===1,ownComponents:MOD_PAINT_FLOOR_SKIP===1});fs.writeFileSync(path.join(out,'paint-owned-shape-local-allocation.json'),JSON.stringify({...MOD.paintOwnedCharge,fitPigmentChannels:PIGS.length,geometryPreserved:true,deliveredCredit:0},null,2));}
if(MOD?.paintOwnedTransfer){
 const planned=Float32Array.from(PLAN_DELIVERED),flat=new Uint8ClampedArray(n*3);for(let i=0;i<n;i++)for(let c=0;c<3;c++)flat[i*3+c]=paperRGB[c];
 for(const L2 of blocked)for(const sh of L2.shapes)if(sh._paintOwnedComponentCharge){for(const[i,extra]of sh._paintOwnedComponentCharge)for(let j=0;j<PLANK;j++)planned[i*PLANK+j]+=extra[j];}else if(sh._paintOwnedCharge)for(const[i,extra]of sh._paintOwnedCharge)for(let j=0;j<PLANK;j++)planned[i*PLANK+j]+=extra*sh.mix[j]/sh.amount;
 const optical=field=>renderLayers([PIGS.map((_,j)=>Float32Array.from({length:n},(_,i)=>field[i*PLANK+j]))],PIGS,flat,n,1);
 await sharp(Buffer.from(optical(PLAN_DELIVERED).buffer),{raw:{width:w,height:h,channels:3}}).png().toFile(path.join(out,'paint-owned-before-original-plan.png'));
 await sharp(Buffer.from(optical(planned).buffer),{raw:{width:w,height:h,channels:3}}).png().toFile(path.join(out,'paint-owned-before-funded-plan.png'));
 fs.writeFileSync(path.join(out,'paint-owned-before-plan-meaning.json'),JSON.stringify({kind:'expected allocated original wash amounts through same optics; not actual deposition',allocationMode:MOD.paintOwnedCharge.allocationMode,geometryPreserved:true,deliveredCredit:0},null,2));
}
if(MOD?.paintOwnedTransfer||num('numericplanledger',0)>0)fs.writeFileSync(path.join(out,'paint-owned-original-ladder.json'),JSON.stringify({kind:'original numerical ladder compiled from unchanged pre-transfer geometryAw; scoped load hook follows paths afterward',layers:blocked.length,shapes:blocked.reduce((s,L)=>s+L.shapes.length,0),geometryAwSHA:crypto.createHash('sha256').update(Buffer.from(PLANA.buffer,PLANA.byteOffset,PLANA.byteLength)).digest('hex'),plannedDeliveredTotalSHA:crypto.createHash('sha256').update(Buffer.from(Float32Array.from({length:n},(_,i)=>{let v=0;for(let j=0;j<PLANK;j++)v+=PLAN_DELIVERED[i*PLANK+j];return v;}).buffer)).digest('hex'),plannedDeliveredSHA:crypto.createHash('sha256').update(Buffer.from(PLAN_DELIVERED.buffer,PLAN_DELIVERED.byteOffset,PLAN_DELIVERED.byteLength)).digest('hex'),newLayers:false,newShapes:false,newPathSplits:false,newPressure:false},null,2));
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
  const figureHold = Uint8Array.from(FIG_MASK, (v, i) => !v || (HOLD && HOLD[i]) ? 1 : 0);
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
    l.value = 1 + Math.round((l.value - 1) * (steps - 1) / Math.max(1, fp.steps - 1));
    blocked.push(l);
  }
  blocked.sort((a, b) => a.value - b.value);
  for (let i = 0; i < n; i++) if (FIG_MASK[i]) for (let k = 0; k < PLANK; k++) PLAN_DELIVERED[i * PLANK + k] = fp.delivered[i * PLANK + k];
  console.log(`figure values: ${fp.steps} value layers, ${fp.layers.reduce((a,l)=>a+l.shapes.length,0)} shapes`);
}
// --fieldmix 1: paint warm field gaps inside tree columns as their own premixed wash. Cannot combine with --mixes.
if (num('fieldmix', 0) > 0) {
  if (MIXES) throw new Error('--fieldmix requires pigment-space planning (without --mixes)');
  const { treeRegion } = await import('../src/paint/techniques/passages/treelayers.mjs');
  const { hasSegments, loadSegments } = await import('../src/crop/segments.mjs');
  const imageBase = path.basename(opt('image', ''), path.extname(opt('image', '')));
  const seg = hasSegments(imageBase) ? await loadSegments(imageBase, w, h) : null;
  const fig = FIG_MASK || await loadSubject({ file: opt('fwmask', '') ? path.resolve(root, opt('fwmask', '')) : null, w, h, sharp, log: () => {} });
  const mm = num('sheetmm', DEFAULT_SHEET_MM) / w, T = treeRegion({ w, h, px, fig, seg, mmCell: mm });
  const sky = seg?.regions.find(r => r.name === 'sky')?.mask, band = new Uint8Array(n);
  let count = 0;
  for (let x = 0; x < w; x++) {
    let top = h, bottom = -1;
    for (let y = 0; y < h; y++) if (T.region[y * w + x]) { top = Math.min(top, y); bottom = y; }
    for (let y = top; y <= bottom; y++) {
      const i = y * w + x;
      if (!T.region[i] && T.fam[i] === 2 && !(fig && fig[i]) && !(sky && sky[i])) { band[i] = 1; count++; }
    }
  }
  if (count) {
    const amounts = Float32Array.from(PLANA, (v, i) => band[Math.floor(i / PLANK)] ? v : 0);
    const keepOut = Uint8Array.from(band, (v, i) => !v || (HOLD && HOLD[i]) ? 1 : 0);
    const field = blockInPigments(amounts, PLANK, w, h, { ...BLOCK_OPTIONS, preMix: true, follow: 0, followMask: null,
      maxValues: 4, minShape: Math.max(1, Math.round(0.7 / (mm * mm))), floorShape: 1, hold: keepOut,
      firstFloor: 0.005, firstWhite: 0.002, firstOnly: band, firstLabels: null });
    clipPlannedRegions(blocked, false, band); clipPlannedRegions(field.layers, true, band);
    for (const l of field.layers) { l.value = 1 + Math.round((l.value - 1) * (steps - 1) / Math.max(1, field.steps - 1)); blocked.push(l); }
    blocked.sort((a, b) => a.value - b.value);
    for (let i = 0; i < n; i++) if (band[i]) for (let k = 0; k < PLANK; k++) PLAN_DELIVERED[i * PLANK + k] = field.delivered[i * PLANK + k];
    console.log(`field mix: ${count} warm field cells in ${field.layers.reduce((a, l) => a + l.shapes.length, 0)} premixed shapes`);
    await sharp(Uint8Array.from(band, v => v * 255), { raw: { width: w, height: h, channels: 1 } }).png().toFile(path.join(out, 'field-mask.png'));
  } else console.log('field mix: no unowned warm hill band');
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
console.log(`${blocked.length} glazes over ${steps} values, each one region of one mixed colour`);
// What share of the sheet the plan touches at all: a plan that covers everything cannot leave paper.
(() => {
  const touched = new Uint8Array(n);
  for (const L of blocked) for (const sh of L.shapes) { const m = sh.mask; if (m) for (let i = 0; i < n; i++) if (m[i]) touched[i] = 1; }
  let c = 0;
  for (let i = 0; i < n; i++) if (touched[i]) c++;
  console.log(`plan covers ${(100 * c / n).toFixed(1)}% of the sheet, leaving ${(100 - 100 * c / n).toFixed(1)}% as paper (the artworks leave 71%)`);
  // --plandiag 1 (log only): how many cells wanting paint (0.02+) no passage covers, and how many sit under every first rung
  if (num('plandiag', 0) > 0) {
    const K = PLANK, peaks = [];
    for (let j = 0; j < K; j++) { const v = []; for (let i = 0; i < n; i++) if (PLANA[i * K + j] > 1e-4) v.push(PLANA[i * K + j]); v.sort((a, b) => a - b); peaks.push(v.length ? v[Math.floor(v.length * 0.97)] : 0); }
    const g = num('glaze', 0.12), wf = num('washfloor', 0.6), lv = peaks.map(p => p / (steps + 0.4));
    let want = 0, unc = 0, under = 0, held = 0; const tots = [];
    for (let i = 0; i < n; i++) {
      let t = 0; for (let j = 0; j < K; j++) t += PLANA[i * K + j];
      if (t < 0.02) continue; want++;
      if (touched[i]) continue; unc++; tots.push(t);
      if (HOLD && HOLD[i]) { held++; continue; }
      let ok = false; for (let j = 0; j < K; j++) { const a = PLANA[i * K + j]; if (a >= lv[j] * 0.5 && a >= Math.min(lv[j], g * wf)) ok = true; }
      if (!ok) under++;
    }
    tots.sort((a, b) => a - b);
    console.log(`plan diag: ${(100 * want / n).toFixed(1)}% of the sheet wants paint (0.02+); ${(100 * unc / Math.max(1, want)).toFixed(1)}% of that no passage covers (median planned ${(tots[tots.length >> 1] ?? 0).toFixed(3)}); of those ${(100 * held / Math.max(1, unc)).toFixed(1)}% held out, ${(100 * under / Math.max(1, unc)).toFixed(1)}% under every pan's first rung, the rest cut by the masks' opening and size floor; first rungs ${lv.map(v => v.toFixed(3)).join(' ')} over ${steps} values`);
  }
})();

// Whites are kept by masking, not by painting round them: a wash flows over the mask and leaves it clean.
const pl = 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2];
let SRC = TARGET_GUARD.register('SRC', new Float32Array(n));
for (let i = 0; i < n; i++) SRC[i] = Math.max(0, -Math.log(Math.max(0.02, Math.min(1, lum(i) / pl))));
const peakD = [...SRC].sort((a, b) => b - a)[Math.floor(n * 0.03)] || 1;

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
const HP = (() => { const b = gaussian(SRC, w, h, num('texsigma', 1.6)); return Float32Array.from(SRC, (v, i) => (EDGE(i) ? 0 : Math.max(0, v - b[i]))); })();
// The part of the fine grid a passage's cells can map to (with a margin): everything outside it is empty, so what walks the
// passage's mask there can stay inside, in the same order, and give the same numbers.
const maskWindow = (mask, F) => {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) { const r = y * w; for (let x = 0; x < w; x++) if (mask[r + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
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
const TECHNIQUE = new WeakMap();
// Source-inferred techniques before runtime and semantic overrides; execution uses used[T.name] below.
// Counted per passage and by area, since one big wet-in-wet passage and forty small dry-brush ones differ.
const TECHNIQUE_USE = new Map();
const techniqueOf = sh => {
  if (!TECHNIQUE.has(sh)) {
    const win = maskWindow(sh.mask, FINE);
    const T = chooseTechnique(FINE.D, upTo(sh.mask, FINE, win), FINE.w, FINE.h, { win, peak: peakD, wetEdge: num('wetedge', 0.5), dryTooth: num('drytooth', 0.06), dryPieces: num('drypieces', 9) });
    TECHNIQUE.set(sh, numericalGlazePasses(T, num('glazepasses', 2)));
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
// Soft passages fold into their pigment's host (gradeSmoothPassages), laid wet on wet: see --gradedwet, --gradedchunk, --gradedshare, --gradedprewet.
// --gradedsmooth s: fold only where the source's mean departure from its 1.6-cell blur is under s. Default 0.008.
const SMOOTH = (() => {
  if (opt('gradedwash', '1') === '0') return null;
  const B = gaussian(SRC, w, h, 1.6), cache = new WeakMap();
  return sh => {
    if (!cache.has(sh)) {
      let a = 0, c = 0;
      // over the passage's own box where it is held as one, which reads the same cells in the same order
      const b = sh.box, f = sh.ids;
      if (b && f) { const q = sh.id; for (let y = b.y0; y <= b.y1; y++) { const r = y * w; for (let x = b.x0; x <= b.x1; x++) if (f[r + x] === q) { a += Math.abs(SRC[r + x] - B[r + x]); c++; } } }
      else { const m = sh.mask; for (let i = 0; i < n; i++) if (m[i]) { a += Math.abs(SRC[i] - B[i]); c++; } }
      cache.set(sh, c ? a / c : 1);
    }
    return cache.get(sh) < num('gradedsmooth', 0.008);
  };
})();
const VALUE_ORDER = SMOOTH
  ? gradeSmoothPassages(blocked, A, PIGS.length, w, h, { soft: sh => SMOOTH(sh) && techniqueOf(sh).name === 'wet on wet', host: SMOOTH, blur: gaussian, contain: num('gradedcontain', 0.9) })
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
  ? planCurls(px, w, h, ORDERED, SRC, PIGS, gaussian, { box: opt('curlbox', '') ? opt('curlbox').split(',').map(Number) : null, share: opt('curlshare', '') === '' ? null : num('curlshare', 0.4), shareMin: num('curlsharemin', 0.5), shareMax: num('curlsharemax', 0.75), split: num('curlsplit', 0) > 0 })
  : null;
if (CURLS) console.log(`curls: ${(100 * CURLS.area / n).toFixed(1)}% of the sheet, curl radius ${CURLS.radius.toFixed(1)} cells, glazes carry ${(100 * CURLS.share).toFixed(0)}% of its dark, ${CURLS.parts.filter(p => p.curly).length} of ${CURLS.parts.length} dark regions curly`);
// --detailpasses: small late passages where the detail is (src/paint/methods/detail-passes.mjs)
const { layers: DETAIL_LAYERS, region: DETAIL_REGION } = MIXES ? { layers: [], region: null } : await detailLayers({ A, K: PIGS.length, delivered: PLAN_DELIVERED, SRC, w, h, n, steps, image: opt('image', ''), root, path, fs, sharp, gaussian, num, log: console.log });
let layers = DETAIL_LAYERS.length ? [...(CURLS ? CURLS.layers : ORDERED), ...DETAIL_LAYERS] : CURLS ? CURLS.layers : ORDERED;

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
let SUBJECT = null;
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
  SUBJECT = m;
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
      for (let i = 0; i < n; i++) { let t = 0; for (let j = 0; j < k; j++) t += A[i * k + j]; dep[i] = t; }
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
      const { labPlanes } = await import('../src/eval/colour.mjs');
      const blurred = new Uint8ClampedArray(n * 3);
      for (let c = 0; c < 3; c++) { const Bc = gaussian(Float32Array.from({ length: n }, (_, i) => px[i * 3 + c]), w, h, 3); for (let i = 0; i < n; i++) blurred[i * 3 + c] = Bc[i]; }
      return finishField(SRC, w, h, gaussian, { background: num('finish', 0), subject: num('finishsubject', 0.35), centre: num('finishcentre', 0.35), lab: labPlanes(blurred, n, paperRGB) });
    })()
  : null;
const FINISH = VIGFINISH && FINISH_FIELD ? Float32Array.from(MASK_FINISH, (v, i) => (v < 0 ? v : Math.min(v, FINISH_FIELD[i]))) : (MASK_FINISH ?? FINISH_FIELD);
if (VIGFINISH && FINISH_FIELD) console.log(`vignette finish: cut by the finish field (background ${num('finish', 0)})`);
let FUR_CACHE = null;
const FUR_FIELD = () => (FUR_CACHE ??= orientationField(SRC, w, h, gaussian, { sigma: num('fursigma', 2) }));

// The separator's reading of the source: which cells are pen line, which are wash. Read once; the ink's colour, the
// line budget and the gate on the pen all use it.
const SEP = separate(PX_SOURCE, w, h, paperRGB);
// Removing ink from the wash target must not erase the evidence used to select finish ink.
const DRAW_DENSITY = PX_RAW === PX_SOURCE ? SRC : TARGET_GUARD.register('drawing-density', Float32Array.from({length:n},(_,i)=>Math.max(0,-Math.log(Math.max(.02,Math.min(1,(.2126*PX_SOURCE[3*i]+.7152*PX_SOURCE[3*i+1]+.0722*PX_SOURCE[3*i+2])/pl))))));
// The plan's line set and its linked stages (src/paint/methods/linework-plan.mjs): --linesource picks where the lines
// come from, --stages cuts prep (pencil), prep ink and finish ink from that one set. Planning only, before the seal.
const LINEWORK = await planLinework({ drawingOverride: argv0.includes('--drawing') ? argv0[argv0.lastIndexOf('--drawing')+1] : null, opt, num, argv, out, root, inkShare: SEP.stats.ink / n, density: { D: DRAW_DENSITY, w, h }, grid: { w, h }, log: console.log,
  edges: () => edgeChains(SRC, w, h, gaussian, { sigma: 1.5, minLength: 20, margin: num('silmargin', 0.04), step: 2, high: num('edgehigh', 0.85) }),
  planLines: (ls, image) => { const skip = new Set(opt('drawingskip', '').split(',').map(r => r.trim()).filter(Boolean)); const scaled = ls.filter(g => !skip.has(g.role)).map(g => ({ ...g, length: g.length ?? g.points.reduce((a, q, k) => (k ? a + Math.hypot(q[0] - g.points[k - 1][0], q[1] - g.points[k - 1][1]) : 0), 0) })); return planLineChoice(scaled, num); } });
if (EARLY_LINES) Object.assign(LINEWORK, {source:EARLY_LINES.source, extractor:EARLY_LINES.extractor});
fs.writeFileSync(path.join(out, 'linework.json'), JSON.stringify(LINEWORK, null, 2));
const STAGE_PLAN = LINEWORK.stages ? LINEWORK : null;
// --outlinemedium auto|ink|graphite|<profile>: preparatory drawing medium. auto (default) is ink when the source shows
// --penfirst per cent of line or more, else graphite.
const OUTLINE_REQUESTED = opt('outlinemedium', 'auto');
const OUTLINE = resolveOutlineMedium({ requested: ['auto', 'ink', 'graphite'].includes(OUTLINE_REQUESTED) ? OUTLINE_REQUESTED : materialProfile(OUTLINE_REQUESTED).kind, share: SEP.stats.ink / n, threshold: num('penfirst', 0.5) });
console.log(describeOutlineMedium(OUTLINE));
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
const SUBJECT_STYLE=VALUE_CONFIG?.subject&&(VALUE_CONFIG.styleSelection||loadSubjects()[VALUE_CONFIG.subject])?resolveStyle(VALUE_CONFIG.subject,null,VALUE_CONFIG.styleSelection):null;
// precise-watercolor is the identity profile for the shaped planner; other styles scale ink and graphite by their weights
const STYLE_ON=()=>!!VALUE_PLAN?.style&&VALUE_PLAN.style.name!=='precise-watercolor';
// The pen's ink load. --closingconc f dilutes the closing pen's ink (default 1): a closing accent restates an edge over
// dried washes and should not come out darker than the darkest of them.
const INKLOAD=()=>(STYLE_ON()?num('inkconc',8)*VALUE_PLAN.style.ink:num('inkconc', VALUE_ENABLED ? 4 : 10))*(AREA_DRAW_STAGE==='closing'?num('closingconc',1):1);
const STYLE_INK_DEFAULT=SUBJECT_STYLE?.pigment==='black'?'black-ink':'sepia-ink';
const INK_PROFILE=materialProfile(opt('inkprofile',REQUESTED_DRAW_MEDIUM.endsWith('-ink')?REQUESTED_DRAW_MEDIUM:STYLE_INK_DEFAULT));
const GRAPHITE_PROFILE=materialProfile(opt('graphiteprofile',REQUESTED_DRAW_MEDIUM.startsWith('graphite-')?REQUESTED_DRAW_MEDIUM:'graphite-HB'));
if(INK_PROFILE.kind!=='ink'||GRAPHITE_PROFILE.kind!=='graphite')throw Error('inkprofile/graphiteprofile must use the corresponding material family');
if(!['ink','graphite'].includes(opt('firstpen','ink')))materialProfile(opt('firstpen','ink'));
const OUTLINE_MEDIUM=REQUESTED_DRAW_MEDIUM;
if(!['ink','graphite'].includes(OUTLINE_MEDIUM))materialProfile(OUTLINE_MEDIUM);
// --inkk r,g,b overrides the profile's absorption; --inkkscale multiplies it.
const INK_K_DECLARED=opt('inkk','')?opt('inkk','').split(',').map(Number):null;
if(INK_K_DECLARED&&(INK_K_DECLARED.length!==3||INK_K_DECLARED.some(v=>!(v>0))))throw Error('--inkk needs three positive numbers');
const INK_FAST=opt('inkfast','auto')==='auto'?!INK_PROFILE.rewets:num('inkfast',0)>0;
const INK={...INK_PROFILE.pigment,omega:INK_FAST?60:INK_PROFILE.pigment.omega,K:(INK_K_DECLARED??INK_PROFILE.pigment.K).map(v=>v*num('inkkscale',1))};
console.log('drawing material profiles:',JSON.stringify({ink:{...INK_PROFILE,pigment:INK,rewets:INK.omega<60},graphite:GRAPHITE_PROFILE}));
// --outlinemedium graphite: pen-first outlines in pencil, not ink; graphite is a neutral grey, waterproof and light.
// only on a sheet that will be drawn first (the same test as PEN_FIRST below), so a sheet washed first carries no unused pigment
const DRAWS_FIRST = opt('prep', '0') !== '0' || ['first', 'both'].includes(opt('drawing', 'first'))
  || (opt('drawing', 'first') === 'detect' && num('penfirst', 0.5) > 0 && Math.max(100 * SEP.stats.ink / n, 100 * num('drawfloor', 0)) >= num('penfirst', 0.5));
// --penpencil <stage.png>: the opening drawing in dry pencil, coloured as the target stage's line (pencil-line.mjs)
const PENCIL = opt('penpencil', '') && DRAWS_FIRST ? await (async () => {
  const m = await measureLine({ file: path.resolve(root, opt('penpencil', '')), w, h, sharp, cut: num('pencilcut', 12), log: console.log });
  return { ...m, pig: {...GRAPHITE_PROFILE.pigment,strength:GRAPHITE_PROFILE.concentration} };
})() : null;
const PENCIL_STAGE = DRAWS_FIRST && num('pencilstage', 0) > 0;
const GRAPHITE = PENCIL ? (({ strength, ...pig }) => pig)(PENCIL.pig) : (STAGE_PLAN?.files.prep || OUTLINE_MEDIUM === 'graphite' || (OUTLINE_MEDIUM !== 'ink' && materialProfile(OUTLINE_MEDIUM).kind==='graphite')) && opt('drawing', 'first') !== 'none' && DRAWS_FIRST
  ? GRAPHITE_PROFILE.pigment
  : null;
// --wickfloor f: least share of a granulating paint's water-borne pigment the pores take, 0..0.9, so peaks stay pale. Default 0.
// A comma list sets it per pigment in palette order; the last value carries on, 0 leaves a pigment alone.
const WICK_FLOORS = String(opt('wickfloor', '0')).split(',').map(v => Math.min(0.9, Math.max(0, Number(v) || 0)));
const wickFloorOf = j => WICK_FLOORS[Math.min(j, WICK_FLOORS.length - 1)];
const WICK_FLOOR = Math.max(...WICK_FLOORS);
const SHEET_PIGS = [...(WICK_FLOOR > 0 ? PIGS.map((p, j) => (wickFloorOf(j) > 0 ? { ...p, wick: Math.max(wickFloorOf(j), p.wick ?? Math.max(0.05, Math.min(0.9, 1 - p.gamma))) } : p)) : PIGS), ...(INK ? [INK] : []), ...(GRAPHITE ? [GRAPHITE] : [])];
const GRAPHITE_AT = PIGS.length + (INK ? 1 : 0);
// every brush is dipped for the wash palette; with a separate ink or accent paints on the sheet it carries none of them
const FINISH_FILE=opt('finishareaplan','');
if(FINISH_FILE&&opt('semanticcalibration','legacy')!=='actual')throw Error('finishareaplan requires actual authored instrument calibration');
if(FINISH_FILE&&opt('areaplan',''))throw Error('finishareaplan appends to original numeric route; areaplan cannot coexist');
let FINISH_PLAN=null,FINISH_COMPILED=null,FINISH_START=-1,FINISH_MASS_BEFORE=null;
const AREA_FILE=opt('areaplan','');let AREA_PLAN=null,AREA_COMPILED=null,AREA_DRAW_STAGE='opening',AREA_FILM_REMOVED=false;const AREA_LOADS=new WeakMap(),AREA_COMPLETED=new Set(),AREA_PREPARED=new Set();
let AREA_NUMERIC_SEQUENCE=null,AREA_NUMERIC_CONTACT_STOP=null,MOD_DRY_CAL_GAIN=null;
const AREA_EXEC=createAreaExecution({emit:r=>{if(AREA_PLAN)fs.appendFileSync(path.join(out,'semantic-commands.jsonl'),JSON.stringify(r)+'\n');}});
if(AREA_FILE){
 const doc=JSON.parse(fs.readFileSync(path.resolve(root,AREA_FILE))),imageFile=path.resolve(root,opt('image','')),meta=await sharp(imageFile).metadata();
 const targetMeta=await sharp(doc.target.path).metadata();if(targetMeta.width!==doc.target.width||targetMeta.height!==doc.target.height)throw Error('semantic target frame mismatch');
 AREA_PLAN=rasterAreaPlan(validateAreaDocument(doc,{targetSHA:sha256(doc.target.path),imageSHA:sha256(imageFile),sourceWidth:meta.width,sourceHeight:meta.height}),w,h);
 // Existing independently owned adapters cannot double-paint semantic-owned demand.
 const productionDetails=validateProductionDetails(doc);
 if(productionDetails&&(!MOD||doc.areas.some(a=>a.passes.some(p=>p.source==='authored'))))throw Error('production-modulate details require existing numeric modulation route');
 for(const key of ['passages','masses','shapes','practice','darkmass','modulate','curls'])if(!(key==='modulate'&&productionDetails)&&opt(key,'')&&!['0','none'].includes(opt(key,'')))throw Error(`--areaplan conflicts with legacy adapter --${key}`);
 fs.writeFileSync(path.join(out,'semantic-area-plan.json'),JSON.stringify(doc,null,2));
 for(const [name,a] of [['ownership',AREA_PLAN.owner],['paper-reserves',AREA_PLAN.reserves],['film',AREA_PLAN.film]])fs.writeFileSync(path.join(out,`semantic-${name}.json`),JSON.stringify({w,h,coordinateSpace:'execution-grid',data:Array.from(a)}));
 if(num('areaplanonly',0)){let c;try{c=compileAreaLayers(AREA_PLAN,layers,PIGS);}catch(e){fs.writeFileSync(path.join(out,'semantic-coverage.json'),JSON.stringify(e.diagnostics??{error:e.message},null,2));throw e;}validateCompiledAreaStop(opt('areastop',''),c.layers);fs.writeFileSync(path.join(out,'semantic-coverage.json'),JSON.stringify({...c.diagnostics,stage:'CPU pre-sheet compiler; physical execution NOT RUN'},null,2));fs.writeFileSync(path.join(out,'semantic-numerical-shapes.json'),JSON.stringify({w,h,stage:'CPU numerical shapes; not executed gestures',shapes:c.layers.flatMap(l=>l.shapes.map(sh=>({areaId:l._semantic.area.id,passId:l._semantic.key,pass:l._semantic.pass,value:l.value,amount:sh.amount,mix:sh.mix,cells:Array.from(sh.mask,(v,i)=>v?i:-1).filter(i=>i>=0)})))}));if(c.diagnostics.numericFitBypassed){const executionWidth=w*num('scale',1),executionHeight=h*num('scale',1);fs.writeFileSync(path.join(out,'semantic-authored-paths.json'),JSON.stringify({executionWidth,executionHeight,physicalExecution:false,passes:c.layers.map(l=>({passId:l._semantic.key,paths:lowerAuthoredGestures(l._semantic,{target:AREA_PLAN.doc.target,crop:AREA_PLAN.crop,width:executionWidth,height:executionHeight,sheetWidthMm:num('sheetmm', DEFAULT_SHEET_MM)*AREA_PLAN.doc.target.width/AREA_PLAN.crop[2]})}))}));}const first=c.layers[0];if(first)fs.writeFileSync(path.join(out,'semantic-first-numerical-shape.json'),JSON.stringify({w,h,areaId:first._semantic.area.id,passId:first._semantic.key,value:first.value,cells:Array.from(first.shapes[0].mask,(v,i)=>v?i:-1).filter(i=>i>=0)}));process.exit(0);}
}
if(FINISH_FILE){
 const doc=JSON.parse(fs.readFileSync(path.resolve(root,FINISH_FILE))),imageFile=path.resolve(root,opt('image','')),meta=await sharp(imageFile).metadata();
 const bound=bindFinishingArea(doc,{targetSHA:sha256(doc.target.path),imageSHA:sha256(imageFile),sourceWidth:meta.width,sourceHeight:meta.height,w,h,palette:PIGS});
 FINISH_PLAN=bound.plan;FINISH_COMPILED=bound.compiled;
 fs.writeFileSync(path.join(out,'finishing-area-before.json'),JSON.stringify({kind:'BEFORE appended authored glaze; numerical geometry retained; no execution proof',inputSHA:sha256(path.resolve(root,FINISH_FILE)),target:doc.target,instructions:doc.areas,coverage:FINISH_COMPILED.diagnostics,paths:FINISH_PLAN.schedule.map(q=>({id:q.key,paths:lowerAuthoredGestures(q,{target:doc.target,crop:FINISH_PLAN.crop,width:w*num('scale',1),height:h*num('scale',1),sheetWidthMm:num('sheetmm', DEFAULT_SHEET_MM)})}))},null,2));
}
const EARLY_DRY_VALUE=num('earlydryvalue',0);earlyDryBoundary({minValue:EARLY_DRY_VALUE,value:0,fullBoundary:false});if(EARLY_DRY_VALUE&&AREA_PLAN)throw Error('earlydryvalue supports original numeric boundaries only');
if(EARLY_DRY_VALUE)fs.writeFileSync(path.join(out,'early-dry-before.json'),JSON.stringify({minValue:EARLY_DRY_VALUE,scope:'completed original full numeric pan/value dry boundaries; firstwash and intentional connected wet passages unchanged',order:'ordinary physical dry before baseline idle settle, not perstroke dry',water:'original unchanged',pigment:'original requested load and planned demand unchanged'},null,2));let EARLY_DRY_CAPTURED=false;
const dry=(...args)=>{const requested=args[3];args[3]=nativeDryOptions(NATIVE_PAINT_MODE.mode,requested);return AREA_PLAN?AREA_EXEC.command('ordinary physical drying',{maxSteps:args[1],options:args[3],requestedOptions:requested,nativeMode:NATIVE_PAINT_MODE},()=>physicalDry(...args)):physicalDry(...args);};
const dip=(b,o)=>{const a=AREA_EXEC.active,paint=o.conc.some(v=>v>0),load=a&&!a.productionLegacyDetail?{...o,water:(paint?a.pass.load.water:(a.pass.load.prewetWater??1))*a.pass.load.waterQuantityMm3/a.pass.load.capacityMm3,conc:o.conc.map(v=>v*(paint?a.pass.load.pigmentScale:1))}:o;const padded=(INK||GRAPHITE)&&load.conc.length<SHEET_PIGS.length?{...load,conc:[...load.conc,...new Array(SHEET_PIGS.length-load.conc.length).fill(0)]}:load;if(!AREA_PLAN)return dipBrush(b,padded);const before=measureBrush(b);const value=AREA_EXEC.command('physical brush dip/refill',{load:padded,brushBefore:before,passIntent:a?.pass??null},()=>dipBrush(b,padded));AREA_LOADS.set(b,{load:padded,waterMass:measureBrush(b).waterMass});return value;};
// Opt-in actual numeric production loads only: calibration and pen loads stay unchanged.
const PRODUCTION_WATER=num('productionwater',1);productionWaterLoad({water:1,conc:[0]},PRODUCTION_WATER);
if(PRODUCTION_WATER!==1&&AREA_PLAN)throw Error('productionwater supports the original numeric route only; no semantic rewet fallback');
if(PRODUCTION_WATER!==1)fs.writeFileSync(path.join(out,'production-water-before.json'),JSON.stringify({factor:PRODUCTION_WATER,scope:'actual numeric paint/prewet dips after unchanged scrap calibration; ink unchanged',pigment:'same prepared mass through inverse concentration, not a delivery guarantee',admission:'existing native material checks; no automatic baseline-water fallback'},null,2));
const productionDip=(b,o)=>{const authored=AREA_EXEC.active?.pass?.source==='authored',requested=o,prepared=productionWaterLoad(o,PRODUCTION_WATER,{authored}),result=dip(b,prepared);if(PRODUCTION_WATER!==1&&!authored){const actual=measureBrush(b),baselineWaterMass=actual.waterMass/PRODUCTION_WATER,intendedPigmentMass=actual.pigmentMass.map((_,j)=>(requested.conc[j]??0)*baselineWaterMass);fs.appendFileSync(path.join(out,'production-water-loads.jsonl'),JSON.stringify({kind:requested.conc.some(v=>v>0)?'actual production paint load':'actual production clean prewet',factor:PRODUCTION_WATER,shapeId:MAJOR_TECHNIQUE?.shapeId??null,technique:MAJOR_TECHNIQUE?.name??null,requested,prepared,actual,baselineWaterMassAtSameBrush:baselineWaterMass,intendedPigmentMass,deliveredPigmentMass:null,meaning:'prepared brush mass only; actual deposition is measured separately; no rewet fallback'})+'\n');}return result;};

let RECEIVER_OBSERVER=null;
const stroke=(b,target,points,options)=>{
 if(AREA_NUMERIC_CONTACT_STOP&&target===sheet)return;
 if(VALUE_ACTIVE&&target===sheet){
  if(VALUE_ACTIVE.shaped)options={...options,upright:VALUE_ACTIVE.brush?.contact==='point'?false:'sweep'};
  const contact=candidateContact(b,{...target,clip:null},points,{...options,neighborRadius:3}),cells=contact.cells.filter(i=>!target.resist?.[i]),neighbors=contact.neighborIndices,load=measureBrush(b),paint=load.pigmentMass.some(v=>v>0),observe=()=>measurePaper(target,[...cells,...neighbors],SPEED_PAPER);
  let paper=observe();const own=contact.cells.some(i=>contact.primaryMask[i]&&VALUE_OWN_CONTACT.has(i))&&measurePaper(target,[...cells,...neighbors].filter(i=>!VALUE_OWN_CONTACT.has(i)),SPEED_PAPER).dry;
  if(paint&&!['wet on wet','dry on wet'].includes(VALUE_ACTIVE.move)&&(!own||VALUE_ACTIVE.texture)&&!paper.dry){dry(target,30000,O,{levelMax:140,dt:2});paper=observe();if(!paper.dry)throw Error('value-plan dry-paper contact gate failed');}
  // --wetgate 0: log a wet wash whose footprint is not evenly wet instead of stopping the run. Default 1.
  if(paint&&['wet on wet','dry on wet'].includes(VALUE_ACTIVE.move)&&(paper.moistShare<.7||paper.waterMax>.15)){const info='value-plan wet wash whole-footprint gate failed '+JSON.stringify({id:VALUE_ACTIVE.id,band:VALUE_ACTIVE.valueBand,moistShare:paper.moistShare,waterMax:paper.waterMax,cells:cells.length});if(opt('wetgate','1')==='0')console.log('WARN '+info);else throw Error(info);}
  const id='value-contact-'+(++VALUE_COMMAND),record={id,intent:VALUE_ACTIVE.id,phase:VALUE_ACTIVE.phase,valueBand:VALUE_ACTIVE.valueBand,regions:VALUE_ACTIVE.regions,crossesRegions:VALUE_ACTIVE.crossesRegions,kind:paint?'pigment':'clean-water',ownWetEdge:own,paper,primary:measurePaper(target,cells,SPEED_PAPER),neighbors:measurePaper(target,neighbors,SPEED_PAPER),brushBefore:load,geometry:points,options};
  if(!Number.isFinite(load.waterMass)||load.pigmentMass.some(v=>!Number.isFinite(v)))throw Error('value-plan nonfinite brush');
  if(VALUE_ACTIVE.shaped&&TRUMBULL_RULES&&w===540){const total=VALUE_COUNTS.reduce((a,b)=>({strokes:a.strokes+b.strokes,contacts:a.contacts+b.contacts}),{strokes:0,contacts:0});if(total.strokes+1>12256||total.contacts+cells.length>12443022)throw Error('W13 Y1 contact budget would exceed W7; fix this band before continuing');}
  const result=physicalStroke(b,target,points,options);
  {const count=VALUE_COUNTS[VALUE_ACTIVE.valueBand-1];count.strokes++;count.contacts+=cells.length;}
  // Clean-water preparation belongs to this passage too. Otherwise the first
  // pigment stroke dries away the very wet bed prepared for merging its lanes.
  for(const i of contact.cells)VALUE_OWN_CONTACT.add(i);
  fs.appendFileSync(path.join(out,'value-commands.jsonl'),JSON.stringify({...record,status:'EXECUTED',brushAfter:measureBrush(b)})+'\n');return result;
 }

 if(!AREA_PLAN){
  if(!MAJOR_INTENT||target!==sheet)return physicalStroke(b,target,points,options);
  const commandId='major-command-'+String(++MAJOR_COMMAND).padStart(7,'0'),contact=candidateContact(b,{...target,clip:null},points,{...options,neighborRadius:3,sparseRow:SPARSE_CONTACT_RECORD.enabled}),cells=contact.cells.filter(i=>!(target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1)),paper=measurePaper(target,cells),neighbors=measurePaper(target,contact.neighborIndices),before=measureBrush(b),paint=before.pigmentMass.some(v=>v>0),family=legacyIntentFamily(MAJOR_INTENT,points,target.w,target.h),technique=MAJOR_TECHNIQUE;
  if(SPARSE_CONTACT_RECORD.enabled&&b.model!=='tuft')SPARSE_CONTACT_RECORD.selectedRowContacts++;
  const record={predictionEnumeration:SPARSE_CONTACT_RECORD.enabled&&b.model!=='tuft'?'sparse actual ROW emitted indices':'original full-sheet enumeration',commandId,paintOwnedLoadFunding:b._paintOwnedLoad??null,familyId:family.id,referenceCue:family.referenceCue,lights:family.lights,plannedMaterialDecision:family.material,technique,actualBrush:{model:b.model??'row',flat:b.flat,profile:semanticBrushObservation(b),radius:b.radius,bridge:b.bridge,free:b.free},paper,neighbors,brushBefore:before,geometry:points,options,primaryCells:contact.cells.filter(i=>contact.primaryMask[i]).length,clipAllowedPrimary:contact.cells.filter(i=>contact.primaryMask[i]&&(!target.clip||target.clip[i])).length,scope:'original numeric production geometry retained; context guide is not a mask/ownership allocator'};
  fs.appendFileSync(path.join(out,'major-commands.jsonl'),JSON.stringify({...record,status:'BEFORE'})+'\n');
  const reject=error=>{fs.appendFileSync(path.join(out,'major-commands.jsonl'),JSON.stringify({...record,status:'REJECTED',error:error.message})+'\n');throw error;};
  if(!Number.isFinite(paper.waterMax)||!Number.isFinite(before.waterMass)||before.pigmentMass.some(v=>!Number.isFinite(v)))reject(Error('major physical contact/nonfinite admission '+commandId));
  if(paint&&record.clipAllowedPrimary===0)record.admission='masked/clipped attempted contact; no supported-primary delivery credit';
  const continuation=sameUnliftedMajorGesture(MAJOR_PREVIOUS,{brush:b,points,options,shapeId:technique?.shapeId});
  const observed=()=>{const mc=semanticMaterialContact(target,contact,b);record.materialContact={...mc,cells:undefined,conservativeCells:undefined};record.primaryPaper=measurePaper(target,contact.cells.filter(i=>contact.primaryMask[i]));record.liftPaper=measurePaper(target,contact.cells.filter(i=>contact.liftMask[i]&&!contact.primaryMask[i]));record.conservativePaper=measurePaper(target,mc.conservativeCells);return measurePaper(target,mc.cells.filter(i=>!(target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1)));};
  try{const prepared=prepareMajorDryBase({paint,technique,continuation,preparation:MAJOR_INTENT.dryDetailPreparation,observe:observed,dry:q=>dry(target,q.maxSteps,O,{levelMax:q.levelMax,dt:q.dt}),record:q=>fs.appendFileSync(path.join(out,'major-commands.jsonl'),JSON.stringify({...record,...q,commandId,familyId:family.id})+'\n')});record.actualMaterialPaper=prepared.paper;}catch(error){reject(error);}

  if(paint&&technique?.connectedSkyDecision)fs.appendFileSync(path.join(out,'major-sky-contacts.jsonl'),JSON.stringify({commandId,...technique.connectedSkyDecision,shapeId:technique.shapeId,paper:record.actualMaterialPaper,primary:record.primaryPaper,lift:record.liftPaper,neighbors,brushBefore:before,actualBrush:record.actualBrush,observedMove:record.actualMaterialPaper.dry&&neighbors.dry?'dry start/restart':'wet-edge contact',ordinaryDryPrepared:false})+'\n');
  const planePrimary=paint&&b._paintOwnedLoad?.factor>1&&b._paintOwnedLoad?.supportCells>0&&opt('majorstop','')==='paint-owned-plane-dry'&&MOD?.paintOwnedTransfer?contact.cells.filter(i=>contact.primaryMask[i]&&(!target.clip||target.clip[i])&&!(target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1)&&MOD.paintOwnedTransfer.selected[Math.floor(((i/target.w)|0)/SC)*w+Math.floor((i%target.w)/SC)]&&(!MOD.paintOwnedCheckpointBounds||(((i%target.w)+.5)/target.w>=MOD.paintOwnedCheckpointBounds[0]&&((i/target.w|0)+.5)/target.h>=MOD.paintOwnedCheckpointBounds[1]&&((i%target.w)+.5)/target.w<MOD.paintOwnedCheckpointBounds[2]&&((i/target.w|0)+.5)/target.h<MOD.paintOwnedCheckpointBounds[3]))):[];
  if(planePrimary.length&&!MAJOR_PLANE_CONTACT){MAJOR_PLANE_CONTACT={commandId,familyId:family.id,technique,primaryCells:planePrimary,kind:'actual executed numeric contact on requested paint-owned primary support; deposition magnitude not inferred',allocationInput:opt('modpaintplanes','')};fs.writeFileSync(path.join(out,'paint-owned-plane-before.ppm'),Buffer.concat([Buffer.from('P6\n'+W2+' '+H2+'\n255\n'),Buffer.from(render())]));}
  RECEIVER_OBSERVER?.before({commandId,technique,sheet:target,contact,points,ownership:{hold:HOLD,small:SMALL},record});
  const value=physicalStroke(b,target,points,options);RECEIVER_OBSERVER?.executed(commandId,target);MAJOR_PREVIOUS={brush:b,end:points.at(-1),lift:options?.lift??true,shapeId:technique?.shapeId};fs.appendFileSync(path.join(out,'major-commands.jsonl'),JSON.stringify({commandId,familyId:family.id,status:'EXECUTED',brushAfter:measureBrush(b),brushTipAfter:semanticBrushObservation(b)})+'\n');
  if(MAJOR_PLANE_CONTACT?.commandId===commandId){fs.writeFileSync(path.join(out,'paint-owned-plane-immediate.ppm'),Buffer.concat([Buffer.from('P6\n'+W2+' '+H2+'\n255\n'),Buffer.from(render())]));fs.writeFileSync(path.join(out,'paint-owned-plane-contact.json'),JSON.stringify({...record,...MAJOR_PLANE_CONTACT,status:'EXECUTED',brushAfter:measureBrush(b)},null,2));}
  if(paint&&!fs.existsSync(path.join(out,'major-first-pigment.ppm')))fs.writeFileSync(path.join(out,'major-first-pigment.ppm'),Buffer.concat([Buffer.from('P6\n'+W2+' '+H2+'\n255\n'),Buffer.from(render())]));return value;
 }
 const a=AREA_EXEC.active;if(a&&!a.productionLegacyDetail)options={...options,upright:a.pass.brush.orientation==='follow'?false:a.pass.brush.orientation==='sweep'?'sweep':true};const initial=AREA_LOADS.get(b);if(a&&initial&&measureBrush(b).waterMass<initial.waterMass*a.pass.load.minRemainingFraction)AREA_EXEC.command('physical measured refill',{before:measureBrush(b),trigger:a.pass.load.minRemainingFraction,load:initial.load},()=>dipBrush(b,initial.load));const contact=candidateContact(b,{...target,clip:null},points,{...options,neighborRadius:a?.pass.wetness.neighborCells??5}),paper0=measurePaper(target,[...contact.cells,...contact.neighborIndices].filter(i=>!(target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1))),load=measureBrush(b),paint=load.pigmentMass.some(v=>v>0);
 const continuation=a&&!a.productionLegacyDetail&&paint&&AREA_NUMERIC_SEQUENCE?.key===a.key?productionChargeLink(AREA_NUMERIC_SEQUENCE.history,AREA_NUMERIC_SEQUENCE.shapeKey,contact,validateProductionDetails(AREA_PLAN.doc)?.numericWashSequence?.maxSurfaceWater):null;
 const contactParts=()=>({primary:measurePaper(target,contact.cells.filter(i=>contact.primaryMask[i])),liftEnvelope:measurePaper(target,contact.cells.filter(i=>contact.liftMask[i]&&!contact.primaryMask[i])),neighborHalo:measurePaper(target,contact.neighborIndices),liftRole:'conservative final-lift envelope; not evidence every cell receives pigment'});
 let materialContact=semanticMaterialContact(target,contact,b),paper=measurePaper(target,materialContact.cells.filter(i=>!(target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1)));
 if(a&&paint&&a.pass.source==='authored'&&!['wet on wet','wet-edge continuation'].includes(a.pass.move)){
  const observed=()=>{materialContact=semanticMaterialContact(target,contact,b);return measurePaper(target,materialContact.cells.filter(i=>!(target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1)));};
  const waited=waitForAuthoredDry(a.pass,{observe:observed,dry:q=>dry(target,q.maxSteps,O,{levelMax:140,dt:q.dt}),advance:(count,dt,before)=>AREA_EXEC.command('ordinary authored per-contact dry wait',{steps:count,dt,before},()=>{for(let n=0;n<count;n++)step(target,{...O,dt});})});paper=waited.paper;
 }
 if(a&&paint&&a.pass.source==='authored'&&a.pass.move==='wet-edge continuation'){
  const observed=()=>{materialContact=semanticMaterialContact(target,contact,b);return measurePaper(target,materialContact.cells.filter(i=>!(target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1)));};
  const settled=settleAuthoredWetEdge(a.pass,{observe:observed,advance:(count,dt,before)=>AREA_EXEC.command('ordinary wet-edge settling',{steps:count,dt,before,maximumSurfaceWater:a.pass.wetness.maxSurfaceWater},()=>{for(let n=0;n<count;n++)step(target,{...O,dt});})});paper=settled.paper;
  fs.appendFileSync(path.join(out,'semantic-commands.jsonl'),JSON.stringify({kind:'semantic-wet-edge-settle',areaId:a.area.id,passId:a.key,gestureId:points[0]?.gestureId,...settled})+'\n');
 }
 if(a&&paint&&a.pass.source==='authored')admitAuthoredContact(contact,materialContact,{reserved:i=>AREA_PLAN.reserves[Math.floor(i/target.w/SC)*w+Math.floor(i%target.w/SC)]!==0,film:i=>target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1});
 if(a&&paint&&a.pass.move==='wet on wet'){
  const observed=()=>{measurePaper(target,[...contact.cells,...contact.neighborIndices]);materialContact=semanticMaterialContact(target,contact,b);return measurePaper(target,materialContact.cells.filter(i=>!(target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1)));};
  const result=prepareSemanticContact(a.pass,points,{observe:observed,waterStroke:(prepared,attempt)=>{
   const prep=semanticPreparation(a.pass),preparedPass=prep?{...a.pass,brush:prep.brush,load:{...prep.load,prewetWater:prep.load.water}}:a.pass;
   const mm=num('sheetmm', DEFAULT_SHEET_MM)/W2;
   const wet=createBrush({...b,bristles:b.hairs.length,...(prep?{...semanticBrushOptions(preparedPass,mm),...(prep.depositDepthMm!==undefined?{depositDepth:prep.depositDepthMm}:{})}:{radius:b.radius+a.pass.wetness.neighborCells}),seed:SEED+attempt});
   semanticPrewetLoad(preparedPass,wet.free);
   const legacyAllowed=target.clip?[...contact.cells,...contact.neighborIndices].filter(i=>target.clip[i]).length:null;
   AREA_EXEC.set({...a,pass:preparedPass});try{dip(wet,{water:preparedPass.load.prewetWater??1,conc:SHEET_PIGS.map(()=>0)});const waterPoints=prep?semanticPreparationGesture(a.pass,points,mm,{predict:path=>candidateContact(wet,{...target,clip:null},path,{...options,neighborRadius:0}),requiredCells:materialContact.cells,width:target.w}):prepared;withSemanticWaterClip(target,setClip,()=>stroke(wet,target,waterPoints,{...options,lift:true}));}finally{AREA_EXEC.set(a);}
   fs.appendFileSync(path.join(out,'semantic-commands.jsonl'),JSON.stringify({kind:'semantic-contact-preparation',areaId:a.area.id,passId:a.key,attempt,geometrySource:prep?.contactSweep?'authored extended contact-following clean sweep, aligned by actual native contact prediction':'exact upcoming shaped pigment points/pressure/radius plus declared neighbor reach',primaryCells:contact.primaryCellCount,liftCells:contact.liftCellCount,neighborCells:contact.neighborCells,legacyAllowedCells:legacyAllowed,numericalClipUsedForWater:false,paperAfter:observed()})+'\n');
  },advance:flowStep=>{AREA_EXEC.command('ordinary physical preparation flow',{flowStep,preparation:a.pass.preparation},()=>step(target,O));fs.appendFileSync(path.join(out,'semantic-commands.jsonl'),JSON.stringify({kind:'semantic-preparation-flow-observation',areaId:a.area.id,passId:a.key,flowStep,paperAfter:observed()})+'\n');}});paper=result.paper;
 }
 if(a)for(const i of contact.cells){const j=Math.floor(i/target.w/SC)*w+Math.floor(i%target.w/SC);if(contact.primaryMask[i]&&AREA_PLAN.reserves[j])throw Error(`bare-paper contact ${a.key} cell ${j}`);}
 if(a&&paint&&!a.productionLegacyDetail&&AREA_NUMERIC_SEQUENCE?.key===a.key&&!continuation&&a.pass.wetness.required==='dry'){
  const observed=()=>{materialContact=semanticMaterialContact(target,contact,b);return measurePaper(target,materialContact.cells.filter(i=>!(target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1)));};
  const preparation=validateProductionDetails(AREA_PLAN.doc).numericWashSequence.dryPreparation;
  const result=prepareProductionDryContact({continuation,preparation,observe:observed,dry:q=>dry(target,q.maxSteps,O,{levelMax:q.levelMax,dt:q.dt}),record:r=>fs.appendFileSync(path.join(out,'semantic-commands.jsonl'),JSON.stringify({kind:'production-numeric-dry-preparation',areaId:a.area.id,passId:a.key,shapeKey:AREA_NUMERIC_SEQUENCE.shapeKey,...r,ordinaryDryCommandId:r.status==='ordinary-dry-observed'?AREA_EXEC.records.at(-1)?.id:null})+'\n')});paper=result.paper;
 }
 if(a&&paint){if(!(continuation?productionContinuationReady(paper,{water:load.waterMass,pigment:load.pigmentMass.reduce((s,v)=>s+v,0)},continuation):semanticMaterialReady(a.pass,paper,{water:load.waterMass,pigment:load.pigmentMass.reduce((s,v)=>s+v,0)}))){const failure={kind:'semantic-material-admission-failed',numericalChargeState:continuation??{shapeKey:AREA_NUMERIC_SEQUENCE?.shapeKey??null,executedOwnCommandIds:AREA_NUMERIC_SEQUENCE?.history.map(r=>r.id)??[],role:'no actually intersecting own executed primary support; strict dry admission'},areaId:a.area.id,passId:a.key,expected:{state:a.pass.wetness.required,minMoistShare:.7,maxMoistWater:.15},paper,materialContact:{...materialContact,cells:undefined,conservativeCells:undefined},conservativePaper:measurePaper(target,materialContact.conservativeCells),contactParts:contactParts(),brush:load,geometry:points};fs.writeFileSync(path.join(out,'semantic-material-failure.json'),JSON.stringify(failure,null,2));fs.appendFileSync(path.join(out,'semantic-commands.jsonl'),JSON.stringify(failure)+'\n');if(target===sheet){try{const pixels=Buffer.from(render());fs.writeFileSync(path.join(out,'semantic-material-failure.ppm'),Buffer.concat([Buffer.from('P6\n'+W2+' '+H2+'\n255\n'),pixels]));execFileSync(process.execPath,['--input-type=module','-e',"import sharp from 'sharp';import fs from 'node:fs';await sharp(fs.readFileSync(0),{raw:{width:Number(process.argv[2]),height:Number(process.argv[3]),channels:3}}).png().toFile(process.argv[1]);",path.join(out,'semantic-material-failure.png'),String(W2),String(H2)],{cwd:root,input:pixels,timeout:10000});}catch(e){fs.writeFileSync(path.join(out,'semantic-material-failure-image-error.txt'),String(e));}}
throw Error(`semantic material gate failed ${a.key}: ${JSON.stringify(paper)}`);}
 for(const i of contact.cells){const j=Math.floor(i/target.w/SC)*w+Math.floor(i%target.w/SC);if(contact.primaryMask[i]&&AREA_PLAN.reserves[j])throw Error(`bare-paper contact ${a.key} cell ${j}`);if(!a.pass.edges.overlap&&contact.primaryMask[i]&&AREA_PLAN.owner[j]!==AREA_PLAN.doc.areas.indexOf(a.area)&&!target.resist?.[i])throw Error(`unplanned contact overlap ${a.key}`);}}
 const brushPhysicalBefore=semanticBrushObservation(b),requestedContact={loadedcontact:num('loadedcontact',0),semanticBridge:a?semanticTechnique(a,{}).bridge:null};
 const result=AREA_EXEC.command('physical brush stroke',{numericalChargeState:continuation??{shapeKey:AREA_NUMERIC_SEQUENCE?.shapeKey??null,role:'declared pass start/contact; original material gate'},brushPhysicalBefore,requestedContact,geometry:points,gestureId:points[0]?.gestureId??null,authoredGeometry:a?.pass.source==='authored',contactModel:b.model??'row',contactExecution:b.model==='tuft'?'CPU tuft contact; ordinary GPU sheet physics when backend supports it':'existing row contact',options,paper,sealedFilmCells:contact.cells.filter(i=>target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1).length,brush:load,pigmentLoaded:paint,materialContact:{...materialContact,cells:undefined,conservativeCells:undefined},conservativePaper:measurePaper(target,materialContact.conservativeCells),contactParts:contactParts(),primaryCells:contact.cells.filter(i=>contact.primaryMask[i]),targetSurface:target===sheet?'scene':'calibration-or-other',semanticIntent:a?.area.intent??'UNASSIGNED',passIntent:a?.pass??null},()=>{const body=a&&paint&&target===sheet&&a.pass.source==='authored'&&b.model==='tuft'?observeFreeFilmStroke(b,options,o=>physicalStroke(b,target,points,o),{required:a.pass.load.requireFreeFilm===true}):null;const value=body?body.value:physicalStroke(b,target,points,options);if(body)fs.appendFileSync(path.join(out,'semantic-commands.jsonl'),JSON.stringify({kind:'semantic-free-film-body',areaId:a.area.id,passId:a.key,gestureId:points[0]?.gestureId,...body.evidence})+'\n');if(a&&paint&&target===sheet&&!fs.existsSync(path.join(out,'semantic-first-pigment-contact.ppm'))){const pixels=render();fs.writeFileSync(path.join(out,'semantic-first-pigment-contact.ppm'),Buffer.concat([Buffer.from('P6\n'+W2+' '+H2+'\n255\n'),Buffer.from(pixels)]));fs.writeFileSync(path.join(out,'semantic-first-pigment-contact.json'),JSON.stringify({kind:'actual native first scene pigment contact; not completed pass or quality acceptance',areaId:a.area.id,passId:a.key,backend:GPU_INFO,target:AREA_PLAN.doc.target,view:AREA_PLAN.doc.view??null,sourceCode:codeHash(root,[fileURLToPath(import.meta.url),path.join(root,'tools/painter/semantic-areas.mjs'),path.join(root,'tools/painter/semantic-brush-observation.mjs')]),requestedContact,brushPhysicalBefore,brushPhysicalAfter:semanticBrushObservation(b),paper,materialContact:{...materialContact,cells:undefined,conservativeCells:undefined}},null,2));}if(a)fs.appendFileSync(path.join(out,'semantic-commands.jsonl'),JSON.stringify({kind:'semantic-consumption',areaId:a.area.id,passId:a.key,brushBefore:load,brushAfter:measureBrush(b),brushPhysicalBefore,brushPhysicalAfter:semanticBrushObservation(b)})+'\n');if(body&&a.pass.load.requireFreeFilm===true&&!body.evidence.ready){fs.writeFileSync(path.join(out,'semantic-free-film-failure.ppm'),Buffer.concat([Buffer.from('P6\n'+W2+' '+H2+'\n255\n'),Buffer.from(render())]));throw Error('authored connected free-film threshold failed '+a.key+': '+JSON.stringify(body.evidence));}return value;});
 if(a&&paint&&!a.productionLegacyDetail&&AREA_NUMERIC_SEQUENCE?.key===a.key)AREA_NUMERIC_SEQUENCE.history.push({id:AREA_EXEC.records.at(-1).id,status:'executed',shapeKey:AREA_NUMERIC_SEQUENCE.shapeKey,primary:new Set(contact.cells.filter(i=>contact.primaryMask[i]))});
 if(a&&paint&&target===sheet&&!a.productionLegacyDetail&&AREA_NUMERIC_SEQUENCE?.key===a.key&&num('numericcontactstop',0)&&!AREA_NUMERIC_CONTACT_STOP)AREA_NUMERIC_CONTACT_STOP={commandId:AREA_EXEC.records.at(-1).id,areaId:a.area.id,passId:a.key,shapeKey:AREA_NUMERIC_SEQUENCE.shapeKey,geometry:points,primaryCells:contact.cells.filter(i=>contact.primaryMask[i]),pixels:Buffer.from(render())};
 return result;
};
const pencilDraw=(target,gs,pigment,options)=>{
 const recorded=num('recordgraphite',0)>0||!!opt('preparationbinding','');
 const execute=strokes=>drawMaterial(target,strokes,new Float32Array(target.n).fill(.25),target.w,target.h,{medium:opt('graphiteprofile',REQUESTED_DRAW_MEDIUM.startsWith('graphite-')?REQUESTED_DRAW_MEDIUM:'graphite-HB'),stage:AREA_DRAW_STAGE,subject:drawSubject(),mmPerCell:num('sheetmm', DEFAULT_SHEET_MM)/target.w,state:DRAW_MATERIAL_STATE[AREA_DRAW_STAGE],caps:{lines:num('openinglines',DC('opening').lines),pressure:num('openingpressure',DC('opening').pressure),minLengthMm:num('openingminmm',DC('opening').minLengthMm)},O,audit:PEN_STATE_AUDIT,
  ...(recorded?{graphiteExecute:(sh,paths,k,profileOptions)=>recordGraphiteBatch({sheet:sh,strokes:paths,pigment:k,options:{...profileOptions,seed:options.seed},material:SHEET_PIGS[k],source:{binding:opt('preparationbinding','')||null,target:opt('image',''),guide:opt('penpencil',''),drawing:opt('drawingfile',''),frame:[target.w,target.h],sheetWidthMm:num('sheetmm', DEFAULT_SHEET_MM)},execute:physicalPencilDraw,observe:measurePaper,record:r=>fs.appendFileSync(path.join(out,'preparation-graphite.jsonl'),JSON.stringify(r)+'\n')})}: {})});
 if(!AREA_PLAN)return execute(gs);
 let cells=0;for(const g of semanticDrawingGroups(AREA_PLAN,gs,AREA_DRAW_STAGE,SC)){AREA_EXEC.set({area:g.area,key:g.key});const r=AREA_EXEC.command('actual dry graphite',{geometry:g.gesture.points,options,drawingRole:g.area.drawingRole,material:GRAPHITE_PROFILE},()=>execute([g.gesture]));cells+=r.cellsLaid??r.cells??0;}AREA_EXEC.set(null);return {cellsLaid:cells};};

if(VALUE_ENABLED){
 if(MOD||MIXES||FINISH_FILE||opt('curls','0')!=='0'||num('bgfirst',0)>0)throw Error('value planner cannot combine with independent modulation/mixes/finish/curls/bgfirst adapters; use --order legacy-painter for legacy replay');
 const shaped=num('shapedmarks',0)>0;const stone=shaped&&TRUMBULL_RULES?shapeStoneDemand(AL,PIGS.length,px,PIGS,{foliage:num('foliagerefit',0)>0,w,h,minCells:num('stonemincells',64),ochreMin:num('stoneochremin',.45),warm:num('stonewarm',0)>0,split:num('stonesplit',0)}):null;if(stone)fs.writeFileSync(path.join(out,'value-hue-check.json'),JSON.stringify(stone.audit,null,2));
 if (opt('furreserves','')) {
  const reserves=furLightReserves({D:SRC,w,h},JSON.parse(opt('furreserves')));
  HOLD=Uint8Array.from(reserves,(v,i)=>v||(HOLD?.[i]??0)?1:0);
  fs.writeFileSync(path.join(out,'fur-reserves.json'),JSON.stringify({cells:reserves.reduce((a,v)=>a+v,0),settings:JSON.parse(opt('furreserves')),stage:'planned before paint'}));
 }
 VALUE_PLAN=planLightToDark({bandRound:num('bandround',0)>0,valueFloor:opt('valuefloor','')||null,strokePlan:num('strokeplan',0)>0,laneMm:num('lanemm',6),laneAdapt:num('laneadapt',0)>0,litWarm:num('litwarm',0)>0,strokeMm:num('strokemm',30),washReachMm:num('washreach',0),litLift:num('litlift',0),litL:num('litl',86),litReserveL:num('litreserve',95),shadowRaw:num('shadowraw',0)>0,edgeWobbleMm:num('edgewobble',0),coolGain:num('coolgain',1),shadowThresh:num('shadowthresh',.38),midGain:num('midgain',1),violetShadow:num('violetshadow',0)>0,shadowWater:num('shadowwater',0),roseViolet:num('roseviolet',0)>0,groundGlaze:num('groundglaze',0),groundFrom:num('groundfrom',GROUND.from),stoneBlocks:num('stoneblocks',0),stoneBlockMm:num('stoneblockmm',2.6),stoneBlockAmt:num('stoneblockamt',.18),deepAccent:num('deepaccent',0),stoneIrregular:num('stoneirregular',0)>0,deepGrow:num('deepgrow',0),recessAccent:num('recessaccent',0)>0,skyOneLayer:num('skyonelayer',0)>0,stoneClusters:num('stoneclusters',0),eyeRing:num('eyering',0),texShadow:num('texshadow',1),texZone:(opt('texzone','')||TEX_ZONE.join(',')).split(',').map(Number),texShare:num('texshare',0),recessMax:num('recessmax',0),stoneCourses:num('stonecourses',0)>0,minShapeCells:num('minshapecells',0),cellFamilies:num('cellfamilies',VALUE_CONFIG?.view?.wholeOf?1:0)>0,paperRel:num('paperrel',0)>0,paperLights:num('paperlights',0)>0,paperDelta:num('paperdelta',10),accentShare:num('accentshare',0),accentMin:num('accentmin',.55),layerSmoothMm:num('layersmooth',2),styleGain:num('stylegain',1),darkGain:num('darkgain',1),skySplit:num('skysplit',0)>0,layerTexture:num('layertexture',0)>0,edgeFadeMm:num('edgefade',0),layerHue:num('layerhue',0)>0,recessClean:num('recessclean',0)>0,recessLayers:num('recesslayers',1),recessShare:num('recessshare',.5),layers:num('midlayers',0),layerIncrement:num('layerincrement',0)>0,pigShare:num('pigshare',0),hueChroma:num('huechroma',0),passCap:num('passcap',0),carryMm:num('carrymm',0),holeFill:num('holefill',0),keepMask:num('carrykeep',0)>0,maskMm:num('maskmm',0),paleLights:num('palelights',0),lightFamilies:num('lightfamilies',0)>0,laneMax:num('lanemax',0),nestedBands:num('nestedbands',0)>0,nested:num('nestedmid',0)>0,midDomains:num('middomain',1)>0,brushChoice:num('brushchoice',0)>0,shaped,pigments:PIGS,subject:VALUE_CONFIG?.subject,trumbullRules:TRUMBULL_RULES,recesses:RECESSES,portraitRules:PORTRAIT_RULES,styleSelection:VALUE_CONFIG?.styleSelection,demand:stone?.demand??AL,k:PIGS.length,density:SRC,w,h,rgb:px,hold:HOLD,families:VALUE_CONFIG?.families??MAJOR_INTENT?.families??[],reserves:VALUE_CONFIG?.reserves??[],sheetWidthMm:num('sheetmm', DEFAULT_SHEET_MM)});
 layers=VALUE_PLAN.layers;steps=5;
 // --washsession 2: within each band step, a region's pigment passes follow one another, so its wash is charged with
 // all its pigments in one wet session (the planner lists them pigment by pigment).
 if(WASH_SESSION>1){const step=l=>l.shapes[0]?._valuePlan?.id?.split('/')[1]??String(l.value),first=new Map();layers.forEach((l,i)=>{const g=step(l)+'|'+l._valuePhase;if(!first.has(g))first.set(g,i);});
  layers=layers.map((l,i)=>({l,i,g:first.get(step(l)+'|'+l._valuePhase),r:l._order?.region??0})).sort((a,b)=>a.g-b.g||(a.l._valuePhase==='shadow'?a.i-b.i:a.r-b.r||a.l.pigment-b.l.pigment||a.i-b.i)).map(q=>q.l);}
 // --darkfirst: shadow-phase layers (shadow glazes, deep accents) before the middle layers, light first still
 if(num('darkfirst',0)>0){const ph=l=>l._valuePhase==='light'?0:l._valuePhase==='shadow'?1:2;layers=layers.map((l,i)=>({l,i})).sort((a,b)=>ph(a.l)-ph(b.l)||a.i-b.i).map(q=>q.l);console.log('darkfirst: '+layers.map(l=>l._valuePhase[0]).join(''));}
 const seams=layers.filter(l=>l.value===1).flatMap(l=>l.shapes.flatMap(sh=>unsupportedAxisEdges(sh.mask,w,h,px).map(edge=>({pass:sh._valuePlan.id,...edge}))));
 const baseMass=new Float32Array(n);for(const l of layers.filter(l=>l.value===1))for(const sh of l.shapes)for(let y=sh.box.y0;y<=sh.box.y1;y++)for(let x=sh.box.x0;x<=sh.box.x1;x++){const i=y*w+x;if(sh.ids[i]===sh.id)baseMass[i]+=sh.graded[i];}
 let warm=0,warmPainted=0;for(let i=0;i<n;i++)if(px[3*i]-px[3*i+2]>18&&px[3*i+1]-px[3*i+2]>8){warm++;if(baseMass[i]>0)warmPainted++;}
 fs.writeFileSync(path.join(out,'value-region-check.json'),JSON.stringify({source:VALUE_PLAN.regions.source,band1UnsupportedAxisEdges:seams,regionCount:VALUE_PLAN.regions.regions.length,regions:VALUE_PLAN.regions.regions,warmTargetCells:warm,warmCellsWithPositiveBand1Pigment:warmPainted,physicalReserve:'same target-white mask as compiled plan'},null,2));
 // A line-only checkpoint never executes these wash masks. Keep their diagnostic
 // in value-region-check.json, but do not reject a valid drawing because an
 // unused wash plan failed its seam check. Full paintings still fail closed.
 if(seams.length && num('drawingonly',0)===0)throw Error('compiled band-1 mask contains unsupported axis-aligned seams');
 // --subjectorder s (0..1): the plan's subjectOrder brought on subject by subject, light to dark within each, held back
 // by s (src/paint/methods/subject-order.mjs). 0, the default, keeps the whole-sheet bands.
 {const so=num('subjectorder',0);if(!(so>=0&&so<=1))throw Error('--subjectorder: a number from 0 to 1');
  const field=VALUE_CONFIG?.subjectOrder?subjectField({subjectOrder:VALUE_CONFIG.subjectOrder,families:VALUE_CONFIG.families??[],labels:VALUE_PLAN.regions.labels,w,h}):null;
  if(so>0&&!field)console.log('subject order: the plan names no subjectOrder; whole-sheet bands kept');
  const r=orderBySubject(layers,{field,strength:so,w,n});
  if(r.summary){layers=r.layers;fs.writeFileSync(path.join(out,'subject-order.json'),JSON.stringify({strength:so,overlap:OVERLAP,subjects:r.summary,passes:r.order},null,1));
   {const pal=[[230,159,0],[86,180,233],[0,158,115],[240,228,66],[0,114,178],[213,94,0],[204,121,167],[120,120,120]],img=Buffer.alloc(n*3);for(let i=0;i<n;i++){const c=pal[field.rank[i]%pal.length];img[3*i]=c[0];img[3*i+1]=c[1];img[3*i+2]=c[2];}await sharp(img,{raw:{width:w,height:h,channels:3}}).png().toFile(path.join(out,'subject-order.png'));}
   console.log(`subject order ${so}: ${layers.length} passes; ${r.summary.map(q=>`${q.subject} ${(100*q.share).toFixed(0)}% passes ${q.first}-${q.last}`).join(', ')}`);}}
 HOLD=VALUE_PLAN.protectedCells;
 fs.writeFileSync(path.join(out,'value-plan.json'),JSON.stringify({stage:'executable target-value plan before physical instruments',style:VALUE_PLAN.style,target:opt('image'),caps:[.16,.32,.50,.75,1],peakDensity:VALUE_PLAN.value.peak,geometry:VALUE_PLAN.geometry,omittedReservedOrSpeckDemand:VALUE_PLAN.omittedDemand,lights:VALUE_PLAN.lightShapes,explicitLights:VALUE_CONFIG?.reserves??[],passes:VALUE_PLAN.instructions,drawing:'sparse structure first; lighter selective closing ink after dry gate'},null,2));
 console.log(`target values: ${layers.length} pigment/region passes, ${VALUE_PLAN.instructions.length} connected shapes; five light-to-dark bands; shadows never split by region`);
 if(num('valuepreviewonly',0)){
  const preview=await writeValuePreview({plan:VALUE_PLAN,out,w,h,pigments:PIGS,paperRGB,target:path.resolve(root,opt('image')),photo:VALUE_CONFIG?.photo,subject:VALUE_CONFIG?.subject??'subject',name:VALUE_CONFIG?.name,root,opening:opt('drawingfile',''),closing:opt('drawinglast',''),variant:opt('valuevariant','lighttodark'),version:opt('valueversion','W4'),sheetMm:num('sheetmm', DEFAULT_SHEET_MM)});
  fs.writeFileSync(path.join(out,'compile-result.json'),JSON.stringify(preview,null,2));console.log('CPU preview',preview.board,preview.seconds);process.exit(0);
 }
}
phaseMark('plan');
const SC = num('scale', 1), W2 = w * SC, H2 = h * SC, N2 = W2 * H2;
// --brushfloor 1: a graded wash runs as one stroke, recharged every --floorchunk px at 1086 wide (default 24). On with --physical.
// Without it the wash is lifted and recharged every --gradedchunk cells (default 6).
// --physical 1 (data/brushes.json, src/paint/methods/brushes.mjs): brushes from a physical sheet and real brushes
const PB = loadPhysical({ root, opt, num, W2, H2 });
if (PB) console.log(`physical: picture ${PB.mm.toFixed(0)} mm wide, ${PB.mmPerCell.toFixed(3)} mm a cell; ${PB.summary()}`);
const GFLOOR = num('brushfloor', 0) > 0 || !!PB;
const GCHUNK = GFLOOR ? Math.max(num('gradedchunk', 6), num('floorchunk', 24) * W2 / 1086) : num('gradedchunk', 6);
// --paperfibres, --papertooth: shares of the relief that are fibre and tooth; --toothscale: tooth coarseness.
// --papershade: how much the bare sheet's relief shows in its own tone. Default 0.04.
// --paperscan file: paper height from a grey height map, tiled, one scan pixel to --paperscanscale cells (src/media/paper-scan.mjs).
// --paper coldpress (default): cold-press tooth at physical size in mm (coldPressField); any other value keeps the value-noise tooth.
// --cpbump min,max: bump diameters in mm; --cpcover: how crowded; --cpswell: broad swells.
const CP_MM = opt('paper', 'coldpress') === 'coldpress' ? (PB ? PB.mmPerCell : num('sheetmm', DEFAULT_SHEET_MM) / W2) : 0;
// --paperphysical 0|1: fibre lengths, density and brush relief in millimetres. Default 1.
const PAPER_PHYSICAL_MM = num('paperphysical', 1) > 0 ? (PB ? PB.mmPerCell : num('sheetmm', DEFAULT_SHEET_MM) / W2) : 0;
const PAPER_OPTS = { ...(PAPER_PHYSICAL_MM > 0 ? { mmPerCell: PAPER_PHYSICAL_MM } : {}), seed: 9, scale: SC, toothScale: num('toothscale', 0.2), fibres: num('paperfibres', 0.5), tooth: num('papertooth', 0.5), proudBlur: num('proudblur', 1),
  ...(CP_MM ? { coldPress: { mmPerCell: CP_MM, bumpMm: (opt('cpbump', '0.5,2')).split(',').map(Number), cover: num('cpcover', 2.2), swell: num('cpswell', 0.3), ...(num('cppits', 0) > 0 ? { pits: num('cppits', 0) } : {}) } } : {}) };
// --cppits p: share of cold-press bumps that are pits, so settled paint gathers in them as dark grains. Default 0.
if (CP_MM) console.log(`paper: cold press at ${CP_MM.toFixed(3)} mm a cell, bumps ${opt('cpbump', '0.5,2')} mm, tooth ${num('papertooth', 0.5)} of the height`);
const paper = opt('paperscan', '') ? await (async () => {
  const { scanPaper } = await import('../src/media/paper-scan.mjs');
  const file = path.resolve(root, opt('paperscan', ''));
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const scan = { data: info.channels === 1 ? data : Uint8Array.from({ length: info.width * info.height }, (_, i) => data[i * info.channels]), width: info.width, height: info.height };
  console.log(`paper: scanned height from ${opt('paperscan', '')} (${info.width}x${info.height}), ${num('paperscanscale', 1)} cells a scan pixel, mix ${num('paperscanmix', 1)}`);
  return scanPaper(W2, H2, scan, { ...PAPER_OPTS, scanScale: num('paperscanscale', 1), scanMix: num('paperscanmix', 1) });
})() : makePaper(W2, H2, PAPER_OPTS);
// --physics key=value,...: override any sheet constant (src/media/sheet.mjs DEFAULTS)
const PHYS = Object.fromEntries((opt('physics', '') || '').split(',').filter(Boolean).map(kv => { const [k, v] = kv.split('='); if (!(k in DEFAULTS)) throw new Error(`--physics: no sheet constant ${k}`); return [k, Number(v)]; }));
// --gran: granulation strength, default 0.25. The relief never changes, so every sweep lays the same pattern and it compounds.
const sheet = createSheet(paper, SHEET_PIGS); sheet._tape = 1;
// --probebox x0,y0,x1,y1[;...] (sheet fractions, diagnostic): paint only inside the boxes; compare only with a crop run of the same boxes.
// --ablate dry,accents: skip those passes (diagnostic).
const PROBE = opt('probebox', '') ? (() => {
  const m = new Uint8Array(n);
  for (const b of opt('probebox').split(';')) { const [x0, y0, x1, y1] = b.split(',').map(Number); for (let y = Math.floor(y0 * h); y < Math.min(h, Math.ceil(y1 * h)); y++) for (let x = Math.floor(x0 * w); x < Math.min(w, Math.ceil(x1 * w)); x++) m[y * w + x] = 1; }
  const clip = new Uint8Array(W2 * H2); for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) clip[y * W2 + x] = m[((y / SC) | 0) * w + ((x / SC) | 0)];
  return { m, clip };
})() : null;
if (PROBE) setClip(sheet, PROBE.clip);
const ABLATE = new Set(opt('ablate', '').split(',').filter(Boolean));
// --inkres N: the pens draw on their own sheet at N times the resolution and the output is N times as wide
// (src/paint/methods/ink-res.mjs). Default 1, off. Cannot combine with --paperscan.
// --inkresgain: the fine pen's ink strength; the default is a power-law fit in sheet width.
const INKRES = num('inkres', 1) > 1 ? (() => { if (opt('paperscan', '')) throw new Error('--inkres: not with --paperscan'); return makeInkRes({ N: num('inkres', 1), W2, H2, paperOpts: PAPER_OPTS, pigments: SHEET_PIGS, main: sheet, pad: opt('inkrespad', '') === '' ? null : num('inkrespad', 0.25) * (Math.round(num('inkres', 1)) - 1), gain: num('inkresgain', 1.3 * Math.pow(540 / W2, 0.78)) }); })() : null;
const PEN_STATE_GATE = true, PEN_STATE_AUDIT = [];

const TARGET_DRAW_EDGE=new Float32Array(N2);
for(let y=1;y<H2-1;y++)for(let x=1;x<W2-1;x++){const i=y*W2+x;const lum=j=>{const sx=Math.min(w-1,Math.floor((j%W2)*w/W2)),sy=Math.min(h-1,Math.floor(Math.floor(j/W2)*h/H2)),k=3*(sy*w+sx);return (px[k]+px[k+1]+px[k+2])/765;};TARGET_DRAW_EDGE[i]=Math.min(1,Math.hypot(lum(i+1)-lum(i-1),lum(i+W2)-lum(i-W2)));}
const DRAW_MATERIAL_STATE={opening:{used:0},closing:{used:0}};
// --drawsubject <caps set>: drawing caps fitted on one subject (src/paint/tuned/drawing-caps.mjs), set by its preset.
const drawSubject=()=>opt('drawsubject','default'),DC=stage=>drawingCaps(drawSubject(),stage);
// Use one policy in planning and execution. The source's own ink is drawn with its short descriptive marks when the
// plan says the target is drawn in pen: a pen-and-wash style, an ink medium in its drawing section, or a prepared line
// file of the target's pen lines (--drawingfile). A painted target with no such plan keeps the sparse caps, since the
// separator also finds "ink" in dark painted edges (foliage, windows) that were never pen lines. --sourceink 0|1
// overrides. CLI limits override both.
const sourceInkDrawing = () => OUTLINE.medium === 'ink' && (opt('sourceink', '') !== '' ? num('sourceink', 0) > 0
  : VALUE_PLAN?.style?.name === 'ink-and-wash' || VALUE_CONFIG?.drawing?.medium === 'ink' || !!opt('drawingfile', ''));
const drawingCapsFor = (stage, graphite = false) => {
 const defaults = sourceDrawingCaps({medium:graphite?'graphite-HB':opt('inkprofile',STYLE_INK_DEFAULT),stage,subject:drawSubject(),sourceInk:sourceInkDrawing()&&(stage==='opening'||!!opt('drawinglast','')),plannedDrawing:!!opt('drawingfile','')});
 return {lines:num(stage+'lines',defaults.lines),pressure:graphite&&stage==='opening'&&STAGE_PLAN?.files.prep?num('preppressure',1):num(stage+'pressure',defaults.pressure),
  ...(stage==='opening'?{minLengthMm:num('openingminmm',defaults.minLengthMm)}:{edgeMin:num('closingedgemin',defaults.edgeMin)})};
};
const penDraw = (sh,gs,want,w,h,o) => {
 const stage=AREA_DRAW_STAGE, graphite=o.ink?.[GRAPHITE_AT]>0;
 const execute=paths=>{const options={...o,medium:graphite?opt('graphiteprofile',REQUESTED_DRAW_MEDIUM.startsWith('graphite-')?REQUESTED_DRAW_MEDIUM:'graphite-HB'):opt('inkprofile',REQUESTED_DRAW_MEDIUM.endsWith('-ink')?REQUESTED_DRAW_MEDIUM:STYLE_INK_DEFAULT),stage,subject:drawSubject(),mmPerCell:(PB?.mm??num('sheetmm', DEFAULT_SHEET_MM))/w,edgeStrength:TARGET_DRAW_EDGE,state:DRAW_MATERIAL_STATE[stage],caps:drawingCapsFor(stage,graphite),audit:PEN_STATE_AUDIT};return INKRES&&!graphite?drawFineMaterial(INKRES,paths,{w,h,...options}):drawMaterial(sh,paths,want,w,h,options);};
 if(!AREA_PLAN)return execute(gs);
 let drawn=0,dips=0;for(const g of semanticDrawingGroups(AREA_PLAN,gs,stage,SC)){AREA_EXEC.set({area:g.area,key:g.key});const r=AREA_EXEC.command('physical pen gesture',{geometry:g.gesture.points,drawingRole:g.area.drawingRole,material:graphite?GRAPHITE_PROFILE:INK_PROFILE},()=>execute([g.gesture]));drawn+=r.drawn??0;dips+=r.dips??0;}AREA_EXEC.set(null);return {drawn,dips};
};
const OUT_W = INKRES ? INKRES.width : W2, OUT_H = INKRES ? INKRES.height : H2;
// --encloseease e: a dry cell held by water on more sides fills more easily (src/media/sheet.mjs). Set only when used.
const O = { ...DEFAULTS, fixedBed: num('fixedbed', 1), edgeEvap: num('edge', 0.0012), gran: num('gran', 0.25), granFill: num('granfill', 0), ...PHYS, ...(num('encloseease', 0) > 0 ? { encloseEase: num('encloseease', 0) } : {}), ...(num('slidecap', 0) > 0 ? { slideCap: num('slidecap', 0) } : {}),
  ...(num('holerim', 0) > 0 ? { holeSpan: Math.max(1, Math.round(num('holerim', 0) / (PB ? PB.mmPerCell : num('sheetmm', DEFAULT_SHEET_MM) / W2))) } : {}),
  ...(num('holefill', 0) > 0 ? { holeFill: Math.max(1, Math.round(num('holefill', 0) / (PB ? PB.mmPerCell : num('sheetmm', DEFAULT_SHEET_MM) / W2))) } : {}) };
// --holefill mm: a dry hollow the wash surrounds within mm fills where it is lower than the wet paper beside it.
// --slidecap c: settled grains rolling into hollows may not reverse the slope they rolled down (src/media/sheet.mjs).
// --holerim mm: a dry hole the wash holds on all four sides within mm dries without a dark rim.
// Each is set only when used.
// --gpu auto|on|off: sheet backend (Metal on Macs via optional `webgpu`); auto falls back to CPU. Written to backend.json.
// --layercache check: every cached layer sum and render is also worked out the plain way and compared (slow; a test)
if (opt('layercache', '') === 'check') process.env.LAYER_CACHE_CHECK = '1'; else if (opt('layercache', '') === 'off') process.env.LAYER_CACHE = '0';
// --gpustrokes 0: ordinary brush contact stays on the CPU; enabled wash splats can still use the GPU sheet.
if (opt('gpustrokes', '') === '0') process.env.GPU_STROKES = '0';
if (opt('gpujitter', '')) process.env.GPU_JITTER_MS = opt('gpujitter', ''); // test: delay each GPU stroke's posting by about this many ms
if (opt('gpusyncstrokes', '') === '1') process.env.GPU_SYNCSTROKES = '1';
if (opt('gpufullcap', '') === '1') process.env.GPU_FULLCAP = '1'; // test: every step dispatches for every tile
if (opt('nobox', '') === '1') process.env.NOBOX = '1';
if (opt('nobox', '') === 'check') process.env.CHECKBOX = '1';
if (opt('needcells', '') === '0') process.env.NEEDCELLS_OFF = '1'; // A/B: the dry-brush marks and drags read the CPU copy as it stands
if (opt('gpusums', '') === '0') process.env.GPU_SUMS = '0'; // thickness and frames from the whole sheet brought down, not from sums made on the GPU
if (opt('gpustrokes', '') === 'capdebug') process.env.GPU_STROKES = 'capdebug';
if (opt('gpustrokes', '') === 'check') process.env.GPU_STROKES = 'check'; // compare eligible ordinary GPU strokes without within-stroke flow (src/media/gpu/stroke-check.mjs)
const GPU_MODE = opt('gpu', 'auto');
if (!['auto', 'on', 'off'].includes(GPU_MODE)) throw new Error(`--gpu takes auto, on or off, not ${GPU_MODE}`);
const GPU_INFO = {...attachGpu(sheet, O, { mode: GPU_MODE }),nativePaintMode:NATIVE_PAINT_MODE};
console.log(`sheet backend: ${GPU_INFO.backend}${GPU_INFO.reason ? ` (${GPU_INFO.reason})` : ''}`);
const base = Buffer.alloc(N2 * 3);
const SHADE = num('papershade', 0.04);
for (let i = 0; i < N2; i++) { const t = 1 - SHADE + SHADE * paper.height[i]; for (let c = 0; c < 3; c++) base[i * 3 + c] = Math.min(255, paperRGB[c] * t); }
// --wetrender (on with --wetframes): wet paper renders darker in frames, showing where the water is.
const WETRENDER = opt('wetrender', num('wetframes', 0) > 0 ? '1' : '0') !== '0';
// the white gouache laid last (--smalllights gouache), over the washes and not in them: null until it is laid
let GOUACHE = null;
// --wetpolicy (see the technique choice per passage): on, whether the last passage went in wet, and the tally
const WETPOL = num('wetpolicy', 0) > 0, WETPOL_COUNT = { wet: 0, dry: 0 };
let WETPOL_WET = false;
const finishRGB = rgb => {
  if (WETRENDER) {
    coherent(sheet); // it reads the water, which a sheet on the GPU holds
    const cap = num('wetcap', 0.6), dark = num('wetdark', 0.14);
    for (let i = 0; i < N2; i++) { const wv = sheet.W[i]; if (wv > 1e-4) { const f = 1 - dark * Math.min(1, wv / cap); rgb[i * 3] *= f; rgb[i * 3 + 1] *= f; rgb[i * 3 + 2] *= f * 1.01; } }
  }
  const buf = Buffer.from(rgb.buffer);
  return GOUACHE ? overlay(buf, GOUACHE.cover, GOUACHE.rgb, N2) : buf;
};
// With the sheet on the GPU a render is kept with the link's change count (GpuLink.version) and the dried layers' version:
// a frame and the plan-against-sheet mark taken at the same moment render once. The CPU sheet renders every time.
let RENDER_MEMO = null, RENDER_REUSED = 0;
const renderRaw = () => {
  const link = sheet._gpu;
  if (!link) return renderSheet(sheet, SHEET_PIGS, base, N2, 1);
  const key = `${link.version}|${sheet._layerVer || 0}|${sheet.layers.length}`;
  if (RENDER_MEMO && RENDER_MEMO.key === key) { RENDER_REUSED++; return RENDER_MEMO.rgb.slice(); }
  const rgb = (NATIVE_PAINT_MODE.mode==='fast' || SPEED_GPU_OPTICS) && link.resident && process.env.GPU_COMPOSITE==='1' && !WETRENDER && num('pencilerase',0)===0 ? (()=>{
      const link=sheet._gpu;link.initOptical(sheet,null);const under=new Float64Array(N2*3);
      if(sheet.layers.length>1){link.syncLower(sheet,1);renderCells([sheet.layers[0]],SHEET_PIGS.map(p=>p.K),SHEET_PIGS.map(p=>p.S),base,0,N2,1,null,null,null,under);}
      else for(let i=0;i<under.length;i++)under[i]=base[i]/255;
      return link.opticalFrame(sheet,under);
  })() : renderSheet(sheet, SHEET_PIGS, base, N2, 1);
  RENDER_MEMO = { key, rgb: rgb.slice() };
  return rgb;
};
const render = () => finishRGB(renderRaw());
// Paper optics for the pictures only (view()); physics, plan feedback and the tape never see them. All off by default.
// --relief s: bare-sheet relief lit from one side, slope over 0.5 mm, mean-normalised; replaces --papershade.
// --papergrain g: a +-g/2 per-pixel grain on the paper.
// --micro a: pigment thickness moved toward the paper's hollows by 1 + a gran t (km.mjs microAmps); mass moves, none is added.
// --microcells c: scale of t in sheet cells (default 1). --renderres N: also render painting-fine.jpg at N times resolution.
const LOOK_RELIEF = num('relief', 0), LOOK_GRAIN = num('papergrain', 0), LOOK_MICRO = num('micro', 0);
const LOOK_RES = Math.max(1, Math.round(num('renderres', 1))), LOOK_MC = Math.max(0.5, num('microcells', 1));
const LOOK = LOOK_RELIEF > 0 || LOOK_GRAIN > 0 || LOOK_MICRO > 0 || LOOK_RES > 1;
const LOOK_MM = CP_MM || (PB ? PB.mmPerCell : num('sheetmm', DEFAULT_SHEET_MM) / W2);
const lookHash = i => { const q = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return q - Math.floor(q); };
const lookBase = (hgt, FW, FH, mm) => {
  const FN = FW * FH, shade = new Float32Array(FN), k = (3.5 * LOOK_RELIEF * 0.5) / mm;
  let mean = 0;
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const i = y * FW + x, h0 = hgt[i];
    const v = LOOK_RELIEF > 0 ? Math.max(0.9, Math.min(1.05, 0.985 - k * ((hgt[y * FW + Math.min(FW - 1, x + 1)] - h0) + (hgt[Math.max(0, y - 1) * FW + x] - h0)))) : 1 - SHADE + SHADE * h0;
    shade[i] = v; mean += v;
  }
  mean = LOOK_RELIEF > 0 ? mean / FN : 1;
  const b = Buffer.alloc(FN * 3);
  for (let i = 0; i < FN; i++) {
    const t = shade[i] / mean + (LOOK_GRAIN > 0 ? LOOK_GRAIN * (lookHash(i) - 0.5) : 0);
    for (let c = 0; c < 3; c++) b[i * 3 + c] = Math.min(255, paperRGB[c] * t);
  }
  return b;
};
const lookMicro = (hgt, FW, FH, sigma) => {
  const lo = gaussian(Float32Array.from(hgt), FW, FH, sigma), FN = FW * FH, t = new Float32Array(FN);
  let ss = 0; for (let i = 0; i < FN; i++) { const d = hgt[i] - lo[i]; ss += d * d; }
  const sd = Math.sqrt(ss / FN) || 1;
  let m = 0; for (let i = 0; i < FN; i++) { t[i] = Math.max(-1, Math.min(1, -(hgt[i] - lo[i]) / sd)); m += t[i]; }
  m /= FN; for (let i = 0; i < FN; i++) t[i] -= m;
  return { t, amp: microAmps(SHEET_PIGS, LOOK_MICRO) };
};
const lookUp = (a, w0, h0, N) => {
  const FW = w0 * N, FH = h0 * N, o = new Float32Array(FW * FH);
  for (let fy = 0; fy < FH; fy++) {
    const sy = (fy + 0.5) / N - 0.5, y0 = Math.max(0, Math.floor(sy)), y1 = Math.min(h0 - 1, y0 + 1), ty = Math.max(0, Math.min(1, sy - y0));
    for (let fx = 0; fx < FW; fx++) {
      const sx = (fx + 0.5) / N - 0.5, x0 = Math.max(0, Math.floor(sx)), x1 = Math.min(w0 - 1, x0 + 1), tx = Math.max(0, Math.min(1, sx - x0));
      o[fy * FW + fx] = (a[y0 * w0 + x0] * (1 - tx) + a[y0 * w0 + x1] * tx) * (1 - ty) + (a[y1 * w0 + x0] * (1 - tx) + a[y1 * w0 + x1] * tx) * ty;
    }
  }
  return o;
};
let LOOK1 = null;
const view = () => {
  if (!LOOK) return render();
  LOOK1 ??= { base: LOOK_RELIEF > 0 || LOOK_GRAIN > 0 ? lookBase(paper.height, W2, H2, LOOK_MM) : base, micro: LOOK_MICRO > 0 ? lookMicro(paper.height, W2, H2, LOOK_MC) : null };
  if (sheet._gpu?.resident && process.env.GPU_COMPOSITE === '1' && num('pencilerase',0) === 0) {
    const link=sheet._gpu;link.initOptical(sheet,LOOK1.micro);
    // Only the preparatory ink can change below the immutable paint stack; keep its unrounded reflectance.
    const under=new Float64Array(N2*3);
    if(sheet.layers.length>1){link.syncLower(sheet,1);renderCells([sheet.layers[0]],SHEET_PIGS.map(p=>p.K),SHEET_PIGS.map(p=>p.S),LOOK1.base,0,N2,1,null,null,null,under,LOOK1.micro);}
    else for(let i=0;i<under.length;i++)under[i]=LOOK1.base[i]/255;
    return finishRGB(link.opticalFrame(sheet,under));
  }
  if (sheet._gpu?.resident && process.env.GPU_OPTICS !== '0') {
    // Keeps the reference's double-precision pigment sum and KM arithmetic; only completed lower layers are cached.
    return finishRGB(renderLayersCached(layersOf(sheet), SHEET_PIGS, LOOK1.base, N2, 1, LOOK1.micro));
  }
  return finishRGB(renderLayers(layersOf(sheet), SHEET_PIGS, LOOK1.base, N2, 1, undefined, LOOK1.micro));
};
const renderFine = () => {
  const N = LOOK_RES, FW = W2 * N, FH = H2 * N, FN = FW * FH, mm = LOOK_MM / N;
  const hgt = CP_MM ? coldPressField(FW, FH, CP_MM / N, PAPER_OPTS.seed, { ...PAPER_OPTS.coldPress, mmPerCell: CP_MM / N }) : lookUp(paper.height, W2, H2, N);
  const fbase = lookBase(hgt, FW, FH, mm), micro = LOOK_MICRO > 0 ? lookMicro(hgt, FW, FH, N * LOOK_MC) : null;
  const Kp = SHEET_PIGS.map(p => p.K), Sp = SHEET_PIGS.map(p => p.S), R = new Float64Array(FN * 3), outF = new Uint8ClampedArray(FN * 3);
  for (let i = 0; i < FN * 3; i++) R[i] = fbase[i] / 255;
  const layers = layersOf(sheet);
  let mIn = 0, mOut = 0;
  layers.forEach((L, q) => {
    const fine = L.map(a => lookUp(a, W2, H2, N));
    if (micro) for (let k = 0; k < fine.length; k++) { const a = fine[k], g = micro.amp[k]; for (let i = 0; i < FN; i++) { mIn += a[i]; mOut += a[i] * (1 + g * micro.t[i]); } }
    renderCells([fine], Kp, Sp, fbase, 0, FN, 1, null, q === layers.length - 1 ? outF : null, R, R, micro);
  });
  let buf = Buffer.from(outF.buffer);
  if (GOUACHE) { const cov = lookUp(Float32Array.from(GOUACHE.cover), W2, H2, N); buf = overlay(buf, cov, GOUACHE.rgb, FN); }
  console.log(`look: painting-fine.jpg ${FW}x${FH} (${N}x, ${mm.toFixed(3)} mm a pixel), relief ${LOOK_RELIEF}, grain ${LOOK_GRAIN}, micro ${LOOK_MICRO}${micro ? ` (per paint ${micro.amp.map(v => v.toFixed(2)).join(' ')}; pigment mass after/before ${(mOut / Math.max(1e-12, mIn)).toFixed(4)})` : ''}`);
  return { buf, FW, FH };
};
if (LOOK) console.log(`look: relief ${LOOK_RELIEF}, papergrain ${LOOK_GRAIN}, micro ${LOOK_MICRO} (paints' gamma ${SHEET_PIGS.map(p => (p.gamma ?? 0).toFixed(2)).join(' ')}), renderres ${LOOK_RES}; pictures only`);

// Read-only pigment accounting, including every wet, pore, deposited and fixed reservoir.
const colourTrace = [];
const traceBox = PORTRAIT_RULES ? TRACE_BOX : [.12,.50,.35,.64];
const traceCells=[];
if(COLOUR_TRACE) for(let y=Math.round(traceBox[1]*h);y<Math.round(traceBox[3]*h);y++)for(let x=Math.round(traceBox[0]*w);x<Math.round(traceBox[2]*w);x++) traceCells.push(y*w+x);
function colourMass(stage, extra={}) {
 if(!COLOUR_TRACE)return;
 const held=new Array(PIGS.length).fill(0);
 for(const i of traceCells){const x=i%w,y=(i/w)|0;for(let dy=0;dy<SC;dy++)for(let dx=0;dx<SC;dx++){
 const q=(y*SC+dy)*W2+x*SC+dx;
 for(let j=0;j<PIGS.length;j++){let v=sheet.G[j][q]+sheet.D[j][q]+sheet.P[j][q];for(const l of sheet.layers)v+=l[j][q];held[j]+=v/(SC*SC);}
 }}
 const sum=a=>Array.from({length:PIGS.length},(_,j)=>traceCells.reduce((v,i)=>v+a[i*PIGS.length+j],0));
 colourTrace.push({stage,held,plan:sum(A),wash:sum(AL),booked:sum(expected),...extra});
}

// --brushshare s: widest brush as a share of the sheet's short side, so it keeps its size against the picture. Default 0.076.
const BRUSH = PB ? Math.max(3 * SC, Math.round(PB.washR)) : Math.max(3 * SC, Math.round(num('brushshare', 0.076) * Math.min(W2, H2)));
// --heading sweep|sheet: hold a wash brush square to its sweep (default) or to the sheet (brush.mjs, stroke's upright).
const UPRIGHT = opt('heading', 'sweep') === 'sheet' ? true : 'sweep';

// Masking fluid goes on a few deliberate lights only: large enough (--maskmin) and surrounded by paint (--maskcount largest).
const highlights = semanticHighlights(AREA_PLAN,() => {
  const pale = new Uint8Array(n);
  // --white chooses a medium; --highlightwhite is the numeric density threshold.
  for (let i = 0; i < n; i++) pale[i] = SRC[i] < num('highlightwhite', 0.05) ? 1 : 0;
  const { labels, areas, count } = components(removeSmall(openMask(pale, w, h, 1), w, h, num('maskmin', 60)), w, h);
  // the largest few, and only those the picture paints all the way round
  const enclosed = [];
  for (let id = 1; id <= count; id++) {
    if (areas[id] < num('maskmin', 60)) continue;
    let touchesEdge = false;
    for (let i = 0; i < n && !touchesEdge; i++) {
      if (labels[i] !== id) continue;
      const x = i % w, y = (i / w) | 0;
      if (x < 2 || y < 2 || x > w - 3 || y > h - 3) touchesEdge = true;
    }
    if (!touchesEdge) enclosed.push({ id, area: areas[id] });
  }
  enclosed.sort((a, b) => b.area - a.area);
  const keep = new Set(enclosed.slice(0, num('maskcount', 12)).map(e => e.id));
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (keep.has(labels[i])) m[i] = 1;
  console.log(`${enclosed.length} lights enclosed by paint, masking the largest ${Math.min(keep.size, enclosed.length)}`);
  return m;
});
let masked = 0; for (let i = 0; i < n; i++) masked += highlights[i];
console.log(`masking ${(100 * masked / n).toFixed(0)}% of the sheet as reserved white`);

// What the plan says the sheet should hold at each point, so each pass is marked against its own job.
const expected = new Float32Array(n * PIGS.length);
// --deliverycal 1: at each full read of the sheet, what it holds of each pigment over what the brush was charged for
// (the ledger) sets a per-pigment charge factor for later passages (src/paint/methods/delivery-cal.mjs). Sheet against
// ledger only. --deliverycalmax caps the factor (default 1.8). Default 0.
const DELIVERY = num('deliverycal', 0) > 0 ? createDeliveryCal(PIGS.length, { max: num('deliverycalmax', 1.8) }) : null;
const DCAL = (sh, j) => (DELIVERY ? (sh._dcal ??= DELIVERY.factors())[j] : 1);
const planDensity = () => {
  const D = new Float32Array(n);
  for (let i = 0; i < n; i++) { let d = 0; for (let j = 0; j < PIGS.length; j++) d += expected[i * PIGS.length + j] * (PIGS[j].K[0] + PIGS[j].K[1] + PIGS[j].K[2]) / 3; D[i] = d; }
  return D;
};
const sheetDensity = big => {
  const D = new Float32Array(n);
  const pl2 = 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let l = 0, c = 0;
    for (let dy = 0; dy < SC; dy++) for (let dx = 0; dx < SC; dx++) {
      const q = ((y * SC + dy) * W2 + x * SC + dx) * 3;
      l += 0.2126 * big[q] + 0.7152 * big[q + 1] + 0.0722 * big[q + 2]; c++;
    }
    D[y * w + x] = Math.max(0, -Math.log(Math.max(0.02, Math.min(1, l / c / pl2))));
  }
  return D;
};
// Each recorded pass is marked against the plan at once, so no full fields are kept per pass.
// The last pass's painted density is the exception: `covered`, below, reads it cell by cell.
const marks = [];
let lastPainted = null;
// --asyncframes 0: render frames and marks on the painter's thread, not the frame worker (src/media/gpu/framer.mjs). Default 1.
let FRAMER = null, FRAMER_HANDED = false, MARK_PENDING = new Map();
const framer = () => {
  if (NATIVE_PAINT_MODE.mode==='fast' || FRAMER === false || !sheet._gpu || INKRES || LOOK || GOUACHE || opt('asyncframes', '1') === '0') return null;
  if (!FRAMER) {
    if (FRAMER_HANDED) return null; // started once and stopped (a dried layer was rewritten): the painter's render from here on
    FRAMER = createFramer({ sheet, pigments: SHEET_PIGS, base, paperRGB, n: N2, w, h, W2, SC, out, quality: 88, outW: OUT_W, outH: OUT_H, wet: WETRENDER ? { cap: num('wetcap', 0.6), dark: num('wetdark', 0.14) } : null });
    FRAMER_HANDED = true;
  }
  return FRAMER.active ? FRAMER : null;
};
// every frame and mark handed to the frame worker done, and the marks put in their places
const drainFrames = async () => {
  if (!FRAMER) return;
  const res = await FRAMER.drain();
  for (const r of res) { const slot = MARK_PENDING.get(r.id); if (!slot) continue; Object.assign(slot.mark, { pass: r.pass, ...r.numbers }); if (slot.last) lastPainted = r.paintedD; }
  MARK_PENDING.clear();
};
const mark = pass => {
  const F = framer();
  if (F) {
    const id = F.capture(), m = { pass };
    for (const v of MARK_PENDING.values()) v.last = false;
    marks.push(m); MARK_PENDING.set(id, { mark: m, last: true }); lastPainted = null;
    F.mark(id, pass, planDensity());
    return;
  }
  for (const v of MARK_PENDING.values()) v.last = false;
  const planD = planDensity(), paintedD = sheetDensity(render());
  marks.push({ pass, ...execution(planD, paintedD, w, h, gaussian) });
  lastPainted = paintedD;
};

// What each technique actually delivers, measured on scrap before anything goes on the sheet; charges scale by it.
// --waterscale: scales each technique's wash water (dry brush excepted), capped at a full load. Calibration uses the same load.
// --meteredbrush 1: finite physical load, release depth independent of load. Needs --physical 1; cannot combine with --washsplat.
// --brushload k: scales carried ml and reload distance, never deposited depth. One model water-depth unit is taken as 1 mm.
const METERED_BRUSH = num('meteredbrush', 0) > 0;
const BRUSH_LOAD = num('brushload', 1);
if (METERED_BRUSH && (!PB || !(BRUSH_LOAD > 0) || !Number.isFinite(BRUSH_LOAD)))
  throw new Error('--meteredbrush requires --physical 1 and a finite positive --brushload');
if (METERED_BRUSH && num('washsplat', 0) > 0)
  throw new Error('--meteredbrush uses bristles; omit --washsplat');
const meteredOpts = (r, T) => {
  if (!METERED_BRUSH || T.name.startsWith('dry brush')) return {};
  const name = PB.pick(r), tech = T.name.replace(/ graded$/, '');
  const uptake = PB.cfg.uptake_ml_per_cm2[tech] ?? PB.cfg.uptake_ml_per_cm2['wet on dry'];
  return { loadWater: PB.cfg.brushes[name].water_ml * BRUSH_LOAD * 1000 / PB.mmPerCell ** 2,
    depositDepth: uptake * 10 };
};
const WET = T => (T.water >= 0.3 ? Math.min(1, T.water * num('waterscale', 1)) : T.water);
// --drymix k: scales how much a wet-on-dry or glazed brush trades paint with wet paint under it (wetMix). Default 1.
const MIX = T => (T.intoWet ? T.wetMix : T.wetMix * num('drymix', 1));
// What a graded wash lays over the whole scrap and the share that ran past the swatch's edge. Each graded passage
// is charged for the whole scrap's delivery less that loss, scaled by its own open edge against the swatch's.
const GRADED_CAL = {};
// --loadedcontact 1: a loaded wash or detail brush touches all the paper under it, pits included; dry brush keeps its tooth-skip. Default 0.
const LOADED_CONTACT = num('loadedcontact', 0) > 0;
const washBridge = (T, b) => (LOADED_CONTACT && !T.name.startsWith('dry brush') ? 0 : b);
const CAL = await (async () => {
  const SW = 90, SH = 90, SN = SW * SH, want = 0.3;
  const mask = new Uint8Array(SN);
  for (let y = 20; y < 70; y++) for (let x = 20; x < 70; x++) mask[y * SW + x] = 1;
  const flat = new Float32Array(SN); for (let i = 0; i < SN; i++) if (mask[i]) flat[i] = 0.3;
  const out = {};
  // A graded wash is recharged every few cells along its sweep (--gradedwash), so each technique is also laid on scrap
  // recharged that way, and what it lays is kept both inside the swatch and over the whole scrap (see GRADED_CAL).
  const CHUNK = opt('gradedwash', '1') !== '0' ? Math.max(2, Math.round(GCHUNK)) : 0;
  for (const T of [
    { name: 'wet on dry', water: 0.62, wetMix: 0.55, bridge: 0.78, bridgeSoft: 2.2, intoWet: false, passes: 1 },
    { name: 'wet on wet', water: 0.88, wetMix: 0.85, bridge: 0.98, bridgeSoft: 3, intoWet: true, passes: 1 },
    // --glazepasses n: brush a glaze n times in a row while its first pass is still wet. Default 2.
    numericalGlazePasses({ name: 'glazed', water: 0.58, wetMix: 0.3, bridge: 0.82, bridgeSoft: 2.4, intoWet: false, passes: 2 }, num('glazepasses', 2)),
    { name: 'dry brush', water: 0.22, wetMix: 0, bridge: 0.38, bridgeSoft: 1.0, intoWet: false, passes: 1 },
  ].flatMap(T => (CHUNK ? [T, { ...T, name: `${T.name} graded`, chunk: CHUNK }] : [T]))) {
    const scrapPaper = makePaper(SW, SH, { seed: 5, scale: 1, toothScale: num('toothscale', 0.2), proudBlur: num('proudblur', 1) });
    const scrap = createSheet(scrapPaper, [PIGS[0]]);
    // --calpipe 1: calibrate with the sheet's own lanes, containment and pressure, not a plain sweep at default pressure.
    let paths = washPaths(mask, SW, SH, { pad: 1.5, minRadius: 1, minLength: 3 });
    if (opt('calpipe', '0') !== '0') {
      // the sheet's own brush, capped so a fifty-cell swatch is still laid in lanes as a passage that size would be
      const lanes = brushedWashPaths(mask, SW, SH, { pad: 1.5, minRadius: 1, minLength: 3, maxRadius: Math.min(BRUSH, 16), seed: 17, overlap: num('overlap', 0.15) });
      paths = containPaths(lanes, distanceToZero(mask, SW, SH), SW, SH, { minRadius: 0.8, minLength: 2, slack: num('slack', 0.5) }).map(pts => {
        const total = pts.reduce((a, q, i) => a + (i ? Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y) : 0), 0) || 1;
        let run = 0;
        return pts.map((q, i) => { if (i) run += Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y); const u = run / total;
          return { ...q, p: Math.max(0.18, Math.min(1, (0.72 + 0.28 * Math.sin(Math.PI * u)) * Math.min(Math.min(1, u / num('land', 0.06)), Math.min(1, (1 - u) / num('lift', 0.10))))) }; });
      });
    }
    for (const pts of paths) {
      const r = Math.max(1, ...pts.map(p => p.r));
      if (T.intoWet) { const wetB = createBrush({ flat: true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, seed: 5 }); dip(wetB, { water: 1, conc: [0] }); stroke(wetB, scrap, pts, { upright: UPRIGHT }); }
      const b = createBrush({ flat: true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: num('washfree', 0.4), film: 0.25, splay: 0.03, stiffness: 8, wetMix: MIX(T), bridge: washBridge(T, T.bridge), bridgeSoft: T.bridgeSoft, seed: 11, ...meteredOpts(r, T) });
      // and charged for its footprint exactly as a passage on the sheet is, so that shortfall is not counted twice
      const under = opt('calpipe', '0') !== '0' && opt('undercover', '1') !== '0' ? 1 / Math.max(num('underfloor', 0.4), Math.min(1, sweepCover(paths, mask, SW, SH))) : 1;
      dip(b, { water: WET(T), conc: [want * num('strength', 2.2) * under] });
      if (T.chunk) {
        // the water moves on the same clock as an unbroken sweep: counted across the chunks, not restarted in each
        let st = 0;
        for (let q = 0; q < T.passes; q++) for (let k = 0; k < pts.length; k += T.chunk) { dip(b, { water: WET(T), conc: [want * num('strength', 2.2) * under] }); stroke(b, scrap, pts.slice(Math.max(0, k - 1), k + T.chunk + 1), { upright: UPRIGHT, between: () => { if (++st % 24 === 0) step(scrap, O); } }); }
      } else
      for (let q = 0; q < T.passes; q++) stroke(b, scrap, pts, { upright: UPRIGHT, between: st => { if (st % 24 === 0) step(scrap, O); } });
    }
    for (let q = 0; q < 60; q++) step(scrap, O);
    dry(scrap, 20000, O, { levelMax: 400, dt: 4 });
    const th = thickness(scrap)[0];
    let got = 0, all = 0, c = 0; for (let i = 0; i < SN; i++) { all += th[i]; if (mask[i]) { got += th[i]; c++; } }
    const delivered = c ? got / c / want : 1;
    out[T.name] = delivered > 0.02 ? 1 / delivered : 1;
    if (T.chunk) GRADED_CAL[T.name] = { all: c ? all / c / want : 1, escape: all > 1e-9 ? 1 - got / all : 0, edge: openEdgeShare(mask, SW, SH) };
    console.log(`  ${T.name.padEnd(11)} delivers ${delivered.toFixed(2)} of its charge, so it is charged ${out[T.name].toFixed(2)}x${T.chunk ? `; ${(100 * GRADED_CAL[T.name].escape).toFixed(0)}% of what it lays runs past the swatch` : ''}`);
  }
  return out;
})();

const CALIBRATION_PLAN=AREA_PLAN??FINISH_PLAN;
const SEMANTIC_CAL_MODE=opt('semanticcalibration','legacy');
if(!['legacy','actual'].includes(SEMANTIC_CAL_MODE)||SEMANTIC_CAL_MODE==='actual'&&(!CALIBRATION_PLAN||!PB))throw Error('--semanticcalibration actual requires authoritative area plan');
const SEMANTIC_REFERENCE_LENGTHS=semanticReferenceLengths(opt('semanticcalibrationlengths',null));
const SEMANTIC_CAL={};
if(SEMANTIC_CAL_MODE==='actual'){
 const {selectedStages,selectedPasses}=semanticCalibrationSelection(CALIBRATION_PLAN.doc,opt('semanticcalibrationstages',null));
 const cache=new Map(),cacheRecords=[];let sampleNumber=0;
 const instrumentCode=instrumentCodeHash(root);
 for(const {area,pass} of selectedPasses){
  const T=semanticTechnique({area,pass},{}),r=pass.brush.widthMm/(2*PB.mmPerCell),profile={radius:r,bristles:Math.max(12,Math.ceil(r*2)),capacity:100,belly:12,feed:.4,give:.9,free:num('washfree',.4),film:.25,splay:.03,stiffness:8,wetMix:MIX(T),bridge:washBridge(T,T.bridge),bridgeSoft:T.bridgeSoft,seed:31+Math.round(num('seed',0))*7919,...meteredOpts(r,T)};
  const binding=JSON.stringify({move:pass.move,brush:pass.brush,load:pass.load,wetness:pass.wetness,preparation:pass.preparation,authoredPaint:pass.paint,profile,paper:PAPER_OPTS,physics:O});
  if(!cache.has(binding)){
   const saved=await cachedSemanticInstrument({cache:RUN_CACHE,code:instrumentCode,track:optTrack,inputs:{binding,mmPerCell:PB.mmPerCell,referenceLengthsMm:SEMANTIC_REFERENCE_LENGTHS,pigments:PIGS,strength:num('strength',2.2),GPU_MODE,paperRGB,shade:SHADE,washSplat:WASH_SPLAT_SETTINGS},proofPath:path.join(out,'semantic-instrument-calibration.json'),pass,bypass:num('semanticcalibrationonly',0)>0,onRecord:record=>{cacheRecords.push({areaId:area.id,passId:area.id+'/'+pass.id,...record});console.log('semantic instrument cache: '+record.status+' '+area.id+'/'+pass.id+'; origin '+record.origin.proofPath);}},async images=>calibrateSemanticInstrument(pass,{mmPerCell:PB.mmPerCell,paperOptions:PAPER_OPTS,pigments:PIGS,physics:O,profile,strength:num('strength',2.2),referenceLengthsMm:SEMANTIC_REFERENCE_LENGTHS,attachBackend:sh=>attachGpu(sh,O,{mode:GPU_MODE}),onSample:async({sheet:sh,record,phase})=>{
   const b=new Uint8Array(sh.n*3);for(let i=0;i<sh.n;i++)for(let k=0;k<3;k++)b[i*3+k]=paperRGB[k]*(1-SHADE+SHADE*sh.paper.height[i]);
   const rgb=renderLayers(layersOf(sh),PIGS,b,sh.n,1);const proofImage=path.join(out,'semantic-calibration-'+sampleNumber+'-'+phase+'.png');images.push({path:proofImage,phase,lengthMm:record.lengthMm});await sharp(rgb,{raw:{width:sh.w,height:sh.h,channels:3}}).png().toFile(proofImage);if(phase==='dried')sampleNumber++;
  }}));
   cache.set(binding,saved.calibration);
  }
  SEMANTIC_CAL[area.id+'/'+pass.id]=cache.get(binding);
 }
 fs.writeFileSync(path.join(out,'semantic-instrument-calibration.json'),JSON.stringify({mode:SEMANTIC_CAL_MODE,selectedStages,cacheRecords,referenceLengthsMm:SEMANTIC_REFERENCE_LENGTHS,referenceLengthScope:opt('semanticcalibrationlengths',null)!==null?'Explicit BEFORE-authored physical reference regimes; straight reference samples do not claim curved scene delivery.':'Lengths derive from prior firstwash contacts; a selected later instrument is calibrated at those regimes, not claimed to match its eventual curved distribution.',referenceLengthSource:opt('semanticcalibrationlengths',null)!==null?'explicit --semanticcalibrationlengths authored input':'actual v3 scene contacts min .25mm, median3.5mm, max55.216613mm; coverage126/126',paperOptions:PAPER_OPTS,physics:O,profiles:SEMANTIC_CAL},null,2));
 if(num('semanticcalibrationonly',0)){
  const normalized=[];
  for(const reference of new Set(Object.values(SEMANTIC_CAL)))for(const sample of reference.samples){
   const p=reference.pass,r=p.brush.widthMm/(2*PB.mmPerCell),T=semanticTechnique({pass:p},{}),profile={radius:r,bristles:Math.max(12,Math.ceil(r*2)),capacity:100,belly:12,feed:.4,give:.9,free:num('washfree',.4),film:.25,splay:.03,stiffness:8,wetMix:MIX(T),bridge:washBridge(T,T.bridge),bridgeSoft:T.bridgeSoft,seed:31+Math.round(num('seed',0))*7919,...meteredOpts(r,T)};
   normalized.push(await calibrateSemanticInstrument(p,{mmPerCell:PB.mmPerCell,paperOptions:PAPER_OPTS,pigments:PIGS,physics:O,profile,strength:num('strength',2.2)*sample.gain,referenceLengthsMm:[sample.lengthMm],referenceGrid:sample.referenceGrid,attachBackend:sh=>attachGpu(sh,O,{mode:GPU_MODE}),onSample:async({sheet:sh,record,phase})=>{
    const b=new Uint8Array(sh.n*3);for(let i=0;i<sh.n;i++)for(let k=0;k<3;k++)b[i*3+k]=paperRGB[k]*(1-SHADE+SHADE*sh.paper.height[i]);
    await sharp(renderLayers(layersOf(sh),PIGS,b,sh.n,1),{raw:{width:sh.w,height:sh.h,channels:3}}).png().toFile(path.join(out,'semantic-calibration-normalized-'+normalized.length+'-'+phase+'.png'));
   }}));
  }
  fs.writeFileSync(path.join(out,'semantic-normalized-reference-controls.json'),JSON.stringify({kind:'actual fresh physical normalized reference controls; no scene/artistic acceptance',normalized},null,2));sheet._gpu?.close();console.log('actual instrument reference controls only; scene painting NOT RUN');process.exit(0);
 }
}

let frame = 0;
// Every frame is recorded with the stage it shows: which pass of how many, which value, and what is under way.
const FRAMES = [];
let STAGE = { stage: 'paper', pass: 0, value: 0 };
// Frames taken inside the sheet's synchronous physics (while a passage is laid or dries) are rendered at once and
// written at the next shoot, in order.
const SNAPS = [];
const snap = extra => { if(!FRAME_POLICY.all || NATIVE_PAINT_MODE.mode==='fast')return; const F = framer(); SNAPS.push(F ? { id: F.capture(), stage: { ...STAGE, ...extra } } : { buf: INKRES ? INKRES.compose(view()) : view(), stage: { ...STAGE, ...extra } }); };

// --marks 1: record the mark tape: every stroke as a brush index and a path, with the water schedule between them.
if (!['warn', 'reject', 'off'].includes(opt('strokegate', 'warn'))) throw new Error('strokegate must be warn, reject or off');
if (opt('strokegate', 'warn') === 'reject' && opt('marks', '0') === '0') throw new Error('--strokegate reject requires --marks 1');
const MARKTAPE = opt('marks', '0') !== '0' || STROKE_BUDGET ? recordMarks(true) : null;
if (MARKTAPE) tapeSheet(MARKTAPE);
else if (opt('strokegate', 'warn') === 'warn') console.warn('stroke gate warning: stroke sizes unverified; use --marks 1 to measure this run');
// --pausedir DIR: the painter offers a stop at every passage boundary and a harness decides where it stops
// (tools/aware/pause.mjs). --resumestate DIR: a fresh process takes over a painting saved at a boundary (state.json
// there), with the plan files as they now stand: the planning runs again, nothing before the boundary is painted
// again, and the sheet, the ledger, the recording and the counters come back as they were. Until they are loaded
// (RESUMING) no frame is taken.
const AWARE_DIR = opt('pausedir', ''), RESUME_DIR = opt('resumestate', '');
let RESUMING = Boolean(RESUME_DIR);
const RESUME_AT = RESUME_DIR ? JSON.parse(fs.readFileSync(path.join(RESUME_DIR, 'boundary.json'), 'utf8')) : null;

// Playback ships the marks, not the pictures.
let LAST_FRAME_STAGE=null;
const shoot = async () => {
  if (RESUMING) return; // a fresh process taking over a saved painting: its frames are already on disk
  if (!FRAME_POLICY.keep(STAGE)) return;
  // Fast films only completed paint boundaries, every fourth pass; all other stages survive.
  if(FRAME_POLICY.all && NATIVE_PAINT_MODE.mode==='fast' && STAGE.stage==='paint' && (STAGE.laying || ((STAGE.pass??0)>1 && STAGE.pass%4!==0)))return;
  const stageKey=JSON.stringify(STAGE);
  if(NATIVE_PAINT_MODE.mode==='fast' && LAST_FRAME_STAGE===stageKey)return;
  LAST_FRAME_STAGE=stageKey;
  // a marker in the tape at every frame, so a replay can render at exactly the points the painter did
  if (MARKTAPE) MARKTAPE.push({ k: 'm', i: frame });
  for (const s of SNAPS.splice(0)) {
    const name = `f${String(frame).padStart(4, '0')}.jpg`;
    if (s.id !== undefined) FRAMER.name(s.id, name);
    else await sharp(s.buf, { raw: { width: OUT_W, height: OUT_H, channels: 3 } }).jpeg({ quality: 88 }).toFile(path.join(out, name));
    FRAMES.push({ src: name, ...s.stage });
    frame++;
  }
  const name = `f${String(frame).padStart(4, '0')}.jpg`;
  const F = framer();
  if (F) F.name(F.capture(), name);
  else {
    const cur = INKRES ? INKRES.compose(view()) : view();
    await sharp(cur, { raw: { width: OUT_W, height: OUT_H, channels: 3 } }).jpeg({ quality: 88 }).toFile(path.join(out, name));
  }
  FRAMES.push({ src: name, ...STAGE });
  frame++;
};
// --wetframes N: film every Nth pass while wet, after each quarter of its passages and at widening drying steps. Default 0.
const WETFRAMES = Math.round(num('wetframes', 0));
// --passframes N: a frame every Nth passage inside a pass. Default 0; stroke playback comes from the mark tape (--marks).
const PASSFRAMES = Math.round(num('passframes', 0));
const WET_STEPS = new Set([10, 40, 120, 300, 800, 2000]);
// --filmby paint|pass: paint (default) gives the washes --frames frames at equal shares of planned mass laid; pass films by pass count.
const FILM_BY_PAINT = opt('filmby', 'paint') === 'paint';
const PEN_FRAMES = 4;
let filmLaid = 0, filmNext = 1;
await shoot();

phaseMark('sheet');
// Wrap the target and its per-cell maps (--targetguard): planning may read them until TARGET_GUARD.beginPaint()
// closes them before the first mark. The look gets shape-level means only.
TARGET_GUARD.provide('px', PX_RAW, { stride: 3 }); TARGET_GUARD.provide('A', A, { stride: PIGS.length }); if (AL !== A) TARGET_GUARD.provide('AL', AL, { stride: PIGS.length });
const LOOK_AL = AL !== A ? 'AL' : 'A', LOOK_PLAN = COLOUR_BUDGET ? LOOK_AL : 'A';
if (TARGET_GUARD.mode !== 'off') {
  TARGET_GUARD.register('A', A); px = TARGET_GUARD.seal('px', px); D_SOURCE = TARGET_GUARD.seal('D_SOURCE', D_SOURCE); A = TARGET_GUARD.seal('A', A); AL = TARGET_GUARD.seal('AL', AL); SRC = TARGET_GUARD.seal('SRC', SRC);
  // the value plan's per-cell amounts (sh.graded): one amount per shape while painting, so they are closed too
  const sealedG = new Map();
  for (const L2 of layers) for (const sh of L2.shapes) if (sh.graded && typeof sh.graded === 'object') { if (!sealedG.has(sh.graded)) sealedG.set(sh.graded, TARGET_GUARD.seal('G', sh.graded)); sh.graded = sealedG.get(sh.graded); }
}
// What the washes cannot carry is drawn with a pen: take the planned washes out of the picture and what is left is ink.
// The pen's layer is the thickness each pigment gained while drawing, not a separate buffer.
let drawnCount = 0;
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
// --segink: the subject is every foreground segment, and the lines between ground segments are tier-1 lines
// (src/paint/methods/seg-ink.mjs)
const SEG_LINES = [];
// --ladderseg: the foreground segments, for the ladder (src/paint/methods/ladder-seg.mjs)
let SEG_FG = null;
const TIER_MASK = await (async () => {
  if (!INKTIERS) return null;
  if (SUBJECT) { console.log('ink tiers: the subject comes from --mask'); return SUBJECT; }
  const image = opt('image', '');
  const base = image ? path.basename(image, path.extname(image)) : '';
  const segInk = await segmentInk({ base, w, h, n, opt, num, log: console.log });
  if (segInk) { SEG_FG = segInk.fg; SEG_LINES.push(...segInk.lines); return segInk.mask; }
  const file = base ? path.resolve(root, `work/masks/${base}.png`) : '';
  if (!file || !fs.existsSync(file)) { console.log(`ink tiers: no subject mask for ${base || 'this source'}; tier 1 is edges only and tier 2 is the whole sheet`); return null; }
  const { data } = await sharp(file).resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const soft = Math.max(1, Math.round(num('masksoft', 0.01) * Math.min(w, h)));
  const m = gaussian(Float32Array.from({ length: n }, (_, i) => data[i] / 255), w, h, soft);
  let subj = 0; for (let i = 0; i < n; i++) if (m[i] > 0.5) subj++;
  console.log(`ink tiers: subject from work/masks/${base}.png, ${(100 * subj / n).toFixed(1)}% of the sheet, for ranking only`);
  return m;
})();
// --mllines, --mllinesfile, --mlwant: tier 2 and 3 candidates from a learned line map instead of the ridge walker
// (src/paint/methods/ml-lines.mjs)
const ML_LINES = mlLines({ w, h, opt, num, log: console.log });
const writeInkTiers = async (D) => {
  const rgb = inkTierOverlay(D, w, h, INK_TIER_LOG, { width: num('inktierswidth', 2) });
  await sharp(Buffer.from(rgb.buffer, rgb.byteOffset, rgb.length), { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(out, 'ink-tiers.png'));
};
// --inkofftrees 1: keep the pen off the tree region (src/paint/techniques/passages/treelayers.mjs) widened by two cells. Default 0.
let INK_TREES = null;
const inkTreeMask = async () => {
  if (INK_TREES) return INK_TREES;
  const { treeRegion } = await import('../src/paint/techniques/passages/treelayers.mjs');
  const { hasSegments, loadSegments } = await import('../src/crop/segments.mjs');
  const image = opt('image', ''), base = image ? path.basename(image, path.extname(image)) : '';
  const seg = base && hasSegments(base) ? await loadSegments(base, w, h) : null;
  const T = treeRegion({ w, h, px, fig: FW_SUBJ || SUBJECT, seg, mmCell: num('sheetmm', DEFAULT_SHEET_MM) / w });
  INK_TREES = dilate(T.region, w, h, 2);
  let c = 0; for (const v of INK_TREES) c += v;
  console.log(`ink off trees: ${(100 * c / n).toFixed(1)}% of the sheet is background trees`);
  return INK_TREES;
};
// The pen's drawing is planned whole before the first mark: where every line goes and how
// hard, from the reference and the plan, never from the sheet. drawPass, after TARGET_GUARD.beginPaint(), only draws it.
async function planPen(planD0, opts = {}) {
  const prev = [VALUE_ACTIVE, AREA_DRAW_STAGE];
  try { return await planPenInner(planD0, opts); } finally { [VALUE_ACTIVE, AREA_DRAW_STAGE] = prev; }
}
async function planPenInner(planD0, { first = false, fine = false } = {}) {
  VALUE_ACTIVE=null;
  AREA_DRAW_STAGE=first?'opening':'closing';
  const preparing = first && PREP;
  const DRAW_SOURCE = first && DRAW_GUIDE ? DRAW_GUIDE : SRC;
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
  const PEN = { nib: 0.8 * K * (STYLE_ON() ? VALUE_PLAN.style.ink : num('penfacenib', 1)), flex: 1.5 * K, travel: 1.5 * K, reach: 12 * K, reservoir: 250 * K * K, feed: 1.2 * K };
  // --penblur: scale of the ridge field the pen reads (default 1); coarser gives one line to follow, not a braid.
  const PENBLUR = num('penblur', 1);
  const field = lineField(DRAW_SOURCE, inkWant, w, h, { sigmas: [0.8, 1.2, 1.8].map(v => v * K * PENBLUR) });
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
    ? planGestures(field, w, h, { seed: 31 + SEED, floor: floor * num('finefloor', 0.45), keep: num('finekeep', 260),
        claimRadius: Math.max(1, num('fineclaim', 1.2) * K), reachShare: num('finereach', 0.05),
        turn: num('fineturn', 0.92), carry: num('finecarry', 14) * K, scales: [num('finescale', 0.6), 0], tries: 4000 }).gestures
    : planGestures(field, w, h, { seed: 7 + SEED, floor, keep: num('keep', 400), claimRadius: 3 * K, reachShare: num('penreach', 0.12), turn: num('turn', 0.8), carry: num('carry', 8) * K, scales: [1.5, 0], tries: 3000 }).gestures);
  // --pensimplify c: reduce each pen path to the points it needs within c cells, then resample evenly. Default 0, off.
  const SIMPLIFY = num('pensimplify', 0) * K;
  const simplifyAll = gs => (SIMPLIFY > 0 ? gs.map(g => ({ ...g, points: drawAs(g.points, { tolerance: SIMPLIFY, step: Math.max(1, 2 * K) }) })).filter(g => g.points.length >= 2) : gs);
  const gestures = simplifyAll(clock('paths', () => (opt('penfrom', 'walk') === 'chains' ? chainPen() : walkPen())));
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
  const passShare = PEN_FIRST && DRAW_LAST && !fine && num('closingshare', 0) > 0 ? (first ? 1 - num('closingshare', 0) : num('closingshare', 0)) : 1;
  const CELLS = share * n * num('inkbudget', 6) * passShare, NIB = 1.5 * K;
  const cellsOf = gs => gs.reduce((a, g) => a + (g.length ?? pathLength(g.points)) * NIB, 0);
  const TIERED = INKTIERS && num('inkbudget', preparing ? 0 : 6) > 0;
  const FAINT_CELLS = CELLS * num('tier3faint', 0.1);
  // --inktiers: the same CELLS, reserved before the greedy walk may use them.
  const tiered = TIERED ? (() => {
    const t1Cells = CELLS * num('tier1', 0.3), t2Cells = CELLS * num('tier2', 0.3);
    const stride = Math.max(1, Math.round(2 * K));
    // Tier 1a: the subject's own boundary; traceOutlines returns ordered, smoothed, longest-first chains.
    const maskC = (TIER_MASK
      ? traceOutlines(Uint8Array.from(TIER_MASK, v => (v >= num('pendrawat', 0.5) ? 1 : 0)), w, h, { minLength: Math.round(num('silmin', 12) * K), step: stride })
      : []).map(g => ({ points: g.points, length: pathLength(g.points), tier: 1 }));
    // Tier 1b: long near-straight runs through the ground, away from gated pen line (a horizon), let past --inkgate here only.
    const gated = dilate(SEP.ink, w, h, Math.round(num('inkgate', 7) * K));
    const longMin = num('tier1long', 0.10) * Math.min(w, h);
    const stepC = [...SEG_LINES.filter(g => g.length >= longMin), ...edgeChains(DRAW_SOURCE, w, h, gaussian, { sigma: num('edgesigma', 1.5) * K, minLength: Math.round(num('edgemin', 20) * K), margin: num('silmargin', 0.04), step: stride, high: num('edgehigh', 0.85) })
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
    // --mllines: the model's lines stand in for the walker's in both of the tiers the walker is bad at, split by the
    // subject mask and ranked by strength times length (src/paint/methods/ml-lines.mjs)
    const ml = ML_LINES ? ML_LINES.candidates(TIER_MASK) : null;
    const featField = ml ? null : Float32Array.from(field, (v, i) => (TIER_MASK && TIER_MASK[i] < num('pendrawat', 0.5) ? 0 : v));
    const fnz = ml ? [] : Array.from(featField).filter(v => v > 0).sort((p, q) => p - q);
    const featWalk = fnz.length
      ? planGestures(featField, w, h, { seed: 17 + SEED, floor: fnz[Math.floor(fnz.length * num('featfloorq', 0.35))], keep: num('keep', 400),
          claimRadius: 2 * K, reachShare: num('featrun', 0.05), turn: 1, carry: num('outlinecarry', 6) * K, scales: [0], tries: 3000 }).gestures
      : [];
    const t2cand = ml
      ? ml.t2
      : [...gestures, ...featWalk]
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
    const t3cand = ml
      ? ml.t3
      : gestures.filter(g => !spentOn2.has(g)).map(g => ({ ...g, tier: 3 }));
    const t3 = lineBudget(t3cand, t3Cells, { width: NIB });
    console.log(`ink tier 1 outline:  ${t1.length}/${maskC.length + stepC.length} paths, ${Math.round(cellsOf(t1))} of ${Math.round(t1Cells)} cells (mask boundary ${a.length + c.length} of ${maskC.length}, step edges ${b.length} of ${stepC.length})`);
    console.log(`ink tier 2 features: ${t2.length}/${t2cand.length} paths, ${Math.round(cellsOf(t2))} of ${Math.round(t2Cells)} cells${ml ? ', from the model\'s line map, any length' : `, at ${featLen.toFixed(0)} cells or shorter`}`);
    console.log(`ink tier 3 rest:     ${t3.length}/${t3cand.length} paths, ${Math.round(cellsOf(t3))} of ${Math.round(t3Cells)} cells`);
    // Short marks cost few cells, so the tiers may not draw more marks than the plain budget would keep.
    // The excess comes off the tail of the greedy walk, the least structural part of the set.
    return { paths: [...t1, ...t2, ...t3], cap: lineBudget(gestures, CELLS, { width: NIB }).length, t1n: t1.length, t2n: t2.length, t3n: t3.length };
  })() : null;
  const budgeted = (tiered ? tiered.paths : (num('inkbudget', preparing ? 0 : 6) > 0 ? lineBudget(gestures, CELLS, { width: 1.5 * K }) : gestures)).slice();
  console.log(`line budget: source ink ${(100 * share).toFixed(1)}% of cells, ${budgeted.length} of ${gestures.length} gestures`);
  // --outline 0|1: a lighter second pass on fainter ridges away from what is drawn, within the line budget. Default 1.
  // --outlinemin p: run it only when the source shows at least p per cent of its cells as line. Default 0.
  if (opt('outline', '1') !== '0' && share >= num('outlinemin', 0) / 100) {
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
  const PEN_FIELD = SUBJECT ?? FINISH;
  const penKeep = PEN_FIELD ? (g => { let inside = 0; for (const q of g.points) { const x = Math.min(w - 1, Math.max(0, Math.round(q.x))), y = Math.min(h - 1, Math.max(0, Math.round(q.y))); if (PEN_FIELD[y * w + x] >= num('pendrawat', 0.5)) inside++; } return inside >= g.points.length * num('penkeep', 0.5); }) : null;
  // --drawingfile <base>: the first pen draws a selected drawing whole, in strokes of a person's length, and nothing
  // the walker found (src/paint/methods/drawing-file.mjs)
  // --darkmass: the pens are cut where they cross a dark mass, which is painted, not inked
  // --practice: the closing pen is cut to the focal darks (src/paint/methods/practice-paint.mjs)
  // --massbudget cuts the closing pen inside the masses; the opening drawing keeps them unless --masscutfirst 1
  const cutPen = MASS_BUDGET && (!first || num('masscutfirst', 0) > 0) ? MASS_BUDGET.cutPen : DARK_MASS ? DARK_MASS.cutPen : PRACTICE_CUT && !first && !fine ? PRACTICE_CUT : g => g;
  // --darkmasscurls walker: the first pass's walker gestures on a dark mass become its curly brush strokes
  if (DARK_MASS && first && !fine) DARK_MASS.takeGestures(drawn);
  const SELECTED = cutPen(selectedDrawing({ first, fine, w, h, opt, num, log: console.log, walked: drawn.length, D: DRAW_SOURCE, want: inkWant, cells: CELLS, K, walker: drawn, field, style: DRAW_STYLE }));
  let kept = SELECTED ? SELECTED : cutPen(penKeep ? drawn.filter(penKeep) : drawn);
  // --inkskin x0,y0,x1,y1 (sheet fractions): the closing pen keeps off warm skin interiors of the figure in the box. Default off.
  // --inkskinerode: interior erosion in cells (default 3); --inkskinshare: share of points inside that drops a gesture (default 0.6).
  if (!first && opt('inkskin', '') !== '') {
    const [bx0, by0, bx1, by1] = String(opt('inkskin', '0,0,1,1')).split(',').map(Number);
    const fig = FW_SUBJ || SUBJECT || TIER_MASK, S0 = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const x = i % w, y = (i / w) | 0;
      if (x < bx0 * w || x > bx1 * w || y < by0 * h || y > by1 * h) continue;
      if (fig && fig[i] <= 0.5) continue;
      const r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2], Y = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
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
  const TREES_OFF = num('inkofftrees', 0) > 0 ? await inkTreeMask() : null;
  // --inkoffsand 1: keep the pen off warm ground, found from the source and its sky and figure masks.
  const SAND_OFF = num('inkoffsand', 0) > 0 ? await (async () => {
    const { hasSegments, loadSegments } = await import('../src/crop/segments.mjs');
    const base = path.basename(opt('image', ''), path.extname(opt('image', '')));
    const seg = hasSegments(base) ? await loadSegments(base, w, h) : null;
    const sky = seg?.regions.find(r => r.name === 'sky')?.mask;
    const fig = FW_SUBJ || SUBJECT;
    const m = Uint8Array.from({ length: n }, (_, i) => {
      if ((fig && fig[i] > 0.5) || (sky && sky[i]) || (TREES_OFF && TREES_OFF[i])) return 0;
      const r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2];
      return i >= Math.floor(h * num('sandfrom', 0.45)) * w && r - b > 8 && r >= g - 5 ? 1 : 0;
    });
    const radius = Math.max(1, Math.round(2 / (num('sheetmm', DEFAULT_SHEET_MM) / w)));
    return closeLocal(m, w, h, radius);
  })() : null;
  const INKOFF = opt('inkoffbox', '') !== '' || num('inkofffoliage', 0) > 0 || TREES_OFF || SAND_OFF ? (() => {
    const box = opt('inkoffbox', '') !== '' ? String(opt('inkoffbox', '0,0,1,1')).split(',').map(Number) : null;
    const fig = FW_SUBJ || SUBJECT, share = num('inkoffshare', 0.5);
    const at = (x, y) => Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)));
    const fd = num('inkofffoliage', 0);
    const fol = fd > 0 ? (() => {
      const g0 = Float32Array.from({ length: n }, (_, i) => (px[i * 3 + 1] - px[i * 3] >= fd && px[i * 3 + 1] - px[i * 3 + 2] >= fd ? 1 : 0));
      const s = gaussian(g0, w, h, Math.max(1, num('inkofffoliager', 2) * K));
      const cut = num('inkofffoliagecut', 0.5);
      let c = 0; const F = Uint8Array.from(s, v => (v > cut ? (c++, 1) : 0));
      console.log(`ink off foliage: ${(100 * c / n).toFixed(1)}% of the sheet reads as foliage`);
      return F;
    })() : null;
    const inBox = (x, y) => !(fig && fig[at(x, y)] > 0.5) && ((SAND_OFF && SAND_OFF[at(x, y)] === 1) || (fol && fol[at(x, y)] === 1) || (TREES_OFF && TREES_OFF[at(x, y)] === 1) || (box && x >= box[0] * w && x <= box[2] * w && y >= box[1] * h && y <= box[3] * h));
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
  if (penKeep && kept.length !== drawn.length) console.log(`pen: ${kept.length} of ${drawn.length} gestures lie on ${SUBJECT ? 'the subject' : 'the part of the sheet that is carried'}`);
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
  if (VALUE_PLAN && !first && num('inkdarkskip', 0) > 0) { const before = kept.length; kept = cutInDarkWash(kept, VALUE_PLAN.value.values, w, h, num('inkdarkskip', 0)); console.log(`ink dark skip: ${before} ${first ? 'opening' : 'closing'} gestures cut to ${kept.length} runs outside planned value ${num('inkdarkskip', 0)}`); }
  // A prepared pencil drawing describes the same contours as pen, including paper-light borders.
  if(VALUE_PLAN)kept=selectValueInk(kept,{first,w,h,sourceInk:sourceInkDrawing()||(first&&graphiteFirst&&!!opt('drawingfile','')) ,density:VALUE_PLAN.value.values,reserves:VALUE_PLAN.protectedCells,shaped:VALUE_PLAN.instructions[0]?.shaped,subject:VALUE_CONFIG?.subject,styleSelection:VALUE_CONFIG?.styleSelection,trumbullRules:TRUMBULL_RULES,portraitRules:PORTRAIT_RULES});
  const passName = first ? 'first' : fine ? 'fine' : 'last';
  const inkVerdict = INKFILTER && !SELECTED ? classifyInkPaths(kept, DRAW_SOURCE, w, h, { scale: num('inkfilterscale', K), accent: num('inkfilteraccent', 10) * K }) : null;
  if (inkVerdict) {
    INK_FILTER_LOG.push(...inkVerdict.map((e, i) => ({ ...e, pass: passName, points: kept[i].points })));
    const c = inkFilterCounts(inkVerdict);
    console.log(`ink filter: kept ${c.kept} of ${c.total} (contour ${c.contour}, accent ${c.accent}; dropped wash ${c.wash}, dry ${c.dry}, texture ${c.texture})`);
    await writeInkFilter(DRAW_SOURCE);
  }
  // a selected drawing's points may carry their own pressure share and contact width (drawing-file.mjs), in plan cells
  let scaled = kept.map((g, i) => ({ weight:g.weight, strength:g.strength, ...(g.length==null?{}:{length:g.length*SC}), reviewedOrdinal:g.reviewedOrdinal,focalFeature:g.focalFeature,openingRole:g.openingRole,preparationRole:g.preparationRole, sourceOrdinal:g.sourceOrdinal, instruction:g.instruction, outline: g.outline, tier: g.tier, ...(g.rank == null ? {} : { rank: g.rank }), ml: !!g.ml, draw: !inkVerdict || inkVerdict[i].kept, points: g.points.map(q => (q.nw == null && q.s == null ? { x: q.x * SC, y: q.y * SC } : { x: q.x * SC, y: q.y * SC, ...(q.s == null ? {} : { s: q.s }), ...(q.nw == null ? {} : { nw: q.nw * SC }) })) }));
  scaled=prepareDrawing(scaled,{medium:graphiteFirst?opt('graphiteprofile',REQUESTED_DRAW_MEDIUM.startsWith('graphite-')?REQUESTED_DRAW_MEDIUM:'graphite-HB'):opt('inkprofile',REQUESTED_DRAW_MEDIUM.endsWith('-ink')?REQUESTED_DRAW_MEDIUM:STYLE_INK_DEFAULT),stage:first?'opening':'closing',subject:drawSubject(),mmPerCell:(PB?.mm??num('sheetmm', DEFAULT_SHEET_MM))/W2,edgeStrength:TARGET_DRAW_EDGE,w:W2,h:H2,caps:{...drawingCapsFor(first?'opening':'closing',graphiteFirst),share:SELECTED?1:num('drawshare',1)}});
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
    // --darkmass: the silhouette pass keeps off a dark mass too
    if (DARK_MASS) { const cut = cutPen(outlineCells); outlineCells.length = 0; outlineCells.push(...cut); }
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
// The plan's density before anything is laid: every passage booked at its full amount, the way the loop books one it
// lays whole. The pen-first order needs it to know what the washes will not carry.
const planDensityOfLayers = () => {
  const D = new Float32Array(n);
  for (const L2 of layers) for (const sh of L2.shapes) {
    const kk = sh.mix.reduce((s, v, j) => s + v * (PIGS[j].K[0] + PIGS[j].K[1] + PIGS[j].K[2]) / 3, 0);
    // a graded passage lays its own amount in each cell, at the same colour
    const m = sh.mask;
    for (let i = 0; i < n; i++) if (m[i]) D[i] += sh.graded ? kk * sh.graded[i] / Math.max(1e-6, sh.amount) : kk;
    dropMask(sh);   // one passage's field at a time, not the plan's worth of them
  }
  return D;
};
phaseMark('drawing');
const up = mask => { if (SC === 1) return mask; const m = new Uint8Array(N2); for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) m[y * W2 + x] = mask[((y / SC) | 0) * w + ((x / SC) | 0)]; return m; };
// --seed s: seeds every random choice of the process; paper and scrap calibration stay fixed, so seeds compare process only.
const SEED = Math.round(num('seed', 0)) * 7919;
const t0 = Date.now();
// where the time goes, so a slow run is diagnosed rather than guessed at
const spent = { paths: 0, strokes: 0, flow: 0, dry: 0, frames: 0 };
const clock = (key, fn) => { const a = Date.now(); const r = fn(); spent[key] += Date.now() - a; return r; };
// a finer profile inside the big clocks: printed as `profile:`, changes no output
const PROF = {}, prof = (key, fn) => { const a = performance.now(); const r = fn(); PROF[key] = (PROF[key] || 0) + performance.now() - a; return r; };
// How often the sheet is advanced while paint is laid: the interval grows with a passage's sweeps, so fluid work is per passage.
// --handangle: the direction a hand takes a passage that has none of its own. Diagonal on the whole, as a wrist sweeps,
// and different from passage to passage, seeded so a run repeats.
const handAngle = k => { let s = (k * 2654435761 + 97) >>> 0; s = (s ^ (s >>> 13)) * 1274126177 >>> 0; const r = ((s ^ (s >>> 16)) >>> 0) / 4294967296; return num('handmean', 0.35) + (r - 0.5) * num('handspread', 1.4); };
// --flowmul: scales the fluid step interval while lanes are laid; fewer steps let each lane meet a wet edge. Default 1.
const flowEvery = sweeps => Math.max(24, Math.round(24 * num('flowmul', 1) * Math.sqrt(Math.max(1, sweeps))));
let laid = 0, dropped = 0, droppedMass = 0, plannedMass = 0;
// --lightfill: under --smalllights the brush follows each passage with its reserved lights filled back (fillReserved),
// and goes over the masking fluid on them rather than round them
const brushMask = sh => (SMALL && opt('lightfill', '1') !== '0' ? (sh._brushMask ??= fillReserved(sh.mask, SMALL, w, h, { reach: LIGHT_CELLS })) : sh.mask);
for (const L2 of layers) for (const sh of L2.shapes) plannedMass += sh.amount * sh.area;
// each passage's booking as planned, before the finish field clips it, so the film's shares add up to the plan's mass
const FILM_MASS = new WeakMap(); for (const L2 of layers) for (const sh of L2.shapes) FILM_MASS.set(sh, sh.amount * sh.area);
// --firstwash: the opening wash paler, off the subject, held to its passage and softened (src/paint/methods/first-wash.mjs)
const FW = !VALUE_ENABLED && num('firstwash', 0) > 0;
const FW_SUBJ = FW ? await loadSubject({ file: opt('fwmask', '') ? path.resolve(root, opt('fwmask', '')) : '', w, h, sharp, log: console.log }) : null;
// --fwrepay 1: the ground's first wash is laid at --fwopen of its plan; lay the rest as a second light ground wash. Default 0.
const FW_REPAY = FW && !COLOUR_BUDGET && num('fwrepay', 0) > 0;
// the broad first wash (--firstfloor) is not split at the subject or deferred: it is the light tone the subject wants,
// laid whole at --firstopen of its plan (1: all of it, since nothing later comes back for a pale tone)
const isFirst = l => l.shapes.some(sh => sh.firstWash);
const FW_LAYERS = FIRST_FLOOR > 0 ? layers.filter(l => !isFirst(l)) : layers;
if (FIRST_FLOOR > 0) for (const l of layers) for (const sh of l.shapes) if (sh.firstWash) sh._opening = num('firstopen', 1);
const COLOUR_LATER = FW && (COLOUR_BUDGET || FW_REPAY) ? deferredFirstWash(FW_LAYERS,{subject:FW_SUBJ,n,open:num('fwopen',0.22),tint:FW_REPAY ? 1 : num('fwtint',0)}) : [];
if (FW) { const r = splitFirstWash(FW_LAYERS, { subject: FW_SUBJ, n, open: num('fwopen', 0.22), tint: num('fwtint', 0), film: FILM_MASS }); console.log(`first wash: ${r.split} value-1 passages split, ${(100 * r.ground / n).toFixed(1)}% of the sheet as ground at ${num('fwopen', 0.22)}, ${(100 * r.subj / n).toFixed(1)}% as subject at ${num('fwtint', 0)} (summed over the pans)`); }
if(COLOUR_LATER.length) {
  for(const l of layers) if(l.value===1) for(const sh of l.shapes) FILM_MASS.set(sh,(FILM_MASS.get(sh)??0)*(sh._opening??1));
  for(const later of COLOUR_LATER) {
    // After the first dilute value, before this pan's deeper glazes.
    let at=layers.findIndex(l=>l.pigment===later.pigment && l.value>=2);
    if(at<0) at=layers.length;
    for(const sh of later.shapes) FILM_MASS.set(sh,sh.amount*sh.area);
    layers.splice(at,0,later);
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
  // --subjtint <stage.png>: the subject's light values cut by the finish's colour regions and weighed so each region
  // lays its own pale local colour, measured on that stage (src/paint/techniques/subject-tint.mjs)
  const TINT = opt('subjtint', '');
  const tintR = TINT && subject ? await tintRegions({ finish: path.resolve(root, opt('subjtintfinish', opt('image', ''))), subject, w, h, sharp, k: Math.max(2, Math.round(num('subjtintk', 5))), blur: num('subjtintblur', 3), mode: Math.max(1, Math.round(num('subjtintmode', 3))), log: console.log }) : null;
  if (tintR) subjectLabels = tintR.label;
  // --subjlocal <stage.png>: the subject's first wash in each colour region's local hue at the stage's lightness, wet on
  // wet, before the subject's other light pieces (src/paint/techniques/subject-local.mjs)
  const LOCAL = !TINT && opt('subjlocal', '') && subject ? await tintRegions({ finish: path.resolve(root, opt('image', '')), subject, w, h, sharp, k: Math.max(2, Math.round(num('subjlocalk', 4))), blur: num('subjtintblur', 3), mode: Math.max(1, Math.round(num('subjtintmode', 3))), log: console.log }) : null;
  if (LOCAL) subjectLabels = LOCAL.label;
  const r = painterOrder(layers, { darkFirst: num('darkfirst', 0) > 0, subject, w, n, steps, light: num('orderlight', 0.25), dark: num('orderdark', 0.6), regions: Math.max(1, Math.round(num('orderregions', 4))), minPart: num('orderminpart', 0.08), minRegion: num('orderminregion', 0.1), film: FILM_MASS, subjectLabels, far: num('orderfar', 0) > 0 });
  layers = r.layers;
  if (tintR) layers = (await tintSubject(layers, { regions: tintR, stage: path.resolve(root, TINT), PIGS, w, h, sharp, gain: num('subjtintgain', 1), max: num('subjtintmax', 1), opening: num('opening', 0.55), defer: num('subjtintdefer', 1) > 0, film: FILM_MASS, log: console.log })).layers;
  if (LOCAL) {
    const st = (await sharp(path.resolve(root, opt('subjlocal', ''))).removeAlpha().resize(w, h, { fit: 'fill' }).blur(1.5).raw().toBuffer({ resolveWithObject: true })).data;
    const r2 = localSubjectWash(layers, { regions: LOCAL, st, PIGS, w, h, gain: num('subjlocalgain', 1), film: FILM_MASS });
    layers = r2.layers;
    console.log(`subject local: ${r2.summary.map(q => `region ${q.region} (${q.cells} cells) density ${q.want.map(v => v.toFixed(2)).join('/')} mix ${q.mix ? q.mix.map(v => v.toFixed(3)).join('/') : 'none'}`).join('; ')}`);
  }
  console.log(`order painter: ${layers.length} passes; ${r.summary.map(s => `${s.phase} ${s.layers} passes, ${s.passages} passages, ${(100 * s.area).toFixed(1)}% of the sheet`).join('; ')}`);
  // --bgfirst 1: every background pass goes on before the first pass on the figure, each side in painter order. Default 0.
  if (num('bgfirst', 0) > 0) {
    const bg = layers.filter(L => L._order?.side === 'ground'), fg = layers.filter(L => L._order?.side !== 'ground');
    layers = [...bg, ...fg];
    console.log(`background first: ${bg.length} background passes before ${fg.length} on the figure`);
  }
}
const FILM_FRAMES = Math.max(1, Math.round(num('frames', 40)));
let filmPass = 0;
// under --smalllights the fluid goes on the small lights too, whether or not the big lights were worth masking
// (--lightresist 0, a probe: the plan and the brush leave the lights out, and nothing seals them)
const FLUID = SMALL && opt('lightresist', '1') !== '0' ? SMALL : null;
// --resistmin s: masking fluid only on lights of at least s of the sheet's cells; a masked speck dries as a rimmed hole. Default 0.
const bigLights = (mask, min) => (min > 0 ? removeSmall(mask, w, h, Math.round(min * n)) : mask);
const RESIST0 = FLUID ? Uint8Array.from(FLUID, (v, i) => (v || (masked > n * 0.01 && highlights[i]) ? 1 : 0)) : masked > n * 0.01 ? bigLights(highlights, num('resistmin', 0)) : null;
// --locallights: the lightest share of each segment masked too (src/paint/methods/local-lights.mjs)
const LOCAL_LIGHTS = breakLights(await localLights({ A, K: PIGS.length, w, h, n, image: opt('image', ''), opt, num, log: console.log, path }), { w, h, paper, SC, gaussian, num, log: console.log });
const RESIST_BASE = await shapeFlecks(LOCAL_LIGHTS ? Uint8Array.from({ length: n }, (_, i) => ((RESIST0 && RESIST0[i]) || LOCAL_LIGHTS[i] ? 1 : 0)) : RESIST0, { w, h, n, SRC, paper, SC, gaussian, image: opt('image', ''), path, num, opt, log: console.log, seed: SEED });
// --softmask: the fluid thin at each light's rim, so it lifts to a soft broken edge (src/paint/methods/soft-mask.mjs)
const RESIST_SOFT_BASE = softMask(RESIST_BASE, { w, h, n, paper, SC, gaussian, num });
if(AREA_PLAN&&MOD&&validateProductionDetails(AREA_PLAN.doc))MOD.lights=Uint8Array.from(AREA_PLAN.reserves,(v,i)=>v||AREA_PLAN.film[i]?1:0);
if(MOD?.furPlan)setClip(sheet,null);
let { R: RESIST, S: RESIST_SOFT } = MOD&&!AREA_PLAN ? joinResist(RESIST_BASE, RESIST_SOFT_BASE, MOD, { w, h, n, distanceToZero }) : { R: RESIST_BASE, S: RESIST_SOFT_BASE };
if(AREA_PLAN){RESIST??=new Uint8Array(n);RESIST_SOFT??=new Float32Array(n);for(let i=0;i<n;i++)if(AREA_PLAN.film[i]){RESIST[i]=1;RESIST_SOFT[i]=1;}}
if(VALUE_PLAN){
 // The same target-white mask owns planning and physical film; inferred highlights include pale painted planes.
 RESIST=VALUE_PLAN.protectedCells.slice();RESIST_SOFT=Float32Array.from(RESIST);
}
if(VALUE_PLAN&&VALUE_CONFIG?.reserves?.length){RESIST??=new Uint8Array(n);RESIST_SOFT??=new Float32Array(n);for(const r of VALUE_CONFIG.reserves){const b=r.bounds;for(let y=Math.floor(b[1]*h);y<Math.ceil(b[3]*h);y++)for(let x=Math.floor(b[0]*w);x<Math.ceil(b[2]*w);x++)if(x<w&&y<h){RESIST[y*w+x]=1;RESIST_SOFT[y*w+x]=1;}}const cells=Array.from({length:N2},(_,i)=>i),paper=measurePaper(sheet,cells);if(!paper.dry)throw Error('essential light film requires dry paper');fs.appendFileSync(path.join(out,'value-commands.jsonl'),JSON.stringify({kind:'essential-light-film-plan',paper,operation:'real applyResist through existing union lifecycle; full strength; remove after last dry shadow',reserves:VALUE_CONFIG.reserves})+'\n');}
const upF = f => { if (SC === 1) return f; const m = new Float32Array(N2); for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) m[y * W2 + x] = f[((y / SC) | 0) * w + ((x / SC) | 0)]; return m; };
// --practice: the practice plan: value passes over all colours in place of the ladder
// (src/paint/methods/practice-plan.mjs); it lays its own frisket and lifts it once the first pass is done
const PRACTICE = num('practice', 0) > 0;
let PRACTICE_CUT = null;
const used = {};
const TECHS = [], LAST = new Uint8Array(n);
// --darkmass: dark surfaces (black fur, hair, dark clothing, cast shadows) painted in four steps of paint spread over
// the ladder, with the ladder and the pens kept off them (src/paint/techniques/dark-mass.mjs)
// --dogpaint: a black curly dog painted as blots of paint in layers, in place of the dark mass
// (src/paint/techniques/dog-paint.mjs); it takes the same hooks
const DARK_MASS = await (opt('dogpaint', '') ? dogPaint : darkMass)({
  sheet, w, h, n, SC, W2, H2, N2, K: PIGS.length, A, SRC, expected, used, O, SEED, UPRIGHT, CAL, image: opt('image', ''), path,
  thickness, gaussian, components, dilate, erode, distanceToZero, createBrush, dip, stroke, step, dry, applyResist, liftResist,
  brushedWashPaths, containPaths, sweepCover, clock, snap, setStage: s => { STAGE = s; }, opt, num, log: console.log, PIGS,
  drawGestures:(sh,gs,want,w,h,o)=>{const previous=AREA_DRAW_STAGE;AREA_DRAW_STAGE='closing';try{return penDraw(sh,gs,want,w,h,o);}finally{AREA_DRAW_STAGE=previous;}}, sheetK: SHEET_PIGS.length,
  // the pen's ink: the separate ink pigment when there is one, else the palette's darkest pan, as the pen draws with
  inkAt: INK ? PIGS.length : PIGS.map((p, j) => [j, p.K[0] + p.K[1] + p.K[2]]).sort((a, b) => b[1] - a[1])[0][0],
});
// --feedback: charge later passes for what the sheet lacks of each pigment, read once per pass, not what the ledger booked.
// --drawing first|detect|last|both|none: order of the line. first (default) draws in --outlinemedium, lets it dry, then washes.
// detect: draw first only if the source shows --penfirst per cent of line (default 0.5), else ink at the end. last: wash, then ink.
// both: draw first, wash, ink again. none: no line.
// --prep 1: a full preparatory drawing: no ink budget, a lower floor so fainter contours are found, and the outline pass.
const PREP = opt('prep', '0') !== '0';
const DRAWING = PREP && opt('drawing', 'first') === 'detect' ? 'first' : opt('drawing', 'first');
if (!['detect', 'first', 'last', 'both', 'none'].includes(DRAWING)) throw new Error(`--drawing: detect, first, last, both or none, not ${DRAWING}`);
const PEN_FIRST = DRAWING === 'first' || DRAWING === 'both' ? true
  : DRAWING === 'last' || DRAWING === 'none' ? false
  : num('penfirst', 0.5) > 0 && 100 * SOURCE_INK >= num('penfirst', 0.5);
// `both` runs the closing pass as well, which a pen-first sheet otherwise skips
const DRAW_LAST = DRAWING === 'both' || DRAWING === 'last' || (DRAWING === 'detect' && !PEN_FIRST);
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
const SKY_WARM_RB = opt('skywarm', '') !== '' ? Float32Array.from({ length: n }, (_, i) => PX_RAW[i * 3] - PX_RAW[i * 3 + 2]) : null;
// each passage's technique, read off the source inside it, is chosen here for the whole plan (planning, before the
// first mark), not when the brush reaches it
for (const L2 of layers) for (const sh of L2.shapes) if (sh.mask) techniqueOf(sh);
// a graded wash's sweep direction and its prewet reach (onto paper as pale as its own pale end) are read off the plan
// and the source here, before painting, not when the brush reaches the passage
for (const L2 of layers) for (const sh of L2.shapes) if (sh.mask && sh.graded && !sh._follow) {
  sh._gradedAngle = gradientSweepAngle(sh.graded, sh.mask, w, h);
  sh._prewet = prewetArea(sh.mask, SRC, w, h, { reach: Math.round(num('gradedprewet', 0.03) * Math.min(w, h)) });
}
// From here to phaseMark('painting') the target and its per-cell maps are closed (--targetguard, default gentle). The
// only way back to the reference is TARGET_GUARD.look: shape-level means at a peek, a review or a passage.
// treelayers and --inkofftrees find the tree region from the reference: done here, before the target is sealed
if (opt('passages', '').split(',').includes('treelayers') || num('inkofftrees', 0) > 0) { const { precomputeTree } = await import('../src/paint/techniques/passages/treelayers.mjs'); precomputeTree({ w, h, px, mmCell: num('sheetmm', DEFAULT_SHEET_MM) / w }); if (num('inkofftrees', 0) > 0) await inkTreeMask(); }
// --touchpoints R: once the planned passes are laid, R rounds comparing each planning shape's mean with the reference (TARGET_GUARD.look).
// A shape that reads lighter gets one corrective glaze; only deficits are glazed, nothing is read cell by cell.
const TP_ROUNDS = Math.max(0, Math.round(num('touchpoints', 0)));
let TP_SHAPES = null;
if (TP_ROUNDS > 0) {
  const { planningShapes, lineMask } = await import('../src/paint/methods/shape-refit.mjs');
  const lf = v => (!v ? null : v.includes('/') ? path.resolve(root, v + '-lines.json') : path.resolve(root, 'work/lines', v + '-lines.json'));
  const PENCELLS = lineMask([...new Set([lf(opt('drawingfile', '')), lf(opt('drawinglast', ''))])], w, h, { pad: Math.round(num('touchlinepad', 1)), fs });
  const groups = planningShapes(channelDensity(px, n, paperRGB), w, h, { families: num('touchfamilies', 24), minCells: Math.max(64, Math.round(num('touchmincells', 0.0008) * n)), pool: false, smooth: Math.round(num('touchsmoothmm', 1) / (num('sheetmm', DEFAULT_SHEET_MM) / w)) });
  TP_SHAPES = groups.map(cells => { const mask = new Uint8Array(n), look = new Uint8Array(n); for (const i of cells) { mask[i] = 1; if (!PENCELLS[i]) look[i] = 1; } const t = { mask, area: cells.length, amount: 0, mix: PIGS.map(() => 0), _look: look }; techniqueOf(t); return t; });
  console.log(`touchpoints: ${TP_ROUNDS} rounds over ${TP_SHAPES.length} planning shapes (${TP_SHAPES.reduce((a, t) => a + t.area, 0)} cells), cut before painting`);
}
// --finaldarks 1: after the touch-up rounds, one round of small decisive darks (src/paint/methods/final-darks.mjs). The
// accent cells and their families are cut here, before painting; at the end each family gets one shape-level look.
let FD_SHAPES = null;
if (num('finaldarks', 0) > 0) {
  const mmCell = (PB?.mm ?? num('sheetmm', DEFAULT_SHEET_MM)) / w, pen = new Uint8Array(n);
  for (const P of [PEN_PLANS.first, PEN_PLANS.last]) for (const g of P?.scaled ?? []) if (g.draw !== false) for (const q of g.points ?? []) {
    const x = Math.round(q.x / SC), y = Math.round(q.y / SC);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) pen[yy * w + xx] = 1; }
  }
  const cells = accentCells(channelDensity(px, n, paperRGB), w, h, { mmPerCell: mmCell, pen, darkQ: num('fdquantile', 0.9), minValue: num('fdmin', 0.45), contrast: num('fdcontrast', 0.08), surroundMm: num('fdsurroundmm', 2.5), minMm2: num('fdminmm2', 0.5) });
  const fams = accentFamilies(cells, w, h, { mmPerCell: mmCell, tileMm: num('fdtilemm', 10), minCells: 64 });
  const T0 = { name: 'wet on dry', water: 0.62, wetMix: 0.55, bridge: 0.78, bridgeSoft: 2.2, intoWet: false, dryAfter: true, passes: 1 };
  FD_SHAPES = fams.map(f => { const mask = new Uint8Array(n); for (const i of f.cells) mask[i] = 1; const t = { mask, area: f.cells.length, amount: 0, mix: PIGS.map(() => 0), _look: mask }; TECHNIQUE.set(t, T0); return t; });
  let a = 0; for (const v of cells) a += v;
  console.log(`final darks: ${a} accent cells (${(100 * a / n).toFixed(2)}% of the sheet) in ${FD_SHAPES.length} families, ${FD_SHAPES.reduce((s, t) => s + t.area, 0)} cells, cut before painting`);
}
const PREP_KEEP = num('prepfade', 0) > 0 ? up(dilate(SEP.ink, w, h, Math.round(num('prepkeep', 2)))) : null;
SPEED_PROFILE?.add('planningAndSetup', process.uptime() * 1000);
TARGET_GUARD.beginPaint(); if (TARGET_GUARD.mode !== 'off') console.log(`target guard: ${TARGET_GUARD.mode}, target sealed for the paint step`);
if (!RESUMING && RESIST && !PRACTICE && Math.round(num('masses', 0)) <= 0) { if(AREA_PLAN){const cells=Array.from(up(AREA_PLAN.film),(v,i)=>v?i:-1).filter(i=>i>=0);if(cells.length){const paper=measurePaper(sheet,cells);if(!paper.dry)throw Error('semantic film requires actual dry paper before apply');AREA_EXEC.command('physical film apply and establish',{cells,paper,areaPassIds:AREA_PLAN.schedule.filter(s=>s.pass.lights.mode==='film').map(s=>s.key),semanticPlanned:true,establishedStrength:1,solventDryingModel:'not separately modeled'},()=>applyResist(sheet,up(RESIST),RESIST_SOFT&&upF(RESIST_SOFT)));}else applyResist(sheet,up(RESIST),RESIST_SOFT&&upF(RESIST_SOFT));}else applyResist(sheet, up(RESIST), RESIST_SOFT && upF(RESIST_SOFT)); STAGE = { stage: 'frisket', cells: RESIST.reduce((a, v) => a + v, 0) }; await shoot(); }
// The planned drawing, laid (planPen made every decision before the first mark).
// Linked stages: each stage's own layer (what it laid) and the sheet as it stands after it, as layer-<stage>.jpg and
// stage-<stage>.jpg, so the stages can be judged one at a time.
const stageShot = async (name, before) => {
  const now = thickness(sheet), raw = { raw: { width: W2, height: H2, channels: 3 } };
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
  const want = new Float32Array(N2).fill(1), before = thickness(sheet).map(a => Float32Array.from(a));
  let drawn = 0;
  for (const [bi, b] of batches.entries()) {
    for (const q of b.parts) { const r = clock('strokes', () => penDraw(sheet, q.strokes.map(g => ({ ...g, points: g.points.map(p => ({ ...p, s: p.s * q.gain })) })), want, W2, H2, { ink: SHEET_PIGS.map((_, j) => (j === GRAPHITE_AT ? 1 : 0)), pen: PEN, O, peak: 1 })); drawn += r.drawn ?? 0; }
    STAGE = { stage: 'prep', step: `pencil ${b.name}`, batch: bi + 1, of: batches.length };
    await shoot();
  }
  drawnCount += drawn;
  console.log(`prep stage: ${strokes.length} pencil lines in ${batches.length} frames (${[0, 1, 2].map(p => `${['big shapes', 'features', 'detail'][p]} ${strokes.filter(g => (g.rank === 1 ? 0 : g.rank === 2 ? 1 : 2) === p).length}`).join(', ')}), ${drawn} strokes laid`);
  await stageShot('prep', before);
}
async function drawPass(_unused, { first = false, fine = false } = {}) {
  const speedDrawStart = performance.now();
  try {
  const PLAN = PEN_PLANS[first ? 'first' : fine ? 'fine' : 'last'];
  if (!PLAN) throw new Error('drawing: this pen pass was not planned before painting');
  const { preparing, PEN, K, graphiteFirst, inkPig, scaled, wantT1, big, peak, inkVerdict, frozenPeak, per, SELECTED, outlines, gestures } = PLAN;
  VALUE_ACTIVE=null;
  AREA_DRAW_STAGE=first?'opening':'closing';
  if (first && STAGE_PLAN?.files.prep && GRAPHITE) await drawPrepStage(PEN);
  const stageBefore = STAGE_PLAN && !fine ? thickness(sheet).map(a => Float32Array.from(a)) : null;
  // --penoutline (pen first only, default on): the main shapes' outlines first, so the drawing alone states the subject.
  if (first && PREP && GRAPHITE && ANCHORS) {
    const points=Object.fromEntries(ANCHORS.landmarks.map(a=>[a.id,{x:a.painting[0]*W2/ANCHORS.canvas[0],y:a.painting[1]*H2/ANCHORS.canvas[1]}]));
    const skeleton=Object.entries(ANCHORS.curves).filter(([name])=>/eye_axis|face_axis|jaw_planes|ear_near|ear_far/.test(name)).map(([,ids])=>({points:ids.map(id=>points[id])}));
    const constructionWant=new Float32Array(N2).fill(.3);
    penDraw(sheet,skeleton,constructionWant,W2,H2,{ink:SHEET_PIGS.map((_,j)=>j===GRAPHITE_AT?.65:0),pen:{...PEN,nib:.45*K},O,peak:1});
    STAGE={stage:'construction',anchors:true}; await shoot();
  }
  if (outlines) {
    const wantO = new Float32Array(N2).fill(num('outlinewant', 0.6));
    const perO = Math.max(1, Math.ceil(outlines.length / 4));
    for (let k = 0; k < outlines.length; k += perO) {
      const outlinePig = GRAPHITE ? GRAPHITE_AT : inkPig, outlineConc = GRAPHITE ? (STYLE_ON()?3*VALUE_PLAN.style.graphite:num('graphiteconc', 3)) : INKLOAD();
      const r0 = clock('strokes', () => penDraw(sheet, outlines.slice(k, k + perO).filter(g => g.draw), wantO, W2, H2, { ink: SHEET_PIGS.map((_, j) => (j === outlinePig ? outlineConc : 0)), pen: PEN, O, peak: 1 }));
      drawnCount += r0.drawn;
      STAGE = { stage: first ? (GRAPHITE && !PENCIL ? 'prep' : 'pen') : 'ink', step: 'outlines', batch: 0, of: Math.ceil(scaled.length / Math.max(1, Math.ceil(scaled.length / 8))), outline: true };
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
      if (!PENCIL) for (const q of b.parts) { const r1 = clock('strokes', () => penDraw(sheet, q.strokes, wantT1, W2, H2, { ink: SHEET_PIGS.map((_, j) => (j === inkPig ? INKLOAD() * q.gain : 0)), pen: PEN, O, peak: 1 })); drawnCount += r1.drawn; }
      if (PENCIL) for (const q of b.parts) { const r1 = clock('strokes', () => pencilDraw(sheet, q.strokes, GRAPHITE_AT, { amount: PENCIL.pig.strength * num('pencilgain', 1) * q.gain, pressureReference: num('pencilpressure', 0) > 0 ? num('pencilpressure', 0) : null, width: num('pencilw', 1.2) * SC, vary: num('pencilvary', 0.35), tooth: num('penciltooth', 0.4), seed: SEED + 31 * bi + (q.gain < 1 ? 7 : 0) })); drawnCount += r1.drawn; }
      STAGE = { stage: 'pen', step: `pencil ${b.name}`, batch: bi + 1, of: batches.length };
      await shoot();
    }
  }
  for (let k = 0; k < (PENCIL_STAGE && first && SELECTED ? 0 : scaled.length); k += per) {
    const batch = scaled.slice(k, k + per), main = batch.filter(g => !g.outline && g.tier !== 1), thin = batch.filter(g => g.outline);
    const first1 = batch.filter(g => g.tier === 1);
    const peakMain = peak ?? (inkVerdict ? frozenPeak(main) : null), peakThin = peak ?? (inkVerdict ? frozenPeak(thin) : null);
    const drawMain = inkVerdict ? main.filter(g => g.draw) : main, drawThin = inkVerdict ? thin.filter(g => g.draw) : thin;
    const drawT1 = inkVerdict ? first1.filter(g => g.draw) : first1;
    if (drawT1.length && PENCIL && first && SELECTED) { const r1 = clock('strokes', () => pencilDraw(sheet, drawT1, GRAPHITE_AT, { amount: PENCIL.pig.strength * num('pencilgain', 1), pressureReference: num('pencilpressure', 0) > 0 ? num('pencilpressure', 0) : null, width: num('pencilw', 1.2) * SC, vary: num('pencilvary', 0.35), tooth: num('penciltooth', 0.4), seed: SEED + k })); drawnCount += r1.drawn; }
    else if (drawT1.length) { const r1 = clock('strokes', () => penDraw(sheet, drawT1, wantT1, W2, H2, { ink: SHEET_PIGS.map((_, j) => (j === inkPig ? (graphiteFirst && !preparing ? (STYLE_ON()?3*VALUE_PLAN.style.graphite:num('graphiteconc', 3)) : INKLOAD()) : 0)), pen: PEN, O, peak: 1 })); drawnCount += r1.drawn; }
    // --mlwant: a line from the learned map is drawn at a constant pressure, like the outline tier (ml-lines.mjs)
    const mlWant = ML_LINES ? ML_LINES.want : 0;
    const drawML = mlWant ? drawMain.filter(g => g.ml) : [], drawRest = mlWant ? drawMain.filter(g => !g.ml) : drawMain;
    if (drawML.length) { const wantML = new Float32Array(N2).fill(mlWant); const rm = clock('strokes', () => penDraw(sheet, drawML, wantML, W2, H2, { ink: SHEET_PIGS.map((_, j) => (j === inkPig ? (graphiteFirst && !preparing ? (STYLE_ON()?3*VALUE_PLAN.style.graphite:num('graphiteconc', 3)) : INKLOAD()) : 0)), pen: PEN, O, peak: 1 })); drawnCount += rm.drawn; }
    const r = clock('strokes', () => penDraw(sheet, drawRest, big, W2, H2, { ink: SHEET_PIGS.map((_, j) => (j === inkPig ? (graphiteFirst && !preparing ? (STYLE_ON()?3*VALUE_PLAN.style.graphite:num('graphiteconc', 3)) : INKLOAD()) : 0)), pen: PEN, O, peak: peakMain }));
    if (drawThin.length) { const r2 = clock('strokes', () => penDraw(sheet, drawThin, big, W2, H2, { ink: SHEET_PIGS.map((_, j) => (j === inkPig ? (graphiteFirst ? (STYLE_ON()?3*VALUE_PLAN.style.graphite:num('graphiteconc', 3)) : num('outlineconc', 6.5)) : 0)), pen: PEN, O, peak: peakThin })); drawnCount += r2.drawn; }
    drawnCount += r.drawn;
    STAGE = { stage: first ? (GRAPHITE && !PENCIL ? 'prep' : 'pen') : 'ink', step: fine ? 'fine' : 'gestures', batch: k / per + 1, of: Math.ceil(scaled.length / per) };
    // under --filmby paint the pen is filmed about PEN_FRAMES times, the last batch always
    const ofB = Math.ceil(scaled.length / per), bi = k / per + 1;
    if (!FILM_BY_PAINT || bi === ofB || bi % Math.max(1, Math.round(ofB / PEN_FRAMES)) === 0) await shoot();
  }
  clock('dry', () => dry(sheet, 20000, O, { levelMax: 200 }));
  if (stageBefore && (first ? STAGE_PLAN.files.prepInk && STAGE_PLAN.stages.prepInk : STAGE_PLAN.files.finishInk)) await stageShot(first ? 'prepink' : 'finishink', stageBefore);
  if (INKRES) { INKRES.settle(); console.log(`inkres ${INKRES.N}: the pens on a ${INKRES.width} x ${INKRES.height} sheet, ${INKRES.stats.calls} calls, ${(INKRES.stats.ms / 1000).toFixed(1)} s so far`); }
  console.log(`drawing: ${drawnCount} pen gestures in pigment ${inkPig}, long share ${longShare(gestures, w).toFixed(2)}`);
  } finally { SPEED_PROFILE?.add('drawing', performance.now() - speedDrawStart); }
}
let INK_THK = null, WASH_THK = null;
if (!RESUMING && PEN_FIRST && opt('draw', '1') !== '0' && DRAWING !== 'none') {
  console.log(`pen first: source line ${(100 * SOURCE_INK).toFixed(1)}% of cells`);
  const before = thickness(sheet).map(a => Float32Array.from(a));
  await drawPass(null, { first: true });
  INK_THK = thickness(sheet).map((a, j) => Float32Array.from(a, (v, i) => Math.max(0, v - before[j][i])));
  await sharp(render(), { raw: { width: W2, height: H2, channels: 3 } }).png().toFile(path.join(out, 'drawing-opening.png'));
}
// An actual dry-pen checkpoint, using the same planned strokes and physics as
// the full painting. The process exit hook still writes the strict guard report.
if (num('drawingonly', 0) > 0) {
  if (RESUMING || !PEN_FIRST || opt('draw', '1') === '0' || DRAWING === 'none') throw new Error('--drawingonly requires an opening drawing');
  fs.copyFileSync(path.join(out, 'drawing-opening.png'), path.join(out, 'painting.png'));
  fs.writeFileSync(path.join(out, 'pen-state-audit.json'), JSON.stringify(PEN_STATE_AUDIT));
  fs.writeFileSync(path.join(out, 'drawing-checkpoint.json'), JSON.stringify({ stage: 'dry opening drawing', paintExecuted: false, gestures: drawnCount, backend: GPU_INFO }));
  await drainFrames(); if (FRAMER) FRAMER.close(); sheet._gpu?.close();
  console.log('drawing-only: dry opening complete, before washes'); process.exit(0);
}
if(MAJOR_INTENT)await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'major-drawing-opening.png'));
if(num('treelayerslate',0)===1&&PEN_FIRST&&DRAWING!=='none')await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'production-drawing-opening.png'));
// A semantic run records the real preparation before washes obscure it; guide and trace stay separate source artifacts.
if(AREA_PLAN && PEN_FIRST && opt('draw','1')!=='0' && DRAWING!=='none'){
  const guide=opt('penpencil',''),base=opt('drawingfile','');
  const traceFile=base?path.resolve(root,'work/lines',base+'-lines.json'):null;
  await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'semantic-drawing-opening.png'));
  fs.writeFileSync(path.join(out,'semantic-drawing-opening.json'),JSON.stringify({
   kind:'actual production opening drawing before washes; not artistic acceptance',
   target:AREA_PLAN.doc.target,planSHA256:sha256(path.resolve(root,AREA_FILE||FINISH_FILE)),
   guide:guide?{path:path.resolve(root,guide),sha256:sha256(path.resolve(root,guide))}:null,
   trace:traceFile&&fs.existsSync(traceFile)?{path:traceFile,sha256:sha256(traceFile)}:null,
   material:PENCIL?'physical dry graphite':'existing production outline material',
   reviewedStrategy:reviewedOpeningStrategy(base,opt),
   drawingCommands:AREA_EXEC.records.filter(r=>r.operation==='actual dry graphite'||r.operation==='physical pen gesture'),
   prepfadeRequested:num('prepfade',0)>0,closingInkExecuted:false,paintExecuted:false,backend:GPU_INFO
  },null,2));
}
if(opt('areastop','')==='drawing-opening'){
 if(!AREA_PLAN||!PEN_FIRST||opt('draw','1')==='0'||DRAWING==='none')throw new Error('drawing-opening requires semantic physical opening drawing');
 await drainFrames();if(FRAMER)FRAMER.close();sheet._gpu?.close();console.log('semantic drawing-opening checkpoint before paint');process.exit(0);
}
// Bounded material proof after actual opening drawing and ordinary dry, not preparation.
if(process.env.PHASE_EXIT==='drawing-material-opening'){
  if(!PEN_FIRST || !PENCIL || DRAWING==='none' || opt('draw','1')==='0')
    throw new Error('drawing-material-opening requires actual dry graphite opening via --penpencil');
  fs.writeFileSync(path.join(out,'pen-state-audit.json'),JSON.stringify(PEN_STATE_AUDIT,null,2));
  await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'graphite-opening-ordinary-dried.png'));
  await drainFrames();if(FRAMER)FRAMER.close();
  fs.writeFileSync(path.join(out,'drawing-material-opening.json'),JSON.stringify({stage:'actual dry graphite opening after ordinary dry',preparationBinding:opt('preparationbinding','')||null,graphiteCommands:(num('recordgraphite',0)>0||opt('preparationbinding',''))?'preparation-graphite.jsonl':null,graphiteRecordScope:num('recordgraphite',0)>0?'All actual executed production opening batches; geometry selection unchanged':null,guide:opt('penpencil',''),drawing:opt('drawingfile',''),pressureReference:num('pencilpressure',0)||null,prepfadeExecuted:false,closingInkExecuted:false,paintExecuted:false,backend:GPU_INFO},null,2));
  sheet._gpu?.close();phaseMark('drawing-material-opening');
}
// --prepfade 1: the opening drawing recedes as the washes cover it (pencil-stage.mjs prepFade): its pigment is the
// graphite when the first pen drew in pencil, else the separate ink, which the closing pen uses only once the washes are down
const PREPF = num('prepfade', 0) > 0 && PEN_FIRST && DRAWING !== 'none' ? (() => {
  const k = GRAPHITE && (STAGE_PLAN?.files.prep || OUTLINE_MEDIUM === 'graphite' || PENCIL || opt('firstpen', 'ink') === 'graphite') ? GRAPHITE_AT : INK ? PIGS.length : -1;
  if (k < 0) { console.log('prep fade: the first pen drew in a wash pigment, nothing to fade'); return null; }
  const keep = PREP_KEEP;
  console.log(`prep fade: pigment ${k}, ${sheet.layers.length} layers hold the drawing, ${(100 * keep.reduce((a, v) => a + (v ? 1 : 0), 0) / N2).toFixed(1)}% of the sheet kept as the finish's line`);
  return { k, upto: sheet.layers.length, keep, applied: new Float32Array(N2).fill(1), kk: PIGS.map(p => (p.K[0] + p.K[1] + p.K[2]) / 3 / 0.55) };
})() : null;
const fadePrep = () => {
  if (!PREPF) return 0;
  sheet._gpu?.syncLower(sheet, process.env.GPU_COMPOSITE === '1' ? PREPF.upto : Infinity);
  const P = PIGS.length, paint = new Float32Array(n);
  for (let i = 0; i < n; i++) { let v = 0; for (let j = 0; j < P; j++) v += expected[i * P + j] * PREPF.kk[j]; paint[i] = v; }
  const planes = [sheet.G[PREPF.k], sheet.D[PREPF.k], sheet.P[PREPF.k], ...sheet.layers.slice(0, PREPF.upto).map(L => L[PREPF.k])];
  const faded = prepFade(planes, PREPF.applied, PREPF.keep, paint, { under: num('prepunder', 0.7), clean: num('prepclean', 0.1), SC, w, W2 });
  layersChanged(sheet, sheet.layers.slice(0, PREPF.upto)); // it scaled dried layers in place: the cached sums of them are stale
  return faded;
};
if (PRACTICE) {
  const r = await paintPractice({
    sheet, w, h, n, SC, W2, H2, N2, PIGS, K: PIGS.length, A, SRC, expected, used, O, SEED, UPRIGHT, BRUSH, CAL, WET, RESIST, paper,
    image: opt('image', ''), root, fs, path, sharp, gaussian, dilate, dip, up, upF, clock, shoot, densityNow: () => sheetDensity(render()), inkCells: SEP.ink, out, setStage: s => { STAGE = s; }, mark, flowEvery, opt, num, log: console.log,
  });
  laid += r.laid; PRACTICE_CUT = r.cutPen;
}
// --masses: the sheet begun with a mop, a few broad washes each chosen from what the sheet still lacks at the mop's own
// scale, before the ladder (src/paint/methods/masses.mjs); --segwash takes their regions from the segments.
const MASSES = Math.round(num('masses', 0));
const mopLanes = makeMopLanes({ num });
const setStage = s => { STAGE = s; };
if (MASSES > 0) {
  const massLaid = await paintMasses({
    sheet, w, h, n, SC, W2, H2, PIGS, A, expected, used, O, SEED, UPRIGHT, BRUSH, CAL, WET, subject: TIER_MASK,
    masses: MASSES, mopLanes, handAngle, flowEvery, dip, up, clock, shoot, setStage, opt, num, log: console.log,
  });
  laid += massLaid;
  // the masking fluid goes on here, once the broad washes have tinted the lights as a first wash does
  if (RESIST) { applyResist(sheet, up(RESIST), RESIST_SOFT && upF(RESIST_SOFT)); STAGE = { stage: 'frisket', cells: RESIST.reduce((a, v) => a + v, 0) }; await shoot(); }
}
// --passages sea,sand,trees,sky,dog: named passages from src/paint/techniques/passages/<name>.mjs, each one section of the picture.
// The shapes and the ladder leave their segments to them (src/paint/methods/passages.mjs). `share` is the context each is handed.
// --passbrushmm 1: passage brushes sized in mm, capacity as a volume, so water does not change with resolution. Default 0.
const PASS_BRUSH_MM = num('passbrushmm', 0) > 0;
const passageBrush = opts => {
  if (!PASS_BRUSH_MM) return createBrush(opts);
  const f = (280 / 1086) / (PB ? PB.mmPerCell : num('sheetmm', DEFAULT_SHEET_MM) / W2), rr = (opts.radius ?? 6) / f;
  const bristles = opts.flat ? Math.max(12, Math.ceil(rr * 2)) : Math.max(8, Math.ceil(rr * 2.5));
  const stiffness = (opts.flat ? 8 : Math.max(2, Math.round(rr * 0.5))) * f;
  return createBrush({ ...opts, bristles, capacity: (opts.capacity ?? 20) * f * f, stiffness,
    streakLength: (opts.streakLength ?? 14) * f });
};
const PASSAGE_HOOK = await passageHook({
  share: {
    outDir: out, root, sheet, w, h, n, SC, W2, H2, N2, PIGS, K: PIGS.length, SHEET_PIGS, A, expected, used, O, SEED, UPRIGHT, subject: TIER_MASK, fwSubject: FW_SUBJ, paperRGB,
    thickness, gaussian, components, dilate, erode, removeSmall, distanceToZero, createBrush: passageBrush, dip, stroke, thirsty, step, dry, blot, applyResist, liftResist, setClip, render,
    mopLanes, washPaths, brushedWashPaths, containPaths, sweepCover, handAngle, clock, snap, opt, num, log: console.log, furMarks, orientationField, detailMarks,
  },
  fg: SEG_FG, sheet, O, w, h, n, clock, dry, snap, setStage, opt, num, log: console.log,
});
SEG_FG = PASSAGE_HOOK.fg;
if(num('treelayerslate',0)===1)fs.writeFileSync(path.join(out,'production-passage-schedule.json'),JSON.stringify({mode:'whole treelayers deferred after broad numeric composition',referenceHypothesis:'Retain all tree wetphase relationships and actual detail geometry; finish figure/masses before expensive hillside refinement',treeFoundationBeforeSnapshot:false,schedule:PASSAGE_HOOK.schedule},null,2));
// --ladderkeepout: the cells the ladder keeps off, built once: the passages' own segments, less the warm cells when
// --skywarm T is set (stone and brick inside a sky map are the ladder's), widened by --keepoutreach cells
const keepoutMask = () => PASSAGE_HOOK._keepout ??= (() => {
  const r = Math.round(num('keepoutreach', 0)), WARMT = opt('skywarm', '') !== '' ? num('skywarm', 8) : null;
  const o = WARMT === null ? PASSAGE_HOOK.owned : Uint8Array.from(PASSAGE_HOOK.owned, (v, i) => (v && !(SKY_WARM_RB[i] > WARMT) ? 1 : 0));
  return r > 0 ? dilate(o, w, h, r) : o;
})();
// --passlate 1: lay the 'washes' passages once the ladder's ground passes are down, so foliage sits on them. Default 0.
const PASS_LATE = num('passlate', 0) > 0; let PASS_LATE_DONE = !PASS_LATE;
if (!PASS_LATE) await PASSAGE_HOOK.run('washes');
// --shapes: the darks as shapes, each one loaded mass with a crisp edge laid before the ladder
// (src/paint/methods/shapes.mjs)
const SHAPES = Math.round(num('shapes', 0));
if (SHAPES > 0) {
  const shapeLaid = await paintShapes({
    sheet, w, h, n, SC, W2, H2, N2, PIGS, A, expected, used, O, SEED, UPRIGHT, BRUSH, CAL, WET, owned: PASSAGE_HOOK.owned,
    shapes: SHAPES, flowEvery, dip, up, clock, shoot, setStage, num, log: console.log,
  });
  laid += shapeLaid;
}
await PASSAGE_HOOK.run('shapes');
let ONSHEET = null;
// --feedbacklag 1 (fast default): read the sheet only when it is in hand; between reads, predict it as the last read
// plus what the ledger booked since, so planning overlaps the GPU's dry. Full mode reads every pass.
const FEEDBACK_LAG = num('feedbacklag', NATIVE_PAINT_MODE.mode === 'fast' ? 1 : 0) > 0 && num('orderremix', 0) <= 0;
let FEEDBACK_BASE = null, FEEDBACK_FRESH = true;
const feedbackStats = { read: 0, predicted: 0 };
if (num('orderremix', 0) > 0) throw new Error('--orderremix was removed by the anti-cheat rules: it charged each cell from the per-cell gap to the plan');
const REMIX = null;
// --crisp: hard-edged glazes carried to their line (src/paint/methods/crisp-edges.mjs)
const CRISP = makeCrisp({ opt, num });
// --passmerge, --strokebudget, --focusmap (src/paint/methods/stroke-budget.mjs)
const FOCUS = (await loadFocus({ opt, w, h, sharp, path, root })) ?? (MOD?.field ?? null);
// --massplan: each passage tagged with its mass and every pass laid mass by mass, back to front (mass-wash.mjs)
if (MASSP) { orderByMass(layers, MASSP, n); console.log(`mass order: passages of every pass laid by mass, ${layers.reduce((a, l) => a + l.shapes.length, 0)} passages`); }
if (num('passmerge', 0) > 0 && GFLOOR) {
  const before = layers.reduce((a, l) => a + l.shapes.length, 0);
  for (const l of layers) l.shapes = mergeShapes(l.shapes, { n, tol: num('mergetol', 0.25), amt: num('mergeamt', 1.35), film: FILM_MASS });
  console.log(`pass merge: ${before} passages laid as ${layers.reduce((a, l) => a + l.shapes.length, 0)}, one per pass and mix`);
}
// the broad first wash goes on before anything else (painterOrder and the colour order file it under its leading pan)
if (FIRST_FLOOR > 0) { const fw = layers.filter(isFirst); if (fw.length) { layers = [...fw, ...layers.filter(l => !isFirst(l))]; console.log(`first wash: ${fw.reduce((a, l) => a + l.shapes.length, 0)} broad passages over ${(100 * fw.reduce((a, l) => a + l.shapes.reduce((b, sh) => b + sh.area, 0), 0) / n).toFixed(1)}% of the sheet laid first`); } }
if(AREA_PLAN){try{AREA_COMPILED=compileAreaLayers(AREA_PLAN,layers,PIGS);}catch(e){fs.writeFileSync(path.join(out,'semantic-coverage.json'),JSON.stringify(e.diagnostics??{error:e.message},null,2));throw e;}layers=AREA_COMPILED.layers;validateCompiledAreaStop(opt('areastop',''),layers);fs.writeFileSync(path.join(out,'semantic-coverage.json'),JSON.stringify(AREA_COMPILED.diagnostics,null,2));}
const BUDGET = STROKE_BUDGET ? completeBudget({N:STROKE_BUDGET,layers,drawing:MARKTAPE.filter(m=>['s','P','g'].includes(m.k)).length}) : null;
if (BUDGET) console.log(`stroke budget: ${BUDGET.N} paths, washes ${Math.round(BUDGET.wash)}, drags ${BUDGET.drags}, dry brush ${BUDGET.dry}, accents ${BUDGET.accents}${FOCUS ? ', weighted by the focus map' : ''}`);
if(MOD?.paintOwnedTransfer){
 const stop=opt('majorstop',''),requested=stop.startsWith('pass:')?Number(stop.slice(5)):null;if(requested!==null&&(!Number.isInteger(requested)||requested<1||requested>layers.length))throw Error('owned head checkpoint outside actual reordered paint route');
 fs.writeFileSync(path.join(out,'paint-owned-route-before.json'),JSON.stringify({kind:'actual post-split/reordered route before body painting; not executed contact',passes:layers.length,checkpoint:requested,shapes:layers.map((l,L)=>({pass:L+1,value:l.value,owned:l.shapes.map((sh,S)=>sh._paintOwnedComponentCharge?{shapeId:'numeric-L'+L+'-S'+S,area:sh.area,supportCells:sh._paintOwnedComponentCharge.size}:null).filter(Boolean)}))},null,2));
}
if(FINISH_PLAN){const appended=appendFinishingLayers(layers,FINISH_COMPILED);FINISH_START=appended.start;layers=appended.layers;validateCompiledAreaStop(opt('areastop',''),FINISH_COMPILED.layers);}
if(opt('receiverobserver','')){if(!MAJOR_INTENT||AREA_PLAN)throw Error('receiverobserver requires original numeric major route');const doc=JSON.parse(fs.readFileSync(path.resolve(root,opt('receiverobserver','')),'utf8'));if(opt('majorstop','')!=='pass:'+doc.pass)throw Error('receiverobserver requires its existing pass checkpoint');RECEIVER_OBSERVER=createReceiverObserver(doc,{out,w:W2,h:H2,targetSHA:crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,opt('image','')))).digest('hex'),coherent,render});}
const touchCorrections = round => {
  dry(sheet, 20000, O, { levelMax: 200 });
  const rgb = render(), Ks = PIGS.map(p => p.K.map(v => v / 0.55)), byPig = PIGS.map(() => []), od = c => [0, 1, 2].map(q => -Math.log(Math.max(1, c[q]) / paperRGB[q]));
  let looked = 0, glazed = 0;
  TP_SHAPES.forEach((t, k) => {
    const lk = TARGET_GUARD.look('passage', `touch${round}/s${k}`, t._look, { ref: ['px'] }); if (!lk) return; looked++;
    const m = [0, 0, 0]; let c = 0; for (let i = 0; i < n; i++) if (t._look[i]) { m[0] += rgb[i * 3]; m[1] += rgb[i * 3 + 1]; m[2] += rgb[i * 3 + 2]; c++; }
    const Ds = od(m.map(v => v / Math.max(1, c))), Dt = od(lk.ref.px), d = Dt.map((v, q) => Math.max(0, v - Ds[q]));
    if (Math.max(...d) < num('touchdmin', 0.04)) return;
    const a = unmix(Float32Array.from(d), 1, Ks); let any = false;
    for (let j = 0; j < PIGS.length; j++) if (a[j] > 0.004) { const amt = a[j] * num('touchgain', 0.8), sh = { mask: t.mask, area: t.area, amount: amt, mix: PIGS.map((_, q) => (q === j ? amt : 0)) }; TECHNIQUE.set(sh, TECHNIQUE.get(t)); byPig[j].push(sh); any = true; }
    if (any) glazed++;
  });
  const maxV = Math.max(...layers.filter(l => !l._touch).map(l => l.value || 0));
  const add = byPig.map((shapes, j) => { if (!shapes.length) return null; const tmpl = layers.filter(l => l.pigment === j && !l._touch && !l._darks && !l._detail).at(-1) ?? layers.find(l => !l._touch && !l._darks); return { ...tmpl, pigment: j, value: maxV + round, shapes, _touched: round }; }).filter(Boolean);
  console.log(`touchpoint ${round}: looked at ${looked} shapes, ${glazed} lighter than the reference get a corrective glaze (${add.reduce((a, l) => a + l.shapes.length, 0)} passages over ${add.length} pans)`);
  return add;
};
if (TP_SHAPES) layers.push({ _touch: 1, shapes: [], value: 0, pigment: 0 });
const finalDarks = () => {
  dry(sheet, 20000, O, { levelMax: 200 });
  const rgb = render(), Ks = PIGS.map(p => p.K.map(v => v / 0.55)), byPig = PIGS.map(() => []), od = c => [0, 1, 2].map(q => -Math.log(Math.max(1, c[q]) / paperRGB[q]));
  let looked = 0, laid = 0;
  FD_SHAPES.forEach((t, k) => {
    const lk = TARGET_GUARD.look('passage', `darks/s${k}`, t._look, { ref: ['px'] }); if (!lk) return; looked++;
    const m = [0, 0, 0]; let c = 0; for (let i = 0; i < n; i++) if (t._look[i]) { m[0] += rgb[i * 3]; m[1] += rgb[i * 3 + 1]; m[2] += rgb[i * 3 + 2]; c++; }
    const Ds = od(m.map(v => v / Math.max(1, c))), Dt = od(lk.ref.px), d = Dt.map((v, q) => Math.max(0, v - Ds[q]));
    if (Math.max(...d) < num('fddmin', 0.06)) return;
    const a = unmix(Float32Array.from(d), 1, Ks); let any = false;
    for (let j = 0; j < PIGS.length; j++) if (a[j] > 0.004) { const amt = a[j] * num('fdgain', 1), sh = { mask: t.mask, area: t.area, amount: amt, mix: PIGS.map((_, q) => (q === j ? amt : 0)) }; TECHNIQUE.set(sh, TECHNIQUE.get(t)); byPig[j].push(sh); any = true; }
    if (any) laid++;
  });
  const maxV = Math.max(...layers.filter(l => !l._touch && !l._darks).map(l => l.value || 0));
  const add = byPig.map((shapes, j) => { if (!shapes.length) return null; const tmpl = layers.filter(l => l.pigment === j && !l._touch && !l._darks && !l._detail).at(-1) ?? layers.find(l => !l._touch && !l._darks); return { ...tmpl, pigment: j, value: maxV + 3, shapes, _touched: 'darks', _darkPass: 1 }; }).filter(Boolean);
  console.log(`final darks: looked at ${looked} families, ${laid} lighter than the reference get a dark (${add.reduce((a, l) => a + l.shapes.length, 0)} passages over ${add.length} pans)`);
  return add;
};
if (FD_SHAPES?.length) layers.push({ _darks: 1, shapes: [], value: 0, pigment: 0 });
// ---- stops at passage boundaries and the take-over of a saved painting (tools/aware/pause.mjs) -------------------------
// What a revision may not change once painting has started is checked by the harness; here the painter only refuses to
// save a painting whose state it cannot carry whole (features with state of their own that is not saved below).
const AWARE = createPause({ dir: AWARE_DIR });
const awareUnsupported = () => [
  [PRACTICE, 'practice'], [MASSES > 0, 'masses'], [SHAPES > 0, 'shapes'], [PREPF, 'prepfade'], [INKRES, 'inkres'], [DARK_MASS, 'darkmass/dogpaint'],
  [PASSAGE_HOOK.names?.length, 'passages'], [AREA_PLAN || FINISH_PLAN, 'areaplan/finishplan'], [MAJOR_INTENT, 'major intent'], [RECEIVER_OBSERVER, 'receiverobserver'],
  [CURLS, 'curls'], [GOUACHE_LIGHTS, 'gouache lights'], [FRAMER, 'async frame worker'], [MOD?.paintOwnedTransfer, 'paint-owned transfer'],
].filter(([on]) => on).map(([, name]) => name);
const awareRemaining = from => layers.slice(from).map((l, k) => l._touch ? { pass: from + k + 1, touchRound: l._touch } : {
  pass: from + k + 1, value: l.value, pigment: PIGS[l.pigment]?.name ?? l.pigment, order: l._order?.phase ?? null, touched: l._touched ?? null,
  passages: l.shapes.length, areaShare: +(l.shapes.reduce((a, sh) => a + (sh.area ?? 0), 0) / n).toFixed(4),
  techniques: l.shapes.reduce((a, sh) => { const t = TECHNIQUE.get(sh)?.name ?? '?'; a[t] = (a[t] ?? 0) + 1; return a; }, {}) });
const awareCounts = () => { let s = 0, p = 0; if (MARKTAPE) for (const m of MARKTAPE) { if (m.k === 's') s++; else if (m.k === 'P') p++; } return { strokes: s, penLines: p }; };
const awareSheetPng = async file => { await sharp(INKRES ? INKRES.compose(view()) : view(), { raw: { width: OUT_W, height: OUT_H, channels: 3 } }).png().toFile(file); };
const awareWhere = at => (at.kind === 'closing' ? 'the closing boundary' : at.kind === 'start' ? 'boundary 0' : 'boundary ' + (at.L + 1));
// The whole painting state at a boundary. Sheet arrays come down from the GPU first; the dried layers too.
const awareSave = async (dir, at) => {
  const bad = awareUnsupported(); if (bad.length) throw new Error('aware: cannot save this painting (state not carried: ' + bad.join(', ') + ')');
  coherent(sheet); sheet._gpu?.syncLower(sheet);
  const sheetFields = {}; for (const [k, v] of Object.entries(sheet)) { if (['paper', 'pigments', '_gpu', '_gpuInfo', '_tape', '_renderCaches'].includes(k) || typeof v === 'function') continue; sheetFields[k] = v; }
  const firstTouch = layers.findIndex(l => l._touch);
  // the touch-up rounds insert passes while painting: from the first round on, the pass list is saved whole (painted ones
  // too, since a later round takes its template from the last pass of a pigment)
  const tailFrom = firstTouch >= 0 && (at.kind === 'closing' || (at.kind === 'pass' && at.L >= firstTouch)) ? firstTouch : null;
  const tail = tailFrom === null ? null : layers.slice(tailFrom).map(l => {
    const { shapes, ...fields } = l;
    return { fields, shapes: shapes.map(sh => { const { mask, ...rest } = sh; if (mask == null) return { tp: -1, rest }; const tp = TP_SHAPES ? TP_SHAPES.findIndex(t => t.mask === mask) : -1; if (tp < 0) throw new Error('aware: a touch-up passage without its planning shape'); return { tp, rest }; }) };
  });
  const state = {
    at, sheet: sheetFields, layersLength: layers.length, tailFrom, tail,
    js: { framePolicy: FRAME_POLICY.state(), laid, dropped, droppedMass, filmLaid, filmNext, filmPass, drawnCount, STAGE, LAST_FRAME_STAGE, frame, FRAMES, marks, lastPainted, expected, used, TECHS, LAST, ONSHEET, FEEDBACK_BASE, FEEDBACK_FRESH, feedbackStats, VALUE_ACTIVE, VALUE_OWN_CONTACT, VALUE_COMMAND, VALUE_COUNTS, BODY_CADENCE_RECORD, PASS_LATE_DONE, INK_THK, WASH_THK, colourTrace, WETPOL_WET },
    tape: MARKTAPE ? { marks: MARKTAPE, ...tapeState() } : null, guard: TARGET_GUARD.exportState(),
  };
  const r = writeState(dir, state);
  fs.writeFileSync(path.join(dir, 'boundary.json'), JSON.stringify(at));
  console.log(`aware: painting saved at ${awareWhere(at)} (${r.arrays} arrays, ${r.zeros} empty, ${(r.bytes / 1e6).toFixed(1)} MB) in ${dir}`);
};
const awareRestore = () => {
  const st = readState(RESUME_DIR), at = st.at;
  if (JSON.stringify(at) !== JSON.stringify(RESUME_AT)) throw new Error('aware: boundary.json and state.json disagree');
  const bad = awareUnsupported(); if (bad.length) throw new Error('aware: cannot take over a saved painting with ' + bad.join(', '));
  // the sheet's own physical arrays are refilled in place (worker threads share them); everything else is replaced, and a
  // saved field that pointed at one of the refilled arrays points at the live one again
  const live = new Map(), later = [];
  for (const [k, v] of Object.entries(st.sheet)) {
    const cur = sheet[k];
    if (ArrayBuffer.isView(v) && ArrayBuffer.isView(cur) && cur.length === v.length && cur.constructor === v.constructor) { cur.set(v); live.set(v, cur); }
    else if (Array.isArray(v) && Array.isArray(cur) && k !== 'layers' && v.length === cur.length && v.every((a, j) => ArrayBuffer.isView(a) && ArrayBuffer.isView(cur[j]) && a.length === cur[j].length)) v.forEach((a, j) => { cur[j].set(a); live.set(a, cur[j]); });
    else later.push([k, v]);
  }
  const relink = v => ArrayBuffer.isView(v) ? (live.get(v) ?? v) : Array.isArray(v) ? v.map(relink) : v && typeof v === 'object' && !(v instanceof Map) && !(v instanceof Set) ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, relink(b)])) : v;
  for (const [k, v] of later) sheet[k] = relink(v);
  if (sheet._gpu) { sheet._gpu.pendingLayers = []; sheet._gpu.invalidateOptical(); sheet._gpu.cpuWroteAll(); }
  if (st.tailFrom !== null) {
    const rebuilt = st.tail.map(t => ({ ...t.fields, shapes: t.shapes.map(q => { if (q.tp < 0) return { mask: null, ...q.rest }; const sh = { mask: TP_SHAPES[q.tp].mask, ...q.rest }; TECHNIQUE.set(sh, TECHNIQUE.get(TP_SHAPES[q.tp])); return sh; }) }));
    // this plan's own passes before the first touch-up round (painted already; a revised plan may count them differently)
    const head = layers.filter(l => !l._touch).slice(0, st.tailFrom);
    while (head.length < st.tailFrom) head.push({ ...(head.at(-1) ?? { value: 0, pigment: 0 }), shapes: [], _awarePainted: 1 });
    layers.length = 0; layers.push(...head, ...rebuilt);
  }
  const j = st.js;
  FRAME_POLICY.restore(j.framePolicy);
  ({ laid, dropped, droppedMass, filmLaid, filmNext, filmPass, drawnCount, STAGE, LAST_FRAME_STAGE, frame, lastPainted, ONSHEET, FEEDBACK_BASE, FEEDBACK_FRESH, VALUE_ACTIVE, VALUE_OWN_CONTACT, VALUE_COMMAND, PASS_LATE_DONE, INK_THK, WASH_THK, WETPOL_WET } = j);
  const refill = (a, b) => { a.length = 0; for (const v of b) a.push(v); };
  refill(FRAMES, j.FRAMES); refill(marks, j.marks); refill(TECHS, j.TECHS); refill(colourTrace, j.colourTrace);
  expected.set(j.expected); LAST.set(j.LAST);
  for (const k of Object.keys(used)) delete used[k]; Object.assign(used, j.used);
  Object.assign(feedbackStats, j.feedbackStats); Object.assign(BODY_CADENCE_RECORD, j.BODY_CADENCE_RECORD); j.VALUE_COUNTS.forEach((v, k) => Object.assign(VALUE_COUNTS[k], v));
  if (MARKTAPE) { refill(MARKTAPE, st.tape.marks); restoreTapeState(st.tape); }
  TARGET_GUARD.importState(st.guard);
  RESUMING = false;
  console.log(`aware: took over the painting saved at ${awareWhere(at)} (${FRAMES.length} frames, ${MARKTAPE?.length ?? 0} tape entries); this plan has ${layers.length} passes`);
  return at;
};
// One boundary: progress, and a stop when the harness asks for one. save-exit saves and ends the process (exit 75).
const awareBoundary = async at => {
  if (!AWARE) return;
  const index = at.kind === 'start' ? 0 : at.kind === 'pass' ? at.L + 1 : null, from = at.kind === 'pass' ? at.L + 1 : at.kind === 'start' ? 0 : layers.length;
  const bad = awareUnsupported();
  const info = { index, closing: at.kind === 'closing', label: at.kind === 'start' ? 'before the first wash' : at.kind === 'closing' ? 'before the closing drawing' : `after pass ${at.L + 1} of ${layers.length}`,
    at, passesDone: from, passesPlanned: layers.length, ...awareCounts(), frame, revisable: bad.length === 0, notRevisable: bad, remaining: awareRemaining(from), closingDrawing: Boolean(DRAW_LAST && DRAWING !== 'none') };
  const go = await AWARE.boundary(info, { renderPng: awareSheetPng });
  if (go.action === 'save-exit') {
    const dir = path.join(AWARE_DIR, `state-${index ?? 'closing'}`);
    await awareSave(dir, at);
    await drainFrames(); if (FRAMER) FRAMER.close(); sheet._gpu?.close();
    fs.writeFileSync(path.join(AWARE_DIR, 'saved.json'), JSON.stringify({ dir, at, savedAt: new Date().toISOString() }));
    // the options this process read: a later segment skips what is painted, so a painting's check of unread options
    // counts an option as read if any of its segments read it
    fs.writeFileSync(path.join(out, `aware-options-read-${process.pid}.json`), JSON.stringify([...OPTS_READ]));
    console.log('aware: saved for a revised plan; exit 75');
    process.exit(75);
  }
};
let L_START = 0;
if (RESUMING) { const at = awareRestore(); L_START = at.kind === 'start' ? 0 : at.kind === 'pass' ? at.L + 1 : layers.length; }
else await awareBoundary({ kind: 'start' });
for (let L = L_START; L < (PRACTICE ? 0 : layers.length); L++) {
  if(L===FINISH_START){AREA_PLAN=FINISH_PLAN;AREA_COMPILED=FINISH_COMPILED;AREA_EXEC.set(null);if(FINISH_PLAN.doc.finishingBase){const b=FINISH_PLAN.doc.finishingBase;dry(sheet,b.maxSteps,O,{levelMax:140,dt:b.dt});const paper=measurePaper(sheet,Array.from({length:N2},(_,i)=>i));fs.writeFileSync(path.join(out,'finishing-dry-base.json'),JSON.stringify({kind:'actual declared whole base ordinarydry before connected finishing contacts',declared:b,paper},null,2));if(!paper.dry)throw Error('finishing connected pass requires measured dry base');}await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'finishing-base-before.png'));coherent(sheet);FINISH_MASS_BEFORE=thickness(sheet).map(a=>a.reduce((s,v)=>s+v,0));}
  const layer = layers[L];
  // --finishsnaps 1: the sheet as the finish begins (the planned ladder laid, before the touch-up rounds), for review
  if (layer._touch === 1 && num('finishsnaps', 0) > 0) { dry(sheet, 20000, O, { levelMax: 200 }); await sharp(render(), { raw: { width: W2, height: H2, channels: 3 } }).png().toFile(path.join(out, 'finish-start.png')); }
  if (layer._darks) { if (num('finishsnaps', 0) > 0) { dry(sheet, 20000, O, { levelMax: 200 }); await sharp(render(), { raw: { width: W2, height: H2, channels: 3 } }).png().toFile(path.join(out, 'finish-touched.png')); } const add = finalDarks(); if (add.length) layers.splice(L + 1, 0, ...add); continue; }
  if (layer._touch) { if (!PASS_LATE_DONE) { PASS_LATE_DONE = true; await PASSAGE_HOOK.run("washes"); } const add = touchCorrections(layer._touch); if (add.length) { layers.splice(L + 1, 0, ...add); if (layer._touch < TP_ROUNDS) layers.splice(L + 1 + add.length, 0, { _touch: layer._touch + 1, shapes: [], value: 0, pigment: 0 }); } continue; }
  if(AREA_PLAN)AREA_EXEC.set(layer._semantic);
  if (!PASS_LATE_DONE && ((num('bgfirst', 0) > 0 ? layer._order?.side !== 'ground' : layer._order?.phase !== 'ground') || L === layers.length - 1)) { PASS_LATE_DONE = true; await PASSAGE_HOOK.run('washes'); }
  colourMass('before-pass', {pass:L+1,value:layer.value,pigment:layer.pigment});
  // --darkmass: each of its steps runs when its share of the ladder has come
  if (DARK_MASS) await DARK_MASS.at(L / layers.length);
  if (opt('feedback', '1') !== '0') {
    if (FEEDBACK_LAG && FEEDBACK_BASE && !FEEDBACK_FRESH) {
      const { onsheet: B, booked: E } = FEEDBACK_BASE; ONSHEET = new Float32Array(B.length);
      for (let k = 0; k < B.length; k++) ONSHEET[k] = Math.max(0, B[k] + expected[k] - E[k]);
      feedbackStats.predicted++;
    } else {
    const th = thickness(sheet); ONSHEET = new Float32Array(n * PIGS.length);
    // at scale 1 a cell is its own block: the sum is the value (it adds to zero, and divides by one)
    if (SC === 1) { const P = PIGS.length; for (let j = 0; j < P; j++) { const t = th[j]; for (let k = 0; k < N2; k++) ONSHEET[k * P + j] = t[k]; } }
    else for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) { const i = ((y / SC) | 0) * w + ((x / SC) | 0), k = y * W2 + x; for (let j = 0; j < PIGS.length; j++) ONSHEET[i * PIGS.length + j] += th[j][k] / (SC * SC); }
    feedbackStats.read++; FEEDBACK_FRESH = false;
    if (DELIVERY) { const P = PIGS.length, held = new Float64Array(P); for (let k = 0; k < n; k++) for (let j = 0; j < P; j++) held[j] += ONSHEET[k * P + j]; DELIVERY.observe(held); }
    if (FEEDBACK_LAG) FEEDBACK_BASE = { onsheet: ONSHEET.slice(), booked: expected.slice() };
    if (REMIX) REMIX.refresh(th.map(t => { const c = new Float32Array(n); for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) c[((y / SC) | 0) * w + ((x / SC) | 0)] += t[y * W2 + x] / (SC * SC); return c; }));
    }
  }
  // Each passage in the pass is charged for itself: one colour, loaded stronger or weaker as the passage asks.
  let shIdx = 0; const shQuarter = Math.max(1, Math.ceil(layer.shapes.length / 4));
  for (const sh of layer.shapes) {
  if(BUDGET && !BUDGET.target(sh)) continue;
  AREA_NUMERIC_SEQUENCE=AREA_PLAN&&validateProductionDetails(AREA_PLAN.doc)?.numericWashSequence&&sh._semantic?{key:sh._semantic.key,shapeKey:sh._semantic.key+'/layer-'+L+'/shape-'+layer.shapes.indexOf(sh),history:[]}:null;
  if (PROBE) {
    const m = sh.mask, cut = new Uint8Array(n); let area = 0;
    for (let i = 0; i < n; i++) if (m[i] && PROBE.m[i]) { cut[i] = 1; area++; }
    if (!area) continue;
    if (area !== sh.area) { sh.mask = cut; sh.area = area; sh._brushMask = null; }
  }
  if (FINISH) {
    const clipped = clipToFinish(sh.mask, FINISH, (layer.value - 1) / Math.max(1, steps - 1));
    if (!clipped.area) continue;
    sh.mask = clipped.mask; sh.area = clipped.area;
  }
  // --darkmass: the dark masses are left to their own steps
  if (DARK_MASS) {
    const kept = DARK_MASS.clip(sh.mask);
    if (!kept) { used['left to a dark mass'] = (used['left to a dark mass'] || 0) + 1; continue; }
    if (kept !== sh.mask) { sh.mask = kept.mask; sh.area = kept.area; }
  }
  // The passage as a field over the whole sheet, unpacked once. It is held as a label in its pass's own field, and
  // asking for it inside a loop would unpack it on every read.
  let MASK = sh.mask;
  const MB = sh._mbox = maskBox(MASK); // the loops below (and the ledger update that follows the pass) stay inside the passage's rows and columns
  if (process.env.FW_DUMP && L < num('dumppasses', 3)) { const g = Buffer.alloc(n), bm = brushMask(sh); for (let i = 0; i < n; i++) g[i] = MASK[i] ? 255 : bm[i] ? 128 : 0; fs.mkdirSync(process.env.FW_DUMP, { recursive: true }); await sharp(g, { raw: { width: w, height: h, channels: 1 } }).png().toFile(path.join(process.env.FW_DUMP, `L${L + 1}-v${layer.value}-p${layer.pigment}-s${layer.shapes.indexOf(sh)}.png`)); }
  let figureShare = 0;
  if (FIG_MASK) {
    let total = 0, subject = 0;
    for (let y = MB.y0; y <= MB.y1; y++) for (let x = MB.x0; x <= MB.x1; x++) {
      const i = y * w + x; if (MASK[i]) { total++; subject += FIG_MASK[i]; }
    }
    figureShare = subject / Math.max(1, total);
  }
  const FIGURE_SHAPE = FIG_MASK && figureShare >= num('figureshare', 0.25);
  const TRACE_MASS = opt('trace', '0') !== '0' ? thickness(sheet)[layer.pigment].reduce((a, v) => a + v, 0) : null;
  // what this passage asks for, read off the source inside it (techniqueOf, above)
  let T = techniqueOf(sh);
  if (num('masswet',0)>0 && MASS_BUDGET?.owns(MASK, MB)) T = { ...T, name: 'wet on wet', water: 0.88, wetMix: 0.85, bridge: 0.98, bridgeSoft: 3, intoWet: true, dryAfter: false, passes: 1 };
  // --gradedwet (default on under --gradedwash): a graded wash goes in wet on wet unless its passage was dragged.
  if (sh.graded && !sh._follow && opt('gradedwet', '1') !== '0' && T.name !== 'wet on wet' && T.name !== 'dry brush') T = { ...T, name: 'wet on wet', water: 0.88, wetMix: 0.85, bridge: 0.98, bridgeSoft: 3, intoWet: true, dryAfter: false, passes: 1 };
  // --subjlocal: the subject's local-colour first wash goes in wet on wet, so its regions blend at their borders
  if (sh._wow) T = { ...T, name: 'wet on wet', water: 0.88, wetMix: 0.85, bridge: 0.98, bridgeSoft: 3, intoWet: true, dryAfter: false, passes: 1 };
  // --firstwet 1: every first-value passage goes in wet on wet; later values keep their own technique. Default 0.
  if (num('firstwet', 0) > 0 && layer.value <= 1) T = { ...T, name: 'wet on wet', water: 0.88, wetMix: 0.85, bridge: 0.98, bridgeSoft: 3, intoWet: true, dryAfter: false, passes: 1 };
  // the broad first wash (--firstfloor) goes in wet on wet unless --firstwashwet 0: wet on dry at its pale strength it lands as dots
  const FIRSTWET = !sh._valuePlan && sh.firstWash && opt('firstwashwet', '1') !== '0';
  if (FIRSTWET) T = { ...T, name: 'wet on wet', water: 0.88, wetMix: 0.85, bridge: 0.98, bridgeSoft: 3, intoWet: true, dryAfter: false, passes: 1 };
  // --wetpolicy 1: wet in wet per passage: first wash, light values (--wetlight 0.2), or large soft blends (--wetbig 0.03 of the sheet).
  // Others go on dry paper; under --wetmin 0.004 never wet; a dry passage after wet ones waits for the dry. Replaces --prewet.
  if (WETPOL) {
    const thr = (layer.value - 1) / Math.max(1, steps - 1), area = sh.area ?? 0;
    const small = area < num('wetmin', 0.004) * n, big = area >= num('wetbig', 0.03) * n;
    // a passage mostly on the figure (over --wetsubject 0.25 of its cells in the fw subject mask) never goes wet
    let onSubject = 0;
    if (FW_SUBJ) { const b = sh.box; let c = 0, s = 0; if (b) { for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) { const i = y * w + x; if (MASK[i]) { c++; s += FW_SUBJ[i] > 0.5 ? 1 : 0; } } } else { for (let i = 0; i < n; i++) if (MASK[i]) { c++; s += FW_SUBJ[i] > 0.5 ? 1 : 0; } } onSubject = c ? s / c : 0; }
    const wet = !small && onSubject <= num('wetsubject', 0.25) && (layer.value <= 1 || thr <= num('wetlight', 0.2) || !!(sh.graded && !sh._follow) || (big && T.name === 'wet on wet'));
    if (wet) T = { ...T, name: 'wet on wet', water: 0.88, wetMix: 0.85, bridge: 0.98, bridgeSoft: 3, intoWet: true, dryAfter: false, passes: 1 };
    else if (T.name === 'wet on wet') T = { ...T, name: 'wet on dry', water: 0.62, wetMix: 0.55, bridge: 0.78, bridgeSoft: 2.2, intoWet: false, dryAfter: true };
    if (!wet && WETPOL_WET) clock('dry', () => dry(sheet, 20000, O, { levelMax: 200 }));
    WETPOL_WET = wet;
    WETPOL_COUNT[wet ? 'wet' : 'dry']++;
  }
  // --nowow: a probe switch; wet on wet laid as wet on dry, to see what the standing water does to a sheet's lights
  if (opt('nowow', '0') !== '0' && T.name === 'wet on wet') T = { ...T, name: 'wet on dry', water: 0.62, wetMix: 0.55, bridge: 0.78, bridgeSoft: 2.2, intoWet: false, dryAfter: true };
  // --nowowpart prewet|dry|load: one factor of --nowow alone; the name stays wet on wet, so CAL[T.name] is unchanged.
  { const part = opt('nowowpart', ''); if (part && T.name === 'wet on wet') T = part === 'prewet' ? { ...T, intoWet: false } : part === 'dry' ? { ...T, dryAfter: true } : part === 'load' ? { ...T, water: 0.62, wetMix: 0.55, bridge: 0.78, bridgeSoft: 2.2 } : T; }
  // A hard figure shape must not inherit a wet-in-wet classification from the
  // source's texture. Keep the broad opening wash soft; subsequent shapes dry.
  if (FIGURE_SHAPE && !sh.firstWash && num('figuredry', 1) > 0 && T.intoWet)
    T = { ...T, name: 'wet on dry', water: 0.62, wetMix: 0.55, bridge: 0.78, bridgeSoft: 2.2, intoWet: false, dryAfter: true };
  if(sh._semantic){requireAuthoredCalibration(sh._semantic,SEMANTIC_CAL_MODE,SEMANTIC_CAL);T=semanticTechnique(sh._semantic,T);if(T.intoWet===false&&sh._semantic.pass.move!=='wet-edge continuation')clock('dry',()=>dry(sheet,30000,O,{levelMax:140,dt:2}));}
  T=chooseMajorBaseWash(MAJOR_INTENT,T,{value:layer.value,area:sh.area??0,cells:n,semantic:Boolean(sh._semantic)});
  T=connectedSkyContact(MAJOR_INTENT,T,{pass:L+1,area:sh.area??0,cells:n});
  if(sh._valuePlan){T=valueTechnique(sh._valuePlan);VALUE_ACTIVE=sh._valuePlan;VALUE_OWN_CONTACT=new Set();const inSession=WASH_SESSION>0&&WASH_LAST&&(WASH_LAST.L===L||(WASH_SESSION>1&&sameWash(WASH_LAST.layer,layer)));WASH_LAST={L,layer};if(!T.intoWet&&!inSession){clock('dry',()=>dry(sheet,30000,O,{levelMax:140,dt:2}));const base=measurePaper(sheet,Array.from({length:N2},(_,i)=>i));fs.appendFileSync(path.join(out,'value-commands.jsonl'),JSON.stringify({kind:'dry-base',intent:VALUE_ACTIVE.id,paper:base})+'\n');if(!base.dry)throw Error('target-value pass needs fully dry base');}}
  if(BUDGET) T={...T, name:'wet on dry',passes:1,intoWet:false,dryAfter:true,water:.62,wetMix:.55,bridge:.78,bridgeSoft:2.2};
  sh.dryAfter = T.dryAfter;
  MAJOR_TECHNIQUE=MAJOR_INTENT?{...T,shapeId:'numeric-L'+L+'-S'+layer.shapes.indexOf(sh),numericalValue:layer.value,shapeArea:sh.area,firstWash:Boolean(sh.firstWash),materialStatus:'existing production technique/profile consumed; actual contact/state recorded before each stroke'}:null;
  // --dryeach 1: dry the sheet before every passage not meant to go into wet, so each shape keeps a hard edge. Default 0.
  if (num('dryeach', 0) > 0 && !T.intoWet) clock('dry', () => dry(sheet, 20000, O, { levelMax: num('dryeachlevel', 200) }));
  // --figurelayers (--figuredry 0 turns only this off): the same dry for passages with --figureshare of their cells on the figure.
  else if (FIGURE_SHAPE && num('figuredry', 1) > 0 && !T.intoWet)
    clock('dry', () => dry(sheet, 20000, O, { levelMax: num('dryeachlevel', 200) }));
  // One shape-level look per passage (TARGET_GUARD.look) gives plan and sheet means; the charge comes from their difference.
  // SHAPE_LOAD spreads that one number over the shape for path planners that take a field; it steers nothing.
  const colourMix = COLOUR_BUDGET && PUDDLES ? sh.mix.map(v=>v/Math.max(1e-9,sh.amount)) : layer.mixv;
  const LEDGER = ONSHEET ?? expected;
  const LOOK_REF = colourMix ? LOOK_PLAN : LOOK_AL;
  const LOOK = TARGET_GUARD.look('passage', `L${L + 1}/s${shIdx}`, MASK, { box: { ...MB, w }, ref: [LOOK_REF], sheet: { ledger: { arr: LEDGER, stride: PIGS.length }, booked: { arr: expected, stride: PIGS.length } } });
  const SHAPE_LACK = LOOK ? shapeDeficit(LOOK.ref[LOOK_REF], LOOK.sheet.ledger, { mix: colourMix, pigment: layer.pigment }) : sh.amount;
  const SHAPE_LOAD = new Float32Array(n);
  for (let y = MB.y0; y <= MB.y1; y++) for (let i = y * w + MB.x0, e = y * w + MB.x1; i <= e; i++) if (MASK[i]) SHAPE_LOAD[i] = SHAPE_LACK;
  // --detailtrim: in the detail region the glaze keeps only the cells that still want it (detail-passes.mjs)
  if (DETAIL_REGION && !layer._detail && !sh.graded) { const t = trimPassage(MASK, SHAPE_LOAD, sh.amount, DETAIL_REGION, n, num('detailtrim', 0)); if (t) { let a = 0; for (let i = 0; i < n; i++) a += t[i]; if (!a) continue; sh.mask = t; sh.area = a; MASK = t; for (let i = 0; i < n; i++) if (!t[i]) SHAPE_LOAD[i] = 0; } }
  // under --feedback the passage is charged for what the shape still lacks, against what the plan asked of this pass,
  // both as shape means: from none when the sheet already holds the shape's amount, up to twice when it holds far less.
  // A shape too small to squint at (the look returns null) is charged its planned amount.
  if (ONSHEET && sh._fb == null) sh._fb = LOOK ? shapeCharge(SHAPE_LACK, shapeDeficit(LOOK.ref[LOOK_REF], LOOK.sheet.booked, { mix: colourMix, pigment: layer.pigment })) : 1;
  // --skipheld f: skip a broad passage the sheet already holds (feedback charge under f). Default 0.
  // --skipheldmin: least share of the sheet for a passage to be skipped (default 0.02); small features are always laid.
  if (ONSHEET && num('skipheld', 0) > 0 && (sh._fb ?? 1) < num('skipheld', 0) && sh.area >= num('skipheldmin', 0.02) * n) { used['held, skipped'] = (used['held, skipped'] || 0) + 1; continue; }
  // --ladderseg: a glaze mostly on the ground is left to the washes (src/paint/methods/ladder-seg.mjs)
  if (leftToTheWashes({ fg: SEG_FG, mask: MASK, n, share: num('ladderseg', 0) })) { used['ground, left to the washes'] = (used['ground, left to the washes'] || 0) + 1; continue; }
  // a glaze mostly on a segment that has its own passage is left to the passage, whatever --ladderseg says
  if (PASSAGE_HOOK.owns(MASK)) { used['left to a passage'] = (used['left to a passage'] || 0) + 1; continue; }
  // --ladderkeepout 1: a glaze that straddles a passage's segment is laid only off it. Default 0.
  // --keepoutreach r: widen the segment by r cells first. Default 0.
  // --keepoutfrom v: glazes at ladder value v or below are not cut and go under the passage as a ground wash. Default 0.
  const NOKEEP = num('keepoutfrom', 0) > 0 && layer.value <= num('keepoutfrom', 0);
  if (PASSAGE_HOOK.names.length && (num('ladderkeepout', 0) > 0 || PASSAGE_HOOK.exact) && !NOKEEP) {
    const OWN = keepoutMask();
    let cut = 0, left = 0; for (let i = 0; i < n; i++) if (MASK[i]) { if (OWN[i]) cut++; else left++; }
    if (cut && left < num('keepoutmin', 4)) { used['left to a passage'] = (used['left to a passage'] || 0) + 1; continue; }
    if (cut) {
      sh.mask = Uint8Array.from(MASK, (v, i) => (v && !OWN[i] ? 1 : 0)); sh.area = left; sh._brushMask = null; MASK = sh.mask; used['kept off a passage'] = (used['kept off a passage'] || 0) + 1;
      // --keeprecharge 1|2: once cut, recharge from the plan over the kept cells: 1 amount only, 2 amount and colour. Default 0.
      // Both are read as shape means through a look, never cell by cell.
      const KR = Math.round(num('keeprecharge', 0));
      const KLOOK = KR > 0 && sh.mix && !sh.graded ? TARGET_GUARD.look('passage', `L${L + 1}/s${shIdx}/kept`, MASK, { ref: [LOOK_PLAN], sheet: { ledger: { arr: LEDGER, stride: PIGS.length } } }) : null;
      if (KLOOK) {
        const K = PIGS.length, o = shapeOwedColour(KLOOK.ref[LOOK_PLAN], KLOOK.sheet.ledger);
        let S = 0; for (let j = 0; j < K; j++) S += o[j];
        const cm = sh.mix.map(v => v / Math.max(1e-9, sh.amount));
        let amount, mixv;
        if (KR === 1) { let d = 0, nn = 0; for (let j = 0; j < K; j++) { d += o[j] * cm[j]; nn += cm[j] * cm[j]; } amount = Math.min(sh.amount, d / Math.max(1e-9, nn)); mixv = cm; }
        else { amount = Math.min(sh.amount, S); mixv = Array.from(o, v => v / Math.max(1e-9, S)); }
        sh.mix = mixv.map(v => v * amount); sh.amount = amount;
        const kept = shapeDeficit(KLOOK.ref[LOOK_PLAN], KLOOK.sheet.ledger, { mix: mixv });
        for (let i = 0; i < n; i++) SHAPE_LOAD[i] = MASK[i] ? kept : 0;
        used['recharged after the cut'] = (used['recharged after the cut'] || 0) + 1;
      }
    }
  }
  used[T.name] = (used[T.name] || 0) + 1;
  // the technique that last laid each cell, so coverage can be read per technique at the end
  { const id = (TECHS.includes(T.name) ? TECHS : TECHS.push(T.name) && TECHS).indexOf(T.name); for (let y = MB.y0; y <= MB.y1; y++) for (let i = y * w + MB.x0, e = y * w + MB.x1; i <= e; i++) if (MASK[i]) LAST[i] = id + 1; }
  // How far through the ladder this pass is, 0..1.
  // --touchbroad 1: a touch-up glaze (its pass numbered past the ladder's end) is laid as a mid-ladder glaze with the
  // floor brush, not as detail marks or rigger touches, which is what its pass number alone would make of it.
  // A final dark (--finaldarks) is laid as the ladder's last passes are, with the small floored brush, not as detail marks.
  const throughRaw = (layer.value - 1) / Math.max(1, steps - 1);
  const through = layer._darkPass ? Math.min(throughRaw, 0.95) : layer._touched && num('touchbroad', 0) > 0 ? Math.min(throughRaw, num('touchthrough', 0.5)) : throughRaw;
  // --detailfrom t: passes later than t of the ladder are laid as detail marks, not glazes. Default 2, never.
  const authoredPaths=sh._semantic?lowerAuthoredGestures(sh._semantic,{target:AREA_PLAN.doc.target,crop:AREA_PLAN.crop,width:W2,height:H2,sheetWidthMm:num('sheetmm', DEFAULT_SHEET_MM)*AREA_PLAN.doc.target.width/AREA_PLAN.crop[2]}):null;
  // --skylanes 1: a large plane that reads cool at one shape-level look (blue over red by 10+) is laid as overlapping wet lanes.
  const skyLaneRadius=sh2=>{if(!(num('skylanes',0)>0)||!sh2._valuePlan||sh2._valuePlan.texture)return 0;let a=0;for(let y=MB.y0;y<=MB.y1;y++)for(let i=y*w+MB.x0,e=y*w+MB.x1;i<=e;i++)if(MASK[i])a++;if(!(a>n*num('skylanemin',.015)))return 0;const lk=TARGET_GUARD.look('passage',`L${L + 1}/s${shIdx}/sky`,MASK,{box:{...MB,w},ref:['px']});return lk&&lk.ref.px[2]>lk.ref.px[0]+10?num('skylanemm',3)/(num('sheetmm', DEFAULT_SHEET_MM)/w):0;};
  // --texflow: texture density over a shape is one number from a 'texture' look; direction comes from the planned flow field
  const flowDark=sh._valuePlan?.texture&&num('texflow',0)>0?(()=>{const lk=TARGET_GUARD.look('texture',`L${L + 1}/s${shIdx}`,MASK,{box:{...MB,w},ref:['px']});if(!lk)return .5;const [r,g,b]=lk.ref.px;return Math.max(0,Math.min(1,1-(.2126*r+.7152*g+.0722*b)/250));})():1;
  // --strokeplan: the passage's strokes and their charge factors were planned before painting (stroke-plan.mjs)
  const PATH_FACTOR=new WeakMap(),strokePlanPaths=s=>s._strokePlan.paths.map((ps,k)=>{const q=ps.map(p=>({...p,x:p.x*SC,y:p.y*SC,r:p.r*SC}));PATH_FACTOR.set(q,s._strokePlan.factors[k]);return q;});
  const shapedPaths=BUDGET?budgetPaths(up(MASK),W2,H2,BUDGET.target(sh)):sh._valuePlan?.shaped?sh._strokePlan?strokePlanPaths(sh):(sh._valuePlan.brush?.paths?passageBrushPaths(sh._valuePlan.brush,SC):shapedPlanePaths(MASK,w,h,{scale:SC,texture:sh._valuePlan.texture,shortMm:num('texshort',0)>0?sh._valuePlan.resolution.mmPerCell:0,shortPress:num('texpress',.3),lanesR:skyLaneRadius(sh),laneStep:num('skylanestep',1.5),flowDark,box:MB})):null;
  let detail = !sh._valuePlan && !authoredPaths && through > num('detailfrom', 2);
  // A graded wash runs down its gradient and is not walked, so each few cells can be charged for where they are (--gradedwash).
  const gradedAngle = sh.graded && !sh._follow ? (sh._gradedAngle ?? null) : null;
  // --brushfloor R: smallest wash brush, R px at 1086 wide, until --floorfrom of the ladder (default 0.85). The sheet's clip holds the edge.
  // Under --physical, passes after --floorfrom may use the detail brush (rigger).
  // --detailfloor 1: under --physical the floor brush moves toward the detail brush by the share of cells with focus over --detailfocus.
  const FLOOR = (() => { const f = num('brushfloor', 0); if (layer._darkPass || authoredPaths || (f <= 0 && !PB) || detail) return 0; if (through > num('floorfrom', 0.85)) return PB ? Math.max(SC, PB.detailR) : 0; const base = Math.max(SC, PB ? PB.floorR : f * W2 / 1086); if (PB && FOCUS && num('detailfloor', 0) > 0) { const thr = num('detailfocus', 0.5); let a = 0, c = 0; for (let i = 0; i < n; i++) if (sh.mask[i]) { a++; if (FOCUS[i] > thr) c++; } const q = a ? c / a : 0; return Math.max(SC, base + (Math.max(SC, PB.detailR) - base) * q); } return base; })();
  const FLOORMASK = FLOOR ? up(brushMask(sh)) : null;
  let FLOOR_R = FLOOR;
  // under --strokebudget the passage gets its share of the strokes: the brush and the closing radius grow together
  // until its sweeps fit (stroke-budget.mjs)
  const floorPaths = rr => { const plan = prof('floor close', () => closeLocal(FLOORMASK, W2, H2, rr)); return prof('floor lanes', () => brushedWashPaths(plan, W2, H2, { pad: num('pad', 1.5) * SC, padShare: num('padshare', 0), minRadius: rr, minLength: 2 * rr, maxRadius: Math.max(rr, BRUSH), field: SHAPE_LOAD, seed: 17 + laid + SEED, overlap: num('overlap', 0.15), walk: opt('walk', '1') !== '0' && gradedAngle == null, outerDrift: num('outerdrift', 1.5) * SC, angle: gradedAngle })).map(pts => pts.map(p => ({ ...p, r: Math.max(rr, p.r) }))); };
  // a final dark goes on with a small round brush drawn through the accent itself, held to it by the clip below
  const darkPaths = layer._darkPass ? washPaths(up(MASK), W2, H2, { pad: 0.2 * SC, minRadius: 0.5 * SC, minLength: 2 * SC }).map(pts => pts.map(p => ({ ...p, r: Math.min(p.r, Math.max(SC, PB ? PB.detailR : SC)) }))) : null;
  const paths = shapedPaths ?? authoredPaths ?? darkPaths ?? clock('paths', () => FLOOR
    ? (() => { let rr = FLOOR, P = floorPaths(rr); const T = BUDGET ? BUDGET.target(sh) : Infinity; for (let it = 0; it < 7 && P.length > T && rr < 3 * BRUSH; it++) { rr *= 1.6; P = floorPaths(rr); } FLOOR_R = rr; return P; })()
    : (detail
    ? detailMarks(SHAPE_LOAD, w, h, { length: num('marklen', 11), spacing: num('markgap', 6), seed: 7 + laid + SEED, coverage: num('markcover', 0.3) })
        .map(m => m.map(p => ({ x: (p.x + 0.5) * SC, y: (p.y + 0.5) * SC, r: Math.max(SC * 0.6, num('markr', 1.6) * SC), p: 1 })))
    : brushedWashPaths(up(brushMask(sh)), W2, H2, { pad: num('pad', 1.5) * SC, padShare: num('padshare', 0), minRadius: SC, minLength: 3 * SC, maxRadius: layer._detail ? Math.max(SC, Math.round(num('detailbrush', 0.3) * BRUSH)) : BRUSH, field: SHAPE_LOAD, seed: 17 + laid + SEED, fallbackAngle: opt('handangle', '0') !== '0' ? handAngle(laid) : null, jitter: (handAngle(laid + 7919) - num('handmean', 0.35)) / num('handspread', 1.4) * num('handjitter', 0), overlap: num('overlap', 0.15), walk: opt('walk', '1') !== '0' && gradedAngle == null, outerDrift: num('outerdrift', 1.5) * SC, angle: gradedAngle })).slice());
  // --contain: the brush disc held inside its passage at every point (see containPaths). Rescued passages below get
  // the same treatment, since a small brush can overhang a narrow passage just as a mop overhangs a ragged one.
  const crispNow = CRISP.wants(T, detail);
  if (!BUDGET && !shapedPaths && !sh._semantic?.pass.edges.overlap && opt('contain', '1') !== '0' && !detail && paths.length && !crispNow && !FLOOR) {
    // --washfloor in: the main wash sweep is never narrowed below this on a 9-inch-wide sheet (wash.mjs).
    // --washfloorout 1: only outside the subject (--fwmask), where the broad washes are.
    const WF = num('washfloor', 0) * W2 / 9, WFOUT = num('washfloorout', 0) > 0 && FW_SUBJ ? up(FW_SUBJ) : null;
    const floorOpt = WF > 0 && WFOUT ? (x, y) => (WFOUT[Math.min(N2 - 1, Math.max(0, Math.floor(y) * W2 + Math.floor(x)))] ? 0 : WF) : WF;
    const held = containPaths(paths, distanceToZero(up(brushMask(sh)), W2, H2), W2, H2, { minRadius: 0.8 * SC, minLength: 2 * SC, slack: num('slack', 0.5) * SC, segments: FW, floor: floorOpt });
    paths.length = 0; paths.push(...held);
  }
  // --cutin 0|1: run a small brush along the inside of the passage's edge before filling it, as a painter cuts in. Default 1.
  if (!BUDGET && !layer._darkPass && !shapedPaths && !authoredPaths && !FLOOR && !MASS_BUDGET?.skipCutIn(MASK) && opt('cutin', '1') !== '0' && !detail && paths.length && (!crispNow || CRISP.cutIn())) {
    const M = up(brushMask(sh)), dist = distanceToZero(M, W2, H2), band = new Uint8Array(N2);
    // --cutbandin n: cut-in band inside the subject (--fwmask); --cutband (default 2) elsewhere.
    const CB = num('cutband', 2), CBIN = opt('cutbandin', '') !== '' && FW_SUBJ ? num('cutbandin', CB) : CB;
    // --cutfrac f: also cap the band at f of the passage's own width, so a wide brush cuts in round a sky, not a small rim. Default 0.
    const CF = num('cutfrac', 0); let CAP = Infinity;
    if (CF > 0) { let dmax = 0; for (let i = 0; i < N2; i++) if (M[i] && dist[i] > dmax) dmax = dist[i]; CAP = Math.max(SC, CF * 2 * dmax); }
    const SUBJ2 = CBIN !== CB ? up(FW_SUBJ) : null, bandAt = i => Math.min((SUBJ2 && SUBJ2[i] ? CBIN : CB) * SC, CAP);
    for (let i = 0; i < N2; i++) if (M[i] && dist[i] <= bandAt(i)) band[i] = 1;
    // --cuttrace 0|1: the small brush goes round the edge half the band in, not across the band in rows. Default 1.
    let raw = washPaths(band, W2, H2, { pad: 0, minRadius: 0.5 * SC, minLength: 2 * SC });
    if (opt('cuttrace', '1') !== '0') {
      const halfAt = i => Math.max(1, bandAt(i) / 2), cell = q => Math.min(N2 - 1, Math.max(0, Math.round(q.y) * W2 + Math.round(q.x)));
      const inner = Uint8Array.from(dist, (v, i) => (M[i] && v >= halfAt(i) ? 1 : 0));
      const rings = traceOutlines(inner, W2, H2, { minLength: 3 * SC, step: Math.max(1, SC) }).map(c => c.points.map(q => ({ x: q.x + 0.5, y: q.y + 0.5, r: SUBJ2 ? halfAt(cell(q)) : halfAt(0), p: 1 })));
      if (rings.length) raw = rings;
    }
    const edge = containPaths(raw, dist, W2, H2, { minRadius: 0.6 * SC, minLength: 2 * SC, slack: 0.2 * SC, segments: FW });
    paths.push(...edge);
    used['cut in'] = (used['cut in'] || 0) + edge.length;
  }
  // A passage too narrow for a wash sweep gets a small brush rather than being skipped: the plan booked it as delivered.
  // under --touchbroad a touch-up glaze too small for a sweep of the floor brush is not laid at all: a single dab of a
  // corrective charge lands as a blot, which is worse than the small shortfall it was meant to fix
  // under --touchbroad a touch-up glaze too small for a sweep of the floor brush goes on as a final dark does: a small
  // round brush drawn through the shape, clipped to it. A single dab of a corrective charge would land as a blot.
  let touchSmall = false;
  if (!paths.length && layer._touched && !layer._darkPass && num('touchbroad', 0) > 0) {
    paths.push(...washPaths(up(MASK), W2, H2, { pad: 0.2 * SC, minRadius: 0.5 * SC, minLength: 2 * SC }).map(pts => pts.map(p => ({ ...p, r: Math.min(p.r, Math.max(SC, PB ? PB.detailR : SC)) }))));
    if (!paths.length) { used['touch-up too small, left'] = (used['touch-up too small, left'] || 0) + 1; continue; }
    touchSmall = true; used['touch-up small brush'] = (used['touch-up small brush'] || 0) + 1;
  }
  if (!paths.length) {
    // --rescue sweep: a round brush as wide as the passage, drawn down its middle, instead of small marks (default marks).
    // Under --brushfloor a passage too small for a sweep is one clipped touch of the floor brush across its middle.
    // --floordabskip also applies to that span touch; skipped cells are held out of the booking (sh._skip).
    const floorSkip = () => { const minC = num('floordabskip', 0) * Math.PI * FLOOR * FLOOR; if (!(minC > 0)) return null; const lab = new Uint8Array(N2), q = new Int32Array(N2), skip = new Uint8Array(N2); let any = 0; for (let s = 0; s < N2; s++) { if (!FLOORMASK[s] || lab[s]) continue; let qh = 0, qt = 0; q[qt++] = s; lab[s] = 1; while (qh < qt) { const i = q[qh++], x = i % W2, y = (i / W2) | 0; for (const j of [x > 0 ? i - 1 : -1, x < W2 - 1 ? i + 1 : -1, y > 0 ? i - W2 : -1, y < H2 - 1 ? i + W2 : -1]) if (j >= 0 && FLOORMASK[j] && !lab[j]) { lab[j] = 1; q[qt++] = j; } } if (qt < minC) { for (let k = 0; k < qt; k++) skip[q[k]] = 1; any = 1; } } if (!any) return null; const cs = new Uint8Array(n); for (let i = 0; i < N2; i++) if (skip[i]) cs[((((i / W2) | 0) / SC) | 0) * w + (((i % W2) / SC) | 0)] = 1; sh._skip = cs; return skip; };
    const FSKIP = FLOOR ? floorSkip() : null;
    const floorDab = () => { let sx = 0, sy = 0, c = 0, x0 = W2, x1 = 0; for (let i = 0; i < N2; i++) if (FLOORMASK[i] && !(FSKIP && FSKIP[i])) { const x = i % W2; sx += x; sy += (i / W2) | 0; c++; if (x < x0) x0 = x; if (x > x1) x1 = x; } if (!c) return []; const cx = sx / c + 0.5, cy = sy / c + 0.5, hw = Math.max(1, (x1 - x0) / 2); return [[{ x: cx - hw, y: cy, r: FLOOR, p: 1 }, { x: cx, y: cy, r: FLOOR, p: 1 }, { x: cx + hw, y: cy, r: FLOOR, p: 1 }]]; };
    // --floordab span|parts|axis: span (default) is one touch across the passage's width at its centroid row.
    // parts touches each connected fragment across its own middle (largest --floordabmax, default 24); axis along its principal axis.
    const floorDabParts = axis => { const lab = new Int32Array(N2).fill(-1), parts = [], q = new Int32Array(N2); for (let s = 0; s < N2; s++) { if (!FLOORMASK[s] || lab[s] >= 0) continue; let qh = 0, qt = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, c = 0, x0 = W2, x1 = 0; q[qt++] = s; lab[s] = parts.length; while (qh < qt) { const i = q[qh++], x = i % W2, y = (i / W2) | 0; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; c++; if (x < x0) x0 = x; if (x > x1) x1 = x; for (const j of [x > 0 ? i - 1 : -1, x < W2 - 1 ? i + 1 : -1, y > 0 ? i - W2 : -1, y < H2 - 1 ? i + W2 : -1]) if (j >= 0 && FLOORMASK[j] && lab[j] < 0) { lab[j] = parts.length; q[qt++] = j; } } const mx = sx / c, my = sy / c, cxx = sxx / c - mx * mx, cyy = syy / c - my * my, cxy = sxy / c - mx * my, th = 0.5 * Math.atan2(2 * cxy, cxx - cyy), l1 = (cxx + cyy) / 2 + Math.sqrt(((cxx - cyy) / 2) ** 2 + cxy * cxy), l2 = Math.max(0, (cxx + cyy) - l1); parts.push({ c, cx: mx + 0.5, cy: my + 0.5, width: Math.sqrt(12 * l2), ...(axis ? { dx: Math.cos(th), dy: Math.sin(th), hw: Math.max(1, Math.sqrt(3 * Math.max(0, l1))) } : { dx: 1, dy: 0, hw: Math.max(1, (x1 - x0) / 2) }) }); } const minW = num('floordabminw', 0), minC = num('floordabskip', 0) * Math.PI * FLOOR * FLOOR; return parts.filter(p => !(minW > 0 && p.width < minW && p.hw > 2 * minW) && !(minC > 0 && p.c < minC)).sort((a, b) => b.c - a.c).slice(0, num('floordabmax', 24)).map(p => [{ x: p.cx - p.dx * p.hw, y: p.cy - p.dy * p.hw, r: FLOOR, p: 1 }, { x: p.cx, y: p.cy, r: FLOOR, p: 1 }, { x: p.cx + p.dx * p.hw, y: p.cy + p.dy * p.hw, r: FLOOR, p: 1 }]); };
    // --floordabminw w: a fragment thinner than w cells and longer than twice that gets no touch of its own. Default 0.
    // --floordabskip f: a fragment smaller than f of the floor brush's footprint gets no touch. Default 0.
    const DABMODE = layer._darkPass ? 'parts' : opt('floordab', 'span');
    const rescued = FLOOR ? (DABMODE === 'parts' || DABMODE === 'axis' ? floorDabParts(DABMODE === 'axis') : floorDab()) : opt('rescue', 'marks') === 'sweep'
      ? washPaths(up(MASK), W2, H2, { pad: 0.2 * SC, minRadius: 0.5 * SC, minLength: 2 * SC })
      : detailMarks(SHAPE_LOAD, w, h, { length: num('marklen', 9), spacing: 2, seed: 7 + laid + SEED, coverage: 0.9, minWant: 0.005 })
        .map(m => m.map(p => ({ x: (p.x + 0.5) * SC, y: (p.y + 0.5) * SC, r: Math.max(SC * 0.5, SC), p: 1 })));
    if (!rescued.length) { dropped++; droppedMass += sh.amount * sh.area; if (FSKIP) sh._booked = true; continue; }
    paths.push(...rescued);
    used[FLOOR ? 'floor dab' : 'small brush'] = (used[FLOOR ? 'floor dab' : 'small brush'] || 0) + rescued.length;
    if (!FLOOR) detail = true;
  }
  // under --crisp the bead stops at the passage's own edge, for the clean water and the paint alike
  if (process.env.FW_DUMP && L < num('dumppasses', 3)) { const g = Buffer.alloc(N2); for (const pts of paths) for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[Math.min(pts.length - 1, k + 1)], m = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y))); for (let t = 0; t <= m; t++) { const x = Math.round(a.x + (b.x - a.x) * t / m), y = Math.round(a.y + (b.y - a.y) * t / m); if (x >= 0 && y >= 0 && x < W2 && y < H2) g[y * W2 + x] = Math.hypot(b.x - a.x, b.y - a.y) > 6 * SC ? 128 : 255; } } await sharp(g, { raw: { width: W2, height: H2, channels: 1 } }).png().toFile(path.join(process.env.FW_DUMP, `P${L + 1}-s${layer.shapes.indexOf(sh)}.png`)); }
  const crispHere = !!BUDGET || !!shapedPaths || semanticUsesNumericClip(sh._semantic) && CRISP.on && CRISP.wants(T, detail);
  // --washreach: a planned stroke may end past the outline, so the clip is the passage grown by the reach, still off
  // the plan's reserved lights; the edge is where the strokes end, not the mask
  if (touchSmall) setClip(sheet, up(dilate(MASK, w, h, 1)));
  if (layer._darkPass) { setClip(sheet, up(dilate(MASK, w, h, 1))); used['final dark'] = (used['final dark'] || 0) + paths.length; }
  if (crispHere) { setClip(sheet, up(sh._strokePlan?.reachCells > 0 ? (() => { const g = dilate(brushMask(sh), w, h, Math.ceil(sh._strokePlan.reachCells * 0.8) + 1), P = VALUE_PLAN?.protectedCells; return P ? Uint8Array.from(g, (v, i) => (v && !P[i] ? 1 : 0)) : g; })() : brushMask(sh))); used['crisp edge'] = (used['crisp edge'] || 0) + 1; }
  // under --brushfloor the clip is the passage closed by --clipclose (default 1.5) floor radii, joined with the probe's,
  // so pinholes inside a passage do not become paper holes. The outer edge is not moved.
  if (!BUDGET && !shapedPaths && FLOOR && !touchSmall && semanticUsesNumericClip(sh._semantic)) { const cr = num('clipclose', 1.5) * FLOOR, reach = MASSP ? edgeReach(sh, num) * FLOOR : 0, cm0 = prof('clip close', () => closeLocal(FLOORMASK, W2, H2, cr)), cm = reach >= 1 ? dilate(cm0, W2, H2, reach) : cm0; const c0 = PROBE ? Uint8Array.from(cm, (v, i) => v & PROBE.clip[i]) : cm;
    // under --ladderkeepout the clip is also held off the passages' cells, so closing does not reach back into them
    const KO = (num('ladderkeepout', 0) > 0 || PASSAGE_HOOK.exact) && PASSAGE_HOOK.names.length && !NOKEEP ? keepoutMask() : null;
    // --keepsmooth s: cut the keep-out smooth at the sheet's grid, as --foliagesmooth does the seal
    const KO2 = KO && SC > 1 && num('keepsmooth', 0) > 0 ? (PASSAGE_HOOK._ko2 ??= smoothUp(KO, w, h, SC, num('keepsmooth', 0), gaussian)) : null;
    const c = KO2 ? Uint8Array.from(c0, (v, i) => (v && !KO2[i] ? 1 : 0)) : KO ? Uint8Array.from(c0, (v, i) => (v && !KO[((((i / W2) | 0) / SC) | 0) * w + (((i % W2) / SC) | 0)] ? 1 : 0)) : c0;
    setClip(sheet, c); used['floored brush'] = (used['floored brush'] || 0) + 1; }
  if (detail) used[T.name === 'dry brush' ? 'dry brush marks (detail)' : 'detail marks'] = (used[T.name === 'dry brush' ? 'dry brush marks (detail)' : 'detail marks'] || 0) + paths.length;
  // wet on wet means the paper is wet when the paint arrives: clean water first, over the same shape.
  // --prewet 1: dampen a passage laid in more than --prewetlanes lanes first, so lanes do not dry into rims. Default 0.
  // --splwet: optional dampening for stroke lanes. A value plan controls its own wet/dry technique;
  // do not silently prewet its dry-base glazes. Explicit --splwet 1 still prepares a connected wet bed.
  if (!BUDGET && !sh._semantic&&(T.intoWet || (!WETPOL && (opt('prewet', '0') !== '0' || (sh._strokePlan && num('splwet', sh._valuePlan ? 0 : 1) > 0)) && !detail && paths.length > num('prewetlanes', 1)))) {
    // --gradedprewet s: a graded wash's clean water reaches s of the short side past it onto equally pale paper. Default 0.03.
    const reach = sh.graded && !sh._follow ? Math.round(num('gradedprewet', 0.03) * Math.min(w, h)) : 0;
    // --prewetinset k: wet the shape shrunk by k cells at 540 px, not its paths, so its edge lands on dry paper. Default 0.
    // --prewetwater: the water brush's load (default 1). The first wash under --firstwet is wetted over its whole shape.
    const INSET = WETPOL || (num('firstwet', 0) > 0 && layer.value <= 1) || (sh.firstWash && opt('firstwashwet', '1') !== '0') ? 0 : num('prewetinset', 0), insetCells = INSET > 0 ? Math.max(1, Math.round(INSET * w / 540)) : 0;
    const wetOver = reach > 0
      ? (() => { const M = up(sh._prewet ?? MASK); return containPaths(brushedWashPaths(M, W2, H2, { pad: 1.5 * SC, minRadius: SC, minLength: 3 * SC, maxRadius: BRUSH, seed: 17 + laid + SEED, overlap: num('overlap', 0.15), walk: false, angle: gradedAngle }), distanceToZero(M, W2, H2), W2, H2, { minRadius: 0.8 * SC, minLength: 2 * SC, slack: num('slack', 0.5) * SC, segments: FW }); })()
      : insetCells > 0
        ? (() => { const M = up(erode(MASK, w, h, insetCells)); if (!M.some(v => v)) return []; return containPaths(brushedWashPaths(M, W2, H2, { pad: 0, minRadius: SC, minLength: 3 * SC, maxRadius: BRUSH, seed: 17 + laid + SEED, overlap: num('overlap', 0.15), walk: false, angle: gradedAngle }), distanceToZero(M, W2, H2), W2, H2, { minRadius: 0.8 * SC, minLength: 2 * SC, slack: 0, segments: FW }); })()
        : paths;
    for (let pts of wetOver) {
      if(sh._semantic&&!authoredPaths)pts=pts.map(p=>({...p,r:sh._semantic.pass.brush.widthMm/(2*(num('sheetmm', DEFAULT_SHEET_MM)/W2))}));
      const r = !BUDGET&&sh._valuePlan?.brush?.sizeMm?sh._valuePlan.brush.sizeMm/(2*(num('sheetmm', DEFAULT_SHEET_MM)/W2)):sh._semantic?sh._semantic.pass.brush.widthMm/(2*(num('sheetmm', DEFAULT_SHEET_MM)/W2)):Math.max(SC, Math.max(...pts.map(p => p.r)));
      const wet = createBrush({ flat: sh._semantic?sh._semantic.pass.brush.kind==='flat':true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, seed: 900 + laid + SEED, ...(sh._semantic?semanticBrushOptions(sh._semantic.pass,num('sheetmm', DEFAULT_SHEET_MM)/W2):{}) });
      productionDip(wet, { water: num('prewetwater', 1), conc: PIGS.map(() => 0) });
      stroke(wet, sheet, pts, { upright: UPRIGHT });
    }
  }
  // how many of this graded wash's sweeps lie over each cell, so each is charged for its share (sweepCount)
  const SHARE = num('gradedshare', 0.6), UNDER = sh.graded && !detail && SHARE > 0 ? sweepCount(paths, W2, H2) : null;
  for (let pts of paths) {
    if(sh._semantic&&!authoredPaths)pts=pts.map(p=>({...p,r:sh._semantic.pass.brush.widthMm/(2*(num('sheetmm', DEFAULT_SHEET_MM)/W2))}));
    const r = !BUDGET&&sh._valuePlan?.brush?.sizeMm?sh._valuePlan.brush.sizeMm/(2*(num('sheetmm', DEFAULT_SHEET_MM)/W2)):sh._semantic?sh._semantic.pass.brush.widthMm/(2*(num('sheetmm', DEFAULT_SHEET_MM)/W2)):(r0 => (PB && FLOOR ? PB.half(PB.pick(r0)) : r0))(Math.max(SC, Math.max(...pts.map(p => p.r))));
    let CHARGE_CAL=SEMANTIC_CAL_MODE==='actual'&&sh._semantic?semanticCalibrationGain(SEMANTIC_CAL[sh._semantic.key],pts,PB.mmPerCell):(CAL[T.name]??1);
    const numericTuftHere=numericTuftEligible({shapeId:MAJOR_TECHNIQUE?.shapeId,selected:NUMERIC_TUFT_SHAPES,detail,dry:T.name.startsWith('dry brush'),semantic:Boolean(sh._semantic),radiusMm:r*num('sheetmm', DEFAULT_SHEET_MM)/W2});
    const brush = detail
      ? createBrush({ grainShift: num('grainshift', 0), radius: r, bristles: Math.max(8, Math.ceil(r * 3)), capacity: 26, belly: 2, feed: 0.08,
          give: 0.7, free: 0.4, film: 0.22, splay: 0.06, stiffness: 5, wetMix: T.intoWet ? 0.6 : 0.15 * num('drymix', 1),
          bridge: washBridge(T, Math.min(T.bridge, 0.55)), bridgeSoft: 1.2, streak: 0.5, seed: 31 + laid + SEED, ...meteredOpts(r, T) })
      : createBrush({ grainShift: num('grainshift', 0),
          flat: sh._valuePlan?.brush?.shape?sh._valuePlan.brush.shape==='flat':numericTuftHere?false:(sh._semantic?sh._semantic.pass.brush.kind==='flat':true), ...(numericTuftHere?{model:'tuft'}:{}), radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4,
          // --washfree f: the wash brush's free-liquid threshold, also on the scrap; lower lets a light load still give water. Default 0.4.
          give: 0.9, free: num('washfree', 0.4), film: 0.25, splay: 0.03, stiffness: 8, wetMix: MIX(T),
          // --washbridgesoft k: the wash's liquid stops over a wider band of tooth (bridgeSoft x k), grading deep pits in. Default 1.
          bridge: washBridge(T, T.bridge * num('washbridgek', 1)), bridgeSoft: T.bridgeSoft * num('washbridgesoft', 1), seed: 31 + laid + SEED,
          // --washstreak s: hair-clump streaking along a stroke (default 0.35); --washbreakup b: how fast an emptying film breaks (1.5).
          // --washbridgek k: how far the wash's liquid reaches into the tooth; below 1 the paper sparkles through. Default 1.
          ...meteredOpts(r, T), ...(sh._semantic?semanticBrushOptions(sh._semantic.pass,num('sheetmm', DEFAULT_SHEET_MM)/W2):{}),
          ...(opt('washstreak', '') !== '' ? { streak: num('washstreak', 0.35) } : {}),
          ...(opt('washbreakup', '') !== '' ? { breakup: num('washbreakup', 1.5) } : {}),
        });
    // The first value goes on light (--opening, default 0.55) and is booked so. A graded wash carries all its values and is not lightened.
    const opening = (layer.value <= 1 && !(sh.graded && !sh._follow) ? (sh._opening ?? num('opening', 0.55)) : 1) * (sh._tint ?? 1);
    const PF = PATH_FACTOR.get(pts) ?? 1; // --strokeplan: this stroke's planned charge factor
    // A passage laid in overlapping lanes is charged for the overlap, once per passage: see sweepCover. Detail marks
    // leave paper between them on purpose and are not divided.
    if (sh._cover == null) sh._cover = detail || opt('cover', '0') === '0' ? 1 : Math.pow(Math.max(1, sweepCover(paths, up(MASK), W2, H2)), num('coverpow', 1));
    // --undercover 0|1: raise the charge by area over brush footprint, floored at --underfloor (default 0.4), so the planned mass arrives. Default 1.
    if (sh._under == null) sh._under = detail || opt('undercover', '1') === '0' ? 1 : 1 / Math.max(num('underfloor', 0.4), Math.min(1, sweepCover(paths, up(MASK), W2, H2)));
    sh.laidShare = opening;
    // see GRADED_CAL: the whole scrap's delivery, less what runs past this passage's own open edge (in sheet cells)
    if (sh.graded && sh._gcal == null) {
      const G = GRADED_CAL[`${T.name} graded`];
      sh._open = openEdgeShare(MASK, w, h) / SC;
      const lost = G ? Math.min(0.6, G.escape * sh._open / Math.max(1e-6, G.edge)) : 0;
      sh._gcal = G ? 1 / Math.max(0.02, G.all * (1 - lost)) : CHARGE_CAL;
    }
    // --trace: one line per passage, to see where a shape's paint goes
    if (opt('trace', '0') !== '0') { let area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0; for (let i = 0; i < n; i++) if (MASK[i]) { area++; const x = i % w, y = (i / w) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } console.log(`trace pass ${L + 1} value ${layer.value} pig ${layer.pigment} ${T.name} area ${area} box ${x0},${y0}-${x1},${y1} amount ${sh.amount.toFixed(3)} paths ${paths.length} cover ${sweepCover(paths, up(MASK), W2, H2).toFixed(2)} fb ${(sh._fb ?? 1).toFixed(2)} under ${sh._under.toFixed(2)}${sh.graded ? ` graded over ${sh.merged + 1} values, angle ${gradedAngle == null ? '-' : (gradedAngle * 180 / Math.PI).toFixed(0)}, open edge ${sh._open.toFixed(3)}, charged ${sh._gcal.toFixed(2)}x` : ''}`); }
    if(COLOUR_TRACE && pts===paths[0] && traceCells.some(i=>MASK[i])) colourTrace.push({stage:'charge',pass:L+1,pigment:layer.pigment,value:layer.value,amount:sh.amount,mix:sh.mix,opening,feedback:sh._fb??1,calibration:CHARGE_CAL,under:sh._under,cover:sh._cover,paths:paths.length,technique:T.name});
    // A sweep lands, bears down through its body and lifts; the paper shows where the touch is lightest.
    const total = pts.reduce((a, p, i) => a + (i ? Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0) || 1;
    let run = 0;
    let shaped = pts.map((p, i) => {
      if (i) run += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
      const u = run / total;
      const land = Math.min(1, u / num('land', 0.06)), lift = Math.min(1, (1 - u) / num('lift', 0.10));
      const body = 0.72 + 0.28 * Math.sin(Math.PI * u);          // heaviest through the middle of the sweep
      // Pressure is even apart from the sweep's own taper: it never follows a per-cell gap to the target.
      return { ...p, p: Math.max(0.18, Math.min(1, body * Math.min(land, lift))) };
    });
    if(authoredPaths||shapedPaths)shaped=pts;else if(sh._semantic)shaped=semanticGesture(sh._semantic.pass,shaped,num('sheetmm', DEFAULT_SHEET_MM)/W2);
    const supportedCharge=gesturePoints=>!AREA_NUMERIC_CONTACT_STOP&&(!AREA_NUMERIC_SEQUENCE||productionChargeSupported({predict:()=>candidateContact(brush,sheet,gesturePoints,{upright:sh._semantic.pass.brush.orientation==='sweep'?'sweep':sh._semantic.pass.brush.orientation==='follow'?false:true,neighborRadius:0}),record:event=>fs.appendFileSync(path.join(out,'semantic-commands.jsonl'),JSON.stringify({kind:event.status==='not-executed'?'production-numeric-contact-omitted':'production-numeric-contact-support',areaId:sh._semantic.area.id,passId:sh._semantic.key,shapeKey:AREA_NUMERIC_SEQUENCE.shapeKey,geometry:gesturePoints,clipApplied:!!sheet.clip,...event})+'\n')}));
    if(!supportedCharge(shaped))continue;
    const numericTuftLoads=numericTuftHere&&PB?splitLoads(shaped,PB.loadCells(PB.pick(r),T.name)):null;
    if(numericTuftHere){
      const key=JSON.stringify({shapeId:MAJOR_TECHNIQUE.shapeId,r,water:WET(T),passes:T.passes,wetMix:MIX(T)});
      if(!NUMERIC_TUFT_CAL.has(key)){
        const profile=Object.fromEntries(['radius','capacity','give','feed','wetness','flat','belly','free','film','breakup','bridge','bridgeSoft','bridgeStreak','fine','streak','streakLength','coarse','splay','stiffness','wetMix','model','lag','loadWater','depositDepth'].map(k=>[k,brush[k]]));Object.assign(profile,{bristles:brush.hairs.length,seed:31+laid+SEED,grainShift:num('grainshift',0)});
        const refs=numericTuftLoads??[shaped],length=pts=>pts.reduce((v,p,i)=>v+(i?Math.hypot(p.x-pts[i-1].x,p.y-pts[i-1].y):0),0),reference=refs.reduce((a,b)=>length(a)>length(b)?a:b);
        const proof=calibrateNumericTuft({profile,points:reference,water:WET(T),passes:T.passes,paperOptions:PAPER_OPTS,mmPerCell:num('sheetmm', DEFAULT_SHEET_MM)/W2,pigments:PIGS,physics:O,upright:UPRIGHT,strength:num('strength',2.2),flowEvery:flowEvery(paths.length)});NUMERIC_TUFT_CAL.set(key,proof);fs.appendFileSync(path.join(out,'numeric-tuft-calibration.jsonl'),JSON.stringify({shapeId:MAJOR_TECHNIQUE.shapeId,...proof})+'\n');
      }
      CHARGE_CAL=NUMERIC_TUFT_CAL.get(key).gain;fs.appendFileSync(path.join(out,'numeric-tuft-consumed.jsonl'),JSON.stringify({shapeId:MAJOR_TECHNIQUE.shapeId,radius:r,calibration:CHARGE_CAL,water:WET(T),passes:T.passes,originalGeometry:true,profile:semanticBrushObservation(brush)})+'\n');
    }

    productionDip(brush, { water: detail ? Math.min(T.water, num('detailwater', 0.3)) : WET(T), conc: sh.mix.map((v, j) => v * DCAL(sh, j) * num('strength', 2.2) * CHARGE_CAL * opening * PF / sh._cover * sh._under * (sh._fb ?? 1) * (detail ? num('detailstrength', 2.0) : 1)) });
    const cadence=nativeBodyCadence({mode:NATIVE_PAINT_MODE.mode,enabled:Boolean(FAST_BODY_ENABLED),detail,instructionBound:!!sh._semantic,technique:T.name,radiusCells:r,mmPerCell:num('sheetmm', DEFAULT_SHEET_MM)/W2,every:flowEvery(paths.length),spacing:FAST_BODY_SPACING});
    if(cadence.approximated)BODY_CADENCE_RECORD.sourceSweepsSelected++;
    const every=cadence.every;
    const numericalStroke=(b,target,points,options)=>{
      BODY_CADENCE_RECORD.numericalCallsAttempted++;
      if(cadence.approximated)BODY_CADENCE_RECORD.approximatedCallsAttempted++;
      const result=stroke(b,target,points,{...options,spacing:cadence.spacing});
      if(cadence.approximated)BODY_CADENCE_RECORD.approximatedCallsReturned++;
      return result;
    };
    // --graded c: recharge every c cells along a sweep at the strength the passage wants there, normalised to a mean of one. Default 0.
    // A graded wash (--gradedwash) is always charged this way from its own graded amount, not normalised per sweep.
    const gradedLen = BUDGET || authoredPaths || (PB && !detail) ? 0 : (sh.graded ? (GFLOOR ? GCHUNK / SC : num('gradedchunk', 6)) : num('graded', 0)) * SC;
    // --physical: the path is cut where the brush's released water runs out (brushes.mjs splitLoads) and each load is a
    // stroke of its own, dipped afresh; a graded wash is graded by the puddle's dilution between loads (the mean of its
    // graded amount under each load), not by recharging every few cells
    const LOADS = !authoredPaths && !BUDGET && PB && !detail ? (num('loadfeather',0)>0&&shapedPaths?(a,b)=>splitLoadsFeathered(a,b,num('loadfeather',0)*r):splitLoads)(shaped, PB.loadCells(sh._valuePlan?.brush?.name??PB.pick(r), T.name) * (METERED_BRUSH && !T.name.startsWith('dry brush') ? BRUSH_LOAD * WET(T) : 1)) : null;
    if (LOADS && (LOADS.length > 1 || sh.graded || MOD?.paintOwnedTransfer)) {
      // One amount per shape: every load of a passage is charged the passage's amount, never per-cell amounts under it.
      const F = null, chargeField=sh._paintOwnedCharge, componentField=sh._paintOwnedComponentCharge, lo = 0, hi = 8;
      const readField=i=>(F?F[i]:sh.amount)+(chargeField?.get(i)??0);
      // --followfootprint 1: load from the brush's whole footprint inside the shape, not its center, so narrow shapes are not pale. Default 0.
      const footprint = Boolean(chargeField)||sh._follow && num('followfootprint', 0) > 0;
      const readLoad = q => {
        const sx = Math.min(w - 1, Math.max(0, Math.round(q.x / SC))), sy = Math.min(h - 1, Math.max(0, Math.round(q.y / SC)));
        if (!footprint) return readField(sy*w+sx);
        const radius = Math.max(0.5, q.r ?? r), stride = Math.max(1, radius / 4);
        let sum = 0, count = 0;
        for (let dy = -radius; dy <= radius; dy += stride) for (let dx = -radius; dx <= radius; dx += stride) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const x = Math.round((q.x + dx) / SC), y = Math.round((q.y + dy) / SC);
          if (x < 0 || x >= w || y < 0 || y >= h) continue;
          const i = y * w + x;
          if (MASK[i]) { sum += readField(i); count++; }
        }
        return count ? sum / count : (MASK[sy * w + sx] ? readField(sy*w+sx) : sh.amount);
      };
      const f = LOADS.map(ch => { if (!F&&!chargeField) return 1; let a = 0; for (const q of ch) a += readLoad(q); return Math.max(lo, Math.min(hi, a / ch.length / Math.max(1e-4, sh.amount))); });
      const base = sh.mix.map((v, j) => v * DCAL(sh, j) * num('strength', 2.2) * (sh.graded ? sh._gcal : CHARGE_CAL) * opening * PF / sh._cover * sh._under * (sh._fb ?? 1));
      const extra=LOADS.map((ch,k)=>{
        if(!chargeField&&!componentField)return {factor:1};
        const contact=candidateContact(brush,{...sheet,clip:null},ch,{upright:UPRIGHT,spacing:cadence.spacing});
        const cells=[...new Set(contact.cells.filter(i=>contact.primaryMask[i]&&(!sheet.clip||sheet.clip[i])&&!(sheet.resist?.[i]===1&&(sheet.resistStrength?.[i]??1)===1)).map(i=>Math.floor((i/W2|0)/SC)*w+Math.floor(i%W2/SC)))];
        const support=cells.filter(i=>(chargeField??componentField).has(i));
        if(componentField)return {...ownedComponentLoad({cells,field:componentField,mix:sh.mix,baseFactor:f[k]}),fitPigmentChannels:MOD.geometryAw.length/n,allocationStatus:'own-component residual through existing mixed load; not delivered credit'};
        return {factor:f[k],supportCells:support.length,allocatedChargeOnPrimary:support.reduce((v,i)=>v+chargeField.get(i),0),fitPigmentChannels:MOD.geometryAw.length/n,allocationStatus:'original shape-local charge through existing calibrated load; not delivered credit'};
      });
      if(extra.some(q=>q.factor>1))fs.appendFileSync(path.join(out,'paint-owned-loads.jsonl'),JSON.stringify({shapeId:MAJOR_TECHNIQUE?.shapeId,kind:'existing path/load concentration allocation; not pigment delivery or ledger credit',input:opt('modpaintplanes',''),requestedWater:WET(T),calibratedBaseConcentration:base,existingPasses:T.passes,loads:extra})+'\n');
      let st = 0;
      clock('strokes', () => { for (let pass = 0; pass < T.passes; pass++) LOADS.forEach((ch, k) => { if(!supportedCharge(ch))return; brush._paintOwnedLoad=extra[k];productionDip(brush, { water: WET(T), conc: base.map((v,j) => v * (extra[k].componentFactors?.[j]??f[k])) }); numericalStroke(brush, sheet, ch, { upright: UPRIGHT, flowEvery: every, gpuBetween: true, between: () => { if (++st % every === 0) clock('flow', () => step(sheet, O)); } }); }); });
    } else if (gradedLen > 0 && !detail && (sh.graded ? shaped.length > 1 : shaped.length > gradedLen * 2)) {
      const chunks = [];
      for (let k = 0; k < shaped.length; k += Math.max(2, Math.round(gradedLen))) chunks.push(shaped.slice(Math.max(0, k - 1), k + Math.round(gradedLen) + 1));
      // One amount per shape: the chunks carry the passage's amount, not a per-cell field.
      const f = chunks.map(() => 1), mean = 1;
      const base = sh.mix.map((v, j) => v * DCAL(sh, j) * num('strength', 2.2) * (sh.graded ? sh._gcal : CHARGE_CAL) * opening * PF / sh._cover * sh._under * (sh._fb ?? 1));
      // The water moves on the sweep's clock, counted across its chunks, so the sheet flows while a chunked sweep is laid.
      let st = 0;
      clock('strokes', () => { for (let pass = 0; pass < T.passes; pass++) chunks.forEach((ch, k) => { if(!supportedCharge(ch))return; productionDip(brush, { water: WET(T), conc: base.map(v => v * f[k] / mean) }); numericalStroke(brush, sheet, ch, { upright: UPRIGHT, flowEvery: every, gpuBetween: true, lift: !GFLOOR || k === chunks.length - 1, between: () => { if (++st % every === 0) clock('flow', () => step(sheet, O)); } }); }); });
    } else
    clock('strokes', () => { for (let pass = 0; pass < T.passes; pass++) numericalStroke(brush, sheet, shaped, { upright: UPRIGHT, flowEvery: every, gpuBetween: true, between: s => { if (s % every === 0) clock('flow', () => step(sheet, O)); } }); });
    if(AREA_NUMERIC_CONTACT_STOP){
      const {pixels,...contactRecord}=AREA_NUMERIC_CONTACT_STOP;
      await sharp(pixels,{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'numeric-first-contact-immediate.png'));
      dry(sheet,30000,O,{levelMax:140,dt:2});
      await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'numeric-first-contact-ordinary-dried.png'));
      fs.writeFileSync(path.join(out,'numeric-first-contact-checkpoint.json'),JSON.stringify({...contactRecord,kind:'one actual numeric pigment command then recorded ordinary dry; NOT completed area/pass',ordinaryDryCommandId:AREA_EXEC.records.at(-1)?.id,paper:measurePaper(sheet,contactRecord.primaryCells),backend:GPU_INFO,remainingNumericAndModulation:'NOT EXECUTED'},null,2));
      await drainFrames();if(FRAMER)FRAMER.close();sheet._gpu?.close();console.log('numeric first actual contact checkpoint; not completed pass or artistic acceptance');process.exit(0);
    }
    laid++;
    // --filmby paint: a frame each time the planned mass laid crosses the next equal share of the plan's; each sweep
    // of the passage is booked an equal part of the passage's mass
    if (FILM_BY_PAINT) {
      // Authored passes have no numerical-mask mass budget. Count actual completed
      // gestures for playback; zero fitted mass must never create an infinite loop.
      const filmTotal = AUTHORED_INPUT ? AREA_COMPILED.diagnostics.authoredPaintGestures : plannedMass;
      filmLaid += AUTHORED_INPUT ? 1 : (FILM_MASS.get(sh) ?? 0) / Math.max(1, paths.length);
      if (filmTotal > 0 && filmLaid >= filmTotal * filmNext / FILM_FRAMES) {
        while (filmNext <= FILM_FRAMES && filmLaid >= filmTotal * filmNext / FILM_FRAMES) filmNext++;
        STAGE = { stage: 'paint', step: `value ${layer.value} of ${steps}`, pass: L + 1, of: layers.length, value: layer.value, of_values: steps, pigment: layer.mixIndex ?? layer.pigment, laying: true };
        await shoot();
      }
    }
    // --order painter: a broad light passage (the ground's regions, the subject's first wash) is filmed as it goes on,
    // --ordersplit frames across its sweeps, so a first wash of one pale passage is not one frame. Only the film moves.
    if (FILM_BY_PAINT && layer._order && (layer._order.phase === 'ground' || layer._order.phase === 'subject') && sh.area >= num('ordersplitmin', 0.03) * n) {
      const q = (sh._swept = (sh._swept ?? 0) + 1), k = Math.max(1, Math.ceil(paths.length / Math.max(1, num('ordersplit', 4))));
      if (q % k === 0 && q < paths.length) { STAGE = { stage: 'paint', step: `value ${layer.value} of ${steps}`, pass: L + 1, of: layers.length, value: layer.value, of_values: steps, pigment: layer.mixIndex ?? layer.pigment, order: layer._order.phase, laying: true }; await shoot(); }
    }
    // --wetframes: a filmed pass is also caught while its passages go down, a quarter at a time
    if (WETFRAMES > 0 && L % WETFRAMES === 0 && ++shIdx % shQuarter === 0) snap({ stage: 'wash', pass: L + 1, of: layers.length, value: layer.value, wet: 'laying' });
    // --passframes: a frame every N passages, so playback shows strokes going on, not whole pigment layers at once.
    else if (PASSFRAMES > 0 && ++shIdx % PASSFRAMES === 0) snap({ stage: 'wash', pass: L + 1, of: layers.length, value: layer.value, laying: true });
  }
  if(FINISH_PLAN&&L===FINISH_START){await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'finishing-glaze-deposition-immediate.png'));coherent(sheet);const after=thickness(sheet).map(a=>a.reduce((s,v)=>s+v,0)),commands=AREA_EXEC.records.filter(r=>r.operation==='physical brush stroke'&&r.status==='executed'),command=commands.at(-1);fs.writeFileSync(path.join(out,'finishing-dose-proof.json'),JSON.stringify({kind:'actual all-sheet pigment inventory delta over one finishing pass; per-contact brush loss separately logged',areaId:command?.areaId,passId:command?.passId,commandId:command?.id,commandIds:commands.map(r=>r.id),gestureIds:commands.map(r=>r.geometry?.[0]?.gestureId??null),paperBeforeByContact:commands.map(r=>r.paper),primaryCellsByContact:commands.map(r=>r.primaryCells?.length??0),primaryCells:command?.primaryCells?.length,requestedDepth:sh.amount,requestedMass:sh.amount*commands.reduce((s,r)=>s+(r.primaryCells?.length??0),0),beforePigmentMass:FINISH_MASS_BEFORE,afterPigmentMass:after,depositedPigmentMass:after.map((v,j)=>v-FINISH_MASS_BEFORE[j]),paperBefore:command?.paper,limit:'all-sheet conserved pigment delta, not percell depth/value/coverage proof; ordinary transport remains active'},null,2));}
  if (crispHere || FLOOR || layer._darkPass || touchSmall) setClip(sheet, PROBE ? PROBE.clip : null);
  if(!BUDGET&&!sh._valuePlan?.texture&&sh._valuePlan?.edges.softCells.length&&paths.length){
    const softSplit=num('softsplit',0)>0,hardNear=softSplit?(()=>{const near=new Set(),R=Math.ceil(num('softmm',.35)/(num('sheetmm', DEFAULT_SHEET_MM)/w))+1;for(const i of sh._valuePlan.edges.hardCells){const x=i%w,y=(i/w)|0;for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<w&&yy*w+xx<n)near.add(yy*w+xx);}}return near;})():null;
    // softsplit: a turning edge is softened up to, not across, the nearby hard edges: the arc is cut
    // where it comes within one brush radius of a hard boundary instead of being dropped whole.
    const splitArcs=arcs=>arcs.flatMap(a=>{const out=[];let cur=[];for(const q of a){if(hardNear.has(Math.floor(q.y)*w+Math.floor(q.x))){if(cur.length>=3)out.push(cur);cur=[];}else cur.push(q);}if(cur.length>=3)out.push(cur);return out;});
    const allArcs0=softBoundaryPaths(sh._valuePlan.edges.softCells,w,n),allArcs=softSplit?splitArcs(allArcs0):allArcs0,arcs=shapedPaths?allArcs.sort((a,b)=>b.length-a.length).slice(0,num('softarcs',1)).map(a=>a.slice(0,num('softarclen',16))):allArcs,hard=new Set(sh._valuePlan.edges.hardCells),radius=Math.max(.5,num('softmm',.35)/(num('sheetmm', DEFAULT_SHEET_MM)/W2));let executedArcs=0,omittedHardOverlap=0;
    for(const arc of arcs){const points=arc.map(q=>({x:q.x*SC,y:q.y*SC,r:radius,p:.45}));const clean=createBrush({flat:false,radius,bristles:12,capacity:24,belly:3,feed:.25,give:.9,free:.4,film:.25,stiffness:6,seed:SEED+laid});const footprint=candidateContact(clean,sheet,points,{upright:false,lift:true});if(footprint.cells.some(i=>hard.has(Math.floor((i/W2|0)/SC)*w+Math.floor((i%W2)/SC)))){omittedHardOverlap++;continue;}dip(clean,{water:.48,conc:SHEET_PIGS.map(()=>0)});stroke(clean,sheet,points,{upright:false,lift:true});executedArcs++;}
    fs.appendFileSync(path.join(out,'value-commands.jsonl'),JSON.stringify({kind:'selected-edge-softening',intent:sh._valuePlan.id,plannedArcs:arcs.length,executedArcs,omittedHardOverlap,radiusMm:radius*num('sheetmm', DEFAULT_SHEET_MM)/W2,operation:'actual clean damp physical brush; hard-edge overlap predicted and skipped; no optical blur'})+'\n');
  }
  // --firstwash: the opening wash's edge taken out into clear water while it is wet
  if (FW && sh._fwSoften && !detail && paths.length && num('fwsoften', 0.6) > 0 && sh.area >= num('fwsoftmin', 0.002) * n) {
    let inSubject = 0; if (FW_SUBJ) { let a = 0; for (let i = 0; i < n; i++) if (MASK[i]) { a++; inSubject += FW_SUBJ[i]; } inSubject = inSubject * 2 > a ? 1 : 0; }
    clock('flow', () => softenFirstWash({ sheet, mask2: up(MASK), W2, H2, SC, light: highlights, subject: FW_SUBJ, inSubject, w, softArcs, soften, O, share: num('fwsoften', 0.6), radius: num('fwsoftr', 0.012) * Math.min(W2, H2), seed: 17 + laid + SEED }));
  }
  // --trace: also what the passage put on the sheet of its pigment against its booking.
  if (opt('trace', '0') !== '0' && TRACE_MASS != null) {
    const th = thickness(sheet)[layer.pigment]; let now = 0; for (let i = 0; i < N2; i++) now += th[i];
    let booked = 0; for (let i = 0; i < n; i++) if (MASK[i] && !(sh._skip && sh._skip[i])) booked += sh.amount * (sh.laidShare ?? 1);
    console.log(`trace pass ${L + 1} laid ${((now - TRACE_MASS) / Math.max(1e-6, booked * SC * SC)).toFixed(2)} of its booked mass${sh.graded ? ' (graded)' : ''}`);
  }
  // --texture 1: a pass of short dry-brush texture marks. Default 0; --washgrain alone does not enable it.
  // Off by default: many tiny random marks do not read as dry brush; texture comes from paper, settling and chosen passages.
  const WASHGRAIN = num('washgrain', 0);
  if (opt('texture', '0') !== '0' && !detail && paths.length && (through >= num('texfrom', 0.35) || WASHGRAIN > 0)) {
    const tex = new Float32Array(n), vals = []; let sum = 0, cnt = 0;
    // --washgrain g: a grain floor that does not thin with the wash; below --washgrainmin (default 0.3) it grains at that depth.
    const floor = WASHGRAIN * Math.max(sh.amount, num('washgrainmin', 0.3));
    for (let i = 0; i < n; i++) if (MASK[i]) { tex[i] = (through >= num('texfrom', 0.35) ? HP[i] : 0) + floor; sum += tex[i]; cnt++; if (tex[i] > 0) vals.push(tex[i]); }
    const meanHP = cnt ? sum / cnt : 0;
    if (meanHP > num('texmin', 0.03)) {
      const side = Math.min(w, h);
      // --fur: flicks along the way the hair lies, root to tip, thinning as the brush lifts (src/crop/fur.mjs), in place
      // of marks centred on a cell at an even pressure
      const FUR = opt('fur', '0') !== '0';
      const marks = FUR
        ? furMarks(tex, FUR_FIELD(), w, h, { length: Math.max(5, Math.round(num('furlen', 0.035) * side)), spacing: Math.max(2, Math.round(num('furgap', 0.006) * side)), seed: 400 + laid + SEED, coverage: num('furcover', 0.35), minWant: meanHP * 0.8 })
        : detailMarks(tex, w, h, { length: Math.max(4, Math.round(num('texlen', 0.02) * side)), spacing: Math.max(2, Math.round(num('texgap', 0.008) * side)), seed: 400 + laid + SEED, coverage: num('texcover', 0.45), minWant: meanHP * 0.8 });
      vals.sort((a, b) => b - a); const peak = Math.max(1e-4, vals[Math.min(vals.length - 1, Math.max(0, cnt / 20 | 0))] ?? 1e-4);
      const colour = sh.mix.map(v => v / Math.max(1e-4, sh.amount));
      for (const m of marks) {
        const pts = m.map(q => ({ x: (q.x + 0.5) * SC, y: (q.y + 0.5) * SC, r: num('texr', 1.1) * SC, p: q.p != null ? q.p * Math.min(1, 0.5 + q.want / peak) : Math.min(1, 0.3 + q.want / peak) }));
        const dryb = createBrush({ radius: num('texr', 1.1) * SC, bristles: 10, capacity: 20, belly: 2, feed: 0.06, give: 0.6, free: 0.3, film: 0.2, splay: 0.08, stiffness: 5, wetMix: 0, bridge: 0.38, bridgeSoft: 1.0, streak: 0.6, seed: 700 + laid + SEED });
        const tone = m.reduce((a, q) => a + q.want, 0) / m.length;
        dip(dryb, { water: 0.22, conc: colour.map(c => c * tone * num('strength', 2.2) * (CAL['dry brush'] ?? 1) * num('texstrength', 1.3)) });
        // the dry brush faces along its mark too (--texheading sheet keeps it facing down the sheet)
        clock('strokes', () => stroke(dryb, sheet, pts, { upright: opt('texheading', 'sweep') === 'sheet' ? true : UPRIGHT }));
        // --texbook 1: book the texture into the plan, so later glazes lay less. Default 0.
        if (opt('texbook', '0') !== '0') for (const q of m) { const i = Math.round(q.y) * w + Math.round(q.x); for (let j = 0; j < PIGS.length; j++) expected[i * PIGS.length + j] += colour[j] * q.want; }
      }
      // Diagnostic count only: physical deposition alone does not validate the gesture or its appearance.
      used['dry brush marks (texture)'] = (used['dry brush marks (texture)'] || 0) + marks.length;
    }
  }
  if (opt('bookfollow', '0') !== '0') throw new Error('--bookfollow was removed with the per-cell follow pressure (anti-cheat rules)');
  }
  colourMass('after-brush', {pass:L+1});
  RECEIVER_OBSERVER?.beforeDry(L+1,sheet);
  if(MAJOR_INTENT&&opt('majorstop','')==='pass:'+(L+1))await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'major-pass-'+(L+1)+'-immediate.png'));
  if(MAJOR_INTENT?.baseWash&&L===0)await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'major-firstwash-immediate.png'));

  // a painter dries between values, not between every shape of one value
  const endOfValue = L === layers.length - 1 || layers[L + 1].value !== layer.value;
  // --washsession 2: the next pass is the same band of the same region in another pigment; it is charged into this
  // wash while it is wet, so the passage dries once.
  const sessionNext = WASH_SESSION > 1 && L < layers.length - 1 && sameWash(layer, layers[L + 1]);
  // A passage that asked to be dried is dried only enough to stop it running; the sheet dries fully at the end of a value.
  // --drypigment 1: dry fully before a pass in a different pigment, so colours do not mix wet on the paper. Default 0.
  // --order painter dries between pans too (--orderdry 0 stops it).
  const nextOther = L < layers.length - 1 && (layers[L + 1].mixIndex ?? layers[L + 1].pigment) !== (layer.mixIndex ?? layer.pigment) && (opt('drypigment', '0') !== '0' || (layer._order && opt('orderdry', '1') !== '0')) && !sessionNext;
  const filmed = WETFRAMES > 0 && L % WETFRAMES === 0, watch = filmed ? { steps: WET_STEPS, onStep: t => { if (WET_STEPS.has(t)) snap({ stage: 'wash', pass: L + 1, of: layers.length, value: layer.value, wet: t }); } } : {};
  // --drydt: drying step once the surface has levelled (default 14); --drylevel: the level cap (default 140).
  // --wetmix f: a pass its successor overlaps on --wetmixshare (default 0.25) of its area dries only to f of the cap, so colours mix.
  const nextLayer = L < layers.length - 1 ? layers[L + 1] : null;
  const overlapShare = () => {
    if (!nextLayer) return 0;
    const mine = new Uint8Array(n); let a = 0;
    for (const sh of layer.shapes) { const m = sh.mask; for (let i = 0; i < n; i++) if (m[i] && !mine[i]) { mine[i] = 1; a++; } }
    if (!a) return 0;
    let both = 0;
    // the next pass is not being painted yet: it lends its passages one at a time rather than unpacking all of them
    for (const sh of nextLayer.shapes) { const m = sh.mask; for (let i = 0; i < n; i++) if (m[i] && mine[i] === 1) { mine[i] = 2; both++; } dropMask(sh); }
    return both / a;
  };
  const wetInto = num('wetmix', 0) > 0 && endOfValue && nextLayer && overlapShare() >= num('wetmixshare', 0.25);
  const skyBoundary=MAJOR_INTENT?.connectedSky?.passes.includes(L+1)&&MAJOR_INTENT.connectedSky.passes.includes(L+2)?connectedSkyBoundary(MAJOR_INTENT,{pass:L+1,nextPass:L+2,area:layer.shapes.reduce((sum,sh)=>sum+sh.area,0),nextArea:nextLayer?.shapes.reduce((sum,sh)=>sum+sh.area,0)??0,cells:n,overlap:nextLayer?overlapShare():0}):null;
  const earlyBoundary=earlyDryBoundary({minValue:EARLY_DRY_VALUE,value:layer.value,fullBoundary:endOfValue||nextOther,leaveWet:!!skyBoundary||wetInto});
  if(earlyBoundary){const cells=Array.from({length:N2},(_,i)=>i),before=measurePaper(sheet,cells),capture=!EARLY_DRY_CAPTURED;if(capture)await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'early-dry-first-boundary-immediate.png'));const requested={levelMax:num('drylevel',140),dt:num('drydt',14),...watch};clock('dry',()=>dry(sheet,20000,O,requested));const after=measurePaper(sheet,cells);fs.appendFileSync(path.join(out,'early-dry-boundaries.jsonl'),JSON.stringify({pass:L+1,value:layer.value,nextPass:nextLayer?L+2:null,nextValue:nextLayer?.value??null,endOfValue,nextOther,before,after,requested,effective:nativeDryOptions(NATIVE_PAINT_MODE.mode,requested),changedOrder:['completed connected pass','ordinary physical dry','next original pass'],omittedBaselineIdleFlowSteps:num('settle',60),water:'unchanged original',pigment:'original prepared load and demand; delivered mass not inferred',actualDry:after.dry})+'\n');if(capture){await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'early-dry-first-boundary-dried.png'));EARLY_DRY_CAPTURED=true;}if(!after.dry)throw Error('early numeric boundary did not establish measured dry paper; no fallback');}
  else if(skyBoundary)fs.appendFileSync(path.join(out,'major-sky-schedule.jsonl'),JSON.stringify(skyBoundary)+'\n');
  // Fast: when an ordinary dry follows at once, its own slow (dt 1) level phase does the settling, held until the measured
  // surface is level; the idle steps before it only repeated that (--fastsettle sets how many remain, default 0)
  else{const dryFollows=NATIVE_PAINT_MODE.mode==='fast'&&!AREA_PLAN&&(wetInto||endOfValue||nextOther);const settle=dryFollows?Math.min(num('settle',60),num('fastsettle',0)):num('settle',60);clock('flow',()=>{for(let q=0;q<settle;q++)step(sheet,O);});}
  colourMass('after-flow',{pass:L+1});
  const planeOrdinaryBoundary=MAJOR_PLANE_CONTACT&&!AREA_PLAN&&!wetInto&&(endOfValue||nextOther||layer.shapes.some(sh=>sh.dryAfter));
  if(planeOrdinaryBoundary&&MAJOR_PLANE_CONTACT.depositionLayerCaptured==null){await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'paint-owned-plane-before-ordinary-dry.png'));MAJOR_PLANE_CONTACT.depositionLayerCaptured=L;}
  if(AREA_PLAN){if(!layer._semantic.pass.leaveWetAfter&&!['wet on wet','wet-edge continuation'].includes(layer._semantic.pass.move))clock('dry',()=>dry(sheet,30000,O,{levelMax:140,dt:2,...watch}));}
  else if (earlyBoundary) { /* Existing ordinary dry completed earlier, before idle flow. */ }
  else if (skyBoundary) { /* Connected original sky passage: no idle wait or interpan dry. */ }
  else if (sessionNext) { /* --washsession 2: one wet session with the next pigment of this wash */ }
  else if (wetInto) clock('dry', () => dry(sheet, 20000, O, { levelMax: Math.round(num('drylevel', 140) * num('wetmix', 0.35)), dt: num('drydt', 14), ...watch }));
  else if (endOfValue || nextOther) clock('dry', () => dry(sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14), ...watch }));
  else if (layer.shapes.some(sh => sh.dryAfter)) clock('dry', () => dry(sheet, 3000, O, { levelMax: 90, dt: 6, ...watch }));
  RECEIVER_OBSERVER?.ordinaryDry(L+1,sheet,{actualBoundary:!!(earlyBoundary||wetInto||endOfValue||nextOther||layer.shapes.some(sh=>sh.dryAfter)),endOfValue,nextOther,wetInto,earlyBoundary:!!earlyBoundary});
  if(planeOrdinaryBoundary){const paper=measurePaper(sheet,MAJOR_PLANE_CONTACT.primaryCells);if(paper.dry){await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'paint-owned-plane-ordinary-dried.png'));fs.writeFileSync(path.join(out,'paint-owned-plane-checkpoint.json'),JSON.stringify({...MAJOR_PLANE_CONTACT,ordinaryDryLayer:L,paper,backend:GPU_INFO,kind:'first admitted plane contact followed by EXISTING ordinary numeric dry boundary; not whole head/pass/art acceptance'},null,2));await drainFrames();if(FRAMER)FRAMER.close();sheet._gpu?.close();console.log('paint-owned plane actual ordinarydry checkpoint');process.exit(0);}}
  if (filmed && PREPF) fadePrep();
  if (filmed) await shoot();
  for (const sh of layer.shapes) {
    if (process.env.CHECKBOX && sh.mask && sh._mbox) { let out = 0; const b = sh._mbox; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (sh.mask[y * w + x] && (y < b.y0 || y > b.y1 || x < b.x0 || x > b.x1)) out++; if (out) console.log(`BOXCHECK ${out} mask cells outside the box (booked ${!!sh._booked})`); }
    if(sh._authoredDose){fs.appendFileSync(path.join(out,'semantic-commands.jsonl'),JSON.stringify({kind:'semantic-authored-demand',areaId:sh._semantic.area.id,passId:sh._semantic.key,expectedLedgerCredit:0,reason:'explicit dose is not full ownership-mask delivery'})+'\n');continue;}
    if (sh._booked) continue; const m = sh.mask, sk = sh._skip, mb = sh._mbox ?? FULLBOX, P = PIGS.length, share = sh.laidShare ?? 1, amt = Math.max(1e-6, sh.amount), gr = sh.graded, mix = sh.mix;
    for (let y = mb.y0; y <= mb.y1; y++) for (let i = y * w + mb.x0, e = y * w + mb.x1; i <= e; i++) if (m[i] && !(sk && sk[i])) {
      // one amount per shape: the ledger books what the brush was charged, the passage's amount in every cell
      void gr; void amt;
      for (let j = 0; j < P; j++) expected[i * P + j] += mix[j] * share;
      if (DELIVERY) for (let j = 0; j < P; j++) DELIVERY.book(j, mix[j] * share * (sh._fb ?? 1) * DCAL(sh, j));
    }
  }
  if(VALUE_PLAN){const next=layers[L+1];if(!next||next.value!==layer.value){VALUE_ACTIVE=null;fs.writeFileSync(path.join(out,'value-executed-counts.json'),JSON.stringify({scope:'all actual value-pass stroke calls and summed observed footprint contact cells; includes clean water and finite reloads',bands:VALUE_COUNTS,total:VALUE_COUNTS.reduce((a,b)=>({strokes:a.strokes+b.strokes,contacts:a.contacts+b.contacts}),{strokes:0,contacts:0})},null,2));await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'value-band-'+layer.value+'-dried.png'));}}
  // Nothing after a pass reads its passages again (the ledger holds what it laid), so its sheet-sized fields are freed.
  for (const sh of layer.shapes) { sh.mask = null; sh.graded = null; sh._prewet = null; sh._brushMask = null; sh.ids = null; }
  layer.mask = null; layer.ids = null;
  STAGE = { stage: 'paint', step: `value ${layer.value} of ${steps}`, pass: L + 1, of: layers.length, value: layer.value, of_values: steps, pigment: layer.mixIndex ?? layer.pigment, ...(layer._order ? { order: layer._order.phase } : {}), techniques: Object.fromEntries(Object.entries(used).filter(([k]) => ['wet on dry', 'wet on wet', 'glazed', 'dry brush', 'detail marks', 'small brush'].includes(k))) };
  if (!FRAME_POLICY.all) await shoot();
  if (FILM_BY_PAINT) {
    // the pass's whole booking, whether or not every passage found a path, so the shares stay on the plan's mass
    filmPass += layer.shapes.reduce((a, sh) => a + (FILM_MASS.get(sh) ?? 0), 0); filmLaid = filmPass;
    const filmTotal=AUTHORED_INPUT?AREA_COMPILED.diagnostics.authoredPaintGestures:plannedMass;
    if (filmTotal>0&&filmLaid >= filmTotal * filmNext / FILM_FRAMES - 1e-9) { while (filmNext<=FILM_FRAMES&&filmLaid >= filmTotal * filmNext / FILM_FRAMES - 1e-9) filmNext++; await shoot(); }
  }
  if(MAJOR_INTENT&&(L===0||L===Math.floor(layers.length/2))){const stage=L===0?'firstwash':'shadow';await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'major-'+stage+'.png'));if(opt('majorstop','')===stage){await drainFrames();if(FRAMER)FRAMER.close();sheet._gpu?.close();console.log('major checkpoint '+stage+'; not art acceptance');process.exit(0);}}
  if(MAJOR_INTENT&&opt('majorstop','')==='pass:'+(L+1)){RECEIVER_OBSERVER?.assertComplete();await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'major-pass-'+(L+1)+'-ordinary-dried.png'));fs.writeFileSync(path.join(out,'major-pass-checkpoint.json'),JSON.stringify({pass:L+1,value:layer.value,paper:measurePaper(sheet,Array.from({length:N2},(_,i)=>i)),backend:GPU_INFO,connectedSky:MAJOR_INTENT.connectedSky,kind:'same original full field through selected pass; no full painting acceptance'},null,2));await drainFrames();if(FRAMER)FRAMER.close();sheet._gpu?.close();process.exit(0);}
  if(AREA_PLAN){const next=layers[L+1]?._semantic;if(next?.key!==layer._semantic.key){const result=AREA_EXEC.complete(layer._semantic);if(result.paintCommands>0)AREA_COMPLETED.add(layer._semantic.key);if(!AREA_FILM_REMOVED&&sheet.resist&&semanticFilmRemovalReady(AREA_PLAN,AREA_COMPLETED)){const cells=Array.from(up(AREA_PLAN.film),(v,i)=>v?i:-1).filter(i=>i>=0);dry(sheet,30000,O,{levelMax:140,dt:2});const paper=measurePaper(sheet,cells);if(!paper.dry)throw Error('semantic mid-pass film requires dry paint before removal');AREA_EXEC.set(null);AREA_EXEC.command('physical film remove',{cells,paper,atCompletedPass:layer._semantic.key,areaPassIds:AREA_PLAN.schedule.filter(s=>s.pass.lights.mode==='film').map(s=>s.key),semanticPlanned:true,removalTiming:'actual authored prerequisites completed before following paint',revealedEdges:'inspect only; no automatic softening'},()=>liftResist(sheet));AREA_FILM_REMOVED=true;await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'semantic-film-revealed.png'));}fs.writeFileSync(path.join(out,'semantic-execution.json'),JSON.stringify({kind:'actual semantic area/pass checkpoint; not artistic acceptance',backend:GPU_INFO,target:AREA_PLAN.doc.target,view:AREA_PLAN.doc.view??null,planSHA256:sha256(path.resolve(root,AREA_FILE||FINISH_FILE)),coverage:AREA_COMPILED.diagnostics,completedPass:result,commands:AREA_EXEC.records},null,2));const stop=opt('areastop','');const lastArea=!layers.slice(L+1).some(q=>q._semantic.area.id===layer._semantic.area.id),stage=layer._semantic.pass.stage??layer._semantic.pass.id,lastStage=!layers.slice(L+1).some(q=>(q._semantic.pass.stage??q._semantic.pass.id)===stage);if(lastStage){const name=stage.replace(/[^a-zA-Z0-9_-]/g,'_');await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'semantic-stage-'+name+'.png'));}if(stop&&(stop===layer._semantic.key||(stop===layer._semantic.area.id&&lastArea)||(stop===`stage:${stage}`&&lastStage))){if(num('areastopdry',0)){await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'semantic-area-checkpoint-immediate.png'));dry(sheet,30000,O,{levelMax:140,dt:2});}await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'semantic-area-checkpoint.png'));await drainFrames();if(FRAMER)FRAMER.close();sheet._gpu?.close();console.log(`semantic checkpoint ${layer._semantic.key}; not whole painting acceptance`);process.exit(0);}}}
  if(num('treelayerslate',0)===1&&L===0){await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'production-first-numeric-layer.png'));fs.writeFileSync(path.join(out,'production-first-numeric-layer.json'),JSON.stringify({kind:'actual first completed numeric layer, not wholefirstwash or area completion',layer:L,value:layer.value,order:layer._order,backend:GPU_INFO},null,2));}
  // --order painter: a frame at the end of each ground region, so the first wash is seen going on region by region
  if (layer._order?.shoot && FILM_BY_PAINT) await shoot();
  // the plan-against-sheet record keeps the pass cadence whatever is filmed, so the log's numbers do not move
  if (L % Math.max(1, Math.round(layers.length / num('frames', 40))) === 0) {
    if (!FILM_BY_PAINT) await shoot();
    mark(L + 1);
    FEEDBACK_FRESH = true; // the mark's render waited for the GPU: the next pass reads the sheet at no extra wait
  }
  await awareBoundary({ kind: 'pass', L });
}
if (DELIVERY) { const hst = DELIVERY.history(); console.log(`delivery calibration: ${hst.length} reads; kept of charge ${JSON.stringify(hst.at(-1)?.kept ?? [])}; charge factors ${DELIVERY.factors().map(v => v.toFixed(2)).join(', ')}`); fs.writeFileSync(path.join(out, 'delivery-cal.json'), JSON.stringify({ kind: 'sheet against ledger, per pigment; no target reads', history: hst }, null, 1)); }
if (FEEDBACK_LAG) console.log(`feedback: ${feedbackStats.read} passes read the sheet, ${feedbackStats.predicted} predicted it from the last read and the ledger`);
if(AREA_PLAN)AREA_EXEC.set(null);
if(FINISH_PLAN){await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'finishing-glaze-immediate.png'));dry(sheet,30000,O,{levelMax:140,dt:2});await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'finishing-glaze-ordinary-dried.png'));AREA_PLAN=null;AREA_EXEC.set(null);}
colourMass('ladder-finished');
if (DARK_MASS) await DARK_MASS.at(1);
if (COLOUR_TRACE) await sharp(render(), {raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'colour-before-dry.png'));
// a painting taken over at the closing boundary has had everything up to the closing drawing (AWARE_SKIP_POST)
const AWARE_SKIP_POST = RESUME_AT?.kind === 'closing';
if (!AWARE_SKIP_POST) dry(sheet, 20000, O, { levelMax: 900 });
colourMass('dried');
if(!AWARE_SKIP_POST&&num('treelayerslate',0)===1){
 await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'broad-composition-before-treelayers.png'));
 fs.writeFileSync(path.join(out,'broad-composition-before-treelayers.json'),JSON.stringify({kind:'actual ordinary-dried numeric composition before deferred WHOLEtree passage; not final/art acceptance',completed:'numerical ladder including figure and non-tree masses',notYetExecuted:['treelayers foundation','treelayers wet/dry shadow tiers','latermodulation/accents/closingink'],target:opt('image'),width:W2,height:H2,backend:GPU_INFO,mode:NATIVE_PAINT_MODE,treeOwnership:'unchanged exact passage keepout; tree cells may still be paper',schedule:PASSAGE_HOOK.schedule},null,2));
 console.log('actual broad composition saved before treelayers');
 if(opt('treelayersstop','')==='before'){await drainFrames();if(FRAMER)FRAMER.close();sheet._gpu?.close();console.log('checkpoint before deferredtreelayers; not final');process.exit(0);}
 await PASSAGE_HOOK.run('after-broad');
}

if (COLOUR_TRACE) await sharp(render(), {raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'colour-after-dry.png'));
if(AREA_PLAN&&MOD&&validateProductionDetails(AREA_PLAN.doc))fs.writeFileSync(path.join(out,'semantic-production-details-before.json'),JSON.stringify({declaration:AREA_PLAN.doc.productionDetails,sampler:'existing production orientationField/furMarks/dryMarkPath/dryMarkBrush',calibration:CAL['wet on dry'],calibrationRole:'historical wet-on-dry gain retained; not matched dry-brush proof',demand:'existing MOD.Ad only; unplaced residual remains debt'},null,2));
if(MOD?.anatomyAudit){fs.writeFileSync(path.join(out,'modulation-anatomy-before.json'),JSON.stringify({...MOD.anatomyAudit,maxMarks:BUDGET?.dry??0,direction:MOD.furPlan?'registered regional flow blended with source orientation; existing furMarks/dryMarkPath':'existing orientationField/furMarks/dryMarkPath',materialRegions:MOD.furPlan?.regions,essentialLights:MOD.furPlan?.cores,lightScope:'physical-film and negative contact placement are distinct; stage checkpoint precedes global film lift',calibration:num('moddrycalactual',0)?null:CAL['wet on dry'],calibrationScope:num('moddrycalactual',0)?'planned actual reached min/median/max dryMark measurement/cache before this stage; factors NOT known until measurement':'historical wet-on-dry factor retained for existing shaped dryMark instrument; NOT matched dry-instrument proof',wholeContact:'fresh actual primary/lift + three-cell halo dry admission, existing physical film/paper clip remains'},null,2));await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'whole-fur-before.png'));}
// The modulation lays no target-seeded dry-brush marks (anti-cheat rules); its wash and detail split (planning) stays.
if (MOD && !ABLATE.has('dry')) console.log('dry brush: target-seeded dry-brush marks removed');
if(MOD?.anatomyAudit){await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'whole-fur-ordinary-dried.png'));if(opt('modanatomystop','')==='fur'){await drainFrames();if(FRAMER)FRAMER.close();sheet._gpu?.close();console.log('whole anatomical fur/face stage checkpoint, before closing; not art acceptance');process.exit(0);}}
if (!AWARE_SKIP_POST && DRAGS && !ABLATE.has('drags')) await layDrags(DRAGS, { count: BUDGET ? BUDGET.drags : undefined, mmPerCell: PB ? PB.mmPerCell * SC : 0, dragWmm: PB ? PB.cfg.brushes[PB.cfg.roles.drag].width_mm : 0, sheet, w, h, n, SC, W2, K: PIGS.length, SRC, A: DRAG_TARGET, gaussian, num, dip, createBrush, stroke, step, dry, O, CAL, UPRIGHT, SEED, expected, used, clock, shoot, setStage: s => { STAGE = s; }, log: console.log });
if(AREA_PLAN)AREA_EXEC.set(null);
colourMass('detailed');
if (COLOUR_TRACE) await sharp(render(), {raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'colour-after-detail.png'));
if (!FILM_BY_PAINT) await shoot();
// --curls: what the clipped glazes owed, laid as crescents round the lights and locks across the outline, then booked
if (CURLS?.area) {
  const r = await layCurls(sheet, CURLS, { w, h, SC, k: PIGS.length, pigments: PIGS, blur: gaussian, dip, O, D: SRC, strength: num('strength', 2.2), cal: CAL['dry brush'] ?? 1, seed: 1300 + SEED, shoot, stage: st => { STAGE = st; } },
    { charge: num('curlcharge', 1), water: num('curlwater', 0.3), edge: num('curledge', 1), lean: num('curllean', 0.25), brushShare: num('curlbrush', 0.9), rounds: opt('curlrounds', '0.8,0.4').split(',').map(Number) });
  for (let i = 0; i < n * PIGS.length; i++) expected[i] += CURLS.owed[i];
  // read again, so covered and the forms are measured with the curls on the sheet, against the plan that owes them
  mark(layers.length);
  console.log(`curls: ${r.rounds.join(' + ')} crescents, ${r.edge} locks across the outline`);
}
// the mask comes off last, and the paper under it is untouched
if(!AWARE_SKIP_POST&&VALUE_PLAN&&RESIST){dry(sheet,30000,O,{levelMax:140,dt:2});const paper=measurePaper(sheet,Array.from({length:N2},(_,i)=>i));if(!paper.dry)throw Error('value-plan film removal requires dry base');fs.appendFileSync(path.join(out,'value-commands.jsonl'),JSON.stringify({kind:'physical-film-remove',paper,operation:'existing real liftResist after final shadow; no white overlay'})+'\n');}
if (!AWARE_SKIP_POST && RESIST && !PRACTICE && !AREA_FILM_REMOVED) { if(AREA_PLAN){const cells=Array.from(up(AREA_PLAN.film),(v,i)=>v?i:-1).filter(i=>i>=0);if(cells.length){for(const a of AREA_PLAN.doc.areas)for(const p of a.passes)if(p.lights.mode==='film')for(const dep of p.lights.actions.afterPasses)if(!AREA_COMPLETED.has(dep))throw Error(`film removal prerequisite unexecuted: ${dep}`);dry(sheet,30000,O,{levelMax:140,dt:2});const paper=measurePaper(sheet,cells);if(!paper.dry)throw Error('semantic film requires dry paint before removal');AREA_EXEC.set(null);AREA_EXEC.command('physical film remove',{cells,paper,areaPassIds:AREA_PLAN.schedule.filter(s=>s.pass.lights.mode==='film').map(s=>s.key),semanticPlanned:true,revealedEdges:'inspection pending; no automatic softening'},()=>liftResist(sheet));}else liftResist(sheet);}else liftResist(sheet); dry(sheet, 20000, O, { levelMax: 200 }); STAGE = { stage: 'lift', step: 'frisket off' }; if (!FILM_BY_PAINT) await shoot(); }

if (PREPF) { const f = fadePrep(); let a = 0; for (const v of PREPF.applied) a += v; console.log(`prep fade: the drawing held at ${(100 * a / N2).toFixed(1)}% on average before the closing pen (${f} cells faded in the last step)`); }
// --pencilerase 1: the pencil the finish does not keep, lifted with a kneaded eraser once the washes are dry and before
// the closing pen; wholly off clean paper, in part where paint lies over it (pencil-stage.mjs eraseFactor)
if (!AWARE_SKIP_POST && PENCIL && num('pencilerase', 0) > 0) {
  const keep = up(dilate(SEP.ink, w, h, Math.round(num('pencilkeep', 2))));
  const kk = PIGS.map(p => (p.K[0] + p.K[1] + p.K[2]) / 3), paint = new Float32Array(N2);
  for (const L of layersOf(sheet)) for (let j = 0; j < PIGS.length; j++) { const a = L[j], q = kk[j]; for (let i = 0; i < N2; i++) paint[i] += a[i] * q; }
  const f = eraseFactor(keep, paint, { bare: num('pencilbare', 0.85), under: num('pencilunder', 0.5), clean: num('pencilclean', 0.08) });
  let before = 0, after = 0;
  for (const L of [sheet.G, sheet.D, sheet.P, ...sheet.layers]) { const a = L[GRAPHITE_AT]; for (let i = 0; i < N2; i++) { before += a[i]; a[i] *= f[i]; after += a[i]; } }
  layersChanged(sheet);
  console.log(`pencil erase: ${(100 * (1 - after / Math.max(1e-9, before))).toFixed(1)}% of the graphite lifted, ${(100 * keep.reduce((a, v) => a + (v ? 1 : 0), 0) / N2).toFixed(1)}% of the sheet kept as the finish's line`);
  STAGE = { stage: 'lift', step: 'pencil erased' };
  await shoot();
}
if (DRAW_LAST && DRAWING !== 'none' && !AWARE_SKIP_POST) await awareBoundary({ kind: 'closing' });
if (DRAW_LAST && DRAWING !== 'none') {
  WASH_THK = thickness(sheet).map(a => Float32Array.from(a));
  await sharp(view(), { raw: { width: W2, height: H2, channels: 3 } }).jpeg({ quality: 92 }).toFile(path.join(out, 'wash.jpg'));
  if (opt('draw', '1') !== '0') await drawPass(null);
}
// the finishing lines, after whatever ink the sheet's own order calls for and before the lights
if (opt('finish', '0') !== '0' && opt('draw', '1') !== '0') {
  STAGE = { stage: 'ink', step: 'fine' };
  await drawPass(null, { fine: true });
}
// --facedetail 1: small dark face detail, with a small nib, from the reference's thin dark ridges in the figure mask
// (src/paint/techniques/face-detail.mjs). Tuning: --facedetailq 0.9, --facedetailnib 0.6 cells, --facedetailconc 8, and others there.
if (num('facedetail', 0) > 0 && opt('draw', '1') !== '0') {
  const Kd = opt('cellscale', '0') !== '0' ? w / 420 : 1;
  const fd = faceDetail(SRC, w, h, FW_SUBJ ?? (opt('fwmask', '') ? await loadSubject({ file: path.resolve(root, opt('fwmask', '')), w, h, sharp, log: () => {} }) : null),
    { K: Kd, sigma: num('facedetailsigma', 1), q: num('facedetailq', 0.9), lines: Math.round(num('facedetaillines', 60)), flecks: Math.round(num('facedetailflecks', 30)), margin: num('facedetailmargin', 3), tile: num('facedetailtile', 0), absfloor: num('facedetailabs', 0.25), maxLen: num('facedetailmaxlen', 0), rgb: num('facedetailskin', 0) > 0 ? px : null, blobs: Math.round(num('facedetailblobs', 0)), blobq: num('facedetailblobq', 0.97), blobmax: num('facedetailblobmax', 40), lineNear: num('facedetailmaxlen', 0) > 0 ? dilate(FACE_INK(), w, h, Math.max(1, Math.round(num('facedetailnear', 3) * Kd))) : null, seed: SEED, log: console.log });
  const dInkPig = GRAPHITE && !INK ? GRAPHITE_AT : INK ? PIGS.length : PIGS.map((p, j) => [j, p.K[0] + p.K[1] + p.K[2]]).sort((a, b) => b[1] - a[1])[0][0];
  const dWant = SC === 1 ? fd.field : Float32Array.from({ length: N2 }, (_, i) => fd.field[(((i / W2) | 0) / SC | 0) * w + ((i % W2) / SC | 0)]);
  const dScale = gs => gs.map(g => ({ points: g.points.map(q => ({ x: q.x * SC, y: q.y * SC })) }));
  const dPen = { nib: num('facedetailnib', 0.6) * Kd, flex: 1.5 * Kd, travel: 1.5 * Kd, reach: 12 * Kd, reservoir: 250 * Kd * Kd, feed: 1.2 * Kd };
  const dInk = SHEET_PIGS.map((_, j) => (j === dInkPig ? num('facedetailconc', 8) : 0));
  const rl = penDraw(sheet, dScale(fd.lines), dWant, W2, H2, { ink: dInk, pen: dPen, O, peak: 1 });
  const flFull = new Float32Array(N2).fill(0.8);
  const rf = penDraw(sheet, dScale(fd.flecks), flFull, W2, H2, { ink: dInk, pen: { ...dPen, nib: dPen.nib * 0.8 }, O, peak: 1 });
  if (fd.dabs.length) penDraw(sheet, dScale(fd.dabs), flFull, W2, H2, { ink: dInk, pen: { ...dPen, nib: dPen.nib * 0.9 }, O, peak: 1 });
  dry(sheet, 20000, O, { levelMax: 200 });
  console.log(`face detail: ${rl.drawn} lines and ${rf.drawn} flecks laid on the dry sheet in pigment ${dInkPig}`);
  STAGE = { stage: 'ink', step: 'face detail' };
  await shoot();
}
// --smalllights gouache|both: white gouache last where the source has a small light and the painting reads over --gouachemargin denser.
// --gouachefull: light share that covers a cell (default 0.5); --gouacheopacity 0.9, --gouachedry 0.5: hiding and dry-brush misses.
if (GOUACHE_LIGHTS) {
  const want = gouacheCover(LIGHT_SHARE, sheetDensity(render()), SRC, n, { margin: num('gouachemargin', 0.08), full: num('gouachefull', 0.5) });
  const big = SC === 1 ? want : Float32Array.from({ length: N2 }, (_, i) => want[(((i / W2) | 0) / SC | 0) * w + ((i % W2) / SC | 0)]);
  const cover = dryCover(big, paper.height, N2, { opacity: num('gouacheopacity', 0.9), dry: num('gouachedry', 0.5) });
  let cells = 0, sum = 0; for (let i = 0; i < n; i++) if (want[i] > 0) cells++; for (let i = 0; i < N2; i++) sum += cover[i];
  GOUACHE = { cover, rgb: paperRGB.map(c => c + (252 - c) * 0.7) };
  console.log(`gouache: white over ${cells} cells (${(100 * cells / n).toFixed(2)}% of the sheet), mean cover ${(sum / Math.max(1, cells * SC * SC)).toFixed(2)} where laid`);
  STAGE = { stage: 'gouache' };
  if (!FILM_BY_PAINT) await shoot();
}
colourMass('finished');
if(COLOUR_TRACE) fs.writeFileSync(path.join(out,'colour-trace.json'),JSON.stringify({box:traceBox,pigments:PIGS,trace:colourTrace},null,2));
STAGE = { stage: 'finished' };
if (FILM_BY_PAINT) await shoot(); else { await shoot(); await shoot(); await shoot(); }
console.log(`techniques: ${Object.entries(used).map(([k, v]) => `${k} ${v}`).join(', ')}`);
if (dropped) console.log(`${dropped} passages yielded no brush path and were never painted, carrying ${(100 * droppedMass / Math.max(1e-6, plannedMass)).toFixed(1)}% of the planned mass; the plan counts them delivered`);
await drainFrames();
const judged = intermediates(marks, w, h, gaussian);
console.log(`carried the plan: forms ${(100 * judged.endFormKept).toFixed(0)}% at agreement ${judged.endFormStructure.toFixed(2)}; at one cell ${(100 * judged.endFineKept).toFixed(0)}% at ${judged.endStructure.toFixed(2)} (the tooth, which the plan cannot state)`);
for (const f of judged.flags) console.log(`  ! ${f}`);
{
  // What each pigment was planned against what the sheet holds of it, so a wrong hue can be traced to one pigment.
  const th = thickness(sheet), rows = [];
  for (let j = 0; j < PIGS.length; j++) { let planned = 0, got = 0; for (let i = 0; i < n; i++) planned += expected[i * PIGS.length + j]; for (let i = 0; i < N2; i++) got += th[j][i]; rows.push(`${j} ${(got / Math.max(1e-6, planned * SC * SC)).toFixed(2)}`); }
  console.log(`pigment delivered over planned: ${rows.join(', ')}`);
}
if (marks.length) {
  // covered: of the cells the plan washes, the share holding at least half of it by tone. Both sides through the same
  // optics: the plan is rendered on flat paper as plan.jpg is, since planDensity() reads blues too dark.
  const paintedD = lastPainted;
  const layer = PIGS.map(() => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j < PIGS.length; j++) layer[j][i] = expected[i * PIGS.length + j];
  const flat = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) flat[i * 3 + c] = paperRGB[c];
  const rgb = renderLayers([layer], PIGS, flat, n, 1), pl2 = 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2];
  const planD = Float32Array.from({ length: n }, (_, i) => Math.max(0, -Math.log(Math.max(0.02, Math.min(1, (0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2]) / pl2)))));
  let asked = 0, arrived = 0;
  for (let i = 0; i < n; i++) if (planD[i] > 0.1) { asked++; if (paintedD[i] >= 0.5 * planD[i]) arrived++; }
  const cov = asked ? arrived / asked : 1;
  console.log(`covered: ${(100 * cov).toFixed(0)}% of the cells the plan washes hold half their tone`);
  const by = TECHS.map((name, k) => { let a = 0, b = 0; for (let i = 0; i < n; i++) if (LAST[i] === k + 1 && planD[i] > 0.1) { a++; if (paintedD[i] >= 0.5 * planD[i]) b++; } return a ? `${name} ${(100 * b / a).toFixed(0)}% of ${a}` : null; }).filter(Boolean);
  console.log(`  by the technique that laid it last: ${by.join(', ')}`);
  if (cov < 0.9) console.log(`  ! ${(100 * (1 - cov)).toFixed(0)}% of the planned wash never arrived: passages dropped, or laid as marks with paper between`);
}
phaseMark('painting');
if (TARGET_GUARD.mode !== 'off') { TARGET_GUARD.endPaint(); px = PX_RAW; const g = TARGET_GUARD.summary(); console.log(`target guard: ${g.violations} paint-time target reads${g.violations ? ' (' + Object.keys(g.byName).join(', ') + ')' : ''}`); }
console.log(`time: ${Object.entries(spent).map(([k, v]) => `${k} ${(v / 1000).toFixed(0)}s`).join(', ')}`);
console.log(`profile: ${Object.entries(PROF).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`).join(', ')}`);
console.log(`${laid} brush sweeps, ${frame} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);

reportTechniques();
if (WETPOL) console.log(`wet policy: ${WETPOL_COUNT.wet} passages wet in wet (first wash, light, big blends), ${WETPOL_COUNT.dry} on dry paper`);
if(COLOUR_TRACE) await sharp(INKRES ? INKRES.compose(render()) : render(), {raw:{width:OUT_W,height:OUT_H,channels:3}}).png().toFile(path.join(out,'colour-final.png'));
// --subgrid N: spread settled pigment over N x N sub-cells by the cold-press relief, each cell keeping its pigment. Default 0.
// Water stays at the sheet's grid. Written as painting-fine.jpg and averaged back as reflectance. Cold-press paper only.
const SUBGRID = Math.round(num('subgrid', 0));
const renderSub = () => {
  const coarse = view();
  if (SUBGRID < 2 || !CP_MM || INKRES) return { coarse, fine: null };
  const N = SUBGRID, FW = W2 * N, FH = H2 * N, cp = PAPER_OPTS.coldPress;
  const hF = coldPressField(FW, FH, CP_MM / N, PAPER_OPTS.seed, { ...cp, mmPerCell: CP_MM / N });
  const T = thickness(sheet), KP = SHEET_PIGS.length;
  const shareOf = p => (p.gamma == null ? 0 : 1 - (p.wick ?? Math.max(0.05, Math.min(0.9, 1 - p.gamma))));
  const share = SHEET_PIGS.map(shareOf), gg = SHEET_PIGS.map(p => Math.min(0.97, (p.gamma ?? 0) * (O.gran ?? 1) * num('subgridgain', 1)));
  const Kc = SHEET_PIGS.map(p => Array.from(p.K));
  const fine = Buffer.alloc(FW * FH * 3), avg = Buffer.alloc(N2 * 3);
  const w = new Float64Array(N * N * KP), mw = new Float64Array(KP), od = new Float64Array(3), den = new Float64Array(3);
  for (let cy = 0; cy < H2; cy++) for (let cx = 0; cx < W2; cx++) {
    const c = cy * W2 + cx;
    let any = false;
    for (let ch = 0; ch < 3; ch++) {
      const b = Math.max(1, base[c * 3 + ch]), r = Math.max(1, coarse[c * 3 + ch]);
      od[ch] = Math.max(0, Math.log(b / r)); den[ch] = 0;
      for (let k = 0; k < KP; k++) den[ch] += T[k][c] * Kc[k][ch];
      if (od[ch] > 1e-4 && den[ch] > 1e-9) any = true;
    }
    // the sub-cells' settling weights per pigment, and their mean over the cell (so the cell keeps its pigment)
    mw.fill(0);
    for (let sy = 0; sy < N; sy++) for (let sx = 0; sx < N; sx++) {
      const h = hF[(cy * N + sy) * FW + cx * N + sx], s = sy * N + sx;
      for (let k = 0; k < KP; k++) { const v = Math.max(0.02, 1 - h * gg[k]); w[s * KP + k] = v; mw[k] += v; }
    }
    for (let k = 0; k < KP; k++) mw[k] /= N * N;
    const acc = [0, 0, 0];
    for (let sy = 0; sy < N; sy++) for (let sx = 0; sx < N; sx++) {
      const s = sy * N + sx, fi = (cy * N + sy) * FW + cx * N + sx, h = hF[fi], shade = 1 - SHADE + SHADE * h;
      for (let ch = 0; ch < 3; ch++) {
        let m = 1;
        if (any && den[ch] > 1e-9) {
          let nm = 0;
          for (let k = 0; k < KP; k++) { const t = T[k][c]; if (t > 0) nm += t * Kc[k][ch] * ((1 - share[k]) + share[k] * w[s * KP + k] / mw[k]); }
          m = nm / den[ch];
        }
        const v = Math.min(255, paperRGB[ch] * shade * Math.exp(-od[ch] * m) * (coarse[c * 3 + ch] > base[c * 3 + ch] ? coarse[c * 3 + ch] / Math.max(1, base[c * 3 + ch]) : 1));
        fine[fi * 3 + ch] = Math.round(v); acc[ch] += v;
      }
    }
    for (let ch = 0; ch < 3; ch++) avg[c * 3 + ch] = Math.round(acc[ch] / (N * N));
  }
  console.log(`subgrid: settled pigment over ${N}x${N} sub-cells of cold press at ${(CP_MM / N).toFixed(3)} mm, painting-fine.jpg ${FW}x${FH}`);
  return { coarse: avg, fine };
};
const FINAL = renderSub();
if (FINAL.fine) await sharp(FINAL.fine, { raw: { width: W2 * SUBGRID, height: H2 * SUBGRID, channels: 3 } }).jpeg({ quality: 92 }).toFile(path.join(out, 'painting-fine.jpg'));
if (LOOK_RES > 1 && !INKRES) { const F = renderFine(); await sharp(F.buf, { raw: { width: F.FW, height: F.FH, channels: 3 } }).jpeg({ quality: 92 }).toFile(path.join(out, 'painting-fine.jpg')); }
const FINAL_PIXELS=INKRES ? INKRES.compose(view()) : FINAL.coarse;
await sharp(FINAL_PIXELS,{raw:{width:OUT_W,height:OUT_H,channels:3}}).png().toFile(path.join(out,'painting.png'));
await sharp(FINAL_PIXELS,{raw:{width:OUT_W,height:OUT_H,channels:3}}).jpeg({quality:92}).toFile(path.join(out,'painting.jpg'));
if (STROKE_BUDGET) {
 const count=MARKTAPE.filter(m=>['s','P','g'].includes(m.k)).length;
 fs.writeFileSync(path.join(out,'stroke-budget.json'),JSON.stringify({budget:STROKE_BUDGET,strokes:count,complete:count<=STROKE_BUDGET,counts:Object.fromEntries(['s','P','g'].map(k=>[k,MARKTAPE.filter(m=>m.k===k).length]))},null,2));
 if(count>STROKE_BUDGET)throw Error(`Whole painting exceeded stroke budget: ${count}/${STROKE_BUDGET}`);
}
if (MARKTAPE) {
  const file = path.join(out, 'marks.json');
  const { BRUSHES, BRUSHOPTS, PENS, PENOPTS } = await import('../src/media/brush.mjs');
  // The physics reads more than K and S (rho, omega, gamma, floc, wick), so the tape copies every own property of a pigment.
  const asTape = p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, ArrayBuffer.isView(v) ? Array.from(v) : v]));
  // Everything a player needs to make the same sheet: the paper recipe, the pans, the flow options and the base.
  fs.writeFileSync(file, JSON.stringify({
    w: W2, h: H2, scale: 10, sheetWidthMm: PB?.mm ?? num('sheetmm', DEFAULT_SHEET_MM),
    version:2, paper:PAPER_OPTS, paperRGB, paperShade:SHADE, strokeBudget:STROKE_BUDGET||null, strokeCount:MARKTAPE.filter(m=>['s','P','g'].includes(m.k)).length,
    base: Array.from(base.subarray(0, 3)),
    opts: O,
    pigments: SHEET_PIGS.map(asTape), brushOpts: BRUSHOPTS, brushes: BRUSHES, penOpts: PENOPTS, pens: PENS, marks: MARKTAPE,
  }));
  const strokeStats = loadStats(file);
  const strokeGate = evaluateGate(strokeStats, { mode: opt('strokegate', 'warn'),
    config: opt('strokegateconfig', '') ? JSON.parse(fs.readFileSync(opt('strokegateconfig'), 'utf8')) : {} });
  fs.writeFileSync(path.join(out, 'stroke-stats.json'), JSON.stringify(strokeStats, null, 2));
  fs.writeFileSync(path.join(out, 'stroke-stats.svg'), panelSVG(strokeStats));
  fs.writeFileSync(path.join(out, 'stroke-gate.json'), JSON.stringify(strokeGate, null, 2));
  printGate(strokeGate);
  if (!strokeGate.ok) process.exitCode = 4;
  const strokes = MARKTAPE.filter(m => m.k === 's'), lines = MARKTAPE.filter(m => m.k === 'P');
  const pts = strokes.reduce((a, m) => a + m.d.length, 0), lpts = lines.reduce((a, m) => a + m.d.length, 0);
  console.log(`marks: ${strokes.length} strokes over ${pts} points, ${lines.length} pen lines over ${lpts} points, ${MARKTAPE.length - strokes.length - lines.length} other, ${BRUSHES.length} brushes over ${BRUSHOPTS.length} shapes, ${PENS.length} pens over ${PENOPTS.length} nibs, ${(fs.statSync(file).size / 1048576).toFixed(2)} MB`);
}
{
  // Pen last: the ink is what the sheet gained while drawing. Pen first: the ink is what the drawing laid, and the washes
  // are what the sheet holds beyond it (the washes moved some of that ink, so this is the layer as laid, not as left).
  const after = thickness(sheet);
  // with --drawing none no pen ran at all, so there is no wash snapshot to subtract and the ink layer is empty
  const empty = () => after.map(a => new Float32Array(a.length));
  const inkLayer = PEN_FIRST ? (INK_THK ?? empty()) : WASH_THK ? after.map((a, j) => Float32Array.from(a, (v, i) => Math.max(0, v - WASH_THK[j][i]))) : empty();
  await sharp(Buffer.from(renderLayers([inkLayer], SHEET_PIGS, base, N2, 1).buffer), { raw: { width: W2, height: H2, channels: 3 } }).jpeg({ quality: 92 }).toFile(path.join(out, 'ink.jpg'));
  if (PEN_FIRST) {
    const washLayer = after.map((a, j) => Float32Array.from(a, (v, i) => Math.max(0, v - (INK_THK ? INK_THK[j][i] : 0))));
    await sharp(Buffer.from(renderLayers([washLayer], SHEET_PIGS, base, N2, 1).buffer), { raw: { width: W2, height: H2, channels: 3 } }).jpeg({ quality: 92 }).toFile(path.join(out, 'wash.jpg'));
  }
}
await sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 92 }).toFile(path.join(out, 'source.jpg'));
// the picture the painter aimed at, so a photo plate is compared with a watercolour, not a photograph
if (STYLE > 0) {
  const aim = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) aim[i * 3 + c] = paperRGB[c] * Math.exp(-D_AIM[i * 3 + c]);
  await sharp(aim, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 92 }).toFile(path.join(out, 'target.jpg'));
}
// --timeline target|<code>: retime the frames so each phase takes the share the target build gives it (src/paint/film-timeline.mjs).
// Milestones come from work/references/manifest.json; a piece with none takes the median. Nothing here paints.
const TIMELINE = opt('timeline', '');
const RETIMED = OUTPUT_VIDEO && TIMELINE && TIMELINE !== '0' ? await (async () => {
  const man = JSON.parse(fs.readFileSync(path.join(root, 'work/references/manifest.json'), 'utf8'));
  const code = TIMELINE === 'target' ? codeForImage(man, opt('image', '')) : TIMELINE;
  // --pencilstage: the pen ends where the target's drawing is complete, measured on its stages up to the drawing stage
  const penEnd = PENCIL_STAGE && code && man.subjects?.[code] ? await (async () => {
    const drawAt = opt('drawstage', opt('penpencil', '')), live = man.subjects[code].stages.slice().sort((a, b) => a.percent - b.percent);
    const upto = live.filter(st => st.percent <= (live.find(st => drawAt.endsWith(st.file))?.percent ?? 25));
    const shares = [];
    for (const st of upto) { const m = await measureLine({ file: path.join(root, 'work/references', st.file), w, h, sharp, cut: 12, log: () => {}, min: 0 }); shares.push({ position: st.percent / 100, share: m.share }); }
    const e = penEndPosition(shares, num('pencilend', 0.9));
    console.log(`pencil stage: target line share ${shares.map(q => `${Math.round(100 * q.position)}% ${(100 * q.share).toFixed(2)}`).join(', ')}; the drawing is complete at ${(100 * e).toFixed(1)}%`);
    return e;
  })() : null;
  const r = await retimeRun({ sharp, dir: out, frames: FRAMES, manifest: man, code, join: path.join, penEnd });
  const pc = x => Math.round(100 * x);
  console.log(`timeline: ${r.target.code}${r.target.fallback ? ' (median of the targets)' : ''}; phases as filmed ${PHASES.map((p, k) => `${p} ${pc(phaseAt(r.runM, k, FRAMES.length - 1))}`).join(', ')}; re-timed ${PHASES.map(p => `${p} ${pc(phaseShares(r.target.milestones)[p])}`).join(', ')}`);
  return r;
})() : null;
// --phaselabels 1: each frame also carries its painter-order and timeline class (film-timeline.mjs labelFrames). Default 0.
const placed = FRAMES.map((f, i) => {
  const film = FRAMES.length > 1 ? i / (FRAMES.length - 1) : 1;
  return RETIMED ? { ...f, position: RETIMED.positions[i], filmPosition: film } : { ...f, position: film };
});
// --thkdump 1: the finished sheet's pigment thickness per pigment as raw floats (thickness.f32), to compare two runs cell by cell
if (opt('thkdump', '0') !== '0') { coherent(sheet); const th = thickness(sheet); fs.writeFileSync(path.join(out, 'thickness.f32'), Buffer.concat(th.map(a => Buffer.from(a.buffer, a.byteOffset, a.byteLength)))); }
if(PEN_STATE_GATE) fs.writeFileSync(path.join(out,'pen-state-audit.json'),JSON.stringify(PEN_STATE_AUDIT,null,2));
fs.writeFileSync(path.join(out, 'backend.json'), JSON.stringify({ ...PAINTER, ...GPU_INFO, gpuStats: gpuStats(sheet), performanceOptions: { opticalThreads, trackedTransfers: SPEED_TRANSFERS, edgePingPong: process.env.GPU_EDGE_PINGPONG === '1', fusedWetScanRequested: process.env.GPU_FUSE_WETSCAN === '1' } }, null, 1));
fs.writeFileSync(path.join(out, 'frames.json'), JSON.stringify({ ...PAINTER, width: OUT_W, height: OUT_H, presentation: { framePolicy: FRAME_POLICY.all ? 'all' : 'checkpoints', checkpoints: [10,25,50,75,100], video: Boolean(OUTPUT_VIDEO), requestedTimeline: TIMELINE, retimed: Boolean(RETIMED) }, ...(RETIMED ? { timeline: { target: RETIMED.target.code, fallback: RETIMED.target.fallback, milestones: RETIMED.target.milestones } } : {}), frames: num('phaselabels', 0) > 0 ? labelFrames(placed, RETIMED?.target.milestones ?? null) : placed }, null, 1));
// The plan as a picture, through the sheet's optics, to tell a bad plan from one the brushes failed to carry out.
{
  const layer = PIGS.map(() => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j < PIGS.length; j++) layer[j][i] = expected[i * PIGS.length + j];
  const flat = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) flat[i * 3 + c] = paperRGB[c];
  await sharp(Buffer.from(renderLayers([layer], PIGS, flat, n, 1).buffer), { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 92 }).toFile(path.join(out, 'plan.jpg'));
}
await drainFrames(); if (FRAMER) FRAMER.close();
phaseMark('finish');
if (OUTPUT_VIDEO) {
  // re-timed, each frame is held for its share of the same running time, and the film is resampled to the frame rate
  const fps = num('fps', 12);
  let input = ['-framerate', String(fps), '-i', path.join(out, 'f%04d.jpg')], vf = 'pad=ceil(iw/2)*2:ceil(ih/2)*2';
  if (RETIMED) {
    const list = path.join(out, 'timeline.txt');
    fs.writeFileSync(list, concatList(FRAMES.map(f => f.src), RETIMED.positions, FRAMES.length / fps));
    input = ['-f', 'concat', '-safe', '0', '-i', list];
    vf = `fps=${fps},${vf}`;
  }
  await new Promise((res, rej) => execFile('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...input, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast',
    '-crf', '21', '-pix_fmt', 'yuv420p', path.join(out, 'painting.mp4')], e => (e ? rej(e) : res())));
}
phaseMark('film');
// Every finished painting gets a cheat-risk score (tools/guard/cheat-risk.mjs); a high score asks for review, not exclusion.
// The guard's report is written first so the score can read it.
if (TARGET_GUARD.mode !== 'off') writeGuardReport(TARGET_GUARD, out, { image: opt('image', '') });
try {
  const risk = await cheatRisk({ run: out, target: path.resolve(root, opt('image', '')), sheetMm: num('sheetmm', DEFAULT_SHEET_MM) });
  fs.writeFileSync(path.join(out, 'cheat-risk.json'), JSON.stringify(risk, null, 1));
  console.log(`cheat risk: ${risk.level} (${risk.risk})${risk.flags.length ? `, flags ${risk.flags.join(', ')}` : ''}${risk.review ? '; review the stage strip before showing this painting' : ''}`);
} catch (e) {
  fs.writeFileSync(path.join(out, 'cheat-risk.json'), JSON.stringify({ error: e.message, level: null, review: true }, null, 1));
  console.error(`cheat risk: could not score this painting: ${e.message}`);
  process.exitCode = 4;
}
console.log(`phases: ${WALL_PHASES.join(', ')}${RENDER_REUSED ? `; ${RENDER_REUSED} renders reused` : ''}`);
console.log(`${out}/painting.jpg${OUTPUT_VIDEO ? `\n${out}/painting.mp4` : '\nvideo disabled; actual stage images, frames and commands retained'}`);
// Typed options the run never read go to unused-options.txt and the run exits 3 after writing its outputs.
// --allowunused 1 turns the exit off. A recipe's defaults do not count.
{
  const given = [...new Set(argv0.filter(a => a.startsWith('--')).map(a => a.slice(2)))];
  const unused = given.filter(k => !OPTS_READ.has(k) && k !== 'allowunused');
  if (unused.length) {
    fs.writeFileSync(path.join(out, 'unused-options.txt'), unused.map(k => `--${k}`).join('\n') + '\n');
    console.log(`UNUSED OPTIONS (read by nothing in this run): ${unused.map(k => `--${k}`).join(' ')}`);
    // the job recipe always passes these two and only some paths read them: listed, but they do not fail a run
    const optional = new Set(['closeclean', 'drawstage']);
    if (opt('allowunused', '0') === '0' && unused.some(k => !optional.has(k))) process.exitCode = 3;
  }
}

if (SPEED_PROFILE) SPEED_PROFILE.write(out, { phases: WALL_PHASES, painting: spent, cpu: PROF });
if (CPU_PROFILE) await CPU_PROFILE.stop(path.join(out, 'main.cpuprofile'));
