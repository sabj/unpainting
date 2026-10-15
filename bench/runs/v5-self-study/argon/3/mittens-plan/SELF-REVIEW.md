# Self-Review of Try 2 (Mittens, Round V5)

## 1. Independent Assessment (Before Reading `FEEDBACK.md`)

### What Works
- **Macro Composition and Paper Reserves**: The open warm-white paper background, the bright white reserves on the cat's muzzle/chest, and the high-key highlight across the man's forehead and nose bridge are preserved cleanly.
- **Global Value Hierarchy**: The overall contrast from paper white through warm midtones to dark anchors (hair, eyebrows, pupils, and the shadow crease between the cat and the man's head) matches the macro tonal weight of the target better than an under-inked wash.
- **Macro Stage Order**: Looking at `stages.jpg`, the painting progresses generally from light warm washes (Stages 1–2) to mid-tone modeling (Stage 3) to dark accents (Stage 4) and final linework (Stage 5).

### What Is Wrong
1. **Stepped Contour-Band / Posterized Look on the Man's Face**: On the man's cheeks, temples, nose shadow, and chin/mouth area, the washes form sharp-edged, nested topographic islands (like a paint-by-numbers or quantized isophote map) instead of soft, continuous watercolor washes. The stubble and smile become chunky brown puzzle pieces rather than a light wash with delicate texture.
2. **Mottled "Camo" Hair Mass (Brown Underpainting + Blue/Black Spots)**: The man's dark curly hair is painted first as a warm brown mass (Stage 3) and then stamped with isolated bright ultramarine blue and black blobs (Stage 4), producing a patchy camouflage texture rather than a unified cool dark charcoal/sepia wash with loose curly edges.
3. **Muted / Muddy Cat Coat and Left Eye**: The cat's tabby stripes lack the vibrant warm burnt-sienna / orange-ochre glow of the target, leaning too dull taupey-olive (`sapgreen`/`sepia` dulling the midtones). The cat's viewer-left eye is a muddy brown smudge lacking the clear pale green iris and crisp dark eyelid rim, while the whiskers across the cheek are blurry and broken.
4. **Weak Portrait Sketch Linework**: The requested style is *"watercolor portrait sketch, fine lines and light washes"*, and the target features crisp, expressive fine lines (cat's brow whiskers, ear contours, eye rims, hair curls, facial contours). In Try 2, `--openinglines 26` produced almost no visible structural drawing in Stage 1, and the closing ink lines were too faint and fragmented to give the crisp line-and-wash portrait feel.

### At Which Stage It Went Wrong
- **Stage 1**: Opening pencil lines (`26` lines) are too sparse and fragmented; the faint wash barely establishes portrait structure.
- **Stage 2**: Quantized, hard-edged contour shapes already appear on the man's cheek and around his eyes; the dark hair is blocked in with warm tan.
- **Stage 3**: The topographic banding on the face becomes very pronounced (`--shaperefit 3` and `--middomain 0` carving sharp value steps), and the hair turns into lumpy brown blotches.
- **Stage 4**: Dark blue (`ultramarine`) and black (`paynes`) blotches land atop the brown hair in disconnected spots; the man's viewer-left eye gets partially obscured by a heavy dark shape, and heavy black blobs collect at the lower neck junction.
- **Stage 5**: The closing ink pass barely alters the image—it fails to tie the features, whiskers, eyes, and curls together with fine sketch lines.

### My Own Scores (Pre-Feedback)
- **Finished Painting Score (0–10)**: **5.8 / 10**
- **Process Plausibility Score (1–5)**: **3.2 / 5**

## 2. Comparison with `bench/feedback/FEEDBACK.md` (Where I Agree and Disagree)

### Summary of External Feedback
- **Finished Painting**: Composite `6.37 / 10` (`classic measures: 8.4`, `composition values: 6.33`, `edges detail: 3.33`, `marks texture: 4.0`; VLM panel scores `4, 5, 4`).
- **Progression Judge**: Stage scores `2, 2, 2, 3, 5` (mean `2.8 / 5`, 10%&25% mean `2.0 / 5`).
  - Named tells: *speckle or dotted trails instead of drawn lines (2); the whole sheet at one faint value, as if faded in (1); a feature painted before its form (1); a region arriving finished while its neighbour is untouched (1); texture arriving as a dump, everything sharpening at once late (1)*.
  - Judge note: *"The strip behaves like a fade-in render: the whole sheet ghosts in at one uniform faint value, facial features appear before the surrounding form is built, and the hair arrives as stippled texture dumps rather than cumulative brushwork."*

### Where I Agree with the Judges
1. **`edges detail: 3.33` and `marks texture: 4.0` on the Finished Painting**: I strongly agree with the VLM panel here (my own score was `5.8/10`, close to the `6.37` composite). The stepped, posterized contour bands on the man's face (`--shaperefit 3`, `--middomain 0`, `_lay3`), the muddy viewer-left cat eye, the blotchy blue/brown hair, and the overly timid linework fail to capture the delicate *"watercolor portrait sketch, fine lines and light washes"* aesthetic.
2. **"Speckle or dotted trails instead of drawn lines" (Stage 1 / 10%)**: I agree. Setting `--openinglines 26` with `_opp22` (`--openingpressure 0.22`) made the opening pencil lines so faint and short that in Stage 1 (`10%`) they read as disconnected dusty speckles rather than a coherent portrait sketch underdrawing.
3. **"The hair arrives as stippled texture dumps rather than cumulative brushwork" (Stages 3–4 / 50%–75%)**: I agree. Combining `_lay3`, `--deepaccent 85`, `--deepgrow 2`, and `--accentshare 0.45` with separate `sepia`, `ultramarine`, and `paynes` passes broke the curly hair mass into hundreds of small stippled dabs (pushing total strokes to `2,264`) and left bright ultramarine blue spots sitting on warm brown hair.
4. **"Facial features appear before the surrounding form is built" (Stages 2–3 / 25%–50%)**: I agree with this visual observation. Because the man's forehead and upper cheeks are near-paper-white in the target, the painter reserved the entire center of the face as bare white paper while painting the darker eye sockets, eyebrows, and mouth/stubble in early/mid passes. In `stages.jpg` (25% and 50%), the eyes, brows, and mouth float as isolated brown cutouts on an unpainted white face without a structural portrait drawing or soft connecting facial wash to anchor them.

### Where I Disagree with the Judges (and Judge Noise)
1. **Contradictory Progression Tells ("whole sheet at one faint value" vs. "a region arriving finished while its neighbour is untouched")**: These two tells pull in opposite directions—one penalizes simultaneous sheet-wide light washes, while the other penalizes regional completion. However, both stem from how stroke-count percentiles (`10%, 25%, 50%, 75%`) sampled our `2,264`-stroke run:
   - Because later mid/dark/accent passes consumed over `1,800` small strokes, the `10%` frame (`~226` strokes) caught only the palest initial wash across both figures.
   - Conversely, between `50%` and `75%`, the cat on the left barely changed (since it has almost no `ultramarine`/`paynes` darks) while the man's hair and eyes on the right received all the heavy dark strokes.
2. **Overly Generous `classic measures: 8.4` (`classic marks: 9.79`, `classic edge: 8.77`)**: The deterministic classic metrics rated edges and marks nearly 9–10/10, which masks the severe contour-banding on the face and the lack of crisp portrait-sketch linework. We should optimize for true visual quality (soft washes + clean fine linework + cohesive hair washes + natural stage progression) rather than relying on the already-high classic metric.
