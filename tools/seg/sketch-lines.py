#!/usr/bin/env python3
"""Plan continuous, hierarchical pen strokes BEFORE painting. No simulator or feedback.

python sketch-lines.py IMAGE --out STEM [--model MODEL.onnx] [--map MAP.png]
Optional --segments STEM consumes the painter's region labels (sky interiors stay empty).
Only numpy and OpenCV are required. A learned map is optional, never silently downloaded.
The output is the ordinary --drawingfile format, with physical width/pressure cues.
"""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np

from lines import arc_length, thin, model_line_map


def samples(points, step=1.0):
    out = []
    for a, b in zip(points[:-1], points[1:]):
        for t in np.linspace(0, 1, max(1, int(np.ceil(np.linalg.norm(b-a)/step))), endpoint=False):
            out.append(a + (b-a)*t)
    return np.array(out + [points[-1]], dtype=np.float32)


def at(field, points):
    h, w = field.shape
    p = np.rint(points).astype(int)
    return field[np.clip(p[:, 1], 0, h-1), np.clip(p[:, 0], 0, w-1)]


def trace(skel, min_points=4, window=5):
    """Continue through junctions along the incoming tangent; retain side branches.

    Diagonal shortcuts at right-angle corners are excluded. `window` is the tangent span in pixels. Unlike a degree-2
    branch walker, one pixel of tooth or a crossing does not end a long line.
    """
    h, w = skel.shape
    remaining = set(zip(*np.nonzero(skel)[::-1]))
    neighbours = {}
    for x, y in remaining:
        neighbours[x, y] = [(x+dx, y+dy) for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                            if (dx or dy) and (x+dx, y+dy) in remaining
                            and not (dx and dy and ((x+dx, y) in remaining or (x, y+dy) in remaining))]
    order = sorted(remaining, key=lambda p: (len(neighbours[p]) != 1, p[1], p[0]))
    paths = []
    used_edges = set()
    edge = lambda a, b: tuple(sorted((a, b)))
    for start in order:
        if all(edge(start, p) in used_edges for p in neighbours[start]):
            continue
        path = [start]
        for reverse in (False, True):
            if reverse:
                path.reverse()
            while True:
                cur = path[-1]
                options = [p for p in neighbours[cur] if edge(cur, p) not in used_edges]
                if not options:
                    break
                if len(path) > 1:
                    v = np.subtract(cur, path[max(0, len(path)-window)]).astype(float)
                    v /= max(1e-9, np.linalg.norm(v))
                    def turn(p):
                        d = np.subtract(p, cur)
                        return float(np.dot(v, d)/np.linalg.norm(d))
                    nxt = max(options, key=turn)
                    # A degree-two contour has only one continuation. A short
                    # ring can turn past the five-pixel tangent; breaking here
                    # splits it into open halves on the skimage skeleton.
                    if len(neighbours[cur]) != 2 and turn(nxt) < -0.1:
                        break
                else:
                    nxt = min(options, key=lambda p: (p[1], p[0]))
                used_edges.add(edge(cur, nxt))
                path.append(nxt)
        if len(path) >= min_points:
            # Close only a real ring, not the ends of adjacent parallel lines.
            if len(path) > 8 and path[0] in neighbours[path[-1]]:
                path.append(path[0])
            paths.append(np.array(path, np.float32))
    return paths


def join(paths, support, gap=9):
    """Tangent-aligned, source-supported bridges. Never connect parallel neighbours."""
    ends = []
    for i, p in enumerate(paths):
        for end, q in enumerate((p, p[::-1])):
            v = q[0]-q[min(5, len(q)-1)]
            v /= max(1e-9, np.linalg.norm(v))
            ends.append((i, end, q[0], v))
    pairs = []
    bins = {}
    for b, B in enumerate(ends):
        key = tuple(np.floor(B[2]/gap).astype(int))
        bins.setdefault(key, []).append(b)
    for a, A in enumerate(ends):
        tx, ty = np.floor(A[2]/gap).astype(int)
        nearby = [b for dx in (-1, 0, 1) for dy in (-1, 0, 1) for b in bins.get((tx+dx, ty+dy), []) if b > a]
        for b in nearby:
            B = ends[b]
            if A[0] == B[0]:
                continue
            v = B[2]-A[2]; d = np.linalg.norm(v)
            if not 0 < d <= gap:
                continue
            u = v/d
            if np.dot(A[3], -B[3]) < .86 or min(np.dot(A[3], u), np.dot(B[3], -u)) < .8:
                continue
            bridge = samples(np.array([A[2], B[2]]))
            if d > 3 and np.mean(at(support, bridge) > .08) < .6:
                continue
            pairs.append((float(d), a, b))
    links = {}; parents = list(range(len(paths)))
    def root(i):
        while parents[i] != i:
            i = parents[i]
        return i
    for _, a, b in sorted(pairs):
        ra, rb = root(ends[a][0]), root(ends[b][0])
        if a in links or b in links or ra == rb:
            continue
        links[a] = b; links[b] = a; parents[ra] = rb
    seen = set(); result = []
    for i, p in enumerate(paths):
        if i in seen or (2*i in links and 2*i+1 in links):
            continue
        entry = 2*i if 2*i not in links else 2*i+1
        parts = []
        while entry//2 not in seen:
            k = entry//2; seen.add(k)
            parts.append(paths[k] if entry % 2 == 0 else paths[k][::-1])
            other = entry ^ 1
            if other not in links:
                break
            entry = links[other]
        result.append(np.concatenate(parts))
    return result


def fit_path(p, tolerance=.85):
    """Preserve corners and curves; straighten only within a bounded measured error."""
    center = p.mean(axis=0)
    _, _, vv = np.linalg.svd(p-center, full_matrices=False)
    direction = vv[0]
    deviation = np.abs((p-center) @ np.array([-direction[1], direction[0]]))
    L = arc_length(p)
    straight = L > 12 and np.quantile(deviation, .95) < .9 and np.linalg.norm(p[-1]-p[0])/max(L, 1) > .92
    if straight:
        p = center + np.outer((p[[0, -1]]-center) @ direction, direction)
    else:
        p = cv2.approxPolyDP(p.reshape(-1, 1, 2), tolerance, False).reshape(-1, 2)
    return p, straight


def architectural_segments(grey, support):
    """Fit sustained straight evidence before tracing the remaining curves.

    The line-segment detector works on image gradients, so a mullion can be
    recovered across a dark opening. Paired sides of one thin pen mark merge;
    neighbouring mouldings more than two cells apart remain separate.
    """
    detected = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD).detect(np.uint8(grey*255))[0]
    if detected is None:
        return []
    candidates = []
    for s in detected.reshape(-1, 4):
        p = s.reshape(2, 2)
        L = arc_length(p)
        if L < 18 or np.mean(at(support, samples(p)) > .12) < .6:
            continue
        candidates.append(p)
    candidates.sort(key=lambda p: -arc_length(p))
    result = []
    bins = {}
    bin_count = 40
    for p in candidates:
        v = p[1]-p[0]; v /= np.linalg.norm(v)
        angle_bin = int((np.arctan2(v[1], v[0]) % np.pi)/np.pi*bin_count) % bin_count
        merged = False
        nearby = [i for delta in (-1, 0, 1) for i in bins.get((angle_bin+delta) % bin_count, [])]
        for i in nearby:
            q = result[i]
            u = q[1]-q[0]; Q = np.linalg.norm(u); u /= Q
            if abs(np.dot(u, v)) < .997:
                continue
            normal = np.array([-u[1], u[0]])
            if np.max(np.abs((p-q[0])@normal)) > 1.8:
                continue
            t = (p-q[0])@u
            if min(t) > Q+8 or max(t) < -8:
                continue
            a, b = min(0, min(t)), max(Q, max(t))
            offset = np.mean((p-q[0])@normal)/2
            result[i] = np.array([q[0]+a*u+offset*normal, q[0]+b*u+offset*normal])
            merged = True
            break
        if not merged:
            bins.setdefault(angle_bin, []).append(len(result))
            result.append(p)
    return result


def path_kind(p, straight, short_side):
    """A long tangle is texture, not a building silhouette.

    Smooth arches accumulate roughly pi radians across their whole length;
    foliage, chipped masonry and traced grain reverse direction repeatedly.
    Use simplified geometry so pixel staircases do not influence this choice.
    """
    d = np.diff(p, axis=0)
    lengths = np.linalg.norm(d, axis=1)
    length = float(lengths.sum())
    u = d / np.maximum(lengths[:, None], 1e-9)
    turns = np.arccos(np.clip(np.sum(u[1:]*u[:-1], axis=1), -1, 1))
    winding = float(turns.sum())
    complex_texture = not straight and winding > 2 and winding/max(length, 1) > .045
    if complex_texture:
        return 'ornament'
    if length >= short_side*.085 and (straight or winding < 4):
        return 'structure'
    return 'opening' if straight or length >= 22 else 'ornament'


def soften_ornament(p):
    """Round the few selected ornamental bends; keep endpoints registered."""
    if len(p) < 3:
        return p
    # Corner cutting stays inside the simplified path's convex hull. It cannot
    # grow invented spikes or change the structural straight-line geometry.
    q = [p[0]]
    for a, b in zip(p[:-1], p[1:]):
        q.extend([.75*a+.25*b, .25*a+.75*b])
    return np.array(q+[p[-1]], np.float32)


def plan(bgr, model_dark=None, sky=None):
    h, w = bgr.shape[:2]
    grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)/255
    smooth = cv2.bilateralFilter((grey*255).astype('uint8'), 7, 28, 4).astype(np.float32)/255
    # Narrow dark ridges retain the drawing's own pen; step edges contribute only
    # when supported by the learned structure or sustained straight geometry.
    ridge = np.maximum(0, cv2.GaussianBlur(grey, (0, 0), 2.2)-grey)
    ridge = np.clip((ridge-.025)/.19, 0, 1)
    edges = cv2.Canny((smooth*255).astype('uint8'), 45, 110).astype(np.float32)/255
    if model_dark is None:
        support = np.maximum(ridge, edges*.65)
    else:
        # A source's own narrow pen ridge is useful independent evidence, even
        # when the learned model misses a section of a faded arch.
        support = np.maximum(model_dark, ridge*.6)
    # Hysteresis keeps faint continuation of a confident contour. A single
    # threshold broke window frames and curved mouldings into isolated marks.
    weak = (support > .14).astype('uint8')
    count, components = cv2.connectedComponents(weak, connectivity=8)
    confident = np.bincount(components.ravel(), weights=(support > .32).ravel(), minlength=count) > 0
    confident[0] = False
    mask = confident[components].astype('uint8')
    if sky is not None:
        # A small boundary rim remains eligible: building silhouettes are not sky.
        interior = cv2.erode(sky.astype('uint8'), np.ones((7, 7), 'uint8'))
        mask[interior > 0] = 0
        support[interior > 0] = 0
    mask[:2] = 0; mask[-2:] = 0; mask[:, :2] = 0; mask[:, -2:] = 0
    skeleton, _ = thin(mask)
    straights = architectural_segments(smooth, cv2.dilate(support, np.ones((3, 3), 'uint8')))
    # Preserve coherent curves before allowing short LSD chords to own their
    # corridors. Otherwise a complete arch is cut into isolated straight bits.
    curve_corridor = np.zeros((h, w), 'uint8')
    for p in trace(skeleton):
        if arc_length(p) < min(w, h)*.08:
            continue
        q, straight = fit_path(p, tolerance=1.8)
        if not straight and path_kind(q, straight, min(w, h)) == 'structure':
            cv2.polylines(curve_corridor, [np.rint(q).astype('int32')], False, 1, 5)
    straights = [p for p in straights if np.mean(at(curve_corridor, samples(p))) < .55]
    # The fitted line owns its corridor, avoiding doubled outlines and little
    # staircase branches left behind by thinning a thick learned mark.
    for p in straights:
        cv2.polylines(skeleton, [np.rint(p).astype('int32')], False, 0, 3)
    raw = trace(skeleton)
    paths = join(straights + raw, cv2.dilate(support, np.ones((3, 3), 'uint8')))
    # Broad neighbourhood variance identifies featureless paper/sky and gives a
    # separate diagnostic from the model's edge confidence.
    mean = cv2.GaussianBlur(grey, (0, 0), 3)
    var = np.maximum(0, cv2.GaussianBlur(grey*grey, (0, 0), 3)-mean*mean)
    # Relative contrast preserves faded ink on toned paper. A fixed white-paper
    # threshold incorrectly discarded real columns in low-contrast drawings.
    contrast = max(.15, float(np.diff(np.percentile(grey, [2, 98]))[0]))
    flat_threshold = .00035*contrast**2
    candidates = []
    for p in paths:
        L = arc_length(p)
        if L < 7:
            continue
        q, straight = fit_path(p)
        if len(q) < 2:
            continue
        dense = samples(q)
        margin = .015*min(w, h)
        if np.mean((dense[:, 0] < margin) | (dense[:, 0] > w-margin) | (dense[:, 1] < margin) | (dense[:, 1] > h-margin)) > .75:
            continue
        strength = float(np.mean(at(support, dense)))
        flat = float(np.mean(at(var, dense) < flat_threshold))
        dark = float(np.mean(at(mean, dense) < .22))
        if flat > .65 or (dark > .7 and L < 18) or strength < .15:
            continue
        kind = path_kind(q, straight, min(w, h))
        if kind == 'ornament':
            # A few bends suggest the detail instead of copying every tooth.
            q = cv2.approxPolyDP(q.reshape(-1, 1, 2), 2.2, False).reshape(-1, 2)
            if len(q) < 2:
                continue
            if arc_length(q) < 12:
                continue
            q = soften_ornament(q)
        # Repeated short straight marks use the same pen family as their peers.
        weight = {'structure': .95, 'opening': .72, 'ornament': .46}[kind]
        candidates.append(dict(p=q, length=arc_length(q), strength=strength, weight=weight, kind=kind,
                               straight=bool(straight), flat=flat, dark=dark))
    candidates.sort(key=lambda g: (['structure', 'opening', 'ornament'].index(g['kind']), -g['length']*g['strength']))
    # Limit texture locally, not by a global darkest-first budget. A shadow must
    # not spend the entire building's ink allocation.
    occupied = np.zeros((h, w), 'uint8'); tiles = {}; kept = []
    for g in candidates:
        p = samples(g['p']); xy = np.rint(p).astype(int)
        overlap = float(np.mean(at(occupied, p) > 0))
        if overlap > .65:
            continue
        tile = (g['kind'], *tuple((g['p'].mean(axis=0)/64).astype(int)))
        budget = {'structure': float('inf'), 'opening': 4, 'ornament': 1}[g['kind']]
        if tiles.get(tile, 0) >= budget:
            continue
        tiles[tile] = tiles.get(tile, 0)+1
        cv2.polylines(occupied, [xy.reshape(-1, 1, 2)], False, 1, 2)
        kept.append(g)
    lines = []
    for g in kept:
        q = samples(g['p'], 2.5)
        distance = np.r_[0, np.cumsum(np.linalg.norm(np.diff(q, axis=0), axis=1))]
        L = distance[-1]
        taper = np.minimum(np.clip(distance/3, .55, 1), np.clip((L-distance)/4, .4, 1))
        # At the standard 152.4 mm postcard and a 720-cell execution grid these
        # requested optical widths yield roughly .34/.21/.12 mm contact after
        # drawing-file's calibrated optical-width to contact conversion.
        width = {'structure': 2.2, 'opening': 1.5, 'ornament': 1.0}[g['kind']]
        # Small, smooth variation without displacing the perspective geometry.
        variation = 1 + .08*np.sin(distance/11)
        lines.append({k: v for k, v in g.items() if k != 'p'} | {
            'points': np.round(q, 3).tolist(), 'widths': np.round(width*variation*taper, 3).tolist(),
            'weights': np.round(g['weight']*(.85+.15*taper), 3).tolist(), 'role': g['kind']})
    stats = {'rawPaths': len(raw), 'joinedPaths': len(paths), 'kept': len(lines),
             'meanLength': float(np.mean([g['length'] for g in lines])) if lines else 0,
             'flatShare': float(np.mean([g['flat'] for g in lines])) if lines else 0,
             'darkShare': float(np.mean([g['dark'] for g in lines])) if lines else 0,
             'roles': {role: sum(g['kind'] == role for g in lines) for role in ('structure', 'opening', 'ornament')}}
    return lines, support, stats


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('image'); ap.add_argument('--out', required=True)
    ap.add_argument('--width', type=int, default=1080)
    ap.add_argument('--model'); ap.add_argument('--map'); ap.add_argument('--segments')
    # The painter's planned wash (paint-plate.mjs --valuepreviewonly writes planned-wash.png): lines are made to
    # agree with what that wash leaves for the pen (residual_lines.py). Planning only.
    ap.add_argument('--wash')
    args = ap.parse_args()
    if args.width < 64:
        ap.error('--width must be at least 64')
    bgr = cv2.imread(args.image)
    if bgr is None:
        ap.error('cannot read image')
    H, W = bgr.shape[:2]; w = args.width; h = round(H*w/W)
    bgr = cv2.resize(bgr, (w, h), interpolation=cv2.INTER_AREA if w < W else cv2.INTER_CUBIC)
    dark = None; model = 'geometric/ridge fallback (no learned model)'
    if args.model:
        import onnxruntime as ort
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2; options.inter_op_num_threads = 1
        session = ort.InferenceSession(args.model, sess_options=options, providers=['CPUExecutionProvider'])
        dark = 1-model_line_map(session, bgr)
        model = 'Informative Drawings contour ONNX sha256:'+hashlib.sha256(Path(args.model).read_bytes()).hexdigest()
    if args.map:
        m = cv2.imread(args.map, cv2.IMREAD_GRAYSCALE)
        if m is None:
            ap.error('cannot read --map')
        dark = 1-cv2.resize(m, (w, h)).astype(np.float32)/255
        model = 'supplied dark-on-white line map sha256:'+hashlib.sha256(Path(args.map).read_bytes()).hexdigest()
    sky = None
    if args.segments:
        meta = json.loads(Path(args.segments+'.json').read_text())
        labels = cv2.imread(args.segments+'.png', cv2.IMREAD_GRAYSCALE)
        if labels is None:
            ap.error('cannot read segment labels')
        labels = cv2.resize(labels, (w, h), interpolation=cv2.INTER_NEAREST)
        skyids = [int(k) for k, v in meta.get('legend', {}).items() if 'sky' in str(v).lower()]
        sky = np.isin(labels, skyids)
    lines, support, stats = plan(bgr, dark, sky)
    if args.wash:
        import sys
        from residual_lines import refine
        wash = cv2.imread(args.wash)
        if wash is None:
            ap.error('cannot read --wash')
        lines, stats['residual'] = refine(lines, bgr, wash, sys.modules[__name__])
        stats['residual']['wash'] = hashlib.sha256(Path(args.wash).read_bytes()).hexdigest()
        stats['kept'] = len(lines)
        stats['roles'] = {role: sum(g['role'] == role for g in lines) for role in ('structure', 'opening', 'ornament')}
    stem = Path(args.out); stem.parent.mkdir(parents=True, exist_ok=True)
    doc = {'source': 'sketch-lines planning only', 'model': model, 'image': {'w': w, 'h': h},
           'targetSHA256': hashlib.sha256(Path(args.image).read_bytes()).hexdigest(),
           'stats': stats, 'lines': lines}
    Path(str(stem)+'-lines.json').write_text(json.dumps(doc)+'\n')
    cv2.imwrite(str(stem)+'-map.png', np.uint8(np.clip(1-support, 0, 1)*255))
    preview = np.full((h, w, 3), 255, np.uint8)
    for g in lines:
        cv2.polylines(preview, [np.rint(g['points']).astype('int32')], False, (40, 40, 40), 1, cv2.LINE_AA)
    cv2.imwrite(str(stem)+'-geometry.png', preview)
    # which skeleton thinning ran (lines.py thin: cv2.ximgproc, skimage or zhang-suen); traced paths depend on it
    print(json.dumps({**stats, 'thinning': thin(np.zeros((3, 3), np.uint8))[1]}))


if __name__ == '__main__':
    main()
