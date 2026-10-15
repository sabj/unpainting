# Self-Review of Try 1 (France, V5)

## 1. Independent Assessment (Before Reading Judges' Feedback)

### What Works
- **Macro value and dark mass placement**: At a squint, the dark vertical cypress spires in the upper-left-center, the diagonal dark foliage belt running behind and around the lower-right buildings, the cool blue-grey distant valley at top right, and the lower-left foreground tree armature sit in the right places.
- **Lower-right building cluster roofs and shadow side**: The terracotta roof planes and the shaded violet-brown wall of the lower-right stone buildings capture some of the three-dimensional mass and warm/cool contrast of the target.
- **Foreground tree structure**: The branching trunk and canopy in the bottom-left foreground read as a recognizable tree anchoring the foreground.

### What Is Wrong
1. **Six artificial rectangular white holes (explicit `reserves`)**: The six small rectangular reserves in `config.json` stamped stark, hard-edged white squares across the canvas (including right in the middle of green foliage at middle-left and center, and on house walls). They look like missing tiles rather than natural watercolor paper reserves.
2. **Mechanical horizontal brick/grid banding across all washes**: The entire hillside and underpainting show a repetitive horizontal striped/brick-course texture (`_lad` / block-course rendering covering foliage and slopes) that destroys organic foliage character and looks completely synthetic.
3. **Blown-out ragged white holes on the houses and upper-left terrace**: Combining `"style": "urban-sketch"` with `_lw_lit18` caused the painter to leave huge, ragged unpainted white patches across the upper-left golden stone terrace, the upper village facades, and the lit walls of the lower-right buildings instead of painting a pale warm ochre/sienna stone wash.
4. **Missing urban-sketch pen structure**: The requested style is **urban sketch, pen plus light wash**, yet only 90 opening pen lines were drawn and the pen linework is barely visible in either the opening stage or the finished piece. The upper village houses, stone retaining walls, windows, and roof eaves lack crisp ink definition.
5. **Unnatural yellow/orange early progression**:
   - **Stage 1 (Opening)**: Shows yellow blotches instead of a clean ink drawing on white paper.
   - **Stage 2 (First wash)**: Covers the entire sheet—foliage and buildings alike—in a heavy, mechanical orange-peach brick grid with isolated dark dabs already dropped in.
   - **Stage 3 (Midtones)**: Replaces the orange grid with a monotonous yellow-green horizontal grid across the whole sheet before building forms are established.
   - **Stages 4 & 5 (Darks and Closing)**: Almost no change between Stage 4 and Stage 5; the closing ink revision at the `closing` boundary failed to add visible structural pen work.

### At Which Stage It Went Wrong
- **Stage 1 (Opening)**: Failed immediately to establish a true urban-sketch pen drawing (`opening-lines.json` had only 90 sparse lines, and yellow pre-wash blotches appeared instead of crisp pen lines).
- **Stage 2 (First wash)**: Went severely wrong here—the global orange horizontal-brick underwash, the punched-out white holes (`_lit18` + 6 rectangular `reserves`), and premature dark spots made the process look mechanical rather than human.

### Self-Assigned Scores
- **Finished painting score (0–10)**: **4.5 / 10** — Recognizable composition and darks, but marred by hard white square reserve artifacts, mechanical horizontal brick banding across the foliage, blown-out white holes where warm ochre stone walls should be, and weak pen work.
- **Process plausibility score (1–5)**: **2.0 / 5** — The yellow-blotch opening, full-sheet orange brick-grid first wash, and near-identical stages 4 and 5 look algorithmic rather than like a human urban sketcher working from ink drawing to light washes to dark accents.

---

## 2. Comparison with External Judges' Feedback (`bench/feedback/FEEDBACK.md`)

### Summary of External Scores
- **Composite finished score**: **5.27 / 10** (classic measures 7.86; VLM judges: Kimi-K3 = 2, GLM-5.3-Flash = 4, Qwen3.5-9B = 2; subscores: composition/values 4.67, edges/detail 2.67, marks/texture 1.67).
- **Progression judge score**: Mean **2.4 / 5** (10%: 2, 25%: 2, 50%: 1, 75%: 2, 100%: 5; mean of 10% and 25%: 2.0; human order: 0 of 1).
- **Progression judge note**: *"The sheet fills with uniform all-over washes, scalloped holes and a visible pixel-grid before the image resolves, reading as a filter or diffusion-style uncovering rather than a painter building form from light to dark."*

### Where We Agree and Why
1. **Visible pixel-grid / stair-step fill & uniform all-over washes (`marks/texture: 1.67`, 50% stage: `1/5`)**:
   We strongly agree. In try 1 we added `_spl6_lad` (`--strokeplan 1 --lanemm 6 --laneadapt 1`), which broke the washes into short, uniform horizontal lane segments across the entire sheet, creating a brick/grid texture across the foliage and sky/terrace. Removing `_spl6` and `_lad` is essential.
2. **Cut or scalloped wash edges, round holes, and hard square cutouts (`edges/detail: 2.67`)**:
   We strongly agree. Try 1 added `_lit18` (`--litlift 0.18`) and `_lw` (`--litwarm 1`), plus 6 explicit axis-aligned rectangular `reserves` in `config.json`. Together with `urban-sketch`'s high built-in paper reserve settings, this punched unnatural white holes and 6 hard white squares into the stone walls, terraces, and middle of the green foliage.
3. **10% stage "the whole sheet at one faint value" / "speckle or dotted trails instead of drawn lines" (`10% stage: 2/5`)**:
   We strongly agree. Because `_lw` (`--litwarm 1`) painted pale yellow blotches first and `opening-lines.json` only had 90 sparse, faint lines (and `_sep8` from the base recipe was accidentally dropped because `sep8` wasn't known to be skipped or overridden—wait: `sep8` was listed in `Base recipe tokens skipped`!), the 10% stage showed faint yellow patches and barely visible line fragments rather than a confident dark sepia pen sketch.
4. **25% and 50% stages reading as flat evenly-toned slabs covering the whole sheet**:
   We agree. The full-bleed orange and yellow-green horizontal-lane washes covered every part of the image uniformly before any local architectural vs. foliage distinction appeared.

### Where We Disagree (or Qualify the Critique) and Why
1. **"At 100% of its strokes: 5 out of 5" vs. finished VLM scores of 2, 4, 2**:
   The progression judge gave the 100% frame 5/5 while the finished-painting VLM judges gave 2, 4, 2. The progression judge is overly generous at 100% (viewing the small thumbnail in `stages.jpg`), whereas at full resolution (`compare.png`) the 6 white rectangular reserve stamps, horizontal grid banding, and missing architectural pen work clearly hurt the finished painting.
2. **"A region arriving finished while its neighbour is untouched" / "straight travelling front"**:
   Only 1 judge flagged this; it was an artifact of the horizontal lane raster order from `_spl6_lad` and the abrupt white cutouts on the upper-left terrace next to dense dark cypresses, rather than actual region-by-region completion. Fixing the wash plan and removing `_spl6_lad_lw_lit18` will resolve both.

