#!/usr/bin/env python3
"""Preserve prepared line evidence before painting: observed ink or an explicit learned line map.

Requires numpy/OpenCV. Emits the ordinary drawingfile JSON, a reviewable ink mask,
and stage counts. No learned contour model, semantic budget, joins, or straightening.
"""
import argparse
import hashlib
import json
from pathlib import Path
import importlib.util
import cv2
import numpy as np
from lines import thin, arc_length, prune_spurs

spec = importlib.util.spec_from_file_location('sketch', Path(__file__).with_name('sketch-lines.py'))
sketch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sketch)


def ink_mask(bgr):
    # Require lighter evidence on BOTH sides of a narrow dark mark. A one-sided
    # wash edge is not ink. Connected weak support retains faint continuations.
    grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    grey /= max(.1, float(np.percentile(grey, 98)))
    h, w = grey.shape
    padded = np.pad(grey, 4, mode='edge')
    contrast = np.zeros_like(grey)
    for radius in (1, 2, 3, 4):
        for dx, dy in ((radius, 0), (0, radius), (radius, radius), (radius, -radius)):
            a = padded[4+dy:4+dy+h, 4+dx:4+dx+w]
            b = padded[4-dy:4-dy+h, 4-dx:4-dx+w]
            contrast = np.maximum(contrast, np.minimum(a-grey, b-grey))
    weak = ((contrast > .065) & (grey < .68)).astype('uint8')
    n, labels, stats, _ = cv2.connectedComponentsWithStats(weak, 8)
    strong = np.bincount(labels.ravel(), weights=((contrast > .15) & (grey < .5)).ravel(), minlength=n) > 0
    strong &= stats[:, cv2.CC_STAT_AREA] >= 3
    strong[0] = False
    return strong[labels].astype('uint8'), contrast


def detail_region(confidence, radius=6, quantile=.8):
    """Cells whose map is both busy (mean confidence) and varied (spread) at least as much as the sheet's quantile."""
    k = 2*radius+1
    mean = cv2.blur(confidence, (k, k))
    spread = np.sqrt(np.maximum(0, cv2.blur(confidence*confidence, (k, k))-mean*mean))
    return ((mean >= np.quantile(mean, quantile)) & (spread >= np.quantile(spread, quantile)) & (spread > 1e-6)).astype('uint8')


def line_map_mask(bgr, fine=None, min_area=2):
    # A declared line map encodes confidence, not reflectance. Applying the
    # photographed-ink darkness gate erases its pale but connected architecture.
    # Small components are kept (min_area cells): an eye, a pupil or a dot is a line too.
    # With the fine model's own map, fine marks above .28 inside the busy detail regions join the mask,
    # since the fused map is damped where the coarse model sees no structure.
    confidence = 1-cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)/255
    weak = (confidence > .08).astype('uint8')
    n, labels, stats, _ = cv2.connectedComponentsWithStats(weak, 8)
    strong = np.bincount(labels.ravel(), weights=(confidence > .22).ravel(), minlength=n) > 0
    strong &= stats[:, cv2.CC_STAT_AREA] >= min_area
    strong[0] = False
    mask = strong[labels].astype('uint8')
    if fine is not None:
        peaks = ((fine > .28) & (detail_region(confidence) > 0)).astype('uint8')
        n, labels, stats, _ = cv2.connectedComponentsWithStats(peaks, 8)
        keep = stats[:, cv2.CC_STAT_AREA] >= min_area
        keep[0] = False
        mask |= keep[labels].astype('uint8')
    return mask, confidence


# a contour this long (cells of a 1080 px wide map, about 8 mm on a 152 mm sheet) is structure, not detail
LONG_CELLS = 57


def plan(bgr, kind='ink', map_tolerance=.25, fine=None):
    if not np.isfinite(map_tolerance) or not 0 <= map_tolerance <= 2:
        raise ValueError('map tolerance must be finite and between 0 and 2 cells')
    mask, contrast = line_map_mask(bgr, fine) if kind == 'line-map' else ink_mask(bgr)
    skeleton, _ = thin(mask)
    if kind == 'line-map':
        # a stub off a fork cuts a line in two; a standalone short mark is not a stub and stays
        skeleton, _ = prune_spurs(skeleton, 2)
    paths = sketch.trace(skeleton, min_points=2, window=3 if kind == 'line-map' else 5)
    q_scale = bgr.shape[1]/1080
    distance = cv2.distanceTransform(mask, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
    lines = []
    for p in paths:
        # Observed ink keeps the quarter-cell bound. Declared maps can opt into
        # a larger planning bound; this never joins neighboring paths.
        tolerance = map_tolerance if kind == 'line-map' else .25
        q = cv2.approxPolyDP(p.reshape(-1, 1, 2), tolerance, False).reshape(-1, 2)
        # Simplification is a geometry tool, not a selection budget. A tiny ring
        # or hook must not disappear just because its span is below tolerance.
        if len(q) < 2 or (np.array_equal(p[0], p[-1]) and len(q) < 4):
            q = p
        if np.array_equal(p[0], p[-1]) and not np.array_equal(q[0], q[-1]):
            q = np.vstack([q, q[0]])
        if len(q) < 2:
            continue
        q = sketch.samples(q, 1)
        widths = np.maximum(.5, 2*sketch.at(distance, q)-1)
        # A model's broad confidence corridor is not an observed broad nib.
        # Preserve its centerline and relative emphasis, with restrained pen widths.
        weights = np.ones(len(q))
        if kind == 'line-map':
            widths = np.clip(np.sqrt(widths), .7, 2.4)
            weights = .55 + .45*np.clip(sketch.at(contrast, q), 0, 1)
        lines.append({'points': np.round(q, 3).tolist(),
                      'widths': np.round(widths, 3).tolist(),
                      'weights': np.round(weights, 3).tolist(), 'weight': float(np.mean(weights)), 'role': 'map contour' if kind == 'line-map' else 'observed ink',
                      'length': arc_length(q),
                      # a line map's long contours are the outlines and structure, drawn first (tier 1); the rest are detail (tier 2)
                      **({'tier': 1 if arc_length(q) >= LONG_CELLS * q_scale else 2} if kind == 'line-map' else {})})
    return lines, mask, skeleton, {'inkPixels': int(mask.sum()),
        'skeletonPixels': int(skeleton.sum()), 'tracedPaths': len(paths),
        'selectedPaths': len(lines), 'joins': 0, 'budgetDrops': 0,
        'simplificationTolerance': map_tolerance if kind == 'line-map' else .25}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('image'); ap.add_argument('--out', required=True)
    ap.add_argument('--width', type=int, default=1080)
    ap.add_argument('--kind', choices=['ink', 'line-map'], default='ink', help='line-map is explicit pre-paint model evidence, never a photograph')
    ap.add_argument('--map-tolerance', type=float, default=None,
                    help='explicit line-map simplification bound in planning cells (0–2), default .15; observed ink stays at .25')
    ap.add_argument('--fine', help="the fine model's own map (dark on white): its marks above .28 in busy detail regions join a line map")
    args = ap.parse_args()
    bgr = cv2.imread(args.image)
    if bgr is None or args.width < 64:
        ap.error('readable image and width >=64 required')
    H, W = bgr.shape[:2]
    w = args.width; h = round(H*w/W)
    bgr = cv2.resize(bgr, (w, h), interpolation=cv2.INTER_AREA)
    tolerance = .15 if args.map_tolerance is None else args.map_tolerance
    if not np.isfinite(tolerance) or not 0 <= tolerance <= 2:
        ap.error('--map-tolerance must be finite and between 0 and 2')
    fine = None
    if args.fine:
        if args.kind != 'line-map':
            ap.error('--fine goes with --kind line-map')
        grey = cv2.imread(args.fine, cv2.IMREAD_GRAYSCALE)
        if grey is None:
            ap.error('cannot read '+args.fine)
        fine = 1-cv2.resize(grey, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32)/255
    lines, mask, skeleton, stats = plan(bgr, args.kind, tolerance, fine)
    stem = Path(args.out); stem.parent.mkdir(parents=True, exist_ok=True)
    doc = {'source': 'copy-lines: '+('prepared learned line map' if args.kind == 'line-map' else 'observed source ink')+', pre-paint only',
           'inputKind': args.kind,
           'widthPolicy': 'sqrt evidence width, bounded .7–2.4 cells; confidence controls feed' if args.kind == 'line-map' else 'observed optical width',
           'image': {'w': w, 'h': h}, 'targetSHA256': hashlib.sha256(Path(args.image).read_bytes()).hexdigest(),
           'stats': stats, 'lines': lines}
    Path(str(stem)+'-lines.json').write_text(json.dumps(doc)+'\n')
    cv2.imwrite(str(stem)+'-ink.png', (1-mask)*255)
    cv2.imwrite(str(stem)+'-skeleton.png', (1-skeleton)*255)
    # which skeleton thinning ran (lines.py thin: cv2.ximgproc, skimage or zhang-suen); traced paths depend on it
    print(json.dumps({**stats, 'thinning': thin(np.zeros((3, 3), np.uint8))[1]}))


if __name__ == '__main__':
    main()
