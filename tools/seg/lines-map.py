#!/usr/bin/env python3
"""Carry a line file from the picture it was found in onto the picture it will be drawn on.

  python3 tools/seg/lines-map.py work/lines/beach-photo-lines.json work/lines/beach-photo-to-beach.json \
      --out work/lines/beach-watercolor-photo-lines.json --check work/lines/beach-watercolor-photo-check.jpg

The similarity file is written by hand per pair: "matrix" (OpenCV 2x3, y-down pixels) and "to" (the target's
path and size). A line that leaves the target is cut into the runs that stayed inside, never joined by a chord.
Length is remeasured on the target; strength travels unchanged; the source's minLength is scaled by the
similarity. The output is the format src/crop/lines.mjs reads (tools/paint-plate.mjs --mllines 1
--mllinesfile <base>).
"""
import argparse
import json
import os

import cv2
import numpy as np

# How wide the check sheet is drawn, and how red the lines are on it (BGR).
CHECK_WIDTH = 900
RED = (30, 30, 220)


def load_json(path):
    if not os.path.exists(path):
        raise SystemExit(f'lines-map: no file at {path}')
    try:
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        raise SystemExit(f'lines-map: cannot read {path} ({e})')


def read_mapping(doc, path):
    """The 2x3 similarity and the target's size, validated. Returns (M, (w, h), target_path)."""
    m = doc.get('matrix')
    if not (isinstance(m, list) and len(m) == 2 and all(isinstance(r, list) and len(r) == 3 for r in m)):
        raise SystemExit(f'lines-map: {path} has no 2x3 "matrix"')
    M = np.asarray(m, np.float64)
    if not np.isfinite(M).all():
        raise SystemExit(f'lines-map: {path} has a matrix that is not finite')
    scale = float(np.hypot(M[1, 0], M[0, 0]))
    if scale <= 0:
        raise SystemExit(f'lines-map: {path} has a matrix of zero scale')
    to = doc.get('to') or {}
    w, h = int(to.get('w', 0)), int(to.get('h', 0))
    if w <= 0 or h <= 0:
        raise SystemExit(f'lines-map: {path} has no "to": {{"w", "h"}} for the target')
    return M, (w, h), to.get('image', '')


def read_lines(doc, path):
    lines = doc.get('lines')
    if not isinstance(lines, list):
        raise SystemExit(f'lines-map: {path} has no "lines" array')
    return lines


def arc_length(points):
    if len(points) < 2:
        return 0.0
    p = np.asarray(points, np.float64)
    return float(np.hypot(*(p[1:] - p[:-1]).T).sum())


def map_points(points, M):
    """Every [x, y] carried through the similarity, as floats."""
    p = np.asarray(points, np.float64).reshape(-1, 1, 2)
    return cv2.transform(p, M).reshape(-1, 2)


def runs_inside(mapped, w, h):
    """The runs of consecutive points that landed on the target, longest first in the order they were walked."""
    inside = (mapped[:, 0] >= 0) & (mapped[:, 0] <= w - 1) & (mapped[:, 1] >= 0) & (mapped[:, 1] <= h - 1)
    out, run = [], []
    for point, ok in zip(mapped, inside):
        if ok:
            run.append(point)
        elif run:
            out.append(run)
            run = []
    if run:
        out.append(run)
    return out


def map_lines(lines, M, size, min_length):
    """Every line in target pixels, cut at the frame, short pieces dropped, longest first."""
    w, h = size
    kept, dropped, cut = [], 0, 0
    for g in lines:
        points = g.get('points') or []
        if len(points) < 2:
            dropped += 1
            continue
        pieces = runs_inside(map_points(points, M), w, h)
        if len(pieces) > 1:
            cut += 1
        if not pieces:
            dropped += 1
            continue
        strength = g.get('strength', 0)
        strength = float(strength) if isinstance(strength, (int, float)) else 0.0
        # a line's pen weight and role travel with it, as strength does
        extra = {k: g[k] for k in ('weight', 'role') if k in g}
        for piece in pieces:
            if len(piece) < 2:
                continue
            length = arc_length(piece)
            if length < min_length:
                continue
            kept.append(dict({'points': [[round(float(x), 2), round(float(y), 2)] for x, y in piece],
                              'length': round(length, 2),
                              'strength': round(strength, 4)}, **extra))
    kept.sort(key=lambda g: -g['length'])
    return kept, dropped, cut


def check_sheet(bgr, lines, width=CHECK_WIDTH):
    """The target with the mapped lines over it in red, the one picture that says whether the map is right."""
    h, w = bgr.shape[:2]
    over = bgr.copy()
    thickness = max(1, int(round(min(h, w) / 500.0)))
    for g in lines:
        pts = np.asarray(g['points'], np.float64)
        pts = np.round(pts).astype(np.int32).reshape(-1, 1, 2)
        closed = len(g['points']) > 2 and g['points'][0] == g['points'][-1]
        cv2.polylines(over, [pts], closed, RED, thickness, cv2.LINE_AA)
    scale = min(1.0, width / float(w))
    size = (max(1, int(round(w * scale))), max(1, int(round(h * scale))))
    tile = cv2.resize(over, size, interpolation=cv2.INTER_AREA)
    tile = cv2.copyMakeBorder(tile, 26, 6, 6, 6, cv2.BORDER_CONSTANT, value=(255, 255, 255))
    cv2.putText(tile, f'{len(lines)} mapped polylines', (8, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (20, 20, 20), 1,
                cv2.LINE_AA)
    return tile


def main():
    ap = argparse.ArgumentParser(description="A line file carried onto another picture by a known similarity.")
    ap.add_argument('lines', help='the source line file, <base>-lines.json from tools/seg/lines.py')
    ap.add_argument('mapping', help='the similarity, a JSON file with "matrix" and "to"')
    ap.add_argument('--out', required=True, help='where the mapped line file goes')
    ap.add_argument('--check', default=None, help='where the check sheet goes; omit to skip it')
    ap.add_argument('--target', default=None, help='the target image to draw the check sheet on; default the '
                                                   'mapping\'s "to".image')
    ap.add_argument('--minlength', type=float, default=None, help='shortest line kept, in target pixels; default '
                                                                  'the source file\'s own, at the map\'s scale')
    args = ap.parse_args()

    src_doc = load_json(args.lines)
    map_doc = load_json(args.mapping)
    M, size, target = read_mapping(map_doc, args.mapping)
    lines = read_lines(src_doc, args.lines)
    scale = float(np.hypot(M[1, 0], M[0, 0]))
    min_length = args.minlength if args.minlength is not None else float(src_doc.get('minLength', 12)) * scale

    kept, dropped, cut = map_lines(lines, M, size, min_length)
    if not kept:
        raise SystemExit('lines-map: nothing landed on the target; check the mapping')

    photo = src_doc.get('source') or args.lines
    out_dir = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(out_dir, exist_ok=True)
    with open(args.out, 'w') as f:
        json.dump({'image': {'w': size[0], 'h': size[1]},
                   'source': f'{photo} mapped onto {target or "the target"} by {args.mapping}',
                   'engine': src_doc.get('engine', 'unknown'),
                   'model': src_doc.get('model', 'unknown'),
                   'threshold': src_doc.get('threshold'),
                   'thinning': src_doc.get('thinning'),
                   'epsilon': src_doc.get('epsilon'),
                   'minLength': round(min_length, 2),
                   'spur': src_doc.get('spur'),
                   'mappedFrom': {'lines': args.lines, 'mapping': args.mapping,
                                  'image': src_doc.get('image'), 'scale': round(scale, 6),
                                  'found': map_doc.get('found', ''), 'residual': map_doc.get('residual')},
                   'lines': kept}, f)

    total = sum(g['length'] for g in kept)
    print(f'lines-map: {len(lines)} lines in, {len(kept)} out, {total:.0f} px on the target, longest '
          f'{kept[0]["length"]:.0f} px; {dropped} fell right off, {cut} were cut at the frame; kept over '
          f'{min_length:.1f} px at scale {scale:.4f}', flush=True)

    if args.check:
        image = args.target or target
        if not image:
            raise SystemExit('lines-map: --check needs a target image, from --target or the mapping\'s "to".image')
        bgr = cv2.imread(image, cv2.IMREAD_COLOR)
        if bgr is None:
            raise SystemExit(f'lines-map: cannot read {image}')
        if (bgr.shape[1], bgr.shape[0]) != size:
            raise SystemExit(f'lines-map: {image} is {bgr.shape[1]}x{bgr.shape[0]}, the mapping says '
                             f'{size[0]}x{size[1]}')
        os.makedirs(os.path.dirname(os.path.abspath(args.check)), exist_ok=True)
        cv2.imwrite(args.check, check_sheet(bgr, kept), [int(cv2.IMWRITE_JPEG_QUALITY), 88])
        print(f'lines-map: check sheet at {args.check}', flush=True)


if __name__ == '__main__':
    main()
