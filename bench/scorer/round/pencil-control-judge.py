#!/usr/bin/env python3
"""Pencil control: does the whole-sheet judge's preference move with the weight of the drawing alone?
The full judge (qwen3.8-flash-next:125b-mlx, local, one call at a time; whole.py asks each question with the two sheets
in both orders and takes the position habit out), source plus two sheets. A pair is judged once and kept (judge/NAME.json);
a pair whose painting has not landed is skipped and picked up on the next run. The model is unloaded at the end.
   python3 judge.py          judges what is ready, then writes ../PENCIL-CONTROL.md"""
import json, os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); AU = os.path.dirname(HERE); FIX = os.path.dirname(AU); TRUNK = os.path.abspath(os.path.join(FIX, '..', '..', '..'))
PY = os.path.join(TRUNK, '..', '..', '.venv-seg', 'bin', 'python'); MODEL = 'qwen3.8-flash-next:125b-mlx'
def load(f):
    try: return json.load(open(f))
    except Exception: return None
def said(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
SUBJECTS = {'mittens-closeup': 'Mittens close-up', 'white-ships': 'White Ships'}
LIGHT = {'mittens-closeup': ['argon', 'opus'], 'white-ships': ['argon', 'astra']}   # whose handed-over lines the light-drawing Auto was painted with
NAMES = {'opus': 'Opus', 'astra': 'Astra', 'argon': 'Gemini'}
def P(folder): return os.path.join(FIX, folder, 'plate', 'painting.png')
def pairs():
    out = []
    for s in SUBJECTS:
        old = lambda k, d: load(os.path.join(AU, d, s, f'{k}-L2-vs-auto04.json'))
        auto = P(f'paint-auth-66690c4f-auto-{s}--auto'); src = old('opus', 'judge')['source']
        light = {k: P(f'paint-control-66690c4f-auto-{s}--{k}-lines') for k in LIGHT[s]}
        for k in LIGHT[s]: out.append(dict(s=s, kind='auto', key=k, name=f'{s}--auto-{k}lines-vs-auto-standard', a=auto, b=light[k], src=src))
        for k in ('opus', 'astra', 'argon'):
            lines, full = old(k, 'judge')['image'], old(k, 'judge-fulldrawing')['image']
            if not os.path.exists(full): full = full.replace('/plate/painting.png', '-fulldrawing/plate/painting.png')   # set aside under that name after it was judged
            out.append(dict(s=s, kind='own', key=k, name=f'{s}--{k}-lines-vs-{k}-fulldrawing', a=full, b=lines, src=src))
            # against the Auto of the same drawing weight: the Auto painted with its own lines; Astra on Mittens has none, so Opus's
            # (both keep about a tenth of the lines, all paler); Opus on White Ships handed over the standard drawing, so its
            # same-weight Auto is the standard one and that verdict exists already
            lk = k if k in LIGHT[s] else ('opus' if (s, k) == ('mittens-closeup', 'astra') else None)
            if lk: out.append(dict(s=s, kind='same-light', key=k, light=lk, name=f'{s}--{k}-lines-vs-auto-{lk}lines', a=light[lk], b=lines, src=src))
    return out
def main():
    os.makedirs(os.path.join(HERE, 'judge'), exist_ok=True); mark = os.path.join(AU, 'JUDGING-FULL')
    todo = [p for p in pairs() if not (load(os.path.join(HERE, 'judge', p['name'] + '.json')) or {}).get('complete') and os.path.exists(p['a']) and os.path.exists(p['b'])]
    if todo:
        while os.path.exists(mark): said('another full-judge batch is running; waiting'); time.sleep(60)
        open(mark, 'w').write('pencil control\n')
        try:
            for p in todo:
                out = os.path.join(HERE, 'judge', p['name'] + '.json'); t = time.time()
                r = subprocess.run([PY, 'bench/scorer/whole.py', '--source', p['src'], '--auto', p['a'], '--image', p['b'], '--style', 'watercolour', '--out', out], cwd=TRUNK, env={**os.environ, 'JUDGE_ROUTE': 'local', 'JUDGE_LOCAL_PANEL': MODEL}, capture_output=True, text=True, timeout=40 * 60)
                d = load(out) or {}
                said(p['name'], {q: round(v.get('painting'), 3) if v.get('painting') is not None else None for q, v in (d.get('questions') or {}).items()} if d else f'FAILED rc={r.returncode}: {r.stderr[-300:]}', f'{round(time.time() - t)} s')
        finally:
            subprocess.run(['ollama', 'stop', MODEL], capture_output=True); os.remove(mark); said('model unloaded')
    subprocess.run([sys.executable, os.path.join(HERE, 'table.py')])
main()
