---
name: painting-planner
description: Plan a whole watercolor or ink-and-wash painting by identifying forms and values, choosing techniques and layer order, preparing tools, and defining executed-stage checks. Use alongside watercolor-technique for material and mark decisions.
---

# Painting planner

A passage is a wash or group of marks with one job. Value is how light or dark a color is.

Write a plan before rendering. Read the watercolor-technique skill for drawing order, moisture, loads, edges and physical density.

## Inputs and intent

Use the intended painting target and any structural reference. Record paper color, style, physical dimensions, simulation cell density and the important forms. Prior paintings and review notes can inform another attempt; identify which feedback the planner used.

Choose the balance of connected washes, wet blending, distinct glazes, drawing and broken contact from the reference. Locate the areas that need fine detail at the simulation's original resolution. A profile in `src/paint/tuned/subjects.json` can provide a starting point; explain any overrides.

## Regions and passages

Group forms by lighting, shape and material. For each passage record:

- Intended appearance and reference cue.
- Value range, local color and highlights kept free of dark paint.
- Hard, soft, broken and lost edges.
- Technique, brush width in mm, stroke direction and how the brush meets the paper.
- Water load, pigment concentration and required paper state.
- Layer order and the checkpoint that should show its contribution.

Connect adjacent regions when the reference shows one wash or continuous shadow. Keep differently lit planes distinct. Object-region boundaries do not automatically require visible paint edges.

## Order the work

For ink-and-wash, establish the structural drawing before transparent washes and inspect the opening drawing. Reserve necessary lights; develop broad pale passages, mid-values and deliberate shadow glazes; add selected dark paint accents and texture.

Dry to the state needed by the next mark. A separate glaze requires a stable base; dark color can also enter a still-wet mass when the intended edge calls for it. A later ink pass is optional and needs a stated finishing purpose.

## Prepare purposeful gestures

Choose contact, direction, pressure change, reload and lift for each mark's job. Use broad contact for broad passages and smaller brushes or pens where scale requires them. Texture should follow the shapes already painted. Allocate stroke budgets so a wash is not reconstructed from many tiny pigment dabs.

Keep physical dimensions separate from simulation cell counts. Test representative narrow features at the planned density before assuming they will survive edge spread.

## Execute and review

Preview geometry using the proposed marks. Check landmarks, value groups, highlights kept free of dark paint and intended connections before physics. Then save the opening drawing, first washes, dried layers and finish.

Inspect measured paper state, brush load, executed paths and deposited material. Judge each checkpoint by its intended job. Review whole-picture composition and details at the simulation's original resolution separately; a final score cannot establish a plausible sequence.

When comparing attempts, keep the target and declared settings available and identify what changed. Correct the earliest responsible stage before adding detail. Retain useful geometry and explain any tradeoff introduced by the new plan.
