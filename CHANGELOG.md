# Changelog

Tags carry the detail: `git show v0.3.2`, `git log v0.3.0..v0.3.2`.

## 0.4.0 (release candidate)

A new benchmark: Auto, then levels 1 to 4, each one fresh session, each model scored against Auto. A model's painting script is painted as written, on a quarter sheet. `npm run unpaint` is one command for painting, benchmark runs and scoring. V4 and V5 are retired and replay only from tag `v0.3.2`.

## 0.3.2 (2026-11-09)

Repairs defects; no gain in score or speed.

## 0.3.0 (2026-11-07)

Faster painting: fewer checks between strokes, combined GPU steps, no storage of empty layers. The three-painting reference suite fell from 12.1 to 4.7 minutes.

## 0.2.1 (2026-10-22)

Opt-in ink and colour changes. Default scores match 0.2.0.

## 0.2.0 (2026-10-20)

Scores 7% higher than 0.1.1 on the published plans, in 46% less time. Pencil is the default drawing; ink is opt-in.

## 0.1.1 (2026-10-15)

Benchmark patch: more models, scoring aligned across models, hosted judges through OpenRouter. The painter is unchanged from 0.1.0.

## 0.1.0 (2026-10-10)

Every painting and run records its release, painter and simulator version. A default recipe. Paint modules sorted into methods, techniques and tuned settings.

## 0.1.0 (2026-10-07)

Watercolour, paper, brush, pen and pencil simulation with CPU and WebGPU backends; a command-line painter; JSON stroke plans; the Paint Lab; the target-read guard; three benchmark rounds.
