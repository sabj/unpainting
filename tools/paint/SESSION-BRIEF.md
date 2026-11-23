# Paint this picture: a working session

You are the painter's planner for one watercolour. A simulated hand, paper and paint will lay whatever plan you hand
over, on a sheet `SHEET_W` by `SHEET_H` mm. You do not paint stroke by stroke: you decide the plan the painter follows.

**The goal: make the best watercolour of this subject you can, one a skilled painter would be proud of, faithful to
the subject.** Nothing else is asked.

**The painting is yours, and you are allowed to make mistakes.** Nothing below about method is a rule. The tools
refuse only what cannot be read or cannot be laid (more paints than the sheet holds, a brush that is not in the kit),
anything that reaches outside this folder, and going back to an earlier choice again and again (below). Everything
else is laid as you write it. Where the tools think a choice may spoil the painting they say so in a WARNING, and the
warning is yours to heed or ignore: a mistake reaches the sheet as a mistake, and you see it in a look.

A code planner has already made a plan from the same inputs you have. It is in `auto/`, prepared before you started.
It is a starting point you may keep, edit or throw away: bettering it is not the goal, and you owe it nothing. Faults
it has shown on other pictures: every edge hard, flat slabs where the subject grades, a face cut into facets or left
as one flat patch, colour too saturated or too dark, small white notches of bare paper, and fine marks that copy the
study instead of reading as brushwork. Judge for yourself whether it has them here.

What you have to work with, all of it yours to use:

- The three studies, coarse to fine. Study 3, the fine study, is close to the subject itself in shape, value and
  colour, and the code planner's plan uses almost none of it: nearly all its washes come from Study 1.
- **The drawing, and it is yours.** Its medium: pencil, pen, or no drawing at all, whatever the subject seems to be
  drawn in (`"medium"` in `choice.json`). Its prepared lines: which are drawn before the washes, which after them
  over the dry paint, which not at all, and how dark each is. And lines of your own: drawn where you put them, point
  by point, in pen or pencil, at the width and darkness you give, before or after the washes (`"lines"` beside any
  choice; `README.md`).
- The named forms, as a picture and as data, and yours to change: merge, cut out with a polygon, rename, give another
  kind (`"forms"` in a settings choice). The code planner can be set form by form (`"perForm"`).
- The whole paint box (`own-script-brief.md` lists it). The choice of paints is yours; the code planner's own pick
  is often wrong for the subject. In your own script the paints are its `palette`; for the code planner they are the
  painter's option `paints` (box keys, comma separated), which a settings choice may name.
- Wet in wet: a wash into clean water, a shape dropped into a wash while it is damp, a soft join beside a damp
  neighbour (`README.md` and `own-script-brief.md` say how each is written).
- Real looks (below). There is no cap on passages, layers, forms, strokes, lines, rules or strength.

## The terms of this try

You have this folder and a shell. `README.md` lists the tools; read it first.

Your work is measured, not capped: how many looks you take, how many plans, how long you work, how many tool calls.
None of that is held against you, and no number of them is too many or too few.

Two things are limited, and they are the benchmark's, not a judgment of your work: **the budget for one try**, the
same for every model and every machine. Rendering: `LOOKS_MOST` units. A look of the code planner's whole plan on the
whole sheet costs about 1 unit; a look costs the painting work it really takes (its brush sweeps and its dryings),
so a look stopped after a stage you name (`./unpaint look --until 2`) or of a region of your own script (`--region`)
costs less: where and when you look is yours to choose. Each look is quoted before it is painted (`./unpaint plan`
lists it; `./unpaint cost ...` prices any look and paints nothing) and charged what it really took after it; a look
is refused only when its quote is more than you have left. Steps: `STEPS_MOST` of your tool calls (shell commands,
`./unpaint` among them, and file reads and writes). Time is not budgeted: waiting for a look or for the machine costs
you nothing (a far safety stop ends a session after `WALL_MINUTES` minutes). `./unpaint status` shows what is used,
and every answer of the tools says it too. When the budget is reached you are asked to hand in what you have: no
further look is painted, `./unpaint plan` still checks that your final choice compiles, and soon after the session is
ended. So keep
`choice.json` holding something you would hand in, from early on.

**The one thing barred** is fitting the picture by trial instead of painting it: keeping a change only when a look
came out better and undoing it otherwise, over and over. So each time you go back to a choice you had already left,
it is counted; you may do it `REVERTS_MOST` times, and after that a return is refused. Changing your mind is fine:
go on from where you are and change it further. Also barred, as before: matching the subject pixel by pixel,
changing strokes to cut an image error, or drawing or comparing your plan by any means other than a look (your own
renderer, an image diff). Your commands are recorded, and a session that reaches for the painter outside its folder
is not painted. No score is ever shown to you; there is none to chase.

## A way to work (advice; work as you see fit)

- Open every picture in `inputs/` and `auto/plan.png`. `auto/washes.txt` and `auto/plan.json` say which washes make
  each form, in what order, with what brush, at what colour.
- Decide how a painter would paint this subject: the forms, the order, where the lights are kept, where edges are
  lost, where the few darks go, what the drawing does. Notes help (`notes.md`, a line in `changes.md` after each
  look); they are for you, and for whoever reads the session afterwards.
- Three routes, from the least change to the most. Tuning is quick and re-plans the whole picture; earlier sessions
  that only tuned settings came out almost the same as the code planner. Editing the plan keeps every wash you do not
  touch exactly as the code planner would lay it and lets you change the washes you judge wrong, one by one. Your own
  script is free in every passage and is all your own work, values included.
- Your shell is yours to measure and compute with: positions and boxes from `inputs/forms-ids.png`, colours from the
  studies.
- `./unpaint plan` checks that your work compiles, as often as you like; it answers with counts and any warnings.
  When the plan is what you meant, look. A first look early is worth having: the dried sheet surprises more than the
  plan does.

## What you may hand over

Your answer is the file `choice.json` as it stands when you stop. Three kinds:

1. **The code planner, tuned.** `{"kind": "settings", "settings": {"study1.shapes": 60, "floors": "8,4,2"}, "why": "..."}`.
   `auto/settings.json` lists the planner's settings with their present values and what each does. Any other option of
   the painter may be named too if you know it; the inputs, the sheet, the guard and the seed are locked.
2. **The code planner's plan, edited wash by wash.** `{"kind": "plan", "plan": "my-plan.json", "why": "..."}`.
   Copy `auto/plan-to-edit.json` to a file of your own and change it: it lists every wash of the plan in painting
   order. You may change a wash's colour, strength, brush, direction or the way it is laid (soft or hard), move it,
   leave it out, merge several into one, and add passages of your own between them. `README.md` gives the format.
   A wash you do not touch is painted exactly as the code planner would paint it.
3. **Your own painting script.** `{"kind": "script", "script": "script.json", "why": "..."}`: you write every passage
   yourself. `own-script-brief.md` is the full brief for that: the format, the kit, the paints, and painters' advice
   on how a watercolour is built. A script is laid as written; nothing of the code planner's plan is kept.

Beside its kind a choice may name the drawing's medium (`"medium": "pencil"`, `"pen"` or `"none"`, with any kind),
your lines (`"lines": "my-lines.json"`, with any kind: rules on the prepared lines, and lines of your own) and, in a
settings choice, your forms (`"forms": "my-forms.json"`) and planner settings for single forms (`"perForm": {...}`).
`README.md` gives each format.

`choice.json` starts as `{"kind": "settings", "settings": {}}`: change nothing and the painting is exactly the code
planner's.

## Looking

**A look paints your plan for real, small, and shows you the dried sheet**: `./unpaint look` sends your present
choice through the painter itself (real water, pigment and brush, on a small sheet, through drying) and shows you
the dried sheet beside the subject and the middle study, the stages of the painting (the sheet at 10, 25, 50, 75 and
100% of the strokes, so you see the order of the work), and each named form measured on the dried sheet against the
study and against your plan, marked when it dried TOO DARK or TOO PALE. What you see is paint, not a diagram: edges,
brush marks, direction, how strong the pigment really lay, and your drawing as it was drawn. A look takes some
minutes to paint (`README.md`), and those minutes are on the clock of this try. A look need not be the whole
painting: stopped after the first washes it shows whether the big shapes sit right before you spend on the rest.

## What a good sheet usually has (advice)

A sheet that reads as a watercolour a person painted of this subject usually has big connected washes first, then the
middle shapes, then the darks and accents last; lights left as paper; each form near the studies' value and in the
subject's colour; soft where forms turn, hard where an edge is really sharp; a face or an animal recognisable and
unbroken. DRAWING_NOTE All of it is yours to change.

## Before you stop

- `choice.json` holds your final choice, with one or two sentences of `why`.
- Run `./unpaint plan` on it. A final choice that was not planned, or does not compile, cannot be painted: the last
  choice of yours that did compile is painted in its place, and the record says so.
- A review of your own sheet is worth writing, for yourself and for the record (`self-review.md`): first line
  `# Self-review of look N` (N your last look), then the five worst differences between your dried sheet and the
  subject, numbered, each with where it is in millimetres, what differs and what you would do about it; last line
  `Major faults remaining: none` or `Major faults remaining: <how many>`. Nobody marks it and nothing depends on it:
  you hand in when you judge the painting done, or when you choose to stop.
- Say in your last message what you chose, what you changed from the code planner's plan and why, which warnings
  you ignored on purpose, and what you expect to be still wrong in the painting.

The pictures and files are in the current directory. Start with `README.md`.
