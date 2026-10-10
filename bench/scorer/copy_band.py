#!/usr/bin/env python3
"""Copy signal for the cheat-risk score: how closely a painting's fine detail follows the target's.

  python3 copy_band.py --target T.png --image P.png

Prints {"copyHF": r}: the Pearson correlation of the 2-4 px band (Gaussian blur 1 minus blur 2) of painting and
target luminance, at the target's size. Honest v2 paintings stayed under a per-crop ceiling (docs/anti-cheat.md).
Runs offline and needs no key.
"""
import argparse, json

import numpy as np
from PIL import Image, ImageFilter


def band(img, size):
    g = img.convert("L").resize(size, Image.LANCZOS)
    return np.asarray(g.filter(ImageFilter.GaussianBlur(1)), float) - np.asarray(g.filter(ImageFilter.GaussianBlur(2)), float)


def copy_hf(painting, target):
    t = Image.open(target)
    x = band(Image.open(painting), t.size).ravel(); y = band(t, t.size).ravel()
    x -= x.mean(); y -= y.mean()
    d = np.sqrt((x * x).sum() * (y * y).sum())
    return round(float((x * y).sum() / d), 4) if d else 0.0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--target", required=True)
    ap.add_argument("--image", required=True)
    a = ap.parse_args()
    print(json.dumps({"copyHF": copy_hf(a.image, a.target)}))
