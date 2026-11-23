# Levels

Updated 22 November 2026 for 0.4. The owner's words are the source; this page puts them in order. The code that sums scores by level is [../scripts/levels.mjs](../scripts/levels.mjs). It still holds the 21 November design (L1 to L3), so it needs updating before it builds 0.4 results.

The benchmark asks one question: how well does a model paint, and how much of that is the model and how much is the code that helps it? Auto, the code planner alone, is the reference.

## The ladder

| Level | What the model is given | Tries |
|---|---|---|
| L0 | Nothing but the picture, a brush and a pen. No tips. | One. Defined, not run. |
| L1 | L0 plus harness tips: guides to brush technique and worked examples of rendering a shape, painted on blank sheets. | One |
| L2 | Prepared inputs, including Auto's plan: the drawing, colour studies, the named forms. | One |
| L3 | L2, then one retry. | Two in all |
| L4 | L3, then one more retry, with many resources: Auto's finished painting, and the studies' flat shapes and finer regions as data. | Three in all |

Notes on each level:

- L1 tips never come from a benchmark subject. The examples are random shapes, only to show technique ([TIPS.md](../v3/TIPS.md)).
- The number of retries is a setting. One retry per level is the plan until there is proof that more tries help.
- Test run first: three tries at L3 and at L4, each scored on its own, to see whether the second and third try add anything. After it the owner decides whether the scored run keeps three or scopes back to one. Planned, not yet run.
- A model has a shell in its own workspace at every level and may write any script it wants.

## Retries are self-study

- Before a retry the model is handed its own previous painting beside the original, the replay and its stroke map. At L4 it also gets the many resources.
- The model writes its own assessment of what to change.
- It never gets a score, a judge's verdict or any outside critique, at any level.
- There is no hill climbing: few fixed retries, the last try counts and not the best, reverts are counted, and nothing is measured against the original.
- Every attempt and retry starts in its own fresh branch and workspace. The previous one's files and painting arrive as read-only reference. The harness reports how much each try changed from the last, and flags a try that is identical or nearly so.

## How a painting is scored

See [scoring](scoring.md). In short:

- Judges read how human the making looks, from the painting in progress, by a written rubric. Quality and likeness is a second reading.
- A combined number is shown too: two parts human-ness to one part quality, a setting. Both parts stay visible.
- The original is scored the same way. A painting's result is its share of the original's score. Auto is scored too, so each subject has a difficulty index.
- Raw and difficulty-adjusted results are shown side by side.

RESULTS: to be filled from the frozen run.

## Old names

The old round names are history. V3 was a freehand try with earlier tries; V4 and V5 were the planning rounds with an 85-minute clock and a look count. They do not map one to one onto L1 to L4. Old published numbers are never recomputed, and they never share a table or an average with 0.4 results. See [scoring](scoring.md#history).

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
