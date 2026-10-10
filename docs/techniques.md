# Methods, techniques and tuned settings

The painter's code in `src/paint/` is grouped by purpose. This page is an index: one line per item, with the flag that turns it on or off. Each module's header comment has the detail.

- [General methods](#general-methods) (`src/paint/methods/`) are generic watercolor methods: paper, palette, paint order, washes, glazes, layers and the drawing.
- [Targeted techniques](#targeted-techniques) (`src/paint/techniques/`) handle one kind of feature or surface: faces, dark fur, curly dog coats, foliage, skies, sea, sand and buildings. Most are off unless a flag turns them on.
- [Tuned settings](#tuned-settings) (`src/paint/tuned/`) were fitted to specific benchmark images. They can help those images and hurt others. [src/paint/tuned/README.md](../src/paint/tuned/README.md) covers the overfitting risk.

The default recipe (`src/paint/recipe.mjs`) is a preset of painter settings. A flag given after the recipe on the command line wins, so each off value below can be added to any run. `--recipe none` turns off the whole recipe. Making the default generalize is [future idea 5](future-ideas.md#5-making-the-default-generalize).

Subject ids name benchmark images. `Y1` is `examples/targets/trumbull.jpg` with `examples/plans/trumbull-values.json`, and `subject-e` is a second Trumbull-derived subject. subject-b, subject-c, subject-d, subject-a and the architecture photograph are private benchmark images.

"Not reached" means only tests import the module. "Helper" means other modules call it and it has no flag of its own.

## General methods

Default recipe flags, with the value that turns each off:

- `--palettewide 1`: 3 to 6 palette paints chosen per area of the picture. Off: `0`.
- `--physical 1`: brush sizes, water and loads from real brushes (`data/brushes.json`). Off: `0`.
- `--paperbase source`: paper colour from the target's lightest tenth; `--paperrgb` overrides it. Off: `auto`.
- `--loadedcontact 1`: a loaded brush touches the paper's pits too. Off: `0`.
- `--order painter`: the light-to-dark value planner. Off: `ladder`.
- `--brushchoice 0`: per-passage brush choice stays off.
- `--midlayers 4`: middle values as up to four dried wash layers. Off: `0`.
- `--paperrel 1`: reserves cells close to the paper colour. Off: `0`.
- `--paperlights 1`: finds cream paper as the largest bright region and reserves it. Off: `0`.
- `--paperrgb auto`: the target's own sheet colour when it is cream. No off value; leave it out.
- `--paper coldpress`: cold-press tooth at physical size. Off: `flat`.
- `--paperphysical 1`: paper fibre and relief in millimetres, not cells. Off: `0`.
- `--texture 0`: per-passage dry-brush texture marks stay off.
- `--touchpoints 2`: two touch-up glaze passes on shapes that read too light. Off: `0`.
- `--shadowraw 1`: raw sienna as the warm shadow half when there is no burnt sienna. Off: `0`.
- `--layerhue 1`: keeps wash layers apart by colour group. Off: `0`.
- `--drawing both`: pen line first, closing pen pass last. Off: `none`.
- `--frames 8`: about 8 recorded frames of the washes. Off: `40`.
- `--marks 1`: records every stroke to `marks.json`. Off: `0`.

The default recipe sets no drawing medium, amount or weight. Each subject's plan chooses them in its `drawing` section ([plan-format.md](plan-format.md#value-plans-the-drawing-section)).

Modules, with their flags:

- `film-timeline.mjs` (`--timeline`, `--phaselabels 1`): re-times recorded frames to the target's stages.
- `output-directory.mjs` (always on): refuses an `--out` directory that already holds files.
- `recipe.mjs` (always on): puts the recipe's flags in front of the command line.
- `run-cache.mjs` (always on): caches slow, input-determined steps on disk.
- `styles/loader.mjs` (`--valueplan <json>`): loads watercolor style profiles and subject mappings.
- `methods/brushes.mjs` (`--physical 1`): sizes brushes from real ones and splits strokes where water runs out.
- `methods/colour-budget.mjs` (`--colourbudget 1`, `--fwrepay 1`): defers colour held back from a pale first wash to a later glaze.
- `methods/crisp-edges.mjs` (`--crisp 1`): wet-on-dry glazes stopped at hard region edges.
- `methods/detail-passes.mjs` (`--detailpasses`, `--detailtrim`): late small passages where the detail is.
- `methods/drags.mjs` (`--drags 1`, `--dragbox`): nearly dry flat-brush drags inside given boxes.
- `methods/drawing-file.mjs` (`--drawingfile`, `--drawinglast`): draws a selected line file whole.
- `methods/drawing-hand.mjs` (helper): joins drawing lines into gestures with tapered ends.
- `methods/drawing-hybrid.mjs` (helper): redraws traced gestures along the drawing file's lines.
- `methods/drawing-logic.mjs` (`--drawinglogic 1|2|3`): inking logic run over a selected drawing file.
- `methods/drawing-rank.mjs` (helper): ranks a dense drawing file's lines into tiers.
- `methods/drawing-scribble.mjs` (helper): long open lines with dark masses as looping scribble.
- `methods/drawing.mjs` (not reached): pencil drawing of the figure's edge and big darks.
- `methods/first-wash.mjs` (`--firstwash 1`): a paler opening wash split at the subject mask.
- `methods/flecks.mjs` (`--fleckshape 1`): small reserved lights as broken paper flecks.
- `methods/ink-res.mjs` (`--inkres N`): pens drawn on a finer sheet and averaged down.
- `methods/ladder-seg.mjs` (`--ladderseg`): leaves glazes on ground segments to the washes.
- `methods/lay.mjs` (not reached): one passage from one mixing well, in sweeps.
- `methods/light-to-dark.mjs` (`--order painter`): five light-to-dark value bands per pigment.
- `methods/lights-shape.mjs` (`--lightsbreak`): breaks large lights into flecks along the paper relief.
- `methods/local-lights.mjs` (`--locallights`): masks each segment's lightest share before any wash.
- `methods/look.mjs` (not reached): reads what the sheet still lacks to choose the next act.
- `methods/mass-budget.mjs` (`--massbudget 1`): full wash budget for broad neutral dark masses.
- `methods/mass-wash.mjs` (`--massplan 1`): a few coloured masses laid back to front.
- `methods/masses.mjs` (`--masses N`): opening broad mop washes.
- `methods/material-profiles.mjs` (always on): ink and graphite drawing materials.
- `methods/ml-lines.mjs` (`--mllines 1`): inner lines from a trained line model.
- `methods/modulate.mjs` (`--modulate 1`): thins washes in highlight and detail areas.
- `methods/mop-lanes.mjs` (helper): a mop's overlapping, slightly curved sweeps.
- `methods/outline-medium.mjs` (always on): chooses ink or pencil for the drawing.
- `methods/painter-order.mjs` (`--order legacy-painter`): reorders passes into a painter's order.
- `methods/painter.mjs` (not reached): a look, decide, paint loop.
- `methods/palette.mjs` (not reached): mixtures in wells reused at several dilutions.
- `methods/passage-brush.mjs` (`--brushchoice 1`): a real brush per value passage.
- `methods/passage-schedule.mjs` (helper): schedules passage modules by phase.
- `methods/passages.mjs` (`--passages <names>`): loads the named section passages.
- `methods/pencil-line.mjs` (`--penpencil <stage.png>`): an opening dry-pencil drawing.
- `methods/pencil-stage.mjs` (`--pencilstage 1`, `--pencilerase 1`, `--prepfade 1`): grows, erases or fades the pencil drawing.
- `methods/pigment-physics.mjs` (`--pigphys 1`): settling, granulation and flocculation per pigment.
- `methods/practice-keyframes.mjs` (`--practice 1 --practicemode target`): the practice plan's four stages.
- `methods/practice-loose.mjs` (`--practice 1`): fast light washes, then dry-brush details.
- `methods/practice-paint.mjs` (`--practice 1`): lays the practice plan's layers.
- `methods/practice-plan.mjs` (`--practice 1`): plans paint in light-to-dark layers.
- `methods/practice-regions.mjs` (helper): practice regions bounded by the drawing's lines.
- `methods/practice-style.mjs` (`--practice 1`): measures the target's mix of ink, dry brush, wash and paper.
- `methods/preparation-binding.mjs` (`--preparationbinding <file>`): pencil paths from a hash-checked preparation file.
- `methods/reviewed-whole-registration.mjs` (helper): scales a reviewed drawing onto the plan grid.
- `methods/seg-ink.mjs` (`--segink 1`): foreground segments as the ink subject.
- `methods/segment-washes.mjs` (`--segwash 1`): mop wash regions from labelled object regions.
- `methods/shape-deficit.mjs` (always on): charges each passage from its whole shape's colour difference.
- `methods/shape-local-charge.mjs` (`--modpaintplanes`, refused by the CLI): shares remaining pigment among planned shapes.
- `methods/shape-refit.mjs` (`--touchpoints R`, `--shaperefit R`): planning shapes for the touch-up passes.
- `methods/shapes.mjs` (`--shapes N`): each dark region laid once as a loaded mass.
- `methods/smoothup.mjs` (`--keepsmooth`, `--foliagesmooth`): smooth-edged masks on the finer sheet grid.
- `methods/soft-mask.mjs` (`--softmask`): thins masking fluid at a light's rim.
- `methods/stroke-budget.mjs` (`--passmerge 1`, `--strokebudget N`, `--focusmap`): limits total strokes toward a focus.
- `methods/stroke-plan.mjs` (`--strokeplan 1`): a passage as overlapping parallel sweeps.
- `methods/subject.mjs` (not reached): the subject's big shapes in wash order.
- `methods/target-regions.mjs` (always on): colour and value regions for the value planner.
- `methods/well.mjs` (helper): a non-negative paint mix for a wanted colour.
- `methods/wetdry.mjs` (always on): paper wetness, brush load and waiting for the paper to dry.

`--holefill` and `--holerim` work around a known drying weakness. They are off by default and run on the CPU only. See [future idea 8](future-ideas.md#8-edge-drying-that-knows-how-much-water-there-is).

## Targeted techniques

Default recipe flags:

- `--shapedmarks 1`: each value plane as one flat-brush stroke. Off: `0`.
- `--skylanes 1`: large cool planes as horizontal wet sweeps. Off: `0`.
- `--skyblue 1`: a mottled second blue for the sky. Off: `0`.
- `--skysplit 1`: the sky's pale wash laid apart from warm ground. Off: `0`.

Modules:

- `techniques/dark-mass-shape.mjs` (helper): a dark mass's shape and fur curl paths.
- `techniques/dark-mass.mjs` (`--darkmass <segments|auto>`): black fur and dark surfaces in four steps.
- `techniques/dog-locks.mjs` (helper): a curly coat over masked light locks.
- `techniques/dog-paint.mjs` (`--dogpaint`): a black curly dog in loaded, dried blots.
- `techniques/dog-ringlets.mjs` (helper): ringlets with pale sheen crescents.
- `techniques/dog-scribble.mjs` (helper): a curly coat as looping pen scribble.
- `techniques/dog-strands.mjs` (helper): long wavy pen strands.
- `techniques/face-detail.mjs` (`--facedetail 1`): eyes, lids, nostrils and mouth with a small nib.
- `techniques/face-planes.mjs` (`--faceplanes 2|3`): the face as two or three soft value planes.
- `techniques/lit-planes.mjs` (`--litplanes`): skin cut into lit, half and shadow planes.
- `techniques/passages/architecture-plan.mjs` (helper): architecture regions from reference polygons.
- `techniques/passages/architecture.mjs` (`--passages architecture`): building and sky planes.
- `techniques/passages/dog.mjs` (`--passages dog`): a dark-coated dog with edge flicks.
- `techniques/passages/foliage.mjs` (`--passages foliage`): a hillside of bushes, light to dark and broken.
- `techniques/passages/sand.mjs` (`--passages sand`): a pale warm wash with dry-brush drags.
- `techniques/passages/sea.mjs` (`--passages sea`): a graded sea band with a masked foam line.
- `techniques/passages/sky.mjs` (`--passages sky`): a wet-in-wet sky with lifted clouds.
- `techniques/passages/treelayers.mjs` (`--passages treelayers`): background trees in tiers.
- `techniques/passages/trees.mjs` (`--passages trees`): a far treeline of round-brush dabs.
- `techniques/shaped-marks.mjs` (`--shapedmarks 1`): flat-brush planes, sky sweeps and short texture marks.
- `techniques/subject-local.mjs` (`--subjlocal <stage.png>`): the subject's first wash in local colour, wet into wet.
- `techniques/subject-tint.mjs` (`--subjtint <stage.png>`): a pale local colour per subject region.

## Tuned settings

Default recipe flags, with the off value, the images they were fitted on and the overfitting risk for other subjects:

- `--darkgain 1.3`: 30% more paint in shadow glazes. Off: `1`. Y1, subject-e; high.
- `--coolgain 1.3`: 30% more paint in cool cells. Off: `1`. Y1, subject-e; high.
- `--skylanemm 6`: 6 mm sky sweep radius. Off: `3`. Y1, subject-e skies; medium.
- `--skylanestep .8`: closer, overlapping sky sweeps. Off: `1.5`. Y1, subject-e skies; medium.
- `--skyfloc .5`: softer, larger sky mottle. Off: `0`. Y1 sky; low.
- `--violetshadow 1`: more ultramarine in shadows. Off: `0`. Y1 only; low.
- `--groundglaze 1`: cool low ground as one shadow glaze. Off: `0`. Y1; high.
- `--stoneblocks 0.6`: pale cut-stone block hints on warm walls. Off: `0`. Y1; high.
- `--stoneblockamt 0.2`: pigment per stone block glaze. Off: `.18`. Y1; high.
- `--stoneblockmm 4`: stone block row height. Off: `2.6`. Y1; high.
- `--stoneirregular 1`: irregular stone corners. Off: `0`. Y1; high.
- `--recesslayers 2`: dark recesses in two layers. Off: `1`. Y1 only; low.
- `--recessshare .75`: demand per recess layer. Off: `.5`. Y1 only; low.
- `--recessclean 1`: no light wash under recesses. Off: `0`. Y1 only; low.
- `--foliagerefit 1`: one leaf mix per connected shape. Off: `0`. Y1 only; low.
- `--texvariety 0.8`: varied short texture marks. Off: `0`. Y1 stone, subject-c stubble; none by default.
- `--touchgain .6`: strength of touch-up glazes. Off: `.8`. Y1, subject-e; medium.

Modules:

- `tuned/architecture-clouds.mjs` (`--passages architecture`): cirrus clouds lifted from a wet sky. Architecture photograph; high.
- `tuned/architecture-reference.plan.json` (`--architectureplan`): polygons for the architecture passage. Only useful for that photograph.
- `tuned/default-flags.mjs` (default recipe): the tuned flags above. Mostly Y1.
- `tuned/dog-coats.mjs` (`--dogcoat wet|dry`): curly dog coat presets. subject-b and private photos; medium.
- `tuned/drawing-caps.mjs` (`--drawsubject`): per-subject pen line limits. subject-c, subject-a; low.
- `tuned/mass-plan.mjs` (`--massplan 1`, `--medium oil`): named masses for the mass planner. One portrait layout; high.
- `tuned/modulation-anatomy.mjs` (`--modanatomy <file>`): skin and fur regions for modulation. subject-c; low.
- `tuned/olive-families.mjs` (`--passages treelayers`): colour groups for tree layers. One olive tree study; medium.
- `tuned/paint-owned-residual.mjs` (`--modpaintplanes`, refused by the CLI): detail pigment moved into authored polygons. One private image; low.
- `tuned/portrait.mjs` (value plan subject subject-c): constants for the subject-c portrait. subject-c; low.
- `tuned/stone-demand.mjs` (`--shapedmarks 1` on Y1): one mix per stone or leaf shape. Y1; low.
- `tuned/style-cuts.mjs` (`--practice 1`, `--modulate 1`, `--drawinglogic 3`): thresholds for the practice planner. About 40 artworks; low.
- `tuned/subjects.json` (value plan subject): the style profile for each benchmark subject. 15 subjects; low.
- `tuned/trumbull.mjs` (default flags, value plan subject Y1): Trumbull recess, wall, ground and palette constants. Y1, subject-e; high.
