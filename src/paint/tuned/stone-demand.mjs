// Stone and foliage colour for the Trumbull subject (Y1): one box-pigment mix per connected shape of stone or leaf
// cells, fitted to the shape's mean colour at plan time. The warm and leaf tests are fitted to that subject's
// stonework and trees. Runs smaller than minCells are pooled per class; each cell keeps the plan's own mass.
const hueOf=(r,g,b)=>Math.atan2(Math.sqrt(3)*(g-b),2*r-g-b)*180/Math.PI;
function runsOf(cls,w,h,minCells){
 const n=cls.length,lab=new Int32Array(n).fill(-1),groups=[],small=[];
 for(let s=0;s<n;s++){if(!cls[s]||lab[s]!==-1)continue;const q=[s];lab[s]=-2;for(let p=0;p<q.length;p++){const i=q[p],x=i%w;for(const j of [x?i-1:-1,x<w-1?i+1:-1,i>=w?i-w:-1,i+w<n?i+w:-1])if(j>=0&&cls[j]&&lab[j]===-1){lab[j]=-2;q.push(j);}}
  if(q.length>=minCells)groups.push(q);else small.push(...q);}
 if(small.length)groups.push(small);
 return groups;
}
function fitMean(cells,rgb,dirFor,grid){
 let r=0,g=0,b=0;for(const i of cells){r+=rgb[i*3];g+=rgb[i*3+1];b+=rgb[i*3+2];}const m=cells.length;r/=m;g/=m;b/=m;
 const target=[r,g,b].map(v=>-Math.log(Math.max(1,v)/255));let best=Infinity,shares=null,charge=0;
 for(const sh of grid){const dir=dirFor(sh),sc=target.reduce((v,d,q)=>v+d*dir[q],0)/dir.reduce((v,d)=>v+d*d,0),e=target.reduce((v,d,q)=>v+(d-dir[q]*sc)**2,0);if(e<best){best=e;shares=sh;charge=sc;}}
 return {shares,charge,mean:[r,g,b]};
}
// warm (default off): orange plaster may add burnt sienna (0 to .3) and lets ochre fall
// to .3, still one box mix per shape from the shape's mean colour.
// split d: stone cells with red minus blue of d or more (saturated plaster) and the rest (pale trim, lit stone) form
// separate shapes, so orange plaster is not averaged with cream trim into one grey mix.
export function shapeStoneDemand(demand,k,rgb,pigments,{foliage=false,w=0,h=0,minCells=64,ochreMin=.45,warm=false,split=0}={}){
 const out=demand.slice(),n=rgb.length/3,ochre=pigments.findIndex(p=>p.name==='yellow ochre'),raw=pigments.findIndex(p=>p.name==='raw sienna'),blue=pigments.findIndex(p=>p.name==='French ultramarine'),hansa=pigments.findIndex(p=>p.name==='hansa yellow'),sienna=warm?pigments.findIndex(p=>p.name==='burnt sienna'):-1;
 if(ochre<0||raw<0)throw Error('W13 stone requires yellow ochre and raw sienna');
 if(!(w>0&&h>0&&w*h===n))throw Error('shapeStoneDemand needs the sheet size');
 const physical=pigments.every(p=>p.K&&p.S);
 const stone=new Uint8Array(n),leaf=new Uint8Array(n);
 for(let i=0;i<n;i++){const r=rgb[i*3],g=rgb[i*3+1],b=rgb[i*3+2];if(r-b<18||g-b<8||g<90)continue;if(hueOf(r,g,b)>=48){if(foliage)leaf[i]=1;}else stone[i]=1;}
 const K=q=>j=>(j<0?0:pigments[j].K[q]);
  // ochreMin: the stone family's mix stays ochre-led (a palette choice, one mix per shape); warm lowers the floor to .3
 const stoneGrid=[];for(const ss of sienna<0?[0]:[0,.1,.2,.3])for(const rs of [0,.05,.1,.15,.2])for(const bs of blue<0?[0]:[0,.05,.1,.15,.2])for(const hs of hansa<0?[0]:[0,.1,.2,.3,.4]){const os=1-rs-bs-hs-ss;if(os>=(sienna<0?ochreMin:Math.min(ochreMin,.3))-1e-9)stoneGrid.push([os,rs,bs,hs,ss]);}
 const leafGrid=[];for(const bs of [.05,.1,.15,.2,.3])for(const os of [0,.1,.2,.3]){const hs=1-bs-os;if(hs>=.4)leafGrid.push([hs,bs,os]);}
 const stoneDir=sh=>[0,1,2].map(q=>2*(sh[0]*K(q)(ochre)+sh[1]*K(q)(raw)+sh[2]*K(q)(blue)+sh[3]*K(q)(hansa)+(sh[4]?sh[4]*K(q)(sienna):0)));
 const leafDir=sh=>[0,1,2].map(q=>2*(sh[0]*K(q)(hansa)+sh[1]*K(q)(blue)+sh[2]*K(q)(ochre)));
 const apply=(cells,fit,idx)=>{let mean=0;const mass=cells.map(i=>{let m=0;for(let q=0;q<k;q++)m+=demand[i*k+q];mean+=m;return m;});mean/=Math.max(1,cells.length);
  cells.forEach((i,c)=>{const f=mean>1e-9?mass[c]/mean:1;for(let q=0;q<k;q++)out[i*k+q]=0;idx.forEach((j,s)=>{if(j>=0)out[i*k+j]+=fit.charge*fit.shares[s]*f;});});};
 const audit={policy:'one box mix per shape from the shape mean colour; per-cell mass kept from the unmixed plan',stoneShapes:0,stoneCells:0,leafShapes:0,leafCells:0,minCells,shapes:[]};
 if(!physical){
  // no optics to fit against: the stone family's fixed ochre-led mix, still one per shape, mass kept per cell
  for(const cells of runsOf(stone,w,h,minCells)){let m=0;for(const i of cells)for(let q=0;q<k;q++)m+=demand[i*k+q];apply(cells,{shares:[.9,.1,0,0],charge:m/cells.length},[ochre,raw,blue,hansa]);audit.stoneShapes++;audit.stoneCells+=cells.length;}
 }
 if(physical){
  const stoneRuns=split>0?[...runsOf(stone.map((v,i)=>v&&rgb[i*3]-rgb[i*3+2]>=split?1:0),w,h,minCells),...runsOf(stone.map((v,i)=>v&&rgb[i*3]-rgb[i*3+2]<split?1:0),w,h,minCells)]:runsOf(stone,w,h,minCells);
  for(const cells of stoneRuns){const fit=fitMean(cells,rgb,stoneDir,stoneGrid);if(!fit.shares)continue;apply(cells,fit,[ochre,raw,blue,hansa,sienna]);audit.stoneShapes++;audit.stoneCells+=cells.length;if(audit.shapes.length<60)audit.shapes.push({kind:'stone',cells:cells.length,mean:fit.mean.map(v=>+v.toFixed(1)),shares:fit.shares});}
  if(foliage&&hansa>=0&&blue>=0)for(const cells of runsOf(leaf,w,h,minCells)){const fit=fitMean(cells,rgb,leafDir,leafGrid);if(!fit.shares)continue;apply(cells,fit,[hansa,blue,ochre]);audit.leafShapes++;audit.leafCells+=cells.length;if(audit.shapes.length<60)audit.shapes.push({kind:'leaf',cells:cells.length,mean:fit.mean.map(v=>+v.toFixed(1)),shares:fit.shares});}
 }
 return {demand:out,audit};
}
