"""vfit.py DRAWING VECTORS.json [--width W] [--diff OUT.jpg] [--render OUT.png]: how well the vector strokes fit the drawing's
ink. At W pixels across (default 3072, 0.09 mm), ink is darkness over 0.25 (the drawing's, and the vectors' rendered);
inside = share of the drawing's ink the vectors cover; outside = share of vector ink not on the drawing's ink; missing/extra
the same beyond 0.1 mm; edge distance between the two ink edges, median and 95th percentile in mm."""
import sys, json, argparse, importlib.util, numpy as np, cv2
ap = argparse.ArgumentParser(); ap.add_argument('drawing'); ap.add_argument('vec'); ap.add_argument('--width', type=int, default=3072); ap.add_argument('--diff'); ap.add_argument('--render')
ap.add_argument('--psf', type=float, default=None); ap.add_argument('--tool', default=__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.dirname(__import__('os').path.dirname(__import__('os').path.abspath(__file__)))), 'tools', 'seg', 'ink-vectors.py')); a = ap.parse_args()
spec = importlib.util.spec_from_file_location('iv', a.tool); iv = importlib.util.module_from_spec(spec); spec.loader.exec_module(iv)
doc = json.load(open(a.vec)); V = iv.render_vectors(doc, a.width); H, W = V.shape; px = doc['sheetMm'] / W
V = cv2.GaussianBlur(V, (0, 0), (iv.PSF if a.psf is None else a.psf) * W / doc['drawing']['w']) if (iv.PSF if a.psf is None else a.psf) > 0 else V   # seen through the drawing's own softness
D = cv2.resize(iv.darkness(cv2.imread(a.drawing)), (W, H), interpolation=cv2.INTER_CUBIC).clip(0, 1)
# a light drawing (pencil) is measured on its own scale: ink is a quarter of its firmest line's darkness
firm = min(1.0, float(np.percentile(D[D > .02], 99))) if (D > .02).any() else 1.0
# (a light drawing, pencil, by a fifth of its firmest line's darkness, on both)
th = .2 * firm if firm < .6 else .25; md, mv = D > th, V > th
near = lambda m, r: cv2.dilate(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))) > 0
r = max(1, round(.1 / px))
edge = lambda m: m & ~cv2.erode(m.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
ed, ev = edge(md), edge(mv); dd = cv2.distanceTransform((~ed).astype(np.uint8), cv2.DIST_L2, 5); dv = cv2.distanceTransform((~ev).astype(np.uint8), cv2.DIST_L2, 5)
e = np.r_[dd[ev], dv[ed]] * px
res = {'strokes': len(doc['strokes']), 'inside': round(float((md & mv).sum() / md.sum()), 4), 'outside': round(float((mv & ~md).sum() / mv.sum()), 4),
       'missing': round(float((md & ~near(mv, r)).sum() / md.sum()), 4), 'extra': round(float((mv & ~near(md, r)).sum() / md.sum()), 4),
       'edgeMm': [round(float(np.median(e)), 3), round(float(np.percentile(e, 95)), 3)], 'meanAbsDarkness': round(float(np.abs(D - V)[md | mv].mean()), 3)}
print(json.dumps(res))
if a.render: cv2.imwrite(a.render, np.uint8(255 * (1 - V)))
if a.diff:
    o = np.full((H, W, 3), 255, np.uint8); o[md & mv] = 0; o[md & ~near(mv, r)] = (40, 40, 220); o[mv & ~near(md, r)] = (220, 60, 30)
    cv2.imwrite(a.diff, o)
