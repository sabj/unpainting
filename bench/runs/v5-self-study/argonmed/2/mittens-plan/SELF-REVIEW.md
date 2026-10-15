# Self-Review of Try 1 (Mittens, V5)

## Part 1: Independent Assessment (Before Reading Judges' Feedback)

### What Works
- **Paper Whites & Overall Proportions**: The untouched paper ground, the cat's white bib and muzzle, and the high-key light across the man's forehead and nose bridge are cleanly preserved without wash flooding.
- **Focal Readability in the Eyes**: Both the cat's eyes and the man's eyes retain pin-point catchlights and dark pupil/lash accents, establishing recognizable expressions.
- **Restrained Line Weight**: The sepia ink lines (cat's ear tips, whiskers, brow hairs, and eye contours) are delicate and avoid heavy cartoon marker outlines.
- **General Warm/Cool Separation**: The cat reads as warm ginger/ochre while the man's hair reads as darker and cooler.

### What Is Wrong
1. **Hard-Edged Posterization / "Paint-by-Numbers" Value Islands**: Across the man's cheeks, nose shadow, moustache/beard, and the cat's chest/flank transitions, the mid-tone washes form crisp, isolated topographic rings rather than soft, feathered watercolor washes. The man's lower face looks fragmented into flat beige and tan patches.
2. **Man's Hair Colour Contamination & Patchiness**: In the target, the man's hair is a cohesive, smoky neutral charcoal/grey-black wash with soft wet variation. In our try 1 painting, the hair has warm brown/sienna fringes surrounding isolated dark ultramarine/sepia blobs, giving it a muddy, two-toned blotchy appearance.
3. **Cat's Iris Colour & Eye Rim Definition**: In the target, the cat's irises have a distinct pale celadon/olive-green tint surrounded by crisp black-brown eye rims, and the nose bridge has a rich rufous-orange wash. In try 1, the irises are dull warm grey-brown and the viewer's-left eye rim and nose leather are understated.
4. **Man's Stubble, Moustache & Chin Shadow**: The target shows a soft, continuous warm-grey/earth wash with fine directional bristle/stubble texture around the mouth and jaw edge. Try 1 breaks the moustache and chin into disjointed flat shapes with gaps on the lower lip/chin.
5. **Process & Stage Progression Issues**:
   - **Stage 1 (Early Lay-in)**: The first wash stage covers both the cat and the man simultaneously in an almost uniform, flat pale brown-grey silhouette with pre-cut negative-space holes, resembling a digital stencil/threshold mask rather than a human painter's wet first washes.
   - **Stages 2–3 (Mid-tone Build)**: Every region advances in lockstep by value band (`precise-watercolor` everywhere with 4 layers), creating concentric stepped value islands across the entire sheet at once.
   - **Stages 4–5 (Late Dark Accents & Closing)**: Stages 4 and 5 look nearly identical to Stage 3; too many late touch-up passes produce tiny incremental changes, making the end of the process look front-loaded and stagnant.

### At Which Stage It Went Wrong
- **Stage 1–2**: The uniform `precise-watercolor` style across all regions and the `lay4` value segmentation produced a stencil-like pale brown silhouette in Stage 1, followed immediately by hard-edged concentric contour steps in Stage 2.
- **Stage 3**: Warm sienna/raw-sienna midtones entered the outer halo of the man's hair before the dark cool washes, causing the brown fringe around the hair mass.

### Self-Assigned Scores
- **Finished Painting Score (0–10)**: **6.5 / 10** — Recognizable, clean high-key value structure and good focal eyes, held back by posterized midtone steps on the skin/fur and brown-fringed blotchy hair.
- **Process Plausibility Score (1–5)**: **2.5 / 5** — Follows a light-to-dark watercolor order and preserves whites, but the global threshold-band progression (all regions stepping uniformly together like a contour map) and near-static final stages betray an algorithmic value-slicing process.

## Part 2: Review of External Judges' Critique (`bench/feedback/FEEDBACK.md`)

### Summary of Judges' Scores & Notes
- **Finished Painting**: Composite `5.45 / 10` (`classic measures: 7.56` [value `6.78`, edge `8.87`, marks `7.04`]; VLM judges: `composition values: 5.33`, `edges detail: 2.67`, `marks texture: 2.00`; panel scores `3, 3, 4`).
- **Progression Judge**: Mean `2.3 / 5`, early mean (10% & 25%) `1.25 / 5` (`10%: 1`, `25%: 1.5`, `50%: 2`, `75%: 2`, `100%: 5`; human order: `0 / 2`).
- **Tells Named**:
  - *"the whole sheet at one faint value, as if faded in"* (6)
  - *"fine detail already present in the first 25%"* (3)
  - *"a region arriving finished while its neighbour is untouched"* (1)
  - *"texture arriving as a dump, everything sharpening at once late"* (1)
- **Render Record Issue**: `--foliagerefit` (`_leaf`) was explicitly included in `variant.txt` in try 1 instead of being left in the base recipe to be auto-skipped, causing `"Settings read by nothing: from your plan --foliagerefit"` (exit 3).

### Where We Agree with the Judges (and Root-Cause Diagnosis)
1. **Stroke-Count Skew Caused the 10% / 25% "Opacity Fade" Tell (Strongly Agree)**:
   - Looking at `previous-checkpoints.jsonl` alongside `stages.jpg`, the root cause of the `1.0` and `1.5` progression scores at 10% and 25% of strokes is crystal clear:
     - Passes 1–7 (the actual broad early washes) took only **87 strokes** (`1.8%` of the 4,899 total strokes).
     - Passes 1–31 (all 4 midtone value layers across the entire painting) took **1,152 strokes** (`23.5%` of total strokes).
     - Passes 32–57 (late micro-strokes from `_stub`, `_tsh8`, `_ts3`, `_tfl8`, `_dp80`, `_dg2`, and touch-up passes `_tp2`) consumed **3,747 strokes** (`76.5%` of all strokes!).
   - Because `stages.jpg` samples at **10%, 25%, 50%, 75%, and 100% of total strokes**, the 10% frame (stroke ~490) was already at Pass ~20 (with the entire silhouette filled in), and the 25% frame (stroke ~1,225) was already at Pass 32 (with almost all midtone layers complete!). Then frames 50%, 75%, and 100% spent 3,674 tiny strokes barely changing the image.
2. **Whole-Sheet Simultaneous Faint Wash in Early Passes (Agree)**:
   - Using `precise-watercolor` uniformly with `_lay4` caused Band 1 to lay a pale raw-sienna/brown wash across both the ginger cat and the man's black hair/face simultaneously, leaving pre-cut holes around whiskers and highlights.
3. **Low `edges detail` (2.67) and `marks texture` (2.0) on the Finished Painting (Agree)**:
   - Four unfeathered midtone bands (`_lay4` without edge softening/feathering or wet-in-wet regional styles) created hard stepped contour islands on the man's face and the cat's neck/chest, and left warm brown fringes around the dark blobs in the man's hair.

### Where We Disagree with the Judges
1. **"A region arriving finished while its neighbour is untouched (1)"**:
   - We disagree with this single tell: it directly contradicts the primary tell (`whole sheet at one faint value (6)`), and inspection of `stages.jpg` shows all regions developing simultaneously rather than one region finishing while its neighbour is blank.
2. **"Opacity fade of the finished painting" vs. Opening Ink + Stroke Skew**:
   - While we agree that the 10% and 25% frames *look* like an opacity fade, the mechanism was not an opacity filter; it was (a) drawing detailed ink lines (including whiskers and eye contours) in `opening-lines.json` before the first wash, (b) painting 4 nested value bands (`_lay4`) over the whole figure at once, and (c) inflating the late stroke count by ~3,700 micro-strokes so that 10% of strokes fell mid-painting. We should fix the actual mechanisms (eliminate detailed opening lines, cut late micro-stroke bloat, use fewer/softer mid layers and differentiated regional styles) rather than over-reacting to the "filter" metaphor.
