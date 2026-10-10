---
name: watercolor-technique
description: Plan, implement, or review watercolor and ink-and-wash techniques in painting simulators. Use when choosing drawing order, washes, glazes, moisture, brush loads, edges, or simulation cell density, and when diagnosing fragmented washes, muddy color, or lost detail.
---

# Watercolor technique

A passage is a wash or group of marks with one job. Value is how light or dark a color is.

Choose techniques from the reference, then verify that the simulator executed the intended drawing, materials, moisture and layers. Use [sources](references/SOURCES.md) for supporting technique evidence. Engine calibrations apply to the implementation and version measured.

## Read the reference

Identify the main light and dark shapes, defining landmarks, paper color and edge hierarchy. Distinguish bare-paper lights from pale paint and lifted areas. Locate connected washes, continuous shadows, and texture that follows the form.

For each materially different region, record:

- Reference cue and intended appearance.
- Drawing, wash, glaze, dry brush, or lifting technique.
- Hard, soft and lost edges.
- Paper moisture, brush width in mm, water load and pigment concentration.
- Layer order and what the next saved stage should show.

Group regions that share a passage. A planning boundary need not become a visible paint edge.

## Draw before painting

For ink-and-wash, establish the drawing before transparent washes: silhouettes, landmarks, structural junctions and selected texture lines. Declare ink or graphite, pigment, line weight and water resistance. Check the executed opening stage before washing over it; selected paths alone do not prove that the drawing reached the paper.

Match drawing density and weight to the reference. Connected gestures, changing pressure and taper should describe form. Account for a medium that can bleed or lift under a wash. Later ink requires a specific finishing purpose; it is optional. State a deliberate paint-first exception when the intended process calls for one.

## Build transparent layers

A useful starting sequence is:

1. Reserve lights and establish the drawing.
2. Paint broad, pale, connected washes.
3. Dry to the state required by the next layer.
4. Develop mid-values and deliberate shadow glazes.
5. Add selected dark paint accents and texture.

Use wet-in-wet for merging masses and soft transitions. A soft shadow can be added to a still-wet wash; a distinct glaze needs a dry, stable base. Light to dark is a planning default. You need not dry every stroke or hold every dark until the finish.

Carry a glaze across regions when the reference shows one continuous shadow. Keep separate planes distinct where their lighting and edges require it. Size the glaze from the remaining value gap and the base color. Repeated complementary layers can neutralize color.

Transparent watercolor cannot simply cover a dark passage with a light one. Plan lights early and treat lifting as a material-dependent operation.

## Match moisture and load to the edge

Paper moisture, brush water and pigment concentration are separate controls:

- Wet paper supports merging and broader movement.
- A shiny wet surface can support controlled soft transitions.
- Damp paper can bloom when a wetter addition arrives.
- Dry paper supports more distinct marks and separate layers.

Calibrate these responses in the current simulator. Inspect state across the area covered by the stroke and nearby wet passages. Dry, rewet or work elsewhere when it does not suit the intended mark. If state cannot be measured, name the uncertainty and test a representative passage.

For glazes, verify both surface dryness and how much pigment has set into the paper. A visually dry surface may still reactivate. Use the supported drying operation when it is needed to stabilize the base.

Dry brush uses limited water and broken contact with paper tooth (surface texture). Choose it for intentional texture. Clean-water softening and lifting need their own moisture and load choices.

## Keep physical size separate from density

Canvas dimensions describe the physical sheet. Simulation cell density describes how many simulation cells represent it. Keep brush dimensions meaningful in mm when changing density.

For a sheet W mm wide sampled by N cells:

- Cell width = W / N mm.
- Feature width in cells = feature width in mm × N / W.

Compare the smallest required feature with brush width and edge spread. Use a representative mark test to determine adequate density; one fixed cell threshold does not apply to every engine and material.

Choose a representation per region:

- Wash: broad value planes and connected shapes.
- Dry brush: texture from broken contact and paper tooth.
- Drawing with wash: narrow structural lines established before paint.
- Higher simulation cell density: features that must remain resolved paint marks.

A local density increase needs valid surrounding water and pigment context. Higher density cannot repair incorrect geometry, layer order or moisture. Upscaling an export adds no simulation detail.

## Useful subject decisions

- Faces: preserve landmarks and reference-visible lights; keep eye moisture separate when adjacent washes would obscure detail.
- Fur and hair: establish value masses, then organize selected marks by growth direction, lock shape and value.
- Foliage: connect canopy and shadow masses, reserve gaps showing sky through foliage, and concentrate shaped leaves where detail matters.
- Fabric and architecture: establish planes before small accents; distinguish structural drawing from shadow edges.
- Sky and water: plan connected wet passages and reserved or lifted lights; dry before reflections or ripples that need crisp edges.

Treat these as starting decisions that the reference can override.

## Review the executed process

Save and inspect the opening drawing, first washes, dried layers and final accents. Compare each stage with its intended contribution. Review whole-picture values and landmarks, then details at the simulation's original resolution for line weight, paint coverage, edges and texture.

Check actual paths, material settings and paint laid down when the result differs from the plan. Correct the earliest responsible stage before adding detail. Preserve useful geometry while changing technique.

Use image metrics as supporting evidence. Separate artistic quality, material behavior and integration correctness, and record the settings needed to reproduce the result.
