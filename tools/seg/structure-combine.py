#!/usr/bin/env python3
"""Combine a structure scaffold with uncovered traced facade detail into one drawing file.

python structure-combine.py STRUCTURE-lines.json TRACED-lines.json --out STEM [--per-tile 1] [--tile 96]

The structure plan keeps its silhouette, perspective lines, arches and repeated openings. Its own
ornament marks are replaced by uncovered runs of traced detail. Openings have their own
per-tile budget and preserve a lighter hierarchy; ornament is sparse. Segments are sampled
throughout their length to avoid double tracing across the scaffold. The traced plan can be the
line-quality planner's output or a trace of an image-model pen sketch (option 1). Planning only.
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np


def combine(s, t, *, per_tile=1, opening_per_tile=4, tile=96, clear=3,
            roles=('structure', 'opening', 'ornament')):
    """Keep the scaffold; add uncovered source-supported facade features and sparse texture.

    Coverage is sampled along segments, not just vertices: a two-point path
    crossing an existing arch must not redraw the arch or vanish wholesale.
    Point widths survive resampling; openings keep their own hierarchy.
    """
    from copy import deepcopy
    w, h = s['image']['w'], s['image']['h']
    sx, sy = w/t['image']['w'], h/t['image']['h']
    skeleton = [deepcopy(g) for g in s['lines'] if g.get('tier', g.get('role')) != 'ornament']
    occupied = np.zeros((h, w), np.uint8)
    for g in skeleton:
        cv2.polylines(occupied, [np.rint(g['points']).astype(np.int32).reshape(-1, 1, 2)], False, 1, 1)
    dist = cv2.distanceTransform(1-occupied, cv2.DIST_L2, 3)
    tiles, detail = {}, []
    for g in sorted(t['lines'], key=lambda g: -g.get('length', 0)):
        if g.get('role') not in roles or len(g['points']) < 2:
            continue
        p = np.array(g['points'], np.float32)*[sx, sy]
        cum = np.r_[0, np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]
        if cum[-1] < 5:
            continue
        d = np.linspace(0, cum[-1], max(2, int(np.ceil(cum[-1]))+1))
        dense = np.stack([np.interp(d, cum, p[:, c]) for c in (0, 1)], axis=1)
        widths = np.interp(d, cum, g.get('widths', [1.5]*len(p)))*sx
        weights = np.interp(d, cum, g.get('weights', [g.get('weight', .65)]*len(p)))
        q = np.clip(np.rint(dense).astype(int), 0, [w-1, h-1])
        free = dist[q[:, 1], q[:, 0]] > clear
        changes = np.diff(np.r_[False, free, False].astype(int))
        for a, b in zip(np.where(changes == 1)[0], np.where(changes == -1)[0]):
            if b-a < 6:
                continue
            part = dense[a:b]
            role = 'ornament' if g.get('role') == 'ornament' else 'opening'
            key = (role, *tuple((part.mean(axis=0)//tile).astype(int)))
            limit = per_tile if role == 'ornament' else opening_per_tile
            if tiles.get(key, 0) >= limit:
                continue
            tiles[key] = tiles.get(key, 0)+1
            detail.append(dict(points=np.round(part, 2).tolist(),
                widths=np.round(np.minimum(widths[a:b], 1 if role == 'ornament' else 1.5), 3).tolist(),
                weights=np.round(np.minimum(weights[a:b], .46 if role == 'ornament' else .72), 3).tolist(),
                role=role, tier=role, kind='traced-detail',
                length=float(d[b-1]-d[a]), weight=.46 if role == 'ornament' else .72))
    return dict(s, source='structure skeleton + uncovered facade detail (planning only)', lines=skeleton+detail,
        combined=dict(skeleton=len(skeleton), detail=len(detail), perTile=per_tile,
                      openingPerTile=opening_per_tile, tile=tile, clear=clear))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('structure'); ap.add_argument('traced'); ap.add_argument('--out', required=True)
    ap.add_argument('--per-tile', type=int, default=1); ap.add_argument('--tile', type=int, default=96)
    ap.add_argument('--clear', type=float, default=3.0)
    ap.add_argument('--roles', default='structure,opening,ornament', help='traced roles eligible as detail')
    ap.add_argument('--opening-per-tile', type=int, default=4)
    args = ap.parse_args()
    s = json.loads(Path(args.structure).read_text()); t = json.loads(Path(args.traced).read_text())
    doc = combine(s, t, per_tile=args.per_tile, tile=args.tile, clear=args.clear,
                  roles=args.roles.split(','), opening_per_tile=args.opening_per_tile)
    doc['combined'].update(structure=args.structure, traced=args.traced)
    w, h = doc['image']['w'], doc['image']['h']
    stem = Path(args.out); stem.parent.mkdir(parents=True, exist_ok=True)
    Path(str(stem)+'-lines.json').write_text(json.dumps(doc)+'\n')
    geo = np.full((h, w, 3), 255, np.uint8)
    for g in doc['lines']:
        cv2.polylines(geo, [np.rint(g['points']).astype(np.int32).reshape(-1, 1, 2)], False,
                      (25, 25, 25) if g['tier'] != 'ornament' else (60, 140, 60), 1, cv2.LINE_AA)
    cv2.imwrite(str(stem)+'-geometry.png', geo)
    print(json.dumps(doc['combined']))


if __name__ == '__main__':
    main()
