import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, deposit, depositDry, soak, step, dry, fix, totals, layersOf, DEFAULTS } from './sheet.mjs';
import { createBrush, dip, stroke } from './brush.mjs';
import { createPen, dipPen, penStroke } from './pen.mjs';
import { createPencil, pencilStroke, wetGraphite, sharpen } from './pencil.mjs';
import { fromColours, layerRT, renderLayers } from './km.mjs';
const pigment = { rho: .05, omega: 1.4, gamma: .15, K: [.35,.49,.66], S: [.06,.025,.014] };
const sheet = (w = 24, h = w, seed = 1) => createSheet(makePaper(w,h,{seed}), [pigment]);
const still = { ...DEFAULTS, flowIters: 0, evap: 0, edgeEvap: 0, absorb: 0, paperDry: 0, capRate: 0, slide: 0, settle: 0, lift: 0, rewetLift: 0 };
const near = (a,b,eps=2e-6) => assert.ok(Math.abs(a-b) <= eps*Math.max(1,Math.abs(b)), `${a} != ${b}`);
const finite = s => { for(const a of [s.W,s.s,...s.G,...s.P,...s.D,...s.layers.flat()]) for(const v of a) assert.ok(Number.isFinite(v) && v >= 0, `invalid mass ${v}`); };
const brushMass = b => ({water:b.resW+b.hairs.reduce((v,h)=>v+h.water,0),pig:b.resP[0]+b.hairs.reduce((v,h)=>v+h.pig[0],0)});

test('deposits and soaking account for all added material', () => {const s=sheet();deposit(s,1,1,[.3]);depositDry(s,2,1,[.4]);soak(s,3,1,[.5]);near(totals(s).water,3);near(totals(s).pig[0],1.2);});
test('thin films retain water when evaporation is disabled', () => {const s=sheet();deposit(s,1,.001,[.1]);step(s,still);near(totals(s).water,.001,1e-8);});
test('zero dt is a no-op and invalid dt is rejected', () => {const s=sheet();deposit(s,100,1,[.1]);const a=s.W.slice();step(s,{...DEFAULTS,dt:0});assert.deepEqual(s.W,a);for(const dt of [NaN,Infinity,-1])assert.throws(()=>step(s,{...DEFAULTS,dt}),RangeError);});
test('partial step options retain defaults and finite state', () => {const s=sheet();deposit(s,100,1,[.1]);step(s,{dt:.1});finite(s);});
test('capillary flow at large dt conserves mass and stays within capacity', () => {const s=sheet(5);s.paper.capacity.fill(1);s.paper.fdx.fill(Math.SQRT1_2);s.paper.fdy.fill(Math.SQRT1_2);s.paper.grain.fill(1);s.s.fill(.11);s.s[12]=1;s.P[0][12]=1;const a=totals(s);step(s,{...still,capRate:.05,dt:20});near(totals(s).water,a.water);near(totals(s).pig[0],a.pig[0]);for(const v of s.s)assert.ok(v<=1);finite(s);});
test('four capillary donors cannot overfill one pore', () => {const s=sheet(5);s.paper.capacity.fill(1);s.s.fill(1);s.s[12]=.11;for(const i of [7,11,13,17]){s.paper.fdx[i]=(i===11||i===13)?1:0;s.paper.fdy[i]=(i===7||i===17)?1:0;s.paper.grain[i]=1;}step(s,{...still,capRate:.05,dt:20});assert.ok(s.s[12]<=1);});
test('surface diffusion obeys its maximum principle with aligned fibres', () => {const s=sheet(5);s.W.fill(.5);s.W[12]=1;s.M.fill(1);s.paper.fdx.fill(Math.SQRT1_2);s.paper.fdy.fill(Math.SQRT1_2);s.paper.grain.fill(1);step(s,{...still,flowIters:1});assert.ok(Math.min(...s.W)>=.5);assert.ok(Math.max(...s.W)<=1);near(totals(s).water,13);});
test('strong transport stays nonnegative and conservative', () => {const s=sheet(9);for(let i=0;i<s.n;i++){deposit(s,i,.4+(i%7)/10,[i%3*.1]);s.P[0][i]=.03;s.s[i]=.12;s.D[0][i]=.02;}const a=totals(s);for(let n=0;n<30;n++)step(s,{...DEFAULTS,evap:0,edgeEvap:0,paperDry:0,wetEps:0,flow:2,diffuse:2,marangoni:3,dt:10});finite(s);near(totals(s).water,a.water,1e-5);near(totals(s).pig[0],a.pig[0],1e-5);});
test('evaporation removes water but leaves pigment', () => {const s=sheet(5);s.W.fill(1);s.M.fill(1);s.G[0].fill(.1);step(s,{...still,evap:.1,dt:2});near(totals(s).water,20);near(totals(s).pig[0],2.5);});
test('drying and fixing conserve pigment across repeated glazes', () => {const s=sheet(8);deposit(s,20,.3,[.2]);dry(s,1000,{...DEFAULTS,evap:.1,paperDry:.1},{level:0,levelMax:0});near(totals(s).water,0);near(totals(s).pig[0],.2);assert.equal(s.layers.length,1);deposit(s,20,.3,[.1]);dry(s,1000,{...DEFAULTS,evap:.1,paperDry:.1},{level:0,levelMax:0});near(totals(s).pig[0],.3);assert.equal(s.layers.length,2);});
test('dry refuses to call a wet wash fixed at its iteration limit', () => {const s=sheet();deposit(s,1,1,[.1]);assert.throws(()=>dry(s,0),/dry|limit/i);assert.equal(s.layers.length,0);near(totals(s).pig[0],.1);});
test('settling and rewet lifting move mass between compartments', () => {const s=sheet();deposit(s,10,1,[.1]);step(s,{...still,settle:1});assert.ok(s.D[0][10]>0);near(totals(s).pig[0],.1);fix(s);step(s,{...still,rewetLift:1});assert.ok(s.layers[0][0][10]<.001);near(totals(s).pig[0],.1);});
test('sheet work buffers do not couple same-sized sheets', () => {const a=sheet(),b=sheet();deposit(a,100,1,[1]);deposit(b,100,1,[1]);for(let i=0;i<5;i++){step(a);step(b);}assert.deepEqual(a.W,b.W);assert.deepEqual(a.G,b.G);});
test('brush gives and picks up material conservatively', () => {for(const water of [.2,1]){const s=sheet(32),b=createBrush();dip(b,{water,conc:[.5]});s.W.fill(.8);s.G[0].fill(.1);s.M.fill(1);const a=brushMass(b),t=totals(s);stroke(b,s,[{x:4,y:16},{x:28,y:16}]);near(brushMass(b).water+totals(s).water,a.water+t.water);near(brushMass(b).pig+totals(s).pig[0],a.pig+t.pig[0]);}});
test('pen retains overflow above saturated pores', () => {const s=sheet(32),p=createPen();s.s.set(s.paper.capacity);s.ever.fill(1);dipPen(p,[.5]);const a=totals(s),water=p.ink+p.drop;penStroke(p,s,[{x:16,y:16,dwell:2}]);near(totals(s).water-a.water,water-p.ink-p.drop);near(totals(s).pig[0],.5*(water-p.ink-p.drop));});
test('pen changes sheets without retaining pore history', () => {const a=sheet(32,32,1),b=sheet(32,32,9),c=sheet(32,32,9),p=createPen(),fresh=createPen(),path=[{x:8,y:16},{x:24,y:16}];dipPen(p,[1]);penStroke(p,a,path);dipPen(p,[1]);penStroke(p,b,path);dipPen(fresh,[1]);penStroke(fresh,c,path);assert.deepEqual(b.D,c.D);assert.deepEqual(b.s,c.s);});
test('fractional pen dwell uses its stated time', () => {const s=sheet(32),p=createPen({drop:0,feed:.01});dipPen(p,[1]);const w=p.ink;penStroke(p,s,[{x:16,y:16,p:1,dwell:.25}]);near(w-p.ink,.01*1.3*.25);});
test('wet graphite transfers only loose mass and conserves it', () => {const s=sheet(),G=new Float32Array(s.n),p=createPencil();pencilStroke(p,s.paper,G,[{x:4,y:12},{x:20,y:12}]);const sum=a=>a.reduce((a,b)=>a+b,0),before=sum(G);s.W.fill(1);s.M.fill(1);wetGraphite(s,G,0,{rate:1,dt:10});near(sum(G)+totals(s).pig[0],before);assert.ok(totals(s).pig[0]>0);sharpen(p);assert.equal(p.facet,0);});
test('KM limits, inverse colours, and browser-friendly output', () => {assert.deepEqual(layerRT(0,0,0),[0,1]);near(layerRT(2,0,1)[1],Math.exp(-2));near(layerRT(0,2,1)[0],2/3);for(const x of [1e-8,1,1000])for(const v of layerRT(.5,.05,x))assert.ok(Number.isFinite(v)&&v>=0&&v<=1);const rw=[.52,.4,.28],rb=[.03,.025,.02],pg=fromColours(rw,rb);for(let c=0;c<3;c++){const [r,t]=layerRT(pg.K[c],pg.S[c],1);near(r,rb[c]);near(r+t*t/(1-r),rw[c]);}const s=sheet();const out=renderLayers(layersOf(s),s.pigments,new Uint8Array(s.n*3).fill(250),s.n);assert.ok(out instanceof Uint8ClampedArray);assert.ok(out.every(v=>v===250));});

test('dry accepts partial options just like step', () => {
  const s = sheet(8); deposit(s,20,.1,[.1]);
  dry(s,1000,{evap:.1,paperDry:.1},{levelMax:0});
  near(totals(s).water,0); near(totals(s).pig[0],.1);
});

test('pinned edges evaporate faster than the interior', () => {
  const s = sheet(7); s.W.fill(1); s.M.fill(1); s.ever.fill(1);
  step(s,{...still,edgeEvap:.1,edgeWidth:2,dt:1});
  assert.ok(s.W[0] < s.W[24]); near(s.W[24],1);
});

test('granulation settles into hollows and lifts from peaks', () => {
  const s = sheet(5); s.pigments = [{...pigment,gamma:.9}];
  s.paper.valley[11] = 0; s.paper.valley[13] = 1;
  deposit(s,11,1,[1]); deposit(s,13,1,[1]);
  step(s,{...still,settle:1}); assert.ok(s.D[0][11] > s.D[0][13]);
  s.D[0].fill(0); s.G[0].fill(0); s.D[0][11] = s.D[0][13] = 1;
  step(s,{...still,lift:1}); assert.ok(s.G[0][13] > s.G[0][11]);
  near(totals(s).pig[0],2);
});

test('wick filtering deposits dye without losing pigment', () => {
  const s = sheet(5); s.paper.capacity.fill(1); s.s[12] = 1; s.P[0][12] = 1;
  step(s,{...still,capRate:.05,sizing:0,wickFilter:.5,dt:1});
  assert.ok(s.D[0].some(v=>v>0)); assert.ok(s.P[0][11]>0);
  near(totals(s).water,1); near(totals(s).pig[0],1);
});

test('small papers and a brush wider than them stay finite', () => {
  for (const n of [1,2,3,8]) {
    const s = sheet(n);
    for (const a of [s.paper.height,s.paper.capacity,s.paper.valley,s.paper.tooth,s.paper.grain]) for (const v of a) assert.ok(Number.isFinite(v), `paper ${n}: ${v}`);
    const b = createBrush(); dip(b,{water:.1,conc:[1]});
    stroke(b,s,[{x:0,y:0},{x:n,y:n}]); finite(s);
  }
});

test('a brush lifted clear of the sheet keeps its bead', () => {
  const s = sheet(32), b = createBrush(); dip(b,{water:1,conc:[.5]});
  const a = brushMass(b);
  stroke(b,s,[{x:-30,y:-30},{x:-20,y:-20}]);   // never touches the paper
  near(brushMass(b).water + totals(s).water, a.water); near(brushMass(b).pig + totals(s).pig[0], a.pig);
  s.W.fill(.8); s.M.fill(1); const c = brushMass(b), t = totals(s);
  stroke(b,s,[{x:4,y:16},{x:28,y:16}]);        // and the bead still lands when there is wet paper under it
  near(brushMass(b).water + totals(s).water, c.water + t.water);
});

test('a flat brush lifted to no pressure stays on its lanes', () => {
  // pressed, this brush (radius 6) wets rows 5 to 19; lifted, only the rows its tip lanes touch along the path
  const laid = p => { const s = sheet(24), b = createBrush({ flat: true }); dip(b,{water:1,conc:[.5]}); const had = brushMass(b);
    stroke(b,s,[{x:4.5,y:12.5,p},{x:18.5,y:12.5,p}]); finite(s); near(brushMass(b).water + totals(s).water, had.water);
    const rows = new Set(); for (let i = 0; i < s.n; i++) if (s.W[i] + s.s[i] + s.G[0][i] + s.P[0][i] > 0) { rows.add(Math.floor(i / 24)); assert.ok(i % 24 >= 3 && i % 24 <= 19, `paint past the path's ends at ${i}`); }
    return { rows: [...rows].sort((a, b) => a - b), water: totals(s).water }; };
  const lifted = laid(0), pressed = laid(1);
  assert.ok(lifted.water > 0, 'the lifted tip still touches the paper');
  assert.ok(lifted.rows.every(y => Math.abs(y + .5 - 12.5) <= 2), `lifted paint off its lanes: rows ${lifted.rows}`);
  assert.ok(pressed.rows.length > 2 * lifted.rows.length && lifted.water < pressed.water / 10, 'lifting is what keeps it narrow and light');
});

test('instruments used off the edge of the sheet do nothing, quietly', () => {
  for (const path of [[{x:-40,y:12,v:1},{x:-30,y:12,v:1}], [{x:12,y:-40,v:1},{x:12,y:-30,v:1}], [{x:60,y:60,v:1},{x:70,y:64,v:1}]]) {
    const s = sheet(24), p = createPen(); dipPen(p,[1]);
    const ink = p.ink + p.drop;
    penStroke(p,s,path);                          // the window round the nib is off the sheet, not a negative rectangle
    near(totals(s).pig[0],0); assert.equal(p.ink + p.drop, ink); finite(s);
    const b = createBrush(); dip(b,{water:1,conc:[.5]});
    const had = brushMass(b); stroke(b,s,path); near(brushMass(b).water + totals(s).water, had.water); finite(s);
    const G = new Float32Array(s.n); pencilStroke(createPencil(),s.paper,G,path);
    for (const v of G) assert.equal(v,0);
  }
});

test('loose graphite never claims more than the cell holds', () => {
  const s = sheet(32), G = new Float32Array(s.n).fill(1.5), p = createPencil({point:4});
  p.dust = 1000; pencilStroke(p,s.paper,G,[{x:4,y:16,p:0},{x:28,y:16,p:0}]);
  for (let i = 0; i < s.n; i++) assert.ok(G.loose[i] <= G[i] + 1e-6, `loose ${G.loose[i]} > ${G[i]}`);
  near(p.dust,1000);                            // a saturated field takes none of it
  s.W.fill(1); s.M.fill(1); const sum = a => a.reduce((x,y)=>x+y,0), before = sum(G);
  wetGraphite(s,G,0,{rate:1,dt:10}); near(sum(G) + totals(s).pig[0], before);
});

test('a mixed glaze conserves each pigment separately', () => {
  const s = createSheet(makePaper(12,12), [pigment,{...pigment,gamma:.9,omega:9.3}]);
  for (let i = 40; i < 50; i++) deposit(s,i,.4,[.02,.03]);
  const before = totals(s);
  for (let i = 0; i < 30; i++) step(s,{...DEFAULTS,dt:2});
  for (let k = 0; k < 2; k++) near(totals(s).pig[k],before.pig[k]);
  dry(s,2000,{evap:.1,paperDry:.1},{levelMax:0});
  for (let k = 0; k < 2; k++) near(totals(s).pig[k],before.pig[k]);
  finite(s);
});
