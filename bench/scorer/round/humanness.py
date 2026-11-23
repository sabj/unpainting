#!/usr/bin/env python3
"""The human-ness reading (the project's rubric: paint/painter/judge/RUBRIC.md), by the local panel.
For each painting two questions, kept apart:
  sequence   twelve snapshots of the painting in progress, evenly spaced through its film, then the finished sheet, in
             order, each labelled only with its percent complete. The judge knows nothing of the method. It first says
             whether this is the order and the kind of mark a person would use (yes or no, one sentence), then scores
             each snapshot 1 to 5 and names its tells (a) to (j).
  finished   the finished sheet alone, scored 1 to 5 under the same rubric with its tells. The ORIGINAL has no film and
             is read this way only; a painting's human-ness index is its finished score over its original's.
Three readings a judge, every painting for one judge before the next is loaded. The sequence needs a longer context
than the scorer's 8,192 tokens (thirteen pictures): 16,384 here, the pictures at most 640 px on the long side.
   humanness.py [scored|autos]     results in humanness/<painting>/"""
import importlib.util, json, os, re, subprocess, sys, time
os.environ['JUDGE_ROUTE'] = 'local'
HERE = os.path.dirname(os.path.abspath(__file__))
sp = importlib.util.spec_from_file_location('sa', os.path.join(HERE, 'score-all.py')); sa = importlib.util.module_from_spec(sp); sp.loader.exec_module(sa)
os.environ['JUDGE_LOCAL_PANEL'] = sa.PANEL
sys.path.insert(0, os.path.join(sa.TRUNK, 'bench', 'scorer'))
import score_painting as SP, local_route  # noqa: E402
from common import load_rgb  # noqa: E402
local_route.NUM_CTX = 16384; local_route.MAX_PREDICT = 3000
RUBRIC = open(os.path.join(sa.TRUNK, '..', '..', '..', 'paint', 'painter', 'judge', 'RUBRIC.md')).read().split('For each snapshot the judge writes')[0].strip()
SEQ = RUBRIC + """

Below are {n} snapshots of one painting in progress, in order, each labelled only with its percentage complete; the last is the finished sheet. It is a painting in this style: {style}.
First answer for the whole sequence: is this the order and the kind of mark a person would use for this subject? Then score each snapshot.
Reply with JSON only, no prose: {{"sequence":{{"human":true or false,"why":"one sentence"}},"snapshots":[{{"pct":n,"score":1-5,"tells":["a","c"],"note":"one sentence"}}, ... one object for each of the {n} snapshots, in order]}}"""
ONE = RUBRIC + """

Below is one sheet, 100 percent complete: a painting in this style: {style}. There are no earlier snapshots, so tells that need them (f, g, h, j) cannot be named. Score it 1 to 5 under the rubric above and name its tells.
Reply with JSON only, no prose: {{"score":1-5,"tells":["a","c"],"note":"one sentence"}}"""
LETTERS = set('abcdefghij')
def film(e):
    for d in (e['folder'], os.path.join(e['folder'], 'plate')):
        doc = sa.load(os.path.join(d, 'frames.json'))
        if doc and len(doc.get('frames', [])) >= 14 and all(os.path.exists(os.path.join(d, f['src'])) for f in doc['frames']): return d, doc['frames']
    return None, None
def snapshots(e):
    d, fr = film(e)
    if not fr: return None
    n = len(fr); idx = [round((i + 1) * (n - 1) / 13) for i in range(12)]
    return [(os.path.join(d, fr[i]['src']), round(100 * (fr[i].get('position') if fr[i].get('position') is not None else i / (n - 1)))) for i in idx] + [(e['png'], 100)]
def tells(x): return sorted({str(t).strip().lower().strip('()') for t in (x or [])} & LETTERS)
def parse_seq(raw, n):
    raw = re.sub(r'```(?:json)?', '', raw or ''); a, b = raw.find('{'), raw.rfind('}')
    try: d = json.loads(raw[a:b + 1]); s = d['snapshots']; q = d['sequence']
    except Exception: return None
    if not isinstance(s, list) or len(s) != n or not isinstance(q.get('human'), bool): return None
    try: return {'human': q['human'], 'why': str(q.get('why', ''))[:300], 'snapshots': [{'score': max(1.0, min(5.0, float(x['score']))), 'tells': tells(x.get('tells')), 'note': str(x.get('note', ''))[:200]} for x in s]}
    except Exception: return None
def parse_one(raw):
    raw = re.sub(r'```(?:json)?', '', raw or '')
    for m in reversed(re.findall(r'\{[^{}]*\}', raw)):
        try: d = json.loads(m); return {'score': max(1.0, min(5.0, float(d['score']))), 'tells': tells(d.get('tells')), 'note': str(d.get('note', ''))[:200]}
        except Exception: pass
    return None
def call(cfg, m, content, parse):
    why = None
    for _ in range(3):
        try: raw, u = local_route.post(cfg, m, [{'role': 'user', 'content': content}], max_tokens=3000)
        except RuntimeError as x: why = str(x)[:200]; continue
        r = parse(raw)
        if r: return {**r, 'promptTokens': u.get('prompt_tokens')}, None
        why = 'no valid reply: ' + (raw or '')[:100].replace('\n', ' ')
    return None, why
def main():
    group = sys.argv[1] if len(sys.argv) > 1 else 'scored'; cfg = local_route.settings(); two = ('mittens-closeup', 'white-ships')
    E = [e for e in sa.entries() if sa.wanted(e, None) and e['png'] and not e['failure'] and (e['group'] == group or (e['group'] == 'originals' and (group != 'scored' or e['sid'] in two)))]
    for m in sa.PANEL.split(','):
        tag = m.replace(':', '_')
        for e in E:
            d = os.path.join(HERE, 'humanness', e['name']); os.makedirs(d, exist_ok=True); snaps = None if e['group'] == 'originals' else snapshots(e)
            jobs = [('finished', [{'type': 'text', 'text': ONE.format(style=e['style'])}, {'type': 'image_url', 'image_url': {'url': SP.data_uri(load_rgb(e['png']), 768)}}], parse_one)]
            if snaps:
                c = [{'type': 'text', 'text': SEQ.format(n=len(snaps), style=e['style'])}]
                for k, (f, pct) in enumerate(snaps): c += [{'type': 'text', 'text': f'Snapshot {k + 1}: {pct}% complete'}, {'type': 'image_url', 'image_url': {'url': SP.data_uri(load_rgb(f), 640)}}]
                jobs.append(('sequence', c, lambda raw, n=len(snaps): parse_seq(raw, n)))
                json.dump([{'file': f, 'pct': p} for f, p in snaps], open(f'{d}/snapshots.json', 'w'), indent=1)
            elif e['group'] != 'originals': open(f'{d}/NO-FILM.txt', 'w').write('no film with at least 14 frames beside this painting: the sequence was not read\n')
            for kind, content, parse in jobs:
                for k in (1, 2, 3):
                    out = f'{d}/{kind}-{tag}-{k}.json'
                    if (sa.load(out) or {}).get('ok'): continue
                    t = time.time(); r, why = call(cfg, m, content, parse)
                    json.dump({'ok': bool(r), 'judge': m, **(r or {'error': why})}, open(out, 'w'), indent=1)
                    print(time.strftime('%H:%M:%S'), e['name'], kind, m, k, (r.get('score') if kind == 'finished' else [s['score'] for s in r['snapshots']]) if r else f'FAILED {why}', (r or {}).get('promptTokens'), f'{round(time.time() - t)} s', flush=True)
        subprocess.run(['ollama', 'stop', m], capture_output=True)
    subprocess.run([sys.executable, os.path.join(HERE, 'table.py')], capture_output=True)
if __name__ == '__main__': main()
