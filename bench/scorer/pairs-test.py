"""pairs.py with fake judges in place of the network: what each kind of judge does to the verdict."""
import base64, importlib.util, inspect, io, json, os, tempfile, unittest
from pathlib import Path

import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location('pairs', Path(__file__).with_name('pairs.py'))
pr = importlib.util.module_from_spec(spec); spec.loader.exec_module(pr)

W, H, MM = 768, 384, 128.0   # two 64 mm tiles side by side, 6 px per mm


def plate(level, noise_seed=None):
    """A painted sheet (mid grey paint, a paper margin). level sets the paint's lightness, so a fake judge can tell
    two plates apart by mean brightness."""
    a = np.full((H, W, 3), 250, np.uint8)
    a[20:-20, 20:-20] = level
    if noise_seed is not None:
        a[20:-20, 20:-20] += np.random.default_rng(noise_seed).integers(0, 3, (H - 40, W - 40, 1), dtype=np.uint8)
    return Image.fromarray(a)


def save(img, case, name):
    d = tempfile.mkdtemp(); case.addCleanup(lambda: __import__('shutil').rmtree(d, ignore_errors=True))
    f = os.path.join(d, name); img.save(f)
    return f


def images(messages):
    out = []
    for part in messages[0]['content']:
        if part['type'] == 'image_url':
            out.append(Image.open(io.BytesIO(base64.b64decode(part['image_url']['url'].split(',', 1)[1]))))
    return out


def darker_wins(model, messages, max_tokens=0):
    """A judge that sees the paint: always picks the darker crop, wherever it is shown."""
    one, two = [np.asarray(im, float).mean() for im in images(messages)]
    return json.dumps({'choice': 1 if one < two else 2, 'reason': 'darker'}), {}


def always_first(model, messages, max_tokens=0):
    return '{"choice":1,"reason":"habit"}', {}


class Parsing(unittest.TestCase):
    def test_reads_a_choice_and_refuses_anything_else(self):
        self.assertEqual(pr.parse_choice('```json\n{"choice":2,"reason":"softer edges"}\n```')['choice'], 2)
        self.assertEqual(pr.parse_choice('thinking {"x":1} then {"choice":"1","reason":""}')['choice'], 1)
        for bad in ['', 'Image 2', '{"choice":3}', '{"choice":null}', '{"choice":"both"}']:
            self.assertIsNone(pr.parse_choice(bad), bad)


class SignTest(unittest.TestCase):
    def test_exact_two_sided_values(self):
        self.assertEqual(pr.sign_test(0, 0), 1.0)
        self.assertAlmostEqual(pr.sign_test(6, 6), 2 / 64)
        self.assertAlmostEqual(pr.sign_test(5, 5), 2 / 32)
        self.assertAlmostEqual(pr.sign_test(10, 12), 2 * (1 + 12 + 66) / 4096)
        self.assertEqual(pr.sign_test(6, 12), 1.0)
        self.assertAlmostEqual(pr.sign_test(2, 12), pr.sign_test(10, 12))

    def test_verdict_names_a_winner_only_when_decided(self):
        self.assertEqual(pr.verdict(0, 6)['winner'], 'b')
        self.assertEqual(pr.verdict(6, 0)['winner'], 'a')
        self.assertIsNone(pr.verdict(0, 5)['winner'])    # 5 of 5 is p = 0.0625
        self.assertIsNone(pr.verdict(4, 8)['winner'])
        self.assertIsNone(pr.verdict(0, 0)['winner'])


class Tiles(unittest.TestCase):
    def test_paintings_of_different_size_are_refused(self):
        with self.assertRaisesRegex(ValueError, 'differ in size'):
            pr.paired_tiles(plate(120), plate(120).resize((700, 384)), MM)

    def test_bare_paper_is_skipped_and_identical_crops_are_marked(self):
        a = plate(120); b = plate(120)
        b_arr = np.asarray(b).copy(); b_arr[20:-20, 400:-20] = 90; b = Image.fromarray(b_arr)
        t = pr.paired_tiles(a, b, MM)
        self.assertEqual([(x['col'], x['identical']) for x in t], [(0, True), (1, False)])
        blank = Image.fromarray(np.full((H, W, 3), 250, np.uint8))
        self.assertEqual(pr.paired_tiles(blank, blank, MM), [])

    def test_a_tile_painted_in_only_one_painting_is_still_judged(self):
        a = plate(120)
        b_arr = np.asarray(a).copy(); b_arr[:, 384:] = 250
        self.assertEqual(len(pr.paired_tiles(a, Image.fromarray(b_arr), MM)), 2)


class Compare(unittest.TestCase):
    def run_pair(self, post, a=None, b=None, **kw):
        a = a or plate(140, 1); b = b or plate(90, 2)
        return pr.compare(save(a, self, 'a.png'), save(b, self, 'b.png'), 'wash', MM, post=post, **kw)

    def test_a_judge_that_sees_the_paint_gives_every_tile_to_the_same_painting(self):
        r = self.run_pair(darker_wins)
        self.assertTrue(r['complete'])
        self.assertEqual((r['tilesA'], r['tilesB'], r['ties']), (0, 2, 0))
        self.assertEqual(r['judgeVotes'], {'a': 0, 'b': 6, 'split': 0})
        self.assertEqual({j['firstShare'] for j in r['per_judge'].values()}, {0.5})
        self.assertFalse(r['decided'])   # two tiles cannot reach 0.05
        self.assertEqual(len(r['calls']), 12)

    def test_swapping_the_paintings_swaps_the_result(self):
        r = self.run_pair(darker_wins, a=plate(90, 2), b=plate(140, 1))
        self.assertEqual((r['tilesA'], r['tilesB']), (2, 0))

    def test_a_judge_that_always_picks_the_first_image_votes_for_nothing(self):
        r = self.run_pair(always_first)
        self.assertTrue(r['complete'])
        self.assertEqual((r['tilesA'], r['tilesB'], r['ties']), (0, 0, 2))
        self.assertEqual(r['judgeVotes'], {'a': 0, 'b': 0, 'split': 6})
        self.assertEqual({j['firstShare'] for j in r['per_judge'].values()}, {1.0})
        self.assertIsNone(r['winner'])

    def test_a_painting_against_itself_makes_no_call_and_no_winner(self):
        calls = []
        r = self.run_pair(lambda *a, **k: calls.append(1) or always_first(*a), a=plate(120), b=plate(120))
        self.assertEqual(calls, [])
        self.assertTrue(r['complete'])
        self.assertEqual((r['tilesA'], r['tilesB'], r['ties'], r['winner']), (0, 0, 2, None))

    def test_one_order_missing_means_no_vote_and_an_incomplete_judge(self):
        def flaky(model, messages, max_tokens=0):
            if model.startswith('Qwen'):
                one, two = [np.asarray(im, float).mean() for im in images(messages)]
                if one < two:   # fails whenever the darker painting comes first
                    raise RuntimeError('HTTP 402')
            return darker_wins(model, messages)
        r = self.run_pair(flaky)
        self.assertFalse(r['complete'])
        self.assertNotIn('winner', r)
        self.assertEqual(r['per_judge']['Qwen/Qwen3.5-9B']['answered'], 0)
        self.assertEqual(r['errors']['Qwen/Qwen3.5-9B'], 2)

    def test_an_unreadable_reply_is_asked_again_with_more_room(self):
        seen = []
        def slow(model, messages, max_tokens=0):
            seen.append(max_tokens)
            return ('', {}) if max_tokens < 16000 else darker_wins(model, messages)
        r = self.run_pair(slow)
        self.assertTrue(r['complete'])
        self.assertEqual(sorted(set(seen)), [8000, 16000])

    def test_tiles_are_sent_at_their_own_pixels_and_the_target_has_no_way_in(self):
        sizes = set()
        def post(model, messages, max_tokens=0):
            sizes.update(im.size for im in images(messages))
            self.assertEqual(len(images(messages)), 2)
            return darker_wins(model, messages)
        self.run_pair(post)
        self.assertEqual(sizes, {(384, 384)})
        for fn in (pr.compare, pr.paired_tiles, pr.contact_sheet, pr.aggregate):
            self.assertNotIn('target', inspect.signature(fn).parameters)
        self.assertNotIn('--target', Path(pr.__file__).read_text())

    def test_odd_call_counts_are_refused(self):
        for calls in (1, 3, 0):
            with self.assertRaisesRegex(ValueError, 'even'):
                self.run_pair(darker_wins, calls=calls)

    def test_no_vision_lists_tiles_without_a_judge(self):
        r = pr.compare(save(plate(140, 1), self, 'a.png'), save(plate(90, 2), self, 'b.png'), 'wash', MM, vision=False)
        self.assertFalse(r['complete']); self.assertEqual(len(r['tiles']), 2)


class Aggregate(unittest.TestCase):
    TILES = [{'row': 0, 'col': c, 'box': (0, 0, 1, 1), 'where': 'x', 'identical': False} for c in range(12)]
    J = ['j1', 'j2', 'j3']

    def picks(self, fn):
        return {(j, i): [('ab', fn(j, i, 'ab')), ('ba', fn(j, i, 'ba'))] for j in self.J for i in range(12)}

    def test_ten_of_twelve_tiles_decides_and_nine_does_not(self):
        r = pr.aggregate(self.TILES, self.picks(lambda j, i, o: 'b' if i < 10 else 'a'), self.J, 2)
        self.assertEqual((r['tilesA'], r['tilesB'], r['winner']), (2, 10, 'b'))
        r = pr.aggregate(self.TILES, self.picks(lambda j, i, o: 'b' if i < 9 else 'a'), self.J, 2)
        self.assertEqual((r['tilesA'], r['tilesB'], r['winner'], r['decided']), (3, 9, None, False))

    def test_a_tile_goes_to_the_majority_of_judges_and_ties_when_they_split(self):
        def fn(j, i, o):
            if i == 0: return 'b' if j != 'j3' else 'a'      # two judges to one
            if i == 1: return 'b' if j == 'j1' else 'a' if j == 'j2' else o[0]   # one each, one position-led
            return 'b'
        r = pr.aggregate(self.TILES, self.picks(fn), self.J, 2)
        self.assertEqual(r['tiles'][0]['prefers'], 'b')
        self.assertIsNone(r['tiles'][1]['prefers'])
        self.assertEqual((r['tilesA'], r['tilesB'], r['ties']), (0, 11, 1))

    def test_a_judge_must_answer_three_in_five_tiles(self):
        p = self.picks(lambda j, i, o: 'b')
        for i in range(5):
            p[('j3', i)] = p[('j3', i)][:1]
        self.assertFalse(pr.aggregate(self.TILES, p, self.J, 2)['complete'])   # 7 of 12, needs 8
        p[('j3', 0)] = [('ab', 'b'), ('ba', 'b')]
        self.assertTrue(pr.aggregate(self.TILES, p, self.J, 2)['complete'])


class Pool(unittest.TestCase):
    def test_pools_tiles_and_names_a_plate_decided_the_other_way(self):
        won = {'complete': True, 'tilesA': 1, 'tilesB': 11, 'ties': 0, **pr.verdict(1, 11)}
        even = {'complete': True, 'tilesA': 5, 'tilesB': 6, 'ties': 1, **pr.verdict(5, 6)}
        lost = {'complete': True, 'tilesA': 6, 'tilesB': 0, 'ties': 0, **pr.verdict(6, 0)}
        r = pr.pool([won, even])
        self.assertEqual((r['tilesA'], r['tilesB'], r['winner'], r['platesAgainst']), (6, 17, 'b', []))
        r = pr.pool([won, won, lost])
        self.assertEqual((r['winner'], r['platesAgainst']), ('b', [2]))
        self.assertFalse(pr.pool([won, {'complete': False}])['complete'])


class Sheet(unittest.TestCase):
    def test_sheet_is_blind_and_answers_score_back_to_the_paintings(self):
        a, b = save(plate(140, 1), self, 'a.png'), save(plate(90, 2), self, 'b.png')
        d = tempfile.mkdtemp(); self.addCleanup(lambda: __import__('shutil').rmtree(d, ignore_errors=True))
        pages = pr.contact_sheet(a, b, MM, d, seed=3)
        self.assertEqual(len(pages), 1)
        page = Image.open(pages[0])
        self.assertLess(os.path.getsize(pages[0]), 4 << 20)
        self.assertNotIn(b'"left"', Path(d, 'answers.txt').read_bytes())
        key = json.loads(Path(d, 'key.json').read_text())
        self.assertEqual(len(key['pairs']), 2)
        # a person who always picks the darker side picks B on every pair, whichever side it was on
        px = np.asarray(page.convert('L'), float)
        side = 384
        lines = []
        for k in key['pairs']:
            x = 16 + ((k['n'] - 1) % 2) * (2 * side + 12 + 16); y = 16 + 22
            left, right = px[y:y + side, x:x + side].mean(), px[y:y + side, x + side + 12:x + 2 * side + 12].mean()
            lines.append(f"{k['n']} {'L' if left < right else 'R'}\n")
        ans = os.path.join(d, 'filled.txt'); Path(ans).write_text('# mine\n' + ''.join(lines))
        r = pr.score_answers(ans, os.path.join(d, 'key.json'))
        self.assertEqual((r['tilesA'], r['tilesB'], r['ties']), (0, 2, 0))

    def test_unfinished_or_unreadable_answers_are_refused(self):
        d = tempfile.mkdtemp(); self.addCleanup(lambda: __import__('shutil').rmtree(d, ignore_errors=True))
        key = os.path.join(d, 'key.json'); Path(key).write_text(json.dumps({'pairs': [{'n': 1, 'left': 'a'}, {'n': 2, 'left': 'b'}]}))
        for text, why in (('1 L\n', 'no answer'), ('1 L\n2 maybe\n', 'cannot read'), ('1 L\n1 R\n', 'twice'), ('1 L\n3 R\n', 'unknown')):
            f = os.path.join(d, 'a.txt'); Path(f).write_text(text)
            with self.assertRaisesRegex(ValueError, why):
                pr.score_answers(f, key)
        Path(f).write_text('1 L\n2 =\n')
        self.assertEqual(pr.score_answers(f, key)['ties'], 1)


if __name__ == '__main__':
    unittest.main()
