# Levels

How well does a model paint, and how much of that is the model and how much the code that helps it? Auto, the code planner alone, is the reference. Every level is one try that hands in the model's own script, with a budget of 3.0 look units ([rules](rules.md#budgets-measured-not-limited)). Only what the model is given differs.

| Level | What the model is given |
|---|---|
| L1 | The freehand kit and its tips ([TIPS.md](../v3/TIPS.md)): technique guides and worked examples on blank sheets, none from a benchmark subject. The paper's colour is its choice. One attempt, 3 runs of its script. |
| L2 | What the code planner gets: the prepared drawing, the three colour studies as pictures, the named forms. No code plan: the model plans the painting itself. |
| L3 | One retry of L2 after studying its own L2 painting: the finished full-size painting, its film and its stroke map. A fresh budget. |
| L4 | One more retry, from its own L3 painting, film and stroke map, now also given the studies' traced shapes as regions it may use, change or ignore (they may be wrong). A fresh budget. |

L0, the kit with no tips, is defined and not run.

At every level: nothing of Auto is given (not its plan, planner, settings, painting, film or stroke map); the model has a shell in its own workspace and may write any script, but no script may read a picture (the subject, the studies and a look's pictures are for looking at; the data each level gives is for code: [anti-cheat guard](rules.md#anti-cheat-guard-levels-2-to-4)); drawing is its choice ([rules](rules.md#what-a-model-may-change)); every picture is on a quarter sheet (27.9 x 38.1 cm) in its own proportions, with the original's real size told as a fact ([real sizes](../README.md#real-sizes-of-the-originals-told-to-the-model-as-a-fact)); no score or critique is shown.

## What changes from one level to the next

Each step changes several things at once. A difference between two levels is the effect of the whole step, never of one kind of help.

- L1 differs in kind. The model writes code against the freehand kit and paints in its own process, stroke by stroke with direct brush control (path, pressure, speed, a flat's blade, load, water). It sees the picture with its own vision only; its scripts may not read any image and get a 24-cell coarse map. It has the tips and two technique guides, no prepared inputs. Each run of its script is a full-size painting; it may run 3 and look at each. Its last completed run is its painting.
- L1 to L2: the model writes a painting script in millimetres (passages, washes, strokes) that the main painter lays, instead of driving the brush sample by sample. It gets the prepared drawing, three studies, the named forms, and the subject as a picture to look at (its code reads the data, never a picture). Its looks are half-size test paintings priced by size; the full-size final is painted afterwards, uncharged.
- L2 to L3: one more try with its own result to study: its full-size L2 painting, film, stroke map and its own written assessment. A fresh folder, session and budget. Nothing new about the picture.
- L3 to L4: another retry (the third at this picture), its L3 results to study, and the traced shapes.

## Retries are self-study

- Before a retry the model gets its own previous painting beside the original, its film and its stroke map (at L4 also the traced shapes), and writes its own assessment of what to change.
- It never gets a score, a judge's verdict or an outside critique.
- No hill climbing: L3 and L4 are each one retry from the level before, the last try counts and not the best, reverts are counted, and nothing is measured against the original.
- Each attempt starts in a fresh branch and workspace, with earlier files read-only. The harness reports how much each try changed and flags one that is identical or nearly so.

## Scoring

See [scoring](scoring.md). Human-ness from the film is the main reading; quality and likeness are beside it; the combined figure is two parts human-ness to one part quality. The original and Auto are scored too, so each subject has a difficulty index.

Old round names are history: V3 was a freehand try with earlier tries; V4 and V5 were planning rounds with an 85-minute clock and a look count. They do not map onto L1 to L4. Old numbers are never recomputed and never share a table with 0.4 results ([old scoring](scoring.md#history-how-v1-to-v5-were-scored-judges-j1-and-j2)).

## The summary

`npm run bench:summary04 -- DIR/results.json --set core|extended` reads one scoring's results (Auto, level 1 and levels 2 to 4 together) and writes `SUMMARY.md`: every model's levels against Auto, each retry against the level it retries, then each model's pictures. Code: [levels.mjs](../scripts/levels.mjs), [summary04.mjs](../scripts/summary04.mjs).

- Every level is one try. Where a level holds several, the last counts.
- The schedule comes from [run-sets.json](../run-sets.json): the core five on the whole ladder, the other ten at Auto and level 2. A level is averaged over the pictures scheduled at it.
- A failed run, and a scheduled picture with no painting, count as the bottom of the scale and are listed with the reason.
- The figure summed is the combined figure, 0 to 100. Human-ness, quality and likeness stay beside it in `SCORES.md`.

It stops with a reason instead of giving a number when:

- Auto records come from more than one commit, judge label or snapshot scheme.
- A model record was scored by a different judge than Auto, or names a different Auto commit.
- A model painted a subject Auto did not, or Auto is missing for a scheduled picture.
- A painting was judged but has no figure (a judge short of its readings).
- A level 3 or 4 record has no record of the level it retries.
- A record carries an old round name.

`summarize(records, options)` takes one flat record per painting: `level` (Auto, L1 to L4), `subject`, `model`, `try`, `score`, `failed`, `commit` (Auto only), `judgeVersion`, `judgeProfile`, and the side readings. Options: `scale`, `floorShare` (the difficulty floor, default 0.2 of the scale), `scheduled`, `seed`. The difficulty adjustment divides a model's gain over Auto by the room left above Auto, with a floor on that room. It is shown beside the raw number and never replaces it.
