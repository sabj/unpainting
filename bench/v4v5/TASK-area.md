> **Retired in 0.4.** This task ran on painter 0.2.x and 0.3.x. Its plans (styleSelection, recipe tokens, `example/`) ask for the light-to-dark value plan and options that 0.4 removed, so it cannot run on this trunk: `npm run bench:run` refuses V4 and V5. Check out tag `v0.3.2` to replay it. The next task is the draft in `bench/v6/`.

# Painting plan: {SUBJECT_NAME}, round {ROUND}, try {TRY} of {TRIES}

You are preparing an area plan for a fixed watercolour painter and painting it. The painter runs on this machine; you
start it with `bash bench/paint.sh start`, and it stops at every pass boundary; at three stops of your choice you may
step back and look at your painting (see "Painting and looking", below). Your painting is judged by the finished
painting and by how much its progress frames look like a person painting.

{ROUND_RULES}

## The task

- Target: `bench/plan/target.png`. Requested style: **{TASK_STYLE}**.
- Drawing medium of the target: **{MEDIUM}** ({MEDIUM_TEXT}).
- Output: {WIDTH} px wide on a sheet {SHEETMM} mm wide. These, the target and the sheet size are fixed
  (`bench/frozen.json`).
- Your working folder is this tree. Write only the files listed under "What you deliver". Everything else you change is
  discarded: the painter code is fixed and must not be edited (tools/, src/ and the rest of the tree are read-only for
  this task; edits there do nothing because only your plan files are taken).

## What is fixed for everyone

- The painter code (`tools/paint-plate.mjs`) and its template: cold-press paper, fast drying mode, seed 0, the physical
  brush, the recording (progress frames and the stroke log), the scorer. There are no recipe tokens and no painter
  settings to choose: everything you decide is in your area plan.
- The target guard in `gentle` mode (the painter may look at broad shape averages of the target while painting;
  cell-level target reads are blocked and recorded).
- `bench/plan/target.png` is supplied by the harness. Your edits to it are discarded.

## What you control (everything you request must be read by the painter, or the plan is refused)

All files go in `bench/plan/` unless stated.

1. **`area-plan.json` (required): the whole painting as named areas and their passes.** The contract is printed by
   `node tools/paint-plate.mjs --areahelp`; every field is explained in `docs/plan-format.md` (the paragraph that starts
   "Area plans"); a complete admitted plan for another picture is in `bench/example-area/`. In short:
   - `target`: `{"path": "bench/plan/target.png", "sha256": ..., "width": ..., "height": ...}` of the target as it is.
   - `areas`: as many as the subject needs (the count is yours). Each area has an `id`, a `parent` (or null), an
     `intent`, a `referenceCue`, a `drawingRole` (`none`, `scaffold`, `structural`, `focal`; see 2), a `geometry`
     polygon in 0..1 target coordinates, and its `passes`. Every cell of the sheet must belong to an area. A child lies
     inside its parent; overlapping siblings need a `priority` and an `occlusionReason`.
   - Each pass: `order`, `dependsOn`, `valueRange`, `move` (`wet on wet`, `wet on dry`, `dry brush`), `brush`, `load`,
     `wetness`, `lights`, `edges`, `stop`, and optionally `session`, `wash` (graded or variegated), `charge`, `soften`,
     `marks`. A pass is laid as one wash: every cell of its area whose value on the painter's value ladder falls in its
     `valueRange`, as one shape holding the paint the ladder puts there. The ladder runs from 1 (lightest) to N; the
     check prints N for this target at this width. Every ladder value inside an area must belong to one of its passes
     (an area's passes may not overlap); the darkest pass of an area may end at 99 to take every darker value. A lighter
     pass covers more of the area and a darker one less, as a painter lays a first wash and then darker shapes inside it.
   - `load.pigmentScale` must be 1: the pass's value range states the value, the painter delivers it. There is no gain
     to set.
   - `edges`: one entry for each pair of areas that share a boundary, `hard`, `soft` or `lost`, with a reason. The check
     lists any pair left out.
   - `paints`: the pigments, a list of names (`src/paint/methods/material-profiles.mjs`). Choose ones that can reach the
     target's most saturated colours, not just its hues: an earth lies in the direction of an orange or a green but no
     amount of it makes a clear one, and a palette of earths and greys turns bright fur, foliage, sky or cloth to mud.
     Find the most saturated passages of the target first and give each a pigment that is at least as clean, then add
     what the quiet passages and the darks need. A `charge` or `wash` names pigments from this list.
   - `drawing`: `{"medium": "graphite" | "ink" | "none", "reason": one sentence on what in the target decides it}`,
     and for ink optionally `"ink": "sepia-ink" | "black-ink"`.
2. **Drawing paths: `opening-lines.json` (lines drawn before the washes) and `closing-lines.json` (lines drawn
   last).** Each area's `drawingRole` decides which lines are drawn in it: the opening drawing only inside `scaffold`
   and `structural` areas, the closing drawing only inside `structural` and `focal` areas; a line over a `none` area is
   not drawn there. Use ink only when the target's drawing medium is pen and the target itself shows pen lines. Dark
   painted edges, whiskers, hair and window bars are not pen lines: paint them, or leave them to a light pencil drawing.
   When the medium is not pen, no drawing is drawn in ink and none has closing lines: the harness draws your opening
   lines in graphite as a light preparatory drawing, drops the closing lines, and records the override in the result
   (the check prints it as `mediumOverride`). You may always choose no drawing (`"medium": "none"`). Schema:
   `{"image":{"w":W,"h":H}, "lines":[{"points":[[x,y],...], "width":1, "weight":1, ...}], "medium":"ink"}` with
   `image` equal to the target's pixel size and points in target pixels. At most 4000 lines and 400000 points per file.
   Tracers you may run: `node bench/tools/trace-ink.mjs <target.png> <out.json>` (limits from the subject's own value
   range, not settable; one nib and one weight per line) and `node bench/tools/closing-ink.mjs` (read its header).
3. **`bench/PLAN.md` (required): your plan in words.** Reference cues, the value study, each area's technique and
   order, wet sessions, moisture and load, protected lights, edges, what would show failure, and (V5) what you changed
   and why. Recorded, not executed.

There is no `config.json`, `variant.txt` or `extra-args.json` in this round: a plan that has them is refused.

## Before you paint: check the plan, then render once

A render is the expensive step (minutes of machine time, one painting). The check is cheaper: `bash bench/check.sh`
runs the refusals above, then the painter's planning step with your area plan at the full painting width (a few
minutes): it cuts the value ladder, gives every cell to its area and compiles each pass into its wash. It stops with
the reason on anything the painter cannot paint (a ladder value no pass of an area takes, with the values listed; a
shared boundary missing from `edges`; a pass above the ladder; a field the contract does not have). When it admits the
plan it writes `bench/check-out/areas.jpg` (target left, your areas right, each in its own colour) and prints each
area's share of the sheet, N (the ladder's darkest value) and how many ladder pieces each pass gathers. It does not
show values, edges, brush marks or texture; judge those from the skills and the example. The last line says ADMITTED or
REFUSED. The harness records how many checks you ran and the render's time. One render is allowed; a second start is
possible only when the painter itself refused the plan before painting began.

Other tools you may run: the tracers above, and any reading of the code, the skills in `bench/skills/`
(painting-planner, watercolor-technique) and the worked example. Do not run the painter yourself: `bench/paint.sh` is
the only way to paint. Do not edit code, do not use the network except for your own model API.

## Painting and looking (self-view)

When your plan passes the check, paint it yourself:

- `bash bench/paint.sh start` runs the same admission check as `bash bench/check.sh` and starts painting your plan files
  as they are. It answers when the painter has stopped before the first wash (your opening drawing done).
- The painter stops at every pass boundary: before the first wash, after each pass of your plan, and before the closing
  drawing.
- At a stop, `bash bench/paint.sh look` writes {LOOK_VIEW}, and prints the stroke count and the passes still to come.
  Open the image to see it. A look is stepping back from the board, as a painter does a few times while painting:
  you have three looks while painting (the stops are yours to choose), and one more at the finished painting.{STRICT_NOTE}
- To go on: `bash bench/paint.sh next` (paint the next pass, stop after it), `bash bench/paint.sh run <pass>` (stop
  after that pass), `bash bench/paint.sh run closing` (stop before the closing drawing) or `bash bench/paint.sh finish`
  (no more stops). They wait for the painter (a pass takes from seconds to minutes); if one answers "still painting",
  run `bash bench/paint.sh wait`.
- An area plan cannot be revised once painting has started: the painter does not yet carry an area plan's state across
  a re-plan, so `revise` is refused. Plan with the check before you start.
- Time: this try has 85 minutes of your own time (planning and looking). Time spent waiting in `bash bench/paint.sh`
  (for the painter or its check) is not counted. When the 85 minutes are up, the session ends and the painter
  finishes your plan without stopping. `bash bench/paint.sh status` shows where the painter is and the time you have
  used.
- The target guard stays on while painting: your looks are counted; the painter's own reads of the target are blocked
  and recorded as before, and every stroke is logged.
- When the painting is finished, stop. (If you stop before starting it, the harness checks and paints your plan files
  as they are, without stops.)

## What you deliver

- `bench/plan/area-plan.json`, and optionally `opening-lines.json` and `closing-lines.json` in `bench/plan/`
- `bench/PLAN.md`
- `bash bench/check.sh` ends with ADMITTED, and the painting started with `bash bench/paint.sh start` and finished

## Worked example (a different picture: `bench/example-area/`)

`bench/example-area/` holds a complete, admitted area plan for a seascape that is not one of the benchmark subjects:
`plan/` (`target.png`, `area-plan.json`, `opening-lines.json`), `frozen.json` and `PLAN.md`. Three areas (sky, sea,
a rock inside the sea), four passes: the sky one graded wet-on-wet wash with the cloud lifted from the damp paint;
the sea a graded wash on dry paper once the sky is dry, then a dry-brush pass for its darker values so paper shows
through; the rock on dry paper after the sea's first wash. Its paints are four pigments, its drawing a light graphite
opening drawing inside the sea (`scaffold`) and the rock (`structural`).

{FEEDBACK}
