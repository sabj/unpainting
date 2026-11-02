# 0.2.3 learning: Fable 5.1, Haiku 5.5 and Codex Terra on the 0.2.1 bench

Snapshot from 2026-11-02. Runs used release 0.2.1 (painter V101, sim 102) on branch `bench/fable-021` (9cd28e4), which adds the three models, a Fable price row and the Yale targets h36a and h34a. Targets: hills, south-france, sargent, mittens, h36a, h34a. Trumbull is dropped. V4 and V5 used `--profile full --tries 3`.

These results are not for publishing. Most V4 and V5 paintings used the ink-v1 drawing, so they say little about the painter's current best settings.

## What was learned

- Ink is off by default in 0.2.1, but a V4 or V5 plan can still ask for it. Fable's plans chose `medium: ink` on 4 to 5 of the 6 targets in every V4 and V5 try, and graphite only on sargent and once on mittens. The bench needs to keep ink-v1 out of model plans, or offer only the 0.2.1 recipes (`--inkrecipe wash` or `auto`).
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
