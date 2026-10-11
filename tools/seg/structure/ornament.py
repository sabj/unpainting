"""Where the source has fine texture, place a few loose marks sized by the texture's extent.

Texture is measured, not traced: the result says "foliage here, about this big" or "a carved
band along here", and marks.py draws a suggestion of it.
"""
import cv2
import numpy as np

from . import marks


def texture_regions(bgr, grey, short_side, claimed, max_regions=8):
    """Connected areas of dense fine detail not already claimed by structure or openings."""
    h, w = grey.shape
    fine = np.abs(grey-cv2.GaussianBlur(grey, (0, 0), 1.5))
    energy = cv2.GaussianBlur(fine, (0, 0), short_side*.012)
    ref = max(1e-4, float(np.percentile(energy, 99)))
    mask = (energy/ref > .6).astype(np.uint8)
    mask[cv2.dilate(claimed, np.ones((5, 5), np.uint8)) > 0] = 0
    k = max(3, int(short_side*.015)) | 1
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((k, k), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    count, labels, stats, cents = cv2.connectedComponentsWithStats(mask, connectivity=8)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    # Orientation coherence: carving bands and grass are directional; leaves are not.
    gx = cv2.Sobel(grey, cv2.CV_32F, 1, 0); gy = cv2.Sobel(grey, cv2.CV_32F, 0, 1)
    jxx = cv2.GaussianBlur(gx*gx, (0, 0), 4); jyy = cv2.GaussianBlur(gy*gy, (0, 0), 4); jxy = cv2.GaussianBlur(gx*gy, (0, 0), 4)
    regions = []
    for i in range(1, count):
        x, y, bw, bh, area = stats[i]
        if area < (short_side*.05)**2 or area > h*w*.06:
            continue
        m = labels == i
        a, b, c = jxx[m].mean(), jyy[m].mean(), jxy[m].mean()
        coherence = float(np.sqrt((a-b)**2+4*c*c)/max(a+b, 1e-9))
        hue, sat = float(np.median(hsv[..., 0][m])), float(np.median(hsv[..., 1][m]))/255
        pts = np.c_[np.nonzero(m)[1], np.nonzero(m)[0]].astype(np.float32)
        mean = pts.mean(axis=0)
        evals, evecs = np.linalg.eigh(np.cov((pts-mean).T))
        major = evecs[:, 1]; elong = float(np.sqrt(evals[1]/max(evals[0], 1e-6)))
        green = 30 <= hue <= 95 and sat > .18
        kind = 'foliage' if green or (coherence < .25 and elong < 3) else ('band' if elong >= 2.5 else 'texture')
        regions.append(dict(mask=m, area=int(area), box=(int(x), int(y), int(bw), int(bh)), centre=mean,
                            angle=float(np.arctan2(major[1], major[0])), length=float(4*np.sqrt(evals[1])),
                            breadth=float(4*np.sqrt(evals[0])), kind=kind, coherence=coherence))
    regions.sort(key=lambda r: -r['area'])
    return regions[:max_regions]


def _upper_edge(mask, box, frac, rng):
    """Part of the region's top silhouette, left to right: where a sketcher outlines a tree."""
    x, y, bw, bh = box
    xs = np.arange(x, x+bw, 2)
    tops = []
    for cx in xs:
        col = np.nonzero(mask[y:y+bh, cx])[0]
        tops.append((cx, y+col[0]) if len(col) else None)
    pts = [t for t in tops if t is not None]
    if len(pts) < 4:
        return None
    p = np.array(pts, np.float32)
    if len(p) > 6:
        k = np.ones(5)/5
        p[:, 1] = np.convolve(np.pad(p[:, 1], 2, mode='edge'), k, mode='valid')
    # Only the gently sloping part of the crown: a steep side turns scallops into a zigzag.
    gentle = np.r_[np.abs(np.gradient(p[:, 1])) <= 3.0, False]
    best, cur = (0, 0), None
    for i, g in enumerate(gentle):
        if g and cur is None:
            cur = i
        elif not g and cur is not None:
            if i-cur > best[1]-best[0]:
                best = (cur, i)
            cur = None
    p = p[best[0]:best[1]]
    if len(p) < 4:
        return None
    n = len(p); keep = max(4, int(n*frac))
    start = rng.integers(0, max(1, n-keep+1))
    return p[start:start+keep]


def ornament_marks(regions, short_side, rng):
    """[(kind, polyline)] loose suggestion marks for each texture region."""
    out = []
    for r in regions:
        size = float(np.clip(min(r['breadth'], r['length'])*.18, short_side*.012, short_side*.035))
        count = int(np.clip(r['length']/(short_side*.18), 1, 3))
        if r['kind'] == 'foliage':
            edge = _upper_edge(r['mask'], r['box'], rng.uniform(.45, .7), rng)
            if edge is not None:
                s = marks.scallops(edge, size, rng)
                if s is not None:
                    out.append(('foliage', s))
            for k in range(count-1):
                c = r['centre']+rng.uniform(-.2, .2, 2)*[r['box'][2], r['box'][3]]
                for p in marks.loose_wave(c, min(r['length']*.35, size*6), r['angle']+rng.uniform(-.3, .3), size*.8, rng, pieces=1):
                    out.append(('foliage', p))
        elif r['kind'] == 'band':
            L = min(r['length']*.7, short_side*.35)
            for p in marks.loose_wave(r['centre'], L, r['angle'], max(size*.6, short_side*.01), rng):
                out.append(('carving', p))
        # Undirected texture without colour (stone, dappled light, wash) gets no mark: leave it out.
    return out
