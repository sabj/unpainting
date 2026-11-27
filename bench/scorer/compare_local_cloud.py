#!/usr/bin/env python3
"""Compare local vs. cloud judge results.json files on matched paintings (Core 5 calibration audit)."""
import argparse, json, math, statistics, sys
from pathlib import Path


def pearson(xs, ys):
    if len(xs) < 2:
        return None
    mx, my = statistics.mean(xs), statistics.mean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    return (num / (dx * dy)) if dx > 0 and dy > 0 else None


def _ranks(vals):
    idx = sorted(range(len(vals)), key=lambda i: vals[i])
    r = [0.0] * len(vals)
    i = 0
    while i < len(vals):
        j = i
        while j + 1 < len(vals) and vals[idx[j + 1]] == vals[idx[i]]:
            j += 1
        avg = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            r[idx[k]] = avg
        i = j + 1
    return r


def spearman(xs, ys):
    if len(xs) < 2:
        return None
    return pearson(_ranks(xs), _ranks(ys))


def metric_stats(pairs):
    if not pairs:
        return {"n": 0}
    loc = [a for a, _ in pairs]
    cld = [b for _, b in pairs]
    diffs = [a - b for a, b in pairs]
    return {
        "n": len(pairs),
        "localMean": round(statistics.mean(loc), 3),
        "cloudMean": round(statistics.mean(cld), 3),
        "biasLocalMinusCloud": round(statistics.mean(diffs), 3),
        "mae": round(statistics.mean(abs(d) for d in diffs), 3),
        "rmse": round(math.sqrt(statistics.mean(d * d for d in diffs)), 3),
        "maxAbsDiff": round(max(abs(d) for d in diffs), 3),
        "pearsonR": round(pearson(loc, cld), 4) if pearson(loc, cld) is not None else None,
        "spearmanRho": round(spearman(loc, cld), 4) if spearman(loc, cld) is not None else None,
    }


def compare_results(local_doc, cloud_doc):
    loc_map = {p["id"]: p for p in local_doc.get("paintings", []) if not p.get("failed")}
    cld_map = {p["id"]: p for p in cloud_doc.get("paintings", []) if not p.get("failed")}
    shared = sorted(set(loc_map) & set(cld_map))

    metrics = {"combined": [], "quality": [], "humanness": [], "likeness": []}
    by_author = {}
    per_judge = {}

    for pid in shared:
        lp, cp = loc_map[pid], cld_map[pid]
        if lp.get("combined") is not None and cp.get("combined") is not None:
            metrics["combined"].append((float(lp["combined"]), float(cp["combined"])))
            auth = "auto" if lp.get("auto") else (lp.get("author") or "unknown")
            by_author.setdefault(auth, []).append((float(lp["combined"]), float(cp["combined"])))
        if lp.get("share") is not None and cp.get("share") is not None:
            metrics["quality"].append((float(lp["share"]), float(cp["share"])))
        lh = (lp.get("human") or {}).get("percent")
        ch = (cp.get("human") or {}).get("percent")
        if lh is not None and ch is not None:
            metrics["humanness"].append((float(lh), float(ch)))
        ll = (lp.get("likeness") or {}).get("score")
        cl = (cp.get("likeness") or {}).get("score")
        if ll is not None and cl is not None:
            metrics["likeness"].append((float(ll), float(cl)))

        # Shared judge names (e.g. google/gemma-4-31b-it local 8-bit vs OpenRouter cloud)
        for field, subkey in (("quality", "quality"), ("human", "human"), ("likeness", "likeness")):
            lj = (lp.get(subkey) or {}).get("judges") or {}
            cj = (cp.get(subkey) or {}).get("judges") or {}
            for j in sorted(set(lj) & set(cj)):
                if lj[j] is not None and cj[j] is not None:
                    per_judge.setdefault(f"{j} ({field})", []).append((float(lj[j]), float(cj[j])))

    # Model-level leaderboard rank correlation
    model_means = []
    for auth, pairs in sorted(by_author.items()):
        model_means.append({
            "author": auth, "n": len(pairs),
            "localMean": round(statistics.mean(a for a, _ in pairs), 2),
            "cloudMean": round(statistics.mean(b for _, b in pairs), 2),
            "diff": round(statistics.mean(a - b for a, b in pairs), 2),
        })
    rank_rho = spearman([m["localMean"] for m in model_means], [m["cloudMean"] for m in model_means]) if len(model_means) >= 2 else None

    return {
        "sharedPaintings": len(shared),
        "localJudge": local_doc.get("judge"),
        "cloudJudge": cloud_doc.get("judge"),
        "metrics": {k: metric_stats(v) for k, v in metrics.items()},
        "perJudgeOverlap": {k: metric_stats(v) for k, v in sorted(per_judge.items())},
        "modelLeaderboard": sorted(model_means, key=lambda x: -x["cloudMean"]),
        "leaderboardSpearmanRho": round(rank_rho, 4) if rank_rho is not None else None,
    }


def to_markdown(rep):
    lines = [
        "# Local vs. Cloud Judge Comparison",
        "",
        f"- **Matched paintings:** `{rep['sharedPaintings']}`",
        f"- **Local panel:** `{(rep.get('localJudge') or {}).get('label')}` (`{', '.join((rep.get('localJudge') or {}).get('panel') or [])}`)",
        f"- **Cloud panel:** `{(rep.get('cloudJudge') or {}).get('label')}` (`{', '.join((rep.get('cloudJudge') or {}).get('panel') or [])}`)",
        f"- **Model leaderboard Spearman ρ:** `{rep['leaderboardSpearmanRho']}`",
        "",
        "## Per-Painting Agreement",
        "| Metric | n | Local Mean | Cloud Mean | Bias (L−C) | MAE | Pearson r | Spearman ρ |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for k, s in rep["metrics"].items():
        if not s.get("n"):
            continue
        lines.append(f"| {k} | {s['n']} | {s['localMean']:.2f} | {s['cloudMean']:.2f} | {s['biasLocalMinusCloud']:+.2f} | {s['mae']:.2f} | {s['pearsonR']} | {s['spearmanRho']} |")
    if rep["perJudgeOverlap"]:
        lines += ["", "## Same-Judge Local vs. Cloud Overlap",
                  "| Judge (Axis) | n | Local | Cloud | Bias (L−C) | MAE | Pearson r |",
                  "|---|---:|---:|---:|---:|---:|---:|"]
        for k, s in rep["perJudgeOverlap"].items():
            lines.append(f"| {k} | {s['n']} | {s['localMean']:.2f} | {s['cloudMean']:.2f} | {s['biasLocalMinusCloud']:+.2f} | {s['mae']:.2f} | {s['pearsonR']} |")
    if rep["modelLeaderboard"]:
        lines += ["", "## Model-Level Leaderboard Comparison",
                  "| Model | n | Local C | Cloud C | Diff (L−C) |",
                  "|---|---:|---:|---:|---:|"]
        for m in rep["modelLeaderboard"]:
            lines.append(f"| {m['author']} | {m['n']} | {m['localMean']:.2f} | {m['cloudMean']:.2f} | {m['diff']:+.2f} |")
    return "\n".join(lines) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description="Compare local vs. cloud score04 results.json files.")
    ap.add_argument("local_results")
    ap.add_argument("cloud_results")
    ap.add_argument("--out-md", default=None)
    ap.add_argument("--out-json", default=None)
    a = ap.parse_args(argv)
    rep = compare_results(json.loads(Path(a.local_results).read_text()), json.loads(Path(a.cloud_results).read_text()))
    md = to_markdown(rep)
    if a.out_md:
        Path(a.out_md).write_text(md)
    if a.out_json:
        Path(a.out_json).write_text(json.dumps(rep, indent=2) + "\n")
    print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())
