---
name: watercolor-technique
description: Chooses and checks watercolor and ink-and-wash techniques for the unpainting simulator, covering ink-first drawing, washes, glazes, paper moisture, brush load, edges and native density. Use before planning, coding or judging a painting step, or to diagnose fragmented washes, muddy color, lost detail or a drawing lost under the wash.
---

# Watercolor technique

A passage is a wash or group of marks with one job. Value is how light or dark a color is. Choose each technique from the target, then check that the simulator executed it. Calibrations hold only for the engine version that measured them.

## Order: drawing, dry, then wash

The painter draws the lines of a prepared drawing file (`--drawingfile`) as they are: a pen drawing whole before the washes, a pencil drawing in phases with them (its lay-in first, each other line just before the wash that needs it, on dry paper). With no file it draws no line. Pencil is the default medium; `--inkrecipe wash` or `--outlinemedium ink` draws in ink. A closing pass needs its own line file (`--drawinglast`) or a finish stage. `--inkfast auto` (the default) sets black ink before the washes and leaves sepia soluble.

1. Choose the drawing medium from the source and write it in the plan. If the target shows line, ink silhouettes, landmarks, structural junctions and selected texture lines; ink alone is usually best. If it shows none, draw the same structure lightly in graphite so it disappears under the washes.
2. Let the ink dry and set. Inspect the executed drawing; planned paths do not prove ink reached the paper.
3. Reserve lights, then paint broad, pale, connected washes over the drawing.
4. Dry to the state the next layer needs. Develop mid-values and shadow glazes.
5. Add selected dark accents and texture.

Match line density and weight to the target. A later ink pass, or paint before drawing, needs a stated purpose in the plan. Light to dark is a default: a soft shadow can go into a still-wet wash.

## Workflow

Copy this checklist into the plan and tick it off:

```
- [ ] Read the target: value masses, landmarks, paper color, edge hierarchy, lights
- [ ] Record one entry per passage (fields in painting-planner)
- [ ] Draw in ink, let it dry and set, inspect the executed drawing
- [ ] Paint broad washes, dry as needed, then glazes and accents
- [ ] For every stroke, check paper moisture across the footprint and nearby wet passages
- [ ] Save and review each checkpoint against its job
- [ ] Fix the earliest stage at fault before adding detail
```

Group regions that share a passage. Carry a glaze across regions when the target shows one continuous shadow; keep differently lit surfaces distinct.

## Paper moisture and brush load

Paper moisture, brush water load and pigment concentration are separate controls.

- Wet paper merges marks and lets paint travel.
- A shiny wet surface supports controlled soft transitions.
- Damp paper blooms when a wetter addition arrives.
- Dry paper gives distinct marks and separate layers.

If moisture across the stroke's footprint and nearby wet passages does not suit the mark, dry, rewet or work elsewhere. Before a glaze, check surface dryness and how much pigment has set into the paper; a dry-looking surface can still reactivate.

Transparent watercolor cannot cover a dark with a light. Reserve lights early; lifting is a separate, material-dependent operation.

## Physical size and native density

Sheet dimensions are physical; native density is the cell count that represents them. Keep brush widths in mm when density changes. The paper is cold-press with physical fibers by default; `--paper flat` and `--paperphysical 0` turn that off.

A feature F mm wide on a sheet W mm wide sampled by N cells spans F x N / W cells. Test a representative narrow feature at the planned native density before trusting it to survive edge spread. Higher density cannot fix wrong geometry, order or moisture.

## Review

Save the drawing, first washes, dried layers and final accents. Review whole-picture values and landmarks, then close-ups at simulation resolution. Image metrics are supporting evidence only.

## References

- [Architecture](references/architecture.md): planes, openings, connected shadow washes, line and wash.
- [Trees and skies](references/trees-and-skies.md): canopy masses, branches, sky gradients, clouds, softening and lifting.
- [Fur and faces](references/fur-and-faces.md): fur direction, facial values, selective masking.
- [Dry brush and detail](references/dry-brush-and-detail.md): dry brush, wet-on-dry layers, representative mark tests.
- [Execution checks](references/execution-checks.md): what to measure when a mark or stage differs from the plan.
- [Sources](references/SOURCES.md): papers, reference implementations.
