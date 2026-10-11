import { planLines } from '../drawing-plan.mjs';
import { materialProfile } from './material-profiles.mjs';
import sharp from 'sharp';
import {separate} from '../../crop/inkwash.mjs';
import {registerReviewedWholeDrawing} from './reviewed-whole-registration.mjs';
// --drawinglogic 1: the walker's inking logic, run over a selected drawing file instead of bypassed by it.
//
// Without the flag drawing-file.mjs draws every line of the file whole, in the file's order, at the file's own
// pressure: no ink budget, no tiers, no ink filter, no joining, no hand's ordering and no taper. With it:
//
//   first pen (--drawingfile <base>): form only. The file ranked by tier (drawing-rank.mjs), each tier inside its share
//     of the ink budget, the features outside it, the ink filter over the structure, then connected, put in a hand's
//     order and shaped with a press-in and a lift-off (drawing-hand.mjs).
//   closing pen (--drawinglast <base>, the same file or another): toning. What the first pen did not take, cut to where
//     the painting still needs darkening and off the lights, lighter than the form lines.
//
// Flags, with their defaults:
//   --drawformbudget 1.5       the ink budget's multiplier for the first pen (paint-plate's CELLS times this)
//   --drawtier1 0.5 --drawtier3 0.3 --drawtier4 0.15   each tier's share of that budget
//   --drawsillen 0.04        the shortest silhouette line, as a share of the sheet's short side
//   --drawfeatures 40        the most feature lines, by contrast; every short line on the file's `face` object is one
//   --drawfill 0.1           the share of the budget the tiers left that goes on more short subject lines
//   --drawfilter 0           the ink filter over tiers 3 and 4, off: it reads a file's line round a dark mass as a
//                            wash step and drops it
//   --drawjoingap 8          cells between two ends that may be joined; --drawjoincos 0.7, --drawjoinaim 0.6
//   --drawtaperin 3, --drawtaperout 5 (cells, times K), --drawtaperstart 0.45, --drawtaperend 0.3
//   --drawformfloor 0.7      the first pen's darkness where the file says 0 (its own darkness spans the rest)
//   --drawtonewant 0.6       the closing pen's pressure share at full darkness, the file's own (--drawwant)
//   --drawtonelight 0.12     source density under which a point is a light
//   --drawtonelo 0, --drawtonehi 0   the need gate, off: set hi above 0 to lay toning only where the painting still
//                            needs darkening, kept from lo and all of it at hi
//
// --drawinglogic 3: logic 1's routing with logic 2's weight, fewer longer strokes, lit edges left open and the dark
// masses as looping scribble (drawing-scribble.mjs); the closing pen is logic 1's.
//
// --drawinglogic 2 is the hybrid in drawing-hybrid.mjs: the walker's gestures laid on the file's lines for the first
// pen (--hybridreach 6, --hybridpar 0.6, --hybridstay 3, --hybridjoin 0.03 of the short side, --hybridkeep 12, --hybridbridge 0.12 of the short side, --hybridmin 6, --hybridfloor 0.55,
// --hybridsupport 0.4 the least share of a gesture on file lines, --hybridwant 1.3, --hybridmix 0.4, --hybridfast 2.4,
// --hybridslow 0.6, --hybridstroke 0.25, --hybridload 0.2 and --hybridloadper 0.0006 the dip's load and its rise per cell of gesture, --hybridlow 0.03 how empty before a re-dip), the unused lines as toning.
//
// DOM free. Reads the line file through lines.mjs.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLines,linePaths } from '../../crop/lines.mjs';
import { pathLength } from '../../crop/inktiers.mjs';
import { rankLines, splitForm, inkFilterOn, toneRuns } from './drawing-rank.mjs';
import { connect, handOrder, shapeGesture, personStrokes } from './drawing-hand.mjs';
import { walkOnLines, shapeHybrid, gestureStats } from './drawing-hybrid.mjs';
import { breakOnLights, scribbleMasses } from './drawing-scribble.mjs';
import { edgeChains } from '../../crop/contours.mjs';
import { gaussian } from '../../keyframes/density.mjs';
import { EYE_PLANE_ORDINALS, EYE_PLANE_CONTRAST_MIN } from '../tuned/portrait.mjs';

// Reviewed subject instructions, not inferred object labels. Bind the target and registered trace before using
// path ordinals. The instructions describe one private photograph, so they live outside the repository in
// work/subjects/portrait.json; without that file every subject keeps the ordinary selection.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SUBJECT_FILE = path.join(ROOT, 'work/subjects/portrait.json');
let SUBJECT;
function reviewedSubject() {
 if (SUBJECT === undefined) SUBJECT = fs.existsSync(SUBJECT_FILE) ? JSON.parse(fs.readFileSync(SUBJECT_FILE, 'utf8')) : null;
 return SUBJECT;
}
function requireSubject() {
 const subject = reviewedSubject();
 if (!subject?.drawingFeatures) throw new Error(`reviewed drawing needs ${path.relative(ROOT, SUBJECT_FILE)}, which is not in this repository`);
 return subject;
}
function sameCropBase(base,b,bindingPath){const registered=b.drawingProjection?.traceBase;if(!registered)return false;return path.resolve(ROOT,base)===path.resolve(ROOT,registered)||path.resolve(base)===path.resolve(path.dirname(bindingPath),path.basename(registered));}
const REVIEWED_CROP_DENSITY=new Map();
const REVIEWED_POINT_ROLE=new WeakMap();
export async function prepareReviewedCropDrawing(bindingPath,paperRGB){
 const PORTRAIT=requireSubject(),b=JSON.parse(fs.readFileSync(bindingPath,'utf8')),target=path.resolve(ROOT,PORTRAIT.drawingFeatures.target.path);
 if(b.targetSHA256!==PORTRAIT.drawingFeatures.target.sha256||sha(target)!==b.targetSHA256)throw new Error('Reviewed full-frame drawing target mismatch');
 const projection=b.drawingProjection;
 if(!projection||sha(projection.sourceTrace)!==PORTRAIT.drawingFeatures.traceSHA256||projection.sourceTraceSHA256!==PORTRAIT.drawingFeatures.traceSHA256||projection.projectedTraceSHA256!==projection.traceSHA256)throw new Error('Reviewed source trace binding mismatch');
 const {width:w,height:h}=PORTRAIT.drawingFeatures.target,px=await sharp(target).removeAlpha().resize(w,h,{fit:'fill'}).raw().toBuffer(),pl=(.2126*paperRGB[0]+.7152*paperRGB[1]+.0722*paperRGB[2]);
 const D=Float32Array.from({length:w*h},(_,i)=>Math.max(0,-Math.log(Math.max(.02,Math.min(1,(.2126*px[i*3]+.7152*px[i*3+1]+.0722*px[i*3+2])/pl)))));
 REVIEWED_CROP_DENSITY.set(bindingPath,{b,D,target,inkShare:separate(px,w,h,paperRGB).stats.ink/(w*h)});
}
export function projectSelectedDrawing(gestures,b){
 const {left,top,width:w,height:h}=b.box;
 return gestures.filter(g=>g.points.some((p,i)=>{if(p.x>=left&&p.x<left+w&&p.y>=top&&p.y<top+h)return true;const q=g.points[i-1];return q&&Math.min(p.x,q.x)<left+w&&Math.max(p.x,q.x)>=left&&Math.min(p.y,q.y)<top+h&&Math.max(p.y,q.y)>=top;})).map(g=>({...g,points:g.points.map(p=>({...p,x:p.x-left,y:p.y-top}))}));
}
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function inside(x, y, poly) {
  let yes = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) yes = !yes;
  }
  return yes;
}
export function reviewedFaceFeatures(lines, instruction, { w, h, facePoly }) {
  if (!instruction) return lines;
  if (instruction.features.length > instruction.maxPaths) throw new Error('Reviewed face features exceed their capped path count');
  const byOrdinal = new Map(instruction.features.map(f => [f.ordinal, f]));
  if (byOrdinal.size !== instruction.features.length) throw new Error('Duplicate reviewed face feature ordinal');
  for (const [ordinal, feature] of byOrdinal) {
    const g = lines[ordinal];
    if (!g || g.points.length < 2) throw new Error(`Missing reviewed face feature: ${feature.name}`);
    const share = g.points.filter(q => inside(q.x / w, q.y / h, facePoly)).length / g.points.length;
    if (share < .8 || g.length > (instruction.maxFeatureLength ?? .2 * Math.min(w, h))) throw new Error(`Reviewed face feature lies outside its registered face: ${feature.name}`);
  }
  return lines.map((g,ordinal)=>{
    if(!byOrdinal.has(ordinal))return g;
    const openingPolicy=instruction.openingPolicies?.[ordinal]??null;
    if(instruction.openingPolicies)g.points.forEach((q,sourcePointIndex)=>REVIEWED_POINT_ROLE.set(q,{reviewedOrdinal:ordinal,sourcePointIndex,openingPolicy}));
    return {...g,object:'face',focalFeature:byOrdinal.get(ordinal).name,reviewedOrdinal:ordinal,openingPolicy};
  });
}
function projectReviewedFaceInstructions(instruction,binding,originalOrdinals){const b=binding.box,features=instruction.features.map(f=>({...f,ordinal:originalOrdinals.indexOf(f.ordinal)}));if(features.some(f=>f.ordinal<0))throw new Error('Reviewed eye feature absent from registered crop');return {...instruction,features,maxFeatureLength:.2*Math.min(instruction.target.width,instruction.target.height),facePoly:PORTRAIT.regions.find(r=>r.id==='face').poly.map(([x,y])=>[(x*instruction.target.width-b.left)/b.width,(y*instruction.target.height-b.top)/b.height])};}
function originalFaceInstructions(base, opt) {
  const bindingPath=(opt('revieweddrawingcrop','')||opt('humaneyesreference',''));
  const instruction = (bindingPath ? requireSubject() : reviewedSubject())?.drawingFeatures;
  if(bindingPath){const b=JSON.parse(fs.readFileSync(bindingPath,'utf8'));if(!sameCropBase(base,b,bindingPath))throw new Error('Reviewed crop drawing base mismatch');const p=b.drawingProjection;if(b.targetSHA256!==instruction.target.sha256||sha(p.sourceTrace)!==instruction.traceSHA256||sha(opt('image',''))!==b.cropSHA256||sha(path.resolve(ROOT,linePaths(base).lines))!==p.traceSHA256)throw new Error('Reviewed crop eye target/trace projection mismatch');return projectReviewedFaceInstructions(instruction,b,p.originalOrdinals);}
  const fullTrace=opt('reviewedfulltrace','');
  if (!instruction || (base !== instruction.traceBase && (!fullTrace||linePaths(base).lines!==fullTrace))) return null;
  const image = opt('image', '');
  if (path.basename(image) !== path.basename(instruction.target.path)) return null;
  const target = path.resolve(ROOT, image), trace = fullTrace || path.resolve(ROOT, 'work/lines', `${base}-lines.json`);
  if (sha(target) !== instruction.target.sha256 || sha(trace) !== instruction.traceSHA256)
    throw new Error('Reviewed face instructions do not match target and registered trace');
  return instruction;
}

export function reviewedOpeningStrategy(base,opt){
 const bound=originalFaceInstructions(base,opt);if(!bound)return null;
 return {id:'drawing',region:'hash-bound original3T human-eye structure',referenceCue:'registered target lid/iris rims versus faint under-eye painted planes',move:'existing wet pen on dry opening sheet',edgeValue:'dark fine structural iris rims; slightly stronger upper-lid wing; short faint under-eye cues',protectedLights:'sclera and catchlights remain paper; iris body and pale-plane remainder are paint-owned',brushLoad:'existing pen family, ink mixture, dip and reload; literal per-point contact widths and local weights consumed without added ink/gain',requiredBase:'ordinary opening dry sheet; existing pen material route retained',materialCheck:'actual per-point nib width/share and pen dip/arguments recorded; optical wicking/value remains physical gate',geometry:'original registered points, full-source 40-feature selector then crop projection; under-eye cue is one existing target-supported subset',expectedResult:'fine rims without filling iris body as ink or outlining pale under-eye planes',stop:'cat-opening exports after actual drawing and ordinary dry; artistic gate before wash',openingPolicies:PORTRAIT.drawingFeatures.openingPolicies,binding:{target:PORTRAIT.drawingFeatures.target,traceSHA256:PORTRAIT.drawingFeatures.traceSHA256}};
}

// The target's faint under-eye plane edge is paint-owned outside its strongest
// connected cue. Keep one subset of the original trace, never add a mark or bridge.
function shapeReviewedEyePlane(g,{D,w,h,shape}){
 if(!EYE_PLANE_ORDINALS.includes(g.reviewedOrdinal))return shapeGesture(g,shape);
 const policy=g.openingPolicy??{localContrastMin:EYE_PLANE_CONTRAST_MIN,maxContactWidthCells:2};
 const contrast=q=>{const x=Math.round(q.x),y=Math.round(q.y);let background=Infinity;for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<w&&yy<h)background=Math.min(background,D[yy*w+xx]);}return D[y*w+x]-background;};
 let best=[],run=[];const hold=()=>{if(run.length>=2&&pathLength(run)>pathLength(best))best=run;run=[];};
 for(const q of g.points){if(contrast(q)>=policy.localContrastMin)run.push(q);else hold();}hold();
 if(best.length<2)return null;
 const shaped=shapeGesture({...g,points:best},{...shape,floor:0});
 return {...shaped,openingRole:'pale under-eye plane cue',openingControl:{reference:'registered target local line/background optical contrast >=.22; one longest connected source span',remainder:'paint-owned pale modeling, not opening ink',formFloor:0,maxContactWidthCells:policy.maxContactWidthCells},points:shaped.points.map(q=>({...q,nw:Math.min(policy.maxContactWidthCells,q.nw??policy.maxContactWidthCells)}))};
}

// Policies are attached to the hash-bound original roles before selection. Per-point
// lineage keeps a joined inner corner unchanged while rim and lid points get their own contact.
export function shapeReviewedOpening(g,{D,w,h,shape}){
 if(g.openingPolicy?.kind==='pale-plane')return shapeReviewedEyePlane(g,{D,w,h,shape});
 const role=q=>REVIEWED_POINT_ROLE.get(q)??q,shaped=shapeGesture(g,shape),roles=[...new Set(g.points.map(q=>role(q).reviewedOrdinal).filter(v=>v!=null))];
 if(!g.points.some(q=>role(q).openingPolicy?.kind.startsWith('iris-rim')))return {...shaped,reviewedRoles:roles};
 const points=shaped.points.map((q,i)=>{const raw=g.points[i],meta=role(raw),policy=meta.openingPolicy;if(!policy?.kind.startsWith('iris-rim'))return q;const dark=Math.max(0,Math.min(1,raw.weight??g.weight??1)),oldDark=(shape.floor??0)+(1-(shape.floor??0))*dark,cap=policy.kind==='iris-rim-and-lid'?(meta.sourcePointIndex>=policy.lidStartSourcePoint?policy.lidContactWidthCells:policy.rimContactWidthCells):policy.maxContactWidthCells;return {...q,s:oldDark>0?q.s*dark/oldDark:0,nw:Math.min(cap,q.nw??cap),contactRole:policy.kind==='iris-rim-and-lid'&&meta.sourcePointIndex>=policy.lidStartSourcePoint?'upper lid wing':'structural iris rim',reviewedOrdinal:meta.reviewedOrdinal,sourcePointIndex:meta.sourcePointIndex};});
 return {...shaped,points,reviewedRoles:roles,openingRole:'structural iris rim; stronger upper-lid wing where specified',openingControl:{reference:'hash-bound original role policies; exact registered points and local dark weight',ownership:'iris body paint-owned; sclera/catchlight reserved',policies:Object.fromEntries(g.points.map(role).filter(q=>q.openingPolicy).map(q=>[q.reviewedOrdinal,q.openingPolicy])),formFloor:0}};
}

// The lines the first pen's hybrid walk used, by file and grid, so the closing pen of the same run leaves them out.
const USED = new Map();

export function drawingLogic({ base, first, w, h, opt, num, log, D, want, cells, K = 1, walker = null, field = null, style = null }) {
  const wholeBinding=opt('reviewedwholebinding','');
  if(wholeBinding){
   if(opt('revieweddrawingcrop','')||opt('humaneyesreference',''))throw Error('reviewed whole binding cannot also crop the drawing');
   const prepared=REVIEWED_CROP_DENSITY.get(wholeBinding);if(!prepared)throw Error('Reviewed whole drawing full-source preparation missing');
   const {b,D:fullD,target,inkShare}=prepared,source=requireSubject().drawingFeatures;
   if(sha(opt('image',''))!==b.targetSHA256||sha(path.resolve(ROOT,linePaths(base).lines))!==source.traceSHA256||b.drawingProjection.sourceTraceSHA256!==source.traceSHA256)throw Error('Reviewed whole drawing target/source changed');
   const fullOpt=(name,d)=>name==='reviewedwholebinding'?'':name==='image'?target:name==='reviewedfulltrace'?b.drawingProjection.sourceTrace:opt(name,d);
   const full=drawingLogic({base:b.drawingProjection.sourceTrace.replace(/-lines\.json$/,''),first,w:source.target.width,h:source.target.height,opt:fullOpt,num,log,D:fullD,want,cells:Math.max(inkShare,num('drawfloor',0))*source.target.width*source.target.height*num('inkbudget',6),K:opt('cellscale','0')!=='0'?source.target.width/420:1,style});
   log(`drawing semantics: reviewed whole ${first?'opening':'closing'} selected in original ${source.target.width}x${source.target.height} frame, then registered onto ${w}x${h}; source USED pool shared; pen calibration is separate`);
   return registerReviewedWholeDrawing(full,source.target,{w,h});
  }

  const cropBinding=(opt('revieweddrawingcrop','')||opt('humaneyesreference',''))||opt('shirtreference','')||opt('catlockreference','');
  if(first&&cropBinding){
   const prepared=REVIEWED_CROP_DENSITY.get(cropBinding);if(!prepared)throw new Error('Reviewed crop drawing full-source preparation missing');
   const {b,D:fullD,target,inkShare}=prepared,source=requireSubject().drawingFeatures;
   if(!sameCropBase(base,b,cropBinding)||sha(b.drawingProjection.sourceTrace)!==source.traceSHA256||sha(opt('image',''))!==b.cropSHA256||sha(path.resolve(ROOT,linePaths(base).lines))!==b.drawingProjection.traceSHA256)throw new Error('Reviewed drawing crop bindings changed');
   const fullOpt=(name,d)=>(name==='revieweddrawingcrop'||name==='humaneyesreference'||name==='shirtreference'||name==='catlockreference')?'':name==='image'?target:name==='reviewedfulltrace'?b.drawingProjection.sourceTrace:opt(name,d);
   const full=drawingLogic({base:b.drawingProjection.sourceTrace.replace(/-lines\.json$/,''),first:true,w:source.target.width,h:source.target.height,opt:fullOpt,num,log,D:fullD,want,cells:Math.max(inkShare,num('drawfloor',0))*source.target.width*source.target.height*num('inkbudget',6),K:opt('cellscale','0')!=='0'?source.target.width/420:1,style});
   log(`drawing semantics: selected in original ${source.target.width}x${source.target.height} frame before registered crop projection; no crop reranking or cap`);
   return projectSelectedDrawing(full,b);
  }
  if (!D) throw new Error('drawing logic: no source density');
  const mode = Math.round(num('drawinglogic', 1));
  const skip = new Set(opt('drawingskip', '').split(',').map(r => r.trim()).filter(Boolean));
  const faceInstructions = originalFaceInstructions(base, opt);
  // the plan's choice (drawing-plan.mjs planLines): --drawshare, --drawregions and --drawmax
  const loaded = planLines(loadLines(base, w, h, { keepOrder: true }).filter(g => !skip.has(g.role)), num);
  const all = reviewedFaceFeatures(loaded, faceInstructions, { w, h, facePoly: faceInstructions?.facePoly??reviewedSubject()?.regions.find(r => r.id === 'face').poly }).filter(g => !skip.has(g.role));
  if (faceInstructions) log(`drawing semantics: ${faceInstructions.features.length} reviewed human-eye paths, target/trace hashes matched; original widths and weights retained`);
  // Joined before ranking, per role and kind, so a contour the segmenter broke at every junction is ranked as the one
  // long line it is, and a strand is never stitched to a contour. 8 cells keeps the lines connected.
  const joinOpts = { gap: num('drawjoingap', 8) * K, cos: num('drawjoincos', 0.7), aim: num('drawjoinaim', 0.6) };
  const groups = new Map();
  for (const g of all) { const k = `${g.role}|${g.kind}|${g.object ?? ''}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(g); }
  let joined0 = 0;
  const whole = [...groups.values()].flatMap(gs => { const r = connect(gs, joinOpts); joined0 += r.joined; return r.gestures; });
  log(`drawing logic ${mode}: ${all.length} lines of work/lines/${base}-lines.json joined ${joined0} times into ${whole.length}, as drawn now ${stat(all)}`);
  const shape = { inLen: num('drawtaperin', 3) * K, outLen: num('drawtaperout', 5) * K, start: num('drawtaperstart', 0.45), end: num('drawtaperend', 0.3),
    gain: num('drawwidthgain', 1.39), margin: num('drawwidthmargin', 0.42), minNib: num('drawwidthmin', 0.3) };
  const strokeLen = num('drawstroke', 0.12) * Math.min(w, h);
  const key = `${base}|${w}x${h}`;
  const hybridProfile=materialProfile(opt('outlinemedium','ink').startsWith('graphite')?opt('graphiteprofile','graphite-HB'):opt('inkprofile','black-ink'));
  const hybridMm=num('sheetmm',152.4)/w;
  const hybridShape={...shape,nib:hybridProfile.widthMm[0]/hybridMm,flex:(hybridProfile.widthMm[1]-hybridProfile.widthMm[0])/hybridMm,
    pressureFloor:0,pressureGain:1,pressureExponent:hybridProfile.pressureExponent,
    want:num('hybridwant',1.3),mix:num('hybridmix',.4),fast:num('hybridfast',2.4),slow:num('hybridslow',.6),
    land:num('hybridland',1.2),lift:num('hybridlift',.6),turnDwell:num('hybriddwell',.5)};
  let tone;
  if (mode === 2) {
    if (first) {
      if (!walker || !field) throw new Error('drawing logic 2: the walker\'s gestures and field are needed');
      // The walker's pen is the outline pass (edge chains round the forms, drawn first) and then the walk. Both are laid
      // on the file, outlines first, with the pen outline pass's settings (paint-plate.mjs, --penoutline).
      const outlines = opt('penoutline', '1') !== '0' ? edgeChains(D, w, h, gaussian, { sigma: num('edgesigma', 1.5) * K, minLength: Math.round(num('edgemin', 20) * K),
        margin: num('silmargin', 0.04), step: Math.max(1, Math.round(2 * K)), high: num('edgehigh', 0.85) }).map(g => ({ points: g.points })) : [];
      const guide = [...outlines, ...walker];
      const r = walkOnLines(guide, whole, field, w, h, { reach: num('hybridreach', 6) * K, par: num('hybridpar', 0.6), bridge: num('hybridbridge', 0.12) * Math.min(w, h), minLen: num('hybridmin', 6) * K, sFloor: num('hybridfloor', 0.55), support: num('hybridsupport', 0.4), stay: num('hybridstay', 3) * K });
      // gestures that continue one another across the walk's breaks become one stroke (joinLines' facing, tangent and
      // aim gates, so no corner is invented); a mark shorter than --hybridkeep goes to the closing pen
      const tagged = r.gestures.map((g, gid) => ({ ...g, points: g.points.map(q => ({ ...q, gid })) }));
      const chained = connect(tagged, { gap: num('hybridjoin', 0.03) * Math.min(w, h), cos: num('drawjoincos', 0.7), aim: num('drawjoinaim', 0.6) });
      const keepLen = num('hybridkeep', 12) * K;
      r.gestures = chained.gestures.filter(g => g.length >= keepLen);
      r.used = new Set(r.gestures.flatMap(g => [...new Set(g.points.map(q => q.gid))].flatMap(gid => tagged[gid].lines ?? [])));
      USED.set(key, r.used);
      log(`drawing logic 2, first pen: V041's ${stat(guide)} (${stat(outlines)} of outline and ${stat(walker)} of walk) laid on ${r.used.size} of ${whole.length} file lines: ${stat(r.gestures)}, in V041's order`);
      // the pen's own nib and flex, as paint-plate sets them (PEN), so a width target becomes the pressure that makes it
      return r.gestures.map(g => shapeHybrid(g, hybridShape))
        // One dip per gesture, loaded for its length, so a long contour starts dark and runs down to dry near its end.
        .flatMap(g => personStrokes(g, num('hybridstroke', 0.25) * Math.min(w, h), { dipFirst: true, low: num('hybridlow', 0.03),
          load: Math.min(1, num('hybridload', 0.2) + num('hybridloadper', 0.0006) * pathLength(g.points)) }));
    }
    const used = USED.get(key) ?? new Set();
    tone = whole.map((g, index) => ({ ...g, index })).filter(g => !used.has(g.index));
  } else {
    const ranked = rankLines(whole, { w, h, D, K, featLen: num('featlen', 0.08), silLen: num('drawsillen', 0.04) });
    const budget = cells * num('drawformbudget', 1.5);
    const split = splitForm(ranked, {
      cells: budget, nib: 1.5 * K, features: Math.round(num('drawfeatures', 40)),
      shares: { 1: num('drawtier1', 0.5), 3: num('drawtier3', 0.3), 4: num('drawtier4', 0.15) },
      filter: num('drawfilter', 0) > 0 ? inkFilterOn(D, w, h, K) : null, fill: num('drawfill', 0.1),
    });
    // logic 3 is the ink-led piece's opening drawing: a piece whose style read is under --scribbleink 0.5 ink keeps logic 1
    const inkLed = !style || style.ink >= num('scribbleink', 0.5);
    if (first && mode === 3 && !inkLed) log(`drawing logic 3: style ink ${style.ink} under ${num('scribbleink', 0.5)}, logic 1 instead`);
    if (first && mode === 3 && inkLed) {
      // logic 1's lines joined into fewer, longer strokes, logic 2's weight and flow, open along the lights, and the
      // dark masses as looping scribble (drawing-scribble.mjs)
      const short = Math.min(w, h), minL = num('scribblemin', 0.02) * short;
      const { gestures } = connect(split.form, { gap: num('scribblejoin', 14) * K, cos: num('scribblecos', 0.6), aim: 0.5 });
      const kept = handOrder(gestures.filter(g => pathLength(g.points) >= minL));
      const broken = kept.flatMap(g => breakOnLights(g, D, w, h, { lit: num('scribblelit', 0.15), reach: 2 * K }));
      const lines = broken.map(g => shapeHybrid(g, hybridShape))
        .flatMap(g => personStrokes(g, num('scribblestroke', 0.2) * short, { dipFirst: true, low: num('hybridlow', 0.03), load: Math.min(1, num('hybridload', 0.2) + num('hybridloadper', 0.0006) * pathLength(g.points)) }));
      const masses = num('scribblemasses', 1) > 0 ? scribbleMasses(D, w, h, gaussian, { K, dark: num('scribbledark', 0.06), minMass: num('scribblemass', 0.002), loop: num('scribbleloop', 0.008), hole: num('scribblehole', 0.35), seed: 7 }) : [];
      const scribbles = masses.flatMap(g => personStrokes(g, num('scribblestrokes', 0.12) * short, { dipFirst: true, load: 0.6, low: 0.05 }));
      log(`drawing logic 3, first pen: ${split.form.length} form lines joined into ${kept.length} (${stat(kept)}), ${broken.length} runs after opening the lit edges, ${lines.length} strokes; ${masses.length} mass scribbles in ${scribbles.length} strokes`);
      return [...lines, ...scribbles];
    }
    if (first) {
      log(`drawing logic 1: ink budget ${Math.round(budget)} cells`);
      split.log.forEach(l => log(l));
      const { gestures, joined } = connect(split.form, joinOpts);
      const ordered = handOrder(gestures);
      log(`drawing logic 1, first pen: ${split.form.length} lines joined ${joined} more times into ${stat(ordered)}, in a hand's order, tapered`);
      return ordered.map(g=>faceInstructions?.openingPolicies?shapeReviewedOpening(g,{D,w,h,shape:{...shape,base:num('drawwant',num('tier1want',.6)),floor:num('drawformfloor',.7)}}):shapeGesture(g,{...shape,base:num('drawwant',num('tier1want',.6)),floor:num('drawformfloor',.7)})).filter(Boolean).flatMap(g=>personStrokes(g,strokeLen).map(s=>({...s,rank:g.tier,...(g.reviewedRoles?{reviewedRoles:g.reviewedRoles}:{}),...(g.reviewedOrdinal==null?{}:{reviewedOrdinal:g.reviewedOrdinal,focalFeature:g.focalFeature}),...(g.openingControl?{openingRole:g.openingRole,openingControl:g.openingControl}:{})})));
    }
    tone = split.tone;
  }
  if (!want) throw new Error('drawing logic: the closing pen needs the pass\'s ink want');
  // --closeclean 1: the closing pen keeps the file's lines and strands of --closemin of the short side or longer. The
  // file's hatching and its specks are the painting's tone, which the washes already carry; drawn as ink they read as noise.
  if (num('closeclean', 0) > 0) {
    const before = tone.length, minL = num('closemin', 0.025) * Math.min(w, h);
    tone = tone.filter(g => g.kind !== 'hatch' && (g.length ?? pathLength(g.points)) >= minL);
    log(`drawing logic ${mode}, closing pen clean: ${tone.length} of ${before} lines kept (no hatching, ${minL.toFixed(0)} cells or longer)`);
  }
  // the closing pen carries most of the file: only the lights are cut unless --drawtonehi turns the need gate on
  const t = toneRuns(tone, { w, h, D, want, light: num('drawtonelight', 0.12), lo: num('drawtonelo', 0), hi: num('drawtonehi', 0) });
  const { gestures, joined } = connect(t.lines, joinOpts);
  const ordered = handOrder(gestures.map(g => ({ ...g, tier: 0 })));
  log(`drawing logic ${mode}, closing pen: ${t.lines.length} runs from ${tone.length} lines (${t.dropped} not needed there, ${t.lit} breaks at lights), joined ${joined} times into ${stat(ordered)}`);
  const toneWant = num('drawtonewant', 0.6);
  return ordered.map(g => shapeGesture(g, { ...shape, base: toneWant, scale: 0.5 + 0.5 * (g.need ?? 1) })).flatMap(g => personStrokes(g, strokeLen));
}

const stat = gs => { const s = gestureStats(gs); return `${s.n} gestures, median ${s.median.toFixed(1)} cells, ${Math.round(s.total)} cells in all`; };
