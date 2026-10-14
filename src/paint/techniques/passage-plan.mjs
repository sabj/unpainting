// Per-passage material decisions and wet-bed preparation.
const ALIASES = Object.freeze({
  'wet in wet': 'wet on wet', 'wet-in-wet': 'wet on wet', 'wet-on-wet': 'wet on wet',
  'glaze': 'wet on dry', 'glazed': 'wet on dry', 'glazing': 'wet on dry', 'dry brush': 'dry on dry',
});

export function normalizePassageMove(move) {
  const key = typeof move === 'string' ? move.trim().toLowerCase() : move;
  return ALIASES[key] ?? key;
}

// Family boxes describe intent. They do not cut wash geometry or contact.
export function passageFamily(cells, w, h, families) {
  let best = null, bestScore = 0;
  for (const family of families) {
    const b = family.bounds;
    if (!b) continue;
    let inside = 0;
    for (const i of cells) {
      const x = (i % w + .5) / w, y = (Math.floor(i / w) + .5) / h;
      if (x >= b[0] && x < b[2] && y >= b[1] && y < b[3]) inside++;
    }
    const share = inside / Math.max(1, cells.length), score = share / Math.sqrt((b[2] - b[0]) * (b[3] - b[1]));
    if (share >= .6 && score > bestScore) { best = family; bestScore = score; }
  }
  return best;
}

export function passageMaterial({ phase, family, fallbackMove, texture = false }) {
  const requested = normalizePassageMove(family?.baseMove ?? fallbackMove);
  const wet = phase === 'light' && requested === 'wet on wet';
  return {
    family: family?.id ?? null,
    technique: texture ? 'dry-brush' : wet ? 'wet-foundation' : phase === 'shadow' ? 'glaze' : 'local-colour',
    move: texture ? 'dry on dry' : wet ? 'wet on wet' : 'wet on dry',
    water: texture ? .22 : wet ? .55 : phase === 'shadow' ? .45 : .62,
    requestedMove: requested,
    referenceCue: family?.referenceCue ?? null,
  };
}

// Waiting is a painting action. A freshly wetted bed can be too glossy for the
// intended charge. Advance ordinary sheet physics until the measured contact
// becomes workable. Never weaken the material gate or read the target here.
export function settlePassageBed({ observe, advance, maxSteps = 256 }) {
  let paper = observe(), steps = 0;
  while (paper.waterMax > .15 && paper.moistShare >= .7 && steps < maxSteps) {
    advance();
    steps++;
    paper = observe();
  }
  if (paper.waterMax > .15 || paper.moistShare < .7) {
    throw Error('Technique wet bed did not reach its material window: ' + JSON.stringify({ paper, steps }));
  }
  return { paper, steps, operation: 'wait for ordinary absorption and evaporation' };
}

// Whole-gesture preparation, like wetting a wash and picking up a puddle with a
// clean brush. Decisions use footprint summaries. No cell gets its own action.
export function preparePassageBed({ observe, wet, pickup, advance = null, maxActions = 4 }) {
  const actions = [];
  let paper = observe();
  for (let attempt = 0; attempt < maxActions; attempt++) {
    if (paper.moistShare >= .7 && paper.waterMax <= .15) return { paper, actions };
    const before = paper;
    if (paper.moistShare >= .7 && paper.waterMax > .15) {
      pickup();
      paper = observe();
      actions.push({ operation: 'pick up excess surface water', before, after: paper });
      if (advance && paper.waterMax > .15 && paper.moistShare >= .7) {
        let steps = 0;
        while (paper.waterMax > .15 && paper.moistShare >= .7 && steps < 256) {
          advance();
          steps++;
          paper = observe();
        }
        actions.push({ operation: 'wait for ordinary absorption and evaporation', steps, after: paper });
      }
    } else {
      wet();
      paper = observe();
      actions.push({ operation: 'prewet the planned contact', before, after: paper });
    }
  }
  if (paper.moistShare >= .7 && paper.waterMax <= .15) return { paper, actions };
  throw Error('Technique preparation failed without a pixel correction: ' + JSON.stringify({ paper, actions }));
}
