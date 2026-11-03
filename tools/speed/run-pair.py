#!/usr/bin/env python3
"""Run committed archives one after another on one machine and prune frame payloads.

Config: {root, nodeModules, inputs, image, width, runs:[{name, archive, commit, args:[]}]}.
Inputs is a folder holding the target, plan.json and optional segments/.
"""
import hashlib
import json
import os
import resource
from pathlib import Path
import shutil
import subprocess
import sys
import time
import re
import platform

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
    inputs = Path(cfg.get('inputs', '.'))
    if (inputs / 'segments').exists():
        shutil.copytree(inputs / 'segments', work / 'work/segments')
    if 'painterArgs' in run:
        args = ['node', 'tools/paint-plate.mjs', *run['painterArgs'], '--out', str(out)]
    else:
        args = ['node', 'tools/paint-plate.mjs', '--image', str(inputs / cfg['image']),
                '--width', str(cfg['width']), '--mode', 'full', '--video', '0',
                '--valueplan', str(inputs / 'plan.json'), '--gpu', 'on',
                *run.get('args', []), '--out', str(out), '--targetguard', 'strict']
    rss_file = out.parent / 'resource.txt'
    measured = ['/usr/bin/time', '-l', '-o', str(rss_file), *args] if sys.platform == 'darwin' else ['/usr/bin/time', '-v', '-o', str(rss_file), *args]
    cpu_start = resource.getrusage(resource.RUSAGE_CHILDREN)
    started = time.perf_counter()
    with (out.parent / 'paint.log').open('w') as log:
        result = subprocess.run(measured, cwd=work, stdout=log, stderr=subprocess.STDOUT,
                                env={**os.environ, **run.get('env', {})})
    seconds = time.perf_counter() - started
    cpu_end = resource.getrusage(resource.RUSAGE_CHILDREN)
    frames = list(out.glob('f[0-9]*.jpg'))
    painting = out / 'painting.png'
    resource_text = rss_file.read_text()
    match = re.search(r'(\d+)\s+maximum resident set size', resource_text) if sys.platform == 'darwin' else re.search(r'Maximum resident set size \(kbytes\): (\d+)', resource_text)
    peak_rss = int(match.group(1)) * (1 if sys.platform == 'darwin' else 1024) if match else None
    row = dict(machine=platform.platform(), peakRSSBytes=peak_rss, archiveSHA256=hashlib.sha256(Path(run['archive']).read_bytes()).hexdigest(), name=run['name'], commit=run['commit'], args=args, seconds=seconds,
               exit=result.returncode, userSeconds=cpu_end.ru_utime - cpu_start.ru_utime,
               systemSeconds=cpu_end.ru_stime - cpu_start.ru_stime, frames=len(frames), frameBytes=sum(p.stat().st_size for p in frames),
               sha256=hashlib.sha256(painting.read_bytes()).hexdigest() if painting.exists() else None)
    rows.append(row)
    (root / 'timings.json').write_text(json.dumps(rows, indent=2))
    print(json.dumps(row), flush=True)
    for p in frames + list(out.glob('value-band-*.png')) + list(out.glob('*.jsonl')):
        p.unlink()
    if not cfg.get('keepCode', False): shutil.rmtree(work)
    if result.returncode not in run.get('allowedExits', [0]):
        raise SystemExit(result.returncode)
