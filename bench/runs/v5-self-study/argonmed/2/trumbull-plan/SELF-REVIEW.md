# Self-Review of Try 1 (`bench/feedback/previous-painting.png`)

## 1. Independent Assessment (Before Reading `bench/feedback/FEEDBACK.md`)

### What Works
- **Overall Architectural Massing and Value Separation**: The main sunlit gable (`Y1.sun-main-gable`), the cooler shadowed left return wall (`Y1.cool-main-return`), the right courtyard wing, and the slate roofs establish a convincing three-dimensional architectural reading.
- **Warm Stone vs. Cool Shadow Contrast**: The sunlit gable carries a luminous pale yellow-ochre / hansa foundation while the left wing and vertical buttress shadow planes step down into cooler, deeper sienna/ultramarine mixtures.
- **Masonry Course Texture**: Using `--stonesplit 55` (`_ssp55`) and `--stonecourses 1` (`_bvar`) alongside the base stone-block tokens (`_blk60_bmm40_bka20_birr`) creates varied horizontal stone coursework on the left wing and right facade that echoes Collegiate Gothic ashlar masonry.
- **Crisp Dark Recesses and Foreground Accents**: The Gothic window openings, the blue lamppost banner with its white emblem reserves, and the green courtyard tree (`_leaf`) read clearly and anchor the composition.

### What Is Wrong
1. **Unnatural Rectangular Paper-White Holes (Axis-Aligned Reserve Artifacts)**:
   - In the upper-right sky (`[0.76, 0.09, 0.80, 0.12]`), the explicit reserve `cloud-corridor-upper-right` produced a stark, razor-sharp axis-aligned white rectangle punched out of the blue sky wash. Because the painter already preserves natural paper-white cloud shapes automatically from the target, adding a bounding-box reserve created a synthetic geometric cutout.
   - Similarly, on the sunlit main gable (`[0.578, 0.255, 0.592, 0.275]`), `gable-window-trim-glint` created a small sharp white square cutout right next to the third lancet window.
2. **Visible Diagonal Brush-Lane Streaks Across the Sunlit Gable**:
   - In Stage 1 (the light foundation wash) and persisting into the final painting, diagonal parallel pale streaks (`~45°`) run across the main sunlit gable face from the upper lancet windows down toward the central arched windows. Instead of a smooth, unified sunlit stone wash or horizontal masonry coursework, the foundation wash split into diagonal brush strokes with unpainted/paler gaps between lanes.
3. **Slightly Muddy/Patchy Olive-Grey Shadow Vertical Strip on Left Buttress & Foliage**:
   - The vertical shadow strip between the left wing and the main gable, as well as the lower-left foliage/window zone, became somewhat blotchy and heavy in Stage 3–5, with dark brown/olive dabs that lose some of the crisp architectural plane structure of the target.
4. **Target Chroma & Warmth on the Main Gable**:
   - In the target (`target.png`), the sunlit gable has a rich golden-sienna warmth at the peak (around the rose medallion and upper gable) with crisp pale limestone window hoods/trim, and the slate roof on the left slope of the main gable is a stronger, more continuous cool blue-slate plane. In Try 1, the left roof slope is broken by too many white gaps, and the upper gable medallion is barely suggested by two stray pen squiggles.
5. **Linework Sparsity / Fragmented Pen Contours**:
   - With only 176 opening pen lines and 143 closing lines, many architectural edges (such as the gable coping, window mullions/tracery, roof ridges, and the circular gable medallion) have discontinuous, wobbly, or missing ink lines, while a few isolated squiggles float on the masonry.

### At Which Stage It Went Wrong
- **Stage 1 (First washes / Pass 1–16)**: The two rectangular reserves (`cloud-corridor-upper-right` and `gable-window-trim-glint`) immediately stamped hard rectangular holes into the sky and gable washes. Simultaneously, the first pale ochre wash on the main gable left visible diagonal stroke-lane gaps.
- **Stage 2 (Early-mid washes / Pass 17–42)**: The diagonal streaks on the sunlit gable remained visible as surrounding mid-tones built up; the upper-right rectangular hole in the sky became even more obvious as the cerulean/ultramarine sky darkened around it.
- **Stage 3–5 (Mid-to-dark passes & touch-ups / Pass 43–98)**: While the dark Gothic windows, banner, and stone blocks came together well, the heavy touch-up passes (`passes 81–98`, where stroke count jumped from 6,090 to 13,859) added dense small dabs across the lower-left wall and buttress shadow without fixing the sky cutout or gable streaks.

### My Own Scores (Before Reading Feedback)
- **Finished Painting Score (0–10)**: **7.2 / 10** — Strong overall architectural presence, good color harmony and window/banner detail, but penalized by the obvious rectangular white reserve cutout in the sky, the smaller square cutout on the gable, and diagonal wash streaks on the main facade.
- **Process Plausibility Score (1–5)**: **3.8 / 5** — Follows a genuine light-to-dark watercolor order (opening ink lines -> pale washes -> mid stone layers -> dark window recesses and foliage -> closing ink), but the sharp rectangular reserve cutouts in Stage 1–2 and the sudden burst of 7,700+ tiny touch-up strokes at the end detract from a natural human hand.

---

## 2. Comparison with External Judges (`bench/feedback/FEEDBACK.md`)

### Summary of External Feedback
- **Finished Painting Scores**:
  - Composite: `5.31 / 10`
  - Classic measures: `7.62` (classic value `6.30`, classic edge `9.39`, classic marks `7.16`)
  - VLM judges (`Kimi-K3`, `GLM-5.3-Flash`, `Qwen3.5-9B`): `3 / 10` each (`composition values: 5.33`, `edges detail: 3`, `marks texture: 2`)
- **Progression Judge Scores (1–5)**:
  - `10%`: `1.0`, `25%`: `1.0`, `50%`: `1.5`, `75%`: `1.5`, `100%`: `4.5` (mean `1.9`, human order `0 of 2`)
  - Named tells: *"the whole sheet at one faint value, as if faded in (7); fine detail already present in the first 25% (6); speckle or dotted trails instead of drawn lines (3); no change from the previous snapshot (1)"*.

### Where I Agree with the Judges
1. **Progression Problem — Early Full-Sheet Coverage & Late Stagnation (`50%` to `100%`)**:
   - Looking at `bench/feedback/stages.jpg`, I strongly agree with the progression judges' diagnosis of why the 10%, 25%, 50%, and 75% snapshots looked non-human:
     - **At 10% and 25% of strokes**: Because Try 1 used `176` opening pen lines across the entire building *and* immediately laid a uniform pale Band 1 wash across almost the entire building silhouette, the 10% snapshot (`~1,386` strokes) already showed fine pen outlines everywhere plus a nearly uniform pale tan silhouette across the whole sheet ("the whole sheet at one faint value, as if faded in" and "fine detail already present in the first 25%").
     - **At 50%, 75%, and 100% of strokes**: Because `--touchpoints 2` (`_tp2`) added `7,769` tiny corrective strokes after pass 80 (more than **56% of the total 13,859 strokes!**), the main painting (`passes 1–80`, `6,090` strokes) was already finished by **44% of the total stroke count**! Consequently, the snapshots at `50%`, `75%`, and `100%` of strokes look almost identical ("no change from the previous snapshot"), while pushing all the early wash stages into the first 0–25% of the stroke timeline!
2. **Speckle / Dotted Trails Instead of Drawn Lines**:
   - Agree. In `opening-lines.json` and `closing-lines.json`, the traced lines had short fragmented segments and high-contrast window/stone speckles, and in Stage 1 (`10%`) those thin, broken sepia lines read as dotted/speckled contour trails floating over a faint wash.
3. **Marks & Texture / Edges & Detail Penalties**:
   - Agree that the unnatural axis-aligned white rectangular reserve cutouts in the upper-right sky and main gable, combined with the diagonal brush-lane streaks across the sunlit gable and the blotchy olive-brown dabs from 2 rounds of touchpoints, degraded both `marks texture` (`2`) and `edges detail` (`3`).

### Where I Disagree with the Judges
1. **"Every panel is the same finished watercolor at rising opacity — a dissolve reveal"**:
   - I partially disagree with the literal claim that it is a "dissolve filter". Physically, the painter executed a genuine light-to-dark watercolour sequence (Band 1 light washes -> Band 2 four middle layers -> Band 3 stone blocks & dry-brush texture -> Band 4–5 shadow glazes and dark window recesses -> closing ink).
   - However, the *reason* it looked like a global opacity reveal to the judge at `[10%, 25%, 50%, 75%, 100%]` is an **artifact of stroke-count distribution**:
     1. Having `4` nested whole-sheet middle layers (`_lay4`) plus Band 1 meant the entire building darkened uniformly step-by-step across the first 40% of strokes.
     2. Having `_tp2` (`--touchpoints 2`) consume 56% of all strokes at the very end compressed the entire actual painting into the first 44% of strokes, making 50%, 75%, and 100% nearly static and making 25% already contain mid-tones and stone details across the whole building!

### Key Actionable Conclusions for Try 2
1. **Fix the Stroke Timeline Distribution (Eliminate or Drastically Reduce Touchpoint Bloat)**:
   - In Try 1, `_tp2` (`--touchpoints 2`) generated `7,769` strokes (56% of the run) after the main ladder was already done, freezing the 50%–100% progression frames and compressing the entire build-up into 0%–44%. By setting `--touchpoints 0` (or `_tp0`), the `10%`, `25%`, `50%`, `75%`, and `100%` stroke checkpoints will map directly onto the true painting stages:
     - `10%`: Opening structural lines + first sky/light washes.
     - `25%`: Early warm stone and slate foundation washes.
     - `50%`: Mid-value architectural planes and stone coursework.
     - `75%`: Connected shadow glazes and dark Gothic window recesses (Band 4).
     - `100%`: Final deep recesses (Band 5) and crisp closing architectural linework.
2. **Eliminate Synthetic Rectangular Reserves**:
   - Set `"reserves": []` in `config.json`. The painter's built-in `--paperlights 1 --paperrel 1` (and optional `--litlift` / `--litreserve`) automatically preserves natural paper-white cloud shapes and sun-struck stone glints along real target contours without punching razor-sharp axis-aligned rectangles into the sky or gable.
3. **Improve Brushwork & Wash Continuity on the Main Gable (`region_w15` / `_spl6_lad` / `_lay2`)**:
   - Test `region_w15` (`--brushchoice 1`) or `_spl6_lad` (`--strokeplan 1 --lanemm 6 --laneadapt 1`) and `_lay2` (`--midlayers 2`) so washes are laid with natural passage-fitted brushes and distinct regional value steps rather than 4 global fade-in layers with diagonal streak gaps.
4. **Refine Opening and Closing Linework**:
   - Reduce opening lines to only clean, long structural architectural contours (no short speckled fragments in the first 10%!), and reserve finer window/mullion/arch accents for the closing ink pass (`closingink4-lines.json`) so fine detail is *not* already present everywhere at 10% and 25% of strokes.
