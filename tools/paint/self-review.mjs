// The finishing step of a session (the owner: "ask them to self assess"): before a model may hand in it takes a look
// and writes self-review.md: the five worst differences between its dried sheet and the subject, each with where it
// is in millimetres and what it would do, and one last line saying how many of them are major. While a major fault
// remains and time remains it must go on; it may hand in early only by saying none remains. No score is shown and no
// one judges the review: it is the model's own. This module reads the file and says whether the session may end.
//
//   # Self-review of look 7
//   1. (120, 210 mm) the near eye is a flat brown patch, the subject's has a dark upper lid and a light iris: ...
//   ... five numbered lines ...
//   Major faults remaining: none        (or a number)
// A major fault: a form not built, a value far off, a colour wrong, an area left bare that the subject paints.

/** Minutes of its own time a session must still have for the harness to send it back to work. */
export const LEAST_MINUTES_LEFT = 8;
/** How many times a session is sent back, at most. */
export const MOST_RETURNS = 3;

/**
 * A self-review read: {ok: it lets the session end, why: what is wrong with it or what it says remains, look: the look
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

/** The words that send a session back to work, or null when it may end. `minutesLeft` of its own time. */
export function returnPrompt(review, { minutesLeft, turn }) {
  if (review.ok || minutesLeft < LEAST_MINUTES_LEFT || turn > MOST_RETURNS) return null;
  return `You stopped with about ${Math.floor(minutesLeft)} of your minutes left, and your painting is not handed in yet: ${review.why}.

The finishing step (TASK.md, "Before you stop") is not done. Do it now, in this folder, where all your files still are:
1. Take a look at your present choice (\`./unpaint look\`) and open its \`beside.png\`: your dried sheet beside the subject.
2. Write \`self-review.md\`: first line \`# Self-review of look N\` (N the look you just took), then the FIVE worst differences between your dried sheet and the subject, numbered, each with where it is in millimetres, what differs, and what you would do about it; last line \`Major faults remaining: none\` or \`Major faults remaining: <how many>\`. A major fault is a form not built, a value far off, a colour wrong, or an area left bare that the subject paints.
3. If a major fault remains, put it right (change your choice, plan, look), then review again. Hand in early only when your review of your LAST look says none remains.
No score is shown to you and nobody marks the review: it is your own judgment of your own sheet. Use the time you have.`;
}
