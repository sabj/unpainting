// Pipeline: inking, stage 1 (line source) and stage 3 (stages).
// The painter's linework planning step, before the first mark: where the line set comes from (--linesource) and how
// the plan's linked stages are cut from it (--stages, drawing-stages.mjs). The plan's drawing section writes these
// flags (src/paint/drawing-plan.mjs); a run without them draws as before.
//
//   --linesource none|auto|source-ink|photo-sketch   none (painter default): the pen finds its own lines (the walker),
//       unless --drawingfile names a line file. source-ink: the target's own pen lines (src/crop/ink-lines-file.mjs).
//       photo-sketch: tools/seg/sketch-lines.py (needs numpy and OpenCV; line-python.mjs picks the python; --sketchmap a
//       learned map from tools/seg/sketch-map.py). auto: source-ink when the separator reads --penfirst per cent of the
//       target as pen line (default 0.5), else photo-sketch when it can run, else the walker.
//   --stages prep,prepink,finishink   the stages drawn, any subset; options --prepamount, --prepinkfrom, --prepinkkeep,
//       --prepinkadd, --prepinkamount, --prepinkdeviate, --finishfrom, --finishselect, --finishrestate, --finishmethod,
//       --finishdeviate. Without --stages the pens are planned as before.
//
// Planning only: every read of the target happens here, before the target guard seals it.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeInkLines } from '../../crop/ink-lines-file.mjs';
import { finishTexture } from './finish-texture.mjs';
import { linePaths, scaleLines } from '../../crop/lines.mjs';
import { planStages, stageDoc, STAGE_DEFAULTS } from './drawing-stages.mjs';
import { linePython } from './line-python.mjs';
import { gaussian } from '../../keyframes/density.mjs';
import { edgeEvidence } from './line-evidence.mjs';
import { cleanLines } from './line-cleanup.mjs';
import { DEFAULT_SHEET_MM } from '../../media/sheet-size.mjs';
import { agreeMask, agreeLines, uncovered } from './ink-agree.mjs';
import { traceLineModel } from './line-model.mjs';
import sharp from 'sharp';

const lin = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const LINE_SOURCES = Object.freeze(['none', 'auto', 'source-ink', 'photo-sketch', 'structure-lines', 'structure-combine', 'line-map']);
// fewer source-ink lines than this and the stages fall back to edge chains
const MIN_STAGE_LINES = 12;
const STAGE_KEYS = Object.freeze({ prep: 'prep', prepink: 'prepInk', finishink: 'finishInk' });

/** The --stages flag as { prep?, prepInk?, finishInk? } with each stage's options, or null. */
export function stagesFromFlags(opt, num) {
  const raw = opt('stages', '');
  if (!raw || raw === 'none') return null;
  const names = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  for (const s of names) if (!STAGE_KEYS[s]) throw new Error(`--stages: prep, prepink or finishink, not ${s}`);
  const has = new Set(names.map(s => STAGE_KEYS[s]));
  const d = STAGE_DEFAULTS, out = {};
  if (has.has('prep')) out.prep = { amount: num('prepamount', d.prep.amount) };
  if (has.has('prepInk')) out.prepInk = { keep: num('prepinkkeep', d.prepInk.keep), add: num('prepinkadd', d.prepInk.add), amount: num('prepinkamount', d.prepInk.amount),
    ...(opt('prepinkdeviate', '') !== '' ? { deviate: num('prepinkdeviate', d.prepInk.deviate) } : {}), ...(opt('prepinkfrom', '') ? { from: opt('prepinkfrom', '') } : {}) };
  if (has.has('finishInk')) out.finishInk = { restate: num('finishrestate', d.finishInk.restate), select: opt('finishselect', d.finishInk.select),
    method: opt('finishmethod', d.finishInk.method), deviate: num('finishdeviate', d.finishInk.deviate), ...(opt('finishfrom', '') ? { from: opt('finishfrom', '') } : {}) };
  return out;
}

/** auto's choice from the separator's line share (0..1) and whether the sketch planner can run. */
export function chooseLineSource(mode, { inkShare, threshold = 0.5, sketchAvailable }) {
  if (!LINE_SOURCES.includes(mode)) throw new Error(`--linesource: ${LINE_SOURCES.join(', ')}, not ${mode}`);
  if (mode !== 'auto') return mode;
  if (100 * inkShare >= threshold) return 'source-ink';
  return sketchAvailable ? 'photo-sketch' : 'none';
}

function runSketch({ python, root, image, stem, map, segments, log }) {
  const args = [path.join(root, 'tools/seg/sketch-lines.py'), image, '--out', stem];
  if (map) args.push('--map', map);
  if (segments) args.push('--segments', segments);
  const r = spawnSync(python, args, { encoding: 'utf8', env: { ...process.env, OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '2' }, timeout: 900000 });
  if (r.error || r.status !== 0) throw new Error(`photo-sketch lines failed: ${r.error?.message ?? r.stderr?.trim().split('\n').at(-1)}. See tools/seg/README.md for setup.`);
  log(`line source photo-sketch: ${r.stdout.trim().split('\n').at(-1)}`);
}

/**
 * The plan's lines, before painting. Pushes --drawingfile (and, with stages, --drawinglast, --drawing and the stage
 * neutralising flags) onto argv. `edges()` gives the fallback set when stages need lines and no source has any:
 * edge chains on the plan grid, [{ points: [{x, y}] }].
 * @returns { source, stages, files } for the run's linework.json
 */
// Extract the immutable source before wash compilation, so washes can exclude drawn ink.
export async function prepareLineSource({opt,num,argv,out,root,inkShare=0,log=()=>{}}) {
  const mode=opt('linesource','none');
  const info={source:opt('drawingfile','')?'file':'walker',requested:mode,stages:null,files:{}};
  if(opt('drawing','first')==='none') return info;
  const image=path.resolve(root,opt('image',''));
  if (!opt('drawingfile', '') && mode !== 'none') {
    const lp = linePython({ flag: opt('sketchpython', ''), log }), python = lp.path;
    info.python = lp;
    const canSketch = mode === 'photo-sketch' || (mode === 'auto' && 100 * inkShare < num('penfirst', 0.5) && lp.ready);
    const choice = chooseLineSource(mode, { inkShare, threshold: num('penfirst', 0.5), sketchAvailable: canSketch });
    if (choice === 'source-ink') {
      const stem = path.join(out, 'lines-source-ink');
      const observed = fs.existsSync(image) ? await writeInkLines(image, stem) : null;
      // copy-lines traces a pen drawing whole; a painted source with only a little pen line gets the narrow-ridge
      // tracer. --copylinesmin sets the pen line share that counts as a pen drawing (default 0.025)
      const penDrawing = !observed || observed.inkCells / (observed.w * observed.h) >= num('copylinesmin', 0.025);
      const wantModel = num('linemodel', 0) > 0 || opt('linemodel', '') === 'strict';
      if (wantModel && lp.ready && lp.model && penDrawing) {
        // a source the separator reads as (nearly) bare of pen line gets no pen lines, as with the narrow-ridge tracer
        if (num('copylinesfloor', 0) > 0 && 100 * await separatorShare(image) < num('copylinesfloor', 0)) {
          log(`line source source-ink: no pen lines, the separator reads under --copylinesfloor ${num('copylinesfloor', 0)}% pen line`);
          argv.push('--drawing', 'none');
          info.source = 'none';
          return info;
        }
        try {
          const t = traceLineModel({ python, root, image, stem, cacheDir: path.resolve(root, opt('linemodelcache', 'work/line-maps')),
            width: num('linemodelwidth', 1080), maxside: num('linemodelside', 1620), tolerance: opt('mapsmoothing', '') === '' ? null : num('mapsmoothing', 0.15), offline: num('linemodeloffline', 0) > 0 });
          info.extractor = 'lineart-models';
          info.lineMap = { map: t.map, cached: t.cached };
          if (!opt('inkprofile', '')) argv.push('--inkprofile', 'drawing-ink');
          log(`line source source-ink: lineart models, fused map ${t.cached ? 'from the cache' : 'computed'}, traced whole (${t.summary})`);
        } catch (e) {
          if (opt('linemodel', '') === 'strict') throw e;
          info.warning = `lineart models fallback: ${e.message}`;
          log(`!!! line source source-ink: ${e.message}; falling back to copy-lines on the target's own ink (run tools/cloud/setup-lines.sh, see tools/seg/README.md)`);
        }
      } else if (wantModel) {
        const why = !lp.ready ? `${python} cannot import numpy and OpenCV` : !lp.model ? `${python} has no torch or controlnet_aux` : 'the source has less pen line than --copylinesmin';
        if (opt('linemodel', '') === 'strict') throw new Error(`--linemodel strict: ${why}`);
        log(`!!! line source source-ink: lineart models skipped, ${why}`);
      }
      if (info.extractor !== 'lineart-models' && lp.ready && penDrawing) {
        const r = spawnSync(python, [path.join(root, 'tools/seg/copy-lines.py'), image, '--out', stem, '--width', String(num('width', 1080))],
          { encoding: 'utf8', timeout: 900000, env: { ...process.env, OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '2' } });
        if (r.error || r.status !== 0) throw new Error(`source-ink copy failed: ${r.error?.message ?? r.stderr}`);
        info.extractor = 'copy-lines';
        if (!opt('inkprofile', '')) argv.push('--inkprofile', 'drawing-ink');
        log(`line source source-ink: observed paths and optical widths (${r.stdout.trim()})`);
        if (num('copylinesagree', 0) > 0 && !await agreeWithSeparator(stem + '-lines.json', image, { near: num('copylinesagree', 0), gap: num('copylinesgap', 2), minRun: num('copylinesrun', 3), floor: num('copylinesfloor', 0), fill: num('copylinesfill', 0) > 0 ? observed : null, log })) {
          argv.push('--drawing', 'none');
          info.source = 'none';
          return info;
        }
      } else if (info.extractor === 'lineart-models') {
        // traced above from the models' fused map; nothing cuts it against the separator
      } else if (observed && lp.ready) {
        info.extractor = 'ink-lines';
        log(`line source source-ink: ${observed.lines.length} narrow-ridge lines (painted source)`);
      } else {
        const r = observed ?? await writeInkLines(image, stem);
        info.extractor = 'ink-lines fallback (numpy/OpenCV unavailable)';
        log(`!!! line source source-ink fallback: ${r.lines.length} narrow-ridge lines, because ${python} cannot import numpy and OpenCV; run tools/cloud/setup-lines.sh`);
      }
      argv.push('--drawingfile', stem);
      info.source = 'source-ink';
    } else if (choice === 'photo-sketch') {
      const stem = path.join(out, 'lines-photo-sketch');
      runSketch({ python, root, image, stem, map: opt('sketchmap', '') ? path.resolve(root, opt('sketchmap', '')) : null, segments: opt('sketchsegments', '') ? path.resolve(root, opt('sketchsegments', '')) : null, log });
      argv.push('--drawingfile', stem);
      info.source = 'photo-sketch';
    } else if (['structure-lines', 'structure-combine', 'line-map'].includes(choice)) {
      const stem = path.join(out, 'lines-' + choice);
      const run = args => {
        const r = spawnSync(python, args, {encoding:'utf8', timeout:900000, env:{...process.env, OMP_NUM_THREADS:'2', OPENBLAS_NUM_THREADS:'2'}});
        if (r.error || r.status !== 0) throw Error(`${choice} failed: ${r.error?.message ?? r.stderr}`);
      };
      if (choice === 'line-map') {
        if (!opt('sketchmap','')) throw Error('line-map needs drawing.map or --sketchmap');
        run([path.join(root,'tools/seg/copy-lines.py'), path.resolve(root,opt('sketchmap')), '--out',stem,'--width',String(num('width',540)), '--kind','line-map','--map-tolerance',String(num('mapsmoothing',.25))]);
      } else {
        run([path.join(root,'tools/seg/structure-lines.py'),image,'--out',stem,'--width',String(num('width',540)), '--seed',String(num('seed',0))]);
        if (choice === 'structure-combine') {
          const traced=stem+'-detail';
          runSketch({python,root,image,stem:traced,map:opt('sketchmap','')||null,segments:opt('sketchsegments','')||null,log});
          run([path.join(root,'tools/seg/structure-combine.py'),stem+'-lines.json',traced+'-lines.json','--out',stem]);
        }
      }
      argv.push('--drawingfile',stem); info.source=choice; info.extractor=choice;
    } else log(`line source auto: ${(100 * inkShare).toFixed(2)}% pen line in the target and no sketch planner (${python} lacks numpy or OpenCV); the pen finds its own lines`);
    if (mode === 'auto' && choice === 'none' && 100 * inkShare < num('penfirst', 0.5)) {
      info.warning = `photo-sketch skipped: ${python} cannot import cv2 and numpy`;
      log(`WARNING line source auto: photo-sketch skipped, ${python} cannot import cv2 and numpy (pass --sketchpython with a python that has them); the pen finds its own lines instead`);
    }
  }
  return info;
}

// The share (0..1) of the picture the separator reads as pen line, at 540 px wide whatever the painting's width, as the
// separator's ridge scales are in cells.
async function separatorShare(image) {
  const meta = await sharp(image).metadata(), fw = 540, fh = Math.max(1, Math.round(meta.height * fw / meta.width));
  return agreeMask(await sharp(image).removeAlpha().resize(fw, fh, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer(), fw, fh, { near: 0 }).share;
}

// --copylinesagree <cells>: cut the traced lines to the parts within that many cells of the separator's pen line
// (ink-agree.mjs); --copylinesgap points off it a run may cross, --copylinesrun the shortest run kept, in points.
// --copylinesfloor <per cent>: a source the separator reads, at 540 px wide, as less pen line than this gets no pen lines.
// --copylinesfill 1: the separator's pen line that no kept trace covers is filled from the narrow-ridge lines
// (ink-lines-file.mjs), cut the same way; copy-lines misses pale and broad pen lines.
async function agreeWithSeparator(file, image, { near, gap, minRun, floor, fill = null, log }) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8')), { w, h } = doc.image;
  const meta = await sharp(image).metadata();
  const rgb = await sharp(image).removeAlpha().resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer();
  const { mask, ink } = agreeMask(rgb, w, h, { near });
  const share = floor > 0 ? await separatorShare(image) : 1;
  if (100 * share < floor) {
    fs.writeFileSync(file, JSON.stringify({ ...doc, lines: [], agree: { near, floor, share } }) + '\n');
    log(`line source source-ink: no pen lines, the separator reads ${(100 * share).toFixed(2)}% pen line, under --copylinesfloor ${floor}%`);
    return false;
  }
  const r = agreeLines(doc.lines, mask, w, h, { gap, minRun });
  let lines = r.lines, filled = 0;
  if (fill?.lines?.length) {
    const left = uncovered(lines, ink, w, h, near), sx = w / meta.width, sy = h / meta.height;
    const scaled = fill.lines.map(l => ({ ...l, points: l.points.map(([x, y]) => [x * sx, y * sy]), length: l.length * sx, role: 'separator ink' }));
    const extra = left.count ? agreeLines(scaled, left.mask, w, h, { gap, minRun }).lines : [];
    lines = [...lines, ...extra];
    filled = extra.length;
    log(`line source source-ink: ${left.count} pen line cells uncovered, ${filled} narrow-ridge pieces added`);
  }
  fs.writeFileSync(file, JSON.stringify({ ...doc, lines, agree: { near, gap, minRun, kept: r.kept, cut: r.cut, dropped: r.dropped, filled } }) + '\n');
  log(`line source source-ink: ${r.kept} lines kept whole, ${r.cut} cut and ${r.dropped} dropped against the separator's pen line (within ${near} cells)`);
  return true;
}

export async function planLinework({ opt, num, argv, out, root, inkShare, density, grid, rgb = null, edges, log, planLines, drawingOverride = null }) {
  const stages = stagesFromFlags(opt, num);
  if (stages && drawingOverride) {
    if (drawingOverride === 'first') delete stages.finishInk;
    if (drawingOverride === 'last') {delete stages.prep; delete stages.prepInk; if(stages.finishInk) stages.finishInk.from='lines';}
  }
  const mode = opt('linesource', 'none');
  const info = { source: opt('drawingfile', '') ? 'file' : 'walker', requested: mode, stages: null, files: {} };
  if (opt('drawing', 'first') === 'none') return info;
  const image = path.resolve(root, opt('image', ''));
  Object.assign(info, await prepareLineSource({opt,num,argv,out,root,inkShare,log}));
  if (!stages) return info;
  // the one line set the stages share, in its own source pixels
  let doc, setName;
  const file = opt('drawingfile', '');
  if (file) {
    doc = JSON.parse(fs.readFileSync(linePaths(file).lines, 'utf8'));
    setName = info.source === 'file' ? linePaths(file).lines : info.source;
  } else {
    // no line file: the target's own dark ridges, as source-ink traces them, cleaned of shadow edges and foliage squiggles
    const stem = path.join(out, 'lines-source-ink'), r = await writeInkLines(image, stem);
    if (r.lines.length >= MIN_STAGE_LINES) {
      doc = JSON.parse(fs.readFileSync(`${stem}-lines.json`, 'utf8'));
      // --linecleanup 0 keeps every traced line; the pen-and-wash recipe does, since --linesupport drops what the
      // target does not show as a line
      if (rgb && grid?.w && grid?.h && num('linecleanup', 1) > 0) {
        const w = grid.w, h = grid.h, n = w * h, mmPerCell = num('sheetmm', DEFAULT_SHEET_MM) / w;
        const raw = scaleLines(doc, w, h, { keepOrder: true });
        const ev = edgeEvidence(rgb, w, h, { margin: Math.max(2, Math.round(0.04 * Math.min(w, h))) });
        const target = { w, h, ev, L: ev.smooth[0], A: ev.smooth[1], B: ev.smooth[2], rgb: [0, 1, 2].map(c => gaussian(Float32Array.from({ length: n }, (_, i) => lin(rgb[3 * i + c])), w, h, 1)) };
        const kind = inkShare >= 0.025 ? 'pen' : 'trace';
        const cleaned = cleanLines(raw, target, { mmPerCell, kind, seed: 1 + Math.round(num('seed', 0)) });
        { // Successful cleanup is authoritative, including an empty line set.
          doc = { image: { w, h }, lines: cleaned.lines.map(g => ({ ...g, points: g.points.map(q => [q.x, q.y]), ...(g.points.every(q => q.width != null) ? { widths: g.points.map(q => q.width) } : {}), ...(g.weight != null ? { weight: g.weight } : {}), ...(g.points.every(q => q.weight != null) ? { weights: g.points.map(q => q.weight) } : {}) })) };
          info.cleanup = cleaned.stats;
        }
      }
      setName = 'source-ink (the stages need a line set and no other source ran)';
      info.source = 'source-ink';
    } else {
      doc = { image: { w: grid.w, h: grid.h }, lines: edges().map(g => ({ points: g.points.map(q => [q.x, q.y]) })) };
      setName = `edge chains (source-ink found only ${r.lines.length} lines)`;
      info.source = 'edges';
    }
  }
  const imageSize = doc.image ?? { w: grid.w, h: grid.h };
  // the plan's line choice (amount, lines, maxLines) applies to the set once, before the stages are cut from it
  const lines = planLines ? planLines(doc.lines.filter(g => g.points?.length >= 2), imageSize) : doc.lines;
  const r = planStages(lines, { image: imageSize, stages, density });
  if (r.finishInk && density) for (const kind of ['hatch','fur']) {
    const raw=opt('finish'+kind,'');
    if (!raw) continue;
    const extra=finishTexture(density,{...JSON.parse(raw),kind});
    const sx=imageSize.w/density.w,sy=imageSize.h/density.h;
    r.finishInk.push(...extra.map(g=>({...g,points:g.points.map(([x,y])=>[x*sx,y*sy]),widths:g.widths.map(v=>v*sx)})));
    r.summary.finishInk[kind]=extra.length;
    r.summary.finishInk.lines=r.finishInk.length;
  }
  for (const [key, name] of [['prep', 'prep'], ['prepInk', 'prepink'], ['finishInk', 'finishink']]) {
    if (!r[key] && !(key === 'prepInk' && r.prep)) continue;
    const stem = path.join(out, `stage-${name}`);
    // a prep pencil with no prepInk stage: an empty opening file, marked so the opening pen knows it is meant
    // (drawing-file.mjs), while every other reader of the opening file sees no lines, as before
    const empty = r[key] ? null : 'the plan has a prep pencil and no prepInk stage; the pencil is the opening drawing';
    fs.writeFileSync(`${stem}-lines.json`, JSON.stringify({ ...stageDoc(r[key] ?? [], { image: imageSize, stage: key, source: setName }), ...(empty ? { empty } : {}), ...(doc.inputKind ? { inputKind: doc.inputKind } : {}) }) + '\n');
    info.files[key] = stem;
  }
  if (info.files.prepInk) argv.push('--drawingfile', info.files.prepInk);
  if (info.files.finishInk) argv.push('--drawinglast', info.files.finishInk, '--drawinglastmin', '0', '--drawinglastlogic', '0');
  // the stage files are the drawing: the line choice is spent, and the pens draw what the stages hold.
  // When no prepared drawing file with optical widths was given, keep the fine Old Master nib pressure caps (0.3 / 0.35).
  if (!file && num('penwash', 0) <= 0) {
    if (opt('openingpressure', '') === '') argv.push('--openingpressure', '0.3');
    if (opt('closingpressure', '') === '') argv.push('--closingpressure', '0.35');
  }
  argv.push('--drawshare', '1', '--drawregions', '0', '--drawmax', 'Infinity', '--drawingskip', '', '--sourceink', '1');
  const first = !!(r.prep || r.prepInk), last = !!r.finishInk;
  argv.push('--drawing', first && last ? 'both' : first ? 'first' : 'last');
  if (r.prepInk || r.finishInk) argv.push('--outlinemedium', 'ink');
  info.stages = r.summary;
  log(`linked stages from ${setName}: ${Object.entries(r.summary).map(([k, s]) => `${k} ${s.lines} lines${s.from ? ` from ${s.from}` : ''}`).join(', ')}`);
  return info;
}
