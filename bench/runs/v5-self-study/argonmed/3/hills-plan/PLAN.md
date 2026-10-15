# Painting Plan — Hills (Round V5, Try 3 of 3)

## Subject & Style Overview
- **Subject**: `hills` (`bench/plan/target.png`, `306×242` source rendered at `1224×968` px on a `158.05 mm` cold-press sheet).
- **Task Style**: **Loose ink and wash** (`styleSelection.style = "ink-and-wash"`).
- **Visual Structure**: An S-curving sunlit sandy path winds upward from the bottom-center foreground through a wooded hillside gap to the upper-left crest, with a distant ribbon of the track reappearing at the top-right crest. Sunlit yellow-green grassy meadows occupy the lower-right slope, central diagonal ridge, and upper hillsides (`L=70–85`), framed by dense oak and scrub canopies (`L=18–55`) with olive-green outer crowns and cool slate-blue/sepia interior shadow cores.

---

## Region-by-Region Technique, Order, Moisture & Load

1. **Opening Structural Drawing (`bench/plan/opening-lines.json`, Pass 0)**
   - **Reference Cue**: Continuous sepia pen-and-ink contours along both shoulders of the winding sandy road, the sweeping diagonal hillside crests, and the outer tree-line silhouettes bordering the sunlit meadows.
   - **Technique & Load**: Delicate sepia ink (`_sep5`, `--openingpressure 0.26`, `--drawstroke 0.28`, `59` smoothed structural polylines). Zero lines are placed inside the dark oak canopy interiors or across the open grass lawn, eliminating the "uniform squiggle texture" that hurt Try 2's 10% and 25% progression checkpoints.

2. **Region 1 — Winding Sandy Path (`sandy_path_lower`, `sandy_path_upper_left`, `sandy_path_top_right`, Order 1)**
   - **Reference Cue**: Warm cream-ochre and pale sienna/hansa road surface (`RGB ≈ (236, 226, 200)`, `L=85–97`) with soft warm shoulders and a thin bright center-of-road sunlit glint (`L >= 96`).
   - **Technique, Moisture & Load**: Damp glaze (`--paperrel 0`, `--paperlights 0`, `--litl 85`, `--litreserve 96`, `_lit45_lw`). Instead of bleaching `3.8%` of the sheet as bare white paper (`protectedCells`) as in Try 2, only `0.05%` (`632` pixels at `L >= 96`) are reserved as bare paper glints, while the `33,486` road cells receive Band 1 warm `hansa + yellow ochre + burnt sienna` washes and 55% of Band 2 modeling (`--litlift 0.45`, `--litwarm 1`), staying protected from Band 4–5 dark shadow glazes.

3. **Region 2 — Sunlit Meadow Slopes & Ridges (`sunlit_meadow_lower_right`, `sunlit_ridge_upper_left`, `sunlit_ridge_upper_right`, Order 2)**
   - **Reference Cue**: Luminous yellow-green grass slopes (`RGB ≈ (185, 198, 125)`) with gentle hillside contour modeling and warm ochre-green transitions.
   - **Technique, Moisture & Load**: Wet-on-wet broad washes (`_spl6_sml28_lad_wre15`) led by `hansa yellow`, `sap green`, and `yellow ochre` in Band 1 and Band 2. Ordering `--paints` as `"hansa,sapgreen,ochre,sienna,ultramarine,sepia"` ensures luminous yellow-green and golden-ochre washes establish the sunlit ground first at `10%–25%` before any earth or shadow pigments arrive.

4. **Region 3 — Midtone Olive & Scrub Foliage (`wooded_valley_center_right`, `wooded_hill_left_foreground`, Order 3)**
   - **Reference Cue**: Scalloped olive-green and warm earth-green oak crowns (`L=42–65`) massed along the central diagonal valley and left foreground hill.
   - **Technique, Moisture & Load**: Two-layer textured nested midtone washes (`_lay2_lt_nest`, `--midgain 1.15`, `_tv8`, `_soft`) in `sap green`, `yellow ochre`, and `burnt sienna`. Disabling sky-domain splitting (`_noslane`, `--layerhue 0`, `--skysplit 0`, `--skyblue 0`) prevents `targetRegions` Cluster 3 (the cool slate-green oak cores) from being carved out as a separate "sky" domain with horizontal cerulean sky-lanes.

5. **Region 4 — Deep Slate-Olive Canopy Shadows & Recesses (Order 4)**
   - **Reference Cue**: Cool slate-blue/green interior tree cores (`RGB ≈ (51, 64, 72)`) and deep sepia-olive under-canopy crevices (`L=16–38`).
   - **Technique, Moisture & Load**: Loaded damp-into-dry shadow glazes (`--darkgain 1.25`, `_st36`, `_cg11`, `_vio`, `_shs`, `_rec2x_rcl`, `_tp1`) mixing `ultramarine`, `sap green`, `burnt sienna`, and `sepia` across Band 4 and Band 5.

6. **Closing Contour & Trunk Accents (`bench/plan/closingink4-lines.json`, Final Pass)**
   - **Reference Cue**: Crisp dark sepia road-shoulder lines, wheel ruts, hillside crest lines, trunks, and major canopy-division contours (`116` smoothed structural polylines).
   - **Technique & Load**: Dry-brush sepia contour ink (`_ink4`, `_sep5`, `_dwg115`, `--closingpressure 0.58`) applied after all washes settle.

---

## Edges, Values & Failure Signs to Watch During Painting
- **Protected Lights**: Only `632` true highlight cells (`L >= 96` along the center of the lower sandy track) are reserved as bare paper; the rest of the sandy path must read as warm cream-ochre (`L=85–95`) rather than a white stair-stepped cutout.
- **Edges**: Crisp sepia ink and value transitions along the road shoulders and meadow-to-treeline ridges; soft feathered wash transitions (`_soft`, `_wre15`) inside the grassy slopes and across overlapping tree crowns.
- **Value Progression**:
  - `10%` (around Pass 5–6): Delicate sepia road/ridge layout + luminous `hansa + sap green + yellow ochre` Band 1 foundation across meadows and road.
  - `25%` (around Pass 13–14): Band 2 Layer 0 complete and Layer 1 underway, separating sunlit yellow-green meadows from olive tree masses.
  - `50%` (around Pass 27): Band 2 and Band 3 regional foliage modeling complete; Band 4 first shadow glazes beginning in the wooded valleys.
  - `75%` (around Pass 40): Band 4 shadow glazes complete and Band 5 deep slate-olive/sepia canopy cores underway.
  - `100%` (Pass 54): Full dark canopy depth, touchups, and `116` closing sepia structural contours.
- **Failure Signs to Check via `look`**:
  1. Opening ink appearing blotchy or noisy inside unpainted tree areas at Pass 0.
  2. Any bleached white cutout along the sandy road shoulders.
  3. Flat gray-blue horizontal slabs inside the tree canopies during midtone passes.

---

## Changes from Try 2 & Judge Critique Resolution

### Accepted Critiques & Root-Cause Fixes
1. **"Uniform squiggle texture is dumped across the whole sheet before any structure exists" (`10%: 1.5/5`, `25%: 1.5/5`, `edges detail: 3`, `marks texture: 3`)**:
   - *Cause*: Try 2 traced 320 opening and 556 closing short unsmoothed pixel chains (`median length 15 px`) from 3-px dappled leaf crevices inside the dark oak canopies, and drew them with `--drawwidthgain 1.4` and `--openingpressure 0.42`.
   - *Fix*: Replaced with smoothed structural contour polylines (`59` opening lines restricted strictly to road edges and meadow-to-treeline silhouettes, `116` closing lines adding directional canopy/trunk divisions), with `--openingpressure 0.26`, `--drawstroke 0.28`, `--drawwidthgain 1.15`, and `--closingpressure 0.58`.
2. **"Tree masses arrive as flat gray slabs" (`25%–75%` progression `1.5–2.5/5`)**:
   - *Cause*: Try 2 kept `_sky3` (`--layerhue 1 --skysplit 1`) and base `--skylanes 1`, which misclassified `targetRegions` Cluster 3 (`20.8%` of the sheet, the cool slate-green oak cores where `B - R = 21 > 10`) as a sky domain and painted it with horizontal `cerulean` sky-lanes.
   - *Fix*: Added `_noslane` and `"--layerhue", "0", "--skysplit", "0", "--skyblue", "0"`, and replaced `cerulean` with `ochre` in `--paints` (`"hansa,sapgreen,ochre,sienna,ultramarine,sepia"`).
3. **Bleached white stair-stepped road cutout & missing road-edge ink (`classic value: 5.54`)**:
   - *Cause*: Base `--paperrel 1 --paperlights 1` plus Try 2's `--litl 78 --litreserve 88` masked `44,502` road cells as bare white paper (`protectedCells`), which also caused `selectValueInk` (`protectedCount > 0`) to delete road-edge ink lines.
   - *Fix*: Set `"--paperrel", "0", "--paperlights", "0", "--litl", "85", "--litreserve", "96"` with `_lit45_lw`, and ensured all road-shoulder ink lines stay clear of the `632` center-of-road glint pixels.
4. **Unread options (`--foliagerefit`, `--skyfloc`) & 57,789-stroke timeout risk**:
   - *Fix*: Removed unread `_leaf` (`--foliagerefit`) andportrait-only `_dp38_dg0`, and switched from `_lay3_spl3_sml14` (`57,789` strokes) to `_lay2_lt_nest_spl6_sml28_lad_wre15` (`~16,600` strokes across `54` passes).

### Rejected / Qualified Critique
- While the progression judge noted `"the whole sheet at one faint value, as if faded in (4)"` at `10%`, in authentic light-to-dark watercolor the `10%` stage *should* be a high-key luminous first wash over structural linework. What made Try 2's `10%` look artificial was not the light wash value itself, but that the first wash was salmon-pink `burnt sienna` (`paints` order) underneath 320 dark leaf-squiggle fragments. Reordering `--paints` so `hansa yellow`, `sap green`, and `yellow ochre` lead Band 1 over clean road-and-ridge linework makes the `10%` stage read as a genuine watercolorists's warm yellow-green ground wash.
