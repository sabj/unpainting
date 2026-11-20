#!/usr/bin/env python3
# Pipeline: inking, stage 3c (a window of a drawing's vector strokes, for a crop of the plate).
"""The vector strokes (and their ordered line file) of a window of the sheet: the same strokes, clipped to the window and
moved to its corner, never traced again. A crop render gives the painter the result as its --drawingfile, so the crop's pen
lays exactly the strokes the whole plate lays there, rendered at the crop's own resolution.

usage: vectors-crop.py STEM X Y W H --out OUTSTEM [--image PX]
  STEM: the subject's prepared drawing (STEM-lines.json and STEM-vectors.json); X Y W H: the window in sheet mm;
  --image PX: the crop subject's width in pixels (the line file's grid; default the drawing's own scale)."""
import argparse, json, math
import numpy as np


def clip_ring(ring, x0, y0, x1, y1):
    """Sutherland-Hodgman: a closed ring clipped to the rectangle (filled even-odd, a concave ring clips correctly)."""
    pts = ring
    for inside, cut in ((lambda p: p[0] >= x0, lambda a, b: (x0, a[1] + (x0 - a[0]) * (b[1] - a[1]) / (b[0] - a[0]))),
                        (lambda p: p[0] <= x1, lambda a, b: (x1, a[1] + (x1 - a[0]) * (b[1] - a[1]) / (b[0] - a[0]))),
                        (lambda p: p[1] >= y0, lambda a, b: (a[0] + (y0 - a[1]) * (b[0] - a[0]) / (b[1] - a[1]), y0)),
                        (lambda p: p[1] <= y1, lambda a, b: (a[0] + (y1 - a[1]) * (b[0] - a[0]) / (b[1] - a[1]), y1))):
        out = []
        for k in range(len(pts)):
            a, b = pts[k - 1], pts[k]
            if inside(b):
                if not inside(a): out.append(cut(a, b))
                out.append(b)
            elif inside(a): out.append(cut(a, b))
        pts = out
        if not pts: return []
    return pts


def clip_segment(a, b, x0, y0, x1, y1):
    """Liang-Barsky: the part of segment a-b inside the rectangle, or None."""
    t0, t1, dx, dy = 0.0, 1.0, b[0] - a[0], b[1] - a[1]
    for p, q in ((-dx, a[0] - x0), (dx, x1 - a[0]), (-dy, a[1] - y0), (dy, y1 - a[1])):
        if p == 0:
            if q < 0: return None
        else:
            r = q / p
            if p < 0: t0 = max(t0, r)
            else: t1 = min(t1, r)
    if t0 > t1: return None
    return (a[0] + t0 * dx, a[1] + t0 * dy), (a[0] + t1 * dx, a[1] + t1 * dy), t1 < 1.0


def clip_path(P, x0, y0, x1, y1):
    """The pieces of a polyline inside the rectangle, each cut where it crosses the edge."""
    pieces, cur = [], []
    for a, b in zip(P, P[1:]):
        c = clip_segment(tuple(a), tuple(b), x0, y0, x1, y1)
        if c is None:
            if cur: pieces.append(cur); cur = []
            continue
        p, q, leaves = c
        if not cur or math.dist(cur[-1], p) > 1e-9:
            if cur: pieces.append(cur)
            cur = [p]
        cur.append(q)
        if leaves: pieces.append(cur); cur = []
    if cur: pieces.append(cur)
    return [c for c in pieces if len(c) >= 2]


def crop(stem, X, Y, W, H, image_px=None):
    vec = json.load(open(stem + '-vectors.json')); lines = json.load(open(stem + '-lines.json'))
    x0, y0, x1, y1 = X, Y, X + W, Y + H; sh = lambda p: [round(p[0] - X, 3), round(p[1] - Y, 3)]
    strokes = []
    for s in vec['strokes']:
        rings = [r for r in (clip_ring([tuple(p) for p in r], x0, y0, x1, y1) for r in s['outline']) if len(r) >= 3]
        if not rings: continue
        P = clip_path(s['path'], x0, y0, x1, y1)
        path = max(P, key=len) if P else [rings[0][0], rings[0][len(rings[0]) // 2]]
        strokes.append({**s, 'outline': [[sh(p) for p in r] for r in rings], 'path': [sh(p) for p in path], 'widths': [s['widths'][0]] * len(path) if s.get('widths') else []})
    v = {**vec, 'sheetMm': W, 'heightMm': H, 'window': [X, Y, W, H], 'source': vec.get('source', '') + f'; window {X} {Y} {W} {H} mm (vectors-crop.py)', 'strokes': strokes}
    # the line file on the crop's own grid: the drawing's pixels -> mm -> the crop's pixels
    w0 = lines['image']['w']; mm0 = vec['sheetMm'] / w0; px = (image_px or round(W / mm0)) / W
    L = []
    for l in lines['lines']:
        P = [((x + .5) * mm0, (y + .5) * mm0) for x, y in l['points']]
        for piece in clip_path(P, x0, y0, x1, y1):
            q = [[round((a - X) * px - .5, 3), round((b - Y) * px - .5, 3)] for a, b in piece]
            L.append({k: v_ for k, v_ in l.items() if k not in ('widths', 'weights')} | {'points': q, 'width': l['width'] * px * mm0, 'length': sum(math.dist(q[i - 1], q[i]) for i in range(1, len(q)))})
    ln = {**lines, 'image': {'w': round(W * px), 'h': round(H * px)}, 'lines': L, 'source': lines.get('source', '') + f'; window {X} {Y} {W} {H} mm (vectors-crop.py)'}
    return v, ln


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('stem'); ap.add_argument('box', nargs=4, type=float); ap.add_argument('--out', required=True); ap.add_argument('--image', type=int)
    a = ap.parse_args(); v, ln = crop(a.stem, *a.box, image_px=a.image)
    json.dump(v, open(a.out + '-vectors.json', 'w'), separators=(',', ':')); json.dump(ln, open(a.out + '-lines.json', 'w'), separators=(',', ':'))
    print(json.dumps({'strokes': len(v['strokes']), 'lines': len(ln['lines']), 'out': a.out}))


if __name__ == '__main__':
    main()
