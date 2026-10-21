// The lab's palette. Each pigment has absorption K and scattering S per channel (red, green, blue) for Kubelka-Munk
// compositing, with density rho, staining power omega and granulation gamma for the physics (Curtis et al. 1997).
// `swatch` is the colour the palette shows; the paint's colour on the sheet comes from K and S alone. DOM free.
//
// The first six come from Curtis et al. (1997, Figure 5), with granulation set as painters describe the pigments, and
// walnut ink from its colour over white and black. The others were fitted to a pale wash (a mass of 0.15, what the
// brush lays at a pigment load near 0.15) and a strong one (a mass of 1, near a load of 1.1) of each paint as painters
// know it, on this paper, with scattering only where the paint is semi-opaque (yellow ochre, and the lemon yellow's
// blue channel). Yellow ochre, burnt sienna, alizarin and sap green were then made a little stronger after swatches
// painted in the lab read pale or dusty beside the paints. Their density and granulation follow the same descriptions:
// the earths settle and granulate a little, the dyes do not, and Payne's grey granulates for its ultramarine.
//
// Staining power (omega) divides how much of a dried wash new water lifts (sheet.js, rewetLift) and how much loose pigment
// a wet wash gives back. It follows how the paints behave: the dyes and fine organic pigments stain and stay put when a
// wash is scrubbed (phthalo blue, the quinacridone rose, alizarin, indigo, Hansa and lemon yellow, sap green, walnut ink);
// the earths, cerulean, ultramarine and Payne's grey sit on the paper and lift easily. Curtis et al.'s 9.3 for burnt umber
// made an easily lifted earth the most staining paint here. Laid, dried and scrubbed with clean water through the lab's
// physics, the staining paints keep 90 to 96% of their density and the others 65 to 78%.
import { fromColours } from './km.js';

/** The pigments in palette order: yellows, earths, reds, blues, green, neutrals. */
export const PIGMENTS = [
  { key: 'lemon', name: 'Lemon yellow', swatch: '#ecdd3a', K: [0.01, 0.04, 1.11], S: [0.002, 0.04, 0.44], rho: 0.05, omega: 15, gamma: 0.05 },
  { key: 'hansa', name: 'Hansa yellow', swatch: '#e8c630', K: [0.06, 0.21, 1.78], S: [0.5, 0.88, 0.009], rho: 0.06, omega: 20, gamma: 0.08 },
  { key: 'ochre', name: 'Yellow ochre', swatch: '#c9963a', K: [0.12, 0.33, 1.0], S: [0.002, 0.24, 0.12], rho: 0.08, omega: 0.8, gamma: 0.45 },
  { key: 'sienna', name: 'Burnt sienna', swatch: '#a4492a', K: [0.25, 0.8, 1.25], S: [0.002, 0.002, 0.002], rho: 0.08, omega: 1, gamma: 0.4 },
  { key: 'umber', name: 'Burnt umber', swatch: '#6b4a33', K: [0.74, 1.54, 2.1], S: [0.09, 0.09, 0.004], rho: 0.09, omega: 1, gamma: 0.9 },
  { key: 'walnut', name: 'Walnut ink', swatch: '#7a5a3c', ...fromColours([0.52, 0.4, 0.28], [0.03, 0.025, 0.02]), rho: 0.05, omega: 25, gamma: 0.15 },
  { key: 'rose', name: 'Rose', swatch: '#d0487f', K: [0.22, 1.47, 0.57], S: [0.05, 0.003, 0.03], rho: 0.02, omega: 30, gamma: 0.15 },
  { key: 'alizarin', name: 'Alizarin crimson', swatch: '#8e2440', K: [0.2, 1.3, 0.8], S: [0.002, 0.002, 0.002], rho: 0.02, omega: 30, gamma: 0.1 },
  { key: 'ultramarine', name: 'Ultramarine', swatch: '#3b4fb0', K: [0.86, 0.86, 0.06], S: [0.005, 0.005, 0.09], rho: 0.03, omega: 1, gamma: 0.95 },
  { key: 'phthalo', name: 'Phthalo blue', swatch: '#1f56a8', K: [1.38, 0.62, 0.18], S: [0.002, 0.002, 0.002], rho: 0.02, omega: 40, gamma: 0.05 },
  { key: 'cerulean', name: 'Cerulean', swatch: '#3a9ec4', K: [1.52, 0.32, 0.25], S: [0.06, 0.26, 0.4], rho: 0.02, omega: 0.6, gamma: 0.7 },
  { key: 'indigo', name: 'Indigo', swatch: '#2f3b5c', K: [0.9, 0.73, 0.47], S: [0.008, 0.002, 0.002], rho: 0.03, omega: 30, gamma: 0.15 },
  { key: 'sapgreen', name: 'Sap green', swatch: '#5a7628', K: [0.62, 0.44, 1.06], S: [0.002, 0.002, 0.002], rho: 0.03, omega: 20, gamma: 0.1 },
  { key: 'paynes', name: "Payne's grey", swatch: '#414953', K: [0.72, 0.62, 0.51], S: [0.002, 0.002, 0.002], rho: 0.05, omega: 1.5, gamma: 0.5 },
];

/** A new sheet carries these six, in this order; any other pigment joins the sheet the first time a brush takes it up. */
export const SHEET_START = ['walnut', 'umber', 'rose', 'ultramarine', 'hansa', 'cerulean'];

/** Whether a pigment stains the paper or lifts easily, as the palette shows it. */
export const stains = p => p.omega >= 5;

export const BY_KEY = Object.freeze(Object.fromEntries(PIGMENTS.map(p => [p.key, p])));
