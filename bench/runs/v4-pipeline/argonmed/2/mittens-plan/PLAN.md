# Painting Plan — Mittens (`bench/plan/target.png`)

## 1. Visual Analysis of the Target
- **Subject & Composition**: A warm, intimate watercolor portrait sketch (`300x259` px source, rendered at `1200x1036` px on a `280 mm` cold-press sheet) showing a ginger-and-white tabby cat ("Mittens") perched on the viewer-left (`x: 0.02..0.50, y: 0.08..0.99`) beside a man's head and face on the viewer-right (`x: 0.48..0.99, y: 0.20..0.99`).
- **Paper & Light Structure**: Roughly `56–59%` of the sheet is untouched bright white paper (`[253, 252, 252]`), forming both the open background and the bright white fur on the cat's muzzle, cheeks, and chest ruff, as well as specular catchlights in all four eyes and highlights along the man's brow bone, nose bridge, and cheekbone.
- **Color & Value Architecture**:
  - **Pale & Mid Warm Washes (Bands 1–2)**: Dilute raw sienna, yellow ochre, and burnt sienna washes establish the pale peach-tan facial planes (`[207, 192, 174]`) and the ginger tabby markings (`[205, 146, 88]` and `[196, 156, 111]`), while pale sap green tints the cat's irises.
  - **Mid-to-Dark Modeling (Bands 3–4)**: Deeper burnt sienna and sepia glazes build the tabby stripes on the cat's forehead, ears, and back, the warm shadow under the man's brow and nose, and the textured beard stubble on the lower face.
  - **Deep Charcoal & Sepia Accents (Band 5 + Opening/Closing Ink)**: Neutral dark mixes of sepia and French ultramarine (`[109, 105, 102]`) carry the mass of the man's curly hair, eyebrow darks, and pupil/eyelid accents, reinforced by fine sepia pen lines before and after the washes.

## 2. Palette Choice (`extra-args.json`)
- Selected 7-pan box palette via `--paints sepia,rawsienna,sapgreen,sienna,ochre,ultramarine,cadyellow`:
  - **Sepia + French Ultramarine**: Mix to produce the cool/neutral charcoal greys of the man's curly hair and dark eye accents (reducing local grey Delta-E error from `7.8` in the default 3-pan fit down to `1.8–2.0`, and overall sheet + local error from `3.67` down to `2.08`).
  - **Burnt Sienna + Raw Sienna + Yellow Ochre + Cadmium Yellow**: Capture both the high-chroma ginger orange stripes (`C = 30..41`, error `< 0.9`) and the delicate warm skin and tan fur washes (`C = 10..25`, error `< 1.1`).
  - **Sap Green**: Captures the pale olive-green irises of the cat.
- Disabled `--skyblue 0` so no extra granulating sky tube is added on a portrait without sky.

## 3. Families, Reserves & Edge Strategy (`config.json`)
- **Families**: Six anatomical/compositional regions (`cat-head-ears`, `cat-body-chest`, `man-curly-hair`, `man-eyes-brow-nose`, `man-beard-lower-face`, `open-paper-ground`) all sharing the `precise-watercolor` base wash profile (`baseWash: 0.25`) so band-1 washes transition organically without artificial region-box seams.
- **Reserves**: Ten tight highlight reserves (`protectBrightBelow: 0.04..0.08`) protecting the cat's right and left eye catchlights, white muzzle pad, white chest ruff, the man's left and right sclera highlights, brow highlight, nose bridge highlight, cheekbone highlight, and upper paper ground.
- **Edges**: Soft split boundary arcs (`_softs`: `--softsplit 1 --softarcs 12 --softarclen 40 --softmm 0.7`) soften turning wash boundaries while stopping short of hard ink/feature edges.

## 4. Drawing & Line Strategy (`opening-lines.json`, `closingink4-lines.json`, `variant.txt`)
- **Opening Drawing (`opening-lines.json`, 232 lines)**: Traced from the target's thin dark structural ridges and line mask at native `300x259` resolution, broken into spans verified against `selectValueInk` (`support >= 0.45` at `d >= 0.12`, `mean d >= 0.14`, length `<= 0.32` diagonal). Drawn with `--openingminmm 2.5`, `--openingpressure 0.45` (`_opp45`), `--drawwidthgain 1.10` (`_dwg110`), and `--inkkscale 4` (`_sep4`) for crisp, fine preparatory lines that preserve small facial features.
- **Closing Accents (`closingink4-lines.json` / `closing-lines.json`, 28 lines)**: Traced with 3-pass `[0.25, 0.5, 0.25]` coordinate smoothing and restricted to high-contrast dark structural cores (`support >= 0.65` at `d >= 0.22`, `mean d >= 0.28`, length `<= 0.16` diagonal) to reinstate the darkest eye rims, nostrils, ear tips, and curl accents after the washes dry.
