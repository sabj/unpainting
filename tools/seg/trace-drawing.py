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


def plan(bgr, zoom=4, ink=.2, fit=.6, min_px=3.0):
    grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)/255
    grey /= max(.1, float(np.percentile(grey, 98)))
    big = cv2.resize(grey, None, fx=zoom, fy=zoom, interpolation=cv2.INTER_CUBIC)
    # a line is ink down to half of its own darkness: a pale line keeps its width, and two lines a pixel or two apart
    # stay two lines, since the paper between them is under half of either
    dark = 1-np.clip(big, 0, 1); r = int(round(1.5*zoom))
    peak = cv2.dilate(dark, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*r+1, 2*r+1)))
    mask = ((dark > ink) & (dark > .55*peak)).astype('uint8')
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
        q = fair((resample(p.astype(float), 1)+.5)/zoom-.5, fit, 1/zoom)
        lines.append({'points': np.round(q, 3).tolist(), 'width': round(width, 3), 'weight': 1, 'role': 'pen stroke', 'length': arc_length(q)})
    lines.sort(key=lambda l: -l['length'])
    return lines, mask, skeleton, {'inkPixels': int(mask.sum()), 'tracedPaths': len(paths), 'selectedPaths': len(lines), 'joins': joins, 'zoom': zoom, 'fit': fit}


def paper_dark(bgr, blur=.7):
    """A pencil drawing's darkness against its own local paper, 0 (paper) to 1 (black), with the grain blurred out."""
    grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)/255
    h, w = grey.shape; r = max(5, int(round(.012*max(h, w))))
    # the paper: the light envelope over about a centimetre of a drawing (a closing removes every line under that width)
    paper = cv2.dilate(grey, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*r+1, 2*r+1)))
    paper = cv2.GaussianBlur(paper, (0, 0), r)
    dark = 1-np.clip(grey/np.maximum(.05, paper), 0, 1)
    return cv2.GaussianBlur(dark, (0, 0), blur) if blur > 0 else dark


def pencil_plan(bgr, zoom=4, smooth_px=1.2, min_px=4.0):
    dark0 = paper_dark(bgr)
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
    weigh(lines, dark0, firm)
    lines.sort(key=lambda l: -l['length'])
    return lines, mask, skeleton, {'inkPixels': int(mask.sum()), 'tracedPaths': len(paths), 'selectedPaths': len(lines), 'joins': joins, 'zoom': zoom,
                                   'medium': 'pencil', 'paperNoise': round(noise, 4), 'low': round(low, 4), 'high': round(high, 4), 'firm': round(firm, 4)}


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
    doc = json.load(open(file)); bgr = cv2.imread(image); dark = paper_dark(bgr)
    sx, sy = bgr.shape[1]/doc['image']['w'], bgr.shape[0]/doc['image']['h']
    firm = doc.get('stats', {}).get('firm') or float(np.percentile(dark[dark > .05], 95))
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
    ap.add_argument('--fit', type=float, default=.6, help='how far a straight run or arc may lie from the traced line, source pixels')
    ap.add_argument('--medium', choices=['ink', 'pencil'], default='ink', help='pencil: grey lines of every weight, kept with their wobble and darkness')
    ap.add_argument('--reweigh', help='put the drawing\'s darkness on this line file\'s points (pencil) and write it to --out')
    args = ap.parse_args()
    if args.reweigh:
        return reweigh(args.reweigh, args.image, args.out)
    bgr = cv2.imread(args.image)
    if bgr is None:
        ap.error('cannot read '+args.image)
    h, w = bgr.shape[:2]
    lines, mask, skeleton, stats = pencil_plan(bgr, args.zoom) if args.medium == 'pencil' else plan(bgr, args.zoom, fit=args.fit)
    if args.sheetmm:
        for l in lines:
            l['widthMm'] = round(l['width']*args.sheetmm/w, 3)
    stem = Path(args.out); stem.parent.mkdir(parents=True, exist_ok=True)
    doc = {'source': f'trace-drawing: a clean {"pencil" if args.medium == "pencil" else "line"} drawing, pre-paint only', 'inputKind': 'drawing', 'widthPolicy': 'one observed width per line',
           'image': {'w': w, 'h': h}, 'targetSHA256': hashlib.sha256(Path(args.target or args.image).read_bytes()).hexdigest(), 'stats': stats, 'lines': lines}
    Path(str(stem)+'-lines.json').write_text(json.dumps(doc)+'\n')
    cv2.imwrite(str(stem)+'-ink.png', (1-mask)*255)
    cv2.imwrite(str(stem)+'-skeleton.png', (1-skeleton)*255)
    print(json.dumps(stats))


if __name__ == '__main__':
    main()
