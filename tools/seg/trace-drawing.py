#!/usr/bin/env python3
# Pipeline: inking, stage 1 (line source: a clean line drawing made for the purpose, black lines on white).
"""Trace a clean line drawing into pen strokes: one stroke per drawn line, straight runs straight, arcs clean.

The drawing is enlarged before thinning, so two lines a pixel apart stay two lines and a centre line does not step from
pixel to pixel. Each traced line is carried through its junctions (sketch-lines.py), cut at its corners, and each piece
is replaced by a straight run or a circular arc where one fits within --fit source pixels, else by a smoothed curve.
Emits the ordinary drawingfile JSON (points and one width per line, in source pixels; widthMm with --sheetmm).
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


def dense_strokes(grey, region, spacing, width, min_px=3.0, max_len=None, turn_deg=25):
    """Strokes along the drawing's own direction inside a dense region: streamlines of the structure tensor's line
    direction, seeded on dark cells and kept `spacing` source pixels apart, each a single pull that stops where the ink
    ends, where it leaves the region, or where it would turn by more than `turn_deg` (a junction is a break, not a turn)."""
    dark = 1-np.clip(grey, 0, 1); H, W = grey.shape
    gx = cv2.Sobel(grey, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(grey, cv2.CV_32F, 0, 1, ksize=3)
    sg = max(1., spacing)
    jxx = cv2.GaussianBlur(gx*gx, (0, 0), sg); jyy = cv2.GaussianBlur(gy*gy, (0, 0), sg); jxy = cv2.GaussianBlur(gx*gy, (0, 0), sg)
    theta = .5*np.arctan2(2*jxy, jxx-jyy)+np.pi/2          # along the lines, across the gradient
    tx, ty = np.cos(theta), np.sin(theta)
    max_len = max_len or 40*spacing
    occ = np.zeros((H, W), bool); r = max(1, int(round(spacing/2)))
    def free(x, y):
        i, j = int(round(x)), int(round(y))
        return 0 <= i < W and 0 <= j < H and region[j, i] and not occ[max(0, j-r+1):j+r, max(0, i-r+1):i+r].any()
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
                if not (0 <= nx < W-1 and 0 <= ny < H-1) or dark[int(round(ny)), int(round(nx))] < .3 or not free(nx, ny): break
                pts.append((nx, ny)); x, y, d0 = nx, ny, d; L += .75
            halves.append(pts)
        p = np.array(halves[1][::-1]+[(x0, y0)]+halves[0])
        if len(p) < 2 or arc_length(p) < min_px: continue
        for (x, y) in p: occ[int(round(y)), int(round(x))] = True
        q = resample(p, 1)
        wt = float(np.clip(np.median(dark[np.clip(q[:, 1].round().astype(int), 0, H-1), np.clip(q[:, 0].round().astype(int), 0, W-1)])/.85, .25, 1))
        out.append({'points': np.round(q[::max(1, len(q)//12)] if len(q) > 24 else q, 3).tolist(), 'width': round(width, 3), 'weight': round(wt, 3), 'role': 'pen stroke', 'length': arc_length(q), 'dense': True})
    return out


def plan(bgr, zoom=4, ink=.2, fit=.6, min_px=3.0, dense_px=0):
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
    dense = None
    if dense_px > 0:
        k = int(round(dense_px*zoom)) | 1
        dense = cv2.blur(mask.astype(np.float32), (k, k)) > .45
        dense = cv2.morphologyEx(dense.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))) > 0
        mask = mask & ~dense
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
        width = max(.6, float(np.median(2*sketch.at(distance, p)))/zoom)
        # how dark the drawing draws it: the line's core against the paper, 0.85 of full black and over is full weight
        weight = float(np.clip(np.median(sketch.at(dark, p))/.85, .25, 1))
        q = fair((resample(p.astype(float), 1)+.5)/zoom-.5, fit, 1/zoom)
        lines.append({'points': np.round(q, 3).tolist(), 'width': round(width, 3), 'weight': round(weight, 3), 'role': 'pen stroke', 'length': arc_length(q)})
    lines.sort(key=lambda l: -l['length'])
    if dense is not None and dense.any():
        small = cv2.resize(dense.astype(np.uint8), (grey.shape[1], grey.shape[0]), interpolation=cv2.INTER_AREA) > 0
        wid = float(np.median([l['width'] for l in lines])) if lines else 1.0
        streams = dense_strokes(grey, small, spacing=dense_px/2.5, width=wid, min_px=min_px)
        lines += streams; lines.sort(key=lambda l: -l['length'])
    return lines, mask, skeleton, {'denseShare': round(float(dense.mean()), 4) if dense is not None else 0, 'denseStrokes': len(streams) if dense is not None and dense.any() else 0,'inkPixels': int(mask.sum()), 'tracedPaths': len(paths), 'selectedPaths': len(lines), 'joins': joins, 'zoom': zoom, 'fit': fit}


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
            gone.add(i)
    for l in lines: l.pop('width0', None)
    return [l for k, l in enumerate(lines) if k not in gone], len(gone)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('image'); ap.add_argument('--out', required=True)
    ap.add_argument('--target', help='the picture the drawing is registered to (same size): the line file is bound to it')
    ap.add_argument('--sheetmm', type=float, help='sheet width in mm: adds widthMm to each line')
    ap.add_argument('--zoom', type=int, default=4, help='enlargement before thinning')
    ap.add_argument('--mergemm', type=float, default=.45, help='close parallel strokes within this (mm, with --sheetmm) are one stroke; 0 keeps them')
    ap.add_argument('--maxwidthmm', type=float, default=1.2, help='wider marks under four widths long are filled darks, left to the paint (mm, with --sheetmm); 0 keeps them')
    ap.add_argument('--densemm', type=float, default=1.5, help='ink covering most of a window this wide (mm) is dense (fur, hair, scribble): laid as strokes along its direction, not thinned; 0 thins everything')
    ap.add_argument('--medium', default='ink', choices=['ink', 'pencil'], help='the medium the drawing is made in: the painter lays it in this (medium-decision.mjs)')
    ap.add_argument('--fit', type=float, default=.6, help='how far a straight run or arc may lie from the traced line, source pixels')
    args = ap.parse_args()
    bgr = cv2.imread(args.image)
    if bgr is None:
        ap.error('cannot read '+args.image)
    h, w = bgr.shape[:2]
    lines, mask, skeleton, stats = plan(bgr, args.zoom, fit=args.fit, dense_px=args.densemm*w/args.sheetmm if args.sheetmm and args.densemm > 0 else 0)
    if args.sheetmm:
        px = w/args.sheetmm   # source pixels a millimetre
        if args.mergemm > 0:
            # strokes laid along dense ink are already one per strand, spaced as drawn
            dense = [l for l in lines if l.get('dense')]
            lines, stats['foldedParallels'] = merge_parallels([l for l in lines if not l.get('dense')], args.mergemm*px)
            lines += dense
        if args.maxwidthmm > 0:
            # a filled dark (a fat mark hardly longer than it is wide) is left to the paint
            n = len(lines); lines = [l for l in lines if l['width'] <= args.maxwidthmm*px or l['length'] >= 4*l['width']]; stats['filledDarksLeft'] = n-len(lines)
        stats['selectedPaths'] = len(lines)
    if args.sheetmm:
        for l in lines:
            l['widthMm'] = round(l['width']*args.sheetmm/w, 3)
    stem = Path(args.out); stem.parent.mkdir(parents=True, exist_ok=True)
    doc = {'source': 'trace-drawing: a clean line drawing, pre-paint only', 'inputKind': 'drawing', 'medium': args.medium, 'widthPolicy': 'one observed width per line',
           'image': {'w': w, 'h': h}, 'targetSHA256': hashlib.sha256(Path(args.target or args.image).read_bytes()).hexdigest(), 'stats': stats, 'lines': lines}
    Path(str(stem)+'-lines.json').write_text(json.dumps(doc)+'\n')
    cv2.imwrite(str(stem)+'-ink.png', (1-mask)*255)
    cv2.imwrite(str(stem)+'-skeleton.png', (1-skeleton)*255)
    print(json.dumps(stats))


if __name__ == '__main__':
    main()
