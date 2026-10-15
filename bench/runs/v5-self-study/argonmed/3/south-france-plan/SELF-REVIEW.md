# Self-Review of Try 2 (`south-france`, Round V5, Try 3 of 3)

## Part 1: Pre-Feedback Independent Assessment (Before Opening `bench/feedback/FEEDBACK.md`)

### 1. What Works
- **Overall Palette & Earth/Foliage Harmony**: Replacing the default CMY triad with explicit earth and foliage pigments (`ochre, sapgreen, sienna, hansa, cerulean, ultramarine, sepia`) eliminated the unnatural neon yellow and salmon-pink washes from Try 1. The warm yellow-ochre sunlit limestone terrace on the upper left, burnt-sienna terracotta roofs on the lower-right buildings, olive-green tree masses, and dark blue-green cypress accents sit in a believable Mediterranean palette.
- **Elimination of Mechanical Horizontal Laning**: Removing `_spl6_lad` eliminated the artificial 6 mm horizontal brick-grid striping across the hillside.
- **Multi-Stage Tonal Build**: Switching `styleSelection.style` to `"precise-watercolor"` restored progressive light-to-dark layering from Stage 1 (pale ochre ground) through Stage 2 (light olive/warm mid-washes) to Stages 3–5 (deeper greens, dark cypresses, and closing accents), rather than dumping all pigment into a single flat Band 1 slab.

### 2. What Is Wrong
1. **Noodle-Like Foliage Contours & Melted Architectural Pen Work (`opening-lines.json` / `closing-lines.json`)**:
   - The biggest visual defect in the finished painting and across all progress stages is the **pen linework**. Because the line tracer traced iso-luminance/contrast edges uniformly across the entire image and smoothed/chunked them, it covered the tree canopies with **wiggly, blobby, camouflage-like contour loops** around foliage clumps. A human urban sketcher draws crisp, straight architectural edges (roof ridges, eaves, vertical house corners, window frames, stone retaining walls, arches) and selective trunk/branch/cypress structure—never closed wiggly contour lines around every bush blob.
   - Conversely, on the architecture itself—especially the main lower-right building cluster, the upper-center village houses, and the upper-left retaining wall and gate—the pen lines are rounded, wobbly, and incomplete. The buildings look "melted" rather than rectilinear, and small dark architectural features (windows, shutters, eaves, arches) lack crisp geometric definition.
2. **Unpainted Bare-Paper Holes & Missing Upper-Village / Bottom-Slope Coverage**:
   - At the **top-center/upper-right village crest** (`x ≈ 0.55..0.88, y ≈ 0.00..0.18`) and **bottom-center path/slope** (`x ≈ 0.52..0.80, y ≈ 0.86..1.00`), large areas remained bare white paper throughout all 5 stages, with ugly brown spatter/stipple dots floating on raw white paper at the bottom edge.
   - In the target, those areas are warm sunlit limestone walls/roofs and sunlit earth/grass (`L* ≈ 82–88`), not bare white paper. Even with `_cur`, the painter's internal light/coverage threshold left the brightest 10–15% of the sheet unpainted.
3. **False Sky-Blue Patch on the Upper-Left Village Wall (`x ≈ 0.15..0.22, y ≈ 0.00..0.06`)**:
   - A bright cerulean-blue patch was painted in the upper-left where the target actually shows sunlit warm stone walls and shaded vertical cypresses/arches.
4. **Visible Diagonal Wide-Brush Slab in Early Stages (Stages 1–2, 10%–25%)**:
   - In `stages.jpg` panels 2 and 3 (10% and 25%), the first pale wash sweeps in a rigid diagonal band (`/` angle across the center of the sheet) that cuts across architectural and foliage forms alike, while leaving the top-right and bottom-right corners stark white.
5. **Lack of Crisp Architectural Massing & Muddy Mid-Tone Foliage**:
   - In the finished painting, the lower-right buildings merge into the surrounding olive-green washes because greens bleed over the building walls and roof edges, while the mid-ground village houses (`x ≈ 0.18..0.45, y ≈ 0.00..0.22`) dissolve into amorphous grey-green blotches.
   - Furthermore, using 7 pigments with `_lay3` produced 106 passes, leading to over-layered, slightly muddy olive-brown mid-tones in the foliage and heavy dark blotches (`_cg12_dk12`) in the middle canopy.

### 3. At Which Stage It Went Wrong
- **Stage 1 (10% — Opening Ink + First Pale Wash)**: Already compromised by the wiggly camouflage-blob pen contours over the foliage, melted/incomplete architectural lines on the village buildings, the stark diagonal wide-brush swath, and the unpainted white voids at the top village crest and bottom slope.
- **Stage 2 (25% — Light Washes)**: The false cerulean-blue spot appears at the top-left, the unpainted white holes at top-center and bottom-center persist, and the uniform olive-ochre wash flattens the distinction between stone architecture and tree canopy.
- **Stages 3–5 (50%–100% — Mid and Dark Washes + Closing Ink)**: Deep green and dark blue-black washes build contrast, but the wiggly blob outlines in the trees, the melted building geometry, the green wash encroachment onto stone walls, and the raw white paper holes with brown spatter at the bottom remain locked in through the end.

### 4. Pre-Feedback Self-Scores
- **Finished Painting Score (0–10)**: **5.2 / 10** — Good Mediterranean earth/olive palette and recognizable composition, but held back by wiggly contour-map pen lines across the trees, melted non-rectilinear building geometry, unpainted white voids at top and bottom with stray spatter, and weak separation between stone architecture and surrounding foliage.
- **Painting Process Plausibility Score (1–5)**: **2.5 / 5** — Much better color order and brushwork than Try 1's pink washes and horizontal brick lanes, but the opening pen stage looks algorithmically traced (wiggly iso-luminance loops over foliage instead of architectural sketching) and the early wash leaves unnatural white cutouts at the top and bottom.

---

## Part 2: Post-Feedback Analysis — Where We Agree and Disagree with `bench/feedback/FEEDBACK.md`

### 1. Summary of Harness Feedback on Try 2
- **Finished Painting**: Composite **6.88 / 10** (`classic measures: 8.44` [value `6.14`, edge `9.48`, marks `9.69`]; VLM judges `5, 5, 6`; sub-scores: `composition values: 5.67`, `edges detail: 4.00`, `marks texture: 5.33`).
- **Progression Judge**: Stage scores **4, 3, 3, 3, 4** (mean **3.4**, 10%/25% mean **3.5**, human order of work **1 of 1**).
- **Progression Judge Tells**:
  - *"the whole sheet at one faint value, as if faded in (3)"*
  - *"no change from the previous snapshot (1)"* (specifically between 50% and 75%)
  - *"texture arriving as a dump, everything sharpening at once late (1)"*
  - *Judge note*: *"The sequence reads line-first, light-to-dark, detail-last like a real sketch, but the whole sheet advances as one uniform value fade with almost no change at 75% and a late texture dump, rather than regions leading and lagging as a painter would."*
- **Render Record**: `15,069` total brush strokes (`4,192` strokes through pass 67 of 106, meaning **10,877 strokes** occurred in the final passes after pass 67).

### 2. Where We Strongly Agree with the Judges (and the Mechanical Root Causes)
1. **"Almost no change at 75% and a late texture dump" (Progression Judge)**:
   - **Why we agree**: Looking at `stages.jpg`, panels 4, 5, and 6 (50%, 75%, and 100% of strokes) look nearly identical in overall value and massing, with only fine stipple/spatter and closing ink changing at the end.
   - **Root cause in the render record**: Because `stages.jpg` samples at **10%, 25%, 50%, 75%, and 100% of total stroke count** (`15,069` strokes), and Passes 1–67 (all main light and mid-tone washes) used only `4,192` strokes (`27.8%` of total strokes!), the remaining `10,877` strokes (`72.2%` of all strokes!) were consumed by late micro-strokes (foliage leaf dabs `_leaf`, recess strokes `_rec2x`, dark accents, spatter, and closing ink `_ink4` / `_dwg200`). Consequently, by the 50% stroke mark (`stroke 7,535`), all major washes were already finished! Both 50% and 75% fell inside the massive tail of tiny detail/texture strokes. Reducing late micro-stroke/detail bloat (or shifting stroke budget into regional mid-tone washes and trimming excessive late detail passes) will spread the main value and regional development evenly across 10% -> 25% -> 50% -> 75% -> 100%.
2. **"The whole sheet at one faint value, as if faded in" at 10% and 25% (Progression Judge)**:
   - **Why we agree**: At 10% (`stroke 1,507`, near end of Band 1) and 25% (`stroke 3,767`, Band 2), the entire sheet is covered in a uniform pale olive-ochre wash without regional lead/lag (e.g., building the warm sunlit village/terrace vs. cool/olive foliage at distinct paces or contrasts).
   - **Root cause**: All 5 families in `config.json` were given identical `"precise-watercolor"` style and painted across full-sheet value bands with 7 pigments (`106` passes), and the opening pen lines were too uniform in weight (`width=1, weight=1`) and lacked strong architectural hierarchy.
3. **Low `edges detail` (`4.00 / 10`) and `composition values` (`5.67 / 10`, `classic value: 6.14`)**:
   - **Why we agree**: This directly matches our pre-feedback critique #1, #2, and #5. `edges detail` scored only `4.00` because:
     1. The architectural edges (roofs, walls, windows, towers, retaining walls) were rounded and melted rather than straight and crisp, while foliage was covered in wiggly contour-map loops.
     2. `_efade` (`--edgefade 1.2`) and `_ew3` (`--edgewobble 0.3`) softened and wobbled hard architectural and shadow edges that needed to stay crisp on the buildings.
     3. Green foliage washes bled across the warm ochre/terracotta building facades.
   - And `composition values` (`5.67`) / `classic value` (`6.14`) suffered because of the unpainted bare-white paper holes at the top-center village crest and bottom-center slope (`L* ≈ 98` instead of `L* ≈ 83` warm ochre), plus over-darkened mid-canopy blotches.

### 3. Where We Disagree or Nuance the Judges' Critique
1. **"Regions leading and lagging as a painter would" vs. Painter Architecture**:
   - While the progression judge asks for regions to lead and lag rather than the whole sheet advancing together, in `src/paint/methods/light-to-dark.mjs` the value ladder always steps globally from Band 1 to Band 5 (`value = 1..5`). Attempting to assign different styles (such as `"urban-sketch"` or `"atmospheric-wet"`) to individual regions in `styleSelection.regions` triggers `bench/check.sh`'s refusal for **"unsupported axis-aligned seams"** on Band 1 and activates the destructive `ink-and-wash` value-floor zeroing in `light-to-dark.mjs`.
   - Therefore, we **disagree** with trying to force region lead/lag via mixed `styleSelection.regions` styles. Instead, the right way to make stages 10%, 25%, 50%, 75%, and 100% look like authentic regional progression is:
     1. Fix the **stroke-count distribution** across bands so 10% = opening ink + warm ochre first wash, 25% = light washes on stone & sunlit foliage, 50% = mid-tone foliage & terracotta roofs, 75% = deep cypresses & architectural shadows, 100% = dark recesses & crisp closing architectural ink (instead of 72% of strokes happening after the main washes!).
     2. Make the **opening and closing pen drawings** genuinely architectural and structural (crisp straight building walls, roofs, windows, arches, cypresses; no contour-map loops on bushes) so the village reads clearly from Stage 1 and sharpens cleanly at Stage 5.
2. **Noise in Process Judge's "Late Texture Dump" vs. "No Change at 75%"**:
   - Both tells are two sides of the exact same stroke-indexing phenomenon: because ~10,800 tiny strokes happened in the late passes, 50% and 75% both sampled the middle of that late pass tail. Fixing the stroke distribution fixes both tells simultaneously.

