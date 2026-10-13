# One painting plan

The default painter resolves one plan before touching the sheet. Drawing selects the line source and linked stages. Washes select colour mixing, wet sessions and physical flow. Order selects which subjects develop first. The painter compiles every target-derived path and mask before the strict target guard seals the target. The plan and CLI overrides are recorded in `pipeline-plan.json`.

The default is a drawing first (ink or graphite from the source), family-colour washes in passage sessions, whole-sheet light-to-dark order and neutral flow. A planner should choose tools from the target, not turn everything on. No subject identifier activates a fitted preset. `--recipe v096` keeps the historical recipe; the v0.1.0 checkout also keeps its historical simulator. `general` and `combined` are aliases for the current process; `none` is the bare tool interface. Individual CLI options override the plan.

```json
{
  "subject": "new-subject",
  "name": "A building in sunlight",
  "families": [],
  "reserves": [],
  "drawing": {
    "source": "photo-sketch",
    "ink": {"color": "black", "waterproof": true},
    "resolution": 1,
    "stages": {
      "prep": {"amount": 0.4, "weight": 0.7, "frames": [3,2,2], "fade": 0.7},
      "prepInk": {"from": "prep", "keep": 0.8, "add": 0.1, "method": "contour"},
      "finishInk": {"from": "prepInk", "select": "edges", "restate": 0.2, "method": "accent"}
    }
  },
  "washes": {
    "colour": "family",
    "sessions": "connected",
    "inkAware": false,
    "charge": 0.5,
    "carryMm": 0,
    "paleLimit": 0.16,
    "physics": {"holeRimMm": 0, "marangoni": 0, "slope": 0}
  },
  "order": {"strength": 0.5, "subjects": [{"id":"sky","bounds":[[0,0,1,0.3]]},{"id":"rest"}]}
}
```

Use `drawing.medium: "none"` to omit drawing. Without `stages`, the ordinary bounded drawing runs. With `stages`, missing stages are skipped. Graphite then finish ink is `prep` plus `finishInk: {from: "prep"}` with no `prepInk`. The finish is executed after all wash passages and the final dry gate. It therefore follows every subject's last wash, including reordered wet sessions. `--drawing first|last|none` overrides stage timing.

Drawing source choices: `none` (bounded walker), `auto`, `source-ink`, `photo-sketch`, `structure-lines`, `structure-combine`, `line-map`. Python extractors need NumPy and OpenCV. Explicit choices fail if unavailable except source-ink's documented narrow-ridge fallback. `line-map` requires `drawing.map`; `drawing.mapSmoothing` is its simplification tolerance in planning cells. This is a prepared model line map, never a photograph passed as a line map.

Wash colour is `family` or `layered`. Sessions are `dry`, `passage` or `connected`. Connected sessions join pigments only within the same subject, region, phase and glaze step. Shadows and later glazes dry separately. `inkAware` defaults true for source-ink and line-map and needs a prepared drawing file; it removes planned narrow lines from the wash target before value compilation. It should stay false for approximate construction drawings. Physics is inside washes: holeRimMm 0..3, marangoni 0..1, slope -1..1. These are material choices, not subject-quality knobs. CLI `--physics key=value` overrides named coefficients without clearing other planned coefficients.

Colour washes charge each passage at the `charge` quantile of its demand and carry what a cell still needs into the next band. `carryMm` averages that carried mask over a brush-sized area in family mode. Prefer 0 in new plans. On Yale (matched native 540, seed 0; one subject), 2 mm diluted the warm stone to C14.0 (target 21.6) and painted over the lit stone at L85.6 (target 94.3); 0 measured C18.7 and L88.1. The code default stays 2 mm, and every benchmark plan sets its own value.

Optional colour fields: `paints` names the box pans by key (for example `["sienna","hansa","paynes"]`) instead of letting the palette fit choose them. `darkGain` (0.5..3) charges the shadow glazes above their fitted demand, because the physical wash delivers about 70% of a planned dark. `deepAccent` `{max, grow, families}` restates cells darker than `max` (0..255, darkest channel) as last accents, only inside the named families.

Order uses `subjects`, a list of `{id, families:[family IDs]}` or `{id, bounds:[[x0,y0,x1,y1]]}`, with optional `{id:"rest"}`. Strength 0..1 delays later subjects while keeping light-to-dark within each. Missing order means whole-sheet bands. Legacy `subjectOrder` is accepted only when `order.subjects` is absent.

# Technique toolbox

Every entry gives a use and a failure mode. These are choices, not mandatory rules.

| Tool | Plan access and code | When it fits | When it hurts |
|---|---|---|---|
| Pencil preparation | `drawing.stages.prep`; `drawing-stages.mjs`, `paint-plate.mjs: drawPrepStage` | Difficult placement, perspective, proportions, visible graphite | Dense pencil can leave a grey web under pale washes |
| Prep ink linked to pencil | `stages.prepInk.from: prep`, keep/add/deviate; `drawing-stages.mjs` | Refine a placement drawing while leaving some pencil | Inking every construction line makes a traced diagram |
| Sparse finish ink | `stages.finishInk`, restate 0..1, select edges/darks/both; `drawing-stages.mjs` | Restate a few lost junctions after the wash | A second complete tracing makes loops and doubles contours |
| Opening ink delivery and waterproofing | `drawing.ink.waterproof`; `draw.mjs`, `pen.mjs`, `paint-plate.mjs` | Black pen-and-watercolour needs reservoir continuity, physical nib widths and set ink | Waterproof brown ink prevents the softening seen in soluble sepia studies |
| Source-ink copying with observed widths | `drawing.source: source-ink`; `tools/seg/copy-lines.py`, `linework-plan.mjs` | Pen drawings and masters with actual narrow ink | Wash texture or broad black paint mistaken for line becomes blotches; inspect extracted geometry |
| Photo sketch | `drawing.source: photo-sketch`; `tools/seg/sketch-lines.py`, optional `sketch-map.py` | Architecture photos with sustained edge structure | Texture and foliage can become tangled loops; default extraction is classical unless a model map is provided |
| Structure lines | `drawing.source: structure-lines`; `tools/seg/structure-lines.py`, `structure/` | Clear perspective and repeated arches, openings or columns | Over-regularizes irregular buildings and organic forms |
| Structure plus detail | `drawing.source: structure-combine`; `tools/seg/structure-combine.py` | Structural scaffold with uncovered facade details | Unreliable scaffold remains wrong even with better detail |
| Map smoothing | `drawing.source: line-map`, map, mapSmoothing; `copy-lines.py` | Small simplification, such as .75 cells, can reduce noisy model-map loops | 1.5-cell smoothing lost character in past work; never smooth observed widths as if they were model evidence |
| Graphite start, ink finish | prep plus finishInk.from prep; `drawing-stages.mjs` | Architecture with visible pencil and selected final edges | Heavy prep obscures lights; keep finish selection independent of pencil pressure |
| Contour and connected gestures | prepInk.method contour/connected; `drawing-rank.mjs`, `drawing-logic.mjs` | Contours for landmarks; connected for economical long gestures | Long tracing can look cut out; connected walks may wander |
| Scribble and lit-edge breaks | prepInk.method scribble or finishInk.masses scribble; `drawing-scribble.mjs`, `drawing-file.mjs` | Curly black fur or dark hair with open lit edges | Do not use ink to fill a dark painted surface; dense scribble loses form |
| Architecture closing pen | finishInk.method architecture; `drawing-stages.mjs`, `drawing-plan.mjs` | Thin dark broken frames, arches, cornices and sills after washes | Its stronger sepia and minimum widths can overwhelm foliage and small figures; retain sparse restate |
| Pencil from declared values | prep.weight; `paint-plate.mjs: drawPrepStage` | New jobs without a target drawing keyframe | Does not claim to reproduce a measured target pencil stage |
| Staged growth and prep fade | prep.frames, prep.fade; `pencil-stage.mjs` | Big shapes, features, detail, then graphite receding under paint | Excess fade removes useful structure; keep mask is frozen before the guard |
| Flow-line hatching | finishInk.hatch `{bounds,budget,spacing,minDensity}`; `crop/hatch.mjs`, `finish-texture.mjs` | Pen-heavy architectural shade and engraving | Never a mechanical fill for fur; no ruled 60-degree hatch |
| Fur locks and light gaps | finishInk.fur `{bounds,budget,spacing,minDensity,reserveBelow}`; `finish-texture.mjs` | Oriented accents in a dark coat, with bright gaps left open | This recovered generic variant is not the fitted q-route dog study; it does not replace the underlying paint mass; use washes.furReserves for wash highlights |
| Fur light reserves | `washes.furReserves: {bounds,reach,drop,dark,maxDensity,minCells}`; `finish-texture.mjs: furLightReserves` | Preserve local sheen or glints inside a dark coat before washes, recovered from V072 mass-glints | Poor thresholds reserve speckles; use a coarse fur bounds region and reject one-cell lights |
| Fine ink sheet | drawing.resolution 2; `methods/ink-res.mjs`, `fine-material.mjs` | Thin tapers on a small sheet | More memory and time; not proof of improved drawing; default 1 |
| Dip-pen physics | `media/pen.mjs`, `draw.mjs` | Pressure, tine contact, reloads, fibre skips and damp feathering | Slow repeated marks pool; a dry nib cannot carry a long unbroken contour |
| Dry pencil physics | `media/pencil.mjs`, `methods/pencil-line.mjs` | Tooth and non-pooling graphite marks | Stage-image measurement is legacy; prefer declared prep for new subjects |
| Colour-family washes | washes.colour family; `light-to-dark.mjs` | Keep saturated and muted colour families separate, carry demand across layers | Can weaken connected dark foliage; layered is available when the target needs it |
| Connected wet sessions | washes.sessions connected; `wash-session.mjs`, `paint-plate.mjs` | Pigments mingle in one passage with one drying boundary | Joining different glazes makes mud; session identity includes subject and glaze step |
| Subject order | order.subjects and strength; `subject-order.mjs` | Develop background then focal subject or one coherent area at a time | Coarse boxes can make transitions; strength 0 keeps global bands |
| Hole rims | washes.physics.holeRimMm; `media/sheet.mjs`, GPU flow | Small dry holes surrounded by a wet wash should not acquire false rims | Too broad a span removes intentional granulating boundaries |
| Marangoni flow | washes.physics.marangoni; CPU/GPU flow | Surface-tension movement within wet passages | Strong settings are numerically sensitive and can disturb line edges |
| Slope flow | washes.physics.slope; CPU/GPU flow | A wash deliberately moves down the sheet | Directional drift can damage aligned architecture or reserved lights |
| Ink fidelity diagnostics | `tools/ink-judge.mjs`, `src/eval/ink.mjs`, `linequality.mjs`, `tools/judge/line-study.py`, `tools/judge/ink-wash-consistency.mjs` | Check precision, recall, loops, length and ink/wash separation after painting | Pixel metrics are not artistic judgments and must never steer paint through the sealed target |

The historical recovery list also includes teaching recordings, target-keyframe timing, rejected ruled hatch and fitted mass-lock variants. They are not new-job painting tools. Target-keyframe copying and paint-time target steering remain excluded. `--prepfade` is an explicit graphic fade model, not a claim that real waterproof ink dissolves.

Photo model evidence from the historical linebench study: lineart realistic led faces and objects (mean F1 at 6 px .546), HED led beaches (.460), and ArtLine stated dark masses. These are old model-choice clues, not validation on the current subjects. `photo-sketch` has a working classical fallback and accepts a prepared model map; it does not require the deleted linebench runner.

## Historical ink inventory: supporting tools and limits

These entries complete the inventory in addition to the tools above. Main choices belong in `drawing`; the lower-level options below remain explicit CLI overrides. Availability does not mean a tool helped the current six paintings. See the validation report for exercised coverage.

| Tool | Location / access | Fits | Hurts or limit |
|---|---|---|---|
| Ridge walker | `src/media/draw.mjs`, drawing source none | Sparse finish lines in a pen source | Walks fur and sand as squiggles |
| Line-length budget | `draw.mjs`, `--inkbudget` | Bound a walker by the source's ink share | Deletes short landmarks if spent on texture |
| Ink gate | `draw.mjs`, `--inkgate` | Keep a walker near narrow source ink | Separator mistakes also gate out useful lines |
| Ink tiers | `src/crop/inktiers.mjs`, `--inktiers` | Silhouette, features, then hair | Budget can suppress the lower tiers entirely |
| Ink filter | `src/crop/inkfilter.mjs`, `--inkfilter` | Reject texture in fur and foliage | Can remove real dark-against-light structure |
| Segment outlines and ground lines | `methods/seg-ink.mjs`, `--segink` | A few subject silhouettes | A whole traced drawing looks cut out |
| Learned line evidence | `methods/ml-lines.mjs`, `tools/seg/lines.py`, `--mllines`; prepared maps through `drawing.source: line-map` | Faces and objects when a suitable model map exists | Optional model dependencies are not bundled; sand and sky texture can become lines |
| Authored line selection | `methods/drawing-file.mjs`, `tools/seg/select-drawing.py`, `--drawingfile` | A reviewed line set compiled before painting | Drawing an unreviewed extraction whole is usually too dense |
| Per-segment model extraction | `tools/seg/drawing/` | Different model evidence for faces, clothing and scenery | Historical runners refer to external model weights and linebench paths; use a prepared map when unavailable |
| Fitted revision-4 map rules | Historical `paint/tools/seg/drawing-from-maps.py` | Evidence that region-specific extraction can help photos | Not ported as a universal preset; it was fitted on four subjects. Current photo-sketch and prepared-map routes replace the missing runner |
| Region ranking | `drawing.lines: regions`, `drawing-plan.mjs` | Head, hands and held object before clothing and setting | Needs reliable region labels |
| Form versus tone split | `methods/drawing-logic.mjs`, `--drawinglogic 1` | Structure first, sparse tonal finish later | The old split can send too much texture to the closing pen; explicit linked stages are clearer |
| Hand order and taper | `methods/drawing-hand.mjs` through drawing logic | Join continuations and press in, lift off | Poor candidates remain poor after ordering |
| Hybrid walker | `methods/drawing-hybrid.mjs`, prepInk.method connected | Longer gestures on prepared geometry | Can knot into squiggles |
| Pencil erase / prep fade | `methods/pencil-stage.mjs`, `--pencilerase`, prep.fade | Let a construction drawing recede | An explicit graphic model, not physical erasure or soluble waterproof ink |
| Dark-mass budget | `methods/mass-budget.mjs`, `--massbudget` | Bound planned ink inside a dark coat | Can starve defining lines; dark paint is still the wash's job |
| Region exclusions | `--inkoffbox`, `--inkoffoutline`, `--inkofffoliage`, `--inkofftrees`, `--inkskin`, `--penface`, `--facedetail` in `paint-plate.mjs` | An explicit reviewed exclusion or face policy | Heuristic tree detection removed stone on h36-a; avoid universal defaults |
| Opening and closing caps | `methods/material-profiles.mjs`, drawing.amount/maxLines/weight/closingLines | Limit marks and pressure per stage | A fixed 12-line cap underdraws an authored source-ink file |
| Graphite outlines | `--penoutline`, `paint-plate.mjs` | A light placement scaffold | Full silhouette outlining can make a cut-out |
| Photo versus artwork declaration | Separate prepared drawing file and `src/paint/styles/` | Keep photographic evidence separate from an ink original | A wrong declaration causes inappropriate tracing or wash interpretation |
| Practice style proportions | `methods/practice-style.mjs`, `tuned/style-cuts.mjs`, `--practice` | Historical studies of ink, dry and wet shares | Requires measured art evidence; not a default new-subject recipe |
| Reload and dip cadence | `media/draw.mjs`, `media/pen.mjs` | Continuity across short marks and timely reloads | Forced fresh dips on every tiny mark create dark spots |
| Pressure, speed and dwell | `media/draw.mjs`, prepared point weights/widths | Thick-to-thin expressive contact | A long pause pools; observed widths still obey the instrument range |
| Lit-edge taper | `methods/drawing-scribble.mjs`, scribble | Open the illuminated edge of a dark lock | Can break necessary architectural junctions |
| Simplify, chains and pen blur | `--pensimplify`, `--penfrom chains`, `--penblur` | Clean noisy candidate geometry before marks | Excess simplification removes character; blur is not a substitute for pen control |
| Separate soluble ink | `--inkcolour sep`, drawing.ink | Sepia studies with wash softening | Unwanted rewetting muddies crisp urban sketch lines |
| Damp-sheet ink | `media/pen.mjs` | Deliberately feathered ink tests | Production material pens enforce dry contact; no planner shortcut bypasses that gate |
| Glaze-aware pen colour | `--penwant glaze`, `paint-plate.mjs` | Plan ink density in relation to underlying tone | Must be compiled before the target seal; not target feedback during the stroke |
| Ink/wash separation | `src/crop/inkwash.mjs`, `wash-ink-free.mjs` | Avoid laying wash pigment into known pen lines | Broad dark paint is not ink and must remain a wash |
| Closing cleanup | Historical `--closeclean` | Historical cleanup of a selected final line set | Current painter only accepts this as a legacy optional name; it has no active implementation and is not a planner tool |
| Curls and dark-mass curls | `techniques/dark-mass.mjs`, `--darkmasscurls` | Curly coats in an explicitly stylized passage | Repeated curls look like a texture filter |
| Dog scribble route | `methods/dog-scribble.mjs`; generic finishInk.masses scribble | Dark hair and fur accents | Historical dogpaint route has fitted settings; the generic plan path avoids those coordinates |
| Fur flicks and dry brush | `src/crop/fur.mjs`, `src/media/brush.mjs`; legacy `--fur` path | Edge hairs and broken dry contact | Too many flecks create speckle; the legacy lazy fur field is not certified under strict guard. Prefer the preplanned finish-fur path |
| Target-keyframe tracing and timing | Historical stage-trace and `--timeline target` | Replaying a documented teaching sequence only | Excluded from new-subject planning: a finished target does not supply its own prep stage |
| Ruled 60-degree hatch | Historical rejected drawing variant | None recommended | Rejected grid texture, especially in fur; not ported |
| Original fitted mass-lock brush route | Historical V072 `experimental/mass-locks.mjs` | The old dog study | Not ported unchanged: fitted coordinates and target-time reads. Generic preplanned locks and light reserves are available above |
| Ink measure and legibility | `src/eval/ink.mjs`, `linequality.mjs`, `tools/ink-judge.mjs` | Inspect a line, loop, share, precision and recall | Inferred ink can include wash boundaries; not a quality score |
| Stage, length and pen-box audit | `tools/judge/line-study.py`, stage snapshots, `pen-state-audit.json` | Verify what each pass actually laid | Historical stage judges need reference keyframes; no invented stage ground truth |
| Ink lab and house demo | Historical paint repository `tools/ink-lab.mjs` and house demos | Controlled instrument teaching and regression studies | Not ported as a painting method. Demonstrations do not establish quality on a new subject |
