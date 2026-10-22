"""Synthetic copy fidelity regressions, independent of the five artwork tests."""
import importlib.util
from pathlib import Path
import unittest
import cv2
import numpy as np

spec = importlib.util.spec_from_file_location('copy_lines', Path(__file__).with_name('copy-lines.py'))
copy = importlib.util.module_from_spec(spec); spec.loader.exec_module(copy)


class Fidelity(unittest.TestCase):
    def test_flat_and_wash_step_are_not_ink(self):
        im = np.full((100, 140, 3), 240, 'uint8'); im[:, 70:] = 140
        self.assertEqual(len(copy.plan(im)[0]), 0)

    def test_parallel_lines_short_marks_and_curve_survive(self):
        im = np.full((100, 140, 3), 255, 'uint8')
        cv2.line(im, (8, 10), (130, 10), (10,)*3, 1)
        cv2.line(im, (8, 14), (130, 14), (10,)*3, 1)
        cv2.line(im, (8, 25), (11, 25), (10,)*3, 1)
        cv2.ellipse(im, (70, 80), (35, 35), 0, 180, 360, (10,)*3, 1)
        lines, mask, skel, stats = copy.plan(im)
        points = np.concatenate([g['points'] for g in lines])
        self.assertTrue(np.any(np.linalg.norm(points-[9,25],axis=1)<1))
        self.assertGreater(np.sum(np.abs(points[:,1]-10)<.1),100)
        self.assertGreater(np.sum(np.abs(points[:,1]-14)<.1),100)
        self.assertEqual(stats['joins'],0)
        self.assertEqual(stats['budgetDrops'],0)
        self.assertTrue(any(g['length']>90 and min(p[1] for p in g['points'])>20 for g in lines))


class LineMap(unittest.TestCase):
    def test_simplification_preserves_short_marks_rings_and_source_ink(self):
        im = np.full((100, 140, 3), 255, 'uint8')
        cv2.line(im, (10, 20), (14, 20), (20,)*3, 1)
        cv2.circle(im, (40, 40), 3, (20,)*3, 1)
        cv2.ellipse(im, (75, 80), (35, 35), 0, 180, 360, (20,)*3, 1)
        base = copy.plan(im, 'line-map')
        simpler = copy.plan(im, 'line-map', 1.5)
        self.assertEqual(len(base[0]), len(simpler[0]))
        self.assertEqual(simpler[3]['budgetDrops'], 0)
        self.assertTrue(any(g['length'] <= 4 for g in simpler[0]))
        self.assertTrue(any(np.linalg.norm(np.array(g['points'][0])-g['points'][-1]) < .1
                            and g['length'] > 10 for g in simpler[0]))
        self.assertEqual(copy.plan(im)[0], copy.plan(im, 'ink', 1.5)[0])
        for invalid in (-1, 2.1, float('nan'), float('inf')):
            with self.assertRaises(ValueError): copy.plan(im, 'line-map', invalid)

    def test_simplification_does_not_close_an_open_arch(self):
        im = np.full((100, 140, 3), 255, 'uint8')
        cv2.ellipse(im, (70, 75), (35, 35), 0, 180, 360, (20,)*3, 1)
        base = copy.plan(im, 'line-map')[0]
        simpler = copy.plan(im, 'line-map', 1.5)[0]
        self.assertEqual(len(base), len(simpler))
        for a, b in zip(base, simpler):
            self.assertEqual(a['points'][0], b['points'][0])
            self.assertEqual(a['points'][-1], b['points'][-1])
            self.assertGreater(np.linalg.norm(np.array(b['points'][0])-b['points'][-1]), 60)

    def test_connected_pale_model_evidence_survives_without_changing_ink_thresholds(self):
        im = np.full((80, 140, 3), 255, 'uint8')
        cv2.line(im, (10, 40), (120, 40), (218,)*3, 1)
        cv2.line(im, (10, 40), (30, 40), (160,)*3, 1)
        cv2.line(im, (10, 65), (120, 65), (245,)*3, 1)
        lines, mask, _, _ = copy.plan(im, 'line-map')
        self.assertTrue(mask[40, 100])
        self.assertFalse(mask[65, 100])
        self.assertFalse(copy.plan(im)[1][40, 100])
        self.assertTrue(any(g['length'] >= 105 for g in lines))

    def test_model_confidence_corridor_is_not_a_broad_nib(self):
        im = np.full((80, 140, 3), 255, 'uint8')
        cv2.line(im, (10, 40), (120, 40), (30,)*3, 9)
        lines = copy.plan(im, 'line-map')[0]
        self.assertTrue(lines)
        self.assertTrue(all(.7-1e-6 <= w <= 2.4+1e-6 for g in lines for w in g['widths']))
        self.assertTrue(all(.55 <= v <= 1 for g in lines for v in g['weights']))
        observed = np.full_like(im, 255)
        cv2.line(observed, (10, 40), (120, 40), (30,)*3, 3)
        self.assertTrue(any(w > 2.4 for g in copy.plan(observed)[0] for w in g['widths']))

    def test_a_two_cell_mark_survives_in_a_line_map(self):
        im = np.full((60, 100, 3), 255, 'uint8')
        im[30, 50:52] = 40
        mask = copy.plan(im, 'line-map')[1]
        self.assertTrue(mask[30, 50])
        self.assertTrue(copy.line_map_mask(im, min_area=5)[0][30, 50] == 0)

    def test_fine_marks_in_a_busy_region_join_the_map_and_elsewhere_do_not(self):
        h, w = 120, 200
        fused = np.full((h, w, 3), 255, 'uint8')
        fine = np.zeros((h, w), np.float32)
        for x in range(10, 90, 4):                       # a busy block of strong fused lines
            cv2.line(fused, (x, 10), (x, 100), (60,)*3, 1)
        fine[50:52, 40:44] = .5                           # a fine mark inside the block, between the lines
        fine[50:52, 150:154] = .5                         # and one in empty paper
        mask = copy.line_map_mask(fused, fine)[0]
        self.assertTrue(mask[50, 41])
        self.assertFalse(mask[50, 151])
        self.assertFalse(copy.line_map_mask(fused)[0][50, 41])

    def test_a_stub_off_a_fork_goes_and_a_standalone_short_mark_stays(self):
        im = np.full((80, 120, 3), 255, 'uint8')
        cv2.line(im, (10, 40), (110, 40), (20,)*3, 1)
        cv2.line(im, (60, 40), (60, 38), (20,)*3, 1)      # a 2-cell stub off the line
        cv2.line(im, (20, 10), (24, 10), (20,)*3, 1)      # a short mark of its own
        lines = copy.plan(im, 'line-map')[0]
        self.assertTrue(any(g['length'] > 95 for g in lines))
        self.assertEqual(sum(1 for g in lines if g['length'] < 8), 1)
        self.assertTrue(any(np.linalg.norm(np.array(g['points']).mean(0)-[22, 10]) < 1.5 for g in lines))

    def test_a_tight_ring_is_one_closed_path(self):
        im = np.full((60, 60, 3), 255, 'uint8')
        cv2.circle(im, (30, 30), 4, (20,)*3, 1)
        lines = copy.plan(im, 'line-map')[0]
        self.assertEqual(len(lines), 1)
        self.assertLess(np.linalg.norm(np.array(lines[0]['points'][0])-lines[0]['points'][-1]), 1.5)

    def test_long_contours_are_tier_one_and_short_marks_tier_two(self):
        im = np.full((60, 200, 3), 255, 'uint8')
        cv2.line(im, (5, 20), (190, 20), (20,)*3, 1)
        cv2.line(im, (10, 45), (20, 45), (20,)*3, 1)
        lines = copy.plan(im, 'line-map')[0]
        self.assertEqual(sorted(g['tier'] for g in lines), [1, 2])
        self.assertTrue(all('tier' not in g for g in copy.plan(im)[0]))


class Strokes(unittest.TestCase):
    def test_a_thick_stroke_is_one_centreline_with_its_width_and_a_wash_block_is_nothing(self):
        im = np.full((120, 200, 3), 235, 'uint8')
        cv2.line(im, (20, 30), (180, 30), (40,)*3, 2)        # a 3 px pen stroke (the disc is 5 px across at this size)
        im[70:120, 0:200] = 150                               # a wash block: its edge is a step, not a stroke
        lines = copy.plan(im, 'stroke')[0]
        top = [g for g in lines if all(abs(p[1]-30) < 2 for p in g['points'])]
        self.assertEqual(len(top), 1)
        self.assertGreater(np.median(top[0]["widths"]), 2)
        self.assertFalse(any(any(abs(p[1]-70) < 3 for p in g['points']) for g in lines))

    def test_the_gate_keeps_only_strokes_the_map_also_sees(self):
        im = np.full((100, 200, 3), 235, 'uint8')
        cv2.line(im, (20, 30), (180, 30), (40,)*3, 2)
        cv2.line(im, (20, 70), (180, 70), (40,)*3, 2)
        gate = np.zeros((100, 200), np.float32); gate[29:32, 20:180] = .5
        lines = copy.plan(im, 'stroke', gate=gate)[0]
        self.assertTrue(lines)
        self.assertTrue(all(all(abs(p[1]-30) < 3 for p in g['points']) for g in lines))


if __name__ == '__main__': unittest.main()
