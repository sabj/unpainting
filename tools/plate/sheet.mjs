// Brush and pen strokes, the value plan, the sheet of paper, looks, marks and scrap calibration.
// Stage 3 of 7 of tools/paint-plate.mjs. The stages run in order and share one object, ctx: see the entry file.
import {compactLowerLayers} from '../../src/media/layer-storage.mjs';
import {certifyZeroPaper} from '../../src/media/paper-certificate.mjs';
import {check} from '../../src/media/checks.mjs';
import {reservedContact, withReserveClip} from '../painter/reserve-clip.mjs';
import {layIntoWetBed} from '../painter/wet-bed-wait.mjs';
import {prepareWetBed} from '../painter/wet-bed-prep.mjs';
import {drawFineMaterial, drawOnFineSheet, fineGestures} from '../../src/paint/methods/fine-material.mjs';
import {createDeliveryCal} from '../../src/paint/methods/delivery-cal.mjs';
import {drawMaterial, sourceDrawingCaps} from '../../src/paint/methods/material-profiles.mjs';
import {planLightToDark, valueTechnique} from '../../src/paint/methods/light-to-dark.mjs';
import {smallestBrushMm} from '../../src/paint/methods/light-reserves.mjs';
import {unsupportedAxisEdges} from '../../src/paint/methods/target-regions.mjs';
import {writeValuePreview} from '../painter/value-plan-preview.mjs';
import {writePlanValueCheck} from '../painter/plan-value-check.mjs';
import {subjectField, orderBySubject, OVERLAP} from '../../src/paint/methods/subject-order.mjs';
import {DEFAULT_SHEET_MM} from '../../src/media/sheet-size.mjs';
import {recordGraphiteBatch} from '../painter/record-graphite.mjs';
import {SWATCH, swatchMask, scrapDelivery, chargeFactor} from '../../src/paint/methods/scrap-swatch.mjs';
import {createInstrumentCal, instrumentKey, chargedFromOwnSwatch} from '../../src/paint/methods/instrument-cal.mjs';
import {validateProductionDetails, productionChargeLink, productionContinuationReady, prepareProductionDryContact} from '../painter/semantic-production-details.mjs';
import {legacyIntentFamily, prepareMajorDryBase, sameUnliftedMajorGesture} from '../painter/legacy-major-intents.mjs';
import {nativeDryOptions} from '../painter/native-paint-mode.mjs';
import {semanticBrushObservation} from '../painter/semantic-brush-observation.mjs';
import {admitAuthoredContact} from '../painter/authored-gestures.mjs';
import {settleAuthoredWetEdge, observeFreeFilmStroke, waitForAuthoredDry} from '../painter/authored-paint.mjs';
import {semanticTechnique, semanticMaterialReady, semanticDrawingGroups, semanticBrushOptions, semanticHighlights, semanticMaterialContact, semanticPreparation, withSemanticWaterClip, semanticPrewetLoad, prepareSemanticContact, semanticPreparationGesture, semanticReferenceLengths, calibrateSemanticInstrument, semanticCalibrationSelection} from '../painter/semantic-areas.mjs';
import {measurePaperBatch, measureBrush} from '../../src/paint/methods/wetdry.mjs';
import {productionWaterLoad} from '../painter/production-water-load.mjs';
import {cachedStep, cachedStepSync, codeHash} from '../../src/paint/run-cache.mjs';
import {cachedSemanticInstrument, instrumentCodeHash} from '../painter/semantic-instrument-cache.mjs';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {makePaper, coldPressField} from '../../src/media/paper.mjs';
import {createSheet, step, dry as physicalDry, layersOf, thickness, thicknessTotals, DEFAULTS, coherent} from '../../src/media/sheet.mjs';
import {attachGpu} from '../../src/media/gpu/link.mjs';
import {backendLine} from '../../src/media/gpu/backend-record.mjs';
import {renderLayers, renderLayersCached, renderCells, microAmps} from '../../src/media/km.mjs';
import {renderSheet} from '../../src/media/render-cache.mjs';
import {createFramer} from '../../src/media/gpu/framer.mjs';
import {dip as dipBrush, thirsty} from '../../src/media/brush.mjs';
import {createTechniqueCal} from '../../src/paint/methods/technique-cal.mjs';
import {washPaths, brushedWashPaths, sweepCover, containPaths} from '../../src/media/wash.mjs';
import {pencilDraw as physicalPencilDraw} from '../../src/paint/methods/pencil-line.mjs';
import {distanceToZero} from '../../src/raster.js';
import {components, removeSmall, open as openMask} from '../../src/raster.js';
import {execution} from '../../src/eval/composite.mjs';
import {planDensityOver} from '../../src/eval/plan-optics.mjs';
import {gaussian} from '../../src/keyframes/density.mjs';
import {overlay} from '../../src/media/gouache.mjs';
// Optional stages, one module each, off unless their flag is given.
import {furLightReserves} from '../../src/paint/methods/finish-texture.mjs';
import {chargeOrder} from '../../src/paint/methods/charge-layers.mjs';
import {sampledInkAbsorbance, matchInkLoad, sampleGestures} from '../../src/paint/methods/ink-match.mjs';
import {makeInkRes} from '../../src/paint/methods/ink-res.mjs';
import {loadPhysical} from '../../src/paint/methods/brushes.mjs';
import {fillSheetBase, WHITE_PAPER_RGB} from '../../src/paint/methods/sheet-tone.mjs';
import {sealAtBirth} from '../guard/seal-maps.mjs';
import {createWetTrace} from './wet-trace.mjs';
import {wetOnDryGate, passageReach} from '../painter/passage-dry-gate.mjs';

export async function sheetAndBrushes(ctx) {
const { WASH_FLAT_SPLAY, ENTRY_FILE, JSONL, opt, num, optTrack, NATIVE_PAINT_MODE, SPEED_PAPER, 
  SPEED_CONTACT, SPEED_VALUE_CACHE, SPEED_UNIFORM_PAPER, measurePaper, VALUE_CONTACT_WORK, SPEED_GPU_OPTICS, 
  SPEED_PROFILE, root, out, RUN_CACHE, SPARSE_CONTACT_RECORD, VALUE_CONFIG, VALUE_ENABLED, VALUE_COUNTS, 
  WASH_SESSION, MAJOR_INTENT, phaseMark, w, h, n, createBrush, physicalStroke: untracedStroke, candidateContact, TONE_MODE, 
  SHEET_TONE, CALIBRATED_PLAN, PAPER_RULE, paperRGB, WASH_SPLAT_SETTINGS, CODE_HASH, PIGS, SMALL, WHITE_HOLD, MIXES, 
  setClip, MOD, COLOUR_TRACE, OUTLINE, STAGE_PLAN, REQUESTED_DRAW_MEDIUM, INK_WIDTH_FLOOR_MM, INK_DAMP, 
  STYLE_INK_DEFAULT, INK_PROFILE, GRAPHITE_PROFILE, INK, GRAPHITE, SHEET_PIGS, GRAPHITE_AT, FINISH_FILE, AREA_LOADS, 
  AREA_EXEC } = ctx;
Object.assign(ctx, { colourMass });
// WET_TRACE=<file.jsonl>: a read-only record of the sheet's water under each stroke at landing and around each dry (wet-trace.mjs)
const physicalStroke=(b,t,p,o)=>ctx.WET_TRACE&&t===ctx.sheet?ctx.WET_TRACE.stroke(b,t,p,o,untracedStroke):untracedStroke(b,t,p,o);
const tracedDry=(...args)=>ctx.WET_TRACE&&args[0]===ctx.sheet?ctx.WET_TRACE.dry(args,physicalDry):physicalDry(...args);
const dry=(...args)=>{ctx.VALUE_OWN_CONTACT.clear();ctx.VALUE_PIGMENT_CONTACT.clear();const requested=args[3];args[3]=nativeDryOptions(NATIVE_PAINT_MODE.mode,requested);const result=ctx.AREA_PLAN?AREA_EXEC.command('ordinary physical drying',{maxSteps:args[1],options:args[3],requestedOptions:requested,nativeMode:NATIVE_PAINT_MODE},()=>tracedDry(...args)):tracedDry(...args);if(args[0]._layerStoragePolicy)compactLowerLayers(args[0],args[0]._layerStoragePolicy());return result;};
const dip=(b,o)=>{const a=AREA_EXEC.active,paint=o.conc.some(v=>v>0);ctx.WET_TRACE?.dipped(b,paint);const load=a&&!a.productionLegacyDetail?{...o,water:paint&&a.pass.source!=='authored'?a.pass.load.water:(paint?a.pass.load.water:(a.pass.load.prewetWater??1))*a.pass.load.waterQuantityMm3/a.pass.load.capacityMm3,conc:o.conc.map(v=>v*(paint?a.pass.load.pigmentScale:1))}:o;const padded=(INK||GRAPHITE)&&load.conc.length<SHEET_PIGS.length?{...load,conc:[...load.conc,...new Array(SHEET_PIGS.length-load.conc.length).fill(0)]}:load;if(!ctx.AREA_PLAN)return dipBrush(b,padded);const before=measureBrush(b);const value=AREA_EXEC.command('physical brush dip/refill',{load:padded,brushBefore:before,passIntent:a?.pass??null},()=>dipBrush(b,padded));AREA_LOADS.set(b,{load:padded,waterMass:measureBrush(b).waterMass});return value;};
// Opt-in actual numeric production loads only: calibration and pen loads stay unchanged.
const PRODUCTION_WATER=num('productionwater',1);productionWaterLoad({water:1,conc:[0]},PRODUCTION_WATER);
if(PRODUCTION_WATER!==1&&ctx.AREA_PLAN)throw Error('productionwater supports the original numeric route only; no semantic rewet fallback');
if(PRODUCTION_WATER!==1)fs.writeFileSync(path.join(out,'production-water-before.json'),JSON.stringify({factor:PRODUCTION_WATER,scope:'actual numeric paint/prewet dips after unchanged scrap calibration; ink unchanged',pigment:'same prepared mass through inverse concentration, not a delivery guarantee',admission:'existing native material checks; no automatic baseline-water fallback'},null,2));
const productionDip=(b,o)=>{const authored=AREA_EXEC.active?.pass?.source==='authored',requested=o,prepared=productionWaterLoad(o,PRODUCTION_WATER,{authored}),result=dip(b,prepared);if(PRODUCTION_WATER!==1&&!authored){const actual=measureBrush(b),baselineWaterMass=actual.waterMass/PRODUCTION_WATER,intendedPigmentMass=actual.pigmentMass.map((_,j)=>(requested.conc[j]??0)*baselineWaterMass);JSONL.append(path.join(out,'production-water-loads.jsonl'),JSON.stringify({kind:requested.conc.some(v=>v>0)?'actual production paint load':'actual production clean prewet',factor:PRODUCTION_WATER,shapeId:ctx.MAJOR_TECHNIQUE?.shapeId??null,technique:ctx.MAJOR_TECHNIQUE?.name??null,requested,prepared,actual,baselineWaterMassAtSameBrush:baselineWaterMass,intendedPigmentMass,deliveredPigmentMass:null,meaning:'prepared brush mass only; actual deposition is measured separately; no rewet fallback'})+'\n');}return result;};

ctx.RECEIVER_OBSERVER=null;
// a clean brush made like the painting brush takes its settings, not the GPU stroke it may still have pending (b._pend)
const brushSettings=b=>{const {_pend,...settings}=b;return settings;};
const stroke=(b,target,points,options)=>{
 if(ctx.AREA_NUMERIC_CONTACT_STOP&&target===ctx.sheet)return;
 if(ctx.VALUE_ACTIVE&&target===ctx.sheet){
  if(ctx.VALUE_ACTIVE.shaped)options={...options,upright:ctx.VALUE_ACTIVE.brush?.contact==='point'?false:'sweep'};
  const fastMode=NATIVE_PAINT_MODE.mode==='fast',fastPaperOpts=fastMode?{uniform:SPEED_UNIFORM_PAPER,stats:'gate'}:{uniform:SPEED_UNIFORM_PAPER};
  const contactStarted=performance.now(),contact=candidateContact(b,target,points,{...options,clip:null,neighborRadius:3,includeTouched:false,workspace:SPEED_CONTACT?VALUE_CONTACT_WORK:null});
  SPEED_PROFILE?.add('painting:contact-prediction',performance.now()-contactStarted);
  // a wet-into-wet bed is read and prepared under the brush for every value-plan passage laid wet on wet, whether or not
  // the plan names its passage material (one bed rule: tools/painter/wet-bed-prep.mjs)
  const ownBed=Boolean(ctx.VALUE_ACTIVE.passageMaterial)||ctx.VALUE_ACTIVE.move==='wet on wet';
  const cells=contact.cells.filter(i=>!target.resist?.[i]&&(!ownBed||((!target.clip||target.clip[i])&&contact.primaryMask[i]))),neighbors=contact.neighborIndices,load=measureBrush(b,{settle:false}),paint=load.pigmentMass.some(v=>v>0);
  let _observationCells=null;
  const getObservationCells=()=>{if(!_observationCells)_observationCells=ownBed?cells:[...cells,...neighbors];return _observationCells;};
  const observe=()=>measurePaper(target,getObservationCells(),SPEED_PAPER,fastPaperOpts);
  const ownCandidate=contact.cells.some(i=>contact.primaryMask[i]&&ctx.VALUE_OWN_CONTACT.has(i));
  const freshCells=paint&&ownBed?cells.filter(i=>!ctx.VALUE_PIGMENT_CONTACT.has(i)):cells;
  const intoOwnWash=paint&&freshCells.length<cells.length*.3;
  const wetMove=['wet on wet','dry on wet'].includes(ctx.VALUE_ACTIVE.move);
  let paper=null,own=false;
  if(fastMode){
    if(paint&&!wetMove){
      // the passage's reach is read once, at its first paint stroke, when its clip is set (tools/painter/passage-dry-gate.mjs)
      const VP=ctx.VALUE_PASSAGE;if(VP&&VP.reach===undefined)VP.reach=passageReach(target.clip,target.w,target.h);
      const gate=wetOnDryGate({cells,neighbors,own:{touches:ownCandidate,has:i=>ctx.VALUE_OWN_CONTACT.has(i)},texture:ctx.VALUE_ACTIVE.texture,observeCells:getObservationCells(),passage:VP?.reach?{start:!VP.checked,reach:VP.reach}:null,
        measure:(c,kind)=>measurePaper(target,c,SPEED_PAPER,kind==='gate'?{uniform:SPEED_UNIFORM_PAPER,stats:'gate'}:fastPaperOpts),dry:()=>dry(target,30000,O,{levelMax:140,dt:2})});
      paper=gate.paper;own=gate.own;if(VP?.reach)VP.checked=true;
      if(gate.dried)check('value-plan dry-paper contact gate failed',paper.dry,{id:ctx.VALUE_ACTIVE.id,band:ctx.VALUE_ACTIVE.valueBand,waterMax:paper.waterMax,saturationMax:paper.saturationMax});
    }else if(paint&&!intoOwnWash&&!(ownBed&&ctx.VALUE_ACTIVE.move==='wet on wet')){
      paper=observe();
    }
  }else{
    const initial=measurePaperBatch(target,[{cells:getObservationCells()},...(ownCandidate?[{cells:[...cells,...neighbors].filter(i=>!ctx.VALUE_OWN_CONTACT.has(i)),stats:'gate'}]:[])],SPEED_PAPER,{uniform:SPEED_UNIFORM_PAPER});
    paper=initial[0];own=ownCandidate&&initial[1].dry;
    if(paint&&!wetMove&&(!own||ctx.VALUE_ACTIVE.texture)&&!paper.dry){dry(target,30000,O,{levelMax:140,dt:2});paper=observe();check('value-plan dry-paper contact gate failed',paper.dry,{id:ctx.VALUE_ACTIVE.id,band:ctx.VALUE_ACTIVE.valueBand,waterMax:paper.waterMax,saturationMax:paper.saturationMax});}
  }
  // a wet bed is judged by its typical cell (median standing water), so it is read cell by cell, never as uniform paper
  const observeBed=()=>measurePaper(target,freshCells.length?freshCells:cells,SPEED_PAPER,{uniform:false});
  if(paint&&!intoOwnWash&&ownBed&&ctx.VALUE_ACTIVE.move==='wet on wet'){
    const prepOpts={upright:options.upright,lift:false,spacing:options.spacing};
    const preparation=(()=>{try{return prepareWetBed({settings:brushSettings(b),bristles:b.hairs.length,seed:911+ctx.VALUE_COMMAND,pigments:SHEET_PIGS.length,target,points,prepOpts,observe:observeBed,gate:()=>measurePaper(target,getObservationCells(),SPEED_PAPER,{stats:'gate'}),advance:()=>ctx.clock('flow',()=>step(target,{...O,dt:2})),createBrush,dip,thirsty,stroke});}catch(e){e.message=`passage ${ctx.VALUE_ACTIVE.id} (value band ${ctx.VALUE_ACTIVE.valueBand}, ${(freshCells.length?freshCells:cells).length} cells in its footprint): ${e.message}`;throw e;}})();paper=preparation.paper;
    JSONL.append(path.join(out,'passage-material-preparation.jsonl'),JSON.stringify({intent:ctx.VALUE_ACTIVE.id,admission:'actual allowed paint footprint; adjacent paper inspected separately',neighbors:fastMode?null:measurePaper(target,neighbors,SPEED_PAPER),...preparation})+'\n');
  }
  // A wet stroke into a fresh wash waits for the shine to go off, then is laid; uneven paper is counted, not a stop (tools/painter/wet-bed-wait.mjs).
  let wetWaits=0;
  if(paint&&!intoOwnWash&&['wet on wet','dry on wet'].includes(ctx.VALUE_ACTIVE.move)){const observeWet=()=>measurePaper(target,getObservationCells(),SPEED_PAPER,{uniform:false});({paper,wetWaits}=layIntoWetBed({paper:observeWet(),observe:observeWet,step:o=>step(target,o),O,info:{id:ctx.VALUE_ACTIVE.id,band:ctx.VALUE_ACTIVE.valueBand,cells:cells.length}}));}
  const [primary,neighborPaper]=NATIVE_PAINT_MODE.mode==='fast'?[null,null]:measurePaperBatch(target,[{cells},{cells:neighbors}],SPEED_PAPER,{uniform:SPEED_UNIFORM_PAPER});
  const id='value-contact-'+(++ctx.VALUE_COMMAND),record={id,commandId:ctx.VALUE_COMMAND,intent:ctx.VALUE_ACTIVE.id,phase:ctx.VALUE_ACTIVE.phase,valueBand:ctx.VALUE_ACTIVE.valueBand,regions:ctx.VALUE_ACTIVE.regions,crossesRegions:ctx.VALUE_ACTIVE.crossesRegions,kind:paint?'pigment':'clean-water',ownWetEdge:own,paper,wetWaits,primary,neighbors:neighborPaper,brushBefore:load,geometry:points,options};
  if(!Number.isFinite(load.waterMass)||load.pigmentMass.some(v=>!Number.isFinite(v)))throw Error('value-plan nonfinite brush');
  const previousCommand=target._commandId; target._commandId=ctx.VALUE_COMMAND;
  let result; try { result=physicalStroke(b,target,points,options); } finally { target._commandId=previousCommand; }
  {const count=VALUE_COUNTS[ctx.VALUE_ACTIVE.valueBand-1];count.strokes++;count.contacts+=cells.length;}
  // Clean-water preparation belongs to this passage too. Otherwise the first
  // pigment stroke dries away the very wet bed prepared for merging its lanes.
  for(const i of contact.cells){ctx.VALUE_OWN_CONTACT.add(i);if(paint)ctx.VALUE_PIGMENT_CONTACT.add(i);}
  JSONL.append(path.join(out,'value-commands.jsonl'),JSON.stringify({...record,status:'EXECUTED',brushAfter:measureBrush(b,{settle:false})})+'\n');return result;
 }

 if(!ctx.AREA_PLAN){
  if(!MAJOR_INTENT||target!==ctx.sheet)return physicalStroke(b,target,points,options);
  const commandId='major-command-'+String(++ctx.MAJOR_COMMAND).padStart(7,'0'),contact=candidateContact(b,{...target,clip:null},points,{...options,neighborRadius:3,sparseRow:SPARSE_CONTACT_RECORD.enabled}),cells=contact.cells.filter(i=>!(target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1)),paper=measurePaper(target,cells),neighbors=measurePaper(target,contact.neighborIndices),before=measureBrush(b),paint=before.pigmentMass.some(v=>v>0),family=legacyIntentFamily(MAJOR_INTENT,points,target.w,target.h),technique=ctx.MAJOR_TECHNIQUE;
  if(SPARSE_CONTACT_RECORD.enabled&&b.model!=='tuft')SPARSE_CONTACT_RECORD.selectedRowContacts++;
  const record={predictionEnumeration:SPARSE_CONTACT_RECORD.enabled&&b.model!=='tuft'?'sparse actual ROW emitted indices':'original full-sheet enumeration',commandId,familyId:family.id,referenceCue:family.referenceCue,lights:family.lights,plannedMaterialDecision:family.material,technique,actualBrush:{model:b.model??'row',flat:b.flat,profile:semanticBrushObservation(b),radius:b.radius,bridge:b.bridge,free:b.free},paper,neighbors,brushBefore:before,geometry:points,options,primaryCells:contact.cells.filter(i=>contact.primaryMask[i]).length,clipAllowedPrimary:contact.cells.filter(i=>contact.primaryMask[i]&&(!target.clip||target.clip[i])).length,scope:'original numeric production geometry retained; context guide is not a mask/ownership allocator'};
  JSONL.append(path.join(out,'major-commands.jsonl'),JSON.stringify({...record,status:'BEFORE'})+'\n');
  const reject=error=>{JSONL.append(path.join(out,'major-commands.jsonl'),JSON.stringify({...record,status:'REJECTED',error:error.message})+'\n');throw error;};
  if(!Number.isFinite(paper.waterMax)||!Number.isFinite(before.waterMass)||before.pigmentMass.some(v=>!Number.isFinite(v)))reject(Error('major physical contact/nonfinite admission '+commandId));
  if(paint&&record.clipAllowedPrimary===0)record.admission='masked/clipped attempted contact; no supported-primary delivery credit';
  const continuation=sameUnliftedMajorGesture(ctx.MAJOR_PREVIOUS,{brush:b,points,options,shapeId:technique?.shapeId});
  const observed=()=>{const mc=semanticMaterialContact(target,contact,b);record.materialContact={...mc,cells:undefined,conservativeCells:undefined};record.primaryPaper=measurePaper(target,contact.cells.filter(i=>contact.primaryMask[i]));record.liftPaper=measurePaper(target,contact.cells.filter(i=>contact.liftMask[i]&&!contact.primaryMask[i]));record.conservativePaper=measurePaper(target,mc.conservativeCells);return measurePaper(target,mc.cells.filter(i=>!(target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1)));};
  try{const prepared=prepareMajorDryBase({paint,technique,continuation,preparation:MAJOR_INTENT.dryDetailPreparation,observe:observed,dry:q=>dry(target,q.maxSteps,O,{levelMax:q.levelMax,dt:q.dt}),record:q=>JSONL.append(path.join(out,'major-commands.jsonl'),JSON.stringify({...record,...q,commandId,familyId:family.id})+'\n')});record.actualMaterialPaper=prepared.paper;}catch(error){reject(error);}

  if(paint&&technique?.connectedSkyDecision)JSONL.append(path.join(out,'major-sky-contacts.jsonl'),JSON.stringify({commandId,...technique.connectedSkyDecision,shapeId:technique.shapeId,paper:record.actualMaterialPaper,primary:record.primaryPaper,lift:record.liftPaper,neighbors,brushBefore:before,actualBrush:record.actualBrush,observedMove:record.actualMaterialPaper.dry&&neighbors.dry?'dry start/restart':'wet-edge contact',ordinaryDryPrepared:false})+'\n');
  ctx.RECEIVER_OBSERVER?.before({commandId,technique,sheet:target,contact,points,ownership:{hold:ctx.HOLD,small:SMALL},record});
  const value=physicalStroke(b,target,points,options);ctx.RECEIVER_OBSERVER?.executed(commandId,target);ctx.MAJOR_PREVIOUS={brush:b,end:points.at(-1),lift:options?.lift??true,shapeId:technique?.shapeId};JSONL.append(path.join(out,'major-commands.jsonl'),JSON.stringify({commandId,familyId:family.id,status:'EXECUTED',brushAfter:measureBrush(b),brushTipAfter:semanticBrushObservation(b)})+'\n');
  if(paint&&!fs.existsSync(path.join(out,'major-first-pigment.ppm')))fs.writeFileSync(path.join(out,'major-first-pigment.ppm'),Buffer.concat([Buffer.from('P6\n'+W2+' '+H2+'\n255\n'),Buffer.from(render())]));return value;
 }
 const a=AREA_EXEC.active;if(a&&!a.productionLegacyDetail)options={...options,upright:a.pass.brush.orientation==='follow'?false:a.pass.brush.orientation==='sweep'?'sweep':true};const initial=AREA_LOADS.get(b);if(a&&initial&&measureBrush(b).waterMass<initial.waterMass*a.pass.load.minRemainingFraction)AREA_EXEC.command('physical measured refill',{before:measureBrush(b),trigger:a.pass.load.minRemainingFraction,load:initial.load},()=>dipBrush(b,initial.load));const contact=candidateContact(b,target,points,{...options,clip:null,neighborRadius:a?.pass.wetness.neighborCells??5}),paper0=measurePaper(target,[...contact.cells,...contact.neighborIndices].filter(i=>!(target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1))),load=measureBrush(b),paint=load.pigmentMass.some(v=>v>0);
 const continuation=a&&!a.productionLegacyDetail&&paint&&ctx.AREA_NUMERIC_SEQUENCE?.key===a.key?productionChargeLink(ctx.AREA_NUMERIC_SEQUENCE.history,ctx.AREA_NUMERIC_SEQUENCE.shapeKey,contact,validateProductionDetails(ctx.AREA_PLAN.doc)?.numericWashSequence?.maxSurfaceWater):null;
 const contactParts=()=>({primary:measurePaper(target,contact.cells.filter(i=>contact.primaryMask[i])),liftEnvelope:measurePaper(target,contact.cells.filter(i=>contact.liftMask[i]&&!contact.primaryMask[i])),neighborHalo:measurePaper(target,contact.neighborIndices),liftRole:'conservative final-lift envelope; not evidence every cell receives pigment'});
 let materialContact=semanticMaterialContact(target,contact,b),paper=measurePaper(target,materialContact.cells.filter(i=>!(target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1)));
 if(a&&paint&&a.pass.source==='authored'&&!['wet on wet','wet-edge continuation'].includes(a.pass.move)){
  const observed=()=>{materialContact=semanticMaterialContact(target,contact,b);return measurePaper(target,materialContact.cells.filter(i=>!(target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1)));};
  const waited=waitForAuthoredDry(a.pass,{observe:observed,dry:q=>dry(target,q.maxSteps,O,{levelMax:140,dt:q.dt}),advance:(count,dt,before)=>AREA_EXEC.command('ordinary authored per-contact dry wait',{steps:count,dt,before},()=>{for(let n=0;n<count;n++)step(target,{...O,dt});})});paper=waited.paper;
 }
 if(a&&paint&&a.pass.source==='authored'&&a.pass.move==='wet-edge continuation'){
  const observed=()=>{materialContact=semanticMaterialContact(target,contact,b);return measurePaper(target,materialContact.cells.filter(i=>!(target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1)));};
  const settled=settleAuthoredWetEdge(a.pass,{observe:observed,advance:(count,dt,before)=>AREA_EXEC.command('ordinary wet-edge settling',{steps:count,dt,before,maximumSurfaceWater:a.pass.wetness.maxSurfaceWater},()=>{for(let n=0;n<count;n++)step(target,{...O,dt});})});paper=settled.paper;
  JSONL.append(path.join(out,'semantic-commands.jsonl'),JSON.stringify({kind:'semantic-wet-edge-settle',areaId:a.area.id,passId:a.key,gestureId:points[0]?.gestureId,...settled})+'\n');
 }
 const authoredHits=a&&paint&&a.pass.source==='authored'?admitAuthoredContact(contact,materialContact,{reserved:i=>ctx.AREA_PLAN.reserves[Math.floor(i/target.w/SC)*w+Math.floor(i%target.w/SC)]!==0,film:i=>target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1}).reservedCells:[];
 // a wet on wet pass the ladder fills names no preparation: its bed follows the one bed rule of a value-plan wash
 // (tools/painter/wet-bed-prep.mjs: a clean brush like the painting brush, pickup, the wait for the shine), skipped where
 // the stroke lands mostly in its own wet wash (under 30% fresh cells, as a value-plan wash), then gated as that wash is
 let intoOwnWet=false;
 if(a&&paint&&a.pass.move==='wet on wet'&&a.pass.source!=='authored'&&!a.pass.preparation){
  const bed=contact.cells.filter(i=>contact.primaryMask[i]&&!target.resist?.[i]&&(!target.clip||target.clip[i])),fresh=bed.filter(i=>!ctx.VALUE_PIGMENT_CONTACT.has(i));
  if(bed.length&&fresh.length>=bed.length*.3){
   const observeBed=()=>measurePaper(target,fresh,SPEED_PAPER,{uniform:false});
   const prep=prepareWetBed({settings:brushSettings(b),bristles:b.hairs.length,seed:911+AREA_EXEC.records.length,pigments:SHEET_PIGS.length,target,points,prepOpts:{upright:options.upright,lift:false,spacing:options.spacing},observe:observeBed,gate:()=>measurePaper(target,fresh,SPEED_PAPER,{stats:'gate'}),advance:()=>ctx.clock('flow',()=>step(target,{...O,dt:2})),createBrush,dip,thirsty,stroke});
   const waited=layIntoWetBed({paper:prep.paper,observe:observeBed,step:o=>step(target,o),O,info:{pass:a.key,cells:fresh.length}});paper=waited.paper;
   JSONL.append(path.join(out,'semantic-commands.jsonl'),JSON.stringify({kind:'semantic-wet-bed',areaId:a.area.id,passId:a.key,freshCells:fresh.length,bedCells:bed.length,wetWaits:waited.wetWaits,paper})+'\n');
  }else if(bed.length){paper=measurePaper(target,bed,SPEED_PAPER,{uniform:false});intoOwnWet=true;}
 }
 else if(a&&paint&&a.pass.move==='wet on wet'){
  const observed=()=>{measurePaper(target,[...contact.cells,...contact.neighborIndices]);materialContact=semanticMaterialContact(target,contact,b);return measurePaper(target,materialContact.cells.filter(i=>!(target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1)));};
  const result=prepareSemanticContact(a.pass,points,{observe:observed,waterStroke:(prepared,attempt)=>{
   const prep=semanticPreparation(a.pass),preparedPass=prep?{...a.pass,brush:prep.brush,load:{...prep.load,prewetWater:prep.load.water}}:a.pass;
   const mm=num('sheetmm', DEFAULT_SHEET_MM)/W2;
   const wet=createBrush({...brushSettings(b),bristles:b.hairs.length,...(prep?{...semanticBrushOptions(preparedPass,mm),...(prep.depositDepthMm!==undefined?{depositDepth:prep.depositDepthMm}:{})}:{radius:b.radius+a.pass.wetness.neighborCells}),seed:ctx.SEED+attempt});
   semanticPrewetLoad(preparedPass,wet.free);
   const legacyAllowed=target.clip?[...contact.cells,...contact.neighborIndices].filter(i=>target.clip[i]).length:null;
   AREA_EXEC.set({...a,pass:preparedPass});try{dip(wet,{water:preparedPass.load.prewetWater??1,conc:SHEET_PIGS.map(()=>0)});const waterPoints=prep?semanticPreparationGesture(a.pass,points,mm,{predict:path=>candidateContact(wet,target,path,{...options,clip:null,neighborRadius:0}),requiredCells:materialContact.cells,width:target.w}):prepared;withSemanticWaterClip(target,setClip,()=>stroke(wet,target,waterPoints,{...options,lift:true}));}finally{AREA_EXEC.set(a);}
   JSONL.append(path.join(out,'semantic-commands.jsonl'),JSON.stringify({kind:'semantic-contact-preparation',areaId:a.area.id,passId:a.key,attempt,geometrySource:prep?.contactSweep?'authored extended contact-following clean sweep, aligned by actual native contact prediction':'exact upcoming shaped pigment points/pressure/radius plus declared neighbor reach',primaryCells:contact.primaryCellCount,liftCells:contact.liftCellCount,neighborCells:contact.neighborCells,legacyAllowedCells:legacyAllowed,numericalClipUsedForWater:false,paperAfter:observed()})+'\n');
  },advance:flowStep=>{AREA_EXEC.command('ordinary physical preparation flow',{flowStep,preparation:a.pass.preparation},()=>step(target,O));JSONL.append(path.join(out,'semantic-commands.jsonl'),JSON.stringify({kind:'semantic-preparation-flow-observation',areaId:a.area.id,passId:a.key,flowStep,paperAfter:observed()})+'\n');}});paper=result.paper;
 }
 // bare-paper contact is clipped out of the stroke (tools/painter/reserve-clip.mjs) and counted, not stopped
 const reserveHits=a?reservedContact(contact,i=>ctx.AREA_PLAN.reserves[Math.floor(i/target.w/SC)*w+Math.floor(i%target.w/SC)]):[];check('bare-paper contact',!reserveHits.length,{pass:a?.key,clippedCells:reserveHits.length});
 if(a&&paint&&!a.productionLegacyDetail&&ctx.AREA_NUMERIC_SEQUENCE?.key===a.key&&!continuation&&a.pass.wetness.required==='dry'){
  const observed=()=>{materialContact=semanticMaterialContact(target,contact,b);return measurePaper(target,materialContact.cells.filter(i=>!(target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1)));};
  const preparation=validateProductionDetails(ctx.AREA_PLAN.doc).numericWashSequence.dryPreparation;
  const result=prepareProductionDryContact({continuation,preparation,observe:observed,dry:q=>dry(target,q.maxSteps,O,{levelMax:q.levelMax,dt:q.dt}),record:r=>JSONL.append(path.join(out,'semantic-commands.jsonl'),JSON.stringify({kind:'production-numeric-dry-preparation',areaId:a.area.id,passId:a.key,shapeKey:ctx.AREA_NUMERIC_SEQUENCE.shapeKey,...r,ordinaryDryCommandId:r.status==='ordinary-dry-observed'?AREA_EXEC.records.at(-1)?.id:null})+'\n')});paper=result.paper;
 }
 if(a&&paint){if(!(continuation?productionContinuationReady(paper,{water:load.waterMass,pigment:load.pigmentMass.reduce((s,v)=>s+v,0)},continuation):semanticMaterialReady(intoOwnWet?{...a.pass,wetness:{...a.pass.wetness,required:'wet'}}:a.pass,paper,{water:load.waterMass,pigment:load.pigmentMass.reduce((s,v)=>s+v,0)}))){const failure={kind:'semantic-material-admission-failed',numericalChargeState:continuation??{shapeKey:ctx.AREA_NUMERIC_SEQUENCE?.shapeKey??null,executedOwnCommandIds:ctx.AREA_NUMERIC_SEQUENCE?.history.map(r=>r.id)??[],role:'no actually intersecting own executed primary support; strict dry admission'},areaId:a.area.id,passId:a.key,expected:{state:a.pass.wetness.required,minMoistShare:.7,maxMoistWater:.15},paper,materialContact:{...materialContact,cells:undefined,conservativeCells:undefined},conservativePaper:measurePaper(target,materialContact.conservativeCells),contactParts:contactParts(),brush:load,geometry:points};fs.writeFileSync(path.join(out,'semantic-material-failure.json'),JSON.stringify(failure,null,2));JSONL.append(path.join(out,'semantic-commands.jsonl'),JSON.stringify(failure)+'\n');if(target===ctx.sheet){try{const pixels=Buffer.from(render());fs.writeFileSync(path.join(out,'semantic-material-failure.ppm'),Buffer.concat([Buffer.from('P6\n'+W2+' '+H2+'\n255\n'),pixels]));execFileSync(process.execPath,['--input-type=module','-e',"import sharp from 'sharp';import fs from 'node:fs';await sharp(fs.readFileSync(0),{raw:{width:Number(process.argv[2]),height:Number(process.argv[3]),channels:3}}).png().toFile(process.argv[1]);",path.join(out,'semantic-material-failure.png'),String(W2),String(H2)],{cwd:root,input:pixels,timeout:10000});}catch(e){fs.writeFileSync(path.join(out,'semantic-material-failure-image-error.txt'),String(e));}}
check('semantic material gate failed',false,{pass:a.key,paper});}
 // an authored gesture's contact past its area is counted; a pass the ladder fills is clipped to its shape, so its
 // brush overhanging the area's edge lays nothing there and is not a fault
 if(!a.pass.edges.overlap&&a.pass.source==='authored'){const own=ctx.AREA_PLAN.doc.areas.indexOf(a.area),over=contact.cells.filter(i=>contact.primaryMask[i]&&ctx.AREA_PLAN.owner[Math.floor(i/target.w/SC)*w+Math.floor(i%target.w/SC)]!==own&&!target.resist?.[i]).length;check('unplanned contact overlap',!over,{pass:a.key,cells:over});}}
 const brushPhysicalBefore=semanticBrushObservation(b),requestedContact={loadedcontact:num('loadedcontact',0),semanticBridge:a?semanticTechnique(a,{}).bridge:null};
 const result=withReserveClip(target,[...new Set([...reserveHits,...authoredHits])],setClip,()=>AREA_EXEC.command('physical brush stroke',{numericalChargeState:continuation??{shapeKey:ctx.AREA_NUMERIC_SEQUENCE?.shapeKey??null,role:'declared pass start/contact; original material gate'},brushPhysicalBefore,requestedContact,geometry:points,gestureId:points[0]?.gestureId??null,authoredGeometry:a?.pass.source==='authored',contactModel:b.model??'row',contactExecution:b.model==='tuft'?'CPU tuft contact; ordinary GPU sheet physics when backend supports it':'existing row contact',options,paper,sealedFilmCells:contact.cells.filter(i=>target.resist?.[i]===1&&(target.resistStrength?.[i]??1)===1).length,brush:load,pigmentLoaded:paint,materialContact:{...materialContact,cells:undefined,conservativeCells:undefined},conservativePaper:measurePaper(target,materialContact.conservativeCells),contactParts:contactParts(),primaryCells:contact.cells.filter(i=>contact.primaryMask[i]),targetSurface:target===ctx.sheet?'scene':'calibration-or-other',semanticIntent:a?.area.intent??'UNASSIGNED',passIntent:a?.pass??null},()=>{const body=a&&paint&&target===ctx.sheet&&a.pass.source==='authored'&&b.model==='tuft'?observeFreeFilmStroke(b,options,o=>physicalStroke(b,target,points,o),{required:a.pass.load.requireFreeFilm===true}):null;const value=body?body.value:physicalStroke(b,target,points,options);if(body)JSONL.append(path.join(out,'semantic-commands.jsonl'),JSON.stringify({kind:'semantic-free-film-body',areaId:a.area.id,passId:a.key,gestureId:points[0]?.gestureId,...body.evidence})+'\n');if(a&&paint&&target===ctx.sheet&&!fs.existsSync(path.join(out,'semantic-first-pigment-contact.ppm'))){const pixels=render();fs.writeFileSync(path.join(out,'semantic-first-pigment-contact.ppm'),Buffer.concat([Buffer.from('P6\n'+W2+' '+H2+'\n255\n'),Buffer.from(pixels)]));fs.writeFileSync(path.join(out,'semantic-first-pigment-contact.json'),JSON.stringify({kind:'actual native first scene pigment contact; not completed pass or quality acceptance',areaId:a.area.id,passId:a.key,backend:GPU_INFO,target:ctx.AREA_PLAN.doc.target,view:ctx.AREA_PLAN.doc.view??null,sourceCode:codeHash(root,[ENTRY_FILE,path.join(root,'tools/painter/semantic-areas.mjs'),path.join(root,'tools/painter/semantic-brush-observation.mjs')]),requestedContact,brushPhysicalBefore,brushPhysicalAfter:semanticBrushObservation(b),paper,materialContact:{...materialContact,cells:undefined,conservativeCells:undefined}},null,2));}if(a)JSONL.append(path.join(out,'semantic-commands.jsonl'),JSON.stringify({kind:'semantic-consumption',areaId:a.area.id,passId:a.key,brushBefore:load,brushAfter:measureBrush(b),brushPhysicalBefore,brushPhysicalAfter:semanticBrushObservation(b)})+'\n');if(body&&a.pass.load.requireFreeFilm===true&&!body.evidence.ready){fs.writeFileSync(path.join(out,'semantic-free-film-failure.ppm'),Buffer.concat([Buffer.from('P6\n'+W2+' '+H2+'\n255\n'),Buffer.from(render())]));check('authored connected free-film threshold failed',false,{pass:a.key,...body.evidence});}return value;}));
 if(a&&paint&&a.pass.source!=='authored')for(const i of contact.cells)if(contact.primaryMask[i])ctx.VALUE_PIGMENT_CONTACT.add(i);
 if(a&&paint&&!a.productionLegacyDetail&&ctx.AREA_NUMERIC_SEQUENCE?.key===a.key)ctx.AREA_NUMERIC_SEQUENCE.history.push({id:AREA_EXEC.records.at(-1).id,status:'executed',shapeKey:ctx.AREA_NUMERIC_SEQUENCE.shapeKey,primary:new Set(contact.cells.filter(i=>contact.primaryMask[i]))});
 if(a&&paint&&target===ctx.sheet&&!a.productionLegacyDetail&&ctx.AREA_NUMERIC_SEQUENCE?.key===a.key&&num('numericcontactstop',0)&&!ctx.AREA_NUMERIC_CONTACT_STOP)ctx.AREA_NUMERIC_CONTACT_STOP={commandId:AREA_EXEC.records.at(-1).id,areaId:a.area.id,passId:a.key,shapeKey:ctx.AREA_NUMERIC_SEQUENCE.shapeKey,geometry:points,primaryCells:contact.cells.filter(i=>contact.primaryMask[i]),pixels:Buffer.from(render())};
 return result;
};
const pencilDraw=(target,gs,pigment,options)=>{
 const recorded=num('recordgraphite',0)>0||!!opt('preparationbinding','');
 const execute=strokes=>drawMaterial(target,strokes,new Float32Array(target.n).fill(.25),target.w,target.h,{medium:opt('graphiteprofile',REQUESTED_DRAW_MEDIUM.startsWith('graphite-')?REQUESTED_DRAW_MEDIUM:'graphite-HB'),stage:ctx.AREA_DRAW_STAGE,mmPerCell:num('sheetmm', DEFAULT_SHEET_MM)/target.w,state:DRAW_MATERIAL_STATE[ctx.AREA_DRAW_STAGE],caps:drawingCapsFor(ctx.AREA_DRAW_STAGE,true),O,audit:PEN_STATE_AUDIT,graphiteOptions:options,
  ...(recorded?{graphiteExecute:(sh,paths,k,profileOptions)=>recordGraphiteBatch({sheet:sh,strokes:paths,pigment:k,options:{...profileOptions,seed:options.seed},material:SHEET_PIGS[k],source:{binding:opt('preparationbinding','')||null,target:opt('image',''),guide:opt('penpencil',''),drawing:opt('drawingfile',''),frame:[target.w,target.h],sheetWidthMm:num('sheetmm', DEFAULT_SHEET_MM)},execute:physicalPencilDraw,observe:measurePaper,record:r=>JSONL.append(path.join(out,'preparation-graphite.jsonl'),JSON.stringify(r)+'\n')})}: {})});
 if(!ctx.AREA_PLAN)return execute(gs);
 let cells=0;for(const g of semanticDrawingGroups(ctx.AREA_PLAN,gs,ctx.AREA_DRAW_STAGE,SC)){AREA_EXEC.set({area:g.area,key:g.key});const r=AREA_EXEC.command('actual dry graphite',{geometry:g.gesture.points,options,drawingRole:g.area.drawingRole,material:GRAPHITE_PROFILE},()=>execute([g.gesture]));cells+=r.cellsLaid??r.cells??0;}AREA_EXEC.set(null);return {cellsLaid:cells};};

if(VALUE_ENABLED){
 if(MOD||MIXES||FINISH_FILE||opt('curls','0')!=='0'||num('bgfirst',0)>0)throw Error('value planner cannot combine with independent modulation/mixes/finish/curls/bgfirst adapters; use --order legacy-painter for legacy replay');
 const shaped=num('shapedmarks',0)>0;
 if (opt('furreserves','')) {
  const reserves=furLightReserves({D:ctx.SRC,w,h},JSON.parse(opt('furreserves')));
  ctx.HOLD=Uint8Array.from(reserves,(v,i)=>v||(ctx.HOLD?.[i]??0)?1:0);ctx.FUR_HOLD=reserves;
  fs.writeFileSync(path.join(out,'fur-reserves.json'),JSON.stringify({cells:reserves.reduce((a,v)=>a+v,0),settings:JSON.parse(opt('furreserves')),stage:'planned before paint'}));
 }
 const DETAIL_SEG = num('detailseg',0)>0 && opt('image','') ? await (async () => { const { hasSegments, loadSegments } = await import('../../src/crop/segments.mjs'); const b = path.basename(opt('image',''), path.extname(opt('image',''))); return hasSegments(b) ? loadSegments(b, w, h) : null; })() : null;
  const valueOptions={paperRule:PAPER_RULE,calibratedPlan:CALIBRATED_PLAN,ownSwatch:true,smallLightMax:num('smallmarklights',120),detailScale:num('detailscale',0),detailSegments:DETAIL_SEG,layerLocal:num('layerlocal',0)>0,smallMarks:num('smallmarks',0)>0,smallIsolationMm:num('smallisolation',0),washJoin:num('washjoin',0)>0,bandRound:num('bandround',0)>0,valueFloor:opt('valuefloor','')||null,strokePlan:num('strokeplan',0)>0,laneMm:opt('lanemm','')==='auto'?0:num('lanemm',6),laneAdapt:num('laneadapt',0)>0,strokeMm:num('strokemm',30),washReachMm:num('washreach',0),edgeWobbleMm:num('edgewobble',0),shadowThresh:num('shadowthresh',.38),shadowWater:num('shadowwater',0),skyOneLayer:num('skyonelayer',0)>0,minShapeCells:num('minshapecells',0),cellFamilies:num('cellfamilies',VALUE_CONFIG?.view?.wholeOf?1:0)>0,paperRel:num('paperrel',0)>0,paperLights:num('paperlights',0)>0,paperDelta:opt('paperdelta','')?num('paperdelta',10):null,accentShare:num('accentshare',0),accentMin:num('accentmin',.55),layerSmoothMm:num('layersmooth',2),styleGain:num('stylegain',1),skySplit:num('skysplit',0)>0,layerTexture:num('layertexture',0)>0,edgeFadeMm:num('edgefade',0),layerHue:num('layerhue',0)>0,layers:num('midlayers',0),layerIncrement:num('layerincrement',0)>0,pigShare:num('pigshare',0),hueChroma:num('huechroma',0),hueChromaLab:num('huechromalab',0)>0,shadowFamilies:num('shadowfamilies',0)>0,passCap:num('passcap',0),carryMm:num('carrymm',0),holeFill:num('holefill',0),keepMask:num('carrykeep',0)>0,maskMm:num('maskmm',0),paleLights:num('palelights',0),lightFamilies:num('lightfamilies',0)>0,laneMax:num('lanemax',0),nestedBands:num('nestedbands',CALIBRATED_PLAN?1:0)>0,cellLight:num('celllight',CALIBRATED_PLAN?1:0)>0,massTone:num('masstone',CALIBRATED_PLAN?1:0)>0,nested:num('nestedmid',0)>0,midDomains:num('middomain',1)>0,brushChoice:num('brushchoice',0)>0,shaped,pigments:PIGS,subject:VALUE_CONFIG?.subject,styleSelection:VALUE_CONFIG?.styleSelection,demand:ctx.AL,k:PIGS.length,density:ctx.SRC,w,h,rgb:ctx.px,paperRGB,hold:ctx.FUR_HOLD,paleHold:WHITE_HOLD,families:VALUE_CONFIG?.families??MAJOR_INTENT?.families??[],reserves:VALUE_CONFIG?.reserves??[],smallestBrushMm:smallestBrushMm(JSON.parse(fs.readFileSync(path.join(root,opt('brushes','src/paint/brushes.json')),'utf8'))),sheetWidthMm:num('sheetmm', DEFAULT_SHEET_MM)};

 const valueStarted=performance.now();
 if(SPEED_VALUE_CACHE){
  const saved=await cachedStep({...RUN_CACHE,name:'value-plan',code:CODE_HASH,track:optTrack,inputs:valueOptions},async()=>({plan:planLightToDark(valueOptions),demand:valueOptions.demand}));
  ctx.VALUE_PLAN=saved.value.plan;
  // The cached demand is restored on a hit, so a plan step that rewrites it stays reproducible.
  if(saved.cached)valueOptions.demand.set(saved.value.demand);
 }else ctx.VALUE_PLAN=planLightToDark(valueOptions);
 SPEED_PROFILE?.add('setup:value-plan',performance.now()-valueStarted);
 ctx.layers=ctx.VALUE_PLAN.layers;ctx.steps=5;
 // --washsession 2: within each band step, a region's pigment passes follow one another, so its wash is charged with
 // all its pigments in one wet session (the planner lists them pigment by pigment).
 if(WASH_SESSION>1){const step=l=>l.shapes[0]?._valuePlan?.id?.split('/')[1]??String(l.value),first=new Map();ctx.layers.forEach((l,i)=>{const g=step(l)+'|'+l._valuePhase;if(!first.has(g))first.set(g,i);});
  ctx.layers=ctx.layers.map((l,i)=>({l,i,g:first.get(step(l)+'|'+l._valuePhase),r:l._order?.region??0})).sort((a,b)=>a.g-b.g||(a.l._valuePhase==='shadow'?a.i-b.i:a.r-b.r||a.l.pigment-b.l.pigment||a.i-b.i)).map(q=>q.l);}
 // --darkfirst: shadow-phase layers (shadow glazes, deep accents) before the middle layers, light first still
 if(num('darkfirst',0)>0){const ph=l=>l._valuePhase==='light'?0:l._valuePhase==='shadow'?1:2;ctx.layers=ctx.layers.map((l,i)=>({l,i})).sort((a,b)=>ph(a.l)-ph(b.l)||a.i-b.i).map(q=>q.l);console.log('darkfirst: '+ctx.layers.map(l=>l._valuePhase[0]).join(''));}
 const seams=ctx.layers.filter(l=>l.value===1).flatMap(l=>l.shapes.flatMap(sh=>unsupportedAxisEdges(sh.mask,w,h,ctx.px).map(edge=>({pass:sh._valuePlan.id,...edge}))));
 const baseMass=new Float32Array(n);for(const l of ctx.layers.filter(l=>l.value===1))for(const sh of l.shapes)for(let y=sh.box.y0;y<=sh.box.y1;y++)for(let x=sh.box.x0;x<=sh.box.x1;x++){const i=y*w+x;if(sh.ids[i]===sh.id)baseMass[i]+=(sh.graded?sh.graded[i]:sh.amount);}
 let warm=0,warmPainted=0;for(let i=0;i<n;i++)if(ctx.px[3*i]-ctx.px[3*i+2]>18&&ctx.px[3*i+1]-ctx.px[3*i+2]>8){warm++;if(baseMass[i]>0)warmPainted++;}
 fs.writeFileSync(path.join(out,'value-region-check.json'),JSON.stringify({source:ctx.VALUE_PLAN.regions.source,band1UnsupportedAxisEdges:seams,regionCount:ctx.VALUE_PLAN.regions.regions.length,regions:ctx.VALUE_PLAN.regions.regions,warmTargetCells:warm,warmCellsWithPositiveBand1Pigment:warmPainted,physicalReserve:'same target-white mask as compiled plan'},null,2));
 // A line-only checkpoint never executes these wash masks. Keep their diagnostic
 // in value-region-check.json, but do not reject a valid drawing because an
 // unused wash plan failed its seam check. Full paintings still fail closed.
 if(seams.length && num('drawingonly',0)===0)throw Error('compiled band-1 mask contains unsupported axis-aligned seams');
 // --subjectorder s (0..1): the plan's subjectOrder brought on subject by subject, light to dark within each, held back
 // by s (src/paint/methods/subject-order.mjs). 0, the default, keeps the whole-sheet bands.
 {const so=num('subjectorder',0);if(!(so>=0&&so<=1))throw Error('--subjectorder: a number from 0 to 1');
  const field=VALUE_CONFIG?.subjectOrder?subjectField({subjectOrder:VALUE_CONFIG.subjectOrder,families:VALUE_CONFIG.families??[],labels:ctx.VALUE_PLAN.regions.labels,w,h}):null;
  if(so>0&&!field)console.log('subject order: the plan names no subjectOrder; whole-sheet bands kept');
  const r=orderBySubject(ctx.layers,{field,strength:so,w,n,seam:num('subjectseam',0)});
  if(r.summary){ctx.layers=r.layers;fs.writeFileSync(path.join(out,'subject-order.json'),JSON.stringify({strength:so,overlap:OVERLAP,subjects:r.summary,passes:r.order},null,1));
   {const pal=[[230,159,0],[86,180,233],[0,158,115],[240,228,66],[0,114,178],[213,94,0],[204,121,167],[120,120,120]],img=Buffer.alloc(n*3);for(let i=0;i<n;i++){const c=pal[field.rank[i]%pal.length];img[3*i]=c[0];img[3*i+1]=c[1];img[3*i+2]=c[2];}await sharp(img,{raw:{width:w,height:h,channels:3}}).png().toFile(path.join(out,'subject-order.png'));}
   console.log(`subject order ${so}: ${ctx.layers.length} passes; ${r.summary.map(q=>`${q.subject} ${(100*q.share).toFixed(0)}% passes ${q.first}-${q.last}`).join(', ')}`);}}
 // --charge 1 (src/paint/methods/charge-layers.mjs): a region's middle layers laid in one wet session, darker into lighter.
 if(num('charge',0)>0){ctx.layers=chargeOrder(ctx.layers);console.log('charge: middle layers of each region laid wet into its first layer');}
 ctx.HOLD=ctx.VALUE_PLAN.protectedCells;
 fs.writeFileSync(path.join(out,'value-plan.json'),JSON.stringify({stage:'executable target-value plan before physical instruments',style:ctx.VALUE_PLAN.style,target:opt('image'),caps:[.16,.32,.50,.75,1],peakDensity:ctx.VALUE_PLAN.value.peak,geometry:ctx.VALUE_PLAN.geometry,omittedReservedOrSpeckDemand:ctx.VALUE_PLAN.omittedDemand,lights:ctx.VALUE_PLAN.lightShapes,explicitLights:VALUE_CONFIG?.reserves??[],passes:ctx.VALUE_PLAN.instructions,drawing:'sparse structure first; lighter selective closing ink after dry gate'},null,2));
 // --valuemaps 1: the value plan as maps for diagnosis (value band per cell, colour region, reserved lights) and every
 // passage's cells in paint order, to value-maps.json.gz. Read by nothing in the painter.
 if(num('valuemaps',0)>0){const caps=[.16,.32,.50,.75,1],vv=ctx.VALUE_PLAN.value.values,band=Array.from(vv,v=>v<=0?0:caps.findIndex(t=>v<=t)+1||5);
  const passes=ctx.layers.flatMap((l,L)=>l.shapes.map(sh=>{const m=sh.mask,cells=[];if(m)for(let i=0;i<n;i++)if(m[i])cells.push(i);return {L,id:sh._valuePlan?.id??null,phase:l._valuePhase??null,value:l.value,pigment:l.pigment,amount:sh.amount,area:sh.area,cells};}));
  fs.writeFileSync(path.join(out,'value-maps.json.gz'),zlib.gzipSync(JSON.stringify({w,h,caps,band,value:Array.from(vv,v=>+v.toFixed(3)),labels:Array.from(ctx.VALUE_PLAN.regions.labels),protected:Array.from(ctx.VALUE_PLAN.protectedCells),passes})));}
 console.log(`target values: ${ctx.layers.length} pigment/region passes, ${ctx.VALUE_PLAN.instructions.length} connected shapes; five light-to-dark bands; shadows never split by region`);
 if(num('valuepreviewonly',0)){
  const preview=await writeValuePreview({plan:ctx.VALUE_PLAN,out,w,h,pigments:PIGS,paperRGB,target:path.resolve(root,opt('image')),photo:VALUE_CONFIG?.photo,subject:VALUE_CONFIG?.subject??'subject',name:VALUE_CONFIG?.name,root,opening:opt('drawingfile',''),closing:opt('drawinglast',''),variant:opt('valuevariant','lighttodark'),version:opt('valueversion','W4'),sheetMm:num('sheetmm', DEFAULT_SHEET_MM)});
  fs.writeFileSync(path.join(out,'compile-result.json'),JSON.stringify(preview,null,2));console.log('CPU preview',preview.board,preview.seconds);
  const values=await writePlanValueCheck({plan:ctx.VALUE_PLAN,out,w,h,pigments:PIGS,paperRGB,rgb:ctx.px});
  console.log(`plan values: dark share ${values.plan.darkShare} (target ${values.target.darkShare}), mean L* ${values.plan.meanL} (${values.target.meanL}), L5 ${values.plan.L5} (${values.target.L5}), paper share ${values.plan.paperShare} (${values.target.paperShare})`);
  process.exit(0);
 }
}
phaseMark('plan');
const SC = num('scale', 1), W2 = w * SC, H2 = h * SC, N2 = W2 * H2; ctx.W2 = W2;
ctx.VALUE_OWN_CONTACT.reserve(N2); ctx.VALUE_PIGMENT_CONTACT.reserve(N2);
// --brushfloor 1: a graded wash runs as one stroke, recharged every --floorchunk px at 1086 wide (default 24). On with --physical.
// Without it the wash is lifted and recharged every --gradedchunk cells (default 6).
// --physical 1 (src/paint/brushes.json, src/paint/methods/brushes.mjs): brushes from a physical sheet and real brushes
const PB = loadPhysical({ root, opt, num, W2, H2 }); ctx.PB = PB;
if (PB) console.log(`physical: picture ${PB.mm.toFixed(0)} mm wide, ${PB.mmPerCell.toFixed(3)} mm a cell; ${PB.summary()}`);
const GFLOOR = num('brushfloor', 0) > 0 || !!PB;
const GCHUNK = GFLOOR ? Math.max(num('gradedchunk', 6), num('floorchunk', 24) * W2 / 1086) : num('gradedchunk', 6);
// --paperfibres, --papertooth: shares of the relief that are fibre and tooth; --toothscale: tooth coarseness.
// --papershade: how much the bare sheet's relief shows in its own tone. Default 0.04.
// --paperscan file: paper height from a grey height map, tiled, one scan pixel to --paperscanscale cells (src/media/paper-scan.mjs).
// --paper coldpress (default): cold-press tooth at physical size in mm (coldPressField); any other value keeps the value-noise tooth.
// --cpbump min,max: bump diameters in mm; --cpcover: how crowded; --cpswell: broad swells.
const CP_MM = opt('paper', 'coldpress') === 'coldpress' ? (PB ? PB.mmPerCell : num('sheetmm', DEFAULT_SHEET_MM) / W2) : 0;
// --paperphysical 0|1: fibre lengths, density and brush relief in millimetres. Default 1.
const PAPER_PHYSICAL_MM = num('paperphysical', 1) > 0 ? (PB ? PB.mmPerCell : num('sheetmm', DEFAULT_SHEET_MM) / W2) : 0;
const PAPER_OPTS = { ...(PAPER_PHYSICAL_MM > 0 ? { mmPerCell: PAPER_PHYSICAL_MM } : {}), seed: 9, scale: SC, toothScale: num('toothscale', 0.2), fibres: num('paperfibres', 0.5), tooth: num('papertooth', 0.5), proudBlur: num('proudblur', 1),
  ...(CP_MM ? { coldPress: { mmPerCell: CP_MM, bumpMm: (opt('cpbump', '0.5,2')).split(',').map(Number), cover: num('cpcover', 2.2), swell: num('cpswell', 0.3), ...(num('cppits', 0) > 0 ? { pits: num('cppits', 0) } : {}) } } : {}) }; ctx.PAPER_OPTS = PAPER_OPTS;
// --cppits p: share of cold-press bumps that are pits, so settled paint gathers in them as dark grains. Default 0.
if (CP_MM) console.log(`paper: cold press at ${CP_MM.toFixed(3)} mm a cell, bumps ${opt('cpbump', '0.5,2')} mm, tooth ${num('papertooth', 0.5)} of the height`);
const paper = opt('paperscan', '') ? await (async () => {
  const { scanPaper } = await import('../../src/media/paper-scan.mjs');
  const file = path.resolve(root, opt('paperscan', ''));
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const scan = { data: info.channels === 1 ? data : Uint8Array.from({ length: info.width * info.height }, (_, i) => data[i * info.channels]), width: info.width, height: info.height };
  console.log(`paper: scanned height from ${opt('paperscan', '')} (${info.width}x${info.height}), ${num('paperscanscale', 1)} cells a scan pixel, mix ${num('paperscanmix', 1)}`);
  return scanPaper(W2, H2, scan, { ...PAPER_OPTS, scanScale: num('paperscanscale', 1), scanMix: num('paperscanmix', 1) });
})() : (await cachedStep({...RUN_CACHE,name:'paper',code:codeHash(root,[],{dependencies:['src/media/paper.mjs']}),track:optTrack,inputs:{W2,H2,PAPER_OPTS}},async()=>makePaper(W2,H2,PAPER_OPTS))).value;
// --physics key=value,...: override any sheet constant (src/media/sheet.mjs DEFAULTS)
const PHYS = Object.fromEntries((opt('physics', '') || '').split(',').filter(Boolean).map(kv => { const [k, v] = kv.split('='); if (!(k in DEFAULTS) && k !== 'edgeFlowDepth') throw new Error(`--physics: no sheet constant ${k}`); return [k, Number(v)]; }));
// --gran: granulation strength, default 0.25. The relief never changes, so every sweep lays the same pattern and it compounds.
ctx.sheet = createSheet(paper, SHEET_PIGS); ctx.sheet._tape = 1;
// WET_TRACE_PIGMENT=1 also records the whole sheet's pigment change under each stroke (slow: a full-sheet read per stroke)
ctx.WET_TRACE = process.env.WET_TRACE ? createWetTrace({ file: process.env.WET_TRACE, sheet: ctx.sheet, contact: candidateContact, pigment: process.env.WET_TRACE_PIGMENT === '1' ? () => thicknessTotals(ctx.sheet).reduce((a, v) => a + v, 0) : null }) : null;
if (ctx.WET_TRACE) process.once('exit', () => ctx.WET_TRACE.close());
// --probebox x0,y0,x1,y1[;...] (sheet fractions, diagnostic): paint only inside the boxes; compare only with a crop run of the same boxes.
// --ablate dry,accents: skip those passes (diagnostic).
const PROBE = opt('probebox', '') ? (() => {
  const m = new Uint8Array(n);
  for (const b of opt('probebox').split(';')) { const [x0, y0, x1, y1] = b.split(',').map(Number); for (let y = Math.floor(y0 * h); y < Math.min(h, Math.ceil(y1 * h)); y++) for (let x = Math.floor(x0 * w); x < Math.min(w, Math.ceil(x1 * w)); x++) m[y * w + x] = 1; }
  const clip = new Uint8Array(W2 * H2); for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) clip[y * W2 + x] = m[((y / SC) | 0) * w + ((x / SC) | 0)];
  return { m, clip };
})() : null;
if (PROBE) setClip(ctx.sheet, PROBE.clip);
const ABLATE = new Set(opt('ablate', '').split(',').filter(Boolean));
// --inkres N: the pens draw on their own sheet at N times the resolution and the output is N times as wide
// (src/paint/methods/ink-res.mjs). Default 1, off. Cannot combine with --paperscan.
// --inkresgain: the fine pen's ink strength; the default is a power-law fit in sheet width.
const INKRES = num('inkres', 1) > 1 ? await (async () => { if (opt('paperscan', '')) throw new Error('--inkres: not with --paperscan'); const N=Math.round(num('inkres',1)),opts={...PAPER_OPTS,scale:(PAPER_OPTS.scale??1)*N};const finePaper=(await cachedStep({...RUN_CACHE,name:'fine-paper',code:codeHash(root,[],{dependencies:['src/media/paper.mjs']}),track:optTrack,inputs:{W2:W2*N,H2:H2*N,PAPER_OPTS:opts}},async()=>makePaper(W2*N,H2*N,opts))).value; return makeInkRes({paper:finePaper, N: num('inkres', 1), W2, H2, paperOpts: PAPER_OPTS, pigments: SHEET_PIGS, inkAt: PIGS.length, main: ctx.sheet, pad: opt('inkrespad', '') === '' ? null : num('inkrespad', 0.25) * (Math.round(num('inkres', 1)) - 1), gain: num('inkresgain', 1.3 * Math.pow(540 / W2, 0.78)) }); })() : null;
const PEN_STATE_GATE = true, PEN_STATE_AUDIT = [];

const TARGET_EDGE_FILL=new Float32Array(N2);
for(let y=1;y<H2-1;y++)for(let x=1;x<W2-1;x++){const i=y*W2+x;const lum=j=>{const sx=Math.min(w-1,Math.floor((j%W2)*w/W2)),sy=Math.min(h-1,Math.floor(Math.floor(j/W2)*h/H2)),k=3*(sy*w+sx);return (ctx.px[k]+ctx.px[k+1]+ctx.px[k+2])/765;};TARGET_EDGE_FILL[i]=Math.min(1,Math.hypot(lum(i+1)-lum(i-1),lum(i+W2)-lum(i-W2)));}
// planning reads it freely; the pen's closures keep it, so it is sealed here for the paint step (tools/guard/seal-maps.mjs)
const TARGET_DRAW_EDGE=sealAtBirth(ctx.TARGET_GUARD,'TARGET_DRAW_EDGE',TARGET_EDGE_FILL);
// The pen cuts closing runs where the target edge is weak when it plans them (pen.mjs, prepareDrawing); it lays the
// planned runs with no edge map (edgeCut false), so execution reads no target.
const DRAW_MATERIAL_STATE={opening:{used:0},closing:{used:0}};
// Use one policy in planning and execution. The source's own ink is drawn with its short descriptive marks when the
// plan says the target is drawn in pen: a pen-and-wash style, an ink medium in its drawing section, or a prepared line
// file of the target's pen lines (--drawingfile). A painted target with no such plan keeps the sparse caps, since the
// separator also finds "ink" in dark painted edges (foliage, windows) that were never pen lines. --sourceink 0|1
// overrides. CLI limits override both.
const sourceInkDrawing = () => OUTLINE.medium === 'ink' && (opt('sourceink', '') !== '' ? num('sourceink', 0) > 0
  : ctx.VALUE_PLAN?.style?.name === 'ink-and-wash' || VALUE_CONFIG?.drawing?.medium === 'ink' || !!opt('drawingfile', ''));
const drawingCapsFor = (stage, graphite = false) => {
 const defaults = sourceDrawingCaps({medium:graphite?'graphite-HB':opt('inkprofile',STYLE_INK_DEFAULT),stage,sourceInk:sourceInkDrawing()&&(stage==='opening'||!!opt('drawinglast','')),plannedDrawing:!!opt(stage==='closing'?'drawinglast':'drawingfile','')});
 return {lines:num(stage+'lines',defaults.lines),pressure:graphite&&stage==='opening'&&STAGE_PLAN?.files.prep?num('preppressure',1):num(stage+'pressure',defaults.pressure),
  ...(stage==='opening'?{minLengthMm:num('openingminmm',defaults.minLengthMm)}:{edgeMin:num('closingedgemin',defaults.edgeMin)})};
};
// --inkdarkmatch c (default 0 off): before a pen stage's first ink, a sample of its real strokes is drawn on a blank
// sheet of the painting's size and read as the target's lines were read; the ink load is then scaled, up or down, so
// they come out c times as dark as the target's lines (src/paint/methods/ink-match.mjs). Planning reads only the
// target's measures from ink-lines.json, never its pixels. Written to ink-dark-match.json.
const INK_MATCH={};
function inkDarkMatch(stage,gs,optionsAt,want,w,h){
 if(INK_MATCH[stage])return INK_MATCH[stage].factor;
 const A=ctx.INK_LINES?.[stage]?.stats?.peakAbsorbance;
 if(!(A>0)){INK_MATCH[stage]={factor:1,why:'no measured target lines for this stage'};console.log(`ink dark match, ${stage}: no measured target lines, load unchanged`);return 1;}
 const sample=sampleGestures(gs,60), N=INKRES?.N??1, fw=w*N, fh=h*N;
 const baseOpts=(()=>{const {edgeStrength,state,audit,O:o,...rest}=optionsAt(1);return rest;})();
 const r=cachedStepSync({...RUN_CACHE,name:`ink-dark-match-${stage}`,code:codeHash(root,[],{dependencies:['src/paint/methods/ink-match.mjs','src/paint/methods/fine-material.mjs','src/paint/methods/material-profiles.mjs','src/media/draw.mjs','src/media/pen.mjs']}),track:optTrack,inputs:{stage,A,sample,N,w,h,PAPER_OPTS,INK,baseOpts,...(INKRES?{}:{want})}},()=>{
  const paper=INKRES?INKRES.fine.paper:makePaper(w,h,PAPER_OPTS);
  if(paper.w!==fw||paper.h!==fh)throw Error('Ink calibration paper dimensions differ');
  const absorbance=sampledInkAbsorbance(fw,fh,N>1?fineGestures(sample,N):sample);
  const scrap=createSheet(paper,[INK]);
  scrap._tapePigmentMap={count:SHEET_PIGS.length,indices:[PIGS.length]};
  const measure=f=>{
   scrap.W.fill(0);scrap.s.fill(0);scrap.M.fill(0);scrap.ever.fill(0);scrap.G[0].fill(0);scrap.P[0].fill(0);scrap.D[0].fill(0);scrap.layers.length=0;
   certifyZeroPaper(scrap);
   const options=optionsAt(f), ink=INKRES?INKRES.remapInk(options.ink):[options.ink[PIGS.length]];
   if(INKRES)drawOnFineSheet(scrap,N,sample,{w,h,...options,ink});
   else drawMaterial(scrap,sample,want,w,h,{...options,ink});
   return absorbance(scrap);
  };
  const res=matchInkLoad({targetAbsorbance:A,cap:num('inkdarkmatch',0),measure});
  console.log(`ink dark match, ${stage}: target lines ${A.toFixed(2)} absorbance; ${sample.length} of the stage's strokes on a blank sheet read ${res.before.toFixed(2)}, so the load is scaled by ${res.factor.toFixed(3)} (now ${res.after.toFixed(2)})`);
  return res;
 }).value;
 INK_MATCH[stage]={...r,target:A,sample:sample.length};
 fs.writeFileSync(path.join(out,'ink-dark-match.json'),JSON.stringify(INK_MATCH,null,1)+'\n');
 return r.factor;
}
const penDraw = (sh,gs,want,w,h,o0) => {
 const stage=ctx.AREA_DRAW_STAGE, graphite=o0.ink?.[GRAPHITE_AT]>0, inkAt=PIGS.length;
 const withLoad=f=>({...o0,ink:o0.ink.map((v,j)=>j===inkAt?v*f:v)});
 const matched=!graphite&&INK&&num('inkdarkmatch',0)>0&&o0.ink?.[inkAt]>0;
 const o=matched?withLoad(inkDarkMatch(stage,gs,f=>({...withLoad(f),medium:opt('inkprofile',REQUESTED_DRAW_MEDIUM.endsWith('-ink')?REQUESTED_DRAW_MEDIUM:STYLE_INK_DEFAULT),stage,mmPerCell:(PB?.mm??num('sheetmm', DEFAULT_SHEET_MM))/w,edgeStrength:null,edgeCut:false,state:{used:0},caps:drawingCapsFor(stage,false),audit:[],allowStarvation:num('penstarve',0)>0,dryInk:true,O:undefined,widthFloorMm:INK_WIDTH_FLOOR_MM,pen:{...o0.pen,damp:INK_DAMP}}),want,w,h)):o0;
  const execute=paths=>{const options={...o,medium:graphite?opt('graphiteprofile',REQUESTED_DRAW_MEDIUM.startsWith('graphite-')?REQUESTED_DRAW_MEDIUM:'graphite-HB'):opt('inkprofile',REQUESTED_DRAW_MEDIUM.endsWith('-ink')?REQUESTED_DRAW_MEDIUM:STYLE_INK_DEFAULT),stage,mmPerCell:(PB?.mm??num('sheetmm', DEFAULT_SHEET_MM))/w,edgeStrength:null,edgeCut:false,state:DRAW_MATERIAL_STATE[stage],caps:drawingCapsFor(stage,graphite),audit:PEN_STATE_AUDIT,allowStarvation:num('penstarve',0)>0,dryInk:stage!=='closing'||num('finishinkdamp',0)<=0,...(graphite?{}:{widthFloorMm:INK_WIDTH_FLOOR_MM,pen:{...o.pen,damp:INK_DAMP}})};return INKRES&&!graphite?drawFineMaterial(INKRES,paths,{w,h,...options,cache:{...RUN_CACHE,code:CODE_HASH,track:optTrack}}):drawMaterial(sh,paths,want,w,h,options);};
 if(!ctx.AREA_PLAN)return execute(gs);
 let drawn=0,dips=0;for(const g of semanticDrawingGroups(ctx.AREA_PLAN,gs,stage,SC)){AREA_EXEC.set({area:g.area,key:g.key});const r=AREA_EXEC.command('physical pen gesture',{geometry:g.gesture.points,drawingRole:g.area.drawingRole,material:graphite?GRAPHITE_PROFILE:INK_PROFILE},()=>execute([g.gesture]));drawn+=r.drawn??0;dips+=r.dips??0;}AREA_EXEC.set(null);return {drawn,dips};
};
const OUT_W = INKRES ? INKRES.width : W2, OUT_H = INKRES ? INKRES.height : H2;
// --encloseease e: a dry cell held by water on more sides fills more easily (src/media/sheet.mjs). Set only when used.
const O = { ...DEFAULTS, fixedBed: num('fixedbed', 1), edgeEvap: num('edge', 0.0012), gran: num('gran', 0.25), granFill: num('granfill', 0), ...PHYS, ...(num('encloseease', 0) > 0 ? { encloseEase: num('encloseease', 0) } : {}), ...(num('slidecap', 0) > 0 ? { slideCap: num('slidecap', 0) } : {}),
  ...(num('holerim', 0) > 0 ? { holeSpan: Math.max(1, Math.round(num('holerim', 0) / (PB ? PB.mmPerCell : num('sheetmm', DEFAULT_SHEET_MM) / W2))) } : {}),
  ...(num('holefill', 0) > 0 ? { holeFill: Math.max(1, Math.round(num('holefill', 0) / (PB ? PB.mmPerCell : num('sheetmm', DEFAULT_SHEET_MM) / W2))) } : {}) };
// --holefill mm: a dry hollow the wash surrounds within mm fills where it is lower than the wet paper beside it.
// --slidecap c: settled grains rolling into hollows may not reverse the slope they rolled down (src/media/sheet.mjs).
// --holerim mm: a dry hole the wash holds on all four sides within mm dries without a dark rim.
// Each is set only when used.
// --gpu auto|on|off: sheet backend (Metal on Macs via optional `webgpu`); auto falls back to CPU. Written to backend.json.
// --layercache check: every cached layer sum and render is also worked out the plain way and compared (slow; a test)
if (opt('layercache', '') === 'check') process.env.LAYER_CACHE_CHECK = '1'; else if (opt('layercache', '') === 'off') process.env.LAYER_CACHE = '0';
// --gpustrokes 0: ordinary brush contact stays on the CPU; enabled wash splats can still use the GPU sheet.
if (opt('gpustrokes', '') === '0') process.env.GPU_STROKES = '0';
if (opt('gpujitter', '')) process.env.GPU_JITTER_MS = opt('gpujitter', ''); // test: delay each GPU stroke's posting by about this many ms
if (opt('gpusyncstrokes', '') === '1') process.env.GPU_SYNCSTROKES = '1';
if (opt('gpufullcap', '') === '1') process.env.GPU_FULLCAP = '1'; // test: every step dispatches for every tile
if (opt('nobox', '') === '1') process.env.NOBOX = '1';
if (opt('nobox', '') === 'check') process.env.CHECKBOX = '1';
if (opt('needcells', '') === '0') process.env.NEEDCELLS_OFF = '1'; // A/B: the dry-brush marks and drags read the CPU copy as it stands
if (opt('gpusums', '') === '0') process.env.GPU_SUMS = '0'; // thickness and frames from the whole sheet brought down, not from sums made on the GPU
if (opt('gpustrokes', '') === 'capdebug') process.env.GPU_STROKES = 'capdebug';
if (opt('gpustrokes', '') === 'check') process.env.GPU_STROKES = 'check'; // compare eligible ordinary GPU strokes without within-stroke flow (src/media/gpu/stroke-check.mjs)
const GPU_MODE = opt('gpu', 'auto');
if (!['auto', 'on', 'off'].includes(GPU_MODE)) throw new Error(`--gpu takes auto, on or off, not ${GPU_MODE}`);
const GPU_INFO = {...attachGpu(ctx.sheet, O, { mode: GPU_MODE }),nativePaintMode:NATIVE_PAINT_MODE};
console.log(backendLine(GPU_INFO));
const base = Buffer.alloc(N2 * 3);
const SHADE = num('papershade', 0.04);
const TONE_STAGE = TONE_MODE === '1' || (TONE_MODE === 'auto' && SHEET_TONE.toned);
fillSheetBase(base, paper.height, TONE_STAGE ? WHITE_PAPER_RGB : paperRGB, SHADE);
// --wetrender (on with --wetframes): wet paper renders darker in frames, showing where the water is.
const WETRENDER = opt('wetrender', num('wetframes', 0) > 0 ? '1' : '0') !== '0';
// the white gouache laid last (--smalllights gouache), over the washes and not in them: null until it is laid
ctx.GOUACHE = null;
const finishRGB = rgb => {
  if (WETRENDER) {
    coherent(ctx.sheet); // it reads the water, which a sheet on the GPU holds
    const cap = num('wetcap', 0.6), dark = num('wetdark', 0.14);
    for (let i = 0; i < N2; i++) { const wv = ctx.sheet.W[i]; if (wv > 1e-4) { const f = 1 - dark * Math.min(1, wv / cap); rgb[i * 3] *= f; rgb[i * 3 + 1] *= f; rgb[i * 3 + 2] *= f * 1.01; } }
  }
  const buf = Buffer.from(rgb.buffer);
  return ctx.GOUACHE ? overlay(buf, ctx.GOUACHE.cover, ctx.GOUACHE.rgb, N2) : buf;
};
// With the sheet on the GPU a render is kept with the link's change count (GpuLink.version) and the dried layers' version:
// a frame and the plan-against-sheet mark taken at the same moment render once. The CPU sheet renders every time.
ctx.RENDER_MEMO = null; ctx.RENDER_REUSED = 0; let OPTICAL_UNDER_MEMO = null;
const getOpticalUnder = (baseBuf, micro = null) => {
  const hasLower0 = ctx.sheet.layers.length > 1;
  if (hasLower0) ctx.sheet._gpu.syncLower(ctx.sheet, 1);
  const layer0 = hasLower0 ? ctx.sheet.layers[0] : null;
  const layer0Ver = layer0?._cacheVersion ?? 0;
  if (OPTICAL_UNDER_MEMO && OPTICAL_UNDER_MEMO.baseBuf === baseBuf && OPTICAL_UNDER_MEMO.micro === micro && OPTICAL_UNDER_MEMO.hasLower0 === hasLower0 && OPTICAL_UNDER_MEMO.layer0 === layer0 && OPTICAL_UNDER_MEMO.layer0Ver === layer0Ver) {
    return OPTICAL_UNDER_MEMO.under;
  }
  const under = new Float64Array(N2 * 3);
  if (hasLower0) renderCells([layer0], SHEET_PIGS.map(p => p.K), SHEET_PIGS.map(p => p.S), baseBuf, 0, N2, 1, null, null, null, under, micro);
  else for (let i = 0; i < under.length; i++) under[i] = baseBuf[i] / 255;
  under._immutable = true;
  OPTICAL_UNDER_MEMO = { baseBuf, micro, hasLower0, layer0, layer0Ver, under };
  return under;
};
const renderRaw = () => {
  const link = ctx.sheet._gpu;
  if (!link) return renderSheet(ctx.sheet, SHEET_PIGS, base, N2, 1);
  const key = `${link.version}|${ctx.sheet._layerVer || 0}|${ctx.sheet.layers.length}`;
  if (ctx.RENDER_MEMO && ctx.RENDER_MEMO.key === key) { ctx.RENDER_REUSED++; return ctx.RENDER_MEMO.rgb.slice(); }
  const rgb = (NATIVE_PAINT_MODE.mode==='fast' || SPEED_GPU_OPTICS) && link.resident && process.env.GPU_COMPOSITE==='1' && !WETRENDER && num('pencilerase',0)===0 ? (()=>{
      const link=ctx.sheet._gpu;link.initOptical(ctx.sheet,null);
      return link.opticalFrame(ctx.sheet,getOpticalUnder(base,null));
  })() : renderSheet(ctx.sheet, SHEET_PIGS, base, N2, 1);
  ctx.RENDER_MEMO = { key, rgb: rgb.slice() };
  return rgb;
};
const render = () => {const rgb=finishRGB(renderRaw());if(ctx.sheet._layerStoragePolicy)compactLowerLayers(ctx.sheet,ctx.sheet._layerStoragePolicy());return rgb;};
// Paper optics for the pictures only (view()); physics, plan feedback and the tape never see them. All off by default.
// --relief s: bare-sheet relief lit from one side, slope over 0.5 mm, mean-normalised; replaces --papershade.
// --papergrain g: a +-g/2 per-pixel grain on the paper.
// --micro a: pigment thickness moved toward the paper's hollows by 1 + a gran t (km.mjs microAmps); mass moves, none is added.
// --microcells c: scale of t in sheet cells (default 1). --renderres N: also render painting-fine.jpg at N times resolution.
const LOOK_RELIEF = num('relief', 0), LOOK_GRAIN = num('papergrain', 0), LOOK_MICRO = num('micro', 0);
const LOOK_RES = Math.max(1, Math.round(num('renderres', 1))), LOOK_MC = Math.max(0.5, num('microcells', 1));
const LOOK = LOOK_RELIEF > 0 || LOOK_GRAIN > 0 || LOOK_MICRO > 0 || LOOK_RES > 1;
const LOOK_MM = CP_MM || (PB ? PB.mmPerCell : num('sheetmm', DEFAULT_SHEET_MM) / W2);
const lookHash = i => { const q = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return q - Math.floor(q); };
const lookBase = (hgt, FW, FH, mm) => {
  const FN = FW * FH, shade = new Float32Array(FN), k = (3.5 * LOOK_RELIEF * 0.5) / mm;
  let mean = 0;
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const i = y * FW + x, h0 = hgt[i];
    const v = LOOK_RELIEF > 0 ? Math.max(0.9, Math.min(1.05, 0.985 - k * ((hgt[y * FW + Math.min(FW - 1, x + 1)] - h0) + (hgt[Math.max(0, y - 1) * FW + x] - h0)))) : 1 - SHADE + SHADE * h0;
    shade[i] = v; mean += v;
  }
  mean = LOOK_RELIEF > 0 ? mean / FN : 1;
  const b = Buffer.alloc(FN * 3);
  for (let i = 0; i < FN; i++) {
    const t = shade[i] / mean + (LOOK_GRAIN > 0 ? LOOK_GRAIN * (lookHash(i) - 0.5) : 0);
    for (let c = 0; c < 3; c++) b[i * 3 + c] = Math.min(255, paperRGB[c] * t);
  }
  return b;
};
const lookMicro = (hgt, FW, FH, sigma) => {
  const lo = gaussian(Float32Array.from(hgt), FW, FH, sigma), FN = FW * FH, t = new Float32Array(FN);
  let ss = 0; for (let i = 0; i < FN; i++) { const d = hgt[i] - lo[i]; ss += d * d; }
  const sd = Math.sqrt(ss / FN) || 1;
  let m = 0; for (let i = 0; i < FN; i++) { t[i] = Math.max(-1, Math.min(1, -(hgt[i] - lo[i]) / sd)); m += t[i]; }
  m /= FN; for (let i = 0; i < FN; i++) t[i] -= m;
  return { t, amp: microAmps(SHEET_PIGS, LOOK_MICRO) };
};
const lookUp = (a, w0, h0, N) => {
  const FW = w0 * N, FH = h0 * N, o = new Float32Array(FW * FH);
  for (let fy = 0; fy < FH; fy++) {
    const sy = (fy + 0.5) / N - 0.5, y0 = Math.max(0, Math.floor(sy)), y1 = Math.min(h0 - 1, y0 + 1), ty = Math.max(0, Math.min(1, sy - y0));
    for (let fx = 0; fx < FW; fx++) {
      const sx = (fx + 0.5) / N - 0.5, x0 = Math.max(0, Math.floor(sx)), x1 = Math.min(w0 - 1, x0 + 1), tx = Math.max(0, Math.min(1, sx - x0));
      o[fy * FW + fx] = (a[y0 * w0 + x0] * (1 - tx) + a[y0 * w0 + x1] * tx) * (1 - ty) + (a[y1 * w0 + x0] * (1 - tx) + a[y1 * w0 + x1] * tx) * ty;
    }
  }
  return o;
};
ctx.LOOK1 = null;
const view = () => {
  if (!LOOK) return render();
  ctx.LOOK1 ??= { base: LOOK_RELIEF > 0 || LOOK_GRAIN > 0 ? lookBase(paper.height, W2, H2, LOOK_MM) : base, micro: LOOK_MICRO > 0 ? lookMicro(paper.height, W2, H2, LOOK_MC) : null };
  if (ctx.sheet._gpu?.resident && process.env.GPU_COMPOSITE === '1' && num('pencilerase',0) === 0) {
    const link=ctx.sheet._gpu;link.initOptical(ctx.sheet,ctx.LOOK1.micro);
    // Only the preparatory ink can change below the immutable paint stack; keep its unrounded reflectance.
    return finishRGB(link.opticalFrame(ctx.sheet,getOpticalUnder(ctx.LOOK1.base,ctx.LOOK1.micro)));
  }
  if (ctx.sheet._gpu?.resident && process.env.GPU_OPTICS !== '0') {
    // Keeps the reference's double-precision pigment sum and KM arithmetic; only completed lower layers are cached.
    return finishRGB(renderLayersCached(layersOf(ctx.sheet), SHEET_PIGS, ctx.LOOK1.base, N2, 1, ctx.LOOK1.micro));
  }
  return finishRGB(renderLayers(layersOf(ctx.sheet), SHEET_PIGS, ctx.LOOK1.base, N2, 1, undefined, ctx.LOOK1.micro));
};
const renderFine = () => {
  const N = LOOK_RES, FW = W2 * N, FH = H2 * N, FN = FW * FH, mm = LOOK_MM / N;
  const hgt = CP_MM ? coldPressField(FW, FH, CP_MM / N, PAPER_OPTS.seed, { ...PAPER_OPTS.coldPress, mmPerCell: CP_MM / N }) : lookUp(paper.height, W2, H2, N);
  const fbase = lookBase(hgt, FW, FH, mm), micro = LOOK_MICRO > 0 ? lookMicro(hgt, FW, FH, N * LOOK_MC) : null;
  const Kp = SHEET_PIGS.map(p => p.K), Sp = SHEET_PIGS.map(p => p.S), R = new Float64Array(FN * 3), outF = new Uint8ClampedArray(FN * 3);
  for (let i = 0; i < FN * 3; i++) R[i] = fbase[i] / 255;
  const layers = layersOf(ctx.sheet);
  let mIn = 0, mOut = 0;
  layers.forEach((L, q) => {
    const fine = L.map(a => lookUp(a, W2, H2, N));
    if (micro) for (let k = 0; k < fine.length; k++) { const a = fine[k], g = micro.amp[k]; for (let i = 0; i < FN; i++) { mIn += a[i]; mOut += a[i] * (1 + g * micro.t[i]); } }
    renderCells([fine], Kp, Sp, fbase, 0, FN, 1, null, q === layers.length - 1 ? outF : null, R, R, micro);
  });
  let buf = Buffer.from(outF.buffer);
  if (ctx.GOUACHE) { const cov = lookUp(Float32Array.from(ctx.GOUACHE.cover), W2, H2, N); buf = overlay(buf, cov, ctx.GOUACHE.rgb, FN); }
  console.log(`look: painting-fine.jpg ${FW}x${FH} (${N}x, ${mm.toFixed(3)} mm a pixel), relief ${LOOK_RELIEF}, grain ${LOOK_GRAIN}, micro ${LOOK_MICRO}${micro ? ` (per paint ${micro.amp.map(v => v.toFixed(2)).join(' ')}; pigment mass after/before ${(mOut / Math.max(1e-12, mIn)).toFixed(4)})` : ''}`);
  return { buf, FW, FH };
};
if (LOOK) console.log(`look: relief ${LOOK_RELIEF}, papergrain ${LOOK_GRAIN}, micro ${LOOK_MICRO} (paints' gamma ${SHEET_PIGS.map(p => (p.gamma ?? 0).toFixed(2)).join(' ')}), renderres ${LOOK_RES}; pictures only`);

// Read-only pigment accounting, including every wet, pore, deposited and fixed reservoir.
const colourTrace = [];
const traceBox = [.12,.50,.35,.64];
const traceCells=[];
if(COLOUR_TRACE) for(let y=Math.round(traceBox[1]*h);y<Math.round(traceBox[3]*h);y++)for(let x=Math.round(traceBox[0]*w);x<Math.round(traceBox[2]*w);x++) traceCells.push(y*w+x);
function colourMass(stage, extra={}) {
 if(!COLOUR_TRACE)return;
 const held=new Array(PIGS.length).fill(0), mass=thickness(ctx.sheet,{held:true});
 for(const i of traceCells){const x=i%w,y=(i/w)|0;for(let dy=0;dy<SC;dy++)for(let dx=0;dx<SC;dx++){
 const q=(y*SC+dy)*W2+x*SC+dx;
 for(let j=0;j<PIGS.length;j++){held[j]+=mass(j,q)/(SC*SC);}
 }}
 const sum=a=>Array.from({length:PIGS.length},(_,j)=>traceCells.reduce((v,i)=>v+a[i*PIGS.length+j],0));
 colourTrace.push({stage,held,plan:sum(ctx.A),wash:sum(ctx.AL),booked:sum(expected),...extra});
}

// --brushshare s: widest brush as a share of the sheet's short side, so it keeps its size against the picture. Default 0.076.
const BRUSH = PB ? Math.max(3 * SC, Math.round(PB.washR)) : Math.max(3 * SC, Math.round(num('brushshare', 0.076) * Math.min(W2, H2)));
// --heading sweep|sheet: hold a wash brush square to its sweep (default) or to the sheet (brush.mjs, stroke's upright).
const UPRIGHT = opt('heading', 'sweep') === 'sheet' ? true : 'sweep';

// Masking fluid goes on a few deliberate lights only: large enough (--maskmin) and surrounded by paint (--maskcount largest).
const highlights = semanticHighlights(ctx.AREA_PLAN,() => {
  const pale = new Uint8Array(n);
  // --white chooses a medium; --highlightwhite is the numeric density threshold.
  for (let i = 0; i < n; i++) pale[i] = ctx.SRC[i] < num('highlightwhite', 0.05) ? 1 : 0;
  const { labels, areas, count } = components(removeSmall(openMask(pale, w, h, 1), w, h, num('maskmin', 60)), w, h);
  // the largest few, and only those the picture paints all the way round
  const enclosed = [];
  for (let id = 1; id <= count; id++) {
    if (areas[id] < num('maskmin', 60)) continue;
    let touchesEdge = false;
    for (let i = 0; i < n && !touchesEdge; i++) {
      if (labels[i] !== id) continue;
      const x = i % w, y = (i / w) | 0;
      if (x < 2 || y < 2 || x > w - 3 || y > h - 3) touchesEdge = true;
    }
    if (!touchesEdge) enclosed.push({ id, area: areas[id] });
  }
  enclosed.sort((a, b) => b.area - a.area);
  const keep = new Set(enclosed.slice(0, num('maskcount', 12)).map(e => e.id));
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (keep.has(labels[i])) m[i] = 1;
  console.log(`${enclosed.length} lights enclosed by paint, masking the largest ${Math.min(keep.size, enclosed.length)}`);
  return m;
});
ctx.masked = 0; for (let i = 0; i < n; i++) ctx.masked += highlights[i];
console.log(`masking ${(100 * ctx.masked / n).toFixed(0)}% of the sheet as reserved white`);

// What the plan says the sheet should hold at each point, so each pass is marked against its own job.
const expected = new Float32Array(n * PIGS.length);
// --deliverycal 1: at each full read of the sheet, what it holds of each pigment over what the brush was charged for
// (the ledger) sets a per-pigment charge factor for later passages (src/paint/methods/delivery-cal.mjs). Sheet against
// ledger only. --deliverycalmax caps the factor (default 1.8). Default 0: each passage is charged from its own swatch.
const DELIVERY = num('deliverycal', 0) > 0 ? createDeliveryCal(PIGS.length, { max: num('deliverycalmax', 1.8) }) : null;
const DCAL = (sh, j) => (DELIVERY ? (sh._dcal ??= DELIVERY.factors())[j] : 1);
// --techcal 1: the same, per technique (graded or not): between two reads of the sheet, what it gained over what the
// brush was charged for sets the charge factor of the technique that laid that window (src/paint/methods/technique-cal.mjs).
// Detail marks are left alone. --techcalfrom v: only passages at value band v or darker (default 4, the shadow glazes).
// --techcalmax and --techcalmin clamp the factor (default 2.5 and 0.8). Default 0.
const TECH_CAL = num('techcal', 0) > 0 ? createTechniqueCal({ max: num('techcalmax', 2.5), min: num('techcalmin', 0.8) }) : null;
const TECH_CAL_FROM = num('techcalfrom', 4);
const TCAL = (sh, T, detail, value) => {
  if (!TECH_CAL || detail) return 1;
  sh._tkey ??= `${T.name}${(sh.graded || sh._valuePlan) ? ' graded' : ''}`;
  return (sh._tcal ??= value >= TECH_CAL_FROM ? TECH_CAL.factor(sh._tkey) : 1);
};
// the plan in the sheet's units: the planned layers over the sheet before the first wash (src/eval/plan-optics.mjs)
ctx.WASH_BASE = null;
const planDensity = () => planDensityOver(expected, PIGS, paperRGB, n, ctx.WASH_BASE);
const sheetDensity = big => {
  const D = new Float32Array(n);
  const pl2 = 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let l = 0, c = 0;
    for (let dy = 0; dy < SC; dy++) for (let dx = 0; dx < SC; dx++) {
      const q = ((y * SC + dy) * W2 + x * SC + dx) * 3;
      l += 0.2126 * big[q] + 0.7152 * big[q + 1] + 0.0722 * big[q + 2]; c++;
    }
    D[y * w + x] = Math.max(0, -Math.log(Math.max(0.02, Math.min(1, l / c / pl2))));
  }
  return D;
};
// Each recorded pass is marked against the plan at once, so no full fields are kept per pass.
// The last pass's painted density is the exception: `covered`, below, reads it cell by cell.
const marks = [];
ctx.lastPainted = null;
// --asyncframes 0: render frames and marks on the painter's thread, not the frame worker (src/media/gpu/framer.mjs). Default 1.
ctx.FRAMER = null; let FRAMER_HANDED = false; let MARK_PENDING = new Map();
const PENDING_IO = [];
const framer = () => {
  if (NATIVE_PAINT_MODE.mode==='fast' || ctx.FRAMER === false || !ctx.sheet._gpu || INKRES || LOOK || ctx.GOUACHE || opt('asyncframes', '1') === '0') return null;
  if (!ctx.FRAMER) {
    if (FRAMER_HANDED) return null; // started once and stopped (a dried layer was rewritten): the painter's render from here on
    ctx.FRAMER = createFramer({ sheet: ctx.sheet, pigments: SHEET_PIGS, base, paperRGB, n: N2, w, h, W2, SC, out, quality: 88, outW: OUT_W, outH: OUT_H, wet: WETRENDER ? { cap: num('wetcap', 0.6), dark: num('wetdark', 0.14) } : null });
    FRAMER_HANDED = true;
  }
  return ctx.FRAMER.active ? ctx.FRAMER : null;
};
// every frame and mark handed to the frame worker done, and the marks put in their places
const drainFrames = async () => {
  if (PENDING_IO.length) await Promise.all(PENDING_IO.splice(0));
  if (!ctx.FRAMER) return;
  const res = await ctx.FRAMER.drain();
  for (const r of res) { const slot = MARK_PENDING.get(r.id); if (!slot) continue; Object.assign(slot.mark, { pass: r.pass, ...r.numbers }); if (slot.last) ctx.lastPainted = r.paintedD; }
  MARK_PENDING.clear();
};
const mark = pass => {
  const F = framer();
  if (F) {
    const id = F.capture(), m = { pass };
    for (const v of MARK_PENDING.values()) v.last = false;
    marks.push(m); MARK_PENDING.set(id, { mark: m, last: true }); ctx.lastPainted = null;
    F.mark(id, pass, planDensity());
    return;
  }
  for (const v of MARK_PENDING.values()) v.last = false;
  const planD = planDensity(), paintedD = sheetDensity(render());
  marks.push({ pass, ...execution(planD, paintedD, w, h, gaussian) });
  ctx.lastPainted = paintedD;
};

// What each technique actually delivers, measured on scrap before anything goes on the sheet; charges scale by it.
// --waterscale: scales each technique's wash water (dry brush excepted), capped at a full load. Calibration uses the same load.
const WET = T => (T.water >= 0.3 ? Math.min(1, T.water * num('waterscale', 1)) : T.water);
// --drymix k: scales how much a wet-on-dry or glazed brush trades paint with wet paint under it (wetMix). Default 1.
const MIX = T => (T.intoWet ? T.wetMix : T.wetMix * num('drymix', 1));
// What a graded wash lays over the whole scrap and the share that ran past the swatch's edge. Each graded passage
// is charged for the whole scrap's delivery less that loss, scaled by its own open edge against the swatch's.
let GRADED_CAL = {};
// --loadedcontact 1: a loaded wash or detail brush touches all the paper under it, pits included; dry brush keeps its tooth-skip. Default 0.
const LOADED_CONTACT = num('loadedcontact', 0) > 0;
const washBridge = (T, b) => (LOADED_CONTACT && !T.name.startsWith('dry brush') ? 0 : b);
const STOCK_TECHNIQUES = [
  { name: 'wet on dry', water: 0.62, wetMix: 0.55, bridge: 0.78, bridgeSoft: 2.2, intoWet: false, passes: 1 },
  { name: 'wet on wet', water: 0.88, wetMix: 0.85, bridge: 0.98, bridgeSoft: 3, intoWet: true, passes: 1 },
  { name: 'glazed', water: 0.58, wetMix: 0.3, bridge: 0.82, bridgeSoft: 2.4, intoWet: false, passes: 1 },
  { name: 'dry brush', water: 0.22, wetMix: 0, bridge: 0.38, bridgeSoft: 1.0, intoWet: false, passes: 1 },
];
// Each technique laid on scrap (src/paint/methods/scrap-swatch.mjs), plain and, under --gradedwash, recharged every few
// cells along its sweep as a graded wash is. `drySwatch` dries the scrap.
const scrapSwatches = (techniques, drySwatch) => {
  const { want } = SWATCH;
  // A graded wash is recharged every few cells along its sweep (--gradedwash), so each technique is also laid on scrap
  // recharged that way, and what it lays is kept both inside the swatch and over the whole scrap (see GRADED_CAL).
  const CHUNK = opt('gradedwash', '1') !== '0' ? Math.max(2, Math.round(GCHUNK)) : 0;
  // --calpipe 1: calibrate with the sheet's own lanes, containment and pressure, not a plain sweep at default pressure.
  const layout = () => {
    const mask = swatchMask(), { width: SW, height: SH } = SWATCH;
    let paths = washPaths(mask, SW, SH, { pad: 1.5, minRadius: 1, minLength: 3 });
    if (opt('calpipe', '0') !== '0') {
      // the sheet's own brush, capped so a fifty-cell swatch is still laid in lanes as a passage that size would be
      const lanes = brushedWashPaths(mask, SW, SH, { pad: 1.5, minRadius: 1, minLength: 3, maxRadius: Math.min(BRUSH, 16), seed: 17, overlap: num('overlap', 0.15) });
      paths = containPaths(lanes, distanceToZero(mask, SW, SH), SW, SH, { minRadius: 0.8, minLength: 2, slack: num('slack', 0.5) }).map(pts => {
        const total = pts.reduce((a, q, i) => a + (i ? Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y) : 0), 0) || 1;
        let run = 0;
        return pts.map((q, i) => { if (i) run += Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y); const u = run / total;
          return { ...q, p: Math.max(0.18, Math.min(1, (0.72 + 0.28 * Math.sin(Math.PI * u)) * Math.min(Math.min(1, u / num('land', 0.06)), Math.min(1, (1 - u) / num('lift', 0.10))))) }; });
      });
    }
    // and charged for its footprint exactly as a passage on the sheet is, so that shortfall is not counted twice
    const under = opt('calpipe', '0') !== '0' && opt('undercover', '1') !== '0' ? 1 / Math.max(num('underfloor', 0.4), Math.min(1, sweepCover(paths, mask, SW, SH))) : 1;
    return { mask, paths, under };
  };
  const square = layout();
  const paintOpts = (r, T) => ({ flat: true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: num('washfree', 0.4), film: 0.25, splay: WASH_FLAT_SPLAY, stiffness: 8, wetMix: MIX(T), bridge: washBridge(T, T.bridge), bridgeSoft: T.bridgeSoft, seed: 11 });
  // ... and its bed is wetted as the sheet wets one (tools/painter/wet-bed-prep.mjs): a clean brush made like the swatch's
  // painting brush, its own load metered or not, a thirsty pickup and the wait, not one sweep of a full generic brush
  // read over the cells the swatch's brush touches, as the sheet reads its bed over the stroke's contact; on value and
  // area runs alike, so an area pass laid into wet is charged from a swatch laid into a bed as its own is
  const contactOf = (scrap, pts, r, T) => { const b = createBrush(paintOpts(r, T)); dipBrush(b, { water: WET(T), conc: [0] }); const c = candidateContact(b, scrap, pts, { upright: UPRIGHT, clip: null, neighborRadius: 0, includeTouched: false }); return c.cells.filter(i => c.primaryMask[i]); };
  const prepareBed = (ctx.VALUE_PLAN || ctx.AREA_PLAN) ? (scrap, pts, r, T, _lane, cells = contactOf(scrap, pts, r, T)) => prepareWetBed({ settings: paintOpts(r, T), bristles: Math.max(12, Math.ceil(r * 2)), seed: 911, pigments: 1, target: scrap, points: pts, prepOpts: { upright: UPRIGHT, lift: false },
    observe: () => measurePaper(scrap, cells, SPEED_PAPER, { uniform: false }), gate: () => measurePaper(scrap, cells, SPEED_PAPER, { stats: 'gate' }), advance: () => step(scrap, { ...O, dt: 2 }), createBrush, dip, thirsty, stroke }) : null;
  const settle = (ctx.VALUE_PLAN || ctx.AREA_PLAN) ? (scrap, cells) => { const observe = () => measurePaper(scrap, cells, SPEED_PAPER, { uniform: false }); layIntoWetBed({ paper: observe(), observe, step: o => step(scrap, o), O, info: { scrap: 'wet on wet swatch', cells: cells.length } }); } : null;
  const envOf = () => { const { under, ...lanes } = square; return { ...lanes, pigment: PIGS[0], physics: O, paperOptions: { seed: 5, scale: 1, toothScale: num('toothscale', 0.2), proudBlur: num('proudblur', 1) }, charge: want * num('strength', 2.2) * under, upright: UPRIGHT, water: WET, dip, stroke, step, dry: drySwatch, settle,
    waterBrush: r => createBrush({ flat: true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, seed: 5 }),
    paintBrush: (r, T) => createBrush(paintOpts(r, T)), prepareBed }; };
  return techniques.map(T => {
    const env = envOf();
    return { technique: T, plain: scrapDelivery(T, env), graded: CHUNK ? scrapDelivery({ ...T, name: `${T.name} graded`, chunk: CHUNK }, env) : null };
  });
};
const gradedReading = g => (g ? { all: g.all, escape: g.escape, edge: g.edge } : null);
const CAL_RESULT = await cachedStep({...RUN_CACHE,name:'calibration',enabled:RUN_CACHE.enabled&&!ctx.AREA_PLAN&&!ctx.FINISH_PLAN,code:CODE_HASH,track:optTrack,inputs:{pigment:PIGS[0],O,PAPER_OPTS,GCHUNK,BRUSH,UPRIGHT,LOADED_CONTACT,WASH_SPLAT_SETTINGS,settles:Boolean(ctx.VALUE_PLAN),physical:PB?{cfg:PB.cfg,mmPerCell:PB.mmPerCell}:null}},async () => {
  const out = {};
  for (const { technique: T, plain, graded } of scrapSwatches(STOCK_TECHNIQUES, dry)) {
    out[T.name] = chargeFactor(plain.delivered);
    console.log(`  ${T.name.padEnd(11)} delivers ${plain.delivered.toFixed(2)} of its charge, so it is charged ${out[T.name].toFixed(2)}x`);
    if (!graded) continue;
    out[`${T.name} graded`] = chargeFactor(graded.delivered);
    GRADED_CAL[`${T.name} graded`] = gradedReading(graded);
    console.log(`  ${`${T.name} graded`.padEnd(11)} delivers ${graded.delivered.toFixed(2)} of its charge, so it is charged ${out[`${T.name} graded`].toFixed(2)}x; ${(100 * graded.escape).toFixed(0)}% of what it lays runs past the swatch`);
  }
  return {CAL:out,GRADED_CAL};
});
const CAL = CAL_RESULT.value.CAL;
GRADED_CAL = CAL_RESULT.value.GRADED_CAL;
// A passage whose brush load or pass count is not its stock technique's is charged from a swatch laid with its own load
// and passes (src/paint/methods/instrument-cal.mjs). A value plan's shadow glaze is one pass of a 0.45-water brush; the
// stock glazed swatch is two passes at 0.58 and lays 2.5 times as much. Authored area plans keep their own calibration. A passage
// laid into wet is charged the same way (chargedFromOwnSwatch).
const INSTRUMENT_ON = !ctx.AREA_PLAN && !ctx.FINISH_PLAN;
const INSTRUMENT_CAL = createInstrumentCal({
  stock: Object.fromEntries(STOCK_TECHNIQUES.map(T => [T.name, { technique: T, cal: CAL[T.name], graded: GRADED_CAL[`${T.name} graded`] ?? null }])),
  // the scrap dries as the stock swatches do, without touching the painting's own wet-contact records
  measure: T => { const [{ plain, graded }] = scrapSwatches([T], (scrap, max, o, options) => physicalDry(scrap, max, o, nativeDryOptions(NATIVE_PAINT_MODE.mode, options))); return { cal: chargeFactor(plain.delivered), graded: gradedReading(graded) }; },
  log: line => console.log(line),
});
const ownSwatch = (T, sh) => chargedFromOwnSwatch(T, { instrumentOn: INSTRUMENT_ON, authored: Boolean(sh._semantic) });
const instrumentOf = (T, sh) => (ownSwatch(T, sh) ? INSTRUMENT_CAL.of(T) : INSTRUMENT_CAL.byName(T.name));
// every instrument the value plan names is tried on scrap before the first wash
if (INSTRUMENT_ON && ctx.VALUE_PLAN) {
  const planned = [...new Map(ctx.layers.flatMap(l => (l.shapes ?? []).filter(sh => sh._valuePlan).map(sh => [sh, valueTechnique(sh._valuePlan)])).filter(([sh, T]) => ownSwatch(T, sh)).map(([, T]) => [instrumentKey(T), T])).values()];
  const saved = await cachedStep({...RUN_CACHE,name:'instrument-calibration',code:CODE_HASH,track:optTrack,inputs:{pigment:PIGS[0],O,PAPER_OPTS,GCHUNK,BRUSH,UPRIGHT,LOADED_CONTACT,WASH_SPLAT_SETTINGS,physical:PB?{cfg:PB.cfg,mmPerCell:PB.mmPerCell}:null,stock:CAL_RESULT.value,instruments:planned.map(instrumentKey)}},async () => {
    for (const T of planned) INSTRUMENT_CAL.of(T);
    return INSTRUMENT_CAL.entries();
  });
  if (saved.cached) INSTRUMENT_CAL.load(saved.value);
}

const CALIBRATION_PLAN=ctx.AREA_PLAN??ctx.FINISH_PLAN;
const SEMANTIC_CAL_MODE=opt('semanticcalibration','legacy');
if(!['legacy','actual'].includes(SEMANTIC_CAL_MODE)||SEMANTIC_CAL_MODE==='actual'&&(!CALIBRATION_PLAN||!PB))throw Error('--semanticcalibration actual requires authoritative area plan');
const SEMANTIC_REFERENCE_LENGTHS=semanticReferenceLengths(opt('semanticcalibrationlengths',null));
const SEMANTIC_CAL={};
if(SEMANTIC_CAL_MODE==='actual'){
 const {selectedStages,selectedPasses}=semanticCalibrationSelection(CALIBRATION_PLAN.doc,opt('semanticcalibrationstages',null));
 const cache=new Map(),cacheRecords=[];let sampleNumber=0;
 const instrumentCode=instrumentCodeHash(root);
 for(const {area,pass} of selectedPasses){
  const T=semanticTechnique({area,pass},{}),r=pass.brush.widthMm/(2*PB.mmPerCell),profile={radius:r,bristles:Math.max(12,Math.ceil(r*2)),capacity:100,belly:12,feed:.4,give:.9,free:num('washfree',.4),film:.25,splay:.03,stiffness:8,wetMix:MIX(T),bridge:washBridge(T,T.bridge),bridgeSoft:T.bridgeSoft,seed:31+Math.round(num('seed',0))*7919};
  const binding=JSON.stringify({move:pass.move,brush:pass.brush,load:pass.load,wetness:pass.wetness,preparation:pass.preparation,authoredPaint:pass.paint,profile,paper:PAPER_OPTS,physics:O});
  if(!cache.has(binding)){
   const saved=await cachedSemanticInstrument({cache:RUN_CACHE,code:instrumentCode,track:optTrack,inputs:{binding,mmPerCell:PB.mmPerCell,referenceLengthsMm:SEMANTIC_REFERENCE_LENGTHS,pigments:PIGS,strength:num('strength',2.2),GPU_MODE,paperRGB,shade:SHADE,washSplat:WASH_SPLAT_SETTINGS},proofPath:path.join(out,'semantic-instrument-calibration.json'),pass,bypass:num('semanticcalibrationonly',0)>0,onRecord:record=>{cacheRecords.push({areaId:area.id,passId:area.id+'/'+pass.id,...record});console.log('semantic instrument cache: '+record.status+' '+area.id+'/'+pass.id+'; origin '+record.origin.proofPath);}},async images=>calibrateSemanticInstrument(pass,{mmPerCell:PB.mmPerCell,paperOptions:PAPER_OPTS,pigments:PIGS,physics:O,profile,strength:num('strength',2.2),referenceLengthsMm:SEMANTIC_REFERENCE_LENGTHS,attachBackend:sh=>attachGpu(sh,O,{mode:GPU_MODE}),onSample:async({sheet:sh,record,phase})=>{
   const b=new Uint8Array(sh.n*3);for(let i=0;i<sh.n;i++)for(let k=0;k<3;k++)b[i*3+k]=paperRGB[k]*(1-SHADE+SHADE*sh.paper.height[i]);
   const rgb=renderLayers(layersOf(sh),PIGS,b,sh.n,1);const proofImage=path.join(out,'semantic-calibration-'+sampleNumber+'-'+phase+'.png');images.push({path:proofImage,phase,lengthMm:record.lengthMm});await sharp(rgb,{raw:{width:sh.w,height:sh.h,channels:3}}).png().toFile(proofImage);if(phase==='dried')sampleNumber++;
  }}));
   cache.set(binding,saved.calibration);
  }
  SEMANTIC_CAL[area.id+'/'+pass.id]=cache.get(binding);
 }
 fs.writeFileSync(path.join(out,'semantic-instrument-calibration.json'),JSON.stringify({mode:SEMANTIC_CAL_MODE,selectedStages,cacheRecords,referenceLengthsMm:SEMANTIC_REFERENCE_LENGTHS,referenceLengthScope:opt('semanticcalibrationlengths',null)!==null?'Explicit BEFORE-authored physical reference regimes; straight reference samples do not claim curved scene delivery.':'Lengths derive from prior firstwash contacts; a selected later instrument is calibrated at those regimes, not claimed to match its eventual curved distribution.',referenceLengthSource:opt('semanticcalibrationlengths',null)!==null?'explicit --semanticcalibrationlengths authored input':'actual v3 scene contacts min .25mm, median3.5mm, max55.216613mm; coverage126/126',paperOptions:PAPER_OPTS,physics:O,profiles:SEMANTIC_CAL},null,2));
 if(num('semanticcalibrationonly',0)){
  const normalized=[];
  for(const reference of new Set(Object.values(SEMANTIC_CAL)))for(const sample of reference.samples){
   const p=reference.pass,r=p.brush.widthMm/(2*PB.mmPerCell),T=semanticTechnique({pass:p},{}),profile={radius:r,bristles:Math.max(12,Math.ceil(r*2)),capacity:100,belly:12,feed:.4,give:.9,free:num('washfree',.4),film:.25,splay:.03,stiffness:8,wetMix:MIX(T),bridge:washBridge(T,T.bridge),bridgeSoft:T.bridgeSoft,seed:31+Math.round(num('seed',0))*7919};
   normalized.push(await calibrateSemanticInstrument(p,{mmPerCell:PB.mmPerCell,paperOptions:PAPER_OPTS,pigments:PIGS,physics:O,profile,strength:num('strength',2.2)*sample.gain,referenceLengthsMm:[sample.lengthMm],referenceGrid:sample.referenceGrid,attachBackend:sh=>attachGpu(sh,O,{mode:GPU_MODE}),onSample:async({sheet:sh,record,phase})=>{
    const b=new Uint8Array(sh.n*3);for(let i=0;i<sh.n;i++)for(let k=0;k<3;k++)b[i*3+k]=paperRGB[k]*(1-SHADE+SHADE*sh.paper.height[i]);
    await sharp(renderLayers(layersOf(sh),PIGS,b,sh.n,1),{raw:{width:sh.w,height:sh.h,channels:3}}).png().toFile(path.join(out,'semantic-calibration-normalized-'+normalized.length+'-'+phase+'.png'));
   }}));
  }
  fs.writeFileSync(path.join(out,'semantic-normalized-reference-controls.json'),JSON.stringify({kind:'actual fresh physical normalized reference controls; no scene/artistic acceptance',normalized},null,2));ctx.sheet._gpu?.close();console.log('actual instrument reference controls only; scene painting NOT RUN');process.exit(0);
 }
}
Object.assign(ctx, { dry, dip, productionDip, stroke, pencilDraw, SC, H2, N2, GFLOOR, GCHUNK, CP_MM, paper, PROBE, 
  ABLATE, INKRES, PEN_STATE_GATE, PEN_STATE_AUDIT, TARGET_DRAW_EDGE, sourceInkDrawing, drawingCapsFor, penDraw, 
  OUT_W, OUT_H, O, GPU_INFO, base, SHADE, TONE_STAGE, render, LOOK_RES, view, renderFine, 
  colourTrace, traceBox, traceCells, BRUSH, UPRIGHT, highlights, expected, DELIVERY, DCAL, TECH_CAL, TCAL, 
  sheetDensity, marks, PENDING_IO, framer, drainFrames, mark, WET, MIX, 
  washBridge, CAL, instrumentOf, SEMANTIC_CAL_MODE, SEMANTIC_CAL });
}
