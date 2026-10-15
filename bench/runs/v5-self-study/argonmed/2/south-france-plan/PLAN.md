# Painting Plan — Round V5, Try 2 (`south-france`)

## 1. Reference Cues (`bench/plan/target.png`, 304×249 px → 1216×996 px on 280 mm sheet)
- **Subject & Composition**: A sunlit southern French hilltop village (Gordes / Luberon character) rising in stepped limestone facades, towers, and warm terracotta roofs across the upper-middle band (`y = 0.18..0.66`), supported by horizontal stone retaining walls and arched substructures (`y = 0.56..0.78`), framed by a warm sunlit upper-left terrace (`x = 0.00..0.42, y = 0.00..0.28`), upper-right olive/oak canopy (`x = 0.38..1.00, y = 0.00..0.34`), and deep Mediterranean cypresses and wooded slopes below (`y = 0.66..1.00`).
- **Light & Paper Key**: Warm afternoon sunlight from the upper left illuminates the pale yellow-ochre limestone walls and upper-left terrace (`RGB ≈ [230, 206, 147]`, `L* ≈ 83`). There are **no bare white paper patches** in the target (`0` pixels with `min(R,G,B) >= 245`); the lightest planes are warm sunlit ochre stone and pale dry grass that require a translucent Band 1 yellow-ochre wash rather than unpainted white holes.
- **Requested Style**: Urban sketch, pen plus light wash — crisp architectural and structural sepia ink linework paired with translucent, progressively layered watercolor washes from light to dark.

---

## 2. What Changed from Try 1 and Why

1. **Switched `styleSelection.style` (and all region styles) from `"urban-sketch"` to `"precise-watercolor"`**:
   - *Why*: In Try 1, setting `style: "urban-sketch"` in `config.json` triggered two destructive side effects:
     1. `bench/plan-args.mjs` injected `--valuefloor ink-and-wash`, and `src/paint/methods/light-to-dark.mjs` (lines 139–148) zeroed out `weights[1]` and `weights[2]` (all middle value bands!) for non-`precise-watercolor` styles and folded `weights[3]` (`0.58`) into `weights[0]` (`0.42`) outside shadows. That dumped **100% of non-shadow pigment into Band 1** as flat, opaque slabs and ignored `_lay2`.
     2. `bench/plan-args.mjs` line 237 (`STYLE_INK['urban-sketch'] === 'black'`) set `sepiaInk = false`, which **skipped `_sep8` (`--inkkscale 8`)** from the base recipe, making the pen ink 8× fainter.
   - *Fix*: Setting `"precise-watercolor"` across the global style and all 5 regions restores the true 5-band light-to-dark value ladder (`Band 1 <= 28%`, `Band 2` progressive dry mid-layers with `_lay3`, `Bands 4–5` connected shadow glazes), keeps `_sep8` active so sepia pen lines have rich optical density, and ensures zero Band 1 region-style boundary seams.

2. **Explicit 7-Pigment Palette in `bench/plan/extra-args.json` (`--paints ochre,sapgreen,sienna,hansa,cerulean,ultramarine,sepia`)**:
   - *Why*: Because `trumbull: false` in `bench/frozen.json`, `_pgreen` from the base recipe was skipped in Try 1, leaving `widePalette` to auto-pick a 3-primary CMY triad (`hansa yellow`, `quinacridone rose`, `cerulean blue`). Because passes execute one pigment at a time, Pass 1 painted bright lemon yellow and Pass 2 painted salmon-pink (`quinacridone rose`) over the entire green hillside (causing the 25% and 50% stage progression failures).
   - *Fix*: Explicitly specifying `"--paints", "ochre,sapgreen,sienna,hansa,cerulean,ultramarine,sepia"` drops `quinacridone rose`, lowers whole-sheet + local colour error from `15.65` to `6.49`, and orders `yellow ochre` (#1), `sap green` (#2), and `burnt sienna` (#3) first in every band so sunlit stone, olive-green foliage, and terracotta roofs appear immediately in their true hues from the earliest passes.

3. **Eliminated False White Paper Reserves (`_cur` in `variant.txt`, `"reserves": []` in `config.json`, removed `_lit18_lw`)**:
   - *Why*: In Try 1, default `--paperrel 1` treated the brightest 10% of target pixels (warm sunlit stone `RGB ≈ [230, 206, 147]`) as "bare white paper", reserving 55,123 cells (`4.55%` of the sheet) as raw white holes. Worse, `selectValueInk` deletes any pen stroke touching even 1 cell of `protectedCells`, which erased architectural ink lines along lit facades. Meanwhile, the 6 rectangular `reserves` in `config.json` stamped hard axis-aligned white rectangles into the buildings and trees.
   - *Fix*: Using `_cur` (`--paperbase white --paperrgb 252,251,248` without `--paperrel`) and `"reserves": []` reduces false white reserves from 55,123 cells to **0 cells**, allowing Band 1 to lay a continuous warm yellow-ochre wash over the sunlit stone and preserving 100% of opening and closing pen lines.

4. **Removed Mechanical Horizontal Laning (`_spl6_lad`) and Added Organic Edge Softening (`_efade_ew3`)**:
   - *Why*: `_spl6_lad` sliced every wash into 6 mm horizontal strips of 30 mm overlapping segments, creating a mechanical brick-grid texture across the hillside (`marks/texture: 1.67`, 50% stage `1/5`) and inflating total wash strokes to 15,559.
   - *Fix*: Removing `_spl6_lad` lets `shapedPlanePaths` sweep each value plane with fitted continuous brush gestures (`~1,500–2,500` total strokes), while `_efade` (`--edgefade 1.2`) and `_ew3` (`--edgewobble 0.3`) give shadow edges organic watercolor transitions.

5. **Rebuilt `opening-lines.json` (300 lines) and `closing-lines.json` (180 lines) and Raised Opening Pen Pressure (`_opp85`)**:
   - *Why*: `bench/tools/trace-ink.mjs` had a `y0 - y0` typo in its chord calculation (`Math.hypot(x0 - x1, y0 - y0)`), measuring only `|dx|` and dropping every vertical architectural wall, tower, chimney, window jamb, and cypress trunk! In addition, default `--openingpressure 0.3` made the opening pen lines faint, and `strokesOf` split long lines into `< 10.64` px tail fragments that `selectValueInk` discarded.
   - *Fix*: Fixed the 2D chord distance `Math.hypot(x0 - x1, y0 - y1)`, pre-chunked opening polylines to `11.5..28.5` target px so 100% survive `strokesOf` and `selectValueInk` (`300/300` kept), extracted `180` high-contrast architectural and structural closing lines (`3.5..27` target px, `contrast >= 0.062`, `180/180` kept), and added `_opp85` (`--openingpressure 0.85`) so the opening sepia ink drawing is crisp and unmistakable at the 10% and 25% checkpoints.

---

## 3. Critique Points Accepted vs. Rejected (`bench/feedback/FEEDBACK.md`)

- **Accepted**:
  - *Opening pen drawing was too sparse, faint, and missing vertical architectural walls/windows*: Fixed by repairing the 2D chord calculation in line tracing (`300` opening lines, `180` closing lines), keeping `_sep8` active via `"precise-watercolor"`, and setting `_opp85` (`--openingpressure 0.85`).
  - *Stage 2 (25%) and Stage 3 (50%) painted unnatural yellow and salmon-orange across the green hillside*: Fixed by setting `--paints ochre,sapgreen,sienna,hansa,cerulean,ultramarine,sepia` (removing `quinacridone rose` and placing `ochre` and `sapgreen` first).
  - *Stage 3 (50%) exhibited a mechanical horizontal brick-grid wash pattern*: Fixed by removing `_spl6_lad` and switching from `"urban-sketch"` (`ink-and-wash` value floor) to `"precise-watercolor"` with `_lay3`.
  - *Unpainted white cutouts on the upper-left terrace and rectangular white holes inside buildings/trees*: Fixed by using `_cur`, removing `_lit18_lw`, and setting `"reserves": []`.
- **Rejected**:
  - *None of the visual observations in `FEEDBACK.md` were rejected*, as all three VLM judges and the progression judge accurately identified genuine rendering defects in Try 1. However, we **reject the naive interpretation** that "urban sketch, pen plus light wash" should be configured via `styleSelection.style: "urban-sketch"` in `config.json`: in this codebase, `"urban-sketch"` activates the `ink-and-wash` value floor that zeroes out all mid-tone value bands (`weights[1]=weights[2]=0`) and disables `_sep8`. Achieving a true pen-and-light-wash urban sketch requires `styleSelection.style: "precise-watercolor"` combined with strong opening/closing sepia ink (`_sep8`, `_opp85`, `_ink4`).

---

## 4. Execution Order, Techniques, Moisture/Load, Edges, and Failure Signs

1. **Stage 0 — Opening Structural Pen (`bench/plan/opening-lines.json`, 300 strokes)**:
   - *Material & Technique*: Dry-paper sepia ink (`_sep8`, `--openingpressure 0.85`, width `0.12–0.45 mm`), laying roof ridges, vertical building walls, window arches, retaining wall ledges, and primary cypress/tree contours before any wash.
2. **Stage 1 — Band 1 Pale Ground Washes (`value = 1`, `<= 28%` pigment mass)**:
   - *Order & Load*: Wet-on-dry translucent washes led by `yellow ochre` (sunlit stone facades and upper-left terrace), `sap green` (hillside canopy and lower wooded slopes), and `burnt sienna` (terracotta roof planes).
   - *Protected Lights*: Zero hard rectangular reserves (`reserves: []`, `_cur`); lightest stone planes stay luminous through low Band 1 pigment load (`<= 0.16` value cap).
3. **Stage 2 — Band 2–3 Progressive Dry Mid-Tone Washes (`_lay3`, `value = 2..3`)**:
   - *Order & Load*: Three progressive dry-paper mid-layer subdivisions (`--midlayers 3`) per region domain, building warm stone modeling (`ochre` + `sienna`), sunlit vs. shaded foliage (`sap green` + `hansa` + `cerulean`), and shaded wall planes without horizontal lane seams.
4. **Stage 3 — Band 4–5 Connected Shadow Glazes & Architectural Recesses (`_cg12_dk12`, `_rec2x_rcl`, `_efade_ew3`)**:
   - *Order & Load*: Connected shadow support across deep tree hollows, cypress spires, under-eave shadows, and arched wall recesses using `ultramarine`, `burnt sienna`, `sap green`, and `sepia`, softened at light boundaries via `--edgefade 1.2` and `--edgewobble 0.3`.
5. **Stage 4 — Closing Sepia Ink Accents (`bench/plan/closing-lines.json`, 180 strokes)**:
   - *Material & Technique*: Crisp closing sepia pen (`_ink4`, `--closingpressure 1.0`) over the dried sheet to re-establish dark window openings, shutters, roof eaves, wall corners, and terrace shadow lines.
6. **Failure Signs to Watch For in `paint.sh look`**:
   - Any bare white holes on the upper-left terrace, any pink/orange cast on green foliage, faint opening ink, or visible horizontal wash striping.
