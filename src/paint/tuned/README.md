# src/paint/tuned

Settings fitted to specific benchmark images. They can worsen results on other subjects.

- `presets.mjs`: the presets a value plan (`"presets"`) or `--recipe general+<preset>` opts into. The default recipe uses none.
- `default-flags.mjs`: the tuned flags of the V096 recipe (`--recipe v096`), fitted mostly on Trumbull (subject id Y1).
- `trumbull.mjs`: recess, stone wall and ground constants of the `architecture` preset, fitted on Trumbull (`Y1`) and a second Trumbull-derived subject (`subject-e`).
- `dog-coats.mjs` and `olive-families.mjs`: presets for single techniques and passages (washes or groups of marks with one job).
- `style-cuts.mjs`: thresholds for the practice planner's ink and dry brush weights.

Code outside this folder never checks a subject id; `src/paint/overfit.test.mjs` enforces it. To paint with no recipe at all:

```sh
node tools/paint-plate.mjs --image path/to/painting.jpg --recipe none --out work/bare
```

[Tuned settings](../../../docs/techniques.md#tuned-settings) lists every tuned item, what it was fitted on, how it is switched on and its risk.
