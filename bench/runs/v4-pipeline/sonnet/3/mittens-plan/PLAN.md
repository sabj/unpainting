# Plan: Mittens (cat and man), "watercolor portrait sketch, fine lines and light washes", V4 try 3

Read first: .claude/skills/watercolor-technique/SKILL.md (portrait, fur and sections 2, 3, 5, 6, 8 used below).

## Value thumbnail (what the target is)
- 1 paper white: the whole upper right, forehead and cheek lights, the cat's muzzle, chest and the gap between cat body and background. Most of the sheet is bare paper.
- 2 pale warm washes: the cat's ginger patches (yellow-brown rather than red; the painter's colour fit says hue about 75, so no burnt sienna), pale warm-grey fur shadow, the man's skin.
- 3 mid sepia-umber: the cat's shadow strip against the man's cheek, the man's left cheek and jaw shadow, stubble under the mouth, the ear's dark edge.
- 4 darks: the man's hair (charcoal blue-grey, the darkest mass), both brows, irises, the big cat eye's upper lid, nostrils.
- Focal points: the cat's big eye (upper left), the man's eyes and brows (lower right). The hair is the heaviest mass but it is a wash, not detail.

## Lights (all kept by reserve or by the painter's own near-paper rule)
- Four eye catchlights (cat big eye, cat small eye, man left eye, man right eye): small reserves, bare paper until the very end; the dark iris is painted around them.
- White sliver in the hair at about (0.70, 0.385): small reserve; paper fleck, left as paper.
- Large lights (cat muzzle/chest, man's forehead and cheek, background): bare paper by the painter's near-paper rule; I add no big rectangles, so no straight reserve seams.
- Whiskers are pen lines, not reserved paper.

## Regions (family, reference cue, resolution question, move)
- mittens.cat (left half): ginger patches with white gaps. Wash question: connected pale patches, wet on dry, paper showing between them; the shadows on the right cheek are mid-value glazes across several patches. Smallest real feature: whiskers (about 0.25 mm = about 1.3 cells at 1200 px), far below brush size, so ink-and-wash question: they are pen lines. Edges: hard where a patch meets paper, soft where the orange turns into the pale shadow.
- mittens.hair: one connected charcoal wash mass with broken dry-brush edges. Wash question (patches are 3 to 10 mm, many cells). A few loose wisps are pen lines outside the mass, light, not a fill. No stippling, no per-strand paint (V095 was rejected as noisy and fake on hair). Move: wet on dry, loaded body, edges stay ragged. The cool gain in the recipe darkens the blue-grey cells.
- mittens.face: pale warm skin wash with lights left near paper, then one sepia-umber shadow glaze crossing from the cheek into jaw and neck (down the left side and under the lip). Brows, irises, lids on dry paper last, with a small load for crisp edges. Eyes get no wet passage (dry barrier).
- Everything else (background paper): untouched.

## Layer order
1. Opening pen (sepia): brows, lids, creases, nostrils, mouth, face and cat body edges, cat ear, both cat eyes. Confident, tapered, hand-authored (opening-lines.json); not a trace of wash edges.
2. Pale washes: cat ginger patches, skin, the first light grey of the hair, on dry paper, connected per mass.
3. Dry. Mid values on dry paper (3 layers, `_lay3`: the target has few steps and "light washes"): cat shadow strip, cheek and jaw shadow, hair body.
4. Dry. Shadow glazes across regions (cat shadow into the man's cheek edge; hair darks into the ear and cheek edge).
5. Darks last: hair darkest left and under the crown, brows, irises, nostrils.
6. Closing pen (closing-lines.json, line weight 0.6 or more so the closing pass draws them): the whiskers (right fan, left fan, long upper ones, ear tufts), lid and pupil accents, nostrils, mouth corner, five hair wisps. Whiskers go on last over dry paint so they stay fine.

## Paint and load
- Paints (extra-args --paints): raw sienna, yellow ochre, hansa yellow, sepia, Payne's grey, French ultramarine. I compared sets with the planning step: with burnt sienna the colour fit was 8.7 to 10.4 dE; with these six it is 2.7 and the greys (hair) are 1.4 off. Sap green fitted equally well but could show as green patches on fur and skin, so it is left out.
- Moisture: washes medium-watery on dry paper; the cat's shadows and the hair a little thicker; brows and irises thick and small.
- The recipe keeps darkgain 1.3, because the hair is near black; I will lower it for later passes if the skin shadows go too heavy.

## Tokens
- `_lay3` replaces `_lay4`: three mid layers, to keep the washes light and the paper showing. Everything else is the V096 base.

## What would show failure
- Hair as stippled flecks or a fill of ink; green or violet patches on skin or fur; orange blocks with straight edges; whiskers heavy, ruled or jagged; eyes grey or without catchlights; the man's face grey and flat (should stay warm, paper-light); the cat's white muzzle and chest filled in; cat/man boundary lost; background tinted.

## Stage intents
- Before the first wash: sepia sketch with both faces readable from the lines alone; whiskers not yet drawn.
- After the pale washes: cat patches and skin tone as pale shapes, hair a light grey; paper still dominant.
- After mids/glazes: shadow side of the cheek and cat's neck read; hair gets its body.
- End: darks in hair, brows, eyes; whiskers over the top.

## Changes (V4 try 3, first plan; revisions are listed below as they happen)
- Palette: the painter's own pick for this subject was sepia, raw sienna and sap green (no cool grey for the hair), so I set `--paints` after comparing sets with the planning step (fit error 2.7 dE with the six chosen paints against 8.7 to 10.4 with burnt sienna).
- Opening drawing: only 16 of my 42 opening strokes reached the paper (brows, one lid, one crease, philtrum and mouth of the cat, both face contours, the right half of the mouth). Lids, nostrils, ears and the cat's small eye were dropped by the painter; I could not find out why from the code (opening pressure is capped at 0.3 and opening strokes under 8 mm are skipped, which explains stubs only). The likeness is carried by the washes and by the closing pen instead.
- Revision 1 (after pass 7, ground wash): the four catchlight reserves were showing as visible squares of bare paper in the ground wash, so I shrank them to about 2.3 mm and removed the hair-sliver reserve (the painter keeps that near-paper fleck by its own rule).
- Revision 2 (after pass 37): `--touchgain 1` (the recipe has 0.6). The hair was still a warm mid brown against the target's dark cool charcoal; the touch-up rounds glaze each shape where the painting is lighter than the target's shape mean, so a stronger gain moves the hair and the dark shapes toward the target without my adding marks.
- Result of revision 2: the touch-up rounds made the ladder 53 passes long (the recipe's 38 plus value-6 and value-8 touch-ups). The cat's ginger became properly orange and the hair got dark blue-grey notes, but the hair is blotchy (dark blue-grey spots on a brown base, not one continuous charcoal mass) and a chain of rust-brown beads runs down the cat/man boundary. I could not remove either, because paint on the paper stays.
- Revision 3 (before the closing drawing): closing-lines.json only. I laid the closing lines over the finished sheet and found my man's-eye lines about 10 to 20 px too low (his irises are at about (727,753) and (980,714) in 1200-px space), so I re-measured the upper lids from the target and moved them; dropped the hair wisp that would have sat inside the dark hair; added the cat's ear, small-eye lid and body edge (the opening pen had dropped them), two light nose-wing lines and a redraw of the mouth line (its left half was dropped).
- Outcome of the closing drawing (checked by differencing the sheet before and after): only about five closing strokes were laid (the big cat eye's upper lid, both cat nostrils, the man's right upper lid and a stub of his left lash line). None of the whiskers, hair wisps, ear, nose wings or mouth redraw reached the paper, so the "fine lines" part of the brief is much thinner than planned: the sheet has brows, face edges, the cat's mouth lines and eye lids, and no whiskers. Both pen stages dropped most of their strokes and I did not find the rule from the code. It looks like strokes survive where the target is strongly dark under them. Next time I would put the whiskers in the washes' reach (they cannot be done as pen lines here) or name the problem to whoever owns the pen.
- What I did not change: darkgain 1.3, `_lay3`, region styles (none: hair and skin both stay precise-watercolor to avoid noisy hair marks and region-edge seams).
