#!/usr/bin/env python3
# Pipeline: step 0 (before every drawing input): what the source picture is DRAWN with.
"""Classify a source picture's drawing medium, from the image itself, so the pipeline draws what the picture has.

    classify-medium.py IMAGE --id ID [--out classify] [--opinions opinions.json]

Writes <out>/<id>.json and <out>/<id>-*.jpg (evidence crops, 3x).

line: 'ink'    a visible pen or brush LINE drawing carries the forms (dark, two sharp edges, long and continuous,
               as dark as or darker than the darkest wash, along much of the forms' boundaries);
      'pencil' graphite or chalk under or beside the washes: thin, long, PALE grey lines, lighter than the wash darks;
      'none'   pure wash, no visible drawing.

The measurement is general and the same for every picture (no per-subject setting). At 1200 px on the long side:
  line marks   thin dark structures: darker than their own surroundings by a small black top-hat (width <= ~5 px,
               so a line has two sharp edges close together), in connected marks whose skeleton is long (>= 24 px)
               and narrow (area per skeleton pixel <= 4.5 px);
  density      skeleton length of such marks per 1000 px of picture;
  contrast     median darkness of a line mark below its local wash (L*, 0..100);
  line L       median L* of line pixels, against wash dark = 2nd percentile of the median-filtered picture;
  carry        share of the picture's big form boundaries (Canny at sigma 3) that lie within 3 px of a line mark;
  colour       mean chroma and hue of line pixels: black, brown/sepia, red chalk, grey (graphite).
A second opinion from vision models (given in --opinions as {model: class}) is recorded; where they and the
measurement disagree, the more conservative class is kept: none < pencil < ink, that is pencil over ink.
"""
import argparse, json, math, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import color, feature, morphology

LONG = 1200
RANK = {'none': 0, 'pencil': 1, 'ink': 2}
MIXED_HI = 0.6   # share of the laid strokes that are ink (tag-medium.py): at least this, the picture is ink
MIXED_LO = 0.15  # at least this, mixed: inked in part; below it, pencil (only a sheet measured ink is refined)


def load(path, long=LONG):
    im = Image.open(path).convert('RGB')
    s = long / max(im.size)
    if abs(s - 1) > 1e-3: im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    return np.asarray(im, dtype=np.float32) / 255.0


def hue_name(L, C, h):
    if C < 7: return 'black' if L < 40 else 'grey'
    if 20 <= h < 100: return 'brown' if L < 55 or C < 30 else 'sepia'
    if h < 20 or h >= 330: return 'red'
    if 180 <= h < 300: return 'blue'
    return 'coloured'


def measure(rgb):
    lab = color.rgb2lab(rgb)
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    C = np.hypot(a, b)
    h, w = L.shape
    # paper: the light end of the picture (the brightest 5% of a border-free median picture)
    Lm = ndi.median_filter(L, size=9)
    bright = Lm >= np.percentile(Lm, 95)
    paperL, paperC = float(np.median(L[bright])), float(np.median(C[bright]))
    paper = 'white' if paperL > 86 and paperC < 10 else 'toned'
    # wash: how much of the picture is not paper, and is it coloured
    painted = Lm < paperL - 8
    wC = C[painted]
    wash_share = float(painted.mean())
    # wash: colour when the chromatic pixels span more than one hue family; one hue (sepia, bistre, grey) is monochrome
    chrom = C[painted] > 10
    if wash_share < 0.03: wash = 'none'
    elif chrom.mean() < 0.1: wash = 'monochrome'
    else:
        hw = np.degrees(np.arctan2(b[painted][chrom], a[painted][chrom])) % 360
        # two hue families at least 60 degrees apart, each holding 5% of the coloured paint: a coloured wash
        hist = np.bincount((hw // 30).astype(int) % 12, minlength=12) / len(hw)
        fam = [k for k in range(12) if hist[k] >= 0.05]
        wash = 'colour' if any(min(abs(i - j), 12 - abs(i - j)) >= 2 for i in fam for j in fam) else 'monochrome'
    wash_dark = float(np.percentile(Lm, 2))
    # thin dark structures: black top-hat with a small disc (two sharp edges within ~5 px)
    bg = ndi.grey_closing(L, footprint=morphology.disk(3))
    th = bg - L
    # the floor: a few L* above the grain of the picture's own texture (paper tooth, granulation)
    noise = float(np.median(np.abs(th - np.median(th)))) * 1.4826
    T = max(6.0, 4.0 * noise)
    cand = th > T
    cand = morphology.remove_small_objects(cand, max_size=12)
    lab_, n = ndi.label(cand, structure=np.ones((3, 3)))
    sk = morphology.skeletonize(cand)
    if n:
        sklen = ndi.sum(sk, lab_, index=np.arange(1, n + 1))
        area = ndi.sum(cand, lab_, index=np.arange(1, n + 1))
        keep = (sklen >= 24) & (area / np.maximum(sklen, 1) <= 4.5)
        keep = np.concatenate([[False], keep])
        line = keep[lab_]
    else:
        line = np.zeros_like(cand)
    line_sk = line & sk
    dens = float(line_sk.sum()) / (h * w) * 1000
    st = {'paperL': round(paperL, 1), 'paperC': round(paperC, 1), 'paper': paper, 'wash': wash,
          'wash_share': round(wash_share, 3), 'wash_dark_L': round(wash_dark, 1), 'noise': round(noise, 2), 'T': round(T, 1),
          'line_density': round(dens, 2)}
    if line.sum() < 50:
        st.update(line_contrast=0.0, line_L=None, line_C=None, carry=0.0, strong_density=0.0, line_colour=None)
        st.update(opaque_lights_measure(lab, L, paperL, a, b, bright, wash_dark))
        z = np.zeros_like(line, dtype=bool)
        MAPS.update(line=z, sk=z, pen=z, edges=z, L=L, th=th, rng=max(10.0, paperL - wash_dark), wash_dark=wash_dark, C=C)
        return st, line, th, L
    con = th[line]
    st['line_contrast'] = round(float(np.median(con)), 1)
    # strong lines: dark enough to read as drawn in a dark medium (contrast >= 22 L* and at or below mid grey)
    strong = line & (th >= 22) & (L <= max(wash_dark + 25, 50))
    st['strong_density'] = round(float((strong & sk).sum()) / (h * w) * 1000, 2)
    # colour of the darker half of the line pixels (a line's core, not its soft edge)
    core = line & (th >= np.median(con))
    Lc, ac, bc = float(np.median(L[core])), float(np.median(a[core])), float(np.median(b[core]))
    Cc, hc = math.hypot(ac, bc), math.degrees(math.atan2(bc, ac)) % 360
    st.update(line_L=round(Lc, 1), line_C=round(Cc, 1), line_hue=round(hc), line_colour=hue_name(Lc, Cc, hc))
    st['line_vs_wash_dark'] = round(Lc - wash_dark, 1)
    # carry: share of big form boundaries within 3 px of a line mark
    edges = feature.canny(L, sigma=3, low_threshold=4, high_threshold=10)
    near = ndi.binary_dilation(line, iterations=3)
    st['carry'] = round(float((edges & near).sum()) / max(1, edges.sum()), 3)
    near_s = ndi.binary_dilation(strong, iterations=3)
    st['carry_strong'] = round(float((edges & near_s).sum()) / max(1, edges.sum()), 3)
    st['edge_density'] = round(float(edges.sum()) / (h * w) * 1000, 2)
    # pen-like: a line at least a fifth of the picture's range darker than its surroundings, and on light ground
    rng = max(10.0, paperL - wash_dark)
    pen = line & (th >= max(10.0, 0.2 * rng))
    st['pen_density'] = round(float((pen & sk).sum()) / (h * w) * 1000, 2)
    st['carry_pen'] = round(float((edges & ndi.binary_dilation(pen, iterations=3)).sum()) / max(1, edges.sum()), 3)
    st['on_light'] = round(float((bg[pen & sk] >= paperL - 0.35 * rng).mean()) if (pen & sk).any() else 0.0, 3)
    st['line_core_vs_wash_dark'] = round((float(np.percentile(L[line], 25)) - wash_dark) / rng, 3)
    # long lines: the mean skeleton length of the marks that make the line pixels (a pen line runs on; brushed fur is short)
    if n:
        ids = np.unique(lab_[line_sk]); lens = sklen[ids - 1]
        st['mark_len'] = round(float((lens ** 2).sum() / max(1, lens.sum())), 1)
    st.update(opaque_lights_measure(lab, L, paperL, a, b, bright, wash_dark))
    MAPS.update(line=line, sk=sk, pen=pen, edges=edges, L=L, th=th, rng=rng, wash_dark=wash_dark, C=C)
    return st, line, th, L


MAPS = {}
CELL = 40         # the line map's cell, px at 1200 (about 9 mm on a 280 mm sheet)
WINDOW = 3        # each cell is judged on the window of WINDOW x WINDOW cells around it (the same measurements, locally)
CELL_PEN = 4.0    # a cell is ink with at least this pen-like line density in its window,
CELL_CARRY = 0.15  # carrying this share of its form edges,
CELL_CORE = 0.10  # its line core within this share of the picture's range of the darkest wash near it (or darker)
CODES = {'none': 0, 'dry-faint': 1, 'dry-visible': 2, 'ink': 3}


def linemap(labels=None, sheet='ink', st=None):
    """The line medium by region, from local evidence only (the picture's class is a summary of this map, never a gate
    on it): a cell whose neighbourhood has pen-like line (a pen, or a fine brush used as one) carrying its form edges,
    clearly dark, and as dark as the darkest wash near it, is ink; a cell with thinner or paler line is dry (visible when
    its line reads in the finished picture); a cell with no line is none. A pale grey (graphite) sheet line is never ink. Smoothed (a cell takes the most
    common class of its 3x3 cells), then summed over the thing regions (labels/<id>.json boxes) when given.
    Returns (class grid, per-region table, summary)."""
    line, sk, pen, edges, L, th = (MAPS[k] for k in ('line', 'sk', 'pen', 'edges', 'L', 'th'))
    rng, wd = MAPS['rng'], MAPS['wash_dark']
    h, w = L.shape; gh, gw = -(-h // CELL), -(-w // CELL); win = CELL * WINDOW
    f = lambda m: ndi.uniform_filter(m.astype(np.float32), win, mode='constant')
    dens = f(line & sk) * 1000; pdens = f(pen & sk) * 1000
    carry = f(edges & ndi.binary_dilation(pen, iterations=3)) / np.maximum(f(edges), 1e-6)
    core_m = line & (th >= np.median(th[line]) if line.any() else line)
    coreL = f(np.where(core_m, L, 0)) / np.maximum(f(core_m), 1e-6)
    core = (coreL - wd) / rng
    con = f(np.where(line, th, 0)) / np.maximum(f(line), 1e-6)
    ys = np.minimum(np.arange(gh) * CELL + CELL // 2, h - 1); xs = np.minimum(np.arange(gw) * CELL + CELL // 2, w - 1)
    P = lambda m: m[np.ix_(ys, xs)]
    dens, pdens, carry, core, con = map(P, (dens, pdens, carry, core, con))
    # the darkest wash near each cell (thin lines filtered out first): a line as dark as that, or darker, is a drawn line
    Lm = ndi.median_filter(L, size=7)
    wdl = P(ndi.grey_erosion(Lm, size=(win, win)))
    coreL_c = P(coreL)
    local_core = (coreL_c - wdl) / rng
    graphite = (st or {}).get('line_colour') == 'grey' and ((st or {}).get('line_L') or 0) >= 45
    ink = (pdens >= CELL_PEN) & (carry >= CELL_CARRY) & (local_core <= CELL_CORE) & (con >= VISIBLE_CONTRAST) & (not graphite)
    dry = ~ink & (dens >= PENCIL_DENSITY)
    vis = dry & (con >= VISIBLE_CONTRAST) & (pdens >= VISIBLE_DENSITY)
    MAPS['cell'] = dict(local_core=local_core, con=con, pdens=pdens)
    g = np.zeros((gh, gw), np.uint8); g[dry] = 1; g[vis] = 2; g[ink] = 3
    # smoothing: the most common class among the 3x3 cells
    cnt = np.stack([ndi.uniform_filter((g == k).astype(np.float32), 3, mode='nearest') for k in range(4)])
    g = cnt.argmax(0).astype(np.uint8)
    names = {v: k for k, v in CODES.items()}
    drawn = (g > 0).sum()
    summary = {'cells': int(g.size), 'share': {k: round(float((g == v).mean()), 3) for k, v in CODES.items()},
               'ink_share_of_drawn': round(float((g == 3).sum() / drawn), 3) if drawn else 0.0}
    summary['dominant'] = names[int(np.bincount(g[g > 0].ravel(), minlength=4).argmax())] if drawn else 'none'
    regions = []
    for t in (labels or []):
        b = t.get('box')
        if not b or len(b) != 4: continue
        x0, y0, x1, y1 = (int(round(v * n)) for v, n in zip(b, (gw, gh, gw, gh)))
        sub = g[max(0, y0):max(y0 + 1, y1), max(0, x0):max(x0 + 1, x1)]
        if not sub.size: continue
        sh = {k: round(float((sub == v).mean()), 2) for k, v in CODES.items()}
        med = 'ink' if sh['ink'] >= 0.3 else ('dry-visible' if sh['dry-visible'] >= 0.3 else ('dry-faint' if sh['dry-faint'] + sh['dry-visible'] >= 0.3 else 'none'))
        regions.append({'thing': t.get('name'), 'kind': t.get('kind'), 'box': b, 'medium': med, 'share': sh, 'model_says': t.get('how_drawn')})
    return g, regions, summary


def save_linemap(g, shape, path):
    """An indexed PNG at the picture's size (at 1200 px): 0 none, 1 dry faint, 2 dry visible, 3 ink."""
    im = Image.fromarray(np.kron(g, np.ones((CELL, CELL), np.uint8))[:shape[0], :shape[1]], 'P')
    im.putpalette([255, 255, 255, 150, 190, 230, 40, 90, 200, 180, 30, 30] + [0] * 756)
    im.save(path)


OPAQUE_DENSITY = 6.0      # light marks laid over darker paint, per 1000 px: gouache or body-colour lights


def opaque_lights_measure(lab, L, paperL, a, b, bright, wash_dark):
    """Light marks lying OVER darker paint: small light strokes (white top-hat, <= ~6 px across) much lighter than the paint
    around them, whose colour is not the paper's. A reserved light in transparent watercolour is the paper itself (its
    colour); a light that is lighter than its surroundings and not the paper colour was laid on top (gouache, body colour)."""
    rng = max(10.0, paperL - wash_dark)
    # drawn lines out first (a closing): the paper left between pen lines or hatching is not a light laid on top
    Lc = ndi.grey_closing(L, footprint=morphology.disk(2))
    op = ndi.grey_opening(Lc, footprint=morphology.disk(4))
    wth = Lc - op
    pa, pb = float(np.median(a[bright])), float(np.median(b[bright]))
    dE = np.sqrt((L - paperL) ** 2 + (a - pa) ** 2 + (b - pb) ** 2)
    m = (wth >= max(12.0, 0.3 * rng)) & (op <= paperL - 0.35 * rng) & (L >= wash_dark + 0.5 * rng)
    # light STROKES: long and narrow (a blade, a straw, a rope, a highlight dragged on), not a reserved fleck or patch
    lab_, n = ndi.label(m, structure=np.ones((3, 3)))
    sk = morphology.skeletonize(m)
    if n:
        sl = ndi.sum(sk, lab_, index=np.arange(1, n + 1)); ar = ndi.sum(m, lab_, index=np.arange(1, n + 1))
        keep = np.concatenate([[False], (sl >= 15) & (ar / np.maximum(sl, 1) <= 4.0)])
        m = keep[lab_] & sk
    else: m = m & False
    h, w = L.shape
    d = float(m.sum()) / (h * w) * 1000
    return {'opaque_light_density': round(d, 2), 'opaque_lights': bool(d >= OPAQUE_DENSITY)}


# The rule (one for every picture). Thresholds are in the measurements' own units, set once on the 17 subjects and
# the synthetic test; a wrong class is fixed here, never per subject.
INK_PEN_DENSITY = 7.0     # pen-like line marks per 1000 px (at 1200 px long side)
INK_CARRY = 0.18          # share of the big form boundaries that lie on a pen-like line
INK_CORE = 0.08           # the line's dark core within 8% of the picture's range of its darkest wash (or darker)
PENCIL_DENSITY = 2.0      # any thin line marks at all, below the ink rule: a drawing under the wash


def decide(st):
    """The class from the measurements. Returns (class, confidence, reasons)."""
    why = []
    d, pd, cp = st['line_density'], st.get('pen_density', 0), st.get('carry_pen', 0)
    core = st.get('line_core_vs_wash_dark', 1)
    graphite = st.get('line_colour') == 'grey' and (st.get('line_L') or 0) >= 45
    margins = {'pen': pd / INK_PEN_DENSITY - 1, 'carry': cp / INK_CARRY - 1, 'core': 1 - core / INK_CORE if core > 0 else 1}
    if not graphite and min(margins.values()) >= 0:
        cls = 'ink'; m = min(margins.values())
        why.append(f'pen-like line {pd}/1000 px carries {cp:.0%} of the form boundaries; its dark core is as dark as the darkest wash ({core:+.2f} of the range)')
    else:
        failed = [k for k, v in margins.items() if v < 0]
        if graphite: why.append(f'the line is grey and pale (L* {st.get("line_L")}): graphite, not ink')
        if 'pen' in failed: why.append(f'too few pen-like line marks ({pd}/1000 px, ink needs {INK_PEN_DENSITY})')
        if 'carry' in failed: why.append(f'the lines carry only {cp:.0%} of the form boundaries (ink needs {INK_CARRY:.0%})')
        if 'core' in failed: why.append(f'the lines are paler than the darkest wash ({core:+.2f} of the range; ink needs <= {INK_CORE})')
        ink_m = -min(margins.values()) if not graphite else 1.0
        if d >= PENCIL_DENSITY:
            cls = 'pencil'; m = min(ink_m, d / PENCIL_DENSITY - 1)
            why.append(f'thin line marks {d}/1000 px: a drawing under or beside the wash')
        else:
            cls = 'none'; m = min(ink_m, 1 - d / PENCIL_DENSITY)
            why.append(f'few thin line marks ({d}/1000 px): pure wash')
    conf = round(0.5 + 0.4 * max(0.0, min(1.0, 2 * m)), 2)   # the measurement alone says at most 0.9
    return cls, conf, why


def crops(rgb, line, th, out, id_, size=110, scale=3):
    """Evidence, at 3x beside the line marks found: crop1 the window with the STRONGEST line evidence (most thin dark
    two-edged line marks), crop2 the painted window with the WEAKEST (the best case against a drawn line)."""
    h, w = line.shape
    dens = ndi.uniform_filter(line.astype(np.float32), size)
    L = MAPS['L']; paperL = np.percentile(L, 95)
    painted = ndi.uniform_filter((L < paperL - 8).astype(np.float32), size) > 0.6
    inner = np.zeros_like(painted); inner[size // 2:h - size // 2, size // 2:w - size // 2] = True
    cand_hi = np.where(inner, dens, -1)
    cand_lo = np.where(inner & painted, dens, np.inf)
    picks = [np.unravel_index(np.argmax(cand_hi), dens.shape)]
    if np.isfinite(cand_lo).any(): picks.append(np.unravel_index(np.argmin(cand_lo), dens.shape))
    files = []
    for k, (y, x) in enumerate(picks):
        y0 = int(np.clip(y - size // 2, 0, h - size)); x0 = int(np.clip(x - size // 2, 0, w - size))
        a = (rgb[y0:y0 + size, x0:x0 + size] * 255).astype(np.uint8)
        m = np.full_like(a, 255); m[line[y0:y0 + size, x0:x0 + size]] = (200, 30, 30)
        both = np.concatenate([a, np.full((size, 4, 3), 255, np.uint8), m], axis=1)
        im = Image.fromarray(both).resize((both.shape[1] * scale, size * scale), Image.NEAREST)
        f = os.path.join(out, f'{id_}-crop{k + 1}.jpg'); im.save(f, quality=88)
        files.append({'file': os.path.relpath(f, out), 'box_px_at_1200': [x0, y0, size, size],
                      'shows': 'strongest line evidence' if k == 0 else 'weakest line evidence (painted)',
                      'line_density': round(float(dens[y, x]) * 1000, 1)})
    return files


VISIBLE_CONTRAST = 15.0   # a dry line this much darker than its wash, and
VISIBLE_DENSITY = 8.0     # this dense (pen-like marks per 1000 px), reads in the finished picture: a visible drawing


def strength(cls, st):
    """'visible' when the drawing reads in the finished picture, 'faint' when the washes all but cover it."""
    if cls == 'none': return None
    if cls in ('ink', 'mixed'): return 'visible'
    return 'visible' if st.get('line_contrast', 0) >= VISIBLE_CONTRAST and st.get('pen_density', 0) >= VISIBLE_DENSITY else 'faint'


def dry_kind(st):
    """Which dry medium a non-ink line looks like: dark grey/black crayon or chalk, red chalk, or graphite."""
    c, L = st.get('line_colour'), st.get('line_L') or 100
    if c == 'red': return 'red chalk'
    if c in ('grey', 'black') and L < 45: return 'black crayon or chalk'
    return 'graphite'


def plain(cls, colour, stg, kind):
    if cls == 'ink': return f'pen line, {colour or "dark"}'
    if cls == 'mixed': return f'pen line in part, {colour or "dark"}; wash elsewhere'
    if cls == 'none': return 'no drawing'
    return f'{kind} drawing, visible' if stg == 'visible' else 'pencil under wash, faint'


def draws(cls, stg):
    if cls in ('ink', 'mixed'): return 'the Qwen e6 drawing (or the artist\'s own line), fitted; each stroke ink only where the source has a line under it, a pale lay-in contour where it has only an edge, dropped elsewhere'
    if cls == 'none' or stg == 'faint': return 'no ink: a light pencil lay-in (Qwen L1), laid pale so the washes cover it'
    return 'no ink: the source\'s own dry line (Qwen l2 crayon drawing, laid at its darkness, left visible)'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image'); ap.add_argument('--id', required=True); ap.add_argument('--out', default='classify')
    ap.add_argument('--opinions', help='JSON {model: class} from vision models')
    ap.add_argument('--nocrops', action='store_true')
    ap.add_argument('--fates', help='the subject\'s model drawing, fitted and tagged (tools/seg/tag-medium.py): its ink share refines the label')
    ap.add_argument('--labels', help='thing labels JSON (default: labels/<id>.json beside the out folder)')
    A = ap.parse_args()
    os.makedirs(A.out, exist_ok=True)
    rgb = load(A.image)
    st, line, th, L = measure(rgb)
    cls_m, conf, why = decide(st)
    ops = json.load(open(A.opinions)) if A.opinions and os.path.exists(A.opinions) else {}
    ops = {k: v for k, v in ops.items() if v in RANK or v == 'mixed'}
    cls = cls_m
    disagree = []
    rec = {'id': A.id, 'image': A.image, 'line': cls, 'line_colour': st.get('line_colour') if cls != 'none' else None,
           'wash': st['wash'], 'paper': st['paper'], 'confidence': conf, 'measured_class': cls_m, 'opinions': ops,
           'disagreement': bool(disagree), 'why': why, 'opaque_lights': st['opaque_lights'], 'line_strength': strength(cls, st),
           'dry_medium': dry_kind(st) if cls == 'pencil' else None,
           'plain': plain(cls, st.get('line_colour'), strength(cls, st), dry_kind(st)), 'pipeline_draws': draws(cls, strength(cls, st)),
           'measurements': st, 'method': 'tools/seg/classify-medium.py (step 0)'}
    if not A.nocrops: rec['evidence'] = crops(rgb, line, th, A.out, A.id)
    lbl = A.labels or os.path.join(os.path.dirname(os.path.abspath(A.out)), 'labels', f'{A.id}.json')
    things = json.load(open(lbl)).get('things', []) if os.path.exists(lbl) else []
    g, regions, summary = linemap(things, cls, st)
    save_linemap(g, L.shape, os.path.join(A.out, f'{A.id}-linemap.png'))
    # the picture's label: the sheet's measured class, refined by the strokes when the model drawing has been checked
    # stroke by stroke (--fates: a tagged vectors file, tools/seg/tag-medium.py): the share of laid strokes that the
    # source draws in line makes it ink, mixed (inked in part) or leaves it as measured
    lab_, share = cls, None
    if A.fates and os.path.exists(A.fates):
        c = json.load(open(A.fates)).get('mediumMap', {}).get('counts', {})
        laid = c.get('ink', 0) + c.get('layin', 0)
        share = round(c.get('ink', 0) / laid, 3) if laid else 0.0
        if cls == 'ink':   # the check refines a sheet measured as pen-drawn; it never turns a wash or pencil sheet into ink
            lab_ = 'ink' if share >= MIXED_HI else ('mixed' if share >= MIXED_LO else 'pencil')
        if lab_ != cls: why.append(f'stroke check: {share:.0%} of the laid strokes have a source line under them, so {lab_}')
    rec.update(line=lab_, ink_share_of_laid_strokes=share, plain=plain(lab_, st.get('line_colour'), strength(lab_, st), dry_kind(st)),
               pipeline_draws=draws(lab_, strength(lab_, st)), line_strength=strength(lab_, st),
               dry_medium=dry_kind(st) if lab_ == 'pencil' else None,
               line_colour=st.get('line_colour') if lab_ != 'none' else None)
    # whole-picture model opinions are recorded against the final label, never allowed to overrule it (they misread Trumbull)
    disagree = [k for k, v in ops.items() if v != lab_ and not (v == 'ink' and lab_ == 'mixed')]
    if disagree: conf = round(conf * 0.85, 2); why.append('models disagree: ' + ', '.join(f'{k}: {ops[k]}' for k in disagree))
    elif ops: conf = round(min(0.99, conf + 0.1), 2)
    rec.update(confidence=conf, disagreement=bool(disagree))
    rec['linemap'] = {'file': f'{A.id}-linemap.png', 'codes': CODES, 'cell_px_at_1200': CELL, 'summary': summary,
                      'regions': regions, 'labels': os.path.relpath(lbl, os.path.dirname(os.path.abspath(A.out))) if things else None}
    json.dump(rec, open(os.path.join(A.out, f'{A.id}.json'), 'w'), indent=1)
    print(f"{A.id:18} {rec['line']:6} {rec['plain']:32} conf {conf}  dens {st['line_density']} strong {st.get('strong_density')} con {st.get('line_contrast')} "
          f"carry {st.get('carry')}/{st.get('carry_strong')} lineL {st.get('line_L')} washdark {st['wash_dark_L']} {st.get('line_colour')} "
          f"wash {st['wash']} paper {st['paper']}")


if __name__ == '__main__':
    main()
