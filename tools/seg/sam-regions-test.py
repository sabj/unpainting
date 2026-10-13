"""The partition rules of sam_regions.py on small synthetic masks; no SAM needed.

  .venv-seg/bin/python tools/seg/sam-regions-test.py
"""
import importlib.util
from pathlib import Path
import unittest
import numpy as np

spec = importlib.util.spec_from_file_location('sam_regions', Path(__file__).with_name('sam_regions.py'))
sr = importlib.util.module_from_spec(spec); spec.loader.exec_module(sr)


def mask(shape, y0, y1, x0, x1):
    m = np.zeros(shape, bool); m[y0:y1, x0:x1] = True
    return {'segmentation': m, 'area': int(m.sum())}


class Partition(unittest.TestCase):
    def test_each_pixel_takes_the_smallest_mask_and_details_and_the_whole_frame_are_skipped(self):
        shape = (100, 100)
        masks = [mask(shape, 0, 100, 0, 100), mask(shape, 0, 100, 0, 60), mask(shape, 20, 40, 20, 40), mask(shape, 50, 52, 50, 52)]
        field, kept = sr.lay_masks(sorted(masks, key=lambda m: -m['area']), shape, min_part=0.01)
        self.assertEqual(len(kept), 2)                      # the frame and the 2x2 speck are left out
        self.assertNotEqual(field[30, 30], field[70, 10])   # the inner square is its own region
        self.assertEqual(field[70, 10], field[5, 5])
        self.assertEqual(field[50, 80], 0)                  # unclaimed until claim_rest

    def test_unclaimed_picture_becomes_a_region_when_large_and_a_neighbour_when_small(self):
        field = np.zeros((50, 50), np.int32); field[:, :30] = 1; field[0:2, 48:50] = 0
        out = sr.fill_from_neighbours(sr.claim_rest(field, min_part=0.05))
        self.assertEqual(len(np.unique(out)), 2)
        self.assertTrue((out > 0).all())

    def test_renumber_puts_the_largest_first_and_the_cap_merges_the_smallest_into_its_nearest_colour(self):
        field = np.zeros((40, 40), np.int32); field[:, :10] = 7; field[:, 10:30] = 3; field[:, 30:] = 9
        lab = np.zeros((40, 40, 3), np.float32); lab[:, :10] = (50, 0, 0); lab[:, 10:30] = (52, 0, 0); lab[:, 30:] = (90, 0, 0)
        r = sr.renumber(field)
        self.assertEqual(r[0, 15], 1)
        capped = sr.cap_regions(r, lab, max_regions=2)
        self.assertEqual(len(np.unique(capped)), 2)
        self.assertEqual(capped[0, 0], capped[0, 15])       # the dark strip joins the dark middle, not the light right

    def test_a_region_inside_the_frame_is_foreground(self):
        field = np.ones((60, 60), np.int32); field[20:40, 20:40] = 2
        lab = np.zeros((60, 60, 3), np.float32)
        legend, regions, names = sr.describe(field, lab)
        self.assertEqual(names, ['r1', 'r2'])
        self.assertEqual([r['foreground'] for r in regions], [False, True])


if __name__ == '__main__':
    unittest.main()
