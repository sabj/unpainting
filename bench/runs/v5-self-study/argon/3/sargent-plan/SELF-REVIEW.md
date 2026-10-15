# Self-Review of Try 2

## 1. Independent Visual Assessment of Try 2 (Before Reading `FEEDBACK.md`)

### What Works
- **Pure watercolor medium fidelity (no ink outlines)**: Suppressing both opening and closing linework (`penLines: 0`) respected the "pure watercolor, no ink" requirement and avoided artificial cartoon outlining around the ships and rigging.
- **Broad compositional placement and paper reserves**: The major structural elements—the sweeping central ship bow, the bright reserved triangle of sunlit background hull to the right (`x ≈ 0.31–0.46, y ≈ 0.35–0.67`), the upper-right rigging blocks, the golden-ochre triangular sail/flag at mid-left, the lower-left yellow-ochre anchor, and the dark hawsehole on the upper bow—sit in accurate spatial relationship to the target.
- **Warm-vs-cool palette balance**: The warm cream paper tone (`221, 215, 199`) and the interplay of warm ochre/sienna timbers against cool slate-cerulean shadows capture the general color temperature contrast of Sargent's *White Ships*.

### What Is Wrong
1. **Mechanical dotted/stippled row artifacts in the mid-to-dark blue washes**: Across the lower-center hull shadow (`x ≈ 0.25–0.33, y ≈ 0.69–0.95`), the lower-left blue hull/water region (`x ≈ 0.01–0.22, y ≈ 0.56–0.86`), and the upper-left hull curve (`x ≈ 0.09–0.25, y ≈ 0.02–0.26`), the washes are perforated by regular rows of tiny pale dots/dashes (caused by `--drypop 0.60` / `_dp60` and scanline stroke spacing). Instead of a fluid transparent wash, it reads as a mechanical halftone or dotted texture.
2. **Posterized, stepped "paint-by-numbers" segmentation on the central hull belly**: In the target, the central bow curves smoothly from a saturated cerulean/cobalt left rim (`x ≈ 0.11–0.18, y ≈ 0.20–0.55`) through diagonal sweeping strokes into the sunlit cream belly and deep blue waterline shadow. In Try 2, the mid-hull (`x ≈ 0.15–0.26, y ≈ 0.35–0.75`) is split into flat, jagged-edged putty-grey and slate-blue zones (`--shaperefit 3` + `_lay2`), lacking soft wet-in-wet gradation and diagonal brushstroke energy.
3. **Crushed, pitch-black dark blotches with hard edges and a red fringe artifact**: At the base of the central hull (`x ≈ 0.12–0.24, y ≈ 0.76–0.96`) and the top-left hull crest (`x ≈ 0.14–0.20, y ≈ 0.01–0.08`), the darkest passes (`_dk14`) went dead black and opaque with jagged cutout boundaries and a visible red halo along the top edge of the bottom-center dark mass. In the target, these shadows are deep, transparent greenish-umber and indigo washes with soft transitions.
4. **Under-saturated turquoise water, right-hand mast, and orange-vermilion garland**: The harbor water at bottom-right (`x ≈ 0.65–1.0, y ≈ 0.68–0.98`) is dull sage-grey rather than vibrant turquoise/viridian with ochre ripples; the right-hand mast (`x ≈ 0.78–0.88`) is a flat tan strip missing its rich burnt-sienna/terracotta and green dabs; and the curving festoon of bright orange beads across the mid-left hull (`x ≈ 0.13–0.24, y ≈ 0.36–0.56`) is nearly absent save for two isolated brown spots.
5. **Unbalanced early stage progression**: In `stages.jpg`, Stage 1 (frame 2) is almost blank paper with barely perceptible pale marks, followed by an abrupt jump in Stage 2 (frame 3) to a uniform grey-tan map covering almost the entire composition.

### At Which Stage It Went Wrong
- **Stage 1 (Passes 1–12)**: The initial washes were far too pale and localized, leaving the first stage frame looking nearly blank instead of laying down a luminous, readable big-shape underwash.
- **Stages 3–4 (Passes 24–44)**: The two-layer mid-tone segmentation (`_lay2` with `--shaperefit 3`) carved the central hull into hard-stepped flat puzzle pieces, while `_dp60` (`--drypop 0.6`) introduced the artificial dotted/speckled rows across all dark-mid blue passages.
- **Stage 5 (Passes 45–49)**: The high dark gain (`_dk14`) over-darkened the bottom-center anchor/hull shadow and upper-left accent into opaque black patches with chromatic fringing.

### Self-Assigned Scores (Before Reading `FEEDBACK.md`)
- **Finished Painting Score (0–10)**: **5.8 / 10** — Recognizable composition and pleasant overall warm/cool palette, but held back by posterized hull contours, mechanical dotted wash textures, and coal-black bottom shadows.
- **Process / Plausibility Score (1–5)**: **2.8 / 5** — Pure watercolor without ink helps, and the light-to-dark value buildup across stages 2–4 is logical, but the nearly blank Stage 1, the quantized contour steps in Stages 2–4, and the sudden opaque black stamps in Stage 5 look algorithmic rather than hand-painted.

---

## 2. Response to External Judges' Feedback (`bench/feedback/FEEDBACK.md`)

### Summary of External Scores
- **Finished painting composite**: **6.34 / 10** (`classic measures: 8.35` [value `6.83`, edge `8.84`, marks `9.37`]; vision sub-scores: `composition values: 6.33`, `edges detail: 4.00`, `marks texture: 3.33`).
- **Progression judge**: **2.3 / 5 mean** (`10%: 1.5`, `25%: 1.5`, `50%: 1.5`, `75%: 2.0`, `100%: 5.0`; `10%+25% mean: 1.5`).

### Where We Agree with the Judges (and Why)
1. **Low `marks texture` (3.33) and `edges detail` (4.00) on the finished painting**:
   - We strongly agree. Our own review singled out the mechanical rows of pale dots (`_dp60` / `--drypop 0.60` interacting with `_tp1` and scanline fills) in the lower blue hull and left water, as well as the hard, stepped "paint-by-numbers" edges on the central white hull (`_lay2` + `--shaperefit 3`) and the harsh cutout black blotch at the bottom (`_dk14`).
2. **Progression Tell #1 — "the whole sheet at one faint value, as if faded in (8)" & "fine detail already present in the first 25% (3)"**:
   - Looking at `stages.jpg` frames 2, 3, and 4 (10%, 25%, 50%), we agree with the core diagnosis: at 10% the wash is barely visible (`_ls10` / `--lightstart`), and by 25% almost every silhouette in the entire painting—including the thin rigging spars at top-right, the small orange beads on the hull, and the anchor flukes at bottom-left—is already stenciled in at a uniform pale grey-beige value, which then simply darkens globally across 50% and 75%.
   - Why this happened: In `previous-plan/config.json`, almost all 6 families had full-canvas bounds (`[0,0,1,0.9]`, `[0,0,1,0.85]`, `[0,0,1,1]`) and shared the same global `precise-watercolor` style without regional style differentiation or staged family/region progression, while `_ls10_lf` forced ultra-faint global passes across all shapes early on.

### Where We Disagree with the Judges (and Why)
1. **"The sequence simulates progress by uniformly fading in the final image rather than showing distinct brushstrokes or layering" / Score of 1.5 at 50%**:
   - We partially disagree with the claim that the sequence is merely a global opacity dissolve of a finished image. Inspection of `stages.jpg` between 25%, 50%, 75%, and 100% shows genuine pigment-by-pigment, value-step-by-value-step layering: warm ochre timber (mid-left sail, right mast, bottom-left anchor) enters between 25% and 50%, deep slate-blue shadows enter between 50% and 75%, and the darkest umber/ultramarine accents enter between 75% and 100%.
   - However, because the early passes (1–24) already traced the exact high-resolution silhouettes of small details (rigging lines, beads, anchor contours) across the entire canvas at low opacity, the *visual impression* to a judge looking at the 5-frame strip is indeed very close to an opacity ramp over pre-segmented shapes. Thus, even though the judge's explanation ("opacity ramp of final image") is technically inaccurate regarding how the painter works, the **visual symptom** they reacted to is real and must be fixed by changing how early vs. late passages are structured and revised.
2. **"A straight travelling front, a wipe or raster sweep (3)"**:
   - Looking at the 5 stage snapshots in `stages.jpg`, there is no half-finished horizontal or vertical wipe front cutting across a frame; each snapshot was captured between completed passes. Rather, the judges likely mistook the parallel scanline rows and dotted horizontal texture (`_dp60` + `_tp1`) or the sharp horizontal water/hull boundaries for a raster sweep. Removing the dotted drypop artifact and using more varied brush widths (`region_w15` or cleaner stroke overlap) will eliminate this false tell.
