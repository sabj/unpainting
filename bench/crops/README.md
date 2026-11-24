# Targets of rounds V1 to V5

Five whole images, kept as a record. The 0.4 benchmark paints fifteen other pictures ([PICTURES.md](../PICTURES.md)). The folder name `crops` is historical.

| Subject | Cells | Size at 0.259 mm a cell | Reference |
|---|---:|---:|---|
| Hills | 306 × 242 | 79.3 × 62.7 mm | Photograph by Sam Jackson, see [NOTICE](../../NOTICE) |
| France | 304 × 249 | 78.7 × 64.5 mm | Photograph by Sam Jackson, see [NOTICE](../../NOTICE) |
| Ships | 300 × 244 | 77.7 × 63.2 mm | Public-domain Sargent painting |
| Mittens | 300 × 259 | 77.7 × 67.1 mm | Photograph by Sam Jackson, see [NOTICE](../../NOTICE) |
| Trumbull | 300 × 263 | 77.7 × 68.1 mm | Photograph, see [NOTICE](../../NOTICE) |

Sizes and styles are in [crops.json](../v2/crops.json). Thumbnails: [Hills](img/hills.webp), [France](img/south-france.webp), [Ships](img/sargent.webp), [Mittens](img/mittens.webp), [Trumbull](img/trumbull.webp).

## Adding a target

```sh
npm run bench:add-target -- path/to/photo.jpg --task harbour --name Harbour \
  --style "loose watercolor: boats at a harbour wall" --medium none \
  --source "photo by ..." --licence "<licence of the image>" \
  --crop 400,220,1600,1300 --self-score
```

`--name`, `--style`, `--medium`, `--source` and `--licence` are required; state the image's own licence. `--medium` is the drawing medium seen in the target: `pen`, `pencil` (faint graphite under the paint) or `none`. `--crop` is x, y, width, height in source pixels; the image is resized to 300 cells wide. It writes:

- `bench/v2/targets/<task>.png` and `<task>-coarse.json` (what `kit.coarse()` returns: at most 24 columns, an 8-colour palette, a lightness per cell).
- An entry in [crops.json](../v2/crops.json), which every round reads.
- A subject in [subjects.json](../v4v5/subjects.json), painted at the target's own width, one cell per pixel. `--paint-width` and `--sheetmm` state another size; a `--paint-width` above the target's width is refused, and so is a `--crop` narrower than it.

`--self-score` scores the target against itself (needs `TOGETHER_API_KEY`); that is the 100% mark for indexed scores. `--private <dir>` keeps the image out of the repository; scoring then needs `BENCH_PRIVATE_CROPS=<dir>`.

Then credit the image in [NOTICE](../../NOTICE) and add a row above. `--crops a,b` narrows a run. This adds to the earlier rounds' suite, not to the 0.4 set.
