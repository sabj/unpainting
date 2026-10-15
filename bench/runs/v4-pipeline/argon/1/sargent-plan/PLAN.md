# Painting Plan: Sargent — *Ships* (`sargent`)

## 1. Visual Analysis & Reference Cues
The target (`bench/plan/target.png`, `300x244` px, rendered on a `1200x976` sheet at `280 mm` width) is an intimate crop of John Singer Sargent's watercolor *White Ships*. The requested style is **pure watercolor, no ink** (`"medium": "none"` with zero pen or graphite lines). All structure, edge contrast, and modeling must come from transparent and semi-transparent watercolor washes, directional brushwork, and reserved cream paper.

### Key Compositional & Chromatic Zones (`config.json` Families)
1. **Sunlit Right Hull & Sail Plane (`sargent.sunlit-right-hull-and-sail`, `[0.65, 0.0, 1.0, 1.0]`)**:
   - The brightest region of the sheet, anchored by the warm cream paper (`RGB ~ [221, 215, 199]`).
   - Crossed by delicate pale blue-grey and warm buff rigging diagonals, two dark round pulley blocks near `[0.78..0.99, 0.13..0.28]`, and a bold diagonal burnt-sienna/ochre spar descending from `[0.94, 0.24]` to `[0.80, 0.98]`.
2. **Cool Cerulean Bow & Lower Hull (`sargent.cool-cerulean-bow-and-water`, `[0.10, 0.0, 0.65, 1.0]`)**:
   - The sweeping central ship bow curves down from top-center toward the bottom-left waterline, painted in luminous cerulean and blue-grey washes (`RGB ~ [132, 147, 151]`).
3. **Central Hull Midtones & Rigging Background (`sargent.central-hull-midtones`, `[0.05, 0.0, 0.55, 0.95]`)**:
   - Cool-neutral grey-green and slate-grey midtones (`RGB ~ [145, 151, 145]`) modeling the broad turn of the hull planks and the upper-left sky/mast backdrop.
4. **Warm Buff Spars & Reflected Glow (`sargent.warm-buff-spars-and-reflections`, `[0.80, 0.0, 1.0, 0.90]`)**:
   - Warm yellow and buff washes (`RGB ~ [177, 158, 127]`) carrying reflected sunlight across the hull planks, vertical left masts, and lower-right water ripples.
5. **Burnt-Sienna Anchor, Bow Markings & Diagonal Spar (`sargent.sienna-anchor-and-bow-marks`, `[0.20, 0.40, 0.30, 0.55]`)**:
   - Rich burnt-sienna and warm yellow calligraphic brush marks (`RGB ~ [181, 141, 97]`) defining the lower-left anchor (`[0.09..0.29, 0.56..0.91]`), the curved chain of warm dabs across the mid-bow (`[0.25..0.65, 0.0..0.56]`), and the warm diagonal spar on the right.
6. **Deep Bow Overhang, Hawsehole & Waterline Shadows (`sargent.deep-bow-and-waterline-shadows`, `[0.50, 0.70, 0.75, 0.90]`)**:
   - Deep ultramarine, cerulean, and burnt-sienna shadow glazes and dark accents (`RGB ~ [97, 122, 138]` down to `< 60`) under the upper-left bow lip (`[0.22..0.44, 0.0..0.25]`), the mid-bow hawsehole (`[0.42..0.52, 0.18..0.36]`), the upper-right pulley blocks, and the dark green-slate waterline and ripples at the bottom (`y: 0.70..0.98`).

---

## 2. Palette & Material Setup
- **Paper**: Cold-press watercolor sheet (`cpp`) with warm cream base tone `--paperrgb 221,215,199` matching the target's unwashed paper highlights (`estimatePaper` mean `[221.1, 215.1, 198.8]`). Cold-press relief and granulation give authentic pigment settling in the cerulean and ultramarine washes.
- **Box Palette (`--paints cerulean,ultramarine,hansa,sienna,rose` + granulating sky blue)**:
  - Fits the 9 local color clusters of *Ships* at `2.45` dE00 sheet/local error (and `0.007` channel-density error after `--shaperefit 3`):
  1. **Cerulean Blue (`cerulean`)**: Primary cool granulating blue for the central bow, sky, and turquoise water mixtures.
  2. **French Ultramarine (`ultramarine`)** (+ granulating sky-blue tube): Deep cool blue for the bow overhang shadow, hawsehole, and deep water glazes.
  3. **Hansa Yellow (`hansa`)**: Mixes with cerulean for the sea-green/turquoise lower-right harbor water and with burnt sienna for golden ochre/buff reflections and sunlit spars.
  4. **Burnt Sienna (`sienna`)**: Rust-orange anchor, warm bow dabs, diagonal right spar, and neutral shadow mixtures with ultramarine.
  5. **Quinacridone Rose (`rose`)**: Subtle warm-violet modifier in the sunlit grays and shadow glazes.
- **Drawing Medium**: `"none"` in both `opening-lines.json` and `closing-lines.json` (`"lines": []`), ensuring pure watercolor execution with zero ink or pencil strokes.

---

## 3. Pass Order, Moisture & Brushwork Strategy (`42` Passes, `458` Connected Shapes)
1. **Stage 0 — Essential Paper Reserves**:
   - Protect the connected cream paper planes on the sunlit right hull and sail (`~9.0%` of the sheet via `--paperlights 1 --paperrel 1`) plus 8 explicit glint reserves (`reserves[]` in `config.json`) on the right hull flank, upper-right sail top, pulley-block gap, central bow highlight fleck, and lower water reflection glint.
2. **Band 1 — Continuous Pale Local-Color Foundation (`value 1/5`, Passes `1..6`, `6` shapes)**:
   - Lay 6 continuous whole-sheet pale wet-on-dry foundation washes (`water: 0.62`, one per pigment channel with `--layerhue 0 --skysplit 0`) across all non-reserved cells so the hull, sky, and water share a unified luminous undertone without cluster seams.
3. **Band 2 — Four Nested Dry-Base Middle Wash Layers (`value 2/5`, `b2L0..b2L3`, Passes `7..30`, `230` shapes)**:
   - Dry the sheet completely before each layer (`levelMax: 140`).
   - Build the curved ship bow, lower-left hull, warm sienna anchor, diagonal right spar, and green-turquoise water ripples across 4 progressive value quantile layers (`0, 0.30, 0.55, 0.78`) smoothed at `2.0 mm`, with `_mg11` (`--midgain 1.1`), `_cg12` (`--coolgain 1.2`), and `_ms800` (`--minshapecells 800` at `1200x976`).
4. **Bands 4 & 5 — Cross-Region Shadow Glazes & Deep Accents (`values 4/5 & 5/5`, Passes `31..42`, `222` shapes)**:
   - Over a fully dried sheet, lay coherent shadow glazes (`_st30_shw65_dk14`, `--shadowthresh 0.30`, `--shadowwater 0.65`, `--darkgain 1.4`) across region boundaries under the bow overhang, along the dark waterline, and across the lower-right green-blue water shadows.
   - Soften shadow edges approaching bright paper reserves over `1.2 mm` (`_efade`).
   - Restate the deepest shadow cores (`_dp60_dg2`, `--deepaccent 60`, `--deepgrow 2`) in two dried passes (band 4 then band 5) for the hawsehole, upper-right pulley blocks, under-bow shadow lip, and dark anchor/waterline accents.
5. **Touchpoint Deficit Glazes (`tp3`, Passes `43..63`)**:
   - After the main 42-pass schedule dries, run 3 shape-level comparison rounds (`--touchpoints 3`, `--touchgain 0.85`, `--touchfamilies 36`, `--touchmincells 0.0003`, `--drytooth 1`) to lay smooth, wet corrective glazes over any planning shape whose optical density still reads lighter than the target reference, then lift the resist film to reveal crisp untouched cream paper highlights.

---

## 4. Monitoring & Revision Criteria During `bench/paint.sh`
- **Checkpoints & Revision**:
  1. Start the painting (`bash bench/paint.sh start`), run through Band 1 (`run 6`), and look (`01-compare.jpg`) to verify cream paper reserves stay clean and the pale foundation washes have smooth coverage.
  2. Advance through the nested middle layers (`run 18` -> `02-compare.jpg`, `run 30` -> `03-compare.jpg`) to verify the curved central bow, lower-left sienna anchor, diagonal right spar, and green-turquoise water reflections.
  3. Advance through the shadow glazes and deep accents (`run 42` -> `04-compare.jpg`). Observing cold-press tooth breakup in the darks at boundary 42, revise (`bash bench/paint.sh revise`) to `shw65` and `tp3` with `--touchgain 0.85 --touchfamilies 36 --touchmincells 0.0003 --drytooth 1`, run through `closing` (`05-compare.jpg`) to verify solid, rich darks and warm sienna accents, and then `finish`.
