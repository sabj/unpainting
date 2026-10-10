# src/paint/tuned

Settings fitted to specific benchmark images. They can worsen results on other subjects.

- `default-flags.mjs`: the tuned flags the default recipe (a preset of painter settings) sets on every subject, fitted mostly on Trumbull (subject id Y1).
- `trumbull.mjs`: rules for Trumbull (`Y1`) and a second Trumbull-derived subject (`subject-e`). `stone-demand.mjs` fits stone and leaf mixes for Y1.
- `portrait.mjs` and `drawing-caps.mjs`: constants for the private portrait (`subject-c`) and ink-and-wash dog (`subject-a`) subjects.
- `dog-coats.mjs`, `olive-families.mjs` and `architecture-clouds.mjs`: presets for single techniques and passages (washes or groups of marks with one job).
- `style-cuts.mjs`: thresholds for the practice planner's ink and dry brush weights.
- `subjects.json`: the style each benchmark subject maps to.

To paint without the default recipe and its tuned flags:

```sh
node tools/paint-plate.mjs --image path/to/painting.jpg --recipe none --out work/bare
```

[techniques.md](../../../docs/techniques.md) lists every tuned item, what it was fitted on, its overfit risk and the flag that turns it off.
