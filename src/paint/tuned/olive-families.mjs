// Tree-layer colour thresholds fitted to reference images.
// Levels are 0..255; l is luminance.
//   paper:  within paperDist of the plate's paper colour, or within paperL of its luminance with chroma under paperChroma
//   terra:  r - g > terraRG, r - b > terraRB and r > terraR
//   sky:    b - r > skyBR and l > skyL
//   ground: r - b > groundRB and l > groundL
//   cool:   local blue minus mean of red and green above coolMin; olive otherwise
// A tree on a whole plate also needs r - g at most strictRG and l at most strictL, so warm sand shadow is not a tree.
export const OLIVE_FAMILIES = Object.freeze({
 paperDist: 20, paperL: 16, paperChroma: 22,
 terraRG: 42, terraRB: 70, terraR: 170,
 skyBR: 8, skyL: 168,
 groundRB: 34, groundL: 160,
 coolMin: -9,
 strictRG: 12, strictL: 200,
});
