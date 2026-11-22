# Paint this picture: a working session

You are the painter's planner for one watercolour. A simulated hand, paper and paint will lay whatever plan you hand
over, on a sheet `SHEET_W` by `SHEET_H` mm. You do not paint stroke by stroke: you decide the plan the painter follows.

**The goal: make the best watercolour of this subject you can, one a skilled painter would be proud of, faithful to
the subject.** Nothing else is asked.

A code planner has already made a plan from the same inputs you have. It is in `auto/`. It is a starting point you may
keep, edit or throw away: bettering it is not the goal, and you owe it nothing. Its usual faults on other pictures: every edge hard, flat slabs where the subject grades, a face cut into
facets or left as one flat patch, colour too saturated or too dark, small white notches of bare paper, and fine marks
that copy the study instead of reading as brushwork. Judge for yourself whether it has them here.

What you have to work with, all of it yours to use:

- The three studies, coarse to fine. **Study 3, the fine study, is nearly as good as the subject itself** (its shapes,
  values and colours can be trusted), and the code planner's plan uses almost none of it: nearly all its washes come
  from Study 1. What the fine study shows and the plan lacks is yours to put in.
- The drawing, line by line: which lines are drawn before the washes, which after them as closing lines over the dry
  paint, which not at all, and how dark each is (`"lines"` beside any choice; `README.md`).
- The named forms, as a picture and as data, and yours to change: merge, cut out with a polygon, rename, give another
  kind (`"forms"` in a settings choice). The code planner can be set form by form (`"perForm"`): more shapes in a
  face, fewer in a background, the fine study laid in the eyes.
- The whole paint box (`own-script-brief.md` lists it). **The choice of paints is yours**; the code planner's own pick
  is often wrong for the subject. In your own script the paints are its `palette`; for the code planner they are the
  painter's option `paints` (box keys, comma separated), which a settings choice may name.
- Wet in wet: a wash into clean water, a shape dropped into a wash while it is damp, a soft join beside a damp
  neighbour (`README.md` and `own-script-brief.md` say how each is written).
- Real looks (below) and the full time. There is no cap on passages, layers, forms or strength.

You have this folder, a shell, and MINUTES minutes of your own time (time you wait for the tools is not counted).
Work as a painter plans: look hard at the subject, decide, check, revise. Use the tools as much as you like; read
`README.md` first, it lists them.

## How to work

This is a long task; use the time. A session that changes two numbers in the first minute and stops has not done it.

The painter now lays the strength you plan. Use the whole time. Write three sentences on the look you are going for
into `intent.md` before you start, and add a line to `changes.md` after each look saying what you saw and what you
changed; make the painting recognisably yours.

1. Open every picture in `inputs/` and `auto/plan.png` and look at them, form by form. Read `auto/washes.txt` and
   `auto/plan.json`: which washes make each form, in what order, with what brush, at what colour.
2. Write down, for yourself (`notes.md`), how a painter would paint this subject: the forms, the order, where the
   lights are kept, where edges are lost, where the few darks go. Then write what the code planner's plan does
   differently, fault by fault, and which of those you can reach: through a setting, by editing its plan wash by
   wash, or only by writing the plan yourself.
3. Decide. Tuning is cheap and re-plans the whole picture. Editing the plan keeps every wash you do not touch
   exactly as the code planner would lay it (its shape, its value, its strokes) and lets you change the washes you
   judge wrong, one by one. Your own script is free in every passage and is all your own work, values included:
   nothing of the code planner's plan is kept. Use your shell to measure and compute what you need: positions and
   boxes from `inputs/forms-ids.png`, colours from the studies.
   What earlier sessions on other pictures showed: a session that only tuned settings came out almost the same as
   the code planner.
4. Check that your work compiles with `./unpaint plan` as often as you like; it answers with counts only (shapes,
   washes, strokes, the widest brush). When the plan is what you meant, look: a look paints your plan for
   real, small, and shows you the dried sheet.

## What you may hand over

Your answer is the file `choice.json` as it stands when you stop. Three kinds, from the least change to the most:

1. **The code planner, tuned.** `{"kind": "settings", "settings": {"study1.shapes": 60, "floors": "8,4,2"}, "why": "..."}`.
   `auto/settings.json` lists the planner's settings with their present values and what each does. Any other option of
   the painter may be named too if you know it; the inputs and the guard are locked.
2. **The code planner's plan, edited wash by wash.** `{"kind": "plan", "plan": "my-plan.json", "why": "..."}`.
   Copy `auto/plan-to-edit.json` to a file of your own and change it: it lists every wash of the plan in painting
   order. You may change a wash's colour, strength, brush, direction or the way it is laid (soft or hard), move it,
   leave it out, merge several into one, and add passages of your own between them. `README.md` gives the format.
   **A wash you do not touch is painted exactly as the code planner would paint it**: this is the way to keep its
   values and shapes where they are right and change only what you judge wrong.
3. **Your own painting script.** `{"kind": "script", "script": "script.json", "why": "..."}`: you write every passage
   yourself. `own-script-brief.md` is the full brief for that: the format, the kit, the paints, how a watercolour is
   built. A script is laid as written; the code planner is not used, and nothing of its plan is kept: every value
   and every shape is then yours to get right.

Beside its kind a choice may name your lines (`"lines": "my-lines.json"`, with any kind) and, in a settings choice,
your forms (`"forms": "my-forms.json"`) and planner settings for single forms (`"perForm": {...}`). `README.md` gives
each format.

`choice.json` starts as `{"kind": "settings", "settings": {}}`: change nothing and the painting is exactly the code
planner's.

## Looking

Look as often as you like, as a painter steps back. Each look paints your plan for real. You may also check that a
choice compiles as often as you like (`./unpaint plan`: counts only). **A look paints your plan for real, small, and shows you the dried sheet**: `./unpaint look` sends your
present choice through the painter itself (real water, pigment and brush, on a small sheet, through drying) and
shows you the dried sheet beside the subject and the middle study, the stages of the painting (the sheet at 10, 25,
50, 75 and 100% of the strokes, so you see the order of the work), and each named form measured on the dried sheet
against the study and against your plan, marked when it dried TOO DARK or TOO PALE. What you see is paint, not a
diagram: edges, brush marks, direction, how strong the pigment really lay. A look takes some minutes to paint
(`README.md`); that time is not yours and is not counted. LOOKS_LINE
Take your first look early: the dried sheet will surprise you more than the plan does. Then work as a painter does:
look, judge with your eye, change what is wrong, look again.

What is not allowed is fitting the picture by measurement instead of painting it: changing strokes to cut an image
error, matching the subject pixel by pixel, keeping a stroke only when a number improves, or drawing or comparing
your plan by any means other than a look (your own renderer, an image diff). The session's commands are recorded,
and a session that reaches for the painter outside its folder is not painted. No score is ever shown to you; there is none to chase.

## What is asked of the painting

The finished sheet should read as a watercolour a person painted of this subject: big connected washes first,
then the middle shapes, then the darks and accents last; lights left as paper; each form at the studies' value
(not darker, and not paler) and in the subject's colour; soft where forms turn, hard only where an edge is really sharp; a face or an animal
recognisable and unbroken. DRAWING_NOTE

## Before you stop

- **Review your own sheet.** Take a look at your final choice and write `self-review.md`: first line
  `# Self-review of look N` (N your last look), then the FIVE worst differences between your dried sheet and the
  subject, numbered, each with where it is in millimetres, what differs and what you would do about it; last line
  `Major faults remaining: none` or `Major faults remaining: <how many>`. A major fault is a form not built, a value far
  off, a colour wrong, or an area left bare that the subject paints. **While a major fault remains and you have time,
  go on and put it right, then look and review again.** You may hand in early only when your review of your last look
  says none remains; a session that stops without it is sent back to work. No score is shown to you and nobody marks
  the review: it is your own judgment.
- `choice.json` holds your final choice, with one or two sentences of `why`.
- You ran `./unpaint plan` on it and it compiled. A final choice that was not planned, or does not compile, is not
  painted: the last choice of yours that did compile is painted in its place, and the record says so.
- Say in your last message what you chose, what you changed from the code planner's plan and why (for an edited
  plan: which washes, by number), and what you expect to be still wrong in the painting.

The pictures and files are in the current directory. Start with `README.md`.
