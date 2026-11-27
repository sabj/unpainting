# unpaint-bench

AI models paint a picture with the simulator's brush and pen. Judges score how human the making looks and how good the painting is. Auto, the code planner alone, paints every picture too, and each model is measured against it.

The clean 0.5.1 benchmark is running. Final scores are pending.

All ten painters use medium effort. [Model IDs](../tools/paint/authors.json).

- Opus 5.5, Sonnet 5.5, Fable 5.2
- Codex Astra 6.2, Codex Sol 6.1, Codex Terra 6.1
- Gemini 4 Neon, Gemini 4 Argon, Gemini 4 Carbon
- Muse Wonder Full

## Pictures

Fifteen: four groups of three museum works and three made with an image generator. Core pictures are in bold.

| Group | Pictures |
|---|---|
| Figural | **Manet, Morisot with a Fan** · Tiepolo, Bacchus and Ariadne · Homer, The Water Fan |
| Architectural | **Prout, Laundresses before the Wasserturm** · Guardi, A Colonnade · Bonington, French Town |
| Landscape | **Turner, The Fort of L'Esseillon** · Sargent, In Austrian Tyrol · Ender, Mountain Valley |
| Abstract or loose | **Sargent, White Ships** · Morisot, Avenue du Bois · Cezanne, Bathers Under a Bridge |
| Generated | **Mittens** · Kasha portrait · Yale Rosewalk |

The five core pictures run Auto and levels 1 to 4; the other ten run Auto and level 2 ([run-sets.json](run-sets.json): `core` and `extended`). Museum, medium, size, rights and credit of each: [PICTURES.md](PICTURES.md).

Every picture is painted whole on a quarter sheet's area (the area of 27.9 × 38.1 cm), in its own proportions. Manet’s Morisot with a Fan is the one crop. The model is told the original's real size ([real-sizes.json](real-sizes.json)) as a fact.

## Levels

Each level starts a fresh session. Auto supplies the baseline.

| Level | What the model gets | How it works |
|---|---|---|
| L1 | Source picture, [script format](../docs/painting-script.md) and painting tips | Fixed rounds |
| L2 | L1 plus three visual block-in studies. The sheet is still blank | Fixed rounds |
| L3 | L2 plus an opt-in drawing, named forms, traced shapes, and Auto’s plan and finished painting | Fixed rounds |
| L4 | The same inputs and drawing choice as L3 | Isolated shell with Python and `./unpaint` |

The model hands in its own script. For each picture, the session has 60 minutes on the clock and 3.0 units for test paintings. At L4 the clock excludes GPU waits. Judges see the results only after the model finishes. [Rules](docs/rules.md).

The `open3v2` panel grades craft against the original and human-ness from ten stills of the painting in progress. The combined score is `Q × min(1, H / 65)`. [Scoring](docs/scoring.md).

## Run it

Set up as in [getting started](../docs/running.md#the-benchmarks-pictures): the inputs folder, `npm run doctor -- --strict`, each model's command-line tool signed in. That page runs one picture by hand at each level. The scorer needs Python with `bench/scorer/requirements.txt` (`BENCH_SCORE_PYTHON` names it, else `python3`).

```sh
node tools/paint/run-sets.mjs core                           # every painting the set asks for; starts nothing
npm run unpaint -- prepare core --pool local --jobs 3        # once a commit: Auto's plan, traced shapes and painting
npm run unpaint -- benchmark --out work/bench-05 --set core --models neon-m,sonnet-m --pool mini    # lists each session's command
npm run unpaint -- benchmark --out work/bench-05 --set core --models neon-m,sonnet-m --pool mini --start
npm run unpaint -- status work/bench-05                      # sessions finished, failed, still running

JUDGE_ROUTE=openrouter npm run unpaint -- score work/bench-05 --profile 0.5.1 --out work/bench-05/scores
npm run bench:summary04 -- work/bench-05/scores/results.json --set core
```

- Without `--models` the launcher runs the ten models of the roster in `run-sets.json`. `--levels` and `--pictures` narrow it.
- `--start` needs a clean checkout and Auto's painting prepared at this commit. It starts every session at once, each in `work/bench-05/<model>-<picture>-<level>/`, and paints through the [render pool](../docs/running.md#more-than-one-machine): a Mac mini or rented pods (`--pool mini,pod`; `--with-pods` starts the renter). On one machine, run the listed commands one after another instead.
- Set `OPENROUTER_API_KEY` for the hosted judges. `score` writes a manifest of finished sessions and their Auto paintings, then saves `results.json` and `SCORES.md` in the output folder. `bench:summary04` writes `SUMMARY.md` beside them.
- By hand, without the launcher: `JUDGE_ROUTE=openrouter npm run bench:score04 -- AUTO_RUN MODEL_RUN --profile 0.5.1 --out DIR`.

`npm run bench:test` tests the scorer and the run records. To add a picture see [preparing a picture](../tools/prepare/README.md); to add a model, [getting started](../docs/running.md#your-own-picture-and-your-own-model).

## Older rounds

V1 to V5 ran on releases 0.1 and 0.3 and are kept as a record: [older rounds](docs/older-rounds.md), [leaderboard](results/leaderboard.md), [gallery](results/gallery.md), [findings](results/FINDINGS.md). The chart and gallery use the scoring rules of those rounds.

<!-- rounds-table:start -->
| Round | What the model gets | Learns between tries | Winning painting (J1) |
|---|---|---|---|
| V1 | A painting toolkit and the targets | No | <a href="results/gallery.md"><img src="runs/v1-naive/argonmed/1/hills.webp" width="96" alt="Gemini 4 Argon (Medium), hills, 72.95% of target"></a> |
| V2 | V1 plus the technique guides | No | <a href="results/gallery.md"><img src="runs/v2-skill/argonmed/3/hills.webp" width="96" alt="Gemini 4 Argon (Medium), hills, 73.43% of target"></a> |
| V3 | V2 plus its own earlier tries | Yes | <a href="results/gallery.md"><img src="runs/v3-informed/astra/3/south-france.webp" width="96" alt="Codex Astra, south-france, 74.02% of target"></a> |
| V4 | The full painting pipeline | No | <a href="results/gallery.md"><img src="runs/v4-pipeline/argon/1/mittens.webp" width="96" alt="Gemini 4 Argon (High), mittens, 77.17% of target"></a> |
| V5 | The full pipeline plus its own earlier tries | Yes | <a href="results/gallery.md"><img src="runs/v5-self-study/astra/3/mittens.webp" width="96" alt="Codex Astra, mittens, 84.13% of target"></a> |
<!-- rounds-table:end -->
