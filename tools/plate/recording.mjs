// --recording full|medium|light: how much of the painting is recorded as it is made (with --marks 1).
//   full    a native frame after every stroke, dry and pen step (the recording before 0.4.0-rc.8)
//   medium  (default) a native frame at each film frame only: the strokes are counted, not each photographed
//   light   the film capped at LIGHT_FILM_FRAMES frames (enough to place the ten progress stills), and native frames
//           only at the start and the end
// The painting is the same at every level: recording only reads the sheet.
export const RECORDING_LEVELS = Object.freeze(['full', 'medium', 'light']);
export const LIGHT_FILM_FRAMES = 40;

/** The recording policy for one --recording word. */
export function recordingPolicy(word = 'medium') {
  const level = String(word).trim().toLowerCase();
  if (!RECORDING_LEVELS.includes(level)) throw Error(`--recording takes ${RECORDING_LEVELS.join(', ')}, not ${word}`);
  return Object.freeze({
    level,
    // a native frame after each operation (stroke, dry, pen step)
    everyOperation: level === 'full',
    // a native frame at each film frame
    onFilm: level === 'medium',
    // the film's frame count, given what was asked
    filmFrames: asked => (level === 'light' ? Math.min(asked, LIGHT_FILM_FRAMES) : asked),
  });
}
