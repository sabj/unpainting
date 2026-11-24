"""The two judged readings of 0.4's scoring (score04.py), and how a panel's replies become one number each.

HUMAN-NESS, read from the painting's film under the human-ness rubric (bench/docs/human-ness-rubric.md). What the
judges are shown is a named SCHEME (score04.py --snapshots):

  wash10 (the default, owner 23 Nov)
    a  the opening: the untouched paper the painter chose (the film's first frame). Context, not scored.
    b  the drawing frame: the last frame before the first wash. Scored and reported beside the result, NOT in the
       human-ness mean. Absent when nothing was drawn before the first wash.
    c  ten frames evenly spaced from the first wash to the finished sheet: the first is the first wash's frame, the
       tenth is the finished sheet. Human-ness is the mean of these ten, as a percentage of 5.
    The first wash is read from the film's own record (frames.json: each frame's stage, or for the kit's film its
    count of brush strokes), never guessed: a film that does not say where its first wash is, is refused.
  film13 (the scheme before it, kept so an old film can be scored the old way)
    the opening, then twelve frames evenly through the whole film, then the finished sheet; the mean of the twelve
    (the finished sheet is shown last but not counted).

Scores under one scheme are NOT comparable with scores under the other. The judge first says whether this is the order
and the kind of mark a person would use (yes or no), then scores each frame 1 to 5 with lettered tells.

QUALITY AND LIKENESS: one picture alone, scored as a watercolour 0 to 10, not told whether it is an original or a
painting. Originals and paintings are read the same way; a painting's figure is its share of its original's score.

Every judge gives three readings; a judge's figure is the median of its three (per snapshot for human-ness), and
needs all three. The panel's figure is the mean of the judges'. A judge short of three valid readings leaves the
figure empty and is named: never a smaller panel.
"""
import hashlib, json, os, re, statistics

READINGS = 3
LETTERS = "abcdefghij"
# The schemes by name: how many frames make the human-ness mean, and whether the finished sheet is one of them.
SCHEMES = {
    "wash10": {"name": "wash10", "count": 10, "finishedCounts": True,
               "words": "ten frames evenly spaced from the first wash to the finished sheet (the tenth is the finished sheet); the drawing frame, the last before the first wash, is scored beside and not in the mean"},
    "film13": {"name": "film13", "count": 12, "finishedCounts": False,
               "words": "twelve frames evenly through the whole film, then the finished sheet (shown, not counted)"},
}
DEFAULT_SCHEME = "wash10"
# A frame's stage as the painter's film records it (tools/plate): what counts as a wash, and what as drawing.
WASH_STAGES = ("paint", "wash")
DRAWING_STAGES = ("drawing", "pen", "prep", "construction")
KIT_STAGES = ("painting", "dried")   # the kit's film (bench/v2/kit): its frames say how many brush strokes are on the sheet
RUBRIC_CUT = "For each snapshot the judge writes"   # the rubric's own reply format is replaced by the prompts' below

SEQ = """{rubric}

First, the opening: the untouched sheet of paper the painter chose, in its own colour, before any mark. It is context only: do not score it. Then come {n} snapshots of one painting in progress, in order, each labelled only with its percentage complete; the last is the finished sheet. It is a painting in this style: {style}.
First answer for the whole sequence: is this the order and the kind of mark a person would use for this subject? Then score each snapshot.
Reply with JSON only, no prose: {{"sequence":{{"human":true or false,"why":"one sentence"}},"snapshots":[{{"pct":n,"score":1-5,"tells":["a","c"],"note":"one sentence"}}, ... one object for each of the {n} snapshots, in order]}}"""

SEQ_WASH = """{rubric}

First, the opening: the untouched sheet of paper the painter chose, in its own colour, before any mark. It is context only: do not score it. Then come {n} snapshots of one painting in progress, in order, each labelled only with its percentage complete: {drawing}{count} snapshots evenly spaced from the first wash to the finished sheet; the last is the finished sheet. It is a painting in this style: {style}.
First answer for the whole sequence: is this the order and the kind of mark a person would use for this subject? Then score each snapshot.
Reply with JSON only, no prose: {{"sequence":{{"human":true or false,"why":"one sentence"}},"snapshots":[{{"pct":n,"score":1-5,"tells":["a","c"],"note":"one sentence"}}, ... one object for each of the {n} snapshots, in order]}}"""
SEQ_DRAWING = "first the drawing as it stood just before the first wash, then "

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


def sequence_prompt(scheme, rubric, style, n, drawing):
    """The sequence prompt of a scheme for n scored pictures (the drawing frame among them when there is one)."""
    if scheme == "film13":
        return SEQ.format(rubric=rubric, n=n, style=style)
    return SEQ_WASH.format(rubric=rubric, n=n, style=style, count=SCHEMES[scheme]["count"], drawing=SEQ_DRAWING if drawing else "")


def prompt_hashes(rubric, scheme=DEFAULT_SCHEME):
    return {"sequence": sha(sequence_prompt(scheme, rubric, "{style}", "{n}", True)), "single": sha(SINGLE)}


def film(painting, least=2):
    """The painting's film: frames.json beside the painting. Refused when there is none, too short, or a frame is missing."""
    d = os.path.dirname(painting)
    f = os.path.join(d, "frames.json")
    if not os.path.isfile(f):
        raise Refusal(f"no film beside {painting} (no frames.json): human-ness is read from the film and cannot be scored without it")
    with open(f) as fh:
        frames = json.load(fh).get("frames") or []
    if len(frames) < least:
        raise Refusal(f"the film {f} has {len(frames)} frames; human-ness needs at least {least}")
    gone = [x["src"] for x in frames if not os.path.isfile(os.path.join(d, x["src"]))]
    if gone:
        raise Refusal(f"the film {f} names {len(gone)} frame files that are not there (first: {gone[0]})")
    return d, frames


def _pct(fr, i):
    return round(100 * (fr[i]["position"] if fr[i].get("position") is not None else i / (len(fr) - 1)))


def first_wash(frames, where="the film"):
    """(index of the first wash's frame, whether anything was drawn before it), read from the film's own record.

    The painter's film names each frame's stage: the first wash is the first frame of stage 'paint' or 'wash', and a
    frame of a drawing stage before it means something was drawn first. The kit's film counts the brush strokes on
    the sheet in each frame ('brush'): the first wash is the first frame with one, and frames before it holding
    strokes (pen or pencil) are drawing. A film that says neither is refused: the first wash is never guessed."""
    kit = [f for f in frames if f.get("stage") in KIT_STAGES]
    if kit and any(f.get("brush") is None for f in kit):
        raise Refusal(f"{where} is a kit film that does not record its brush strokes frame by frame, so it does not say where its first wash is: score it with --snapshots film13")
    is_wash = lambda f: f["brush"] > 0 if f.get("brush") is not None else f.get("stage") in WASH_STAGES
    w = next((i for i, f in enumerate(frames) if is_wash(f)), None)
    if w is None:
        raise Refusal(f"{where} records no wash (no frame of stage {' or '.join(WASH_STAGES)}, and no brush stroke counted): the ten snapshots start at the first wash, and it is never guessed. An old film can be scored with --snapshots film13")
    if w == 0:
        raise Refusal(f"{where} starts with a wash already on the sheet: its first frame is not the untouched paper")
    drawn = any(f.get("stage") in DRAWING_STAGES or (f.get("brush") == 0 and (f.get("strokes") or 0) > 0) for f in frames[:w])
    return w, drawn


def frames_for(painting, scheme=DEFAULT_SCHEME):
    """What the judges are shown for one painting under a scheme:
    {scheme, opening: file, drawing: (file, pct) or None, snapshots: [(file, pct)] in order (the finished sheet last),
     firstWash: {frame, pct} or None}. `snapshots` holds the scheme's counted frames (and film13's finished sheet)."""
    if scheme not in SCHEMES:
        raise Refusal(f"--snapshots: one of {', '.join(SCHEMES)}, not {scheme!r}")
    count = SCHEMES[scheme]["count"]
    if scheme == "film13":
        d, fr = film(painting, count + 2)   # the twelve are taken strictly between the first frame (the paper) and the last
        n = len(fr)
        idx = [round((i + 1) * (n - 1) / (count + 1)) for i in range(count)]
        return {"scheme": scheme, "opening": opening(painting), "drawing": None, "firstWash": None,
                "snapshots": [(os.path.join(d, fr[i]["src"]), _pct(fr, i)) for i in idx] + [(painting, 100)]}
    d, fr = film(painting)
    w, drawn = first_wash(fr, f"the film beside {painting}")
    last = len(fr) - 1
    if last - w < count - 1:
        raise Refusal(f"the film beside {painting} has {last - w + 1} frames from its first wash (frame {w}) to the finished sheet; the ten snapshots need at least {count}")
    idx = [w + round(i * (last - w) / (count - 1)) for i in range(count - 1)]
    return {"scheme": scheme, "opening": opening(painting), "firstWash": {"frame": w, "pct": _pct(fr, w)},
            "drawing": (os.path.join(d, fr[w - 1]["src"]), _pct(fr, w - 1)) if drawn else None,
            "snapshots": [(os.path.join(d, fr[i]["src"]), _pct(fr, i)) for i in idx] + [(painting, 100)]}


def snapshots(painting):
    """film13's scored pictures, as before: twelve evenly spaced film frames, then the finished sheet at 100."""
    return frames_for(painting, "film13")["snapshots"]


def opening(painting):
    """The opening picture, shown before the snapshots and not scored: the film's first frame, the untouched paper the
    painter chose. A film that does not start with the untouched paper is refused."""
    d, fr = film(painting)
    if fr[0].get("stage") != "paper":
        raise Refusal(f"the film beside {painting} does not start with the untouched paper (its first frame is stage {fr[0].get('stage')!r}, not 'paper'): the judges are shown it as the opening")
    return os.path.join(d, fr[0]["src"])


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


def human(by_judge, panel, scheme="film13", drawing=False):
    """The human-ness figure from {judge: [three sequence readings]}. Empty (None figures) with faults when a judge is short.

    `scheme` names what the readings were of (SCHEMES); `drawing`: the first scored picture is the drawing frame, which
    is reported ("drawing", of 5) and is not in the mean. The mean is of the scheme's counted frames: wash10's ten
    (the finished sheet is the tenth), film13's twelve (the finished sheet, shown last, is not counted)."""
    sc = SCHEMES[scheme]
    count, d = sc["count"], 1 if drawing else 0
    ok, faults = _full(by_judge, panel, "snapshots")
    out = {"scheme": scheme, "percent": None, "meanOf5": None, "thirds": None, "perSnapshot": None, "drawing": None, "tells": {}, "yes": 0, "of": 0,
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
    film_ = per[d:d + count]
    k = count // 3
    cuts = [0, k, count - k, count]   # twelve: 4, 4, 4; ten: 3, 4, 3
    out.update(perSnapshot=per, meanOf5=sum(film_) / count, thirds=[sum(film_[cuts[i]:cuts[i + 1]]) / (cuts[i + 1] - cuts[i]) for i in range(3)],
               drawing=per[0] if drawing else None,
               judges={m: sum(p[d:d + count]) / count for m, p in per_judge.items()}, why=ok[panel[0]][0]["why"])
    out["percent"] = 100 * out["meanOf5"] / 5
    # the tally: each judge's first reading, every scored picture shown
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
