# Self-Review of Try 1 (Ships — Round V5, Try 2 of 3)

## Part 1: Independent Self-Evaluation (Before Reading `FEEDBACK.md`)

### What Works
1. **Overall Value Architecture and Silhouette Read**: The macro composition reads clearly and matches the target's major light-and-dark arrangement: the sunlit warm-cream hull on the right (preserving bare paper tone), the sweeping cool blue-grey shadow across the curving bow in the center-left, the deep dark shadow at the waterline under the bow, the two dark hanging fenders on the right, and the dark oval hawsepipe.
2. **Medium Fidelity (Pure Watercolor, No Ink)**: Using empty `opening-lines.json` and `closing-lines.json` (`"medium": "none"`) properly avoided pen/ink outlines, keeping the piece pure watercolor.
3. **Warm Paper Ground**: Setting `--paperrgb 221,215,199` matched the warm cream paper of Sargent's original sheet well.

### What Is Wrong
1. **Artificial Axis-Aligned Rectangular Reserve on the Foreground Anchor (`[0.21, 0.78, 0.25, 0.82]`)**: The single biggest visual defect is a sharp, unnatural white square punched out of the right fluke of the foreground anchor and its adjacent dark blue hull shadow. Because the painter already preserves near-paper lights natively, adding a rectangular box reserve created a glaring geometric hole that looks completely synthetic.
2. **Posterized, "Paint-by-Numbers" Contour Islands on the Curved Bow and Lower Left**: In the target, the broad shadow of the ship's bow is a luminous, softly graded cerulean/ultramarine wash with lively directional brush marks and soft internal transitions. In our try 1 painting, the bow and lower-left hull break into stepped, hard-edged contour islands (especially along the upper-left curve of the bow, the pale grey patch in the middle of the bow below the hawsehole, and the mottled dark blue patches behind the anchor).
3. **Reduced Cool Gain (`_cg11` instead of base `_cg13`) and Oversized Shape Floor (`_ms1200`)**: Replacing the base `_cg13` (`--coolgain 1.3`) with `_cg11` (`--coolgain 1.1`) weakened the cool blue washes on the bow and water, while `_ms1200` (`--minshapecells 1200`) discarded smaller warm sienna chain dots curving down-left from the hawsepipe and turned midtone transitions into coarse blocky islands.
4. **Over-segmented Touch-up Passes and High Pass Count (87 passes, 5481 strokes)**: The painting ran 76 main passes plus 11 touch-up passes (1,809 strokes in touch-up alone), depositing many small, fragmented dark speckles at the bottom waterline and upper bow without improving the broad brushwork unity.

### Where It Went Wrong by Stage (`bench/feedback/stages.jpg`)
- **Stage 1 (Early washes, ~15 passes)**: A flat, segmented pale pinkish-tan wash fills large polygonal zones of the bow and lower water, and the sharp rectangular reserve hole on the anchor is already visible as a geometric cutout.
- **Stage 2 (~41 passes)**: The first cool grey-blue wash covers the bow silhouette, but with uniform granular texture and hard-stepped internal cutouts (including the square reserve on the anchor and a jagged island below the hawsepipe).
- **Stage 3 (~65 passes)**: Mid-dark blue-grey layers build up as isolated, sharp-edged contour rings on the upper-left bow curve and lower bow rather than cohesive directional washes.
- **Stage 4 (~75 passes)**: Dark accents (hawsehole, fenders, dark waterline base) land in place, improving contrast, but the lower-left area around the anchor looks patchy and fragmented, with the white square reserve standing out starkly against the dark blue shadow.
- **Stage 5 (Final, 87 passes)**: The 11 touch-up passes between pass 75 and 87 add 1,809 tiny strokes mostly in the darkest bottom-left waterline and upper bow, creating speckled dark clutter with almost no macro improvement.

### Self-Assigned Scores (Before Reading Feedback)
- **Finished Painting Score (0–10)**: **6.5 / 10** — Strong macro value structure, paper tone, and recognizable ship bow/anchor/fenders, but held back by the glaring square reserve cutout on the anchor, posterized hard-edged contour islands in the bow shadow, and lost small chain/rust details.
- **Process Plausibility Score (1–5)**: **2.8 / 5** — While it builds generally from light to dark without ink lines, the sharp rectangular reserve hole from pass 1, the segmented contour-island buildup in the midtones, and the heavy 1,809-stroke micro-touchup phase at the end look algorithmic rather than painted by a human watercolorist.

---

## Part 2: Review of External Judges' Critique (`bench/feedback/FEEDBACK.md`)

### Summary of External Scores
- **Finished painting**: `composite: 5.27 / 10` (`classic measures: 7.54` [value `7.05`, edge `8.80`, marks `6.76`], `composition values: 5.33`, `edges detail: 3`, `marks texture: 2`, VLM judges: `3, 3, 3`).
- **Progression judge**: `1 / 5` at all five checkpoints (`10%, 25%, 50%, 75%, 100%`).
  - Named tells: *"the whole sheet at one faint value, as if faded in (4); texture arriving as a dump, everything sharpening at once late (3)"*.
  - Note: *"Every panel is the complete finished scene at a uniformly increasing opacity — a straight dissolve/fade-in of the whole sheet, with no local wash building, no light-to-dark order, and all texture sharpening everywhere at once."*

### Where I Agree with the Judges (and Why)
1. **Weak `marks texture` (2) and `edges detail` (3) in the finished painting**:
   - I strongly agree with this diagnosis. Using `precise-watercolor` everywhere with single-sweep fitted plane gestures (`region_w13` without stroke-lane planning or soft edge treatment), combined with `--minshapecells 1200` (`_ms1200`), produced flat, posterized contour islands with hard dry-on-dry seams instead of lively directional brushwork.
   - The explicit rectangular reserve `[0.21, 0.78, 0.25, 0.82]` punched a conspicuous axis-aligned white square into the lower-left anchor and adjacent dark shadow, which severely hurt edge and detail credibility.
   - Because `_ms1200` filtered out shapes smaller than 1,200 cells in the midbands, the distinctive trail of warm orange-sienna anchor-chain links curving across the bow and smaller rust accents were omitted.
2. **Progression Tell #1 — Early frames (`10%`, `25%`, `50%`) looking like a faint full-sheet fade-in**:
   - Looking at `stages.jpg` and `previous-checkpoints.jsonl`, there is a clear mechanical reason why the 10%, 25%, and 50% stroke checkpoints looked like the whole sheet slowly fading in:
     - First, `_tp2` (`--touchpoints 2`) added **1,809 strokes** after pass 75 (from stroke 3,672 to 5,481 — **33% of all strokes in the run**!). Because `stages.jpg` samples at 10%, 25%, 50%, 75%, and 100% of *total strokes*, bloating the tail with 1,809 touch-up strokes pushed the 10% (stroke 548), 25% (stroke 1,370), and 50% (stroke 2,740) checkpoints back into Band 1 and Band 2 (`_lay4`).
     - Second, in Band 1 (`value=1`), `planLightToDark` sets `mask[i] = 1` across the entire non-reserved sheet for every pigment, and `--opening 0.55` scales Band 1 down to 55% strength. Then `_lay4` (`--midlayers 4`) repeats 4 nested midtone layers across all pigments before Band 4 ever starts. Consequently, at 10%, 25%, and 50% of strokes, the entire scene silhouette was covered in pale washes without any regional differentiation or darks.
3. **Progression Tell #2 — Late sharpening / darks arriving all at once between `50%` and `75%`**:
   - I agree with this observation as well: in Try 1, Band 4 and Band 5 (all shadow glazes, the hawsehole, the dark fenders, and `_dp85` deep accents) executed between stroke 3,242 (59% of strokes) and stroke 3,672 (67% of strokes). Thus, zero darks were present at the 50% checkpoint, all darks and sharp accents appeared at once in the 75% checkpoint, and the final 25% of strokes (strokes 4,110–5,481, inside `_tp2`) produced almost no visible change between the 75% and 100% panels.

### Where I Disagree with the Judges (and Why)
1. **"Every panel is a straight dissolve/fade-in of the complete finished scene with no light-to-dark order"**:
   - I disagree with the claim that there was *no* light-to-dark order. The dark oval hawsepipe, the two dark hanging fenders on the right, and the deep navy-sepia waterline shadow under the bow are completely absent in the 10%, 25%, and 50% panels and are painted only in the shadow/accent bands. The progression judge over-generalized the early Band 1 / 4-layer Band 2 full-sheet coverage into claiming the whole run was an opacity filter.
2. **Flat `3 / 10` VLM scores vs. `7.54` Classic Measures**:
   - The classic measures (`7.54` overall: `7.05` value, `8.80` edge alignment, `6.76` marks) show that the global value distribution, paper color, and major structural boundaries match the target well. We should **not** throw away the palette harmony, warm paper ground (`--paperrgb 221,215,199`), or pure-watercolor (no-ink) setup; instead, we must fix the specific artifacts (the rectangular reserve hole, the `_ms1200` shape loss, the posterized hard-edged mid-planes, and the stroke-timeline skew from `_lay4` + `_tp2`).
