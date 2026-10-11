#!/usr/bin/env python3
"""Run committed archives sequentially on one sweep box and prune frame payloads.

Config: {root, nodeModules, inputs, width, runs:[{name, archive, commit, args:[]}]}.
Inputs is a sweep job's in/ directory, containing target, plan.json and segments/.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

cfg = json.loads(Path(sys.argv[1]).read_text())
root = Path(cfg['root'])
root.mkdir(parents=True, exist_ok=True)
rows = []
for run in cfg['runs']:
    work, out = root / run['name'] / 'code', root / run['name'] / 'paint'
    if work.exists() or out.exists():
        raise SystemExit(f'refusing to overwrite {work.parent}')
    work.mkdir(parents=True)
    out.mkdir()
    subprocess.run(['tar', '-xzf', run['archive'], '-C', str(work)], check=True)
    (work / 'node_modules').symlink_to(cfg['nodeModules'], target_is_directory=True)
    inputs = Path(cfg['inputs'])
    if (inputs / 'segments').exists():
        shutil.copytree(inputs / 'segments', work / 'work/segments')
    args = ['node', 'tools/paint-plate.mjs', '--image', str(inputs / cfg['image']),
            '--width', str(cfg['width']), '--mode', 'full', '--video', '0',
            '--valueplan', str(inputs / 'plan.json'), '--gpu', 'on',
            *run.get('args', []), '--out', str(out), '--targetguard', 'strict']
    started = time.perf_counter()
    with (out.parent / 'paint.log').open('w') as log:
        result = subprocess.run(args, cwd=work, stdout=log, stderr=subprocess.STDOUT,
                                env=dict(os.environ, DAWN_FLAGS='backend=vulkan', PAINTER_TARGET_GUARD='strict'))
    seconds = time.perf_counter() - started
    frames = list(out.glob('f[0-9]*.jpg'))
    painting = out / 'painting.png'
    row = dict(name=run['name'], commit=run['commit'], args=args, seconds=seconds,
               exit=result.returncode, frames=len(frames), frameBytes=sum(p.stat().st_size for p in frames),
               sha256=hashlib.sha256(painting.read_bytes()).hexdigest() if painting.exists() else None)
    rows.append(row)
    (root / 'timings.json').write_text(json.dumps(rows, indent=2))
    print(json.dumps(row), flush=True)
    for p in frames + list(out.glob('value-band-*.png')) + list(out.glob('*.jsonl')):
        p.unlink()
    shutil.rmtree(work)
    if result.returncode:
        raise SystemExit(result.returncode)
