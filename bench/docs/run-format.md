# Run format

Every try is one folder: `runs/<round dir>/<model key>/<try>/`. Round dirs: `v1-naive`, `v2-skill`, `v3-informed`, `v4-pipeline`, `v5-self-study`. The model key is a lowercase name, the same in every round (`opus`, `my-model`). The try number starts at 1. V1 to V5 are the old rounds; a 0.4 try records the same fields plus those marked 0.4 below.

```
runs/v1-naive/opus/1/
  run.json              the record below
  sargent.webp          final painting, at most 300 px wide
  sargent-stages.webp   the 10, 25, 50, 75 and 100% stage frames side by side, 122 px tall
```

V4 and V5 folders also hold `<crop>-plan/` per target (the plan files as painted, `PLAN.md`, `CHECKPOINTS.jsonl` with every start, stop, look and revision; in V5 after try 1, `FEEDBACK.md` and `SELF-REVIEW.md`). Images are WebP under 60 KB; stage strips never include the target. `scripts/run.mjs` writes the folder, `scripts/score.mjs` fills in scores, `scripts/lib.mjs` (`validateRun`) checks it, and `npm run bench:test` checks every committed run.

A 0.4 try also records: the level and try; the budget terms in force; `usage.json` (look units and each look's price, the work of each look and of the final, tokens fresh, cached and output, provider cost, machine seconds, steps); tool use; film snapshots; how much the try changed from the one before; the judge version and route.

## run.json

Schema `unpaint-bench/run@2`. Fields marked required must be present; the rest may be null. `painter` is the model that painted; `planner` names a separate model that wrote the plan, else null. Judges appear only under `evaluators`; nothing a judge wrote is attributed to the painter.

| Field | Meaning |
|---|---|
| `schema` (required) | `unpaint-bench/run@2` |
| `benchmark`, `protocol` | `unpaint-bench`, `v2` |
| `round` (required) | `V1` to `V5` |
| `release`, `painterVersion`, `simVersion` (required) | such as `0.1.0`, `V096`, `100` ([versions](../../docs/running.md#versions)) |
| `commit` (required) | git commit that painted the try; null if painted outside the repo |
| `painter.key`, `.name` (required), `.id`, `.effort`, `.runner` | folder name, display name, provider model id, reasoning setting or `n/a`, `claude`, `codex`, `together` or your own |
| `planner` (required) | `{id, name}` or null |
| `evaluators.scoreJudges`, `.progressionJudges` (required) | judge ids that scored finals and ran the progression check |
| `try` (required) | try number |
| `settings.mode` (required) | `gentle` or `hard` |
| `settings.strokeBudget` (required) | 2500 in V1 to V3; null in V4 and V5 and in a 0.4 level 1 record (no limit on strokes) |
| `settings.paintingsPerAttempt` | 0.4 level 1: runs its script may make (3) |
| `settings.minutesPerCrop` | 15; null at 0.4 level 1 |
| `settings.sessionCapMin` | 85; at 0.4 level 1 the minutes in force (60 unless stated) |
| `isolation` | 0.4 level 1: `{closed, how, refusedRequests}`; each painting's `network` lists hosts passed and refused |
| `settings.lookBudget` | looks per painting in hard mode, else null |
| `settings.crops` | targets the try was asked to paint |
| `settings.learnsBetweenTries`, `.attemptsPerSession`, `.modelMinutesCap`, `.selfView`, `.targetGuard`, `.paintWidth` | V3 to V5 settings |
| `session.minutes`, `.modelMinutes`, `.tokens`, `.costUSD`, `.estCostUSD`, `.usage` | elapsed minutes; the model's own minutes (V4, V5); input plus output tokens; billed cost; estimated API-equivalent cost of a subscription run; token counts (input, cached, output) |
| `guard.blockedImageReads` (required) | reads the guard blocked |
| `guard.kitRejections`, `guard.auditHits` | kit refusals; script fragments the audit matched |
| `crops` (required) | one entry per painted target, below |
| `score` | the try's score, below |
| `cheat.disqualified` (required), `.readTargetPixels`, `.reason` | true after a blocked read or an audit hit |
| `cheat.risk`, `.progressionRisk`, `.review` | `{score, level, parts}` ([cheat risk](rules.md#cheat-risk)); `{score, level}`; `{status: "flagged" or "cleared", finding}` |
| `complete` | every requested target has a final painting |
| `unpainted`, `notPainted` | V4, V5: targets with no painting and their `pipeline`; V3: why a target has no attempt |

Each `crops.<crop>` entry:

| Field | Meaning |
|---|---|
| `strokes` | counted strokes (at most 2,500 in V1 to V3) |
| `minutes` | from `kit.open` to `kit.finish` |
| `smallShare`, `shortStrokes`, `dotStrokes` | stroke-size records |
| `copyHF` | copy-band correlation (cheat-risk input) |
| `seed`, `sheet` | paper seed and `{W, H, mmPerCell}`; null without a stroke log |
| `strokeLog` | `<crop>-strokes.jsonl.gz` or null |
| `images.final`, `images.stages` | file names |
| `painterNote`, `attempt` | V3: the model's note on what it changed; `{n, minutes, killedAtCap, exitCode}` |
| `pipeline` | V4, V5 (required there): the plan and how it was painted |
| `score` | `{composite, pm, complete, visionOverall, classic, criteria, judgeScores, callsPerModel}` from `scorer/score_painting.py` |
| `progression` | `{stages, earlyMean, mean, humanOrderVotes, judgesN, tells, judges, judgeNotes}` from `scorer/progression.py` |

`pipeline` (V4, V5) records the `outcome` (`painted`, `no-plan`, `plan-refused` or `render-failed`; painted means `painting.png` was written and the painter exited 0 or 3), who painted (`paintedBy`), counts of starts, looks and revisions, the model's minutes and why the session ended, `notes` (`[{code, reason}]`; the painting still counts, but under `--strict-verdict` they fail it), `clean` (false when the painter continued past a failed check, per `continued-checks.json`), `paintExit`, and `failure`. Imported 0.1.0 tries (`scripts/import-aware.mjs`) and the local 0.1.1 Argon tries add a few more.

`score` for the try:

| Field | Meaning |
|---|---|
| `status` | `scored`, `unscored` or `dry-run`; only `scored` reaches the results |
| `composite` | mean of the target composites when every target is scored, else null |
| `partialComposite` | the same over the targets scored |
| `cropsScored`, `complete`, `rubric` | targets with a composite; true when `composite` is set; rubric version |

`run.mjs` also writes `raw` (the raw outputs under `bench/work/`, ignored by git), `exitCode` and `killedAtCap`. Extra fields are allowed. `validateRun` rejects a record whose judge scores or notes name a judge missing from `evaluators`.

## results.json

`scripts/build-results.mjs` builds `results/results.json` (schema `unpaint-bench/results@1`) from tries 1 to 3 at `xhigh` reasoning where supported. Each round has one entry per painter and sim version (`painterVersion`, `simVersion`, `releases`, `label`), so two versions never share a mean. Each lists models with `mean`, `ci95`, `best`, `perTry` medians, `fewerTriesReason`, `publicCrops`, `perCrop` best paintings and cheat-risk counts. `roundCompare` carries the V1/V2 comparison. Tries not `scored` are under `unscored`. Never edit results by hand: `npm run bench:build` rewrites them and `npm run bench:test` fails if they are stale.

## Stroke log

The kit writes `out/<crop>/strokes.jsonl.gz` as it paints; `scripts/run.mjs` copies it to `<crop>-strokes.jsonl.gz`. It is gzip, one JSON object per line, in painting order:

| Line | Fields |
|---|---|
| `{ev:"open"}` | `protocol`, `task`, `seed`, `W`, `H`, `mmPerCell`, `paper`, `backend`, `t0` (ms epoch) |
| stroke | `i` (1-based), `tool` (`brush` or `pen`), `t` (ms since open), `brush` `{model, radius, bristles, capacity, flat, speed, bladeAngle}` plus `spacing` (cells between touches: 1.4 broad wash, 0.7 otherwise) or `pen` `{nib, flex, capacity}`, `dip` (`water` or `amount`, and `pigments`, one concentration per box pigment), `load` or `ink`, `dips`, `pts` (`x`, `y`, `p`, optional `r`, `v` mm/s, `blade` degrees), `options` |
| `{ev:"snap"}` | `after`: the count at the snapshot (every 25). Counting precedes execution, so `after:25` shows 24 completed strokes |
| `{ev:"frame"}` | `kit.frame(name)` was called after `after` strokes |
| `{ev:"stage"}` | `pct` (10, 25, 50, 75, 100) and `after`; early stages show one fewer completed stroke |
| `{ev:"finish"}` | `strokes`, `t`, `note` |

Numbers are rounded to 4 places. Pigment order is the box order in `src/crop/box.mjs`.
