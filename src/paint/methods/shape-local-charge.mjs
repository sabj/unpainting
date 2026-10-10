// Shares each cell's still-owed residual among the shapes already booked there, in proportion to their planned
// amounts. Delivered paint is never credited.
export function allocateShapeLocalCharge({layers,K,n,residual,selected,lights,planned,fixtureCells=[],excludeMixedFirstWash=false,ownComponents=false}){
 if(!Number.isInteger(K)||K<1||!Number.isInteger(n)||n<1||residual.length!==n*K||planned.length!==n*K||selected.length!==n||lights.length!==n)throw Error('shape-local charge dimensions invalid');
 for(let q=0;q<n*K;q++)if(!Number.isFinite(residual[q])||residual[q]<0||!Number.isFinite(planned[q])||planned[q]<0)throw Error('shape-local charge invalid demand');
 const ids=[];for(let i=0;i<n;i++)if(selected[i]&&!lights[i])ids.push(i);
 const contributions=[],denom=new Map(),excluded=new Map();let excludedShapes=0;
 for(const layer of layers)for(const sh of layer.shapes){
  const hit=ids.filter(i=>sh.ids?sh.ids[i]===sh.id:Boolean(sh.mask[i]));if(!hit.length)continue;
  if(sh.mix.length!==K||sh.mix.some(v=>!Number.isFinite(v)||v<0)||!Number.isFinite(sh.amount)||!(sh.amount>0))throw Error('shape-local charge shape invalid');
  const channels=sh.mix.map((v,j)=>v>0?j:-1).filter(j=>j>=0),mixedFloor=channels.length>1&&excludeMixedFirstWash&&sh.firstWash===true;
  if(channels.length!==1&&!mixedFloor&&!ownComponents)throw Error('shape-local charge mixed recipe unsupported');
  if(mixedFloor)excludedShapes++;
  for(const i of hit)for(const j of channels){const a=sh.graded?sh.graded[i]*sh.mix[j]/sh.amount:sh.mix[j];if(!Number.isFinite(a)||a<0)throw Error('shape-local charge contribution invalid');if(!(a>0))continue;const q=i*K+j;
   if(mixedFloor){excluded.set(q,(excluded.get(q)??0)+a);continue;}denom.set(q,(denom.get(q)??0)+a);contributions.push({sh,i,j,q,a});}
 }
 for(const q of new Set([...denom.keys(),...excluded.keys()]))if(Math.abs((denom.get(q)??0)+(excluded.get(q)??0)-planned[q])>2e-5*Math.max(1,planned[q]))throw Error('shape-local charge booked denominator mismatch '+q);
 const fields=new Map(),allocated=new Array(K).fill(0),debt=new Array(K).fill(0),source=new Array(K).fill(0);
 for(const i of ids)for(let j=0;j<K;j++){const q=i*K+j;source[j]+=residual[q];if(!(denom.get(q)>0))debt[j]+=residual[q];}
 for(const {sh,i,j,q,a}of contributions){const extra=residual[q]*a/denom.get(q);if(!(extra>0))continue;let field=fields.get(sh);if(!field)fields.set(sh,field=new Map());
  if(ownComponents){let v=field.get(i);if(!v)field.set(i,v=new Float64Array(K));v[j]+=extra;}else field.set(i,extra*sh.amount/sh.mix[j]);allocated[j]+=extra;}
 for(let j=0;j<K;j++)if(Math.abs(source[j]-allocated[j]-debt[j])>2e-5*Math.max(1,source[j]))throw Error('shape-local charge residual conservation mismatch');
 for(const[sh,field]of fields)sh[ownComponents?'_paintOwnedComponentCharge':'_paintOwnedCharge']=field;
 const fixtures=fixtureCells.map(i=>({cell:i,components:Array.from({length:K},(_,j)=>({pigment:j,sourceResidual:residual[i*K+j],bookedDenominator:denom.get(i*K+j)??0,fundedMixedFloor:excluded.get(i*K+j)??0,originalPlanned:planned[i*K+j],allocated:contributions.filter(c=>c.i===i&&c.j===j).reduce((v,c)=>v+residual[c.q]*c.a/denom.get(c.q),0)}))}));
 return {excludedMixedFirstWashShapes:excludedShapes,allocationMode:ownComponents?'existing mixed later paths; own-component residual; funded mixed floor excluded':excludeMixedFirstWash?'original later pure-pan paths; funded mixed floor excluded':'original single-pan paths',fixtures,sourceMassByPigment:source,allocatedMassByPigment:allocated,debtMassByPigment:debt,shapeFields:fields.size,supportCells:ids.length,kind:'original booked shape-local charge allocation; no delivered pigment credit'};
}
// Prepared component load factors over the measured supported primary footprint.
export function ownedComponentLoad({cells,field,mix,baseFactor=1}){
 if(!Number.isFinite(baseFactor)||baseFactor<0||mix.some(v=>!Number.isFinite(v)||v<0))throw Error('invalid component load basis');
 const unique=[...new Set(cells)],support=unique.filter(i=>field.has(i)),mass=mix.map((_,j)=>support.reduce((v,i)=>{const a=field.get(i)[j]??0;if(!Number.isFinite(a)||a<0)throw Error('invalid allocated component');return v+a;},0));
 const factors=mass.map((v,j)=>{if(!(mix[j]>0)&&v>0)throw Error('allocated component has no existing recipe support');return baseFactor+(mix[j]>0?v/Math.max(1,unique.length)/mix[j]:0);});
 if(factors.some(v=>!Number.isFinite(v)||v<0))throw Error('invalid component load factor');
 return {componentFactors:factors,factor:Math.max(...factors),supportCells:support.length,allocatedComponentsOnPrimary:mass};
}
