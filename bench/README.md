# unpaint-bench

AI models paint a subject with the simulator's brush and pen, and judges score how human the making looks and how good the painting is. The code planner alone, "Auto", is the reference. 0.4 is a new series: its scores are not comparable with the rounds V1 to V5.

## The pictures

Fifteen pictures: four groups of three museum works, and a bonus group of three pictures made with an image generator.

| Group | Pictures (core in bold) |
|---|---|
| Figural | **Manet, Morisot with a Fan** · Tiepolo, Bacchus and Ariadne · Homer, The Water Fan |
| Architectural | **Prout, Laundresses before the Wasserturm** · Guardi, A Colonnade · Bonington, French Town |
| Landscape | **Turner, The Fort of L'Esseillon** · Sargent, In Austrian Tyrol · Ender, Mountain Valley |
| Abstract or loose | **Sargent, White Ships** · Morisot, Avenue du Bois · Cezanne, Bathers Under a Bridge |
| Bonus (generated) | **Mittens** · Kasha portrait · Yale Rosewalk |

- Core: five pictures, one from each group. They run levels 1 to 4.
- Extended: all fifteen. The other ten run Auto and level 2.

[PICTURES.md](PICTURES.md) has each picture's museum, medium, real size, rights and credit line, and the optional and
private pictures that are not scored.

## The ladder, in 0.4

Every level is one try that hands in the model's own script, with a budget of 3.0 look units.

| Level | What the model is given |
|---|---|
| L1 | The freehand kit and its tips (technique guides and worked examples). Paper colour is its choice (white or a tone). One attempt; budget 3 runs of its script (each run that lays a mark costs 1.0). |
| L2 | The same inputs the code planner gets: the prepared drawing, the three colour studies as pictures, the named forms. No code plan: the model plans the painting itself. |
| L3 | One retry of L2, after studying its own L2 painting (its finished full-size painting, film and stroke map). Fresh budget. |
| L4 | One more retry, from its own L3 painting, film and stroke map, now also given the studies' traced shapes as regions it may use, change or ignore (they may be wrong). Fresh budget. |

Nothing of Auto is given at any level: no plan, planner, painting, film or stroke map. A hand-in of planner settings, or of the code's plan, is refused.

Each step of the ladder changes several things at once, and level 1 paints in a different way from levels 2 to 4 (its own code driving the brush, against a painting script the painter lays). A gain between two levels is the effect of the whole step and cannot be assigned to one kind of help: [what changes from one level to the next](docs/levels.md#what-changes-from-one-level-to-the-next) lists all of it.

Details: [levels](docs/levels.md), [rules](docs/rules.md) and [scoring](docs/scoring.md).

- Drawing is the model's choice: pencil, pen or none; no drawing is a normal choice. The prepared drawing is offered, not required, and its lines may go down before the washes, with a stage of them, or after. Pen ink is waterproof or soluble. It gets warnings, not refusals, where a choice only risks the painting.
- Retries are self-study. The model sees its own painting, replay and stroke map and writes its own assessment. It never gets a score or a critique.
- Budget for one try: 3.0 look units. A look's price is fixed by size: a half-size whole look 0.3, full size 1.0, a partial look its share, never under 0.2 (at L2 to L4 looks are half size; at L1 each run is a full-size painting, 1.0). At L2 to L4 the full-size final is painted after the session and not charged; at L1 the painting is its last completed run. How a model paints (water, strokes, waits, dryings) is free and measured beside the score: simulation work, sweeps, dryings, seconds, tokens (fresh, cached, output), steps. One runaway guard: water steps over ten times Auto's for the subject stop the painting (reported as a stop, not scored). At L2 to L4 steps and the six-hour clock are runaway guards only; an L1 session has 60 minutes on the clock.
- Scores: three readings by one judge panel, kept apart. Human-ness, the main one, from the film: the judges see the opening (the untouched paper, as context), the drawing as it stood before the first wash (scored, reported beside), ten stills of the painting in progress from the first wash to just before the finish, whose mean is human-ness, and the finished sheet (scored, reported beside). The ten are placed by measured progress, the share of the finished picture on the sheet, not by frame number, and the judges never see the original here. Quality: the painting alone, as a share of its original read alone. Likeness: the original and the painting together, in its own column. Combined: two parts human-ness to one part quality; likeness is not in it. Auto sets the difficulty. A run that failed is counted as a failure, never dropped. See [scoring](docs/scoring.md).
- Every picture is painted on the same area of paper: a quarter sheet (27.9 x 38.1 cm, about 1,063 cm2), in the
  picture's own proportions, whatever the file's pixel size or orientation. A cell is 0.26 mm, so every sheet holds
  about 1.57 million cells (`tools/paint/sheet-rule.mjs`; run it to list every registered subject's sheet). The
  benchmark's fifteen run only from registrations made under this rule (ids ending `-qs`, `bench/run-sets.json`); a
  benchmark run on one that is not is refused, and `node tools/paint/run-sets.mjs check` says which are registered
  and prepared. A subject registered before the rule stays under its old id with its old sheet, for earlier results
  only. The original's real size is recorded and told to the model as a fact;
  it is not reproduced. Each picture is the whole sheet, never a crop, with one exception chosen by the owner (Manet's
  Morisot with a Fan, its head, shoulders and hand).
- Judges: one named panel on every route, `open3` (GLM-5.3-Flash, Qwen3.8-27B, Gemma-4-31B, reasoning off): hosted on OpenRouter with zero data retention (`JUDGE_ROUTE=openrouter`), or locally through Ollama (the default route; GLM-5.3-Flash's local tag is named in `JUDGE_LOCAL_TAGS`). Any other panel must be asked for by name (`JUDGE_PANEL`). Panel and settings are written into every results file. See [scoring](docs/scoring.md#judges).

## Real sizes of the originals (told to the model as a fact)

At levels 2 to 4 the task says the original's size in one line beside the sheet's, for example "The original is
19.7 x 28 cm; your sheet is 27 x 39.4 cm (height x width)." It is a fact for the model to weigh (how large a brush
mark was on the original); it never sizes the sheet. A generated picture has no real size and is given a nominal one,
said as such. The sizes are in [`real-sizes.json`](real-sizes.json), height x width in cm; a subject's record may
carry its own. A picture with no recorded size is told nothing.

Tiepolo 31.2 x 24.3 cm · Homer, The Water Fan 37.4 x 53.4 · Manet, Morisot with a Fan 20.9 x 16.8 (the whole sheet; the
picture painted is a part of it) · Guardi 45.4 x 30.1 · Prout 30.2 x 21.6 · Bonington 18.1 x 14.3 · Sargent, In
Austrian Tyrol 29.9 x 45.2 · Turner 19.7 x 28 · Ender 21 x 28.5 · Sargent, White Ships 35.2 x 49.2 · Cezanne
21 x 27.2. Nominal, generated: Mittens and Kasha portrait 30.5 x 23 · Yale Rosewalk 28 x 38. Not told yet: Morisot,
Avenue du Bois (the Met gives its sheet as 20 x 28 cm, which is not the shape of our file, so the size is held back
until that is explained). The museums' own size lines are in [PICTURES.md](PICTURES.md).

RESULTS: to be filled from the frozen run.

The models run are listed with the results. Not in 0.4's first run: a container for replication.

## Running a set

[`run-sets.json`](run-sets.json) names the pictures above by their subject ids, with their groups and the depth each
runs (core: levels 1 to 4, and Auto, which every score is measured against; the other ten: Auto and level 2).
The runners read the file. A set's name stands for its pictures wherever a subject is named, and only the pictures
that run at the level asked for are painted: `npm run paint -- extended paint` paints Auto for all fifteen,
`npm run paint -- extended paint --author neon-m --level L2` runs level 2 on all fifteen, and at L3 or L4 the set is
its core five (each run from its own previous folder, one picture at a time). Level 1:
`node bench/scripts/run.mjs --round V3 --model neon-m --crops core`. Each core picture has a level 1 target
(`v3/crops.json`, made by `scripts/add-level-one-target.mjs`); the run stops before any session, naming them, while a
target has no rendering unit, which it gets from its prepared Auto (today: Prout and White Ships). `node tools/paint/run-sets.mjs core` (or `extended`) lists every painting a set asks for and starts
nothing.

## How to replicate 0.4

Machines: sessions run on a Mac (Apple silicon). Painting runs on the GPU: on that Mac, on a Mac mini over ssh, or on rented GPU pods, through the render pool (`tools/paint/render-pool.mjs`). Scoring runs locally or hosted.

```sh
# level 1: one attempt with the freehand kit, closed like every session (the runner keeps its old round name, V3;
# targets in v3/crops.json, or a run set's name; the session has 60 minutes on the clock)
node bench/scripts/run.mjs --round V3 --model neon-m --crops TARGET --out DIR

# levels 2 to 4 (the same model keys at every level: argon-m, neon-m, hydrogen-m, carbon-m, sonnet-m;
# bench/models.json for level 1, tools/paint/authors.json for levels 2 to 4)
npm run paint -- SUBJECT prepare                                   # once per subject: the inputs every level gets
npm run paint -- SUBJECT paint --out AUTODIR                       # Auto, the reference (--author auto is the default)
npm run paint -- SUBJECT paint --author neon-m --level L2 --out L2DIR
npm run paint -- SUBJECT paint --author neon-m --level L3 --previous L2DIR --out L3DIR   # one retry from its L2 run folder
npm run paint -- SUBJECT paint --author neon-m --level L4 --previous L3DIR --out L4DIR
npm run paint -- SUBJECT paint --author neon-m --level L2 --dry-run   # what would run; paints nothing
npm run paint -- core paint --author neon-m --level L2 --dry-run      # the same for a run set (core, extended)

# score with the 0.4 panel, hosted (or locally: docs/scoring.md#judges); every level's output goes in together
JUDGE_ROUTE=openrouter OPENROUTER_API_KEY=... npm run bench:score04 -- AUTODIR L1_TRY_FOLDER RUN_FOLDER... --out DIR   # Auto's painting of the subject sets the difficulty
npm run bench:score04 -- ... --out DIR --repeat 2                  # the same paintings scored again, kept apart: the judges' noise
npm run bench:summary04 -- DIR/results.json --set core             # every model's levels against Auto; failed and missing runs count as 0
```

`UNPAINT_RENDER=pool` paints a session's looks and final through the render pool (committed code only); the default, `local`, paints on this Mac. The pool folder's `mini.json` adds the Mac mini; `tools/cloud/render-pool-pods.py POOL_DIR` rents and returns the pods. More in [running](../docs/running.md).

## History: rounds V1 to V5

Everything below describes the earlier rounds, kept as a record. Their rules (2,500 strokes, 85 minutes of model time, look counts) no longer apply. V1 to V3 each gave 2,500 strokes and about 15 minutes. In V4 and V5 the model planned each painting and the painter painted it. Vision judges scored the finished painting and its order.

## Rounds

The benchmark has five rounds, V1 to V5, each with different tools or feedback. A try is one model session that paints the requested targets.

<!-- rounds-table:start -->
| Round | What the model gets | Learns between tries | Winning painting (J1) |
|---|---|---|---|
| V1 | A painting toolkit and the targets | No | <a href="results/gallery.md"><img src="runs/v1-naive/argonmed/1/hills.webp" width="96" alt="Gemini 4 Argon (Medium), hills, 72.95% of target"></a> |
| V2 | V1 plus the technique guides | No | <a href="results/gallery.md"><img src="runs/v2-skill/argonmed/3/hills.webp" width="96" alt="Gemini 4 Argon (Medium), hills, 73.43% of target"></a> |
| V3 | V2 plus its own earlier tries | Yes | <a href="results/gallery.md"><img src="runs/v3-informed/astra/3/south-france.webp" width="96" alt="Codex Astra, south-france, 74.02% of target"></a> |
| V4 | The full painting pipeline | No | <a href="results/gallery.md"><img src="runs/v4-pipeline/argon/1/mittens.webp" width="96" alt="Gemini 4 Argon (High), mittens, 77.17% of target"></a> |
| V5 | The full pipeline plus its own earlier tries | Yes | <a href="results/gallery.md"><img src="runs/v5-self-study/astra/3/mittens.webp" width="96" alt="Codex Astra, mittens, 84.13% of target"></a> |
<!-- rounds-table:end -->

V1 to V5 are published. V3 ran the Claude, Codex, Gemini 4 Argon and Muse models. V4 and V5 ran the Claude, Codex and Gemini 4 Argon models. Not every model ran every round. The [leaderboard](results/leaderboard.md) lists the tries each model ran. In V4 and V5 the first try is shared: V5 try 1 has no feedback yet, so it is also V4 try 1.

## Subjects of rounds V1 to V5

These five small targets belong to the earlier rounds, not to the 0.4 set. Their files, paintings and scores are kept.
Ships is Sargent's White Ships, which 0.4 paints at a larger size; the 0.4 Mittens is a different picture.

| Subject | Style | Target in the repo |
|---|---|---|
| Hills | Loose ink and wash | Yes, photo by Sam Jackson, see [NOTICE](../NOTICE) |
| France | Pen and light wash | Yes, photo by Sam Jackson, see [NOTICE](../NOTICE) |
| Ships | Watercolor after Sargent | Yes, public domain |
| Mittens | Portrait sketch and light washes | Yes, photo by Sam Jackson, see [NOTICE](../NOTICE) |
| Trumbull | Architectural watercolor | Yes, third-party photo credited in [NOTICE](../NOTICE) |

V3 is compared on Hills, France and Ships. The 0.1.1 Muse V3 runs painted all five targets; their Mittens and Trumbull paintings are shown but not counted. V4 and V5 painted all five. One of the painter's preset recipes was tuned on Trumbull, so V4 and V5 Trumbull scores may run high. [Target sizes](crops/README.md) gives the physical scale.

## Results

All five rounds were painted with painter V096, sim 100 and judges J1, in releases 0.1.0 and 0.1.1. Each result is labelled with its round, painter version, sim version, judge version and release. V4 and V5 were retired in 0.4; tag v0.3.2 reruns them, and a V6 task is drafted in [v6/TASK.md](v6/TASK.md). To reproduce, check out the tag a result names, `v0.1.0` or `v0.1.1`; [versions](../docs/versions.md) explains the scheme.

- [Leaderboard](results/leaderboard.md): scores, intervals, cost and time per model and round
- [Gallery](results/gallery.md): each model's best painting of each target, shown as its 10 to 100% stages
- [Findings](results/FINDINGS.md): what changed between rounds

## Method

- [Levels](docs/levels.md): the ladder L0 to L4
- [Rules](docs/rules.md): what a model may change, the workspace, budgets
- [Anti-cheat](docs/anti-cheat.md): the guard, a check that blocks target-pixel reads, and the cheat-risk score
- [Scoring](docs/scoring.md) and [statistics](docs/statistics.md)
- [Run format](docs/run-format.md): what each try records
- [Protocol inputs](v2/README.md): toolkit, briefs, technique guides and runners; [V3](v3/README.md) and [V4 and V5](v4v5/README.md) add their own briefs
- [Adding a model](docs/adding-a-model.md)

## Reproduce

You can rerun every round on your own machine, with the published briefs and rules. V4 and V5 run from a checkout of tag v0.3.2, whose painter still reads their plans. Scores can differ from the published V096 runs. From 0.3.3 V4 and V5 paint each target at its own size (about 300 cells wide on a 78 mm sheet, [subjects.json](v4v5/subjects.json)); the published runs painted it enlarged four times, 1200 to 1224 cells wide on 158 and 280 mm sheets. The two sizes never share a result group. The plan's drawing section and explicit arguments control the drawing medium and order; explicit command-line arguments take precedence. Keep new runs under their actual painter, simulator and judge versions rather than rewriting historical results. A V3 session offers `--tries` attempts (default 3). The published sessions offered up to five.

```sh
npm run bench:test                                   # check every run record, that results/ regenerates unchanged, and dry runs of V3 to V5
npm run bench:build                                  # rebuild results/ from runs/
npm run bench:run -- --dry-run                       # a scripted painter runs V1, no keys needed
npm run bench:run -- --dry-run --round V5            # a scripted planner runs V5 at a small size, no keys needed
npm run bench:run -- --round V4 --model opus         # one model, one lite planning try on the five targets
npm run bench:run -- --round V4 --model opus --profile full  # three full self-view tries
```

V5 try 1 reuses V4 try 1 (the same session).

## Routine development benchmark

`npm run bench:lite -- --plan` shows the offline allocation before any model calls.
`npm run bench:lite -- --gpu off` runs all five targets with Astra, Sol, Opus, Sonnet, Argon-high and Gemini Flash.
Use `--models all` or explicit keys such as `--models core,wonderfull,spark` to include other registered models.

Lite is a separate planning screen: one five-minute plan per target, one harness check and render after the model exits,
no automatic repairs, and J2-lite judging. Full mode keeps three tries and model self-view. Both paint each target at
source scale, one sheet cell for each target pixel on a sheet about 78 mm wide, and keep the guards and all required
stages. The painter does not paint from an enlarged source. Their results are grouped separately; a cheap screen does
not establish the quality of a full run. See [profiles and measurements](docs/profiles.md).
