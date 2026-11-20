#!/usr/bin/env python3
# Pipeline: inking, stage 1 (line source: trace a lineart map, or the target's own ink as the fallback).
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
# the widest break in a line that is bridged when both ends point along it and the evidence carries on between them
JOIN_GAP = 7


def stroke_mask(bgr, pxmm=152.4/1080, rmm=.5, gate=None, lo_frac=.5, close=0, ink_colour=0):
    """The source's own pen strokes: dark marks narrower than 2 x rmm against whatever is around them.

    A black top-hat (closing minus image) with a disc of radius rmm answers to a stroke of any width up to the disc and
    not to a wash mass or its edge, which the closing does not fill. Thresholds follow the image: the strong level is
    half the 99th percentile of the response (at least .14), connected weak support at half of that. With `gate` (a
    lineart map's confidence), a stroke is kept only where the map also sees a line: it drops watercolour texture.
    """
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)/255
    g /= max(.1, float(np.percentile(g, 98)))
    r = max(2, int(round(rmm/pxmm)))
    bh = cv2.morphologyEx(g, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*r+1, 2*r+1))) - g
    hi = max(.14, .5*float(np.percentile(bh, 99))); lo = lo_frac*hi
    n, labels, stats, _ = cv2.connectedComponentsWithStats((bh > lo).astype('uint8'), 8)
    strong = np.bincount(labels.ravel(), weights=(bh > hi).ravel(), minlength=n) > 0
    strong &= stats[:, cv2.CC_STAT_AREA] >= 4
    strong[0] = False
    mask = strong[labels].astype('uint8')
    if ink_colour > 0:
        # the source's pen ink has one colour: that of its strongest strokes. A mark of another colour (an ochre or blue
        # wash's dark edge, coloured texture) is not pen line. For a black or grey ink a stroke must be near neutral (chroma
        # under ink_colour + 4) or less coloured than the wash around it; for a coloured ink (a bistre, a sepia) its hue must be within 3 x ink_colour degrees of the
        # ink's, at any strength. Near black always passes. A stroke is kept when most of it passes.
        lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
        Lc, A, B = lab[..., 0]*100/255, lab[..., 1]-128, lab[..., 2]-128
        core = bh > np.percentile(bh, 99.5)
        a0, b0 = float(np.median(A[core])), float(np.median(B[core]))
        chroma = np.hypot(A, B)
        if np.hypot(a0, b0) < 8:
            # a black line drawn over a coloured wash takes some of the wash's colour, but less than the wash around it has
            around = cv2.GaussianBlur(chroma, (0, 0), max(2, 1/pxmm))
            inky = (chroma < ink_colour + 4) | (chroma < .8*around)
        else:
            dh = np.abs((np.degrees(np.arctan2(B, A) - np.arctan2(b0, a0)) + 180) % 360 - 180)
            inky = (dh < 3*ink_colour) | (chroma < 4)
        inky = (inky | (Lc < 25)).astype(np.float32)
        n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
        keep = np.bincount(labels.ravel(), weights=inky.ravel(), minlength=n)/np.maximum(1, stats[:, cv2.CC_STAT_AREA]) > .6
        keep[0] = False
        mask = keep[labels].astype('uint8')
    if close > 1:
        # bridge the pixel breaks a dry pen leaves along a stroke, so one stroke is traced as one line
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close, close)))
    if gate is not None:
        near = cv2.dilate((gate > .12).astype('uint8'), np.ones((5, 5), np.uint8))
        n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
        keep = np.bincount(labels.ravel(), weights=near.ravel(), minlength=n)/np.maximum(1, stats[:, cv2.CC_STAT_AREA]) > .5
        keep[0] = False
        mask = keep[labels].astype('uint8')
    return mask, np.clip(bh/max(1e-6, 2*hi), 0, 1)


# --kind ridge: the subject's own pen lines. All sizes are millimetres of a 152.4 mm wide sheet and steps are L*.
RIDGE_LENGTH_MM = 1.0             # a pen line is long for its width: it must show at both ends of a window this long
RIDGE_SIDES_MM = (.2, .35, .55, .85)   # where the tone beside a line is read, either side of its centre
RIDGE_WEAK_L, RIDGE_STRONG_L = 3, 8   # darker than both sides by this much: carried on from a sure line, and a sure line
RIDGE_SCORE = 30                  # a kept line's step times its length, L* mm (a 10 L* line of 3 mm)
RIDGE_SHORT_MM = 4                # under this a line must also be straight: a short crooked piece is wash texture
RIDGE_STRAIGHT = .9               # chord over length of a short line
RIDGE_JOIN_MM = .8                # the widest break joined where both ends point along it
RIDGE_WIDTH_MM = (.08, 1.0)       # a pen line's width


def _segment(theta, length, across=0., along=0.):
    """A unit-sum antialiased segment `length` px long at angle theta, moved `across` px along its normal and `along` px along itself."""
    R = int(np.ceil(length/2+abs(across)+abs(along)))+2
    k = np.zeros((2*R+1, 2*R+1), np.float32)
    d = np.array([np.cos(theta), np.sin(theta)]); n = np.array([-d[1], d[0]])
    c = np.array([R, R])+across*n+along*d
    a, b = c-d*length/2, c+d*length/2
    cv2.line(k, tuple(int(v) for v in np.round(a*16)), tuple(int(v) for v in np.round(b*16)), 1., 1, cv2.LINE_AA, 4)
    return k/k.sum()


def ridge_response(L, pxmm):
    """Where a thin dark line runs, and by how much.

    For each direction, the tone along a short segment is compared with the tone along the same segment moved to either
    side; the smaller of the two differences is how much darker the line is than BOTH its sides (a wash edge has one
    lighter side only and scores nothing; a dark mass wider than the sides' reach scores nothing inside). The window of
    RIDGE_LENGTH_MM is read as two end thirds and the weaker one counts, so a dot or a blotch, dark in one third only, is not a line.
    Returns (step in L*, crest): crest marks the pixels where the step is highest across the ridge, a line one or two
    pixels wide down the middle of it.
    """
    h, w = L.shape
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    f = lambda k: cv2.filter2D(L, -1, k, borderType=cv2.BORDER_REFLECT)
    per = []
    third = max(4.5, RIDGE_LENGTH_MM/pxmm)/3
    for i in range(12):
        t = np.pi*i/12
        resp = np.zeros_like(L)
        for s in RIDGE_SIDES_MM:
            r = max(1.5, s/pxmm)
            ends = []
            for along in (-third, third):
                c = f(_segment(t, third, 0, along))
                ends.append(np.minimum(f(_segment(t, third, r, along))-c, f(_segment(t, third, -r, along))-c))
            resp = np.maximum(resp, np.minimum(*ends))
        per.append(resp)
    best = cv2.GaussianBlur(np.max(per, axis=0), (0, 0), .7)
    # the crest: across the ridge (the direction in which the step falls away fastest, from its second derivatives
    # over about a line's width) the step is highest here
    g = cv2.GaussianBlur(best, (0, 0), max(1., .15/pxmm))
    gxx, gyy, gxy = cv2.Sobel(g, cv2.CV_32F, 2, 0, ksize=3), cv2.Sobel(g, cv2.CV_32F, 0, 2, ksize=3), cv2.Sobel(g, cv2.CV_32F, 1, 1, ksize=3)
    across = .5*np.arctan2(2*gxy, gxx-gyy)+np.pi/2   # the eigenvector of the more negative curvature
    nx, ny = np.cos(across).astype(np.float32), np.sin(across).astype(np.float32)
    up = cv2.remap(best, xs+nx, ys+ny, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    down = cv2.remap(best, xs-nx, ys-ny, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    # on the flank of a ridge the step curves upward across it and that test would run along the line instead: a crest
    # is only where the downward curvature across is the larger of the two
    half, root = (gxx+gyy)/2, np.hypot((gxx-gyy)/2, gxy)
    crest = (best >= up) & (best >= down) & (-(half-root) > np.abs(half+root))
    return best, crest


def ridge_mask(bgr, pxmm):
    """The subject's thin dark lines as a mask of their crests, with the step (L*) and each line's body for its width."""
    L = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32)*100/255
    step, crest = ridge_response(L, pxmm)
    on = np.where(crest, step, 0)
    n, labels, stats, _ = cv2.connectedComponentsWithStats((on > RIDGE_WEAK_L).astype('uint8'), 8)
    strong = np.bincount(labels.ravel(), weights=(on > RIDGE_STRONG_L).ravel(), minlength=n) > 0
    strong[0] = False
    mask = strong[labels].astype('uint8')
    # the line's body: pixels at least half as far below the surrounding tone as the crest beside them is
    r = max(2, int(round(max(RIDGE_SIDES_MM)/pxmm)))
    disc = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*r+1, 2*r+1))
    depth = cv2.morphologyEx(L, cv2.MORPH_CLOSE, disc)-L
    near = cv2.dilate(np.where(mask > 0, depth, 0), disc)
    body = ((near > 0) & (depth >= .5*near)).astype('uint8') | mask
    return mask, step, body


def prune_ridges(paths, step, pxmm, confirm=None):
    """Keep lines as a draughtsman would: by step times length, and a short line only when it is straight.

    A line's score is its mean step (L*) times its length (mm), times 1 to 2 by how surely a lineart map (`confirm`, 0..1)
    also sees it; the map never adds a line. Under RIDGE_SCORE the line is left to the wash. A line under RIDGE_SHORT_MM
    whose chord is under RIDGE_STRAIGHT of its length is a piece of a tangle (the rim of a blotch) and is left too.
    Returns (kept paths, their scores, number dropped).
    """
    kept, scores = [], []
    for p in paths:
        q = sketch.samples(p.astype(np.float32), 1)
        length = float(np.sum(np.linalg.norm(np.diff(p, axis=0), axis=1)))*pxmm
        score = float(np.mean(sketch.at(step, q)))*length
        if confirm is not None:
            score *= 1+float(np.mean(sketch.at(confirm, q)))
        straight = float(np.linalg.norm(p[-1]-p[0]))*pxmm >= RIDGE_STRAIGHT*length
        if score >= RIDGE_SCORE and (length >= RIDGE_SHORT_MM or straight):
            kept.append(p); scores.append(score)
    return kept, scores, len(paths)-len(kept)


def plan(bgr, kind='ink', map_tolerance=.25, fine=None, gate=None, stroke_opts=None):
    if not np.isfinite(map_tolerance) or not 0 <= map_tolerance <= 2:
        raise ValueError('map tolerance must be finite and between 0 and 2 cells')
    pxmm = 152.4/bgr.shape[1]
    body = None
    if kind == 'ridge':
        mask, step, body = ridge_mask(bgr, pxmm)
        contrast = np.clip(step/30, 0, 1)
    else:
        mask, contrast = line_map_mask(bgr, fine) if kind == 'line-map' else stroke_mask(bgr, pxmm, gate=gate, **(stroke_opts or {})) if kind == 'stroke' else ink_mask(bgr)
    skeleton, _ = thin(mask)
    if kind in ('stroke', 'ridge'):
        skeleton, _ = prune_spurs(skeleton, 3)
    if kind == 'line-map':
        # a stub off a fork cuts a line in two; a standalone short mark is not a stub and stays
        skeleton, _ = prune_spurs(skeleton, 2)
    paths = sketch.trace(skeleton, min_points=2, window=3 if kind == 'line-map' else 5)
    joins = pruned = 0
    if kind == 'ridge':
        paths, joins = sketch.through_junctions(paths, skeleton)
        before = len(paths)
        paths = sketch.join(paths, contrast, gap=max(2, int(round(RIDGE_JOIN_MM/pxmm))))
        joins += before - len(paths)
        # the dark glass of a window is a shape for the wash, not lines: only ridges that score as pen lines stay
        paths, _, pruned = prune_ridges(paths, step, pxmm, gate)
    if kind in ('line-map', 'stroke'):
        # one line through each junction along its straightest continuation, then across the short breaks the map or a
        # dry pen leaves where the evidence carries on (a wall edge, an eave or an arch is one long stroke)
        paths, joins = sketch.through_junctions(paths, skeleton)
        before = len(paths)
        paths = sketch.join(paths, contrast, gap=JOIN_GAP)
        joins += before - len(paths)
    q_scale = bgr.shape[1]/1080
    distance = cv2.distanceTransform(mask if body is None else body, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
    lines = []
    for p in paths:
        # Observed ink keeps the quarter-cell bound. Declared maps can opt into
        # a larger planning bound; this never joins neighboring paths.
        tolerance = map_tolerance if kind in ('line-map', 'stroke', 'ridge') else .25
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
        elif kind == 'ridge':
            # one width for the stroke: the median width of the subject's line under it, at half its depth
            lo, hi = RIDGE_WIDTH_MM
            widths = np.full(len(q), float(np.clip(np.median(2*sketch.at(distance, q)-1), lo/pxmm, hi/pxmm)))
            weights = .45 + .55*sketch.at(contrast, q)
        elif kind == 'stroke':
            # a stroke's own width (the distance across its mask) and its darkness against its surround
            widths = np.maximum(.6, 2*sketch.at(distance, q)-1)
            weights = .45 + .55*sketch.at(contrast, q)
        lines.append({'points': np.round(q, 3).tolist(),
                      'widths': np.round(widths, 3).tolist(),
                      'weights': np.round(weights, 3).tolist(), 'weight': float(np.mean(weights)), 'role': {'line-map': 'map contour', 'stroke': 'pen stroke', 'ridge': 'pen line'}.get(kind, 'observed ink'),
                      'length': arc_length(q),
                      # a line map's long contours are the outlines and structure, drawn first (tier 1); the rest are detail (tier 2)
                      **({'tier': 1 if arc_length(q) >= LONG_CELLS * q_scale else 2} if kind in ('line-map', 'stroke', 'ridge') else {})})
    return lines, mask, skeleton, {'inkPixels': int(mask.sum()),
        'skeletonPixels': int(skeleton.sum()), 'tracedPaths': len(paths),
        'selectedPaths': len(lines), 'joins': joins, 'budgetDrops': 0, **({'leftToWash': pruned} if kind == 'ridge' else {}),
        'simplificationTolerance': map_tolerance if kind in ('line-map', 'stroke', 'ridge') else .25}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('image'); ap.add_argument('--out', required=True)
    ap.add_argument('--width', type=int, default=1080)
    ap.add_argument('--kind', choices=['ink', 'line-map', 'stroke', 'ridge'], default='ink', help="line-map is explicit pre-paint model evidence, never a photograph; ridge is the subject's own thin dark lines, pruned (with --gate, a lineart map ranks them)")
    ap.add_argument('--map-tolerance', type=float, default=None,
                    help='explicit line-map simplification bound in planning cells (0–2), default .15; observed ink stays at .25')
    ap.add_argument('--stroke-lo', type=float, default=.5, help='--kind stroke: weak support as a share of the strong level')
    ap.add_argument('--stroke-close', type=int, default=0, help='--kind stroke: close breaks of up to this many pixels before tracing')
    ap.add_argument('--stroke-colour', type=float, default=0, help='--kind stroke: keep strokes within this a*b* distance of the ink colour (0 off)')
    ap.add_argument('--gate', help="a lineart map (dark on white): a --kind stroke stroke is kept only where it also sees a line")
    ap.add_argument('--source', help="--kind line-map: the picture the map was made from; the length of its own pen strokes where the map sees a line is reported as sourceInkLength")
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
    gate = None
    if args.gate:
        grey = cv2.imread(args.gate, cv2.IMREAD_GRAYSCALE)
        if grey is None:
            ap.error('cannot read '+args.gate)
        gate = 1-cv2.resize(grey, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32)/255
    lines, mask, skeleton, stats = plan(bgr, args.kind, tolerance, fine, gate, {'lo_frac': args.stroke_lo, 'close': args.stroke_close, 'ink_colour': args.stroke_colour})
    if args.source:
        if args.kind != 'line-map':
            ap.error('--source goes with --kind line-map')
        src = cv2.imread(args.source)
        if src is None:
            ap.error('cannot read '+args.source)
        # how much line the subject itself carries: its own narrow dark strokes where the map also sees a line, thinned.
        # One number for the whole picture; the drawing is cut to this length by importance (line-importance.mjs).
        own, _ = stroke_mask(cv2.resize(src, (w, h), interpolation=cv2.INTER_AREA), 152.4/w, gate=1-cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)/255, ink_colour=10)
        stats['sourceInkLength'] = int(prune_spurs(thin(own)[0], 3)[0].sum())
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
