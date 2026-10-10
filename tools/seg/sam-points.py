#!/usr/bin/env python3
"""One named region from Segment Anything, prompted by points, written as a segments file.

For pictures where segments.py's rules name the wrong regions: SAM gives one mask from a few points on the
subject (and optionally off it), written as <out>/<name>.png (0 background, 1 the region) and <name>.json.

  python3 tools/seg/sam-points.py <image> --out work/segments --name <name> \\
      --region dog --on 0.33,0.42 0.24,0.5 --off 0.85,0.5

Points are fractions of the image's width and height. Needs the painter-seg venv (see tools/seg/segments.py).
"""
import argparse, json, os
import numpy as np, cv2

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image'); ap.add_argument('--out', default='work/segments'); ap.add_argument('--name', required=True)
    ap.add_argument('--region', default='dog'); ap.add_argument('--on', nargs='+', required=True); ap.add_argument('--off', nargs='*', default=[])
    ap.add_argument('--checkpoint', default='work/models/sam_vit_b_01ec64.pth'); ap.add_argument('--model', default='vit_b')
    ap.add_argument('--side', type=int, default=1024); ap.add_argument('--open', type=int, default=6)
    a = ap.parse_args()
    from segment_anything import sam_model_registry, SamPredictor
    img = cv2.cvtColor(cv2.imread(a.image), cv2.COLOR_BGR2RGB); H, W = img.shape[:2]
    s = min(1.0, a.side / max(H, W)); small = cv2.resize(img, (round(W * s), round(H * s)), interpolation=cv2.INTER_AREA)
    pred = SamPredictor(sam_model_registry[a.model](checkpoint=a.checkpoint)); pred.set_image(small)
    pts = [(float(x) * small.shape[1], float(y) * small.shape[0]) for x, y in (p.split(',') for p in a.on + a.off)]
    lab = [1] * len(a.on) + [0] * len(a.off)
    masks, scores, _ = pred.predict(point_coords=np.array(pts), point_labels=np.array(lab), multimask_output=True)
    k = int(np.argmax(scores)); m = masks[k].astype(np.uint8)
    # SAM's mask on a loose drawing leaks into washes of the same tone: opened by --open cells, the largest piece kept
    # and its holes filled
    if a.open > 0:
        ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * a.open + 1,) * 2)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, ker)
        n, lab_, st, _ = cv2.connectedComponentsWithStats(m, 8)
        if n > 1: m = (lab_ == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
        ff = m.copy(); pad = np.zeros((m.shape[0] + 2, m.shape[1] + 2), np.uint8); cv2.floodFill(ff, pad, (0, 0), 1)
        m = m | (1 - ff)
    m = cv2.resize(m, (W, H), interpolation=cv2.INTER_NEAREST)
    os.makedirs(a.out, exist_ok=True)
    cv2.imwrite(os.path.join(a.out, a.name + '.png'), m)
    json.dump({'legend': {'0': 'background', '1': a.region}, 'regions': [{'id': 0, 'name': 'background'}, {'id': 1, 'name': a.region, 'foreground': True}],
               'sam': {'on': a.on, 'off': a.off, 'score': float(scores[k]), 'area': float(m.mean())}}, open(os.path.join(a.out, a.name + '.json'), 'w'), indent=1)
    print(f'{a.name}: {a.region} {100 * m.mean():.1f}% of the image, SAM score {scores[k]:.3f}')

if __name__ == '__main__':
    main()
