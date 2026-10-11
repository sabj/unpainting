#!/usr/bin/env python3
"""On the sweep mini: time a completed job's original output payload from its GPU box.

This is a measured retransfer, not a reconstruction of the daemon's earlier
upload time. It includes SSH setup, archive compression, transfer and disk write.
"""
import json
import re
import shlex
import subprocess
import sys
import tempfile
import time
from pathlib import Path

status = json.loads(Path(sys.argv[1]).read_text())
job, box = status['id'], status['box']
if not re.fullmatch(r'[a-zA-Z0-9_.-]+', job):
    raise SystemExit('invalid job id')
home = Path.home()
address = json.loads((home / 'painter-strategy/ops/boxes' / (box + '.json')).read_text())
out = str(home / 'sweeps/tree/work/jobs' / job / 'out')
command = f'test -f {shlex.quote(out + "/result.json")} && tar -czf - -C {shlex.quote(out)} .'
with tempfile.TemporaryFile() as payload:
    start = time.perf_counter()
    subprocess.run(['ssh', '-i', str(home / '.ssh/painter_strategy_box'), '-o', 'BatchMode=yes',
                    '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
                    '-p', str(address['port']), 'root@' + address['ip'], command],
                   stdout=payload, check=True, timeout=1800)
    elapsed = time.perf_counter() - start
    size = payload.tell()
print(json.dumps(dict(job=job, box=box, seconds=elapsed, compressedBytes=size,
                     scope='completed original output retransfer: SSH, tar gzip, GPU-to-mini transfer and disk write')))
