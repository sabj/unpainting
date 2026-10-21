import test from 'node:test';
import assert from 'node:assert/strict';
import {statusKey,statusText,recordedStatus,handStatus,createStatusLog} from '../../demos/lab/ui/status-log.js';

test('stroke progress and pigment changes reuse a line; phase, tool and operations separate it',()=>{
 const paint={phase:'Painting',tool:'Round brush',done:1281,total:2500,pigments:['Raw sienna']};
 assert.equal(statusKey(paint),statusKey({...paint,done:1282,pigments:['Ultramarine']}));
 for(const change of [{phase:'Drawing'},{tool:'Flat brush'},{operation:'mask'}])assert.notEqual(statusKey(paint),statusKey({...paint,...change}));
 assert.equal(statusText({...paint,done:1282}),'Painting · stroke 1,282 of 2,500 · round brush · raw sienna');
});
test('recordings report only displayed saved-frame counts, with honest frame fallback',()=>{
 const film={frames:['a','b','c'],frameNumbers:[0,5,10],frameStrokes:[0,123,987],strokes:987};
 assert.equal(recordedStatus(film,.49).done,0);assert.equal(recordedStatus(film,.51).done,123);assert.equal(recordedStatus(film,1).done,987);
 assert.deepEqual(recordedStatus({...film,frameStrokes:undefined},.51),{phase:'Recording',done:2,total:3,unit:'frame'});
});
test('hand drawing and painting describe selected materials',()=>{
 assert.equal(handStatus({tool:'pen'},3,{}).phase,'Drawing');
 assert.deepEqual(handStatus({tool:'flat',pigment:'sienna'},4,{sienna:{name:'Raw sienna'}}),{phase:'Painting',tool:'Flat brush',pigments:['Raw sienna'],done:4});
});

// Minimal layout fixture; the browser check below this unit layer exercises real wrapping/scrolling.
class Element {
 constructor(){this.children=[];this.attrs={};this.dataset={};this.scrollTop=0;this.clientHeight=60;this.textContent='';}
 setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}
 append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
 replaceChildren(){this.children=[];}
 get firstElementChild(){return this.children[0];}get lastElementChild(){return this.children.at(-1);}
 get scrollHeight(){return (this.children[0]?.children.length||0)*20;}
 getBoundingClientRect(){return {height:20};}
 remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);}
}
test('log follows the bottom, preserves a reader position, bounds history and announces only phases',()=>{
 const previous=globalThis.document;globalThis.document={createElement:()=>new Element()};
 try{
  const box=new Element(),log=createStatusLog(box,{limit:5}),[list,announce]=box.children;
  log.write({phase:'Painting',tool:'Round',done:1});const line=list.lastElementChild;
  log.write({phase:'Painting',tool:'Round',done:2});assert.equal(list.children.length,1);assert.equal(list.lastElementChild,line);
  announce.textContent='sentinel';log.write({phase:'Painting',tool:'Flat',done:3});assert.equal(announce.textContent,'sentinel');
  for(let i=0;i<3;i++)log.write({phase:'Phase '+i});assert.equal(list.children.length,5);assert.equal(box.scrollTop,100);
  box.scrollTop=20;log.write({phase:'New phase'});assert.equal(box.scrollTop,0,'pruning preserves the visible old row');assert.equal(list.children.length,5);assert.equal(announce.textContent,'New phase');
  box.scrollTop=10;log.progress(4,20);assert.equal(box.scrollTop,10,'progress never pulls a reader down');
  box.scrollTop=40;log.progress(5,20);assert.equal(box.scrollTop,100,'returning to the bottom resumes following');
  log.reset();assert.equal(list.children.length,0);assert.equal(announce.textContent,'');
 }finally{globalThis.document=previous;}
});
