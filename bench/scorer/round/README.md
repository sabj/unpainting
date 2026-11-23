# The round's readings by the local judge panel (22 Nov 2026)

Kept here so they are not lost. They were written and run in the lead's work folder, `work/scores/` of a checkout,
and still expect to sit there (they find the checkout as the folder two levels above their own, the paintings under
`work/paint/`, and write `work/SCORES.md`); the two `pencil-control-*` files ran from
`work/paint/l2-fix/auth/pencil-control/` as `judge.py` and `table.py`. Copy them back there to run them.

All use the local route only (`JUDGE_ROUTE=local`, Ollama; panel `qwen3.8-flash-next:125b-mlx`, `qwen3.8:27b-mlx`,
`gemma4:31b-mlx`), three calls a judge, one model in memory at a time. The judge label is J3-local-3x: not J1, and
not comparable with any published J1 score.

- `score-all.py`: the list of paintings and originals; the scorer's own reading against the source
  (`score_painting.py`, unchanged) and the classic measurements.
- `reads.py`: the single-image reading (one picture, scored as a watercolour with the scorer's rubric, not told
  whether it is an original or a painting; a painting's result is its share of its original's score) and the
  full-size readings (the sheet at its own pixels).
- `humanness.py`: the project's human-ness rubric (`paint/painter/judge/RUBRIC.md`, outside this repository): twelve
  snapshots through the painting's film plus the finished sheet, and the finished sheet alone.
- `prog.py`: the progression check (`progression.py`) on the local panel.
- `table.py`: writes `SCORES.md`: human-ness, quality and likeness, and combined (two parts human-ness to one part
  quality, a setting), each a share of the original's own score; anti-cheat, algorithmic and difficulty adjustment
  beside them.
- `pencil-control-judge.py`, `pencil-control-table.py`: the pencil control (does the drawing alone move the
  whole-sheet judge?).

Nothing here is a test or is imported by the benchmark. The runnable form is `npm run bench:score04` (`bench/scorer/score04.py`, `bench/docs/scoring.md`).
