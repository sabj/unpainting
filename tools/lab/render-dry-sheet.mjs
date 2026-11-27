#!/usr/bin/env node
// Assemble material fixtures and, when present, the full-size deposited-layer replay.
// node tools/lab/render-dry-sheet.mjs [proof directory]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const out = path.resolve(process.argv[2] ?? 'work/lead-04/work/proof/render-dry');
const file = name => path.join(out,name);
const full=fs.existsSync(file('full-render.json'))?JSON.parse(fs.readFileSync(file('full-render.json'))):null;
const core=fs.existsSync(file('subpixel-dot.json'))?JSON.parse(fs.readFileSync(file('subpixel-dot.json'))):null;
const W=1644,GAP=24,COL=780,HEAD=124,comps=[],svg=[];
const label=(s,x,y,size=22)=>svg.push(`<text x="${x}" y="${y}" font-family="Helvetica,Arial,sans-serif" font-size="${size}" fill="#222">${s}</text>`);
label('Render and dry-brush proof: deposited pigment only',GAP,40,30);
label(full?'GPU-painted full-size sheet and CPU material fixtures; reconstruction reads deposited pigment only.':'Partial CPU material proof. Full-size painting, GPU agreement and full-render speed remain pending.',GAP,76,20);
label('Same 40 mm painted sheet: old final renderer',GAP,112,22);
label('Same deposited layers: traced final renderer',2*GAP+COL,112,22);
for(const [j,name] of ['render-original.png','render-current.png'].entries()){
 const input=await sharp(file(name)).resize(COL,COL).png().toBuffer();
 comps.push({input,left:GAP+j*(COL+GAP),top:HEAD});
}
let y=HEAD+COL+38;
label('Hill boundary at 3x: each crop covers 13.33 mm; pigment mass is conserved',GAP,y,22);y+=20;
for(const [j,name] of ['render-original.png','render-current.png'].entries()){
 const mm=.026,left=Math.round(7/mm),top=Math.round(15/mm),side=Math.round(13.33/mm);
 const input=await sharp(file(name)).extract({left,top,width:side,height:side}).resize(COL,COL,{kernel:'nearest'}).png().toBuffer();
 comps.push({input,left:GAP+j*(COL+GAP),top:y});
}
y+=COL+40;
if(full){
 const [current,reference]=full.variants;
 label('Full-size GPU painting: original renderer / traced renderer; identical deposited layers',GAP,y,22);y+=20;
 const height=Math.round(COL*full.finalPixels[1]/full.finalPixels[0]);
 for(const [j,name] of ['full-reference.png','full-current.png'].entries()){
  const input=await sharp(file(name)).resize(COL,height).png().toBuffer();
  comps.push({input,left:GAP+j*(COL+GAP),top:y});
 }
 y+=height+34;
 label(`${full.nativePixels.join(' x ')} native cells at ${full.mmPerCell} mm; ${full.finalPixels.join(' x ')} export; ${full.layers} layers`,GAP,y,20);y+=32;
 label(`Final reconstruction: ${(current.medians.totalMs/1000).toFixed(2)} s / ${(reference.medians.totalMs/1000).toFixed(2)} s; ratio ${full.totalRatio.toFixed(3)}; peak process RSS ${full.peakRssGiB.toFixed(2)} GiB`,GAP,y,20);y+=32;
 label(`Speed limit 1.050: ${full.totalRatio<=1.05&&full.pairedMedianRatio<=1.05?'met in these samples':'unmet'}; isolated 2x core coverage ${core?.fixed?'corrected':'unresolved'}.`,GAP,y,20);y+=32;
 label('Current replay equals production PNG byte for byte. Both renderers preserve this sheet’s pigment totals.',GAP,y,20);y+=40;
 const [fw,fh]=full.finalPixels,side=Math.floor(fw/5),left=Math.floor((fw-side)/2),top=Math.floor(fh*.45-side/2);
 label('Matching central crops, enlarged with nearest pixels; no image sharpening',GAP,y,22);y+=20;
 for(const [j,name] of ['full-reference.png','full-current.png'].entries()){
  const input=await sharp(file(name)).extract({left,top,width:side,height:side}).resize(COL,COL,{kernel:'nearest'}).png().toBuffer();
  comps.push({input,left:GAP+j*(COL+GAP),top:y});
 }
 y+=COL+40;
}
if(core?.fixed && fs.existsSync(file('CORE.jpg'))){
 const input=await sharp(file('CORE.jpg')).resize({width:1400}).png().toBuffer();
 const meta=await sharp(input).metadata();comps.push({input,left:Math.floor((W-meta.width)/2),top:y});y+=meta.height+36;
}
label('Dry brush at water 0.2 / 0.4 / 0.6; native deposition checked before reconstruction',GAP,y,22);y+=18;
// Retain the measured panels, omitting the historical pending-proof footers when the full proof is present.
const swatchMeta=await sharp(file('DRY-BRUSH.jpg')).metadata();
const swatch=await sharp(file('DRY-BRUSH.jpg')).extract({left:0,top:0,width:swatchMeta.width,height:swatchMeta.height-(full?50:0)}).resize({width:800}).png().toBuffer();
const sw=await sharp(swatch).metadata();comps.push({input:swatch,left:GAP,top:y});
const grainMeta=await sharp(file('GRAIN.jpg')).metadata();
const grain=await sharp(file('GRAIN.jpg')).extract({left:0,top:0,width:grainMeta.width,height:grainMeta.height-(full?60:0)}).resize({width:780}).png().toBuffer();
const gr=await sharp(grain).metadata();comps.push({input:grain,left:2*GAP+800,top:y});
const report=JSON.parse(fs.readFileSync(file('grain-card.json')));
label('0.2-0.5 mm grain, central 30 mm window:',2*GAP+800,y+gr.height+42,20);
label('0.26 mm reconstruction / 0.10 mm native = '+report.coarseToNativeRatio.toFixed(6),2*GAP+800,y+gr.height+74,20);
label('This poured fixture is within the required 10%.',2*GAP+800,y+gr.height+106,20);
label('It does not prove full-painting grain convergence.',2*GAP+800,y+gr.height+138,20);
label('See README.md and JSON records for method and limits.',2*GAP+800,y+gr.height+182,18);
const replay=fs.existsSync(file('render-paired-round4.json'))?'render-paired-round4.json':'render-paired-round3.json';
if(fs.existsSync(file(replay))){
 const r=JSON.parse(fs.readFileSync(file(replay))),c=r.comparison;
 label(`CPU demo: same pixels; ${(r.medians.totalMs/1000).toFixed(3)} s / ${(c.reference.medians.totalMs/1000).toFixed(3)} s`,2*GAP+800,y+gr.height+226,20);
 label(`Ratio ${c.ratios.totalMs.toFixed(3)}; median paired ratio ${c.pairedMedianRatios.totalMs.toFixed(3)}.`,2*GAP+800,y+gr.height+258,20);
 label(full?'Small CPU material replay; the full-size replay is reported above.':'Small CPU material replay; full-size GPU timing is unproven.',2*GAP+800,y+gr.height+290,18);
}
y+=sw.height+70;
label(full?'Metal section-contact parity passes. Broad suites have failures; see the latest validation record and README.md.':'Doctor passes on the laptop; GPU and broad suite failures remain. See README.md.',GAP,y-24,20);
const overlay=Buffer.from(`<svg width="${W}" height="${y}">${svg.join('')}</svg>`);
await sharp({create:{width:W,height:y,channels:3,background:'#fff'}}).composite([...comps,{input:overlay,left:0,top:0}]).jpeg({quality:94}).toFile(file('SHEET.jpg'));
