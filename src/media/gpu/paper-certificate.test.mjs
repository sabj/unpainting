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

test('queued dry certifies without flushing and redundant dry stays queued',t=>{
  const saved={async:process.env.GPU_ASYNC_DRY,resident:process.env.GPU_RESIDENT};
  process.env.GPU_ASYNC_DRY='1';process.env.GPU_RESIDENT='1';
  const sheet=createSheet(makePaper(16,16,{seed:7}),[{K:[.35,.49,.66],S:[.06,.025,.014],rho:.05,omega:1.4,gamma:.15}]);
  sheet.s.fill(.2);sheet.P[0].fill(.01);sheet.wetDirty=1;
  try{
    const info=attachGpu(sheet,DEFAULTS,{mode:'auto',log(){}});
    if(info.backend!=='gpu'){t.skip(info.reason);return;}
    dry(sheet,1000,DEFAULTS,{analyticTail:true,dt:14});
    const link=sheet._gpu;
    assert.equal(link.lastDryZero,true);assert.equal(hasZeroPaperCertificate(sheet),true);
    assert.equal(link.queuedDrys,1);const dispatched=link.stats.drys;
    dry(sheet,1000,DEFAULTS,{analyticTail:true,dt:14});
    assert.equal(link.queuedDrys,1);assert.equal(link.stats.drys,dispatched);
    void sheet.layers;assert.equal(link.queuedDrys,0);link.syncAll(sheet);
    assert.equal(sheet.W.every(v=>v===0),true);assert.equal(sheet.s.every(v=>v===0),true);
  }finally{
    sheet._gpu?.close();
    for(const [key,value] of [['GPU_ASYNC_DRY',saved.async],['GPU_RESIDENT',saved.resident]])if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});

import {measurePaperDry} from '../../paint/methods/wetdry.mjs';
import {validDryFixedCertificate} from '../paper-certificate.mjs';

test('public queued threshold dry preserves residual pores and cannot skip a later dry',t=>{
  const keys=['GPU_ASYNC_DRY','GPU_RESIDENT','GPU_PAPER_OBSERVE'],saved=keys.map(k=>process.env[k]);
  process.env.GPU_ASYNC_DRY='1';process.env.GPU_RESIDENT='1';process.env.GPU_PAPER_OBSERVE='1';
  const sheet=createSheet(makePaper(16,16,{seed:7}),[{K:[.35,.49,.66],S:[.06,.025,.014],rho:.05,omega:1.4,gamma:.15}]);
  sheet.s.fill(.0001);
  try{
    const info=attachGpu(sheet,DEFAULTS,{mode:'auto',log(){}});
    if(info.backend!=='gpu'){t.skip(info.reason);return;}
    dry(sheet,1000,DEFAULTS,{analyticTail:false,dt:2});
    const link=sheet._gpu;
    assert.equal(link.queuedDrys,1);
    assert.equal(link.lastDryZero,false);
    assert.equal(hasZeroPaperCertificate(sheet),false);
    assert.equal(validDryFixedCertificate(sheet),false);
    const measured=measurePaperDry(sheet);
    assert.equal(measured.dry,true);
    assert.ok(measured.saturationMax>0,'threshold dryness is not exact zero');
    link.syncAll(sheet);
    assert.ok(sheet.s.some(v=>v>0),'pore traces survive the readback');
    assert.equal(hasZeroPaperCertificate(sheet),false);
    assert.equal(validDryFixedCertificate(sheet),false);
    const calls=link.stats.drys;
    dry(sheet,1000,DEFAULTS,{analyticTail:false,dt:2});
    assert.equal(link.stats.drys,calls+1,'residual pores cannot skip another dry');
    link.flushDrys(sheet);
  }finally{
    try { sheet._gpu?.flushDrys(sheet); }
    finally {
      sheet._gpu?.close();
      keys.forEach((key,i)=>{if(saved[i]===undefined)delete process.env[key];else process.env[key]=saved[i];});
    }
  }
});
