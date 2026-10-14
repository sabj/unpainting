import {spline} from '../../src/crop/form.mjs';
import {check} from '../../src/media/checks.mjs';
// Authored polylines or existing production splines only: no invented controls, shaping, pressure overshoot or values.
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const fail=m=>{throw Error(`authored gestures: ${m}`);};
const text=(v,n)=>{if(typeof v!=='string'||!v.trim())fail(`${n} required`);};
export function lowerAuthoredGestures(intent,{target,crop,width,height,sheetWidthMm}){
 const gs=intent.pass.authoredGestures;if(gs===undefined)return null;
 if(!Array.isArray(gs)||!gs.length)fail('nonempty authoredGestures required');
 if(!target||![target.width,target.height].every(x=>Number.isInteger(x)&&x>0)||!target.sha256)fail('immutable target frame/hash required');
 if(!Array.isArray(crop)||crop.length!==4||!crop.every(finite)||crop[0]<0||crop[1]<0||crop[2]<=0||crop[3]<=0||crop[0]+crop[2]>target.width||crop[1]+crop[3]>target.height)fail('crop invalid');
 if(![width,height].every(x=>Number.isInteger(x)&&x>0)||!finite(sheetWidthMm)||sheetWidthMm<=0)fail('grid/physical scale invalid');
 if(Math.abs(height-width*crop[3]/crop[2])>.500001)fail('nonuniform execution registration beyond integer raster rounding');
 text(intent.area.id,'area ID');text(intent.key,'pass ID');
 const b=intent.pass.brush;
 if(!['row','tuft'].includes(b?.model))fail('explicit authored brush.model row|tuft required');
 if(b.lag!==undefined&&(!finite(b.lag)||b.lag<0||b.lag>1))fail('authored brush lag invalid');
 if(intent.pass.preparation?.brush&&!['row','tuft'].includes(intent.pass.preparation.brush.model))fail('explicit authored preparation brush.model row|tuft required');
 if(!b||!['round','flat'].includes(b.kind)||!finite(b.widthMm)||b.widthMm<=0||!['point','side','belly'].includes(b.contact)||(b.contact==='point'&&b.kind!=='round')||(b.contact==='side'&&b.kind!=='flat'))fail('unsupported brush contact');
 const mmPerCell=sheetWidthMm/target.width*crop[2]/width,ids=new Set();
 return gs.map(g=>{
  text(g.id,'gesture ID');if(ids.has(g.id))fail('duplicate gesture ID');ids.add(g.id);
  if(g.coordinateSpace!=='normalized-target'||!['polyline','production-catmull-rom'].includes(g.interpolation))fail('explicit supported normalized-target interpolation required');
  for(const n of ['referenceCue','start','turn','lift'])text(g[n],n);
  if(!Array.isArray(g.points)||g.points.length<2)fail('at least two authored points required');
  const edgeOverscanMm=g.edgeOverscanMm??0;
  if(!finite(edgeOverscanMm)||edgeOverscanMm<0||edgeOverscanMm>2*b.widthMm)fail('bounded physical edge overscan invalid');
  const overscan=edgeOverscanMm/mmPerCell;
  const path=g.points.map(q=>{
   if(!Array.isArray(q.point)||q.point.length!==2||!q.point.every(finite))fail('normalized point invalid');
   if(!finite(q.pressure)||q.pressure<=0||q.pressure>1)fail('explicit pressure invalid: zero-pressure pen-up unsupported by production round contact');
   const radiusMm=q.radiusMm??b.widthMm/2;if(!finite(radiusMm)||radiusMm<=0)fail('physical radius invalid');
   const x=(q.point[0]*target.width-crop[0])*width/crop[2],y=(q.point[1]*target.height-crop[1])*height/crop[3];
   if(x< -overscan||y< -overscan||x>=width+overscan||y>=height+overscan)fail(`requested centerline outside execution crop ${g.id}`);
   return {x,y,r:radiusMm/mmPerCell,p:q.pressure,gestureId:g.id,areaId:intent.area.id,passId:intent.key,contact:b.contact,brushModel:b.model,authored:true};
  });
  if(!path.some((q,i)=>i&&Math.hypot(q.x-path[i-1].x,q.y-path[i-1].y)>0)||!path.some(q=>q.p>0))fail('empty contact geometry');
  let lowered=path;
  if(g.interpolation==='production-catmull-rom'){
   if(!finite(g.sampleSpacingMm)||g.sampleSpacingMm<=0)fail('explicit physical curve sampling required');
   const spacing=g.sampleSpacingMm/mmPerCell,positions=spline(path,spacing,false),poses=[];
   for(let i=0;i<path.length-1;i++){
    const b=path[i],c=path[i+1],n=Math.max(2,Math.ceil(Math.hypot(c.x-b.x,c.y-b.y)/spacing));
    for(let j=0;j<n;j++){const t=j/n;poses.push({...b,p:b.p+(c.p-b.p)*t,r:b.r+(c.r-b.r)*t,controlSegment:i,controlFraction:t});}
   }
   poses.push({...path.at(-1),controlSegment:path.length-2,controlFraction:1});
   lowered=positions.map((q,i)=>({...poses[i],x:q.x,y:q.y}));
   if(lowered.some(q=>q.x< -overscan||q.y< -overscan||q.x>=width+overscan||q.y>=height+overscan))fail('interpolated curve outside execution crop');
  }
  for(const q of lowered)Object.assign(q,{start:g.start,turn:g.turn,lift:g.lift,referenceCue:g.referenceCue,interpolation:g.interpolation,edgeOverscanMm});
  return lowered;
 });
}
// Uses the real production contact, not an enclosing disk. Film may protect it; paper and negative
// paint must avoid primary and eligible lift cells. Cells that do not are returned as reservedCells for the caller to
// clip out of the stroke (tools/painter/reserve-clip.mjs) and counted; --strict 1 stops.
export function admitAuthoredContact(contact,material,{reserved,film=()=>false}){
 const primary=contact.cells.filter(i=>contact.primaryMask[i]);
 const eligible=material.cells.filter(i=>contact.liftMask[i]&&!contact.primaryMask[i]&&!contact.neighborIndices.includes(i));
 const reservedCells=[...primary,...eligible].filter(i=>reserved(i)&&!film(i));
 check('paper/negative contact cell',!reservedCells.length,{cells:reservedCells.length,first:reservedCells[0]});
 return {reservedCells,primaryCells:primary.length,eligibleLiftCells:eligible.length,declaredHaloCells:contact.neighborIndices.length,conservativeCells:material.conservativeCells.length};
}
