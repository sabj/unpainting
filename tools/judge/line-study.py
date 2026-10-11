#!/usr/bin/env python3
"""Post-render diagnostics, never input to a painting. See work/lines/REPORT.md.

python tools/judge/line-study.py [work/lines]
Expected: send/targets, selected/*-lines.json, runs/final/<subject>-{baseline,pen,wash}.
Requires numpy and OpenCV. Fails on incomplete runs or target-guard violations.
"""
import hashlib
import json
from pathlib import Path
import argparse
import cv2
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('work', nargs='?', default='work/lines')
parser.add_argument('--pen-only', action='store_true', help='measure dry drawings before the wash batch')
args = parser.parse_args()
root = Path(args.work)
variants = ['baseline', 'pen'] if args.pen_only else ['baseline', 'pen', 'wash']
rows = []
for target in sorted((root/'send/targets').glob('*.png')):
    key = target.stem
    source = cv2.imread(str(target))
    H, W = source.shape[:2]
    drawing = cv2.imread(str(root/'runs/final'/f'{key}-pen'/'painting.png'))
    if drawing is None:
        raise ValueError(f'Missing actual drawing: {key}')
    h, w = drawing.shape[:2]
    grey = cv2.cvtColor(cv2.resize(source, (w, h)), cv2.COLOR_BGR2GRAY)/255.
    mean = cv2.GaussianBlur(grey, (0, 0), 3)
    var = np.maximum(0, cv2.GaussianBlur(grey*grey, (0, 0), 3)-mean*mean)
    grad = np.hypot(cv2.Sobel(grey, cv2.CV_64F, 1, 0, ksize=3),
                    cv2.Sobel(grey, cv2.CV_64F, 0, 1, ksize=3))/4
    edge = cv2.dilate((grad > .06).astype('uint8'), np.ones((3, 3), 'uint8'))
    row = {'subject': key, 'sourceSize': [W, H], 'nativeSize': [w, h]}
    for variant in variants:
        directory = root/'runs/final'/f'{key}-{variant}'
        if not (directory/'painting.png').exists():
            raise ValueError(f'Missing actual painting: {key}-{variant}')
        guard = json.loads((directory/'target-guard.json').read_text())
        assert guard.get('requestedMode') == 'strict' and guard['violations'] == 0, directory
        if variant == 'wash':
            row[variant] = {'strictRequested': True, 'violations': 0}
            continue
        audit = json.loads((directory/'pen-state-audit.json').read_text())
        linefile = directory/'source-ink-lines.json' if variant == 'baseline' else root/'selected'/f'{key}-lines.json'
        doc = json.loads(linefile.read_text())
        if variant == 'pen':
            assert doc['targetSHA256'] == hashlib.sha256(target.read_bytes()).hexdigest(), key
        scale = [w/doc['image']['w'], h/doc['image']['h']]
        lengths, support, flat, dark = [], [], [], []
        for g in doc['lines']:
            points = np.array(g['points'], float)*scale
            distances = np.linalg.norm(np.diff(points, axis=0), axis=1)
            lengths.append(float(sum(distances)))
            q = np.concatenate([np.linspace(a, b, max(2, int(np.ceil(length))+1))
                                for a, b, length in zip(points[:-1], points[1:], distances)])
            xy = np.rint(q).astype(int)
            x, y = np.clip(xy[:, 0], 0, w-1), np.clip(xy[:, 1], 0, h-1)
            support.extend(edge[y, x].tolist())
            # Fixed thresholds across both methods; separate from the planner's
            # contrast-aware acceptance, to avoid grading by its own criterion.
            flat.extend((var[y, x] < .00035).tolist())
            dark.extend(((mean[y, x] < .25) & (edge[y, x] == 0)).tolist())
        widths = np.array([x for a in audit for x in a.get('contactWidthMm', [])])
        executed = np.array([a['pathLengthMm'] for a in audit])*w/152.4
        assert np.all(np.isfinite(executed)) and len(executed), key
        row[variant] = {
            'plannedPaths': len(lengths), 'executedGestures': len(audit),
            'meanExecutedLengthPx': round(float(np.mean(executed)), 2),
            'meanPlannedLengthPx': round(float(np.mean(lengths)), 2),
            'medianPlannedLengthPx': round(float(np.median(lengths)), 2),
            'edgeSupportProxy': round(float(np.mean(support)), 4),
            'flatShare': round(float(np.mean(flat)), 4),
            'darkInteriorShare': round(float(np.mean(dark)), 4),
            'contactWidthMmMin': round(float(widths.min()), 4),
            'contactWidthMmMax': round(float(widths.max()), 4),
            'contactWidthCV': round(float(widths.std()/widths.mean()), 4),
            'strictRequested': True, 'violations': 0,
        }
    rows.append(row)
(root/'metrics.json').write_text(json.dumps({
    'note': 'Post-render evaluation only. Executed length comes from physical pen paths before contact, including reload splits. Planned length is before those splits. Edge support is a gradient proxy, not semantic structural-edge annotation. Flat/dark shares sample planned paths. Width CV measures executed contact, not optical thickness. All runs use 152.4 mm sheet width.',
    'subjects': rows,
}, indent=2)+'\n')
print(f'Checked {len(rows)} matched subjects and {len(variants)*len(rows)} strict-guard runs.')
