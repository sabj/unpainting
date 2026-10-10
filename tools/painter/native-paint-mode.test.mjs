import test from 'node:test';
import assert from 'node:assert/strict';
import {nativePaintMode,nativeDryOptions} from './native-paint-mode.mjs';
import {makePaper} from '../../src/media/paper.mjs';
import {createSheet,deposit,dry,DEFAULTS} from '../../src/media/sheet.mjs';
import {measurePaper} from '../../src/paint/methods/wetdry.mjs';
test('Fast default explicit; Full preserves original options and watched cadence',()=>{
 assert.equal(nativePaintMode().mode,'fast');assert.equal(nativePaintMode().approximate,true);
 const original={level:60,levelMax:140,levelTol:.02,dt:2};
 assert.strictEqual(nativeDryOptions('full',original),original);
 assert.deepEqual(nativeDryOptions('fast',original),{...original,dt:14,analyticTail:true});
 const watched={...original,onStep:()=>{}};assert.strictEqual(nativeDryOptions('fast',watched),watched);
 assert.throws(()=>nativePaintMode('quick'));assert.throws(()=>nativeDryOptions('fast',{dt:NaN}));
});
test('real CPU Fast dry reaches actual dry paper and fixed positive pigment with fewer tail steps',()=>{
 const pigment={K:[.35,.49,.66],S:[.06,.025,.014],rho:.05,omega:1.4,gamma:.15};
 const run=mode=>{const s=createSheet(makePaper(12,12,{seed:5}),[pigment]);
 for(let y=4;y<8;y++)for(let x=4;x<8;x++)deposit(s,y*12+x,.15,[.025]);
 const count=dry(s,30000,DEFAULTS,nativeDryOptions(mode,{level:60,levelMax:140,dt:2}));
 const paper=measurePaper(s,Array.from({length:s.n},(_,i)=>i));
 assert.equal(paper.dry,true);assert.ok(s.layers.length>0);
 assert.ok(s.layers.flatMap(v=>Array.from(v[0])).every(Number.isFinite));
 assert.ok(s.layers.reduce((sum,v)=>sum+v[0].reduce((a,b)=>a+b,0),0)>0);
 return count;};
 assert.ok(run('fast')<run('full'));
});
