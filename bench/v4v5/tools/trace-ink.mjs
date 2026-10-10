// Trace the target's own hard dark pen lines as a drawing file (the pen follows the lines).
// A pixel is line if it is darker than both sides along x, y or a diagonal by minC within
// 2-4 px (a thin dark line, not a dark mass). The mask is thinned and chained into
// polylines; spans shorter than minLen px are dropped. Weight follows the line darkness.
// node bench/tools/trace-ink.mjs target.png out.json [minC=.12] [minLen=10] [maxLum=.62]
import fs from "node:fs";import sharp from "sharp";
const [tgt,out,mc=".12",ml="10",md=".62"]=process.argv.slice(2);const minC=+mc,minLen=+ml,maxLum=+md;
const {data,info}=await sharp(tgt).removeAlpha().raw().toBuffer({resolveWithObject:true});const W=info.width,H=info.height,n=W*H;
const lum=new Float32Array(n);for(let i=0;i<n;i++)lum[i]=(.2126*data[3*i]+.7152*data[3*i+1]+.0722*data[3*i+2])/255;
const at=(x,y)=>lum[Math.max(0,Math.min(H-1,y))*W+Math.max(0,Math.min(W-1,x))];
const M=new Uint8Array(n);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const v=at(x,y);if(v>maxLum)continue;let best=0;
 for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]])for(const d of [2,3]){const a=Math.max(at(x+dx*d,y+dy*d),at(x+dx*(d+1),y+dy*(d+1))),b=Math.max(at(x-dx*d,y-dy*d),at(x-dx*(d+1),y-dy*(d+1)));best=Math.max(best,Math.min(a,b)-v);}
 if(best>=minC)M[y*W+x]=1;}
const N=(x,y)=>x<0||y<0||x>=W||y>=H?0:M[y*W+x];let changed=true;
while(changed){changed=false;for(const step of [0,1]){const del=[];for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(!M[y*W+x])continue;const p=[N(x,y-1),N(x+1,y-1),N(x+1,y),N(x+1,y+1),N(x,y+1),N(x-1,y+1),N(x-1,y),N(x-1,y-1)];const b=p.reduce((a,c)=>a+c,0);if(b<2||b>6)continue;let a=0;for(let k=0;k<8;k++)if(!p[k]&&p[(k+1)%8])a++;if(a!==1)continue;if(step===0?(p[0]*p[2]*p[4]||p[2]*p[4]*p[6]):(p[0]*p[2]*p[6]||p[0]*p[4]*p[6]))continue;del.push(y*W+x);}for(const i of del)M[i]=0;if(del.length)changed=true;}}
const seen=new Uint8Array(n),nb=i=>{const x=i%W,y=(i/W)|0,r=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<W&&yy<H&&M[yy*W+xx])r.push(yy*W+xx);}return r;};
const chains=[];const ends=[];for(let i=0;i<n;i++)if(M[i]&&nb(i).length===1)ends.push(i);
const walk=s=>{const path=[s];seen[s]=1;let c=s;for(;;){const nx=nb(c).filter(j=>!seen[j]);if(!nx.length)break;c=nx[0];seen[c]=1;path.push(c);}return path;};
for(const s of ends)if(!seen[s])chains.push(walk(s));for(let i=0;i<n;i++)if(M[i]&&!seen[i])chains.push(walk(i));
// Keep structure, not texture: drop wiggly short spans (stone flecks, leaves) and lines over
// foliage (green under the line); a pen line in this plate is architecture.
const green=i=>data[3*i+1]>data[3*i]+4&&data[3*i+1]>data[3*i+2];
const res=[];for(const p of chains){if(p.length<minLen)continue;const chord=Math.hypot(p[0]%W-p.at(-1)%W,((p[0]/W)|0)-((p.at(-1)/W)|0));if(chord/p.length<.55&&p.length<40)continue;let g=0;for(let j=-2;j<=2;j++)for(const i of p){const x=i%W,y=((i/W)|0)+j;if(y>=0&&y<H&&green(y*W+x))g++;}if(g>p.length*1.5)continue;const pts=p.filter((_,j)=>j%2===0||j===p.length-1).map(i=>[i%W+.5,((i/W)|0)+.5]);let len=0;for(let j=1;j<pts.length;j++)len+=Math.hypot(pts[j][0]-pts[j-1][0],pts[j][1]-pts[j-1][1]);
 const dark=pts.map(([x,y])=>1-at(Math.floor(x),Math.floor(y)));const wts=dark.map(d=>Math.min(.85,.4+.55*d));
 res.push({points:pts,length:len,weights:wts,weight:wts.reduce((a,b)=>a+b,0)/wts.length,strength:1,widths:dark.map(d=>+(1.6+2.4*d).toFixed(2)),width:+(1.6+2.4*dark.reduce((a,b)=>a+b,0)/dark.length).toFixed(2),closed:false,role:"subject",object:"target-hard-line",kind:"line",group:"detail",selection:{method:"traced target thin dark line, darker than both sides by "+minC}});}
fs.writeFileSync(out,JSON.stringify({image:{w:W,h:H},lines:res,source:tgt,crop:[0,0,W,H],registration:"traced from the target crop itself"},null,1));
let px=0;for(const i of M)px+=i;console.log("line pixels",px,"spans",res.length,"total length",res.reduce((a,l)=>a+l.length,0).toFixed(0));
