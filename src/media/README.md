# src/media

The physical media: paper, water, pigment, brush, pen and pencil. Everything the painter lays down goes through these modules. They run on the CPU, and `gpu/` holds the WebGPU backend for the same sheet.

- `paper.mjs`: the paper surface, built from fibers, tooth (surface texture) and raised bumps of cold-press paper. `paper-scan.mjs` builds one from a scanned height map.
- `sheet.mjs`: water and pigment on and in the paper, advanced in simulation time steps, and `dry` to set a wash as a layer.
- `km.mjs`: Kubelka-Munk optics, a model of pigment absorption and scattering, that stack the dried layers into a color.
- `brush.mjs`: a bristle brush with a load of water and pigment.
- `wash.mjs`: wash paths around reserved highlights, graded sweeps and softened edges.
- `pen.mjs`, `pencil.mjs` and `draw.mjs`: the dip pen, the graphite pencil, and planned gestures drawn with the pen.
- `gouache.mjs`: optional white gouache laid last, outside the physics simulation.
- `sheet-size.mjs`: the default 6 x 4 in postcard sheet.
- `sheet-par.mjs`, `sheet-worker.mjs` and the `*-kernel.mjs` files: a thread pool that runs large sheet steps in row bands.

Run the media tests with `node --test "src/media/*.test.mjs"`.

[How it paints](../../docs/how-it-paints.md) explains the model, and [Pigments and paper](../../docs/pigments-and-paper.md) and [Ink](../../docs/ink.md) give the details.
