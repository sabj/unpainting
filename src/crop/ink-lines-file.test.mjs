import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { inkCells, writeInkLines } from './ink-lines-file.mjs';
test('in-memory ink share equals the line writer separator without writing artifacts',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ink-cell-share-'));
 try{
  const rgb=Buffer.alloc(96*64*3,245);
  for(let y=8;y<56;y++)for(let x=12;x<86;x++)if(x%17<2)rgb.fill(25,(y*96+x)*3,(y*96+x)*3+3);
  const image=path.join(dir,'input.png');
  await sharp(rgb,{raw:{width:96,height:64,channels:3}}).png().toFile(image);
  const observed=await inkCells(image);
  assert.deepEqual(fs.readdirSync(dir),['input.png']);
  const written=await writeInkLines(image,path.join(dir,'lines'));
  assert.equal(observed.inkCells,written.inkCells);
  assert.equal(observed.w,written.w);assert.equal(observed.h,written.h);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
