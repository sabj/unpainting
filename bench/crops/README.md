# Benchmark targets

Each target is a crop, a section of a larger image. Sheet cells are the simulation grid squares.

| Subject | Sheet cells | Physical size at 0.259 mm a cell | Reference image |
|---|---:|---:|---|
| Hills | 306 × 242 | 79.3 × 62.7 mm | Original photograph by Sam Jackson, see [NOTICE](../../NOTICE) |
| France | 304 × 249 | 78.7 × 64.5 mm | Original photograph by Sam Jackson, see [NOTICE](../../NOTICE) |
| Ships | 300 × 244 | 77.7 × 63.2 mm | Public-domain Sargent painting |
| Mittens | 300 × 259 | 77.7 × 67.1 mm | Original photograph by Sam Jackson, see [NOTICE](../../NOTICE) |
| Trumbull | 300 × 263 | 77.7 × 68.1 mm | Original photograph, see [NOTICE](../../NOTICE) |

Each target uses the larger sheet's cell density, so each is about 78 mm wide. The image painter's default is a 4 × 6 inch postcard, 152.4 mm wide. The benchmark keeps the smaller targets so results use a consistent physical scale. Sizes and short style descriptions are in [crops.json](../v2/crops.json).

Thumbnails of the targets: [Hills](img/hills.webp), [France](img/south-france.webp), [Ships](img/sargent.webp), [Mittens](img/mittens.webp) and [Trumbull](img/trumbull.webp).

## Adding a target

```sh
npm run bench:add-target -- path/to/photo.jpg --task harbour --name Harbour \
  --style "loose watercolor: boats at a harbour wall" --source "photo by ..." --licence "<licence of the image>" \
  --crop 400,220,1600,1300 --self-score
```

`--name`, `--style`, `--source` and `--licence` are required; there is no default licence, so state the image's own.
The script crops the image (pixels of the source: x, y, width, height), resizes it to 300 cells wide like the
published targets, and writes:

- `bench/v2/targets/<task>.png` and `<task>-coarse.json`, the coarse map the toolkit's `kit.coarse()` returns: at most
  24 columns, an 8-colour palette and a lightness value per cell.
- An entry in [crops.json](../v2/crops.json), which every round reads: the toolkit, the briefs (the V1/V2 target table
  gets a row from `--style`), the prompts, the scorer and the result builders.
- A V4/V5 subject in [subjects.json](../v4v5/subjects.json), painted 1200 px wide on a 280 mm sheet unless
  `--paint-width` and `--sheetmm` say otherwise.

`--self-score` scores the target against itself (needs `TOGETHER_API_KEY`). That score is the 100% mark for indexed
scores; without it the target's paintings are scored but not indexed. `--private <dir>` keeps the image out of the
repository: it is written to `<dir>`, marked not distributed, and scoring then needs `BENCH_PRIVATE_CROPS=<dir>`.

Then credit the image in [NOTICE](../../NOTICE) and add a row to the table above. Runs paint every target by default;
`--crops a,b` narrows a run. V3 stays on its three published targets.
