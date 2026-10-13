// Canary stop for candidate paintings (--canarystop N, default 0 = off).
// After planned pass N the painter saves canary-pass-N.png and canary.json and exits before painting.png, so a
// candidate can be inspected on its first real passages before a full render is spent on it.
import fs from 'node:fs';
import path from 'node:path';

// The pass number to stop after, or 0. Anything but 0 or a planned pass number is an error.
export function canaryStopPass(value, passes) {
  if (!Number.isInteger(value) || value < 0 || value > passes) throw Error('--canarystop must be a planned pass number or 0');
  return value;
}

// Write the checkpoint image and record, close the run's frame and GPU resources, and exit.
export async function stopAtCanary({ out, pass, passes, value, brushMarks, backend, writeImage, close }) {
  const image = `canary-pass-${pass}.png`;
  await writeImage(path.join(out, image));
  const record = { kind: 'actual first passages, not a finished painting or art approval', pass, plannedPasses: passes, value, brushMarks, image, backend };
  fs.writeFileSync(path.join(out, 'canary.json'), JSON.stringify(record, null, 2));
  await close();
  console.log(`canary checkpoint after pass ${pass} of ${passes}; inspect before continuing`);
  process.exit(0);
}
