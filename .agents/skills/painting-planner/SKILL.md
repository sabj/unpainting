---
name: painting-planner
description: Plans a whole watercolor or ink-and-wash painting for the unpainting simulator, covering passages, techniques, layer order, ink drawing, glazes and checkpoints. Use before rendering a new painting, when writing or revising a plan or planner recipe, or when turning written style instructions into a plan. Load watercolor-technique alongside it for material decisions.
---

# Painting planner

Write the plan before rendering. Take material, moisture and density decisions from the [watercolor-technique skill](../watercolor-technique/SKILL.md). Stroke plans for `tools/run-plan.mjs` follow `docs/plan-format.md`.

For the image painter, the plan is its inputs ([running.md](../../../docs/running.md#your-own-image), [the V6 draft plan](../../../docs/plan-format.md#the-v6-draft-plan)):

- A drawing file. Ask an image model for a clean line drawing at the ink level you want, trace it with `tools/seg/trace-drawing.py` and order it with `tools/seg/order-strokes.mjs` (or `tools/seg/pencil-hand.mjs` for pencil). Pass it as `--drawingfile`. The painter draws its lines as they are.
- Block-in studies. Ask an image model for the subject simplified to flat shapes, lights left as paper: a coarse one for the first layer, richer ones later. Pass them as `--washplan STUDY.png[:MIN[:glaze]],...`.
- The medium, the paints (`--paints`), the sheet (`--sheetmm`) and when to stop.

The painter decides the shapes, mixes, brushes, wetness and charging from the studies. Look at each drawing and study before you use it.

## Workflow

Copy this checklist into the plan and tick it off:

```
- [ ] Record target, paper color, style, sheet size in mm and native density
- [ ] Choose ink, pencil or no drawing from the line the source shows
- [ ] Make and check the drawing file
- [ ] Make and check the studies, coarse to fine, with least size and glaze per layer
- [ ] Choose the paints
- [ ] Name the checkpoint that shows each stage's contribution
```

## Inputs

Start from the target and any structural reference. If earlier paintings or review notes shaped the plan, say which ones and what you took from them. Locate the areas that need detail at the simulation resolution and test a representative narrow feature at the planned native density.

## Passages

A passage is a wash or group of marks with one job. Value is how light or dark a color is.

For the image painter a passage is a shape in a study; use these notes to judge the study and the result. For a stroke plan, group forms by lighting, shape and material, and for each passage record:

- Intended appearance and target cue.
- Value range, local color and highlights kept free of dark paint.
- Hard, soft, broken and lost edges.
- Technique, brush width in mm, stroke direction and how the brush meets the paper.
- Paper moisture, brush water load and pigment concentration (defined in watercolor-technique).
- Layer order and the checkpoint that should show its contribution.

Connect adjacent regions when the target shows one wash or continuous shadow. Keep surfaces with different lighting distinct.

## Order

1. Drawing: silhouettes, landmarks, structure and selected texture lines. Ink where the source shows line; light pencil where it shows none. Choose the ink level when you prompt for the drawing.
2. Let the ink dry and set, then inspect the executed drawing.
3. Reserve lights and lay broad pale washes: the first, coarsest study.
4. Mid-values and shadow glazes: a richer study, or a `glaze` layer.
5. Selected darks: the last study, with a larger least size.

A closing pen is an exception. It needs its own line file (`--drawinglast`) or a finish stage. State its purpose in the plan.

## Marks

In a stroke plan, choose contact, direction, pressure change, reload and lift for each mark's job. Use broad contact for broad passages. Limit strokes so a wash is not rebuilt from many small dabs. Run the [stroke-size gate](../../../docs/judging.md#stroke-sizes) on explicit stroke plans before painting and recorded runs afterward. The default warning concerns only tiny paint carrying broad low-detail wash interiors: at most 30% of each interior's carried area or visible paint contribution. Declare broadAreas and exempt detail features on explicit stroke plans. Keep counts as secondary diagnostics and pen detail separate. These are provisional limits; a pass still needs visual review.

## Review

Save the drawing, first washes, dried layers and final accents. Judge each checkpoint by its intended job, and review the whole picture and close-up views at the simulation resolution separately. A final score cannot show that the sequence was plausible.

When comparing attempts, keep the target and settings fixed and name what changed. Fix the earliest stage at fault before adding detail, and keep geometry that worked.
