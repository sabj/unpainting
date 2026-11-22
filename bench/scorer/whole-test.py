"""whole.py with a fake local judge: both questions, both orders, the source shown, position habit cancelled."""
import importlib.util, os, sys, tempfile, unittest
from pathlib import Path
from unittest import mock

from PIL import Image

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import whole as wh  # noqa: E402


def local_sp(panel='m1,m2'):
    keep = {k: v for k, v in os.environ.items() if not k.startswith(('JUDGE_', 'BENCH_'))}
    with mock.patch.dict(os.environ, {**keep, 'JUDGE_ROUTE': 'local', 'JUDGE_LOCAL_PANEL': panel}, clear=True):
        spec = importlib.util.spec_from_file_location('score_painting', HERE / 'score_painting.py')
        sp = importlib.util.module_from_spec(spec); spec.loader.exec_module(sp)
    return sp


def lp(two, three):
    return {'logprobs': [{'token': '2' if two > three else '3', 'logprob': max(two, three), 'top_logprobs': [{'token': '2', 'logprob': two}, {'token': '3', 'logprob': three}]}]}


class Whole(unittest.TestCase):
    def test_summary_counts_votes_and_needs_every_judge(self):
        s = wh.summarise({'j1': 2.0, 'j2': -1.0, 'j3': 0.0})
        self.assertEqual((s['forAuto'], s['forPainting'], s['ties'], s['complete']), (1, 1, 1, True))
        self.assertEqual(s['votes'], {'j1': 'auto', 'j2': 'painting', 'j3': 'tie'})
        self.assertAlmostEqual(s['painting'], (0.1192 + 0.7311 + 0.5) / 3, 3)
        s = wh.summarise({'j1': 2.0, 'j2': None})
        self.assertEqual((s['complete'], s['painting'], s['forAuto']), (False, None, 1))

    def test_questions_are_separate_and_blind(self):
        self.assertEqual(list(wh.QUESTIONS), ['faithful', 'skill'])
        for text in wh.QUESTIONS.values():
            self.assertIn('{{"choice":2}} or {{"choice":3}}', text)
            self.assertNotIn('Auto', text)
        self.assertIn('Do not choose by which one is closer to the source', wh.QUESTIONS['skill'])

    def test_compare_shows_the_source_first_asks_both_orders_and_cancels_a_position_habit(self):
        sp = local_sp()
        d = tempfile.mkdtemp(); self.addCleanup(lambda: __import__('shutil').rmtree(d, ignore_errors=True))
        files = {}
        for name, level in (('source', 120), ('auto', 110), ('p', 230)):
            files[name] = os.path.join(d, name + '.png'); Image.new('RGB', (400, 300), (level,) * 3).save(files[name])
        seen = []

        def post(model, messages):
            """Leans to Image 2 by habit; on 'faithful' prefers the sheet nearer the source's grey, on 'skill' the paler one."""
            import base64, io
            import numpy as np
            parts = messages[0]['content']
            g = [float(np.asarray(Image.open(io.BytesIO(base64.b64decode(p['image_url']['url'].split(',', 1)[1])))).mean()) for p in parts[1:]]
            q = 'faithful' if 'more faithful' in parts[0]['text'] else 'skill'
            seen.append((model, q, len(g)))
            self.assertAlmostEqual(g[0], 120, delta=2)                      # the source is always Image 1
            want2 = abs(g[1] - g[0]) < abs(g[2] - g[0]) if q == 'faithful' else g[1] > g[2]
            return '{"choice":2}', lp(-0.1, -2.1) if want2 else lp(-0.5, -0.9)   # habit +1.2, preference +-0.8

        with mock.patch.dict(sys.modules, {'score_painting': sp}), mock.patch.object(sp.local_route, 'record', return_value={'judgeVersion': 'J3', 'judgeModels': {'m1': 'd'}}):
            r = wh.compare(files['source'], files['auto'], files['p'], 'wash', post=post)
        self.assertEqual([s[:2] for s in seen], [(m, q) for m in ('m1', 'm2') for q in ('faithful', 'faithful', 'skill', 'skill')])   # one model at a time
        self.assertTrue(all(n == 3 for _, _, n in seen))
        f, s = r['questions']['faithful'], r['questions']['skill']
        self.assertEqual((f['forAuto'], f['forPainting'], f['prefAuto']['m1']), (2, 0, 0.8))
        self.assertEqual((s['forAuto'], s['forPainting'], s['prefAuto']['m2']), (0, 2, -0.8))
        self.assertAlmostEqual(f['painting'], 0.31, 2); self.assertAlmostEqual(s['painting'], 0.69, 2)
        self.assertEqual((r['complete'], r['judgeVersion'], r['version']), (True, 'J3', 'whole-v1'))

    def test_an_unreadable_judge_makes_the_result_incomplete_and_remote_routes_are_refused(self):
        sp = local_sp('m1')
        d = tempfile.mkdtemp(); self.addCleanup(lambda: __import__('shutil').rmtree(d, ignore_errors=True))
        f = os.path.join(d, 'x.png'); Image.new('RGB', (40, 30), (9, 9, 9)).save(f)
        with mock.patch.dict(sys.modules, {'score_painting': sp}), mock.patch.object(sp.local_route, 'record', return_value={}):
            r = wh.compare(f, f, f, 'wash', post=lambda m, msgs: ('I cannot say', {'logprobs': [{'token': 'I', 'logprob': -0.1}]}))
        self.assertEqual((r['complete'], r['questions']['faithful']['painting']), (False, None))
        spec = importlib.util.spec_from_file_location('score_painting', HERE / 'score_painting.py')
        keep = {k: v for k, v in os.environ.items() if not k.startswith(('JUDGE_', 'BENCH_'))}
        with mock.patch.dict(os.environ, keep, clear=True):
            remote = importlib.util.module_from_spec(spec); spec.loader.exec_module(remote)
        with mock.patch.dict(sys.modules, {'score_painting': remote}), self.assertRaisesRegex(ValueError, 'JUDGE_ROUTE=local'):
            wh.compare(f, f, f, 'wash')


if __name__ == '__main__':
    unittest.main()
