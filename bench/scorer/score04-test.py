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


def make_run(root, name, author, registry, source, frames=20, film=True, usage=None, cheat=None, drawn=3, stages=True):
    # the film's record, as the painter writes it: the paper, `drawn` frames of drawing, then washes, then the finished sheet
    # (stages=False: an old film that names only its paper). The pictures: the paper in a tone of this run's own, and
    # each frame one even step nearer the finished sheet, which is the painting brought down to the film's size.
    stage = lambda i: "paper" if i == 0 else None if not stages else "drawing" if i <= drawn else "finished" if i == frames - 1 else "paint"
    f = Path(root) / name
    (f / "plate").mkdir(parents=True)
    picture(f / "plate" / "painting.png", 7 * len(name))
    if film:
        fr = []
        end = np.asarray(Image.open(f / "plate" / "painting.png").resize((30, 40), Image.BOX), dtype=np.float32)
        paper = np.full_like(end, 225 + len(name) % 25)
        for i in range(frames):
            k = i / (frames - 1)
            Image.fromarray(np.rint(paper + k * (end - paper)).astype(np.uint8)).save(f / "plate" / f"f{i:04d}.webp", lossless=True)
            fr.append({"src": f"f{i:04d}.webp", "position": i / (frames - 1), **({"stage": stage(i)} if stage(i) else {})})
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
        self.calls, self.events, self.broken, self.pairs, self.marks = [], [], broken, [], {}

    def settings(self, env=None):
        return {"route": "local", "label": "open3-local-3x", "panelName": "open3", "reasoning": "off", "panel": list(PANEL), "host": "stub"}

    def record(self, cfg):
        return {"route": "local", "label": cfg["label"], "endpoint": "stub", "panelName": cfg["panelName"], "reasoning": cfg["reasoning"], "panel": cfg["panel"], "digests": {m: "d-" + m for m in PANEL}, "options": {"reasoning": "off", "think": False, "temperature": 0}}

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
        if '"likeness"' in text:
            # the original and the painting together: Auto's is a likeness of 1, any other painting's 4
            self.pairs.append([c["image_url"]["url"] for c in imgs])
            return json.dumps({"likeness": 1 if self.marks.get(imgs[1]["image_url"]["url"]) == "Auto" else 4, "why": "the same cat"}), {"prompt_tokens": 7}
        if len(imgs) > 1:
            s = 2 if "Auto" in self.which else 4
            return json.dumps({"sequence": {"human": s > 3, "why": "because"}, "snapshots": [{"pct": 0, "score": s, "tells": ["c"] if s < 3 else []} for _ in imgs[1:]]}), {"prompt_tokens": 10}
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

    def test_twelve_evenly_spaced_snapshots_then_the_finished_sheet(self):
        with tempfile.TemporaryDirectory() as d:
            src, reg = fixtures(d)
            f = make_run(d, "r", "auto", reg, src, frames=27)
            s = R.snapshots(str(f / "plate" / "painting.png"))
            self.assertEqual(len(s), 13)
            self.assertEqual([os.path.basename(x) for x, _ in s[:3]], ["f0002.webp", "f0004.webp", "f0006.webp"])
            self.assertEqual(s[-1], (str(f / "plate" / "painting.png"), 100))
            self.assertEqual(s[5][1], round(100 * 12 / 26))
            old = R.frames_for(str(f / "plate" / "painting.png"), "film13")
            self.assertEqual((old["snapshots"], old["drawing"], old["firstWash"], old["opening"]), (s, None, None, str(f / "plate" / "f0000.webp")))

    def test_ten_stills_in_progress_from_the_first_wash_the_drawing_before_the_finished_sheet_after(self):
        with tempfile.TemporaryDirectory() as d:
            src, reg = fixtures(d)
            f = make_run(d, "r", "auto", reg, src, frames=41, drawn=4)
            g = R.frames_for(str(f / "plate" / "painting.png"))
            self.assertEqual(g["scheme"], "progress10")
            self.assertEqual(g["opening"], str(f / "plate" / "f0000.webp"))
            # this film nears its finish by one even step a frame, so progress is the frame's place: 5/40 at the first wash
            self.assertEqual(g["firstWash"], {"frame": 5, "pct": round(100 * 5 / 40)})
            self.assertEqual(g["drawing"], (str(f / "plate" / "f0004.webp"), 10), "the last frame before the first wash")
            self.assertEqual(len(g["snapshots"]), 11, "ten in progress, then the finished sheet")
            self.assertEqual(os.path.basename(g["snapshots"][0][0]), "f0005.webp", "the first of the ten is the first wash")
            want = [5] + [4 + k * 36 / 10 for k in range(1, 10)]   # equal steps of progress from the sheet before the first wash; the tenth is nine tenths of the way
            self.assertTrue(all(abs(i - w) <= 1 for i, w in zip(g["frames"], want)), (g["frames"], want))
            self.assertLess(g["frames"][-1], 40, "the last still is before the finished sheet")
            self.assertEqual(g["snapshots"][-1], (str(f / "plate" / "painting.png"), 100), "the finished sheet is shown last")
            self.assertTrue(all(abs(p - 100 * i / 40) <= 1 for (_, p), i in zip(g["snapshots"][:10], g["frames"])), "each still is labelled with its measured progress")
            with self.assertRaisesRegex(R.Refusal, "--snapshots: one of"):
                R.frames_for(str(f / "plate" / "painting.png"), "eleven")
            with self.assertRaisesRegex(R.Refusal, "wash10 .* was replaced .* by progress10"):
                R.frames_for(str(f / "plate" / "painting.png"), "wash10")

    def painted(self, d, name, moments, strokes=120):
        """A film of one painting of `strokes` strokes, each a transparent glaze over a block of the paper, stopped after
        the stroke counts in `moments` (0 is the paper; the last is the finished sheet). Returns the painting's file."""
        f = Path(d) / name; (f / "plate").mkdir(parents=True)
        rng = np.random.default_rng(5)
        blocks = [(int(rng.integers(0, 56)), int(rng.integers(0, 76)), rng.uniform(0.75, 0.97, 3)) for _ in range(strokes)]
        def sheet(n):
            a = np.full((96, 72, 3), 238.0)
            for x, y, c in blocks[:n]:
                a[y:y + 20, x:x + 16] *= c
            return np.rint(a).astype(np.uint8)
        fr = []
        for i, n in enumerate(moments):
            Image.fromarray(sheet(n)).save(f / "plate" / f"f{i:04d}.webp", lossless=True)
            fr.append({"src": f"f{i:04d}.webp", "position": i / (len(moments) - 1), "stage": "paper" if n == 0 else "finished" if i == len(moments) - 1 else "paint"})
        (f / "plate" / "frames.json").write_text(json.dumps({"frames": fr}))
        Image.fromarray(sheet(strokes)).save(f / "plate" / "painting.png")
        return str(f / "plate" / "painting.png")

    def test_the_same_painting_filmed_at_two_densities_gives_the_same_stills_within_one_frame(self):
        with tempfile.TemporaryDirectory() as d:
            dense, sparse = list(range(0, 121)), list(range(0, 121, 3))
            shown = {}
            for name, moments in (("dense", dense), ("sparse", sparse)):
                g = R.frames_for(self.painted(d, name, moments))
                shown[name] = [moments[i] for i in g["frames"]]   # the strokes on the sheet in each still
            self.assertEqual(len(shown["dense"]), 10)
            # the sparse film has a frame every third stroke: a still may fall on its next frame, never further
            self.assertTrue(all(0 <= s - e <= 3 for e, s in zip(shown["dense"], shown["sparse"])), shown)
            # by frame number, as the stills were chosen before, the same two films would have agreed too, but only
            # because both are even: a film recorded densely in its first half is the case that moved the old stills
            uneven = list(range(0, 60)) + list(range(60, 121, 6))
            g = R.frames_for(self.painted(d, "uneven", uneven))
            got = [uneven[i] for i in g["frames"]]
            self.assertTrue(all(0 <= s - e <= 6 for e, s in zip(shown["dense"], got)), (shown["dense"], got))
            by_index = [uneven[1 + round(k * (len(uneven) - 2) / 9)] for k in range(10)]
            self.assertGreater(max(abs(s - e) for e, s in zip(shown["dense"], by_index)), 12, "frame numbers would have judged other moments")

    def test_strokes_that_leave_no_mark_do_not_move_the_stills(self):
        with tempfile.TemporaryDirectory() as d:
            plain = list(range(0, 121))
            # the same painting padded: forty frames of strokes that change nothing after the first wash, and forty more late
            padded = plain[:2] + [1] * 40 + plain[2:100] + [99] * 40 + plain[100:]
            a = R.frames_for(self.painted(d, "plain", plain)); b = R.frames_for(self.painted(d, "padded", padded))
            self.assertEqual([plain[i] for i in a["frames"]], [padded[i] for i in b["frames"]], "the same ten moments of the painting")
            self.assertEqual([p for _, p in a["snapshots"]], [p for _, p in b["snapshots"]], "and the same progress labels")

    def test_progress_is_the_share_of_the_finished_picture_on_the_sheet_and_never_goes_back(self):
        with tempfile.TemporaryDirectory() as d:
            # strokes 0..10, then a passage that goes away from the finish (frames showing fewer strokes), then on to the end
            moments = list(range(0, 61)) + [40, 30] + list(range(61, 121))
            painting = self.painted(d, "back", moments)
            dd, fr = R.film(painting)
            p = R.progress(dd, fr)
            self.assertEqual((p[0], p[-1]), (0.0, 1.0)); self.assertTrue(all(b >= a for a, b in zip(p, p[1:])))
            self.assertEqual(p[61], p[60]); self.assertEqual(p[62], p[60])
            self.assertEqual(R.stills([0, .1, .2, .3, .4, .5, .6, .7, .8, .9, .95, 1], 1, 10), list(range(1, 11)))
            self.assertEqual(R.stills([0, .1] + [.1] * 12 + [1], 1, 10), [1, 2] + list(range(6, 14)), "a film that leaps at its end: ten frames of their own, the first wash first, all before the finish")
            with self.assertRaisesRegex(R.Refusal, "9 frames from the first wash .frame 1. to just before the finished sheet; the 10 stills need at least 10"):
                R.stills([0] + [.5] * 9 + [1], 1, 10)

    def test_nothing_drawn_before_the_first_wash_no_drawing_frame(self):
        with tempfile.TemporaryDirectory() as d:
            src, reg = fixtures(d)
            f = make_run(d, "r", "auto", reg, src, frames=30, drawn=0)
            g = R.frames_for(str(f / "plate" / "painting.png"))
            self.assertIsNone(g["drawing"]); self.assertEqual(g["firstWash"]["frame"], 1); self.assertEqual(len(g["snapshots"]), 11)
            # masking fluid alone is not a drawing
            doc = json.loads((f / "plate" / "frames.json").read_text())
            self.assertEqual(R.first_wash([{"stage": "paper"}, {"stage": "frisket"}, {"stage": "paint"}]), (2, False))
            self.assertEqual(R.first_wash([{"stage": "paper"}, {"stage": "frisket"}, {"stage": "drawing"}, {"stage": "paint"}, {"stage": "drawing"}]), (3, True))
            self.assertEqual(len(doc["frames"]), 30)

    def test_the_first_wash_is_read_from_the_film_never_guessed(self):
        with tempfile.TemporaryDirectory() as d:
            src, reg = fixtures(d)
            old = make_run(d, "old", "auto", reg, src, frames=27, stages=False)
            with self.assertRaisesRegex(R.Refusal, "records no wash.*never guessed.*--snapshots film13"):
                R.frames_for(str(old / "plate" / "painting.png"))
            self.assertEqual(len(R.frames_for(str(old / "plate" / "painting.png"), "film13")["snapshots"]), 13, "an old film is still scored the old way")
            short = make_run(d, "short", "auto", reg, src, frames=14, drawn=6)
            with self.assertRaisesRegex(R.Refusal, "6 frames from the first wash .frame 7. to just before the finished sheet; the 10 stills need at least 10"):
                R.frames_for(str(short / "plate" / "painting.png"))
        # the kit's film: each frame counts the brush strokes on the sheet; pen or pencil before the first is drawing
        kit = [{"stage": "paper", "strokes": 0, "brush": 0}, {"stage": "painting", "strokes": 2, "brush": 0}, {"stage": "painting", "strokes": 4, "brush": 1}, {"stage": "dried", "strokes": 4, "brush": 1}]
        self.assertEqual(R.first_wash(kit), (2, True))
        self.assertEqual(R.first_wash([kit[0], {"stage": "painting", "strokes": 2, "brush": 2}]), (1, False))
        with self.assertRaisesRegex(R.Refusal, "kit film that does not record its brush strokes.*film13"):
            R.first_wash([{"stage": "paper"}, {"stage": "painting", "strokes": 2}, {"stage": "finished"}])
        with self.assertRaisesRegex(R.Refusal, "starts with a wash"):
            R.first_wash([{"stage": "paint"}, {"stage": "paint"}])

    def test_the_opening_is_the_untouched_paper_shown_and_not_scored(self):
        with tempfile.TemporaryDirectory() as d:
            src, reg = fixtures(d)
            f = make_run(d, "r", "auto", reg, src, frames=27)
            self.assertEqual(R.opening(str(f / "plate" / "painting.png")), str(f / "plate" / "f0000.webp"))
            self.assertIn("It is context only: do not score it.", R.SEQ); self.assertIn("It is context only: do not score it.", R.SEQ_PROGRESS)
            with_drawing = R.sequence_prompt("progress10", "RUBRIC", "watercolour", 12, True)
            self.assertIn("Then come 12 snapshots", with_drawing); self.assertIn("first the drawing as it stood just before the first wash, then 10 snapshots of the painting in progress, from the first wash to just before the finish, and last the finished sheet", with_drawing)
            self.assertNotIn("the drawing as it stood", R.sequence_prompt("progress10", "RUBRIC", "watercolour", 11, False))
            self.assertNotIn("original", with_drawing.replace("RUBRIC", ""), "human-ness is blind to the original")
            self.assertEqual(R.sequence_prompt("film13", "RUBRIC", "watercolour", 13, False), R.SEQ.format(rubric="RUBRIC", n=13, style="watercolour"), "the earlier scheme's prompt is unchanged")
            self.assertNotEqual(R.prompt_hashes("RUBRIC")["sequence"], R.prompt_hashes("RUBRIC", "film13")["sequence"], "a kept reading of one scheme is never reused for the other")

    def test_a_film_that_does_not_start_with_the_paper_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            src, reg = fixtures(d)
            f = make_run(d, "old", "auto", reg, src)
            doc = json.loads((f / "plate" / "frames.json").read_text())
            doc["frames"][0].pop("stage")
            (f / "plate" / "frames.json").write_text(json.dumps(doc))
            with self.assertRaisesRegex(R.Refusal, "does not start with the untouched paper"):
                R.opening(str(f / "plate" / "painting.png"))

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
        self.assertEqual((h["scheme"], h["drawing"]), ("film13", None))

    def test_human_ness_is_the_mean_of_the_ten_in_progress_the_drawing_and_the_finished_sheet_stand_beside(self):
        ten = [1, 1, 1, 3, 3, 3, 3, 5, 5, 5]
        by = {m: [seq_reading([2] + ten + [4])] * 3 for m in PANEL}
        h = R.human(by, PANEL, "progress10", True)
        self.assertAlmostEqual(h["meanOf5"], 3.0); self.assertAlmostEqual(h["percent"], 60.0)
        self.assertEqual((h["drawing"], h["finished"]), (2.0, 4.0), "both scored and reported")
        self.assertEqual(h["thirds"], [1.0, 3.0, 5.0], "stills 1-3, 4-7, 8-10")
        self.assertEqual(len(h["perSnapshot"]), 12); self.assertEqual(h["judges"], {m: 3.0 for m in PANEL})
        low = R.human({m: [seq_reading([1] + ten + [1])] * 3 for m in PANEL}, PANEL, "progress10", True)
        self.assertEqual(low["meanOf5"], h["meanOf5"], "neither the drawing frame's score nor the finished sheet's moves human-ness")
        none = R.human({m: [seq_reading(ten + [5])] * 3 for m in PANEL}, PANEL, "progress10", False)
        self.assertAlmostEqual(none["meanOf5"], 3.0); self.assertIsNone(none["drawing"]); self.assertEqual(none["finished"], 5.0)

    def test_likeness_is_its_own_reading_of_the_original_and_the_painting_together(self):
        self.assertIn("The first is an original picture. The second is a painting made of it", R.LIKENESS)
        self.assertIn("not a copy", R.LIKENESS); self.assertIn("do not judge how well it is painted", R.LIKENESS)
        self.assertEqual(R.parse_likeness('```json\n{"likeness": 4, "why": "same cat, cooler colour"}\n```'), {"likeness": 4.0, "why": "same cat, cooler colour"})
        self.assertIsNone(R.parse_likeness('{"likeness": 9}')); self.assertIsNone(R.parse_likeness("it looks alike"))
        mk = lambda v: {"likeness": v, "why": "w"}
        k = R.likeness({"j1": [mk(4), mk(5), mk(2)], "j2": [mk(3)] * 3, "j3": [mk(5)] * 3}, PANEL)
        self.assertAlmostEqual(k["score"], 4.0); self.assertEqual((k["flagged"], k["judges"]["j1"]), (False, 4))
        low = R.likeness({m: [mk(1), mk(1), mk(2)] for m in PANEL}, PANEL)
        self.assertEqual((low["score"], low["flagged"]), (1.0, True), "at the bottom of the scale: flagged")
        short = R.likeness({"j1": [mk(4)] * 3}, PANEL)
        self.assertIsNone(short["score"]); self.assertEqual(len(short["faults"]), 2)

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
        self.assertIn("| model | 70% | 112% (9.00 of 10) | **84%** | none | +0.50 | +0.75 |", md)
        self.assertIn("none: no cheat-risk record", md)
        self.assertIn("none: no usage.json", md)
        self.assertIn("0.60 high, REVIEW; fine-detail copy 0.700 of 0.645 allowed OVER", md)
        self.assertIn("rendering units 2 of 5; steps 9 of 1000; tool calls 4; tokens 100; cost not reported", md)


class Route(unittest.TestCase):
    TAGS = {"JUDGE_LOCAL_TAGS": "zai-org/GLM-5.3-Flash=glm-5.3-flash:test"}

    def test_one_named_panel_is_the_default_on_every_route(self):
        local = J.settings(dict(self.TAGS))
        hosted = J.settings({"JUDGE_ROUTE": "openrouter", "OPENROUTER_API_KEY": "k"})
        self.assertEqual(local["route"], "local")
        self.assertEqual(local["panel"], hosted["panel"]); self.assertEqual(local["panel"], list(J.PANELS["open3"]["models"]))
        self.assertEqual((local["panelName"], hosted["panelName"], local["reasoning"], hosted["reasoning"]), ("open3", "open3", "off", "off"))
        self.assertEqual((local["label"], hosted["label"]), ("open3-local-3x", "open3-openrouter-3x"))
        # each route serves the same judges under its own names
        self.assertEqual(local["names"], {"zai-org/GLM-5.3-Flash": "glm-5.3-flash:test", "Qwen/Qwen3.8-27B": "qwen3.8:27b-mlx", "google/gemma-4-31b-it": "gemma4:31b-mlx"})

    def test_a_panel_a_route_cannot_serve_is_refused_by_name_never_swapped(self):
        with self.assertRaisesRegex(J.RouteError, "open3 panel cannot be read on the local route: it has no name there for zai-org/GLM-5.3-Flash.*JUDGE_LOCAL_TAGS"):
            J.settings({})
        with self.assertRaisesRegex(J.RouteError, "open3 panel cannot be read on the together route"):
            J.settings({"JUDGE_ROUTE": "together", "TOGETHER_API_KEY": "k"})
        with self.assertRaisesRegex(J.RouteError, "JUDGE_HOSTED_PANEL is gone"):
            J.settings({"JUDGE_ROUTE": "openrouter", "OPENROUTER_API_KEY": "k", "JUDGE_HOSTED_PANEL": "open3"})
        with self.assertRaisesRegex(J.RouteError, "ask for it with JUDGE_PANEL=custom"):
            J.settings({**self.TAGS, "JUDGE_LOCAL_PANEL": "a:1b"})
        with self.assertRaisesRegex(J.RouteError, "JUDGE_PANEL must be one of"):
            J.settings({"JUDGE_PANEL": "mine"})

    def test_any_other_panel_is_asked_for_by_name(self):
        self.assertEqual(J.settings({"JUDGE_PANEL": "local3"})["label"], "local3-local-3x")
        self.assertEqual(J.settings({"JUDGE_PANEL": "local3"})["panel"], list(J.local_route.DEFAULT_PANEL))
        self.assertEqual(J.settings({"JUDGE_PANEL": "j1", "JUDGE_ROUTE": "together", "TOGETHER_API_KEY": "k"})["panel"], list(J.PANELS["j1"]["models"]))
        c = J.settings({"JUDGE_PANEL": "custom", "JUDGE_LOCAL_PANEL": "a:1b,b:2b"})
        self.assertEqual((c["panel"], c["label"]), (["a:1b", "b:2b"], "custom-local-3x"))

    def test_hosted_route_without_a_key_fails_plainly(self):
        for route, key, panel in (("together", "TOGETHER_API_KEY", "j1"), ("openrouter", "OPENROUTER_API_KEY", "open3")):
            with self.assertRaisesRegex(J.RouteError, f"needs {key}, and it is not set"):
                J.settings({"JUDGE_ROUTE": route, "JUDGE_PANEL": panel})
        with self.assertRaisesRegex(J.RouteError, "must be one of"):
            J.settings({"JUDGE_ROUTE": "elsewhere"})

    def test_the_same_reasoning_setting_is_sent_on_both_routes_and_recorded(self):
        hosted = J.settings({"JUDGE_ROUTE": "openrouter", "OPENROUTER_API_KEY": "k"})
        seen = []
        def opener(req, timeout=None):
            seen.append(json.loads(req.data) if req.data else req.full_url)
            return io.BytesIO(json.dumps({"choices": [{"message": {"content": "ok"}}], "usage": {"completion_tokens_details": {"reasoning_tokens": 40}},
                                          "message": {"content": "x"}, "models": [{"name": t, "digest": "d-" + t} for t in ("glm-5.3-flash:test", "qwen3.8:27b-mlx", "gemma4:31b-mlx")]}).encode())
        usage = [J.post(hosted, m, [{"type": "text", "text": "hi"}], opener=opener)[1] for m in hosted["panel"]]
        self.assertEqual([b["model"] for b in seen], ["z-ai/glm-5.3-flash", "qwen/qwen3.8-27b", "google/gemma-4-31b-it"])
        self.assertTrue(all(b["provider"]["zdr"] and b["reasoning"] == {"effort": "none"} for b in seen))
        self.assertEqual(usage[0]["reasoning_tokens"], 40, "a hosted judge that reasons all the same reports it")
        local = J.settings(dict(self.TAGS)); seen.clear()
        J.post(local, "zai-org/GLM-5.3-Flash", [{"type": "text", "text": "hi"}], opener=opener)
        self.assertEqual((seen[0]["model"], seen[0]["think"]), ("glm-5.3-flash:test", False))
        rl, rh = J.record(local, opener), J.record(hosted)
        for r in (rl, rh):
            self.assertEqual((r["panelName"], r["reasoning"], r["panel"]), ("open3", "off", list(J.PANELS["open3"]["models"])))
        self.assertEqual(rl["digests"]["zai-org/GLM-5.3-Flash"], "d-glm-5.3-flash:test"); self.assertEqual(rh["sentAs"]["Qwen/Qwen3.8-27B"], "qwen/qwen3.8-27b")

    def test_hosted_call_sends_the_key_but_never_records_it(self):
        cfg = J.settings({"JUDGE_ROUTE": "openrouter", "OPENROUTER_API_KEY": "sekrit-123", "JUDGE_PANEL": "j1"})
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
        cfg = J.settings({"JUDGE_PANEL": "custom", "JUDGE_LOCAL_PANEL": "m"})
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
        j.settings = lambda env=None: {"route": "openrouter", "label": "open3-openrouter-3x", "panelName": "open3", "reasoning": "off", "panel": list(PANEL), "host": "stub"}
        j.record = lambda cfg: {"route": "openrouter", "label": cfg["label"], "endpoint": "stub", "panelName": "open3", "reasoning": "off", "panel": cfg["panel"], "options": {"reasoning": "off", "temperature": 0}}
        import score_painting as SP
        from common import load_rgb
        paper = {SP.data_uri(load_rgb(str(r / "plate" / "f0000.webp")), 640): r.name for r in (a, m)}
        j.marks = {u: ("Auto" if n == "auto-run" else "model") for u, n in paper.items()}
        firsts, post = [], j.post
        def seen(cfg, model, content, max_tokens, num_ctx):
            imgs = [c["image_url"]["url"] for c in content if c["type"] == "image_url"]
            if len(imgs) > 2: firsts.append(paper.get(imgs[0]) if len(imgs) == 13 else f"{len(imgs)} pictures")
            return post(cfg, model, content, max_tokens, num_ctx)
        j.post = seen
        rc = self.S.main([str(a), str(m), "--out", os.path.join(self.tmp.name, "out")], judge=j, say=lambda *x, **k: None)
        self.assertEqual(rc, 0)
        self.assertTrue(firsts and all(firsts), f"every sequence a hosted judge saw was the paper, then the drawing frame, the ten in progress and the finished sheet: {firsts}")
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
        self.assertEqual((res["judge"]["label"], res["judge"]["panelName"], res["judge"]["reasoning"]), ("open3-local-3x", "open3", "off"))
        self.assertEqual(res["rubric"]["path"], "bench/docs/human-ness-rubric.md")
        self.assertIn("new series", res["series"])
        # 3 judges x (2 sequences + 3 single pictures + 2 likeness pairs) x 3 readings; a sequence is the opening, the drawing frame, the ten and the finished sheet, in the wider window
        self.assertEqual(len(j.calls), 63)
        self.assertEqual({(n, c) for _, n, c in j.calls}, {(13, 16384), (1, 8192), (2, 8192)})
        # likeness: the judges are shown the original first and the finished painting second, and nothing else is
        self.assertEqual({tuple(x) for x in j.pairs}, {(uri(str(Path(self.tmp.name) / "source.png"), 768), uri(str(r / "plate" / "painting.png"), 768)) for r in (a, m)})
        self.assertAlmostEqual(by["model-run"]["likeness"]["score"], 4.0); self.assertEqual(by["model-run"]["likeness"]["flagged"], False)
        self.assertEqual((by["auto-run"]["likeness"]["score"], by["auto-run"]["likeness"]["flagged"]), (1.0, True))
        self.assertAlmostEqual(by["model-run"]["combined"], (160 + 87.5) / 3, msg="likeness is not in the combined figure")
        self.assertEqual(res["pictureLongSidePx"], {"stills": 640, "alone": 768, "likeness": 768})
        self.assertEqual((res["snapshots"], res["snapshotScheme"]["name"]), (10, "progress10"))
        self.assertIn("NOT comparable", res["series"]); self.assertIn("NOT comparable", res["snapshotScheme"]["note"])
        p = by["model-run"]
        self.assertEqual((os.path.basename(p["drawingFrame"]["file"]), p["firstWash"]["frame"], len(p["snapshots"])), ("f0003.webp", 4, 11))
        self.assertEqual(os.path.basename(p["snapshots"][0]["file"]), "f0004.webp"); self.assertEqual(p["snapshots"][-1], {"file": p["painting"], "pct": 100, "finished": True})
        self.assertEqual(p["snapshots"][0]["frame"], 4); self.assertLess(p["snapshots"][9]["frame"], 19)
        self.assertAlmostEqual(p["human"]["drawing"], 4.0); self.assertAlmostEqual(p["human"]["finished"], 4.0); self.assertEqual(len(p["human"]["perSnapshot"]), 12)
        self.assertIn("progress", res["snapshotScheme"]["spacedBy"])
        self.assertEqual(j.events, [(e, m_) for m_ in PANEL for e in ("load", "unload")])
        md = Path(out, "SCORES.md").read_text()
        self.assertIn("LIKENESS (of 5; not in combined)", md); self.assertIn("| 4.0 of 5 |", md); self.assertIn("1.0 of 5 **FLAGGED: at the bottom of the scale", md)
        self.assertIn("- None: every reading has all its judges.", md)
        self.assertIn("HUMAN-NESS (mean of 10 stills in progress, from the first wash to just before the finish, % of 5)", md)
        self.assertIn("the drawing frame, before the first wash (of 5; not in the mean)", md); self.assertIn("the finished sheet (of 5; not in the mean)", md); self.assertIn("NOT comparable with scores under film13", md)
        # the earlier scheme by its name: the opening, twelve and the finished sheet, kept apart from the new readings
        j13 = self.stub(); j13.marks = j.marks
        out13 = os.path.join(self.tmp.name, "out13")
        self.assertEqual(self.S.main([str(a), str(m), "--out", out13, "--snapshots", "film13"], judge=j13, say=lambda *x, **k: None), 0)
        self.assertEqual({(n, c) for _, n, c in j13.calls}, {(14, 16384), (1, 8192), (2, 8192)})
        res13 = json.loads(Path(out13, "results.json").read_text())
        self.assertEqual((res13["snapshots"], res13["snapshotScheme"]["name"], res13["paintings"][0]["drawingFrame"]), (12, "film13", None))
        self.assertNotEqual(res13["prompts"]["sequence"], res["prompts"]["sequence"])
        md13 = Path(out13, "SCORES.md").read_text()
        self.assertIn("HUMAN-NESS (mean of 12 film snapshots, % of 5)", md13); self.assertIn("scheme film13, the first one", md13); self.assertNotIn("drawing frame", md13)
        # a second run reuses every kept reading
        j2 = self.stub(); j2.marks = j.marks
        self.assertEqual(self.S.main([str(a), str(m), "--out", out], judge=j2, say=lambda *x, **k: None), 0)
        self.assertEqual(j2.calls, [])
        # the same folder, the other scheme: nothing kept is reused
        j3 = self.stub(); j3.marks = j.marks
        self.assertEqual(self.S.main([str(a), str(m), "--out", out, "--snapshots", "film13"], judge=j3, say=lambda *x, **k: None), 0)
        self.assertEqual(len([1 for _, n, _c in j3.calls if n == 14]), 18, "every sequence is read again under the other scheme")

    def test_a_kept_reading_is_reused_only_for_the_same_panel_route_options_and_pictures(self):
        a, m = self.runs()
        out = os.path.join(self.tmp.name, "out")
        run = lambda j, *more: self.S.main([str(a), str(m), "--out", out, *more], judge=j, say=lambda *x, **k: None)
        j = self.stub(); j.marks = {}
        self.assertEqual(run(j), 0); n = len(j.calls); self.assertGreater(n, 0)
        again = self.stub(); again.marks = {}
        self.assertEqual(run(again), 0); self.assertEqual(again.calls, [], "the same scoring again reuses every reading")
        # each of these changes what a reply could be: nothing kept is reused
        changes = {"route": lambda r: {**r, "route": "openrouter"}, "endpoint": lambda r: {**r, "endpoint": "elsewhere"}, "panel name": lambda r: {**r, "panelName": "other"},
                   "options": lambda r: {**r, "options": {**r["options"], "think": True}}, "reasoning": lambda r: {**r, "reasoning": "low"},
                   "model digest": lambda r: {**r, "digests": {**r["digests"], "j1": "d-new"}}, "served name": lambda r: {**r, "sentAs": {"j1": "j1:other"}}}
        for what, change in changes.items():
            jx = self.stub(); jx.marks = {}; rec = jx.record
            jx.record = lambda cfg, change=change, rec=rec: change(rec(cfg))
            self.assertEqual(run(jx), 0)
            # (the last: only j1 is served under another name, and j2's and j3's kept readings are theirs again)
            self.assertEqual(len(jx.calls), n // 3 if what == "served name" else n, f"a different {what} reads again")
        back = self.stub(); back.marks = {}
        self.assertEqual(run(back), 0); self.assertEqual(len(back.calls), n // 3, "back to the first settings: j1's readings, kept under the other name, are read again")
        # a changed picture
        from PIL import Image as I
        I.new("RGB", (60, 80), (9, 9, 9)).save(m / "plate" / "painting.png")
        jp = self.stub(); jp.marks = {}
        self.assertEqual(run(jp), 0)
        self.assertEqual(len(jp.calls), 27, "only the changed painting is read again: alone (9), beside its original (9), and its sequence, which shows the finished sheet (9)")

    def test_fresh_reads_again_and_a_repeat_is_kept_apart_for_a_noise_measurement(self):
        a, m = self.runs()
        out = os.path.join(self.tmp.name, "out")
        run = lambda j, *more: self.S.main([str(a), str(m), "--out", out, *more], judge=j, say=lambda *x, **k: None)
        j = self.stub(); j.marks = {}
        self.assertEqual(run(j), 0); n = len(j.calls)
        f = self.stub(); f.marks = {}
        self.assertEqual(run(f, "--fresh"), 0); self.assertEqual(len(f.calls), n, "--fresh reuses nothing")
        r2 = self.stub(); r2.marks = {}
        self.assertEqual(run(r2, "--repeat", "2"), 0); self.assertEqual(len(r2.calls), n, "a repeat shares no reading with repeat 1")
        one, two = json.loads(Path(out, "results.json").read_text()), json.loads(Path(out, "results-repeat-2.json").read_text())
        self.assertEqual((one["repeat"], two["repeat"]), (1, 2))
        self.assertTrue(Path(out, "readings", "model-run", "r2").is_dir()); self.assertIn("repeat 2 of the same paintings", Path(out, "SCORES-repeat-2.md").read_text())
        r2b = self.stub(); r2b.marks = {}
        self.assertEqual(run(r2b, "--repeat", "2"), 0); self.assertEqual(r2b.calls, [], "the same repeat again is the same scoring")
        k1 = json.loads(Path(out, "readings", "model-run", "single-j1-1.json").read_text())["cacheKey"]
        k2 = json.loads(Path(out, "readings", "model-run", "r2", "single-j1-1.json").read_text())["cacheKey"]
        self.assertNotEqual(k1, k2)

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
