#!/usr/bin/env python3
"""One painting against the Auto painting of the same subject: a win rate with an interval.

  python3 versus.py --auto AUTO.png --image P.png --style "watercolour over pencil" --plate-mm 280
                    [--repeats 2] [--seed 1] [--out result.json]

The comparison is pairs.py's: both sheets cut into the same full-size tiles, each judge shown each tile in both
orders, blind, asked which looks more like a hand-painted watercolour. Auto is painting A, the painting scored is B.

winRate   the share of tiles the painting takes from Auto, a tie counting half: 0.5 is "as good as Auto", under it
          is worse. With --repeats the whole comparison is run again with the calls in another order, and winRate is
          the mean of the runs.
interval  a 95% Wilson interval on winRate over the tiles of ONE run: repeats measure the judges' own noise, they
          do not add tiles. Tiles of one sheet overlap a little and share its faults, so the interval is somewhat
          narrower than it should be. "decided" is true when it excludes 0.5.
repeatability   how often two runs gave a tile to the same painting, and how far their win rates are apart.
judgeAgreement  for every two judges, the share of tiles on which both voted and voted alike; and the share of
          tiles on which every judge that voted agreed.

softWinRate    (local route only) the graded form of the same thing: the chance a judge picks the painting, with its
          habit of picking a position taken out, averaged over tiles and judges. It keeps moving when every tile
          goes one way, which the win rate cannot.

  python3 versus.py --target TARGET.png --image P.png --style ... --plate-mm 280 [--repeats 1]

Against the target the opponent is the picture the painting was made from, and two questions are asked apart, in
separate calls: "subject" (which shows the subject better) and "craft" (which is the better piece of watercolour
painting). The judges are not told that either image is the target. 0.5 would mean the painting cannot be told from
the real thing; Auto's own number on the same target is the bar a model painting is read against (gap_closed()).
The target is brought to the painting's pixel size if it differs, so tiles line up; the painting is never resized.

Without --target, like pairs.py this never reads the target, so it is a test of look and not a copy check: read it beside the plate's
cheat-risk record and the progression check (bench/scripts/pair-judge.mjs versus-auto prints all three).
"""
import argparse, json, math, os, sys
from itertools import combinations
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pairs as pr  # noqa: E402

VERSION = "versus-v1"
Z95 = 1.959964  # two-sided 95% normal quantile


def wilson(p, n, z=Z95):
    """Wilson score interval for a share p seen over n units. p need not be a whole count over n (ties count half)."""
    if n <= 0:
        return [0.0, 1.0]
    d = 1 + z * z / n
    mid = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [max(0.0, mid - half), min(1.0, mid + half)]


def win_rate(wins, losses, ties):
    """The painting's share of the tiles against Auto, ties counting half, with its interval."""
    n = wins + losses + ties
    if n == 0:
        return {"winRate": None, "interval": None, "tiles": 0, "wins": 0, "losses": 0, "ties": 0, "decided": False}
    p = (wins + 0.5 * ties) / n
    lo, hi = wilson(p, n)
    return {"winRate": round(p, 3), "interval": [round(lo, 3), round(hi, 3)], "tiles": n, "wins": wins, "losses": losses,
            "ties": ties, "decided": hi < 0.5 or lo > 0.5}


def judge_agreement(result):
    """Agreement between judges on the tiles of one run. Votes are 'a' or 'b'; a judge with no vote on a tile is left
    out of that tile."""
    judges = list(result.get("per_judge", {}))
    rows = [t["votes"] for t in result.get("tiles", []) if not t.get("identical")]
    pairs = {}
    for x, y in combinations(judges, 2):
        both = [(v[x], v[y]) for v in rows if v.get(x) in ("a", "b") and v.get(y) in ("a", "b")]
        pairs[f"{x} | {y}"] = {"tiles": len(both), "agree": round(sum(a == b for a, b in both) / len(both), 3) if both else None}
    voted = [[c for c in v.values() if c in ("a", "b")] for v in rows]
    voted = [v for v in voted if len(v) >= 2]
    shares = [p["agree"] for p in pairs.values() if p["agree"] is not None]
    return {"pairs": pairs, "mean": round(sum(shares) / len(shares), 3) if shares else None,
            "unanimous": round(sum(len(set(v)) == 1 for v in voted) / len(voted), 3) if voted else None}


def repeatability(runs):
    """Between the first run and each later one: the share of tiles given to the same painting (or tied both times),
    and the largest gap between two runs' win rates."""
    if len(runs) < 2:
        return {"measured": False, "tileAgreement": None, "winRateRange": None}
    first = [t["prefers"] for t in runs[0]["tiles"]]
    same = []
    for r in runs[1:]:
        other = [t["prefers"] for t in r["tiles"]]
        same.append(sum(a == b for a, b in zip(first, other)) / len(first) if first else 1.0)
    rates = [win_rate(r["tilesB"], r["tilesA"], r["ties"])["winRate"] for r in runs]
    return {"measured": True, "tileAgreement": round(sum(same) / len(same), 3), "winRateRange": round(max(rates) - min(rates), 3)}


def summarise(runs, opponent="Auto"):
    """The record for one painting from its complete runs against Auto (pairs.compare results, Auto as A)."""
    if not runs or any(not r.get("complete") for r in runs):
        return {"version": VERSION, "complete": False, "winRate": None, "interval": None}
    per = [win_rate(r["tilesB"], r["tilesA"], r["ties"]) for r in runs]
    n = per[0]["tiles"]
    p = sum(x["winRate"] for x in per) / len(per) if n else None
    lo, hi = wilson(p, n) if n else (None, None)
    soft = [r["softB"] for r in runs if r.get("softB") is not None]
    route = {k: runs[0][k] for k in ("judgeVersion", "judgeRoute", "judgeEndpoint", "judgeModels", "judgeOptions", "provider", "judges") if k in runs[0]}
    return {"version": VERSION, "complete": True, **route,
            "winRate": None if p is None else round(p, 3), "interval": None if p is None else [round(lo, 3), round(hi, 3)],
            "softWinRate": round(sum(soft) / len(soft), 3) if len(soft) == len(runs) else None,
            "tiles": n, "decided": bool(n) and (hi < 0.5 or lo > 0.5),
            "reading": "no tiles" if not n else f"loses to {opponent}" if hi < 0.5 else f"beats {opponent}" if lo > 0.5 else f"not told apart from {opponent}",
            "repeats": [{"seed": r.get("seed"), **x} for r, x in zip(runs, per)],
            "repeatability": repeatability(runs),
            "judgeAgreement": [judge_agreement(r) for r in runs]}


def gap_closed(painting, auto):
    """How much of Auto's gap to the target a painting closed, from the two rates against the same target: 0 is no
    better than Auto, 1 is level with the target, negative is further away than Auto. None when Auto is already level
    with the target (no gap to close) or a rate is missing."""
    if painting is None or auto is None or auto >= 0.5:
        return None
    return round((painting - auto) / (0.5 - auto), 3)


def versus_target(target, image, style, plate_mm, repeats=1, seed=1, post=None):
    """The painting against its target, on each question apart. The target is A, the painting B."""
    if repeats < 1:
        raise ValueError("repeats must be 1 or more")
    p = pr.load_rgb(image)
    t = pr.load_rgb(target)
    resized = t.size != p.size
    if resized:
        if abs(t.width / t.height - p.width / p.height) > 0.01:
            raise ValueError(f"target and painting differ in shape: {t.size} and {p.size}")
        t = t.resize(p.size, pr.Image.LANCZOS)
    out = {"version": VERSION, "mode": "target", "target": str(target), "image": str(image), "style": style, "plateMm": plate_mm,
           "targetResized": resized, "questions": {}}
    for q in pr.QUESTIONS:
        runs = [pr.compare(t, p, style, plate_mm, 2, seed + k, post=post, question=q) for k in range(repeats)]
        out["questions"][q] = {**summarise(runs, "the target"), "runs": runs}
    out["complete"] = all(x["complete"] for x in out["questions"].values())
    return out


def versus(auto, image, style, plate_mm, repeats=2, seed=1, post=None):
    if repeats < 1:
        raise ValueError("repeats must be 1 or more")
    runs = [pr.compare(auto, image, style, plate_mm, 2, seed + k, post=post) for k in range(repeats)]
    return {**summarise(runs), "auto": str(auto), "image": str(image), "style": style, "plateMm": plate_mm, "runs": runs}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--auto", help="the Auto painting of the subject")
    ap.add_argument("--target", help="score against the target picture instead, on subject and craft apart")
    ap.add_argument("--image", required=True, help="the painting to score")
    ap.add_argument("--style", default="watercolor and ink")
    ap.add_argument("--plate-mm", type=float, required=True, help="width of the sheet in millimetres")
    ap.add_argument("--repeats", type=int, help="whole comparisons to run (default 2 against Auto, 1 against the target; 1 leaves repeatability unmeasured)")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out")
    a = ap.parse_args()
    if bool(a.auto) == bool(a.target):
        ap.error("give --auto or --target, one of them")
    import score_painting as sp
    if sp.KEY and not os.environ.get(sp.KEY):
        sys.exit(f"{sp.KEY} is not set (JUDGE_ROUTE={sp.PROVIDER})")
    try:
        r = versus_target(a.target, a.image, a.style, a.plate_mm, a.repeats or 1, a.seed) if a.target else \
            versus(a.auto, a.image, a.style, a.plate_mm, a.repeats or 2, a.seed)
    except (ValueError, RuntimeError) as e:
        sys.exit(str(e))
    s = json.dumps(r, indent=1)
    if a.out:
        Path(a.out).write_text(s)
    brief = lambda d: {k: v for k, v in d.items() if k != "runs"}
    print(json.dumps({**brief(r), **({"questions": {q: brief(x) for q, x in r["questions"].items()}} if a.target else {})}, indent=1))
    if not r["complete"]:
        print("incomplete: a judge answered too few tiles in both orders", file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()
