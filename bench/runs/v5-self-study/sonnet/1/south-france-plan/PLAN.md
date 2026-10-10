# Plan: South France, V5 try 1 (urban sketch, pen plus light wash)

Read before planning: `.claude/skills/watercolor-technique/SKILL.md` (layering, resolution decision, ink layer, plan check).

## Reference cues and value thumbnail
Hillside village seen from above, 304 x 249 px target on a 280 mm sheet (1 target px = 0.92 mm; 1 output px = 0.23 mm).
Five values: (1) paper-light: sunlit tan walls, pale path glints, roof lights; (2) light ochre terraces and the yellow-green
pine crown; (3) mid greens, terracotta roofs; (4) lilac and purple shadow walls, grey-green olives; (5) darks: the cypress
flames, the pine trunk and limbs, window and hut openings. Focal point: the terracotta-roofed house group, right of
centre (x 195-295, y 80-205 px). Secondary: the cypress pair at the top centre and the pine, bottom left.

## Style balance (decided first)
- Requested style is urban sketch, so the style is `urban-sketch` for the whole sheet: the pen carries structure, the wash is
  pale and flat. I add no region styles: the painter's own colour/value segmentation is assigned to the families below, and a
  region style would risk straight seams where the target has no edge. The painter's value floor already lifts urban-sketch
  cells to ink-and-wash depth, so the sheet will not be near blank.
- Ink carries: roof lines, wall corners, window and hut openings, cypress outlines, the pine trunk and limbs.
  Ink does not carry: foliage masses (no scribble fill), grass, distant hills.
- Wet-in-wet only on the distant hills (soft, pale, no detail). Everything else is wet on dry: building planes, terraces,
  foliage clumps (resolution question: all are value planes with an edge, wash question; foliage leaves are well below
  four cells and are left to the wash, not to marks).

## Regions, technique, order (families in `config.json`)
| family | cue | question | move | paper state needed |
|---|---|---|---|---|
| SF.village | terracotta roofs, tan walls, lilac shadow sides | wash plane per wall and roof, pen for edges | wet on dry, one connected pale wash per plane, shadow sides one glaze across wall and window | dry before the shadow glaze |
| SF.village-top | small pale houses | wash plane | wet on dry, paler than the focal group | dry |
| SF.terrace | ochre walls and path, hut | wash plane, hut opening dark last | wet on dry, one connected ochre wash | dry |
| SF.cypress | flame shapes, darkest darks | wash question, dark mixed green-blue not black | wet on dry, one connected mass per tree, darkest value last | dry; pen outline on top |
| SF.hills | distant blue-green | wash | wet in wet, pale, soft | damp, shine gone not required |
| SF.foliage-centre / -left / -low | olive crowns, clumps | wash plane, broken edge | wet on dry, one pale mass per crown, then a darker shadow glaze across crowns (crosses family bounds) | dry |
| SF.pine | yellow-green crown, dark trunk | wash plane; trunk and limbs are an ink question | crown wet on dry, pale; trunk and limbs pen | dry |

Layer order the painter follows (light to dark): opening pen (structure only), pale base washes, two mid layers
(`_lay2`, instead of four: urban sketch wants paper showing and few layers), dry, shadow glaze across wall/window/roof edges
and across the olive crowns, accents (openings, cypress darks), closing pen on dry paint.
Breaks from light-to-dark: none planned. The pen goes first (urban sketch practice, and the base recipe draws it first).

## Protected lights (reserves)
Paper whites kept out of every wash, all small so no long straight seam is created: chalky path glint near the pine (bottom
centre-left), sunlit tan front wall of the middle house, pale wall of the top tower, lit lower face of the right tower. The
painter also keeps its own near-paper lights (the white speckles in the olive crowns, roof ridge lights).

## Drawing (opening-lines.json, closing-lines.json)
Hand-authored, not traced: the tracer on this 304 px crop gives jagged pixel-stepped chains (checked at four thresholds).
82 strokes, 1300 points, in target pixel space, read from gridded zooms of the target:
- focal houses: roof outlines, ridges, eaves, wall corners, the dark cornice band, windows, the round window, the shed roof,
  the stone wall edge (about 30 strokes);
- top houses (four) lighter, terrace wall top, hut and its dark opening, niche arch, path and terrace edges;
- 12 cypress outlines, each one stroke up the left edge, over the tip and down the right edge;
- the pine: trunk tapering from 3.6 to 1.7 wide, then seven limbs of unequal length, and two loose crown arcs;
- weights 0.5-0.95 by darkness; the structure lines and cypress carry the highest weights.
The closing file holds only the 41 strongest strokes (focal houses, cypress, trunk and limbs, hut), re-inked on dry paint.
Ink pigment: the base recipe's sepia (`_sep8`, `--inkcolour sep`), unchanged.

## Painter settings
- `bench/variant.txt`: `region_w13_lay2` (two mid layers instead of four, because urban sketch wants thin layering).
- `extra-args.json`: `--paints ochre,sienna,hansa,sapgreen,ultramarine,cerulean,rose,sepia`. The default non-Y1 palette has no
  green, and this sheet is mostly green; hansa plus sap green give the yellow-green pine and olive greens, rose with
  ultramarine gives the lilac shadow walls, ochre and sienna the terraces and roofs.

## What would show failure
- Pen lines off the painted edges (my drawing is hand-fitted, so check the focal group first).
- Pen too heavy or too regular (herringbone pine limbs, ruled roof lines); ink over a blurred wash.
- Foliage as one flat green block, or the sheet pale and empty (the value floor should prevent it).
- Wash bleeding across the cypress or building edges, rings or tiles in the foliage, a hard straight seam at a family bound.
- Lilac shadow sides turning grey or brown, greens turning to mud.

## What I changed and why (V5 try 1)
First try, no earlier painting or critique to learn from. Choices made: hand-authored pen drawing instead of the tracer;
`_lay2`; an explicit green-bearing palette; urban-sketch for all regions with no region overrides. At each stop I will look
at the sheet against the target and revise anything not yet painted (config, extra-args, tokens); the changes will be added
below.

### Revisions during painting
- After pass 9 (look 3): removed all four hand-placed reserves from `config.json`. As rectangles they left hard, square
  white holes in the ochre ground (middle house front wall, path glint by the pine), which no watercolourist would leave and
  which would have stayed white to the end. The painter keeps its own near-paper lights, which follow real shapes.
- Before the closing drawing (look 7, 55 of 55 passes): the painter's touch-up rounds had left a busy mosaic of small
  glazes with a few blue-black blotches, and the opening pen (a 1 px fine-liner, the ink profile caps the nib at 0.4 mm)
  was nearly lost under it. I could not change the opening, so I rewrote `closing-lines.json` only: all structural
  strokes except the two loose crown arcs (144 strokes, weight 0.62 or more so none is filtered out), the strong lines gone
  over a second time 0.3 px apart so they read as a firmer pen line, and 20 short loose hatch strokes on the lilac shadow
  walls of the three village houses, in directions that follow the wall and with uneven spacing, so they are not ruled
  hatch. The opening file is byte-identical to what was painted.
- Result, looked at once after the painter finished (look 8): both revisions were accepted by the check, but neither shows
  in the finished painting. (a) The four reserve rectangles from the first config are still white blocks (top tower, middle
  house front wall, right tower face, path glint by the pine), although `config.json` has had `"reserves": []` since
  revision 1. I do not know why; the painter continued from its saved sheet and plan. (b) At 1216 px I see no closing pen
  at all: the focal-house crop shows only the faint opening hairlines, no doubled strokes and no hatch. I cannot tell from
  the look whether the closing drawing ran with the new file or not. Treat the finished painting as having the opening pen
  only, and treat both revisions as unverified.
- Other faults visible in the finished painting: the sheet is a busy mosaic of small olive/khaki glazes (the touch-up
  rounds took the stroke count from 2.7k to 15k), a few blue-black blotches in the middle of the foliage, drab greens where
  the target has a bright yellow-green pine crown, and broad diagonal brush bands in the ground wash.
- Process notes: `bash bench/check.sh` hung in my sandbox (it takes a slot with `mkdir <local path>`, and /tmp is
  not writable for me), so I ran its two stages by hand: the executor check at 1216 px returned `"ok": true`, and the
  planning step at 608 px reached "target values" with no seam complaint. The harness's own check at `paint.sh start` and
  at each revision passed.
- What I would do differently (for try 2): the hairline opening pen is too faint for urban sketch, so give the opening
  more and doubled strokes from the start; and the ladder paints only a light band and a dark band for urban-sketch, so
  the mid values come only from the touch-up rounds.
