# Self-Review of Previous Painting (Try 2 of 3)

## 1. Independent Assessment (Before Reading Judges' Critique)

### What Works
- **Paper-White Preservation & Silhouette**: The overall diagonal framing, clean paper-white background vignette, reserved white chest and muzzle pads on the cat, and bright highlight on the man's forehead and nose bridge read clearly and preserve watercolor luminosity.
- **Orderly Light-to-Dark Value Progression**: Across the 5 stage frames (`stages.jpg`), values build monotonically from pale warm washes (Stages 1–2) through midtone planes (Stage 3) and shadow glazes (Stage 4) to crisp dark accents (Stage 5), avoiding the early dark-dump or brown perimeter halo around the hair from Try 1.
- **Cat's Upper Head & Nose/Mouth Accents**: The cat's ears, forehead striping, nose leather, mouth split, and reserved white whiskers cutting across the warm cheek wash have convincing watercolor structure.

### What Is Wrong
1. **Heavy Mechanical Diagonal Brush Bars Across the Man's Left Eye/Cheek & Hair**:
   - The most damaging flaw in the finished painting is a pair of thick, straight diagonal brown/sepia brush tracks slashing from the cat's neck/embrace right through the man's left eyebrow, left eye, and left cheek, plus uniform 45° parallel diagonal striping across the man's dark hair mass.
   - This was caused by using `region_w15` (multi-width brushes with wide passage strokes) combined with `_spl7_sml75_wre15` and the late pass-44 revision from `_dk12` to `_dk18`, which caused late dark passes to lay wide, striped diagonal strokes across the temple/embrace boundary.
2. **Muted Fur Chroma & Muddy Cat Irises**:
   - In `target.png`, the cat has vibrant burnt-sienna/orange-terracotta fur across the nose bridge, forehead, cheek, and chest patch, and pale luminous green irises with crisp dark rims.
   - In our painting, lowering chroma gain (`_cg10` instead of base `_cg13`) and missing an explicit reserve inside the cat's irises resulted in dull brownish-tan fur and muddy brown-filled cat eyes.
3. **Posterized / Cut-Out Facial Planes & Stubble**:
   - Setting all regions to `precise-watercolor` with very low separation (`_sep2`) and high wet-edge darkening (`_wre15`) made the shadow planes on the man's cheek, nose, and moustache look like flat cut-out shapes rather than softly graded washes and textured beard stubble.
4. **Lack of Fine Sketch Lines (Hair Curls, Whiskers, Lashes)**:
   - The prompt asks for *"watercolor portrait sketch, fine lines and light washes"*. Having only 1 drawn opening line and sparse closing lines missed the delicate dark whisker curves, loose curly hair strands at the crown perimeter, and fine eyelid/stubble linework visible in the target.

### Stage Breakdown (Where It Went Wrong)
- **Stage 1 (10%)**: Too faint—almost blank except for a whisper of pale wash on the left and a single tiny line, lacking the initial light pencil/ink construction of a portrait sketch.
- **Stage 2 (25%)**: Pale warm and cool foundation washes are well-placed in value, but already display mechanical 45° parallel raster brush tracks across the cat and hair from `region_w15` + `_spl7`.
- **Stage 3 (50%) & Stage 4 (75%)**: Midtones and early darks build form, but the cat's irises get painted over with brown midtones instead of staying pale green/white around the pupil, and the man's facial shadow planes form hard stepped edges.
- **Stage 5 (100%)**: The pass-44 revision to `_dk18` and `_ink4` triggers heavy late dark strokes that slash diagonally across the man's left eye and cheek and turn the hair into a cross-hatched olive-black grid.

### Own Scores (Before Reading `FEEDBACK.md`)
- **Finished Painting Score (0–10)**: **6.2 / 10**
- **Process Plausibility Score (1–5)**: **3.5 / 5**

---

## 2. Comparison with External Judges (`bench/feedback/FEEDBACK.md`)

### Summary of External Scores
- **Finished Painting**: `composite: 6.35 / 10` (`classic measures: 8.37` [value `6.64`, edge `8.66`, marks `9.80`]; VLM judges: `composition values: 6.33`, `edges detail: 3.33`, `marks texture: 3.67`; panel scores `4, 4, 5`).
- **Progression Judge**: `4.6 / 5` mean (`10%: 4/5`, `25%: 4/5`, `50%: 5/5`, `75%: 5/5`, `100%: 5/5`; `1 of 1` found order of work human).
  - *Judge note*: "The sequence builds like real watercolor—pale washes first, then mid-tone form, then darks, with fine whisker and line work arriving last—so the order reads human, with only a faint near-uniform first wash and slightly early facial marking as minor quibbles."

### Where We Agree and Why
1. **Overall Finished Score (`6.35` vs. our `6.2`) & Low `edges detail` (`3.33`) / `marks texture` (`3.67`)**:
   - We strongly agree that `edges detail` and `marks texture` are the primary bottlenecks holding down the composite score, even though `classic measures` reached `8.37`.
   - Tracing `tools/paint-plate.mjs` (lines 2776–2902), `src/paint/methods/passage-brush.mjs`, and `src/paint/methods/stroke-plan.mjs` reveals the exact mechanical cause of the ugly diagonal striping and the two brown bars slashing across the man's left eye/cheek:
     - When `region_w15` (`--brushchoice 1`) is combined with `_spl7` (`--strokeplan 1`), `choosePassageBrush` assigns `shape: 'mop'` (`38 mm`) or `'round'` to large passages, which sets `flat: false` on the physical brush in `tools/paint-plate.mjs` line 2902.
     - However, `planLanes` (`_spl7`) spaces parallel straight brush lanes `1.7 * R` apart assuming a full-width flat brush (`flat: true`). With `flat: false`, bristle lengths fall off parabolically (`1 - 0.55 * rel^2`), so each lane deposits a concentrated dark core down its center and leaves a pale/unpainted gap between lanes.
     - Worse, for branched shadow passages in Bands 4–5 whose `supportMm < 7 mm` (such as the `sienna` shadow connecting the cat's neck/embrace to the man's left eyebrow, eye, and cheek), `sh._strokePlan` is skipped and `passageBrushPaths` (`region_w15`) lays `lanes = 2` straight parallel diagonal mop tracks across the bounding span of the mask—producing the two thick brown diagonal bars across the man's left eye and cheek, amplified by the late revision to `_dk18`.
2. **Progression Order & Stage 1 (`10%`) Quibble**:
   - We agree that the 5-band light-to-dark order (`--touchpoints 0`, warm-first `--paints`) reads as a genuine human watercolor sequence (`4.6 / 5`).
   - We also agree that Stage 1 (`10%`) looks slightly too faint and uniform ("the whole sheet at one faint value, as if faded in") because 4 of our 5 opening lines were filtered out by `minLengthMm` (`8 mm`), leaving only 1 tiny line on the sheet before Band 1 washes began. Providing ~12–16 longer, light structural construction lines (`>= 10 mm`) and slightly stronger Band 1 warm washes will make the 10% frame unmistakably look like an artist's pencil/ink block-in and initial wash.
3. **Value & Chroma Deficits (`classic value: 6.64`, `composition values: 6.33`)**:
   - We agree that the value and color structure need better local contrast and warmth on the cat's orange tabby markings, cleaner luminous green inside the cat's irises, and richer cool darks in the man's hair without over-darkening the facial midtones.

### Where We Disagree and Why
1. **Progression Judge Over-Generosity on Stages 2–5 (`5/5` despite diagonal lane artifacts)**:
   - While the progression judge gave `5/5` at 50%, 75%, and 100% (mean `4.6` vs. our `3.5`), we do not treat that as a reason to keep `region_w15` or `_spl7_sml75_wre15`. Those flags caused the exact `marks texture` (`3.67`) and `edges detail` (`3.33`) penalties in the finished-painting evaluation. Switching back to `region_w13` (`flat: true` shaped plane paths without `_spl` raster lanes or `_wre` clip dilation) preserves the `4.6+` light-to-dark progression while eliminating the mechanical parallel lane tracks.
2. **The 25% Quibble ("fine detail already present in the first 25%")**:
   - We disagree that fine ink or whisker detail was drawn in the first 25% (all feature ink was strictly in `closing-lines.json` at the very end). However, we understand *why* the judge perceived early facial detail at 25%: by pass 12 of 49 (`25%` of strokes), Band 2 Layer 0 was already painting small colour-cluster-split shapes around the eyes and brow because `--middomain 1` splits Band 2/3 passes by colour region. Using `_onedom` (`--middomain 0`) or higher `--layersmooth` (`_ls25`) merges Band 2 midtone washes across colour-cluster seams so the 25% stage stays broad and painterly, and also prevents posterized patches on the man's face.
