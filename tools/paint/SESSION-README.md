# This folder and its tools

All positions are sheet millimetres, x to the right, y down; the sheet is `SHEET_W` by `SHEET_H` mm. Every picture in
`inputs/` and `auto/`, and every look's `beside.png`, carries the same millimetre grid (red numbers across, blue down).

**A look paints your plan for real, small, and shows you the dried sheet.** The painter that will paint your final
choice lays your present choice on a small sheet (the same millimetres, fewer cells), with real water, pigment and
brush, lets it dry, and you are shown what dried.


## Files

INPUT_LIST
- `inputs/forms-ids.png` and `inputs/forms.json`: the named forms as data. The PNG is the sheet as a grey image whose
  pixel value is the form's number (0: no named form); the JSON lists each number, name, kind and box in mm.
- `auto/plan.png`: the code planner's plan as a picture (each wash's colour where its strokes fall, all layers down).
- `auto/washes.txt`: that plan as a table, one line a wash.
- `auto/plan.json`: that plan as data: every wash in painting order (stage, kind, brush, strokes, area, colour, how it
  is laid, its box, the named forms it covers).
- `auto/plan-to-edit.json`: the same plan as the file you edit (see "Editing the plan" below). Leave it as it is;
  work on a copy.
- `auto/settings.json`: the planner's settings, their present values, and what each does.
- `drawing/lines.json`: every line of the drawing as a row you can choose by (see "Choosing the drawing's lines").
  `drawing/all-lines.png` shows every line the painter lays today. `inputs/drawing.png` shows fewer: it leaves out
  the lines tagged `drop` (hatching, tone, texture), which the painter lays all the same unless you drop them.
- `mine/`: after a plan or a look of a choice that names lines or forms of your own: `mine/drawing.png` (your lines:
  grey before the washes, black after them), `mine/forms.png`, `mine/forms-ids.png`, `mine/forms.json` (your forms).
- `own-script-brief.md`: the brief for writing your own painting script (the format, the kit, the paints).
- `choice.json`: your choice. What it holds when you stop is painted.
- `self-review.md`: yours to write before you stop if you wish (`TASK.md`, "Before you stop"): the five worst
  differences between your last look's dried sheet and the subject, and whether a major fault remains. It is kept
  with the session; nothing depends on it.
- `seen.md`: only when you were handed pictures of a finished painting (`previous/`, `auto-painting/`): one line on
  each, written before your first plan (`TASK.md` says which).

## Commands

Run them from this folder. A plan takes from under a minute to several minutes on the CPU. A look is a painting: it
takes about 5 to 15 minutes (longer when the machine is busy, and as long as a full painting, half an hour or more,
for an edited plan). A command that is still working after about 50 seconds returns with the words "still working";
run `./unpaint wait` (again and again, as often as need be) to get its answer. Give your shell commands a timeout of
at least 60 seconds. The clock of this try is the wall clock: the planner's minutes and a look's painting are on it.

| Command | What it does | What it returns | Limit |
|---|---|---|---|
| `./unpaint status` | nothing | what is used of this try's budget (minutes on the clock, look units, returns to an earlier choice) and the plans made so far | none |
| `./unpaint plan` | runs the wash planner on your present `choice.json` (and your script or edited plan, if the choice names one) | whether it compiled, or why it was refused, and its counts (shapes or passages, washes, strokes, widest brush, washes by stage, and how far the hand jumps between consecutive strokes of one passage, median and worst, in mm; for an edited plan also how many washes you left untouched, changed, moved, merged, left out and added), and every WARNING on your choice (each is laid as you wrote it; heed or ignore it). Nothing else: no picture and no wash data | none |
| `./unpaint look` | the same, then PAINTS your present choice for real, small, through drying, and shows you the dried sheet | `looks/N/beside.png` (your painting as it dried, the subject, the middle study, side by side), `looks/N/stages.png` (the subject, then your sheet at 10, 25, 50, 75 and 100% of the strokes: the order of the work), `looks/N/numbers.txt` (each named form measured on the DRIED sheet against the study and against your plan, marked when it is TOO DARK or TOO PALE, and every wash), `looks/N/plan.json` (every wash as data, as in `auto/plan.json`), `looks/N/plan.png` (the plan as a diagram) | its cost in look units, of LOOKS_MOST for this try (the benchmark's budget) |
| `./unpaint look --until S` | the same, stopped after stage S of your plan (1 the first washes) and dried there; nothing after it is painted | the same files; `numbers.txt` begins with what is on the paper and what is still to come | that stage's share of the plan's washes |
| `./unpaint look --region x0,y0,x1,y1` or `--region FORM NAME` | your own script only: paints the passages that touch that box (sheet millimetres) or that named form's box, and what they are laid into, by themselves on the sheet | the same files | the share of your script's passages that touch the region (with `--until` too: both shares multiplied). A wide box touches most passages and saves little: `./unpaint cost` says before you spend |
| `./unpaint cost [--until S] [--region ...]` | prices that look of your present choice and paints nothing | the cost in units and what you have left | none |
| `./unpaint wait` | waits for the answer of the command that said "still working" | that answer | none |

A choice the planner refuses costs no look. A choice that is exactly one you planned before and then left is a
return to an earlier choice: it is counted, and past REVERTS_MOST of them it is refused (`TASK.md` says why). A painting that fails on this side costs no look either: the answer
says NOT PAINTED, and you may ask again. The same look of a choice you have already looked at renders nothing and
costs nothing. No look costs less than 0.05 units: the sheet is set up, drawn on and dried whatever is painted.

What a look's painting is, exactly:

- Your own script is written in millimetres, so the look paints the same script on half the cells across: the same
  washes, strokes, water and drying, with a coarser grain than the final sheet.
- The code planner under your settings is planned again for the small sheet, so its shapes are a little broader in
  the look than they will be at full size, and the wash table of the look is that small plan's.
- An edited plan exists on the full sheet only: its look is painted at full size and takes as long as a painting.
- The dried sheet shows what the plan's diagram cannot: brush marks, direction, soft and hard edges, how much
  pigment really lay down, blooms and back-runs, and what a later wash did to the one under it.

## Everything you can call or change

| Tool | How you reach it | What is yours to decide |
|---|---|---|
| The wash planner | a settings choice (`auto/settings.json` lists each setting, its present value and meaning) | for each study: how many colours it is read into (`studyN.clusters`), how near colours join (`studyN.join`); the least shape each study lays (`floors`); for the block-in: the most shapes (`study1.shapes`), corner rounding (`study1.round`), the widest brush inside a face, figure or animal (`study1.formbrush`), the pale base wash of each soft form (`study1.formbase`) |
| The paint box | `"paints": "ochre,sienna,..."` in a settings choice; `palette` in your own script | which paints the picture is mixed from (`own-script-brief.md` lists the box) |
| The drawing's medium | `"medium": "pencil"`, `"pen"` or `"none"` beside any kind of choice (below) | what the drawing is drawn in, whatever the subject seems to be drawn in: pencil, waterproof pen, or no drawing |
| The drawing's lines | `"lines": "my-lines.json"` beside any kind of choice (below) | which prepared lines are drawn before the washes, which after them over the dry paint, which not at all, and how dark each is: by named form, by kind of line, by length, width or darkness, or one by one |
| Lines of your own | `"own"` in that same file (below) | new lines, drawn where you put them point by point: pen or pencil, their width and darkness, before or after the washes |
| When the drawing is laid | `"drawingorder"` (`first`, `both`, `last`, `none`) and `"drawinglast..."` in a settings choice | used when you name no lines or medium of your own; with lines or a medium of your own the order follows them |
| The named forms | `"forms": "my-forms.json"` in a settings choice (below) | merge forms, cut a new form out with a polygon, rename a form, change its kind (face, fur, sky...): the planner then treats it as that kind |
| The planner, form by form | `"perForm": {"cat face": {...}}` in a settings choice (below) | inside one named form: how many colours and shapes the block-in has there, its least shape, its widest brush, its base wash, and how much of each later study is laid there |
| The plan, wash by wash | an edited plan (below) | each wash's colour, strength, brush, direction, edge (hard, wet on wet, beside damp), its place in the order and its wet sitting; leave out, merge, add your own passages |
| The painter itself | your own script (`own-script-brief.md`) | every passage: its shape, paint and dilution, brush and width, paper wet, damp or dry, what it is laid into, how long the sheet dries first, stroke paths, pressure and hold, the order, the lights kept as paper. Write strokes in the order a hand would travel: finish one area before the next, neighbours after each other, long strokes before short; the replay is watched |
| The preview | `./unpaint look` | the painter run for real, small: the dried sheet, the stages, each form measured on the dried sheet |
| The compile check | `./unpaint plan` | whether the planner takes your choice, and its counts |
| Your shell | any command in this folder | measure the input pictures, compute positions and colours, write and check your files, keep notes |

Given and fixed in this session: the three studies, the sheet size, the painter's guard and its seed. New studies
cannot be asked for here. Forms you change are recorded as yours, not as the reviewed ones.

**What is refused and what is only warned of.** A file that cannot be read, a request the painter cannot lay (more
paints than the sheet holds, a brush that is not in the kit, a wash with no cells), and a locked setting are refused,
with the reason. A choice that may spoil the painting is NOT refused: it is laid as you wrote it and the answer lists
it under WARNINGS (a weight or a strength far outside the usual, pencil over dry paint, a rule that matches nothing, a
colour lighter than what is under it, a per-form setting outside its usual range). A warning is information. Ignore
it if you meant what you wrote; the result shows in your next look.

## The drawing: its medium, its lines, and lines of your own

**The medium.** `"medium"` beside any kind of choice: `"pencil"` (every drawn line in graphite), `"pen"` (every drawn
line in waterproof ink) or `"none"` (none of the prepared lines is drawn; lines of your own still are). Leave it out
and the drawing is as prepared; `drawing/lines.json` says at its top which that is. Example:
`{"kind": "script", "script": "script.json", "medium": "pen", "lines": "my-lines.json"}`.

**The prepared lines.** `drawing/lines.json` lists every line: `id`, `part` (outline, inner, small, texture, hatch,
tone, fill), `phase`, `object`, `tagged` (`ink`: a drawn pen line; `layin`: a pale contour that places a form; `drop`:
hatching, tone or texture the drawing's maker would leave out), `dark` (0 to 1), `lengthMm`, `widthMm`, `boxMm`, and
`form` (the named form most of it lies in, or `none`). Every line starts as the painter lays it today: before the
washes, at its own darkness, the `drop` ones too. Write your rules to a file and name it in `choice.json` beside your
kind of choice: `{"kind": "settings", "settings": {}, "lines": "my-lines.json"}`.

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
`widthAboveMm`, `widthBelowMm`; `{}` is every line. `do` is `before` (drawn before the first wash), `after` (drawn
over the dry washes when the painting is done: a closing line) or `drop` (not drawn). `weight` multiplies the line's
darkness (usually 0.1 to 4; a line never goes past black). A prepared line's shape and width are not changed: for a
different line, drop it and draw your own. There is no limit on the number of rules.

**Lines of your own.** `own` lists lines you draw yourself; a file may hold `own` alone, `rules` alone, or both. Each
is a path of two or more `points` in sheet millimetres, drawn at an even `widthMm` (a pen or pencil draws about 0.2 to
1 mm; default 0.4) and `dark` (0 to 1; default 0.7), in `medium` `"pen"` or `"pencil"` (default pencil), `when`
`"before"` the washes or `"after"` them (default before). They are drawn after the prepared lines of the same time,
in the order you list them. There is no limit on how many. Pen and pencil may be mixed on one sheet.

What to know:

- Ink set before the washes stays put under them; pencil is pale and the washes cover it. Pen over dry washes is the
  crisp closing line. Pencil over dry washes is laid too, but it sits grey on top of the paint and hardly shows over
  a dark wash: the answer warns you, and it is drawn if you leave it.
- Choosing `"pen"` for a drawing prepared in pencil lays its lines in ink as dark as they are drawn, hatching and
  texture included (they are tagged `drop`); the answer warns you. Drop or pale them if that is not what you want.
- With lines or a medium of your own on a pen drawing the ink is set before the washes (`inkfast` 1, as for your own
  script), unless your settings say otherwise.
- `./unpaint plan` checks the file, counts what it does and lists its warnings; `mine/drawing.png` shows the result
  (grey: before the washes; black: after them). The lines themselves show in a look's dried sheet.

## Your own named forms

The planner uses the named forms: a form of a soft kind (face, fur, animal, hair, figure, clothing, sky, water)
begins with one pale base wash; inside a face, eye, animal, fur, figure, hair or clothing only rounds are used; every
wash records the forms it covers; and a look measures each form. Change them with a file named in a settings choice:
`{"kind": "settings", "settings": {}, "forms": "my-forms.json"}`.

```json
{ "format": "forms-edit 1", "edits": [
  { "merge": ["left ear", "right ear"], "name": "ears", "kind": "fur" },
  { "split": "cat face", "polygon": [[130, 170], [200, 170], [210, 235], [120, 235]], "name": "muzzle", "kind": "fur" },
  { "rename": "background wash", "to": "background" },
  { "form": "whiskers", "kind": "fur" } ] }
```

Edits are applied in order; a later edit may name a form an earlier one made. `merge` makes several forms one.
`split` cuts the part of a form inside your polygon (sheet millimetres) out as a new form; `"split": "no named form"`
takes the polygon's paper that is in no form, `"split": "any"` everything inside it. A kind is one of face, eye, fur,
sky, animal, figure, clothing, foliage, ground, water, hair, shadow, building, boat, other. The forms you were given
are not altered: yours are written beside them and marked as yours and not reviewed, in the plan and in the record.
`mine/forms.png` shows them. An edited plan and your own script do not take `forms`: the first is an edit of the plan
made from the forms as given, the second does not read forms.

## Planner settings for one form

`auto/settings.json` sets the planner for the whole sheet. `perForm` in a settings choice sets it inside one named
form (by the form's name, yours if you edited the forms):

```json
{ "kind": "settings", "settings": { "study3.lay": 0 },
  "perForm": { "cat face": { "study1.clusters": 24, "study1.floor": 3 },
               "left eye": { "study3.lay": 1, "study3.lightest": 70, "study3.floor": 0.5 },
               "background foliage": { "study1.shapes": 4, "study2.lay": 0 } } }
```

| Setting | Study | In that form |
|---|---|---|
| `study1.clusters`, `study1.join` | block-in | the form is read into colours of its own: more colours or a smaller join give more, closer shapes there, fewer give broader ones. Its shapes then end at its outline. The rest of the sheet is read as before |
| `study1.shapes` | block-in | the most shapes the form may have |
| `study1.floor`, `study2.floor`, `study3.floor` | any | the least shape (mm2) that study lays there |
| `study1.brush` | block-in | the widest wash brush (mm) there, whatever the form's kind |
| `study1.base` | block-in | 1: one pale base wash over the whole form, into clean water, whatever its kind; 0: none |
| `study2.lay`, `study3.lay` | later | 1: what that study adds is laid there, also on skin (which takes no touches otherwise) and also when the study's own `lay` is 0; 0: nothing of it is laid there |
| `study2.largest`, `study3.largest` | later | the largest touch (mm2) kept of what that study adds |
| `study2.lightest`, `study3.lightest` | later | touches at least this dark (L*) are kept; higher lays paler ones too |

`study2.lay`, `.largest` and `.lightest` (and the same for study 3) are also settings for the whole sheet, in
`"settings"`: `"study3.lay": 0` with `"study3.lay": 1` for the eyes lays the third study in the eyes alone.

## Editing the plan

**How long a check takes.** `./unpaint plan` on your own script answers in about a minute. An edited plan is slower
the first time it is planned in a session (it can take ten minutes while the machine is busy); after that an edit is
checked in about a minute, and every fault of the edit is reported in one answer (below).

`cp auto/plan-to-edit.json my-plan.json`, change `my-plan.json`, and write
`{"kind": "plan", "plan": "my-plan.json", "why": "..."}` into `choice.json`. Keep `format` and `of` as they are.
`washes` is the plan in painting order, one entry a wash:

```json
{ "wash": 12, "session": 7, "colour": [201, 150, 98], "strength": 1, "brushMm": 13, "direction": null,
  "lay": "wet on dry", "about": { "what": "...", "stage": 3, "laidIn": "lanes", "strokes": 14, "areaMm2": 412,
  "boxMm": [60, 110, 95, 140], "forms": "cat face 80%" } }
```

`wash` is the wash's number, the same as in `auto/washes.txt` and `auto/plan.json`. `about` describes it and is not
read back. An entry you leave as it is, in its place, is painted exactly as the code planner would paint it: the same
cells, the same paint, the same strokes. What you may change:

| Change | How | What happens |
|---|---|---|
| its colour | `"colour": [r, g, b]` | what the place is to read as once the wash is down. The paint is mixed for you, over what is under it by then, to that colour's value |
| its strength | `"strength": 0.6` (usually 0.05 to 4; outside that it is laid as written, with a warning) | the same paint, that many times as much: under 1 paler, over 1 darker |
| its brush | `"brushMm"`: one of `brushesMm` | the wash is laid again in lanes of that brush over the same cells (a wash `laidIn` touches cannot be) |
| its direction | `"direction"`: degrees, 0 the lanes run left to right, 90 top to bottom | laid again in lanes along that direction. `null`: the planner's own, along the shape |
| its edge | `"lay"`: `"wet on dry"` (hard edges), `"wet on wet"` (into clean water: soft all round), `"beside damp"` (against the entry just before it in the same session while that is damp: a soft join between the two) | the same cells and paint, laid that way |
| the order | move the entry | it is laid when its turn comes. Later means over, earlier means under |
| the wet session | `"session"`: consecutive entries with the same value are one sitting, laid without drying between them; the sheet dries between sessions | |
| leave it out | delete the entry | it is not painted |
| merge | `{ "merge": [12, 13, 15], "session": "face" }` in place of those entries, with any of the fields above | one wash over the cells of all of them (small gaps between them closed), holding the same paint in all, or mixed to the `colour` you give |
| add your own | `{ "own": { "id": "a1", "what": "...", "kind": "wash", "stage": 3, "region": [[x, y], ...], "brushMm": 13, "colour": [r, g, b], "handling": { "direction": 20 } }, "lay": "wet on wet" }` | a passage written as `own-script-brief.md` describes (`wash`, `strokes`, `touches`, `lines`), with `colour` in place of `paint` and `brushMm` in place of `brush`; no charges |

What to know before you edit:

- Nothing else is re-planned. A wash keeps its own paint when you change what is under it: leave out or pale an
  under-wash and the washes over it come out paler there; darken it and they come out darker.
- A wash laid again (brush, direction, merge) is laid evenly, without the planner's cut edge or its load varied
  along the wash.
- Watercolour only darkens: a wash cannot make its place lighter than what is laid under it by then. A `colour`
  lighter than what is under it is not refused: it is laid as the nearest that can be, a faint wash of your colour
  that lightens nothing, and the answer says so (as a WARNING when it is more than `nearestWithin` L* lighter, 8 as
  the file comes, with the washes that lie under it). To make a place lighter, pale or leave out what is under it.
- `./unpaint plan` checks the file and costs no look. It reports EVERY fault of the edit at once (what cannot be
  read or laid), each with its wash and what would be accepted; and it lists as notes and warnings what it laid
  the nearest way (a colour, a brush too wide for its wash, strokes too small for water). After the first plan of the
  session an edit is checked in about a minute. Brush, direction and soft edges show in a look's dried sheet, not in
  the plan's diagram.

Your shell is yours: read the files, measure the input pictures (sampling a colour or a position is fair), compute,
keep notes, write and check your script with your own code. The folder is all there is to work from: the painter, its
planner and other sessions are out of reach, and a session whose commands name them is not painted. A plan is
painted, drawn or measured against the subject only by `./unpaint look`.
