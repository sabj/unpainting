// --recipe: a named set of flags put in front of the command line, then the value plan's drawing flags. Typed flags
// win for named recipes; with --recipe none, the plan's drawing overrides harness template flags. The last occurrence of a repeated flag is read.
//
// default, combined, general: one general process, adjusted through drawing, washes and order.
// penwash (also `--style penwash`): pen and wash. A prepared ink drawing first, pruned for line economy, then the
// washes in an illustrator's order, lights first (src/paint/methods/pen-wash-plan.mjs planStages): paper whites kept,
// one pale unifying first wash, one mid-value shadow wash, a few small darks. No value ladder, touch-ups, closing pen
// or frisket; a limited palette comes from --paints.
import fs from 'node:fs';
import path from 'node:path';
import { pipelineFlags } from './pipeline-plan.mjs';
import { drawingFlags } from './drawing-plan.mjs';
import { subjectMediumOf, drawingForSubject, argvForSubject } from './subject-medium.mjs';

const DEFAULT_RECIPE = 'default';

// Generic watercolor methods: paper, palette, paint order, layers, drawing and film.
const METHOD_FLAGS = '--palettewide 1 --physical 1 --paperbase source --loadedcontact 1 --order painter --brushchoice 0 --midlayers 4 --paperrel 1 --paperlights 1 --paperrgb auto --paper coldpress --paperphysical 1 --layerhue 1 --drawing both --sourcelines 0 --linesource none --frames 8 --markcadence 8 --marks 1 --subjectseam 0.5 --smallmarks 1 --smallmarklights 0 --washjoin 1 --undercover 0';
// Planes painted as shaped marks.
const TECHNIQUE_FLAGS = '--shapedmarks 1';


// The pen-and-wash washes as tuned by eye on Flatiron and Yale: every passage flooded wet in wet, 60% of
// the picture kept as light, strong shadow (0.6) and deep (1.2) glazes read from a finer value map, coloured lights in the local
// wash, a capped local mix fitted for hue (pen-wash-plan.mjs, pen-wash.mjs), sparser small marks (pen-wash-lines.mjs)
// and closer mop lanes with no overhang, so a flooded wash edge is smooth rather than sawtoothed. A deeper sky, one
// connected shadow wash and a green foliage wash each won an advisor panel A/B.
// --pwdeepcontrast and --pwpenvary stay off: judged in both orders they showed no win.
const PENWASH_STAGE_FLAGS = '--penwashplan stages --pwwhitemm 2.5 --pwfinemm 2.5 --pwholemm2 40 --pwshadowpiece 0.015 --pwdrygain 0.6 --pwsoftgrad 30';
const PENWASH_FLAGS = '--pwallwet 1 --pwminlight 0.6 --pwlightness 0.7 --pwshadowmin 0.6 --pwdeepmin 1.2 --pwshadowblur 0.8 --pwhuegap 18 --pwdarkhuegap 10 --pwlightchroma 14 --pwlocalmax 0.22 --pwcaplweight 0.3 --pwchroma 1.25 --pwmonolocal warm:0.7,cool:0.15,earth:0.15 --pwtileink 5 --pwkeep 0.4 --pwspeck 1.2 --mopgap 0.6 --mopover 0 --pwsky 0.2 --pwskyto 0.6 --pwshadowone 4 --pwfoliage 5 --pwfoliagemax 0.5 --pwkeeplights 10';
const RECIPES = {
  general: [METHOD_FLAGS, TECHNIQUE_FLAGS, '--drawing first'].join(' '),
  default: [METHOD_FLAGS, TECHNIQUE_FLAGS, '--drawing first'].join(' '),
  combined: [METHOD_FLAGS, TECHNIQUE_FLAGS, '--drawing first'].join(' '),
  penwash: [METHOD_FLAGS, '--drawing first --penwash 1 --order ladder --paperlights 0 --paperrel 0 --smalllights 0 --midlayers 0 --shapedmarks 0 --palettewide 1 --pwmin 2 --pwmax 3', PENWASH_FLAGS, PENWASH_STAGE_FLAGS].join(' '),
};

// `--style penwash` names the pen-and-wash recipe. A numeric --style (a styled target, 0..1) passes through.
export function styleAlias(argv) {
  const at = argv.lastIndexOf('--style');
  if (at < 0 || argv[at + 1] !== 'penwash') return argv;
  const recipe = argv.lastIndexOf('--recipe');
  if (recipe >= 0 && !['penwash', 'default'].includes(argv[recipe + 1])) throw new Error(`--style penwash conflicts with --recipe ${argv[recipe + 1]}`);
  const drop = new Set([at, at + 1, ...(recipe >= 0 ? [recipe, recipe + 1] : [])]);
  const rest = argv.filter((_, i) => !drop.has(i));
  return ['--recipe', 'penwash', ...rest];
}

// The value plan the command line names, or null when there is none.
export function readPlan(argv, root) {
  const at = argv.lastIndexOf('--valueplan');
  if (at < 0 || !argv[at + 1]) return null;
  try {
    return JSON.parse(fs.readFileSync(path.resolve(root, argv[at + 1]), 'utf8'));
  } catch (e) {
    throw new Error(`--valueplan ${argv[at + 1]}: ${e.message}`);
  }
}

// Presets were named sets of flags fitted to one benchmark subject (the architecture preset, fitted on Trumbull). They
// were removed in 0.3.3 with the rules they switched on; a plan or recipe that still names one fails the run.
function refusePresets(plan, typed) {
  const names = [...(plan?.presets ?? []), ...typed];
  if (names.length) throw new Error(`presets were removed (they held settings fitted to one subject): ${names.join(', ')}`);
}

// The sheet settings a value plan declares: widthMm must match --sheetmm when both are given; seed and targetGuard
// supply defaults that the command line can override.
function planSheet(plan, argv) {
  const s = plan?.sheet;
  if (s == null) return [];
  if (typeof s !== 'object' || Array.isArray(s)) throw new Error('value plan sheet: expected an object');
  const out = [];
  if (s.widthMm != null) {
    if (typeof s.widthMm !== 'number' || !Number.isFinite(s.widthMm) || s.widthMm <= 0) {
      throw new Error('value plan sheet.widthMm: expected a positive number');
    }
    const at = argv.lastIndexOf('--sheetmm');
    if (at >= 0) {
      const given = Number(argv[at + 1]);
      if (!Number.isFinite(given) || Math.abs(given - s.widthMm) > 1e-6) {
        throw new Error(`value plan sheet.widthMm ${s.widthMm} does not match --sheetmm ${argv[at + 1]}`);
      }
    } else {
      out.push('--sheetmm', String(s.widthMm));
    }
  }
  if (s.seed != null) {
    if (!Number.isInteger(s.seed)) throw new Error('value plan sheet.seed: expected an integer');
    if (!argv.includes('--seed')) out.push('--seed', String(s.seed));
  }
  if (s.targetGuard != null) {
    if (typeof s.targetGuard !== 'string' || !s.targetGuard) throw new Error('value plan sheet.targetGuard: expected a guard mode');
    if (!argv.includes('--targetguard')) out.push('--targetguard', s.targetGuard);
  }
  return out;
}

// The command line with the recipe's flags and the plan's drawing flags in front of it, and the line to log about the
// choice. No --recipe means the default recipe, except on an --areaplan run. An unknown recipe name or any preset
// throws. With recipe none, the plan overrides the harness template.
// --subjectmedium none|pencil: an ink drawing, from the plan or the command line, becomes a graphite preparatory drawing
// (subject-medium.mjs). `subjectMedium` in the result says what was asked for when that happened.
export function expandRecipe({ argv: given0, root = process.cwd() }) {
  const medium = subjectMediumOf(given0);
  const written = readPlan(styleAlias(given0), root), forSubject = drawingForSubject(written?.drawing ?? null, medium);
  const r = expandFor({ argv: given0, plan: forSubject.asked ? { ...written, drawing: forSubject.drawing } : written });
  const fitted = argvForSubject(r.argv, medium, { planAsked: forSubject.asked }), asked = fitted.asked;
  return { ...r, argv: fitted.argv, subjectMedium: asked ? { medium, asked, dropped: fitted.dropped } : null };
}

function expandFor({ argv: given0, plan }) {
  const argv = styleAlias(given0);
  let drawing = drawingFlags(plan?.drawing ?? null);
  const at = argv.lastIndexOf('--recipe');
  const [given, ...typed] = at < 0 ? [argv.includes('--areaplan') ? 'none' : DEFAULT_RECIPE] : String(argv[at + 1]).split('+');
  const name = given === 'none' && at < 0 ? null : given;
  const combined = ['default', 'combined', 'general'].includes(name);
  const hasWashPlan = Boolean(plan && (plan.washes || (plan.order && typeof plan.order === 'object' && !Array.isArray(plan.order)) || plan.subjectOrder));
  const pipeline = (combined || (name === 'none' && hasWashPlan)) ? pipelineFlags(plan ?? {}, { onlyAuthored: name === 'none' }) : null;
  const washFlags = (name === 'none' && hasWashPlan && pipeline) ? pipeline.flags : [];
  if (combined && pipeline) drawing = pipeline.flags;
  else if (washFlags.length) drawing = [];
  refusePresets(plan, typed);
  const sheet = planSheet(plan, argv);
  const tail = [...sheet, ...drawing];
  const describe = note => [note, plan?.drawing ? 'drawing from the plan' : null].filter(Boolean).join(', ');
  if (name === null) return tail.length ? { argv: [...tail, ...argv], note: describe('no recipe') } : { argv, note: null };
  if (name === 'none') {
    const expanded = [...argv, ...washFlags, ...tail];
    const values = new Map();
    for (let i = 0; i < expanded.length;) {
      const key = expanded[i++];
      const value = i < expanded.length && !expanded[i].startsWith('--') ? expanded[i++] : undefined;
      if (key === '--physics' && values.has(key)) {
        const fields = new Map(values.get(key).split(',').map(s => s.split('=')));
        for (const kv of value.split(',')) { const [k, v] = kv.split('='); fields.set(k, v); }
        values.set(key, [...fields].map(([k, v]) => `${k}=${v}`).join(','));
      } else values.set(key, value);
    }
    return { argv: [...values].flatMap(([key, value]) => value === undefined ? [key] : [key, value]), note: describe('recipe none'), pipeline: pipeline?.plan ?? null };
  }
  const preset = RECIPES[name];
  if (!Object.hasOwn(RECIPES, name)) throw new Error(`unknown recipe ${name}`);
  const flags = preset.split(' ');
  // Pen-and-wash uses its source-toned sheet and a lean wash palette. Methods meant for colorful paintings should not
  // recolor sepia studies.
  if (combined && plan?.styleSelection?.style === 'ink-and-wash') {
    const inkWash = {'--palettewide':'0', '--boxpick':'0', '--paperrgb':'source', '--strokeplan':'1', '--laneadapt':'1'};
    for (const [flag, value] of Object.entries(inkWash)) {
      const at = flags.indexOf(flag);
      if (at >= 0) flags[at + 1] = value; else flags.push(flag, value);
    }
  }
  const expanded = [...flags, ...tail, ...argv];
  // Collapse scalar options once. A CLI physics override merges named coefficients.
  const values = new Map();
  for (let i=0;i<expanded.length;) {
    const key=expanded[i++];
    const value = i < expanded.length && !expanded[i].startsWith('--') ? expanded[i++] : undefined;
    if (combined && key === '--physics' && values.has(key)) {
      const fields = new Map(values.get(key).split(',').map(s=>s.split('=')));
      for (const kv of value.split(',')) {const [k,v]=kv.split('='); fields.set(k,v);}
      values.set(key,[...fields].map(([k,v])=>`${k}=${v}`).join(','));
    } else values.set(key,value);
  }
  return { argv: [...values].flatMap(([key, value]) => value === undefined ? [key] : [key, value]), note: describe(`recipe ${name}`), pipeline: pipeline?.plan ?? null };
}
