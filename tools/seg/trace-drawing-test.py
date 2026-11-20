"""Dense ink laid as strands, solid darks filled, widths along a line; python tools/seg/trace-drawing-test.py."""
import importlib.util
import sys
from pathlib import Path
import unittest
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location('trace', Path(__file__).with_name('trace-drawing.py'))
trace = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trace)


class DenseTests(unittest.TestCase):
    def test_solid_dark_closes_up_and_strands_keep_paper_between(self):
        # left half solid black, right half black strands one pixel wide with paper between (period 3)
        g = np.ones((60, 120), np.float32)
        g[5:55, 5:55] = 0
        for x in range(65, 115, 3):
            g[5:55, x] = 0
        region = g < 2
        streams = trace.dense_strokes(g, region, spacing=2.4, width=3)
        trace.territory_widths(streams, 1 - g, region, reach=3.6, max_width=4.8)
        left = [s['width'] for s in streams if np.mean(np.asarray(s['points'])[:, 0]) < 55]
        right = [s['width'] for s in streams if np.mean(np.asarray(s['points'])[:, 0]) > 65]
        self.assertTrue(left and right)
        self.assertGreater(np.median(left), 1.5 * np.median(right))
        # the solid laid as touching strands: their widths over their spacing near or past full cover
        self.assertGreater(np.median(left) * 1.6, 2.0)
        # strands do not run along the paper: each stays on the dark
        for s in streams:
            p = np.asarray(s['points']).round().astype(int)
            self.assertGreater(np.mean(1 - g[p[:, 1].clip(0, 59), p[:, 0].clip(0, 119)]), .5)


class FidelityTests(unittest.TestCase):
    def test_solid_dark_filled_by_parallel_strokes_along_its_length(self):
        # a black bar 40 px long and 10 px wide (a solid dark), drawn at zoom 4
        g = np.full((40, 80, 3), 255, np.uint8); g[15:25, 20:60] = 0
        lines, mask, skel, stats = trace.plan(g, zoom=4, solid_px=4)
        fills = [l for l in lines if l.get('fill')]
        self.assertGreaterEqual(len(fills), 3)
        for l in fills:
            p = np.asarray(l['points']); d = p[-1]-p[0]
            self.assertGreater(abs(d[0]), 5*abs(d[1]))          # along the bar
            self.assertGreater(l['length'], 20)
        # together they cover the bar: their spacing is under their width
        ys = sorted(np.asarray(l['points'])[:, 1].mean() for l in fills)
        self.assertLess(max(np.diff(ys)), fills[0]['width'])

    def test_a_line_that_swells_keeps_its_widths(self):
        g = np.full((40, 120, 3), 255, np.uint8)
        g[19:21, 10:110] = 0; g[17:23, 50:70] = 0            # 2 px line, 6 px in the middle
        lines, *_ = trace.plan(g, zoom=4)
        l = max(lines, key=lambda l: l['length'])
        self.assertIn('widths', l)
        p, w = np.asarray(l['points']), np.asarray(l['widths'])
        mid, end = w[np.abs(p[:, 0]-60) < 5], w[np.abs(p[:, 0]-25) < 5]
        self.assertGreater(mid.mean(), 2*end.mean())


if __name__ == '__main__':
    unittest.main()
