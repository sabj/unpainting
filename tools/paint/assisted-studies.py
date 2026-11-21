#!/usr/bin/env python3
"""Run an author's named whole-sheet Qwen study requests locally, in order.

The author supplies request.json, its pinned reference and a text prompt for each
study. Returned studies are evidence for the author's next decision. Selection,
drawing and painting are handled separately by assisted-paint.py.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pinned(path, expected, role):
    path = path.resolve(strict=True)
    if digest(path) != expected:
        raise ValueError(f'{role} changed: {path}')
    return path


def run(request_path, python, launcher):
    request_path = request_path.resolve(strict=True)
    directory = request_path.parent
    req = json.loads(request_path.read_bytes())
    request_hash = digest(request_path)
    if req['mode'] != 'tool-assisted' or req['round'] != 'A':
        raise ValueError('expected an authored round-A request')
    if not req.get('author') or not req['jobs']:
        raise ValueError('the request needs an author and at least one study')
    source = pinned(directory / req['source']['path'], req['source']['sha256'], 'source')
    tool = pinned(directory / req['tool'], req['toolSHA256'], 'Qwen driver')
    if req['model'] != 'mlx-community/qwen-image-edit-2511-8bit' or (req['steps'], req['guidance']) != (8, 1):
        raise ValueError('the local driver uses Qwen Image Edit 2511, 8-bit, 8 steps, guidance 1')
    cache = Path.home()/'.cache/huggingface/hub'
    if (cache/'models--mlx-community--qwen-image-edit-2511-8bit/refs/main').read_text().strip() != req['modelRevision']:
        raise ValueError('installed Qwen revision differs from the request')
    lora = cache/'models--lightx2v--Qwen-Image-Edit-2511-Lightning/snapshots'/req['loraRevision']/'Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors'
    if not lora.is_file() or req['loraRevision'] not in tool.read_text():
        raise ValueError('driver and installed Lightning revision differ')
    jobs = []
    for job in req['jobs']:
        prompt = pinned(directory / job['prompt'], job['promptSHA256'], job['role'])
        output = (directory / job['output']).resolve()
        if output in [j[2] for j in jobs] or output.exists():
            raise ValueError(f'expected a fresh output for {job["role"]}: {output}')
        if not isinstance(job['seed'], int):
            raise ValueError(f'{job["role"]} needs an integer seed')
        output.parent.mkdir(parents=True, exist_ok=True)
        jobs.append((job, prompt, output))
    log = directory/'qwen-local.log'
    receipt = directory/'qwen-result.json'
    if receipt.exists():
        raise ValueError(f'the request already has a return receipt: {receipt}')
    # The project's existing wrapper watches the local MLX memory lock and loads
    # the model once. Exclusive log creation also excludes two simultaneous runs.
    with log.open('x') as stream, tempfile.TemporaryDirectory(dir=directory) as scratch:
        queue = Path(scratch)/'queue.txt'
        lines = []
        for job, prompt, output in jobs:
            fields = [str(source), str(output), '@'+str(prompt), '1', str(job['seed'])]
            if any(any(c in entry for c in '|#\r\n') for entry in fields):
                raise ValueError('the local queue format cannot represent this path')
            lines.append('|'.join(fields))
        queue.write_text('\n'.join(lines)+'\n')
        before = time.time()
        subprocess.run([str(launcher.resolve(strict=True)), str(python.absolute()), '-u', str(tool),
                        '--queue='+str(queue), '--idle=0'], stdout=stream, stderr=subprocess.STDOUT,
                       env=dict(os.environ, HF_HUB_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1'), check=True)
        if Path(str(queue)+'.failed').exists():
            raise RuntimeError(f'Qwen failed to return all studies; see {log}')
    pinned(request_path, request_hash, 'author request')
    pinned(source, req['source']['sha256'], 'source')
    pinned(tool, req['toolSHA256'], 'Qwen driver')
    result = []
    for job, prompt, output in jobs:
        pinned(prompt, job['promptSHA256'], job['role'])
        if not output.is_file():
            raise RuntimeError(f'Qwen did not return {job["role"]}; see {log}')
        result.append({**job, 'sha256': digest(output)})
    receipt.write_text(json.dumps({'returncode': 0, 'requestSHA256': request_hash, 'jobs': result,
                                   'startedUnix': before, 'finishedUnix': time.time()}, indent=2)+'\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('request', type=Path)
    parser.add_argument('--python', type=Path, default=Path.home()/'.local/share/uv/tools/mflux/bin/python')
    parser.add_argument('--launcher', type=Path, default=Path.home()/'Scratch/unpainting-033/bin/one-model')
    args = parser.parse_args()
    run(args.request, args.python, args.launcher)
