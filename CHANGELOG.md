# Changelog

## 0.5.1

L2 gets the source and three colour studies. The prepared drawing moves to L3 and starts off there and at L4. L4 has its own home directory and 60 minutes of model time. Authored scripts leave their own whites. Brief 5 shows how to use a broad mop, work into a wet wash and sketch freehand.

The `open3v2` judges grade craft side by side against Auto (`versus-auto`, alternating A/B) and human-ness from ten progress frames. A human-ness score below 65% discounts the craft score. The clean benchmark is running.

## 0.5.0

The WebGPU painter runs on Metal and Vulkan. Wet paint flows around the fibres of cold-press paper, blooms into damp washes and leaves grains in the hollows as it dries. A turning brush can now clear its own starting line without clipping the next pass (`endLine`).

## 0.4.0 (2026-11-24)

Wash physics (paper cockle, back-runs, damp levelling), form-following brushwork with organic edges and uneven brush load, varying centimetre-scale paper grain relief (with optional scanned paper height maps), unified `npm run unpaint` CLI, and the new 0.4 benchmark (Auto plus independent levels 1 to 4 on a quarter sheet, scored against Auto). V4 and V5 are retired and replay only from tag `v0.3.2`.

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
