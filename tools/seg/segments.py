#!/usr/bin/env python3
"""A label map of the scene's parts, with their outlines.

Two modes. --mode scene (the default) names a beach-like scene's parts by rules over position, mean Lab colour and
size; the figure is u2net's mask (tools/seg/segment.py, work/masks/<base>.png), and Segment Anything's automatic masks
give the boundaries when a checkpoint is present, else k-means in Lab. --mode regions is the painter's: SAM's masks
made into one partition of general regions r1..rN, with no names from rules (tools/seg/sam_regions.py). The painter
runs it before every painting (src/crop/segment-prep.mjs).

--sam auto uses SAM when it can and says so when it cannot; --sam require stops with an error instead of falling
back to k-means; --sam off is k-means only.

  python3 tools/seg/segments.py <image> --out work/segments
  python3 tools/seg/segments.py <image> --mode regions --sam require --checkpoint <sam_vit_b_01ec64.pth>

writes work/segments/<base>.png (label map, one byte per pixel, source resolution), <base>.json (legend and each
region's area share, bounding box, mean Lab and foreground flag) and <base>-contours.json (each label's external
contours and the boundaries between touching labels, as polylines in source pixels).

Needs numpy and opencv-python; SAM also needs torch, torchvision and segment-anything with a checkpoint:

    python3 -m venv .venv
    .venv/bin/pip install opencv-python-headless numpy torch torchvision segment-anything
    curl -sL --create-dirs -o work/models/sam_vit_b_01ec64.pth \\
      https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth
"""
import argparse
import json
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sam_regions  # noqa: E402

# Working size for SAM and the clustering; the label map is still written at the source's size.
WORK_SIDE = 1024
# approxPolyDP's tolerance, as a share of the short side: 0.004 is about 4 px on a 1086 px sheet, under a brush width.
EPS_FRACTION = 0.004
# The radius of the open/close that smooths every region, as a share of the short side. A boundary a brush cannot
# follow is noise to every stage downstream.
BRUSH_FRACTION = 0.010
# A patch smaller than this share of the sheet is absorbed by whatever surrounds it, unless it is a named object.
MIN_REGION = 0.0004
# Where a shared boundary stops being a stray contact and becomes a line a person would draw, in points.
MIN_BOUNDARY_FRACTION = 0.03

FOREGROUND = ('figure', 'dog', 'ball')
# Painting order, back to front: a later name wins the pixels where two regions were both claimed.
ORDER = ('background', 'sky', 'sea', 'trees', 'sand', 'figure', 'dog', 'ball')


def read_image(path):
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f'segments: cannot read {path}')
    return img


def to_lab(bgr):
    """OpenCV's 8-bit Lab, put back on the real scale: L in 0..100, a and b signed around 0."""
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    return np.stack([lab[..., 0] * 100.0 / 255.0, lab[..., 1] - 128.0, lab[..., 2] - 128.0], axis=-1)


def odd(n):
    n = int(round(n))
    return max(3, n + 1 - n % 2)


def resize_nearest(field, size):
    return cv2.resize(field.astype(np.uint8), size, interpolation=cv2.INTER_NEAREST).astype(np.int32)



def figure_mask(shape, source, explicit, mask_dir):
    """u2net's salient object, if it has been precomputed. Nothing here re-runs it: it is a separate 167 MB model."""
    base = os.path.splitext(os.path.basename(source))[0]
    path = explicit or os.path.join(mask_dir, base + '.png')
    if not os.path.exists(path):
        return None, f'no figure mask at {path}; run tools/seg/segment.py first'
    raw = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if raw is None:
        return None, f'figure mask {path} unreadable'
    m = cv2.resize(raw, (shape[1], shape[0]), interpolation=cv2.INTER_AREA) > 128
    if m.mean() < 0.002:
        return None, f'figure mask {path} is empty'
    return m, f'figure from {path}'


def darkest_component(lab, blocked, shape):
    """The dog: the darkest compact thing that is not the figure and stands on the ground. Taken as the
    best-scoring dark component, so the figure's cast shadow and the treeline do not join it.
    """
    H, W = shape
    L = lab[..., 0]
    floor = max(22.0, float(np.percentile(L, 1.5)) + 10.0)
    dark = ((L < floor) & ~blocked).astype(np.uint8)
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (odd(W * 0.012),) * 2))
    n, cc, st, ct = cv2.connectedComponentsWithStats(dark, 8)
    best, best_score = None, 0.0
    for i in range(1, n):
        area = st[i, cv2.CC_STAT_AREA] / float(H * W)
        if area < 0.0015 or area > 0.20:
            continue
        cy = ct[i][1] / H
        box = st[i, cv2.CC_STAT_WIDTH] * st[i, cv2.CC_STAT_HEIGHT]
        fill = st[i, cv2.CC_STAT_AREA] / max(1.0, box)          # a blob, not a smear along the horizon
        score = area * fill * (0.4 + cy)                        # and standing on the ground, not floating in the sky
        if score > best_score:
            best, best_score = i, score
    return None if best is None else (cc == best)


def green_ball(bgr, shape, near):
    """The ball: a small, saturated, green patch within reach of the figure; the reach test rejects sunlit bushes."""
    H, W = shape
    hsv = cv2.cvtColor(cv2.GaussianBlur(bgr, (0, 0), max(1.0, W * 0.002)), cv2.COLOR_BGR2HSV)
    hue, sat, val = hsv[..., 0].astype(np.int32), hsv[..., 1].astype(np.int32), hsv[..., 2].astype(np.int32)
    m = ((hue >= 30) & (hue <= 95) & (sat > 70) & (val > 50)).astype(np.uint8)
    n, cc, st, ct = cv2.connectedComponentsWithStats(m, 8)
    best, best_area = None, 0
    for i in range(1, n):
        area = st[i, cv2.CC_STAT_AREA] / float(H * W)
        if not MIN_REGION <= area <= 0.015:                      # a fleck of sunlit leaf is not a ball
            continue
        w, h = st[i, cv2.CC_STAT_WIDTH], st[i, cv2.CC_STAT_HEIGHT]
        if max(w, h) > 4 * min(w, h):                            # a ball is round; a green shrub line is not
            continue
        cy, cx = int(round(ct[i][1])), int(round(ct[i][0]))
        if near is not None and not near[min(H - 1, cy), min(W - 1, cx)]:
            continue
        if st[i, cv2.CC_STAT_AREA] > best_area:
            best, best_area = i, st[i, cv2.CC_STAT_AREA]
    return None if best is None else (cc == best)


def horizon_row(lab, blocked, shape):
    """Where the picture turns warm. Sand below, water and sky above; the one split the naming rules lean on."""
    H, W = shape
    b = lab[..., 2].copy()
    b[blocked] = np.nan
    with np.errstate(invalid='ignore'):
        rows = np.nanmean(b, axis=1)
    rows = np.nan_to_num(rows, nan=float(np.nanmean(rows)) if np.isfinite(np.nanmean(rows)) else 0.0)
    lo, hi = int(0.20 * H), int(0.92 * H)
    best, best_gap = int(0.55 * H), -1e9
    for r in range(lo, hi):
        gap = rows[r:].mean() - rows[:r].mean()
        if gap > best_gap:
            best, best_gap = r, gap
    return best


def clusters_in_lab(lab, k, blur):
    """k-means in Lab on a blurred copy: the broad washes, before any rule has a name for them."""
    sm = cv2.GaussianBlur(lab, (0, 0), blur)
    feat = sm.reshape(-1, 3).copy()
    feat[:, 1:] *= 2.0                                           # chroma counts double: a blue sea and a grey sky sit
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 24, 0.5)   # at the same lightness
    cv2.setRNGSeed(20260921)
    _, labels, _ = cv2.kmeans(np.ascontiguousarray(feat), k, None, crit, 5, cv2.KMEANS_PP_CENTERS)
    return labels.reshape(lab.shape[:2])


def background_name(L, a, b, cy, top, bottom, width, horizon, paper, shape):
    """Name one background patch from where it sits and its colour; a patch no rule matches is background.

    Rules near the horizon need a band as well as a colour, so a dark tuft of coat is not called a treeline.
    """
    H, W = shape
    near_horizon = min(abs(cy - horizon), abs(top - horizon), abs(bottom - horizon)) < 0.12 * H
    height = max(1.0, bottom - top)
    band = width > 0.12 * W and width > 2.0 * height
    if near_horizon and band and b < 6.0 and L > 55.0:
        return 'sea'
    if near_horizon and band and L < 62.0 and height < 0.14 * H:
        return 'trees'
    # Bare paper is not sky: a blank surround must not be split at a meaningless horizon and washed.
    if L > paper - 5.0 and abs(a) < 5.0 and abs(b) < 5.0:
        return 'background'
    if cy < horizon:
        return 'sky' if L > 50.0 else 'background'
    return 'sand' if b > 8.0 else 'background'


def rule_field(lab, clusters, blocked, horizon, paper, shape):
    """Every background patch, named. Components are cut at the horizon so one cluster of bare paper cannot be sky at
    the top of the sheet and sky again beside the figure's shoes."""
    H, W = shape
    rows = np.arange(H)[:, None] * np.ones((1, W), dtype=int)
    names = np.zeros((H, W), dtype=object)
    names[:] = ''
    for c in range(int(clusters.max()) + 1):
        for side in (rows < horizon, rows >= horizon):
            m = ((clusters == c) & ~blocked & side).astype(np.uint8)
            if not m.any():
                continue
            n, cc, st, ct = cv2.connectedComponentsWithStats(m, 8)
            for i in range(1, n):
                area = st[i, cv2.CC_STAT_AREA] / float(H * W)
                if area < MIN_REGION:
                    continue
                comp = cc == i
                name = background_name(
                    float(lab[..., 0][comp].mean()), float(lab[..., 1][comp].mean()), float(lab[..., 2][comp].mean()),
                    float(ct[i][1]), float(st[i, cv2.CC_STAT_TOP]),
                    float(st[i, cv2.CC_STAT_TOP] + st[i, cv2.CC_STAT_HEIGHT]),
                    float(st[i, cv2.CC_STAT_WIDTH]), horizon, paper, shape)
                names[comp] = name
    return names



def find_checkpoint(explicit):
    if explicit:
        return explicit if os.path.exists(explicit) else None
    for p in (os.environ.get('PAINTER_SAM_CHECKPOINT', ''), os.environ.get('SAM_CHECKPOINT', ''),
              'work/models/sam_vit_b_01ec64.pth'):
        if p and os.path.exists(p):
            return p
    return None


def sam_masks(bgr, checkpoint, model_type='vit_b'):
    """SAM's automatic mask generator over the working image. Returns masks largest first, or None with a reason."""
    try:
        import torch
        from segment_anything import sam_model_registry, SamAutomaticMaskGenerator
        from segment_anything.utils.transforms import ResizeLongestSide
    except ImportError as e:
        return None, f'SAM off: {e}'
    # The point grid arrives as float64 and Metal refuses it; the only change SAM needs to run on a Mac's GPU.
    original = ResizeLongestSide.apply_coords
    ResizeLongestSide.apply_coords = lambda self, c, s: original(self, c, s).astype(np.float32)
    device = 'mps' if torch.backends.mps.is_available() else ('cuda' if torch.cuda.is_available() else 'cpu')
    sam = sam_model_registry[model_type](checkpoint=checkpoint).to(device)
    H, W = bgr.shape[:2]
    gen = SamAutomaticMaskGenerator(
        sam, points_per_side=24, pred_iou_thresh=0.86, stability_score_thresh=0.9,
        min_mask_region_area=int(H * W * 0.0008))
    masks = gen.generate(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    ResizeLongestSide.apply_coords = original
    return sorted(masks, key=lambda m: -m['area']), f'SAM {model_type} on {device}, {len(masks)} masks'


def snap_to_sam(names, masks, keep):
    """Give SAM's boundaries to the rules' names, largest mask first. A mask whose pixels disagree is left alone."""
    out = names.copy()
    for m in masks:
        seg = m['segmentation']
        under = names[seg]
        vals, counts = np.unique(under[under != ''], return_counts=True)
        if not len(vals):
            continue
        win, share = vals[int(counts.argmax())], counts.max() / float(seg.sum())
        if share < 0.7 or win not in keep:
            continue
        out[seg] = win
    return out



def compose(names, shape, brush):
    """One integer per pixel, every region opened and closed at the brush's scale, no pixel left unassigned."""
    H, W = shape
    present = [n for n in ORDER if (names == n).any()]
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (brush, brush))
    field = np.zeros((H, W), np.int32)
    for idx, name in enumerate(present, start=1):
        m = (names == name).astype(np.uint8)
        if name in FOREGROUND:
            # objects are small and their silhouette is the point of them: close the gaps, do not erode the edges
            m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, kernel)
        else:
            m = cv2.morphologyEx(m, cv2.MORPH_OPEN, kernel)
            m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, kernel)
        if not m.any():
            m = (names == name).astype(np.uint8)
        field[m > 0] = idx
    field = drop_specks(field, shape, keep=[i for i, n in enumerate(present, 1) if n in FOREGROUND])
    return fill_unassigned(field), present


def drop_specks(field, shape, keep):
    H, W = shape
    out = field.copy()
    for idx in np.unique(field):
        if idx == 0 or idx in keep:
            continue
        n, cc, st, _ = cv2.connectedComponentsWithStats((field == idx).astype(np.uint8), 8)
        for i in range(1, n):
            if st[i, cv2.CC_STAT_AREA] / float(H * W) < MIN_REGION:
                out[cc == i] = 0
    return out


def fill_unassigned(field):
    """Whatever the opening ate goes to its nearest named neighbour, so the map is a partition."""
    known = (field > 0).astype(np.uint8)
    if known.all():
        return field
    if not known.any():
        raise SystemExit('segments: nothing was labelled')
    _, nearest = cv2.distanceTransformWithLabels(
        1 - known, cv2.DIST_L2, 3, labelType=cv2.DIST_LABEL_PIXEL)
    zeros = np.flatnonzero(known.ravel() > 0)                    # DIST_LABEL_PIXEL numbers the zero pixels in scan
    flat = field.ravel()[zeros[nearest.ravel() - 1]]             # order, which for 1-known is the labelled pixels
    return np.where(field > 0, field, flat.reshape(field.shape))



def region_report(field, lab, present, shape):
    H, W = shape
    legend, regions = {}, []
    for idx, name in enumerate(present, start=1):
        m = field == idx
        if not m.any():
            continue
        ys, xs = np.nonzero(m)
        legend[str(idx)] = name
        regions.append({
            'id': int(idx), 'name': name, 'foreground': name in FOREGROUND,
            'area': round(float(m.mean()), 5),
            'bbox': [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)],
            'lab': [round(float(lab[..., c][m].mean()), 2) for c in range(3)],
        })
    return legend, regions


def region_contours(field, idx, eps, min_area):
    cs, _ = cv2.findContours((field == idx).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    out = []
    for c in cs:
        if cv2.contourArea(c) < min_area:
            continue
        poly = cv2.approxPolyDP(c, eps, True).reshape(-1, 2)
        if len(poly) >= 3:
            out.append([[int(x), int(y)] for x, y in poly])
    return out


def shared_boundaries(field, a_idx, b_idx, eps, min_points, reach):
    """The line between two regions, as a person would draw it: the run of one region's outline that the other is
    standing against. The horizon is this, and so is a silhouette against the sand."""
    b_near = cv2.dilate((field == b_idx).astype(np.uint8),
                        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (reach, reach)))
    cs, _ = cv2.findContours((field == a_idx).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    lines = []
    for c in cs:
        pts = c.reshape(-1, 2)
        if len(pts) < min_points:
            continue
        touch = b_near[pts[:, 1], pts[:, 0]] > 0
        if touch.all():
            lines.append((pts, True))
            continue
        if not touch.any():
            continue
        start = int(np.argmax(~touch))                            # rotate so a run cannot be split by the seam
        rot = np.roll(pts, -start, axis=0)
        hit = np.roll(touch, -start)
        run = []
        for p, t in zip(rot, hit):
            if t:
                run.append(p)
            elif run:
                lines.append((np.array(run), False))
                run = []
        if run:
            lines.append((np.array(run), False))
    out = []
    for pts, closed in lines:
        if len(pts) < min_points:
            continue
        poly = cv2.approxPolyDP(pts.reshape(-1, 1, 2), eps, closed).reshape(-1, 2)
        if len(poly) >= 2:
            out.append({'closed': bool(closed), 'points': [[int(x), int(y)] for x, y in poly]})
    return out


def contour_report(field, present, shape, pairs=None):
    H, W = shape
    short = min(H, W)
    eps = EPS_FRACTION * short
    reach = odd(short * 0.004)
    min_points = max(12, int(MIN_BOUNDARY_FRACTION * short))
    report = {'image': {'w': int(W), 'h': int(H)}, 'epsilon': round(float(eps), 2), 'regions': [], 'boundaries': []}
    for idx, name in enumerate(present, start=1):
        polys = region_contours(field, idx, eps, MIN_REGION * H * W)
        report['regions'].append({'id': int(idx), 'name': name, 'polygons': polys})
    for i, a in enumerate(present, start=1):
        for j, b in enumerate(present, start=1):
            if j <= i or (pairs is not None and (i, j) not in pairs):
                continue
            # trace the smaller region's outline: a silhouette belongs to the object, not to the sand behind it
            small, large = (i, j) if (field == i).sum() <= (field == j).sum() else (j, i)
            for line in shared_boundaries(field, small, large, eps, min_points, reach):
                names = (present[small - 1], present[large - 1])
                report['boundaries'].append({'between': list(names), 'labels': [int(small), int(large)], **line})
    return report



def segment(path, args):
    full = read_image(path)
    H, W = full.shape[:2]
    scale = min(1.0, WORK_SIDE / float(max(H, W)))
    small = cv2.resize(full, (int(round(W * scale)), int(round(H * scale))), interpolation=cv2.INTER_AREA)
    sh, sw = small.shape[:2]
    lab = to_lab(small)
    notes = []

    figure, note = figure_mask((sh, sw), path, args.mask, args.masks)
    notes.append(note)
    blocked = np.zeros((sh, sw), bool) if figure is None else figure.copy()
    dog = darkest_component(lab, blocked, (sh, sw))
    if dog is not None:
        blocked |= dog
    reach = None if figure is None else cv2.dilate(
        figure.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (odd(sw * 0.08),) * 2)) > 0
    ball = green_ball(small, (sh, sw), reach)
    notes.append(f"dog {'found' if dog is not None else 'not found'}, ball {'found' if ball is not None else 'not found'}")

    horizon = horizon_row(lab, blocked, (sh, sw))
    notes.append(f'horizon at y {horizon / sh:.2f}, paper at L {float(np.percentile(lab[..., 0], 97)):.0f}')
    clusters = clusters_in_lab(lab, args.k, max(1.0, sw * 0.004))
    paper = float(np.percentile(lab[..., 0], 97))
    names = rule_field(lab, clusters, blocked, horizon, paper, (sh, sw))
    # The objects go in before SAM sees the field, so that SAM's boundary for the dog, which is the one it is best at,
    # replaces the dark threshold's fringe rather than being overwritten by it.
    if figure is not None:
        names[figure] = 'figure'
    if dog is not None:
        names[dog] = 'dog'
    if ball is not None:
        names[ball] = 'ball'

    if args.sam != 'off':
        checkpoint = find_checkpoint(args.checkpoint)
        if checkpoint is None:
            if args.sam == 'require':
                raise SystemExit('segments: SAM required and no checkpoint was found')
            notes.append('SAM off: no checkpoint found')
        else:
            masks, note = sam_masks(small, checkpoint, args.model)
            if masks is None and args.sam == 'require':
                raise SystemExit(f'segments: SAM required and it did not run: {note}')
            notes.append(note)
            if masks:
                names = snap_to_sam(names, masks, keep=set(np.unique(names)) - {''})
    # and the ball goes back afterwards: it is a few hundred pixels, and every mask that covers it is mostly hand.
    if ball is not None:
        names[ball] = 'ball'

    names = resize_names(names, (W, H))
    field, present = compose(names, (H, W), odd(min(H, W) * BRUSH_FRACTION))
    legend, regions = region_report(field, to_lab(full), present, (H, W))
    return field, legend, regions, contour_report(field, present, (H, W)), notes


def resize_names(names, size):
    """Back to the source's resolution before the smoothing, so the boundary a brush follows is the real one."""
    order = [n for n in ORDER if (names == n).any()]
    codes = np.zeros(names.shape, np.uint8)
    for i, n in enumerate(order, start=1):
        codes[names == n] = i
    big = cv2.resize(codes, size, interpolation=cv2.INTER_NEAREST)
    out = np.zeros(big.shape, dtype=object)
    out[:] = ''
    for i, n in enumerate(order, start=1):
        out[big == i] = n
    return out


def segment_regions(path, args):
    """--mode regions: SAM's masks as general regions, or k-means when SAM is off or (under --sam auto) cannot run."""
    full = read_image(path)
    H, W = full.shape[:2]
    scale = min(1.0, WORK_SIDE / float(max(H, W)))
    small = cv2.resize(full, (int(round(W * scale)), int(round(H * scale))), interpolation=cv2.INTER_AREA)
    lab = to_lab(small)
    notes, backend, field = [], None, None
    if args.sam != 'off':
        checkpoint = find_checkpoint(args.checkpoint)
        try:
            if checkpoint is None:
                raise RuntimeError('no SAM checkpoint found (--checkpoint, PAINTER_SAM_CHECKPOINT, SAM_CHECKPOINT, '
                                   'work/models)')
            masks, info = sam_regions.sam_masks(cv2.cvtColor(small, cv2.COLOR_BGR2RGB), checkpoint, args.model, args.points)
            field, used = sam_regions.sam_partition(masks, lab)
            backend = {**info, 'laid': used, 'checkpoint': os.path.basename(checkpoint)}
            notes.append(f"SAM {info['model']} on {info['device']}: {info['masks']} masks, {used} laid, {info['seconds']} s")
        except RuntimeError as e:
            if args.sam == 'require':
                raise SystemExit(f'segments: SAM required and it did not run: {e}')
            notes.append(f'SAM off: {e}')
    if field is None:
        field = sam_regions.kmeans_regions(lab, args.k)
        backend = {'backend': 'kmeans', 'k': args.k}
        notes.append(f'k-means in Lab, k {args.k}')
    big = sam_regions.renumber(cv2.resize(field.astype(np.uint8), (W, H), interpolation=cv2.INTER_NEAREST).astype(np.int32))
    legend, regions, names = sam_regions.describe(big, to_lab(full))
    pairs = set(sam_regions.adjacency(big))
    return big, legend, regions, contour_report(big, names, (H, W), pairs), notes, backend


def main():
    ap = argparse.ArgumentParser(description='A label map of a picture\'s parts, and their outlines.')
    ap.add_argument('images', nargs='+')
    ap.add_argument('--out', default='work/segments')
    ap.add_argument('--masks', default='work/masks', help='where tools/seg/segment.py left the u2net masks')
    ap.add_argument('--mask', default='', help='one figure mask, overriding --masks for a single image')
    ap.add_argument('--mode', choices=['scene', 'regions'], default='scene')
    ap.add_argument('--sam', choices=['auto', 'off', 'require'], default='auto')
    ap.add_argument('--points', type=int, default=32, help='SAM points per side (--mode regions)')
    ap.add_argument('--checkpoint', default='', help='a SAM checkpoint; otherwise the usual caches are searched')
    ap.add_argument('--model', default='vit_b')
    ap.add_argument('--k', type=int, default=6, help='colour clusters the background is cut into')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    for path in args.images:
        base = os.path.splitext(os.path.basename(path))[0]
        if args.mode == 'regions':
            field, legend, regions, contours, notes, backend = segment_regions(path, args)
        else:
            (field, legend, regions, contours, notes), backend = segment(path, args), None
        cv2.imwrite(os.path.join(args.out, base + '.png'), field.astype(np.uint8))
        with open(os.path.join(args.out, base + '.json'), 'w') as f:
            json.dump({'source': path, 'mode': args.mode, 'backend': backend, 'image': contours['image'],
                       'legend': legend, 'regions': regions, 'notes': notes}, f, indent=1)
        with open(os.path.join(args.out, base + '-contours.json'), 'w') as f:
            json.dump(contours, f)
        share = ', '.join(f"{r['name']} {r['area'] * 100:.1f}%" for r in regions)
        print(f'{base}: {contours["image"]["w"]}x{contours["image"]["h"]}  {share}', flush=True)
        for n in notes:
            print(f'  {n}', flush=True)


if __name__ == '__main__':
    main()
