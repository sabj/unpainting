// The painter's linework planning step, before the first mark: where the line set comes from (--linesource) and how
// the plan's linked stages are cut from it (--stages, drawing-stages.mjs). The plan's drawing section writes these
// flags (src/paint/drawing-plan.mjs); a run without them draws as before.
//
//   --linesource none|auto|source-ink|photo-sketch   none (painter default): the pen finds its own lines (the walker),
//       unless --drawingfile names a line file. source-ink: the target's own pen lines (src/crop/ink-lines-file.mjs).
//       photo-sketch: tools/seg/sketch-lines.py (needs python3 with numpy and OpenCV, --sketchpython; --sketchmap a
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
import { linePaths } from '../../crop/lines.mjs';
import { planStages, stageDoc, STAGE_DEFAULTS } from './drawing-stages.mjs';

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

/** Whether the sketch planner's python has numpy and OpenCV. */
function sketchAvailable(python) {
  const r = spawnSync(python, ['-c', 'import cv2, numpy'], { encoding: 'utf8', timeout: 60000 });
  return !r.error && r.status === 0;
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
    const python = opt('sketchpython', 'python3');
    const canSketch = mode === 'photo-sketch' || (mode === 'auto' && 100 * inkShare < num('penfirst', 0.5) && sketchAvailable(python));
    const choice = chooseLineSource(mode, { inkShare, threshold: num('penfirst', 0.5), sketchAvailable: canSketch });
    if (choice === 'source-ink') {
      const stem = path.join(out, 'lines-source-ink');
      if (sketchAvailable(python)) {
        const r = spawnSync(python, [path.join(root, 'tools/seg/copy-lines.py'), image, '--out', stem, '--width', String(num('width', 1080))],
          { encoding: 'utf8', timeout: 900000, env: { ...process.env, OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '2' } });
        if (r.error || r.status !== 0) throw new Error(`source-ink copy failed: ${r.error?.message ?? r.stderr}`);
        info.extractor = 'copy-lines';
        if (!opt('inkprofile', '')) argv.push('--inkprofile', 'drawing-ink');
        log(`line source source-ink: observed paths and optical widths (${r.stdout.trim()})`);
      } else {
        const r = await writeInkLines(image, stem);
        info.extractor = 'ink-lines fallback (numpy/OpenCV unavailable)';
        log(`line source source-ink fallback: ${r.lines.length} narrow-ridge lines; install numpy/OpenCV for observed-width copying`);
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
  }
  return info;
}

export async function planLinework({ opt, num, argv, out, root, inkShare, density, grid, edges, log, planLines, drawingOverride = null }) {
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
    // no line file: the target's own dark ridges, as source-ink traces them, or its edge chains when those are too few
    const stem = path.join(out, 'lines-source-ink'), r = await writeInkLines(image, stem);
    if (r.lines.length >= MIN_STAGE_LINES) {
      doc = JSON.parse(fs.readFileSync(`${stem}-lines.json`, 'utf8'));
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
    fs.writeFileSync(`${stem}-lines.json`, JSON.stringify(stageDoc(r[key] ?? [], { image: imageSize, stage: key, source: setName })) + '\n');
    info.files[key] = stem;
  }
  if (info.files.prepInk) argv.push('--drawingfile', info.files.prepInk);
  if (info.files.finishInk) argv.push('--drawinglast', info.files.finishInk, '--drawinglastmin', '0', '--drawinglastlogic', '0');
  // the stage files are the drawing: the line choice is spent, and the pens draw what the stages hold
  argv.push('--drawshare', '1', '--drawregions', '0', '--drawmax', 'Infinity', '--drawingskip', '', '--sourceink', '1');
  const first = !!(r.prep || r.prepInk), last = !!r.finishInk;
  argv.push('--drawing', first && last ? 'both' : first ? 'first' : 'last');
  if (r.prepInk || r.finishInk) argv.push('--outlinemedium', 'ink');
  info.stages = r.summary;
  log(`linked stages from ${setName}: ${Object.entries(r.summary).map(([k, s]) => `${k} ${s.lines} lines${s.from ? ` from ${s.from}` : ''}`).join(', ')}`);
  return info;
}
