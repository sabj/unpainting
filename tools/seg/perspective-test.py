#!/usr/bin/env python3
"""Unit tests for tools/seg/perspective.py vanishing-point detection."""
import unittest
import cv2
import numpy as np
import perspective


class PerspectiveTest(unittest.TestCase):
    def test_converging_grid_finds_vanishing_points(self):
        img = np.full((240, 320, 3), 245, np.uint8)
        vp1 = (160, 40)
        for x in range(20, 301, 28):
            cv2.line(img, vp1, (x, 230), (30, 30, 30), 2)
        for y in range(70, 220, 24):
            cv2.line(img, (20, y), (300, y), (30, 30, 30), 2)
        res = perspective.measure(img, seed=0)
        self.assertGreaterEqual(res["vanishingPoints"], 2)
        self.assertGreater(res["share"], 0.5)

    def test_blank_image_returns_zero_points(self):
        img = np.full((128, 128, 3), 240, np.uint8)
        res = perspective.measure(img, seed=0)
        self.assertEqual(res["vanishingPoints"], 0)
        self.assertEqual(res["share"], 0.0)


if __name__ == "__main__":
    unittest.main()
