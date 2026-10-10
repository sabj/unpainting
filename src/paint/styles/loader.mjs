// Watercolor style profiles (the JSON files beside this module), the style each subject is mapped to
// (tuned/subjects.json), and the technique settings a profile gives a phase and value band.
import fs from 'node:fs';
const directory = new URL('./', import.meta.url);
export const STYLE_NAMES = Object.freeze(['ink-and-wash','precise-watercolor','urban-sketch','atmospheric-wet']);
export function loadStyle(name) {
  if (!STYLE_NAMES.includes(name)) throw Error(`Unknown watercolor style: ${name}`);
  const profile = JSON.parse(fs.readFileSync(new URL(`${name}.json`, directory)));
  if (profile.name !== name || profile.weights.length !== 5 || profile.water.length !== 5 || Math.abs(profile.weights.reduce((a,b)=>a+b,0)-1)>1e-8) throw Error(`Invalid style profile: ${name}`);
  return profile; // fresh data per plan; callers cannot mutate another subject's defaults
}
export function loadSubjects() { return JSON.parse(fs.readFileSync(new URL('../tuned/subjects.json', import.meta.url))); }
export function resolveStyle(subject, region=null, selection=null) {
  const mapping = selection ?? loadSubjects()[subject];
  if (!mapping?.style || !mapping.reason) throw Error(`Subject ${subject} needs an explicit style and reason`);
  const override = region && mapping.regions?.[region];
  if (override && !override.reason) throw Error(`Region ${region} needs a style reason`);
  return {...loadStyle(override?.style ?? mapping.style), reason:override?.reason ?? mapping.reason};
}
export function profileTechnique(profile, phase, band, texture=false) {
  const wet = profile.name === 'atmospheric-wet';
  return {style:profile.name,structure:profile.structure,move:texture?'dry on dry':wet?(phase==='shadow'?'dry on wet':'wet on wet'):'wet on dry',paperBefore:wet?'measured sheen across footprint and neighbors':'fully dry; own same-passage overlap allowed',water:profile.water[band-1],brush:profile.brushes,edgePolicy:profile.edge,detailStrategy:profile.textures,inkWeight:profile.ink,graphiteWeight:profile.graphite,inkPigment:profile.pigment,layerOrder:profile.order,wetMix:profile.wetMix,bridge:profile.bridge,bridgeSoft:profile.bridgeSoft};
}
