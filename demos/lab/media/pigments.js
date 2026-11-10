// The lab's palette. Each pigment has absorption K and scattering S per channel (red, green, blue) for Kubelka-Munk
// compositing, with density rho, staining power omega and granulation gamma for the physics (Curtis et al. 1997).
// `swatch` is the colour the palette shows; the paint's colour on the sheet comes from K and S alone. DOM free.
//
// The first six come from Curtis et al. (1997, Figure 5), with granulation set as painters describe the pigments, and
// walnut ink from its colour over white and black. The others were fitted to a pale wash (a mass of 0.15, what the
// brush lays at a pigment load near 0.15) and a strong one (a mass of 1, near a load of 1.1) of each paint as painters
// know it, on this paper, with scattering only where the paint is semi-opaque (yellow ochre, and the lemon yellow's
// blue channel). Yellow ochre, burnt sienna, alizarin and sap green were then made a little stronger after swatches
// painted in the lab read pale or dusty beside the paints.
//
// Density rho, staining power omega, granulation gamma and flocculation floc are not set here. They come from one
// table of published pigment properties shared with the painter (pigment-physical.js), which records the source of each
// paint and marks what is estimated. Staining power divides how much of a dried wash new water lifts (sheet.js,
// rewetLift) and how much loose pigment a wet wash gives back: the dyes and fine organic pigments (phthalo blue, rose,
// alizarin, indigo, Hansa and lemon yellow, sap green, walnut ink) stay put when a wash is scrubbed; the earths,
// cerulean, ultramarine and Payne's grey lift easily. K, S and the swatch stay fitted to the paints as painters know them.
import { fromColours } from './km.js';
import { physicalOf, labKeyOf, physicsFields } from './pigment-physical.js';

/** The pigments in palette order: yellows, earths, reds, blues, green, neutrals. */
const COLOURS = [
  { key: 'lemon', name: 'Lemon yellow', swatch: '#ecdd3a', K: [0.01, 0.04, 1.11], S: [0.002, 0.04, 0.44] },
  { key: 'hansa', name: 'Hansa yellow', swatch: '#e8c630', K: [0.06, 0.21, 1.78], S: [0.5, 0.88, 0.009] },
  { key: 'ochre', name: 'Yellow ochre', swatch: '#c9963a', K: [0.12, 0.33, 1.0], S: [0.002, 0.24, 0.12] },
  { key: 'sienna', name: 'Burnt sienna', swatch: '#a4492a', K: [0.25, 0.8, 1.25], S: [0.002, 0.002, 0.002] },
  { key: 'umber', name: 'Burnt umber', swatch: '#6b4a33', K: [0.74, 1.54, 2.1], S: [0.09, 0.09, 0.004] },
  { key: 'walnut', name: 'Walnut ink', swatch: '#7a5a3c', ...fromColours([0.52, 0.4, 0.28], [0.03, 0.025, 0.02]) },
  { key: 'rose', name: 'Rose', swatch: '#d0487f', K: [0.22, 1.47, 0.57], S: [0.05, 0.003, 0.03] },
  { key: 'alizarin', name: 'Alizarin crimson', swatch: '#8e2440', K: [0.2, 1.3, 0.8], S: [0.002, 0.002, 0.002] },
  { key: 'ultramarine', name: 'Ultramarine', swatch: '#3b4fb0', K: [0.86, 0.86, 0.06], S: [0.005, 0.005, 0.09] },
  { key: 'phthalo', name: 'Phthalo blue', swatch: '#1f56a8', K: [1.38, 0.62, 0.18], S: [0.002, 0.002, 0.002] },
  { key: 'cerulean', name: 'Cerulean', swatch: '#3a9ec4', K: [1.52, 0.32, 0.25], S: [0.06, 0.26, 0.4] },
  { key: 'indigo', name: 'Indigo', swatch: '#2f3b5c', K: [0.9, 0.73, 0.47], S: [0.008, 0.002, 0.002] },
  { key: 'sapgreen', name: 'Sap green', swatch: '#5a7628', K: [0.62, 0.44, 1.06], S: [0.002, 0.002, 0.002] },
  { key: 'paynes', name: "Payne's grey", swatch: '#414953', K: [0.72, 0.62, 0.51], S: [0.002, 0.002, 0.002] },
];

export const PIGMENTS = COLOURS.map(p => ({ ...p, ...physicsFields(physicalOf(labKeyOf(p.key))) }));

/** A new sheet carries these six, in this order; any other pigment joins the sheet the first time a brush takes it up. */
export const SHEET_START = ['walnut', 'umber', 'rose', 'ultramarine', 'hansa', 'cerulean'];

/** Whether a pigment stains the paper or lifts easily, as the palette shows it. */
export const stains = p => p.omega >= 5;

export const BY_KEY = Object.freeze(Object.fromEntries(PIGMENTS.map(p => [p.key, p])));
