"""The judged readings of 0.4's scoring (score04.py), and how a panel's replies become one number each.

HUMAN-NESS, read from the painting's film under the human-ness rubric (bench/docs/human-ness-rubric.md). It is about
the painting BEING MADE. What the judges are shown is a named SCHEME (score04.py --snapshots):

  progress10 (the default, lead 23 Nov)
    a  the opening: the untouched paper the painter chose (the film's first frame). Context, not scored.
    b  the drawing frame: the last frame before the first wash. Scored and reported beside the result, NOT in the
       human-ness mean. Absent when nothing was drawn before the first wash.
    c  ten stills of the painting in progress, from the first wash to just before the finish. Human-ness is the
       mean of these ten, as a percentage of 5.
    d  the finished sheet, shown last: scored and reported beside, NOT in the mean (it feeds quality and likeness).
    WHERE the ten are taken is decided by PROGRESS, never by the film's frame numbers: a frame's progress is the
    share of the finished picture that is on the sheet (progress()), measured from the pictures themselves, so how
    densely a film was recorded, and strokes that leave no mark, cannot move which moments are judged. The ten are
    at equal steps of progress from the sheet as it stood before the first wash: step 0 (the first wash's frame) to
    step 9, nine tenths of the way to the finished sheet. Each still is labelled with its progress on that measure.
    The first wash is read from the film's own record (frames.json: each frame's stage, or for the kit's film its
    count of brush strokes), never guessed: a film that does not say where its first wash is, is refused.
  film13 (the first scheme, kept so an old film can be scored the old way)
    the opening, then twelve frames evenly through the whole film by frame number, then the finished sheet; the mean
    of the twelve (the finished sheet is shown last but not counted).

Scores under one scheme are NOT comparable with scores under the other, nor with the short-lived wash10 (ten frames by
frame number, the finished sheet counted), which is gone. The judge first says whether this is the order and the kind
of mark a person would use (yes or no), then scores each frame 1 to 5 with lettered tells. Human-ness is BLIND to the
original on purpose (owner: "the humanness judge excludes the original to be fair").

QUALITY: one picture alone, scored as a watercolour 0 to 10, not told whether it is an original or a painting.
Originals and paintings are read the same way; a painting's figure is its share of its original's score. The judge of
a painting's quality never sees its original.

LIKENESS: the original and the finished painting shown together; how well the painting is a painting OF that picture
(subject, composition, tones, colour; not a pixel-for-pixel copy), 1 to 5 with a short reason. Reported in its own
column; not part of the combined figure.

Every judge gives three readings; a judge's figure is the median of its three (per snapshot for human-ness), and
needs all three. The panel's figure is the mean of the judges'. A judge short of three valid readings leaves the
figure empty and is named: never a smaller panel.
"""
import hashlib, json, math, os, re, statistics

READINGS = 3
LETTERS = "abcdefghij"
# The schemes by name: how many frames make the human-ness mean, and whether the finished sheet is one of them.
SCHEMES = {
    "progress10": {"name": "progress10", "count": 10, "finishedCounts": False, "spacedBy": "progress: the share of the finished picture on the sheet, measured from the frames themselves",
                   "words": "ten stills of the painting in progress at equal steps of progress from the first wash to just before the finish; the drawing frame (the last before the first wash) and the finished sheet are scored beside and are not in the mean"},
    "film13": {"name": "film13", "count": 12, "finishedCounts": False, "spacedBy": "the film's frame numbers",
               "words": "twelve frames evenly through the whole film, then the finished sheet (shown, not counted)"},
}
DEFAULT_SCHEME = "progress10"
GONE = {"wash10": "wash10 (ten frames by frame number, the finished sheet counted) was replaced on 23 Nov 2026 by progress10 (ten stills in progress by measured progress, the finished sheet beside); its scores are not comparable with either scheme"}
PROGRESS_SIDE = 192   # the long side the frames are brought down to for the progress measure
# A frame's stage as the painter's film records it (tools/plate): what counts as a wash, and what as drawing.
WASH_STAGES = ("paint", "wash")
DRAWING_STAGES = ("drawing", "pen", "prep", "construction")
KIT_STAGES = ("painting", "dried")   # the kit's film (bench/v2/kit): its frames say how many brush strokes are on the sheet
RUBRIC_CUT = "For each snapshot the judge writes"   # the rubric's own reply format is replaced by the prompts' below

SEQ = """{rubric}

First, the opening: the untouched sheet of paper the painter chose, in its own colour, before any mark. It is context only: do not score it. Then come {n} snapshots of one painting in progress, in order, each labelled only with its percentage complete; the last is the finished sheet. It is a painting in this style: {style}.
First answer for the whole sequence: is this the order and the kind of mark a person would use for this subject? Then score each snapshot.
Reply with JSON only, no prose: {{"sequence":{{"human":true or false,"why":"one sentence"}},"snapshots":[{{"pct":n,"score":1-5,"tells":["a","c"],"note":"one sentence"}}, ... one object for each of the {n} snapshots, in order]}}"""

SEQ_PROGRESS = """{rubric}

First, the opening: the untouched sheet of paper the painter chose, in its own colour, before any mark. It is context only: do not score it. Then come {n} snapshots of one painting, in order, each labelled only with how much of the finished picture is on the sheet: {drawing}{count} snapshots of the painting in progress, from the first wash to just before the finish, and last the finished sheet. It is a painting in this style: {style}.
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

QUALITY_ANCHORED = """You are a demanding master watercolour juror judging the watercolour craft of Image 2 (the CANDIDATE painting).
Style expected: {style}.

Image 1 is a REFERENCE watercolour that calibrates the 9.0/10 craft standard on this scale (a candidate can match or exceed 9.0 if its craft warrants it).
Judge WATERCOLOUR CRAFT ALONE — not whether Image 2 copies Image 1's exact subject or layout (likeness is scored separately). Even if Image 2 depicts a different scene or simplifies the scene loosely, judge how well Image 2 works as a painting in its own right.

Rules of craft:
- Loose, economical, expressive watercolour (broad flowing wet washes, suggested forms, luminous preserved white paper, varied hard/soft/lost edges) is a strength ONLY when the washes, edges, and values genuinely cohere like a skilled painter's work. Do NOT excuse sloppy, blocky, flat, striped, or amateur paint as "loose."
- Conversely, if crisp pencil or pen linework carries the drawing while the washes sitting over it are flat, patchy, timid, muddy, or pasted-on, judge the washes harshly (in pen-and-wash, expressive ink linework counts as part of the craft, but washes must still show transparent value and edge control).
- Apply a low band whenever there is a visible, consequential defect ANYWHERE on the sheet (even localized opaque black/tar smears, neon/radioactive patches, or dead slabs ruin a watercolour):
  - 0.0–2.5: Catastrophic paint failure — ANY radioactive/neon oversaturation, opaque pitch-black/tar/navy blobs or slabs, severe digital/rendering artifacts, or chaotic unreadable messes.
  - 2.6–4.5: Poor watercolour — garish/unnatural colour clashes, heavy muddy overworking, crude pasted-on cutout shapes, or harsh dry-stripe fills that fight the form.
  - 4.6–6.0: Mediocre/amateur — readable picture, but washes are visibly flat, timid, washed-out, patchy, overworked, or lacking clear light-to-dark value hierarchy and convincing wet-edge variety.
  - 6.1–7.5: Competent/good — genuine transparent washes, clear light-to-dark structure, believable pigment harmony, and varied edges, with some stiff or simplified passages.
  - 7.6–8.5: Strong/skilled — luminous preserved paper whites, confident graded or wet-in-wet washes, deliberate hard/soft/lost edge control, cohesive colour harmony and depth.
  - 8.6–10.0: Master-level — rivals or exceeds the 9.0/10 reference benchmark in watercolour craft and expressive control.

Rate from 0.0 to 10.0 (decimals allowed):
- wash_craft: transparency, wet/dry edge variety, brushwork quality, absence of slabs/stripes/artifacts.
- value_light: light-to-dark structure, preserved white paper, modelling of form and depth.
- colour_harmony: believable, cohesive watercolour pigments and temperature control.
- overall: holistic watercolour craft score respecting the scale and defect bands above.

Reply with JSON only, no prose: {{"wash_craft":n,"value_light":n,"colour_harmony":n,"overall":n,"critique":"one blunt sentence"}}"""
ANCHORED_CRITERIA = ("wash_craft", "value_light", "colour_harmony")
QUALITY_VERSUS_AUTO = """You are an experienced watercolour juror comparing two paintings (Painting A and Painting B) made in a watercolour simulator, shown beside the Original watercolour they are based on.
Style expected: {style}.

Judge WATERCOLOUR CRAFT of Painting A and Painting B beside the Original:
- Look for luminous preserved white paper, transparent washes, confident wet-in-wet and hard/soft/lost edge variety, clear light-to-dark value hierarchy, cohesive colour harmony, and believable brushwork.
- Penalize flat pasted-on shapes, muddy/overworked washes, harsh dry stripes, timid washed-out tone, or digital/opaque artifacts.
- Do NOT assign a score to the Original; use it purely as the real watercolour reference.
- Score BOTH Painting A and Painting B from 0.0 to 10.0 (decimals allowed) using the full range where warranted, and avoid identical scores unless the two paintings are genuinely indistinguishable in craft.

Reply with JSON only, no prose: {{"score_a":n,"score_b":n,"winner":"A"|"B"|"tie","why":"one concise sentence"}}"""
QUALITY_MODES = ("blind", "anchored", "versus-auto")

LIKENESS = """Two pictures follow. The first is an original picture. The second is a painting made of it, in this style: {style}.
Judge one thing only: how well is the second a painting OF the first? Look at the subject, the composition and the placing of the big shapes, the pattern of light and dark, and the colour. It is a painting, not a copy: do not ask for it to match the original mark for mark or pixel for pixel, and do not judge how well it is painted.
Score its likeness from 1 to 5:
5: unmistakably this picture: subject, composition, tones and colour all carried over.
4: clearly this picture, with one of them noticeably off.
3: the subject and the composition are there, but tones or colour are plainly different, or a main part is missing.
2: only loosely this picture: the subject can be made out, the rest is not the original's.
1: a different picture, or the subject cannot be recognised.
Reply with JSON only, no prose: {{"likeness":1-5,"why":"one short sentence"}}"""
LIKENESS_FLAG = 1.5   # a painting whose likeness is at or under this, the bottom of the scale, is flagged in the table


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
    return SEQ_PROGRESS.format(rubric=rubric, n=n, style=style, count=SCHEMES[scheme]["count"], drawing=SEQ_DRAWING if drawing else "")


def prompt_hashes(rubric, scheme=DEFAULT_SCHEME, quality_mode="blind"):
    q = QUALITY_VERSUS_AUTO if quality_mode == "versus-auto" else (QUALITY_ANCHORED if quality_mode == "anchored" else SINGLE)
    return {"sequence": sha(sequence_prompt(scheme, rubric, "{style}", "{n}", True)), "single": sha(q), "likeness": sha(LIKENESS)}


def film(painting, least=2):
    """The painting's film: frames.json beside the painting (the painter's), or in film/ beside it (the level 1
    kit's). Refused when there is none, too short, or a frame is missing."""
    d = os.path.dirname(painting)
    if not os.path.isfile(os.path.join(d, "frames.json")) and os.path.isfile(os.path.join(d, "film", "frames.json")):
        d = os.path.join(d, "film")
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
        raise Refusal(f"{where} records no wash (no frame of stage {' or '.join(WASH_STAGES)}, and no brush stroke counted): the ten stills start at the first wash, and it is never guessed. An old film can be scored with --snapshots film13")
    if w == 0:
        raise Refusal(f"{where} starts with a wash already on the sheet: its first frame is not the untouched paper")
    drawn = any(f.get("stage") in DRAWING_STAGES or (f.get("brush") == 0 and (f.get("strokes") or 0) > 0) for f in frames[:w])
    return w, drawn


def progress(d, frames, side=PROGRESS_SIDE):
    """Each frame's progress, 0 to 1: the share of the finished picture that is on the sheet.

    Measured from the pictures: with P the untouched paper (the first frame) and F the finished sheet (the last),
    a frame X has progress 1 - |X - F| / |P - F| (summed absolute difference, the frames brought down to one small
    size), never below an earlier frame's (a wet passage that dries back, or a mark later covered, does not undo
    progress). It does not read the frame numbers, the stroke counts or the clock: a film recorded twice as densely,
    or padded with strokes that leave no mark, has the same progress at the same moments."""
    import numpy as np
    from PIL import Image

    def load(src, size=None):
        with Image.open(os.path.join(d, src)) as im:
            im = im.convert("RGB")
            if size is None:
                k = side / max(im.size)
                size = (max(1, round(im.size[0] * k)), max(1, round(im.size[1] * k))) if k < 1 else im.size
            return np.asarray(im.resize(size, Image.BOX) if im.size != size else im, dtype=np.float32), size

    last, size = load(frames[-1]["src"])
    paper, _ = load(frames[0]["src"], size)
    whole = float(np.abs(paper - last).sum())
    if whole <= 0:
        raise Refusal(f"the film in {d} ends as it began: the finished sheet is the untouched paper, and progress cannot be measured")
    out, top = [], 0.0
    for fr in frames[:-1]:
        top = max(top, min(1.0, 1.0 - float(np.abs(load(fr["src"], size)[0] - last).sum()) / whole))
        out.append(top)
    return out + [1.0]


def stills(prog, w, count):
    """The frames of `count` stills at equal steps of progress from the first wash (frame w) to just before the finish.
    The steps start from the sheet as it stood before the first wash (frame w - 1, whose content does not depend on
    how densely the washes were filmed). When a broad early wash jumps across several progress targets at once, the
    remaining stills are re-spaced across the remaining progress (prog[i] .. 1.0) rather than piling duplicate stills on
    one plateau. Each still is a frame of its own, before the last (the finished sheet)."""
    end = len(prog) - 2   # the last frame is the finished sheet, never one of the stills
    if end - w + 1 < count:
        raise Refusal(f"{end - w + 1} frames from the first wash (frame {w}) to just before the finished sheet; the {count} stills need at least {count}")
    idx = []
    anchor = prog[w - 1]
    anchor_k = 0
    for k in range(count):
        if k == 0:
            i = w
        else:
            steps_left = count - anchor_k
            t = anchor + (k - anchor_k) * (1.0 - anchor) / steps_left
            lo = idx[-1] + 1
            hi = end - (count - 1 - k)
            i = next((j for j in range(lo, hi + 1) if prog[j] >= t - 1e-9), hi)
            # If this frame jumped past the next progress target, re-anchor the remaining steps from prog[i]
            # so later stills distribute across the remaining visual progress instead of stacking on one plateau.
            if k + 1 < count:
                next_t = anchor + (k + 1 - anchor_k) * (1.0 - anchor) / steps_left
                if prog[i] >= next_t - 1e-9 and prog[i] < 1.0 - 1e-6:
                    anchor = prog[i]
                    anchor_k = k
        idx.append(i)
    for k in range(count - 1, -1, -1):   # safety clamp so stills stay strictly increasing before the finish
        idx[k] = min(idx[k], end - (count - 1 - k))
    return idx


def frames_for(painting, scheme=DEFAULT_SCHEME, measure=progress):
    """What the judges are shown for one painting under a scheme:
    {scheme, opening: file, drawing: (file, pct) or None, snapshots: [(file, pct)] in order (the finished sheet last),
     firstWash: {frame, pct} or None, frames: the film's frame number of each snapshot}. `snapshots` holds the
    scheme's counted frames and then the finished sheet. Under progress10 a pct is the frame's measured progress;
    under film13 its place in the film."""
    if scheme in GONE:
        raise Refusal(f"--snapshots {scheme}: {GONE[scheme]}")
    if scheme not in SCHEMES:
        raise Refusal(f"--snapshots: one of {', '.join(SCHEMES)}, not {scheme!r}")
    count = SCHEMES[scheme]["count"]
    if scheme == "film13":
        d, fr = film(painting, count + 2)   # the twelve are taken strictly between the first frame (the paper) and the last
        n = len(fr)
        idx = [round((i + 1) * (n - 1) / (count + 1)) for i in range(count)]
        return {"scheme": scheme, "opening": opening(painting), "drawing": None, "firstWash": None, "frames": idx,
                "snapshots": [(os.path.join(d, fr[i]["src"]), _pct(fr, i)) for i in idx] + [(painting, 100)]}
    d, fr = film(painting)
    where = f"the film beside {painting}"
    w, drawn = first_wash(fr, where)
    try:
        prog = measure(d, fr)
        idx = stills(prog, w, count)
    except Refusal as e:
        raise Refusal(f"{where}: {e}") from None
    pc = lambda i: round(100 * prog[i])
    return {"scheme": scheme, "opening": opening(painting), "firstWash": {"frame": w, "pct": pc(w)}, "frames": idx,
            "drawing": (os.path.join(d, fr[w - 1]["src"]), pc(w - 1)) if drawn else None,
            "snapshots": [(os.path.join(d, fr[i]["src"]), pc(i)) for i in idx] + [(painting, 100)]}


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


def _finite_clamp(val, lo, hi):
    if isinstance(val, bool):
        raise ValueError("bool is not a numeric score")
    v = float(val)
    if not math.isfinite(v):
        raise ValueError(f"non-finite score {v!r}")
    return max(lo, min(hi, v))


def _finite_in(val, lo, hi):
    if isinstance(val, bool):
        raise ValueError("bool is not a numeric score")
    v = float(val)
    if not math.isfinite(v) or v < lo or v > hi:
        raise ValueError(f"score {v!r} out of [{lo}, {hi}]")
    return v


def parse_sequence(raw, n):
    """A sequence reply as {human, why, snapshots: [{score, tells, note}]}, or None when it is not one of n snapshots."""
    try:
        d = _json(raw)
        s, q = d["snapshots"], d["sequence"]
        if not isinstance(s, list) or len(s) != n or not isinstance(q.get("human"), bool):
            return None
        return {"human": q["human"], "why": str(q.get("why", ""))[:300],
                "snapshots": [{"score": _finite_clamp(x["score"], 1.0, 5.0), "tells": tells(x.get("tells")), "note": str(x.get("note", ""))[:200]} for x in s]}
    except Exception:
        return None


def parse_single(raw):
    """A single-image reply as {criteria..., overall}, each 0 to 10, or None."""
    for m in reversed(re.findall(r"\{[^{}]*\}", re.sub(r"```(?:json)?", "", raw or ""))):
        try:
            d = json.loads(m)
            return {k: _finite_clamp(d[k], 0.0, 10.0) for k in CRITERIA + ("overall",)}
        except Exception:
            pass
    return None


def parse_anchored(raw):
    """A reference-anchored quality reply as {wash_craft, value_light, colour_harmony, overall, critique}, or None."""
    for m in reversed(re.findall(r"\{[^{}]*\}", re.sub(r"```(?:json)?", "", raw or ""))):
        try:
            d = json.loads(m)
            out = {k: _finite_in(d[k], 0.0, 10.0) for k in ANCHORED_CRITERIA + ("overall",)}
            if d.get("critique"):
                out["critique"] = str(d["critique"])[:300]
            return out
        except Exception:
            pass
    return None


def parse_versus_auto(raw, cand_is_a=True):
    """A side-by-side Candidate-vs-Auto craft reply as {overall, autoScore, diffVsAuto, win, critique}, or None."""
    for m in reversed(re.findall(r"\{[^{}]*\}", re.sub(r"```(?:json)?", "", raw or ""))):
        try:
            d = json.loads(m)
            sa = _finite_in(d["score_a"], 0.0, 10.0)
            sb = _finite_in(d["score_b"], 0.0, 10.0)
            cand, auto = (sa, sb) if cand_is_a else (sb, sa)
            w_raw = str(d.get("winner") or ("A" if sa > sb else "B" if sb > sa else "tie")).strip().upper()
            if w_raw not in ("A", "B", "TIE"):
                w_raw = "A" if sa > sb else "B" if sb > sa else "TIE"
            win = "cand" if ((cand_is_a and w_raw == "A") or (not cand_is_a and w_raw == "B")) else ("auto" if w_raw in ("A", "B") else "tie")
            out = {"overall": cand, "autoScore": auto, "diffVsAuto": round(cand - auto, 3), "win": win}
            if d.get("why"):
                out["critique"] = str(d["why"])[:300]
            return out
        except Exception:
            pass
    return None


def parse_likeness(raw):
    """A likeness reply as {likeness: 1 to 5, why}, or None."""
    for m in reversed(re.findall(r"\{[^{}]*\}", re.sub(r"```(?:json)?", "", raw or ""))):
        try:
            d = json.loads(m)
            v = _finite_in(d["likeness"], 1.0, 5.0)
            return {"likeness": v, "why": str(d.get("why", ""))[:200]}
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
            return {**r, "promptTokens": usage.get("prompt_tokens"), "completionTokens": usage.get("completion_tokens"),
                    **({"reasoningTokens": usage["reasoning_tokens"]} if usage.get("reasoning_tokens") else {})}, None
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
    is reported ("drawing", of 5) and is not in the mean. The mean is of the scheme's counted frames: progress10's ten
    stills in progress, film13's twelve. The finished sheet, shown last, is reported ("finished", of 5) and never
    counted."""
    sc = SCHEMES[scheme]
    count, d = sc["count"], 1 if drawing else 0
    ok, faults = _full(by_judge, panel, "snapshots")
    out = {"scheme": scheme, "percent": None, "meanOf5": None, "thirds": None, "perSnapshot": None, "drawing": None, "finished": None, "tells": {}, "yes": 0, "of": 0,
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
               drawing=per[0] if drawing else None, finished=per[d + count] if n > d + count else None,
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


def quality(by_judge, panel, criteria=CRITERIA):
    """The quality figure (0 to 10) from {judge: [three readings]}: the mean of the judges' medians."""
    ok, faults = _full(by_judge, panel, "overall")
    if faults:
        return {"score": None, "judges": {}, "criteria": None, "spread": None, "faults": faults}
    med = {m: statistics.median(r["overall"] for r in rs) for m, rs in ok.items()}
    crit = {c: sum(statistics.median(r[c] for r in rs) for rs in ok.values()) / len(ok) for c in criteria if all(c in r for rs in ok.values() for r in rs)}
    critiques = {m: rs[0].get("critique") for m, rs in ok.items() if rs[0].get("critique")}
    extra = {}
    if all("autoScore" in r and "diffVsAuto" in r for rs in ok.values() for r in rs):
        a_med = {m: statistics.median(r["autoScore"] for r in rs) for m, rs in ok.items()}
        d_med = {m: statistics.median(r["diffVsAuto"] for r in rs) for m, rs in ok.items()}
        all_r = [r for rs in ok.values() for r in rs]
        wins = sum(1.0 for r in all_r if r.get("win") == "cand") + 0.5 * sum(1.0 for r in all_r if r.get("win") == "tie")
        extra = {"autoScore": round(sum(a_med.values()) / len(a_med), 3),
                 "diffVsAuto": round(sum(d_med.values()) / len(d_med), 3),
                 "diffJudges": {m: round(v, 3) for m, v in d_med.items()},
                 "winPct": round(100.0 * wins / max(1, len(all_r)), 1)}
    return {"score": sum(med.values()) / len(med), "judges": med, "criteria": crit or None, "spread": max(med.values()) - min(med.values()),
            **extra, **({"critiques": critiques} if critiques else {}), "faults": []}


def likeness(by_judge, panel):
    """The likeness figure (1 to 5) from {judge: [three readings]}: the mean of the judges' medians. `flagged`: at the
    bottom of the scale (LIKENESS_FLAG or under): the painting may not be a painting of its original at all."""
    ok, faults = _full(by_judge, panel, "likeness")
    if faults:
        return {"score": None, "judges": {}, "why": None, "flagged": None, "faults": faults}
    med = {m: statistics.median(r["likeness"] for r in rs) for m, rs in ok.items()}
    score = sum(med.values()) / len(med)
    return {"score": score, "judges": med, "why": ok[panel[0]][0]["why"], "flagged": score <= LIKENESS_FLAG, "flagAt": LIKENESS_FLAG, "faults": []}
