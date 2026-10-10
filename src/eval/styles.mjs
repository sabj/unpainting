// Each plate's style, so results can be reported per style as well as over the whole set.
const STYLES = {
  'brown ink and wash': ['tiepolo', 'tiepolotown', 'guardi', 'rembrandtcottage', 'rembrandtwoman', 'claude', 'bloemen'],
  'brush and brown ink': ['roettiers'],
  'wash over chalk': ['fragonard', 'savery'],
  'pen and watercolour': ['randal', 'beach'],
  'watercolour over graphite': ['cox', 'girtin', 'constable'],
  'pure watercolour': ['richmond', 'turner'],
  'brush ink and watercolour vignette': ['portrait'],
};

// Styles whose order differs from watercolour: drawing before washes.
const ORDER = {
  'brown ink and wash': 'line first',
  'brush and brown ink': 'line first',
  'pen and watercolour': 'line first',
  'brush ink and watercolour vignette': 'line first',
};

/** The style a plate is filed under, or 'unfiled'. */
export const styleOf = plate => Object.keys(STYLES).find(k => STYLES[k].includes(plate)) ?? 'unfiled';

/** The order a plate's style works in, or undefined for the watercolour order. */
export const orderOf = plate => ORDER[styleOf(plate)];
