# Render performance experiments

`--speedprofile 1` records main-thread image encoding/writing, planning/setup and drawing spans in `speed-profile.json`, frame-worker work in `speed-frame-profile.json`, and sampled GPU kernels, dispatch counts and readback waits in `backend.json`. GPU timestamps do not serialize strokes. Sampled times are estimates, can be quantized by the adapter, and are nested inside operation wall times. Do not add those columns together.

Still jobs (`--video 0`) keep passage checkpoints at 10/25/50/75/100 percent, first wash, paper, drawing and material stages. `--keepallframes 1` keeps every frame, as video output does. Progress means completed passages in the current plan. The finished frame stays the final state when touch-up passes extend the plan. Snapshots used by feedback are kept separately.

The GPU switches default to 1. Pass 0 to turn each one off.

- `--speedrenderthreads 4`: render cached optical composites over independent cell ranges with the original double-precision arithmetic. The default is up to 4 threads at widths of 540 or less, and 1 above 540, where more threads gave no wall-time gain. Set 1 for serial rendering, or 4 to try parallel optics at larger sizes. An existing physics worker pool is reused. Otherwise an optical-only pool starts. Explicit `--gpu off` defaults to serial optics.
- `--speededge 1`: alternate shared edge-distance buffers, with the same arithmetic and neighbor order.
- `--speedscan 1`: fuse cell finalization and active wet-tile scanning on GPUs with at least 13 storage-buffer bindings. Smaller adapters keep separate kernels.
- `--speedtransfers 1`: use the existing tracked CPU fallback transfer path without selecting Fast physics.

These switches are also on by default. Each keeps the painting byte-identical. Pass 0 to turn one off. With the CPU switches on, native Mittens painted in 148.6 s instead of 162.6 s, with the same PNG.

- `--speedcontact 1`: reuse value-contact scratch masks and build the neighbour halo by row.
- `--speedvalueonly 1`: skip the block plan that value planning replaces.
- `--speedcoverage 1`: rasterize sweep coverage as exact row unions and reuse graded overlap counts.
- `--speedflowrect 1`: compute slow flow fields only over their nonzero support rectangle.
- `--speedfilm 1`: remove masking film by plane.
- `--speeduniformpaper 1`: skip water allocation and sorting for uniform measured paper footprints.
- `--speedpaper 1`: read back only the water and saturation planes from the GPU for value-plan paper observations.
- `--speedemptylayers 1`: skip verified empty pigment planes when the GPU link rebuilds the fixed bed.

`--speedvaluecache 1` (setup reuse across jobs) and `--speedopticalgpu 1` (changes output by up to 54/255) stay off.

`node tools/speed/compare.mjs BASE.png CANDIDATE.png OUT` refuses two runs whose `backend.json` (beside each PNG) name different sheet backends, unless `--mixedbackends` is given. It writes exact PNG hashes, maximum and mean channel differences, native side-by-side images, absolute differences and differences amplified ten times. `OUT/index.html` displays the paintings at one image pixel per CSS pixel without downscaling.

`python3 tools/speed/run-pair.py CONFIG.json` paints committed code archives one after another on one machine. It records wall times and PNG hashes, and removes frame payloads and code copies after each run. The config names a new output root, a `node_modules` folder, an input folder with the target, `plan.json` and optional `segments/`, the image filename, the width, and runs with `name`, `archive`, `commit` and optional `args`. Include `tools`, `src`, `data`, `examples` and `package.json` in each archive. Compare timings only from the same machine.

`tools/cloud/setup-lines.sh` installs NumPy, OpenCV and scikit-image in `PAINTER_LINES_VENV`, by default the repository's `.venv-lines`. The painter uses that venv when it exists (`src/paint/methods/line-python.mjs`). Installing it changes automatic line extraction, so it does not keep paintings pixel-identical.
