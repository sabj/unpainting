#!/usr/bin/env python3
"""Perspective structure of an image, for the linework gate (src/paint/methods/line-gate.mjs).

python perspective.py IMAGE [--width 540] [--seed 0]

Prints JSON {"vanishingPoints": n, "share": s, "segments": k}: LSD segments and greedy RANSAC vanishing points, the
construction structure-lines.py uses (structure/perspective.py), on the same bilateral-smoothed grey. `share` is the
length of the long segments that converge on a found point over the length of all long segments. Built scenes
(facades, streets, gates, interiors) find two or three points; faces, animals, water and foliage none.
Planning only. Needs numpy and opencv-python.
"""
import argparse
import json

import cv2
import numpy as np

from structure.perspective import detect_segments, vanishing_points


def measure(bgr, seed=0):
    grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)/255
    smooth = cv2.bilateralFilter(np.uint8(grey*255), 7, 30, 5).astype(np.float32)/255
    h, w = grey.shape
    short = min(h, w)
    segs = detect_segments(smooth)
    if len(segs) == 0:
        return {'vanishingPoints': 0, 'share': 0.0, 'segments': 0}
    vps = vanishing_points(segs, short, seed=seed)
    length = np.linalg.norm(segs[:, 2:]-segs[:, :2], axis=1)
    keep = length >= short*.02
    total = float(length[keep].sum())
    explained = float(sum(length[inl & keep].sum() for _, inl in vps))
    return {'vanishingPoints': len(vps), 'share': round(explained/total, 4) if total else 0.0, 'segments': int(keep.sum())}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('image')
    ap.add_argument('--width', type=int, default=540)
    ap.add_argument('--seed', type=int, default=0)
    args = ap.parse_args()
    bgr = cv2.imread(args.image)
    if bgr is None or args.width < 64:
        ap.error('a readable image and --width of 64 or more')
    H, W = bgr.shape[:2]
    w = args.width
    h = round(H*w/W)
    bgr = cv2.resize(bgr, (w, h), interpolation=cv2.INTER_AREA if w < W else cv2.INTER_CUBIC)
    print(json.dumps(measure(bgr, args.seed)))


if __name__ == '__main__':
    main()
