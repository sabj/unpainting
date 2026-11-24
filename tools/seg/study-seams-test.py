"""study-seams.py on synthetic studies: an outline round each shape and a paper border are found, clean shapes are not.

  .venv-seg/bin/python tools/seg/study-seams-test.py
"""
import importlib.util
from pathlib import Path
import unittest
import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location('study_seams', Path(__file__).with_name('study-seams.py'))
ss = importlib.util.module_from_spec(spec); spec.loader.exec_module(ss)


def shapes(outline=0, border=0, size=(600, 400)):
    """Four coloured blocks on a coloured sheet; `outline` px of bare paper round each block, `border` px of paper round the sheet."""
    w, h = size; a = np.full((h, w, 3), (60, 110, 160), np.uint8)
    for (x0, y0, x1, y1), c in [((40, 40, 280, 180), (80, 140, 70)), ((320, 60, 560, 200), (150, 90, 60)),
                                ((40, 220, 260, 370), (120, 120, 130)), ((300, 240, 560, 380), (170, 150, 80))]:
        if outline: a[y0 - outline:y1 + outline, x0 - outline:x1 + outline] = 250
        a[y0:y1, x0:x1] = c
    if border: a[:border] = a[-border:] = 250; a[:, :border] = a[:, -border:] = 250
    return Image.fromarray(a)


class Seams(unittest.TestCase):
    def test_clean_shapes_have_no_seam_and_no_border(self):
        m = ss.measure(shapes())
        self.assertEqual(m['seamLength'], 0.0); self.assertEqual(m['borderShare'], 0.0)

    def test_an_outline_round_each_shape_is_a_seam(self):
        self.assertGreater(ss.measure(shapes(outline=3))['seamLength'], 100.0)

    def test_a_paper_border_is_a_border_and_not_a_seam(self):
        m = ss.measure(shapes(border=14))
        self.assertGreater(m['borderShare'], 5.0); self.assertLess(m['seamLength'], 5.0)

    def test_only_what_exceeds_the_picture_is_charged(self):
        pic = ss.measure(shapes(outline=3)); clean = ss.measure(shapes())
        self.assertEqual(ss.penalty(pic, pic), 0.0)
        self.assertEqual(ss.penalty(clean, pic), 0.0)
        self.assertGreater(ss.penalty(pic, clean), 5.0)

    def test_the_outlined_seed_loses_to_the_clean_seed_on_equal_colour(self):
        pic = ss.measure(shapes())
        self.assertGreater(ss.penalty(ss.measure(shapes(outline=3)), pic), ss.penalty(ss.measure(shapes()), pic) + 5)


if __name__ == '__main__':
    unittest.main()
