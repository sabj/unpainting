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

test('a pen line on paper comes back as a line file in source pixels', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-lines-'));
  try {
    const W = 200, H = 120, px = Buffer.alloc(W * H * 3, 245);
    for (let x = 30; x < 170; x++) for (let y = 59; y < 61; y++) { const i = (y * W + x) * 3; px[i] = 60; px[i + 1] = 45; px[i + 2] = 35; }
    const image = path.join(dir, 't.png');
    await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toFile(image);
    const r = await writeInkLines(image, path.join(dir, 'out'), { width: 200 });
    assert.ok(r.lines.length >= 1);
    const doc = JSON.parse(fs.readFileSync(r.file, 'utf8'));
    assert.deepEqual(doc.image, { w: W, h: H });
    const xs = doc.lines.flatMap(g => g.points.map(p => p[0]));
    assert.ok(Math.min(...xs) < 60 && Math.max(...xs) > 140);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
