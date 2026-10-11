"""Small geometry helpers shared by the structure planner. numpy and OpenCV only."""
import cv2
import numpy as np


def samples(points, step=1.0):
    """Resample a polyline at roughly `step` pixel spacing, keeping both ends."""
    p = np.asarray(points, np.float32)
    if len(p) < 2:
        return p
    out = []
    for a, b in zip(p[:-1], p[1:]):
        n = max(1, int(np.ceil(np.linalg.norm(b-a)/step)))
        for t in np.arange(n)/n:
            out.append(a + (b-a)*t)
    out.append(p[-1])
    return np.array(out, np.float32)


def at(field, points):
    """Nearest-pixel lookup of a 2-D field at (x, y) points, clamped to the frame."""
    h, w = field.shape[:2]
    q = np.rint(np.asarray(points)).astype(int)
    return field[np.clip(q[:, 1], 0, h-1), np.clip(q[:, 0], 0, w-1)]


def arc_length(points):
    p = np.asarray(points, np.float64)
    if len(p) < 2:
        return 0.0
    return float(np.linalg.norm(np.diff(p, axis=0), axis=1).sum())


def normals(points):
    """Unit normals of a polyline, one per point."""
    p = np.asarray(points, np.float32)
    d = np.gradient(p, axis=0)
    d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
    return np.c_[-d[:, 1], d[:, 0]]


def step_contrast(grey, points, near=2.0, far=7.0):
    """Mean tone difference between the two sides of a path, sampled `near`..`far` px away.

    A mass boundary (wall against sky, jamb against void) differs across the line. A mortar
    joint or hatching stroke is a thin dark ridge with the same tone either side, so it scores low.
    """
    p = samples(points, 2.0)
    if len(p) < 2:
        return 0.0
    n = normals(p)
    offsets = np.linspace(near, far, 3)
    a = np.mean([at(grey, p + n*o) for o in offsets], axis=0)
    b = np.mean([at(grey, p - n*o) for o in offsets], axis=0)
    return float(np.median(np.abs(a-b)))


def edge_strength(grey, sigma=1.2):
    """Gradient magnitude normalised by the image's own contrast (98th percentile -> 1)."""
    g = cv2.GaussianBlur(grey, (0, 0), sigma)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    m = np.hypot(gx, gy)
    return np.clip(m/max(1e-6, float(np.percentile(m, 98))), 0, 1)


def support_fraction(strength, points, threshold=.18):
    p = samples(points, 1.5)
    return float(np.mean(at(strength, p) > threshold)) if len(p) else 0.0


def sharpness(grey, points, fine):
    """Peak fine-scale gradient across a path relative to its step: ~.4 for a crisp edge, ~.1 for a
    soft cast-shadow penumbra. `fine` is the sigma-1 gradient magnitude in grey units per pixel."""
    p = samples(points, 2.0)
    if len(p) < 2:
        return 0.0
    n = normals(p)
    peak = np.max([at(fine, p + n*o) for o in (-1.5, -.75, 0, .75, 1.5)], axis=0)
    step = step_contrast(grey, points)
    return float(np.median(peak))/max(step, 1e-3)


def ridge_contrast(grey, points, side=3.0):
    """How much darker a path is than both of its sides: a pen line or joint, as opposed to a step."""
    p = samples(points, 2.0)
    if len(p) < 2:
        return 0.0
    n = normals(p)
    centre = np.min([at(grey, p + n*o) for o in (-1, 0, 1)], axis=0)
    a = at(grey, p + n*side); b = at(grey, p - n*side)
    return float(np.median(np.minimum(a, b)-centre))


def is_drawing(bgr):
    """A pen or wash drawing on paper: most pixels sit near one light paper tone, colour is muted.

    Photographs of buildings have neither property. Used only to decide whether a thin dark line
    (ridge) counts as structure, as it does in a drawing, or as texture such as a mortar joint."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    v = hsv[..., 2].astype(np.float32)/255
    paper = float(np.percentile(v, 75))
    near = float(np.mean(np.abs(v-paper) < .08))
    return near > .45 and float(np.median(hsv[..., 1]))/255 < .25
