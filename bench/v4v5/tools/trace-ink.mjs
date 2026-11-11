// Trace the target's own hard dark pen lines as a drawing file (the pen follows the lines).
// The limits are derived per subject from its own value range, not taken from any plate: the subject's
// lightest value (paper, the 99th percentile of luminance) and darkest (the ink, the 0.1th percentile, so a few
// thin lines still count) span a nine-step value scale, the painter's usual one. A pixel is line if it is at
// least one step of that scale darker than both sides along x, y or a diagonal within 2-4 px (a thin dark line,
// not a dark mass), and it lies in the darker half of the scale (no lighter than its middle step). The mask is
// thinned and chained into polylines; spans shorter than MIN_LEN px are dropped (14 px, the value the harness's
// own example and dry planner always used). Each line is drawn with one nib and one pressure: its width and
// weight come from the line's mean darkness, the same along the whole stroke; the painter's hand gives the
// pressure curve along it (taper in and out). Nothing is read point by point.
// Nothing is settable: whether a subject has pen lines is the declared medium's choice, not a contrast turned
// down until lines appear.
// node bench/tools/trace-ink.mjs target.png out.json
import fs from "node:fs";import sharp from "sharp";
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
const seen=new Uint8Array(n),nb=i=>{const x=i%W,y=(i/W)|0,r=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<W&&yy<H&&M[yy*W+xx])r.push(yy*W+xx);}return r;};
const chains=[];const ends=[];for(let i=0;i<n;i++)if(M[i]&&nb(i).length===1)ends.push(i);
const walk=s=>{const path=[s];seen[s]=1;let c=s;for(;;){const nx=nb(c).filter(j=>!seen[j]);if(!nx.length)break;c=nx[0];seen[c]=1;path.push(c);}return path;};
for(const s of ends)if(!seen[s])chains.push(walk(s));for(let i=0;i<n;i++)if(M[i]&&!seen[i])chains.push(walk(i));
// Keep structure, not texture: drop wiggly short spans (stone flecks, leaves).
const res=[];for(const p of chains){if(p.length<minLen)continue;const chord=Math.hypot(p[0]%W-p.at(-1)%W,((p[0]/W)|0)-((p.at(-1)/W)|0));if(chord/p.length<.55&&p.length<40)continue;const pts=p.filter((_,j)=>j%2===0||j===p.length-1).map(i=>[i%W+.5,((i/W)|0)+.5]);let len=0;for(let j=1;j<pts.length;j++)len+=Math.hypot(pts[j][0]-pts[j-1][0],pts[j][1]-pts[j-1][1]);
 const d=pts.reduce((a,[x,y])=>a+1-at(Math.floor(x),Math.floor(y)),0)/pts.length;
 res.push({points:pts,length:len,weight:Math.min(.85,.4+.55*d),strength:1,width:+(1.6+2.4*d).toFixed(2),closed:false,role:"subject",object:"target-hard-line",kind:"line",group:"detail",selection:{method:"traced target thin dark line, one step of the subject's own nine-step value scale ("+minC.toFixed(3)+") darker than both sides, in its darker half (<= "+maxLum.toFixed(3)+"); one nib and one weight per line"}});}
fs.writeFileSync(out,JSON.stringify({image:{w:W,h:H},lines:res,source:tgt,crop:[0,0,W,H],registration:"traced from the target crop itself"},null,1));
let px=0;for(const i of M)px+=i;console.log("value range",ink.toFixed(3),"..",paper.toFixed(3),"step",minC.toFixed(3),"darkest half <=",maxLum.toFixed(3));console.log("line pixels",px,"spans",res.length,"total length",res.reduce((a,l)=>a+l.length,0).toFixed(0));
