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


if __name__ == '__main__': unittest.main()
