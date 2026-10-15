# Try 2 Painting Plan — `mittens` (Watercolor Portrait Sketch, Fine Lines and Light Washes)

## 1. Visual Diagnosis & What Changed from Try 1 (and Why)

### Change 1: Eliminate the Late 3,698-Stroke Rigger Dump (`--floorfrom 2.0`, `--touchdmin 0.08`, `_tp1`)
- **What went wrong in Try 1**: In Try 1 (`previous-checkpoints.jsonl`), all 30 value passes (`Band 1` through `Band 5`) completed in **787 strokes**, and then Passes 31–32 (`touchCorrections`, `--touchpoints 2`) executed **3,698 tiny 1-mm rigger strokes** (`4,485 - 787 = 3,698`, or **82.5% of the entire painting's stroke count**!). This occurred because `touchCorrections` assigns `layer.value = maxV + round` (`6` and `7`, while `steps = 5`), making `through = (layer.value - 1) / (steps - 1) = 1.25 > 0.85` (`--floorfrom` default `0.85`), which switched `FLOOR` from `PB.floorR` (broad wash brush) to `PB.detailR` (the 1-mm rigger brush). Because progression checkpoints (`10%`, `25%`, `50%`, `75%`, `100%`) are sampled by stroke count, `10%` (`stroke 448`) fell after all Band 1 and half of Band 2 washes were already finished across the whole sheet (`1/5`: *"the whole sheet at one faint value, as if faded in"*), and `25%–100%` all fell inside the late rigger-stroke dump (`2/5`).
- **What we changed in Try 2**:
  - Set `"--floorfrom", "2.0"` and `"--touchdmin", "0.08"` in `bench/plan/extra-args.json` and `_tp1` (`--touchpoints 1`) in `bench/variant.txt`.
  - Keeping `floorfrom` at `2.0` ensures `touchCorrections` uses `PB.floorR` (broad wash brush) rather than hatching with thousands of rigger strokes, reducing late touchpoint strokes from ~3,698 to ~30–40.
  - Combined with `_lay3` (`--midlayers 3 --layersmooth 2.5`), the 782 value-plan strokes are distributed across `b1: 49`, `b2L0: 85`, `b2L1: 80`, `b2L2: 115`, `b4: 146`, and `b5: 307`. As a result, the `10%`, `25%`, `50%`, `75%`, and `100%` checkpoints land at genuine watercolor stages:
    - **10% (~stroke 82)**: Band 1 foundation + warm yellow-ochre/burnt-sienna Band 2 L0 washes on the ginger cat and face.
    - **25% (~stroke 204)**: Band 2 L0 complete + Band 2 L1 middle-tone modeling.
    - **50% (~stroke 408)**: Band 2 L2 complete + Band 4 first shadow glazes.
    - **75% (~stroke 612)**: Band 4 complete + Band 5 deep shadow glazes and facial/eye accents.
    - **100% (~stroke 817)**: Band 5 complete + 1 broad-brush touchpoint pass + 52 crisp closing focal ink lines.

### Change 2: Replace Heavy 226-Line Iso-Contour Opening Ink with Sparse Structural Underdrawing + Selective Focal Closing Ink
- **What went wrong in Try 1**: Try 1 loaded 226 traced contour lines in `opening-lines.json` (`--openinglines 226`) and drew them before stroke 1 using `_sep8` (`--inkkscale 8`, turning sepia near-black) and `_dwg200` (`--drawwidthgain 2.0`, doubling nib width). This caused two major judge penalties:
  1. Progression judges flagged *"fine detail already present in the first 25%"* because all 226 dark lines were on the sheet before the first wash.
  2. Vision judges scored `edges detail: 3/10` and `marks texture: 2/10` because closed iso-contour loops outlined every orange fur patch on the cat and filled the man's hair with spaghetti-like contour rings.
- **What we changed in Try 2**:
  - Replaced `_sep8_dwg200` with `_sep2_dwg110_opp22` (`--inkkscale 2 --drawwidthgain 1.1 --openingpressure 0.22`) so the opening drawing is a delicate, warm sepia structural sketch.
  - Filtered `bench/plan/opening-lines.json` from 226 lines down to **26 clean structural lines** (`--openinglines 26`), removing closed contour loops (`loopRatio < 0.48` outside the eyes).
  - After inspecting `bench/looks/01-compare.jpg` (boundary 0) and `bench/looks/02-compare.jpg` (pass 15), we observed that Try 1's `config.json` had horizontally swapped left/right coordinates (`cat` on right instead of left `x: 0.00–0.52`, `man` on left instead of right `x: 0.48–0.99`). At Pass 15 we used `bash bench/paint.sh revise` to update `bench/plan/config.json` to the true cat-left / man-right coordinates, balanced `bench/plan/closingink4-lines.json` to **64 crisp focal lines** (**36 on the cat** covering both eye rims, slit pupils, vertical brow whiskers, nose/philtrum/mouth, whiskers, and ear contours + **28 on the man** covering brows, upper lash lines, nose, smile crease, and outer hair curl flicks, with `--closinglines 80 --closingpressure 0.38 --closingedgemin 0.14`), and boosted `_mg14_dk12` (`--midgain 1.4 --darkgain 1.2`) for richer ginger fur chroma and deeper curly hair shadow glazes.

### Change 3: Restore Ginger Fur & Warm Skin Chroma (`--shaperefit 3`, `_mg14`, `_dk12`, Warm-to-Cool Palette, Drop `--litlift`)
- **What went wrong in Try 1**:
  - Try 1 passed `"--litlift", "0.10", "--litreserve", "94"` in `extra-args.json`, which activated the `litLift` stone-bleaching branch in `planLightToDark`, zeroing shadow glazes and cutting mid-tone weights on warm cells with `L* >= 86` and reserving warm cells with `L* >= 94` as bare paper.
  - Try 1 did not enable `--shaperefit`, leaving raw unmix channel-density deficits on the ginger cat and warm face.
- **What we changed in Try 2**:
  - Removed `--litlift` and `--litreserve` completely.
  - Added `"--shaperefit", "3"` in `bench/plan/extra-args.json` (3 rounds of Kubelka-Munk planning-shape refit, reducing shape color error from `0.046` to `0.015`) and `_mg14_dk12` (`--midgain 1.4 --darkgain 1.2`) in `bench/variant.txt` to restore full yellow-ochre and burnt-sienna vibrancy to the cat's coat and the man's face.
  - Ordered `--paints` warm-to-cool (`"ochre,sienna,sapgreen,sepia,ultramarine,paynes"`) so warm golden-orange and sienna washes establish the portrait and cat before cool darks (`ultramarine`, `paynes`).

### Change 4: Remove Eye-Clipping Rectangular Reserves & Activate Multi-Layer Planned Lanes
- **What went wrong in Try 1**:
  - Try 1 placed 4 axis-aligned rectangular `reserves` over the cat's and man's eyes in `config.json`, punching artificial white rectangular cutouts through the pupils and upper eyelids.
  - Try 1 put `_lad` in `variant.txt` without `--strokeplan 1`, so `_lad` was unread/ignored and washes were stamped as single flat shapes.
- **What we changed in Try 2**:
  - Set `"reserves": []` in `bench/plan/config.json` and relied on `--paperlights 1 --paperrel 1` (`_ppr_pags` in the base recipe) to organically protect true paper-white areas (background, cat's white muzzle/chest bib, forehead highlight) without rectangular cutouts across the eyes.
  - Activated `_lay2` (`--midlayers 2 --layersmooth 2.5`) and `_spl10_sml40_wre15_ew6_efade25` (`--strokeplan 1 --lanemm 10 --strokemm 40 --washreach 1.5 --edgewobble 0.6 --edgefade 1.2`) along with `--middomain 0` and `--brushchoice 1` so washes are laid as soft, overlapping multi-lane brush passages with organic edges.

---

## 2. Critique Points Accepted vs. Rejected

- **Accepted**:
  1. *Progression judge critique (`2.2/5`: "the whole sheet at one faint value, as if faded in", "fine detail already present in the first 25%", "texture arriving as a dump, everything sharpening at once late")* — Fully accepted and traced to the 226-line `_sep8_dwg200` opening ink and the 3,698-stroke late `touchCorrections` rigger dump (`through = 1.25 > floorfrom`). Fixed via `--floorfrom 2.0`, `_tp1`, `_spl10`, `_lay2`, and the 26-line light opening underdrawing.
  2. *Vision judge critique on `edges detail` (`3/10`) and `marks texture` (`2/10`)* — Accepted. Closed iso-contour loops around orange tabby patches and inside the dark hair mass have been stripped from both `opening-lines.json` and `closingink4-lines.json`, and eye-clipping rectangular reserves were removed.
  3. *Vision judge critique on pale/flat ginger fur (`composition values: 5.33/10`)* — Accepted. Fixed by removing `--litlift`, adding `--shaperefit 3`, and keeping `_mg13` with `_lay2`.
- **Rejected**:
  - *Removing opening lines altogether (`--drawing last`)*: While a pure `last` drawing order would hide all lines until 100%, the target's requested style is **"watercolor portrait sketch, fine lines and light washes"**, where a light structural underdrawing (`26` lines at `_sep2_dwg110_opp22`) establishes the portrait sketch character early without dumping fine texture or heavy dark ink in the first 25%.
