# Self-Review of Try 1 (`hills`, Round V5, Try 2 of 3)

## Part 1: Independent Assessment (Before Reading `FEEDBACK.md`)

### 1. What Works
- **Macro compositional layout**: The broad diagonal sweep of the sunlit hillside on the right/center versus the dense diagonal band of oak and chaparral tree masses running from upper-left to lower-right is recognizable.
- **Deepest shadow tonal weight**: In the final stages, the darkest interior tree masses achieve a genuinely deep slate-charcoal density rather than staying pale or washed out.
- **No rectangular reserve seams**: Avoiding large axis-aligned rectangular reserves prevented artificial straight cutouts in the middle of the washes.

### 2. What Is Wrong
1. **Severe under-drawing / missing "loose ink and wash" character**:
   - The target is fundamentally a *loose ink and wash* illustration defined by hundreds of crisp, calligraphic, scalloped sepia/black ink strokes outlining every tree canopy, foliage clump, grass bank, and road edge.
   - Try 1 has almost no ink work: only 64 sparse opening lines and a small number of thick, isolated worm-like black branch squiggles in the closing pass. The scalloped foliage silhouettes and road-edge ink lines are completely absent, making the painting look like blotchy camo-wash rather than ink-and-wash.
2. **Loss of the winding sandy path**:
   - In the target, the winding dirt path (climbing from bottom left-of-center `x ≈ 0.22–0.28, y ≈ 0.56–1.0`, curving around the central oak clump at `x ≈ 0.08–0.14, y ≈ 0.16–0.48`, plus the upper fork at `x ≈ 0.34–0.39, y ≈ 0.0–0.10`) is a crisp, continuous, bright warm-cream ribbon (`RGB ~ [248, 228, 192]`) framed by dark ink banks.
   - In Try 1, only tiny ragged white specks (`0.29%` of the sheet) were protected by frisket; the rest of the roadbed was over-painted by olive-khaki hillside layers, reducing the road to a narrow, ragged white scratch.
3. **Camouflage / "archipelago" blotchiness and rust-orange edge artifacts**:
   - The tree canopies read as isolated, flat, dark blue-slate puddles with visible diagonal brush striping inside them, surrounded by unnatural rust-orange/terracotta dots and halos (caused by multi-pigment separation / shape-refit or touchpoint passes depositing Quinacridone Rose around dark blue shapes).
   - Inside the tree masses, the mid-tone foliage modeling (warm olive crowns vs cool slate shadows) collapsed into flat dark blue blobs floating on a muddy olive background.
4. **Dull, over-worked sunlit hillsides (loss of fresh yellow-green chroma)**:
   - The target's sunlit grass is a vibrant, luminous lemon/chartreuse yellow-green (`RGB ~ [195, 215, 95]` to `[225, 232, 140]`). Try 1 over-layered the hillsides across 72 passes (12,669 strokes!), turning the bright sunlit grass into a flat, murky khaki-olive.

### 3. At Which Stage It Went Wrong
- **Stage 1 (Opening + Band 1, Passes 1–10)**: Went wrong immediately. First, only 64 opening ink lines were drawn, looking like random black twigs rather than structural ink-and-wash underdrawing. Second, Band 1 ran without multi-lane stroke planning (which was only added via revision at pass 10), leaving a diagonal depletion wedge on the right and painting isolated grey-pinkish island shapes where the dark trees sit instead of a unified luminous ground wash.
- **Stages 2–3 (Middle Washes, Passes 11–50)**: The 4 middle layers (`_lay4`) with `_spl20_sml90_lad` painted flat grey-blue island shapes for the tree masses while muddying the yellow-green grass and encroaching on the sandy path.
- **Stage 4 (Band 4–5 Shadows, Recesses & Touchpoints, Passes 51–72)**: The dark blue-black recesses and touchpoints created harsh dark blue blotches with orange-red pigment halos/speckles around their borders and heavy stroke count (12,669 strokes).
- **Stage 5 (Closing Ink)**: Failed to deliver the dense, fine, expressive ink linework that unifies the target's foliage and road contours; instead it only added a few heavy black trunk/branch lines.

### 4. Self-Assigned Scores (Before Reading `FEEDBACK.md`)
- **Finished Painting Score (0–10)**: **4.5 / 10** — The macro diagonal arrangement and dark value range are present, but the signature loose ink-and-wash linework is missing, the sandy path is mostly lost, the grass is dull khaki instead of vibrant yellow-green, and the dark tree masses look like blue-black camouflage blotches with orange speckles.
- **Process Plausibility Score (1–5)**: **2.2 / 5** — A human ink-and-wash painter either lays down a coherent structural ink drawing first and washes cleanly over it, or washes fluid light-to-dark masses and finishes with comprehensive pen work. Starting with 64 disconnected twigs, painting isolated grey-blue islands in Stages 1–3, and ending with 12,669 strokes and almost no contour ink looks mechanical and fragmented.

---

## Part 2: Comparison with `bench/feedback/FEEDBACK.md`

### 1. Summary of External Feedback
- **Finished Painting**: Composite `5.42 / 10` (`classic measures: 7.83` [value `6.63`, edge `8.97`, marks `7.90`]; VLM sub-scores: `composition values: 4.67`, `edges detail: 2.67`, `marks texture: 2.33`; judge overall scores: `3, 4, 2`).
- **Progression Judge**: Mean `2.8 / 5` (`10%: 2`, `25%: 2`, `50%: 2`, `75%: 3`, `100%: 5`; `10%/25% mean: 2.0`; human order: `0 of 1`).
  - **Named tells**: *"flat evenly-toned slabs standing in for a form (3)"*, *"the whole sheet at one faint value, as if faded in (2)"*, *"texture arriving as a dump, everything sharpening at once late (2)"*.
  - **Judge note**: *"Every snapshot is the complete picture at rising opacity—full composition, path and tree slabs faintly present from 10% and darkening uniformly—so it reads as a filter fade-in rather than marks accumulating area by area, even though the loose ink lines themselves look hand-drawn."*

### 2. Where We Agree with the Judges (and Why)
1. **Low `edges detail` (2.67) and `marks texture` (2.33) in the finished painting**:
   - **Agree strongly**: Although `classic edge` (`8.97`) and `classic marks` (`7.90`) were high on pixel-level metrics, the VLM judges rightly penalized the lack of crisp ink-and-wash edge definition (`2.67`) and the blotchy, unnatural wash texture (`2.33`). In a loose ink-and-wash piece, the viewer expects lively calligraphic contour lines defining the tree crowns and the winding path, plus clean, fresh watercolor washes—not 12,669 over-layered brush strokes with orange-red halos around flat dark-blue slabs and only a few heavy black branch lines.
2. **"Flat evenly-toned slabs standing in for a form" & "Whole sheet at one faint value, as if faded in" at 10%, 25%, 50%**:
   - **Agree strongly**: Because Try 1 used `_lay4` (4 full-sheet middle layers) combined with `_spl20_sml90_lad` (which multiplied the stroke count to `12,669` strokes!), the 10% (`~1,267` strokes), 25% (`~3,167` strokes), and 50% (`~6,334` strokes) progress snapshots all landed inside the 4 repetitive full-sheet middle wash layers (`passes 11–50`, `strokes 603–7403`). Every one of those middle layers repainted the exact same pre-segmented tree-island and hillside footprints across the whole sheet at incrementally higher opacity! Furthermore, in Band 1 + L0, the cool tree-canopy shapes were already isolated as pale grey-blue/lilac puzzle pieces over the whole sheet rather than emerging organically over a warm sunlit ground wash.
3. **"Texture arriving as a dump, everything sharpening at once late" (between 50%, 75%, and 100%)**:
   - **Agree**: Because the first 58% of strokes (`7,403 / 12,669`) were spent on 4 dilute middle wash layers (`L0..L3`), all dark foliage texture (`_tfl10`, `_tv8`), deep recesses (`_rec2x`), shape touchpoints (`_tp2`), and closing ink (`_ink4`) were compressed into the final quarter of the timeline. And because the opening ink had only 64 sparse lines while the closing ink was relatively sparse/heavy, the structural sharpness only appeared at the very end.

### 3. Where We Disagree with or Qualify the Judges' Notes
1. **Judge claim that "loose ink lines themselves look hand-drawn" (as if the ink was sufficient)**:
   - **Disagree / Qualify**: While the few ink lines that were drawn looked hand-drawn in isolation, there were far too few of them! The target has rich, scalloped pen work across all the oak canopies, scrub banks, and road edges. Try 1 suppressed the opening drawing to 64 lines (`--openinglines 64 --openingminmm 6`) and used a custom `closingink4-lines.json` that left most canopy crowns un-outlined, resulting in thick isolated black twigs inside blue blobs.
2. **Progression judge noise at 100% (`5/5`) vs finished judges (`3, 4, 2`)**:
   - **Qualify**: The progression judge gave the 100% frame `5/5`, whereas the finished-painting VLM judges gave `3, 4, 2` (`composition values 4.67`, `edges detail 2.67`, `marks texture 2.33`). We should not be lulled by the `5/5` at 100% on the tiny progression strip: at full resolution (`compare.png`), the finished painting clearly suffers from missing road definition, muddy khaki grass (instead of bright yellow-green), rust-orange pigment artifacts around dark blue slabs, and missing scalloped ink contours.
