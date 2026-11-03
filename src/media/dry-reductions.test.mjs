import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheet,deposit,step,dry,fix,quietDryTail,DEFAULTS,thickness} from './sheet.mjs';
import {makePaper} from './paper.mjs';
const make=()=>createSheet(makePaper(64,48,{seed:9}),[{K:[1,.5,.2],S:[.1,.1,.1],rho:.1,omega:.2,gamma:.1}]);
function scan(s) {
  let maxW=0,surfaceLevel=0;
  for(let i=0;i<s.n;i++){
    maxW=Math.max(maxW,s.W[i]);if(!s.M[i])continue;
    if(i%s.w<s.w-1&&s.M[i+1])surfaceLevel=Math.max(surfaceLevel,Math.abs(s.W[i]-s.W[i+1]));
    if(i+s.w<s.n&&s.M[i+s.w])surfaceLevel=Math.max(surfaceLevel,Math.abs(s.W[i]-s.W[i+s.w]));
  }return {maxW,surfaceLevel};
}
function load(s){for(let y=5;y<16;y++)for(let x=4;x<19;x++)deposit(s,y*s.w+x,(x+y)%3*.1+.005,[.01]);for(let y=37;y<43;y++)for(let x=55;x<61;x++)deposit(s,y*s.w+x,.003,[.02]);}

test('completed step summaries equal full scans across wet fronts and separated passages', () => {
  const s=make();load(s);
  for(let t=0;t<120;t++){
    const summary={};if(!step(s,{...DEFAULTS,dt:t>60?14:1,holeFill:2},summary))break;
    assert.deepEqual(summary,scan(s),'step '+t);
  }
});

test('fast dry summaries keep the original iteration schedule and exact planes', () => {
  const a=make(),b=make();load(a);load(b);
  const options={level:10,levelMax:90,levelTol:.02,dt:14,analyticTail:true};
  const actual=dry(a,4000,DEFAULTS,options);
  let t=0,fast=false;const oFast={...DEFAULTS,dt:14};
  for(;t<4000;t++){
    if(!fast&&t>=10&&(t>=90||(t%25===0&&scan(b).surfaceLevel<.02)))fast=true;
    if(quietDryTail(b,DEFAULTS))break;
    if(fast&&b.W.every(w=>w<=3*DEFAULTS.wetEps))oFast.dt=140;
    if(!step(b,fast?oFast:DEFAULTS))break;
  }
  assert.ok(t<4000);fix(b);assert.equal(actual,t);
  for(const key of ['W','s','M'])assert.deepEqual(a[key],b[key]);
  assert.deepEqual(thickness(a),thickness(b));
});
