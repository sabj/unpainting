---
name: watercolor-technique
description: Chooses and checks watercolor and ink-and-wash techniques for the unpainting simulator, covering ink-first drawing, washes, glazes, paper moisture, brush load, edges and native density. Use before planning, coding or judging a painting step, or to diagnose fragmented washes, muddy color, lost detail or a drawing lost under the wash.
---

# Watercolor technique

A passage is a wash or group of marks with one job. Value is how light or dark a color is.

Choose each technique from the target, then check that the simulator executed it. Calibrations hold only for the engine version that measured them.

## Default order: drawing, dry, then wash

Draw first. The painter's defaults are `--drawing first --outlinemedium graphite`, a light pencil drawing. Without a prepared drawing or `drawing.stages`, `--drawingstages auto` picks stages per image and can add ink, usually closing accents. Write the drawing into the plan: `drawing.medium: "ink"` or `--outlinemedium ink` for ink, `drawing.stages` to fix the stages, `--drawingstages off` for pencil only. A closing pass needs `--drawing both`. `--outlinemedium auto` gives ink to a source with visible line and graphite to one without. `--inkfast auto` (the default) sets black ink before the washes and leaves sepia soluble.

1. Optional: a light preparatory pencil sketch, only where placement is hard to get right in one ink pass. Keep it sparse; the ink follows it.
2. Choose the drawing medium from the source, and write it in the plan. If the target shows line, draw silhouettes, landmarks, structural junctions and selected texture lines in ink; ink alone is usually best. If the target shows no line, draw the same structure lightly in graphite so it disappears under the washes.
3. Let the ink dry and set. Inspect the executed drawing on the sheet; planned paths do not prove that ink reached the paper.
4. Reserve lights, then paint broad, pale, connected washes over the drawing.
5. Dry to the state the next layer needs. Develop mid-values and shadow glazes.
6. Add selected dark paint accents and texture.

Match line density and weight to the target. Pressure change and taper should describe form. A later ink pass (`--drawing both` or `last`) is an exception: name its purpose in the plan. Paint-first work also needs a stated reason.

Light to dark is a default. You need not dry every stroke, and a soft shadow can be added to a still-wet wash.

## Workflow

Copy this checklist into the plan and tick it off:

```
- [ ] Read the target: value masses, landmarks, paper color, edge hierarchy, lights
- [ ] Record one entry per passage (fields below)
- [ ] Draw in ink, let it dry and set, inspect the executed drawing
- [ ] Paint broad washes, dry as needed, then glazes and accents
- [ ] For every stroke, check paper moisture across the footprint and nearby wet passages
- [ ] Save and review each checkpoint against its job
- [ ] Fix the earliest stage at fault before adding detail
```

The planner records one entry per passage ([painting-planner](../painting-planner/SKILL.md)). When you execute or judge a passage, check its technique, edges and paper moisture. Check brush width in mm, water load and pigment concentration too. The sections below give the tests.

Group regions that share a passage. A planning boundary need not become a visible paint edge. Carry a glaze across regions when the target shows one continuous shadow; keep surfaces with different lighting distinct.

## Paper moisture and brush load

Paper moisture, brush water load and pigment concentration are separate controls:

- Wet paper merges marks and lets paint travel.
- A shiny wet surface supports controlled soft transitions.
- Damp paper blooms when a wetter addition arrives.
- Dry paper gives distinct marks and separate layers.

Check moisture across the area covered by the stroke and nearby wet passages. If it does not suit the mark, dry, rewet or work elsewhere. Before a glaze, check both surface dryness and how much pigment has set into the paper; a dry-looking surface can still reactivate.

Transparent watercolor cannot cover a dark with a light. Reserve lights early and treat lifting as a separate, material-dependent operation.

## Physical size and native density

Sheet dimensions are physical. Native density is the cell count that represents them. Keep brush widths in mm when density changes. The painter's paper is cold-press with physical fibers by default; `--paper flat` and `--paperphysical 0` turn it off.

For a sheet W mm wide sampled by N cells, a feature F mm wide spans F × N / W cells. Test a representative narrow feature at the planned native density before trusting it to survive edge spread. Higher density cannot fix wrong geometry, order or moisture, and upscaling an export adds no native detail.

## Review the executed process

Save the drawing, first washes, dried layers and final accents. Review whole-picture values and landmarks, then close-up views at the simulation resolution for line weight, coverage, edges and texture. When a result differs from the plan, inspect executed paths, material settings and paint laid down. Image metrics are supporting evidence only.

## References

Read the file that matches the passage:

- [Architecture](references/architecture.md): planes, openings, connected shadow washes, line and wash.
- [Trees and skies](references/trees-and-skies.md): canopy masses, branches, sky gradients, clouds, softening and lifting.
- [Fur and faces](references/fur-and-faces.md): fur direction, facial value hierarchy, selective masking.
- [Dry brush and detail](references/dry-brush-and-detail.md): dry brush load and contact, wet-on-dry layers, representative mark tests.
- [Execution checks](references/execution-checks.md): what to measure when a mark or stage differs from the plan, and how to compare attempts.
- [Sources](references/SOURCES.md): simulation papers, reference implementations and artist demonstrations.
