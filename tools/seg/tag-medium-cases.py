#!/usr/bin/env python3
"""Made cases for tag-medium.py --mode contour --keep pencil (tag-medium.test.mjs runs this and checks the JSON it prints).

    tag-medium-cases.py DIR [tagger args...]

A 160 x 120 mm sheet: white paper; a pale grey wall (L* about 77) with the model's hatching over it; a black pen line along
the foot; a black blot (a fill the source draws in near-black); a pale tone mass inside the wall (a mass the model shaded).
Writes DIR/source.png and DIR/vectors.json, runs the tagger with the given arguments, prints each stroke's result."""
import json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

D = Path(sys.argv[1]); D.mkdir(parents=True, exist_ok=True)
MM, PX = 160.0, 5.0                  # sheet width (mm), source pixels a mm
im = np.full((int(120 * PX), int(MM * PX), 3), 255, np.uint8)
box = lambda x0, y0, x1, y1, v: im.__setitem__((slice(int(y0 * PX), int(y1 * PX)), slice(int(x0 * PX), int(x1 * PX))), v)
box(20, 20, 70, 60, 190)             # the pale wall
box(100, 20, 115, 35, 20)            # the black blot
box(20, 79.8, 140, 80.2, 0)          # the pen line, 0.4 mm
Image.fromarray(im).save(D / 'source.png')


def line(seq, part, a, b, w, n=40):
    P = [[a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n] for k in range(n + 1)]
    d = np.subtract(b, a, dtype=float); d /= np.hypot(*d); nx, ny = -d[1] * w / 2, d[0] * w / 2
    ring = [[x + nx, y + ny] for x, y in P] + [[x - nx, y - ny] for x, y in P[::-1]]
    return {'seq': seq, 'line': seq, 'part': part, 'drawn': 'path', 'dark': 0.9, 'path': P, 'widths': [w] * len(P), 'outline': [ring]}


def mass(seq, part, x0, y0, x1, y1, fill):
    s = {'seq': seq, 'line': seq, 'part': part, 'dark': 0.8, 'path': [[x0, (y0 + y1) / 2], [x1, (y0 + y1) / 2]],
         'widths': [0.0, 0.0], 'outline': [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]}
    if fill: s['fill'] = True
    return s


S = [line(0, 'outline', (20, 80), (140, 80), 0.4)]
S += [line(1 + k, 'hatch', (24 + 4 * k, 56), (34 + 4 * k, 46), 0.3, 20) for k in range(6)]
S += [mass(7, 'fill', 100, 20, 115, 35, True), mass(8, 'tone', 30, 30, 60, 50, False)]
json.dump({'sheetMm': MM, 'heightMm': 120.0, 'medium': 'ink', 'fills': 'marked', 'strokes': S}, open(D / 'vectors.json', 'w'))
out = D / 'tagged.json'
subprocess.run([sys.executable, str(Path(__file__).with_name('tag-medium.py')), str(D / 'vectors.json'), str(D / 'source.png'),
                '--mode', 'contour', '--picture', 'ink', '--out', str(out), *sys.argv[2:]], check=True, stdout=subprocess.DEVNULL)
doc = json.load(open(out))


def area(rings):
    return float(sum(abs(0.5 * np.dot(np.asarray(r)[:, 0], np.roll(np.asarray(r)[:, 1], -1)) - 0.5 * np.dot(np.asarray(r)[:, 1], np.roll(np.asarray(r)[:, 0], -1))) for r in rings))


print(json.dumps({'counts': doc['mediumMap']['counts'], 'strokes': [
    {'seq': s['seq'], 'part': s['part'], 'medium': s.get('medium'), 'drop': bool(s.get('drop')), 'dark': s.get('dark'), 'fitDark': s.get('fitDark'),
     'fill': bool(s.get('fill')), 'drawn': s.get('drawn'), 'area': area(s['outline']), 'rings': len(s['outline']), 'massAs': s.get('massAs'),
     'bandMm': s.get('bandMm')} for s in doc['strokes']]}))
