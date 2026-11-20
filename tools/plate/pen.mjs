// Film frames and the plan of the pen drawing.
// Stage 4 of 7 of tools/paint-plate.mjs. The stages run in order and share one object, ctx: see the entry file.
import {fastPaintFrame} from '../speed/frame-policy.mjs';
import {scaleDrawingGestures} from '../../src/paint/methods/drawing-hand.mjs';
import {cutInDarkWash} from '../../src/paint/methods/ink-dark-skip.mjs';
import {prepareDrawing} from '../../src/paint/methods/material-profiles.mjs';
import {plannedEdges, supportedLines} from '../../src/paint/methods/line-support.mjs';
import {selectValueInk, drawsWholeFile, valueInkVerdict} from '../../src/paint/methods/value-shared.mjs';
import {DEFAULT_SHEET_MM} from '../../src/media/sheet-size.mjs';
import {linePaths, readLineText} from '../../src/crop/lines.mjs';
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
import {lineField, lineBudget} from '../../src/media/draw.mjs';
import {classifyInkPaths, inkFilterCounts, inkFilterOverlay} from '../../src/crop/inkfilter.mjs';
import {silhouette} from '../../src/crop/outline.mjs';
import {selectedDrawing, drawingWant} from '../../src/paint/methods/drawing-file.mjs';
import {fillSheetBase} from '../../src/paint/methods/sheet-tone.mjs';

export async function penPlan(ctx) {
const { opt, num, optTrack, NATIVE_PAINT_MODE, FRAME_POLICY, root, out, RUN_CACHE, VALUE_CONFIG, 
  phaseMark, srcMeta, PX_RAW, TARGET_GUARD, w, h, n, paperRGB, PIGS, COLOUR_BUDGET, MASS_BUDGET, 
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
const FULL_TAPE = opt('marks', '0') !== '0', MARKTAPE = startStrokeLedger({ full: FULL_TAPE });
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
  // (and whatever the checkpoint policy keeps: keeping every frame never keeps fewer)
  if(FRAME_POLICY.all && NATIVE_PAINT_MODE.mode==='fast' && !fastPaintFrame(ctx.STAGE) && !FRAME_POLICY.byDefault)return;
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
// The pen's drawing is planned whole before the first mark: where every line goes and how
// hard, from the reference and the plan, never from the sheet. drawPass, after TARGET_GUARD.beginPaint(), only draws it.
async function planPen(planD0, opts = {}) {
  const prev = [ctx.VALUE_ACTIVE, ctx.DRAW_STAGE];
  try { return await planPenInner(planD0, opts); } finally { [ctx.VALUE_ACTIVE, ctx.DRAW_STAGE] = prev; }
}
async function planPenInner(planD0, { first = false, fine = false } = {}) {
  ctx.VALUE_ACTIVE=null;
  ctx.DRAW_STAGE=first?'opening':'closing';
  const preparing = first && ctx.PREP;
  const DRAW_SOURCE = first && DRAW_GUIDE ? DRAW_GUIDE : ctx.SRC;
  const planD = planD0;
  const inkWant = new Float32Array(n);
  // --penwant src|glaze|residual: src follows the source's darks; residual what the washes leave. Default src first, residual after.
  // glaze: lines where src puts them, laying only the density the glazes over them will not supply.
  const penWant = opt('penwant', first ? 'src' : 'residual'), planShare = penWant === 'residual' ? 1 : 0;
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
  // the pen draws only a drawing file's lines (drawing-file.mjs); the walker that traced the subject was removed in 0.4
  const gestures = [];
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
  const drawn = [];
  // The pen follows the subject, else the finish field, as the washes do. Ground texture is a cross hatch,
  // never a traced contour.
  const PEN_FIELD = ctx.SUBJECT ?? FINISH;
  const penKeep = PEN_FIELD ? (g => { let inside = 0; for (const q of g.points) { const x = Math.min(w - 1, Math.max(0, Math.round(q.x))), y = Math.min(h - 1, Math.max(0, Math.round(q.y))); if (PEN_FIELD[y * w + x] >= num('pendrawat', 0.5)) inside++; } return inside >= g.points.length * num('penkeep', 0.5); }) : null;
  // --drawingfile <base>: the first pen draws a selected drawing whole, in strokes of a person's length, and nothing
  // the walker found (src/paint/methods/drawing-file.mjs)
  // --massbudget cuts the closing pen inside the masses; the opening drawing keeps them unless --masscutfirst 1
  const cutPen = MASS_BUDGET && (!first || num('masscutfirst', 0) > 0) ? MASS_BUDGET.cutPen : g => g;
  const SELECTED = cutPen(selectedDrawing({ first, fine, w, h, opt, num, log: console.log, walked: drawn.length, D: DRAW_SOURCE, want: inkWant, cells: CELLS, K, style: DRAW_STYLE, families: VALUE_CONFIG?.families ?? null }));
  let kept = SELECTED ? SELECTED : cutPen(penKeep ? drawn.filter(penKeep) : drawn);
  // --inkskin x0,y0,x1,y1 (sheet fractions): the closing pen keeps off warm skin interiors of the figure in the box. Default off.
  // --inkskinerode: interior erosion in cells (default 3); --inkskinshare: share of points inside that drops a gesture (default 0.6).
  if (!first && opt('inkskin', '') !== '') {
    const [bx0, by0, bx1, by1] = String(opt('inkskin', '0,0,1,1')).split(',').map(Number);
    const fig = ctx.SUBJECT, S0 = new Uint8Array(n);
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
    const fig = ctx.SUBJECT;
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
    const fig = ctx.SUBJECT, share = num('inkoffshare', 0.5);
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
  // --inkfilter: classify each path on the density the walker followed, once the budget and subject clip are applied.
  // The paths stay in the array either way: the schedule below is built from all of them.
  // --inkdarkskip v: no closing pen line inside the plan's darkest washes (planned value above v); the opening drawing
  // goes under the washes as a painter's does. src/paint/methods/ink-dark-skip.mjs
  if (ctx.VALUE_PLAN && !first && num('inkdarkskip', 0) > 0) { const before = kept.length; kept = cutInDarkWash(kept, ctx.VALUE_PLAN.value.values, w, h, num('inkdarkskip', 0)); console.log(`ink dark skip: ${before} ${first ? 'opening' : 'closing'} gestures cut to ${kept.length} runs outside planned value ${num('inkdarkskip', 0)}`); }
  // A prepared pencil drawing describes the same contours as pen, including paper-light borders.
  if(ctx.VALUE_PLAN){const before=kept,sourceInk=drawsWholeFile({first,fine,graphiteFirst,drawingFile:opt('drawingfile',''),closingFile:opt('drawinglast',''),sourceInk:sourceInkDrawing()});
    kept=selectValueInk(before,{first,w,h,sourceInk,density:ctx.VALUE_PLAN.value.values,reserves:ctx.VALUE_PLAN.protectedCells,shaped:ctx.VALUE_PLAN.instructions[0]?.shaped});
    // --lineedges 0 turns it off. A line from the plan's drawing file is drawn only when at least half of it lies on an
    // edge of a planned passage (src/paint/methods/line-support.mjs); a line inside one planned mass is left off whole.
    // The slack is one source pixel. A source's own pen lines are drawn as they are.
    // A prepared drawing (trace-drawing.py, inputKind drawing) is the whole drawing, kept as drawn in either medium: no plan edge cuts it.
    ctx.PREPARED_DRAWING??=(()=>{try{return !!opt('drawingfile','')&&JSON.parse(readLineText(linePaths(path.resolve(root,opt('drawingfile',''))).lines)).inputKind==='drawing';}catch{return false;}})();
    if(num('lineedges',1)>0&&!sourceInkDrawing()&&!(first&&ctx.PREPARED_DRAWING)&&drawsWholeFile({first,fine,graphiteFirst,drawingFile:opt('drawingfile',''),closingFile:opt('drawinglast','')})){
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
  scaled=prepareDrawing(scaled,{medium:graphiteFirst?opt('graphiteprofile',REQUESTED_DRAW_MEDIUM.startsWith('graphite-')?REQUESTED_DRAW_MEDIUM:'graphite-HB'):opt('inkprofile',REQUESTED_DRAW_MEDIUM.endsWith('-ink')?REQUESTED_DRAW_MEDIUM:STYLE_INK_DEFAULT),stage:first?'opening':'closing',mmPerCell:(PB?.mm??num('sheetmm', DEFAULT_SHEET_MM))/W2,edgeStrength:TARGET_DRAW_EDGE,w:W2,h:H2,caps:{...drawingCapsFor(first?'opening':'closing',graphiteFirst),share:SELECTED?1:num('drawshare',1)}});
  // the pressure along each gesture: the ridge's strength, or under --penwant glaze that times the share left to the ink
  // once the glazes are over it, not below --penfloor (default 0.2). The full-pressure point comes from ridge strength alone.
  const press = penWant !== 'glaze' ? field : Float32Array.from(field, (v, i) => v * Math.max(num('penfloor', 0.2), Math.min(1, (DRAW_SOURCE[i] - planD[i]) / Math.max(1e-3, DRAW_SOURCE[i]))));
  const peakOf = (() => { const v = []; for (const g of kept) for (const q of g.points) { const x = Math.round(q.x), y = Math.round(q.y); if (x >= 0 && y >= 0 && x < w && y < h) v.push(field[y * w + x]); } v.sort((a, b) => a - b); return v.length ? Math.max(1e-4, v[Math.floor(v.length * 0.95)]) : null; })();
  const peak = penWant === 'glaze' ? peakOf : null;
  const big = SC === 1 ? press : Float32Array.from({ length: N2 }, (_, i) => press[(((i / W2) | 0) / SC | 0) * w + ((i % W2) / SC | 0)]);
  let outlines = null;

  // Batches and pressure come from the whole planned set, not the survivors: drawGestures normalises pressure to the
  // 95th percentile of the want under its paths. So the peak and batch boundaries come from the unfiltered batch.
  const frozenPeak = gs => { const v = []; for (const g of gs) for (const q of g.points) v.push(big[Math.max(0, Math.min(H2 - 1, Math.round(q.y))) * W2 + Math.max(0, Math.min(W2 - 1, Math.round(q.x)))]); v.sort((a, b) => a - b); return v.length ? Math.max(1e-4, v[Math.floor(v.length * 0.95)]) : 1; };
  // The outline tier lies where the ridge field is gated to zero, so it takes a constant want at a fixed peak,
  // as the silhouette pass does; other paths in the batch cannot change its pressure.
  // a selected drawing brings its own pressure, stroke by stroke (--drawwant times each line's weight)
  const wantT1 = SELECTED ? drawingWant(SELECTED, W2, H2, SC, { base: num('drawwant', num('tier1want', 0.6)), floor: num('drawfloorwant', 0.15) }) : null;
  const per = Math.max(1, Math.ceil(scaled.length / 8));
  return { preparing, PEN, K, graphiteFirst, inkPig, scaled, wantT1, big, peak, inkVerdict, frozenPeak, per, SELECTED, outlines, gestures };
}
Object.assign(ctx, { FRAMES, snap, FULL_TAPE, MARKTAPE, AWARE_DIR, RESUME_DIR, RESUME_AT, shoot, WETFRAMES, 
  PASSFRAMES, WET_STEPS, FILM_BY_PAINT, PEN_FRAMES, LOOK_AL, 
  LOOK_PLAN, SOURCE_INK });
}
