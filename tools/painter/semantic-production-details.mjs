import {createBrush,dip,tapeState,restoreTapeState,TAPE} from '../../src/media/brush.mjs';
import {measureBrush} from '../../src/paint/methods/wetdry.mjs';

// Bind the existing production modulation gestures to semantic owners without
// replacing their sampler, points, brush, dip, calibration or allocation.
// Existing numerical-charge contract, previously validated inline as .6.
// Shared by declared production sequences and ordinary numerical wash sequences.
const NUMERIC_WASH_MAX_SURFACE_WATER = .6;
export function validateProductionDetails(doc){
 const d=doc.productionDetails;if(!d)return null;
 if(d.source!=='production-modulate'||d.lightAuthority!=='semantic-only'||!Array.isArray(d.regionIds)||!d.regionIds.length||new Set(d.regionIds).size!==d.regionIds.length)throw Error('unsupported production detail declaration');
 for(const id of d.regionIds)if(!doc.areas.some(a=>a.id===id))throw Error('unknown production detail owner '+id);
 if(d.numericWashSequence?.dryPreparation){const p=d.numericWashSequence.dryPreparation;if(p.operation!=='ordinary-dry'||p.maxSteps!==30000||p.dt!==2||p.levelMax!==140)throw Error('unsupported production dry preparation');}
 if(d.numericWashSequence&&(d.numericWashSequence.mode!=='dry-start-linked-adjacent-charges'||d.numericWashSequence.maxSurfaceWater!==NUMERIC_WASH_MAX_SURFACE_WATER))throw Error('unsupported production numerical charge sequence');
 return d;
}
export function productionDetailContext(plan,{mid,brush,mmPerCell,width,scale=1,water,calibration}){
 const d=validateProductionDetails(plan.doc);if(!d)throw Error('production detail declaration missing');
 const x=Math.floor(mid.x),y=Math.floor(mid.y),area=plan.doc.areas[plan.owner[y*width+x]];
 if(!area||!d.regionIds.includes(area.id))return null;
 return {area,key:area.id+'/production-modulate',productionLegacyDetail:true,pass:{id:'production-modulate',source:'production-modulate',move:'dry brush',referenceCue:d.referenceCue,expectedResult:d.expectedResult,stop:d.stop,brush:{kind:brush.flat?'flat':'round',model:brush.model??'row',widthMm:2*brush.radius*mmPerCell,contact:brush.flat?'side':'belly',orientation:'production-original',pressure:'actual original dryMarkPath'},load:{water,pigmentScale:1,minRemainingFraction:0,source:'actual production dryMarkBrush/dip',calibration},wetness:{required:'dry',neighborCells:1},edges:{kind:'broken',overlap:true},lights:{mode:'paint-owned',reason:'semantic paper/film authority; original density-threshold lights do not create physical reservations'}}};
}

// A named numerical shape begins dry. Only its adjacent successful charge may
// continue its own edge: this is not a fully prewetted wash or a dry-detail waiver.
export function productionChargeLink(history,shapeKey,contact,maxFilm){
 const candidates=Array.isArray(history)?history:[history];
 for(let n=candidates.length-1;n>=0;n--){
  const previous=candidates[n];
  if(!previous||previous.status!=='executed'||previous.shapeKey!==shapeKey||typeof previous.id!=='string')continue;
  if(!Number.isFinite(maxFilm)||maxFilm<=0)throw Error('production continuation film bound missing');
  const overlap=contact.cells.filter(i=>contact.primaryMask[i]&&previous.primary.has(i));
  if(overlap.length)return {priorExecutedCommandId:previous.id,shapeKey,overlapCells:overlap.length,maxSurfaceWater:maxFilm,role:'same numerical shape own executed wet-edge continuation; not fully moist wash'};
 }
 return null;
}

// Sheet saturation is a Float32 pore-water / capacity ratio. Permit at most
// one Float32 ULP at unity; this is representation noise, not a wetness waiver.
const SATURATION_RATIO_ROUNDOFF = 2 ** -23;
export function productionContinuationReady(paper,brush,link){
 return !!link&&Number.isInteger(paper?.cells)&&paper.cells>0&&['waterMax','waterP95','saturationMax','moistShare'].every(k=>Number.isFinite(paper[k]))&&paper.waterMax>=0&&paper.waterMax<=link.maxSurfaceWater&&paper.waterP95>=0&&paper.saturationMax>=0&&paper.saturationMax<=1+SATURATION_RATIO_ROUNDOFF&&paper.moistShare>=0&&paper.moistShare<=1&&Number.isFinite(brush?.water)&&brush.water>=0&&Number.isFinite(brush?.pigment)&&brush.pigment>0;
}

export function prepareProductionDryContact({continuation,preparation,observe,dry,record=()=>{}}){
 const before=observe();
 if(continuation||before.dry)return {paper:before,prepared:false};
 if(preparation?.operation!=='ordinary-dry'||!Number.isInteger(preparation.maxSteps)||preparation.maxSteps<=0||preparation.maxSteps>30000||preparation.dt!==2||preparation.levelMax!==140)throw Error('strict production base needs declared ordinary dry preparation');
 record({status:'ordinary-dry-requested',paper:before,preparation});
 const returned=dry(preparation),paper=observe();
 record({status:'ordinary-dry-observed',paper,returned,ready:paper.dry===true,preparation});
 return {paper,prepared:true,ready:paper.dry===true};
}

// Called before the dip. Prediction uses the existing actual brush and sheet clip;
// zero supported primary contact is an omitted command, never delivered paint.
export function productionChargeSupported({predict,record=()=>{}}){
 const c=predict();if(!Number.isInteger(c.primaryCellCount)||c.primaryCellCount<0)throw Error('invalid production primary contact');
 if(c.primaryCellCount===0){record({status:'not-executed',reason:'zero actual primary support after finite sheet / original numerical clip',primaryCells:0});return false;}
 record({status:'supported-before-load',primaryCells:c.primaryCellCount,reason:'original numerical clip and finite sheet primary support; not deposited paint'});return true;
}

// Check the real compiled route, not merely a declared pass with no paint shapes.
export function validateCompiledAreaStop(stop,layers){
 if(!stop||stop==='drawing-opening')return;
 const matches=layers.some(layer=>{const a=layer._semantic;return a&&(stop===a.key||stop===a.area.id||stop===`stage:${a.pass.stage??a.pass.id}`);});
 if(!matches)throw Error('semantic checkpoint has no compiled paint layers: '+stop);
}

// Numerical wet-on-dry wash charges share only their own executed shape.
// Authored gestures and ordinary dry-brush details retain their separate contracts.
export function semanticNumericSequence(doc, active, layerIndex, shapeIndex) {
 const declared=validateProductionDetails(doc)?.numericWashSequence;
 const ordinary=active&&!active.productionLegacyDetail&&active.pass.source!=='authored'&&active.pass.move==='wet on dry'&&active.pass.wetness.required==='dry';
 if(!active||(!declared&&!ordinary))return null;
 const settings=declared??{maxSurfaceWater:NUMERIC_WASH_MAX_SURFACE_WATER,dryPreparation:{operation:'ordinary-dry',maxSteps:30000,dt:2,levelMax:140}};
 return {key:active.key,shapeKey:active.key+'/layer-'+layerIndex+'/shape-'+shapeIndex,history:[],settings,declared:!!declared};
}

// Observe all material recipients, not merely fresh pigment-free cells.
// Existing helpers retain executed-primary ownership, film limits and physical drying.
export function prepareSemanticNumericContact({sequence,contact,observe,dry,record}) {
 const continuation=productionChargeLink(sequence.history,sequence.shapeKey,contact,sequence.settings.maxSurfaceWater);
 const result=prepareProductionDryContact({continuation,preparation:sequence.settings.dryPreparation,observe,dry,record});
 return {...result,continuation};
}

// A real dip changes travel, clumping and tuft saturation. Predict its exact load
// on an isolated brush, never by dipping the live instrument or hiding a tape dip.
export function semanticChargeFeasible({brush,sheet,points,options,load,predict,reserved,record=()=>{}}) {
 if(brush._pend)brush._pend.link.settleBrush(brush);
 const tape=tapeState();let copy;
 try{
  copy=createBrush({...brush,bristles:brush.hairs.length});
  const rs=copy.rs;
  const state=Object.fromEntries(Object.entries(brush).filter(([k,v])=>typeof v!=='function'&&!['_pend','_tapeId','_cont','_restore'].includes(k)));
  Object.assign(copy,structuredClone(state));copy.rs=rs;rs.s=brush.rs.s;
  delete copy._tapeId;
  dip(copy,load);
 }finally{
  if(tape){restoreTapeState(tape);TAPE.length=tape.tape;}
 }
 const material=measureBrush(copy),target={...sheet,_contactBrush:sheet._contactBrush===brush?copy:sheet._contactBrush};
 const contact=predict(copy,target,points,{...options,clip:null,neighborRadius:0});
 const primary=contact.cells.filter(i=>contact.primaryMask[i]),hits=primary.filter(reserved);
 const supported=primary.filter(i=>!sheet.clip||sheet.clip[i]);
 const ready=!hits.length&&supported.length>0;
 record({status:ready?'supported-before-load':'not-executed',reason:hits.length?'loaded primary contact reaches reserved paper':supported.length?'loaded primary contact clears reserves':'zero supported primary contact',
  geometry:points,contactOptions:options,primaryCells:primary.length,supportedPrimaryCells:supported.length,reserveHitCount:hits.length,
  omittedPaint:ready?null:{preparedPigmentMass:material.pigmentMass,preparedWaterMass:material.waterMass,expectedLedgerCredit:0,meaning:'hypothetical prepared load omitted before actual dip; not measured deposited mass'}});
 return ready;
}
