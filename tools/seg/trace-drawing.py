#!/usr/bin/env python3
# Pipeline: inking, stage 1 (line source: a clean line drawing made for the purpose, black lines on white).
"""Trace a clean line drawing into pen strokes: one stroke per drawn line, straight runs straight, arcs clean.

The drawing is enlarged before thinning, so two lines a pixel apart stay two lines and a centre line does not step from
pixel to pixel. Each traced line is carried through its junctions (sketch-lines.py), cut at its corners, and each piece
is replaced by a straight run or a circular arc where one fits within --fit source pixels, else by a smoothed curve.
Emits the ordinary drawingfile JSON (points and one width per line, in source pixels; widthMm with --sheetmm).

--medium pencil reads a pencil drawing instead: grey lines of every weight on a paper that may not be white. The paper is
found locally (a light construction line is measured against the paper around it, not against white), graphite grain is
blurred out, the threshold comes from the paper's own noise, and a faint run is kept only where it joins a firmer one
(hysteresis). Lines closer than a stroke width fuse into one stroke (a doubled line is drawn twice where it splits). The
traced line keeps the hand's wobble: it is smoothed, not replaced by straight runs and arcs. Each point carries the drawing's
own darkness there as `weights` (0..1, the firmest lines near 1), so the pencil presses as the drawing was pressed.
--reweigh FILE puts those weights on another line file's points (one re-ordered or joined after tracing).
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import cv2
import numpy as np
from lines import thin, arc_length, prune_spurs

spec = importlib.util.spec_from_file_location('sketch', Path(__file__).with_name('sketch-lines.py'))
sketch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sketch)


def resample(p, step):
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(p, axis=0).T))]
    if d[-1] <= 0:
        return p[:1]
    t = np.linspace(0, d[-1], max(2, int(round(d[-1]/step))+1))
    return np.c_[np.interp(t, d, p[:, 0]), np.interp(t, d, p[:, 1])]


def smooth(p, sigma):
    """Gaussian smoothing along a path sampled at unit steps of `sigma`'s unit; the ends stay (a closed path wraps)."""
    n = len(p); r = int(3*sigma)
    if n < 5 or r < 1:
        return p
    k = np.exp(-.5*(np.arange(-r, r+1)/sigma)**2); k /= k.sum()
    closed = np.allclose(p[0], p[-1]) and n > 2*r
    q = np.vstack([p[-r-1:-1], p, p[1:r+1]]) if closed else np.vstack([2*p[0]-p[r:0:-1], p, 2*p[-1]-p[-2:-r-2:-1]]) if n > r else p
    if len(q) != n+2*r:
        return p
    return np.c_[np.convolve(q[:, 0], k, 'valid'), np.convolve(q[:, 1], k, 'valid')]


def corners(p, reach, degrees):
    """Indices where the path turns by more than `degrees` between the chords `reach` samples either side."""
    n = len(p)
    if n < 2*reach+1:
        return []
    a = p[reach:n-reach]-p[:n-2*reach]; b = p[2*reach:]-p[reach:n-reach]
    turn = np.degrees(np.abs(np.arctan2(a[:, 0]*b[:, 1]-a[:, 1]*b[:, 0], (a*b).sum(1))))
    out = []
    for i in np.argsort(-turn):
        if turn[i] < degrees:
            break
        if all(abs(i+reach-j) > reach for j in out):
            out.append(int(i+reach))
    return sorted(out)


def fit_piece(p, tol, depth=0):
    """A piece between corners as a straight run, a circular arc, or (split once or twice at its farthest point) a smoothed curve."""
    a, b = p[0], p[-1]; chord = np.hypot(*(b-a))
    if len(p) < 4:
        return np.vstack([a, b])
    c = p.mean(0); _, _, vt = np.linalg.svd(p-c, full_matrices=False); d = vt[0]; nrm = np.array([-d[1], d[0]])
    if np.abs((p-c)[:, 0]*nrm[0]+(p-c)[:, 1]*nrm[1]).max() <= tol and chord > 0:
        return np.vstack([c+np.dot(a-c, d)*d, c+np.dot(b-c, d)*d])
    # circle through the points (algebraic fit); a clean arc when every point lies within tol of it
    A = np.c_[2*p, np.ones(len(p))]; sol, *_ = np.linalg.lstsq(A, (p*p).sum(1), rcond=None)
    o = sol[:2]; r2 = sol[2]+o@o
    if r2 > 0:
        r = np.sqrt(r2); length = arc_length(p)
        if np.abs(np.hypot(*(p-o).T)-r).max() <= tol and r < 40*length and length < 1.9*np.pi*r:
            ang = np.unwrap(np.arctan2(p[:, 1]-o[1], p[:, 0]-o[0]))
            if np.all(np.diff(smooth(np.c_[ang, ang], 3)[:, 0]) * np.sign(ang[-1]-ang[0]) >= -1e-3):
                t = np.linspace(ang[0], ang[-1], max(3, int(abs(ang[-1]-ang[0])*r)+2))
                return np.c_[o[0]+r*np.cos(t), o[1]+r*np.sin(t)]
    if depth < 2 and chord > 0:
        u = (b-a)/chord; dev = np.abs(-(p-a)[:, 0]*u[1]+(p-a)[:, 1]*u[0]); k = int(np.argmax(dev))
        if 3 <= k <= len(p)-4:
            left, right = fit_piece(p[:k+1], tol, depth+1), fit_piece(p[k:], tol, depth+1)
            return np.vstack([left[:-1], (left[-1]+right[0])/2, right[1:]])
    return p


def fair(p, tol, spacing):
    """One traced line (dense points, `spacing` source pixels apart) as straight runs and arcs joined at its corners."""
    per = max(1, int(round(1/spacing)))
    s = smooth(p, .7*per)
    cut = [0, *corners(s, 2*per, 38), len(s)-1]
    out = None
    for i, j in zip(cut, cut[1:]):
        if j-i < 1:
            continue
        piece = fit_piece(s[i:j+1], tol)
        out = piece if out is None else np.vstack([out[:-1], (out[-1]+piece[0])/2, piece[1:]])
    return s[[0, -1]] if out is None else out


def dense_strokes(grey, region, spacing, width, min_px=3.0, max_len=None, turn_deg=35, min_width=.4, spread=1.6):
    """Strokes along the drawing's own direction inside a dense region: streamlines of the structure tensor's line
    direction, seeded on dark cells and kept `spacing` source pixels apart, each a single pull that stops where the ink
    ends, where it leaves the region, or where it would turn by more than `turn_deg` (a junction is a break, not a turn).
    Each stream is as wide as the drawing's tone around it allows (tone x spacing over `spread`, the pen's spread of a drawn
    width on the sheet, from `min_width` up to `width`):
    a solid dark lays strokes that touch, a hatched or strand-lit coat lays separate strands with paper between, and a
    stream's weight is the drawing's darkness along it, so a light strand is a light stroke."""
    dark = 1-np.clip(grey, 0, 1); H, W = grey.shape
    # the drawing's tone around each point, over about one spacing: 1 in a solid dark, near .5 in strands with paper between
    cover = cv2.GaussianBlur(dark, (0, 0), max(.7, spacing/2))
    gx = cv2.Sobel(grey, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(grey, cv2.CV_32F, 0, 1, ksize=3)
    sg = max(1., spacing)
    jxx = cv2.GaussianBlur(gx*gx, (0, 0), sg); jyy = cv2.GaussianBlur(gy*gy, (0, 0), sg); jxy = cv2.GaussianBlur(gx*gy, (0, 0), sg)
    theta = .5*np.arctan2(2*jxy, jxx-jyy)+np.pi/2          # along the lines, across the gradient
    tx, ty = np.cos(theta), np.sin(theta)
    max_len = max_len or 40*spacing
    # no stream comes nearer another than `spacing`: a stream's samples claim the pixels within r of them
    occ = np.zeros((H, W), bool); r = max(1, int(np.ceil(spacing/2)))
    def free(x, y):
        i, j = int(round(x)), int(round(y))
        return 0 <= i < W and 0 <= j < H and region[j, i] and not occ[j, i]
    out = []; cos_turn = np.cos(np.radians(turn_deg))
    ys, xs = np.nonzero(region & (dark > .45))
    order = np.argsort(-dark[ys, xs])
    for n in order[::max(1, int(spacing))]:
        x0, y0 = float(xs[n]), float(ys[n])
        if not free(x0, y0): continue
        halves = []
        for sgn in (1, -1):
            pts = []; x, y = x0, y0; d0 = None; L = 0
            while L < max_len/2:
                i, j = int(round(x)), int(round(y))
                d = np.array([tx[j, i], ty[j, i]])*sgn
                if d0 is not None:
                    if d @ d0 < 0: d = -d
                    if d @ d0 < cos_turn: break
                nx, ny = x+.75*d[0], y+.75*d[1]
                if not (0 <= nx < W-1 and 0 <= ny < H-1) or dark[int(round(ny)), int(round(nx))] < .2 or not free(nx, ny): break
                pts.append((nx, ny)); x, y, d0 = nx, ny, d; L += .75
            halves.append(pts)
        p = np.array(halves[1][::-1]+[(x0, y0)]+halves[0])
        if len(p) < 2 or arc_length(p) < min_px: continue
        for (x, y) in p:
            i, j = int(round(x)), int(round(y)); occ[max(0, j-r+1):j+r, max(0, i-r+1):i+r] = True
        q = resample(p, 1)
        jj, ii = np.clip(q[:, 1].round().astype(int), 0, H-1), np.clip(q[:, 0].round().astype(int), 0, W-1)
        wt = float(np.clip(np.median(dark[jj, ii])/.85, .25, 1))
        wd = float(np.clip(np.median(cover[jj, ii])*spacing/spread, min_width, width))
        out.append({'points': np.round(q[::max(1, len(q)//12)] if len(q) > 24 else q, 3).tolist(), 'width': round(wd, 3), 'weight': round(wt, 3), 'role': 'pen stroke', 'length': arc_length(q), 'dense': True})
    return out


def territory_widths(streams, dark, region, reach, max_width, spread=1.9, min_width=.4):
    """Each stream's width from the ink it stands for: the pixels of the dense region nearer to it than to any other stream
    (within `reach`) are its territory, and it is drawn as wide as the territory's tone times its breadth (area over length),
    over the pen's `spread` of a drawn width on the sheet. A solid dark gets strands that close up into solid; strands lit
    by paper between them stay apart, as thin as the drawing's light strands."""
    if not streams:
        return
    H, W = dark.shape; ids = np.zeros((H, W), np.float32)
    for k, l in enumerate(streams):
        cv2.polylines(ids, [np.int32(np.round(l['points']))], False, float(k+1), 1)
    src = (ids == 0).astype(np.uint8)
    dist, lab = cv2.distanceTransformWithLabels(src, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    zy, zx = np.nonzero(src == 0); owner_of = np.zeros(lab.max()+1, np.int64); owner_of[lab[zy, zx]] = ids[zy, zx].astype(np.int64)
    own = owner_of[lab]; own[(dist > reach) | ~region] = 0
    # a light strand inside a dark coat stays paper: no stream is drawn wide enough to reach the nearest light pixel
    to_light = cv2.distanceTransform((dark >= .55).astype(np.uint8), cv2.DIST_L2, 5)
    n = len(streams)+1
    area = np.bincount(own.ravel(), minlength=n).astype(float); tone = np.bincount(own.ravel(), weights=dark.ravel(), minlength=n)
    for k, l in enumerate(streams):
        a = area[k+1]
        if a <= 0: continue
        breadth = a/max(1.0, l['length']); t = tone[k+1]/a
        # a solid dark (tone .94 and over) closes up: its strands are drawn wide enough to overlap their neighbours
        s = float(np.clip((t-.82)/.12, 0, 1)); w = (1-s)*t*breadth/spread + s*.75*breadth
        q = np.asarray(l['points']); d = float(np.median(to_light[np.clip(q[:, 1].round().astype(int), 0, H-1), np.clip(q[:, 0].round().astype(int), 0, W-1)]))
        l['width'] = round(float(np.clip(min(w, 2*d/1.3), min_width, max_width)), 3)


def solid_fills(solid, dark, zoom, width_px, spacing_px, min_len_px, edge=None):
    """Solid darks (ink wider than a nib, a pane, a leaf, a dark gap in a gate) filled as a person fills with a pen: close
    parallel strokes in the direction of the shape (its long axis), each a whole pull from edge to edge, `spacing_px` apart
    and `width_px` wide so they close up. `solid` is at the zoomed scale; the strokes come back in source pixels. A shape too
    small for a stroke along its axis is one stroke through its middle as wide as it is. A grey area (a pane drawn mid-grey,
    `dark` its darkness 0..1 at the zoomed scale) is filled as dark as it is drawn: its strokes lighter and spaced wider, paper
    between them. `edge` (distance to the paper, zoomed pixels) narrows a stroke where the dark narrows, so a pen stroke
    never covers the white gap of a lattice: its width there is at most twice that distance."""
    out = []
    n, lab, st, _ = cv2.connectedComponentsWithStats(solid.astype(np.uint8), connectivity=8)
    for k in range(1, n):
        x, y, w, h = st[k, :4]
        sub = (lab[y:y+h, x:x+w] == k)
        ys, xs = np.nonzero(sub)
        if len(xs) < 4: continue
        tone = float(np.median(dark[y:y+h, x:x+w][sub])); wt = float(np.clip(tone/.85, .25, 1)); sp = spacing_px/max(.4, min(1., tone/.8))
        P = np.c_[xs+x, ys+y].astype(float); c = P.mean(0); _, _, vt = np.linalg.svd(P-c, full_matrices=False); d = vt[0]
        if abs(d[1]) > abs(d[0]) and d[1] < 0 or abs(d[0]) >= abs(d[1]) and d[0] < 0: d = -d   # pulled down, or left to right
        nrm = np.array([-d[1], d[0]])
        with np.errstate(all='ignore'):   # (Accelerate's matmul warns spuriously on finite input)
            u = (P-c)@d; v = (P-c)@nrm
        vs = np.arange(v.min()+sp/2, v.max()-sp/2+1e-6, sp) if v.max()-v.min() > sp else np.array([(v.min()+v.max())/2])
        wd = width_px if len(vs) > 1 else max(width_px*.6, v.max()-v.min()+1)
        for vv in vs:
            band = np.abs(v-vv) <= .5
            if band.sum() < 2: band = np.abs(v-vv) <= sp/2
            if not band.any(): continue
            uu = np.sort(u[band]); cut = np.nonzero(np.diff(uu) > 2.5)[0]
            for a, b in zip(np.r_[0, cut+1], np.r_[cut, len(uu)-1]):
                lo, hi = uu[a]+wd/2*.6, uu[b]-wd/2*.6
                if hi-lo < min_len_px:
                    if uu[b]-uu[a] < min_len_px*.5: continue
                    lo, hi = uu[a], uu[b]
                m = max(2, int(np.ceil((hi-lo)/(wd/2)))+1); uu_ = np.linspace(lo, hi, m)
                q = c+uu_[:, None]*d+vv*nrm
                ws = np.full(m, wd)
                if edge is not None: ws = np.minimum(ws, 1.8*sketch.at(edge, q))
                # where the dark pinches to a gap the stroke lifts: the pieces either side are strokes of their own
                ok = ws >= .35*wd; cuts = np.flatnonzero(np.diff(np.r_[0, ok.astype(int), 0]))
                for a0, b0 in zip(cuts[::2], cuts[1::2]):
                    if b0-a0 < 2: continue
                    qq, ww = (q[a0:b0]+.5)/zoom-.5, ws[a0:b0]
                    if arc_length(qq)*zoom < .6*min_len_px: continue
                    line = {'points': np.round(qq, 3).tolist(), 'width': round(float(np.median(ww)/zoom), 3), 'weight': round(wt, 3), 'role': 'pen stroke', 'length': float(arc_length(qq)), 'fill': True}
                    if ww.min() < .95*wd: line['widths'] = np.round(ww/zoom, 3).tolist()
                    out.append(line)
    return out


def plan(bgr, zoom=4, ink=.2, fit=.6, min_px=3.0, dense_px=0, solid_px=0):
    grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)/255
    grey /= max(.1, float(np.percentile(grey, 98)))
    big = cv2.resize(grey, None, fx=zoom, fy=zoom, interpolation=cv2.INTER_CUBIC)
    # a line is ink down to half of its own darkness: a pale line keeps its width, and two lines a pixel or two apart
    # stay two lines, since the paper between them is under half of either
    dark = 1-np.clip(big, 0, 1); r = int(round(1.5*zoom))
    peak = cv2.dilate(dark, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*r+1, 2*r+1)))
    mask = ((dark > ink) & (dark > .55*peak)).astype('uint8')
    # dense ink (fur, hair, scribbled foliage, close hatching) thins into a net of junctions; it is laid by streams instead
    # (dense_strokes), so the thinning sees only the ink outside it
    # solid darks: ink wider than `solid_px` source pixels is filled with close parallel strokes (solid_fills), and only the
    # line left around it is thinned
    solid = None; fills = []
    if solid_px > 0:
        rr = max(1, int(round(solid_px*zoom/2)))
        # only what the drawing draws black (not a grey pane or a soft shadow, which stays line) is a solid dark
        black = (mask > 0) & (dark > .6)
        solid = cv2.morphologyEx(black.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*rr+1, 2*rr+1))) > 0
        # filled as visible parallel strokes with slivers of paper between (spacing a little over the stroke's width)
        fw = .5*solid_px*zoom
        edge = cv2.distanceTransform(black.astype(np.uint8), cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
        fills = solid_fills(solid, dark, zoom, width_px=fw, spacing_px=1.15*fw, min_len_px=1.5*fw, edge=edge)
        mask = mask & ~cv2.erode(solid.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    dense = None
    if dense_px > 0:
        k = int(round(dense_px*zoom)) | 1
        dense = cv2.blur(mask.astype(np.float32), (k, k)) > .45
        dense = cv2.morphologyEx(dense.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))) > 0
        mask = mask & ~dense
        if solid is not None: dense = dense & ~solid
    skeleton, _ = thin(mask)
    skeleton, _ = prune_spurs(skeleton, 2*zoom)
    paths = sketch.trace(skeleton, min_points=2, window=2*zoom)
    paths, joins = sketch.through_junctions(paths, skeleton, reach=2.5, tangent=3*zoom, stub=2*zoom)
    before = len(paths)
    paths = sketch.join(paths, dark, gap=3*zoom)
    joins += before-len(paths)
    distance = cv2.distanceTransform(mask, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
    lines = []
    for p in paths:
        p = np.asarray(p, np.float32)
        if arc_length(p) < min_px*zoom:
            continue
        wz = 2*sketch.at(distance, p)
        width = max(.6, float(np.median(wz))/zoom)
        # how dark the drawing draws it: the line's core against the paper, 0.85 of full black and over is full weight
        weight = float(np.clip(np.median(sketch.at(dark, p))/.85, .25, 1))
        q = fair((resample(p.astype(float), 1)+.5)/zoom-.5, fit, 1/zoom)
        line = {'points': np.round(q, 3).tolist(), 'width': round(width, 3), 'weight': round(weight, 3), 'role': 'pen stroke', 'length': arc_length(q)}
        # a line that swells and thins along its length keeps that: widths per point, read along the traced centre line
        wp = point_widths(q, (p+.5)/zoom-.5, wz/zoom)
        if wp is not None: line['points'], line['widths'] = np.round(wp[0], 3).tolist(), np.round(wp[1], 3).tolist()
        lines.append(line)
    lines.sort(key=lambda l: -l['length'])
    if dense is not None and dense.any():
        small = cv2.resize(dense.astype(np.uint8), (grey.shape[1], grey.shape[0]), interpolation=cv2.INTER_AREA) > 0
        wid = float(np.median([l['width'] for l in lines])) if lines else 1.0
        # strands about two nib widths apart: paper shows between them unless the drawing is solid there
        sp = dense_px/2.5
        streams = dense_strokes(grey, small, spacing=sp, width=wid, min_px=min_px)
        territory_widths(streams, 1-np.clip(grey, 0, 1), small, reach=1.5*sp, max_width=2*sp)
        # a strand is a pulled line, not a dab: one shorter than three times its width is left, and its neighbours take its
        # tone (the widths are worked out again without it)
        streams = [l for l in streams if l['length'] >= 3*l['width']]
        territory_widths(streams, 1-np.clip(grey, 0, 1), small, reach=1.5*sp, max_width=2*sp)
        lines += streams; lines.sort(key=lambda l: -l['length'])
    lines += fills
    return lines, mask, skeleton, {'solidFills': len(fills), 'denseShare': round(float(dense.mean()), 4) if dense is not None else 0, 'denseStrokes': len(streams) if dense is not None and dense.any() else 0,'inkPixels': int(mask.sum()), 'tracedPaths': len(paths), 'selectedPaths': len(lines), 'joins': joins, 'zoom': zoom, 'fit': fit}


def point_widths(q, src, w, step=1.5, vary=.2):
    """Widths along a faired line `q` read from the traced centre line `src` (with widths `w`, same unit): `q` resampled every
    `step` and each point given the median width of the nearest traced samples. None when the width hardly varies (the line
    keeps its one width)."""
    if len(src) < 5: return None
    k = 5; wm = np.array([np.median(w[max(0, i-k):i+k+1]) for i in range(len(w))])
    if np.percentile(wm, 90) < (1+vary)*np.percentile(wm, 10) or np.percentile(wm, 90)-np.percentile(wm, 10) < .5: return None
    r = resample(np.asarray(q, float), step)
    from scipy.spatial import cKDTree
    _, idx = cKDTree(src).query(r)
    return r, np.maximum(.6, wm[idx])


def merge_parallels(lines, sep, share=.7):
    """A line drawn as two or three close parallel strokes (a thick edge, or a sketchy double) is one stroke: a line whose
    samples lie within `sep` source pixels of one longer line along `share` of its length is folded into it, which takes
    the span of both as its width and the darker weight. Returns the kept lines and how many were folded."""
    from scipy.spatial import cKDTree
    order = sorted(range(len(lines)), key=lambda i: -lines[i]['length'])
    S = [resample(np.asarray(lines[i]['points'], float), .5) for i in range(len(lines))]
    owner = np.concatenate([np.full(len(S[i]), i) for i in range(len(lines))]); tree = cKDTree(np.vstack(S))
    gone = set()
    for i in reversed(order):           # shortest first
        hits = {}
        for k, nb in enumerate(tree.query_ball_point(S[i], sep)):
            for j in {owner[n] for n in nb}:
                if j != i and j not in gone and lines[j]['length'] >= lines[i]['length']: hits[j] = hits.get(j, 0) + 1
        best = max(hits, key=hits.get) if hits else None
        if best is not None and hits[best] >= share*len(S[i]):
            a, b = lines[best], lines[i]
            d = float(np.median(cKDTree(S[best]).query(S[i])[0]))
            # the span of both, at most 1.6 times the wider (folds of several strokes do not pile up into a bar)
            a['width'] = round(min(max(a['width'], d + (a['width']+b['width'])/2), 1.6*max(a['width'], b['width'], a.get('width0', a['width']))), 3)
            a.setdefault('width0', a['width']); a['weight'] = max(a['weight'], b['weight'])
            if 'widths' in a: a['widths'] = [round(max(v, a['width']), 3) for v in a['widths']]
            gone.add(i)
    for l in lines: l.pop('width0', None)
    return [l for k, l in enumerate(lines) if k not in gone], len(gone)


def paper_dark(bgr, blur=.7, line_px=3, full=False):
    """A pencil drawing's lines: darkness against its own local paper, 0 (paper) to 1 (black), grain blurred out and broad
    tone taken off. `full` also returns the whole darkness (tone included), which sets how firmly a line is pressed."""
    grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)/255
    h, w = grey.shape; r = max(5, int(round(.012*max(h, w))))
    # the paper: the light envelope over about a centimetre of a drawing (a closing removes every line under that width)
    paper = cv2.dilate(grey, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*r+1, 2*r+1)))
    paper = cv2.GaussianBlur(paper, (0, 0), r)
    dark = 1-np.clip(grey/np.maximum(.05, paper), 0, 1)
    dark = cv2.GaussianBlur(dark, (0, 0), blur) if blur > 0 else dark
    # the lines only: shading is graphite too, but broad. An opening wider than a stroke (and a doubled stroke) holds the
    # tone under the lines, and what stands above it is line; a hatched area keeps its hatching, not its blur
    tone = cv2.morphologyEx(dark, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*line_px+1, 2*line_px+1)))
    return (np.clip(dark-tone, 0, 1), dark) if full else np.clip(dark-tone, 0, 1)


def pencil_plan(bgr, zoom=4, smooth_px=1.2, min_px=4.0):
    dark0, whole = paper_dark(bgr, full=True)
    # the paper's own noise: the spread of the darkness where nothing is drawn (the lower half of the pixels)
    lo = dark0[dark0 <= np.percentile(dark0, 50)]
    noise = float(np.median(np.abs(lo-np.median(lo))))*1.4826+1e-4
    low = max(.03, float(np.median(lo))+5*noise)
    line = dark0[dark0 > low]
    firm = float(np.percentile(line, 95)) if line.size else 1.0
    high = max(2*low, .35*firm)
    big = cv2.resize(dark0, None, fx=zoom, fy=zoom, interpolation=cv2.INTER_CUBIC)
    # a line is pencil down to 45% of its own darkness, as for ink, but against the local paper and the noise-set floor
    r = int(round(1.5*zoom))
    peak = cv2.dilate(big, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*r+1, 2*r+1)))
    mask = ((big > low) & (big > .45*peak)).astype('uint8')
    # hysteresis: a pale run stays only when it is part of a mark that somewhere reaches the firm level
    n, lab = cv2.connectedComponents(mask, connectivity=8)
    top = np.zeros(n, np.float32); np.maximum.at(top, lab.ravel(), big.ravel())
    keep = top > high; keep[0] = False
    mask = keep[lab].astype('uint8')
    skeleton, _ = thin(mask)
    skeleton, _ = prune_spurs(skeleton, 2*zoom)
    paths = sketch.trace(skeleton, min_points=2, window=2*zoom)
    paths, joins = sketch.through_junctions(paths, skeleton, reach=2.5, tangent=3*zoom, stub=2*zoom)
    before = len(paths)
    paths = sketch.join(paths, big, gap=3*zoom)
    joins += before-len(paths)
    distance = cv2.distanceTransform(mask, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
    lines = []
    for p in paths:
        p = np.asarray(p, np.float32)
        if arc_length(p) < min_px*zoom:
            continue
        width = max(.6, float(np.median(2*sketch.at(distance, p)))/zoom)
        q = resample((resample(p.astype(float), 1)+.5)/zoom-.5, 1.0)
        q = resample(smooth(q, smooth_px), 1.5)
        lines.append({'points': np.round(q, 3).tolist(), 'width': round(width, 3), 'role': 'pencil stroke', 'length': arc_length(q)})
    # a stroke is pressed as dark as the drawing is there, its tone included: hatching in a dark mass is firm, not light
    firm_whole = float(np.percentile(whole[cv2.resize(mask, whole.shape[::-1], interpolation=cv2.INTER_AREA) > 0], 97)) if mask.any() else 1.0
    weigh(lines, whole, firm_whole)
    lines.sort(key=lambda l: -l['length'])
    return lines, mask, skeleton, {'inkPixels': int(mask.sum()), 'tracedPaths': len(paths), 'selectedPaths': len(lines), 'joins': joins, 'zoom': zoom,
                                   'medium': 'pencil', 'paperNoise': round(noise, 4), 'low': round(low, 4), 'high': round(high, 4), 'firm': round(firm, 4), 'firmWhole': round(firm_whole, 4)}


def weigh(lines, dark, firm, reach=1.5):
    """Each point's darkness in the drawing (the darkest within `reach` pixels, smoothed along the line) over `firm`, as
    `weights`; the line's median as `weight`. A light construction line comes out light, a pressed contour near 1."""
    h, w = dark.shape; r = int(np.ceil(reach))
    peak = cv2.dilate(dark, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*r+1, 2*r+1)))
    for l in lines:
        p = np.asarray(l['points'], float)
        v = cv2.remap(peak, p[:, 0].astype(np.float32), p[:, 1].astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)[:, 0] if len(p) else np.zeros(0)
        if len(v) >= 5:
            k = np.exp(-.5*(np.arange(-4, 5)/2)**2); k /= k.sum()
            v = np.convolve(np.pad(v, 4, mode='edge'), k, 'valid')
        wt = np.clip(v/max(1e-3, firm), .12, 1)
        l['weights'] = np.round(wt, 3).tolist(); l['weight'] = round(float(np.median(wt)), 3)


def reweigh(file, image, out):
    doc = json.load(open(file)); bgr = cv2.imread(image); dark = paper_dark(bgr, full=True)[1]
    sx, sy = bgr.shape[1]/doc['image']['w'], bgr.shape[0]/doc['image']['h']
    firm = doc.get('stats', {}).get('firmWhole') or float(np.percentile(dark[dark > .05], 95))
    pts = [l['points'] for l in doc['lines']]
    for l in doc['lines']:
        l['points'] = [[x*sx, y*sy] for x, y in l['points']]
    weigh(doc['lines'], dark, firm)
    for l, p in zip(doc['lines'], pts):
        l['points'] = p
    Path(out).write_text(json.dumps(doc)+'\n'); print(len(doc['lines']), 'lines weighed ->', out)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('image'); ap.add_argument('--out', required=True)
    ap.add_argument('--target', help='the picture the drawing is registered to (same size): the line file is bound to it')
    ap.add_argument('--sheetmm', type=float, help='sheet width in mm: adds widthMm to each line')
    ap.add_argument('--zoom', type=int, default=4, help='enlargement before thinning')
    ap.add_argument('--mergemm', type=float, default=0, help='close parallel strokes within this (mm, with --sheetmm) are one stroke; 0 (default) keeps them: two lines stay two lines with paper between')
    ap.add_argument('--maxwidthmm', type=float, default=1.2, help='wider marks under four widths long are filled darks, left to the paint (mm, with --sheetmm); 0 keeps them')
    ap.add_argument('--densemm', type=float, default=1.5, help='ink covering most of a window this wide (mm) is dense (fur, hair, scribble): laid as strokes along its direction, not thinned; 0 thins everything')
    ap.add_argument('--solidmm', type=float, default=.9, help='ink wider than this (mm) is a solid dark: filled with close parallel pen strokes along the shape; 0 thins it to a centre line')
    ap.add_argument('--medium', default='ink', choices=['ink', 'pencil'], help='the medium the drawing is made in: the painter lays it in this (medium-decision.mjs); pencil: grey lines of every weight, kept with their wobble and darkness')
    ap.add_argument('--fit', type=float, default=.6, help='how far a straight run or arc may lie from the traced line, source pixels')
    ap.add_argument('--reweigh', help='put the drawing\'s darkness on this line file\'s points (pencil) and write it to --out')
    args = ap.parse_args()
    if args.reweigh:
        return reweigh(args.reweigh, args.image, args.out)
    bgr = cv2.imread(args.image)
    if bgr is None:
        ap.error('cannot read '+args.image)
    h, w = bgr.shape[:2]
    if args.medium == 'pencil':
        lines, mask, skeleton, stats = pencil_plan(bgr, args.zoom)
    else:
        lines, mask, skeleton, stats = plan(bgr, args.zoom, fit=args.fit, dense_px=args.densemm*w/args.sheetmm if args.sheetmm and args.densemm > 0 else 0,
                                            solid_px=args.solidmm*w/args.sheetmm if args.sheetmm and args.solidmm > 0 else 0)
    if args.sheetmm and args.medium == 'ink':
        px = w/args.sheetmm   # source pixels a millimetre
        if args.mergemm > 0:
            # strokes laid along dense ink are already one per strand, spaced as drawn
            dense = [l for l in lines if l.get('dense') or l.get('fill')]
            lines, stats['foldedParallels'] = merge_parallels([l for l in lines if not (l.get('dense') or l.get('fill'))], args.mergemm*px)
            lines += dense
        if args.maxwidthmm > 0:
            # a filled dark (a fat mark hardly longer than it is wide) is left to the paint
            n = len(lines); lines = [l for l in lines if l.get('fill') or l['width'] <= args.maxwidthmm*px or l['length'] >= 4*l['width']]; stats['filledDarksLeft'] = n-len(lines)
        stats['selectedPaths'] = len(lines)
    if args.sheetmm:
        for l in lines:
            l['widthMm'] = round(l['width']*args.sheetmm/w, 3)
    stem = Path(args.out); stem.parent.mkdir(parents=True, exist_ok=True)
    doc = {'source': f'trace-drawing: a clean {"pencil" if args.medium == "pencil" else "line"} drawing, pre-paint only', 'inputKind': 'drawing', 'medium': args.medium, 'widthPolicy': 'one observed width per line',
           'image': {'w': w, 'h': h}, 'targetSHA256': hashlib.sha256(Path(args.target or args.image).read_bytes()).hexdigest(), 'stats': stats, 'lines': lines}
    Path(str(stem)+'-lines.json').write_text(json.dumps(doc)+'\n')
    cv2.imwrite(str(stem)+'-ink.png', (1-mask)*255)
    cv2.imwrite(str(stem)+'-skeleton.png', (1-skeleton)*255)
    print(json.dumps(stats))


if __name__ == '__main__':
    main()
