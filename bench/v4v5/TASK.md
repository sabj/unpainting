# Painting plan: {SUBJECT_NAME}, round {ROUND}, try {TRY} of {TRIES}

You are preparing a plan for a fixed watercolour painter and painting it. The painter runs on this machine; you start it
with `bash bench/paint.sh start`, and it stops at every passage boundary so you can look at your painting and change
what is not painted yet (see "Painting and looking", below). Your painting is judged by the finished painting and by
how much its progress frames look like a person painting.

{ROUND_RULES}

## The task

- Target: `bench/plan/target.png`. Requested style: **{TASK_STYLE}**.
- Output: {WIDTH} px wide on a sheet {SHEETMM} mm wide. These, the target and the sheet size are fixed
  (`bench/frozen.json`).
- Your working folder is this tree. Write only the files listed under "What you deliver". Everything else you change is
  discarded: the painter code is fixed and must not be edited (tools/, src/ and the rest of the tree are read-only for
  this task; edits there do nothing because only your plan files are taken).

## What is fixed for everyone

- The painter code (`tools/paint-plate.mjs`) and its base recipe. Every painting starts from the base recipe
  `region_w13_lay4_ink4_rec2x_rcl_sky3_sep8_cg13_rg10_blk60_bmm40_bka20_birr_skyb_cpp_dk13_tv8_uncap_pgreen_dwg200_tp2`.
  Your recipe tokens and painter settings are layered on top of it (below).
- Fast drying mode, seed 0, the recording (progress frames and the stroke log), the target guard in `gentle` mode (the
  painter may look at broad shape averages of the target while painting; cell-level target reads are blocked and
  recorded), the scorer.
- `bench/plan/target.png` is supplied by the harness. Your edits to it are discarded.

## What you control (everything you request must be read by the painter, or the painting fails)

All files go in `bench/plan/` unless stated.

1. **`config.json` (required): regions, reserves and value intentions.** Fields the painter reads:
   - `subject`: a style-registry code or your own name (see `src/paint/tuned/subjects.json`).
   - `styleSelection`: `{style, reason, regions}`. `style` is one of `precise-watercolor`, `ink-and-wash`,
     `urban-sketch`, `atmospheric-wet` (`src/paint/styles/*.json`); it sets the value ladder, the ink share and edge
     behaviour. `regions` maps a family id to its own `{style, reason}`.
   - `families`: region geometry and passage assignment. Each `{id, bounds:[x0,y0,x1,y1], baseMove, referenceCue}` with
     bounds as fractions 0..1 of the target. The painter's own colour/value segmentation of the target is assigned to
     the family whose bounds overlap it most, and a family with its own style in `styleSelection.regions` paints its
     cells in that style. Empty `[]` leaves the painter's own segmentation unlabelled.
   - `reserves`: paper whites kept out of every wash. Each `{reason, bounds:[x0,y0,x1,y1]}` (fractions). The painter
     also keeps near-paper target lights on its own.
   - Limits: at most 64 families (short side at least 2 mm on the sheet) and 64 reserves (short side at least 1 mm).
   - The painter refuses a first wash cut by a long straight edge that no edge in the target supports ("unsupported
     axis-aligned seams": a straight side longer than about 8% of the sheet's short side). Rectangular reserves and
     region styles create such edges unless they follow real edges in the target or stay small. The check below runs
     the painter's planning step and catches this.
2. **Drawing paths: `opening-lines.json` (lines drawn before the washes) and `closing-lines.json` (lines drawn
   last).** The harness draws `opening-lines.json` in pencil and runs no closing pen. To draw in ink, put `--outlinemedium
   ink` in `extra-args.json`; to also draw the closing lines, add `--drawing both`. Optional extra files `closingink-lines.json` (used as the closing lines by tokens `_ink2`/`_ink3`) and
   `closingink4-lines.json` (used by `_ink4`, which is in the base recipe: if this file is absent, `closing-lines.json` is
   used). Without a drawing file the painter draws from its own reading of the target. Schema:
   `{"image":{"w":W,"h":H}, "lines":[{"points":[[x,y],...], "width":1, "weight":1, ...}], "medium":"ink"}` with
   `image` equal to the target's pixel size and points in target pixels. At most 4000 lines and 400000 points per file.
   An empty `lines` list with `"medium":"none"` draws nothing. Tracers you may run:
   `node bench/tools/trace-ink.mjs <target.png> <out.json> [minContrast=.12] [minLen=10] [maxLum=.62]` and
   `node bench/tools/closing-ink.mjs` (read its header).
3. **`bench/variant.txt` (required): recipe tokens.** `region_w13` or `region_w15` followed by `_token`s, e.g.
   `region_w13_lay2_dk11`. Write only what you want to change: the base is applied automatically. A token you write
   replaces the base token in the same slot (for example `_lay2` replaces the base `_lay4`, `_sep4` replaces `_sep8`,
   `_ink2` replaces `_ink4`). A token that changes nothing on this subject is refused. Stone-block tokens of the base act
   on architecture only; palette tokens (`_pwarm`, `_pgold`, `_pgreen`, `_pbs`, `_rv`) act only on Trumbull; elsewhere
   choose pigments with `--paints` in `extra-args.json`. `region_w15` switches to brush choice per passage. The full
   token list with the painter options each sets is in `bench/TOKENS.md`.
4. **`extra-args.json` (optional): painter settings.** A JSON array of painter options and values, appended last (they
   win over the recipe), e.g. `["--darkgain","1.1","--paints","ochre,sienna,ultramarine,cerulean,sepia"]`. Options are
   the `opt('name')`/`num('name')` reads in `tools/paint-plate.mjs` and the files it imports. Locked (refused): `--image
   --width --scale --sheetmm --out --targetguard --gpu --mode --seed --frames --marks --video --runcache --valueplan
   --allowunused --physical --paperphysical --wetframes --passframes --pausedir --resumestate --recipe
   --valuepreviewonly`. A value that is a path must name a `.json` file inside `bench/plan/`. An option nothing reads
   {UNREAD_OPTION}. Pigment names: `src/paint/methods/material-profiles.mjs`.
5. **`bench/PLAN.md` (required): your plan in words.** Reference cues, each region's technique and order, moisture and
   load, protected lights, edges, values, what would show failure, and (V5) what you changed and why. Recorded, not
   executed.

## Before you paint: run the check

`bash bench/check.sh` runs exactly the admission check `bash bench/paint.sh start` runs (a few minutes at full width):
the refusals before any painting (it prints the painter arguments your plan resolves to, the base tokens applied or
skipped, and `"ok": true` or the reasons), then the painter's planning step (value plan, no painting) at the full
painting width. The last line says ADMITTED or REFUSED with the reason. `bash bench/paint.sh start` runs the same check;
if it refuses, fix the files and start again. If the painter itself refuses the plan once painting has begun (it says
why), you may fix it and start once more from a clean sheet. {AFTER_PAINTING}

Other tools you may run: the tracers above, and any reading of the code, the skills in `bench/skills/`
(painting-planner, watercolor-technique) and the worked example. Do not run the painter yourself: `bench/paint.sh` is
the only way to paint. Do not edit code, do not use the network except for your own model API.

## Painting and looking (self-view)

When your plan passes the check, paint it yourself and watch it as you like:

- `bash bench/paint.sh start` runs the same admission check as `bash bench/check.sh` and starts painting your plan files
  as they are. It answers when the painter has stopped before the first wash (your opening drawing done).
- The painter stops at every passage boundary: before the first wash, after each pass of the light-to-dark ladder (once
  the painter has dried it as it always does), and before the closing drawing. A pass is one pigment at one value step;
  a painting has about 25 to 45 passes (near the end the painter adds touch-up passes of its own).
- At a stop, `bash bench/paint.sh look` writes `bench/looks/<n>-compare.jpg` (the target and your sheet so far, side by
  side) and `bench/looks/<n>-sheet.jpg`, and prints the stroke count and the passes still to come. Open the image to
  see it. Look as often as you like.
- To go on: `bash bench/paint.sh next` (paint the next pass, stop after it), `bash bench/paint.sh run <pass>` (stop
  after that pass), `bash bench/paint.sh run closing` (stop before the closing drawing) or `bash bench/paint.sh finish`
  (no more stops). They wait for the painter (a pass takes from seconds to minutes); if one answers "still painting",
  run `bash bench/paint.sh wait`.
- Revising: at a stop you may edit any plan file (`config.json`, the drawing files, `bench/variant.txt`,
  `extra-args.json`) and run `bash bench/paint.sh revise` (optionally `revise then finish`, `revise then run <pass>`).
  It checks the files like `bash bench/check.sh`; then the painter plans again from them and goes on from where it is.
  What is on the paper stays: the opening drawing and the passes already painted cannot change, and the painter
  continues with the next pass of the re-planned ladder (pass k+1 when k passes are painted). The pigments cannot change
  once painting has started. A revision the check refuses changes nothing. You may revise as often as you like.
- Time: this try has 85 minutes of your own time (planning, looking, revising). Time spent waiting in `bench/paint.sh`
  (for the painter or its check) is not counted. When the 85 minutes are up, the session ends and the painter
  finishes your current plan without stopping. `bash bench/paint.sh status` shows where the painter is and the time you have used.
- The target guard stays on while painting: your looks are your own; the painter's own reads of the target are blocked
  and recorded as before, every stroke is logged, and the plan limits still apply to every revision.
- When the painting is finished, stop. (If you stop before starting it, the harness checks and paints your plan files
  as they are, without stops.)

## What you deliver

- `bench/plan/config.json`, and optionally `opening-lines.json`, `closing-lines.json`, `closingink-lines.json`,
  `closingink4-lines.json` and `extra-args.json` in `bench/plan/`
- `bench/variant.txt`, `bench/PLAN.md`
- `bash bench/check.sh` ends with ADMITTED, and the painting started with `bash bench/paint.sh start` and finished

## Worked example (a different picture: `bench/example/`)

`bench/example/` holds a complete, admitted plan for a seascape that is not one of the benchmark subjects: `plan/`
(`target.png`, `config.json`, `opening-lines.json`, `closing-lines.json`, `extra-args.json`), `variant.txt`,
`frozen.json`, `PLAN.md`, `check-output.json` and `commands.sh` (the exact commands that made it). In short:

```bash
P=bench/plan
node bench/tools/trace-ink.mjs $P/target.png $P/opening-lines.json .12 14 .62   # pen lines traced from the target
cp $P/opening-lines.json $P/closing-lines.json                                  # same lines closing the painting
cat > $P/config.json <<'JSON'
{"subject":"EXAMPLE","name":"EXAMPLE",
 "styleSelection":{"style":"precise-watercolor","reason":"value planes carry the form",
   "regions":{"EXAMPLE.sky":{"style":"atmospheric-wet","reason":"soft graded sky"}}},
 "families":[{"id":"EXAMPLE.sky","bounds":[0,0,1,0.45],"baseMove":"wet in wet","referenceCue":"pale graded sky"},
             {"id":"EXAMPLE.sea","bounds":[0,0.45,1,1],"baseMove":"wet on dry","referenceCue":"darker sea, broken lights"}],
 "reserves":[{"reason":"brightest cloud edge","bounds":[0.6,0.13,0.66,0.19]}]}
JSON
echo '["--darkgain","1.1"]' > $P/extra-args.json                                # a painter setting on top of the base
echo region_w13_lay2_noslane > bench/variant.txt                                # 2 mid layers, no sky lanes
bash bench/check.sh                                                             # ends with ADMITTED
```

{FEEDBACK}
