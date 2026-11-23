"""What score04.py scores: run folders, or a manifest of them, read into one entry a painting.

A run folder holds run.json (subject, author) and the painting, plate/painting.png or painting.png, with its film
(frames.json) beside it. The subject's original is run.json's subject.sourceAbs, and the style the judges are told is
read from the subject registry (run.json's subject.registry). A manifest is JSON: a list, or {"runs": [...]}, of
folder paths or objects {folder, target?, style?, label?}; relative paths are read from the manifest's folder.
Anything missing is refused by name; nothing is guessed.
"""
import json, os
from PIL import Image

from s04_readings import Refusal


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
            for k in ("folder", "target"):
                if x.get(k):
                    x[k] = os.path.normpath(os.path.join(base, x[k]))
            out.append(x)
    if not out:
        raise Refusal("nothing to score: give run folders or a manifest")
    return out


def style_of(cls):
    return f"watercolor; the drawing under it: {(cls or {}).get('plain') or (cls or {}).get('value') or 'none'}"


def entry(x):
    """One painting: its files, subject, original, style, author and the painter's own records."""
    f = x["folder"]
    if not os.path.isdir(f):
        raise Refusal(f"run folder {f} does not exist")
    painting = next((p for p in (os.path.join(f, "plate", "painting.png"), os.path.join(f, "painting.png")) if os.path.isfile(p)), None)
    if not painting:
        raise Refusal(f"{f} holds no painting (plate/painting.png or painting.png)")
    run = _load(os.path.join(f, "run.json"))
    if run is None and not (x.get("target") and x.get("style") and x.get("subject")):
        raise Refusal(f"{f} has no run.json: give subject, target and style for it in a manifest")
    run = run or {}
    if run.get("failure"):
        raise Refusal(f"{f} is a failed run ({run['failure']}): not scored")
    subj = run.get("subject") or {}
    sid = x.get("subject") or subj.get("id")
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
    author = run.get("author") or {}
    usage = _load(os.path.join(f, "usage.json"))
    cheat = _load(os.path.join(os.path.dirname(painting), "cheat-risk.json"))
    level = str((usage or {}).get("level") or "")
    label = x.get("label") or " ".join(filter(None, [author.get("name") or os.path.basename(f), level if level.startswith("L") or not level else "L" + level]))
    return {"id": os.path.basename(f.rstrip("/")), "folder": f, "painting": painting, "subject": sid, "target": target,
            "style": style, "label": label, "auto": author.get("key") == "auto", "author": author.get("key"),
            "commit": ((run.get("code") or {}).get("commit") or "")[:8] or None, "usage": usage, "cheat": cheat}


def entries(inputs):
    """Every painting asked for, or a Refusal naming every one that cannot be scored."""
    out, bad = [], []
    for x in expand(inputs):
        try:
            out.append(entry(x))
        except Refusal as e:
            bad.append(str(e))
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
