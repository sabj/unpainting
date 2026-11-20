> **DRAFT, not yet run.** No model has been given this brief. It describes what the 0.4 trunk can execute today; the
> section "Not yet executable" lists what the brief would like and the painter cannot do yet.

# Painting plan: {SUBJECT_NAME}, round V6

You plan a watercolour (with ink or pencil, or neither) of the subject below, for a simulated painter to execute. You
never paint and you never touch pixels. You decide; you may call tools to prepare inputs; the painter executes what your
plan says, the same way whoever wrote it.

Subject: `{TARGET}`, {WIDTH_PX} px, on a sheet {SHEET_MM} mm wide. Declared drawing medium: {MEDIUM}.

## What you hand in

One folder, `plan/`:

- `plan.json`: the plan (format below).
- `drawing-lines.json` (optional): the drawing the pen or pencil lays, as a line file (`docs/plan-format.md`, line files).
- `studies/*.png` (optional): block-in studies the washes are read from, registered to the subject's frame.

`plan.json`:

```json
{
  "subject": "{SUBJECT_ID}",
  "sheet": { "widthMm": {SHEET_MM}, "seed": 0 },
  "drawing": { "medium": "ink", "file": "drawing-lines.json", "order": "passes", "ink": "forms", "touch": "medium", "hatching": "sparse", "budget": 900 },
  "washes": { "layers": [ { "study": "studies/s3.png", "leastMm2": 150 }, { "study": "studies/s1.png", "leastMm2": 120, "glaze": true } ], "paints": ["ochre", "ultramarine", "sienna"] },
  "stop": "after the last layer dries"
}
```

## The tools you may call (each writes a file into your folder)

1. **Line drawing** (an image model): ask for a clean line drawing of the subject at a chosen ink level (`none`, `forms`,
   `full`). You write the prompt; you get a PNG. Look at it before using it.
2. **Trace** (`tools/seg/trace-drawing.py IMAGE --out STEM --target SUBJECT --sheetmm MM --medium ink|pencil`): one stroke
   per drawn line, with its width and darkness carried from the drawing.
3. **Order** (`tools/seg/order-strokes.mjs IN-lines.json OUT --sheetmm MM [--order passes|growth] [--ink none|forms|full
   --masses MASK.png] [--touch light|medium|firm] [--hatching none|sparse|drawn] [--budget N]`): the order a hand draws in,
   structure first. For pencil, `tools/seg/pencil-hand.mjs ... --finish loose|medium|tight` lays it as a hand would.
4. **Masses** (`tools/seg/mass-mask.py`): the painted masses a vision model names, shaped by SAM, for the ink-amount dial.
5. **Block-in study** (an image model): ask for the subject simplified into a couple of dozen flat shapes of clean
   colour, lights left as paper, at a chosen simplicity. Ask for more than one: coarse for the first layer, richer for later
   layers.
6. **Things** (`tools/seg/thing-masks.py`): named things and their shapes, to check a study or a drawing against.
7. **Look**: render your plan (`node tools/paint-plate.mjs` with the arguments `bench/v6/plan-args.mjs` builds) and look at the sheet at any
   stage of the replay (`marks.json` plays in `studio/`).

## The decisions that are yours, in the plan

- Medium: ink, pencil or none, and why (`drawing.medium`, `drawing.reason`).
- How much ink and with what touch: the ink level you ask the drawing model for, the order tool's `--ink`, `--touch`,
  `--hatching` and stroke `--budget`, and the order policy (`passes` or `growth`).
- Which drawing and which study prompts to request, and which outputs you keep.
- The wash layers: which study becomes which layer, the least shape (mm²) each layer lays, which layer is a glaze.
- The paints in the box (`washes.paints`).
- When to stop.

## Hard rules

- No per-cell colour: a wash is a whole shape with one mix; detail comes from strokes, never from copying pixels.
- The planted-pattern test: a faint pattern planted in the subject must not appear on the sheet (gate 0.05).
- Whole strokes: every line is a stroke a hand could pull; nothing is stamped or filled cell by cell.
- The painter never reads the subject to paint; it reads your plan and the files your plan names.

## What is scored

- The scorecard headline (washes and strokes per sheet, small-mark share, hand travel, planned wash that arrives).
- The copy test (planted pattern at 1.8 and 3.4 mm, within 0.05 of zero).
- A replay review: the moving replay judged against a person's order, blind.

## Not yet executable

- `plan.json` itself: today the painter takes these choices as command-line options (`--drawingfile`, `--washplan
  FILE[:MIN[:glaze]],...`, `--paints`, `--sheetmm`, `--seed`); `bench/v6/plan-args.mjs` maps the plan to them. The painter
  does not yet read a `drawing` or `washes.layers` section from a plan file.
- The wash plan is computed inside the painter from the study images. Its shapes, mixes, order and brushes are written to
  `value-plan.json` after the fact; a model cannot yet write or edit them as a plan and have them executed.
- Brush per shape, wet or dry underlayer, charging in and when to wait are the study plan's own rules today; a plan
  cannot set them per shape.
- Looking at the sheet mid-replay and revising: the painter has stops (`--pausedir`), but no V6 session drives them yet.
- The image-model tools (line drawing, block-in study) are scripts on the owner's machine, not yet callable from a
  sandboxed model session.
- Scoring: `scorecard.py` and the planted-pattern runner live outside the repo (`copytest/`), not in `npm run bench:score`.
