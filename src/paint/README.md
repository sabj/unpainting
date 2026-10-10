# src/paint

The painter's decisions: what to paint, in what order, with which brush and mix. The physics it calls lives in [src/media](../media/).

- [methods/](methods/): generic watercolor methods that work the same on any subject.
- [techniques/](techniques/): fixes for one kind of problem, such as faces, dark fur, skies or buildings.
- [tuned/](tuned/): values fitted to specific benchmark images.
- [styles/](styles/): four watercolor style profiles and the loader that maps a subject to one.
- `recipe.mjs`: the `--recipe` presets of painter settings. `default` applies when no recipe is named, except for runs using named-area plans. Another named recipe replaces it. `none` and unknown recipe names add no recipe flags; drawing flags from a value plan still apply.
- `run-cache.mjs`: a disk cache for slow steps whose results depend only on their inputs.
- `film-timeline.mjs`: `--timeline`, which re-times a run's frames to follow a target sequence.
- `output-directory.mjs`: refuses to erase a previous run's output folder.

`tools/paint-plate.mjs` is the entry point. Run the tests with:

```sh
node --test src/paint/*.test.mjs src/paint/*/*.test.mjs src/paint/*/*/*.test.mjs
```

[Methods, techniques and tuned settings](../../docs/techniques.md) lists every module and recipe flag. [How it paints](../../docs/how-it-paints.md) explains the stages.
