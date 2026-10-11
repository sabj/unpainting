"""Synthetic regressions for residual_lines.py; python tools/seg/residual-lines-test.py."""
import importlib.util
import sys
from pathlib import Path
import unittest
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location('sketch', Path(__file__).with_name('sketch-lines.py'))
sketch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sketch)
import residual_lines as rl  # noqa: E402


def sheet(v=240):
    return np.full((120, 160, 3), v, np.uint8)


def line(points, role='opening'):
    return {'points': [list(map(float, p)) for p in points], 'widths': [1.5]*len(points), 'role': role, 'kind': role}


class ResidualLineTests(unittest.TestCase):
    def test_wash_divides_out(self):
        wash = sheet(160); orig = wash.copy(); orig[60:62, 20:140] = 16
        T = rl.residual(orig, wash)
        self.assertEqual(T[30, 30], 1)
        self.assertLess(T[60, 80], .2)

    def test_unsupported_line_is_dropped_supported_kept(self):
        orig = sheet(); orig[60:62, 20:140] = 20
        T = rl.residual(orig, sheet())
        kept, dropped = rl.prune([line([[20, 60.5], [140, 60.5]]), line([[20, 20], [140, 20]])], T)
        self.assertEqual(len(kept), 1); self.assertEqual(dropped['clutter'], 1)

    def test_line_inside_a_mass_is_dropped(self):
        orig = sheet(); orig[30:90, 30:130] = 30
        kept, dropped = rl.prune([line([[40, 60], [120, 60]])], rl.residual(orig, sheet()))
        self.assertEqual(len(kept), 0); self.assertEqual(dropped['mass'], 1)

    def test_missing_ink_is_added_and_covered_ink_is_not(self):
        orig = sheet(); orig[40:42, 20:140] = 20; orig[80:82, 20:140] = 20
        T = rl.residual(orig, sheet())
        have = [line([[20, 40.5], [140, 40.5]])]
        added = rl.add_missing(have, T, sketch, 120)
        self.assertEqual(len(added), 1)
        self.assertAlmostEqual(float(np.mean(added[0]['p'][:, 1])), 80.5, delta=1.5)


if __name__ == '__main__':
    unittest.main()
