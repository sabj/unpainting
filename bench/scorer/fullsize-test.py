"""fullsize.py on synthetic sheets with known edges, fills, flecks and lines; a fake judge stands in for the network."""
import base64, importlib.util, inspect, io, json, unittest
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

spec = importlib.util.spec_from_file_location('fullsize', Path(__file__).with_name('fullsize.py'))
fs = importlib.util.module_from_spec(spec); spec.loader.exec_module(fs)

W, H, MM = 600, 480, 100.0   # 6 px per mm, the same as a 1200 px plate on a 200 mm sheet
PX = W / MM


def sheet(L):
    """A grey image whose CIE L* is the given array (0-100)."""
    y = np.where(L > 8, ((L + 16) / 116) ** 3, L / 903.3)
    s = np.where(y <= 0.0031308, 12.92 * y, 1.055 * np.power(y, 1 / 2.4) - 0.055)
    v = np.clip(np.round(s * 255), 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([v, v, v]))


def step(sigma_mm, lo=40.0, hi=80.0):
    L = np.full((H, W), hi); L[:, : W // 2] = lo
    return ndi.gaussian_filter(L, sigma_mm * PX) if sigma_mm else L


def paint_field(L=50.0):
    """A painted sheet with a bare paper margin, so the paper level is known."""
    a = np.full((H, W), 96.0); a[60:420, 60:540] = L
    return a


class Edges(unittest.TestCase):
    def kinds(self, sigma_mm):
        e, _ = fs.edge_types(fs.lightness(sheet(step(sigma_mm))), PX)
        return e

    def test_a_crisp_step_is_hard(self):
        e = self.kinds(0)
        self.assertGreater(e['hard_share'], 0.95)
        self.assertEqual(e['variety'], 0.0)

    def test_a_one_millimetre_transition_is_firm(self):
        self.assertGreater(self.kinds(0.4)['firm_share'], 0.95)   # 10-90% width 1.0 mm

    def test_a_softened_edge_is_soft_and_still_found(self):
        e = self.kinds(1.5)                                       # 10-90% width 3.8 mm
        self.assertGreater(e['soft_share'], 0.95)
        self.assertGreater(e['edge_mm_per_cm2'], 0)

    def test_a_step_below_the_visible_threshold_is_not_an_edge(self):
        e, _ = fs.edge_types(fs.lightness(sheet(step(0, 60.0, 63.0))), PX)
        self.assertEqual(e['edge_mm_per_cm2'], 0)

    def test_variety_is_highest_for_an_even_mix(self):
        L = np.full((H, W), 85.0)
        L[:, :150] = 40; L[:, 450:] = 40
        mid = ndi.gaussian_filter(np.where(np.arange(W) < 300, 40.0, 85.0)[None, :].repeat(H, 0), 0.4 * PX)
        L[:, 225:375] = mid[:, 225:375]
        e, _ = fs.edge_types(fs.lightness(sheet(L)), PX)
        self.assertGreater(e['hard_share'], 0.2); self.assertGreater(e['firm_share'], 0.2)
        self.assertGreater(e['variety'], 0.5)


class Fills(unittest.TestCase):
    def measure(self, L):
        Ls = fs.lightness(sheet(L))
        e, edge_map = fs.edge_types(Ls, PX)
        return fs.fills(Ls, PX, edge_map, e['hard_contrast_share'])[0]

    def test_flat_bands_with_hard_rims_are_posterised(self):
        L = np.full((H, W), 96.0)
        for i, v in enumerate((30.0, 45.0, 60.0, 75.0)):
            L[40:440, 40 + i * 130: 170 + i * 130] = v
        f = self.measure(L)
        self.assertGreater(f['flat_share'], 0.8)
        self.assertGreater(f['posterisation'], 0.8)

    def test_shapes_too_narrow_to_have_open_wash_read_as_not_flat(self):
        L = np.full((H, W), 96.0)
        for i in range(20):
            L[40:440, 40 + i * 24: 64 + i * 24] = 30.0 + 15 * (i % 4)   # 4 mm bands
        f = self.measure(L)
        self.assertEqual((f['open_share'], f['flat_share'], f['posterisation']), (0.0, 0.0, 0.0))

    def test_a_graded_wash_is_not(self):
        L = np.full((H, W), 96.0)
        L[40:440, 40:560] = np.linspace(30, 85, 520)[None, :]     # about 0.6 L* per mm
        f = self.measure(L)
        self.assertLess(f['flat_share'], 0.05)
        self.assertLess(f['posterisation'], 0.05)


class Flecks(unittest.TestCase):
    def measure(self, L):
        Ls = fs.lightness(sheet(L))
        painted = fs.fills(Ls, PX, np.zeros(Ls.shape, np.uint8), 1.0)[1]
        return fs.flecks(Ls, PX, painted)[0]

    def test_counts_specks_and_slashes_inside_paint(self):
        L = paint_field()
        for i in range(5):
            L[100:106, 100 + 40 * i: 106 + 40 * i] = 96           # five 1 mm white specks
        L[200:203, 100:220] = 96                                  # a 0.5 mm by 20 mm white slash
        L[300:303, 100:160] = 70                                  # a pale slash, 10 mm long
        k = self.measure(L)
        self.assertEqual((k['white_flecks'], k['white_slashes'], k['pale_flecks'], k['pale_slashes']), (5, 1, 0, 1))
        self.assertAlmostEqual(k['white_slash_mm'], 20, delta=1)
        self.assertAlmostEqual(k['pale_slash_mm'], 10, delta=1)
        cm2 = 360 * 480 / PX ** 2 / 100
        self.assertAlmostEqual(k['white_per_cm2'], (5 + k['white_slash_mm'] / 2) / cm2, delta=0.03)   # the painted mask is read after smoothing, so it is a little wider

    def test_a_reserved_shape_and_a_ragged_edge_are_not_flecks(self):
        L = paint_field()
        L[150:200, 150:200] = 96                                  # an 8 mm reserve
        L[60:75, 300:304] = 96                                    # a notch running in from the bare margin
        k = self.measure(L)
        self.assertEqual((k['white_flecks'], k['white_slashes'], k['pale_flecks'], k['pale_slashes']), (0, 0, 0, 0))

    def test_paper_tooth_sparkle_is_counted_apart(self):
        L = paint_field()
        L[100:102, 100:102] = 96                                  # 0.33 mm
        k = self.measure(L)
        self.assertEqual((k['grain'], k['white_flecks'], k['white_per_cm2']), (1, 0, 0.0))

    def test_a_clean_wash_scores_ten_and_a_rash_scores_low(self):
        clean = fs.classic_fullsize(sheet(paint_field()), MM)
        self.assertEqual(clean['scores']['flecks'], 10.0)
        L = paint_field()
        rng = np.random.default_rng(0)
        for y, x in zip(rng.integers(70, 400, 400), rng.integers(70, 520, 400)):
            L[y:y + 5, x:x + 5] = 96
        self.assertLess(fs.classic_fullsize(sheet(L), MM)['scores']['flecks'], 5.0)


class TargetFree(unittest.TestCase):
    def test_the_classic_part_cannot_take_a_target(self):
        for f in (fs.classic_fullsize, fs.edge_types, fs.fills, fs.flecks, fs.vision_tiles, fs.judged_tiles):
            self.assertNotIn('target', inspect.signature(f).parameters)

    def test_no_function_or_flag_takes_a_target(self):
        for f in (fs.score, fs.aggregate_tiles, fs._tile_content):
            self.assertNotIn('target', inspect.signature(f).parameters)
        self.assertNotIn('--target', Path(fs.__file__).read_text())

    def test_pale_marks_do_not_change_the_score(self):
        L = paint_field(); L[300:303, 100:400] = 70
        self.assertEqual(fs.classic_fullsize(sheet(L), MM)['scores']['flecks'], 10.0)


def p_path(img, case, name='p.png'):
    import tempfile
    d = tempfile.mkdtemp(); case.addCleanup(lambda: __import__('shutil').rmtree(d, ignore_errors=True))
    f = str(Path(d) / name); img.save(f)
    return f


class Tiles(unittest.TestCase):
    def test_tiles_cover_the_sheet_at_one_to_one(self):
        boxes = fs.tile_boxes(1200, 1036, 6.0)
        self.assertEqual(len(boxes), 12)
        cover = np.zeros((1036, 1200), bool)
        for t in boxes:
            x0, y0, x1, y1 = t['box']
            self.assertEqual((x1 - x0, y1 - y0), (384, 384))
            cover[y0:y1, x0:x1] = True
        self.assertTrue(cover.all())

    def test_bare_paper_tiles_are_skipped_and_tiles_are_sent_unresized(self):
        import score_painting as sp
        L = np.full((768, 768), 96.0); L[:300, :300] = 40
        img = sheet(L)
        tiles = fs.judged_tiles(img, 128.0)
        self.assertEqual([(t['row'], t['col']) for t in tiles], [(0, 0)])
        content = fs._tile_content(img, tiles[0], 'wash', 128.0, sp)
        sizes = [Image.open(io.BytesIO(base64.b64decode(c['image_url']['url'].split(',')[1]))).size for c in content[1:]]
        self.assertEqual(sizes, [(384, 384), (384, 384)])
        self.assertNotIn('target', content[0]['text'].lower())
        self.assertEqual(len(content), 3)


GOOD = {"edges": 6, "washes": 5, "lines": None, "artefacts": 7, "overall": 6, "flags": ["white_flecks", "made_up"]}


class Vision(unittest.TestCase):
    def setUp(self):
        L = np.full((768, 768), 96.0); L[40:730, 40:730] = 45
        self.img = sheet(L)

    def test_parse_keeps_null_lines_and_known_flags_only(self):
        d = fs.parse_tile('```json\n' + json.dumps(GOOD) + '\n```')
        self.assertIsNone(d['lines']); self.assertEqual(d['flags'], ['white_flecks'])
        self.assertIsNone(fs.parse_tile('{"edges":5}'))

    def test_median_per_tile_mean_per_judge_and_worst_tile(self):
        calls = []

        def post(model, messages, **_):
            calls.append(model)
            text = messages[0]['content'][0]['text']
            low = 'top left' in text
            return json.dumps({**GOOD, "overall": 2 if low else 6, "flags": ["white_flecks"] if low else []}), {}

        r = fs.vision_tiles(self.img, 'wash', 128.0, calls=1, post=post)
        self.assertEqual(len(calls), 3 * 4)
        self.assertTrue(r['complete'])
        self.assertEqual((r['overall'], r['worst']), (5.0, 2.0))
        self.assertIsNone(r['criteria']['lines'])
        self.assertEqual(r['flagPeak']['white_flecks'], 1.0)
        self.assertEqual(r['flagShare']['white_flecks'], 0.25)

    def test_a_judge_with_no_valid_reply_makes_it_incomplete(self):
        def post(model, messages, **_):
            if 'Qwen' in model:
                raise RuntimeError('HTTP 402')
            return json.dumps(GOOD), {}

        r = fs.score(p_path(self.img, self), 'wash', 128.0, calls=1, post=post)
        self.assertFalse(r['complete']); self.assertIsNone(r['craft'])
        self.assertEqual(r['vision']['errors']['Qwen/Qwen3.5-9B'], 4)

    def test_craft_is_the_mean_of_vision_and_classic(self):
        r = fs.score(p_path(self.img, self), 'wash', 128.0, calls=3, post=lambda *a, **k: (json.dumps(GOOD), {}))
        self.assertTrue(r['complete'])
        self.assertEqual(r['craft'], round((6 + r['classic']) / 2, 2))
        self.assertEqual(r['vision']['minValidCalls'], 2)


if __name__ == '__main__':
    unittest.main()
