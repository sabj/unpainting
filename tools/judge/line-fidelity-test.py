"""Metric sanity checks on synthetic masks, separate from artwork evaluation."""
import importlib.util
from pathlib import Path
import unittest
import numpy as np

spec=importlib.util.spec_from_file_location('fidelity',Path(__file__).with_name('line-fidelity.py'))
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)


class Metrics(unittest.TestCase):
    def setUp(self):
        self.mask=np.zeros((60,80),bool)
        self.mask[20,10:70]=True;self.mask[40,10:70]=True
        self.paths=f.sketch.trace(self.mask.astype('uint8'))

    def test_identical(self):
        m=f.compare(self.mask,self.mask,self.paths)
        self.assertEqual(m['precision'],1);self.assertEqual(m['recall'],1)
        self.assertEqual(m['widthQuantileMAE'],0);self.assertEqual(m['internalGaps'],0)
        self.assertEqual(m['mergeProxy'],0)

    def test_gap_and_false_bridge(self):
        broken=self.mask.copy();broken[20,30:42]=False
        m=f.compare(self.mask,broken,self.paths)
        self.assertEqual(m['internalGaps'],1);self.assertLess(m['recall'],1)
        joined=self.mask.copy();joined[20:41,55]=True
        m=f.compare(self.mask,joined,self.paths)
        self.assertEqual(m['mergeProxy'],1);self.assertLess(m['precision'],1)

    def test_width_and_empty(self):
        broad=self.mask.copy();broad[19:22,10:70]=True;broad[39:42,10:70]=True
        self.assertGreater(f.compare(self.mask,broad,self.paths)['widthQuantileMAE'],0)
        empty=f.compare(self.mask,np.zeros_like(self.mask),self.paths)
        self.assertEqual(empty['recall'],0);self.assertEqual(empty['missingComponents'],2)


if __name__=='__main__':unittest.main()
