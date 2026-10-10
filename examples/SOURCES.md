# Example sources

The example targets are in `targets/` and their saved outputs are in `output/`. The table lists commands for painting them. The paintings in `output/` came from an earlier version of the painter (2026-10-06). They are not the expected output of today's commands, which paint differently. Every target except the architecture photo is public domain.

| use case | target | run | saved output (earlier painter, 2026-10-06) |
|---|---|---|---|
| landscape | `targets/white-ships.jpg` | `node tools/paint-plate.mjs --image examples/targets/white-ships.jpg --width 540 --mode full --out work/white-ships` | `output/white-ships-540-painting.jpg`, `output/white-ships-540.mp4` |
| portrait or figure | `targets/sargent-a-tramp.jpg` | `npm run example:portrait` | `output/sargent-a-tramp-360.jpg` |
| drawing, figures | `targets/tiepolo-punchinello-sweets.jpg` | `npm run example:drawing` | `output/tiepolo-punchinello-sweets-360.jpg` |
| drawing, animals | `targets/tiepolo-punchinello-camel.jpg` | `npm run example:animal` | `output/tiepolo-punchinello-camel-360.jpg` |
| architecture | `targets/trumbull.jpg` | `npm run example:architecture` | `output/trumbull-360.jpg` |
| stroke plan (a JSON list of painting commands) | `plans/graded-wash.json` | `npm run example`, `npm run example:plan` | `output/graded-wash-result.png` |

## Targets

| file | work | licence | source |
|---|---|---|---|
| `targets/white-ships.jpg` | John Singer Sargent, White Ships, 1908, watercolour, Brooklyn Museum (09.846). 768 x 548. | Public domain | Wikimedia Commons, [Brooklyn Museum - White Ships - John Singer Sargent.jpg](https://commons.wikimedia.org/wiki/File:Brooklyn_Museum_-_White_Ships_-_John_Singer_Sargent.jpg), from the museum's [open collection](https://www.brooklynmuseum.org/opencollection/objects/20397) |
| `targets/sargent-a-tramp.jpg` | John Singer Sargent, A Tramp, ca. 1904-1906, watercolour, Brooklyn Museum (09.810). Downscaled to 960 px wide. | Public domain | Wikimedia Commons, [Sargent - A Tramp, ca. 1904-1906, 09.810.jpg](https://commons.wikimedia.org/wiki/File:Sargent_-_A_Tramp,_ca._1904-1906,_09.810.jpg) |
| `targets/tiepolo-punchinello-sweets.jpg` | Giovanni Domenico Tiepolo, Punchinello's Children Begging for Sweets, No. 17 from Divertimento per li regazzi, circa 1800, pen and brown ink with brown wash over black chalk, Fine Arts Museums of San Francisco. Downscaled to 960 px wide. | Public domain (artist died 1804) | Wikimedia Commons, [Punchinello's Children Begging for Sweets, No. 17.jpg](https://commons.wikimedia.org/wiki/File:Punchinello%E2%80%99s_Children_Begging_for_Sweets_by_Giovanni_Domenico_Tiepolo,_No._17.jpg) |
| `targets/tiepolo-punchinello-camel.jpg` | Domenico Tiepolo, Punchinello Riding a Camel, late 1790s, pen and brown ink and wash over black chalk, 29.9 x 41 cm, Getty Center. 889 x 640. | Public domain (artist died 1804) | Wikimedia Commons, [Punchinello Riding a Camel by Domenico Tiepolo.jpg](https://commons.wikimedia.org/wiki/File:Punchinello_Riding_a_Camel_by_Domenico_Tiepolo.jpg) |
| `targets/rembrandt-woman-reading.jpg` | Rembrandt van Rijn, Woman Reading, pen and brown ink with wash, The Metropolitan Museum of Art (347891). Downscaled to 1600 px wide. Used by `tools/readme/ink-figure.mjs` for [docs/ink.md](../docs/ink.md). | Public domain (Open Access) | The Met, [347891](https://www.metmuseum.org/art/collection/search/347891) |
| `targets/trumbull.jpg` | Trumbull College, Yale University. Photo posted by @trumbullcollegeyale on Instagram (24 August 2020), credited there to Google; photographer unknown. 540 x 370. | Third-party photo, used with credit for noncommercial research; to be replaced. See [NOTICE](../NOTICE) section 1a. |

Credit lines:

- John Singer Sargent, White Ships, 1908, Brooklyn Museum (09.846), public domain, via Wikimedia Commons.
- John Singer Sargent, A Tramp, ca. 1904-1906, Brooklyn Museum (09.810), public domain, via Wikimedia Commons.
- Giovanni Domenico Tiepolo, Punchinello's Children Begging for Sweets, No. 17 from Divertimento per li regazzi, circa 1800, Fine Arts Museums of San Francisco, public domain, via Wikimedia Commons.
- Domenico Tiepolo, Punchinello Riding a Camel, late 1790s, Getty Center, public domain, via Wikimedia Commons.
- Rembrandt van Rijn, Woman Reading, The Metropolitan Museum of Art (347891), public domain (Open Access).
- Trumbull College photo: posted by @trumbullcollegeyale on 24 August 2020, credited there to Google; photographer unknown. Third-party photo, used with credit for noncommercial research. See NOTICE section 1a.

Benchmark targets: `bench/v2/targets/hills.png` and `bench/v2/targets/south-france.png` are crops of original photographs, photo by Sam Jackson. They are covered by section 1 of [NOTICE](../NOTICE).

## Outputs

The painter's outputs from the public-domain targets, and from the synthetic stroke plan, are © 2026 Sam Jackson under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit as "Painted by unpainting (Sam Jackson), CC BY 4.0". The output from the Trumbull photo is all rights reserved, like the photo. See [NOTICE](../NOTICE).

The stroke plan `plans/graded-wash.json` is based on the graded-wash demonstration cited in its `source` field. It contains no material from the cited video.
