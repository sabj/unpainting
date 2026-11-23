#!/usr/bin/env python3
"""Writes ../PENCIL-CONTROL.md from the verdicts in judge/ and the round's own (../judge, ../judge-fulldrawing)."""
import hashlib, json, os, time
HERE = os.path.dirname(os.path.abspath(__file__)); AU = os.path.dirname(HERE); FIX = os.path.dirname(AU)
def load(f):
    try: return json.load(open(f))
    except Exception: return None
def sha(f):
    try: return hashlib.sha256(open(f, 'rb').read()).hexdigest()[:12]
    except OSError: return None
SUBJECTS = {'mittens-closeup': 'Mittens close-up', 'white-ships': 'White Ships'}
LIGHT = {'mittens-closeup': ['argon', 'opus'], 'white-ships': ['argon', 'astra']}
NAMES = {'opus': 'Opus', 'astra': 'Astra', 'argon': 'Gemini'}
def score(d):
    if not d or not d.get('complete'): return None
    return tuple(d['questions'][q]['painting'] for q in ('faithful', 'skill'))
def word(p): return 'win' if p > 0.62 else 'loss' if p < 0.38 else 'tie'
def cell(sc): return 'not judged yet | ' if sc is None else f'{round(sc[0] * 100)}% {word(sc[0])} | {round(sc[1] * 100)}% {word(sc[1])}'
def lines_of(s, k):
    r = (load(os.path.join(AU, 'L2', f'{s}--{k}', 'run.json')) or {}).get('author', {}).get('session', {}).get('submitted', {}).get('tools') or {}
    l = (r.get('record') or {}).get('lines')
    return f"{l['before']} of {l['strokes']} lines, {l['paler']} paler, {l['darker']} darker" if l else 'the standard drawing, unchanged'
L = ['# Pencil control: does the drawing alone move the whole-sheet judge?', '',
     f'Written {time.strftime("%H:%M, %d %b")} by `auth/pencil-control/table.py`. Judge: qwen3.8-flash-next:125b-mlx, local, whole sheets with the source shown, each question asked with the two sheets in both orders (position habit taken out). Every painting is full size at 66690c4f, painted on pods.',
     'Each number is the chance the judge prefers the FIRST-named painting; 38% to 62% is a tie. Faithful and skill are separate questions and are never combined.', '']
moves = {'auto': [], 'own': [], 'vsauto': []}
for s, sname in SUBJECTS.items():
    auto = os.path.join(FIX, f'paint-auth-66690c4f-auto-{s}--auto')
    L += [f'## {sname}', '', 'The drawings: standard = the full standard drawing Auto lays. ' + '; '.join(f"{NAMES[k]}'s lines = {lines_of(s, k)}" for k in ('opus', 'astra', 'argon')) + '.', '']
    # washes unchanged: the control's wash plan as the painter resolved it, against Auto's
    for k in LIGHT[s]:
        c = os.path.join(FIX, f'paint-control-66690c4f-auto-{s}--{k}-lines'); r = load(os.path.join(c, 'run.json'))
        if not r: L.append(f"- Auto with {NAMES[k]}'s lines: not landed yet."); continue
        a, b = sha(os.path.join(auto, 'plate', 'value-plan.json')), sha(os.path.join(c, 'plate', 'value-plan.json'))
        be = load(os.path.join(c, 'plate', 'backend.json')) or {}
        plan = "the same bytes as Auto's" if a == b else 'value-plan.json ' + str(b) + ' against Auto ' + str(a) + ': CHECK'
        laid = ((r.get('author', {}).get('tools') or {}).get('lines') or {}).get('before', '?')
        L.append(f"- Auto with {NAMES[k]}'s lines (`{os.path.basename(c)}`): " + (f"FAILED: {r['failure']}" if r.get('failure') else f"commit {r['code']['commit'][:8]}, {r['sheet']['cells']} cells, backend {be.get('backend', '?')}; wash plan {plan}; drawing: {laid} lines laid."))
    L += ['', '| First | Second | What differs | Faithful | Skill |', '|---|---|---|---|---|']
    for k in LIGHT[s]:
        sc = score(load(os.path.join(HERE, 'judge', f'{s}--auto-{k}lines-vs-auto-standard.json')))
        L.append(f"| Auto, {NAMES[k]}'s lighter lines | Auto, standard drawing | the drawing only | {cell(sc)} |")
        if sc: moves['auto'].append((s, k, sc))
    for k in ('opus', 'astra', 'argon'):
        sc = score(load(os.path.join(HERE, 'judge', f'{s}--{k}-lines-vs-{k}-fulldrawing.json')))
        same = lines_of(s, k).startswith('the standard')
        L.append(f"| {NAMES[k]} L2, its own lines | {NAMES[k]} L2, standard drawing | {'NOTHING: it handed over the standard drawing, so this is two paintings of the same thing (the noise floor)' if same else 'the drawing only'} | {cell(sc)} |")
        if sc and not same: moves['own'].append((s, k, sc))
    for k in ('opus', 'astra', 'argon'):
        full, lines = score(load(os.path.join(AU, 'judge-fulldrawing', s, f'{k}-L2-vs-auto04.json'))), score(load(os.path.join(AU, 'judge', s, f'{k}-L2-vs-auto04.json')))
        L.append(f"| {NAMES[k]} L2, standard drawing | Auto, standard drawing | the washes (same drawing weight) | {cell(full)} |")
        L.append(f"| {NAMES[k]} L2, its own lines | Auto, standard drawing | the washes AND the drawing (the round's published number) | {cell(lines)} |")
        lk = k if k in LIGHT[s] else ('opus' if (s, k) == ('mittens-closeup', 'astra') else None)
        if lk:
            sc = score(load(os.path.join(HERE, 'judge', f'{s}--{k}-lines-vs-auto-{lk}lines.json')))
            L.append(f"| {NAMES[k]} L2, its own lines | Auto, {NAMES[lk]}'s lighter lines | the washes (same drawing weight{'' if lk == k else '; the nearest light drawing there is, not its own'}) | {cell(sc)} |")
        if full and lines and not lines_of(s, k).startswith('the standard'): moves['vsauto'].append((s, k, full, lines))
    L.append('')
def pts(xs): return ', '.join(f'{round(x):+d}' for x in xs) if xs else 'none yet'
L += ['## How many points the drawing alone moves', '']
for s, sname in SUBJECTS.items():
    a = [m for m in moves['auto'] if m[0] == s]; o = [m for m in moves['own'] if m[0] == s]; v = [m for m in moves['vsauto'] if m[0] == s]
    L.append(f"- **{sname}.** Lightening the drawing with the washes untouched moves the judge, in points of preference away from level (50%): Auto against itself, faithful {pts([(m[2][0] - .5) * 100 for m in a])}, skill {pts([(m[2][1] - .5) * 100 for m in a])}; each model's L2 against itself, faithful {pts([(m[2][0] - .5) * 100 for m in o])}, skill {pts([(m[2][1] - .5) * 100 for m in o])}. The same change moved the models' published scores against the standard Auto by faithful {pts([(m[3][0] - m[2][0]) * 100 for m in v])}, skill {pts([(m[3][1] - m[2][1]) * 100 for m in v])}.")
allm = [(m[2][0] - .5) * 100 for m in moves['auto'] + moves['own']] + [(m[2][1] - .5) * 100 for m in moves['auto'] + moves['own']]
if allm: L += ['', f"**One line: with the washes identical, the lighter drawing alone moves the judge by {round(sum(allm) / len(allm)):+d} points of preference on average over {len(allm)} verdicts (range {round(min(allm)):+d} to {round(max(allm)):+d}; Mittens and White Ships differ, see above).**"]
L += ['', 'What this does and does not show: a change here shows the judge is SENSITIVE to the drawing. It does not by itself show the judge is unfair: a painting with a fuller pencil drawing under it may truly be the more faithful and the more skilled-looking sheet, and a human judge might prefer it too. What it does show is that a model\'s score against Auto mixes its washes with its choice of drawing, so the two must be compared at the same drawing weight (the "same drawing weight" rows) before saying a model\'s washes beat or lose to Auto\'s.',
      '', 'Limits: one judge model, one painting a cell (no repeats, so the noise floor is the one same-against-same row), two subjects. On White Ships Opus handed over the standard drawing, so it has no lighter-drawing version; the second light Auto there uses Astra\'s lines.']
open(os.path.join(AU, 'PENCIL-CONTROL.md'), 'w').write('\n'.join(L) + '\n'); print('written', os.path.join(AU, 'PENCIL-CONTROL.md'))
