# Plan: Trumbull, V5 try 1 (precise architectural watercolor)

## Reading the reference
A Gothic-revival sandstone college seen at three-quarter view in low afternoon sun. Value thumbnail, light to dark:
1. Lights: white cloud (top right corner, a lighter band over the horizon), sunlit stone faces (the gable face, the left tower's
   lit side, the lower right wing wall, the paler quoins and string courses), the bare pale pavement strip at the foot.
2. Pale sky: soft blue, lightest toward the roofline, darker at the top left.
3. Mid values: the warm ochre-tan stone that fills most of the sheet (irregular coursed blocks), the yellow-green street tree.
4. Dark mid: shaded side planes (the vertical shadow strip beside the left tower, the shaded corner pier right of the gable,
   the left wing wall), the blue-grey slate roofs.
5. Darks: window glass (deep navy), the navy street sign, the traffic lights, the door/arch recesses at the base.
Focal point: the gable face with its two big arched windows and the sign in front of it. The towers and the far right wing
are quieter.

## Regions, technique and order (light to dark, a full dry between layers)
- **Sky** (family `trumbull.sky`, baseMove wet on wet): wash question, one connected graded wet passage (the painter's own
  sky lanes and sky-blue split stay on from the base). It is the only region that gets wet-in-wet, because the reference shows soft
  gradients over a large area. Cloud lights are paper: one explicit small reserve on the brightest cloud (top right); the
  painter's own near-paper lights cover the rest. No region style override: the cool colour cluster also holds the window
  glass and slate roofs, and a soft style would have blurred them.
- **Stone** (family `trumbull.stone`, wet on dry): a wash question first. One broad, pale, connected warm wash over all the stone
  (lit faces stay broad and light), dry. Then the mid layers (four, from the base) on dry paper: coursed blocks with hard,
  irregular edges, ochre/raw sienna/hansa. Then one shadow glaze that crosses wall, window and roof edges on each shadow side
  (violet-leaning shadow from the base): the shaded strip by the left tower, the pier right of the gable, the left wing.
  Block texture is the base's stone-block setting (light, irregular): the stone is a dry-brush/texture question only as a
  small share, never a fill of every block.
- **Foliage** (family `trumbull.foliage`, wet on dry): one pale yellow-green mass, then darker sap green on the shaded side,
  with the light gaps kept. Painted after the stone it overlaps, as a person would.
- **Windows, arches, sign, roof slates:** ink-and-wash question. Dark glass is painted last as the darkest accents on dry paper
  (hard edges); the mullions, jambs and arch heads are restored with closing ink. They are far below wash width (a mullion is
  about 1.5 cells at 300 px), so they are drawn, not painted.

## Drawing (ink, base sepia ink)
- Opening drawing (18 lines, sparse, before any wash): the structure that carries the building's position: the gable's two
  slopes and corner pier, the left tower's edges and cornice, the chimney tower's edges, top and cornice, the small left gable,
  the left-wing ledge and three short bits of the gable string course (broken where the windows are), and two roof edges.
  Long single gestures, no windows, no stone texture.
- Closing drawing (110 short lines, weight .6 or more): windows only where they are the focal detail or carry structure:
  the pointed lancets and the two big gothic windows (arch heads, jambs, one mullion, sill), the rectangular mullioned windows,
  the two lower arches, two pole edges and the sign blade. Nothing in the sky, nothing over the lit stone faces.
- The lines are hand-authored from zoomed grid views of the target (checked as an overlay). The stock tracer
  (`tools/q-trace-ink.mjs`) finds no lines on this textured target at any threshold, and a traced stone texture would have been
  noise anyway.
- Pen widths about 1.5 to 2 target px (the base's width gain of 2 applies); pressure taper at both ends of each line.

## Moisture and load
Sky wet-in-wet on damp paper (moist, not glossy). Everything else on fully dry paper: wet on dry for washes, a controlled
medium-watery load for the mid planes, a lower-water load for the shadow glaze, so edges stay crisp (the brief wants less
blur, drier rendering). Nothing wet touches a window: the cool cluster's light-phase passages are pale reflections only.

## Edges
Hard on the roof lines, tower edges and window heads (dry on dry paper). Soft on one side only where a form turns (the round of the
tree, the sky toward the horizon). Lost: the shaded pier into the shaded wall, the far stone into the sky haze.

## Values (what each checkpoint should look like)
- After the first wash: a pale uniform warm tone over the stone, blue sky, nothing dark, paper left at the cloud.
- After the mid layers: stone blocks and the tower/gable planes read; windows still pale.
- After the shadow glaze: the shaded strips and slate roofs sit down; the building turns.
- After the last darks and closing ink: windows navy, sign, arches; structure restated; no ink in the sky.

## What would show failure
Blurred or soaked windows (wet from the sky passage leaking into glass); a stone fill that reads as flat posterised patches;
a hard straight seam from a reserve; grey mud in the sky (warm and cool mixed); ink heavier than the paint under it; dead
parallel mullions; lost white cloud; shadow glaze that stops at region boundaries instead of crossing them.

## V5 changes and why (this is the first try, no feedback yet)
- Recipe: `region_w13` with no token changes. The V096 base was tuned on this subject; I have no evidence yet for any single
  token to be better, so the try measures that base with my own regions and my own drawing.
- Config: three families (sky wet on wet, stone wet on dry, foliage) and no per-region style, one small reserve. Each family is
  descriptive: the painter assigns its own colour clusters to them (clusters 4 and 5 went to sky, 1/3/6 to stone, 2 to foliage).
- Drawing: hand-authored opening and closing lines instead of tracer output (see above). The same lines are not reused for both: the
  opening carries structure only, the closing carries openings.
- If the looks show a fault I will revise the pending passes only (darkgain, ink, a reserve) and say so here.
