"""The figures derived from score04's readings, and the readable table (SCORES.md). Pure: nothing is read or written.

  share      the painting's single-image score over its original's, as a percentage; may pass 100
  combined   (WEIGHTS human-ness x human-ness % + WEIGHTS quality x share) / their sum
  adjusted   against the subject's Auto painting among the inputs: (x - Auto) / max(top - Auto, top / 5), the headroom
             rule of bench/scripts/levels.mjs, for human-ness (top 100), the quality score (top 10), combined (top 100)
             and the algorithmic mean (top 10). 0 is level with Auto; negative is below it.
Anti-cheat, the algorithmic measurements and usage are shown beside, never blended in.
"""

WEIGHTS = {"humanness": 2, "quality": 1}
TELL = {"a": "speckle for lines", "b": "cut wash edges", "c": "flat slabs", "d": "feature before its form", "e": "whole sheet faint",
        "f": "a region arriving finished", "g": "a wipe", "h": "nothing changes", "i": "lines that do not describe", "j": "texture dumped late"}


def headroom_adjusted(x, auto, top):
    if x is None or auto is None:
        return None
    return (x - auto) / max(top - auto, top / 5)


def combined(h, q, w=WEIGHTS):
    if h is None or q is None:
        return None
    return (w["humanness"] * h + w["quality"] * q) / (w["humanness"] + w["quality"])


def derive(paintings, originals, w=WEIGHTS):
    """Adds share, combined and the Auto adjustment to each painting (in place) and returns them."""
    for p in paintings:
        o = (originals.get(p["subject"]) or {}).get("quality", {}).get("score")
        q = p["quality"]["score"]
        p["share"] = 100 * q / o if q is not None and o else None
        p["combined"] = combined(p["human"]["percent"], p["share"], w)
    for p in paintings:
        autos = [a for a in paintings if a["auto"] and a["subject"] == p["subject"]]
        if p["auto"]:
            p["adjusted"] = {"auto": p["id"], "note": "Auto itself"}
        elif len(autos) != 1:
            p["adjusted"] = {"auto": None, "note": f"{len(autos)} Auto paintings of {p['subject']} among the inputs; the adjustment needs exactly one"}
        else:
            a = autos[0]
            p["adjusted"] = {"auto": a["id"], "note": None,
                             "humanness": headroom_adjusted(p["human"]["percent"], a["human"]["percent"], 100),
                             "quality": headroom_adjusted(p["quality"]["score"], a["quality"]["score"], 10),
                             "combined": headroom_adjusted(p["combined"], a["combined"], 100),
                             "classic": headroom_adjusted((p.get("classic") or {}).get("mean"), (a.get("classic") or {}).get("mean"), 10)}
    return paintings


def cheat_text(c):
    if not c:
        return "none: no cheat-risk record beside this painting (this level writes none)"
    s = f"{c['risk']:.2f} {c['level']}" + (", REVIEW" if c.get("review") else "")
    if c.get("hfCorr") is not None:
        s += f"; fine-detail copy {c['hfCorr']:.3f} of {c['hfCeiling']} allowed" + (" OVER" if c["hfCorr"] > c["hfCeiling"] else "")
    if c.get("strokes") is not None:
        s += f"; strokes {c['strokes']} of {c.get('strokeCeiling')}"
    return s


def progression_text(c):
    if not c:
        return "none written"
    parts = c.get("parts") or {}
    stages = ", ".join(f"{k}% at {v.get('at')}" for k, v in (c.get("prog") or {}).items())
    return f"progression part {parts.get('progression')}" + (f" (stages: {stages})" if stages else "")


def usage_text(u):
    if not u:
        return "none: no usage.json in this run"
    s, m = u.get("session") or {}, u.get("model") or {}
    lu, st = s.get("lookUnits") or {}, s.get("steps") or {}
    tu = u.get("toolUse") or {}
    bits = [f"rendering units {lu.get('spent', '?')} of {lu.get('budget', '?')}", f"steps {st.get('taken', '?')} of {st.get('budget', '?')}",
            f"tool calls {s.get('toolCalls') if s.get('toolCalls') is not None else '?'}",
            f"tokens {m.get('tokens') if m.get('tokens') is not None else 'not reported'}",
            "cost " + (f"${float(m['costUSD']):.2f}" if m.get("costUSD") is not None else "not reported"),
            f"{s.get('wallMinutes', '?')} wall min"]
    if tu:
        bits.append("tool use " + ", ".join(f"{k} {v}" for k, v in tu.items() if isinstance(v, (int, float))))
    if (u.get("budget") or {}).get("reached"):
        bits.append("REACHED THE BUDGET")
    return "; ".join(bits)


def _f(x, d=2, unit=""):
    return "none" if x is None else f"{x:.{d}f}{unit}"


def _sg(x):
    return "none" if x is None else f"{x:+.2f}"


def tally(t):
    return ", ".join(f"({k}) {t[k]}" for k in sorted(t, key=lambda k: (-t[k], k))) or "none named"


def markdown(r):
    """SCORES.md from a results document (score04.py's results.json)."""
    j, w = r["judge"], r["weights"]
    wash = (r.get("snapshotScheme") or {}).get("name") == "wash10"   # a results document from before the schemes is film13
    L = ["# 0.4 scores", "",
         f"Written {r['written']} by `npm run bench:score04`" + (f", repeat {r['repeat']} of the same paintings (a further scoring, no reading shared with another repeat)" if (r.get("repeat") or 1) > 1 else "") + f". **{r['series']}**", "",
         f"Judge label **{j['label']}**, panel **{j.get('panelName') or 'not named'}**, route `{j['route']}` ({j['endpoint']}), reasoning {j.get('reasoning') or 'not recorded'}; judges " + ", ".join(f"`{m}`" + (f" (served as `{(j.get('sentAs') or {}).get(m)}`)" if (j.get('sentAs') or {}).get(m, m) != m else "") for m in j["panel"]) +
         f"; {r['readings']} readings a judge, a judge's figure the median of its three, the panel's the mean of the judges'. "
         f"Rubric `{r['rubric']['path']}` sha256 `{r['rubric']['sha256'][:12]}`; prompts sequence `{r['prompts']['sequence'][:12]}`, single `{r['prompts']['single'][:12]}`.", ""]
    faults = r.get("faults") or []
    L += ["## Faults first", ""] + ([f"- {x}" for x in faults] or ["- None: every reading has all its judges."]) + [""]
    for sid in sorted({p["subject"] for p in r["paintings"]}):
        rows = [p for p in r["paintings"] if p["subject"] == sid]
        o = (r["originals"].get(sid) or {}).get("quality") or {}
        L += [f"## {sid}", "", f"The original scores {_f(o.get('score'))} of 10 read alone; each painting's quality share is its score over that.", "",
              f"| Picture | HUMAN-NESS (mean of {r['snapshots']} {'frames from the first wash to the finished sheet' if wash else 'film snapshots'}, % of 5) | QUALITY AND LIKENESS (share of the original) | COMBINED ({w['humanness']} parts human-ness to {w['quality']} part quality) | adjusted for Auto: human-ness | quality | combined |",
              "|---|---|---|---|---|---|---|"]
        for p in rows:
            a = p["adjusted"]
            adj = ["Auto itself"] * 3 if p["auto"] else [a["note"]] * 3 if a.get("note") else [_sg(a["humanness"]), _sg(a["quality"]), _sg(a["combined"])]
            L.append(f"| {p['label']} | {_f(p['human']['percent'], 0, '%')} | {_f(p['share'], 0, '%')} ({_f(p['quality']['score'])} of 10) | **{_f(p['combined'], 0, '%')}** | " + " | ".join(adj) + " |")
        L += ["", "### Human-ness in detail", "", f"| Picture | {'the drawing frame, before the first wash (of 5; not in the mean) | ' if wash else ''}first third | middle | last third (of 5) | tells (each judge's first reading, every snapshot shown) | a person would paint it in this order | one judge's sentence |", "|---|---|---|---|---|---|---|" + ("---|" if wash else "")]
        for p in rows:
            h = p["human"]
            th = h["thirds"] or [None] * 3
            yes = "none read" if not h["of"] else f"{'yes' if h['yes'] * 2 > h['of'] else 'no'} ({h['yes']} of {h['of']} readings)"
            told = f"{tally(h['tells'])} (of {h['tellsOf']})" if h.get("tellsOf") else "none"
            L.append(f"| {p['label']} | {((_f(h['drawing'], 1) if h.get('drawing') is not None else 'nothing drawn first' if not p.get('drawingFrame') else _f(None, 1)) + ' | ') if wash else ''}{_f(th[0], 1)} | {_f(th[1], 1)} | {_f(th[2], 1)} | {told} | {yes} | {(h['why'] or '').replace('|', '/')} |")
        L += ["", "### Beside the score, never blended in", "", "| Picture | anti-cheat: cheat-risk | progression | algorithmic mean (value / edges / marks) | adjusted for Auto | usage |", "|---|---|---|---|---|---|"]
        for p in rows:
            c = p.get("classic") or {}
            mt = c.get("metrics") or {}
            adj = "Auto itself" if p["auto"] else p["adjusted"].get("note") or _sg(p["adjusted"]["classic"])
            L.append(f"| {p['label']} | {cheat_text(p.get('cheat'))} | {progression_text(p.get('cheat'))} | {_f(c.get('mean'))} ({_f(mt.get('value'))} / {_f(mt.get('edge'))} / {_f(mt.get('marks'))}) | {adj} | {usage_text(p.get('usage'))} |")
        L.append("")
    L += ["## What each column is", "",
          ("- HUMAN-NESS (scheme wash10): the judges see the opening (the untouched paper, not scored), the drawing frame (the last frame before the first wash; scored and shown in the detail table, not in the mean; absent when nothing was drawn first), then ten frames evenly spaced from the first wash to the finished sheet, the tenth being the finished sheet, each with only its percent complete, scored 1 to 5 under the rubric. The figure is the mean of the ten as a percentage of 5. The first wash is read from the film's own record. Thirds: the mean of frames 1-3, 4-7, 8-10. NOT comparable with scores under the earlier scheme (film13). Tells: "
           if wash else
           f"- HUMAN-NESS (scheme film13, the earlier one): {r['snapshots']} snapshots evenly through the painting's film and then the finished sheet, shown in order with only their percent complete, scored 1 to 5 under the rubric; the figure is the mean of the {r['snapshots']} film snapshots as a percentage of 5 (the finished sheet is shown but not counted). Thirds: the mean of snapshots 1-4, 5-8, 9-12. NOT comparable with scores under wash10. Tells: ")
          + "; ".join(f"({k}) {v}" for k, v in TELL.items()) + ".",
          "- QUALITY AND LIKENESS: the picture alone, scored as a watercolour 0 to 10, not told whether it is an original or a painting; the share is the painting's score over its original's, read the same way. May pass 100%.",
          f"- COMBINED: ({w['humanness']} x human-ness + {w['quality']} x quality share) / {w['humanness'] + w['quality']}; the weights are written into results.json.",
          "- ADJUSTED FOR AUTO: (painting - Auto) / max(top - Auto, top / 5), Auto being the subject's code-planner painting scored the same way; 0 is level with Auto.",
          "- ANTI-CHEAT and PROGRESSION: the painter's own cheat-risk record; ALGORITHMIC: `bench/scorer/classic.py` against the original, no judge; USAGE: the run's usage.json."]
    return "\n".join(L) + "\n"
