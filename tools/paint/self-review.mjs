// A session's own review of its last sheet (the owner: "ask them to self assess"): the brief invites the model to
// take a last look and write self-review.md, the five worst differences between its dried sheet and the subject, each
// with where it is in millimetres and what it would do, and one last line saying how many of them are major. It is
// the model's own judgment: no score is shown, nobody marks it, and it is never a gate. A session hands in when it
// chooses to. This module reads the file for the record (was one written, of which look, how many faults it names).
//
//   # Self-review of look 7
//   1. (120, 210 mm) the near eye is a flat brown patch, the subject's has a dark upper lid and a light iris: ...
//   ... five numbered lines ...
//   Major faults remaining: none        (or a number)
// A major fault: a form not built, a value far off, a colour wrong, an area left bare that the subject paints.

/**
 * A self-review read: {ok: a full review of the last look that names no major fault, why: what it lacks or says remains, look: the look
 * it reviews, items: the differences it lists, major: 'none' | a count | null}. `text` is self-review.md or null;
 * `looks` how many looks the session has taken (the review must be of the last one).
 */
export function readSelfReview(text, looks) {
  if (text == null || !String(text).trim()) return { ok: false, why: 'there is no self-review.md', look: null, items: 0, major: null };
  const t = String(text), look = Number(/self-review of look\s+(\d+)/i.exec(t)?.[1] ?? NaN);
  const items = t.split('\n').filter(l => /^\s*\d+[.)]\s+\S/.test(l) && /\d\s*mm/i.test(l)).length;
  const m = /major faults remaining\s*:\s*(none|\d+)/i.exec(t), major = m ? (m[1].toLowerCase() === 'none' || m[1] === '0' ? 'none' : Number(m[1])) : null;
  const base = { look: Number.isFinite(look) ? look : null, items, major };
  if (!(looks > 0)) return { ...base, ok: false, why: 'no look has been taken: a review is of the dried sheet of a look' };
  if (base.look !== looks) return { ...base, ok: false, why: `it reviews ${base.look == null ? 'no look by number (its first line is "# Self-review of look N")' : `look ${base.look}`}, and your last look is look ${looks}: review the sheet as it stands now` };
  if (items < 5) return { ...base, ok: false, why: `it lists ${items} differences with their place in millimetres; five are asked for (numbered lines, each with where in mm, what differs from the subject, and what you would do)` };
  if (major == null) return { ...base, ok: false, why: 'its last line must say "Major faults remaining: none" or "Major faults remaining: <how many>"' };
  if (major !== 'none') return { ...base, ok: false, why: `it says ${major} major fault${major === 1 ? '' : 's'} remain${major === 1 ? 's' : ''}` };
  return { ...base, ok: true, why: null };
}
