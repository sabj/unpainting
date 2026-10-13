#!/usr/bin/env python3
"""Score one painting against its target, 0 to 10 (rubric bench-v3-median5, the one behind the published runs).

  python3 score_painting.py --target T.png --image P.png --style "pure watercolor, no ink" [--judge J1|J2] [--out result.json]

classic:   value, edge and marks metrics from classic.py, each normalized to 0-10; their mean.
vision:    Kimi-K3, GLM-5.3-Flash and Qwen3.5-9B on Together see the target and the painting, blind, and give 0-10 on
           composition_values, edges_detail and marks_texture plus one overall. Each judge is called 5 times at
           temperature 0; its score is the median of its valid calls (at least 3). The vision overall is the mean of
           the three medians. A judge with fewer than 3 valid calls makes the score incomplete.
composite: mean(vision overall, classic mean), or null when incomplete.

Judge versions (--judge, or BENCH_JUDGE_VERSION; the default is J1, the published bench's judge, unchanged):
  J1  as above: a judge needs at least 3 valid calls of 5, and an unparseable reply is rewritten into JSON by a
      text-only follow-up call that counts as a judgement.
  J2  same panel, prompt, images and medians, but every judge needs all 5 calls valid. A call that fails, is cut off
      at the token limit or does not parse is made again with both images (up to 3 calls per judgement, then up to
      2 top-up rounds); there is no text-only repair. Every attempt is kept under visionAttempts with its HTTP status
      and finish_reason. J2 scores are not compared with J1 scores.
Every result records judgeVersion, minValidCalls and callCounts (valid calls per judge).

Uses OPENROUTER_API_KEY with zero-data-retention providers when available, otherwise TOGETHER_API_KEY. --no-vision runs the classic part only and needs no key.
"""
import argparse, base64, io, json, math, os, re, sys, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import classic  # noqa: E402
from common import Pair, load_rgb  # noqa: E402

RUBRIC_VERSION = "bench-v3-median5"
PROVIDER = "openrouter" if os.environ.get("OPENROUTER_API_KEY") else "together"
URL = "https://openrouter.ai/api/v1/chat/completions" if PROVIDER == "openrouter" else "https://api.together.xyz/v1/chat/completions"
ROUTER_MODELS = {"moonshotai/Kimi-K3":"moonshotai/kimi-k3", "zai-org/GLM-5.3-Flash":"z-ai/glm-5.3-flash", "Qwen/Qwen3.5-9B":"qwen/qwen3.5-9b"}
JUDGES = ["moonshotai/Kimi-K3", "zai-org/GLM-5.3-Flash", "Qwen/Qwen3.5-9B"]
CALLS = int(os.environ.get("BENCH_SCORE_CALLS", "5"))
MIN_VALID = min(3, CALLS)  # J1
JUDGE_VERSIONS = ("J1", "J2")
DEFAULT_JUDGE = os.environ.get("BENCH_JUDGE_VERSION", "J1")
J2_ATTEMPTS, J2_TOPUP_ROUNDS = 3, 2
J2_MAX_TOKENS, J2_MAX_TOKENS_CAP = 8000, 16000
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
    payload = {"model": ROUTER_MODELS[model] if PROVIDER == "openrouter" else model, "messages": messages, "max_tokens": max_tokens, "temperature": 0}
    if PROVIDER == "openrouter":
        payload["provider"] = {"zdr": True, "data_collection": "deny", "ignore": ["Hyperbolic"]}
    body = json.dumps(payload).encode()
    hdr = {"Authorization": "Bearer " + os.environ["OPENROUTER_API_KEY" if PROVIDER == "openrouter" else "TOGETHER_API_KEY"], "User-Agent": "unpaint-bench-judge/1", "Content-Type": "application/json"}
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
    raise RuntimeError(PROVIDER + " call failed: " + str(last))


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


def _post_j2(model, messages, max_tokens=J2_MAX_TOKENS, timeout=150, retries=3, log=None):
    """J2: _post that also returns the finish_reason and appends every HTTP attempt to log (a list)."""
    payload = {"model": ROUTER_MODELS[model] if PROVIDER == "openrouter" else model, "messages": messages, "max_tokens": max_tokens, "temperature": 0}
    if PROVIDER == "openrouter":
        payload["provider"] = {"zdr": True, "data_collection": "deny", "ignore": ["Hyperbolic"]}
    body = json.dumps(payload).encode()
    hdr = {"Authorization": "Bearer " + os.environ["OPENROUTER_API_KEY" if PROVIDER == "openrouter" else "TOGETHER_API_KEY"], "User-Agent": "unpaint-bench-judge/1", "Content-Type": "application/json"}
    log = [] if log is None else log
    last = None
    for i in range(retries):
        try:
            o = json.load(urllib.request.urlopen(urllib.request.Request(URL, body, hdr), timeout=timeout))
            ch, u = (o.get("choices") or [{}])[0], o.get("usage", {})
            log.append({"status": 200, "finish_reason": ch.get("finish_reason"), "maxTokens": max_tokens,
                        "completionTokens": u.get("completion_tokens")})
            if "message" in ch:
                return ch["message"].get("content") or "", u, ch.get("finish_reason")
            last = "reply without choices"
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code} {e.read().decode('utf8', 'replace')[:120]}"
            log.append({"status": e.code, "error": last[:160]})
            if e.code not in (408, 409, 429, 500, 502, 503, 504):
                break
        except Exception as e:  # timeout, connection reset
            last = repr(e)
            log.append({"status": None, "error": last[:160]})
        time.sleep(2 ** (i + 1))
    raise RuntimeError(PROVIDER + " call failed: " + str(last))


def ask_j2(model, content, log=None):
    """J2: one judgement from full calls with both images, at most J2_ATTEMPTS calls. A reply cut off at the token
    limit is asked again with twice the tokens; there is no text-only JSON repair. Attempts go to log."""
    log = [] if log is None else log
    budget, why = J2_MAX_TOKENS, ""
    for attempt in range(1, J2_ATTEMPTS + 1):
        tries = []
        try:
            raw, _, finish = _post_j2(model, [{"role": "user", "content": content}], max_tokens=budget, log=tries)
        except RuntimeError as e:
            why = str(e)
            continue
        finally:
            log.extend({"attempt": attempt, **x} for x in tries)
        if finish == "length":
            why = f"cut off at {budget} tokens"
            budget = min(budget * 2, J2_MAX_TOKENS_CAP)
            continue
        d = _parse(raw)
        if d:
            return d
        why = f"no valid JSON (finish_reason {finish})"
    raise RuntimeError(f"{why} after {J2_ATTEMPTS} attempts")


def _content(target, image, style):
    return [{"type": "text", "text": SCORE_PROMPT.format(style=style)},
            {"type": "image_url", "image_url": {"url": data_uri(load_rgb(target))}},
            {"type": "image_url", "image_url": {"url": data_uri(load_rgb(image))}}]


def _aggregate(calls, errors, min_valid):
    med = lambda xs: float(np.median(xs))
    per = {}
    for m, ds in calls.items():
        if len(ds) >= min_valid:
            ov = [d["overall"] for d in ds]
            per[m] = {"overall": round(med(ov), 2), **{c: round(med([d[c] for d in ds]), 2) for c in VCRIT},
                      "calls": len(ds), "sd": round(float(np.std(ov)), 3)}
    out = {"per_judge": per, "errors": {m: e for m, e in errors.items() if e}, "complete": len(per) == len(JUDGES),
           "callCounts": {m: len(ds) for m, ds in calls.items()}, "minValidCalls": min_valid}
    if out["complete"]:
        out["overall"] = round(_mean([r["overall"] for r in per.values()]), 2)
        out["criteria"] = {c: round(_mean([r[c] for r in per.values()]), 2) for c in VCRIT}
        out["pm"] = round(math.sqrt(sum(r["sd"] ** 2 for r in per.values())) / len(per), 2)
    return out


def vision_scores(target, image, style):
    """J1: 5 calls per judge, a judge counts with at least 3 valid calls."""
    content = _content(target, image, style)

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
    return _aggregate(calls, errors, MIN_VALID)


def vision_scores_j2(target, image, style):
    """J2: every judge needs CALLS valid calls; failed judgements are retried, then topped up in extra rounds."""
    content = _content(target, image, style)

    def run(job):
        m, slot = job
        log = []
        try:
            d = ask_j2(m, content, log)
        except Exception as e:
            d = {"error": str(e)[:200]}
        return d, [{"judge": m, "slot": slot, **x} for x in log]

    calls = {m: [] for m in JUDGES}; errors = {m: [] for m in JUDGES}; attempts = []
    for _round in range(1 + J2_TOPUP_ROUNDS):
        jobs = [(m, len(calls[m]) + i) for m in JUDGES for i in range(CALLS - len(calls[m]))]
        if not jobs:
            break
        with ThreadPoolExecutor(min(9, len(jobs))) as ex:
            got = list(ex.map(run, jobs))
        for (m, _), (d, log) in zip(jobs, got):
            attempts += log
            (errors[m] if "error" in d else calls[m]).append(d.get("error") if "error" in d else d)
    out = _aggregate(calls, errors, CALLS)
    out["attempts"] = attempts
    return out


def score(target, image, style, vision=True, judge=None):
    judge = judge or DEFAULT_JUDGE
    if judge not in JUDGE_VERSIONS:
        raise ValueError(f"unknown judge version {judge}; known: {', '.join(JUDGE_VERSIONS)}")
    cl = classic_scores(target, image)
    vi = (vision_scores_j2 if judge == "J2" else vision_scores)(target, image, style) if vision else \
        {"per_judge": {}, "errors": {}, "complete": False, "callCounts": {}, "minValidCalls": None}
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
        "callCounts": vi["callCounts"], "minValidCalls": vi["minValidCalls"],
        "visionErrors": {m: len(e) for m, e in vi["errors"].items()},
        **({"visionAttempts": vi["attempts"]} if "attempts" in vi else {}),
        "rubric": RUBRIC_VERSION,
        "judgeVersion": judge, "provider": PROVIDER,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--target", required=True)
    ap.add_argument("--image", required=True)
    ap.add_argument("--style", default="watercolor and ink")
    ap.add_argument("--no-vision", action="store_true")
    ap.add_argument("--judge", choices=JUDGE_VERSIONS, default=DEFAULT_JUDGE, help="judge version (default %(default)s)")
    ap.add_argument("--out")
    a = ap.parse_args()
    if not a.no_vision and not (os.environ.get("OPENROUTER_API_KEY") or os.environ.get("TOGETHER_API_KEY")):
        sys.exit("Neither OPENROUTER_API_KEY nor TOGETHER_API_KEY is set; pass --no-vision for the classic part only")
    r = score(a.target, a.image, a.style, not a.no_vision, a.judge)
    s = json.dumps(r, indent=1)
    if a.out:
        open(a.out, "w").write(s)
    print(s)
    counts = " ".join(f"{m.split('/')[-1]} {n}/{CALLS}" for m, n in r["callCounts"].items())
    print(f"{r['judgeVersion']} composite {r['composite']} (valid calls: {counts or 'none'})", file=sys.stderr)


if __name__ == "__main__":
    main()
