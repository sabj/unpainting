#!/usr/bin/env python3
"""Line maps from Informative Drawings (Chan, Durand & Isola, CVPR 2022), vectorised into candidate paths per source.

  python3 tools/seg/lines.py <image> --out work/lines

writes, for each source:

  work/lines/<base>.png          the model's line map, 8-bit, dark lines on white, at the source's own size
  work/lines/<base>-lines.json   the same lines vectorised: {"image":{"w","h"},"source":...,"lines":[...]}
  work/lines/<base>-check.jpg    source | line map | the polylines drawn back over the source

A line is {"points":[[x,y],...],"length":<arc length in source px>,"strength":<mean darkness along it, 0..1>},
longest first. src/crop/lines.mjs scales them to the plan.

The model is the contour_style export from x-Liola-x/informative-drawings-onnx (MIT), cached under
work/models/lines, with its input and output dims made symbolic so it runs at the source's own size.
rocca/informative-drawings-line-art-onnx is the anime style; use the contour export. With no model the
fallback is XDoG in OpenCV, and the JSON records which one ran.

Setup:

    python3 -m venv .venv
    .venv/bin/pip install opencv-python-headless numpy onnxruntime onnx
"""
import argparse
import json
import os
import urllib.error
import urllib.request

import cv2
import numpy as np

MODEL_DIR = 'work/models/lines'
MODEL_URL = ('https://huggingface.co/x-Liola-x/informative-drawings-onnx/resolve/main/'
             'informative-drawings_contour_512x512.onnx')
MODEL_FILE = 'informative-drawings_contour_512x512.onnx'
DYNAMIC_FILE = 'informative-drawings_contour_dynamic.onnx'
# The generator halves the image twice: sides are reflected out to a multiple of four and the output cropped back.
PAD_TO = 4
# Line cut: Otsu on the darkness, held inside a band so a source with no lines does not run away.
OTSU_FLOOR, OTSU_CEIL = 0.20, 0.70
# Douglas-Peucker tolerance, the shortest line worth keeping and the longest dead-end stub rubbed out before the
# walk, all in source pixels.
EPSILON = 1.5
MIN_LENGTH = 12
SPUR = 4
# The share of the fallback's sharpened difference that becomes line, as a percentile. See xdog_line_map.
XDOG_QUANTILE = 10.0
# Width of each check-sheet panel, in pixels.
CHECK_PANEL = 640



def fetch_model():
    """The contour export, downloaded once and rewritten to accept any size. Returns (path, note) or (None, why)."""
    os.makedirs(MODEL_DIR, exist_ok=True)
    dynamic = os.path.join(MODEL_DIR, DYNAMIC_FILE)
    if os.path.exists(dynamic):
        return dynamic, f'contour_style from {dynamic}'
    fixed = os.path.join(MODEL_DIR, MODEL_FILE)
    if not os.path.exists(fixed):
        print(f'  fetching {MODEL_URL}', flush=True)
        tmp = fixed + '.part'
        try:
            with urllib.request.urlopen(MODEL_URL, timeout=300) as r, open(tmp, 'wb') as f:
                f.write(r.read())
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            if os.path.exists(tmp):
                os.remove(tmp)
            return None, f'cannot fetch the model ({e})'
        os.replace(tmp, fixed)
    try:
        import onnx
    except ImportError:
        return fixed, f'contour_style from {fixed}, fixed at 512 (no onnx package to free the dimensions)'
    try:
        model = onnx.load(fixed)
        for group, names in ((model.graph.input, ('batch', 'channels', 'height', 'width')),
                             (model.graph.output, ('batch', 'channels', 'height', 'width'))):
            for value in group:
                dims = value.type.tensor_type.shape.dim
                for axis in (0, 2, 3):
                    if axis < len(dims):
                        dims[axis].ClearField('dim_value')
                        dims[axis].dim_param = names[axis]
        onnx.save(model, dynamic)
    except Exception as e:   # a failed rewrite falls back to the fixed-size model
        return fixed, f'contour_style from {fixed}, fixed at 512 (rewriting the dimensions failed: {e})'
    return dynamic, f'contour_style from {dynamic}'


def open_session(path):
    try:
        import onnxruntime as ort
    except ImportError:
        return None, 'onnxruntime is not installed in this interpreter'
    try:
        session = ort.InferenceSession(path, providers=['CPUExecutionProvider'])
    except Exception as e:
        return None, f'cannot open {path} ({e})'
    return session, None


def model_line_map(session, bgr):
    """The model's greyscale drawing of this image, 0..1, white paper and dark lines, at the image's own size."""
    h, w = bgr.shape[:2]
    shape = session.get_inputs()[0].shape
    fixed = [d for d in (shape[2], shape[3]) if isinstance(d, int)]
    if fixed:                                                 # an export whose dimensions could not be freed
        side = fixed[0]
        work = cv2.resize(bgr, (side, side), interpolation=cv2.INTER_AREA)
        pad_h = pad_w = 0
    else:
        pad_h, pad_w = (-h) % PAD_TO, (-w) % PAD_TO
        work = cv2.copyMakeBorder(bgr, 0, pad_h, 0, pad_w, cv2.BORDER_REFLECT_101) if (pad_h or pad_w) else bgr
    rgb = cv2.cvtColor(work, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    batch = np.transpose(rgb, (2, 0, 1))[None]
    out = session.run(None, {session.get_inputs()[0].name: batch})[0][0, 0]
    if fixed:
        out = cv2.resize(out, (w, h), interpolation=cv2.INTER_AREA)
    elif pad_h or pad_w:
        out = out[:h, :w]
    return np.clip(out, 0.0, 1.0).astype(np.float32)


def xdog_line_map(bgr, sigma=0.8, k=1.6, sharpen=20.0, phi=10.0, quantile=XDOG_QUANTILE):
    """The fallback: Winnemoller's XDoG, soft-thresholded. It cannot tell a jaw from sand, so callers are told when it ran.

    The cut is the image's own darkest tenth of the sharpened difference; past that the skeleton becomes a net
    that fragments into pieces too short to keep.
    """
    grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    g1 = cv2.GaussianBlur(grey, (0, 0), sigma)
    g2 = cv2.GaussianBlur(grey, (0, 0), sigma * k)
    d = (1.0 + sharpen) * g1 - sharpen * g2
    eps = float(np.percentile(d, quantile))
    out = np.where(d >= eps, 1.0, 1.0 + np.tanh(phi * (d - eps)))
    return np.clip(out, 0.0, 1.0).astype(np.float32)


def threshold_of(dark, given):
    """Where the map stops being a line, on darkness rather than on brightness."""
    if given is not None:
        return float(given)
    level, _ = cv2.threshold((dark * 255).astype(np.uint8), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return float(min(OTSU_CEIL, max(OTSU_FLOOR, level / 255.0)))



def zhang_suen(mask):
    """One-pixel skeleton, for boxes without cv2.ximgproc or skimage. Both sub-iterations test the whole field at once,
    as published.
    """
    img = (mask > 0).astype(np.uint8)
    while True:
        removed = 0
        for step in (0, 1):
            p = np.pad(img, 1)
            p2, p3, p4 = p[:-2, 1:-1], p[:-2, 2:], p[1:-1, 2:]
            p5, p6, p7 = p[2:, 2:], p[2:, 1:-1], p[2:, :-2]
            p8, p9 = p[1:-1, :-2], p[:-2, :-2]
            neighbours = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
            ring = (p2, p3, p4, p5, p6, p7, p8, p9, p2)
            transitions = sum(((ring[i] == 0) & (ring[i + 1] == 1)).astype(np.uint8) for i in range(8))
            keep = (img == 1) & (neighbours >= 2) & (neighbours <= 6) & (transitions == 1)
            if step == 0:
                cond = keep & ((p2 * p4 * p6) == 0) & ((p4 * p6 * p8) == 0)
            else:
                cond = keep & ((p2 * p4 * p8) == 0) & ((p2 * p6 * p8) == 0)
            count = int(cond.sum())
            if count:
                img[cond] = 0
                removed += count
        if not removed:
            return img


def thin(mask):
    """cv2.ximgproc if opencv-contrib is installed, else skimage, else the one above. Returns (skeleton, note)."""
    if hasattr(cv2, 'ximgproc'):
        try:
            return (cv2.ximgproc.thinning(mask * 255, thinningType=cv2.ximgproc.THINNING_ZHANGSUEN) > 0).astype(np.uint8), 'cv2.ximgproc'
        except Exception:
            pass
    try:
        from skimage.morphology import skeletonize
        return skeletonize(mask > 0).astype(np.uint8), 'skimage'
    except ImportError:
        pass
    return zhang_suen(mask), 'zhang-suen'


NEIGHBOURS = ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1))


def degrees(skel):
    p = np.pad(skel, 1)
    total = np.zeros(skel.shape, np.uint8)
    for dy, dx in NEIGHBOURS:
        total += p[1 + dy:1 + dy + skel.shape[0], 1 + dx:1 + dx + skel.shape[1]]
    return total * skel


def walk_skeleton(skel):
    """The skeleton as ordered pixel paths: one path per branch, cut at every junction, closed loops last.

    8-connected. A pixel with two neighbours is inside a branch; anything else is a node, and a node belongs to
    every branch that meets it, so the paths of a fork all reach the fork rather than stopping a pixel short.
    """
    h, w = skel.shape
    deg = degrees(skel)
    on = skel > 0
    spent = np.zeros(skel.shape, bool)                        # branch interiors, which belong to one path only
    started = set()                                           # (node, first step), so a branch is not walked twice
    paths = []

    def neighbours(y, x):
        for dy, dx in NEIGHBOURS:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and on[ny, nx]:
                yield ny, nx

    def walk(node, first):
        path = [node, first]
        prev, cur = node, first
        if deg[first] == 2:
            spent[first] = True
        while deg[cur] == 2:
            nxt = None
            for ny, nx in neighbours(*cur):
                if (ny, nx) != prev and not spent[ny, nx]:
                    nxt = (ny, nx)
                    break
            if nxt is None:
                break
            path.append(nxt)
            if deg[nxt] == 2:
                spent[nxt] = True
            prev, cur = cur, nxt
        started.add((node, first))
        started.add((path[-1], path[-2]))                     # and not again from the far end
        return path

    for y, x in zip(*np.nonzero((deg != 2) & on)):
        node = (int(y), int(x))
        for nb in list(neighbours(*node)):
            if (node, nb) in started or spent[nb]:
                continue
            paths.append(walk(node, nb))
    # What is left is closed: every pixel has two neighbours and no end to start from.
    for y, x in zip(*np.nonzero((deg == 2) & on & ~spent)):
        start = (int(y), int(x))
        if spent[start]:
            continue
        spent[start] = True
        path = [start]
        prev, cur = None, start
        while True:
            nxt = None
            for nb in neighbours(*cur):
                if nb != prev and not spent[nb]:
                    nxt = nb
                    break
            if nxt is None:
                break
            spent[nxt] = True
            path.append(nxt)
            prev, cur = cur, nxt
        if len(path) > 2:
            path.append(start)                                # close it
            paths.append(path)
    return paths


def arc_length(points):
    if len(points) < 2:
        return 0.0
    p = np.asarray(points, np.float64)
    return float(np.hypot(*(p[1:] - p[:-1]).T).sum())


def prune_spurs(skel, spur):
    """Rub out the dead-end stubs a thinning leaves.

    A short stub off a line is a junction that cuts the line in two. Only a branch with a fork at one end and
    nothing at the other is removed, so a short standalone line survives. The thinning reruns after each pass:
    an 8-connected stub's base pixel stays a fork until thinned again.
    """
    if spur <= 0:
        return skel, 0
    gone = 0
    for _ in range(4):
        deg = degrees(skel)
        cut = 0
        nxt = skel.copy()
        for path in walk_skeleton(skel):
            if len(path) < 2 or path[0] == path[-1]:
                continue
            ends = (deg[path[0]], deg[path[-1]])
            if arc_length([(x, y) for y, x in path]) > spur:
                continue
            if 1 in ends and max(ends) >= 3:                  # a stub off a fork, and not a line of its own
                for y, x in (path[1:] if deg[path[0]] >= 3 else path[:-1]):
                    nxt[y, x] = 0
                cut += 1
        gone += cut
        if not cut:
            break
        skel = thin(nxt)[0]
    return skel, gone


def vectorise(skel, dark, epsilon=EPSILON, min_length=MIN_LENGTH):
    """The skeleton as simplified polylines in (x, y), longest first, each with its darkness along the map."""
    h, w = skel.shape
    lines = []
    for path in walk_skeleton(skel):
        if len(path) < 2:
            continue
        ys = np.fromiter((p[0] for p in path), np.int32, len(path))
        xs = np.fromiter((p[1] for p in path), np.int32, len(path))
        closed = (path[0] == path[-1]) and len(path) > 2
        poly = cv2.approxPolyDP(np.stack([xs, ys], 1).reshape(-1, 1, 2), epsilon, closed).reshape(-1, 2)
        if len(poly) < 2:
            continue
        if closed and tuple(poly[0]) != tuple(poly[-1]):
            poly = np.vstack([poly, poly[:1]])
        length = arc_length(poly)
        if length < min_length:
            continue
        lines.append({'points': [[int(x), int(y)] for x, y in poly],
                      'length': round(length, 2),
                      'strength': round(float(np.clip(dark[ys, xs].mean(), 0.0, 1.0)), 4)})
    lines.sort(key=lambda g: -g['length'])
    return lines



def check_sheet(bgr, grey, lines, panel=CHECK_PANEL):
    """source | line map | the polylines over a faded source, one row, labelled."""
    h, w = bgr.shape[:2]
    over = cv2.addWeighted(bgr, 0.45, np.full_like(bgr, 255), 0.55, 0)
    thickness = max(1, int(round(min(h, w) / 400.0)))
    for g in lines:
        pts = np.asarray(g['points'], np.int32).reshape(-1, 1, 2)
        closed = len(g['points']) > 2 and g['points'][0] == g['points'][-1]
        cv2.polylines(over, [pts], closed, (30, 30, 200), thickness, cv2.LINE_AA)
    mapped = cv2.cvtColor((grey * 255).astype(np.uint8), cv2.COLOR_GRAY2BGR)
    scale = min(1.0, panel / float(w))
    size = (max(1, int(round(w * scale))), max(1, int(round(h * scale))))
    titles = ('source', 'line map', f'{len(lines)} polylines')
    tiles = []
    for title, img in zip(titles, (bgr, mapped, over)):
        tile = cv2.resize(img, size, interpolation=cv2.INTER_AREA)
        tile = cv2.copyMakeBorder(tile, 26, 6, 6, 6, cv2.BORDER_CONSTANT, value=(255, 255, 255))
        cv2.putText(tile, title, (8, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (20, 20, 20), 1, cv2.LINE_AA)
        tiles.append(tile)
    return np.hstack(tiles)



def read_image(path):
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f'lines: cannot read {path}')
    return img


def line_map(bgr, session, args):
    if session is not None:
        return model_line_map(session, bgr), 'informative-drawings contour_style'
    return xdog_line_map(bgr, sigma=args.xdogsigma, sharpen=args.xdogsharpen), 'xdog fallback'


def main():
    ap = argparse.ArgumentParser(description="The lines inside a picture, as a drawing model draws them.")
    ap.add_argument('images', nargs='+')
    ap.add_argument('--out', default='work/lines')
    ap.add_argument('--model', choices=['auto', 'off'], default='auto', help="off forces the XDoG fallback")
    ap.add_argument('--threshold', type=float, default=None, help='darkness a line must reach; default Otsu')
    ap.add_argument('--epsilon', type=float, default=EPSILON, help='Douglas-Peucker tolerance, in source pixels')
    ap.add_argument('--minlength', type=float, default=MIN_LENGTH, help='shortest line kept, in source pixels')
    ap.add_argument('--spur', type=float, default=SPUR, help='dead-end stubs shorter than this are rubbed out first')
    ap.add_argument('--xdogsigma', type=float, default=0.8)
    ap.add_argument('--xdogsharpen', type=float, default=20.0)
    ap.add_argument('--panel', type=int, default=CHECK_PANEL, help='width of one check-sheet panel')
    ap.add_argument('--nocheck', action='store_true', help='skip the check sheet')
    args = ap.parse_args()

    session, engine = None, None
    if args.model == 'off':
        print('lines: --model off, the XDoG fallback draws every map', flush=True)
    else:
        path, note = fetch_model()
        if path is None:
            print(f'lines: {note}; falling back to XDoG', flush=True)
        else:
            session, why = open_session(path)
            if session is None:
                print(f'lines: {why}; falling back to XDoG', flush=True)
            else:
                engine = note
                print(f'lines: {note}', flush=True)

    os.makedirs(args.out, exist_ok=True)
    for source in args.images:
        base = os.path.splitext(os.path.basename(source))[0]
        bgr = read_image(source)
        h, w = bgr.shape[:2]
        grey, how = line_map(bgr, session, args)
        dark = 1.0 - grey
        cut = threshold_of(dark, args.threshold)
        mask = (dark >= cut).astype(np.uint8)
        skel, thinner = thin(mask)
        skel, stubs = prune_spurs(skel, args.spur)
        lines = vectorise(skel, dark, epsilon=args.epsilon, min_length=args.minlength)

        cv2.imwrite(os.path.join(args.out, base + '.png'), (grey * 255).astype(np.uint8))
        with open(os.path.join(args.out, base + '-lines.json'), 'w') as f:
            json.dump({'image': {'w': int(w), 'h': int(h)}, 'source': source, 'engine': how,
                       'model': engine or 'xdog', 'threshold': round(cut, 4), 'thinning': thinner,
                       'epsilon': args.epsilon, 'minLength': args.minlength, 'spur': args.spur,
                       'lines': lines}, f)
        if not args.nocheck:
            cv2.imwrite(os.path.join(args.out, base + '-check.jpg'), check_sheet(bgr, grey, lines, args.panel),
                        [int(cv2.IMWRITE_JPEG_QUALITY), 88])
        ink = 100.0 * float(mask.mean())
        total = sum(g['length'] for g in lines)
        got = (f'{len(lines)} lines, {total:.0f} px, longest {lines[0]["length"]:.0f} px' if lines
               else f'no line over {args.minlength:.0f} px')
        print(f'{base}: {w}x{h}  {how}, cut {cut:.2f} ({ink:.1f}% of cells inked), {thinner}, '
              f'{stubs} stubs rubbed out, {got}', flush=True)


if __name__ == '__main__':
    main()
