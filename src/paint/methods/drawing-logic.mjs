import { planLines } from '../drawing-plan.mjs';
import { materialProfile } from './material-profiles.mjs';
// --drawinglogic 1: the walker's inking logic, run over a selected drawing file instead of bypassed by it.
//
// Without the flag drawing-file.mjs draws every line of the file whole, in the file's order, at the file's own
// pressure: no ink budget, no tiers, no ink filter, no joining, no hand's ordering and no taper. With it:
//
//   first pen (--drawingfile <base>): form only. The file ranked by tier (drawing-rank.mjs), each tier inside its share
//     of the ink budget, the features outside it, the ink filter over the structure, then connected, put in a hand's
//     order and shaped with a press-in and a lift-off (drawing-hand.mjs).
//   closing pen (--drawinglast <base>, the same file or another): toning. What the first pen did not take, cut to where
//     the painting still needs darkening and off the lights, lighter than the form lines.
//
// Flags, with their defaults:
//   --drawformbudget 1.5       the ink budget's multiplier for the first pen (paint-plate's CELLS times this)
//   --drawtier1 0.5 --drawtier3 0.3 --drawtier4 0.15   each tier's share of that budget
//   --drawsillen 0.04        the shortest silhouette line, as a share of the sheet's short side
//   --drawfeatures 40        the most feature lines, by contrast; every short line on the file's `face` object is one
//   --drawfill 0.1           the share of the budget the tiers left that goes on more short subject lines
//   --drawfilter 0           the ink filter over tiers 3 and 4, off: it reads a file's line round a dark mass as a
//                            wash step and drops it
//   --drawjoingap 8          cells between two ends that may be joined; --drawjoincos 0.7, --drawjoinaim 0.6
//   --drawtaperin 3, --drawtaperout 5 (cells, times K), --drawtaperstart 0.45, --drawtaperend 0.3
//   --drawformfloor 0.7      the first pen's darkness where the file says 0 (its own darkness spans the rest)
//   --drawtonewant 0.6       the closing pen's pressure share at full darkness, the file's own (--drawwant)
//   --drawtonelight 0.12     source density under which a point is a light
//   --drawtonelo 0, --drawtonehi 0   the need gate, off: set hi above 0 to lay toning only where the painting still
//                            needs darkening, kept from lo and all of it at hi
//
// --drawinglogic 3: logic 1's routing with the pen's own weight and pace (shapePenLine), fewer longer strokes, lit edges left open and the dark
// masses as looping scribble (drawing-scribble.mjs); the closing pen is logic 1's.
//
// --drawinglogic 2 (the walker's gestures laid on the file's lines) was removed: no plan reached it.
//
// DOM free. Reads the line file through lines.mjs.
import { loadLines } from '../../crop/lines.mjs';
import { pathLength } from '../../crop/inktiers.mjs';
import { rankLines, splitForm, inkFilterOn, toneRuns } from './drawing-rank.mjs';
import { connect, handOrder, shapeGesture, personStrokes } from './drawing-hand.mjs';
import { breakOnLights, scribbleMasses, shapePenLine } from './drawing-scribble.mjs';
import { gaussian } from '../../keyframes/density.mjs';

/** Why --drawinglogic 2 (prepInk.method "connected") stops a run. */
const DRAWING_LOGIC_2_REMOVED = '--drawinglogic 2 (drawing.stages.prepInk.method "connected") was removed: it laid the walker\'s gestures on the drawing file and no plan reached it; draw the lines as planned (contour) or as a scribble';

export function drawingLogic({ base, first, w, h, opt, num, log, D, want, cells, K = 1, style = null }) {
  if (!D) throw new Error('drawing logic: no source density');
  const mode = Math.round(num('drawinglogic', 1));
  if (mode === 2) throw new Error(DRAWING_LOGIC_2_REMOVED);
  const skip = new Set(opt('drawingskip', '').split(',').map(r => r.trim()).filter(Boolean));
  // the plan's choice (drawing-plan.mjs planLines): --drawshare, --drawregions and --drawmax
  const loaded = planLines(loadLines(base, w, h, { keepOrder: true }).filter(g => !skip.has(g.role)), num);
  const all = loaded;
  // Joined before ranking, per role and kind, so a contour the segmenter broke at every junction is ranked as the one
  // long line it is, and a strand is never stitched to a contour. 8 cells keeps the lines connected.
  const joinOpts = { gap: num('drawjoingap', 8) * K, cos: num('drawjoincos', 0.7), aim: num('drawjoinaim', 0.6) };
  const groups = new Map();
  for (const g of all) { const k = `${g.role}|${g.kind}|${g.object ?? ''}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(g); }
  let joined0 = 0;
  const whole = [...groups.values()].flatMap(gs => { const r = connect(gs, joinOpts); joined0 += r.joined; return r.gestures; });
  log(`drawing logic ${mode}: ${all.length} lines of work/lines/${base}-lines.json joined ${joined0} times into ${whole.length}, as drawn now ${stat(all)}`);
  const shape = { inLen: num('drawtaperin', 3) * K, outLen: num('drawtaperout', 5) * K, start: num('drawtaperstart', 0.45), end: num('drawtaperend', 0.3),
    gain: num('drawwidthgain', 1.39), margin: num('drawwidthmargin', 0.42), minNib: num('drawwidthmin', 0.3) };
  const strokeLen = num('drawstroke', 0.12) * Math.min(w, h);
  const hybridProfile=materialProfile(opt('outlinemedium','ink').startsWith('graphite')?opt('graphiteprofile','graphite-HB'):opt('inkprofile','black-ink'));
  const hybridMm=num('sheetmm',152.4)/w;
  const hybridShape={...shape,nib:hybridProfile.widthMm[0]/hybridMm,flex:(hybridProfile.widthMm[1]-hybridProfile.widthMm[0])/hybridMm,
    pressureFloor:0,pressureGain:1,pressureExponent:hybridProfile.pressureExponent,
    want:num('hybridwant',1.3),mix:num('hybridmix',.4),fast:num('hybridfast',2.4),slow:num('hybridslow',.6),
    land:num('hybridland',1.2),lift:num('hybridlift',.6),turnDwell:num('hybriddwell',.5)};
  const ranked = rankLines(whole, { w, h, D, K, featLen: num('featlen', 0.08), silLen: num('drawsillen', 0.04) });
  const budget = cells * num('drawformbudget', 1.5);
  const split = splitForm(ranked, {
    cells: budget, nib: 1.5 * K, features: Math.round(num('drawfeatures', 40)),
    shares: { 1: num('drawtier1', 0.5), 3: num('drawtier3', 0.3), 4: num('drawtier4', 0.15) },
    filter: num('drawfilter', 0) > 0 ? inkFilterOn(D, w, h, K) : null, fill: num('drawfill', 0.1),
  });
  // logic 3 is the ink-led piece's opening drawing: a piece whose style read is under --scribbleink 0.5 ink keeps logic 1
  const inkLed = !style || style.ink >= num('scribbleink', 0.5);
  if (first && mode === 3 && !inkLed) log(`drawing logic 3: style ink ${style.ink} under ${num('scribbleink', 0.5)}, logic 1 instead`);
  if (first && mode === 3 && inkLed) {
    // logic 1's lines joined into fewer, longer strokes, weighted and paced by the pen (shapePenLine), open along the lights, and the
    // dark masses as looping scribble (drawing-scribble.mjs)
    const short = Math.min(w, h), minL = num('scribblemin', 0.02) * short;
    const { gestures } = connect(split.form, { gap: num('scribblejoin', 14) * K, cos: num('scribblecos', 0.6), aim: 0.5 });
    const kept = handOrder(gestures.filter(g => pathLength(g.points) >= minL));
    const broken = kept.flatMap(g => breakOnLights(g, D, w, h, { lit: num('scribblelit', 0.15), reach: 2 * K }));
    const lines = broken.map(g => shapePenLine(g, hybridShape))
      .flatMap(g => personStrokes(g, num('scribblestroke', 0.2) * short, { dipFirst: true, low: num('hybridlow', 0.03), load: Math.min(1, num('hybridload', 0.2) + num('hybridloadper', 0.0006) * pathLength(g.points)) }));
    const masses = num('scribblemasses', 1) > 0 ? scribbleMasses(D, w, h, gaussian, { K, dark: num('scribbledark', 0.06), minMass: num('scribblemass', 0.002), loop: num('scribbleloop', 0.008), hole: num('scribblehole', 0.35), seed: 7 }) : [];
    const scribbles = masses.flatMap(g => personStrokes(g, num('scribblestrokes', 0.12) * short, { dipFirst: true, load: 0.6, low: 0.05 }));
    log(`drawing logic 3, first pen: ${split.form.length} form lines joined into ${kept.length} (${stat(kept)}), ${broken.length} runs after opening the lit edges, ${lines.length} strokes; ${masses.length} mass scribbles in ${scribbles.length} strokes`);
    return [...lines, ...scribbles];
  }
  if (first) {
    log(`drawing logic 1: ink budget ${Math.round(budget)} cells`);
    split.log.forEach(l => log(l));
    const { gestures, joined } = connect(split.form, joinOpts);
    const ordered = handOrder(gestures);
    log(`drawing logic 1, first pen: ${split.form.length} lines joined ${joined} more times into ${stat(ordered)}, in a hand's order, tapered`);
    return ordered.map(g=>shapeGesture(g,{...shape,base:num('drawwant',num('tier1want',.6)),floor:num('drawformfloor',.7)})).filter(Boolean).flatMap(g=>personStrokes(g,strokeLen).map(s=>({...s,rank:g.tier,...(g.reviewedRoles?{reviewedRoles:g.reviewedRoles}:{}),...(g.reviewedOrdinal==null?{}:{reviewedOrdinal:g.reviewedOrdinal,focalFeature:g.focalFeature}),...(g.openingControl?{openingRole:g.openingRole,openingControl:g.openingControl}:{})})));
  }
  let tone = split.tone;
  if (!want) throw new Error('drawing logic: the closing pen needs the pass\'s ink want');
  // --closeclean 1: the closing pen keeps the file's lines and strands of --closemin of the short side or longer. The
  // file's hatching and its specks are the painting's tone, which the washes already carry; drawn as ink they read as noise.
  if (num('closeclean', 0) > 0) {
    const before = tone.length, minL = num('closemin', 0.025) * Math.min(w, h);
    tone = tone.filter(g => g.kind !== 'hatch' && (g.length ?? pathLength(g.points)) >= minL);
    log(`drawing logic ${mode}, closing pen clean: ${tone.length} of ${before} lines kept (no hatching, ${minL.toFixed(0)} cells or longer)`);
  }
  // the closing pen carries most of the file: only the lights are cut unless --drawtonehi turns the need gate on
  const t = toneRuns(tone, { w, h, D, want, light: num('drawtonelight', 0.12), lo: num('drawtonelo', 0), hi: num('drawtonehi', 0) });
  const { gestures, joined } = connect(t.lines, joinOpts);
  const ordered = handOrder(gestures.map(g => ({ ...g, tier: 0 })));
  log(`drawing logic ${mode}, closing pen: ${t.lines.length} runs from ${tone.length} lines (${t.dropped} not needed there, ${t.lit} breaks at lights), joined ${joined} times into ${stat(ordered)}`);
  const toneWant = num('drawtonewant', 0.6);
  return ordered.map(g => shapeGesture(g, { ...shape, base: toneWant, scale: 0.5 + 0.5 * (g.need ?? 1) })).flatMap(g => personStrokes(g, strokeLen));
}

/** Median of the lengths of gestures, and their count, for the log. */
function gestureStats(gs) {
  const L = gs.map(g => g.length ?? pathLength(g.points)).sort((a, b) => a - b);
  return { n: L.length, median: L.length ? L[Math.floor(L.length / 2)] : 0, total: L.reduce((a, b) => a + b, 0) };
}
const stat = gs => { const s = gestureStats(gs); return `${s.n} gestures, median ${s.median.toFixed(1)} cells, ${Math.round(s.total)} cells in all`; };
