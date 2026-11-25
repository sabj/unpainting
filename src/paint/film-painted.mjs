// A film of a painting only gains paint: the share of the sheet that shows paint or line never drops from one frame to
// the next, except where paint is taken off on purpose (an erase passage, and the finished sheet, where the masking fluid
// comes off). A drop elsewhere is a film that shows paint and then loses it (rc5's Mittens: the face's base wash shown
// from frame 60, gone at frame 131). Pure: the frames are given as RGB bytes.

/** The most the painted share may drop between two frames (a share of the sheet) before it is a loss. */
const SHRINK_MOST = 0.02;
/** How far a pixel is from the paper (in 0..255, any channel) to count as painted. */
const PAINTED = 12;

/** The share of the pixels of `rgb` that differ from `paper` (both RGB bytes of the same size) by more than PAINTED. */
export function paintedShare(rgb, paper) {
  let n = 0; const px = rgb.length / 3;
  for (let i = 0; i < rgb.length; i += 3) if (Math.abs(rgb[i] - paper[i]) > PAINTED || Math.abs(rgb[i + 1] - paper[i + 1]) > PAINTED || Math.abs(rgb[i + 2] - paper[i + 2]) > PAINTED) n++;
  return n / px;
}

/** The drops of a film: `shares` the painted share of each frame, `frames` the film's frames.json entries. [{at, from, to, stage}] */
export function filmShrinks(shares, frames, most = SHRINK_MOST) {
  const out = [];
  for (let i = 1; i < shares.length; i++) {
    const stage = frames[i]?.stage;
    if (stage === 'erase' || stage === 'finished') continue;
    if (shares[i] < shares[i - 1] - most) out.push({ at: i, from: +shares[i - 1].toFixed(3), to: +shares[i].toFixed(3), stage: stage ?? null });
  }
  return out;
}
