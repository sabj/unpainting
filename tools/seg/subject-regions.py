#!/usr/bin/env python3
"""A label map of named regions for ranking a drawing's lines by what they draw (drawing-plan.mjs, lines "regions").

The person comes from Mask R-CNN (pp/models.py); each named part from Segment Anything, prompted by a box or points. Parts are
laid in the spec's order, so a later part wins where two overlap. What is left of the person is `--rest` (clothing);
everything else is background. Writes <out>.png (region ids) and <out>.json ({ legend, subject, sam }).

  OMP_NUM_THREADS=4 nice -n 10 .venv/bin/python tools/seg/subject-regions.py \\
      examples/targets/rembrandt-woman-reading.jpg --out work/regions/rembrandt-woman-reading \\
      --spec examples/plans/rembrandt-woman-reading-regions.json

The spec is { "parts": [{ "name", "box": [x0, y0, x1, y1], "on": [[x, y]], "off": [[x, y]], "inPerson": bool }],
"subject": [names] }: a part may be prompted by a box, points or both, which keeps SAM from spreading over a whole
sketched figure. A part named like --rest adds to the person. Box and points are fractions of the image's width and
height. Needs torch, torchvision and segment-anything with a checkpoint (--checkpoint, default work/models/sam_vit_b_01ec64.pth; see segments.py).
"""
import argparse, json, os, sys
import numpy as np, cv2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image'); ap.add_argument('--out', required=True); ap.add_argument('--spec', required=True)
    ap.add_argument('--rest', default='clothing'); ap.add_argument('--side', type=int, default=1024)
    ap.add_argument('--checkpoint', default='work/models/sam_vit_b_01ec64.pth')
    a = ap.parse_args()
    spec = json.load(open(a.spec))
    img = cv2.imread(a.image)
    if img is None:
        sys.exit(f'subject-regions: cannot read {a.image}')
    H, W = img.shape[:2]
    s = min(1.0, a.side / max(H, W))
    small = cv2.resize(img, (round(W * s), round(H * s)), interpolation=cv2.INTER_AREA)
    h, w = small.shape[:2]

    from pp.models import detections
    people = [m for l, sc, m in detections(small, None) if l == 1]
    person = max(people, key=lambda m: m.sum()) if people else np.zeros((h, w), bool)
    print(f'person: {len(people)} found, the largest {100 * person.mean():.1f}% of the image')

    from segment_anything import sam_model_registry, SamPredictor
    pred = SamPredictor(sam_model_registry['vit_b'](checkpoint=a.checkpoint))
    pred.set_image(cv2.cvtColor(small, cv2.COLOR_BGR2RGB))
    names = ['background', a.rest]
    label = np.where(person, 1, 0).astype(np.uint8)
    report = {}
    for part in spec['parts']:
        pts = [(x * w, y * h) for x, y in part.get('on', []) + part.get('off', [])]
        lab = [1] * len(part.get('on', [])) + [0] * len(part.get('off', []))
        box = np.array([part['box'][0] * w, part['box'][1] * h, part['box'][2] * w, part['box'][3] * h]) if 'box' in part else None
        masks, scores, _ = pred.predict(point_coords=np.array(pts) if pts else None, point_labels=np.array(lab) if pts else None,
                                        box=box, multimask_output=True)
        k = int(np.argmax(scores)); m = masks[k]
        if part.get('inPerson') and person.any():
            m = m & (cv2.dilate(person.astype(np.uint8), np.ones((15, 15), np.uint8)) > 0)
        if part['name'] not in names:
            names.append(part['name'])
        label[m] = names.index(part['name'])
        report[part['name']] = {'score': round(float(scores[k]), 3), 'area': round(float(m.mean()), 4)}
        print(f"{part['name']}: {100 * m.mean():.1f}% of the image, SAM score {scores[k]:.3f}")
    label = cv2.resize(label, (W, H), interpolation=cv2.INTER_NEAREST)
    os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
    cv2.imwrite(a.out + '.png', label)
    json.dump({'legend': {str(i): n for i, n in enumerate(names)}, 'subject': spec.get('subject', []), 'sam': report},
              open(a.out + '.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
