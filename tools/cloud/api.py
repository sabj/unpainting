#!/usr/bin/env python3
"""Tiny provider client. Keys come from the environment, or from the .env file named by UNPAINTING_ENV_FILE
(default: .env at the repository root, which git ignores). They never go on argv.
  api.py hc METHOD /path [json-body]        Hetzner Cloud
  api.py rp-gql "<graphql query>"            RunPod GraphQL
  api.py rp METHOD /path [json-body]        RunPod REST (rest.runpod.io/v1)
"""
import json, os, sys, urllib.request, urllib.error
from pathlib import Path
ENV_FILE = Path(os.environ.get("UNPAINTING_ENV_FILE", Path(__file__).resolve().parents[2]/".env"))
def env(k):
    if os.environ.get(k): return os.environ[k]
    if ENV_FILE.exists():
        for l in ENV_FILE.read_text().splitlines():
            if l.startswith(k+"="): return l.split("=",1)[1].strip().strip("\"").strip("\x27")
    raise SystemExit(k+" missing: set it in the environment or in "+str(ENV_FILE))
def call(url, method="GET", body=None, headers=None):
    h = dict(headers or {}); h["User-Agent"]="painter-cloud/1"
    data = json.dumps(body).encode() if body is not None else None
    if data: h["Content-Type"]="application/json"
    r = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as x: t=x.read().decode()
    except urllib.error.HTTPError as e: t=e.read().decode()
    try: return json.loads(t)
    except Exception: return t
def hc(method, path, body=None):
    return call("https://api.hetzner.cloud/v1"+path, method, body, {"Authorization":"Bearer "+env("HCLOUD_TOKEN")})
def rp(method, path, body=None):
    return call("https://rest.runpod.io/v1"+path, method, body, {"Authorization":"Bearer "+env("RUNPOD_API_KEY")})
def rpgql(q):
    return call("https://api.runpod.io/graphql", "POST", {"query":q}, {"Authorization":"Bearer "+env("RUNPOD_API_KEY")})
if __name__=="__main__":
    a=sys.argv[1:]
    if a[0]=="hc": out=hc(a[1],a[2],json.loads(a[3]) if len(a)>3 else None)
    elif a[0]=="rp": out=rp(a[1],a[2],json.loads(a[3]) if len(a)>3 else None)
    else: out=rpgql(a[1])
    print(json.dumps(out,indent=1))
