# Painting Plan — South of France (`south-france`)

## 1. Subject & Style Analysis
- **Subject**: `south-france` (`France`, 304×249 px target rendered at 1216×996 px on a 280 mm wide watercolor sheet).
- **Requested Style**: `urban sketch, pen plus light wash`.
- **Visual Structure**:
  - **Upper-left sunlit terraces (`x: 0.00..0.44, y: 0.00..0.48`)**: Bright yellow-ochre and warm buff stone retaining walls, sandy paths, and courtyards (`RGB ~ [215, 182, 125]`), punctuated by vertical dark blue-green cypresses and a small dark square portal recess (`x: 0.15..0.19, y: 0.16..0.22`).
  - **Upper-center village cluster (`x: 0.38..0.78, y: 0.00..0.26`)**: Clustered Provençal stone houses with warm ochre/sienna facades, terracotta tiled roofs, and dark window accents.
  - **Upper-right distant valley (`x: 0.78..1.00, y: 0.00..0.22`)**: Cool blue-green distant hillside and valley plane above a strip of warm sunlit distant fields.
  - **Middle-right focal stone houses & towers (`x: 0.65..0.96, y: 0.33..0.83`)**: Three prominent stone house/tower masses with terracotta pitched roofs, sunlit warm ochre right-facing walls, cool violet-taupe shaded left-facing walls, dark window apertures, and a lower-right retaining wall.
  - **Hillside olive/deciduous foliage & foreground tree (`x: 0.00..1.00, y: 0.14..1.00`)**: Layered yellow-green sunlit crowns, mid-tone sap/olive green foliage masses, deep blue-green shadow crevices, and a prominent foreground tree in the lower-left with dark branching ink trunk structure.

## 2. Region & Style Strategy (`bench/plan/config.json`)
- **Top-Level Style**: `"urban-sketch"` on `"subject": "south-france"`, selecting the waterproof `black-ink` drawing profile (`rewets: false`, `K: [0.62, 0.62, 0.62]`) with `--valuefloor ink-and-wash`.
- **Region Overrides**:
  - `sunlit-terrace`, `olive-canopy-light`, `village-walls-roofs`, `valley-and-shaded-stone`, `foliage-mid-green`, `cypress-and-deep-shadows`: Mapped to `"precise-watercolor"` within the `"urban-sketch"` plan so that warm stone terraces, olive canopies, terracotta roofs, cool valley planes, and deep cypress/crevice shadows all participate in the progressive four-layer middle washes (`L0..L3`) and cross-region shadow glazes (`Bands 4–5`).
- **Explicit Highlight Reserves**:
  - Four compact, pen-free highlight glints (`upper-terrace-glint`, `courtyard-sun-patch`, `upper-path-crest`, `mid-slope-clearing-glint`) preserve luminous paper highlights in the brightest sunlit terrace planes without introducing unsupported axis-aligned wash seams or dropping traced pen strokes.

## 3. Pen & Wash Progression (`bench/variant.txt` & `bench/plan/extra-args.json`)
- **Opening Pen (`opening-lines.json`, `_opp55`, `_uncap`, `_dwg200`, `--drawstroke 0.5`)**: 95 connected structural lines establish architectural rooflines, wall corners, terrace edges, cypress contours, and the foreground tree trunk/branch skeleton in waterproof black ink before the first wash.
- **Light Foundation Wash (Band 1, passes 1–11, `_sky3`, `_skyb`)**: Lays down separate warm ochre/rose stone, yellow-green foliage, and cool blue-green valley foundation washes while holding reserved glints.
- **Progressive Mid-Tone Washes (`_lay4`, `L0..L3`, passes 12–48)**:
  - Revision 1 at boundary 11 enabled `sunlit-terrace` in `L0..L3` and used adaptive 6 mm stroke lanes (`--strokeplan 1 --lanemm 6 --laneadapt 1 --washreach 1.5`, `--midgain 1.25`) across `L0` (passes 12–21) to ensure full, unbroken coverage across the 80.2% hillside mass.
  - Revision 2 at boundary 21 switched back to organic contour-following `shapedMarks` strokes (`--midgain 1.10`) for `L1..L3` (passes 22–48) to model individual olive crowns, terracotta roofs, and shaded stone facades.
- **Cross-Region Shadow Glazes & Touch-Up (Bands 4–5 & touch-up, passes 49–66)**:
  - Revision 3 at boundary 48 set `--darkgain 1.45` and `--touchgain 0.75` to deepen the cypress spires, architectural window recesses, shaded house walls, and deep olive crevices.
- **Closing Pen (`closingink4-lines.json` / `closing-lines.json`, `_ink4`, `_uncap`, `_dwg200`)**: Subpixel-aligned high-contrast closing ink strokes (`weight >= 0.65`, `contrast >= 0.06`) restore crisp architectural edges, roof eaves, window openings, and dark trunk/branch calligraphy over the dried washes.
