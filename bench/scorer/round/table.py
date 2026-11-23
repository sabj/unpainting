#!/usr/bin/env python3
"""Writes ../SCORES.md from classic/, judges/, progression/ and the paintings' own cheat-risk records."""
import importlib.util, json, os, statistics, time
HERE = os.path.dirname(os.path.abspath(__file__)); WORK = os.path.dirname(HERE)
sp = importlib.util.spec_from_file_location('sa', os.path.join(HERE, 'score-all.py')); sa = importlib.util.module_from_spec(sp); sp.loader.exec_module(sa)
PANEL = sa.PANEL.split(','); SHORT = {'qwen3.8-flash-next:125b-mlx': 'Qwen 3.8 flash-next 125b', 'qwen3.8:27b-mlx': 'Qwen 3.8 27b', 'gemma4:31b-mlx': 'Gemma 4 31b'}
LABEL = 'J3-local-3x'
load = sa.load
def f1(x, d=2): return 'none' if x is None else f'{x:.{d}f}'
def sg(x): return 'none' if x is None else f'{x:+.2f}'
def judges(e):
    """(score, {judge: median}, spread, criteria, faults): a judge's score is the median of its 3 valid calls; the score is the mean of the three medians."""
    med, crit, faults = {}, {}, []
    for m in PANEL:
        tag = m.replace(':', '_').replace('/', '_'); calls = [load(os.path.join(HERE, 'judges', e['name'], f'{tag}-{k}.json')) for k in (1, 2, 3)]
        ok = [c for c in calls if c and c.get('visionOverall') is not None]
        if len(ok) < 3: faults.append(f'{SHORT[m]}: {len(ok)} of 3 valid calls'); continue
        med[m] = statistics.median(c['visionOverall'] for c in ok)
        for k in ('composition_values', 'edges_detail', 'marks_texture'): crit.setdefault(k, []).append(statistics.median(c['criteria'][k] for c in ok))
    if len(med) < len(PANEL): return None, med, None, {}, faults
    return sum(med.values()) / len(med), med, max(med.values()) - min(med.values()), {k: sum(v) / len(v) for k, v in crit.items()}, faults
def classic(e):
    d = load(os.path.join(HERE, 'classic', e['name'] + '.json'))
    return (d['classic'], d['criteria'].get('classic_value'), d['criteria'].get('classic_edge'), d['criteria'].get('classic_marks'), d.get('scoreInput')) if d else (None, None, None, None, None)
def headroom(auto): return max(10 - auto, 2.0)   # bench/scripts/levels.mjs: the top of the scale minus Auto's score, never under a fifth of the scale
def adjusted(x, auto): return None if x is None or auto is None else (x - auto) / headroom(auto)
def cheat(e):
    c = e.get('cheat')
    if c: return f"{c['risk']:.2f} {c['level']}" + (', REVIEW' if c.get('review') else ', under the line (0.5)') + f"; fine-detail copy {c['hfCorr']:.2f} of {c['hfCeiling']} allowed" + (' OVER' if c['hfCorr'] > c['hfCeiling'] else '')
    l1 = load(e['folder'] + '/L1.json')
    if l1:
        a = next((x for x in l1.get('attempts', []) if x.get('attempt') == 3), {}); st = load(e['folder'] + '/attempt-3/stats.json') or {}
        return f"no cheat-risk record (the freehand kit writes none); blocked image reads {a.get('blockedImageReads')}, small-stroke share {st.get('smallShare')}"
    return 'no record'
def prog(e):
    ds = [load(os.path.join(HERE, 'progression', e['name'], m.replace(':', '_') + '.json')) for m in PANEL]
    ok = [d for d in ds if d and d.get('earlyMean') is not None]
    if not ok: return 'not run'
    return f"early {sum(d['earlyMean'] for d in ok) / len(ok):.1f}, all stages {sum(d['mean'] for d in ok) / len(ok):.1f} of 5 ({len(ok)} of {len(PANEL)} judges)"
def h2h(e):
    if not e.get('level'): return ''
    d = load(os.path.join(WORK, 'paint', 'l2-fix', 'auth', 'judge', e['subject'], f"{e['model']}-{e['level']}-vs-auto04.json"))
    if not d or not d.get('complete'): return 'none on disk'
    w = lambda p: 'win' if p > .62 else 'loss' if p < .38 else 'tie'
    q = d['questions']; return f"faithful {round(q['faithful']['painting'] * 100)}% {w(q['faithful']['painting'])}, skill {round(q['skill']['painting'] * 100)}% {w(q['skill']['painting'])}"
def reads(e, mode, size):
    """(score, {judge: median}, spread, faults) of one reading: 'pair' at 768 is the scorer's own (judges/), the rest are reads/."""
    if (mode, size) == ('pair', '768'): j = judges(e); return j[0], j[1], j[2], j[4]
    med, faults = {}, []
    for m in PANEL:
        ok = [c['overall'] for c in (load(os.path.join(HERE, 'reads', e['name'], f"{mode}-{size}-{m.replace(':', '_')}-{k}.json")) for k in (1, 2, 3)) if c and c.get('overall') is not None]
        if len(ok) < 3: faults.append(f'{SHORT[m]}: {len(ok)} of 3 valid calls'); continue
        med[m] = statistics.median(ok)
    if len(med) < len(PANEL): return None, med, None, faults
    return sum(med.values()) / len(med), med, max(med.values()) - min(med.values()), faults
def human(e):
    """The human-ness reading of one painting (humanness/<name>/): finished = mean of the judges' medians of the finished sheet
    alone (1 to 5); thirds = mean snapshot score over snapshots 1-4, 5-8, 9-12 of the sequence; tells = letter -> how many
    judge-snapshots named it (median reading of each judge, 13 snapshots x 3 judges); yes = readings of 9 that said a person
    would paint it in this order; why = one judge's sentence."""
    d = os.path.join(HERE, 'humanness', e['name']); fin, seqs, yes, n, why, ftells = {}, {}, 0, 0, None, {}
    for m in PANEL:
        t = m.replace(':', '_'); F = [x for x in (load(f'{d}/finished-{t}-{k}.json') for k in (1, 2, 3)) if x and x.get('ok')]
        if len(F) == 3:
            fin[m] = statistics.median(x['score'] for x in F)
            for l in F[0]['tells']: ftells[l] = ftells.get(l, 0) + 1
        S = [x for x in (load(f'{d}/sequence-{t}-{k}.json') for k in (1, 2, 3)) if x and x.get('ok')]
        yes += sum(1 for x in S if x['human']); n += len(S)
        if len(S) == 3: seqs[m] = S; why = why or S[0]['why']
    out = {'finished': sum(fin.values()) / len(fin) if len(fin) == len(PANEL) else None, 'finJudges': fin, 'finTells': ftells, 'yes': yes, 'of': n, 'why': why, 'thirds': None, 'tells': {}}
    out['seqJudges'] = len(seqs)
    if len(seqs) >= 2:   # a judge whose three sequence replies did not parse is left out and counted
        per = [sum(statistics.median(S[k]['snapshots'][i]['score'] for k in range(3)) for S in seqs.values()) / len(seqs) for i in range(13)]
        out['thirds'] = [sum(per[0:4]) / 4, sum(per[4:8]) / 4, sum(per[8:12]) / 4]; out['seqFinished'] = per[12]
        for S in seqs.values():
            for sn in S[0]['snapshots']:
                for l in sn['tells']: out['tells'][l] = out['tells'].get(l, 0) + 1
    return out
TELL = {'a': 'speckle for lines', 'b': 'cut wash edges', 'c': 'flat slabs', 'd': 'feature before its form', 'e': 'whole sheet faint', 'f': 'a region arriving finished', 'g': 'a wipe', 'h': 'nothing changes', 'i': 'lines that do not describe', 'j': 'texture dumped late'}
def tally(t): return ', '.join(f'({l}) {t[l]}' for l in sorted(t, key=lambda l: -t[l])) or 'none named'
CORE = {s['id'] for s in sa.REG.values() if s.get('role') == 'core'}
E = [e for e in sa.entries() if sa.wanted(e, None)]
scored = [e for e in E if e['group'] == 'scored']; ORIG = {e['sid']: e for e in E if e['group'] == 'originals'}
autos = [e for e in E if e['group'] == 'autos' and e['sid'] in CORE and e['png'] and not e['failure']]
C = {e['name']: classic(e) for e in E}
def share(x, o): return 'none' if x is None or not o else f'{100 * x / o:.0f}%'
def cell(r): return 'none' if r[0] is None else f'{r[0]:.2f}'
def meds(r): return ' / '.join(f1(r[1].get(m), 0) for m in PANEL) if r[1] else 'none'
faults = []
for e in scored + [ORIG[s] for s in ('mittens-closeup', 'white-ships')]:
    for mode, size in (('single', '768'), ('single', 'full'), ('pair', '768'), ('pair', 'full')):
        if e['group'] == 'originals' and mode == 'pair' and size == 'full': continue
        r = reads(e, mode, size)
        if r[3]: faults.append(f"`{e['name']}`, {'alone' if mode == 'single' else 'against the source'}, {size}: " + '; '.join(r[3]))
L = ['# Scores: the judges read each painting and each original; a painting\'s result is its share of the original\'s score', '',
     f'Written {time.strftime("%H:%M, %d %b")} by `work/scores/table.py` (readings: `work/scores/score-all.py`, `reads.py`). Definition: `BENCHMARK-DEFINITION.md`.',
     f'**Judge label {LABEL}: NOT J1, and not comparable with any published J1 score.** Panel: ' + ', '.join(f'`{m}`' for m in PANEL) + ' (Ollama on this Mac, one model in memory at a time, unloaded after). Three calls a judge for every reading; a judge\'s score is its median and needs all three; the score is the mean of the three medians. At temperature 0 a judge\'s three calls agree almost always, so the repeat says little about its steadiness.', '',
     '## Faults first', '']
L += [f'- {x}' for x in faults[:30]] or ['- No reading is missing a judge.']
L += ['- **Human-ness of the FINISHED sheet is at its ceiling and separates little:** both originals and several paintings get 5 of 5 from every judge, so the human-ness share (and two thirds of the combined number) ties them at 100%. The reading that does separate them is IN THE MAKING (the snapshots), which the share does not use: on Mittens, Auto and Astra\'s L2 both finish at 5.00, but in the making Auto reads 2.7 / 1.7 / 1.7 with flat slabs named in 33 of 39 judge-snapshots and Astra\'s L2 reads 3.5 / 3.0 / 2.7. So by quality Auto leads Astra\'s L2 on Mittens (7.33 to 6.67), by finished human-ness they tie, and by human-ness in the making Astra\'s L2 leads; the tells (Auto: flat slabs and cut wash edges through most of its making) are what the difference is made of. No judge said yes to Auto\'s order of work on either subject.',
      '- In the making, some judges gave no readable reply for a painting (said in its row); those rows rest on two judges.',
      '- **Two readings, kept apart.** ALONE: the judge sees one picture and scores it as a watercolour with the scorer\'s rubric, not told whether it is an original or a painting; originals and paintings are read the same way, independently, and the result is the painting\'s share of its original\'s score. This is new today (`reads.py`; the scorer had no such mode) and is the reading that matches the owner\'s example ("original 9, Auto 4.5: 50%"): the original gets a real score of its own. AGAINST THE SOURCE: the scorer\'s own reading (`score_painting.py`), the painting beside its source; put through it the original scores 10.0 from every judge because the two pictures are the same, so it gives no share and is shown raw only.',
      '- **Two sizes.** 768: both pictures at most 768 px on the long side, as the scorer has always shown them. Full: the sheet at its own pixels (Mittens 1086 x 1448, White Ships 768 x 548, so for White Ships the two sizes are the same picture and any difference is the judge\'s own noise). What the model does with a large picture inside itself is not known to us: full size is what was sent, not proof of what was seen.',
      '- ALONE has no source beside it, so it cannot see unfaithfulness: a handsome painting of the wrong thing would score well. Read it beside AGAINST THE SOURCE.',
      '- The freehand (L1) kit writes no cheat-risk record. One painting a cell, no repeats of the painting itself.', '']
SUB = (('mittens-closeup', 'Mittens close-up'), ('white-ships', 'White Ships'))
W_HUMAN, W_QUALITY = 2, 1   # the combined number: parts human-ness to parts quality (the owner's setting, 22 Nov)
ALL3 = []
for s, sname in SUB:
    rows = [e for e in scored if e['subject'] == s]; auto = next(e for e in rows if e['painting'] == 'Auto'); oe = ORIG[s]
    o7, of = reads(oe, 'single', '768'), reads(oe, 'single', 'full'); a7 = reads(auto, 'single', '768'); ap = reads(auto, 'pair', '768'); ac = C[auto['name']][0]
    # the three judge numbers, each a share of the original's own score
    ho0 = human(oe)['finished']; trip = []
    for e in rows:
        hs = human(e)['finished']; qs = reads(e, 'single', '768')[0]
        H = 100 * hs / ho0 if hs is not None and ho0 else None; Q = 100 * qs / o7[0] if qs is not None and o7[0] else None
        trip.append((e['painting'], H, Q, (W_HUMAN * H + W_QUALITY * Q) / (W_HUMAN + W_QUALITY) if H is not None and Q is not None else None))
    ALL3.extend((f'{n}, {sname}', H, Q, Cb) for n, H, Q, Cb in trip)
    pc = lambda x: 'none' if x is None else f'{x:.0f}%'
    rank = lambda i: ' > '.join(f'{t[0]} {pc(t[i])}' for t in sorted([t for t in trip if t[i] is not None], key=lambda t: -t[i]))
    L += [f'## {sname} (tag 66690c4f)', '', '### The three judge numbers, each as a share of the original\'s own score', '',
          f'| Picture | HUMAN-NESS | QUALITY AND LIKENESS | COMBINED ({W_HUMAN} parts human-ness to {W_QUALITY} part quality) |', '|---|---|---|---|']
    L += [f'| {n} | {pc(H)} | {pc(Q)} | **{pc(Cb)}** |' for n, H, Q, Cb in trip]
    L += ['', f'- Ranked by human-ness: {rank(1)}', f'- Ranked by quality and likeness: {rank(2)}', f'- Ranked by the combined number: {rank(3)}', '',
          f'The original scores {f1(ho0)} of 5 for human-ness and {cell(o7)} of 10 for quality (both read alone); each share is the painting\'s score over that. Combined = ({W_HUMAN} x human-ness share + {W_QUALITY} x quality share) / {W_HUMAN + W_QUALITY}; the weights are a setting at the top of `work/scores/table.py`.', '']
    L += ['### Human-ness (the first reading): does it look painted by a person, in the making and when finished?', '',
          '| Picture | FINISHED sheet, 1-5 | share of the original | judges (125b / 27b / Gemma) | tells on the finished sheet | IN THE MAKING: first third | middle | last third | tells through the sequence (of 39 judge-snapshots) | "a person would paint it in this order" | one judge\'s sentence |', '|' + '---|' * 11]
    ho = human(oe)
    L.append(f"| ORIGINAL (no film: finished sheet only) | **{f1(ho['finished'])}** | 100% | {' / '.join(f1(ho['finJudges'].get(m), 0) for m in PANEL)} | {tally(ho['finTells'])} | | | | | | |")
    for e in rows:
        h = human(e); th = h['thirds']
        L.append(f"| {e['painting']} | {f1(h['finished'])} | **{share(h['finished'], ho['finished'])}** | {' / '.join(f1(h['finJudges'].get(m), 0) for m in PANEL)} | {tally(h['finTells'])} | {f1(th[0], 1) if th else 'not read'} | {f1(th[1], 1) if th else ''} | {f1(th[2], 1) if th else ''} | {(tally(h['tells']) + ('' if h['seqJudges'] == len(PANEL) else f" (only {h['seqJudges']} of {len(PANEL)} judges gave a readable sequence reply)")) if th else ''} | {str(h['yes']) + ' of ' + str(h['of']) + ' readings yes' if h['of'] else 'not read'} | {(h['why'] or '').replace('|', '/')} |")
    # where human-ness and quality-and-likeness disagree, said plainly
    Hs = {e['painting']: human(e)['finished'] for e in rows}; Qs = {e['painting']: reads(e, 'single', '768')[0] for e in rows}
    if all(v is not None for v in list(Hs.values()) + list(Qs.values())):
        flips = [f'{a} over {b} by human-ness ({Hs[a]:.2f} to {Hs[b]:.2f}), {b} over {a} by quality ({Qs[b]:.2f} to {Qs[a]:.2f})' for a in Hs for b in Hs if Hs[a] > Hs[b] and Qs[a] < Qs[b]]
        L += ['', 'Where the two readings disagree on this subject (finished sheet; human-ness 1-5 against quality alone 0-10): ' + ('; '.join(flips) + '.' if flips else 'nowhere: every pair is ordered the same way by both, or tied in one.')]
    L += ['', '### (a) Quality and likeness (the second reading): the judges', '',
          '| Picture | ALONE 768: score | share of the original | judges (125b / 27b / Gemma) | spread | ALONE full size: score | share of the original | judges | AGAINST THE SOURCE 768 | judges | AGAINST THE SOURCE full size | judges |', '|' + '---|' * 12,
          f"| ORIGINAL | **{cell(o7)}** | 100% | {meds(o7)} | {f1(o7[2], 0)} | **{cell(of)}** | 100% | {meds(of)} | 10.00 (the same picture twice) | 10 / 10 / 10 | not read | |"]
    for e in rows:
        r7, rf, p7, pf = reads(e, 'single', '768'), reads(e, 'single', 'full'), reads(e, 'pair', '768'), reads(e, 'pair', 'full')
        L.append(f"| {e['painting']} ({e['commit']}) | {cell(r7)} | **{share(r7[0], o7[0])}** | {meds(r7)} | {f1(r7[2], 0)} | {cell(rf)} | **{share(rf[0], of[0])}** | {meds(rf)} | {cell(p7)} | {meds(p7)} | {cell(pf)} | {meds(pf)} |")
    L += ['', '### (d) Difficulty adjustment, (c) algorithmic, (b) anti-cheat, and the head-to-head', '',
          '| Picture | (d) Auto\'s share (alone, 768) | this painting\'s share | (d) ADJUSTED for Auto, alone 768 | (d) ADJUSTED for Auto, against the source 768 | (c) ALGORITHMIC mean | value shapes | edges | marks | (d) adjusted algorithmic | (b) cheat-risk | (b) progression | Head-to-head against Auto (extra, not the score) |', '|' + '---|' * 13]
    for e in rows:
        r7, p7 = reads(e, 'single', '768'), reads(e, 'pair', '768'); c = C[e['name']]; isauto = e is auto
        L.append(f"| {e['painting']} | {share(a7[0], o7[0])} | {share(r7[0], o7[0])} | {'Auto itself' if isauto else sg(adjusted(r7[0], a7[0]))} | {'Auto itself' if isauto else sg(adjusted(p7[0], ap[0]))} | {f1(c[0])} | {f1(c[1])} | {f1(c[2])} | {f1(c[3])} | {'Auto itself' if isauto else sg(adjusted(c[0], ac))} | {cheat(e)} | {prog(e)} | {h2h(e)} |")
    L.append('')
if ALL3 and all(t[3] is not None for t in ALL3):
    L += ['## All fourteen paintings of the two subjects, ranked under each of the three', '', '| Rank | Human-ness | Quality and likeness | Combined |', '|---|---|---|---|']
    cols = [sorted(ALL3, key=lambda t: -t[i]) for i in (1, 2, 3)]
    L += [f"| {r + 1} | {cols[0][r][0]}: {cols[0][r][1]:.0f}% | {cols[1][r][0]}: {cols[1][r][2]:.0f}% | {cols[2][r][0]}: {cols[2][r][3]:.0f}% |" for r in range(len(ALL3))] + ['']
# does Auto's lead over Astra's Mittens L2 survive full size?
try:
    au = next(e for e in scored if e['subject'] == 'mittens-closeup' and e['painting'] == 'Auto'); asx = next(e for e in scored if e['subject'] == 'mittens-closeup' and e['painting'] == 'Astra L2')
    L += ['## Auto against Astra\'s Mittens L2, by reading and size', '', '| Reading | Auto | Astra L2 | Auto ahead by |', '|---|---|---|---|']
    for mode, size, nm in (('pair', '768', 'against the source, 768'), ('pair', 'full', 'against the source, full size'), ('single', '768', 'alone, 768'), ('single', 'full', 'alone, full size')):
        a, b = reads(au, mode, size)[0], reads(asx, mode, size)[0]; L.append(f"| {nm} | {f1(a)} | {f1(b)} | {sg(a - b) if a is not None and b is not None else 'none'} |")
    L.append('')
except StopIteration: pass
both = []
for e in scored:
    if e['painting'] == 'Auto': continue
    o = reads(ORIG[e['subject']], 'single', '768')[0]; a = reads(next(x for x in scored if x['subject'] == e['subject'] and x['painting'] == 'Auto'), 'single', '768')[0]; r = reads(e, 'single', '768')[0]
    both.append((e, 100 * r / o if r is not None and o else None, adjusted(r, a)))
if both and all(b[1] is not None and b[2] is not None for b in both):
    raw = sorted(both, key=lambda b: -b[1]); adj = sorted(both, key=lambda b: -b[2]); nm = lambda b: f"{b[0]['painting']}, {b[0]['subject']}"
    L += ['## Raw and adjusted side by side (the twelve model paintings; alone, 768)', '', '| Rank | By share of the original | By the score adjusted for Auto |', '|---|---|---|']
    L += [f'| {i + 1} | {nm(raw[i])}: {raw[i][1]:.0f}% | {nm(adj[i])}: {sg(adj[i][2])} |' for i in range(len(both))]
    L += ['', f'The adjustment changes {sum(1 for i in range(len(both)) if raw[i][0] is not adj[i][0])} of {len(both)} places; within one subject it cannot change the order, it only moves paintings of different subjects against each other.', '']
L += ['## The benchmark subjects\' Autos: the difficulty index', '', 'Subjects marked core in the registry. One row an Auto painting on disk, each at the commit named: the commits differ, so this is not one frozen Auto set.', '',
      '| Subject | Auto painting | Commit | ORIGINAL alone 768 | AUTO alone 768 | Auto\'s share of the original | Auto judges (125b / 27b / Gemma) | spread | Auto AGAINST THE SOURCE 768 | (c) ALGORITHMIC mean | value shapes | edges | marks | (b) cheat-risk |', '|' + '---|' * 14]
for e in [x for x in scored if x['painting'] == 'Auto'] + sorted(autos, key=lambda e: (e['subject'], e['name'])):
    o, r, p = reads(ORIG[e['sid']], 'single', '768'), reads(e, 'single', '768'), reads(e, 'pair', '768'); c = C[e['name']]
    L.append(f"| {e['subject']} | `{e['name']}` | {e['commit']} | {cell(o)} | {cell(r)} | **{share(r[0], o[0])}** | {meds(r)} | {f1(r[2], 0)} | {cell(p)} | {f1(c[0])} | {f1(c[1])} | {f1(c[2])} | {f1(c[3])} | {cheat(e)} |")
L += ['', '## What each column is', '',
      '- **HUMAN-NESS (first):** the project\'s own rubric (`paint/painter/judge/RUBRIC.md`), read by the same local panel (`work/scores/humanness.py`). FINISHED: the finished sheet alone, 1 to 5 (5 unmistakably a person\'s painting, 1 an image uncovered by a filter), mean of the three judges\' medians; the share is that score over the original\'s, read the same way. IN THE MAKING: twelve snapshots evenly through the painting\'s film plus the finished sheet, shown in order with only their percent complete; the mean snapshot score in each third; the tells named, by letter: ' + '; '.join(f'({k}) {v}' for k, v in TELL.items()) + '; and how many of the nine readings said a person would paint it in this order.',
      '- **(a) ALONE (qualitative; the reading that matches the owner\'s example):** the judges score one picture as a watercolour, 0 to 10 (composition and values, edges and detail, marks and texture, then overall; the overall is what is shown). The share is the painting\'s score divided by its original\'s score read the same way; it may pass 100%.',
      '- **(a) AGAINST THE SOURCE:** the scorer\'s own reading, the painting beside its source, 0 to 10, raw. Kept in its own column, never mixed with ALONE.',
      '- **(b) ANTI-CHEAT (reference only):** cheat-risk is the painter\'s own record (0.45 progression + 0.45 fine-detail copy + 0.1 small strokes; 0.5 and over asks for a person\'s review), with the fine-detail copy number against its ceiling. Progression is `bench/scorer/progression.py` on the local panel: the sheet at 10, 25, 50, 75 and 100% of its strokes, each stage 1 to 5 for looking like a painting in progress; "early" is the mean of the first two.',
      '- **(c) ALGORITHMIC ("auto judging"):** `bench/scorer/classic.py`, computed by code against the source, no AI judge: value shapes, edges, marks, each 0 to 10, and their mean. Never part of (a).',
      '- **(d) DIFFICULTY ADJUSTMENT:** Auto\'s share for the subject beside the painting\'s, and the painting\'s raw score as a share of the room Auto left, (painting - Auto) / max(10 - Auto, 2), as `bench/scripts/levels.mjs` defines headroom: 0 is level with Auto, negative is worse. Given for each reading and for the algorithmic mean separately.',
      '- **Head-to-head against Auto (extra, not the score):** the whole-sheet pairwise verdicts already on disk (the chance the judge prefers the model\'s painting to Auto; 38 to 62% is a tie). None was run for this table.']
open(os.path.join(WORK, 'SCORES.md'), 'w').write('\n'.join(L) + '\n'); print('written', os.path.join(WORK, 'SCORES.md'))
