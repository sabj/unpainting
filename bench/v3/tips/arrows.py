#!/usr/bin/env python3
"""arrows.py STROKES.jsonl.gz PICTURE.png OUT.png   The stroke paths of a worked example drawn over its dried result:
one arrow a stroke, numbered in the order laid, the line wider where the pressure was higher. Twice the picture's size."""
import gzip, json, math, sys
from PIL import Image, ImageDraw
log, pic, out = sys.argv[1:4]; K = 2
im = Image.open(pic).convert('RGB'); im = im.resize((im.width * K, im.height * K), Image.LANCZOS)
im = Image.blend(im, Image.new('RGB', im.size, 'white'), 0.35); d = ImageDraw.Draw(im)
n = 0
for line in gzip.open(log, 'rt'):
    e = json.loads(line)
    if 'tool' not in e: continue
    n += 1; pts = [(q['x'] * K, q['y'] * K, q.get('p') or 0.6) for q in e['pts']]; col = (20, 20, 20) if e['tool'] == 'brush' else (150, 30, 30)
    for (x0, y0, p0), (x1, y1, p1) in zip(pts, pts[1:]): d.line([(x0, y0), (x1, y1)], fill=col, width=max(1, round(1 + 3 * (p0 + p1) / 2)))
    (x0, y0, _), (x1, y1, _) = pts[-2], pts[-1]; a = math.atan2(y1 - y0, x1 - x0)
    d.polygon([(x1 + 9 * math.cos(a), y1 + 9 * math.sin(a)), (x1 + 8 * math.cos(a + 2.5), y1 + 8 * math.sin(a + 2.5)), (x1 + 8 * math.cos(a - 2.5), y1 + 8 * math.sin(a - 2.5))], fill=col)
    d.ellipse([pts[0][0] - 3, pts[0][1] - 3, pts[0][0] + 3, pts[0][1] + 3], fill='white', outline=col)
    d.text((pts[0][0] + 5, pts[0][1] - 12), str(n), fill=(0, 0, 160))
im.save(out)
