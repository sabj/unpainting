// A palette recipe keeps the original pigments separate. Ratios divide the brush's
// selected pigment concentration; water and reservoir size are still brush settings.
import { PIGMENTS, BY_KEY } from './pigments.js';
import { renderLayers } from './km.js';

export function normalizeMix(parts) {
  if (!parts || typeof parts !== 'object' || Array.isArray(parts)) throw new TypeError('Invalid pigment mix');
  let total=0;
  for(const [key,value] of Object.entries(parts)) {
    if (!Object.hasOwn(BY_KEY,key) || !Number.isFinite(value) || value<0) throw new RangeError('Invalid pigment mix component');
    total+=value;
  }
  if (!Number.isFinite(total)) throw new RangeError('Invalid pigment mix total');
  if (!total) return null;
  return Object.fromEntries(PIGMENTS.filter(p=>Object.hasOwn(parts,p.key)&&parts[p.key]>0).map(p=>[p.key,parts[p.key]/total]));
}

export function mixConcentrations(parts, strength, keys) {
  if (!Number.isFinite(strength) || strength<0) throw new RangeError('Invalid mix strength');
  const mix=normalizeMix(parts);
  return keys.map(key=>(mix?.[key]??0)*strength);
}

/** Two optical swatches over the selected paper, not an RGB average or a stroke prediction. */
export function previewMix(parts, strength=.5, paper=[247,244,236]) {
  if (!Number.isFinite(strength) || strength<0) throw new RangeError('Invalid mix strength');
  const mix=normalizeMix(parts),keys=Object.keys(mix??{});
  if (!keys.length) return {paint:[...paper],wash:[...paper]};
  const pigments=keys.map(key=>BY_KEY[key]);
  const swatch=scale=>Array.from(renderLayers([keys.map(key=>Float32Array.of(mix[key]*strength*scale))],pigments,Uint8Array.from(paper),1));
  return {paint:swatch(1),wash:swatch(.25)};
}
