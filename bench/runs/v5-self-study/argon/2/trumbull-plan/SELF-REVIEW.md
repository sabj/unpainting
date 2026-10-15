# Self-Review of Try 1 (Trumbull, Round V5)

## Part 1: Independent Assessment (Before Reading Judges' Feedback)

### Own Scores
- **Finished Painting Score (0–10):** **6.2 / 10**
- **Process / Plausibility Score (1–5):** **2.8 / 5**

### What Works
1. **Overall Composition and Silhouette:** The major massing of Trumbull College—the central sunlit gable, flanking stone wings, steep slate roofs, upper sky dome with white cloud masses, the foreground yellow-green tree at right-center, and the blue vertical banner on the light pole—is clearly recognizable and well-proportioned against the target.
2. **Sky and Cloud Contrast:** The cerulean/ultramarine sky wash in the upper right and upper left establishes a convincing watercolor sky value and leaves bright cloud shapes around the rooflines.
3. **Foreground Accents:** The blue street banner (`x=0.37..0.43, y=0.57..0.73`) with its reserved white emblems, the turquoise street-name signs, and the warm yellow-green tree foliage (`x=0.62..0.76, y=0.62..0.96`) anchor the street-level scene effectively.

### What Is Wrong
1. **Glaring Rectangular Reserve Artifact on the Right Chimney (`[0.78, 0.15, 0.83, 0.20]`):**
   The manual reserve `Y1.cloud-bright-core` at `[0.78, 0.15, 0.83, 0.20]` was placed where sky and the left side of the right chimney stack actually sit in the target. This created an obvious, razor-sharp axis-aligned white rectangle punched out of both the blue sky wash and the left face of the right chimney stack, destroying the chimney silhouette.
2. **Muddy Olive-Green Cast Shadows on Warm Stone (`_pgreen` Base Palette):**
   Because the base recipe includes `_pgreen` (which substitutes sap green for raw umber in the 5-pigment palette), dark neutral/shadow mixtures on the stone architecture shifted toward murky olive-green (`x=0.21..0.28, y=0.18..0.73` and `x=0.62..0.70, y=0.32..0.65`). Instead of crisp, cool violet-brown or warm burnt-sienna/umber architectural shadows, the vertical crease and buttress shadows read like moss or foliage growing up the wall.
3. **Confetti-like White Pinholes and Blotchy Camouflage Texture on Left Stone Walls:**
   On the left wing and recessed stone bay (`x=0.00..0.41, y=0.18..0.75`), the combination of heavy mid-tone layer overlap (`_lay4`), high stone-block modulation, and tiny unpainted gaps created a speckled, camo-like surface riddled with pinpoint white paper holes instead of coherent ashlar stone planes.
4. **Diagonal Brush-Band Artifacts on the Central Sunlit Gable:**
   The sunlit face of the main gable (`x=0.41..0.63, y=0.22..0.44`) shows pale diagonal stripes from the opening wash where adjacent brush strokes left lower-density channels that never integrated with the surrounding stone tone.
5. **Weak Architectural Linework and Lost Gothic Details:**
   With only 176 sparse traced lines in `opening-lines.json` / `closing-lines.json`, critical architectural features of a "precise architectural watercolor" are missing or mushy:
   - The circular stone relief medallion in the gable apex (`x=0.46..0.50, y=0.09..0.16`) is nearly invisible.
   - The pointed Gothic arch windows (`x=0.45..0.62, y=0.40..0.56`) lack their delicate stone mullions and Y-tracery, collapsing into ragged dark blobs.
   - The right chimney's vertical flue panelling and the lower entrance arches (`x=0.46..0.63, y=0.81..0.96`) lack crisp structural definition.

### At Which Stage It Went Wrong
- **Stage 1 (First washes & opening lines, passes 1–16):**
  - The rectangular reserve at `[0.78, 0.15, 0.83, 0.20]` immediately punched a hard geometric white hole into the sky wash and right chimney.
  - The broad diagonal first wash left visible diagonal pale streaks across the sunlit central gable (`x=0.45..0.58, y=0.25..0.42`).
  - The opening pen drawing (only 176 lines) was too sparse and fragmented to establish the Gothic window tracery, roof cornices, and chimney flues.
- **Stage 2 (Light-to-mid washes, passes 17–40):**
  - Rather than building broad planar washes distinguishing sunlit gable from shaded return walls, the stone washes broke into small, ragged patches with scattered pinhole paper gaps across the left half of the building.
- **Stage 3 (Mid-to-dark passes, passes 41–64):**
  - The shadow passages along the central gable's left crease and right buttress came in with heavy sap-green/olive mixes (`_pgreen`), blurring the boundary between stone shadow and ivy/foliage.
- **Stages 4 & 5 (Late passes 65–98 and closing lines):**
  - Over 10,000 tiny strokes were spent in passes 64–98 doing micro-dabs and stone-block stippling that barely changed the overall visual structure between Stage 3, Stage 4, and Stage 5, making the final three progress frames look nearly stalled rather than showing a clear progression from big washes to crisp architectural details and decisive closing linework.

## Part 2: Comparison With External Judges' Critique (`bench/feedback/FEEDBACK.md`)

### Summary of Judges' Scores
- **Finished Painting Composite:** `5.32 / 10` (`classic measures: 7.64` [value `6.26`, edge `9.46`, marks `7.2`]; VLM sub-scores: `composition values: 5.67`, `edges detail: 3`, `marks texture: 2`; individual VLMs: Kimi-K3 `4`, Qwen3.5-9B `3`, GLM-5.3-Flash `2`).
- **Progression Judge:** Stage scores `1, 1, 1, 1, 2` at `10%, 25%, 50%, 75%, 100%` of strokes (mean `1.2 / 5`).
  - Named tells: *"the whole sheet at one faint value, as if faded in (4)"*, *"no change from the previous snapshot (3)"*, *"fine detail already present in the first 25% (2)"*, *"speckle or dotted trails instead of drawn lines (1)"*, *"texture arriving as a dump, everything sharpening at once late (1)"*.

### Where We Agree With the Judges (and Why)
1. **"No change from the previous snapshot (3)" and "Fine detail already present in the first 25% (2)" — Exact Mechanical Root Cause:**
   We strongly agree with these progression observations, and `previous-checkpoints.jsonl` reveals the exact numerical cause:
   - The progression strip samples frames at **10%, 25%, 50%, 75%, and 100% of total brush strokes**.
   - In Try 1, the entire 5-band light-to-dark watercolor progression (Passes 1–64) took **3,725 strokes**, while the late touch-up passes (Passes 65–98, driven by base token `_tp2` -> `--touchpoints 2 --touchgain .6`) added **10,432 tiny touch-up dabs** (73.7% of all 14,157 strokes!).
   - Because 73.7% of the stroke count consisted of microscopic post-wash touch-ups, **25% of total strokes (stroke 3,539) landed at Pass 62 of 81**, when nearly the entire painting and its dark details were already on the sheet! Then **50% (stroke 7,078), 75% (stroke 10,618), and 100% (stroke 14,157)** all landed inside the micro-touchup tail (Passes 65–98), making the last three stages in `stages.jpg` look virtually indistinguishable.
2. **Low `edges detail` (3) and `marks texture` (2) on the Finished Painting:**
   We agree that edge precision and mark quality fell short of a crisp architectural watercolor:
   - The misplaced rectangular reserve `[0.78, 0.15, 0.83, 0.20]` carved a sharp white notch out of the right chimney and sky.
   - The 4 mid-layers (`_lay4`) combined with high irregular block modulation (`_blk60_bmm40_bka20_birr`) and 10,432 touch-up dabs (`_tp2`) produced speckled, blotchy surface clutter with white pinhole gaps across the left wing.
   - Base palette token `_pgreen` (replacing raw umber with sap green) caused stone cast shadows to render as muddy olive-green rather than architectural shadow glazes.
3. **"Speckle or dotted trails instead of drawn lines (1)":**
   We agree: the opening and closing drawings had too few lines (176 / 143) and broke Gothic mullions and the gable medallion into disconnected ticks, while `_tp2` peppered the edges with thousands of tiny paint specks.

### Where We Disagree With the Judges (and Why)
1. **Disagreement With the Progression Judge's "Filter / Wipe / Dissolve with No Value Planning" Diagnosis:**
   The progression judge scored stages 1–4 at `1/5` claiming the image was *"a dissolve of a completed image rather than a hand-painted progression"* with *"no value planning."* In fact, the painter executed a genuine light-to-dark watercolor value ladder across Passes 1–64 (sky and pale ochre ground first, then warm stone mid-tones, then foliage, shadows, and window recesses). The reason it *looked* compressed into the first two frames of `stages.jpg` is purely that the 10,432 late touch-up strokes skewed the 10%/25%/50%/75% stroke-count sampling checkpoints. Eliminating or drastically reducing the late touch-up stroke bloat will spread the 10%, 25%, 50%, 75%, and 100% stroke checkpoints properly across the actual light, mid-light, mid-tone, shadow, and dark/closing-ink stages.
2. **Disagreement With Extreme Finished-Score Outliers (`GLM-5.3-Flash: 2` vs `classic edge: 9.46`):**
   `GLM-5.3-Flash`'s score of `2/10` under-credits the accurate macro value massing, warm sunlit ochre vs. blue sky balance, and recognizable architectural silhouette (reflected in `classic measures: 7.64` and our own `6.2/10`). Conversely, `classic edge: 9.46` is purely a gradient-alignment metric and misses the semantic damage caused by the white rectangular reserve notch on the right chimney and the missing Gothic window tracery.
