# SF (South France hillside village): round V5, try 1 of 3

Requested style: urban sketch, pen plus light wash. Whole plate `urban-sketch` (the painter raises its value ladder to
the ink-and-wash floor: one light wash band and one shadow-glaze band), no per-region style overrides, so no style seams.

## Reading the reference (value thumbnail)

- Lights (value 1): sunlit ochre terraces upper left, lit faces of the stone towers, the pale path and clearings.
  They are warm cream (about 232,204,138), not white. In an urban sketch they stay paper or take the first pale wash.
- Mid lights (2): yellow-green foreground pine crown, grey-green olives, terracotta roofs, distant blue-green hills.
- Mids (3): olive/oak masses on the slope, violet shadow sides of the towers.
- Darks (4): cypresses, the shadowed canopy hollows, recesses under the eaves, the pine trunk and branches.
- Focal point: the three stone tower houses right of centre (x 0.66 to 0.97, y 0.33 to 0.82). Secondary: the
  foreground pine, the cypress verticals.

## Regions (families label the painter's own segmentation; one style for all)

| family | cue | resolution question | move | layer |
|---|---|---|---|---|
| village-focal | towers, terracotta roofs, violet shadow sides | ink and wash (windows, eaves are 1-3 target px = 1-3 mm) | pale wash wet on dry, shadow glaze on dry, closing pen | 1, 4, ink |
| village-upper | smaller houses and cypresses | ink and wash | pen outline, pale wash | opening, 1 |
| distant-hills | blue-green hills | wash | pale flat wash, no pen beyond one faint ridge line | 1 |
| terraces | sunlit ochre terraces | wash, mostly paper | pale ochre wash or paper | 1 |
| olive-slope | grey-green masses, darker shadow sides | wash plus ink at junctions | wash, then shadow glaze across adjoining masses | 1, 4 |
| pine-foreground | yellow-green crown, dark trunk/branches | ink and wash (branches are 1 px lines) | pale wash, glaze, pen branches last | 1, 4, ink |
| left-slope / lower-right | olives on ochre ground, path, shrubs | wash | pale wash, glaze where the canopies shade | 1, 4 |

Smallest features: windows and holes 2-4 target px (one target px = 0.92 mm = 4 output px), so at 1216 px they are 8-16
cells: enough for a pen mark but not for a separate wash; they are ink.

## Drawing

- Ink: the urban-sketch profile draws in black ink (material log: "black ink", K .62; the base `_sep8` is skipped by the
  painter for this reason). Declared black, kept thin (0.1 to 0.4 mm).
- Opening pen (hand-authored, 55 paths): roof lines and walls of every house as straight segments,
  cypress flame silhouettes in one stroke each, the pine trunk, loose scalloped crown contours on the pine and three
  canopies, terrace edges and walls, path edges, one faint distant ridge. Sparse, structural, no foliage hatching.
- Closing pen (121 paths, on dry paint): the confident pen layer. After look 1 the opening read as a faint pencil-like
  lay-in (0.1 mm hairlines), so the closing restates the structure (roofs, walls, cypress silhouettes, pine trunk, terrace
  walls, path edges, crown contours) at near-full pressure (weight .95, 0.4 mm nib; crowns and paths .75), and adds the
  focal details: eave shadow lines, windows and holes, the string course, tower shadow-side edge, cypress shadow-side
  strokes, plus traced target-supported branch lines of the pine and the olives (q-trace-ink at .12). Lay-in, washes,
  then pen (as Steel does). The painter drops closing lines with too little value contrast under them, so nothing
  lands in flat lights.

## Lights and reserves

- Reserved paper: the sunlit wall of the right tower below its string course; a pale path glint in the foreground.
- The painter keeps its own near-paper lights (the brightest terrace cream).

## Paper share and vignette

- Planning check: the plan alone covers 99.6% of the sheet; the urban-sketch artworks leave about 71% as paper. A
  modest ragged vignette (`--vignette 0.04`, painter defaults for softness and wander) leaves a wandering white margin
  so the wash stops before the sheet does, as a sketcher's does. The subject is not faded by it; pens outside it drop.
- Palette: the painter's own box pick (cerulean, hansa yellow, sap green, quinacridone rose) fits the target at 2.1 dE;
  rose plus hansa gives the terracotta, rose plus cerulean the violet shadow sides. No `--paints` override.

## Glazes

- One shadow band (ink-and-wash floor band 4) laid on dry paint across the tower shadow sides, the canopy hollows and
  the cypresses; it crosses family bounds.

## Stage intents

- After the opening: a sparse black-ink line sketch reading as the village, cypresses and pine.
- After the light wash: pale flat colour, plenty of paper, roofs warm, greens yellow-green and grey-green.
- After the glaze: shadow sides and cypresses darker; the towers read as cubes.
- Closing: crisp pen at the towers and pine; no ink in the lights.

## Failure signs

- Washes filling the whole sheet so it reads as a full watercolour instead of a sketch; ink as dark fills; the
  towers losing their cube shading; scalloped pen lines reading as zig-zags; opening lines dropped by the reserve filter.

## Lessons for the next try

- The big ground passages (11 passages over 80% of the sheet, one per pigment) leave the same uncovered diagonal lane
  through the centre (x about 0.40 to 0.55) with the shaped gestures, whatever the dry-brush setting. `_spl6` covers
  it but makes a brick pattern. Untested levers: `_lad` (lane adapt) with the stroke plan, `_lf` (feathered loads), or
  splitting that passage with family/reserve geometry so no single gesture spans it.
- `--drytooth 1` from the first wash is right for this target: its speckled lights otherwise turn 8 of the 11 big
  ground passages into dry brush.
- The opening draws in a faint graphite-like line; the closing file carries the confident pen.

## V5 changes

- First try of the round: no previous critique. Choices made from the reference and the requested style.
- Revision 7 (after pass 6): `_spl6` did fill the stripe with rose, but it laid the whole ground as a horizontal
  brick pattern (6 mm lanes, 30 mm strokes, darker overlaps at every lane and stroke end): a ruled, mechanical texture
  worse than the stripe. Dropped again from pass 7 so the cerulean ground, the dark passes and the touch-ups go back to
  shaped gestures. The rose brick pattern stays under the later layers.
- Revision 6 (after pass 3 of the restart): the stripe formed again, identically, with no dry brush at all, so it
  is deterministic shaped-mark geometry: the long diagonal gestures of the big ground passage leave an uncovered lane.
  `_spl6` (stroke plan: lanes 6 mm apart over each passage footprint) replaces those gestures from pass 4 on, so the
  rose and cerulean grounds cover the lane; the value-4 hansa and touch-ups supply the missing yellow there.
  (V095 rejected `_spl6` with `_wre15` as noisy on hair; this subject has no hair, and `_wre15` is not used.)
- Restart: before revision 4 could apply, the cloud painter lost its session and began again from a clean sheet with
  the original plan files (the opening drawing redrawn, 0 strokes). At that first stop all current settings were applied
  at once (bold closing pen, `--drytooth 1`, `_tp3`), so the ground washes go down as flat wet-on-dry washes from
  pass 1 rather than being patched after the fact. The stage log below records the first attempt.
- Revision 4 (after pass 11, not applied: the painter was restarting): the stripe stayed white through the cerulean ground as well, so it is not dry brush but
  a gap in the lane geometry of the big ground passages (ragged left edge where a long stroke runs dry, crisp right edge
  where the next loaded stroke starts), repeated per pigment. `_tp3` (three touch-up rounds instead of two) gives the
  painter more shape-level corrective glazes over the shapes still lighter than the reference.
- Revision 3 (after pass 6): the stripe survived the rose ground (it is a dry-brush lane that barely deposits) and pass 9
  still listed 4 dry-brush passages, so `--drytooth 1` switches source-inferred dry brush off: urban sketch wants flat
  pale washes, and the cerulean ground fills the stripe so its value joins its neighbours.
- Revision 2 (after pass 3): the hansa ground went in as dry brush (8 of 11 big passages; the target's speckled lights
  read as paper tooth), leaving a broken white diagonal stripe through the centre. `--drytooth 0.2` (default .06) so the
  remaining ground passes lay as connected flat washes (skill: facade and ground planes are washes; scratchy first
  washes are a known failure). The touch-up round should correct the yellow missing in the stripe.
- Revision 1 (at the first stop): closing pen restates the structure at full pressure because the opening was faint.
