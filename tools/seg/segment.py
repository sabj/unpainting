#!/usr/bin/env python3
"""Where the subject is: a u2net salient-object mask per source, written as an 8-bit PNG at the source's aspect.

  python segment.py <out dir> <image> [<image> ...]
"""
import sys, os
import numpy as np
import onnxruntime as ort
from PIL import Image

MODEL = 'work/models/u2net.onnx'
SIDE = 320
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def mask_for(session, path):
    img = Image.open(path).convert('RGB')
    small = img.resize((SIDE, SIDE), Image.BILINEAR)
    x = np.asarray(small, dtype=np.float32) / 255.0
    x = (x - MEAN) / STD
    x = np.transpose(x, (2, 0, 1))[None].astype(np.float32)
    out = session.run(None, {session.get_inputs()[0].name: x})[0][0, 0]
    out = (out - out.min()) / max(1e-6, out.max() - out.min())
    return Image.fromarray((out * 255).astype(np.uint8)).resize(img.size, Image.BILINEAR), img.size


def main():
    out_dir, images = sys.argv[1], sys.argv[2:]
    os.makedirs(out_dir, exist_ok=True)
    session = ort.InferenceSession(MODEL, providers=['CPUExecutionProvider'])
    for path in images:
        name = os.path.splitext(os.path.basename(path))[0]
        mask, size = mask_for(session, path)
        dest = os.path.join(out_dir, name + '.png')
        mask.save(dest)
        share = (np.asarray(mask) > 128).mean()
        print(f'{name}: {size[0]}x{size[1]}, subject {share * 100:.1f}% of the sheet -> {dest}', flush=True)


if __name__ == '__main__':
    main()
