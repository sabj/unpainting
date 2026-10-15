# Self-Review of Try 2 (Trumbull, Round V5)

## Part 1: Independent Evaluation (Before Reading `FEEDBACK.md`)

### 1. My Scores for Try 2
- **Finished Painting Score (0–10)**: **6.5 / 10**
- **Painting Process Plausibility Score (1–5)**: **2.8 / 5**

### 2. What Works
1. **Overall Architectural Proportions and Value Hierarchy**: The major architectural masses—the sunlit central gable, shadowed left return and chimney stack, recessed right wing with slate roofs, dark Gothic window apertures, ground-level colonnade arches, and foreground blue banner—sit in their proper spatial positions and carry a clear macro light-to-dark hierarchy.
2. **Elimination of Synthetic Rectangular Cutouts**: Removing the two explicit axis-aligned reserves from Try 1 eliminated the unnatural rectangular white stamps in the upper-right sky and main gable. The upper-right sky wash (`cerulean` + `French ultramarine`) and organic cumulus cloud reserves look clean and atmospheric.
3. **Warm Sunlit Gable Foundation**: The sunlit main gable plane achieves a luminous warm cream-ochre light key (`_lit15_lw`) that separates well in temperature from the cool blue-grey slate roofs and cool sky.
4. **Improved Early-to-Mid Progression (10% → 25% → 50% → 75%)**: Cutting the late touchpoint bloat from `_tp2` (7,769 strokes) to `_tp1` with `--touchmincells 0.025` restored visible differentiation across the 10%, 25%, 50%, and 75% stage frames compared to Try 1.

### 3. What Is Wrong and At Which Stage It Went Wrong
1. **Stage 1 (10%) & Stage 2 (25%) — Stencil-Like Masked Cutouts and Split Sunlit Gable Plane**:
   - **At 10% (`Band 1`)**: The initial pale foundation wash sweeps diagonally across only the left and center of the sheet, leaving the lower-right wing completely bare white paper, while isolated short pen ticks float inside the facade without connected structural drawing.
   - **At 25% (`Band 2`)**: Instead of a human watercolourist laying broad, continuous light-to-mid washes across architectural planes and painting darks over them later, the 25% frame shows **razor-sharp, jagged stencil cutouts** around every window, buttress, and highlight. Worse, the flat sunlit central gable is split down the middle into a dark ochre left half and a pale cream right half, breaking the unity of the primary lit plane.
2. **Stage 3 (50%) — Blotchy "Camouflage" Mottling and Pinhole White Speckles on Stone Walls**:
   - **At 50% (`Band 3`)**: As the midtone layers (`mid/b2L2`, `mid/b2L3`, and `mid/b3B` stone blocks with `_bvar` and `_mg12`) build up on the left return wall and right wing, they produce **amoeba-like blotchy patches** rather than horizontal ashlar masonry courses. Tiny, sharp unpainted white pinholes/speckles remain scattered across the middle of the shadowed left masonry wall where paper-white reserve cells or gaps between region masks were never bridged by a unifying wash.
3. **Stage 4 (75%) to Stage 5 (100%) — Stalled Late Progression and Muddy Vertical Smears on Buttresses & Foliage**:
   - **At 75% (`Band 4` / `Band 5`)**: The connected shadow glazes lay down heavy, opaque olive-brown vertical strips along the left-center buttress and right buttress. On the right side of the main gable, the shadowed buttress and the courtyard tree foliage merge into a single muddy brown-olive column, losing the fresh yellow-green sunlit tree crown seen in the target.
   - **Between 75% and 100%**: Almost all dark accents (window apertures, blue banner, street lamps, shadow glazes) are already present in the 75% snapshot. The change from 75% to 100% is minimal, meaning our stroke budget is still too front-loaded or mid-loaded relative to the final darks and closing ink.
4. **Finished Painting Deficiencies (`compare.png`)**:
   - **Loss of Crisp Architectural Detail**: The gable medallion/rose window is a soft smudge; the Gothic window tracery and mullions lack crisp geometric articulation; the stone courses read as blotchy camouflage (`_bvar` + `--midgain 1.2`) rather than crisp horizontal ashlar masonry.
   - **Muddy Foliage**: The bright yellow-green tree (`sap green` + `hansa yellow`) in front of the right wing is dull olive-brown.

---

## Part 2: Comparison with `bench/feedback/FEEDBACK.md` (Where I Agree and Disagree)

### 1. Summary of External Judge Feedback (`FEEDBACK.md`)
- **Finished Painting**: Composite `5.82 / 10` (`classic measures: 8.3` [value `6.2`, edge `9.08`, marks `9.62`], `composition values: 6.0`, `edges detail: 2.67`, `marks texture: 2.33`; VLM panel scores `3, 3, 4`).
- **Progression Judge**: Mean `2.6 / 5`, early mean (10% & 25%) `1.5 / 5` (`10%: 1/5`, `25%: 2/5`, `50%: 2/5`, `75%: 3/5`, `100%: 5/5`).
- **Named Progression Tells**:
  - `speckle or dotted trails instead of drawn lines` (3)
  - `the whole sheet at one faint value, as if faded in` (2)
  - `texture arriving as a dump, everything sharpening at once late` (2)
  - `fine detail already present in the first 25%` (1)
- **Judge Note**: *"The whole sheet appears faintly at 10% with windows and sky already resolved, then uniformly darkens with speckled noise — a dissolve/filter reveal of a finished watercolor rather than a painter's light-to-dark, region-by-region build-up."*

### 2. Where I Agree with the Judges (and Why)
1. **Low `edges detail` (`2.67`) and `marks texture` (`2.33`) Despite Strong `classic measures` (`8.3`)**:
   - I completely agree. Our macro value placement and physical brush mark statistics (`classic edge: 9.08`, `classic marks: 9.62`) are strong, but visually the stone walls suffer from **irregular blotchy mottling** (`_blk60_bmm40_bka20_birr` in the base recipe + `_bvar_ssp55_mg12`) and **scattered white pinhole speckles** on the shadowed left return wall. Meanwhile, the right buttress shadow and green tree foliage merge into a muddy olive-brown column, and fine architectural elements (window mullions, gable medallion) lack crisp edge definition.
2. **"Speckle or Dotted Trails Instead of Drawn Lines" (Named 3 Times) & 10% Stage (`1/5`)**:
   - I strongly agree. By cutting `opening-lines.json` down to just 38 isolated segments (`minLen=22`) and dropping opening pen pressure to `_opp24` (`0.24`), the opening drawing in the 10% frame looks like faint, disconnected tick marks floating across the sheet rather than a coherent architectural pencil/pen lay-in. Furthermore, in the 25% and 50% frames, tiny unbridged paper-white reserve holes (`--paperlights 1 --paperrel 1`) create white pinhole speckles across the midtone stone washes.
3. **"The Whole Sheet at One Faint Value, as if Faded In" (10%) & "Fine Detail Already Present in the First 25%" (25%)**:
   - I agree with the visual observation. At 10% (`922 / 8,483` strokes, the end of `Band 1`), a pale cream-ochre wash covers the entire building silhouette at one faint value (`0.16 * peak`), and by 25% (`Band 2`), the first midtone wash already clips around every tiny final window mullion, trim highlight, and leaf cutout across the whole canvas.
4. **"Texture Arriving as a Dump, Everything Sharpening at Once Late" (50% → 75%)**:
   - I agree. Because the base recipe runs `lay4` (4 thin global mid-layers) followed by `blk60_birr` stone blocks in `Band 3` (around 50% of strokes) and then dumps all `Band 4`/`Band 5` darks between 50% and 75%, the 50% stage looks like speckled noise over a faint underpainting, and then all crisp darks arrive suddenly in the second half.

### 3. Where I Disagree with the Judges (and Why)
1. **Literal Claim of a "Dissolve/Filter Reveal" vs. Structural Cause in `planLightToDark`**:
   - I disagree with the judge's literal inference that the image was produced by a global filter/dissolve: the painting genuinely executed light-to-dark watercolour passes (`Band 1` → `Band 5` → closing ink).
   - **However, the judge's visual perception points to a real planning flaw**: when all 4 midtone sub-layers (`lay4`) paint the **exact same fine-grained pixel masks** everywhere on the sheet simultaneously, and when tiny highlight cutouts and stone-block speckles are carved into the early washes from the start, the *visual result* mimics a global contrast/opacity ramp. To look like a human painter, early washes (`10%` and `25%`) must be **coarser, broader, connected regional washes** (or have a coherent structural line lay-in first) without tiny pinhole cutouts, and midtones should build with fewer, cleaner structural layers (`_lay2` or smoother masks) rather than 4 global passes of speckled masks.
2. **Over-Generous `5/5` on the 100% Progression Frame**:
   - While the judge gave the 100% stage `5/5`, my own inspection of `stages.jpg` shows that `75%` and `100%` are still too visually similar because almost all darks (`Band 4` and `Band 5`) have already landed by 75% of the stroke count. We should ensure the final 25% of strokes clearly shows the crispest dark recesses and architectural ink completion.
