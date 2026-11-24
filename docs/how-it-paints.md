# How it paints

The pipeline contract: for each stage, the files that do the work and the flags that control it. A pipeline change merges only with its update to this page (`tools/doc-paths.test.mjs` fails on a named file that does not exist).

A painting takes a target image, a drawing file and one or more block-in studies. The painter lays the drawing, lets it dry, then lays the washes the studies describe, light to dark, saving the sheet as it goes.

![Trumbull College: photograph, target, and the painting building from blank paper](img/hero-trumbull.webp)

## Rules at every stage

- Two modes. Default: the painter looks at the subject once a passage, at shape scale. Strict (`--notargetlooks 1`): no target reads after planning. Every score names its mode; the two are never compared or averaged.
- No gains and no subject-fitted values: a gain that covers an engine error, a constant fitted to one subject, or anything tuned to raise a score is banned in both modes. `tools/guard/subject-scan.mjs` (`src/paint/overfit-scan.test.mjs`) fails `npm test` if code under `src/` or `tools/` names a benchmark subject outside reviewed allowlists; `src/paint/overfit.test.mjs` fails on any file or folder named `tuned`, `fitted` or `per-subject`.
- Looking, colour checks, corrections and line drawing are art at brush and shape scale. Pixel by pixel, or with so many strokes that marks stop reading as brushwork, they are copying. Hill climbing is copying.
- Strokes per 100 cm² is reported with every score.
- The plan's inputs are the drawing file and the studies. The painter never extracts line from the subject or plans washes from it.
- Fail loudly. A missing Python environment, SAM checkpoint, line file, study or GPU stops the run. `npm run doctor` (`tools/doctor.mjs`, `src/paint/doctor.mjs`) checks them. A removed option stops the run with its reason (`src/paint/removed-options.mjs`).
- New logic goes in small modules under `src/` or `tools/` with unit tests, not into `tools/paint-plate.mjs` or `tools/plate/`.

## Default recipe

`src/paint/recipe.mjs` puts these flags first on the command line (`--recipe none` turns it off): `--physical 1` (physical brush sizes, water, loads: `src/paint/brushes.json`), `--palettewide 1`, `--paperbase source --paperrgb auto`, `--paper coldpress --paperphysical 1`, `--loadedcontact 1`, `--drawing first`, `--frames 8`, `--marks 1`, `--shapedmarks 1` (`src/paint/techniques/shaped-marks.mjs`).

## Code stages

`tools/paint-plate.mjs` runs seven stages in `tools/plate/`, sharing one `ctx`:

| Stage | File | Does |
|---|---|---|
| 1 | `tools/plate/setup.mjs` | options, source image, target guard, line source |
| 2 | `tools/plate/plan.mjs` | palette, medium, study wash plan |
| 3 | `tools/plate/sheet.mjs` | brushes, sheet, looks, marks, scrap swatches |
| 4 | `tools/plate/pen.mjs` | film frames, pen drawing plan |
| 5 | `tools/plate/drawing.mjs` | order of work, drawing passes |
| 6 | `tools/plate/paint.mjs` | paint loop |
| 7 | `tools/plate/finish.mjs` | lifting, closing pen, output files |

`tools/plate/load-order.mjs` fixes import order. A choice belongs in the plan (drawing file, studies, planner options), a technique in `src/paint/techniques/` or `src/paint/methods/`, a painter rule stated in painter terms, or the physics in `src/media/`.

## 1. Planning

An image model draws a clean line drawing; `tools/seg/trace-drawing.py` traces it and `tools/seg/order-strokes.mjs` orders it (`tools/seg/pencil-hand.mjs` for pencil), giving `--drawingfile STEM` ([line files](plan-format.md#line-files)). Another simplifies the subject into flat studies (`--washplan STUDY.png[:MIN[:glaze]],...`). Skills: `.agents/skills/painting-planner/SKILL.md`, `.agents/skills/watercolor-technique/SKILL.md`. Stroke plans run with `node tools/run-plan.mjs <file>` ([plan-format.md](plan-format.md)). `--valueplan` sets the sheet, drawing stages, paints and order (`src/paint/pipeline-plan.mjs`, written to `pipeline-plan.json`; unused keys exit 3, `src/paint/plan-keys.mjs`). `src/paint/run-methods.mjs` writes the line source, line file and studies to `run-card.json` (`src/paint/run-card.mjs`). Flags: `--drawingfile`, `--washplan`, `--paints`, `--sheetmm`, `--seed`, `--valueplan`.

## 2. Segmentation

`src/crop/segment-prep.mjs` runs `tools/seg/segments.py` (`tools/seg/sam_regions.py`) on the target before painting, cached by SHA-256 (`--segcache`); without SAM and its checkpoint the run fails (`--segments off` is for tests). `src/crop/segments.mjs` reads the regions. `PAINTER_SEG_DEVICE=mps|cpu|cuda` picks the device (default `mps`, then `cuda`, then `cpu`).

## 3. Shapes from the studies

`src/paint/methods/study-washes.mjs` builds the wash plan from the studies without reading the subject. `tools/painter/study-load.mjs` scales each study to the sheet (an aspect mismatch over 2% stops the run). Colours are clustered; connected components become shapes (`src/paint/methods/study-shapes.mjs`, `puddles.mjs`); slivers join a neighbour; near-white stays paper. Lightest and largest first, darker over dry washes, darkest accents last. A soft named form (face, fur, sky, water) starts with one pale base wash into clean water (`src/paint/methods/form-base.mjs`), except on line-led pen-and-wash works. Each later study adds only what is darker than the layers above it, over its `MIN` floor; a `glaze` layer lays a few connected dark glazes. Palette: `src/crop/palette.mjs`, `palettewide.mjs`, `pigments.mjs`, or `--paints`.

## 4. Technique per shape

| Technique | Code |
|---|---|
| Flat wash, wet on dry; first wash | `TECHNIQUES['wet on dry']`, `TECHNIQUES['first wash']`, `src/media/wash.mjs`, `src/paint/methods/sweep-fill.mjs` |
| Wet on wet: clean water first, then pigment | `TECHNIQUES['wet on wet']`, `tools/painter/wet-bed-prep.mjs`, `wet-bed-wait.mjs` |
| Graded wash | `--gradedwash`, `src/media/wash.mjs` |
| Glaze over dried, fixed paint | `TECHNIQUES.glazed`, `src/media/sheet.mjs` |
| Dry brush | `TECHNIQUES['dry brush']`, `src/media/brush.mjs` |
| Softened edge | `src/paint/techniques/soften-lift.mjs`, `tools/painter/soften-lift-run.mjs` |
| Masking, lifting, blotting | `applyResist`, `liftResist`, `blot` in `src/media/sheet.mjs` |

Move names are normalized in `src/paint/techniques/passage-plan.mjs`. Before a passage, the painter tests the loaded brush on a scrap of the same paper and calibrates the charge (`src/paint/methods/scrap-swatch.mjs`, `src/paint/methods/instrument-cal.mjs`).

## 5. Brush and strokes

Brushes: `src/media/brush.mjs`, `src/paint/brushes.json`, `src/paint/methods/brushes.mjs`. Paths: `src/paint/methods/sweep-fill.mjs`, `wash-strokes.mjs`, `lay.mjs`, `mop-lanes.mjs`, `src/media/wash.mjs`. Script washes (`src/paint/methods/script-marks.mjs`): lanes overlap by 30 to 55% of the brush width, pivot and bow like a wrist and arm (`--handlanes 1`, `--seed`). Loop and optics: `tools/plate/paint.mjs`, `src/paint/stroke-ledger.mjs`, `src/media/km.mjs`.

## 6. Wet physics and drying

Each cell tracks standing water, pore water, floating, settled and pore pigment ([pigments and paper](pigments-and-paper.md)).

![A real wash by Winslow Homer beside a simulated flat wash and graded wash on the default cold-press paper](img/paper-texture.webp)

![Four simulated paint effects: a flat wash, wet into wet, dry brush and a backrun](img/technique-washes.webp)

![Three transparent glazes, each dried before the next](img/glazes.webp)

Code: `src/media/paper.mjs`, `src/media/paper-relief.mjs`, `src/media/sheet.mjs` (`sheet-kernel.mjs` on CPU; `src/media/gpu/stepfull.mjs` and `stepfull.wgsl` on GPU), `src/paint/methods/wetdry.mjs`, `src/paint/methods/wash-session.mjs`, `src/media/checks.mjs`. `--strict 1` stops on a physics violation; otherwise `continued-checks.json` records it. Flags: `--paper`, `--paperphysical`, `--physics key=value`, `--strict`.

## 7. Looks

In default mode each passage reads the target once as it is laid, as its shape mean, and its charge is adjusted by the shape's deficit (`src/paint/methods/shape-deficit.mjs`, `--feedback`). In strict mode there are no reads and the charge is frozen at planning. `src/paint/step-backs.mjs` and `src/paint/painting-look.mjs` gate looks and write `step-backs.json`. The target guard (`tools/guard/no-target.mjs`, `tools/guard/seal-maps.mjs`) seals per-cell target maps when painting starts and writes `target-guard.json` ([honesty.md](honesty.md)).

Flags: `--notargetlooks`, `--targetguard`, `--lookbudget`, `--feedback`.

## 8. Lines

A pen drawing goes down first and dries before the washes. A pencil drawing goes down in phases (`src/paint/methods/drawing-phases.mjs`): lay-in lines before the first washes, each other line on dry paper just before the wash that needs it, unclaimed detail with the last stage. A model's script may time lines explicitly (`before`, `stage N`, `after`).

![A pen line that changes pressure and speed, fresh ink pulled with clean water, and ink drawn over a dried wash](img/technique-inking.webp)

Line source: `--drawingfile` (`src/paint/line-source.mjs`, `src/paint/methods/drawing-registration.mjs`, `src/paint/methods/ink-lines-file.mjs`). Only line darkness is read from the target ([ink.md](ink.md)). Film: `--video 1` films big forms first (`--drawingorder forms`, `--drawingfilm 0.2`, `src/paint/methods/drawing-film.mjs`). Hand and sheet: `src/paint/methods/drawing-file.mjs`, `drawing-hand.mjs`, `stroke-order.mjs`, `pencil-hand.mjs`, `pencil-line.mjs`, `ink-res.mjs`, `fine-erase.mjs`. Stages: `src/paint/methods/medium-decision.mjs`, `outline-medium.mjs`, `drawing-stages.mjs`. Flags: `--drawingfile`, `--drawinglast`, `--drawing first|last|both|none`, `--outlinemedium`, `--inkrecipe`, `--stages`.

## 9. Finish

`tools/plate/finish.mjs` runs lifting and the closing pen (after all washes and the final dry gate) and writes `painting.png`, `wash.jpg`, `ink.jpg`, `frames.json`, stage frames (`src/paint/film-timeline.mjs`), `run-card.json`, `target-guard.json`, `cheat-risk.json`, `marks.json`, census data (`tools/speed/census-write.mjs`) and `pipeline-plan.json`.

## 10. Eval

Scores a finished painting and its stages; nothing feeds back into the painter.

- Guard and copy risk: `tools/guard/cheat-risk.mjs`, `tools/guard/promote-check.mjs`, `tools/guard/lint-target-use.mjs` ([honesty.md](honesty.md)).
- Metrics and judges: `src/eval/`, `tools/judge/` ([judging.md](judging.md)).
- Strokes: `tools/stroke-gate.mjs`, `tools/stroke-stats.mjs` ([judging.md#stroke-sizes](judging.md#stroke-sizes)), `bench/scripts/copy-limits.mjs`.
- Benchmark scoring: [bench/docs/scoring.md](../bench/docs/scoring.md).
- `node tools/designed-paths-check.mjs <run-folder>` checks `bench/designed-paths.json`; exit 4 if execution evidence is missing.
