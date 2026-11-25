"""What score04.py scores: run folders, or a manifest of them, read into one entry a painting.

Every level's output is read here, each in the form its runner writes:

  Auto, levels 2 to 4   a painter run folder (`npm run paint`): run.json (subject, author), the painting at
                        plate/painting.png or painting.png with its film (frames.json) beside it, usage.json (its
                        level). The original is run.json's subject.sourceAbs; the style the judges are told is read
                        from the subject registry (run.json's subject.registry).
  level 1               a try folder (`bench/scripts/run.mjs --round V3`): run.json with round V3, one painting for
                        each target the try was asked to paint (settings.crops), each at <raw>/out/<target>/final.png
                        with its film in film/. The original and the style are the target's own
                        (bench/v3/crops.json). A target of a benchmark picture (bench/run-sets.json levelOne) is
                        scored under that picture's id, so it stands in one table with the other levels.

A manifest is JSON: a list, or {"runs": [...]}, of folder paths or objects {folder, target?, style?, label?,
subject?, level?, author?}; relative paths are read from the manifest's folder. A manifest is also the SCHEDULE: an
object {subject, level, author, failed: "why"} with no folder stands for a scheduled run that left nothing behind.

A run that FAILED (run.json's failure, a level 1 target with no painting, a scheduled run with no folder) is not
refused and never dropped: it is an entry with `failed` set, shown in the table and counted by the summary as the
bottom of the scale. An input that cannot be read at all (not a run folder, an original not on disk) is refused by
name; nothing is guessed.
"""
import json, os
from PIL import Image

from s04_readings import Refusal

BENCH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEVELS = ("Auto", "L1", "L2", "L3", "L4")


def _load(f):
    try:
        with open(f) as fh:
            return json.load(fh)
    except FileNotFoundError:
        return None


def expand(inputs):
    """[{folder, ...overrides}] from the command line's folders and manifests."""
    out = []
    for a in inputs:
        if os.path.isdir(a):
            out.append({"folder": os.path.abspath(a)})
            continue
        if not (os.path.isfile(a) and a.endswith(".json")):
            raise Refusal(f"{a} is neither a run folder nor a manifest (.json)")
        with open(a) as fh:
            doc = json.load(fh)
        base = os.path.dirname(os.path.abspath(a))
        for x in (doc.get("runs") if isinstance(doc, dict) else doc) or []:
            x = {"folder": x} if isinstance(x, str) else dict(x)
            if not isinstance(x, dict):
                raise Refusal(f"{a}: a manifest entry is a folder path or an object, not {x!r}")
            for k in ("folder", "target"):
                if x.get(k):
                    x[k] = os.path.normpath(os.path.join(base, x[k]))
            out.append(x)
    if not out:
        raise Refusal("nothing to score: give run folders or a manifest")
    return out


def style_of(cls):
    return f"watercolor; the drawing under it: {(cls or {}).get('plain') or (cls or {}).get('value') or 'none'}"


def _level(v):
    """A level as the results name it: Auto, L1 to L4, or None when the run does not say."""
    v = str(v or "")
    v = v if v.startswith("L") or v == "Auto" else "L" + v if v else ""
    return v if v in LEVELS else None


def _failed(x, why, **more):
    """A scheduled run with no painting: kept, with the reason."""
    sid, author, level = more.get("subject") or x.get("subject"), more.get("author") or x.get("author"), more.get("level") or _level(x.get("level"))
    name = more.get("id") or (os.path.basename(x["folder"].rstrip("/")) if x.get("folder") else "--".join(filter(None, [sid, author, level])))
    return {"id": name, "folder": x.get("folder"), "painting": None, "subject": sid, "target": more.get("target") or x.get("target"), "style": x.get("style"),
            "label": x.get("label") or more.get("label") or " ".join(filter(None, [author or name, level if level != "Auto" else None])), "auto": author == "auto", "author": author, "level": level,
            "commit": more.get("commit"), "usage": more.get("usage"), "cheat": None, "failed": str(why)}


def level_one_targets(bench=None):
    """{target: {file, style, subject}} for level 1: its own targets (bench/v3/crops.json) and the public suite's
    (bench/v2/crops.json). `subject` is the benchmark picture a target stands for (bench/run-sets.json), else the
    target's own name."""
    out, bench = {}, bench or BENCH
    for base in ("v2", "v3"):
        doc = _load(os.path.join(bench, base, "crops.json")) or {}
        for c in doc.get("crops", []):
            out[c["task"]] = {"file": os.path.join(bench, base, c["file"]), "style": c.get("style"), "subject": c["task"]}
    for p in (_load(os.path.join(bench, "run-sets.json")) or {}).get("pictures", []):
        if p.get("levelOne") in out:
            out[p["levelOne"]]["subject"] = p["id"]
    return out


def level_one(x, run, bench=None):
    """A level 1 try folder as entries: one for each target the try was asked to paint, failed ones among them."""
    f, painter, n, bench = x["folder"], run.get("painter") or {}, run.get("try"), bench or BENCH
    targets = level_one_targets(bench)
    raw = os.path.join(bench, run.get("raw") or "")
    asked = (run.get("settings") or {}).get("crops") or list((run.get("crops") or {}))
    if not asked:
        raise Refusal(f"{f} is a level 1 try that names no targets (settings.crops)")
    cheat = run.get("cheat") or {}
    out = []
    for crop in asked:
        t = targets.get(crop)
        if not t:
            raise Refusal(f"{f}: level 1 target {crop} is in neither bench/v3/crops.json nor bench/v2/crops.json")
        c = (run.get("crops") or {}).get(crop)
        name = f"{painter.get('key') or os.path.basename(os.path.dirname(f.rstrip('/')))}--L1--{crop}" + (f"--try{n}" if n and n != 1 else "")
        base = {"id": name, "subject": t["subject"], "author": painter.get("key"), "level": "L1", "commit": (run.get("commit") or "")[:8] or None,
                "label": x.get("label") or f"{painter.get('name') or painter.get('key') or 'model'} L1", "target": x.get("target") or t["file"]}
        usage = None
        if c:
            a = c.get("attempt") or {}
            usage = {"level": "L1", "session": {"lookUnits": {"spent": c.get("paintingsRun"), "budget": (run.get("settings") or {}).get("paintingsPerAttempt")}, "wallMinutes": a.get("minutes")},
                     "model": {"tokens": (run.get("session") or {}).get("tokens"), "costUSD": (run.get("session") or {}).get("costUSD")}, "work": c.get("work"),
                     "budget": {"reached": bool(a.get("killedAtCap"))}}
        painting = os.path.join(raw, "out", crop, "final.png")
        why = None
        if not c:
            why = "no painting: " + ((run.get("notPainted") or {}).get(crop) or "the try's record holds none for this target")
        elif c.get("runawayStop"):
            why = "stopped as a runaway (not scored): " + str(c["runawayStop"])[:200]
        elif cheat.get("disqualified"):
            why = "disqualified: " + str(cheat.get("reason") or "its scripts read the target")
        elif not os.path.isfile(painting):
            why = f"the try's record names a painting of {crop}, and {painting} is not on disk"
        if why:
            out.append(_failed(x, why, usage=usage, **base))
            continue
        if not os.path.isfile(base["target"]):
            raise Refusal(f"{f}: the level 1 target's picture {base['target']} is not on disk")
        out.append({**base, "folder": f, "painting": painting, "style": x.get("style") or t["style"],
                    "auto": False, "usage": usage, "cheat": None, "failed": None})
    return out


def entry(x):
    """One input's paintings as a list of entries: its files, subject, original, style, author, level and the
    painter's own records. A failed run is an entry with `failed` set."""
    f = x.get("folder")
    if not f:
        if x.get("failed") and x.get("subject") and x.get("author") and _level(x.get("level")):
            return [_failed(x, x["failed"])]
        raise Refusal(f"a manifest entry names no folder; a scheduled run that left none needs subject, author, level and failed (why): {json.dumps(x)[:200]}")
    if not os.path.isdir(f):
        if x.get("subject") and x.get("author") and _level(x.get("level")):
            return [_failed(x, x.get("failed") or f"the scheduled run left no folder ({f})")]
        raise Refusal(f"run folder {f} does not exist")
    run = _load(os.path.join(f, "run.json"))
    if run and run.get("round") == "V3" and isinstance(run.get("crops"), dict):
        return level_one(x, run)
    painting = next((p for p in (os.path.join(f, "plate", "painting.png"), os.path.join(f, "painting.png")) if os.path.isfile(p)), None)
    run = run or {}
    subj, author = run.get("subject") or {}, run.get("author") or {}
    usage = _load(os.path.join(f, "usage.json"))
    level = "Auto" if author.get("key") == "auto" else _level(x.get("level") or (usage or {}).get("level") or author.get("level"))
    known = {"subject": x.get("subject") or subj.get("id"), "author": author.get("key") or x.get("author"), "level": level,
             "commit": ((run.get("code") or {}).get("commit") or "")[:8] or None, "usage": usage, "label": " ".join(filter(None, [author.get("name"), level if level != "Auto" else None])) or None}
    if run.get("failure"):
        return [_failed(x, run["failure"], **known)]
    if not painting:
        if run and known["subject"]:
            return [_failed(x, "the run folder holds no painting (plate/painting.png or painting.png)", **known)]
        raise Refusal(f"{f} holds no painting (plate/painting.png or painting.png)")
    if not run and not (x.get("target") and x.get("style") and x.get("subject")):
        raise Refusal(f"{f} has no run.json: give subject, target and style for it in a manifest")
    sid = known["subject"]
    target = x.get("target") or subj.get("sourceAbs")
    if not target or not os.path.isfile(target):
        raise Refusal(f"{f}: the subject's original {target or '(none named)'} is not on disk")
    style = x.get("style")
    if not style:
        reg = _load(subj.get("registry") or "") if subj.get("registry") else None
        s = next((s for s in (reg or {}).get("subjects", []) if s.get("id") == sid), None)
        if not s:
            raise Refusal(f"{f}: subject {sid} is not in its registry ({subj.get('registry') or 'none named'}); give style in a manifest")
        style = style_of(s.get("class"))
    cheat = _load(os.path.join(os.path.dirname(painting), "cheat-risk.json"))
    label = x.get("label") or " ".join(filter(None, [author.get("name") or os.path.basename(f), level if level != "Auto" else None]))
    return [{"id": os.path.basename(f.rstrip("/")), "folder": f, "painting": painting, "subject": sid, "target": target,
             "style": style, "label": label, "auto": author.get("key") == "auto", "author": author.get("key"), "level": level,
             "commit": known["commit"], "usage": usage, "cheat": cheat, "failed": None}]


def entries(inputs):
    """Every painting asked for, or a Refusal naming every one that cannot be scored."""
    out, bad = [], []
    for x in expand(inputs):
        try:
            out += entry(x)
        except Refusal as e:
            bad.append(str(e))
    # one picture, one style told to the judges: a level 1 painting of a benchmark picture is read under the style
    # the other levels' paintings of it carry (the registry's), when one is among the inputs
    for e in out:
        other = next((o["style"] for o in out if e["level"] == "L1" and o["level"] != "L1" and o["subject"] == e["subject"] and o.get("style")), None)
        if other:
            e["style"] = other
    ids = [e["id"] for e in out]
    bad += [f"{i} is given twice" for i in sorted({i for i in ids if ids.count(i) > 1})]
    if bad:
        raise Refusal("\n".join(bad))
    return out


def sized(target, painting, tmp, name):
    """(target, painting) files of one size for the algorithmic measurements: the larger is brought down (Lanczos),
    nothing is enlarged."""
    t, p = Image.open(target), Image.open(painting)
    if t.size == p.size:
        return target, painting
    os.makedirs(tmp, exist_ok=True)
    if t.size[0] > p.size[0]:
        out = os.path.join(tmp, name + "-target.png")
        t.convert("RGB").resize(p.size, Image.LANCZOS).save(out)
        return out, painting
    out = os.path.join(tmp, name + "-painting.png")
    p.convert("RGB").resize(t.size, Image.LANCZOS).save(out)
    return target, out
