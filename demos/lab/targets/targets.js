const LAB=new URL('../',import.meta.url);
const TECHNIQUES=[['dry-brush','Dry brush'],['wash','Flat wash'],['glaze','Glazing'],['wet-in-wet','Wet in wet'],['backrun','Backrun'],['pen','Dip pen'],['ink-wash','Ink then wash'],['wash-ink','Wash then ink']];
export function createTargets({startFilm,startDemo,fresh,resume,cancel,sheet}){
 const picker=document.getElementById('painting-picker'),credit=document.getElementById('target-credit'),figure=document.getElementById('target-figure'),img=document.getElementById('target-image'),caption=document.getElementById('target-caption');
 let examples=[],selected=null,disabled=true;
 function button(value,title,thumb){const b=document.createElement('button');b.type='button';b.dataset.value=value;b.setAttribute('aria-pressed','false');b.disabled=disabled;
  if(thumb){const im=document.createElement('img');im.src=new URL(thumb,LAB);im.alt='';im.loading='lazy';b.append(im);}else{const sample=document.createElement('span');sample.className='blank-sample';b.append(sample);}
  const label=document.createElement('span');label.textContent=title;b.append(label);b.addEventListener('click',()=>open(value));picker.append(b);return b;}
 const blank=button('blank','Blank paper'),saved=button('resume','Saved painting');saved.hidden=true;
 const ready=fetch(new URL('examples/recorded.json',LAB)).then(r=>{if(!r.ok)throw Error(`Recordings: ${r.status}`);return r.json();}).then(data=>{examples=data.examples;for(const e of examples)button(e.id,e.title.split(' · ')[0],e.thumb);for(const [id,title]of TECHNIQUES)button('demo:'+id,title,`thumbnails/${id}.webp`);}).catch(error=>{credit.textContent='Recordings unavailable. Blank paper is ready.';console.error(error);});
 function open(value,seek=0){if(!sheet().ready)return;cancel();selected=value;figure.hidden=true;credit.textContent='';picker.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.value===value)));
  if(value==='blank'){fresh();return;}if(value==='resume'){resume();return;}
  if(value.startsWith('demo:')){const id=value.slice(5);startDemo(id,TECHNIQUES.find(t=>t[0]===id)[1]);return;}
  const ex=examples.find(e=>e.id===value);if(!ex)return;img.src=new URL(ex.target,LAB);img.alt=ex.title+' target';caption.textContent='Target · live studies use the original recorded strokes and materials.';credit.textContent=ex.credit;figure.hidden=false;startFilm(ex,false,seek);
 }
 picker.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;const buttons=[...picker.querySelectorAll('button:not([hidden]):not(:disabled)')],i=buttons.indexOf(document.activeElement);const n=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)+buttons.length)%buttons.length;buttons[n]?.focus();e.preventDefault();});
 return {open, ready, randomExample:()=>open(examples[Math.floor(Math.random()*examples.length)]?.id||'blank'),randomTechnique:()=>open('demo:'+TECHNIQUES[Math.floor(Math.random()*TECHNIQUES.length)][0]),openFirst:()=>ready.then(()=>open(new URLSearchParams(location.search).get('example')||examples[0]?.id||'blank')),setDisabled:on=>{disabled=on;picker.querySelectorAll('button').forEach(b=>b.disabled=on);},resumeAvailable:()=>saved.hidden=false,replay:(seek=0)=>open(selected||examples[0]?.id||'blank',seek)};
}
