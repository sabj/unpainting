// --recipe: a named preset of flags put in front of the command line, then the presets the value plan opts into, then
// the value plan's drawing flags. A flag given on the command line still wins, since the last of a repeated flag is
// the one read.
//
// default, combined, general: one general process, adjusted through drawing, washes and order.
// v096: historical fitted recipe. CLI options override plan choices.
// penwash (also `--style penwash`): pen and wash. A prepared ink drawing first, pruned for line economy, then three to
// six simple transparent washes from a three-value plan (src/paint/methods/pen-wash-plan.mjs). No value ladder,
// touch-ups, closing pen or frisket; a limited palette comes from --paints.
import fs from 'node:fs';
import path from 'node:path';
import { TUNED_DEFAULT_FLAGS } from './tuned/default-flags.mjs';
import { presetFlags, v096PresetsFor } from './tuned/presets.mjs';
import { pipelineFlags } from './pipeline-plan.mjs';
import { drawingFlags } from './drawing-plan.mjs';

const DEFAULT_RECIPE = 'default';

// Generic watercolor methods: paper, palette, paint order, layers, drawing and film.
const METHOD_FLAGS = '--palettewide 1 --physical 1 --paperbase source --loadedcontact 1 --order painter --brushchoice 0 --midlayers 4 --paperrel 1 --paperlights 1 --paperrgb auto --paper coldpress --paperphysical 1 --texture 0 --touchpoints 2 --finaldarks 0 --layerhue 1 --drawing both --sourcelines 0 --linesource none --frames 8 --marks 1';
// Planes painted as shaped marks.
const TECHNIQUE_FLAGS = '--shapedmarks 1';

// V096 as it was: the methods with --shadowraw, shaped marks and sky lanes, then the tuned flags.
const V096_METHOD_FLAGS = '--palettewide 1 --physical 1 --paperbase source --loadedcontact 1 --order painter --brushchoice 0 --midlayers 4 --paperrel 1 --paperlights 1 --paperrgb auto --paper coldpress --paperphysical 1 --texture 0 --touchpoints 2 --shadowraw 1 --layerhue 1 --drawing both --frames 8 --marks 1';
const V096_TECHNIQUE_FLAGS = '--shapedmarks 1 --skylanes 1 --skyblue 1 --skysplit 1';

// The pen-and-wash washes as tuned by eye on Flatiron and Yale (2026-10-13): every passage flooded wet in wet, 70% of
// the picture kept as light, strong shadow (0.6) and deep (1.2) glazes read from a finer value map, coloured lights in the local
// wash, a capped local mix fitted for hue (pen-wash-plan.mjs, pen-wash.mjs), sparser small marks (pen-wash-lines.mjs)
// and closer mop lanes with no overhang, so a flooded wash edge is smooth rather than sawtoothed. A deeper sky, one
// connected shadow wash, a green foliage wash and the deep glaze by local contrast each won an advisor panel A/B
// (2026-10-13), as did pen weight that follows structure and the shadow side.
const PENWASH_FLAGS = '--pwallwet 1 --pwminlight 0.7 --pwlightness 0.85 --pwshadowmin 0.6 --pwdeepmin 1.2 --pwshadowblur 0.8 --pwhuegap 18 --pwdarkhuegap 10 --pwlightchroma 14 --pwlocalmax 0.3 --pwcaplweight 0.3 --pwchroma 1.25 --pwmonolocal warm:0.7,cool:0.15,earth:0.15 --pwtileink 5 --pwkeep 0.4 --pwspeck 1.2 --mopgap 0.6 --mopover 0 --pwsky 0.2 --pwskyto 0.6 --pwshadowone 4 --pwfoliage 5 --pwfoliagemax 0.5 --pwdeepcontrast 15 --pwpenvary 0.6';
const RECIPES = {
  general: [METHOD_FLAGS, TECHNIQUE_FLAGS, '--drawing first'].join(' '),
  default: [METHOD_FLAGS, TECHNIQUE_FLAGS, '--drawing first'].join(' '),
  combined: [METHOD_FLAGS, TECHNIQUE_FLAGS, '--drawing first'].join(' '),
  v096: [V096_METHOD_FLAGS, V096_TECHNIQUE_FLAGS, TUNED_DEFAULT_FLAGS].join(' '),
  penwash: [METHOD_FLAGS, '--drawing first --penwash 1 --penwashplan values --order ladder --touchpoints 0 --finaldarks 0 --paperlights 0 --paperrel 0 --smalllights 0 --midlayers 0 --shapedmarks 0 --palettewide 1 --pwmin 2 --pwmax 3', PENWASH_FLAGS].join(' '),
  person: '--masses 8 --masscap 0.15 --massload 0.5 --masswet 99 --mopgap 1.3 --masspaper 0.12 --massfeather 0.4 --massmaxlevel 1 --segwash 1 --segwashes 1 --pigphys 1 --gran 0.08 --skipheld 0.15 --skipheldmin 0.01 --whitefloor 1.0 --resistmin 0.002 --smalllights frisket --drawing both --inkfilter 1 --inktiers 1 --outlinemedium ink --segink 1 --tier3 0.15 --mllines 1 --contain 0 --cutin 0 --maxvalues 4 --minshape 80 --shapes 3 --shapedeep 1.6 --shapequant 0.6 --shapeload 0.7 --ladderseg 0.5 --boxpick 0 --texture 0 --washgrain 0.15 --marks 1',
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
export function expandRecipe({ argv: given0, root = process.cwd() }) {
  const argv = styleAlias(given0);
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
