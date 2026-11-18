#!/usr/bin/env python3
"""Perspective structure of an image, for the linework gate (src/paint/methods/line-gate.mjs).

python perspective.py IMAGE [--width 540] [--seed 0]

Prints JSON {"vanishingPoints": n, "share": s, "segments": k}: LSD segments and greedy RANSAC vanishing points
on bilateral-smoothed grey. `share` is the length of the long segments that converge on a found point over the
length of all long segments. Built scenes (facades, streets, gates, interiors) find two or three points; faces,
animals, water and foliage none. Planning only. Needs numpy and opencv-python.
"""
import argparse
import json

import cv2
import numpy as np


def detect_segments(grey, scales=(1.0, .5)):
    lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
    out = []
    for s in scales:
        img = grey if s == 1 else cv2.resize(grey, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        u8 = np.uint8(np.clip(cv2.GaussianBlur(img, (0, 0), .8)*255, 0, 255))
        lines = lsd.detect(u8)[0]
        if lines is not None:
            out.append(lines.reshape(-1, 4)/s)
    return np.concatenate(out) if out else np.zeros((0, 4), np.float32)


def _lines(segs):
    p1 = np.c_[segs[:, :2], np.ones(len(segs))]
    p2 = np.c_[segs[:, 2:], np.ones(len(segs))]
    L = np.cross(p1, p2)
    return L/np.maximum(np.linalg.norm(L[:, :2], axis=1, keepdims=True), 1e-9)


def angle_error(segs, v):
    mid = (segs[:, :2]+segs[:, 2:])/2
    d = segs[:, 2:]-segs[:, :2]
    r = np.broadcast_to(v[:2], mid.shape) if abs(v[2]) < 1e-9 else v[:2]/v[2]-mid
    cos = np.abs(np.sum(d*r, axis=1))/np.maximum(np.linalg.norm(d, axis=1)*np.linalg.norm(r, axis=1), 1e-9)
    return np.arccos(np.clip(cos, 0, 1))


def _refine(segs, weights):
    L = _lines(segs)*np.sqrt(weights)[:, None]
    _, _, vt = np.linalg.svd(L, full_matrices=False)
    return vt[-1]


def vanishing_points(segs, short_side, max_vps=3, tolerance_deg=1.5, seed=0, iterations=1500):
    rng = np.random.default_rng(seed)
    length = np.linalg.norm(segs[:, 2:]-segs[:, :2], axis=1)
    keep = length >= short_side*.02
    tol = np.radians(tolerance_deg)
    remaining = keep.copy()
    found = []
    total = float(length[keep].sum()) or 1.0
    lines = _lines(segs)
    for _ in range(max_vps):
        idx = np.nonzero(remaining)[0]
        if len(idx) < 6:
            break
        p = length[idx]/length[idx].sum()
        best, best_score = None, 0.0
        for _ in range(iterations):
            i, j = rng.choice(idx, 2, replace=False, p=p)
            v = np.cross(lines[i], lines[j])
            n = np.linalg.norm(v)
            if n < 1e-12:
                continue
            v = v/n
            err = angle_error(segs[idx], v)
            score = float(np.sum(length[idx]*np.clip(1-err/tol, 0, 1)))
            if score > best_score:
                best, best_score = v, score
        if best is None:
            break
        inl = remaining & (angle_error(segs, best) < tol)
        if length[inl].sum()/total < .06:
            break
        v = _refine(segs[inl], length[inl])
        if np.sum(length[remaining & (angle_error(segs, v) < tol)]) < length[inl].sum()*.9:
            v = best
        inl = remaining & (angle_error(segs, v) < tol)
        found.append((v, inl))
        remaining &= ~inl
    return found


def measure(bgr, seed=0):
    grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)/255
    smooth = cv2.bilateralFilter(np.uint8(grey*255), 7, 30, 5).astype(np.float32)/255
    h, w = grey.shape
    short = min(h, w)
    segs = detect_segments(smooth)
    if len(segs) == 0:
        return {"vanishingPoints": 0, "share": 0.0, "segments": 0}
    vps = vanishing_points(segs, short, seed=seed)
    length = np.linalg.norm(segs[:, 2:]-segs[:, :2], axis=1)
    keep = length >= short*.02
    total = float(length[keep].sum())
    explained = float(sum(length[inl & keep].sum() for _, inl in vps))
    return {"vanishingPoints": len(vps), "share": round(explained/total, 4) if total else 0.0, "segments": int(keep.sum())}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image")
    ap.add_argument("--width", type=int, default=540)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    bgr = cv2.imread(args.image)
    if bgr is None or args.width < 64:
        ap.error("a readable image and --width of 64 or more")
    H, W = bgr.shape[:2]
    w = args.width
    h = round(H*w/W)
    bgr = cv2.resize(bgr, (w, h), interpolation=cv2.INTER_AREA if w < W else cv2.INTER_CUBIC)
    print(json.dumps(measure(bgr, args.seed)))


if __name__ == "__main__":
    main()
