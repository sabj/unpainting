#!/usr/bin/env python3
"""The benchmark's own score for the paintings of the round: bench/scorer/score_painting.py, one painting against its
target (the subject's source picture), 0 to 10, as bench/docs/scoring.md describes. Not the head-to-head judge.
   score-all.py classic [scored|autos]    the classic measurements only (no judge)
   score-all.py vision  [scored|autos]    the whole score on the local route (JUDGE_ROUTE=local, judge label J3-local)
Scoring size (the doc's rule, as bench/scripts/score.mjs does it): the painting's own PNG at its target's native size,
Lanczos-resampled only when the two differ; when the source is LARGER than the painting the source is brought down to
the painting instead, so nothing is ever enlarged. Results: one JSON a painting in classic/ and full/; then table.py."""
import glob, json, os, subprocess, sys, time
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); WORK = os.path.dirname(HERE); TRUNK = os.path.dirname(WORK); PAINT = os.path.join(WORK, 'paint'); FIX = os.path.join(PAINT, 'l2-fix')
PY = sys.executable; SCRATCH = os.path.expanduser('~/Scratch/unpainting-033'); REG = {s['id']: s for s in json.load(open(os.path.join(SCRATCH, 'SUBJECTS.json')))['subjects']}
PANEL = 'qwen3.8-flash-next:125b-mlx,qwen3.8:27b-mlx,gemma4:31b-mlx'
def load(f):
    try: return json.load(open(f))
    except Exception: return None
def style_of(sid):
    c = (REG[sid].get('class') or {}); return f"watercolor; the drawing under it: {c.get('plain') or c.get('value') or 'none'}"
def entries():
    out = []
    for s in ('mittens-closeup', 'white-ships'):
        out.append(dict(group='scored', subject=s, painting='Auto', folder=f'{FIX}/paint-auth-66690c4f-auto-{s}--auto'))
        for k, n in (('opus', 'Opus'), ('astra', 'Astra'), ('argon', 'Gemini')):
            out.append(dict(group='scored', subject=s, painting=f'{n} L1', model=k, level='L1', folder=f'{FIX}/paint-l1-{s}--{k}'))
            out.append(dict(group='scored', subject=s, painting=f'{n} L2', model=k, level='L2', folder=f'{FIX}/paint-auth-66690c4f-l2-{s}--{k}-lines'))
    for f in sorted(glob.glob(f'{PAINT}/all-r1/*--auto')) + [f'{FIX}/guard-yale-66690c4f'] + sorted(glob.glob(f'{FIX}/*--auto')) + sorted(glob.glob(f'{FIX}/auto-*')):
        r = load(f + '/run.json')
        if not r or f.startswith(f'{FIX}/paint-auth-66690c4f-auto-'): continue
        sid = r['subject']['id']; v = r['subject'].get('variant')
        out.append(dict(group='autos', subject=sid + (':' + v if v else ''), sid=sid, painting='Auto', folder=f))
    # the ORIGINAL: the subject's source picture itself, put through the same panel as the painting, against itself as the target: the subject's ceiling
    seen = []
    for e in list(out):
        sid = e.get('sid') or e['subject']
        if sid not in seen and (e['group'] == 'scored' or os.path.basename(os.path.dirname(e['folder'])) + '--' + os.path.basename(e['folder']) if False else True) and sid not in seen: seen.append(sid)
    for sid in seen: out.append(dict(group='originals', subject=sid, sid=sid, painting='Original', folder=os.path.join(SCRATCH, 'no-such-folder'), original=True))
    for e in out:
        e.setdefault('sid', e['subject']); r = load(e['folder'] + '/run.json') or {}; l1 = load(e['folder'] + '/L1.json')
        e['png'] = next((p for p in (e['folder'] + '/plate/painting.png', e['folder'] + '/painting.png') if os.path.exists(p)), None)
        e['commit'] = ((r.get('code') or {}).get('commit') or '')[:8] or ('f192adc0' if l1 and e['sid'] == 'mittens-closeup' else 'ee05b339' if l1 else '?')
        e['failure'] = r.get('failure'); e['state'] = (r.get('results') or {}).get('state') if r else ('finished' if l1 else None)
        e['name'] = os.path.basename(os.path.dirname(e['folder'])) + '--' + os.path.basename(e['folder']) if '/all-r1/' in e['folder'] else os.path.basename(e['folder'])
        e['target'] = os.path.join(SCRATCH, REG[e['sid']]['source']['path']); e['style'] = style_of(e['sid'])
        if e.get('original'): e['png'] = e['target']; e['name'] = 'original--' + e['sid']; e['commit'] = 'the source'; e['state'] = 'finished'
        cr = load(e['folder'] + '/plate/cheat-risk.json'); e['cheat'] = cr
    return out
def sized(e, tmp):
    """(target, image, note): the two files handed to the scorer, the same size, nothing enlarged."""
    t, p = Image.open(e['target']), Image.open(e['png'])
    if t.size == p.size: return e['target'], e['png'], f'{p.size[0]} x {p.size[1]}, no resampling'
    os.makedirs(tmp, exist_ok=True)
    if t.size[0] > p.size[0]:
        f = os.path.join(tmp, e['name'] + '-target.png'); t.convert('RGB').resize(p.size, Image.LANCZOS).save(f)
        return f, e['png'], f'{p.size[0]} x {p.size[1]}: the source ({t.size[0]} x {t.size[1]}) brought down to the painting (Lanczos)'
    f = os.path.join(tmp, e['name'] + '-painting.png'); p.convert('RGB').resize(t.size, Image.LANCZOS).save(f)
    return e['target'], f, f'{t.size[0]} x {t.size[1]}: the painting ({p.size[0]} x {p.size[1]}) brought down to the source (Lanczos)'
KEEP = ('all-r1--', 'guard-yale-66690c4f', 'planner-before-rembrandt--auto', 'kasha-portrait-tag-inkset--auto')   # the Autos scored: the wide set, and the tag's own where one exists
def wanted(e, group):
    if group and e['group'] != group: return False
    return e['group'] in ('scored', 'originals') or e['name'].startswith(KEEP)
def run(e, out, model=None):
    target, image, note = sized(e, os.path.join(HERE, 'sized')); t0 = time.time()
    env = {**os.environ, 'JUDGE_ROUTE': 'local', **({'JUDGE_LOCAL_PANEL': model} if model else {})}
    r = subprocess.run([PY, 'bench/scorer/score_painting.py', '--target', target, '--image', image, '--style', e['style'], '--out', out] + ([] if model else ['--no-vision']), cwd=TRUNK, env=env, capture_output=True, text=True)
    d = load(out)
    if d: d['scoreInput'] = note; d['styleGiven'] = e['style']; d['painting'] = e['png']; d['targetFile'] = e['target']; json.dump(d, open(out, 'w'), indent=1)
    return d, r, round(time.time() - t0)
def main():
    """classic: one file a painting. vision: the judges ARE the score (the owner, 22 Nov): each judge of the panel reads
    each painting CALLS times (three), one model in memory at a time, every painting for one judge before the next judge
    is loaded; a judge's score is the median of its valid calls and needs all three."""
    phase, group = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else None); CALLS = 3
    todo = [e for e in entries() if wanted(e, group)]
    for e in todo:
        if not e['png'] or e['failure']: print(time.strftime('%H:%M:%S'), e['name'], 'NOT SCORED:', e['failure'] or 'no painting.png', flush=True)
    todo = [e for e in todo if e['png'] and not e['failure']]
    if phase == 'classic':
        os.makedirs(os.path.join(HERE, 'classic'), exist_ok=True)
        for e in todo:
            out = os.path.join(HERE, 'classic', e['name'] + '.json')
            if load(out): continue
            d, r, sec = run(e, out); print(time.strftime('%H:%M:%S'), e['name'], (d and {'classic': d.get('classic'), **{k: v for k, v in d['criteria'].items() if k.startswith('classic_')}}) or f'FAILED rc={r.returncode} {r.stderr[-400:]}', f'{sec} s', flush=True)
        return
    for m in PANEL.split(','):
        tag = m.replace(':', '_').replace('/', '_')
        for e in todo:
            os.makedirs(os.path.join(HERE, 'judges', e['name']), exist_ok=True)
            for k in range(1, CALLS + 1):
                out = os.path.join(HERE, 'judges', e['name'], f'{tag}-{k}.json'); old = load(out)
                if old and old.get('visionOverall') is not None: continue
                d, r, sec = run(e, out, m); print(time.strftime('%H:%M:%S'), e['name'], m, f'call {k}', (d and d.get('visionOverall')) if d else f'FAILED rc={r.returncode} {r.stderr[-300:]}', f'{sec} s', flush=True)
        subprocess.run(['ollama', 'stop', m], capture_output=True); print(time.strftime('%H:%M:%S'), m, 'unloaded', flush=True)
        subprocess.run([PY, os.path.join(HERE, 'table.py')], capture_output=True)
if __name__ == '__main__': main()
