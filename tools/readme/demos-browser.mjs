// Headless Chromium with demos/ served at DEMOS_ORIGIN, for tools that record the demo pages.
// CHROME names a Chromium binary when Google Chrome is not installed.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DEMOS = path.resolve(import.meta.dirname, '..', '..', 'demos');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };
export const DEMOS_ORIGIN = 'https://demos.invalid';

export function launchChromium(args = []) {
  return chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }), headless: true, args });
}

export async function serveDemos(context) {
  await context.route(`${DEMOS_ORIGIN}/**`, async route => {
    let rel = decodeURIComponent(new URL(route.request().url()).pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(DEMOS, '.' + rel);
    if (!file.startsWith(DEMOS + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      await route.fulfill({ status: 404, body: '' }); return;
    }
    await route.fulfill({ path: file, contentType: TYPES[path.extname(file)] ?? 'application/octet-stream' });
  });
}
