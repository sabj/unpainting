#!/usr/bin/env python3
"""Plan an architectural pen drawing from its structure, the way an urban sketcher builds one.

python structure-lines.py IMAGE --out STEM [--width 1080] [--seed 0]

Perspective lines are snapped to detected vanishing points and merged into long strokes; arches
are fitted arcs; repeated openings and columns become one regular unit repeated; fine texture gets
a few loose marks from a small library. Planning only: it reads the image once, before painting,
and writes STEM-lines.json in the ordinary --drawingfile format (per-point widths and weights,
roles structure/opening/ornament), plus STEM-geometry.png and STEM-debug.png previews.
Needs numpy and opencv-python.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np

from structure.compose import TIERS, plan

COLOURS = {'silhouette': (0, 0, 0), 'structure': (30, 30, 30), 'secondary': (90, 90, 90),
           'opening': (40, 90, 200), 'ornament': (60, 150, 60)}
HERE = Path(__file__).resolve().parent


def planner_commit():
    """The planner's git commit, with -dirty when its own files have uncommitted edits."""
    try:
        sha = subprocess.run(['git', '-C', str(HERE), 'rev-parse', '--short', 'HEAD'],
                             capture_output=True, text=True, check=True).stdout.strip()
        dirty = subprocess.run(['git', '-C', str(HERE), 'status', '--porcelain', '--', 'structure-lines.py', 'structure'],
                               capture_output=True, text=True).stdout.strip()
        return sha+('-dirty' if dirty else '')
    except (OSError, subprocess.CalledProcessError):
        return 'unknown'


def previews(stem, bgr, lines):
    h, w = bgr.shape[:2]
    geo = np.full((h, w, 3), 255, np.uint8)
    dbg = cv2.addWeighted(bgr, .35, np.full_like(bgr, 255), .65, 0)
    for g in lines:
        p = np.rint(np.array(g['points'])).astype(np.int32).reshape(-1, 1, 2)
        t = max(1, int(round(TIERS[g['tier']][0]*.6)))
        cv2.polylines(geo, [p], False, (25, 25, 25), t, cv2.LINE_AA)
        cv2.polylines(dbg, [p], False, COLOURS[g['tier']], t, cv2.LINE_AA)
    cv2.imwrite(str(stem)+'-geometry.png', geo)
    cv2.imwrite(str(stem)+'-debug.png', dbg)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('image'); ap.add_argument('--out', required=True)
    ap.add_argument('--width', type=int, default=1080)
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--options', default='{}', help='JSON overrides of structure.compose.DEFAULTS')
    args = ap.parse_args()
    if args.width < 64:
        ap.error('--width must be at least 64')
    bgr = cv2.imread(args.image)
    if bgr is None:
        ap.error('cannot read image')
    try:
        options = json.loads(args.options)
    except json.JSONDecodeError as e:
        ap.error(f'--options is not JSON: {e}')
    H, W = bgr.shape[:2]; w = args.width; h = round(H*w/W)
    bgr = cv2.resize(bgr, (w, h), interpolation=cv2.INTER_AREA if w < W else cv2.INTER_CUBIC)
    lines, stats = plan(bgr, seed=args.seed, options=options)
    stem = Path(args.out); stem.parent.mkdir(parents=True, exist_ok=True)
    doc = {'source': 'structure-lines planning only', 'model': 'none (LSD, vanishing points, arc fits, mark library)',
           'image': {'w': w, 'h': h}, 'seed': args.seed, 'options': options, 'planner': planner_commit(),
           'targetSHA256': hashlib.sha256(Path(args.image).read_bytes()).hexdigest(),
           'stats': stats, 'lines': lines}
    Path(str(stem)+'-lines.json').write_text(json.dumps(doc)+'\n')
    previews(stem, bgr, lines)
    print(json.dumps(stats))


if __name__ == '__main__':
    main()
