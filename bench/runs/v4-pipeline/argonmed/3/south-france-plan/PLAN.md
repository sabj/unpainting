# Watercolour & Pen Plan — `south-france` ("France")

## 1. Visual Analysis of Target (`bench/plan/target.png`)
- **Subject & Composition**: A sunlit hillside village in southern France (`304×249` target px, rendered at `1216×996` px on a `280 mm` landscape sheet). Warm limestone buildings, stepped retaining walls, arches, and terracotta roofs crown the upper third (`y = 0..75`) and step down the right flank (`x = 215..304, y = 40..195`), while lush Mediterranean olive, chartreuse, and deep slate-green cypress foliage fills the central and lower slopes.
- **Value & Chroma Structure**:
  - **Brightest lights (`L* ≈ 82–92`, RGB `[230..248, 205..230, 145..185]`)**: Warm sunlit cream/ochre stone walls and roof ridges at top-left/center and lower-right stone highlights. Notably, there is no large bare-white sky; even the brightest stone terraces carry a warm pale yellow-ochre tone (`min(R,G,B) < 238`).
  - **Light-mid warm greens & stone (`RGB [178, 171, 74]` & `[215, 182, 125]`)**: Sun-drenched chartreuse tree crowns (especially lower right and left-center) and warm limestone facades.
  - **Core midtones (`RGB [123, 122, 80]` & `[149, 149, 82]`, ~49% of canvas)**: Broad olive-green foliage masses and shaded stone masonry.
  - **Dark accents (`RGB [76, 80, 59]` & `[63, 71, 72]`, ~28% of canvas)**: Deep olive canopy crevices, vertical cypress spires, dark window/arch openings, and the foreground tree trunk/branch armature.

## 2. Palette, Paper & Style Strategy
- **Paper Calibration (`_cur`)**: Because `target.png` has no bare white sky, default `--paperrel 1` mistakes the top 10% warm yellow-ochre stone terraces (`PAP ≈ [234, 209, 154]`) for bare paper `[252, 251, 248]`, leaving 5.3% of the village as stark white unpainted holes and dropping any pen lines that touch them. Using `_cur` (`--paperbase white --paperlights 1 --paperrgb 252,251,248`) restricts automatic paper protection to true white (`min >= 245`) so only our four explicit architectural highlight glints in `config.json` (`reserves`) stay bare paper, while all warm stone terraces receive a luminous pale yellow-ochre first wash.
- **Wide Box Palette**: Automatic wide palette selection (`hansa yellow, quinacridone rose, cerulean blue` + granulating sky cerulean from `_skyb`) achieves `2.31` sheet $\Delta E$ and `0.45` local $\Delta E$, cleanly spanning warm limestone ochres (`hansa + rose`), sunlit chartreuse (`hansa + cerulean`), muted olive greens (`hansa + cerulean + rose`), and deep slate-violet cypress/window shadows (`cerulean + rose` with `_cg13_vio_dk13`).
- **Urban Sketch Pen + Full Value Ladder**:
  - We preserve the full 5-band light-to-dark wash ladder (`Band 1` light wash + `Band 2` 4 graduated midtone layers `L0..L3` + `Bands 4–5` two shadow glazes) across the main architectural and foliage regions (`styleSelection.style: "precise-watercolor"` with `"distant-valley-mist": "urban-sketch"`), enhanced with `_spl6_lad_wre12`.
  - We pair this light-to-dark wash build with target-registered opening and closing sepia ink passes (`_sep8`, `_ink4`, `opening-lines.json` with 150 structural contour spans and `closing-lines.json` with 240 crisp dark architectural/branch accents).

## 3. Pass Order & Self-View Checkpoints
1. **Opening Ink (`drawing-first`)**: Fine sepia (`0.3 mm`, `_sep8`) structural contours registering the roofline, stone arches, terrace walls, and main tree trunks.
2. **Pass 1 (`wash-1-light`)**: Luminous pale warm stone and sunlit foliage base washes across all non-reserved cells.
3. **Passes 2–5 (`wash-2-mid-L1..L4`)**: Four stepped midtone washes building the olive hillside, terracotta roofs, and shaded masonry planes.
4. **Passes 6–7 (`wash-4-shadow-1`, `wash-5-shadow-2`)**: Cool-leaning deep olive and slate-violet shadow glazes carving out the cypress spires, deep canopy recesses, and dark window/arch openings.
5. **Closing Ink (`drawing-last`)**: Crisp dark pen accents (`closing-lines.json` + automatic `ink4` shadow accents) restoring architectural edge snap, window mullions, terrace joints, and foreground branches over the dried washes.
