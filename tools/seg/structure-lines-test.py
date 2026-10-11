"""Synthetic regressions for the structure planner; python tools/seg/structure-lines-test.py."""
import json
import sys
import unittest
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from structure import marks  # noqa: E402
from structure.compose import TIERS, plan  # noqa: E402
from structure.curves import detect_arcs  # noqa: E402
from structure.geom import edge_strength, step_contrast  # noqa: E402
from structure.openings import bays, group_repeats, regularise  # noqa: E402
from structure.perspective import angle_error, merge_collinear, snap, vanishing_points  # noqa: E402


def facade(w=640, h=420):
    """A wall in one-point perspective with a row of four windows, an arch and a ground line."""
    img = np.full((h, w), 225, np.uint8)
    cv2.fillPoly(img, [np.array([[80, 60], [560, 60], [560, 330], [80, 330]])], 170)
    for k in range(4):
        x = 120+k*100
        cv2.rectangle(img, (x, 100), (x+40, 180), 60, -1)
    cv2.ellipse(img, (320, 330), (60, 60), 0, 180, 360, 70, -1)
    cv2.rectangle(img, (260, 330), (380, 330), 70, -1)
    cv2.line(img, (0, 400), (640, 380), 120, 2)
    return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)


class Perspective(unittest.TestCase):
    def test_converging_segments_find_their_vanishing_point(self):
        rng = np.random.default_rng(1)
        vp = np.array([500., 200.])
        segs = []
        for k in range(30):
            ang = rng.uniform(-1, 1)
            d = np.r_[np.cos(np.pi+ang), np.sin(np.pi+ang)]
            a = vp+d*rng.uniform(150, 250); b = a+d*rng.uniform(60, 120)
            segs.append(np.r_[a, b])
        for k in range(20):
            x, y = rng.uniform(0, 400, 2)
            segs.append(np.r_[x, y, x, y+rng.uniform(40, 90)])
        found = vanishing_points(np.array(segs, np.float32), 400, seed=0)
        finite = [v[:2]/v[2] for v, _ in found if abs(v[2]) > 1e-9 and np.hypot(*(v[:2]/v[2])) < 1e5]
        self.assertTrue(any(np.hypot(*(f-vp)) < 6 for f in finite))

    def test_snap_passes_through_vanishing_point(self):
        v = np.array([1000., 100., 1.])
        s = snap(np.array([0, 0, 100, 12], np.float32), v)
        self.assertLess(angle_error(s.reshape(1, 4), v)[0], 1e-6)

    def test_supported_gap_merges_and_bare_gap_does_not(self):
        segs = np.array([[10, 50, 100, 50], [130, 50, 220, 50]], np.float32)
        self.assertEqual(len(merge_collinear(segs, np.ones((100, 240)), 500)), 1)
        self.assertEqual(len(merge_collinear(segs, np.zeros((100, 240)), 500)), 2)

    def test_parallel_neighbours_stay_separate(self):
        segs = np.array([[10, 50, 100, 50], [10, 58, 100, 58]], np.float32)
        self.assertEqual(len(merge_collinear(segs, np.ones((100, 240)), 200)), 2)


class Curves(unittest.TestCase):
    def test_broken_arch_becomes_one_arc(self):
        img = np.full((300, 400), .9, np.float32)
        cv2.ellipse(img, (200, 220), (120, 120), 0, 180, 360, .3, -1)
        img[60:120, 180:220] = .9      # a keystone breaks the edge
        st = edge_strength(img)
        arcs = detect_arcs(img, st, 300)
        self.assertTrue(arcs)
        best = max(arcs, key=lambda a: abs(a['sweep']))
        self.assertGreater(np.degrees(abs(best['sweep'])), 120)
        self.assertLess(abs(best['r']-120), 8)


class Openings(unittest.TestCase):
    def test_row_of_windows_shares_one_shape(self):
        group = [dict(x=100+k*80, y=50+k, w=30+(k % 2)*4, h=60-(k % 2)*5, arched=False) for k in range(4)]
        units = regularise(group)
        aspects = {round(u['w']/u['h'], 3) for u in units}
        self.assertEqual(len(aspects), 1)
        self.assertLess(np.ptp([u["h"] for u in units]), .06*np.mean([u["h"] for u in units]))

    def test_unrelated_sizes_do_not_group(self):
        a = dict(x=0, y=0, w=20, h=40); b = dict(x=50, y=0, w=60, h=120)
        self.assertEqual(len(group_repeats([a, b])), 2)

    def test_tall_bays_become_columns(self):
        grey = np.full((400, 400), .5, np.float32)
        lines = []
        for k in range(3):
            x = 60+k*100
            grey[50:350, x:x+24] = .85
            lines += [dict(seg=np.array([x, 50, x, 350], np.float32), length=300),
                      dict(seg=np.array([x+24, 50, x+24, 350], np.float32), length=300)]
        units, used = bays(lines, grey, 400, contrast=.5)
        self.assertEqual(sum(u['kind'] == 'column' for u in units), 3)
        self.assertEqual(len(used), 6)


class Marks(unittest.TestCase):
    def test_marks_are_reproducible(self):
        a = marks.loose_wave((50, 50), 80, 0, 6, np.random.default_rng(3))
        b = marks.loose_wave((50, 50), 80, 0, 6, np.random.default_rng(3))
        self.assertEqual(len(a), len(b))
        for p, q in zip(a, b):
            np.testing.assert_allclose(p, q)

    def test_hand_line_stays_on_its_line(self):
        p = marks.hand_line((0, 0), (100, 0), np.random.default_rng(0))
        self.assertLess(np.abs(p[:, 1]).max(), 1.0)
        self.assertLess(p[0, 0], 0)
        self.assertGreater(p[-1, 0], 100)

    def test_mortar_joint_has_low_step_contrast(self):
        g = np.full((60, 200), .7, np.float32)
        g[30, :] = .2                       # a thin dark joint
        joint = step_contrast(g, np.array([[10, 30], [190, 30]], np.float32))
        g2 = np.full((60, 200), .7, np.float32); g2[30:] = .3   # a mass edge
        edge = step_contrast(g2, np.array([[10, 30], [190, 30]], np.float32))
        self.assertLess(joint, .05)
        self.assertGreater(edge, .3)


class Plan(unittest.TestCase):
    def test_facade_plan_has_hierarchy_and_drawing_file_shape(self):
        lines, stats = plan(facade(), seed=0)
        self.assertTrue(lines)
        tiers = {g['tier'] for g in lines}
        self.assertIn('structure', tiers)
        self.assertIn('opening', tiers)
        for g in lines:
            self.assertIn(g['role'], ('structure', 'opening', 'ornament'))
            self.assertEqual(len(g['points']), len(g['widths']))
            self.assertEqual(len(g['points']), len(g['weights']))
        mean = lambda t: np.mean([np.mean(g['widths']) for g in lines if g['tier'] == t])
        self.assertGreater(mean('structure'), mean('opening'))
        self.assertGreater(TIERS['opening'][0], TIERS['ornament'][0])
        json.dumps(stats)

    def test_windows_in_a_row_are_drawn_as_repeated_units(self):
        lines, stats = plan(facade(), seed=0)
        self.assertGreaterEqual(stats['openingUnits'], 4)

    def test_same_seed_same_plan(self):
        a, _ = plan(facade(), seed=4)
        b, _ = plan(facade(), seed=4)
        self.assertEqual(json.dumps(a), json.dumps(b))

    def test_blank_paper_draws_nothing(self):
        lines, _ = plan(np.full((300, 400, 3), 240, np.uint8))
        self.assertEqual(lines, [])


class Combine(unittest.TestCase):
    def test_crossing_paths_keep_uncovered_runs_and_widths(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location('combine', Path(__file__).with_name('structure-combine.py'))
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        s = dict(image=dict(w=100, h=100), lines=[dict(points=[[50, 5], [50, 95]], tier='structure')])
        t = dict(image=dict(w=100, h=100), lines=[dict(points=[[5, 50], [95, 50]], role='opening', widths=[1, 1.5])])
        r = module.combine(s, t)
        self.assertEqual(r['combined']['detail'], 2)
        for g in r['lines'][1:]:
            self.assertTrue(all(abs(x-50) > 3 for x,y in g['points']))
            self.assertEqual(len(g['points']), len(g['widths']))
            self.assertEqual(g['role'], 'opening')
        self.assertEqual(len(s['lines']), 1)


if __name__ == '__main__':
    unittest.main()
