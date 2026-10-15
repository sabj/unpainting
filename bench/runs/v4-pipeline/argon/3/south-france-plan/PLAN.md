# Painting Plan — South of France Hillside Village (`south-france`)

## 1. Reference Analysis & Visual Cues
The reference image (`bench/plan/target.png`, 304×249 px, painted at 1216×996 px on a 280 mm cold-press watercolor sheet) is a sunlit Provençal hillside village sketch in pen and wash:
- **Overall Key & Atmosphere**: High-to-mid key dominated by warm golden sunlight (`RGB(215, 182, 125)` on stone terraces and walls) set against rich yellow-green (`RGB(178, 171, 73)`), mid olive (`RGB(122, 121, 80)`), and deep olive-cypress (`RGB(76, 80, 60)` to `RGB(64, 72, 73)`) foliage masses, with a small cool blue-green distant valley at the upper right (`x: 0.78..1.0, y: 0.0..0.18`).
- **Paper vs. Pale Warm Washes**: Almost the entire sheet is tinted with warm ochre or yellow-green wash; the lightest 10% of the reference averages `RGB(233, 208, 152)` (warm sunlit stone), while true near-white paper glints (`RGB(255, 253, 237)`) occur only at tiny sunlit parapet and gable edges. Using `region_w13_cur` (`--paperbase white --paperrgb 252,251,248` without `--paperrel`) ensures the warm sunlit stone terraces are painted as luminous pale yellow-rose washes in Band 1 rather than left as stark white unpainted holes, while three small explicit reserves protect the true highlight glints.
- **Palette Fit**: Automatic wide-palette fitting (`--palettewide 1` + `--skyblue 1`) selects a clean 3-primary triad (`hansa yellow`, `quinacridone rose`, `cerulean blue`, plus the granulating cerulean sky tube), which unmixes every warm ochre, terracotta roof, yellow-green canopy, olive shadow, and cool distant hill with near-zero chromatic residual (`wideScore = 2.76`).
- **Line & Wash Integration**: Dark brown/sepia pen lines (`--outlinemedium ink --inkprofile sepia-ink --inkkscale 8`) define architectural rooflines, gable walls, windows, stone terrace walls, cypress silhouettes, and the prominent foreground tree trunk and branches (`x: 0.18..0.42, y: 0.50..1.0`).

---

## 2. Region Families, Technique & Pass Order
The 5-band light-to-dark value planner (`precise-watercolor` identity profile with `_lay4` and `_sky3` hue-family splitting) organizes the painting into six target-derived color/value regions grouped into three hue families (warm stone/terracotta, cool distance, and yellow-green/olive foliage):

1. **Opening Drawing (`bench/plan/opening-lines.json`, 65 structural paths)**:
   - Drawn first on dry cold-press paper in sepia ink (`pressure <= 0.30`, `length >= 43.5` cells) to establish the architectural skeleton of the upper and middle-right village clusters, stone terrace walls, and main foreground tree trunk before any wash is laid.
2. **Band 1 — Opening Light Washes (`value = 1`, wet-in-wet / prewetted planned lanes)**:
   - **Cool Distant Valley (`distant-cool-valley`, `x: 0.76..1.0, y: 0.0..0.18`)**: Pale cerulean and hansa wash laid into damp paper for soft atmospheric recession.
   - **Sunlit Stone Terraces & Village Facades (`sunlit-stone-terraces`, `upper-village-roofs`, `middle-right-houses`)**: Dilute hansa yellow + quinacridone rose washes establishing the warm ochre and buff stone ground across the hillside while preserving the three masked highlight glints.
   - **Sunlit Foliage Base (`sunlit-foliage-canopy`)**: Pale hansa yellow + cerulean underwash unifying the sunlit tree crowns.
3. **Bands 2 & 3 — Middle-Value Form & Foliage Layers (`M1..M4`, `--midlayers 4`, `--layersmooth 1.5`, `--edgewobble 0.9`)**:
   - Four progressive wet-on-dry and textured middle layers separated by hue family (`--layerhue 1`) build the terracotta roof planes (quinacridone rose + hansa), warm mid green-gold foliage (`RGB(149, 148, 83)`), and mid olive canopy masses (`RGB(122, 121, 80)`).
   - `--texvariety 0.8` (`_tv8`) and `--edgewobble 0.9` prevent mechanical straight edges and give organic breakup to foliage crowns and rough stone courses.
4. **Bands 4 & 5 — Coherent Cross-Region Shadow Glazes (`shadowThresh = 0.38`, `--darkgain 1.3`, `--coolgain 1.3`, `--shadowraw 1`)**:
   - Two late glazes on dry base washes cross region boundaries to lock in the dark vertical cypresses, deep under-canopy olive hollows, cast architectural shadows, and dark window/doorway recesses (`--recesslayers 2`, `--recessclean 1`).
   - Followed by 2 rounds of shape-level touchpoint deficit glazes (`--touchpoints 2`) where any planning shape reads lighter than the reference.
5. **Closing Drawing (`bench/plan/closingink4-lines.json`, 241 dark-backed paths)**:
   - Drawn last over the completely dried sheet (`_ink4`) to restore crisp dark architectural eaves, window mullions, stone wall crevices, cypress accents, and the foreground tree trunk and branch network.

---

## 3. Moisture, Load & Physical Discipline
- **Prewetting & Lane Merging**: Planned-lane washes (`--strokeplan 1`, `--lanemm 6`, `--strokemm 30`) prewet multi-lane passages (`--splwet 1`) so adjacent brush sweeps merge without dry lap lines.
- **Drying Gates**: Full physical drying (`dry(sheet, 20000)`) is enforced after the opening ink drawing, between value bands/passes, before touchpoint glazes, and before the closing ink pass (`dryPenGate`).
- **Cold-Press Tooth & Granulation**: `--cppits 0.35` (`_cpp`) and `--skyblue 1` (`_skyb`) allow pigment grains to settle into paper hollows on the hillside and distant valley washes.

---

## 4. Protected Lights, Edges & Value Hierarchy
- **Protected Lights**: Three small explicit reserve boxes (`[0.196, 0.010, 0.207, 0.020]`, `[0.132, 0.097, 0.139, 0.105]`, `[0.410, 0.110, 0.427, 0.123]`) hold the brightest paper glints on the upper-left stone parapet and upper village gable wall without creating long axis-aligned seams.
- **Edges**: Soft wet-in-wet transitions in the distant upper-right valley and sunlit foliage crowns; wobbled organic wash boundaries (`0.9 mm`) on mid-tone foliage; crisp pen-reinforced edges on village roofs, walls, windows, and foreground tree branches.
- **Value Hierarchy**:
  1. Reserved paper glints (`L* ~ 98`)
  2. Sunlit warm ochre stone walls and paths (`Band 1`, `L* ~ 75–85`)
  3. Bright yellow-green sunlit foliage and terracotta roofs (`Band 2`, `L* ~ 62–72`)
  4. Mid olive foliage and shaded stone facades (`Band 3`, `L* ~ 45–58`)
  5. Deep cypress silhouettes, under-canopy shadows, window recesses, and foreground tree trunk (`Bands 4–5` + closing sepia ink, `L* ~ 22–38`).

---

## 5. Failure Signs & Self-View Revision Strategy
During execution with `bash bench/paint.sh`, we will inspect `bench/looks/<n>-compare.jpg` at key checkpoints:
1. **After `start` (Opening Drawing)**: Verify that the 65 opening sepia ink lines register cleanly on the village buildings, terrace walls, and foreground tree without blotching or over-darkening the pale stone zones.
2. **After Band 1 Light Washes**: Check that the sunlit stone terraces carry a warm ochre-buff tint (no stark white holes) and that no hard axis-aligned seams appear.
3. **After Middle Layers (Bands 2–3)**: Check yellow-green and olive foliage chroma and value build; if middle values look too pale or too heavy before the shadow bands, adjust `--midgain` or `--darkgain` via `bash bench/paint.sh revise`.
4. **Before Closing Ink (`run closing`)**: Confirm shadow glazes and touchpoint passes have given sufficient depth (`p90` density and dark cypress contrast); then finish with the closing ink pass and inspect the completed painting.
