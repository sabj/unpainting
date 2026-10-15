# Painting Plan — Round V5, Try 2 of 3 (`Ships` — John Singer Sargent, *White Ships*)

## 1. Visual Analysis of the Subject & Target

The target image (`bench/plan/target.png`, `300 × 244` px, rendered at `1200 × 976` px on a `280 mm` wide cold-press watercolor sheet) is John Singer Sargent's 1908 watercolor *White Ships*. Its visual character relies on five core structural and chromatic properties:

1. **Luminous Unpainted & Warm-Tinted Paper Whites**:
   - The sunlit curves of the central and right white hulls (`x = 0.28..0.85, y = 0.25..0.55`), the bright diagonal bowsprit and jibboom (`x = 0.34..0.52, y = 0.14..0.38`), and sunlit spar edges are carried by the warm cream watercolor paper (`RGB(221, 215, 199)` / `#ddd7c7`) and delicate pale yellow-ochre glazes (`#cec29e`).
   - Crucially, these paper lights follow **organic, brush-edged contours** along curved hull strakes and diagonal spars—never axis-aligned rectangular boxes.

2. **Broad Cool Turning Shadow Planes Across the White Hulls**:
   - The shaded underside and curving port/starboard quarters of the white hulls (`x = 0.10..0.95, y = 0.22..0.72`) turn away from the sun in broad, luminous cerulean and lavender-ultramarine washes (`#8fa2af` to `#6c8396`).
   - These planes are continuous from the upper gunwale down to the waterline (`y = 0.35..0.73`), grading smoothly in temperature and value without horizontal seams.

3. **Warm Golden-Ochre Timber & Sunlit Amber Reflections**:
   - The upper masts, yards, deckhouse structures, golden bow scroll garland (`x = 0.36..0.52, y = 0.42..0.55`), and sunlit water ripples (`y = 0.72..0.98`) glow with warm yellow ochre and raw sienna (`#aa8646`).

4. **Turquoise-Green & Slate Harbor Water**:
   - The harbor water (`y = 0.68..1.00`) interweaves cool turquoise-green and cerulean-slate horizontal reflection bands (`#648186`) with warm golden-brown reflected hull tones.

5. **Crisp Dark Sienna & Deep Marine Accents**:
   - The composition is anchored by decisive, high-contrast darks: the dark mahogany/burnt-sienna shadow hull on the far left (`x = 0.00..0.16, y = 0.38..0.76`), the vertical stempost and inter-hull shadow cleft (`x = 0.33..0.37, y = 0.36..0.72`), the twin hawseholes and suspended anchors (`x = 0.31..0.35` and `x = 0.62..0.74`), rigging blocks, and dark waterline crevices (`#33393e`).

---

## 2. Style, Medium, and Linework Strategy

- **Style**: `precise-watercolor`, pure watercolor (`linework: "none"` in `config.json`, `"medium": "none"` and `"lines": []` in both `opening-lines.json` and `closing-lines.json`).
- **Why No Ink**: Sargent's *White Ships* contains no pen-and-ink outlines; rigging spars, hull seams, and anchor flukes are painted directly with shaped watercolor brush marks.

---

## 3. Regional & Family Plan (`bench/plan/config.json`)

We organize the painting into 6 value-and-temperature families ordered light-to-dark:

| Order | Family ID | Swatch / Hex | Base Move | Detail | Role in Composition |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `warm_hull_light` | `#cec29e` `[206, 194, 158]` | `wet on wet` | `none` | Pale cream and golden-ochre foundation wash across sunlit hull planking, masts, and bowsprit |
| **2** | `cool_hull_plane` | `#8fa2af` `[143, 162, 175]` | `wet on wet` | `light` | Broad cerulean and lavender-grey shadow planes across the central/left white hulls and upper-right rigging |
| **3** | `turquoise_water_wash` | `#648186` `[100, 129, 134]` | `wet on wet` | `light` | Cool turquoise-slate and sea-green harbor water washes and reflected light under the bows |
| **4** | `golden_ochre_timber` | `#aa8646` `[170, 134, 70]` | `wet on dry` | `medium` | Saturated yellow-ochre and raw-sienna deck structures, spars, bow scroll garland, and warm water ripples |
| **5** | `sienna_rigging_rust` | `#754d32` `[117, 77, 50]` | `wet on dry` | `high` | Burnt-sienna and mahogany shaded left hull, rust streaks, rigging blocks, and lower waterline |
| **6** | `deep_marine_accents` | `#33393e` `[51, 57, 62]` | `wet on dry` | `high` | Crisp deepest ultramarine-umber accents for hawseholes, anchors, stempost cleft, and dark water bands |

### Paper White Reservation Strategy (`"reserves": []`)
- We set `"reserves": []` in `bench/plan/config.json` and rely exclusively on the painter's organic pixel-level paper-light reservation (`--paperlights 1 --paperrel 1`).
- In `tools/paint-plate.mjs`, `config.reserves` are converted into axis-aligned bounding-box cutouts (`reserveBoxes`) that zero out `paperGate` inside each `[x0, y0, x1, y1]` rectangle. In Try 1, those 8 boxes punched razor-sharp rectangular white holes out of surrounding midtone and dark washes. With `"reserves": []`, `--paperlights 1 --paperrel 1` organically reserves the brightest ~9% of the image along natural curved hull and spar boundaries with soft brush transitions (`_efade` / `--edgefade 1.2`).

---

## 4. Variant Tokens (`bench/variant.txt`) & Extra Arguments (`bench/plan/extra-args.json`)

### `bench/variant.txt`
```
region_w13_lay2_ls10_lf_noslane_rg0_cg12_dk14_mg11_st30_shw40_dp60_dg2_efade_tp1
```

- `region_w13`: Uses `--brushchoice 0` (`shapedMarks` contour-aligned washes with natural round/flat sizing from `brushes.mjs`) rather than `region_w15` (`--brushchoice 1`), avoiding the rigid parallel-cloned lane tracks and 38 mm mop-brush override that caused vertical zipper columns in Try 1.
- `_lay2_ls10`: Uses 2 midtone glaze layers (`--midlayers 2`) with `--layersmooth 1.0` (`_ls10`), which keeps the midtone shape threshold at `minShape` (`~176` cells) rather than `minShape * 4` (`3,200` cells in Try 1), ensuring bow scroll garlands, rigging spars, and water ripples are painted during the main midtone passes rather than dumped at the end.
- `_lf`: Sets `--loadfeather 1.5`, replacing plain unfeathered `splitLoads` with `featherLoads` (30% overlap with smooth ease-in/ease-out taper at brush reloads) to eliminate dark horizontal reload bars across broad washes.
- `_noslane`: Disables horizontal sky-lane overrides (`--skylane 0`) so cool hull washes follow the natural geometry of each hull plane rather than horizontal sky stripes.
- `_rg0`: Sets `--groundglaze 0`, overriding the base recipe's `_rg10` (`--groundglaze 1`) which previously created a false horizontal ruler seam across the central blue hull at `y = 0.62`.
- `_cg12_dk14_mg11_st30_shw40`: Balances cool wash gain (`1.2`), dark value gain (`1.4`), midtone gain (`1.1`), shadow threshold (`0.30`), and shadow water dilution (`0.40`).
- `_dp60_dg2`: Captures the deepest 60-cell dark accents (`--deepaccent 60`) with a 2-pixel dilation (`--deepgrow 2`) for crisp hawseholes, anchor flukes, and hull crevices.
- `_efade`: Softens outer wash boundaries (`--edgefade 1.2`) to prevent cut or scalloped wash edges.
- `_tp1`: Runs a single targeted touch-up pass (`--touchpoints 1`, `layer.value = 6`, `through = 1.25 <= 2.0`), avoiding the `_tp3` bug (`layer.value = 11`, `through = 2.5 > 2.0`) that triggered `detail = true` (`FLOOR = 0`), 86 dropped passages, and 8,381 late speckle strokes in Try 1.

### `bench/plan/extra-args.json`
```json
[
  "--paperrgb",
  "221,215,199",
  "--shaperefit",
  "3",
  "--skyblue",
  "0"
]
```
- `"--paperrgb", "221,215,199"`: Matches Sargent's warm cream paper ground.
- `"--shaperefit", "3"`: Performs 3 rounds of per-shape Kubelka-Munk pigment weight refitting so warm ochre timber, cool cerulean hull shadows, and turquoise water keep high chromatic separation.
- `"--skyblue", "0"`: Disables the duplicate granulating sky-blue tube (`_skyb` in base) that splits cool washes at `b - r = 8` into mismatched textures.
- Notably, we **remove** Try 1's `"--layerhue", "0", "--skysplit", "0"` so that `--layerhue 1 --skysplit 1` (from base `_sky3`) separates warm, cool, and green regions into distinct regional passes in Bands 1 and 2 instead of painting the entire canvas as a single full-sheet fade-in.

---

## 5. What Changed from Try 1 and Why

| Try 1 Defect & Judge Signal | Root Cause Identified in Try 1 Plan & Code | Change Made in Try 2 |
| :--- | :--- | :--- |
| **White rectangular cutout notches** (`cut or scalloped wash edges, round holes (5)`) | `config.json` defined 8 axis-aligned `reserves` boxes (`[0.82,0.05,0.87,0.10]`, `[0.89,0.16,0.94,0.20]`, `[0.40,0.41,0.42,0.43]`, `[0.70,0.84,0.72,0.90]`, etc.) that clipped straight rectangular holes out of dark/mid washes. | Set `"reserves": []` in `config.json`; rely on organic `--paperlights 1 --paperrel 1` reservation with `--edgefade 1.2` (`_efade`). |
| **Horizontal ruler seam across the central blue hull at `y = 0.62`** | Base token `_rg10` (`--groundglaze 1`) remained active; `light-to-dark.mjs` line 110 shifts 100% of midtone demand into Band 4 shadow for cool-neutral pixels below `y = 0.62`. | Added `_rg0` (`--groundglaze 0`) to `bench/variant.txt` to disable the `y = 0.62` ground split. |
| **Full-sheet fade-in progression (`1.4/5`, `the whole sheet at one faint value, as if faded in (3)`)** | (1) Try 1 set `_onedom` + `"--layerhue", "0", "--skysplit", "0"`, collapsing Bands 1 & 2 into full-sheet `[0]` passes; (2) `_ms800` deferred shapes `< 3200` cells out of mid layers; (3) `_tp3` appended 8,381 strokes (`42%` of all strokes!) at the end, compressing 10%–50% stroke checkpoints into early full-sheet glazes. | Removed `_onedom`, removed `--layerhue 0 --skysplit 0`, removed `_ms800`, added `_lay2_ls10`, and replaced `_tp3` with `_tp1`. Now 10%, 25%, 50%, 75%, 100% checkpoints sample genuine regional construction across light, midtone, shadow, and accent bands. |
| **86 dropped passages & coarse late speckle dump (`marks texture: 1.33/10`)** | `_tp3` set `layer.value = 11` (`through = 2.5 > detailfrom`), activating `detail = true` and `FLOOR = 0` (`paint-plate.mjs` lines 2778–2784), dropping 86 small passages and bursting the rest into 8,381 tiny `detailMarks` speckles. | Replaced `_tp3` with `_tp1` (`through = 1.25 <= 2.0`), eliminating the `detailMarks` speckle explosion and reducing dropped passages to 0. |
| **Vertical zipper columns & cross-hatched burlap mesh** | `region_w15` (`--brushchoice 1` parallel lane cloning + 38 mm mop override) + `_spl12_sml50` (`--strokeplan 1`) without `_lf` (`--loadfeather`). | Switched to `region_w13` (`--brushchoice 0`), removed `_spl12_sml50` and `--drytooth 1`, and added `_lf` (`--loadfeather 1.5`) + `_noslane`. |

---

## 6. Critique Points Disagreed With and Rejected

1. **Rejected: "pencil or pen outlines where none belong (1)"**:
   - One judge flagged pencil or pen outlines, or suggested line work adjustments. Both the target (*White Ships*) and our plan are strictly pure watercolor (`"medium": "none"`, zero opening or closing lines). What looked like mechanical lines to that judge were the straight horizontal/vertical edges of the 8 rectangular `reserves` boxes and the horizontal `--groundglaze 1` seam at `y = 0.62`. We fix those geometric artifacts directly rather than altering our no-ink medium strategy.
2. **Rejected: "muddy or grayed-out color (1)" as a fundamental palette flaw**:
   - Letting `chooseBox` select the optimal 4-pigment wide palette (`hansa yellow, phthalo blue, quinacridone rose, sap green`, `3.47` RGB error) paired with `--shaperefit 3` reduces shape channel-density error from `0.057` to `0.007` across 323 planning shapes. The perceived greyness in the lower hull in Try 1 came from `_rg10` dumping cool hull midtones into the Band 4 shadow pass and `_tp3` peppering 8,381 tiny opaque touch-up dabs over the midtones. Fixing `_rg0` and `_tp1` while using the `3.47`-error palette with `--shaperefit 3` and `--skyblue 0` restores transparent, luminous color.
3. **Rejected: Holistic "not painting" (`3`) as a reason to abandon layered watercolor washes**:
   - The "not painting / stencil dissolve" impression was a symptom of full-sheet domains (`_onedom` + `--layerhue 0`), rectangular reserve holes, and 42% of strokes being spent in `_tp3` speckles at the end—not a flaw in light-to-dark watercolor layering itself.
