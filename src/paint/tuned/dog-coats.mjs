// --dogcoat presets fitted to reference photographs; see docs/techniques.md for limitations.

//   wet: tight dark glossy ringlets with small sharp lights, a compact silhouette with few flyaways
//   dry: looser wavy locks, a broader softer sheen on the head, a ragged edge and topknot
// Any flag given on the command line still overrides a preset.
export const COATS = {
  wet: { doglockshape: 'clump', dogsrclift: 0, dogupper: 1, doglower: 0.35, dogcrest: '0.006,0.012', dogcap: 0.25, doglocklen: '0.012,0.028', doglockthick: '0.0028,0.005', doglockshare: 0.09, doglockshade: 0.5, dogcurlgap: 0.09, dogcurllen: '0.03,0.06', doghead: 0.18, dogscribbleloop: 0.012, dogscribblelen: '0.08,0.22', dogscribblefly: 0.12 },
  dry: { doglockshape: 'lock', doglocklen: '0.04,0.1', doglockthick: '0.005,0.01', doglockshare: 0.14, doglockshade: 0.3, dogcurlgap: 0.035, dogcurllen: '0.07,0.16', doghead: 0.3, doglit: 0.3, dogscribbleloop: 0.026, dogscribblelen: '0.15,0.4', dogscribblefly: 0.35 },
};
