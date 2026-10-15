# Painting Plan: `mittens` (Watercolor Portrait Sketch, Fine Lines and Light Washes)

## Reference Cues & Composition
- **Subject (`bench/plan/target.png`, 300x259 px -> 1200x1036 px on 280 mm cold-press sheet)**: A double portrait of a ginger-and-white tabby cat ("Mittens") on the left (`x: 0.00..0.52, y: 0.00..1.00`) leaning affectionately against the right temple of a curly-haired smiling man (`x: 0.49..1.00, y: 0.18..1.00`).
- **Light & Paper Structure**: Large open bare-paper background in the upper right (`x: 0.48..1.00, y: 0.00..0.42`), broad paper-white chest bib and muzzle on the cat (`x: 0.05..0.38, y: 0.45..1.00`), and luminous paper-white forehead and nose bridge on the man (`x: 0.53..0.86, y: 0.43..0.63`).
- **Focal Accents**: Pale sap-green cat irises (`x: 0.06..0.11, y: 0.21..0.28` and `x: 0.21..0.32, y: 0.18..0.27`) punctured by crisp vertical slit pupils and upper lash lines; rich burnt-sienna and yellow-ochre tabby stripes across the bridge of the cat's nose and cheek; loose, granulating charcoal/Payne's-grey washes in the man's curly hair with fine stray curl lines; deep warm-brown human eyes under dark arched brows; soft granulating lower-face stubble; and a crisp dark smile line.

## Regions & Passage Moves (`config.json`)
- **Primary Style**: `precise-watercolor` preserves full 5-band light-to-dark value layering and crisp sepia-ink line work while allowing wet-in-wet soft foundations where requested.
- **`mittens.cat_ears_crown` (`[0.00, 0.00, 0.50, 0.22]`, `wet on dry`)**: Warm sienna-ochre ear tips and crown tabby markings around reserved inner-ear paper tufts and fine brow whiskers.
- **`mittens.cat_eyes_muzzle` (`[0.00, 0.17, 0.49, 0.48]`, `wet on dry`)**: Pale sap-green irises, dark slit pupils, saturated sienna-ochre nose bridge and cheek stripes, and pink-warm nostrils over a bright white muzzle.
- **`mittens.cat_chest_fur` (`[0.02, 0.44, 0.52, 1.00]`, `wet in wet`)**: Soft graded ginger-ochre left shoulder and warm brown-sienna tabby right flank framing the bare paper chest.
- **`mittens.man_curly_hair` (`[0.49, 0.18, 1.00, 0.74]`, `wet in wet`)**: Granulating Payne's-grey, ultramarine, and lamp-black curly hair mass with soft wet-in-wet blooms and fine peripheral curl lines.
- **`mittens.man_upper_face_eyes` (`[0.51, 0.42, 0.92, 0.79]`, `wet on dry`)**: Reserved paper forehead and nose bridge bordered by warm ochre-sienna temple shading, dark arched eyebrows, and deep brown eyes.
- **`mittens.man_nose_mouth_jaw` (`[0.51, 0.76, 0.94, 1.00]`, `wet on dry`)**: Soft warm-grey nose tip shadow and nostrils, granulating stubble and mustache wash, and crisp dark smile line.

## Protected Lights (`reserves`)
- Explicit focal highlight reserves (all `>= 3.5 mm` short side and `< 4%` sheet span to avoid any axis-aligned band-1 mask seams) plus automatic paper-white protection (`--paperlights 1 --paperrel 1 --paperdelta 10` and `--litreserve 94`):
  1. Cat right eye bright iris glint beside slit pupil (`[0.250, 0.215, 0.269, 0.245]`).
  2. Cat left eye bright iris glint (`[0.066, 0.234, 0.079, 0.258]`).
  3. Cat nose bridge and upper muzzle paper highlight (`[0.105, 0.272, 0.138, 0.295]`).
  4. Man left eye inner sclera glint (`[0.626, 0.725, 0.638, 0.742]`).
  5. Man right eye outer sclera glint (`[0.836, 0.684, 0.848, 0.701]`).
  6. Man nose tip paper highlight above nostrils (`[0.710, 0.808, 0.748, 0.835]`).

## Drawing (`opening-lines.json` & `closingink4-lines.json`)
- **Opening Drawing (`bench/plan/opening-lines.json`)**: Fine sepia-ink structural contours traced from `target.png` and kept off protected paper glints, establishing the cat's ear contours, eye rims, slit pupils, nostrils, mouth, whiskers, and the man's hair curls, brows, eyelids, nostrils, smile line, and jawline before washes begin.
- **Closing Ink (`bench/plan/closingink4-lines.json`)**: Selective high-contrast sepia-ink restatement over the dried sheet (`_ink4`, `--closingpressure 0.3 --closinglines 24`), aligned to the steepest target edge ridges (`TARGET_DRAW_EDGE >= 0.22` and 4-neighbor value contrast `>= 0.06`) to crisp the pupils, upper lash lines, brow cores, nostrils, mouth line, and key curl accents without over-inking soft washes.

## Palette, Values & Extra Arguments (`extra-args.json`)
- **6-Paint Palette (`--paints paynes,ochre,sienna,lampblack,ultramarine,sapgreen`)**: Replaces the default 3-paint greedy selection (which lacked neutral/cool darks and gave a `8.1` ΔE grey error on the man's hair) with Payne's grey, yellow ochre, burnt sienna, lamp black, French ultramarine, and sap green—cutting overall sheet+local ΔE in half (`1.93`) and capturing the cool charcoal curls, warm ginger tabby fur, golden skin tones, and pale green cat eyes.
- **Warm Light Retention (`--litreserve 94 --litlift 0.10`)**: Relaxes `_w13`'s stone-glint reserve (`89` -> `94`) and mid-wash lift (`0.25` -> `0.10`) so delicate pale ginger fur and warm cheek/forehead skin (`L* = 89..93`) receive their Band 1 pale local wash instead of bleaching to bare paper.

## Variant Tokens (`variant.txt`)
- Base recipe plus `_noblk_norg_da70_dg2_ladapt`:
  - `_noblk` (`--stoneblocks 0`): Disables rectangular ashlar masonry blocks on warm ginger fur and skin tones.
  - `_norg` (`--groundglaze 0`): Disables road/pavement cool-neutral shadow glazing across the lower half of the portrait.
  - `_da70_dg2` (`--deepaccent 70 --deepgrow 2`): Restates small focal darks (`max(R,G,B) < 70`: pupils, lash lines, nostrils, brow cores, mouth corners) in bands 4 and 5 down to 12-cell shapes instead of dropping them below the 180-cell wash threshold.
  - `_ladapt` (`--laneadapt 1`): Adapts stroke lane widths down to `2 mm` on narrow facial planes and tabby stripes.

## Failure Signs to Watch During Painting (`bench/paint.sh look`)
- Bleached warm ginger fur or pale skin planes in Band 1;
- Lost eye glints, bridged cat whiskers, or muddied paper whites on the cat's chest and man's forehead;
- Missing or faint pupils, lash lines, nostrils, or mouth line after closing ink.
