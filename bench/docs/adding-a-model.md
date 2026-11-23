# Adding a model

A submission is one or more try folders (one model session per folder) in the [run format](run-format.md), scored with the benchmark's scorer, plus the rebuilt results. It arrives as a pull request.

A try is one model session that paints the requested subject.

0.4 note, 22 November 2026: the steps below were written for rounds V1 to V5. The 0.4 benchmark runs a ladder, L0 to L4 ([levels](levels.md)), with the harness in `tools/paint/` and judges that run locally ([scoring](scoring.md)). The first 0.4 run uses Gemini 4 Argon, Neon and Hydrogen at medium effort and Claude Sonnet 5.5 at medium, on subscriptions with no API keys. OpenAI models (gpt-6-astra, gpt-6.1-sol, gpt-6.1-terra) are planned, not in 0.4's first run. Hosted judging (OpenRouter or Together) is planned, not in 0.4's first run. A container for replication is planned, not in 0.4's first run. Until the 0.4 harness steps are written here, treat the sections below as the V1 to V5 process: V4 and V5 run only from tag v0.3.2.

## 1. Check the benchmark runner

```sh
npm install
npm run bench:run -- --dry-run
npm run bench:score -- bench/work/dry-run/runs/v4-pipeline/dry-run/1 --dry-run
```

The dry run needs no keys and no model. A scripted planner stands in for the model. The scorer writes a `dry-run` record.

`--dry-run --round V4` or `V5` runs a round without a model. In V4 and V5 a scripted planner writes a plan, has one start refused, paints with stops, looks, revises and finishes, at 96 px wide on the CPU. `npm run bench:test` runs both on one target.

## 2. Add a runner if you need one

`models.json` lists the models the benchmark runner knows. A model served by the Claude Code CLI, the Codex CLI or Together needs only a new entry there, with `runner` set to `claude`, `codex` or `together`. Another provider needs a branch in `scripts/runners.mjs`: a command that starts the session in the run's worktree with the prompt and the target images, and code to record its input and output token counts. Keep the model's tools general (a shell, file read and write, image viewing). Do not give it anything that reads target pixels. V3 to V5 also need `turnCommand`: a later turn resumes the same session.

## 3. Run the tries

```sh
npm run bench:run -- --model my-model --round V4            # tries 1 to 3: one session per target and try
npm run bench:run -- --model my-model --round V5            # as V4; each try is scored for the next one's feedback
```

V5 calls the judges between tries, so it needs `TOGETHER_API_KEY`. V4 and V5 paint on this machine at full size. On an Apple M3 laptop GPU, the checks and the painter took 17 minutes for one Hills painting with one revision; the model's own time comes on top. `--crops` narrows the targets and `--gpu off` paints on the CPU.

Run 3 tries per round; only tries 1 to 3 enter the results. Without the private targets a try paints `sargent` and `trumbull`, and your model appears in the leaderboard's table for those two targets. Run each try in a disposable machine or container: the model runs code without permission prompts.

## 4. Score them

```sh
# TOGETHER_API_KEY must be set in your environment; never commit it
pip install -r bench/scorer/requirements.txt
npm run bench:score -- bench/runs/v4-pipeline/my-model/1
```

Scoring one painting takes about 15 calls to AI image judges and 2 calls to judge painting stages.

## 5. Rebuild and test

```sh
npm run bench:build
npm run bench:test
```

## 6. Open a pull request

Include:

- the try folders under `runs/<round>/<model>/`, every try you ran, including bad ones;
- the rebuilt `results/results.json`, `leaderboard.md`, `gallery.md` and `FINDINGS.md`;
- the `models.json` entry and any runner change;
- in the description: the model id, the reasoning setting, the date of the runs, and the hardware.

Keep the raw outputs under `bench/work/raw/` until review is done. They hold the model's scripts and logs, and a reviewer may ask for them. A try with a blocked read is disqualified but stays in the pull request. A high cheat-risk score is reviewed and stays on the leaderboard.

Results with a changed toolkit, brief, budget or scorer are a different protocol. Put them in a separate pull request that explains the change.
