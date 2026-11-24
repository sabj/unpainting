"""Vector strokes fitted to a drawing's ink; python tools/seg/ink-vectors-test.py."""
import importlib.util, json, tempfile, unittest
from pathlib import Path
import numpy as np, cv2

spec = importlib.util.spec_from_file_location('iv', Path(__file__).with_name('ink-vectors.py'))
iv = importlib.util.module_from_spec(spec); spec.loader.exec_module(iv)


class VectorTests(unittest.TestCase):
    def test_vectors_cover_the_ink_and_nothing_else_and_render_crisp_at_any_size(self):
        img = np.full((80, 120, 3), 255, np.uint8)
        cv2.line(img, (10, 20), (110, 20), (0, 0, 0), 3)            # a line
        cv2.line(img, (60, 20), (60, 70), (120, 120, 120), 2)       # a grey bar meeting it
        cv2.circle(img, (30, 55), 6, (0, 0, 0), -1)                  # a solid dark (a leaf)
        # soft as a prepared drawing is (every edge spread over 0.8 px): the fitter takes that softness out before it fits
        # (deblur), so a hard-edged picture is not its input: its grey bar comes out black
        img = cv2.GaussianBlur(img, (0, 0), .8)
        with tempfile.TemporaryDirectory() as d:
            f = str(Path(d) / 'd.png'); cv2.imwrite(f, img)
            lines = {'image': {'w': 120, 'h': 80}, 'lines': [
                {'seq': 0, 'points': [[10, 20], [110, 20]], 'width': 3, 'length': 100},
                {'seq': 1, 'points': [[60, 21], [60, 70]], 'width': 2, 'length': 49}]}
            doc = iv.build(f, lines, 24.0)   # 0.2 mm a pixel, as a drawing for a sheet
        self.assertIn(len(doc['strokes']), (3, 4))                  # the leaf the line file missed is a stroke of its own (a black-and-grey piece may be two)
        leaf = [s for s in doc['strokes'] if iv.is_fill(s)]
        self.assertEqual(len(leaf), 1)                                # and it is the one fill, laid before the line nearest it
        bar = [s for s in doc['strokes'] if s.get('line') == 1 and not iv.is_fill(s)][0]
        self.assertLess(bar['dark'], .7)                              # a grey line is a lighter stroke
        for W in (240, 960):                                          # rendered at two sizes from the same vectors
            V = iv.render_vectors(doc, W); D = cv2.resize(iv.darkness(img), (W, V.shape[0]), interpolation=cv2.INTER_CUBIC)
            md, mv = D > .25, V > .25
            self.assertGreater((md & mv).sum() / md.sum(), .85)
            self.assertLess((mv & ~cv2.dilate(md.astype(np.uint8), np.ones((3, 3))).astype(bool)).sum() / mv.sum(), .03)


if __name__ == '__main__':
    unittest.main()
