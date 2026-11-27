#!/usr/bin/env python3
"""0.4's scoring: every painting and its original, read by one judge panel, into results.json and SCORES.md.

  npm run bench:score04 -- RUN_FOLDER... | MANIFEST.json --out DIR [--snapshots progress10|film13] [--fresh] [--repeat N] [--concurrency N]

For each painting (s04_runs.py says what a run folder must hold):
  1 HUMAN-NESS, the main reading, from the film under the human-ness rubric (bench/docs/human-ness-rubric.md; its
    sha256 is written into the results). --snapshots names what the judges are shown (s04_readings.SCHEMES):
    progress10, the default: the opening paper (not scored), the drawing frame (the last before the first wash; scored
    and reported, not in the mean; absent when nothing was drawn first), ten stills of the painting in progress from
    the first wash to just before the finish, whose mean is human-ness, and the finished sheet (scored and reported,
    not in the mean). The ten are placed by measured progress (the share of the finished picture on the sheet), not
    by frame number, so recording density and strokes that leave no mark cannot move them. film13: the first scheme
    (twelve by frame number through the whole film, then the finished sheet), so an old film can be scored the old
    way. THE TWO ARE NOT COMPARABLE: results.json and SCORES.md name the scheme. The same pictures go to every judge
    route, local or hosted. Also the thirds, the tally of tells and the whole-sequence yes or no. No film, or a film
    that does not say where its first wash is: refused before any judge is called.
  2 QUALITY: the painting alone and its ORIGINAL alone, 0 to 10, read the same way; the painting's share of the
    original's. The judge of a painting's quality never sees its original.
  3 COMBINED: two parts human-ness to one part quality (s04_table.WEIGHTS, written into the results).
  3b LIKENESS, in its own column and NOT in the combined figure: the original and the finished painting shown together,
    how well the painting is a painting of that picture, 1 to 5 with a reason. At the bottom of the scale it is flagged.
  4 beside, never blended: the painter's cheat-risk record and progression, classic.py against the original, and the
    same figures adjusted for the subject's Auto painting among the inputs.
  5 the judges are ONE named panel on every route (s04_judge.py: JUDGE_PANEL, open3 by default, reasoning low); the
    route is JUDGE_ROUTE: local by default, openrouter or together with their key. Panel, route and settings are
    written into results.json; a judge that reasoned although the setting is off is named under "Faults first".
  6 usage beside the score: each run's usage.json.
Three readings a judge. On the local route every picture for one judge before the next judge is loaded, one reading
at a time; the model is unloaded after its readings, and the run waits while the server holds another job's model.
On a hosted route every judge reads at once, up to --concurrency N readings in flight for each (default 8; a busy
server's 429 or 5xx is retried with backoff). results.json and SCORES.md are rewritten (whole, never half-written) as
each painting completes, marked "inProgress" until the last. Readings are kept in
DIR/readings/ and reused only when everything that could change a reply is the same (cache_key: panel, route,
endpoint, the judge as named and as served, its digest, the options sent, the rubric, the prompt, the pictures and
their sizes, the repeat). --fresh reads everything again. --repeat N scores the same paintings a further time, kept
apart (readings/.../rN, results-repeat-N.json, SCORES-repeat-N.md), for a noise measurement: two repeats never share
a reading. Exit 0 complete, 1 written but a reading is short of a judge (named under "Faults first"), 2 refused
(nothing judged).
"""
import argparse, json, os, sys, threading, time
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.dirname(os.path.dirname(HERE))
RUBRIC = os.path.join(REPO, "bench", "docs", "human-ness-rubric.md")
SERIES = "0.4 scores are a new series: not comparable with the V1 to V5 rounds (J1, J2) or with a different judge label."
SCHEME_NOTE = {
    "progress10": "Human-ness here is the mean of ten stills of the painting in progress, at equal steps of measured progress from the first wash to just before the finish; the finished sheet is scored beside and not counted (scheme progress10). It is NOT comparable with human-ness scored under film13 (twelve frames by frame number through the whole film) or under the withdrawn wash10.",
    "film13": "Human-ness here is scored the first way (scheme film13: twelve frames by frame number through the whole film, the finished sheet shown and not counted). It is NOT comparable with scores under progress10, the scheme of 0.4.",
}

import s04_judge, s04_readings as R, s04_runs, s04_table as T  # noqa: E402

SEQ_CTX, SEQ_TOKENS = 16384, 3000   # up to fourteen pictures (film13: opening, twelve, finished; progress10: opening, drawing, ten, finished) need a longer window than the scorer's 8,192
ONE_CTX, ONE_TOKENS = 8192, 1024
SNAP_PX, ONE_PX = 640, 768   # the long side each picture is brought down to: film stills, and a picture read alone or beside its original
CONCURRENCY = 8   # hosted route: readings in flight at once for each judge (--concurrency); the local route reads one at a time


def file_sha(p):
    with open(p, "rb") as fh:
        return R.sha(fh.read())


def write(path, text):
    """Written whole or not at all: a page reading the file while it is rewritten sees the old one or the new one."""
    tmp = f"{path}.{os.getpid()}.{threading.get_ident()}.tmp"
    with open(tmp, "w") as fh:
        fh.write(text)
    os.replace(tmp, path)


def read_json(path):
    with open(path) as fh:
        return json.load(fh)


class Job:
    """One reading of one picture (or sequence) by every judge, three times each."""
    def __init__(self, key, kind, images, text_of, ctx, tokens, parse, data_uri):
        self.key, self.kind, self.images, self.ctx, self.tokens, self.parse = key, kind, images, ctx, tokens, parse
        self.text_of, self.data_uri, self._content, self._lock = text_of, data_uri, None, threading.Lock()
        self.imagesSha = R.sha("".join(file_sha(f) for f, _ in images))
        self.promptSha = R.sha("".join(t for t in text_of))
        self.options = {"ctx": ctx, "maxTokens": tokens, "longSidePx": [px for _, px in images]}

    def content(self):
        with self._lock:   # several readings of one job may be in flight at once: the pictures are encoded once
            if self._content is None:
                c = []
                for t, (f, px) in zip(self.text_of, self.images):
                    c += [{"type": "text", "text": t}, {"type": "image_url", "image_url": {"url": self.data_uri(f, px)}}]
                self._content = c
            return self._content


def jobs_for(paintings, originals, rubric, data_uri, quality_mode="blind"):
    """Every job, painting by painting: Auto's first (the others are adjusted against it), each painting's three
    jobs, and its original's quality just after the first painting of it, so a painting can be complete early."""
    out, seen = [], set()
    for e in sorted(paintings, key=lambda e: not e.get("auto")):
        sid = e.get("original")
        if quality_mode == "blind" and sid in originals and sid not in seen:
            seen.add(sid)
            o = originals[sid]
            out.append(Job("original--" + sid, "single", [(o["target"], ONE_PX)], [R.SINGLE.format(style=o["style"])], ONE_CTX, ONE_TOKENS, R.parse_single, data_uri))
        # the scored pictures in the order shown: the drawing frame first when the scheme has one, then the snapshots
        snaps = ([e["drawing"]] if e.get("drawing") else []) + e["snapshots"]
        head = R.sequence_prompt(e.get("scheme", "film13"), rubric, e["style"], len(snaps), bool(e.get("drawing")))
        said = "% of the finished picture on the sheet" if e.get("scheme") == "progress10" else "% complete"
        texts = [head + "\nOpening: the untouched paper (not scored)"] + [f"Snapshot {k + 1}: {p}{said}" for k, (_, p) in enumerate(snaps)]
        out.append(Job(e["id"], "sequence", [(e["opening"], SNAP_PX)] + [(f, SNAP_PX) for f, _ in snaps], texts, SEQ_CTX, SEQ_TOKENS, lambda raw, n=len(snaps): R.parse_sequence(raw, n), data_uri))
        if quality_mode == "anchored":
            out.append(Job(e["id"], "single", [(e["target"], ONE_PX), (e["painting"], ONE_PX)],
                           [R.QUALITY_ANCHORED.format(style=e["style"]) + "\nImage 1 (9.0/10 REFERENCE STANDARD):", "Image 2 (CANDIDATE PAINTING TO SCORE):"],
                           ONE_CTX, ONE_TOKENS, R.parse_anchored, data_uri))
        else:
            out.append(Job(e["id"], "single", [(e["painting"], ONE_PX)], [R.SINGLE.format(style=e["style"])], ONE_CTX, ONE_TOKENS, R.parse_single, data_uri))
        out.append(Job(e["id"], "likeness", [(e["target"], ONE_PX), (e["painting"], ONE_PX)], [R.LIKENESS.format(style=e["style"]) + "\nThe original:", "The painting made of it:"], ONE_CTX, ONE_TOKENS, R.parse_likeness, data_uri))
    if quality_mode == "blind":
        for sid, o in originals.items():
            if sid not in seen:
                out.append(Job("original--" + sid, "single", [(o["target"], ONE_PX)], [R.SINGLE.format(style=o["style"])], ONE_CTX, ONE_TOKENS, R.parse_single, data_uri))
    return out


def cache_key(jb, model, jrec, rubric_sha, repeat):
    """The sha256 a kept reading is reused under: everything that could change the reply. A reading kept under any
    other panel, route, endpoint, served name, digest, option, rubric, prompt, picture, picture size or repeat is not
    this reading."""
    return R.sha(json.dumps({"kind": jb.kind, "panel": jrec.get("panelName"), "label": jrec.get("label"), "route": jrec.get("route"), "endpoint": jrec.get("endpoint"),
                             "judges": jrec.get("panel"), "judge": model, "servedAs": (jrec.get("sentAs") or {}).get(model, model),
                             "digest": (jrec.get("digests") or {}).get(model), "options": jrec.get("options"), "reasoning": jrec.get("reasoning"),
                             "rubric": rubric_sha, "prompt": jb.promptSha, "images": jb.imagesSha, "job": jb.options, "readings": R.READINGS, "repeat": repeat}, sort_keys=True))


def read_all(jobs, cfg, judge, out, say=print, jrec=None, rubric_sha=None, fresh=False, repeat=1, concurrency=CONCURRENCY, on_done=None, got=None):
    """{(key, kind): {model: [readings in order 1..READINGS]}}. A kept reading is reused only under the same
    cache_key; `fresh` reads everything again; `repeat` > 1 is a further scoring kept apart. `on_done(key, kind)` is
    called (on this thread) as soon as a job has every reading of every judge; `got`, when given, is the dict filled
    (so on_done can read the readings so far).

    Local route: one model in memory at a time, so every job for one judge before the next is loaded, one reading
    after another. Hosted route: every judge at once, up to `concurrency` readings in flight for each judge; the
    readings land in the same files under the same keys, and the result does not depend on the order they came back."""
    jrec = jrec or {}
    slots = {} if got is None else got
    slots.update({(jb.key, jb.kind): {m: [None] * R.READINGS for m in cfg["panel"]} for jb in jobs})
    left = {(jb.key, jb.kind): len(cfg["panel"]) * R.READINGS for jb in jobs}

    def tasks(m):
        tag = m.replace(":", "_").replace("/", "_")
        for jb in jobs:
            d = os.path.join(out, "readings", jb.key, *([f"r{repeat}"] if repeat > 1 else []))
            os.makedirs(d, exist_ok=True)
            key = cache_key(jb, m, jrec, rubric_sha, repeat)
            for k in range(1, R.READINGS + 1):
                f = os.path.join(d, f"{jb.kind}-{tag}-{k}.json")
                old = read_json(f) if os.path.isfile(f) and not fresh else None
                yield jb, k, f, key, (old if old and old.get("ok") and old.get("cacheKey") == key else None)

    def read(jb, m, k, f, key):
        t = time.time()
        r, why = R.ask(lambda model, c: judge.post(cfg, model, c, max_tokens=jb.tokens, num_ctx=jb.ctx), m, jb.content(), jb.parse)
        new = {"ok": bool(r), "judge": m, "kind": jb.kind, "cacheKey": key, "repeat": repeat, "promptSha": jb.promptSha, "imagesSha": jb.imagesSha, "seconds": round(time.time() - t, 1), **(r or {"error": why})}
        write(f, json.dumps(new, indent=1))
        return new

    def land(jb, m, k, rd, fresh_read):
        if fresh_read:
            score = (rd.get("overall") if jb.kind == "single" else rd.get("likeness") if jb.kind == "likeness" else [s["score"] for s in rd["snapshots"]]) if rd["ok"] else f"FAILED {rd.get('error')}"
            say(time.strftime("%H:%M:%S"), jb.key, jb.kind, m, k, score, f"{rd['seconds']} s", flush=True)
        slots[(jb.key, jb.kind)][m][k - 1] = rd if rd.get("ok") else None
        left[(jb.key, jb.kind)] -= 1
        if not left[(jb.key, jb.kind)] and on_done:
            on_done(jb.key, jb.kind)

    if cfg["route"] == "local":
        for m in cfg["panel"]:
            judge.wait_turn(cfg, m)
            for jb, k, f, key, kept in tasks(m):
                land(jb, m, k, kept or read(jb, m, k, f, key), not kept)
            judge.unload(cfg, m)
    else:
        pools = {m: ThreadPoolExecutor(max_workers=max(1, concurrency), thread_name_prefix="judge") for m in cfg["panel"]}
        try:
            pending = {}
            # the kept readings land first, in order; then every reading still wanted goes into its judge's pool,
            # job by job, so the paintings first in the list are the first to be complete
            for m in cfg["panel"]:
                for jb, k, f, key, kept in tasks(m):
                    if kept:
                        land(jb, m, k, kept, False)
                    else:
                        pending[(jb, m, k)] = (f, key)
            order = sorted(pending, key=lambda t: (jobs.index(t[0]), t[2], cfg["panel"].index(t[1])))
            futs = {pools[m].submit(read, jb, m, k, *pending[(jb, m, k)]): (jb, m, k) for jb, m, k in order}
            for fu in as_completed(futs):
                jb, m, k = futs[fu]
                land(jb, m, k, fu.result(), True)
        finally:
            for p in pools.values():
                p.shutdown(wait=True, cancel_futures=True)
    return slots


def cheat_summary(c):
    if not c:
        return None
    return {k: c.get(k) for k in ("risk", "level", "review", "hfCorr", "hfCeiling", "strokes", "strokeCeiling", "smallShare", "parts", "prog")}


def main(argv=None, judge=s04_judge, env=None, say=print):
    ap = argparse.ArgumentParser(prog="bench:score04", description="0.4's scoring: human-ness, quality, combined; likeness in its own column; anti-cheat, algorithmic, Auto adjustment and usage beside.")
    ap.add_argument("inputs", nargs="+", help="run folders, or a manifest .json listing them")
    ap.add_argument("--out", required=True, help="folder for results.json, SCORES.md and the kept readings")
    ap.add_argument("--snapshots", default=R.DEFAULT_SCHEME, choices=sorted(R.SCHEMES) + sorted(R.GONE), metavar="{" + ",".join(sorted(R.SCHEMES)) + "}", help="what the judges are shown: progress10 (default: opening, drawing frame, ten stills in progress placed by measured progress, the finished sheet beside) or film13 (the first scheme: opening, twelve by frame number, the finished sheet). Scores under one are not comparable with the other")
    ap.add_argument("--fresh", action="store_true", help="read every picture again: no kept reading is reused (the new readings replace the kept ones)")
    ap.add_argument("--repeat", type=int, default=1, metavar="N", help="score the same paintings a further time, kept apart from repeat 1 (results-repeat-N.json, SCORES-repeat-N.md): for measuring the judges' noise")
    ap.add_argument("--concurrency", type=int, default=CONCURRENCY, metavar="N", help=f"hosted route: readings in flight at once for each judge, every judge at once (default {CONCURRENCY}). The local route holds one model at a time and reads one reading after another")
    ap.add_argument("--quality-mode", default="blind", choices=R.QUALITY_MODES, help="quality judging mode: blind (0.4 single image vs original share) or anchored (0.5.1 reference=9.0 harsh craft scale, Q = 10 x overall)")
    ap.add_argument("--combined-mode", default="weighted", choices=T.COMBINED_MODES, help="combined formula: weighted (0.4 2:1 H:Q) or gated (0.5.1 Q * min(1, H / 65))")
    a = ap.parse_args(argv)
    if a.repeat < 1:
        ap.error("--repeat is 1 or more")
    if a.concurrency < 1:
        ap.error("--concurrency is 1 or more")
    try:
        cfg = judge.settings(env)
        rubric, rubric_sha = R.load_rubric(RUBRIC)
        everything = s04_runs.entries(a.inputs)
        # a run that failed is kept and counted (never judged, never dropped); the paintings are judged
        paintings, failed = [e for e in everything if not e.get("failed")], [e for e in everything if e.get("failed")]
        bad = []
        for e in paintings:
            try:
                shown = R.frames_for(e["painting"], a.snapshots)
                e.update(scheme=a.snapshots, snapshots=shown["snapshots"], opening=shown["opening"], drawing=shown["drawing"], firstWash=shown["firstWash"], frames=shown["frames"])
            except R.Refusal as x:
                bad.append(f"{e['id']}: {x}")
        if bad:
            raise R.Refusal("\n".join(bad))
        jrec = judge.record(cfg)
        # every judge answers one short question before anything is read (s04_judge.probe): a dead judge stops the batch here
        if getattr(judge, "probe", None):
            judge.probe(cfg)
    except (s04_judge.RouteError, R.Refusal, RuntimeError) as x:
        print("bench:score04 refused, nothing was judged:\n" + str(x), file=sys.stderr)
        return 2
    import score_painting as SP  # classic.py's measurements and the scorer's picture preparation
    from common import load_rgb
    os.makedirs(a.out, exist_ok=True)
    # each painting is measured against the original it was painted from. One file a subject is the rule; level 1's
    # target is its own file of the same picture (the sheet's size), so it is read as an original of its own, named.
    originals, shas = {}, {}
    for e in paintings:
        h = file_sha(e["target"])
        key = next((k for k, v in shas.items() if v == h and originals[k]["subject"] == e["subject"]), None)
        if key is None:
            key = e["subject"] if e["subject"] not in originals else f"{e['subject']} ({'level 1 target' if e['level'] == 'L1' else 'another file'} {h[:8]})"
            originals[key] = {"subject": e["subject"], "target": e["target"], "style": e["style"], "sha256": h}
            shas[key] = h
        e["original"] = key
        t, p = s04_runs.sized(e["target"], e["painting"], os.path.join(a.out, "sized"), e["id"])
        e["classic"] = SP.classic_scores(t, p)
    data_uri = lambda f, px: SP.data_uri(load_rgb(f), px)
    names = ("results.json", "SCORES.md") if a.repeat == 1 else (f"results-repeat-{a.repeat}.json", f"SCORES-repeat-{a.repeat}.md")
    done, written = set(), set()
    whole = lambda e: ({(e["id"], "sequence"), (e["id"], "single"), (e["id"], "likeness")} | (set() if a.quality_mode == "anchored" else {("original--" + e["original"], "single")})) <= done

    def on_done(key, kind):
        # results.json and SCORES.md are rewritten as each painting completes, so a page can show the scores as they come
        done.add((key, kind))
        now = [e for e in paintings if e["id"] not in written and whole(e)]
        if now and len(written) + len(now) < len(paintings):
            written.update(e["id"] for e in now)
            ready = [e for e in paintings if e["id"] in written]
            res, faults = results(a, cfg, jrec, rubric, rubric_sha, ready, failed, {k: v for k, v in originals.items() if a.quality_mode == "anchored" or ("original--" + k, "single") in done}, got)
            res["inProgress"] = {"paintingsScored": len(ready), "of": len(paintings), "note": "scoring is still running: this file is rewritten as each painting completes"}
            write(os.path.join(a.out, names[0]), json.dumps(res, indent=1))
            write(os.path.join(a.out, names[1]), T.markdown(res))
            say("so far", os.path.join(a.out, names[0]), f"{len(ready)} of {len(paintings)} paintings scored", flush=True)

    got = {}
    read_all(jobs_for(paintings, originals, rubric, data_uri, quality_mode=a.quality_mode), cfg, judge, a.out, say, jrec=jrec, rubric_sha=rubric_sha, fresh=a.fresh, repeat=a.repeat, concurrency=a.concurrency, on_done=on_done, got=got)
    res, faults = results(a, cfg, jrec, rubric, rubric_sha, paintings, failed, originals, got)
    write(os.path.join(a.out, names[0]), json.dumps(res, indent=1))
    write(os.path.join(a.out, names[1]), T.markdown(res))
    say("written", os.path.join(a.out, names[0]), "and " + names[1] + (f"; {len(failed)} failed runs counted" if failed else "") + (f"; {len(faults)} faults: " + "; ".join(faults) if faults else ""), flush=True)
    return 1 if faults else 0


def results(a, cfg, jrec, rubric, rubric_sha, paintings, failed, originals, got):
    """(the results document, its faults) for these paintings and originals from the readings in `got`."""
    qmode = getattr(a, "quality_mode", "blind")
    cmode = getattr(a, "combined_mode", "weighted")
    crit = R.ANCHORED_CRITERIA if qmode == "anchored" else R.CRITERIA
    faults, rows = [], []
    for e in paintings:
        h = R.human(got[(e["id"], "sequence")], cfg["panel"], a.snapshots, bool(e["drawing"]))
        q = R.quality(got[(e["id"], "single")], cfg["panel"], criteria=crit)
        lk = R.likeness(got[(e["id"], "likeness")], cfg["panel"])
        faults += [f"{e['id']}, human-ness: {x}" for x in h["faults"]] + [f"{e['id']}, quality: {x}" for x in q["faults"]] + [f"{e['id']}, likeness: {x}" for x in lk["faults"]]
        rows.append({**{k: e[k] for k in ("id", "label", "subject", "auto", "author", "level", "original", "commit", "folder", "painting", "target", "style", "classic", "usage")}, "failed": None,
                     "opening": e["opening"], "drawingFrame": {"file": e["drawing"][0], "pct": e["drawing"][1]} if e["drawing"] else None, "firstWash": e["firstWash"],
                     "snapshots": [{"file": f, "pct": p, **({"frame": e["frames"][k]} if k < len(e["frames"]) else {"finished": True})} for k, (f, p) in enumerate(e["snapshots"])], "human": h, "quality": q, "likeness": lk, "cheat": cheat_summary(e["cheat"])})
    for sid, o in originals.items():
        if qmode == "anchored":
            o["quality"] = {"score": 9.0, "judges": {}, "criteria": None, "spread": 0.0, "anchored": True, "faults": []}
        else:
            o["quality"] = R.quality(got[("original--" + sid, "single")], cfg["panel"])
            faults += [f"original of {sid}, quality: {x}" for x in o["quality"]["faults"]]
    # the failed runs: rows with no reading, counted as failures by the table and the summary
    none_h = {"percent": None, "meanOf5": None, "thirds": None, "perSnapshot": None, "drawing": None, "finished": None, "tells": {}, "yes": 0, "of": 0, "why": None, "judges": {}, "faults": []}
    for e in failed:
        rows.append({**{k: e.get(k) for k in ("id", "label", "subject", "auto", "author", "level", "commit", "folder", "painting", "target", "style", "usage")}, "original": None, "classic": None,
                     "failed": e["failed"], "opening": None, "drawingFrame": None, "firstWash": None, "snapshots": [], "human": dict(none_h),
                     "quality": {"score": None, "judges": {}, "criteria": None, "spread": None, "faults": []}, "likeness": {"score": None, "judges": {}, "why": None, "flagged": None, "faults": []}, "cheat": None})
    # the panel's one reasoning setting is off: a judge whose route reports reasoning tokens all the same is named
    if jrec.get("reasoning") == "off":
        for m in cfg["panel"]:
            n = sum(1 for by in list(got.values()) for r in by.get(m, []) if r and r.get("reasoningTokens"))
            if n:
                faults.append(f"{m} reasoned in {n} readings although the panel's reasoning setting is off: its figures are not read as the panel's other routes read them")
    T.derive(rows, originals, quality_mode=qmode, combined_mode=cmode)
    series = SERIES + " " + SCHEME_NOTE[a.snapshots]
    if qmode == "anchored" or cmode == "gated":
        series = f"0.5.1 series (qualityMode={qmode}, combinedMode={cmode}): NOT comparable with 0.4 or 0.5 blind scores. " + SCHEME_NOTE[a.snapshots]
    res = {"schema": "unpaint-bench/score04@1", "written": time.strftime("%Y-%m-%d %H:%M"), "series": series, "judge": jrec,
           "qualityMode": qmode, "combinedMode": cmode, "gateFloor": T.GATE_FLOOR if cmode == "gated" else None,
           "rubric": {"path": os.path.relpath(RUBRIC, REPO), "sha256": rubric_sha}, "prompts": R.prompt_hashes(rubric, a.snapshots, quality_mode=qmode),
           "weights": dict(T.WEIGHTS), "readings": R.READINGS, "repeat": a.repeat, "fresh": bool(a.fresh), "snapshots": R.SCHEMES[a.snapshots]["count"], "snapshotScheme": {**R.SCHEMES[a.snapshots], "note": SCHEME_NOTE[a.snapshots]}, "pictureLongSidePx": {"stills": SNAP_PX, "alone": ONE_PX, "likeness": ONE_PX}, "faults": faults, "failedRuns": [{"id": e["id"], "subject": e["subject"], "author": e["author"], "level": e["level"], "why": e["failed"]} for e in failed], "originals": originals, "paintings": rows}
    return res, faults


if __name__ == "__main__":
    sys.exit(main())
