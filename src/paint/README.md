# src/paint

The painter's decisions: what to paint, in what order, with which brush and mix. The physics it calls lives in [src/media](../media/).

- [methods/](methods/): generic watercolor methods that work the same on any subject.
- [techniques/](techniques/): fixes for one kind of problem, such as faces, dark fur, skies or buildings.
- [tuned/](tuned/): values fitted to specific benchmark images, run only through presets a plan or `--recipe` names ([overfitting](../../docs/overfitting.md)).
- [styles/](styles/): four watercolor style profiles and the loader that maps a subject to one.
- `recipe.mjs`: the `--recipe` presets of painter settings. `default` retains V096 compatibility settings after the release comparison, except for runs using named-area plans. `general` selects the opt-in general methods and clean-colour washes; `v096` preserves historical recipe flags. Another named recipe replaces it, and `+<preset>` adds presets. `none` and unknown recipe names add no recipe flags; drawing flags from a value plan still apply.
- `run-cache.mjs`: a disk cache for slow steps whose results depend only on their inputs.
- `film-timeline.mjs`: `--timeline`, which re-times a run's frames to follow a target sequence.
- `output-directory.mjs`: refuses to erase a previous run's output folder.

`tools/paint-plate.mjs` is the entry point. Run the tests with:

```sh
node --test src/paint/*.test.mjs src/paint/*/*.test.mjs src/paint/*/*/*.test.mjs
```

[Methods, techniques and tuned settings](../../docs/techniques.md) lists every module and recipe flag. [How it paints](../../docs/how-it-paints.md) explains the stages.
