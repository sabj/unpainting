"""The mask of each named thing: SAM prompted with the rough box a local vision model gave it.

usage: thing-masks.py IMAGE LABELS.json OUT.png
LABELS.json is a thing-labels file ({"things": [{name, kind, box}]}, boxes as fractions or thousandths). OUT.png is a
label map at the image's size: the value of a pixel is 1 + the position in the file's list of the thing it belongs to,
0 where no thing is. Larger boxes are laid first, so a thing inside another (a window in a wall) is on top. Shadows are
not prompted: a box round a shadow is answered with the thing it falls on. Local only; nothing is uploaded.
"""
import json, sys, os
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sam_regions
from segments import find_checkpoint


def boxes(things, W, H):
    out = []
    for q, t in enumerate(things):
        b = t.get('box')
        if t.get('kind') == 'shadow' or not isinstance(b, list) or len(b) != 4: continue
        b = [float(v) for v in b]
        if max(b) > 1.5: b = [v / 1000 for v in b]
        x0, x1 = sorted((b[0], b[2])); y0, y1 = sorted((b[1], b[3]))
        x0, x1, y0, y1 = [min(1, max(0, v)) for v in (x0, x1, y0, y1)]
        if x1 > x0 and y1 > y0: out.append((q, np.array([x0 * W, y0 * H, x1 * W, y1 * H], dtype=np.float32), (x1 - x0) * (y1 - y0)))
    return sorted(out, key=lambda r: -r[2])


def main():
    image, labels, out = sys.argv[1:4]
    import torch
    from segment_anything import sam_model_registry, SamPredictor
    ck = find_checkpoint('')
    if not ck: sys.exit('thing-masks: no SAM checkpoint')
    bgr = cv2.imread(image, cv2.IMREAD_COLOR); H, W = bgr.shape[:2]
    device, _ = sam_regions.pick_device(torch)
    pred = SamPredictor(sam_model_registry['vit_b'](checkpoint=ck).to(device)); pred.set_image(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    things = json.load(open(labels))['things']; field = np.zeros((H, W), np.uint8); report = []
    for q, box, _ in boxes(things, W, H):
        masks, scores, _ = pred.predict(box=box, multimask_output=True)
        # the best-scoring mask that stays mostly inside its box (SAM sometimes answers a box with the whole scene)
        x0, y0, x1, y1 = box.astype(int); best = None
        for m, s in sorted(zip(masks, scores), key=lambda r: -r[1]):
            inside = m[y0:y1 + 1, x0:x1 + 1].sum() / max(1, m.sum())
            if m.sum() and inside >= 0.8: best = m; break
        if best is None: continue
        field[best] = q + 1; report.append((things[q].get('name'), int(best.sum())))
    cv2.imwrite(out, field)
    print(f'thing-masks: {len(report)} things masked on {device}:', ', '.join(f'{n} {a}' for n, a in report))


if __name__ == '__main__':
    main()
