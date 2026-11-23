"""The local judge route (JUDGE_ROUTE=local, judge version J3): vision judges served by Ollama.

The same code runs against Ollama on this machine, on another machine or on a rented GPU pod; only the endpoint
changes. Settings, all from the environment:

  JUDGE_LOCAL_URL       base URL of the Ollama server (default http://localhost:11434)
  JUDGE_LOCAL_PANEL     comma list of model tags, the panel (default DEFAULT_PANEL)
  JUDGE_LOCAL_PARALLEL  calls in flight at once (default 1: one model loaded at a time, one call at a time)
  JUDGE_LOCAL_TOKEN     optional bearer token, for a pod behind an authenticating proxy

Calls go to /api/chat with thinking off, temperature 0 and a fixed context window, and are grouped by model by the
callers so the server never swaps models back and forth. Results record the endpoint host and each model's digest
(from /api/tags): a tag can be re-pulled, a digest names the weights that judged.
"""
import json, os, time, urllib.error, urllib.parse, urllib.request

JUDGE_VERSION = "J3"
DEFAULT_URL = "http://localhost:11434"
DEFAULT_PANEL = ("qwen3.8-flash-next:125b-mlx", "qwen3.8:27b-mlx", "gemma4:31b-mlx")
NUM_CTX = 8192
MAX_PREDICT = 1024     # a judgement is one short JSON object; thinking is off, so nothing else is generated
KEEP_ALIVE = "10m"


def settings(env=None):
    """Endpoint, panel and parallelism from the environment. Raises ValueError on a setting that cannot be used."""
    env = os.environ if env is None else env
    url = (env.get("JUDGE_LOCAL_URL") or DEFAULT_URL).rstrip("/")
    u = urllib.parse.urlparse(url)
    if u.scheme not in ("http", "https") or not u.netloc:
        raise ValueError(f"JUDGE_LOCAL_URL must be an http(s) URL, not {url}")
    raw = env.get("JUDGE_LOCAL_PANEL")
    panel = [m.strip() for m in raw.split(",")] if raw is not None else list(DEFAULT_PANEL)
    if not panel or any(not m for m in panel) or len(set(panel)) != len(panel):
        raise ValueError("JUDGE_LOCAL_PANEL must be a comma list of distinct model tags")
    try:
        parallel = int(env.get("JUDGE_LOCAL_PARALLEL", "1"))
    except ValueError:
        parallel = 0
    if parallel < 1:
        raise ValueError("JUDGE_LOCAL_PARALLEL must be a positive integer")
    return {"url": url, "host": u.netloc, "panel": panel, "parallel": parallel, "token": env.get("JUDGE_LOCAL_TOKEN") or None}


def to_ollama(messages):
    """OpenAI-style messages (text and data-URI image parts) as Ollama chat messages (text plus base64 images)."""
    out = []
    for m in messages:
        c = m["content"]
        if isinstance(c, str):
            out.append({"role": m["role"], "content": c})
            continue
        text = "\n".join(p["text"] for p in c if p["type"] == "text")
        images = []
        for p in c:
            if p["type"] == "image_url":
                url = p["image_url"]["url"]
                if not url.startswith("data:") or "," not in url:
                    raise ValueError("the local route sends images inline: every image must be a data URI")
                images.append(url.split(",", 1)[1])
        out.append({"role": m["role"], "content": text, **({"images": images} if images else {})})
    return out


def _headers(cfg):
    h = {"User-Agent": "unpaint-bench-judge/1", "Content-Type": "application/json"}
    if cfg.get("token"):
        h["Authorization"] = "Bearer " + cfg["token"]
    return h


def post(cfg, model, messages, max_tokens=MAX_PREDICT, timeout=600, retries=3, opener=None, sleep=time.sleep, top_logprobs=0, num_ctx=NUM_CTX, max_predict=MAX_PREDICT):
    """One chat call. Returns (reply text, usage). Raises RuntimeError when the server cannot be used.
    top_logprobs > 0 also asks for each reply token's log-probability and its nearest alternatives (usage["logprobs"]).
    num_ctx and max_predict widen the window for a long reading (score04's thirteen-picture sequence)."""
    opener = opener or urllib.request.urlopen
    body = json.dumps({"model": model, "messages": to_ollama(messages), "stream": False, "think": False,
                       "keep_alive": KEEP_ALIVE, **({"logprobs": True, "top_logprobs": top_logprobs} if top_logprobs else {}),
                       "options": {"temperature": 0, "num_ctx": num_ctx, "num_predict": min(max_tokens, max_predict)}}).encode()
    last = None
    for i in range(retries):
        try:
            o = json.load(opener(urllib.request.Request(cfg["url"] + "/api/chat", body, _headers(cfg)), timeout=timeout))
            return (o.get("message") or {}).get("content") or "", {
                "provider": "local", "prompt_tokens": o.get("prompt_eval_count"), "completion_tokens": o.get("eval_count"),
                "finish_reason": o.get("done_reason"), **({"logprobs": o.get("logprobs") or []} if top_logprobs else {}), "seconds": round((o.get("total_duration") or 0) / 1e9, 2)}
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code} {e.read().decode('utf8', 'replace')[:120]}"
            if e.code not in (408, 409, 429, 500, 502, 503, 504):
                break
        except Exception as e:  # timeout, connection refused
            last = repr(e)
        sleep(2 ** (i + 1))
    raise RuntimeError(f"local call failed ({cfg['host']}, {model}): {last}")


def digests(cfg, opener=None, timeout=30):
    """{model tag: digest} for the panel. A panel model the server does not hold is an error, not a smaller panel."""
    opener = opener or urllib.request.urlopen
    try:
        o = json.load(opener(urllib.request.Request(cfg["url"] + "/api/tags", headers=_headers(cfg)), timeout=timeout))
    except Exception as e:
        raise RuntimeError(f"local judge endpoint {cfg['host']} does not answer: {e!r}") from None
    have = {m.get("name"): m.get("digest") for m in o.get("models", [])}
    missing = [m for m in cfg["panel"] if not have.get(m)]
    if missing:
        raise RuntimeError(f"local judge endpoint {cfg['host']} does not hold: {', '.join(missing)}")
    return {m: have[m] for m in cfg["panel"]}


def record(cfg, opener=None):
    """What a result keeps about the route: enough to tell two J3 runs apart."""
    return {"judgeVersion": JUDGE_VERSION, "judgeRoute": "local", "judgeEndpoint": cfg["host"],
            "judgeModels": digests(cfg, opener), "judgeOptions": {"think": False, "temperature": 0, "num_ctx": NUM_CTX}}
