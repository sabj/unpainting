"""Offline ink scorecard. Requires a finished run with --marks 1; never used by painting.
Geometric replay of executed pen paths, not inferred dark pixels or planned lines.
"""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import cv2
import numpy as np
from scipy.spatial import cKDTree
from scipy.ndimage import map_coordinates
from skimage.morphology import skeletonize


def samples(paths, step=.25):
    xy, tangents, ids, weights = [], [], [], []
    for i, p in enumerate(paths):
        for a, b in zip(p[:-1], p[1:]):
            delta = b-a
            length = float(np.linalg.norm(delta))
            if not length:
                continue
            n = max(1, int(np.ceil(length/step)))
            for t in (np.arange(n)+.5)/n:
                xy.append(a+t*delta); tangents.append(delta/length)
                ids.append(i); weights.append(length/n)
    return np.array(xy).reshape(-1, 2), np.array(tangents).reshape(-1, 2), np.array(ids), np.array(weights)


def measure(paths, reference, mm, mass=None):
    xy, tangent, ids, weight = samples(paths)
    ref = np.argwhere(skeletonize(reference))[:, ::-1]
    field = cv2.distanceTransform((~skeletonize(reference)).astype(np.uint8), cv2.DIST_L2, cv2.DIST_MASK_PRECISE) if len(ref) else np.full(reference.shape, np.inf)
    distance = map_coordinates(field, xy[:, ::-1].T, order=1, mode='nearest') if len(xy) else np.array([])
    hit = distance*mm <= 1
    total = float(weight.sum())
    lengths = [float(np.linalg.norm(np.diff(p, axis=0), axis=1).sum())*mm for p in paths]
    tort = [length/max(float(np.linalg.norm(p[-1]-p[0]))*mm, mm/4) for p, length in zip(paths, lengths) if length > 0]
    duplicate = np.zeros(len(xy), bool)
    if len(xy):
        tree = cKDTree(xy)
        # Same line's near neighbours never count. Parallel means within 15 degrees, undirected.
        parallel_cos = np.cos(np.pi/12)
        for start in range(0, len(xy), 512):
            for offset, neighbours in enumerate(tree.query_ball_point(xy[start:start+512], 1/mm)):
                i = start+offset
                duplicate[i] = any(ids[j] != ids[i] and abs(float(tangent[i]@tangent[j])) >= parallel_cos for j in neighbours)
    def share(mask):
        return float(weight[mask].sum()/total) if total else None
    inside = np.zeros(len(xy), bool)
    if mass is not None and len(xy):
        q = np.rint(xy).astype(int); q[:, 0] = q[:, 0].clip(0, mass.shape[1]-1); q[:, 1] = q[:, 1].clip(0, mass.shape[0]-1)
        inside = mass[q[:, 1], q[:, 0]]
    recall = 0.0 if len(ref) else None
    if len(ref) and len(xy):
        # Project onto the sampled segment, avoiding a half-sample error at the 1 mm boundary.
        _, nearest = cKDTree(xy).query(ref)
        delta = ref-xy[nearest]
        along = np.sum(delta*tangent[nearest], axis=1).clip(-weight[nearest]/2, weight[nearest]/2)
        recall = float(np.mean(np.linalg.norm(delta-along[:, None]*tangent[nearest], axis=1)*mm <= 1+1e-9))
    return dict(precision=share(hit), recall=recall, fragmentShare=float(np.mean(np.array(lengths)<5)) if lengths else None,
                tortuosityMedian=float(np.median(tort)) if tort else None, tortuosityP90=float(np.percentile(tort, 90)) if tort else None,
                duplicatedParallelShare=share(duplicate), inventedShare=share(~hit), inventedInMassShare=share(~hit & inside),
                penLengthMm=total*mm, penLines=len(paths)), (xy, hit)


def extract(tape):
    ink, paths, widths = {}, [], []
    pigments = tape['pigments']
    for m in tape['marks']:
        if m['k'] == 'D':
            used = [pigments[i].get('name', '').lower() for i, v in enumerate(m['ink']) if v > 0]
            if not used:
                raise ValueError('Pen dip has no pigment')
            ink[m['pen']] = not any('graphite' in name or 'pencil' in name for name in used)
        if m['k'] != 'P':
            continue
        if m['pen'] not in ink:
            raise ValueError('Pen stroke without recorded dip: cannot distinguish graphite')
        if not ink[m['pen']]:
            continue
        res = m.get('r', 1)
        points = m.get('points') or [dict(x=q[0]/10, y=q[1]/10, p=q[2]/100) for q in m['d']]
        p = np.array([[q['x']/res, q['y']/res] for q in points])
        if len(p) < 2:
            continue
        paths.append(p)
        opts = tape['penOpts'][tape['pens'][m['pen']]]
        widths.append([q.get('nw', opts['nib']+opts['flex']*max(0, q.get('p', .5)))/res for q in points])
    return paths, widths


def clip_paths(paths, widths, w, h):
    """Clip centreline segments to the sheet, retaining their interpolated contact widths."""
    result, result_widths = [], []
    for path, ws in zip(paths, widths):
        current, cw = [], []
        for i, (a, b) in enumerate(zip(path[:-1], path[1:])):
            delta = b-a
            low, high = 0., 1.
            for axis, limit in [(0, w-1), (1, h-1)]:
                if delta[axis] == 0:
                    if not 0 <= a[axis] <= limit:
                        high = -1
                else:
                    u, v = sorted([-a[axis]/delta[axis], (limit-a[axis])/delta[axis]])
                    low, high = max(low, u), min(high, v)
            if low >= high:
                if current:
                    result.append(np.array(current)); result_widths.append(cw)
                    current, cw = [], []
                continue
            start, end = a+low*delta, a+high*delta
            if current and np.linalg.norm(current[-1]-start) > 1e-8:
                result.append(np.array(current)); result_widths.append(cw)
                current, cw = [], []
            if not current:
                current.append(start); cw.append(ws[i]+low*(ws[i+1]-ws[i]))
            current.append(end); cw.append(ws[i]+high*(ws[i+1]-ws[i]))
        if current:
            result.append(np.array(current)); result_widths.append(cw)
    return result, result_widths


def line_model(target, cache):
    os.environ['HF_HOME'] = str(cache)
    os.environ['HF_HUB_OFFLINE'] = '1'
    import torch
    from controlnet_aux import LineartDetector, HEDdetector, PidiNetDetector
    from PIL import Image
    torch.set_num_threads(2)
    errors = []
    for cls in [LineartDetector, HEDdetector, PidiNetDetector]:
        try:
            detector = cls.from_pretrained('lllyasviel/Annotators')
            result = np.array(detector(Image.fromarray(cv2.cvtColor(target, cv2.COLOR_BGR2RGB))))
            if result.ndim == 3:
                result = cv2.cvtColor(result, cv2.COLOR_RGB2GRAY)
            # controlnet_aux's public detector APIs all return bright lines on black.
            result = 255-result
            return cv2.resize(result, (target.shape[1], target.shape[0])), cls.__name__, errors
        except Exception as e:
            errors.append(f'{cls.__name__}: {e}')
    raise RuntimeError('No trained line model available: '+'; '.join(errors))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('run', type=Path); ap.add_argument('target', type=Path)
    ap.add_argument('--out', required=True, type=Path)
    ap.add_argument('--models', type=Path, default=Path('work/line-models/hf'))
    a = ap.parse_args()
    run = a.run.resolve(); out = a.out.resolve()
    if out == run or run in out.parents:
        ap.error('Output must be outside the finished run')
    card = json.loads((run/'run-card.json').read_text())
    target_hash = hashlib.sha256(a.target.read_bytes()).hexdigest()
    if target_hash != card['targetSHA256']:
        raise ValueError('Target SHA256 differs from finished run')
    plate = cv2.imread(str(run/'painting.png'))
    if plate is None:
        raise ValueError('Finished painting.png missing')
    tape_file = next((run/name for name in ['marks.json', 'marks.json.gz'] if (run/name).exists()), None)
    if tape_file is None:
        raise ValueError('Missing executed pen tape; rerender with --marks 1 (planned stage lines are not execution evidence)')
    opener = gzip.open if tape_file.suffix == '.gz' else open
    with opener(tape_file, 'rt') as f:
        tape = json.load(f)
    h, w = plate.shape[:2]
    mm = float(tape['sheetWidthMm'])/w
    if not np.isfinite(mm) or mm <= 0:
        raise ValueError('Invalid physical sheet width')
    paths, widths = extract(tape)
    sx, sy = w/tape['w'], h/tape['h']
    paths = [p*np.array([sx, sy]) for p in paths]
    executed_count = len(paths)
    paths, widths = clip_paths(paths, widths, w, h)
    target = cv2.resize(cv2.imread(str(a.target)), (w, h))
    line, model, failures = line_model(target, a.models.resolve())
    # Otsu selects the foreground of the model map; no plate-specific fitted threshold.
    _, ref = cv2.threshold(line, 0, 255, cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)
    grey = cv2.cvtColor(target, cv2.COLOR_BGR2GRAY)
    sigma = max(1, 5/mm)  # wash/shadow masses at 5 mm scale
    blurred = cv2.GaussianBlur(grey, (0, 0), sigma)
    _, mass = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)
    metrics, (xy, hit) = measure(paths, ref > 0, mm, mass > 0)
    area = w*h*mm*mm/100
    metrics['penLengthMmPer100cm2'] = metrics['penLengthMm']*100/area
    metrics['penStrokesPer100cm2'] = executed_count*100/area
    metrics['allStrokesPer100cm2'] = sum(m['k'] in ['P', 's'] for m in tape['marks'])*100/area
    canvas = np.full((h, w), 255, np.uint8)
    for p, widths_i in zip(paths, widths):
        for i in range(len(p)-1):
            cv2.line(canvas, tuple(np.rint(p[i]).astype(int)), tuple(np.rint(p[i+1]).astype(int)), 0, max(1, round((widths_i[i]+widths_i[i+1])*sx/2)), cv2.LINE_AA)
    ink = canvas < 128
    dt = cv2.distanceTransform((~ink).astype(np.uint8), cv2.DIST_L2, cv2.DIST_MASK_PRECISE) if ink.any() else np.full((h, w), np.inf)
    dr = cv2.distanceTransform((ref == 0).astype(np.uint8), cv2.DIST_L2, cv2.DIST_MASK_PRECISE) if ref.any() else np.full((h, w), np.inf)
    overlay = np.full((h, w, 3), 255, np.uint8)
    overlay[(ref > 0) & (dt*mm > 1)] = (255, 0, 0)
    overlay[ink & (dr*mm > 1)] = (0, 0, 255)
    overlay[ink & (dr*mm <= 1)] = (0, 150, 0)
    out.mkdir(parents=True, exist_ok=True)
    for name, image in [('target', target), ('target-lines', line), ('ink', canvas), ('overlay', overlay)]:
        cv2.imwrite(str(out/(name+'.png')), image)
    panels = [target, cv2.cvtColor(line, cv2.COLOR_GRAY2BGR), cv2.cvtColor(canvas, cv2.COLOR_GRAY2BGR), overlay]
    labels = ['Target', model, 'Executed pen geometry on white', 'Hit green / invented red / missed blue']
    panels = [cv2.copyMakeBorder(p, 30, 0, 0, 0, cv2.BORDER_CONSTANT, value=(255,255,255)) for p in panels]
    for p, label in zip(panels, labels):
        cv2.putText(p, label, (5, 20), cv2.FONT_HERSHEY_SIMPLEX, .42, (0,0,0), 1)
    cv2.imwrite(str(out/'sheet.jpg'), np.hstack(panels), [cv2.IMWRITE_JPEG_QUALITY, 90])
    result = dict(version=1, run=str(run), target=str(a.target.resolve()), targetSHA256=target_hash,
                  mode='strict' if '--notargetlooks' in card['args'] and card['args'][card['args'].index('--notargetlooks')+1]=='1' else 'default',
                  model=model, modelFailures=failures,
                  tapeSHA256=hashlib.sha256(tape_file.read_bytes()).hexdigest(),
                  runCardSHA256=hashlib.sha256((run/'run-card.json').read_bytes()).hexdigest(), sheetWidthMm=w*mm, width=w, height=h,
                  extraction='Executed pen geometry replay, recorded nib widths; excludes graphite dips; not pigment transport replay', metrics=metrics)
    (out/'score.json').write_text(json.dumps(result, indent=2, allow_nan=False)+'\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
