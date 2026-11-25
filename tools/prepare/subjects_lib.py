# subjects_lib.py: shared pieces for SUBJECTS.json (the one subject list), render.py and check-comparable.py.
# Paths in the manifest are relative to R, the preparation folder ($UNPAINT_PREP).
import hashlib, json, math, os, re, struct, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prep_root import prep_root

R = prep_root()
MANIFEST = os.environ.get("SUBJECTS_JSON") or os.path.join(R, "SUBJECTS.json")   # override for tests only

# THE SHEET RULE (one rule for every subject; METHOD.md; the coordinator's decision of 21 Nov from the owner's standing rule
# "never paint from an upscaled source"):
#   One cell size for all: 0.26 mm a cell at full. Cells on the picture's long side = min(source long side in px, 1462): a
#   larger source is reduced to 1462, a smaller one is NEVER enlarged (at most one cell a source pixel). Sheet mm = cells x 0.26.
#   half: half the cells on the same sheet (0.52 mm a cell).  line renders (pen or pencil alone): twice the cells (0.13 mm).
#   Vector drawings are fitted for this sheet width (the painter refuses any other).
CELL_MM = 0.26
MAX_LONG = 1462
LONG_MM = MAX_LONG * CELL_MM   # the largest sheet's long side, 380.12 mm
LONG_CELLS = {"full": MAX_LONG, "half": MAX_LONG // 2, "line": MAX_LONG * 2}


def sheet_for(w, h):
    """(sheet width mm, sheet height mm, {scale: cells across}) for a picture of w x h pixels."""
    long_cells = min(max(w, h), MAX_LONG)
    full = int(round(long_cells * w / max(w, h)))
    hcells = int(round(long_cells * h / max(w, h)))
    wmm = round(full * CELL_MM, 2)
    hmm = round(hcells * CELL_MM, 2)
    cells = {"full": full, "half": int(round(full / 2)), "line": full * 2}
    return wmm, hmm, cells


# THE ONE-AREA RULE (owner, 23 Nov 2026; tools/paint/sheet-rule.mjs is its statement, this is its twin for the registry
# writer, held to the same numbers by tools/prepare/prepare.test.mjs): every picture on the area of a quarter sheet,
# 279 x 381 mm, in the picture's own proportions, 0.26 mm a cell. A record registered under it carries RULE_NAME.
RULE_NAME = "quarter-sheet-area"
RULE_SUFFIX = "-qs"
QUARTER_SHEET_MM = (279, 381)


def js_round(x):
    return int(math.floor(x + 0.5))


def standard_sheet(w, h):
    """(sheet width mm, sheet height mm, {scale: cells across}) under the one-area rule."""
    full = js_round(math.sqrt(QUARTER_SHEET_MM[0] * QUARTER_SHEET_MM[1] * w / h) / CELL_MM)
    cells = {"full": full, "half": js_round(full / 2), "line": full * 2}
    return round(full * CELL_MM, 2), round(full * CELL_MM * h / w, 2), cells


def sha256(path):
    p = path if os.path.isabs(path) else os.path.join(R, path)
    if not os.path.isfile(p):
        return None
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def image_size(path):
    p = path if os.path.isabs(path) else os.path.join(R, path)
    with open(p, "rb") as f:
        head = f.read(32)
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return list(struct.unpack(">II", head[16:24]))
    # JPEG: walk the markers to the frame header
    with open(p, "rb") as f:
        f.read(2)
        while True:
            b = f.read(1)
            while b and b != b"\xff":
                b = f.read(1)
            while b == b"\xff":
                b = f.read(1)
            if not b:
                return None
            m = b[0]
            if m in (0xD8, 0x01) or 0xD0 <= m <= 0xD7:
                continue
            L = struct.unpack(">H", f.read(2))[0]
            if 0xC0 <= m <= 0xCF and m not in (0xC4, 0xC8, 0xCC):
                f.read(1)
                hh, ww = struct.unpack(">HH", f.read(4))
                return [ww, hh]
            f.read(L - 2)


def load():
    return json.load(open(MANIFEST))


def subject(man, name):
    for s in man["subjects"]:
        if s["name"] == name or s["id"] == name:
            return s
    raise SystemExit(f"no subject {name!r} in SUBJECTS.json (names: {', '.join(s['name'] for s in man['subjects'])}; removed: {', '.join(r['name'] for r in man['removed'])})")


def files_of(entry):
    """Every pinned file of an input entry (dicts with path and sha256), walking nested entries."""
    out = []
    if isinstance(entry, dict):
        if "path" in entry and "sha256" in entry:
            out.append(entry)
        for k, v in entry.items():
            if k != "path" and isinstance(v, (dict, list)):
                out += files_of(v)
    elif isinstance(entry, list):
        for v in entry:
            out += files_of(v)
    return out


def vector_files(stem):
    return [stem + "-lines.json", stem + "-vectors.json"]


# what the painter's log says it loaded (tools/plate/sheet.mjs, drawing.mjs; build 847)
LOG_LABELS = re.compile(r"^study washes: (\d+) thing labels \(([^)]+)\)")
LOG_NOLABELS = re.compile(r"^study washes: no thing labels")
LOG_CODE = re.compile(r"^code: ([0-9a-f]{7,40}), build (\d+)[^,]*, (clean|dirty)")
LOG_STUDY = re.compile(r"^wash plan: study \((.*)\)")
LOG_VECTORS = re.compile(r"ink vectors: (\d+) strokes laid exactly from (\S+) \((graphite|ink)\) on a (\d+) x (\d+) sheet \(([\d.]+) mm cells\)")
LOG_SOURCE = re.compile(r"^source: (\d+) x (\d+) px; sheet (\d+) cells wide")
LOG_PEN_FIRST = re.compile(r"^study washes: the drawing laid first \((\d+) vector strokes, ([^)]+)\)")


def read_log(path):
    """What a painter log reports: commit, build, clean, labels, studies, vectors, source and sheet."""
    r = dict(labels=None, labelsFile=None, labelsLine=None, commit=None, build=None, clean=None, studies=None,
             vectors=[], source=None, penFirst=None, finished=False)
    if not os.path.isfile(path):
        return None
    for line in open(path, errors="replace"):
        line = line.rstrip("\n")
        m = LOG_LABELS.match(line)
        if m:
            r.update(labels=int(m.group(1)), labelsFile=m.group(2), labelsLine=line)
        elif LOG_NOLABELS.match(line):
            r.update(labels=0, labelsFile=None, labelsLine=line)
        m = LOG_CODE.match(line)
        if m:
            r.update(commit=m.group(1), build=int(m.group(2)), clean=m.group(3) == "clean")
        m = LOG_STUDY.match(line)
        if m:
            r["studies"] = [x.strip() for x in m.group(1).split(",")]
        m = LOG_VECTORS.search(line)
        if m:
            r["vectors"].append(dict(strokes=int(m.group(1)), file=m.group(2), medium=m.group(3), cells=[int(m.group(4)), int(m.group(5))], cellMm=float(m.group(6))))
        m = LOG_SOURCE.match(line)
        if m:
            r["source"] = dict(px=[int(m.group(1)), int(m.group(2))], cells=int(m.group(3)))
        m = LOG_PEN_FIRST.match(line)
        if m:
            r["penFirst"] = dict(strokes=int(m.group(1)), file=m.group(2))
    return r
