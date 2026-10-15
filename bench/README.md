# unpaint-bench

AI models paint five small targets, each a section of a larger image, with the simulator's brush and pen. In V1 to V3 each painting gets 2,500 strokes and about 15 minutes. In V4 and V5 the model plans each painting and the painter paints it, with 85 minutes of the model's own time per painting. Vision judges score the finished painting and the order it was painted in.

## Rounds

A round is a benchmark version with a different set of tools or feedback. A try is one model session that paints the requested targets.

<!-- rounds-table:start -->
| Round | What the model gets | Learns between tries | Winning painting (J1) |
|---|---|---|---|
| V1 | A painting toolkit and the targets | No | <a href="results/gallery.md"><img src="runs/v1-naive/argonmed/1/hills.webp" width="96" alt="Gemini 4 Argon (Medium), hills, 72.95% of target"></a> |
| V2 | V1 plus the technique guides | No | <a href="results/gallery.md"><img src="runs/v2-skill/argonmed/3/hills.webp" width="96" alt="Gemini 4 Argon (Medium), hills, 73.43% of target"></a> |
| V3 | V2 plus its own earlier tries | Yes | <a href="results/gallery.md"><img src="runs/v3-informed/astra/3/south-france.webp" width="96" alt="Codex Astra, south-france, 74.02% of target"></a> |
| V4 | The full painting pipeline | No | <a href="results/gallery.md"><img src="runs/v4-pipeline/argon/1/mittens.webp" width="96" alt="Gemini 4 Argon (High), mittens, 77.17% of target"></a> |
| V5 | The full pipeline plus its own earlier tries | Yes | <a href="results/gallery.md"><img src="runs/v5-self-study/astra/3/mittens.webp" width="96" alt="Codex Astra, mittens, 84.13% of target"></a> |
<!-- rounds-table:end -->

V1 to V5 are published. V3 ran the Claude, Codex, Gemini 4 Argon and Muse models; V4 and V5 ran the Claude, Codex and Gemini 4 Argon models. Not every model ran every round; the [leaderboard](results/leaderboard.md) lists the tries each model ran. In V4 and V5 the first try is shared: V5 try 1 has no feedback yet, so it is also V4 try 1.

## Subjects

| Subject | Style | Target in the repo |
|---|---|---|
| Hills | Loose ink and wash | Yes, photo by Sam Jackson, see [NOTICE](../NOTICE) |
| France | Pen and light wash | Yes, photo by Sam Jackson, see [NOTICE](../NOTICE) |
| Ships | Watercolor after Sargent | Yes, public domain |
| Mittens | Portrait sketch and light washes | Yes, photo by Sam Jackson, see [NOTICE](../NOTICE) |
| Trumbull | Architectural watercolor | Yes, third-party photo credited in [NOTICE](../NOTICE) |

V3 is compared on Hills, France and Ships. The 0.1.0 V3 runs painted only those three; the 0.1.1 Muse V3 runs painted all five, and their Mittens and Trumbull paintings are shown but not counted. V4 and V5 painted all five. One of the painter's preset recipes was tuned on Trumbull, so V4 and V5 Trumbull scores may run high. [Target sizes](crops/README.md) gives the physical scale.

## Results

All five rounds were painted with painter V096, sim 100 and judges J1, in releases 0.1.0 and 0.1.1. Each result is labelled with its round, painter version, sim version, judge version and release. To benchmark a newer painter or sim, rerun V4 or V5 with it; the new tries form their own group in that round. To reproduce, check out the tag a result names, `v0.1.0` or `v0.1.1`; [versions](../docs/versions.md) explains the scheme.

- [Leaderboard](results/leaderboard.md): scores, intervals, cost and time per model and round
- [Gallery](results/gallery.md): each model's best painting of each target, shown as its 10 to 100% stages
- [Findings](results/FINDINGS.md): what changed between rounds

## Method

- [Rules](docs/rules.md): budget, materials and what a script may read
- [Anti-cheat](docs/anti-cheat.md): the guard, a check that blocks target-pixel reads, and the cheat-risk score
- [Scoring](docs/scoring.md) and [statistics](docs/statistics.md)
- [Run format](docs/run-format.md): what each try records
- [Protocol inputs](v2/README.md): toolkit, briefs, technique guides and runners; [V3](v3/README.md) and [V4 and V5](v4v5/README.md) add their own briefs
- [Adding a model](docs/adding-a-model.md)

## Reproduce

You can rerun every round on your own machine, with the published briefs and rules. V4 and V5 paint on your GPU or CPU instead of rented cloud machines, with the public painter instead of the private build the original runs used, so their scores will differ. A V3 session offers `--tries` attempts (default 3); the published sessions offered up to five.

```sh
npm run bench:test                                   # check every run record, that results/ regenerates unchanged, and dry runs of V3 to V5
npm run bench:build                                  # rebuild results/ from runs/
npm run bench:run -- --dry-run                       # a scripted painter runs V1, no keys needed
npm run bench:run -- --dry-run --round V5            # a scripted planner runs V5 at a small size, no keys needed
npm run bench:run -- --round V4 --model opus         # one model, three tries of V4 on the five targets
```

V5 try 1 reuses V4 try 1 (the same session), out of laziness.
