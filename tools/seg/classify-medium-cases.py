#!/usr/bin/env python3
"""Synthetic pictures for step 0 (classify-medium.py, drawing-fidelity.py): a pen line drawing with washes, washes with a
faint pencil drawing under them, a pure wash; and a drawing that invents a background. Prints JSON results. Arg: work dir."""
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
D = sys.argv[1]; HERE = os.path.dirname(os.path.abspath(__file__)); W, H = 1200, 800
rng = np.random.default_rng(1)
pal = [(70, 120, 190), (190, 120, 60), (40, 70, 50), (150, 60, 80), (90, 90, 140)]
shapes = [((60 + 180 * i + int(rng.integers(0, 30)), 40 + 180 * j + int(rng.integers(0, 30)), 200 + 180 * i, 170 + 180 * j), pal[(i + j) % 5])
          for i in range(6) for j in range(4)]


def paper():
    a = np.full((H, W, 3), 247, np.float32) + rng.normal(0, 1.5, (H, W, 1)); return a


def washes(a, soft=6):
    for box, c in shapes:
        m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).ellipse(box, fill=255)
        m = np.asarray(m.filter(ImageFilter.GaussianBlur(soft)), np.float32)[..., None] / 255 * 0.85
        a = a * (1 - m + m * np.array(c, np.float32) / 255)   # transparent: the wash multiplies what is under it
    return a


def lines(a, width, grey, dark):
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
    for box, _ in shapes:
        d.ellipse(box, outline=(grey, grey, grey), width=width)
        x0, y0, x1, y1 = box; d.line((x0 + 20, (y0 + y1) // 2, x1 - 20, (y0 + y1) // 2 + 15), fill=(grey, grey, grey), width=width)
    return np.asarray(im.filter(ImageFilter.GaussianBlur(0.6)), np.float32)


pics = {'ink': lines(washes(paper()) * 0.35 + paper() * 0.65, 2, 15, True),
        'pencil': washes(lines(paper(), 2, 175, False)),
        'none': washes(paper(), soft=25)}
out = {}
for k, a in pics.items():
    f = os.path.join(D, f'{k}.png'); Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(f)
    subprocess.run([sys.executable, os.path.join(HERE, 'classify-medium.py'), f, '--id', k, '--out', D, '--nocrops'], check=True, capture_output=True)
    out[k] = json.load(open(os.path.join(D, f'{k}.json')))['line']
# fidelity: a clean outline drawing of the pencil picture passes; the same with an invented background (sky hatching in the
# blank top band) and a ruled frame fails
left = [sb for sb in shapes if sb[0][2] < W // 2]
srcim = Image.new('RGB', (W, H), (247, 247, 247)); d = ImageDraw.Draw(srcim)
for box, c in left: d.ellipse(box, fill=c)
srcim.filter(ImageFilter.GaussianBlur(3)).save(os.path.join(D, 'half.png'))
clean = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(clean)
for box, _ in left: d.ellipse(box, outline=(90, 90, 90), width=2)
clean.save(os.path.join(D, 'clean.png'))
bad = clean.copy(); d = ImageDraw.Draw(bad)
for y in range(100, 700, 14): d.line((700, y, 1100, y + 5), fill=(60, 60, 60), width=2)   # an invented sky on the blank right half
d.rectangle((12, 12, W - 12, H - 12), outline=(60, 60, 60), width=2); bad.save(os.path.join(D, 'bad.png'))
src = os.path.join(D, 'half.png')
for k in ('clean', 'bad'):
    r = subprocess.run([sys.executable, os.path.join(HERE, 'drawing-fidelity.py'), src, os.path.join(D, f'{k}.png'), '--out', os.path.join(D, f'{k}.json')], check=True, capture_output=True)
    out['fidelity_' + k] = json.load(open(os.path.join(D, f'{k}.json')))['pass']
# tag-medium: on a source with one pen line and one wash block, a stroke on the line is ink, a contour on the block's edge
# is a graphite lay-in, a hatch stroke on blank paper is dropped
src = Image.new('RGB', (W, H), (247, 247, 247)); d = ImageDraw.Draw(src)
d.rectangle((600, 300, 1000, 600), fill=(150, 170, 200)); d.line((100, 200, 500, 200), fill=(20, 20, 20), width=2)
src.save(os.path.join(D, 'tsrc.png'))
mm = 0.25   # mm per source px: a 300 mm sheet
st = lambda seq, part, a, b: {'seq': seq, 'line': seq, 'part': part, 'dark': 0.9, 'widths': [0.3] * 21,
                              'path': [[(a[0] + (b[0] - a[0]) * k / 20) * mm, (a[1] + (b[1] - a[1]) * k / 20) * mm] for k in range(21)]}
doc = {'medium': 'ink', 'sheetMm': W * mm, 'heightMm': H * mm, 'strokes': [st(0, 'outline', (110, 200), (490, 200)),
       st(1, 'outline', (600, 320), (600, 580)), st(2, 'hatch', (150, 500), (400, 700))]}
json.dump(doc, open(os.path.join(D, 'tv.json'), 'w'))
subprocess.run([sys.executable, os.path.join(HERE, 'tag-medium.py'), os.path.join(D, 'tv.json'), os.path.join(D, 'tsrc.png')], check=True, capture_output=True)
t = json.load(open(os.path.join(D, 'tv.json')))['strokes']
out['tag'] = ['drop' if q.get('drop') else q['medium'] for q in t]
print(json.dumps(out))
