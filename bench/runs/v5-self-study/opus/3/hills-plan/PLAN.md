# Hills, V5 try 3: loose ink and wash

## Reading the reference

An aerial view of oak hills. Lit, acid yellow-green grass slopes cross the sheet on diagonals and cut through a dense
oak woodland. The crowns are rounded clumps: lit grey-green tops, teal bodies, blue-black undersides. A dark ravine
runs centre-right. Two tan dirt paths wind down: one upper left, one S-curve in the centre, with path ends at the top
and bottom right. Thin white paper seams edge the paths and some meadow rims.

Value thumbnail (five steps):
1. Near paper: white seams along the paths and meadow edges (0.2% of the sheet, held by the painter's near-white rule).
2. Light: the tan paths and the lit meadows (hansa + sap green, high chroma).
3. Light mid: lit crown tops (grey-green / yellow-green), meadow patches under thin shade.
4. Dark mid: crown bodies, teal blue-green. This is most of the woods.
5. Dark: the ravine, crown undersides, the left and lower-left woods. Mixed darks (phthalo + rose + sap), never ink.

The main structure is a two-value split: a dark-mid woods mass (about 55% of the sheet) with light meadows cutting
through it. Focal point: the S-path, the big oak above it, and the lit lower meadow.

## What I changed from try 2, and why

| change | why (evidence) |
|---|---|
| **Woods and meadows as two style domains** (`config.json`: family `HILLS.meadows` on the subject style `ink-and-wash`, family `HILLS.woods` on `precise-watercolor`; `--cellfamilies 1`; `--layerhue 0`). The light band was painted with both boxes `[0,0,1,1]` (a per-cell split). From revision 1 the meadows box is `[0.4,0.56,0.88,1]`, so whole colour clusters label the domains (see Revisions) | Try 2's root fault, traced in `light-to-dark.mjs`: with one style and the base's `layerhue` grouping, each light pass was one 79%-of-sheet shape. Its lanes averaged meadow and wood colour into olive, and every early frame was a uniform faded-in tint (the judges' top tell, named 6 times). With `cellfamilies`, a dark, low-chroma target cell (value > .3, chroma < 45) takes the woods style; the rest (meadows, paths, lit crown tops) keeps ink-and-wash. The split follows target colour edges, never a box, so it adds no straight seams. With `layerhue 0`, the light and mid passes are cut by style instead of by colour group. The 612 compile shows the light band as two domains, meadows 41% and woods 55%, each charged with its own colour. |
| Meadows on `ink-and-wash` | That ladder has two washes. Outside the target's shadows, all of a meadow's demand goes into its one light wash, so the meadow gets one connected acid yellow-green wash at full strength, as a painter would lay it. Only the few cast-shade cells keep a later glaze. The meadows can no longer go olive under a shared base. |
| Woods on `precise-watercolor` + `_lay2` (was `_lay4`) | The woods need light, mid and dark steps. Two mid layers instead of four: try 2's three extra quantile layers gave nested hard-rimmed islands, the camouflage. Pale base (16%), two dry mid layers, then two shadow glazes. |
| `_lad` (lane width adapts, 2 to 6 mm) | Without lanes, the narrower per-domain shapes would revert to one fitted gesture per plane. That was try 1's flat-slab tell: at 612, 0 shapes were laned without `_lad`. With it, 84 to 98% of every wash's area is laid in lanes along the shape's own axis. |
| `--paints hansa,sapgreen,phthaloblue,rose` (was the fitted box `cerulean,hansa,sapgreen,rose` + `phthaloblue,sienna`) | No burnt sienna, so no rust flecks in the woods. No cerulean, so no slate-blue blotches. Rose stays: without it the teal-grey woods cannot be reached (palette error 7.9 vs 2.8; measured with `widePalette` on the target). The order puts hansa first and rose last in each band, so the first wash is yellow, not pink. |
| `_ms300` kept with `_lad` | Omitted speck demand in the 612 equivalent (`_ms75`): 4.8% of the planned mass. Light coverage 96.4%. The rest is near-white seams and fragments under 2.2 mm. |
| Opening lines: try 2's sketch minus 4 stray loops/hooks (38 lines) | The judge noted that the contour lines "sensibly describe the path and terrain". The loops in the open meadows (lower right, top right, top centre) followed no edge. |
| Closing lines: try 2's crown rims minus 3 meadow hooks, plus 13 smoothed traced crown-valley lines at the focal woods (61 lines) | Loose ink and wash puts some pen into the woods at the focal point (around the big oak above the S-path, the centre ravine, the lone meadow tree). Traced with `q-trace-ink.mjs` (.12, 10, .45), then Chaikin-smoothed (3 passes) to remove pixel zig-zags. Tapered width and weight. |
| Kept: `_spl6`, `--strokemm 300`, `_cur`, `--paperlights 0`, `--violetshadow 0` | Lanes without the 30 mm block grid. White paper with painted, not cut-out, paths (both held in try 2). |

## Critique points I rejected

- "Texture arriving as a dump between 50% and 75%": I keep darks last. The woods now get their own base and mid
  layers, so they darken in steps instead of navy landing on olive.
- GLM's marks/texture 4.0 and the classic edge and marks scores (9.1, 9.2): not evidence of quality. The woods were
  camouflage.
- Composition/values 4: the composition is right, but the value split was not.

## Regions and technique

| region | cue | resolution (0.129 mm/cell) | move / paper | load | edges | layer |
|---|---|---|---|---|---|---|
| meadows + paths (ink-and-wash) | lit acid yellow-green slopes, tan paths | wash: slopes 20 to 80 mm, paths 5 mm = 39 cells | wet on dry, one connected wash per pigment in 2 to 6 mm lanes along the slope | watery to medium, full local demand once | hard against the woods (pen rim), soft inside | 1 (+ a tiny shade glaze, 4) |
| lit crown tops inside the woods (ink-and-wash cells) | yellow-green crown tops | wash, pieces over 2.2 mm | same light wash, laid with the meadows | watery | crisp on the shadow side once the woods go round them | 1 |
| woods (precise-watercolor) | teal crown bodies, blue-black undersides | wash shapes: crowns 3 to 10 mm = 23 to 77 cells; ink below 4 cells | wet on dry pale base; 2 dry mid layers; 2 shadow glazes on dry paper | watery .62, then .48, then glazes .45 with darkgain 1.3 | broken crown silhouettes, crisp undersides | 1, 2, 3, 4, 5 |
| white seams | paper sparkle along the paths | below 4 cells | reserved (near-white rule) | none | hard | n/a |

## Glazes

Two shadow glazes (bands 4 and 5) over the dried woods, across crowns, ravine and the woods' meadow rims wherever the
target's shadow support is connected. The meadow keeps only its tiny cast-shade glaze (0.2%). The glazes are split by
style domain, so meadow and woods shadows are separate passes. That is the price of keeping the meadows clean.

## Wet passages

None wet-in-wet. Each light pass is wet on dry, its lanes overlapping one brush radius wet into wet. Meadow and woods
light washes are separate passes, dried between them.

## Drawing

- Opening, sepia pen (base `_sep8`), before any wash: 38 sparse lines. Path banks, the meadow/wood silhouettes, the top
  slope.
- Closing, sepia, on dry paint (`_ink4` reads `closing-lines.json`): 48 crown rims against the meadows, plus 13
  crown-valley strokes at the focal woods. None in the lit meadows.

## Order and stage intents

0. Opening pen sketch on white paper.
1. Light band: per pigment (hansa, sap green, phthalo, rose, then the granulating phthalo tube from base `_skyb`), the
   meadow wash, then the woods' pale base. Intent at 10 to 25%: yellow-green meadows clearly brighter and more
   saturated than a pale grey-teal woods tint, with the pen visible. Failure: a uniform tint over the whole sheet,
   pink, or olive meadows.
2. Mid layers L0 (all woods), L1 (darker 70% of the woods), dry between. Intent at 50%: woods a coherent dark-mid teal
   mass, meadows untouched and bright. Failure: hard-rimmed islands, camouflage.
3. Shadow glazes, bands 4 and 5, then the painter's touch-ups. Intent at 75%: crown undersides and the ravine dark,
   lit crown tops kept light. Failure: navy blotches, everything one dark.
4. Closing ink. Failure: wiry outlines everywhere, or ink in the meadows.

## Revisions during painting

- **Look 2 (opening done):** 48 pen lines on white paper: path banks, meadow silhouettes, the top slope. Sparse, no
  stray loops. Plan: 34 passes. Each pigment's light pass is split into a meadow passage (41%) and a woods passage
  (55%).
- **Look 3 (after pass 4, hansa + sap green):** the split works. The meadows are a strong acid yellow-green, and the
  woods are a pale tint, clearly different in value and colour (not a uniform faded-in sheet). Two faults:
  1. The meadow lanes leave regular diagonal pale dashes between lanes, which read as ruled hatching. The spacing is
     1.7 lane radii (`stroke-plan.mjs` `laneOffsets`), so this comes from how the lanes deposit and is already on the
     paper.
  2. The tan paths sit inside the meadow domain, so the meadow lanes painted them yellow-green. Paths need their own
     domain from the first wash. I did not fix this mid-painting: a third style re-indexes the ladder and would
     repaint sap green on one domain.
- **Look 4 (after pass 10, light band done):** meadows yellow-green, woods a pale grey-teal. But 3.8% of the sheet
  was near-white specks (target 0.5%), plus khaki fragments in the woods. These were cells the per-cell rule kept
  meadow-style, in fragments under the 300-cell minimum shape, so no pass painted them.
  **Revision 1 at boundary 10:** the meadows family box became `[0.4,0.56,0.88,1]` (the lower meadow) and woods stayed
  `[0,0,1,1]`. Through the painter's IoU rule, its colour clusters 2, 4 and 5 (bright meadow, light meadow,
  khaki/path) now label as meadows and 1, 3 and 6 (grey-green, dark, teal) as woods, verified with `targetRegions` on
  the target. Region labels are fragment-merged at the minimum shape, so the woods domain has no small holes;
  `cellfamilies` stays on. The 612 compile showed the woods' mid layer at 69% of the sheet (was 53%). Cost: the new
  ladder has 9 light passes, not 10, so continuing at pass 11 skipped the woods' L0 hansa layer. That is acceptable:
  the woods target is teal, and hansa still comes in L1 and the glazes.
- **Look 5 (after new pass 11):** the woods' L0 sap green covers more of the woods; fewer specks. One straight
  horizontal lane seam across the upper-left woods.
- **Look 6 (after pass 19, mids done):** a strong woods/meadow split. Meadows clear yellow-green; woods a layered
  slate/olive mass. Woods mean L 114 against the target's 78, so the glazes are still needed, and darkgain 1.3 stays.
  Small salmon islands where rose landed alone. I cannot drop rose without re-indexing; the glazes should cover most.
- **Look 7 (before closing, 41 passes including the painter's touch-ups, 12,520 strokes):** woods mean colour
  72,78,75 (L 76.6, sd 32.1) against the target's 73,80,74 (L 78.1, sd 32.4), so the woods value and its variation now
  match. The closing set fits the painted rims, so no revision. Finished.

## Outcome (look 8) and lessons

Better than try 2:
- The plate's main structure is back: a dark woods mass with blue-black undersides and lit grey-green breaks, cut by
  clear acid yellow-green meadows. Woods value matches the target (L 76 vs 78); try 2 had navy islands on an olive
  ground.
- The progression is region-led. Each light pass went to the meadows and the woods separately, so the early frames
  show bright meadows against a pale woods tint, not a uniform faded-in sheet. The woods then darken in steps (pale
  base, two mid layers, two glazes). No pink first wash.
- The pen sketch and the crisp rims at the meadow edges hold.

Still wrong:
- **Salmon/rust flecks in the woods.** Try 2 had them with burnt sienna, try 3 with rose, so the cause is not the
  pigment. It is the one-pigment-per-pass ladder: wherever a warm pan's shape lands alone, it shows as an island.
- **Lane stripes in the meadows:** regular diagonal pale dashes from the hansa and sap green lane passes, the only
  real washes the meadows get.
- **Paths are green, not tan.** They were in the meadow domain, so the meadow lanes painted them; only the pen banks
  and a faint warm streak show the S-path.
- Meadows a little dark (L 157 vs 180) and slightly olive at the edges.

Lessons for the next try:
- Use whole-colour-cluster labels from the start (a meadow box on the lower meadow, a woods box on the whole sheet,
  `--cellfamilies 1`, `--layerhue 0`). The per-cell split alone leaves small unpainted fragments (3.8% white specks),
  and revising mid-way costs a skipped pass.
- Give the paths a domain of their own from the first wash, e.g. a third family that wins the khaki cluster, on
  `urban-sketch`. With the ink-and-wash value floor it lays the same total demand, but as its own passage, so the paths
  stay tan.
- Before painting, test a wider or non-laned first wash for the meadows (the lane spacing of 1.7 R leaves pale dashes),
  e.g. `_spl6` without `_lad` on a crop.
- Keep rose (the greys need it) but look for a way to stop single-pan islands: fewer, larger glaze shapes, or a
  higher minimum shape for the shadow bands only.
