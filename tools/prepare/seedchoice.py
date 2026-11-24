# seedchoice.py [PICK]: writes seed-choice.json from pick.json (or the PICK file given) for paintings/make-subjects.py.
# {name: {seed, promptSet, id, files {s3L8,s1L8,s4L8}, why, final}}. final only when all three seeds of the chosen prompt set were scored.
# Subjects not in the pick file keep their entries (a partial pick never drops another subject's choice).
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prep_root import prep_root
os.chdir(os.path.join(prep_root(), 'segaudit'))   # seed-choice.json lives there; the registry writer reads it
PF = sys.argv[1] if len(sys.argv) > 1 else 'pick.json'
P = json.load(open(PF)); out = json.load(open('seed-choice.json')) if os.path.exists('seed-choice.json') else {}
for n, v in P.items():
    sets = v['sets']; have = [s for s in sets if 'penalty' in sets[s]]; ch = v['chosen']
    pens = ', '.join(f"{s}={sets[s]['penalty']}" + (' rejected: ' + sets[s]['rejected'] if 'rejected' in sets[s] else '') for s in have)
    why = f"automatic rule (segaudit/pick.py), lowest penalty of the candidate sets ({pens}); judged on {v['scored_on']}"
    seed = int(sets[ch].get('seed', ch)); pset = sets[ch].get('promptSet', 'std')
    full = all(((s if pset == 'std' else f'{s}-{pset}') in have) for s in ('42', '7', '11'))
    if not full: why += '. PROVISIONAL: not all three seeds of the chosen prompt set exist'
    if pset != 'std': why += '. Prompt set: %s (guides/prompts/s3%s.txt, s1%s.txt, s4%s.txt), in the s3L8, s1L8 and s4L8 roles' % ((pset,) + ({'strict': 'c', 'astra': 'a', 'astra-m': 'm', 'strict-n': 'n', 'value-v': 'v', 'value-w': 'w'}[pset],) * 3)
    if ch == '42' and any(f.endswith('-s42r.png') for f in sets[ch]['files'].values()): why += '. Seed 42 here is the RunPod twin (-s42r) of studies first made on the Mac, so all three seeds come from one backend'
    out[n] = {'seed': seed, 'promptSet': pset, 'id': v['id'], 'inputId': v.get('inputId', v['id']), 'files': sets[ch]['files'], 'why': why, 'final': full}
json.dump(out, open('seed-choice.json', 'w'), indent=1)
print({k: (out[k]['seed'], out[k]['promptSet'], out[k]['final']) for k in P})
