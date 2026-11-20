// --recipe: a named set of flags put in front of the command line, then the value plan's drawing flags. Typed flags
// win for named recipes; with --recipe none, the plan's drawing overrides harness template flags. The last occurrence of a repeated flag is read.
//
// default, combined, general: one general process, adjusted through drawing, washes and order.
// The pen-and-wash recipe (penwash, --style penwash) planned its washes from a value map of the subject; it was removed
// in 0.4 (last at commit 49447027). A prepared ink drawing with a study wash plan is the pen and wash now.
import fs from 'node:fs';
import path from 'node:path';
import { pipelineFlags } from './pipeline-plan.mjs';
import { drawingFlags } from './drawing-plan.mjs';
import { subjectMediumOf, drawingForSubject, argvForSubject } from './subject-medium.mjs';

const DEFAULT_RECIPE = 'default';

// Generic watercolor methods: paper, palette, paint order, layers, drawing and film.
const METHOD_FLAGS = '--palettewide 1 --physical 1 --paperbase source --loadedcontact 1 --order painter --paperrgb auto --paper coldpress --paperphysical 1 --drawing both --frames 8 --markcadence 8 --marks 1 --subjectseam 0.5 --undercover 0';
// Planes painted as shaped marks.
const TECHNIQUE_FLAGS = '--shapedmarks 1';


const RECIPES = {
  general: [METHOD_FLAGS, TECHNIQUE_FLAGS, '--drawing first'].join(' '),
  default: [METHOD_FLAGS, TECHNIQUE_FLAGS, '--drawing first'].join(' '),
  combined: [METHOD_FLAGS, TECHNIQUE_FLAGS, '--drawing first'].join(' '),
};

// `--style penwash` named the pen-and-wash recipe, removed in 0.4. A numeric --style (a styled target, 0..1) passes through.
export function styleAlias(argv) {
  const at = argv.lastIndexOf('--style'), recipe = argv.lastIndexOf('--recipe');
  if ((at >= 0 && argv[at + 1] === 'penwash') || (recipe >= 0 && argv[recipe + 1] === 'penwash')) throw new Error('the penwash recipe (--style penwash, --recipe penwash) was removed in 0.4: its washes came from a value map of the subject (last at commit 49447027); give a prepared ink drawing and --washplan STUDY instead');
  return argv;
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

// A value plan that selects a style (styleSelection) asked for the light-to-dark value plan, the per-cell "printing press",
// removed in 0.4. The V4 and V5 benchmark tasks wrote such plans; they ran on 0.2.x and 0.3.x and replay from tag v0.3.2.
function refuseRemovedPlan(plan) {
  if (plan?.styleSelection != null) throw new Error('value plan styleSelection was removed in 0.4 with the light-to-dark value plan (last at commit 49447027). The V4 and V5 benchmark tasks that wrote it ran on 0.2.x and 0.3.x: check out tag v0.3.2 to replay them.');
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
  const written = readPlan(styleAlias(given0), root);
  refuseRemovedPlan(written);
  const forSubject = drawingForSubject(written?.drawing ?? null, medium);
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
