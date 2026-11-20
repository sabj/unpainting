#!/usr/bin/env python3
# Pipeline: inking, stage 3c (the pen's strokes as vector shapes fitted to the drawing's own ink).
"""Divide a clean pen drawing's ink into strokes, each a VECTOR shape in sheet millimetres fitted to the drawing: a smooth
closed outline (rings, the ink's edge at half the stroke's own darkness), the path the pen takes along it (the ordered
line file's centre line, for the direction and the nib's advance), the width along that path, and the stroke's darkness.
Each stroke names the ordered line it came from (`line`, that line's seq), so a stage cut from the line file takes the same
vector strokes (src/paint/methods/linework-plan.mjs).
The drawing's pixels are only what the vectors are fitted to; the plate's ink is rendered from the vectors at any
resolution (render_vectors), so a zoom re-renders crisp.

The drawing is a small soft picture: every edge is spread over most of a pixel, so a thin black line reads as a wider grey
one and a narrow gap between two bars as a grey bridge. The softness is taken out first (deblur), and the strokes are
fitted to that: a thin line thin and dark, a lattice its bars with the gaps open, grey glass grey.

Every ink pixel goes to one stroke: each ordered stroke claims the ink under its own width, a longer stroke over a shorter
one where they cross (one bar passes through a junction, the other meets it), and the ink's soft edge goes to the nearest
claim. Ink farther than --orphanmm from every stroke (a speck the tracer left) becomes a stroke of its own, laid just after
the nearest stroke. Nothing is added and nothing is re-estimated: the outline follows the ink.
A LINE is drawn as its path with a width at every point (`drawn: 'path'`), read across it at its own local darkness, in
runs where the tracer joined it across a gap. A mass of ink (a leaf mass, a blot, a pane, grey glass) is a FILL, one
stroke of its own marked `fill` (find_fills); under paint the painter lays fills pale (--inkfill), lines never.

usage: ink-vectors.py DRAWING.png ORDERED-lines.json --sheetmm MM --out FILE.json [--zoom 4] [--psf 0.7] [--window X Y W H]
"""
import argparse, json, math
import numpy as np, cv2
from scipy.ndimage import find_objects, median_filter
from skimage.measure import find_contours
# the outline's level, as a share of the stroke's own darkness (a faint stroke's a little lower)
LVL, LVL_FAINT = .5, .45
# the softness of a prepared drawing: each edge spread over this many of its pixels (a Gaussian's sigma). Measured across
# the edges between solid black and paper in the drawings the image model returns: 0.79 to 0.86. Most of it is
# taken out: with all of it out a soft grey line (chalk, pencil) turns into a hard black hairline
PSF = .7
PSF_SOFT = .4   # for a pencil drawing

def smooth_ring(r, sigma):
    n = len(r)
    if n < 8 or sigma <= 0: return r
    k = int(3 * sigma); w = np.exp(-.5 * (np.arange(-k, k + 1) / sigma) ** 2); w /= w.sum()
    q = np.vstack([r[-k:], r, r[:k]])
    return np.c_[np.convolve(q[:, 0], w, 'valid'), np.convolve(q[:, 1], w, 'valid')]

def rdp(P, eps):
    if len(P) < 3: return P
    a, b = P[0], P[-1]; d = b - a; L = math.hypot(*d)
    dist = np.abs(d[0] * (P - a)[:, 1] - d[1] * (P - a)[:, 0]) / L if L > 1e-12 else np.hypot(*(P - a).T)
    i = int(np.argmax(dist))
    if dist[i] <= eps: return np.vstack([a, b])
    return np.vstack([rdp(P[:i + 1], eps)[:-1], rdp(P[i:], eps)])

def simplify_ring(r, eps):
    if len(r) < 6: return r
    i = len(r) // 2
    return np.vstack([rdp(r[:i + 1], eps)[:-1], rdp(r[i:], eps)])

def darkness(bgr):
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    paper = max(.1, float(np.percentile(g, 98)))
    return np.clip(1 - g / paper, 0, 1)

def deblur(a, sigma, rounds=30):
    """The drawing with its own softness taken out (Richardson-Lucy, the ink kept between paper and black): a prepared
    drawing is a small picture, each edge spread over `sigma` pixels, so a thin black line reads as a wider grey one and a
    narrow white gap between two bars as a grey bridge. Un-blurred, the line is thin and black again and the gap open, and
    a flat grey (glass) stays its grey. The amount of ink is unchanged."""
    if sigma <= 0: return a
    est = a.copy(); b = lambda x: cv2.GaussianBlur(x, (0, 0), sigma)
    for _ in range(rounds):
        est *= b(a / np.maximum(b(est), 1e-4)); np.clip(est, 0, 1, out=est)
    return est


def cross_sections(f, floor, P, reach=8.0, step=.25):
    """Across a line at each point of its path P (grid pixels, in the field f's frame): the line's darkness there (its peak
    by the path) and where the ink falls to half of that on either side, read along the normal with linear interpolation.
    So a line that fades along its length is followed at its own darkness, as one line. Returns (centre offset along the
    normal, width, peak), NaN where the path is not on ink over `floor`."""
    n = len(P); T = np.gradient(P, axis=0); T /= np.maximum(1e-9, np.hypot(*T.T))[:, None]; N = np.c_[-T[:, 1], T[:, 0]]
    t = np.arange(-reach, reach + step, step); X = (P[:, None, 0] + t[None] * N[:, None, 0]).astype(np.float32); Y = (P[:, None, 1] + t[None] * N[:, None, 1]).astype(np.float32)
    v = cv2.remap(f.astype(np.float32), X, Y, cv2.INTER_LINEAR, borderValue=0)
    off, wid, peak = np.full(n, np.nan), np.full(n, np.nan), np.full(n, np.nan); c = len(t) // 2
    for k in range(n):
        row = v[k]; j = c - 4 + int(np.argmax(row[c - 4:c + 5])); p = row[j]
        if p < floor: continue
        lvl = .5 * p; inside = row >= lvl; a = j; b = j
        while a > 0 and inside[a - 1]: a -= 1
        while b < len(t) - 1 and inside[b + 1]: b += 1
        if a == 0 or b == len(t) - 1: continue
        ea = t[a - 1] + (lvl - row[a - 1]) / max(1e-9, row[a] - row[a - 1]) * step; eb = t[b] + (row[b] - lvl) / max(1e-9, row[b] - row[b + 1]) * step
        off[k] = .5 * (ea + eb); wid[k] = eb - ea; peak[k] = row[a:b + 1].max()
    return off, wid, peak


def sausage(P, half, cap=6):
    """The outline of a line drawn along P with half-widths `half` (same unit): both sides offset along the normal, round ends."""
    T = np.gradient(P, axis=0); T /= np.maximum(1e-9, np.hypot(*T.T))[:, None]; N = np.c_[-T[:, 1], T[:, 0]]
    L, R = P + N * half[:, None], P - N * half[:, None]
    def end(p, t, h, sgn):
        a0 = math.atan2(t[1], t[0]); return [p + h * np.array([math.cos(a0 + sgn * (math.pi / 2 - math.pi * i / cap)), math.sin(a0 + sgn * (math.pi / 2 - math.pi * i / cap))]) for i in range(1, cap)]
    ring = list(L) + end(P[-1], T[-1], half[-1], -1)[::-1] + list(R[::-1]) + end(P[0], -T[0], half[0], -1)[::-1]
    return np.array(ring)


def build(drawing, lines_doc, sheet_mm, zoom=4, ink=.06, orphan_mm=.6, sigma=.6, eps=.1, psf=PSF):
    bgr = cv2.imread(drawing) if isinstance(drawing, str) else drawing; h0, w0 = bgr.shape[:2]
    if (lines_doc['image']['w'], lines_doc['image']['h']) != (w0, h0): raise SystemExit('ink-vectors: the line file is not on the drawing\'s grid')
    W, H = w0 * zoom, h0 * zoom; px = sheet_mm / W   # mm per grid pixel
    Z = zoom / 2   # lengths below are in pixels of a twice-enlarged grid
    a = cv2.resize(darkness(bgr), (W, H), interpolation=cv2.INTER_CUBIC).clip(0, 1)
    # a light drawing (pencil, whose firmest line is grey) is fitted on its own scale: the shapes are found as if its
    # firmest line were black, and each stroke keeps its real darkness. Its line is soft of itself (graphite): less of the
    # softness is taken out (PSF_SOFT), or its shading comes out as hard rims
    firm = float(np.percentile(a[a > .02], 99)) if (a > .02).any() else 1.0
    a = deblur(a, (psf if firm >= .6 else min(psf, PSF_SOFT)) * zoom)
    gain = 1 / firm if firm < .6 else 1.0
    a = np.clip(a * gain, 0, 1)
    inkm = a > ink
    L = sorted(lines_doc['lines'], key=lambda l: l['seq'])
    g = lambda P: (np.asarray(P, float) + .5) * zoom - .5   # source pixel -> grid pixel
    # claims: each stroke drawn at its own width, shortest first, so the longer stroke wins where two cross
    lab = np.zeros((H, W), np.int32); par = np.zeros((H, W), np.float32)
    # (of two strokes along the same line, a lay-in and its restatement or a late accent, the first laid holds the ink)
    for k in sorted(range(len(L)), key=lambda k: (L[k].get('length', 0), -k)):
        P = g(L[k]['points'])
        if len(P) < 2: P = np.vstack([P, P + .01])
        seg = np.hypot(*np.diff(P, axis=0).T); t = np.r_[0, np.cumsum(seg)] / max(seg.sum(), 1e-9)
        ws = L[k].get('widths') or [L[k]['width']] * len(P)
        for j in range(len(P) - 1):
            th = max(1, int(round(.5 * (ws[j] + ws[j + 1]) * zoom)))
            p0, p1 = tuple(np.int32(np.round(P[j]))), tuple(np.int32(np.round(P[j + 1])))
            cv2.line(lab, p0, p1, k + 1, th); cv2.line(par, p0, p1, float(.5 * (t[j] + t[j + 1])), th)
    # the rest of the ink to the nearest claim; ink too far from any is an orphan stroke of its own
    src = (lab == 0).astype(np.uint8)
    dist, near = cv2.distanceTransformWithLabels(src, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    zy, zx = np.nonzero(src == 0); of = np.zeros(near.max() + 1, np.int64); of[near[zy, zx]] = zy * W + zx
    idx = of[near]; owner = lab.ravel()[idx].reshape(H, W); param = par.ravel()[idx].reshape(H, W)
    owner[~inkm] = 0
    orphan = inkm & (dist * px > orphan_mm)
    extra = []
    if orphan.any():
        n, cl, st_, _ = cv2.connectedComponentsWithStats(orphan.astype(np.uint8), connectivity=8)
        for c in range(1, n):
            bx, by, bw, bh = st_[c, :4]; ys, xs = np.nonzero(cl[by:by + bh, bx:bx + bw] == c); ys += by; xs += bx
            if len(xs) < 2: owner[ys, xs] = 0; continue
            Q = np.c_[xs, ys].astype(float); m = Q.mean(0); _, _, vt = np.linalg.svd(Q - m, full_matrices=False); d = vt[0]
            if abs(d[1]) > abs(d[0]) and d[1] < 0 or abs(d[0]) >= abs(d[1]) and d[0] < 0: d = -d
            with np.errstate(all='ignore'): u = (Q - m) @ d   # (Accelerate's matmul warns spuriously)
            nearest = int(owner[int(m[1]), int(m[0])]) or int(lab.ravel()[of[near[int(m[1]), int(m[0])]]])
            kid = len(L) + len(extra) + 1; owner[ys, xs] = kid; param[ys, xs] = (u - u.min()) / max(1e-9, u.max() - u.min())
            extra.append({'after': nearest - 1, 'path': np.vstack([m + u.min() * d, m + u.max() * d]), 'part': 'small'})
    # FILLS: a mass of ink (a leaf mass, a blot, a pane) is one stroke of its own, whole, whatever lines the tracer ran
    # through it; a window's grey glass is one grey fill laid under its black bars, which stay lines
    under = np.zeros((H, W), np.int32)
    # (ink only: a light drawing, pencil, has no masses that could overcome the paint; its shading stays as drawn)
    for fl in (find_fills(a, px) if gain == 1.0 else []):
        kid = len(L) + len(extra) + 1; x0, y0, m = fl['x0'], fl['y0'], fl['mask']; sl = (slice(y0, y0 + m.shape[0]), slice(x0, x0 + m.shape[1]))
        ids = owner[sl][m]; ids = ids[(ids > 0) & (ids <= len(L))]
        ys, xs = np.nonzero(m); c = np.array([xs.mean() + x0, ys.mean() + y0])
        first = int(ids.min()) if len(ids) else int(lab.ravel()[of[near[int(c[1]), int(c[0])]]])
        if fl['grey']: under[sl][m] = kid; owner[sl][m & (a[sl] < .85)] = 0
        else:
            # (the fill's soft edge goes with it: left to the stroke that ran through the blob it would be laid as a grey rim)
            owner[sl][m] = kid; rim = (cv2.dilate(m.astype(np.uint8), np.ones((int(4 * Z) + 1,) * 2, np.uint8)) > 0) & ~m & (a[sl] < (fl['level'] or .5)); owner[sl][rim] = 0
        Q = np.c_[xs, ys][::max(1, len(xs) // 4000)].astype(float); mq = Q.mean(0); _, _, vt = np.linalg.svd(Q - mq, full_matrices=False); d = vt[0]
        if abs(d[1]) > abs(d[0]) and d[1] < 0 or abs(d[0]) >= abs(d[1]) and d[0] < 0: d = -d
        with np.errstate(all='ignore'): u = (Q - mq) @ d
        extra.append({'before': first - 1, 'path': np.vstack([mq + u.min() * d, mq + u.max() * d]) + [x0, y0], 'fill': fl})
    strokes = []
    edge_ring = lambda r: (r[:, ::-1] + .5) * px   # find_contours gives (row, col) on the grid; to sheet mm (x, y)
    boxes = find_objects(owner); ubox = find_objects(under)
    for k in range(1, len(L) + len(extra) + 1):
        fill = extra[k - len(L) - 1].get('fill') if k > len(L) else None; grey_fill = bool(fill and fill['grey'])
        b = (ubox if grey_fill else boxes)[k - 1] if k - 1 < len(ubox if grey_fill else boxes) else None
        if b is None: continue
        x0, y0, x1, y1 = max(0, b[1].start - 3), max(0, b[0].start - 3), min(W, b[1].stop + 3), min(H, b[0].stop + 3)
        own = (under if grey_fill else owner)[y0:y1, x0:x1] == k
        # the stroke's darkness: its core (the darker tenth of its ink); its edge at half of that
        av = a[y0:y1, x0:x1][own]; dk = float(np.percentile(av, 90))
        if not len(av): continue
        if dk < 2 * ink: continue
        A = a[y0:y1, x0:x1]; grow = lambda m: cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        # a stroke whose ink is part black and part grey (black bars round a grey pane) is two pieces on one path, the grey
        # laid first and the black over it, each at its own darkness: grey stays grey
        # (grey that is a black line's soft edge does not count: only grey two pixels and more from the black)
        black = own & (A >= .85); grey = own & (A >= .3) & (A < .85)
        # (the grey must be an area of its own: what is left of it after half a drawing pixel is taken off all round, so the rim of a
        # black line is not a grey; three square pixels of the drawing or more)
        k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(Z) * 2 + 1,) * 2)
        grey = cv2.dilate(cv2.erode(grey.astype(np.uint8), k3), k3).astype(bool) & grey
        split = black.sum() >= 8 * Z * Z and grey.sum() >= 12 * Z * Z
        if fill: split = False
        pieces = [(own, fill['tone'], fill['level'])] if fill else [(own, dk, None)] if not split else [(own, float(np.percentile(A[grey], 90)), None), (black, float(np.percentile(A[black], 90)), .85)]
        parts = []
        for n_, (m, top, edge) in enumerate(pieces):
            # a faint line is one stroke: its field softened very slightly and its edge at 0.45 of its darkness, so its dips do
            # not break it into dashes (more would fuse close faint hatching into a grey blot). The black over a grey area
            # has its edge at 0.85, so the dark grey of glass between black bars stays grey round them
            faint = top < .5; F = cv2.GaussianBlur(A, (0, 0), .4 * Z) if faint else A; lvl = edge or (LVL_FAINT if faint else LVL) * top
            vals = A[m]; vals = vals[vals >= lvl]
            if split and n_ == 0: vals = A[grey]
            if not len(vals): continue
            # its darkness: the median of its ink inside its edge (a drawing's black varies a little from mark to mark: over
            # 0.85 is black, so a dark mass made of several strokes is one black, not a patchwork of near-blacks; a grey
            # stays its own grey)
            # a line's darkness is its core's (the darker tenth): its edge at half of that is its drawn width (the width at half
            # the darkness of a soft-edged line), so a thin black line stays thin and black; a grey area under black bars
            # takes its median, an even wash of grey
            # (a pale line, under half black, keeps the median of its ink: its darkness spread over its half-level width)
            tone = (float(np.median(vals)) if (split and n_ == 0) or faint else top) / gain; tone = 1.0 if tone >= .85 and not (split and n_ == 0) and not grey_fill else tone
            # the field the outline is fitted to: this piece's own ink, reaching a pixel past a cut so neighbours abut
            f = np.pad(np.where(grow(m), F, 0), 1)
            rings = []
            for c in find_contours(f, lvl):
                if len(c) < 4 or not np.allclose(c[0], c[-1]): continue
                c = c[:-1] - 1 + [y0, x0]
                # smoothing no more than a third of the ring's own half-width (twice its area over its perimeter: the
                # half-width of a thin strip), so a narrow white gap (a glazing bar between dark panes) keeps its width
                per = float(np.hypot(*np.diff(np.vstack([c, c[:1]]), axis=0).T).sum()); area = .5 * abs(float(np.dot(c[:, 0], np.roll(c[:, 1], 1)) - np.dot(c[:, 1], np.roll(c[:, 0], 1))))
                half = 2 * area / max(per, 1e-9)
                c = simplify_ring(smooth_ring(c, min(sigma * Z, .35 * half)), min(eps * Z, .15 * half))
                if len(c) >= 3: rings.append(np.round(edge_ring(c), 3).tolist())
            parts.append((rings, tone, f, lvl))
        if not parts: continue
        if k <= len(L):
            l = L[k - 1]; path = (np.asarray(l['points'], float) + .5) * (sheet_mm / w0)
            rec = {'seq': l['seq'], 'line': l['seq'], 'part': l.get('part'), 'phase': l.get('phase'), 'object': l.get('object'), 'unit': l.get('unit')}
        else:
            e = extra[k - len(L) - 1]; path = (e['path'] + .5) * px
            if fill:
                l = L[e['before']]; rec = {'seq': l['seq'] - (.6 if grey_fill else .5), 'line': l['seq'], 'part': 'fill', 'phase': l.get('phase'), 'object': l.get('object'), 'unit': l.get('unit'), 'fill': True}
            else:
                ln = L[e['after']]['seq'] if e['after'] >= 0 else len(L); rec = {'seq': ln + .5, 'line': ln, 'part': 'small', 'phase': 'texture'}
        # the width along the path: twice the distance to the outline's ink, read on the grid
        for n_, (rings, tone, f, lvl) in enumerate(parts):
            inside = (f[1:-1, 1:-1] >= lvl).astype(np.uint8); dt = cv2.distanceTransform(np.pad(inside, 1), cv2.DIST_L2, 5)[1:-1, 1:-1]
            gp = path / px - .5; ii = np.clip(np.round(gp[:, 0]).astype(int) - x0, 0, x1 - x0 - 1); jj = np.clip(np.round(gp[:, 1]).astype(int) - y0, 0, y1 - y0 - 1)
            widths = np.round(2 * dt[jj, ii] * px, 3).tolist()
            # a LINE (long against its width) is drawn as its path with the width the ink has across it: the centre, width and
            # darkness read across the line and smoothed ALONG it, never across, so a straight line stays straight and a
            # thin one thin, with no wobble from the drawing's pixels, and a faint or fading one is one stroke, not dashes.
            # Used only where it covers the line's own ink, else the outline stands.
            Lp = float(np.hypot(*np.diff(path, axis=0).T).sum()) if len(path) > 1 else 0
            drawn = None
            if len(parts) == 1 and Lp > 0 and k <= len(L):
                G = (path / px - .5) - [x0 - 1, y0 - 1]
                seg = np.r_[0, np.cumsum(np.hypot(*np.diff(G, axis=0).T))]; m = max(2, int(seg[-1] / (.5 * Z)) + 1); u = np.linspace(0, seg[-1], m)
                Q = np.c_[np.interp(u, seg, G[:, 0]), np.interp(u, seg, G[:, 1])]
                floor = max(1.5 * ink, .5 * lvl); off, wid, pk = cross_sections(f, floor, Q, reach=8 * Z, step=.25 * Z)
                ok = np.isfinite(wid)
                # where the path leaves the ink for more than a pixel and a half of the drawing (a line the tracer joined across
                # a gap) nothing is drawn: the line is laid in runs, the pen lifted between them. Shorter dips are drawn through
                gap = int(round(6)); idx = np.nonzero(ok)[0]
                for a_, b_ in zip(idx[:-1], idx[1:]):
                    if 1 < b_ - a_ <= gap: ok[a_:b_] = True
                runs = []; k0 = None
                for k_ in range(m + 1):
                    if k_ < m and ok[k_]: k0 = k_ if k0 is None else k0
                    elif k0 is not None: runs.append((k0, k_)); k0 = None
                runs = [r_ for r_ in runs if r_[1] - r_[0] >= 3]
                if runs and ok.mean() > .5 and seg[-1] > 3 * np.nanmedian(wid):
                    good = np.isfinite(wid); k_ = np.arange(m); off, wid, pk = (np.interp(k_, k_[good], v[good]) for v in (off, wid, pk))
                    def sm(v, sg):
                        # (the middle value over three pixels of the drawing first: where another line crosses, its ink does not
                        # pull this one aside or swell it)
                        o = v.copy(); g_ = np.exp(-.5 * (np.arange(-24, 25) / sg) ** 2); g_ /= g_.sum()
                        for a_, b_ in runs: o[a_:b_] = np.convolve(np.pad(median_filter(v[a_:b_], 13, mode='nearest'), 24, mode='edge'), g_, 'valid')
                        return o
                    off, wid, pk = sm(off, 8.0), sm(wid, 3.0), sm(pk, 3.0)
                    T = np.gradient(Q, axis=0); T /= np.maximum(1e-9, np.hypot(*T.T))[:, None]; C = Q + np.c_[-T[:, 1], T[:, 0]] * off[:, None]
                    # used only where it covers the line's own ink: seven tenths of it or more, and not much besides
                    S = np.zeros(f.shape, np.uint8)
                    for a_, b_ in runs: cv2.fillPoly(S, [np.int32(np.round(sausage(C[a_:b_], np.maximum(.35 * Z, wid[a_:b_] / 2)) * 16))], 1, cv2.LINE_8, shift=4)
                    I = f >= floor; cover = (S > 0) & I
                    if I.any() and cover.sum() >= .7 * I.sum() and S.sum() <= 1.6 * I.sum() + 8 * Z * Z:
                        # one darkness for the line, its middle one; where it is paler along its length it is drawn thinner
                        # (the same ink), where darker a little wider
                        on = np.zeros(m, bool)
                        for a_, b_ in runs: on[a_:b_] = True
                        med = float(np.median(pk[on])); wid = wid * np.clip(pk / med, .35, 1.3); tone = med / gain; tone = 1.0 if tone >= .85 else tone
                        # never thinner than the finest line the drawing can show (one of its pixels): a finer line is that wide
                        # and paler by as much (the same ink)
                        wm = float(np.median(wid[on]))
                        if wm < 2 * Z: wid = wid * (2 * Z / wm); tone = tone * wm / (2 * Z)
                        rings = []
                        for a_, b_ in runs:
                            ring = sausage(C[a_:b_], np.maximum(.35 * Z, wid[a_:b_] / 2)); rings.append(np.round(edge_ring(np.c_[ring[:, 1] + y0 - 1, ring[:, 0] + x0 - 1]), 3).tolist())
                        # the line's own ink the path does not cover (a second line close beside it that the tracer took with
                        # it, a piece the joined path runs wide of) is kept as outlined shapes with the stroke: nothing is lost
                        rest_m = I & (f >= lvl) & ~(cv2.dilate(S, np.ones((int(2 * Z) + 1,) * 2, np.uint8)) > 0); rest = []
                        if rest_m.sum() >= 4 * Z * Z:
                            for c in find_contours(np.where(cv2.dilate(rest_m.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0, f, 0), lvl):
                                if len(c) < 4 or not np.allclose(c[0], c[-1]): continue
                                c = simplify_ring(smooth_ring(c[:-1] - 1 + [y0, x0], .6 * Z), .1 * Z)
                                if len(c) >= 3 and abs(ring_area(c)) >= Z * Z: rest.append(np.round(edge_ring(c), 3).tolist())
                        rings += rest
                        if rest: rec = {**rec, 'rest': rest}
                        wid = np.where(on, wid, 0)
                        path = np.round((C + [x0 - 1, y0 - 1] + .5) * px, 3); widths = np.round(wid * px, 3).tolist(); drawn = 'path'
            if drawn: rec = {**rec, 'drawn': drawn}
            # SHADING: the stroke's own ink paler than its edge level (soft tone beside a pencil line, a pale wash by a dark
            # one) is a piece of its own at its own grey, laid just before the stroke: shading stays shading and is not lost
            if len(parts) == 1 and not fill:
                inner = f[1:-1, 1:-1]; pale = own & (inner >= 2 * ink) & (inner < lvl)
                if drawn: pale &= ~(cv2.dilate(S[1:-1, 1:-1], np.ones((int(2 * Z) + 1,) * 2, np.uint8)) > 0)
                kz = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(Z) * 2 + 1,) * 2); pale = (cv2.dilate(cv2.erode(pale.astype(np.uint8), kz), kz) > 0) & pale
                if pale.sum() >= 12 * Z * Z:
                    g_ = float(np.median(inner[pale])); fs = np.pad(np.where(cv2.dilate(pale.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0, cv2.GaussianBlur(np.minimum(inner, lvl), (0, 0), .4 * Z), 0), 1); shade = []
                    for c in find_contours(fs, .5 * g_):
                        if len(c) < 4 or not np.allclose(c[0], c[-1]): continue
                        c = simplify_ring(smooth_ring(c[:-1] - 1 + [y0, x0], .6 * Z), .1 * Z)
                        if len(c) >= 3 and abs(ring_area(c)) >= 2 * Z * Z: shade.append(np.round(edge_ring(c), 3).tolist())
                    if shade: strokes.append({**{k_: v_ for k_, v_ in rec.items() if k_ not in ('drawn', 'rest')}, 'seq': rec['seq'] - .005, 'dark': round(g_ / gain, 3), 'path': np.round(path, 3).tolist(), 'widths': [], 'outline': shade, 'piece': 'shade'})
            if not rings: continue
            strokes.append({**rec, 'seq': rec['seq'] + .01 * n_, 'dark': round(tone, 3), 'path': np.round(path, 3).tolist(), 'widths': widths, 'outline': rings, **({'piece': ['grey', 'black'][n_]} if len(parts) > 1 else {})})
    strokes.sort(key=lambda s: s['seq'])
    for i, s in enumerate(strokes): s['seq'] = i
    return {'source': 'ink-vectors: strokes as vector shapes fitted to a prepared drawing\'s ink', 'medium': lines_doc.get('medium', 'ink'),
            'sheetMm': sheet_mm, 'heightMm': sheet_mm * h0 / w0, 'drawing': {'w': w0, 'h': h0}, 'level': 'half the stroke\'s darkness', 'firm': round(firm, 3), 'fills': 'marked', 'psf': psf,
            'targetSHA256': lines_doc.get('targetSHA256'), 'strokes': strokes}

def ring_area(r):
    r = np.asarray(r, float); return .5 * float(np.dot(r[:, 0], np.roll(r[:, 1], 1)) - np.dot(r[:, 1], np.roll(r[:, 0], 1)))


def is_strip(m, dt, long=4.0, even=1.6):
    """A line at any width (a thick branch, a post, a frame, a moulding), not a mass: long (half its outer perimeter over
    `long` of its own widths, the width twice its area over its perimeter) and of even width (nowhere over `even` times that
    width across). A mass of leaves is lumpy: much wider in places than its strip width. `dt`: the distance inside the ink."""
    cs, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    per = sum(cv2.arcLength(q, True) for q in cs); w = 2 * float(m.sum()) / max(per, 1e-9)
    return per / 2 >= long * w and 2 * float(dt[m].max()) < even * w


def find_fills(a, px, width_mm=.8):
    """The FILLS in the drawing's ink `a` (0..1 on a grid of `px` mm): each connected mass of ink wider than `width_mm` (what
    is left of the ink when half that is taken off all round, grown back: bars, twigs and the knots of a lattice are
    thinner and stay lines), unless it is a strip (is_strip: long and of even width: a thick branch, a post, a frame),
    which is a line at any width and stays with the pen's strokes. Two kinds: a black fill (ink over 0.85: a leaf mass, a
    blot, dark glass), and a grey fill (ink over 0.2 of which a quarter or more is grey: glass, a shaded pane), which lies
    under whatever black is drawn across it. Returns [{x0, y0, mask, grey, tone, level}], the black ones first."""
    out = []; black_taken = np.zeros(a.shape, bool); r = .5 * width_mm / px; g = 2; kg = np.ones((2 * g + 1,) * 2, np.uint8)
    for grey in (False, True):
        ink = (a >= (.2 if grey else .85)).astype(np.uint8); dt = cv2.distanceTransform(ink, cv2.DIST_L2, 5)
        core = dt > r
        if not core.any(): continue
        wide = ((cv2.distanceTransform((~core).astype(np.uint8), cv2.DIST_L2, 5) <= r + 1) & (ink > 0)).astype(np.uint8)
        n, cl, st, _ = cv2.connectedComponentsWithStats(wide, connectivity=8)
        for c in range(1, n):
            x, y, w, h = st[c, :4]; q = 2 * g + 3; x0, y0, x1, y1 = max(0, x - q), max(0, y - q), min(a.shape[1], x + w + q), min(a.shape[0], y + h + q)
            m = cl[y0:y1, x0:x1] == c; A = a[y0:y1, x0:x1]
            if is_strip(m, dt[y0:y1, x0:x1]): continue
            near_ = cv2.dilate(m.astype(np.uint8), kg) > 0
            if grey:
                gp = m & (A < .85) & ~black_taken[y0:y1, x0:x1]
                if gp.sum() < .25 * m.sum(): continue
                tone, level = float(np.median(A[gp])), None
            else:
                # its edge at half its darkness over what lies round it (paper: 0.5; grey glass: nearer black)
                ring = (cv2.dilate(m.astype(np.uint8), np.ones((4 * g + 5,) * 2, np.uint8)) > 0) & ~near_ & (A < .85)
                level = min(.85, max(.5, .5 * (1 + float(np.median(A[ring]))))) if ring.any() else .85
                m = (m | (near_ & (A >= level) & ~(cl[y0:y1, x0:x1] > 0))); tone = 1.0; black_taken[y0:y1, x0:x1] |= m
            out.append({'x0': x0, 'y0': y0, 'mask': m, 'grey': grey, 'tone': tone, 'level': level})
    return out


def is_fill(stroke):
    """A FILL (a leaf mass, a dark pane, a blot, grey glass): a stroke the fitter made from a compact blob of ink (find_fills).
    Contours, bars, branches and hatching are lines. Same rule as src/paint/methods/ink-vectors.mjs."""
    return bool(stroke.get('fill'))


def render_vectors(doc, width, upto=None, ss=4, fill=1.0, band_mm=.2):
    """The vectors drawn at `width` pixels across: each stroke's outline filled with its darkness (darkest wins where two
    abut), antialiased by supersampling. Returns the darkness field (0 paper .. 1 black). `upto` (seq, fraction) stops after
    that much of a stroke: its outline revealed only where the nib has passed along its path. `fill` (0..1) lays a FILL
    stroke (is_fill) as one pale shape at `fill` of its darkness with a soft edge, a line through it kept (as
    src/paint/methods/ink-vectors.mjs layVectors; 1: exact)."""
    s = width / doc['sheetMm']; H = int(round(doc['heightMm'] * s)); S = ss
    out = np.zeros((H, width), np.float32)
    for st in doc['strokes']:
        if upto and st['seq'] > upto[0]: break
        x = [np.int32(np.round(np.asarray(r) * s * S * 16)) for r in st['outline']]
        xs = np.vstack(x); x0, y0 = xs.min(0) // (S * 16) - 1, xs.max(0) // (S * 16) + 2
        x0 = np.maximum(x0, 0); y0 = np.minimum(y0, [width, H])
        if (y0 <= x0).any(): continue
        m = np.zeros(((y0[1] - x0[1]) * S, (y0[0] - x0[0]) * S), np.uint8)
        cv2.fillPoly(m, [p - x0 * S * 16 for p in x], 255, cv2.LINE_8, shift=4)
        if upto and st['seq'] == upto[0]:
            P = np.asarray(st['path']) * s * S - x0 * S; seg = np.hypot(*np.diff(P, axis=0).T) if len(P) > 1 else np.zeros(0)
            Lp = seg.sum(); t = upto[1] * Lp; c = np.r_[0, np.cumsum(seg)]; k = int(np.searchsorted(c, t, 'right'))
            Q = P[:max(1, k)]; Q = np.vstack([Q, P[k - 1] + (P[min(k, len(P) - 1)] - P[k - 1]) * ((t - c[k - 1]) / max(1e-9, seg[k - 1])) if 0 < k < len(P) else P[-1:]])
            r = max(2, int(max(st['widths'] + [0.3]) * s * S * .7 + 2)); nib = np.zeros_like(m)
            cv2.polylines(nib, [np.int32(Q)], False, 255, 2 * r); [cv2.circle(nib, tuple(np.int32(q)), r, 255, -1) for q in Q[-1:]]
            m &= nib
        mf = m.astype(np.float32) / 255
        if fill < 1 and is_fill(st):
            # under paint a fill (a compact blob) is one uniform pale shape at `fill` of its darkness, soft over `band_mm` at
            # its edge, nothing drawn inside it
            d = cv2.distanceTransform(m, cv2.DIST_L2, 5) / (band_mm * s * S)
            mf = mf * fill * np.minimum(1, d + .35)
        cov = cv2.resize(mf, (y0[0] - x0[0], y0[1] - x0[1]), interpolation=cv2.INTER_AREA) * st['dark']
        sub = out[x0[1]:y0[1], x0[0]:y0[0]]; np.maximum(sub, cov, out=sub)
    return out

def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('drawing'); ap.add_argument('lines'); ap.add_argument('--sheetmm', type=float, required=True)
    ap.add_argument('--out', required=True); ap.add_argument('--zoom', type=int, default=4); ap.add_argument('--psf', type=float, default=PSF, help='the drawing\'s softness, sigma in its pixels (0: none)'); ap.add_argument('--orphanmm', type=float, default=.6)
    ap.add_argument('--window', type=float, nargs=4, metavar=('X', 'Y', 'W', 'H'), help='fit only the strokes touching this window of the drawing (its pixels): a quick look, not a drawing file')
    a = ap.parse_args()
    lines = json.load(open(a.lines))
    if a.window:
        # a quick look: the window cut out of the drawing (with a margin) and fitted alone, its strokes put back in sheet mm
        img = cv2.imread(a.drawing); x, y, w, h = [int(v) for v in a.window]; mg = 24; X0, Y0, X1, Y1 = max(0, x - mg), max(0, y - mg), min(img.shape[1], x + w + mg), min(img.shape[0], y + h + mg)
        keep = [l for l in lines['lines'] if any(X0 <= p[0] < X1 and Y0 <= p[1] < Y1 for p in l['points'])]
        sub = {**lines, 'image': {'w': X1 - X0, 'h': Y1 - Y0}, 'lines': [{**l, 'points': [[p[0] - X0, p[1] - Y0] for p in l['points']]} for l in keep]}
        mm = a.sheetmm / img.shape[1]; doc = build(img[Y0:Y1, X0:X1], sub, mm * (X1 - X0), a.zoom, orphan_mm=a.orphanmm, psf=a.psf)
        sh = lambda P: [[round(p[0] + X0 * mm, 3), round(p[1] + Y0 * mm, 3)] for p in P]
        for st in doc['strokes']: st['path'] = sh(st['path']); st['outline'] = [sh(r) for r in st['outline']]
        doc.update(sheetMm=a.sheetmm, heightMm=a.sheetmm * img.shape[0] / img.shape[1], drawing={'w': img.shape[1], 'h': img.shape[0]}, window=[x, y, w, h])
    else: doc = build(a.drawing, lines, a.sheetmm, a.zoom, orphan_mm=a.orphanmm, psf=a.psf)
    json.dump(doc, open(a.out, 'w'), separators=(',', ':'))
    n = sum(len(r) for s in doc['strokes'] for r in s['outline'])
    print(json.dumps({'strokes': len(doc['strokes']), 'outlinePoints': n, 'out': a.out}))

if __name__ == '__main__':
    main()
