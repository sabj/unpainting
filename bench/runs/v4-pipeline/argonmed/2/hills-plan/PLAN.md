# Painting Plan: Hills (Loose Ink and Wash)

## 1. Reference Cues & Visual Structure
`bench/plan/target.png` (`306×242`, painted at `1224×968` on a `158.05×125.0 mm` cold-press sheet) depicts sunlit rolling hills in **loose ink and wash**:
- **Sunlit Winding Dirt Path (`sunlit-winding-path`)**: A warm cream, buff, and yellow-ochre track entering from bottom-center (`x ≈ 0.45–0.75, y ≈ 0.85–1.00`), curving up-left around the hillside bend (`x ≈ 0.18–0.35, y ≈ 0.15–0.35`), and forking across the upper ridge (`x ≈ 0.40–0.85, y ≈ 0.00–0.18`). Its brightest crests and ruts hold bare or near-bare paper (`L* >= 95`).
- **Sunlit Grassy Slopes (`sunlit-grassy-slopes`)**: Luminous yellow-green and warm sap-green pastures sweeping diagonally across the upper-right hill, central ridge, and lower foreground slopes (`hue ≈ 106°–124°, C ≈ 16–58`).
- **Dark Oak & Scrub Tree Masses (`dark-oak-tree-masses`)**: Deep cool slate-blue, indigo-olive, and charcoal-green foliage canopies massed along the upper-left hillside (`x ≈ 0.00–0.52, y ≈ 0.00–0.45`), mid-right grove (`x ≈ 0.55–0.98, y ≈ 0.15–0.65`), and lower-left/lower-right gullies (`L* ≈ 18–58`).
- **Expressive Ink Linework**: Crisp dark charcoal-sepia pen contours (`_sep8`, `_ink4`, `_dwg200`, `_uncap`) define the winding road ruts, hill crests, gnarled tree trunks/branches, and billowing foliage crowns.

## 2. Palette & Material Choices
- **Wide Box Palette (`--palettewide 1`)**: Fitted to `hansa yellow`, `cerulean blue`, `quinacridone rose`, `sap green`, plus a granulating cool blue tube (`_skyb`) for the slate-blue tree shadows.
- **No Sky Lanes (`_noslane`)**: Because this composition has no open sky at the top and its cool blue-grey regions are dark hillside tree canopies, `_noslane` disables horizontal sky-lane strokes so all cool tree masses are painted with shaped directional foliage strokes.
- **Layer Smoothing & Middle Gain (`_ls10_mg11`, `--groundglaze 0`)**: `_ls10` (`--layersmooth 1`) keeps wash boundaries tightly registered to the winding path and tree silhouettes; `_mg11` (`--midgain 1.1`) enriches the middle-value yellow-green grass and ochre path planes; `--groundglaze 0` prevents lower-foreground greens from being reassigned into a neutral architectural ground glaze.
- **Ink Profile (`_sep8`, `_ink4`, `_dwg200`, `_uncap`)**: Deep charcoal-sepia ink (`--inkk .396,.481,.619 --inkkscale 8`) lays 90 primary structural contours in `opening-lines.json` before the first wash, followed by 578 width-and-weight-modulated closing ink strokes from `closingink4-lines.json` (`--closinglines 100000 --closingpressure 1 --closingedgemin 0 --drawwant 1 --drawwidthgain 2`) after the final dry gate.

## 3. Passage Order, Moisture, Load & Edge Policy
1. **Reserve Whites & Opening Ink (`opening-lines.json`)**:
   - Protect bare-paper highlights along the brightest sunlit dirt path crests (`litReserveL: 95` plus four explicit reserve bounds on the upper-left crest, upper-right fork, left-center bend, and lower-center road).
   - Lay the 90 structural ink contours on dry paper before the first wash, keeping all points clear of reserved path highlights.
2. **Band 1 — Pale Local-Color Foundation (`valueBand: 1`)**:
   - **Order**: Continuous pale yellow, cerulean, rose-ochre, and sap-green base washes across the sunlit grassy slopes and warm dirt path on dry paper (`wet on dry`, water `0.62`), leaving protected path highlights untouched.
   - **Edges**: Crisp dry placement along reserved path highlights; smooth 1 mm transitions (`_ls10`) into adjacent hill planes.
3. **Bands 2 & 3 — Four-Layer Directional Middle Planes (`_lay4`, `valueBand: 2..3`)**:
   - **Order**: Four progressive middle-value steps (`2a, 2b, 3a, 3b`) split by pigment hue (`_sky3` / `--layerhue 1`) and domain, building the saturated yellow-green hillside pastures, warm ochre path ruts, and mid-tone olive foliage.
   - **Moisture & Load**: Each passage waits for a fully dry base (`wet on dry`, water `0.62`, `--midgain 1.1`) and uses directional shaped marks (`--shapedmarks 1`).
4. **Bands 4 & 5 — Cross-Region Shadow Glazes & Deep Accents (`valueBand: 4..5`)**:
   - **Order**: Connected cool slate-blue and deep olive-charcoal shadow glazes (`--coolgain 1.3`, `--darkgain 1.3`, `--shadowraw 1`) across the oak/scrub tree masses and cast hillside shadows on a fully dry base (`water: 0.45`), followed by two touchpoint deficit-correction rounds (`_tp2`).
5. **Closing Ink (`closingink4-lines.json`)**:
   - After frisket removal and full drying, lay the selective width-and-weight-modulated closing ink contours, tree trunks, branches, and path ruts (`_ink4`, `_dwg200`) to lock in crisp loose-ink-and-wash definition.

## 4. Failure Signs & Revision Strategy During Painting
- **Checkpoint 1 (`before the first wash`)**: Inspect `bench/looks/0-compare.jpg` to verify that the opening ink drawing registers cleanly along the winding path and hill ridges without intruding into reserved path highlights.
- **Checkpoint 2 (`after band 1` / `after band 3`)**: Inspect mid-run comparisons to ensure the sunlit yellow-green hills and warm dirt path reach full chroma without muddying the bare-paper path highlights. If middle greens or dark trees read too pale, revise `--midgain` or `--darkgain`.
- **Checkpoint 3 (`before the closing drawing` & `finish`)**: Inspect the completed wash state before closing ink, then verify that the closing ink pass crisply restores the dark tree trunks, canopy scalloped outlines, and winding path edges.
