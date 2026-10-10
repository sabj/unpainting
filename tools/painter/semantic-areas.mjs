import {validateAuthoredPaint,compileAuthoredPaint} from './authored-paint.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {passage} from '../../src/crop/blockin.mjs';

export const AUTHORING_CONTRACT = Object.freeze({version:1,coordinateSpace:'normalized-target',input:'Immutable approved target image/hash/frame, optional registered guides and named anchors. Read visible subjects, occlusion, value/edge/material cues. Do not invent obscured features or claim SAM unless provenance records its invocation.',scope:'Optional scope:{kind:single-subject-study,subject,reason} permits3–100 areas only for an explicitly bounded instructional subject. Complete subjects retain10–100.',areas:'10–100 meaningful semantic areas, hierarchy and deliberate priority/occlusionReason, not a texture grid. Each area records intent/referenceCue/drawingRole; each pass records explicit valueRange, move, edges, lights, physical brush/load/wetness, dependencies/order and stop. Unsupported operations fail; no generic fallback earns semantic coverage.',target:'target:{path,sha256,width,height}; cropped execution view:{crop:[left,top,width,height],imageSHA256}; stable area/pass IDs across views.',geometry:'polygon normalized to immutable target, anchors:[{name,point:[x,y]}], optional priority integer and occlusionReason. Planning ownership is not a physical clip.',brush:'{kind:round|flat,model?:row|tuft,lag?:0..1,widthMm,contact:point|side|belly,orientation:follow|sweep|vertical,pressure:[start,peak,end]}; point is a narrow round footprint, side a flat footprint; brush tilt is not separately modeled. Explicit tuft uses native CPU contact with normal GPU sheet physics; row is legacy default.',
authoredGestureEdges:'Optional gesture.edgeOverscanMm: finite0..2*pass.brush.widthMm, physical millimeters. Explicit allowance permits registered authored centerline entry/exit that far outside execution paper; core still bounds actual sheet contact, paper/film and measured substrate/TIP admission remain unchanged. Default0 rejects offpaper centers. This is physical overscan, not target warp, polygon clip or exported image correction.',
load:'{water:0..1,pigmentScale>0,waterQuantityMm3>0,capacityMm3>=waterQuantityMm3,minRemainingFraction:0..1,reload:before-stroke,rinse:fresh-brush-per-gesture,blot:none|water-fraction,concentrationSource:solver-calibrated,prewetWater?:0..1}. Uses existing metered convention:1waterdepthunit=1mm; quantity and maximum volume separated from concentration, haircapacity derived by production model.',
lights:'{mode:none|paint-owned|paper|negativepaint|film,reason,polygon?}. Film requires actions:{apply:dry-paper-physical-film,set:full-strength-established,remove:dry-paint-physical-lift,afterPasses:[area/pass],revealedEdges:inspect}. Lift/softening unavailable and rejected; paper/negative must avoid actual brush contact.',
preparation:'optional per-pass preparation:{brush,load,flowSteps:integer0..600,maxAttempts:integer1..3,depositDepthMm?:positive}; existing metered physical contact dose independent of finite reservoir/concentration; explicit clean brush/load distinct from painting; measured ordinary physics transitions, no forced dry. Candidate still needs physical calibration.',
cli:'--areaplan file; --areaplanonly1 exits before sheet/GPU and writes CPU coverage; --areastop area/pass,areaID,stage:passStage stops after actual compiled pass group. No legacy named passage adapters alongside semantic ownership.',
supported:'moves wet on wet, wet on dry, dry brush; round/flat brush; lights none/paint-owned/paper/negativepaint/film. Lift and extra material stages unsupported and rejected. Drawing roles none/scaffold/structural/focal; current drawing admission uses these roles, preserves source paths.'});
const fail=m=>{throw Error(`semantic areas: ${m}`);};
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const text=(x,n)=>{if(typeof x!=='string'||!x.trim())fail(`${n} required`);};
const point=p=>Array.isArray(p)&&p.length===2&&p.every(v=>finite(v)&&v>=0&&v<=1);
const inside=(p,poly)=>{let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
const polygon=(p,n)=>{
 if(!Array.isArray(p)||p.length<3||!p.every(point))fail(`${n} polygon invalid`);
 if(new Set(p.map(q=>q.join(','))).size!==p.length)fail(`${n} repeated vertex`);
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const on=(a,b,c)=>Math.abs(cross(a,b,c))<1e-12&&c[0]>=Math.min(a[0],b[0])-1e-12&&c[0]<=Math.max(a[0],b[0])+1e-12&&c[1]>=Math.min(a[1],b[1])-1e-12&&c[1]<=Math.max(a[1],b[1])+1e-12;
 for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){
  if(j===i+1||(i===0&&j===p.length-1))continue;
  const a=p[i],b=p[(i+1)%p.length],c=p[j],d=p[(j+1)%p.length];
  if((cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))fail(`${n} self-intersection`);
 }
};
export function validateAreaDocument(doc,{targetSHA,imageSHA,sourceWidth,sourceHeight,minAreas=10,maxAreas=100}={}){
 if(doc.version!==1||doc.coordinateSpace!=='normalized-target')fail('version/coordinateSpace invalid');
 if(!doc.target||doc.target.sha256!==targetSHA||!Number.isInteger(doc.target.width)||!Number.isInteger(doc.target.height))fail('immutable target binding mismatch');
 const crop=doc.view?.crop??[0,0,doc.target.width,doc.target.height];
 if(crop.length!==4||!crop.every(finite)||crop[0]<0||crop[1]<0||crop[2]<=0||crop[3]<=0||crop[0]+crop[2]>doc.target.width||crop[1]+crop[3]>doc.target.height)fail('crop transform invalid');
 if(doc.view&&(doc.view.imageSHA256!==imageSHA||sourceWidth!==crop[2]||sourceHeight!==crop[3]))fail('cropped input binding mismatch');
 if(!doc.view&&(imageSHA!==targetSHA||sourceWidth!==doc.target.width||sourceHeight!==doc.target.height))fail('full input binding mismatch');
 if(doc.scope!==undefined){
  if(doc.scope.kind!=='single-subject-study')fail('unsupported scope; omit scope for complete subjects');
  text(doc.scope.subject,'scope.subject');text(doc.scope.reason,'scope.reason');
  // Explicit small instructional subject, never an implicit fallback for complete paintings.
  minAreas=Math.min(minAreas,3);
 }
 if(!Array.isArray(doc.areas)||doc.areas.length<minAreas||doc.areas.length>maxAreas)fail(`requires ${minAreas}–${maxAreas} areas`);
 const authored=validateAuthoredPaint(doc);const areas=new Map(),passes=new Map();
 for(const a of doc.areas){text(a.id,'area.id');if(areas.has(a.id))fail(`duplicate area ${a.id}`);areas.set(a.id,a);text(a.intent,`${a.id}.intent`);text(a.referenceCue,`${a.id}.referenceCue`);polygon(a.geometry?.polygon,a.id);if(!Array.isArray(a.geometry.anchors)||a.geometry.anchors.some(x=>!x.name||!point(x.point)))fail(`anchors ${a.id}`);if(a.geometry.priority!==undefined&&(!Number.isInteger(a.geometry.priority)||!a.geometry.occlusionReason))fail(`explicit occlusion reason ${a.id}`);if(!['none','scaffold','structural','focal'].includes(a.drawingRole))fail(`drawing role ${a.id}`);
 if(!Array.isArray(a.passes)||!a.passes.length)fail(`passes ${a.id}`);
 for(const p of a.passes){text(p.id,'pass.id');if(p.leaveWetAfter!==undefined&&(typeof p.leaveWetAfter!=='boolean'||p.source!=='authored'))fail('explicit authored leaveWetAfter boolean required');const key=`${a.id}/${p.id}`;if(passes.has(key))fail(`duplicate pass ${key}`);passes.set(key,{area:a,pass:p,key});if(!finite(p.order)||!Array.isArray(p.dependsOn)||!p.dependsOn.every(x=>typeof x==='string'))fail(`order/dependencies ${key}`);if(p.source!=='authored'&&(!Array.isArray(p.valueRange)||p.valueRange.length!==2||!p.valueRange.every(Number.isInteger)||p.valueRange[0]<1||p.valueRange[1]<p.valueRange[0]))fail(`valueRange ${key}`);if(!['wet on wet','wet on dry','dry brush','wet-edge continuation'].includes(p.move))fail(`unsupported move ${key}: ${p.move}`);if(!['soft','hard','broken','lost'].includes(p.edges?.kind)||typeof p.edges?.overlap!=='boolean')fail(`edges ${key}`);if(!['none','paint-owned','paper','negativepaint','film'].includes(p.lights?.mode))fail(`unsupported lights ${key}`);text(p.lights.reason,`${key}.lights.reason`);if(!['none','paint-owned'].includes(p.lights.mode))polygon(p.lights.polygon,`${key}.lights`);if(p.lights.mode==='film'&&(p.lights.actions?.apply!=='dry-paper-physical-film'||p.lights.actions?.set!=='full-strength-established'||p.lights.actions?.remove!=='dry-paint-physical-lift'||!Array.isArray(p.lights.actions.afterPasses)||p.lights.actions.revealedEdges!=='inspect'))fail(`unsupported/incomplete film lifecycle ${key}`);if(p.brush?.model!==undefined&&!['row','tuft'].includes(p.brush.model))fail('unsupported brush model '+key);if(p.brush?.lag!==undefined&&(!finite(p.brush.lag)||p.brush.lag<0||p.brush.lag>1))fail('unsupported brush lag '+key);if(!['round','flat'].includes(p.brush?.kind)||!finite(p.brush.widthMm)||p.brush.widthMm<=0)fail(`brush ${key}`);if(!['point','side','belly'].includes(p.brush.contact)||!['follow','sweep','vertical'].includes(p.brush.orientation)||!Array.isArray(p.brush.pressure)||p.brush.pressure.length!==3||!p.brush.pressure.every(x=>finite(x)&&x>=0&&x<=1)||(p.brush.contact==='side'&&p.brush.kind!=='flat')||(p.brush.contact==='point'&&p.brush.kind!=='round'))fail(`unsupported brush contact/pose ${key}`);if(!finite(p.load?.water)||p.load.water<0||p.load.water>1||!finite(p.load.pigmentScale)||p.load.pigmentScale<=0)fail(`load ${key}`);if(!finite(p.load.waterQuantityMm3)||p.load.waterQuantityMm3<=0||!finite(p.load.capacityMm3)||p.load.capacityMm3<p.load.waterQuantityMm3||!finite(p.load.minRemainingFraction)||p.load.minRemainingFraction<0||p.load.minRemainingFraction>=1||p.load.reload!=='before-stroke'||p.load.rinse!=='fresh-brush-per-gesture'||!['none','water-fraction'].includes(p.load.blot)||p.load.concentrationSource!=='solver-calibrated')fail(`unsupported load management ${key}`);if(!['dry','moist','wet','dry-or-wet-edge'].includes(p.wetness?.required)||!Number.isInteger(p.wetness.neighborCells)||p.wetness.neighborCells<0)fail(`wetness ${key}`);if(p.stop?.after!=='pass'||!p.stop.reason)fail(`stop ${key}`);if(p.move==='wet-edge continuation'&&(p.source!=='authored'||p.wetness.required!=='dry-or-wet-edge'||!finite(p.wetness.maxSurfaceWater)||p.wetness.maxSurfaceWater<=0)||p.move!=='wet-edge continuation'&&(p.move==='wet on wet'&&p.wetness.required==='dry'||p.move!=='wet on wet'&&p.wetness.required!=='dry'))fail(`move/state mismatch ${key}`);}}
 const depth=id=>{const seen=new Set();let a=areas.get(id),d=0;while(a.parent!==null){if(seen.has(a.id)||!areas.has(a.parent))fail(`parent cycle/missing ${id}`);seen.add(a.id);a=areas.get(a.parent);d++;}return d;};for(const a of areas.values())a._depth=depth(a.id);const inBounds=(p,poly)=>inside(p,poly)||poly.some((a,i)=>{const b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<1e-8;});for(const a of areas.values())if(a.parent!==null&&a.geometry.polygon.some(p=>!inBounds(p,areas.get(a.parent).geometry.polygon)))fail(`child ${a.id} outside parent geometry`);for(const s of passes.values())if(s.pass.lights.mode==='film')for(const id of s.pass.lights.actions.afterPasses)if(!passes.has(id))fail(`unknown film removal dependency ${id}`);
 for(const x of passes.values())semanticPreparation(x.pass);
 const schedule=[...passes.values()].sort((a,b)=>a.pass.order-b.pass.order||a.key.localeCompare(b.key));const done=new Set();for(const s of schedule){for(const dep of s.pass.dependsOn)if(!done.has(dep))fail(`dependency missing/out of order ${s.key}: ${dep}`);done.add(s.key);}
 for(const a of areas.values())for(let i=0;i<a.passes.length;i++)for(let j=i+1;j<a.passes.length;j++)if(!authored&&Math.max(a.passes[i].valueRange[0],a.passes[j].valueRange[0])<=Math.min(a.passes[i].valueRange[1],a.passes[j].valueRange[1]))fail(`overlapping valueRange ${a.id}`);
 for(const x of doc.allowedUnassigned??[]){polygon(x.polygon,'allowedUnassigned');text(x.reason,'allowedUnassigned.reason');}
 return {doc,areas,passes,schedule,crop};
}
export function rasterAreaPlan(plan,w,h){
 const n=w*h,at=i=>[(plan.crop[0]+(i%w+.5)*plan.crop[2]/w)/plan.doc.target.width,(plan.crop[1]+(Math.floor(i/w)+.5)*plan.crop[3]/h)/plan.doc.target.height],owner=new Int16Array(n).fill(-1),masks=plan.doc.areas.map(a=>Uint8Array.from({length:n},(_,i)=>inside(at(i),a.geometry.polygon)?1:0)),index=new Map(plan.doc.areas.map((a,i)=>[a.id,i]));let overlap=0;
 for(let i=0;i<n;i++){const candidates=[];for(let j=0;j<masks.length;j++)if(masks[j][i]){const a=plan.doc.areas[j];if(a.parent!==null&&!masks[index.get(a.parent)][i])fail(`child ${a.id} outside parent at cell ${i}`);candidates.push(j);}const chain=j=>{let a=plan.doc.areas[j],out=[a];while(a.parent!==null){a=plan.areas.get(a.parent);out.unshift(a);}return out;};const compare=(j,k)=>{const a=chain(j),b=chain(k);for(let q=0;q<Math.min(a.length,b.length);q++)if(a[q].id!==b[q].id){const d=(b[q].geometry.priority??0)-(a[q].geometry.priority??0);if(!d)fail(`ambiguous sibling overlap ${a[q].id}/${b[q].id} cell ${i}`);return d;}return b.length-a.length;};candidates.sort(compare);if(candidates.length){if(candidates.length>1)overlap++;owner[i]=candidates[0];}}
 const reserves=new Uint8Array(n),film=new Uint8Array(n);for(const a of plan.areas.values())for(const p of a.passes)if(!['none','paint-owned'].includes(p.lights.mode))for(let i=0;i<n;i++)if(inside(at(i),p.lights.polygon)){if(!masks[index.get(a.id)][i])fail(`lights outside ${a.id}`);(p.lights.mode==='film'?film:reserves)[i]=1;}
 const allowed=Uint8Array.from({length:n},(_,i)=>(plan.doc.allowedUnassigned??[]).some(x=>inside(at(i),x.polygon))?1:0);
 return {...plan,w,h,owner,masks,reserves,film,allowed,diagnostics:{areaCount:masks.length,geometryCoveredCells:owner.reduce((s,v)=>s+(v>=0),0),unassignedCells:owner.reduce((s,v)=>s+(v<0),0),explicitOcclusionCells:overlap,areaCells:plan.doc.areas.map((a,j)=>({id:a.id,parent:a.parent,owned:owner.reduce((s,v)=>s+(v===j),0),geometry:masks[j].reduce((s,v)=>s+v,0)}))}};
}
export function compileAreaLayers(plan,layers,palette){
 const direct=compileAuthoredPaint(plan,palette??[]);if(direct)return direct;
 const scheduled=new Map(plan.schedule.map(s=>[s.key,[]])),diagnostics={...plan.diagnostics,stage:'compiled numerical regions, NOT execution proof',unassignedPaintCells:0,unassignedValueCells:0,allowedUnassignedValueCells:0,allowedUnassignedDemandMass:0,allowedUnassignedCellIndices:[],reservedDemandCells:0,compiledShapes:0,passes:plan.schedule.map(s=>({id:s.key,compiledShapes:0,executedCommands:0}))};let allocated=0,input=0;
 for(const layer of layers)for(const sh of layer.shapes){const mask=sh.mask,groups=new Map();for(let i=0;i<mask.length;i++)if(mask[i]){input++;if(plan.reserves[i]||plan.film[i]){diagnostics.reservedDemandCells++;continue;}const j=plan.owner[i];if(j<0){if(!plan.allowed[i])diagnostics.unassignedPaintCells++;else{diagnostics.allowedUnassignedValueCells++;diagnostics.allowedUnassignedDemandMass+=sh.amount??0;diagnostics.allowedUnassignedCellIndices.push(i);}continue;}const a=plan.doc.areas[j],p=a.passes.find(p=>layer.value>=p.valueRange[0]&&layer.value<=p.valueRange[1]);if(!p){diagnostics.unassignedValueCells++;continue;}const key=`${a.id}/${p.id}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);allocated++;}
 for(const [key,cells] of groups){const ids=new Uint8Array(mask.length),box={x0:plan.w,y0:plan.h,x1:-1,y1:-1};for(const i of cells){ids[i]=1;const x=i%plan.w,y=Math.floor(i/plan.w);box.x0=Math.min(box.x0,x);box.x1=Math.max(box.x1,x);box.y0=Math.min(box.y0,y);box.y1=Math.max(box.y1,y);}const clone=passage(ids,1,box,sh.amount,cells.length,plan.w);for(const k of Object.keys(sh))if(!['mask','ids','id','box','_mask','area','w','_brushMask','_mbox','_cover','_under','_fb','_booked'].includes(k))clone[k]=sh[k];clone._semantic=plan.passes.get(key);scheduled.get(key).push({...layer,shapes:[clone],_semantic:clone._semantic});diagnostics.compiledShapes++;diagnostics.passes.find(p=>p.id===key).compiledShapes++;}}
 diagnostics.allowedUnassignedCellIndices=Array.from(new Set(diagnostics.allowedUnassignedCellIndices)).sort((a,b)=>a-b);diagnostics.inputValueCells=input;diagnostics.allocatedValueCells=allocated;diagnostics.planComplete=diagnostics.unassignedPaintCells===0&&diagnostics.unassignedValueCells===0;
 if(!diagnostics.planComplete){const e=Error(`semantic areas: unassigned paint/value cells ${diagnostics.unassignedPaintCells}/${diagnostics.unassignedValueCells}`);e.diagnostics=diagnostics;throw e;}
 return {layers:plan.schedule.flatMap(s=>scheduled.get(s.key)),diagnostics};
}
export function semanticTechnique(s,T){return {...T,passes:s.pass.source==='authored'||s.pass.move==='wet on dry'?1:T.passes,name:s.pass.move,water:s.pass.load.water,intoWet:['wet on wet','wet-edge continuation'].includes(s.pass.move),dryAfter:s.pass.leaveWetAfter===true?false:!['wet on wet','wet-edge continuation'].includes(s.pass.move),wetMix:['wet on wet','wet-edge continuation'].includes(s.pass.move)?.85:s.pass.move==='dry brush'?.1:.55,bridge:['wet on wet','wet-edge continuation'].includes(s.pass.move)?.98:.78,bridgeSoft:s.pass.move==='wet on wet'?3:2.2};}
export function createAreaExecution({emit=()=>{}}={}){let active=null,serial=0;const records=[];return {set(s){active=s;},get active(){return active;},records,command(operation,metadata,fn){const r={...metadata,kind:'semantic-command',id:`semantic-command-${++serial}`,areaId:active?.area.id??null,passId:active?.key??null,semanticPlanned:metadata?.semanticPlanned??!!active,operation,status:'compiled'};records.push(r);emit({...r});try{const value=fn();r.status='executed';emit({...r});return value;}catch(e){r.status='failed';r.error=e.message;emit({...r});throw e;}},complete(s){const r={kind:'semantic-pass-complete',areaId:s.area.id,passId:s.key,executedCommands:records.filter(r=>r.passId===s.key&&r.status==='executed').length,paintCommands:records.filter(r=>r.passId===s.key&&r.status==='executed'&&r.operation==='physical brush stroke'&&r.pigmentLoaded).length};emit(r);return r;}};}
export function semanticMaterialReady(pass,paper,brush){
 const required=pass?.wetness?.required;
 if(!['dry','moist','wet','dry-or-wet-edge'].includes(required)||!paper||!Number.isInteger(paper.cells)||paper.cells<=0||!brush||!finite(brush.water)||!finite(brush.pigment)||brush.water<0||brush.pigment<=0)return false;
 if(required==='dry-or-wet-edge')return pass.source==='authored'&&pass.move==='wet-edge continuation'&&finite(pass.wetness.maxSurfaceWater)&&pass.wetness.maxSurfaceWater>0&&finite(paper.waterMax)&&paper.waterMax>=0&&paper.waterMax<=pass.wetness.maxSurfaceWater;
 if(required==='dry')return paper.dry===true;
 if(!finite(paper.moistShare)||paper.moistShare<.7||paper.moistShare>1)return false;
 if(required==='wet')return paper.waterMax===undefined||(finite(paper.waterMax)&&paper.waterMax>=0);
 return finite(paper.waterMax)&&paper.waterMax>=0&&paper.waterMax<=.15;
}
export const sha256=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export function semanticDrawingGroups(plan,gestures,stage,scale=1){const groups=[];for(const g of gestures){let run=[],last=-2;const flush=()=>{if(run.length>1){const a=plan.doc.areas[last];groups.push({area:a,key:`${a.id}/drawing-${stage}`,gesture:{...g,points:run}});}run=[];};for(const p of g.points){const x=Math.floor(p.x/scale),y=Math.floor(p.y/scale),j=x<0||y<0||x>=plan.w||y>=plan.h?-1:plan.owner[y*plan.w+x],a=plan.doc.areas[j];const allowed=a&&(stage==='opening'?['scaffold','structural']:['structural','focal']).includes(a.drawingRole);if(j!==last||!allowed){flush();last=allowed?j:-1;}if(allowed)run.push(p);}flush();}return groups;}

export function semanticBrushOptions(pass,mmPerCell){return {model:pass.brush.model??'row',...(pass.brush.lag!==undefined?{lag:pass.brush.lag}:{}),flat:pass.brush.kind==='flat',radius:pass.brush.widthMm/(2*mmPerCell),loadWater:pass.load.capacityMm3/mmPerCell**2};}
// Authored physical clean sweep, predicted with the same native brush as execution.
// Planning bounds guide the hand pose; they never fill water arrays or clip pigment.
export function semanticPreparationGesture(pass,points,mmPerCell,{predict,requiredCells,width}={}){
 const prep=semanticPreparation(pass),p=prep?semanticGesture({...pass,brush:prep.brush},points,mmPerCell):points.map(v=>({...v}));
 const sweep=prep?.contactSweep;if(!sweep)return p;
 if(sweep.align!=='candidate-bounds'||!finite(sweep.extendMm)||sweep.extendMm<=0||sweep.extendMm>10)fail('unsupported preparation contact sweep');
 if(!predict||!Array.isArray(requiredCells)||!requiredCells.length||!Number.isInteger(width)||width<=0||p.length<2)fail('contact sweep requires actual native prediction and required footprint');
 const a=p[0],b=p[1],z=p.at(-1),y=p.at(-2),d0=Math.hypot(b.x-a.x,b.y-a.y)||1,d1=Math.hypot(z.x-y.x,z.y-y.y)||1,e=sweep.extendMm/mmPerCell;
 const path=[{...a,x:a.x-(b.x-a.x)/d0*e,y:a.y-(b.y-a.y)/d0*e},...p,{...z,x:z.x+(z.x-y.x)/d1*e,y:z.y+(z.y-y.y)/d1*e}];
 const observed=predict(path),cells=observed.cells.filter(i=>observed.primaryMask[i]);
 const center=c=>{if(!c.length)fail('empty preparation contact prediction');let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const i of c){const x=i%width,y=Math.floor(i/width);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}return [(x0+x1)/2,(y0+y1)/2];};
 const goal=center(requiredCells),actual=center(cells),dx=goal[0]-actual[0],dy=goal[1]-actual[1];
 return path.map(v=>({...v,x:v.x+dx,y:v.y+dy}));
}
export function semanticGesture(pass,points,mmPerCell){return points.map((p,i)=>{const t=i/Math.max(1,points.length-1),q=pass.brush.pressure,k=t<.5?0:1,u=t<.5?t*2:(t-.5)*2;return {...p,r:pass.brush.widthMm/(2*mmPerCell),p:q[k]+(q[k+1]-q[k])*u};});}

// An authoritative area plan owns every physical film choice; legacy inference is never consulted.
export function semanticHighlights(plan,legacy){return plan?Uint8Array.from(plan.film):legacy();}

export function semanticPrewetLoad(pass,releaseFree){
 const water=(pass.load.prewetWater??1)*pass.load.waterQuantityMm3/pass.load.capacityMm3;
 if(!finite(releaseFree)||!finite(water)||water<=releaseFree)fail(`prewet add-water intent uses thirsty load ${water} <= actual brush release threshold ${releaseFree}`);
 return water;
}
export function semanticPreparation(pass){
 const p=pass.preparation;if(!p)return null;
 if(!Number.isInteger(p.flowSteps)||p.flowSteps<0||p.flowSteps>600||!Number.isInteger(p.maxAttempts)||p.maxAttempts<1||p.maxAttempts>3)fail('bounded preparation transitions');
 if(p.depositDepthMm!==undefined&&(!finite(p.depositDepthMm)||p.depositDepthMm<=0||p.depositDepthMm>1))fail('unsupported preparation contact dose');
 if(p.contactSweep&&(p.contactSweep.align!=='candidate-bounds'||!finite(p.contactSweep.extendMm)||p.contactSweep.extendMm<=0||p.contactSweep.extendMm>10))fail('unsupported preparation contact sweep');
 const b=p.brush,l=p.load;
 if(!['round','flat'].includes(b?.kind)||!finite(b.widthMm)||b.widthMm<=0||!['point','side','belly'].includes(b.contact)||!['follow','sweep','vertical'].includes(b.orientation)||!Array.isArray(b.pressure)||b.pressure.length!==3||!b.pressure.every(v=>finite(v)&&v>=0&&v<=1)||(b.contact==='side'&&b.kind!=='flat')||(b.contact==='point'&&b.kind!=='round'))fail('unsupported preparation brush');
 if(!finite(l?.water)||l.water<0||l.water>1||l.pigmentScale!==1||!finite(l.waterQuantityMm3)||l.waterQuantityMm3<=0||!finite(l.capacityMm3)||l.capacityMm3<l.waterQuantityMm3||!finite(l.minRemainingFraction)||l.minRemainingFraction<0||l.minRemainingFraction>=1||l.reload!=='before-stroke'||l.rinse!=='fresh-brush-per-gesture'||!['none','water-fraction'].includes(l.blot)||l.concentrationSource!=='solver-calibrated')fail('unsupported preparation load');
 return p;
}
export function prepareSemanticContact(pass,points,{observe,waterStroke,advance,maxAttempts=pass.preparation?.maxAttempts??3,maxFlowSteps=pass.preparation?.flowSteps??0}){
 let paper=observe(),attempts=0,flowSteps=0;
 const ready=()=>semanticMaterialReady(pass,paper,{water:1,pigment:1});
 if(pass.wetness.required==='dry')return {paper,attempts,flowSteps,ready:ready()};
 const reach=pass.wetness.neighborCells;
 const prepared=points.map(p=>({...p,r:p.r+reach/(.25+.75*(p.p??1))}));
 while(!ready()){
  if(pass.wetness.required==='moist'&&paper.waterMax>.15){if(!advance||flowSteps>=maxFlowSteps)break;advance(++flowSteps);paper=observe();continue;}
  if(attempts>=maxAttempts)break;
  waterStroke(prepared,++attempts);paper=observe();
 }
 return {paper,attempts,flowSteps,ready:ready()};
}

export function withSemanticWaterClip(sheet,setClip,fn){const previous=sheet.clip;setClip(sheet,null);try{return fn();}finally{setClip(sheet,previous);}}

// CPU brush.mjs lift: pool.water>0, recipients sheet.M; GPU stroke_run mirrors both.
// Before primary stroke, pickup may replenish hairs; retain wet lift recipients
// when either current free liquid or primary wet pickup can supply the future pool.
export function semanticMaterialContact(sheet,contact,brush){
 const primary=contact.cells.filter(i=>contact.primaryMask[i]);
 const freeLiquid=brush.hairs.some(h=>h.water/(brush.capacity*h.len||1)>brush.free);
 const pickupPossible=brush.hairs.some(h=>h.water/(brush.capacity*h.len||1)<brush.free)&&primary.some(i=>sheet.M[i]&&sheet.W[i]>.05);
 const poolPossible=freeLiquid||pickupPossible;
 const eligibleLift=poolPossible?contact.cells.filter(i=>contact.liftMask[i]&&sheet.M[i]):[];
 const cells=[...new Set([...primary,...eligibleLift,...contact.neighborIndices])];
 return {cells,primaryCells:primary.length,eligibleLiftCells:eligibleLift.length,declaredHaloCells:contact.neighborIndices.length,conservativeCells:[...new Set([...contact.cells,...contact.neighborIndices])],freeLiquid,pickupPossible,poolPossible,liftRole:'wet M recipient and possible free-liquid/pickup pool; final actual bead remains execution evidence'};
}

export function semanticUsesNumericClip(intent){return !intent||intent.pass.source!=='authored'||intent.pass.edges.overlap!==true;}

export function semanticCalibrationGain(record,points,mmPerCell){
 if(!record?.samples?.length)fail('actual semantic instrument calibration missing');
 const length=points.reduce((s,p,i)=>s+(i?Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y)*mmPerCell:0),0),s=record.samples;
 if(length<=s[0].lengthMm)return s[0].gain;
 for(let i=1;i<s.length;i++)if(length<=s[i].lengthMm){const t=(length-s[i-1].lengthMm)/(s[i].lengthMm-s[i-1].lengthMm);return s[i-1].gain+(s[i].gain-s[i-1].gain)*t;}
 return s.at(-1).gain;
}
// Reference contacts use the physical engine; this is instrument measurement, not a renderer.
// Explicit stage selection never manufactures a calibration for an unselected pass.
export function semanticCalibrationStages(doc,requested='first-wash'){
 if(typeof requested!=='string')fail('calibration stages must be an explicit comma-separated list');
 const stages=requested.split(','),known=new Set(doc.areas.flatMap(a=>a.passes.map(p=>p.stage??p.id)));
 if(!stages.length||stages.some(s=>!s||s.trim()!==s||!known.has(s))||new Set(stages).size!==stages.length)fail('calibration stages must be distinct declared plan stages');
 return stages;
}
// An explicit stage list bounds real calibration work even for authored plans.
// Omitting it preserves all authored stages; legacy plans retain first-wash.
export function semanticCalibrationSelection(doc,requested=null){
 const authored=doc.areas.some(a=>a.passes.some(p=>p.source==='authored'));
 const selectedStages=requested===null&&authored
  ? [...new Set(doc.areas.flatMap(a=>a.passes.map(p=>p.stage??p.id)))]
  : semanticCalibrationStages(doc,requested??'first-wash');
 const selectedPasses=doc.areas.flatMap(area=>area.passes.filter(pass=>selectedStages.includes(pass.stage??pass.id)).map(pass=>({area,pass,key:area.id+'/'+pass.id})));
 return {selectedStages,selectedPasses};
}
export function requireAuthoredCalibration(intent,mode,records){
 if(intent?.pass.source!=='authored'||mode!=='actual')return;
 if(!records[intent.key]?.samples?.length)fail('actual authored instrument calibration missing for '+intent.key+'; select its stage with --semanticcalibrationstages');
}
// Optional BEFORE-authored reference regimes; default remains the legacy Jones lengths.
export function semanticReferenceLengths(requested){
 if(requested===undefined||requested===null)return [.25,3.5,55.216613271938314];
 if(typeof requested!=='string')fail('reference lengths must be a comma-separated BEFORE declaration');
 const fields=requested.split(','),lengths=fields.map(Number);
 if(fields.length!==3||fields.some(x=>!x||x.trim()!==x)||lengths.some((x,i)=>!finite(x)||x<=0||(i>0&&x<=lengths[i-1])))fail('reference lengths require three finite positive increasing millimeter lengths');
 return lengths;
}
export async function calibrateSemanticInstrument(pass,{mmPerCell,paperOptions,pigments,physics,profile,strength=2.2,referenceLengthsMm=[.25,1.125,9],referenceGrid,referenceGestures,exactProfile=false,referenceOptions,attachBackend,onSample}){
 const {makePaper}=await import('../../src/media/paper.mjs'),{createSheet,thickness,coherent,step,dry}=await import('../../src/media/sheet.mjs'),{createBrush,dip,stroke,candidateContact}=await import('../../src/media/brush.mjs'),{measurePaper,measureBrush}=await import('../../src/paint/methods/wetdry.mjs');
 if(!finite(mmPerCell)||mmPerCell<=0||!referenceLengthsMm.every(x=>finite(x)&&x>0)||!referenceLengthsMm.every((x,i)=>i===0||x>referenceLengthsMm[i-1]))fail('calibration physical scale/lengths');
 if(referenceGestures&&(referenceGestures.length!==referenceLengthsMm.length||referenceGestures.some(r=>!Array.isArray(r.points)||r.points.length<2||r.points.some(p=>!['x','y','r','p'].every(k=>finite(p[k]))))))fail('invalid actual calibration reference gestures');
 const prep=semanticPreparation(pass),extent=prep?.contactSweep?.extendMm??0,w=referenceGrid?.w??Math.ceil((referenceLengthsMm.at(-1)+2*(prep?.brush.widthMm??pass.brush.widthMm)+2*extent)/mmPerCell),h=referenceGrid?.h??Math.ceil((2*(prep?.brush.widthMm??pass.brush.widthMm)+2*extent)/mmPerCell),want=.3,samples=[];
 for(const [referenceIndex,lengthMm] of referenceLengthsMm.entries()){
 const sh=createSheet(makePaper(w,h,{...paperOptions,mmPerCell}),pigments),backend=attachBackend?.(sh);
 const reference=referenceGestures?.[referenceIndex],actualProfile=reference?.profile??profile;
 const points=reference?reference.points.map(p=>({...p,x:p.x-(Math.min(...reference.points.map(q=>q.x))+Math.max(...reference.points.map(q=>q.x)))/2+w/2,y:p.y-(Math.min(...reference.points.map(q=>q.y))+Math.max(...reference.points.map(q=>q.y)))/2+h/2})):semanticGesture(pass,[{x:w/2-lengthMm/(2*mmPerCell),y:h/2},{x:w/2,y:h/2},{x:w/2+lengthMm/(2*mmPerCell),y:h/2}],mmPerCell);
 const brush=createBrush({...actualProfile,...(exactProfile?{}:semanticBrushOptions(pass,mmPerCell))});
 dip(brush,{water:pass.load.water*pass.load.waterQuantityMm3/pass.load.capacityMm3,conc:pigments.map(p=>want*strength*pass.load.pigmentScale*(pass.source==='authored'?(pass.paint.recipe[p.key]??0):1/pigments.length))});
 const opts=referenceOptions??{upright:pass.brush.orientation==='follow'?false:pass.brush.orientation==='sweep'?'sweep':true,lift:true},contact=candidateContact(brush,sh,points,{...opts,neighborRadius:pass.wetness.neighborCells});
 const material=()=>semanticMaterialContact(sh,contact,brush),observe=()=>measurePaper(sh,material().cells);
 const prepare=prepareSemanticContact(pass,points,{observe,waterStroke:(fallback,attempt)=>{
  const p=prep?{...pass,brush:prep.brush,load:{...prep.load,prewetWater:prep.load.water}}:pass;
  const wet=createBrush({...profile,...semanticBrushOptions(p,mmPerCell),seed:attempt});dip(wet,{water:semanticPrewetLoad(p,wet.free),conc:pigments.map(()=>0)});
  const waterPoints=prep?semanticPreparationGesture(pass,points,mmPerCell,{predict:q=>candidateContact(wet,sh,q,opts),requiredCells:material().cells,width:w}):fallback;
  stroke(wet,sh,waterPoints,opts);
 },advance:()=>step(sh,physics)});
 const before=observe();if(!prepare.ready||!semanticMaterialReady(pass,before,{water:measureBrush(brush).waterMass,pigment:measureBrush(brush).pigmentMass.reduce((a,b)=>a+b,0)}))fail('calibration required paper gate failed '+JSON.stringify({lengthMm,before}));
 const inventoryBefore=measureBrush(brush);stroke(brush,sh,points,opts);coherent(sh);
 const fields=thickness(sh),primary=contact.cells.filter(i=>contact.primaryMask[i]),allMass=fields.reduce((s,a)=>s+a.reduce((v,p)=>v+p,0),0),insideMass=fields.reduce((s,a)=>s+primary.reduce((v,i)=>v+a[i],0),0),plannedMass=want*primary.length,delivery=insideMass/plannedMass;
 if(!finite(delivery)||delivery<=.02)fail('actual instrument reference delivers too little for a supported calibration '+JSON.stringify({lengthMm,delivery,primaryCells:primary.length,plannedMass,allMass,insideMass,allFieldsFinite:fields.every(a=>a.every(finite)),paperBefore:before,brushBefore:inventoryBefore}));
 const record={lengthMm,referenceGrid:{w,h},points,profile:{...actualProfile,...(exactProfile?{}:semanticBrushOptions(pass,mmPerCell))},exactReachedProfile:exactProfile,paperOptions:{...paperOptions,mmPerCell},paperHeightSHA256:crypto.createHash('sha256').update(Buffer.from(sh.paper.height.buffer,sh.paper.height.byteOffset,sh.paper.height.byteLength)).digest('hex'),paperBefore:before,preparation:prepare,loadFraction:pass.load.water*pass.load.waterQuantityMm3/pass.load.capacityMm3,actualWaterQuantityMm3:pass.load.water*pass.load.waterQuantityMm3,plannedMass,allMass,insideMass,escapeMass:allMass-insideMass,delivery,gain:1/delivery,brushBefore:inventoryBefore,brushAfter:measureBrush(brush),backend};
 await onSample?.({sheet:sh,record,phase:'immediate'});dry(sh,20000,physics,{levelMax:400,dt:4});coherent(sh);record.driedTotalMass=thickness(sh).reduce((s,a)=>s+a.reduce((v,p)=>v+p,0),0);await onSample?.({sheet:sh,record,phase:'dried'});sh._gpu?.close();samples.push(record);
 }
 return {kind:'actual planned instrument reference calibration; not painting acceptance',pass,samples};
}

// Existing sheet film is one physical union; peel at the first completed-pass boundary
// where every authored prerequisite has actually executed.
export function semanticFilmRemovalReady(plan,completed){const films=plan.doc.areas.flatMap(a=>a.passes.filter(p=>p.lights.mode==='film'));return films.length>0&&films.every(p=>p.lights.actions.afterPasses.every(id=>completed.has(id)));}
