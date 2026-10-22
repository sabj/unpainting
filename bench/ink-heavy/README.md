# Ink-heavy set

Eight targets for judging pen ink. Seven are pen-and-wash drawings and ink-led sketches. One, the Fragonard, is a brush-only control with no pen line. The five general benchmark targets are mostly not ink works, so ink changes are judged here too.

## Targets

| Name | File | Work | Licence and source |
|---|---|---|---|
| guardi | `targets/guardi-colonnade.jpg` | Francesco Guardi, A Colonnade, Partly Ruined, with Figures, ca. 1780-90, pen and brown ink, brown and gray wash. The Met, 1975.1.337. Downscaled to 1600 px wide. | Public domain (Open Access), [Met 459623](https://www.metmuseum.org/art/collection/search/459623) |
| tiepolo-bacchus | `targets/tiepolo-bacchus-ariadne.jpg` | Giovanni Battista Tiepolo, Bacchus and Ariadne, ca. 1740, pen and brown ink, brown wash, over black chalk. The Met, 1975.1.443. Downscaled to 1600 px wide. | Public domain (Open Access), [Met 459236](https://www.metmuseum.org/art/collection/search/459236) |
| tiepolo-burial | `targets/tiepolo-burial-punchinello.jpg` | Giovanni Domenico Tiepolo, The Burial of Punchinello, ca. 1800, pen and brown ink, brown and yellow wash, over black chalk. The Met, 1975.1.473. Downscaled to 1600 px wide. | Public domain (Open Access), [Met 459187](https://www.metmuseum.org/art/collection/search/459187) |
| tiepolo-camel | `../../examples/targets/tiepolo-punchinello-camel.jpg` | Domenico Tiepolo, Punchinello Riding a Camel, late 1790s, Getty Center. 889 x 640. | Public domain, see [examples/SOURCES.md](../../examples/SOURCES.md) |
| rembrandt | `../../examples/targets/rembrandt-woman-reading.jpg` | Rembrandt van Rijn, Woman Reading, pen and brown ink with wash. The Met. 1600 px wide. | Public domain (Open Access), see [examples/SOURCES.md](../../examples/SOURCES.md) |
| h36-a | `../../demos/lab/examples/h36-a/h36-a.png` | Yale gateway, an ink-led sketch target made with an image model from a photograph. 1536 x 1024. | Source photograph by Carol M. Highsmith, Library of Congress, public domain. Target made with an image model. |
| h34-a | `targets/h34-a.jpg` | Yale, an ink-led sketch target made with an image model from a photograph. 1536 x 1024. | Source photograph by Carol M. Highsmith, Library of Congress, public domain. Target made with an image model. |
| fragonard (control) | `targets/fragonard-rinaldo.jpg` | Jean Honoré Fragonard, Rinaldo in the Enchanted Forest, ca. 1763, brush and brown wash over light black chalk. The Met, 2009.236. Downscaled to 1600 px wide. No pen line. | Public domain (Open Access), [Met 386293](https://www.metmuseum.org/art/collection/search/386293) |

Credit lines:

- Francesco Guardi, A Colonnade, Partly Ruined, with Figures, The Metropolitan Museum of Art (1975.1.337), public domain (Open Access).
- Giovanni Battista Tiepolo, Bacchus and Ariadne, The Metropolitan Museum of Art (1975.1.443), public domain (Open Access).
- Giovanni Domenico Tiepolo, The Burial of Punchinello, The Metropolitan Museum of Art (1975.1.473), public domain (Open Access).
- Jean Honoré Fragonard, Rinaldo in the Enchanted Forest, The Metropolitan Museum of Art (2009.236), public domain (Open Access).
- h34-a and h36-a: Carol M. Highsmith / Library of Congress, public domain photographs. Stylised targets made with an image model.

Paintings made from these targets are © 2026 Sam Jackson under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), as in [examples/SOURCES.md](../../examples/SOURCES.md#outputs).

## Measuring ink

`tools/judge/ink-lines-report.mjs` compares the pen lines in a painting with the pen lines in its source, at the painting's size:

```sh
node tools/judge/ink-lines-report.mjs --image <target> --run <painting folder> --out report.json --crops <stem>
```

- Placement recall and precision of the pen layer against the source's line cells (the ink separator, `src/crop/inkwash.mjs`), within 2 pixels.
- Darkness at the source's line cells: how much darker each is than the lightest cell within 3 pixels, in the source, the painting and the pen layer alone.
- Ink hue: blue over red optical density of the line cells. Brown ink is above 1.
- Crops: the two windows with the most source line, target, painting and pen layer side by side.

On a staged run the pen layer is `layer-prepink.jpg` times `layer-finishink.jpg`. Otherwise it is `ink.jpg`.

## Full-size A/B

Paint each target at up to 1200 px wide. The camel stays at its own 880, so it is not upsampled. Use three seeds and these configurations:

- `d020`: the default painter at tag `v0.2.0`.
- `pencil`: `--inkrecipe none`, the pencil drawing, from this branch.
- `auto`: the default painter from this branch. It chooses the pen-and-wash recipe or pencil from the pen line in the target.
- `wash`: `--inkrecipe wash`, to force the recipe.

Run `npm run doctor` first. The wash recipe traces lines with `copy-lines.py`. That needs the line python (`PAINTER_LINES_PYTHON` or `.venv-lines`) with NumPy and OpenCV; without it, the run logs a `!!!` fallback line and traces less.

```sh
set -e
T="guardi:bench/ink-heavy/targets/guardi-colonnade.jpg:1200
tiepolo-bacchus:bench/ink-heavy/targets/tiepolo-bacchus-ariadne.jpg:1200
tiepolo-burial:bench/ink-heavy/targets/tiepolo-burial-punchinello.jpg:1200
tiepolo-camel:examples/targets/tiepolo-punchinello-camel.jpg:880
rembrandt:examples/targets/rembrandt-woman-reading.jpg:1200
h36-a:demos/lab/examples/h36-a/h36-a.png:1200
h34-a:bench/ink-heavy/targets/h34-a.jpg:1200
fragonard:bench/ink-heavy/targets/fragonard-rinaldo.jpg:1200"
paint() { # paint <config> <flags...>
  cfg=$1; shift
  for row in $(echo "$T"); do
    name=${row%%:*}; rest=${row#*:}; img=${rest%%:*}; width=${rest##*:}
    for seed in 0 1 2; do
      node tools/paint-plate.mjs --image "$img" --width "$width" --seed "$seed" "$@" --out "work/ink-heavy/$cfg/$name-s$seed"
    done
  done
}
paint pencil --inkrecipe none
paint auto
paint wash --inkrecipe wash
# in a checkout of v0.2.0, with the same T and paint(), and with the h36-a image given by an absolute path:
#   paint d020
```

Score each painting three times with J1. J1 on one painting moves by up to 0.33 with nothing changed.

```sh
for row in $(echo "$T"); do
  name=${row%%:*}; rest=${row#*:}; img=${rest%%:*}
  for cfg in d020 pencil auto wash; do for seed in 0 1 2; do for rep in 1 2 3; do
    python3 bench/scorer/score_painting.py --target "$img" --image "work/ink-heavy/$cfg/$name-s$seed/painting.jpg" \
      --style "pen and ink with wash" --judge J1 --out "work/ink-heavy/$cfg/$name-s$seed/j1-$rep.json"
  done; done; done
done
```

Compare the mean of the nine scores per target and configuration (3 seeds x 3 repeats). Then read the ink report per painting:

```sh
node tools/judge/ink-lines-report.mjs --image "$img" --run "work/ink-heavy/$cfg/$name-s$seed" --out "work/ink-heavy/$cfg/$name-s$seed/ink-lines-report.json"
```
