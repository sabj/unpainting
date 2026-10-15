# Painting Plan — Mittens (`bench/plan/target.png`)

## 1. Visual Analysis & Style Strategy
- **Subject**: A dual portrait watercolor sketch (*Mittens*, 300×259 px, rendered at `width: 1200` on a `280 mm` cold-press sheet) showing an orange-and-white tabby cat on the left (`x: 0.00..0.52`) looking up and left, beside a man's face with dark charcoal curly hair, dark brows/eyes, and light stubble on the right (`x: 0.48..1.00`).
- **Requested Style**: *"watercolor portrait sketch, fine lines and light washes"*.
  - We select `precise-watercolor` on `subject: "mittens"` so that the shaped light-to-dark value planner preserves bare paper whites (`~61.4%` of the sheet) and builds translucent wet-on-dry layers without heavy overwashing, while avoiding `JAW_INK` clipping in the `y: 0.50..0.85` facial feature band.
  - We start the light and middle washes (passes 1–25) at `_dk11` (`--darkgain 1.1`) and `_cg10` (`--coolgain 1.0`) for airy, translucent skin and fur washes, then steer at boundary 25 to `_dk13` (`--darkgain 1.3`) and `_dp65_dg2` (`--deepaccent 65 --deepgrow 2`) for the Band 4–5 shadow glazes and deep accents, and finish at the closing boundary with `_sep3` (`--inkkscale 3`) and `_dwg125` (`--drawwidthgain 1.25`) for fine, delicate closing pen work.

## 2. Palette & Pigment Unmixing
- Auto-palette selection (`--palettewide 1` without explicit `--paints`) fails on this portrait because it selects only warm/green pans (`sepia, raw sienna, sap green`) with no neutral/cool dark for the man's charcoal hair (`9.2%` of the sheet, causing an `8.1 dE00` error), and without `hansa` yellow it cannot reach the `68–77°` yellow-orange hues of the cat's tabby fur.
- We specify a 6-pan portrait & tabby palette in `bench/plan/extra-args.json`:
  - `hansa` (Hansa yellow) + `ochre` (yellow ochre) + `sienna` (burnt sienna): luminous cream-buff skin washes, golden-amber fur mid-tones, and saturated ginger tabby stripes (`1.1–1.6 dE00`).
  - `sepia` + `paynes` (Payne's grey) + `ultramarine` (French ultramarine): cool-neutral charcoal hair curls, dark eyebrows/lashes/pupils, and subtle cool-warm shadow balance (`2.6 dE00`).
- We disable Trumbull-specific architectural overrides from the base recipe (`_rg0` for `--groundglaze 0`, `_noslane` for `--skylanes 0`).

## 3. Reserves, Value Bands & Steering
- **Paper Whites & Pinpoint Reserves**:
  - Broad paper whites (background, cat's white muzzle/chest, and man's lit forehead) are held organically from the target via `--paperlights 1 --paperrel 1` without large rectangular boxes that would create unsupported axis-aligned seams in Band 1 (`band1UnsupportedAxisEdges: []`).
  - Four small pinpoint `catchlight` reserves (`<= 0.02` normalized width/height) protect the corneal glints in the cat's left/right eyes and the man's left/right eyes, paired with `_eye7` (`--eyering 0.0233`) so the irises retain their lighter middle-value rings around dark pupils.
- **Value Architecture**:
  - **Band 1 (Light foundation, passes 1–7)**: Pale warm washes (`hansa`, `ochre`, `sienna`) over the cat's fur and man's skin, and pale `paynes`/`sepia` underwash in the hair mass.
  - **Band 2 (3 nested wash layers, `_lay3`, passes 8–25)**: Gradual wet-on-dry build of tabby markings, facial modelling along the temples/nose/cheeks, and mid-tone hair curls.
  - **Bands 4–5 & Touch-ups (Shadow glazes, deep accents, and shape refit, `_efade_dp65_dg2_dk13_tp2`, passes 26–53)**: Softened outer hair contour against pale paper/forehead (`_efade`, `1.2 mm` edge fade), followed by crisp two-layer dark accents (`_dp65_dg2`) on pupils, eyelids, eyebrows, nostrils, mouth line, and dark hair/tabby cores, plus two touch-point refit rounds (`_tp2`).

## 4. Opening & Closing Line Work
- `bench/plan/opening-lines.json` (231 fine lines): Traced directly from the target's thin dark structural lines and delicate pencil contours (cat's ears, eyes, nose, mouth, whiskers; man's brows, eyes, nose, mouth, jaw, and hair curls), omitting noisy fur-interior flecks. Drawn first at light pressure (`_opp25`).
- `bench/plan/closingink4-lines.json` (111 crisp lines): Restricted to high-contrast structural accents aligned to non-reserved steep edge flanks on the 1200×1036 grid so 100% survive `selectValueInk`, applied with fine nib width (`_dwg125`) and delicate sepia ink darkness (`_sep3`) after all washes dry.
