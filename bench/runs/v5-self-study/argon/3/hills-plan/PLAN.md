# Painting Plan: Hills (Round V5, Try 3 of 3)

## 1. Reference Cues & Composition (`bench/plan/target.png`, 306x242 px -> 1224x968 px on 158.05 mm x 124.99 mm cold-press sheet)
- **Subject & Requested Style:** Sunlit Mediterranean/California hillside landscape with a winding sandy dirt trail flanked by oak and eucalyptus groves, painted in **loose ink and wash**.
- **Paper & Palette:** Bright cold-press watercolour paper (`_cur`: `252, 251, 248`) with a seven-pigment landscape palette (`--paints hansa,sapgreen,ochre,rawsienna,sienna,ultramarine,sepia`, `--pigs 2`, `--palettepick 0`, `--palettecells 40000`, and `--skyblue 0` since there is no sky region).
- **Main Visual Masses:**
  1. **Winding Dirt Road (`hills.winding_road`):** Warm sandy-ochre and raw-sienna path winding from upper-left (`x=0.16..0.26, y=0.15..0.50`) through a central tree gap down to the lower center (`x=0.36..0.54, y=0.52..0.96`), plus upper-right (`x=0.70..0.77, y=0.00..0.10`) and lower-right (`x=0.70..0.84, y=0.94..1.00`) segments. The sun-bleached center tracks remain bare paper white.
  2. **Sunlit Grass Meadows (`hills.upper_meadow`, `hills.upper_slope`, `hills.lower_meadow`):** Luminous yellow-green slopes (`hansa` + `sapgreen` + `ochre`) with warm directional brushwork following the hillside contours.
  3. **Wooded Ravine & Tree Canopies (`hills.left_trees`, `hills.central_oaks`, `hills.right_wooded_ravine`, `hills.lower_right_trees`):** Rounded olive, warm sienna, and cool blue-slate (`ultramarine` + `sepia`) tree masses with deep connected under-canopy shadows and crisp pen-and-ink contour/branch accents.

## 2. Regions, Technique, Layer Order, Moisture & Load
We use the `precise-watercolor` identity value-ladder profile with `region_w13_lay2_cur_noslane_dk12_mg11` (two connected middle wash layers `L0` and `L1`, `--midgain 1.1`, `--darkgain 1.2`, `--skyhorizontallane 0`, and curated white paper) plus opening and closing dark sepia ink (`_ink4`, `_sep8`, `_uncap`, `_dwg200`):

1. **Stage 0 — Reserve Lights & Opening Structural Ink (`opening-lines.json`):**
   - Protect explicit sunlit road glints (`config.json` reserves) and near-paper target highlights (`--paperlights 1`, `--paperdelta 6`).
   - Lay down the structural ink drawing (`--openingpressure 0.65`, `--openingminmm 4`) on dry paper before washes: road borders, hillside ridge lines, and primary tree canopy contours.
2. **Stage 1 — Band 1 Pale Foundation Washes (`light` phase, wet on dry):**
   - Broad pale washes of `hansa`, `ochre`, `rawsienna`, and `sapgreen` across the sunlit meadows, sandy trail margins, and sunlit tree crowns on dry paper (`water ~ 0.62`), leaving protected paper whites clean.
   - Dried completely before middle layers.
3. **Stage 2 — Band 2 Layered Middle Planes (`mid` phase `L0` and `L1`, wet on dry):**
   - Two progressive, dried middle layers (`--midlayers 2`, `--midgain 1.1`) building the warm yellow-green grass slopes, golden-ochre road embankments, and olive-green / warm-brown tree canopy bodies.
4. **Stage 3 — Bands 4 & 5 Cross-Region Shadow Glazes (`shadow` phase, glazed on dry base):**
   - Connected cool blue-slate and deep sepia-ultramarine shadow glazes (`--darkgain 1.2`, `_cg13`, `_vio`, `_shs`) across the wooded ravine, left tree flank, and central oak under-canopy recesses (`water ~ 0.45` on a fully dry base).
5. **Stage 4 — Touch-up & Selective Closing Ink (`closing-lines.json` / `closingink4-lines.json`):**
   - Final crisp dark ink lines (`_ink4`, `_sep8`, `--drawwidthgain 2`) on the dried sheet to restate tree trunks, canopy silhouettes, dark foliage crevices, and road edges.

## 3. Protected Lights, Edges & Values
- **Protected Lights:** Six small explicit reserves (`3x4%` of sheet, `~4.7x5.0 mm`, well above the 1 mm minimum and well below the 8% straight-seam threshold) along the brightest sunlit dirt trail tracks, plus automatic near-paper light preservation (`_cur`, `--paperdelta 6`).
- **Edges:** Natural wet-on-dry wash boundaries with crisp separation along the sunlit road and tree silhouettes; no artificial horizontal sky lanes (`_noslane`).
- **Values:** Full 5-band progression from paper white (`0.0`) through pale yellow-green/ochre foundation (`<= 0.16`), two rich middle layers (`0.16..0.50` at `--midgain 1.1`), to deep slate-sepia tree shadows (`0.50..1.00` at `--darkgain 1.2`).

## 4. Failure Signs to Watch For (During `paint.sh look`)
- **Unpainted yellow-green grass:** Fixed by `_cur` (removing `--paperrel` so the top-10% luminance mean does not mistake yellow-green grass for cream paper) and `--paperdelta 6`.
- **Unsupported axis-aligned seams in Band 1:** Prevented by keeping all explicit reserves compact (`<= 4%` side length) and keeping a unified `precise-watercolor` style across regions.
- **Missing or sparse opening/closing ink:** Prevented by tracing target dark lines directly from `target.png` without the architecture-only green-foliage rejection filter and keeping all line points off `protectedCells` so `selectValueInk` retains them.
- **Over-dark or muddy meadows:** Monitored at pass checkpoints via `bash bench/paint.sh look`; can be tuned via `--darkgain` or `--midgain` with `bash bench/paint.sh revise`.

## 5. V5 Changes from Try 2 & Critique Decisions
- **What happened in Try 2 (`FEEDBACK.md`):** Try 2 produced no painting (`0 looks, 0 revisions`) because the painter's planning step exited `null` (timed out / killed before emitting a value plan) and the 85-minute session expired.
- **Critique points accepted:** We accept the harness report that Try 2's planning step failed to complete in time. Root-cause analysis of `tools/paint-plate.mjs` revealed that when `306x242` `target.png` is upscaled 4x to `1224x968`, spawning 6 worker threads (`--threads 6` default in `fast` mode) with pinned `SharedArrayBuffer` pools alongside redundant pre-value-plan steps (`pickPalette` running 6+ full-sheet unmix/render passes, `blockInPigments` + `gradeSmoothPassages` whose output `VALUE_ORDER` is discarded when `VALUE_ENABLED` overwrites `layers = VALUE_PLAN.layers`, and 1400px `FINE` upscaling) caused severe memory/thread contention and planning timeouts.
- **What we changed and why:**
  1. Added `"--threads", "1", "--pigs", "2", "--palettepick", "0", "--palettecells", "40000", "--maxvalues", "2", "--minshape", "50000", "--premix", "0", "--gradedsmooth", "0", "--finewidth", "306"` in `extra-args.json` and simplified `variant.txt` to `region_w13_lay2_cur_noslane_dk12_mg11` so `planningStep` avoids worker-pool thrashing and redundant pre-plan computations.
  2. Added `_cur` and `"--paperdelta", "6"` so `planLightToDark` does not reserve the bright yellow-green hillside grass as bare paper.
  3. Replaced `_lay4` with `_lay2` and added `_noslane_dk12_mg11` plus a dedicated 7-pigment landscape palette (`hansa,sapgreen,ochre,rawsienna,sienna,ultramarine,sepia`, `--skyblue 0`) for fresh, plausible loose ink-and-wash progression.
  4. Generated custom target-registered `opening-lines.json`, `closing-lines.json`, and `closingink4-lines.json` that trace dark ink lines across both foliage and trail edges while avoiding `protectedCells`.
- **Critique points rejected:** None (there were no noisy external judge notes in Try 2 since no painting was rendered).
