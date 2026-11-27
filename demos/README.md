# Demos

[Open the demos](https://sabj.github.io/unpainting/demos/). Locally: `python3 -m http.server 8000 --directory demos`.

| Demo | |
| --- | --- |
| [Paint Lab](https://sabj.github.io/unpainting/demos/lab/) | Paint on paper. Replay a painting. |
| [Spore Studies](https://sabj.github.io/unpainting/demos/fungi/) | Turn, morph, and paint a specimen. |
| [Layers](https://sabj.github.io/unpainting/demos/layers/) | Explore painting stages and named forms. |

The Lab examples and Layers dataset use section-brush runs from the 0.5 development checkout. Generation commands and provenance are in [the asset notes](ASSETS.md).

Verify Chrome interactions with `node --test tools/lab/demo-fps.mjs` from the repository root. It records RAF cadence, callback work, long tasks, and artwork deliveries in `work/demo-fps.json`.
