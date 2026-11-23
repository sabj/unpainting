#!/usr/bin/env python3
"""0.4's scoring: every painting and its original, read by one judge panel, into results.json and SCORES.md.

  npm run bench:score04 -- RUN_FOLDER... | MANIFEST.json --out DIR

For each painting (s04_runs.py says what a run folder must hold):
  1 HUMAN-NESS, the main reading: twelve film snapshots and the finished sheet under the human-ness rubric
    (bench/docs/human-ness-rubric.md; its sha256 is written into the results), the mean of the twelve as % of 5,
    the thirds, the tally of tells, and the whole-sequence yes or no. No film: refused before any judge is called.
  2 QUALITY AND LIKENESS: the painting alone and its ORIGINAL alone, 0 to 10; the painting's share of the original's.
  3 COMBINED: two parts human-ness to one part quality (s04_table.WEIGHTS, written into the results).
  4 beside, never blended: the painter's cheat-risk record and progression, classic.py against the original, and the
    same figures adjusted for the subject's Auto painting among the inputs.
  5 the judge route is JUDGE_ROUTE (s04_judge.py): local by default, together or openrouter with their key.
  6 usage beside the score: each run's usage.json.
Three readings a judge; every picture for one judge before the next judge is loaded; on the local route the model is
unloaded after its readings, and the run waits while the server holds another job's model. Readings are kept in
DIR/readings/ and reused when the same judge, prompt and pictures were read before. Exit 0 complete, 1 written but a
reading is short of a judge (named under "Faults first"), 2 refused (nothing judged).
"""
import argparse, json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.dirname(os.path.dirname(HERE))
RUBRIC = os.path.join(REPO, "bench", "docs", "human-ness-rubric.md")
SERIES = "0.4 scores are a new series: not comparable with the V1 to V5 rounds (J1, J2) or with a different judge label."

import s04_judge, s04_readings as R, s04_runs, s04_table as T  # noqa: E402

SEQ_CTX, SEQ_TOKENS = 16384, 3000   # thirteen pictures need a longer window than the scorer's 8,192
ONE_CTX, ONE_TOKENS = 8192, 1024
SNAP_PX, ONE_PX = 640, 768


def file_sha(p):
    with open(p, "rb") as fh:
        return R.sha(fh.read())


def write(path, text):
    with open(path, "w") as fh:
        fh.write(text)


def read_json(path):
    with open(path) as fh:
        return json.load(fh)


class Job:
    """One reading of one picture (or sequence) by every judge, three times each."""
    def __init__(self, key, kind, images, text_of, ctx, tokens, parse, data_uri):
        self.key, self.kind, self.images, self.ctx, self.tokens, self.parse = key, kind, images, ctx, tokens, parse
        self.text_of, self.data_uri, self._content = text_of, data_uri, None
        self.imagesSha = R.sha("".join(file_sha(f) for f, _ in images))
        self.promptSha = R.sha("".join(t for t in text_of))

    def content(self):
        if self._content is None:
            c = []
            for t, (f, px) in zip(self.text_of, self.images):
                c += [{"type": "text", "text": t}, {"type": "image_url", "image_url": {"url": self.data_uri(f, px)}}]
            self._content = c
        return self._content


def jobs_for(paintings, originals, rubric, data_uri):
    out = []
    for e in paintings:
        snaps = e["snapshots"]
        head = R.SEQ.format(rubric=rubric, n=len(snaps), style=e["style"])
        texts = [head + f"\nSnapshot 1: {snaps[0][1]}% complete"] + [f"Snapshot {k + 1}: {p}% complete" for k, (_, p) in enumerate(snaps) if k]
        out.append(Job(e["id"], "sequence", [(f, SNAP_PX) for f, _ in snaps], texts, SEQ_CTX, SEQ_TOKENS, lambda raw, n=len(snaps): R.parse_sequence(raw, n), data_uri))
        out.append(Job(e["id"], "single", [(e["painting"], ONE_PX)], [R.SINGLE.format(style=e["style"])], ONE_CTX, ONE_TOKENS, R.parse_single, data_uri))
    for sid, o in originals.items():
        out.append(Job("original--" + sid, "single", [(o["target"], ONE_PX)], [R.SINGLE.format(style=o["style"])], ONE_CTX, ONE_TOKENS, R.parse_single, data_uri))
    return out


def read_all(jobs, cfg, judge, out, say=print):
    """{(key, kind): {model: [readings]}}, every job for one judge before the next is loaded."""
    got = {}
    for m in cfg["panel"]:
        judge.wait_turn(cfg, m)
        tag = m.replace(":", "_").replace("/", "_")
        for jb in jobs:
            d = os.path.join(out, "readings", jb.key)
            os.makedirs(d, exist_ok=True)
            for k in range(1, R.READINGS + 1):
                f = os.path.join(d, f"{jb.kind}-{tag}-{k}.json")
                old = read_json(f) if os.path.isfile(f) else None
                if not (old and old.get("ok") and old.get("promptSha") == jb.promptSha and old.get("imagesSha") == jb.imagesSha):
                    t = time.time()
                    r, why = R.ask(lambda model, c: judge.post(cfg, model, c, max_tokens=jb.tokens, num_ctx=jb.ctx), m, jb.content(), jb.parse)
                    old = {"ok": bool(r), "judge": m, "kind": jb.kind, "promptSha": jb.promptSha, "imagesSha": jb.imagesSha, "seconds": round(time.time() - t, 1), **(r or {"error": why})}
                    write(f, json.dumps(old, indent=1))
                    score = (old.get("overall") if jb.kind == "single" else [s["score"] for s in old["snapshots"]]) if r else f"FAILED {why}"
                    say(time.strftime("%H:%M:%S"), jb.key, jb.kind, m, k, score, f"{old['seconds']} s", flush=True)
                got.setdefault((jb.key, jb.kind), {}).setdefault(m, []).append(old if old.get("ok") else None)
        judge.unload(cfg, m)
    return got


def cheat_summary(c):
    if not c:
        return None
    return {k: c.get(k) for k in ("risk", "level", "review", "hfCorr", "hfCeiling", "strokes", "strokeCeiling", "smallShare", "parts", "prog")}


def main(argv=None, judge=s04_judge, env=None, say=print):
    ap = argparse.ArgumentParser(prog="bench:score04", description="0.4's scoring: human-ness, quality and likeness, combined; anti-cheat, algorithmic, Auto adjustment and usage beside.")
    ap.add_argument("inputs", nargs="+", help="run folders, or a manifest .json listing them")
    ap.add_argument("--out", required=True, help="folder for results.json, SCORES.md and the kept readings")
    a = ap.parse_args(argv)
    try:
        cfg = judge.settings(env)
        rubric, rubric_sha = R.load_rubric(RUBRIC)
        paintings = s04_runs.entries(a.inputs)
        bad = []
        for e in paintings:
            try:
                e["snapshots"] = R.snapshots(e["painting"])
            except R.Refusal as x:
                bad.append(f"{e['id']}: {x}")
        if bad:
            raise R.Refusal("\n".join(bad))
        jrec = judge.record(cfg)
    except (s04_judge.RouteError, R.Refusal, RuntimeError) as x:
        print("bench:score04 refused, nothing was judged:\n" + str(x), file=sys.stderr)
        return 2
    import score_painting as SP  # classic.py's measurements and the scorer's picture preparation
    from common import load_rgb
    os.makedirs(a.out, exist_ok=True)
    originals = {}
    for e in paintings:
        originals.setdefault(e["subject"], {"target": e["target"], "style": e["style"]})
        if originals[e["subject"]]["target"] != e["target"]:
            print(f"bench:score04 refused: {e['id']} names a different original for {e['subject']} than another painting does", file=sys.stderr)
            return 2
        t, p = s04_runs.sized(e["target"], e["painting"], os.path.join(a.out, "sized"), e["id"])
        e["classic"] = SP.classic_scores(t, p)
    data_uri = lambda f, px: SP.data_uri(load_rgb(f), px)
    got = read_all(jobs_for(paintings, originals, rubric, data_uri), cfg, judge, a.out, say)
    faults, rows = [], []
    for e in paintings:
        h = R.human(got[(e["id"], "sequence")], cfg["panel"])
        q = R.quality(got[(e["id"], "single")], cfg["panel"])
        faults += [f"{e['id']}, human-ness: {x}" for x in h["faults"]] + [f"{e['id']}, quality: {x}" for x in q["faults"]]
        rows.append({**{k: e[k] for k in ("id", "label", "subject", "auto", "author", "commit", "folder", "painting", "target", "style", "classic", "usage")},
                     "snapshots": [{"file": f, "pct": p} for f, p in e["snapshots"]], "human": h, "quality": q, "cheat": cheat_summary(e["cheat"])})
    for sid, o in originals.items():
        o["quality"] = R.quality(got[("original--" + sid, "single")], cfg["panel"])
        faults += [f"original of {sid}, quality: {x}" for x in o["quality"]["faults"]]
    T.derive(rows, originals)
    res = {"schema": "unpaint-bench/score04@1", "written": time.strftime("%Y-%m-%d %H:%M"), "series": SERIES, "judge": jrec,
           "rubric": {"path": os.path.relpath(RUBRIC, REPO), "sha256": rubric_sha}, "prompts": R.prompt_hashes(rubric),
           "weights": dict(T.WEIGHTS), "readings": R.READINGS, "snapshots": R.SNAPSHOTS, "faults": faults, "originals": originals, "paintings": rows}
    write(os.path.join(a.out, "results.json"), json.dumps(res, indent=1))
    write(os.path.join(a.out, "SCORES.md"), T.markdown(res))
    say("written", os.path.join(a.out, "results.json"), "and SCORES.md" + (f"; {len(faults)} faults: " + "; ".join(faults) if faults else ""), flush=True)
    return 1 if faults else 0


if __name__ == "__main__":
    sys.exit(main())
