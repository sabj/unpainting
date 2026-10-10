import fs from 'node:fs';

// Planning-only callers enter the same CLI as physical painting. Neither may
// erase a previous run just because its --out argument was inherited.
export function prepareOutputDirectory(directory) {
  if (fs.existsSync(directory)) {
    if (!fs.lstatSync(directory).isDirectory()) {
      throw new Error(`Painter output must be a real directory: ${directory}`);
    }
    if (fs.readdirSync(directory).length !== 0) {
      throw new Error(`Painter output already contains files; choose a fresh --out directory: ${directory}`);
    }
  } else {
    fs.mkdirSync(directory, { recursive: true });
  }
  return directory;
}
