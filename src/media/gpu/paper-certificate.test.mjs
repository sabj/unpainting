import test from 'node:test';
import assert from 'node:assert/strict';
import {attachGpu} from './link.mjs';
import {createSheet,dry,step,DEFAULTS} from '../sheet.mjs';
import {makePaper} from '../paper.mjs';
import {createPen,dipPen} from '../pen.mjs';
import {dryPenGate} from '../draw.mjs';
import {hasZeroPaperCertificate} from '../paper-certificate.mjs';

test('GPU dry completion certifies exact zero paper without a gate readback', t => {
  const prior=process.env.GPU_ASYNC_DRY;process.env.GPU_ASYNC_DRY='0';
  const sheet=createSheet(makePaper(16,16,{seed:7}),[{K:[.35,.49,.66],S:[.06,.025,.014],rho:.05,omega:1.4,gamma:.15}]);
  sheet.s.fill(.2);sheet.P[0].fill(.01);sheet.wetDirty=1;
  try {
    const info=attachGpu(sheet,DEFAULTS,{mode:'auto',log(){}});
    if(info.backend!=='gpu'){t.skip(info.reason);return;}
    dry(sheet,1000,DEFAULTS,{analyticTail:true,dt:14});
    const link=sheet._gpu;assert.equal(link.lastDryZero,true);assert.equal(hasZeroPaperCertificate(sheet),true);
    let reads=0;const original=link.ensurePaperFresh;
    link.ensurePaperFresh=function(...args){reads++;return original.apply(this,args);};
    const pen=createPen();dipPen(pen,[.1]);const gate=dryPenGate();
    gate({sheet,pen,footprint:[0,0,4,4],index:0});assert.equal(reads,0);
    step(sheet,DEFAULTS);assert.equal(hasZeroPaperCertificate(sheet),false);
    gate({sheet,pen,footprint:[0,0,4,4],index:1});assert.equal(reads,1);
  } finally {
    sheet._gpu?.close();
    if(prior===undefined)delete process.env.GPU_ASYNC_DRY;else process.env.GPU_ASYNC_DRY=prior;
  }
});
