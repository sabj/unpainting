// Brush and pen strokes, the value plan, the sheet of paper, looks, marks and scrap calibration.
// Stage 3 of 7 of tools/paint-plate.mjs. The stages run in order and share one object, ctx: see the entry file.
import {createNativeOperationRecorder} from './native-operation-recorder.mjs';
import {compactLowerLayers} from '../../src/media/layer-storage.mjs';
import {certifyZeroPaper} from '../../src/media/paper-certificate.mjs';
import {check} from '../../src/media/checks.mjs';
import {layIntoWetBed} from '../painter/wet-bed-wait.mjs';
import {waitBesideDamp} from '../painter/beside-damp.mjs';
import {prepareWetBed} from '../painter/wet-bed-prep.mjs';
import {isTinyTouch, tinyTouchRecord, tinyTouchLine} from '../../src/paint/methods/tiny-touch.mjs';
import {drawFineMaterial, drawOnFineSheet, fineGestures} from '../../src/paint/methods/fine-material.mjs';
import {createDeliveryCal} from '../../src/paint/methods/delivery-cal.mjs';
import {drawMaterial, sourceDrawingCaps} from '../../src/paint/methods/material-profiles.mjs';
import {valueTechnique, estimatePaper, targetValueMap} from '../../src/paint/methods/value-shared.mjs';
import {planStudyWashes} from '../../src/paint/methods/study-washes.mjs';
import {planScriptWashes} from '../../src/paint/methods/script-washes.mjs';
import {monoPaints} from '../../src/paint/methods/mono-mix.mjs';
import {loadStudies} from '../painter/study-load.mjs';
import {splitPlanEdit,planEditStep} from '../painter/plan-edit-step.mjs';
import {studyThingMasks} from '../painter/thing-masks.mjs';
import {washStrokeHold, LANE_OVERLAP, FLAT_OVERLAP} from '../../src/paint/methods/wash-strokes.mjs';
import {smallestBrushMm} from '../../src/paint/methods/light-reserves.mjs';
import {roleBrushMm,roleBrushPointMm,washKitMm} from '../../src/paint/methods/brush-footprint.mjs';
import {writeValuePreview} from '../painter/value-plan-preview.mjs';
import {writePlanValueCheck} from '../painter/plan-value-check.mjs';
import {subjectField, orderBySubject, OVERLAP} from '../../src/paint/methods/subject-order.mjs';
import {DEFAULT_SHEET_MM} from '../../src/media/sheet-size.mjs';
import {recordGraphiteBatch} from '../painter/record-graphite.mjs';
import {SWATCH, swatchMask, swatchLanes, scrapDelivery, chargeFactor} from '../../src/paint/methods/scrap-swatch.mjs';
import {painterBrushOptions, isSection} from './painter-brush.mjs';
import {createInstrumentCal, instrumentKey, chargedFromOwnSwatch} from '../../src/paint/methods/instrument-cal.mjs';
import {representativeMarks, markKey, markLayout, markDelivery, isMarkPassage} from '../../src/paint/methods/mark-swatch.mjs';
import {isDampPassage, underOf, dampScrap, dampCharge, liftShare, DAMP_CHANNEL} from '../../src/paint/methods/damp-swatch.mjs';
import {nativeDryOptions} from '../painter/native-paint-mode.mjs';
import {measurePaperBatch, measureBrush} from '../../src/paint/methods/wetdry.mjs';
import {productionWaterLoad} from '../painter/production-water-load.mjs';
import {cachedStep, cachedStepSync, codeHash} from '../../src/paint/run-cache.mjs';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import sharp from 'sharp';
import {makePaper} from '../../src/media/paper.mjs';
import {paperRelief} from '../../src/media/paper-relief.mjs';
import {subcellLayers} from '../../src/media/subcell-grain.mjs';
import {createSheet, step, dry as physicalDry, layersOf, thickness, thicknessTotals, DEFAULTS, coherent} from '../../src/media/sheet.mjs';
import {attachGpu} from '../../src/media/gpu/link.mjs';
import {CpuDemandWindow} from '../../src/media/gpu/cpu-demand-window.mjs';
import {backendLine} from '../../src/media/gpu/backend-record.mjs';
import {renderLayers, renderLayersCached, renderCells, microAmps} from '../../src/media/km.mjs';
import {renderSheet} from '../../src/media/render-cache.mjs';
import {createFramer} from '../../src/media/gpu/framer.mjs';
import {dip as dipBrush, thirsty} from '../../src/media/brush.mjs';
import {createTechniqueCal} from '../../src/paint/methods/technique-cal.mjs';
import {washPaths, brushedWashPaths, sweepCover, footprintSpread, containPaths} from '../../src/media/wash.mjs';
import {pencilDraw as physicalPencilDraw} from '../../src/paint/methods/pencil-line.mjs';
import {distanceToZero} from '../../src/raster.js';
import {components, removeSmall, open as openMask} from '../../src/raster.js';
import {execution} from '../../src/eval/composite.mjs';
import {planDensityOver} from '../../src/eval/plan-optics.mjs';
import {gaussian} from '../../src/keyframes/density.mjs';
import {overlay} from '../../src/media/gouache.mjs';
// Optional stages, one module each, off unless their flag is given.
import {sampledInkAbsorbance, matchInkLoad, sampleGestures, INK_STRENGTH_QUANTILE} from '../../src/paint/methods/ink-match.mjs';
import {makeInkRes} from '../../src/paint/methods/ink-res.mjs';
import {loadPhysical} from '../../src/paint/methods/brushes.mjs';
import {fillSheetBase, WHITE_PAPER_RGB} from '../../src/paint/methods/sheet-tone.mjs';
import {sealAtBirth} from '../guard/seal-maps.mjs';
import {createWetTrace} from './wet-trace.mjs';
import {wetOnDryGate, passageReach} from '../painter/passage-dry-gate.mjs';

// Observe CPU pen contact while its GPU stroke is still open. Readbacks must
// preserve unuploaded ink; they never advance, upload or end the physical stroke.
export function readActiveStroke(sheet) {
 const link=sheet._gpu;if(!link?.stroke)return false;
 const stroke=link.stroke;
 // Ink does not edit dried layers. Refresh their GPU truth without syncAll,
 // whose wet readback would overwrite the current CPU pen contact.
 try{link.stroke=null;link.syncTop(sheet);}finally{link.stroke=stroke;}
 let window=sheet._cpuDemandWindow;
 if(!window){window=new CpuDemandWindow(sheet.w,sheet.h,[sheet.W,sheet.s,sheet.M,sheet.ever,...sheet.G,...sheet.P,...sheet.D],rect=>link.down(sheet,rect));window.rect=stroke.slice();}
 window.require([0,0,sheet.w,sheet.h]);
 return true;
}

export async function sheetAndBrushes(ctx) {
const { WASH_FLAT_SPLAY, ENTRY_FILE, JSONL, opt, num, optTrack, NATIVE_PAINT_MODE, SPEED_PAPER, 
  SPEED_CONTACT, SPEED_VALUE_CACHE, SPEED_UNIFORM_PAPER, measurePaper, VALUE_CONTACT_WORK, SPEED_GPU_OPTICS, 
  SPEED_PROFILE, root, out, RUN_CACHE, VALUE_CONFIG, VALUE_COUNTS, 
  WASH_SESSION, phaseMark, w, h, n, createBrush, physicalStroke: untracedStroke, candidateContact, TONE_MODE, 
  SHEET_TONE, CALIBRATED_PLAN, PAPER_RULE, paperRGB, WASH_SPLAT_SETTINGS, CODE_HASH, PIGS, SMALL, 
  setClip, COLOUR_TRACE, OUTLINE, STAGE_PLAN, REQUESTED_DRAW_MEDIUM, INK_WIDTH_FLOOR_MM, INK_DAMP, 
  STYLE_INK_DEFAULT, INK_PROFILE, GRAPHITE_PROFILE, INK, GRAPHITE, SHEET_PIGS, GRAPHITE_AT } = ctx;
Object.assign(ctx, { colourMass });
// WET_TRACE=<file.jsonl>: a read-only record of the sheet's water under each stroke at landing and around each dry (wet-trace.mjs)
const physicalStroke=(b,t,p,o)=>{const result=ctx.WET_TRACE&&t===ctx.sheet?ctx.WET_TRACE.stroke(b,t,p,o,untracedStroke):untracedStroke(b,t,p,o);if(t===ctx.sheet)ctx.NATIVE_CAPTURE?.('brush');return result;};
const tracedDry=(...args)=>ctx.WET_TRACE&&args[0]===ctx.sheet?ctx.WET_TRACE.dry(args,physicalDry):physicalDry(...args);
const dry=(...args)=>{ctx.VALUE_OWN_CONTACT.clear();ctx.VALUE_PIGMENT_CONTACT.clear();args[3]=nativeDryOptions(NATIVE_PAINT_MODE.mode,args[3]);const result=tracedDry(...args);if(args[0]._layerStoragePolicy)compactLowerLayers(args[0],args[0]._layerStoragePolicy());if(args[0]===ctx.sheet)ctx.NATIVE_CAPTURE?.('dry');return result;};
const dipLoad=(b,load)=>{const padded=(INK||GRAPHITE)&&load.conc.length<SHEET_PIGS.length?{...load,conc:[...load.conc,...new Array(SHEET_PIGS.length-load.conc.length).fill(0)]}:load;return padded;};
const dip=(b,o)=>{ctx.WET_TRACE?.dipped(b,o.conc.some(v=>v>0));return dipBrush(b,dipLoad(b,o));};
// Opt-in actual numeric production loads only: calibration and pen loads stay unchanged.
const PRODUCTION_WATER=num('productionwater',1);productionWaterLoad({water:1,conc:[0]},PRODUCTION_WATER);
if(PRODUCTION_WATER!==1)fs.writeFileSync(path.join(out,'production-water-before.json'),JSON.stringify({factor:PRODUCTION_WATER,scope:'actual numeric paint/prewet dips after unchanged scrap calibration; ink unchanged',pigment:'same prepared mass through inverse concentration, not a delivery guarantee',admission:'existing native material checks; no automatic baseline-water fallback'},null,2));
const productionDip=(b,o)=>{const requested=o,prepared=productionWaterLoad(o,PRODUCTION_WATER,{authored:false}),result=dip(b,prepared);if(PRODUCTION_WATER!==1){const actual=measureBrush(b),baselineWaterMass=actual.waterMass/PRODUCTION_WATER,intendedPigmentMass=actual.pigmentMass.map((_,j)=>(requested.conc[j]??0)*baselineWaterMass);JSONL.append(path.join(out,'production-water-loads.jsonl'),JSON.stringify({kind:requested.conc.some(v=>v>0)?'actual production paint load':'actual production clean prewet',factor:PRODUCTION_WATER,requested,prepared,actual,baselineWaterMassAtSameBrush:baselineWaterMass,intendedPigmentMass,deliveredPigmentMass:null,meaning:'prepared brush mass only; actual deposition is measured separately; no rewet fallback'})+'\n');}return result;};

// a clean brush made like the painting brush takes its settings, not the GPU stroke it may still have pending (b._pend)
const brushSettings=b=>{const {_pend,...settings}=b;return settings;};
// --touchleastmm2 a: the least area a stroke must touch to be given a wet bed, mm2 (src/paint/methods/tiny-touch.mjs). Default 1.2.
const TOUCH_LEAST_MM2=num('touchleastmm2',1.2);
const stroke=(b,target,points,options)=>{
 if(ctx.VALUE_ACTIVE&&target===ctx.sheet){
  // a wash plan's stroke says whether it is a round's (paint.mjs vectorPaths): a round turns with its path, a lane is swept
  if(ctx.VALUE_ACTIVE.shaped)options={...options,upright:ctx.VALUE_ACTIVE.brush?.contact==='point'?false:washStrokeHold(points[0]?.round===true)};
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
  // 'beside damp' (tools/painter/beside-damp.mjs): laid against a neighbour still damp; no dry gate, no wet bed of its
  // own; at the passage's first stroke it waits until the neighbour has lost its shine
  const beside=paint&&ctx.VALUE_ACTIVE.move==='beside damp';let besideWaits=0;
  if(beside&&ctx.VALUE_PASSAGE&&!ctx.VALUE_PASSAGE.besideDone){ctx.VALUE_PASSAGE.besideDone=true;const nb=neighbors.filter(i=>!ctx.VALUE_OWN_CONTACT.has(i));if(nb.length)({waits:besideWaits}=waitBesideDamp({observe:()=>measurePaper(target,nb,SPEED_PAPER,{uniform:false}),step:o=>step(target,o),O}));JSONL.append(path.join(out,'value-commands.jsonl'),JSON.stringify({kind:'beside-damp',intent:ctx.VALUE_ACTIVE.id,neighbourCells:nb.length,waits:besideWaits})+'\n');}
  let paper=null,own=false;
  if(fastMode){
    if(paint&&!wetMove&&!beside){
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
    if(paint&&!wetMove&&!beside&&(!own||ctx.VALUE_ACTIVE.texture)&&!paper.dry){dry(target,30000,O,{levelMax:140,dt:2});paper=observe();check('value-plan dry-paper contact gate failed',paper.dry,{id:ctx.VALUE_ACTIVE.id,band:ctx.VALUE_ACTIVE.valueBand,waterMax:paper.waterMax,saturationMax:paper.saturationMax});}
  }
  // a wet bed is judged by its typical cell (median standing water), so it is read cell by cell, never as uniform paper
  const observeBed=()=>measurePaper(target,getObservationCells(),SPEED_PAPER,{uniform:false});
  // a stroke whose footprint holds no paintable cell (off the sheet, or wholly on kept paper) has no bed to prepare: it is
  // logged and laid as it is (it can put nothing down), never a stop
  if(paint&&ownBed&&ctx.VALUE_ACTIVE.move==='wet on wet'&&!cells.length){JSONL.append(path.join(out,'value-commands.jsonl'),JSON.stringify({kind:'empty-footprint',intent:ctx.VALUE_ACTIVE.id,note:'no paintable cell under the stroke: no wet bed prepared'})+'\n');ctx.EMPTY_FOOTPRINTS=(ctx.EMPTY_FOOTPRINTS??0)+1;if(ctx.EMPTY_FOOTPRINTS<=5)console.log(`passage ${ctx.VALUE_ACTIVE.id}: a stroke with no paintable cell under it; no wet bed prepared (logged in value-commands.jsonl)`);}
  // a touch under --touchleastmm2 (src/paint/methods/tiny-touch.mjs: a stroke so short its brush only lands on its tip) is
  // laid as a plain touch on the paper as it stands: no bed is prepared for it and none waited on (a bed cannot be made
  // on a few cells: the clean brush wets the same tip). Every one is said in the log and kept in tiny-touches.json.
  const SHEET_CELL_MM=num('sheetmm',DEFAULT_SHEET_MM)/target.w;
  const tinyTouch=paint&&!intoOwnWash&&ownBed&&ctx.VALUE_ACTIVE.move==='wet on wet'&&isTinyTouch(cells.length,SHEET_CELL_MM,TOUCH_LEAST_MM2);
  if(tinyTouch){const t=tinyTouchRecord({intent:ctx.VALUE_ACTIVE,cells:cells.length,cellMm:SHEET_CELL_MM,points,leastMm2:TOUCH_LEAST_MM2});(ctx.TINY_TOUCHES??=[]).push(t);console.log(tinyTouchLine(t));JSONL.append(path.join(out,'value-commands.jsonl'),JSON.stringify({kind:'tiny-touch',...t})+'\n');fs.writeFileSync(path.join(out,'tiny-touches.json'),JSON.stringify({kind:'strokes under the least area for a wet bed, laid as plain touches (src/paint/methods/tiny-touch.mjs)',leastMm2:TOUCH_LEAST_MM2,touches:ctx.TINY_TOUCHES},null,1));}
  else if(paint&&!intoOwnWash&&ownBed&&ctx.VALUE_ACTIVE.move==='wet on wet'&&cells.length>0){
    const prepOpts={upright:options.upright,lift:false,spacing:options.spacing};
    const preparation=(()=>{try{return prepareWetBed({settings:brushSettings(b),bristles:b.hairs.length,seed:911+ctx.VALUE_COMMAND,pigments:SHEET_PIGS.length,target,points,prepOpts,observe:observeBed,gate:()=>measurePaper(target,getObservationCells(),SPEED_PAPER,{stats:'gate'}),advance:()=>ctx.clock('flow',()=>step(target,{...O,dt:2})),createBrush,dip,thirsty,stroke});}catch(e){e.message=`passage ${ctx.VALUE_ACTIVE.id} (value band ${ctx.VALUE_ACTIVE.valueBand}, ${(freshCells.length?freshCells:cells).length} cells in its footprint): ${e.message}`;throw e;}})();paper=preparation.paper;
    JSONL.append(path.join(out,'passage-material-preparation.jsonl'),JSON.stringify({intent:ctx.VALUE_ACTIVE.id,admission:'actual allowed paint footprint; adjacent paper inspected separately',neighbors:fastMode?null:measurePaper(target,neighbors,SPEED_PAPER),...preparation})+'\n');
  }
  // A wet stroke into a fresh wash waits for the shine to go off, then is laid; uneven paper is counted, not a stop (tools/painter/wet-bed-wait.mjs).
  let wetWaits=0;
  if(paint&&!intoOwnWash&&!tinyTouch&&cells.length&&['wet on wet','dry on wet'].includes(ctx.VALUE_ACTIVE.move)){const observeWet=()=>measurePaper(target,getObservationCells(),SPEED_PAPER,{uniform:false});({paper,wetWaits}=layIntoWetBed({paper:observeWet(),observe:observeWet,step:o=>step(target,o),O,info:{id:ctx.VALUE_ACTIVE.id,band:ctx.VALUE_ACTIVE.valueBand,cells:cells.length}}));}
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

 return physicalStroke(b,target,points,options);
};
const pencilDraw=(target,gs,pigment,options)=>{
 const recorded=num('recordgraphite',0)>0||!!opt('preparationbinding','');
 const execute=strokes=>drawMaterial(target,strokes,new Float32Array(target.n).fill(.25),target.w,target.h,{medium:opt('graphiteprofile',REQUESTED_DRAW_MEDIUM.startsWith('graphite-')?REQUESTED_DRAW_MEDIUM:'graphite-HB'),stage:ctx.DRAW_STAGE,mmPerCell:num('sheetmm', DEFAULT_SHEET_MM)/target.w,state:DRAW_MATERIAL_STATE[ctx.DRAW_STAGE],caps:drawingCapsFor(ctx.DRAW_STAGE,true),O,audit:PEN_STATE_AUDIT,graphiteOptions:options,...(ctx.NATIVE_CAPTURE&&target===ctx.sheet?{afterStroke:e=>ctx.NATIVE_CAPTURE(e.skipped?'graphite-skipped':'graphite'),afterDry:()=>ctx.NATIVE_CAPTURE('drawing-dry')}:{}),
  ...(recorded?{graphiteExecute:(sh,paths,k,profileOptions)=>recordGraphiteBatch({sheet:sh,strokes:paths,pigment:k,options:{...profileOptions,seed:options.seed},material:SHEET_PIGS[k],source:{binding:opt('preparationbinding','')||null,target:opt('image',''),guide:opt('penpencil',''),drawing:opt('drawingfile',''),frame:[target.w,target.h],sheetWidthMm:num('sheetmm', DEFAULT_SHEET_MM)},execute:physicalPencilDraw,observe:measurePaper,record:r=>JSONL.append(path.join(out,'preparation-graphite.jsonl'),JSON.stringify(r)+'\n')})}: {})});
 return execute(gs);};

{
 const shaped=num('shapedmarks',0)>0;
  const valueOptions={shaped,pigments:PIGS,subject:VALUE_CONFIG?.subject,k:PIGS.length,density:ctx.SRC,w,h,rgb:ctx.px,paperRGB,sheetWidthMm:num('sheetmm', DEFAULT_SHEET_MM)};

 // The wash plan is read from block-in studies (study-washes.mjs), never from the subject. The squinted-subject plan
 // (layered-washes.mjs) and the light-to-dark value plan were removed in 0.4 (last at commit 49447027).
 valueOptions.washBrushMm=roleBrushMm(root,'shape',{brushes:opt('brushes','src/paint/brushes.json')});valueOptions.washKitMm=washKitMm(root,{brushes:opt('brushes','src/paint/brushes.json')});valueOptions.pointBrushMm=roleBrushMm(root,'detail',{brushes:opt('brushes','src/paint/brushes.json')});
 // under an ink drawing (the ink-and-wash recipe) the washes stay broad: the line carries the structure
 valueOptions.drawn=opt('inkrecipe','none')==='wash'&&opt('drawing','first')!=='none';
 // --washplan FILE[:MIN],FILE[:MIN],...: the washes are read from a stack of painter's block-in studies, coarse to fine
 // (images of the subject simplified to flat shapes), registered to the sheet; the subject is not read for them
 // (study-washes.mjs; tools/painter/study-load.mjs). Without one a painting stops; a drawing-only run gets no washes.
 // the default is 'required': a painting stops without a study (a drawing-only run lays no wash)
 // --washplan edit:EDIT.json,STUDY...: the study plan, then an author's edit of it (tools/painter/plan-edit-step.mjs)
 const WASH_PLAN_GIVEN=opt('washplan','required'),[PLAN_EDIT,WASH_PLAN]=splitPlanEdit(WASH_PLAN_GIVEN==='required'?'':WASH_PLAN_GIVEN);
 if(WASH_PLAN==='squint')throw Error('--washplan squint was removed in 0.4: the washes are not read from the subject squinted (last at commit 49447027); give --washplan STUDY.png[:MIN],...');
 if(!WASH_PLAN&&num('drawingonly',0)===0)throw Error('no wash plan: give --washplan STUDY.png[:MIN],... (a block-in study registered to the sheet, made by the image model). The washes are never read from the subject: the squinted-subject plan and the light-to-dark value plan were removed in 0.4 (last at commit 49447027)');
 console.log(`wash plan: ${WASH_PLAN?`study (${WASH_PLAN.split(',').map(f=>path.basename(f)).join(', ')})`:'none (drawing only)'}`);
 if(!WASH_PLAN){valueOptions.studies=[{rgb:new Uint8ClampedArray(n*3).fill(255),file:'(none: drawing only)',registered:'blank',minMm2:null}];valueOptions.flat=false;}
 // --washplan script:FILE.json: the washes are a painting script written by an author (script-washes.mjs,
 // docs/painting-script.md): passages in painting order, each laid in whole strokes; no study is read
 const SCRIPT=WASH_PLAN.startsWith('script:')?JSON.parse(fs.readFileSync(path.resolve(root,WASH_PLAN.slice(7)),'utf8')):null;
 if(SCRIPT)valueOptions.touchLeastMm2=TOUCH_LEAST_MM2;
 // --thingmasks RECEIPT.json (default auto: IMAGE.named-sam.json beside the source, when there is one): the source's named
 // forms (a reviewed SAM id map bound to the source by its receipt) for the study wash plan; --things names the label file
 // the receipt must match. No receipt: no named forms, and the plan is as it was without them.
 const thingMasks=await studyThingMasks({root,source:opt('image'),maskOption:opt('thingmasks','auto'),labelsOption:opt('things','auto'),blockIn:Boolean(WASH_PLAN&&!SCRIPT)});
 if(thingMasks){valueOptions.thingMasks=thingMasks;console.log(`named forms: ${thingMasks.names.length} forms from a named-sam-v1 receipt (${thingMasks.names.map((n,i)=>`${n}${thingMasks.kinds[i]?` [${thingMasks.kinds[i]}]`:''}`).join(', ')})`);}
 if(SCRIPT){valueOptions.script=SCRIPT;const paper=estimatePaper(valueOptions.rgb,w,h,valueOptions.density);valueOptions.inkValue=targetValueMap(paper?Float32Array.from(valueOptions.density,v=>Math.max(0,v-paper.density)):valueOptions.density);}
 if(WASH_PLAN&&!SCRIPT){Object.assign(valueOptions,await loadStudies(WASH_PLAN,root,w,h));
  // a near-monochrome subject is mixed from its own one or two paints, read from it at a coarse scale as the palette is (mono-mix.mjs)
  valueOptions.mono=valueOptions.flat?null:monoPaints(ctx.px,w,h,PIGS,paperRGB);if(valueOptions.mono)console.log(valueOptions.mono.note);
 const paper=estimatePaper(valueOptions.rgb,w,h,valueOptions.density);valueOptions.inkValue=targetValueMap(paper?Float32Array.from(valueOptions.density,v=>Math.max(0,v-paper.density)):valueOptions.density);}
 const planValues=SCRIPT?planScriptWashes:planStudyWashes;
 const valueStarted=performance.now();
 if(SPEED_VALUE_CACHE){
  const saved=await cachedStep({...RUN_CACHE,name:'value-plan',code:CODE_HASH,track:optTrack,inputs:valueOptions},async()=>({plan:planValues(valueOptions)}));
  ctx.VALUE_PLAN=saved.value.plan;
 }else ctx.VALUE_PLAN=planValues(valueOptions);
 if(WASH_PLAN&&!SCRIPT)ctx.VALUE_PLAN=planEditStep({plan:ctx.VALUE_PLAN,file:PLAN_EDIT?path.resolve(root,PLAN_EDIT):null,out,ctx:{w,h,k:PIGS.length,pigments:PIGS,paperRGB,sheetWidthMm:valueOptions.sheetWidthMm,kitMm:valueOptions.washKitMm,mono:valueOptions.mono,seed:num('seed',0)}});
 SPEED_PROFILE?.add('setup:value-plan',performance.now()-valueStarted);
 ctx.layers=ctx.VALUE_PLAN.layers;ctx.steps=5;
 // --washsession 2: within each band step, a region's pigment passes follow one another, so its wash is charged with
 // all its pigments in one wet session (the planner lists them pigment by pigment).
 if(WASH_SESSION>1){const step=l=>l.shapes[0]?._valuePlan?.id?.split('/')[1]??String(l.value),first=new Map();ctx.layers.forEach((l,i)=>{const g=step(l)+'|'+l._valuePhase;if(!first.has(g))first.set(g,i);});
  ctx.layers=ctx.layers.map((l,i)=>({l,i,g:first.get(step(l)+'|'+l._valuePhase),r:l._order?.region??0})).sort((a,b)=>a.g-b.g||(a.l._valuePhase==='shadow'?a.i-b.i:a.r-b.r||a.l.pigment-b.l.pigment||a.i-b.i)).map(q=>q.l);}
 // --darkfirst: shadow-phase layers (shadow glazes, deep accents) before the middle layers, light first still
 if(num('darkfirst',0)>0){const ph=l=>l._valuePhase==='light'?0:l._valuePhase==='shadow'?1:2;ctx.layers=ctx.layers.map((l,i)=>({l,i})).sort((a,b)=>ph(a.l)-ph(b.l)||a.i-b.i).map(q=>q.l);console.log('darkfirst: '+ctx.layers.map(l=>l._valuePhase[0]).join(''));}
 // a crop rectangle would show as a straight mask edge the subject does not have; the layered plan's shapes are outlines
 // of the squinted subject, which sit a squint's width off a straight subject edge, so the test is the older plan's
 const seams=[];
 const baseMass=new Float32Array(n);for(const l of ctx.layers.filter(l=>l.value===1))for(const sh of l.shapes)for(let y=sh.box.y0;y<=sh.box.y1;y++)for(let x=sh.box.x0;x<=sh.box.x1;x++){const i=y*w+x;if(sh.ids[i]===sh.id)baseMass[i]+=(sh.graded?sh.graded[i]:sh.amount);}
 let warm=0,warmPainted=0;for(let i=0;i<n;i++)if(ctx.px[3*i]-ctx.px[3*i+2]>18&&ctx.px[3*i+1]-ctx.px[3*i+2]>8){warm++;if(baseMass[i]>0)warmPainted++;}
 fs.writeFileSync(path.join(out,'value-region-check.json'),JSON.stringify({source:ctx.VALUE_PLAN.regions.source,band1UnsupportedAxisEdges:seams,regionCount:ctx.VALUE_PLAN.regions.regions.length,regions:ctx.VALUE_PLAN.regions.regions,warmTargetCells:warm,warmCellsWithPositiveBand1Pigment:warmPainted,physicalReserve:'same target-white mask as compiled plan'},null,2));
 // --subjectorder s (0..1): the plan's subjectOrder brought on subject by subject, light to dark within each, held back
 // by s (src/paint/methods/subject-order.mjs). 0, the default, keeps the whole-sheet bands.
 {const so=num('subjectorder',0);if(!(so>=0&&so<=1))throw Error('--subjectorder: a number from 0 to 1');
  const field=VALUE_CONFIG?.subjectOrder?subjectField({subjectOrder:VALUE_CONFIG.subjectOrder,families:VALUE_CONFIG.families??[],labels:ctx.VALUE_PLAN.regions.labels,w,h}):null;
  if(so>0&&!field)console.log('subject order: the plan names no subjectOrder; whole-sheet bands kept');
  const r=orderBySubject(ctx.layers,{field,strength:so,w,n,seam:num('subjectseam',0)});
  if(r.summary){ctx.layers=r.layers;fs.writeFileSync(path.join(out,'subject-order.json'),JSON.stringify({strength:so,overlap:OVERLAP,subjects:r.summary,passes:r.order},null,1));
   {const pal=[[230,159,0],[86,180,233],[0,158,115],[240,228,66],[0,114,178],[213,94,0],[204,121,167],[120,120,120]],img=Buffer.alloc(n*3);for(let i=0;i<n;i++){const c=pal[field.rank[i]%pal.length];img[3*i]=c[0];img[3*i+1]=c[1];img[3*i+2]=c[2];}await sharp(img,{raw:{width:w,height:h,channels:3}}).png().toFile(path.join(out,'subject-order.png'));}
   console.log(`subject order ${so}: ${ctx.layers.length} passes; ${r.summary.map(q=>`${q.subject} ${(100*q.share).toFixed(0)}% passes ${q.first}-${q.last}`).join(', ')}`);}}
 ctx.HOLD=ctx.VALUE_PLAN.protectedCells;
 fs.writeFileSync(path.join(out,'value-plan.json'),JSON.stringify({stage:'executable target-value plan before physical instruments',style:ctx.VALUE_PLAN.style,target:opt('image'),caps:[.16,.32,.50,.75,1],peakDensity:ctx.VALUE_PLAN.value.peak,geometry:ctx.VALUE_PLAN.geometry,omittedReservedOrSpeckDemand:ctx.VALUE_PLAN.omittedDemand,lights:ctx.VALUE_PLAN.lightShapes,explicitLights:VALUE_CONFIG?.reserves??[],mixes:ctx.VALUE_PLAN.mixes,summary:ctx.VALUE_PLAN.summary,passes:ctx.VALUE_PLAN.instructions,drawing:'sparse structure first; lighter selective closing ink after dry gate'},null,2));
 // --valuemaps 1: the value plan as maps for diagnosis (value band per cell, colour region, reserved lights) and every
 // passage's cells in paint order, to value-maps.json.gz. Read by nothing in the painter.
 if(num('valuemaps',0)>0){const caps=[.16,.32,.50,.75,1],vv=ctx.VALUE_PLAN.value.values,band=Array.from(vv,v=>v<=0?0:caps.findIndex(t=>v<=t)+1||5);
  const passes=ctx.layers.flatMap((l,L)=>l.shapes.map(sh=>{const m=sh.mask,cells=[];if(m)for(let i=0;i<n;i++)if(m[i])cells.push(i);return {L,id:sh._valuePlan?.id??null,phase:l._valuePhase??null,value:l.value,pigment:l.pigment,amount:sh.amount,area:sh.area,cells};}));
  fs.writeFileSync(path.join(out,'value-maps.json.gz'),zlib.gzipSync(JSON.stringify({w,h,caps,band,value:Array.from(vv,v=>+v.toFixed(3)),labels:Array.from(ctx.VALUE_PLAN.regions.labels),protected:ctx.VALUE_PLAN.protectedCells?Array.from(ctx.VALUE_PLAN.protectedCells):[],passes})));}
 console.log(ctx.VALUE_PLAN.mixes?`wash plan: ${ctx.layers.length} mixes, ${ctx.VALUE_PLAN.instructions.length} washes in ${ctx.VALUE_PLAN.summary.stages} stages`:`target values: ${ctx.layers.length} pigment/region passes, ${ctx.VALUE_PLAN.instructions.length} connected shapes; five light-to-dark bands; shadows never split by region`);
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
// --paper coldpress (default): the cold-press relief in micrometres at physical size (src/media/paper-relief.mjs); any other value keeps the value-noise tooth.
const CP_MM = opt('paper', 'coldpress') === 'coldpress' ? (PB ? PB.mmPerCell : num('sheetmm', DEFAULT_SHEET_MM) / W2) : 0;
// --paperphysical 0|1: fibre lengths, density and brush relief in millimetres. Default 1.
const PAPER_PHYSICAL_MM = num('paperphysical', 1) > 0 ? (PB ? PB.mmPerCell : num('sheetmm', DEFAULT_SHEET_MM) / W2) : 0;
const PAPER_OPTS = { ...(PAPER_PHYSICAL_MM > 0 ? { mmPerCell: PAPER_PHYSICAL_MM } : {}), seed: 9, scale: SC, toothScale: num('toothscale', 0.2), fibres: num('paperfibres', 0.5), tooth: num('papertooth', 0.5), proudBlur: num('proudblur', 1),
  ...(CP_MM ? { coldPress: { mmPerCell: CP_MM } } : {}) }; ctx.PAPER_OPTS = PAPER_OPTS;
if (CP_MM) console.log(`paper: cold press relief in micrometres at ${CP_MM.toFixed(3)} mm a cell (src/media/paper-relief.mjs)`);
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
// Granulation is each pigment's own (gamma, floc from src/paint/methods/pigment-physics.mjs) on this paper, with no scale.
// Settled grains roll into the hollows only until the slope is gone (slideCap 1, sheet.mjs): with no cap, heavy
// granulation overfilled a neighbour, rolled back the next step, and dried as a one-cell checkerboard, not granulation.
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
 const ST=ctx.INK_LINES?.[stage]?.stats, firm=ST?.inkAbsorbance>0, A=firm?ST.inkAbsorbance:ST?.peakAbsorbance;
 if(!(A>0)){INK_MATCH[stage]={factor:1,why:'no measured target lines for this stage'};console.log(`ink dark match, ${stage}: no measured target lines, load unchanged`);return 1;}
 const sample=sampleGestures(gs,60), N=INKRES?.N??1, fw=w*N, fh=h*N;
 const baseOpts=(()=>{const {edgeStrength,state,audit,O:o,...rest}=optionsAt(1);return rest;})();
 const r=cachedStepSync({...RUN_CACHE,name:`ink-dark-match-${stage}`,code:codeHash(root,[],{dependencies:['src/paint/methods/ink-match.mjs','src/paint/methods/fine-material.mjs','src/paint/methods/material-profiles.mjs','src/media/draw.mjs','src/media/pen.mjs']}),track:optTrack,inputs:{stage,A,firm,sample,N,w,h,PAPER_OPTS,INK,baseOpts,...(INKRES?{}:{want})}},()=>{
  const paper=INKRES?INKRES.fine.paper:makePaper(w,h,PAPER_OPTS);
  if(paper.w!==fw||paper.h!==fh)throw Error('Ink calibration paper dimensions differ');
  const absorbance=sampledInkAbsorbance(fw,fh,N>1?fineGestures(sample,N):sample,firm?{quantile:INK_STRENGTH_QUANTILE,paperL:100}:{});
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
  const res=matchInkLoad({targetAbsorbance:A,cap:num('inkdarkmatch',(ctx.INK_LINES?.[stage]?.stats?.peakAbsorbance??ctx.INK_LINES?.[stage]?.targetAbsorbance)>0?1:0),measure,hi:num('inkloadmax',4)});
  console.log(`ink dark match, ${stage}: target ${firm?'firm lines against paper':'lines'} ${A.toFixed(2)} absorbance; ${sample.length} of the stage's strokes on a blank sheet read ${res.before.toFixed(2)}, so the load is scaled by ${res.factor.toFixed(3)} (now ${res.after.toFixed(2)})`);
  return res;
 }).value;
 INK_MATCH[stage]={...r,target:A,sample:sample.length};
 fs.writeFileSync(path.join(out,'ink-dark-match.json'),JSON.stringify(INK_MATCH,null,1)+'\n');
 return r.factor;
}
const penDraw = (sh,gs,want,w,h,o0) => {
 const stage=ctx.DRAW_STAGE, graphite=o0.ink?.[GRAPHITE_AT]>0, inkAt=PIGS.length;
 const withLoad=f=>({...o0,ink:o0.ink.map((v,j)=>j===inkAt?v*f:v)});
 const matched=!graphite&&INK&&num('inkdarkmatch',(ctx.INK_LINES?.[stage]?.stats?.peakAbsorbance??ctx.INK_LINES?.[stage]?.targetAbsorbance)>0?1:0)>0&&o0.ink?.[inkAt]>0;
 const o=matched?withLoad(inkDarkMatch(stage,gs,f=>({...withLoad(f),medium:opt('inkprofile',REQUESTED_DRAW_MEDIUM.endsWith('-ink')?REQUESTED_DRAW_MEDIUM:STYLE_INK_DEFAULT),stage,mmPerCell:(PB?.mm??num('sheetmm', DEFAULT_SHEET_MM))/w,edgeStrength:null,edgeCut:false,state:{used:0},caps:drawingCapsFor(stage,false),audit:[],allowStarvation:num('penstarve',0)>0,dryInk:true,O:undefined,widthFloorMm:INK_WIDTH_FLOOR_MM,pen:{...o0.pen,damp:INK_DAMP}}),want,w,h)):o0;
  const execute=paths=>{const options={...o,...(ctx.NATIVE_CAPTURE&&sh===ctx.sheet?{...(graphite?{afterStroke:e=>ctx.NATIVE_CAPTURE(e.skipped?'graphite-skipped':'graphite')}:{afterSegment:()=>ctx.NATIVE_CAPTURE('ink')}),afterDry:()=>ctx.NATIVE_CAPTURE('drawing-dry')}:{}),medium:graphite?opt('graphiteprofile',REQUESTED_DRAW_MEDIUM.startsWith('graphite-')?REQUESTED_DRAW_MEDIUM:'graphite-HB'):opt('inkprofile',REQUESTED_DRAW_MEDIUM.endsWith('-ink')?REQUESTED_DRAW_MEDIUM:STYLE_INK_DEFAULT),stage,mmPerCell:(PB?.mm??num('sheetmm', DEFAULT_SHEET_MM))/w,edgeStrength:null,edgeCut:false,state:DRAW_MATERIAL_STATE[stage],caps:drawingCapsFor(stage,graphite),audit:PEN_STATE_AUDIT,allowStarvation:num('penstarve',0)>0,dryInk:stage!=='closing'||num('finishinkdamp',0)<=0,...(graphite?{}:{widthFloorMm:INK_WIDTH_FLOOR_MM,pen:{...o.pen,damp:INK_DAMP}})};return INKRES&&!graphite?drawFineMaterial(INKRES,paths,{w,h,...options,cache:{...RUN_CACHE,code:CODE_HASH,track:optTrack}}):drawMaterial(sh,paths,want,w,h,options);};
 return execute(gs);
};
const OUT_W = INKRES ? INKRES.width : W2, OUT_H = INKRES ? INKRES.height : H2;
// --encloseease e: a dry cell held by water on more sides fills more easily (src/media/sheet.mjs). Set only when used.
const O = { ...DEFAULTS, fixedBed: num('fixedbed', 1), edgeEvap: num('edge', DEFAULTS.edgeEvap), granFill: num('granfill', 0), slideCap: 1, ...PHYS, ...(num('encloseease', 0) > 0 ? { encloseEase: num('encloseease', 0) } : {}),
  ...(num('holerim', 0) > 0 ? { holeSpan: Math.max(1, Math.round(num('holerim', 0) / (PB ? PB.mmPerCell : num('sheetmm', DEFAULT_SHEET_MM) / W2))) } : {}),
  ...(num('holefill', 0) > 0 ? { holeFill: Math.max(1, Math.round(num('holefill', 0) / (PB ? PB.mmPerCell : num('sheetmm', DEFAULT_SHEET_MM) / W2))) } : {}) };
// --holefill mm: a dry hollow the wash surrounds within mm fills where it is lower than the wet paper beside it.
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
const GPU_INFO = {...attachGpu(ctx.sheet, O, { mode: GPU_MODE, edgeThreads: ctx.gpuEdgeThreads }),nativePaintMode:NATIVE_PAINT_MODE};
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
  if (!link || readActiveStroke(ctx.sheet)) return renderSheet(ctx.sheet, SHEET_PIGS, base, N2, 1);
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
  readActiveStroke(ctx.sheet);
  ctx.LOOK1 ??= { base: LOOK_RELIEF > 0 || LOOK_GRAIN > 0 ? lookBase(paper.height, W2, H2, LOOK_MM) : base, micro: LOOK_MICRO > 0 ? lookMicro(paper.height, W2, H2, LOOK_MC) : null };
  if (ctx.sheet._gpu?.resident && !ctx.sheet._gpu.stroke && process.env.GPU_COMPOSITE === '1' && num('pencilerase',0) === 0) {
    const link=ctx.sheet._gpu;link.initOptical(ctx.sheet,ctx.LOOK1.micro);
    // Only the preparatory ink can change below the immutable paint stack; keep its unrounded reflectance.
    return finishRGB(link.opticalFrame(ctx.sheet,getOpticalUnder(ctx.LOOK1.base,ctx.LOOK1.micro)));
  }
  if (ctx.sheet._gpu?.resident && !ctx.sheet._gpu.stroke && process.env.GPU_OPTICS !== '0') {
    // Keeps the reference's double-precision pigment sum and KM arithmetic; only completed lower layers are cached.
    return finishRGB(renderLayersCached(layersOf(ctx.sheet), SHEET_PIGS, ctx.LOOK1.base, N2, 1, ctx.LOOK1.micro));
  }
  return finishRGB(renderLayers(layersOf(ctx.sheet), SHEET_PIGS, ctx.LOOK1.base, N2, 1, undefined, ctx.LOOK1.micro));
};
const renderFine = () => {
  const N = LOOK_RES, FW = W2 * N, FH = H2 * N, FN = FW * FH, mm = LOOK_MM / N;
  const hgt = CP_MM ? paperRelief(FW, FH, CP_MM / N, { seed: PAPER_OPTS.seed, relief: PAPER_OPTS.relief ?? 'cold' }).height : lookUp(paper.height, W2, H2, N);
  const fbase = lookBase(hgt, FW, FH, mm), micro = LOOK_MICRO > 0 ? lookMicro(hgt, FW, FH, N * LOOK_MC) : null;
  const Kp = SHEET_PIGS.map(p => p.K), Sp = SHEET_PIGS.map(p => p.S), R = new Float64Array(FN * 3), outF = new Uint8ClampedArray(FN * 3);
  for (let i = 0; i < FN * 3; i++) R[i] = fbase[i] / 255;
  const layers = layersOf(ctx.sheet);
  // on a physical sheet each layer's pigment is spread over the same paper evaluated N times finer (subcell-grain.mjs),
  // not enlarged cells: granulating paint in the fine pits, every cell keeping its own pigment
  const fineLayers = CP_MM && N > 1 ? subcellLayers(layers, SHEET_PIGS, ctx.sheet.paper, N) : null;
  let mIn = 0, mOut = 0;
  layers.forEach((L, q) => {
    const fine = fineLayers ? fineLayers[q] : L.map(a => lookUp(a, W2, H2, N));
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
 colourTrace.push({stage,held,booked:sum(expected),...extra});
}

// --brushshare s: widest brush as a share of the sheet's short side, so it keeps its size against the picture. Default 0.076.
const BRUSH = PB ? Math.max(3 * SC, Math.round(PB.washR)) : Math.max(3 * SC, Math.round(num('brushshare', 0.076) * Math.min(W2, H2)));
// --heading sweep|sheet: hold a wash brush square to its sweep (default) or to the sheet (brush.mjs, stroke's upright).
const UPRIGHT = opt('heading', 'sweep') === 'sheet' ? true : 'sweep';

// Masking fluid goes on a few deliberate lights only: large enough (--maskmin) and surrounded by paint (--maskcount largest).
const highlights = (() => {
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
})();
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
// The brush the section brush's swatch is laid with: the one that lays most of the wash plan's stroke length (its
// rounds, or a flat where lanes lay most), at its size in cells; with no wash plan, the sheet's wash flat.
const swatchBrush = () => {
  const cpm = W2 / num('sheetmm', DEFAULT_SHEET_MM), by = new Map();
  for (const l of ctx.layers ?? []) for (const sh of l.shapes ?? []) for (const st of Array.isArray(sh._valuePlan?.strokes) ? sh._valuePlan.strokes : []) {
    let len = 0; for (let q = 1; q < st.points.length; q++) len += Math.hypot(st.points[q][0] - st.points[q - 1][0], st.points[q][1] - st.points[q - 1][1]);
    const key = `${st.kind === 'lane' ? 'flat' : 'round'} ${st.radiusMm}`; by.set(key, (by.get(key) ?? 0) + len);
  }
  if (!by.size) return { radius: Math.min(BRUSH, 16), flat: true };
  const [kind, mm] = [...by].sort((a, b) => b[1] - a[1])[0][0].split(' ');
  return { radius: Math.max(SC, Number(mm) * cpm), flat: kind === 'flat' };
};
const section = isSection(painterBrushOptions({}));
// Each technique laid on scrap (src/paint/methods/scrap-swatch.mjs), plain and, under --gradedwash, recharged every few
// cells along its sweep as a graded wash is. `drySwatch` dries the scrap. `damp`: each technique is laid over a wash that
// has just lost its shine (damp-swatch.mjs), as a painting script's passage laid beside damp is, and read apart from it.
const scrapSwatches = (techniques, drySwatch, { damp = false } = {}) => {
  const { want } = SWATCH;
  // A graded wash is recharged every few cells along its sweep (--gradedwash), so each technique is also laid on scrap
  // recharged that way, and what it lays is kept both inside the swatch and over the whole scrap (see GRADED_CAL).
  // Under --physical the sheet dips a section brush once a load (paint.mjs splitLoads) and never recharges it along a
  // sweep, so its swatch is not chunked either: chunked every few cells of a fine sheet, each chunk was a 2 mm stroke
  // that landed on its tip and laid a tenth of the charge, and charged washes ten times over.
  const CHUNK = opt('gradedwash', '1') !== '0' && !(section && PB) ? Math.max(2, Math.round(GCHUNK)) : 0;
  // --calpipe 1: calibrate with the sheet's own lanes, containment and pressure, not a plain sweep at default pressure.
  // The section brush is always calibrated as the sheet lays a wash (swatchLanes): its tuft levels with the film it
  // finds, so what a wash holds depends on how its sweeps overlap, and one wide sweep over the scrap read 0.6 of what
  // the plan's overlapping rounds lay. Its lanes are the plan's own brush at the plan's overlap, and the swatch is
  // charged for that overlap as a passage is (paint.mjs, sh._cover).
  const layout = () => {
    const mask = swatchMask(), { width: SW, height: SH } = SWATCH;
    if (section) {
      // The swatch is at least sixteen brush widths across: on a fine sheet fifty cells were 13 mm, two lanes of a 7 mm
      // round that never got past landing on its tip. Its scrap's cells grow to fit (the brush lays the same paint a
      // millimetre at any cell size).
      const sheetMm = PAPER_OPTS.mmPerCell ?? 0, brush = swatchBrush(), mm = sheetMm > 0 ? Math.max(sheetMm, 32 * brush.radius * sheetMm / (SWATCH.x1 - SWATCH.x0)) : 0;
      const radius = mm > 0 ? brush.radius * sheetMm / mm : brush.radius, flat = brush.flat;
      const paths = swatchLanes(radius, { overlap: flat ? FLAT_OVERLAP : LANE_OVERLAP }), cover = sweepCover(paths, mask, SW, SH);
      const under = opt('undercover', '1') !== '0' ? 1 / Math.max(num('underfloor', 0.4), Math.min(1, cover)) : 1;
      return { mask, paths, bedPaths: washPaths(mask, SW, SH, { pad: 1.5, minRadius: 1, minLength: 3 }), flat, under: under / Math.max(1, cover) / Math.max(1, footprintSpread(paths, mask, SW, SH)),
        paperOptions: mm > 0 ? { ...PAPER_OPTS, seed: 5, mmPerCell: mm, ...(PAPER_OPTS.coldPress ? { coldPress: { ...PAPER_OPTS.coldPress, mmPerCell: mm } } : {}) } : null };
    }
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
    return { mask, paths, under, flat: true };
  };
  const square = layout();
  const paintOpts = (r, T) => ({ flat: square.flat, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: num('washfree', 0.4), film: 0.25, splay: WASH_FLAT_SPLAY, stiffness: 8, wetMix: MIX(T), bridge: washBridge(T, T.bridge), bridgeSoft: T.bridgeSoft, seed: 11 });
  // ... and its bed is wetted as the sheet wets one (tools/painter/wet-bed-prep.mjs): a clean brush made like the swatch's
  // painting brush, its own load metered or not, a thirsty pickup and the wait, not one sweep of a full generic brush
  // read over the cells the swatch's brush touches, as the sheet reads its bed over the stroke's contact; on value and
  // area runs alike, so an area pass laid into wet is charged from a swatch laid into a bed as its own is
  const contactOf = (scrap, pts, r, T) => { const b = createBrush(paintOpts(r, T)); dipBrush(b, { water: WET(T), conc: [0] }); const c = candidateContact(b, scrap, pts, { upright: UPRIGHT, clip: null, neighborRadius: 0, includeTouched: false }); return c.cells.filter(i => c.primaryMask[i]); };
  const prepareBed = ctx.VALUE_PLAN ? (scrap, pts, r, T, _lane, cells = contactOf(scrap, pts, r, T)) => prepareWetBed({ settings: paintOpts(r, T), bristles: Math.max(12, Math.ceil(r * 2)), seed: 911, pigments: scrap.K, target: scrap, points: pts, prepOpts: { upright: UPRIGHT, lift: false },
    observe: () => measurePaper(scrap, cells, SPEED_PAPER, { uniform: false }), gate: () => measurePaper(scrap, cells, SPEED_PAPER, { stats: 'gate' }), advance: () => step(scrap, { ...O, dt: 2 }), createBrush, dip, thirsty, stroke }) : null;
  const settle = ctx.VALUE_PLAN ? (scrap, cells) => { const observe = () => measurePaper(scrap, cells, SPEED_PAPER, { uniform: false }); layIntoWetBed({ paper: observe(), observe, step: o => step(scrap, o), O, info: { scrap: 'wet on wet swatch', cells: cells.length } }); } : null;
  // The scrap is the sheet's own paper (its millimetres a cell and its tooth), with another seed: the section brush's
  // load and transfer are in millimetres, so a scrap with no physical scale ran it at the reference 0.26 mm a cell and
  // calibrated a 64-cell picture's 2.3 mm cells as if they were a tenth the size (forms carried 162% of the plan).
  const envOf = () => { const { under, flat: _flat, paperOptions, ...lanes } = square; return { ...lanes, pigment: PIGS[0], physics: O, paperOptions: paperOptions ?? { ...PAPER_OPTS, seed: 5 }, charge: want * num('strength', 2.2) * under, upright: UPRIGHT, water: WET, dip, stroke, step, dry: drySwatch, settle,
    waterBrush: r => createBrush({ flat: true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, seed: 5 }),
    paintBrush: (r, T) => createBrush(paintOpts(r, T)), prepareBed }; };
  return techniques.map(T => {
    const env = envOf();
    if (damp) {
      const scrap = dampScrap({ pigment: env.pigment, paperOptions: env.paperOptions, wait: dampWait,
        lay: under => scrapDelivery(DAMP_WASH(), { ...env, charge: env.charge * CAL['wet on wet'], scrap: under, channel: DAMP_CHANNEL.under, finish: false }) });
      // the wash is the bed: the passage's own technique wets none of its own
      const before = thicknessTotals(scrap)[DAMP_CHANNEL.under], plain = scrapDelivery({ ...T, intoWet: false }, { ...env, scrap, channel: DAMP_CHANNEL.own });
      return { technique: T, plain: { ...plain, lift: liftShare(before, thicknessTotals(scrap)[DAMP_CHANNEL.under]) }, graded: null };
    }
    return { technique: T, plain: scrapDelivery(T, env), graded: CHUNK ? scrapDelivery({ ...T, name: `${T.name} graded`, chunk: CHUNK }, env) : null };
  });
};
// The wash a damp swatch is laid over: the stock wet-into-wet wash; and the wait until its shine has gone, as the sheet
// waits on a damp neighbour (tools/painter/beside-damp.mjs).
const DAMP_WASH = () => STOCK_TECHNIQUES.find(T => T.name === 'wet on wet');
const dampWait = (scrap, cells) => waitBesideDamp({ observe: () => measurePaper(scrap, cells, SPEED_PAPER, { uniform: false }), step: o => step(scrap, o), O });
// One mark on scrap (src/paint/methods/mark-swatch.mjs), with the brushes, dip, stroke, bed and drying the lane swatches use.
// A mark of a passage laid beside damp (mark.damp) is tried over a damp wash, laid first in lanes of a round an eighth
// of the swatch wide.
const scrapMark = (T, mark) => {
  const sheetMm = PAPER_OPTS.mmPerCell ?? 0, L = markLayout(mark, sheetMm);
  const opts = (r, T) => ({ flat: false, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: num('washfree', 0.4), film: 0.25, splay: WASH_FLAT_SPLAY, stiffness: 8, wetMix: MIX(T), bridge: washBridge(T, T.bridge), bridgeSoft: T.bridgeSoft, seed: 11 });
  const contactOf = (scrap, pts, r, T) => { const b = createBrush(opts(r, T)); dipBrush(b, { water: WET(T), conc: [0] }); const c = candidateContact(b, scrap, pts, { upright: UPRIGHT, clip: null, neighborRadius: 0, includeTouched: false }); return c.cells.filter(i => c.primaryMask[i]); };
  // a mark laid into wet goes into a bed wider than itself (the wet passage it is laid in), wetted along the mark's path
  // with a round at least twice its width pressed flat: a bed only as wide as a thin mark is mostly edge and never reads as wet
  const prepareBed = (scrap, pts0, r0, T) => { const r = Math.max(2 * r0, 6), pts = pts0.map(q => ({ ...q, r, p: 1 })), cells = contactOf(scrap, pts, r, T);
    return prepareWetBed({ settings: opts(r, T), bristles: Math.max(12, Math.ceil(r * 2)), seed: 911, pigments: scrap.K, target: scrap, points: pts, prepOpts: { upright: UPRIGHT, lift: false },
    observe: () => measurePaper(scrap, cells, SPEED_PAPER, { uniform: false }), gate: () => measurePaper(scrap, cells, SPEED_PAPER, { stats: 'gate' }), advance: () => step(scrap, { ...O, dt: 2 }), createBrush, dip, thirsty, stroke }); };
  const settle = (scrap, cells) => { const observe = () => measurePaper(scrap, cells, SPEED_PAPER, { uniform: false }); layIntoWetBed({ paper: observe(), observe, step: o => step(scrap, o), O, info: { scrap: 'wet on wet mark swatch', cells: cells.length } }); };
  const env = { pigment: PIGS[0], physics: O, paperOptions: { ...PAPER_OPTS, seed: 5, mmPerCell: L.mm, ...(PAPER_OPTS.coldPress ? { coldPress: { ...PAPER_OPTS.coldPress, mmPerCell: L.mm } } : {}) },
    upright: UPRIGHT, water: WET, dip, stroke, step, settle, prepareBed,
    dry: (scrap, max, o, options) => physicalDry(scrap, max, o, nativeDryOptions(NATIVE_PAINT_MODE.mode, options)), paintBrush: (r, T) => createBrush(opts(r, T)) };
  const washLanes = () => swatchLanes((SWATCH.x1 - SWATCH.x0) / 16), washMask = () => swatchMask();
  const scrap = mark.damp ? dampScrap({ pigment: env.pigment, paperOptions: env.paperOptions, wait: dampWait,
    lay: under => { const mask = washMask(), paths = washLanes(); scrapDelivery(DAMP_WASH(), { ...env, mask, paths, charge: SWATCH.want * num('strength', 2.2) * CAL['wet on wet'] / Math.max(1, sweepCover(paths, mask, SWATCH.width, SWATCH.height)), scrap: under, channel: DAMP_CHANNEL.under, finish: false }); } }) : null;
  if (!scrap) return markDelivery(T, { ...env, mask: L.mask, paths: L.paths, charge: SWATCH.want * num('strength', 2.2) / L.cover });
  // the wash is the bed: the mark wets none of its own; what its brush took up of the wash is reckoned over the wash under its footprint
  const before = thicknessTotals(scrap)[DAMP_CHANNEL.under], r = markDelivery({ ...T, intoWet: false }, { ...env, mask: L.mask, paths: L.paths, charge: SWATCH.want * num('strength', 2.2) / L.cover, scrap, channel: DAMP_CHANNEL.own });
  return { ...r, lift: liftShare(before, thicknessTotals(scrap)[DAMP_CHANNEL.under], L.mask.reduce((a, v) => a + v, 0) / ((SWATCH.x1 - SWATCH.x0) * (SWATCH.y1 - SWATCH.y0))) };
};
const gradedReading = g => (g ? { all: g.all, escape: g.escape, edge: g.edge } : null);
const CAL_RESULT = await cachedStep({...RUN_CACHE,name:'calibration',enabled:RUN_CACHE.enabled,code:CODE_HASH,track:optTrack,inputs:{pigment:PIGS[0],O,PAPER_OPTS,GCHUNK,BRUSH,swatchBrush:swatchBrush(),UPRIGHT,LOADED_CONTACT,WASH_SPLAT_SETTINGS,settles:Boolean(ctx.VALUE_PLAN),physical:PB?{cfg:PB.cfg,mmPerCell:PB.mmPerCell}:null}},async () => {
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
// stock glazed swatch is two passes at 0.58 and lays 2.5 times as much. A passage
// laid into wet is charged the same way (chargedFromOwnSwatch).
// --markswatches n: how many of a mark passage's strokes are tried on scrap, taken where its planned paint lies
// (mark-swatch.mjs representativeMarks); the passage is charged by the mean of what they lay. Default 3.
const MARK_SWATCHES = num('markswatches', 3);
// --dampchargemost k: the most a script's passage laid into wet paint is charged, as a multiple of the same instrument's
// charge on dry paper (damp-swatch.mjs dampCharge). Default 8.
const DAMP_CHARGE_MOST = num('dampchargemost', 8);
// --dampshare s: a script's passage is laid into wet paint, and charged from a swatch laid so, when at least this share
// of its cells already hold paint of its own wet sitting (damp-swatch.mjs isDampPassage). Default 0.5.
const DAMP_SHARE = num('dampshare', 0.5);
const swatchDry = (scrap, max, o, options) => physicalDry(scrap, max, o, nativeDryOptions(NATIVE_PAINT_MODE.mode, options));
const INSTRUMENT_CAL = createInstrumentCal({
  stock: Object.fromEntries(STOCK_TECHNIQUES.map(T => [T.name, { technique: T, cal: CAL[T.name], graded: GRADED_CAL[`${T.name} graded`] ?? null }])),
  // the scrap dries as the stock swatches do, without touching the painting's own wet-contact records
  measure: T => { const [{ plain, graded }] = scrapSwatches([T], (scrap, max, o, options) => physicalDry(scrap, max, o, nativeDryOptions(NATIVE_PAINT_MODE.mode, options))); return { cal: chargeFactor(plain.delivered), graded: gradedReading(graded) }; },
  // a mark's swatch: the mark itself on the sheet's own paper, its brush a round of its width, charged as a passage of
  // separate marks is, and read for all the paint it lays (mark-swatch.mjs readMark, mass), so the sheet holds the
  // passage's planned paint. A mark of a passage laid into wet paint (mark.damp) is tried over a damp wash; its reading
  // carries what its brush took up of the wash, and instrumentOf reckons the passage's own factor from both.
  measureMark: (T, mark) => { const r = scrapMark(T, mark); return { cal: chargeFactor(r.mass), mass: r.mass, lift: r.lift ?? 0, delivered: r.delivered, whole: r.whole, coverage: r.coverage, covered: r.covered }; },
  markKey,
  // a script's wash laid into wet paint: its lanes over a damp wash; what it laid of its own paint (all of it: in a wet
  // wash it runs past the swatch's square) and what it took up of the wash
  measureDamp: T => { const [{ plain }] = scrapSwatches([T], swatchDry, { damp: true }), dry = INSTRUMENT_CAL.of(T).cal; return { cal: dampCharge(plain.all, { lift: plain.lift, under: 1, dry, most: DAMP_CHARGE_MOST }).cal, delivered: plain.all, lift: plain.lift, dry }; },
  log: line => console.log(line),
});
const ownSwatch = T => chargedFromOwnSwatch(T, { instrumentOn: true, authored: false });
// a passage of separate marks (a painting script's strokes, touches and lines) is charged from a swatch of its own mark
// and a script's passage laid into paint still wet from its own sitting from a swatch laid over a damp wash, reckoned
// for the wash that lies under that passage (damp-swatch.mjs); the reading then carries damp: true
const instrumentOf = (T, sh = null) => {
  const damp = isDampPassage(sh, DAMP_SHARE), under = damp ? underOf(sh) : 0;
  if (ownSwatch(T) && isMarkPassage(sh)) {
    const marks = representativeMarks(sh._valuePlan.strokes, MARK_SWATCHES), depth = sh._cover ?? 1;
    // each mark's swatch, on dry paper (or its own wet bed) and, for a passage laid into wet paint, over a damp wash;
    // the passage's reading is the mean of what its marks lay
    const read = into => { const rs = marks.map(mark => INSTRUMENT_CAL.ofMark(T, { ...mark, depth, damp: into })); return { mass: rs.reduce((a, r) => a + r.mass, 0) / rs.length, lift: rs.reduce((a, r) => a + r.lift, 0) / rs.length }; };
    // a mark swatch that cannot be laid (its wet bed never reached its window on the scrap) does not stop the plate: the
    // passage is charged from its technique's lane swatch, and the log says so in capitals
    if (marks.length) try {
      const dry = read(false), dryCal = chargeFactor(dry.mass), own = { graded: null, key: null, stock: false, marks: marks.length };
      if (!damp) return { ...own, cal: dryCal, mass: dry.mass };
      const wet = read(true);
      return { ...own, ...dampCharge(wet.mass, { lift: wet.lift, under, dry: dryCal, most: DAMP_CHARGE_MOST }), mass: wet.mass, lift: wet.lift, dry: dryCal, under, damp };
    } catch (e) { console.log(`MARK SWATCH FAILED for passage ${sh._valuePlan.script?.passage ?? sh._valuePlan.id} (${T.name}, brush ${(2 * marks[0].radiusMm).toFixed(1)} mm): ${e.message.slice(0, 160)}; CHARGED FROM THE WASH LANE SWATCH INSTEAD`); ctx.MARK_SWATCH_FAILURES = (ctx.MARK_SWATCH_FAILURES ?? 0) + 1; }
  }
  if (ownSwatch(T) && damp) { const r = INSTRUMENT_CAL.ofDamp(T); return { ...r, ...dampCharge(r.delivered, { lift: r.lift, under, dry: r.dry, most: DAMP_CHARGE_MOST }), under, damp }; }
  return ownSwatch(T) ? INSTRUMENT_CAL.of(T) : INSTRUMENT_CAL.byName(T.name);
};
// every instrument the value plan names is tried on scrap before the first wash
if (ctx.VALUE_PLAN) {
  const planned = [...new Map(ctx.layers.flatMap(l => (l.shapes ?? []).filter(sh => sh._valuePlan).map(sh => [sh, valueTechnique(sh._valuePlan)])).filter(([, T]) => ownSwatch(T)).map(([, T]) => [instrumentKey(T), T])).values()];
  const saved = await cachedStep({...RUN_CACHE,name:'instrument-calibration',code:CODE_HASH,track:optTrack,inputs:{pigment:PIGS[0],O,PAPER_OPTS,GCHUNK,BRUSH,swatchBrush:swatchBrush(),UPRIGHT,LOADED_CONTACT,WASH_SPLAT_SETTINGS,physical:PB?{cfg:PB.cfg,mmPerCell:PB.mmPerCell}:null,stock:CAL_RESULT.value,instruments:planned.map(instrumentKey)}},async () => {
    for (const T of planned) INSTRUMENT_CAL.of(T);
    return INSTRUMENT_CAL.entries();
  });
  if (saved.cached) INSTRUMENT_CAL.load(saved.value);
}

Object.assign(ctx, { dry, dip, dipLoad, productionDip, stroke, pencilDraw, SC, H2, N2, GFLOOR, GCHUNK, CP_MM, paper, PROBE,
  ABLATE, INKRES, PEN_STATE_GATE, PEN_STATE_AUDIT, TARGET_DRAW_EDGE, sourceInkDrawing, drawingCapsFor, penDraw, 
  OUT_W, OUT_H, O, GPU_INFO, base, SHADE, TONE_STAGE, render, LOOK_RES, view, renderFine, 
  colourTrace, traceBox, traceCells, BRUSH, UPRIGHT, highlights, expected, DELIVERY, DCAL, TECH_CAL, TCAL, 
  sheetDensity, marks, PENDING_IO, framer, drainFrames, mark, WET, MIX, 
  washBridge, CAL, instrumentOf });
if(opt('marks','0')!=='0'){
 ctx.NATIVE_UNOBSERVED_ROUTES=[];
 ctx.NATIVE_RECORDER=createNativeOperationRecorder({directory:path.join(out,'native-operations'),width:OUT_W,height:OUT_H,provenance:{code:CODE_HASH,backend:GPU_INFO},resumeFrom:opt('resumestate','')?path.join(opt('resumestate',''),'native-operations'):null});
 ctx.NATIVE_MARK_COUNTS={brush:0,ink:0,graphite:0};
 ctx.NATIVE_CAPTURE=operation=>{if(ctx.NATIVE_RECORDING_FAILURE)return;try{ctx.NATIVE_RECORDER.capture(INKRES?INKRES.compose(view()):view(),{operation,stage:ctx.STAGE??{stage:'paper'}});if(Object.hasOwn(ctx.NATIVE_MARK_COUNTS,operation))ctx.NATIVE_MARK_COUNTS[operation]++;}catch(error){ctx.NATIVE_RECORDING_FAILURE=error.message;console.error('NATIVE RECORDING FAILED: '+error.message+'; capture stopped, painting continues to retain its final image, and this run will fail.');}};
 if(INKRES)for(const name of ['wet','carry','settle']){const original=INKRES[name];INKRES[name]=(...args)=>{const value=original(...args);ctx.NATIVE_CAPTURE('ink-'+name);return value;};}
 if(!opt('resumestate',''))ctx.NATIVE_CAPTURE('initial');
}

}
