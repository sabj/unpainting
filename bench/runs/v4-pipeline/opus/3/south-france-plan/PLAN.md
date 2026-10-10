# South France: urban sketch, pen plus light wash (V4, try 3)

## Reading the reference (value thumbnail)

- Five values, from light to dark:
  1. near paper: the pale path and rocks in the lower centre and the lit cream wall planes;
  2. light: the ochre terraces on the left, the distant blue-green valley in the top right, the lit tops of the olive crowns;
  3. mid: warm stone walls, terracotta roofs, the yellow-green pine crown;
  4. mid-dark: blue-green tree undersides and the violet shadow sides of the houses;
  5. dark: cypress columns, the pine trunk and limbs, window holes, shadows under the eaves.
- Focal point: the cluster of stone houses at right centre (roofs about x 0.66 to 0.95, y 0.34 to 0.82). The upper village
  and the foreground pine come second.
- No sky. The coolest and lightest far plane is the valley in the top right corner.

## Style balance

- Global style is `urban-sketch`, as the task asks. Pen carries the structure. Washes are few and flat: one base wash per
  area, then one shadow glaze. The harness's ink-and-wash value floor keeps the values deep enough to read the reference
  (urban-sketch alone paints a near-blank sheet). I set no per-region style overrides, so no family box can cut a
  straight seam into the first wash.
- Ink: the base sepia (`_sep8` ink constants). It is warm and suits ochre and terracotta. Pen widths come from the base
  `_dwg200`.
- Palette (`--paints`): yellow ochre, burnt sienna, hansa yellow, sap green, French ultramarine and cerulean.
  - Ochre and raw-sienna-like mixes for the terraces and walls; burnt sienna for the roofs.
  - Hansa and sap green for the lit and shaded greens; ultramarine with sienna for the violet-grey shadow sides and dark
    greens.
  - Cerulean for the far valley.
  - The automatic pick, cerulean, hansa, sap green and quinacridone rose, had no earth colours for a Provençal hill town.

## Regions (families) and technique

All the washes go wet on dry, flat, in one connected passage per area. Each base wash gets one mid or shadow glaze on dry
paper. A region is a wash question unless it is listed otherwise below.

- **Upper village (top centre).** Pale ochre and violet-grey walls, terracotta roofs. Base wash, then one glaze. Pen opens
  the roof lines and wall corners. Windows (1 to 2 px, under 4 cells) are an ink question, done as closing dots.
- **Distant valley (top right).** Pale cerulean and green. One flat wash, no pen. It stays the lightest and coolest area.
- **Left terraces.** Ochre with stone walls. Broad ochre wash; the walls and the doorway are pen; olive rows are a light
  green wash.
- **Focal houses.**
  - Warm stone, so the lit faces get a pale ochre wash with paper glowing through.
  - Roofs: burnt sienna on dry paper, with a hard edge at the eaves.
  - One violet shadow glaze crosses the shadow sides of houses A and C and the ground shadow below.
  - Pen opens the roof outlines, wall corners and string course. Closing pen puts eave shadows, windows and the shadow-side
    corners.
- **Middle foliage (olive and oak masses).** A yellow-green base wash, then blue-green undersides as a glaze on dry paper.
  There is no pen inside the masses: a scribble there would be noise.
- **Right foliage and cypresses.** The dark green masses get a wash and then a dark glaze. Each cypress has one
  flame-shaped pen outline in the opening, plus one closing stroke on its shadow side.
- **Foreground pine.** Yellow-green crown wash, then a blue-green glaze on the underside. Trunk and limbs are an ink
  question (under 4 cells wide): opening pen with tapering limbs, then a darker closing pass on the trunk and lower limbs.
- **Left slope and lower slope.** Pale ochre path wash. The near-paper path lights are kept by the painter's own
  near-paper detection. Shrubs get a light green wash.

## Order and moisture

1. Opening sepia pen, sparse: 53 gestures, one per edge. These are the roofs and walls of the focal houses and the upper
   village, the terrace walls, eight cypress outlines, the pine trunk with eight limbs, and one loose line for the top of
   the pine crown.
2. Pale base washes on dry paper, light to dark. The painter's own light-to-dark ladder goes through about 15 pigment
   passes.
3. A full dry, then the mid values on dry paper. These are the roofs, the wall planes, and the foliage undersides.
4. A full dry, then the shadow glazes. They cross the region boundaries: house shadow sides into the ground shadow, and
   tree undersides into the slope.
5. Closing sepia pen on dry paint, 25 gestures, focal first: windows, eave shadows, shadow-side corners of the houses,
   eaves in the upper village, the shadow sides of the cypresses, and the pine trunk and lower limbs.

## Protected lights

- There are no rectangular reserves. They would cut unsupported straight seams, and the target has no bare-paper shapes
  large enough to need one.
- The painter keeps the near-paper target lights (the path and the brightest wall glints) out of every wash.
- Lit walls stay as one pale ochre wash with paper showing through. They are not filled to match the mid values.

## Failure signs to watch at the stops

- Lit walls go muddy, or the focal houses lose their light-to-dark separation from the trees.
- Roofs bleed into the walls (no hard eave edge).
- Foliage turns into stipple or a patchwork of islands instead of connected masses.
- The cypresses go blue-black instead of dark green.
- Pen lines look like a traced outline or drift off the forms.
- The whole sheet goes uniformly mid-green, so the urban-sketch lightness is lost.

## Changes made while painting

- **Stop 1 (before the first wash).** The opening pen was present and registered: 65 lines that read as a sparse
  sketch, but hairline-thin.
- **Stop 2 (after pass 12 of 32).**
  - What I saw:
    - The ground passes laid ochre in two broad diagonal swaths, with a white, speckled dry-brush stripe running
      diagonally through the middle of the sheet. Nothing in the target supports it.
    - Many white holes appeared where the passages were inferred as dry brush from the target's paper specks.
    - The green ground barely reads.
  - What I changed:
    - `--drytooth 0.5`, so the remaining plane and ground passages are washes, not dry brush. The skill says facade and
      ground planes are washes, and a scratchy first wash comes from treating every bare-paper cue as dry brush.
    - `--touchgain 0.8` (from the base 0.6), so the touch-up round pulls the stripe and holes toward the target's broad
      values.
    - Closing pen made stronger: width ×1.4. It now also restates the focal roof outlines and the pine limbs, because
      the opening hairlines are fading under the washes.
  - The painted passes stay as they are.
- **Stop 3 (after pass 23).**
  - The ground was now an olive-grey ochre-ultramarine-rose wash.
  - Sienna roofs had appeared on the focal houses.
  - The stripe persisted, because its geometry was planned before the revision.
  - I changed nothing and let the dark passes run.
- **Stop 4 (after pass 31 of 32).**
  - The dark passes made the scene readable: cypress columns, the focal roofs, the dark pine crown, and the foliage masses.
  - It is greyer than the target's yellow-greens, the foliage is blotchy, and the stripe still shows faintly through the
    middle.
  - What I changed:
    - `--touchpoints 3` (from 2). Touch-up only glazes where a shape is lighter than the target's shape mean, so more
      rounds pull the greens and the stripe toward the target without overshooting.
    - The closing pen now restates every structure line from the opening, except the crown scallop: roofs, walls,
      terrace walls, cypresses, and the pine trunk and limbs. The opening hairlines vanished under the washes, and in an
      urban sketch the pen carries the structure.
    - The closing set is now 77 gestures.
- **Stop 5 (before the closing drawing, 58 passes, 39k strokes).**
  - The touch-up rounds filled most of the stripe and warmed the greens.
  - They also made the foliage blotchy, and a few patches went blue-black.
  - I finished the painting from here.
- **Run 1 result: render failed (code 5).** 263 passages carried no executed brush path (0.8% of the planned mass), so
  there was no score.
  - Likely cause: my third touch-up round at gain 0.8 left many near-empty corrective passages.
  - Possible second cause: the two mid-run re-plans rebuilt pending touch-up passages.
- **Run 2: restart from a clean sheet.**
  - `--drytooth 0.5` from the first wash, so the ground is a connected wash and no diagonal dry-brush stripe forms.
  - Touch-up back to the champion's 2 rounds at gain 0.6.
  - The final closing pen set (77 gestures) is in from the start.
  - The plan is to paint it without mid-run re-plans unless a stop shows a clear failure.
