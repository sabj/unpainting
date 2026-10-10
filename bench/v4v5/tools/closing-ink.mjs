// A closing-ink line set from a drawing file: its lines moved into a box of the target (x,y,w,h in the file's
// pixels), kept only where the target shows a hard dark line under them (darker than both sides), broken where that
// support lapses, weight from the target line darkness. No new geometry.
// node bench/tools/closing-ink.mjs lines.json target.png x,y,w,h out.json [minContrast=0.10]
import fs from "node:fs";import sharp from "sharp";
const [src,tgt,boxs,out,mc="0.10"]=process.argv.slice(2);const [bx,by,bw,bh]=boxs.split(",").map(Number),minC=+mc;
const T=JSON.parse(fs.readFileSync(src));const {data,info}=await sharp(tgt).removeAlpha().raw().toBuffer({resolveWithObject:true});
const L=(x,y)=>{x=Math.max(0,Math.min(info.width-1,Math.round(x)));y=Math.max(0,Math.min(info.height-1,Math.round(y)));const i=(y*info.width+x)*3;return (.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])/255;};
const lines=[];let kept=0,seen=0,pts=0,keptPts=0;
for(const l of T.lines){const P=l.points.map(([x,y])=>[x-bx,y-by]);
 // support per point: darker than both sides across the local normal by minC
 const sup=P.map((p,j)=>{const a=P[Math.max(0,j-1)],b=P[Math.min(P.length-1,j+1)];let dx=b[0]-a[0],dy=b[1]-a[1];const m=Math.hypot(dx,dy)||1;dx/=m;dy/=m;const nx=-dy,ny=dx;
  if(p[0]<1||p[1]<1||p[0]>bw-2||p[1]>bh-2)return -1;let c=L(p[0],p[1]);for(const s of [-.7,.7])c=Math.min(c,L(p[0]+nx*s,p[1]+ny*s));
  const side=Math.min(Math.max(L(p[0]+nx*2.5,p[1]+ny*2.5),L(p[0]+nx*3.5,p[1]+ny*3.5)),Math.max(L(p[0]-nx*2.5,p[1]-ny*2.5),L(p[0]-nx*3.5,p[1]-ny*3.5)));return side-c;});
 seen++;pts+=P.length;let run=[];
 const flush=()=>{if(run.length>=4){let len=0;for(let q=1;q<run.length;q++)len+=Math.hypot(run[q][0]-run[q-1][0],run[q][1]-run[q-1][1]);
   if(len>=6){const idx=run.map(r=>r[2]);const dark=idx.map(j=>1-L(P[j][0],P[j][1]));
    lines.push({...l,points:run.map(r=>[r[0],r[1]]),length:len,weights:dark.map(d=>Math.min(.9,.45+.6*d)),weight:Math.min(.9,.45+.6*dark.reduce((a,b)=>a+b,0)/dark.length),widths:idx.map(j=>Math.min(l.widths?.[j]??l.width,2.6)),selection:{method:"target hard-dark-line support, broken where support lapses",sourceObject:l.object,minContrast:minC}});keptPts+=run.length;kept++;}}run=[];};
 for(let j=0;j<P.length;j++){if(sup[j]>=minC)run.push([P[j][0],P[j][1],j]);else flush();}flush();}
fs.writeFileSync(out,JSON.stringify({image:{w:bw,h:bh},lines,source:src,crop:[bx,by,bw,bh],registration:"crop translation of registered traced guide lines; spans kept only on target-visible hard dark lines"},null,1));
console.log("source lines",seen,"kept spans",kept,"points",keptPts,"of",pts);
