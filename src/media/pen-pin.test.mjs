import test from 'node:test';
import assert from 'node:assert/strict';
import { createPen, dipPen, penStroke } from './pen.mjs';
import { createSheet } from './sheet.mjs';
import { makePaper } from './paper.mjs';
test('pinning is shared by paper and patchiness, while pen histories remain independent',()=>{
 const paper=makePaper(12,10),pig={K:[1,1,1],S:[.02,.02,.02],rho:.05,omega:60,gamma:0};
 const draw=(paper,patchy)=>{
  const pen=createPen({patchy});
  dipPen(pen,[1]); penStroke(pen,createSheet(paper,[pig]),[{x:4,y:5,p:.3},{x:6,y:5,p:.3}]);
  return pen;
 };
 const a=draw(paper,.3),b=draw(paper,.3),c=draw(paper,.5),d=draw(makePaper(12,10),.3);
 assert.strictEqual(a.pin,b.pin);
 assert.notStrictEqual(a.A,b.A);assert.notStrictEqual(a.seen,b.seen);assert.notStrictEqual(a.given,b.given);
 assert.notStrictEqual(a.pin,c.pin);assert.notStrictEqual(a.pin,d.pin);
 for(let i=0;i<paper.w*paper.h;i++) assert.equal(a.pin[i],Math.fround(1+.3*(Math.min(1,Math.max(0,(paper.height[i]-paper.valley[i])*2.5+.5))-.5)));
});
