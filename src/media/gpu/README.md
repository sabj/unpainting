# src/media/gpu

The WebGPU backend for the sheet in `src/media/sheet.mjs`. It keeps the sheet on the GPU between calls and runs the step, drying and brush strokes as compute shaders, programs that run on the GPU. It uses the `webgpu` package (Dawn) in Node.

- `link.mjs`: the painter's side. `attachGpu` starts the worker and sets `sheet._gpu`. With no adapter or `--gpu off`, sheet, brush and pen stay on the CPU.
- `worker.mjs`: the GPU half, in a worker thread. The main thread runs the brush and waits only for the results it needs.
- `stepfull.mjs` and `stepfull.wgsl`: a whole sheet step and `dry` on the GPU. `permeability.mjs` holds the paper permeability they share.
- `stroke-check.mjs`: `--gpustrokes check` compares eligible ordinary GPU strokes on both backends. CPU fallback strokes and wash splats (soft round deposits of water and pigment) bypass it. The check omits within-stroke flow, so it can change the resulting painting.
- `framer.mjs` and `frame-worker.mjs`: animation frames rendered off the painter's thread.
- `sheet-batch.mjs` and `batch-server.mjs`: many sheets of one size advanced together on one device, for `tools/gpu/paint-batch.mjs`.
- `web-brush.mjs`: the brush for the browser build.

`node tools/paint-plate.mjs` uses the GPU by default when an adapter is present (`--gpu auto|on|off`) and prints `sheet backend: gpu` or `cpu`. CPU and GPU runs are each repeatable, but they differ from each other.

Check the GPU backend against the CPU sheet with `node --test src/media/gpu-backend.test.mjs`. The benchmarks and checks are in [tools/gpu/](../../../tools/gpu/). [Cloud rendering](../../../docs/CLOUD.md) covers GPU machines.
