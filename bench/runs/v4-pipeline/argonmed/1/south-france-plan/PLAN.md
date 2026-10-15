# Painting Plan — France (`south-france`, Urban Sketch: Pen Plus Light Wash)

## 1. Visual Analysis of the Target (`bench/plan/target.png`, 304×249 px on a 280 mm Sheet)

The reference depicts a sunlit Provençal hillside village in southern France (`south-france`):
- **Upper-Center & Right-Center Village (`south-france.village-houses`)**: Warm yellow-ochre and raw-sienna stone houses with terracotta-red roofs, crisp dark eaves, shuttered windows, and sun-struck pale cream gable highlights (`[0.398, 0.102, 0.426, 0.132]` and `[0.634, 0.134, 0.662, 0.164]`).
- **Upper-Left Sunlit Terrace (`south-france.sunlit-terrace`)**: Pale warm sandy-gold and cream open ground (`[0.134, 0.198, 0.164, 0.228]`) framed by dark vertical tree trunks on the far left.
- **Upper-Right Distant Valley (`south-france.distant-valley`)**: Cool blue-green and muted cerulean atmospheric distance (`[0.74, 0.02, 0.98, 0.24]`) receding softly behind the dark cypresses.
- **Central Cypresses & Deep Recesses (`south-france.cypress-shadows`)**: Tall, narrow, dark olive-sepia cypress columns and cast architectural/foliage shadows below the village walls (`[0.46, 0.28, 0.74, 0.52]`).
- **Middle & Lower-Right Olive Slopes (`south-france.olive-slopes`)**: Warm sap-green and yellow-ochre Mediterranean hillside foliage interspersed with lower stone cottages (`[0.792, 0.808, 0.820, 0.838]`).
- **Lower-Left Foreground Olive Tree (`south-france.foreground-tree`)**: A prominent foreground tree with dark calligraphic trunk and branch lines (`[0.08, 0.56, 0.44, 0.94]`) and lively yellow-green foliage crowns surrounding a sunlit clearing (`[0.344, 0.550, 0.374, 0.582]`).

## 2. Style & Technique Strategy (`urban-sketch`: Pen Plus Light Wash)

To honor the requested **"urban sketch, pen plus light wash"** style:
1. **Structural Opening Pen Drawing (`opening-lines.json`)**:
   - Traced from `target.png` (`trace-ink.mjs`), capturing the architectural roof lines, gables, windows, stone terrace walls, and dark tree trunks/branches while keeping foliage interiors open for wash.
   - Drawn first on dry cold-press paper so the ink line establishes the urban-sketch scaffolding before any wash is laid.
2. **Paper Reserves & Luminous Stone (`reserves`, `_lit18`, `_lw`)**:
   - Six targeted paper reserves hold the brightest sun-struck gable walls, terrace glints, and lower cottage facades as bare paper, alongside automatic paper-relative light detection (`--paperrel 1 --paperlights 1`).
   - Luminous warm stone (`_lit18`, `_lw`) shifts cool demand on sun-struck warm faces to yellow ochre and keeps them pale and transparent.
3. **Open Light Washes & Connected Shadow Glazes (`urban-sketch` with `ink-and-wash` value floor)**:
   - Under `urban-sketch` with `--valuefloor ink-and-wash`, light local-color washes (Band 1, split by hue family via `_sky3`) lay a fresh, breathable foundation across the warm ochre stone, olive foliage, and cool distant valley (`_cg12`).
   - Connected dark shadow glazes (Band 4, `_dk12`, `_shs`, `_efade`) unify the cypresses, deep tree shadows, and architectural under-eaves without overworking the middle tones.
   - Adaptive laned strokes (`_spl6`, `_lad`) and subtle organic wash edge wobble (`_ew4`) give the washes a natural, hand-brushed sketchbook feel.
4. **Selective Closing Ink (`closing-lines.json`, `_ink4`, `_uncap`, `_dwg180`)**:
   - After the 25 wash and `tp2` touchpoint passes dried (inspected at boundaries `0`, `11`, and `closing`), `closing-lines.json` was revised to 94 sub-pixel gradient-aligned ink strokes (`contrast / count >= 0.062` outside `protectedCells`) so the closing pen cleanly restates the roof eaves, window openings, stone terrace walls, cypress contours, and foreground tree trunk/branches over the washes.

