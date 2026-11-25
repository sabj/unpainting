# pick.py [ID...]: (it was segaudit/pick.py in the preparation folder, outside git, until 0.4 rc7; writes $UNPAINT_PREP/segaudit/pick.json, or PICK_JSON)
# choose each subject's block-in study seed by one automatic rule, the same for every subject.
#
# Candidates: the study SET (s3L8 block-in, s1L8 and s4L8 richer) made at each seed 42, 7 and 11, all on RunPod (diffusers bf16):
# where a seed-42 study was made on the Mac (mflux), its RunPod twin (-s42r) stands for seed 42. A set counts only when all three
# prompts exist. Two prompt sets compete: the standard s3/s1/s4 and the stricter s3c/s1c/s4c (guides/prompts/, Neon's texts of
# 21 Nov 02:29), wherever a subject has them; a candidate is a (seed, prompt set) pair. A detail subject's source is its cut.
# Both pictures are first put on their own paper (each RGB channel divided by its 99.5th percentile, so a buff sheet and
# a white study compare as paper to paper), blurred at 10 mm of sheet (sigma 4.25 mm on the subject's own sheet, as studies/README.md
# dE10), and compared in Lab:
#   dE10       mean colour difference (CIE76)
#   r          value structure: correlation of the blurred lightness of study and picture
#   within     share of the picture (%) whose study colour is within 10 dE
#   invented   share (%) in connected patches of at least 0.5% of the sheet where the study is 25 dE or more off
#   falseWhite share (%) the study leaves as paper (L* 93+) where the picture is a tint at least 12 L* below its own paper
#   falseDark  share (%) the study lays 25 L* or more darker than the picture
#   unmatched  share (%) of the study's shape edges (read at 2 mm blur) with no edge in the picture near them: the boundary of a
#              shape the picture does not have (an invented horizon, band or shoreline; the per-pixel 'invented' misses it when
#              the 10 mm blur brings the colours within 25). Added 21 Nov 04:00 after homer-guide's invented lake horizon.
#   chroma     the study's mean and 90th-percentile chroma (Lab, at 2 mm) over the picture's. A set whose block-in (s3 role) is under
#              CHROMA_MIN of the picture's on either is REJECTED, whatever its penalty: a grey study of a coloured picture makes the
#              painter paint it grey (homer-guide's s3c, 21 Nov 04:10).
#   flat       the block-in (s3 role) must be a block-in, not a copy: the share of the sheet that is locally flat (L std under 2
#              in a 5 px window at 400 px across) must exceed the picture's own share by FLAT_GAIN, or the set is REJECTED
#              (Astra's prompts without the monochrome clause came back as near copies and scored best, 21 Nov 04:20).
#   value      raw L* (no paper normalisation) at 400 px: valueDiff = mean |study - picture| over the 10th, 25th and 50th percentiles;
#              paintedRatio = the study's share below its own paper (p99 L* - 8) over the picture's. A set whose block-in (s3 role)
#              has valueDiff over VALUE_MAX or paintedRatio outside PAINTED_RANGE is REJECTED; every study adds 0.5 valueDiff to its
#              penalty (tiepolo-bacchus's s3 was 21 L* darker and painted 38% of the sheet against 25%: the plate came out heavy, 21 Nov).
# Penalty of one study = dE10 + 20 (1 - r) + 0.5 (invented + falseWhite + falseDark + unmatched). Penalty of a set = 0.5 s3L8 + 0.25 s1L8
# + 0.25 s4L8 (the planner reads the block-in first; the other two add shadows and accents). The lowest penalty wins.
# Writes pick.json (all scores, the choice) and prints one line per subject.
import os, sys, json
import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.color import rgb2lab
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pick_subjects import R, SUBJ, SEEDS, study
# Seams (23 Nov 2026): a study with white outlines round its shapes, or a bare paper border round the sheet, is charged for what it has more of
# than the picture: tools/seg/study-seams.py (its header gives the measure and the weights). Added to each study's penalty.
import importlib.util as _iu
_sp = _iu.spec_from_file_location('study_seams', os.path.join(os.path.dirname(os.path.dirname(HERE)), 'tools', 'seg', 'study-seams.py'))
SEAMS = _iu.module_from_spec(_sp); _sp.loader.exec_module(SEAMS)
PROMPTS = (('s3L8', 0.5), ('s1L8', 0.25), ('s4L8', 0.25))
CHROMA_MIN = 0.5
VALUE_MAX = 10.0
PAINTED_RANGE = (0.7, 1.4)
def value_stats(im, W, H):
    L = rgb2lab(np.asarray(im.convert('RGB').resize((W, H), Image.LANCZOS)) / 255.0)[..., 0]
    return np.percentile(L, [10, 25, 50]), float((L < np.percentile(L, 99) - 8).mean())
FLAT_GAIN = 0.2
def flat_share(im, W, H):
    a = np.asarray(im.convert('L').resize((W, H), Image.LANCZOS)).astype(float)
    m = ndimage.uniform_filter(a, 5); v = ndimage.uniform_filter(a * a, 5) - m * m
    return float((np.sqrt(np.maximum(v, 0)) < 2.0).mean())
SETS = {'std': ('s3L8', 's1L8', 's4L8'), 'strict': ('s3cL8', 's1cL8', 's4cL8'), 'astra': ('s3aL8', 's1aL8', 's4aL8'), 'astra-m': ('s3mL8', 's1mL8', 's4mL8'), 'strict-n': ('s3nL8', 's1nL8', 's4nL8'), 'value-v': ('s3vL8', 's1vL8', 's4vL8'), 'value-w': ('s3wL8', 's1wL8', 's4wL8')}   # the strict set stands in the same roles
def prep(im, W, H, sig):
    a = np.asarray(im.convert('RGB').resize((W, H), Image.LANCZOS)).astype(float) / 255
    a = np.clip(a / np.maximum(np.percentile(a.reshape(-1, 3), 99.5, axis=0), 1e-3), 0, 1)
    a = np.stack([ndimage.gaussian_filter(a[..., c], sig) for c in range(3)], -1); return rgb2lab(a)
def shapes_unmatched(Sf, Pf):
    """Sf, Pf: the study and the picture in Lab at 2 mm blur. Share (%) of the study's shape edges (colour steps between its flat
    shapes, away from the sheet's border) that have no edge in the picture within 4 px (at 400 px across): an edge the picture does
    not have bounds a shape the picture does not have (an invented horizon, band or shoreline). The picture's edge must be at
    least 0.35 of the study's step there, so a global colour shift or a softened edge does not count."""
    g = lambda A: np.sqrt(sum(ndimage.sobel(A[..., c], 0) ** 2 + ndimage.sobel(A[..., c], 1) ** 2 for c in range(3))) / 8
    gS = g(Sf); gP = ndimage.maximum_filter(g(Pf), 9)
    b = np.zeros_like(gS, bool); b[4:-4, 4:-4] = True
    e = (gS > 2.5) & b
    return float((e & (gP < 0.35 * gS)).sum() / max(e.sum(), 1) * 100)
def score(S, P, Sf=None, Pf=None, Sv=None, Pv=None):
    d = np.sqrt(((S - P) ** 2).sum(-1)); n = d.size
    r = float(np.corrcoef(S[..., 0].ravel(), P[..., 0].ravel())[0, 1])
    lab, k = ndimage.label(d >= 25); sz = np.bincount(lab.ravel()); inv = float(sum(s for i, s in enumerate(sz) if i and s >= 0.005 * n) / n * 100)
    pp = np.percentile(P[..., 0], 99); fw = float(((S[..., 0] >= 93) & (P[..., 0] < pp - 12)).mean() * 100); fd = float(((P[..., 0] - S[..., 0]) >= 25).mean() * 100)
    um = shapes_unmatched(Sf, Pf) if Sf is not None else 0.0
    ch = {}
    if Sf is not None:
        cS, cP = np.hypot(Sf[..., 1], Sf[..., 2]), np.hypot(Pf[..., 1], Pf[..., 2])
        ch = dict(chromaMean=float(cS.mean() / max(cP.mean(), 1e-3)), chromaP90=float(np.percentile(cS, 90) / max(np.percentile(cP, 90), 1e-3)))
    m = dict(dE10=float(d.mean()), r=r, within=float((d < 10).mean() * 100), invented=inv, falseWhite=fw, falseDark=fd, unmatched=um, **ch)
    if Sv is not None:
        m['valueDiff'] = float(np.abs(Sv[0] - Pv[0]).mean()); m['paintedRatio'] = float(Sv[1] / max(Pv[1], 1e-3))
    m['penalty'] = m['dE10'] + 20 * (1 - r) + 0.5 * (inv + fw + fd + um) + 0.5 * m.get('valueDiff', 0)
    return {k: round(v, 2) for k, v in m.items()}
if __name__ == '__main__':
    only = sys.argv[1:]; out = {}
    for sj in SUBJ:
        name, fid = sj['name'], sj['id']
        if only and name not in only and fid not in only: continue
        p = Image.open(sj['image']); W = 400; H = round(p.height * W / p.width); sig = 4.25 / (sj['mm'] / W)
        PM = SEAMS.measure(p); flatP = flat_share(p, W, H); Pv = value_stats(p, W, H); P = prep(p, W, H, sig); sig2 = 2 / (sj['mm'] / W); Pf = prep(p, W, H, sig2); sets = {}
        for seed, pset in [(sd, ps) for ps in SETS for sd in SEEDS]:
            key = seed if pset == 'std' else f'{seed}-{pset}'
            fs = {k: study(sj, ks, seed) for (k, _), ks in zip(PROMPTS, SETS[pset])}
            if not all(os.path.exists(f) for f in fs.values()):
                if any(os.path.exists(f) for f in fs.values()): sets[key] = {'incomplete': [k for k, f in fs.items() if not os.path.exists(f)]}
                continue
            per = {k: score(prep(Image.open(f), W, H, sig), P, prep(Image.open(f), W, H, sig2), Pf, value_stats(Image.open(f), W, H), Pv) for k, f in fs.items()}
            low = [k for k, v in per.items() if k == 's3L8' and min(v.get('chromaMean', 1), v.get('chromaP90', 1)) < CHROMA_MIN]   # the colour the planner paints from
            for k_, f_ in fs.items():
                sm_ = SEAMS.measure(Image.open(f_)); pen_ = SEAMS.penalty(sm_, PM)
                per[k_].update(seamLength=sm_['seamLength'], borderShare=sm_['borderShare'], seamPenalty=pen_); per[k_]['penalty'] = round(per[k_]['penalty'] + pen_, 2)
            v3 = per['s3L8']
            if v3['valueDiff'] > VALUE_MAX or not (PAINTED_RANGE[0] <= v3['paintedRatio'] <= PAINTED_RANGE[1]):
                low.append('s3L8 values off the picture (quantile difference %.1f L*, painted ratio %.2f)' % (v3['valueDiff'], v3['paintedRatio']))
            fl = flat_share(Image.open(fs['s3L8']), W, H); per['s3L8']['flatGain'] = round(fl - flatP, 3)
            if fl - flatP < FLAT_GAIN: low.append('s3L8 not a block-in (flat share %.2f against the picture\'s %.2f)' % (fl, flatP))
            sets[key] = {'seed': seed, 'promptSet': pset, **({'rejected': '; '.join(low)} if low else {}), 'studies': per, 'files': {k: os.path.relpath(f, R) for k, f in fs.items()}, 'penalty': round(sum(w * per[k]['penalty'] for k, w in PROMPTS), 2)}
        ok = {s: v for s, v in sets.items() if 'penalty' in v and 'rejected' not in v}
        best = min(ok, key=lambda s: ok[s]['penalty']) if ok else None
        out[name] = {'id': fid, 'inputId': sj['iid'], 'image': os.path.relpath(sj['image'], R), 'sets': sets, 'chosen': best, 'changes': best not in (None, '42'), 'scored_on': 'its source'}
        print(f"{name:20s} chosen {best}  " + '  '.join(f"{s}: {v['penalty'] if 'penalty' in v else 'incomplete'}{' REJECTED' if 'rejected' in v else ''}" for s, v in sets.items()), flush=True)
    PJ = os.environ.get('PICK_JSON') or R + '/segaudit/pick.json'   # PICK_JSON: write a separate file (a partial run must not replace the whole pick.json)
    json.dump(out, open(PJ, 'w'), indent=1)
