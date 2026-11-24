# Levels

Updated 23 November 2026 for 0.4 rc7. The owner's words are the source; this page puts them in order. The code that sums scores by level is [../scripts/levels.mjs](../scripts/levels.mjs). It still holds an older L1 to L3 layout, so it needs updating before it builds 0.4 results.

The benchmark asks one question: how well does a model paint, and how much of that is the model and how much is the code that helps it? Auto, the code planner alone, is the reference.

## The ladder

Every level is one try that hands in the model's own script, with a budget of 3.0 look units. Only what the model is given differs.

| Level | What the model is given |
|---|---|
| L1 | The freehand kit and its tips: technique guides and worked examples painted on blank sheets. The paper's colour is its choice (white, or an `[r, g, b]` tone); paint only darkens it. One attempt; its budget is 3 runs of its script (each run that lays a mark costs 1.0). |
| L2 | The same inputs the code planner gets: the prepared drawing, the three colour studies as pictures, and the named forms. No code plan: the model plans the painting itself. |
| L3 | One retry of L2, after studying its own L2 painting: its finished full-size painting, its film and its stroke map. A fresh budget. |
| L4 | One more retry, like L3, now also given the studies' traced shapes as regions it may use, change or ignore (offered, not required, and they may be wrong). It retries from its own L3 painting, film and stroke map, with a fresh budget. |

Notes:

- Nothing of Auto is given at any level: not its plan, planner, settings, painting, film or stroke map.
- A hand-in of planner settings, or of the code's plan, is refused ("the code's plan, its planner and its settings are handed over at no level"). A session that hands in no script of its own has handed in nothing: a failed painting, never Auto's plan painted in its place.
- L1 tips never come from a benchmark subject. The examples are random shapes, only to show technique ([TIPS.md](../v3/TIPS.md)).
- A model has a shell in its own workspace at every level and may write any script it wants.
- Drawing is the model's choice at every level: pencil, pen or none. No drawing is a normal choice. At L2 to L4 the prepared drawing is offered, not required, and its lines may be drawn before the washes, with a stage of the washes, or after them.
- Every picture is painted on the same area of paper, a quarter sheet (27.9 x 38.1 cm), in its own proportions, whatever the file's size. The original's real size is told to the model as a fact, not reproduced ([real sizes](../README.md#real-sizes-of-the-originals-told-to-the-model-as-a-fact)).
- L0 (the kit with no tips) is defined, not run.

## Budget

A look has a fixed price by size, whatever is in it: a half-size look of the whole sheet 0.3, a full-size look 1.0, a look stopped at a stage or cut to a region its share of that (the share of the plan's washes or passages it paints), never under 0.2. At L2 to L4 a look is painted at half size (`./unpaint look`); at L1 each run of the script is a full-size painting (1.0). The budget for one try is 3.0 at every level. At L2 to L4 the full-size final is painted after the session and not charged; at L1 the painting is its last completed run. How a model paints (water, strokes, waits, dryings) is never charged: simulation work (cell-steps), sweeps, dryings, seconds, tokens (fresh, cached and output) and steps are recorded in `usage.json` beside the score. One runaway guard: a painting whose water steps pass ten times those of Auto's painting of the subject is stopped with a plain message, reported as a stop and not scored (a look it stops costs nothing). Steps (1,000) and a six-hour clock are runaway guards only.

## Retries are self-study

- Before a retry the model is handed its own previous painting beside the original, its film (the replay) and its stroke map. At L4 it also gets the traced shapes.
- The model writes its own assessment of what to change.
- It never gets a score, a judge's verdict or any outside critique, at any level.
- There is no hill climbing: one try a level (L3 and L4 are each one retry, from the level before), the last try counts and not the best, reverts are counted, and nothing is measured against the original.
- Every attempt and retry starts in its own fresh branch and workspace. The previous one's files and painting arrive as read-only reference. The harness reports how much each try changed from the last, and flags a try that is identical or nearly so.

## How a painting is scored

See [scoring](scoring.md). In short:

- Human-ness, from the film, by a written rubric: the judges see the opening (the untouched paper the painter chose; context, not scored), the drawing frame (the last frame before the first wash; scored and reported, not in the figure; absent when nothing was drawn first), then ten frames evenly spaced from the first wash to the finished sheet, the tenth being the finished sheet. The figure is the mean of the ten, as a percentage of 5 (mean ÷ 5). Scores from before rc7 used twelve snapshots through the whole film and are not comparable ([scoring](scoring.md#human-ness)).
- Quality and likeness is a second reading.
- A combined number is shown too: two parts human-ness to one part quality, a setting. Both parts stay visible.
- The original is scored for quality too, and a painting's quality is its share of the original's score. Auto is scored too, so each subject has a difficulty index.
- Raw and difficulty-adjusted results are shown side by side.

RESULTS: to be filled from the frozen run.

## Old names

The old round names are history. V3 was a freehand try with earlier tries; V4 and V5 were the planning rounds with an 85-minute clock and a look count. They do not map one to one onto L1 to L4. Old published numbers are never recomputed, and they never share a table or an average with 0.4 results. See [scoring](scoring.md#history-how-v1-to-v5-were-scored-judges-j1-and-j2).

## What the summary code refuses

It stops with a reason instead of giving a number when:

- Auto records come from more than one commit, judge version or judge profile. The difficulty index is measured from Auto, so a changed Auto would move every score.
- A model record was scored by a different judge than Auto.
- A model record names a different Auto commit than the one in use.
- A model painted a subject Auto did not.
- A record carries an old round name.
- Records from two models are given in one summary.

## Records

`summarize(records, options)` takes one flat record per painting: `level`, `subject`, `model`, `try`, `score`, `failed`, `commit` (Auto only), `judgeVersion`, `judgeProfile`, and the side readings. A failed painting scores the bottom of the scale; it is never left blank. Options include `scale`, `floorShare` (the difficulty floor, default 0.2 of the scale) and `seed`.

The difficulty adjustment divides a model's gain over Auto by the room left above Auto, with a floor on that room, so a subject where Auto already scores near the top cannot swing a result. It is shown beside the raw number and never replaces it.
