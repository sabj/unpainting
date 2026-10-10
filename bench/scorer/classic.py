"""Classic (non-vision) metrics for one painting against its target: value shapes, edges and mark statistics.
Copied from the judges that scored the published runs, without the landmark judge (no benchmark crop has
landmark annotations) and without the pairwise voting. score_painting.py turns these into 0-10 scores.
No metric uses pixel error."""
import numpy as np
from scipy import ndimage as ndi
from skimage.feature import canny
from skimage.measure import label


def value_judge(pair, levels=4, low_w=96, grid=4):
    def lowres(L):
        sig = max(1.0, pair.W / 120)
        L = ndi.gaussian_filter(L, sig)
        h, w = L.shape
        nh = max(8, int(round(low_w * h / w)))
        return ndi.zoom(L, (nh / h, low_w / w), order=1)

    t, p = lowres(pair.t_L), lowres(pair.p_L)
    nh = min(t.shape[0], p.shape[0]); nw = min(t.shape[1], p.shape[1])
    t, p = t[:nh, :nw], p[:nh, :nw]
    # affine tone match: painting 2..98 pct onto target 2..98 pct (inversion survives this)
    tl, th = np.percentile(t, [2, 98]); pl, ph = np.percentile(p, [2, 98])
    p_m = np.clip((p - pl) / max(ph - pl, 1e-6) * (th - tl) + tl, 0, 1)
    edges = np.quantile(t, np.linspace(0, 1, levels + 1)[1:-1])
    tq, pq = np.digitize(t, edges), np.digitize(p_m, edges)
    soft = 1 - np.abs(tq - pq) / (levels - 1)
    cells = []
    for gy in np.array_split(np.arange(nh), grid):
        for gx in np.array_split(np.arange(nw), grid):
            if len(gy) and len(gx):
                cells.append(float(soft[np.ix_(gy, gx)].mean()))
    # big shapes: components of the target level map covering >= 2% of the region
    ious = []
    for lv in range(levels):
        lab, n = ndi.label(tq == lv)
        for c in range(1, n + 1):
            m = lab == c
            if m.sum() >= 0.02 * m.size:
                pm = pq == lv
                ious.append(float((m & pm).sum() / max((m | pm).sum(), 1)))
    return {
        "soft_agreement": float(soft.mean()),
        "worst_cell_agreement": min(cells),
        "big_shape_iou": float(np.mean(ious)) if ious else float("nan"),
        "tone_range_ratio": float((ph - pl) / max(th - tl, 1e-6)),
        "cell_agreement": [round(c, 3) for c in cells],
    }



def _edges(L, sigma=1.5):
    return canny(L, sigma=sigma, low_threshold=0.015, high_threshold=0.05)


def _grad(L, s=1.0):
    return np.hypot(ndi.gaussian_filter(L, s, order=(1, 0)), ndi.gaussian_filter(L, s, order=(0, 1)))


def edge_judge(pair, plate_mm=200.0):
    """Chamfer both ways at a millimetre tolerance (the work grid spans plate_mm millimetres),
    plus hardness: painting gradient peak near each target edge over the target's gradient there."""
    px_mm = pair.W / plate_mm
    tol = max(1.5, 1.0 * px_mm)
    te, pe = _edges(pair.t_L), _edges(pair.p_L)
    if te.sum() < 20:
        return {"n_target_edges": int(te.sum()), "note": "target has almost no edges here"}
    dt_t = ndi.distance_transform_edt(~te)
    dt_p = ndi.distance_transform_edt(~pe) if pe.any() else np.full(te.shape, 99.0)
    cap = 4 * tol
    recall = float((dt_p[te] <= tol).mean())
    precision = float((dt_t[pe] <= tol).mean()) if pe.any() else 0.0
    gt, gp = _grad(pair.t_L), _grad(pair.p_L)
    win = int(2 * tol) | 1
    gp_peak = ndi.maximum_filter(gp, size=win)
    ratio = np.clip(gp_peak[te] / np.maximum(gt[te], 1e-4), 0, 1.0)  # harder than the target earns nothing
    # normalise by the same ratio for the target against itself (=1 by construction) so 1.0 = as hard as target
    return {
        "tol_px": round(tol, 2),
        "recall_at_tol": recall,
        "precision_at_tol": precision,
        "f_at_tol": float(2 * recall * precision / max(recall + precision, 1e-9)),
        "density_balance": float(-abs(np.log(max(pe.sum(), 1) / te.sum()))),
        "chamfer_t2p_mm": float(np.minimum(dt_p[te], cap).mean() / px_mm),
        "chamfer_p2t_mm": float(np.minimum(dt_t[pe], cap).mean() / px_mm) if pe.any() else cap / px_mm,
        "hardness_ratio_pcts": [round(float(v), 3) for v in np.percentile(ratio, [10, 25, 50, 75, 90])],
        "hardness_ratio_median": float(np.median(ratio)),
        "edge_density_ratio": float(pe.sum() / te.sum()),
    }



HARD_BINS = [0, 0.02, 0.04, 0.07, 0.10, 0.15, 10]


def _region_stats(L, paper_L):
    e = _edges(L)
    g = _grad(L)
    hist = np.histogram(g[e], bins=HARD_BINS)[0].astype(float) if e.any() else np.zeros(len(HARD_BINS) - 1)
    hist = hist / max(hist.sum(), 1)
    paper = float((L >= paper_L - 0.03).mean())
    gy = ndi.gaussian_filter(L, 1.0, order=(1, 0)); gx = ndi.gaussian_filter(L, 1.0, order=(0, 1))
    jxx, jyy, jxy = [ndi.uniform_filter(v, 16) for v in (gx * gx, gy * gy, gx * gy)]
    tr = jxx + jyy
    lam = np.sqrt(np.maximum((jxx - jyy) ** 2 + 4 * jxy ** 2, 0))
    coh = lam / np.maximum(tr, 1e-9)
    strong = tr > np.median(tr)
    coherence = float(np.average(coh[strong], weights=tr[strong])) if strong.any() else 0.0
    dev = np.abs(L - ndi.median_filter(L, 7)) > 0.08
    lab, n = ndi.label(dev)
    sizes = ndi.sum(dev, lab, range(1, n + 1)) if n else np.array([])
    speckle = float(((sizes <= 20)).sum() / max(L.size, 1) * 1e5)
    return {"hardness_hist": [round(float(v), 3) for v in hist], "paper_share": paper,
            "direction_coherence": coherence, "speckle_per_100k_px": speckle}


def marks_judge(pair):
    """Mark statistics on painting and target over the same region; the judge compares distances."""
    pt = float(np.percentile(pair.t_L_full, 97)); pp = float(np.percentile(pair.p_L_full, 97))
    return {"painting": _region_stats(pair.p_L, pp), "target": _region_stats(pair.t_L, pt)}


def marks_distances(m):
    p, t = m["painting"], m["target"]
    return {
        "hardness_hist_l1": float(np.abs(np.array(p["hardness_hist"]) - np.array(t["hardness_hist"])).sum()),
        "paper_share_gap": abs(p["paper_share"] - t["paper_share"]),
        "coherence_gap": abs(p["direction_coherence"] - t["direction_coherence"]),
        "speckle_excess": max(0.0, p["speckle_per_100k_px"] - t["speckle_per_100k_px"]),
    }

