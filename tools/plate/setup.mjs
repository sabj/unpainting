// Options and the source image.
// Stage 1 of 7 of tools/paint-plate.mjs. The stages run in order and share one object, ctx: see the entry file.
import {EpochCells} from '../../src/paint/epoch-cells.mjs';
import {setStrict, writeContinuedChecks} from '../../src/media/checks.mjs';
import {scaleBrushForDensity} from '../../src/media/brush-density.mjs';
import {framePolicy} from '../speed/frame-policy.mjs';
import {startSpeedProfile} from '../speed/profile.mjs';
import {runSpeedSequence} from '../speed/sequence.mjs';
import {estimatePaper} from '../../src/paint/methods/light-to-dark.mjs';
import {sheetColour} from '../../src/paint/methods/paper-colour.mjs';
import {setTextureVariety} from '../../src/paint/techniques/shaped-marks.mjs';
import {removePlannedInk} from '../../src/crop/ink-free.mjs';
import {availableParallelism} from 'node:os';
import {DEFAULT_SHEET_MM} from '../../src/media/sheet-size.mjs';
import {nativeBodyCadence} from '../painter/native-body-cadence.mjs';
import {validateLegacyIntent} from '../painter/legacy-major-intents.mjs';
import {nativePaintMode, nativeUploadPolicy} from '../painter/native-paint-mode.mjs';
import {sha256} from '../painter/semantic-areas.mjs';
import {measurePaper as physicalMeasurePaper} from '../../src/paint/methods/wetdry.mjs';
import {codeHash, digest} from '../../src/paint/run-cache.mjs';
import {cachedEarlyLines, outputRelative, planFileDigest} from '../../src/paint/early-lines-cache.mjs';
import {paintingLooks} from '../../src/paint/painting-look.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {prepareOutputDirectory} from '../../src/paint/output-directory.mjs';
import {isSwitchWord} from '../../src/paint/option-check.mjs';
import {checkCodeState} from '../../src/paint/code-state.mjs';
import sharp from 'sharp';
import {setThreads, threadStats} from '../../src/media/sheet.mjs';
import {createBrush as createBrushRaw, stroke as physicalStrokeRaw, candidateContact as candidateContactRaw, ContactWorkspace, setWashSplat} from '../../src/media/brush.mjs';
import {paperOf} from '../../src/crop/palettepick.mjs';
import {setSweepIntervals, setFlowRectangle} from '../../src/media/wash.mjs';
import {linePaths, readLineText} from '../../src/crop/lines.mjs';
import {liftResist as physicalLiftResist} from '../../src/media/sheet.mjs';
import {expandRecipe} from '../../src/paint/recipe.mjs';
import {reportUnusedPlanKeys} from '../../src/paint/plan-keys.mjs';
import {versionStamp, versionLine} from '../../src/painter-version.mjs';
import {prepareLineSource} from '../../src/paint/methods/linework-plan.mjs';
import {planUniversalLinework} from '../../src/paint/methods/linework-stage.mjs';
import {registerDrawingFile, lineTargetOf} from '../../src/paint/methods/drawing-registration.mjs';
import {holdInkLines} from '../../src/paint/methods/ink-lines-file.mjs';
import {inkRecipeArgs} from '../../src/paint/methods/ink-recipe.mjs';
import {chooseInkRecipe, sourcePenShare, DRAWING_FLAGS, DEFAULT_INK_RECIPE} from '../../src/paint/methods/ink-recipe-auto.mjs';
import {drawingStageIntent} from '../../src/paint/methods/drawing-stages-auto.mjs';
import {bindLineTarget} from '../../src/crop/lines.mjs';
import {prepareSegments} from '../../src/crop/segment-prep.mjs';
import {subjectWashField} from '../../src/paint/methods/subject-washes.mjs';
import {strokeBudgetDefaults} from '../../src/paint/methods/stroke-budget.mjs';
import {createTargetGuard, writeGuardReport, DEFAULT_MODE, HARD_LOOK_BUDGET} from '../guard/no-target.mjs';
import {linePython, resolveLinePython} from '../../src/paint/methods/line-python.mjs';
import {detectSheetTone} from '../../src/paint/methods/sheet-tone.mjs';

export async function setup(ctx) {
const { ENTRY_FILE } = ctx;
// the last of a repeated flag wins, so a batch script can append overrides to a shared set

// GPU paths default on for painter runs; set 0 to turn one off.
// The defaults live here because generic dry() callers may depend on synchronous counts.
process.env.GPU_RESIDENT ??= '1';
process.env.GPU_COMPOSITE ??= '1';
process.env.GPU_ASYNC_DRY ??= '1';

const argv0 = process.argv.slice(2);
if(await runSpeedSequence(argv0,ENTRY_FILE))process.exit(0);
// --recipe: a named preset of flags put in front of the command line (src/paint/recipe.mjs)
const { argv, note: RECIPE_NOTE, pipeline: PIPELINE } = expandRecipe({ argv: argv0, root: path.dirname(path.dirname(ENTRY_FILE)) });
// every option name the painter asks for, so options given but never read are reported at the end
const OPTS_READ = new Set(['recipe']);
// OPT_TRACK: while a cached step runs (src/paint/run-cache.mjs), every option it reads and the raw value it found
let OPT_TRACK = null, optIndex = null, optArgvLen = -1;
const optIdx = n => {
  if (optArgvLen !== argv.length) {
    optIndex = new Map();
    for (let i = 0; i < argv.length; i++) if (typeof argv[i] === 'string' && argv[i].startsWith('--')) optIndex.set(argv[i].slice(2), i);
    optArgvLen = argv.length;
  }
  return optIndex.get(n) ?? -1;
};
// NAN_GIVEN: number options typed with a non-number; TEXT_READ: options also read as text; WORD_GIVEN: 0/1 switches typed
// with a word, unless another read of the option takes words (WORD_OK). See src/paint/option-check.mjs.
const NAN_GIVEN = new Map(), TEXT_READ = new Set(), WORD_GIVEN = new Map(), WORD_OK = new Set();
const read = (n, d) => { OPTS_READ.add(n); const i = optIdx(n); if (i >= 0) { if (isSwitchWord(d, argv[i + 1])) WORD_GIVEN.set(n, argv[i + 1]); else if (d !== '0' && d !== '1') WORD_OK.add(n); } if (OPT_TRACK) OPT_TRACK.push([n, i >= 0 ? argv[i + 1] ?? null : null]); return i >= 0 ? argv[i + 1] : d; };
const opt = (n, d) => { TEXT_READ.add(n); return read(n, d); };
const num = (n, d) => { const v = read(n, d), x = Number(v); if (Number.isNaN(x) && optIdx(n) >= 0) NAN_GIVEN.set(n, v); return x; };
// Caller-owned drawing inputs and stage intent, separated from recipe/plan and generated arguments.
const DRAWING_STAGE_INTENT = drawingStageIntent({ argv0, expandedArgv: argv, pipeline: PIPELINE });
// An explicit budget changes planning only; absent/zero preserves every default.
const STROKE_BUDGET = num('strokebudget', 0);
for(const [key,value] of Object.entries(strokeBudgetDefaults(STROKE_BUDGET))) if(!argv0.includes('--'+key)) argv.push('--'+key,String(value));
// --texvariety v: how much the short texture marks vary in length and pressure (src/paint/techniques/shaped-marks.mjs)
setTextureVariety(num('texvariety', 0));
const optTrack = {
  start() { OPT_TRACK = []; },
  stop() { const r = OPT_TRACK; OPT_TRACK = null; return r; },
  current(n) { const i = optIdx(n); return i >= 0 ? argv[i + 1] ?? null : null; },
  replay(names) { for (const k of names) OPTS_READ.add(k); },
};
const NATIVE_PAINT_MODE = nativePaintMode(opt('mode', 'fast'));
// Reuse the tracked, exact CPU fallback transfer path independently of Fast physics.
const SPEED_TRANSFERS = num('speedtransfers', 1) > 0;
// Exact CPU and GPU speed switches (SPEED2, SPEED3): byte-identical paintings, on by default; pass 0 to disable each.
const SPEED_PAPER = num('speedpaper', 1) > 0;
const SPEED_CONTACT = num('speedcontact', 1) > 0;
const SPEED_VALUE_CACHE = num('speedvaluecache', 1) > 0;
const SPEED_VALUE_ONLY = num('speedvalueonly', 1) > 0;
const SPEED_COVERAGE = num('speedcoverage', 1) > 0;
setSweepIntervals(SPEED_COVERAGE);
const SPEED_FLOW_RECT = num('speedflowrect', 1) > 0;
setFlowRectangle(SPEED_FLOW_RECT, num('speedprofile', 0) > 0 ? ({ milliseconds }) => SPEED_PROFILE?.add('painting:flow-field', milliseconds) : null);
const SPEED_FILM = num('speedfilm', 1) > 0;
const SPEED_UNIFORM_PAPER = num('speeduniformpaper', 1) > 0;
const measurePaper = (target, cells, paperOnly = false, options = {}) => physicalMeasurePaper(target, cells, paperOnly, { uniform: SPEED_UNIFORM_PAPER, ...options });
const liftResist = target => {
  const started = performance.now();
  try { return physicalLiftResist(target, { byPlane: SPEED_FILM }); }
  finally { SPEED_PROFILE?.add('painting:film-removal', performance.now() - started); }
};
const VALUE_CONTACT_WORK = new ContactWorkspace();
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
// 1: fused single-workgroup wet frontier; 0: parallel three-dispatch build.
// Both construct the same active tile set and retain the same cell arithmetic.
process.env.GPU_SPARSE_ALL = String(num('speedfrontier', 1));
process.env.GPU_SKIP_ZERO_LAYER = String(num('speedemptylayers', 1));
// Parallel optics improved the 540-cell runs; native-size trials showed no gain.
const SPEED_RENDER_THREADS = Math.max(1, Math.min(16, Math.floor(num('speedrenderthreads', opt('gpu', 'auto') === 'off' || num('width', 700) > 540 ? 1 : Math.min(4, availableParallelism())))));
process.env.KM_PARALLEL_CELLS = SPEED_RENDER_THREADS > 1 ? '1' : '0';
const FRAME_POLICY = framePolicy({ video: OUTPUT_VIDEO, keepAll: num('keepallframes', 0) > 0 });
const SPEED_PROFILE = startSpeedProfile(num('speedprofile', 0) > 0);
const CPU_PROFILE = num('speedcpu', 0) > 0 ? await import('../speed/cpu-profile.mjs').then(m => m.startCpuProfile()) : null;
void opt('downtrace', '0'); // tracing is selected from argv while GPU modules load

if (RECIPE_NOTE) console.log(RECIPE_NOTE);
// The release, painter and sim versions and the git commit, recorded in frames.json and backend.json (docs/versions.md)
const PAINTER = versionStamp();
console.log(`${versionLine(PAINTER)}${PAINTER.commit ? ` at ${PAINTER.commit.slice(0, 12)}` : ''}`);
// --threads N: large wet boxes step in row bands on N threads (src/media/sheet-par.mjs); output is bit-identical.
// Default up to 6 in fast mode, 1 in full mode.
const THREADS_DEFAULT = NATIVE_PAINT_MODE.mode === 'fast' ? Math.max(1, Math.min(6, availableParallelism() - 2)) : 1;
if (await setThreads(num('threads', THREADS_DEFAULT)) > 1) process.on('exit', () => console.log(`threads: ${num('threads', THREADS_DEFAULT)}, boxes stepped in bands and serially: ${JSON.stringify(threadStats())}`));
ctx.opticalThreads = 1;
if (SPEED_RENDER_THREADS > 1) {
  const opticsPool = await import('../../src/media/sheet-par.mjs');
  ctx.opticalThreads = opticsPool.threads() > 1 ? opticsPool.threads() : opticsPool.start(SPEED_RENDER_THREADS, { opticsOnly: true });
}
const root = path.dirname(path.dirname(ENTRY_FILE));
const out = path.resolve(root, opt('out', 'work/plate'));
// a fresh process taking over a saved painting (--resumestate) continues in the painting's own folder
if (opt('resumestate', '')) { if (!fs.existsSync(path.join(out, 'f0000.jpg'))) throw new Error('--resumestate: ' + out + ' holds no painting to continue'); } else prepareOutputDirectory(out);
// the commit painted from, refused when tracked files or new source files differ from it (src/paint/code-state.mjs)
// --strict 1 (or the older --wetgate 1): failed mid-painting checks stop the run. Default 0: they are counted, logged and
// written to continued-checks.json at exit (src/media/checks.mjs).
setStrict(opt('strict', '0') === '1' || opt('wetgate', '0') === '1'); process.on('exit', () => writeContinuedChecks(out));
const CODE_STATE = checkCodeState({ root, out, allowDirty: num('allowdirty', 0) > 0 });
// --inkrecipe v2|wash: ink flags as one switch (src/paint/methods/ink-recipe.mjs); flags typed on the command line win,
// and the recipe's flags win over the --recipe preset's. Added before the line source is prepared, since the wash
// recipe picks it.
// --inkrecipe auto picks wash for a pen drawing, none otherwise (src/paint/methods/ink-recipe-auto.mjs). The default is none.
const INK_RECIPE_NAME = opt('inkrecipe', DEFAULT_INK_RECIPE);
const INK_RECIPE = await (async () => {
  // the share is read at one width, so --width does not change the choice (the separator's line share depends on it)
  // a missing image is left to fail at the normal image load below
  const measure = INK_RECIPE_NAME === 'auto' && !DRAWING_FLAGS.some(f => argv0.includes(f)) && fs.existsSync(path.resolve(root, opt('image')));
  const share = measure ? await sourcePenShare({ image: path.resolve(root, opt('image')), sharp }) : null;
  return chooseInkRecipe(INK_RECIPE_NAME, argv0, () => share, num('penfirst', 0.5));
})();
if (INK_RECIPE_NAME === 'auto') console.log(`ink recipe: ${INK_RECIPE.recipe} (auto: ${INK_RECIPE.why})`);
argv.push(...inkRecipeArgs(INK_RECIPE.recipe, argv0));
// Legacy extraction flags remain CLI aliases; the plan has one source choice.
if (!argv0.includes('--linesource')) {
  if (num('copylines',0)>0) argv.push('--linesource','source-ink');
  else if (num('sketchlines',0)>0) argv.push('--linesource','photo-sketch');
  else if (num('sourcelines',0)>0) argv.push('--linesource','source-ink');
}
// --linework auto (plan drawing.linework "auto"): the universal linework stage (src/paint/methods/linework-stage.mjs)
// picks the line source, cleans the lines and gates whether to draw, the medium and how much, before every other line
// route, and writes an ordinary drawing file that replaces --linesource and any --drawingfile. --linemedium
// ink|graphite|none, a plan's drawing.medium or --outlinemedium fixes the medium; --sketchcache <dir> holds image-model
// sketches (tools/seg/sketch-target.mjs); --sketchpython the python for copy-lines. --linework file cleans and gates
// the given --drawingfile instead of choosing a source; --linejoin 1 joins broken contours before pruning. Off by default.
// every line file is checked against the target (lines.mjs); a --drawingfile made for another image or aspect is
// registered to the target first (drawing-registration.mjs)
if (opt('image','')) bindLineTarget(await lineTargetOf(path.resolve(root, opt('image',''))).catch(() => null));
const DRAWING_REGISTRATION = opt('drawingfile','') && opt('drawing','first') !== 'none' ? await registerDrawingFile({ base: opt('drawingfile'), image: path.resolve(root, opt('image','')), root, out, width: num('width', 700), argv, log: console.log }) : null;
ctx.LINEWORK_STAGE = null;
const LINEWORK_SOURCES = { python: resolveLinePython({ flag: opt('sketchpython','') }).path, sketchCache: opt('sketchcache','') ? path.resolve(root, opt('sketchcache','')) : null };
const LINEWORK_JOIN = num('linejoin', 0) > 0;
if (opt('linework','off') !== 'off' && opt('drawing','first') !== 'none') {
  if (!['auto', 'file'].includes(opt('linework'))) throw Error(`--linework: auto, file or off, not ${opt('linework')}`);
  if (opt('linework') === 'file' && !opt('drawingfile','')) throw Error('--linework file needs --drawingfile');
  const om = argv.includes('--outlinemedium') ? opt('outlinemedium','graphite') : 'graphite';
  const requested = opt('linemedium','') || (om === 'auto' ? null : /graphite/.test(om) ? 'graphite' : 'ink');
  const r = await planUniversalLinework({ image: path.resolve(root, opt('image','')), out, root, width: num('width', 700), sheetMm: num('sheetmm', DEFAULT_SHEET_MM),
    requested, style: num('penwash',0) > 0 ? 'penwash' : 'default', ...LINEWORK_SOURCES, join: LINEWORK_JOIN, drawingFile: opt('linework') === 'file' ? path.resolve(root, opt('drawingfile','')) : null,
    seed: num('seed', 0), log: console.log });
  argv.push(...r.flags);
  ctx.LINEWORK_STAGE = r.record;
}
const SWEEP_CACHE = path.dirname(root) === '/root/sweepwork' ? '/root/sweepwork/cache' : null;
const RUN_CACHE = {dir:process.env.W2_CACHE_DIR || SWEEP_CACHE || path.join(root,'work','cache'),enabled:opt('runcache','1')!=='0'};
const EARLY_LINES = !['none','auto'].includes(opt('linesource','none')) ? await cachedEarlyLines({
  cache:RUN_CACHE, code:RUN_CACHE.enabled ? codeHash(root,fs.readdirSync(path.join(root,'tools/seg')).filter(f=>f.endsWith('.py')).map(f=>'tools/seg/'+f),{dependencies:['src/paint/methods/linework-plan.mjs','src/paint/early-lines-cache.mjs']}) : '',
  track:optTrack, argv, out,
  inputs:RUN_CACHE.enabled ? {
    target:fs.readFileSync(path.resolve(root,opt('image',''))),
    python:linePython({flag:opt('sketchpython',''),log:()=>{},warn:()=>{}}),
    files:Object.fromEntries(['sketchmap','sketchsegments','drawingfile','drawinglast'].map(k=>{
      const f=opt(k,'');if(!f)return [k,null];
      const p=path.resolve(root,f);return [k,fs.existsSync(p)&&fs.statSync(p).isFile()?digest(fs.readFileSync(p)):null];
    })),
  } : {},
  prepare:()=>prepareLineSource({opt,num,argv,out,root,log:console.log}),
}) : null;
// Ink lines held to the target (src/paint/methods/ink-lines-file.mjs), after every route that sets the line files.
// --linesupport t (L*, default 0 off): keep only the parts of the opening and closing lines along which the target
// shows a line at least t L* darker than beside it. --linesmooth mm (default 0 off): smooth stepped traces at mm,
// keeping corners sharper than --linesmoothcorner degrees (default 50). Either writes <out>/ink-<stage>-lines.json and
// points the pen at it. --inkdarkcap and --inkwidthfloor also need the target's measures, so they run it too. It runs
// again in a process that takes over a saved painting (--resumestate), on the line files as they now stand.
const holdInk = () => opt('drawing','first') !== 'none' && opt('image','')
  ? holdInkLines({ opt, num, argv, image: path.resolve(root, opt('image','')), root, out, sheetMm: num('sheetmm', DEFAULT_SHEET_MM), log: console.log }) : null;
ctx.INK_LINES = await holdInk();
process.env.GPU_DEMAND_READBACK ??= NATIVE_PAINT_MODE.mode==='fast'?'fast':'0';
process.env.GPU_SIGNED_ZERO ??= NATIVE_PAINT_MODE.mode==='fast'?'ignore':'exact';
const FAST_PAPER_OBSERVE=num('fastpaperobserve',NATIVE_PAINT_MODE.mode==='fast'?1:0);
if(![0,1].includes(FAST_PAPER_OBSERVE))throw Error('--fastpaperobserve takes 0 or 1');
const PAPER_OBSERVE_POLICY={requested:FAST_PAPER_OBSERVE,enabled:NATIVE_PAINT_MODE.mode==='fast'&&FAST_PAPER_OBSERVE===1&&process.env.GPU_PAPER_OBSERVE!=='0',scope:'fresh regional W/s plus wet-recipient M observation only; pigment/layer freshness independent; CPU stroke/demand windows use original full observation'};
process.env.GPU_PAPER_OBSERVE=PAPER_OBSERVE_POLICY.enabled?'1':'0';NATIVE_PAINT_MODE.paperObservation=PAPER_OBSERVE_POLICY;
NATIVE_PAINT_MODE.syncPolicy={demand:process.env.GPU_DEMAND_READBACK,paperObservation:PAPER_OBSERVE_POLICY.enabled,frames:!FRAME_POLICY.all?'completed passage checkpoints at 10/25/50/75/100 percent and every completed value band; first wash and other stages retained':NATIVE_PAINT_MODE.mode==='fast'?'completed paint boundary every fourth pass and every completed value band; other stages retained; no within-stroke snapshots':'full existing cadence',optical:NATIVE_PAINT_MODE.mode==='fast'||SPEED_GPU_OPTICS?'GPU optical RGB for frame and density feedback':'CPU composite',mask:NATIVE_PAINT_MODE.mode==='fast'?'demand CPU uploads conservatively retain all pigment lanes and signed zero':'original'};
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
  // --regionstyle family=style[,family=style]: per-run region style override on top of the plan's styleSelection.
  if(!c||!opt('regionstyle',''))return c;const base=c.styleSelection;if(!base)throw Error('--regionstyle needs a value plan with a styleSelection');
  const regions={...(base.regions??{})};for(const kv of opt('regionstyle','').split(',')){const [family,style]=kv.split('=');if(!family||!style)throw Error('--regionstyle family=style');regions[family]={style,reason:'run override --regionstyle for an A/B test'};}
  return {...c,styleSelection:{...base,regions}};})();
// value plan keys nothing reads are logged and exit 3 like unused options (src/paint/plan-keys.mjs); --allowunusedplan 1 allows them
if(opt('valueplan',''))reportUnusedPlanKeys({file:path.resolve(root,opt('valueplan','')),pipeline:Boolean(PIPELINE),out,allow:opt('allowunusedplan','0')!=='0'});
if(VALUE_CONFIG?.sheet?.widthMm!=null&&Math.abs(num('sheetmm',VALUE_CONFIG.sheet.widthMm)-VALUE_CONFIG.sheet.widthMm)>1e-6)throw Error(`value plan sheet.widthMm ${VALUE_CONFIG.sheet.widthMm} does not match --sheetmm ${num('sheetmm',VALUE_CONFIG.sheet.widthMm)}`);
const VALUE_ENABLED=!opt('areaplan','') && opt('order','painter')==='painter';
ctx.LINE_EDGES=null; ctx.VALUE_PLAN=null; ctx.VALUE_ACTIVE=null; ctx.VALUE_OWN_CONTACT=new EpochCells(); ctx.VALUE_PIGMENT_CONTACT=new EpochCells(); ctx.VALUE_COMMAND=0;const VALUE_COUNTS=Array.from({length:5},(_,i)=>({band:i+1,strokes:0,contacts:0}));
// --washsession 1: the shapes of one pass (the fragments of one passage) are laid in one wet session, with no drying
// between them; the sheet dries before the pass and after it. 2: also the passes of one band and region in other
// pigments, charged into the same wet wash. 0 starts every shape on a dry sheet.
// --softwet mm: the plan's soft boundaries get clean water just past them (soft-edges.mjs). Default 0, off.
const SOFT_WET_MM = num('softwet', 0);
const WASH_SESSION = Math.max(0, Math.round(num('washsession', NATIVE_PAINT_MODE.mode==='fast' && opt('valueplan','') ? 1 : 0)));
ctx.WASH_LAST = null;

const MAJOR_FILE=opt('majorintent',''), MAJOR_INTENT=MAJOR_FILE?validateLegacyIntent(JSON.parse(fs.readFileSync(path.resolve(root,MAJOR_FILE))),{imageSHA:sha256(path.resolve(root,opt('image'))),loadedContact:num('loadedcontact',0)}):null;ctx.MAJOR_TECHNIQUE=null; ctx.MAJOR_COMMAND=0; ctx.MAJOR_PREVIOUS=null; ctx.MAJOR_PLANE_CONTACT=null;
if(MAJOR_INTENT)fs.writeFileSync(path.join(out,'major-intents-before.json'),JSON.stringify(MAJOR_INTENT,null,2));
const NUMERIC_TUFT_SHAPES=opt('numerictuftshapes','').split(',').filter(Boolean),NUMERIC_TUFT_CAL=new Map();
if(NUMERIC_TUFT_SHAPES.length&&!MAJOR_INTENT)throw Error('numerictuftshapes requires target-bound major material instructions');
// where the wall clock goes between the big sections, printed at the end as `phases:` (changes no output)
const WALL_PHASES = [`load ${process.uptime().toFixed(1)}s`]; let phaseT = performance.now();
const phaseMark = name => { const t = performance.now(); WALL_PHASES.push(`${name} ${((t - phaseT) / 1000).toFixed(1)}s`); phaseT = t; if (process.env.PHASE_EXIT === name) { console.log(`phases: ${WALL_PHASES.join(', ')} (PHASE_EXIT)`); process.exit(0); } };

const srcMeta = await sharp(path.resolve(root, opt('image'))).metadata();
const src = sharp(path.resolve(root, opt('image'))).flatten({ background: '#ffffff' }).resize({ width: num('width', 700) });
const { data: PX_SOURCE, info } = await src.removeAlpha().raw().toBuffer({ resolveWithObject: true });
const paperSetupStarted = performance.now();
// --washinkfree 1 (needs --drawingfile): the planner reads the target with the planned pen lines filled from their
// surroundings (src/crop/ink-free.mjs), so the wash carries mass and the pen carries line, not both. Pre-paint only.
// --washinkfile <base>: the line file of the target's own ink to remove, when the pen draws a different drawing
// (a cleaner opening file). Default: the --drawingfile.
const PX_RAW = num('washinkfree', 0) > 0 && (opt('washinkfile', '') !== '' || opt('drawing', 'first') !== 'none') ? (() => {
  const base = opt('washinkfile', '') || opt('drawingfile', ''); if (!base) throw Error('--washinkfree needs --drawingfile');
  const doc = JSON.parse(readLineText(path.resolve(root, linePaths(base).lines)));
  const r = removePlannedInk(PX_SOURCE, info.width, info.height, doc, { sheetMm: num('sheetmm', DEFAULT_SHEET_MM), marginMm: num('washinkmargin', 0.3) });
  console.log(`wash target: planned ink removed from ${r.changed} cells (${(100 * r.changed / (info.width * info.height)).toFixed(1)}% of the sheet)`);
  return Buffer.from(r.rgb);
})() : PX_SOURCE;
// --targetguard gentle|hard|warn|off (tools/guard/no-target.mjs): from the first mark on, px and maps made from it are sealed.
// gentle (default) blocks reads but allows shape-level looks; hard also caps looks (--lookbudget, default 100); warn only records.
const TARGET_GUARD = createTargetGuard({ mode: opt('targetguard', DEFAULT_MODE), targetPaths: [path.resolve(root, opt('image', ''))], log: null, lookBudget: opt('lookbudget', '') === '' ? null : num('lookbudget', HARD_LOOK_BUDGET) });
const paintingLook = paintingLooks(TARGET_GUARD, num('notargetlooks', 0));
if (TARGET_GUARD.mode !== 'off') process.on('exit', () => { try { fs.mkdirSync(out, { recursive: true }); writeGuardReport(TARGET_GUARD, out, { image: opt('image', '') }); } catch (e) { console.error(`target guard: could not write target-guard.json: ${e.message}`); } });
ctx.px = TARGET_GUARD.register('px', PX_RAW);
const w = info.width, h = info.height, n = w * h;
// Segments before every painting: SAM's regions of the target, cached by its hash; without SAM the run fails (src/crop/segment-prep.mjs)
const SEGMENTS_RECORD = prepareSegments({ image: path.resolve(root, opt('image')), root, out, opt, log: console.log });
// --subjectwash 1: the washes cut by subject as well as by colour and value (src/paint/methods/subject-washes.mjs)
const SUBJECTS = await subjectWashField({ image: opt('image', ''), px: ctx.px, w, h, families: VALUE_CONFIG?.families ?? [], shaped: num('shapedmarks', 0) > 0, opt, num, log: console.log });
// Above 540 px, bristles are capped so GPU strokes fit workgroup memory: (hairs + 2) x (4 + pigments) <= 4000 floats, at most 576.
// Uncapped strokes fall back to the CPU. HAIR_CAP=0 turns the cap off.
const createBrush = o => createBrushRaw(gpuHairCap(scaleBrushForDensity(o, { renderWidth: w * num('scale', 1) })));
// --mmspacing 0|1: space brush dabs by sheet size, not cells, so marks match at any resolution. Default 1 above 540 px.
const MM_SPACING_ON = () => { try { return num('mmspacing', w > 540 ? 1 : 0) > 0; } catch { return false; } };
const dabSpacing = o => { if (!MM_SPACING_ON()) return o; const f = w / 540; return { ...(o ?? {}), spacing: (o?.spacing ?? 0.7) * f }; };
const physicalStroke = (b, t, p, o) => physicalStrokeRaw(b, t, p, dabSpacing(o));
const candidateContact = (b, t, p, o) => candidateContactRaw(b, t, p, dabSpacing(o));
function gpuHairCap(o) {
  let K; try { K = ctx.SHEET_PIGS.length; } catch { K = 16; }
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


const lum = i => 0.2126 * ctx.px[i * 3] + 0.7152 * ctx.px[i * 3 + 1] + 0.0722 * ctx.px[i * 3 + 2];
// Paper and palette flags (--papermargin, --paper, --pigs, --gain, --neutral, --palettepick, --greypick, --widepick,
// --palettemargin, --greymargin, --boxpick, --boxmargin, --boxgain) are documented in src/crop/palettepick.mjs.
// --paperbase auto|source|white: paper colour, independent of the --paper texture. Without it, --paper decides.
const PAPER_PICK = paperOf(ctx.px, w, h, { margin: num('papermargin', 0.03), mode: opt('paperbase', ['auto', 'source', 'white'].includes(opt('paper', 'coldpress')) ? opt('paper', 'coldpress') : 'auto') });
// --paperrgb r,g,b|auto|source: declared sheet colour (source uses paperbase). auto keeps a cream target sheet (red 10+ above blue), else bright white 252,251,248.
// auto reads the sheet from the largest connected bright region (estimatePaper), not the lightest tenth.
const TONE_MODE = opt('tonestage', '0');
if (!['0', '1', 'auto'].includes(TONE_MODE)) throw Error('--tonestage: 0, 1 or auto');
const SHEET_TONE = TONE_MODE === '0' ? { toned: false } : detectSheetTone(ctx.px, w, h);
// One delivery contract (0.3.3): values are planned against the sheet's own optics (cell light, value steps, mass tone;
// plan-darkness.md) and every passage is charged from a swatch of its own brush and passes (glaze-yield.md). The plan
// states values and the engine delivers them, so no dark, cool or middle gain exists to compensate, and no switch.
for (const k of ['calibratedplan', 'instrumentcal', 'darkgain', 'coolgain', 'midgain']) if (optIdx(k) >= 0) throw Error(`--${k} was removed in 0.3.3: the plan is calibrated to the sheet and each passage is charged from its own swatch, so there is no gain or switch to set`);
const CALIBRATED_PLAN=true;
const PAPER_RULE=num('paperrule',0)>0;
const WASH_SHEET=PAPER_RULE?sheetColour(ctx.px,w,h):null;
const PAPER_EST = opt('paperrgb', '') === 'auto' ? estimatePaper(ctx.px, w, h, new Float32Array(w * h)) : null;
const PAPER_AUTO = opt('paperrgb', '') === 'auto' ? (WASH_SHEET?WASH_SHEET.rgb:SHEET_TONE.toned ? SHEET_TONE.paperRGB : PAPER_EST && PAPER_EST.touchesBorder && PAPER_EST.rgb[0] - PAPER_EST.rgb[2] >= 10 ? PAPER_EST.rgb.map(v => Math.round(v)) : [252, 251, 248]) : null;
const PAPER_DECLARED = opt('paperrgb', '') === 'source' ? PAPER_PICK.paperRGB : PAPER_AUTO ?? (opt('paperrgb', '') ? opt('paperrgb', '').split(',').map(Number) : null);
if (PAPER_AUTO) console.log(`paper: auto sheet ${PAPER_AUTO.join('/')} from the largest bright region ${PAPER_EST ? PAPER_EST.rgb.map(v => v.toFixed(0)).join('/') + ' (' + (100 * PAPER_EST.cells / (w * h)).toFixed(1) + '% of the sheet)' : 'none (under 1%)'}`);
if (PAPER_DECLARED && (PAPER_DECLARED.length !== 3 || PAPER_DECLARED.some(v => !(v > 0 && v <= 255)))) throw Error('--paperrgb needs three values in 1..255');
const { lightest, white: whitePaper } = PAPER_PICK, paperRGB = PAPER_DECLARED ?? PAPER_PICK.paperRGB;
if (whitePaper) console.log(`paper: the lightest tenth reads ${lightest.map(v => v.toFixed(0)).join('/')}, painting on white paper`);
// --palettefrom file: fit the pans to this artwork and paint the photograph with them; content still comes from the photograph.
// --washsplat 1: loaded wash brushes (capacity 50+, dip 0.3+) lay soft round splats instead of hairs (src/media/brush.mjs). Default off.
// --splatwater s: splat water and wet-film trade, as a multiple of one hair's touch along a sweep. Default 2.
const WASH_SPLAT_SETTINGS={enabled:num('washsplat',0)>0,water:num('splatwater',2)};
setWashSplat(WASH_SPLAT_SETTINGS.enabled,{water:WASH_SPLAT_SETTINGS.water});
// --runcache 0: refit the palette every run instead of reading it from work/cache (src/paint/run-cache.mjs). Default 1.
// Sweep jobs unpack into a private /root/sweepwork/<job> tree which is removed after painting.
// Keep pure, code-and-input-hashed planner entries beside those trees so a repeat target can reuse them on that box.
const CACHE_ARGV = {}; for(let i=0;i<argv.length;i++)if(argv[i].startsWith('--')) { const key=argv[i],value=argv[i+1]?.startsWith('--')?true:argv[++i];if(!['--out','--pausedir','--resumestate','--resumeprefix','--allowdirty','--speedprofile','--speedcpu'].includes(key))CACHE_ARGV[key]=outputRelative(value,out); }
const planContentHashes=()=>{const hashes={};for(const key of ['valueplan','areaplan','drawingfile','drawinglast']){const f=opt(key,'');if(f)for(const suffix of ['', '-lines.json','-lines.json.gz']){const p=path.resolve(root,f+suffix);if(fs.existsSync(p)&&fs.statSync(p).isFile())hashes[key+suffix]=planFileDigest(p,out);}}return hashes;};
const CACHE_PLAN_HASHES=planContentHashes();
const CACHE_CONTEXT={argv:CACHE_ARGV,planHashes:CACHE_PLAN_HASHES,targetSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,opt('image','')))).digest('hex'),mode:opt('mode','fast'),backend:'cpu'};
Object.assign(RUN_CACHE,{context:CACHE_CONTEXT,guard:TARGET_GUARD});
const CODE_HASH = RUN_CACHE.enabled ? codeHash(root, [ENTRY_FILE]) : '';
const PALETTE_FROM_FILE = opt('palettefrom', '') && fs.existsSync(path.resolve(root, opt('palettefrom', ''))) ? crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root, opt('palettefrom', '')))).digest('hex') : '';
SPEED_PROFILE?.add('setup:paper-and-cache-key', performance.now() - paperSetupStarted);
const paletteFitStarted = performance.now();
Object.assign(ctx, { argv0, argv, PIPELINE, OPTS_READ, optIdx, NAN_GIVEN, TEXT_READ, WORD_GIVEN, WORD_OK, opt, num, 
  DRAWING_STAGE_INTENT, STROKE_BUDGET, optTrack, NATIVE_PAINT_MODE, SPEED_TRANSFERS, SPEED_PAPER, 
  SPEED_CONTACT, SPEED_VALUE_CACHE, SPEED_VALUE_ONLY, SPEED_COVERAGE, SPEED_UNIFORM_PAPER, measurePaper, liftResist, 
  VALUE_CONTACT_WORK, SPEED_GPU_OPTICS, OUTPUT_VIDEO, FRAME_POLICY, SPEED_PROFILE, CPU_PROFILE, PAINTER, root, out, 
  CODE_STATE, INK_RECIPE, DRAWING_REGISTRATION, RUN_CACHE, EARLY_LINES, holdInk, FAST_BODY_ENABLED, 
  FAST_BODY_SPACING, BODY_CADENCE_RECORD, SPARSE_CONTACT_RECORD, VALUE_CONFIG, VALUE_ENABLED, VALUE_COUNTS, 
  SOFT_WET_MM, WASH_SESSION, MAJOR_INTENT, NUMERIC_TUFT_SHAPES, NUMERIC_TUFT_CAL, WALL_PHASES, 
  phaseMark, srcMeta, PX_SOURCE, PX_RAW, TARGET_GUARD, paintingLook, w, h, n, SEGMENTS_RECORD, SUBJECTS, createBrush, 
  physicalStroke, candidateContact, ANCHORS, lum, TONE_MODE, SHEET_TONE, CALIBRATED_PLAN, PAPER_RULE, paperRGB, 
  WASH_SPLAT_SETTINGS, planContentHashes, CODE_HASH, PALETTE_FROM_FILE, paletteFitStarted });
}
