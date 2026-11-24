"""The judge panel and route for 0.4's scoring (score04.py).

ONE named panel is the default on every route: JUDGE_PANEL=open3, three open-weight models (GLM-5.3-Flash, Qwen3.8-27B,
Gemma-4-31B) read with one reasoning setting (REASONING: low) wherever they are served. Any other panel is asked for
by name (PANELS). The route is JUDGE_ROUTE, local by default:

  local       Ollama (local_route.py): one model in memory at a time, unloaded after its readings
  openrouter  hosted, zero-data-retention providers only; needs OPENROUTER_API_KEY
  together    hosted on Together; needs TOGETHER_API_KEY (it serves the j1 panel only)

A panel a route cannot serve is refused before any work, by name: never a different or a smaller panel. The panel's
name, its models as each route names them, and the reasoning setting are written into every results file
(record()). The key of a hosted route is sent as a header and is never written into a result, a log or an error.
"""
import json, os, random, time, urllib.error, urllib.request

import local_route

ROUTES = ("local", "together", "openrouter")
READINGS_LABEL = "3x"
# One reasoning setting for every judge on every route: low. It is the least setting under which all three models of
# the panel answer: with reasoning off, GLM-5.3-Flash's hosted provider refuses the call outright (HTTP 400 on every
# reading, 23 Nov 2026: a whole batch came back without a score). OpenRouter: reasoning effort "low", with room for
# the thinking beside the answer; local: Ollama's think "low". SENT is what each setting sends on each route.
REASONING = "low"
SENT = {"off": {"effort": "none", "think": False}, "low": {"effort": "low", "think": "low"}}
# What a judge is asked before a batch is read (probe): one short answer, no picture.
PROBE = 'Answer with exactly this JSON object and nothing else: {"ok": true}'
HOSTED = {"together": ("https://api.together.xyz/v1/chat/completions", "TOGETHER_API_KEY"),
          "openrouter": ("https://openrouter.ai/api/v1/chat/completions", "OPENROUTER_API_KEY")}
# The panels by name. `models`: the judges' own names, the same in every results file whatever the route. Under each
# route: the name that route serves the model by. A model a route has no name for cannot be read on that route.
PANELS = {
    "open3": {"what": "the 0.4 panel: three open-weight models, hosted with zero data retention and runnable locally",
              "models": ("zai-org/GLM-5.3-Flash", "Qwen/Qwen3.8-27B", "google/gemma-4-31b-it"),
              "openrouter": {"zai-org/GLM-5.3-Flash": "z-ai/glm-5.3-flash", "Qwen/Qwen3.8-27B": "qwen/qwen3.8-27b", "google/gemma-4-31b-it": "google/gemma-4-31b-it"},
              # GLM-5.3-Flash has no local tag here: name the one the server holds in JUDGE_LOCAL_TAGS
              "local": {"Qwen/Qwen3.8-27B": "qwen3.8:27b-mlx", "google/gemma-4-31b-it": "gemma4:31b-mlx"}},
    "j1": {"what": "the J1 panel of the V1 to V5 rounds (score_painting.py), hosted only",
           "models": ("moonshotai/Kimi-K3", "zai-org/GLM-5.3-Flash", "Qwen/Qwen3.5-9B"),
           "openrouter": {"moonshotai/Kimi-K3": "moonshotai/kimi-k3", "zai-org/GLM-5.3-Flash": "z-ai/glm-5.3-flash", "Qwen/Qwen3.5-9B": "qwen/qwen3.5-9b"},
           "together": {m: m for m in ("moonshotai/Kimi-K3", "zai-org/GLM-5.3-Flash", "Qwen/Qwen3.5-9B")}},
    "local3": {"what": "the local panel used before 0.4 named one (J3): Qwen3.8-Flash-Next in GLM-5.3-Flash's place, local only",
               "models": tuple(local_route.DEFAULT_PANEL), "local": {m: m for m in local_route.DEFAULT_PANEL}},
}
DEFAULT_PANEL = "open3"


class RouteError(Exception):
    """A route or panel that cannot be used: the message is meant for a person."""


def _local_tags(env):
    """{judge: tag} from JUDGE_LOCAL_TAGS ("judge=tag,judge=tag"): the tags this server holds the panel's models under."""
    out = {}
    for part in filter(None, (x.strip() for x in (env.get("JUDGE_LOCAL_TAGS") or "").split(","))):
        if "=" not in part:
            raise RouteError(f"JUDGE_LOCAL_TAGS is a comma list of judge=tag, not {part!r}")
        k, v = part.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def settings(env=None):
    env = os.environ if env is None else env
    route = env.get("JUDGE_ROUTE") or "local"
    if route not in ROUTES:
        raise RouteError(f"JUDGE_ROUTE must be one of {', '.join(ROUTES)}, not {route!r}")
    if env.get("JUDGE_HOSTED_PANEL"):
        raise RouteError("JUDGE_HOSTED_PANEL is gone: the panel is named by JUDGE_PANEL on every route (open3 is the default)")
    # a hosted route without its key stops here, before anything else is read
    if route != "local" and not env.get(HOSTED[route][1]):
        raise RouteError(f"JUDGE_ROUTE={route} needs {HOSTED[route][1]}, and it is not set. Set it in the environment, or use JUDGE_ROUTE=local.")
    name = env.get("JUDGE_PANEL") or DEFAULT_PANEL
    if name == "custom":
        # a panel of one's own, local only, by its tags: never the default, and labelled as what it is
        if route != "local" or not env.get("JUDGE_LOCAL_PANEL"):
            raise RouteError("JUDGE_PANEL=custom is a local panel named by its tags: set JUDGE_ROUTE=local and JUDGE_LOCAL_PANEL")
        models = names = None
    elif name not in PANELS:
        raise RouteError(f"JUDGE_PANEL must be one of {', '.join(PANELS)} (or custom), not {name!r}")
    else:
        if env.get("JUDGE_LOCAL_PANEL"):
            raise RouteError(f"JUDGE_LOCAL_PANEL names a panel of its own: ask for it with JUDGE_PANEL=custom, or unset it to read with {name}")
        p = PANELS[name]
        models = list(p["models"])
        names = {**(p.get(route) or {}), **({k: v for k, v in _local_tags(env).items() if k in models} if route == "local" else {})}
        short = [m for m in models if not names.get(m)]
        if short:
            raise RouteError(f"the {name} panel cannot be read on the {route} route: it has no name there for {', '.join(short)}. " +
                             ("Pull the model on the judge server and name its tag in JUDGE_LOCAL_TAGS (judge=tag), or use JUDGE_ROUTE=openrouter. " if route == "local" else "") +
                             "Another panel must be asked for by name (JUDGE_PANEL); none stands in.")
    label = f"{name}-{route}-{READINGS_LABEL}"
    if route == "local":
        try:
            cfg = local_route.settings({**env, **({"JUDGE_LOCAL_PANEL": ",".join(names[m] for m in models)} if models else {})})
        except ValueError as e:
            raise RouteError(str(e)) from None
        if models is None:
            models, names = list(cfg["panel"]), {m: m for m in cfg["panel"]}
        return {**cfg, "panel": models, "names": names, "panelName": name, "reasoning": REASONING, "route": "local", "label": label}
    url, key_name = HOSTED[route]
    return {"route": route, "label": label, "url": url, "host": url.split("/")[2], "panel": models, "names": names, "panelName": name,
            "reasoning": REASONING, "keyName": key_name, "env": env}


def sent_name(cfg, model):
    """The name this route serves a judge by (the judge's own name when the settings carry none: a stub)."""
    return (cfg.get("names") or {}).get(model, model)


def post(cfg, model, content, max_tokens=1024, num_ctx=local_route.NUM_CTX, opener=None, sleep=time.sleep):
    """One call with one user message. Returns (reply text, usage). Raises RuntimeError when the route fails."""
    messages = [{"role": "user", "content": content}]
    if cfg["route"] == "local":
        return local_route.post(cfg, sent_name(cfg, model), messages, max_tokens=max_tokens, opener=opener, sleep=sleep, num_ctx=num_ctx, max_predict=max_tokens, think=SENT[cfg.get("reasoning", REASONING)]["think"])
    opener = opener or urllib.request.urlopen
    payload = {"model": sent_name(cfg, model), "messages": messages,
               "max_tokens": max_tokens, "temperature": 0}
    if cfg["route"] == "openrouter":
        payload["provider"] = {"zdr": True, "data_collection": "deny"}
        # the panel's one reasoning setting (REASONING), as on the local route. The thinking is given room of its own,
        # so the answer is not cut short (23 Nov 2026: thinking used the answer's own limit and replies came back
        # empty); the reasoning tokens are reported in the usage.
        payload["max_tokens"] = max_tokens + 6000
        payload["reasoning"] = {"effort": SENT[cfg.get("reasoning", REASONING)]["effort"]}
    hdr = {"Authorization": "Bearer " + cfg["env"][cfg["keyName"]], "User-Agent": "unpaint-bench-judge/1", "Content-Type": "application/json"}
    last = None
    for i in range(HOSTED_TRIES):
        try:
            o = json.load(opener(urllib.request.Request(cfg["url"], json.dumps(payload).encode(), hdr), timeout=300))
            u = o.get("usage") or {}
            return o["choices"][0]["message"].get("content") or "", {**u, "reasoning_tokens": (u.get("completion_tokens_details") or {}).get("reasoning_tokens"), "provider": o.get("provider") or cfg["route"]}
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
            if e.code not in RETRY_CODES:
                break
            wait = backoff(i, e.headers.get("Retry-After") if e.headers else None)
        except Exception as e:  # timeout, connection reset
            last = type(e).__name__
            wait = backoff(i)
        if i + 1 < HOSTED_TRIES:
            sleep(wait)
    raise RuntimeError(f"{cfg['route']} call failed ({model}): {last}")


# A hosted call is tried up to HOSTED_TRIES times on a busy or failing server (RETRY_CODES, a timeout, a dropped
# connection): with several readings in flight at once (score04 --concurrency), a 429 is expected, not a fault.
HOSTED_TRIES = 6
RETRY_CODES = (408, 409, 429, 500, 502, 503, 504)


def backoff(i, retry_after=None, rand=random.random):
    """Seconds to wait before try i + 2: the server's Retry-After when it gives one in seconds (at most 120), else
    2, 4, 8 ... up to 60, with up to a quarter more at random so readings in flight do not retry in step."""
    try:
        if retry_after is not None:
            return min(120.0, max(0.0, float(retry_after)))
    except ValueError:
        pass
    base = min(60.0, 2.0 ** (i + 1))
    return base * (1 + 0.25 * rand())


def probe(cfg, post=None, opener=None, sleep=time.sleep):
    """One cheap call to every judge of a hosted panel before a batch is read: each must answer the short question
    with its JSON. Raises RouteError naming every judge that did not, with what came back, so a batch never runs to
    its end with a dead judge. The local route is not probed here: it holds one model in memory at a time, reads a
    judge's every picture before the next judge is loaded, and a probe would load all three first."""
    if cfg["route"] == "local":
        return []
    post = post or globals()["post"]
    dead = []
    for m in cfg["panel"]:
        try:
            text, _ = post(cfg, m, [{"type": "text", "text": PROBE}], max_tokens=64, **({"opener": opener, "sleep": sleep} if opener else {}))
            s = (text or "").strip()
            ok = False
            try:
                ok = json.loads(s[s.index("{"):s.rindex("}") + 1]).get("ok") is True
            except Exception:
                ok = False
            if not ok:
                dead.append(f"{m}: {'an empty reply' if not s else 'no valid answer (' + s[:80] + ')'}")
        except RuntimeError as e:
            dead.append(f"{m}: {e}")
    if dead:
        raise RouteError(f"the judges were asked one short question before the batch and {len(dead)} of {len(cfg['panel'])} gave no valid answer; nothing is scored with a dead judge:\n  " + "\n  ".join(dead) +
                         f"\n(route {cfg['route']}, panel {cfg.get('panelName')}, reasoning {cfg.get('reasoning', REASONING)})")
    return list(cfg["panel"])


def record(cfg, opener=None):
    """What every results file keeps about the judges: the panel by name, its models as this route serves them, and
    the settings they were read with. On the local route a panel model the server does not hold is an error."""
    sent = {m: sent_name(cfg, m) for m in cfg["panel"]}
    out = {"route": cfg["route"], "label": cfg["label"], "endpoint": cfg["host"], "panelName": cfg.get("panelName"), "panel": list(cfg["panel"]),
           "sentAs": sent, "reasoning": cfg.get("reasoning", REASONING)}
    if cfg["route"] == "local":
        held = local_route.digests({**cfg, "panel": list(sent.values())}, opener)
        out["digests"] = {m: held[sent[m]] for m in cfg["panel"]}
        out["options"] = {"reasoning": out["reasoning"], "think": SENT[out["reasoning"]]["think"], "temperature": 0}
    else:
        out["digests"] = None
        out["options"] = {"reasoning": out["reasoning"], "temperature": 0, **({"sent": {"reasoning": {"effort": SENT[out["reasoning"]]["effort"]}, "provider": {"zdr": True, "data_collection": "deny"}}} if cfg["route"] == "openrouter" else {})}
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
    body = json.dumps({"model": sent_name(cfg, model), "keep_alive": 0}).encode()
    opener(urllib.request.Request(cfg["url"] + "/api/generate", body, local_route._headers(cfg)), timeout=120).read()


def wait_turn(cfg, model, opener=None, sleep=time.sleep, say=print, every=30):
    """Wait while the local server holds any model other than `model`: another job is using it."""
    while True:
        other = [m for m in loaded(cfg, opener) if m != sent_name(cfg, model)]
        if not other:
            return
        say(f"waiting: the judge server holds {', '.join(other)} (another job); checking again in {every} s", flush=True)
        sleep(every)
