#!/usr/bin/env node
// The drawing in a painting against the drawing in its source, with src/eval/ink.mjs. The density judges cannot see
// a pen line as anything but tone; this is the number an ink iteration is kept or reverted on.
//   node tools/ink-judge.mjs --image refs/real/met-459236-...jpg --painted work/iter/001/set/tiepolo/painting.jpg
import sharp from 'sharp';
import fs from 'node:fs';
import { lineQuality } from '../src/eval/linequality.mjs';
import { separate } from '../src/crop/inkwash.mjs';
import { gaussian } from '../src/keyframes/density.mjs';
import { inkAgreement } from '../src/eval/ink.mjs';

const argv = process.argv.slice(2), opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const painted = await sharp(opt('painted')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const w = painted.info.width, h = painted.info.height, n = w * h;
const src = await sharp(opt('image')).flatten({ background: '#fff' }).resize(w, h, { fit: 'fill' }).removeAlpha().raw().toBuffer();
const lum = (b, i) => 0.2126 * b[i * 3] + 0.7152 * b[i * 3 + 1] + 0.0722 * b[i * 3 + 2];
const light = [...Array(n).keys()].sort((a, b) => lum(src, b) - lum(src, a)).slice(0, Math.max(1, n / 10 | 0));
const paper = [0, 1, 2].map(c => light.reduce((s, i) => s + src[i * 3 + c], 0) / light.length);
const r = inkAgreement(src, painted.data, w, h, paper, { tol: Number(opt('tol', 2)) });
console.log(`ink at ${w}x${h}: recall ${r.recall.toFixed(2)} precision ${r.precision.toFixed(2)} share source ${(100 * r.srcInkShare).toFixed(1)}% painted ${(100 * r.paintedInkShare).toFixed(1)}% width ${r.widthRatio == null ? '?' : r.widthRatio.toFixed(2)}`);
for (const f of r.flags) console.log(`  ! ${f}`);

const pl=.2126*paper[0]+.7152*paper[1]+.0722*paper[2];
const density=b=>Float32Array.from({length:n},(_,i)=>Math.max(0,-Math.log(Math.max(.02,Math.min(1,lum(b,i)/pl)))));
const split=separate(painted.data,w,h,paper), ink=density(painted.data).map((v,i)=>split.ink[i]?v:0);
const quality=lineQuality(ink,density(src),w,h,gaussian);
const report={agreement:r,lineQuality:quality,scope:'post-render, inferred ink including possible wash edges; never painting feedback',width:w,height:h};
if(opt('out',''))fs.writeFileSync(opt('out'),JSON.stringify(report,null,2));
console.log('line quality',JSON.stringify(quality));
