#!/usr/bin/env python3
"""choose_layin.py ID SOURCE PROMPT [ink]: the step-0 lay-in for a non-ink subject, one rule for all.
Candidates guides/ID-layin-PROMPTL8{,-s7,-s11}.png (Qwen seeds 42, 7, 11). Each is checked by tools/seg/drawing-fidelity.py
against the source. The passing seed with the fewest invented marks is chosen (none passing: the one with the fewest), and
cleaned generally (a seed that marks over 15% of the sheet is a tonal copy and comes last): invented marks and frame lines erased (the check's --strip), and any colour taken out (a lay-in is
graphite: a pixel with chroma over 12 goes to grey at its own lightness). Writes guides/ID-layin.png and
classify/fidelity/ID.json (every seed's scores, the choice). With a fourth word `ink` the candidates are the ink lines
guides/ID-inkprep-PROMPTL8{,-s7,-s11}.png (PROMPT e6) and the result guides/ID-inkprep.png, kept in its own colour.
Paths are relative to the preparation folder ($UNPAINT_PREP)."""
import json, os, subprocess, sys
import numpy as np
from PIL import Image
from skimage import color
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prep_root import prep_root, prep_python, REPO
R = prep_root(); os.chdir(R)
PY = prep_python(); F = REPO + '/tools/seg/drawing-fidelity.py'
os.makedirs('classify/fidelity', exist_ok=True)
args = [a for a in sys.argv[1:] if not a.startswith('--ver=')]; VER = next((a[6:] for a in sys.argv[1:] if a.startswith('--ver=')), '')
# --ver=v2: a pinned lay-in is never rewritten; the new choice is written as guides/ID-layin-v2.png and classify/fidelity/ID-v2.json
i, src, pr = args[0:3]; kind = args[3] if len(args) > 3 else 'layin'
tag = 'layin' if kind == 'layin' else 'inkprep'
cands = [f'guides/{i}-{tag}-{pr}L8{s}.png' for s in ('', '-s7', '-s11')]
res = []
for c in cands:
    if not os.path.exists(c): continue
    o = f'classify/fidelity/{os.path.basename(c)[:-4]}.json'
    subprocess.run([PY, F, src, c, '--out', o, '--sheet', o[:-5] + '.jpg'], check=True, capture_output=True)
    r = json.load(open(o)); r['file'] = c; res.append(r)
if not res: sys.exit(f'{i}: no candidates')
TONE = 0.15   # a lay-in is line on paper: more than this share of the sheet marked is a tonal copy, not a lay-in
for r in res: r['tonal'] = kind == 'layin' and r['marks'] > TONE
best = sorted(res, key=lambda r: (r['tonal'], not r['pass'], r['invented'] + 0.05 * len(r['frame'])))[0]
out = f'guides/{i}-{tag}' + (f'-{VER}' if VER else '') + '.png'
if VER and os.path.exists(out): sys.exit(f'{out} exists: a new version takes a new name')
subprocess.run([PY, F, src, best['file'], '--strip', out], check=True, capture_output=True)
for _ in range(2):   # a frame drawn twice (two ruled lines) needs a second pass
    tmp = out + '.json'; subprocess.run([PY, F, src, out, '--out', tmp], check=True, capture_output=True); rr = json.load(open(tmp)); os.remove(tmp)
    if not rr['frame']: break
    subprocess.run([PY, F, src, out, '--strip', out], check=True, capture_output=True)
if kind == 'layin':
    a = np.asarray(Image.open(out).convert('RGB'), np.float32) / 255
    lab = color.rgb2lab(a); C = np.hypot(lab[..., 1], lab[..., 2])
    lab[..., 1:][C > 12] = 0
    Image.fromarray((np.clip(color.lab2rgb(lab), 0, 1) * 255).astype(np.uint8)).save(out)
ck = f'classify/fidelity/{os.path.basename(out)[:-4]}-cleaned.json'
subprocess.run([PY, F, src, out, '--out', ck], check=True, capture_output=True)
cr = json.load(open(ck))
rec = {'cleaned_check': {k: cr[k] for k in ('invented', 'frame', 'pass')}, 'id': i, 'source': src, 'prompt': pr, 'seeds': [{k: r[k] for k in ('file', 'marks', 'tonal', 'invented', 'frame', 'pass', 'regions')} for r in res],
       'chosen': best['file'], 'chosen_passed': best['pass'], 'cleaned': out}
json.dump(rec, open(f'classify/fidelity/{i}' + (f'-{VER}' if VER else '') + '.json', 'w'), indent=1)
print(i, 'chose', best['file'], 'TONAL' if best['tonal'] else '', 'pass' if best['pass'] else 'NONE PASSED (stripped)', [(os.path.basename(r['file']), r['invented'], len(r['frame'])) for r in res])
