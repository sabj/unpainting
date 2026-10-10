# Cloud rendering

`tools/cloud/` renders a batch of paintings on rented GPU machines, by default on RunPod, and copies the outputs back. You do not need it to run the painter. It needs a paid account with at least one provider.

## Running a batch

`render-batch.py` takes a source tree and a jobs file. Each line of the jobs file is one shell command, run from the tree's root on a rented machine.

```sh
python3 tools/cloud/render-batch.py TREE JOBS --pods 1 --per-pod 4 --hard-limit 40 \
  --input <extra file or folder, relative to TREE> > TREE/work/batch-NAME.log 2>&1
```

| Option | Values | Meaning |
|---|---|---|
| `--provider` | `runpod` (default, falls back to `hetzner`), `hetzner`, `runpod-only` | where the machines come from |
| `--pods`, `--per-pod` | integers | machines to rent, and jobs to run at once on each |
| `--hard-limit` | minutes | deletes every machine after this long, whatever state the jobs are in |
| `--input` | path | an extra file or folder to ship with the tree |

Run it detached, for example in `tmux`, because a batch outlives a terminal session. The tree ships without `work/`, `task/`, `node_modules/`, `.git/` and `data/refs/`, so pass any inputs a job needs with `--input`. `render-batch.py --help` lists the other options.

Batch machines are named `painter-rb-*`. The runner deletes each one by its saved machine id when its jobs finish, on an interrupt, and at the hard limit.

## Credentials

The Python process reads keys from a `.env` file and never puts them on a command line. `tools/cloud/api.py` reads `.env` at the repository root by default. Set `UNPAINTING_ENV_FILE` to use another path. A nonempty process environment value takes precedence over the file. Keep the file and any key files at mode 600.

| Name | Provider | What it is |
|---|---|---|
| `RUNPOD_API_KEY` | RunPod | API key |
| `HCLOUD_TOKEN` | Hetzner Cloud | project API token |
Set `UNPAINTING_SSH_KEY` to the SSH private key path. The default is `id_ed25519` in your SSH directory; the matching public key must be beside it with a `.pub` suffix.

## CPU or GPU

With the sheet on the GPU, brush strokes are laid there too. A row brush models bristles in a line across the stroke. Ordinary GPU strokes require this brush, a plan that fits the buffer, and an callback, a function called during a stroke, that the GPU backend supports. Tuft brushes, which model a trailing bundle of bristles, fall back to CPU contact. Row brushes with a measured liquid reservoir can use the GPU with `GPU_RESIDENT=1`, which the CLI enables by default. `--gpustrokes 0` keeps ordinary brush contact on the CPU, but enabled wash splats (soft round deposits of water and pigment) still dispatch to an attached, active GPU sheet. `--gpu off` keeps the sheet and all strokes on the CPU. Measure on your own machine before choosing; small sheets may run faster as several CPU jobs at once.

WebGPU on RunPod's `runpod/base` CUDA images needs `libegl1 libgl1 libvulkan1` installed. Without them Dawn, the WebGPU implementation, falls back to llvmpipe, a CPU renderer. With them, `paint-plate` prints `sheet backend: gpu`.
