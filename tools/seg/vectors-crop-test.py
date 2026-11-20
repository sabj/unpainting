"""A window of the vector strokes; python tools/seg/vectors-crop-test.py."""
import importlib.util, unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('vc', Path(__file__).with_name('vectors-crop.py')); vc = importlib.util.module_from_spec(spec); spec.loader.exec_module(vc)


class CropTests(unittest.TestCase):
    def test_ring_and_path_clipped_to_the_window(self):
        sq = [(0, 0), (10, 0), (10, 10), (0, 10)]
        r = vc.clip_ring(sq, 5, 5, 20, 20)
        xs, ys = [p[0] for p in r], [p[1] for p in r]
        self.assertEqual((min(xs), max(xs), min(ys), max(ys)), (5, 10, 5, 10))
        self.assertEqual(vc.clip_ring(sq, 20, 20, 30, 30), [])
        P = vc.clip_path([(0, 7), (20, 7), (20, 30)], 5, 5, 15, 15)
        self.assertEqual(len(P), 1); self.assertAlmostEqual(P[0][0][0], 5, 4); self.assertAlmostEqual(P[0][-1][0], 15, 4)


if __name__ == '__main__':
    unittest.main()
