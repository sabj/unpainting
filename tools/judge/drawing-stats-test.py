"""Analytic drawing fixtures, independent of the renderer."""
import importlib.util
import unittest
from pathlib import Path

import cv2
import numpy as np

spec = importlib.util.spec_from_file_location('drawing_stats', Path(__file__).with_name('drawing-stats.py'))
stats = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stats)


class DrawingStatsTest(unittest.TestCase):
    def paper(self):
        return np.full((256, 256, 3), 255, np.uint8)

    def test_blank_paper_is_not_an_economical_drawing(self):
        r = stats.measure(self.paper(), long_edge=256)
        self.assertEqual(r['pathFragments'], 0)
        self.assertEqual(r['lineAreaShare'], 0)
        self.assertIsNone(r['weightPx']['median'])

    def test_four_open_lines_and_one_closed_circle_are_distinguished(self):
        open_lines, circle = self.paper(), self.paper()
        for y in (40, 80, 120, 160):
            cv2.line(open_lines, (25, y), (220, y), (30, 30, 30), 2)
        cv2.circle(circle, (128, 128), 75, (30, 30, 30), 2)
        a, b = [stats.measure(im, long_edge=256) for im in (open_lines, circle)]
        self.assertEqual(a['pathFragments'], 4)
        self.assertEqual(b['pathFragments'], 1)
        self.assertGreater(a['openEndpointProxy'], .9)
        self.assertLess(b['openEndpointProxy'], .1)

    def test_thicker_lines_raise_weight_and_area_without_multiplying_paths(self):
        rows = []
        for width in (2, 6):
            im = self.paper()
            for y in (40, 80, 120, 160):
                cv2.line(im, (25, y), (220, y), (30, 30, 30), width)
            rows.append(stats.measure(im, long_edge=256))
        a, b = rows
        self.assertEqual(a['pathFragments'], b['pathFragments'])
        self.assertGreater(b['weightPx']['median'], 1.5*a['weightPx']['median'])
        self.assertGreater(b['darkAreaShare'], 1.5*a['darkAreaShare'])


if __name__ == '__main__':
    unittest.main()
