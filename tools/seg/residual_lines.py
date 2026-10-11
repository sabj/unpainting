"""Make a planned drawing agree with what the planned wash leaves for the pen. Planning only.

The wash plan predicts the sheet without ink (paint-plate.mjs --valuepreviewonly writes planned-wash.png). Dividing
it out of the original leaves the ink residual (Part 1's split: one lightness ratio per cell, capped at 1, ratios
within 4% of 1 are no ink). tools/judge/ink-wash-consistency.mjs scores a drawing against that residual. This module
uses the same residual while planning:

  - lines with no residual under them are clutter and are dropped;
  - lines lying inside a broad residual (wider than any pen) are mass the wash should carry, and are dropped;
  - thin residual ink with no planned line near it is traced, fitted and added with the planner's own roles,
    so missed structure lines and hatching the pen should draw become pen paths.

Nothing here knows what the picture is of; every rule is local and measured on the residual.
"""
import cv2
import numpy as np

from lines import arc_length, thin

INK_T = .70        # residual transmittance below this is ink (as in the judge)
STRONG_T = .55     # an added path must be at least this dark on average
TOLERANCE = 2      # cells a line may sit off its evidence
MASS_DEPTH = 3     # residual this far from its own edge is wider than any pen
MIN_ADDED = 10     # shortest added path, cells
SUPPORT_DROP = {'structure': .15, 'opening': .25, 'ornament': .25}
MASS_DROP = .6
TILE = 32          # added texture is limited per tile so hatching is suggested, not copied
TILE_ORNAMENT = 3


def residual(bgr, wash_bgr):
    """Part 1's split at the planner's resolution: T = min(1, L(original)/L(wash)), >0.96 -> 1, floor .02."""
    h, w = bgr.shape[:2]
    wash = cv2.resize(wash_bgr, (w, h), interpolation=cv2.INTER_CUBIC)
    luma = lambda im: (im[..., 2]*.2126+im[..., 1]*.7152+im[..., 0]*.0722).astype(np.float32)
    t = np.minimum(1, luma(bgr)/np.maximum(1, luma(wash)))
    return np.where(t > .96, 1, np.maximum(.02, t)).astype(np.float32)


def _samples(points, step=1.0):
    pts = np.asarray(points, np.float32)
    out = [a+(b-a)*t for a, b in zip(pts[:-1], pts[1:])
           for t in np.linspace(0, 1, max(1, int(np.ceil(np.linalg.norm(b-a)/step))), endpoint=False)]
    return np.array(out+[pts[-1]], np.float32)


def _at(field, pts):
    h, w = field.shape
    p = np.rint(pts).astype(int)
    return field[np.clip(p[:, 1], 0, h-1), np.clip(p[:, 0], 0, w-1)]


def _fields(T):
    ink = (T < INK_T).astype('uint8')
    depth = cv2.distanceTransform(ink, cv2.DIST_L2, 3)
    mass = (depth >= MASS_DEPTH).astype('uint8')
    mass_zone = cv2.dilate(mass, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*MASS_DEPTH+1,)*2))
    near_ink = cv2.dilate(ink, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*TOLERANCE+1,)*2))
    return ink, depth, mass_zone, near_ink


def prune(lines, T):
    """Drop planned lines the residual does not support, or that sit inside a mass. Returns kept, reasons."""
    _, depth, _, near_ink = _fields(T)
    kept, dropped = [], {'clutter': 0, 'mass': 0}
    for g in lines:
        p = _samples(g['points'])
        support = float(np.mean(_at(near_ink, p)))
        in_mass = float(np.mean(_at(depth, p) >= MASS_DEPTH))
        if in_mass > MASS_DROP:
            dropped['mass'] += 1
        elif support < SUPPORT_DROP.get(g.get('role', g.get('kind')), .25):
            dropped['clutter'] += 1
        else:
            kept.append(g | {'residualSupport': round(support, 3)})
    return kept, dropped


def _covered(lines, shape):
    cover = np.zeros(shape, 'uint8')
    for g in lines:
        cv2.polylines(cover, [np.rint(g['points']).astype('int32').reshape(-1, 1, 2)], False, 1, 2*TOLERANCE+1)
    return cover


def add_missing(lines, T, planner, short_side):
    """Trace thin residual ink with no line near it into new paths, with the planner's own fitting and roles."""
    ink, _, mass_zone, _ = _fields(T)
    missing = (ink & (1-mass_zone) & (1-_covered(lines, T.shape))).astype('uint8')
    missing[:2] = 0; missing[-2:] = 0; missing[:, :2] = 0; missing[:, -2:] = 0
    skeleton, _ = thin(missing)
    support = np.clip((INK_T-T)/INK_T, 0, 1)
    paths = planner.join(planner.trace(skeleton), cv2.dilate(support, np.ones((3, 3), 'uint8')))
    occupied = _covered(lines, T.shape)
    tiles, added = {}, []
    for p in sorted(paths, key=lambda p: -arc_length(p)):
        if arc_length(p) < MIN_ADDED:
            continue
        q, straight = planner.fit_path(p)
        if len(q) < 2:
            continue
        dense = _samples(q)
        if float(np.mean(_at(T, dense))) > STRONG_T or float(np.mean(_at(occupied, dense) > 0)) > .5:
            continue
        kind = planner.path_kind(q, straight, short_side)
        if kind == 'ornament':
            tile = tuple((q.mean(axis=0)/TILE).astype(int))
            if tiles.get(tile, 0) >= TILE_ORNAMENT:
                continue
            tiles[tile] = tiles.get(tile, 0)+1
            q = planner.soften_ornament(q)
        cv2.polylines(occupied, [np.rint(q).astype('int32').reshape(-1, 1, 2)], False, 1, 2*TOLERANCE+1)
        added.append(dict(p=q, length=arc_length(q), strength=float(1-np.mean(_at(T, dense))),
                          weight={'structure': .95, 'opening': .72, 'ornament': .46}[kind], kind=kind,
                          straight=bool(straight), flat=0.0, dark=0.0, source='residual'))
    return added


def emit(g):
    """The drawing-file record for one added path, with the planner's widths, taper and weights."""
    q = _samples(g['p'], 2.5)
    distance = np.r_[0, np.cumsum(np.linalg.norm(np.diff(q, axis=0), axis=1))]
    L = distance[-1]
    taper = np.minimum(np.clip(distance/3, .55, 1), np.clip((L-distance)/4, .4, 1))
    width = {'structure': 2.2, 'opening': 1.5, 'ornament': 1.0}[g['kind']]
    variation = 1+.08*np.sin(distance/11)
    return {k: v for k, v in g.items() if k != 'p'} | {
        'points': np.round(q, 3).tolist(), 'widths': np.round(width*variation*taper, 3).tolist(),
        'weights': np.round(g['weight']*(.85+.15*taper), 3).tolist(), 'role': g['kind']}


def refine(lines, bgr, wash_bgr, planner):
    """Lines agreeing with the residual of the planned wash. Returns new lines and a stats record."""
    h, w = bgr.shape[:2]
    T = residual(bgr, wash_bgr)
    kept, dropped = prune(lines, T)
    added = add_missing(kept, T, planner, min(w, h))
    roles = {r: sum(g['kind'] == r for g in added) for r in ('structure', 'opening', 'ornament')}
    stats = {'kept': len(kept), 'dropped': dropped, 'added': len(added), 'addedRoles': roles,
             'residualInkShare': float(np.mean(T < INK_T))}
    return kept+[emit(g) for g in added], stats
