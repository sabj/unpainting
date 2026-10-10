// Mixing a target colour from a limited palette: every single pigment and every pair at a few ratios, at a range of
// strengths, composited by Kubelka-Munk (km.js) over what is already on the paper, and the nearest in Lab chosen. DOM free.
import { BY_KEY } from './pigments.js';
import { renderCells } from './km.js';
import { toLab } from '../targets/segment.js';

const RATIOS = [0.25, 0.5, 0.75];
const STRENGTHS = [0.03, 0.05, 0.08, 0.12, 0.17, 0.24, 0.33, 0.45, 0.6, 0.8, 1.05];

/** The candidate mixes of `palette`: { parts: {key: share} } for singles and pairs. */
function recipes(palette) {
  const out = palette.map(k => ({ [k]: 1 }));
  for (let i = 0; i < palette.length; i++) for (let j = i + 1; j < palette.length; j++) for (const r of RATIOS) out.push({ [palette[i]]: r, [palette[j]]: 1 - r });
  return out;
}

/**
 * A mixer for `palette` on paper of colour `paperRGB`. `fit(targetLab, under)` returns { mixture, strength, lab }, where
 * `under` is the layers already laid at that place, each a concentration vector over the palette.
 */
export function createMixer(palette, paperRGB) {
  const keys = palette.filter(k => BY_KEY[k]), pigs = keys.map(k => BY_KEY[k]);
  const Kp = pigs.map(p => p.K), Sp = pigs.map(p => p.S), all = recipes(keys);
  const out = new Uint8ClampedArray(3);
  const render = layers => { renderCells(layers.map(v => v.map(x => Float32Array.of(x))), Kp, Sp, paperRGB, 0, 1, 1, undefined, out); return toLab(out[0], out[1], out[2]); };
  const vec = (parts, s) => keys.map(k => (parts[k] ?? 0) * s);
  return {
    keys,
    fit(target, under = []) {
      let best = null, bd = Infinity;
      for (const parts of all) for (const s of STRENGTHS) {
        const lab = render([...under, vec(parts, s)]);
        // lightness weighs a little more than hue: a wash a shade off reads worse than one a little off in colour
        const d = 1.4 * (lab[0] - target[0]) ** 2 + (lab[1] - target[1]) ** 2 + (lab[2] - target[2]) ** 2 + (Object.keys(parts).length > 1 ? 4 : 0);
        if (d < bd) { bd = d; best = { mixture: parts, strength: s, lab, layer: vec(parts, s) }; }
      }
      return best;
    },
  };
}
