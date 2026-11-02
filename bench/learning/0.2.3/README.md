# 0.2.3 learning: Fable 5.1, Haiku 5.5 and Codex Terra on the 0.2.1 bench

Snapshot from 2026-11-02. Runs used release 0.2.1 (painter V101, sim 102) on branch `bench/fable-021` (9cd28e4), which adds the three models, a Fable price row and the Yale targets h36a and h34a. Targets: hills, south-france, sargent, mittens, h36a, h34a. Trumbull is dropped. V4 and V5 used `--profile full --tries 3`.

These results are not for publishing. Most V4 and V5 paintings used the ink-v1 drawing, so they say little about the painter's current best settings.

## What was learned

- Ink is off by default in 0.2.1, but a V4 or V5 plan can still ask for it. Across the 24 finished Fable V4/V5 paintings (`V4` tries 1–3 and `V5` try 1, 6 targets each), 19 of 24 put `"--outlinemedium", "ink"` in `extra-args.json` (4 of 6 in V5 try 1; 5 of 6 in V4 tries 1, 2, 3; graphite only on `sargent` and once on `mittens`). Checking the work-dir `extra-args.json` and `run-card.json` files confirmed what the painter actually ran: 16 of those 19 ink paintings ran pure `ink-v1` (`--inkrecipe none` with `plan-args.mjs` `BASE` tokens `_ink4`, `_sep8`, `_dwg200`, `_uncap`), 3 of 19 (`h36a` V4/2, `h34a` V4/3, `h34a` V5/1) manually added individual 0.2.1 flags (`--linesmooth 0.3..0.4`, `--inkwidthfloor 0.25..0.6`, `--inkhand 1`), and 0 of 24 used `--inkrecipe v2` or `--inkrecipe wash`. In addition, when `--recipe none` is passed, `expandRecipe` in `src/paint/recipe.mjs` places `config.json` `drawingFlags` before `argv`, so `plan-args.mjs`'s trailing `--outlinemedium graphite` overrides `config.json`'s `drawing.medium: "ink"` unless `--outlinemedium ink` is passed in `extra-args.json`.
- `extra-args.json` also let models bypass SAM segmentation and clean-tree checks: 24 of 24 Fable V4/V5 paintings and 4 of 4 Haiku 5.5 V4 paintings added `"--segments", "off"` and `"--allowdirty", "1"` to `extra-args.json` after `check.sh` failed without `PAINTER_SEG_PYTHON` / `PAINTER_SAM_CHECKPOINT` in the runner environment. Fix: replace `LOCKED_OPTIONS` with an explicit `ALLOWED_EXTRA_ARGS` allowlist in `plan-args.mjs` and preflight SAM + clean git state before launching sessions.
- V5 scores each try before the next one, with `python3` from PATH. `bench/scripts/score.mjs` takes `--python`, but `round45.mjs` does not pass it on. With a system python3 that lacks the scorer packages, V5 stops after try 1, and `bench:run` still exits 0. Fix: pass the scorer Python through, and fail the run when that scoring step fails.
- `bench:run` V4 and V5 default to the lite profile, which allows one try. Published comparisons need `--profile full --tries 3`.
- Fable 5.1 finished every painting: 66 of 66 over 11 tries with no failures. It is slow. V5 try 1 took 164 minutes, and the V3 tries took 20 to 26 minutes each.
- Haiku 5.5 is fast: 6.3 and 8.1 model minutes per V4 painting.

## Scores so far

Fable V5 try 1 used judges J2-full. V1 try 1 used J1-full. The 0.2.1 replays are Opus 5.5's published V5 plans repainted on 0.2.1, judged with J1 (`~/v021-release` on the Mini, archived on the storage box under `mini-offload-20261022/v021-release`).

| Target | Fable V1 t1 | Fable V5 t1 | 0.2.1 default replay | 0.2.1 best opt-in replay |
|---|---:|---:|---:|---:|
| Hills | 4.23 | 5.73 | 6.42 | none |
| South France | 4.63 | 5.82 | 5.69 | 6.45, plan ink drawing |
| White Ships | 5.06 | 5.27 | 6.27 | 6.32, wash, no plan |
| Mittens | 4.70 | 6.75 | 6.55 | 7.16, plan ink drawing |
| Yale h36a | 4.96 | 6.76 | 5.58 | 6.87, `--inkrecipe auto` |
| Yale h34a | 5.14 | 7.05 | 5.74 | 6.73, `--inkrecipe auto` |

## Files

- `runs/`: run.json and painting thumbnails for every finished Fable try, V1 to V5.
- `scripts/bench021.sh`, `scripts/bench021b.sh`: the chains. The second fixes the scorer Python and the exit codes.
- `scripts/score021.sh`: scores the finished runs on Together.
- `scripts/tearsheet.py`: builds the Fable against 0.2.1 tearsheet.
