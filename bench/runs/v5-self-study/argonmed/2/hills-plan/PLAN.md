# Painting Plan — Hills (`hills`, Round V5, Try 2 of 3)

## 1. Visual Target & Aesthetic Goal
- **Target**: [target.png](file:///private/tmp/unpaint-bench-nkCRoj/ws/bench/plan/target.png) (`306×242` px rendered at `1224×968` px on a `158.05 mm` cold-press watercolor sheet)
- **Style**: **Loose ink and wash** (`precise-watercolor` 5-band light-to-dark value architecture with preparatory dip-pen structure and comprehensive closing sepia dip-pen contour/foliage linework on the dried sheet).
- **Subject**: A sunlit coastal-hillside dirt path curving from the lower right around a left-center bend and branching toward two upper forks between rounded oak and chaparral canopies, bright yellow-green grassy slopes, and deep slate-sepia canopy shadows.

---

## 2. Root-Cause Diagnosis of Try 1 & Exact Fixes for Try 2

### A. Why the Oak Trees Turned Into Unmodulated Late Darks (`progression: 2.8/5`)
1. **Root Cause 1 (`--deepaccent 100 --deepgrow 1` from portrait base recipe)**:
   - In `src/paint/methods/light-to-dark.mjs` (lines 69 & 101), `deepAccent = 100` (`_dp100_dg1`) selects every pixel with `Math.max(R, G, B) < 100` (grown into `< 145`), zeroes out its middle bands (`weights[1] = weights[2] = 0`), and moves `150%` of its demand (`0.75 + 0.75`) into Band 4 and Band 5 shadow glazes.
   - While `max(RGB) < 100` selects ~1% of a portrait (pupils/nostrils), on `hills` it captured **`39.9%` of the entire landscape** (nearly all oak canopies and dark olive slopes). As a result, `86.5%` of total pigment mass was withheld from the middle layers (`10%–50%` of strokes) and dumped into Bands 4 & 5 at the end, producing the progression judge's exact tell: *"the whole sheet at one faint value, as if faded in; texture arriving as a dump, everything sharpening at once late"*.
   - **Fix**: Set `_dp38_dg0` (`--deepaccent 38 --deepgrow 0`) so only the deepest interior trunk/canopy crevices (`max(RGB) < 38`) are deferred as Band 4/5 accents, restoring full middle-value modeling (`43,282` mass units in Band 2 + `4,772` in Band 3 vs only `9,974` in Try 1) across the oak canopies and hillsides.
2. **Root Cause 2 (`_lay4` + `_spl20_sml90_lad` stroke inflation)**:
   - Four full-sheet middle layers (`_lay4`) with 2.0 mm lanes cut into 9 mm strokes inflated the run to `12,669` strokes and compressed Band 1 into the first `4.8%` of strokes.
   - **Fix**: Replace `_lay4` with `_lay2_lt` (`--midlayers 2 --layertexture 1`), which paints 2 connected middle layers (`L0`, `L1`) followed by a regional Band 3 pass across the 6 color/value regions, with `_spl3_sml14_lad` (`--lanemm 3 --strokemm 14`). Now the five progression snapshots (`10%`, `25%`, `50%`, `75%`, `100%`) land cleanly in Band 1 (`10%`), Band 2 `L0` (`25%`), Band 2 `L1` (`50%`), Band 3 regional modeling (`75%`), and Band 4/5 shadows + closing ink (`100%`).

### B. Why Rust-Orange Speckles & Pinkish-Grey Slabs Appeared (`marks texture: 2.33/10`)
1. **Root Cause**:
   - Try 1 left `--paints` unset, so `widePalette` selected a 3-pan CMY triad (`hansa yellow, cerulean blue, quinacridone rose`), and `_skyb` (`--skyblue 1`) split oak tree pixels (`b - r > 8`, `23.8%` of the sheet) into a separate granulating sky-blue pan. Single-pigment passes of `quinacridone rose` + `hansa yellow` created pinkish-grey intermediate slabs and `26,706` rust-orange edge/tooth pixels around dark blue tree passages.
2. **Fix**:
   - Explicitly specify a 6-pan landscape palette in [extra-args.json](file:///private/tmp/unpaint-bench-nkCRoj/ws/bench/plan/extra-args.json): `"--paints", "hansa,sienna,sapgreen,cerulean,ultramarine,sepia"` with `"--skyblue", "0"` and `"--shaperefit", "4"`. This eliminates `quinacridone rose`, prevents artificial sky-blue splitting inside the trees, and lowers unmix refit error to `0.86` RGB units.

### C. Why the Winding Sandy Path Was Washed Over (`composition values: 4.67/10`)
1. **Root Cause**:
   - Try 1 left `--litlift 0` and kept architectural base tokens `--groundglaze 0.22` (`_rg10`) and `--stoneblocks 0.25` (`_blk60`), so middle foliage washes swept across `78.3%` of the sheet over the sandy roadbed.
2. **Fix**:
   - Enable `_lit60` (`--litlift 0.60`) with `"--litl", "78", "--litreserve", "88"` and `_rg0` (`--groundglaze 0`). On `target.png`, `warmStone && L* >= 78` selects `8,224` warm sandy road and sunlit bank cells (`97.8%` road/earth), reserving `1,099` brightest sun-struck glints (`L* >= 88`) as bare cream paper, keeping full Band 1 warm buff (`hansa + sienna`) on the roadbed, cutting middle washes on the road by `60%`, and blocking shadow glazes (`weights[3..4] = 0`) on the road.

### D. Why 77% of Closing Ink Lines Disappeared (`edges detail: 2.67/10`)
1. **Root Cause**:
   - `bench/tools/trace-ink.mjs` dropped lines over green foliage (`green(y*W+x)`) and curved canopy arcs (`chord/len < 0.55`), and assigned median `weight = 0.44`, causing `selectedDrawing` (`weight >= 0.6`) to drop `327` of `426` closing lines (`77%`).
   - In addition, `prepareDrawing` (`material-profiles.mjs` line 24) checks `if (state.used >= cap.lines) break;`.
2. **Fix**:
   - Retraced `target.png` without the anti-green filter and with a 1-px buffer around `protectedCells` (`protCnt === 0`), pre-splitting long chains into `<= 24 px` segments with `weight` in `[0.68, 0.95]` and `meanContrast >= 0.062`.
   - Produced `320` structural opening lines in [opening-lines.json](file:///private/tmp/unpaint-bench-nkCRoj/ws/bench/plan/opening-lines.json) and `909` closing contour/foliage lines in [closingink4-lines.json](file:///private/tmp/unpaint-bench-nkCRoj/ws/bench/plan/closingink4-lines.json) (`_ink4` sets `--closinglines 100000 --closingedgemin 0 --drawwant 1`, and `_uncap` sets `--openinglines 100000`).

---

## 3. Rejected Judge Critiques
- We reject any reading of the progression judge's *"flat evenly-toned slabs standing in for a form"* as a reason to abandon shaped light-to-dark watercolor washes; the flatness was caused by `_dp100_dg1` starving Bands 2–3 of `86.5%` of pigment mass and by 3-pan CMY `quinacridone rose` passes, both of which are fixed above.
- We preserve the target's loose dip-pen-and-wash character rather than attempting photographic leaf-by-leaf rendering; scalloped canopy contours and trunk/rut accents are carried by the `sepia-ink` opening and closing drawings over graded washes.
