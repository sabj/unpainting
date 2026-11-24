# This folder and its tools

All positions are sheet millimetres, x to the right, y down; the sheet is `SHEET_W` by `SHEET_H` mm. Every picture in
`inputs/`, and every look's `beside.png`, carries the same millimetre grid (red numbers across, blue down).

**A look paints your plan for real, small, and shows you the dried sheet.** The painter that will paint your final
choice lays your present choice on a small sheet (the same millimetres, fewer cells), with real water, pigment and
brush, lets it dry, and you are shown what dried.


## Pictures are to look at; data is for your code

**No program may read a picture.** The pictures are the subject (`inputs/source.png`), the studies
(`inputs/study-1.png` to `study-3.png`), any picture of an earlier painting you were handed, and a look's `beside.png`
and `stages.png`. Open them with your own image viewer and look. A script or shell command that opens, copies or
converts one is refused by the system, and reading a picture with code disqualifies the try: the session is recorded
and nothing of it is painted. Do not name a picture in a script.

The data is yours to read with any code: `inputs/forms.json` and `inputs/forms-ids.png`, `inputs/forms.png`,
`inputs/drawing.png`, `drawing/lines.json` and `drawing/all-lines.png`, `resources/` when you were handed it, every
look's `numbers.txt`, `plan.json`, `plan.png` and `sheet.png` (your own dried sheet alone), and every file you write.

The subject, the studies and a handed painting lie in the folder when you start. They are put away each time you
plan or look. `./unpaint show inputs/source.png` brings one back until your next plan or look: the subject costs
SHOW_COST of a look unit each time (the same budget as your looks), the others nothing; every showing is counted.

## Files

INPUT_LIST
- `inputs/forms-ids.png` and `inputs/forms.json`: the named forms as data. The PNG is the sheet as a grey image whose
  pixel value is the form's number (0: no named form); the JSON lists each number, name, kind and box in mm.
- `drawing/lines.json`: every line of the drawing as a row you can choose by (see "Choosing the drawing's lines").
  `drawing/all-lines.png` shows every line the painter lays on its own. On a pencil drawing that leaves out the lines
  tagged `drop` (hatching, tone, texture) other than those that place a form (contours, part `outline`; lay-in
  strokes, phase `layin`; inner contours of the growth, part `inner` and phase `growth`; and the strokes of the
  drawing's most important lines, a quarter of them by the line file's `contribution`, not tone or fill; and the
  strokes in and round a named feature of a face, an eye, a nose, the lips or mouth), which it lays no darker than the drawing's own lay-in lines (the most important up to twice that): a pencil
  lay-in places the forms and the washes model them. On a pen drawing
  every line is laid, the `drop` ones too, since there the lines carry the modelling.
- `mine/`: after a plan or a look of a choice that names lines of your own: `mine/drawing.png` (your lines: grey
  before the washes, black after them).
- `own-script-brief.md`: the brief for writing your own painting script (the format, the kit, the paints).
- `choice.json`: your choice. What it holds when you stop is painted.
- `self-review.md`: yours to write before you stop if you wish (`TASK.md`, "Before you stop"): the five worst
  differences between your last look's dried sheet and the subject, and whether a major fault remains. It is kept
  with the session; nothing depends on it.
- `seen.md`: only when you were handed pictures beside the inputs (Auto's painting in `auto-result/`, or your previous
  painting in `previous/`): one line on each, written before your first plan (`TASK.md` says which).

## Tools

TOOLS_NOTE

## Commands

Run them from this folder. A plan takes from under a minute to several minutes. A look is a painting: it
takes about 3 to 8 minutes, as measured in earlier sessions (longer when the machine is busy). A command that is still working after about 50
seconds returns with the words "still working"; run `./unpaint wait` (again and again, as often as need be) to get
its answer. Give your shell commands a timeout of at least 60 seconds. The clock of this try is the wall clock: a
plan's minutes and a look's painting are on it.

| Command | What it does | What it returns | Limit |
|---|---|---|---|
| `./unpaint status` | nothing | what is used of this try's budget (minutes on the clock, look units, returns to an earlier choice) and the plans made so far | none |
| `./unpaint plan` | compiles your present `choice.json` and the script it names | whether it compiled, or why it was refused, and its counts (passages, washes, strokes, widest brush, washes by stage, and how far the hand jumps between consecutive strokes of one passage, median and worst, in mm), what each erase will take, and every WARNING on your choice (each is laid as you wrote it; heed or ignore it). Nothing else: no picture and no wash data | none |
| `./unpaint look` | the same, then PAINTS your present choice for real, small, through drying, and shows you the dried sheet | `looks/N/beside.png` (your painting as it dried, the subject, the middle study, side by side), `looks/N/stages.png` (the subject, then your sheet at 10, 25, 50, 75 and 100% of the strokes: the order of the work), `looks/N/numbers.txt` (each named form measured on the DRIED sheet against the study and against your plan, marked when it is TOO DARK or TOO PALE, and every wash), `looks/N/plan.json` (every wash of your script as data), `looks/N/plan.png` (the plan as a diagram), `looks/N/sheet.png` (your dried sheet alone: the one picture of a look your code may read) | its cost in look units, of LOOKS_MOST for this try (the benchmark's budget) |
| `./unpaint look --until S` | the same, stopped after stage S of your plan (1 the first washes) and dried there; nothing after it is painted | the same files; `numbers.txt` begins with what is on the paper and what is still to come | that stage's share of the plan's washes, of the whole look's price |
| `./unpaint look --region x0,y0,x1,y1` or `--region FORM NAME` | your own script only: paints the passages that touch that box (sheet millimetres) or that named form's box, and what they are laid into, by themselves on the sheet | the same files | the share of your script's passages that touch the region, of the whole look's price (with `--until` too: both shares multiplied). A wide box touches most passages and saves little: `./unpaint cost` says before you spend |
| `./unpaint cost [--until S] [--region ...]` | prices that look of your present choice and paints nothing | the cost in units and what you have left | none |
| `./unpaint show FILE` | brings a picture that was put away back into the folder, to look at (`inputs/source.png`, a study, a handed picture; several names may follow) | where the picture lies, and what it cost | `inputs/source.png`: SHOW_COST of a unit; any other: free |
| `./unpaint wait` | waits for the answer of the command that said "still working" | that answer | none |

A choice that is refused costs no look. A choice that is exactly one you planned before and then left is a
return to an earlier choice: it is counted, and past REVERTS_MOST of them it is refused (`TASK.md` says why). A painting that fails on this side costs no look either: the answer
says NOT PAINTED, and you may ask again. The same look of a choice you have already looked at renders nothing and
costs nothing. A look's price is fixed: 0.3 units for your whole plan at half size, its share when stopped at a stage
or cut to a region, and never under 0.2, whatever the look holds. The final, painted at full size after you stop,
is not charged. How you paint (water, strokes, waits, dryings) is not charged. One guard only, to keep the machines free: a painting that runs to more than ten times the water steps of
the automatic painting of this subject is stopped and said so; it costs no look.

What a look's painting is, exactly:

- Your own script is written in millimetres, so the look paints the same script on half the cells across: the same
  washes, strokes, water and drying, with a coarser grain than the final sheet.
- The dried sheet shows what the plan's diagram cannot: brush marks, direction, soft and hard edges, how much
  pigment really lay down, blooms and back-runs, and what a later wash did to the one under it.

## Everything you can call or change

| Tool | How you reach it | What is yours to decide |
|---|---|---|
| The paint box | `palette` in your own script | which paints the picture is mixed from (`own-script-brief.md` lists the box) |
| The drawing's medium | `"medium": "pencil"`, `"pen"` or `"none"` beside your script (below) | what the drawing is drawn in, whatever the subject seems to be drawn in: pencil, pen (its ink in the next row), or no drawing |
| The pen's ink | `"ink": "waterproof"` or `"soluble"` beside your script | waterproof: set before the washes, a wash over it moves none. soluble: it rewets and bleeds into a wash laid over it; the painter stops a painting whose first wash would move more than 2% of it. Left unsaid, your script is laid over waterproof ink |
| The drawing's lines | `"lines": "my-lines.json"` beside any kind of choice (below) | when each prepared line is drawn (before the first wash, with a stage of the washes, after them over the dry paint) or not at all, and how dark each is: by named form, by kind of line, by length, width or darkness, or one by one |
| Lines of your own | `"own"` in that same file (below) | new lines, drawn where you put them point by point: pen or pencil, their width and darkness, before or after the washes |
| The painter itself | your own script (`own-script-brief.md`) | every passage: its shape, paint and dilution, brush and width, paper wet, damp or dry, what it is laid into, how long the sheet dries first, stroke paths, pressure and hold, the order, the lights kept as paper. Write strokes in the order a hand would travel: finish one area before the next, neighbours after each other, long strokes before short; the replay is watched |
| The preview | `./unpaint look` | the painter run for real, small: the dried sheet, the stages, each form measured on the dried sheet |
| The compile check | `./unpaint plan` | whether your choice compiles, and its counts |
| Your shell | any command in this folder | read the data (above), compute positions, measure your own dried sheet (`looks/N/sheet.png`), write and check your files, keep notes; never a picture |

Given and fixed in this session: the three studies, the sheet size, the painter's guard and its seed. New studies
cannot be asked for here.

**What is refused and what is only warned of.** A file that cannot be read, a request the painter cannot lay (more
paints than the sheet holds, a brush that is not in the kit, a wash with no cells) are refused, with the reason. A
choice that may spoil the painting is NOT refused: it is laid as you wrote it and the answer lists it under WARNINGS
(a weight or a strength far outside the usual, pencil over dry paint, a rule that matches nothing, a colour lighter
than what is under it). A warning is information. Ignore
it if you meant what you wrote; the result shows in your next look.

## The drawing: its medium, its lines, and lines of your own

**The medium.** `"medium"` beside any kind of choice: `"pencil"` (every drawn line in graphite), `"pen"` (every drawn
line in ink, waterproof unless you say `"ink": "soluble"`) or `"none"` (none of the prepared lines is drawn; lines of your own still are). Leave it out
and the drawing is as prepared; `drawing/lines.json` says at its top which that is. Example:
`{"kind": "script", "script": "script.json", "medium": "pen", "lines": "my-lines.json"}`.

**The prepared lines.** `drawing/lines.json` lists every line: `id`, `part` (outline, inner, small, texture, hatch,
tone, fill), `phase`, `object`, `tagged` (`ink`: a drawn pen line; `layin`: a pale contour that places a form; `drop`:
hatching, tone or texture the drawing's maker would leave out), `dark` (0 to 1), `lengthMm`, `widthMm`, `boxMm`, and
`form` (the named form most of it lies in, or `none`). Every line starts as the painter lays it on its own, at its own
darkness and at its own time (`auto`): a pen drawing is inked whole before the first wash; a pencil drawing goes down
in phases with the washes, as a person works: the lay-in and the lines that place the first washes before them, each
other line just before the later wash that needs it (the wash whose edge it draws or that covers it), on dry paper,
and detail no wash claims with the last stage; on a pencil drawing the `drop` ones that do not place a form (see `drawing/all-lines.png` above) start dropped (`{"where": {"tagged": "drop"}, "do": "before"}` draws them), on a pen drawing they are drawn. Write your rules to a file and name it in `choice.json` beside your
script: `{"kind": "script", "script": "script.json", "lines": "my-lines.json"}`.

```json
{ "format": "lines-edit 1",
  "rules": [
    { "where": { "tagged": "drop" }, "do": "drop" },
    { "where": { "form": ["left eye", "right eye"], "part": "outline" }, "do": "after", "weight": 1.5 },
    { "where": { "lengthBelowMm": 4, "darkBelow": 0.2 }, "do": "drop" },
    { "where": { "ids": [212, 213] }, "weight": 0.5 } ],
  "own": [
    { "points": [[120, 88], [131, 84], [142, 86]], "medium": "pen", "widthMm": 0.5, "dark": 0.9, "when": "after" },
    { "points": [[60, 200], [95, 214]], "medium": "pencil", "widthMm": 0.3, "dark": 0.4, "when": "before" } ] }
```

Rules are applied in order and a later rule wins. `where` holds conditions that must all be true: `ids`, `object`,
`form`, `part`, `phase`, `tagged` (one value or a list), `darkAbove`, `darkBelow`, `lengthAboveMm`, `lengthBelowMm`,
`widthAboveMm`, `widthBelowMm`; `{}` is every line. `do` is `auto` (the painter's own time, above), `before`
(drawn before the first wash), `"stage N"` (drawn with stage N of your plan: just before that stage's first wash over
the line, else before the stage's first wash, on dry paper), `after` (drawn over the dry washes when the painting is
done: a closing line) or `drop` (not drawn). `weight` multiplies the line's
darkness (usually 0.1 to 4; a line never goes past black). A prepared line's shape and width are not changed: for a
different line, drop it and draw your own. There is no limit on the number of rules.

**Lines of your own.** `own` lists lines you draw yourself; a file may hold `own` alone, `rules` alone, or both. Each
is a path of two or more `points` in sheet millimetres, drawn at an even `widthMm` (a pen or pencil draws about 0.2 to
1 mm; default 0.4) and `dark` (0 to 1; default 0.7), in `medium` `"pen"` or `"pencil"` (default pencil), `when`
`"before"` the first wash, `"stage N"`, `"after"` the washes or `"auto"` (default before). They are drawn after the prepared lines of the same time,
in the order you list them. There is no limit on how many. Pen and pencil may be mixed on one sheet.

What to know:

- Ink set before the washes stays put under them; pencil is pale and the washes cover it. Pen over dry washes is the
  crisp closing line. Pencil over dry washes is laid too, but it sits grey on top of the paint and hardly shows over
  a dark wash: the answer warns you, and it is drawn if you leave it.
- Choosing `"pen"` for a drawing prepared in pencil lays its lines in ink as dark as they are drawn. Its hatching and
  texture (tagged `drop`) start dropped as on any pencil drawing; if your rules draw them, in ink they are as dark as
  drawn and the answer warns you.
- On a pen drawing the ink of your own script is set before the washes, unless your choice says `"ink": "soluble"`.
- `./unpaint plan` checks the file, counts what it does and lists its warnings; `mine/drawing.png` shows the result
  (grey: before the washes; black: after them). The lines themselves show in a look's dried sheet.
- Rubbing out (advice, yours to use or not): a pencil lay-in line that the paint has replaced, or a line drawn twice,
  can be rubbed out with an erase passage in your own script, anywhere in the order:
  `{ "id": "e1", "kind": "erase", "stage": 1, "widthMm": 3, "strokes": [{ "points": [[x, y, 1], [x, y, 1]] }] }`
  (or a `region` with `handling.pressure`). Before the first wash a firm rub takes most of the pencil off; after a wash
  has dried it takes far less (about a fifth under a pale wash, a twentieth under a medium one, less under a dark one). The eraser needs dry
  paper: leave its `wait` at `dry`. `./unpaint plan` says what each erase will take.

Your shell is yours: read the data, compute, keep notes, write and check your script with your own code. The
pictures are for your eyes only (see the top of this page): colour and place are judged by looking, and by the
millimetre grid every picture carries. The folder is all there is to work from: the painter and
other sessions are out of reach, and a session whose commands name them is not painted. A plan is painted, drawn or
measured against the subject only by `./unpaint look`.
