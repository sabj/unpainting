"""The two judged readings of 0.4's scoring (score04.py), and how a panel's replies become one number each.

HUMAN-NESS: twelve snapshots evenly through the painting's film, then the finished sheet, shown in order with only
their percent complete, under the human-ness rubric (bench/docs/human-ness-rubric.md). The judge first says whether
this is the order and the kind of mark a person would use (yes or no), then scores each snapshot 1 to 5 with lettered
tells. The reading is the mean of the twelve film snapshots (the finished sheet is shown last but not counted: it is at
its ceiling), as a percentage of 5; also the means of the first, middle and last four.

QUALITY AND LIKENESS: one picture alone, scored as a watercolour 0 to 10, not told whether it is an original or a
painting. Originals and paintings are read the same way; a painting's figure is its share of its original's score.

Every judge gives three readings; a judge's figure is the median of its three (per snapshot for human-ness), and
needs all three. The panel's figure is the mean of the judges'. A judge short of three valid readings leaves the
figure empty and is named: never a smaller panel.
"""
import hashlib, json, os, re, statistics

SNAPSHOTS = 12
READINGS = 3
LETTERS = "abcdefghij"
MIN_FRAMES = SNAPSHOTS + 2          # the twelve are taken strictly between the first and the last frame
RUBRIC_CUT = "For each snapshot the judge writes"   # the rubric's own reply format is replaced by the prompts' below

SEQ = """{rubric}

Below are {n} snapshots of one painting in progress, in order, each labelled only with its percentage complete; the last is the finished sheet. It is a painting in this style: {style}.
First answer for the whole sequence: is this the order and the kind of mark a person would use for this subject? Then score each snapshot.
Reply with JSON only, no prose: {{"sequence":{{"human":true or false,"why":"one sentence"}},"snapshots":[{{"pct":n,"score":1-5,"tells":["a","c"],"note":"one sentence"}}, ... one object for each of the {n} snapshots, in order]}}"""

SINGLE = """The image is a painting in this style: {style}.
You do not know who or what made it. Rate it from 0 to 10 on each criterion:
- composition_values: the big shapes and the light and dark pattern read as a clear picture.
- edges_detail: edges are crisp where the picture needs them crisp and soft where it needs them soft; small key details (eyes, highlights, lids) are present and sharp.
- marks_texture: the marks look like real brush or pen marks on paper, with paper showing in the lights; ink is judged against the style above. Noise, speckle, stripes, blur, smearing and digital filters are failures.
Then give one overall score from 0 to 10 for it as a painting, weighing the washes and technique.
Blur and smear are failures, not a safe middle. 5 is a competent amateur; 9-10 is the work of a skilled watercolourist.
Reply with JSON only, no prose: {{"composition_values":n,"edges_detail":n,"marks_texture":n,"overall":n}}"""
CRITERIA = ("composition_values", "edges_detail", "marks_texture")


class Refusal(Exception):
    """An input that cannot be scored as asked: the message says which and why."""


def sha(data):
    return hashlib.sha256(data if isinstance(data, bytes) else data.encode()).hexdigest()


def load_rubric(path):
    """(the rubric text the prompt carries, sha256 of the whole file). A missing or changed-shape rubric is refused."""
    if not os.path.isfile(path):
        raise Refusal(f"the human-ness rubric is not at {path}")
    with open(path, "rb") as fh:
        raw = fh.read()
    text = raw.decode("utf8")
    if RUBRIC_CUT not in text:
        raise Refusal(f"the human-ness rubric at {path} has no line starting '{RUBRIC_CUT}': not the rubric this scoring reads")
    return text.split(RUBRIC_CUT)[0].strip(), sha(raw)


def prompt_hashes(rubric):
    return {"sequence": sha(SEQ.format(rubric=rubric, n="{n}", style="{style}")), "single": sha(SINGLE)}


def film(painting):
    """The painting's film: frames.json beside the painting. Refused when there is none, too short, or a frame is missing."""
    d = os.path.dirname(painting)
    f = os.path.join(d, "frames.json")
    if not os.path.isfile(f):
        raise Refusal(f"no film beside {painting} (no frames.json): human-ness is read from the film and cannot be scored without it")
    with open(f) as fh:
        frames = json.load(fh).get("frames") or []
    if len(frames) < MIN_FRAMES:
        raise Refusal(f"the film {f} has {len(frames)} frames; human-ness needs at least {MIN_FRAMES}")
    gone = [x["src"] for x in frames if not os.path.isfile(os.path.join(d, x["src"]))]
    if gone:
        raise Refusal(f"the film {f} names {len(gone)} frame files that are not there (first: {gone[0]})")
    return d, frames


def snapshots(painting):
    """[(file, percent complete)]: twelve evenly spaced film frames, then the finished sheet at 100."""
    d, fr = film(painting)
    n = len(fr)
    idx = [round((i + 1) * (n - 1) / (SNAPSHOTS + 1)) for i in range(SNAPSHOTS)]
    pct = lambda i: round(100 * (fr[i]["position"] if fr[i].get("position") is not None else i / (n - 1)))
    return [(os.path.join(d, fr[i]["src"]), pct(i)) for i in idx] + [(painting, 100)]


def _json(raw):
    raw = re.sub(r"```(?:json)?", "", raw or "")
    a, b = raw.find("{"), raw.rfind("}")
    return json.loads(raw[a:b + 1]) if a >= 0 and b > a else None


def tells(x):
    return sorted({str(t).strip().lower().strip("()") for t in (x or [])} & set(LETTERS))


def parse_sequence(raw, n):
    """A sequence reply as {human, why, snapshots: [{score, tells, note}]}, or None when it is not one of n snapshots."""
    try:
        d = _json(raw)
        s, q = d["snapshots"], d["sequence"]
        if not isinstance(s, list) or len(s) != n or not isinstance(q.get("human"), bool):
            return None
        return {"human": q["human"], "why": str(q.get("why", ""))[:300],
                "snapshots": [{"score": max(1.0, min(5.0, float(x["score"]))), "tells": tells(x.get("tells")), "note": str(x.get("note", ""))[:200]} for x in s]}
    except Exception:
        return None


def parse_single(raw):
    """A single-image reply as {criteria..., overall}, each 0 to 10, or None."""
    for m in reversed(re.findall(r"\{[^{}]*\}", re.sub(r"```(?:json)?", "", raw or ""))):
        try:
            d = json.loads(m)
            return {k: max(0.0, min(10.0, float(d[k]))) for k in CRITERIA + ("overall",)}
        except Exception:
            pass
    return None


def ask(post, model, content, parse, tries=3):
    """(reading, None) or (None, why): up to `tries` calls until a reply parses. `post(model, content)` -> (text, usage)."""
    why = None
    for _ in range(tries):
        try:
            raw, usage = post(model, content)
        except RuntimeError as e:
            why = str(e)[:200]
            continue
        r = parse(raw)
        if r:
            return {**r, "promptTokens": usage.get("prompt_tokens"), "completionTokens": usage.get("completion_tokens")}, None
        why = "no valid reply: " + (raw or "")[:100].replace("\n", " ")
    return None, why


def _full(by_judge, panel, key):
    """(judges with all READINGS valid, faults naming the others)."""
    ok, faults = {}, []
    for m in panel:
        rs = [r for r in by_judge.get(m, []) if r and r.get(key) is not None]
        if len(rs) < READINGS:
            faults.append(f"{m}: {len(rs)} of {READINGS} valid readings")
        else:
            ok[m] = rs[:READINGS]
    return ok, faults


def human(by_judge, panel):
    """The human-ness figure from {judge: [three sequence readings]}. Empty (None figures) with faults when a judge is short."""
    ok, faults = _full(by_judge, panel, "snapshots")
    out = {"percent": None, "meanOf5": None, "thirds": None, "perSnapshot": None, "tells": {}, "yes": 0, "of": 0,
           "sequenceHuman": None, "why": None, "judges": {}, "faults": faults}
    for rs in by_judge.values():
        good = [r for r in rs if r and r.get("snapshots")]
        out["yes"] += sum(1 for r in good if r["human"])
        out["of"] += len(good)
    if faults:
        return out
    n = len(next(iter(ok.values()))[0]["snapshots"])
    per_judge = {m: [statistics.median(r["snapshots"][i]["score"] for r in rs) for i in range(n)] for m, rs in ok.items()}
    per = [sum(p[i] for p in per_judge.values()) / len(per_judge) for i in range(n)]
    film_ = per[:SNAPSHOTS]
    k = SNAPSHOTS // 3
    out.update(perSnapshot=per, meanOf5=sum(film_) / SNAPSHOTS, thirds=[sum(film_[i * k:(i + 1) * k]) / k for i in range(3)],
               judges={m: sum(p[:SNAPSHOTS]) / SNAPSHOTS for m, p in per_judge.items()}, why=ok[panel[0]][0]["why"])
    out["percent"] = 100 * out["meanOf5"] / 5
    # the tally: each judge's first reading, every snapshot shown (12 film snapshots and the finished sheet)
    for rs in ok.values():
        for s in rs[0]["snapshots"]:
            for t in s["tells"]:
                out["tells"][t] = out["tells"].get(t, 0) + 1
    out["tellsOf"] = n * len(ok)
    out["sequenceHuman"] = out["yes"] * 2 > out["of"]
    return out


def quality(by_judge, panel):
    """The single-image figure (0 to 10) from {judge: [three readings]}: the mean of the judges' medians."""
    ok, faults = _full(by_judge, panel, "overall")
    if faults:
        return {"score": None, "judges": {}, "criteria": None, "spread": None, "faults": faults}
    med = {m: statistics.median(r["overall"] for r in rs) for m, rs in ok.items()}
    crit = {c: sum(statistics.median(r[c] for r in rs) for rs in ok.values()) / len(ok) for c in CRITERIA}
    return {"score": sum(med.values()) / len(med), "judges": med, "criteria": crit, "spread": max(med.values()) - min(med.values()), "faults": []}
