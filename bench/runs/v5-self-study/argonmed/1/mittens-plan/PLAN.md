# Painting Plan — Mittens (`subject-c`, V4)

## 1. Visual Analysis of Target (`bench/plan/target.png`)
- **Subject & Composition**: A high-key watercolor portrait sketch ("Mittens", 300×259 px, painted at 1200×1036 px on a 280 mm cold-press sheet) showing a ginger-and-white tabby cat perched on the left shoulder of a dark-haired, bearded man against an untouched white paper ground.
- **Value Structure**:
  - **Paper Whites & Reserves**: Extensive bare white paper surrounds both figures and forms the cat's bright chest bib, muzzle, and ear highlights, as well as the four pin-point eye catchlights (`reserves`).
  - **Light & Mid-Tone Washes (Bands 1–3)**: Warm orange-amber and yellow-ochre tabby patches across the cat's head, ears, and back (`burnt sienna`, `yellow ochre`, `raw sienna`); soft peach-rose and sienna washes across the man's forehead, nose bridge, and cheeks (`quinacridone rose`, `burnt sienna`, `yellow ochre`); pale cool-grey shadow modulation (`French ultramarine`, `sepia`) across the cat's white bib and shirt collar.
  - **Shadow Glazes & Deep Accents (Bands 4–5)**: Rich dark brown-black masses in the man's hair, beard, moustache, eyebrows, and glasses/eye rims, plus the cat's dark collar and pupil/eyelid accents (`sepia`, `burnt sienna`, `French ultramarine`).
- **Line Work**: Fine sepia ink lines establish the structural contours first (ears, head, back, facial features) and restate crisp dark focal accents last over dried washes without heavy marker-weight outlines.

## 2. Recipe & Planner Choices
- **Style Mapping (`subject-c` / `precise-watercolor`)**:
  - Activates `subject-c` portrait rules (`PORTRAIT_SUBJECT`): lower-face stubble texture zone (`stub`), jaw-ink filtering (`JAW_INK` avoids long continuous ink lines across the jaw), and eye-ring preservation around catchlight reserves (`eye10`).
  - Explicitly sets `styleSelection` to `precise-watercolor` across all 6 descriptive regions (`cat-head-ears`, `cat-chest-bib`, `cat-back-flank`, `human-hair`, `human-face`, `human-beard-neck`) so that the man's dark hair and beard receive full 5-band pigment depth and shadow glazes.
- **Palette Selection (`--paints sepia,rawsienna,ultramarine --paintsadd sienna,ochre,rose`)**:
  - Pairs `sepia`, `raw sienna`, and `French ultramarine` (plus the granulating sky-blue tube via `skyb`) with `burnt sienna`, `yellow ochre`, and `quinacridone rose`, fitted at native 300×259 resolution (`--palettecells 77700`) so both warm ginger/skin tones and cool shadow neutrals are accurately represented.
- **Balanced High-Key Tone Gains (`dk11`, `cg10`, `rg0`, `dp80_dg2`)**:
  - Uses `--darkgain 1.1` (`dk11`), `--coolgain 1.0` (`cg10`), and `--groundglaze 0` (`rg0`) to avoid flooding light midtones (`floodFrac` penalty) while retaining crisp darks in the hair, beard, and eyes via `dp80_dg2` (`--deepaccent 80 --deepgrow 2`) and `eye10` (`--eyering 10/300`).
- **Drawing (`opening-lines.json` & `closing-lines.json`)**:
  - Extracted from the target's separated ink ridges (`src/crop/ink-lines.mjs`), trimmed off reserved paper whites and subpixel-aligned to high-contrast flanks at 1200×1036 so all 16 opening contours and 52 closing feature accents survive selection cleanly with fine sepia nib weight (`ink3`, `dwg145`, `--openingpressure 0.30`, `--closingpressure 0.42`).
