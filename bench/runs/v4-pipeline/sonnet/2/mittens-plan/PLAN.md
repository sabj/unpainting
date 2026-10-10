# Plan: Mittens (orange tabby and a curly-haired young man), watercolour portrait sketch, fine lines and light washes

## Value thumbnail (from the target)
- Paper white is the main value: about half the sheet (forehead, cheeks, cat muzzle and chest, the whole background).
- Light: pale ochre and sepia tints (cat cheek, chest strokes, face shadow side, stubble).
- Mid: burnt-sienna/orange tabby patches on the cat, the brown strip where the cat's shoulder meets the man's cheek.
- Dark: slate blue-grey hair (the one heavy mass), the brows, the cat's upper eyelid, eye and nostril accents.
- Focal points: the cat's big eye (green iris, dark lid, catchlight) and the man's two eyes under his brows. Everything else is allowed to dissolve into paper.

## Reference cues and regions (one technique each; resolution decision in brackets)
- **mittens.cat-head** (ears, forehead, cheeks, muzzle): wet on dry, a pale ochre wash, then burnt-sienna patches with hard ragged edges and white paper left between them, as the tabby marks sit in the target. One hard edge, one soft. [wash question; patches are many cells wide at 1200 px]. Eyes are dry-paper detail: pale green iris tucked under a dark upper lid, catchlights reserved, lid and pupil by pen. White muzzle and chin stay paper.
- **mittens.cat-body** (chest, shoulder): wet on dry, a few broken vertical strokes of orange and brown on bare paper; the darker brown edge against the man's cheek is one shadow glaze. Left bare where the target is bare. [wash / dry-brush: strokes are broken, edges on the paper tooth].
- **mittens.hair** and **mittens.hair-side**: one connected slate mass (ultramarine with sepia, never ink black), wet on dry with ragged dry edges, darker at the temple and the left, lighter grey inside, paper flecks left. No pen fill: pen only adds a few curl wisps at the edge. [wash question; curls are below four cells, so the painted mass plus a few wisps carry them].
- **mittens.face** (forehead, cheeks, nose, mouth): bare paper for the lit planes, a very pale sepia/ochre wash on the shadow side (left cheek, under the brows, around the nose and mouth), dry; then brows and lids on dry paper as dark ribbons (thicker at the outer corner), iris tucked under the lid with the catchlight left out, sclera a pale tint not bare white; a soft stubble tone round the mouth. Eyes and mouth are never inside a wet passage.
- Background: untouched paper (vignette). The painter keeps 51% of the sheet as paper on its own.

## Order and paper state
1. Opening drawing (hand-authored, sepia pen, light): ear outlines, both cat eyes, nostrils, mouth, long whiskers, the cat/man edge, the man's brows, lids, nose, mouth, cheek contour, a few hair wisps. Smooth tapered lines, not a trace.
2. Light washes (pale ochre/sepia, large, few strokes), full dry (paper state checked, not a timer).
3. Mid values on dry paper: the orange/brown cat patches, the hair mid grey, the face's shadow planes (lay3: three mid layers rather than the base four, since the target is light).
4. Dry. Shadow glazes crossing region boundaries: the brown strip from cat shoulder into the man's cheek, the hair's darkest temple.
5. Dry. Closing ink, selective: cat lids and pupils, nostrils and mouth, man's lids, nostrils, mouth corner, a few whiskers, hair wisps. Nothing in the lights.

## Protected lights
- Four small catchlight reserves (both cat eyes, both man's eyes), bare paper until the final accents.
- The painter's own near-paper lights: forehead, nose ridge, cat muzzle and chest, whisker lanes. Toned only where the target tones them.

## Palette and values (extra-args)
- `--paints ochre,sienna,ultramarine,cerulean,sepia`. Reason: without it the painter picked sepia, raw sienna and sap green from the picture, which would turn the slate hair green-brown and give the cat a flat tan. Ochre/sienna make the orange, ultramarine with sepia the slate hair, cerulean with ochre the pale green irises, sepia the face and ink.
- Base darkgain 1.3 kept: the hair and brows need real darks; everything else is kept light by `_lay3` and by the paper-white holds.

## Tokens
- `region_w13_lay3`: three mid layers instead of four (the sketch should stay light and transparent; fewer glazes means less mud on the face). Everything else is the V096 base (sepia ink, uncapped hand-authored lines, cold-press paper, shadow glazes that cross regions).

## What would show failure
- Hair green-brown or ink-black and flat; hair edges blurred into the forehead.
- The face filled with wash (the lit planes must stay paper); eyes blurred or the catchlights toned out too early.
- Cat patches smeared into one tan mass instead of hard-edged orange patches with white between.
- Whiskers heavy or ruled; lines that do not sit on the features; outlines around every wash.
- A wash edge cut by a straight seam along a region boundary.

## Revisions (self-view)
(filled in as the painting goes; see the end of this file)
