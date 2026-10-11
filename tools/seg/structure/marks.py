"""A small library of hand marks: loose shapes placed by extent, never traced from pixels.

Every mark is a polyline in planning pixels. `rng` is a numpy Generator so a plan is
reproducible from its seed. Variation is small and smooth: a sketcher's hand, not noise.
"""
import numpy as np

from .geom import arc_length, samples


def hand_line(a, b, rng, overshoot=.03, bow=.006, max_over=7.0):
    """A straight stroke with slight overshoot at both ends and a faint bow."""
    a, b = np.asarray(a, np.float64), np.asarray(b, np.float64)
    d = b-a; L = np.linalg.norm(d)
    if L < 1e-6:
        return np.array([a, b], np.float32)
    u = d/L; n = np.r_[-u[1], u[0]]
    o0 = min(max_over, L*overshoot*rng.uniform(.3, 1.2)); o1 = min(max_over, L*overshoot*rng.uniform(.3, 1.2))
    a2, b2 = a-u*o0, b+u*o1
    t = np.linspace(0, 1, max(2, int((L+o0+o1)/3)))
    sag = rng.uniform(-1, 1)*bow*L
    p = a2+(b2-a2)*t[:, None]+n*(sag*np.sin(np.pi*t))[:, None]
    return p.astype(np.float32)


def opening(unit, rng, open_bottom=True):
    """One window or door: jambs and head in a single stroke, plus a sill drawn separately.

    Small openings become a single dark vertical stroke, as a sketcher would dab them."""
    x, y, w, h = unit['x'], unit['y'], unit['w'], unit['h']
    jitter = lambda s: s*(1+rng.uniform(-.03, .03))
    w, h = jitter(w), jitter(h)
    x += rng.uniform(-.6, .6); y += rng.uniform(-.6, .6)
    if w < 7:
        return [('dab', np.array([[x+w/2, y+h*.05], [x+w/2, y+h*.95]], np.float32), w)]
    strokes = []
    if unit.get('arched'):
        r = w/2
        spring = y+r
        t = np.linspace(np.pi, 2*np.pi, 24)
        head = np.c_[x+r+r*np.cos(t), spring+r*np.sin(t)]
        left = np.array([[x, y+h], [x, spring]]); right = np.array([[x+w, spring], [x+w, y+h]])
        p = np.concatenate([samples(left, 3), head, samples(right, 3)])
    else:
        p = samples(np.array([[x, y+h], [x, y], [x+w, y], [x+w, y+h]]), 3)
    strokes.append(('outline', p.astype(np.float32), None))
    sill = hand_line([x-w*.12, y+h], [x+w*1.12, y+h], rng, overshoot=0)
    strokes.append(('sill', sill, None))
    return strokes


def column(unit, rng):
    """Two regular shafts, base to capital; the capital is left to the ornament marks."""
    x0, x1, top, bot = unit['x'], unit['x']+unit['w'], unit['y'], unit['y']+unit['h']
    return [hand_line([x0, top], [x0, bot], rng, overshoot=.01), hand_line([x1, top], [x1, bot], rng, overshoot=.01)]


def scallops(path, size, rng):
    """Foliage edge: a run of small bulging loops along `path` (outward to its left)."""
    p = samples(path, 1.0)
    L = arc_length(p)
    if L < size*1.5:
        return None
    n = max(2, int(L/size))
    d = np.gradient(p, axis=0); d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
    nrm = np.c_[d[:, 1], -d[:, 0]]
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]
    phase = s/L*n*np.pi
    amp = size*.45*(1+.25*np.sin(s/size*1.7+rng.uniform(0, 6)))
    q = p+nrm*(np.abs(np.sin(phase))*amp)[:, None]
    return q[::2].astype(np.float32)


def curls(centre, length, angle, size, rng):
    """A short chain of loose loops ("eee") for carving or leafy tufts, along a direction."""
    n = max(2, int(length/size))
    t = np.linspace(0, n*2*np.pi, n*18)
    u = np.r_[np.cos(angle), np.sin(angle)]; v = np.r_[-u[1], u[0]]
    along = (t/(2*np.pi))*size - length/2 + size*.55*np.cos(t+np.pi)
    across = size*.45*np.sin(t)*(1+.15*rng.uniform(-1, 1))
    p = np.asarray(centre)+along[:, None]*u+across[:, None]*v
    return p.astype(np.float32)


def zigzag(centre, length, angle, size, rng):
    """A loose zigzag along a band (a carved frieze or moulding enrichment)."""
    n = max(3, int(length/size*1.6))
    s = np.linspace(-length/2, length/2, n)
    off = np.where(np.arange(n) % 2, 1, -1)*size*.35*(1+.2*rng.uniform(-1, 1, n))
    u = np.r_[np.cos(angle), np.sin(angle)]; v = np.r_[-u[1], u[0]]
    p = np.asarray(centre)+s[:, None]*u+off[:, None]*v
    return samples(p, 2).astype(np.float32)


def ticks(centre, length, angle, size, rng, count=4):
    """A few short parallel strokes: grass, stone texture or a cast shadow, suggested."""
    u = np.r_[np.cos(angle), np.sin(angle)]; v = np.r_[-u[1], u[0]]
    out = []
    for k in range(count):
        c = np.asarray(centre)+u*(k-(count-1)/2)*length/count+v*rng.uniform(-.2, .2)*size
        tilt = v*.9+u*.35
        out.append(hand_line(c-tilt*size*.5, c+tilt*size*.5, rng, overshoot=0, bow=.02))
    return out


def loose_wave(centre, length, angle, size, rng, pieces=None):
    """Carving or leaf work along a band: an irregular "mmm" wave in two or three broken runs.

    Amplitude and period wander by about a quarter, and the runs leave gaps, so it reads as a
    suggestion of enrichment rather than a spring or a traced outline."""
    u = np.r_[np.cos(angle), np.sin(angle)]; v = np.r_[-u[1], u[0]]
    pieces = pieces or int(rng.integers(2, 4))
    edges = np.sort(rng.uniform(-length/2, length/2, pieces*2-2))
    bounds = np.r_[-length/2, edges, length/2].reshape(-1, 2)
    out = []
    for lo, hi in bounds:
        if hi-lo < size*1.2:
            continue
        s = np.arange(lo, hi, 1.5)
        period = size*(1+.25*np.sin(s/size*.7+rng.uniform(0, 6)))
        phase = np.cumsum(1.5/period)*np.pi
        amp = size*.5*(.75+.25*np.sin(s/(size*2.3)+rng.uniform(0, 6)))
        off = np.abs(np.sin(phase))*amp
        p = np.asarray(centre)+s[:, None]*u-off[:, None]*v
        out.append(p[::2].astype(np.float32))
    return out
