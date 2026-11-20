#!/usr/bin/env python3
# Pipeline: inking, stage 3c (the pen's strokes as vector shapes fitted to the drawing's own ink).
"""Divide a clean pen drawing's ink into strokes, each a VECTOR shape in sheet millimetres fitted to the drawing: a smooth
closed outline (rings, the ink's edge at half the stroke's own darkness), the path the pen takes along it (the ordered
line file's centre line, for the direction and the nib's advance), the width along that path, and the stroke's darkness.
Each stroke names the ordered line it came from (`line`, that line's seq), so a stage cut from the line file takes the same
vector strokes (src/paint/methods/linework-plan.mjs).
The drawing's pixels are only what the vectors are fitted to; the plate's ink is rendered from the vectors at any
resolution (render_vectors), so a zoom re-renders crisp.

Every ink pixel goes to one stroke: each ordered stroke claims the ink under its own width, a longer stroke over a shorter
one where they cross (one bar passes through a junction, the other meets it), and the ink's soft edge goes to the nearest
claim. Ink farther than --orphanmm from every stroke (a speck the tracer left) becomes a stroke of its own, laid just after
the nearest stroke. Nothing is added and nothing is re-estimated: the outline follows the ink.

usage: ink-vectors.py DRAWING.png ORDERED-lines.json --sheetmm MM --out FILE.json [--zoom 2]
"""
import argparse, json, math
import numpy as np, cv2
from scipy.ndimage import find_objects
from skimage.measure import find_contours
import os
# the outline's level, as a share of the stroke's own darkness (a faint stroke's a little lower)
LVL, LVL_FAINT = float(os.environ.get('IV_LVL', .5)), float(os.environ.get('IV_LVLF', .45))

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

def cross_sections(f, lvl, P, reach=8.0, step=.25):
    """Across a line at each point of its path P (grid pixels, in the field f's frame): where the ink crosses `lvl` on either
    side, read along the normal with linear interpolation. Returns (centre offset along the normal, width), NaN where the
    path is not on this ink."""
    n = len(P); T = np.gradient(P, axis=0); T /= np.maximum(1e-9, np.hypot(*T.T))[:, None]; N = np.c_[-T[:, 1], T[:, 0]]
    t = np.arange(-reach, reach + step, step); X = (P[:, None, 0] + t[None] * N[:, None, 0]).astype(np.float32); Y = (P[:, None, 1] + t[None] * N[:, None, 1]).astype(np.float32)
    v = cv2.remap(f.astype(np.float32), X, Y, cv2.INTER_LINEAR, borderValue=0)
    off, wid = np.full(n, np.nan), np.full(n, np.nan); c = len(t) // 2
    for k in range(n):
        row = v[k]; inside = row >= lvl
        if not inside[c - 4:c + 5].any(): continue
        j = c - 4 + int(np.argmax(row[c - 4:c + 5])); a = j; b = j
        while a > 0 and inside[a - 1]: a -= 1
        while b < len(t) - 1 and inside[b + 1]: b += 1
        if a == 0 or b == len(t) - 1: continue
        ea = t[a - 1] + (lvl - row[a - 1]) / max(1e-9, row[a] - row[a - 1]) * step; eb = t[b] + (row[b] - lvl) / max(1e-9, row[b] - row[b + 1]) * step
        off[k] = .5 * (ea + eb); wid[k] = eb - ea
    return off, wid


def sausage(P, half, cap=6):
    """The outline of a line drawn along P with half-widths `half` (same unit): both sides offset along the normal, round ends."""
    T = np.gradient(P, axis=0); T /= np.maximum(1e-9, np.hypot(*T.T))[:, None]; N = np.c_[-T[:, 1], T[:, 0]]
    L, R = P + N * half[:, None], P - N * half[:, None]
    def end(p, t, h, sgn):
        a0 = math.atan2(t[1], t[0]); return [p + h * np.array([math.cos(a0 + sgn * (math.pi / 2 - math.pi * i / cap)), math.sin(a0 + sgn * (math.pi / 2 - math.pi * i / cap))]) for i in range(1, cap)]
    ring = list(L) + end(P[-1], T[-1], half[-1], -1)[::-1] + list(R[::-1]) + end(P[0], -T[0], half[0], -1)[::-1]
    return np.array(ring)


def build(drawing, lines_doc, sheet_mm, zoom=2, ink=.06, orphan_mm=.6, sigma=.6, eps=.1):
    bgr = cv2.imread(drawing); h0, w0 = bgr.shape[:2]
    if (lines_doc['image']['w'], lines_doc['image']['h']) != (w0, h0): raise SystemExit('ink-vectors: the line file is not on the drawing\'s grid')
    W, H = w0 * zoom, h0 * zoom; px = sheet_mm / W   # mm per grid pixel
    a = cv2.resize(darkness(bgr), (W, H), interpolation=cv2.INTER_CUBIC).clip(0, 1)
    # a light drawing (pencil, whose firmest line is grey) is fitted on its own scale: the shapes are found as if its
    # firmest line were black, and each stroke keeps its real darkness
    firm = float(np.percentile(a[a > .02], 99)) if (a > .02).any() else 1.0
    gain = 1 / firm if firm < .6 else 1.0
    a = np.clip(a * gain, 0, 1)
    inkm = a > ink
    L = sorted(lines_doc['lines'], key=lambda l: l['seq'])
    g = lambda P: (np.asarray(P, float) + .5) * zoom - .5   # source pixel -> grid pixel
    # claims: each stroke drawn at its own width, shortest first, so the longer stroke wins where two cross
    lab = np.zeros((H, W), np.int32); par = np.zeros((H, W), np.float32)
    for k in sorted(range(len(L)), key=lambda k: L[k].get('length', 0)):
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
        n, cl = cv2.connectedComponents(orphan.astype(np.uint8), connectivity=8)
        for c in range(1, n):
            ys, xs = np.nonzero(cl == c)
            if len(xs) < 2: owner[ys, xs] = 0; continue
            Q = np.c_[xs, ys].astype(float); m = Q.mean(0); _, _, vt = np.linalg.svd(Q - m, full_matrices=False); d = vt[0]
            if abs(d[1]) > abs(d[0]) and d[1] < 0 or abs(d[0]) >= abs(d[1]) and d[0] < 0: d = -d
            with np.errstate(all='ignore'): u = (Q - m) @ d   # (Accelerate's matmul warns spuriously)
            nearest = int(owner[int(m[1]), int(m[0])]) or int(lab.ravel()[of[near[int(m[1]), int(m[0])]]])
            kid = len(L) + len(extra) + 1; owner[ys, xs] = kid; param[ys, xs] = (u - u.min()) / max(1e-9, u.max() - u.min())
            extra.append({'after': nearest - 1, 'path': np.vstack([m + u.min() * d, m + u.max() * d]), 'part': 'small'})
    strokes = []
    edge_ring = lambda r: (r[:, ::-1] + .5) * px   # find_contours gives (row, col) on the grid; to sheet mm (x, y)
    boxes = find_objects(owner)
    for k in range(1, len(L) + len(extra) + 1):
        b = boxes[k - 1] if k - 1 < len(boxes) else None
        if b is None: continue
        x0, y0, x1, y1 = max(0, b[1].start - 3), max(0, b[0].start - 3), min(W, b[1].stop + 3), min(H, b[0].stop + 3)
        own = owner[y0:y1, x0:x1] == k
        # the stroke's darkness: its core (the darker tenth of its ink); its edge at half of that
        av = a[y0:y1, x0:x1][own]; dk = float(np.percentile(av, 90))
        if dk < 2 * ink: continue
        A = a[y0:y1, x0:x1]; grow = lambda m: cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        # a stroke whose ink is part black and part grey (black bars round a grey pane) is two pieces on one path, the grey
        # laid first and the black over it, each at its own darkness: grey stays grey
        # (grey that is a black line's soft edge does not count: only grey two pixels and more from the black)
        # (only an area, not a line: ink at least eight grid pixels across somewhere, with a sixth or more of it grey)
        black = own & (A >= .85); grey = own & (A >= .3) & (A < .85)
        wide = cv2.distanceTransform(own.astype(np.uint8), cv2.DIST_L2, 3).max() >= 4
        split = wide and black.sum() >= 8 and grey.sum() >= max(8, own.sum() / 6)
        pieces = [(own, dk, None)] if not split else [(own, float(np.percentile(A[grey], 90)), None), (black, float(np.percentile(A[black], 90)), .85)]
        parts = []
        for n_, (m, top, edge) in enumerate(pieces):
            # a faint line is one stroke: its field softened very slightly and its edge at 0.45 of its darkness, so its dips do
            # not break it into dashes (more would fuse close faint hatching into a grey blot). The black over a grey area
            # has its edge at 0.85, so the dark grey of glass between black bars stays grey round them
            faint = top < .5; F = cv2.GaussianBlur(A, (0, 0), .4) if faint else A; lvl = edge or (LVL_FAINT if faint else LVL) * top
            vals = A[m]; vals = vals[vals >= lvl]
            if split and n_ == 0: vals = A[grey]
            if not len(vals): continue
            # its darkness: the median of its ink inside its edge (a drawing's black varies a little from mark to mark: over
            # 0.85 is black, so a dark mass made of several strokes is one black, not a patchwork of near-blacks; a grey
            # stays its own grey)
            # a line's darkness is its core's (the darker tenth): its edge at half of that is its drawn width (the width at half
            # the darkness of a soft-edged line), so a thin black line stays thin and black; a grey area under black bars
            # takes its median, an even wash of grey
            tone = (float(np.median(vals)) if split and n_ == 0 else top) / gain; tone = 1.0 if tone >= .85 else tone
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
                c = simplify_ring(smooth_ring(c, min(sigma, .35 * half)), min(eps, .15 * half))
                if len(c) >= 3: rings.append(np.round(edge_ring(c), 3).tolist())
            if rings: parts.append((rings, tone, f, lvl))
        if not parts: continue
        if k <= len(L):
            l = L[k - 1]; path = (np.asarray(l['points'], float) + .5) * (sheet_mm / w0)
            rec = {'seq': l['seq'], 'line': l['seq'], 'part': l.get('part'), 'phase': l.get('phase'), 'object': l.get('object'), 'unit': l.get('unit')}
        else:
            e = extra[k - len(L) - 1]; path = (e['path'] + .5) * px; ln = L[e['after']]['seq'] if e['after'] >= 0 else len(L)
            rec = {'seq': ln + .5, 'line': ln, 'part': 'small', 'phase': 'texture'}
        # the width along the path: twice the distance to the outline's ink, read on the grid
        for n_, (rings, tone, f, lvl) in enumerate(parts):
            inside = (f[1:-1, 1:-1] >= lvl).astype(np.uint8); dt = cv2.distanceTransform(np.pad(inside, 1), cv2.DIST_L2, 5)[1:-1, 1:-1]
            gp = path / px - .5; ii = np.clip(np.round(gp[:, 0]).astype(int) - x0, 0, x1 - x0 - 1); jj = np.clip(np.round(gp[:, 1]).astype(int) - y0, 0, y1 - y0 - 1)
            widths = np.round(2 * dt[jj, ii] * px, 3).tolist()
            # a LINE (one outline, no holes, long against its width) is drawn as its path with the width the ink has across
            # it: the centre and width read across the line and smoothed ALONG it, never across, so a straight line stays
            # straight and a thin one thin, with no wobble from the drawing's pixels. Used only where it covers the same ink
            # as the fitted outline (area within a third), else the outline stands.
            Lp = float(np.hypot(*np.diff(path, axis=0).T).sum()) if len(path) > 1 else 0
            if len(rings) == 1 and len(parts) == 1 and Lp > 0:
                G = (path / px - .5) - [x0 - 1, y0 - 1]
                seg = np.r_[0, np.cumsum(np.hypot(*np.diff(G, axis=0).T))]; m = max(2, int(seg[-1] / .5) + 1); u = np.linspace(0, seg[-1], m)
                Q = np.c_[np.interp(u, seg, G[:, 0]), np.interp(u, seg, G[:, 1])]
                off, wid = cross_sections(f, lvl, Q)
                ok = np.isfinite(wid)
                if ok.mean() > .8 and seg[-1] > 3 * np.nanmedian(wid):
                    k_ = np.arange(m); off = np.interp(k_, k_[ok], off[ok]); wid = np.interp(k_, k_[ok], wid[ok])
                    sm = lambda v, sg: np.convolve(np.pad(v, 12, mode='edge'), (lambda g: g / g.sum())(np.exp(-.5 * (np.arange(-12, 13) / sg) ** 2)), 'valid')
                    off, wid = sm(off, 4.0), sm(wid, 2.0)
                    T = np.gradient(Q, axis=0); T /= np.maximum(1e-9, np.hypot(*T.T))[:, None]; C = Q + np.c_[-T[:, 1], T[:, 0]] * off[:, None]
                    # a thin line's core (under three grid pixels) reads lighter than it was drawn (a pixel-wide black line sampled between pixels):
                    # darkness up to black over 0.75, the width narrowed to keep the same ink, so it is thin and black
                    if .45 <= tone < 1 and np.median(wid) < 3: t2 = min(1.0, tone / .75); wid = wid * tone / t2; tone = t2
                    ring = sausage(C, np.maximum(.35, wid / 2))
                    a_ring, a_s = abs(ring_area(np.asarray(rings[0]) / px)), abs(ring_area(ring))
                    if a_ring > 0 and abs(a_s / a_ring - 1) < .33:
                        rings = [np.round(edge_ring(np.c_[ring[:, 1] + y0 - 1, ring[:, 0] + x0 - 1]), 3).tolist()]
                        path = np.round((C + [x0 - 1, y0 - 1] + .5) * px, 3); widths = np.round(wid * px, 3).tolist()
            strokes.append({**rec, 'seq': rec['seq'] + .01 * n_, 'dark': round(tone, 3), 'path': np.round(path, 3).tolist(), 'widths': widths, 'outline': rings, **({'piece': ['grey', 'black'][n_]} if len(parts) > 1 else {})})
    strokes.sort(key=lambda s: s['seq'])
    for i, s in enumerate(strokes): s['seq'] = i
    return {'source': 'ink-vectors: strokes as vector shapes fitted to a prepared drawing\'s ink', 'medium': lines_doc.get('medium', 'ink'),
            'sheetMm': sheet_mm, 'heightMm': sheet_mm * h0 / w0, 'drawing': {'w': w0, 'h': h0}, 'level': 'half the stroke\'s darkness', 'firm': round(firm, 3),
            'targetSHA256': lines_doc.get('targetSHA256'), 'strokes': strokes}

def ring_area(r):
    r = np.asarray(r, float); return .5 * float(np.dot(r[:, 0], np.roll(r[:, 1], 1)) - np.dot(r[:, 1], np.roll(r[:, 0], 1)))


def is_fill(stroke, width_mm=.5, area_mm2=1.5):
    """A FILL (a leaf mass, a dark pane, a blot), not a LINE: its ink (outer rings less holes) is wider than `width_mm` (twice
    area over perimeter, the width of a strip) and hardly longer than four widths, or covers over `area_mm2` and is over
    0.8 of that wide. Contours, bars, branches and hatching are lines. Same rule as src/paint/methods/ink-vectors.mjs."""
    rings = stroke['outline']; a = abs(sum(ring_area(r) for r in rings))
    per = sum(float(np.hypot(*np.diff(np.vstack([r, r[:1]]), axis=0).T).sum()) for r in map(np.asarray, rings))
    w = 2 * a / max(per, 1e-9); L = per / 2
    return (w > width_mm and L < 4 * w) or (a > area_mm2 and w > .8 * width_mm)


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
            # under paint a fill is one pale shape at `fill` of its darkness, soft over `band_mm` at its edge, no rim; a line
            # through it (its path three times as long as the fill is wide) stays full, 0.3 mm wide
            d = cv2.distanceTransform(m, cv2.DIST_L2, 5) / (band_mm * s * S)
            mf = mf * fill * np.minimum(1, d + .35)
            P = np.asarray(st['path']) * s * S - x0 * S
            rings = [np.asarray(r) for r in st['outline']]; a = abs(sum(ring_area(r) for r in rings)); per = sum(float(np.hypot(*np.diff(np.vstack([r, r[:1]]), axis=0).T).sum()) for r in rings)
            if len(P) > 1 and np.hypot(*np.diff(P, axis=0).T).sum() / (s * S) >= 3 * (2 * a / max(per, 1e-9)):
                core = np.zeros_like(m); cv2.polylines(core, [np.int32(np.round(P))], False, 255, max(1, int(round(.3 * s * S))))
                mf = np.where((core > 0) & (m > 0), m.astype(np.float32) / 255, mf)
        cov = cv2.resize(mf, (y0[0] - x0[0], y0[1] - x0[1]), interpolation=cv2.INTER_AREA) * st['dark']
        sub = out[x0[1]:y0[1], x0[0]:y0[0]]; np.maximum(sub, cov, out=sub)
    return out

def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('drawing'); ap.add_argument('lines'); ap.add_argument('--sheetmm', type=float, required=True)
    ap.add_argument('--out', required=True); ap.add_argument('--zoom', type=int, default=2); ap.add_argument('--orphanmm', type=float, default=.6)
    a = ap.parse_args()
    doc = build(a.drawing, json.load(open(a.lines)), a.sheetmm, a.zoom, orphan_mm=a.orphanmm)
    json.dump(doc, open(a.out, 'w'), separators=(',', ':'))
    n = sum(len(r) for s in doc['strokes'] for r in s['outline'])
    print(json.dumps({'strokes': len(doc['strokes']), 'outlinePoints': n, 'out': a.out}))

if __name__ == '__main__':
    main()
