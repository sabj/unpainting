# Local-panel readings of the round (22 Nov 2026)

Scripts written in the lead's work folder (`work/scores/` of a checkout) and still expecting to sit there: they find the checkout two levels up, the paintings under `work/paint/`, and write `work/SCORES.md`. Nothing here is a test or is imported by the benchmark. The runnable form is `npm run bench:score04` ([scoring](../../docs/scoring.md)).

They use the local route only (Ollama; `qwen3.8-flash-next:125b-mlx`, `qwen3.8:27b-mlx`, `gemma4:31b-mlx`), three calls a judge. The label J3-local-3x is not comparable with any J1 score.

- `score-all.py`: the paintings and originals; the scorer's reading and the classic measurements.
- `reads.py`: single-image and full-size readings.
- `humanness.py`: twelve snapshots through the film plus the finished sheet, and the finished sheet alone.
- `prog.py`: the progression check.
- `table.py`: writes `SCORES.md`.
- `pencil-control-judge.py`, `pencil-control-table.py`: does the drawing alone move the whole-sheet judge? They ran from `work/paint/l2-fix/auth/pencil-control/` as `judge.py` and `table.py`.
