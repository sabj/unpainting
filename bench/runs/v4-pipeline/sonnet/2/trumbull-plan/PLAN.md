# Plan: Trumbull, V4 try 2, precise architectural watercolor

## Reference cues
Warm sandstone collegiate-gothic block in afternoon sun, seen from a corner. Value thumbnail (5 values):
1. paper-white clouds and the white street pole (lightest);
2. pale blue sky and the sunlit stone faces (right-hand gable face, right wing, low wing): warm ochre, light;
3. half-tone stone: the left tower faces and the left facade, greyer and cooler;
4. shadow side: the narrow recess between the left tower and the gable block, the shaded tree-side wall, slate roofs
   (blue-grey, mid-dark);
5. darks: window glass (navy), the banner sign, traffic signals and utility box, shrub base.
Focal point: the two pointed traceried windows and the doorway arches of the central bay, under the street sign.

## Regions (config.json) and technique
The painter segments the target by colour/value and hands each segment to the family whose bounds fit it best; the
family bounds below only label those segments (no rectangle edge is painted).
- `trumbull.sky` (top 32%): graded blue wash with the recipe's own sky lanes and granulating ultramarine, cloud whites
  held as paper; takes the cool segments (sky, slate, glass). I first labelled it "wet on wet" (the reference sky is
  soft), and the painter refused that while painting: its whole-footprint wet gate failed on a sky wash (only 76% of
  the footprint moist). The label is now "wet on dry"; the softness comes from the recipe's sky lanes and graded
  passes, not from a wet-in-wet request.
- `trumbull.stone` (everything below the sky): wet on dry. Broad pale warm wash per plane first, then half-tones on dry
  paper, then ONE shadow glaze (ultramarine + burnt sienna, the Y1 rule in the painter) running across wall, window and
  roof edges. Block courses come from the recipe's stone-block tokens (irregular blocks, 4 mm), as paper tooth and
  broken contact, not individual strokes (a stone is ~4 mm = 17 cells at 1200 px, so a wash-sized mark, not a dot).
- `trumbull.foliage` (lower 42%): yellow-green tree and dark shrubs: soft edged masses, wet on dry with the sapgreen
  of the recipe, no leaf-by-leaf marks (a leaf is under 4 cells).
Style is `precise-watercolor` throughout, no region override: an override would repaint whole colour clusters (windows
and roofs share the sky's cool cluster) with another style's moisture.

## Resolution decision
Smallest features: window mullion ~1 px of the 300 px target = 0.93 mm = 4 cells at 1200 px (at threshold), lancet
windows 3-5 px wide = 12-20 cells. Mullions, jambs and arch hoods are lines thinner than a brush body: the INK-AND-WASH
question, so they go to the pen layer over a value wash. Walls, roofs, sky, tree are the WASH question.

## Drawing (opening-lines.json, closing-lines.json)
The q-trace-ink output on this target is stone texture (hundreds of wobbly fragments, no architecture), so the
drawing is authored: ~120 straight-ish lines measured on a grid over the target (target px) and then pulled onto the
nearest real luminance edge (max 1.6 px) at the authored vertices only, so segments stay straight.
- Opening (44 lines, sparse, drawn before any wash, light pressure by the painter's own cap): tower corners and caps,
  gable rakes, slate edges, string courses, the two pointed windows, doorway arches, street poles, sign board,
  signals, rose window. This is the structure a painter pencils before washing.
- Closing (all 118 lines, last, on dry paint): adds window frames, mullions, lancet arches, tower slots. Selective:
  windows and edges only, nothing on the sky, tree or lit wall faces, no stone-block hatching.
Ink pigment: the base sepia ink (`--inkk .396,.481,.619`, `_sep8`), unchanged. Widths 1.3-2.0 px, weights 0.65-0.85
(all at or above the closing pen's 0.6 floor so none are dropped).

## Paper state, moisture, load
Sky: sheet damp, glossy to sheen, watery load, one pass with the recipe's sky lanes; stone and tree washes: dry
paper, medium water, medium load, each plane one connected passage; shadow glaze: fully dry sheet, medium-thin load,
crossing region boundaries; windows/accents: dry paper, thick dark, small flat; ink: dry.

## Protected lights
Painter-held near-paper target lights (cloud whites, the white pole, the pale sign emblems) are kept by the painter.
No rectangular reserves: the cloud edges are soft and the pole is a thin straight light that the painter's own
segmentation already isolates; a rectangle on either would cut an unsupported straight seam.

## Edges
Hard where the target is hard (roof edges, tower corners, window openings, the shadow recess), softened one side only
on the sky/cloud and the tree. No heavy ink over blur: pen only where paint edges are already dry and crisp.

## Values
Recipe defaults (darkgain 1.3, 4 mid layers), tuned on this subject by V096; target darks are real (navy glass,
sign) so no lightening.

## What would show failure
Banded or tiled sky; wet sky bleeding into the tower tops; stone patchwork or noisy flecks instead of broad warm
planes; shadow glaze stopping at region edges; windows blurred; pen lines floating off the painted edges; heavy
wobbly ink; the tree turning into dots; white pole lost under wash.

## What happened when it was painted
- First start: the painter refused the plan at the first sky wash (wet-on-wet label, whole-footprint gate), so I
  removed the label and started once more from a clean sheet. The next admission check was killed once by the machine
  (exit 137, no plan error) and I started again; the third attempt ran to the end.
- The painter laid 98 passes (80 planned, 18 of its own touch-up passes), about 14,200 brush strokes, then the
  closing pen with the authored lines. Order seen: pale ochre/sienna ground over the stone with the window openings
  and sunlit blocks as paper, the blue sky wash with cloud whites held, mid planes, then the value 4 to 5 glazes that
  put in the navy glass, the sign, the shadow recess and the tree.
- Failure signs I saw in the finished sheet: the stone is mottled (camouflage-like) with paper-white speckle,
  especially on the left facade; the shadow recess between the tower and the gable block has an olive-green cast from
  the recipe's sap green; the street tree is a loose yellow-orange mass and reads less green than the target; fine
  window tracery is soft and the pen lines are thin, so they define frames and roof edges but cannot rescue the
  blotchy stone. These come from passes the recipe lays on its own; I did not change them after seeing them because
  the passes were already on the paper and I did not revise settings for the remaining ones.

## What I changed vs. the base recipe, and why
- subject `Y1` (the registry code the recipe was tuned on) so the stone texture and shadow-glaze rules apply;
- families (sky / stone / foliage) that label the painter's colour segments; no recipe tokens or painter settings
  changed (V096 as is). A wet-on-wet sky label was tried and refused by the painter's gate, so it was removed;
- authored architectural drawing instead of the tracer's output, because the tracer returns texture, not structure;
- a first authored file had four closed rectangles (sign board, signals, utility box) collapse to zero length, so the
  painter drew nothing for them; fixed before the second start.
