# Pigments and paper

## Kubelka-Munk layers

`src/media/km.mjs` gives each paint two numbers per red, green and blue channel: K, the light it absorbs, and S, the light it scatters back. There is no spectral model. `fromColours` derives K and S from a paint's colour over white and over black (Curtis et al. 1997).

Paints mixed in one wash average their K and S, weighted by thickness. A dried wash is its own layer. Layers stack oldest first over the paper with `R = R1 + T1² R2 / (1 − R1 R2)`: light passes through the top layer, reflects off what is under it, and comes back through. So a glaze, a transparent wash over dried paint, differs from the same paints stirred together.

![Three dried glazes of hansa yellow, cerulean blue and quinacridone rose](img/glazes.webp)

`node tools/run-plan.mjs examples/plans/glazes.json` paints glazes from the command line ([examples/plans/glazes.json](../examples/plans/glazes.json)).

## The box

The painter mixes from 16 paints in `src/crop/box.mjs`: eleven measured (French ultramarine, phthalo blue, cerulean blue, phthalo green, hansa yellow, cadmium yellow, yellow ochre, burnt sienna, burnt umber, quinacridone rose, cadmium red; published masstones), raw sienna (estimated), lamp black (flat absorption), and three mixes of the base paints (sap green, Payne's gray, sepia).

The palette is picked on one set of reference constants for every paint (scattering 0.02, staining 1.4, granulation 0.25, density 0.05), so physics cannot change which paints a picture gets. On the sheet each paint then settles by its published granulation, flocculation, staining and density (`src/paint/methods/pigment-physics.mjs`, from the table in `src/media/pigment-physical.mjs`, which lists sources). Its colour and scattering stay as picked.

| pigment | granulation (gamma) | flocculation | staining (omega) |
|---|---|---|---|
| French ultramarine, cerulean blue | heavy (0.85) | yes (0.3) | non-staining (0.5) |
| yellow ochre, raw and burnt sienna | moderate (0.55) | ochre slight, siennas none | non-staining |
| burnt umber | slight (0.25) | none | non-staining |
| phthalo blue and green, hansa yellow, quinacridone rose | none (0) | none | staining (20) |
| cadmium yellow and red, lamp black | none | none | non-staining |
| sap green, Payne's grey, sepia | their parents' shares | | |

White gouache is a pigment on the sheet (`src/media/gouache.mjs`): almost no absorption, an opaque paint's scatter, laid dry in the top layer thick enough to hide, so the same composite draws it. The finish lays it with a rigger, tinted by up to three palette paints, for thin lights no wash can reserve ([How it paints](how-it-paints.md#9-finish)).

## Paper

`src/media/paper.mjs` builds a height map of curved fibres and fine tooth. By default (`--paper coldpress --paperphysical 1`) the height is the cold-press relief of `src/media/paper-relief.mjs`: one seeded field in micrometres, structure from 0.1 to a few millimetres, fitted to the grain of real washes and averaged over each cell, so one sheet at any cell size is the same paper. Fibre lengths, density and brush relief are in millimetres. Pigment settles at its Stokes speed through the film, faster into hollows (`src/media/settling.mjs`), so ultramarine, cerulean and the earths granulate and the staining organics dry smooth. `--paper flat` and `--paperphysical 0` turn this off. Hollows hold more water.

Granulating pigment settles faster in hollows and rolls downhill while the wash is wet; flocculating pigment gathers in broader hollows; a wetter or slower-drying wash granulates more; staining pigment dries smooth. The pigment's rating is the number the sheet uses. Grains stop rolling when the slope is gone. A render-time pass (`microAmps`, `--micro`) adds the effect below one cell.

## Water and drying

`src/media/sheet.mjs` tracks per cell: surface water, pore water, floating pigment, settled-but-unfixed pigment and pore pigment.

Water evaporates faster at the pinned edge of a wash. Water flows out to replace it and carries pigment, so the edge dries darker. Damp pores can rewet the surface beside standing water, which makes backruns and blooms.

`dry()` steps the sheet until it is dry, then fixes the settled pigment as a new layer. New water lifts a little of the top layer, and more of unfixed pigment. Sepia ink is the default and rewettable; black ink resists lifting better; pencil does not lift.

On dry paper the next wash keeps its shape and glazes over what is there; on wet paper it spreads and mixes. The painter uses wet into wet on purpose for soft edges; a painting that never dries turns every glaze to a blur.

![The same two strokes, dried between and flooded](img/drying.webp)

Same blue and sienna strokes in both. Dried between, the sienna band dries 7.5 mm wide, about the 8 mm brush. Flooded first and not dried between, the sienna spreads over the patch and dries at about a third of the darkness. Run them with `node tools/run-plan.mjs examples/plans/drying-dry-between.json` and `drying-too-wet.json`.

The plan decides when to dry. `src/paint/methods/wetdry.mjs` measures surface water and pore saturation and waits for dry-layer or wet-blend conditions; it stops execution if its readiness checks fail. The stroke-plan runner warns when `requiredPaper` is unmet and continues; each `dry` command dries the sheet.
