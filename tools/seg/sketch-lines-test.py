"""Synthetic geometry regressions; python tools/seg/sketch-lines-test.py."""
import importlib.util
from pathlib import Path
import unittest
import cv2
import numpy as np

spec = importlib.util.spec_from_file_location('sketch', Path(__file__).with_name('sketch-lines.py'))
sketch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sketch)


class SketchTests(unittest.TestCase):
    def test_junction_does_not_fragment_structure(self):
        s = np.zeros((80, 120), 'uint8')
        s[40, 10:110] = 1; s[25:56, 60] = 1
        paths = sketch.trace(s)
        self.assertGreater(max(sketch.arc_length(p) for p in paths), 90)

    def test_parallel_marks_are_not_joined(self):
        a = np.array([[10, 10], [40, 10]], np.float32)
        b = np.array([[10, 14], [40, 14]], np.float32)
        self.assertEqual(len(sketch.join([a, b], np.ones((60, 60)), gap=9)), 2)

    def test_unsupported_gap_is_not_invented(self):
        a = np.array([[10, 10], [30, 10]], np.float32)
        b = np.array([[38, 10], [50, 10]], np.float32)
        self.assertEqual(len(sketch.join([a, b], np.zeros((60, 60)))), 2)
        self.assertEqual(len(sketch.join([a, b], np.ones((60, 60)))), 1)

    def test_arch_is_not_replaced_by_its_chord(self):
        t = np.linspace(0, np.pi, 80)
        p = np.c_[50+30*np.cos(t), 50-30*np.sin(t)].astype(np.float32)
        q, straight = sketch.fit_path(p)
        self.assertFalse(straight)
        self.assertGreater(len(q), 5)
        self.assertLess(q[:, 1].min(), 22)

    def test_long_texture_does_not_get_structural_weight(self):
        zigzag = np.c_[np.arange(0, 100, 4), np.tile([0, 6], 13)[:25]].astype(np.float32)
        self.assertEqual(sketch.path_kind(zigzag, False, 200), 'ornament')
        t = np.linspace(0, np.pi, 20)
        arch = np.c_[50+30*np.cos(t), 50-30*np.sin(t)].astype(np.float32)
        self.assertEqual(sketch.path_kind(arch, False, 200), 'structure')

    def test_straight_detector_does_not_cut_a_complete_arch(self):
        im = np.full((220, 260, 3), 245, np.uint8)
        cv2.ellipse(im, (130, 140), (85, 85), 0, 180, 360, (30, 30, 30), 2)
        lines, _, _ = sketch.plan(im, 1-im[:, :, 0].astype(np.float32)/255)
        self.assertGreater(max(g['length'] for g in lines), 240)

    def test_blank_sky_and_dark_interior_have_no_marks(self):
        for value in (15, 150, 255):
            image = np.full((100, 150, 3), value, 'uint8')
            lines, _, _ = sketch.plan(image)
            self.assertEqual(lines, [])

    def test_windows_survive_and_widths_taper(self):
        im = np.full((160, 220, 3), 245, 'uint8')
        for x in (25, 80, 135):
            cv2.rectangle(im, (x, 30), (x+30, 100), (25, 25, 25), 2)
        lines, _, _ = sketch.plan(im)
        self.assertGreater(len(lines), 6)
        for g in lines:
            self.assertEqual(len(g['points']), len(g['widths']))
            self.assertTrue(all(np.isfinite(g['widths'])))
            self.assertLess(g['widths'][-1], max(g['widths']))

    def test_faded_supported_ink_is_not_flat_paper(self):
        im = np.full((160, 220, 3), 160, 'uint8')
        evidence = np.zeros((160, 220), np.float32)
        cv2.line(im, (40, 20), (40, 130), (152, 152, 152), 2)
        cv2.line(evidence, (40, 20), (40, 130), .8, 2)
        lines, _, _ = sketch.plan(im, evidence)
        self.assertTrue(any(g['length'] > 90 for g in lines))


if __name__ == '__main__':
    unittest.main()
