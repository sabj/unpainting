// Full recorded materials and ordered events, never recipes inferred from images.
// node tools/lab/build-live-examples.mjs /path/to/h36-run /path/to/white-ships-run
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import sharp from 'sharp';
const root=path.resolve(import.meta.dirname,'../..'), out=path.join(root,'docs/lab/examples');
const [yale,ships]=process.argv.slice(2);
if(!yale||!ships)throw Error('Supply h36 and White Ships run directories');
const json=p=>JSON.parse(fs.readFileSync(p));
const tape=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(p,'marks.json.gz'))));
function excerpt(t,limit){
 let n=0;const marks=[];
 for(const m of t.marks){if(['s','P','g'].includes(m.k)&&n++>=limit)break;marks.push(m);}
 return {...t,marks,strokeCount:Math.min(n,limit)};
}
const yt=tape(yale),wt=tape(ships);
for(const [id,t] of [['h36-a',yt],['white-ships',wt]])for(const count of [250,2500]){
 fs.mkdirSync(path.join(out,id),{recursive:true});
 fs.writeFileSync(path.join(out,id,`live-${count}.json.gz`),zlib.gzipSync(JSON.stringify(excerpt(t,count)),{level:9}));
}
const dir=path.join(out,'h36-a');
for(const f of ['h36-a.png','h36-a.json','h36.jpg','target-guard.json'])fs.copyFileSync(path.join(yale,f),path.join(dir,f));
const rec=json(path.join(yale,'frames.json'));
for(const f of rec.frames)await sharp(path.join(yale,f.src)).resize({width:720}).webp({quality:82}).toFile(path.join(dir,f.src.replace('.jpg','.webp')));
await sharp(path.join(yale,'painting.png')).resize({width:720}).webp({quality:88}).toFile(path.join(dir,'final.webp'));
await sharp(path.join(yale,'painting.png')).resize({width:180}).webp({quality:82}).toFile(path.join(dir,'thumb.webp'));
const strokeCounts=[];let count=0;for(const m of yt.marks){if(['s','P'].includes(m.k))count++;if(m.k==='m')strokeCounts[m.i]=count;}
const paths=[];let frame=0;
for(const m of yt.marks){if(m.k==='m'){frame=m.i;continue;}if(!['s','P'].includes(m.k))continue;const opts=m.k==='s'?yt.brushOpts[yt.brushes[m.b]??m.b]:yt.penOpts[yt.pens[m.pen]??m.pen];const k=1/(yt.scale*(m.r||1));paths.push([Math.min(rec.frames.length-1,frame+1),m.k==='P'?1:0,m.k==='P'?(opts.nib??1)/2:opts.radius,...m.d.flatMap(q=>[q[0]*k,q[1]*k])]);}
fs.writeFileSync(path.join(dir,'paths.json'),JSON.stringify({w:yt.w,h:yt.h,unit:1,strokes:paths})+'\n');
const film={paths:'examples/h36-a/paths.json',frames:rec.frames.map(f=>'examples/h36-a/'+f.src.replace('.jpg','.webp')),frameNumbers:rec.frames.map((_,i)=>i),frameStrokes:strokeCounts,final:'examples/h36-a/final.webp',aspect:yt.w/yt.h,seconds:40,strokes:count};
const old=json(path.join(out,'recorded.json'));
for(const e of old.examples.filter(e=>e.id!=='h36-a')){e.live={250:'examples/white-ships/live-250.json.gz',2500:'examples/white-ships/live-2500.json.gz'};e.title=e.title.replace(/: first \d+ strokes/, '');e.thumb='examples/white-ships-run/painting.webp';}
// One complete source per painting; short/full are controls on that source.
const white={...(old.examples.find(e=>e.id==='white-ships')||old.examples[0]),id:'white-ships',title:'White Ships',thumb:'examples/white-ships-run/painting.webp'};
if(!fs.existsSync(path.join(out,'white-ships-run/painting.webp')))white.thumb='examples/white-ships-run/'+json(path.join(out,'white-ships-run/frames.json')).frames.at(-1).src;
const yf={id:'h36-a',title:'Yale gateway · h36-a',kind:'Ink and watercolor',target:'examples/h36-a/h36-a.png',thumb:'examples/h36-a/thumb.webp',credit:'Carol M. Highsmith / Library of Congress, public domain photograph. Stylised target made with an image model. Painter output: CC BY 4.0.',live:{250:'examples/h36-a/live-250.json.gz',2500:'examples/h36-a/live-2500.json.gz'},film,source:'fin1086-1010-050155.tip.finish.h36a',honesty:'fair, gentle anti-cheat mode'};
fs.writeFileSync(path.join(out,'recorded.json'),JSON.stringify({examples:[yf,white]},null,2)+'\n');
const catalog=json(path.join(out,'examples.json'));catalog.examples=catalog.examples.filter(e=>!['trumbull','h36-a'].includes(e.id));catalog.examples.push(yf);fs.writeFileSync(path.join(out,'examples.json'),JSON.stringify(catalog,null,2)+'\n');
for(const f of fs.readdirSync(out))if(f.startsWith('trumbull'))fs.rmSync(path.join(out,f),{recursive:true});
console.log('Built h36 and White Ships live tapes (250 and 2,500 recorded strokes).');
