# Scoring

Scores in 0.4 are a new series and are not comparable with rounds V1 to V5 ([History](#history-rounds-v1-to-v5)).

## Running the 0.4 scorer

```sh
npm run bench:score04 -- RUN_FOLDER... --out DIR
npm run bench:score04 -- runs.json --out DIR
```

`bench/scripts/score04.mjs` runs `bench/scorer/score04.py` under `BENCH_SCORE_PYTHON` (or `python3`), requiring `bench/scorer/requirements.txt`. It writes `DIR/results.json` and `DIR/SCORES.md`, caching individual judge replies in `DIR/readings/`.

- A run folder holds `run.json`, the painting (`plate/painting.png` or `painting.png`) and its film (`frames.json`). The original image path comes from `run.json` (`subject.sourceAbs`), and the style description from `SUBJECTS.json`.
- A manifest is a JSON list (or `{"runs": [...]}`) of run folders or `{folder, label?, subject?, target?, style?}` objects.
- The scorer refuses before any judge call if a painting, original, film (`>= 14` frames starting with the untouched-paper opening frame), rubric or API key is missing.
- Exit codes: `0` complete; `1` written with missing judge readings listed under `## Faults first` (a partial panel is never averaged); `2` refused before judging.
- `npm run bench:test` tests the scorer with a stub judge (`bench/scorer/score04-test.py`).

## What is scored

Each painting receives separate readings shown together:

- **Human-ness** (main reading): does the painting in progress look made by a person?
- **Quality and likeness**: scored independently on the painting and on the original (0–10); the painting's figure is its share of the original's score (for example, original 9.0, painting 4.5 -> 50%; can exceed 100%).
- **Combined**: 2 parts human-ness to 1 part quality (`WEIGHTS` in `bench/scorer/s04_table.py`), with both parts kept visible.
- **Difficulty adjustment**: using the subject's Auto painting in the same batch, `(painting - Auto) / max(top - Auto, top / 5)`, where `0` is level with Auto and the headroom floor is 20% of the scale. Shown beside the raw figures.
- **Side readings** (kept separate, never blended into the score): anti-cheat (`cheat-risk.json`), algorithmic metrics (`bench/scorer/classic.py`: value shapes, edges, marks, 0–10) and session usage (`usage.json`).

## Human-ness (`wash10`)

Judges see the film sequence without knowing the painter or level:

1. **Opening frame**: the untouched paper in the chosen paper colour, shown as context only and not scored.
2. **Drawing frame**: the last frame before the first wash (determined from `frames.json`), scored 1–5 and reported beside human-ness without entering the mean (omitted when no drawing precedes the first wash).
3. **Ten wash frames**: evenly spaced from the first wash (frame 1) to the finished sheet (frame 10), each labelled with its percentage complete.

For the sequence, each judge answers whether the order and marks look human (`yes`/`no`) and scores each snapshot 1–5 with lettered tells `a`–`j` under [`human-ness-rubric.md`](human-ness-rubric.md) (whose SHA-256 is recorded in `results.json`). Human-ness is the mean of the ten wash frames as a percentage of 5 (`mean / 5`). The table also reports thirds (frames 1–3, 4–7, 8–10), tell tallies and `yes` vote counts.

Pass `--snapshots film13` only to score pre-rc7 films under the earlier 12-frame scheme; `wash10` and `film13` scores are not comparable.

## Quality and likeness

Each judge sees a single image (at most 768 px on the long side), blind to whether it is an original or a simulator painting, and scores `composition_values`, `edges_detail`, `marks_texture` and `overall` from 0 to 10.

## Judges

The 0.4 panel is three open-weight vision models: **GLM-5.3-Flash**, **Qwen3.8-27B** and **Gemma-4-31B**. Each judge is called 3 times at temperature 0; a judge's score is the median of its 3 readings (all 3 required), and the panel score is the mean of the three judges' medians.

- **Hosted (0.4 panel)**: `JUDGE_ROUTE=openrouter JUDGE_HOSTED_PANEL=open3` (`z-ai/glm-5.3-flash`, `qwen/qwen3.8-27b`, `google/gemma-4-31b-it`), routed to zero-data-retention providers only. Label: `J3-open-3x-hosted`. Requires `OPENROUTER_API_KEY`.
- **Local** (`JUDGE_ROUTE=local`, default): Ollama (`bench/scorer/local_route.py`, `JUDGE_LOCAL_URL`, `JUDGE_LOCAL_PANEL`), loading and unloading one model at a time. Label: `J3-local-3x`.
- **Legacy J1 panel** (`JUDGE_ROUTE=openrouter` without `JUDGE_HOSTED_PANEL`, or `JUDGE_ROUTE=together` with `TOGETHER_API_KEY`): Kimi-K3, GLM-5.3-Flash and Qwen3.5-9B (`J4-openrouter-3x`, `J4-together-3x`).

## History: rounds V1 to V5

Rounds V1 to V5 (releases 0.1.0 and 0.1.1) used judge `J1` (`bench/scorer/score_painting.py`, `bench/scorer/progression.py`, `bench/scripts/score.mjs`) at each target's native size (~300 px wide):

- **Vision score**: Kimi-K3, GLM-5.3-Flash and Qwen3.5-9B, 5 calls per judge at temperature 0 (at least 3 valid calls required in `J1`; all 5 in `J2`), mean of the three judges' medians.
- **Classic score**: mean of value shapes, edges and marks (0–10) from `bench/scorer/classic.py`.
- **Composite and indexing**: mean of vision and classic scores, divided by the target's own self-score (Hills 8.43, France 8.43, Ships 8.76, Mittens 8.76, Trumbull 8.57) to yield `% of target`.
- **Statistics** (`bench/scripts/build-results.mjs`): a model's round score is the mean across scored paintings in tries 1–3 at configured effort (`xhigh` where supported), with a 95% percentile bootstrap interval (2,000 resamples, seed 7; 10,000 resamples over models for paired V1 vs V2 differences in [FINDINGS.md](../results/FINDINGS.md)). Per-try strokes, minutes, tokens and cost (`≈$` for API-equivalent subscription estimates from [`api-prices.json`](../api-prices.json)) are medians across tries.
- **Progression check**: GLM-5.3-Flash and Qwen3.5-9B scored the 10, 25, 50, 75 and 100% stage strip from 1 to 5; the mean of the 10% and 25% stages (`earlyMean`) fed the cheat-risk score.
- **Pairwise engine comparisons**: `node bench/scripts/pair-judge.mjs --manifest pairs.json --out DIR` runs blind 64 mm tile comparisons (`bench/scorer/pairs.py`) alongside copy limits (`bench/scripts/copy-limits.mjs`: target guard clean, `--notargetlooks 1`, `hfCorr <= 0.645` at `>= 1000` px or `0.53` below, and strokes within `strokeCeiling`).

### Anti-cheat

- **Runtime block (V1–V3 toolkit)**: `bench/v2/kit/guard.mjs` (Node `fs` and `sharp`) and `bench/v2/kit/py/sitecustomize.py` (Python `open`) refuse and log any image read outside `bench/out/`. Scripts receive only `kit.coarse(task)` (at most 24 × 24 cells, 8 colours). A logged read or post-run script audit hit disqualifies the try.
- **Cheat-risk score** (informational, 0 to 1; low `< 0.3`, medium `0.3–0.6`, high `>= 0.6`):
  - `progression` = `clamp01((3.5 - earlyMean) / 2)`
  - `copy` = `clamp01(max(copyHF / threshold) - 0.5)` (`bench/scorer/copy_band.py`; thresholds 1.25× V2 max: Hills 0.021, France 0.044, Ships 0.068, Trumbull 0.152)
  - `small` = `clamp01((smallShare - 0.3) / 0.5)`
  - `audit` = `1` if a blocked read or target-file reference occurred, else `0`
  - `cheat.risk` = `0.4 * progression + 0.3 * copy + 0.15 * small + 0.15 * audit`
  - `cheat.progressionRisk` = `0.5 * progression + 0.25 * small + 0.25 * audit`
