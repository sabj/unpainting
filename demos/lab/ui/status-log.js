// The log is readable history, not a live region: only phase changes are announced.
const number = value => Math.max(0, Math.round(value)).toLocaleString('en-US');
export const statusKey = entry => JSON.stringify([entry.phase, entry.tool || '', entry.operation || '']);
export function statusText(entry) {
  const parts = [entry.phase];
  if (Number.isFinite(entry.done)) parts.push(`${entry.unit || 'stroke'} ${number(entry.done)}${Number.isFinite(entry.total) ? ` of ${number(entry.total)}` : ''}`);
  if (entry.tool) parts.push(entry.tool.toLowerCase());
  if (entry.pigments?.length) parts.push(entry.pigments.join(', ').toLowerCase());
  return parts.join(' · ');
}
export function recordedStatus(film, fraction) {
  const frame = fraction * film.frameNumbers.at(-1);
  let index = 0;
  while (index < film.frameNumbers.length - 1 && film.frameNumbers[index + 1] <= frame) index++;
  // Report the displayed saved state, never interpolate imaginary stroke counts.
  const strokes = film.frameStrokes?.[index];
  return {phase:'Recording', done:strokes ?? index + 1, total:strokes == null ? film.frames.length : film.strokes ?? film.frameStrokes.at(-1), unit:strokes == null ? 'frame' : 'stroke'};
}
export function handStatus(tool, done, palette) {
  const names = {round:'Round brush', flat:'Flat brush', pen:'Dip pen', pencil:'Pencil', water:'Water brush', dryer:'Hair dryer', lift:'Lifting tool', blot:'Tissue', mask:'Masking tool'};
  const phases = {pen:'Drawing', pencil:'Drawing', water:'Rewetting', dryer:'Drying', lift:'Lifting', blot:'Blotting', mask:'Masking'};
  const pigments = ['round','flat'].includes(tool.tool) ? Object.keys(tool.mixture || {[tool.pigment]:1}).map(key=>palette[key]?.name || key) : tool.tool==='pen' ? ['Walnut ink'] : tool.tool==='pencil' ? ['Graphite'] : [];
  return {phase:phases[tool.tool] || 'Painting', tool:names[tool.tool] || tool.tool, pigments, done};
}
export function createStatusLog(container, {limit=120}={}) {
  container.id='operation-timeline';container.setAttribute('role','region');container.setAttribute('aria-label','Painting status');container.tabIndex=0;
  const list=document.createElement('ol');list.setAttribute('aria-live','off');
  const announcement=document.createElement('div');announcement.className='sr-only';announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');announcement.setAttribute('aria-atomic','true');
  container.append(list,announcement);
  let current=null, phase=null;
  function write(entry) {
    if(!entry?.phase)return;
    const key=statusKey(entry), text=statusText(entry), last=list.lastElementChild;
    if(last?.dataset.key===key && last.textContent===text)return;
    const follow=container.scrollHeight-container.clientHeight-container.scrollTop<=4, top=container.scrollTop;
    if(last?.dataset.key===key)last.textContent=text;
    else {
      last?.removeAttribute('aria-current');
      const line=document.createElement('li');line.dataset.key=key;line.textContent=text;line.setAttribute('aria-current','step');list.append(line);
    }
    let removed=0;
    while(list.children.length>limit){removed+=list.firstElementChild.getBoundingClientRect().height;list.firstElementChild.remove();}
    container.scrollTop=follow ? container.scrollHeight : Math.max(0,top-removed);
    if(phase!==entry.phase){phase=entry.phase;announcement.textContent=entry.phase;}
    current={...entry};
  }
  return {
    write,
    progress(done,total){if(current)write({...current,done,total});},
    reset(){list.replaceChildren();announcement.textContent='';current=phase=null;container.scrollTop=0;},
  };
}
