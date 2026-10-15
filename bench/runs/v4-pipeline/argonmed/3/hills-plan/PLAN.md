# Painting Plan — `Hills` (`loose ink and wash`)

## 1. Visual Analysis of `bench/plan/target.png`
- **Subject & Composition**: A loose ink-and-wash landscape (`306×242` source crop, rendered at `1224×968`, `sheetmm: 158.05`) showing sunlit yellow-green rolling hills cut by a winding pale cream-and-ochre dirt path that enters at the top-right (`[0.70, 0.00..0.77, 0.10]`), sweeps across the upper-left slope (`[0.17, 0.16..0.26, 0.52]`), and curves down through the lower-center to the bottom-right foreground (`[0.40, 0.55..0.83, 1.00]`). Rounded oak and chaparral tree masses in olive-green and cool slate-blue cluster along the hillside folds and flank the road, anchored by fluid dark ink contour and branch lines.
- **Target Color & Value Regions (6 regions)**:
  1. **Region 2 (8.8%, `rgb=(202,203,85)`) & Region 4 (11.2%, `rgb=(191,195,102)`)**: Luminous sunlit chartreuse/yellow-green grassy slopes (`L* ≈ 77–80`).
  2. **Region 5 (10.7%, `rgb=(171,169,114)`) & Bare Paper Lights (`rgb≈(247,231,198)`)**: Warm sandy-ochre road banks and dry grass verges bordering the bright cream-white dirt path core.
  3. **Region 1 (21.6%, `rgb=(135,135,109)`) & Region 6 (26.8%, `rgb=(80,86,79)`)**: Mid-tone olive-tan transitions and darker olive-grey tree canopy masses (`L* ≈ 35–56`).
  4. **Region 3 (21.0%, `rgb=(51,64,72)`)**: Cool deep slate-blue and blue-green under-canopy tree shadows and ravine recesses (`L* ≈ 25`, where `B > R + 10`).

## 2. Palette & Style Strategy
- **Automatic 4-Pan Palette (`--paints 4 --paletteshare 1`)**: `widePalette` selects **Hansa Yellow**, **Cerulean Blue**, **Quinacridone Rose**, and **Sap Green** (plus the granulating sky-blue pan from `_skyb`), achieving a 2.95 mean palette unmixing error across the sheet:
  - **Sunlit grass**: Hansa Yellow + Sap Green.
  - **Sandy-ochre path verges**: Hansa Yellow + Quinacridone Rose + a touch of Sap Green.
  - **Olive canopies**: Sap Green + Hansa Yellow + Quinacridone Rose.
  - **Cool slate-blue tree shadows**: Cerulean Blue + Sap Green + Quinacridone Rose.
- **Style Profile (`precise-watercolor` + Traced Opening & Closing Ink)**:
  - In `src/paint/methods/light-to-dark.mjs`, setting `styleSelection.style` to `"precise-watercolor"` preserves the full 5-band light-to-dark value ladder (`weights: [1, 1, 1, 1, 1]`) so the 4 middle wash quantiles (`q = [0, 0.3, 0.55, 0.78]`) separate the sunlit yellow-green hills from the mid-olive canopies and deep olive-slate masses before the shadow glazes go down.
  - The loose ink-and-wash character is delivered by custom traced line files (`bench/plan/opening-lines.json` with 274 structural contour strokes and `bench/plan/closingink4-lines.json` with 184 dark accent contours) extracted directly from `bench/plan/target.png` **without** the architecture-only green-foliage filter in `bench/tools/trace-ink.mjs`.

## 3. Recipe Tokens (`bench/variant.txt`)
`region_w13_noslane_spl_lad_wre15`
- `region_w13`: Base 6-region light-to-dark value plan with 4 middle layers (`_lay4`, quantiles `0, 0.30, 0.55, 0.78`), dark gain `1.3` (`_dk13`), opening drawing (`--drawingfile bench/plan/opening`), paper reserves (`--paperlights 1 --paperrel 1`), and closing ink (`_ink4` -> `--drawinglast bench/plan/closingink4`).
- `_noslane` (`--skylanes 0`): Disables horizontal sky-lane striping on Region 3 (`B > R + 10`).
- `_spl` (`--strokeplan 1 --lanemm 6`), `_lad` (`--laneadapt 1`), `_wre15` (`--washreach 1.5`): **Critical revision from Look 2** — without `--strokeplan 1`, the connected yellow-green/olive hillside passage (`76%` of the sheet) is painted by `shapedPlanePaths` as a single diagonal flat-brush stroke whose maximum physical brush width leaves the upper-right hillside unpainted. Enabling `_spl_lad_wre15` covers the entire passage with overlapping 6 mm lanes of 30 mm strokes, each locally charged (`fmin=0.45..fmax=1.8`) from the target pigment demand under its footprint.

## 4. Pass-by-Pass Execution Order & Checkpoints
1. **Opening Ink (`start` / Look 1)**: Draw 153 kept road-edge, ridge, and canopy contours from `bench/plan/opening-lines.json`, clear of bright paper reserves.
2. **Band 1 Light Washes**: Wet-on-wet yellow-green and pale sandy-ochre foundation washes laid in overlapping 6 mm stroke-plan lanes around the bare-paper dirt path core.
3. **Band 2 Middle Layers (`L0..L3`)**: Four progressive dry-on-dry value layers (`0%, 30%, 55%, 78%` quantiles) building the warm sunlit grass slopes, sandy road banks, and rounded olive-green tree canopies.
4. **Bands 4 & 5 Shadow Glazes**: Dry-on-dry cool slate-blue (`Cerulean Blue + Sap Green + Quinacridone Rose`) and deep olive glazes into the under-canopy shadows and ravine pockets.
5. **Touch-up & Closing Ink (`finish`)**: Shape-average corrective glazes followed by `bench/plan/closingink4-lines.json` to restate crisp dark contour, branch, and path-edge lines over the dried washes.
