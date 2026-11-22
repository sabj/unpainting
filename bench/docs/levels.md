# Levels

Decided 21 November 2026. The code is in [../scripts/levels.mjs](../scripts/levels.mjs). Nothing builds results from it yet.

The benchmark asks one question: how much better does a model paint than the code planner alone? Every score is measured from that baseline.

## The four levels

| Level | Old name | Sheet header | What happens |
|---|---|---|---|
| Auto | none | Code planner alone | The code planner paints the subject. No model is involved. This is the baseline. |
| L1 | V3 | Freehand, own tries | The model paints with the brush-and-pen toolkit itself. It gets the guides and its own earlier tries. It gets nothing from Auto. |
| L2 | V4 | Tuning the code planner, one try | The model gets what Auto gets, plus Auto's plan. It may tune settings, edit Auto's plan or write its own. It works in one long session with tools. One try. |
| L3 | V5 | Tuning the code planner, third try | Three tries in total. The first is the model's L2 try. Before each new try it sees its previous painting and the judges' words. It never sees a number. |

V1 and V2 are not in the new benchmark. Their published results stay as history.

The old names are labels only. A sheet may say "L2 (was V4)". Old published numbers are never recomputed, and never put in one table or one average with new ones. The module refuses a record labelled with an old name.

## How a painting is scored

1. Auto paints every subject, on one frozen commit. The same judge that scores the models scores Auto.
2. For each subject, the headroom is the top of the scale minus Auto's score. It is the room left above Auto.
3. The headroom has a floor. The default floor is 20% of the scale, so 2 points on a 0 to 10 scale. It is a setting.
4. The model's adjusted score on a subject is (model score minus Auto score) divided by the headroom.

The adjusted score is the share of the headroom the model closed.

- 0 means level with Auto.
- +1 means the model reached the top of the scale.
- +0.5 means it closed half the gap between Auto and the top.
- A negative number means it painted worse than Auto.

Why a floor? Suppose Auto scores 9.8. Without a floor the headroom is 0.2, and a judge wobble of 0.1 would look like half the headroom. With the floor that wobble is worth 0.05. The subject still counts, but only a little. On a floored subject a model cannot reach +1: a perfect 10 against an Auto of 9.8 is +0.1.

A painting that failed scores the bottom of the scale. It is never left blank. A painting failed when the painter refused it or when there is no painting. If a model entered a level, every subject Auto painted counts at that level, and a subject with no painting scores the bottom.

A painting that exists but was not fully judged is a different case. The module refuses it and asks for the judging to be finished.

## A model's score at a level

- The headline is the mean of the adjusted scores over the subjects.
- The interval is a 95% bootstrap interval over the subjects: 2,000 resamples, fixed seed 7, as in [statistics](statistics.md). A level with one subject has no interval.
- The headroom-weighted mean of the raw scores is reported beside it. Each subject's raw score is weighted by that subject's headroom. Auto's mean with the same weights is reported next to it for comparison.
- The plain mean of the raw scores is reported too.

L1 may have several tries. Its last try is the one scored.

L2 is one try. A second L2 record for a subject is refused.

L3 scores its third try. The best of the three tries is shown beside it and is never used as the score. If the third try is missing, the third try scores the bottom of the scale.

"Learned" is L3 minus L2 on the same subjects, as adjusted scores, with its own interval. It says what the feedback was worth.

## What the module refuses

It stops with a reason rather than give a number in these cases.

- Auto records from more than one commit. Headroom is measured from Auto, so a changed Auto would move every model's score.
- Auto records from more than one judge version or judge profile.
- A model record scored by a different judge than Auto.
- A model record that names a different Auto commit than the one being used.
- A subject the model painted that Auto did not.
- L3 records for a model with no L2 records. The L2 try is the first of the three.
- A record labelled V1 to V5.
- Records from two models in one summary. Summarize one model at a time.

## Side indexes

Progression and cheat-risk are recorded for each painting. They are shown in the table beside the scores. They are never folded into a score. Removing them changes no number.

## If the main measure becomes a win rate

The main measure may change. Instead of a 0 to 10 score, a blind judge would compare the model's painting with Auto's and pick one. The measure is then the share of comparisons the model wins. The scale is a setting, so the same code handles both.

| | 0 to 10 score | Win rate against Auto |
|---|---|---|
| Scale | 0 to 10 | 0 to 1 |
| Auto's score | Measured for each subject | 0.5 by definition |
| Headroom | 10 minus Auto, at least 2 | Always 0.5. The floor never applies. |
| Adjusted score | Share of the gap to a perfect 10 that the model closed | Twice the win rate, minus 1 |
| +1 | A perfect 10 | The model wins every comparison |
| 0 | Same score as Auto | The model wins half: a tie with Auto |
| Negative | Worse than Auto; can go below -1 when Auto is strong | Loses more than half; never below -1 |
| Failed painting | 0 out of 10 | Win rate 0, so -1 |

With a win rate, every subject has the same headroom, so the headroom-weighted mean is the plain mean. Auto must still come from one frozen commit, because every comparison is against Auto's painting.

Adjusted scores from the two scales mean different things. Do not put them in one table.

## Worked example

**These numbers are made up.** They are not results.

One model, three subjects, 0 to 10 scale, floor 2.

| Subject | Auto | L1 | L2 | L3 (third try) | Headroom | Adjusted L1 | Adjusted L2 | Adjusted L3 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| hills | 6 | 5 | 7 | 8, best of three 9 | 4 | -0.25 | +0.25 | +0.5 |
| france | 8 | 4 | 8.5 | 9, best of three 9 | 2 | -2 | +0.25 | +0.5 |
| ships | 9.5 | 6 | 9.5 | 10, best of three 10 | 2 (floor) | -1.75 | 0 | +0.25 |
| Mean | | 5 | 8.33 | 9 | | -1.33 | +0.17 | +0.42 |

Reading it:

- Hills. Auto scored 6, so the headroom is 10 minus 6, which is 4. At L2 the model scored 7. It closed 1 of 4 points: +0.25.
- Hills at L3. The second try scored 9 and the third scored 8. The score is the third try: (8 minus 6) divided by 4 is +0.5. The 9 is shown as the best of three and is not used.
- Ships. Auto scored 9.5. The real headroom is 0.5, so the floor of 2 applies. The model's perfect 10 at L3 earns 0.5 divided by 2, which is +0.25.
- France at L1. The model scored 4 against Auto's 8. That is 4 points worse on a headroom of 2: -2.
- L2 headline: the mean of +0.25, +0.25 and 0 is +0.17.
- L3 headline: the mean of +0.5, +0.5 and +0.25 is +0.42.
- Learned: +0.42 minus +0.17 is +0.25 of headroom.
- Headroom-weighted raw mean at L2: (7 × 4 + 8.5 × 2 + 9.5 × 2) divided by 8 is 8. Auto's, with the same weights, is 7.38.

With only three subjects the intervals are wide. They are left out of this example.

## Records

`summarize(records, options)` takes one flat record for each painting.

| Field | Meaning |
|---|---|
| `level` | `Auto`, `L1`, `L2` or `L3` |
| `subject` | The subject's key, for example `hills` |
| `model` | The model's key. Not used for Auto. |
| `try` | The try number, from 1. L3 records are tries 2 and 3; try 1 is the L2 record. |
| `score` | The score on the scale. From a run record: the painting's `score.composite`. |
| `failed` | `true` when the painter refused the painting or there is no painting |
| `commit` | For Auto: the frozen commit it was painted on. Required. |
| `judgeVersion`, `judgeProfile` | As in the run record, for example `J2` and `J2-full` |
| `autoCommit` | Optional, on a model record: the Auto commit the model was given |
| `progression`, `cheatRisk` | The side indexes. From a run record: `progression.mean` and `cheatRisk.score`. |

Options: `scale` (`SCALES.score10` or `SCALES.winRate`), `floorShare` (default 0.2), `model` and `seed`.

`subjectTable(summary)` writes the table above, with the two side-index columns, the intervals and the learned line.
