// --crisp 1: a wet-on-dry glaze on a hard-edged passage runs at full brush width and the sheet's clip (setClip) stops
// the bead at the passage boundary. Sweeps held inside a passage thin out at its rim and dry as a soft blob.
// --crispcut 1 also keeps the cut-in round the edge. --crispdetail 0 leaves small-brush detail passages unclipped.
export function makeCrisp({ opt, num }) {
  const on = num('crisp', 0) > 0;
  return {
    on,
    // this passage is laid to a hard edge
    wants: (T, detail) => on && T.name !== 'wet on wet' && (!detail || opt('crispdetail', '1') !== '0'),
    cutIn: () => opt('crispcut', '0') !== '0',
  };
}
