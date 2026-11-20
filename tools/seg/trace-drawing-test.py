"""Dense ink laid as strands; python tools/seg/trace-drawing-test.py."""
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


if __name__ == '__main__':
    unittest.main()
