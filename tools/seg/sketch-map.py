#!/usr/bin/env python3
"""Optional published fine/coarse lineart maps for pre-paint sketch planning.

No linebench runner, HED, or ArtLine dependency. pip install controlnet_aux torch
torchvision pillow opencv-python-headless. Weights stay in --cache (ignored work/).
Both fine and coarse networks come from lllyasviel/Annotators, Informative
Drawings lineage; see THIRD_PARTY_NOTICES.md. Run only before painting.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('images', nargs='+'); p.add_argument('--out', required=True)
    p.add_argument('--cache', default='work/line-models/hf')
    p.add_argument('--width', type=int, default=720)
    p.add_argument('--maxside', type=int, default=1080)
    p.add_argument('--offline', action='store_true')
    a = p.parse_args()
    if a.width < 64 or a.maxside < 64:
        p.error('--width and --maxside must be at least 64')
    os.environ['HF_HOME'] = str(Path(a.cache).resolve())
    if a.offline:
        os.environ['HF_HUB_OFFLINE'] = '1'
    import cv2
    import numpy as np
    import torch
    from controlnet_aux import LineartDetector
    torch.set_num_threads(2)
    detector = LineartDetector.from_pretrained('lllyasviel/Annotators')
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    for filename in a.images:
        im = cv2.imread(filename)
        if im is None:
            p.error('cannot read '+filename)
        H, W = im.shape[:2]
        scale = min(a.width/W, a.maxside/max(H, W))
        w = max(4, round(W*scale)); h = max(4, round(H*scale))
        im = cv2.resize(im, (w, h), interpolation=cv2.INTER_AREA if w < W else cv2.INTER_CUBIC)
        rgb = cv2.cvtColor(im, cv2.COLOR_BGR2RGB)
        padded = cv2.copyMakeBorder(rgb, 0, (-h)%8, 0, (-w)%8, cv2.BORDER_REFLECT_101)
        t = torch.from_numpy(padded).float().permute(2, 0, 1)[None]/255
        maps = {}
        for name, model in [('fine', detector.model), ('coarse', detector.model_coarse)]:
            model.eval()
            with torch.no_grad():
                grey = model(t)[0, 0].numpy()[:h, :w]
            maps[name] = np.clip(1-grey, 0, 1)
            cv2.imwrite(str(out/(Path(filename).stem+'-'+name+'.png')), np.uint8((1-maps[name])*255))
        # Fine local evidence, emphasized by coarse structural agreement. Coarse
        # strokes without fine support cannot introduce new geometry.
        dark = maps['fine']*(.35+.65*np.sqrt(maps['coarse']))
        stem = out/Path(filename).stem
        cv2.imwrite(str(stem)+'.png', np.uint8((1-dark)*255))
        Path(str(stem)+'.json').write_text(json.dumps({
            'source': filename, 'targetSHA256': hashlib.sha256(Path(filename).read_bytes()).hexdigest(),
            'model': 'lllyasviel/Annotators: sk_model.pth and sk_model2.pth',
            'method': 'fine darkness * (0.35 + 0.65 * sqrt(coarse darkness))',
            'width': w, 'height': h, 'planningOnly': True,
        }, indent=2)+'\n')
        print(stem, flush=True)


if __name__ == '__main__':
    main()
