# Methods, techniques and tuned settings

The painter's code in `src/paint/` is grouped by purpose. This page is an index: one line per item, with the flag that turns it on or off. Each module's header comment has the detail.

- [General methods](#general-methods) (`src/paint/methods/`) are generic watercolor methods: paper, palette, paint order, washes, glazes, layers and the drawing.
- [Targeted techniques](#targeted-techniques) (`src/paint/techniques/`) handle one kind of feature or surface: faces, dark fur, curly dog coats, foliage, skies, sea, sand and buildings. Most are off unless a flag turns them on.
- [Tuned settings](#tuned-settings): what was fitted to one benchmark subject and removed in 0.3.3, and what fitted values remain.

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
- `--touchpoints 2`: one step-back after the washes dry (any number above 0 is one): a planning shape that reads a whole value step lighter than the subject gets one darkening glaze. Off: `0`. See [How it paints, section 7](how-it-paints.md#7-looks).
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
- `methods/drawing-file.mjs` (`--drawingfile`, `--drawinglast`): draws a selected line file whole.
- `methods/drawing-hand.mjs` (helper): joins drawing lines into gestures with tapered ends.
- `methods/drawing-logic.mjs` (`--drawinglogic 1|3`): inking logic run over a selected drawing file.
- `methods/drawing-rank.mjs` (helper): ranks a dense drawing file's lines into tiers.
- `methods/drawing-scribble.mjs` (helper): long open lines with dark masses as looping scribble, each line laid with the pen's own pressure, speed and pauses.
- `methods/drawing-stages-auto.mjs` and `methods/drawing-choice.mjs` (`--drawingstages auto`, the default): pencil prep, ink prep and ink finish chosen per picture. Off: `off`.
- `methods/drawing.mjs` (not reached): pencil drawing of the figure's edge and big darks.
- `methods/final-darks.mjs` (`--finaldarks 1`, `--fdminmm2`, `--fdtilemm`, `--fdgain`): finds the final-dark cells and groups them into families for one shape-level look each. Off by default.
- `methods/first-wash.mjs` (`--firstwash 1`): a paler opening wash split at the subject mask.
- `methods/ink-res.mjs` (`--inkres N`): pens drawn on a finer sheet and averaged down.
- `methods/ladder-seg.mjs` (`--ladderseg`): leaves glazes on ground segments to the washes.
- `methods/layer-cuts.mjs` (`--layerlocal 1`, `--midlayers N` above 4): middle-layer cut levels per colour region; evenly spaced cuts for more layers.
- `methods/lay.mjs` (not reached): one passage from one mixing well, in sweeps.
- `methods/light-to-dark.mjs` (`--order painter`): five light-to-dark value bands per pigment.
- `methods/light-reserves.mjs` (plan `reserves[]`): an explicit reserve is the target's own light inside its box, not the box; a box with no target light reserves nothing and the log says so.
- `methods/look.mjs` (not reached): reads what the sheet still lacks to choose the next act.
- `methods/mass-budget.mjs` (`--massbudget 1`): full wash budget for broad neutral dark masses.
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
- `methods/practice-style.mjs` (helper for `--modulate`): measures the target's mix of ink, dry brush, wash and paper.
- `methods/preparation-binding.mjs` (`--preparationbinding <file>`): pencil paths from a hash-checked preparation file.
- `methods/seg-ink.mjs` (`--segink 1`): foreground segments as the ink subject.
- `methods/shape-deficit.mjs` (always on): charges each passage from its whole shape's colour difference.
- `methods/shape-refit.mjs` (`--touchpoints R`, `--shaperefit R`): planning shapes for the touch-up passes.
- `methods/shapes.mjs` (`--shapes N`): each dark region laid once as a loaded mass.
- `methods/small-marks.mjs` (`--smallmarks 1`): catchlights and lit gaps under the minimum shape kept as paper; small darks laid once, last.
- `methods/soft-edges.mjs` (`--softwet mm`, `--softwetwater`, `--softwetsteps`, `--softwetphases`): clean water past a passage's soft edges before its colour. Off by default.
- `methods/smoothup.mjs` (`--keepsmooth`, `--foliagesmooth`): smooth-edged masks on the finer sheet grid.
- `methods/soft-mask.mjs` (`--softmask`): thins masking fluid at a light's rim.
- `methods/stroke-budget.mjs` (`--passmerge 1`, `--strokebudget N`, `--focusmap`): limits total strokes toward a focus.
- `methods/stroke-plan.mjs` (`--strokeplan 1`): a passage as overlapping parallel sweeps.
- `methods/subject-order.mjs` (`--subjectorder s`, `--subjectseam s`): subject-by-subject order; a wash is cut at a subject edge only along a colour edge.
- `methods/touch-cover.mjs` (`--touchcover c`, parked): a touch-up whose sweeps touch under share c of its shape is left out.
- `methods/subject.mjs` (not reached): the subject's big shapes in wash order.
- `methods/target-regions.mjs` (always on): colour and value regions for the value planner.
- `methods/wash-plan-image.mjs` (`--washplanpng 1`): the wash plan as pictures, with the segment boundaries.
- `methods/well.mjs` (helper): a non-negative paint mix for a wanted colour.
- `methods/wetdry.mjs` (always on): paper wetness, brush load and waiting for the paper to dry.
- `methods/wash-join.mjs` (`--washjoin 1`): a colour-domain piece under the minimum shape joins the neighbouring passage instead of leaving a bare-paper shard.

`--holefill` and `--holerim` work around a known drying weakness. They are off by default and run on the CPU and the GPU. See [open problems](future-ideas.md#edge-drying-that-knows-how-much-water-there-is).

## Targeted techniques

Default recipe flag:

- `--shapedmarks 1`: each value plane as one flat-brush stroke. Off: `0`.

Sky flags: `--skylanes 1` lays large cool planes as horizontal wet sweeps. `--skysplit 1` lays the sky's pale wash apart from warm ground. A sky granulates when its pigment does (ultramarine, cerulean), as every wash does; there is no sky-only tube.

Modules:

- `techniques/shaped-marks.mjs` (`--shapedmarks 1`): flat-brush planes, sky sweeps and short texture marks.

## Tuned settings

Sam's rule (0.3.3): a constant, rule, option or technique fitted to one benchmark subject is cheating in both painting
modes. Every such item was removed in 0.3.3:

- The `architecture` preset, the `"presets"` plan key and `--recipe x+<preset>`, and the `v096` recipe. A plan or recipe
  that still names a preset, and `--recipe v096`, fail the run.
- The Trumbull rules and their options: dark recesses (`--recesses` and its `--recess*` flags), stone-block hints
  (`--stoneblocks` and its `--stone*` flags), the cool ground glaze (`--groundglaze`, `--groundfrom`) and lit stone
  (`--litlift`, `--litl`, `--litreserve`, the value planner's `--litwarm`, and the lit-stone rule a plan family named
  "stone" with a "sunlit" cue switched on).
- The V4 and V5 harness's per-subject switch (`trumbull` in `bench/v4v5/subjects.json`) with its paint boxes and palette
  tokens, the stone, recess and lit tokens, and the base's Trumbull-fitted sky lanes (`--skylanemm 6 --skylanestep .8`)
  and sky mottle (`--skyfloc .5`). Every subject gets the same base.
- The curly-dog-coat technique (`--dogpaint`, `--dogcoat` and every `--dog*` flag), `--passages dog`, `--passages sand`,
  `--passages treelayers` with its colour thresholds, `--treelayerslate`, `--inkofftrees` and `--fieldmix`.
- The mass planner fitted to one portrait's layout (`--massplan`).
- Registered skin, fur and plane polygons bound to one target (`--modanatomy`, `--modpaintplanes`).
- The layered-wash chroma split chosen for one subject's orange: both wash modes split at chroma 30.
- The beach scene's dog and ball finders in `tools/seg/segments.py --mode scene`, and the beach-only line selection
  `tools/seg/select-drawing.py`.

`tools/guard/subject-scan.mjs` fails `npm test` (through `src/paint/overfit-scan.test.mjs`) when any JavaScript or Python
file under `src/` or `tools/` names a benchmark subject outside tests, fixtures and the reviewed target lists in
`tools/guard/subject-scan-allow.json`.

`src/paint/tuned/` is gone. Its last file, the practice planner's style cut points (calibrated on about 40 artworks
that included benchmark pieces), was replaced by the plain neutral rule: the measured ink and texture shares are used as
they are (`src/paint/methods/practice-style.mjs`). The guard test `src/paint/overfit.test.mjs` fails on any folder or
file under `src/`, `tools/` or `bench/scripts` named tuned, fitted or per-subject.

Kept as general techniques: the painting ideas inside the removed items, restated with no subject name and no number
from a plate, and chosen by the plan, never by the painter. An area plan's pass names them (`pass.marks`, see
[plan-format.md](plan-format.md)); `src/paint/techniques/surface-marks.mjs` lays them, every size a multiple of the
pass's brush width:

| Technique | Came from | What it is |
|---|---|---|
| `masonry` | the Trumbull stone-block hints | block hints in level courses, one flat stroke per block, staggered by half a block |
| `short-coat` | the dog-coat locks and flicks | short flicks along the planned flow, pressed at the root, lifted at the tip |
| `curly-coat` | the dog ringlets and scribble | small open crescents in no single direction |
| `long-hair` | the dog strands | long strokes along the planned flow with a slow wave |

Deleted with nothing to keep, since an area pass already says it: the ground glaze (a dried glaze over the ground
area), recesses (the dark area's last pass), lit stone (the lit area's own pass colour), the olive-tree layers and
colour thresholds, the mass plan's named masses, the sand passage, the registered anatomy polygons and the
layered-wash chroma split.

Fitted values that remain, each fitted on more than one subject, not switched by subject:
- The pen-and-wash recipe (`--recipe penwash`) and `src/paint/methods/pen-wash.mjs` charge scale and gains
  (`--pwcharge 8`, `--pwwetgain`, `--pwdrygain`), calibrated on two runs.
- `--touchgain` (default `.8`), the touch-up strength.

## Opt-in experimental controls

- `--pigphys 1`: settling, granulation and flocculation per pigment. `--flocblue`, `--flocgrey`, `--flocviolet`, `--flocearth` and `--flocyellow` take 0 to 1 and override one colour family. An unset value keeps the pigment's own `floc`; an explicit 0 clears it. The families are absorption-channel heuristics, not chemical measurements.
- `--tonestage 1`: records a paper-colour choice before drawing. `auto` also detects warm source paper. It changes the paper colour and lays no pigment, so it is not a wash.

### Experimental plan values and paper

Values are planned against the sheet's own optics and delivered as planned (0.3.3; `--calibratedplan` and `--instrumentcal` are no longer options, and typing them, or a gain, stops the run). The plan follows three rules, each of which can be set alone: `--celllight 1` scales each cell's fitted paint until its film over the paper returns the cell's light through the sheet's own optics; `--nestedbands 1` splits a cell's paint between the five bands by value steps, so a wash covers the cells darker than its band's floor and carries that step, and the middle layers carry the middle steps; `--masstone 1` charges each wash at the strength whose flat film returns the light its cells asked for, not at their mean paint, and carries nothing into later bands (`--passcap` has no effect with it). `--valuepreviewonly 1` writes `plan-ledger.png` and `plan-value-check.json`: the plan as booked paint through the sheet's optics, with its dark share, paper share and L* beside the target's. Two more rules apply to the value steps: `--stepholes 1` paints through a gap in a wash that is smaller than the minimum shape and is not a reserved light, so a cell at the paper's own value inside a wall is not left as a bare fleck; `--stepsquint 1` cuts the steps from the target value smoothed over `--layersmooth` (2 mm unless the plan sets it), the smoothing the middle layers' own cuts use, so a wash holds no shape finer than that. `--glazebrush 1` (off) cuts the two shadow glazes from the value smoothed over the smallest paint brush's width instead. The shadow glaze keeps its one damp pass and is charged from its own scrap swatch (each passage whose load or pass count is not its stock technique's is charged from a swatch of its own), and `--deliverycal` and `--techcal` are off unless typed. These are plan values; they do not guarantee the final brush-painted value. The calibration reads the sheet alone only with `--notargetlooks 1`; without it the run still takes its looks at the target between passes.

`--paperrule 1` uses a visible sheet at the margins, otherwise a white sheet with light, near-neutral highlights measured against the lightest tenth. It changes the light reference only when `--paperrel 1` or `--paperlights 1` is also on, and it sets the sheet colour only with `--paperrgb auto`. The test compares lightness and chroma, not hue, so pale material of another hue can count as paper.

The 0.3.1 candidate renders with `--notargetlooks 1` record no paint-time target looks and no guard violations.

## Technique toolbox (plan access)

Each tool has a use and a failure mode. None is mandatory. Paths are under `src/paint/` unless they start with `tools/` or `src/`.

| Tool | Plan access and code | When it fits | When it hurts |
|---|---|---|---|
| Pencil preparation | `drawing.stages.prep`; `methods/drawing-stages.mjs` | Hard placement, perspective, proportions, visible graphite | Dense pencil leaves a grey web under pale washes |
| Prep ink over pencil | `stages.prepInk.from: prep`, keep, add, deviate | Refine a placement drawing while some pencil stays | Inking every construction line makes a traced diagram |
| Sparse finish ink | `stages.finishInk`, restate, select | Restate a few lost junctions after the wash | A second full tracing doubles contours and makes loops |
| Waterproof ink | `drawing.ink.waterproof`; `src/media/pen.mjs` | Black pen and watercolour with set ink | It prevents the softening of soluble sepia studies |
| Source-ink copying | `drawing.source: source-ink`; `tools/seg/copy-lines.py` | Pen drawings and masters with real narrow ink | Wash texture or broad black paint read as line becomes blotches |
| Photo sketch | `drawing.source: photo-sketch`; `tools/seg/sketch-lines.py` | Architecture photos with sustained edges | Texture and foliage become tangled loops |
| Structure lines | `drawing.source: structure-lines`; `tools/seg/structure-lines.py` | Clear perspective, repeated arches, openings or columns | Over-regularizes irregular buildings and organic forms |
| Structure plus detail | `drawing.source: structure-combine`; `tools/seg/structure-combine.py` | A structural scaffold with facade details | A wrong scaffold stays wrong |
| Map smoothing | `drawing.source: line-map`, `mapSmoothing` | About 0.75 cells reduces noisy model-map loops | 1.5 cells loses character; never smooth observed widths |
| Contour and connected gestures | `prepInk.method` `contour` or `connected`; `methods/drawing-rank.mjs` | Contours for landmarks; long economical gestures | Long tracing looks cut out; connected walks wander |
| Scribble and lit-edge breaks | `method: scribble` or `finishInk.masses: scribble`; `methods/drawing-scribble.mjs` | Curly black fur or dark hair with open lit edges | Ink filling a dark surface; dense scribble loses form |
| Architecture closing pen | `finishInk.method: architecture` | Thin dark broken frames, arches, cornices and sills | Strong sepia overwhelms foliage and small figures |
| Staged growth and prep fade | `prep.frames`, `prep.fade`; `methods/pencil-stage.mjs` | Big shapes, then features, then graphite receding under paint | Too much fade removes useful structure |
| Flow-line hatching | `finishInk.hatch`; `src/crop/hatch.mjs` | Pen-heavy architectural shade and engraving | Mechanical fill in fur |
| Fur locks | `finishInk.fur`; `methods/finish-texture.mjs` | Oriented accents in a dark coat with bright gaps | It does not replace the paint mass under it |
| Fur light reserves | `washes.furReserves` | Sheen or glints kept open in a dark coat | Poor thresholds reserve speckles; use coarse bounds |
| Fine ink sheet | `drawing.resolution: 2`; `methods/ink-res.mjs` | Thin tapers on a small sheet | More memory and time |
| Colour-family washes | `washes.colour: family` | Saturated and muted families kept apart | Can weaken connected dark foliage; try `layered` |
| Connected wet sessions | `washes.sessions: connected`; `methods/wash-session.mjs` | Pigments mingle in one passage with one drying edge | Joining different glazes makes mud |
| Subject order | `order.subjects`, `strength`; `methods/subject-order.mjs` | Background first, then the focal subject | Coarse boxes make visible transitions |
| Hole rims | `washes.physics.holeRimMm`; `src/media/sheet.mjs` | Small dry pits inside a wet wash dry without false rims | Too broad a span removes real granulating edges |
| Marangoni flow | `washes.physics.marangoni` | Surface-tension movement inside wet passages | Strong values are unstable and disturb line edges |
| Slope flow | `washes.physics.slope` | A wash meant to run down the sheet | Drift damages aligned architecture and reserved lights |
