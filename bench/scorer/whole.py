#!/usr/bin/env python3
"""Whole-sheet comparison of one painting with the Auto painting of its subject, with the source picture shown.

  JUDGE_ROUTE=local python3 whole.py --source S.png --auto AUTO.png --image P.png [--out result.json]

A 64 mm tile has no subject in it: "too pale", "the black dog is grey" and "the face is lost" are faults of the whole
picture. Here each judge sees three images, the source and the two whole sheets (shrunk to fit, never enlarged), and
answers two questions in separate calls:

  faithful  which is the more faithful painting of the source (values, colour, drawing)
  skill     which looks more like a skilled hand-painted watercolour (asked not to go by closeness to the source)

Each question is asked in both orders. A judge's answer is read as log-odds from the server's token probabilities,
and half the difference between the two orders is its preference with its habit of picking a position taken out
(pairs.py's margin vote). Per question the result gives each judge's preference and vote, the votes for Auto and for
the painting, and `painting`: the chance a judge picks the painting, averaged over judges (0.5 level with Auto).
The two questions are never combined. Needs the local route (J3): the remote routes give no token probabilities.

This reads the source, so unlike pairs.py it can see a copy as "faithful": read it beside the cheat-risk record.
"""
import argparse, json, math, os, sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load_rgb  # noqa: E402
import pairs as pr  # noqa: E402

VERSION = "whole-v1"
SHEET_SIDE, SOURCE_SIDE = 896, 640   # longest side sent, in pixels; three images fit the local context window
TOP_LOGPROBS = 5
_HEAD = """Image 1 is the source picture. Image 2 and Image 3 are two paintings made from it, in this style: {style}. You do not know who or what made either one.
"""
_TAIL = """
You must choose one. Reply with JSON only, no prose: {{"choice":2}} or {{"choice":3}}"""
QUESTIONS = {
    "faithful": _HEAD + "Which painting is the more faithful painting of the source? Weigh the values (lights and darks where the source has them, and as light or dark as the source), the colour (each thing the colour it is in the source), and the drawing (shapes and features in place and readable). A painting much paler, darker or a different colour than the source is less faithful." + _TAIL,
    "skill": _HEAD + "Which painting looks more like a skilled hand-painted watercolour? Weigh the edges (hard, soft and lost, against cut-out rims and notches), the washes (graded and transparent, against flat poster fills and blotches), the brush marks, and artefacts (white flecks, saw-tooth edges, a digital look). Do not choose by which one is closer to the source." + _TAIL,
}


def summarise(prefs):
    """prefs: {judge: preference for Auto in log-odds, or None when the judge could not be read in both orders}."""
    read = {j: p for j, p in prefs.items() if p is not None}
    complete = bool(prefs) and len(read) == len(prefs)
    soft = [1 / (1 + math.exp(max(-50.0, min(50.0, p)))) for p in read.values()]
    return {"complete": complete, "prefAuto": {j: (None if p is None else round(p, 3)) for j, p in prefs.items()},
            "votes": {j: ("auto" if p > 0 else "painting" if p < 0 else "tie") for j, p in read.items()},
            "forAuto": sum(p > 0 for p in read.values()), "forPainting": sum(p < 0 for p in read.values()),
            "ties": sum(p == 0 for p in read.values()),
            "painting": round(sum(soft) / len(soft), 3) if complete else None}


def compare(source, auto, image, style, post=None):
    """Both questions, both orders, every judge of the local panel, one model at a time."""
    import score_painting as sp
    if sp.PROVIDER != "local":
        raise ValueError("whole.py needs JUDGE_ROUTE=local: it reads the judges' token probabilities")
    if post is None:
        post = lambda m, msgs: sp.local_route.post(sp.LOCAL, m, msgs, top_logprobs=TOP_LOGPROBS)
    uri = lambda p, side: {"type": "image_url", "image_url": {"url": sp.data_uri(load_rgb(p), side)}}
    src, sheets = uri(source, SOURCE_SIDE), {"a": uri(auto, SHEET_SIDE), "b": uri(image, SHEET_SIDE)}
    prefs = {q: {} for q in QUESTIONS}
    calls = []
    for j in sp.JUDGES:
        for q, text in QUESTIONS.items():
            logit = {}
            for order in ("ab", "ba"):
                content = [{"type": "text", "text": text.format(style=style)}, src, sheets[order[0]], sheets[order[1]]]
                x = None
                for _ in range(3):
                    try:
                        _raw, usage = post(j, [{"role": "user", "content": content}])
                    except RuntimeError as e:
                        calls.append({"judge": j, "question": q, "order": order, "error": str(e)[:160]})
                        continue
                    x = pr.choice_logit(usage.get("logprobs"), ("2", "3"))
                    if x is not None:
                        break
                logit[order] = x
                calls.append({"judge": j, "question": q, "order": order, "logit": x})
            prefs[q][j] = None if None in logit.values() else (logit["ab"] - logit["ba"]) / 2
    questions = {q: summarise(p) for q, p in prefs.items()}
    return {"version": VERSION, **sp.local_route.record(sp.LOCAL), "style": style, "sheetSide": SHEET_SIDE, "sourceSide": SOURCE_SIDE,
            "source": str(source), "auto": str(auto), "image": str(image),
            "complete": all(x["complete"] for x in questions.values()), "questions": questions, "calls": calls}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", required=True); ap.add_argument("--auto", required=True); ap.add_argument("--image", required=True)
    ap.add_argument("--style", default="watercolour over a pencil drawing")
    ap.add_argument("--out")
    a = ap.parse_args()
    try:
        r = compare(a.source, a.auto, a.image, a.style)
    except (ValueError, RuntimeError) as e:
        sys.exit(str(e))
    if a.out:
        Path(a.out).write_text(json.dumps(r, indent=1))
    print(json.dumps({k: v for k, v in r.items() if k != "calls"}, indent=1))
    if not r["complete"]:
        print("incomplete: a judge could not be read in both orders", file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()
