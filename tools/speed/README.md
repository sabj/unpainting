# Render performance experiments

`--speedprofile 1` records main-thread image encoding/writing, planning/setup and drawing spans in `speed-profile.json`, frame-worker work in `speed-frame-profile.json`, and sampled GPU kernels, dispatch counts and readback waits in `backend.json`. GPU timestamps do not serialize strokes. Sampled times are estimates, can be quantized by the adapter, and are nested inside operation wall times. Do not add those columns together.

Still jobs (`--video 0`) keep passage checkpoints at 10/25/50/75/100 percent, first wash, paper, drawing and material stages. `--keepallframes 1` restores the previous frame cadence. Video output retains that cadence automatically. Progress means completed passages in the current plan; the finished frame remains the final state when touch-up passes extend the plan. Snapshots used by feedback are independent and are retained.

Experimental switches, each independently reversible:

- `--speededge 1`: alternate shared edge-distance buffers, with the same arithmetic and neighbor order.
- `--speedscan 1`: fuse cell finalization and active wet-tile scanning on GPUs with at least 13 storage-buffer bindings. Smaller adapters keep separate kernels.
- `--speedtransfers 1`: use the existing tracked CPU fallback transfer path without selecting Fast physics.
- `--speedquietdt 1`: Tier 2 experiment. Double the drying timestep after the measured surface film disappears. Pore pigment transport changes, so compare native paintings and keep it disabled unless the change passes visual review.

`node tools/speed/compare.mjs BASE.png CANDIDATE.png OUT` writes exact PNG hashes, maximum and mean channel differences, native side-by-side images, absolute differences and differences amplified ten times. `OUT/index.html` displays the paintings at one image pixel per CSS pixel without downscaling.

`python3 tools/speed/run-pair.py CONFIG.json` runs trusted committed archives sequentially on the same sweep box, records wall times and PNG hashes, and removes frame payloads and code copies after each run. The config names a new output root, the box's `node_modules`, a prepared sweep job's `in` directory, its image filename, width, and runs with `name`, `archive`, `commit` and optional `args`. Include `tools`, `src`, `data`, `examples` and `package.json` in each archive. Run under the sweep lease's cost and lifetime limits. Do not compare timings from different boxes as a controlled speedup.

`tools/cloud/setup-lines.sh` installs NumPy/OpenCV in `/opt/painter-lines`. Select it with `--sketchpython /opt/painter-lines/bin/python`. Installing them on the default Python path changes automatic line extraction and is not a pixel-preserving optimization. The two `sweep-*.patch` files apply the corresponding setup and idle-slot fixes to the separate governed sweep renderer on the mini.
