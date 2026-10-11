// --recipe: a named preset of flags put in front of the command line, then the presets the value plan opts into, then
// the value plan's drawing flags. A flag given on the command line still wins, since the last of a repeated flag is
// the one read.
//
// default, combined, general: one general process, adjusted through drawing, washes and order.
// v096: historical fitted recipe. CLI options override plan choices.
import fs from 'node:fs';
import path from 'node:path';
import { TUNED_DEFAULT_FLAGS } from './tuned/default-flags.mjs';
import { presetFlags, v096PresetsFor } from './tuned/presets.mjs';
import { pipelineFlags } from './pipeline-plan.mjs';
import { drawingFlags } from './drawing-plan.mjs';

const DEFAULT_RECIPE = 'default';

// Generic watercolor methods: paper, palette, paint order, layers, drawing and film.
const METHOD_FLAGS = '--palettewide 1 --physical 1 --paperbase source --loadedcontact 1 --order painter --brushchoice 0 --midlayers 4 --paperrel 1 --paperlights 1 --paperrgb auto --paper coldpress --paperphysical 1 --texture 0 --touchpoints 2 --finaldarks 0 --layerhue 1 --drawing both --sourcelines 0 --linesource none --frames 8 --marks 1';
// Clean colour (light-to-dark.mjs): first washes and middle layers mixed per colour family, saturated and muted
// families apart, each passage charged at its median with the rest carried to the next band, carried glazes placed at
// brush scale, and pale planes kept to one wash.
const CLEAN_COLOUR_FLAGS = '--huechroma 30 --passcap 0.5 --maskmm 2 --lightfamilies 1 --palelights 0.16';
// Planes painted as shaped marks.
const TECHNIQUE_FLAGS = '--shapedmarks 1';

// V096 as it was: the methods with --shadowraw, shaped marks and sky lanes, then the tuned flags.
const V096_METHOD_FLAGS = '--palettewide 1 --physical 1 --paperbase source --loadedcontact 1 --order painter --brushchoice 0 --midlayers 4 --paperrel 1 --paperlights 1 --paperrgb auto --paper coldpress --paperphysical 1 --texture 0 --touchpoints 2 --shadowraw 1 --layerhue 1 --drawing both --frames 8 --marks 1';
const V096_TECHNIQUE_FLAGS = '--shapedmarks 1 --skylanes 1 --skyblue 1 --skysplit 1';

const RECIPES = {
  general: [METHOD_FLAGS, CLEAN_COLOUR_FLAGS, TECHNIQUE_FLAGS].join(' '),
  default: [METHOD_FLAGS, TECHNIQUE_FLAGS, '--drawing first'].join(' '),
  combined: [METHOD_FLAGS, TECHNIQUE_FLAGS, '--drawing first'].join(' '),
  v096: [V096_METHOD_FLAGS, V096_TECHNIQUE_FLAGS, TUNED_DEFAULT_FLAGS].join(' '),
  person: '--masses 8 --masscap 0.15 --massload 0.5 --masswet 99 --mopgap 1.3 --masspaper 0.12 --massfeather 0.4 --massmaxlevel 1 --segwash 1 --segwashes 1 --pigphys 1 --gran 0.08 --skipheld 0.15 --skipheldmin 0.01 --whitefloor 1.0 --resistmin 0.002 --smalllights frisket --drawing both --inkfilter 1 --inktiers 1 --outlinemedium ink --segink 1 --tier3 0.15 --mllines 1 --contain 0 --cutin 0 --maxvalues 4 --minshape 80 --shapes 3 --shapedeep 1.6 --shapequant 0.6 --shapeload 0.7 --ladderseg 0.5 --boxpick 0 --texture 0 --washgrain 0.15 --marks 1',
};

// The value plan the command line names, or null when there is none.
function readPlan(argv, root) {
  const at = argv.lastIndexOf('--valueplan');
  if (at < 0 || !argv[at + 1]) return null;
  try {
    return JSON.parse(fs.readFileSync(path.resolve(root, argv[at + 1]), 'utf8'));
  } catch (e) {
    throw new Error(`--valueplan ${argv[at + 1]}: ${e.message}`);
  }
}

// The preset names a plan opts into, checked.
function planPresets(plan) {
  const names = plan?.presets ?? [];
  if (!Array.isArray(names) || names.some(n => typeof n !== 'string')) throw new Error('value plan presets: a list of preset names');
  return names;
}

// Preset flags, less any flag the command line gives itself, so a typed flag is never repeated by a preset.
function presetArgv(names, argv) {
  const flags = presetFlags(names), out = [];
  for (let i = 0; i < flags.length; i += 2) if (!argv.includes(flags[i])) out.push(flags[i], flags[i + 1]);
  return out;
}

// The command line with the recipe's flags, the presets' flags and the plan's drawing flags in front of it, and the
// line to log about the choice. No --recipe means the default recipe, except on an --areaplan run. An unknown recipe
// name adds no recipe flags; an unknown preset name throws.
export function expandRecipe({ argv, root = process.cwd() }) {
  const plan = readPlan(argv, root);
  let drawing = drawingFlags(plan?.drawing ?? null);
  const at = argv.lastIndexOf('--recipe');
  const [given, ...typed] = at < 0 ? [argv.includes('--areaplan') ? 'none' : DEFAULT_RECIPE] : String(argv[at + 1]).split('+');
  const name = given === 'none' && at < 0 ? null : given;
  const combined = ['default', 'combined', 'general'].includes(name);
  const pipeline = combined ? pipelineFlags(plan ?? {}) : null;
  if (pipeline) drawing = pipeline.flags;
  const presets = [...new Set([...(name === 'v096' ? v096PresetsFor(plan?.subject ?? null) : []), ...planPresets(plan), ...typed])];
  const extra = presetArgv(presets, argv);
  const tail = [...extra, ...drawing];
  const describe = note => [note, presets.length ? `presets ${presets.join(', ')}` : null, plan?.drawing ? 'drawing from the plan' : null].filter(Boolean).join(', ');
  if (name === null) return tail.length ? { argv: [...tail, ...argv], note: describe('no recipe') } : { argv, note: null };
  if (name === 'none') return { argv: [...tail, ...argv], note: describe('recipe none') };
  const preset = RECIPES[name];
  if (!preset) return { argv: [...tail, ...argv], note: describe(`recipe ${name} (unknown, ignored)`) };
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
  for (let i=0;i<expanded.length;i+=2) {
    const key=expanded[i], value=expanded[i+1];
    if (combined && key === '--physics' && values.has(key)) {
      const fields = new Map(values.get(key).split(',').map(s=>s.split('=')));
      for (const kv of value.split(',')) {const [k,v]=kv.split('='); fields.set(k,v);}
      values.set(key,[...fields].map(([k,v])=>`${k}=${v}`).join(','));
    } else values.set(key,value);
  }
  return { argv: [...values].flat(), note: describe(`recipe ${name}`), pipeline: pipeline?.plan ?? null };
}
