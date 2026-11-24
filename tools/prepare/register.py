#!/usr/bin/env python3
# register.py (the registry writer; it was paintings/make-subjects.py in the preparation folder, outside git, until 0.4 rc7).
# Run with UNPAINT_PREP set to the preparation folder; SUBJECTS_JSON names another file to write (a trial, a test).
# A picture of the benchmark is ALSO registered under the one-area sheet rule, as a second record whose id ends in -qs
# (RULE_IDS below): same source, studies, lay-in, labels and seed as the earlier record, the sheet sized by the rule,
# and its drawing vectors fitted again at that sheet (replay/vectors/<id>-qs-std-*). The earlier record is not changed.
# register.py: writes SUBJECTS.json, the one list of subjects, from the table below and what is on disk.
#   register.py            write SUBJECTS.json if it does not exist; else print what would change and stop
#   register.py --repin-only PART...   repin only the inputs whose path or stem contains a PART (others keep their pins;
#                               every class stays as it is: a class change needs a full --repin, after the classifier and the lead agree)
#   register.py --repin --freeze-classes   a full repin that keeps every picture label (class.value) as it is
#   register.py --repin    rewrite it: every hash is pinned again from the files as they are now (say why in the commit
#                               or the note; a repin makes every plate rendered before it non-comparable for the files it changed)
# The table here is the only hand-written part: roles, sources, crops, the artist-line rule. Classes come from
# classify/<id>.json (the classifier, step 0), study seeds from segaudit/seed-choice.json (the segmentation auditor), hashes,
# sizes and generation records from the files and the run records. Nothing is inferred from a file name.
import json, os, re, sys, time, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from subjects_lib import R, MANIFEST, sha256, image_size, sheet_for, standard_sheet, RULE_NAME, RULE_SUFFIX, CELL_MM, MAX_LONG
from prep_root import prep_python, REPO

PY = prep_python()
# The hand-written table of pictures (names, sources, provenance, crops, the owner's rulings) is data, not code: it is
# read from subjects-table.json beside this file. Nothing below names a picture.
T = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "subjects-table.json")))
S = "handoff/sources/"
I = "studio/img/"
GEN = "made by an image generator"
HAND = "by the artist's hand"
# name, file id, role, source, provenance, note on the source
# The order is the studio's order (the owner, 21 Nov): the Kasha group, Mittens, Yale, the museum pictures.
SPEC = [tuple(x) for x in T["SPEC"]]
# The benchmark's fifteen (bench/run-sets.json), each registered a second time under the one-area rule as <id>-qs.
RULE_IDS = tuple(T["RULE_IDS"])
SPEC += [(name + RULE_SUFFIX, fid + RULE_SUFFIX, role, src, prov, note + " Registered under the one-area sheet rule (a quarter sheet's area in the picture's proportions); the earlier registration `%s` is left as it is." % fid)
         for name, fid, role, src, prov, note in SPEC if fid in RULE_IDS]
REAL_SIZES = json.load(open(os.path.join(REPO, "bench", "real-sizes.json")))["sizes"]
ROLE_WHY = {"comparison": "the owner: these cannot be matched; comparison only, never scored in the aggregate (PLAN-0.4-gate.md)",
            "exploratory": "the owner: 'add signac for now'; provisional, shown and rendered, not in the scored aggregate",
            "core": "in the scored set"}
# Use (the owner, 21 Nov: "pick some illustrations if you want a wider further set to test but this is fine we can use all for this
# development process"); "use the ones we liked". Every subject is development. The held-out list is empty today.
TIER1 = tuple(T["TIER1"])
HELD_OUT = ()   # a held-out set may be named later by the owner ("we can fine tune later which will actually be in benchmark")
USE_WHY = {"development": "use freely to broaden the painter: look at its paintings, tune on it",
           "held-out": "inputs, class and segmentation are prepared like any other subject, but no engineer looks at its paintings or tunes on it; rendered only by render.sh --gate or --final, and scored with the rest"}
HISTORY = T["HISTORY"]
# Details of a larger picture (paint/SET.md windows; the owner's picks C1/C2 and the kept Venice detail). A detail is simply a
# picture: its source file IS the cut (made once, byte-identical to the window of the whole), and every input is made from that
# file alone, exactly as for any whole picture. Nothing is cut from whole-picture inputs (21 Nov 03:55: whole-picture studies cut
# to the window carried the water band and shoreline across Homer's figure). This table is provenance only: where the cut came from.
CUT_FROM = T["CUT_FROM"]
# Input id: the name every derived input file of a subject carries (guides/<iid>-layin.png, studies/<iid>-study-*, labels/<iid>.json,
# classify/<iid>.json, replay/vectors/<iid>-std-*). A new source gets a new input id, so no pinned file is ever rewritten.
INPUT_ID = T["INPUT_ID"]
# ink lines accepted without a seed choice, their per-stroke tagging counted as the cleaning (each with its reason)
TAG_CLEANED = T["TAG_CLEANED"]
# pen-and-wash works by the artist's hand whose own pen line was extracted (replay/r10/master-line.py): their ink is HIS line
OWN_LINE = tuple(T["OWN_LINE"])
REMOVED = [(a, b, c) for a, b, c in T["REMOVED"]]

# ---- generation records: each input's prompt, seed, steps and host, read from the run records, never from its name
RECORDS = ["guides/tools/qwen-local-water-fan-tyrol.log", "guides/tools/onboard-local-driver.log", "guides/tools/qwen-runpod.log", "guides/tools/onboard-sterling-beach.log", "guides/README.md", "studies/README.md",
           "studies/run.log", "guides/tools/qwen-run.log", "guides/tools/qwen-queue.log", "guides/tools/batch2.log", "guides/RUNPOD.md"]
_lines = {}
def record_lines(f):
    if f not in _lines:
        p = os.path.join(R, f); _lines[f] = open(p, errors="replace").read().splitlines() if os.path.isfile(p) else []
    return _lines[f]

def kv(line, k):
    m = re.search(r"\b%s=([\w.]+)" % k, line); return m.group(1) if m else None

def generation(path):
    """The run record(s) of a generated input, or None."""
    base = os.path.basename(path); pat = re.compile(r"(?<![\w-])%s(?![\w-])" % re.escape(base)); found = []
    for f in RECORDS:
        for n, line in enumerate(record_lines(f), 1):
            if not pat.search(line) or "|" in line:
                continue
            g = None
            if "made on RunPod" in line:
                g = dict(host="RunPod (H100, diffusers bf16, Lightning 8-step LoRA fused)", prompt=kv(line, "prompt"), steps=kv(line, "steps"), seed=kv(line, "seed"))
            elif "made locally" in line:
                st = re.search(r"(\d+) steps", line); sd = re.search(r"seed (\d+)", line)
                g = dict(host="this Mac (mflux 8-bit MLX, Lightning 8-step LoRA)", prompt=None, steps=st and st.group(1), seed=sd and sd.group(1))
            elif f == "studies/run.log" and line.startswith(base + ":"):
                m = re.match(r"\S+: (s\d)\s+steps=(\d+)", line)
                g = dict(host="RunPod (studies/README.md:1, 19 Nov run)", prompt=m and m.group(1), steps=m and m.group(2), seed="42 (run header, studies/README.md:3; not on the line)")
            elif "prompt=" in line and "steps=" in line:
                g = dict(host=("this Mac (mflux 8-bit MLX, Lightning 8-step LoRA; made locally with guides/tools/qwen_local_prep.py, not on a pod; bf16 on the pod for the older subjects)" if "peak=" in line and "gen=" in line else "this Mac (mflux; peak_mlx in the record)" if "peak_mlx" in line else "not recorded"), prompt=kv(line, "prompt"), steps=kv(line, "steps"), seed=kv(line, "seed"))
            if g:
                if g.get("prompt") is None:
                    m = re.search(r"prompt[= ]([a-z]\d+b?)\b", line); g["prompt"] = m.group(1) if m else "not on the record line"
                g["record"] = "%s:%d" % (f, n); found.append(g)
    m = re.match(r"(%s)-inkprep-e6L8\.png$" % "|".join(T["INKPREP_RUN"]), base)
    if not found and m:
        found.append(dict(host="RunPod (H100 80GB SXM)", prompt="e6 (the run names its files *-inkprep-<prompt>L8.png)", steps="8", seed="42",
                          record="guides/README.md:72-78 (run header; subject %s named at :77; no per-file line)" % m.group(1)))
    if not found:
        return dict(record="none found", prompt="not recorded", seed="not recorded", steps="not recorded", host="not recorded")
    distinct = {(g["prompt"], g["seed"], g["steps"], g["host"]) for g in found}
    g = dict(found[0])
    if len(distinct) > 1:
        g["conflict"] = "several different run records name this file: " + "; ".join(x["record"] for x in found) + ". Which one made the bytes on disk is not provable; the hash is pinned."
    elif len(found) > 1:
        g["alsoIn"] = [x["record"] for x in found[1:]]
    return g

def pin(path, kind, gen=True, extra=None):
    e = dict(path=path, sha256=sha256(path), kind=kind)
    if e["sha256"] is None:
        e["status"] = "missing"
    else:
        e["px"] = image_size(path) if path.endswith((".png", ".jpg")) else None
        e["mtime"] = time.strftime("%Y-%m-%d %H:%M", time.localtime(os.path.getmtime(os.path.join(R, path))))
        if gen:
            e["made"] = generation(path)
    if extra:
        e.update(extra)
    return e

def fates(stem):
    """Each stroke's fate in a pinned vector drawing (the classifier's tags, tools/seg/tag-medium.py): ink, lay-in (graphite) or
    dropped. Shares by stroke LENGTH (mm). None when the files are missing or untagged."""
    import math
    f = os.path.join(R, stem + "-vectors.json")
    if not os.path.isfile(f): return None
    try: d = json.load(open(f))
    except ValueError: return None
    L = dict(ink=0.0, layin=0.0, dropped=0.0); n = dict(ink=0, layin=0, dropped=0); tagged = all(("medium" in x or "drop" in x) for x in d.get("strokes", []))
    for x in d.get("strokes", []):
        k = "dropped" if x.get("drop") else "ink" if (x.get("medium") == "ink" or (not tagged and d.get("medium") == "ink")) else "layin"
        p = x.get("path") or []
        L[k] += sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(p, p[1:])); n[k] += 1
    kept = L["ink"] + L["layin"]
    return dict(inkShareByLength=round(L["ink"] / kept, 3) if kept else 0.0, inkShareByCount=round(n["ink"] / (n["ink"] + n["layin"]), 3) if (n["ink"] + n["layin"]) else 0.0,
                lengthMm={k: round(v) for k, v in L.items()}, strokes=n, tagged=tagged)

def summary_class(fid, fa, c):
    """The picture-level class, a SUMMARY for labels only (the coordinator, 21 Nov): from the drawing's stroke fates, by length;
    ink at 0.4 or more (the coordinator moved it from 0.6 the same night, to match the pictures)."""
    if fid in OWN_LINE: return "ink", "the artist's own extracted line: ink by construction"
    if not fa: return "pending", "no tagged vector drawing yet"
    sh = fa["inkShareByLength"]
    if sh >= 0.4: return "ink", "ink share by length %.2f (>= 0.4)" % sh
    if sh >= 0.1: return "mixed", "ink share by length %.2f (0.1 to 0.4)" % sh
    if c.get("strength") == "visible": return "pencil", "ink share by length %.2f (< 0.1) and the classifier measured a visible dry line" % sh
    return "none", "ink share by length %.2f (< 0.1)" % sh

def latest_stem(base):
    """Pinned files are immutable (SWARM.md, 21 Nov): a new fit gets a versioned name, base-vN. The highest complete version wins."""
    best, bn = base, 0
    d = os.path.join(R, os.path.dirname(base)); b = os.path.basename(base)
    for f in os.listdir(d):
        m = re.match(re.escape(b) + r"-v(\d+)-vectors\.json$", f)
        if m and int(m.group(1)) > bn and os.path.isfile(os.path.join(d, "%s-v%s-lines.json" % (b, m.group(1)))):
            best, bn = "%s-v%s" % (base, m.group(1)), int(m.group(1))
    return best

def vectors(stem, wmm, how):
    """A vector drawing the painter lays: pinned when it exists AND was fitted for the standard sheet; otherwise 'to fit'."""
    e = dict(stem=stem, sheetMm=wmm, how=how, files=[])
    ok = True
    for f in (stem + "-lines.json", stem + "-vectors.json"):
        h = sha256(f); e["files"].append(dict(path=f, sha256=h))
        ok = ok and h is not None
    if ok:
        try:
            d = json.load(open(os.path.join(R, stem + "-vectors.json")))
        except ValueError:   # a fit still being written: never pin a half-written file
            e["status"] = "being written (its JSON does not parse yet)"; e["files"] = [dict(path=x["path"], sha256=None) for x in e["files"]]; return e
        e["fittedSheetMm"] = d.get("sheetMm"); e["strokes"] = len(d.get("strokes", []))
        if abs((d.get("sheetMm") or 0) - wmm) > 0.01 * wmm:
            e["status"] = "wrong sheet: fitted for %s mm, the standard sheet is %s mm" % (d.get("sheetMm"), wmm); ok = False
    else:
        e["status"] = "to fit"
    if not ok:
        e["files"] = [dict(path=x["path"], sha256=None) for x in e["files"]]
    return e

def labels_of(fid, src):
    p = "labels/%s.json" % fid
    if not os.path.isfile(os.path.join(R, p)):
        return dict(path=p, sha256=None, status="missing", count=0)
    d = json.load(open(os.path.join(R, p))); things = d.get("things") or []
    edits = "none recorded"
    try:
        raw = json.loads(re.search(r"\[.*\]", d.get("raw_reply", ""), re.S).group(0))
        edits = "none (things equal the model's reply)" if [(t.get("thing"), t.get("kind"), t.get("box")) for t in raw] == [(t.get("name") or t.get("thing"), t.get("kind"), t.get("box")) for t in things] \
            else "EDITED: things differ from the model's raw reply (%d in the reply, %d kept)" % (len(raw), len(things))
    except Exception:
        edits = "cannot be checked (no parseable raw reply)"
    img = (d.get("image") or "").replace("../", "")
    e = dict(path=p, sha256=sha256(p), count=len(things), model=d.get("model"), date=d.get("date"), handEdits=edits, madeFrom=img)
    if img and os.path.normpath(img) != os.path.normpath(src):
        e["warning"] = "labelled from %s, not this subject's source %s" % (img, src)
    return e

# Drawing medium set BY HAND from the museum's own line, where the classifier read graphite as ink (lead, 23 Nov 2026):
MEDIUM_BY_HAND = {
    "ender-mountain-valley": ("pencil", "museum's line (Met 372683): \"Watercolor over graphite\""),
    "cezanne-bathers-bridge": ("pencil", "museum's line (Met 334173): \"Watercolor over graphite\""),
    "randal-resegone": ("pencil", "museum's line (Met 459658): \"Watercolor over pencil\""),
}
def klass(fid):
    r = klass0(fid)
    if fid in MEDIUM_BY_HAND and r.get("value") not in (None, "pending"):
        v, why = MEDIUM_BY_HAND[fid]
        r = dict(r, classifierSaid=r["value"], value=v, setByHand="set by hand, not by the classifier (which said %s): %s; a pencil lay-in, no ink" % (r["value"], why), plain="pencil under wash (set by hand from the museum's line)")
    return r

def klass0(fid):
    p = "classify/%s.json" % fid
    if not os.path.isfile(os.path.join(R, p)):
        return dict(value="pending", why="classify/%s.json not written yet (classify worker a90c574cae880ade0)" % fid)
    d = json.load(open(os.path.join(R, p)))
    m = d.get("measurements", {})
    return dict(value=d.get("line") or "pending", strength=d.get("line_strength"), dryMedium=d.get("dry_medium"), lineColour=d.get("line_colour"),
                paper=d.get("paper"), paperL=m.get("paperL"), confidence=d.get("confidence"), disagreement=d.get("disagreement"),
                plain=d.get("plain"), file=p, sha256=sha256(p), image=d.get("image"))

SEEDS_FILE = "segaudit/seed-choice.json"
def seed_choice(name, fid):   # fid: the input id
    rule = "the auditor's rule (segaudit/pick.py): studies are made at seeds 42, 7 and 11; the seed whose s3/s1/s4 colours and values are closest to the picture (dE10, false whites, false darks) is used"
    p = os.path.join(R, SEEDS_FILE)
    ch = None; final = False; why = None; files = None
    if os.path.isfile(p):
        d = json.load(open(p)); ch = d.get(name, d.get(fid))
        files = None
        if isinstance(ch, dict): final = bool(ch.get("final")); why = ch.get("why"); files = ch.get("files"); ch = ch.get("seed")
    have = set()
    for f in os.listdir(os.path.join(R, "studies")):
        m = re.match(r"%s-study-s[134][acmnvw]?L8(-s(\d+))?\.png$" % re.escape(fid), f)
        if m: have.add(int(m.group(2)) if m.group(2) else 42)
    st = ("final" if final else "provisional (not all three seeds exist; render.sh accepts it only with --check)") if ch else "pending (no entry in %s; seed 42 is NOT a default)" % SEEDS_FILE
    return dict(chosen=ch, final=final, status=st, why=why, files=files, rule=rule, seedsOnDisk=sorted(have), file=SEEDS_FILE)

def study_path(fid, k, seed):
    return "studies/%s-study-%s%s.png" % (fid, k, "" if seed in (None, 42) else "-s%d" % seed)

def choice_record(e, fid, what):
    """The classifier's choice of seed and its cleaning for a drawing (classify/fidelity/<id>.json), or a stand-in mark."""
    if not e.get("sha256"): return
    fj = None   # the record whose "cleaned" (or "stripped") names this very file: classify/fidelity/<id>.json or a versioned <id>-*.json
    import glob as _g
    for cand in sorted(_g.glob(os.path.join(R, "classify/fidelity/%s.json" % fid)) + _g.glob(os.path.join(R, "classify/fidelity/%s-*.json" % fid))):
        try: dd = json.load(open(cand))
        except Exception: continue
        if isinstance(dd, dict) and os.path.basename(dd.get("cleaned") or dd.get("stripped") or "") == os.path.basename(e["path"]):
            fj = cand; break
    if not fj:
        e["standIn"] = "not the standard %s: no seed choice and cleaning recorded for this file (classify/fidelity/%s.json); --check only" % (what, fid); return
    fd = json.load(open(fj)); ch = fd.get("chosen") or fd.get("drawing"); fid = os.path.basename(fj)[:-5]
    cc = fd.get("cleaned_check") if isinstance(fd.get("cleaned_check"), dict) else {}
    e["made"] = dict(generation(ch) if ch else {}, chosenFrom=ch, chooser="classify/choose-layin.py (record classify/fidelity/%s.json)" % fid,
                     prompt=fd.get("prompt") or (generation(ch) or {}).get("prompt"), fidelityPassedChosen=fd.get("chosen_passed", fd.get("pass")),
                     fidelityPassedCleaned=cc.get("pass"), invented=cc.get("invented"))
    if not fd.get("prompt") or "-p3" in (ch or ""):
        e["standIn"] = "not the standard %s: %s stands in (cleaned) until the standard one is made; --check only" % (what, ch)

def options(cls, paper_toned):
    """The painter options: one fixed set, plus what the class and the paper decide. Nothing else differs."""
    o = dict(common="--recipe default --scale 1 --strict 1 --gpu on --mode fast --seed 0 --segments sam --targetguard gentle --marks 1 --video 0 --frames 1 --palettewide 1 --paintsextend 0 --notargetlooks 0 --subgrid 2 --stages none --drawing first".split(),
             studies="s3L8:6,s1L8:4,s4L8:2")
    if cls in ("ink", "mixed"):   # mixed: the strokes carry their medium (classifier's line map); the tag-aware painter lays each as tagged
        o["line"] = "--outlinemedium ink --inkrecipe wash --inkfill 1".split()
    elif cls in ("pencil", "none"):
        o["line"] = "--outlinemedium graphite --inkfill 1".split()
    else:
        o["line"] = None
    o["paper"] = ["--paperbase", "source", "--paperrgb", paper_toned, "--tonestage", "1"] if paper_toned else []
    return o

# Citations (23 Nov 2026): every picture's registry entry carries the museum's own words, from bench/PICTURES.md of the credits engineer's
# branch (claude/04-credits-docs; a copy is register/PICTURES-0.4-credits-branch.md). The row is found by a title fragment.
CITE_KEY = T["CITE_KEY"]
def citation_rows():
    import re as _re
    out = []
    f = os.path.join(R, "register/PICTURES-0.4-credits-branch.md")
    if not os.path.isfile(f): return out
    for ln in open(f):
        if not ln.startswith("|") or ln.startswith("|---"): continue
        c = [x.strip() for x in ln.strip().strip("|").split(" | ")]
        link = _re.findall(r"\[([^\]]+)\]\((https?[^)]+)\)", ln)
        if len(c) == 9 and c[0] not in ("Group",): out.append(dict(artistTitleDate=c[2], museum=c[3], medium=c[4], realSize=c[5], rights=c[6], creditLine=c[7], link=(link[-1][1] if link else None), table="benchmark"))
        elif len(c) == 5 and c[0] != "Artist, title, date" and not c[0].startswith("Set"): out.append(dict(artistTitleDate=c[0], medium=c[1], museum=c[2], rights=c[3], link=(link[-1][1] if link else None), table="optional"))
    return out
def add_citations(man):
    rows = citation_rows()
    for s in man["subjects"]:
        k = CITE_KEY.get(s.get("registeredFrom") or s["id"]) or CITE_KEY.get(s["name"])
        hit = [r for r in rows if k and k.lower() in r["artistTitleDate"].lower()]
        if hit: s["citation"] = dict(hit[0], note="the museum's words, from bench/PICTURES.md (claude/04-credits-docs), read 23 Nov 2026; the file here may be trimmed or cropped, see source.note")
        # how the checks went, stated plainly
        ch = []
        d = (s.get("inputs") or {}).get("drawing") or {}; mk = d.get("made") or {}
        if mk.get("fidelityPassedChosen") is False: ch.append("lay-in: failed the drawing-fidelity check (invented marks over the limit); used after stripping them (fidelityPassedCleaned=%s, invented=%s)" % (mk.get("fidelityPassedCleaned"), mk.get("invented")))
        ss = s.get("studySeed") or {}
        if ss.get("why") and "REJECTED" in str(ss.get("why")): ch.append("study seeds: " + ss["why"])
        if (s.get("class") or {}).get("setByHand"): ch.append("drawing medium: " + s["class"]["setByHand"])
        else: ch.append("drawing medium: decided by the classifier (classify/%s.json), not by hand" % (s.get("registeredFrom") or s["id"]))
        s["checks"] = ch

def build(frozen=None):
    """frozen: {name: class record} kept from the current manifest (a selective repin never changes a class)."""
    subs = []
    for name, fid, role, src, prov, note in SPEC:
        px = image_size(src)
        # a record under the one-area rule (<id>-qs): every table here is read by the earlier record's name and id, its
        # input files (made from the source, whatever the sheet) carry the earlier record's input id, and only the
        # drawing's vectors, fitted in millimetres of the sheet, carry the new id
        qs = fid.endswith(RULE_SUFFIX); rid, rname = fid, name
        if qs: fid, name = fid[:-len(RULE_SUFFIX)], name[:-len(RULE_SUFFIX)]
        iid = INPUT_ID.get(fid, fid)   # the name its input files carry
        # the name its vector drawings carry: the new id, unless the rule gives this picture the very sheet it already
        # had (Mittens close-up), where the earlier fit is the fit
        vid = rid if qs and abs(standard_sheet(*px)[0] - sheet_for(*px)[0]) > 0.005 else iid
        rec = dict(id=rid, name=rname, role=role, roleWhy=ROLE_WHY[role], use="held-out" if name in HELD_OUT else "development", useWhy=USE_WHY["held-out" if name in HELD_OUT else "development"])
        if name in HISTORY: rec["history"] = HISTORY[name]
        rec["tier"] = 1 if name in TIER1 else 2
        if iid != rid: rec["inputId"] = iid   # its input files carry this name (INPUT_ID)
        if qs:
            rec["registeredFrom"] = fid
            if REAL_SIZES.get(fid): rec["realSize"] = REAL_SIZES[fid]
        rec["source"] = dict(path=src, px=px, sha256=sha256(src), provenance=prov, note=note)
        if fid in CUT_FROM:
            rec["source"]["cutFrom"] = dict(CUT_FROM[fid], rule="a detail is a picture: cut once from the whole; every input is made from this source alone")
        pic = src; ppx = px
        wmm, hmm, cells = standard_sheet(*ppx) if qs else sheet_for(*ppx)
        rec["sheet"] = dict(widthMm=wmm, heightMm=hmm, cellsAcross=cells, cellMm={k: round(wmm / v, 4) for k, v in cells.items()},
                            sourcePxPerCell={k: round(ppx[0] / v, 3) for k, v in cells.items()},
                            rule=RULE_NAME if qs else "0.26 mm a cell at full; long-side cells = min(source long side px, %d), never enlarged; half = half the cells (0.52 mm); line = twice the cells (0.13 mm)" % MAX_LONG)
        c = (frozen or {}).get(name); kc = klass(iid)
        if not c or c.get("value") == "pending" or c.get("file") != kc.get("file") or (iid in MEDIUM_BY_HAND and not c.get("setByHand")): c = kc   # a frozen class holds only for its own class file
        rec["class"] = c
        cls = c["value"]
        toned = (c.get("paper") == "toned" and (c.get("paperL") or 100) < 90)
        rgb = None
        if toned:   # the paper colour by one rule: the median of the source's brightest 2% (the scorecard's paper estimate)
            rgb = subprocess.check_output([PY, "-c", "import sys,numpy as np;from PIL import Image;a=np.asarray(Image.open(sys.argv[1]).convert('RGB')).reshape(-1,3).astype(float);L=a.mean(1);print(','.join(str(int(round(v))) for v in np.median(a[L>=np.percentile(L,98)],0)))", os.path.join(R, pic)], text=True).strip()
        rec["paper"] = dict(toned=toned, rgb=rgb, rule="a toned sheet (tone stage 1, paper colour = the median of the source's brightest 2%) only when the classifier says toned AND its paper is darker than L* 90; otherwise the painter's own paper colour read from the source. (--paperrgb auto refused Fragonard at 1462 cells: 'no paper tone found'.)", classifier=c.get("paper"), paperL=c.get("paperL"))
        if c.get("image") and os.path.normpath(c["image"]) != os.path.normpath(src):
            c["warning"] = "classified from %s, not this subject's source %s" % (c["image"], src)
        sc = seed_choice(name, iid); rec["studySeed"] = sc
        seed = sc["chosen"]
        # inputs
        inp = {}
        def img(p): return p   # every input is made from the subject's own source; nothing is cut from another file
        line_png = None; draw_how = None
        # the drawing follows the stroke fates in the pinned vector files, not a picture label: the artist's own line, or a
        # tagged ink fit with any ink stroke, is laid as an ink drawing (its lay-in strokes in graphite first); otherwise the lay-in
        ink_stem = latest_stem("replay/vectors/%s-std-ink" % vid)
        fa_ink = fates(ink_stem)
        route = "ink" if (fid in OWN_LINE or (fa_ink and fa_ink["tagged"] and fa_ink["strokes"]["ink"] > 0)) else "layin"
        if route == "ink":
            if fid in OWN_LINE:
                line_png = "guides/%s-orig-line.png" % fid; draw_how = "the artist's own pen line, extracted from his sheet (replay/r10/master-line.py, fourth attempt)"
                inp["drawing"] = pin(line_png, "artist's own line", gen=False, extra=dict(made=dict(host="this Mac", tool="replay/r10/master-line.py", record="SUBJECT-SET.md:230 (b819 note)")))
            else:
                chosen = os.path.isfile(os.path.join(R, "guides/%s-inkprep.png" % iid))
                line_png = "guides/%s-inkprep.png" % iid if chosen else "guides/%s-inkprep-e6L8.png" % iid
                draw_how = "Qwen-Image-Edit 2511 line drawing, prompt e6, Lightning 8-step, " + ("the seed chosen of 42/7/11 by the fidelity check, frames and inscriptions stripped (classify/choose-layin.py)" if chosen else "seed 42 only")
                inp["drawing"] = pin(img(line_png), "ink line drawing (e6)")
                choice_record(inp["drawing"], iid, "ink line")
                if fid in TAG_CLEANED and inp["drawing"].get("standIn"):
                    fa_ = fates(ink_stem) or {}
                    inp["drawing"].pop("standIn")
                    inp["drawing"]["made"] = dict(inp["drawing"].get("made") or {}, chosenFrom="seed 42 only (no seed choice)",
                        cleaning="the per-stroke tagging against the source is its cleaning (tools/seg/tag-medium.py): %s of %s strokes dropped in %s" % (
                            (fa_.get("strokes") or {}).get("dropped"), sum((fa_.get("strokes") or {}).values()), os.path.basename(ink_stem)),
                        exception=TAG_CLEANED[fid])
            vk = "ink"
        else:
            # every non-ink subject: the classifier's cleaned lay-in (a visible dry line gets a darker one, made from a crayon
            # prompt); the p6 pencil study is tonal and is never an under-drawing (the owner's rule; classifier, 21 Nov)
            line_png = "guides/%s-layin.png" % iid
            draw_how = ("the visible dry line (%s): the classifier's lay-in made from a crayon prompt" % (c.get("dryMedium") or "pencil")) if c.get("strength") == "visible" else "a LIGHT pencil lay-in (big forms, no hatching) that the paint covers: the classifier's step 0 (owner, 21 Nov)"
            inp["drawing"] = pin(img(line_png), "pencil lay-in" + (" (visible line)" if c.get("strength") == "visible" else " (light)"), extra=dict(note="made by the classifier agent (step 0) from the subject's own source"))
            choice_record(inp["drawing"], iid, "lay-in")
            vk = "layin"
        if vk:
            inp["drawingVectors"] = vectors(latest_stem("replay/vectors/%s-std-%s" % (vid, vk)), wmm, ("tools/prepare/vectors.sh" if qs else "replay/vectors/make.sh") + " %s-std-%s %s %s %s %s" % (vid, vk, img(line_png), pic, wmm, "ink" if vk == "ink" else "pencil"))
            fa = fates(inp["drawingVectors"]["stem"]) if not inp["drawingVectors"].get("status") else None
            if fa and route != "ink":   # a pencil drawing lays every kept stroke in graphite; an "ink" tag there only notes a dark source line
                fa = dict(fa, inkTagged=fa["strokes"]["ink"], inkShareByLength=0.0, inkShareByCount=0.0, note="lay-in: kept strokes are laid as graphite")
            inp["drawingVectors"]["fates"] = fa
            sv, sw = summary_class(fid, fa, c)
            c["summary"] = sv; c["summaryWhy"] = sw
            c["laysInk"] = bool(route == "ink")
        # the pencil study (for the pencil replay) and the ink line (for the ink replay)
        inp["pencilStudy"] = pin(img("guides/%s-pencil-p6L8.png" % iid), "pencil study (p6)")
        inp["pencilVectors"] = vectors(latest_stem("replay/vectors/%s-std-pencil" % vid), wmm, ("tools/prepare/vectors.sh" if qs else "replay/vectors/make.sh") + " %s-std-pencil %s %s %s pencil" % (vid, img("guides/%s-pencil-p6L8.png" % iid), pic, wmm))
        if route == "ink":
            inp["inkLine"] = dict(sameAs="drawing")
        # a per-region line map (ink here, pencil there) from the classifier, when the owner's mixed line applies (21 Nov):
        # pinned like any input; the painter does not read one yet, so render.py records it and passes nothing
        lm = "classify/%s-linemap.png" % iid
        inp["linemap"] = pin(lm, "line map (ink and pencil by region)", gen=False) if os.path.isfile(os.path.join(R, lm)) else dict(path=None, status="none: one line medium for the whole picture")
        rec["lineRenders"] = dict(pencil="yes: every subject has a pencil treatment (SUBJECT-SET.md)", ink="yes" if route == "ink" else ("no: the source has no pen line (owner, 21 Nov: no ink for a picture without a pen line)" if cls in ("pencil", "none") else "class pending"))
        st = []
        for k, mn in (("s3L8", 6), ("s1L8", 4), ("s4L8", 2)):
            fs = (sc.get("files") or {}).get(k)   # the auditor names the exact files (a Mac seed 42 has a RunPod twin, -s42r)
            if fs:
                q = fs
            else:
                q = img(study_path(iid, k, seed if seed else 42))
            e = pin(q, "block-in study %s" % k[:2], extra=dict(minArea=mn))
            if not seed and e.get("status") != "missing":
                e["status"] = "seed pending (seed 42 file pinned for --check only)"
            st.append(e)
        inp["studies"] = st
        rec["inputs"] = inp
        lb = labels_of(iid, src)
        rec["labels"] = lb
        rec["options"] = options("ink" if route == "ink" else "none", rgb if toned else None)   # options follow the fates: any ink stroke -> ink (lay-in strokes in graphite first)
        rec["exceptions"] = []
        if fid == "white-ships":
            rec["exceptions"].append("none taken: the old routes' --sourcescale 1.6/1.7 and --paperrgb 250,249,245 are dropped; the sheet rule and the painter's own paper apply")
        if fid == "fragonard":
            rec["exceptions"].append("none taken: toned paper follows from the classifier's paper (L* 81.8), not from a per-subject flag")
        subs.append(rec)
        fid, name = rid, rname
    rem = [dict(name=n, ids=ids, reason=why) for n, ids, why in REMOVED]
    return dict(
        _about="THE one list of subjects (one record each). Read by paintings/render.sh, paintings/render-line.sh, paintings/check-comparable.py and the studio. Written by tools/prepare/register.py (paintings/make-subjects.py before 0.4 rc7); hashes are pinned when it runs. A record whose sheet.rule is quarter-sheet-area (id ending -qs) is registered under the one-area sheet rule; the benchmark runs only those. See METHOD.md.",
        written=time.strftime("%Y-%m-%d %H:%M %Z"),
        sheetRule=dict(cellMm=CELL_MM, maxLongSideCells=MAX_LONG, words="One cell size for all: 0.26 mm a cell at full. Cells on the long side = the source's long side in pixels, at most 1462: a larger source is reduced, a smaller one is never enlarged (the owner: never paint from an upscaled source). Sheet mm = cells x 0.26, so the largest sheet is 380 mm on its long side. Half: half the cells on the same sheet (0.52 mm). Line renders: twice the cells (0.13 mm). The sheet never crops."),
        classRule=dict(ink="the source shows a pen line: an ink drawing is laid first (the artist's own line for a pen-and-wash work by hand, else Qwen e6), --outlinemedium ink --inkrecipe wash",
                       pencil="the source shows a dry line: the classifier's pencil lay-in, light when the line is faint, darker (crayon prompt) when it is visible; --outlinemedium graphite; the p6 pencil study is never an under-drawing",
                       none="no line shows: a light pencil lay-in the paint covers; --outlinemedium graphite; never ink",
                       mixed="ink in some regions, a dry line in others (the classifier's line map): the ink line drawing, its strokes tagged ink or pencil by region and laid as tagged; --outlinemedium ink --inkrecipe wash"),
        roles=ROLE_WHY, uses=USE_WHY,
        minCommit=dict(sha="355b9ac3", why="the tag-aware painter (strokes carry their medium from the classifier's line map; dropped strokes left out): every render needs this commit or a later one"),
        subjects=subs, removed=rem)

def keep_old(new, old, pats):
    """Selective repin: in every subject, an input entry whose path or stem matches none of pats keeps its old pin."""
    om = {x["name"]: x for x in old["subjects"]}
    def hit(e):
        k = e.get("stem") or e.get("path") or ""
        return any(p in k for p in pats)
    for x in new["subjects"]:
        o = om.get(x["name"])
        if not o: continue
        for k, v in x["inputs"].items():
            ov = o["inputs"].get(k)
            if ov is None: continue
            if isinstance(v, list):
                x["inputs"][k] = [nv if hit(nv) else (ov[i] if i < len(ov) else nv) for i, nv in enumerate(v)]
            elif isinstance(v, dict) and not hit(v):
                x["inputs"][k] = ov
        if not hit(x["labels"]): x["labels"] = o["labels"]
    return new

if __name__ == "__main__":
    frozen = None
    if ("--repin-only" in sys.argv or "--freeze-classes" in sys.argv) and os.path.isfile(MANIFEST):
        frozen = {x["name"]: x["class"] for x in json.load(open(MANIFEST))["subjects"]}
    man = build(frozen)
    if "--repin-only" in sys.argv:   # register.py --repin-only PATH_OR_STEM_PART...: pin only the matching entries
        pats = sys.argv[sys.argv.index("--repin-only") + 1:]
        if not pats: sys.exit("--repin-only needs one or more path or stem parts")
        man = keep_old(man, json.load(open(MANIFEST)), pats); sys.argv.append("--repin")
        print("repinning only entries matching:", " ".join(pats))
    add_citations(man)
    txt = json.dumps(man, indent=1, ensure_ascii=False)
    if os.path.isfile(MANIFEST) and "--repin" not in sys.argv:
        old = json.load(open(MANIFEST))
        def hashes(m): return {(s["name"], f.get("path")): f.get("sha256") for s in m["subjects"] for f in __import__("subjects_lib").files_of(s)}
        a, b = hashes(old), hashes(man)
        ch = [k for k in set(a) | set(b) if a.get(k) != b.get(k)]
        oc = {x["name"]: x["class"].get("summary") for x in old["subjects"]}; nc = {x["name"]: x["class"].get("summary") for x in man["subjects"]}
        cc = [n for n in nc if oc.get(n) != nc[n]]
        if cc:
            print("CLASS SUMMARY CHANGES (labels only; the drawing and options follow the stroke fates):")
            for n in cc: print("  %s: %s -> %s" % (n, oc.get(n, "new"), nc[n]))
        print("SUBJECTS.json exists; %d pinned files would change:" % len(ch))
        for k in sorted(ch, key=str): print("  %s %s: %s -> %s" % (k[0], k[1], (a.get(k) or "none")[:12], (b.get(k) or "none")[:12]))
        print("run with --repin to rewrite it"); sys.exit(1)
    open(MANIFEST, "w").write(txt + "\n")
    print("wrote", MANIFEST, len(man["subjects"]), "subjects,", len(man["removed"]), "removed")
