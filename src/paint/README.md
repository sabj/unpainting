# src/paint

The painter's decisions: what to paint, in what order, with which brush and mix. The physics it calls lives in [src/media](../media/).

- [methods/](methods/): generic watercolor methods that work the same on any subject.
- [techniques/](techniques/): fixes for one kind of problem, such as faces, dark fur, skies or buildings.
- [tuned/](tuned/): values fitted to specific benchmark images, run only through presets a plan or `--recipe` names ([tuned settings](../../docs/techniques.md#tuned-settings)).
- [styles/](styles/): four watercolor style profiles and the loader that maps a subject to one.
- `recipe.mjs`: the `--recipe` presets of painter settings. `default`, `general` and `combined` are one general process. `v096` is the V096 recipe with its fitted flags, and `penwash` is pen and wash. Another named recipe replaces the default, and `+<preset>` adds presets. `none` and unknown names add no recipe flags; drawing flags from a value plan still apply.
- `run-cache.mjs`: a disk cache for slow steps whose results depend only on their inputs.
- `film-timeline.mjs`: `--timeline`, which re-times a run's frames to follow a target sequence.
- `output-directory.mjs`: refuses to erase an existing run's output folder.

`tools/paint-plate.mjs` is the entry point. Run the tests with:

```sh
node --test src/paint/*.test.mjs src/paint/*/*.test.mjs src/paint/*/*/*.test.mjs
```

[Methods, techniques and tuned settings](../../docs/techniques.md) lists every module and recipe flag. [How it paints](../../docs/how-it-paints.md) explains the stages.
