"""Compose a sparse structural drawing: silhouette, perspective lines, arches, repeated openings, ornament.

All image access happens here, before painting. The output is the painter's ordinary
--drawingfile line list with per-point widths and weights in three tiers.
"""
import cv2
import numpy as np

from . import marks
from .curves import detect_arcs, edge_chains, smooth_curves
from .geom import (arc_length, at, edge_strength, is_drawing, ridge_contrast, samples, sharpness, step_contrast,
                   support_fraction)
from .openings import bays, candidate_openings, group_repeats, regularise
from .ornament import ornament_marks, texture_regions
from .perspective import structural_lines

# Requested optical widths in planning cells (the line-quality calibration: 2.2/1.5/1.0) and pen darkness.
TIERS = {
    'silhouette': (2.5, 1.0, 'structure'),
    'structure': (2.2, .95, 'structure'),
    'secondary': (1.6, .8, 'structure'),
    'opening': (1.5, .72, 'opening'),
    'ornament': (1.0, .46, 'ornament'),
}

DEFAULTS = dict(max_structure=22, max_secondary=28, min_line=.05, border=.03, max_groups=16,
                max_single_openings=6, ornament_regions=6, max_curves=14, min_sharpness=.2)


def _near_border(seg, w, h, inset):
    """A line hugging the frame (a scan edge or mount) parallel to it."""
    x0, y0, x1, y1 = seg
    horiz = abs(y1-y0) < abs(x1-x0)*.05; vert = abs(x1-x0) < abs(y1-y0)*.05
    if horiz and (max(y0, y1) < inset or min(y0, y1) > h-inset):
        return True
    return vert and (max(x0, x1) < inset or min(x0, x1) > w-inset)


def _clip(seg, w, h, inset):
    """Clip a segment to the frame inset by `inset`; None if nothing is left."""
    ok, a, b = cv2.clipLine((int(inset), int(inset), int(w-2*inset), int(h-2*inset)),
                            tuple(np.rint(seg[:2]).astype(int).tolist()), tuple(np.rint(seg[2:]).astype(int).tolist()))
    return np.r_[a, b].astype(np.float32) if ok else None


def sky_mask(grey, short_side, bgr=None):
    """Smooth, bright area connected to the top edge, grown out to the real edge. Empty when none.

    The smoothness test stops a few pixels short of every edge; growing by colour similarity puts
    the boundary, and so the silhouette stroke, on the building rather than in the sky."""
    h, w = grey.shape
    mean = cv2.GaussianBlur(grey, (0, 0), 3)
    var = cv2.GaussianBlur(grey*grey, (0, 0), 3)-mean*mean
    smooth = (var < .0012) & (mean > np.percentile(grey, 60))
    smooth = cv2.morphologyEx(smooth.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    count, labels = cv2.connectedComponents(smooth)
    top = set(np.unique(labels[0])) - {0}
    m = np.isin(labels, list(top)).astype(np.uint8)
    if m.mean() <= .03:
        return np.zeros_like(m)
    if bgr is not None:
        lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
        for _ in range(4):
            ring = (cv2.dilate(m, np.ones((5, 5), np.uint8)) > 0) & (m == 0)
            # Compare with the nearby sky colour (blurred over the mask), not a single global sky tone.
            sky_col = cv2.GaussianBlur(lab*m[..., None], (0, 0), 6)/np.maximum(cv2.GaussianBlur(m.astype(np.float32), (0, 0), 6), 1e-3)[..., None]
            close = np.linalg.norm(lab-sky_col, axis=2) < 10
            m = (m | (ring & close)).astype(np.uint8)
        # Smooth the grown boundary so pixel-level growth does not read as foliage.
        m = (cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.5) > .5).astype(np.uint8)
    return m


def silhouettes(sky, short_side, rng):
    """Sky boundary split into straight-ish silhouette strokes and rough (tree) edges."""
    h, w = sky.shape
    contours, _ = cv2.findContours(sky, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    strokes, rough = [], []
    for c in contours:
        p = c.reshape(-1, 2).astype(np.float32)
        on_frame = (p[:, 0] <= 2) | (p[:, 0] >= w-3) | (p[:, 1] <= 2) | (p[:, 1] >= h-3)
        runs, cur = [], []
        for q, f in zip(p, on_frame):
            if f:
                if len(cur) > 8:
                    runs.append(np.array(cur))
                cur = []
            else:
                cur.append(q)
        if len(cur) > 8:
            runs.append(np.array(cur))
        for r in runs:
            if arc_length(r) < short_side*.06:
                continue
            for kind, piece in _split_by_roughness(r, short_side):
                simple = cv2.approxPolyDP(piece.reshape(-1, 1, 2), 2.0, False).reshape(-1, 2).astype(np.float32)
                if arc_length(simple) >= short_side*.03:
                    (rough if kind else strokes).append(simple)
    return strokes, rough


def _split_by_roughness(r, short_side):
    """Cut a boundary into runs of roof/wall (few corners) and tree crown (many small bends).

    Roughness is counted per window of about 5% of the short side, so a tree beside a gable no
    longer turns the whole skyline into foliage or the foliage into a heavy silhouette."""
    win = max(12, int(short_side*.05))
    n = len(r)
    flags = []
    for s in range(0, n, win):
        seg = r[max(0, s-win//2):min(n, s+win+win//2)]
        if len(seg) < 4:
            flags.append(flags[-1] if flags else False); continue
        simple = cv2.approxPolyDP(seg.reshape(-1, 1, 2).astype(np.float32), 2.5, False)
        flags.append(len(simple)-1 > 5)
    out = []
    start = 0
    for k in range(1, len(flags)+1):
        if k == len(flags) or flags[k] != flags[start]:
            out.append((flags[start], r[start*win:min(n, k*win+1)]))
            start = k
    return out


def _is_vertical_vp(v, w, h):
    if abs(v[2]) < 1e-9:
        return abs(v[1]) > abs(v[0])
    x, y = v[0]/v[2]-w/2, v[1]/v[2]-h/2
    return abs(y) > 3*abs(x) and abs(y) > h


def _iou(a, b):
    x0, y0 = max(a['x'], b['x']), max(a['y'], b['y'])
    x1, y1 = min(a['x']+a['w'], b['x']+b['w']), min(a['y']+a['h'], b['y']+b['h'])
    inter = max(0, x1-x0)*max(0, y1-y0)
    return inter/max(a['w']*a['h']+b['w']*b['h']-inter, 1e-9)


def _occupancy_ok(occupied, p, limit=.6, halo=False):
    q = samples(p, 1.5)
    v = at(occupied, q)
    return float(np.mean(v > 0 if halo else v == 1)) <= limit


def _draw(occupied, p, width=3):
    """Mark a stroke's corridor; a wider halo (value 2) keeps later secondary lines from doubling it."""
    q = [np.rint(p).astype(np.int32).reshape(-1, 1, 2)]
    halo = np.zeros_like(occupied)
    cv2.polylines(halo, q, False, 1, 9)
    occupied[(halo > 0) & (occupied == 0)] = 2
    cv2.polylines(occupied, q, False, 1, width)


def plan(bgr, seed=0, options=None):
    opt = dict(DEFAULTS, **(options or {}))
    rng = np.random.default_rng(seed)
    h, w = bgr.shape[:2]; short = min(w, h)
    grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)/255
    smooth = cv2.bilateralFilter(np.uint8(grey*255), 7, 30, 5).astype(np.float32)/255
    strength = edge_strength(smooth)
    contrast = max(.12, float(np.diff(np.percentile(grey, [2, 98]))[0]))
    inset = opt['border']*short
    # Contrast across a line relative to its neighbourhood: a shallow projection in a sunlit wall
    # counts as much as a wall against deep shadow. Half the global range bounds it from below so
    # flat paper does not turn faint noise into structure.
    mu = cv2.GaussianBlur(smooth, (0, 0), short*.04)
    local = np.sqrt(np.maximum(cv2.GaussianBlur(smooth*smooth, (0, 0), short*.04)-mu*mu, 0))

    g1 = cv2.GaussianBlur(grey, (0, 0), 1.0)
    fine = np.hypot(cv2.Sobel(g1, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(g1, cv2.CV_32F, 0, 1, ksize=3))/8

    drawing = is_drawing(bgr)

    def rel(p):
        norm = max(contrast*.35, 2.5*float(np.median(at(local, samples(p, 4)))))
        c = step_contrast(smooth, p)
        if drawing:
            # In a pen drawing the structure is the artist's own line, a dark ridge with no step.
            c = max(c, .8*ridge_contrast(grey, p))
        return c/norm
    strokes = []          # (tier, polyline, kind)
    occupied = np.zeros((h, w), np.uint8)

    # 1. Silhouette against the sky, heaviest.
    sky = sky_mask(smooth, short, bgr)
    sil, rough = silhouettes(sky, short, rng)
    for p in sorted(sil, key=lambda p: -arc_length(p)):
        # A sky gradient or vignette also bounds the mask; only a real step is a silhouette.
        if step_contrast(smooth, p) < contrast*.12:
            continue
        strokes.append(('silhouette', p, 'silhouette')); _draw(occupied, p)

    # 2. Perspective lines, scored by length x contrast across the line.
    lines, vps, raw = structural_lines(smooth, strength, short, seed=seed)
    scored = []
    for g in lines:
        seg = _clip(g['seg'], w, h, inset)
        if seg is None or _near_border(g['seg'], w, h, inset*1.3):
            continue
        p = seg.reshape(2, 2); L = arc_length(p)
        if L < opt['min_line']*short*.8:
            continue
        sup = support_fraction(strength, p)
        if sup < .5:
            continue
        if sky.any() and np.mean(at(sky, samples(p, 3))) > .5:
            continue
        sc = rel(p)
        # Soft-edged cast shadows (dappled light) are not architecture.
        if not drawing and sc > .05 and sharpness(smooth, p, fine) < opt['min_sharpness']:
            continue
        scored.append(dict(seg=seg, length=L, score=L*min(sc, .6)*sup, sc=sc, vp=g['vp']))

    # 3. Arches: fitted circles where they fit, otherwise steadily bending curves.
    chains = edge_chains(smooth, min_length=short*.05)
    arcs = detect_arcs(smooth, strength, short, chains)
    curve_items = []
    for a in arcs:
        sc = rel(a['points'])
        if a['length'] >= short*.08 and support_fraction(strength, a['points']) >= .5 and sc >= .08:
            curve_items.append(dict(points=a['points'], score=a['length']*min(sc, .6), r=a['r'], kind='arch'))
    for p in smooth_curves(chains, short):
        sc = rel(p)
        if sc >= .08:
            curve_items.append(dict(points=p, score=arc_length(p)*min(sc, .6)*.9, r=short, kind='curve'))
    curve_items.sort(key=lambda c: -c['score'])

    # 4. Bays: vertical pairs become repeated openings or columns with one shared shape.
    units, used = bays(scored, smooth, short, arcs, contrast)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    leafy = ((hsv[..., 0] >= 30) & (hsv[..., 0] <= 95) & (hsv[..., 1] > 46)).astype(np.uint8)
    leafy = cv2.dilate(leafy, np.ones((7, 7), np.uint8))
    # Gaps between leaves are dark and compact too; openings belong to walls, not tree crowns.
    blobs = [c for c in candidate_openings(smooth, short, exclude=sky | leafy) if not any(_iou(c, u) > .2 for u in units)]
    for c in blobs:
        c['kind'] = 'opening'
    row_vps = [v for v, _ in vps if not _is_vertical_vp(v, w, h)]
    groups = sorted(group_repeats(units+blobs, row_vps=row_vps), key=lambda g: -len(g)*np.mean([c['w']*c['h'] for c in g]))
    repeated, n_groups, n_single = [], 0, 0
    for g in groups:
        if len(g) >= 2 and n_groups < opt['max_groups']:
            repeated.append(regularise(g)); n_groups += 1
        elif len(g) == 1 and n_single < opt['max_single_openings'] and (abs(g[0].get('tone', 0)) > .25 or (g[0].get('fill', 0) > .8 and g[0].get('darkness', 0) > .4)):
            repeated.append(g); n_single += 1
    drawn = {k for grp in repeated for u in grp for k in u.get('lines', ())}
    scored = [g for k, g in enumerate(scored) if k not in drawn]
    scored.sort(key=lambda g: -g['score'])

    # Draw in hierarchy order: big curves and the strongest lines, then repeated units, then the
    # secondary lines that are still unexplained, within budget.
    n_struct = n_sec = 0
    for c in curve_items[:opt['max_curves']]:
        if not _occupancy_ok(occupied, c['points'], .5):
            continue
        tier = 'structure' if c['r'] > short*.08 and n_struct < opt['max_structure'] else 'secondary'
        strokes.append((tier, c['points'], c['kind'])); _draw(occupied, c['points'])
        n_struct += tier == 'structure'
    rest = []
    for g in scored:
        p = g['seg'].reshape(2, 2)
        if n_struct < opt['max_structure'] and g['sc'] > .12 and g['length'] >= opt['min_line']*short*1.5:
            if _occupancy_ok(occupied, p, .5, halo=True):
                q = marks.hand_line(p[0], p[1], rng)
                strokes.append(('structure', q, 'perspective')); _draw(occupied, q); n_struct += 1
        else:
            rest.append(g)
    claimed = cv2.dilate((occupied == 1).astype(np.uint8), np.ones((3, 3), np.uint8))
    opening_units = columns = 0
    for group in repeated:
        for u in group:
            if u.get('kind') == 'column':
                for p in marks.column(u, rng):
                    strokes.append(('secondary', p, 'column')); _draw(occupied, p)
                columns += 1
                continue
            for kind, p, dab in marks.opening(u, rng):
                strokes.append(('opening', p, 'opening-'+kind if dab is None else 'opening-dab'))
                _draw(occupied, p)
            opening_units += 1
        for u in group:
            x, y, uw, uh = (int(round(v)) for v in (u['x'], u['y'], u['w'], u['h']))
            claimed[max(0, y):y+uh+1, max(0, x):x+uw+1] = 1
    for g in rest:
        p = g['seg'].reshape(2, 2)
        if n_sec >= opt['max_secondary'] or g['sc'] <= .05 or g['length'] < opt['min_line']*short:
            continue
        if not _occupancy_ok(occupied, p, .4, halo=True):
            continue
        q = marks.hand_line(p[0], p[1], rng)
        strokes.append(('secondary', q, 'perspective')); _draw(occupied, q); n_sec += 1

    # 5. Ornament: loose suggestions where fine texture remains unexplained.
    claimed = np.maximum(claimed, (occupied == 1).astype(np.uint8))
    regions = texture_regions(bgr, smooth, short, claimed | sky, max_regions=opt['ornament_regions'])
    orn = ornament_marks(regions, short, rng)
    for p in rough:
        s = marks.scallops(p, short*.025, rng)
        if s is not None:
            orn.append(('foliage-edge', s))
    for kind, p in orn:
        strokes.append(('ornament', p, kind))

    lines_out = [_stroke(tier, p, kind, rng) for tier, p, kind in strokes if arc_length(p) >= 3]
    lines_out = [g for g in lines_out if g is not None]
    stats = dict(segments=int(len(raw)), vanishingPoints=[_vp_json(v, w, h) for v, _ in vps],
                 perspectiveCandidates=len(scored), curves=len(curve_items), bays=len(units), columns=columns,
                 openingCandidates=len(blobs), openingGroups=n_groups, openingUnits=opening_units,
                 ornamentRegions=[dict(kind=r['kind'], area=r['area']) for r in regions],
                 sky=float(sky.mean()), drawing=bool(drawing), kept=len(lines_out),
                 roles={t: sum(1 for g in lines_out if g['tier'] == t) for t in TIERS})
    return lines_out, stats


def _vp_json(v, w, h):
    if abs(v[2]) < 1e-9 or np.hypot(*(v[:2]/v[2])) > 1e6:
        d = v[:2]/np.linalg.norm(v[:2])
        return dict(infinite=True, dx=round(float(d[0]), 4), dy=round(float(d[1]), 4))
    return dict(infinite=False, x=round(float(v[0]/v[2]), 1), y=round(float(v[1]/v[2]), 1))


def _stroke(tier, p, kind, rng):
    width, weight, role = TIERS[tier]
    q = samples(np.asarray(p, np.float32), 2.5)
    if len(q) < 2:
        return None
    dist = np.r_[0, np.cumsum(np.linalg.norm(np.diff(q, axis=0), axis=1))]
    L = dist[-1]
    taper = np.minimum(np.clip(dist/4, .55, 1), np.clip((L-dist)/5, .45, 1))
    phase = rng.uniform(0, 6.28)
    pressure = 1+.1*np.sin(dist/13+phase)
    widths = width*taper*pressure
    if kind == 'opening-dab':
        widths = np.maximum(widths, min(3.2, width*1.6))
    weights = weight*(.85+.15*taper)
    return dict(points=np.round(q, 2).tolist(), widths=np.round(widths, 3).tolist(),
                weights=np.round(weights, 3).tolist(), role=role, tier=tier, kind=kind,
                length=round(float(L), 2), weight=weight)
