---
name: painting-planner
description: Plans a whole watercolor or ink-and-wash painting for the unpainting simulator, covering passages, techniques, layer order, ink drawing, glazes and checkpoints. Use before rendering a new painting, when writing or revising a plan or planner recipe, or when turning written style instructions into a plan. Load watercolor-technique alongside it for material decisions.
---

# Painting planner

Write the plan before rendering. Take material, moisture and density decisions from the [watercolor-technique skill](../watercolor-technique/SKILL.md). Stroke plans for `tools/run-plan.mjs` follow `docs/plan-format.md`.

For the image painter, read [the combined plan and technique toolbox](../../../docs/combined-painter.md). Author one plan with `drawing`, `washes` and `order`; select methods from target cues instead of stacking flags. Include the ink toolbox in the choice even when the correct decision is no ink. CLI flags are explicit overrides, and `--recipe v096` is the historical compatibility path. Freeze target-derived line paths, reserves and ordering before the guard seals the target.

## Workflow

Copy this checklist into the plan and tick it off:

```
- [ ] Record target, paper color, style, sheet size in mm and native density
- [ ] Group forms into passages and fill one entry per passage
- [ ] Choose ink or graphite from the line the source shows
- [ ] Order the work: optional pencil, drawing, dry, washes, glazes, accents
- [ ] Give each mark a purpose, contact and stroke budget
- [ ] Preview geometry against landmarks and lights before physics
- [ ] Name the checkpoint that shows each stage's contribution
```

## Inputs

Start from the target and any structural reference. If earlier paintings or review notes shaped the plan, say which ones and what you took from them. Locate the areas that need detail at the simulation resolution and test a representative narrow feature at the planned native density.

## Passages

A passage is a wash or group of marks with one job. Value is how light or dark a color is.

Group forms by lighting, shape and material. For each passage record:

- Intended appearance and target cue.
- Value range, local color and highlights kept free of dark paint.
- Hard, soft, broken and lost edges.
- Technique, brush width in mm, stroke direction and how the brush meets the paper.
- Paper moisture, brush water load and pigment concentration (defined in watercolor-technique).
- Layer order and the checkpoint that should show its contribution.

Connect adjacent regions when the target shows one wash or continuous shadow. Keep surfaces with different lighting distinct.

## Order

1. Optional light preparatory pencil sketch where placement is hard. Ink only is usually best.
2. Drawing: silhouettes, landmarks, structure and selected texture lines. Ink where the source shows line; light graphite where it shows none.
3. Let the ink dry and set, then inspect the executed drawing.
4. Reserve lights and lay broad pale washes.
5. Dry as the next layer needs, then mid-values and shadow glazes.
6. Selected dark paint accents and texture.

A later ink pass or a paint-first order is an exception. State its purpose in the plan.

## Marks

Choose contact, direction, pressure change, reload and lift for each mark's job. Use broad contact for broad passages. Texture should follow the shapes already painted. Limit strokes so a wash is not rebuilt from many small dabs. Run the [stroke-size gate](../../../docs/stroke-stats.md) on explicit stroke plans before painting and recorded runs afterward. The default warning concerns only tiny paint carrying broad low-detail wash interiors: at most 30% of each interior's carried area or visible paint contribution. Declare broadAreas and exempt detail features on explicit stroke plans. Keep counts as secondary diagnostics and pen detail separate. These are provisional limits; a pass still needs visual review.

## Review

Save the drawing, first washes, dried layers and final accents. Judge each checkpoint by its intended job, and review the whole picture and close-up views at the simulation resolution separately. A final score cannot show that the sequence was plausible.

When comparing attempts, keep the target and settings fixed and name what changed. Fix the earliest stage at fault before adding detail, and keep geometry that worked.
