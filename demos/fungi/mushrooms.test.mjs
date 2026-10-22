import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseMorphTarget as chooseMorphTargetTop, generateGenome, interpolateGenome, buildGeometry, parseState,
  individualGenome, growthField, growSurfacePoint, capSurface3D, BACKGROUND_SCENES, buildBackgroundStudy, MUSHROOM_TYPES, generateSpecimen, compatibleHybrid, typeSignature, paintMaterialData, paintInkData, penPressure, DRAW_DURATION_MS, buildStudy, partialPath, visiblePathFragments, FAMILIES, TRAITS } from './mushrooms.mjs';

test('seeds reproducibly encode 36 bounded traits, including text and Unicode', () => {
  assert.equal(TRAITS.length, 36);
  for (const seed of ['woodland-042', '0', '🍄雨', '', '4294967295']) {
    const a = generateGenome(seed);
    assert.deepEqual(a, generateGenome(seed));
    assert.equal(a.values.length, 36);
    assert.ok(a.values.every(v => Number.isFinite(v) && v >= 0 && v < 1));
  }
  assert.notDeepEqual(generateGenome('one').values, generateGenome('two').values);
});

test('morph endpoints reproduce their seeds exactly and never mix different forms', () => {
  for (const family of Object.keys(FAMILIES)) {
    const a = generateGenome('first', family), b = generateGenome('second', family);
    assert.deepEqual(interpolateGenome(a, b, 0), a);
    assert.deepEqual(interpolateGenome(a, b, 1), b);
    assert.deepEqual(interpolateGenome(a, b, -1), a);
    assert.deepEqual(interpolateGenome(a, b, 2), b);
    assert.throws(() => interpolateGenome(a, b, NaN), RangeError);
    const mid = interpolateGenome(a, b, .5);
    mid.values.forEach((v, i) => assert.ok(Math.abs(v - (a.values[i] + b.values[i]) / 2) < 1e-15));
  }
  assert.throws(() => interpolateGenome(generateGenome('a'), generateGenome('b', 'morel'), .5), RangeError);
});

test('hundreds of seeds and morphs preserve finite, fixed-topology vector outlines', () => {
  for (const family of Object.keys(FAMILIES)) for (let i = 0; i < 70; i++) {
    const a = generateGenome(`a${i}`, family), b = generateGenome(`b${i}`, family);
    for (const t of [0, .5, 1]) for (const young of [false, true]) {
      const g = buildGeometry(interpolateGenome(a, b, t), young);
      assert.equal(g.cap.length, 162); assert.equal(g.stem.length, 111);
      for (const [x, y] of [...g.cap, ...g.stem, ...g.underside]) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y));
        assert.ok(Math.abs(x) < 250 && y > -520 && y < 20, `${family}: ${x},${y}`);
      }
      assert.ok(g.length > 80 && g.w > 45 && g.h > 30);
    }
  }
});

test('nearby morph positions move continuously instead of changing topology', () => {
  for (const family of Object.keys(FAMILIES)) {
    const a = generateGenome('rain', family), b = generateGenome('fern', family);
    const x = buildGeometry(interpolateGenome(a, b, .5)), y = buildGeometry(interpolateGenome(a, b, .50001));
    for (const part of ['cap', 'stem', 'underside']) x[part].forEach((p, i) => {
      assert.ok(Math.hypot(p[0] - y[part][i][0], p[1] - y[part][i][1]) < .02);
    });
  }
});

test('form constraints separate bolete stems, morel caps, and shallow flared chanterelles', () => {
  for (let i = 0; i < 30; i++) {
    const bolete = buildGeometry(generateGenome(i, 'bolete'));
    const amanita = buildGeometry(generateGenome(i, 'amanita'));
    const morel = buildGeometry(generateGenome(i, 'morel'));
    const chanterelle = buildGeometry(generateGenome(i, 'chanterelle'));
    assert.ok(bolete.stemWidth > amanita.stemWidth);
    assert.ok(morel.h > morel.w * 1.8);
    for(const young of [false,true]){
      const cap=buildGeometry(generateGenome(i,'amanita'),young);
      if(young)assert.ok(cap.h/cap.w<1.2,'young Amanita caps should stay round rather than becoming tall inkcap-like bells');
      for(let j=0;j<81;j++)assert.ok(cap.top[j][1]<=cap.lower[80-j][1]+1e-8,'the cap must retain flesh above its projected front lip');
      assert.ok(Math.hypot(cap.top[0][0]-cap.lower[80][0],cap.top[0][1]-cap.lower[80][1])<1e-6,'front and upper contours must meet at the same rim');
      assert.ok(cap.collarRadius>0&&cap.collarRadius<(young?.4:.25),'stipe attachment must fit within the cap at either growth stage');
    }
    assert.ok(chanterelle.h < chanterelle.w * .5);
    assert.ok(chanterelle.underside.some(([x,y]) => y > chanterelle.cy + chanterelle.length * .5));
  }
});

test('study plans are seeded, preserve family anatomy, and keep habitat grounded', () => {
  const expected = {
    amanita: ['free-gills', true, 'central'],
    bolete: ['pores', false, 'central'],
    chanterelle: ['decurrent-folds', false, 'central'],
    morel: ['pits', false, 'direct'],
  };
  const compatibleTrees = {
    amanita: ['pine', 'spruce'],
    bolete: ['oak', 'spruce'],
    chanterelle: ['oak', 'beech'],
    morel: ['elm', 'ash'],
  };
  for (const [family, [underside, ring, capAttachment]] of Object.entries(expected)) for (let seedIndex = 0; seedIndex < 30; seedIndex++) {
    const genome = generateGenome(`woodland-study-${seedIndex}`, family), before = structuredClone(genome);
    const study = buildStudy(genome);
    if (seedIndex === 0) assert.deepEqual(study, buildStudy(genome), `${family} plan is reproducible`);
    assert.deepEqual(genome, before, `${family} genome is not mutated`);
    assert.equal(study.specimenCount, 2);
    assert.deepEqual(study.morphology, { underside, ring, capAttachment });
    assert.ok(study.habitat && typeof study.habitat.id === 'string' && study.habitat.id.length);
    assert.match(study.habitat.substrate, /soil/i, `${family} is terrestrial on soil`);
    assert.doesNotMatch(study.habitat.substrate, /log|wood/i, `${family} must not grow from a log`);
    assert.deepEqual([...study.habitat.trees].sort(), [...compatibleTrees[family]].sort());
    assert.ok(Array.isArray(study.habitat.groundCover) && study.habitat.groundCover.length > 0);
    assert.ok(study.habitat.groundCover.every(cover => typeof cover === 'string' && cover.length));
    assert.ok(study.ink.length > 0 && study.washes.length > 0 && study.washes.length <= 28);

    for (const [kind, paths] of [['ink', study.ink], ['wash', study.washes]]) {
      for (const path of paths) {
        assert.ok(Array.isArray(path.points) && path.points.length >= 2, `${family} ${kind} path has points`);
        for (const [x, y] of path.points) {
          assert.ok(Number.isFinite(x) && Number.isFinite(y), `${family} ${kind} point is finite`);
          assert.ok(x >= 0 && x <= 1200 && y >= 0 && y <= 1000, `${family} ${kind} point is on plate`);
        }
        assert.ok(Number.isFinite(path.width) && path.width > 0);
        if (kind === 'ink') {
          assert.ok(Number.isFinite(path.opacity) && path.opacity >= 0 && path.opacity <= 1);
          assert.ok(['cap-contour', 'cap-flesh', 'stem-contour', 'stem-attachment', 'gills', 'lamella-shadow', 'pores', 'folds', 'pits', 'habitat', 'fibres', 'ring', 'veil', 'reticulum'].includes(path.role));
        } else {
          assert.ok(Array.isArray(path.shape) && path.shape.length >= 3);
          for (const [x, y] of path.shape) assert.ok(Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1200 && y >= 0 && y <= 1000);
          assert.ok(path.palette != null && Number.isFinite(path.load) && path.load > 0);
          assert.ok(path.role);
        }
      }
    }

    const undersideRoles = new Set(study.ink.map(path => path.role));
    const requiredRole = { amanita: 'gills', bolete: 'pores', chanterelle: 'folds', morel: 'pits' }[family];
    assert.ok(undersideRoles.has(requiredRole), `${family} should draw its characteristic underside`);
    for (const [otherFamily, role] of Object.entries({ bolete: 'gills', chanterelle: 'gills', morel: 'gills', amanita: 'pores' })) {
      if (family === otherFamily) assert.ok(!undersideRoles.has(role), `${family} cannot contain ${role}`);
    }
  }
});

test('partial paths stop at exact arc length and tolerate zero-length segments', () => {
  const path = [[0, 0], [0, 0], [10, 0], [10, 10]];
  const firstQuarter = partialPath(path, .25);
  const thirdQuarter = partialPath(path, .75);
  assert.deepEqual(firstQuarter.at(-1), [5, 0]);
  assert.deepEqual(thirdQuarter.at(-1), [10, 5]);
  const length = points => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
  assert.equal(length(firstQuarter), 5);
  assert.equal(length(thirdQuarter), 15);
  for (const point of [...firstQuarter, ...thirdQuarter]) assert.ok(point.every(Number.isFinite));
  assert.deepEqual(path, [[0, 0], [0, 0], [10, 0], [10, 10]]);
});

test('study variation follows both seed changes and continuous within-family morphs', () => {
  for (const family of Object.keys(FAMILIES)) {
    const a = generateGenome('rain-fern-a', family), b = generateGenome('rain-fern-b', family);
    const first = buildStudy(a), other = buildStudy(b);
    assert.notDeepEqual(first, other, `${family} seeds alter the plan`);
    const nearA = buildStudy(interpolateGenome(a, b, .5));
    const nearB = buildStudy(interpolateGenome(a, b, .50001));
    for (const part of ['ink', 'washes']) {
      assert.deepEqual(nearA[part].map(p => [p.role, p.points.length]), nearB[part].map(p => [p.role, p.points.length]),
        `${family} ${part} topology is stable near a morph position`);
      nearA[part].forEach((path, i) => {
        for (const geometry of (part === 'washes' ? ['points', 'shape'] : ['points'])) {
          assert.equal(path[geometry].length, nearB[part][i][geometry].length);
          path[geometry].forEach((point, j) => {
            const q = nearB[part][i][geometry][j];
            assert.ok(Math.hypot(point[0] - q[0], point[1] - q[1]) < 1, `${family} ${part} path moves continuously`);
          });
        }
      });
    }
  }
});

test('URL state handles invalid forms, non-finite numbers, long seeds and bounds', () => {
  assert.equal(parseState('?type=__proto__').family, 'amanita');
  assert.equal(parseState('?blend=NaN').blend, 0);
  assert.equal(parseState('?blend=Infinity').blend, 0);
  assert.equal(parseState('?blend=12&pace=-5').blend, 1);
  assert.equal(parseState('?blend=12&pace=-5').duration, 3);
  assert.equal(parseState('?seed=' + 'a'.repeat(200)).seed.length, 64);
  const s = parseState('?type=morel-1&seed=rain&next=moss&blend=.25&pace=12');
  assert.deepEqual(s, {compositionAnchors:null,compositionSeed:'rain',compositionCount:0,yaw:.12,pitch:.36,capDepth:1,stemBend:0,fieldPlate:false, family: 'morel', typeId:'morel-1', donorId:null, nextTypeId:chooseMorphTargetTop('morel-1','moss'), nextDonorId:null, selectedScene:'auto', background:false, paint:'full', scene:'plain', seed: 'rain', next: 'moss', includeAlpha:false, blend: .25, duration: 12, loopPause: 6 });
});

test('the material is reproducibly painted by Unpainting, with actual pigment mass', () => {
  const a = paintMaterialData(48), b = paintMaterialData(48);
  assert.deepEqual(a.rgb, b.rgb);
  assert.ok(a.layers.some(layer => layer[0].some(mass => mass > 0)));
  assert.ok(a.rgb.some(channel => channel < 230), 'pigment must visibly reach the paper');
  assert.ok(new Set(a.rgb).size > 20, 'paint must retain tonal variation');
});


test('native pen deposits ink and the drawing has pressure changes within a sub-ten-second replay', () => {
  assert.ok(DRAW_DURATION_MS > 0 && DRAW_DURATION_MS < 10000);
  const ink = paintInkData(32);
  assert.ok(ink.layers.some(layer => layer[0].some(mass => mass > 0)));
  for (const phase of [0, 1, 3, 6]) {
    assert.ok(penPressure(.5, phase) > penPressure(0, phase) * 5);
    assert.ok(penPressure(.5, phase) > penPressure(1, phase) * 5);
    for (let i = 0; i <= 100; i++) assert.ok(penPressure(i / 100, phase) >= 0 && penPressure(i / 100, phase) <= 1);
  }
});

test('all 36 Amanita traits affect the drawing or its paint instead of being decorative controls', () => {
  const base = generateGenome('trait-impact', 'amanita');
  for (let index = 0; index < TRAITS.length; index++) {
    const a = structuredClone(base), b = structuredClone(base);
    a.values[index] = .1; b.values[index] = .9;
    assert.notDeepEqual(buildStudy(a), buildStudy(b), `${TRAITS[index]} must affect the drawing plan`);
  }
});

test('ten distinct forms preserve their anatomy, habitat and finite drawing plans across seeds', () => {
  assert.equal(Object.keys(FAMILIES).length,10);
  const expected={parasol:['free-gills','central',true,'soil'],inkcap:['free-gills','central',false,'soil'],oyster:['decurrent-gills','lateral',false,'decaying hardwood'],bracket:['pores','lateral',false,'decaying hardwood'],puffball:['internal-spores','continuous-body',false,'soil'],coral:['external-hymenium','branching-body',false,'soil']};
  for(const [family,[underside,capAttachment,ring,substrate]] of Object.entries(expected))for(let i=0;i<20;i++){
    const plan=buildStudy(generateGenome(`new-forms-${i}`,family));
    assert.deepEqual(plan.morphology,{underside,capAttachment,ring});
    assert.equal(plan.habitat.substrate,substrate);
    assert.ok(plan.specimenCount>=2 && plan.specimenCount<=5);
    // Five bracket shelves carry one pore-margin wash each (42 at most); paint time is unchanged.
    assert.ok(plan.washes.length<=45);
    for(const mark of [...plan.ink,...plan.washes]){
      assert.ok(mark.points.length>=2&&Number.isFinite(mark.width)&&mark.width>0);
      for(const p of mark.points)assert.ok(p.every(Number.isFinite)&&p[0]>=0&&p[0]<=1200&&p[1]>=0&&p[1]<=1000,`${family}: ${p}`);
    }
    if(['puffball','coral','bracket'].includes(family))assert.ok(plan.ink.every(mark=>mark.role!=='gills'));
  }
});

test('120 catalog types have distinct non-color construction and ink geometry', () => {
  assert.ok(MUSHROOM_TYPES.length >= 100);
  assert.equal(new Set(MUSHROOM_TYPES.map(t=>t.grammar)).size,24);
  assert.equal(new Set(MUSHROOM_TYPES.map(typeSignature)).size,MUSHROOM_TYPES.length);
  const signatures=new Set();
  for(const type of MUSHROOM_TYPES){
    const plan=buildStudy(generateSpecimen('catalog-canonical',type.id));
    // Audit drawn structure, excluding paint, caption, palette and ground marks.
    const signature=JSON.stringify(plan.ink.filter(m=>m.role!=='habitat').map(m=>[m.role,m.points.map(p=>p.map(n=>Math.round(n*4)))]));
    assert.ok(!signatures.has(signature),`${type.id} duplicates another type's ink geometry`);signatures.add(signature);
    assert.equal(plan.morphology.grammar,type.grammar);
    assert.ok(plan.ink.length>30&&plan.washes.length<=40,`${type.id} stays within the rendering budget`);
  }
});

test('every catalog recipe remains on the sheet and morphs continuously at held-out seeds', () => {
  for(const type of MUSHROOM_TYPES){
    const a=generateSpecimen('moss-🍄-73',type.id),b=generateSpecimen('rain-216',type.id);
    const left=buildStudy(interpolateGenome(a,b,.5)),right=buildStudy(interpolateGenome(a,b,.50001));
    for(const part of ['ink','washes']){
      assert.equal(left[part].length,right[part].length,`${type.id} ${part} count stays fixed`);
      left[part].forEach((m,i)=>{
        assert.equal(m.points.length,right[part][i].points.length,`${type.id} path topology`);
        for(const [j,p] of m.points.entries()){
          assert.ok(p.every(Number.isFinite)&&p[0]>=0&&p[0]<=1200&&p[1]>=0&&p[1]<=1000,`${type.id} finite on-sheet point ${p}`);
          const q=right[part][i].points[j];assert.ok(Math.hypot(p[0]-q[0],p[1]-q[1])<1,`${type.id} continuous point`);
        }
        for(const shape of [m.shape,m.clip,...(m.reserves??[]),...(m.exclude??[]),...(m.islands??[])].filter(Boolean))for(const p of shape)assert.ok(p.every(Number.isFinite),`${type.id} finite clip/reserve`);
      });
    }
  }
});

test('hybrids are chimeras: whole modules from each parent, named in an inheritance line',async()=>{
  const m=await import('./mushrooms.mjs');
  for(const [host,donor] of [['amanita-1','bolete-1'],['morel-1','chanterelle-1'],['oyster-1','parasol-1'],['puffball-1','inkcap-1'],['parasol-1','hedgehog-1']]){
    const g=generateSpecimen('chimera',host,donor),h=generateSpecimen('chimera',host),d=generateSpecimen('chimera',donor),src=g.phenotype.sources;
    assert.deepEqual(generateSpecimen('chimera',host,donor),g,'module choice is fixed by the seed');
    assert.equal(src.form,host);
    assert.ok(Object.entries(src).filter(([k,v])=>k!=='form'&&v===donor).length>=2,`${host} × ${donor}: two donor modules`);
    // No averaging: every value is the host's or the donor's.
    g.values.forEach((x,i)=>assert.ok(x===h.values[i]||x===d.values[i],`${host} × ${donor}: value ${i} is not blended`));
    assert.ok(g.phenotype.palette===h.phenotype.palette||g.phenotype.palette===d.phenotype.palette);
    const line=m.hybridLine(g),name=id=>m.ecologyFor(id).analogue;
    assert.ok(line.includes(name(host))&&line.includes(name(donor)),line);
  }
  const g=generateSpecimen('chimera','amanita-1','bolete-1');assert.equal(g.phenotype.hymenium,'pores');assert.equal(m.fieldPlateAnatomy(g).attach,'tubes','the section cuts through the inherited tubes');
});
test('hybrids carry visible donor geometry and retain primary attachment and recipe', () => {
  for(const [host,donor,role] of [['parasol-1','hedgehog-2','teeth'],['amanita-3','bolete-1','pores'],['oyster-1','morel-1',null],['earthstar-1','morel-1',null],['cup-1','parasol-1',null]]){
    assert.ok(compatibleHybrid(host,donor).ok);
    const primary=buildStudy(generateSpecimen('hybrid-a',host)),a=generateSpecimen('hybrid-a',host,donor),b=generateSpecimen('hybrid-b',host,donor),hybrid=buildStudy(a);
    assert.equal(a.fictional,true);assert.ok(a.title.includes(' × '));assert.ok(a.inheritance.length);
    assert.equal(hybrid.morphology.capAttachment,primary.morphology.capAttachment);
    assert.notDeepEqual(hybrid.ink.map(m=>[m.role,m.points]),primary.ink.map(m=>[m.role,m.points]),`${host} donor cannot be only a recolor`);
    if(role)assert.ok(hybrid.ink.some(m=>m.role===role),`${host} receives ${role}`);
    assert.equal(interpolateGenome(a,b,.5).donorId,donor);
    assert.throws(()=>interpolateGenome(a,generateSpecimen('hybrid-b',host),.5),RangeError);
  }
  assert.equal(compatibleHybrid('amanita-1','amanita-1').ok,false);
  for(const host of MUSHROOM_TYPES)for(const donor of MUSHROOM_TYPES)if(host.id!==donor.id)assert.ok(compatibleHybrid(host.id,donor.id).ok,`${host.id} × ${donor.id} is never disabled`);
  assert.throws(()=>generateSpecimen('bad','not-a-type'),RangeError);
  assert.equal(parseState('?type=__proto__&donor=__proto__').typeId,'amanita-1');
  assert.equal(parseState('?type=cup-2&donor=cup-2').donorId,null);
  assert.equal(parseState('?type=nest-5&donor=morel-1').donorId,'morel-1');
});

test('optional botanical scenes remain behind specimen reserves and preserve seed morphs', () => {
  const a=generateSpecimen('scene-moss', 'amanita-1'),b=generateSpecimen('scene-rain','amanita-1');
  const mask=[[400,200],[800,200],[800,800],[400,800]];
  assert.deepEqual(buildBackgroundStudy(a,'plain',[mask]).ink,[]);
  for(const scene of BACKGROUND_SCENES.slice(1)){
    const bg=buildBackgroundStudy(a,scene,[mask]),near=buildBackgroundStudy(interpolateGenome(a,b,.5),scene,[mask]),next=buildBackgroundStudy(interpolateGenome(a,b,.50001),scene,[mask]);
    assert.ok(bg.ink.length>0&&bg.ink.length<=400);assert.ok(bg.washes.length<=12);
    for(const [kind,marks] of [['ink',bg.ink],['washes',bg.washes]]){
      for(const mark of marks){assert.ok((kind==='ink'?mark.exclude:mark.reserves).includes(mask));for(const [x,y] of mark.points)assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=1200&&y>=0&&y<890);}
      assert.equal(near[kind].length,next[kind].length);
      near[kind].forEach((mark,i)=>mark.points.forEach((p,j)=>{const q=next[kind][i].points[j];assert.ok(Math.hypot(p[0]-q[0],p[1]-q[1])<1);}));
    }
    const full=buildStudy(a,{scene});assert.equal(full.scene,scene);assert.ok(full.ink[0].role.startsWith('background'));
  }
  assert.throws(()=>buildBackgroundStudy(a,'unknown'),RangeError);
  assert.equal(parseState('?scene=woodland&background=1').scene,'woodland');assert.equal(parseState('?scene=__proto__&background=1').scene,'woodland');
});

// Surface coordinates must meet the ink silhouette and remain stable during seed morphs.
test('curved pigment surfaces preserve rim attachment and continuous finite meshes',()=>{
  for(const id of ['amanita-1','bolete-2','bonnet-3','agaric-4']){
    const a=generateSpecimen('surface-1',id),b=generateSpecimen('surface-2',id);
    const plans=[.5,.50001].map(t=>buildStudy(interpolateGenome(a,b,t)));
    const meshes=plans.map(p=>p.washes.filter(w=>w.surface));
    assert.ok(meshes[0].some(w=>w.surface.kind==='cap'));
    assert.ok(meshes[0].some(w=>w.surface.kind==='stem'));
    assert.equal(meshes[0].length,meshes[1].length);
    meshes[0].forEach((m,i)=>{m.surface.rails.forEach((rail,j)=>rail.forEach((p,k)=>{
      const q=meshes[1][i].surface.rails[j][k];
      assert.ok(p.every(Number.isFinite));
      assert.ok(Math.hypot(p[0]-q[0],p[1]-q[1])<.03);
    }));});
  }
  for(let i=0;i<50;i++){
    const g=buildGeometry(generateSpecimen('rim-'+i,'amanita-1'));
    for(let j=1;j<80;j++){
      assert.ok(g.gillRim[j][1]>g.lower[j][1],'visible flesh has positive thickness');
      assert.ok(Math.abs(g.lower[j][0]-g.top[80-j][0])<1e-7,'cap and underside share each projected cross section');
    }
    assert.ok(g.projectUnderside(0,0)[1]<g.rimCenter,'central chamber recedes toward the stipe');
  }
});

test('gregarious members inherit distinct continuous anatomy without changing grammar',()=>{
  for(const id of ['amanita-4','agaric-4','bonnet-4','parasol-4','inkcap-4','oyster-4','puffball-4','coral-4','cup-4','nest-4','jelly-4','saddle-4']){
    const base=generateSpecimen('colony-review',id),other=generateSpecimen('colony-rain',id),p=buildStudy(base);
    assert.equal(p.individuals.length,p.specimenCount,id);
    assert.ok(p.individuals.length>=2);
    const profiles=p.individuals.map(g=>g.phenotype);
    profiles.forEach(profile=>assert.deepEqual(profile,base.phenotype));
    const shapes=p.individuals.map(g=>g.values.slice(0,14).join(','));
    assert.equal(new Set(shapes).size,shapes.length,`${id} shares a family but not identical morphology`);
    for(let i=0;i<p.specimenCount;i++){
      const a=individualGenome(interpolateGenome(base,other,.5),i,p.specimenCount),b=individualGenome(interpolateGenome(base,other,.500001),i,p.specimenCount);
      a.values.forEach((v,j)=>assert.ok(Number.isFinite(v)&&v>=0&&v<=1&&Math.abs(v-b.values[j])<.0001));
    }
    const forms=p.washes.filter(w=>['cap','funnel-cap','folded-body','puffball','coral','cavity'].includes(w.role)&&w.individual!==undefined);
    const represented=new Set(forms.map(w=>w.individual));
    assert.ok(represented.size>=2,`${id} sends individual forms to the painter`);
  }
});

test('growth fields and advected sites reproduce exactly without relying on the seed display label',()=>{
  const a=generateSpecimen('growth-rain','amanita-4'),copy=structuredClone(a),renamed={...a,seed:'display-only'};
  const sites=[[-.91,.08],[-.6,.3],[0,.5],[.35,.7],[.91,.91]];
  const snapshot=g=>sites.map(([u,t])=>[growthField(g,u,t,21),growSurfacePoint(g,u,t,21)]);
  assert.deepEqual(snapshot(a),snapshot(copy));
  assert.deepEqual(snapshot(a),snapshot(renamed),'morph labels cannot reseed geometry');
  assert.notDeepEqual(snapshot(a),snapshot(generateSpecimen('growth-dry','amanita-4')));
  assert.deepEqual(a,copy,'growth cannot mutate its inherited genome');
});

test('growth advection stays bounded, preserves anchors and moves neighbouring tissue coherently',()=>{
  for(let seed=0;seed<16;seed++){
    const g=generateSpecimen(`strain-${seed}`,'amanita-1');
    for(const u of [-1,-.8,-.25,0,.4,.9,1])for(const t of [0,.1,.4,.8,1]){
      const field=growthField(g,u,t,21),p=growSurfacePoint(g,u,t,21);
      assert.ok(Number.isFinite(field)&&field>=-1&&field<=1);
      assert.ok(p.every(Number.isFinite)&&p[0]>=-1&&p[0]<=1&&p[1]>=0&&p[1]<=1);
      if(Math.abs(u)===1)assert.equal(p[0],u,'side anchors remain attached');
      if(t===0||t===1)assert.equal(p[1],t,'crown and lip boundaries remain attached');
      if(Math.abs(u)<.9&&t>0&&t<1){
        const q=growSurfacePoint(g,u+.0001,t+.0001,21);
        assert.ok(Math.hypot(p[0]-q[0],p[1]-q[1])<.002,'adjacent tissue cannot scatter independently');
      }
    }
  }
});

test('colony growth history changes across seeds while members retain bounded related forms',()=>{
  const ageByMember=[[],[],[],[]];
  for(let seed=0;seed<20;seed++){
    const parent=generateSpecimen(`growth-colony-${seed}`,'amanita-4'),members=ageByMember.map((_,i)=>individualGenome(parent,i,4));
    assert.equal(new Set(members.map(g=>g.maturity)).size,4,'members have individual growth histories');
    for(const [i,g] of members.entries()){
      ageByMember[i].push(g.maturity);
      assert.deepEqual(g.phenotype,parent.phenotype);
      assert.ok(g.maturity>=.22&&g.maturity<=.94);
      assert.ok(g.values.every((v,k)=>v>=0&&v<=1&&Math.abs(v-parent.values[k])<.4),'related variation stays bounded');
    }
  }
  for(const ages of ageByMember)assert.ok(Math.max(...ages)-Math.min(...ages)>.15,'member age cannot be a fixed index constant');
});

test('growth fields, member maturity and surface sites preserve morph endpoints and continuity',()=>{
  const a=generateSpecimen('growth-end-a','amanita-4'),b=generateSpecimen('growth-end-b','amanita-4');
  const samples=g=>Array.from({length:4},(_,i)=>{
    const m=individualGenome(g,i,4);return[m.maturity,...growSurfacePoint(m,-.61+i*.37,.21+i*.15,21)];
  });
  assert.deepEqual(samples(interpolateGenome(a,b,0)),samples(a));
  assert.deepEqual(samples(interpolateGenome(a,b,1)),samples(b));
  for(const t of [0,.17,.49,.77,.99999]){
    const x=samples(interpolateGenome(a,b,t)),y=samples(interpolateGenome(a,b,t+.000001));
    x.forEach((values,i)=>values.forEach((v,k)=>assert.ok(Math.abs(v-y[i][k])<.0002,'no seeded jump during a morph')));
  }
});

test('catalog growth decorations preserve member ownership and foreground occlusion',()=>{
  for(const id of ['amanita-4','agaric-4','bolete-4','chanterelle-4']){
    const plan=buildStudy(generateSpecimen('growth-ownership',id));
    const details=plan.ink.filter(m=>m.role==='surface-relief'||id==='agaric-4'&&m.role==='gills');
    assert.ok(details.length>0,`${id} has catalog details to inspect`);
    for(const mark of [...details,...plan.washes.filter(m=>m.role==='relief-shadow')]){
      assert.ok(Number.isInteger(mark.individual)&&mark.individual>=0&&mark.individual<plan.specimenCount,`${id} detail owns a member`);
      if(mark.individual===plan.specimenCount-1)continue;
      const front=plan.washes.filter(m=>m.individual>mark.individual&&['cap','funnel-cap','stem'].includes(m.role));
      assert.ok(front.length>0);
      const masks=mark.shape?mark.reserves:mark.exclude;
      assert.ok(front.every(m=>masks.includes(m.shape)),`${id} rear detail reserves every later member`);
    }
  }
});

test('3D cap projection keeps marks on the surface and light attached to its normals',()=>{
  const genome=generateSpecimen('camera-proof','amanita-1'),g=buildGeometry(genome);
  assert.ok(g.capSurface);
  const surface=g.capSurface;
  for(const u of [-.85,-.4,0,.4,.85])for(const q of [.05,.25,.7,.95]){
    const p=surface.sample(u,q),projected=surface.project(p.world),row=surface.row(u);
    assert.ok(Math.hypot(...projected.map((v,i)=>v-p.point[i]))<1e-8);
    assert.ok(Math.abs(p.world[2]-surface.height(p.world[0],p.world[1]))<1e-8);
    assert.ok(Math.abs(Math.hypot(...p.normal)-1)<1e-8);
    assert.ok(p.point[1]>=row.top[1]-.01&&p.point[1]<=row.front[1]+.01);
    assert.ok(p.light>=0&&p.light<=1);
  }
  const lower=capSurface3D(genome,{w:g.w,h:g.h,rimDepth:g.w*.12}),higher=capSurface3D(genome,{w:g.w,h:g.h,rimDepth:g.w*.38});
  assert.ok(Math.abs(lower.underside(Math.PI/2)[1]-higher.underside(Math.PI/2)[1])>g.w*.15,'camera elevation changes the actual projected underside');
});

test('standing specimens and longitudinal sections keep stipe tissue connected to cap context', () => {
  const contains=(shape,[x,y])=>{
    let inside=false;
    for(let i=0,j=shape.length-1;i<shape.length;j=i++){
      const a=shape[i],b=shape[j];
      if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  };
  for(const seed of ['woodland-042','woodland-108','rain','spores','october']){
    const genome=generateSpecimen(seed,'amanita-1'),g=buildGeometry(genome);
    assert.ok(g.stem.some(p=>contains(g.cap,p)),`${seed}: the neck must enter cap tissue, without an exposed cut top`);
    for(const young of [false,true])for(const index of [0,1]){
      const local=buildGeometry(individualGenome(genome,index,2),young);
      for(let k=0;k<=40;k++){
        const u=k/20-1;
        assert.ok(contains(local.cap,[local.centerAt(1)+u*local.halfAt(1),local.stemYAt(1,u)]),
          `${seed}: entire shoulder must overlap projected cap, young=${young}, individual=${index}, u=${u}`);
      }
    }
    const study=buildStudy(genome);
    for(const flesh of study.washes.filter(w=>w.role==='flesh')){
      const mid=Math.floor(flesh.shape.length/4),a=flesh.shape[mid],b=flesh.shape[flesh.shape.length-1-mid];
      const p=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      assert.ok(contains(flesh.shape,p));
      for(const stipe of study.washes.filter(w=>['stem','stem-shadow'].includes(w.role)&&w.individual===flesh.individual)){
        if(contains(stipe.shape,p))assert.ok(stipe.reserves.some(mask=>contains(mask,p)),`${seed}: pale foreground flesh reserves native stipe pigment`);
      }
    }
    const i=study.washes.findIndex(w=>w.role==='section-flesh');
    assert.ok(i>0,'section includes a flesh passage');
    const cap=study.washes[i].shape,stipe=study.washes[i-1].shape;
    assert.ok(stipe.some(p=>contains(cap,p)),`${seed}: cut stem must enter cap tissue`);
  }
});


test('lamellar occlusion preserves visible intervals without reopening overlapping tissue',()=>{
  const box=(x1,y1,x2,y2)=>[[x1,y1],[x2,y1],[x2,y2],[x1,y2]];
  const points=[[0,0],[4,0],[10,0]];
  assert.deepEqual(visiblePathFragments(points,[box(2,-1,6,1),box(5,-1,8,1)]),[[[0,0],[2,0]],[[8,0],[10,0]]]);
  assert.deepEqual(visiblePathFragments(points,[box(-1,-1,11,1)]),[]);
  assert.deepEqual(visiblePathFragments(points,[box(2,2,8,4)]),[points]);
  // A slanted blade creates exact entry/exit contacts, not a sampled gap.
  const fragments=visiblePathFragments([[0,0],[10,0]],[[[3,-2],[7,2],[8,2],[4,-2]]]);
  assert.deepEqual(fragments,[[[0,0],[5,0]],[[6,0],[10,0]]]);
});

test('lamellar visibility compares local camera depth across a crossing',()=>{
  const poly=[[-1,-10],[11,-10],[11,10],[-1,10]];
  poly.cameraDepth=[1,0,-5];
  const owner=[{poly,wa:[0,0,.3],wb:[0,0,.3],depth:[0,0,0]}];
  assert.deepEqual(visiblePathFragments([[0,0],[10,0]],[poly],owner),[[[5,0],[10,0]]]);
  poly.cameraDepth=[-1,0,5];
  assert.deepEqual(visiblePathFragments([[0,0],[10,0]],[poly],owner),[[[0,0],[5,0]]]);
});

test('upper annulus keeps continuous stipe pigment while reserving dry fibre ink',()=>{
  for(const seed of ['woodland-042','meadow-117','rain']){
    const study=buildStudy(generateSpecimen(seed,'amanita-1'));
    const veils=study.washes.filter(w=>w.role==='veil-shadow'&&w.fadeTop);
    assert.ok(veils.length>0,'hanging veil has a softly lost upper wash');
    for(const veil of veils){
      const stipes=study.washes.filter(w=>w.individual===veil.individual&&w.surface?.kind==='stem'&&!w.surface.openTop);
      assert.ok(stipes.length>=2);
      assert.ok(stipes.every(w=>!w.reserves.includes(veil.shape)),'no complete pigment reserve seam across the upper annulus');
      assert.ok(study.ink.some(m=>m.individual===veil.individual&&m.role==='fibres'&&m.exclude.includes(veil.shape)),'fold tissue still occludes dry stipe fibres');
    }
    assert.ok(study.washes.some(w=>w.surface?.openTop),'basal wall does not reuse the cap-neck contact shadow');
  }
});

test('prepared morph sampling is bounded, monotonic and preserves exact endpoints', async () => {
  const {morphSamples}=await import('./mushrooms.mjs');
  for(const duration of [3,8,20]) {
    const samples=morphSamples(duration);assert.equal(samples.length,duration*24+1);
    assert.equal(samples[0],0);assert.equal(samples.at(-1),1);
    assert.ok(samples.every((t,i)=>!i||t>samples[i-1]));
    const a=generateSpecimen('a','amanita-1'),b=generateSpecimen('b','amanita-1');
    assert.deepEqual(interpolateGenome(a,b,samples[0]),a);assert.deepEqual(interpolateGenome(a,b,samples.at(-1)),b);
  }
  for(const duration of [NaN,0,21])assert.throws(()=>morphSamples(duration),RangeError);
});
test('morph identity includes recipe, scene, resolution and sampling; excludes displayed blend', async () => {
  const {morphSettings,morphIdentity}=await import('./mushrooms.mjs');
  const state=parseState(''),settings=morphSettings(state),key=morphIdentity(settings);
  assert.equal(morphIdentity(morphSettings({...state,blend:.5})),key);
  for(const name of ['seed','next','typeId','donorId','scene','duration','fps','width','height','quality','format','version'])
    assert.notEqual(morphIdentity({...settings,[name]:'changed'}),key,name);
});
test('morph cache enforces memory and frame limits and disposes on cancellation', async () => {
  const {MorphCache}=await import('./mushrooms.mjs');const c=new MorphCache(8,2),epoch=c.reset('a');
  assert.equal(c.add(epoch,new Blob(['1234'])),true);c.add(epoch,new Blob(['5678']));
  assert.equal(c.bytes,8);assert.throws(()=>c.add(epoch,new Blob(['x'])),RangeError);
  let closed=0,terminated=0;c.decoded.set(0,{close(){closed++;}});c.worker={terminate(){terminated++;}};
  c.reset('b');assert.equal(closed,1);assert.equal(terminated,1);assert.equal(c.bytes,0);assert.equal(c.ready,false);
  assert.equal(c.add(epoch,new Blob(['stale'])),false);assert.equal(c.blobs.length,0);
  const frameLimited=new MorphCache(100,1);frameLimited.add(frameLimited.epoch,new Blob(['a']));
  assert.throws(()=>frameLimited.add(frameLimited.epoch,new Blob(['b'])),RangeError);
});
test('in-flight decoded frames close after invalidation and decoded window stays bounded', async () => {
  const {MorphCache}=await import('./mushrooms.mjs');const original=globalThis.createImageBitmap;
  let finish,closed=0;try {
    globalThis.createImageBitmap=()=>new Promise(resolve=>{finish=resolve;});
    const c=new MorphCache();c.add(c.epoch,new Blob(['a']));const pending=c.bitmap(0);c.reset();
    finish({close(){closed++;}});assert.equal(await pending,null);assert.equal(closed,1);
    globalThis.createImageBitmap=async()=>({close(){closed++;}});
    for(let i=0;i<8;i++){c.add(c.epoch,new Blob(['a']));await c.bitmap(i);}
    assert.equal(c.decoded.size,4);assert.equal(closed,5);c.reset();assert.equal(closed,9);
  }finally{if(original)globalThis.createImageBitmap=original;else delete globalThis.createImageBitmap;}
});
test('a stale decode failure cannot interrupt a newer morph', async () => {
  const {MorphCache}=await import('./mushrooms.mjs');const original=globalThis.createImageBitmap;let reject;
  try{globalThis.createImageBitmap=()=>new Promise((_,fail)=>{reject=fail;});const c=new MorphCache();c.add(c.epoch,new Blob(['a']));const pending=c.bitmap(0);c.reset('new');reject(new Error('old decode failed'));assert.equal(await pending,null);assert.equal(c.key,'new');}
  finally{if(original)globalThis.createImageBitmap=original;else delete globalThis.createImageBitmap;}
});

test('default morph budget reserves decoded window and pending decode within 96 MiB',async()=>{
  const {MorphCache,morphSamples}=await import('./mushrooms.mjs');
  const cache=new MorphCache(),decodedReserve=5*720*600*4;
  assert.equal(cache.maxBytes+decodedReserve,96*1024*1024);
  assert.equal(morphSamples(20).length,cache.maxFrames);
  // Identical identity after A -> B -> A must not revive the first generation.
  const first=cache.reset('a');cache.reset('b');const current=cache.reset('a');
  assert.notEqual(first,current);assert.equal(cache.add(first,new Blob(['obsolete'])),false);
  assert.equal(cache.add(current,new Blob(['current'])),true);
  for(let i=0;i<20;i++){cache.reset('repeat');assert.equal(cache.bytes,0);assert.equal(cache.decoded.size,0);}
});



test('free lamellar roots preserve physical stipe clearance across cap azimuths',()=>{
  for(const seed of ['woodland-042','meadow-117','rain'])for(const young of [false,true]){
    const g=buildGeometry(generateGenome(seed,'amanita'),young);
    for(let i=0;i<96;i++){
      const a=i/96*Math.PI*2,r=g.freeGillRoot(a,7);
      assert.ok(r>0&&r<1,'free root must remain inside cap');
      const distance=Math.hypot(g.w*r*Math.cos(a),g.capSurface.depth*r*Math.sin(a));
      assert.ok(Math.abs(distance-g.halfAt(1)-7)<1e-10,'world clearance must not vary with projected azimuth');
    }
  }
});

test('lamellar pigment chooses nearest camera face without accumulating hidden charges',async()=>{
  const {lamellarCoverage}=await import('./mushrooms.mjs');
  const triangle=depth=>({poly:[[0,0],[10,0],[0,10]],wa:[-.1,-.1,1],wb:[.1,0,0],depth:[0,0,depth]});
  const near={triangles:[triangle(-2)],pigment:.25},far={triangles:[triangle(3)],pigment:1};
  const box={x:0,y:0,w:10,h:10};
  const first=lamellarCoverage([far,near],box),second=lamellarCoverage([near,far],box);
  assert.deepEqual(first,second,'camera depth controls coverage independently of blade order');
  assert.equal(first.alpha[11],64,'near pale face reserves hidden dark face');
  assert.equal(first.alpha[99],0,'outside tissue stays clear');
  const shaded=triangle(-2);shaded.pigment=[.1,.1,1];
  const gradient=lamellarCoverage([{triangles:[shaded],pigment:1},far],box);
  assert.ok(gradient.alpha[11]<gradient.alpha[61],'blade attachment charge rises across lit face');
  assert.ok(gradient.alpha[11]<64,'hidden far charge cannot darken reserved tissue');
  assert.deepEqual(gradient,lamellarCoverage([far,{triangles:[shaded],pigment:1}],box));
  assert.deepEqual(first,lamellarCoverage([far,near],box),'coverage deterministic');
  for(const seed of ['woodland-042','meadow-117','rain']){
    const study=buildStudy(generateGenome(seed,'amanita'));
    for(const wash of study.washes.filter(w=>w.depthFaces)){
      assert.equal(wash.role,'gill-face');assert.ok(wash.reserves.length>=3,'stipe, cap and context reserved');
      assert.ok(wash.depthFaces.every(face=>face.triangles.length>0&&face.pigment>0&&face.pigment<=1));
    }
  }
});


test('valid lamellar triangles retain meridian charges after degenerate tips are omitted',()=>{
  for(const seed of ['woodland-042','meadow-117','rain']){
    const study=buildStudy(generateSpecimen(seed,'amanita-1'));
    const faces=study.washes.filter(w=>w.depthFaces).flatMap(w=>w.depthFaces);
    assert.ok(faces.length>0);
    for(const face of faces){
      const triangles=face.triangles;
      assert.ok(triangles.length>0&&triangles.length<58,'degenerate tip triangles are omitted');
      for(const t of triangles){
        assert.equal(t.pigment.length,3);
        assert.ok(t.pigment.every(q=>Number.isFinite(q)&&q>=0&&q<=1));
        assert.ok(t.pigment[0]<t.pigment[1]||t.pigment[0]<t.pigment[2],'free edge lighter than attachment');
      }
      const charges=triangles.flatMap(t=>t.pigment);
      assert.ok(new Set(charges.map(q=>q.toFixed(8))).size>10,'charge varies along meridian');
      assert.ok(Math.max(...charges)<1,'old constant attachment ramp is absent');
    }
  }
});

test('lamellar diagnostics identify surviving tissue without changing pigment',async()=>{
  const {lamellarCoverage}=await import('./mushrooms.mjs');
  const triangle=depth=>({poly:[[0,0],[10,0],[0,10]],wa:[-.1,-.1,1],wb:[.1,0,0],depth:[0,0,depth]});
  const faces=[{triangles:[triangle(4)],pigment:1},{triangles:[triangle(-2)],pigment:.25}];
  const box={x:0,y:0,w:10,h:10},plain=lamellarCoverage(faces,box),debug=lamellarCoverage(faces,box,{diagnostics:true});
  assert.deepEqual(debug.alpha,plain.alpha);
  assert.equal(debug.owners[11],1);assert.equal(debug.depths[11],-2);
  assert.equal(debug.owners[99],-1);assert.equal(debug.depths[99],Infinity);
  assert.equal(debug.visiblePixels[0],0);assert.ok(debug.visiblePixels[1]>0);
  assert.equal(debug.projectedSamples[0],debug.projectedSamples[1]);
  assert.equal(debug.visiblePixels[1],Array.from(debug.owners).filter(i=>i===1).length);
  assert.equal(plain.owners,undefined,'normal rendering retains no debug buffers');
});

test('lightweight sketches preserve all120body plans without paint or lamellar detail work',async()=>{
  const {buildSketch}=await import('./mushrooms.mjs');
  for(const type of MUSHROOM_TYPES){
    const g=generateSpecimen('sketch-body-plans',type.id),p=buildSketch(g);
    assert.equal(p.morphology.grammar,type.grammar);
    assert.equal(p.individuals.length,p.specimenCount);
    assert.ok(p.ink.length>0&&p.bodies.length>0);
    assert.deepEqual(p.washes,[],'motion has no native paint passages');
    assert.ok(p.ink.every(m=>!['lamella-shadow','surface-relief','fibres','habitat','pits'].includes(m.role)));
    assert.ok(p.bodies.every(m=>!m.surface&&!m.depthFaces),'motion omits lighting meshes and detailed gill coverage');
    for(const m of p.ink)for(const [x,y] of m.points)assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=1200&&y>=0&&y<=1000,`${type.id} on-sheet sketch`);
  }
  for(const id of ['amanita-1','oyster-4','puffball-3','cup-2','earthstar-1','club-4','jelly-4','saddle-3','stinkhorn-2']){
    const g=generateSpecimen('sketch-silhouette',id),preview=buildSketch(g),full=buildStudy(g);
    const body=preview.bodies.find(m=>['cap','puffball','folded-body','stem'].includes(m.role)&&!m.islands);
    assert.ok(body,`${id} has a primary body`);
    assert.ok(full.washes.some(m=>m.role===body.role&&m.shape.length===body.shape.length&&m.shape.every((p,i)=>p.every((n,k)=>Math.abs(n-body.shape[i][k])<1e-8))),`${id} preview reuses its actual full-paint silhouette`);
  }
});

test('lightweight sketch endpoints are deterministic and adjacent morph positions remain continuous',async()=>{
  const {buildSketch}=await import('./mushrooms.mjs');
  const geometry=g=>buildSketch(g).ink.map(m=>[m.role,m.individual,m.points]);
  for(const id of ['amanita-1','coral-4','bracket-2','nest-4','tooth-2','saddle-3']){
    const a=generateSpecimen('sketch-A',id),b=generateSpecimen('sketch-B',id);
    assert.deepEqual(geometry(a),geometry(generateSpecimen('sketch-A',id)));
    assert.deepEqual(geometry(interpolateGenome(a,b,0)),geometry(a));
    assert.deepEqual(geometry(interpolateGenome(a,b,1)),geometry(b));
    const left=geometry(interpolateGenome(a,b,.45)),right=geometry(interpolateGenome(a,b,.450001));
    assert.equal(left.length,right.length);
    left.forEach((m,i)=>{assert.equal(m[2].length,right[i][2].length);m[2].forEach((p,j)=>assert.ok(Math.hypot(p[0]-right[i][2][j][0],p[1]-right[i][2][j][1])<.03));});
  }
});

function sketchClock(){
  let serial=0;const frames=new Map(),timers=new Map();
  return {frames,timers,requestFrame:fn=>{frames.set(++serial,fn);return serial;},cancelFrame:id=>frames.delete(id),setDelay:fn=>{timers.set(++serial,fn);return serial;},clearDelay:id=>timers.delete(id),
    runFrames(){const tasks=[...frames.values()];frames.clear();tasks.forEach(fn=>fn());},runTimers(){const tasks=[...timers.values()];timers.clear();tasks.forEach(fn=>fn());}};
}

test('sketch scheduling coalesces rapid changes and never refines a held drag',async()=>{
  const {SketchScheduler}=await import('./mushrooms.mjs'),clock=sketchClock(),previews=[],refinements=[],phases=[];
  const q=new SketchScheduler({...clock,preview:v=>previews.push(v),refine:v=>refinements.push(v),phase:p=>phases.push(p)});
  q.hold();for(let i=0;i<100;i++)q.input({blend:i/100});
  assert.equal(clock.frames.size,1);assert.equal(clock.timers.size,0);clock.runFrames();
  assert.deepEqual(previews,[{blend:.99}]);assert.equal(refinements.length,0);
  clock.runTimers();clock.runFrames();assert.equal(refinements.length,0);
  q.input({blend:1});q.release();clock.runTimers();clock.runFrames();clock.runTimers();clock.runFrames();
  assert.equal(phases.at(-1),'refining');assert.equal(refinements.length,0,'status gets a frame before detailed work');
  clock.runFrames();assert.deepEqual(refinements,[{blend:1}]);
});

test('new input and recipe changes invalidate queued and in-flight settled frames',async()=>{
  const {SketchScheduler,presentSettledBitmap}=await import('./mushrooms.mjs'),clock=sketchClock(),previews=[],pending=[];
  const q=new SketchScheduler({...clock,preview:v=>previews.push(v),refine:(value,current)=>pending.push({value,current})});
  q.input({recipe:'old',blend:.4});clock.runFrames();clock.runTimers();clock.runFrames();clock.runFrames();
  assert.equal(pending.length,1);assert.equal(pending[0].current(),true);
  q.input({recipe:'old',blend:.8});assert.equal(pending[0].current(),false);
  const stalePreview=[...clock.frames.values()][0];q.cancel();q.input({recipe:'new',blend:0});
  stalePreview();clock.runFrames();assert.deepEqual(previews.at(-1),{recipe:'new',blend:0});
  let closed=0,presented=0;
  assert.equal(presentSettledBitmap({close(){closed++;}},pending[0].current,()=>presented++),false);
  assert.equal(closed,1);assert.equal(presented,0);
  clock.runTimers();clock.runFrames();const staleRefine=[...clock.frames.values()][0];q.cancel();staleRefine();
  assert.equal(pending.length,1,'cancellation also rejects a queued refinement callback');
});

test('settled bitmap presentation closes transferred resources on success and failure',async()=>{
  const {presentSettledBitmap}=await import('./mushrooms.mjs');let closed=0,painted=0;
  const bitmap={close(){closed++;}};
  assert.equal(presentSettledBitmap(bitmap,()=>true,()=>painted++),true);assert.equal(painted,1);assert.equal(closed,1);
  assert.throws(()=>presentSettledBitmap(bitmap,()=>true,()=>{throw new Error('canvas lost');}),/canvas lost/);assert.equal(closed,2);
});


test('dense construction previews keep canvas submissions bounded and reset paper opacity',async()=>{
  const {Painter}=await import('./mushrooms.mjs');let strokes=0,moves=0;const paperAlphas=[];
  const c={globalAlpha:1,setTransform(){},clearRect(){},drawImage(){paperAlphas.push(this.globalAlpha);},scale(){},beginPath(){},moveTo(){moves++;},lineTo(){},stroke(){strokes++;}};
  const target={setTransform(){},clearRect(){},drawImage(){}};
  const painter={sketchLayer:{getContext:()=>c},ctx:target,paper:{},canvas:{width:1200,height:1000}};
  const genome=generateSpecimen('lichen-54ryxv','coral-4');
  const first=Painter.prototype.sketch.call(painter,genome);
  assert.equal(first.specimenCount,3,'exercise the dense branching stress case');
  assert.ok(first.ink.length<900,'tiny branches use one centerline during motion');
  assert.ok(first.ink.reduce((n,mark)=>n+mark.points.length,0)<4000,'preview geometry has a bounded sampling budget');
  assert.ok(moves>=first.ink.length,'retain the branching geometry in the preview');
  assert.ok(strokes<=4,'canvas submissions must not scale with each tiny branch');
  Painter.prototype.sketch.call(painter,genome);
  assert.deepEqual(paperAlphas,[1,1],'preview opacity does not leak into the next paper frame');
});

test('morph playback stays in colour through its last frame, so the landing never shows a bare sketch',async()=>{
  const {Painter,playbackColouring,createMorphPair,morphPreviewKind}=await import('./mushrooms.mjs');
  assert.equal(playbackColouring({playing:true,sketchPlaying:true}),true);
  assert.equal(playbackColouring({playing:false,sketchPlaying:false}),null);
  const pair=createMorphPair(generateSpecimen('land-a','amanita-1'),generateSpecimen('land-b','agaric-1'));assert.ok(morphPreviewKind(pair));
  // Stubs stand in for the two drawing paths: the coloured morph preview and the ink lines.
  let previews=0,lines=0;const painter={morphPreview(){previews++;this.previewColoured=true;},orbitLines(){lines++;}};
  Painter.prototype.sketch.call(painter,pair.b,{morph:pair,blend:1,coloured:playbackColouring({playing:true,sketchPlaying:true})});
  assert.equal(previews,1);assert.equal(painter.previewColoured,true,'the last playback frame is coloured');
  Painter.prototype.sketch.call(painter,pair.b,{morph:{...pair,orbitRest:true},blend:1,coloured:playbackColouring({})});
  assert.equal(previews,1);assert.equal(lines,1);assert.equal(painter.previewColoured,false,'a plate at rest is sketched in ink');
});

test('connected cross-form chart stays genuinely 3D while closed and branching pairs use fictional fields',async()=>{
 const {createMorphPair,buildMorphSketch,buildConnectedAnatomySurface}=await import('./mushrooms.mjs');
 const a=generateSpecimen('chart-A','oyster-1'),b=generateSpecimen('chart-B','chanterelle-4'),pair=createMorphPair(a,b),again=createMorphPair(a,b);
 assert.deepEqual(buildMorphSketch(pair,.42),buildMorphSketch(again,.42));
 const left=buildConnectedAnatomySurface(pair,.42),right=buildConnectedAnatomySurface(pair,.420001);
 left.members.forEach((m,i)=>m.vertices.forEach((p,j)=>assert.ok(Math.hypot(...p.map((v,k)=>v-right.members[i].vertices[j][k]))<.002)));
 for(const [from,to] of [['coral-4','nest-4'],['tooth-2','saddle-3']]){const p=createMorphPair(generateSpecimen('a',from),generateSpecimen('b',to));assert.equal(p.supportedMotion,true);assert.equal(p.connectedAnatomy,undefined);assert.equal(buildMorphSketch(p,.5).implicitMorph,true);}
});

test('settled connected ink and native wash passages retain the displayed geometry',async()=>{
 const {createMorphPair,buildMorphSketch,buildMorphStudy,measureSketch}=await import('./mushrooms.mjs');
 const pair=createMorphPair(generateSpecimen('settle-A','oyster-1'),generateSpecimen('settle-B','chanterelle-1'));
 for(const t of [0,.43,1]){const sketch=buildMorphSketch(pair,t),study=buildMorphStudy(pair,t);
  assert.deepEqual(study.ink,sketch.ink);assert.deepEqual(measureSketch(study),measureSketch(sketch));assert.ok(study.washes.length>0&&study.washes.length<30);
  for(const mark of study.washes){assert.ok(mark.width>0&&mark.load>0&&mark.points.flat().every(Number.isFinite));assert.ok(mark.islands.length>0,'fully hidden regions never fall back to bounding boxes');}
 }
});

test('morph destinations have independent recipe identity and arrival promotes the exact endpoint',async()=>{
  const {chooseMorphTarget,advanceMorphState,createMorphPair,buildMorphSketch,buildMorphStudy,morphSettings,morphIdentity}=await import('./mushrooms.mjs');
  const state=parseState('?type=oyster-1&seed=first&nextType=chanterelle-4&next=second&blend=1');
  assert.equal(state.nextTypeId,'chanterelle-4');assert.equal(state.next,'second');
  const advanced=advanceMorphState(state,'third');assert.equal(advanced.seed,'second');assert.equal(advanced.typeId,'chanterelle-4');assert.equal(advanced.blend,0);assert.equal(advanced.next,'third');
  const before=createMorphPair(generateSpecimen(state.seed,state.typeId),generateSpecimen(state.next,state.nextTypeId));
  const after=createMorphPair(generateSpecimen(advanced.seed,advanced.typeId),generateSpecimen(advanced.next,advanced.nextTypeId),{composition:before.composition});
  const previousPaint=buildMorphStudy(before,1),promotedPaint=buildMorphStudy(after,0);
  const geometry=plan=>plan.ink.map(mark=>JSON.stringify(mark.points)).sort();
  assert.deepEqual(geometry(previousPaint),geometry(promotedPaint),'arrival retains exact native centerlines');
  assert.notEqual(morphIdentity(morphSettings(state)),morphIdentity(morphSettings({...state,nextTypeId:'cup-2'})));
  // With experimental forms included, every other catalog form is a destination.
  const seen=new Set();for(let i=0;i<3000;i++){const id=chooseMorphTarget('oyster-1',`target-${i}`,{includeAlpha:true});assert.notEqual(id,'oyster-1');seen.add(id);}
  assert.equal(seen.size,MUSHROOM_TYPES.filter(t=>t.id!=='bracket-6').length-1,'every other catalog form, same family included, is a random destination');
  assert.equal(parseState('?nextType=__proto__').nextTypeId,chooseMorphTarget('amanita-1','woodland-108'));
});

test('geometry measurements describe actual paths and same-recipe morphs retain the original constructor',async()=>{
  const {measureSketch,createMorphPair,buildMorphSketch,buildSketch}=await import('./mushrooms.mjs');
  const measured=measureSketch({ink:[{points:[[10,20],[13,24]],role:'stem-contour'},{points:[[0,0],[6,0]],role:'cap-contour'},{points:[[3,4],[3,10]],role:'branch'}]});
  assert.equal(measured.supportLength,5);assert.equal(measured.branchLength,6);assert.equal(measured.crownSpan,6);assert.equal(measured.span,13);assert.equal(measured.height,24);assert.equal(measured.pathLength,17);assert.equal(measured.paths,3);assert.equal(measured.points,6);
  const a=generateSpecimen('same-A','coral-4'),b=generateSpecimen('same-B','coral-4'),pair=createMorphPair(a,b);assert.equal(pair.sameRecipe,true);
  assert.deepEqual(buildMorphSketch(pair,.44,{rawFieldPlate:true}),buildSketch(interpolateGenome(a,b,.44)));
});

test('lateral shelf ownership and connected chart collar stay attached to their own specimens',async()=>{
 const {createMorphPair,buildConnectedAnatomySurface,buildSketch}=await import('./mushrooms.mjs');
 for(const [seedA,seedB] of [['first','second'],['joint-A','joint-B'],['held-out-19','held-out-77']]){
  const a=generateSpecimen(seedA,'oyster-1'),b=generateSpecimen(seedB,'chanterelle-4'),pair=createMorphPair(a,b);
  assert.deepEqual(buildSketch(a).ink.filter(m=>m.role==='stem-contour').map(m=>m.individual),[0,1,2]);
  for(const t of [.1,.25,.5,.75,.9])for(const member of buildConnectedAnatomySurface(pair,t).members){
   const cap=new Set(member.faces.filter(f=>f.role==='underside').flatMap(f=>f.indices)),stem=new Set(member.faces.filter(f=>f.role==='stem').flatMap(f=>f.indices));assert.equal([...cap].filter(v=>stem.has(v)).length,96);
  }
 }
});

test('native passages retain geometry, palette and a separate dry glaze', async () => {
  const {planNativePassages,nativePalette}=await import('./mushrooms.mjs');
  const plan=buildStudy(generateSpecimen('native-passage','amanita-1'));
  const passages=planNativePassages(plan);
  assert.equal(passages[0].kind,'wash');assert.ok(passages.some(p=>p.kind==='glaze'));
  const marks=passages.flatMap(p=>p.marks);
  assert.equal(marks.length,plan.washes.filter(m=>m.load>0&&m.points?.length&&m.palette).length);
  assert.ok(marks.every(m=>plan.washes.includes(m)),'exact authored directional paths and reserves survive');
  assert.deepEqual(nativePalette(passages),[...new Set(marks.flatMap(m=>Object.keys(m.palette)))].sort());
});

test('native optical fields preserve layered KM over sharp variable ink values', async () => {
  const {nativeOpticalFields,nativeOverInk}=await import('./mushrooms.mjs');
  const {renderLayers}=await import('../lab/media/km.js');const {BY_KEY}=await import('../lab/media/pigments.js');
  const n=32,pigments=[BY_KEY.ochre,BY_KEY.umber,BY_KEY.alizarin];
  const layers=Array.from({length:4},(_,l)=>pigments.map((_,k)=>Float32Array.from({length:n},(_,i)=>((i*17+l*7+k*3)%21)/25)));
  const ink=Uint8Array.from({length:n*3},(_,i)=>(i*37)%256),expected=renderLayers(layers,pigments,ink,n),f=nativeOpticalFields(layers,pigments,n);
  for(let q=0;q<expected.length;q++)assert.ok(Math.abs(expected[q]-nativeOverInk(f.R[q],f.B[q],f.T[q],ink[q]))<=1);
  assert.ok(f.R.some((r,i)=>Math.abs(r-f.B[i])>.001),'mixed glaze stack needs distinct back reflectance');
});

const tinyNativeStudy=()=>({washes:[
  {role:'cap',shape:[[120,120],[1080,120],[1080,880],[120,880]],points:[[120,450],[600,480],[1080,450]],width:600,palette:{ochre:.8,umber:.2},load:.12,wetness:.6,granulation:.7,pooling:.5,softness:.4,variation:.4},
  {role:'cap-turn',shape:[[120,120],[1080,120],[1080,880],[120,880]],points:[[150,650],[600,680],[1050,650]],width:180,palette:{umber:1},load:.14,wetness:.4,granulation:.7,pooling:.5,softness:.4,variation:.4}
]});

test('native transport reaches zero water and fixes distinct wash and glaze layers', async () => {
  const {simulateNativePassages,nativeWashPasses,nativeBrushGestures}=await import('./mushrooms.mjs');const checkpoints=[];
  const result=await simulateNativePassages(tinyNativeStudy(),{width:48,seed:17,yieldWork:async()=>{},onCheckpoint:async p=>checkpoints.push({stage:p.stage,complete:p.complete,...p.metrics})});
  assert.equal(result.complete,true);assert.equal(result.water,0);assert.equal(result.fixedLayers,2);
  // The 600-wide cap wash goes on as brush-wide passes; each pass is a stroke.
  const passes=tinyNativeStudy().washes.map(mark=>nativeWashPasses(nativeBrushGestures(mark),mark).length);
  assert.ok(passes[0]>1&&passes[1]>=1);assert.equal(result.strokes,passes[0]+passes[1]);assert.ok(result.steps>50);assert.ok(result.pig.every(n=>n>0));
  assert.ok(checkpoints.some(p=>p.stage.includes('wet pigment')&&p.water>0));
  assert.ok(checkpoints.some(p=>p.stage.includes('flow and pooling')&&p.water>0));
  assert.ok(checkpoints.filter(p=>p.stage.endsWith('dry')).every(p=>p.water===0));
  assert.equal(checkpoints.at(-1).complete,true);
});

test('native cancellation stops before claiming a completed or fixed wash', async () => {
  const {simulateNativePassages}=await import('./mushrooms.mjs');let cancelled=false,completed=false;
  await assert.rejects(simulateNativePassages(tinyNativeStudy(),{width:32,seed:19,yieldWork:async()=>{},isCancelled:()=>cancelled,onCheckpoint:async p=>{completed ||= p.complete;cancelled=true;}}),{name:'AbortError'});
  assert.equal(completed,false);
});


test('native drying budget never marks a wet sheet complete or fixes a truncated wash', async () => {
  const {simulateNativePassages,NATIVE_PAINT_LIMITS}=await import('./mushrooms.mjs');const checkpoints=[];
  await assert.rejects(simulateNativePassages(tinyNativeStudy(),{width:32,seed:23,limits:{...NATIVE_PAINT_LIMITS,maxSteps:1},yieldWork:async()=>{},onCheckpoint:async p=>checkpoints.push({complete:p.complete,...p.metrics})}),/still wet/);
  assert.ok(checkpoints.some(p=>p.water>0));assert.ok(checkpoints.every(p=>!p.complete&&p.fixedLayers===0));
});

test('native form shadows follow cap meridians and the shaded stem flank',async()=>{
  const {nativeBrushPath}=await import('./mushrooms.mjs');
  const study=buildStudy(generateSpecimen('native-shadows','amanita-1'));
  const shadows=study.washes.filter(m=>m.surface?.rails&&['cap-turn','stem-shadow'].includes(m.role));assert.ok(shadows.length>=4);
  for(const mark of shadows){const path=nativeBrushPath(mark);assert.equal(path.length,mark.surface.rails.length);assert.ok(path.every(q=>[q.x,q.y,q.r].every(Number.isFinite)&&q.r>0));assert.notDeepEqual(path.map(q=>[q.x,q.y]),mark.points);assert.ok(Math.max(...path.map(q=>q.r))*2<mark.width,'shadow brush occupies a flank, not the whole silhouette');}
});

test('native stroke chunks share exact endpoints and preserve one finite dip until lift',async()=>{
  const {nativeStrokeSegments}=await import('./mushrooms.mjs');const {createBrush,dip,stroke}=await import('../lab/media/brush.js');const {makePaper}=await import('../lab/media/paper.js');const {createSheet,totals}=await import('../lab/media/sheet.js');const {BY_KEY}=await import('../lab/media/pigments.js');
  const path=[{x:6,y:18,p:.7,r:5},{x:55,y:18,p:.7,r:5}],parts=nativeStrokeSegments(path,8);assert.ok(parts.length>5);
  for(let i=1;i<parts.length;i++)assert.deepEqual(parts[i][0],parts[i-1].at(-1));
  const run=segmented=>{const sheet=createSheet(makePaper(64,40,{seed:4,fibres:0,tooth:0}),[BY_KEY.ochre]),brush=createBrush({radius:5,bristles:20,variety:0,capacity:20});dip(brush,{water:.7,conc:[.15]});const before=brush.resW;const list=segmented?parts:[path];for(let i=0;i<list.length;i++){stroke(brush,sheet,list[i],{spacing:1,lift:i===list.length-1});if(i<list.length-1)assert.equal(brush._onPaper,true);}assert.equal(brush.dips,1);assert.equal(brush._onPaper,false);assert.ok(brush.resW<=before);return totals(sheet);};
  const a=run(false),b=run(true);assert.ok(Math.abs(a.water-b.water)<1e-5);assert.ok(Math.abs(a.pig[0]-b.pig[0])<1e-5);
});

test('live optical mass averaging preserves pigment thickness without mutating native fields',async()=>{
  const {nativePreviewLayers}=await import('./mushrooms.mjs');const plane=Float32Array.from({length:16},(_,i)=>i),before=plane.slice();
  const sampled=nativePreviewLayers([[plane]],4,4,2);assert.equal(sampled.width,2);assert.equal(sampled.height,2);assert.deepEqual([...sampled.layers[0][0]],[2.5,4.5,10.5,12.5]);assert.deepEqual(plane,before);assert.equal(sampled.layers[0][0].reduce((a,b)=>a+b,0)*4,plane.reduce((a,b)=>a+b,0));
});

test('native ink batching changes only order and remains deterministic with shared masks',async()=>{
  const {nativeInkOrder}=await import('./mushrooms.mjs');const plan=buildStudy(generateSpecimen('native-ink-order','amanita-1')),ordered=nativeInkOrder(plan.ink);
  assert.equal(ordered.length,plan.ink.length);assert.equal(new Set(ordered).size,new Set(plan.ink).size);assert.ok(ordered.every(m=>plan.ink.includes(m)));assert.deepEqual(ordered,nativeInkOrder(plan.ink));
});

test('looser native painting preserves structural ink and a connected pale cap base',async()=>{
  const {nativeInkSelection,nativeBrushGestures}=await import('./mushrooms.mjs'),study=buildStudy(generateSpecimen('native-loose','amanita-1')),selected=nativeInkSelection(study.ink);
  assert.deepEqual(selected,nativeInkSelection(study.ink));for(const mark of study.ink)if(!['fibres','lamella-shadow','gills','veil','habitat'].includes(mark.role))assert.ok(selected.includes(mark));
  for(const role of ['fibres','lamella-shadow']){const before=study.ink.filter(m=>m.role===role).length,after=selected.filter(m=>m.role===role).length;assert.ok(after/before>.04&&after/before<.18);}
  for(const mark of study.washes.filter(m=>m.role==='cap'&&m.surface?.rails)){const gestures=nativeBrushGestures(mark);assert.equal(gestures.length,1);assert.deepEqual(gestures[0].path.map(q=>[q.x,q.y]),mark.points);assert.ok(gestures[0].path.every(q=>q.r===mark.width/2));assert.ok(gestures[0].path[0].p<gestures[0].path.at(-1).p);}
});

import {clampPlateViewport,zoomPlateViewport,centredPlateViewport,mountPlateViewport} from './mushrooms.mjs';

test('plate zoom keeps the plate centred and clamps scale to the paper',()=>{
  const size={width:800,height:600},anchor={x:230,y:180};
  const a={scale:1,x:0,y:0},b=zoomPlateViewport(a,3,anchor,size);
  assert.equal(b.scale,3);assert.equal((anchor.x-b.x)/b.scale,anchor.x);assert.equal((anchor.y-b.y)/b.scale,anchor.y);
  assert.deepEqual(zoomPlateViewport(b,1,anchor,size),a);
  assert.deepEqual(clampPlateViewport({scale:20,x:-99999,y:99999},size),{scale:6,x:-4000,y:0});
  assert.deepEqual(centredPlateViewport(3,size),{scale:3,x:-800,y:-600});assert.deepEqual(centredPlateViewport(1,size),{scale:1,x:0,y:0});
  assert.deepEqual(centredPlateViewport(20,size),{scale:6,x:-2000,y:-1500});assert.deepEqual(centredPlateViewport(NaN,size),{scale:1,x:0,y:0});
});

function zoomFixture(options={}){
  class Element extends EventTarget{
    constructor(){super();this.dataset={};this.style={};this.clientWidth=800;this.clientHeight=600;this.tagName='DIV';this.captured=new Set();this.classes=new Set();this.classList={toggle:(k,on)=>on?this.classes.add(k):this.classes.delete(k),remove:k=>this.classes.delete(k)};}
    getBoundingClientRect(){return {left:0,top:0,width:800,height:600};}
    setAttribute(key,value){(this.attributes??={})[key]=value;}
    setPointerCapture(id){this.captured.add(id);}hasPointerCapture(id){return this.captured.has(id);}releasePointerCapture(id){this.captured.delete(id);}focus(){}
  }
  const root=new Element(),viewport=new Element(),canvas=new Element();
  canvas.width=1200;canvas.height=1000;canvas.getContext=()=>{throw new Error('Display zoom must never repaint');};
  const controller=mountPlateViewport({viewport,canvas,root,...options});
  const event=(target,type,props={})=>{const e=Object.assign(new Event(type,{cancelable:true}),props);target.dispatchEvent(e);return e;};
  return {root,viewport,canvas,controller,event};
}
test('plate zoom: wheel and keys zoom about the centre, a drag never pans, a double click fits, without repainting',()=>{
  let taps=0;const f=zoomFixture({onTap:()=>taps++});
  assert.equal(f.viewport.dataset.viewportZoom,'1');
  assert.equal(f.event(f.root,'wheel',{deltaY:-100,clientX:400,clientY:300}).defaultPrevented,false);
  assert.equal(f.event(f.viewport,'wheel',{deltaY:-100,deltaMode:0,clientX:30,clientY:20}).defaultPrevented,true);
  const zoomed=f.controller.getState();assert.ok(zoomed.scale>1);assert.match(f.canvas.style.transform,/scale\(/);
  assert.deepEqual(zoomed,centredPlateViewport(zoomed.scale,{width:800,height:600}),'zoom ignores the pointer and stays centred');
  f.event(f.viewport,'pointerdown',{pointerType:'mouse',button:0,pointerId:1,clientX:200,clientY:200});
  assert.equal(f.viewport.hasPointerCapture(1),true);
  f.event(f.viewport,'pointermove',{pointerId:1,clientX:150,clientY:160});assert.deepEqual(f.controller.getState(),zoomed);
  f.event(f.viewport,'pointerup',{pointerId:1});assert.equal(f.viewport.hasPointerCapture(1),false);assert.equal(taps,0,'a drag is not a tap');
  f.event(f.root,'keydown',{key:'+'});assert.ok(f.controller.getState().scale>zoomed.scale);assert.deepEqual(f.controller.getState(),centredPlateViewport(f.controller.getState().scale,{width:800,height:600}));
  f.event(f.root,'keydown',{key:'0'});assert.deepEqual(f.controller.getState(),{scale:1,x:0,y:0});
  f.event(f.root,'keydown',{key:'+'});f.event(f.viewport,'dblclick');assert.deepEqual(f.controller.getState(),{scale:1,x:0,y:0});
  f.event(f.viewport,'pointerdown',{pointerType:'mouse',button:0,pointerId:2,clientX:300,clientY:300});f.event(f.viewport,'pointerup',{pointerId:2,clientX:300,clientY:300});
  assert.equal(taps,1,'a click on the plate is a tap');
  assert.equal(f.canvas.width,1200);assert.equal(f.canvas.height,1000);f.controller.destroy();
});
test('plate pinch scales about the plate centre and keeps the whole canvas as the export source',()=>{
  const f=zoomFixture();
  f.event(f.viewport,'pointerdown',{pointerType:'touch',pointerId:1,clientX:300,clientY:300});
  f.event(f.viewport,'pointerdown',{pointerType:'touch',pointerId:2,clientX:500,clientY:300});
  f.event(f.viewport,'pointermove',{pointerId:1,clientX:200,clientY:300});
  f.event(f.viewport,'pointermove',{pointerId:2,clientX:600,clientY:300});
  assert.deepEqual(f.controller.getState(),{scale:2,x:-400,y:-300});
  // An off-centre pinch that drifts sideways still zooms about the centre.
  f.event(f.viewport,'pointermove',{pointerId:1,clientX:50,clientY:100});f.event(f.viewport,'pointermove',{pointerId:2,clientX:250,clientY:100});
  assert.deepEqual(f.controller.getState(),centredPlateViewport(1,{width:800,height:600}));
  f.event(f.viewport,'pointermove',{pointerId:2,clientX:650,clientY:100});assert.deepEqual(f.controller.getState(),centredPlateViewport(3,{width:800,height:600}));
  f.event(f.viewport,'pointercancel',{pointerId:2});assert.equal(f.viewport.hasPointerCapture(2),false);
  f.event(f.viewport,'dblclick');assert.equal(f.canvas.dataset.viewportZoom,'1');assert.equal(f.canvas.width*f.canvas.height,1200000);f.controller.destroy();
});



// Field-study geometry invariants. Native ink/wash still needs visual review.
test('field-study URL flag is opt in and round-trips in state',()=>{
  assert.equal(parseState('').fieldPlate,false);
  assert.equal(parseState('?plate=1').fieldPlate,true);
  assert.equal(parseState('?plate=0').fieldPlate,false);
});
test('connected field-study slots and marks persist through both endpoints',async()=>{
  const m=await import('./mushrooms.mjs');
  const a=generateSpecimen('field-a','oyster-1'),b=generateSpecimen('field-b','chanterelle-1');
  const pair=m.withFieldPlatePair(m.createMorphPair(a,b),true),recipe=pair.fieldPlate;
  const signature=p=>p.ink.map(x=>[x.fieldPlateId,x.points.length]);let expected;
  for(const t of [0,.001,.25,.5,.75,.999,1]){
    const args={connected:{pair:pair.fieldPlateConnected,t},morph:{a,b,t}};
    const full=m.buildFieldPlateAdjuncts(a,recipe,args),sketch=m.buildFieldPlateAdjuncts(a,recipe,{...args,sketch:true});
    expected??=signature(full);assert.deepEqual(signature(full),expected);
    assert.deepEqual(full.ink,sketch.ink);assert.deepEqual(full.bodies,sketch.bodies);assert.deepEqual(sketch.washes,[]);
    for(const mark of full.ink)for(const p of mark.points)assert.ok(p.every(Number.isFinite));
    const composed=m.buildMorphSketch(pair,t);
    assert.equal(composed.fieldPlate,recipe);assert.ok(composed.ink.some(x=>x.fieldPlateId));
    for(const mark of composed.ink.filter(x=>!x.fieldPlateId))for(const [x,y] of mark.points){
      assert.ok(x>=recipe.adultBox.x-1&&x<=recipe.adultBox.x+recipe.adultBox.w+1,`main x ${x}`);
      assert.ok(y>=recipe.adultBox.y-1&&y<=recipe.adultBox.y+recipe.adultBox.h+1,`main y ${y}`);
    }
  }
});
test('puffball and coral studies never receive a radial cap deposit',async()=>{
  const m=await import('./mushrooms.mjs');
  for(const type of ['puffball-1','coral-1','morel-1']){
    const a=generateSpecimen('field-a',type),b=generateSpecimen('field-b',type);
    const pair=m.withFieldPlatePair(m.createMorphPair(a,b),true);
    assert.equal(pair.fieldPlate.showDeposit,false);
    const p=m.buildMorphSketch(pair,.5);assert.ok(p.ink.some(x=>x.fieldPlateId));
    assert.ok(p.bodies.every(x=>x.studyRole!=='spore-deposit'));
  }
});
test('field-study enablement preserves the selected main family builder',async()=>{
  const m=await import('./mushrooms.mjs');
  for(const type of ['hedgehog-1','inkcap-1','bracket-1']){
    const a=generateSpecimen('field-a',type),b=generateSpecimen('field-b',type),rawPair=m.createMorphPair(a,b),pair=m.withFieldPlatePair(rawPair,true);
    const raw=m.buildMorphSketch(rawPair,.4,{rawFieldPlate:true}),fitted=m.buildMorphSketch(pair,.4),main=fitted.ink.filter(mark=>!mark.fieldPlateId);
    assert.equal(main.length,raw.ink.length);const {scale,tx,ty}=fitted.fieldPlateTransform;
    main.forEach((mark,i)=>{assert.equal(mark.role,raw.ink[i].role);assert.equal(mark.points.length,raw.ink[i].points.length);for(const k of [0,mark.points.length-1]){assert.ok(Math.abs((mark.points[k][0]-tx)/scale-raw.ink[i].points[k][0])<1e-8);assert.ok(Math.abs((mark.points[k][1]-ty)/scale-raw.ink[i].points[k][1])<1e-8);}});
  }
});
test('main fit preserves affine depth and native surface positions',async()=>{
  const m=await import('./mushrooms.mjs');
  const shape=[[0,0],[10,0],[10,10]],depth=[2,3,4];shape.cameraDepth=depth;
  const tri={poly:shape,depth,wa:[.1,0,0],wb:[0,.1,0]};
  const wash={shape,points:[[0,5],[10,5]],basePoints:[[1,3],[8,7]],baseWidth:6,width:10,reserves:[shape],islands:[shape],surface:{rails:[shape],mesh:[shape]},depthFaces:[{triangles:[tri]}],volumes:[{start:[0,0],end:[10,10],radius:2}]};
  const p=m.transformFieldPlateMain({ink:[],washes:[wash]},{sourceBox:{x:0,y:0,w:10,h:10},adultBox:{x:500,y:100,w:100,h:100}}),w=p.washes[0];
  assert.equal(w.shape,w.reserves[0]);assert.equal(w.shape,w.surface.rails[0]);assert.equal(w.shape,w.depthFaces[0].triangles[0].poly);
  assert.equal(w.volumes[0].radius,20);assert.deepEqual(w.basePoints,[[510,130],[580,170]]);assert.equal(w.baseWidth,60);
  const [x,y]=w.shape[2],d=w.shape.cameraDepth;assert.ok(Math.abs(d[0]*x+d[1]*y+d[2]-54)<1e-9);
});
test('immutable paper template is reused without changing native physics',async()=>{
  const {simulateNativePassages,NATIVE_PAPER_VERSION}=await import('./mushrooms.mjs');let template,coldLayers,warmLayers;
  const options={width:48,seed:71,yieldWork:async()=>{},onPaper:p=>{template=p},onCheckpoint:async p=>{if(p.complete)coldLayers=p.sheet.layers.map(l=>l.map(a=>a.slice()))}};
  const cold=await simulateNativePassages(tinyNativeStudy(),options),before=structuredClone(template);
  assert.equal(template.materialVersion,NATIVE_PAPER_VERSION);assert.equal(cold.paperReused,false);
  const warm=await simulateNativePassages(tinyNativeStudy(),{...options,paperTemplate:template,onPaper:()=>assert.fail('must reuse valid paper'),onCheckpoint:async p=>{if(p.complete)warmLayers=p.sheet.layers}});
  assert.equal(warm.paperReused,true);assert.deepEqual(template,before,'transport must not mutate material fields');assert.deepEqual(warmLayers,coldLayers);assert.equal(warm.steps,cold.steps);assert.equal(warm.water,0);
});

{
const {createSpecimenComposition,validateSpecimenComposition,connectedAnatomyDimensions,createConnectedAnatomyPair,buildConnectedAnatomySurface,buildConnectedAnatomy,CONNECTED_CAP_GRAMMARS}=await import('./mushrooms.mjs');
const genomes=MUSHROOM_TYPES.map(t=>generateSpecimen('connected-chart',t.id));
const a=genomes.find(g=>g.profileId==='oyster-1'),b=genomes.find(g=>g.profileId==='chanterelle-4'),composition=createSpecimenComposition(a,{count:3});
const pair=createConnectedAnatomyPair(a,b,composition);
const snapshot=surface=>surface.members.map(member=>({vertices:member.vertices,faces:member.faces.map(f=>f.indices),paths:member.paths.map(p=>({id:p.id,points:p.points}))}));
const length=points=>points.reduce((sum,p,i)=>i?sum+Math.hypot(...p.map((v,k)=>v-points[i-1][k])):sum,0);
test('composition is reproducible, carried across recipe/seed promotion, and independent of destination habit',()=>{
 assert.deepEqual(createSpecimenComposition(a,{count:3}),composition);
 assert.equal(createConnectedAnatomyPair(b,a,composition).composition,composition);
 assert.equal(pair.composition.members.length,3);assert.equal(new Set(composition.members.map(m=>m.id)).size,3);
 assert.throws(()=>validateSpecimenComposition({...composition,members:[composition.members[0],composition.members[0]]}),/Invalid/);
});
test('both endpoints use exactly the same surface and detail constructor as a stationary specimen',()=>{
 const staticA=createConnectedAnatomyPair(a,a,composition),staticB=createConnectedAnatomyPair(b,b,composition);
 assert.deepEqual(snapshot(buildConnectedAnatomySurface(pair,0)),snapshot(buildConnectedAnatomySurface(staticA,0)));
 assert.deepEqual(snapshot(buildConnectedAnatomySurface(pair,1)),snapshot(buildConnectedAnatomySurface(staticB,0)));
 assert.deepEqual(buildConnectedAnatomy(pair,.35),buildConnectedAnatomy(pair,.35));
});
test('each specimen remains one connected closed surface at every sampled blend, with shared cap/stipe contact vertices',()=>{
 for(const t of [0,.01,.1,.25,.5,.75,.9,.99,1])for(const member of buildConnectedAnatomySurface(pair,t).members){
   const edges=new Map(),adjacency=member.vertices.map(()=>new Set());
   for(const face of member.faces)face.indices.forEach((u,j)=>{const v=face.indices[(j+1)%face.indices.length],key=u<v?`${u}:${v}`:`${v}:${u}`;edges.set(key,(edges.get(key)??0)+1);adjacency[u].add(v);adjacency[v].add(u);});
   assert.ok([...edges.values()].every(n=>n===2),'surface has a boundary or non-manifold edge');
   const visited=new Set([0]),queue=[0];while(queue.length){for(const v of adjacency[queue.pop()])if(!visited.has(v)){visited.add(v);queue.push(v);}}
   assert.equal(visited.size,member.vertices.length,'detached component');
   const stemVertices=new Set(member.faces.filter(f=>f.role==='stem').flatMap(f=>f.indices)),underVertices=new Set(member.faces.filter(f=>f.role==='underside').flatMap(f=>f.indices));
   assert.equal([...stemVertices].filter(v=>underVertices.has(v)).length,96,'cap and stipe do not share full collar');
 }
});
test('no underside detail collapses, disappears, or is created at an endpoint',()=>{
 const ids=buildConnectedAnatomySurface(pair,0).members.map(m=>m.paths.filter(p=>p.role==='folds').map(p=>p.id));
 for(const t of [0,.02,.25,.5,.75,.98,1])buildConnectedAnatomySurface(pair,t).members.forEach((member,index)=>{
  const paths=member.paths.filter(p=>p.role==='folds');assert.deepEqual(paths.map(p=>p.id),ids[index]);assert.equal(paths.length,40);
  assert.ok(paths.every(p=>length(p.points)>8));
  for(const path of paths){assert.ok(path.points.every(p=>p.every(Number.isFinite)));assert.ok(path.points.length>=23);}
 });
});
test('geometric surface and descriptive paths remain continuous on either side of the midpoint and near endpoints',()=>{
 for(const t of [0,.499999,.5,.999999]){
  const left=buildConnectedAnatomySurface(pair,t),right=buildConnectedAnatomySurface(pair,Math.min(1,t+1e-6));
  left.members.forEach((member,i)=>member.vertices.forEach((p,j)=>assert.ok(Math.hypot(...p.map((v,k)=>v-right.members[i].vertices[j][k]))<.002)));
  left.members.forEach((member,i)=>member.paths.filter(p=>p.role==='folds').forEach((path,j)=>path.points.forEach((p,k)=>assert.ok(Math.hypot(...p.map((v,c)=>v-right.members[i].paths.filter(p=>p.role==='folds')[j].points[k][c]))<.002))));
 }
});
test('seed and related member variation affect intrinsic shape while anatomy stays bounded',()=>{
 const other={...a,seed:'independent-seed',values:a.values.map((v,i)=>i%3===0?1-v:v)};
 const first=connectedAnatomyDimensions(a,composition.members[0]),next=connectedAnatomyDimensions(other,composition.members[0]),sibling=connectedAnatomyDimensions(a,composition.members[1]);
 assert.notEqual(first.radius,next.radius);assert.notEqual(first.height,next.height);assert.notEqual(first.radius,sibling.radius);
 for(const p of [first,next,sibling]){assert.ok(p.radius>p.stemRadius+12);assert.ok(p.height>30);assert.ok(p.eccentricity<.95);}
});
test('every catalog growth plan produces finite closed 3D geometry; unknown plans reject explicitly',()=>{
 for(const genome of genomes.filter(g=>CONNECTED_CAP_GRAMMARS.includes(g.phenotype.grammar))){
  const p=createConnectedAnatomyPair(genome,genome,createSpecimenComposition(genome,{count:1}));
  const surface=buildConnectedAnatomySurface(p,0);assert.ok(surface.members[0].mesh.closed);assert.ok(surface.members[0].vertices.every(p=>p.every(Number.isFinite)));
 }
 for(const genome of genomes.filter(g=>!CONNECTED_CAP_GRAMMARS.includes(g.phenotype.grammar))){
  const surface=buildConnectedAnatomySurface(createConnectedAnatomyPair(genome,genome,createSpecimenComposition(genome,{count:1})),0);
  assert.ok(surface.members[0].mesh.closed,genome.profileId);assert.ok(surface.members[0].vertices.every(p=>p.every(Number.isFinite)),genome.profileId);
 }
 assert.throws(()=>createConnectedAnatomyPair(a,{...genomes.find(g=>g.profileId==='coral-1'),phenotype:{grammar:'unknown-plan'}},composition),/No connected cap chart/);
});
test('native paint adapter retains the complete preview geometry at endpoints and intermediate stops',async()=>{
 const {buildConnectedAnatomyPaintPlan}=await import('./mushrooms.mjs');
 for(const t of [0,.5,1]){
  const preview=buildConnectedAnatomy(pair,t),paint=buildConnectedAnatomyPaintPlan(pair,t);
  assert.deepEqual(paint.ink,preview.ink);assert.deepEqual(paint.bodies,preview.bodies);
  assert.equal(paint.washes.length,preview.bodies.length+preview.specimenCount*2);
  for(const wash of paint.washes){assert.ok(wash.islands.every(poly=>poly.length>=3&&poly.flat().every(Number.isFinite)));assert.ok(wash.points.length>=2);}
 }
});

test('camera controls project the same world body, while depth and bend modifiers change its actual 3D geometry',()=>{
 const base=buildConnectedAnatomySurface(pair,.5),rotated=buildConnectedAnatomySurface({...pair,view:{yaw:.6,pitch:.7}},.5);
 for(let i=0;i<base.members.length;i++){assert.deepEqual(base.members[i].worldVertices,rotated.members[i].worldVertices);assert.notDeepEqual(base.members[i].vertices,rotated.members[i].vertices);}
 const deeper=buildConnectedAnatomySurface({...pair,shapeModifiers:{capDepth:1.35,stemBend:30}},.5);
 assert.notDeepEqual(base.members[0].worldVertices,deeper.members[0].worldVertices);
 assert.throws(()=>buildConnectedAnatomySurface({...pair,view:{yaw:NaN,pitch:.3}},.5),/Non-finite/);
});
test('settled visibility masks remove overlap of nearer tissue, and shadow paths project from the same surface',async()=>{
 const {resolveConnectedWashRegions,buildConnectedAnatomyPaintPlan}=await import('./mushrooms.mjs');
 const slots=createSpecimenComposition(a,{count:2});slots.members[0].x=700;slots.members[1].x=730;slots.members[0].y=780;slots.members[1].y=810;
 const p=createConnectedAnatomyPair(a,b,slots),surface=buildConnectedAnatomySurface(p,.5),plan=buildConnectedAnatomy(p,.5),paint=buildConnectedAnatomyPaintPlan(p,.5),regions=resolveConnectedWashRegions(surface);
 const area=poly=>Math.abs(poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-q[0]*p[1];},0))*.5;
 const before=plan.bodies.reduce((sum,body)=>sum+body.islands.reduce((n,p)=>n+area(p),0),0),after=[...regions.values()].flat().reduce((sum,p)=>sum+area(p),0);
 assert.ok(after<before*.96,'overlap was not removed');assert.ok(after>before*.35,'visible body disappeared');
 assert.equal(paint.washes.filter(w=>w.role==='cap-glaze').length,2);assert.equal(paint.washes.filter(w=>w.role==='stem-shadow').length,2);
 for(const passage of plan.surfacePassages){const member=surface.members[passage.individual],type=passage.role==='cap-glaze'?'cap':'stem';assert.deepEqual(passage.points,member.shadowPaths[type].map(p=>p.slice(0,2)));}
});

}

test('3D state bounds, render identity and supported-family dispatch are explicit',async()=>{
 const {createMorphPair,connectedViewOptions,morphSettings,morphIdentity}=await import('./mushrooms.mjs');
 const state=parseState('?type=oyster-1&nextType=chanterelle-4&layout=kept&members=3&yaw=.7&pitch=.6&depth=1.3&bend=20&plate=1');
 assert.equal(state.compositionSeed,'kept');assert.equal(state.compositionCount,3);assert.deepEqual(connectedViewOptions(state),{view:{yaw:.7,pitch:.6},shapeModifiers:{capDepth:1.3,stemBend:20}});
 assert.notEqual(morphIdentity(morphSettings(state)),morphIdentity(morphSettings({...state,yaw:.71})));
 assert.equal(parseState('?yaw=NaN&pitch=Infinity&depth=-8&bend=1000').yaw,.12);assert.equal(parseState('?depth=-8').capDepth,.65);assert.equal(parseState('?bend=1000').stemBend,50);
 for(const type of ['amanita-1','bolete-1','hedgehog-1','parasol-1']){const pair=createMorphPair(generateSpecimen('a',type),generateSpecimen('b',type));assert.equal(pair.connectedAnatomy,undefined);assert.equal(pair.supportedMotion,true);}
});

test('native coral shadows follow bounded branch tubes without mutating anatomy',async()=>{
  const {nativeCoralGlazes,planNativePassages}=await import('./mushrooms.mjs');
  for(const id of ['coral-1','coral-3','coral-4']){
    const study=buildStudy(generateSpecimen('native-proof-20261019',id)),before=structuredClone(study.washes),glazes=nativeCoralGlazes(study.washes);
    assert.deepEqual(study.washes,before);assert.deepEqual(glazes,nativeCoralGlazes(study.washes));
    assert.ok(glazes.length>=8&&glazes.length<=12);
    const passage=planNativePassages(study).find(p=>p.kind==='glaze');
    assert.equal(passage.marks.filter(m=>m.role==='coral-shadow').length,glazes.length);
    for(const mark of glazes){
      assert.ok(mark.points.flat().every(Number.isFinite));assert.ok(mark.width>0&&mark.width<65);
      assert.equal(mark.islands.length,1);assert.equal(mark.shape,mark.islands[0]);
      assert.ok(mark.reserves.every(poly=>poly.length>=3));
    }
  }
  assert.deepEqual(nativeCoralGlazes(buildStudy(generateSpecimen('native-proof-20261019','amanita-1')).washes),[]);
});

test('native coral flank glaze deposits real pigment in a second dry fixed layer',async()=>{
  const {simulateNativePassages}=await import('./mushrooms.mjs');
  const shape=[[450,200],[550,200],[550,800],[450,800]],study={washes:[{role:'coral',shape,islands:[shape],volumes:[{start:[500,780],end:[500,220],radius:50}],points:[[500,780],[500,220]],width:100,palette:{ochre:.8,sienna:.2},load:.2,wetness:.6,softness:.5,granulation:.5,pooling:.5,variation:.5}]};
  const inside=([x,y],poly)=>{let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(((a[1]>y)!==(b[1]>y))&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
  let final;
  const result=await simulateNativePassages(study,{width:48,seed:42,yieldWork:async()=>{},maskFor:(mark,{width,height,scale})=>Uint8Array.from({length:width*height},(_,i)=>{const p=[(i%width+.5)/scale,(Math.floor(i/width)+.5)/scale];return +(inside(p,mark.shape)&&(!mark.islands||mark.islands.some(poly=>inside(p,poly)))&&!mark.reserves?.some(poly=>inside(p,poly)));}),onCheckpoint:async q=>{if(q.complete)final=q.sheet;}});
  assert.equal(result.fixedLayers,2);assert.equal(result.water,0);assert.ok(result.steps>0);
  assert.ok(final.layers[1].some(channel=>channel.some(v=>v>0)));
});


test('intrinsic debug values are the actual adult dimensions, independent of camera and display zoom',async()=>{
 const m=await import('./mushrooms.mjs'),a=generateSpecimen('intrinsic-a','oyster-1'),b=generateSpecimen('intrinsic-b','chanterelle-4');
 const pair=m.createMorphPair(a,b),adult=pair.composition.members.reduce((best,v,i,all)=>v.maturity>all[best].maturity?i:best,0);
 for(const t of [0,.25,.5,.75,1]){
  const values=m.connectedIntrinsicValues(pair,t),dimension=m.buildConnectedAnatomySurface(pair,t).dimensions[adult];
  assert.equal(values.memberId,pair.composition.members[adult].id);assert.equal(values.stemWidth,dimension.stemRadius*2);
  for(const [key] of m.CONNECTED_ANATOMY_MEASURES)if(key!=='stemWidth')assert.equal(values[key],dimension[key]);
  assert.deepEqual(m.connectedIntrinsicValues({...pair,view:{yaw:.9,pitch:.8}},t),values);
 }
 const p=m.connectedIntrinsicValues(pair,.5),deeper=m.connectedIntrinsicValues({...pair,shapeModifiers:{capDepth:1.3,stemBend:20}},.5);
 assert.equal(deeper.capDepth,p.capDepth*1.3);assert.equal(deeper.bend,p.bend+20);
 const base=m.buildConnectedAnatomySurface(pair,.5),changed=m.buildConnectedAnatomySurface({...pair,anatomyA:pair.anatomyA.map(p=>({...p,decurrent:p.decurrent*.5,ridgeWidth:p.ridgeWidth*2})),anatomyB:pair.anatomyB.map(p=>({...p,decurrent:p.decurrent*.5,ridgeWidth:p.ridgeWidth*2}))},.5);
 assert.notDeepEqual(base.members[adult].paths.find(p=>p.id.includes('primary-ridge-')).points,changed.members[adult].paths.find(p=>p.id.includes('primary-ridge-')).points);
 assert.notDeepEqual(base.members[adult].paths.find(p=>p.id.includes('secondary-ridge-')).points,changed.members[adult].paths.find(p=>p.id.includes('secondary-ridge-')).points);
});

test('field studies do not substitute a generic connected cap for other family anatomy',async()=>{
 const m=await import('./mushrooms.mjs');
 for(const type of ['amanita-1','bolete-1','hedgehog-1']){
  const pair=m.withFieldPlatePair(m.createMorphPair(generateSpecimen('a',type),generateSpecimen('b',type)));
  assert.equal(pair.fieldPlateConnected,null);
  const plan=m.buildMorphSketch(pair,.5);assert.ok(plan.annotations.some(a=>a.text.includes('Schematic')));
 }
 const a=generateSpecimen('a','oyster-1'),b=generateSpecimen('b','chanterelle-4'),pair=m.withFieldPlatePair(m.createMorphPair(a,b));
 const end=m.buildMorphSketch(pair,1),next=m.withFieldPlatePair(m.createMorphPair(b,generateSpecimen('c','chanterelle-1'),{composition:pair.composition}));
 const promoted=m.buildMorphSketch(next,0);assert.deepEqual(promoted.ink,end.ink);assert.deepEqual(promoted.bodies,end.bodies);
});

test('direct 3D drag defaults to rotate, changes clamped camera coordinates and leaves display zoom independent',async()=>{
  const {orbitPlateCamera,ORBIT_YAW_PER_WIDTH,PLATE_TOUCH}=await import('./mushrooms.mjs');let camera={yaw:.12,pitch:.36},starts=0,ends=[];
  const f=zoomFixture({onOrbitStart:()=>starts++,onOrbit:(delta,size)=>{camera=orbitPlateCamera(camera,delta,size)},onOrbitEnd:value=>ends.push(value)});
  assert.equal(f.controller.getMode(),'none');f.controller.setOrbitEnabled(true);assert.equal(f.controller.getMode(),'rotate');assert.equal(f.viewport.dataset.viewportMode,'rotate');
  f.event(f.viewport,'pointerdown',{pointerType:'mouse',button:0,pointerId:1,clientX:200,clientY:300});
  f.event(f.viewport,'pointermove',{pointerId:1,clientX:400,clientY:200});
  // The turn starts where the pointer left the mouse slop circle.
  const k=1-PLATE_TOUCH.mouseSlop/Math.hypot(200,100);
  assert.equal(starts,1);assert.ok(Math.abs(camera.yaw-(.12+200*k*ORBIT_YAW_PER_WIDTH/f.viewport.clientWidth))<1e-12);assert.ok(Math.abs(camera.pitch-(.36+100*k*1.4/600))<1e-12);
  assert.equal(f.viewport.dataset.viewportGesture,'rotate');assert.deepEqual(f.controller.getState(),{scale:1,x:0,y:0});
  f.event(f.viewport,'pointerup',{pointerId:1});assert.deepEqual(ends,[{settle:true}]);assert.equal(f.viewport.dataset.viewportGesture,'none');
  // Yaw is a full turn that wraps; pitch stays clamped above and below the body.
  const bounded=orbitPlateCamera(camera,{x:10000,y:-10000},{width:320,height:266});assert.ok(bounded.yaw>=-Math.PI&&bounded.yaw<=Math.PI);assert.equal(bounded.pitch,.85);
  const turn=orbitPlateCamera({yaw:0,pitch:.3},{x:320*2*Math.PI/ORBIT_YAW_PER_WIDTH,y:0},{width:320,height:266});assert.ok(Math.abs(turn.yaw)<1e-9,'one full drag turn returns to the start');
  assert.equal(orbitPlateCamera(bounded,{x:-10000,y:10000},{width:320,height:266}).pitch,-.12);f.controller.destroy();
});

test('there is no pan: Shift drag turns, other mouse buttons and a turn-less field plate leave the zoomed view where it is',()=>{
  let starts=0,moves=0;const f=zoomFixture({onOrbitStart:()=>starts++,onOrbit:()=>moves++});f.controller.setOrbitEnabled(true);
  f.event(f.viewport,'wheel',{deltaY:-240,deltaMode:0,clientX:100,clientY:100});const zoomed=f.controller.getState();assert.ok(zoomed.scale>1);
  for(const [i,props] of [{button:1},{button:2}].entries()){
    f.event(f.viewport,'pointerdown',{pointerType:'mouse',pointerId:i+1,clientX:400,clientY:300,...props});
    f.event(f.viewport,'pointermove',{pointerId:i+1,clientX:380,clientY:280});f.event(f.viewport,'pointerup',{pointerId:i+1});
    assert.deepEqual(f.controller.getState(),zoomed);
  }
  assert.equal(starts,0);assert.equal(moves,0);
  f.event(f.viewport,'pointerdown',{pointerType:'mouse',button:0,shiftKey:true,pointerId:5,clientX:400,clientY:300});
  f.event(f.viewport,'pointermove',{pointerId:5,shiftKey:true,clientX:380,clientY:280});f.event(f.viewport,'pointerup',{pointerId:5});
  assert.equal(starts,1);assert.ok(moves>0);assert.deepEqual(f.controller.getState(),zoomed);
  f.controller.setOrbitEnabled(false);assert.equal(f.controller.getMode(),'none');
  f.event(f.viewport,'pointerdown',{pointerType:'touch',pointerId:7,clientX:400,clientY:300});
  f.event(f.viewport,'pointermove',{pointerId:7,clientX:360,clientY:260});f.event(f.viewport,'pointerup',{pointerId:7});
  assert.equal(starts,1);assert.deepEqual(f.controller.getState(),zoomed);f.controller.destroy();
});

test('orbit to two-finger pinch keeps refinement held until the whole gesture ends and never resumes rotation midgesture',async()=>{
  const {SketchScheduler,orbitPlateCamera}=await import('./mushrooms.mjs'),clock=sketchClock(),paint=[],preview=[];
  let camera={yaw:0,pitch:.3},rotations=0;const q=new SketchScheduler({...clock,preview:v=>preview.push(v),refine:v=>paint.push(v)});
  const f=zoomFixture({onOrbitStart:()=>{q.hold();q.input({...camera});},onOrbit:(delta,size)=>{camera=orbitPlateCamera(camera,delta,size);rotations++;q.input({...camera});},onOrbitEnd:({settle})=>settle?q.release():q.cancel()});
  const flush=()=>{for(let i=0;i<4;i++){clock.runFrames();clock.runTimers();}};f.controller.setOrbitEnabled(true);
  f.event(f.viewport,'pointerdown',{pointerType:'touch',pointerId:1,clientX:280,clientY:280});
  f.event(f.viewport,'pointermove',{pointerId:1,clientX:300,clientY:260});flush();assert.equal(paint.length,0);const heldCamera={...camera};
  f.event(f.viewport,'pointerdown',{pointerType:'touch',pointerId:2,clientX:500,clientY:260});
  f.event(f.viewport,'pointermove',{pointerId:2,clientX:600,clientY:300});assert.equal(f.viewport.dataset.viewportGesture,'pinch');assert.ok(f.controller.getState().scale>1);
  f.event(f.viewport,'pointerup',{pointerId:2});assert.equal(q.held,true);assert.equal(f.controller.isOrbitHolding(),true);flush();assert.equal(paint.length,0);
  f.event(f.viewport,'pointermove',{pointerId:1,clientX:270,clientY:240});assert.deepEqual(camera,heldCamera);assert.equal(rotations,1);assert.equal(f.viewport.dataset.viewportGesture,'still');
  f.event(f.viewport,'pointerup',{pointerId:1});assert.equal(q.held,false);flush();assert.deepEqual(paint,[heldCamera]);assert.deepEqual(preview.at(-1),heldCamera);f.controller.destroy();
});

test('pointer cancellation, capture loss and recipe invalidation release orbit exactly once without stale painting',async()=>{
  const {SketchScheduler}=await import('./mushrooms.mjs');
  for(const end of ['pointercancel','lostpointercapture']){
    let stops=0;const f=zoomFixture({onOrbitEnd:()=>stops++});f.controller.setOrbitEnabled(true);
    f.event(f.viewport,'pointerdown',{pointerType:'touch',pointerId:1,clientX:200,clientY:200});
    f.event(f.viewport,'pointermove',{pointerId:1,clientX:220,clientY:200});
    f.event(f.viewport,end,{pointerId:1});f.event(f.viewport,'pointerup',{pointerId:1});
    assert.equal(stops,1);assert.equal(f.controller.isOrbitHolding(),false);assert.equal(f.viewport.captured.size,0);f.controller.destroy();
  }
  const clock=sketchClock(),paint=[];let deltaCount=0;const q=new SketchScheduler({...clock,preview:()=>{},refine:v=>paint.push(v)});
  const f=zoomFixture({onOrbitStart:()=>{q.hold();q.input({recipe:'old'});},onOrbit:()=>deltaCount++,onOrbitEnd:({settle})=>settle?q.release():q.cancel()});f.controller.setOrbitEnabled(true);
  f.event(f.viewport,'pointerdown',{pointerType:'mouse',button:0,pointerId:1,clientX:200,clientY:200});f.event(f.viewport,'pointermove',{pointerId:1,clientX:210,clientY:200});const stalePreview=[...clock.frames.values()][0];
  f.controller.cancelGesture({settle:false});q.input({recipe:'new'});stalePreview();
  f.event(f.viewport,'pointermove',{pointerId:1,clientX:240,clientY:220});f.event(f.viewport,'pointerup',{pointerId:1});
  for(let i=0;i<4;i++){clock.runFrames();clock.runTimers();}
  assert.equal(deltaCount,1);assert.equal(q.held,false);assert.deepEqual(paint,[{recipe:'new'}]);f.controller.destroy();
});


test('custom ink contact is deterministic and protects anatomical junction strokes',async()=>{
  const {inkContactProfile,inkToothContact}=await import('./mushrooms.mjs');
  let dryPhases=0;
  for(let phase=0;phase<60;phase++){
    const mark={role:'cap-contour',phase,width:1,points:[[0,0],[100,0]]},before=structuredClone(mark);
    const run=()=>Array.from({length:501},(_,i)=>inkContactProfile(mark,i/500,i*.2,100));
    const profiles=run();assert.deepEqual(profiles,run());assert.deepEqual(mark,before);
    assert.equal(profiles[0].dry,1);assert.equal(profiles.at(-1).dry,1);
    const n=profiles.filter(p=>p.dry<.95).length;dryPhases+=n>0;assert.ok(n/profiles.length<.07);
    assert.ok(profiles.every(p=>Number.isFinite(p.pressure)&&p.pressure>0));
    for(const role of ['stem-contour','branch','folds','gills','ring'])for(const t of [.05,.25,.5,.75,.95]){
      assert.equal(inkContactProfile({...mark,role},t,t*100,100).dry,1);
    }
  }
  assert.ok(dryPhases>0&&dryPhases<30,'short dry contacts remain selective');
  assert.ok(inkToothContact(.8)>inkToothContact(.2),'the custom nib contacts paper peaks more strongly');
  assert.ok(inkToothContact(0)>=.6&&inkToothContact(1)<=1,'paper tooth does not erase structural ink');
});

test('hand pen lines: gestures, tapers, flicks and restatement, seeded from the mark alone',async()=>{
  const {handInkStrokes,handStrokeOutlines,handLineKind,HAND_LINE}=await import('./mushrooms.mjs');
  const arc=(n,r,cx=400,cy=400)=>Array.from({length:n},(_,i)=>[cx+Math.cos(Math.PI*(1+i/(n-1)))*r,cy+Math.sin(Math.PI*(1+i/(n-1)))*r*.6]);
  assert.equal(handLineKind('cap-contour'),'contour');assert.equal(handLineKind('ground-hatch'),'hatch');assert.equal(handLineKind('pits'),'texture');
  let restated=0,blobs=0,hooks=0;
  for(let phase=0;phase<24;phase++){
    const mark={role:'cap-contour',phase,width:1.4,opacity:.7,points:arc(90,120)},before=structuredClone(mark);
    const a=handInkStrokes(mark),b=handInkStrokes(structuredClone(mark));
    assert.deepEqual(a,b,'deterministic for equal marks');assert.deepEqual(mark,before,'the mark is not mutated');
    const main=a.filter(s=>!s.restate);
    assert.ok(main.length>=3,'a long outline is laid in several gestures');
    for(const s of a){
      assert.ok(s.half.every(h=>Number.isFinite(h)&&h>=0&&h<4),'nib half-widths stay finite and bounded');
      const peak=Math.max(...s.half);assert.ok(s.half[0]<peak*.8&&s.half.at(-1)<peak*.6,'entry and exit taper');
      assert.ok(s.points.every(p=>{const r=Math.hypot(p[0]-400,(p[1]-400)/.6);return r>108&&r<134;}),'wander stays near the line');
      blobs+=s.blobs.length;
    }
    restated+=a.some(s=>s.restate);
    const outlines=handStrokeOutlines(a);assert.ok(outlines.length>=main.length);
    for(const poly of outlines){let area=0;for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];area+=p[0]*q[1]-q[0]*p[1];}assert.ok(area>=0,'every outline winds the same way');}
    assert.ok(handStrokeOutlines(a,40).length<outlines.length,'a partly drawn mark shows only its first strokes');
    const flick=handInkStrokes({role:'form-shadow',phase,width:.6,opacity:.4,points:[[10,10],[30,14]]});
    assert.equal(flick.length,1);const h=flick[0].half;assert.ok(h.at(-1)<h[1]*.5,'a hatch flick releases to a hairline');
    hooks+=flick[0].hook?1:0;
  }
  assert.ok(restated>2&&restated<20,'some outlines are restated, not all');
  assert.ok(blobs>0,'the nib sometimes rests');
  assert.ok(hooks>4&&hooks<24,'some flicks end in a hook');
  assert.ok(HAND_LINE.gesture[0]>20,'gestures are long enough to read as continuous lines');
});


// Field background contact, hierarchy and native-passage regression checks.
{

const scenes=['leaf-litter','moss-bank','fallen-log','woodland'];
const genome=(seed=1)=>({seed:String(seed),family:'amanita',phenotype:{grammar:'amanita'},values:Array.from({length:36},(_,i)=>(Math.sin((i+1)*12.978+seed*31.417)*43758.5453)%1*.5+.5)});
const masks=[[[454,490],[491,490],[484,811],[462,813]],[[735,420],[784,420],[775,825],[747,825]]];

test('background construction is deterministic, bounded and specimen masked',()=>{
  const before=JSON.stringify(masks);
  for(const scene of scenes){
    const a=buildBackgroundStudy(genome(),scene,masks),b=buildBackgroundStudy(genome(),scene,masks);
    assert.deepEqual(a,b);assert.ok(a.ink.length<=400,`${scene}: ${a.ink.length} ink marks`);assert.ok(a.washes.length<=12);
    for(const mark of a.ink){assert.ok(mark.role.startsWith('background'));assert.ok(masks.every(mask=>mark.exclude.includes(mask)));}
    for(const mark of a.washes){assert.ok(masks.every(mask=>mark.reserves.includes(mask)));assert.ok(mark.load<=.1);}
    for(const mark of [...a.ink,...a.washes])for(const [x,y] of mark.points){assert.ok(Number.isFinite(x)&&Number.isFinite(y));assert.ok(x>=0&&x<=1200&&y>=0&&y<890,`${scene}: ${x},${y}`);}
  }
  assert.equal(JSON.stringify(masks),before);
  assert.deepEqual(buildBackgroundStudy(genome(),'plain',masks),{ink:[],washes:[],scene:'plain'});
});
test('background support follows specimen feet without moving foreground masks',()=>{
  const lower=masks.map(shape=>shape.map(([x,y])=>[x,y-130]));
  for(const scene of scenes){
    const a=buildBackgroundStudy(genome(),scene,masks),b=buildBackgroundStudy(genome(),scene,lower);
    assert.ok(Math.abs(a.ground.y-b.ground.y-130)<1e-8);
    a.ink.forEach((mark,i)=>mark.points.forEach((p,j)=>assert.ok(Math.abs(p[1]-b.ink[i].points[j][1]-130)<1e-7)));
    const contact=a.washes.find(m=>m.role==='background-contact-shadow');assert.equal(contact.islands.length,3);
    assert.ok(a.ground.contacts.every(c=>c.y>805&&c.y<831));
    assert.ok(b.washes.every(m=>lower.every(shape=>m.reserves.includes(shape))));
  }
});
const distance=(p,path)=>{let best=Infinity;for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy));}return best;};
test('background leaf veinlets attach to weaker-order parent veins',()=>{
  const bg=buildBackgroundStudy(genome(),'leaf-litter',masks);
  const secondary=bg.ink.filter(m=>m.branchOrder===2),children=bg.ink.filter(m=>m.branchOrder===3);
  assert.ok(secondary.length>20&&children.length>10);
  for(const child of children){const parents=secondary.filter(m=>m.clip===child.clip);assert.ok(parents.some(parent=>distance(child.points[0],parent.points)<1e-6&&child.width<parent.width));}
  assert.ok(bg.ink.some(m=>m.exclude.some(p=>!masks.includes(p))),'overlapping litter has depth masks');
});
test('background traits move continuously and material passages stay grouped',()=>{
  const a=genome(2),b=genome(3),blend=t=>({...a,values:a.values.map((v,i)=>v+(b.values[i]-v)*t)});
  for(const scene of scenes){
    const p=buildBackgroundStudy(blend(.5),scene,masks),q=buildBackgroundStudy(blend(.50001),scene,masks);
    for(const key of ['ink','washes']){assert.equal(p[key].length,q[key].length);p[key].forEach((m,i)=>{assert.equal(m.points.length,q[key][i].points.length);m.points.forEach((a,j)=>assert.ok(Math.hypot(a[0]-q[key][i].points[j][0],a[1]-q[key][i].points[j][1])<.1));});}
    assert.ok(p.washes.every(m=>m.islands?.length));
    assert.ok(p.washes.some(m=>m.role==='background-ground-wash'));
  }
});


}

test('ink-only 3D preview preserves every visible line while skipping unpainted mask and lighting work',async()=>{
 const m=await import('./mushrooms.mjs'),a=generateSpecimen('fast-a','oyster-1'),b=generateSpecimen('fast-b','chanterelle-4');
 for(const view of [{yaw:.12,pitch:.36},{yaw:-.9,pitch:.85},{yaw:.9,pitch:-.12}]){
  const pair=m.createMorphPair(a,b,{view});for(const t of [0,.5,1]){
   const full=m.buildMorphSketch(pair,t),preview=m.buildMorphSketch(pair,t,{inkOnly:true});
   assert.deepEqual(preview.ink,full.ink);assert.deepEqual(preview.dimensions,full.dimensions);assert.deepEqual(preview.bodies,[]);assert.deepEqual(preview.surfaceFaces,[]);assert.deepEqual(preview.surfacePassages,[]);
  }
  const pairWithStudies=m.withFieldPlatePair(pair),full=m.buildMorphSketch(pairWithStudies,.5),preview=m.buildMorphSketch(pairWithStudies,.5,{inkOnly:true});
  assert.deepEqual(preview.ink,full.ink);assert.deepEqual(preview.bodies.filter(b=>b.fieldPlateId),full.bodies.filter(b=>b.fieldPlateId));
 }
});

test('field-study composition gives the whole specimen priority without overlapping supporting figures',async()=>{
 const m=await import('./mushrooms.mjs');
 for(const type of ['amanita-1','oyster-1','coral-3']){
  const a=generateSpecimen('plate-layout',type),b=generateSpecimen('plate-layout-b',type),pair=m.withFieldPlatePair(m.createMorphPair(a,b)),r=pair.fieldPlate;
  const small=[r.cutBox,r.detailBox,...(r.showDeposit?[r.depositBox]:[])];
  const separate=(a,b)=>a.x+a.w+24<=b.x||b.x+b.w+24<=a.x||a.y+a.h+24<=b.y||b.y+b.h+24<=a.y;
  for(const b of small)assert.ok(separate(r.adultBox,b));
  for(let i=0;i<small.length;i++)for(let j=i+1;j<small.length;j++)assert.ok(separate(small[i],small[j]));
  assert.ok(Math.abs(r.adultBox.w/r.adultBox.h-r.sourceBox.w/r.sourceBox.h)<1e-9,'collapse unused main-block space');
  for(const t of [0,.5,1]){
   const plan=m.buildMorphSketch(pair,t);
   for(const mark of plan.ink.filter(mark=>!mark.fieldPlateId))for(const [x,y] of mark.points){assert.ok(x>=r.adultBox.x-1&&x<=r.adultBox.x+r.adultBox.w+1);assert.ok(y>=r.adultBox.y-1&&y<=r.adultBox.y+r.adultBox.h+1);}
   assert.equal(plan.annotations.find(a=>a.fieldPlateId==='adjunct:habit-label').text,'1. Habit study');
  }
 }
});

test('native cap shadow contact responds to surface lighting without changing anatomy',async()=>{
  const {nativeBrushPath,nativeBrushGestures}=await import('./mushrooms.mjs');
  const study=buildStudy(generateSpecimen('native-proof-20261019','amanita-1'));
  const mark=study.washes.find(m=>m.role==='cap-turn'&&m.surface?.lighting),before=structuredClone(mark);
  const lit={...mark,surface:{...mark.surface,lighting:mark.surface.lighting.map(row=>row.map(()=>1))}};
  const dim={...mark,surface:{...mark.surface,lighting:mark.surface.lighting.map(row=>row.map(()=>0))}};
  const a=nativeBrushPath(lit),b=nativeBrushPath(dim),actual=nativeBrushPath(mark);
  assert.equal(actual.length,mark.surface.rails.length);assert.deepEqual(actual,nativeBrushPath(mark));assert.deepEqual(mark,before);
  assert.ok(actual.every(p=>[p.x,p.y,p.r,p.p].every(Number.isFinite)&&p.r>0&&p.p>0));
  assert.ok(b.every((p,i)=>p.p>a[i].p&&p.r>=a[i].r));
  const gestures=nativeBrushGestures(mark);assert.equal(gestures[0].prewet,true);assert.equal(gestures[0].load,0);assert.ok(gestures[1].load>0&&gestures[1].depositDepth>.4);
});


test('dense connected background masks retain every intersecting polygon and use actual basal support',async()=>{
 const m=await import('./mushrooms.mjs'),a=generateSpecimen('dense-background','oyster-1'),b=generateSpecimen('dense-background-b','chanterelle-4');
 const pair=m.createMorphPair(a,b,{view:{yaw:.9,pitch:.85}}),plan=m.buildMorphSketch(pair,.5),masks=plan.bodies.flatMap(body=>body.islands??[body.shape]);
 const bg=buildBackgroundStudy(a,'woodland',masks,{supportShapes:plan.supportShapes});
 const foot=Math.max(...plan.supportShapes.flat().map(p=>p[1]));assert.equal(bg.ground.y,Math.max(640,Math.min(842,foot+4)));
 const box=p=>p.reduce((b,[x,y])=>({x:Math.min(b.x,x),y:Math.min(b.y,y),right:Math.max(b.right,x),bottom:Math.max(b.bottom,y)}),{x:Infinity,y:Infinity,right:-Infinity,bottom:-Infinity});
 const intersects=(a,b,p)=>a.x<=b.right+p&&a.right>=b.x-p&&a.y<=b.bottom+p&&a.bottom>=b.y-p,boxes=masks.map(box);
 for(const mark of bg.ink){const bounds=box(mark.points),kept=new Set(mark.exclude);boxes.forEach((b,i)=>{if(intersects(b,bounds,Math.max(8,mark.width*8)))assert.ok(kept.has(masks[i]));});}
 for(const mark of bg.washes){const regions=(mark.islands??[mark.shape]).map(box),kept=new Set(mark.reserves);boxes.forEach((b,i)=>{if(regions.some(r=>intersects(b,r,2)))assert.ok(kept.has(masks[i]));});}
 assert.ok(bg.ink.reduce((sum,mark)=>sum+mark.exclude.length,0)<bg.ink.length*masks.length*.1);
});

// In the existing test 'native cap shadow contact responds to surface lighting
// without changing anatomy', replace the obsolete single-load assertion with:
// const gestures=nativeBrushGestures(mark);
// assert.equal(gestures[0].prewet,true);assert.equal(gestures[0].load,0);
// assert.ok(gestures[1].load>0&&gestures[1].depositDepth>.4);

test('native form shadows prewet a wider footprint before charging real pigment',async()=>{
  const {nativeBrushGestures,nativeWashPasses,simulateNativePassages}=await import('./mushrooms.mjs');
  const shape=[[300,180],[850,180],[850,820],[300,820]];
  const mark={role:'stem-shadow',shape,points:[[650,200],[650,800]],width:160,palette:{umber:1},load:.12,wetness:.6,granulation:.5,pooling:.4,softness:.7,variation:.3,
    surface:{kind:'stem',rails:Array.from({length:17},(_,i)=>[[500,220+i*35],[750,220+i*35]])}};
  const before=structuredClone(mark),gestures=nativeBrushGestures(mark);
  assert.deepEqual(mark,before);assert.equal(gestures.length,2);
  assert.equal(gestures[0].prewet,true);assert.equal(gestures[0].load,0);assert.ok(gestures[1].load>0);
  assert.ok(gestures[0].path.every((p,i)=>p.r>gestures[1].path[i].r));
  assert.ok(gestures.every(g=>g.depositDepth>.4),'loaded water stands above pore capacity');
  let final;const result=await simulateNativePassages({washes:[mark]},{width:48,seed:42,yieldWork:async()=>{},onCheckpoint:async q=>{if(q.complete)final=q.sheet;}});
  // Both gestures are wider than a brush, so each goes on as passes: clear water first, then pigment.
  const passes=nativeWashPasses(gestures,mark),wet=passes.filter(g=>g.prewet).length;
  assert.ok(wet>1&&passes.length>wet);assert.ok(passes.slice(0,wet).every(g=>g.prewet&&g.load===0));
  assert.equal(result.clearWaterStrokes,wet);assert.equal(result.strokes,passes.length);assert.equal(result.brushDips,passes.length);
  assert.equal(result.water,0);assert.equal(result.fixedLayers,1);assert.ok(final.layers[0][0].some(x=>x>0));
});

test('interactive 3D depth raster occludes rear tissue and keeps foreground contours',async()=>{
 const m=await import('./mushrooms.mjs');
 const visibility=m.connectedPreviewVisibility([{faces:[{visible:true,projected:[[20,20,0],[120,20,0],[120,120,0],[20,120,0]]}]}]);
 assert.equal(visibility.visible([60,60,-1]),true);
 assert.equal(visibility.visible([60,60,30]),false);
 assert.equal(visibility.visible([160,60,30]),true);
 assert.ok(visibility.cells<=48000);
 assert.deepEqual(visibility.fragments([[40,60,30],[100,60,30]]),[]);
 assert.equal(visibility.fragments([[40,60,-1],[100,60,-1]]).length,1);
});

test('coarse interactive chart preserves intrinsic anatomy and complete silhouette coverage',async()=>{
 const m=await import('./mushrooms.mjs'),a=generateSpecimen('first','oyster-1'),b=generateSpecimen('second','chanterelle-4');
 const pair=m.createMorphPair(a,b,{composition:m.createSpecimenComposition(a,{count:5})});
 for(const view of [{yaw:.12,pitch:.85},{yaw:-.9,pitch:.36},{yaw:.9,pitch:-.12}])for(const t of [0,.5,1]){
  pair.view=view;const exact=m.buildConnectedAnatomySurface(pair,t,{inkOnly:true}),coarse=m.buildConnectedAnatomySurface(pair,t,{inkOnly:true,interactive:true});
  assert.deepEqual(coarse.dimensions,exact.dimensions);
  for(let i=0;i<5;i++){
   assert.ok(coarse.members[i].vertices.length<exact.members[i].vertices.length*.4);
   assert.deepEqual(coarse.members[i].paths.find(p=>p.id.endsWith(':rim')),exact.members[i].paths.find(p=>p.id.endsWith(':rim')));
  }
  const full=m.buildMorphSketch(pair,t,{inkOnly:true}),preview=m.buildMorphSketch(pair,t,{inkOnly:true,interactive:true});
  // Members of a shared-base colony overlap heavily, and the coarse depth
  // raster may hide part of a member that is itself mostly occluded. The
  // colony's whole contour must survive, and every substantial member keeps
  // most of its own.
  const length=(plan,i)=>plan.ink.filter(p=>p.individual===i&&p.id.includes(':silhouette:')).reduce((n,p)=>n+p.points.slice(1).reduce((length,q,k)=>length+Math.hypot(q[0]-p.points[k][0],q[1]-p.points[k][1]),0),0);
  let fullSum=0,previewSum=0;
  for(let i=0;i<5;i++){const f=length(full,i),q=length(preview,i);fullSum+=f;previewSum+=q;if(f>300)assert.ok(q>f*.45,`lost contour at ${t}/${i}`);}
  assert.ok(previewSum>fullSum*.65,`lost colony contour at ${t}`);
  assert.ok(preview.ink.every(p=>p.points.every(q=>q.every(Number.isFinite))));
 }
 const studies=m.withFieldPlatePair(pair),full=m.buildMorphSketch(studies,.5,{inkOnly:true}),preview=m.buildMorphSketch(studies,.5,{inkOnly:true,interactive:true});
 assert.deepEqual(preview.ink.filter(p=>p.fieldPlateId),full.ink.filter(p=>p.fieldPlateId));
});


test('each colony member keeps its own background contact as its basal ring moves',async()=>{
 const m=await import('./mushrooms.mjs'),a=generateSpecimen('colony-contact','oyster-1'),b=generateSpecimen('colony-contact-b','chanterelle-1');
 const pair=m.createMorphPair(a,b,{composition:m.createSpecimenComposition(a,{count:5}),view:{yaw:.8,pitch:.85}});
 for(const t of [0,.5,1]){
  const plan=m.buildMorphSketch(pair,t),masks=plan.bodies.flatMap(body=>body.islands??[body.shape]),feet=plan.supportShapes,bg=buildBackgroundStudy(a,'woodland',masks,{supportShapes:feet});
  assert.equal(bg.ground.contacts.length,feet.length);assert.equal(bg.washes.find(w=>w.role==='background-contact-shadow').islands.length,feet.length);
  for(const [i,ring] of feet.entries()){
   const c=bg.ground.contacts[i],bottom=Math.max(...ring.map(p=>p[1]));assert.ok(c.x>=Math.min(...ring.map(p=>p[0]))&&c.x<=Math.max(...ring.map(p=>p[0])));assert.ok(c.y>=bottom-9&&c.y<=bottom+3.000001);
  }
  const moved=feet.map(ring=>ring.map(([x,y])=>[x+.0001,y-.0002])),next=buildBackgroundStudy(a,'woodland',masks,{supportShapes:moved});
  bg.ground.contacts.forEach((c,i)=>{assert.ok(Math.abs(next.ground.contacts[i].x-c.x-.0001)<1e-8);assert.ok(Math.abs(next.ground.contacts[i].y-c.y+.0002)<1e-8);});
 }
});

test('promoting a completed 3D field morph carries the exact page transform into repaint',async()=>{
  const {createMorphPair,createPromotedMorphPair,withFieldPlatePair,createSpecimenComposition,buildMorphStudy,buildMorphSketch}=await import('./mushrooms.mjs');
  const a=generateSpecimen('repaint-source','oyster-1'),b=generateSpecimen('repaint-target','chanterelle-4'),next=generateSpecimen('after-morph','parasol-5');
  const composition=createSpecimenComposition({...a,seed:'repaint-layout'},{count:1});
  const pair=withFieldPlatePair(createMorphPair(a,b,{composition,view:{yaw:.67,pitch:.72},shapeModifiers:{capDepth:1.31,stemBend:-37}}),true);
  const final=buildMorphStudy(pair,1),promoted=createPromotedMorphPair(pair,next),repaint=buildMorphStudy(promoted,0);
  assert.notEqual(promoted.composition.plate.pairKey,pair.composition.plate.pairKey);
  assert.deepEqual(promoted.composition.plate.transitionFrom,pair.composition.plate,'carry exact source fit into a new pair-scoped descriptor');
  assert.deepEqual(promoted.view,pair.view);assert.deepEqual(promoted.shapeModifiers,pair.shapeModifiers);
  assert.deepEqual(repaint.fieldPlateTransform,final.fieldPlateTransform);
  assert.deepEqual(repaint.ink,final.ink);
  const activeWashes=plan=>plan.washes.map(mark=>({...mark,palette:Object.fromEntries(Object.entries(mark.palette).filter(([,weight])=>weight>0))}));
  assert.deepEqual(activeWashes(repaint),activeWashes(final),'same paths, masks, contact widths and active pigment loads');
  assert.deepEqual(buildMorphSketch(promoted,0,{inkOnly:true,interactive:true}).ink.filter(m=>m.fieldPlateId),buildMorphSketch(pair,1,{inkOnly:true,interactive:true}).ink.filter(m=>m.fieldPlateId),'comparison studies stay exact while the hero uses a bounded field contour');
  // Exercise the same structured-clone reconstruction used by the native Worker.
  const wire=structuredClone({a:promoted.a,b:promoted.b,composition:promoted.composition,view:promoted.view,shapeModifiers:promoted.shapeModifiers});
  const rebuilt=withFieldPlatePair(createMorphPair(wire.a,wire.b,wire),true,{composition:wire.composition});
  assert.deepEqual(buildMorphStudy(rebuilt,0),repaint);
});

test('native preview cache matches uncached pixels through rewetting and fixed-layer changes',async()=>{
  const {nativePreviewSheet,nativePreviewLayers}=await import('./mushrooms.mjs');
  const {layersOf}=await import('../lab/media/sheet.js');
  const {renderLayers,renderLayersCached}=await import('../lab/media/km.js');
  const {BY_KEY}=await import('../lab/media/pigments.js');
  const w=17,h=13,n=w*h,K=3,planes=salt=>Array.from({length:K},(_,k)=>Float32Array.from({length:n},(_,i)=>((i*7+k*13+salt)%31)/300));
  const sheet={w,h,n,K,G:planes(1),D:planes(2),P:planes(3),layers:[]},pigments=[BY_KEY.ochre,BY_KEY.umber,BY_KEY.alizarin],cache={};
  let wet;
  const verify=()=>{
    const before=[...sheet.G,...sheet.D,...sheet.P,...sheet.layers.flat()].map(p=>p.slice());
    const expected=nativePreviewLayers(layersOf(sheet),w,h,4),actual=nativePreviewSheet(sheet,4,cache);
    assert.equal(actual.n,expected.n);
    for(let l=0;l<expected.layers.length;l++)for(let k=0;k<K;k++)assert.deepEqual(actual.layers[l][k],expected.layers[l][k]);
    const white=new Uint8ClampedArray(actual.n*3).fill(255);
    assert.deepEqual(renderLayersCached(actual.layers,pigments,white,actual.n),renderLayers(expected.layers,pigments,white,expected.n));
    assert.deepEqual([...sheet.G,...sheet.D,...sheet.P,...sheet.layers.flat()],before,'preview must not mutate pigment state');
    if(wet)assert.equal(actual.layers.at(-1),wet,'reuse current mass sample buffers');
    wet=actual.layers.at(-1);
  };
  verify();
  sheet.layers.push(planes(4));verify();
  sheet.layers[0][1][113]+=.2;sheet.G[0][110]+=.3;verify();
  sheet.layers.push(planes(5));verify();
  sheet.layers[1][2][117]+=.4;verify();
  sheet.layers[0][0][111]+=.3;sheet.layers[0]._cacheVersion=1;verify();
  sheet.layers.push(planes(6));verify();
});

test('all-form fields keep 120 endpoint families finite and nonempty through 840 sampled frames',async()=>{
 const m=await import('./mushrooms.mjs');
 for(let i=0;i<MUSHROOM_TYPES.length;i++){
  const a=generateSpecimen('held-out-'+i,MUSHROOM_TYPES[i].id),b=generateSpecimen('destination-'+i,MUSHROOM_TYPES[(i*37+17)%120].id),pair=m.createMorphPair(a,b,{composition:m.createSpecimenComposition(a,{count:2})});
  assert.equal(pair.supportedMotion,true);assert.deepEqual(m.morphGenome(pair,0),a);assert.deepEqual(m.morphGenome(pair,1),b);
  for(const t of [0,.001,.25,.5,.75,.999,1]){const plan=m.buildMorphSketch(pair,t);assert.equal(plan.bodies.length,2);assert.ok(plan.ink.length>0);assert.ok(plan.ink.every(mark=>mark.points.every(p=>p.every(Number.isFinite))));for(const d of plan.diagnostics){assert.ok(d.cells<=260000);assert.ok(Math.abs(d.area/d.targetArea-1)<.08,`${a.profileId}→${b.profileId} at ${t}`);}}
 }
});

test('same-family destinations morph through every family without disabled pairs',async()=>{
 const m=await import('./mushrooms.mjs'),families=[...new Set(MUSHROOM_TYPES.map(type=>type.family))];
 for(const family of families){
  const kinds=MUSHROOM_TYPES.filter(type=>type.family===family),a=generateSpecimen('kin-a-'+family,kinds[0].id),b=generateSpecimen('kin-b-'+family,kinds.at(-1).id);
  const pair=m.createMorphPair(a,b,{composition:m.createSpecimenComposition(a,{count:2})});
  assert.equal(pair.supportedMotion,true,family);assert.deepEqual(m.morphGenome(pair,1),b);
  for(const t of [0,.5,1]){const plan=m.buildMorphSketch(pair,t);assert.ok(plan.bodies.length>=2,family);assert.ok(plan.ink.length>0,family);assert.ok(plan.ink.every(mark=>mark.points.every(p=>p.every(Number.isFinite))),family);}
 }
});

test('fictional fields reproduce deterministically and promote the same native coordinates',async()=>{
 const m=await import('./mushrooms.mjs');
 for(const [from,to,next] of [['amanita-1','morel-3','puffball-2'],['coral-1','earthstar-3','saddle-1'],['oyster-1','puffball-1','chanterelle-4']]){
  const a=generateSpecimen('first',from),b=generateSpecimen('second',to),c=generateSpecimen('third',next),pair=m.createMorphPair(a,b,{composition:m.createSpecimenComposition(a,{count:2})});
  const mid=m.buildMorphSketch(pair,.5),again=m.buildMorphSketch(m.createMorphPair(a,b,{composition:m.createSpecimenComposition(a,{count:2})}),.5);
  assert.deepEqual(mid.ink,again.ink);assert.deepEqual(mid.bodies,again.bodies);
  const end=m.buildMorphSketch(pair,1),following=m.createMorphPair(b,c,{composition:pair.composition}),begin=m.buildMorphSketch(following,0);
  assert.deepEqual(begin.ink.map(p=>p.points),end.ink.map(p=>p.points));assert.deepEqual(begin.bodies.map(p=>p.islands),end.bodies.map(p=>p.islands));
  const paintedEnd=m.buildMorphStudy(pair,1),paintedStart=m.buildMorphStudy(following,0);
  assert.deepEqual(paintedEnd.ink.map(p=>p.points),paintedStart.ink.map(p=>p.points));assert.deepEqual(paintedEnd.washes.map(p=>p.shape),paintedStart.washes.map(p=>p.shape));
  const settled=m.buildMorphStudy(pair,.5);assert.deepEqual(settled.ink.map(p=>p.points),mid.ink.map(p=>p.points));assert.deepEqual(settled.washes.map(p=>p.islands),mid.bodies.map(p=>p.islands));
 }
});

test('body distance values and ink tracks approach endpoints continuously without zero-length placeholders',async()=>{
 const m=await import('./mushrooms.mjs'),pair=m.createMorphPair(generateSpecimen('strain-a','earthstar-1'),generateSpecimen('strain-b','saddle-3'));
 const data=m.prepareImplicitPair(pair),snapshot=t=>{const plan=m.sampleImplicitMorph(data,t);return {plan,fields:data.members.map(member=>Array.from(member.body))};};
 const left=snapshot(.5),right=snapshot(.500001);
 for(let i=0;i<data.members.length;i++){const member=data.members[i],speed=Math.max(...member.a.body.map((v,k)=>Math.abs(v-member.b.body[k])));for(let j=0;j<member.grid.cells;j++)assert.ok(Math.abs(left.fields[i][j]-right.fields[i][j])<speed*.000001+.00005);for(const track of member.tracks){assert.ok(track.pointsA.length>=2&&track.pointsB.length===track.pointsA.length);assert.ok(track.budgetA>0&&track.budgetB>0);}}
 assert.equal(left.plan.ink.length,right.plan.ink.length);for(let i=0;i<left.plan.ink.length;i++)for(let j=0;j<left.plan.ink[i].points.length;j++)assert.ok(Math.hypot(...left.plan.ink[i].points[j].map((v,k)=>v-right.plan.ink[i].points[j][k]))<.01);
 assert.throws(()=>m.sampleImplicitMorph(data,NaN),RangeError);
});

test('merged ink tracks preserve each endpoint opacity budget rather than darkening N-fold',async()=>{
 const m=await import('./mushrooms.mjs'),pair=m.createImplicitMorph(generateSpecimen('a','earthstar-1'),generateSpecimen('b','saddle-3'));
 for(const member of pair.members)for(const side of ['a','b']){const groups=new Map();for(const track of member.tracks){const id=side==='a'?track.sourceId:track.targetId;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(track);}for(const tracks of groups.values()){const key=side==='a'?'budgetA':'budgetB',opacity=tracks[0][side].opacity??.6;const alpha=1-tracks.reduce((product,t)=>product*Math.pow(1-opacity,t[key]),1);assert.ok(Math.abs(alpha-opacity)<1e-12);}}
});

test('shape preparation coalesces inputs, terminates obsolete work, and rejects stale completions',async()=>{
 const {MorphPreparation}=await import('./mushrooms.mjs'),workers=[],seen=[];
 const queue=new MorphPreparation(()=>{const w={postMessage(value){this.value=value;},terminate(){this.terminated=true;}};workers.push(w);return w;});
 const fail=e=>{throw e;};queue.prepare('one',{blend:0},data=>seen.push(['old',data]),fail);queue.prepare('one',{blend:.5},data=>seen.push(['latest',data]),fail);assert.equal(workers.length,1);
 const stale=workers[0].onmessage;queue.prepare('two',{},data=>seen.push(['second',data]),fail);assert.ok(workers[0].terminated);stale({data:{kind:'implicit-ready',data:'obsolete'}});assert.deepEqual(seen,[]);
 workers[1].onmessage({data:{kind:'implicit-ready',data:'ready'}});assert.deepEqual(seen,[['second','ready']]);assert.ok(workers[1].terminated);
 queue.prepare('two',{},data=>seen.push(['cache',data]),fail);assert.equal(workers.length,2);assert.deepEqual(seen.at(-1),['cache','ready']);
 queue.prepare('three',{},data=>seen.push(data),fail);const pending=workers[2].onmessage;queue.cancel();pending({data:{kind:'implicit-ready',data:'cancelled'}});assert.equal(seen.length,2);
});

test('a Worker prepares the rest composition: same bodies as the main thread, keyed by plate',async()=>{
 const m=await import('./mushrooms.mjs'),workers=[],seen=[];
 const queue=new m.MorphPreparation(()=>{const w={postMessage(value){this.value=value;},terminate(){this.terminated=true;}};workers.push(w);return w;},{kind:'orbit-rest-prepare',ready:'orbit-rest-ready'});
 queue.prepare('k',{genome:'g'},data=>seen.push(data),e=>{throw e;});assert.equal(workers[0].value.kind,'orbit-rest-prepare');
 workers[0].onmessage({data:{kind:'implicit-ready',data:'other'}});assert.deepEqual(seen,[]);workers[0].onmessage({data:{kind:'orbit-rest-ready',data:'rest'}});assert.deepEqual(seen,['rest']);
 for(const type of ['amanita-1','oyster-1','bracket-6','tooth-1']){
  const genome=generateSpecimen('woodland-042',type),composition=m.createSpecimenComposition(genome);
  // What the page receives: the Worker's result after two structured clones.
  const local=m.orbitRestComposition(genome,composition),remote=structuredClone(m.orbitRestComposition(structuredClone(genome),structuredClone(composition)));
  assert.deepEqual(remote,local,type);
  const view=m.connectedViewOptions({yaw:.5,pitch:.3}),ink=c=>m.buildMorphSketch(m.createOrbitRestPair(genome,c,view),0,{inkOnly:true,interactive:true}).ink.map(x=>x.points);
  assert.deepEqual(ink(remote),ink(local),type);
  const key=m.orbitRestPreparationKey(genome,composition);assert.equal(key,m.orbitRestPreparationKey(structuredClone(genome),structuredClone(composition)));
  assert.notEqual(key,m.orbitRestPreparationKey(genome,composition,true));assert.notEqual(key,m.orbitRestPreparationKey(genome,{...composition,implicitAnchors:[{x:1,y:2}]}));
  // The frame of the plate the turn starts from, as the page's own pair captures it.
  const next=generateSpecimen('woodland-108','agaric-1'),pair=m.createMorphPair(genome,next,{composition}),recipe=m.bridgeRecipe({morph:pair,blend:0,genome});
  const prepared=structuredClone(m.prepareOrbitRest(structuredClone({genome,composition,frame:{recipe,fieldPlate:false,scene:'plain'}})));
  assert.equal(prepared.restKey,key);assert.deepEqual(prepared.composition,local);assert.deepEqual(prepared.pageFrame,structuredClone(m.pagePairFrame(pair,'plain')),type);
  // An anchored plate's body fits its own frame; the Worker sends that too.
  const anchored=m.implicitAnchoredComposition(genome,composition,{}).composition,own=structuredClone(m.prepareOrbitRest(structuredClone({genome,composition:anchored,scene:'plain'})));
  if(own.composition.ownFrame)assert.deepEqual(own.ownFrame,structuredClone(m.createOrbitRestPair(genome,m.orbitRestComposition(genome,anchored),{},{scene:'plain'}).composition.pageFrame.a),type);
  else assert.equal(own.ownFrame,null);
 }
 {
  // A field pair anchored at rest (as the page does) gives amanita-3 a body framed on its own.
  const genome=generateSpecimen('woodland-042','amanita-3'),pair=m.createMorphPair(genome,generateSpecimen('woodland-108','agaric-1'),{composition:m.createSpecimenComposition(genome),...m.orbitViewOptions({yaw:.12,pitch:.36})});
  const anchored=m.implicitAnchoredComposition(pair.a,pair.composition,{view:pair.view,shapeModifiers:pair.shapeModifiers}).composition,own=structuredClone(m.prepareOrbitRest(structuredClone({genome,composition:anchored,scene:'plain'})));
  assert.equal(own.composition.ownFrame,true);assert.ok(own.ownFrame.scale>0);
  assert.deepEqual(own.ownFrame,structuredClone(m.createOrbitRestPair(genome,m.orbitRestComposition(genome,anchored),{},{scene:'plain'}).composition.pageFrame.a));
 }
});

test('a plate painted ahead is planned in a Worker with the same recipe and identity as on the page',async()=>{
 const m=await import('./mushrooms.mjs');
 const viaWorker=plan=>m.plannedPlateSnapshot(structuredClone(m.plannedPlateData(m.planPreparedPlate(structuredClone(plan)))));
 for(const [type,next] of [['amanita-1','oyster-1'],['oyster-1','chanterelle-1'],['bracket-6','agaric-4'],['tooth-1','morel-1']]){
  const st=parseState(`?type=${type}&seed=plan-a&nextType=${next}&next=plan-b`),local=m.planPreparedPlate({type:'random',state:st}),remote=viaWorker({type:'random',state:st});
  assert.equal(m.nativePlateKey(remote),m.nativePlateKey(local),type);assert.deepEqual(m.bridgeRecipe(remote),m.bridgeRecipe(local));assert.equal(m.plateSheetSeed(remote),m.plateSheetSeed(local));
  // The Morph destination: promotion reads only promotionSource(pair).
  const a=generateSpecimen(st.seed,type),b=generateSpecimen(st.next,next),pair=m.createMorphPair(a,b,{composition:m.createSpecimenComposition(a)}),dest=m.advanceMorphState(st,'plan-c');
  const full=m.planPreparedPlate({type:'destination',state:dest,from:pair,fieldPlate:false}),light=viaWorker({type:'destination',state:dest,from:m.promotionSource(pair),fieldPlate:false});
  assert.equal(m.nativePlateKey(light),m.nativePlateKey(full),`${type} destination`);assert.equal(light.genome.seed,b.seed);
 }
});

test('a touch turns only past its slop, and the turn starts at the slop circle',async()=>{
 const {PLATE_TOUCH}=await import('./mushrooms.mjs');let starts=0;const deltas=[];
 const f=zoomFixture({onOrbitStart:()=>starts++,onOrbit:delta=>deltas.push(delta)});f.controller.setOrbitEnabled(true);
 f.event(f.viewport,'pointerdown',{pointerType:'touch',pointerId:1,clientX:300,clientY:300});
 for(const x of [302,303.5,305.9])f.event(f.viewport,'pointermove',{pointerId:1,clientX:x,clientY:300});
 assert.equal(starts,0);assert.deepEqual(deltas,[]);assert.deepEqual(f.controller.getState(),{scale:1,x:0,y:0});
 f.event(f.viewport,'pointermove',{pointerId:1,clientX:300+PLATE_TOUCH.turnSlop+2,clientY:300});
 assert.equal(starts,1);assert.equal(deltas.length,1);assert.ok(Math.abs(deltas[0].x-2)<1e-9&&deltas[0].y===0,'only the travel past the slop turns');
 f.event(f.viewport,'pointermove',{pointerId:1,clientX:300+PLATE_TOUCH.turnSlop+5,clientY:301});assert.deepEqual(deltas[1],{x:3,y:1});
 f.event(f.viewport,'pointerup',{pointerId:1});
 // Exactly at the slop the first turn is zero: the drag continues from the rest view.
 f.event(f.viewport,'pointerdown',{pointerType:'mouse',button:0,pointerId:2,clientX:100,clientY:100});
 f.event(f.viewport,'pointermove',{pointerId:2,clientX:100,clientY:100+PLATE_TOUCH.mouseSlop});assert.equal(starts,2);assert.deepEqual(deltas.at(-1),{x:0,y:0});
 f.controller.destroy();
});

test('the painting a turn started from fades with the angle turned and holds a release detent',async()=>{
 const {ORBIT_REST_FADE:F,orbitRestOpacity,orbitRestDistance}=await import('./mushrooms.mjs'),rest={yaw:.12,pitch:.36};
 assert.equal(orbitRestOpacity(rest,rest),1);assert.equal(orbitRestOpacity({yaw:.12+F.start*.9,pitch:.36},rest),1,'the first pixels of a drag show the painting unchanged');
 assert.equal(orbitRestOpacity({yaw:.12+F.end,pitch:.36},rest),0);assert.equal(orbitRestOpacity({yaw:.12,pitch:.36-F.end-.01},rest),0);
 let last=1;for(let d=0;d<=F.end+.05;d+=.005){const k=orbitRestOpacity({yaw:.12+d*.8,pitch:.36+d*.6},rest);assert.ok(k<=last+1e-12&&k>=0&&k<=1);assert.ok(last-k<.05,'no step in the fade');last=k;}
 assert.ok(Math.abs(orbitRestDistance({yaw:Math.PI-.01,pitch:0},{yaw:-Math.PI+.01,pitch:0})-.02)<1e-9,'yaw wraps');
 assert.ok(F.start<F.detent&&F.detent<F.end,'a release in the detent still shows most of the painting');
 assert.ok(orbitRestOpacity({yaw:.12+F.detent,pitch:.36},rest)>.5);
 assert.ok(F.step>0&&F.step<.5,'the copy never vanishes in one frame');
});

test('a turned plate\'s bodies can be built one per step, and a built body is not built again',async()=>{
 const m=await import('./mushrooms.mjs');
 for(const type of ['amanita-1','bracket-6']){
  const genome=generateSpecimen('woodland-042',type),rest=m.createOrbitRestPair(genome,m.orbitRestComposition(genome),m.connectedViewOptions({yaw:.4,pitch:.3}));
  m.clearOrbitWorldCache();const reference=m.buildMorphSketch(rest,0,{inkOnly:true,interactive:true});
  assert.equal(m.orbitWorldWarmers(rest,{missing:true}).length,0,'a drawn frame leaves nothing to build');
  m.clearOrbitWorldCache();const steps=m.orbitWorldWarmers(rest,{missing:true});assert.equal(steps.length,rest.composition.members.length);
  steps[0]();assert.equal(m.orbitWorldWarmers(rest,{missing:true}).length,steps.length-1);for(const step of steps.slice(1))step();
  assert.equal(m.orbitWorldWarmers(rest,{missing:true}).length,0);
  // A turned camera reuses the same bodies, and the drawing is the same as building in one frame.
  assert.equal(m.orbitWorldWarmers({...rest,view:{...rest.view,yaw:1.2}},{missing:true}).length,0);
  assert.deepEqual(m.buildMorphSketch({...rest},0,{inkOnly:true,interactive:true}).ink,reference.ink,type);
 }
});

test('carried colony anchors survive URL decoding and destination promotion',async()=>{
 const m=await import('./mushrooms.mjs'),anchors=[{x:123.5,y:790,scale:1,rotation:.1},{x:740,y:780,scale:.8,rotation:-.1}],state=parseState('?type=amanita-1&nextType=morel-1&anchors='+encodeURIComponent(JSON.stringify(anchors)));
 assert.deepEqual(state.compositionAnchors,anchors);assert.deepEqual(m.advanceMorphState(state,'next').compositionAnchors,anchors);
 assert.equal(m.decodeCompositionAnchors('[{"x":"bad"}]'),null);assert.equal(m.decodeCompositionAnchors('not-json'),null);
 const composition=m.applyCompositionAnchors(m.createSpecimenComposition(generateSpecimen('x','amanita-1'),{count:2}),anchors);assert.deepEqual(composition.members.map(({x,y,scale,rotation})=>({x,y,scale,rotation})),anchors);
});

test('general endpoint promotion carries the captured field layout and native placement together',async()=>{
 const m=await import('./mushrooms.mjs'),a=generateSpecimen('layout-a','amanita-1'),b=generateSpecimen('layout-b','morel-3'),c=generateSpecimen('layout-c','coral-1');
 const pair=m.withFieldPlatePair(m.createMorphPair(a,b)),end=m.buildMorphSketch(pair,1),next=m.createPromotedMorphPair(pair,c),begin=m.buildMorphSketch(next,0);
 assert.deepEqual(next.composition.plate.transitionFrom,pair.composition.plate.transitionFrom?{...pair.composition.plate,transitionFrom:null}:pair.composition.plate);assert.deepEqual(next.composition.implicitAnchors,pair.composition.implicitAnchors);
 assert.deepEqual(begin.ink.map(p=>p.points),end.ink.map(p=>p.points));assert.deepEqual(begin.fieldPlateTransform,end.fieldPlateTransform);
 const endPaint=m.buildMorphStudy(pair,1),startPaint=m.buildMorphStudy(next,0);assert.deepEqual(startPaint.washes.map(p=>p.shape),endPaint.washes.map(p=>p.shape));
});


test('general morphs retain source comparison studies across slot changes and structured clone',async()=>{
 const m=await import('./mushrooms.mjs');
 const a=generateSpecimen('compare-a','oyster-1'),b=generateSpecimen('compare-b','chanterelle-4'),c=generateSpecimen('compare-c','parasol-5'),d=generateSpecimen('compare-d','coral-2');
 const p=m.withFieldPlatePair(m.createMorphPair(a,b,{composition:m.createSpecimenComposition(a,{count:1})})),previous=m.buildMorphStudy(p,1),q=m.createPromotedMorphPair(p,c);
 const begin=m.buildMorphStudy(q,0),adj=plan=>plan.ink.filter(mark=>mark.fieldPlateId),paths=plan=>plan.washes.filter(mark=>mark.fieldPlateId).map(({shape,points,reserves,islands,width,palette})=>({shape,points,reserves,islands,width,palette}));
 assert.deepEqual(adj(begin),adj(previous));assert.deepEqual(paths(begin),paths(previous));assert.deepEqual(begin.annotations,previous.annotations);
 const snapshot=q.composition.comparisonStudies;assert.equal(snapshot.sourceProfileId,b.profileId);assert.equal(begin.comparisonStudies,true);
 const middle=m.buildMorphSketch(q,.5),near=m.buildMorphSketch(q,.500001);assert.deepEqual(adj(middle).map(x=>x.fieldPlateId),adj(near).map(x=>x.fieldPlateId));
 for(let i=0;i<adj(middle).length;i++)for(let j=0;j<adj(middle)[i].points.length;j++)assert.ok(Math.hypot(...adj(middle)[i].points[j].map((v,k)=>v-adj(near)[i].points[j][k]))<.01);
 const end=m.buildMorphStudy(q,1),next=m.createPromotedMorphPair(q,d),start=m.buildMorphStudy(next,0);assert.equal(next.composition.comparisonStudies,snapshot);assert.deepEqual(adj(end),adj(start));assert.deepEqual(paths(end),paths(start));assert.deepEqual(end.annotations,start.annotations);
 const wire=structuredClone({a:next.a,b:next.b,composition:next.composition,view:next.view,shapeModifiers:next.shapeModifiers}),reconstructed=m.withFieldPlatePair(m.createMorphPair(wire.a,wire.b,wire),true,{composition:wire.composition,requireCaptured:true});
 assert.deepEqual(adj(m.buildMorphStudy(reconstructed,0)),adj(start));
});

test('transported native ink is selected once and keeps nonzero opacity budgets',async()=>{
 const m=await import('./mushrooms.mjs'),pair=m.createMorphPair(generateSpecimen('once-a','amanita-1'),generateSpecimen('once-b','morel-2'));
 const ink=m.buildMorphStudy(pair,.4).ink;
 // Every endpoint stroke is carried by at least one track (none is dropped).
 for(const member of pair.implicitData.members){assert.equal(new Set(member.tracks.map(t=>t.sourceId)).size,member.endpointA.ink.length);assert.equal(new Set(member.tracks.map(t=>t.targetId)).size,member.endpointB.ink.length);}
 assert.ok(ink.length>=pair.implicitData.members.reduce((n,member)=>n+Math.max(member.endpointA.ink.length,member.endpointB.ink.length),0));assert.equal(m.nativeInkSelection(ink).length,ink.length);assert.ok(ink.every(mark=>mark.nativeSelected&&mark.opacity>0));
});


test('native field workers accept captured layout after first general anchor preparation',async()=>{
 const m=await import('./mushrooms.mjs'),p=m.withFieldPlatePair(m.createMorphPair(generateSpecimen('first-anchors-a','amanita-1'),generateSpecimen('first-anchors-b','morel-2'))),box=p.fieldPlate.sourceBox;
 const sketch=m.buildMorphSketch(p,.5);assert.deepEqual(p.fieldPlate.sourceBox,box,'sealing placement identity does not recapture page geometry');
 const wire=structuredClone({a:p.a,b:p.b,composition:p.composition,view:p.view,shapeModifiers:p.shapeModifiers}),q=m.withFieldPlatePair(m.createMorphPair(wire.a,wire.b,wire),true,{composition:wire.composition,requireCaptured:true}),paint=m.buildMorphStudy(q,.5);
 assert.deepEqual(paint.ink.map(mark=>mark.points),sketch.ink.map(mark=>mark.points));assert.deepEqual(paint.fieldPlateTransform,sketch.fieldPlateTransform);
});


test('every catalog type and hybrid rests on a closed 3D body that orbits under direct drag',async()=>{
 const m=await import('./mushrooms.mjs');
 const genomes=[...MUSHROOM_TYPES.map(type=>generateSpecimen('orbit-'+type.id,type.id)),generateSpecimen('orbit-h1','amanita-3','bolete-1'),generateSpecimen('orbit-h2','coral-1','earthstar-2'),generateSpecimen('orbit-h3','oyster-1','hedgehog-2')];
 assert.equal(new Set(MUSHROOM_TYPES.map(t=>t.grammar)).size,m.CONNECTED_BODY_GRAMMARS.length);
 for(const genome of genomes){
  const composition=m.createSpecimenComposition(genome,{count:2}),front=m.createOrbitRestPair(genome,composition,{view:{yaw:.12,pitch:.36}}),side=m.createOrbitRestPair(genome,composition,{view:{yaw:1.4,pitch:.36}});
  assert.equal(front.connectedAnatomy,true);assert.equal(front.orbitRest,true);
  const a=m.buildMorphSketch(front,0,{inkOnly:true,interactive:true}),b=m.buildMorphSketch(side,0,{inkOnly:true,interactive:true});
  assert.ok(a.ink.length>10&&b.ink.length>10,genome.profileId);assert.ok(a.ink.every(mark=>mark.points.every(p=>p.every(Number.isFinite))),genome.profileId);
  assert.notDeepEqual(a.ink.map(mark=>mark.points),b.ink.map(mark=>mark.points),genome.profileId+' does not turn');
  const sa=m.buildConnectedAnatomySurface(front,0),sb=m.buildConnectedAnatomySurface(side,0);
  sa.members.forEach((member,i)=>{assert.ok(member.mesh.closed,genome.profileId);assert.deepEqual(member.worldVertices,sb.members[i].worldVertices,'orbit moves the camera, not the body');});
  // Hybrids take whole modules: a donor changes the 3D body, or (for closed
  // bodies) its whole palette or habit, never an averaged tint.
  if(genome.donorId){const pure=generateSpecimen(genome.seed,genome.profileId);
   assert.ok(JSON.stringify(m.connectedAnatomyDimensions(genome,composition.members[0],{body3d:true}))!==JSON.stringify(m.connectedAnatomyDimensions(pure,composition.members[0],{body3d:true}))||genome.phenotype.palette!==pure.phenotype.palette||genome.phenotype.habit!==pure.phenotype.habit,'donor module changes the 3D body');}
 }
});

test('projection at yaw a+b equals turning the world body by b and viewing it at yaw a',async()=>{
 const m=await import('./mushrooms.mjs');
 const turn=(w,angle)=>[w[0]*Math.cos(angle)-w[1]*Math.sin(angle),w[0]*Math.sin(angle)+w[1]*Math.cos(angle),w[2]];
 for(const id of ['amanita-1','bolete-3','morel-2','puffball-1','coral-4','bracket-2','oyster-3','chanterelle-2','inkcap-1','earthstar-2','cup-5','nest-1','tooth-5','stinkhorn-2']){
  const genome=generateSpecimen('rigid-'+id,id),composition=m.createSpecimenComposition(genome,{count:2});
  for(const [a,b] of [[.12,.9],[-.7,2.1],[1.1,-2.6]]){
   const base=m.buildConnectedAnatomySurface(m.createOrbitRestPair(genome,composition,{view:{yaw:a,pitch:.4}}),0),turned=m.buildConnectedAnatomySurface(m.createOrbitRestPair(genome,composition,{view:{yaw:a+b,pitch:.4}}),0);
   base.members.forEach((member,i)=>{
    const project=member.chart.project;let worst=0;
    member.worldVertices.forEach((w,j)=>{const expected=project(turn(w,b)),actual=turned.members[i].vertices[j];worst=Math.max(worst,Math.hypot(...expected.map((v,k)=>v-actual[k])));});
    assert.ok(worst<1e-6,`${id} yaw ${a}+${b}: ${worst}`);
    // A genuine turn changes the outline: the projected footprint is not a 2D shear of the front view.
    const span=vs=>{const xs=vs.map(v=>v[0]);return Math.max(...xs)-Math.min(...xs);};
    assert.ok(Number.isFinite(span(turned.members[i].vertices)));
   });
  }
 }
 // Perspective: nearer tissue projects larger than the same width further away.
 const genome=generateSpecimen('persp','puffball-3'),pair=m.createOrbitRestPair(genome,m.createSpecimenComposition(genome,{count:1}),{view:{yaw:0,pitch:.6}});
 const chart=m.buildConnectedAnatomySurface(pair,0).members[0].chart,near=chart.project([0,100,0]),far=chart.project([0,-100,0]),nearR=chart.project([50,100,0]),farR=chart.project([50,-100,0]);
 assert.ok(nearR[0]-near[0]>farR[0]-far[0]);assert.ok(near[2]<far[2]);
});

test('settled rest repaint keeps the dragged preview geometry, placement and wash masks',async()=>{
 const m=await import('./mushrooms.mjs');
 for(const id of ['amanita-2','coral-1','earthstar-1','oyster-2']){
  const genome=generateSpecimen('settle-'+id,id),composition=m.createSpecimenComposition(genome,{count:3}),view={yaw:2.2,pitch:.5},shapeModifiers={capDepth:1,stemBend:0};
  const pair=m.createOrbitRestPair(genome,composition,{view,shapeModifiers}),preview=m.buildMorphSketch(pair,0),study=m.orbitRestStudy(genome,composition,{view,shapeModifiers});
  assert.deepEqual(study.ink,preview.ink);assert.deepEqual(study.bodies,preview.bodies);
  assert.ok(study.washes.length>0&&study.washes.every(w=>w.islands.length>0));
  assert.deepEqual(preview.composition.members.map(s=>[s.x,s.y,s.scale]),composition.members.map(s=>[s.x,s.y,s.scale]));
 }
});


// Field-guide plates show a cap from a little below its rim, so the gills,
// pores or teeth are in view. The default plate does; a turn must too, at
// every yaw, rather than flipping to a view of the cap's top.
test('the page builds each genome study once, and the shared build draws exactly what a fresh one does',async()=>{
 const m=await import('./mushrooms.mjs'),{createHash}=await import('node:crypto');
 const digest=value=>createHash('sha256').update(JSON.stringify(value,(k,v)=>ArrayBuffer.isView(v)?Array.from(v):v)).digest('hex');
 const draw=(a,b)=>{
  const morph=m.createImplicitMorph(a,b),{preparationMs,...stable}=morph,comp=m.orbitRestComposition(a,morph.composition);
  return [digest(stable),digest(comp),digest(m.orbitRestStudy(a,comp,{view:{yaw:1.1,pitch:.3},shapeModifiers:{capDepth:1,stemBend:0}}))];
 };
 for(const [from,to] of [['agaric-4','bolete-1'],['bolete-1','amanita-1'],['amanita-1','parasol-1']]){
  const a=generateSpecimen('woodland-042',from),b=generateSpecimen('woodland-042',to),first=draw(a,b);
  assert.deepEqual(draw(a,b),first,`${from} -> ${to}: drawn again from the shared studies`);
  assert.deepEqual(draw(generateSpecimen('woodland-042',from),generateSpecimen('woodland-042',to)),first,`${from} -> ${to}: drawn from new genomes`);
 }
});

test('capped types show their gills, pores or teeth at the default view and at every turn',async()=>{
 const m=await import('./mushrooms.mjs');
 const area=poly=>{let a=0;for(let i=0;i<poly.length;i++){const q=poly[i],r=poly[(i+1)%poly.length];a+=q[0]*r[1]-r[0]*q[1];}return Math.abs(a)/2;};
 const washed=(study,role)=>study.washes.filter(w=>w.role===role).reduce((sum,w)=>sum+w.islands.reduce((t,p)=>t+area(p),0),0);
 for(const [id,mark] of [['amanita-1','gills'],['bolete-1','pores'],['parasol-1','gills'],['agaric-1','gills'],['waxcap-1','gills'],['hedgehog-1','teeth'],['inkcap-1','gills'],['bonnet-1','gills']]){
  const g=generateSpecimen('woodland-042',id);
  assert.ok(buildStudy(g).ink.filter(k=>k.role.startsWith(mark)).length>20,`${id}: the default plate draws its ${mark}`);
  const comp=m.orbitRestComposition(g,m.createSpecimenComposition(g));
  for(const yaw of [.121,.13,.8,1.6,2.6,-2,-.9]){
   const study=m.orbitRestStudy(g,comp,{view:{yaw,pitch:.36},shapeModifiers:{capDepth:1,stemBend:0}}),under=washed(study,'underside'),cap=washed(study,'cap');
   assert.ok(under/(under+cap)>.2,`${id} at yaw ${yaw}: the underside is ${(under/(under+cap)).toFixed(2)} of the cap's area`);
  }
 }
});

// Starting a turn must not rescale the plate: each figure keeps its size and
// place from the rest plate to the first frame of the drag and to the plate
// painted after it.
test('the death cap stands in a drawn cup volva that hides the stipe base',async()=>{
 for(const seed of ['927027159','1517235776']){
  const study=buildStudy(generateSpecimen(seed,'amanita-3'));
  const stem=study.washes.find(w=>w.role==='stem'),cup=study.washes.find(w=>w.role==='veil-shadow'&&w.individual===stem.individual&&stem.reserves.includes(w.shape))?.shape;
  assert.ok(cup,'the cup\'s front wall hides the stipe pigment');
  const outline=study.ink.filter(k=>k.role==='veil'&&k.nativeSelected&&k.individual===stem.individual);
  assert.ok(outline.length>0,'the cup outline is always drawn');
  const xs=cup.map(p=>p[0]),sw=Math.max(...stem.shape.map(p=>p[0]))-Math.min(...stem.shape.map(p=>p[0]));
  assert.ok(Math.max(...xs)-Math.min(...xs)<sw*1.7,'about 1.5 stipe widths across, not twice');
 }
});

test('a turn keeps every figure the size and place it has on the rest plate',async()=>{
 const m=await import('./mushrooms.mjs');
 const skip=/shadow|ground|habitat|background|glaze|accent|spore|deposit|cast|contact|wood|log|litter|moss/;
 const boxes=marks=>{const g=new Map();for(const w of marks??[]){if(!Number.isInteger(w.individual)||skip.test(w.role??'')||!w.shape)continue;const b=g.get(w.individual)??[1e9,1e9,-1e9,-1e9];for(const [x,y] of w.shape){b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);}g.set(w.individual,b);}return g;};
 for(const q of ['?type=amanita-1&seed=woodland-042','?type=bolete-1&members=3&seed=205022449','?type=parasol-1&seed=872250143','?type=agaric-4&members=3&seed=173140941','?type=morel-1&seed=1352778786','?type=stinkhorn-1&seed=1','?type=waxcap-1&seed=woodland-042']){
  const st=parseState(q),a=generateSpecimen(st.seed,st.typeId,st.donorId),b=generateSpecimen(st.next,st.nextTypeId,st.nextDonorId);
  const pair=m.createMorphPair(a,b,{composition:m.createSpecimenComposition({...a,seed:st.compositionSeed},{count:st.compositionCount||m.seedSpecimenCount(a,m.buildSketch(a).specimenCount)}),...m.orbitViewOptions(st)});
  if(pair.implicitMorph&&!pair.composition.implicitAnchors)pair.composition=m.implicitAnchoredComposition(pair.a,pair.composition,{view:pair.view,shapeModifiers:pair.shapeModifiers}).composition;
  const rest=boxes(m.buildMorphStudy(pair,0).washes),composition=m.orbitRestComposition(a,pair.composition),view={yaw:.125,pitch:.36},frame=m.pageFrameAt(m.pagePairFrame(pair,'plain'),0);
  const drag=boxes(m.buildMorphSketch(m.createOrbitRestPair(a,composition,{view},{frame}),0,{interactive:true}).bodies);
  const released=boxes(m.orbitRestStudy(a,composition,{view,shapeModifiers:{capDepth:1,stemBend:0}}).washes);
  assert.ok(rest.size>0,q);
  for(const [i,r] of rest)for(const [label,other] of [['first drag frame',drag],['released plate',released]]){
   const t=other.get(i);assert.ok(t,`${q} member ${i} on the ${label}`);
   const sx=(t[2]-t[0])/(r[2]-r[0]),sy=(t[3]-t[1])/(r[3]-r[1]),dx=(t[0]+t[2]-r[0]-r[2])/2,dy=t[3]-r[3];
   assert.ok(Math.abs(sx-1)<.04&&Math.abs(sy-1)<.04,`${q} member ${i}: the ${label} scales it ${sx.toFixed(3)} x ${sy.toFixed(3)}`);
   assert.ok(Math.abs(dx)<12&&Math.abs(dy)<12,`${q} member ${i}: the ${label} moves it ${dx.toFixed(1)}, ${dy.toFixed(1)}`);
  }
 }
});

test('the untouched default view keeps the catalog drawing path; any turn selects the 3D body',async()=>{
 const m=await import('./mushrooms.mjs');
 const state=parseState('?type=amanita-1&nextType=morel-2');
 assert.equal(m.isDefaultOrbitView(state),true);assert.deepEqual(m.orbitViewOptions(state),m.connectedViewOptions(state));
 assert.equal(m.morphIdentity(m.morphSettings(state)),m.morphIdentity({...m.morphSettings(state),...m.connectedViewOptions(state)}));
 const turned={...state,yaw:.5};assert.equal(m.isDefaultOrbitView(turned),false);assert.equal(m.orbitViewOptions(turned).view.body3d,true);
 assert.equal(m.isDefaultOrbitView({...state,capDepth:1.2}),false);
 // Default oyster/chanterelle charts are unchanged: orthographic, no extra parts or relief marks.
 const a=generateSpecimen('d-a','oyster-2'),b=generateSpecimen('d-b','chanterelle-5'),composition=m.createSpecimenComposition(a,{count:2});
 const plain=m.buildConnectedAnatomySurface(m.createConnectedAnatomyPair(a,b,composition),0),body=m.buildConnectedAnatomySurface(m.createConnectedAnatomyPair(a,b,composition,{view:{yaw:.12,pitch:.36,body3d:true}}),0);
 assert.ok(plain.members[0].paths.length<body.members[0].paths.length);
 const chart=plain.members[0].chart,o=chart.project([0,0,0]),q=chart.project([100,0,0]),r=chart.project([100,200,50]),s2=chart.project([0,200,50]);
 assert.ok(Math.abs((q[0]-o[0])-(r[0]-s2[0]))<1e-9,'default chart stays orthographic');
 const default2D=m.createMorphPair(generateSpecimen('x','amanita-1'),generateSpecimen('y','morel-2'),{composition:m.createSpecimenComposition(generateSpecimen('x','amanita-1'),{count:2}),...m.orbitViewOptions(state)});
 assert.notEqual(default2D.connectedAnatomy,true);
});

// Display resolution: backing store, zoom detail region and wash upsampling.
test('plate backing scale follows CSS size times devicePixelRatio, quantized and capped',async()=>{
  const {plateBackingScale,PLATE_RESOLUTION}=await import('./mushrooms.mjs');
  assert.equal(plateBackingScale(840,1),1,'a DPR 1 plate never drops below the 1200 px authoring sheet');
  assert.equal(plateBackingScale(840,2),1.5,'1680 device px rounds up to the next quarter step');
  assert.equal(plateBackingScale(840,3),2.25);
  assert.equal(plateBackingScale(1200,2),2,'exact multiples are not bumped by float error');
  assert.equal(plateBackingScale(1400,3),PLATE_RESOLUTION.maxBaseScale,'memory cap');
  for(const bad of [[0,2],[NaN,2],[840,0],[840,NaN],[-5,-1]])assert.ok(plateBackingScale(...bad)>=1&&Number.isFinite(plateBackingScale(...bad)));
  for(let css=200;css<=1600;css+=37)for(const dpr of [1,1.25,1.5,2,2.625,3]){
    const k=plateBackingScale(css,dpr);assert.equal(k*4,Math.round(k*4),'quarter steps');
    assert.ok(k>=Math.min(PLATE_RESOLUTION.maxBaseScale,css*dpr/1200)-1e-9,`never under-resolved below the cap (${css}@${dpr})`);
  }
});

test('zoom detail region is the visible plate rectangle at device resolution',async()=>{
  const {plateDetailRegion,zoomPlateViewport}=await import('./mushrooms.mjs');
  const size={width:840,height:700};
  assert.equal(plateDetailRegion({scale:1,x:0,y:0},size,2,1.5),null,'fit uses the base raster');
  assert.equal(plateDetailRegion({scale:1.04,x:-10,y:-10},size,2,1.5),null,'base raster already covers small zooms');
  const view=zoomPlateViewport({scale:1,x:0,y:0},3,{x:210,y:455},size),r=plateDetailRegion(view,size,2,1.5);
  assert.equal(r.width,1680);assert.equal(r.height,1400);
  assert.ok(Math.abs(r.w-400)<1e-9&&Math.abs(r.h-1000/3)<1e-9,'one third of the plate at 3x');
  // The zoom anchor stays over the same plate point in the detail raster.
  const anchorPlate={x:210/840*1200,y:455/700*1000};
  assert.ok(Math.abs(r.x+210/840*r.w-anchorPlate.x)<1e-6&&Math.abs(r.y+455/700*r.h-anchorPlate.y)<1e-6);
  assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=1200+1e-9&&r.y+r.h<=1000+1e-9);
  const capped=plateDetailRegion(view,{width:2000,height:2000},3,1,{maxPixels:1e6});
  assert.ok(capped.width*capped.height<=1e6,'pixel budget is enforced');
});

test('wash upsampling is C1 cubic, interpolates cells, never rings and keeps zoom crops registered',async()=>{
  const {composeNativePixels,cubicWeights,nativeOverInk}=await import('./mushrooms.mjs');
  for(const t of [0,.1,.5,.77,1]){const w=cubicWeights(t);assert.ok(Math.abs(w.reduce((a,b)=>a+b,0)-1)<1e-12);}
  assert.deepEqual([...cubicWeights(0)],[0,1,0,0]);
  const w=12,h=10,field=fn=>Float32Array.from({length:w*h*3},(_,i)=>fn(Math.floor(i/3)%w,Math.floor(i/3/w),i%3));
  // A hard pigment edge: an interpolating cubic would overshoot without the clamp.
  const fields={R:field((x)=>x<6?.2:.6),B:field(()=>.1),T:field((x,y,c)=>x<6?.3+.05*c:.5)};
  const ow=120,oh=100,ink=new Uint8ClampedArray(ow*oh*4).fill(255);
  for(let i=0;i<ow*oh;i++)if(i%7===0)ink[i*4]=ink[i*4+1]=ink[i*4+2]=40;
  const full=composeNativePixels(ink,ow,oh,fields,w,h);
  for(let c=0;c<3;c++){
    const left=nativeOverInk(.2,.1,.3+.05*c,255),right=nativeOverInk(.6,.1,.5,255);
    for(let i=0;i<ow*oh;i++)if(ink[i*4]===255)assert.ok(full[i*4+c]>=Math.min(left,right)-1&&full[i*4+c]<=Math.max(left,right)+1,'no ringing halo across a wash edge');
  }
  // A pixel centred on a cell reproduces that cell exactly (3 pixels per cell).
  const aligned=composeNativePixels(new Uint8ClampedArray(36*30*4).fill(255),36,30,fields,w,h),cell=(5*w+3)*3;
  for(let c=0;c<3;c++)assert.equal(aligned[((5*3+1)*36+3*3+1)*4+c],nativeOverInk(fields.R[cell+c],fields.B[cell+c],fields.T[cell+c],255));
  // A zoom crop of the plate equals the same pixels of the whole-plate compose.
  const region={x:600,y:500,w:600,h:500},cw=60,chh=50,cropInk=new Uint8ClampedArray(cw*chh*4);
  for(let y=0;y<chh;y++)for(let x=0;x<cw;x++)for(let c=0;c<4;c++)cropInk[(y*cw+x)*4+c]=ink[((y+50)*ow+x+60)*4+c];
  const crop=composeNativePixels(cropInk,cw,chh,fields,w,h,region);let worst=0;
  for(let y=0;y<chh;y++)for(let x=0;x<cw;x++)for(let c=0;c<3;c++)worst=Math.max(worst,Math.abs(crop[(y*cw+x)*4+c]-full[((y+50)*ow+x+60)*4+c]));
  assert.ok(worst<=1,`crop registration error ${worst}`);
  // Smooth fields stay smooth: no lattice creases along a ramp.
  const ramp={R:field(x=>x/11),B:field(()=>0),T:field(()=>0)},white=new Uint8ClampedArray(ow*4).fill(255);
  const row=composeNativePixels(white,ow,1,ramp,w,h,{x:0,y:600,w:1200,h:1});
  for(let x=10;x<ow-10;x++)assert.ok(Math.abs(row[(x+1)*4]-2*row[x*4]+row[(x-1)*4])<=2,'second difference stays small at cell boundaries');
});

test('construction preview strokes at the target canvas resolution',async()=>{
  const {Painter}=await import('./mushrooms.mjs');const scales=[];
  const c={globalAlpha:1,setTransform(){},clearRect(){},drawImage(){},scale(x,y){scales.push([x,y]);},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
  const draws=[],target={setTransform(){},clearRect(){},drawImage(...args){draws.push(args);}};
  // A 720 × 600 motion target strokes at 720 px rather than magnifying 600 px.
  const layer={width:720,height:600,getContext:()=>c},painter={sketchLayer:layer,ctx:target,paper:{},canvas:{width:720,height:600}};
  Painter.prototype.sketch.call(painter,generateSpecimen('crisp-sketch','amanita-1'));
  assert.equal(painter.sketchLayer,layer,'a matching layer is reused');assert.deepEqual(scales[0],[.6,.6],'plate units map to target pixels');
  assert.deepEqual(draws[0].slice(1),[0,0,720,600]);
  // Hi-DPI backing stores keep a moving or dragged preview at the full 1200 px sheet (frame-cost cap).
  const big={width:1200,height:1000,getContext:()=>c},hi={sketchLayer:big,ctx:target,paper:{},canvas:{width:2700,height:2250}};
  Painter.prototype.sketch.call(hi,generateSpecimen('crisp-sketch','amanita-1'),{interactive:true});assert.equal(hi.sketchLayer,big);assert.deepEqual(scales[1],[1,1]);
  // At rest the construction drawing is stroked at the device resolution, not magnified.
  const full={width:2700,height:2250,getContext:()=>c},rest={sketchLayer:full,ctx:target,paper:{},canvas:{width:2700,height:2250}};
  Painter.prototype.sketch.call(rest,generateSpecimen('crisp-sketch','amanita-1'));assert.equal(rest.sketchLayer,full);assert.deepEqual(scales[2],[2.25,2.25]);
});

test('plate viewport reports view changes without repainting the canvas',()=>{
  const seen=[];const f=zoomFixture({onView:(view,size)=>seen.push({view,size})});
  f.controller.zoomIn();
  assert.ok(seen.length>=2);assert.equal(seen.at(-1).view.scale,1.25);assert.deepEqual(seen.at(-1).size,{width:800,height:600});
  seen.at(-1).view.scale=99;assert.equal(f.controller.getState().scale,1.25,'callers receive a copy');
  assert.equal(f.canvas.width,1200);f.controller.destroy();
});

test('page frame fits each endpoint drawing to the plate with margins and a caption below it',async()=>{
  const m=await import('./mushrooms.mjs');const F=m.PAGE_FRAME;
  const cases=[['amanita-1','oyster-1','plain'],['oyster-1','oyster-2','plain'],['jelly-3','jelly-3','plain'],['coral-4','coral-4','plain'],['bolete-2','bolete-2','woodland'],['parasol-5','agaric-5','plain'],['chanterelle-3','puffball-3','moss-bank'],['cup-4','cup-4','leaf-litter']];
  for(const [ta,tb,scene] of cases){
    const pair=m.createMorphPair(generateSpecimen('frame-a',ta),generateSpecimen('frame-b',tb));
    for(const t of [0,1]){
      const plan=m.buildMorphStudy(pair,t,{scene}),box=m.planDrawingBounds(plan),frame=m.pageFrameAt(m.pagePairFrame(pair,scene),t);
      assert.ok(box.x>=F.x-1&&box.x+box.w<=F.x+F.w+1&&box.y>=F.y-1,`${ta}/${tb}@${t} stays inside the side and top margins`);
      assert.ok(box.y+box.h<=plan.pageCaption.title-F.captionGap+1,`${ta}/${tb}@${t} caption sits below the drawing`);
      assert.ok(plan.pageCaption.footer<=F.footer+1e-9);
      const filled=Math.max(box.w/F.w,box.h/F.h);
      assert.ok(filled>.82||Math.abs(frame.scale-F.maxScale)<1e-9,`${ta}/${tb}@${t} fills ${filled.toFixed(2)} of the drawing area`);
    }
  }
});

test('page frame is shared by preview and paint, continuous through the morph, and carried on promotion',async()=>{
  const m=await import('./mushrooms.mjs');
  const a=generateSpecimen('carry-a','bolete-2'),b=generateSpecimen('carry-b','bolete-2'),pair=m.createMorphPair(a,b);
  const sketch=m.buildMorphSketch(pair,0),paint=m.buildMorphStudy(pair,0);
  assert.deepEqual(sketch.pageFrame,paint.pageFrame);
  const raw=m.buildMorphSketch(pair,0,{rawFieldPlate:true}),{scale,tx,ty}=sketch.pageFrame;
  assert.ok(Math.abs(raw.ink[0].points[0][0]*scale+tx-sketch.ink[0].points[0][0])<1e-9,'uniform scale, no distortion');
  let last=m.pageFrameAt(m.pagePairFrame(pair),0);
  for(let i=1;i<=20;i++){const f=m.pageFrameAt(m.pagePairFrame(pair),i/20);assert.ok(Math.abs(f.scale-last.scale)<.05&&Math.abs(f.tx-last.tx)<40&&Math.abs(f.ty-last.ty)<40);last=f;
    const box=m.planDrawingBounds(m.buildMorphSketch(pair,i/20));assert.ok(box.x>=0&&box.y>=0&&box.x+box.w<=1200&&box.y+box.h<=1000,'intermediate blends stay on the sheet');}
  const arrived=m.buildMorphStudy(pair,1);
  const next=m.createPromotedMorphPair(pair,generateSpecimen('carry-c','bolete-2'));
  assert.deepEqual(m.pagePairFrame(next).a,m.pagePairFrame(pair).b);
  assert.deepEqual(m.buildMorphStudy(next,0).pageFrame,arrived.pageFrame);
  const before=m.pagePairFrame(pair,'woodland');assert.notEqual(before.key,m.pagePairFrame(pair).key,'the setting is part of the fit');
  assert.equal(m.withFieldPlatePair(m.createMorphPair(a,b),true)&&m.buildMorphStudy(m.withFieldPlatePair(m.createMorphPair(a,b),true),0).pageFrame,undefined,'field studies keep their own plate layout');
});

test('field-study plates give every figure and caption its own space with the habit dominant',async()=>{
  const m=await import('./mushrooms.mjs');
  const overlap=(p,q)=>p.x<q.x+q.w&&q.x<p.x+p.w&&p.y<q.y+q.h&&q.y<p.y+p.h;
  for(const [type,seed] of [['parasol-1','1606559638'],['oyster-1','woodland-042'],['amanita-1','fern-7'],['coral-4','woodland-042'],['morel-4','x']]){
    const st=parseState(`?type=${type}&seed=${seed}&plate=1`),a=generateSpecimen(st.seed,st.typeId),b=generateSpecimen(st.next,st.nextTypeId);
    const pair=m.withFieldPlatePair(m.createMorphPair(a,b,{composition:m.createSpecimenComposition(a,{count:m.buildSketch(a).specimenCount})}),true);
    const plan=m.buildMorphSketch(pair,0),r=plan.fieldPlate,boxes=[r.adultBox,r.cutBox,r.detailBox];
    const deposit=plan.ink.concat(plan.bodies??[]).some(mark=>mark.studyRole==='spore-deposit');
    if(deposit)boxes.push(r.depositBox);
    boxes.forEach((p,i)=>boxes.slice(i+1).forEach(q=>assert.ok(!overlap(p,q),`${type}: figure slots overlap`)));
    for(const box of boxes)assert.ok(box.x>=0&&box.y>=0&&box.x+box.w<=1200&&box.y+box.h<=880,`${type}: slot stays above the plate title`);
    for(const box of boxes.slice(1))assert.ok(r.adultBox.w*r.adultBox.h>box.w*box.h*1.4,`${type}: habit group dominates`);
    const labels=plan.annotations.filter(n=>n.fieldPlateId?.startsWith('adjunct:label:'));
    labels.forEach((p,i)=>labels.slice(i+1).forEach(q=>assert.ok(Math.abs(p.x-q.x)>150||Math.abs(p.y-q.y)>16,`${type}: captions "${p.text}" and "${q.text}" collide`)));
  }
});

test('zoom re-raster composes wash edges and paper settling exactly like the base plate',async()=>{
 const m=await import('./mushrooms.mjs');
 const w=64,h=54,n=w*h*3,R=new Float32Array(n),B=new Float32Array(n),T=new Float32Array(n).fill(1);
 // A dense wash disc with a hard native edge, so the vector edge split is exercised.
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(Math.hypot(x-30,y-26)<14)for(let c=0;c<3;c++){const i=(y*w+x)*3+c;T[i]=.35+.1*c;R[i]=.05;B[i]=.3;}
 const fields={R,B,T},W=1200,H=1000,ink=new Uint8ClampedArray(W*H*4).fill(235),coverage=new Uint8Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)coverage[y*W+x]=Math.hypot((x+.5)-(30.5*W/w),(y+.5)-(26.5*H/h))<14*W/w?255:0;
 const field=new Float32Array(W*H);for(let i=0;i<field.length;i++)field[i]=.6+.5*Math.sin(i*.37)*Math.cos(i*.011);
 const settling={field,width:W,height:H},full=m.composeNativePixels(ink,W,H,fields,w,h,undefined,{coverage,settling});
 const region={x:420,y:330,w:240,h:200},crop=new Uint8Array(region.w*region.h);
 for(let y=0;y<region.h;y++)for(let x=0;x<region.w;x++)crop[y*region.w+x]=coverage[(y+region.y)*W+x+region.x];
 const part=m.composeNativePixels(new Uint8ClampedArray(region.w*region.h*4).fill(235),region.w,region.h,fields,w,h,region,{coverage:crop,settling});
 let worst=0,changed=0;
 for(let y=4;y<region.h-4;y++)for(let x=4;x<region.w-4;x++)for(let c=0;c<3;c++){const a=full[((y+region.y)*W+x+region.x)*4+c],b=part[(y*region.w+x)*4+c];worst=Math.max(worst,Math.abs(a-b));if(a!==235)changed++;}
 assert.equal(worst,0,'detail raster differs from the base plate');assert.ok(changed>1000,'the test region holds wash');
 const plain=m.composeNativePixels(ink,W,H,fields,w,h);assert.notDeepEqual(plain,full,'settling and edge resolve take effect');
});

test('form glazes skip faceted 3D-chart islands instead of failing the settle Worker',async()=>{
 const m=await import('./mushrooms.mjs');
 assert.deepEqual(m.nativeShadowContour([[0,0],[40,0],[40,40]],5),{points:[],rim:[]});
 for(const id of ['chanterelle-3','oyster-1']){
  const genome=generateSpecimen('glaze-'+id,id),pair=m.createMorphPair(genome,generateSpecimen('glaze-next','nest-1'));
  const study=m.buildMorphStudy(pair,0);
  assert.doesNotThrow(()=>m.nativeFormGlazes(study.washes),id);assert.doesNotThrow(()=>m.nativeGroundingWashes(study),id);
  const rest=m.orbitRestStudy(genome,m.orbitRestComposition(genome),{view:{yaw:1,pitch:.4}});
  assert.doesNotThrow(()=>m.nativeFormGlazes(rest.washes),id+' turned');assert.ok(m.nativeGroundingWashes(rest).length>0,id+' turned body is grounded');
 }
});

test('morph preview wash: endpoint colour fields are carried, calibrated and continuous',async()=>{
 const m=await import('./mushrooms.mjs');
 const white=m.previewWashLut({});assert.ok(white.every(v=>v===1),'an empty palette leaves paper white');
 const lut=m.previewWashLut({alizarin:1});assert.equal(lut[0],1);assert.ok(lut.at(-2)<lut[1],'more pigment absorbs more green');
 const pair=m.createMorphPair(generateSpecimen('wash-a','amanita-1'),generateSpecimen('wash-b','bolete-1')),data=m.prepareImplicitPair(pair);
 for(const member of data.members){
  assert.equal(member.colourA.length,member.grid.cells*3);assert.equal(member.colourB.length,member.grid.cells*3);
  let tinted=0;for(let i=0;i<member.grid.cells;i++)if(member.a.body[i]<0&&member.colourA[i*3+1]<235)tinted++;
  assert.ok(tinted>member.a.bodyArea*.3,'the endpoint body carries its wash colour');
 }
 const at=t=>m.sampleImplicitMorph(data,t).bodies.map(body=>body.previewWash);
 for(const wash of at(0))assert.equal(wash.t,0);
 const w=at(.37);assert.ok(w.every(x=>x&&x.t===.37&&x.field.length===x.grid.cells&&Number.isFinite(x.offset)));
 // Wash colour is a linear mix of the two endpoint fields; no stage pops.
 const k=data.members[0].grid.cells>>1,mixAt=t=>mixColour(data.members[0],k,t),mixColour=(member,i,t)=>member.colourA[i*3]+(member.colourB[i*3]-member.colourA[i*3])*t;
 assert.ok(Math.abs(mixAt(.501)-mixAt(.5))<=Math.abs(data.members[0].colourB[k*3]-data.members[0].colourA[k*3])*.002+1e-9);
});

test('cross-type ink: nearest correspondence, a clean silhouette mid-morph and exact endpoints',async()=>{
 const m=await import('./mushrooms.mjs');
 const pair=m.createMorphPair(generateSpecimen('sil-a','morel-1'),generateSpecimen('sil-b','oyster-1')),data=m.prepareImplicitPair(pair);
 assert.equal(m.implicitOutlineWeight(0),0);assert.equal(m.implicitOutlineWeight(1),0);assert.equal(m.implicitOutlineWeight(.5),1);
 for(const t of [0,1])assert.ok(!m.sampleImplicitMorph(data,t).ink.some(mark=>mark.morphSilhouette),'endpoints draw only native ink');
 const mid=m.sampleImplicitMorph(data,.5),loops=mid.ink.filter(mark=>mark.morphSilhouette);
 assert.ok(loops.length>=data.members.length,'every member has a silhouette');
 for(const loop of loops){assert.deepEqual(loop.points[0],loop.points.at(-1));assert.ok(loop.opacity>0);}
 // Tracks pair strokes that sit near each other in their member boxes.
 for(const member of data.members){
  const centre=(points,box)=>{let x=0,y=0;for(const p of points){x+=p[0];y+=p[1];}return [(x/points.length-box.x)/box.w,(y/points.length-box.y)/box.h];};
  const d=member.tracks.map(t=>{const a=centre(t.a.points,member.endpointA.box),b=centre(t.b.points,member.endpointB.box);return Math.hypot(a[0]-b[0],a[1]-b[1]);}).sort((x,y)=>x-y);
  assert.ok(d[Math.floor(d.length*.9)]<.45,`90% of tracks travel under 0.45 of the member box (${d[Math.floor(d.length*.9)].toFixed(3)})`);
 }
 // Small closed marks (warts, pits) keep their ink while long contours recede.
 const same=m.createMorphPair(generateSpecimen('w-a','amanita-1'),generateSpecimen('w-b','parasol-1')),sd=m.prepareImplicitPair(same),s0=m.sampleImplicitMorph(sd,.5);
 const small=s0.ink.filter(mark=>!mark.morphSilhouette&&mark.role==='cap-contour').map(mark=>mark.opacity);
 assert.ok(small.length&&Math.max(...small)>.3,'some contour-role detail stays fully inked');
});

test('seed morph previews use a native-placement body field; dispatch and prediction identity hold',async()=>{
 const m=await import('./mushrooms.mjs');
 const a=generateSpecimen('seed-a','amanita-1'),b=generateSpecimen('seed-b','amanita-1'),pair=m.createMorphPair(a,b);
 assert.equal(pair.implicitMorph,false);assert.equal(pair.previewField,true);assert.equal(m.morphPreviewKind(pair),'field');
 assert.equal(m.morphPreviewKind(m.createMorphPair(a,generateSpecimen('x','bolete-1'))),'field');
 assert.equal(m.morphPreviewKind(m.createMorphPair(generateSpecimen('c','oyster-1'),generateSpecimen('d','chanterelle-4'))),null,'connected charts keep their own preview');
 const data=m.morphPreviewData(pair);assert.equal(pair.previewData,data);
 for(const member of data.members){assert.deepEqual([member.endpointB.slot.x,member.endpointB.slot.y],member.endpointB.nativeRoot,'destination members keep their own plate placement');}
 const end=m.sampleImplicitMorph(data,1),start=m.sampleImplicitMorph(data,0);
 assert.ok(end.ink.length&&start.ink.length);
 // The page predicts a settled plate before its shapes are prepared.
 const c=m.createSpecimenComposition(a,{count:2}),prepared=m.createImplicitMorph(a,generateSpecimen('y','morel-1'),c);
 assert.equal(JSON.stringify(m.implicitAnchoredComposition(a,c).composition),JSON.stringify(prepared.composition));
 // Determinism: a frame depends on its blend only.
 const x=m.sampleImplicitMorph(data,.42).ink.map(mark=>mark.points),y=(m.sampleImplicitMorph(data,.9),m.sampleImplicitMorph(data,.42).ink.map(mark=>mark.points));assert.deepEqual(x,y);
 assert.equal(parseState('?seed=a').duration,m.MORPH_DEFAULT_SECONDS);assert.equal(m.MORPH_DEFAULT_SECONDS,5);
});

test('a seed morph lands where its preview ended: native layout and the same page frame',async()=>{
 const m=await import('./mushrooms.mjs');
 for(const type of ['amanita-1','morel-1']){
  const a=generateSpecimen('land-a',type),b=generateSpecimen('land-b',type),pair=m.createMorphPair(a,b,{composition:m.createSpecimenComposition(a,{count:m.buildSketch(a).specimenCount})});
  assert.equal(pair.sameRecipe,true);const frame=m.pagePairFrame(pair);
  const preview=m.createImplicitMorph(a,b,pair.composition,{nativeTargets:true});
  const next=m.createPromotedMorphPair(pair,generateSpecimen('land-c','bolete-2'));
  assert.equal(next.implicitMorph,true);assert.deepEqual(m.pagePairFrame(next).a,frame.b,'settled destination keeps the morph frame');
  preview.members.forEach((member,i)=>{const slot=next.composition.members[i];assert.ok(Math.abs(member.endpointB.slot.x-slot.x)<1e-9&&Math.abs(member.endpointB.slot.y-slot.y)<1e-9,`${type} member ${i} lands in place`);assert.ok(!slot.lean&&!slot.stretch,'no re-blocking on landing');});
  // The first preview frame starts from the constructor layout too.
  preview.members.forEach((member,i)=>assert.ok(!member.slot.lean&&!member.slot.stretch));
 }
});

test('beta types draw the field marks of their model species', () => {
  const pal=id=>MUSHROOM_TYPES.find(t=>t.id===id).palette;
  assert.equal(pal('amanita-3'),'deathcap');assert.equal(pal('agaric-1'),'ivory');assert.equal(pal('puffball-1'),'ivory');assert.equal(pal('milkcap-1'),'salmon');
  const fly=buildStudy(generateSpecimen('beta','amanita-1'));
  assert.ok(fly.ink.filter(m=>m.role==='gills').length>=300,'fly agaric shows a crowded gill fan');
  const hydnum=buildStudy(generateSpecimen('beta','hedgehog-1'));
  assert.ok(hydnum.ink.filter(m=>m.role==='teeth').length>=150,'hedgehog shows spines under the cap');
  const campestris=buildStudy(generateSpecimen('beta','agaric-1'));
  assert.ok(campestris.washes.some(m=>['underside','gill-face'].includes(m.role)&&m.palette.rose>.3),'field mushroom gills are pink-brown');
});


test('random picks default to the field-guide (beta) forms; every form stays a valid morph endpoint',async()=>{
 const m=await import('./mushrooms.mjs');
 assert.equal(m.BETA_TYPES.length,20);assert.equal(new Set(m.BETA_TYPES).size,20);
 const here=m.BETA_TYPES.filter(id=>MUSHROOM_TYPES.some(t=>t.id===id)&&id!=='bracket-6');assert.ok(here.length>=19);
 const seen=new Set();for(let i=0;i<2000;i++){const id=m.chooseMorphTarget('oyster-1',`beta-${i}`);assert.ok(m.isBetaType(id),id);assert.notEqual(id,'oyster-1');seen.add(id);}
 assert.equal(seen.size,here.length-1,'every other beta form is reached');
 const alpha=MUSHROOM_TYPES.find(t=>!m.isBetaType(t.id)).id,target=m.chooseMorphTarget(alpha,'x');assert.ok(m.isBetaType(target));
 assert.equal(m.createMorphPair(generateSpecimen('a',alpha),generateSpecimen('b',target)).supportedMotion,true);
 assert.equal(m.createMorphPair(generateSpecimen('b',target),generateSpecimen('a',alpha)).supportedMotion,true);
 const st=parseState('?type=amanita-1&seed=s&next=n');assert.equal(st.includeAlpha,false);assert.ok(m.isBetaType(st.nextTypeId));
 for(let i=0;i<50;i++)assert.ok(m.isBetaType(m.advanceMorphState(st,`adv-${i}`).nextTypeId));
 const wide=parseState('?type=amanita-1&seed=s&next=n&alpha=1');assert.equal(wide.includeAlpha,true);
 const reached=new Set();for(let i=0;i<400;i++)reached.add(m.advanceMorphState(wide,`adv-${i}`).nextTypeId);assert.ok([...reached].some(id=>!m.isBetaType(id)),'experimental destinations appear when included');
 assert.equal(m.randomTypePool(false).length,here.length);assert.equal(m.randomTypePool(true).length,MUSHROOM_TYPES.filter(t=>t.id!=='bracket-6').length);
});

// Orbit reprojection: the finished painting rides on the turning mesh.
test('reprojection mesh keeps topology across views and the key ignores the camera',async()=>{
 const m=await import('./mushrooms.mjs');
 for(const id of ['amanita-1','coral-3','earthstar-1','oyster-1']){
  const genome=generateSpecimen('rp-'+id,id),composition=m.orbitRestComposition(genome);
  // As in the app: the turned body carries the page frame of the drawing it replaces.
  const frame={scale:.9,tx:40,ty:30},front=m.createOrbitRestPair(genome,composition,{view:{yaw:.12,pitch:.36}},{frame}),side=m.createOrbitRestPair(genome,composition,{view:{yaw:1.7,pitch:.5}},{frame});
  const a=m.orbitMeshAt(front,0),b=m.orbitMeshAt(side,0);
  assert.equal(m.reprojectionKey(front,0),m.reprojectionKey(side,0),id);
  assert.deepEqual(a.frame,frame,'carried page frame');assert.deepEqual(b.frame,frame);
  a.members.forEach((member,i)=>{
   assert.deepEqual(member.faces.map(f=>f.indices),b.members[i].faces.map(f=>f.indices),id+' topology');
   assert.notDeepEqual(member.vertices,b.members[i].vertices,id+' turns');
   assert.ok(member.chains.length>0&&member.faces.some(f=>f.visible)&&member.faces.some(f=>!f.visible),id);
  });
  // The meshOnly chart is the interactive sketch's chart: same projected vertices.
  const full=m.buildConnectedAnatomySurface(front,0,{inkOnly:true,interactive:true});
  full.members.forEach((member,i)=>assert.deepEqual(member.vertices,a.members[i].vertices));
 }
});

test('reprojection registration samples visible faces in place and mirrors hidden ones',async()=>{
 const m=await import('./mushrooms.mjs');
 for(const id of ['amanita-1','bolete-1','puffball-1','inkcap-1']){
  const genome=generateSpecimen('rp-reg-'+id,id),pair=m.createOrbitRestPair(genome,m.orbitRestComposition(genome),{view:{yaw:.5,pitch:.3}});
  const mesh=m.orbitMeshAt(pair,0),reg=m.orbitReprojectionRegistration(mesh),{scale:s,tx,ty}=mesh.frame;
  assert.equal(reg.triangleCount,reg.tris.length);assert.ok(reg.captured>reg.triangleCount*.2,id+' captured');assert.ok(reg.mirrored>reg.triangleCount*.05,id+' mirrored '+reg.mirrored);
  reg.tris.forEach((tri,i)=>{
   if(reg.source[i]!==1)return;
   assert.equal(mesh.members[tri.m].faces[tri.f].visible,true,'captured faces were front facing');
   const vs=mesh.members[tri.m].vertices;[tri.a,tri.b,tri.c].forEach((j,k)=>{assert.ok(Math.abs(reg.uv[i*6+k*2]-(vs[j][0]*s+tx))<1e-3);assert.ok(Math.abs(reg.uv[i*6+k*2+1]-(vs[j][1]*s+ty))<1e-3);});
  });
  // Back faces never sample themselves: their texels come from a donor or a tone.
  reg.tris.forEach((tri,i)=>{if(!mesh.members[tri.m].faces[tri.f].visible)assert.notEqual(reg.source[i],1);});
  // Every texel lies on the plate.
  for(let i=0;i<reg.uv.length;i++)if(Number.isFinite(reg.uv[i]))assert.ok(reg.uv[i]>-50&&reg.uv[i]<1250);
 }
});

test('triangle affine maps source corners onto destination corners',async()=>{
 const m=await import('./mushrooms.mjs');
 const map=m.triangleAffine(10,20,50,25,30,70,100,100,180,90,120,210),apply=(u,v)=>[map[0]*u+map[2]*v+map[4],map[1]*u+map[3]*v+map[5]];
 [[10,20,100,100],[50,25,180,90],[30,70,120,210]].forEach(([u,v,x,y])=>{const p=apply(u,v);assert.ok(Math.abs(p[0]-x)<1e-9&&Math.abs(p[1]-y)<1e-9);});
 assert.equal(m.triangleAffine(0,0,1,1,2,2,0,0,1,0,0,1),null,'degenerate source');
});

test('reprojected frame: static background first, each visible face once, current silhouettes last',async()=>{
 const m=await import('./mushrooms.mjs');
 const genome=generateSpecimen('rp-draw','bolete-1'),composition=m.orbitRestComposition(genome);
 const capture=m.orbitMeshAt(m.createOrbitRestPair(genome,composition,{view:{yaw:.12,pitch:.36}}),0);
 const reg=m.orbitReprojectionTones(m.orbitReprojectionRegistration(capture),()=>[150,110,80],()=>[245,240,230]);
 const now=m.orbitMeshAt(m.createOrbitRestPair(genome,composition,{view:{yaw:1.2,pitch:.4}}),0);
 const log=[];let depth=[];
 const ctx=new Proxy({},{get:(t,k)=>k in t?t[k]:(...args)=>{log.push([k,args]);},set:(t,k,v)=>{t[k]=v;return true;}});
 const texture={width:2400,height:2000},background={width:2400,height:2000,id:'bg'};
 const stats=m.drawOrbitReprojection(ctx,reg,now,{width:1200,height:1000,texture,background});
 assert.equal(log.find(([k])=>k==='drawImage')[1][0],background,'background is drawn first');
 assert.equal(log.at(-2)[0],'stroke','ink silhouettes are stroked last');
 const visible=now.members.reduce((n,member)=>n+member.faces.filter(f=>f.visible).length,0);
 assert.equal(stats.faces,visible);assert.ok(stats.textured>0&&stats.inkSegments>0);
 assert.equal(log.filter(([k])=>k==='clip').length+stats.filled,log.filter(([k])=>k==='clip').length+log.filter(([k])=>k==='fill').length);
 // Textured draws only ever hand over a sub-rectangle of the texture.
 for(const [k,args] of log)if(k==='drawImage'&&args[0]===texture){assert.equal(args.length,9);assert.ok(args[1]>=0&&args[2]>=0&&args[1]+args[3]<=2400&&args[2]+args[4]<=2000);}
 // Painted tones: every fill is a parsed rgb() colour near the sampled wash.
 assert.ok(reg.fill.every(f=>/^rgb\(\d+,\d+,\d+\)$/.test(f)));
});

test('tones treat bare paper under a drawing as unpainted and fall back to the part mean',async()=>{
 const m=await import('./mushrooms.mjs');
 const genome=generateSpecimen('rp-tone','amanita-1'),mesh=m.orbitMeshAt(m.createOrbitRestPair(genome,m.orbitRestComposition(genome),{view:{yaw:.12,pitch:.36}}),0);
 const reg=m.orbitReprojectionRegistration(mesh),paper=()=>[240,235,225];
 const left=x=>x<600;const toned=m.orbitReprojectionTones(reg,(x,y)=>left(x)?[200,60,50]:[240,236,226],paper);
 reg.tris.forEach((tri,i)=>{if(!reg.source[i])return;const x=(reg.uv[i*6]+reg.uv[i*6+2]+reg.uv[i*6+4])/3;if(!left(x))assert.equal(toned.source[i],0,'paper-coloured texel is not used');});
 assert.ok(Object.values(toned.tones).every(c=>c[0]>150&&c[1]<120),'means come only from painted texels');
 const kept=m.orbitReprojectionTones(reg,(x,y)=>left(x)?[200,60,50]:[240,236,226],paper,{paperTest:false});
 assert.deepEqual([...kept.source].map(Boolean),[...reg.source].map(Boolean),'a 3D painting keeps its pale washes');
});

test('drawing registration fits each body part box onto the drawn part box',async()=>{
 const m=await import('./mushrooms.mjs');
 const genome=generateSpecimen('rp-warp','amanita-1'),mesh=m.orbitMeshAt(m.createOrbitRestPair(genome,m.orbitRestComposition(genome),{view:{yaw:.12,pitch:.36}}),0);
 const plan={ink:[{individual:0,role:'cap-contour',points:[[100,100],[300,160]]},{individual:0,role:'stem-contour',points:[[180,160],[220,400]]}],bodies:[]};
 const warp=m.drawingRegistrationWarp(mesh,plan),{scale:s,tx,ty}=mesh.frame;
 const caps=mesh.members[0].faces.filter(f=>f.visible&&['cap','underside','margin'].includes(f.role)).flatMap(f=>f.projected.map(v=>[v[0]*s+tx,v[1]*s+ty]));
 const xs=caps.map(p=>p[0]),ys=caps.map(p=>p[1]),lo=warp(0,'cap',[Math.min(...xs),Math.min(...ys)]),hi=warp(0,'cap',[Math.max(...xs),Math.max(...ys)]);
 assert.ok(Math.abs(lo[0]-100)<1e-6&&Math.abs(lo[1]-100)<1e-6&&Math.abs(hi[0]-300)<1e-6&&Math.abs(hi[1]-160)<1e-6);
 const stems=mesh.members[0].faces.filter(f=>f.visible&&f.role==='stem').flatMap(f=>f.projected.map(v=>[v[0]*s+tx,v[1]*s+ty]));
 const top=warp(0,'stem',[Math.min(...stems.map(p=>p[0])),Math.min(...stems.map(p=>p[1]))]);assert.ok(Math.abs(top[0]-180)<1e-6&&Math.abs(top[1]-160)<1e-6);
 assert.deepEqual(warp(5,'cap',[10,20]),[10,20],'no drawn counterpart: identity');
 assert.equal(m.drawingRegistrationWarp(mesh,null),null);
 // A drawing's footprint is its own bodies and ink, never the larger 3D mesh.
 assert.equal(m.reprojectionFootprint(mesh,plan).polygons.length,0);assert.ok(m.reprojectionFootprint(mesh).polygons.length>0);
});

test('catalog drawings export each specimen view; the turned body starts from it',async()=>{
 const m=await import('./mushrooms.mjs');
 const g=generateSpecimen('native-proof-20261019','amanita-1'),sketch=m.buildSketch(g),comp=m.orbitRestComposition(g);
 assert.equal(sketch.views.length,sketch.specimenCount);
 for(const [i,view] of sketch.views.entries()){
  assert.ok(view.pitch<0&&view.pitch>-.6,'the plate shows the gills, so its 3D camera is a little below the rim');
  assert.ok(view.rise>0&&view.stem>0&&view.girth>0);
  const member=comp.members[i];assert.equal(member.rotation,view.roll,'the body takes the drawn lean');
  assert.ok(Math.abs(member.viewPitch-(view.pitch-m.defaultViewPitch('amanita-1')))<1e-9,'drawn pitch is an offset from the family plate pitch');
  assert.deepEqual(Object.keys(member.drawn).sort(),['girth','rise','stem','widen'],'drawn proportions, plus the width fitted to the drawn outline');
 }
 // The turned body has the drawn cap rise, within limits, and the mesh uses the member pitch.
 const pair=m.createOrbitRestPair(g,comp),p=pair.anatomyA[1],cap=p.thickness+p.dome-Math.min(0,p.rimLift);
 assert.ok(Math.abs(cap/p.radius-sketch.views[1].rise)<.02||cap/p.radius<sketch.views[1].rise,'cap rise follows the drawing');
 const flat=m.createOrbitRestPair(g,{...comp,members:comp.members.map(({viewPitch,...k})=>k)});
 assert.notDeepEqual(m.orbitMeshAt(pair,0).members[0].vertices,m.orbitMeshAt(flat,0).members[0].vertices);
 // Earthstar rays reach as far as drawn; types without a drawn camera keep the family pitch.
 const star=m.generateSpecimen?generateSpecimen('cmp','earthstar-1'):null,sv=m.buildSketch(star).views;assert.ok(Math.abs(sv[0].pitch-Math.asin(.29))<1e-9&&sv[0].rays>1);
 const morel=m.orbitRestComposition(generateSpecimen('cmp','morel-1'));assert.ok(morel.members.every(k=>!('viewPitch' in k)&&Object.keys(k.drawn).join()==='widen'));
});

test('the turned colony follows the plate: its member count, anchors and drawn outline',async()=>{
 const m=await import('./mushrooms.mjs');
 const g=generateSpecimen('colony-7','inkcap-1'),drawn=m.buildSketch(g).specimenCount;
 // members=3 on a plate whose catalog drawing has a different count.
 const {composition,endpointsA}=m.implicitAnchoredComposition(g,m.createSpecimenComposition({...g,seed:'colony-7'},{count:3}));
 assert.notEqual(drawn,3);const rest=m.orbitRestComposition(g,composition);assert.equal(rest.members.length,3);
 // Each body's projected box at the default camera stands centred on the bottom of its drawn
 // figure's box (the endpoint outline at its slot) and is as tall as it, or fits inside it.
 const pair=m.createOrbitRestPair(g,rest,{view:{yaw:.12,pitch:.36}}),surface=m.buildConnectedAnatomySurface(pair,0);
 surface.members.forEach((member,i)=>{
  const xs=member.vertices.map(v=>v[0]),ys=member.vertices.map(v=>v[1]),e=endpointsA[i],at=composition.members[i];
  const px=e.polygons.flat().map(p=>at.x+p[0]),py=e.polygons.flat().map(p=>at.y+p[1]);
  const drawn={cx:(Math.min(...px)+Math.max(...px))/2,bottom:Math.max(...py),h:Math.max(...py)-Math.min(...py)};
  assert.ok(Math.abs((Math.min(...xs)+Math.max(...xs))/2-drawn.cx)<1.5,`member ${i} centred on its drawn figure`);
  assert.ok(Math.abs(Math.max(...ys)-drawn.bottom)<1.5,`member ${i} stands on its drawn figure`);
  const h=Math.max(...ys)-Math.min(...ys);assert.ok(h<=drawn.h*1.02+2,`member ${i} is no taller than its drawing`);
 });
 // The plate's stretch and lean act on the body about its foot.
 const k=rest.members.find(x=>x.stretch||x.lean);assert.ok(k,'blocked plate anchors carry stretch or lean');
});

test('a coral fan opens to the width of its drawn candelabra',async()=>{
 const m=await import('./mushrooms.mjs');
 const g=generateSpecimen('cmp','coral-3'),rest=m.orbitRestComposition(g),k=rest.members[0];
 assert.ok(k.drawn.widen>1,'the drawn coral is wider than the default fan');
 const pair=m.createOrbitRestPair(g,rest),p=pair.anatomyA[0];assert.equal(p.coralSpread,k.drawn.widen);
 const width=spread=>{const s=m.buildConnectedAnatomySurface({...pair,anatomyA:[{...p,coralSpread:spread}],anatomyB:[{...p,coralSpread:spread}]},0).members[0].vertices.map(v=>v[0]);return Math.max(...s)-Math.min(...s);};
 assert.ok(width(p.coralSpread)>width(1)*1.1,'a wider spread draws a wider fan');
});

test('release reveal: native ink lands over the reprojection, which recedes; the final is native only',async()=>{
 const m=await import('./mushrooms.mjs'),R=m.REPROJECTION;
 assert.equal(m.revealWeight(0),1);assert.equal(m.revealWeight(R.revealInkEnd),1);
 let last=1;for(let p=R.revealInkEnd;p<=1;p+=.05){const w=m.revealWeight(p);assert.ok(w<=last+1e-12&&w>=0);last=w;}
 assert.equal(m.revealWeight(.99),0);assert.equal(m.revealWeight(.5,true),0);assert.equal(m.revealWeight(NaN),0);
 const log=[],ctx={setTransform(){},drawImage(...a){log.push(['draw',a[0],this.globalCompositeOperation,this.globalAlpha]);},globalAlpha:1,globalCompositeOperation:'source-over'};
 const frame={id:'native'},base={id:'reprojected'};
 m.composeReveal(ctx,frame,base,.4,{width:10,height:10});
 assert.deepEqual(log.map(e=>[e[1].id,e[2],e[3]]),[['native','source-over',1],['reprojected','darken',.4]]);
 assert.equal(ctx.globalCompositeOperation,'source-over');assert.equal(ctx.globalAlpha,1);
 log.length=0;m.composeReveal(ctx,frame,base,0,{width:10,height:10});assert.deepEqual(log.map(e=>e[1].id),['native'],'weight 0 shows the native frame alone');
});
// Anatomy of the turnable 3D bodies.
{
const m=await import('./mushrooms.mjs');
const body=(id,{count=1,view={yaw:.12,pitch:.36},seed='anatomy'}={})=>{const genome=generateSpecimen(seed,id),pair=m.createOrbitRestPair(genome,m.createSpecimenComposition(genome,{count}),{view});return {genome,pair,surface:m.buildConnectedAnatomySurface(pair,0)};};
const roleVertices=(member,role)=>[...new Set(member.faces.filter(f=>f.role===role).flatMap(f=>f.indices))].map(i=>member.worldVertices[i]);
const stemAt=(member,t)=>{const a=member.chart.stem(0,t),b=member.chart.stem(Math.PI,t);return {center:a.map((v,k)=>(v+b[k])/2),radius:Math.hypot(a[0]-b[0],a[1]-b[1])/2};};
test('every 3D body plan is closed, finite and carries per-family anatomy parameters',()=>{
 for(const type of MUSHROOM_TYPES){
  const {surface}=body(type.id),member=surface.members[0];
  assert.ok(member.mesh.closed,`${type.id} mesh is closed`);
  assert.ok(member.worldVertices.every(p=>p.every(Number.isFinite)),`${type.id} is finite`);
  assert.equal(surface.dimensions[0].body3d,1);
 }
});
test('a partial-veil ring skirt grows out of the stipe surface and hangs below its attachment',()=>{
 for(const id of ['amanita-1','amanita-3','parasol-1']){
  const {surface}=body(id),member=surface.members[0],p=surface.dimensions[0],veil=roleVertices(member,'veil');
  assert.ok(veil.length>50,`${id} has a ring`);
  const z0=p.height*p.ringT,{center,radius}=stemAt(member,p.ringT);
  const buried=veil.filter(q=>Math.abs(q[2]-z0)<radius&&Math.hypot(q[0]-center[0],(q[1]-center[1])/p.capDepth)<radius);
  assert.ok(buried.length>=24,`${id} ring is attached inside the stipe surface`);
  assert.ok(Math.min(...veil.map(q=>q[2]))<z0-6,`${id} skirt hangs below its attachment`);
 }
});
test('a saccate volva encloses the stipe base with a free rim, and the fly agaric has a basal bulb',()=>{
 const {surface}=body('amanita-2'),member=surface.members[0],p=surface.dimensions[0],veil=roleVertices(member,'veil');
 assert.ok(Math.min(...veil.map(q=>q[2]))<1,'volva starts at the ground');
 const rim=veil.filter(q=>q[2]>Math.max(...veil.map(v=>v[2]))*.85),{center,radius}=stemAt(member,Math.max(...rim.map(q=>q[2]))/p.height);
 assert.ok(rim.every(q=>Math.hypot(q[0]-center[0],(q[1]-center[1])/p.capDepth)>radius),'volva rim stands free of the stipe');
 const fly=body('amanita-1').surface.members[0],bulb=stemAt(fly,.1).radius,mid=stemAt(fly,.5).radius;
 assert.ok(bulb>1.5*mid,'basal bulb is wider than the stipe');
});
test('gill lines lie on the underside: hidden from above, visible from below the cap',()=>{
 const genome=generateSpecimen('anatomy','amanita-1'),composition=m.createSpecimenComposition(genome,{count:1});
 const count=pitch=>m.buildConnectedAnatomy(m.createOrbitRestPair(genome,composition,{view:{yaw:.12,pitch}}),0).ink.filter(k=>['lamellae','folds'].includes(k.role)).length;
 assert.ok(count(-.12)>40,'gills are seen at eye level');
 assert.ok(count(.85)<count(-.12)*.15,'gills do not show on the cap top');
});
test('species colour, white veil warts, honeycomb pits and zoned shelves come from the type recipe',()=>{
 const fly=m.orbitRestStudy(generateSpecimen('anatomy','amanita-1'),m.createSpecimenComposition(generateSpecimen('anatomy','amanita-1'),{count:1}),{view:{yaw:.12,pitch:.36}});
 const cap=fly.washes.find(w=>w.role==='cap');
 assert.ok(cap.palette.alizarin>.4&&cap.load>.6,'scarlet cap at full strength');
 assert.ok(cap.reserves.length>=8,'veil warts are reserved as white paper');
 const morel=m.orbitRestStudy(generateSpecimen('anatomy','morel-1'),m.createSpecimenComposition(generateSpecimen('anatomy','morel-1'),{count:1}),{view:{yaw:.12,pitch:.36}});
 assert.ok(morel.washes.some(w=>w.role==='pit-shadow'&&w.islands.length>=6),'morel pits are glazed');
 assert.ok(morel.ink.filter(k=>/pit-rib/.test(k.id)).length>=8,'morel ridges are drawn');
 const shelf=m.orbitRestStudy(generateSpecimen('anatomy','bracket-1'),m.createSpecimenComposition(generateSpecimen('anatomy','bracket-1'),{count:1}),{view:{yaw:.12,pitch:.36}});
 assert.ok(shelf.washes.some(w=>w.role==='zone-glaze')&&shelf.washes.some(w=>w.role==='wood'),'zoned shelf on its wood');
});
test('3D ink is hand drawn and anchored to the body: contacts, restatement and stable wander',()=>{
 const genome=generateSpecimen('anatomy','bolete-1'),composition=m.createSpecimenComposition(genome,{count:1});
 const ink=yaw=>m.buildConnectedAnatomy(m.createOrbitRestPair(genome,composition,{view:{yaw,pitch:.36}}),0).ink;
 const a=ink(.3);assert.deepEqual(a,ink(.3));
 const contour=a.filter(k=>k.id.includes(':silhouette:'));
 assert.ok(contour.length>=8,'outline is laid down as several nib contacts');
 assert.ok(new Set(contour.map(k=>k.width.toFixed(3))).size>3,'contact pressure varies');
 assert.ok(a.some(k=>k.id.includes(':restatement:')&&k.width<1&&k.opacity<.6),'a lighter restatement accompanies the outline');
 // A tiny turn moves every stroke only a little: the wander does not boil.
 const b=ink(.3005),stria=k=>k.id.includes('ring-edge')||k.id.includes('primary-ridge-3');
 for(const mark of a.filter(stria)){const other=b.find(k=>k.id===mark.id);if(!other||other.points.length!==mark.points.length)continue;
  assert.ok(mark.points.every((p,i)=>Math.hypot(p[0]-other.points[i][0],p[1]-other.points[i][1])<1.5));}
});
test('oyster fans grow from wood with decurrent gills in view; pear puffballs narrow into a sterile base',()=>{
 const oyster=body('oyster-1');assert.ok(oyster.surface.members[0].faces.some(f=>f.role==='wood'),'oyster has its log');
 const genome=generateSpecimen('anatomy','oyster-1'),composition=m.createSpecimenComposition(genome,{count:1});
 const gills=m.buildConnectedAnatomy(m.createOrbitRestPair(genome,composition,{view:{yaw:.12,pitch:.36}}),0).ink.filter(k=>['folds','lamellae'].includes(k.role)).length;
 assert.ok(gills>30,'gills are seen under the fan at the default view');
 const puff=body('puffball-1'),p=puff.surface.dimensions[0],c=puff.surface.members[0].chart;
 const r=s=>{const q=c.upper(0,s),o=c.upper(Math.PI,s);return Math.hypot(q[0]-o[0],q[1]-o[1])/2;};
 const widest=Math.max(...Array.from({length:21},(_,i)=>r(i/20)));
 assert.ok(r(1)<widest*.5,'head tapers to its base');assert.ok(Math.abs(r(1)-Math.hypot(...c.lower(0,1).map((v,k)=>v-c.lower(Math.PI,1)[k]))/2)<p.radius*.08,'no lip between head and base');
});
test('coral branches fork repeatedly and narrow towards blunt tips',()=>{
 const {surface}=body('coral-1'),member=surface.members[0];
 assert.ok(member.faces.filter(f=>f.role==='stem').length>3000,'many branch tubes');
});
}

test('a sampled morph frame keeps its own preview-wash field after later samples (no ghost wash)',async()=>{
 const m=await import('./mushrooms.mjs');
 const pair=m.createMorphPair(generateSpecimen('ghost-a','oyster-1'),generateSpecimen('ghost-b','agaric-1')),data=m.prepareImplicitPair(pair);
 const first=m.sampleImplicitMorph(data,0),fields=first.bodies.map(body=>Float32Array.from(body.previewWash.field));
 m.sampleImplicitMorph(data,1);m.sampleImplicitMorph(data,.5);
 first.bodies.forEach((body,i)=>assert.deepEqual(body.previewWash.field,fields[i],'a later sample changed an earlier frame’s wash field'));
 const again=m.sampleImplicitMorph(data,0);again.bodies.forEach((body,i)=>assert.deepEqual(body.previewWash.field,fields[i]));
 // At rest the plate is sketched in ink, not the coloured morph preview, so the native painting streams live.
 const painter={morphPreview(){throw new Error('coloured preview at rest');}};
 assert.equal(m.morphPreviewKind(pair),'field');
});

test('prepared plates are keyed by full identity and rejected on any mismatch',async()=>{
 const m=await import('./mushrooms.mjs');
 const request={plateKey:JSON.stringify(['genome-a',{composition:'c1'},'plain',false]),outputScale:1.75,sheet:'seed-1'};
 const job={key:m.preparedPlateKey(request),failed:false,cancelled:false};
 assert.equal(m.preparedPlateMatches(job,request),true);
 for(const change of [{plateKey:JSON.stringify(['genome-b',{composition:'c1'},'plain',false])},{plateKey:JSON.stringify(['genome-a',{composition:'c2'},'plain',false])},{outputScale:2},{sheet:'seed-2'}])
  assert.equal(m.preparedPlateMatches(job,{...request,...change}),false,JSON.stringify(change));
 assert.equal(m.preparedPlateMatches({...job,failed:true},request),false);
 assert.equal(m.preparedPlateMatches({...job,cancelled:true},request),false);
 assert.equal(m.preparedPlateMatches(null,request),false);
 assert.ok(m.PREPARED_PLATE.limit<=2&&m.PREPARED_PLATE.replayMs>=3000&&m.PREPARED_PLATE.replayMs<=5000);
});

test('URL anchors keep each member’s width stretch and lean, so a shared link reproduces the blocked plate',()=>{
 const anchors=[{x:328.5,y:691,scale:.99,rotation:-.12,stretch:.94,lean:-.15},{x:600,y:800,scale:1,rotation:.05,stretch:1.06,lean:.04}];
 const state=parseState(`?type=waxcap-1&anchors=${encodeURIComponent(JSON.stringify(anchors))}`);
 assert.deepEqual(state.compositionAnchors,anchors);
 assert.deepEqual(parseState(`?anchors=${encodeURIComponent(JSON.stringify([{x:1,y:2,scale:1,rotation:0,stretch:99,lean:5}]))}`).compositionAnchors,[{x:1,y:2,scale:1,rotation:0}]);
});

// Habitat ecology, substrate attachment and setting regression checks.
test('every catalog type has an ecology record; Laetiporus is in the catalog',async()=>{
 const m=await import('./mushrooms.mjs');
 for(const type of MUSHROOM_TYPES){
  const e=m.ecologyFor(type.id);
  assert.notEqual(e.analogue,'Unidentified',type.id);assert.ok(m.HABITAT_KINDS.includes(e.substrate),`${type.id} ${e.substrate}`);
  assert.ok(['spring','summer','autumn','winter'].includes(e.season));assert.ok(Array.isArray(e.hosts));
 }
 const sulphur=MUSHROOM_TYPES.find(t=>t.id==='bracket-6');assert.equal(m.ecologyFor('bracket-6').analogue,'Laetiporus sulphureus');assert.equal(sulphur.palette,'sulphur');
 assert.match(m.ecologyLabel(generateSpecimen('e','amanita-1')),/Amanita muscaria.*birch/);
 assert.match(m.ecologyLabel(generateSpecimen('e','amanita-3','bolete-1')),/hybrid/);
});
test('wood growers rest on their wood, attached to it, with or without the background',async()=>{
 const m=await import('./mushrooms.mjs');
 const inside=(p,poly)=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;};
 const near=(p,poly)=>{let d=Infinity;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));d=Math.min(d,Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy));}return d;};
 const wood=MUSHROOM_TYPES.filter(t=>['stump','log','branch','trunk'].includes(m.ecologyFor(t.id).substrate));
 assert.ok(wood.length>=20);
 for(const type of wood){
  const g=generateSpecimen('attach',type.id),comp=m.orbitRestComposition(g,null,{habit:true});
  assert.ok(comp.substrate,`${type.id} has wood`);assert.ok(comp.members.every(k=>k.attached),`${type.id} members attached`);
  // Habitats are opt-in: without the background nothing of the habitat is
  // drawn; with it, the catalog drawing stands by its wood (its own or new).
  assert.equal(m.habitRestPreferred(g,'plain'),false);
  if(type.grammar!=='tooth'){assert.ok(!buildStudy(g).ink.some(k=>k.role.startsWith('habitat-')));const st=buildStudy(g,{scene:'woodland'});assert.ok(st.ink.some(k=>k.role==='habitat'||k.role.startsWith('habitat-')),`${type.id} catalog drawing stands by its wood`);}
  const layer=m.buildHabitSubstrate(comp,g,[]),bodies=layer.masks;
  // Hericium hangs from the bark: its base is set out from the wood by its cushion.
  for(const k of comp.members)assert.ok(bodies.some(poly=>inside([k.x,k.y],poly)||near([k.x,k.y],poly)<(type.grammar==='tooth'?90:14)),`${type.id} ${k.id} base on the wood`);
  const pair=m.createOrbitRestPair(g,comp,{view:{yaw:.12,pitch:.36}});
  for(const scene of ['plain','woodland']){const plan=m.orbitRestStudy(g,comp,{view:{yaw:.12,pitch:.36},scene});
   assert.ok(plan.ink.some(k=>k.role.startsWith('habitat-')),`${type.id} wood ink (${scene})`);assert.ok(plan.washes.some(k=>k.role==='habitat-wood-wash'));
   assert.equal(plan.ink.some(k=>k.role.startsWith('background')),scene!=='plain');}
  // Nearer shelves hide wood lines: wood ink is depth-tested like member ink.
  const sketch=m.buildConnectedAnatomy(pair,0),woodInk=sketch.ink.filter(k=>k.role.startsWith('habitat'));assert.ok(woodInk.every(k=>k.points.every(p=>p.length===2)));
 }
});
test('background off leaves ground species unchanged; the setting follows the ecology record',async()=>{
 const m=await import('./mushrooms.mjs');
 for(const id of ['amanita-1','puffball-1','morel-1','coral-3']){
  const g=generateSpecimen('off',id),a=buildStudy(g),b=buildStudy(g,{scene:'plain'});
  assert.deepEqual(a.ink.map(k=>k.role),b.ink.map(k=>k.role));assert.ok(!a.ink.some(k=>/^(background|habitat-)/.test(k.role)));
 }
 const roles=(id,scene='woodland')=>{const g=generateSpecimen('eco',id);return new Set(buildStudy(g,{scene}).ink.map(k=>k.role));};
 const pine=roles('bolete-3');for(const r of ['background-needle','background-needle-sheath','background-cone-scale'])assert.ok(pine.has(r),r);
 const pasture=roles('agaric-1');for(const r of ['background-grass-sheath','background-grass-blade','background-clover'])assert.ok(pasture.has(r),r);
 assert.ok(roles('inkcap-5').has('background-dung-edge'));assert.ok(roles('morel-2').has('background-char'));assert.ok(roles('club-3').has('background-larva'));
 const birch=buildStudy(generateSpecimen('eco','amanita-1'),{scene:'woodland'}).ink.filter(k=>k.role==='background-leaf-midrib');
 assert.ok(birch.length&&birch.every(k=>k.species==='birch'),'Amanita muscaria under birch drops birch leaves');
 const beech=buildStudy(generateSpecimen('eco','trumpet-1'),{scene:'woodland'}).ink.filter(k=>k.role==='background-leaf-midrib');
 assert.ok(beech.some(k=>k.species==='beech')&&beech.some(k=>k.species==='oak'));
});
test('gregarious colonies share a base: tufts converge on wood, clumps fan, fairy rings recede',async()=>{
 const m=await import('./mushrooms.mjs');
 const tuft=m.orbitRestComposition(generateSpecimen('colony','agaric-4'),null,{habit:true});
 assert.equal(tuft.habit.mode,'perch');assert.ok(tuft.habit.tuft);
 const xs=tuft.members.map(k=>k.x),ys=tuft.members.map(k=>k.y);assert.ok(Math.max(...xs)-Math.min(...xs)<60&&Math.max(...ys)-Math.min(...ys)<40,'bases converge');
 assert.ok(tuft.members.some(k=>k.rotation<-.05)&&tuft.members.some(k=>k.rotation>.05),'stems fan outward');
 assert.ok(new Set(tuft.members.map(k=>k.scale.toFixed(3))).size===tuft.members.length,'members differ in size');
 const ring=m.createSpecimenComposition(generateSpecimen('colony','agaric-5'),{count:4,habit:true});assert.equal(ring.habit.mode,'ring');
 const byY=ring.members.slice().sort((a,b)=>a.y-b.y);assert.ok(byY[0].scale<byY.at(-1).scale,'farther members are smaller');
 const oyster=m.orbitRestComposition(generateSpecimen('colony','oyster-4'),null,{habit:true});assert.equal(oyster.habit.mode,'shelf');
 assert.ok(new Set(oyster.members.map(k=>Math.round(k.depth))).size>1,'tiers carry their own depth for occlusion');
});
test('habitat marks recede: farther elements are drawn thinner and paler',()=>{
 const bg=buildBackgroundStudy(generateSpecimen('recede','bolete-1'),'woodland',[[[454,490],[491,490],[484,811],[462,813]],[[735,420],[784,420],[775,825],[747,825]]]);
 const edges=bg.ink.filter(k=>k.role==='background-soil');assert.ok(edges.length>=8);
 const y=k=>k.points.reduce((s,p)=>s+p[1],0)/k.points.length,sorted=edges.slice().sort((a,b)=>y(a)-y(b)),half=Math.floor(sorted.length/2);
 const mean=(list,key)=>list.reduce((s,k)=>s+k[key],0)/list.length;
 assert.ok(mean(sorted.slice(0,half),'opacity')<mean(sorted.slice(half),'opacity'));assert.ok(mean(sorted.slice(0,half),'width')<mean(sorted.slice(half),'width'));
 const ground=bg.washes.find(k=>k.role==='background-ground-wash');assert.ok(ground.islands.length>10,'dry-brush streaks at the rim');
 assert.ok(bg.washes.some(k=>k.role==='background-ground-mid')&&bg.washes.some(k=>k.role==='background-ground-band'),'nested earth washes');
 assert.ok(!bg.washes.some(k=>/cast-shadow/.test(k.role)),'no offset cast-shadow silhouettes');
});

test('with the background off, beta plates carry nothing of the habitat (live-identical)',async()=>{
 const m=await import('./mushrooms.mjs');
 for(const id of m.BETA_TYPES.filter(id=>MUSHROOM_TYPES.some(t=>t.id===id))){
  const g=generateSpecimen('opt-in',id),c=m.createSpecimenComposition(g);
  assert.ok(!c.habit&&!c.substrate&&c.members.every(k=>!k.attached&&!k.barkClip&&k.yaw===undefined&&k.depth===undefined),`${id} composition`);
  assert.equal(m.habitRestPreferred(g,'plain'),false);assert.deepEqual(m.orbitRestComposition(g),m.orbitRestComposition(g,null,{habit:false}));
  const plain=buildStudy(g);assert.ok(!plain.habitatSetting&&!plain.ink.some(k=>/^(background|habitat-)/.test(k.role))&&!plain.washes.some(k=>/^(background|habitat-)/.test(k.role??'')),`${id} plain plate`);
 }
 assert.ok(!m.randomTypePool().some(t=>t.id==='bracket-6')&&!m.randomTypePool(true).some(t=>t.id==='bracket-6'),'habitat-only type is never a random destination');
});
test('habitat ground washes go down as one flat first pass; plates without a background keep their passages',async()=>{
 const m=await import('./mushrooms.mjs');
 for(const id of ['amanita-1','bolete-1','oyster-1']){
  const g=generateSpecimen('flat-ground',id),plain=m.planNativePassages(buildStudy(g)),wood=m.planNativePassages(buildStudy(g,{scene:'woodland'}));
  assert.ok(plain.every(p=>!p.flat&&p.id!=='Ground wash'),`${id} plain has no flat pass`);
  assert.equal(wood[0].flat,true);assert.equal(wood[0].id,'Ground wash');
  assert.ok(wood[0].marks.length>0&&wood[0].marks.every(k=>m.NATIVE_FLAT_GROUND.test(k.role)),`${id} flat pass holds only background washes`);
  assert.ok(wood.slice(1).every(p=>p.marks.every(k=>!/^background-ground/.test(k.role))),`${id} ground washes are not repainted wet`);
 }
});

test('turned 3D bodies are drawn as pen lines by default; texture reprojection is opt-in',async()=>{
 const m=await import('./mushrooms.mjs');
 assert.equal(m.ORBIT_DRAG_DISPLAY,'lines');
 assert.equal(m.orbitLineClass('cap-contour'),'contour');assert.equal(m.orbitLineClass('stem-contour'),'contour');assert.equal(m.orbitLineClass('ring'),'contour');
 assert.equal(m.orbitLineClass('folds'),'feature');assert.equal(m.orbitLineClass('teeth'),'feature');
 assert.equal(m.orbitLineClass('fibres'),'hatch');assert.equal(m.orbitLineClass('cap-fibres'),'hatch');
 // The drag drawing comes from the turned body's own hidden-line-removed ink.
 const genome=generateSpecimen('lines-a','amanita-1'),comp=m.orbitRestComposition(genome);
 const front=m.buildMorphSketch(m.createOrbitRestPair(genome,comp,{view:{yaw:.12,pitch:.36},shapeModifiers:{capDepth:1,stemBend:0}}),0,{inkOnly:true,interactive:true});
 const side=m.buildMorphSketch(m.createOrbitRestPair(genome,comp,{view:{yaw:1.4,pitch:.36},shapeModifiers:{capDepth:1,stemBend:0}}),0,{inkOnly:true,interactive:true});
 assert.ok(front.ink.length>20&&side.ink.length>20);assert.notDeepEqual(front.ink.map(m=>m.points),side.ink.map(m=>m.points));
 assert.ok(front.ink.some(mark=>m.orbitLineClass(mark.role)==='contour'));
});

test('a drag re-projects cached world geometry: the turned drawing equals a fresh build',async()=>{
 const m=await import('./mushrooms.mjs');
 for(const [seed,id] of [['cmp','morel-1'],['cmp','oyster-1'],['native-proof-20261019','amanita-1']]){
  const g=generateSpecimen(seed,id),rest=m.orbitRestComposition(g);
  const at=yaw=>m.buildMorphSketch(m.createOrbitRestPair(g,rest,{view:{yaw,pitch:.36},shapeModifiers:{capDepth:1,stemBend:0}}),0,{inkOnly:true,interactive:true});
  m.clearOrbitWorldCache();const fresh=JSON.stringify(at(1.1));
  m.clearOrbitWorldCache();at(.3);assert.equal(JSON.stringify(at(1.1)),fresh,`${id} cached turn`);
 }
});

test('drag contours stay whole at a grazing edge and are still hidden behind a nearer surface',async()=>{
 const m=await import('./mushrooms.mjs');
 // A near square (depth 0) and a steep slope beside it: depth rises 40 per 5 px.
 const near={faces:[{visible:true,projected:[[100,100,0],[300,100,0],[300,300,0],[100,300,0]]}]};
 const slope={faces:[{visible:true,projected:[[400,100,0],[500,100,800],[500,300,800],[400,300,0]]}]};
 const v=m.connectedPreviewVisibility([near,slope]);
 assert.equal(v.visible([200,200,60]),false);assert.equal(v.visibleContour([200,200,60]),false,'behind a nearer body');
 assert.equal(v.visibleContour([302,200,60]),true,'beside the body, over paper');
 const onSlope=[452,200,416];assert.equal(v.visibleContour(onSlope),true,'on its own grazing surface');
 assert.equal(v.visibleContour([1300,200,0]),false,'off the sheet');
});

test('parallel wash frames: row bands compose exactly the pixels of one full compose',async()=>{
 const m=await import('./mushrooms.mjs');
 const ow=96,oh=80,w=24,h=20,ink=new Uint8ClampedArray(ow*oh*4);
 for(let i=0;i<ink.length;i+=4){ink[i]=230-(i/4)%37;ink[i+1]=220-(i/4)%29;ink[i+2]=200-(i/4)%17;ink[i+3]=255;}
 const R=new Float32Array(w*h*3),B=new Float32Array(w*h*3),T=new Float32Array(w*h*3).fill(1);
 for(let i=0;i<w*h*3;i++){const x=Math.floor(i/3)%w,y=Math.floor(i/3/w);if(x>5&&x<18&&y>4&&y<15){R[i]=.2+.02*(i%7);T[i]=.6-.01*(i%5);}}
 const coverage=new Uint8Array(ow*oh),regions=new Int32Array(ow*oh).fill(-1);
 for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){const inside=x>26&&x<70&&y>18&&y<58;coverage[y*ow+x]=inside?255:0;regions[y*ow+x]=inside?1:-1;}
 const options={coverage,regions,settling:m.nativePaperSettling()},fields={R,B,T};
 const full=m.composeNativePixels(ink,ow,oh,fields,w,h,undefined,options);
 const target=new Uint8ClampedArray(ink);for(const rows of [[0,23],[23,51],[51,80]])m.composeNativePixels(ink,ow,oh,fields,w,h,undefined,{...options,rows,target});
 assert.deepEqual(target,full);
 assert.deepEqual(m.nativeSnapDiff(full,full),{snapMaxDiff:0,snapOver1:0});
 assert.ok(m.NATIVE_COMPOSED_FRAME_MS>=200&&m.PREPARED_PLATE.frameQuality>=.9);
});

// Wikipedia links under the specimen title.
test('every catalog type has a verified Wikipedia link entry',async()=>{
 const m=await import('./mushrooms.mjs');
 assert.deepEqual(Object.keys(m.TAXON_LINKS).sort(),MUSHROOM_TYPES.map(t=>t.id).sort());
 for(const type of MUSHROOM_TYPES){
  const link=m.taxonLink(type.id);
  assert.ok(link,type.id);assert.ok(['species','genus'].includes(link.rank),type.id);
  assert.match(link.href,/^https:\/\/en\.wikipedia\.org\/wiki\/[A-Za-z_()%-]+$/,type.id);
  if(link.rank==='species')assert.match(link.taxon,/^[A-Z][a-z]+ [a-z-]+$/,type.id);else assert.match(link.taxon,/^[A-Z][a-z]+$/,type.id);
 }
 for(const id of ['amanita-1','amanita-3','bolete-1','oyster-1','tooth-1','bracket-6'])assert.equal(m.taxonLink(id).rank,'species',id);
 assert.equal(m.taxonLink('amanita-1').href,'https://en.wikipedia.org/wiki/Amanita_muscaria');
 assert.equal(m.taxonLink('amanita-3').taxon,'Amanita phalloides');
 assert.equal(m.taxonLink('bracket-6').taxon,'Laetiporus sulphureus');
 assert.equal(m.taxonLink('waxcap-1').label,'Hygrocybe (genus)');
 // The bare genus titles for these are not the fungus.
 assert.equal(m.taxonLink('earthstar-4').href,'https://en.wikipedia.org/wiki/Astraeus_(fungus)');
 assert.equal(m.taxonLink('nest-2').href,'https://en.wikipedia.org/wiki/Crucibulum_(fungus)');
 assert.equal(m.taxonLink('nope-1'),null);
});
test('the link line names one type, both hybrid parents, or both morph ends',async()=>{
 const m=await import('./mushrooms.mjs');
 const one=m.specimenLinkParts(generateSpecimen('links','amanita-1'));
 assert.equal(one.kind,'single');assert.equal(one.links[0].taxon,'Amanita muscaria');assert.equal(one.links[0].label+one.suffix,'Amanita muscaria on Wikipedia ↗');
 const [host,donor]=(()=>{for(const a of MUSHROOM_TYPES)for(const b of MUSHROOM_TYPES)if(a.id!==b.id&&m.taxonLink(a.id).href!==m.taxonLink(b.id).href&&compatibleHybrid(a.id,b.id).ok)return [a.id,b.id];return [];})();
 assert.ok(host,'some compatible hybrid exists');
 const hybrid=m.specimenLinkParts(generateSpecimen('links',host,donor));
 assert.equal(hybrid.kind,'hybrid');assert.equal(hybrid.prefix,'Hybrid of ');assert.equal(hybrid.joiner,' × ');
 assert.deepEqual(hybrid.links.map(l=>l.href),[m.taxonLink(host).href,m.taxonLink(donor).href]);
 const morph=m.specimenLinkParts({profileId:'amanita-1',correspondence:true,sourceProfileId:'amanita-1',targetProfileId:'bolete-1'});
 assert.equal(morph.kind,'morph');assert.equal(morph.joiner,' → ');assert.deepEqual(morph.links.map(l=>l.taxon),['Amanita muscaria','Boletus edulis']);
 // Two types that share a genus page collapse to one link.
 assert.equal(m.specimenLinkParts({correspondence:true,sourceProfileId:'oyster-2',targetProfileId:'oyster-3'}).kind,'single');
 assert.equal(m.specimenLinkParts(null),null);assert.equal(m.specimenLinkParts({profileId:'nope-1'}),null);
});

test('loop pause is a URL setting: 6 s by default, 2 to 20 s',()=>{
 assert.equal(parseState('?type=amanita-1').loopPause,6);
 assert.equal(parseState('?type=amanita-1&dwell=12').loopPause,12);
 assert.equal(parseState('?type=amanita-1&dwell=99').loopPause,20);assert.equal(parseState('?type=amanita-1&dwell=1').loopPause,2);
});

test('touch: two fingers landing together pinch without a turn; a double tap fits the plate',async()=>{
  let starts=0,turns=0,fits=0;const f=zoomFixture({onOrbitStart:()=>starts++,onOrbit:()=>turns++,onFit:()=>fits++});f.controller.setOrbitEnabled(true);
  f.event(f.viewport,'pointerdown',{pointerType:'touch',pointerId:1,clientX:300,clientY:260});
  f.event(f.viewport,'pointermove',{pointerId:1,clientX:302,clientY:261});
  f.event(f.viewport,'pointerdown',{pointerType:'touch',pointerId:2,clientX:420,clientY:260});
  f.event(f.viewport,'pointermove',{pointerId:2,clientX:520,clientY:260});
  assert.equal(starts,0);assert.equal(turns,0);assert.equal(f.viewport.dataset.viewportGesture,'pinch');assert.ok(f.controller.getState().scale>1);
  f.event(f.viewport,'pointerup',{pointerId:2,pointerType:'touch'});f.event(f.viewport,'pointerup',{pointerId:1,pointerType:'touch'});
  assert.equal(starts,0);assert.ok(f.controller.getState().scale>1);
  for(const t of [1000,1150]){f.event(f.viewport,'pointerdown',{pointerType:'touch',pointerId:3,clientX:300,clientY:260});f.event(f.viewport,'pointerup',{pointerType:'touch',pointerId:3,clientX:300,clientY:260});}
  assert.equal(f.controller.getState().scale,1);assert.equal(fits,1);assert.equal(starts,0);f.controller.destroy();
});

test('the plate genus label is the same with the background on or off',async()=>{
 const m=await import('./mushrooms.mjs');
 for(const id of m.BETA_TYPES){const g=generateSpecimen('genus-label',id);assert.equal(m.plateGenusLabel(g,{habitat:true}),m.plateGenusLabel(g,{habitat:false}),id);}
 // The label follows each type's model species (its ecology record).
 assert.equal(m.plateGenusLabel(generateSpecimen('genus-label','agaric-4')),'Armillaria sp.');
 assert.equal(m.plateGenusLabel(generateSpecimen('genus-label','bracket-6')),'Laetiporus sp.');
 assert.equal(m.plateGenusLabel(generateSpecimen('genus-label','amanita-1')),'Amanita sp.');
});

test('scattered and gregarious finds: at most 3 members, none overlapping the main figure',async()=>{
 const m=await import('./mushrooms.mjs');
 const types=m.BETA_TYPES.filter(id=>m.OPEN_HABITS.includes(generateSpecimen('crowd',id).phenotype?.growthHabit));
 assert.ok(types.includes('amanita-1')&&types.includes('bolete-1')&&types.includes('puffball-1'));
 for(const id of types)for(const seed of ['crowd-a','crowd-b','crowd-c','crowd-d','crowd-e','crowd-f']){
  // The plate the page builds for this seed (count from the habit, blocked anchors).
  const g=generateSpecimen(seed,id),count=m.seedSpecimenCount(g,m.buildSketch(g).specimenCount);assert.ok(count<=3,`${id} ${seed} count ${count}`);
  if(count<2)continue;
  const {composition,endpointsA}=m.implicitAnchoredComposition(g,m.createSpecimenComposition(g,{count}));
  // Connected charts (chanterelle, oyster) keep their own fixed slots.
  if(endpointsA.some(e=>e.chart))continue;
  if(m.OPEN_HABIT_KEEP.includes(g.phenotype?.grammar))continue;
  const boxes=endpointsA.map((e,i)=>{const at=composition.members[i],L=m.memberLinear(at,at.scale),pts=e.polygons.flat().map(p=>[at.x+L.a*p[0]+L.b*p[1],at.y+L.d*p[1]]);const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);return {i,x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};});
  const main=boxes.reduce((a,b)=>b.w*b.h>a.w*a.h?b:a),pad=2;
  for(const b of boxes){if(b===main)continue;
   const overlap=b.x<main.x+main.w-pad&&b.x+b.w>main.x+pad&&b.y<main.y+main.h-pad&&b.y+b.h>main.y+pad;
   assert.ok(!overlap,`${id} ${seed}: member ${b.i} overlaps the main figure`);}
 }
});


test('a live painting\'s paced waits and shown frames do not count against the drying time limit', async () => {
  const {simulateNativePassages,NATIVE_PAINT_LIMITS}=await import('./mushrooms.mjs');
  // The brush's pace alone (2.5 s) and slow frames run past a 1 s limit; the work itself does not.
  const result=await simulateNativePassages(tinyNativeStudy(),{width:48,seed:17,yieldWork:async()=>{},travelMs:2500,checkpointIntervalMs:0,
    onCheckpoint:async()=>new Promise(r=>setTimeout(r,2)),limits:{...NATIVE_PAINT_LIMITS,maxMs:1000}});
  assert.equal(result.complete,true);assert.equal(result.water,0);assert.ok(result.elapsedMs>2500);
});

test('the repaint after a turn lays its ink almost at once and its washes unpaced',async()=>{
  const {settlePacing,NATIVE_PACING}=await import('./mushrooms.mjs');
  assert.deepEqual(settlePacing(),{inkMs:NATIVE_PACING.inkMs,depositMs:NATIVE_PACING.depositMs});
  const turned=settlePacing({turned:true});assert.equal(turned.depositMs,0);assert.ok(turned.inkMs<=NATIVE_PACING.inkMs/4);
  assert.equal(turned.passageFramesOnly,true,'a turned repaint shows each dried passage, not every stroke');
});

test('Paint playback pacing follows brush travel and stays inside its bounds', async () => {
  const {nativePlaybackPacing,PLAYBACK}=await import('./mushrooms.mjs');
  assert.deepEqual(nativePlaybackPacing({}),{inkMs:PLAYBACK.ink.minMs,washMs:PLAYBACK.wash.minMs});
  assert.deepEqual(nativePlaybackPacing({inkLength:1e9,washMm:1e9}),{inkMs:PLAYBACK.ink.maxMs,washMs:PLAYBACK.wash.maxMs});
  const mid=nativePlaybackPacing({inkLength:12500,washMm:7200});
  assert.equal(mid.inkMs,5000);assert.equal(mid.washMs,16000);
  assert.ok(PLAYBACK.ink.minMs+PLAYBACK.wash.minMs>=15000&&PLAYBACK.ink.maxMs+PLAYBACK.wash.maxMs<=32000,'a plate plays in roughly 20 to 40 s with drying');
});

test('wide washes are laid as overlapping brush-wide passes, top to bottom, turning back each time', async () => {
  const {nativeWashPasses,WASH_PASSES}=await import('./mushrooms.mjs');
  const narrow={path:[{x:0,y:0,r:20},{x:100,y:0,r:20}]};
  assert.deepEqual(nativeWashPasses([narrow]),[narrow],'a brush-sized stroke is untouched');
  const wide={load:.4,path:[{x:0,y:500,r:200},{x:400,y:500,r:200},{x:800,y:500,r:200}]},passes=nativeWashPasses([wide]);
  assert.ok(passes.length>=4);
  for(const pass of passes){assert.equal(pass.load,.4);assert.ok(pass.path.every(q=>q.r<=WASH_PASSES.maxRadius));}
  const ys=passes.map(p=>p.path[0].y);assert.deepEqual([...ys].sort((a,b)=>a-b),ys,'top to bottom');
  assert.equal(ys[0],500-(200-WASH_PASSES.maxRadius));assert.equal(ys.at(-1),500+(200-WASH_PASSES.maxRadius));
  for(let k=1;k<ys.length;k++)assert.ok(ys[k]-ys[k-1]<=2*WASH_PASSES.maxRadius*(1-WASH_PASSES.overlap)+1e-9,'neighbouring passes overlap');
  assert.ok(passes[0].path[0].x<passes[0].path.at(-1).x&&passes[1].path[0].x>passes[1].path.at(-1).x,'each pass turns back');
  // Passes are trimmed to the shape's box.
  const shape=[[300,300],[500,300],[500,700],[300,700]],trimmed=nativeWashPasses([wide],{shape});
  for(const pass of trimmed)assert.ok(pass.path.length<wide.path.length+1&&pass.path.some(q=>q.x>=300-q.r&&q.x<=500+q.r));
});

test('Paint playback paces the brush and a skip lands on the same sheet', async () => {
  const {simulateNativePassages,nativeWashTravel,planNativePassages}=await import('./mushrooms.mjs');
  const finals=[];const run=async opts=>{let layers;const started=performance.now();await simulateNativePassages(tinyNativeStudy(),{width:48,seed:23,yieldWork:async()=>{},onCheckpoint:async p=>{if(p.complete)layers=p.sheet.layers.map(l=>l.map(a=>Array.from(a)));},...opts});finals.push(layers);return performance.now()-started;};
  assert.ok(nativeWashTravel(planNativePassages(tinyNativeStudy()))>0);
  const fast=await run({});const paced=await run({travelMs:600});let calls=0;const skipped=await run({travelMs:60000,skipPacing:()=>++calls>3});
  assert.ok(paced>=fast+400,`paced ${paced} vs ${fast}`);assert.ok(skipped<10000,'a skip drops the waits');
  assert.deepEqual(finals[1],finals[0]);assert.deepEqual(finals[2],finals[0]);
});

test('live painting starts from blank paper: the first checkpoint holds no pigment', async () => {
  const {simulateNativePassages}=await import('./mushrooms.mjs');const {totals}=await import('../lab/media/sheet.js');
  const pig=[];await simulateNativePassages(tinyNativeStudy(),{width:48,seed:29,yieldWork:async()=>{},travelMs:100,checkpointIntervalMs:0,onBrush:({sheet})=>pig.push(totals(sheet).pig.reduce((a,b)=>a+b,0))});
  assert.ok(pig.length>4);assert.ok(pig[0]<pig.at(-1)*.5,'the wash builds up pass by pass');
});

test('Full painting is the default and persists; Fast is opt in', () => {
  assert.equal(parseState('').paint,'full');assert.equal(parseState('?paint=fast').paint,'fast');assert.equal(parseState('?paint=bogus').paint,'full');
});

test('habitat Auto is the default scene choice and suits each mushroom', async () => {
  const m=await import('./mushrooms.mjs');
  assert.equal(m.HABITAT_CHOICES[0],'auto');
  for(const [id,scene] of [['oyster-1','fallen-log'],['agaric-4','fallen-log'],['bracket-1','fallen-log'],['tooth-1','fallen-log'],['waxcap-1','woodland'],['amanita-1','woodland'],['chanterelle-1','moss-bank'],['hedgehog-1','moss-bank'],['puffball-1','woodland']])
    assert.equal(m.autoHabitatScene(id),scene,id);
  for(const type of MUSHROOM_TYPES)assert.ok(BACKGROUND_SCENES.includes(m.autoHabitatScene(type.id))&&m.autoHabitatScene(type.id)!=='plain');
  const off=parseState('?type=oyster-1');assert.equal(off.selectedScene,'auto');assert.equal(off.background,false);assert.equal(off.scene,'plain');
  const on=parseState('?type=oyster-1&scene=auto&background=1');assert.equal(on.scene,'fallen-log');
  assert.equal(parseState('?type=oyster-1&scene=woodland').scene,'plain','a scene alone leaves the background off');
  assert.equal(parseState('?type=oyster-1&scene=moss-bank&background=1').scene,'moss-bank','a fixed scene still wins');
  // Auto follows the plate a morph lands on.
  const landed=m.advanceMorphState({...parseState('?type=amanita-1&nextType=oyster-1&scene=auto&background=1')},'next-seed');
  assert.equal(landed.typeId,'oyster-1');assert.equal(landed.scene,'fallen-log');
  const plain=m.advanceMorphState({...parseState('?type=amanita-1&nextType=oyster-1')},'next-seed');assert.equal(plain.scene,'plain');
});

test('the page has no view controls; the habitat select offers Auto first; the painting toggle is there', async () => {
  const {readFileSync}=await import('node:fs');const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
  for(const id of ['zoom-in','zoom-out','zoom-fit','zoom-value','zoom-help','viewport-rotate','viewport-pan','view-yaw','view-pitch'])assert.ok(!html.includes(`id="${id}"`),id);
  assert.ok(!/>View</.test(html)&&!/>Turn</.test(html)&&!/>View angle</.test(html));
  for(const id of ['shape-depth','shape-bend','duration','loop-pause','paint-full','paint-fast'])assert.ok(html.includes(`id="${id}"`),id);
  const options=[...html.match(/<select id="scene">(.*?)<\/select>/)[1].matchAll(/value="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(options,['plain','auto','woodland','leaf-litter','moss-bank','fallen-log']);
});

test('Paint cursor maps ink marks to Paint Lab pen and pencil states', async () => {
  const {nativeInkCursor,cursorSizeForWidthMm,PLAYBACK,PLAYBACK_CURSOR}=await import('./mushrooms.mjs');
  const mark={role:'cap-contour',width:2,points:[[100,200],[300,200],[300,400]]};
  const half=nativeInkCursor(mark,.5);
  assert.equal(half.tool,'pen');assert.deepEqual([half.x,half.y],[300,200]);assert.deepEqual([half.hx,half.hy],[1,0]);
  const late=nativeInkCursor(mark,.75);assert.deepEqual([late.x,late.y,late.hx,late.hy],[300,300,0,1]);
  assert.deepEqual([nativeInkCursor(mark,0).x,nativeInkCursor(mark,1).y],[100,400]);
  assert.equal(late.w,1200);assert.equal(late.dpi,PLAYBACK_CURSOR.dpi);assert.ok(Math.abs(1200/late.dpi*25.4-PLAYBACK.plateMm)<1e-9);
  assert.equal(nativeInkCursor({...mark,role:'construction'},.5).tool,'pencil');
  assert.equal(nativeInkCursor({points:[]},.5),null);
  // Paint Lab's nib and point sums (ui/cursor.js) turn the size back into the mark's width.
  const nibMm=s=>((0.6+(s/2/25.4)*60*0.08)/60)*25.4,pointMm=s=>((0.5+(s/2/25.4)*60*0.05)*2/60)*25.4;
  for(const mm of [.5,.8,1.5]){assert.ok(Math.abs(nibMm(cursorSizeForWidthMm('pen',mm))-mm)<1e-9);assert.ok(Math.abs(pointMm(cursorSizeForWidthMm('pencil',mm))-mm)<1e-9);}
  assert.ok(Math.abs(nibMm(half.sizeMm)-2*PLAYBACK.plateMm/1200)<1e-9,'nib is the mark width on the plate');
});

test('Paint cursor maps the brush in hand to Paint Lab brush state, and fades wide brushes', async () => {
  const {nativeBrushCursor,pigmentSwatch,paintCursorOpacity,PLAYBACK,PLAYBACK_CURSOR}=await import('./mushrooms.mjs');
  const {createBrush,dip}=await import('../lab/media/brush.js');
  const brush=createBrush({radius:6,bristles:20,capacity:20});dip(brush,{water:.7,conc:[.15]});
  const c=nativeBrushCursor(brush,{x:150,y:60,p:.6},{x:0,y:1},{sheetW:300,palette:{ochre:1}});
  assert.equal(c.tool,'round');assert.equal(c.model,'row');assert.equal(c.flat,false);
  assert.deepEqual([c.x,c.y,c.hx,c.hy,c.p],[600,240,0,1,.6]);
  assert.equal(c.w,PLAYBACK_CURSOR.w);assert.ok(Math.abs(c.sizeMm-12*PLAYBACK.plateMm/300)<1e-9);
  assert.ok(Math.abs((c.sizeMm/2/25.4)*c.dpi-6*1200/300)<1e-9,'cursor radius is the brush radius in plate units');
  assert.equal(c.sat.length,brush.hairs.length);assert.ok(c.sat.every(s=>s>=0&&s<=1.0001));
  assert.equal(c.colour,pigmentSwatch({ochre:1}));assert.equal(pigmentSwatch({}),PLAYBACK.inkColour);
  assert.equal(nativeBrushCursor(null,{x:0,y:0},null,{sheetW:300}),null);
  assert.equal(paintCursorOpacity(0),1);assert.equal(paintCursorOpacity(10),1);
  assert.ok(paintCursorOpacity(48)<paintCursorOpacity(20));assert.equal(paintCursorOpacity(1000),.35);
});

test('Paint playback streams partial strokes: the sheet changes segment by segment', async () => {
  const {simulateNativePassages,nativeBrushCursor}=await import('./mushrooms.mjs');
  const {totals}=await import('../lab/media/sheet.js');
  const seen=[];
  const result=await simulateNativePassages(tinyNativeStudy(),{width:48,seed:17,yieldWork:async()=>{},onBrush:({brush,segment,lifted,palette,sheet})=>{
    seen.push({lifted,len:segment.length,pig:totals(sheet).pig.reduce((a,b)=>a+b,0),cursor:nativeBrushCursor(brush,segment.at(-1),{x:1,y:0},{sheetW:sheet.w,palette})});
  }});
  assert.equal(result.complete,true);
  const strokes=seen.filter(s=>s.lifted).length;
  assert.equal(strokes,result.strokes);assert.ok(seen.length>2*strokes,'each stroke reaches the page in several segments');
  assert.ok(seen.every(s=>s.len>0&&s.cursor&&s.cursor.tool==='round'));
  // Pigment goes down progressively within the first stroke, before it lifts.
  const first=seen.slice(0,seen.findIndex(s=>s.lifted)+1);
  assert.ok(first.length>2);assert.ok(first[0].pig>0&&first[0].pig<first.at(-1).pig);
});

test('Paint playback patches compose the same fields as the whole sheet', async () => {
  const {simulateNativePassages,nativeWindowLayers,nativeOpticalFields,nativeReconstructFields,nativePatchRect}=await import('./mushrooms.mjs');
  let checked=0;
  await simulateNativePassages(tinyNativeStudy(),{width:48,seed:17,yieldWork:async()=>{},onBrush:({sheet})=>{
    if(checked++!==3)return;
    const n=sheet.n??sheet.w*sheet.h,whole=nativeOpticalFields([...sheet.layers,sheet.pigments.map((_,k)=>Float32Array.from({length:n},(_,i)=>sheet.G[k][i]+sheet.D[k][i]+sheet.P[k][i]))],sheet.pigments,n);
    const full=nativeReconstructFields(whole,sheet.w,sheet.h);
    const win={x0:9,y0:7,x1:30,y1:25},ww=22,wh=19,part=nativeOpticalFields(nativeWindowLayers(sheet,win),sheet.pigments,ww*wh);
    for(let y=0;y<wh;y++)for(let x=0;x<ww;x++)for(const key of ['R','B','T'])for(let c=0;c<3;c++)
      assert.ok(Math.abs(part[key][(y*ww+x)*3+c]-whole[key][((win.y0+y)*sheet.w+win.x0+x)*3+c])<1e-6);
    const recon=nativeReconstructFields(part,ww,wh);
    for(let y=1;y<wh-1;y++)for(let x=1;x<ww-1;x++)for(const key of ['R','B','T'])for(let c=0;c<3;c++)
      assert.ok(Math.abs(recon[key][(y*ww+x)*3+c]-full[key][((win.y0+y)*sheet.w+win.x0+x)*3+c])<1e-6,'window interior matches the whole sheet');
  }});
  assert.ok(checked>3);
  assert.deepEqual(nativePatchRect({x0:0,y0:0,x1:9,y1:4},100,50,1200,600),{x:0,y:0,w:120,h:60});
  assert.deepEqual(nativePatchRect({x0:95,y0:45,x1:120,y1:60},100,50,1200,600),{x:1140,y:540,w:60,h:60});
  assert.deepEqual(nativePatchRect({x0:3,y0:2,x1:3,y1:2},7,5,10,10),{x:4,y:4,w:2,h:2});
});

test('Hericium erinaceus is one rounded mass whose lower body is spines',async()=>{
 const study=buildStudy(generateSpecimen('woodland-042','tooth-1')),teeth=study.ink.filter(k=>k.role==='teeth');
 assert.ok(teeth.length>500,`${teeth.length} spines`);
 const tops=teeth.map(k=>Math.min(...k.points.map(p=>p[1]))),bottoms=teeth.map(k=>Math.max(...k.points.map(p=>p[1])));
 const y0=Math.min(...tops),y1=Math.max(...bottoms);
 assert.ok(tops.filter(y=>y<y0+(y1-y0)*.35).length>teeth.length*.2,'spines spring from high on the body, not only from a rim');
 // Spines that spring lower hang longer: short on the shoulder, long in the fringe.
 const len=teeth.map((k,i)=>bottoms[i]-tops[i]),mt=tops.reduce((a,b)=>a+b)/tops.length,ml=len.reduce((a,b)=>a+b)/len.length;
 let sxy=0,sxx=0,syy=0;tops.forEach((t,i)=>{sxy+=(t-mt)*(len[i]-ml);sxx+=(t-mt)**2;syy+=(len[i]-ml)**2;});
 assert.ok(sxy/Math.sqrt(sxx*syy)>.15,'spine length grows down the body');
 assert.equal(study.ink.filter(k=>k.role==='cap-contour').length,0,'a spine mass has no hard outline');
});

test('the hedgehog stem runs up into its cap instead of stopping short in a flat cut',async()=>{
 const {buildGeometry}=await import('./mushrooms.mjs');
 for(const seed of ['1354655151','812471376','woodland-042','a','b']){
  const g=buildGeometry(generateSpecimen(seed,'hedgehog-1')),top=Math.min(...g.stem.map(p=>p[1]));
  const i=Math.round((g.centerAt(1)-g.cx)/g.w*40+40),lip=g.lower[80-i][1];
  assert.ok(lip-top>=3,`${seed}: stem top ${top.toFixed(1)} must reach above the cap's lower lip ${lip.toFixed(1)}`);
 }
 // The bolete keeps its own stem top.
 const bolete=buildGeometry(generateSpecimen('woodland-042','bolete-1'));assert.equal(new Set(bolete.stem.filter(p=>p[1]<Math.min(...bolete.stem.map(q=>q[1]))+.5).map(p=>p[1])).size,1);
});

test('the hedgehog cap margin is cap tissue down to the spines, with no bare paper band',async()=>{
 const {buildStudy}=await import('./mushrooms.mjs');
 for(const seed of ['1354655151','812471376','woodland-042']){
  const washes=buildStudy(generateSpecimen(seed,'hedgehog-1')).washes,count=role=>washes.filter(w=>w.role===role).length;
  assert.ok(count('flesh')>=1,`${seed}: the margin band takes a wash`);assert.ok(count('gill-face')>=1,`${seed}: the underside wash runs up to the rim`);
  const rim=washes.find(w=>w.role==='flesh'),cap=washes.find(w=>w.role==='cap');
  assert.deepEqual(Object.keys(rim.palette).sort(),Object.keys(cap.palette).sort(),'the margin is painted in the cap colour');
 }
 const bolete=buildStudy(generateSpecimen('woodland-042','bolete-1')).washes;assert.equal(bolete.filter(w=>w.role==='flesh'||w.role==='gill-face').length,0,'the bolete keeps its own margin');
});

test('bracket shelves show a painted thick margin over the pores, not a doubled outline',async()=>{
 const {buildStudy}=await import('./mushrooms.mjs');
 for(const [type,seed] of [['bracket-1','257048932'],['bracket-1','815892273'],['bracket-6','457071754']]){
  const study=buildStudy(generateSpecimen(seed,type));
  assert.equal(study.ink.filter(m=>m.role==='cap-flesh').length,0,`${type}: no extra line inset inside the rim`);
  assert.ok(study.washes.filter(w=>w.role==='underside').length>=1,`${type}: the band between rim and pore edge is painted`);
 }
 // Oyster fans keep their own gill sides.
 const oyster=buildStudy(generateSpecimen('woodland-042','oyster-1'));assert.ok(oyster.washes.length>0);
});

test('milkcap gills run from the margin to the stem instead of meeting in one point',async()=>{
 const {buildStudy}=await import('./mushrooms.mjs');
 for(const seed of ['1640445019','1689370685','woodland-042']){
  const gills=buildStudy(generateSpecimen(seed,'milkcap-1')).ink.filter(m=>m.role==='gills'&&Number.isInteger(m.individual)?m.individual===0:m.role==='gills');
  assert.ok(gills.length>40,`${seed}: gills are drawn`);
  // Of each gill, the end nearer the plate's centre line: on the old fan these met at one point.
  const ends=gills.map(m=>m.points[0][1]<m.points.at(-1)[1]?m.points.at(-1):m.points[0]),cx=ends.reduce((s,p)=>s+p[0],0)/ends.length,cy=ends.reduce((s,p)=>s+p[1],0)/ends.length;
  const crowded=ends.filter(([x,y])=>Math.hypot(x-cx,y-cy)<4).length;
  assert.ok(crowded<=gills.length*.1,`${seed}: ${crowded} of ${gills.length} gill ends meet in one point`);
  assert.equal(gills.filter(m=>m.role==='gills'&&m.points.length<12).length,0,'no stray fork lines');
 }
});

test('a painter builds its paper and ink textures only when first used',async()=>{
 const {Painter}=await import('./mushrooms.mjs');
 const canvas={getContext:()=>({})},lazy=new Painter(canvas);
 assert.equal(lazy.hasPaper(),false,'no paper raster on construction (the page adopts the Worker\'s copy)');
 assert.equal(Object.hasOwn(lazy,'_inkPaper'),false,'no ink texture on construction');
 const sheet={width:1200,height:1000},given=new Painter(canvas,{paper:sheet});
 assert.equal(given.hasPaper(),true);assert.equal(given.paper,sheet);assert.equal(given.adoptPaper({width:1,height:1}),false,'a painter keeps the paper it has');
});

test('the morel head hangs from the stem at a broad lower rim, not an egg in a cup',async()=>{
 const {buildGeometry}=await import('./mushrooms.mjs');
 for(const seed of ['1352778786','woodland-042','a','b']){
  // The outline's two ends of the head's base (where the cap meets the stem).
  const g=buildGeometry(generateSpecimen(seed,'morel-1')),rimWidth=Math.abs(g.cap[80][0]-g.cap[81][0]),stemTop=2*g.halfAt(1);
  assert.ok(rimWidth>stemTop*1.25,`${seed}: rim ${rimWidth.toFixed(1)} overhangs the stem top ${stemTop.toFixed(1)}`);
 }
 // Other morels keep their egg.
 const other=buildGeometry(generateSpecimen('woodland-042','morel-2'));
 assert.ok(Math.abs(other.cap[80][0]-other.cap[81][0])<2*other.halfAt(1));
});

test('morph field endpoint samples taken in the Worker equal the page\'s own samples',async()=>{
 const m=await import('./mushrooms.mjs');
 const a=generateSpecimen('woodland-042','amanita-1'),b=generateSpecimen('woodland-108','agaric-1');
 const pair=m.createMorphPair(a,b,{composition:m.createSpecimenComposition(a),...m.orbitViewOptions({yaw:.12,pitch:.36})});
 const out=m.serializableImplicitMorph(m.createImplicitMorph(pair.a,pair.b,pair.composition,{view:pair.view,shapeModifiers:pair.shapeModifiers}));
 const source=m.sampleImplicitMorph(out,0),target=m.sampleImplicitMorph(out,1);
 const received=structuredClone({...out,samples:{source,target,measuresA:m.measureSketch(source),measuresB:m.measureSketch(target)}});
 assert.deepEqual(received.samples.source,m.sampleImplicitMorph(received,0));assert.deepEqual(received.samples.target,m.sampleImplicitMorph(received,1));
 assert.deepEqual(received.samples.measuresA,m.measureSketch(m.sampleImplicitMorph(received,0)));
});

test('ux11: preview pen widths under a page frame are the framed plan widths',async()=>{
 const m=await import('./mushrooms.mjs');
 const old=w=>Math.max(.3,Math.round((w??.6)*1.1*5)/5);
 for(const w of [.25,.6,.9,1.4,null])assert.equal(m.previewPenWidth(w),old(w),'no frame: the sheet rounding is unchanged');
 for(const s of [.8,1.3,2.2])for(const w of [.25,.6,.9,1.4,null]){
  const framed=Number.isFinite(w)?w*(s>1?Math.sqrt(s):s):w;
  assert.ok(Math.abs(m.previewPenWidth(w,{scale:s,tx:0,ty:0})*s-old(framed))<1e-12,`scale ${s} width ${w}`);
 }
 const frame={scale:1.6,tx:-140,ty:-90},cover=m.previewCover(frame);
 assert.ok(cover.x*frame.scale+frame.tx<=0&&cover.y*frame.scale+frame.ty<=0,'the cutout reaches the sheet corner');
 assert.ok((cover.x+cover.w)*frame.scale+frame.tx>=1200&&(cover.y+cover.h)*frame.scale+frame.ty>=1000,'and the far corner');
 assert.equal(m.previewCover(null),null);
});

test('ux11: a morph preview frame is drawn unframed under its page frame',async()=>{
 const m=await import('./mushrooms.mjs');const saved=globalThis.Path2D;
 globalThis.Path2D=class{constructor(){this.ops=[];}moveTo(x,y){this.ops.push(['M',x,y]);}lineTo(x,y){this.ops.push(['L',x,y]);}closePath(){}rect(...a){this.ops.push(['R',...a]);}addPath(p){this.ops.push(...p.ops);}};
 try{
  const transforms=[],strokes=[],covers=[];
  const c={globalAlpha:1,lineWidth:1,setTransform(){transforms.length=0;},transform(...a){transforms.push(a);},clearRect(){},drawImage(){},save(){},restore(){},clip(){},fillText(){},stroke(path){strokes.push({width:this.lineWidth,path,transform:transforms.slice()});}};
  const painter=new m.Painter({width:1200,height:1000,getContext:()=>c}),paper={width:1200,height:1000};
  Object.assign(painter,{_paper:paper,previewPaper:{width:1200,height:1000},previewPaperSource:paper,previewFieldWash:(ctx,plan,cover)=>covers.push(cover)});
  const pair=m.createMorphPair(generateSpecimen('woodland-042','amanita-1'),generateSpecimen('x7','agaric-1'));
  assert.ok(m.morphPreviewKind(pair));
  painter.morphPreview(pair,.5);
  const frame=painter.previewPageFrame;assert.ok(frame,'this pair is page-framed');
  assert.deepEqual(frame,m.pageFrameAt(m.pagePairFrame(pair),.5));
  assert.ok(strokes.length>0);
  for(const s of strokes)assert.deepEqual(s.transform,[[frame.scale,0,0,frame.scale,frame.tx,frame.ty]],'every stroke is under the page frame');
  assert.deepEqual(covers,[m.previewCover(frame)],'the wash occluders cover the sheet in unframed space');
  // In page space the preview is exactly the framed sketch the page used to build per frame.
  const framed=painter.framedPreviewPlan(),expected=m.buildMorphSketch(pair,.5,{inkOnly:true,interactive:true});
  assert.equal(framed.ink.length,expected.ink.length);
  assert.deepEqual(framed.ink.map(mark=>mark.points),expected.ink.map(mark=>mark.points));
  assert.deepEqual(framed.ink.map(mark=>mark.width),expected.ink.map(mark=>mark.width));
  // Pen widths on the sheet are the old rounding of the framed widths.
  const sheet=new Set(expected.ink.filter(mark=>mark.points?.length>=2).map(mark=>Math.max(.3,Math.round((mark.width??.6)*1.1*5)/5)));
  for(const s of strokes)assert.ok([...sheet].some(w=>Math.abs(w-s.width*frame.scale)<1e-9),`sheet width ${s.width*frame.scale}`);
 }finally{globalThis.Path2D=saved;}
});
