# Painting Plan — Hills (V5, Try 2 of 3, Loose Ink and Wash)

## 1. What Changed from Try 1 and Why

1. **Unlocked 6-Region Mid-Tone Separation (`_lay0_nest` replacing `_lay4` + removed `--layerhue 0 --skysplit 0`)**:
   - **Root cause in Try 1**: Try 1 set `"--layerhue", "0", "--skysplit", "0"` in `extra-args.json` while keeping `_lay4` (`washLayers = 4`) from the base recipe. In `src/paint/methods/light-to-dark.mjs` (line 195), whenever `step.tag` is non-empty (`'L0'..'L3'`) and `layerHue = false`, `domains` collapses to `[0]`. Even with `layerHue = true`, `coolGroup` assigns 5 of the 6 target clusters (79% of the canvas) to the same `coolGroup = 3` whenever `washLayers > 0`. This merged all six landscape colour clusters into single whole-sheet masks, averaging sunlit yellow-green hills, warm ochre path shoulders, and dark olive-blue trees into muddy olive-khaki washes (`flatPlan_dE00 = 12.90`) and making the 10%, 25%, and 50% frames look like a global full-sheet fade-in.
   - **Change in Try 2**: Replaced `_lay4` with `_lay0` (`--midlayers 0`) and added `_nest` (`--nestedmid 1`), and removed `--layerhue 0 --skysplit 0`. With `washLayers = 0`, `step.tag` is empty, activating `phase === 'mid' && midDomains && !step.tag` (`domains = [1, 2, 3, 4, 5, 6]`) with nested mid-tone sub-rungs. Every regional colour cluster is now mixed and painted as its own distinct regional passage, cutting the planned optical colour error from `12.90 dE00` to `< 9.7 dE00`.

2. **Eliminated Vertical Ruler-Grid Stripes & Early-Stage Stroke Bloat (Removed `_spl4_lad` and `_wre6`, Added `_lf`)**:
   - **Root cause in Try 1**: `_spl4_lad` (`--strokeplan 1 --lanemm 4 --laneadapt 1`) sliced horizontal washes into fixed-length segments (`maxLen = strokeMm / cellMm`), aligning brush reloads into vertical columns across every horizontal row. Without `_lf` (`--loadfeather 1.5`), `splitLoads` left a visible darker vertical band at every reload column and bloated Band 1 to 1,875 strokes so the 10% and 25% checkpoints were stuck in early full-sheet washes.
   - **Change in Try 2**: Removed `_spl4_lad` and `_wre6`, and added `_lf` (`--loadfeather 1.5`) so washes run smoothly across their natural regional spans with feathered reloads and reach mid-tone and shadow definition much earlier in the stroke progression.

3. **Fixed the Stark White Cutout Dirt Road (`--paintsadd ochre,sienna --pwmax 7 --paperrel 0 --paperdelta 4`)**:
   - **Root cause in Try 1**: `widePalette` selected 6 pans without Yellow Ochre or Burnt Sienna, and `--paperrel 1 --paperlights 1` (at default `paperDelta = 10`) reserved 2.9% of the sheet (the entire winding dirt path) as bare stark white `[252, 251, 248]` paper from stroke 0 ("a finished white path shape appear at 10%").
   - **Change in Try 2**: Added `"--paintsadd", "ochre,sienna", "--pwmax", "7"` so Yellow Ochre and Burnt Sienna are in the palette, and set `"--paperrel", "0", "--paperdelta", "4"` so only the brightest ~0.4% cream highlight down the center of the road is held as paper while the road body and shoulders receive warm golden-ochre washes.

4. **Restored Individual Foliage Crown Shapes (`_ms160` replacing `_ms600`)**:
   - **Root cause in Try 1**: `_ms600` (`--minshapecells 600`) discarded all small and medium foliage crown shapes and light gaps (< 600 cells in mid-tones, < 1,200 cells in shadows), blurring the wooded hillsides into amorphous blobs.
   - **Change in Try 2**: Lowered `--minshapecells` to `160` (`_ms160`), preserving individual tree crowns, light gaps, and crisp shadow mass boundaries.

5. **Replaced Foliage-Interior Noodle Ink with Structural Contour Opening Sketch & Crisp Fine Closing Ink (`_sep3_dwg100_opp35`, `--closingpressure 0.75`, Rebuilt `opening-lines.json` & `closing-lines.json`)**:
   - **Root cause in Try 1**: `bench/tools/trace-ink.mjs` dropped lines near green pixels (`if (g > p.length * 1.5) continue`), which stripped out the dirt path borders and ridge contours, while its valley detector triggered inside dark shadow blobs (`a = 0.25, v = 0.11, b = 0.24`). Furthermore, `trace-ink.mjs` assigned `widths = 2.5..3.8 px`, which `_dwg200` (`--drawwidthgain 2`) doubled to `5..7.2 cells` (`20–29 px` wide at 1224×968!) at `--inkkscale 6`, creating thick black marker noodles in the trees and 161 dark squiggles at 10% progress.
   - **Change in Try 2**:
     - Rebuilt `opening-lines.json` (50 clean, long structural contour lines >= 18 px tracing the dirt road margins and diagonal sunlit hill ridges, with zero foliage-interior squiggles, fine widths `0.65..0.95 px`, light weights `0.28..0.46`, and `_opp35` `--openingpressure 0.35`).
     - Rebuilt `closing-lines.json` (195 crisp structural contours and thin dark pen lines for path edges, ridge lines, tree trunks, branches, and crown silhouettes outside deep shadow interiors, with fine widths `0.72..1.20 px` and `--closingpressure 0.75`).
     - Replaced `_dwg200` with `_dwg100` (`--drawwidthgain 1.0`) and `_sep8` with `_sep3` (`--inkkscale 3`) so ink lines render at authentic, delicate pen widths (`2–4 px` at 1224×968) in warm dark sepia-brown.

## 2. Critique Points Accepted vs. Rejected

- **Accepted**:
  - *Finished-painting critique*: Muddy, desaturated washes lacking separation between vibrant sunlit yellow-greens, warm ochre path tones, and cool dark blue-green tree shadows (addressed via `_lay0_nest` + `--paintsadd ochre,sienna`).
  - *Finished-painting critique*: Mechanical vertical grid/comb stripes across the hillsides (addressed by removing `_spl4_lad` and `_wre6` and adding `_lf`).
  - *Finished-painting critique*: Stark white cutout dirt road lacking warm ochre washes and contour lines (addressed via `--paperrel 0 --paperdelta 4`, `--paintsadd ochre,sienna`, and structural road-edge contours in `opening-lines.json` / `closing-lines.json`).
  - *Finished-painting critique*: Heavy, noodle-like closing ink lines inside tree canopies and blurred foliage blobs (`edges detail: 3`, `marks texture: 3`) (addressed via `_ms160`, `_sep3_dwg100`, and rebuilt contour-first `closing-lines.json`).
  - *Progression critique*: 10% frame showing random dark squiggle texture and a finished white cutout path, and 10%–50% frames looking like a global whole-sheet fade-in (`2.6 / 5.0`) (addressed via 50 long structural contours at `--openingpressure 0.35` in `opening-lines.json`, `--paperrel 0 --paperdelta 4`, removing `_spl4_lad`, and regional washes via `_lay0_nest`).
- **Rejected**:
  - None; all external judge findings were corroborated by our independent self-review and code audit. However, we keep `--skyblue 1` from the base recipe (`_skyb`) rather than setting `--skyblue 0` in `extra-args.json` so that `--skyfloc` from the base recipe is read cleanly with zero unread-option warnings.
