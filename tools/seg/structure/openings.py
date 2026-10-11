"""Repeated openings (windows, arcades, bays) and columns, regularised into a consistent unit.

A sketcher does not trace twelve windows; they decide what one window looks like and repeat it
along the facade, shrinking with the perspective. This module finds candidate openings, groups
the ones that repeat (similar size, sharing a row or column) and gives each group one shape.
"""
import cv2
import numpy as np


def candidate_openings(grey, short_side, exclude=None):
    """Dark, compact, roughly rectangular blobs relative to their surroundings.

    Returns dicts x, y, w, h (bounding box), arched (bool), fill, darkness."""
    h, w = grey.shape
    bg = cv2.GaussianBlur(grey, (0, 0), short_side*.03)
    local = cv2.GaussianBlur(grey, (0, 0), 1.2)
    contrast = max(.1, float(np.diff(np.percentile(grey, [2, 98]))[0]))
    dark = ((bg-local)/contrast > .16).astype(np.uint8)
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    if exclude is not None:
        dark[exclude > 0] = 0
    count, labels, stats, cents = cv2.connectedComponentsWithStats(dark, connectivity=4)
    area_lo, area_hi = (short_side*.009)**2, (short_side*.2)**2
    found = []
    for i in range(1, count):
        x, y, bw, bh, area = stats[i]
        if not area_lo <= area <= area_hi or bw < 4 or bh < 5:
            continue
        aspect = bh/bw
        fill = area/(bw*bh)
        if not .5 <= aspect <= 6 or fill < .45:
            continue
        if x <= 1 or y <= 1 or x+bw >= w-1 or y+bh >= h-1:
            continue
        m = labels[y:y+bh, x:x+bw] == i
        # Arched head: the top corners are empty while the top centre is filled.
        k = max(2, bh//5); c = max(1, bw//4)
        corners = (m[:k, :c].mean()+m[:k, -c:].mean())/2
        centre = m[:k, c:-c].mean() if bw > 2*c else m[:k].mean()
        arched = corners < .35 and centre > .6 and bw >= 6
        darkness = float(np.mean((bg-local)[y:y+bh, x:x+bw][m]))/contrast
        found.append(dict(x=float(x), y=float(y), w=float(bw), h=float(bh), arched=bool(arched),
                          fill=float(fill), darkness=darkness))
    return found


def _toward(a, b, vps, tol=np.radians(4)):
    """True when the line from a to b runs toward one of the (horizontal) vanishing points."""
    d = b-a
    for v in vps:
        r = v[:2] if abs(v[2]) < 1e-9 else v[:2]/v[2]-a
        cos = abs(np.dot(d, r))/max(np.linalg.norm(d)*np.linalg.norm(r), 1e-9)
        if np.arccos(min(1.0, cos)) < tol:
            return True
    return False


def group_repeats(cands, size_ratio=1.4, row_vps=()):
    """Union openings of similar size that share a row or a column.

    A row on a receding facade runs toward its horizontal vanishing point, not across the page."""
    n = len(cands)
    parent = list(range(n))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for i in range(n):
        a = cands[i]
        for j in range(i+1, n):
            b = cands[j]
            if max(a['w'], b['w'])/min(a['w'], b['w']) > size_ratio or max(a['h'], b['h'])/min(a['h'], b['h']) > size_ratio:
                continue
            ca = np.r_[a['x']+a['w']/2, a['y']+a['h']/2]; cb = np.r_[b['x']+b['w']/2, b['y']+b['h']/2]
            same_row = abs(ca[1]-cb[1]) < .35*min(a['h'], b['h']) or _toward(ca, cb, row_vps)
            same_col = abs((a['x']+a['w']/2)-(b['x']+b['w']/2)) < .35*min(a['w'], b['w'])
            gap = abs((a['x']+a['w']/2)-(b['x']+b['w']/2)) if same_row else abs((a['y']+a['h']/2)-(b['y']+b['h']/2))
            near = gap < 6*max(a['w'], a['h'], b['w'], b['h'])
            if (same_row or same_col) and near:
                parent[root(i)] = root(j)
    groups = {}
    for i in range(n):
        groups.setdefault(root(i), []).append(cands[i])
    return list(groups.values())


def _trend(xs, ys):
    """Linear fit of ys over xs (perspective shrink along a row); a constant for short groups."""
    if len(xs) >= 3 and np.ptp(xs) > 1e-6:
        k, c = np.polyfit(xs, ys, 1)
        return lambda x: k*x+c
    m = float(np.median(ys))
    return lambda x: m


def regularise(group):
    """One unit for the group: aligned heads and sills, proportional widths, shared head shape."""
    cx = np.array([g['x']+g['w']/2 for g in group]); cy = np.array([g['y']+g['h']/2 for g in group])
    horizontal = np.ptp(cx) >= np.ptp(cy)
    axis = cx if horizontal else cy
    top = _trend(axis, [g['y'] for g in group]); bot = _trend(axis, [g['y']+g['h'] for g in group])
    aspect = float(np.median([g['w']/g['h'] for g in group]))
    arched = sum(g['arched'] for g in group) > len(group)/2
    kinds = [g.get('kind', 'opening') for g in group]
    kind = max(set(kinds), key=kinds.count)
    units = []
    for g, a, x, y in zip(group, axis, cx, cy):
        if horizontal:
            t, b = top(a), bot(a)
            hh = max(4.0, b-t); ww = hh*aspect
            units.append(dict(x=x-ww/2, y=t, w=ww, h=hh, arched=arched, kind=kind, lines=g.get('lines', ())))
        else:
            ww = float(np.median([q['w'] for q in group])); hh = ww/aspect
            units.append(dict(x=x-ww/2, y=y-hh/2, w=ww, h=hh, arched=arched, kind=kind, lines=g.get('lines', ())))
    return units


def _vertical(seg, tol=.08):
    d = seg[2:]-seg[:2]
    return abs(d[0]) <= tol*abs(d[1])


def bays(lines, grey, short_side, arcs=(), contrast=1.0):
    """Openings and columns from pairs of parallel vertical lines a bay's width apart.

    Each line index is used at most once and bays never overlap, so a colonnade gives one unit per
    shaft. The tone between the lines decides the kind: darker inside is an opening (window,
    doorway, gap between piers), lighter inside a column or pier. Returns (units, used line indices)."""
    h, w = grey.shape
    vert = []
    for k, g in enumerate(lines):
        s = g['seg']
        if _vertical(s) and g['length'] >= short_side*.05:
            x = float((s[0]+s[2])/2); y0, y1 = sorted((float(s[1]), float(s[3])))
            vert.append((x, y0, y1, k))
    vert.sort()
    pairs = []
    for i, (xa, a0, a1, ka) in enumerate(vert):
        for xb, b0, b1, kb in vert[i+1:]:
            wd = xb-xa
            if wd < short_side*.012:
                continue
            if wd > short_side*.12:
                break
            la, lb = a1-a0, b1-b0
            overlap = min(a1, b1)-max(a0, b0)
            if overlap < .7*min(la, lb) or min(la, lb) < .55*max(la, lb):
                continue
            top, bot = max(a0, b0), min(a1, b1)
            hh = bot-top
            if not .9 <= hh/wd <= 16:
                continue
            x0, x1 = int(round(xa+wd*.2)), int(round(xb-wd*.2))
            y0, y1 = int(round(top+hh*.1)), int(round(bot-hh*.1))
            inner = float(grey[y0:y1, x0:x1].mean()) if x1 > x0 and y1 > y0 else 0
            m = max(2, int(wd*.4))
            left = grey[y0:y1, max(0, int(xa)-m):max(1, int(xa)-1)]
            right = grey[y0:y1, int(xb)+1:min(w, int(xb)+m)]
            flank = float(np.mean([left.mean() if left.size else inner, right.mean() if right.size else inner]))
            tone = (inner-flank)/contrast
            if abs(tone) < .06:
                continue
            quality = overlap/max(la, lb)*min(1, abs(tone)/.2)
            pairs.append((quality, dict(x0=xa, x1=xb, top=top, bottom=bot, tone=tone, lines=(ka, kb))))
    pairs.sort(key=lambda t: -t[0])
    used, units, taken = set(), [], []
    for q, p in pairs:
        if p['lines'][0] in used or p['lines'][1] in used:
            continue
        if any(min(p['x1'], t[1])-max(p['x0'], t[0]) > 0 and min(p['bottom'], t[3])-max(p['top'], t[2]) > 0 for t in taken):
            continue
        used.update(p['lines']); taken.append((p['x0'], p['x1'], p['top'], p['bottom']))
        wd = p['x1']-p['x0']; mid = (p['x0']+p['x1'])/2
        # Tall narrow bays are shafts whatever their shading; squat ones are windows or doors.
        kind = 'column' if (p['bottom']-p['top'])/wd > 4 or p['tone'] > 0 else 'opening'
        arched = any(abs(a['cx']-mid) < .25*wd and abs(a['r']-wd/2) < .35*wd and abs(a['cy']-p['top']) < .5*wd for a in arcs)
        y = p['top']-wd/2 if arched else p['top']
        units.append(dict(x=p['x0'], y=y, w=wd, h=p['bottom']-y, arched=arched, kind=kind, tone=p['tone'], lines=p['lines']))
    return stack_columns(units), used


def stack_columns(units):
    """A shaft interrupted by a band or capital is one column: join units stacked on one x-range."""
    units = sorted(units, key=lambda u: u['y'])
    out = []
    for u in units:
        for v in out:
            if 'column' not in (u['kind'], v['kind']):
                continue
            ox = min(u['x']+u['w'], v['x']+v['w'])-max(u['x'], v['x'])
            gap = u['y']-(v['y']+v['h'])
            if ox > .6*min(u['w'], v['w']) and gap < 2*max(u['w'], v['w']):
                bottom = max(v['y']+v['h'], u['y']+u['h'])
                x0 = (v['x']*v['h']+u['x']*u['h'])/(v['h']+u['h']); wd = (v['w']*v['h']+u['w']*u['h'])/(v['h']+u['h'])
                v.update(x=x0, w=wd, h=bottom-v['y'], kind='column', lines=tuple(v.get('lines', ()))+tuple(u.get('lines', ())))
                break
        else:
            out.append(dict(u))
    return out
