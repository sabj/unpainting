import unittest
import numpy as np
from ink_score_module import measure, extract

class Metrics(unittest.TestCase):
    def line(self, a, b):
        return np.array([a,b], float)

    def test_match_offset_and_missing(self):
        ref = np.zeros((80,80), bool); ref[20,10:61] = True
        path = self.line([10,20],[60,20])
        m,_ = measure([path], ref, .5)
        self.assertEqual(m['precision'], 1); self.assertEqual(m['recall'], 1)
        self.assertEqual(m['penLengthMm'], 25)
        for offset, expected in [(1,1),(2,1),(3,0)]:
            m,_ = measure([path+[0,offset]], ref, .5)
            self.assertEqual(m['precision'], expected); self.assertEqual(m['recall'], expected)
        m,_ = measure([], ref, .5)
        self.assertIsNone(m['precision']); self.assertEqual(m['recall'],0)

    def test_fragments_and_squiggles(self):
        ref = np.zeros((80,80), bool)
        straight = self.line([0,0],[10,0])
        short = self.line([0,0],[4,0])
        m,_ = measure([straight,short], ref, 1)
        self.assertEqual(m['fragmentShare'], .5); self.assertEqual(m['tortuosityMedian'],1)
        m,_ = measure([np.array([[0,0],[5,5],[10,0]],float)],ref,1)
        self.assertAlmostEqual(m['tortuosityMedian'],2**.5)
        self.assertEqual(m['tortuosityMedian'],m['tortuosityP90'])

    def test_duplicates_and_masses(self):
        ref = np.zeros((80,80), bool)
        a = self.line([10,20],[60,20]); b=a+[0,.5]
        m,_ = measure([a,b],ref,1,np.ones_like(ref))
        self.assertEqual(m['duplicatedParallelShare'],1)
        self.assertEqual(m['inventedInMassShare'],1)
        m,_ = measure([a,a+[0,2]],ref,1)
        self.assertEqual(m['duplicatedParallelShare'],0)
        m,_ = measure([a],ref,1,np.zeros_like(ref))
        self.assertEqual(m['inventedShare'],1); self.assertEqual(m['inventedInMassShare'],0)

    def test_graphite_exclusion_and_resolution(self):
        tape=dict(pigments=[dict(name='graphite HB'),dict(name='black ink')],penOpts=[dict(nib=.2,flex=.1)],pens=[0],marks=[])
        points=[dict(x=0,y=0),dict(x=20,y=0)]
        tape['marks']=[dict(k='D',pen=0,ink=[1,0]),dict(k='P',pen=0,points=points),dict(k='D',pen=0,ink=[0,1]),dict(k='P',pen=0,points=points,r=2)]
        paths,_=extract(tape)
        self.assertEqual(len(paths),1); self.assertEqual(paths[0][-1,0],10)

if __name__=='__main__':
    unittest.main()
