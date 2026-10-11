"""Arches and other large smooth curves, drawn as fitted arcs rather than traced pixels."""
import cv2
import numpy as np

from .geom import arc_length, samples, at


def _trace():
    """The junction-aware skeleton walker from sketch-lines.py (loaded once, by path)."""
    global _TRACE
    if _TRACE is None:
        import importlib.util
        import sys
        from pathlib import Path
        here = Path(__file__).resolve().parent.parent
        sys.path.insert(0, str(here))
        spec = importlib.util.spec_from_file_location('sketch_lines', here/'sketch-lines.py')
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _TRACE = mod.trace
    return _TRACE


_TRACE = None


def stretched(grey):
    """Tone stretched to the image's own 2..98 percentile range, as uint8."""
    lo, hi = np.percentile(grey, [2, 98])
    return np.uint8(np.clip((grey-lo)/max(hi-lo, 1e-3), 0, 1)*255)


def edge_chains(grey, sigma=2.0, min_length=20):
    """Ordered pixel chains of a coarse Canny map, continued through junctions."""
    g = cv2.GaussianBlur(stretched(grey), (0, 0), sigma)
    edges = (cv2.Canny(g, 30, 75) > 0).astype(np.uint8)
    return [p for p in _trace()(edges) if arc_length(p) >= min_length]


def fit_circle(p):
    """Algebraic (Kasa) circle fit. Returns (cx, cy, r, rms residual)."""
    x, y = p[:, 0].astype(np.float64), p[:, 1].astype(np.float64)
    A = np.c_[2*x, 2*y, np.ones(len(p))]
    b = x*x+y*y
    try:
        (cx, cy, c), *_ = np.linalg.lstsq(A, b, rcond=None)
    except np.linalg.LinAlgError:
        return 0, 0, 0, np.inf
    r = np.sqrt(max(c+cx*cx+cy*cy, 0))
    res = np.sqrt(np.mean((np.hypot(x-cx, y-cy)-r)**2))
    return cx, cy, r, res


def _span(p, cx, cy):
    """Start angle and signed sweep of the chain around the centre (unwrapped)."""
    a = np.unwrap(np.arctan2(p[:, 1]-cy, p[:, 0]-cx))
    return float(a[0]), float(a[-1]-a[0])


def arcs_from_chain(p, short_side, tol=1.4, min_sweep=np.radians(14)):
    """Recursively split a chain until each piece fits a circle; keep curved, well-fitted pieces."""
    out = []
    stack = [p]
    while stack:
        q = stack.pop()
        L = arc_length(q)
        if L < short_side*.05 or len(q) < 12:
            continue
        cx, cy, r, res = fit_circle(q)
        ok_r = short_side*.025 < r < short_side*1.2
        if res <= max(tol, .006*r) and ok_r:
            a0, sweep = _span(q, cx, cy)
            sag = r*(1-np.cos(min(abs(sweep), np.pi)/2))
            if abs(sweep) >= min_sweep and sag > 2.5:
                out.append(dict(cx=cx, cy=cy, r=r, a0=a0, sweep=sweep, res=res, pts=q))
            continue
        k = len(q)//2
        stack += [q[:k+1], q[k:]]
    return out


def merge_arcs(arcs, strength, min_sweep=np.radians(50), gap_max=np.radians(28)):
    """Unite arc fragments that one circle fits (an arch broken by a keystone, coffers or shadow).

    Fragments join when a joint circle fit stays tight, not when their separate fits agree: short
    fragments' own centres scatter. Coverage is then read from the joined points' angles."""
    arcs = sorted(arcs, key=lambda a: -arc_length(a['pts']))
    used = [False]*len(arcs)
    out = []
    for i, a in enumerate(arcs):
        if used[i]:
            continue
        used[i] = True
        pts = a['pts']; cx, cy, r = a['cx'], a['cy'], a['r']
        for j in range(i+1, len(arcs)):
            b = arcs[j]
            if used[j] or abs(b['r']-r) > .35*r or np.hypot(b['cx']-cx, b['cy']-cy) > .5*r:
                continue
            both = np.concatenate([pts, b['pts']])
            ncx, ncy, nr, res = fit_circle(both)
            if res <= max(1.8, .01*nr):
                pts, cx, cy, r = both, ncx, ncy, nr; used[j] = True
        ang = np.sort(np.mod(np.arctan2(pts[:, 1]-cy, pts[:, 0]-cx), 2*np.pi))
        if len(ang) < 2:
            continue
        gaps = np.diff(np.r_[ang, ang[0]+2*np.pi])
        start = (int(np.argmax(gaps))+1) % len(ang)
        seq = np.unwrap(np.roll(ang, -start))
        runs = [[seq[0], seq[0]]]
        for t in seq[1:]:
            gap = t-runs[-1][1]
            if gap > np.radians(3):
                tt = np.linspace(runs[-1][1], t, max(3, int(gap*r/1.5)))
                bridge = np.c_[cx+r*np.cos(tt), cy+r*np.sin(tt)]
                if not (gap < gap_max and np.mean(at(strength, bridge) > .1) > .4):
                    runs.append([t, t]); continue
            runs[-1][1] = t
        for lo, hi in runs:
            if hi-lo >= min_sweep:
                out.append(dict(cx=cx, cy=cy, r=r, a0=lo, sweep=hi-lo, res=a['res']))
    return out


def arc_points(arc, step=2.0):
    n = max(3, int(abs(arc['sweep'])*arc['r']/step))
    t = arc['a0']+np.linspace(0, arc['sweep'], n)
    return np.c_[arc['cx']+arc['r']*np.cos(t), arc['cy']+arc['r']*np.sin(t)].astype(np.float32)


def chaikin(p, rounds=2):
    p = np.asarray(p, np.float32)
    for _ in range(rounds):
        if len(p) < 3:
            break
        q = [p[0]]
        for a, b in zip(p[:-1], p[1:]):
            q += [.75*a+.25*b, .25*a+.75*b]
        q.append(p[-1])
        p = np.array(q, np.float32)
    return p


def smooth_curves(chains, short_side, min_share=.1):
    """Long chains that bend steadily one way (a foreshortened arch, a vault, a pointed arch's side).

    Straight chains belong to the perspective lines and wiggling ones to texture; both are refused."""
    out = []
    for c in chains:
        if arc_length(c) < short_side*min_share:
            continue
        q = cv2.approxPolyDP(c.reshape(-1, 1, 2), 1.6, False).reshape(-1, 2).astype(np.float64)
        if len(q) < 4:
            continue
        d = np.diff(q, axis=0)
        a = np.arctan2(d[:, 1], d[:, 0])
        turn = np.angle(np.exp(1j*np.diff(a)))
        net, total = abs(turn.sum()), np.abs(turn).sum()
        if net < np.radians(25) or total > net*1.35+.35 or np.abs(turn).max() > np.radians(50):
            continue
        out.append(chaikin(q))
    return out


def detect_arcs(grey, strength, short_side, chains=None):
    """Fitted arcs that read as arches (centre at or below the curve's highest point)."""
    found = []
    for c in chains if chains is not None else edge_chains(grey, min_length=short_side*.05):
        found += arcs_from_chain(c, short_side)
    merged = merge_arcs(found, strength)
    result = []
    for a in merged:
        p = arc_points(a)
        inside = (p[:, 0] >= 0) & (p[:, 0] < grey.shape[1]) & (p[:, 1] >= 0) & (p[:, 1] < grey.shape[0])
        if inside.mean() < .9:
            continue
        a['points'] = p
        a['length'] = arc_length(p)
        result.append(a)
    # Concentric duplicates (the two sides of one thick moulding edge) collapse to the stronger.
    result.sort(key=lambda a: -a['length'])
    kept = []
    for a in result:
        if any(np.hypot(a['cx']-b['cx'], a['cy']-b['cy']) < 4 and abs(a['r']-b['r']) < 3.5 for b in kept):
            continue
        kept.append(a)
    return kept
