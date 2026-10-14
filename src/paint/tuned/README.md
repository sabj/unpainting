# src/paint/tuned

Settings fitted to specific benchmark images. They can worsen results on other subjects.

- `presets.mjs`: the presets a value plan (`"presets"`) or `--recipe general+<preset>` opts into. The general recipe uses none; the release default keeps the compatibility recipe.
- `default-flags.mjs`: the tuned flags of the V096 recipe (`--recipe v096`), the default until 2026-10-10, fitted mostly on Trumbull (subject id Y1).
- `trumbull.mjs`: recess, stone wall and ground constants of the `architecture` preset, fitted on Trumbull (`Y1`) and a second Trumbull-derived subject (`subject-e`).
- `portrait.mjs` and `drawing-caps.mjs`: constants for the private portrait (`subject-c`) and ink-and-wash dog (`subject-a`) subjects.
- `dog-coats.mjs`, `olive-families.mjs` and `architecture-clouds.mjs`: presets for single techniques and passages (washes or groups of marks with one job).
- `style-cuts.mjs`: thresholds for the practice planner's ink and dry brush weights.
- `subjects.json`: the style each benchmark subject maps to.

Code outside this folder never checks a subject id; `src/paint/overfit.test.mjs` enforces it. To paint with no recipe at all:

```sh
node tools/paint-plate.mjs --image path/to/painting.jpg --recipe none --out work/bare
```

[overfitting.md](../../../docs/overfitting.md) lists every tuned item, what it was fitted on, how it is switched on and its risk.
