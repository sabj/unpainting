# Cloud rendering

`tools/cloud/` is an optional helper. It renders a batch of paintings on rented RunPod GPU pods and copies the outputs back. You do not need it to run the painter. It needs a RunPod account with credit and an API key.

## Running a batch

`render-batch.py` takes a source tree and a jobs file. Each line of the jobs file is one shell command. It runs from the tree's root on a pod.

```sh
export RUNPOD_API_KEY=...   # or put it in .env at the repository root
python3 tools/cloud/render-batch.py TREE JOBS --pods 1 --per-pod 4 --hard-limit 40 \
  --input <extra file or folder, relative to TREE> > TREE/work/batch-NAME.log 2>&1
```

| Option | Values | Meaning |
|---|---|---|
| `--pods`, `--per-pod` | integers | pods to rent, and jobs to run at once on each |
| `--hard-limit` | minutes | deletes every pod after this long, whatever state the jobs are in |
| `--input` | path | an extra file or folder to ship with the tree |
| `--gpus` | `GPU id:COMMUNITY\|SECURE,...` | the GPU types to try, in order; the default list is `LADDER` in the script |
| `--image` | image name | the pod image; the default is `RUNPOD_IMAGE`, else `runpod/base:0.6.2-cuda12.4.1` |

Run it detached, for example in `tmux`, because a batch can outlive a terminal session. The tree ships without `work/`, `task/`, `node_modules/`, `.git/`. Pass any inputs a job needs with `--input`. Each pod installs Node, the npm packages and the line tools (`tools/cloud/setup-lines.sh`) before its first job.

Pods are named `painter-rb-*`. The runner deletes each one by its saved pod id when its jobs finish, on an interrupt, and at the hard limit. Outputs land in `TREE/work/`, with logs and `summary.json` in `TREE/work/cloud-batches/`.

## Settings

The Python process reads keys from the environment or a `.env` file. It never puts them on a command line.

| Name | Default | What it is |
|---|---|---|
| `RUNPOD_API_KEY` | none, required | your RunPod API key |
| `UNPAINTING_ENV_FILE` | `.env` at the repository root | a file of `NAME=value` lines to read keys from; a nonempty environment value wins |
| `UNPAINTING_SSH_KEY` | `id_ed25519` in your SSH directory | the SSH private key for the pods; the public key must sit beside it with a `.pub` suffix |
| `RUNPOD_IMAGE` | `runpod/base:0.6.2-cuda12.4.1` | the pod image, overridden by `--image` |

Keep `.env` and key files at mode 600.

## CPU or GPU

With the sheet on the GPU, brush strokes are laid there too. A row brush models bristles in a line across the stroke. Ordinary GPU strokes require this brush, a plan that fits the buffer, and a callback, a function called during a stroke, that the GPU backend supports. Tuft brushes, which model a trailing bundle of bristles, fall back to CPU contact. Row brushes with a measured liquid reservoir can use the GPU with `GPU_RESIDENT=1`, which the CLI enables by default. `--gpustrokes 0` keeps ordinary brush contact on the CPU, but enabled wash splats (soft round deposits of water and pigment) still dispatch to an attached, active GPU sheet. `--gpu off` keeps the sheet and all strokes on the CPU. Every sheet option runs on both backends, including `--holerim`, `--holefill` and the `--physics` constants `marangoni` and `slope`. Measure on your own machine before choosing; small sheets may run faster as several CPU jobs at once.

WebGPU on RunPod's `runpod/base` CUDA images needs `libegl1 libgl1 libvulkan1` installed. Without them Dawn, the WebGPU implementation, falls back to llvmpipe, a CPU renderer. With them, `paint-plate` prints `sheet backend: gpu`.
