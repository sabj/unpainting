// --recipe: a named preset of flags put in front of the command line, then the value plan's drawing flags. A flag
// given on the command line still wins, since the last of a repeated flag is the one read.
//
// default: light-to-dark value planning with shaped marks, four middle layers, sky lanes, two touch-up rounds and a
// drawing first and last, on physical cold-press paper. The plan's drawing section chooses the medium, amount and
// weight of that drawing (drawing-plan.mjs); without one the painter picks graphite or ink from the image. The subject's own inputs stay on the command line:
// --valueplan, --drawingfile, --drawinglast and --sheetmm. --recipe none paints with the bare defaults, as does an
// --areaplan run that names no recipe.
//
// person: opening ink and closing accents, with segment washes and shape controls. It leaves --order at painter,
// so the value planner replaces the legacy ladder with five light-to-dark bands.
import fs from 'node:fs';
import path from 'node:path';
import { TRUMBULL_PAINTS, TRUMBULL_SUBJECTS } from './tuned/trumbull.mjs';
import { TUNED_DEFAULT_FLAGS } from './tuned/default-flags.mjs';
import { drawingFlags } from './drawing-plan.mjs';

const DEFAULT_RECIPE = 'default';

const ALIASES = { v096: 'default' };

// Generic watercolor methods: paper, palette, paint order, layers, drawing and film.
const METHOD_FLAGS = '--palettewide 1 --physical 1 --paperbase source --loadedcontact 1 --order painter --brushchoice 0 --midlayers 4 --paperrel 1 --paperlights 1 --paperrgb auto --paper coldpress --paperphysical 1 --texture 0 --touchpoints 2 --shadowraw 1 --layerhue 1 --drawing both --frames 8 --marks 1';
// Targeted techniques: planes painted as shaped marks, and skies as horizontal lanes in a granulating blue.
const TECHNIQUE_FLAGS = '--shapedmarks 1 --skylanes 1 --skyblue 1 --skysplit 1';

const RECIPES = {
  default: [METHOD_FLAGS, TECHNIQUE_FLAGS, TUNED_DEFAULT_FLAGS].join(' '),
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

// The command line with the recipe's flags and the plan's drawing flags in front of it, and the line to log about the
// choice. No --recipe means the default recipe, except on an --areaplan run. An unknown name adds no recipe flags.
export function expandRecipe({ argv, root = process.cwd() }) {
  const plan = readPlan(argv, root);
  const drawing = drawingFlags(plan?.drawing ?? null);
  const withPlan = (flags, note) => ({ argv: [...flags, ...drawing, ...argv], note: drawing.length ? `${note}, drawing from the plan` : note });
  const at = argv.lastIndexOf('--recipe');
  if (at < 0 && argv.includes('--areaplan')) return drawing.length ? withPlan([], 'no recipe') : { argv, note: null };
  const given = at < 0 ? DEFAULT_RECIPE : argv[at + 1];
  const name = ALIASES[given] ?? given;
  if (name === 'none') return withPlan([], 'recipe none');
  const preset = RECIPES[name];
  if (!preset) return withPlan([], `recipe ${name} (unknown, ignored)`);
  const flags = preset.split(' ');
  if (name === 'default' && !argv.includes('--paints') && TRUMBULL_SUBJECTS.has(plan?.subject ?? null)) flags.push('--paints', TRUMBULL_PAINTS);
  return withPlan(flags, `recipe ${name}`);
}
