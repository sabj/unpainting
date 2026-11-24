#!/usr/bin/env python3
# Pipeline: step 0b (every model-made drawing, before it is fitted): the drawing may not invent anything.
"""Check that a drawing (a Qwen line, lay-in or pencil study) puts marks only where the SOURCE has structure.

    drawing-fidelity.py SOURCE DRAWING [--out report.json] [--strip cleaned.png] [--sheet check.jpg]

A drawn mark is a pixel of the drawing darker than its paper. The source's structure is its form edges (Lab gradient
at sigma 4 over EDGE: a soft wash or a brushy plain background is blank), widened by REACH of the picture's long side: a line may run a little past
where the paint stops. Marks outside that are INVENTED (a background the source leaves blank, a frame, a signature or an
object that is not there). Also measured: a FRAME, a long straight drawn line along a border (a ruled box; the sheet's own edge is not drawn).

    invented   share of the drawing's marks that lie where the source has no structure
    frame      a border band (BAND of the side) with a straight drawn run over FRAME_RUN of its length
    regions    the 4x4 grid cells holding most of the invented marks

PASS when invented <= MAX_INVENTED and no frame. --strip writes the drawing with every invented mark and any frame
erased to paper (the general repair, used when no seed passes).
"""
import argparse, json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import color, feature, morphology

REACH = 0.02          # how far past a source edge a line may run, as a share of the long side
MAX_INVENTED = 0.06   # the most of a drawing's marks that may lie where the source is blank
LONG = 1200


def lab_of(path, size):
    im = Image.open(path).convert('RGB').resize(size, Image.LANCZOS)
    return color.rgb2lab(np.asarray(im, np.float32) / 255)


def gray(path, size):
    return lab_of(path, size)[..., 0]


def marks_of(L):
    """Drawn marks: darker than the drawing's paper (its bright median) by a clear step."""
    paper = float(np.percentile(L, 90))
    return L < paper - max(5.0, 0.05 * paper)


EDGE = 0.8            # a form edge: colour changes faster than this many CIELAB units per pixel at sigma 4 (at 1200 px)


def source_structure(lab):
    """Where the source has a form edge: the Lab gradient at form scale (sigma 4), so a soft wash, paper grain or a
    brushy background with no shape in it is blank, and every contour, crease and accent is structure."""
    g = 0
    for c in range(3):
        gy = ndi.gaussian_filter(lab[..., c], 4, order=(1, 0)); gx = ndi.gaussian_filter(lab[..., c], 4, order=(0, 1))
        g = g + gx * gx + gy * gy
    return np.sqrt(g) > EDGE


BAND = 0.10            # a frame is looked for within this share of each side
FRAME_RUN = 0.5        # a straight drawn run over this share of the side's length is a frame


def runs(M, r):
    row = ndi.binary_closing(M[max(0, r - 2):r + 3].any(0), structure=np.ones(7))
    lab, nn = ndi.label(row)
    return ndi.sum(row, lab, np.arange(1, nn + 1)).max() / M.shape[1] if nn else 0.0


def frame_of(D, S_line=None):
    """Ruled boxes: in each border band, a row (or column) whose drawn marks, taken 2 px either side and with gaps of 3 px
    closed, run straight over FRAME_RUN of the side. offset_px is from the outer edge of the picture."""
    h, w = D.shape; found = []
    for side in ('top', 'bottom', 'left', 'right'):
        M = D if side in ('top', 'bottom') else D.T
        n = int(BAND * M.shape[0]); idx = range(n) if side in ('top', 'left') else range(M.shape[0] - 1, M.shape[0] - 1 - n, -1)
        SL = None if S_line is None else (S_line if side in ('top', 'bottom') else S_line.T)
        for k, r in enumerate(idx):
            run = runs(M, r)
            # a straight line the source itself DRAWS there (a thin dark line, not the sheet's edge) is not a frame
            if run > FRAME_RUN and (SL is None or runs(SL, r) < 0.3):
                found.append({'side': side, 'offset_px': k, 'run': round(float(run), 2)}); break
    # a box: three or more sides ruled, or a side ruled almost its whole length; one long straight edge is a building's
    return found if len(found) >= 3 or any(f['run'] > 0.85 for f in found) else []


def check(source, drawing, reach=REACH):
    im = Image.open(drawing); s = LONG / max(im.size); size = (round(im.width * s), round(im.height * s))
    D = marks_of(gray(drawing, size))
    st = source_structure(lab_of(source, size))
    r = max(2, int(reach * max(size)))
    near = ndi.binary_dilation(st, structure=morphology.disk(r))
    inv = D & ~near
    inv = morphology.remove_small_objects(inv, max_size=6)
    # inscriptions: a small compact cluster of marks (a signature, a date, lettering) in the outer band of the sheet where
    # the source draws no thin dark line of its own (a painted edge there does not license writing)
    Ls = lab_of(source, size)[..., 0]
    s_line = ndi.binary_dilation((ndi.grey_closing(Ls, footprint=morphology.disk(2)) - Ls) > 10, iterations=4)
    h0, w0 = D.shape; band = np.ones_like(D); band[int(BAND * h0):h0 - int(BAND * h0), int(BAND * w0):w0 - int(BAND * w0)] = False
    cl, ncl = ndi.label(ndi.binary_dilation(D & band, iterations=6))
    words = np.zeros_like(D)
    for k, sl in enumerate(ndi.find_objects(cl), 1):
        hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if (hh <= 0.06 * h0 and ww <= 0.15 * w0) or (hh <= 0.04 * h0 and ww <= 0.4 * w0):   # a signature; a line of lettering
            m = (cl[sl] == k) & D[sl]
            if m.sum() and (m & s_line[sl]).mean() < 0.3: words[sl] |= m
    inv = inv | words
    n = max(1, int(D.sum()))
    h, w = D.shape; grid = []
    for gy in range(4):
        for gx in range(4):
            c = inv[gy * h // 4:(gy + 1) * h // 4, gx * w // 4:(gx + 1) * w // 4].sum()
            if c / n > 0.01: grid.append({'cell': [gx, gy], 'share': round(float(c / n), 3)})
    Ls = lab_of(source, size)[..., 0]
    fr = frame_of(D, (ndi.grey_closing(Ls, footprint=morphology.disk(2)) - Ls) > 10)
    rep = {'inscriptions': int(ndi.label(words)[1] > 0), 'drawing': drawing, 'source': source, 'marks': round(float(D.mean()), 4), 'invented': round(float(inv.sum() / n), 4),
           'frame': fr, 'regions': sorted(grid, key=lambda g: -g['share'])[:6], 'reach': reach, 'max_invented': MAX_INVENTED}
    rep['pass'] = rep['invented'] <= MAX_INVENTED and not fr
    return rep, D, inv, near, size


def strip(drawing, inv, frames, size, out):
    """The general repair: erase every invented mark, and each frame line found (its row or column in the border band,
    a few pixels either side), to the drawing's paper."""
    im = np.asarray(Image.open(drawing).convert('RGB')).copy()
    H, W = im.shape[:2]; w, h = size
    kill = inv.copy()
    for f in frames:
        o = f['offset_px']
        if f['side'] == 'top': kill[max(0, o - 4):o + 5, :] = True
        if f['side'] == 'bottom': y = h - 1 - o; kill[max(0, y - 4):y + 5, :] = True
        if f['side'] == 'left': kill[:, max(0, o - 4):o + 5] = True
        if f['side'] == 'right': x = w - 1 - o; kill[:, max(0, x - 4):x + 5] = True
    kill = ndi.binary_dilation(kill, iterations=2)
    k = np.asarray(Image.fromarray(kill.astype(np.uint8) * 255).resize((W, H), Image.NEAREST)) > 0
    paper = np.percentile(im.reshape(-1, 3), 90, axis=0).astype(np.uint8)
    im[k] = paper
    Image.fromarray(im).save(out)


def sheet(source, drawing, inv, size, out):
    a = Image.open(source).convert('RGB').resize(size); b = np.asarray(Image.open(drawing).convert('RGB').resize(size)).copy()
    b[inv] = (220, 30, 30)
    both = Image.new('RGB', (size[0] * 2 + 8, size[1]), 'white'); both.paste(a, (0, 0)); both.paste(Image.fromarray(b), (size[0] + 8, 0))
    both.thumbnail((1600, 1600)); both.save(out, quality=85)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('source'); ap.add_argument('drawing'); ap.add_argument('--out'); ap.add_argument('--strip'); ap.add_argument('--sheet')
    A = ap.parse_args()
    rep, D, inv, near, size = check(A.source, A.drawing)
    if A.strip: strip(A.drawing, inv, rep['frame'], size, A.strip); rep['stripped'] = A.strip
    if A.sheet: sheet(A.source, A.drawing, inv, size, A.sheet)
    if A.out: json.dump(rep, open(A.out, 'w'), indent=1)
    print(f"{'PASS' if rep['pass'] else 'FAIL'} invented {rep['invented']:.3f} frame {len(rep['frame'])} marks {rep['marks']:.3f} {A.drawing}")


if __name__ == '__main__':
    main()
