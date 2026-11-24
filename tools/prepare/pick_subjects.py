# The subjects and the one set of settings the audit plans them with, read from SUBJECTS.json (the manifest):
# its sheet rule (0.26 mm a cell, long side = min(source px, 1462), never enlarged), its crop windows for detail subjects,
# its painter options (common + line + paper), and its studies stack s3L8:6,s1L8:4,s4L8:2. --things is the subject's
# labels. A detail subject's source is its cut; nothing is cut from whole-picture inputs. No drawing is laid: the shapes and masses are read from the study alone.
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prep_root import prep_root
R = prep_root()
HERE = os.path.dirname(os.path.abspath(__file__))
M = json.load(open(os.environ.get('SUBJECTS_JSON') or R + '/SUBJECTS.json'))   # SUBJECTS_JSON: a candidate manifest, before a repin
STACK = [('s3L8', 6), ('s1L8', 4), ('s4L8', 2)]
SEEDS = ('42', '7', '11')
# seed-42 studies made on the Mac (mflux 8-bit): their RunPod twin (-s42r, same seed, same backend as seeds 7 and 11) stands
# for seed 42, so all three candidates come from one backend
MAC42 = {k: tuple(v) for k, v in json.load(open(os.path.join(HERE, 'subjects-table.json')))['MAC42'].items()}
def subjects():
    out = []
    for s in M['subjects']:
        # no crop path: a detail subject's source is its cut (make-subjects.py CUT_FROM); a manifest written before that change still
        # carries a crop record, which is ignored here
        img = R + '/' + s['source']['path']
        o = s['options']
        out.append(dict(name=s['name'], id=s['id'], iid=s.get('inputId', s['id']), image=img, cells=s['sheet']['cellsAcross']['full'], mm=s['sheet']['widthMm'],
                        crop=None, labels=R + '/' + s['labels']['path'] if s['labels'].get('sha256') else None,
                        options=o['common'] + o['line'] + o['paper'], toned=s['paper'].get('toned')))
    return out
SUBJ = subjects()
def by(key): return next(s for s in SUBJ if key in (s['name'], s['id']))
def study(s, k, seed='42', mac=True):
    """The study file for subject dict s, prompt k (s3L8, s1L8, s4L8, or the stricter s3cL8, s1cL8, s4cL8), seed '42' | '7' | '11'.
    Files are named by the subject's input id: studies/<iid>-study-<k>-s<seed>.png; seed 42 may have no suffix, and where it was
    made on the Mac its RunPod twin (-s42r) stands for it. A detail subject is a picture like any other: no file is cut from another."""
    base = f"{R}/studies/{s['iid']}-study-{k}"
    if seed == '42' and mac and s['iid'] in MAC42 and k in MAC42[s['iid']]: return base + '-s42r.png'
    f = f'{base}-s{seed}.png'
    return f if (seed != '42' or os.path.exists(f)) else base + '.png'
def crop_labels(s):
    """The subject's thing labels (kept for callers; a detail subject's labels are made from its own source, never cut)."""
    return s['labels']
