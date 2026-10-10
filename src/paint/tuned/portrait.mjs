// Portrait-specific settings fitted to a reference outside this repository.
// Risks: docs/techniques.md.

// The value plan subject that turns on the lower-face texture and first-ink jaw rules.
export const PORTRAIT_SUBJECT = 'subject-c';

// Lower-face texture zone as shares of the sheet: x0, y0, x1, y1. --texzone overrides it.
export const TEX_ZONE = Object.freeze([0, .5, 1, .88]);

// The first ink leaves out a long path lying mostly in the jaw band: more than `share` of its points between yMin and
// yMax (shares of the height), and longer than `minLength` of the width.
export const JAW_INK = Object.freeze({ yMin: .5, yMax: .85, share: .65, minLength: .06 });

// Under-eye stroke ordinals in the reference trace and the local optical contrast a
// point needs to stay in the opening ink.
export const EYE_PLANE_ORDINALS = Object.freeze([208, 145]);
export const EYE_PLANE_CONTRAST_MIN = .22;

// Window for the --colourtrace diagnostic on this subject (x0, y0, x1, y1 as shares of the sheet).
export const TRACE_BOX = Object.freeze([.52, .20, .80, .28]);
