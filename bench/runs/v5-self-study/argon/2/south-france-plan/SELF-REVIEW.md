# Self-Review of Try 1 (`France`, Round V5)

## 1. Independent Assessment (Before Reading `FEEDBACK.md`)

### Scores
- **Finished Painting Score**: **3.5 / 10**
- **Process Plausibility Score**: **2.0 / 5**

### What Works
1. **Warm Sunlit Ground (`_relonly`)**: Preserving the source-relative warm cream-ochre paper tone avoids harsh cold-white holes and suits the sunlit Provençal limestone palette.
2. **Local Hue Recognition in Select Passages**: The terracotta roof caps on the right-hand building cluster, the cool blue-grey distant valley in the upper-right corner, and the branching dark armatures of the lower-left foreground tree read with recognizable local color and placement.
3. **Final Touch-up Chroma Variety**: Some of the late olive, sap-green, and warm ochre clusters capture the Mediterranean palette better than the initial pale washes.

### What Is Wrong
1. **Severe Diagonal Unpainted / Depleted Strip Across the Entire Sheet**:
   - A wide, ruler-straight diagonal corridor slanting from the upper center (`x ≈ 0.45–0.55, y ≈ 0.0`) down to the lower-left/center (`x ≈ 0.28–0.45, y ≈ 1.0`) is missing its foundation and mid-tone washes. It slices right through the upper village, central olive canopy, and foreground hillside, breaking the composition into two disconnected halves.
2. **Camouflage-Patch Segmentation & Missing Mid-Values**:
   - Because `urban-sketch` style collapses intermediate value bands (Bands 2 and 3) into a two-band jump (Band 1 foundation + Band 4 shadow) unless mid-layers are explicitly preserved, the foliage never builds volume gradually. Instead, disconnected olive and dark-green blotches float directly over flat pale washes or bare paper like stencil/camouflage patches.
3. **Opaque Black Blobs Instead of Structured Shadows**:
   - Pushing `_dk14` and late touch-up passes (`--touchfamilies 40 --touchgain 0.90 --floorfrom 3`) after the mid-tones failed caused the dark passes to deposit heavy, opaque near-black puddles across the central foliage and cypresses, while leaving the lower-left and far-right shadow masses under-modeled.
4. **Weak Architectural Structure & Under-Delivered Pen-and-Wash Idiom**:
   - The target and brief call for **urban sketch, pen plus light wash**, where crisp ink linework carries the geometry of the Provençal stone houses, rooflines, windows, and terrace retaining walls over transparent washes. In Try 1, the opening drawing (167 lines) and closing ink are far too sparse and faint on the buildings: the upper village (`y < 0.25`) and the upper-left stone terrace walls nearly vanish, and the main building cluster on the right lacks crisp gables, eave shadows, and window apertures.

### At Which Stage It Went Wrong
- **Stage 1 & Stage 2 (Passes 1–14, Band 1 Foundation Wash)**: This is where the fatal error occurred. The painting was started without stroke-plan laning (`_spl16_sml50` was omitted at `start`) and advanced straight from pass 0 to pass 14 (`run 14`) before inspecting. During passes 1–14, the full-sheet Band-1 wash depleted its brush reservoir mid-sweep, leaving the huge diagonal unpainted corridor across the center of the sheet. Because `paint.sh revise` at boundary 14 cannot undo passes already painted on the paper, revising at pass 14 could not repair the ruined foundation wash.
- **Stage 3 (Passes 15–23, Band 4 Shadow Wash)**: With no Band 2 or Band 3 mid-tone transitions, Stage 3 jumped abruptly from the streaky Stage 2 base to isolated dark olive islands, leaving the central diagonal gap glaringly exposed.
- **Stages 4 & 5 (Passes 24–35, Touch-up Passes & Closing Ink)**: Adding `_tp2` with 40 touch-up families (`--touchfamilies 40 --touchgain 0.90 --floorfrom 3`) attempted to patch the missing middle values with small opaque dabs—producing spotty yellow-green dots inside the bare central strip and heavy black blotches in the canopy rather than a cohesive watercolour progression.

## 2. Comparison with External Judges (`bench/feedback/FEEDBACK.md`)

### Summary of External Judge Scores
- **Finished Painting**: Composite `4.92 / 10` (Classic measures `7.16`: value `5.92`, edge `8.68`, marks `6.87`; VLM judges `3, 3, 2` with `composition values: 4`, `edges detail: 2`, `marks texture: 1.67`).
- **Progression Judge**: Mean `2.0 / 5` (`10%: 1`, `25%: 1`, `50%: 1.5`, `75%: 2`, `100%: 4.5`). Named tells: *whole sheet at one faint value (4)*, *straight travelling front / wipe or raster sweep (4)*, *flat evenly-toned slabs (4)*, *texture arriving as a dump late (3)*.

### Where We Agree and Why
1. **Overall Process Score (`2.0 / 5`) and Early Stage Failure (`10%: 1`, `25%: 1`)**:
   - Our self-review process score (`2.0 / 5`) matches the progression judge mean (`2.0 / 5`) exactly.
   - We completely agree with the tells ***"a straight travelling front, a wipe or raster sweep"*** and ***"flat evenly-toned slabs standing in for a form"***. In frames 1 (10%) and 2 (25%) of `stages.jpg`, the parallel diagonal wash lanes and the wide, ruler-straight unpainted diagonal corridor cutting down the middle of the sheet look unmistakably mechanical.
2. **Late Texture Dump (***"texture arriving as a dump, everything sharpening at once late"***)**:
   - We agree with this observation and can pinpoint its exact cause in `previous-checkpoints.jsonl`:
     - Passes 1–14 (Band 1) took `907` strokes.
     - Passes 15–23 (Band 4) reached `2,374` strokes.
     - Passes 24–35 (the revised touch-up passes with `--touchfamilies 40 --touchgain 0.90 --floorfrom 3`) added `1,578` small touch-up strokes (`3,952` total)!
     - Because `stages.jpg` samples at **10%, 25%, 50%, 75%, and 100% of total strokes**, bloating the end of the painting with `1,578` tiny touch-up strokes pushed `10%` (`395` strokes) and `25%` (`988` strokes) entirely into the pale Band-1 wash, while packing all mid/dark detail into the `50%–100%` frames.
3. **Low `edges detail` (`2.0`) and `marks texture` (`1.67`) on the Finished Painting**:
   - We agree that the architectural edges of the Provençal village (rooflines, stone facades, windows, terrace walls) are poorly defined and that the foliage marks read as flat camo-like patches and black blobs rather than structured watercolor washes and crisp urban-sketch pen work.

### Where We Disagree and Why
1. **Judge Claim That *"the entire finished composition uniformly fades/sharpens in as a filter uncovering a done image"***:
   - We disagree with the judges' interpretation of *why* the sequence looked like a fade-in filter. It was not a global fade-in filter; rather, three concrete parameter choices created that impression:
     1. The opening drawing (`_ol220_opp55`, only 167 faint lines at pressure `0.55`) was nearly invisible at 10% and 25%, so instead of reading as a bold pen-and-ink urban sketch on paper that gets washed over, the faint lines + pale Band-1 wash looked like a low-opacity ghost of the whole scene.
     2. Using `urban-sketch` as the global style suppressed Bands 2 and 3 (the intermediate value ladder steps), leaving a huge gap between the pale Band-1 wash (frames 1–2) and the dark Band-4/touch-up blotches (frames 3–5).
     3. Adding 40 touch-up families (`1,578` late strokes) skewed the stroke-percentile sampling (`10%, 25%, 50%, 75%, 100%`) so the first two stage snapshots both captured only the pale Band-1 foundation.
2. **Progression Judge Score of `4.5 / 5` at 100% vs. Finished Painting VLM Scores of `2–3 / 10`**:
   - The progression judge rated the 100% stage `4.5 / 5`, which is overly generous given the persistent diagonal pale stripe down the center and the heavy black blobs in the canopy. Conversely, the `2 / 10` score from `Qwen3.5-9B` underweights the strong classic edge (`8.68`) and mark (`6.87`) metrics. Our own `3.5 / 10` finished score is a more balanced assessment.
