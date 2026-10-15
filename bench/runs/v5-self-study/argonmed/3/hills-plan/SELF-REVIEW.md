# Self-Review of Try 2 (`hills`, Round V5, Try 3 of 3)

## Part 1: Independent Self-Evaluation (Before Reading `FEEDBACK.md`)

### 1. What Works
- **Broad Chromatic Palette & Hillside Hue Harmony**: Switching from the default 3-pan CMY triad to the 6-pan landscape palette (`hansa, sienna, sapgreen, cerulean, ultramarine, sepia`) with `--skyblue 0` eliminated the artificial magenta/pink slabs and rust-orange chromatic speckles from Try 1. The sunlit yellow-green grassy hillsides, olive mid-tones, and cool ultramarine-sepia tree shadows sit in the right colour family for the reference painting.
- **Macro Composition Placement**: The major diagonal belts of the landscape—the upper tree line flanking the upper forks, the central diagonal oak/chaparral belt running from upper-left to mid-right, the lower-left tree mass, and the open sunlit pasture on the lower right—are recognizable in their broad placement and value contrast.
- **Early Light-to-Dark Ordering**: Stage 1 (`10%`) and Stage 2 (`25%`) establish warm light washes before the heavier green and dark slate layers arrive, avoiding the completely blank mid-stage sheet of Try 1.

### 2. What Is Wrong
1. **The Winding Sandy Path Is Bleached Into Jagged White Cutouts Without Road-Edge Ink**:
   - In `target.png`, the winding dirt path is a warm sandy buff/sienna ribbon defined by continuous, crisp dark ink lines along both road shoulders and subtle warm wheel ruts inside the roadbed.
   - In Try 2, `--litl 78 --litreserve 88` with `_lit60` bleached the path into stark, stair-stepped bare-paper white cutouts with raw pixelated edges. Even worse, because the custom line tracer excluded points within 1 px of `protectedCells`, it stripped away the defining ink lines along the edges of the road! The path also loses continuity around the left-center bend where it passes behind the central oak canopy.
2. **Chaotic "Wire-Scrub" Ink Linework Inside Dark Trees Instead of Structural Contours**:
   - Both the opening lines (`opening-lines.json`, 314 lines) and the closing lines (`closingink4-lines.json`, 909 lines with `--drawing 1.4` / `_dwg140` and `--closingpressure 0.78`) trace high-frequency internal pixel noise inside the dark oak canopies rather than coherent silhouette boundaries, road edges, trunks, and hillside ridges.
   - Because the lines were pre-split into short `<= 24 px` segments with boosted weight (`0.68–0.95`) and drawn at heavy pressure (`0.78`) and width (`_dwg140`), the finished painting is covered in a dense, uniform black/dark-sepia tangle of jagged squiggles over the dark trees, while the road edges, grass-to-tree boundaries, and small isolated shrubs lack crisp pen definition.
3. **Mid-Stage Stagnation Between 50% and 75% Followed by a Late Dark + Ink Dump at 75%–100%**:
   - Although `PLAN.md` proposed `_lay2_lt`, `variant.txt` actually ran `_lay3` (without `_lt`), generating 61 passes.
   - As a result, Stage 3 (`50%`) and Stage 4 (`75%`) look nearly identical—both show medium olive-green washes with flat, isolated grey-blue islands sitting inside the tree masses—while all deep slate-black tree shadows and all 909 heavy closing ink lines arrive abruptly between `75%` and `100%`.
4. **Horizontal Brush-Lane Striping & Blurry Canopy Edges**:
   - In the lower-right sunlit grass slope, horizontal lane strokes (`_spl3_sml14_lad`) leave visible horizontal banding across a hillside that slopes diagonally.
   - Softened shadow edges (`_softs`) and coarse cells (`_cg11_mg12`) make the oak canopies bleed blurry halo edges into the sunlit grass instead of holding crisp, scalloped ink-and-wash foliage contours.

### 3. At Which Stage It Went Wrong
- **Stage 1 (`10%`)**: Already shows the defective opening drawing—disconnected worm-like squiggles scattered across the foliage zones with no continuous road edges or ridge contours—paired with patchy pinkish-sienna blobs under the trees rather than a cohesive warm ground/road wash.
- **Stage 2 (`25%`)**: Flat grey-blue island patches with dark drying rings appear inside the tree masses, while the road cutouts emerge as jagged stair-stepped white holes.
- **Stages 3 & 4 (`50%` & `75%`)**: The progression stalls across redundant middle layers (`_lay3`); Stage 4 (`75%`) barely advances beyond Stage 3 (`50%`), leaving unblended slate-blue islands inside olive-green washes and visible horizontal lane stripes on the lower-right grass.
- **Stage 5 (`100%`)**: Heavy Band 4/5 dark washes and 909 thick, jagged closing ink squiggles dump simultaneously onto the dark canopies, creating a muddy, over-inked dark mass while the white road cutouts remain raw and unframed.

### 4. Self-Assigned Scores (Before Reading `FEEDBACK.md`)
- **Finished Painting Score**: **4.8 / 10** (better colour palette and macro dark placement than Try 1, but severely hurt by the chaotic black wire-like ink scribbles, the raw stair-stepped white road cutouts lacking road-edge ink, and blurry/muddy tree modeling).
- **Painting Process / Plausibility Score**: **2.7 / 5** (Stage 1 opening lines look like random contour fragments rather than a human sketch; Stages 3 and 4 stall with isolated grey-blue puddles inside green washes; and Stage 5 dumps both the deep darks and overly dense closing squiggles at the very end).

---

## Part 2: Comparison With `bench/feedback/FEEDBACK.md` (Where We Agree & Disagree)

### 1. Score Summary From `FEEDBACK.md`
- **Finished Painting**: Composite **5.67 / 10** (`classic measures: 8` with `classic value: 5.54`, `classic edge: 9.17`, `classic marks: 9.3`; vision judges: `composition values: 5`, `edges detail: 3`, `marks texture: 3`, overall `3, 4, 3`).
- **Progression Judge**: Mean **2.2 / 5** (`10%: 1.5`, `25%: 1.5`, `50%: 2.0`, `75%: 2.5`, `100%: 3.5`; early mean `1.5`).
- **Render Record**: `57,789` brush strokes across 61 passes (`_lay3` + `_spl3_sml14_lad`), which also caused the run to take ~50 minutes of wall-clock painting and time out during `run 36`.

### 2. Where We Agree With the Judges (and Why)
1. **Strongly Agree — "Uniform squiggle texture is dumped across the whole sheet before any structure exists... lines that do not describe the subject (5)" (`edges detail: 3`, `marks texture: 3`, `10% & 25%: 1.5/5`)**:
   - This is the single most damaging defect in both the progression score (`1.5/5` at `10%` and `25%`) and the finished vision judge scores (`edges detail: 3`, `marks texture: 3`).
   - In Stage 1 (`10%`), `opening-lines.json` drew 314 short, high-curvature internal foliage squiggles across the sheet while omitting the main structural contours (the winding road edges, the hillside ridge lines, and the major canopy silhouettes). Then at `100%`, `closingink4-lines.json` dumped 909 thick, black/dark-sepia squiggles (`_dwg140`, `--closingpressure 0.78`) over the trees. A human ink-and-wash artist sketches **structural boundaries first** (road edges, horizon/ridge lines, major tree trunks and outer canopy outlines) lightly in pencil or dilute pen, builds the washes, and finishes with selective, descriptive contour and accent ink—never a uniform carpet of procedural-looking squiggles inside every dark bush.
2. **Strongly Agree — "The tree masses arrive as flat gray slabs" (`25%–75%` stages) and "a pixel-grid or stair-step fill"**:
   - In Stage 2 (`25%`), Stage 3 (`50%`), and Stage 4 (`75%`), the cerulean/ultramarine underwashes inside the oak canopies appear as isolated, flat grey-blue islands with dark perimeter rings sitting on top of warm/green washes, before the sap-green and sepia layers finally cover them at `100%`.
   - Furthermore, the stair-stepped white road cutouts (`--litl 78 --litreserve 88` on a coarse grid) look conspicuously like a pixelated mask rather than a painted warm sandy path.
3. **Strongly Agree — Stroke Inflation (`57,789` brush strokes) Diluted Stage Progression**:
   - `_lay3` combined with `_spl3_sml14_lad` (`--lanemm 3 --strokemm 14`) inflated the brush stroke count to `57,789` strokes (`4.5x` normal). Because progression frames are sampled by **percentage of total brush strokes** (`10%, 25%, 50%, 75%, 100%`), having 3 massive middle layers with tiny 3 mm × 14 mm strokes meant that `10%` (`5,779` strokes) had barely finished a pale pinkish sienna wash, `25%` (`14,447` strokes) was stuck in flat grey-blue slabs, and `50%` and `75%` were both inside redundant middle green passes.

### 3. Where We Disagree With the Judges (and Why)
1. **Disagree With "The sequence depicts a digital fade-in or dissolve effect rather than a painting process" (`judge 2`)**:
   - The second progression judge mistook the 3-layer full-sheet lane passes (`_lay3` + `_spl3_sml14_lad`) for a digital dissolve/fade-in because each pigment pass swept across the entire sheet in tiny `3 mm × 14 mm` horizontal lanes, gradually darkening all regions in lockstep from `10%` to `75%`.
   - The fix is **not** to abandon light-to-dark watercolor layering, which already scored `3.5/5` at `100%` and `8/10` on classic measures (`9.17` edge, `9.30` marks). Rather, the fix is to:
     1. Replace full-sheet 3-layer micro-lane sweeps (`_lay3` + `_spl3_sml14_lad`) with **2 middle layers + regional Band 3 modeling (`_lay2_lt`)** and natural brush stroke lengths so passages develop **region by region and value by value** (~12,000–16,000 strokes total instead of 57,789) rather than a uniform sheet-wide fade-in.
     2. Replace the procedural foliage-noise squiggles in `opening-lines.json` and `closingink4-lines.json` with **clean, long, descriptive structural contours** (the winding path shoulders, wheel ruts, hillside ridge lines, major tree trunks, and outer canopy silhouettes) so the `10%` and `25%` stages immediately read as a human artist's structural line-and-wash sketch.
2. **Disagree With Keeping the Road as Unpainted White Paper Reserves**:
   - While classic edge/mark metrics were high (`9.17` / `9.30`), `classic value` (`5.54`) and `composition values` (`5.0`) suffered because the road was bleached white (`--litreserve 88` + `_lit60`) and the tree interiors were muddied by heavy black closing squiggles. Allowing a warm buff/ochre-sienna wash (`hansa + sienna`) across the roadbed while reserving only the tiny true sun-glints, and framing the road with crisp ink shoulder lines, will simultaneously raise `classic value`, `composition values`, and `edges detail`.
