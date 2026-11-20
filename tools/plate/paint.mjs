// Passage brushes, touch-ups, stops at passage boundaries, and the paint loop.
// Stage 6 of 7 of tools/paint-plate.mjs. The stages run in order and share one object, ctx: see the entry file.
import {invalidatePaperCertificate} from '../../src/media/paper-certificate.mjs';
import {EpochCells} from '../../src/paint/epoch-cells.mjs';
import {check} from '../../src/media/checks.mjs';
import {splitLoadsFeathered} from '../../src/paint/methods/brushes.mjs';
import {passageBrushPaths, attachPlaneRamp as attachRampToPaths, planeRampApplies} from '../../src/paint/methods/passage-brush.mjs';
import {shapeMix} from '../../src/paint/methods/wash-weights.mjs';
import {planeAtCell, gradeLoadPressure, softClipMask} from '../../src/paint/methods/graded-demand.mjs';
import {shapedPlanePaths} from '../../src/paint/techniques/shaped-marks.mjs';
import {valueTechnique, softBoundaryPaths} from '../../src/paint/methods/light-to-dark.mjs';
import {softRing} from '../../src/paint/methods/soft-edges.mjs';
import {softenWhere, growReserve, softenBrushCells} from '../../src/paint/methods/value-soften.mjs';
import {DEFAULT_SHEET_MM} from '../../src/media/sheet-size.mjs';
import {createReceiverObserver} from '../painter/numeric-receiver-observer.mjs';
import {appendFinishingLayers} from '../painter/finishing-area.mjs';
import {nativeBodyCadence} from '../painter/native-body-cadence.mjs';
import {numericTuftEligible, calibrateNumericTuft} from '../painter/numeric-tuft-calibration.mjs';
import {validateProductionDetails, productionChargeSupported, validateCompiledAreaStop, semanticNumericSequence, semanticChargeFeasible} from '../painter/semantic-production-details.mjs';
import {connectedSkyBoundary, connectedSkyContact, chooseMajorBaseWash} from '../painter/legacy-major-intents.mjs';
import {nativeDryOptions} from '../painter/native-paint-mode.mjs';
import {semanticBrushObservation} from '../painter/semantic-brush-observation.mjs';
import {lowerAuthoredGestures} from '../painter/authored-gestures.mjs';
import {surfaceMarkPaths} from '../../src/paint/techniques/surface-marks.mjs';
import {semanticStageEnd} from '../painter/semantic-stage-end.mjs';
import {softenAndLift, softenEdge} from '../painter/soften-lift-run.mjs';
import {hardEdgeDue, passSoftCells} from '../painter/area-edges.mjs';
import {SOFTEN_WATER} from '../../src/paint/techniques/soften-lift.mjs';
import {layIntoWetBed} from '../painter/wet-bed-wait.mjs';
import {variegatedCharge, chargeMix} from '../painter/area-washes.mjs';
import {chargeWetPass} from '../painter/area-charge-run.mjs';
import {semanticLoadCells,semanticSameSession,compileAreaLayers, semanticTechnique, semanticBrushOptions, semanticUsesNumericClip, semanticGesture, semanticCalibrationGain, requireAuthoredCalibration, semanticFilmRemovalReady, sha256} from '../painter/semantic-areas.mjs';
import {measurePaperDry} from '../../src/paint/methods/wetdry.mjs';
import {earlyDryBoundary} from '../painter/early-dry-boundary.mjs';
import {cachedStepSync, codeHash, digest, provenance} from '../../src/paint/run-cache.mjs';
import {canaryStopPass, stopAtCanary} from '../../src/paint/canary-stop.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {step, thickness, thicknessInto, thicknessTotals, blot, coherent} from '../../src/media/sheet.mjs';
import {thirsty, edgeHalfWidth} from '../../src/media/brush.mjs';
import {unmix} from '../../src/crop/pigments.mjs';
import {dropMask} from '../../src/crop/blockin.mjs';
import {shapeDeficit, shapeCharge, shapeOwedColour} from '../../src/paint/methods/shape-deficit.mjs';
import {touchLack, touchGap, touchDue, touchFilmUnits} from '../../src/paint/methods/touch-up.mjs';
import {tipMarks, darkClip} from '../../src/paint/methods/final-dark-marks.mjs';
import {washPaths, brushedWashPaths, invalidateFlowField, sweepCover, sweepCount, containPaths, openEdgeShare, softArcs, soften} from '../../src/media/wash.mjs';
import {wetsLaneByLane} from '../../src/paint/methods/prewet-order.mjs';
import {softenFirstWash} from '../../src/paint/methods/first-wash.mjs';
import {distanceToZero} from '../../src/raster.js';
import {components, removeSmall, dilate, erode, closeLocal} from '../../src/raster.js';
import {detailMarks} from '../../src/crop/technique.mjs';
import {cellRGB} from '../../src/eval/plan-optics.mjs';
import {gaussian} from '../../src/keyframes/density.mjs';
import {applyResist} from '../../src/media/sheet.mjs';
import {makeCrisp} from '../../src/paint/methods/crisp-edges.mjs';
import {orientationField, furMarks} from '../../src/crop/fur.mjs';
import {traceOutlines} from '../../src/crop/outline.mjs';
import {clipToFinish} from '../../src/crop/finish.mjs';
import {sameWash} from '../../src/paint/methods/wash-session.mjs';
import {loadFocus, mergeShapes, completeBudget, budgetPaths} from '../../src/paint/methods/stroke-budget.mjs';
import {splitLoads,paintsHere} from '../../src/paint/methods/brushes.mjs';
import {createPause} from '../aware/pause.mjs';
import {writeState, readState, revisionExpectation} from '../aware/state-io.mjs';
import {tapeState, restoreTapeState} from '../../src/media/brush.mjs';
import {passDue, markDue} from '../../src/paint/pass-cadence.mjs';

export async function paint(ctx) {
const { WASH_FLAT_SPLAY, JSONL, argv, OPTS_READ, opt, num, STROKE_BUDGET, optTrack, NATIVE_PAINT_MODE, SPEED_PAPER, 
  SPEED_COVERAGE, measurePaper, liftResist, FRAME_POLICY, SPEED_PROFILE, root, out, RUN_CACHE, FAST_BODY_ENABLED, 
  FAST_BODY_SPACING, BODY_CADENCE_RECORD, VALUE_COUNTS, SOFT_WET_MM, WASH_SESSION, MAJOR_INTENT, NUMERIC_TUFT_SHAPES, 
  NUMERIC_TUFT_CAL, TARGET_GUARD, paintingLook, STEP_BACKS, w, h, n, createBrush, candidateContact, paperRGB, 
  planContentHashes, CODE_HASH, PIGS, COLOUR_BUDGET, GOUACHE_LIGHTS, setClip, MOD, MASS_BUDGET, 
  COLOUR_TRACE, PUDDLES, FIRST_FLOOR, AUTHORED_INPUT, HP, maskBox, FULLBOX, TECHNIQUE, techniqueOf, CURLS, 
  FINISH, FUR_FIELD, SHEET_PIGS, FINISH_FILE, AREA_FILE, AREA_COMPLETED, AREA_EXEC, EARLY_DRY_VALUE, 
  dry, dip, dipLoad, productionDip, stroke, SC, W2, H2, N2, PB, GFLOOR, GCHUNK, PAPER_OPTS, PROBE, INKRES, OUT_W, OUT_H, O,
  GPU_INFO, render, view, colourTrace, traceCells, colourMass, BRUSH, UPRIGHT, highlights, 
  expected, DELIVERY, DCAL, TECH_CAL, TCAL, marks, PENDING_IO, drainFrames, mark, 
  WET, MIX, washBridge, CAL, instrumentOf, SEMANTIC_CAL_MODE, SEMANTIC_CAL, FRAMES, snap, MARKTAPE, 
  AWARE_DIR, RESUME_DIR, RESUME_AT, shoot, WETFRAMES, PASSFRAMES, WET_STEPS, FILM_BY_PAINT, PENWASH, LOOK_AL, 
  LOOK_PLAN, TIER_MASK, up, SEED, clock, prof, handAngle, flowEvery, SHAPE_LOAD_BUFFER, brushMask, FILM_MASS, FW, 
  FW_SUBJ, isFirst, FILM_FRAMES, used, TECHS, LAST, DRAWING, DRAW_LAST, SKY_WARM_RB, TP_ROUNDS, 
  PROVENANCE_TARGET_SHA, PREPF, fadePrep, mopLanes, setStage } = ctx;
const removeFilm=()=>{const value=liftResist(ctx.sheet);ctx.NATIVE_CAPTURE?.('film-remove');return value;};
let ONSHEET = null;
// --feedbacklag 1 (fast default): read the sheet only when it is in hand; between reads, predict it as the last read
// plus what the ledger booked since, so planning overlaps the GPU's dry. Full mode reads every pass.
const FEEDBACK_LAG = !DELIVERY&&!TECH_CAL&&num('feedbacklag', NATIVE_PAINT_MODE.mode === 'fast' ? 1 : 0) > 0 && num('orderremix', 0) <= 0;
let FEEDBACK_BASE = null, FEEDBACK_FRESH = true;
const feedbackStats = { read: 0, predicted: 0 };
if (num('orderremix', 0) > 0) throw new Error('--orderremix was removed by the anti-cheat rules: it charged each cell from the per-cell gap to the plan');
const REMIX = null;
// --crisp: hard-edged glazes carried to their line (src/paint/methods/crisp-edges.mjs)
const CRISP = makeCrisp({ opt, num });
// --passmerge, --strokebudget, --focusmap (src/paint/methods/stroke-budget.mjs)
const FOCUS = (await loadFocus({ opt, w, h, sharp, path, root })) ?? (MOD?.field ?? null);
if (num('passmerge', 0) > 0 && GFLOOR) {
  const before = ctx.layers.reduce((a, l) => a + l.shapes.length, 0);
  for (const l of ctx.layers) l.shapes = mergeShapes(l.shapes, { n, tol: num('mergetol', 0.25), amt: num('mergeamt', 1.35), film: FILM_MASS });
  console.log(`pass merge: ${before} passages laid as ${ctx.layers.reduce((a, l) => a + l.shapes.length, 0)}, one per pass and mix`);
}
// the broad first wash goes on before anything else (painterOrder and the colour order file it under its leading pan)
if (FIRST_FLOOR > 0) { const fw = ctx.layers.filter(isFirst); if (fw.length) { ctx.layers = [...fw, ...ctx.layers.filter(l => !isFirst(l))]; console.log(`first wash: ${fw.reduce((a, l) => a + l.shapes.length, 0)} broad passages over ${(100 * fw.reduce((a, l) => a + l.shapes.reduce((b, sh) => b + sh.area, 0), 0) / n).toFixed(1)}% of the sheet laid first`); } }
if(ctx.AREA_PLAN){try{ctx.AREA_COMPILED=compileAreaLayers(ctx.AREA_PLAN,ctx.layers,PIGS,{mmPerCell:num('sheetmm',DEFAULT_SHEET_MM)/w});}catch(e){fs.writeFileSync(path.join(out,'semantic-coverage.json'),JSON.stringify(e.diagnostics??{error:e.message},null,2));throw e;}ctx.layers=ctx.AREA_COMPILED.layers;validateCompiledAreaStop(opt('areastop',''),ctx.layers);fs.writeFileSync(path.join(out,'semantic-coverage.json'),JSON.stringify(ctx.AREA_COMPILED.diagnostics,null,2));}
const BUDGET = STROKE_BUDGET ? completeBudget({N:STROKE_BUDGET,layers: ctx.layers,drawing:MARKTAPE.filter(m=>['s','P','g'].includes(m.k)).length}) : null;
if (BUDGET) console.log(`stroke budget: ${BUDGET.N} paths, washes ${Math.round(BUDGET.wash)}, drags ${BUDGET.drags}, dry brush ${BUDGET.dry}, accents ${BUDGET.accents}${FOCUS ? ', weighted by the focus map' : ''}`);
const CANARY_STOP = canaryStopPass(num('canarystop', 0), ctx.layers.length);
if(ctx.FINISH_PLAN){const appended=appendFinishingLayers(ctx.layers,ctx.FINISH_COMPILED);ctx.FINISH_START=appended.start;ctx.layers=appended.layers;validateCompiledAreaStop(opt('areastop',''),ctx.FINISH_COMPILED.layers);}
if(opt('receiverobserver','')){if(!MAJOR_INTENT||ctx.AREA_PLAN)throw Error('receiverobserver requires original numeric major route');const doc=JSON.parse(fs.readFileSync(path.resolve(root,opt('receiverobserver','')),'utf8'));if(opt('majorstop','')!=='pass:'+doc.pass)throw Error('receiverobserver requires its existing pass checkpoint');ctx.RECEIVER_OBSERVER=createReceiverObserver(doc,{out,w:W2,h:H2,targetSHA:crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,opt('image','')))).digest('hex'),coherent,render});}
// pass.marks (src/paint/techniques/surface-marks.mjs): the pass's surface marks inside one compiled shape, or null
const semanticMarks = (sh, mask) => {
  const pass = sh._semantic.pass; if (!pass.marks) return null;
  const T = ctx.AREA_PLAN.doc.target, crop = ctx.AREA_PLAN.crop;
  const paths = surfaceMarkPaths(pass.marks, { mask, w, h, mmPerCell: num('sheetmm', DEFAULT_SHEET_MM) / w, brushMm: pass.brush.widthMm, scale: SC, seedKey: `${sh._semantic.key}/${ctx.laid}`,
    toCell: q => [(q[0] * T.width - crop[0]) * w / crop[2], (q[1] * T.height - crop[1]) * h / crop[3]] });
  console.log(`surface marks: ${pass.marks.kind} on ${sh._semantic.key}, ${paths.length} marks`);
  return paths.map((pts, k) => pts.map(p => ({ ...p, gestureId: `${sh._semantic.key}/${pass.marks.kind}-${ctx.laid}-${k}`, areaId: sh._semantic.area.id, passId: sh._semantic.key, contact: pass.brush.contact, brushModel: pass.brush.model ?? 'row' })));
};
// A 'washes' step-back (src/paint/step-backs.mjs), one a round: after the planned washes (round 1) or the last round's
// glazes dry, each planning family is read once at shape scale. A family the sheet shows visibly lighter or less
// chromatic than the subject (touch-up.mjs) gets one darkening glaze of the mixed lack, sized from the gap through the
// sheet's own film optics; it is read again only in the next round.
const touchCorrections = round => {
  dry(ctx.sheet, 20000, O, { levelMax: 200 });
  const rgb = render(), Ks = touchFilmUnits(PIGS), od = c => [0, 1, 2].map(q => -Math.log(Math.max(1, c[q]) / paperRGB[q]));
  const glazes = [];
  let looked = 0;
  STEP_BACKS.open(round === 1 ? 'washes' : `washes-${round}`);
  ctx.TP_SHAPES.forEach((t, k) => {
    const lk = paintingLook('passage', `touch${round}/s${k}`, t._look, { ref: ['px'] }); if (!lk) return; looked++;
    const m = [0, 0, 0]; let c = 0; for (let i = 0; i < n; i++) if (t._look[i]) { m[0] += rgb[i * 3]; m[1] += rgb[i * 3 + 1]; m[2] += rgb[i * 3 + 2]; c++; }
    const have = m.map(v => v / Math.max(1, c));
    if (!touchDue(touchGap(have, lk.ref.px, paperRGB))) return;
    const d = touchLack(od(lk.ref.px), od(have)); // darken only (src/paint/methods/touch-up.mjs)
    if (Math.max(...d) < num('touchdmin', 0.04)) return;
    const a = unmix(Float32Array.from(d), 1, Ks), mix = PIGS.map((_, j) => (a[j] > 0.004 ? a[j] : 0));
    const amount = mix.reduce((x, v) => x + v, 0); if (!(amount > 0)) return;
    const sh = { mask: t.mask, area: t.area, amount, mix }; TECHNIQUE.set(sh, TECHNIQUE.get(t)); glazes.push(sh);
  });
  STEP_BACKS.close(glazes.length);
  // one glaze of the mixed lack per family, filed under its leading pan
  const byPig = PIGS.map(() => []); for (const sh of glazes) byPig[sh.mix.indexOf(Math.max(...sh.mix))].push(sh);
  const maxV = Math.max(...ctx.layers.filter(l => !l._touch && !l._touched && !l._darks).map(l => l.value || 0));
  const add = byPig.map((shapes, j) => { if (!shapes.length) return null; const tmpl = ctx.layers.filter(l => l.pigment === j && !l._touch && !l._darks && !l._detail).at(-1) ?? ctx.layers.find(l => !l._touch && !l._darks); return { ...tmpl, pigment: j, value: maxV + round, shapes, _touched: round }; }).filter(Boolean);
  console.log(`touchpoint ${round}: looked at ${looked} families once; ${glazes.length} read visibly lighter or less chromatic than the subject and get one glaze of the mixed lack each (${add.reduce((a, l) => a + l.shapes.length, 0)} passages over ${add.length} pans)`);
  return add;
};
if (ctx.TP_SHAPES) ctx.layers.push({ _touch: 1, shapes: [], value: 0, pigment: 0 });
const finalDarks = () => {
  dry(ctx.sheet, 20000, O, { levelMax: 200 });
  const rgb = render(), Ks = PIGS.map(p => p.K.map(v => v / 0.55)), byPig = PIGS.map(() => []), od = c => [0, 1, 2].map(q => -Math.log(Math.max(1, c[q]) / paperRGB[q]));
  let looked = 0, laid = 0;
  STEP_BACKS.open('accents');
  ctx.FD_SHAPES.forEach((t, k) => {
    const lk = paintingLook('passage', `darks/s${k}`, t._look, { ref: ['px'] }); if (!lk) return; looked++;
    const m = [0, 0, 0]; let c = 0; for (let i = 0; i < n; i++) if (t._look[i]) { m[0] += rgb[i * 3]; m[1] += rgb[i * 3 + 1]; m[2] += rgb[i * 3 + 2]; c++; }
    const Ds = od(m.map(v => v / Math.max(1, c))), Dt = od(lk.ref.px), d = Dt.map((v, q) => Math.max(0, v - Ds[q]));
    if (Math.max(...d) < num('fddmin', 0.06)) return;
    const a = unmix(Float32Array.from(d), 1, Ks); let any = false;
    for (let j = 0; j < PIGS.length; j++) if (a[j] > 0.004) { const amt = a[j] * num('fdgain', 1), sh = { mask: t.mask, area: t.area, amount: amt, mix: PIGS.map((_, q) => (q === j ? amt : 0)) }; TECHNIQUE.set(sh, TECHNIQUE.get(t)); byPig[j].push(sh); any = true; }
    if (any) laid++;
  });
  STEP_BACKS.close(laid);
  const maxV = Math.max(...ctx.layers.filter(l => !l._touch && !l._darks).map(l => l.value || 0));
  const add = byPig.map((shapes, j) => { if (!shapes.length) return null; const tmpl = ctx.layers.filter(l => l.pigment === j && !l._touch && !l._darks && !l._detail).at(-1) ?? ctx.layers.find(l => !l._touch && !l._darks); return { ...tmpl, pigment: j, value: maxV + 3, shapes, _touched: 'darks', _darkPass: 1 }; }).filter(Boolean);
  console.log(`final darks: looked at ${looked} families, ${laid} lighter than the reference get a dark (${add.reduce((a, l) => a + l.shapes.length, 0)} passages over ${add.length} pans)`);
  return add;
};
if (ctx.FD_SHAPES?.length) ctx.layers.push({ _darks: 1, shapes: [], value: 0, pigment: 0 });
// ---- stops at passage boundaries and the take-over of a saved painting (tools/aware/pause.mjs) -------------------------
// What a revision may not change once painting has started is checked by the harness; here the painter only refuses to
// save a painting whose state it cannot carry whole (features with state of their own that is not saved below).
// Linked drawing stages finish after the early setup caches; fingerprint their final inputs.
const AWARE_PLAN_HASHES = planContentHashes();
ctx.PROVENANCE_HISTORY = [];
const AWARE = createPause({ dir: AWARE_DIR });
const awareUnsupported = () => [
  [ctx.AREA_PLAN || ctx.FINISH_PLAN, 'areaplan/finishplan'], [MAJOR_INTENT, 'major intent'], [ctx.RECEIVER_OBSERVER, 'receiverobserver'],
  [CURLS, 'curls'], [GOUACHE_LIGHTS, 'gouache lights'], [ctx.FRAMER, 'async frame worker'],
].filter(([on]) => on).map(([, name]) => name);
const awareRemaining = from => ctx.layers.slice(from).map((l, k) => l._touch ? { pass: from + k + 1, touchRound: l._touch } : {
  pass: from + k + 1, value: l.value, pigment: PIGS[l.pigment]?.name ?? l.pigment, order: l._order?.phase ?? null, touched: l._touched ?? null,
  passages: l.shapes.length, areaShare: +(l.shapes.reduce((a, sh) => a + (sh.area ?? 0), 0) / n).toFixed(4),
  techniques: l.shapes.reduce((a, sh) => { const t = TECHNIQUE.get(sh)?.name ?? '?'; a[t] = (a[t] ?? 0) + 1; return a; }, {}) });
const awareCounts = () => { let s = 0, p = 0; if (MARKTAPE) for (const m of MARKTAPE) { if (m.k === 's') s++; else if (m.k === 'P') p++; } return { strokes: s, penLines: p }; };
const awareSheetPng = async file => { await sharp(INKRES ? INKRES.compose(view()) : view(), { raw: { width: OUT_W, height: OUT_H, channels: 3 } }).png().toFile(file); };
const awareWhere = at => (at.kind === 'closing' ? 'the closing boundary' : at.kind === 'start' ? 'boundary 0' : 'boundary ' + (at.L + 1));
// The whole painting state at a boundary. Sheet arrays come down from the GPU first; the dried layers too.
const awareProvenance = looksConsumed => {
  const ignored=new Set(['out','pausedir','resumestate','resumeprefix','allowdirty','speedprofile','speedcpu']);
  const outAbs=path.resolve(root,out), normOut=v=>typeof v==='string'&&path.resolve(root,v).startsWith(outAbs+path.sep)?`<out>/${path.relative(outAbs,path.resolve(root,v))}`:v;
  const resolved={}; for(let i=0;i<argv.length;i++){const key=argv[i];if(!key.startsWith('--'))continue; const v=argv[i+1]?.startsWith('--')?true:argv[++i];if(!ignored.has(key.slice(2)))resolved[key]=normOut(v);}
  const planHashes=AWARE_PLAN_HASHES;
  return provenance({simCode:codeHash(root),argv:digest(resolved),planHashes,targetSHA256:PROVENANCE_TARGET_SHA,paper:{w:W2,h:H2,opts:digest(PAPER_OPTS)},pigments:SHEET_PIGS.map(p=>({name:p.name,params:digest(p)})),geometry:{W2,H2,SC,sheetMm:num('sheetmm',DEFAULT_SHEET_MM)},mode:opt('mode','fast'),backend:{backend:GPU_INFO.backend,adapter:GPU_INFO.adapter??null,adapterEvidence:GPU_INFO.adapterEvidence??null},guard:{mode:TARGET_GUARD.mode,looksConsumed}});
};
const awareSave = async (dir, at) => {
  JSONL.flush();
  const bad = awareUnsupported(); if (bad.length) throw new Error('aware: cannot save this painting (state not carried: ' + bad.join(', ') + ')');
  coherent(ctx.sheet); ctx.sheet._gpu?.syncLower(ctx.sheet);
  const sheetFields = {}; for (const [k, v] of Object.entries(ctx.sheet)) { if (['paper', 'pigments', '_gpu', '_gpuInfo', '_tape', '_renderCaches'].includes(k) || typeof v === 'function') continue; sheetFields[k] = v; }
  const firstTouch = ctx.layers.findIndex(l => l._touch);
  // the touch-up rounds insert passes while painting: from the first round on, the pass list is saved whole (painted ones
  // too, since a later round takes its template from the last pass of a pigment)
  const tailFrom = firstTouch >= 0 && (at.kind === 'closing' || (at.kind === 'pass' && at.L >= firstTouch)) ? firstTouch : null;
  const tail = tailFrom === null ? null : ctx.layers.slice(tailFrom).map(l => {
    const { shapes, ...fields } = l;
    return { fields, shapes: shapes.map(sh => { const { mask, ...rest } = sh; if (mask == null) return { tp: -1, rest }; const tp = ctx.TP_SHAPES ? ctx.TP_SHAPES.findIndex(t => t.mask === mask) : -1; if (tp < 0) throw new Error('aware: a touch-up passage without its planning shape'); return { tp, rest }; }) };
  });
  const state = {
    at, provenanceHistory: ctx.PROVENANCE_HISTORY, inkres: INKRES?.exportState()??null, prepf: PREPF, sheet: sheetFields, layersLength: ctx.layers.length, tailFrom, tail,
    js: { nativeMarkCounts:ctx.NATIVE_MARK_COUNTS, designedExecution: ctx.DESIGNED_EXECUTION, framePolicy: FRAME_POLICY.state(), laid: ctx.laid, dropped: ctx.dropped, droppedMass: ctx.droppedMass, filmLaid: ctx.filmLaid, filmNext: ctx.filmNext, filmPass: ctx.filmPass, drawnCount: ctx.drawnCount, STAGE: ctx.STAGE, LAST_FRAME_STAGE: ctx.LAST_FRAME_STAGE, frame: ctx.frame, FRAMES, marks, lastPainted: ctx.lastPainted, expected, used, TECHS, LAST, ONSHEET, FEEDBACK_BASE, FEEDBACK_FRESH, feedbackStats, VALUE_ACTIVE: ctx.VALUE_ACTIVE, VALUE_OWN_CONTACT: new Set(ctx.VALUE_OWN_CONTACT), VALUE_PIGMENT_CONTACT: new Set(ctx.VALUE_PIGMENT_CONTACT), VALUE_COMMAND: ctx.VALUE_COMMAND, VALUE_COUNTS, BODY_CADENCE_RECORD, INK_THK: ctx.INK_THK, WASH_THK: ctx.WASH_THK, colourTrace, WASH_BASE: ctx.WASH_BASE },
    tape: MARKTAPE ? { marks: MARKTAPE, ...tapeState() } : null, guard: TARGET_GUARD.exportState(),
  };
  const r = writeState(dir, state, awareProvenance(state.guard.looks.count));
  ctx.NATIVE_RECORDER?.checkpoint(path.join(dir,'native-operations'));
  fs.writeFileSync(path.join(dir, 'boundary.json'), JSON.stringify(at));
  console.log(`aware: painting saved at ${awareWhere(at)} (${r.arrays} arrays, ${r.zeros} empty, ${(r.bytes / 1e6).toFixed(1)} MB, ${r.milliseconds.toFixed(1)} ms IO) in ${dir}`);
};
const awareRestore = () => {
  invalidatePaperCertificate(ctx.sheet);
  const savedProvenance=JSON.parse(fs.readFileSync(path.join(RESUME_DIR,'provenance.json'),'utf8'));
  const ioTiming={};
  const currentProvenance=awareProvenance(savedProvenance.guard.looksConsumed);
  const prefixFile=opt('resumeprefix','');
  const expectedProvenance=prefixFile ? revisionExpectation(savedProvenance,currentProvenance,JSON.parse(fs.readFileSync(path.resolve(root,prefixFile),'utf8'))) : currentProvenance;
  const st = readState(RESUME_DIR, expectedProvenance,ioTiming), at = st.at;
  ctx.PROVENANCE_HISTORY=[...(st.provenanceHistory??[]),...(prefixFile?[{boundary:at,prefix:savedProvenance,suffix:currentProvenance}]:[])];
  console.log(`aware: state load ${ioTiming.milliseconds.toFixed(1)} ms IO`);
  if (JSON.stringify(at) !== JSON.stringify(RESUME_AT)) throw new Error('aware: boundary.json and state.json disagree');
  const bad = awareUnsupported(); if (bad.length) throw new Error('aware: cannot take over a saved painting with ' + bad.join(', '));
  // the sheet's own physical arrays are refilled in place (worker threads share them); everything else is replaced, and a
  // saved field that pointed at one of the refilled arrays points at the live one again
  const live = new Map(), later = [];
  for (const [k, v] of Object.entries(st.sheet)) {
    const cur = ctx.sheet[k];
    if(ArrayBuffer.isView(v)&&ArrayBuffer.isView(cur)&&(cur.length!==v.length||cur.constructor!==v.constructor))throw Error(`aware: sheet field mismatch: ${k}`);
    if (ArrayBuffer.isView(v) && ArrayBuffer.isView(cur) && cur.length === v.length && cur.constructor === v.constructor) { cur.set(v); live.set(v, cur); }
    else if (Array.isArray(v) && Array.isArray(cur) && k !== 'layers' && v.length === cur.length && v.every((a, j) => ArrayBuffer.isView(a) && ArrayBuffer.isView(cur[j]) && a.length === cur[j].length)) v.forEach((a, j) => { cur[j].set(a); live.set(a, cur[j]); });
    else later.push([k, v]);
  }
  const relink = v => ArrayBuffer.isView(v) ? (live.get(v) ?? v) : Array.isArray(v) ? v.map(relink) : v && typeof v === 'object' && !(v instanceof Map) && !(v instanceof Set) ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, relink(b)])) : v;
  for (const [k, v] of later) ctx.sheet[k] = relink(v);
  if (ctx.sheet._gpu) { ctx.sheet._gpu.pendingLayers = []; ctx.sheet._gpu.invalidateOptical(); ctx.sheet._gpu.cpuWroteAll(); }
  if (st.tailFrom !== null) {
    const rebuilt = st.tail.map(t => ({ ...t.fields, shapes: t.shapes.map(q => { if (q.tp < 0) return { mask: null, ...q.rest }; const sh = { mask: ctx.TP_SHAPES[q.tp].mask, ...q.rest }; TECHNIQUE.set(sh, TECHNIQUE.get(ctx.TP_SHAPES[q.tp])); return sh; }) }));
    // this plan's own passes before the first touch-up round (painted already; a revised plan may count them differently)
    const head = ctx.layers.filter(l => !l._touch).slice(0, st.tailFrom);
    while (head.length < st.tailFrom) head.push({ ...(head.at(-1) ?? { value: 0, pigment: 0 }), shapes: [], _awarePainted: 1 });
    ctx.layers.length = 0; ctx.layers.push(...head, ...rebuilt);
  }
  const j = st.js;
  ctx.DESIGNED_EXECUTION = j.designedExecution;
  if(ctx.NATIVE_RECORDER){if(!j.nativeMarkCounts)throw Error('Missing native recording prefix counts');ctx.NATIVE_MARK_COUNTS={...j.nativeMarkCounts};}
  FRAME_POLICY.restore(j.framePolicy);
  ({ laid: ctx.laid, dropped: ctx.dropped, droppedMass: ctx.droppedMass, filmLaid: ctx.filmLaid, filmNext: ctx.filmNext, filmPass: ctx.filmPass, drawnCount: ctx.drawnCount, STAGE: ctx.STAGE, LAST_FRAME_STAGE: ctx.LAST_FRAME_STAGE, frame: ctx.frame, lastPainted: ctx.lastPainted, ONSHEET, FEEDBACK_BASE, FEEDBACK_FRESH, VALUE_ACTIVE: ctx.VALUE_ACTIVE, VALUE_OWN_CONTACT: ctx.VALUE_OWN_CONTACT, VALUE_PIGMENT_CONTACT: ctx.VALUE_PIGMENT_CONTACT, VALUE_COMMAND: ctx.VALUE_COMMAND, INK_THK: ctx.INK_THK, WASH_THK: ctx.WASH_THK, WASH_BASE: ctx.WASH_BASE } = j);
  ctx.VALUE_OWN_CONTACT = new EpochCells(N2, ctx.VALUE_OWN_CONTACT);
  ctx.VALUE_PIGMENT_CONTACT = new EpochCells(N2, ctx.VALUE_PIGMENT_CONTACT);
  const refill = (a, b) => { a.length = 0; for (const v of b) a.push(v); };
  refill(FRAMES, j.FRAMES); refill(marks, j.marks); refill(TECHS, j.TECHS); refill(colourTrace, j.colourTrace);
  expected.set(j.expected); LAST.set(j.LAST);
  for (const k of Object.keys(used)) delete used[k]; Object.assign(used, j.used);
  Object.assign(feedbackStats, j.feedbackStats); Object.assign(BODY_CADENCE_RECORD, j.BODY_CADENCE_RECORD); j.VALUE_COUNTS.forEach((v, k) => Object.assign(VALUE_COUNTS[k], v));
  if (MARKTAPE) { refill(MARKTAPE, st.tape.marks); restoreTapeState(st.tape); }
  if(Boolean(INKRES)!==Boolean(st.inkres)||Boolean(PREPF)!==Boolean(st.prepf))throw Error('aware: auxiliary state mismatch');
  if(INKRES)INKRES.importState(st.inkres);
  if(PREPF)Object.assign(PREPF,st.prepf);
  TARGET_GUARD.importState(st.guard);
  ctx.RESUMING = false;
  console.log(`aware: took over the painting saved at ${awareWhere(at)} (${FRAMES.length} frames, ${MARKTAPE?.length ?? 0} tape entries); this plan has ${ctx.layers.length} passes`);
  return at;
};
// One boundary: progress, and a stop when the harness asks for one. save-exit saves and ends the process (exit 75).
const awareBoundary = async at => {
  if (!AWARE) return;
  const index = at.kind === 'start' ? 0 : at.kind === 'pass' ? at.L + 1 : null, from = at.kind === 'pass' ? at.L + 1 : at.kind === 'start' ? 0 : ctx.layers.length;
  const bad = awareUnsupported();
  const info = { index, closing: at.kind === 'closing', label: at.kind === 'start' ? 'before the first wash' : at.kind === 'closing' ? 'before the closing drawing' : `after pass ${at.L + 1} of ${ctx.layers.length}`,
    at, passesDone: from, passesPlanned: ctx.layers.length, ...awareCounts(), frame: ctx.frame, revisable: bad.length === 0, notRevisable: bad, remaining: awareRemaining(from), closingDrawing: Boolean(DRAW_LAST && DRAWING !== 'none') };
  const go = await AWARE.boundary(info, { renderPng: awareSheetPng });
  if (go.action === 'save-exit') {
    const dir = path.join(AWARE_DIR, `state-${index ?? 'closing'}`);
    await awareSave(dir, at);
    await drainFrames(); if (ctx.FRAMER) ctx.FRAMER.close(); ctx.sheet._gpu?.close();
    fs.writeFileSync(path.join(AWARE_DIR, 'saved.json'), JSON.stringify({ dir, at, savedAt: new Date().toISOString() }));
    // the options this process read: a later segment skips what is painted, so a painting's check of unread options
    // counts an option as read if any of its segments read it
    fs.writeFileSync(path.join(out, `aware-options-read-${process.pid}.json`), JSON.stringify([...OPTS_READ]));
    console.log('aware: saved for a revised plan; exit 75');
    process.exit(75);
  }
};
let L_START = 0;
if (ctx.RESUMING) { const at = awareRestore(); L_START = at.kind === 'start' ? 0 : at.kind === 'pass' ? at.L + 1 : ctx.layers.length; }
else await awareBoundary({ kind: 'start' });
if (!ctx.WASH_BASE && !PENWASH && L_START < ctx.layers.length) ctx.WASH_BASE = cellRGB(render(), { w, h, SC, W2 });
if (TECH_CAL && L_START === 0) {
  let initialHeld = 0;
  if (ONSHEET) for (let k = 0; k < ONSHEET.length; k++) initialHeld += ONSHEET[k];
  TECH_CAL.observe(initialHeld);
}
for (let L = L_START; L < (PENWASH ? 0 : ctx.layers.length); L++) {
  if(L===ctx.FINISH_START){ctx.AREA_PLAN=ctx.FINISH_PLAN;ctx.AREA_COMPILED=ctx.FINISH_COMPILED;AREA_EXEC.set(null);if(ctx.FINISH_PLAN.doc.finishingBase){const b=ctx.FINISH_PLAN.doc.finishingBase;dry(ctx.sheet,b.maxSteps,O,{levelMax:140,dt:b.dt});const paper=measurePaperDry(ctx.sheet);fs.writeFileSync(path.join(out,'finishing-dry-base.json'),JSON.stringify({kind:'actual declared whole base ordinarydry before connected finishing contacts',declared:b,paper},null,2));check('finishing connected pass requires measured dry base',paper.dry,{waterMax:paper.waterMax,saturationMax:paper.saturationMax});}await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'finishing-base-before.png'));coherent(ctx.sheet);ctx.FINISH_MASS_BEFORE=thicknessTotals(ctx.sheet);}
  const layer = ctx.layers[L];
  // --finishsnaps 1: the sheet as the finish begins (the planned ladder laid, before the touch-up rounds), for review
  if (layer._touch === 1 && num('finishsnaps', 0) > 0) { dry(ctx.sheet, 20000, O, { levelMax: 200 }); await sharp(render(), { raw: { width: W2, height: H2, channels: 3 } }).png().toFile(path.join(out, 'finish-start.png')); }
  if (layer._darks) { if (num('finishsnaps', 0) > 0) { dry(ctx.sheet, 20000, O, { levelMax: 200 }); await sharp(render(), { raw: { width: W2, height: H2, channels: 3 } }).png().toFile(path.join(out, 'finish-touched.png')); } const add = finalDarks(); if (add.length) ctx.layers.splice(L + 1, 0, ...add); continue; }
  if (layer._touch) { const add = touchCorrections(layer._touch); if (add.length) { ctx.layers.splice(L + 1, 0, ...add); if (layer._touch < TP_ROUNDS) ctx.layers.splice(L + 1 + add.length, 0, { _touch: layer._touch + 1, shapes: [], value: 0, pigment: 0 }); } continue; }
  if(ctx.AREA_PLAN)AREA_EXEC.set(layer._semantic);
  colourMass('before-pass', {pass:L+1,value:layer.value,pigment:layer.pigment});
  if (opt('feedback', '1') !== '0') {
    if (FEEDBACK_LAG && FEEDBACK_BASE && !FEEDBACK_FRESH) {
      const { onsheet: B, booked: E } = FEEDBACK_BASE; ONSHEET = new Float32Array(B.length);
      for (let k = 0; k < B.length; k++) ONSHEET[k] = Math.max(0, B[k] + expected[k] - E[k]);
      feedbackStats.predicted++;
    } else {
    if (!ONSHEET || ONSHEET.length !== n * PIGS.length) ONSHEET = new Float32Array(n * PIGS.length);
    thicknessInto(ctx.sheet, ONSHEET, {pigments:PIGS.length, scale:SC});
    feedbackStats.read++; FEEDBACK_FRESH = false;
    if (DELIVERY) { const P = PIGS.length, held = new Float64Array(P); for (let k = 0; k < n; k++) for (let j = 0; j < P; j++) held[j] += ONSHEET[k * P + j]; DELIVERY.observe(held); }
    if (TECH_CAL) { let held = 0; for (let k = 0; k < ONSHEET.length; k++) held += ONSHEET[k]; TECH_CAL.observe(held); }
    if (FEEDBACK_LAG) FEEDBACK_BASE = { onsheet: ONSHEET.slice(), booked: expected.slice() };
    if (REMIX) REMIX.refresh(thickness(ctx.sheet).map(t => { const c = new Float32Array(n); for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) c[((y / SC) | 0) * w + ((x / SC) | 0)] += t[y * W2 + x] / (SC * SC); return c; }));
    }
  }
  // Each passage in the pass is charged for itself: one colour, loaded stronger or weaker as the passage asks.
  let shIdx = 0; const shQuarter = Math.max(1, Math.ceil(layer.shapes.length / 4));
  for (const sh of layer.shapes) {
  if(DELIVERY||TECH_CAL)sh._paintExecuted=false;
  if(BUDGET && !BUDGET.target(sh)) continue;
  ctx.AREA_NUMERIC_SEQUENCE=ctx.AREA_PLAN?semanticNumericSequence(ctx.AREA_PLAN.doc,sh._semantic,L,layer.shapes.indexOf(sh)):null;
  if (PROBE) {
    const m = sh.mask, cut = new Uint8Array(n); let area = 0;
    for (let i = 0; i < n; i++) if (m[i] && PROBE.m[i]) { cut[i] = 1; area++; }
    if (!area) continue;
    if (area !== sh.area) { sh.mask = cut; sh.area = area; sh._brushMask = null; }
  }
  if (FINISH) {
    const clipped = clipToFinish(sh.mask, FINISH, (layer.value - 1) / Math.max(1, ctx.steps - 1));
    if (!clipped.area) continue;
    sh.mask = clipped.mask; sh.area = clipped.area;
  }
  // The passage as a field over the whole sheet, unpacked once. It is held as a label in its pass's own field, and
  // asking for it inside a loop would unpack it on every read.
  let MASK = sh.mask;
  const MB = sh._mbox = sh.box ?? sh._mbox ?? maskBox(MASK); // the loops below (and the ledger update that follows the pass) stay inside the passage's rows and columns
  if (process.env.FW_DUMP && L < num('dumppasses', 3)) { const g = Buffer.alloc(n), bm = brushMask(sh); for (let i = 0; i < n; i++) g[i] = MASK[i] ? 255 : bm[i] ? 128 : 0; fs.mkdirSync(process.env.FW_DUMP, { recursive: true }); await sharp(g, { raw: { width: w, height: h, channels: 1 } }).png().toFile(path.join(process.env.FW_DUMP, `L${L + 1}-v${layer.value}-p${layer.pigment}-s${layer.shapes.indexOf(sh)}.png`)); }
  // --trace: every pigment's mass on the sheet before the passage, so a mixed passage is counted whole
  const TRACE_MASS = opt('trace', '0') !== '0' ? thicknessTotals(ctx.sheet) : null;
  // The plan's move is final: an area pass's move (semanticTechnique below) or a value plan's (valueTechnique); only a
  // passage no plan wrote takes the technique read off the source (techniqueOf, the automatic ladder). No switch
  // replaces a planned move.
  let T = sh._semantic ? {} : sh._valuePlan ? valueTechnique(sh._valuePlan) : techniqueOf(sh);
  if(sh._semantic){requireAuthoredCalibration(sh._semantic,SEMANTIC_CAL_MODE,SEMANTIC_CAL);T=semanticTechnique(sh._semantic,T);ctx.AREA_WET??=new Set();if((T.intoWet===false&&sh._semantic.pass.move!=='wet-edge continuation'&&!semanticSameSession(ctx.AREA_LAST,sh._semantic))||hardEdgeDue(ctx.AREA_PLAN,sh._semantic.area.id,ctx.AREA_WET)){clock('dry',()=>dry(ctx.sheet,30000,O,{levelMax:140,dt:2}));ctx.AREA_WET.clear();}ctx.AREA_LAST=sh._semantic;}
  T=chooseMajorBaseWash(MAJOR_INTENT,T,{value:layer.value,area:sh.area??0,cells:n,semantic:Boolean(sh._semantic)});
  T=connectedSkyContact(MAJOR_INTENT,T,{pass:L+1,area:sh.area??0,cells:n});
  if(sh._valuePlan){if(!sh._semantic)T=valueTechnique(sh._valuePlan);ctx.VALUE_ACTIVE=sh._valuePlan;const inSession=WASH_SESSION>0&&ctx.WASH_LAST&&(ctx.WASH_LAST.L===L||(WASH_SESSION>1&&sameWash(ctx.WASH_LAST.layer,layer)));ctx.WASH_LAST={L,layer};if(!inSession)ctx.VALUE_OWN_CONTACT.clear();if(!T.intoWet&&!inSession){clock('dry',()=>dry(ctx.sheet,30000,O,{levelMax:140,dt:2}));const base=measurePaperDry(ctx.sheet);JSONL.append(path.join(out,'value-commands.jsonl'),JSON.stringify({kind:'dry-base',intent:ctx.VALUE_ACTIVE.id,paper:base})+'\n');check('target-value pass needs fully dry base',base.dry,{intent:ctx.VALUE_ACTIVE.id,waterMax:base.waterMax,saturationMax:base.saturationMax});}}
  if(BUDGET) T={...T, name:'wet on dry',passes:1,intoWet:false,dryAfter:true,water:.62,wetMix:.55,bridge:.78,bridgeSoft:2.2};
  // one passage for the dry-paper gate: its reach is looked over once, before its first lane (passage-dry-gate.mjs)
  ctx.VALUE_PASSAGE = sh._valuePlan ? {} : null;
  // what this passage's own instrument delivers on scrap (instrument-cal.mjs); the charge below is divided by it
  const ICAL = instrumentOf(T, sh);
  sh.dryAfter = T.dryAfter;
  ctx.MAJOR_TECHNIQUE=MAJOR_INTENT?{...T,shapeId:'numeric-L'+L+'-S'+layer.shapes.indexOf(sh),numericalValue:layer.value,shapeArea:sh.area,firstWash:Boolean(sh.firstWash),materialStatus:'existing production technique/profile consumed; actual contact/state recorded before each stroke'}:null;
  // A passage asks for a shape-level look (plan and sheet means; the charge would come from their difference). A passage
  // is never a step-back (src/paint/step-backs.mjs), so the look is null in both modes and the passage keeps the charge
  // frozen at planning; the same holds for the kept-colour recharge and the texture look below.
  // SHAPE_LOAD spreads that one number over the shape for path planners that take a field; it steers nothing.
  const colourMix = sh.mix.filter(v=>v>1e-9).length>1 ? shapeMix(sh) : COLOUR_BUDGET && PUDDLES ? sh.mix.map(v=>v/Math.max(1e-9,sh.amount)) : layer.mixv;

  const LEDGER = ONSHEET ?? expected;
  const LOOK_REF = colourMix ? LOOK_PLAN : LOOK_AL;
  const LOOK = paintingLook('passage', `L${L + 1}/s${layer.shapes.indexOf(sh)}`, MASK, { box: { ...MB, w }, ref: [LOOK_REF], sheet: { ledger: { arr: LEDGER, stride: PIGS.length }, booked: { arr: expected, stride: PIGS.length } } });
  const SHAPE_LACK = LOOK ? shapeDeficit(LOOK.ref[LOOK_REF], LOOK.sheet.ledger, { mix: colourMix, pigment: layer.pigment }) : sh.amount;
  let shapeLoad=null;
  const getShapeLoad=()=>{
    if(shapeLoad)return shapeLoad;
    shapeLoad=SHAPE_LOAD_BUFFER;invalidateFlowField(shapeLoad);shapeLoad.fill(0);
    for(let y=MB.y0;y<=MB.y1;y++)for(let i=y*w+MB.x0,e=y*w+MB.x1;i<=e;i++)if(MASK[i])shapeLoad[i]=SHAPE_LACK;
    return shapeLoad;
  };
  // under --feedback the passage is charged for what the shape still lacks, against what the plan asked of this pass,
  // both as shape means: from none when the sheet already holds the shape's amount, up to twice when it holds far less.
  // A shape too small to squint at, or any passage outside a step-back (the look returns null), is charged its planned
  // amount: since passages are not step-backs, --feedback reads the sheet but no longer changes a passage's charge.
  if (ONSHEET && sh._fb == null) sh._fb = LOOK ? shapeCharge(SHAPE_LACK, shapeDeficit(LOOK.ref[LOOK_REF], LOOK.sheet.booked, { mix: colourMix, pigment: layer.pigment })) : 1;
  // --skipheld f: skip a broad passage the sheet already holds (feedback charge under f). Default 0.
  // --skipheldmin: least share of the sheet for a passage to be skipped (default 0.02); small features are always laid.
  if (ONSHEET && num('skipheld', 0) > 0 && (sh._fb ?? 1) < num('skipheld', 0) && sh.area >= num('skipheldmin', 0.02) * n) { used['held, skipped'] = (used['held, skipped'] || 0) + 1; continue; }
  used[T.name] = (used[T.name] || 0) + 1;
  // the technique that last laid each cell, so coverage can be read per technique at the end
  { const id = (TECHS.includes(T.name) ? TECHS : TECHS.push(T.name) && TECHS).indexOf(T.name); for (let y = MB.y0; y <= MB.y1; y++) for (let i = y * w + MB.x0, e = y * w + MB.x1; i <= e; i++) if (MASK[i]) LAST[i] = id + 1; }
  // How far through the ladder this pass is, 0..1.
  // --touchbroad 1: a touch-up glaze (its pass numbered past the ladder's end) is laid as a mid-ladder glaze with the
  // floor brush, not as detail marks or rigger touches, which is what its pass number alone would make of it.
  // A final dark (--finaldarks) is laid as the ladder's last passes are, with the small floored brush, not as detail marks.
  const throughRaw = (layer.value - 1) / Math.max(1, ctx.steps - 1);
  const through = layer._darkPass ? Math.min(throughRaw, 0.95) : layer._touched && num('touchbroad', 0) > 0 ? Math.min(throughRaw, num('touchthrough', 0.5)) : throughRaw;
  // --detailfrom t: passes later than t of the ladder are laid as detail marks, not glazes. Default 2, never.
  // an area pass that names surface marks (pass.marks) is laid as those marks, as explicit gestures
  const authoredPaths=sh._semantic?lowerAuthoredGestures(sh._semantic,{target:ctx.AREA_PLAN.doc.target,crop:ctx.AREA_PLAN.crop,width:W2,height:H2,sheetWidthMm:num('sheetmm', DEFAULT_SHEET_MM)*ctx.AREA_PLAN.doc.target.width/ctx.AREA_PLAN.crop[2]})??semanticMarks(sh,MASK):null;
  const skyLaneRadius = sh2 => {
    if (!(num('skylanes', 0) > 0)) return 0;
    const laneMm = num('skylanemm', 3); // read on every sheet, so a typed value is not reported unused when the picture has no cool sky
    if (!sh2._valuePlan || sh2._valuePlan.texture) return 0;
    const cool = sh2._valuePlan?.cool ?? 0;
    return cool ? laneMm / (num('sheetmm', DEFAULT_SHEET_MM) / w) : 0;
  };
  // --texflow: texture density over a shape is one number from a 'texture' look; direction comes from the planned flow field
  const flowDark=sh._valuePlan?.texture&&num('texflow',0)>0?(()=>{const lk=paintingLook('texture',`L${L + 1}/s${shIdx}`,MASK,{box:{...MB,w},ref:['px']});if(!lk)return .5;const [r,g,b]=lk.ref.px;return Math.max(0,Math.min(1,1-(.2126*r+.7152*g+.0722*b)/250));})():1;
  // --strokeplan: the passage's strokes and their charge factors were planned before painting (stroke-plan.mjs)
  const PATH_FACTOR=new WeakMap(),PATH_RAMP=new WeakMap(),strokePlanPaths=s=>s._strokePlan.paths.map((ps,k)=>{const q=ps.map(p=>({...p,x:p.x*SC,y:p.y*SC,r:p.r*SC}));PATH_FACTOR.set(q,s._strokePlan.factors[k]);if(s._strokePlan.ramps?.[k])PATH_RAMP.set(q,s._strokePlan.ramps[k]);return q;});
  // the plan's graded plane (graded-demand.mjs) carries the grade through the physical loads below; the single-sweep
  // pressure ramp stands in for it only where there are no physical loads
  const attachPlaneRamp = raw => attachRampToPaths(raw, PB && sh._plane ? null : (sh._rampVec ?? sh._valuePlan?.rampVec), SC, PATH_RAMP);
  const makeShapedPlanePaths = () => shapedPlanePaths(MASK,w,h,{scale:SC,texture:sh._valuePlan.texture,shortMm:num('texshort',0)>0?sh._valuePlan.resolution.mmPerCell:0,shortPress:num('texpress',.3),lanesR:skyLaneRadius(sh),laneStep:num('skylanestep',1.5),flowDark,box:MB,mmPerCell:num('sheetmm',DEFAULT_SHEET_MM)/w,maxBrushMm:38,protect:ctx.VALUE_PLAN?.protectedCells,edgeHalf:(r,p)=>edgeHalfWidth(r,{pressure:p,splay:WASH_FLAT_SPLAY})});
  const rawShapedPaths = () => (sh._valuePlan.brush?.paths ? passageBrushPaths(sh._valuePlan.brush, SC) : makeShapedPlanePaths());
  // A wash of the wash plan arrives as strokes in millimetres inside its outline (wash-strokes.mjs). They are laid as
  // written and nothing clips them: the wash's edge is where the brush's footprint ends.
  const CELLS_PER_MM = W2 / num('sheetmm', DEFAULT_SHEET_MM);
  // The plan gives each stroke the half-width it is to lay. The brush that lays that half-width on this sheet is a little
  // wider (the engine's own edgeHalfWidth, which the lanes of every wash are spaced by), so it is sized through that.
  const brushFor = half => { let r = half + 1; for (let it = 0; it < 6; it++) r += half - edgeHalfWidth(r, { pressure: 1, splay: WASH_FLAT_SPLAY }); return Math.max(SC, r); };
  // A lane is swept with a flat; every other stroke of a wash is a round's (its footprint a disc, as the plan counts it).
  // a wash plan's strokes are a list of laid strokes (fair-wash.mjs); a light-to-dark plan's are a count and lane widths for its stroke plan
  const vectorPaths = !BUDGET && Array.isArray(sh._valuePlan?.strokes) ? sh._valuePlan.strokes.map(st => { const round = st.kind !== 'lane', r = round ? Math.max(SC, st.radiusMm * CELLS_PER_MM) : brushFor(st.radiusMm * CELLS_PER_MM); return st.points.map(q => ({ x: q[0] * CELLS_PER_MM, y: q[1] * CELLS_PER_MM, r, p: 1, round })); }) : null;
  const shapedPaths = vectorPaths ? vectorPaths : BUDGET ? budgetPaths(up(MASK), W2, H2, BUDGET.target(sh)) : sh._valuePlan?.shaped ? (sh._strokePlan ? strokePlanPaths(sh) : attachPlaneRamp(rawShapedPaths())) : null;
  let detail = !sh._valuePlan && !authoredPaths && through > num('detailfrom', 2);
  // A graded wash runs down its gradient and is not walked, so each few cells can be charged for where they are (--gradedwash).
  // an area plan's graded or variegated wash (pass.wash) runs its lanes across its direction (area-washes.mjs)
  const gradedAngle = sh._washAngle ?? (sh.graded && !sh._follow ? (sh._gradedAngle ?? null) : null);
  // --brushfloor R: smallest wash brush, R px at 1086 wide, until --floorfrom of the ladder (default 0.85). The sheet's clip holds the edge.
  // Under --physical, passes after --floorfrom may use the detail brush (rigger).
  // --detailfloor 1: under --physical the floor brush moves toward the detail brush by the share of cells with focus over --detailfocus.
  // an area pass's lanes are planned for the brush that lays them (its pass.brush width), not for a kit brush whose
  // lanes it would then paint with gaps or pile-ups between them
  const PASS_R = sh._semantic && !authoredPaths && !detail ? sh._semantic.pass.brush.widthMm / (2 * (num('sheetmm', DEFAULT_SHEET_MM) / W2)) : null;
  const FLOOR = PASS_R ?? (() => { const f = num('brushfloor', 0); if (layer._darkPass || authoredPaths || (f <= 0 && !PB) || detail) return 0; if (through > num('floorfrom', 0.85)) return PB ? Math.max(SC, PB.detailR) : 0; const base = Math.max(SC, PB ? PB.floorR : f * W2 / 1086); if (PB && FOCUS && num('detailfloor', 0) > 0) { const thr = num('detailfocus', 0.5); let a = 0, c = 0; for (let i = 0; i < n; i++) if (sh.mask[i]) { a++; if (FOCUS[i] > thr) c++; } const q = a ? c / a : 0; return Math.max(SC, base + (Math.max(SC, PB.detailR) - base) * q); } return base; })();
  let _floorMask = null;
  const getFloorMask = () => (_floorMask ??= up(brushMask(sh)));
  let FLOOR_R = FLOOR;
  // under --strokebudget the passage gets its share of the strokes: the brush and the closing radius grow together
  // until its sweeps fit (stroke-budget.mjs)
  const floorPaths = rr => {
   const baseOpts = { pad: num('pad', 1.5) * SC, padShare: num('padshare', 0), minRadius: rr, minLength: 2 * rr, maxRadius: PASS_R ?? Math.max(rr, BRUSH), seed: 17 + ctx.laid + SEED, overlap: num('overlap', 0.15), walk: opt('walk', '1') !== '0' && gradedAngle == null, outerDrift: num('outerdrift', 1.5) * SC, angle: gradedAngle };
   const bm = brushMask(sh), row0 = MB.y0 * w, row1 = (MB.y1 + 1) * w;
   // Cache geometry only; paper observation, charge, contact and drying still execute.
   return prof('floor lanes', () => cachedStepSync({...RUN_CACHE,name:'floor-paths',code:CODE_HASH,track:optTrack,
     inputs:{mask:bm === MASK ? bm.subarray(row0, row1) : bm,box:[MB.y0,MB.y1,w,h,W2,H2,SC],field:shapeLoad ? shapeLoad.subarray(row0, row1) : [SHAPE_LACK, bm === MASK ? null : MASK.subarray(row0, row1)],rr,options:baseOpts}},()=>{
       const fm = getFloorMask(), options = { ...baseOpts, field: getShapeLoad() };
       const plan = prof('floor close', () => closeLocal(fm, W2, H2, rr));
       return brushedWashPaths(plan,W2,H2,options).map(pts=>pts.map(p=>({...p,r:Math.max(rr,p.r)})));
     }).value);
  };
  // a final dark goes on with a small round brush drawn through the accent itself, held to it by the clip below
  // a final dark is laid as touches and strokes of the detail brush's tip over its accent family (final-dark-marks.mjs)
  const TIP_R = Math.max(SC, PB ? PB.detailR : SC);
  const darkPaths = layer._darkPass ? tipMarks(washPaths(up(MASK), W2, H2, { pad: 0.2 * SC, minRadius: TIP_R, minLength: 2 * SC }), TIP_R) : null;
  const paths = shapedPaths ?? authoredPaths ?? darkPaths ?? clock('paths', () => FLOOR
    ? (() => { let rr = FLOOR, P = floorPaths(rr); const T = BUDGET ? BUDGET.target(sh) : Infinity; for (let it = 0; it < 7 && P.length > T && rr < 3 * BRUSH; it++) { rr *= 1.6; P = floorPaths(rr); } FLOOR_R = rr; return P; })()
    : (detail
    ? detailMarks(getShapeLoad(), w, h, { length: num('marklen', 11), spacing: num('markgap', 6), seed: 7 + ctx.laid + SEED, coverage: num('markcover', 0.3) })
        .map(m => m.map(p => ({ x: (p.x + 0.5) * SC, y: (p.y + 0.5) * SC, r: Math.max(SC * 0.6, num('markr', 1.6) * SC), p: 1 })))
    : brushedWashPaths(up(brushMask(sh)), W2, H2, { pad: num('pad', 1.5) * SC, padShare: num('padshare', 0), minRadius: SC, minLength: 3 * SC, maxRadius: layer._detail ? Math.max(SC, Math.round(num('detailbrush', 0.3) * BRUSH)) : BRUSH, field: getShapeLoad(), seed: 17 + ctx.laid + SEED, ...(sh._washAngle != null ? { angle: sh._washAngle, walk: false } : {}), fallbackAngle: opt('handangle', '0') !== '0' ? handAngle(ctx.laid) : null, jitter: (handAngle(ctx.laid + 7919) - num('handmean', 0.35)) / num('handspread', 1.4) * num('handjitter', 0), overlap: num('overlap', 0.15), walk: opt('walk', '1') !== '0' && gradedAngle == null, outerDrift: num('outerdrift', 1.5) * SC, angle: gradedAngle })).slice());
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
    const cellMmHigh = num('sheetmm', DEFAULT_SHEET_MM) / W2;
    const cutMm = opt('cutbandmm', '') !== '' ? num('cutbandmm', 3.175) : (opt('cutband', '') !== '' ? num('cutband', 2) * (num('sheetmm', DEFAULT_SHEET_MM) / 270) : 3.175);
    const CB = Math.max(1, Math.round(cutMm / cellMmHigh));
    const cutInMm = opt('cutbandinmm', '') !== '' ? num('cutbandinmm', cutMm) : (opt('cutbandin', '') !== '' ? num('cutbandin', 2) * (num('sheetmm', DEFAULT_SHEET_MM) / 270) : cutMm);
    const CBIN = FW_SUBJ ? Math.max(1, Math.round(cutInMm / cellMmHigh)) : CB;
    const CF = num('cutfrac', 0); let CAP = Infinity;
    if (CF > 0) { let dmax = 0; for (let i = 0; i < N2; i++) if (M[i] && dist[i] > dmax) dmax = dist[i]; CAP = Math.max(1, CF * 2 * dmax); }
    const SUBJ2 = CBIN !== CB ? up(FW_SUBJ) : null, bandAt = i => Math.min((SUBJ2 && SUBJ2[i] ? CBIN : CB), CAP);
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
  // A wash of the wash plan (thing-washes.mjs) is a whole shape laid in sweeps. One no sweep fits is left and counted: it gets
  // no touch placed at its centroid.
  if (vectorPaths) { used['unclipped wash strokes'] = (used['unclipped wash strokes'] || 0) + paths.length; }
  if (!paths.length && sh._valuePlan?.mixId != null) { used['wash no sweep fits, left'] = (used['wash no sweep fits, left'] || 0) + 1; ctx.dropped++; ctx.droppedMass += sh.amount * sh.area; continue; }
  if (!paths.length) {
    const FLOORMASK = FLOOR ? getFloorMask() : null;
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
      : detailMarks(getShapeLoad(), w, h, { length: num('marklen', 9), spacing: 2, seed: 7 + ctx.laid + SEED, coverage: 0.9, minWant: 0.005 })
        .map(m => m.map(p => ({ x: (p.x + 0.5) * SC, y: (p.y + 0.5) * SC, r: Math.max(SC * 0.5, SC), p: 1 })));
    if (!rescued.length) { ctx.dropped++; ctx.droppedMass += sh.amount * sh.area; if (FSKIP) sh._booked = true; continue; }
    paths.push(...rescued);
    used[FLOOR ? 'floor dab' : 'small brush'] = (used[FLOOR ? 'floor dab' : 'small brush'] || 0) + rescued.length;
    if (!FLOOR) detail = true;
  }
  // under --crisp the bead stops at the passage's own edge, for the clean water and the paint alike
  if (process.env.FW_DUMP && L < num('dumppasses', 3)) { const g = Buffer.alloc(N2); for (const pts of paths) for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[Math.min(pts.length - 1, k + 1)], m = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y))); for (let t = 0; t <= m; t++) { const x = Math.round(a.x + (b.x - a.x) * t / m), y = Math.round(a.y + (b.y - a.y) * t / m); if (x >= 0 && y >= 0 && x < W2 && y < H2) g[y * W2 + x] = Math.hypot(b.x - a.x, b.y - a.y) > 6 * SC ? 128 : 255; } } await sharp(g, { raw: { width: W2, height: H2, channels: 1 } }).png().toFile(path.join(process.env.FW_DUMP, `P${L + 1}-s${layer.shapes.indexOf(sh)}.png`)); }
  const crispHere = vectorPaths ? false : !!BUDGET || !!shapedPaths || semanticUsesNumericClip(sh._semantic) && CRISP.on && CRISP.wants(T, detail);
  // --washreach: a planned stroke may end past the outline, so the clip is the passage grown by the reach, still off
  // the plan's reserved lights; the edge is where the strokes end, not the mask
  const P = ctx.VALUE_PLAN?.protectedCells;
  if (touchSmall) { const d = dilate(MASK, w, h, 1); setClip(ctx.sheet, up(P ? Uint8Array.from(d, (v, i) => v && !P[i] ? 1 : 0) : d)); }
  if (layer._darkPass) { const c = darkClip(P), cl = c ? up(c) : null; if (cl && PROBE?.clip) for (let s = 0; s < cl.length; s++) cl[s] = cl[s] && PROBE.clip[s] ? 1 : 0; setClip(ctx.sheet, cl ?? (PROBE ? PROBE.clip : null)); used['final dark'] = (used['final dark'] || 0) + paths.length; }
  if (crispHere) {
    const baseMask=brushMask(sh),reach=sh._strokePlan?.reachCells??0;
    const clipMask=reach>0?(()=>{const g=dilate(baseMask,w,h,Math.ceil(reach*.8)+1);return P?Uint8Array.from(g,(v,i)=>v&&!P[i]?1:0):g;})():baseMask;
    // --softclipmm r: along the plan's soft boundary cells the clip opens r mm past the passage (graded-demand.mjs
    // softClipMask), so the bead runs out there and the edge takes the brush's own fall-off; hard boundary cells and
    // reserved lights keep the cut. Default 0 (every edge cut): at 0.75 mm the plan calls nearly every boundary soft
    // (4820 of 4999 passages on Trumbull opus/1) and the stone hints and glazes spread into soft blots. Not with --softwet.
    const softReach=SOFT_WET_MM>0||reach>0||!sh._valuePlan?.edges||sh._valuePlan.texture?0:Math.round(num('softclipmm',0)/(num('sheetmm', DEFAULT_SHEET_MM)/w));
    const soft=softReach>0?softClipMask(clipMask,sh._valuePlan.edges,w,h,softReach,P):null;
    const grow=soft?.ring?softReach*SC:0;
    const box=baseMask===MASK&&reach<=0?{x0:Math.max(0,MB.x0*SC-grow),y0:Math.max(0,MB.y0*SC-grow),x1:Math.min(W2-1,(MB.x1+1)*SC-1+grow),y1:Math.min(H2-1,(MB.y1+1)*SC-1+grow)}:null;
    setClip(ctx.sheet,up(soft?.ring?soft.clip:clipMask),box);used['crisp edge']=(used['crisp edge']||0)+1;
    if(soft?.ring)used['soft edge, open clip']=(used['soft edge, open clip']||0)+1;
  }
  // under --brushfloor the clip is the passage closed by --clipclose (default 1.5) floor radii, joined with the probe's,
  // so pinholes inside a passage do not become paper holes. The outer edge is not moved.
  if (!BUDGET && !shapedPaths && FLOOR && !touchSmall && semanticUsesNumericClip(sh._semantic)) { const FLOORMASK = getFloorMask(), cr = num('clipclose', 1.5) * FLOOR, cm = prof('clip close', () => closeLocal(FLOORMASK, W2, H2, cr)); const c0 = PROBE ? Uint8Array.from(cm, (v, i) => v & PROBE.clip[i]) : cm;
    setClip(ctx.sheet, c0); used['floored brush'] = (used['floored brush'] || 0) + 1; }
  if (detail) used[T.name === 'dry brush' ? 'dry brush marks (detail)' : 'detail marks'] = (used[T.name === 'dry brush' ? 'dry brush marks (detail)' : 'detail marks'] || 0) + paths.length;
  ctx.WET_TRACE?.passage({ pass: L + 1, shape: layer.shapes.indexOf(sh), technique: T.name, move: sh._valuePlan?.move ?? null, texture: !!sh._valuePlan?.texture, value: layer.value, paths: paths.length });
  let SOFT_RING = null;
  if (SOFT_WET_MM > 0 && crispHere && !BUDGET && !detail && !(sh._strokePlan?.reachCells > 0) && sh._valuePlan && !sh._valuePlan.texture && sh._valuePlan.edges?.softCells?.length && paths.length && opt('softwetphases', 'light,mid,shadow').split(',').includes(sh._valuePlan.phase)) {
    const rc = SOFT_WET_MM / (num('sheetmm', DEFAULT_SHEET_MM) / w);
    const ring = softRing(brushMask(sh), sh._valuePlan.edges.softCells, sh._valuePlan.edges.hardCells, w, h, rc, ctx.VALUE_PLAN?.protectedCells);
    if (ring.some(v => v)) {
      setClip(ctx.sheet, up(ring));
      const rad = Math.max(1, rc * SC);
      for (const arc of softBoundaryPaths(sh._valuePlan.edges.softCells, w, n)) {
        const pts = arc.map(q => ({ x: q.x * SC, y: q.y * SC, r: rad, p: 0.6 }));
        const water = createBrush({ flat: false, radius: rad, bristles: Math.max(12, Math.ceil(rad * 2)), capacity: 60, belly: 6, feed: 0.3, give: 0.9, free: 0.4, film: 0.25, stiffness: 6, seed: SEED + ctx.laid + 4241 });
        dip(water, { water: num('softwetwater', 1), conc: SHEET_PIGS.map(() => 0) });
        stroke(water, ctx.sheet, pts, { upright: false, lift: true });
      }
      const baseM = brushMask(sh);
      const relaxedClip = P
        ? Uint8Array.from(baseM, (v, i) => (v || ring[i]) && !P[i] ? 1 : 0)
        : Uint8Array.from(baseM, (v, i) => v || ring[i] ? 1 : 0);
      setClip(ctx.sheet, up(relaxedClip));
      SOFT_RING = ring; used['soft edge, clean water'] = (used['soft edge, clean water'] || 0) + 1;
    }
  }
  // wet on wet means the paper is wet when the paint arrives: clean water first, over the same shape.
  // --prewet 1: dampen a passage laid in more than --prewetlanes lanes first, so lanes do not dry into rims. Default 0.
  // --splwet: optional dampening for stroke lanes. A value plan controls its own wet/dry technique;
  // do not silently prewet its dry-base glazes. Explicit --splwet 1 still prepares a connected wet bed.
  let wetEachLane = null;
  if (!BUDGET && !sh._semantic&&(T.intoWet || ((opt('prewet', '0') !== '0' || (sh._strokePlan && num('splwet', sh._valuePlan ? 0 : 1) > 0)) && !detail && paths.length > num('prewetlanes', 1)))) {
    // --gradedprewet s: a graded wash's clean water reaches s of the short side past it onto equally pale paper. Default 0.03.
    const reach = sh.graded && !sh._follow ? Math.round(num('gradedprewet', 0.03) * Math.min(w, h)) : 0;
    // --prewetinset k: wet the shape shrunk by k cells at 540 px, not its paths, so its edge lands on dry paper. Default 0.
    // --prewetwater: the water brush's load (default 1).
    const INSET = num('prewetinset', 0), insetCells = INSET > 0 ? Math.max(1, Math.round(INSET * w / 540)) : 0;
    const wetOver = reach > 0
      ? (() => { const M = up(sh._prewet ?? MASK); return containPaths(brushedWashPaths(M, W2, H2, { pad: 1.5 * SC, minRadius: SC, minLength: 3 * SC, maxRadius: BRUSH, seed: 17 + ctx.laid + SEED, overlap: num('overlap', 0.15), walk: false, angle: gradedAngle }), distanceToZero(M, W2, H2), W2, H2, { minRadius: 0.8 * SC, minLength: 2 * SC, slack: num('slack', 0.5) * SC, segments: FW }); })()
      : insetCells > 0
        ? (() => { const M = up(erode(MASK, w, h, insetCells)); if (!M.some(v => v)) return []; return containPaths(brushedWashPaths(M, W2, H2, { pad: 0, minRadius: SC, minLength: 3 * SC, maxRadius: BRUSH, seed: 17 + ctx.laid + SEED, overlap: num('overlap', 0.15), walk: false, angle: gradedAngle }), distanceToZero(M, W2, H2), W2, H2, { minRadius: 0.8 * SC, minLength: 2 * SC, slack: 0, segments: FW }); })()
        : paths;
    // every value-plan passage laid wet into wet has its bed prepared under the brush (tools/plate/sheet.mjs, prepareWetBed),
    // as a named passage material always had: wetted at 0.55 over the shape if it is not moist, never lane by lane at a full load
    const ownBed = Boolean(sh._valuePlan?.passageMaterial) || (Boolean(sh._valuePlan) && sh._valuePlan.move === 'wet on wet');
    const shapeCells = sh._valuePlan?.passageMaterial?.move === 'wet on wet' || (ownBed && sh._valuePlan.move === 'wet on wet') ? up(MASK).reduce((a, v, i) => (v && !ctx.sheet.resist?.[i] && a.push(i), a), []) : null;
    const shapePaper = shapeCells?.length ? measurePaper(ctx.sheet, shapeCells, SPEED_PAPER) : null;
    const needPrewet = !shapePaper || shapePaper.moistShare < 0.7;
    const wetLane = pts => {
      if(sh._semantic&&!authoredPaths)pts=pts.map(p=>({...p,r:sh._semantic.pass.brush.widthMm/(2*(num('sheetmm', DEFAULT_SHEET_MM)/W2))}));
      const r = vectorPaths ? pts[0].r : !BUDGET&&sh._valuePlan?.brush?.sizeMm?sh._valuePlan.brush.sizeMm/(2*(num('sheetmm', DEFAULT_SHEET_MM)/W2)):sh._semantic?sh._semantic.pass.brush.widthMm/(2*(num('sheetmm', DEFAULT_SHEET_MM)/W2)):Math.max(SC, Math.max(...pts.map(p => p.r)));
      const wet = createBrush({ flat: sh._semantic?sh._semantic.pass.brush.kind==='flat':true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, depositDepth: shapePaper?.saturationMax >= 0.5 ? 0.1 : 0, splay: 0.03, stiffness: 8, seed: 900 + ctx.laid + SEED, ...(sh._semantic?semanticBrushOptions(sh._semantic.pass,num('sheetmm', DEFAULT_SHEET_MM)/W2):{}) });
      productionDip(wet, { water: num('prewetwater', shapeCells ? .55 : 1), conc: PIGS.map(() => 0) });
      stroke(wet, ctx.sheet, pts, { upright: UPRIGHT });
    };
    // a passage wetted along its own lanes is wetted lane by lane just ahead of the brush, as its scrap swatch is (prewet-order.mjs)
    if (needPrewet && wetsLaneByLane({ intoWet: Boolean(T.intoWet), wetsOwnLanes: wetOver === paths, preparesOwnBed: ownBed })) wetEachLane = wetLane;
    else if (needPrewet) for (const pts of wetOver) { ctx.WET_TRACE?.lane(); wetLane(pts); }
  }
  // how many of this graded wash's sweeps lie over each cell, so each is charged for its share (sweepCount)
  const useGradedCal = Boolean(sh.graded || sh._valuePlan);
  const coverStarted = performance.now(), SHARE = num('gradedshare', 0.6), UNDER = useGradedCal && !detail && SHARE > 0 ? sweepCount(paths, W2, H2) : null;
  SPEED_PROFILE?.add('painting:sweep-count', performance.now() - coverStarted);
  let cachedCover;
  const passageCover = () => {
    if(cachedCover!==undefined)return cachedCover;
    const started = performance.now();
    const result = sweepCover(paths, up(MASK), W2, H2, SPEED_COVERAGE ? { counts: UNDER, cells: sh.area * SC * SC, box: {x0:MB.x0*SC,y0:MB.y0*SC,x1:Math.min(W2-1,(MB.x1+1)*SC-1),y1:Math.min(H2-1,(MB.y1+1)*SC-1)} } : undefined);
    SPEED_PROFILE?.add('painting:sweep-cover', performance.now() - started);
    return cachedCover=result;
  };
  for (let pts of paths) {
    ctx.WET_TRACE?.lane();
    if (wetEachLane) wetEachLane(pts);
    if(sh._semantic&&!authoredPaths)pts=pts.map(p=>({...p,r:sh._semantic.pass.brush.widthMm/(2*(num('sheetmm', DEFAULT_SHEET_MM)/W2))}));
    const r = vectorPaths ? pts[0].r : !BUDGET&&sh._valuePlan?.brush?.sizeMm?sh._valuePlan.brush.sizeMm/(2*(num('sheetmm', DEFAULT_SHEET_MM)/W2)):sh._semantic?sh._semantic.pass.brush.widthMm/(2*(num('sheetmm', DEFAULT_SHEET_MM)/W2)):(r0 => (PB && FLOOR ? PB.half(PB.pick(r0)) : r0))(Math.max(SC, Math.max(...pts.map(p => p.r))));
    let CHARGE_CAL=SEMANTIC_CAL_MODE==='actual'&&sh._semantic?semanticCalibrationGain(SEMANTIC_CAL[sh._semantic.key],pts,PB.mmPerCell):ICAL.cal;
    const numericTuftHere=numericTuftEligible({shapeId:ctx.MAJOR_TECHNIQUE?.shapeId,selected:NUMERIC_TUFT_SHAPES,detail,dry:T.name.startsWith('dry brush'),semantic:Boolean(sh._semantic),radiusMm:r*num('sheetmm', DEFAULT_SHEET_MM)/W2});
    const brush = detail
      ? createBrush({ grainShift: num('grainshift', 0), radius: r, bristles: Math.max(8, Math.ceil(r * 3)), capacity: 26, belly: 2, feed: 0.08,
          give: 0.7, free: 0.4, film: 0.22, splay: 0.06, stiffness: 5, wetMix: T.intoWet ? 0.6 : 0.15 * num('drymix', 1),
          bridge: washBridge(T, Math.min(T.bridge, 0.55)), bridgeSoft: 1.2, streak: 0.5, seed: 31 + ctx.laid + SEED })
      : createBrush({ grainShift: num('grainshift', 0),
          flat: pts[0]?.round!=null?!pts[0].round:sh._valuePlan?.brush?.shape?sh._valuePlan.brush.shape==='flat':numericTuftHere?false:(sh._semantic?sh._semantic.pass.brush.kind==='flat':true), ...(numericTuftHere?{model:'tuft'}:{}), radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4,
          // --washfree f: the wash brush's free-liquid threshold, also on the scrap; lower lets a light load still give water. Default 0.4.
          give: 0.9, free: num('washfree', 0.4), film: 0.25, splay: WASH_FLAT_SPLAY, stiffness: 8, wetMix: MIX(T),
          // --washbridgesoft k: the wash's liquid stops over a wider band of tooth (bridgeSoft x k), grading deep pits in. Default 1.
          bridge: washBridge(T, T.bridge * num('washbridgek', 1)), bridgeSoft: T.bridgeSoft * num('washbridgesoft', 1), seed: 31 + ctx.laid + SEED,
          // --washstreak s: hair-clump streaking along a stroke (default 0.35); --washbreakup b: how fast an emptying film breaks (1.5).
          // --washbridgek k: how far the wash's liquid reaches into the tooth; below 1 the paper sparkles through. Default 1.
          ...(sh._semantic?semanticBrushOptions(sh._semantic.pass,num('sheetmm', DEFAULT_SHEET_MM)/W2):{}),
          ...(opt('washstreak', '') !== '' ? { streak: num('washstreak', 0.35) } : {}),
          ...(opt('washbreakup', '') !== '' ? { breakup: num('washbreakup', 1.5) } : {}),
        });
    // The first value goes on light (--opening, default 0.55) and is booked so. A graded wash carries all its values and is not lightened.
    const opening = (layer.value <= 1 && !(sh.graded && !sh._follow) ? (sh._opening ?? num('opening', 0.55)) : 1) * (sh._tint ?? 1);
    const PF = PATH_FACTOR.get(pts) ?? 1; // --strokeplan: this stroke's planned charge factor
    // A passage laid in overlapping lanes is charged for the overlap, once per passage: see sweepCover. Detail marks
    // leave paper between them on purpose and are not divided. --cover 0|1, default 0, except for a wash plan's strokes
    // (fair-wash.mjs): its rounds ring the outline and its lanes overlap by a third, so about 1.7 sweeps lie over a cell
    // and, charged for one, the sheet held 1.6 of the planned pigment.
    if (sh._cover == null) sh._cover = detail || opt('cover', vectorPaths ? '1' : '0') === '0' ? 1 : Math.pow(Math.max(1, passageCover()), num('coverpow', 1));
    // --undercover 0|1: raise the charge by area over brush footprint, floored at --underfloor (default 0.4), so the planned mass arrives. Default 1.
    if (sh._under == null) sh._under = detail || opt('undercover', '1') === '0' ? 1 : 1 / Math.max(num('underfloor', 0.4), Math.min(1, passageCover()));
    sh.laidShare = opening;
    // see GRADED_CAL: the whole scrap's delivery, less what runs past this passage's own open edge (in sheet cells)
    if (useGradedCal && sh._gcal == null) {
      const G = ICAL.graded;
      sh._open = openEdgeShare(MASK, w, h, MB) / SC;
      const lost = G ? Math.min(0.6, G.escape * sh._open / Math.max(1e-6, G.edge)) : 0;
      sh._gcal = G ? 1 / Math.max(0.02, G.all * (1 - lost)) : CHARGE_CAL;
    }
    // --trace: one line per passage, to see where a shape's paint goes
    if (opt('trace', '0') !== '0') { let area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0; for (let i = 0; i < n; i++) if (MASK[i]) { area++; const x = i % w, y = (i / w) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } console.log(`trace pass ${L + 1} value ${layer.value} pig ${layer.pigment} ${T.name} area ${area} box ${x0},${y0}-${x1},${y1} amount ${sh.amount.toFixed(3)} paths ${paths.length} cover ${sweepCover(paths, up(MASK), W2, H2).toFixed(2)} fb ${(sh._fb ?? 1).toFixed(2)} under ${sh._under.toFixed(2)}${useGradedCal ? ` graded over ${sh.merged + 1} values, angle ${gradedAngle == null ? '-' : (gradedAngle * 180 / Math.PI).toFixed(0)}, open edge ${sh._open.toFixed(3)}, charged ${sh._gcal.toFixed(2)}x` : ''}`); }
    if(COLOUR_TRACE && pts===paths[0] && traceCells.some(i=>MASK[i])) colourTrace.push({stage:'charge',pass:L+1,pigment:layer.pigment,value:layer.value,amount:sh.amount,mix:sh.mix,opening,feedback:sh._fb??1,calibration:CHARGE_CAL,under:sh._under,cover:sh._cover,paths:paths.length,technique:T.name});
    // A sweep lands, bears down through its body and lifts; the paper shows where the touch is lightest.
    const total = pts.reduce((a, p, i) => a + (i ? Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0) || 1;
    let run = 0;
    let shaped = pts.map((p, i) => {
      if (i) run += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
      const u = run / total;
      const land = Math.min(1, u / num('land', 0.06)), lift = Math.min(1, (1 - u) / num('lift', 0.10));
      const body = 0.72 + 0.28 * Math.sin(Math.PI * u);          // heaviest through the middle of the sweep
      const ramp = PATH_RAMP.get(pts);
      const rampMod = ramp && PF > 1e-6 ? ((1 - u) * ramp.start + u * ramp.end) / PF : 1;
      return { ...p, p: Math.max(0.18, Math.min(1.2, body * Math.min(land, lift) * rampMod)) };
    });
    if(authoredPaths||shapedPaths)shaped=pts;else if(sh._semantic)shaped=semanticGesture(sh._semantic.pass,shaped,num('sheetmm', DEFAULT_SHEET_MM)/W2);
    const planeRamp = PATH_RAMP.get(pts);
    if(planeRamp && shapedPaths && planeRampApplies({strokePlan:sh._strokePlan,pathCount:paths.length})) {
      let rrun = 0;
      const denom = sh._strokePlan && PF > 1e-6 ? PF : 1;
      shaped = shaped.map((p, i) => {
        if (i) rrun += Math.hypot(p.x - shaped[i - 1].x, p.y - shaped[i - 1].y);
        const u = rrun / total;
        const rampMod = ((1 - u) * planeRamp.start + u * planeRamp.end) / denom;
        const curP = p.p ?? 1;
        return { ...p, p: Math.max(0.18, Math.min(1.2, curP * rampMod)) };
      });
    }
    const supportedCharge=gesturePoints=>!ctx.AREA_NUMERIC_CONTACT_STOP&&(!ctx.AREA_NUMERIC_SEQUENCE||productionChargeSupported({predict:()=>candidateContact(brush,ctx.sheet,gesturePoints,{upright:sh._semantic.pass.brush.orientation==='sweep'?'sweep':sh._semantic.pass.brush.orientation==='follow'?false:true,neighborRadius:0}),record:event=>JSONL.append(path.join(out,'semantic-commands.jsonl'),JSON.stringify({kind:event.status==='not-executed'?'production-numeric-contact-omitted':'production-numeric-contact-support',areaId:sh._semantic.area.id,passId:sh._semantic.key,shapeKey:ctx.AREA_NUMERIC_SEQUENCE.shapeKey,geometry:gesturePoints,clipApplied:!!ctx.sheet.clip,...event})+'\n')}));
    const reserveFeasibility=!!ctx.AREA_NUMERIC_SEQUENCE&&!ctx.AREA_NUMERIC_SEQUENCE.declared;
    if(!reserveFeasibility&&!supportedCharge(shaped))continue;
    const numericTuftLoads=numericTuftHere&&PB?splitLoads(shaped,PB.loadCells(PB.pick(r),T.name)):null;
    if(numericTuftHere){
      const key=JSON.stringify({shapeId:ctx.MAJOR_TECHNIQUE.shapeId,r,water:WET(T),passes:T.passes,wetMix:MIX(T)});
      if(!NUMERIC_TUFT_CAL.has(key)){
        const profile=Object.fromEntries(['radius','capacity','give','feed','wetness','flat','belly','free','film','breakup','bridge','bridgeSoft','bridgeStreak','fine','streak','streakLength','coarse','splay','stiffness','wetMix','model','lag','loadWater','depositDepth'].map(k=>[k,brush[k]]));Object.assign(profile,{bristles:brush.hairs.length,seed:31+ctx.laid+SEED,grainShift:num('grainshift',0)});
        const refs=numericTuftLoads??[shaped],length=pts=>pts.reduce((v,p,i)=>v+(i?Math.hypot(p.x-pts[i-1].x,p.y-pts[i-1].y):0),0),reference=refs.reduce((a,b)=>length(a)>length(b)?a:b);
        const proof=calibrateNumericTuft({profile,points:reference,water:WET(T),passes:T.passes,paperOptions:PAPER_OPTS,mmPerCell:num('sheetmm', DEFAULT_SHEET_MM)/W2,pigments:PIGS,physics:O,upright:UPRIGHT,strength:num('strength',2.2),flowEvery:flowEvery(paths.length)});NUMERIC_TUFT_CAL.set(key,proof);JSONL.append(path.join(out,'numeric-tuft-calibration.jsonl'),JSON.stringify({shapeId:ctx.MAJOR_TECHNIQUE.shapeId,...proof})+'\n');
      }
      CHARGE_CAL=NUMERIC_TUFT_CAL.get(key).gain;JSONL.append(path.join(out,'numeric-tuft-consumed.jsonl'),JSON.stringify({shapeId:ctx.MAJOR_TECHNIQUE.shapeId,radius:r,calibration:CHARGE_CAL,water:WET(T),passes:T.passes,originalGeometry:true,profile:semanticBrushObservation(brush)})+'\n');
    }

    const initialLoad={ water: detail ? Math.min(T.water, num('detailwater', 0.3)) : WET(T), conc: sh.mix.map((v, j) => v * DCAL(sh, j) * TCAL(sh, T, detail, layer.value) * num('strength', 2.2) * CHARGE_CAL * opening * PF / sh._cover * sh._under * (sh._fb ?? 1) * (detail ? num('detailstrength', 2.0) : 1)) };
    if(!reserveFeasibility)productionDip(brush,initialLoad);
    const cadence=nativeBodyCadence({mode:NATIVE_PAINT_MODE.mode,enabled:Boolean(FAST_BODY_ENABLED),detail,instructionBound:!!sh._semantic,technique:T.name,radiusCells:r,mmPerCell:num('sheetmm', DEFAULT_SHEET_MM)/W2,every:flowEvery(paths.length),spacing:FAST_BODY_SPACING});
    if(cadence.approximated)BODY_CADENCE_RECORD.sourceSweepsSelected++;
    const every=cadence.every;
    const numericalStroke=(b,target,points,options)=>{
      BODY_CADENCE_RECORD.numericalCallsAttempted++;
      if(cadence.approximated)BODY_CADENCE_RECORD.approximatedCallsAttempted++;
      const result=stroke(b,target,points,{...options,spacing:cadence.spacing});
      ctx.DESIGNED_EXECUTION ??= { laneStrokes: 0, brushChoiceStrokes: 0 };
      if (sh._strokePlan) ctx.DESIGNED_EXECUTION.laneStrokes++;
      if (sh._valuePlan?.brush?.sizeMm) ctx.DESIGNED_EXECUTION.brushChoiceStrokes++;
      if((DELIVERY||TECH_CAL)&&target===ctx.sheet&&points.length)sh._paintExecuted=true;
      if(cadence.approximated)BODY_CADENCE_RECORD.approximatedCallsReturned++;
      return result;
    };
    let executedCharges=0,omittedCharges=0;
    const runCharge=(points,load,options,execute,{alreadyLoaded=false}={})=>{
      if(ctx.AREA_NUMERIC_CONTACT_STOP)return;
      if(reserveFeasibility){
        const actualOptions={...options,spacing:cadence.spacing,upright:sh._semantic.pass.brush.orientation==='follow'?false:sh._semantic.pass.brush.orientation==='sweep'?'sweep':true};
        const ready=semanticChargeFeasible({brush,sheet:ctx.sheet,points,options:actualOptions,load:dipLoad(brush,load),predict:candidateContact,
          reserved:i=>!!ctx.AREA_PLAN.reserves[Math.floor(i/W2/SC)*w+Math.floor(i%W2/SC)],
          record:event=>JSONL.append(path.join(out,'semantic-commands.jsonl'),JSON.stringify({kind:'semantic-numeric-charge-feasibility',areaId:sh._semantic.area.id,passId:sh._semantic.key,shapeKey:ctx.AREA_NUMERIC_SEQUENCE.shapeKey,...event})+'\n')});
        if(!ready){omittedCharges++;sh._numericOmissions=(sh._numericOmissions??0)+1;return;}
      }else if(!supportedCharge(points))return;
      if(reserveFeasibility||!alreadyLoaded)productionDip(brush,load);
      execute(options);executedCharges++;
    };
    // --graded c: recharge every c cells along a sweep at the strength the passage wants there, normalised to a mean of one. Default 0.
    // A graded wash (--gradedwash) is always charged this way from its own graded amount, not normalised per sweep.
    const gradedLen = BUDGET || authoredPaths || (PB && !detail) ? 0 : (useGradedCal ? (GFLOOR ? GCHUNK / SC : num('gradedchunk', 6)) : num('graded', 0)) * SC;
    // --physical: the path is cut where the brush's released water runs out (brushes.mjs splitLoads), counted only over
    // paper the brush may paint (inside the clip, off any resist; the stroke's own footprint rule), and each load is a
    // stroke of its own, dipped afresh; a graded wash is graded by the puddle's dilution between loads (the mean of its
    // graded amount under each load), not by recharging every few cells
    const LOADS = !authoredPaths && !BUDGET && PB && !detail ? (num('loadfeather',0)>0&&shapedPaths?(a,b,c)=>splitLoadsFeathered(a,b,num('loadfeather',0)*r,c):splitLoads)(shaped, (sh._semantic?semanticLoadCells(sh._semantic.pass,PB.cfg.uptake_ml_per_cm2,PB.mmPerCell):PB.loadCells(sh._valuePlan?.brush?.name??PB.pick(r), T.name)), paintsHere(ctx.sheet)) : null;
    if (LOADS && (LOADS.length > 1 || useGradedCal)) {
      // One amount per shape, graded by the plan's plane (graded-demand.mjs): each load is dipped at the plane's mean
      // under it and pressed along it, never charged per-cell amounts. A passage without a plane takes its amount throughout.
      const PLANE = sh._plane ?? null, lo = 0, hi = 8;
      const readField=i=>PLANE?sh.amount*planeAtCell(PLANE,i,w):sh.amount;
      // --followfootprint 1: load from the brush's whole footprint inside the shape, not its center, so narrow shapes are not pale. Default 0.
      const footprint = sh._follow && num('followfootprint', 0) > 0;
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
      const f = LOADS.map(ch => { if (!PLANE) return 1; let a = 0; for (const q of ch) a += readLoad(q); return Math.max(lo, Math.min(hi, a / ch.length / Math.max(1e-4, sh.amount))); });
      // along one load the hand presses toward the plane's darker end, so load factor times pressure follows the plane
      const GRADED = PLANE ? LOADS.map((ch, k) => gradeLoadPressure(ch, PLANE, f[k], SC)) : LOADS;
      if (PLANE) used['graded load'] = (used['graded load'] || 0) + LOADS.length;
      const loadScale = (v, j) => v * DCAL(sh, j) * TCAL(sh, T, detail, layer.value) * num('strength', 2.2) * (useGradedCal ? sh._gcal : CHARGE_CAL) * opening * PF / sh._cover * sh._under * (sh._fb ?? 1);
      const base = sh.mix.map(loadScale);
      // an area plan's variegated wash (area-washes.mjs): each load is dipped at the mix where it lies along the wash
      const second = sh._variegate ? sh._variegate.mix.map(loadScale) : null, loadBase = k => second ? variegatedCharge(base, second, sh._variegate.span, LOADS[k], SC) : base;
      if (second) used['variegated load'] = (used['variegated load'] || 0) + LOADS.length;

      let st = 0;
      clock('strokes', () => { for (let pass = 0; pass < T.passes; pass++) LOADS.forEach((ch, k) => { runCharge(GRADED[k], { water: WET(T), conc: loadBase(k).map(v => v * f[k]) }, { upright: UPRIGHT, flowEvery: every, gpuBetween: true, lift: k === LOADS.length - 1, between: () => { if (++st % every === 0) clock('flow', () => step(ctx.sheet, O)); } },o=>numericalStroke(brush, ctx.sheet, GRADED[k], o)); }); });
    } else if (gradedLen > 0 && !detail && (useGradedCal ? shaped.length > 1 : shaped.length > gradedLen * 2)) {
      const chunks = [];
      for (let k = 0; k < shaped.length; k += Math.max(2, Math.round(gradedLen))) chunks.push(shaped.slice(Math.max(0, k - 1), k + Math.round(gradedLen) + 1));
      // One amount per shape: the chunks carry the passage's amount, not a per-cell field.
      const f = chunks.map(() => 1), mean = 1;
      const base = sh.mix.map((v, j) => v * DCAL(sh, j) * TCAL(sh, T, detail, layer.value) * num('strength', 2.2) * (useGradedCal ? sh._gcal : CHARGE_CAL) * opening * PF / sh._cover * sh._under * (sh._fb ?? 1));
      // The water moves on the sweep's clock, counted across its chunks, so the sheet flows while a chunked sweep is laid.
      let st = 0;
      clock('strokes', () => { for (let pass = 0; pass < T.passes; pass++) chunks.forEach((ch, k) => { runCharge(ch, { water: WET(T), conc: base.map(v => v * f[k] / mean) }, { upright: UPRIGHT, flowEvery: every, gpuBetween: true, lift: !GFLOOR || k === chunks.length - 1, between: () => { if (++st % every === 0) clock('flow', () => step(ctx.sheet, O)); } },o=>numericalStroke(brush, ctx.sheet, ch, o)); }); });
    } else
    clock('strokes', () => { for (let pass = 0; pass < T.passes; pass++) runCharge(shaped, initialLoad, { upright: UPRIGHT, flowEvery: every, gpuBetween: true, between: s => { if (s % every === 0) clock('flow', () => step(ctx.sheet, O)); } },o=>numericalStroke(brush, ctx.sheet, shaped, o),{alreadyLoaded:true}); });
    if(ctx.AREA_NUMERIC_CONTACT_STOP){
      const {pixels,...contactRecord}=ctx.AREA_NUMERIC_CONTACT_STOP;
      await sharp(pixels,{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'numeric-first-contact-immediate.png'));
      dry(ctx.sheet,30000,O,{levelMax:140,dt:2});
      await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'numeric-first-contact-ordinary-dried.png'));
      fs.writeFileSync(path.join(out,'numeric-first-contact-checkpoint.json'),JSON.stringify({...contactRecord,kind:'one actual numeric pigment command then recorded ordinary dry; NOT completed area/pass',ordinaryDryCommandId:AREA_EXEC.records.at(-1)?.id,paper:measurePaper(ctx.sheet,contactRecord.primaryCells),backend:GPU_INFO,remainingNumericAndModulation:'NOT EXECUTED'},null,2));
      await drainFrames();if(ctx.FRAMER)ctx.FRAMER.close();ctx.sheet._gpu?.close();console.log('numeric first actual contact checkpoint; not completed pass or artistic acceptance');process.exit(0);
    }
    if(reserveFeasibility&&!executedCharges)continue;
    ctx.laid++;
    // --filmby paint: a frame each time the planned mass laid crosses the next equal share of the plan's; each sweep
    // of the passage is booked an equal part of the passage's mass
    if (FILM_BY_PAINT) {
      // Authored passes have no numerical-mask mass budget. Count actual completed
      // gestures for playback; zero fitted mass must never create an infinite loop.
      const filmTotal = AUTHORED_INPUT ? ctx.AREA_COMPILED.diagnostics.authoredPaintGestures : ctx.plannedMass;
      ctx.filmLaid += omittedCharges?0:AUTHORED_INPUT ? 1 : (FILM_MASS.get(sh) ?? 0) / Math.max(1, paths.length);
      if (filmTotal > 0 && ctx.filmLaid >= filmTotal * ctx.filmNext / FILM_FRAMES) {
        while (ctx.filmNext <= FILM_FRAMES && ctx.filmLaid >= filmTotal * ctx.filmNext / FILM_FRAMES) ctx.filmNext++;
        ctx.STAGE = { stage: 'paint', step: `value ${layer.value} of ${ctx.steps}`, pass: L + 1, of: ctx.layers.length, value: layer.value, of_values: ctx.steps, pigment: layer.mixIndex ?? layer.pigment, laying: true };
        await shoot();
      }
    }
    // --order painter: a broad light passage (the ground's regions, the subject's first wash) is filmed as it goes on,
    // --ordersplit frames across its sweeps, so a first wash of one pale passage is not one frame. Only the film moves.
    if (FILM_BY_PAINT && layer._order && (layer._order.phase === 'ground' || layer._order.phase === 'subject') && sh.area >= num('ordersplitmin', 0.03) * n) {
      const q = (sh._swept = (sh._swept ?? 0) + 1), k = Math.max(1, Math.ceil(paths.length / Math.max(1, num('ordersplit', 4))));
      if (q % k === 0 && q < paths.length) { ctx.STAGE = { stage: 'paint', step: `value ${layer.value} of ${ctx.steps}`, pass: L + 1, of: ctx.layers.length, value: layer.value, of_values: ctx.steps, pigment: layer.mixIndex ?? layer.pigment, order: layer._order.phase, laying: true }; await shoot(); }
    }
    // --wetframes: a filmed pass is also caught while its passages go down, a quarter at a time
    if (WETFRAMES > 0 && L % WETFRAMES === 0 && ++shIdx % shQuarter === 0) snap({ stage: 'wash', pass: L + 1, of: ctx.layers.length, value: layer.value, wet: 'laying' });
    // --passframes: a frame every N passages, so playback shows strokes going on, not whole pigment layers at once.
    else if (PASSFRAMES > 0 && ++shIdx % PASSFRAMES === 0) snap({ stage: 'wash', pass: L + 1, of: ctx.layers.length, value: layer.value, laying: true });
  }
  if(ctx.FINISH_PLAN&&L===ctx.FINISH_START){await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'finishing-glaze-deposition-immediate.png'));coherent(ctx.sheet);const after=thicknessTotals(ctx.sheet),commands=AREA_EXEC.records.filter(r=>r.operation==='physical brush stroke'&&r.status==='executed'),command=commands.at(-1);fs.writeFileSync(path.join(out,'finishing-dose-proof.json'),JSON.stringify({kind:'actual all-sheet pigment inventory delta over one finishing pass; per-contact brush loss separately logged',areaId:command?.areaId,passId:command?.passId,commandId:command?.id,commandIds:commands.map(r=>r.id),gestureIds:commands.map(r=>r.geometry?.[0]?.gestureId??null),paperBeforeByContact:commands.map(r=>r.paper),primaryCellsByContact:commands.map(r=>r.primaryCells?.length??0),primaryCells:command?.primaryCells?.length,requestedDepth:sh.amount,requestedMass:sh.amount*commands.reduce((s,r)=>s+(r.primaryCells?.length??0),0),beforePigmentMass:ctx.FINISH_MASS_BEFORE,afterPigmentMass:after,depositedPigmentMass:after.map((v,j)=>v-ctx.FINISH_MASS_BEFORE[j]),paperBefore:command?.paper,limit:'all-sheet conserved pigment delta, not percell depth/value/coverage proof; ordinary transport remains active'},null,2));}
  if (SOFT_RING) clock('flow', () => { for (let q = 0; q < num('softwetsteps', 60); q++) step(ctx.sheet, O); });
  if (crispHere || FLOOR || layer._darkPass || touchSmall) setClip(ctx.sheet, PROBE ? PROBE.clip : null);
  // Soft-classified boundary cells (light-to-dark.mjs: low contrast, low colour edge) take the area route's soft edge: a clean
  // damp brush run along them right after the wash while it is wet (soften-lift-run.mjs softenEdge). The brush is the largest
  // round of the kit that fits inside the shape and is no wider than the passage's own brush (--softmm caps its width), so a
  // shape narrower than the finest round keeps its dry edge. A soft cell within one brush of a hard cell of the passage or
  // of a reserved light is left as cut. --softsplit 0 and a plan's soften:false turn it off.
  // A wash plan's soft boundary (thing-washes.mjs: where a graded polygon's halves meet) is made with the brush: a
  // clean damp round, the smallest wash brush, run along that part of the outline while the wash is wet.
  if (vectorPaths && paths.length && sh._valuePlan.softEdges?.length) {
    const rS = Math.max(SC, sh._valuePlan.strokes.reduce((a, st) => Math.min(a, st.radiusMm), Infinity) * CELLS_PER_MM);
    for (const line of sh._valuePlan.softEdges) {
      const b = createBrush({ flat: false, radius: rS, bristles: Math.max(12, Math.ceil(rS * 2)), capacity: 100, belly: 12, feed: .4, give: .9, free: .4, film: .25, stiffness: 8, seed: SEED + ctx.laid });
      dip(b, { water: 1, conc: SHEET_PIGS.map(() => 0) }); thirsty(b, { water: SOFTEN_WATER });
      stroke(b, ctx.sheet, line.map(q => ({ x: q[0] * CELLS_PER_MM, y: q[1] * CELLS_PER_MM, r: rS, p: 1 })), { upright: UPRIGHT });
    }
    used['soft edge, damp brush'] = (used['soft edge, damp brush'] || 0) + sh._valuePlan.softEdges.length;
  }
  if(num('softsplit',1)>0&&PB&&!BUDGET&&!detail&&!sh._valuePlan?.texture&&sh._valuePlan?.edges?.softCells?.length&&paths.length){
    const mmc=num('sheetmm', DEFAULT_SHEET_MM)/W2,halves=(ctx._softRounds??=['rigger','round4','round8','round12'].filter(k=>PB.cfg.brushes[k]).map(k=>PB.half(k)));
    const washR=sh._valuePlan.brush?.sizeMm?sh._valuePlan.brush.sizeMm/(2*mmc):Math.max(SC,...paths.map(pts=>Math.max(...pts.map(q=>q.r))));
    const rS=softenBrushCells(halves,{ownCells:washR,supportCells:(sh._valuePlan.resolution?.estimatedSupportWidthCells??Infinity)*SC,cap:num('softmm',Infinity)/(2*mmc)}),reach=Math.ceil(rS/SC)+1;
    const reserve=ctx.VALUE_PLAN?.protectedCells,near=reserve&&rS>0?((ctx._softReserve??=new Map()).get(reach)??(ctx._softReserve.set(reach,growReserve(reserve,w,h,reach)),ctx._softReserve.get(reach))):null;
    const where=rS>0?softenWhere({softCells:sh._valuePlan.edges.softCells,hardCells:sh._valuePlan.edges.hardCells,nearReserve:near,w,h,reach}):null;
    const strokes=where?softenEdge({mask:up(brushMask(sh)),where:up(where),W:W2,H:H2,r:rS,upright:UPRIGHT,stroke:(b,path,o)=>stroke(b,ctx.sheet,path,o),damp:()=>{const b=createBrush({flat:false,radius:rS,bristles:Math.max(12,Math.ceil(rS*2)),capacity:100,belly:12,feed:.4,give:.9,free:.4,film:.25,stiffness:8,seed:SEED+ctx.laid});dip(b,{water:1,conc:SHEET_PIGS.map(()=>0)});return thirsty(b,{water:SOFTEN_WATER});}}):0;
    if(strokes)used['soft edge, damp brush']=(used['soft edge, damp brush']||0)+strokes;
    JSONL.append(path.join(out,'value-commands.jsonl'),JSON.stringify({kind:'selected-edge-softening',intent:sh._valuePlan.id,softCells:sh._valuePlan.edges.softCells.length,softened:where?where.reduce((a,v)=>a+v,0):0,strokes,radiusMm:rS*mmc,operation:'actual clean damp physical brush along soft-classified boundary cells; hard cells and reserved lights keep the cut; no optical blur'})+'\n');
  }
  // --firstwash: the opening wash's edge taken out into clear water while it is wet
  if (FW && sh._fwSoften && !detail && paths.length && num('fwsoften', 0.6) > 0 && sh.area >= num('fwsoftmin', 0.002) * n) {
    let inSubject = 0; if (FW_SUBJ) { let a = 0; for (let i = 0; i < n; i++) if (MASK[i]) { a++; inSubject += FW_SUBJ[i]; } inSubject = inSubject * 2 > a ? 1 : 0; }
    clock('flow', () => softenFirstWash({ sheet: ctx.sheet, mask2: up(MASK), W2, H2, SC, light: highlights, subject: FW_SUBJ, inSubject, w, softArcs, soften, O, share: num('fwsoften', 0.6), radius: num('fwsoftr', 0.012) * Math.min(W2, H2), seed: 17 + ctx.laid + SEED }));
  }
  // --trace: also what the passage put on the sheet of its pigment against its booking.
  if (opt('trace', '0') !== '0' && TRACE_MASS != null) {
    const now = thicknessTotals(ctx.sheet).reduce((a, v, j) => a + v - TRACE_MASS[j], 0), mixed = sh.mix.reduce((a, v) => a + v, 0);
    let booked = 0; for (let i = 0; i < n; i++) if (MASK[i] && !(sh._skip && sh._skip[i])) booked += mixed * (sh.laidShare ?? 1);
    console.log(`trace pass ${L + 1} laid ${(now / Math.max(1e-6, booked * SC * SC)).toFixed(2)} of its booked mass${sh.graded ? ' (graded)' : ''}`);
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
        ? furMarks(tex, FUR_FIELD(), w, h, { length: Math.max(5, Math.round(num('furlen', 0.035) * side)), spacing: Math.max(2, Math.round(num('furgap', 0.006) * side)), seed: 400 + ctx.laid + SEED, coverage: num('furcover', 0.35), minWant: meanHP * 0.8 })
        : detailMarks(tex, w, h, { length: Math.max(4, Math.round(num('texlen', 0.02) * side)), spacing: Math.max(2, Math.round(num('texgap', 0.008) * side)), seed: 400 + ctx.laid + SEED, coverage: num('texcover', 0.45), minWant: meanHP * 0.8 });
      vals.sort((a, b) => b - a); const peak = Math.max(1e-4, vals[Math.min(vals.length - 1, Math.max(0, cnt / 20 | 0))] ?? 1e-4);
      const colour = sh.mix.map(v => v / Math.max(1e-4, sh.amount));
      for (const m of marks) {
        const pts = m.map(q => ({ x: (q.x + 0.5) * SC, y: (q.y + 0.5) * SC, r: num('texr', 1.1) * SC, p: q.p != null ? q.p * Math.min(1, 0.5 + q.want / peak) : Math.min(1, 0.3 + q.want / peak) }));
        const dryb = createBrush({ radius: num('texr', 1.1) * SC, bristles: 10, capacity: 20, belly: 2, feed: 0.06, give: 0.6, free: 0.3, film: 0.2, splay: 0.08, stiffness: 5, wetMix: 0, bridge: 0.38, bridgeSoft: 1.0, streak: 0.6, seed: 700 + ctx.laid + SEED });
        const tone = m.reduce((a, q) => a + q.want, 0) / m.length;
        dip(dryb, { water: 0.22, conc: colour.map(c => c * tone * num('strength', 2.2) * (CAL['dry brush'] ?? 1) * num('texstrength', 1.3)) });
        // the dry brush faces along its mark too (--texheading sheet keeps it facing down the sheet)
        clock('strokes', () => stroke(dryb, ctx.sheet, pts, { upright: opt('texheading', 'sweep') === 'sheet' ? true : UPRIGHT }));
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
  ctx.WET_TRACE?.boundary('end', { pass: L + 1, value: layer.value });
  ctx.RECEIVER_OBSERVER?.beforeDry(L+1,ctx.sheet);
  if(MAJOR_INTENT&&opt('majorstop','')==='pass:'+(L+1))await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'major-pass-'+(L+1)+'-immediate.png'));
  if(MAJOR_INTENT?.baseWash&&L===0)await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'major-firstwash-immediate.png'));

  // a painter dries between values, not between every shape of one value
  const endOfValue = L === ctx.layers.length - 1 || ctx.layers[L + 1].value !== layer.value;
  // --washsession 2: the next pass is the same band of the same region in another pigment; it is charged into this
  // wash while it is wet, so the passage dries once.
  const sessionNext = WASH_SESSION > 1 && L < ctx.layers.length - 1 && sameWash(layer, ctx.layers[L + 1]);
  // A passage that asked to be dried is dried only enough to stop it running; the sheet dries fully at the end of a value.
  // --drypigment 1: dry fully before a pass in a different pigment, so colours do not mix wet on the paper. Default 0.
  // --order painter dries between pans too (--orderdry 0 stops it).
  const nextOther = L < ctx.layers.length - 1 && (ctx.layers[L + 1].mixIndex ?? ctx.layers[L + 1].pigment) !== (layer.mixIndex ?? layer.pigment) && (opt('drypigment', '0') !== '0' || (layer._order && opt('orderdry', '1') !== '0')) && !sessionNext;
  const filmed = WETFRAMES > 0 && L % WETFRAMES === 0, watch = filmed ? { steps: WET_STEPS, onStep: t => { if (WET_STEPS.has(t)) snap({ stage: 'wash', pass: L + 1, of: ctx.layers.length, value: layer.value, wet: t }); } } : {};
  // --drydt: drying step once the surface has levelled (default 14); --drylevel: the level cap (default 140).
  // --wetmix f: a pass its successor overlaps on --wetmixshare (default 0.25) of its area dries only to f of the cap, so colours mix.
  const nextLayer = L < ctx.layers.length - 1 ? ctx.layers[L + 1] : null;
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
  if(earlyBoundary){const before=measurePaperDry(ctx.sheet),capture=!ctx.EARLY_DRY_CAPTURED;if(capture)await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'early-dry-first-boundary-immediate.png'));const requested={levelMax:num('drylevel',140),dt:num('drydt',14),...watch};clock('dry',()=>dry(ctx.sheet,20000,O,requested));const after=measurePaperDry(ctx.sheet);JSONL.append(path.join(out,'early-dry-boundaries.jsonl'),JSON.stringify({pass:L+1,value:layer.value,nextPass:nextLayer?L+2:null,nextValue:nextLayer?.value??null,endOfValue,nextOther,before,after,requested,effective:nativeDryOptions(NATIVE_PAINT_MODE.mode,requested),changedOrder:['completed connected pass','ordinary physical dry','next original pass'],omittedBaselineIdleFlowSteps:num('settle',60),water:'unchanged original',pigment:'original prepared load and demand; delivered mass not inferred',actualDry:after.dry})+'\n');if(capture){await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'early-dry-first-boundary-dried.png'));ctx.EARLY_DRY_CAPTURED=true;}check('early numeric boundary did not establish measured dry paper',after.dry,{waterMax:after.waterMax,saturationMax:after.saturationMax});}
  else if(skyBoundary)JSONL.append(path.join(out,'major-sky-schedule.jsonl'),JSON.stringify(skyBoundary)+'\n');
  // Fast: when an ordinary dry follows at once, its own slow (dt 1) level phase does the settling, held until the measured
  // surface is level; the idle steps before it only repeated that (--fastsettle sets how many remain, default 0)
  else{const dryFollows=NATIVE_PAINT_MODE.mode==='fast'&&!ctx.AREA_PLAN&&(wetInto||endOfValue||nextOther);const settle=dryFollows?Math.min(num('settle',60),num('fastsettle',0)):num('settle',60);clock('flow',()=>{for(let q=0;q<settle;q++)step(ctx.sheet,O);});}
  colourMass('after-flow',{pass:L+1});
  // softening, the plan's soft edges and lifting, while the pass is wet (tools/painter/soften-lift-run.mjs, area-edges.mjs)
  if(ctx.AREA_PLAN&&layer._semantic){const sp=layer._semantic.pass,mmc=num('sheetmm',DEFAULT_SHEET_MM)/W2,softNear=sp.source!=='authored'&&['wet on wet','wet on dry'].includes(sp.move)?passSoftCells(ctx.AREA_PLAN,layer._semantic.area.id,sp,sp.brush.widthMm/2/(num('sheetmm',DEFAULT_SHEET_MM)/w)+1):null;if(sp.soften||sp.lights?.mode==='lift'||softNear||sp.charge){if(ctx.SOFTEN_LIFT?.key!==layer._semantic.key)ctx.SOFTEN_LIFT={key:layer._semantic.key,m:new Uint8Array(w*h),amount:0,cells:0};const m=ctx.SOFTEN_LIFT.m;for(const sh of layer.shapes){let c=0;for(let i=0;i<m.length;i++)if(sh.mask[i]){m[i]=1;c++;}ctx.SOFTEN_LIFT.amount+=(sh.amount??0)*c;ctx.SOFTEN_LIFT.cells+=c;}ctx.SOFTEN_LIFT_AMOUNT=ctx.SOFTEN_LIFT.cells?ctx.SOFTEN_LIFT.amount/ctx.SOFTEN_LIFT.cells:0;if(ctx.layers[L+1]?._semantic?.key!==layer._semantic.key){ctx.SOFTEN_LIFT=null;
   const newBrush=r=>createBrush({flat:sp.brush.kind==='flat',radius:r,bristles:Math.max(12,Math.ceil(r*2)),capacity:100,belly:12,feed:0.4,give:0.9,free:0.4,film:0.25,stiffness:8,seed:41+ctx.laid+SEED,...semanticBrushOptions(sp,mmc)}),lay=(b,path,o)=>stroke(b,ctx.sheet,path,{...o,upright:UPRIGHT});
   // a second colour charged into the wet pass (pass.charge, area-washes.mjs), before its edges are softened
   const charged=sp.charge?chargeWetPass({pass:sp,plan:ctx.AREA_PLAN,mask:up(m),W:W2,H:H2,r:sp.brush.widthMm/(2*mmc),mix:chargeMix(sp,PIGS,ctx.SOFTEN_LIFT_AMOUNT??0,layer._semantic.key),newBrush,dip,stroke:lay,observe:cells=>measurePaper(ctx.sheet,cells,SPEED_PAPER,{uniform:false}),as:p=>AREA_EXEC.set({...layer._semantic,pass:p}),restore:()=>AREA_EXEC.set(layer._semantic),strength:num('strength',2.2)}):null;
   const edgeStrokes=softNear?softenEdge({mask:up(m),where:up(softNear.where),W:W2,H:H2,r:sp.brush.widthMm/(2*mmc),upright:UPRIGHT,stroke:lay,damp:()=>{const b=newBrush(sp.brush.widthMm/(2*mmc));dip(b,{water:1,conc:new Array(PIGS.length).fill(0)});return thirsty(b,{water:SOFTEN_WATER});}}):0;
   const did=softenAndLift({pass:sp,plan:ctx.AREA_PLAN,mask:up(m),W:W2,H:H2,mmPerCell:mmc,K:PIGS.length,dip,thirsty,newBrush,stroke:lay,waitDamp:light=>{const cells=[];for(let i=0;i<light.length;i++)if(light[i])cells.push(i);const observe=()=>measurePaper(ctx.sheet,cells,SPEED_PAPER,{uniform:false});const {paper,wetWaits}=layIntoWetBed({paper:observe(),observe,step:o=>step(ctx.sheet,o),O,info:{lift:layer._semantic.key}});return {wetWaits,moistShare:paper.moistShare,waterTypical:paper.waterP50};}});
   JSONL.append(path.join(out,'semantic-soften-lift.jsonl'),JSON.stringify({area:layer._semantic.key,...(did??{pass:sp.id}),...(softNear?{softEdgeStrokes:edgeStrokes,softEdges:softNear.reasons}:{}),...(charged?{charge:charged}:{})})+'\n');}}}
  // a wet session (pass.session) dries once, after its last pass; an area left wet is remembered for its hard edges
  if(ctx.AREA_PLAN&&layer._semantic){if(!layer._semantic.pass.leaveWetAfter&&!['wet on wet','wet-edge continuation'].includes(layer._semantic.pass.move)&&!semanticSameSession(layer._semantic,ctx.layers[L+1]?._semantic)){clock('dry',()=>dry(ctx.sheet,30000,O,{levelMax:140,dt:2,...watch}));ctx.AREA_WET?.clear();}else (ctx.AREA_WET??=new Set()).add(layer._semantic.area.id);}
  else if (earlyBoundary) { /* Existing ordinary dry completed earlier, before idle flow. */ }
  else if (skyBoundary) { /* Connected original sky passage: no idle wait or interpan dry. */ }
  else if (sessionNext) { /* --washsession 2: one wet session with the next pigment of this wash */ }
  else if (wetInto) clock('dry', () => dry(ctx.sheet, 20000, O, { levelMax: Math.round(num('drylevel', 140) * num('wetmix', 0.35)), dt: num('drydt', 14), ...watch }));
  else if (endOfValue || nextOther) clock('dry', () => dry(ctx.sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14), ...watch }));
  else if (layer.shapes.some(sh => sh.dryAfter)) clock('dry', () => dry(ctx.sheet, 3000, O, { levelMax: 90, dt: 6, ...watch }));
  ctx.WET_TRACE?.boundary('next', { pass: L + 1, value: layer.value }); ctx.WET_TRACE?.passage(null);
  ctx.RECEIVER_OBSERVER?.ordinaryDry(L+1,ctx.sheet,{actualBoundary:!!(earlyBoundary||wetInto||endOfValue||nextOther||layer.shapes.some(sh=>sh.dryAfter)),endOfValue,nextOther,wetInto,earlyBoundary:!!earlyBoundary});
  if (filmed && PREPF){fadePrep();ctx.NATIVE_CAPTURE?.('preparation-fade');}
  if (filmed) await shoot();
  for (const sh of layer.shapes) {
    if (process.env.CHECKBOX && sh.mask && sh._mbox) { let out = 0; const b = sh._mbox; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (sh.mask[y * w + x] && (y < b.y0 || y > b.y1 || x < b.x0 || x > b.x1)) out++; if (out) console.log(`BOXCHECK ${out} mask cells outside the box (booked ${!!sh._booked})`); }
    if(sh._numericOmissions){JSONL.append(path.join(out,'semantic-commands.jsonl'),JSON.stringify({kind:'semantic-numeric-incomplete-demand',areaId:sh._semantic.area.id,passId:sh._semantic.key,omittedCharges:sh._numericOmissions,expectedLedgerCredit:0,plannedShapeDemand:sh.amount*sh.area,reason:'partial or wholly omitted numerical shape; full-mask delivery unproven'})+'\n');continue;}
    if(sh._authoredDose){JSONL.append(path.join(out,'semantic-commands.jsonl'),JSON.stringify({kind:'semantic-authored-demand',areaId:sh._semantic.area.id,passId:sh._semantic.key,expectedLedgerCredit:0,reason:'explicit dose is not full ownership-mask delivery'})+'\n');continue;}
    if (sh._booked||((DELIVERY||TECH_CAL)&&!sh._paintExecuted)) continue; const m = sh.mask, sk = sh._skip, mb = sh._mbox ?? FULLBOX, P = PIGS.length, share = sh.laidShare ?? 1, amt = Math.max(1e-6, sh.amount), gr = sh.graded, mix = sh.mix;
    for (let y = mb.y0; y <= mb.y1; y++) for (let i = y * w + mb.x0, e = y * w + mb.x1; i <= e; i++) if (m[i] && !(sk && sk[i])) {
      // one amount per shape: the ledger books what the brush was charged, the passage's amount in every cell
      void gr; void amt;
      for (let j = 0; j < P; j++) expected[i * P + j] += mix[j] * share;
      if (DELIVERY) for (let j = 0; j < P; j++) DELIVERY.book(j, mix[j] * share * (sh._fb ?? 1) * DCAL(sh, j));
      if (TECH_CAL && sh._tkey) for (let j = 0; j < P; j++) TECH_CAL.book(sh._tkey, mix[j] * share * (sh._fb ?? 1) * (sh._dcal?.[j] ?? 1) * sh._tcal);
    }
  }
  if(ctx.VALUE_PLAN){const next=ctx.layers[L+1];if(!next||next.value!==layer.value){ctx.VALUE_ACTIVE=null;fs.writeFileSync(path.join(out,'value-executed-counts.json'),JSON.stringify({scope:'all actual value-pass stroke calls and summed observed footprint contact cells; includes clean water and finite reloads',bands:VALUE_COUNTS,total:VALUE_COUNTS.reduce((a,b)=>({strokes:a.strokes+b.strokes,contacts:a.contacts+b.contacts}),{strokes:0,contacts:0})},null,2));const bandRgb=Buffer.from(render());PENDING_IO.push(sharp(bandRgb,{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'value-band-'+layer.value+'-dried.png')));}}
  // Nothing after a pass reads its passages again (the ledger holds what it laid), so its sheet-sized fields are freed.
  for (const sh of layer.shapes) { sh.mask = null; sh.graded = null; sh._prewet = null; sh._brushMask = null; sh.ids = null; }
  layer.mask = null; layer.ids = null;
  const endOfTouch = Boolean(layer._touched && ctx.layers[L + 1]?._touched !== layer._touched);
  // Playback gets a frame at every value-band boundary (the band complete and dried) and at the end of each touch-up
  // round, whatever the frame policy, so lights before darks can be seen band by band.
  const forceStageFrame = (endOfValue || endOfTouch) && !AWARE_DIR && !RESUME_DIR;
  ctx.STAGE = { stage: 'paint', step: `value ${layer.value} of ${ctx.steps}`, pass: L + 1, of: ctx.layers.length, value: layer.value, of_values: ctx.steps, pigment: layer.mixIndex ?? layer.pigment, ...(forceStageFrame ? { force: true, boundary: endOfValue ? 'value' : 'touch' } : {}), ...(layer._order ? { order: layer._order.phase } : {}), techniques: Object.fromEntries(Object.entries(used).filter(([k]) => ['wet on dry', 'wet on wet', 'glazed', 'dry brush', 'detail marks', 'small brush'].includes(k))) };
  const boundaryShot = !FRAME_POLICY.all || forceStageFrame;
  ctx.NATIVE_CAPTURE?.('layer');
  if (boundaryShot) await shoot();
  if (CANARY_STOP === L + 1) await stopAtCanary({ out, pass: L + 1, passes: ctx.layers.length, value: layer.value, brushMarks: ctx.laid, backend: GPU_INFO,
    writeImage: f => sharp(render(), { raw: { width: W2, height: H2, channels: 3 } }).png().toFile(f), close: async () => { await drainFrames(); ctx.FRAMER?.close(); ctx.sheet._gpu?.close(); } });
  if (FILM_BY_PAINT) {
    // the pass's whole booking, whether or not every passage found a path, so the shares stay on the plan's mass
    ctx.filmPass += layer.shapes.reduce((a, sh) => a + (FILM_MASS.get(sh) ?? 0), 0); ctx.filmLaid = ctx.filmPass;
    const filmTotal=AUTHORED_INPUT?ctx.AREA_COMPILED.diagnostics.authoredPaintGestures:ctx.plannedMass;
    if (filmTotal>0&&ctx.filmLaid >= filmTotal * ctx.filmNext / FILM_FRAMES - 1e-9) { while (ctx.filmNext<=FILM_FRAMES&&ctx.filmLaid >= filmTotal * ctx.filmNext / FILM_FRAMES - 1e-9) ctx.filmNext++; if (!boundaryShot) await shoot(); }
  }
  if(MAJOR_INTENT&&(L===0||L===Math.floor(ctx.layers.length/2))){const stage=L===0?'firstwash':'shadow';await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'major-'+stage+'.png'));if(opt('majorstop','')===stage){await drainFrames();if(ctx.FRAMER)ctx.FRAMER.close();ctx.sheet._gpu?.close();console.log('major checkpoint '+stage+'; not art acceptance');process.exit(0);}}
  if(MAJOR_INTENT&&opt('majorstop','')==='pass:'+(L+1)){ctx.RECEIVER_OBSERVER?.assertComplete();await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'major-pass-'+(L+1)+'-ordinary-dried.png'));fs.writeFileSync(path.join(out,'major-pass-checkpoint.json'),JSON.stringify({pass:L+1,value:layer.value,paper:measurePaperDry(ctx.sheet),backend:GPU_INFO,connectedSky:MAJOR_INTENT.connectedSky,kind:'same original full field through selected pass; no full painting acceptance'},null,2));await drainFrames();if(ctx.FRAMER)ctx.FRAMER.close();ctx.sheet._gpu?.close();process.exit(0);}
  if(ctx.AREA_PLAN){const next=ctx.layers[L+1]?._semantic;if(next?.key!==layer._semantic.key){const result=AREA_EXEC.complete(layer._semantic);if(result.paintCommands>0)AREA_COMPLETED.add(layer._semantic.key);if(!ctx.AREA_FILM_REMOVED&&ctx.sheet.resist&&semanticFilmRemovalReady(ctx.AREA_PLAN,AREA_COMPLETED)){const cells=Array.from(up(ctx.AREA_PLAN.film),(v,i)=>v?i:-1).filter(i=>i>=0);dry(ctx.sheet,30000,O,{levelMax:140,dt:2});const paper=measurePaper(ctx.sheet,cells);check('semantic mid-pass film requires dry paint before removal',paper.dry,{waterMax:paper.waterMax,saturationMax:paper.saturationMax});AREA_EXEC.set(null);AREA_EXEC.command('physical film remove',{cells,paper,atCompletedPass:layer._semantic.key,areaPassIds:ctx.AREA_PLAN.schedule.filter(s=>s.pass.lights.mode==='film').map(s=>s.key),semanticPlanned:true,removalTiming:'actual authored prerequisites completed before following paint',revealedEdges:'inspect only; no automatic softening'},()=>removeFilm());ctx.AREA_FILM_REMOVED=true;await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'semantic-film-revealed.png'));}fs.writeFileSync(path.join(out,'semantic-execution.json'),JSON.stringify({kind:'actual semantic area/pass checkpoint; not artistic acceptance',backend:GPU_INFO,target:ctx.AREA_PLAN.doc.target,view:ctx.AREA_PLAN.doc.view??null,planSHA256:sha256(path.resolve(root,AREA_FILE||FINISH_FILE)),coverage:ctx.AREA_COMPILED.diagnostics,completedPass:result,commands:AREA_EXEC.records},null,2));const stop=opt('areastop','');const {lastArea,stage,lastStage}=semanticStageEnd(ctx.layers,L);if(lastStage){const name=stage.replace(/[^a-zA-Z0-9_-]/g,'_');await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'semantic-stage-'+name+'.png'));}if(stop&&(stop===layer._semantic.key||(stop===layer._semantic.area.id&&lastArea)||(stop===`stage:${stage}`&&lastStage))){if(num('areastopdry',0)){await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'semantic-area-checkpoint-immediate.png'));dry(ctx.sheet,30000,O,{levelMax:140,dt:2});}await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'semantic-area-checkpoint.png'));await drainFrames();if(ctx.FRAMER)ctx.FRAMER.close();ctx.sheet._gpu?.close();console.log(`semantic checkpoint ${layer._semantic.key}; not whole painting acceptance`);process.exit(0);}}}
  // --order painter: a frame at the end of each ground region, so the first wash is seen going on region by region
  if (layer._order?.shoot && FILM_BY_PAINT) await shoot();
  // the plan-against-sheet record keeps its own cadence (--markcadence) whatever is filmed (src/paint/pass-cadence.mjs)
  if (!FILM_BY_PAINT && passDue(L, ctx.layers.length, FILM_FRAMES)) await shoot();
  if (markDue(L, ctx.layers.length, opt('markcadence'))) {
    mark(L + 1);
    FEEDBACK_FRESH = true; // the mark's render waited for the GPU: the next pass reads the sheet at no extra wait
  }
  JSONL.flush();
  await awareBoundary({ kind: 'pass', L });
}
if (TECH_CAL) { console.log(`technique calibration: ${TECH_CAL.history().length} reads; charge factors ${JSON.stringify(Object.fromEntries(Object.entries(TECH_CAL.factors()).map(([k, v]) => [k, +v.toFixed(2)])))}`); fs.writeFileSync(path.join(out, 'technique-cal.json'), JSON.stringify({ kind: 'sheet gain against ledger charge, per technique; no target reads', history: TECH_CAL.history() }, null, 1)); }
if (DELIVERY) { const hst = DELIVERY.history(); console.log(`delivery calibration: ${hst.length} reads; kept of charge ${JSON.stringify(hst.at(-1)?.kept ?? [])}; charge factors ${DELIVERY.factors().map(v => v.toFixed(2)).join(', ')}`); fs.writeFileSync(path.join(out, 'delivery-cal.json'), JSON.stringify({ kind: 'sheet against ledger, per pigment; no target reads', history: hst }, null, 1)); }
if (FEEDBACK_LAG) console.log(`feedback: ${feedbackStats.read} passes read the sheet, ${feedbackStats.predicted} predicted it from the last read and the ledger`);
if(ctx.AREA_PLAN)AREA_EXEC.set(null);
if(ctx.FINISH_PLAN){await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'finishing-glaze-immediate.png'));dry(ctx.sheet,30000,O,{levelMax:140,dt:2});await sharp(render(),{raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'finishing-glaze-ordinary-dried.png'));ctx.AREA_PLAN=null;AREA_EXEC.set(null);}
colourMass('ladder-finished');
if (COLOUR_TRACE) await sharp(render(), {raw:{width:W2,height:H2,channels:3}}).png().toFile(path.join(out,'colour-before-dry.png'));
Object.assign(ctx, { BUDGET, awareProvenance, awareBoundary });
}
