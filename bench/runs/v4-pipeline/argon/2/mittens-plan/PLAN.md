# Watercolor Painting Plan — "Mittens" (Portrait Sketch, Fine Lines and Light Washes)

## 1. Subject & Style Analysis
- **Target (`bench/plan/target.png`, 300×259 px, rendered on a 1200×1036 px, 280 mm cold-press sheet)**:
  - A tender watercolor portrait sketch of an orange-and-white tabby cat ("Mittens", left half) nuzzling against a curly-haired bearded man's head (right half).
  - **Style**: Watercolor portrait sketch with **fine lines and light washes**.
  - **Paper & Preserved Whites (~49% of the sheet)**:
    - The upper-center and top-right background, the cat's muzzle, whiskers, and chest bib, and the man's lit forehead and nose bridge are left as bare cold-press paper (`paperLights` + `paperRel`).
    - Explicit crisp reserves (`reserves` in `bench/plan/config.json`) protect the four eye catchlights (cat right eye `[0.264, 0.213, 0.273, 0.233]`, cat left eye `[0.074, 0.233, 0.083, 0.244]`, human left eye `[0.597, 0.715, 0.606, 0.721]`, human right eye `[0.806, 0.677, 0.813, 0.683]`) and small nose/whisker glints without introducing any long axis-aligned seams.

## 2. Palette & Material Strategy
- **Auto-selected wide palette (`--palettewide 1`)**: Recovers warm earth/ochre/sienna tones for the tabby fur and lit skin alongside cool/neutral umber/sepia/blue-grey tones for the curly hair mass, beard shadow, and eye/brow accents.
- **Opening Drawing (`bench/plan/opening-lines.json`)**:
  - Drawn in light waterproof **graphite** (`"medium": "graphite"`, `_opp25` -> `--openingpressure 0.25`) with fine nib contact widths (`_dwg125` -> `--drawwidthgain 1.25` and scaled 300→1200 widths) to establish the sweeping construction arc, ear/muzzle contours, and facial landmarks before any wet wash touches the sheet.
- **Five-Band Light-to-Dark Washes (`style: "precise-watercolor"`)**:
  - **Band 1 (Light foundation)**: Pale warm ochre/sienna base across the ginger cat coat and facial skin planes; pale cool-neutral base across the hair and beard.
  - **Band 2 (`_lay4` — 4 progressive middle layers `L0..L3`)**: Builds the tabby markings, ear interiors, cheek blush, and soft beard/jaw shadow gradually on dry paper (`_w10` keeps washes light and translucent; `_noslane` disables horizontal sky lanes).
  - **Band 3 (Texture & dry-brush mid-tones)**: Carries broken fur and curl texture.
  - **Bands 4 & 5 (Connected shadow glazes & deep accents)**: Cross-region shadow glazes unify the dark curly hair mass and chin/ruff shadow, while `_da105` (`--deepaccent 105 --deepgrow 2`) and `_eye16` (`--eyering 0.016`) restate the vertical slit pupils, dark upper lash lines, brow cores, and nostrils around the reserved iris rings and catchlights.
- **Touch-Up & Closing Ink (`_tp2`, `_ink4`, `_sep2`, `bench/plan/closingink4-lines.json`)**:
  - Two shape-level touch-up rounds (`_tp2`) correct any under-delivered value masses.
  - Selective closing **sepia ink** (`"inkColor": "sepia"`, `_sep2` -> `--inkkscale 2`) crispens the eye rims, pupils, nostrils, whiskers, and key curl contours over the dried washes.
