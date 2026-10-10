import test from 'node:test';import assert from 'node:assert/strict';
import {validateAreaDocument,rasterAreaPlan,compileAreaLayers,semanticTechnique,createAreaExecution,semanticMaterialReady,semanticDrawingGroups,semanticBrushOptions,semanticGesture} from './semantic-areas.mjs';
const box=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
const pass=(id,order,valueRange=[1,99])=>({id,order,dependsOn:[],valueRange,move:'wet on dry',edges:{kind:'hard',overlap:true},lights:{mode:'paint-owned',reason:'pale plane still receives pigment'},brush:{widthMm:4,kind:'round',contact:'belly',orientation:'sweep',pressure:[.25,.8,.25]},load:{water:.42,pigmentScale:.8,waterQuantityMm3:120,capacityMm3:160,minRemainingFraction:.15,reload:'before-stroke',rinse:'fresh-brush-per-gesture',blot:'none',concentrationSource:'solver-calibrated'},wetness:{required:'dry',neighborCells:5},stop:{after:'pass',reason:'inspect values'}});
const fixture=()=>({version:1,coordinateSpace:'normalized-target',target:{path:'target.png',sha256:'a',width:4,height:4},areas:[{id:'scene',parent:null,intent:'connected scene',referenceCue:'broad painted scene',geometry:{polygon:box(0,0,1,1),anchors:[]},drawingRole:'none',passes:[pass('base',0)]},{id:'left',parent:'scene',intent:'pale painted plane',referenceCue:'cool light face',geometry:{polygon:box(0,0,.5,1),anchors:[]},drawingRole:'scaffold',passes:[pass('model',1)]},{id:'right',parent:'scene',intent:'focal form',referenceCue:'dark edge',geometry:{polygon:box(.5,0,1,1),anchors:[]},drawingRole:'focal',passes:[pass('model',2)]}]});
const plan=d=>rasterAreaPlan(validateAreaDocument(d,{targetSHA:'a',imageSHA:'a',sourceWidth:4,sourceHeight:4,minAreas:3}),4,4);
test('hierarchy partitions solver demand without duplicating mass; explicit intent controls move/load/brush',()=>{const p=plan(fixture()),shape={mask:new Uint8Array(16).fill(1),amount:.2,mix:[.2],area:16};let c=compileAreaLayers(p,[{value:1,pigment:0,shapes:[shape]}]);assert.equal(c.layers.length,2);assert.equal(c.layers.reduce((s,l)=>s+l.shapes[0].area*.2,0),3.2);assert.equal(c.diagnostics.allocatedValueCells,16);assert.equal(c.diagnostics.planComplete,true);assert.equal(c.layers[0]._semantic.key,'left/model');let T=semanticTechnique(c.layers[0]._semantic,{name:'wet on wet',water:1});assert.equal(T.name,'wet on dry');assert.equal(T.water,.42);assert.equal(T.intoWet,false);assert.equal(c.layers[0]._semantic.pass.brush.widthMm,4);});
test('parent bounds and ambiguous sibling ownership fail; explicit occlusion resolves deterministically',()=>{let d=fixture();d.areas[2].geometry.polygon=box(.25,0,1,1);assert.throws(()=>plan(d),/ambiguous sibling/);d.areas[2].geometry.priority=2;d.areas[2].geometry.occlusionReason='foreground occludes left plane';assert.equal(plan(d).owner[1],2);d.areas[0].geometry.polygon=box(0,0,.8,1);assert.throws(()=>plan(d),/outside parent/);});
test('crop binding retains stable IDs; wrong image or target fails before planning',()=>{let d=fixture();d.view={crop:[0,0,2,4],imageSHA256:'b'};let p=rasterAreaPlan(validateAreaDocument(d,{targetSHA:'a',imageSHA:'b',sourceWidth:2,sourceHeight:4,minAreas:3}),2,4);assert.equal(p.doc.areas[p.owner[0]].id,'left');assert.throws(()=>validateAreaDocument(d,{targetSHA:'a',imageSHA:'c',sourceWidth:2,sourceHeight:4,minAreas:3}),/cropped input/);assert.throws(()=>validateAreaDocument(d,{targetSHA:'c'}),/target binding/);});
test('unassigned demand/value and unsupported operations cannot earn planned coverage',()=>{let d=fixture();d.areas[0].geometry.polygon=box(0,0,1,.8);d.areas[1].geometry.polygon=box(0,0,.5,.8);d.areas[2].geometry.polygon=box(.5,0,1,.8);assert.throws(()=>compileAreaLayers(plan(d),[{value:1,shapes:[{mask:new Uint8Array(16).fill(1),amount:1,mix:[1]}]}]),/unassigned/);d=fixture();d.areas[1].passes[0].move='lift';assert.throws(()=>plan(d),/unsupported move/);d=fixture();d.areas[1].passes[0].valueRange=[2,99];assert.throws(()=>compileAreaLayers(plan(d),[{value:1,shapes:[{mask:new Uint8Array(16).fill(1),amount:1,mix:[1]}]}]),/unassigned/);});
test('paper vs painted light and film are distinct; incomplete frisket fails',()=>{let d=fixture();d.areas[1].passes[0].lights={mode:'paper',polygon:box(0,0,.25,.25),reason:'reserve essential paper'};let p=plan(d);assert.equal(p.reserves[0],1);assert.equal(p.film[0],0);d.areas[1].passes[0].lights.mode='film';assert.throws(()=>plan(d),/film lifecycle/);d.areas[1].passes[0].lights.actions={apply:'dry-paper-physical-film',set:'full-strength-established',remove:'dry-paint-physical-lift',afterPasses:['left/model'],revealedEdges:'inspect'};p=plan(d);assert.equal(p.reserves[0],0);assert.equal(p.film[0],1);});
test('actual function calls are linked to semantic IDs and execution/failure remains distinct from compilation',()=>{let events=[],e=createAreaExecution({emit:r=>events.push(r)}),p=plan(fixture());e.set(p.passes.get('left/model'));let called=0;assert.equal(e.command('stroke',{water:.42},()=>++called),1);assert.equal(events[0].status,'compiled');assert.equal(events[1].status,'executed');assert.equal(events[1].passId,'left/model');assert.throws(()=>e.command('stroke',{},()=>{throw Error('actual gate');}),/actual gate/);assert.equal(events.at(-1).status,'failed');e.set(null);e.command('legacy unassigned',{},()=>0);assert.equal(events.at(-1).semanticPlanned,false);});
test('material gate rejects stale wet/dry or empty actual brush; drawing role controls admitted physical paths',()=>{let p=plan(fixture()),s=p.passes.get('left/model').pass;assert.equal(semanticMaterialReady(s,{cells:3,dry:false},{water:1,pigment:1}),false);assert.equal(semanticMaterialReady(s,{cells:3,dry:true},{water:1,pigment:0}),false);assert.equal(semanticMaterialReady(s,{cells:3,dry:true},{water:1,pigment:1}),true);let g=[{points:[{x:0,y:0,s:.1},{x:1,y:0,s:.1},{x:2,y:0,s:.8},{x:3,y:0,s:.8}]}];assert.equal(semanticDrawingGroups(p,g,'opening')[0].area.id,'left');assert.equal(semanticDrawingGroups(p,g,'closing')[0].area.id,'right');assert.equal(semanticDrawingGroups(p,g,'opening')[0].gesture.points[0].s,.1);});
test('unknown/out-of-order dependencies and cyclic hierarchy fail early',()=>{let d=fixture();d.areas[1].passes[0].dependsOn=['right/model'];assert.throws(()=>plan(d),/dependency/);d=fixture();d.areas[0].parent='left';assert.throws(()=>plan(d),/cycle/);});

test('consumed physical brush options separate size, reservoir and quantity; gesture pose preserves physical profile',()=>{let p=plan(fixture()).passes.get('left/model').pass,b=semanticBrushOptions(p,.5);assert.deepEqual(b,{model:'row',flat:false,radius:4,loadWater:640});let g=semanticGesture(p,[{x:1,y:1},{x:2,y:2},{x:3,y:3}],.5);assert.deepEqual(g.map(p=>p.p),[.25,.8,.25]);assert.deepEqual(g.map(p=>p.r),[4,4,4]);});

test('foreground ancestry defeats a deeper background child and fulltarget bounds are checked before a crop hides them',()=>{let d=fixture();d.areas[1].geometry.priority=10;d.areas[1].geometry.occlusionReason='foreground person';d.areas[2].geometry.polygon=box(0,0,1,1);d.areas[2].geometry.priority=1;d.areas[2].geometry.occlusionReason='background behind subject';let c=structuredClone(d.areas[2]);c.id='background-shadow';c.parent='right';c.passes[0].order=3;d.areas.push(c);let p=plan(d);assert.equal(p.doc.areas[p.owner[0]].id,'left');assert.equal(p.doc.areas[p.owner[3]].id,'background-shadow');d.areas[0].geometry.polygon=box(0,0,.9,1);assert.throws(()=>plan(d),/outside parent geometry/);});

test('command metadata cannot replace authoritative operation or semantic identity',()=>{const e=createAreaExecution(),s={area:{id:'actual-area'},key:'actual-area/pass'};e.set(s);e.command('nonpaint',{kind:'fake',id:'fake',areaId:'fake',passId:'fake',operation:'physical brush stroke',status:'executed',pigmentLoaded:true},()=>0);const r=e.records[0];assert.equal(r.kind,'semantic-command');assert.notEqual(r.id,'fake');assert.equal(r.areaId,s.area.id);assert.equal(r.passId,s.key);assert.equal(r.operation,'nonpaint');assert.equal(r.status,'executed');assert.equal(e.complete(s).paintCommands,0);});
test('material dry gate rejects malformed measured state and returns a boolean',()=>{const p={wetness:{required:'dry'}},b={water:12,pigment:1};for(const paper of [{cells:3,dry:'yes'},{cells:Infinity,dry:true},{cells:'3',dry:true},{cells:.5,dry:true}])assert.equal(semanticMaterialReady(p,paper,b),false);assert.equal(semanticMaterialReady(p,{cells:3,dry:true},b),true);assert.equal(semanticMaterialReady(p,{cells:3,dry:true},{water:0,pigment:1}),true);});
test('material moist gate rejects coerced or nonfinite measurement and respects boundaries',()=>{const p={wetness:{required:'moist'}},b={water:0,pigment:1};for(const paper of [{cells:3,moistShare:'0.8',waterMax:.1},{cells:3,moistShare:.8,waterMax:'0.1'},{cells:3,moistShare:Infinity,waterMax:.1},{cells:3,moistShare:.8,waterMax:-.1}])assert.equal(semanticMaterialReady(p,paper,b),false);assert.equal(semanticMaterialReady(p,{cells:3,moistShare:.7,waterMax:.15},b),true);assert.equal(semanticMaterialReady(p,{cells:3,moistShare:.7,waterMax:.15001},b),false);});
test('wet material admits valid volume while rejecting unknown or missing state',()=>{const b={water:12,pigment:1};assert.equal(semanticMaterialReady({wetness:{required:'wet'}},{cells:3,moistShare:.7,waterMax:.8},b),true);assert.equal(semanticMaterialReady({wetness:{required:'wet'}},{cells:3,moistShare:.7},b),true);assert.equal(semanticMaterialReady({wetness:{required:'unknown'}},{cells:3,dry:true},b),false);assert.equal(semanticMaterialReady(null,null,b),false);});
test('compound physical film retains intentional semanticPlanned metadata',()=>{const events=[],e=createAreaExecution({emit:r=>events.push(r)});e.command('physical film apply and establish',{semanticPlanned:true,areaPassIds:['area/pass']},()=>0);assert.equal(e.records[0].semanticPlanned,true);assert.equal(e.records[0].passId,null);assert.deepEqual(e.records[0].areaPassIds,['area/pass']);assert.equal(events[0].status,'compiled');assert.equal(events[1].status,'executed');});
test('failed and successful nonpaint commands cannot count as completed pigment paint',()=>{const e=createAreaExecution(),s={area:{id:'area'},key:'area/pass'};e.set(s);assert.throws(()=>e.command('physical brush stroke',{pigmentLoaded:true,status:'executed',error:'fake'},()=>{throw Error('actual failure');}),/actual failure/);e.command('nonpaint',{},()=>0);const r=e.complete(s);assert.equal(r.executedCommands,1);assert.equal(r.paintCommands,0);assert.equal(e.records[0].status,'failed');assert.equal(e.records[0].error,'actual failure');});

test('authoritative semantic lights suppress legacy automatic white film inference',async()=>{const {semanticHighlights}=await import('./semantic-areas.mjs');let calls=0;const legacy=()=>{calls++;return Uint8Array.from([1,1,1]);};assert.deepEqual([...semanticHighlights({film:Uint8Array.from([0,0,0])},legacy)],[0,0,0]);assert.deepEqual([...semanticHighlights({film:Uint8Array.from([0,1,0])},legacy)],[0,1,0]);assert.equal(calls,0);assert.deepEqual([...semanticHighlights(null,legacy)],[1,1,1]);assert.equal(calls,1);});

test('prewet deposition rejects actual thirsty load before physical execution',async()=>{const {semanticPrewetLoad}=await import('./semantic-areas.mjs');const p={load:{prewetWater:.16,waterQuantityMm3:168,capacityMm3:226.8}};assert.throws(()=>semanticPrewetLoad(p,.4),/0.1185.*0.4/);p.load.prewetWater=.8;assert.ok(semanticPrewetLoad(p,.4)>.4);});
test('contact preparation uses actual shaped geometry and pressure, checks neighbors and bounds attempts',async()=>{const {prepareSemanticContact}=await import('./semantic-areas.mjs');const p={wetness:{required:'moist',neighborCells:2}},pts=[{x:4,y:9,r:7,p:.25},{x:14,y:10,r:7,p:.8}];let checks=0,used=[];const r=prepareSemanticContact(p,pts,{observe:()=>({cells:10,moistShare:checks++<1?.2:.9,waterMax:.1}),waterStroke:g=>used.push(g)});assert.equal(r.ready,true);assert.equal(r.attempts,1);assert.equal(used[0][0].x,4);assert.equal(used[0][1].p,.8);assert.equal(used[0][0].r,7+2/(.25+.75*.25));assert.deepEqual(pts,[{x:4,y:9,r:7,p:.25},{x:14,y:10,r:7,p:.8}]);let moves=0;const f=prepareSemanticContact(p,pts,{observe:()=>({cells:10,moistShare:.2,waterMax:.1}),waterStroke:()=>moves++});assert.equal(f.ready,false);assert.equal(moves,3);});
test('ready or glossy actual footprint does not receive indiscriminate clean water',async()=>{const {prepareSemanticContact}=await import('./semantic-areas.mjs');const p={wetness:{required:'moist',neighborCells:2}};for(const paper of [{cells:10,moistShare:.9,waterMax:.1},{cells:10,moistShare:.9,waterMax:.3}]){let moves=0;prepareSemanticContact(p,[{x:1,y:2,r:3,p:.8}],{observe:()=>paper,waterStroke:()=>moves++});assert.equal(moves,0);}});

test('physical water preparation suspends numerical clip and restores it while retaining film',async()=>{const {withSemanticWaterClip}=await import('./semantic-areas.mjs');const mask=Uint8Array.from([1,0,0]),film=Uint8Array.from([0,1,0]),sheet={clip:mask,resist:film};const set=(s,c)=>s.clip=c;withSemanticWaterClip(sheet,set,()=>{assert.equal(sheet.clip,null);assert.equal(sheet.resist,film);});assert.equal(sheet.clip,mask);assert.throws(()=>withSemanticWaterClip(sheet,set,()=>{throw Error('physical failure');}),/physical failure/);assert.equal(sheet.clip,mask);assert.equal(sheet.resist,film);});

test('glossy preparation waits through measured ordinary flow without adding water or changing required state',async()=>{const {prepareSemanticContact}=await import('./semantic-areas.mjs');const p={wetness:{required:'moist',neighborCells:2},preparation:{maxAttempts:3,flowSteps:2}};let flows=0,water=0;const r=prepareSemanticContact(p,[{x:1,y:2,r:3,p:.8}],{observe:()=>({cells:20,moistShare:.9,waterMax:flows<2?.3:.1}),waterStroke:()=>water++,advance:()=>flows++});assert.equal(r.ready,true);assert.equal(flows,2);assert.equal(water,0);assert.equal(p.wetness.required,'moist');});
test('authored preparation brush and load are independent and bounded unsupported preparation fails',async()=>{const {semanticPreparation}=await import('./semantic-areas.mjs');assert.throws(()=>semanticPreparation({preparation:{flowSteps:601,maxAttempts:3}}),/bounded/);assert.throws(()=>semanticPreparation({preparation:{flowSteps:60,maxAttempts:3,brush:{kind:'mop'}}}),/brush/);});

test('material contact retains primary and all declared halo but excludes dry or zero-pool lift-only envelope',async()=>{const {semanticMaterialContact}=await import('./semantic-areas.mjs');const c={cells:[0,1,2],primaryMask:Uint8Array.from([1,0,0,0]),liftMask:Uint8Array.from([0,1,1,0]),neighborIndices:[3]},s={M:Uint8Array.from([0,1,0,0]),W:Float32Array.from([0,.1,0,0])},b={capacity:1,free:.4,hairs:[{water:.6,len:1}]};let r=semanticMaterialContact(s,c,b);assert.deepEqual(r.cells,[0,1,3]);assert.deepEqual(r.conservativeCells,[0,1,2,3]);b.hairs[0].water=0;r=semanticMaterialContact(s,c,b);assert.deepEqual(r.cells,[0,3]);s.M[0]=1;s.W[0]=.1;r=semanticMaterialContact(s,c,b);assert.equal(r.pickupPossible,true);assert.deepEqual(r.cells,[0,1,3]);assert.equal(r.declaredHaloCells,1);});

test('semantic soft overlap executes physical pigment outside legacy numerical island; hard/legacy preserve clip',async()=>{const {semanticUsesNumericClip}=await import('./semantic-areas.mjs');const {makePaper}=await import('../../src/media/paper.mjs');const {createSheet,setClip}=await import('../../src/media/sheet.mjs');const {createBrush,dip,stroke}=await import('../../src/media/brush.mjs');const n=48*48,mask=new Uint8Array(n);for(let y=18;y<=22;y++)for(let x=22;x<=26;x++)mask[y*48+x]=1;const paint=intent=>{const sh=createSheet(makePaper(48,48,{seed:9}),[{K:[.3,.3,.3],S:[.02,.02,.02],rho:.05,omega:1,gamma:0}]);setClip(sh,semanticUsesNumericClip(intent)?mask:null);const b=createBrush({radius:6,flat:true,capacity:100,feed:.4,belly:12,free:.4,seed:3});dip(b,{water:.8,conc:[.2]});stroke(b,sh,[{x:10,y:20,r:6,p:.8},{x:38,y:20,r:6,p:.8}],{upright:'sweep',lift:false});return sh.G[0].reduce((s,v,i)=>s+(mask[i]?0:v),0);};assert.ok(paint({pass:{source:'authored',edges:{overlap:true}}})>0,'actual connected brush deposits pigment outside numerical island');assert.equal(paint({pass:{edges:{overlap:false}}}),0);assert.equal(paint(null),0);});

test('explicit metered preparation dose rejects nonphysical quantities',async()=>{const {semanticPreparation}=await import('./semantic-areas.mjs');assert.throws(()=>semanticPreparation({preparation:{flowSteps:60,maxAttempts:3,depositDepthMm:-.1}}),/dose/);assert.throws(()=>semanticPreparation({preparation:{flowSteps:60,maxAttempts:3,depositDepthMm:'0.08'}}),/dose/);});

test('bounded study scope is explicit; complete subjects retain ten-area minimum',()=>{
 const d=fixture(), binding={targetSHA:'a',imageSHA:'a',sourceWidth:4,sourceHeight:4};
 assert.throws(()=>validateAreaDocument(d,binding),/10.*areas/);
 d.scope={kind:'single-subject-study',subject:'one tree',reason:'isolate first canopy and dry branch instructions'};
 assert.equal(validateAreaDocument(d,binding).areas.size,3);
 d.scope.kind='whole-subject';
 assert.throws(()=>validateAreaDocument(d,binding),/scope|10.*areas/);
 d.scope={kind:'single-subject-study',subject:'',reason:'bounded'};
 assert.throws(()=>validateAreaDocument(d,binding),/subject/);
});

test('semantic explicit native tuft model is consumed; unsupported contact cannot silently default',()=>{
 let d=fixture();d.areas[1].passes[0].brush.model='tuft';d.areas[1].passes[0].brush.lag=.6;
 let p=plan(d),b=semanticBrushOptions(p.passes.get('left/model').pass,.125);
 assert.equal(b.model,'tuft');assert.equal(b.lag,.6);
 d.areas[1].passes[0].brush.model='mop-fiction';assert.throws(()=>plan(d),/brush model/);
 d.areas[1].passes[0].brush.model='tuft';d.areas[1].passes[0].brush.lag=NaN;assert.throws(()=>plan(d),/brush lag/);
 const r=semanticBrushOptions(fixture().areas[1].passes[0],.125);assert.equal(r.model,'row');
});

test('crossing and repeated-loop polygons fail before raster ownership can hide their error',()=>{
 let d=fixture();d.areas[1].geometry.polygon=[[0,0],[.5,1],[0,1],[.5,0]];
 assert.throws(()=>plan(d),/self-intersection/);
 d=fixture();d.areas[1].geometry.polygon=[[0,0],[.5,0],[.5,1],[0,1],[.5,0]];
 assert.throws(()=>plan(d),/repeated vertex|self-intersection/);
});
test('explicit unowned background demand stays visible in coverage diagnostics',()=>{
 const d=fixture();d.areas[2].geometry.polygon=box(.5,0,.75,1);d.areas[0].geometry.polygon=box(0,0,.75,1);
 d.allowedUnassigned=[{polygon:box(0,0,1,1),reason:'unowned external source paper'}];
 const c=compileAreaLayers(plan(d),[{value:1,shapes:[{mask:new Uint8Array(16).fill(1),amount:.2,mix:[.2]}]}]);
 assert.equal(c.diagnostics.allowedUnassignedValueCells,4);
 assert.deepEqual(c.diagnostics.allowedUnassignedCellIndices,[3,7,11,15]);
 assert.ok(c.diagnostics.allowedUnassignedDemandMass>0);
});

test('failed short flat prewet is physically narrower than upcoming round contact; matched round restores measured coverage',async()=>{
 const {createBrush,dip,stroke,candidateContact}=await import('../../src/media/brush.mjs');
 const {makePaper}=await import('../../src/media/paper.mjs');const {createSheet}=await import('../../src/media/sheet.mjs');
 const {measurePaper}=await import('../../src/paint/methods/wetdry.mjs');
 const mm=.125,make=()=>createSheet(makePaper(384,512,{mmPerCell:mm,seed:17,fibres:.32,tooth:.3,coldPress:{mmPerCell:mm,bumpMm:[.5,1.6],cover:2.2,swell:.15}}),[{K:[.7,1.5,.5],S:[.03,.02,.04],rho:.08,omega:1.4,gamma:.25}]);
 const opts={model:'tuft',lag:.6,flat:false,radius:36,bristles:72,capacity:100,belly:12,feed:.4,give:.9,free:.4,film:.25,splay:.03,stiffness:8,wetMix:.85,bridge:0,loadWater:160/mm**2,seed:74};
 const points=[{x:292.7142857142857,y:230.4142857142857,r:36,p:.25},{x:297.2142857142857,y:230.4142857142857,r:36,p:.8},{x:301.7142857142857,y:230.4142857142857,r:36,p:.25}];
 const results=[];
 for(const flat of [true,false]){
  const sh=make(),paint=createBrush(opts);dip(paint,{water:.49,conc:[.124]});
  const c=candidateContact(paint,sh,points,{upright:'follow',neighborRadius:2});
  const needed=[...new Set([...c.cells.filter(i=>c.primaryMask[i]),...c.neighborIndices])];
  const b=createBrush({...opts,seed:1,flat,radius:flat?72:48,loadWater:600/mm**2});
  const path=points.map((q,i)=>({...q,r:b.radius,p:flat?[.5,1,.5][i]:q.p}));
  dip(b,{water:.5625,conc:[0]});const prep=candidateContact(b,sh,path,{upright:flat?'sweep':'follow'});
  stroke(b,sh,path,{upright:flat?'sweep':'follow'});
  results.push({coverage:needed.filter(i=>prep.primaryMask[i]).length/needed.length,paper:measurePaper(sh,needed)});
 }
 assert.ok(results[0].coverage<.3);assert.ok(results[0].paper.moistShare<.3);
 assert.ok(results[1].coverage>.8);assert.ok(results[1].paper.moistShare>.7);
 assert.ok(results[1].paper.waterMax<results[0].paper.waterMax);
 // Same337.5mm³ actual water, unchanged wet .7 gate; never claim a moist(.15max) pass.
});

test('authored contact-following clean sweep covers short and curved upcoming native tuft contact without filling paper',async()=>{
 const {semanticPreparationGesture}=await import('./semantic-areas.mjs');
 const {createBrush,dip,stroke,candidateContact}=await import('../../src/media/brush.mjs');
 const {makePaper}=await import('../../src/media/paper.mjs');const {createSheet}=await import('../../src/media/sheet.mjs');
 const {measurePaper}=await import('../../src/paint/methods/wetdry.mjs');
 const mm=.125,make=()=>createSheet(makePaper(384,512,{mmPerCell:mm,seed:17,fibres:.32,tooth:.3,coldPress:{mmPerCell:mm,bumpMm:[.5,1.6],cover:2.2,swell:.15}}),[{K:[.7,1.5,.5],S:[.03,.02,.04],rho:.08,omega:1.4,gamma:.25}]);
 const p=pass('base',0);p.brush={kind:'round',model:'tuft',lag:.6,widthMm:9,contact:'belly',orientation:'follow',pressure:[.25,.8,.25]};p.preparation={brush:{...p.brush,widthMm:12,pressure:[.8,.8,.8]},load:{...p.load,water:1,pigmentScale:1,waterQuantityMm3:337.5,capacityMm3:600},flowSteps:60,maxAttempts:2,contactSweep:{align:'candidate-bounds',extendMm:3.6}};
 for(const raw of [[{x:90.346,y:318.962},{x:92.346,y:318.962},{x:94.346,y:318.962}],[{x:140,y:250},{x:160,y:265},{x:190,y:245},{x:210,y:275}]]){
 const sh=make(),opts={model:'tuft',lag:.6,flat:false,radius:36,bristles:72,capacity:100,belly:12,feed:.4,give:.9,free:.4,film:.25,splay:.03,stiffness:8,wetMix:.85,bridge:0,loadWater:160/mm**2,seed:35},paint=createBrush(opts);dip(paint,{water:.49,conc:[.1]});
 const points=semanticGesture(p,raw,mm),before=JSON.stringify(points),c=candidateContact(paint,sh,points,{upright:false,neighborRadius:2}),required=[...new Set([...c.cells.filter(i=>c.primaryMask[i]),...c.neighborIndices])];
 const wet=createBrush({...opts,...semanticBrushOptions({...p,brush:p.preparation.brush,load:p.preparation.load},mm),seed:1});dip(wet,{water:.5625,conc:[0]});
 const sweep=semanticPreparationGesture(p,points,mm,{predict:q=>candidateContact(wet,sh,q,{upright:false}),requiredCells:required,width:384});
 assert.equal(sh.W.reduce((a,b)=>a+b,0),0,'prediction must not wet paper');assert.equal(JSON.stringify(points),before,'upcoming pigment geometry stays immutable');
 const waterCandidate=candidateContact(wet,sh,sweep,{upright:false});assert.ok(required.filter(i=>waterCandidate.primaryMask[i]).length/required.length>.95);
 stroke(wet,sh,sweep,{upright:false});assert.ok(measurePaper(sh,required).moistShare>.7,'real clean deposition meets unchanged wet coverage on intended primary+halo');
 }
 p.preparation.contactSweep.extendMm='3.6';assert.throws(()=>semanticPreparationGesture(p,[{x:1,y:1},{x:2,y:1}],mm),/sweep/);
});

test('actual semantic instrument calibration measures physical delivery at authored load and preserves mass',async()=>{
 const {calibrateSemanticInstrument,semanticCalibrationGain}=await import('./semantic-areas.mjs');
 const p=pass('base',0);p.move='wet on wet';p.wetness={required:'wet',neighborCells:2};p.brush={kind:'round',model:'tuft',lag:.6,widthMm:9,contact:'belly',orientation:'follow',pressure:[.25,.8,.25]};p.load={...p.load,water:.7,pigmentScale:1,waterQuantityMm3:112,capacityMm3:160};p.preparation={brush:{...p.brush,widthMm:12,pressure:[.8,.8,.8]},load:{...p.load,water:1,waterQuantityMm3:337.5,capacityMm3:600},flowSteps:60,maxAttempts:2,contactSweep:{align:'candidate-bounds',extendMm:3.6}};
 const result=await calibrateSemanticInstrument(p,{mmPerCell:.125,paperOptions:{seed:9,fibres:.5,tooth:.5,coldPress:{mmPerCell:.125,bumpMm:[.5,2],cover:2.2,swell:.3}},pigments:[{K:[.1,.3,.5],S:[.02,.02,.02],rho:.05,omega:1.4,gamma:.25}],physics:{fixedBed:1,edgeEvap:.0012,gran:.25},profile:{radius:36,bristles:72,capacity:100,belly:12,feed:.4,give:.9,free:.4,film:.25,splay:.03,stiffness:8,wetMix:.85,bridge:.98,bridgeSoft:3,seed:31},referenceLengthsMm:[.25,3.5]});
 for(const s of result.samples){assert.ok(Math.abs(s.loadFraction-.49)<1e-12);assert.equal(s.actualWaterQuantityMm3,78.39999999999999);assert.equal(s.paperOptions.mmPerCell,.125);assert.equal(s.paperHeightSHA256.length,64);assert.equal(s.profile.model,'tuft');assert.equal(s.profile.radius,36);assert.deepEqual(s.points.map(p=>p.p),[.25,.8,.25]);assert.ok(s.paperBefore.moistShare>=.7);assert.ok(s.insideMass>0);assert.equal(s.gain,1/s.delivery);assert.ok(Math.abs(s.driedTotalMass-s.allMass)<s.allMass*1e-5);}
 const gain=semanticCalibrationGain(result,[{x:0,y:0},{x:15,y:0}],.125);assert.ok(gain>=Math.min(...result.samples.map(s=>s.gain))&&gain<=Math.max(...result.samples.map(s=>s.gain)));
 assert.throws(()=>semanticCalibrationGain(null,[],.125),/missing/);
});

test('actual calibration stages default to firstwash and explicit dry-shadow is validated without fallback',async()=>{
 const {semanticCalibrationStages}=await import('./semantic-areas.mjs');
 const d={areas:[{passes:[{stage:'first-wash'},{stage:'dry-shadow'},{stage:'dry-details'}]}]};
 assert.deepEqual(semanticCalibrationStages(d),['first-wash']);
 assert.deepEqual(semanticCalibrationStages(d,'first-wash,dry-shadow'),['first-wash','dry-shadow']);
 for(const bad of ['', 'first-wash,', 'dry-shadow,dry-shadow', 'unknown', 'first-wash,unknown'])assert.throws(()=>semanticCalibrationStages(d,bad),/calibration stages/);
 const dry={wetness:{required:'dry'}};
 assert.equal(semanticMaterialReady(dry,{cells:3,dry:false},{water:1,pigment:1}),false);
 assert.equal(semanticMaterialReady(dry,{cells:3,dry:true},{water:1,pigment:1}),true);
});

test('authoritative wet-on-dry contact does not inherit an unplanned duplicate; firstwash repetition stays unchanged',()=>{
 const dry=pass('model',3),legacy={passes:2,name:'wet on wet'};
 const actual=semanticTechnique({pass:dry},legacy);
 assert.equal(actual.passes,1);assert.equal(actual.intoWet,false);
 assert.equal(semanticMaterialReady(dry,{cells:10,dry:false},{water:1,pigment:1}),false);
 const wet={...dry,move:'wet on wet',wetness:{required:'wet'}};
 assert.equal(semanticTechnique({pass:wet},legacy).passes,2);
});
