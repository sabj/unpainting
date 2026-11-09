#!/usr/bin/env python3
"""Full-size craft evaluation of one painting, to sit beside J1 (score_painting.py), not replace it.

  python3 fullsize.py --image P.png --style "pure watercolor, no ink" [--plate-mm 200] [--no-vision]
                      [--calls 1] [--overlay marks.jpg] [--out result.json]

J1 shrinks the painting to the target's size, so it cannot see what happens below about a millimetre of paper.
This reads the painting at its own pixels and never shrinks it.

vision:   the sheet is cut into 1:1 tiles (64 mm of paper each, never resized). The three J1 judges see a small
          view of the same painting for context and one tile, and rate edges, washes, lines and artefacts, give one
          overall, and tick named defects. They never see the target.
craft:    the mean over judges of each judge's mean tile score, 0 to 10, or null when incomplete. worstTile is the
          mean over judges of each judge's lowest tile.
measures: target-free measurements in millimetres of paper (the sheet is --plate-mm wide). They are reported, with
          an overlay picture on request, and are not part of craft:
            edges     share of boundary length that is hard, firm or soft, from the blur width of each edge
            fills     share of the open wash that is flat, and a posterisation index (flat fills with hard rims)
            flecks    small white specks and thin white slashes that sit inside paint, away from open paper;
                      pale ones are counted apart

Nothing here reads the target: there is no target argument, so copying the target cannot raise any number. Every constant below is a physical or
perceptual quantity fixed before any plate was measured; none was fitted to a plate.
"""
import argparse, json, math, os, re, sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage.color import rgb2lab
from skimage.feature import canny

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load_rgb  # noqa: E402

VERSION = "fullsize-v1"

# Lightness steps, in CIE L* (one unit is about one just-noticeable difference).
VISIBLE = 5.0        # a step anyone sees at a glance; smaller boundaries are not counted as edges
STRONG = 10.0        # twice that: a mark that reads as a separate light or dark
PAPER_TOL = 3.0      # paper is within 3 L* of the sheet's light level (the same band classic.py uses)
PAPER_PCT = 97       # the sheet's light level is the 97th percentile of lightness (as in classic.py)

# Lengths, in millimetres of paper.
HARD_MM = 0.5        # 10-90% width under this: a wet edge dried on dry paper, sharp down to the paper tooth
SOFT_MM = 2.0        # at or over this: a softened or wet-in-wet edge, visibly graded at reading distance
EDGE_FINE_MM = 0.42  # edge finder scale; equals classic.py's 1.5 px on its 720 px / 200 mm grid
EDGE_COARSE_MM = 2.0 # second pass that finds the soft edges the fine pass cannot seed
BLUR_A_MM, BLUR_B_MM, BLUR_C_MM = 1 / 6, 0.5, 1.5  # scales whose gradient ratios give the blur width
WASH_MM = 1.0        # washes are read after smoothing away paper grain at this scale
FLAT_PER_MM = 0.1    # flat: lightness moves under 1 L* (one JND) across a 10 mm brush width
OPEN_MM = 3.0        # three wash scales: beyond this the slope of a blurred step has fallen under FLAT_PER_MM
FLECK_MAX_MM = 2.0   # a light wider than this is a shape a brush can paint around, not a fleck
GRAIN_MM = 0.5       # lights shorter than this are paper-tooth sparkle; counted apart, never penalised
SLASH_MIN_MM = 2.0   # a slash is at least this long and three times longer than wide
PAPER_GAP_MM = 0.5   # a light this close to open paper is a ragged wash edge, not an isolated fleck
TILE_MM = 64.0       # tile side; 384 px on a 1200 px / 200 mm plate, the smallest side J1 sends its judges

CRITERIA = ["edges", "washes", "lines", "artefacts"]
FLAGS = ["posterised_edges", "flat_fills", "white_flecks", "pale_slashes", "stray_lines", "missing_highlight", "blur", "noise"]
TILE_PROMPT = """Image 1 is a whole painting, shown small for context only. Image 2 is one part of it at full size, about {mm} mm of paper across, taken from the {where} of the sheet.
The painting is meant to be made by hand in this style: {style}. You do not know who or what made it.
Judge only Image 2, the way a watercolour teacher looks closely at the sheet. Rate from 0 to 10:
- edges: a mix of hard, soft and lost edges that suits the forms. Failures: every shape has the same hard cut-out rim, stepped contour bands like a posterised photo, or everything blurred.
- washes: washes are graded or varied and transparent, with the paper giving the light. Failures: flat poster fills, bands, stripes, blotches, mud.
- lines: pen or pencil lines are confident and sit where they describe a form or a feature. Failures: lines that wander through flat areas, wobble, step like a staircase or outline nothing. If Image 2 has no drawn lines, give null.
- artefacts: 10 means none. Failures: white flecks or specks inside a wash, thin white or pale slashes or seams across a wash, speckle, noise, a digital filter look.
Then give one overall score from 0 to 10 for Image 2 as hand-painted watercolour craft. 5 is a competent amateur; 9-10 is professional work.
Last, list every defect from this list that you can actually see in Image 2, or an empty list: {flags}. Use missing_highlight only when an eye or a wet or shiny form is in Image 2 and has no light in it.
Reply with JSON only, no prose: {{"edges":n,"washes":n,"lines":n,"artefacts":n,"overall":n,"flags":[]}}"""


def _mean(xs):
    xs = [x for x in xs if x is not None and not (isinstance(x, float) and math.isnan(x))]
    return sum(xs) / len(xs) if xs else None


def lightness(img):
    """CIE L* (0-100) of a PIL image."""
    return rgb2lab(np.asarray(img.convert("RGB"), dtype=np.float64) / 255.0)[..., 0]


def _gmag(L, s):
    return np.hypot(ndi.gaussian_filter(L, s, order=(1, 0)), ndi.gaussian_filter(L, s, order=(0, 1)))


def _disc(diameter_px):
    r = max(1.0, diameter_px / 2.0)
    n = int(math.ceil(r))
    y, x = np.ogrid[-n:n + 1, -n:n + 1]
    return x * x + y * y <= r * r


def _blur_width(L, mask, sa, sb, reach):
    """Blur of the edge under each masked pixel. A step blurred by sigma_e has peak gradient proportional to
    1/sqrt(sigma_e^2 + s^2) at measuring scale s, so two scales give sigma_e with no window around the edge.
    Returns (10-90% width in px, step height in L*)."""
    size = 2 * int(math.ceil(reach)) + 1
    ga = ndi.maximum_filter(_gmag(L, sa), size)[mask]
    gb = ndi.maximum_filter(_gmag(L, sb), size)[mask]
    r2 = (ga / np.maximum(gb, 1e-9)) ** 2
    cap = (4 * sb) ** 2  # softer than this cannot be told apart at these scales
    se2 = np.where(r2 > 1.0 + 1e-6, (sb * sb - r2 * sa * sa) / np.maximum(r2 - 1.0, 1e-6), cap)
    se2 = np.clip(se2, 0.0, cap)
    return 2.563 * np.sqrt(se2), gb * np.sqrt(2 * math.pi * (se2 + sb * sb))


def edge_types(L, px_mm):
    """Find boundaries at a fine and a coarse scale, then class each edge pixel by its blur width."""
    L01 = L / 100.0
    sf, sc = EDGE_FINE_MM * px_mm, EDGE_COARSE_MM * px_mm
    fine = canny(L01, sigma=sf, low_threshold=0.015, high_threshold=0.05)  # classic.py's thresholds
    k = sf / sc  # the same step height gives a gradient this much lower at the coarse scale
    coarse = canny(L01, sigma=sc, low_threshold=0.015 * k, high_threshold=0.05 * k)
    if fine.any():
        coarse &= ndi.distance_transform_edt(~fine) > sc
    sa = max(1.0, BLUR_A_MM * px_mm)
    sb = max(3 * sa, BLUR_B_MM * px_mm)
    s3 = max(3 * sb, BLUR_C_MM * px_mm)
    wf, hf = _blur_width(L, fine, sa, sb, sf)
    wc, hc = _blur_width(L, coarse, sb, s3, sb)
    width = np.concatenate([wf, wc]) / px_mm
    step = np.concatenate([hf, hc])
    keep = step >= VISIBLE
    width, step = width[keep], step[keep]
    kind = np.where(width < HARD_MM, 0, np.where(width < SOFT_MM, 1, 2))
    n = max(len(kind), 1)
    length = [float((kind == i).sum()) / n for i in range(3)]
    weight = [float(step[kind == i].sum()) / max(float(step.sum()), 1e-9) for i in range(3)]
    entropy = -sum(p * math.log(p) for p in length if p > 0) / math.log(3)
    where = np.zeros(L.shape, np.uint8)  # 1 hard, 2 firm, 3 soft; for the overlay
    idx = np.concatenate([np.flatnonzero(fine), np.flatnonzero(coarse)])[keep]
    where.flat[idx] = kind + 1
    return {"edge_mm_per_cm2": round(len(kind) / px_mm / (L.size / px_mm ** 2 / 100.0), 3),
            "hard_share": round(length[0], 4), "firm_share": round(length[1], 4), "soft_share": round(length[2], 4),
            "hard_contrast_share": round(weight[0], 4), "variety": round(entropy, 4),
            "median_width_mm": round(float(np.median(width)), 3) if len(width) else None}, where


def fills(L, px_mm, edge_map, hard_contrast_share):
    """How much of the open wash is a flat fill. Open wash is paint more
    than OPEN_MM from every edge found: nearer than that, the edge's own slope would be read as gradation."""
    paper = float(np.percentile(L, PAPER_PCT))
    s = WASH_MM * px_mm
    painted = ndi.gaussian_filter(L, s) < paper - PAPER_TOL
    out = {"paper_L": round(paper, 2), "painted_share": round(float(painted.mean()), 4), "open_share": 0.0,
           "flat_share": 0.0, "posterisation": 0.0, "median_gradient_per_cm": None}
    if not painted.any():
        return {**out, "flat_share": None, "posterisation": None}, painted
    open_wash = painted & (ndi.distance_transform_edt(edge_map == 0) > OPEN_MM * px_mm) if edge_map.any() else painted
    if open_wash.any():
        g = (_gmag(L, s) * px_mm)[open_wash]  # L* per mm, at the wash scale
        flat = float((g < FLAT_PER_MM).mean())
        out.update(open_share=round(float(open_wash.sum() / painted.sum()), 4), flat_share=round(flat, 4),
                   posterisation=round(flat * hard_contrast_share, 4), median_gradient_per_cm=round(float(np.median(g)) * 10, 3))
    return out, painted


def _components(mask, px_mm):
    """Label a mask; give each part's length (bounding-box diagonal) and width (twice the deepest point), in mm."""
    lab, n = ndi.label(mask, structure=np.ones((3, 3)))
    if not n:
        return lab, np.zeros(0), np.zeros(0), np.zeros(0)
    idx = np.arange(1, n + 1)
    boxes = ndi.find_objects(lab)
    length = np.array([math.hypot(b[0].stop - b[0].start, b[1].stop - b[1].start) for b in boxes]) / px_mm
    width = (2 * ndi.maximum(ndi.distance_transform_edt(mask), lab, idx) - 1) / px_mm
    area = ndi.sum(mask, lab, idx) / px_mm ** 2
    return lab, length, np.maximum(width, 1 / px_mm), area


def flecks(L, px_mm, painted):
    """Small lights inside paint. A grey opening with a FLECK_MAX_MM disc removes every light narrower than the
    disc; what it removed, where the paint around it is clearly darker than paper, is a candidate. Candidates
    touching open paper are ragged wash edges and are dropped. A mark as light as the sheet is white; the rest
    are pale."""
    paper = float(np.percentile(L, PAPER_PCT))
    opened = ndi.grey_opening(L, footprint=_disc(FLECK_MAX_MM * px_mm))
    cand = (L - opened >= STRONG) & (opened <= paper - STRONG)
    near_paper = ndi.binary_dilation(opened >= paper - PAPER_TOL, iterations=max(1, round(PAPER_GAP_MM * px_mm)))
    kinds = np.zeros(L.shape, np.uint8)  # 1 white fleck, 2 white slash, 3 pale fleck, 4 pale slash; for the overlay
    out = {"grain": 0}
    is_white = L >= paper - PAPER_TOL  # bare paper, not a lighter tint of paint
    # white and pale parts are separated first, so a white core inside a pale halo still counts as white
    for name, mask, base in (("white", cand & is_white, 1), ("pale", cand & ~is_white, 3)):
        lab, length, width, _ = _components(mask, px_mm)
        out.update({name + "_flecks": 0, name + "_slashes": 0, name + "_slash_mm": 0.0})
        if not len(length):
            continue
        isolated = ndi.maximum(near_paper, lab, np.arange(1, len(length) + 1)) == 0
        grain = length < GRAIN_MM
        slash = isolated & ~grain & (length >= SLASH_MIN_MM) & (length >= 3 * width)
        fleck = isolated & ~grain & ~slash
        out["grain"] += int((isolated & grain).sum())
        out.update({name + "_flecks": int(fleck.sum()), name + "_slashes": int(slash.sum()),
                    name + "_slash_mm": round(float(length[slash].sum()), 1)})
        code = np.zeros(len(length) + 1, np.uint8); code[1:][fleck] = base; code[1:][slash] = base + 1
        kinds = np.maximum(kinds, code[lab])
    cm2 = float(painted.sum()) / px_mm ** 2 / 100.0
    # one unit of defect is one white fleck, or SLASH_MIN_MM of white slash. Pale marks are reported, not scored:
    # without the subject a pale slash cannot be told from a window bar or a whisker.
    out["white_per_cm2"] = round((out["white_flecks"] + out["white_slash_mm"] / SLASH_MIN_MM) / cm2, 4) if cm2 else None
    out["pale_per_cm2"] = round((out["pale_flecks"] + out["pale_slash_mm"] / SLASH_MIN_MM) / cm2, 4) if cm2 else None
    return out, kinds


def classic_fullsize(image, plate_mm=200.0, overlay=None):
    """Target-free measures on the painting at its own size. These are measurements, not scores: on the plates
    and scans tried they did not separate real paintings from the simulator's (design-full-size-judge.md)."""
    img = load_rgb(image) if isinstance(image, str) else image
    L = lightness(img)
    px_mm = img.width / plate_mm
    e, edge_map = edge_types(L, px_mm)
    f, painted = fills(L, px_mm, edge_map, e["hard_contrast_share"])
    k, fleck_map = flecks(L, px_mm, painted)
    if overlay:
        _overlay(img, edge_map, fleck_map, px_mm).save(overlay, quality=85)
    return {"pxPerMm": round(px_mm, 3), "edges": e, "fills": f, "flecks": k}


def _overlay(img, edge_map, fleck_map, px_mm):
    """Debug picture: hard edges red, firm orange, soft blue; white flecks green and white slashes magenta
    (thickened); pale flecks and slashes cyan."""
    a = (np.asarray(img.convert("RGB"), dtype=np.float64) * 0.6 + 255 * 0.4).astype(np.uint8)
    for v, c in ((1, (220, 0, 0)), (2, (240, 150, 0)), (3, (0, 80, 255))):
        a[edge_map == v] = c
    grow = max(1, round(0.3 * px_mm))
    a[fleck_map >= 3] = (0, 200, 220)
    for v, c in ((1, (0, 170, 0)), (2, (230, 0, 230))):
        a[ndi.binary_dilation(fleck_map == v, iterations=grow)] = c
    return Image.fromarray(a)


# ---- vision tiles ----------------------------------------------------------------------------------------------

def tile_boxes(width, height, px_mm):
    """A grid of square 1:1 tiles covering the sheet; neighbours overlap just enough to reach both edges."""
    side = int(round(TILE_MM * px_mm))
    side = min(side, width, height)

    def starts(n):
        k = max(1, math.ceil(n / side))
        return [0] if k == 1 else [round(i * (n - side) / (k - 1)) for i in range(k)]

    xs, ys = starts(width), starts(height)
    return [{"row": r, "col": c, "rows": len(ys), "cols": len(xs), "box": (x, y, x + side, y + side)}
            for r, y in enumerate(ys) for c, x in enumerate(xs)]


def _where(t):
    v = "top" if t["row"] == 0 else "bottom" if t["row"] == t["rows"] - 1 else "middle"
    h = "left" if t["col"] == 0 else "right" if t["col"] == t["cols"] - 1 else "centre"
    return v if t["cols"] == 1 else h if t["rows"] == 1 else f"{v} {h}"


def judged_tiles(img, plate_mm):
    """Tiles worth judging: a tile that is almost all bare paper has nothing to judge."""
    px_mm = img.width / plate_mm
    L = lightness(img)
    painted = ndi.gaussian_filter(L, WASH_MM * px_mm) < np.percentile(L, PAPER_PCT) - PAPER_TOL
    out = []
    for t in tile_boxes(img.width, img.height, px_mm):
        x0, y0, x1, y1 = t["box"]
        share = float(painted[y0:y1, x0:x1].mean())
        if share >= 0.05:
            out.append({**t, "painted": round(share, 3), "where": _where(t)})
    return out


def parse_tile(txt):
    txt = re.sub(r"```(?:json)?", "", txt or "")
    for m in reversed(re.findall(r"\{[^{}]*\}", txt)):
        try:
            d = json.loads(m)
            out = {k: max(0.0, min(10.0, float(d[k]))) for k in ["edges", "washes", "artefacts", "overall"]}
            out["lines"] = None if d.get("lines") is None else max(0.0, min(10.0, float(d["lines"])))
            out["flags"] = sorted({f for f in d.get("flags") or [] if f in FLAGS})
            return out
        except Exception:
            pass
    return None


def _tile_content(img, tile, style, plate_mm, sp):
    side_mm = round((tile["box"][2] - tile["box"][0]) / (img.width / plate_mm))
    crop = img.crop(tile["box"])
    text = TILE_PROMPT.format(mm=side_mm, where=tile["where"], style=style, flags=", ".join(FLAGS))
    return [{"type": "text", "text": text},
            {"type": "image_url", "image_url": {"url": sp.data_uri(img, 384)}},
            {"type": "image_url", "image_url": {"url": sp.data_uri(crop, max(crop.size))}}]  # the tile is never resized


def aggregate_tiles(tiles, samples, judges, min_valid):
    """samples[(judge, tile index)] is a list of parsed replies. A tile's score from one judge is the median of
    its calls; a judge's score is the mean over the tiles it answered; the result is the mean over judges. worst is
    the mean over judges of each judge's lowest tile, because a defect lives in one place. A judge counts when it
    answered at least 3 in 5 of the tiles, the share of valid calls J1 asks of a judge."""
    med = lambda xs: float(np.median(xs)) if xs else None
    per_tile, per_judge = [], {}
    need = math.ceil(0.6 * len(tiles))
    for j in judges:
        rows = []
        for i in range(len(tiles)):
            ds = samples.get((j, i), [])
            if len(ds) >= min_valid:
                rows.append({k: med([d[k] for d in ds if d[k] is not None]) for k in CRITERIA + ["overall"]})
        if rows and len(rows) >= need:
            per_judge[j] = {**{k: _mean([r[k] for r in rows]) for k in CRITERIA + ["overall"]},
                            "worst": min(r["overall"] for r in rows), "tiles": len(rows)}
    for i, t in enumerate(tiles):
        ds = [d for j in judges for d in samples.get((j, i), [])]
        per_tile.append({"row": t["row"], "col": t["col"], "box": list(t["box"]), "where": t["where"], "calls": len(ds),
                         "overall": _mean([med([d["overall"] for d in samples.get((j, i), [])]) for j in judges]),
                         "flags": {f: round(sum(f in d["flags"] for d in ds) / len(ds), 2) for f in FLAGS} if ds else {}})
    out = {"complete": len(per_judge) == len(judges) and bool(tiles), "minValidCalls": min_valid, "minTilesPerJudge": need,
           "per_judge": {j: {k: (None if v is None else round(v, 2)) for k, v in r.items()} for j, r in per_judge.items()},
           "tiles": [{**t, "overall": None if t["overall"] is None else round(t["overall"], 2)} for t in per_tile]}
    if out["complete"]:
        out["overall"] = round(_mean([r["overall"] for r in per_judge.values()]), 2)
        out["worst"] = round(_mean([r["worst"] for r in per_judge.values()]), 2)
        out["criteria"] = {k: (lambda v: None if v is None else round(v, 2))(_mean([r[k] for r in per_judge.values()])) for k in CRITERIA}
        every = [d for ds in samples.values() for d in ds]
        out["flagShare"] = {f: round(sum(f in d["flags"] for d in every) / len(every), 3) for f in FLAGS}
        # the tile where a flag is raised most, as a share of that tile's calls
        out["flagPeak"] = {f: max((t["flags"].get(f, 0) for t in per_tile), default=0) for f in FLAGS}
    return out


def vision_tiles(image, style, plate_mm=200.0, calls=1, post=None):
    """Ask each J1 judge about each tile, `calls` times. A (judge, tile) pair needs more than half its calls valid;
    a judge needs 3 in 5 of its tiles."""
    import score_painting as sp
    post = post or sp._post
    img = load_rgb(image) if isinstance(image, str) else image
    tiles = judged_tiles(img, plate_mm)
    contents = [_tile_content(img, t, style, plate_mm, sp) for t in tiles]

    def run(job):
        j, i = job
        budget = sp.J2_MAX_TOKENS
        for _ in range(3):  # up to two retries with the images; no text-only repair
            try:
                raw, _usage = post(j, [{"role": "user", "content": contents[i]}], max_tokens=budget)
            except RuntimeError as e:
                err = str(e)[:160]
                continue
            d = parse_tile(raw)
            if d:
                return d
            # at temperature 0 a judge that spent its whole budget thinking does so again: give it more room
            err, budget = "no valid JSON", min(budget * 2, sp.J2_MAX_TOKENS_CAP)
        return {"error": err}

    jobs = [(j, i) for j in sp.JUDGES for i in range(len(tiles)) for _ in range(calls)]
    with ThreadPoolExecutor(9) as ex:
        got = list(ex.map(run, jobs)) if jobs else []
    samples, errors = {}, {j: 0 for j in sp.JUDGES}
    for (j, i), d in zip(jobs, got):
        if "error" in d:
            errors[j] += 1
        else:
            samples.setdefault((j, i), []).append(d)
    out = aggregate_tiles(tiles, samples, sp.JUDGES, calls // 2 + 1)
    out.update(errors=errors, callsPerTile=calls, tileMm=TILE_MM, judges=list(sp.JUDGES), provider=sp.PROVIDER)
    return out


def score(image, style, plate_mm=200.0, vision=True, calls=1, overlay=None, post=None):
    if plate_mm <= 0:
        raise ValueError("plate_mm must be positive")
    if calls < 1:
        raise ValueError("calls must be a positive integer")
    img = load_rgb(image)
    cl = classic_fullsize(img, plate_mm, overlay)
    vi = vision_tiles(img, style, plate_mm, calls, post) if vision else {"complete": False, "tiles": [], "per_judge": {}}
    complete = bool(vi.get("complete"))
    return {"version": VERSION, "paintingSize": list(img.size), "plateMm": plate_mm, "style": style,
            "craft": vi["overall"] if complete else None, "worstTile": vi["worst"] if complete else None,
            "complete": complete, "criteria": vi.get("criteria"), "flagShare": vi.get("flagShare"),
            "flagPeak": vi.get("flagPeak"), "measures": cl, "vision": vi}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--image", required=True)
    ap.add_argument("--style", default="watercolor and ink")
    ap.add_argument("--plate-mm", type=float, default=200.0, help="width of the sheet in millimetres (default %(default)s)")
    ap.add_argument("--no-vision", action="store_true", help="measures only; needs no key")
    ap.add_argument("--calls", type=int, default=1, help="calls per judge per tile (default %(default)s)")
    ap.add_argument("--overlay", help="write a JPEG that marks the edges, flecks and slashes found")
    ap.add_argument("--out")
    a = ap.parse_args()
    if not a.no_vision:
        import score_painting as sp
        if not os.environ.get(sp.KEY):
            sys.exit(f"{sp.KEY} is not set (JUDGE_ROUTE={sp.PROVIDER}); pass --no-vision for the classic part only")
    try:
        r = score(a.image, a.style, a.plate_mm, not a.no_vision, a.calls, a.overlay)
    except ValueError as e:
        ap.error(str(e))
    s = json.dumps(r, indent=1)
    if a.out:
        open(a.out, "w").write(s)
    print(s)
    if not a.no_vision and not r["complete"]:
        print("incomplete: a judge answered fewer than 3 in 5 of the tiles", file=sys.stderr)


if __name__ == "__main__":
    main()
