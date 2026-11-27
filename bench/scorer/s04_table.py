"""The figures derived from score04's readings, and the readable table (SCORES.md). Pure: nothing is read or written.

  share      the painting's single-image score over its original's, as a percentage; may pass 100
  combined   (WEIGHTS human-ness x human-ness % + WEIGHTS quality x share) / their sum
  adjusted   against the subject's Auto painting among the inputs: (x - Auto) / max(top - Auto, top / 5), the headroom
             rule of bench/scripts/levels.mjs, for human-ness (top 100), the quality score (top 10), combined (top 100)
             and the algorithmic mean (top 10). 0 is level with Auto; negative is below it.
  likeness   its own reading and column (the original and the painting together, 1 to 5); never part of combined
Anti-cheat, the algorithmic measurements and usage are shown beside, never blended in.
"""

WEIGHTS = {"humanness": 2, "quality": 1}
GATE_FLOOR = 65.0
COMBINED_MODES = ("weighted", "gated")
TELL = {"a": "speckle for lines", "b": "cut wash edges", "c": "flat slabs", "d": "feature before its form", "e": "whole sheet faint",
        "f": "a region arriving finished", "g": "a wipe", "h": "nothing changes", "i": "lines that do not describe", "j": "texture dumped late"}


def headroom_adjusted(x, auto, top):
    if x is None or auto is None:
        return None
    return (x - auto) / max(top - auto, top / 5)


def combined(h, q, w=WEIGHTS, mode="weighted", gate=GATE_FLOOR):
    if h is None or q is None:
        return None
    if mode == "gated":
        return q * min(1.0, max(0.0, h) / float(gate))
    return (w["humanness"] * h + w["quality"] * q) / (w["humanness"] + w["quality"])


def derive(paintings, originals, w=WEIGHTS, quality_mode="blind", combined_mode="weighted", gate=GATE_FLOOR):
    """Adds share, combined and the Auto adjustment to each painting (in place) and returns them."""
    for p in paintings:
        q = p["quality"]["score"]
        if quality_mode in ("anchored", "versus-auto"):
            p["share"] = 10.0 * q if q is not None else None
        else:
            o = (originals.get(p.get("original") or p["subject"]) or {}).get("quality", {}).get("score")
            p["share"] = 100 * q / o if q is not None and o else None
        p["combined"] = combined(p["human"]["percent"], p["share"], w, mode=combined_mode, gate=gate)
        p["deltaAuto"] = None
    for p in paintings:
        autos = [a for a in paintings if a["auto"] and a["subject"] == p["subject"]]
        if p.get("failed"):
            p["adjusted"] = {"auto": autos[0]["id"] if len(autos) == 1 else None, "note": "failed run"}
        elif p["auto"]:
            p["adjusted"] = {"auto": p["id"], "note": "Auto itself"}
        elif len(autos) == 1 and autos[0].get("failed"):
            p["adjusted"] = {"auto": autos[0]["id"], "note": "Auto's own run of this picture failed; nothing to adjust against"}
        elif len(autos) != 1:
            p["adjusted"] = {"auto": None, "note": f"{len(autos)} Auto paintings of {p['subject']} among the inputs; the adjustment needs exactly one"}
        else:
            a = autos[0]
            if p["combined"] is not None and a["combined"] is not None:
                p["deltaAuto"] = round(p["combined"] - a["combined"], 2)
            p["adjusted"] = {"auto": a["id"], "note": None,
                             "humanness": headroom_adjusted(p["human"]["percent"], a["human"]["percent"], 100),
                             "quality": headroom_adjusted(p["quality"]["score"], a["quality"]["score"], 10),
                             "combined": headroom_adjusted(p["combined"], a["combined"], 100),
                             "classic": headroom_adjusted((p.get("classic") or {}).get("mean"), (a.get("classic") or {}).get("mean"), 10)}
    return paintings


def likeness_text(k):
    if not k or k.get("score") is None:
        return "none"
    return f"{k['score']:.1f} of 5" + (" **FLAGGED: at the bottom of the scale, it may not be a painting of this picture**" if k.get("flagged") else "")


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
    # which earlier level a retry was handed (a run's named choice: "L4 after L2" has no level 3 between), said first
    bits = ([s["ladder"]] if s.get("ladder") else []) + [f"rendering units {lu.get('spent', '?')} of {lu.get('budget', '?')}", f"steps {st.get('taken', '?')} of {st.get('budget', '?')}",
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
    wash = (r.get("snapshotScheme") or {}).get("name") == "progress10"   # a results document from before the schemes is film13
    anchored = r.get("qualityMode") == "anchored"
    gated = r.get("combinedMode") == "gated"
    L = ["# 0.5.1 scores" if (anchored or gated) else "# 0.4 scores", "",
         f"Written {r['written']} by `npm run bench:score04`" + (f", repeat {r['repeat']} of the same paintings (a further scoring, no reading shared with another repeat)" if (r.get("repeat") or 1) > 1 else "") + f". **{r['series']}**", "",
         f"Judge label **{j['label']}**, panel **{j.get('panelName') or 'not named'}**, route `{j['route']}` ({j['endpoint']}), reasoning {j.get('reasoning') or 'not recorded'}; judges " + ", ".join(f"`{m}`" + (f" (served as `{(j.get('sentAs') or {}).get(m)}`)" if (j.get('sentAs') or {}).get(m, m) != m else "") for m in j["panel"]) +
         f"; {r['readings']} readings a judge, a judge's figure the median of its three, the panel's the mean of the judges'. "
         f"Rubric `{r['rubric']['path']}` sha256 `{r['rubric']['sha256'][:12]}`; prompts sequence `{r['prompts']['sequence'][:12]}`, single `{r['prompts']['single'][:12]}`" + (f", likeness `{r['prompts']['likeness'][:12]}`" if r['prompts'].get('likeness') else "") + ".", ""]
    if r.get("inProgress"):
        ip = r["inProgress"]
        L += [f"**Still scoring: {ip['paintingsScored']} of {ip['of']} paintings so far.** This page is rewritten as each painting completes.", ""]
    faults = r.get("faults") or []
    L += ["## Faults first", ""] + ([f"- {x}" for x in faults] or ["- None: every reading has all its judges."]) + [""]
    gone = [p for p in r["paintings"] if p.get("failed")]
    if gone:
        L += ["## Failed runs", "", f"{len(gone)} scheduled run{'s' if len(gone) != 1 else ''} left no painting to judge. Each is kept in the tables as FAILED and counts as the bottom of the scale in the summary; none is dropped.", ""]
        L += [f"- {p['label']}, {p['subject']}: {p['failed']}" for p in gone] + [""]
    gate_floor = r.get("gateFloor") or GATE_FLOOR
    q_hdr = "QUALITY (anchored craft, 10 × overall; 9.0 ref)" if anchored else "QUALITY (share of the original)"
    c_hdr = f"COMBINED (Q × min(1, H/{gate_floor:.0f}))" if gated else f"COMBINED ({w['humanness']} parts human-ness to {w['quality']} part quality)"
    for sid in sorted({p["subject"] for p in r["paintings"]}):
        rows = [p for p in r["paintings"] if p["subject"] == sid]
        os_ = {k: v for k, v in r["originals"].items() if (v.get("subject") or k) == sid}
        if anchored:
            said = "Reference standard anchored at 9.00/10 (assigned craft anchor, no measured spread); Q = 10 × overall (0–100)."
        else:
            said = "; ".join(f"{'the original' if k == sid else k} scores {_f((v.get('quality') or {}).get('score'))} of 10 read alone" for k, v in os_.items()) or "no original was read (no painting of it to judge)"
            said = said[0].upper() + said[1:] + "; each painting's quality share is its score over its own original's."
        L += [f"## {sid}", "", said, "",
              f"| Picture | HUMAN-NESS (mean of {r['snapshots']} {'stills in progress, from the first wash to just before the finish' if wash else 'film snapshots'}, % of 5) | {q_hdr} | {c_hdr} | LIKENESS (of 5; not in combined) | adjusted for Auto: human-ness | quality | combined |",
              "|---|---|---|---|---|---|---|---|"]
        for p in rows:
            a = p["adjusted"]
            if p.get("failed"):
                L.append(f"| {p['label']} | FAILED | FAILED | **FAILED** (counts as the bottom of the scale) | none | " + " | ".join(["failed run"] * 3) + " |")
                continue
            adj = ["Auto itself"] * 3 if p["auto"] else [a["note"]] * 3 if a.get("note") else [_sg(a["humanness"]), _sg(a["quality"]), _sg(a["combined"])]
            L.append(f"| {p['label']} | {_f(p['human']['percent'], 0, '%')} | {_f(p['share'], 0, '%')} ({_f(p['quality']['score'])} of 10) | **{_f(p['combined'], 0, '%')}** | {likeness_text(p.get('likeness'))} | " + " | ".join(adj) + " |")
        L += ["", "### Human-ness in detail", "", f"| Picture | {'the drawing frame, before the first wash (of 5; not in the mean) | ' if wash else ''}first third | middle | last third (of 5) | the finished sheet (of 5; not in the mean) | tells (each judge's first reading, every snapshot shown) | a person would paint it in this order | one judge's sentence |", "|---|---|---|---|---|---|---|---|" + ("---|" if wash else "")]
        for p in rows:
            if p.get("failed"):
                continue
            h = p["human"]
            th = h["thirds"] or [None] * 3
            yes = "none read" if not h["of"] else f"{'yes' if h['yes'] * 2 > h['of'] else 'no'} ({h['yes']} of {h['of']} readings)"
            told = f"{tally(h['tells'])} (of {h['tellsOf']})" if h.get("tellsOf") else "none"
            L.append(f"| {p['label']} | {((_f(h['drawing'], 1) if h.get('drawing') is not None else 'nothing drawn first' if not p.get('drawingFrame') else _f(None, 1)) + ' | ') if wash else ''}{_f(th[0], 1)} | {_f(th[1], 1)} | {_f(th[2], 1)} | {_f(h.get('finished'), 1)} | {told} | {yes} | {(h['why'] or '').replace('|', '/')} |")
        L += ["", "### Beside the score, never blended in", "", "| Picture | anti-cheat: cheat-risk | progression | algorithmic mean (value / edges / marks) | adjusted for Auto | usage |", "|---|---|---|---|---|---|"]
        for p in rows:
            c = p.get("classic") or {}
            mt = c.get("metrics") or {}
            adj = "failed run" if p.get("failed") else "Auto itself" if p["auto"] else p["adjusted"].get("note") or _sg(p["adjusted"]["classic"])
            L.append(f"| {p['label']} | {cheat_text(p.get('cheat'))} | {progression_text(p.get('cheat'))} | {_f(c.get('mean'))} ({_f(mt.get('value'))} / {_f(mt.get('edge'))} / {_f(mt.get('marks'))}) | {adj} | {usage_text(p.get('usage'))} |")
        L.append("")
    L += ["## What each column is", "",
          ("- HUMAN-NESS (scheme progress10): the judges see the opening (the untouched paper, not scored), the drawing frame (the last frame before the first wash; scored and shown in the detail table, not in the mean; absent when nothing was drawn first), then ten stills of the painting in progress from the first wash to just before the finish, then the finished sheet (scored and shown in the detail table, not in the mean), each scored 1 to 5 under the rubric. The figure is the mean of the ten as a percentage of 5. The judges are never shown the original here, on purpose. The ten are placed by progress, not by frame number: a frame's progress is the share of the finished picture that is on the sheet, measured from the frames themselves, and the ten are at equal steps of it from the first wash (each still is labelled with it); how densely the film was recorded, and strokes that leave no mark, do not move them. The first wash is read from the film's own record. Thirds: the mean of stills 1-3, 4-7, 8-10. NOT comparable with scores under film13 or the withdrawn wash10. Tells: "
           if wash else
           f"- HUMAN-NESS (scheme film13, the first one): {r['snapshots']} snapshots evenly through the painting's film and then the finished sheet, shown in order with only their percent complete, scored 1 to 5 under the rubric; the figure is the mean of the {r['snapshots']} film snapshots as a percentage of 5 (the finished sheet is shown but not counted). Thirds: the mean of snapshots 1-4, 5-8, 9-12. NOT comparable with scores under progress10. Tells: ")
          + "; ".join(f"({k}) {v}" for k, v in TELL.items()) + ".",
          ("- QUALITY (anchored 0.5.1): finished painting scored 0 to 10 on watercolour craft (wash_craft, value_light, colour_harmony, overall) against the subject's original anchored as the 9.0/10 assigned craft standard (not likeness); scaled Q = 10 × overall (0–100)."
           if anchored else
           "- QUALITY: the picture alone, scored as a watercolour 0 to 10, not told whether it is an original or a painting; the share is the painting's score over its original's, read the same way. May pass 100%. The judge of a painting's quality never sees its original."),
          "- LIKENESS: the original and the finished painting shown together: how well the painting is a painting of that picture (subject, composition, tones, colour; not a pixel-for-pixel copy), 1 to 5 with a reason. It has its own column and is NOT part of the combined figure. FLAGGED: at the bottom of the scale.",
          ("- LEVELS (Option A, 0.5.1): Auto is the code planner alone. Every level is one fresh, independent session (budget 3.0 look units, 60 min author clock, anti-cheat guard on, no judge feedback). L1 (fixed rounds): source picture alone, blank paper. L2 (fixed rounds): + three unnumbered colour studies only, blank paper (no prepared drawing, named forms, or traced shapes). L3 (fixed rounds): + opt-in prepared drawing (OFF/blank unless selected), named forms, traced shapes, and Auto's plan & painting. L4 (open session with tools): L3's inputs in an isolated sandboxed workspace with shell and painter tools."
           if (anchored or gated) else
           "- LEVELS: Auto is the code planner alone. Every level is one fresh, independent session (10 looks, budget 3.0, 60 min, anti-cheat guard on, no judge feedback). L1 (fixed rounds): picture, script format and painting tips. L2 (fixed rounds): + prepared drawing, colour studies, named forms and traced shapes; nothing of Auto. L3 (fixed rounds): + Auto's plan and finished painting. L4 (open session with tools): L3's inputs in a sandboxed workspace with shell and painter tools."),
          (f"- COMBINED (gated 0.5.1): Q × min(1, H / {gate_floor:.0f}) — quality is unpenalized once Human-ness H ≥ {gate_floor:.0f}%, and scaled linearly down when H < {gate_floor:.0f}%."
           if gated else
           f"- COMBINED: ({w['humanness']} x human-ness + {w['quality']} x quality share) / {w['humanness'] + w['quality']}; the weights are written into results.json."),
          "- ADJUSTED FOR AUTO: (painting - Auto) / max(top - Auto, top / 5), Auto being the subject's code-planner painting scored the same way; 0 is level with Auto.",
          "- ANTI-CHEAT and PROGRESSION: the painter's own cheat-risk record; ALGORITHMIC: `bench/scorer/classic.py` against the original, no judge; USAGE: the run's usage.json."]
    return "\n".join(L) + "\n"
