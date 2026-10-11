import test from 'node:test';
import assert from 'node:assert/strict';
import {createPointerSampler} from '../../docs/lab/ui/contact.js';
import {makePaper} from '../../docs/lab/media/paper.js';
import {createSheet} from '../../docs/lab/media/sheet.js';
import {createBrush,dip,stroke} from '../../docs/lab/media/brush.js';
import {handBrushOptions} from '../../docs/lab/brush-load.js';
const rect={left:0,top:0,width:480,height:180};
const event=(x,t,pressure=.5,pointerType='mouse')=>({clientX:x,clientY:90,timeStamp:t,pressure,pointerType});
const sample=(sampler,e,options={})=>sampler.sample(e,rect,480,180,.8,{dpi:60,...options});
test('fixed mouse and touch pressure stay exact with uneven timestamps',()=>{
 for(const type of ['mouse','touch']){const s=createPointerSampler();for(let i=0;i<20;i++)assert.equal(sample(s,event(i*10,i%2?i*16:0,.5,type),{manual:true}).p,.8);}
});
test('optional speed pressure remains gentle and travel-limited at 1x and 4x',()=>{
 for(const rate of [1,4]){const s=createPointerSampler();let prev=sample(s,event(20,0)),t=0;
 for(let i=1;i<55;i++){t+=[1,31,2,30,16][i%5]/rate;const p=sample(s,event(20+i*7,t));assert.ok(p.p>=.64&&p.p<=.76);assert.ok(Math.abs(p.p-prev.p)<=.012*7*25.4/60+1e-12);prev=p;}
 const stationary=sample(s,event(prev.x,t+1000));assert.equal(stationary.p,prev.p);
 assert.equal(sample(s,event(410,t+1010),{release:true}).p,0);
 }
});
test('stylus noise is smoothed lightly, release and a new stroke are immediate',()=>{
 const s=createPointerSampler();assert.equal(sample(s,event(10,0,.2,'pen')).p,.2);
 const p=sample(s,event(15,6,.8,'pen')).p;assert.ok(p>.2&&p<.5);
 assert.ok(sample(s,event(20,30,.8,'pen')).p>.7);
 assert.equal(sample(s,event(22,31,.8,'pen'),{release:true}).p,0);
 s.reset();assert.equal(sample(s,event(10,40,.9,'pen')).p,.9);
});
test('a long one-event drag and uneven timed paths deposit a connected wash',()=>{
 const pigment={K:[.4,.6,.9],S:[.01,.01,.01],rho:.05,omega:1.4,gamma:.15};
 for(const rate of [1,4])for(const long of [false,true]){
  const sheet=createSheet({...makePaper(480,180,{seed:7}),mmPerCell:25.4/60},[pigment]);
  const b=createBrush(handBrushOptions({tool:'round',sizeMm:15,water:2},{dpi:60,seed:7}));dip(b,{water:2,conc:[.5]});
  const s=createPointerSampler();let prev=sample(s,event(30,0)),t=0;
  const xs=long?[450]:Array.from({length:60},(_,i)=>37+i*7);
  for(const [i,x]of xs.entries()){t+=[1,31,2,30,16][i%5]/rate;const next=sample(s,event(x,t));stroke(b,sheet,[prev,next],{lift:false});prev=next;}
  let widths=[],tones=[];
  for(let x=55;x<425;x++){let width=0,mass=0;for(let y=70;y<=110;y++){const m=sheet.G[0][y*480+x]+sheet.D[0][y*480+x]+sheet.P[0][y*480+x];if(m>1e-5)width++;if(y>=86&&y<=94){assert.ok(m>1e-5,`gap at ${x},${y}`);mass+=m;}}widths.push(width);tones.push(mass);}
  const cv=a=>{const mean=a.reduce((a,b)=>a+b,0)/a.length;return Math.sqrt(a.reduce((s,v)=>s+(v-mean)**2,0)/a.length)/mean;};
  assert.ok(cv(widths)<.15,`width CV ${cv(widths)}`);assert.ok(cv(tones)<.2,`tone CV ${cv(tones)}`);
 }
});
