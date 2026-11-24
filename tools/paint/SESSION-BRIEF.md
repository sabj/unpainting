# Paint this picture: a working session

You are the painter's planner for one watercolour. A simulated hand, paper and paint will lay whatever plan you hand
over, on a sheet `SHEET_W` by `SHEET_H` mm. You do not paint stroke by stroke: you decide the plan the painter follows.
REAL_SIZE_LINE

**The goal: make the best watercolour of this subject you can, one a skilled painter would be proud of, faithful to
the subject.** Nothing else is asked.

**The painting is yours, and you are allowed to make mistakes.** Nothing below about method is a rule. The tools
refuse only what cannot be read or cannot be laid (more paints than the sheet holds, a brush that is not in the kit),
anything that reaches outside this folder, and going back to an earlier choice again and again (below). Everything
else is laid as you write it. Where the tools think a choice may spoil the painting they say so in a WARNING, to heed
or ignore: a mistake reaches the sheet as a mistake, and you see it in a look.

You have the subject's prepared inputs: the drawing, three colour studies and the named forms. You write the plan as
your own painting script, every passage of it. All of this is yours to use:

- The three studies, coarse to fine. Study 3, the fine study, is close to the subject itself in shape, value and
  colour.
- The drawing. Its medium: pencil, pen, or no drawing at all, whatever the subject seems to be drawn in (`"medium"` in
  `choice.json`). No drawing is a normal choice: the prepared drawing is offered, not required. Its prepared lines:
  when each is drawn (before the first wash, with a stage of the washes, or after them over the dry paint), which not
  at all, and how dark each is. And lines of your own: drawn where you put them, point by point, in pen or pencil, at
  the width and darkness you give, at any of those times (`"lines"` beside any choice; `README.md`).
- The named forms, as a picture and as data: where each form lies and what kind it is.
- The whole paint box (`own-script-brief.md` lists it). The paints you choose are your script's `palette`.
- Wet in wet: a wash into clean water, a shape dropped into a wash while it is damp, a soft join beside a damp
  neighbour (`README.md` and `own-script-brief.md` say how each is written).
- Real looks (below). There is no cap on passages, layers, forms, strokes, lines, rules or strength.

## The terms of this try

You have this folder and a shell. `README.md` lists the tools; read it first.

Your work is measured, not capped: how many looks you take, how many plans, how long you work, how many tool calls.
None of that is held against you.

Two things are limited, the benchmark's and the same for every model and every machine. Looks: `LOOKS_MOST` units. A look has a fixed price, whatever is in it: a
look of your whole plan on the whole sheet, painted at half size, costs 0.3; a look stopped after a stage you name
(`./unpaint look --until 2`) or of a region of your own script (`--region`) costs its share of that, and at least 0.2.
Where and when you look is yours to choose. How you paint costs nothing: water, wetness, brushwork, the number of
strokes, waits and dryings are yours, and the final painting is not charged. Each price is told before anything is
painted (`./unpaint plan` lists it; `./unpaint cost ...` prices any look and paints nothing); a look is refused only
when its price is more than you have left. Steps: `STEPS_MOST` of your tool calls (shell commands, `./unpaint` among
them, and file reads and writes). Time is not budgeted: waiting for a look or for the machine costs
you nothing (a far safety stop ends a session after `WALL_MINUTES` minutes). `./unpaint status` shows what is used,
and every answer of the tools says it too. When the budget is reached you are asked to hand in what you have: no
further look is painted, `./unpaint plan` still checks that your final choice compiles, and soon after the session is
ended. Keep `choice.json` holding something you would hand in, from early on.

The one thing barred is fitting the picture by trial: keeping a change only when a look came out better and undoing it
otherwise, over and over. Each time you go back to a choice you had already left, it is counted; you may do it `REVERTS_MOST` times, and after that a return is refused. Changing your mind is fine: go on from where you are and
change it further. Also barred: matching the subject pixel by pixel, changing strokes to cut an image error, and
drawing or comparing your plan by any means other than a look (your own renderer, an image diff). Your commands are
recorded, and a session that reaches for the painter outside its folder is not painted. No score is ever shown to you;
there is none to chase.

## A way to work (advice)

- Open every picture in `inputs/`, and read `inputs/forms.json` and `drawing/lines.json`.
- Decide how a painter would paint this subject: the forms, the order, where the lights are kept, where edges are
  lost, where the few darks go, what the drawing does. Notes help (`notes.md`, a line in `changes.md` after each
  look); they are for you, and for whoever reads the session afterwards.
- Write your plan as your script: each passage's shape, paint, brush, water and place in the order
  (`own-script-brief.md`). A first script that lays the big shapes, looked at early, tells you more than a finished
  one planned blind.
- Measure and compute in your shell: positions and boxes from `inputs/forms-ids.png`, colours from the studies.
- `./unpaint plan` checks that your work compiles, as often as you like; it answers with counts and any warnings.
  When the plan is what you meant, look. The dried sheet surprises more than the plan does.

## What you hand over

Your answer is the file `choice.json` as it stands when you stop: your own painting script,
`{"kind": "script", "script": "script.json", "why": "..."}`. You write every passage yourself. `own-script-brief.md`
is the full brief for that: the format, the kit, the paints, and painters' advice. A script is laid as written.

Beside it a choice may name the drawing's medium (`"medium": "pencil"`, `"pen"` or `"none"`), the pen's ink
(`"ink": "waterproof"` or `"soluble"`) and your lines (`"lines": "my-lines.json"`: rules on the prepared lines, and
lines of your own). Rubbing out is an erase passage in your script. `README.md` gives each format.

`choice.json` starts as `{"kind": "script", "script": "script.json"}`, and `script.json` is yours to write. A session
that hands in no script that compiles has handed in nothing, and nothing is painted.

## Looking

A look paints your plan for real, small, and shows you the dried sheet: `./unpaint look` sends your present choice
through the painter itself (real water, pigment and brush, on a small sheet, through drying) and shows you the dried
sheet beside the subject and the middle study, the stages of the painting (the sheet at 10, 25, 50, 75 and 100% of the
strokes), and each named form measured on the dried sheet against the study and against your plan, marked when it
dried TOO DARK or TOO PALE. What you see is paint, not a diagram: edges, brush marks, direction, how strong the
pigment really lay, and your drawing as it was drawn. A look takes some minutes to paint (`README.md`), and those
minutes are on the clock of this try. A look need not be the whole painting: stopped after the first washes it shows
whether the big shapes sit right before you spend on the rest.

## What a good sheet usually has (advice)

Big connected washes first, then the middle shapes, then the darks and accents last; lights left as paper; each form
near the studies' value and in the subject's colour; soft where forms turn, hard where an edge is really sharp; a face
or an animal recognisable and unbroken. DRAWING_NOTE All of it is yours to change.

## Before you stop

- `choice.json` holds your final choice, with one or two sentences of `why`.
- Run `./unpaint plan` on it. A final choice that was not planned, or does not compile, cannot be painted: the last
  choice of yours that did compile is painted in its place, and the record says so.
- A review of your own sheet is worth writing (`self-review.md`): first line `# Self-review of look N` (N your last
  look), then the five worst differences between your dried sheet and the subject, numbered, each with where it is in
  millimetres, what differs and what you would do about it; last line `Major faults remaining: none` or
  `Major faults remaining: <how many>`. Nobody marks it and nothing depends on it: you hand in when you judge the
  painting done, or when you choose to stop.
- Say in your last message what you chose and why, which warnings you ignored on purpose, and what you expect to be
  still wrong in the painting.

The pictures and files are in the current directory. Start with `README.md`.
