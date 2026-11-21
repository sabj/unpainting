#!/usr/bin/env python3
# Pipeline: step 3d (after ink-vectors.py and the playing order): each fitted stroke is checked against the SOURCE.
"""Decide, stroke by stroke, what a model drawing's fitted strokes become, by looking at the source under each one.

    tag-medium.py VECTORS.json SOURCE [--out VECTORS.json] [--sheet fates.png]

For every stroke the source is sampled along the stroke's path (sheet mm mapped onto the source by proportion), with a
small sideways search (SEARCH_MM) because the model drawing is not perfectly registered:
  ink     the source has a drawn line there: a ridge darker than the ground immediately either side by REL of that ground's lightness (a pen, or a fine
          brush used as one), at most NIB_MM wide, under at least RUN of the stroke's length;
  graphite  no line in the source, but the stroke follows an edge between two differently coloured or valued areas
          (a contour the painter needs for placement): kept as a pale lay-in stroke;
  drop    neither: hatching, tone, texture or an invented contour that is not in the picture (`drop: true`).
Strokes cut from one traced line then take that feature's majority (by length) of ink or lay-in. An ink stroke also
gets `sourceLine`: the source's own line under it (widthMm, L*a*b*, and stage: closing when the line is neutral inside a
coloured wash, i.e. drawn over it; opening otherwise), so it is laid at the source's darkness (its width is recorded; the laid outline is the fit's).
The stroke gets `medium` (ink | graphite: the painter lays graphite strokes of an ink drawing first, pale), `drop`, and `evidence` (share of its path on a line, on an edge). The document
gets `mediumMap` with the counts. One rule for every picture: a picture with no pen line comes out all lay-in because
no stroke finds a line under it, not because of a label.
"""
import argparse, json
from collections import Counter
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import color, morphology

LONG = 1600          # the source is read at this long side
REL = 0.30           # a line is darker than the ground immediately either side of it by this share of that ground's L*
MIN_STEP = 8.0       # and by at least this many L* (below it, paper grain)
GLOBAL = 0.20        # and by this share of the picture's value range (mottled texture in a mid wash is not a line)
NIB_MM = 0.9         # widest line counted as drawn (wider is a brush mass, not a line)
LINE_MM = 5.0        # shortest drawn line counted (a speck or a blot edge is not a line)
SEARCH_MM = 1.2      # sideways search for the line or edge, for the drawing's registration
RUN = 0.7            # share of the stroke's path that must lie on a source line to be ink
EDGE = 2.5           # scale-normalised Lab gradient (a step of about 6 Lab units): an edge between two areas
EDGE_RUN = 0.4       # share of the path on a source edge to keep a non-ink contour as lay-in
CONTOURS = {'outline', 'inner', 'small', 'layin'}


def source_maps(path, sheet_w_mm):
    im = Image.open(path).convert('RGB'); s = LONG / max(im.size)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    lab = color.rgb2lab(np.asarray(im, np.float32) / 255); L = lab[..., 0]
    px_mm = im.width / sheet_w_mm
    nib = max(1, int(round(NIB_MM * px_mm / 2)))
    lo, hi = np.percentile(L, 2), np.percentile(L, 98); rng = max(10.0, hi - lo)
    # a ridge: darker than the closing over a nib-wide disc (both sides lighter), by the margin
    th = ndi.grey_closing(L, footprint=morphology.disk(nib + 1)) - L
    bg = L + th
    # local contrast, normalised by the local value: a line is a narrow ridge darker than what is immediately either side
    # of it by a share of that ground's own lightness, on a light ground or a dark one alike
    ridge = (th >= REL * bg) & (th >= MIN_STEP) & (th >= GLOBAL * rng)
    # no wider than a nib: what survives an opening wider than the nib is a mass, not a line
    mass = ndi.binary_opening(ridge, structure=morphology.disk(nib + 1))
    ridge &= ~ndi.binary_dilation(mass, iterations=1)
    # a drawn line runs on: keep ridge marks whose centre line is at least LINE_MM long and no wider than a nib on average
    lab_, n = ndi.label(ridge, structure=np.ones((3, 3)))
    if n:
        sk = morphology.skeletonize(ridge)
        sl = ndi.sum(sk, lab_, np.arange(1, n + 1)); ar = ndi.sum(ridge, lab_, np.arange(1, n + 1))
        keep = np.concatenate([[False], (sl >= LINE_MM * px_mm) & (ar / np.maximum(sl, 1) <= 2 * nib + 1)])
        ridge = keep[lab_]
    # an edge between two areas is a colour difference (Lab), sharp or soft: the scale-normalised Lab gradient, the most
    # over three scales (a soft wet-in-wet boundary shows at the wide scale, a crisp one at the narrow)
    g = 0
    for sg in (1.5, 3.0, 6.0):
        gs = 0
        for c in range(3):
            gy = ndi.gaussian_filter(lab[..., c], sg, order=(1, 0)); gx = ndi.gaussian_filter(lab[..., c], sg, order=(0, 1)); gs = gs + gx * gx + gy * gy
        g = np.maximum(g, np.sqrt(gs) * sg)
    edge = g > EDGE
    hard = np.zeros_like(edge)   # (no separate outline rule: a contour is ink only where the source draws a line)
    r = max(1, int(round(SEARCH_MM * px_mm)))
    k = morphology.disk(r)
    # the source's own line, for weight, colour and stage: its width (twice the distance to its edge), its colour, and
    # the colour of the wash around it (a closing takes the line out)
    # a line's width is twice its centre's distance to its edge, less the centre pixel; spread over the line so any of its pixels reads it
    width = np.maximum(1.0, 2 * ndi.grey_dilation(ndi.distance_transform_edt(ridge), size=(2 * nib + 1, 2 * nib + 1)) - 1) / px_mm
    around = [ndi.grey_closing(lab[..., c], footprint=morphology.disk(nib + 1)) for c in (1, 2)]
    _, idx = ndi.distance_transform_edt(~ridge, return_indices=True) if ridge.any() else (None, None)
    SRC.update(L=L, a=lab[..., 1], b=lab[..., 2], width=width, aa=around[0], ab=around[1], idx=idx)
    return ndi.binary_dilation(ridge, structure=k), ndi.binary_dilation(edge, structure=k), ndi.binary_dilation(hard, structure=k), im.size


SRC = {}
LAYIN_DARK = 0.35    # a lay-in stroke is laid no darker than this (pale graphite the washes cover)


def weigh(doc):
    """Ink strokes take the source line's darkness (its lightness against the paper); lay-in strokes are capped pale.
    The fitted value stays in `fitDark`, so a second run gives the same result."""
    paperL = float(np.percentile(SRC['L'], 95)) if 'L' in SRC else 95.0
    for s in doc['strokes']:
        if s.get('drop'): continue
        if s.get('medium') == 'ink' and 'sourceLine' in s:
            # darkness from the source's own line (the laid ink rasterises the fitted outline, so the width stays the fit's;
            # the source width is recorded in sourceLine.widthMm)
            s.setdefault('fitDark', s.get('dark')); s['dark'] = round(min(1.0, max(0.15, (paperL - s['sourceLine']['L']) / max(paperL, 1.0))), 3)
        elif s.get('medium') == 'graphite' and s.get('dark') is not None:
            s.setdefault('fitDark', s['dark']); s['dark'] = round(min(s['fitDark'], LAYIN_DARK), 3)


def source_line(ys, xs):
    """The source's own line nearest a stroke's samples: median width (mm), L*a*b* colour, and its stage: 'closing'
    when the line is neutral inside a coloured wash (drawn over the dry wash), else 'opening' (the wash went over it)."""
    iy, ix = SRC['idx'][0][ys, xs], SRC['idx'][1][ys, xs]
    w = float(np.median(SRC['width'][iy, ix])); Lc = float(np.median(SRC['L'][iy, ix]))
    a, b = float(np.median(SRC['a'][iy, ix])), float(np.median(SRC['b'][iy, ix]))
    wc = float(np.hypot(np.median(SRC['aa'][iy, ix]), np.median(SRC['ab'][iy, ix]))); lc = float(np.hypot(a, b))
    return {'widthMm': round(w, 3), 'L': round(Lc, 1), 'a': round(a, 1), 'b': round(b, 1),
            'stage': 'closing' if wc > 10 and lc < 0.5 * wc else 'opening'}


def tag(doc, line_near, edge_near, hard_near):
    H, W = line_near.shape
    sw, sh = float(doc['sheetMm']), float(doc.get('heightMm') or doc['sheetMm'] * H / W)
    fate = Counter()
    for s in doc['strokes']:
        pts = s.get('path') or [p for ring in s.get('outline', []) for p in ring]
        pts = np.asarray(pts, np.float64)
        if pts.size == 0: s['medium'], s['drop'] = 'graphite', True; fate['drop'] += 1; continue
        # resample densely so a long straight segment is sampled along its length
        seg = np.hypot(*np.diff(pts, axis=0).T) if len(pts) > 1 else np.zeros(0)
        n = max(2, int(seg.sum() / sw * W) + 1) if len(pts) > 1 else 1
        if len(pts) > 1:
            t = np.concatenate([[0], np.cumsum(seg)]); u = np.linspace(0, t[-1], n)
            pts = np.stack([np.interp(u, t, pts[:, 0]), np.interp(u, t, pts[:, 1])], 1)
        xs = np.clip((pts[:, 0] / sw * W).astype(int), 0, W - 1); ys = np.clip((pts[:, 1] / sh * H).astype(int), 0, H - 1)
        on_line, on_edge, on_hard = float(line_near[ys, xs].mean()), float(edge_near[ys, xs].mean()), float(hard_near[ys, xs].mean())
        s['evidence'] = {'line': round(on_line, 2), 'edge': round(on_edge, 2), 'hard': round(on_hard, 2)}
        s['_len'] = float(seg.sum()) if len(seg) else 0.0
        if on_line >= RUN or (s.get('part') in CONTOURS and on_hard >= RUN):
            s['medium'] = 'ink'; s.pop('drop', None); fate['ink'] += 1
            if SRC.get('idx') is not None: s['sourceLine'] = source_line(ys, xs)
        elif s.get('part') in CONTOURS and on_edge >= EDGE_RUN: s['medium'] = 'graphite'; s.pop('drop', None); fate['graphite'] += 1
        else: s['medium'] = 'graphite'; s['drop'] = True; fate['drop'] += 1
    # one feature, one fate: the strokes cut from one traced line (`line`) take the length-weighted majority of ink or
    # lay-in among those not dropped (a window frame is not half ink, half pencil)
    groups = {}
    for s in doc['strokes']:
        if not s.get('drop') and s.get('line') is not None: groups.setdefault(s['line'], []).append(s)
    for g in groups.values():
        inkl = sum(x['_len'] for x in g if x['medium'] == 'ink'); tot = sum(x['_len'] for x in g)
        want = 'ink' if tot and inkl >= 0.5 * tot else 'graphite'
        for x in g:
            if x['medium'] != want:
                fate[x['medium']] -= 1; fate[want] += 1; x['medium'] = want
                if want == 'ink' and 'sourceLine' not in x:
                    near = [y['sourceLine'] for y in g if 'sourceLine' in y]
                    if near: x['sourceLine'] = near[0]
                if want == 'graphite': x.pop('sourceLine', None)
    for s in doc['strokes']: s.pop('_len', None)
    weigh(doc)
    doc['mediumMap'] = {'counts': {'ink': fate['ink'], 'layin': fate['graphite'], 'dropped': fate['drop']},
                        'rule': 'tools/seg/tag-medium.py: ink where the source has a drawn line under the stroke; a contour on a source edge kept as pale lay-in; the rest dropped'}
    return doc


def fates_sheet(doc, size, src, out, box=None):
    """The tagged strokes drawn by fate on white: ink black, lay-in grey, dropped red; beside the source (crop box in
    sheet fractions x0,y0,x1,y1)."""
    from PIL import ImageDraw
    W, H = size; sw = float(doc['sheetMm']); sh = float(doc.get('heightMm') or sw * H / W)
    can = Image.new('RGB', size, 'white'); d = ImageDraw.Draw(can)
    for s in doc['strokes']:
        p = s.get('path') or []
        if len(p) < 2: continue
        c = (220, 40, 40) if s.get('drop') else ((0, 0, 0) if s.get('medium') == 'ink' else (150, 150, 150))
        d.line([(x / sw * W, y / sh * H) for x, y in p], fill=c, width=1)
    a = Image.open(src).convert('RGB').resize(size)
    if box:
        b = (int(box[0] * W), int(box[1] * H), int(box[2] * W), int(box[3] * H)); a, can = a.crop(b), can.crop(b)
    o = Image.new('RGB', (a.width * 2 + 10, a.height), 'white'); o.paste(a, (0, 0)); o.paste(can, (a.width + 10, 0)); o.save(out, quality=90)


# ---------------------------------------------------------------------------------------------------------------------
# --mode contour (21 Nov, the lead's structural rule): a stroke's fate is decided by what it IS, for a whole connected
# contour at once, never per piece. Per-piece evidence kept only the pieces where a buried pen line happened to show
# (ks-beach's first tagged render: ink in fragments, dark brush accents as blots, hatching kept as lay-in).
#   hatching   found by geometry: a fairly straight stroke with HATCH_N or more near-parallel strokes of similar length
#              a few mm away. Dropped, unless the source draws it (a narrow line on a light ground under nearly all of it,
#              continuously: a gate's bars, leaded panes), or it runs along an edge of the block-in study's masses (a black
#              dog's silhouette drawn as fur strokes). A source edge alone does not save it: hatching runs along the shadow
#              bands it shades (Trumbull's road). A lay-in never holds hatching.
#   outline    a contour that runs ALONG a boundary between masses: an edge of the block-in study's shapes, or a coarse
#              (about COARSE_MM) value or colour edge of the source, with the stroke's direction along the edge. Strokes
#              are chained into contours (the traced line's own pieces, and ends that meet with a continuing direction);
#              a contour is kept, whole, if it holds a strong stroke (BOUNDARY_HI along a boundary), together with the
#              weak strokes it runs through (BOUNDARY_LO): an edge tracker's hysteresis.
#   drawn run  an interior contour that is no boundary and no hatching is kept, whole, when the source draws it: its
#              longest continuous run on a narrow two-sided line is RUN_MM or more and a line lies under RUN of it
#              (a gate's ironwork on a light ground).
#   fills and tones are dropped unless the source draws them as a line (a gate's ironwork), and so is everything else.
# Fate: in a picture measured as pen-drawn (--picture ink) every kept contour is ink, unless its SEEABLE length (not
# beside a dark mass, where no line could show) is at least VOTE_MM and a line lies under less than VOTE of it: then it is
# lay-in, whole. A contour with nothing seeable takes ink. In a picture with no pen line (--picture none) every kept
# contour is lay-in. Fills and tones are never kept: the washes paint the masses.
HATCH_N = 3          # parallel neighbours that make a stroke hatching
HATCH_ANG = 12.0     # degrees: near-parallel
HATCH_STRAIGHT = 0.85  # chord over length: hatching is straight
COARSE_MM = 1.5      # the source's boundaries are read smoothed by this much (mottling, grain and hatching gone)
EDGE_C = 6.0         # scale-normalised Lab gradient for a boundary between masses (a step of about 15 Lab units; a blotch inside a wash is less)
ALIGN = 0.8          # |cos| between the stroke and the edge's own direction
BOUNDARY_HI, BOUNDARY_LO = 0.6, 0.25
JOIN_MM, JOIN_COS = 1.5, 0.7
MIN_CONTOUR_MM = 2.5
RUN_MM = 6.0
DARK_L = 35.0        # a sample beside a mass darker than this cannot show a pen line (unseeable)
VOTE, VOTE_MM = 0.2, 10.0
NOT_LINES = {'fill', 'tone'}
LIGHT_GROUND = 55.0  # L* either side of a fill the source draws as a line


def _resample(p, sw, W):
    seg = np.hypot(*np.diff(p, axis=0).T); t = np.concatenate([[0], np.cumsum(seg)])
    m = max(2, int(t[-1] / sw * W * 1.5) + 1); u = np.linspace(0, t[-1], m)
    x, y = np.interp(u, t, p[:, 0]), np.interp(u, t, p[:, 1])
    return x, y, t[-1], np.arctan2(np.gradient(y), np.gradient(x))


def boundary_maps(lab, px_mm, study=None):
    """The boundaries between masses: (mask, along-angle) from the study's shape edges and the source's coarse edges."""
    def grad(img, sg):
        G, AX, AY = 0, 0, 0
        for c in range(3):
            gy_ = ndi.gaussian_filter(img[..., c], sg, order=(1, 0)); gx_ = ndi.gaussian_filter(img[..., c], sg, order=(0, 1))
            # the structure tensor's sum keeps the direction whatever the sign of each channel's step
            G = G + gx_ * gx_ + gy_ * gy_; AX = AX + gx_ * gx_ - gy_ * gy_; AY = AY + 2 * gx_ * gy_
        return np.sqrt(G) * sg, 0.5 * np.arctan2(AY, AX) + np.pi / 2
    m1, a1 = grad(lab, COARSE_MM * px_mm)
    mask, ang = m1 > EDGE_C, a1
    e2, a2 = np.zeros_like(mask), a1
    if study is not None:
        m2, a2 = grad(study, max(1.0, 0.4 * px_mm))
        e2 = m2 > EDGE_C; ang = np.where(e2 & (m2 > m1), a2, ang); mask = mask | e2
    return mask, ang, e2, a2


def tag_contours(doc, source, study_path=None, picture='ink'):
    im = Image.open(source).convert('RGB'); sc = LONG / max(im.size)
    im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
    lab = color.rgb2lab(np.asarray(im, np.float32) / 255); L = lab[..., 0]; H, W = L.shape
    sw = float(doc['sheetMm']); sh = float(doc.get('heightMm') or sw * H / W); px_mm = W / sw
    line_near, _, _, _ = source_maps(source, sw)          # the narrow two-sided drawn line (dilated by SEARCH_MM)
    study = None
    if study_path:
        st = Image.open(study_path).convert('RGB').resize((W, H), Image.LANCZOS)
        study = color.rgb2lab(np.asarray(st, np.float32) / 255)
    bmask, bang, smask, sang = boundary_maps(lab, px_mm, study)
    sdist, (sy_, sx_) = ndi.distance_transform_edt(~smask, return_indices=True)
    r = max(1, int(round(SEARCH_MM * px_mm)))
    bdist, (by, bx) = ndi.distance_transform_edt(~bmask, return_indices=True)
    nib = max(1, int(round(NIB_MM * px_mm / 2))); ground = ndi.grey_closing(L, footprint=morphology.disk(nib + 2))
    seeable = ndi.grey_erosion(ndi.gaussian_filter(L, px_mm * 0.5), footprint=morphology.disk(r)) > DARK_L
    S = doc['strokes']; n = len(S)
    info = [None] * n
    for i, s in enumerate(S):
        p = np.asarray(s.get('path') or [], np.float64)
        if len(p) < 2 or s.get('soft'): continue
        x, y, ln, tg = _resample(p, sw, W)
        if ln <= 0: continue
        xs = np.clip((x / sw * W).astype(int), 0, W - 1); ys = np.clip((y / sh * H).astype(int), 0, H - 1)
        jy, jx = by[ys, xs], bx[ys, xs]
        onb = (bdist[ys, xs] <= r) & (np.abs(np.cos(bang[jy, jx] - tg)) >= ALIGN)
        onm = (sdist[ys, xs] <= r) & (np.abs(np.cos(sang[sy_[ys, xs], sx_[ys, xs]] - tg)) >= ALIGN)
        online = line_near[ys, xs]; see = seeable[ys, xs]
        best = cur = 0
        for v in online:
            cur = cur + 1 if v else 0; best = max(best, cur)
        chord = float(np.hypot(*(p[-1] - p[0])))
        info[i] = dict(len=ln, b=float(onb.mean()), bm=float(onm.mean()), line=float(online.mean()), run=best * ln / max(len(online) - 1, 1),
                       seeL=float(see.mean()) * ln, lineSee=float((online & see).mean()) * ln, straight=chord / ln, ground=float(np.median(ground[ys, xs])),
                       ang=float(np.arctan2(p[-1, 1] - p[0, 1], p[-1, 0] - p[0, 0])), mid=p.mean(0), ends=(p[0], p[-1]),
                       tin=float(np.arctan2(*(p[min(2, len(p) - 1)] - p[0])[::-1])), tout=float(np.arctan2(*(p[-1] - p[max(0, len(p) - 3)])[::-1])), ys=ys, xs=xs)
    from scipy.spatial import cKDTree
    idx = [i for i in range(n) if info[i]]
    # hatching by geometry
    hatch = set()
    mids = np.array([info[i]['mid'] for i in idx]).reshape(-1, 2); tree = cKDTree(mids) if len(idx) else None
    for k, i in enumerate(idx if tree is not None else []):
        a = info[i]
        if a['straight'] < HATCH_STRAIGHT or a['len'] > 60: continue
        cnt = 0
        for k2 in tree.query_ball_point(a['mid'], max(3.0, 1.2 * a['len'])):
            j = idx[k2]
            if j == i: continue
            b = info[j]
            if b['straight'] < HATCH_STRAIGHT or not (0.5 <= b['len'] / a['len'] <= 2): continue
            if abs(np.cos(a['ang'] - b['ang'])) < np.cos(np.radians(HATCH_ANG)): continue
            d = b['mid'] - a['mid']; off = abs(-np.sin(a['ang']) * d[0] + np.cos(a['ang']) * d[1])
            if off < 0.3: continue        # the same line restated, not a neighbour
            cnt += 1
        if cnt >= HATCH_N: hatch.add(i)
    # chains: the traced line's own pieces, and ends that meet with a continuing direction
    parent = list(range(n))
    def find(i):
        while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
        return i
    def join(i, j): parent[find(i)] = find(j)
    # hatching the SOURCE itself draws (a gate's bars, leaded panes: a narrow two-sided line on a light ground under nearly
    # all of the stroke, continuously) is the artist's, not the model's tone: it stays a candidate like any line
    own = lambda a: a['line'] >= 0.8 and a['seeL'] >= 0.8 * a['len'] and a['run'] >= 0.7 * a['len']
    # a fill or tone (a mass of ink the model drew) is a candidate only where the source draws it the same way: a gate's
    # ironwork, solid black bars on a light ground. Elsewhere the washes paint the masses.
    # (its ground: what lies either side of it in the source, light where a black bar stands against an opening; a fold
    # blot inside a mid-dark wash has no light ground)
    mass = lambda i: S[i].get('part') in NOT_LINES or S[i].get('fill')
    ownmass = lambda a: a['line'] >= RUN and a['ground'] >= LIGHT_GROUND
    cand = [i for i in idx if (ownmass(info[i]) if mass(i) else not (i in hatch and not own(info[i]) and info[i]['bm'] < BOUNDARY_HI))]
    byline = {}
    for i in cand:
        if S[i].get('line') is not None: byline.setdefault(S[i]['line'], []).append(i)
    for g in byline.values():
        for a, b in zip(g, g[1:]): join(a, b)
    E = []; meta = []
    for i in cand:
        for e, (pt, t) in enumerate(((info[i]['ends'][0], info[i]['tin'] + np.pi), (info[i]['ends'][1], info[i]['tout']))):
            E.append(pt); meta.append((i, t))
    if E:
        et = cKDTree(np.array(E))
        for a, b in et.query_pairs(JOIN_MM):
            (i, ta), (j, tb) = meta[a], meta[b]
            if i != j and np.cos(ta - tb) <= -JOIN_COS: join(i, j)   # outward directions opposed: the line runs on
    comps = {}
    for i in cand: comps.setdefault(find(i), []).append(i)
    fate = Counter(); kept_ids = 0
    for c in comps.values():
        tot = sum(info[i]['len'] for i in c)
        strong = [i for i in c if info[i]['b'] >= BOUNDARY_HI]
        outline = bool(strong) and tot >= MIN_CONTOUR_MM
        members = [i for i in c if info[i]['b'] >= BOUNDARY_LO or i in strong] if outline else []
        drawn = False
        if not outline:
            # a drawn interior run: the longest continuous run on a source line, and a line under most of it
            run = max(info[i]['run'] for i in c); share = sum(info[i]['line'] * info[i]['len'] for i in c) / max(tot, 1e-6)
            drawn = run >= RUN_MM and share >= RUN
            members = c if drawn else []
        if not members: continue
        kept_ids += 1
        if picture == 'ink':
            see = sum(info[i]['seeL'] for i in members); ln = sum(info[i]['lineSee'] for i in members)
            med = 'ink' if (see < VOTE_MM or ln >= VOTE * see or drawn) else 'graphite'
        else:
            med = 'graphite'
        if med == 'graphite': members = [i for i in members if i not in hatch]   # a lay-in never holds hatching
        for i in members:
            S[i]['medium'] = med; S[i]['drop'] = False; S[i]['contour'] = kept_ids; S[i]['keptAs'] = 'drawn run' if drawn else 'outline'
    for i, s in enumerate(S):
        if info[i]:
            s['evidence'] = {'line': round(info[i]['line'], 2), 'boundary': round(info[i]['b'], 2), 'run': round(info[i]['run'], 1),
                             'seeable': round(info[i]['seeL'] / max(info[i]['len'], 1e-6), 2), 'hatch': i in hatch}
        if s.get('drop') is False and 'contour' in s:
            s.pop('drop'); fate['ink' if s['medium'] == 'ink' else 'graphite'] += 1
        else:
            s['medium'] = 'graphite'; s['drop'] = True; s.pop('contour', None); s.pop('keptAs', None); s.pop('sourceLine', None); fate['drop'] += 1
    # an ink contour's darkness: the source's own line under it where it shows, else the picture's median ink line
    if SRC.get('idx') is not None:
        lines = {}
        for i, s in enumerate(S):
            if s.get('medium') == 'ink' and not s.get('drop') and info[i]:
                on = line_near[info[i]['ys'], info[i]['xs']]
                if on.any(): lines.setdefault(s['contour'], []).append(source_line(info[i]['ys'][on], info[i]['xs'][on]))
        allL = [x for v in lines.values() for x in v]
        fallback = min(allL, key=lambda q: abs(q['L'] - float(np.median([z['L'] for z in allL])))) if allL else None
        for s in S:
            if s.get('medium') == 'ink' and not s.get('drop'):
                v = lines.get(s['contour'])
                pick = min(v, key=lambda q: abs(q['L'] - float(np.median([z['L'] for z in v])))) if v else fallback
                if pick: s['sourceLine'] = pick
    weigh(doc)
    doc['mediumMap'] = {'counts': {'ink': fate['ink'], 'layin': fate['graphite'], 'dropped': fate['drop']}, 'contours': kept_ids,
                        'hatching': len(hatch), 'picture': picture,
                        'rule': 'tools/seg/tag-medium.py --mode contour: whole contours along mass boundaries (study shapes, coarse source edges), or interior runs the source draws; hatching (by geometry), fills and tones dropped; ink in a pen-drawn picture unless the contour\'s seeable length shows no line'}
    return doc


# --keep pencil: nothing is dropped. What the contour rule would drop becomes a faint pencil under-drawing (the owner, 21 Nov:
# "if you ink over the pencil but then do so selectively, it lets you use form without having it persist through the
# painting"), and any stroke the SOURCE draws in near-black is ink whatever its part: a line lying on near-black source
# pixels at its own width (a gate's lattice, window leading, the joints the source inks), or a marked fill whose own outline
# covers near-black source (the gate's dark mass). The model's hatching over a pale wall or sky finds no dark under it and
# stays pencil.
DARK_INK_L = 30.0      # near-black: the source's L* at or under this ...
DARK_INK_C = 15.0      # ... and no more chroma than this (a dark wash is coloured; ink is neutral)
DARK_RUN = 0.6         # share of a line's samples on near-black (at its own width) for it to be ink
DARK_FILL = 0.6        # share of a fill's area on near-black for it to be ink
REG_MM = 0.3           # registration allowance beside a line's own half-width
PENCIL_DARK, PENCIL_FILL_DARK = 0.2, 0.1   # the pencil's share of each stroke's fitted darkness (lines, fills)


def keep_pencil(doc, source, ink_by='contour+dark'):
    """Every stroke kept: ink where the contour rule kept ink or where the source under it is near-black ink; every other
    stroke pencil (medium 'graphite'), at PENCIL_DARK (fills PENCIL_FILL_DARK) of its fitted darkness."""
    from PIL import ImageDraw
    im = Image.open(source).convert('RGB'); sc = LONG / max(im.size)
    im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
    lab = color.rgb2lab(np.asarray(im, np.float32) / 255); H, W = lab.shape[:2]
    sw = float(doc['sheetMm']); sh = float(doc.get('heightMm') or sw * H / W); px_mm = W / sw
    black = (lab[..., 0] <= DARK_INK_L) & (np.hypot(lab[..., 1], lab[..., 2]) <= DARK_INK_C)
    near = {}
    def black_within(r):
        r = max(0, int(round(r * px_mm)))
        if r not in near: near[r] = ndi.binary_dilation(black, structure=morphology.disk(r)) if r else black
        return near[r]
    moved = Counter(); fate = Counter()
    for s in doc['strokes']:
        # (ink_by 'dark': only the source's own darkness under the stroke decides, stroke by stroke; a contour is not inked
        # whole because part of it has evidence)
        contour_ink = ink_by == 'contour+dark' and s.get('medium') == 'ink' and not s.get('drop')
        ink = contour_ink
        if not ink:
            is_fill = s.get('fill') or s.get('part') in NOT_LINES
            if is_fill and s.get('outline'):
                m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m)
                for ring in s['outline']:
                    if len(ring) >= 3: d.polygon([(x / sw * W, y / sh * H) for x, y in ring], fill=1)
                a = np.asarray(m, bool)
                if a.sum() == 0:
                    ring = np.asarray([p for r in s['outline'] for p in r]); xs = np.clip((ring[:, 0] / sw * W).astype(int), 0, W - 1); ys = np.clip((ring[:, 1] / sh * H).astype(int), 0, H - 1)
                    ink = float(black_within(REG_MM)[ys, xs].mean()) >= DARK_FILL
                else:
                    ink = float(black_within(REG_MM)[a].mean()) >= DARK_FILL
            else:
                p = np.asarray(s.get('path') or [], np.float64)
                if len(p) >= 2:
                    x, y, ln, _ = _resample(p, sw, W)
                    xs = np.clip((x / sw * W).astype(int), 0, W - 1); ys = np.clip((y / sh * H).astype(int), 0, H - 1)
                    half = 0.5 * float(np.median(s.get('widths') or [0.3]))
                    ink = float(black_within(half + REG_MM)[ys, xs].mean()) >= DARK_RUN
            if ink: moved[s.get('part')] += 1
        s.pop('drop', None)
        if ink:
            s['medium'] = 'ink'; fate['ink'] += 1
            if not contour_ink: s['inkBy'] = 'dark source'
            else: s.pop('inkBy', None)
        else:
            s['medium'] = 'graphite'; s.setdefault('fitDark', s.get('dark', 1.0))
            s['dark'] = round(float(s['fitDark']) * (PENCIL_FILL_DARK if (s.get('fill') or s.get('part') in NOT_LINES) else PENCIL_DARK), 4)
            fate['graphite'] += 1
    doc['mediumMap'] = {**doc.get('mediumMap', {}), 'counts': {'ink': fate['ink'], 'layin': fate['graphite'], 'dropped': 0},
                        'movedToInkByDarkSource': dict(moved),
                        'inkBy': ink_by, 'keep': 'pencil: nothing dropped; ink where ('+ink_by+') the contour rule keeps ink or the source under the stroke is near-black (L* <= %g, C* <= %g); pencil at %g of the fitted darkness (fills %g)' % (DARK_INK_L, DARK_INK_C, PENCIL_DARK, PENCIL_FILL_DARK)}
    return doc


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('vectors'); ap.add_argument('source'); ap.add_argument('--out')
    ap.add_argument('--sheet'); ap.add_argument('--box', help='x0,y0,x1,y1 in sheet fractions for --sheet')
    ap.add_argument('--mode', choices=['evidence', 'contour'], default='evidence')
    ap.add_argument('--study', help='--mode contour: the block-in study (s3) whose shape edges are boundaries')
    ap.add_argument('--inkby', choices=['contour+dark', 'dark'], default='contour+dark', help='--keep pencil: which strokes are ink')
    # rule A is the mode (the owner, 21 Nov: "a is probably better as a mode"); --keep drop is the old contour-only drawing
    ap.add_argument('--keep', choices=['drop', 'pencil'], default='pencil', help='--mode contour: pencil (default) keeps every stroke: what the rule drops becomes faint pencil, and near-black source makes ink; drop: the old contour rule')
    ap.add_argument('--picture', choices=['ink', 'none'], help='--mode contour: the picture-level measurement (classify/<id>.json measured_class ink, else none)')
    A = ap.parse_args()
    doc = json.load(open(A.vectors))
    if A.mode == 'contour':
        if not A.picture: ap.error('--mode contour needs --picture')
        line_near, _, _, size = source_maps(A.source, float(doc['sheetMm']))
        tag_contours(doc, A.source, A.study, A.picture)
        if A.keep == 'pencil': keep_pencil(doc, A.source, A.inkby)
        json.dump(doc, open(A.out or A.vectors, 'w'))
        if A.sheet: fates_sheet(doc, size, A.source, A.sheet, [float(v) for v in A.box.split(',')] if A.box else None)
        print(json.dumps(doc['mediumMap']['counts'])); return
    line_near, edge_near, hard_near, size = source_maps(A.source, float(doc['sheetMm']))
    tag(doc, line_near, edge_near, hard_near)
    json.dump(doc, open(A.out or A.vectors, 'w'))
    if A.sheet: fates_sheet(doc, size, A.source, A.sheet, [float(v) for v in A.box.split(',')] if A.box else None)
    print(json.dumps(doc['mediumMap']['counts']))


if __name__ == '__main__':
    main()
