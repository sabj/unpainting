import {passage} from '../../src/crop/blockin.mjs';
import {BOX,boxPigment} from '../../src/crop/box.mjs';
const fail=m=>{throw Error('authored paint: '+m);};
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const isAuthoredPlan=doc=>doc.areas?.some(a=>a.passes?.some(p=>p.source==='authored'))??false;
export function validateAuthoredPaint(doc){
 if(!isAuthoredPlan(doc))return false;
 let count=0;const ids=new Set();
 for(const a of doc.areas)for(const p of a.passes){
  if(p.source!=='authored')fail('all positive passes must explicitly be authored; numeric fallback forbidden');
  if(p.valueRange!==undefined)fail('authored dose has no fitted valueRange');
  if(p.paint?.units!=='pigment-depth-per-contact-cell'||!finite(p.paint.amount)||p.paint.amount<=0||p.paint.amount>4)fail('explicit finite amount/units required');
  const es=Object.entries(p.paint.recipe??{});if(!es.length||es.some(([k,v])=>!BOX.some(b=>b.key===k)||!finite(v)||v<0)||Math.abs(es.reduce((s,[,v])=>s+v,0)-1)>1e-8)fail('recipe must sum to one using modeled BOX keys');
  if(!Array.isArray(p.authoredGestures)||!p.authoredGestures.length||!['row','tuft'].includes(p.brush?.model))fail('explicit authored gestures/brush model required');
  if(p.load?.requireFreeFilm!==undefined&&(typeof p.load.requireFreeFilm!=='boolean'||p.move==='dry brush'))fail('explicit connected free-film body requirement unsupported');
  if(p.load?.requireFreeFilm===true&&p.brush?.model!=='tuft')fail('connected free-film observation requires actual CPU tuft contact');
  if(p.wetness?.settleBeforeContact!==undefined)validateWetEdgeSettle(p);
  if(p.edges?.overlap!==true)fail('authored ownership is context, not a numerical clip');
  if(!['wet on wet','wet-edge continuation'].includes(p.move)&&!(p.waitBeforeEachStroke?.operation==='ordinary-dry'&&Number.isInteger(p.waitBeforeEachStroke.maxSteps)&&p.waitBeforeEachStroke.maxSteps>0&&p.waitBeforeEachStroke.maxSteps<=30000&&finite(p.waitBeforeEachStroke.dt)&&p.waitBeforeEachStroke.dt>0&&p.waitBeforeEachStroke.dt<=2))fail('dry stroke requires bounded ordinary physical drying');
  for(const g of p.authoredGestures){if(!g.id||ids.has(g.id))fail('unique global gesture IDs required');ids.add(g.id);count++;}
 }
 const max=doc.budget?.maxPaintGestures;if(!Number.isInteger(max)||max<1||max>100||count>max)fail('explicit <=100 paint gesture budget exceeded');
 return true;
}
export function authoredPalette(doc){if(!validateAuthoredPaint(doc))return null;const keys=[...new Set(doc.areas.flatMap(a=>a.passes.flatMap(p=>Object.entries(p.paint.recipe).filter(([,v])=>v>0).map(([k])=>k))))];return keys.map(key=>({...boxPigment(BOX.find(p=>p.key===key)),key}));}
export function compileAuthoredPaint(plan,palette){
 if(!validateAuthoredPaint(plan.doc))return null;
 const keys=palette.map(p=>p.key);if(keys.some(k=>!k))fail('explicit modeled palette keys required');
 const n=plan.w*plan.h,layers=[];
 for(const s of plan.schedule){
  const cells=[];for(let i=0;i<n;i++)if(plan.doc.areas[plan.owner[i]]?.id===s.area.id&&!plan.reserves[i]&&!plan.film[i])cells.push(i);
  if(!cells.length)fail('empty authored planning ownership '+s.key);
  const mask=new Uint8Array(n),box={x0:plan.w,y0:plan.h,x1:-1,y1:-1};
  for(const i of cells){mask[i]=1;const x=i%plan.w,y=Math.floor(i/plan.w);box.x0=Math.min(box.x0,x);box.y0=Math.min(box.y0,y);box.x1=Math.max(box.x1,x);box.y1=Math.max(box.y1,y);}
  const recipe=keys.map(k=>s.pass.paint.recipe[k]??0);if(Math.abs(recipe.reduce((a,b)=>a+b,0)-1)>1e-8)fail('recipe pan absent from selected palette');
  const amount=s.pass.paint.amount,sh=passage(mask,1,box,amount,cells.length,plan.w);Object.assign(sh,{mix:recipe.map(v=>v*amount),_semantic:s,_authoredDose:true,_opening:1,_cover:1,_under:1,_fb:1});
  layers.push({value:1,pigment:recipe.indexOf(Math.max(...recipe)),mixv:recipe,mixIndex:layers.length,area:cells.length,amount,mix:sh.mix,shapes:[sh],_semantic:s});
 }
 return {layers,diagnostics:{...plan.diagnostics,stage:'compiled explicit authored pass layers, NOT execution proof',planComplete:true,numericFitBypassed:true,numericFitDeliveryCredit:0,authoredPaintGestures:plan.schedule.reduce((n,s)=>n+s.pass.authoredGestures.length,0),passes:plan.schedule.map(s=>({id:s.key,authoredGestures:s.pass.authoredGestures.length,recipe:s.pass.paint.recipe,amount:s.pass.paint.amount,units:s.pass.paint.units})),limit:'Geometry ownership and explicit strokes are planned; target coverage/value and actual deposition remain unproved.'}};
}
export function waitForAuthoredDry(pass,{observe,dry,advance}){
 if(pass.source!=='authored'||['wet on wet','wet-edge continuation'].includes(pass.move))return {paper:observe(),waited:false};
 const wait=pass.waitBeforeEachStroke;if(!wait)fail('missing declared dry wait');
 let paper=observe();if(paper.dry)return {paper,waited:false,steps:0};
 dry(wait);paper=observe();let steps=0;
 while(!paper.dry&&steps<wait.maxSteps){const count=Math.min(25,wait.maxSteps-steps);advance(count,wait.dt,paper);steps+=count;paper=observe();}
 return {paper,waited:true,steps,ready:paper.dry};
}

export function measureFreeFilmTips(brush){
 const free=brush.free,capacity=brush.capacity;
 if(!finite(free)||free<0||free>=1||!finite(capacity)||capacity<=0||!Array.isArray(brush.hairs)||!brush.hairs.length)fail('invalid actual tip/free-film inventory');
 const fractions=brush.hairs.map(h=>{if(!finite(h.len)||h.len<=0||!finite(h.water)||h.water<0)fail('invalid actual hair inventory');return h.water/(capacity*h.len);});
 return {free,minimum:Math.min(...fractions),maximum:Math.max(...fractions),mean:fractions.reduce((a,b)=>a+b,0)/fractions.length,aboveFreeShare:fractions.filter(v=>v>free).length/fractions.length,bellyWaterMass:brush.resW??0,tipWaterMass:brush.hairs.reduce((a,h)=>a+h.water,0)};
}
export function observeFreeFilmStroke(brush,options,execute,{required=false}={}){
 const before=measureFreeFilmTips(brush);let minimum=before.minimum,minimumAboveFreeShare=before.aboveFreeShare,samples=0,firstBelowFree=null;
 const observe=()=>{const m=measureFreeFilmTips(brush);minimum=Math.min(minimum,m.minimum);minimumAboveFreeShare=Math.min(minimumAboveFreeShare,m.aboveFreeShare);samples++;if(m.minimum<=m.free&&firstBelowFree===null)firstBelowFree=samples;};
 if(required&&(!options.between||brush.model!=='tuft'))fail('connected free-film requires existing per-step tuft observation');
 const value=execute({...options,...(options.between?{between:(...args)=>{options.between(...args);observe();}}:{})});
 observe();const after=measureFreeFilmTips(brush);
 return {value,evidence:{before,after,minimumTipFraction:minimum,minimumAboveFreeShare,samples,firstBelowFree,required,ready:minimum>before.free}};
}

export function validateWetEdgeSettle(pass){
 const declared=pass.wetness?.settleBeforeContact;
 if(declared!==undefined&&(pass.source!=='authored'||pass.move!=='wet-edge continuation'||declared.operation!=='ordinary-settle'||!Number.isInteger(declared.maxSteps)||declared.maxSteps<1||declared.maxSteps>6000||!finite(declared.dt)||declared.dt<=0||declared.dt>2))fail('unsupported bounded wet-edge settle');
 return declared??{operation:'ordinary-settle',maxSteps:6000,dt:1};
}
export function settleAuthoredWetEdge(pass,{observe,advance}){
 if(pass.source!=='authored'||pass.move!=='wet-edge continuation')return {paper:observe(),waited:false,steps:0};
 const wait=validateWetEdgeSettle(pass),limit=pass.wetness.maxSurfaceWater;if(!finite(limit)||limit<=0)fail('wet-edge surface limit required');
 const read=()=>{const p=observe();if(!finite(p.waterMax)||p.waterMax<0)fail('nonfinite measured wet-edge water');return p;};
 const before=read();let paper=before,steps=0;
 while(paper.waterMax>limit&&steps<wait.maxSteps){const count=Math.min(25,wait.maxSteps-steps);advance(count,wait.dt,paper);steps+=count;paper=read();}
 return {paper,before,waited:steps>0,steps,policy:wait,ready:paper.waterMax<=limit};
}
