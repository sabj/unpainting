# Ink-heavy set

Eight targets for judging pen ink: seven pen-and-wash drawings and ink-led sketches, and the Fragonard, a brush-only control with no pen line.

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

## Full-size A/B

Run on 0.2.x and 0.3.x; tag v0.3.2 replays it. On 0.4 each painting also needs a drawing file and a block-in study ([running](../../docs/running.md#your-own-image)), so it does not run on the trunk.

Each target was painted at up to 1200 px wide (the camel at its own 880), three seeds each, with `node tools/paint-plate.mjs --image IMG --width W --seed S --out DIR` under four configurations: `d020` (painter at tag `v0.2.0`), `pencil` (`--inkrecipe none`), `auto` (`--inkrecipe auto`) and `wash` (`--inkrecipe wash`). Each painting was scored three times with J1 (`python3 bench/scorer/score_painting.py --target IMG --image DIR/painting.jpg --style "pen and ink with wash" --judge J1 --out OUT`); one painting's J1 moves by up to 0.33 with nothing changed. Compare the mean of nine scores per target and configuration.
