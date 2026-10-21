# Spore Studies

Mushroom plates drawn in ink and painted in watercolour, live in the browser. Over 100 kinds, each with its own form, colour and habitat.

**[Open it](https://sabj.github.io/unpainting/demos/fungi/)**

| | | |
| --- | --- | --- |
| [<img src="plates/amanita.webp" width="260" alt="Fly agaric">](https://sabj.github.io/unpainting/demos/fungi/?type=amanita-1) | [<img src="plates/morel.webp" width="260" alt="Morel">](https://sabj.github.io/unpainting/demos/fungi/?type=morel-1) | [<img src="plates/chanterelle.webp" width="260" alt="Chanterelle">](https://sabj.github.io/unpainting/demos/fungi/?type=chanterelle-1) |
| [<img src="plates/oyster.webp" width="260" alt="Oyster mushroom">](https://sabj.github.io/unpainting/demos/fungi/?type=oyster-1) | [<img src="plates/honey-fungus.webp" width="260" alt="Honey fungus">](https://sabj.github.io/unpainting/demos/fungi/?type=agaric-4) | [<img src="plates/bolete.webp" width="260" alt="Bolete">](https://sabj.github.io/unpainting/demos/fungi/?type=bolete-1) |
| [<img src="plates/inkcap.webp" width="260" alt="Shaggy inkcap">](https://sabj.github.io/unpainting/demos/fungi/?type=inkcap-1) | [<img src="plates/chicken-of-the-woods.webp" width="260" alt="Chicken of the woods">](https://sabj.github.io/unpainting/demos/fungi/?type=bracket-6) | [<img src="plates/coral.webp" width="260" alt="Coral fungus">](https://sabj.github.io/unpainting/demos/fungi/?type=coral-1) |
| [<img src="plates/lions-mane.webp" width="260" alt="Lion's mane">](https://sabj.github.io/unpainting/demos/fungi/?type=tooth-1) | [<img src="plates/amanita-woodland.webp" width="260" alt="Fly agaric in woodland">](https://sabj.github.io/unpainting/demos/fungi/?type=amanita-1&background=1&scene=woodland) | [<img src="plates/honey-fungus-log.webp" width="260" alt="Honey fungus on a fallen log">](https://sabj.github.io/unpainting/demos/fungi/?type=agaric-4&background=1&scene=fallen-log) |

## Try

- Random draws a new mushroom. Morph turns one kind into another. Loop keeps going.
- Paint replays the painting. Drag the plate to turn it.
- The palette button opens the plate in [Paint Lab](https://sabj.github.io/unpainting/demos/lab/).

## Code

`mushrooms.mjs` builds each plate from a seed and paints it with the lab's paper, pigments and pens in `../lab/media/`. Tests: `node --test demos/fungi/mushrooms.test.mjs`.
