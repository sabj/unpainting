# Methods, techniques and tuned settings

The painter's code in `src/paint/` is grouped by purpose. This page is an index: one line per item. Each module's header comment has the detail and the flags it reads.

The default recipe (`src/paint/recipe.mjs`) is a preset of painter settings put in front of the command line. A flag typed after it wins. `--recipe none` turns it off. `default`, `general` and `combined` are the same process.

## What a painting is made from

- A drawing file (`--drawingfile`): the lines the pen or pencil lays, as they are.
- One or more block-in studies (`--washplan`): the washes.

The painter decides the shapes, the mixes, the brush for each shape, wet or dry, charging in and drying, from the study and its own rules. [Running the painter](running.md#your-own-image) has the commands.

## Default recipe flags

- `--physical 1`: brush sizes, water and loads from real brushes (`src/paint/brushes.json`).
- `--palettewide 1`: palette paints chosen per area of the picture.
- `--paperbase source`, `--paperrgb auto`: the paper colour from the target's own sheet.
- `--paper coldpress`, `--paperphysical 1`: cold-press tooth, fibre and relief in millimetres.
- `--loadedcontact 1`: a loaded brush touches the paper's pits too.
- `--drawing first`: the drawing goes down before the washes.
- `--frames 8`, `--marks 1`: about 8 recorded wash frames, and every stroke in `marks.json`.
- `--shapedmarks 1`: shaped plane marks (`src/paint/techniques/shaped-marks.mjs`).

## Washes

In `src/paint/methods/` unless noted:

- `study-washes.mjs`: the wash plan read from the block-in studies. Shapes, order (lightest and largest first, a darker wash nested in a lighter one once it is dry, small darks last), lanes, charges dropped in while wet, and the coarse-to-fine stack.
- `study-shapes.mjs`: a study's shapes, rounded to a brush.
- `tools/painter/study-load.mjs`: registers a study to the sheet; a study of the wrong shape stops the run.
- `sweep-fill.mjs`: a shape filled with parallel, overlapping sweeps that carry the wet edge down.
- `wash-strokes.mjs`: a wash as an outline in millimetres and brush strokes inside it.
- `puddles.mjs`: the mix a brush is loaded with for one wash.
- `lay.mjs`, `mop-lanes.mjs`: one passage from one well, in sweeps; a mop's lanes.
- `scrap-swatch.mjs`: the loaded brush tried on a scrap of the same paper; the passage is charged by what the scrap held.
- `brushes.mjs`, `brush-footprint.mjs`: brushes sized from real ones, and loads split where the water runs out.
- `wetdry.mjs`, `prewet-order.mjs`: holding a stroke until its paper is dry or damp enough, and when a wet bed's clean water goes down.
- `tools/painter/wet-bed-prep.mjs`, `tools/painter/wet-bed-wait.mjs`: wetting a wet-into-wet bed, and waiting for the shine to go off before charging it.
- `src/paint/techniques/soften-lift.mjs`, `tools/painter/soften-lift-run.mjs`: a clean damp brush along a wash's soft edge while it is wet.
- `src/paint/techniques/passage-plan.mjs`: passage moves (`wet on wet`, `wet on dry`, `dry brush` and their aliases).
- `pigment-physics.mjs`: settling, granulation, flocculation and staining per paint.
- `paper-colour.mjs`, `sheet-tone.mjs`: the sheet's colour, and an optional toning stage (`--tonestage`).

## Drawing

In `src/paint/methods/` unless noted:

- `src/paint/line-source.mjs`: the one line source, the drawing file. With none it prints `!!! NO LINE`.
- `drawing-registration.mjs`: maps a line file's image box onto the target.
- `drawing-file.mjs`, `drawing-hand.mjs`, `stroke-order.mjs`: the strokes of the file, chained, ordered and tapered as a hand draws them.
- `pencil-hand.mjs`, `pencil-line.mjs`, `pencil-stage.mjs`, `pencil-erase.mjs`: the pencil drawing, its growth over frames and the erasing in the lights.
- `drawing-stages.mjs`, `linework-plan.mjs`: the linked stages (`prep`, `prepInk`, `finishInk`) cut from the drawing file.
- `drawing-stages-auto.mjs`, `drawing-choice.mjs`, `drawing-planner.mjs`: the stages chosen per picture (`--drawingstages auto`).
- `medium-decision.mjs`, `outline-medium.mjs`, `pen-share.mjs`, `src/paint/subject-medium.mjs`: ink or pencil.
- `ink-lines-file.mjs`, `ink-lines.mjs`: the target's own line darkness, read once before painting.
- `ink-match.mjs`, `ink-scrap.mjs`: the ink load set from a test line on scrap (`--inkdarkmatch`, `--inkdarkcap`).
- `ink-recipe.mjs`: `--inkrecipe wash` and `v2`, sets of ink flags.
- `ink-res.mjs`, `fine-material.mjs`: the pen on a finer sheet (`--inkres N`).
- `material-profiles.mjs`, `ink-hue.mjs`: ink and graphite materials, and the ink's colour.

Other modules in these folders are helpers; each header says what reads it.

`--holefill` and `--holerim` work around a known drying weakness. They are off by default. See [open problems](future-ideas.md#edge-drying-that-knows-how-much-water-there-is).

## Tuned settings

Sam's rule (0.3.3): a constant, rule, option or technique fitted to one benchmark subject is cheating in both painting modes. Every such item was removed in 0.3.3: the `architecture` preset and the `"presets"` plan key, the `v096` recipe, the Trumbull rules, the per-subject bench switch, the curly-dog-coat technique, the mass planner, registered anatomy polygons and the beach scene's finders. A plan or recipe that names one fails the run.

`tools/guard/subject-scan.mjs` fails `npm test` (through `src/paint/overfit-scan.test.mjs`) when any JavaScript or Python file under `src/` or `tools/` names a benchmark subject outside tests, fixtures and the reviewed lists in `tools/guard/subject-scan-allow.json`. `src/paint/overfit.test.mjs` fails on any folder or file under `src/`, `tools/` or `bench/scripts` named tuned, fitted or per-subject.

## Opt-in experimental controls

- `--pigphys 1`: settling, granulation and flocculation per pigment. `--flocblue`, `--flocgrey`, `--flocviolet`, `--flocearth` and `--flocyellow` take 0 to 1 and override one colour family. The families are absorption-channel heuristics, not chemical measurements.
- `--tonestage 1`: records a paper-colour choice before drawing. `auto` also detects warm source paper. It lays no pigment.

Methods removed in 0.4 are listed in [Running the painter](running.md#removed-in-04).
