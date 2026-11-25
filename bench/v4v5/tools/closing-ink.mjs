// A closing-ink line set from a drawing file: its lines moved into a box of the target (x,y,w,h in the file's
// pixels). Each line is decided whole: it is kept when at least half of its points lie on a hard dark line in the
// target (darker than both sides by minContrast), and dropped whole otherwise; a line is never broken where support
// lapses. A kept line has one weight, from its mean darkness, and one width. No new geometry.
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
 seen++;pts+=P.length;
 const on=sup.filter(v=>v>=minC).length;if(P.length<4||on<P.length/2)continue;
 let len=0;for(let q=1;q<P.length;q++)len+=Math.hypot(P[q][0]-P[q-1][0],P[q][1]-P[q-1][1]);if(len<6)continue;
 const dark=P.reduce((a,p)=>a+1-L(p[0],p[1]),0)/P.length,own=l.width??(l.widths?.length?l.widths.reduce((a,b)=>a+b,0)/l.widths.length:2.6);
 const {widths:_w,weights:_g,...rest}=l;
 lines.push({...rest,points:P,length:len,weight:Math.min(.9,.45+.6*dark),width:Math.min(own,2.6),selection:{method:"target hard-dark-line support on at least half the line, kept whole",sourceObject:l.object,minContrast:minC}});keptPts+=P.length;kept++;}
fs.writeFileSync(out,JSON.stringify({image:{w:bw,h:bh},lines,source:src,crop:[bx,by,bw,bh],registration:"crop translation of registered traced guide lines; whole lines kept when at least half lies on target-visible hard dark lines"},null,1));
console.log("source lines",seen,"kept whole",kept,"points",keptPts,"of",pts);
