// Trace the target's own hard dark pen lines as a drawing file (the pen follows the lines).
// The limits are derived per subject from its own value range, not taken from any plate: the subject's
// lightest value (paper, the 99th percentile of luminance) and darkest (the ink, the 0.1th percentile, so a few
// thin lines still count) span a nine-step value scale, the painter's usual one. A pixel is line if it is at
// least one step of that scale darker than both sides along x, y or a diagonal within 2-4 px (a thin dark line,
// not a dark mass), and it lies in the darker half of the scale (no lighter than its middle step). The mask is
// thinned and chained into polylines (trace-lines.mjs); spans shorter than MIN_LEN px are dropped (14 px, the value the harness's
// own example and dry planner always used). Each line is drawn with one nib and one pressure: its width and
// weight come from the line's mean darkness, the same along the whole stroke; the painter's hand gives the
// pressure curve along it (taper in and out). Nothing is read point by point.
// Nothing is settable: whether a subject has pen lines is the declared medium's choice, not a contrast turned
// down until lines appear.
// node bench/tools/trace-ink.mjs target.png out.json
import fs from "node:fs";import sharp from "sharp";import {walkChains,simplify,splitAtTurns,joinPieces,hasLightSide} from "./trace-lines.mjs";
const MIN_LEN=14,VALUE_STEPS=9;
const args=process.argv.slice(2);if(args.length!==2)throw new Error("usage: node bench/tools/trace-ink.mjs target.png out.json (the limits come from the subject's own value range and are not settable)");
const [tgt,out]=args;const minLen=MIN_LEN;
const {data,info}=await sharp(tgt).removeAlpha().raw().toBuffer({resolveWithObject:true});const W=info.width,H=info.height,n=W*H;
const lum=new Float32Array(n);for(let i=0;i<n;i++)lum[i]=(.2126*data[3*i]+.7152*data[3*i+1]+.0722*data[3*i+2])/255;
const sorted=Float32Array.from(lum).sort(),q=f=>sorted[Math.min(n-1,Math.floor(f*n))];
const paper=q(.99),ink=q(.001),step=(paper-ink)/(VALUE_STEPS-1);
const minC=step,maxLum=ink+(paper-ink)/2;
const at=(x,y)=>lum[Math.max(0,Math.min(H-1,y))*W+Math.max(0,Math.min(W-1,x))];
const M=new Uint8Array(n);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const v=at(x,y);if(v>maxLum)continue;let best=0;
 for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]])for(const d of [2,3]){const a=Math.max(at(x+dx*d,y+dy*d),at(x+dx*(d+1),y+dy*(d+1))),b=Math.max(at(x-dx*d,y-dy*d),at(x-dx*(d+1),y-dy*(d+1)));best=Math.max(best,Math.min(a,b)-v);}
 if(best>0&&best>=minC)M[y*W+x]=1;}
const N=(x,y)=>x<0||y<0||x>=W||y>=H?0:M[y*W+x];let changed=true;
while(changed){changed=false;for(const step of [0,1]){const del=[];for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(!M[y*W+x])continue;const p=[N(x,y-1),N(x+1,y-1),N(x+1,y),N(x+1,y+1),N(x,y+1),N(x-1,y+1),N(x-1,y),N(x-1,y-1)];const b=p.reduce((a,c)=>a+c,0);if(b<2||b>6)continue;let a=0;for(let k=0;k<8;k++)if(!p[k]&&p[(k+1)%8])a++;if(a!==1)continue;if(step===0?(p[0]*p[2]*p[4]||p[2]*p[4]*p[6]):(p[0]*p[2]*p[6]||p[0]*p[4]*p[6]))continue;del.push(y*W+x);}for(const i of del)M[i]=0;if(del.length)changed=true;}}
// Lines as a pen draws them (trace-lines.mjs): walked straight through crossings, the thinning's one-pixel staircase
// removed, split where a line turns back on itself (the pen lifts), and joined where one piece continues another
// across the side test's own reach (REACH px: a line that passes any mark that close breaks there).
const REACH=4;
const pieces=joinPieces(walkChains(M,W,H).map(p=>simplify(p.map(i=>[i%W+.5,((i/W)|0)+.5]),1)).flatMap(splitAtTurns),{gap:REACH});
const plen=P=>{let l=0;for(let j=1;j<P.length;j++)l+=Math.hypot(P[j][0]-P[j-1][0],P[j][1]-P[j-1][1]);return l;};
// Keep structure, not texture: drop short spans, wiggly short spans (stone flecks, leaves), and lines with dark on both
// sides (inside a dark mass the wash states the form; ink there is shadow or fur rewritten as line).
const res=[];let inMass=0;for(const pts of pieces){const len=plen(pts);if(len<minLen)continue;const chord=Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1]);if(chord/len<.55&&len<40)continue;
 if(!hasLightSide(pts,at,maxLum)){inMass++;continue;}
 const d=pts.reduce((a,[x,y])=>a+1-at(Math.floor(x),Math.floor(y)),0)/pts.length;
 res.push({points:pts,length:len,weight:Math.min(.85,.4+.55*d),strength:1,width:+(1.6+2.4*d).toFixed(2),closed:false,role:"subject",object:"target-hard-line",kind:"line",group:"detail",selection:{method:"traced target thin dark line, one step of the subject's own nine-step value scale ("+minC.toFixed(3)+") darker than both sides, in its darker half (<= "+maxLum.toFixed(3)+"), with a lighter side (a contour, not inside a dark mass); walked through crossings, joined across the tracer's reach, split where it turns back; one nib and one weight per line"}});}
fs.writeFileSync(out,JSON.stringify({image:{w:W,h:H},lines:res,source:tgt,crop:[0,0,W,H],registration:"traced from the target crop itself"},null,1));
let px=0;for(const i of M)px+=i;console.log("value range",ink.toFixed(3),"..",paper.toFixed(3),"step",minC.toFixed(3),"darkest half <=",maxLum.toFixed(3));console.log("line pixels",px,"spans",res.length,"inside dark masses",inMass,"total length",res.reduce((a,l)=>a+l.length,0).toFixed(0));
