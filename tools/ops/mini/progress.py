#!/usr/bin/env python3
"""progress.py: writes <base>/progress/index.html, the run's progress page on the mini (served read-only over
Tailscale). Per wave: each session's state, its latest look or its final, its model cost and its
human-ness score once scored; the wave's cost against its cap; the pods up and today's pod spend; the disk.
Thumbnails are made with sips. Run every minute by launchd (com.sabj.unpaint-progress); reads, never starts anything."""
import hashlib, html, json, os, shutil, subprocess, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
CFG = json.loads((HERE / "config.json").read_text())
HOME = Path.home()
BASE = HOME / CFG["base"]; OUT = BASE / "progress"; TH = OUT / "thumbs"
NAMES = {"neon-m": "Neon", "carbon-m": "Carbon", "argon-m": "Argon", "sonnet-m": "Sonnet", "opus-m": "Opus", "wonderfull-m": "Wonder Full", "sol-m": "Sol", "terra-m": "Terra", "dry-rounds": "Stand-in"}
SHOW = {"running": "painting", "pending": "to start", "waiting for prepare": "waiting for Auto", "done": "done", "failed": "failed", "idle-ended": "ended: idle", "not run": "not run", "stopped": "stopped", "ended without a record": "ended, no record"}


def rd(p):
    try: return json.loads(Path(p).read_text())
    except Exception: return None


def alive(pid):
    try: os.kill(int(pid), 0); return True
    except PermissionError: return True
    except Exception: return False


def thumb(src):
    if not src or not Path(src).exists(): return None
    st = Path(src).stat(); name = hashlib.md5(f"{src}|{st.st_mtime_ns}".encode()).hexdigest()[:12] + ".jpg"
    out = TH / name
    if not out.exists():
        r = subprocess.run(["sips", "-s", "format", "jpeg", "-Z", "220", str(src), "--out", str(out)], capture_output=True)
        if r.returncode: return None
    return f"thumbs/{name}"


def latest_image(folder, status):
    f = Path(folder)
    if (f / "plate/painting.jpg").exists(): return f / "plate/painting.jpg"
    looks = sorted((f / "author/looks").glob("*/sheet.jpg"), key=lambda p: p.stat().st_mtime) if (f / "author/looks").exists() else []
    return looks[-1] if looks else None


def main():
    OUT.mkdir(parents=True, exist_ok=True); TH.mkdir(exist_ok=True)
    st = rd(BASE / "state/run.json"); pods = rd(BASE / "pool/pods.json") or {}; day = rd(BASE / "pool/day-spend.json") or {}
    scores = {p["id"]: p for p in (rd(BASE / "scores/hosted/results.json") or {}).get("paintings", [])}
    du = shutil.disk_usage(BASE); now = time.time(); used = set()
    e = html.escape; rows = []
    if not st:
        rows.append("<p>No wave has been started yet. Nothing is running.</p>")
    else:
        running = st.get("finished") is None and alive(st.get("pid"))
        rows.append(f"<p class=meta>Code {e(st['commit'][:8])} · started {time.strftime('%a %H:%M', time.localtime(st['started'] / 1000))} · "
                    + ("<b>running</b>" if running else f"ended {time.strftime('%a %H:%M', time.localtime((st.get('finished') or st.get('updated') or 0) / 1000))}{' (stopped)' if st.get('stoppedBy') else ''}") + "</p>")
        for name in st.get("order", st["waves"].keys()):
            w = st["waves"][name]; ss = list(w["sessions"].values())
            count = {}
            for s in ss: count[SHOW.get(s["status"], s["status"])] = count.get(SHOW.get(s["status"], s["status"]), 0) + 1
            rows.append(f"<h2>Wave {e(name)}</h2><p class=meta>Model cost ${w.get('cost', 0):.2f} of ${w['capUSD']}{' · <b>cap reached</b>' if w.get('capped') else ''} · "
                        + " · ".join(f"{v} {e(k)}" for k, v in sorted(count.items())) + (f" · held: {e(w['held'])}" if w.get('held') else "") + "</p>")
            if w.get("missing"): rows.append(f"<p class=meta>Not ready, not run: {e(', '.join(w['missing']))}</p>")
            pics = []; [pics.append(s["subject"]) for s in ss if s["subject"] not in pics]
            levels = []; [levels.append(s["level"]) for s in ss if s["level"] not in levels]
            models = []; [models.append(s["author"]) for s in ss if s["author"] not in models]
            for pic in pics:
                rows.append(f"<h3>{e(pic.replace('-qs', ''))}</h3><table><tr><th></th>" + "".join(f"<th>{e(l)}</th>" for l in levels) + "</tr>")
                for m in models:
                    cells = []
                    for l in levels:
                        s = w["sessions"].get(f"{m}-{pic}-{l}")
                        if not s: cells.append("<td></td>"); continue
                        folder = BASE / "runs" / s["folder"]; t = thumb(latest_image(folder, s["status"]))
                        if t: used.add(Path(t).name)
                        sc = scores.get(s["folder"], {}).get("human", {}) or {}
                        what = SHOW.get(s["status"], s["status"])
                        if s["status"] == "running" and s.get("waitingFinal"): what = "final waiting for a pod"
                        mins = f" {round((now * 1000 - s['started']) / 60000)} min" if s["status"] == "running" and s.get("started") else ""
                        cost = f" · ${s['costUSD']:.2f}" if s.get("costUSD") is not None else ""
                        hum = f" · human {sc['percent']:.0f}%" if sc.get("percent") is not None else ""
                        cells.append(f"<td class='{e(s['status'].split()[0])}' title='{e(s.get('why') or '')}'>" + (f"<img src='{t}'>" if t else "") + f"<div>{e(what)}{mins}{cost}{hum}</div></td>")
                    rows.append(f"<tr><th>{e(NAMES.get(m, m))}</th>{''.join(cells)}</tr>")
                rows.append("</table>")
    up = pods.get("pods", [])
    fresh = pods.get("updated") and now - pods["updated"] < 180
    rows.append(f"<h2>Machines</h2><p class=meta>Pods up: {len(up)}{' (daemon running)' if fresh else ' (daemon not running)'} · pod spend today ${day.get('spentToday', 0):.2f} of ${CFG['pods']['dayUSD']} · "
                f"disk free {du.free / 1e9:.0f} GB (sessions stop starting below {CFG['diskFloorGB']} GB)</p>")
    for p in up: rows.append(f"<p class=meta>{e(p['name'])}: {e(str(p.get('gpu')))}, {p.get('slots')} at once, ${p.get('rate')}/h, {round((now - p['created']) / 60)} min old</p>")
    try: ev = (BASE / "state/events.log").read_text().splitlines()[-25:]
    except Exception: ev = []
    rows.append("<h2>Latest events</h2><pre>" + e("\n".join(reversed(ev))) + "</pre>")
    for f in TH.glob("*.jpg"):
        if f.name not in used and now - f.stat().st_mtime > 3600: f.unlink()
    page = f"""<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><meta http-equiv=refresh content=60>
<title>Benchmark progress</title><style>
:root{{--bg:#fbfaf7;--fg:#222;--mut:#777;--line:#ddd;--ok:#e6f2e6;--bad:#f6e3e1;--run:#fff6dc}}
@media (prefers-color-scheme:dark){{:root{{--bg:#16171a;--fg:#e8e6e1;--mut:#999;--line:#333;--ok:#1d2e1f;--bad:#3a2220;--run:#3a3320}}}}
body{{background:var(--bg);color:var(--fg);font:14px -apple-system,system-ui,sans-serif;margin:0 auto;padding:16px;max-width:1200px}}
.meta{{color:var(--mut)}} table{{border-collapse:collapse;margin:4px 0 12px;display:block;overflow-x:auto}} td,th{{border:1px solid var(--line);padding:4px;vertical-align:top;font-size:12px}}
td img{{display:block;max-width:150px}} td.done{{background:var(--ok)}} td.failed,td.idle-ended,td.not{{background:var(--bad)}} td.running{{background:var(--run)}}
pre{{font-size:11px;white-space:pre-wrap}} h3{{margin:10px 0 2px}}</style>
<h1>Benchmark progress</h1><p class=meta>Updated {time.strftime('%a %d %b %H:%M:%S')} on the Mac mini. Refreshes every minute.</p>{''.join(rows)}"""
    (OUT / "index.html.tmp").write_text(page); (OUT / "index.html.tmp").replace(OUT / "index.html")


if __name__ == "__main__":
    main()
