# Ships (`sargent` — pure watercolor, no ink)

## Reference cues and visual reading

`bench/plan/target.png` (300 × 244 px, rendered on a 1200 × 976 cell sheet at 280 mm width, 0.233 mm/cell) is a detail from John Singer Sargent's *White Ships* (1908). The requested style is **pure watercolor, no ink**: all structure, plane breaks, rigging diagonals, and dark accents are carried by transparent pigment washes and dry-paper glazes without pen or graphite outlines.

Key visual cues from the target:
1. **Sunlit starboard hull (`sargent.lit-hull`, `[0.58, 0.0, 1.0, 0.64]`)**: Warm cream paper (`L ≈ 200–225`, RGB `~221/215/199`) serves as the lit white hull flank. Pale cool blue-grey diagonal cast shadows from the rigging cross the upper hull, punctuated by two crisp dark hawsehole/fender accents (`x ≈ 0.80–0.90, y ≈ 0.14–0.24`) and a dark mooring-ring shadow (`x ≈ 0.78–0.88, y ≈ 0.40–0.48`).
2. **Shadowed central bow (`sargent.shadow-hull`, `[0.26, 0.0, 0.72, 0.88]`)**: The sweeping curve of the central ship bow is modeled in cool cerulean and ultramarine-violet shadow (`L ≈ 135–185`), deepening toward the lower hull band (`y = 0.62–0.88`, `L ≈ 95–150`). A crisp dark hawsehole accent sits near `x ≈ 0.45–0.52, y ≈ 0.28–0.38`, while a warm sienna/ochre gunwale and timber edge frames the upper curve and right margin of the bow.
3. **Left-side spars, rigging, and anchor (`sargent.rigging-and-anchor`, `[0.0, 0.0, 0.36, 0.88]`)**: Diagonal warm ochre and burnt-sienna masts, spars, and rigging lines cross cool blue-grey background planes. In the lower left (`x ≈ 0.05–0.28, y ≈ 0.70–0.88`), the pale cream flukes of a hanging anchor stand out in light-against-dark relief against surrounding grey-brown and slate shadow.
4. **Bow waterline shadow (`sargent.hull-shadow-waterline`, `[0.24, 0.72, 0.68, 1.0]`)**: The darkest value mass of the composition (`L ≈ 66–99`) anchors the base of the curving bow where the overhang meets the water, breaking into dark horizontal slate-umber reflection bands across the lower-center foreground.
5. **Harbor water and diagonal mooring line (`sargent.harbor-water-and-rope`, `[0.60, 0.60, 1.0, 1.0]`)**: Cool turquoise-green water (`L ≈ 126–181`) in the lower right is broken by pale warm cream/ochre horizontal ripple gaps and crossed by the long warm sienna/ochre mooring rope descending from `(0.84, 0.22)` to `(0.76, 1.0)`.

## Regions, technique, and painting order

We use `"style": "precise-watercolor"` across the plan so that every value band is laid wet-on-dry with crisp plane boundaries and zero unsupported region-style split seams in band 1:
- **Drawing (`opening-lines.json`, `closing-lines.json`, `closingink4-lines.json`)**: All line files specify `"lines": []` and `"medium": "none"`, suppressing both the opening and closing pen/graphite passes and the fallback ridge walker so the painting is executed in pure watercolor.
- **Band 1 (Light washes / ground)**: Broad pale warm (ochre/hansa/sienna) and cool (cerulean/ultramarine) washes establish the tinted cream hull planes, pale sky/rigging corridors, and light water base while stepping around the protected bare-paper highlights.
- **Bands 2–3 (Four middle layers, `_lay4`, `_rec2x`, `_rcl`, `_cg13`, `_vio`, `_rg10`, `_shs`)**: Up to four dried wash layers separated by hue group (`--layerhue 1`) build the cool blue-violet bow shadow, diagonal rigging cast shadows on the sunlit hull, turquoise-green harbor water ripples, and warm ochre/sienna spars and mooring rope.
- **Bands 4–5 (Shadow glazes and dark accents, `_dk13`)**: Concentrated wet-on-dry glazes lay the dark umber/ultramarine bow-base shadow at the waterline, the dark hawsehole and mooring-ring accents on both hulls, and the deepest water reflection bars.
- **Touch-up passes (`_tp2`)**: Two late shape-refit glaze rounds (`--touchpoints 2 --touchgain .6`) reinforce any mid or dark shapes that dried lighter than their target optical density.

## Moisture, brush load, and drying schedule

- **Cold-press paper (`_cpp`, `--paper coldpress --paperphysical 1`)**: Physical cold-press relief at 280 mm sheet width (`1200 × 976` cells) gives natural tooth and granulation (`_skyb`, `--skyblue 1 --skyfloc .5`).
- **Moisture discipline (`precise-watercolor`)**: Each passage requires a fully dry underlying sheet (`requiredPaper: "dry"`, drying between layers) while allowing wet same-passage stroke overlap so adjacent sweeps within a plane fuse without lap lines.
- **Water load progression**: Water load steps down across the five value bands (`[0.85, 0.72, 0.58, 0.45, 0.34]`) so band-1 washes flow smoothly across large hull and water planes while band-4 and band-5 darks stay compact and sharp on dry paper.

## Protected lights

- **Automatic paper reserves (`--paperlights 1 --paperrel 1`)**: Cells within `paperDelta` of the cream paper estimate (`~221/215/199`) are reserved organically across the sunlit starboard hull, upper-left sail/sky triangle, pale anchor flukes, and bright water ripple gaps.
- **Explicit reserves (`config.json`)**:
  - `[0.715, 0.250, 0.745, 0.285]`: Brightest sunlit cream hull gleam just below the upper diagonal rigging shadow.
  - `[0.725, 0.125, 0.755, 0.160]`: Upper sunlit starboard hull highlight plane.
  Both boxes are compact (`0.030 × 0.035` of sheet dimensions, well below the 8% axis-edge threshold) and sit inside true bare-paper regions.

## Edge plan

- **Hard edges (wet-on-dry)**: The sweeping S-curve separating the shadowed central bow from the sunlit right hull and left rigging, the crisp hawsehole ports, the diagonal spars and mooring rope, the pale anchor flukes, and the broken horizontal water ripples.
- **Soft/graded transitions**: Internal value gradations down the blue-violet bow shadow and across the upper-left sky/rigging wash are carried by overlapping shaped marks (`--shapedmarks 1`) and 4-layer mid-tone staging (`_lay4`).

## Value plan

- **Band 1 (Lightest tint, `D ≈ 0.05–0.15`)**: Warm cream/ochre hull glow, pale cool sky/rigging tint, and light water ground.
- **Band 2 (Light-mid, `D ≈ 0.15–0.30`)**: Upper blue-grey bow shadow, diagonal cast shadows on the sunlit hull, and pale turquoise water planes.
- **Band 3 (Mid-tone, `D ≈ 0.30–0.50`)**: Lower slate-blue bow shadow, warm sienna/ochre spars and mooring rope, and mid-value turquoise-green water ripples.
- **Band 4 (Dark-mid, `D ≈ 0.50–0.75`)**: Deep shadow under the bow curve, dark rigging timber near the top center, and dark blue-green water troughs.
- **Band 5 (Deepest darks, `D > 0.75`)**: Umber/ultramarine shadow at the hull waterline (`x ≈ 0.28–0.58, y ≈ 0.75–0.98`) and crisp hawsehole/fender accents on both hulls.

## Failure modes to watch during painting

1. **Any ink or graphite line appearing**: Opening and closing line files must remain empty (`0` lines drawn).
2. **Loss of sunlit hull paper lights**: If early washes flood the starboard hull (`x = 0.65–0.95, y = 0.05–0.60`), the white ship loses its sunlit read.
3. **Under-pitched bow shadow or waterline darks**: If the central blue-violet bow or the dark waterline shadow (`y = 0.75–0.98`) reads too pale after band 4/5, increase `--darkgain` or `--coolgain` via `revise`.
4. **Unsupported straight seams in band 1**: `bash bench/check.sh` must report `axisEdges: 0` and `ADMITTED`.
