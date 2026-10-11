import test from 'node:test';
import assert from 'node:assert/strict';
import {unsupportedAxisEdges} from './target-regions.mjs';

test('seam check excludes clipped paper rims but rejects unsupported interior boundaries',()=>{
 const w=100,h=100,rgb=new Uint8Array(w*h*3).fill(230);
 const mask=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=2;x<w-2;x++)mask[y*w+x]=1;
 assert.deepEqual(unsupportedAxisEdges(mask,w,h,rgb),[]);
 for(let y=0;y<h;y++)for(let x=50;x<w;x++)mask[y*w+x]=0;
 assert(unsupportedAxisEdges(mask,w,h,rgb).some(edge=>edge.at===50&&edge.axis==='vertical'));
 for(let y=0;y<h;y++)for(let x=50;x<w;x++)for(let c=0;c<3;c++)rgb[(y*w+x)*3+c]=130;
 assert.deepEqual(unsupportedAxisEdges(mask,w,h,rgb),[]);
});
