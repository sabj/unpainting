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
- `own-script-brief.md`: the brief for writing your own painting script (the format, the kit, the paints).
- `choice.json`: your choice. What it holds when you stop is painted.

## Commands

Run them from this folder. A plan takes from under a minute to several minutes on the CPU. A look is a painting: it
takes about 5 to 15 minutes (longer when the machine is busy, and as long as a full painting, half an hour or more,
for an edited plan). A command that is still working after about 50 seconds returns with the words "still working";
run `./unpaint wait` (again and again, as often as need be) to get its answer. Give your shell commands a timeout of
at least 60 seconds. Waiting is not counted in your time: neither the planner's minutes nor a look's painting.

| Command | What it does | What it returns | Limit |
|---|---|---|---|
| `./unpaint status` | nothing | your time used and left, looks used and left, the plans made so far | none |
| `./unpaint plan` | runs the wash planner on your present `choice.json` (and your script or edited plan, if the choice names one) | whether it compiled, or why it was refused, and its counts (shapes or passages, washes, strokes, widest brush, washes by stage, and how far the hand jumps between consecutive strokes of one passage, median and worst, in mm; for an edited plan also how many washes you left untouched, changed, moved, merged, left out and added). Nothing else: no picture and no wash data | none |
| `./unpaint look` | the same, then PAINTS your present choice for real, small, through drying, and shows you the dried sheet | `looks/N/beside.png` (your painting as it dried, the subject, the middle study, side by side), `looks/N/stages.png` (the subject, then your sheet at 10, 25, 50, 75 and 100% of the strokes: the order of the work), `looks/N/numbers.txt` (each named form measured on the DRIED sheet against the study and against your plan, marked when it is TOO DARK or TOO PALE, and every wash), `looks/N/plan.json` (every wash as data, as in `auto/plan.json`), `looks/N/plan.png` (the plan as a diagram) | LOOKS_LIMIT |
| `./unpaint wait` | waits for the answer of the command that said "still working" | that answer | none |

A choice the planner refuses costs no look. A painting that fails on this side costs no look either: the answer
says NOT PAINTED, and you may ask again. A look at a choice you have already looked at still costs a look.

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
| The drawing's medium | `"outlinemedium": "graphite"`, `"ink"` or `"auto"` in a settings choice | pencil or waterproof ink for the opening drawing. The lines themselves are laid as the drawing file has them: you cannot choose, drop or weight single lines |
| The plan, wash by wash | an edited plan (below) | each wash's colour, strength, brush, direction, edge (hard, wet on wet, beside damp), its place in the order and its wet sitting; leave out, merge, add your own passages |
| The painter itself | your own script (`own-script-brief.md`) | every passage: its shape, paint and dilution, brush and width, paper wet, damp or dry, what it is laid into, how long the sheet dries first, stroke paths, pressure and hold, the order, the lights kept as paper. Write strokes in the order a hand would travel: finish one area before the next, neighbours after each other, long strokes before short; the replay is watched |
| The preview | `./unpaint look` | the painter run for real, small: the dried sheet, the stages, each form measured on the dried sheet |
| The compile check | `./unpaint plan` | whether the planner takes your choice, and its counts |
| Your shell | any command in this folder | measure the input pictures, compute positions and colours, write and check your files, keep notes |

Given and fixed in this session: the three studies, the named forms and their labels, the drawing file, the sheet
size, and the painter's guard. You cannot ask for new studies, new masks or a new drawing here.

## Editing the plan

**How long a check takes.** `./unpaint plan` on your own script answers in about a minute. An edited plan is slower
the first time it is planned in a session (it can take ten minutes while the machine is busy); after that an edit is
checked in about a minute, and every fault of the edit is reported in one answer (below). The waiting is not counted
in your time.

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
| its strength | `"strength": 0.6` (0.05 to 4) | the same paint, that many times as much: under 1 paler, over 1 darker |
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
  up to `nearestWithin` L* lighter than what is under it (8 as the file comes; it is yours to change, 0 to 40) is
  laid as the nearest that can be, a faint wash of your colour, and the answer says so in a note. A colour lighter
  than that is refused, with the washes that lie under it and the lightest colour that would be accepted there. To
  make a place lighter, pale or leave out what is under it.
- `./unpaint plan` checks the file and costs nothing. It reports EVERY fault of the edit at once, each with its
  wash and what would be accepted, so correct them all before you plan again; and it lists as notes what it laid
  the nearest way (a colour, a brush too wide for its wash, strokes too small for water). After the first plan of the
  session an edit is checked in about a minute. Brush, direction and soft edges show in a look's dried sheet, not in
  the plan's diagram.

Your shell is yours: read the files, measure the input pictures (sampling a colour or a position is fair), compute,
keep notes, write and check your script with your own code. The folder is all there is to work from: the painter, its
planner and other sessions are out of reach, and a session whose commands name them is not painted. A plan is
painted, drawn or measured against the subject only by `./unpaint look`.
