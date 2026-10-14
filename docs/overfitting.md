# Overfitting

Some painter settings were fitted by self study on a few benchmark images, mostly Trumbull (subject id `Y1`). On those images they help. On other images they can hurt: heavy ink, pale washes, stone blocks on skin. This page lists every such setting and how it is contained.

## How it is contained

- The default recipe (`src/paint/recipe.mjs`; also `--recipe general` or `combined`) sets only general methods: value planning from light to dark, shaped marks, four middle layers, two touch-up rounds, a drawing first (the plan chooses any closing pass), physical cold-press paper. No value in it was fitted to one image.
- Fitted settings live in `src/paint/tuned/` and run through the compatibility recipe or a named preset (`src/paint/tuned/presets.mjs`). A value plan opts in with `"presets": ["architecture", "glaze-gains"]`. The command line opts in with `--recipe general+architecture`.
- No painting code outside `src/paint/tuned/` checks a subject id. Rules fitted to one subject are switched by a flag (`--drawsubject`). The `--portraitrules` rules were removed: the lower-face stubble box, the jaw-band ink skip and the colour trace window. The `--trumbullrules` rules were removed: the 55:45 ultramarine shadow glaze and its violet lift, warm-stone dry brush, the first-ink skips and the per-shape stone and leaf mixes.
- `--recipe v096` retains the V096 compatibility recipe. It adds the tuned flags and sky lanes to every subject. It applies no preset by subject id. Use the v0.1.0 tag for exact historical simulation output.
- `src/paint/overfit.test.mjs` fails if the general recipe sets a tuned flag, or if painting code outside `src/paint/tuned/` names a subject id.

Subject ids: `Y1` is `examples/targets/trumbull.jpg` with `examples/plans/trumbull-values.json`. `Y4` is a second Trumbull-derived subject. `3T` (a portrait), `1D` (an ink and wash dog), `2W` (a beach scene with a figure and a dog) and `4I` (hills with a figure) are private benchmark images.

## Presets

| Preset | Flags | For |
|---|---|---|
| `architecture` | `--skylanes 1 --skyblue 1 --skysplit 1 --skylanemm 6 --skylanestep .8 --skyfloc .5 --groundglaze 1 --stoneblocks 0.6 --stoneblockamt 0.2 --stoneblockmm 4 --stoneirregular 1 --recesses 1 --recesslayers 2 --recessshare .75 --recessclean 1 --texvariety 0.8` | Buildings under a sky |
| `glaze-gains` | `--darkgain 1.3 --coolgain 1.3 --touchgain .6` | Stronger shadow and cool glazes, lighter touch-ups |

`examples/plans/trumbull-values.json` names `architecture` and `glaze-gains`, and authors its seven-paint box in `washes.paints`. The per-subject presets `trumbull`, `trumbull-paints`, `portrait-3t` and `dog-1d` were removed.

## Inventory

Four groups: flags that V096 ran on every subject, rules that checked a subject id, opt-in modules, and lookups or harnesses. "Where" paths are under `src/paint/` unless they start with `tools/` or `bench/`. Risk is for images the item was not fitted on.

### V096 default flags, now in presets

| Item | Where | Fitted on | What it does | Switched on by | Risk |
|---|---|---|---|---|---|
| `--darkgain 1.3` | `methods/light-to-dark.mjs` | Y1, Y4 | 30% more paint in the shadow glazes (bands 4 and 5). | `glaze-gains`, v096 | High: darker darks everywhere. |
| `--coolgain 1.3` | `methods/light-to-dark.mjs` | Y1, Y4 | 30% more paint in cool cells, in every band. | `glaze-gains`, v096 | High: skies and blue shadows go heavy. |
| `--touchgain .6` | `tools/paint-plate.mjs` | Y1, Y4 | Touch-up glazes lay 0.6 of the remaining amount instead of 0.8. | `glaze-gains`, v096 | Medium: weaker touch-ups. |
| `--skylanes 1` | `tools/paint-plate.mjs` | Y1 sky | Lays any large cool plane as horizontal wet sweeps. | `architecture`, v096 | Medium: water, shadows and cool walls are cool planes too. |
| `--skyblue 1` | `tools/paint-plate.mjs` | Y1 sky | Moves sky cells' blue to a second, granulating blue. | `architecture`, v096 | Medium. |
| `--skysplit 1` | `methods/light-to-dark.mjs` | Y1 sky | Lays the light washes apart by colour family. | `architecture`, v096 | Low. |
| `--skylanemm 6` | `tools/paint-plate.mjs` | Y1, Y4 skies | Sky sweep brush radius 6 mm instead of 3 mm. | `architecture`, v096 | Medium. |
| `--skylanestep .8` | `tools/paint-plate.mjs` | Y1, Y4 skies | Sweeps 0.8 radii apart instead of 1.5. | `architecture`, v096 | Medium. |
| `--skyfloc .5` | `tools/paint-plate.mjs` | Y1 sky | Softer, larger granulation in the sky pigment. | `architecture`, v096 | Low. |
| `--groundglaze 1` | `methods/light-to-dark.mjs`, `GROUND` in `tuned/trumbull.mjs` | Y1 | Cool, weakly coloured cells in the bottom 38% of the sheet become one band-4 glaze. | `architecture`, v096 | High: any cool lower third turns into shadow. |
| `--stoneblocks 0.6` | `methods/light-to-dark.mjs`, `STONE_WALL` and block colours in `tuned/trumbull.mjs` | Y1 | Pale cut-stone block hints on warm mid-light cells. | `architecture`, v096 | High: the wall test also matches skin, sand, wood and fur. |
| `--stoneblockamt 0.2` | `methods/light-to-dark.mjs` | Y1 | Each block glaze carries 0.2 of the cell's demand. | `architecture`, v096 | High, with stone blocks. |
| `--stoneblockmm 4` | `methods/light-to-dark.mjs` | Y1 | Block rows 4 mm tall. | `architecture`, v096 | High, with stone blocks. |
| `--stoneirregular 1` | `methods/light-to-dark.mjs` | Y1 | Irregular four-sided stones instead of rectangles. | `architecture`, v096 | High, with stone blocks. |
| `--recesses 1` | `methods/light-to-dark.mjs`, `RECESS` in `tuned/trumbull.mjs` | Y1 | Dark recesses (windows, doors) become last accents on the dried wall. Was a check for subject Y1. | `architecture`, v096 on Y1 | Medium: any dark or blue-dark cell counts as a recess. |
| `--recesslayers 2` | `methods/light-to-dark.mjs` | Y1 | Recesses in two dried layers. | `architecture`, v096 | Low: needs `--recesses`. |
| `--recessshare .75` | `methods/light-to-dark.mjs` | Y1 | Each recess layer carries 0.75 of the demand. | `architecture`, v096 | Low: needs `--recesses`. |
| `--recessclean 1` | `methods/light-to-dark.mjs` | Y1 | No light wash under recesses. | `architecture`, v096 | Low: needs `--recesses`. |
| `--texvariety 0.8` | `techniques/shaped-marks.mjs` | Y1 stone, 3T stubble | Varies short texture marks. | `architecture`, v096 | None: the value planner no longer lays texture passages. |

### Rules that checked a subject id, now behind a preset flag

| Item | Where | Fitted on | What it does | Switched on by | Risk |
|---|---|---|---|---|---|
| Drawing caps for 3T | `tuned/drawing-caps.mjs`, `methods/material-profiles.mjs` | 3T | 18 opening lines at pressure 0.25, 16 closing at 0.32. | `--drawsubject 3T` (`portrait-3t`) | Low. |
| Drawing caps for 1D | `tuned/drawing-caps.mjs` | 1D | 12 opening lines at 0.28, 20 closing at 0.35. | `--drawsubject 1D` (`dog-1d`) | Low. |

### Opt-in tuned modules, unchanged

| Item | Where | Fitted on | What it does | Switched on by | Risk |
|---|---|---|---|---|---|
| Eye-plane strokes | `EYE_PLANE_ORDINALS` in `tuned/portrait.mjs`, `methods/drawing-logic.mjs` | 3T | Keeps two reviewed under-eye strokes in the opening ink. | A private `work/subjects/portrait.json` | Low: needs that file. |
| Modulation anatomy | `tuned/modulation-anatomy.mjs` | 3T | Skin and fur regions; cat cells by 3T region id. | `--modulate 1 --modanatomy <file>` | Low: needs a registered file. |
| Paint-owned residual | `tuned/paint-owned-residual.mjs` | One private image | Moves detail residual into the wash inside authored polygons. | `--modpaintplanes <file>` | Low: needs an authored file. |
| Dog coats | `tuned/dog-coats.mjs` | 2W, private dry-coat photos | Wet and dry curly coat presets. | `--dogpaint`, `--dogcoat` | Medium: both assume a black curly coat. |
| Olive families | `tuned/olive-families.mjs` | One olive study, checked on 2W | Colour group rules for the tree layers passage. | `--passages treelayers` | Medium: hard colour rules with no flag. |
| Architecture clouds | `tuned/architecture-clouds.mjs` | A private architecture photograph | Cirrus lifted with tissue. | `--passages architecture` | High for other skies. |
| Architecture plan | `tuned/architecture-reference.plan.json` | The same photograph | Polygons and colour filters. | `--architectureplan` | Only useful for that photograph. |
| Mass plan | `tuned/mass-plan.mjs` | The Mona Lisa layout | Named masses, order and edges for oil. | `--medium oil`, `--massplan 1` | High for other layouts. |
| Style cuts | `tuned/style-cuts.mjs` | About 40 artworks with benchmark pieces | Thresholds for the practice planner's ink and dry brush. | `--practice 1`, `--modulate 1`, `--drawinglogic 3` | Low to medium. |
| Sand sizes | `techniques/passages/sand.mjs` | One beach crop | Mark sizes scaled from a 192-cell region. | `--passages sand` | Medium. |

### Lookups and harnesses outside the painter

| Item | Where | Fitted on | What it does | Switched on by | Risk |
|---|---|---|---|---|---|
| Benchmark base tokens | `bench/scripts/pipeline/plan-args.mjs` | Y1 | V4 and V5 base settings, stone tokens for architecture and palette tokens for Trumbull. | The benchmark runner | Medium: every V4 and V5 subject starts from them. |
| Research subject ids | `tools/research/`, `tools/judge/` | 3T, 1D, 2W, 4I | Fixed subject lists for research and judging scripts. | Those scripts | None for painting. |

The general method defaults (for example the value bands, `--midlayers 4` and `--touchpoints 2`) were also chosen while looking at benchmark subjects. No single image is recorded as their source, so they are not listed here.

## Changes for older runs

- A run that relied on the default before 2026-10-10 repeats with `--recipe v096`.
- A plan that names subject `Y1`, `3T` or `1D` no longer turns on that subject's rules under any recipe. Those rules were removed.

## Held-out measurement

Each subject painted from the image alone at 540 px with `--mode fast --targetguard strict --video 0 --marks 0`, once with `--recipe v096` and once with the then-proposed general default, on the Mac mini (2026-10-10). Correlation and mean absolute gray difference are against the target, computed after painting. Ink is the line share of the finished painting by the painter's own ink separator (`src/crop/inkwash.mjs`); source line is the same separator on the target. Clean paper is the share within 10 gray levels of the blank sheet; the target figure uses its brightest tenth. Trumbull has no value plan here, so V096 runs its tuned flags but not the Y1 rules.

| Subject | Correlation, V096 to new | Gray diff, V096 to new | Ink, V096 to new (source line) | Clean paper, V096 to new (target) |
|---|---|---|---|---|
| Guardi | 0.808 to 0.795 | 26.3 to 27.7 | 0.15% to 0.17% (1.3%) | 16.6% to 17.3% (16.5%) |
| Tiepolo | 0.848 to 0.856 | 10.2 to 9.8 | 0.08% to 0.07% (0.9%) | 75.6% to 72.3% (63.9%) |
| h36-a | 0.77 to 0.786 | 28 to 27.2 | 0.57% to 0.5% (3%) | 13.3% to 12.5% (13.4%) |
| h34-a | 0.833 to 0.859 | 27.8 to 25.3 | 0.53% to 0.41% (2.5%) | 16.8% to 14.3% (14.7%) |
| Hills | 0.763 to 0.76 | 30.2 to 30.1 | 0.76% to 0.63% (3.6%) | 9.3% to 6.2% (5.5%) |
| France | 0.785 to 0.761 | 26.1 to 26.8 | 0.41% to 0.32% (2.1%) | 8.2% to 7.1% (6.3%) |
| Ships | 0.818 to 0.853 | 23.8 to 20.5 | 0.14% to 0.26% (0.2%) | 11.8% to 10.4% (12.1%) |
| Trumbull | 0.78 to 0.809 | 28.4 to 26.7 | 0.3% to 0.34% (1.9%) | 11.4% to 9.3% (10.8%) |

On the seven held-out subjects the mean correlation goes from 0.804 to 0.810 and the mean gray difference from 24.6 to 23.9. The then-proposed general default is better on Tiepolo, h36-a, h34-a and Ships, and worse on Guardi (0.808 to 0.795) and France (0.785 to 0.761); Hills is level. Trumbull, the expected loser, also improved (0.780 to 0.809) when painted without its plan; with its plan it names its presets and paints as before. Ink barely moves: neither recipe sets the drawing weight, and both paint well under the source's line share. Clean paper falls toward the target on Hills, France and Trumbull.

These are historical branch-study results. The integrated 0.2.0 RC comparison used frozen plans and segmentation on h36-a, Guardi and Hills. It found wash-balance regressions on Guardi and lost connected dark foliage on Hills, so the release first kept compatibility defaults. The combined painter ([combined-painter.md](combined-painter.md)) then made the general process the default, with washes chosen by the painting plan; `--recipe v096` keeps the compatibility recipe.
