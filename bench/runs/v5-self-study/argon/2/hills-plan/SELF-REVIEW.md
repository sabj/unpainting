# Self-Review of Try 1 (Hills — Loose Ink and Wash)

## 1. Independent Assessment (Before Reading Judges' Feedback)

### What Works
- **Macro compositional structure**: The alternating diagonal bands of sunlit hillside and dense tree foliage are clearly recognizable and match the large-scale geometry of `target.png`.
- **Value range**: The painting achieves genuine deep darks in the tree shadows (`_dk14`) against high-key openings in the meadows and path, avoiding the flat mid-value compression common in timid watercolour passes.
- **Light-to-dark sequence**: Across the progress frames (`stages.jpg`), the painting builds in a broadly logical watercolour order: pale foundation wash (Stage 1) -> warm green hill washes (Stage 2) -> mid-value olive foliage masses (Stage 3) -> deep shadow accents in the canopy (Stage 4) -> closing dark ink linework (Stage 5).

### What Is Wrong and At Which Stage It Went Wrong
1. **Stage 1 (Opening Lines & First Light Wash) — Mechanical vertical strip artifacts and cool overall tint**:
   - **What went wrong**: The very first wash covers almost the entire sheet in a pale cool bluish-green tint divided into visible vertical rectilinear columns/stripes.
   - **Why**: Using `_spl4_lad` (`--strokeplan 1 --lanemm 4 --laneadapt 1`) partitioned the broad washes into axis-aligned vertical stroke lanes that left visible vertical seam lines across the sunlit hills. Additionally, the opening ink drawing had only 161 sparse, fragmented lines that failed to establish the continuous borders of the winding dirt trail or the structural tree trunks.
2. **Stage 1–2 (Paper Reserves & Path Colour) — Stark white cutout trail with no warm ochre body**:
   - **What went wrong**: The winding dirt path appears as jagged, stark white unpainted paper cutouts bordered directly by olive-green turf, looking like a white stream or torn paper rather than a sunlit warm ochre/sienna dirt road.
   - **Why**: Relying purely on automatic paper-light reservation without warm ochre/sienna washes on the path shoulders—and omitting yellow ochre / burnt sienna from `--paints` (attempting to mix ochre from `hansa + rose + sapgreen`)—left the trail devoid of its signature warm buff/ochre glow.
3. **Stage 2–3 (Sunlit Hills & Mid-Tone Washes) — Muddy olive-khaki greens and over-extended wash reach**:
   - **What went wrong**: In Stage 2 and especially Stage 3, the vibrant sunlit yellow-green hills turn dull, flat olive-khaki, still showing the vertical grid seams from `_spl4_lad`. Meanwhile, the mid-tone foliage washes expand too far (`_wre6`, `--washreach 0.6`), swallowing the crisp boundaries between sunlit grass and tree crowns and erasing small internal light gaps within the woods.
4. **Stage 3–4 (Dark Foliage Masses) — Blurry, monochromatic swamp-green blobs**:
   - **What went wrong**: In the target, the wooded areas have distinct rounded tree crowns and rich colour separation between cool slate/indigo-blue shadows (central diagonal ridge and lower right) and warm olive/brownish-green foliage. In Stage 3 and Stage 4, the tree masses merge into fuzzy, uniform dark olive-charcoal blobs (`_ms600_st34`) with soft, mushy outer edges and very little blue/warm-olive chromatic variety.
5. **Stage 5 (Closing Ink) — Heavy, disconnected black squiggles ("worms") instead of structural drawing**:
   - **What went wrong**: When the closing ink is applied in Stage 5, `--inkkscale 6` makes the lines overly thick and jet-black. Instead of crisp, varied contour work defining the edges of the dirt path, tree trunks, and leafy crown silhouettes, the closing lines appear as heavy, isolated squiggles floating inside the dark foliage blobs, while the edges of the winding path remain almost completely un-inked.

### Self-Scores
- **Finished Painting Score (0–10)**: **4.5 / 10**
- **Plausibility of Painting Process (1–5)**: **2.5 / 5**

## 2. Comparison with External Judges' Critique (`bench/feedback/FEEDBACK.md`)

### Summary of Judges' Scores
- **Finished Painting**: Composite **5.89 / 10** (`classic measures: 8.12` [value 5.99, edge 9.3, marks 9.08]; vision judges: `composition values: 6`, `edges detail: 3`, `marks texture: 3`; Kimi-K3: 3, GLM-5.3-Flash: 3, Qwen3.5-9B: 5).
- **Progression Judge**: Mean **2.6 / 5** (10%: 2, 25%: 2, 50%: 2, 75%: 3, 100%: 4; mean of 10% & 25%: 2.0).

### Where I Agree with the Judges (and Why)
1. **Low scores on `edges detail` (3/10) and `marks texture` (3/10)**:
   - I strongly agree. Our Try 1 settings (`_spl4_lad`, `_wre6`, `_ms600_st34`, `--inkkscale 6`) produced three visible texture/edge flaws:
     1. Mechanical vertical lane seams (`_spl4_lad` / `--strokeplan 1 --lanemm 4 --laneadapt 1`) across the sunlit hills.
     2. Over-merged, mushy dark foliage blobs (`_wre6` = `--washreach 0.6`, `_ms600_st34`) that obliterated individual tree-crown articulation and small light intervals.
     3. Heavy, disconnected black "squiggle texture" (`--inkkscale 6`) instead of varied, structural ink contours along the path edges and tree trunks.
2. **"The whole sheet at one faint value, as if faded in" & "flat evenly-toned slabs standing in for a form" (10%, 25%, 50% stages scoring 2/5)**:
   - I agree with this observation on `stages.jpg`. In Stage 1 (10%) and Stage 2 (25%), the first light washes covered nearly the entire canvas (both the sunlit hills and the wooded areas) in uniform, flat, full-sheet slabs with vertical stripe boundaries, rather than painting distinct regional passages (e.g., laying in the warm sunlit grass and golden-ochre path first, then building the foliage masses). Because `_wre6` (`--washreach 0.6`) and `_lay4` spread diluted washes across 95%+ of the sheet in the early passes, 10%, 25%, and 50% look like the same full-sheet mask gradually darkening globally.
3. **"Squiggle texture and a finished white path shape appear at 10%"**:
   - I agree. Two things caused this tell at 10%:
     1. `opening-lines.json` placed 161 dark, isolated foliage squiggles all over the canvas before the first wash (rendered dark by `--inkkscale 6`), which read to the judge as premature fine squiggle texture scattered globally at 10%.
     2. The entire dirt road was held out as a sharp, unpainted stark white reserve against a full-sheet wash right at 10%, so its exact final white cutout silhouette appeared immediately in Stage 1 instead of emerging organically through warm ochre washes and progressive bordering foliage.
4. **`classic value` lagging behind `classic edge` and `classic marks` (5.99 vs 9.3 and 9.08)**:
   - I agree. Because the sunlit grass became too dull/olive in Stage 2–3 and the dark tree masses spread too far (`_wre6`) with `_dk14`, the mid-high value separation between sunlit yellow-green grass, warm buff path shoulders, and cool/warm tree masses became compressed and slightly too dark/muddy overall.

### Where I Disagree with the Judges (and Why)
1. **Contradictory progression tells ("fine detail already present in the first 25%" vs. "texture arriving as a dump, everything sharpening at once late")**:
   - These two single-vote tells pull in opposite directions for a loose ink-and-wash style. In genuine ink-and-wash painting, artists either start with a structural pen/pencil drawing and wash over it, or build washes first and apply expressive pen linework at the end (or use a light structural underdrawing and crisp closing ink accents). Completely eliminating both early structure and closing ink would violate the requested **loose ink and wash** style. However, the judges' underlying visual complaint is valid: the *opening* drawing should not be dark, fragmented foliage squiggles scattered over the whole page, and the *closing* drawing should not be thick, heavy black worms (`--inkkscale 6`) dumped onto blurry blobs without intermediate brush texture.
2. **Vision judge overall scores of 3/10 (Kimi-K3, GLM-5.3-Flash)**:
   - A 3/10 understates the macro compositional accuracy and strong classic edge/mark metrics (8.12 classic composite), though Qwen3.5-9B's 5/10 and the composite 5.89/10 are fair given the vertical lane artifacts, white cutout path, and heavy squiggle ink.
