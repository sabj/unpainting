"""versus.py: the win-rate maths, judge agreement, repeatability, and J3's margin vote in pairs.py."""
import importlib.util, json, os, sys, tempfile, unittest
from pathlib import Path
from unittest import mock

import numpy as np
from PIL import Image

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import versus as vs  # noqa: E402
import pairs as pr  # noqa: E402


def run(tiles, per_judge=('j1', 'j2', 'j3'), seed=1, **extra):
    """A pairs.compare result from tile votes, one string per tile ('aab' is j1 a, j2 a, j3 b; '-' is no vote)."""
    rows, ta, tb, ties = [], 0, 0, 0
    for t in tiles:
        votes = {j: v for j, v in zip(per_judge, t) if v != '-'}
        va, vb = sum(v == 'a' for v in votes.values()), sum(v == 'b' for v in votes.values())
        rows.append({'votes': votes, 'prefers': 'a' if va > vb else 'b' if vb > va else None, 'identical': False})
        ta += va > vb; tb += vb > va; ties += va == vb
    return {'complete': True, 'seed': seed, 'tiles': rows, 'tilesA': ta, 'tilesB': tb, 'ties': ties, 'per_judge': {j: {} for j in per_judge}, **extra}


class WinRate(unittest.TestCase):
    def test_wilson_matches_known_values(self):
        lo, hi = vs.wilson(0.5, 100)
        self.assertAlmostEqual(lo, 0.4038, 3); self.assertAlmostEqual(hi, 0.5962, 3)
        lo, hi = vs.wilson(0.0, 30)                       # never zero width at the ends
        self.assertEqual(lo, 0.0); self.assertAlmostEqual(hi, 0.1135, 3)
        lo, hi = vs.wilson(7 / 30, 30)
        self.assertAlmostEqual(lo, 0.1179, 3); self.assertAlmostEqual(hi, 0.4093, 3)
        self.assertEqual(vs.wilson(0.3, 0), [0.0, 1.0])

    def test_ties_count_half_and_decided_means_the_interval_excludes_half(self):
        r = vs.win_rate(7, 23, 0)
        self.assertEqual((r['winRate'], r['tiles'], r['decided']), (0.233, 30, True))
        self.assertLess(r['interval'][1], 0.5)
        r = vs.win_rate(2, 12, 16)                        # (2 + 8) / 30
        self.assertEqual((r['winRate'], r['decided']), (0.333, False))
        self.assertEqual(vs.win_rate(10, 10, 0)['winRate'], 0.5)
        self.assertTrue(vs.win_rate(25, 5, 0)['decided'])
        self.assertEqual(vs.win_rate(0, 0, 0), {'winRate': None, 'interval': None, 'tiles': 0, 'wins': 0, 'losses': 0, 'ties': 0, 'decided': False})

    def test_summary_averages_repeats_but_keeps_one_runs_tile_count(self):
        a = run(['aaa'] * 8 + ['bbb'] * 2, judgeVersion='J3', judgeEndpoint='localhost:11434', judgeModels={'j1': 'sha'})
        b = run(['aaa'] * 6 + ['bbb'] * 4, seed=2)
        s = vs.summarise([a, b])
        self.assertEqual((s['winRate'], s['tiles'], s['reading'], s['decided']), (0.3, 10, 'not told apart from Auto', False))
        self.assertEqual(s['interval'], [round(x, 3) for x in vs.wilson(0.3, 10)])        # n is 10, not 20
        self.assertEqual([r['winRate'] for r in s['repeats']], [0.2, 0.4])
        self.assertEqual((s['judgeVersion'], s['judgeEndpoint'], s['judgeModels']), ('J3', 'localhost:11434', {'j1': 'sha'}))
        self.assertEqual(s['repeatability'], {'measured': True, 'tileAgreement': 0.8, 'winRateRange': 0.2})
        self.assertEqual(vs.summarise([run(['aaa'] * 30)])['reading'], 'loses to Auto')
        self.assertEqual(vs.summarise([run(['bbb'] * 30)])['reading'], 'beats Auto')
        self.assertEqual(vs.summarise([run(['aaa'])])['repeatability']['measured'], False)

    def test_an_incomplete_run_gives_no_win_rate(self):
        s = vs.summarise([run(['aaa']), {'complete': False}])
        self.assertEqual((s['complete'], s['winRate'], s['interval']), (False, None, None))

    def test_judge_agreement_counts_only_tiles_where_both_voted(self):
        g = vs.judge_agreement(run(['aaa', 'aab', 'ab-', 'bb-']))
        self.assertEqual(g['pairs']['j1 | j2'], {'tiles': 4, 'agree': 0.75})
        self.assertEqual(g['pairs']['j1 | j3'], {'tiles': 2, 'agree': 0.5})
        self.assertEqual(g['pairs']['j2 | j3'], {'tiles': 2, 'agree': 0.5})
        self.assertEqual((g['mean'], g['unanimous']), (0.583, 0.5))


class MarginVote(unittest.TestCase):
    def test_choice_logit_reads_the_choice_token(self):
        tok = lambda t, lp, tops=(): {'token': t, 'logprob': lp, 'top_logprobs': [{'token': a, 'logprob': b} for a, b in tops]}
        lps = [tok('{"', -0.01), tok('choice', 0), tok('":', 0), tok('1', -0.2, [('1', -0.2), ('2', -1.7), ('3', -9)]), tok('}', 0)]
        self.assertAlmostEqual(pr.choice_logit(lps), 1.5)
        self.assertAlmostEqual(pr.choice_logit([tok(' 2}', -0.1, [(' 2}', -0.1), ('1', -2.4)])]), -2.3)
        # the other answer is not listed: it is at most as likely as the least likely alternative shown
        self.assertAlmostEqual(pr.choice_logit([tok('1', -0.001, [('1', -0.001), ('{', -8), ('"', -11)])]), 10.999)
        self.assertIsNone(pr.choice_logit([tok('neither', -0.1)]))
        # an answer that names neither image is still read from what it gave the two real answers
        self.assertAlmostEqual(pr.choice_logit([tok('1', -0.1, [('1', -0.1), ('3', -3.0), ('2', -4.5)])], ('2', '3')), -1.5)
        self.assertAlmostEqual(pr.choice_logit([tok('2}\n```', -0.2, [('2', -0.2), ('3', -2.2)])], ('2', '3')), 2.0)
        self.assertIsNone(pr.choice_logit([tok('7', -0.1, [('7', -0.1), ('8', -3.0)])]))
        self.assertIsNone(pr.choice_logit([]))
        self.assertIsNone(pr.choice_logit(None))

    def test_a_position_habit_cancels_and_the_preference_remains(self):
        tiles = [{'row': 0, 'col': c, 'box': (0, 0, 1, 1), 'where': 'x', 'identical': False} for c in range(3)]
        m = {('j', 0): {'ab': 5.0, 'ba': 3.0},      # likes the first image a lot, and painting A a little
             ('j', 1): {'ab': 2.0, 'ba': 6.0},      # the same habit, and painting B
             ('j', 2): {'ab': 4.0, 'ba': 4.0}}      # habit only
        r = pr.aggregate_margins(tiles, m, ['j'])
        self.assertEqual([t['prefers'] for t in r['tiles']], ['a', 'b', None])
        self.assertEqual([t['prefA']['j'] for t in r['tiles']], [1.0, -2.0, 0.0])
        self.assertEqual((r['tilesA'], r['tilesB'], r['ties'], r['per_judge']['j']['positionHabit']), (1, 1, 1, 4.0))
        self.assertTrue(r['complete'])

    def test_a_judge_read_in_one_order_only_casts_no_vote_and_can_make_the_result_incomplete(self):
        tiles = [{'row': 0, 'col': c, 'box': (0, 0, 1, 1), 'where': 'x', 'identical': False} for c in range(2)]
        r = pr.aggregate_margins(tiles, {('j', 0): {'ab': 1.0}, ('j', 1): {'ab': 1.0, 'ba': None}}, ['j'])
        self.assertEqual((r['complete'], r['per_judge']['j']['answered'], r['ties']), (False, 0, 2))
        self.assertNotIn('winner', r)

    def test_the_local_route_votes_by_margin_one_model_at_a_time_and_records_the_route(self):
        keep = {k: v for k, v in os.environ.items() if not k.startswith(('JUDGE_', 'BENCH_'))}
        with mock.patch.dict(os.environ, {**keep, 'JUDGE_ROUTE': 'local', 'JUDGE_LOCAL_PANEL': 'm1,m2'}, clear=True):
            spec = importlib.util.spec_from_file_location('score_painting', HERE / 'score_painting.py')
            sp = importlib.util.module_from_spec(spec); spec.loader.exec_module(sp)
        d = tempfile.mkdtemp(); self.addCleanup(lambda: __import__('shutil').rmtree(d, ignore_errors=True))
        files = []
        for name, level in (('auto.png', 90), ('p.png', 160)):
            a = np.full((384, 768, 3), 250, np.uint8); a[20:-20, 20:-20] = level
            f = os.path.join(d, name); Image.fromarray(a).save(f); files.append(f)
        order = []

        def post(model, messages, max_tokens=0):
            """Always answers 1, but less surely when the darker crop (Auto) is second: a pure position picker by
            its answers, with a real preference for the darker painting in its margins."""
            import base64, io
            order.append(model)
            self.assertIn('{"choice":1} or {"choice":2}', messages[0]['content'][0]['text'])
            one, two = [np.asarray(Image.open(io.BytesIO(base64.b64decode(p['image_url']['url'].split(',', 1)[1]))), float).mean()
                        for p in messages[0]['content'] if p['type'] == 'image_url']
            lp1, lp2 = (-0.05, -3.0) if one < two else (-0.4, -1.1)
            return '{"choice":1}', {'logprobs': [{'token': '1', 'logprob': lp1, 'top_logprobs': [{'token': '1', 'logprob': lp1}, {'token': '2', 'logprob': lp2}]}]}

        record = {'judgeVersion': 'J3', 'judgeRoute': 'local', 'judgeEndpoint': 'localhost:11434', 'judgeModels': {'m1': 'd1', 'm2': 'd2'}}
        with mock.patch.dict(sys.modules, {'score_painting': sp}), mock.patch.object(sp.local_route, 'record', return_value=record):
            r = vs.versus(files[0], files[1], 'style', 128.0, repeats=2, post=post)
            with self.assertRaisesRegex(ValueError, 'exactly 2 calls'):
                pr.compare(files[0], files[1], 'style', 128.0, calls=4, post=post)
        self.assertEqual(order[:4], ['m1'] * 4)                       # grouped by model: no swapping
        self.assertEqual(order[:8].count('m2'), 4)
        run1 = r['runs'][0]
        self.assertEqual((run1['vote'], run1['tilesA'], run1['tilesB'], run1['winner']), ('margin', 2, 0, None))
        self.assertEqual(run1['strictVote']['tilesA'], 0)             # by answers alone it never voted
        self.assertEqual(run1['strictVote']['firstShare'], {'m1': 1.0, 'm2': 1.0})
        self.assertEqual((r['winRate'], r['reading'], r['judgeVersion'], r['judgeEndpoint'], r['judgeModels']),
                         (0.0, 'not told apart from Auto', 'J3', 'localhost:11434', {'m1': 'd1', 'm2': 'd2'}))
        self.assertEqual(r['repeatability'], {'measured': True, 'tileAgreement': 1.0, 'winRateRange': 0.0})
        self.assertEqual(r['judgeAgreement'][0]['mean'], 1.0)


class AgainstTarget(unittest.TestCase):
    def test_gap_closed(self):
        self.assertEqual(vs.gap_closed(0.1, 0.1), 0.0)
        self.assertEqual(vs.gap_closed(0.3, 0.1), 0.5)
        self.assertEqual(vs.gap_closed(0.5, 0.1), 1.0)
        self.assertEqual(vs.gap_closed(0.0, 0.1), -0.25)
        self.assertIsNone(vs.gap_closed(0.4, 0.5))
        self.assertIsNone(vs.gap_closed(None, 0.1))

    def test_the_graded_rate_moves_when_every_tile_is_lost(self):
        tiles = [{'row': 0, 'col': c, 'box': (0, 0, 1, 1), 'where': 'x', 'identical': False} for c in range(2)]
        near = pr.aggregate_margins(tiles, {('j', 0): {'ab': 0.2, 'ba': -0.2}, ('j', 1): {'ab': 0.4, 'ba': 0.0}}, ['j'])
        far = pr.aggregate_margins(tiles, {('j', 0): {'ab': 4.0, 'ba': -4.0}, ('j', 1): {'ab': 6.0, 'ba': -2.0}}, ['j'])
        self.assertEqual((near['tilesB'], far['tilesB']), (0, 0))            # both lose every tile to A
        self.assertAlmostEqual(near['softB'], 0.4502, 3)                     # sigmoid(-0.2)
        self.assertAlmostEqual(far['softB'], 0.018, 3)                       # sigmoid(-4)
        self.assertEqual(vs.summarise([{**near, 'seed': 1}])['softWinRate'], 0.45)

    def test_both_questions_are_asked_apart_and_never_name_the_target(self):
        for q, text in pr.QUESTIONS.items():
            self.assertNotIn('target', text.lower(), q)
            self.assertNotIn('original', text.lower(), q)
            self.assertIn('{{"choice":1}} or {{"choice":2}}', text)
        self.assertIn('shows the subject better', pr.QUESTIONS['subject'])
        self.assertIn('craft alone', pr.QUESTIONS['craft'])
        with self.assertRaisesRegex(ValueError, 'unknown question'):
            pr.compare('a', 'b', 's', 100.0, question='beauty')

    def test_versus_target_runs_each_question_with_the_target_as_a_and_resizes_only_the_target(self):
        d = tempfile.mkdtemp(); self.addCleanup(lambda: __import__('shutil').rmtree(d, ignore_errors=True))
        t = os.path.join(d, 't.png'); p = os.path.join(d, 'p.png'); odd = os.path.join(d, 'odd.png')
        Image.new('RGB', (1536, 768), (90, 90, 90)).save(t); Image.new('RGB', (768, 384), (160, 160, 160)).save(p)
        Image.new('RGB', (500, 500), (0, 0, 0)).save(odd)
        seen = []

        def compare(a, b, style, plate_mm, calls, seed, post=None, question='look'):
            seen.append((question, a.size, b.size, seed))
            wins = 1 if question == 'craft' else 0
            return {**run(['bbb'] * wins + ['aaa'] * (4 - wins), seed=seed), 'softB': 0.1 + wins / 10, 'question': question}

        with mock.patch.object(pr, 'compare', compare):
            r = vs.versus_target(t, p, 'style', 128.0, repeats=1, seed=5)
            with self.assertRaisesRegex(ValueError, 'differ in shape'):
                vs.versus_target(odd, p, 'style', 128.0)
        self.assertEqual(seen, [('subject', (768, 384), (768, 384), 5), ('craft', (768, 384), (768, 384), 5)])
        self.assertEqual((r['mode'], r['targetResized'], r['complete']), ('target', True, True))
        self.assertEqual((r['questions']['subject']['winRate'], r['questions']['craft']['winRate']), (0.0, 0.25))
        self.assertEqual((r['questions']['subject']['softWinRate'], r['questions']['craft']['softWinRate']), (0.1, 0.2))
        self.assertEqual(r['questions']['subject']['reading'], 'loses to the target')
        self.assertEqual(r['questions']['subject']['repeats'][0]['ties'], 0)


if __name__ == '__main__':
    unittest.main()
