# Methods, techniques and tuned settings

The painter's code in `src/paint/` is grouped by purpose. This page is an index: one line per item, with the flag that turns it on or off. Each module's header comment has the detail.

- [General methods](#general-methods) (`src/paint/methods/`) are generic watercolor methods: paper, palette, paint order, washes, glazes, layers and the drawing.
- [Targeted techniques](#targeted-techniques) (`src/paint/techniques/`) handle one kind of feature or surface: faces, dark fur, curly dog coats, foliage, skies, sea, sand and buildings. Most are off unless a flag turns them on.
- [Tuned settings](#tuned-settings) (`src/paint/tuned/`) were fitted to specific benchmark images. They can help those images and hurt others.

The default recipe (`src/paint/recipe.mjs`) is a preset of painter settings. A flag given after the recipe on the command line wins, so each off value below can be added to any run. `--recipe none` turns off the whole recipe. The default, `--recipe general` and `--recipe combined` are the same general process. The painting plan chooses the drawing, washes and order ([plan format](plan-format.md#value-plan-input)). Fitted settings need an explicit preset. See [linework.md](linework.md) for drawing-stage choices.

Subject ids name benchmark images. `Y1` is `examples/targets/trumbull.jpg` with `examples/plans/trumbull-values.json`, and `subject-e` is a second Trumbull-derived subject. subject-b, subject-c, subject-d, subject-a and the architecture photograph are private benchmark images.

"Not reached" means only tests import the module. "Helper" means other modules call it and it has no flag of its own.

## General methods

Default recipe flags, with the value that turns each off:

- `--palettewide 1`: 3 to 6 palette paints chosen per area of the picture. Off: `0`.
- `--physical 1`: brush sizes, water and loads from real brushes (`src/paint/brushes.json`). Off: `0`.
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
- `--layerhue 1`: keeps wash layers apart by colour group. Off: `0`.
- `--drawing first`: the drawing goes down first, in pencil unless the plan or the automatic stage choice asks for ink. Either can add a closing pass. Off: `none`.
- `--frames 8`: about 8 recorded frames of the washes. Off: `40`.
- `--marks 1`: records every stroke to `marks.json`. Off: `0`.
- `--finaldarks 0`, `--sourcelines 0 --linesource none`: final darks and automatic source lines stay off until a plan or flag asks for them.
- `--subjectseam 0.5`: a wash is cut at a subject edge only where half the cut follows a colour edge. Off: `0`.
- `--smallmarks 1`: small darks under the minimum shape are laid once, last. Off: `0`.
- `--smallmarklights 0`: the small-mark rule reserves no small lights. A value such as `120` keeps lights up to that many cells.
- `--washjoin 1`: a colour-domain piece under the minimum shape joins the neighbouring wash. Off: `0`.
- `--undercover 0`: a passage its sweeps only partly cover is not charged up. `1` charges it up.

The plan's `washes` section adds the wash flags ([plan format](plan-format.md#the-washes-section)):

- `--washsession 1`: passages laid in wet sessions; `connected` sessions set `2`. Off: `0`.
- `--huechroma 30`: splits the cool, green and warm families into saturated and muted halves. An orange coat and a grey wall get separate mixes. Off: `0`.
- `--passcap 0.5`: charges each passage at the median of its cells' demand and carries what each cell still needs to the next band. Off: `0`.
- `--maskmm 2`: a carried glaze goes where the demand left, averaged over 2 mm, says it should. Off: `0`.
- `--lightfamilies 1`: light washes laid by colour family. Off: `0`.
- `--palelights 0.16`: pale planes get one clean first wash, and no middle layer or glaze crosses them. Off: `0`.

The default recipe sets no drawing amount or weight. Each subject's plan chooses them in its `drawing` section ([plan-format.md](plan-format.md#value-plans-the-drawing-section)).

Modules, with their flags:

- `film-timeline.mjs` (`--timeline`, `--phaselabels 1`): re-times recorded frames to the target's stages.
- `output-directory.mjs` (always on): refuses an `--out` directory that already holds files.
- `recipe.mjs` (always on): puts the recipe's flags in front of the command line.
- `run-cache.mjs` (always on): caches slow, input-determined steps on disk.
- `styles/loader.mjs` (`--valueplan <json>`): loads watercolor style profiles and subject mappings.
- `methods/brushes.mjs` (`--physical 1`): sizes brushes from real ones and splits strokes where water runs out.
- `methods/charge-layers.mjs` (`--charge 1`, parked): a region's middle layers laid in one wet session.
- `methods/colour-budget.mjs` (`--colourbudget 1`, `--fwrepay 1`): defers colour held back from a pale first wash to a later glaze.
- `methods/crisp-edges.mjs` (`--crisp 1`): wet-on-dry glazes stopped at hard region edges.
- `methods/detail-scale.mjs` (`--detailscale k`, `--detailseg 1`): the minimum shape shrinks with the target's 1 to 3 mm detail, optionally confined to focal foreground segments.
- `methods/detail-passes.mjs` (`--detailpasses`, `--detailtrim`): late small passages where the detail is.
- `methods/drags.mjs` (`--drags 1`, `--dragbox`): nearly dry flat-brush drags inside given boxes.
- `methods/drawing-file.mjs` (`--drawingfile`, `--drawinglast`): draws a selected line file whole.
- `methods/drawing-hand.mjs` (helper): joins drawing lines into gestures with tapered ends.
- `methods/drawing-hybrid.mjs` (helper): redraws traced gestures along the drawing file's lines.
- `methods/drawing-logic.mjs` (`--drawinglogic 1|2|3`): inking logic run over a selected drawing file.
- `methods/drawing-rank.mjs` (helper): ranks a dense drawing file's lines into tiers.
- `methods/drawing-scribble.mjs` (helper): long open lines with dark masses as looping scribble.
- `methods/drawing-stages-auto.mjs` and `methods/drawing-choice.mjs` (`--drawingstages auto`, the default): pencil prep, ink prep and ink finish chosen per picture. Off: `off`.
- `methods/drawing.mjs` (not reached): pencil drawing of the figure's edge and big darks.
- `methods/final-darks.mjs` (`--finaldarks 1`, `--fdminmm2`, `--fdtilemm`, `--fdgain`): finds the final-dark cells and groups them into families for one shape-level look each. Off by default.
- `methods/first-wash.mjs` (`--firstwash 1`): a paler opening wash split at the subject mask.
- `methods/flecks.mjs` (`--fleckshape 1`): small reserved lights as broken paper flecks.
- `methods/ink-res.mjs` (`--inkres N`): pens drawn on a finer sheet and averaged down.
- `methods/ladder-seg.mjs` (`--ladderseg`): leaves glazes on ground segments to the washes.
- `methods/layer-cuts.mjs` (`--layerlocal 1`, `--midlayers N` above 4): middle-layer cut levels per colour region; evenly spaced cuts for more layers.
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
- `methods/outline-medium.mjs` (always on): resolves `--outlinemedium`, graphite by default; `auto` chooses ink or pencil from the target.
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
- `methods/seg-ink.mjs` (`--segink 1`): foreground segments as the ink subject.
- `methods/segment-washes.mjs` (`--segwash 1`): mop wash regions from labelled object regions.
- `methods/shape-deficit.mjs` (always on): charges each passage from its whole shape's colour difference.
- `methods/shape-local-charge.mjs` (`--modpaintplanes`, refused by the CLI): shares remaining pigment among planned shapes.
- `methods/shape-refit.mjs` (`--touchpoints R`, `--shaperefit R`): planning shapes for the touch-up passes.
- `methods/shapes.mjs` (`--shapes N`): each dark region laid once as a loaded mass.
- `methods/small-marks.mjs` (`--smallmarks 1`): catchlights and lit gaps under the minimum shape kept as paper; small darks laid once, last.
- `methods/soft-edges.mjs` (`--softwet mm`, `--softwetwater`, `--softwetsteps`, `--softwetphases`, parked): clean water past a passage's soft edges before its colour.
- `methods/smoothup.mjs` (`--keepsmooth`, `--foliagesmooth`): smooth-edged masks on the finer sheet grid.
- `methods/soft-mask.mjs` (`--softmask`): thins masking fluid at a light's rim.
- `methods/stroke-budget.mjs` (`--passmerge 1`, `--strokebudget N`, `--focusmap`): limits total strokes toward a focus.
- `methods/stroke-plan.mjs` (`--strokeplan 1`): a passage as overlapping parallel sweeps.
- `methods/subject-order.mjs` (`--subjectorder s`, `--subjectseam s`): subject-by-subject order; a wash is cut at a subject edge only along a colour edge.
- `methods/touch-cover.mjs` (`--touchcover c`, parked): a touch-up whose sweeps touch under share c of its shape is left out.
- `methods/subject.mjs` (not reached): the subject's big shapes in wash order.
- `methods/subject-clusters.mjs` (`--subjectwash 1`): SAM regions cut into colour and value clusters, with wash and shadow groups and each subject's own lights.
- `methods/subject-washes.mjs` (`--subjectwash 1`): cuts the value plan's and the ladder's passes at the wash groups and lays subject lights early.
- `methods/target-regions.mjs` (always on): colour and value regions for the value planner.
- `methods/wash-plan-image.mjs` (`--washplanpng 1`): the wash plan as pictures, with the segment boundaries.
- `methods/well.mjs` (helper): a non-negative paint mix for a wanted colour.
- `methods/wetdry.mjs` (always on): paper wetness, brush load and waiting for the paper to dry.
- `methods/wash-join.mjs` (`--washjoin 1`): a colour-domain piece under the minimum shape joins the neighbouring passage instead of leaving a bare-paper shard.

`--holefill` and `--holerim` work around a known drying weakness. They are off by default and run on the CPU and the GPU. See [open problems](future-ideas.md#edge-drying-that-knows-how-much-water-there-is).

## Targeted techniques

Default recipe flag:

- `--shapedmarks 1`: each value plane as one flat-brush stroke. Off: `0`.

The `architecture` preset adds three sky flags. `--skylanes 1` lays large cool planes as horizontal wet sweeps. `--skyblue 1` adds a mottled second blue. `--skysplit 1` lays the sky's pale wash apart from warm ground.

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

Some settings were fitted by self study on a few benchmark images, mostly Trumbull (`Y1`). On those images they help. On other images they can hurt: heavy darks, pale washes, stone blocks on skin.

They are contained this way:

- The default recipe sets only general methods. No value in it was fitted to one image.
- Fitted values live in `src/paint/tuned/`. They run only through a named preset or the `v096` recipe.
- A value plan opts in with `"presets": ["architecture", "glaze-gains"]`. The command line opts in with `--recipe default+architecture`.
- No painting code outside `src/paint/tuned/` checks a subject id. `src/paint/overfit.test.mjs` fails if it does, or if the default recipe sets a tuned flag.
- `--recipe v096` runs the V096 recipe: the general methods with sky lanes and every tuned flag below, on every subject.

| Preset | Flags | For |
|---|---|---|
| `architecture` | `--skylanes 1 --skyblue 1 --skysplit 1 --skylanemm 6 --skylanestep .8 --skyfloc .5 --groundglaze 1 --stoneblocks 0.6 --stoneblockamt 0.2 --stoneblockmm 4 --stoneirregular 1 --recesses 1 --recesslayers 2 --recessshare .75 --recessclean 1 --texvariety 0.8` | Buildings under a sky |
| `glaze-gains` | `--darkgain 1.3 --coolgain 1.3 --touchgain .6` | Stronger shadow and cool glazes, lighter touch-ups |

`examples/plans/trumbull-values.json` names both presets.

Preset flags, with the off value, the images they were fitted on and the risk for other subjects:

- `--darkgain 1.3`: 30% more paint in shadow glazes. Off: `1`. Y1, subject-e; high.
- `--coolgain 1.3`: 30% more paint in cool cells. Off: `1`. Y1, subject-e; high.
- `--touchgain .6`: strength of touch-up glazes. Off: `.8`. Y1, subject-e; medium.
- `--skylanemm 6`: 6 mm sky sweep radius. Off: `3`. Y1, subject-e skies; medium.
- `--skylanestep .8`: closer, overlapping sky sweeps. Off: `1.5`. Y1, subject-e skies; medium.
- `--skyfloc .5`: softer, larger sky mottle. Off: `0`. Y1 sky; low.
- `--groundglaze 1`: cool low ground as one shadow glaze. Off: `0`. Y1; high, since any cool lower third turns into shadow.
- `--stoneblocks 0.6`: pale cut-stone block hints on warm walls. Off: `0`. Y1; high, since the wall test also matches skin, sand, wood and fur.
- `--stoneblockamt 0.2`: pigment per stone block glaze. Off: `.18`. Y1; high.
- `--stoneblockmm 4`: stone block row height. Off: `2.6`. Y1; high.
- `--stoneirregular 1`: irregular stone corners. Off: `0`. Y1; high.
- `--recesses 1`: dark windows and doors as last accents on the dried wall. Off: `0`. Y1; medium, since any dark cell counts.
- `--recesslayers 2`: dark recesses in two layers. Off: `1`. Y1; low.
- `--recessshare .75`: demand per recess layer. Off: `.5`. Y1; low.
- `--recessclean 1`: no light wash under recesses. Off: `0`. Y1; low.
- `--texvariety 0.8`: varied short texture marks. Off: `0`. Y1 stone, subject-c stubble. It has no effect, since the value planner lays no texture passages.

Modules:

- `tuned/default-flags.mjs` (`--recipe v096`): the tuned flags of the V096 recipe.
- `tuned/presets.mjs` (`"presets"` or `--recipe default+<preset>`): the presets above.
- `tuned/trumbull.mjs` (`architecture` preset or `--recipe v096`): recess, wall and ground constants. Y1, subject-e; high.
- `tuned/dog-coats.mjs` (`--dogpaint`, `--dogcoat wet|dry`): curly dog coat presets. subject-b and private photos; medium, since both assume a black curly coat.
- `tuned/mass-plan.mjs` (`--massplan 1`, `--medium oil`): named masses for the mass planner. One portrait layout; high.
- `tuned/modulation-anatomy.mjs` (`--modulate 1 --modanatomy <file>`): skin and fur regions for modulation. subject-c; low.
- `tuned/olive-families.mjs` (`--passages treelayers`): colour groups for tree layers. One olive tree study; medium.
- `tuned/paint-owned-residual.mjs` (`--modpaintplanes`, refused by the CLI): detail pigment moved into authored polygons. One private image; low.
- `tuned/style-cuts.mjs` (`--practice 1`, `--modulate 1`, `--drawinglogic 3`): thresholds for the practice planner. About 40 artworks; low.
- `techniques/passages/sand.mjs` (`--passages sand`): mark sizes scaled from one beach crop; medium.

Outside the painter, `bench/scripts/pipeline/plan-args.mjs` holds the V4 and V5 base settings, with stone and palette tokens fitted on Y1. The judging scripts in `tools/judge/` list fixed subjects; they do not paint.

## Opt-in experimental controls

- `--pigphys 1`: settling, granulation and flocculation per pigment. `--flocblue`, `--flocgrey`, `--flocviolet`, `--flocearth` and `--flocyellow` take 0 to 1 and override one colour family. An unset value keeps the pigment's own `floc`; an explicit 0 clears it. The families are absorption-channel heuristics, not chemical measurements.
- `--crosshatch 1`: contour-following hatching as a finishing stage.
- `--tonestage 1`: records a paper-colour choice before drawing. `auto` also detects warm source paper. It changes the paper colour and lays no pigment, so it is not a wash.
