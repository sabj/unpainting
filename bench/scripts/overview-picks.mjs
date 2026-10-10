// Picks the paintings for docs/img/benchmark-overview.webp (drawn by build-overview.mjs) from results/results.json:
// each model's single best painting across every published round and public subject, and each model's best Ships
// painting across V1 to V3. Both lists are sorted by indexed score, best first.
import { PUBLIC_CROPS } from './lib.mjs';

/** Rounds the Ships row draws from: the three rounds that share one task and kit. */
export const SHIPS_ROUNDS = ['V1', 'V2', 'V3'];
export const SHIPS_CROP = 'sargent';

/** Each model's highest indexed painting among the given rounds and crops. Ties keep the earlier round. */
function bestOf(R, { rounds = null, crops: keep = PUBLIC_CROPS } = {}) {
  const crops = new Map(R.crops.map(c => [c.key, c]));
  const best = new Map();
  for (const round of R.rounds) {
    if (round.judgeVersion && round.judgeVersion !== 'J1') continue;
    if (rounds && !rounds.includes(round.id)) continue;
    for (const m of round.models ?? []) {
      for (const [crop, v] of Object.entries(m.perCrop ?? {})) {
        const b = v?.best;
        if (!keep.includes(crop) || !crops.get(crop)?.distributed || b?.indexed == null || !b.image) continue;
        const prev = best.get(m.name);
        if (prev && prev.indexed >= b.indexed) continue;
        best.set(m.name, { model: m.name, round: round.label ?? round.id, crop, subject: crops.get(crop).name, indexed: b.indexed, score: b.score, image: b.image });
      }
    }
  }
  return [...best.values()].sort((a, b) => b.indexed - a.indexed || a.model.localeCompare(b.model));
}

/** Each model's best scored painting over all rounds and public subjects, best first. */
export const bestPaintings = R => bestOf(R);

/** Each model's best Ships painting over V1 to V3, best first. */
export const bestShips = R => bestOf(R, { rounds: SHIPS_ROUNDS, crops: [SHIPS_CROP] });


export const labelLines = p => [p.model, `${p.round} ${p.subject} ${Math.round(p.indexed)}% ${p.score.toFixed(2)}`];
