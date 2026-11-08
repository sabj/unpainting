// Watercolor style profiles (the JSON files beside this module), the style a plan selects (its styleSelection), and
// the technique settings a profile gives a phase and value band. No style is looked up by subject id.
import fs from 'node:fs';
const directory = new URL('./', import.meta.url);
export const STYLE_NAMES = Object.freeze(['ink-and-wash','precise-watercolor','urban-sketch','atmospheric-wet']);

const styleCache = new Map();

export function clearStyleCache() {
  styleCache.clear();
}

function validateProfile(profile, name) {
  if (!profile || typeof profile !== 'object') throw Error(`Invalid style profile: ${name}`);
  if (profile.name !== name && name !== 'custom') throw Error(`Invalid style profile: ${name}`);
  if (!Array.isArray(profile.weights) || profile.weights.length !== 5 || !profile.weights.every(w => Number.isFinite(w) && w >= 0)) {
    throw Error(`Invalid style profile: ${name}`);
  }
  if (!Array.isArray(profile.water) || profile.water.length !== 5 || !profile.water.every(w => Number.isFinite(w) && w >= 0)) {
    throw Error(`Invalid style profile: ${name}`);
  }
  if (Math.abs(profile.weights.reduce((a, b) => a + b, 0) - 1) > 1e-8) {
    throw Error(`Invalid style profile: ${name}`);
  }
  if (profile.layerOrderWeights != null) {
    if (!Array.isArray(profile.layerOrderWeights) || !profile.layerOrderWeights.every(w => Number.isFinite(w) && w >= 0)) {
      throw Error(`Invalid style profile: ${name}: layerOrderWeights must be non-negative numbers`);
    }
  }
  if (profile.waterToPigmentRatio != null) {
    if (!Number.isFinite(profile.waterToPigmentRatio) || !(profile.waterToPigmentRatio > 0)) {
      throw Error(`Invalid style profile: ${name}: waterToPigmentRatio must be finite positive`);
    }
  }
  if (profile.paintStrength != null) {
    if (!Number.isFinite(profile.paintStrength) || profile.paintStrength < 0) {
      throw Error(`Invalid style profile: ${name}: paintStrength must be non-negative`);
    }
  }
}

export function loadStyleProfile(nameOrConfig) {
  if (typeof nameOrConfig === 'string') {
    const name = nameOrConfig;
    if (!STYLE_NAMES.includes(name)) throw Error(`Unknown watercolor style: ${name}`);
    if (styleCache.has(name)) {
      return structuredClone(styleCache.get(name));
    }
    const profile = JSON.parse(fs.readFileSync(new URL(`${name}.json`, directory), 'utf8'));
    validateProfile(profile, name);
    if (profile.paintStrength == null || !Number.isFinite(profile.paintStrength)) {
      profile.paintStrength = 1.0;
    }
    styleCache.set(name, profile);
    return structuredClone(profile);
  }
  if (typeof nameOrConfig === 'object' && nameOrConfig !== null) {
    const profile = structuredClone(nameOrConfig);
    validateProfile(profile, profile.name ?? 'custom');
    if (profile.paintStrength == null || !Number.isFinite(profile.paintStrength)) {
      profile.paintStrength = 1.0;
    }
    return profile;
  }
  throw Error(`Invalid style profile argument: ${nameOrConfig}`);
}

export function loadStyle(name) {
  if (typeof name !== 'string' || !STYLE_NAMES.includes(name)) {
    throw Error(`Unknown watercolor style: ${name}`);
  }
  return loadStyleProfile(name);
}
export function resolveStyle(subject, region=null, selection=null) {
  const mapping = selection;
  if (!mapping?.style || !mapping.reason) throw Error(`Subject ${subject} needs a plan styleSelection with a style and reason`);
  const override = region && mapping.regions?.[region];
  if (override && !override.reason) throw Error(`Region ${region} needs a style reason`);
  return {...loadStyle(override?.style ?? mapping.style), reason:override?.reason ?? mapping.reason};
}
export function profileTechnique(profile, phase, band) {
  const wet = profile.name === 'atmospheric-wet';
  return {style:profile.name,structure:profile.structure,move:wet?(phase==='shadow'?'dry on wet':'wet on wet'):'wet on dry',paperBefore:wet?'measured sheen across footprint and neighbors':'fully dry; own same-passage overlap allowed',water:profile.water[band-1],brush:profile.brushes,edgePolicy:profile.edge,detailStrategy:profile.textures,inkWeight:profile.ink,graphiteWeight:profile.graphite,inkPigment:profile.pigment,layerOrder:profile.order,wetMix:profile.wetMix,bridge:profile.bridge,bridgeSoft:profile.bridgeSoft};
}
