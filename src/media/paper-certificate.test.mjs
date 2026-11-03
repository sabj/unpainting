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
