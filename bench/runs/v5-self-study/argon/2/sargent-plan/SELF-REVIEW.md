# Self-Review of Try 1 (Ships, Round V5)

## 1. Independent Assessment (Before Reading `FEEDBACK.md`)

### What Works
- **Pure watercolor medium discipline**: The painting uses no ink or pencil lines (`medium: "none"` for both opening and closing lines), staying faithful to the requested pure-watercolor approach and Sargent's direct wash handling.
- **Broad tonal structure and silhouettes**: The major light-to-dark architecture is recognizable—the large curving central bow in cool blue-grey, the sunlit cream-white hull and rigging space on the right, the green-blue waterline at lower right, and the strong dark accents at the base of the bow, central hawsehole, upper bow lip, and upper-right pulley blocks.
- **Paper tone**: Setting `--paperrgb 221,215,199` matched the warm cream watercolor paper of the target well.

### What Is Wrong
1. **Unnatural axis-aligned rectangular reserve cutouts**: Several `reserves` entries in `config.json` (`[0.82, 0.05, 0.87, 0.10]`, `[0.89, 0.16, 0.94, 0.20]`, `[0.40, 0.41, 0.42, 0.43]`, and `[0.70, 0.84, 0.72, 0.90]`) overlap painted washes and punch crisp, machine-straight rectangular white holes into the upper-right rigging, the right pulley block, the middle of the central bow, and the lower-right turquoise water.
2. **Mechanical vertical zipper artifacts in the opening wash**: In Stage 1 (`stages.jpg`, panel 2), the broad pale blue-grey wash across the left and center exhibits regular vertical columns of short horizontal comb marks, betraying an algorithmic brush-path raster rather than fluid wet brushwork.
3. **Over-textured, stippled/burlap surface in midtones and darks**: Combining `--drytooth 1` with `region_w15` and heavy multi-pass layering produced a noisy, speckled, cross-hatched mesh texture across the lower-left anchor zone, the upper bow curve, and the central hawsehole surround, instead of clean, transparent watercolor washes.
4. **Overworked touch-up passes after the boundary-42 revision**: Revising at pass 42 to add `_tp3` (`--touchpasses 3`, `--touchfamilies 36`, `--touchgain 0.85`, `_shw65`) added 20 extra passes and over 8,000 tiny strokes (bringing total strokes from 11,567 to 19,948), which muddied the lower-left anchor and created spiky/fuzzy fringes around the dark accents at the top of the bow.
5. **Horizontal value seam across the lower-central hull**: Around `y ≈ 0.62`, a pale horizontal band cuts across the blue hull above the darker lower bow shadow, breaking the continuous vertical curve of the ship's hull.
6. **Muted warm sienna/orange accents and flooded upper-left rigging whites**: Because the opening cool wash flooded across the upper-left rigging and central bow (`_onedom`), the crisp paper gaps between the left masts were lost and the vibrant burnt-sienna/orange garland dots, diagonal right spar, and yellow-ochre anchor became dull and brown.

### At Which Stage It Went Wrong
- **Stage 1 (Passes 1–6, first washes)**: Immediately introduced the vertical zipper/comb artifacts in the large left-center wash, flooded the white intervals between the upper-left masts, and exposed the sharp rectangular reserve cutouts in the upper right, center, and lower-right water.
- **Stage 3 (Midtone passes)**: `--drytooth 1` and overlapping family washes turned the lower-left hull and anchor area into a coarse, stippled mesh.
- **Stages 4–5 (Passes 43–63, darks and touch-up passes)**: The boundary-42 revision (`_tp3`, `_shw65`) piled 8,000+ small touch-up dabs onto the darks, creating crusty dark clusters and radiating bristle fringes on the upper bow.

### Self-Assigned Scores (Before Reading Feedback)
- **Finished painting score (0–10)**: **5.5 / 10**
- **Process plausibility score (1–5)**: **2.5 / 5**

---

## 2. Comparison with External Judges (`bench/feedback/FEEDBACK.md`)

### Summary of External Scores
- **Composite finished score**: `5.15 / 10` (close to my self-score of `5.5 / 10`), split sharply between strong **classic measures (`7.64`, with `classic edge: 9.47`, `classic marks: 6.95`, `classic value: 6.49`)** and low VLM judge subscores (`composition values: 4.67`, `edges detail: 2.33`, `marks texture: 1.33`).
- **Progression score**: `1.4 / 5` (`1, 1, 1, 2, 2` at 10%, 25%, 50%, 75%, 100% of strokes).
- **Render record**: `86` passages dropped for having no brush path (`exit 3`).

### Where I Agree with the Judges (and Root-Cause Diagnosis)
1. **"Persistent white rectangular notches" / "cut or scalloped wash edges, round holes (5)"**:
   - **Agreement**: 100% agree. My independent review flagged the exact same rectangular holes (`[0.82, 0.05, 0.87, 0.10]`, `[0.89, 0.16, 0.94, 0.20]`, `[0.40, 0.41, 0.42, 0.43]`, `[0.70, 0.84, 0.72, 0.90]`). Rectangular `reserves` in `config.json` that overlap darker wash regions act like rectangular masking-tape stickers. Because the painter already preserves near-paper target lights automatically, reserves must only be placed inside genuinely pure paper-white areas (or minimized so they never clip a painted wash).
2. **"The whole sheet at one faint value, as if faded in (3)" / "whole finished composition is present from the first snapshot and merely rises in contrast"**:
   - **Agreement**: Strongly agree, and the checkpoint log reveals the exact two mechanisms that caused this:
     - **Mechanism A (`_onedom` + `_nest` + `_lad`)**: Setting `--onepassdom 1` (`_onedom`), `--nestedpasses 1` (`_nest`), and `--laddercap 0.35` (`_lad`) forced the opening passes to lay a faint, uniform wash over almost the entire ship silhouette at once, and then repeatedly re-wash the same regions at gradually higher concentrations (`_lay4`).
     - **Mechanism B (Stroke-budget distortion from the boundary-42 revision)**: The progression strip samples at **10%, 25%, 50%, 75%, and 100% of total strokes**. In Try 1, passes 1–42 (the entire main painting) took `11,567` strokes, and the boundary-42 revision (`_tp3`, `--touchfamilies 36`, `--touchmincells 0.0003`) added `8,381` tiny touch-up strokes in passes 43–63 (42% of all `19,948` strokes!). Consequently, **10% of strokes (`~2,000` strokes) was already at pass 7–8** with the entire sheet washed in, and **50% of strokes (`~10,000` strokes) was already at pass 37 of 42**!
3. **"Texture arriving as a dump, everything sharpening at once late (1)" and `marks texture: 1.33`**:
   - **Agreement**: Strongly agree. The `8,381` tiny strokes added in passes 43–63 by `_tp3` + `--touchfamilies 36` + `--touchmincells 0.0003` produced both the late speckle dump between the 50% and 75%/100% frames and the `86` dropped passages with no brush path. In addition, `--drytooth 1` embossed a synthetic mesh/stipple across midtone washes, and `region_w15` with `_ms800` created vertical zipper columns in the 10% and 25% snapshots.

### Where I Disagree with the Judges
1. **"Speckle or dotted trails instead of drawn lines (1)"**:
   - **Disagreement / Qualification**: While the late touch-up speckle in our render is a real defect, the implication that the painting should have continuous *drawn lines* misreads both the task specification (**"Requested style: pure watercolor, no ink"**) and Sargent's target, which has no ink or pencil linework and actually features a dotted orange-sienna rope/garland along the central bow. I reject adding ink/pen lines (`opening-lines.json` and `closing-lines.json` must remain `"medium": "none"`), and instead will render the linear masts and bow accents cleanly through shape-faithful wet-on-dry brushwork.
2. **Low VLM finished scores (`2, 2, 4`) vs. high classic edge/value scores (`classic measures: 7.64`, `classic edge: 9.47`)**:
   - **Disagreement / Qualification**: The VLM judges penalized the entire composition because of the surface texture artifacts (`--drytooth 1`, late touch-up dabs, and rectangular white cutouts), whereas the underlying spatial and tonal alignment (`classic edge: 9.47`, `classic marks: 6.95`, `classic value: 6.49`) was already solid. Therefore, I should not abandon the core palette or pure-watercolor value structure, but rather strip away the synthetic texture/cutout artifacts and restore a genuine region-by-region watercolor build-up.

