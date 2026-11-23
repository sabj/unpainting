"""0.4's scoring (score04.py and its s04_* modules) with a stub judge: no model is called.
   python3 bench/scorer/score04-test.py"""
import io, json, os, sys, tempfile, unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

import s04_judge as J  # noqa: E402
import s04_readings as R  # noqa: E402
import s04_runs  # noqa: E402
import s04_table as T  # noqa: E402

PANEL = ["j1", "j2", "j3"]


def seq_reading(scores, human=True, tells=("c",)):
    return {"human": human, "why": "w", "snapshots": [{"score": s, "tells": list(tells), "note": ""} for s in scores]}


def picture(path, seed, size=(60, 80)):
    rng = np.random.default_rng(seed)
    Image.fromarray(rng.integers(0, 255, (size[1], size[0], 3), dtype=np.uint8)).save(path)


def make_run(root, name, author, registry, source, frames=20, film=True, usage=None, cheat=None):
    f = Path(root) / name
    (f / "plate").mkdir(parents=True)
    picture(f / "plate" / "painting.png", 7 * len(name))
    if film:
        fr = []
        for i in range(frames):
            picture(f / "plate" / f"f{i:04d}.webp", i + 100 * len(name), (30, 40))
            fr.append({"src": f"f{i:04d}.webp", "position": i / (frames - 1), **({"stage": "paper"} if i == 0 else {})})
        (f / "plate" / "frames.json").write_text(json.dumps({"frames": fr}))
    run = {"subject": {"id": "subj", "sourceAbs": str(source), "registry": str(registry)}, "author": {"key": author, "name": author},
           "code": {"commit": "abcdef1234"}, "failure": None}
    (f / "run.json").write_text(json.dumps(run))
    if usage:
        (f / "usage.json").write_text(json.dumps(usage))
    if cheat:
        (f / "plate" / "cheat-risk.json").write_text(json.dumps(cheat))
    return f


def fixtures(root):
    src = Path(root) / "source.png"
    picture(src, 99)
    reg = Path(root) / "SUBJECTS.json"
    reg.write_text(json.dumps({"subjects": [{"id": "subj", "class": {"plain": "pencil under wash, faint"}}]}))
    return src, reg


class StubJudge:
    """Stands in for s04_judge: a sequence scores 2 for Auto's pictures and 4 otherwise; a single picture scores 8 for
    the original, 6 for Auto and 7 otherwise. Records every call."""
    RouteError = J.RouteError

    def __init__(self, broken=None):
        self.calls, self.events, self.broken = [], [], broken

    def settings(self, env=None):
        return {"route": "local", "label": "J3-local-3x", "panel": list(PANEL), "host": "stub"}

    def record(self, cfg):
        return {"route": "local", "label": cfg["label"], "endpoint": "stub", "panel": cfg["panel"], "digests": {m: "d-" + m for m in PANEL}}

    def wait_turn(self, cfg, model):
        self.events.append(("load", model))

    def unload(self, cfg, model):
        self.events.append(("unload", model))

    def post(self, cfg, model, content, max_tokens, num_ctx):
        self.calls.append((model, len([c for c in content if c["type"] == "image_url"]), num_ctx))
        if model == self.broken:
            return "not json", {}
        text = content[0]["text"]
        imgs = [c for c in content if c["type"] == "image_url"]
        if len(imgs) > 1:
            s = 2 if "Auto" in self.which else 4
            return json.dumps({"sequence": {"human": s > 3, "why": "because"}, "snapshots": [{"pct": 0, "score": s, "tells": ["c"] if s < 3 else []} for _ in imgs]}), {"prompt_tokens": 10}
        v = {"orig": 8, "Auto": 6}.get(self.which, 7)
        return json.dumps({"composition_values": v, "edges_detail": v, "marks_texture": v, "overall": v}), {"prompt_tokens": 5}


class Readings(unittest.TestCase):
    def test_rubric_is_in_the_repo_and_hashed(self):
        text, h = R.load_rubric(str(HERE.parent / "docs" / "human-ness-rubric.md"))
        self.assertIn("(j) texture arriving as a dump", text)
        self.assertNotIn(R.RUBRIC_CUT, text)
        self.assertEqual(len(h), 64)

    def test_rubric_missing_or_reshaped_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(R.Refusal, "not at"):
                R.load_rubric(os.path.join(d, "none.md"))
            p = os.path.join(d, "r.md"); Path(p).write_text("a rubric with no reply format")
            with self.assertRaisesRegex(R.Refusal, "not the rubric"):
                R.load_rubric(p)

    def test_the_paper_then_eleven_evenly_spaced_snapshots_then_the_finished_sheet(self):
        with tempfile.TemporaryDirectory() as d:
            src, reg = fixtures(d)
            f = make_run(d, "r", "auto", reg, src, frames=25)
            s = R.snapshots(str(f / "plate" / "painting.png"))
            self.assertEqual(len(s), 13)
            self.assertEqual(s[0], (str(f / "plate" / "f0000.webp"), 0))
            self.assertEqual([os.path.basename(x) for x, _ in s[1:4]], ["f0002.webp", "f0004.webp", "f0006.webp"])
            self.assertEqual(os.path.basename(s[11][0]), "f0022.webp")
            self.assertEqual(s[-1], (str(f / "plate" / "painting.png"), 100))
            self.assertEqual(s[5][1], round(100 * 10 / 24))
            self.assertIn("the first (0%) is the untouched sheet of paper", R.SEQ)

    def test_a_film_that_does_not_start_with_the_paper_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            src, reg = fixtures(d)
            f = make_run(d, "old", "auto", reg, src)
            doc = json.loads((f / "plate" / "frames.json").read_text())
            doc["frames"][0].pop("stage")
            (f / "plate" / "frames.json").write_text(json.dumps(doc))
            with self.assertRaisesRegex(R.Refusal, "does not start with the untouched paper"):
                R.snapshots(str(f / "plate" / "painting.png"))

    def test_no_film_short_film_or_missing_frame_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            src, reg = fixtures(d)
            with self.assertRaisesRegex(R.Refusal, "no film"):
                R.snapshots(str(make_run(d, "a", "x", reg, src, film=False) / "plate" / "painting.png"))
            with self.assertRaisesRegex(R.Refusal, "needs at least 14"):
                R.snapshots(str(make_run(d, "b", "x", reg, src, frames=10) / "plate" / "painting.png"))
            f = make_run(d, "c", "x", reg, src)
            os.remove(f / "plate" / "f0003.webp")
            with self.assertRaisesRegex(R.Refusal, "not there"):
                R.snapshots(str(f / "plate" / "painting.png"))

    def test_replies_parse_or_are_rejected(self):
        ok = '```json\n{"sequence":{"human":false,"why":"x"},"snapshots":[{"score":7,"tells":["(c)","Z"]},{"score":0}]}```'
        r = R.parse_sequence(ok, 2)
        self.assertEqual([s["score"] for s in r["snapshots"]], [5.0, 1.0])
        self.assertEqual(r["snapshots"][0]["tells"], ["c"])
        self.assertIsNone(R.parse_sequence(ok, 3))
        self.assertIsNone(R.parse_sequence("no", 2))
        self.assertEqual(R.parse_single('x {"composition_values":3,"edges_detail":4,"marks_texture":5,"overall":12}')["overall"], 10.0)
        self.assertIsNone(R.parse_single('{"overall":5}'))

    def test_ask_retries_then_gives_up_with_a_reason(self):
        replies = iter([RuntimeError("down"), ("junk", {}), ('{"composition_values":1,"edges_detail":1,"marks_texture":1,"overall":2}', {"prompt_tokens": 3})])
        def post(m, c):
            x = next(replies)
            if isinstance(x, Exception):
                raise x
            return x
        r, why = R.ask(post, "m", [], R.parse_single)
        self.assertEqual(r["overall"], 2.0)
        r, why = R.ask(lambda m, c: ("junk", {}), "m", [], R.parse_single)
        self.assertIsNone(r); self.assertIn("no valid reply", why)

    def test_human_ness_is_the_mean_of_the_twelve_film_snapshots(self):
        film = [1, 1, 1, 1, 3, 3, 3, 3, 5, 5, 5, 5]
        by = {m: [seq_reading(film + [5], human=(m == "j1"))] * 3 for m in PANEL}
        h = R.human(by, PANEL)
        self.assertAlmostEqual(h["meanOf5"], 3.0)
        self.assertAlmostEqual(h["percent"], 60.0)
        self.assertEqual(h["thirds"], [1.0, 3.0, 5.0])
        self.assertEqual(h["tells"], {"c": 39}); self.assertEqual(h["tellsOf"], 39)
        self.assertEqual((h["yes"], h["of"], h["sequenceHuman"]), (3, 9, False))
        self.assertEqual(h["faults"], [])

    def test_a_judge_short_of_three_readings_empties_the_figure(self):
        by = {m: [seq_reading([4] * 13)] * 3 for m in PANEL}
        by["j2"] = [by["j2"][0], None, by["j2"][0]]
        h = R.human(by, PANEL)
        self.assertIsNone(h["percent"]); self.assertEqual(h["faults"], ["j2: 2 of 3 valid readings"])
        q = R.quality({"j1": [{"overall": 5, "composition_values": 5, "edges_detail": 5, "marks_texture": 5}] * 3}, PANEL)
        self.assertIsNone(q["score"]); self.assertEqual(len(q["faults"]), 2)

    def test_quality_is_the_mean_of_the_judges_medians(self):
        mk = lambda v: {"overall": v, "composition_values": v, "edges_detail": v, "marks_texture": v}
        q = R.quality({"j1": [mk(5), mk(6), mk(9)], "j2": [mk(7)] * 3, "j3": [mk(8)] * 3}, PANEL)
        self.assertAlmostEqual(q["score"], 7.0); self.assertEqual(q["spread"], 2)


class Table(unittest.TestCase):
    def rows(self):
        p = lambda i, auto, h, q, c: {"id": i, "label": i, "subject": "s", "auto": auto, "human": {"percent": h, "thirds": [1, 2, 3], "tells": {"c": 2}, "tellsOf": 39, "yes": 0, "of": 9, "why": "w"},
                                      "quality": {"score": q}, "classic": {"mean": c, "metrics": {"value": 1, "edge": 2, "marks": 3}}}
        return [p("auto", True, 40, 6, 5), p("model", False, 70, 9, 6)]

    def test_share_combined_and_the_auto_adjustment(self):
        rows = T.derive(self.rows(), {"s": {"quality": {"score": 8}}})
        a, m = rows
        self.assertAlmostEqual(a["share"], 75); self.assertAlmostEqual(m["share"], 112.5)
        self.assertAlmostEqual(m["combined"], (2 * 70 + 112.5) / 3)
        self.assertAlmostEqual(m["adjusted"]["humanness"], 30 / 60)
        self.assertAlmostEqual(m["adjusted"]["quality"], 3 / 4)
        self.assertAlmostEqual(m["adjusted"]["classic"], 1 / 5)
        self.assertEqual(a["adjusted"]["note"], "Auto itself")

    def test_headroom_never_under_a_fifth_of_the_scale(self):
        self.assertAlmostEqual(T.headroom_adjusted(10, 9, 10), 0.5)

    def test_no_auto_is_said(self):
        rows = T.derive(self.rows()[1:], {"s": {"quality": {"score": 8}}})
        self.assertIn("0 Auto paintings", rows[0]["adjusted"]["note"])

    def test_the_table_states_what_is_missing(self):
        rows = T.derive(self.rows(), {"s": {"quality": {"score": 8}}})
        rows[1]["cheat"] = {"risk": 0.6, "level": "high", "review": True, "hfCorr": 0.7, "hfCeiling": 0.645, "strokes": 5, "strokeCeiling": 9, "parts": {"progression": 0.2}}
        rows[1]["usage"] = {"session": {"lookUnits": {"spent": 2, "budget": 5}, "steps": {"taken": 9, "budget": 1000}, "toolCalls": 4, "wallMinutes": 3}, "model": {"tokens": 100, "costUSD": None}, "budget": {}}
        md = T.markdown({"written": "now", "series": "new series", "judge": {"label": "L", "route": "local", "endpoint": "e", "panel": PANEL},
                         "rubric": {"path": "r", "sha256": "f" * 64}, "prompts": {"sequence": "a" * 64, "single": "b" * 64}, "weights": T.WEIGHTS,
                         "readings": 3, "snapshots": 12, "faults": ["x: short"], "originals": {"s": {"quality": {"score": 8}}}, "paintings": rows})
        self.assertIn("## Faults first\n\n- x: short", md)
        self.assertIn("| model | 70% | 112% (9.00 of 10) | **84%** | +0.50 | +0.75 |", md)
        self.assertIn("none: no cheat-risk record", md)
        self.assertIn("none: no usage.json", md)
        self.assertIn("0.60 high, REVIEW; fine-detail copy 0.700 of 0.645 allowed OVER", md)
        self.assertIn("rendering units 2 of 5; steps 9 of 1000; tool calls 4; tokens 100; cost not reported", md)


class Route(unittest.TestCase):
    def test_local_by_default(self):
        self.assertEqual(J.settings({})["route"], "local")
        self.assertEqual(J.settings({})["label"], "J3-local-3x")

    def test_hosted_route_without_a_key_fails_plainly(self):
        for route, key in (("together", "TOGETHER_API_KEY"), ("openrouter", "OPENROUTER_API_KEY")):
            with self.assertRaisesRegex(J.RouteError, f"needs {key}, and it is not set"):
                J.settings({"JUDGE_ROUTE": route})
        with self.assertRaisesRegex(J.RouteError, "must be one of"):
            J.settings({"JUDGE_ROUTE": "elsewhere"})

    def test_open_panel_on_openrouter(self):
        env = {"JUDGE_ROUTE": "openrouter", "OPENROUTER_API_KEY": "k", "JUDGE_HOSTED_PANEL": "open3"}
        cfg = J.settings(env)
        self.assertEqual((cfg["label"], cfg["panel"]), ("J3-open-3x-hosted", list(J.OPEN3_PANEL)))
        self.assertEqual(J.settings({k: v for k, v in env.items() if k != "JUDGE_HOSTED_PANEL"})["panel"], list(J.HOSTED_PANEL))
        seen = []
        def opener(req, timeout=None):
            seen.append(json.loads(req.data))
            return io.BytesIO(json.dumps({"choices": [{"message": {"content": "ok"}}]}).encode())
        for m in J.OPEN3_PANEL:
            J.post(cfg, m, [{"type": "text", "text": "hi"}], opener=opener)
        self.assertEqual([b["model"] for b in seen], ["z-ai/glm-5.3-flash", "qwen/qwen3.8-27b", "google/gemma-4-31b-it"])
        self.assertTrue(all(b["provider"]["zdr"] for b in seen))
        with self.assertRaises(J.RouteError):
            J.settings({**env, "JUDGE_ROUTE": "together", "TOGETHER_API_KEY": "k"})

    def test_hosted_call_sends_the_key_but_never_records_it(self):
        cfg = J.settings({"JUDGE_ROUTE": "openrouter", "OPENROUTER_API_KEY": "sekrit-123"})
        seen = []
        def opener(req, timeout=None):
            seen.append(req)
            return io.BytesIO(json.dumps({"choices": [{"message": {"content": "ok"}}], "usage": {"prompt_tokens": 1}}).encode())
        self.assertEqual(J.post(cfg, "Qwen/Qwen3.5-9B", [{"type": "text", "text": "hi"}], opener=opener)[0], "ok")
        body = json.loads(seen[0].data)
        self.assertEqual(body["model"], "qwen/qwen3.5-9b"); self.assertEqual(body["provider"]["zdr"], True)
        self.assertEqual(seen[0].get_header("Authorization"), "Bearer sekrit-123")
        self.assertNotIn("sekrit", json.dumps(J.record(cfg)))
        def fails(req, timeout=None):
            raise OSError("refused")
        with self.assertRaises(RuntimeError) as e:
            J.post(cfg, "Qwen/Qwen3.5-9B", [], opener=fails, sleep=lambda s: None)
        self.assertNotIn("sekrit", str(e.exception))

    def test_local_call_widens_the_window_and_unloads(self):
        cfg = J.settings({})
        seen = []
        def opener(req, timeout=None):
            seen.append(json.loads(req.data) if req.data else req.full_url)
            return io.BytesIO(json.dumps({"message": {"content": "x"}, "models": []}).encode())
        J.post(cfg, "m", [{"type": "text", "text": "hi"}], max_tokens=3000, num_ctx=16384, opener=opener)
        self.assertEqual(seen[0]["options"], {"temperature": 0, "num_ctx": 16384, "num_predict": 3000})
        J.unload(cfg, "m", opener=opener)
        self.assertEqual(seen[1], {"model": "m", "keep_alive": 0})

    def test_waits_while_another_job_holds_the_server(self):
        held = iter([["other:1b"], ["m"]])
        said = []
        with mock.patch.object(J, "loaded", lambda cfg, opener=None: next(held)):
            J.wait_turn({"route": "local"}, "m", sleep=lambda s: None, say=lambda *a, **k: said.append(a))
        self.assertEqual(len(said), 1)


class Runs(unittest.TestCase):
    def test_refusals_name_every_bad_input(self):
        with tempfile.TemporaryDirectory() as d:
            src, reg = fixtures(d)
            ok = make_run(d, "ok", "auto", reg, src)
            empty = Path(d) / "empty"; empty.mkdir()
            gone = make_run(d, "gone", "x", reg, Path(d) / "nowhere.png")
            with self.assertRaises(R.Refusal) as e:
                s04_runs.entries([str(ok), str(empty), str(gone), str(ok)])
            m = str(e.exception)
            self.assertIn("holds no painting", m); self.assertIn("is not on disk", m); self.assertIn("ok is given twice", m)

    def test_manifest_paths_are_read_from_its_folder(self):
        with tempfile.TemporaryDirectory() as d:
            src, reg = fixtures(d)
            make_run(d, "r", "auto", reg, src)
            Path(d, "m.json").write_text(json.dumps({"runs": [{"folder": "r", "label": "Auto L0"}]}))
            e = s04_runs.entries([os.path.join(d, "m.json")])[0]
            self.assertEqual((e["label"], e["auto"], e["style"]), ("Auto L0", True, "watercolor; the drawing under it: pencil under wash, faint"))


class EndToEnd(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["BENCH_CLASSIC_CACHE"] = os.path.join(self.tmp.name, "cache")
        import score04
        self.S = score04

    def tearDown(self):
        os.environ.pop("BENCH_CLASSIC_CACHE", None)
        self.tmp.cleanup()

    def stub(self, **k):
        j = StubJudge(**k)
        post = j.post
        def which_post(cfg, model, content, max_tokens, num_ctx):
            first = next(c for c in content if c["type"] == "image_url")["image_url"]["url"]
            j.which = j.marks.get(first, "orig")
            return post(cfg, model, content, max_tokens, num_ctx)
        j.post = which_post
        return j

    def runs(self):
        d = self.tmp.name
        src, reg = fixtures(d)
        a = make_run(d, "auto-run", "auto", reg, src, cheat={"risk": 0.1, "level": "low", "review": False, "hfCorr": 0.07, "hfCeiling": 0.645, "parts": {"progression": 0}})
        m = make_run(d, "model-run", "astra", reg, src, usage={"level": 2, "session": {"toolCalls": 7}, "model": {"tokens": 5}, "budget": {}})
        return a, m

    def test_the_hosted_route_sees_the_paper_first_as_the_local_one_does(self):
        a, m = self.runs()
        j = self.stub()
        j.settings = lambda env=None: {"route": "openrouter", "label": "J3-open-3x-hosted", "panel": list(PANEL), "host": "stub"}
        j.record = lambda cfg: {"route": "openrouter", "label": cfg["label"], "endpoint": "stub", "panel": cfg["panel"]}
        import score_painting as SP
        from common import load_rgb
        paper = {SP.data_uri(load_rgb(str(r / "plate" / "f0000.webp")), 640): r.name for r in (a, m)}
        j.marks = {u: ("Auto" if n == "auto-run" else "model") for u, n in paper.items()}
        firsts, post = [], j.post
        def seen(cfg, model, content, max_tokens, num_ctx):
            imgs = [c["image_url"]["url"] for c in content if c["type"] == "image_url"]
            if len(imgs) > 1: firsts.append(paper.get(imgs[0]))
            return post(cfg, model, content, max_tokens, num_ctx)
        j.post = seen
        rc = self.S.main([str(a), str(m), "--out", os.path.join(self.tmp.name, "out")], judge=j, say=lambda *x, **k: None)
        self.assertEqual(rc, 0)
        self.assertTrue(firsts and all(firsts), f"every sequence a hosted judge saw began with the paper: {firsts}")
        self.assertEqual(set(firsts), {"auto-run", "model-run"})

    def test_two_paintings_and_their_original(self):
        a, m = self.runs()
        j = self.stub()
        import score_painting as SP
        from common import load_rgb
        uri = lambda f, px: SP.data_uri(load_rgb(f), px)
        j.marks = {uri(str(a / "plate" / "f0000.webp"), 640): "Auto", uri(str(a / "plate" / "painting.png"), 768): "Auto",
                   uri(str(m / "plate" / "f0000.webp"), 640): "model", uri(str(m / "plate" / "painting.png"), 768): "model"}
        out = os.path.join(self.tmp.name, "out")
        rc = self.S.main([str(a), str(m), "--out", out], judge=j, say=lambda *x, **k: None)
        self.assertEqual(rc, 0)
        res = json.loads(Path(out, "results.json").read_text())
        by = {p["id"]: p for p in res["paintings"]}
        self.assertAlmostEqual(by["auto-run"]["human"]["percent"], 40.0)
        self.assertAlmostEqual(by["model-run"]["human"]["percent"], 80.0)
        self.assertAlmostEqual(res["originals"]["subj"]["quality"]["score"], 8.0)
        self.assertAlmostEqual(by["model-run"]["share"], 87.5)
        self.assertAlmostEqual(by["model-run"]["combined"], (160 + 87.5) / 3)
        self.assertAlmostEqual(by["model-run"]["adjusted"]["humanness"], 40 / 60)
        self.assertIsNotNone(by["model-run"]["classic"]["mean"])
        self.assertEqual(by["model-run"]["label"], "astra L2")
        self.assertEqual(res["weights"], {"humanness": 2, "quality": 1})
        self.assertEqual(res["judge"]["label"], "J3-local-3x")
        self.assertEqual(res["rubric"]["path"], "bench/docs/human-ness-rubric.md")
        self.assertIn("new series", res["series"])
        # 3 judges x (2 sequences + 3 single pictures) x 3 readings; sequences carry 13 pictures in the wider window
        self.assertEqual(len(j.calls), 45)
        self.assertEqual({(n, c) for _, n, c in j.calls}, {(13, 16384), (1, 8192)})
        self.assertEqual(j.events, [(e, m_) for m_ in PANEL for e in ("load", "unload")])
        md = Path(out, "SCORES.md").read_text()
        self.assertIn("- None: every reading has all its judges.", md)
        # a second run reuses every kept reading
        j2 = self.stub(); j2.marks = j.marks
        self.assertEqual(self.S.main([str(a), str(m), "--out", out], judge=j2, say=lambda *x, **k: None), 0)
        self.assertEqual(j2.calls, [])

    def test_a_broken_judge_is_named_and_the_exit_is_not_clean(self):
        a, m = self.runs()
        j = self.stub(broken="j3"); j.marks = {}
        out = os.path.join(self.tmp.name, "out")
        self.assertEqual(self.S.main([str(a), str(m), "--out", out], judge=j, say=lambda *x, **k: None), 1)
        res = json.loads(Path(out, "results.json").read_text())
        self.assertIsNone(res["paintings"][0]["human"]["percent"])
        self.assertIn("j3: 0 of 3 valid readings", "\n".join(res["faults"]))

    def test_a_painting_without_a_film_is_refused_before_any_judge(self):
        a, m = self.runs()
        os.remove(m / "plate" / "frames.json")
        j = self.stub(); j.marks = {}
        err = io.StringIO()
        with mock.patch("sys.stderr", err):
            rc = self.S.main([str(a), str(m), "--out", os.path.join(self.tmp.name, "out")], judge=j)
        self.assertEqual(rc, 2); self.assertEqual(j.calls, [])
        self.assertIn("model-run: no film", err.getvalue())


if __name__ == "__main__":
    unittest.main()
