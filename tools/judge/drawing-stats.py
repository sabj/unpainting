#!/usr/bin/env python3
"""Measure a dry drawing scan. Requires NumPy and OpenCV, no network or model.

Raster paths split at crossings. They are not the artist's original strokes.
Open endpoints, hatching and corner overrun are screening proxies, not truth.
Paper age and washes can affect every measurement. Compare scans visually too.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'seg'))
from lines import thin, arc_length
from importlib.util import spec_from_file_location, module_from_spec

spec = spec_from_file_location('drawing_trace', Path(__file__).resolve().parents[1] / 'seg' / 'sketch-lines.py')
tracer = module_from_spec(spec)
spec.loader.exec_module(tracer)


def distribution(values):
    a = np.asarray(values, dtype=float)
    if not a.size:
        return {'n': 0, 'p10': None, 'median': None, 'p90': None, 'cv': None}
    return {'n': int(a.size), 'p10': float(np.percentile(a, 10)),
            'median': float(np.median(a)), 'p90': float(np.percentile(a, 90)),
            'cv': float(a.std() / a.mean()) if a.mean() > 0 else 0}


def corner_overrun(runs):
    """Short continuation beyond a near-right-angle meeting of straight runs.

    Cross-hatching and broken contours can produce false meetings. A scan does
    not identify intended corners, so this never acts as an acceptance gate.
    """
    values = []
    for i, a in enumerate(runs):
        p, r = a[:2], a[2:] - a[:2]
        lr = np.linalg.norm(r)
        for b in runs[i + 1:]:
            q, s = b[:2], b[2:] - b[:2]
            ls = np.linalg.norm(s)
            if min(lr, ls) < 8 or abs(np.dot(r, s) / (lr * ls)) > .5:
                continue
            cross = r[0]*s[1] - r[1]*s[0]
            if abs(cross) < 1e-6:
                continue
            v = q - p
            t = (v[0]*s[1] - v[1]*s[0]) / cross
            u = (v[0]*r[1] - v[1]*r[0]) / cross
            if not (0 <= t <= 1 and 0 <= u <= 1):
                continue
            da, db = min(t, 1-t)*lr, min(u, 1-u)*ls
            if min(da, db) <= 3 and max(da, db) <= 8:
                values.append(max(da, db))
    return distribution(values)


def measure(bgr, *, long_edge=1000, sheet_mm=152.4, ridge_cut=.045):
    original = bgr.shape[:2]
    scale = long_edge / max(original)
    bgr = cv2.resize(bgr, (max(1, round(original[1]*scale)), max(1, round(original[0]*scale))),
                     interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)/255
    paper = max(.1, float(np.percentile(gray, 98)))
    gray = np.clip(gray/paper, 0, 1)
    tone = 1-gray
    # Local contrast keeps narrow lines out of broad wash and pencil masses.
    contrast = cv2.GaussianBlur(gray, (0, 0), 3)-gray
    mask = ((contrast >= ridge_cut) & (tone >= .07)).astype(np.uint8)
    skeleton, _ = thin(mask)
    skeleton = skeleton.astype(np.uint8)
    degree = cv2.filter2D(skeleton, cv2.CV_16S, np.ones((3, 3), np.int16), borderType=cv2.BORDER_CONSTANT)-skeleton
    endpoints = int(np.count_nonzero((skeleton > 0) & (degree == 1)))
    junctions = ((skeleton > 0) & (degree >= 3)).astype(np.uint8)
    junction_count = cv2.connectedComponents(junctions, 8)[0]-1
    paths = tracer.trace(skeleton, min_points=2)
    lengths = [arc_length(p) for p in paths]
    dist = cv2.distanceTransform(mask, cv2.DIST_L2, 3)
    widths = 2*dist[skeleton > 0]
    densities = -np.log(np.maximum(.01, gray[skeleton > 0]))
    h, w = gray.shape
    mm_per_px = sheet_mm/w
    area_mm2 = sheet_mm*(h*mm_per_px)
    mp = gray.size/1e6
    hough = cv2.HoughLinesP(skeleton, 1, np.pi/180, threshold=12, minLineLength=8, maxLineGap=2)
    runs = np.empty((0, 4)) if hough is None else hough.reshape(-1, 4).astype(float)
    # Fixed deterministic subset bounds the quadratic corner screening cost.
    corner_runs = runs[np.linspace(0, len(runs)-1, min(300, len(runs))).astype(int)] if len(runs) else runs
    local_value = cv2.GaussianBlur(tone, (0, 0), 24)
    bands = [(0, .08), (.08, .25), (.25, 1.01)]
    hatch = {}
    for name, (lo, hi) in zip(('light', 'middle', 'dark'), bands):
        region = (local_value >= lo) & (local_value < hi)
        hatch[name] = {'areaShare': float(region.mean()),
                       'lineAreaShare': float(mask[region].mean()) if region.any() else None,
                       'skeletonPxPer1000Px': float(skeleton[region].mean()*1000) if region.any() else None}
    width_tone_corr = None
    if len(widths) > 2 and widths.std() > 1e-6 and densities.std() > 1e-6:
        width_tone_corr = float(np.corrcoef(widths, densities)[0, 1])
    dark = tone > .12
    tooth_residual = gray-cv2.GaussianBlur(gray, (0, 0), 1)
    return {'version': 'dry-drawing-raster-v1', 'originalPixels': [original[1], original[0]],
            'analysisPixels': [w, h], 'normalizedLongEdge': long_edge,
            'displaySheetWidthMm': sheet_mm, 'ridgeCut': ridge_cut,
            'pathFragments': len(paths), 'pathFragmentsPerMegapixel': len(paths)/mp,
            'pathFragmentsPerCm2': len(paths)/(area_mm2/100),
            'skeletonPxPerMegapixel': float(skeleton.sum()/mp),
            'straightRunsPerMegapixel': len(runs)/mp,
            'darkAreaShare': float(dark.mean()), 'lineAreaShare': float(mask.mean()),
            'weightPx': distribution(widths), 'weightMmAtDisplaySize': distribution(widths*mm_per_px),
            'pathLengthPx': distribution(lengths), 'pathLengthMmAtDisplaySize': distribution(np.array(lengths)*mm_per_px),
            'endpoints': endpoints, 'junctionClusters': junction_count,
            'openEndpointProxy': endpoints/max(1, endpoints+2*junction_count),
            'hatchingByLocalValueProxy': hatch, 'cornerOverrunPxProxy': corner_overrun(corner_runs),
            'lineOpticalDensity': distribution(densities), 'widthToneCorrelationProxy': width_tone_corr,
            'toneShare': {'light': float(((tone > .04) & (tone <= .12)).mean()),
                          'middle': float(((tone > .12) & (tone <= .35)).mean()),
                          'dark': float((tone > .35).mean())},
            'toothResidualSdInDark': float(tooth_residual[dark].std()) if dark.any() else None,
            'limitations': ['Raster fragments are split by crossings and may include scan texture.',
                            'Open endpoints are not a measured share of intended edges omitted.',
                            'Local value bins do not identify semantic shadow or true hatching.',
                            'Corner overrun is ambiguous at intersections and is diagnostic only.',
                            'Tone and width are pressure proxies; physical pressure and sheen cannot be recovered from a scan.',
                            'Millimetres use a common display width, not the original reference sheet size.']}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('images', nargs='+', type=Path)
    ap.add_argument('--out', required=True, type=Path, help='JSONL measurement records')
    ap.add_argument('--long-edge', type=int, default=1000)
    ap.add_argument('--sheetmm', type=float, default=152.4)
    ap.add_argument('--ridge-cut', type=float, default=.045)
    args = ap.parse_args()
    if args.long_edge < 32 or args.sheetmm <= 0 or not 0 < args.ridge_cut < 1:
        ap.error('invalid analysis scale or ridge threshold')
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('w') as output:
        for path in args.images:
            img = cv2.imread(str(path))
            if img is None:
                ap.error(f'cannot read {path}')
            row = measure(img, long_edge=args.long_edge, sheet_mm=args.sheetmm, ridge_cut=args.ridge_cut)
            row.update(file=str(path), sha256=hashlib.sha256(path.read_bytes()).hexdigest())
            output.write(json.dumps(row)+'\n')
            output.flush()
            print(path.name, row['pathFragments'], 'fragments', flush=True)


if __name__ == '__main__':
    main()
