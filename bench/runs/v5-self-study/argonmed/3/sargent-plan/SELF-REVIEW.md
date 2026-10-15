# Self-Review of Try 2 (Before Reading External Feedback)

## 1. Independent Assessment of Previous Painting (`previous-painting.png` vs `target.png`)

### What Works
- **Pure Watercolor Medium**: Suppressing ink lines (`opening-lines.json` and `closing-lines.json` set to `"medium": "none"`) properly honors the "pure watercolor, no ink" requirement and avoids artificial pen outlines.
- **Luminous Paper Reserves & Major Silhouette Placement**: The sunlit cream hull on the right (`x: 0.62..0.90, y: 0.08..0.65`), the foreground sunlit anchor on the lower left (`x: 0.05..0.29, y: 0.72..0.92`), the two dark hanging fenders on the upper right, and the dark oval hawsehole in the upper-center bow are all clearly recognizable and well-placed.
- **Warm Paper Ground**: Setting `--paperrgb 221,215,199` matches the warm off-white rag paper tone of Sargent's sheet.

### What Is Wrong
1. **Topographic / Jigsaw Contour Stepping in the Central Bow**:
   - In the target, the large central shadowed bow (`x: 0.22..0.63, y: 0.02..0.85`) is a unified, sweeping cerulean/ultramarine wash that grades smoothly from cool blue-grey on the left/center to richer blue on the lower-right edge, broken by diagonal white drybrush/scraped highlights and a dotted orange-sienna chain/rust line.
   - In our Try 2 painting, the bow is cleaved vertically down the middle into flat, hard-edged quantized islands (a pale grey left island pockmarked with circular pinhole cutouts and a medium-blue right island with a jagged, map-like boundary). This comes from `--shaperefit 3` combined with `_cg12` and uniform `precise-watercolor` style without atmospheric wet-in-wet blending on the bow plane.
2. **Over-Dark, Muddy, Sprawling Darks in the Lower Bow and Upper-Left Rim**:
   - In the target, the deepest dark at the waterline is a compact dark wedge right under the bow foot (`x: 0.28..0.46, y: 0.76..0.92`), while the lower-right corner of the blue bow (`x: 0.45..0.63, y: 0.68..0.88`) stays a luminous ultramarine/cerulean blue. Similarly, the upper-left bow rim (`x: 0.20..0.42, y: 0.0..0.26`) is a crisp, narrow dark accent along the gunwale.
   - In Try 2, `--darkgain 2.0` (`_dg2`) and `--darkpunch 0.85` (`_dp85`)—compounded by the final touch-up pass (`_tp1` with `--touchdmin 0.12`)—flooded the lower bow (`x: 0.42..0.63, y: 0.68..0.92`), the area around the anchor, and the upper-left rim with heavy, opaque, ragged charcoal-olive blotches.
3. **Muted Warm Chroma (Rust/Chain Dots, Right Spar, Left Masts)**:
   - Sargent's vibrant burnt-sienna/orange accents—the beaded orange-rust line descending along the upper-right bow edge (`x: 0.42..0.56, y: 0.02..0.48`), the dotted orange chain links curving below the hawsehole (`x: 0.26..0.46, y: 0.35..0.56`), and the rich reddish-sienna lower section of the right diagonal spar (`x: 0.79..0.90, y: 0.45..0.98`)—were washed out into dull tan/grey because `_hue` painted all warm yellow/sienna passes first and later cool blue/green passes painted over or desaturated them.
4. **Dull Olive-Brown Lower-Right Water**:
   - The lower-right water (`x: 0.65..1.0, y: 0.66..1.0`) should have fresh turquoise-cerulean and lively green horizontal broken ripples over cream paper, but in Try 2 it turned into a flat, murky olive-brown wash.

### At Which Stage It Went Wrong (`stages.jpg`)
- **Stage 1 (Early light wash)**: Covers a huge block of the left and center with a flat, horizontally banded pale beige/grey wash. The horizontal scanline-like brush tracks across the central bow look mechanical rather than following the diagonal/curving planes of the ship hull.
- **Stages 2–3 (Midtone passes, passes 15–38)**: As blue and brown midtones build up, `--shaperefit 3` snaps wash boundaries to sharp, jagged contour islands. At Stage 3 (pass 38), the painting still has decent watercolor transparency and lightness, though the central bow is split into two distinct value steps.
- **Stages 4–5 (Dark passes 39–50 and touch-up pass 51)**: This is where the painting degrades severely. Passes 39–50 (`_dg2`, `_dp85`) lay down overly heavy, blotchy black-olive darks across the bottom and upper-left bow. Then Pass 51 (the `_tp1` touch-up pass, which added 820 micro-strokes in a single pass from 1,898 to 2,718 total strokes) peppers the darks and edges with tiny, crusty, high-contrast digital-looking fragments.

### Self-Assigned Scores (Before Reading `FEEDBACK.md`)
- **Finished painting score (0–10)**: **5.8 / 10** — Recognizable composition, good paper tone, and clean right-hull reserve, but heavily penalized by the posterized/stepped bow planes, over-dark muddy lower-bow blotches, and loss of warm orange-sienna detail.
- **Process / plausibility score (1–5)**: **2.5 / 5** — Early horizontal wash banding and the sudden late-stage deluge of jagged contour-fitted darks and 820 tiny touch-up strokes look algorithmic rather than human-painted.

---

## 2. Comparison With External Judges (`bench/feedback/FEEDBACK.md`)

### Summary of External Scores
- **Finished painting composite**: **6.12 / 10** (`classic measures: 8.23` [value 6.54, edge 8.52, marks 9.63]; vision judges: `composition values: 6`, `edges detail: 3.67`, `marks texture: 3`, overall 4/10 from all three VLM judges).
- **Progression judge**: **2.8 / 5 mean** (`10%: 1/5`, `25%: 2/5`, `50%: 2.5/5`, `75%: 3.5/5`, `100%: 5/5`; 10% & 25% mean: `1.5/5`).
- **Render record warning**: `--wetgate` in `extra-args.json` was read by nothing (causing painter exit code 3).

### Where We Agree with the Judges (and Why)
1. **Early stages (10% and 25% of strokes) look like a uniform global fade-in (`1/5` and `2/5`)**:
   - We strongly agree. Tracing the exact mechanics in `light-to-dark.mjs` and `paint-plate.mjs` reveals three compounding causes in Try 2:
     1. **`_lay2` (`--midlayers 2`) + `_hue` (`--layerhue 1`)**: When `washLayers > 0`, `L0` (`j=0`) covers 100% of non-protected cells across the entire sheet at `1/count[i]` (~half) of middle demand, and `L1` covers 70% of the sheet at the remaining half. Thus Passes 1–6 (Band 1) painted the entire sheet at ~15% strength, Passes 7–14 (`L0`) painted the entire sheet at ~35% strength, and Passes 15–22 (`L1`) painted the entire sheet again at ~60% strength.
     2. **Pigment ordering (`--paints ochre,sienna,ultramarine,cerulean,sapgreen`)**: Because `planLightToDark` loops `pigment = 0..k-1` inside each band, putting `ochre` and `sienna` first meant the painter drew the small warm rigging, masts, anchor, fenders, and chain dots at the start of every band before laying the broad blue bow and sea washes—directly causing the `"fine detail already present in the first 25%"` tell.
     3. **Massive final touch-up pass (`_tp1` with `--touchdmin 0.12`)**: Pass 51 added 820 micro-strokes (30.2% of all 2,718 strokes) at the very end, shifting the 10% and 25% stroke markers forward to Pass 10 and Pass 20 (well into `L0`/`L1` where every shape had already been lightly tinted).
2. **Late texture/dark dump ("texture arriving as a dump, everything sharpening at once late")**:
   - We agree completely. In Try 2, `_dp85` (`--deepaccent 85`, NOT darkpunch!) and `_dg2` (`--deepgrow 2`, NOT darkgain!) placed every cell with `max(R,G,B) < 85` plus a 2-cell halo (`< 130`) into `deepMask`, which zeroed their middle weights, gave them `0.75 + 0.75 = 1.50x` weight in Bands 4 & 5 multiplied by base `_dk13` (`--darkgain 1.3`) = **1.95x density**, and set `accentCells[i] = 1` (bypassing `_ms1500` down to 12-cell fragments!). Combined with 820 touch-up strokes in Pass 51, this dumped hundreds of heavy, crusty dark blotches in the final quarter.
3. **Low `edges detail` (3.67) and `marks texture` (3.0) on the finished painting (central bow vertical split & pinholes)**:
   - We agree. Our code trace identified the exact causes of the hard vertical cliff and pinhole cutouts down the middle of the central blue bow:
     1. **Base `_skyb` (`--skyblue 1`) with default `--skywide 0`**: In `paint-plate.mjs` line 437, `isSky(i)` splits the blue pigment at the hard threshold `B - R > 8`, moving all blue where `B - R > 8` (the right side of the bow) into the granulating sky-blue pan `js` and keeping `B - R <= 8` (the left side of the bow) in `jb`, creating two disjoint Swiss-cheese masks with complementary pinholes right down the center of the bow!
     2. **`--layerhue 1` (`_hue`) and `--middomain 1` (default)**: In `targetRegions`, Cluster 1 (left bow, mean RGB `146,152,145`, `B < R`) gets `coolGroup = 3`, while Cluster 6 (right bow, mean RGB `133,148,152`, `B > R`) gets `coolGroup = 2`, slicing the bow along the cluster boundary in every layer.
     3. **`--shaperefit 3` and missing `--strokeplan`**: Flattened each planning shape to a single uniform mean instead of laying overlapping brush lanes graded by footprint demand.
     4. **Missing red-violet pigment (`rose`)**: With only `ochre,sienna,ultramarine,cerulean,sapgreen`, the palette's sheet+local ΔE error was `5.24` (neutral dark greys off by `4.0` toward muddy olive-green, and bright orange chain/rust off by `3.1`). Adding `rose` (`cerulean,ultramarine,sapgreen,ochre,sienna,rose`) drops sheet+local error to `2.43` (every local color within `0.6–0.9`).

### Where We Disagree with the Judges (and Why)
1. **"The sequence shows a digital opacity fade of the completed image rather than a painting process" (Diagnosis of mechanism)**:
   - While the visual impression at 10%–25% of strokes genuinely resembled a global fade-in, it was not a static image dissolve—it was the mechanical consequence of `_lay2` whole-sheet quantile layers + `ochre,sienna`-first pigment ordering + 820 late touch-up strokes skewing the stroke percentiles. Replacing `_lay2` with `_lay0_nest_onedom`, putting `cerulean,ultramarine,sapgreen` first in `--paints`, and raising `--touchdmin` to `0.24` directly fixes the progression.
2. **Finished panel rated `5/5` by the progression judge vs `4/10` (`edges detail: 3.67`, `marks texture: 3`) by the finished-painting judges**:
   - At thumbnail scale (`stages.jpg`), the macro composition and reserves read well (`5/5`), but at full 1200px inspection the finished-painting judges rightly penalized the `B - R > 8` skyblue split, cluster seams, and over-dark `_dp85_dg2` blotches.


