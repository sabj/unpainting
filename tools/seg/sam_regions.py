"""Subject regions for the painter: Segment Anything's automatic masks made into one partition of the picture.

segments.py --mode regions calls this. No rule names a region and no subject is special: each region is r<n>, with
its area, box, mean and spread of Lab colour, the share of the picture's frame it touches, and a foreground flag that
follows from that share. The painter (src/paint/methods/subject-clusters.mjs) cuts each region into its own colour
and value clusters and decides where a wash may cross from one region into the next.

How the partition is built, on the working image:
  1. SAM's automatic masks. A mask under MIN_PART of the picture is detail (an eye, a button) and is left to the
     colour clusters; a mask over WHOLE_FRAME is the whole frame and says nothing.
  2. Masks are laid largest first, so each pixel ends in the smallest mask that holds it.
  3. Picture SAM did not claim: a piece of at least MIN_PART is a region of its own; smaller pieces join a neighbour.
  4. Every boundary is smoothed at a brush's width (the indicator of each region blurred, then the largest wins), so a
     boundary is one a brush can follow.
  5. Past MAX_REGIONS, the smallest region joins its neighbour nearest in colour, until the count fits.
The k-means backend (kmeans_regions) is the same partition cut by Lab colour alone; segments.py uses it only when asked.
"""
import time

import cv2
import numpy as np

# A SAM mask under this share of the picture is detail, left to the colour clusters inside its region. At 0.006 the
# Flatiron photograph kept 6 of SAM's 87 masks and merged a street of buildings into one region; at 0.004 the
# buildings separate while an eye or a button stays inside its face or coat.
MIN_PART = 0.004
# SAM's own filters on a mask's predicted quality and its stability. The library defaults (0.88, 0.95) and the
# scene mode's (0.86, 0.9) drop the low-contrast masks of old photographs and paintings; these keep them.
PRED_IOU = 0.8
STABILITY = 0.86
# A mask over this share is the whole frame.
WHOLE_FRAME = 0.92
# A label map is one byte a pixel; far fewer regions than that keep the washes broad.
MAX_REGIONS = 48
# The smoothing brush, as a share of the short side (segments.py uses the same width for its scene regions).
BRUSH_FRACTION = 0.010
# A region whose frame contact is under this share of its own outline sits inside the picture: the foreground.
FOREGROUND_FRAME = 0.12


def odd(n):
    n = int(round(n))
    return max(3, n + 1 - n % 2)


def sam_masks(rgb, checkpoint, model_type='vit_b', points=32):
    """SAM's automatic masks over an RGB image, largest first, and a note on how they were made.

    Raises RuntimeError when SAM cannot run: a missing package or a checkpoint that will not load is an error here,
    never a quiet fall back to clustering.
    """
    try:
        import torch
        from segment_anything import sam_model_registry, SamAutomaticMaskGenerator
        from segment_anything.utils.transforms import ResizeLongestSide
    except ImportError as e:
        raise RuntimeError(f'SAM cannot run: {e}') from e
    started = time.time()
    # The point grid arrives as float64 and Metal refuses it; the only change SAM needs to run on a Mac's GPU.
    original = ResizeLongestSide.apply_coords
    ResizeLongestSide.apply_coords = lambda self, c, s: original(self, c, s).astype(np.float32)
    try:
        device = 'mps' if torch.backends.mps.is_available() else ('cuda' if torch.cuda.is_available() else 'cpu')
        sam = sam_model_registry[model_type](checkpoint=checkpoint).to(device)
        H, W = rgb.shape[:2]
        gen = SamAutomaticMaskGenerator(
            sam, points_per_side=points, pred_iou_thresh=PRED_IOU, stability_score_thresh=STABILITY,
            min_mask_region_area=int(H * W * 0.0008))
        masks = gen.generate(rgb)
    finally:
        ResizeLongestSide.apply_coords = original
    seconds = time.time() - started
    masks = sorted(masks, key=lambda m: -m['area'])
    return masks, {'backend': 'sam', 'model': model_type, 'device': device, 'masks': len(masks),
                   'points': points, 'seconds': round(seconds, 1)}


def lay_masks(masks, shape, min_part=MIN_PART):
    """Masks laid largest first, so each pixel takes the smallest mask holding it. 0 is picture no mask claimed."""
    H, W = shape
    field = np.zeros((H, W), np.int32)
    kept = []
    for m in masks:
        seg = m['segmentation']
        share = float(seg.mean())
        if share < min_part or share > WHOLE_FRAME:
            continue
        kept.append(m)
        field[seg] = len(kept)
    return field, kept


def claim_rest(field, min_part=MIN_PART):
    """Unclaimed picture: a piece of at least min_part becomes a region, smaller pieces are left for their neighbours."""
    H, W = field.shape
    out = field.copy()
    nxt = int(out.max()) + 1
    n, cc, st, _ = cv2.connectedComponentsWithStats((out == 0).astype(np.uint8), 8)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] / float(H * W) >= min_part:
            out[cc == i] = nxt
            nxt += 1
    return out


def fill_from_neighbours(field):
    """Every 0 takes the label of its nearest labelled pixel, so the map is a partition."""
    known = (field > 0).astype(np.uint8)
    if known.all():
        return field
    if not known.any():
        raise RuntimeError('no region was found')
    _, nearest = cv2.distanceTransformWithLabels(1 - known, cv2.DIST_L2, 3, labelType=cv2.DIST_LABEL_PIXEL)
    zeros = np.flatnonzero(known.ravel() > 0)
    flat = field.ravel()[zeros[nearest.ravel() - 1]]
    return np.where(field > 0, field, flat.reshape(field.shape))


def smooth_labels(field, brush):
    """Each region's indicator blurred over a brush width; the strongest wins. Specks under a brush are absorbed."""
    sigma = max(1.0, brush / 2.0)
    best = np.full(field.shape, -1.0, np.float32)
    out = np.zeros_like(field)
    for lab in np.unique(field):
        if lab == 0:
            continue
        ind = cv2.GaussianBlur((field == lab).astype(np.float32), (0, 0), sigma)
        win = ind > best
        best[win] = ind[win]
        out[win] = lab
    return out


def drop_specks(field, min_share):
    """A disconnected piece under min_share of the picture is given to its neighbours."""
    H, W = field.shape
    out = field.copy()
    for lab in np.unique(field):
        if lab == 0:
            continue
        n, cc, st, _ = cv2.connectedComponentsWithStats((field == lab).astype(np.uint8), 8)
        for i in range(1, n):
            if st[i, cv2.CC_STAT_AREA] / float(H * W) < min_share:
                out[cc == i] = 0
    return fill_from_neighbours(out)


def adjacency(field):
    """Pairs of labels that touch (4-connected), with the length of their shared edge in pixels."""
    pairs = {}
    for a, b in ((field[:, :-1], field[:, 1:]), (field[:-1, :], field[1:, :])):
        diff = a != b
        if not diff.any():
            continue
        x, y = np.minimum(a[diff], b[diff]), np.maximum(a[diff], b[diff])
        keys, counts = np.unique(np.stack([x, y], 1), axis=0, return_counts=True)
        for (p, q), c in zip(keys.tolist(), counts.tolist()):
            pairs[(p, q)] = pairs.get((p, q), 0) + c
    return pairs


def cap_regions(field, lab, max_regions=MAX_REGIONS):
    """While there are too many regions, the smallest joins the touching region nearest to it in mean Lab colour."""
    out = field.copy()
    flat = [lab[..., c].ravel() for c in range(3)]
    while True:
        areas = np.bincount(out.ravel())
        labels = np.flatnonzero(areas)
        if len(labels) <= max_regions:
            return out
        small = int(labels[int(np.argmin(areas[labels]))])
        means = np.stack([np.bincount(out.ravel(), weights=f, minlength=len(areas)) for f in flat], 1) / np.maximum(1, areas)[:, None]
        touching = [q if p == small else p for (p, q) in adjacency(out) if small in (p, q)]
        if not touching:
            touching = [int(l) for l in labels if l != small]
        target = min(touching, key=lambda t: float(np.linalg.norm(means[t] - means[small])))
        out[out == small] = target


def renumber(field):
    """Labels 1..R, largest region first."""
    labels, areas = np.unique(field, return_counts=True)
    order = labels[np.argsort(-areas, kind='stable')]
    lut = np.zeros(int(field.max()) + 1, np.int32)
    for i, l in enumerate(order, start=1):
        lut[l] = i
    return lut[field]


def sam_partition(masks, lab, min_part=MIN_PART, max_regions=MAX_REGIONS):
    """SAM's masks as one partition at the working size, and how many masks went into it."""
    H, W = lab.shape[:2]
    field, kept = lay_masks(masks, (H, W), min_part)
    field = fill_from_neighbours(claim_rest(field, min_part))
    field = smooth_labels(field, odd(min(H, W) * BRUSH_FRACTION))
    field = drop_specks(field, min_part / 4.0)
    field = cap_regions(field, lab, max_regions)
    return renumber(field), len(kept)


def kmeans_regions(lab, k=8, min_part=MIN_PART, max_regions=MAX_REGIONS):
    """The k-means backend: Lab clusters on a blurred copy, each connected piece a region, smoothed like SAM's."""
    H, W = lab.shape[:2]
    sm = cv2.GaussianBlur(lab, (0, 0), max(1.0, W * 0.004))
    feat = np.ascontiguousarray(sm.reshape(-1, 3).astype(np.float32))
    cv2.setRNGSeed(20261013)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 24, 0.5)
    _, labels, _ = cv2.kmeans(feat, k, None, crit, 5, cv2.KMEANS_PP_CENTERS)
    clusters = labels.reshape(H, W)
    field = np.zeros((H, W), np.int32)
    nxt = 1
    for c in range(k):
        n, cc, st, _ = cv2.connectedComponentsWithStats((clusters == c).astype(np.uint8), 8)
        for i in range(1, n):
            if st[i, cv2.CC_STAT_AREA] / float(H * W) >= min_part:
                field[cc == i] = nxt
                nxt += 1
    field = fill_from_neighbours(field)
    field = smooth_labels(field, odd(min(H, W) * BRUSH_FRACTION))
    field = drop_specks(field, min_part / 4.0)
    return renumber(cap_regions(field, lab, max_regions))


def frame_share(mask):
    """The share of a region's own outline that lies on the picture's frame."""
    edge = mask.astype(np.uint8) - cv2.erode(mask.astype(np.uint8), np.ones((3, 3), np.uint8), borderValue=0)
    outline = int(edge.sum())
    if not outline:
        return 0.0
    frame = int(mask[0, :].sum() + mask[-1, :].sum() + mask[1:-1, 0].sum() + mask[1:-1, -1].sum())
    return frame / float(outline)


def describe(field, lab):
    """The legend and each region's statistics, at the label map's own size."""
    legend, regions, names = {}, [], []
    for idx in range(1, int(field.max()) + 1):
        m = field == idx
        if not m.any():
            continue
        ys, xs = np.nonzero(m)
        name = f'r{idx}'
        share = frame_share(m)
        legend[str(idx)] = name
        names.append(name)
        regions.append({
            'id': idx, 'name': name, 'foreground': share < FOREGROUND_FRAME,
            'area': round(float(m.mean()), 5),
            'bbox': [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)],
            'lab': [round(float(lab[..., c][m].mean()), 2) for c in range(3)],
            'labSpread': [round(float(lab[..., c][m].std()), 2) for c in range(3)],
            'frame': round(share, 3),
        })
    return legend, regions, names
