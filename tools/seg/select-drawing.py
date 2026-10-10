#!/usr/bin/env python3
"""First pen drawing on a painting: its own object outlines, plus the photograph's lines inside the figure.

Outlines come from segments.py run on the painting, since the painter moved forms away from the photograph.
Interior lines come from Informative Drawings on the photograph, carried over by the similarity file. There
are no ground lines.

  .venv/bin/python tools/seg/select-drawing.py

reads work/segments/beach-watercolor.png and .json, work/segments/beach-photo.png and .json,
work/lines/beach-photo-lines.json and work/lines/beach-photo-to-beach.json, and writes

  work/lines/beach-watercolor-drawing-lines.json          the selection on the painting, 1086x1448
  work/lines/beach-{dog,head,figure}-drawing-lines.json   the same cut to the three crops
  work/lines/beach-drawing-check.jpg                      the check sheet

Each line is {"points","length","strength","role","object"}: role is silhouette or interior; object is figure, dog
or ball. Silhouettes carry strength 1.0, photo lines their own.

Silhouettes: each object's outer contour, averaged and simplified under a pixel. The figure's line opens where
the hand meets the ball; thin spurs off the dog are cut; nothing runs along the sheet border.

Interior lines: photo lines mostly inside the figure are joined, kept by the containment and length rules
below, and dropped if any point leaves the painting's figure segment.

The photograph's objects are segments.py's split into components, refined by SAM point prompts, with the ball
found by colour. They are checked against the painting's segments after the warp ("check" in the output).

Needs opencv-python, numpy, torch and segment-anything with the vit_b checkpoint, as segments.py does.
"""
import argparse
import importlib.util
import json
import math
import os

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))

# Painting pixels throughout. The sheet border no line is drawn along.
BORDER = 6
# Silhouettes: the contour is averaged over this many points and simplified by Douglas-Peucker at this tolerance,
# under a pixel, so a silhouette keeps the edge's wobble. A spur thinner than twice SPUR_RADIUS + 1 is cut off the
# dog before its outline is taken.
CONTOUR_SMOOTH = 5
SILHOUETTE_EPS = 0.75
SPUR_RADIUS = 4
# Where the hand closes on the ball, the ball's own outline is the line, so the figure's stops this close to it.
GRIP = 3.0
MIN_STROKE = 15.0
# Interior lines: joining, containment and the keep rules.
JOIN_DIST = 6.0
JOIN_ANGLE = 35.0
ERODE = 3
INSIDE_SHARE = 0.70
POOL_SHARE = 0.50
DUPLICATE_DIST = 3.0
DUPLICATE_SHARE = 0.60
# Floor for a figure line outside the head, as a share of the figure's height. 2% keeps the 20 to 40 px pieces
# the line model breaks clothing details into; --figure-min 0.04 is stricter.
FIGURE_MIN, HEAD_ZONE, HEAD_MIN, FIGURE_MAX = 0.02, 0.20, 0.015, 40
# The crops the plates are painted at, (x, y, w, h) on the painting.
CROPS = {'beach-dog': (260, 680, 320, 320), 'beach-head': (380, 60, 320, 320), 'beach-figure': (300, 60, 420, 620)}
CROP_MIN = 6.0
# The check sheet.
CHECK_HEIGHT = 700
# The fourth panel: the dog and the sea, (x, y, w, h) on the painting, drawn at twice the other panels' scale.
ZOOM_BOX = (0, 560, 640, 724)
INK, RED = (38, 32, 28), (30, 30, 220)
# The ball, as segments.green_ball looks for it but at the photograph's own resolution: hue, saturation, value in
# OpenCV's 0..180 / 0..255 scales, and its size as a share of the photograph.
BALL_HUE, BALL_SAT, BALL_VAL = (25, 55), 60, 60
BALL_AREA = (0.0001, 0.004)
SAM_CHECKPOINT = 'work/models/sam_vit_b_01ec64.pth'
SAM_OUTSIDE = 0.01
BALL_COVER, BALL_GROWTH = 0.95, 2.0


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, filename))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


LINES_MAP = load_module('lines_map', 'lines-map.py')


def load_json(path):
    return LINES_MAP.load_json(path)


def read_image(path, flags=cv2.IMREAD_COLOR):
    img = cv2.imread(path, flags)
    if img is None:
        raise SystemExit(f'select-drawing: cannot read {path}')
    return img



def arc_length(points):
    return LINES_MAP.arc_length(points)


def resample(points, step=1.0):
    """A polyline at even spacing, so a share of points is a share of length."""
    p = np.asarray(points, np.float64)
    if len(p) < 2:
        return p
    seg = np.hypot(*(p[1:] - p[:-1]).T)
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    if cum[-1] <= 0:
        return p[:1]
    t = np.linspace(0.0, cum[-1], max(2, int(math.ceil(cum[-1] / step)) + 1))
    return np.stack([np.interp(t, cum, p[:, 0]), np.interp(t, cum, p[:, 1])], axis=1)


def rdp(points, eps, closed=False):
    p = np.asarray(points, np.float32).reshape(-1, 1, 2)
    out = cv2.approxPolyDP(p, eps, closed).reshape(-1, 2).astype(np.float64)
    if closed:
        out = np.vstack([out, out[:1]])
    return out


def smooth_closed(points, window):
    p = np.asarray(points, np.float64)
    if len(p) < window + 2:
        return p
    k = np.ones(window) / window
    pad = window // 2
    ext = np.vstack([p[-pad:], p, p[:pad]])
    return np.stack([np.convolve(ext[:, 0], k, 'valid'), np.convolve(ext[:, 1], k, 'valid')], axis=1)[:len(p)]


def sample_mask(mask, points):
    p = np.round(np.asarray(points)).astype(int)
    h, w = mask.shape
    ok = (p[:, 0] >= 0) & (p[:, 0] < w) & (p[:, 1] >= 0) & (p[:, 1] < h)
    out = np.zeros(len(p), bool)
    out[ok] = mask[p[ok, 1], p[ok, 0]] > 0
    return out


def nearest(points, cloud, chunk=512):
    """Index of and distance to the nearest cloud point for every point. Brute force in chunks; the clouds here are
    a few tens of thousands of points, and nothing else on this machine has a k-d tree."""
    points, cloud = np.asarray(points, np.float64), np.asarray(cloud, np.float64)
    idx = np.zeros(len(points), int)
    dist = np.full(len(points), np.inf)
    if not len(cloud):
        return idx, dist
    for s in range(0, len(points), chunk):
        d = ((points[s:s + chunk, None, :] - cloud[None, :, :]) ** 2).sum(-1)
        j = d.argmin(1)
        idx[s:s + chunk] = j
        dist[s:s + chunk] = np.sqrt(d[np.arange(len(j)), j])
    return idx, dist


def near_border(points, size, margin):
    w, h = size
    p = np.asarray(points)
    return (p[:, 0] < margin) | (p[:, 1] < margin) | (p[:, 0] > w - 1 - margin) | (p[:, 1] > h - 1 - margin)


def runs_of(flags):
    """(start, end) index pairs of the runs of True in a boolean array, end exclusive."""
    out, start = [], None
    for i, f in enumerate(flags):
        if f and start is None:
            start = i
        elif not f and start is not None:
            out.append((start, i))
            start = None
    if start is not None:
        out.append((start, len(flags)))
    return out


def line(points, role, obj, strength=1.0):
    pts = np.asarray(points, np.float64)
    return {'points': [[round(float(x), 2), round(float(y), 2)] for x, y in pts], 'length': round(arc_length(pts), 2),
            'strength': round(float(strength), 4), 'role': role, 'object': obj}



def components(mask):
    n, cc, st, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    order = sorted(range(1, n), key=lambda i: -st[i, cv2.CC_STAT_AREA])
    return [cc == i for i in order]


def ball_patch(bgr, figure):
    """The saturated yellow-green patch within the figure's reach: segments.green_ball's test at full resolution."""
    H, W = figure.shape
    hsv = cv2.cvtColor(cv2.GaussianBlur(bgr, (0, 0), 1.2), cv2.COLOR_BGR2HSV)
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    m = (hue >= BALL_HUE[0]) & (hue <= BALL_HUE[1]) & (sat > BALL_SAT) & (val > BALL_VAL)
    reach = cv2.dilate(figure.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))) > 0
    m = cv2.morphologyEx((m & reach).astype(np.uint8), cv2.MORPH_CLOSE,
                         cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    best, best_area = None, 0
    for comp in components(m):
        area = comp.sum() / float(H * W)
        ys, xs = np.nonzero(comp)
        bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
        if not BALL_AREA[0] <= area <= BALL_AREA[1] or max(bw, bh) > 2 * min(bw, bh):
            continue
        if comp.sum() > best_area:
            best, best_area = comp, comp.sum()
    if best is None:
        return None
    hull = cv2.convexHull(np.stack(np.nonzero(best)[::-1], 1).astype(np.int32))
    out = np.zeros(best.shape, np.uint8)
    cv2.fillConvexPoly(out, hull, 1)
    return out > 0


def medial_points(mask, count):
    """Points down the middle of a mask: the distance transform's maximum on `count` rows spread over its height."""
    dt = cv2.distanceTransform(mask.astype(np.uint8), cv2.DIST_L2, 5)
    ys = np.nonzero(mask.any(1))[0]
    out = []
    for f in np.linspace(0.08, 0.88, count) if count > 1 else [0.5]:
        r = int(ys.min() + f * (ys.max() - ys.min()))
        if dt[r].max() > 0:
            out.append([int(dt[r].argmax()), r])
    return out


def interior_point(mask):
    dt = cv2.distanceTransform(mask.astype(np.uint8), cv2.DIST_L2, 5)
    y, x = np.unravel_index(int(dt.argmax()), dt.shape)
    return [int(x), int(y)]


class Sam:
    """SAM's point-and-box predictor over the photograph, loaded once."""

    def __init__(self, bgr, checkpoint):
        import torch
        from segment_anything import SamPredictor, sam_model_registry
        device = 'mps' if torch.backends.mps.is_available() else ('cuda' if torch.cuda.is_available() else 'cpu')
        self.note = f'SAM vit_b predictor on {device}'
        self.predictor = SamPredictor(sam_model_registry['vit_b'](checkpoint=checkpoint).to(device))
        self.predictor.set_image(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))

    def proposals(self, envelope, positive, negative, pad=4):
        ys, xs = np.nonzero(envelope)
        box = np.array([xs.min() - pad, ys.min() - pad, xs.max() + pad, ys.max() + pad], np.float32)
        pts = np.array(positive + negative, np.float32)
        labels = np.array([1] * len(positive) + [0] * len(negative))
        masks, scores, _ = self.predictor.predict(point_coords=pts, point_labels=labels, box=box,
                                                  multimask_output=True)
        return masks, scores

    def refine(self, envelope, positive, negative):
        """SAM's proposal closest to the envelope among those that stay inside it (SAM may only take away)."""
        masks, scores = self.proposals(envelope, positive, negative)
        grown = cv2.dilate(envelope.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
        best, best_iou, report = None, 0.0, []
        for m, s in zip(masks, scores):
            outside = (m & ~grown).sum() / max(1.0, m.sum())
            iou = (m & envelope).sum() / max(1.0, (m | envelope).sum())
            report.append({'score': round(float(s), 3), 'iou': round(float(iou), 3),
                           'outside': round(float(outside), 4)})
            if outside < SAM_OUTSIDE and iou > best_iou:
                best, best_iou = m, iou
        return best, report

    def grow(self, patch, positive, negative):
        """For a colour patch that under-covers its object (the ball's shadowed half is not yellow-green): SAM's
        best-scoring proposal that holds the patch and is no more than BALL_GROWTH times its area."""
        masks, scores = self.proposals(patch, positive, negative)
        best, best_score, report = None, 0.0, []
        for m, s in zip(masks, scores):
            cover = (m & patch).sum() / max(1.0, patch.sum())
            growth = m.sum() / max(1.0, patch.sum())
            report.append({'score': round(float(s), 3), 'cover': round(float(cover), 3),
                           'growth': round(float(growth), 2)})
            if cover >= BALL_COVER and growth <= BALL_GROWTH and s > best_score:
                best, best_score = m, s
        return best, report


def photo_objects(bgr, labels, legend, notes):
    """Figure, dog and ball masks in the photograph, each exclusive of the others."""
    ids = {name: int(k) for k, name in legend.items()}
    fg = np.isin(labels, [ids[n] for n in ('figure', 'dog', 'ball') if n in ids])
    comps = [c for c in components(fg) if c.sum() > 0.002 * fg.size]
    if len(comps) < 2:
        raise SystemExit('select-drawing: the photograph\'s segments hold fewer than two foreground objects')
    fig_env, dog_env = comps[0], comps[1]
    named = [legend[str(int(v))] for v in np.unique(labels[dog_env])]
    notes.append(f'figure = largest foreground component ({fig_env.sum()} px); dog = next largest '
                 f'({dog_env.sum()} px, labelled {"/".join(named)} by segments.py)')
    ball_env = ball_patch(bgr, fig_env)
    notes.append('ball patch ' + ('found' if ball_env is not None else 'not found')
                 + ' by colour in the figure\'s reach')

    sam = Sam(bgr, SAM_CHECKPOINT) if os.path.exists(SAM_CHECKPOINT) else None
    if sam is None:
        notes.append('SAM off: no checkpoint; objects are the u2net components as they are')
        figure, dog, ball = fig_env, dog_env, ball_env
    else:
        notes.append(sam.note)
        dog_pt, fig_pt = interior_point(dog_env), interior_point(fig_env)
        neg_fig = [dog_pt] + ([interior_point(ball_env)] if ball_env is not None else [])
        figure, rep = sam.refine(fig_env, medial_points(fig_env, 5), neg_fig)
        notes.append(f'figure: SAM proposals {rep}; kept {"one" if figure is not None else "none, u2net used"}')
        figure = fig_env if figure is None else figure
        dog, rep = sam.refine(dog_env, medial_points(dog_env, 3), [fig_pt])
        notes.append(f'dog: SAM proposals {rep}; kept {"one" if dog is not None else "none, u2net used"}')
        dog = dog_env if dog is None else dog
        ball = ball_env
        if ball_env is not None:
            cand, rep = sam.grow(ball_env, [interior_point(ball_env)], [fig_pt])
            notes.append(f'ball: SAM proposals {rep}; kept {"one" if cand is not None else "none, colour patch used"}')
            ball = ball_env if cand is None else cand
    out = {'figure': figure, 'dog': dog & ~figure}
    if ball is not None:
        out['ball'] = ball
        out['figure'] = out['figure'] & ~ball
        out['dog'] = out['dog'] & ~ball
    return out



def warp(mask, M, size):
    return cv2.warpAffine(mask.astype(np.uint8), M, size, flags=cv2.INTER_NEAREST, borderValue=0) > 0


def outline_distance(a, b):
    """Median and 90th-percentile distance from a's outline to b's, in pixels."""
    def edge(m):
        cs, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        return np.vstack([c.reshape(-1, 2) for c in cs]) if cs else np.zeros((0, 2))
    ea = edge(a)
    dt = cv2.distanceTransform((~edge_mask(b)).astype(np.uint8), cv2.DIST_L2, 5)
    d = dt[ea[:, 1], ea[:, 0]] if len(ea) else np.array([np.inf])
    return float(np.median(d)), float(np.percentile(d, 90))


def edge_mask(m):
    m8 = m.astype(np.uint8)
    return (m8 - cv2.erode(m8, np.ones((3, 3), np.uint8))) > 0


def similarity_check(objects, paint_labels, paint_legend):
    """The warped photograph objects against the painting's own segments (segments.py run on the painting)."""
    ids = {name: int(k) for k, name in paint_legend.items()}
    out = {}
    for name, m in objects.items():
        if name not in ids:
            continue
        ref = paint_labels == ids[name]
        if name == 'figure' and 'ball' in ids:
            ref = ref & ~(paint_labels == ids['ball'])
        iou = (m & ref).sum() / max(1.0, (m | ref).sum())
        med, p90 = outline_distance(m, ref)
        cm = np.array(np.nonzero(m)[::-1]).mean(1)
        cr = np.array(np.nonzero(ref)[::-1]).mean(1)
        out[name] = {'iou': round(float(iou), 3), 'outlineMedianPx': round(med, 1), 'outlineP90Px': round(p90, 1),
                     'centroidOffsetPx': [round(float(v), 1) for v in (cm - cr)]}
    return out



def painted_objects(labels, legend, notes):
    """Figure, dog and ball as the painting's own segments hold them, each its largest component."""
    ids = {name: int(k) for k, name in legend.items()}
    out = {}
    for name in ('figure', 'dog', 'ball'):
        comps = components(labels == ids[name]) if name in ids else []
        if not comps:
            notes.append(f'painting: no {name} segment')
            continue
        out[name] = comps[0]
    if 'figure' not in out:
        raise SystemExit('select-drawing: the painting\'s segments have no figure')
    if 'dog' in out:
        out['dog'], removed = without_spurs(out['dog'])
        notes.append(f'painting dog: {removed} px cut off as spurs thinner than {2 * SPUR_RADIUS + 1} px')
    return out


def without_spurs(mask, radius=SPUR_RADIUS):
    """The mask with any limb thinner than 2 * radius + 1 px cut off. An opening finds the body; the original edge is
    kept wherever it lies within the radius of that body, so fur and ears survive and a thin spur does not."""
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * radius + 1,) * 2)
    body = components(cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, k) > 0)
    if not body:
        return mask, 0
    kept = components(mask & (cv2.dilate(body[0].astype(np.uint8), k) > 0))[0]
    return kept, int(mask.sum() - kept.sum())


def outer_loop(mask):
    cs, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea).reshape(-1, 2).astype(np.float64)
    return smooth_closed(c, CONTOUR_SMOOTH)


def continuous_strokes(loop, drawable):
    """The loop as one closed line, or, where stretches are excluded, the runs between them. Returns (strokes,
    closed)."""
    if drawable.all():
        return [loop], True
    start = int(np.argmax(~drawable))
    loop, drawable = np.roll(loop, -start, 0), np.roll(drawable, -start)
    return [loop[s:e] for s, e in runs_of(drawable) if arc_length(loop[s:e]) >= MIN_STROKE], False


def longest_segment(points):
    p = np.asarray(points, np.float64)
    return float(np.hypot(*(p[1:] - p[:-1]).T).max()) if len(p) > 1 else 0.0


def silhouettes(objects, size, notes):
    out = []
    ball = objects.get('ball')
    grip = None if ball is None else cv2.distanceTransform((~ball).astype(np.uint8), cv2.DIST_L2, 5)
    for name in ('figure', 'dog', 'ball'):
        if name not in objects:
            continue
        loop = outer_loop(objects[name])
        drawable = ~near_border(loop, size, BORDER)
        if name != 'ball' and grip is not None:
            p = np.clip(np.round(loop).astype(int), 0, [size[0] - 1, size[1] - 1])
            drawable &= grip[p[:, 1], p[:, 0]] > GRIP
        strokes, closed = continuous_strokes(loop, drawable)
        drawn = [line(rdp(s, SILHOUETTE_EPS, closed), 'silhouette', name) for s in strokes]
        out += drawn
        longest = max(longest_segment(g['points']) for g in drawn)
        notes.append(f'{name} silhouette: {len(drawn)} {"closed" if closed else "open"} line(s), '
                     f'{sum(g["length"] for g in drawn):.0f} px, {sum(len(g["points"]) for g in drawn)} points, '
                     f'longest straight segment {longest:.1f} px')
    return out



def end_direction(p, at_start, reach=6.0):
    """The unit vector pointing out of the line at one end, from the point `reach` px back."""
    q = p if not at_start else p[::-1]
    end = q[-1]
    back = q[-1]
    acc = 0.0
    for i in range(len(q) - 2, -1, -1):
        acc += float(np.hypot(*(q[i + 1] - q[i])))
        back = q[i]
        if acc >= reach:
            break
    d = end - back
    n = float(np.hypot(*d))
    return d / n if n > 0 else np.zeros(2)


def join_fragments(lines):
    """Ends within JOIN_DIST whose directions agree within JOIN_ANGLE become one line, closest pair first."""
    items = [(np.asarray(g['points'], np.float64), float(g.get('strength', 0))) for g in lines]
    cos_min = math.cos(math.radians(JOIN_ANGLE))
    while True:
        best = None
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                pi, pj = items[i][0], items[j][0]
                for ei in (False, True):
                    for ej in (False, True):
                        a, b = (pi[0] if ei else pi[-1]), (pj[0] if ej else pj[-1])
                        d = float(np.hypot(*(a - b)))
                        if d > JOIN_DIST:
                            continue
                        if float(np.dot(end_direction(pi, ei), -end_direction(pj, ej))) < cos_min:
                            continue
                        if best is None or d < best[0]:
                            best = (d, i, j, ei, ej)
        if best is None:
            break
        _, i, j, ei, ej = best
        pi, si = items[i]
        pj, sj = items[j]
        first = pi[::-1] if ei else pi           # oriented so the joined end is last
        second = pj if ej else pj[::-1]          # and the other's joined end first
        li, lj = arc_length(pi), arc_length(pj)
        merged = (np.vstack([first, second]), (si * li + sj * lj) / max(1e-9, li + lj))
        items = [it for k, it in enumerate(items) if k not in (i, j)] + [merged]
    return [{'points': p, 'strength': s, 'length': arc_length(p)} for p, s in items]


def interior_lines(mask, photo_lines, silhouette_lines, notes, figure_min=FIGURE_MIN):
    """Photo lines inside the photograph's figure (warped onto the painting), joined and kept by the rules above."""
    ys = np.nonzero(mask.any(1))[0]
    top, height = float(ys.min()), float(ys.max() - ys.min() + 1)
    eroded = cv2.erode(mask.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * ERODE + 1,) * 2))
    pool = [g for g in photo_lines if sample_mask(mask, resample(g['points'])).mean() >= POOL_SHARE]
    joined = join_fragments(pool)
    sil = np.vstack([resample(g['points'], 1.0) for g in silhouette_lines]) if silhouette_lines else np.zeros((0, 2))
    kept, dup = [], 0
    for g in joined:
        r = resample(g['points'])
        if sample_mask(eroded, r).mean() < INSIDE_SHARE:
            continue
        in_head = (r[:, 1] < top + HEAD_ZONE * height).mean() >= 0.5
        if not (g['length'] >= figure_min * height or (in_head and g['length'] >= HEAD_MIN * height)):
            continue
        if len(sil) and (nearest(r, sil)[1] <= DUPLICATE_DIST).mean() >= DUPLICATE_SHARE:
            dup += 1
            continue
        kept.append(g)
    kept.sort(key=lambda g: -g['length'])
    notes.append(f'figure interior: {len(pool)} photo lines in the pool, {len(joined)} after joining, '
                 f'{len(kept)} pass ({dup} dropped as doubling the outline), {min(FIGURE_MAX, len(kept))} kept; '
                 f'height {height:.0f} px')
    return [line(rdp(g['points'], 1.0), 'interior', 'figure', g['strength']) for g in kept[:FIGURE_MAX]]


def inside_painted(lines, painted, notes):
    """The lines every point of which lies on the painting's figure segment."""
    kept = [g for g in lines if sample_mask(painted, resample(g['points'])).all()]
    notes.append(f'figure interior: {len(lines) - len(kept)} of {len(lines)} dropped for a point outside the '
                 f'painting\'s figure segment')
    return kept



def clip_segment(a, b, x0, y0, x1, y1):
    """Liang-Barsky: the part of segment ab inside the box, as (t0, t1), or None."""
    d = b - a
    t0, t1 = 0.0, 1.0
    for p, q in ((-d[0], a[0] - x0), (d[0], x1 - a[0]), (-d[1], a[1] - y0), (d[1], y1 - a[1])):
        if p == 0:
            if q < 0:
                return None
            continue
        t = q / p
        if p < 0:
            t0 = max(t0, t)
        else:
            t1 = min(t1, t)
        if t0 > t1:
            return None
    return t0, t1


def clip_line(points, box):
    """A polyline cut to a box, as the list of runs inside it, in the box's own coordinates."""
    x, y, w, h = box
    p = np.asarray(points, np.float64) - [x, y]
    runs, cur = [], []
    for a, b in zip(p[:-1], p[1:]):
        c = clip_segment(a, b, 0.0, 0.0, w - 1.0, h - 1.0)
        if c is None:
            if cur:
                runs.append(cur)
                cur = []
            continue
        pa, pb = a + c[0] * (b - a), a + c[1] * (b - a)
        if not cur:
            cur = [pa]
        elif np.hypot(*(cur[-1] - pa)) > 1e-6:
            runs.append(cur)
            cur = [pa]
        cur.append(pb)
        if c[1] < 1.0:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return [np.asarray(r) for r in runs if len(r) >= 2 and arc_length(r) >= CROP_MIN]


def crop_doc(doc, box, name):
    out = []
    for g in doc['lines']:
        for r in clip_line(g['points'], box):
            out.append(line(r, g['role'], g['object'], g['strength']))
    return {**{k: v for k, v in doc.items() if k not in ('lines', 'image', 'check', 'notes')},
            'image': {'w': box[2], 'h': box[3]},
            'crop': {'name': name, 'x': box[0], 'y': box[1], 'w': box[2], 'h': box[3],
                     'of': 'work/lines/beach-watercolor-drawing-lines.json'},
            'lines': out}



def draw_panel(base, lines, colour, scale, thickness):
    for g in lines:
        pts = np.round(np.asarray(g['points']) * scale * 8).astype(np.int32).reshape(-1, 1, 2)
        cv2.polylines(base, [pts], False, colour, thickness, cv2.LINE_AA, shift=3)
    return base


def zoom_panel(painting, selected, scale):
    """The dog and the sea at twice the sheet's scale, the lines over the painting."""
    x, y, w, h = ZOOM_BOX
    z = 2.0 * scale
    tile = cv2.resize(painting[y:y + h, x:x + w], (int(round(w * z)), int(round(h * z))), interpolation=cv2.INTER_AREA)
    moved = [{'points': (np.asarray(g['points']) - [x, y]).tolist()} for g in selected]
    return draw_panel(tile, moved, RED, z, 2)


def check_sheet(painting, selected, everything, path):
    h, w = painting.shape[:2]
    s = CHECK_HEIGHT / float(h)
    size = (int(round(w * s)), CHECK_HEIGHT)
    small = cv2.resize(painting, size, interpolation=cv2.INTER_AREA)
    paper = np.full_like(small, 255)
    panels = [draw_panel(paper, selected, INK, s, 2),
              draw_panel(small.copy(), selected, RED, s, 2),
              draw_panel(small.copy(), everything, RED, s, 1),
              zoom_panel(painting, selected, s)]
    titles = [f'{len(selected)} selected lines, ink alone', 'selected over the painting',
              f'all {len(everything)} photo lines over the painting', 'selected, 2x, on the dog and the sea']
    tiles = []
    for p, t in zip(panels, titles):
        p = cv2.copyMakeBorder(p, 26, 6 + CHECK_HEIGHT - p.shape[0], 6, 6, cv2.BORDER_CONSTANT, value=(255, 255, 255))
        cv2.putText(p, t, (8, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (20, 20, 20), 1, cv2.LINE_AA)
        tiles.append(p)
    cv2.imwrite(path, np.hstack(tiles), [int(cv2.IMWRITE_JPEG_QUALITY), 90])



def main():
    ap = argparse.ArgumentParser(description='The first pen drawing of the beach: painted outlines, photo interior.')
    ap.add_argument('--photo', required=True)
    ap.add_argument('--segments', default='work/segments/beach-photo', help='segments.py output prefix for the photo')
    ap.add_argument('--painting-segments', default='work/segments/beach-watercolor',
                    help='segments.py output prefix for the painting, where the silhouettes come from')
    ap.add_argument('--lines', default='work/lines/beach-photo-lines.json')
    ap.add_argument('--mapping', default='work/lines/beach-photo-to-beach.json')
    ap.add_argument('--out', default='work/lines')
    ap.add_argument('--figure-min', type=float, default=FIGURE_MIN,
                    help='shortest figure line kept outside the head zone, as a share of the figure\'s height')
    args = ap.parse_args()

    notes = []
    photo = read_image(args.photo)
    labels = read_image(args.segments + '.png', cv2.IMREAD_GRAYSCALE)
    legend = load_json(args.segments + '.json')['legend']
    if labels.shape != photo.shape[:2]:
        raise SystemExit(f'select-drawing: {args.segments}.png is not the photograph\'s size')
    map_doc = load_json(args.mapping)
    M, size, target = LINES_MAP.read_mapping(map_doc, args.mapping)
    painting = read_image(target)
    if (painting.shape[1], painting.shape[0]) != size:
        raise SystemExit(f'select-drawing: {target} is not the size the mapping says')
    paint_labels = read_image(args.painting_segments + '.png', cv2.IMREAD_GRAYSCALE)
    paint_legend = load_json(args.painting_segments + '.json')['legend']
    if (paint_labels.shape[1], paint_labels.shape[0]) != size:
        raise SystemExit(f'select-drawing: {args.painting_segments}.png is not the painting\'s size')
    src_doc = load_json(args.lines)
    scale = float(np.hypot(M[1, 0], M[0, 0]))

    photo_objs = {k: warp(v, M, size) for k, v in photo_objects(photo, labels, legend, notes).items()}
    check = similarity_check(photo_objs, paint_labels, paint_legend)
    painted = painted_objects(paint_labels, paint_legend, notes)

    everything, _, _ = LINES_MAP.map_lines(LINES_MAP.read_lines(src_doc, args.lines), M, size,
                                           float(src_doc.get('minLength', 12)) * scale)
    pieces, _, _ = LINES_MAP.map_lines(LINES_MAP.read_lines(src_doc, args.lines), M, size, 0.0)

    sil = silhouettes(painted, size, notes)
    fig_int = interior_lines(photo_objs['figure'], pieces, [g for g in sil if g['object'] == 'figure'], notes,
                             args.figure_min)
    fig_int = inside_painted(fig_int, painted['figure'], notes)
    selected = sil + fig_int

    counts = {}
    for g in selected:
        key = f"{g['role']}/{g['object']}"
        counts[key] = counts.get(key, 0) + 1
    doc = {'image': {'w': size[0], 'h': size[1]},
           'source': f'silhouettes from {args.painting_segments}.png; interior lines from {args.photo} by '
                     f'{args.lines}, mapped onto {target} by {args.mapping}; selected by tools/seg/select-drawing.py',
           'engine': src_doc.get('engine', 'unknown'), 'selection': 'first pen drawing', 'counts': counts,
           'check': check, 'notes': notes, 'lines': selected}
    os.makedirs(args.out, exist_ok=True)
    main_path = os.path.join(args.out, 'beach-watercolor-drawing-lines.json')
    with open(main_path, 'w') as f:
        json.dump(doc, f)
    for name, box in CROPS.items():
        with open(os.path.join(args.out, f'{name}-drawing-lines.json'), 'w') as f:
            json.dump(crop_doc(doc, box, name), f)
    check_sheet(painting, selected, everything, os.path.join(args.out, 'beach-drawing-check.jpg'))

    for n in notes:
        print(f'  {n}')
    print(f'photo objects against the painting\'s segments: {json.dumps(check)}')
    print(f'{len(selected)} lines: ' + ', '.join(f'{k} {v}' for k, v in counts.items()))
    print(f'wrote {main_path}, three crops and beach-drawing-check.jpg')


if __name__ == '__main__':
    main()
