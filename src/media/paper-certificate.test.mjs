import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheet,dry,deposit,soak,step,DEFAULTS} from './sheet.mjs';
import {createBrush,dip,stroke} from './brush.mjs';
import {createPen,dipPen,penStroke} from './pen.mjs';
import {dryPenGate} from './draw.mjs';
import {makePaper} from './paper.mjs';
import {certifyZeroPaper,hasZeroPaperCertificate,invalidatePaperCertificate} from './paper-certificate.mjs';
const make=()=>createSheet(makePaper(16,12,{seed:2}),[{K:[1,1,1],S:[.1,.1,.1],rho:.1,omega:.2,gamma:.1}]);

test('full dry certificates skip pen reads and expire on instrument and flow writes', () => {
  for(const change of [s=>deposit(s,10,.1,[.01]),s=>soak(s,10,.1,[.01]),s=>step(s,DEFAULTS),s=>{
    const b=createBrush({radius:2});dip(b,{water:.5,conc:[.1]});stroke(b,s,[{x:2,y:3},{x:8,y:3}]);
  },s=>{const p=createPen();dipPen(p,[.1]);penStroke(p,s,[{x:2,y:3},{x:8,y:3}]);}]) {
    const s=make();dry(s);assert.equal(hasZeroPaperCertificate(s),true);
    change(s);assert.equal(hasZeroPaperCertificate(s),false);
  }
  const s=make();dry(s);let reads=0;
  s._gpu={version:1,ensurePaperFresh(){reads++;}};certifyZeroPaper(s);
  const p=createPen();dipPen(p,[.1]);const audit=[],gate=dryPenGate({audit});
  gate({sheet:s,pen:p,footprint:[0,0,4,4],index:0});assert.equal(reads,0);
  assert.deepEqual(audit[0].before,{water:0,pore:0});assert.equal(audit[0].dried,false);
  s._gpu.version++;
  gate({sheet:s,pen:p,footprint:[0,0,4,4],index:1});assert.equal(reads,1);
});

test('threshold dryness, copied/restored sheets and replacement arrays cannot inherit exact-zero proof', () => {
  const s=make();s.s[1]=s.paper.capacity[1]*.01;dry(s,0);
  assert.equal(hasZeroPaperCertificate(s),false,'dry threshold permits nonzero residual pores');
  s.s.fill(0);dry(s);assert.equal(hasZeroPaperCertificate(s),true);
  assert.equal(hasZeroPaperCertificate({...s}),false);
  s.W=s.W.slice();assert.equal(hasZeroPaperCertificate(s),false);
  certifyZeroPaper(s);invalidatePaperCertificate(s);assert.equal(hasZeroPaperCertificate(s),false);
});

import {measurePaperDry,measurePaper,measurePaperBatch} from '../paint/methods/wetdry.mjs';
import {layersChanged} from './sheet.mjs';
import {certifyDryFixed,validDryFixedCertificate} from './paper-certificate.mjs';

test('dry-fixed proof skips GPU dispatch but zero water alone and watched dry do not',()=>{
  const s=make();let calls=0;
  s._gpu={version:1,dry(){calls++;this.lastDryZero=true;return 75;}};
  certifyZeroPaper(s);
  assert.equal(validDryFixedCertificate(s),false);
  assert.equal(dry(s),75);assert.equal(calls,1);
  assert.equal(validDryFixedCertificate(s),true);
  assert.equal(dry(s),0);assert.equal(calls,1);
  dry(s,40000,DEFAULTS,{onStep(){}});assert.equal(calls,2);
  layersChanged(s);assert.equal(validDryFixedCertificate(s),false);
  dry(s);assert.equal(calls,3);
  s._gpu.version++;assert.equal(validDryFixedCertificate(s),false);
});

test('certified zero measurements need neither CPU planes nor GPU reads and preserve bounds and stats',()=>{
  const s=make();let reads=0;
  s._gpu={version:0,ensurePaperFresh(){reads++;}};certifyZeroPaper(s);
  s.W[1]=NaN;s.s[1]=NaN; // poisoned stale CPU planes: a valid GPU proof must avoid them
  assert.deepEqual(measurePaperDry(s),{cells:s.n,bounds:[0,0,15,11],waterMax:0,saturationMax:0,moistShare:0,dry:true});
  assert.deepEqual(measurePaper(s,[1,17]),{cells:2,bounds:[1,0,1,1],waterMax:0,saturationMax:0,waterP95:0,moistShare:0,dry:true});
  const groups=measurePaperBatch(s,[{cells:[1,17],stats:'gate'},{cells:[]}],true);
  assert.equal(groups[0].waterMax,0);assert.equal('waterP95' in groups[0],false);assert.equal(groups[1].cells,0);assert.equal(reads,0);
  invalidatePaperCertificate(s);assert.throws(()=>measurePaper(s,[1]),/Non-finite/);assert.equal(reads,1);
});

test('CPU fixed proofs expire on layer edits and material writes',()=>{
  const s=make();dry(s);assert.equal(validDryFixedCertificate(s),true);
  const before=s.layers.length;assert.equal(dry(s),0);assert.equal(s.layers.length,before);
  deposit(s,10,.1,[.01]);assert.equal(validDryFixedCertificate(s),false);
  dry(s);assert.equal(validDryFixedCertificate(s),true);
  layersChanged(s);assert.equal(validDryFixedCertificate(s),false);
  certifyDryFixed(s);s.layers.push([new Float32Array(s.n)]);assert.equal(validDryFixedCertificate(s),false);
});
