#!/usr/bin/env python3
"""The progression check (bench/scorer/progression.py) on the local panel for the scored paintings: a strip of the
original and the sheet at 10, 25, 50, 75 and 100% of its strokes; each judge scores each stage 1 to 5. Every painting
for one judge before the next judge is loaded. Side number only."""
import glob, importlib.util, json, os, subprocess, sys, time
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
sp = importlib.util.spec_from_file_location('sa', os.path.join(HERE, 'score-all.py')); sa = importlib.util.module_from_spec(sp); sp.loader.exec_module(sa)
def stages(e):
    f = e['folder']
    a = [f'{f}/plate/stages/stage-{n:03d}.jpg' for n in (10, 25, 50, 75, 100)]
    if all(os.path.exists(x) for x in a): return a
    b = [f'{f}/attempt-3/frames/stage-{n}.png' for n in (10, 25, 50, 75, 100)]
    return b if all(os.path.exists(x) for x in b) else None
def strip(e, out):
    st = stages(e)
    if not st: return None
    H = 420; ims = [Image.open(p).convert('RGB') for p in [e['target']] + st]; ims = [i.resize((round(i.width * H / i.height), H), Image.LANCZOS) for i in ims]
    s = Image.new('RGB', (sum(i.width for i in ims) + 8 * 5, H), 'white'); x = 0
    for i in ims: s.paste(i, (x, 0)); x += i.width + 8
    s.save(out, quality=92); return out
os.makedirs(os.path.join(HERE, 'progression'), exist_ok=True)
E = [e for e in sa.entries() if e['group'] == 'scored']
for m in sa.PANEL.split(','):
    tag = m.replace(':', '_')
    for e in E:
        d = os.path.join(HERE, 'progression', e['name']); os.makedirs(d, exist_ok=True); out = f'{d}/{tag}.json'
        if (sa.load(out) or {}).get('earlyMean') is not None: continue
        sheet = strip(e, f'{d}/sheet.jpg')
        if not sheet: print(e['name'], 'no stage frames'); continue
        r = subprocess.run([sys.executable, 'bench/scorer/progression.py', '--sheet', sheet, '--style', e['style'], '--out', out], cwd=sa.TRUNK, env={**os.environ, 'JUDGE_ROUTE': 'local', 'BENCH_PROG_JUDGES': m}, capture_output=True, text=True)
        x = sa.load(out) or {}; print(time.strftime('%H:%M:%S'), e['name'], m, x.get('stages') or f'FAILED {r.stderr[-200:]}', flush=True)
    subprocess.run(['ollama', 'stop', m], capture_output=True)
subprocess.run([sys.executable, os.path.join(HERE, 'table.py')])
