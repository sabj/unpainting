# Run format

A try is one model session that paints the requested targets. A round is a benchmark version (V1 to V5). Every try is one folder: `runs/<round dir>/<model key>/<try>/`.

- Round dirs: `v1-naive`, `v2-skill`, `v3-informed`, `v4-pipeline`, `v5-self-study`.
- Model key: a lowercase name used in paths, the same in every round (`opus`, `astra`, `my-model`).
- Try: the session number, from 1.

```
runs/v1-naive/opus/1/
  run.json              the record below
  sargent.webp          final painting, at most 300 px wide
  sargent-stages.webp   the 10, 25, 50, 75 and 100% stage frames side by side, 122 px tall
  trumbull.webp
  trumbull-stages.webp
```

V4 and V5 try folders also hold `<crop>-plan/` per target: the plan files as painted at the end (drawing paths gzipped), `PLAN.md`, `CHECKPOINTS.jsonl` (every start, stop, look and revision) and, in V5 after try 1, `FEEDBACK.md` and `SELF-REVIEW.md`.

Images are WebP and each is under 60 KB. Stage strips never include the target. `scripts/run.mjs` writes this folder. `scripts/score.mjs` fills in the scores. `scripts/lib.mjs` (`validateRun`) checks it, and `npm run bench:test` checks every committed run.

## run.json

The schema, the required data format, is `unpaint-bench/run@2`. Fields marked required must be present; the rest may be null.

The record keeps each model in its own role. `painter` is the model that painted the try. `planner` names a separate model that wrote the painting plan, or is null when the painter planned its own work. AI image judges appear only under `evaluators`, and their scores and notes are keyed by judge id. Nothing a judge wrote is attributed to the painter.

| Field | Type | Meaning |
|---|---|---|
| `schema` | string, required | `unpaint-bench/run@2` |
| `benchmark` | string | `unpaint-bench` |
| `protocol` | string | `v2` |
| `round` | string, required | `V1` to `V5` |
| `release` | string, required | the release semver that painted the try, such as `0.1.0` ([versions](../../docs/versions.md)) |
| `painterVersion` | string, required | the painter V number, such as `V096` |
| `simVersion` | string, required | the sim number, such as `100` |
| `commit` | string or null, required | the git commit of this repo that painted the try; null for tries painted outside it |
| `painter.key` | string, required | short name used in the folder name |
| `painter.name` | string, required | display name |
| `painter.id` | string | the model id sent to the provider |
| `painter.effort` | string | reasoning setting sent, or `n/a` |
| `painter.runner` | string | `claude`, `codex`, `together`, or your own |
| `planner` | object or null, required | `{id, name}` of a separate planning model; null when the painter planned |
| `evaluators.scoreJudges` | string[], required | judge ids that scored the finished paintings |
| `evaluators.progressionJudges` | string[], required | judge ids that ran the progression check |
| `try` | integer, required | try number, from 1 |
| `settings.mode` | string, required | `gentle` or `hard` |
| `settings.strokeBudget` | integer or null, required | 2500; null in V4 and V5, where the painter sets its own stroke count |
| `settings.minutesPerCrop` | number | 15 |
| `settings.sessionCapMin` | number | 85 |
| `settings.lookBudget` | integer | looks per painting in hard mode, else null |
| `settings.crops` | string[] | the targets the try was asked to paint |
| `settings.learnsBetweenTries` | boolean | true in V3 and V5 |
| `settings.attemptsPerSession` | integer | V3: the attempts the session offered |
| `settings.modelMinutesCap` | number | V4 and V5: the model's own minutes per try (85); time waiting in `bench/paint.sh` is not counted |
| `settings.selfView`, `settings.targetGuard` | string | V4 and V5: `gentle` (unlimited looks at stops; the painter's target reads are blocked) |
| `settings.paintWidth` | object | V4 and V5: the painting width in pixels per target |
| `session.minutes` | number | elapsed minutes for the session; V3 to V5 sum their sessions |
| `session.modelMinutes` | number | V4 and V5: the model's own minutes, summed over targets |
| `session.tokens` | integer | input plus output tokens, null if not recorded |
| `session.costUSD` | number | cost when billed per token, else null |
| `session.estCostUSD` | number | estimated API-equivalent cost for a subscription run, else null |
| `session.usage` | object | token counts: input, cached input or cache writes and reads, output |
| `guard.blockedImageReads` | integer, required | reads blocked by the guard, the check that blocks image reads |
| `guard.kitRejections` | integer | calls refused by the painting toolkit given to models (over budget, paint not in the box) |
| `guard.auditHits` | string[] | script fragments the post-run audit matched |
| `crops` | object, required | one entry per painted target, keyed by target; empty if nothing was painted |
| `score` | object | the try's score, below |
| `cheat.disqualified` | boolean, required | true after a blocked read or a target hit in the audit |
| `cheat.readTargetPixels` | boolean | same as disqualified in v2 |
| `cheat.reason` | string | why, when disqualified |
| `cheat.risk` | object | `{score, level, parts}`; see [anti-cheat.md](anti-cheat.md) |
| `cheat.progressionRisk` | object | `{score, level}` |
| `cheat.review` | object | `{status: "flagged" or "cleared", finding}` or null |
| `complete` | boolean | every requested target has a final painting |
| `unpainted` | object | V4 and V5: targets with no painting, keyed by target, each `{pipeline}` as below |
| `notPainted` | object | V3: why a target has no attempt in this try (for example, the model declared it done) |

Each `crops.<crop>` entry:

| Field | Meaning |
|---|---|
| `strokes` | counted strokes, at most 2,500 |
| `minutes` | minutes from `kit.open` to `kit.finish` |
| `smallShare`, `shortStrokes`, `dotStrokes` | stroke-size records from the toolkit |
| `copyHF` | the copy-band correlation, a measure of matching fine detail (cheat-risk input) |
| `seed`, `sheet` | the paper seed (`BENCH_SEED`) and `{W, H, mmPerCell}` of the sheet, from the toolkit; null when the try has no stroke log |
| `strokeLog` | file name of the stroke log (`<crop>-strokes.jsonl.gz`), or null when the try has none; see below |
| `images.final`, `images.stages` | file names in the folder; `stages` may be null |
| `painterNote` | V3: the model's one-line note of what it changed from its last attempt |
| `attempt` | V3: `{n, minutes, killedAtCap, exitCode}` of the attempt |
| `pipeline` | V4 and V5, required there: the plan and how it was painted, below |
| `score` | `{composite, pm, complete, visionOverall, classic, criteria, judgeScores, callsPerModel}` from `scorer/score_painting.py`. `judgeScores` maps each judge id to its overall score. |
| `progression` | `{stages, earlyMean, mean, humanOrderVotes, judgesN, tells, judges, judgeNotes}` from `scorer/progression.py`. `judgeNotes` maps each judge id to its comment on the stages. |

`crops.<crop>.pipeline` in V4 and V5:

| Field | Meaning |
|---|---|
| `outcome` | `painted`, `no-plan`, `plan-refused` or `render-failed`. A painting is `painted` when the painter wrote `painting.png` and exited 0 or 3. A painter killed by a signal, any other exit code or a missing painting is `render-failed`. |
| `paintedBy` | the model (it started the painting) or the harness (the session ended first; painted without stops) |
| `plan` | the `<crop>-plan` folder |
| `tokens` | the recipe tokens the painting ended with |
| `layering` | `{applied, skipped}`: the base recipe tokens applied, and why the others were skipped |
| `starts`, `looks`, `revisions`, `revisionsRefused` | counts from `CHECKPOINTS.jsonl` |
| `modelMinutes`, `cappedAtModelTime`, `sessionEnd` | the model's own minutes, whether the cap ended the session, and why it ended |
| `turns`, `repairTurns` | each model turn `{k, repair, exit, seconds, stoppedBy}`, and the reasons for repair turns |
| `optionCheck` | settings read by nothing: `model` (chosen by the plan), `base` (from the base recipe or template; never noted) and `unknown` (asked for by nobody) |
| `droppedPassages` | passages with no brush path |
| `notes` | `[{code, reason}]`: unread `model` settings and `unknown` options (code 4) and dropped passages (code 5). The painting still counts. Under `--strict-verdict` these are failures instead and `notes` is empty. |
| `strictVerdict` | true when the try ran with `--strict-verdict`, which fails a painting on any note, as the 0.1 results did. Also in `settings.strictVerdict`. |
| `paintExit`, `segments` | the painter's exit code, and the number of painter processes (one more per revision) |
| `failure` | `{failures: [{code, reason}]}` when the outcome is not `painted` |
| `feedback`, `selfReview`, `selfReviewModelMinute` | V5 after try 1: the files given and written, and the model minute at which SELF-REVIEW.md first existed |
| `renderRefusal`, `renderRefusalReopened`, `paintRestarts`, `machineLost` | imported tries: why the painter first refused the plan and whether the model got a repair turn, painter restarts, and cloud machines lost mid-painting |
| `feedbackNote`, `linkedFrom` | imported tries: a note on the feedback a V5 try got, and for V4 try 1 the V5 try 1 session it shares |

The V4 and V5 tries in `runs/` were painted by an earlier harness on cloud GPUs and imported with `scripts/import-aware.mjs`. Their records add `crops.<crop>.cheatRisk` (the painter's own cheat-risk record; the try's `cheat.risk` is the highest painting), `strokesBasis` (their stroke counts include pen lines), `judgeProviders` in `score` and `progression` (judge calls routed through OpenRouter, by provider; any other call went to Together) and `evaluators.providers`. Their stroke logs are not published (`strokeLog` is null).

`score` for the try:

| Field | Meaning |
|---|---|
| `status` | `scored`, `unscored` or `dry-run`. Only `scored` tries reach the results. |
| `composite` | mean of the target composites when every requested target is scored, else null |
| `partialComposite` | the same mean over the targets that are scored, when some are missing |
| `cropsScored` | number of targets with a composite |
| `complete` | true when `composite` is set |
| `rubric` | rubric version |

`run.mjs` also writes `raw`, the path of the raw outputs under `bench/work/` (git ignores it), and session details such as `exitCode` and `killedAtCap`. Extra fields are allowed. `validateRun` rejects a record whose judge scores or notes name a judge missing from `evaluators`.

## results.json

`scripts/build-results.mjs` builds `results/results.json` (schema `unpaint-bench/results@1`) from tries 1–3, at the `xhigh` (extra-high) reasoning setting where supported. Each round has one entry per painter and sim version (`painterVersion`, `simVersion`, `releases`, and `label`, the round id plus the versions when a round has more than one), so two versions never share a mean. Each entry lists each model with `mean`, `ci95`, `best`, `perTry` medians (recorded and estimated costs separately), `fewerTriesReason`, `publicCrops` (scores on the distributed targets), `perCrop` best paintings and cheat-risk counts. `roundCompare` carries the paired-by-model V1/V2 comparison. Tries that are not `scored` are listed under `unscored`. Do not edit results by hand: `npm run bench:build` rewrites them, and `npm run bench:test` fails if they are out of date.

## Stroke log

A stroke log is the stroke record: the ordered brush and pen actions.

The toolkit writes `out/<crop>/strokes.jsonl.gz` as it paints, and `scripts/run.mjs` copies it to `<crop>-strokes.jsonl.gz` in the try folder. Logging only reads toolkit state.

`strokeLog` is null when a try has no stroke log.

The file is gzip, one JSON object per line, in painting order:

| Line | Fields |
|---|---|
| `{ev:"open"}` | `protocol`, `task`, `seed`, `W`, `H` (sheet cells), `mmPerCell`, `paper`, `backend`, `t0` (ms epoch) |
| stroke | `i` (1-based index in the budget count), `tool` (`brush` or `pen`), `t` (ms since open), `brush` `{radius, bristles, capacity, flat}` or `pen` `{nib, flex, capacity}`, `dip` (last dip: `water` or `amount`, and `pigments`, one concentration per box pigment), `load` (brush water at the stroke start) or `ink`, `dips` (dips so far), `pts` (`x`, `y`, `p` pressure, optional `r`), `options` |
| `{ev:"snap"}` | `after`: the budget count at the snapshot (every 25). Counting precedes execution, so `after:25` shows 24 completed strokes |
| `{ev:"frame"}` | the painter called `kit.frame(name)` after `after` strokes |
| `{ev:"stage"}` | `pct` (10, 25, 50, 75, 100) and `after`: the selected snapshot count. Early stages show one fewer completed stroke; the final stage shows all strokes |
| `{ev:"finish"}` | `strokes`, `t`, `note` |

Numbers are rounded to 4 places. The pigment order is the box order in `src/crop/box.mjs`. The toolkit also adds `seed`, `sheet` and `strokeLog` to `stats.json`.
