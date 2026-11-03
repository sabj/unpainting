"""Native scoring and deterministic metric-cache regression tests (no judge calls)."""
import base64, io, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
from PIL import Image
import classic
import score_painting as sp
from common import Pair

class Native(unittest.TestCase):
    def test_native_preserves_render_dimensions_and_refuses_small_target(self):
        with tempfile.TemporaryDirectory() as d:
            t, p = str(Path(d)/'t.png'), str(Path(d)/'p.png')
            Image.new('RGB',(1224,900),'white').save(t)
            Image.new('RGB',(1224,900),'gray').save(p)
            with patch.object(sp,'classic_scores',return_value={'mean':5,'metrics':{}}):
                r=sp.score(t,p,'wash',vision=False,resolution='native')
                self.assertEqual(r['resolution']['classicWidth'],1224)
            encoded=sp._content(t,p,'wash',1224)[2]['image_url']['url'].split(',')[1]
            self.assertEqual(Image.open(io.BytesIO(base64.b64decode(encoded))).size,(1224,900))
            small=sp.data_uri(Image.new('RGB',(64,48)),64).split(',')[1]
            self.assertEqual(Image.open(io.BytesIO(base64.b64decode(small))).size,(64,48))
            Image.new('RGB',(300,220),'white').save(t)
            with self.assertRaisesRegex(ValueError,'high-resolution target'):
                sp.score(t,p,'wash',vision=False,resolution='native')

    def test_cache_uses_pixels_geometry_and_physical_size(self):
        a=np.full((48,64,3),255,dtype=np.uint8); a[12:30,16:40]=80
        pair=Pair(Image.fromarray(a),Image.fromarray(a),work_w=64)
        with tempfile.TemporaryDirectory() as d:
            first=classic.cached_metrics(pair,cache_dir=d)
            with patch.object(classic,'value_judge',side_effect=AssertionError('cache miss')):
                self.assertEqual(classic.cached_metrics(pair,cache_dir=d),first)
                with self.assertRaises(AssertionError):classic.cached_metrics(pair,plate_mm=280,cache_dir=d)
                pair.p_rgb_full[0,0,0]=0
                with self.assertRaises(AssertionError):classic.cached_metrics(pair,cache_dir=d)

if __name__=='__main__':unittest.main()
