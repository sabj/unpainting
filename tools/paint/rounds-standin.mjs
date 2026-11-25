// The stand-in model of fixed rounds (author "dry-rounds"): a short scripted conversation that touches every part of
// a round (a script, an edit after a look, a look stopped at a stage, a region look, done), so a dry run and the tests
// exercise the whole path with no model called. Its painting is three plain washes: never a result.

/** The stand-in's script for a sheet {widthMm, heightMm}. */
export function standInScript(sheet) {
  const W = sheet.widthMm, H = sheet.heightMm, box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => [+(x * W).toFixed(1), +(y * H).toFixed(1)]);
  return { format: 'painting-script 2', subject: 'stand-in', author: 'the scripted stand-in', sheet: { widthMm: W, heightMm: H }, palette: ['ochre', 'ultramarine', 'sienna'],
    brushes: { big: { shape: 'round', widthMm: 17 }, mid: { shape: 'round', widthMm: 7 } }, approach: 'three plain washes, light to dark: a stand-in, not a painting',
    passages: [
      { id: 'p1', what: 'a pale warm wash over the upper sheet', stage: 1, kind: 'wash', brush: 'big', region: box(0.08, 0.08, 0.92, 0.5), paint: { pigments: { ochre: 3, sienna: 1 }, dilution: 'very pale' }, paper: 'wet', edges: 'lost', handling: { hold: 'side', direction: 0, load: 'loaded' } },
      { id: 'p2', what: 'a cool wash over the lower sheet', stage: 2, kind: 'wash', brush: 'big', region: box(0.08, 0.5, 0.92, 0.92), paint: { pigments: { ultramarine: 2, sienna: 1 }, dilution: 'pale' }, paper: 'dry', handling: { hold: 'side', direction: 0, load: 'loaded' } },
      { id: 'p3', what: 'a darker shape in the middle', stage: 3, kind: 'wash', brush: 'mid', region: box(0.35, 0.35, 0.65, 0.65), paint: { pigments: { ultramarine: 2, sienna: 2 }, dilution: 'medium' }, paper: 'dry', handling: { hold: 'side', direction: 90, load: 'loaded' } },
    ] };
}

/** The stand-in's replies, in order (`shapes`: level 4, where a passage may name a supplied shape): its script; an edit and a look stopped at stage 1; a bulk edit and a region look; done. */
export function standInReplies(sheet, { shapes = false } = {}) {
  const W = sheet.widthMm, H = sheet.heightMm, first = standInScript(sheet);
  // at level 4 one of its washes is a supplied shape, named by number
  if (shapes) first.passages.push({ id: 's1', what: 'a supplied shape, by number', stage: 2, kind: 'wash', brush: 'mid', shapes: [1], paint: { pigments: { ochre: 1, sienna: 1 }, dilution: 'pale' }, paper: 'dry', handling: { hold: 'side', direction: 0, load: 'loaded' } });
  return [
    JSON.stringify(first),
    JSON.stringify({ edits: [{ op: 'set', id: 'p3', path: 'paint.dilution', value: 'strong' }, { op: 'move', id: 'p3', before: 'p2' }, { op: 'move', id: 'p3', after: 'p2' }], look: { until: 1 } }),
    JSON.stringify({ edits: [{ op: 'set', ids: ['p1', 'p2'], path: 'handling.load', value: 'flooded' }, { op: 'add', passage: { id: 'p4', what: 'a last dark touch', stage: 5, kind: 'strokes', brush: 'mid', paper: 'dry', paint: { pigments: { ultramarine: 1, sienna: 2 }, dilution: 'dark' }, strokes: [{ points: [[+(0.4 * W).toFixed(1), +(0.5 * H).toFixed(1), 0.4], [+(0.6 * W).toFixed(1), +(0.52 * H).toFixed(1), 0.8]] }] } }], look: { region: [0.3 * W, 0.3 * H, 0.7 * W, 0.7 * H].map(v => +v.toFixed(1)) } }),
    JSON.stringify({ done: true }),
  ];
}
