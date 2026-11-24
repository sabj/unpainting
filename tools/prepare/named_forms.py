# named_forms.py ID: named-forms/ID/{labels.json,named-sam.png,receipt.json} from labels/ID.json (the vision model's boxes, no hand edit)
# and SAM ViT-B (tools/seg/thing-masks.py), in the named-sam-v1 receipt format the painter reads (rc7 tools/painter/thing-masks.mjs).
import json, os, sys, subprocess, hashlib, shutil
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prep_root import prep_root, prep_python, REPO
if not os.path.isfile(os.environ.get('PAINTER_SAM_CHECKPOINT') or ''): sys.exit('PAINTER_SAM_CHECKPOINT is not set to the SAM ViT-B checkpoint (sam_vit_b_01ec64.pth)')
R = prep_root(); os.chdir(R); i = sys.argv[1]
MANIFEST = os.environ.get('SUBJECTS_JSON') or 'SUBJECTS.json'
rec = [s for s in json.load(open(MANIFEST))['subjects'] if s['id'] == i][0]; src = rec['source']['path']; lid = rec.get('inputId', i)   # the labels carry the input id
d = f'named-forms/{i}'; os.makedirs(d, exist_ok=True)
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
lab = json.load(open(f'labels/{lid}.json')); things = lab['things']
json.dump({'id': i, 'note': 'the vision model\'s boxes from labels/%s.json, unedited' % lid, 'things': things}, open(f'{d}/labels.json', 'w'), indent=1)
subprocess.run([prep_python(), REPO + '/tools/seg/thing-masks.py', src, f'{d}/labels.json', f'{d}/named-sam.png'], check=True, stdout=open(f'{d}/generate.log', 'w'))
m = np.asarray(Image.open(f'{d}/named-sam.png')); H, W = m.shape
forms = []
for q, t in enumerate(things):
    b = t.get('box'); vis = int((m == q + 1).sum())
    if vis: forms.append({'id': q + 1, 'name': t.get('name') or t.get('thing'), 'kind': t.get('kind'), 'visiblePixels': vis})
rec = {'schema': 'named-sam-v1', 'backend': 'sam', 'model': 'vit_b', 'width': W, 'height': H,
       'source': {'path': '../../' + src, 'sha256': sha(src)}, 'labels': {'path': 'labels.json', 'sha256': sha(f'{d}/labels.json')},
       'mask': {'path': 'named-sam.png', 'sha256': sha(f'{d}/named-sam.png')}, 'forms': forms,
       'note': 'made from the vision model boxes with no hand review (tools/prepare/named_forms.py)'}
json.dump(rec, open(f'{d}/receipt.json', 'w'), indent=1); print(i, W, H, len(forms), 'of', len(things), 'forms with pixels')
