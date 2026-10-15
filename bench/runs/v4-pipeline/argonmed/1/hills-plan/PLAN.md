# Painting Plan — Hills and Winding Path (`hills`, Loose Ink and Wash)

## 1. Reference Cues & Visual Analysis (`bench/plan/target.png`)

The reference image (`306 × 242` px, rendered at `scale 4` = `1224 × 968` px on a `158.05 mm` cold-press sheet) is a **loose ink and wash** landscape depicting sunlit grassy hills bisected by a winding sandy dirt track and framed by dense oak and chaparral tree masses:

1. **Winding Sandy Path (`winding-sandy-path`, `[0.12, 0.0, 0.78, 1.0]`)**:
   - Enters at the bottom-center/right (`x ≈ 0.48–0.76, y ≈ 0.72–1.0`), curves left through a bright sunlit central bend (`x ≈ 0.34–0.56, y ≈ 0.44–0.75`), and splits into an upper-left climb (`x ≈ 0.16–0.35, y ≈ 0.0–0.40`) and an upper-right fork (`x ≈ 0.52–0.72, y ≈ 0.0–0.32`).
   - Holds the highest luminance on the sheet: bare paper catchlights (`RGB [255, 255, 255]` to `[251, 246, 229]`, top `0.3%` of cells) sit inside a warm buff/sandy ochre wash (`RGB [249, 221, 182]` to `[232, 198, 152]`), bordered by loose sepia-black ink rut and bank lines.
2. **Sunlit Grassy Hillsides (`left-sunlit-hillside`, `central-knoll-and-oaks`, `right-slope-and-trees`)**:
   - Open slopes of bright yellow-green grass (`RGB [218, 221, 144]` to `[176, 191, 98]`) transition smoothly into warm olive and sap-green midtones (`RGB [113, 119, 69]`).
   - Value and color modulate organically along the hill contours without hard geometric seams.
3. **Oak & Chaparral Tree Canopies (`upper-oak-canopies`, `central-knoll-and-oaks`, `foreground-banks-and-scrub`)**:
   - Rounded, overlapping foliage masses in cool cerulean-slate, deep olive, and violet-shadowed darks (`RGB [39, 45, 54]` down to `[16, 17, 16]` in the deepest recesses).
   - Defined by energetic, calligraphic dip-pen ink outlines (scalloped canopy crowns, trunk/branch crevices, and road-cut shadow edges) laid over layered transparent washes.

---

## 2. Palette, Paper & Optical Setup

- **Paper (`_cur`, `_cpp`)**:
  - Cold-press paper (`--paper coldpress --cpbump 0.5,2 --cpcover 2.2 --cpswell 0.3 --cppits 0.35`) with warm-white base `[252, 251, 248]`.
  - Using `_cur` (`--paperbase white --paperlights 1 --paperrgb 252,251,248`), paper estimation targets the top `1%` highlight glints (`[251.3, 246.4, 229.1]`) rather than the top `10%` mean (`--paperrel`). This reserves only the true brightest organic glints (`0.29%` of the sheet, with `"reserves": []` so no geometric rectangle appears in the road) as bare paper and ensures the warm sandy path receives its pale buff wash (`100%` of warm target cells painted).
- **Wash Palette (`widePalette` + `sap green` + `_skyb`)**:
  - Automatic 4-pan wide-gamut palette (`Hansa Yellow`, `Cerulean Blue`, `Quinacridone Rose`, `Sap Green`, sheet/local Lab fit error `3.07 dE`, local region error `0.3–0.5 dE`), plus a 5th granulating Cerulean Blue pan (`_skyb`: `--skyblue 1 --skyfloc 0.5 --layerhue 1 --skysplit 1`) that feeds cool blue-dominant canopy cells (`b - r > 8`) so the slate-blue tree shadows granulate naturally into the cold-press pits (`_cpp`).
- **Adaptive Multi-Lane Stroke Planning (`_spl20_sml90_lad`, `--splwet 0`)**:
  - Broad hillside and foliage planes (`> 50%` of the sheet) exceed the `38 mm` mop brush width (`125 mm` cross-axis span). Enabling `--strokeplan 1 --lanemm 20 --strokemm 90 --laneadapt 1` (`_spl20_sml90_lad`) with `--splwet 0` sweeps broad passages in overlapping physical brush lanes with per-stroke local charge factors (`PF`), preventing single-diagonal brush depletion wedges on the right side of the sheet.
- **Shape-Level Kubelka-Munk Refit (`--shaperefit 3`)**:
  - Runs 3 rounds of per-shape Kubelka-Munk optical density correction (`src/paint/methods/shape-refit.mjs`) during planning so nonlinear KM reflectance matches the target's warm yellows, olive greens, and deep slate-violet darks.
- **Drawing Media (`sepia-ink` + `_sep8`)**:
  - Preparatory opening drawing in 64 long structural contours (`--openinglines 64 --openingminmm 6 --openingpressure 0.35`).
  - Selective closing drawing in high-density `sepia-ink` (`_sep8`: `--inkk .396,.481,.619 --inkkscale 8`, `K = [3.17, 3.85, 4.95]`) with full ridge-modulated pressure (`_ink4`: `--closingedgemin 0 --closingpressure 1 --closinglines 100000 --drawwant 1`).

---

## 3. Pass Order, Moisture & Execution Schedule

| Stage | Band / Pass | Region / Scope | Technique & Moisture | Purpose & Edge Control |
| :--- | :--- | :--- | :--- | :--- |
| **0a** | `frisket` | Organic target-white glints (`9` shapes, `0.29%` of sheet) | Masking fluid on dry paper (`applyResist`) | Seals the brightest path catchlights so sweeping washes cross the road cleanly without hard stop-and-start seams. |
| **0b** | `opening` (`first: true`) | 64 longest structural contours (`bench/plan/opening-lines.json`, `>= 16` cells / `8.2 mm`) | `sepia-ink` at light opening pressure (`--openinglines 64 --openingminmm 6 --openingpressure 0.35`), followed by full dry | Establishes the winding road banks, hill crests, and major oak canopy silhouettes before any wet wash is laid. |
| **1** | **Band 1** (`passes 1–10`) | All organic Lab-spatial regions outside `protectedCells` | Shaped plane washes (`wet on dry`, dilute load, zero unsupported axis-aligned seams) | Lays the pale warm buff roadbed (`Hansa Yellow + Quinacridone Rose`) and luminous yellow-green hillside undertones (`Hansa Yellow + Sap Green + Cerulean Blue`). |
| **2–3** | **Bands 2–3** (`_lay4`: `passes 11–50`) | Sunlit hillsides, road ruts, and mid-tone oak crowns | 4 nested dry-between-layers middle washes (`thresholds 0.14, 0.26, 0.40, 0.56`, `_spl20_sml90_lad`, `_cg13`, `_noslane`, `_rg0`, `--splwet 0`) | Builds warm olive slopes and cool mid-green foliage masses in overlapping multi-lane transparent glazes with on-sheet feedback (`sh._fb`); `_noslane` prevents horizontal sky-lane striping in cool tree masses and `_rg0` prevents an artificial horizontal shadow step at `y = 0.62`. |
| **4** | **Band 4** (`passes 51–55`) | Cross-region tree shadows & road-bank cast shadows | Continuous shadow glaze (`shadowThresh 0.38`, `_dk13`, `_vio`) + contour-aligned dry brush (`_tfl10`, `_tv8`) | Unifies shadow masses across region boundaries with cool cerulean-violet glazing and directional foliage texture following 2 mm smoothed value contours. |
| **5a** | **Band 5** (`passes 56–60`, `_rec2x`, `_rcl`) | Deepest canopy interiors & trunk/bank crevices | 2 nested recess-accent layers (`--recesslayers 2 --recessshare 0.75 --recessclean 1`), then frisket lift after dry | Punches in the darkest painted notes (`[16, 17, 16]` to `[40, 48, 55]`) inside the upper, central, and foreground tree masses. |
| **5b** | **Touchpoints** (`pass 61`, `_tp2`, `_shs`) | 24-family planning shapes (`TP_SHAPES`, excluding `PENCELLS`) | 2 rounds of shape-level deficit glazing (`--touchpoints 2 --touchgain 0.6`) on dry paper | Measures each planning shape's mean optical density against the reference (`TARGET_GUARD.look`) outside pen-line cells and glazes any shape that reads lighter than target. |
| **6** | **Closing Ink** (`closing`, `_ink4`, `_sep8`) | 426 selective ink ridges (`bench/plan/closingink4-lines.json`) | Dip-pen `sepia-ink` (`--inkkscale 8`) on verified dry paper (`dryPenGate`: `water <= 0.001, pore <= 0.021`) | Delivers the crisp, lively loose-ink-and-wash finish: scalloped foliage contours, dark interior branches, and sweeping road-edge lines, strictly avoiding `protectedCells`. |

---

## 4. Self-View Checkpoints, Revisions & Failure Signs

During `bash bench/paint.sh`, we inspect intermediate side-by-side comparisons (`bench/looks/<n>-compare.jpg`):

1. **Look 1 (`01-compare.jpg`, Boundary 0 — After Opening Lines)**:
   - *Observed*: Clean 64 structural contour lines (`opening-lines.json`) accurately tracing road banks, hill crests, and oak canopy boundaries on warm-white cold-press paper.
2. **Look 2 (`02-compare.jpg`, Boundary 10 — After Band 1 Light Washes) & Revision**:
   - *Observed*: Warm sandy path and left/central yellow-green hillside washes registered well, but (a) the single-diagonal `shapedPlanePaths` stroke on the 78%-of-sheet Band 1 passage ran dry 2/3 across the diagonal (`r = 484` cells vs `147`-cell mop reservoir), leaving a paler wedge on the right slope, and (b) the explicit rectangular reserve `path-sunlit-glint` created a tiny square dot next to the organic highlight.
   - *Revision Applied at Boundary 10*: Set `"reserves": []` in `bench/plan/config.json`, added `_spl20_sml90_lad` to `bench/variant.txt`, and added `"--splwet", "0"` to `bench/plan/extra-args.json`. With adaptive multi-lane stroke planning (`planLanes`) and on-sheet feedback (`sh._fb`), the broad `L0..L3` middle washes (`passes 11–50`, covering `78.3%` of the sheet in `L0`) and `touchpoints` (`pass 61`) sweep the entire width of the sheet in overlapping lanes and automatically recharge the right-hand hillside deficit.
3. **After Middle Foliage Layers (`passes 11–50`)**:
   - *Verify*: Full-sheet coverage across both left and right hillsides, warm olive slopes separating cleanly from cool cerulean-green oak canopies.
4. **After Shadow Glazes, Deep Recesses & Touchpoints (`closing`, Before Closing Ink)**:
   - *Verify*: Deep tree canopies reach rich slate-olive-charcoal values, corrective touchpoint glazes balance any remaining regional lightness deficits, and zero passages are dropped (`dropped === 0`).
5. **After Closing Ink (`finish`)**:
   - *Verify*: Scalloped tree outlines, branch accents, and road-edge ink strokes register cleanly and darkly over the dried washes without bleeding or crossing reserved highlights.
