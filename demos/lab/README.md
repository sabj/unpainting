# Paint Lab

Paint by hand on simulated paper: [open it](https://sabj.github.io/unpainting/demos/lab/). Locally: `python3 -m http.server 8000 --directory demos`.

<img src="../thumbs/lab-paint.webp" width="480" alt="A saved wash stage of the new Prout section-brush painting">

The sheet's cell size follows the paper's size on screen: about one cell to a device pixel, down to 0.125 mm a cell with WebGPU and 0.42 mm on the CPU. The Cell size menu picks another. The default Section brush and flow solver run on WebGPU; Row and Tuft retain CPU contact. `?physics=cpu` or `?nowebgpu=1` steps the painter's own sheet instead.

Mask paints masking fluid; mask before the washes it protects, and Remove mask lifts it. Lift removes mobile colour with a damp tool (staining remains), Blot takes surface water and suspended pigment, Water rewets, Dryer dries locally. Re-dip gives the brush or pen a fresh load.

- `lab.js`, `worker.js`, `ui/`, `worker/`: the page and the simulation worker.
- `media/`: the painter's own `src/media/`, copied by `node tools/lab/sync-site-media.mjs`. Edit the source and run it again; `npm test` fails while the copy is stale.
- `gpu/`: the WebGPU sheet, Section contact, and colour rendering.
- `strokes/`: the painter's bench strokes on the CPU and WebGPU sheets side by side.
- `targets/`: recorded paintings, replayed in the simulator by `worker/live-tape.js` and built by `node tools/lab/build-live-examples.mjs <id> <run dir> <target image>`.

`tools/lab/build-site.mjs` copies this folder into the static site.
