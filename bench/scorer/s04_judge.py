"""The judge route for 0.4's scoring (score04.py): one setting, JUDGE_ROUTE, local by default.

  local       the local panel (local_route.py: Ollama, one model in memory at a time, unloaded after its readings)
  together    the hosted panel on Together; needs TOGETHER_API_KEY
  openrouter  the same hosted panel on OpenRouter (zero-data-retention providers only); needs OPENROUTER_API_KEY

A hosted route with no key fails before any work, with a plain message. The key is sent as a header and is never
written into a result, a log or an error.
"""
import json, os, time, urllib.error, urllib.request

import local_route

ROUTES = ("local", "together", "openrouter")
# the hosted panel is the J1 panel as score_painting.py names it
HOSTED_PANEL = ("moonshotai/Kimi-K3", "zai-org/GLM-5.3-Flash", "Qwen/Qwen3.5-9B")
OPENROUTER_NAMES = {"moonshotai/Kimi-K3": "moonshotai/kimi-k3", "zai-org/GLM-5.3-Flash": "z-ai/glm-5.3-flash", "Qwen/Qwen3.5-9B": "qwen/qwen3.5-9b"}
HOSTED = {"together": ("https://api.together.xyz/v1/chat/completions", "TOGETHER_API_KEY"),
          "openrouter": ("https://openrouter.ai/api/v1/chat/completions", "OPENROUTER_API_KEY")}
LABEL = {"local": "J3-local-3x", "together": "J4-together-3x", "openrouter": "J4-openrouter-3x"}
# JUDGE_HOSTED_PANEL=open3 (openrouter only): three open-weight models, hosted with zero data retention, that can also be run
# locally. Qwen3.8-Flash-Next is not in it: its only host (23 Nov 2026) offers no zero-data-retention endpoint (HTTP 404).
OPEN3_PANEL = ("zai-org/GLM-5.3-Flash", "Qwen/Qwen3.8-27B", "google/gemma-4-31b-it")
OPEN3_NAMES = {"zai-org/GLM-5.3-Flash": "z-ai/glm-5.3-flash", "Qwen/Qwen3.8-27B": "qwen/qwen3.8-27b", "google/gemma-4-31b-it": "google/gemma-4-31b-it"}
OPEN3_LABEL = "J3-open-3x-hosted"


class RouteError(Exception):
    """A route that cannot be used: the message is meant for a person."""


def settings(env=None):
    env = os.environ if env is None else env
    route = env.get("JUDGE_ROUTE") or "local"
    if route not in ROUTES:
        raise RouteError(f"JUDGE_ROUTE must be one of {', '.join(ROUTES)}, not {route!r}")
    if route == "local":
        try:
            cfg = local_route.settings(env)
        except ValueError as e:
            raise RouteError(str(e)) from None
        return {**cfg, "route": "local", "label": LABEL["local"]}
    url, key_name = HOSTED[route]
    if not env.get(key_name):
        raise RouteError(f"JUDGE_ROUTE={route} needs {key_name}, and it is not set. Set it in the environment, or use JUDGE_ROUTE=local.")
    panel, label = list(HOSTED_PANEL), LABEL[route]
    if env.get("JUDGE_HOSTED_PANEL"):
        if env["JUDGE_HOSTED_PANEL"] != "open3" or route != "openrouter":
            raise RouteError("JUDGE_HOSTED_PANEL can only be open3, and only with JUDGE_ROUTE=openrouter")
        panel, label = list(OPEN3_PANEL), OPEN3_LABEL
    return {"route": route, "label": label, "url": url, "host": url.split("/")[2], "panel": panel,
            "keyName": key_name, "env": env}


def post(cfg, model, content, max_tokens=1024, num_ctx=local_route.NUM_CTX, opener=None, sleep=time.sleep):
    """One call with one user message. Returns (reply text, usage). Raises RuntimeError when the route fails."""
    messages = [{"role": "user", "content": content}]
    if cfg["route"] == "local":
        return local_route.post(cfg, model, messages, max_tokens=max_tokens, opener=opener, sleep=sleep, num_ctx=num_ctx, max_predict=max_tokens)
    opener = opener or urllib.request.urlopen
    payload = {"model": {**OPENROUTER_NAMES, **OPEN3_NAMES}[model] if cfg["route"] == "openrouter" else model, "messages": messages,
               "max_tokens": max_tokens, "temperature": 0}
    if cfg["route"] == "openrouter":
        payload["provider"] = {"zdr": True, "data_collection": "deny"}
    hdr = {"Authorization": "Bearer " + cfg["env"][cfg["keyName"]], "User-Agent": "unpaint-bench-judge/1", "Content-Type": "application/json"}
    last = None
    for i in range(3):
        try:
            o = json.load(opener(urllib.request.Request(cfg["url"], json.dumps(payload).encode(), hdr), timeout=300))
            return o["choices"][0]["message"].get("content") or "", {**o.get("usage", {}), "provider": o.get("provider") or cfg["route"]}
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
            if e.code not in (408, 409, 429, 500, 502, 503, 504):
                break
        except Exception as e:  # timeout, connection reset
            last = type(e).__name__
        sleep(2 ** (i + 1))
    raise RuntimeError(f"{cfg['route']} call failed ({model}): {last}")


def record(cfg, opener=None):
    """What the results keep about the route. On the local route a panel model the server does not hold is an error."""
    out = {"route": cfg["route"], "label": cfg["label"], "endpoint": cfg["host"], "panel": list(cfg["panel"])}
    if cfg["route"] == "local":
        out["digests"] = local_route.digests(cfg, opener)
        out["options"] = {"think": False, "temperature": 0}
    else:
        out["digests"] = None
        out["options"] = {"temperature": 0}
    return out


def loaded(cfg, opener=None):
    """Models the local server holds in memory now (empty on a hosted route)."""
    if cfg["route"] != "local":
        return []
    opener = opener or urllib.request.urlopen
    req = urllib.request.Request(cfg["url"] + "/api/ps", headers=local_route._headers(cfg))
    return [m.get("name") for m in json.load(opener(req, timeout=30)).get("models", [])]


def unload(cfg, model, opener=None):
    """Free the local server's memory of one model (keep_alive 0). Nothing to do on a hosted route."""
    if cfg["route"] != "local":
        return
    opener = opener or urllib.request.urlopen
    body = json.dumps({"model": model, "keep_alive": 0}).encode()
    opener(urllib.request.Request(cfg["url"] + "/api/generate", body, local_route._headers(cfg)), timeout=120).read()


def wait_turn(cfg, model, opener=None, sleep=time.sleep, say=print, every=30):
    """Wait while the local server holds any model other than `model`: another job is using it."""
    while True:
        other = [m for m in loaded(cfg, opener) if m != model]
        if not other:
            return
        say(f"waiting: the judge server holds {', '.join(other)} (another job); checking again in {every} s", flush=True)
        sleep(every)
