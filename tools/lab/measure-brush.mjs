// Same normal edge sampling and linear detrending as brush-heading.test.mjs.
// node tools/lab/measure-brush.mjs /absolute/browser-media-dir [...]
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const pigments=[{K:[.35,.49,.66],S:[.06,.025,.014],rho:.05,omega:1.4,gamma:.15}];
export async function measure(dir){
 const get=n=>import(pathToFileURL(path.join(dir,n+'.js')));
 const [{makePaper},{createSheet},{createBrush,dip,stroke,setStrokeVariety}]=await Promise.all([get('paper'),get('sheet'),get('brush')]);
 setStrokeVariety?.(0);const result={};
 for(const curved of [false,true]){
  const N=200,R=20,at=t=>[34+132*t,curved?65+40*Math.sin(t*Math.PI):40+110*t],points=Array.from({length:22},(_,i)=>{const [x,y]=at(i/21);return {x:2*Math.round(x/2),y:2*Math.round(y/2),p:1,v:curved?.25:4};});
  const sh=createSheet(makePaper(N,N),pigments),br=createBrush({flat:true,radius:R,capacity:40,splay:0});dip(br,{water:1,conc:[.6]});
  // Keep the brush down between pointer samples, as in the actual lab worker.
  for(let i=1;i<points.length;i++)stroke(br,sh,[points[i-1],points[i]],{lift:i===points.length-1});
  const edges=[1,-1].map(sign=>{const e=[];for(let t=.2;t<=.8;t+=.25/172){const [x,y]=at(t),[nx,ny]=at(t+.0001),len=Math.hypot(nx-x,ny-y),ux=(nx-x)/len,uy=(ny-y)/len;let edge=0;for(let d=0;d<2*R;d+=.1){const xx=Math.floor(x-sign*uy*d),yy=Math.floor(y+sign*ux*d),j=yy*N+xx;if(sh.G[0][j]+sh.D[0][j]>1e-6)edge=d;}e.push(edge);}const n=e.length,mean=e.reduce((a,b)=>a+b,0)/n;let sx=0,sxy=0;for(let i=0;i<n;i++){sx+=(i-n/2)**2;sxy+=(i-n/2)*(e[i]-mean);}return Math.sqrt(e.reduce((sum,v,i)=>sum+(v-mean-sxy/sx*(i-n/2))**2,0)/n);});
  result[curved?'slowCurve':'fastStraight']={edgeRms:edges,meanRms:edges.reduce((a,b)=>a+b,0)/2};
 }
 setStrokeVariety?.(1);return result;
}
if(import.meta.main)for(const dir of process.argv.slice(2))console.log(JSON.stringify({dir,...await measure(dir)}));
