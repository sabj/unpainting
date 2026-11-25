"""The painted masses of a subject (sky, cloud, water, foliage mass; a cast shadow is named but not shaped): things a local vision model says are
painted with no drawn line, shaped by SAM from their boxes. For the ink-amount dial (tools/seg/order-strokes.mjs --masses).

usage: mass-mask.py IMAGE LABELS.json OUT.png [--model qwen3.8:27b-mlx]
LABELS.json is a thing-labels file ({"things": [{name, kind, box}]}, labels/run_all.py). OUT.png is white where a mass is,
at the image's size; OUT.json records the model's answer. Local only (Ollama on this Mac); nothing is uploaded.
"""
import base64, io, json, os, re, sys, urllib.request
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sam_regions
from segments import find_checkpoint

ASK = ('This is a painting. Here are things listed in it:\n{names}\nWhich of these are painted MASSES with no drawn line '
       '(for example sky, cloud, water, a foliage mass, a cast shadow), judged from the picture? Reply with a JSON list of '
       'their names exactly as given, and nothing else.')


def ask(model, image, names):
    from PIL import Image
    im = Image.open(image).convert('RGB'); im.thumbnail((1024, 1024)); b = io.BytesIO(); im.save(b, 'JPEG', quality=88)
    body = {'model': model, 'stream': False, 'think': False, 'options': {'temperature': 0, 'num_predict': 800},
            'messages': [{'role': 'user', 'content': ASK.format(names='\n'.join(names)), 'images': [base64.b64encode(b.getvalue()).decode()]}]}
    req = urllib.request.Request('http://127.0.0.1:11434/api/chat', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    txt = json.load(urllib.request.urlopen(req, timeout=900))['message']['content']
    s = re.sub(r'```(?:json)?', '', txt); a, z = s.find('['), s.rfind(']')
    return txt, [n for n in json.loads(s[a:z + 1]) if n in names]


def main():
    image, labels, out = sys.argv[1:4]
    model = sys.argv[sys.argv.index('--model') + 1] if '--model' in sys.argv else 'qwen3.8:27b-mlx'
    things = json.load(open(labels))['things']; names = [t['name'] for t in things]
    reply, masses = ask(model, image, names)
    import torch
    from segment_anything import sam_model_registry, SamPredictor
    bgr = cv2.imread(image, cv2.IMREAD_COLOR); H, W = bgr.shape[:2]
    device, _ = sam_regions.pick_device(torch)
    pred = SamPredictor(sam_model_registry['vit_b'](checkpoint=find_checkpoint('')).to(device)); pred.set_image(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    field = np.zeros((H, W), np.uint8); shaped = []
    for t in things:
        b = t.get('box')
        # a box round a shadow is answered by SAM with the thing it falls on (thing-masks.py), so shadows are not shaped
        if t['name'] not in masses or t.get('kind') == 'shadow' or not isinstance(b, list) or len(b) != 4: continue
        b = [float(v) / (1000 if max(map(float, b)) > 1.5 else 1) for v in b]
        x0, x1 = sorted((b[0], b[2])); y0, y1 = sorted((b[1], b[3]))
        box = np.array([x0 * W, y0 * H, x1 * W, y1 * H], np.float32)
        ms, sc, _ = pred.predict(box=box, multimask_output=True)
        # the best-scoring shape that stays mostly inside its box
        X0, Y0, X1, Y1 = box.astype(int)
        for m, s in sorted(zip(ms, sc), key=lambda r: -r[1]):
            if m.sum() and m[Y0:Y1 + 1, X0:X1 + 1].sum() / m.sum() >= 0.8: field[m] = 255; shaped.append(t['name']); break
    cv2.imwrite(out, field)
    json.dump({'model': model, 'question': ASK, 'reply': reply, 'masses': masses, 'shaped': shaped, 'share': round(float((field > 0).mean()), 3)}, open(os.path.splitext(out)[0] + '.json', 'w'), indent=1)
    print(f'mass-mask: {model} named {masses}; SAM shaped {len(shaped)}; {100 * (field > 0).mean():.1f}% of the sheet')


if __name__ == '__main__':
    main()
