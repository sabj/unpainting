// Lifting, the closing pen, gouache, and the files a finished painting writes.
// Stage 7 of 7 of tools/paint-plate.mjs. The stages run in order and share one object, ctx: see the entry file.
import {compactLowerLayers, layerStorageStats} from '../../src/media/layer-storage.mjs';
import {writeCensus} from '../speed/census-write.mjs';
import {writeRunCard} from '../../src/paint/run-card.mjs';
import {check} from '../../src/media/checks.mjs';
import {DEFAULT_SHEET_MM} from '../../src/media/sheet-size.mjs';
import {validateProductionDetails} from '../painter/semantic-production-details.mjs';
import {measurePaperDry} from '../../src/paint/methods/wetdry.mjs';
import {tapeStats, panelSVG} from '../stroke-stats.mjs';
import {evaluateGate, printGate} from '../stroke-gate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {ignoredSettings, badNumbers} from '../../src/paint/option-check.mjs';
import {execFile} from 'node:child_process';
import sharp from 'sharp';
import {coldPressField} from '../../src/media/paper.mjs';
import {step, layersOf, thickness, layersChanged, coherent} from '../../src/media/sheet.mjs';
import {gpuStats} from '../../src/media/gpu/link.mjs';
import {assertDeviceHealthy} from '../../src/media/gpu/device-health.mjs';
import {backendLine} from '../../src/media/gpu/backend-record.mjs';
import {renderLayers} from '../../src/media/km.mjs';
import {deliveryByBand, deliveryNote} from '../../src/paint/methods/delivery-report.mjs';
import {loadSubject} from '../../src/paint/methods/first-wash.mjs';
import {faceDetail} from '../../src/paint/techniques/face-detail.mjs';
import {measureLine} from '../../src/paint/methods/pencil-line.mjs';
import {penEndPosition, eraseFactor} from '../../src/paint/methods/pencil-stage.mjs';
import {retimeRun, codeForImage, concatList, phaseAt, phaseShares, PHASES, labelFrames} from '../../src/paint/film-timeline.mjs';
import {dilate} from '../../src/raster.js';
import {intermediates} from '../../src/eval/composite.mjs';
import {planDensityOver} from '../../src/eval/plan-optics.mjs';
import {gaussian} from '../../src/keyframes/density.mjs';
import {gouacheCover, dryCover} from '../../src/media/gouache.mjs';
import {layCurls} from '../../src/crop/curlpaint.mjs';
import {layDrags} from '../../src/paint/methods/drags.mjs';
import {writeGuardReport} from '../guard/no-target.mjs';
import {cheatRisk} from '../guard/cheat-risk.mjs';

export async function finish(ctx) {
const { JSONL, argv0, argv, OPTS_READ, optIdx, NAN_GIVEN, TEXT_READ, WORD_GIVEN, WORD_OK, opt, num, STROKE_BUDGET, 
  NATIVE_PAINT_MODE, SPEED_TRANSFERS, measurePaper, liftResist, OUTPUT_VIDEO, FRAME_POLICY, SPEED_PROFILE, 
  CPU_PROFILE, PAINTER, root, out, CODE_STATE, EARLY_LINES, VALUE_CONFIG, WALL_PHASES, phaseMark, srcMeta, PX_RAW, 
  TARGET_GUARD, w, h, n, SEGMENTS_RECORD, createBrush, paperRGB, PALETTE, PIGS, STYLE, D_AIM, GOUACHE_LIGHTS, 
  LIGHT_SHARE, MOD, DRAGS, DRAG_TARGET, COLOUR_TRACE, reportTechniques, CURLS, SEP, FACE_INK, INK, PENCIL, 
  PENCIL_STAGE, GRAPHITE, SHEET_PIGS, GRAPHITE_AT, AREA_COMPLETED, AREA_EXEC, dry, dip, stroke, SC, W2, H2, N2, PB, 
  CP_MM, PAPER_OPTS, paper, ABLATE, INKRES, PEN_STATE_GATE, PEN_STATE_AUDIT, penDraw, OUT_W, OUT_H, O, GPU_INFO, 
  base, SHADE, WETPOL, WETPOL_COUNT, render, LOOK_RES, view, renderFine, colourTrace, traceBox, colourMass, UPRIGHT, 
  expected, sheetDensity, marks, drainFrames, mark, CAL, FRAMES, FULL_TAPE, MARKTAPE, RESUME_AT, shoot, 
  FILM_BY_PAINT, CROSSHATCH_PLAN, up, SEED, t0, spent, clock, PROF, FW_SUBJ, PRACTICE, used, TECHS, LAST, DRAWING, 
  PEN_FIRST, DRAW_LAST, drawPass, PREPF, fadePrep, PASSAGE_HOOK, BUDGET, awareProvenance, awareBoundary } = ctx;
// a painting taken over at the closing boundary has had everything up to the closing drawing (AWARE_SKIP_POST)
const AWARE_SKIP_POST = RESUME_AT?.kind === 'closing';
if (!AWARE_SKIP_POST) dry(ctx.sheet, 20000, O, { levelMax: 900 });
colourMass('dried');

if (COLOUR_TRACE) await sharp(render(), {raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'colour-after-dry.png'));
if(ctx.AREA_PLAN&&MOD&&validateProductionDetails(ctx.AREA_PLAN.doc))fs.writeFileSync(path.join(out,'semantic-production-details-before.json'),JSON.stringify({declaration:ctx.AREA_PLAN.doc.productionDetails,sampler:'existing production orientationField/furMarks/dryMarkPath/dryMarkBrush',calibration:CAL['wet on dry'],calibrationRole:'historical wet-on-dry gain retained; not matched dry-brush proof',demand:'existing MOD.Ad only; unplaced residual remains debt'},null,2));
// The modulation lays no target-seeded dry-brush marks (anti-cheat rules); its wash and detail split (planning) stays.
if (MOD && !ABLATE.has('dry')) console.log('dry brush: target-seeded dry-brush marks removed');
if (!AWARE_SKIP_POST && DRAGS && !ABLATE.has('drags')) await layDrags(DRAGS, { count: BUDGET ? BUDGET.drags : undefined, mmPerCell: PB ? PB.mmPerCell * SC : 0, dragWmm: PB ? PB.cfg.brushes[PB.cfg.roles.drag].width_mm : 0, sheet: ctx.sheet, w, h, n, SC, W2, K: PIGS.length, SRC: ctx.SRC, A: DRAG_TARGET, gaussian, num, dip, createBrush, stroke, step, dry, O, CAL, UPRIGHT, SEED, expected, used, clock, shoot, setStage: s => { ctx.STAGE = s; }, log: console.log });
if(ctx.AREA_PLAN)AREA_EXEC.set(null);
colourMass('detailed');
if (COLOUR_TRACE) await sharp(render(), {raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'colour-after-detail.png'));
if (!FILM_BY_PAINT) await shoot();
// --curls: what the clipped glazes owed, laid as crescents round the lights and locks across the outline, then booked
if (CURLS?.area) {
  const r = await layCurls(ctx.sheet, CURLS, { w, h, SC, k: PIGS.length, pigments: PIGS, blur: gaussian, dip, O, D: ctx.SRC, strength: num('strength', 2.2), cal: CAL['dry brush'] ?? 1, seed: 1300 + SEED, shoot, stage: st => { ctx.STAGE = st; } },
    { charge: num('curlcharge', 1), water: num('curlwater', 0.3), edge: num('curledge', 1), lean: num('curllean', 0.25), brushShare: num('curlbrush', 0.9), rounds: opt('curlrounds', '0.8,0.4').split(',').map(Number) });
  for (let i = 0; i < n * PIGS.length; i++) expected[i] += CURLS.owed[i];
  // read again, so covered and the forms are measured with the curls on the sheet, against the plan that owes them
  mark(ctx.layers.length);
  console.log(`curls: ${r.rounds.join(' + ')} crescents, ${r.edge} locks across the outline`);
} else if (!AWARE_SKIP_POST && marks.length && marks.at(-1)?.pass !== ctx.layers.length) {
  // read the finished washes when the cadence did not land on the last pass, so covered and forms see every pass
  mark(ctx.layers.length);
}
// the mask comes off last, and the paper under it is untouched
if(!AWARE_SKIP_POST&&ctx.VALUE_PLAN&&ctx.RESIST){dry(ctx.sheet,30000,O,{levelMax:140,dt:2});const paper=measurePaperDry(ctx.sheet);check('value-plan film removal requires dry base',paper.dry,{waterMax:paper.waterMax,saturationMax:paper.saturationMax});JSONL.append(path.join(out,'value-commands.jsonl'),JSON.stringify({kind:'physical-film-remove',paper,operation:'existing real liftResist after final shadow; no white overlay'})+'\n');}
if (!AWARE_SKIP_POST && ctx.RESIST && !PRACTICE && !ctx.AREA_FILM_REMOVED) { if(ctx.AREA_PLAN){const cells=Array.from(up(ctx.AREA_PLAN.film),(v,i)=>v?i:-1).filter(i=>i>=0);if(cells.length){for(const a of ctx.AREA_PLAN.doc.areas)for(const p of a.passes)if(p.lights.mode==='film')for(const dep of p.lights.actions.afterPasses)check('film removal prerequisite unexecuted',AREA_COMPLETED.has(dep),{pass:dep});dry(ctx.sheet,30000,O,{levelMax:140,dt:2});const paper=measurePaper(ctx.sheet,cells);check('semantic film requires dry paint before removal',paper.dry,{waterMax:paper.waterMax,saturationMax:paper.saturationMax});AREA_EXEC.set(null);AREA_EXEC.command('physical film remove',{cells,paper,areaPassIds:ctx.AREA_PLAN.schedule.filter(s=>s.pass.lights.mode==='film').map(s=>s.key),semanticPlanned:true,revealedEdges:'inspection pending; no automatic softening'},()=>liftResist(ctx.sheet));}else liftResist(ctx.sheet);}else liftResist(ctx.sheet); dry(ctx.sheet, 20000, O, { levelMax: 200 }); ctx.STAGE = { stage: 'lift', step: 'frisket off' }; if (!FILM_BY_PAINT) await shoot(); }

if (PREPF) { const f = fadePrep(); let a = 0; for (const v of PREPF.applied) a += v; console.log(`prep fade: the drawing held at ${(100 * a / N2).toFixed(1)}% on average before the closing pen (${f} cells faded in the last step)`); }
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
  ctx.STAGE = { stage: 'lift', step: 'pencil erased' };
  await shoot();
}
if (DRAW_LAST && DRAWING !== 'none' && !AWARE_SKIP_POST) await awareBoundary({ kind: 'closing' });
if (DRAW_LAST && DRAWING !== 'none') {
  ctx.WASH_THK = thickness(ctx.sheet).map(a => Float32Array.from(a));
  await sharp(view(), { raw: { width: W2, height: H2, channels: 3 } }).jpeg({ quality: 92 }).toFile(path.join(out, 'wash.jpg'));
  if (opt('draw', '1') !== '0') await drawPass(null);
}
// the finishing lines, after whatever ink the sheet's own order calls for and before the lights
if (opt('finish', '0') !== '0' && opt('draw', '1') !== '0') {
  ctx.STAGE = { stage: 'ink', step: 'fine' };
  await drawPass(null, { fine: true });
}
// --facedetail 1: small dark face detail, with a small nib, from the reference's thin dark ridges in the figure mask
// (src/paint/techniques/face-detail.mjs). Tuning: --facedetailq 0.9, --facedetailnib 0.6 cells, --facedetailconc 8, and others there.
if (num('facedetail', 0) > 0 && opt('draw', '1') !== '0') {
  const Kd = opt('cellscale', '0') !== '0' ? w / 420 : 1;
  const fd = faceDetail(ctx.SRC, w, h, FW_SUBJ ?? (opt('fwmask', '') ? await loadSubject({ file: path.resolve(root, opt('fwmask', '')), w, h, sharp, log: () => {} }) : null),
    { K: Kd, sigma: num('facedetailsigma', 1), q: num('facedetailq', 0.9), lines: Math.round(num('facedetaillines', 60)), flecks: Math.round(num('facedetailflecks', 30)), margin: num('facedetailmargin', 3), tile: num('facedetailtile', 0), absfloor: num('facedetailabs', 0.25), maxLen: num('facedetailmaxlen', 0), rgb: num('facedetailskin', 0) > 0 ? ctx.px : null, blobs: Math.round(num('facedetailblobs', 0)), blobq: num('facedetailblobq', 0.97), blobmax: num('facedetailblobmax', 40), lineNear: num('facedetailmaxlen', 0) > 0 ? dilate(FACE_INK(), w, h, Math.max(1, Math.round(num('facedetailnear', 3) * Kd))) : null, seed: SEED, log: console.log });
  const dInkPig = GRAPHITE && !INK ? GRAPHITE_AT : INK ? PIGS.length : PIGS.map((p, j) => [j, p.K[0] + p.K[1] + p.K[2]]).sort((a, b) => b[1] - a[1])[0][0];
  const dWant = SC === 1 ? fd.field : Float32Array.from({ length: N2 }, (_, i) => fd.field[(((i / W2) | 0) / SC | 0) * w + ((i % W2) / SC | 0)]);
  const dScale = gs => gs.map(g => ({ points: g.points.map(q => ({ x: q.x * SC, y: q.y * SC })) }));
  const dPen = { nib: num('facedetailnib', 0.6) * Kd, flex: 1.5 * Kd, travel: 1.5 * Kd, reach: 12 * Kd, reservoir: 250 * Kd * Kd, feed: 1.2 * Kd };
  const dInk = SHEET_PIGS.map((_, j) => (j === dInkPig ? num('facedetailconc', 8) : 0));
  const rl = penDraw(ctx.sheet, dScale(fd.lines), dWant, W2, H2, { ink: dInk, pen: dPen, O, peak: 1 });
  const flFull = new Float32Array(N2).fill(0.8);
  const rf = penDraw(ctx.sheet, dScale(fd.flecks), flFull, W2, H2, { ink: dInk, pen: { ...dPen, nib: dPen.nib * 0.8 }, O, peak: 1 });
  if (fd.dabs.length) penDraw(ctx.sheet, dScale(fd.dabs), flFull, W2, H2, { ink: dInk, pen: { ...dPen, nib: dPen.nib * 0.9 }, O, peak: 1 });
  dry(ctx.sheet, 20000, O, { levelMax: 200 });
  console.log(`face detail: ${rl.drawn} lines and ${rf.drawn} flecks laid on the dry sheet in pigment ${dInkPig}`);
  ctx.STAGE = { stage: 'ink', step: 'face detail' };
  await shoot();
}
if (CROSSHATCH_PLAN && opt('draw', '1') !== '0') {
  const Kd = w / 420;
  const ch = CROSSHATCH_PLAN;
  const cInkPig = GRAPHITE && !INK ? GRAPHITE_AT : PIGS.map((p, j) => [j, p.K[0] + p.K[1] + p.K[2]]).sort((a, b) => b[1] - a[1])[0][0];
  const cWant = SC === 1 ? ch.field : Float32Array.from({ length: N2 }, (_, i) => ch.field[(((i / W2) | 0) / SC | 0) * w + ((i % W2) / SC | 0)]);
  const cScale = gs => gs.map(g => ({ weight: g.weight ?? 1, points: g.points.map(q => ({ x: q.x * SC, y: q.y * SC })) }));
  const pigK = cInkPig < PIGS.length ? (PIGS[cInkPig].K[0] + PIGS[cInkPig].K[1] + PIGS[cInkPig].K[2]) / 3 : 1; const gain = num('crosshatchgain', 1) / Math.max(0.22, pigK);
  const cPen = { nib: num('crosshatchnib', 0.44) * Kd, flex: 1.4 * Kd, travel: 1.5 * Kd, reach: 14 * Kd, reservoir: 260 * Kd * Kd, feed: 1.15 * Kd };
  const cInk = c => SHEET_PIGS.map((_, j) => (j === cInkPig ? c * gain : 0));
  const chCaps = nMax => ({ state: { used: 0 }, caps: { lines: nMax, pressure: 0.9, minLengthMm: 0.25, edgeMin: 0 } });
  const r1 = penDraw(ctx.sheet, cScale(ch.primary), cWant, W2, H2, { ink: cInk(2.2), pen: cPen, O, peak: 1, ...chCaps(1800) });
  const r2 = penDraw(ctx.sheet, cScale(ch.cross), cWant, W2, H2, { ink: cInk(2.7), pen: { ...cPen, nib: cPen.nib * 0.88 }, O, peak: 1, ...chCaps(1200) });
  const r3 = penDraw(ctx.sheet, cScale(ch.accents), cWant, W2, H2, { ink: cInk(3.4), pen: { ...cPen, nib: cPen.nib * 0.95 }, O, peak: 1, ...chCaps(800) });
  const r4 = ch.ridges.length ? penDraw(ctx.sheet, cScale(ch.ridges), cWant, W2, H2, { ink: cInk(3.8), pen: { ...cPen, nib: cPen.nib * 0.82 }, O, peak: 1, ...chCaps(600) }) : { drawn: 0 };
  dry(ctx.sheet, 20000, O, { levelMax: 200 });
  console.log(`crosshatch laid: ${r1.drawn} contour hatches, ${r2.drawn} cross-hatches, ${r3.drawn} core accents, ${r4.drawn} fine ridges in pigment ${cInkPig}`);
  ctx.STAGE = { stage: 'ink', step: 'crosshatch' };
  await shoot();
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
  ctx.STAGE = { stage: 'gouache' };
  if (!FILM_BY_PAINT) await shoot();
}
colourMass('finished');
if(COLOUR_TRACE) fs.writeFileSync(path.join(out,'colour-trace.json'),JSON.stringify({box:traceBox,pigments:PIGS,trace:colourTrace},null,2));
ctx.STAGE = { stage: 'finished' };
if (FILM_BY_PAINT) await shoot(); else { await shoot(); await shoot(); await shoot(); }
console.log(`techniques: ${Object.entries(used).map(([k, v]) => `${k} ${v}`).join(', ')}`);
if (ctx.dropped) console.log(`${ctx.dropped} passages yielded no brush path and were never painted, carrying ${(100 * ctx.droppedMass / Math.max(1e-6, ctx.plannedMass)).toFixed(1)}% of the planned mass; the plan counts them delivered`);
await drainFrames();
const judged = intermediates(marks, w, h, gaussian);
if (judged.steps.length) console.log(`carried the plan: forms ${(100 * judged.endFormKept).toFixed(0)}% at agreement ${judged.endFormStructure.toFixed(2)}; at one cell ${(100 * judged.endFineKept).toFixed(0)}% at ${judged.endStructure.toFixed(2)} (the tooth, which the plan cannot state)`);
for (const f of judged.flags) console.log(`  ! ${f}`);
{
  // What each pigment was planned against what the sheet holds of it, so a wrong hue can be traced to one pigment.
  const th = thickness(ctx.sheet), rows = [];
  for (let j = 0; j < PIGS.length; j++) { let planned = 0, got = 0; for (let i = 0; i < n; i++) planned += expected[i * PIGS.length + j]; for (let i = 0; i < N2; i++) got += th[j][i]; rows.push(`${j} ${(got / Math.max(1e-6, planned * SC * SC)).toFixed(2)}`); }
  console.log(`pigment delivered over planned: ${rows.join(', ')}`);
  // --deliveryreport 1: the same ratio split by how much paint the ledger booked per cell (delivery-by-band.json)
  if (num('deliveryreport', 0) > 0) {
    const report = deliveryByBand({ expected, held: th, n, P: PIGS.length, SC, w, W2 });
    console.log(deliveryNote(report));
    fs.writeFileSync(path.join(out, 'delivery-by-band.json'), JSON.stringify({ kind: 'sheet over ledger by booked amount; no target reads', pigments: PIGS.map(p => p.name ?? null), ...report }, null, 1));
  }
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
  const T = thickness(ctx.sheet), KP = SHEET_PIGS.length;
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
assertDeviceHealthy(ctx.sheet); // a broken GPU device never writes a painting (src/media/gpu/device-health.mjs)
await sharp(FINAL_PIXELS,{raw:{width:OUT_W,height:OUT_H,channels:3}}).png().toFile(path.join(out,'painting.png'));
await sharp(FINAL_PIXELS,{raw:{width:OUT_W,height:OUT_H,channels:3}}).jpeg({quality:92}).toFile(path.join(out,'painting.jpg'));
if (STROKE_BUDGET) {
 const count=MARKTAPE.filter(m=>['s','P','g'].includes(m.k)).length;
 fs.writeFileSync(path.join(out,'stroke-budget.json'),JSON.stringify({budget:STROKE_BUDGET,strokes:count,complete:count<=STROKE_BUDGET,counts:Object.fromEntries(['s','P','g'].map(k=>[k,MARKTAPE.filter(m=>m.k===k).length]))},null,2));
 check('Whole painting exceeded stroke budget',count<=STROKE_BUDGET,{strokes:count,budget:STROKE_BUDGET});
}
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
    version:2, paper:PAPER_OPTS, paperRGB, paperShade:SHADE, strokeBudget:STROKE_BUDGET||null, strokeCount:MARKTAPE.filter(m=>['s','P','g'].includes(m.k)).length,
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

writeRunCard({ provenanceHistory:ctx.PROVENANCE_HISTORY, provenance:awareProvenance(TARGET_GUARD.exportState().looks.count), root, out, args: argv0, subject: VALUE_CONFIG?.subject ?? null, imageFile: opt('image', ''), planFile: opt('valueplan', '') || opt('areaplan', '') || opt('plan', ''), drawingFile: opt('drawingfile', ''), drawingOrder: opt('drawing', 'first'), drawingMedium: opt('outlinemedium', 'graphite'), code: CODE_STATE, segments: SEGMENTS_RECORD, linework: ctx.LINEWORK_STAGE ?? EARLY_LINES, gpu: GPU_INFO, dimensions: { sourceWidth: srcMeta?.width ?? null, sourceHeight: srcMeta?.height ?? null, paintWidth: OUT_W, paintHeight: OUT_H, enlargement: srcMeta?.width ? +(OUT_W / srcMeta.width).toFixed(2) : null }, palette: PALETTE.box ? { keys: PALETTE.box.keys, guard: PALETTE.box.guard ?? null } : null, phases: WALL_PHASES, seconds: process.uptime(), exitCode: process.exitCode ?? 0 });
if (SPEED_PROFILE) SPEED_PROFILE.write(out, { phases: WALL_PHASES, painting: spent, cpu: PROF });
if (CPU_PROFILE) await CPU_PROFILE.stop(path.join(out, 'main.cpuprofile'));

JSONL.flush();
writeCensus(out, { main: ctx.sheet, fine: INKRES?.fine });
}
