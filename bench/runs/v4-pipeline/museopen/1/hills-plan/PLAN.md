# Hills — Loose Ink and Wash Plan

## Reference cues
- Target is a sunlit hillside with two winding paths cutting across green slopes, scattered trees and scrub, upper wooded ridge. Light from above-left, warm ochre paths as leading lines, cool blue-green shadows under trees.
- Value structure: lightest = paths and sunlit grass (paper and pale ochre), mid = yellow-green hillsides, darks = tree masses, shadowed scrub and ridge. No sky — upper edge is distant treeline.
- Colour: sap green / hansa + ultramarine for foliage, yellow ochre / raw sienna for paths, burnt sienna for warm earth, cerulean for cool distance, sepia ink for structure.

## Regions and technique
- Single style `ink-and-wash` over whole sheet (families empty — painter's own segmentation). Ink carries form; washes stay connected.
- No separate sky family; upper trees treated as foliage texture, not flat sky.
- Reserves: two tiny paper saves — one bright path highlight centre [0.44,0.52,0.47,0.56] and one sky-hole/bright leaf gap top-right [0.70,0.06,0.73,0.10]. Both >4mm short side, well under 8% seam limit. Painter also keeps near-paper lights automatically.

## Order and moisture
- Opening sepia ink (trace-ink, 79 lines, .12 contrast, 14 minLen) draws hill contours, path edges, tree trunks/branches before any wash. Light pressure, dry paper.
- Light-to-dark ladder: 4 mid layers (lay4) build greens gradually — layer 0 covers whole mid form wet-on-dry, later layers only darker smoothed value, each dried before next. Shadow glazes (violetShadow, groundGlaze) add depth under trees; coolGain 1.3 keeps distant greens blue.
- Closing sepia ink (closingink4, same 79 lines, drawWant 1) reinforces path edges and tree structure directionally after washes dry. Uncap allows full line count.

## Load and paper
- Cold-press paper (cpp) for granulation; skyBlue second tube (French ultramarine granulating, floc 0.5) for soft mottle in distant greens.
- Water: calibrated per-layer load, shadowWater default, wetMix 0.3, bridge 0.82.
- Paints: ochre, rawSienna, sienna, hansa, ultramarine, cerulean, sepia, sapGreen — 8 pans via --paints in extra-args.json, paletteWide 1 picks box pigments to reach local colours.
- DarkGain 1.3, texVariety 0.8 for foliage texture, touchPoints 2 for focal accents.

## Protected lights and edges
- Reserves plus painter's paperKeep protect path lights and sunlit grass.
- Edges: broken silhouettes, dry directional ink, connected value masses (ink-and-wash profile). No hard rectangular washes — layer smoothing 2mm and edgeWobble keep edges irregular.
- Ink share 0.75, sepia inkK .396/.481/.619 scale 8 for warm brown line.

## Values
- Light wash → shadow glaze ladder (5 bands, weights 0.42/0/0/0.58/0). Middle values built as 4 connected layers, not per-region posterization. Shadows never split by region.
- Violet shadow lift and ground glaze add warmth to earth shadows.

## Failure modes
- Over-dark greens (too much sapGreen/ultramarine) would lose sunlit air — watch midGain and darkGain.
- Paths closing up (ochre too heavy) — reserves and light wash must stay pale.
- Ink too heavy or too light — drawWidthGain 2, closing pressure 1 should balance; if lines disappear, increase drawWant.
- Granulation muddying — cold-press + skyBlue floc should mottle, not speckle.

## What changed (V4 try 1)
- Initial plan: base recipe with ink-and-wash, 2 small reserves, 8-pan palette including sapGreen, trace-ink opening/closing. No families — let painter segment. Admitted on first check.
