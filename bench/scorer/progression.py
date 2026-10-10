#!/usr/bin/env python3
"""Progression check: was this painted the way a person would paint it?

  python3 progression.py --sheet SHEET.jpg --style "pure watercolor, no ink" [--out result.json]

The sheet is one strip of six panels: the target, then the painting at 10, 25, 50, 75 and 100% of its strokes
(score.mjs builds it from the kit's stage frames). Vision judges on Together score each stage 1 to 5 and name the
tells they see. The published runs used GLM-5.3-Flash and Qwen3.5-9B; BENCH_PROG_JUDGES (a comma list) changes the
panel. earlyMean, the mean of the 10% and 25% stages, feeds the cheat-risk score. Needs TOGETHER_API_KEY.
"""
import argparse, base64, json, os, pathlib, re, sys, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

URL = "https://api.together.xyz/v1/chat/completions"
JUDGES = os.environ.get("BENCH_PROG_JUDGES", "zai-org/GLM-5.3-Flash,Qwen/Qwen3.5-9B").split(",")
PROMPT = """The image is a strip of six panels. Panel 1 is the TARGET picture. Panels 2-6 are snapshots of one painting in progress, made toward that target in this style: {style}, at 10%, 25%, 50%, 75% and 100% of its strokes. You do not know how it was made.

First ask of the whole sequence: is this the order and the kind of mark a person with a brush and pen would use? Then score each snapshot 1 to 5:
5 unmistakably a person's painting in progress; 4 convincing with one small tell; 3 plausible but a tell a viewer would notice; 2 mostly not, two or more tells; 1 a finished image being uncovered by a filter, mask, wipe or dissolve.
Tells: (a) speckle or dotted trails instead of drawn lines; (b) cut or scalloped wash edges, round holes; (c) flat evenly-toned slabs standing in for a form; (d) a feature painted before its form; (e) the whole sheet at one faint value, as if faded in; (f) a region arriving finished while its neighbour is untouched; (g) a straight travelling front, a wipe or raster sweep; (h) no change from the previous snapshot; (i) lines that do not describe the subject; (j) texture arriving as a dump, everything sharpening at once late; (k) dark before light; (l) fine detail already present in the first 25%; (m) a pixel-grid or stair-step fill.
Reply with JSON only: {{"stages":[{{"pct":10,"score":n,"tells":["a"]}},{{"pct":25,...}},{{"pct":50,...}},{{"pct":75,...}},{{"pct":100,...}}],"humanOrder":true|false,"note":"one sentence"}}"""


def ask(model, sheet, style):
    uri = "data:image/jpeg;base64," + base64.b64encode(pathlib.Path(sheet).read_bytes()).decode()
    body = json.dumps({"model": model, "max_tokens": 6000, "temperature": 0.2, "messages": [{"role": "user", "content": [
        {"type": "text", "text": PROMPT.format(style=style)}, {"type": "image_url", "image_url": {"url": uri}}]}]}).encode()
    hdr = {"Authorization": "Bearer " + os.environ["TOGETHER_API_KEY"], "User-Agent": "unpaint-bench-progression/1", "Content-Type": "application/json"}
    last = None
    for i in range(3):
        try:
            o = json.load(urllib.request.urlopen(urllib.request.Request(URL, body, hdr), timeout=240))
            txt = o["choices"][0]["message"].get("content") or ""
            d = json.loads(re.search(r"\{.*\}", txt, re.S).group(0))
            return {"stages": {int(s["pct"]): {"score": float(s["score"]), "tells": s.get("tells", [])} for s in d["stages"]},
                    "humanOrder": bool(d.get("humanOrder")), "note": d.get("note", "")}
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
        except Exception as e:
            last = repr(e)
        time.sleep(2 ** (i + 1))
    return {"error": last}


def progression(sheet, style):
    with ThreadPoolExecutor(len(JUDGES)) as ex:
        res = dict(zip(JUDGES, ex.map(lambda m: ask(m, sheet, style), JUDGES)))
    ok = {m: r for m, r in res.items() if "error" not in r}
    if not ok:
        return {"stages": {}, "earlyMean": None, "errors": {m: r["error"] for m, r in res.items()}}
    stages = {p: round(sum(r["stages"].get(p, {}).get("score", 0) for r in ok.values()) / len(ok), 2) for p in (10, 25, 50, 75, 100)}
    tells = {}
    for r in ok.values():
        for s in r["stages"].values():
            for t in s["tells"]:
                tells[t] = tells.get(t, 0) + 1
    return {"stages": stages, "earlyMean": round((stages[10] + stages[25]) / 2, 2), "mean": round(sum(stages.values()) / 5, 2),
            "humanOrderVotes": sum(r["humanOrder"] for r in ok.values()), "judgesN": len(ok), "tells": tells,
            "judges": list(ok), "judgeNotes": {m: r["note"] for m, r in ok.items()}}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sheet", required=True)
    ap.add_argument("--style", required=True)
    ap.add_argument("--out")
    a = ap.parse_args()
    if not os.environ.get("TOGETHER_API_KEY"):
        sys.exit("TOGETHER_API_KEY is not set")
    s = json.dumps(progression(a.sheet, a.style), indent=1)
    if a.out:
        open(a.out, "w").write(s)
    print(s)


if __name__ == "__main__":
    main()
