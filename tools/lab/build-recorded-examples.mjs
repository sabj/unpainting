// Small excerpts of the checked-in White Ships run. Keep real frames and stroke paths,
// including their original frame numbers, so the player never falls back to a sketch.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const dir = path.join(root, 'docs/lab/examples');
const run = 'examples/white-ships-run/';
const recording = JSON.parse(fs.readFileSync(path.join(dir, 'white-ships-run/frames.json')));
const tape = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, 'white-ships-run/strokes.json.gz'))));
const credit = 'John Singer Sargent, White Ships, 1908, Brooklyn Museum (09.846), public domain. Painted by unpainting.';
const examples = [[10, 'first-marks', 'White Ships: first 19 strokes', 8], [20, 'first-washes', 'White Ships: first 93 strokes', 14], [30, 'early-layers', 'White Ships: first 173 strokes', 18]].map(([end, id, title, seconds]) => {
  const frames = recording.frames.filter(f => Number(f.src.match(/\d+/)[0]) <= end);
  const last = frames.at(-1);
  const paths = tape.strokes.filter(s => s[0] <= end);
  const excerpt = `white-ships-${id}-strokes.json`;
  fs.writeFileSync(path.join(dir, excerpt), JSON.stringify({...tape, strokes: paths}) + '\n');
  return {id, title, kind: 'Recorded early strokes', target: `${run}source.jpg`, thumb: `${run}${last.src}`, credit,
    preset: {surface:'cold'}, source: 'docs/lab/examples/white-ships-run/frames.json',
    film: {frames:frames.map(f => run + f.src), frameNumbers:frames.map(f => Number(f.src.match(/\d+/)[0])),
      final:run + last.src, aspect:recording.width / recording.height, seconds, strokes:last.strokes,
      paths:`examples/${excerpt}`}};
});
fs.writeFileSync(path.join(dir, 'recorded.json'), JSON.stringify({examples}, null, 2) + '\n');
