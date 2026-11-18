import test from 'node:test';
import assert from 'node:assert/strict';
import {planningShapes} from './shape-refit.mjs';
test('small painted colour families survive when evenly spaced seeds all hit blank paper',()=>{
 const w=60,h=20,D=new Float32Array(w*h*3);
 for(let y=0;y<h;y++)for(let x=4;x<14;x++)D.set(x<9?[.8,.1,.1]:[.1,.1,.8],(y*w+x)*3);
 const groups=planningShapes(D,w,h,{families:3,minCells:1});
 const painted=groups.filter(g=>g.some(i=>i%w>=4&&i%w<14));
 assert.ok(painted.length>=2,'distinct painted families should not collapse into one');
});
