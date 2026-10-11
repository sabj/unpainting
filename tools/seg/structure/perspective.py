"""Line segments, vanishing points and snapped, merged structural lines.

The urban-sketch construction: find the few directions a building's edges run toward
(vertical, and one or two horizontal vanishing points), then draw each long edge as a single
confident line toward its vanishing point instead of tracing its pixels.
"""
import cv2
import numpy as np

from .geom import arc_length, samples, at


def detect_segments(grey, scales=(1.0, .5)):
    """LSD segments at several scales, in planning pixels: array (n, 4) x1 y1 x2 y2."""
    lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
    out = []
    for s in scales:
        img = grey if s == 1 else cv2.resize(grey, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        u8 = np.uint8(np.clip(cv2.GaussianBlur(img, (0, 0), .8)*255, 0, 255))
        lines = lsd.detect(u8)[0]
        if lines is not None:
            out.append(lines.reshape(-1, 4)/s)
    return np.concatenate(out) if out else np.zeros((0, 4), np.float32)


def _lines(segs):
    """Homogeneous line through each segment, normalised so (a, b) is a unit normal."""
    p1 = np.c_[segs[:, :2], np.ones(len(segs))]
    p2 = np.c_[segs[:, 2:], np.ones(len(segs))]
    L = np.cross(p1, p2)
    return L/np.maximum(np.linalg.norm(L[:, :2], axis=1, keepdims=True), 1e-9)


def angle_error(segs, v):
    """Angle (radians) between each segment and the ray from its midpoint to vanishing point v.

    v is homogeneous; v[2] == 0 is a point at infinity (parallel lines in the image)."""
    mid = (segs[:, :2]+segs[:, 2:])/2
    d = segs[:, 2:]-segs[:, :2]
    if abs(v[2]) < 1e-9:
        r = np.broadcast_to(v[:2], mid.shape)
    else:
        r = v[:2]/v[2]-mid
    cos = np.abs(np.sum(d*r, axis=1))/np.maximum(np.linalg.norm(d, axis=1)*np.linalg.norm(r, axis=1), 1e-9)
    return np.arccos(np.clip(cos, 0, 1))


def _refine(segs, weights):
    """Least-squares point closest to all inlier lines (smallest singular vector)."""
    L = _lines(segs)*np.sqrt(weights)[:, None]
    _, _, vt = np.linalg.svd(L, full_matrices=False)
    return vt[-1]


def vanishing_points(segs, short_side, max_vps=3, tolerance_deg=1.5, seed=0, iterations=1500):
    """Greedy RANSAC over intersections of long segments. Returns [(v, inlier_mask)].

    Coordinates are pixels; v is homogeneous and may lie at infinity."""
    rng = np.random.default_rng(seed)
    length = np.linalg.norm(segs[:, 2:]-segs[:, :2], axis=1)
    keep = length >= short_side*.02
    tol = np.radians(tolerance_deg)
    remaining = keep.copy()
    found = []
    total = float(length[keep].sum()) or 1.0
    lines = _lines(segs)
    for _ in range(max_vps):
        idx = np.nonzero(remaining)[0]
        if len(idx) < 6:
            break
        p = length[idx]/length[idx].sum()
        best, best_score = None, 0.0
        for _ in range(iterations):
            i, j = rng.choice(idx, 2, replace=False, p=p)
            v = np.cross(lines[i], lines[j])
            n = np.linalg.norm(v)
            if n < 1e-12:
                continue
            v = v/n
            err = angle_error(segs[idx], v)
            score = float(np.sum(length[idx]*np.clip(1-err/tol, 0, 1)))
            if score > best_score:
                best, best_score = v, score
        if best is None:
            break
        inl = remaining & (angle_error(segs, best) < tol)
        if length[inl].sum()/total < .06:
            break
        v = _refine(segs[inl], length[inl])
        # Refinement can drift onto a degenerate point; keep the RANSAC point if it explains less.
        if np.sum(length[remaining & (angle_error(segs, v) < tol)]) < length[inl].sum()*.9:
            v = best
        inl = remaining & (angle_error(segs, v) < tol)
        found.append((v, inl))
        remaining &= ~inl
    return found


def _direction(v, mid):
    if abs(v[2]) < 1e-9 or np.linalg.norm(v[:2]/v[2]-mid) > 1e7:
        d = v[:2].astype(np.float64)
    else:
        d = v[:2]/v[2]-mid
    return d/max(np.linalg.norm(d), 1e-12)


def snap(seg, v):
    """Rotate a segment about its midpoint so its line passes through v; keep its extent."""
    a, b = seg[:2].astype(np.float64), seg[2:].astype(np.float64)
    mid = (a+b)/2
    u = _direction(v, mid)
    ta, tb = np.dot(a-mid, u), np.dot(b-mid, u)
    lo, hi = min(ta, tb), max(ta, tb)
    return np.r_[mid+u*lo, mid+u*hi]


def merge_collinear(segs, strength, short_side, offset_tol=2.5, max_gap_share=.08, gap_support=.6):
    """Join snapped segments lying on one line when their gap is short or carries an edge.

    Segments are first bucketed by their line (perpendicular offset), then intervals along the
    line are merged in order. Returns merged segments as (n, 4)."""
    if len(segs) == 0:
        return segs
    d = segs[:, 2:]-segs[:, :2]
    ang = np.mod(np.arctan2(d[:, 1], d[:, 0]), np.pi)
    used = np.zeros(len(segs), bool)
    out = []
    order = np.argsort(-np.linalg.norm(d, axis=1))
    for i in order:
        if used[i]:
            continue
        a = segs[i, :2]; u = d[i]/max(np.linalg.norm(d[i]), 1e-9); n = np.r_[-u[1], u[0]]
        dang = np.abs(np.angle(np.exp(2j*(ang-ang[i]))))/2
        off_a = np.abs((segs[:, :2]-a)@n); off_b = np.abs((segs[:, 2:]-a)@n)
        group = np.nonzero(~used & (dang < np.radians(1.2)) & (off_a < offset_tol) & (off_b < offset_tol))[0]
        iv = sorted((min(np.dot(segs[k, :2]-a, u), np.dot(segs[k, 2:]-a, u)),
                     max(np.dot(segs[k, :2]-a, u), np.dot(segs[k, 2:]-a, u)), k) for k in group)
        cur = [iv[0][0], iv[0][1], [iv[0][2]]]
        runs = []
        for lo, hi, k in iv[1:]:
            gap = lo-cur[1]
            if gap <= 0:
                cur[1] = max(cur[1], hi); cur[2].append(k); continue
            bridge = np.array([a+u*cur[1], a+u*lo])
            ok = gap < 5 or (gap < short_side*max_gap_share and np.mean(at(strength, samples(bridge, 1.5)) > .15) >= gap_support)
            if ok:
                cur[1] = max(cur[1], hi); cur[2].append(k)
            else:
                runs.append(cur); cur = [lo, hi, [k]]
        runs.append(cur)
        # Only the run containing the seed is consumed now; the others get their own turn.
        for lo, hi, ks in runs:
            if i in ks:
                used[ks] = True
                out.append(np.r_[a+u*lo, a+u*hi])
    return np.array(out, np.float32)


def structural_lines(grey, strength, short_side, seed=0):
    """Detect, assign to vanishing points, snap and merge. Returns (lines, vps, raw segments).

    Each line is a dict(seg=(4,), vp=index or -1, length)."""
    segs = detect_segments(grey)
    vps = vanishing_points(segs, short_side, seed=seed)
    lines = []
    assigned = np.zeros(len(segs), bool)
    for k, (v, inl) in enumerate(vps):
        snapped = np.array([snap(s, v) for s in segs[inl]], np.float32)
        for m in merge_collinear(snapped, strength, short_side):
            lines.append(dict(seg=m, vp=k, length=arc_length(m.reshape(2, 2))))
        assigned |= inl
    # Long unassigned segments (a stair, a gable) still count, unsnapped.
    for m in merge_collinear(segs[~assigned], strength, short_side):
        L = arc_length(m.reshape(2, 2))
        if L >= short_side*.1:
            lines.append(dict(seg=m, vp=-1, length=L))
    return lines, vps, segs
