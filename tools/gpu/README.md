# tools/gpu

The batch painter and checks for the paper simulation on the GPU in `src/media/gpu/`. The checks compare stored water and pigment values with the CPU simulation. None of the checks is needed to paint.

- `paint-batch.mjs`: paints many sheets in one process. Each sheet's `paint-plate.mjs` runs in its own thread, and one GPU thread (`src/media/gpu/batch-server.mjs`) advances all of them together. The header describes the config file.
- `step-check.mjs`: one simulation step on the CPU and on the GPU from the same wet state, comparing each stored simulation value.
- `stroke-one.mjs` and `stroke-diff.mjs`: one stroke, or a small test painting, on both backends, comparing each stored simulation value.
- `frame-diff.mjs` and `thk-diff.mjs`: compare the frames or the pigment thickness of two finished runs. They refuse runs whose backend.json name different sheet backends; pass `--mixedbackends` for a deliberate CPU/GPU parity check.

Each script header gives usage. Start with:

```sh
node tools/gpu/step-check.mjs
```

The scripts need a WebGPU adapter through the `webgpu` package. [docs/CLOUD.md](../../docs/CLOUD.md#cpu-or-gpu) says when strokes run on the GPU.
