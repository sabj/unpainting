#!/usr/bin/env python3
"""Blind full-size comparison of two paintings of one subject: which looks more like a hand-painted watercolour.

  python3 pairs.py --a A.png --b B.png --style "pure watercolor, no ink" --plate-mm 280 [--calls 2] [--seed 1]
                   [--out result.json] [--sheet DIR] [--no-vision]
  python3 pairs.py --pool r1.json r2.json ...          pooled verdict over several plates
  python3 pairs.py --answers DIR/answers.txt --key DIR/key.json   score a person's contact sheet

Both paintings are cut into the same 1:1 tiles (fullsize.py's grid, 64 mm of paper, never resized). For each tile a
judge sees the two crops and must pick one. Every judge sees every tile in both orders, so a judge that favours a
position cancels itself out: it votes for a painting only when it picks that painting more often than the other
over the two orders. A tile goes to the painting most judges voted for. The verdict is an exact sign test over the
tiles.

Nothing here reads the target, and the judges never see it. That makes this a test of look only. A copied target
looks hand-painted, so this is not a copy check and must never decide alone: read it with the copy limits
(bench/scripts/pair-judge.mjs does both).

--sheet writes the same pairs as a blind contact sheet for a person: JPEG pages with the two crops side by side in
shuffled order, an answers.txt to fill in, and key.json, which says which side was which and is not to be opened
before answering.
"""
import argparse, json, math, os, random, re, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load_rgb  # noqa: E402
import fullsize as fz  # noqa: E402

VERSION = "pairs-v1"
ALPHA = 0.05          # the usual two-sided level for calling a difference; not fitted to anything
TOP_LOGPROBS = 5      # alternatives asked for at each reply token on the local route; "1" and "2" are the top two
MIN_PAINT = 0.05      # fullsize.py's rule: a tile under 5% paint in both paintings has nothing to judge
PAIR_PROMPT = """Image 1 and Image 2 show the same part of one subject, painted two different ways. Each is shown at full size: about {mm} mm of paper across, from the {where} of the sheet.
Both are meant to be made by hand in this style: {style}. You do not know who or what made either one.
Look closely, the way a watercolour teacher looks at a sheet. Which image looks more like a hand-painted watercolour?
Weigh the edges (a mix of hard, soft and lost edges, against cut-out rims and stepped contour bands), the washes (graded and transparent, against flat poster fills, stripes and blotches), the marks (marks a brush in a hand makes, against rectangles, grids and slits) and artefacts (white flecks, pale seams, speckle, a digital look).
Do not choose by which image is darker, sharper or more detailed. You must choose one.
Reply with JSON only, no prose: {{"choice":1,"reason":"one short sentence"}} or {{"choice":2,"reason":"one short sentence"}}"""
# J3 (local route): the same question, answered with the choice alone. The reason came after the choice and never
# informed it; leaving it out makes a local call several times shorter.
PAIR_PROMPT_J3 = PAIR_PROMPT.rsplit("\n", 1)[0] + """
Reply with JSON only, no prose: {{"choice":1}} or {{"choice":2}}"""

# Two more questions, for scoring a painting against the target picture itself (versus.py's target mode). They are asked
# apart, in separate calls, so that loose attractive washes cannot stand in for a subject that is wrong, and the
# other way round. Neither says that one of the two images may be the target.
_HEAD = """Image 1 and Image 2 show the same part of one subject, painted two different ways. Each is shown at full size: about {mm} mm of paper across, from the {where} of the sheet.
Both are meant to be watercolours in this style: {style}. You do not know who or what made either one.
"""
_TAIL = """
You must choose one.
Reply with JSON only, no prose: {{"choice":1}} or {{"choice":2}}"""
QUESTIONS = {
    "subject": _HEAD + """Which image shows the subject better? Weigh whether the forms read clearly as what they are, whether features are in the right place and the right shape, whether the lights and darks model the form, and whether the colours belong to the subject and to each other.
Do not choose by how the paint is handled: a loose, attractive wash that does not describe the subject is the worse one here.""" + _TAIL,
    "craft": _HEAD + """Which image is the better piece of watercolour painting, as craft alone? Weigh the edges (a mix of hard, soft and lost edges, against cut-out rims and stepped contour bands), the washes (graded and transparent, against flat poster fills, stripes and blotches), the marks (marks a brush in a hand makes, against rectangles, grids and slits) and artefacts (white flecks, pale seams, speckle, a digital look).
Do not choose by which image shows the subject more exactly, or by which is darker, sharper or more detailed.""" + _TAIL,
}


def parse_choice(txt):
    """1 or 2 from a judge's reply, or None."""
    txt = re.sub(r"```(?:json)?", "", txt or "")
    for m in reversed(re.findall(r"\{[^{}]*\}", txt)):
        try:
            d = json.loads(m)
            c = d.get("choice")
            if c in (1, 2, "1", "2"):
                return {"choice": int(c), "reason": str(d.get("reason") or "")[:200]}
        except Exception:
            pass
    return None


def choice_logit(logprobs, labels=("1", "2")):
    """How strongly a reply preferred image 1 over image 2: log P("1") - log P("2") at the token that carries the
    choice, from the server's token log-probabilities. None when the reply has no such token. When the other answer
    is not among the listed alternatives its probability is at most the smallest listed one, so that is used: the
    result then understates the preference and never overstates it."""
    digit = lambda tok: re.sub(r"[^0-9A-Za-z]", "", tok or "")   # '2', ' 2}', '2}\n```' all carry the answer 2
    for t in logprobs or []:
        if not digit(t.get("token")).isdigit():   # the answer token, even when it names neither image (a "1" for the source)
            continue
        tops = t.get("top_logprobs") or []
        best = {}
        for alt in [t, *tops]:
            d = digit(alt.get("token"))
            if d in labels and alt.get("logprob") is not None:
                best[d] = max(best.get(d, -math.inf), float(alt["logprob"]))
        floor = min([float(a["logprob"]) for a in tops if a.get("logprob") is not None] or [None], default=None)
        one, two = best.get(labels[0], floor), best.get(labels[1], floor)
        if one is None or two is None or (labels[0] not in best and labels[1] not in best):
            return None
        return one - two
    return None


def aggregate_margins(tiles, margins, judges):
    """J3's vote. margins[(judge, tile index)] is {"ab": x, "ba": y}: each the judge's log-odds for the image shown
    first in that order. A judge's habit of picking a position adds the same amount to both, so half their difference
    is its preference for painting A with the habit taken out; it votes A when that is above zero and B when below.
    A judge that could only be read in one order casts no vote. A tile goes to the painting with more judge votes.
    Same result shape as aggregate()."""
    live = [i for i, t in enumerate(tiles) if not t["identical"]]
    need = math.ceil(0.6 * len(live))
    per_judge, votes, prefs = {}, {i: {} for i in live}, {i: {} for i in live}
    for j in judges:
        r = {"a": 0, "b": 0, "split": 0, "answered": 0}
        habit, strength = [], []
        for i in live:
            m = margins.get((j, i), {})
            if m.get("ab") is None or m.get("ba") is None:
                continue
            r["answered"] += 1
            pref = (m["ab"] - m["ba"]) / 2
            habit.append((m["ab"] + m["ba"]) / 2); strength.append(abs(pref))
            v = "a" if pref > 0 else "b" if pref < 0 else "split"
            r[v] += 1
            votes[i][j] = v; prefs[i][j] = round(pref, 3)
        r["counts"] = r["answered"] >= need and r["answered"] > 0
        r["positionHabit"] = round(sum(habit) / len(habit), 3) if habit else None   # log-odds for the first image; 0 is none
        r["meanStrength"] = round(sum(strength) / len(strength), 3) if strength else None
        per_judge[j] = r
    ta = tb = ties = 0
    rows = []
    for i, t in enumerate(tiles):
        row = {"row": t["row"], "col": t["col"], "box": list(t["box"]), "where": t["where"], "identical": t["identical"]}
        if t["identical"]:
            row.update(votes={}, prefers=None); ties += 1
        else:
            va = sum(1 for v in votes[i].values() if v == "a"); vb = sum(1 for v in votes[i].values() if v == "b")
            row.update(votes=votes[i], prefA=prefs[i], prefers="a" if va > vb else "b" if vb > va else None)
            ta += va > vb; tb += vb > va; ties += va == vb
        rows.append(row)
    complete = bool(tiles) and (not live or all(r["counts"] for r in per_judge.values()))
    # graded answer: the chance a judge picks B over A with its position habit removed, averaged over tiles within
    # a judge and then over judges. It still moves when A takes every tile.
    soft = [sum(1 / (1 + math.exp(max(-50.0, min(50.0, p[j])))) for p in prefs.values() if j in p) / max(1, sum(j in p for p in prefs.values()))
            for j in judges if any(j in p for p in prefs.values())]
    out = {"complete": complete, "minTilesPerJudge": need, "callsPerTile": 2, "vote": "margin", "per_judge": per_judge,
           "tiles": rows, "tilesA": ta, "tilesB": tb, "ties": ties, "softB": round(sum(soft) / len(soft), 4) if soft else None}
    if complete:
        out.update(verdict(ta, tb))
        out["judgeVotes"] = {"a": sum(r["a"] for r in per_judge.values()), "b": sum(r["b"] for r in per_judge.values()),
                             "split": sum(r["split"] for r in per_judge.values())}
    return out


def sign_test(k, n):
    """Two-sided exact binomial probability of a split at least as uneven as k of n under a fair coin."""
    if n == 0:
        return 1.0
    lo = min(k, n - k)
    p = 2 * sum(math.comb(n, i) for i in range(lo + 1)) / 2 ** n
    return min(1.0, p)


def verdict(a, b):
    """Winner over non-tied units, by the sign test at ALPHA."""
    p = sign_test(a, a + b)
    return {"a": a, "b": b, "p": round(p, 4), "decided": p <= ALPHA, "winner": ("a" if a > b else "b") if p <= ALPHA else None}


def paired_tiles(img_a, img_b, plate_mm):
    """The tiles to compare. The two paintings must be the same size: tiles are compared at the same place."""
    if img_a.size != img_b.size:
        raise ValueError(f"the two paintings differ in size: {img_a.size} and {img_b.size}")
    px_mm = img_a.width / plate_mm
    paint = []
    for im in (img_a, img_b):
        L = fz.lightness(im)
        paint.append(fz.ndi.gaussian_filter(L, fz.WASH_MM * px_mm) < np.percentile(L, fz.PAPER_PCT) - fz.PAPER_TOL)
    A, B = np.asarray(img_a), np.asarray(img_b)
    out = []
    for t in fz.tile_boxes(img_a.width, img_a.height, px_mm):
        x0, y0, x1, y1 = t["box"]
        share = max(float(p[y0:y1, x0:x1].mean()) for p in paint)
        if share < MIN_PAINT:
            continue
        same = bool(np.array_equal(A[y0:y1, x0:x1], B[y0:y1, x0:x1]))
        out.append({**t, "painted": round(share, 3), "where": fz._where(t), "identical": same})
    return out


def _content(first, second, tile, style, plate_mm, width, sp, question="look"):
    side_mm = round((tile["box"][2] - tile["box"][0]) / (width / plate_mm))
    prompt = QUESTIONS[question] if question != "look" else PAIR_PROMPT_J3 if sp.PROVIDER == "local" else PAIR_PROMPT
    text = prompt.format(mm=side_mm, where=tile["where"], style=style)
    uri = lambda im: sp.data_uri(im, max(im.size))  # 1:1, never resized
    return [{"type": "text", "text": text}, {"type": "image_url", "image_url": {"url": uri(first)}},
            {"type": "image_url", "image_url": {"url": uri(second)}}]


def aggregate(tiles, picks, judges, calls):
    """picks[(judge, tile index)] is a list of (order, painting picked), order 'ab' or 'ba', painting 'a' or 'b'.
    A judge votes on a tile only when it answered every call there (the same number in each order): its vote is the
    painting it picked more often, or none when the picks split, which means it followed position, not the paint.
    A tile goes to the painting with more judge votes. A judge counts when it answered 3 in 5 of the judged tiles
    (fullsize.py's rule); the result is complete when every judge counts."""
    live = [i for i, t in enumerate(tiles) if not t["identical"]]
    need = math.ceil(0.6 * len(live))
    per_judge, rows = {}, []
    votes = {i: {} for i in live}
    for j in judges:
        r = {"a": 0, "b": 0, "split": 0, "answered": 0, "first": 0, "picks": 0}
        for i in live:
            ps = picks.get((j, i), [])
            r["picks"] += len(ps)
            r["first"] += sum(1 for order, p in ps if order[0] == p)
            if len(ps) < calls:
                continue
            r["answered"] += 1
            d = sum(1 if p == "b" else -1 for _, p in ps)
            v = "b" if d > 0 else "a" if d < 0 else "split"
            r[v] += 1
            votes[i][j] = v
        r["counts"] = r["answered"] >= need and r["answered"] > 0
        r["firstShare"] = round(r["first"] / r["picks"], 3) if r["picks"] else None  # 0.5 means no position habit
        per_judge[j] = r
    ta = tb = ties = 0
    for i, t in enumerate(tiles):
        row = {"row": t["row"], "col": t["col"], "box": list(t["box"]), "where": t["where"], "identical": t["identical"]}
        if t["identical"]:
            row.update(votes={}, prefers=None); ties += 1
        else:
            va = sum(1 for v in votes[i].values() if v == "a"); vb = sum(1 for v in votes[i].values() if v == "b")
            row.update(votes=votes[i], prefers="a" if va > vb else "b" if vb > va else None)
            ta += va > vb; tb += vb > va; ties += va == vb
        rows.append(row)
    complete = bool(tiles) and (not live or all(r["counts"] for r in per_judge.values()))
    out = {"complete": complete, "minTilesPerJudge": need, "callsPerTile": calls, "per_judge": per_judge, "tiles": rows,
           "tilesA": ta, "tilesB": tb, "ties": ties}
    if complete:
        out.update(verdict(ta, tb))
        # the same test over single judge votes, for reading only: votes on one tile are not independent
        ja = sum(r["a"] for r in per_judge.values()); jb = sum(r["b"] for r in per_judge.values())
        out["judgeVotes"] = {"a": ja, "b": jb, "split": sum(r["split"] for r in per_judge.values())}
    return out


def compare(image_a, image_b, style, plate_mm, calls=2, seed=1, post=None, vision=True, question="look"):
    """Judge every tile in both orders. calls must be even: half the calls of a (judge, tile) show A first.
    question is "look" (which looks more hand-painted, the default) or one of QUESTIONS. An image may be a path or
    an already loaded picture."""
    if question != "look" and question not in QUESTIONS:
        raise ValueError(f"unknown question {question}; known: look, {', '.join(QUESTIONS)}")
    if plate_mm <= 0:
        raise ValueError("plate_mm must be positive")
    if calls < 2 or calls % 2:
        raise ValueError("calls must be an even number, 2 or more: each judge sees each tile in both orders")
    img_a, img_b = [im if isinstance(im, Image.Image) else load_rgb(im) for im in (image_a, image_b)]
    tiles = paired_tiles(img_a, img_b, plate_mm)
    base = {"version": VERSION, **({"question": question} if question != "look" else {}), "paintingSize": list(img_a.size), "plateMm": plate_mm, "style": style, "tileMm": fz.TILE_MM,
            "seed": seed, "alpha": ALPHA}
    if not vision:
        return {**base, "complete": False, "tiles": [{k: (list(v) if k == "box" else v) for k, v in t.items()} for t in tiles]}
    import score_painting as sp
    local = sp.PROVIDER == "local"
    if local and calls != 2:
        raise ValueError("the local route (J3) makes exactly 2 calls per judge and tile, one in each order")
    if post is None:
        post = (lambda m, msgs, max_tokens=0: sp.local_route.post(sp.LOCAL, m, msgs, max_tokens=max_tokens, top_logprobs=TOP_LOGPROBS)) if local else sp._post
    crops = [(img_a.crop(t["box"]), img_b.crop(t["box"])) for t in tiles]
    jobs = [(j, i, order) for j in sp.JUDGES for i, t in enumerate(tiles) if not t["identical"]
            for order in ("ab", "ba") * (calls // 2)]
    random.Random(seed).shuffle(jobs)  # so no judge meets the tiles in sheet order

    def run(job):
        j, i, order = job
        a, b = crops[i]
        first, second = (a, b) if order == "ab" else (b, a)
        content = _content(first, second, tiles[i], style, plate_mm, img_a.width, sp, question)
        budget, err = sp.J2_MAX_TOKENS, "no reply"
        for _ in range(3):  # up to two retries with the images, as fullsize.py does
            try:
                raw, _usage = post(j, [{"role": "user", "content": content}], max_tokens=budget)
            except RuntimeError as e:
                err = str(e)[:160]
                continue
            d = parse_choice(raw)
            if d:
                return {"painting": order[d["choice"] - 1], "reason": d["reason"],
                        **({"logit": choice_logit(_usage.get("logprobs"))} if local else {})}
            err, budget = "no valid JSON", min(budget * 2, sp.J2_MAX_TOKENS_CAP)
        return {"error": err}

    workers, route = 9, {}
    if sp.PROVIDER == "local":  # one model at a time: the server must not swap models between calls
        jobs.sort(key=lambda job: sp.JUDGES.index(job[0]))
        workers = sp.LOCAL["parallel"]
        route = sp.local_route.record(sp.LOCAL)
    with ThreadPoolExecutor(workers) as ex:
        got = list(ex.map(run, jobs)) if jobs else []
    picks, errors, calls_log, margins = {}, {j: 0 for j in sp.JUDGES}, [], {}
    for (j, i, order), d in zip(jobs, got):
        if "error" in d:
            errors[j] += 1
            calls_log.append({"judge": j, "tile": i, "order": order, "error": d["error"]})
        else:
            picks.setdefault((j, i), []).append((order, d["painting"]))
            calls_log.append({"judge": j, "tile": i, "order": order, "picked": d["painting"], "reason": d["reason"],
                              **({"logit": d["logit"]} if local else {})})
            if local:
                margins.setdefault((j, i), {})[order] = d["logit"]
    out = aggregate(tiles, picks, sp.JUDGES, calls)
    if local:  # J3 votes by margin; the both-orders-agree count of J1 is kept beside it for reading
        strict = {k: out.get(k) for k in ("tilesA", "tilesB", "ties", "p", "winner", "judgeVotes")}
        strict["firstShare"] = {j: r["firstShare"] for j, r in out["per_judge"].items()}
        out = {**aggregate_margins(tiles, margins, sp.JUDGES), "strictVote": strict}
    calls_log.sort(key=lambda c: (c["judge"], c["tile"], c["order"]))
    return {**base, **out, "errors": errors, "judges": list(sp.JUDGES), "provider": sp.PROVIDER, **route, "calls": calls_log}


def pool(results):
    """One verdict over several plates: the sign test over all their tiles. A plate that is itself decided the other
    way is named, because a pooled win must not hide a plate that got worse."""
    if any(not r.get("complete") for r in results):
        return {"complete": False, "plates": len(results)}
    a = sum(r["tilesA"] for r in results); b = sum(r["tilesB"] for r in results)
    v = verdict(a, b)
    against = [i for i, r in enumerate(results) if v["winner"] and r.get("winner") and r["winner"] != v["winner"]]
    return {"complete": True, "plates": len(results), "tilesA": a, "tilesB": b, "ties": sum(r["ties"] for r in results), **v,
            "platesDecided": {"a": sum(r.get("winner") == "a" for r in results), "b": sum(r.get("winner") == "b" for r in results)},
            "platesAgainst": against}


# ---- contact sheet for a person ----------------------------------------------------------------------------------

def contact_sheet(image_a, image_b, plate_mm, out_dir, seed=1, per_page=6, name="pair"):
    """Blind pages for a person: each tile pair side by side at 1:1 in shuffled order. Returns the page files.
    key.json says which side is which. answers.txt has one line per pair to fill with L, R or = (no difference)."""
    img_a, img_b = load_rgb(image_a), load_rgb(image_b)
    tiles = [t for t in paired_tiles(img_a, img_b, plate_mm) if not t["identical"]]
    os.makedirs(out_dir, exist_ok=True)
    rng = random.Random(seed)
    order = list(range(len(tiles))); rng.shuffle(order)
    key, pages = [], []
    gap, pad, label = 12, 16, 22
    for p in range(0, len(order), per_page):
        chunk = order[p:p + per_page]
        side = tiles[0]["box"][2] - tiles[0]["box"][0]
        cols = 2 if len(chunk) > 1 else 1
        rows = math.ceil(len(chunk) / cols)
        cell_w, cell_h = 2 * side + gap, side + label
        page = Image.new("RGB", (pad + cols * (cell_w + pad), pad + rows * (cell_h + pad)), (111, 111, 111))
        draw = ImageDraw.Draw(page)
        for k, ti in enumerate(chunk):
            n = p + k + 1
            left_is = rng.choice("ab")
            x = pad + (k % cols) * (cell_w + pad); y = pad + (k // cols) * (cell_h + pad)
            la, lb = (img_a, img_b) if left_is == "a" else (img_b, img_a)
            draw.text((x, y + 4), f"{n}   left (L)", fill=(255, 255, 255)); draw.text((x + side + gap, y + 4), "right (R)", fill=(255, 255, 255))
            page.paste(la.crop(tiles[ti]["box"]), (x, y + label)); page.paste(lb.crop(tiles[ti]["box"]), (x + side + gap, y + label))
            key.append({"n": n, "left": left_is, "tile": {"row": tiles[ti]["row"], "col": tiles[ti]["col"], "box": list(tiles[ti]["box"])}})
        f = os.path.join(out_dir, f"{name}-{len(pages) + 1:02d}.jpg")
        page.save(f, "JPEG", quality=90)
        pages.append(f)
    Path(out_dir, "key.json").write_text(json.dumps({"version": VERSION, "name": name, "seed": seed, "pairs": key}, indent=1))
    with open(os.path.join(out_dir, "answers.txt"), "w") as fh:
        fh.write("# Which side looks more like a hand-painted watercolour? Write L, R or = after each number.\n")
        fh.writelines(f"{k['n']} \n" for k in key)
    return pages


def score_answers(answers_file, key_file):
    """A person's verdict from a filled answers.txt and the sheet's key.json."""
    key = {k["n"]: k["left"] for k in json.loads(Path(key_file).read_text())["pairs"]}
    a = b = ties = 0
    seen = set()
    for line in Path(answers_file).read_text().splitlines():
        line = line.split("#")[0].split()
        if not line:
            continue
        if len(line) != 2 or not line[0].isdigit() or line[1].upper() not in ("L", "R", "="):
            raise ValueError(f"cannot read answer line: {' '.join(line)}")
        n, ans = int(line[0]), line[1].upper()
        if n not in key or n in seen:
            raise ValueError(f"answer {n} is unknown or given twice")
        seen.add(n)
        if ans == "=":
            ties += 1
            continue
        picked = key[n] if ans == "L" else ("b" if key[n] == "a" else "a")
        a += picked == "a"; b += picked == "b"
    if len(seen) != len(key):
        raise ValueError(f"{len(key) - len(seen)} of {len(key)} pairs have no answer")
    return {"tilesA": a, "tilesB": b, "ties": ties, **verdict(a, b)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--a"); ap.add_argument("--b")
    ap.add_argument("--style", default="watercolor and ink")
    ap.add_argument("--plate-mm", type=float, help="width of the sheet in millimetres; required with --a and --b")
    ap.add_argument("--calls", type=int, default=2, help="calls per judge per tile, even (default %(default)s: one in each order)")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--no-vision", action="store_true", help="list the tiles (and write --sheet) without calling a judge")
    ap.add_argument("--sheet", help="directory for a blind contact sheet a person can answer")
    ap.add_argument("--pool", nargs="+", help="result files to pool into one verdict")
    ap.add_argument("--answers"); ap.add_argument("--key")
    ap.add_argument("--out")
    a = ap.parse_args()
    try:
        if a.pool:
            r = pool([json.loads(Path(f).read_text()) for f in a.pool])
        elif a.answers or a.key:
            if not (a.answers and a.key):
                ap.error("--answers and --key go together")
            r = score_answers(a.answers, a.key)
        else:
            if not (a.a and a.b and a.plate_mm):
                ap.error("--a, --b and --plate-mm are required")
            if not a.no_vision:
                import score_painting as sp
                if sp.KEY and not os.environ.get(sp.KEY):
                    sys.exit(f"{sp.KEY} is not set (JUDGE_ROUTE={sp.PROVIDER}); pass --no-vision to list tiles only")
            r = compare(a.a, a.b, a.style, a.plate_mm, a.calls, a.seed, vision=not a.no_vision)
            if a.sheet:
                r["sheet"] = contact_sheet(a.a, a.b, a.plate_mm, a.sheet, a.seed)
    except ValueError as e:
        ap.error(str(e))
    s = json.dumps(r, indent=1)
    if a.out:
        Path(a.out).write_text(s)
    print(s)
    if not a.pool and not a.answers and not a.no_vision and not r["complete"]:
        print("incomplete: a judge answered fewer than 3 in 5 of the tiles in both orders", file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()
