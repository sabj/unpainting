# Painting Plan — Trumbull (`Y1`, Round V5, Try 2)

## 1. Visual Reading of the Target (`bench/plan/target.png`)

The reference plate shows the Yale Trumbull College architectural elevation rendered in transparent watercolour and sepia ink over warm cream cold-press paper (`#fcfbf8`):

1. **Sky & Upper-Right Cloud Reserves**:
   - A cool cerulean and granulating French ultramarine sky wash fills the upper right and upper left corners, grading from deeper blue at the top edge down to pale warm-grey and open paper-white cumulus clouds above the right wing roof and flanking the central gable chimney.
   - Cloud edges are organic and irregular—never axis-aligned rectangles.

2. **Slate Roofs & Shadowed Left Return (`trumbull-slate-roofs`, `trumbull-cool-main-return`)**:
   - The steep pitched roofs of the right wing and dormers read as cool blue-grey slate (`cerulean` + `French ultramarine` + `sepia`) at light-mid to mid value.
   - The left return wall, chimney stack, and upper left tower face sit in cool cast shadow (`ultramarine` + `raw sienna` / `sepia`), separating cleanly along the vertical corner edge from the warm sunlit main gable.

3. **Sunlit Main Gable, Central Tower & Colonnade (`trumbull-sunlit-main-gable`, `trumbull-warm-stone-walls`)**:
   - The dominant architectural plane is the sunlit central Gothic gable and flanking stone masonry walls, bathed in luminous warm yellow ochre, hansa yellow, and raw sienna (`L* ≈ 82–94`), with delicate horizontal ashlar stone-course modulations (`--stonecourses 1`, `--stonesplit 55`, `--stoneblocks 0.32`).
   - Sun-struck stone window surrounds, stringcourses, and arcade trim sit near paper white (`L* >= 95`) or carry a warm luminous tint (`--litlift 0.15 --litwarm 1`) free of cool blue/sepia contamination.

4. **Courtyard Foliage & Foreground Street (`trumbull-shaded-stone-and-foliage`)**:
   - Rounded deciduous trees in front of the left and right wings read as fresh sap-green and yellow-ochre crowns with deeper olive-sepia shaded undersides.
   - The foreground street and sidewalk form a quiet horizontal pale warm-grey/ochre plane at the base of the facade, leaving an irregular unpainted paper margin below.

5. **Deep Architectural Shadows & Crisp Sepia Ink Linework**:
   - Pointed Gothic window apertures, colonnade arches, buttress undersides, and eave soffits hold the darkest values (`Band 4` and `Band 5` shadow glazes + deep accents), anchored at the end over dry washes by crisp sepia pen lines (`closingink4-lines.json`).

---

## 2. Region & Pass Plan (Five Light-to-Dark Value Bands)

| Stage / Band | Value Cap | Target Regions & Pigments | Technique, Moisture & Brush Load | Edge & Reserve Policy |
| :--- | :--- | :--- | :--- | :--- |
| **Stage 0: Opening Lay-In** | Pre-wash | Primary architectural silhouette & major structural verticals (`opening-lines.json`, 38 long spans, `minLen=22`, `--openinglines 40`, `--openingpressure 0.24`) | Sparse, low-pressure sepia pen structural contours on dry paper before washes | Strictly long architectural edges; no short window-bar ticks or stone speckles |
| **Band 1: Light Foundation** (`Passes 1–16`) | `0.16 * peak` | `trumbull-sunlit-main-gable` (`r1`: yellow ochre, raw sienna, hansa yellow) and `trumbull-sky` (`r4`: cerulean, granulating ultramarine) | Wet-on-dry pale foundation washes (`water: 0.62`), overlapping 6 mm sky lanes (`--skylanes 1 --skylanemm 6 --skylanestep 0.8`), feathered reloads (`--loadfeather 1.5`), luminous stone lift (`--litlift 0.15 --litwarm 1`) | Hold organic target-white reserves (`8,017` cells via `--paperlights 1 --paperrel 1`); zero explicit rectangular cutouts (`reserves: []`) |
| **Band 2: Light-Mid Planes** (`Passes 17–41`) | `0.32 * peak` | Sub-layers `mid/b2L0` and `mid/b2L1` across warm stone walls, slate roofs, sky cloud undersides, and upper tree crowns (`--midgain 1.2`) | Wet-on-dry shaped plane washes (`water: 0.62`) after measured full dry at band boundaries; feathered brush reloads (`_lf`) | Hard architectural boundaries preserved by mask clip; selected turning cloud/foliage edges softened with a clean damp brush |
| **Band 3: Midtone Structure & Stone Courses** (`Passes 42–64`) | `0.50 * peak` | Sub-layers `mid/b2L2`, `mid/b2L3`, and ashlar stone courses `mid/b3B` (`267` stone blocks, `--stoneblocks 0.32 --stoneblockamt 0.22 --stoneclusters 3`) | Wet-on-dry regional glazes (`water: 0.62`) plus light dry-on-dry warm stone tooth texture (`water: 0.22`) | Crisp separation between sunlit gable and shadowed left return; organic foliage silhouettes |
| **Band 4: Connected Cast Shadows** (`Passes 65–72`) | `0.75 * peak` | `shadow/b4` connected shadow mass across left buttress, eave soffits, shaded tree undersides, and window bays (`--shadowthresh 0.34`, `--violetshadow 1`) | Transparent shadow glaze (`55% French ultramarine + 45% raw sienna/sepia`, `water: 0.45`) over fully dried middle planes | Shadows cross regional boundaries continuously while respecting sunlit trim reserves |
| **Band 5: Deepest Recesses & Accents** (`Passes 73–80`) | `1.00 * peak` | `shadow/b5` Gothic window apertures, colonnade arches, and deepest foliage crevices (`--recesslayers 2 --recessshare 0.75 --deepaccent 0.25 --deepgrow 1`) | Concentrated dark glazes and recess accents on dry paper, followed by 1 restrained broad-shape touchpoint round (`_tp1`, `--touchfamilies 6`, `--touchmincells 0.025`, `--touchdmin 0.08`) and frisket removal | Crisp aperture edges; small shapes excluded from touchpoints to prevent mud |
| **Closing: Architectural Ink** | Post-wash | Full architectural linework (`closingink4-lines.json`, 276 spans: window mullions, arches, pediment moldings, cornice, tower louvers) | Crisp sepia ink (`--inkkscale 8`, `--drawwant 1`) over measured dry sheet (`dryPenGate`) | Drawn only on dry paper after all washes and resist removal |

---

## 3. Protected Lights & Failure Signs to Watch During `bench/paint.sh`

- **Protected Lights**:
  - Upper-right cumulus cloud corridor and left sky paper margin.
  - Sun-struck stone window surrounds, gable stringcourses, and colonnade arch trim.
  - Bottom foreground unpainted paper border.
- **Failure Signs to Check at `look` Stops**:
  - *After Opening / Band 1 (`Pass 16`)*: Verify that the two rectangular holes from Try 1 (`[0.76, 0.09, 0.80, 0.12]` in upper-right sky and `[0.578, 0.255, 0.592, 0.275]` on main gable) are completely gone, organic cloud reserves remain clean, and opening lines are sparse and structural (~38 spans).
  - *After Band 2 / Band 3 (`Pass 42` & `Pass 64`)*: Verify that `--midgain 1.2`, `--litlift 0.15 --litwarm 1`, and `--loadfeather 1.5` give the sunlit main gable a warm, even golden-ochre tone without pale diagonal reload gaps.
  - *Before Closing (`closing` boundary)*: Verify that `_tp1` with `--touchfamilies 6 --touchmincells 0.025 --touchdmin 0.08` added only a few hundred strokes (not 7,769!), keeping total brush strokes around `~6,300` so the 10%, 25%, 50%, 75%, and 100% progression frames map cleanly to Bands 1, 2, 3, 4, and 5+closing.

---

## 4. What Changed from Try 1 and Why

1. **Removed Explicit Rectangular Reserves (`"reserves": []` in `bench/plan/config.json`)**:
   - *Why*: Try 1 declared two axis-aligned bounding boxes in `config.json` (`cloud-corridor-upper-right` `[0.76, 0.09, 0.80, 0.12]` and `gable-window-trim-glint` `[0.578, 0.255, 0.592, 0.275]`). Because `planLightToDark` already reserves `8,017` organic target-white cells via `--paperlights 1 --paperrel 1`, those two bounding boxes stamped artificial sharp white rectangles into the sky and gable, hurting `edges detail` (3) and `marks texture` (2).
2. **Tamed Late Touchpoint Stroke Bloat (`_tp1` + `--touchfamilies 6 --touchmincells 0.025 --touchdmin 0.08`)**:
   - *Why*: In Try 1, `_tp2` (`2` rounds, `24` families, `minCells 0.0008`, `dmin 0.04`) added `18` passes containing `7,769` brush strokes (`56%` of all `13,859` strokes in the run!) *after* Pass 80. Because `cheat-risk.mjs` samples the 10%, 25%, 50%, 75%, and 100% progression frames by **share of total strokes laid**, all 80 value-plan passes were compressed into `0%–43%` of strokes, leaving the `50%`, `75%`, and `100%` stage snapshots nearly identical (`progression` mean score `1.9`) and muddying the left buttress and foliage. Restricting touchpoints to 1 round over at most 6 broad shapes (`>= 2.5%` of the sheet, `dmin 0.08`) cuts late touch-up strokes by `>95%`, restoring the natural 1-to-1 alignment between `10/25/50/75/100%` of strokes and Bands `1/2/3/4/5`.
3. **Warmer, More Even Sunlit Stone & Midtone Body (`_lit15_lw_mg12_lf`)**:
   - *Why*: Added `--litlift 0.15 --litwarm 1` (`_lit15_lw`) to strip cool/dark contamination from sunlit stone and shift it into warm yellow ochre, hansa yellow, and raw sienna; added `--midgain 1.2` (`_mg12`) so Band 2 and Band 3 washes have fuller body both in the 25%/50% stage snapshots and in the final facade; and added `--loadfeather 1.5` (`_lf`) so multi-load brush sweeps overlap and ramp pressure across reload points instead of leaving diagonal streak gaps across the main gable.
4. **Separated Sparse Opening Construction Lines from Full Closing Ink Detail (`_ol40_opp24` + rebuilt line files)**:
   - *Why*: Re-traced `opening-lines.json` (`minC=0.16, minLen=22, maxLum=0.52` -> `38` long structural lines, capped at `--openinglines 40 --openingpressure 0.24`) so the 10% and 25% stages show a clean, sparse architectural lay-in with zero short speckles, while `closingink4-lines.json` (`minC=0.09, minLen=9, maxLum=0.62` -> `276` lines) delivers the fine window mullions, arches, and cornice detail at the very end over dry washes.

---

## 5. Judge Critique Points Accepted vs. Rejected

- **Accepted**:
  - *Synthetic rectangular reserves in upper-right sky and main gable*: Fixed by setting `"reserves": []` and relying on organic target-white detection.
  - *No visual change between 50%, 75%, and 100% stage snapshots*: Fixed by eliminating the 7,769-stroke `_tp2` tail (`_tp1` + `--touchfamilies 6 --touchmincells 0.025 --touchdmin 0.08`).
  - *Too much fine detail/speckle in the first 25% of the build & weak contrast between 10% and 25%*: Fixed by reducing `opening-lines.json` from 176 lines (`minLen=14`) to 38 long structural lines (`minLen=22`, `_ol40_opp24`) and boosting Band 2–3 washes with `_mg12`.
  - *Diagonal pale streaks across the sunlit main gable and muddy left buttress/foliage*: Fixed with `_lf` (`--loadfeather 1.5`), `_lit15_lw`, `_mg12`, and excluding small shapes from touchpoints (`--touchmincells 0.025`).
- **Rejected**:
  - *Switching away from region-clipped light-to-dark planning (`region_w13`)*: One progression judge characterized the clean regional masks as "masked regions." However, `region_w13` is the foundational architectural planner for `Y1` and scored `4/4` on `value` and `composition`. Removing the explicit rectangular reserves, feathering brush reloads (`_lf`), and fixing the stroke timeline resolves the artifact without abandoning regional light-to-dark planning.
