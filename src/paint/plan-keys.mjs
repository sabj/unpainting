// Value plan keys (--valueplan): every key the painter reads, so a key it would ignore is reported, not silently
// dropped. Three "plan" Mittens controls once matched the control byte for byte because the code they ran on read none
// of their new keys (washes.paints, darkGain, deepAccent).
//
// The tree below lists the keys and where they are read. `washes` and `order` are read only by the combined recipe
// (src/paint/pipeline-plan.mjs, recipe default/combined/general); under another recipe they count as unused. NOTES are
// text for people that the plan format keeps on purpose (docs/plan-format.md); they never change the painting and are
// not reported. Anything else is unused: the run logs it, writes unused-plan-keys.txt and exits 3 after its outputs,
// as unused command-line options do. --allowunusedplan 1 keeps the exit code.
//
// A key added to a plan consumer must be added here too; src/paint/plan-keys.test.mjs checks the documented and
// bundled plans against this tree.
import fs from 'node:fs';
import path from 'node:path';

const ANY = true;
// an array whose entries all have this shape
const list = shape => ({ '[]': shape });
// an object keyed by names the plan chooses (family ids), each with this shape
const named = shape => ({ '*': shape });

// src/paint/methods/subject-order.mjs readSubjectOrder
const SUBJECT = { id: ANY, families: ANY, bounds: ANY };
// src/paint/methods/finish-texture.mjs finishTexture, through --finishhatch and --finishfur
const TEXTURE = { bounds: ANY, budget: ANY, spacing: ANY, minDensity: ANY, reserveBelow: ANY };

// src/paint/drawing-plan.mjs drawingFlags
const DRAWING = {
  medium: ANY, inkColor: ANY, ink: { color: ANY, waterproof: ANY }, linework: ANY, source: ANY, amount: ANY, lines: ANY, maxLines: ANY,
  weight: ANY, closingLines: ANY, resolution: ANY, map: ANY, mapSmoothing: ANY,
  stages: {
    prep: { amount: ANY, weight: ANY, fade: ANY, frames: ANY },
    prepInk: { from: ANY, keep: ANY, add: ANY, amount: ANY, deviate: ANY, method: ANY },
    finishInk: { from: ANY, select: ANY, restate: ANY, deviate: ANY, method: ANY, masses: ANY, hatch: TEXTURE, fur: TEXTURE },
  },
};

// src/paint/pipeline-plan.mjs resolvePipeline (combined recipe only)
const WASHES = {
  // src/paint/methods/finish-texture.mjs furLightReserves, through --furreserves
  furReserves: { bounds: ANY, reach: ANY, drop: ANY, dark: ANY, maxDensity: ANY, minCells: ANY },
  paints: ANY, darkGain: ANY, deepAccent: { max: ANY, grow: ANY, families: ANY },
  colour: ANY, sessions: ANY, inkAware: ANY, charge: ANY, carryMm: ANY, paleLimit: ANY,
  physics: { holeRimMm: ANY, marangoni: ANY, slope: ANY },
};

/** Every key the painter reads from a value plan. `pipeline`: whether the combined recipe reads washes and order. */
function planKeyTree({ pipeline }) {
  return {
    subject: ANY, // src/paint/recipe.mjs, src/paint/styles/loader.mjs, light-to-dark.mjs
    presets: ANY, // src/paint/recipe.mjs planPresets
    name: ANY, photo: ANY, // tools/painter/value-plan-preview.mjs
    sheet: { widthMm: ANY, seed: ANY, targetGuard: ANY }, // src/paint/recipe.mjs planSheet; tools/paint-plate.mjs --sheetmm
    // light-to-dark.mjs, target-regions.mjs, subject-order.mjs; referenceCue and baseMove describe the target regions
    families: list({ id: ANY, bounds: ANY, referenceCue: ANY, baseMove: ANY }),
    reserves: list({ bounds: ANY, reason: ANY }), // light-to-dark.mjs; tools/paint-plate.mjs resists
    styleSelection: { style: ANY, reason: ANY, regions: named({ style: ANY, reason: ANY }) }, // src/paint/styles/loader.mjs
    view: { wholeOf: ANY }, // tools/paint-plate.mjs --cellfamilies default
    subjectOrder: list(SUBJECT),
    drawing: DRAWING,
    ...(pipeline ? { washes: WASHES, order: { subjects: list(SUBJECT), strength: ANY } } : {}),
  };
}

// Text for people, kept by the plan format and read by no painter code: never reported. drawingNote and run are the
// notes examples/plans/white-ships.json keeps on how its lines and painting were made.
const NOTES = Object.freeze(['rationale', 'drawingNote', 'run', 'subjectOrder[].reason', 'order.subjects[].reason']);

const isObject = v => v != null && typeof v === 'object' && !Array.isArray(v);

function walk(value, shape, at, found) {
  if (shape === ANY || value == null) return;
  if (shape['[]']) {
    if (Array.isArray(value)) for (const v of value) walk(v, shape['[]'], `${at}[]`, found);
    return;
  }
  if (!isObject(value)) return; // a wrong type is its consumer's error to raise
  for (const [k, v] of Object.entries(value)) {
    const sub = shape['*'] ?? shape[k], key = at ? `${at}.${k}` : k;
    if (sub === undefined) { if (!NOTES.includes(key)) found.add(key); continue; }
    walk(v, sub, key, found);
  }
}

/** The plan's keys the painter reads nowhere, as paths (families[].texture), in plan order. */
export function unusedPlanKeys(plan, { pipeline }) {
  if (!isObject(plan)) return [];
  const found = new Set();
  walk(plan, planKeyTree({ pipeline }), '', found);
  return [...found];
}

/**
 * Checks the --valueplan file and reports what nothing reads: logs it now and again at exit, writes
 * unused-plan-keys.txt in `out`, and makes the run exit 3 unless `allow`. Returns the unused paths.
 */
export function reportUnusedPlanKeys({ file, pipeline, out, allow = false, log = console.log }) {
  const unused = unusedPlanKeys(JSON.parse(fs.readFileSync(file, 'utf8')), { pipeline });
  if (!unused.length) return unused;
  const line = `UNUSED PLAN KEYS (read by nothing in this run${pipeline ? '' : '; washes and order need the combined recipe'}): ${unused.join(' ')}${allow ? '' : '; the run exits 3, --allowunusedplan 1 allows them'}`;
  fs.writeFileSync(path.join(out, 'unused-plan-keys.txt'), unused.join('\n') + '\n');
  log(line);
  process.on('exit', () => { log(line); if (!allow && !process.exitCode) process.exitCode = 3; });
  return unused;
}
