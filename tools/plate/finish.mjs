import {verifyNativeMarkCoverage} from './native-operation-recorder.mjs';
import {renderInkProof} from '../../src/paint/methods/ink-res.mjs';
// Lifting, the closing pen, gouache, and the files a finished painting writes.
// Stage 7 of 7 of tools/paint-plate.mjs. The stages run in order and share one object, ctx: see the entry file.
import {compactLowerLayers, layerStorageStats} from '../../src/media/layer-storage.mjs';
import {writeCensus} from '../speed/census-write.mjs';
import {writeRunCard} from '../../src/paint/run-card.mjs';
import {sourceScaleRecord} from './source-scale.mjs';
import {check} from '../../src/media/checks.mjs';
import {DEFAULT_SHEET_MM} from '../../src/media/sheet-size.mjs';
import {measurePaperDry} from '../../src/paint/methods/wetdry.mjs';
import {tapeStats, panelSVG} from '../stroke-stats.mjs';
import {evaluateGate, printGate} from '../stroke-gate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {ignoredSettings, badNumbers} from '../../src/paint/option-check.mjs';
import {execFile} from 'node:child_process';
import sharp from 'sharp';
import {paperRelief} from '../../src/media/paper-relief.mjs';
import {subcellLayers, SUBCELL_GAIN} from '../../src/media/subcell-grain.mjs';
import {step, layersOf, thickness, layersChanged, coherent} from '../../src/media/sheet.mjs';
import {gpuStats} from '../../src/media/gpu/link.mjs';
import {assertDeviceHealthy} from '../../src/media/gpu/device-health.mjs';
import {backendLine} from '../../src/media/gpu/backend-record.mjs';
import {renderLayers} from '../../src/media/km.mjs';
import {measureLine} from '../../src/paint/methods/pencil-line.mjs';
import {penEndPosition, eraseFactor} from '../../src/paint/methods/pencil-stage.mjs';
import {retimeRun, codeForImage, concatList, phaseAt, phaseShares, PHASES, labelFrames} from '../../src/paint/film-timeline.mjs';
import {dilate} from '../../src/raster.js';
import {intermediates} from '../../src/eval/composite.mjs';
import {planDensityOver} from '../../src/eval/plan-optics.mjs';
import {gaussian} from '../../src/keyframes/density.mjs';
import {gouacheCover, dryCover} from '../../src/media/gouache.mjs';
import {writeGuardReport} from '../guard/no-target.mjs';
import {cheatRisk} from '../guard/cheat-risk.mjs';

export async function finish(ctx) {
const { JSONL, argv0, argv, OPTS_READ, optIdx, NAN_GIVEN, TEXT_READ, WORD_GIVEN, WORD_OK, opt, num, 
  NATIVE_PAINT_MODE, SPEED_TRANSFERS, measurePaper, liftResist, OUTPUT_VIDEO, FRAME_POLICY, SPEED_PROFILE, 
  CPU_PROFILE, PAINTER, root, out, CODE_STATE, VALUE_CONFIG, WALL_PHASES, phaseMark, srcMeta, PX_RAW, 
  TARGET_GUARD, w, h, n, SEGMENTS_RECORD, createBrush, paperRGB, PALETTE, PIGS, STYLE, D_AIM, GOUACHE_LIGHTS, 
  LIGHT_SHARE, COLOUR_TRACE, SEP, FACE_INK, INK, PENCIL, 
  PENCIL_STAGE, GRAPHITE, SHEET_PIGS, GRAPHITE_AT, dry, dip, stroke, SC, W2, H2, N2, PB, 
  CP_MM, PAPER_OPTS, paper, ABLATE, INKRES, PEN_STATE_GATE, PEN_STATE_AUDIT, penDraw, OUT_W, OUT_H, O, GPU_INFO, 
  base, SHADE, render, LOOK_RES, view, renderFine, colourTrace, traceBox, colourMass, UPRIGHT, 
  expected, sheetDensity, marks, drainFrames, mark, CAL, FRAMES, FULL_TAPE, MARKTAPE, RESUME_AT, shoot, 
  FILM_BY_PAINT, up, SEED, t0, spent, clock, PROF, used, TECHS, LAST, DRAWING, 
  PEN_FIRST, DRAW_LAST, drawPass, PREPF, fadePrep, awareProvenance, awareBoundary } = ctx;
// a painting taken over at the closing boundary has had everything up to the closing drawing (AWARE_SKIP_POST)
const removeFilm=()=>{const value=liftResist(ctx.sheet);ctx.NATIVE_CAPTURE?.('film-remove');return value;};
const AWARE_SKIP_POST = RESUME_AT?.kind === 'closing';
if (!AWARE_SKIP_POST) dry(ctx.sheet, 20000, O, { levelMax: 900 });
colourMass('dried');

if (COLOUR_TRACE) await sharp(render(), {raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'colour-after-dry.png'));
colourMass('detailed');
if (COLOUR_TRACE) await sharp(render(), {raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'colour-after-detail.png'));
if (!FILM_BY_PAINT) await shoot();
if (!AWARE_SKIP_POST && marks.length && marks.at(-1)?.pass !== ctx.layers.length) {
  // read the finished washes when the cadence did not land on the last pass, so covered and forms see every pass
  mark(ctx.layers.length);
}
// the mask comes off last, and the paper under it is untouched
if(!AWARE_SKIP_POST&&ctx.VALUE_PLAN&&ctx.RESIST){dry(ctx.sheet,30000,O,{levelMax:140,dt:2});const paper=measurePaperDry(ctx.sheet);check('value-plan film removal requires dry base',paper.dry,{waterMax:paper.waterMax,saturationMax:paper.saturationMax});JSONL.append(path.join(out,'value-commands.jsonl'),JSON.stringify({kind:'physical-film-remove',paper,operation:'existing real liftResist after final shadow; no white overlay'})+'\n');}
if (!AWARE_SKIP_POST && ctx.RESIST) { removeFilm(); dry(ctx.sheet, 20000, O, { levelMax: 200 }); ctx.STAGE = { stage: 'lift', step: 'frisket off' }; if (!FILM_BY_PAINT) await shoot(); }

if (PREPF) { const f = fadePrep();ctx.NATIVE_CAPTURE?.('preparation-fade'); let a = 0; for (const v of PREPF.applied) a += v; console.log(`prep fade: the drawing held at ${(100 * a / N2).toFixed(1)}% on average before the closing pen (${f} cells faded in the last step)`); }
// --pencilerase 1: the pencil the finish does not keep, lifted with a kneaded eraser once the washes are dry and before
// the closing pen; wholly off clean paper, in part where paint lies over it (pencil-stage.mjs eraseFactor)
if (!AWARE_SKIP_POST && PENCIL && num('pencilerase', 0) > 0) {
  const keep = up(dilate(SEP.ink, w, h, Math.round(num('pencilkeep', 2))));
  const kk = PIGS.map(p => (p.K[0] + p.K[1] + p.K[2]) / 3), paint = new Float32Array(N2);
  for (const L of layersOf(ctx.sheet)) for (let j = 0; j < PIGS.length; j++) { const a = L[j], q = kk[j]; for (let i = 0; i < N2; i++) paint[i] += a[i] * q; }
  const f = eraseFactor(keep, paint, { bare: num('pencilbare', 0.85), under: num('pencilunder', 0.5), clean: num('pencilclean', 0.08) });
  let before = 0, after = 0;
  for (const L of [ctx.sheet.G, ctx.sheet.D, ctx.sheet.P, ...ctx.sheet.layers]) { const a = L[GRAPHITE_AT]; for (let i = 0; i < N2; i++) { before += a[i]; a[i] *= f[i]; after += a[i]; } }
  layersChanged(ctx.sheet);
  console.log(`pencil erase: ${(100 * (1 - after / Math.max(1e-9, before))).toFixed(1)}% of the graphite lifted, ${(100 * keep.reduce((a, v) => a + (v ? 1 : 0), 0) / N2).toFixed(1)}% of the sheet kept as the finish's line`);
  ctx.STAGE = { stage: 'lift', step: 'pencil erased' };ctx.NATIVE_CAPTURE?.('pencil-erased');
  await shoot();
}
if (DRAW_LAST && DRAWING !== 'none' && !AWARE_SKIP_POST) await awareBoundary({ kind: 'closing' });
if (DRAW_LAST && DRAWING !== 'none') {
  ctx.WASH_THK = thickness(ctx.sheet).map(a => Float32Array.from(a));
  await sharp(view(), { raw: { width: W2, height: H2, channels: 3 } }).jpeg({ quality: 92 }).toFile(path.join(out, 'wash.jpg'));
  if (opt('draw', '1') !== '0') await drawPass(null);
}
// --smalllights gouache|both: white gouache last where the source has a small light and the painting reads over --gouachemargin denser.
// --gouachefull: light share that covers a cell (default 0.5); --gouacheopacity 0.9, --gouachedry 0.5: hiding and dry-brush misses.
if (GOUACHE_LIGHTS) {
  const want = gouacheCover(LIGHT_SHARE, sheetDensity(render()), ctx.SRC, n, { margin: num('gouachemargin', 0.08), full: num('gouachefull', 0.5) });
  const big = SC === 1 ? want : Float32Array.from({ length: N2 }, (_, i) => want[(((i / W2) | 0) / SC | 0) * w + ((i % W2) / SC | 0)]);
  const cover = dryCover(big, paper.height, N2, { opacity: num('gouacheopacity', 0.9), dry: num('gouachedry', 0.5) });
  let cells = 0, sum = 0; for (let i = 0; i < n; i++) if (want[i] > 0) cells++; for (let i = 0; i < N2; i++) sum += cover[i];
  ctx.GOUACHE = { cover, rgb: paperRGB.map(c => c + (252 - c) * 0.7) };
  console.log(`gouache: white over ${cells} cells (${(100 * cells / n).toFixed(2)}% of the sheet), mean cover ${(sum / Math.max(1, cells * SC * SC)).toFixed(2)} where laid`);
  ctx.STAGE = { stage: 'gouache' };ctx.NATIVE_CAPTURE?.('gouache-layer');
  if (!FILM_BY_PAINT) await shoot();
}
colourMass('finished');
if(COLOUR_TRACE) fs.writeFileSync(path.join(out,'colour-trace.json'),JSON.stringify({box:traceBox,pigments:PIGS,trace:colourTrace},null,2));
ctx.STAGE = { stage: 'finished' };
if (FILM_BY_PAINT) await shoot(); else { await shoot(); await shoot(); await shoot(); }
console.log(`techniques: ${Object.entries(used).map(([k, v]) => `${k} ${v}`).join(', ')}`);
if (ctx.dropped) console.log(`${ctx.dropped} passages yielded no brush path and were never painted, carrying ${(100 * ctx.droppedMass / Math.max(1e-6, ctx.plannedMass)).toFixed(1)}% of the planned mass; the plan counts them delivered`);
fs.writeFileSync(path.join(out, 'designed-execution.json'), JSON.stringify({ ...(ctx.DESIGNED_EXECUTION ?? { laneStrokes: 0, brushChoiceStrokes: 0 }), plannedStyle: null }, null, 2));
await drainFrames();
const judged = intermediates(marks, w, h, gaussian);
if (judged.steps.length) console.log(`carried the plan: forms ${(100 * judged.endFormKept).toFixed(0)}% at agreement ${judged.endFormStructure.toFixed(2)}; at one cell ${(100 * judged.endFineKept).toFixed(0)}% at ${judged.endStructure.toFixed(2)} (the tooth, which the plan cannot state)`);
for (const f of judged.flags) console.log(`  ! ${f}`);
{
  // What each pigment was planned against what the sheet holds of it, so a wrong hue can be traced to one pigment.
  const th = thickness(ctx.sheet), rows = [];
  for (let j = 0; j < PIGS.length; j++) { let planned = 0, got = 0; for (let i = 0; i < n; i++) planned += expected[i * PIGS.length + j]; for (let i = 0; i < N2; i++) got += th[j][i]; rows.push(`${j} ${(got / Math.max(1e-6, planned * SC * SC)).toFixed(2)}`); }
  console.log(`pigment delivered over planned: ${rows.join(', ')}`);
}
if (marks.length) {
  // covered: of the cells the plan washes, the share holding at least half of it by tone. Both sides through the same
  // optics: the plan is rendered on flat paper as plan.jpg is.
  const paintedD = ctx.lastPainted;
  const planD = planDensityOver(expected, PIGS, paperRGB, n);
  let asked = 0, arrived = 0;
  for (let i = 0; i < n; i++) if (planD[i] > 0.1) { asked++; if (paintedD[i] >= 0.5 * planD[i]) arrived++; }
  const cov = asked ? arrived / asked : 1;
  console.log(`covered: ${(100 * cov).toFixed(0)}% of the cells the plan washes hold half their tone`);
  const by = TECHS.map((name, k) => { let a = 0, b = 0; for (let i = 0; i < n; i++) if (LAST[i] === k + 1 && planD[i] > 0.1) { a++; if (paintedD[i] >= 0.5 * planD[i]) b++; } return a ? `${name} ${(100 * b / a).toFixed(0)}% of ${a}` : null; }).filter(Boolean);
  console.log(`  by the technique that laid it last: ${by.join(', ')}`);
  if (cov < 0.9) console.log(`  ! ${(100 * (1 - cov)).toFixed(0)}% of the planned wash never arrived: passages dropped, or laid as marks with paper between`);
}
phaseMark('painting');
if (TARGET_GUARD.mode !== 'off') { TARGET_GUARD.endPaint(); ctx.px = TARGET_GUARD.opened(PX_RAW); const g = TARGET_GUARD.summary(); console.log(`target guard: ${g.violations} paint-time target reads${g.violations ? ' (' + Object.keys(g.byName).join(', ') + ')' : ''}`); }
console.log(`time: ${Object.entries(spent).map(([k, v]) => `${k} ${(v / 1000).toFixed(0)}s`).join(', ')}`);
console.log(`profile: ${Object.entries(PROF).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`).join(', ')}`);
console.log(`${ctx.laid} brush sweeps, ${ctx.frame} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);

if(COLOUR_TRACE) await sharp(INKRES ? INKRES.compose(render()) : render(), {raw:{width:OUT_W,height:OUT_H,channels:3}}).png().toFile(path.join(out,'colour-final.png'));
// --subgrid N: spread settled pigment over N x N sub-cells by the cold-press relief, each cell keeping its pigment. Default 0.
// Water stays at the sheet's grid. Written as painting-fine.jpg and averaged back as reflectance. Cold-press paper only.
const SUBGRID = Math.round(num('subgrid', 0));
const renderSub = () => {
  const coarse = view();
  if (SUBGRID < 2 || !CP_MM || INKRES) return { coarse, fine: null };
  // the sheet's settled pigment spread over the same paper evaluated N times finer (src/media/subcell-grain.mjs): each
  // cell keeps its pigment, granulating paint gathers in the fine pits, staining paint only interpolates
  const N = SUBGRID, FW = W2 * N, FH = H2 * N, FN = FW * FH;
  const hF = paperRelief(FW, FH, CP_MM / N, { seed: PAPER_OPTS.seed, relief: PAPER_OPTS.relief ?? 'cold' }).height;
  const fineLayers = subcellLayers(layersOf(ctx.sheet), SHEET_PIGS, ctx.sheet.paper, N, { gain: SUBCELL_GAIN * num('subgridgain', 1) });
  const fbase = new Uint8Array(FN * 3);
  for (let i = 0; i < FN; i++) { const shade = 1 - SHADE + SHADE * hF[i]; for (let ch = 0; ch < 3; ch++) fbase[i * 3 + ch] = Math.round(Math.min(255, paperRGB[ch] * shade)); }
  const fine = Buffer.from(renderLayers(fineLayers, SHEET_PIGS, fbase, FN)), avg = Buffer.alloc(N2 * 3), acc = new Float64Array(N2 * 3);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { const c = ((y / N) | 0) * W2 + ((x / N) | 0); for (let ch = 0; ch < 3; ch++) acc[c * 3 + ch] += fine[(y * FW + x) * 3 + ch]; }
  for (let i = 0; i < N2 * 3; i++) avg[i] = Math.round(acc[i] / (N * N));
  console.log(`subgrid: settled pigment over ${N}x${N} sub-cells of the paper's relief at ${(CP_MM / N).toFixed(3)} mm, painting-fine.jpg ${FW}x${FH}`);
  return { coarse: avg, fine };
};
const FINAL = renderSub();
if (FINAL.fine) await sharp(FINAL.fine, { raw: { width: W2 * SUBGRID, height: H2 * SUBGRID, channels: 3 } }).jpeg({ quality: 92 }).toFile(path.join(out, 'painting-fine.jpg'));
if (LOOK_RES > 1 && !INKRES) { const F = renderFine(); await sharp(F.buf, { raw: { width: F.FW, height: F.FH, channels: 3 } }).jpeg({ quality: 92 }).toFile(path.join(out, 'painting-fine.jpg')); }
const FINAL_PIXELS=INKRES ? INKRES.compose(view()) : FINAL.coarse;
assertDeviceHealthy(ctx.sheet); // a broken GPU device never writes a painting (src/media/gpu/device-health.mjs)
await sharp(FINAL_PIXELS,{raw:{width:OUT_W,height:OUT_H,channels:3}}).png().toFile(path.join(out,'painting.png'));
if(ctx.NATIVE_RECORDER){
 try{
  if(ctx.NATIVE_RECORDING_FAILURE)throw Error(ctx.NATIVE_RECORDING_FAILURE);
  if(ctx.NATIVE_UNOBSERVED_ROUTES?.length)throw Error('Incomplete native recording: direct marks in '+ctx.NATIVE_UNOBSERVED_ROUTES.join(', '));
  verifyNativeMarkCoverage(MARKTAPE,ctx.NATIVE_MARK_COUNTS);
  const decoded=await sharp(path.join(out,'painting.png')).removeAlpha().raw().toBuffer();
  if(!decoded.equals(Buffer.from(FINAL_PIXELS)))throw Error('Native recording final PNG pixel mismatch');
  ctx.NATIVE_RECORDER.finish(decoded,{stage:ctx.STAGE});
 }catch(error){
  ctx.NATIVE_RECORDER.abort(error.message);
  fs.writeFileSync(path.join(out,'native-recording-failure.json'),JSON.stringify({complete:false,error:error.message,paintingRetained:true}));
  console.error('NATIVE RECORDING INCOMPLETE: '+error.message+'; painting and physical tape retained; run FAILED');
  process.exitCode=4;
 }
}
await sharp(FINAL_PIXELS,{raw:{width:OUT_W,height:OUT_H,channels:3}}).jpeg({quality:92}).toFile(path.join(out,'painting.jpg'));
let exportedMarkTape = null;
if (MARKTAPE) {
  const file = path.join(out, 'marks.json');
  const { BRUSHES, BRUSHOPTS, PENS, PENOPTS } = await import('../../src/media/brush.mjs');
  // The physics reads more than K and S (rho, omega, gamma, floc, wick), so the tape copies every own property of a pigment.
  const asTape = p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, ArrayBuffer.isView(v) ? Array.from(v) : v]));
  // Everything a player needs to make the same sheet: the paper recipe, the pans, the flow options and the base.
  const { markTapeJSON } = await import('../../src/media/mark-tape-json.mjs');
  exportedMarkTape = {
    w: W2, h: H2, scale: 10, sheetWidthMm: PB?.mm ?? num('sheetmm', DEFAULT_SHEET_MM),
    version:2, methods:ctx.RUN_METHODS, paper:PAPER_OPTS, paperRGB, paperShade:SHADE, strokeCount:MARKTAPE.filter(m=>['s','P','g'].includes(m.k)).length,
    base: Array.from(base.subarray(0, 3)),
    opts: O,
    pigments: SHEET_PIGS.map(asTape), brushOpts: BRUSHOPTS, brushes: BRUSHES, penOpts: PENOPTS, pens: PENS, marks: MARKTAPE,
  };
  if (FULL_TAPE) { const fd = fs.openSync(file, 'w');
  try { for (const chunk of markTapeJSON(exportedMarkTape)) fs.writeFileSync(fd, chunk); } finally { fs.closeSync(fd); }
  const strokes = MARKTAPE.filter(m => m.k === 's'), lines = MARKTAPE.filter(m => m.k === 'P');
  const pts = strokes.reduce((a, m) => a + m.d.length, 0), lpts = lines.reduce((a, m) => a + m.d.length, 0);
  console.log(`marks: ${strokes.length} strokes over ${pts} points, ${lines.length} pen lines over ${lpts} points, ${MARKTAPE.length - strokes.length - lines.length} other, ${BRUSHES.length} brushes over ${BRUSHOPTS.length} shapes, ${PENS.length} pens over ${PENOPTS.length} nibs, ${(fs.statSync(file).size / 1048576).toFixed(2)} MB`); }
}
{
  // Pen last: the ink is what the sheet gained while drawing. Pen first: the ink is what the drawing laid, and the washes
  // are what the sheet holds beyond it (the washes moved some of that ink, so this is the layer as laid, not as left).
  const after = thickness(ctx.sheet);
  // with --drawing none no pen ran at all, so there is no wash snapshot to subtract and the ink layer is empty
  const empty = () => after.map(a => new Float32Array(a.length));
  const inkLayer = PEN_FIRST ? (ctx.INK_THK ?? empty()) : ctx.WASH_THK ? after.map((a, j) => Float32Array.from(a, (v, i) => Math.max(0, v - ctx.WASH_THK[j][i]))) : empty();
  await sharp(Buffer.from(renderLayers([inkLayer], SHEET_PIGS, base, N2, 1).buffer), { raw: { width: W2, height: H2, channels: 3 } }).jpeg({ quality: 92 }).toFile(path.join(out, 'ink.jpg'));
  // Proof export at the actual pen-sheet resolution; the legacy ink.jpg remains the coarse layer.
  // Unlike legacy opening-only ink.jpg, the coarse proof includes the closing pen
  // and the ink remaining after wash transport, excluding paint and graphite.
  const nativeInk = INKRES ? INKRES.nativeInk() : renderInkProof({ thickness: after, pigments: SHEET_PIGS, inkAt: PIGS.length, width: W2, height: H2 });
  await sharp(nativeInk.pixels, { raw: { width: nativeInk.width, height: nativeInk.height, channels: 3 } }).png().toFile(path.join(out, 'ink-native.png'));
  fs.writeFileSync(path.join(out, 'ink-native.json'), JSON.stringify({ width: nativeInk.width, height: nativeInk.height, sheetWidthMm: PB?.mm ?? num('sheetmm', DEFAULT_SHEET_MM), kind: INKRES ? 'deposited ink on native pen sheet, before wash redistribution' : 'final deposited coarse ink, including wash redistribution', resized: false }) + '\n');
  if (PEN_FIRST) {
    const washLayer = after.map((a, j) => Float32Array.from(a, (v, i) => Math.max(0, v - (ctx.INK_THK ? ctx.INK_THK[j][i] : 0))));
    await sharp(Buffer.from(renderLayers([washLayer], SHEET_PIGS, base, N2, 1).buffer), { raw: { width: W2, height: H2, channels: 3 } }).jpeg({ quality: 92 }).toFile(path.join(out, 'wash.jpg'));
  }
}
// Final contribution stats need both the finished painting and the exported ink layer.
if (MARKTAPE) {
  JSONL.flush();
  const strokeStats = await tapeStats(exportedMarkTape, out);
  const strokeGate = evaluateGate(strokeStats, { mode: opt('strokegate', 'warn'),
    config: opt('strokegateconfig', '') ? JSON.parse(fs.readFileSync(opt('strokegateconfig'), 'utf8')) : {} });
  fs.writeFileSync(path.join(out, 'stroke-stats.json'), JSON.stringify(strokeStats, null, 2));
  fs.writeFileSync(path.join(out, 'stroke-stats.svg'), panelSVG(strokeStats));
  fs.writeFileSync(path.join(out, 'stroke-gate.json'), JSON.stringify(strokeGate, null, 2));
  printGate(strokeGate);
  if (strokeGate.blocks) process.exitCode = 4;
}
await sharp(ctx.px, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 92 }).toFile(path.join(out, 'source.jpg'));
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
if (opt('thkdump', '0') !== '0') { coherent(ctx.sheet); const th = thickness(ctx.sheet); fs.writeFileSync(path.join(out, 'thickness.f32'), Buffer.concat(th.map(a => Buffer.from(a.buffer, a.byteOffset, a.byteLength)))); }
if(PEN_STATE_GATE) fs.writeFileSync(path.join(out,'pen-state-audit.json'),JSON.stringify(PEN_STATE_AUDIT,null,2));
if(ctx.sheet._layerStoragePolicy)compactLowerLayers(ctx.sheet,ctx.sheet._layerStoragePolicy());
fs.writeFileSync(path.join(out, 'backend.json'), JSON.stringify({ ...PAINTER, ...GPU_INFO, layerStorage:{main:layerStorageStats(ctx.sheet),...(INKRES?{fine:layerStorageStats(INKRES.fine)}:{})}, gpuStats: gpuStats(ctx.sheet), performanceOptions: { opticalThreads: ctx.opticalThreads, trackedTransfers: SPEED_TRANSFERS, edgePingPong: process.env.GPU_EDGE_PINGPONG === '1', fusedWetScanRequested: process.env.GPU_FUSE_WETSCAN === '1' } }, null, 1));
console.log(backendLine(GPU_INFO)); // the backend this painting was made on, again at the end (details in backend.json)
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
await drainFrames(); if (ctx.FRAMER) ctx.FRAMER.close();
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
  const risk = await cheatRisk({ run: out, target: path.resolve(root, opt('image', '')), sheetMm: num('sheetmm', DEFAULT_SHEET_MM), marks: exportedMarkTape });
  fs.writeFileSync(path.join(out, 'cheat-risk.json'), JSON.stringify(risk, null, 1));
  console.log(`cheat risk: ${risk.level} (${risk.risk})${risk.flags.length ? `, flags ${risk.flags.join(', ')}` : ''}${risk.review ? '; review the stage strip before showing this painting' : ''}`);
} catch (e) {
  fs.writeFileSync(path.join(out, 'cheat-risk.json'), JSON.stringify({ error: e.message, level: null, review: true }, null, 1));
  console.error(`cheat risk: could not score this painting: ${e.message}`);
  process.exitCode = 4;
}
console.log(`phases: ${WALL_PHASES.join(', ')}${ctx.RENDER_REUSED ? `; ${ctx.RENDER_REUSED} renders reused` : ''}`);
console.log(`${out}/painting.jpg${OUTPUT_VIDEO ? `\n${out}/painting.mp4` : '\nvideo disabled; actual stage images, frames and commands retained'}`);
// Typed options the run never read go to unused-options.txt and the run exits 3 after writing its outputs.
// --allowunused 1 turns the exit off. A recipe's defaults do not count.
{
  const given = [...new Set(argv0.filter(a => a.startsWith('--')).map(a => a.slice(2)))];
  const unused = given.filter(k => !OPTS_READ.has(k) && k !== 'allowunused');
  // typed settings that were read but could not act: a switch they need is off, nothing can make them act, or a number option was given a word
  const value = n => { const i = optIdx(n); return i >= 0 ? argv[i + 1] : undefined; };
  const ignored = [...ignoredSettings({ given, value }), ...badNumbers(NAN_GIVEN, TEXT_READ).map(b => ({ flag: b.flag, reason: `--${b.flag} takes a number, got "${b.value}"` }))];
  for (const [flag, word] of WORD_GIVEN) if (!WORD_OK.has(flag)) ignored.push({ flag, reason: `--${flag} takes 0 or 1, got "${word}"` });
  for (const r of ignored) { console.log(`IGNORED OPTION: ${r.reason}`); if (!unused.includes(r.flag)) unused.push(r.flag); }
  if (unused.length) {
    fs.writeFileSync(path.join(out, 'unused-options.txt'), unused.map(k => `--${k}`).join('\n') + '\n');
    console.log(`UNUSED OPTIONS (read by nothing in this run): ${unused.map(k => `--${k}`).join(' ')}`);
    // the job recipe always passes these two and only some paths read them: listed, but they do not fail a run
    const optional = new Set(['closeclean', 'drawstage']);
    if (opt('allowunused', '0') === '0' && unused.some(k => !optional.has(k))) process.exitCode = 3;
  }
}

writeRunCard({ provenanceHistory:ctx.PROVENANCE_HISTORY, provenance:awareProvenance(TARGET_GUARD.exportState().looks.count), root, out, args: argv0, expandedArgs: argv, subject: VALUE_CONFIG?.subject ?? null, imageFile: opt('image', ''), planFile: opt('valueplan', '') || opt('plan', ''), drawingFile: opt('drawingfile', ''), drawingOrder: opt('drawing', 'first'), drawingMedium: opt('outlinemedium', 'graphite'), mediumDecision: ctx.MEDIUM_DECISION ?? null, subjectMedium: opt('subjectmedium', 'pen') !== 'pen' ? { medium: opt('subjectmedium', 'pen'), override: ctx.SUBJECT_MEDIUM ? { asked: ctx.SUBJECT_MEDIUM.asked, drawn: 'graphite', dropped: ctx.SUBJECT_MEDIUM.dropped } : null } : null, code: CODE_STATE, segments: SEGMENTS_RECORD, linework: { source: ctx.LINE_SOURCE?.source ?? null, file: ctx.LINE_SOURCE?.file ?? null }, methods: ctx.RUN_METHODS, gpu: GPU_INFO, dimensions: { sourceWidth: srcMeta?.width ?? null, sourceHeight: srcMeta?.height ?? null, paintWidth: OUT_W, paintHeight: OUT_H, enlargement: srcMeta?.width ? +(OUT_W / srcMeta.width).toFixed(2) : null, ...(ctx.SOURCE_SCALE ? sourceScaleRecord(ctx.SOURCE_SCALE) : {}) }, palette: PALETTE.box ? { keys: PALETTE.box.keys, guard: PALETTE.box.guard ?? null } : null, phases: WALL_PHASES, caption: { subject: path.basename(opt('image', ''), path.extname(opt('image', ''))), role: null, codeSHA: (CODE_STATE?.commit ?? '').slice(0, 8) || null, looking: opt('notargetlooks', '0') === '1' ? 'strict' : 'looking', speed: opt('mode', 'full'), sourcePx: srcMeta?.width ? `${srcMeta.width}x${srcMeta.height}` : null, renderWidth: OUT_W, sheetMm: num('sheetmm', DEFAULT_SHEET_MM), date: new Date().toISOString() }, seconds: process.uptime(), exitCode: process.exitCode ?? 0 });
if (SPEED_PROFILE) SPEED_PROFILE.write(out, { phases: WALL_PHASES, painting: spent, cpu: PROF });
if (CPU_PROFILE) await CPU_PROFILE.stop(path.join(out, 'main.cpuprofile'));

JSONL.flush();
writeCensus(out, { main: ctx.sheet, fine: INKRES?.fine });
}
