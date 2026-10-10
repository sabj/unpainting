#!/usr/bin/env python3
"""Score one painting against its target, 0 to 10 (rubric bench-v3-median5, the one behind the published runs).

  python3 score_painting.py --target T.png --image P.png --style "pure watercolor, no ink" [--out result.json]

classic:   value, edge and marks metrics from classic.py, each normalized to 0-10; their mean.
vision:    Kimi-K3, GLM-5.3-Flash and Qwen3.5-9B on Together see the target and the painting, blind, and give 0-10 on
           composition_values, edges_detail and marks_texture plus one overall. Each judge is called 5 times at
           temperature 0; its score is the median of its valid calls (at least 3). The vision overall is the mean of
           the three medians. A judge with fewer than 3 valid calls makes the score incomplete.
composite: mean(vision overall, classic mean), or null when incomplete.

Needs TOGETHER_API_KEY in the environment. --no-vision runs the classic part only and needs no key.
"""
import argparse, base64, io, json, math, os, re, sys, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import classic  # noqa: E402
from common import Pair, load_rgb  # noqa: E402

RUBRIC_VERSION = "bench-v3-median5"
URL = "https://api.together.xyz/v1/chat/completions"
JUDGES = ["moonshotai/Kimi-K3", "zai-org/GLM-5.3-Flash", "Qwen/Qwen3.5-9B"]
CALLS = int(os.environ.get("BENCH_SCORE_CALLS", "5"))
MIN_VALID = min(3, CALLS)
VCRIT = ["composition_values", "edges_detail", "marks_texture"]

SCORE_PROMPT = """Image 1 is a TARGET painting. Image 2 is an attempt to paint the same subject by hand in this style: {style}.
You do not know who or what made the attempt. Rate the attempt from 0 to 10 on each criterion:
- composition_values: the big shapes and the light and dark pattern match the target and read as a clear picture.
- edges_detail: edges are crisp where the target is crisp and soft where it is soft; small key details (eyes, highlights, lids) are present and sharp.
- marks_texture: the marks look like real brush or pen marks on paper, with paper showing in the lights; ink is judged against the style above. Noise, speckle, stripes, blur, smearing and digital filters are failures.
Then give one overall score from 0 to 10 for the attempt as a painting, also weighing faithfulness to the target and the washes and technique.
Do not reward pixel similarity. Blur and smear are failures, not a safe middle. 5 is a competent amateur; 9-10 is close to the target's quality.
Reply with JSON only, no prose: {{"composition_values":n,"edges_detail":n,"marks_texture":n,"overall":n}}"""
SHAPE = '{"composition_values":n,"edges_detail":n,"marks_texture":n,"overall":n}'


def _mean(xs):
    xs = [x for x in xs if x is not None and not (isinstance(x, float) and math.isnan(x))]
    return sum(xs) / len(xs) if xs else None


def _c01(x):
    return max(0.0, min(1.0, float(x)))


def classic_scores(target, image):
    pair = Pair(target, image)
    raw = {}
    v = classic.value_judge(pair)
    raw["value"] = _mean([_c01(v["soft_agreement"]), _c01(v["worst_cell_agreement"]), _c01(v["big_shape_iou"])])
    e = classic.edge_judge(pair)
    raw["edge"] = _mean([_c01(e["f_at_tol"]), _c01(e["hardness_ratio_median"]), math.exp(min(0.0, e["density_balance"]))]) if "recall_at_tol" in e else None
    raw["landmark"] = None  # no benchmark crop has landmark annotations
    d = classic.marks_distances(classic.marks_judge(pair))
    raw["marks"] = _mean([_c01(1 - d["hardness_hist_l1"] / 2), _c01(1 - d["paper_share_gap"]),
                          _c01(1 - d["coherence_gap"]), math.exp(-d["speckle_excess"] / 50.0)])
    scores = {k: (None if x is None else round(10 * x, 2)) for k, x in raw.items()}
    m = _mean(list(scores.values()))
    return {"metrics": scores, "mean": None if m is None else round(m, 2)}


def data_uri(img, max_side=768):
    im = img.convert("RGB")
    s = max_side / max(im.size)
    if s < 1:
        im = im.resize((round(im.size[0] * s), round(im.size[1] * s)), Image.LANCZOS)
    elif max(im.size) < 384:
        k = 384 / max(im.size)
        im = im.resize((round(im.size[0] * k), round(im.size[1] * k)), Image.BICUBIC)
    b = io.BytesIO(); im.save(b, "JPEG", quality=88)
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()


def _post(model, messages, max_tokens=8000, timeout=150, retries=3):
    body = json.dumps({"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": 0}).encode()
    hdr = {"Authorization": "Bearer " + os.environ["TOGETHER_API_KEY"], "User-Agent": "unpaint-bench-judge/1", "Content-Type": "application/json"}
    last = None
    for i in range(retries):
        try:
            o = json.load(urllib.request.urlopen(urllib.request.Request(URL, body, hdr), timeout=timeout))
            return o["choices"][0]["message"].get("content") or "", o.get("usage", {})
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code} {e.read().decode('utf8', 'replace')[:120]}"
            if e.code not in (408, 409, 429, 500, 502, 503, 504):
                break
        except Exception as e:  # timeout, connection reset
            last = repr(e)
        time.sleep(2 ** (i + 1))
    raise RuntimeError("together call failed: " + str(last))


def _valid(d):
    try:
        return {k: max(0.0, min(10.0, float(d[k]))) for k in VCRIT + ["overall"]}
    except Exception:
        return None


def _parse(txt):
    txt = re.sub(r"```(?:json)?", "", txt or "")
    for m in reversed(re.findall(r"\{[^{}]*\}", txt)):
        try:
            d = _valid(json.loads(m))
            if d:
                return d
        except Exception:
            pass
    return None


def ask(model, content):
    """One call, then up to 2 repair or retry attempts."""
    raw = ""
    for attempt in range(3):
        msgs = [{"role": "user", "content": content}]
        if attempt == 1 and raw:
            msgs = [{"role": "user", "content": "Rewrite the text below as valid JSON only, exactly this shape: " + SHAPE + "\n\n" + raw[-3000:]}]
        try:
            raw, _ = _post(model, msgs, max_tokens=8000 if attempt != 1 else 1500)
        except RuntimeError:
            if attempt == 2:
                raise
            continue
        d = _parse(raw)
        if d:
            return d
    raise RuntimeError("no valid JSON after 3 attempts")


def vision_scores(target, image, style):
    content = [{"type": "text", "text": SCORE_PROMPT.format(style=style)},
               {"type": "image_url", "image_url": {"url": data_uri(load_rgb(target))}},
               {"type": "image_url", "image_url": {"url": data_uri(load_rgb(image))}}]

    def run(m):
        try:
            return ask(m, content)
        except Exception as e:
            return {"error": str(e)[:200]}

    jobs = [m for m in JUDGES for _ in range(CALLS)]
    with ThreadPoolExecutor(min(9, len(jobs))) as ex:
        got = list(ex.map(run, jobs))
    calls = {m: [] for m in JUDGES}; errors = {m: [] for m in JUDGES}
    for m, d in zip(jobs, got):
        (errors[m] if "error" in d else calls[m]).append(d.get("error") if "error" in d else d)
    med = lambda xs: float(np.median(xs))
    per = {}
    for m, ds in calls.items():
        if len(ds) >= MIN_VALID:
            ov = [d["overall"] for d in ds]
            per[m] = {"overall": round(med(ov), 2), **{c: round(med([d[c] for d in ds]), 2) for c in VCRIT},
                      "calls": len(ds), "sd": round(float(np.std(ov)), 3)}
    out = {"per_judge": per, "errors": {m: e for m, e in errors.items() if e}, "complete": len(per) == len(JUDGES)}
    if out["complete"]:
        out["overall"] = round(_mean([r["overall"] for r in per.values()]), 2)
        out["criteria"] = {c: round(_mean([r[c] for r in per.values()]), 2) for c in VCRIT}
        out["pm"] = round(math.sqrt(sum(r["sd"] ** 2 for r in per.values())) / len(per), 2)
    return out


def score(target, image, style, vision=True):
    cl = classic_scores(target, image)
    vi = vision_scores(target, image, style) if vision else {"per_judge": {}, "errors": {}, "complete": False}
    complete = vi.get("complete", False) and cl["mean"] is not None
    return {
        "composite": round((vi["overall"] + cl["mean"]) / 2, 2) if complete else None,
        "pm": round(vi["pm"] / 2, 2) if complete else None,
        "complete": complete,
        "visionOverall": vi.get("overall"),
        "classic": cl["mean"],
        "criteria": {**vi.get("criteria", {}), **{"classic_" + k: v for k, v in cl["metrics"].items()}},
        "judgeScores": {m: r["overall"] for m, r in vi["per_judge"].items()},
        "callsPerModel": CALLS if vision else 0,
        "visionErrors": {m: len(e) for m, e in vi["errors"].items()},
        "rubric": RUBRIC_VERSION,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--target", required=True)
    ap.add_argument("--image", required=True)
    ap.add_argument("--style", default="watercolor and ink")
    ap.add_argument("--no-vision", action="store_true")
    ap.add_argument("--out")
    a = ap.parse_args()
    if not a.no_vision and not os.environ.get("TOGETHER_API_KEY"):
        sys.exit("TOGETHER_API_KEY is not set; pass --no-vision for the classic part only")
    s = json.dumps(score(a.target, a.image, a.style, not a.no_vision), indent=1)
    if a.out:
        open(a.out, "w").write(s)
    print(s)


if __name__ == "__main__":
    main()
