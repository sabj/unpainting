import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

// A 40 × 30 mm sheet exercises the real worker without a full-size painting.
test('studio DOM, first stroke, presets, focus tools and pan work on a tiny live sheet', { timeout: 25000 }, async () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
      const bytes = await readFile(file); res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(bytes);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }) });
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.__studioMessages = [];
      window.Worker = class extends NativeWorker {
        postMessage(message, ...rest) {
          if (message.type === 'reset') message = { ...message, paperW: 40 / 25.4, paperH: 30 / 25.4, dpi: 60 };
          if (['down', 'up', 'redip'].includes(message.type)) window.__studioMessages.push(message);
          return super.postMessage(message, ...rest);
        }
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/demos/lab/?physics=cpu&render=cpu&dpi=60`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__lab?.frames > 0 && window.__lab.sheet.width < 100);
    const visible = selector => page.locator(selector).isVisible();
    assert.equal(await visible('#welcome'), true);
    assert.equal(await visible('#run-settings'), false);
    assert.equal(await visible('#operation-timeline'), false);
    await page.locator('#more-settings').evaluate(el => { el.open = true; });
    await page.locator('[data-model=section]').click();
    assert.equal(await page.locator('[data-model=section]').getAttribute('aria-pressed'), 'true');
    await page.locator('#more-settings').evaluate(el => { el.open = false; });
    await page.locator('[data-preset=dry]').click();
    const sheet = await page.locator('#sheet').boundingBox();
    assert.ok(sheet.height > 600, 'paper uses the desktop viewport');
    const x = sheet.x + sheet.width * .2, y = sheet.y + sheet.height * .3;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 100, y + 10, { steps: 3 }); await page.mouse.up();
    await page.waitForFunction(() => window.__lab.lastContact?.phase === 'up' && window.__lab.load);
    assert.equal(await visible('#welcome'), false);
    const down = await page.evaluate(() => window.__studioMessages.find(m => m.type === 'down'));
    assert.equal(down.tool.water, .35); assert.equal(down.tool.amount, .75); assert.equal(down.tool.pressure, .55);
    assert.equal(down.tool.model, 'section', 'the selected model reaches the real stroke worker');
    await page.keyboard.press('Shift+Digit4');
    assert.equal(await page.locator('#size').inputValue(), '3');
    assert.equal(await page.locator('[data-preset=detail]').getAttribute('aria-pressed'), 'true');
    await page.locator('#water').evaluate(el => { el.value = '1'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.locator('[data-preset=detail]').getAttribute('aria-pressed'), 'false');
    await page.locator('#canvas').focus(); await page.keyboard.press('Digit1');
    assert.equal(await page.locator('#pigments button').first().getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('x');
    assert.ok(await page.evaluate(() => window.__studioMessages.some(m => m.type === 'redip')));
    await page.locator('#studio-toggle').click(); assert.equal(await visible('#operation-timeline'), true);
    await page.locator('#studio-toggle').click();
    await page.locator('#canvas').focus(); await page.keyboard.press('h');
    assert.equal(await visible('#focus-dock'), true);
    for (const action of ['redo','dry-layer','redip','clear','exit-focus']) assert.equal(await visible(`#focus-dock [data-action="${action}"]`), true);
    await page.locator('#focus-dock [data-tool=flat]').click();
    assert.equal(await page.locator('.panel [data-tool=flat]').getAttribute('aria-pressed'), 'true');
    await page.locator('#focus-pigment').click(); await page.locator('#focus-palette button').nth(2).click();
    assert.equal(await page.locator('#pigments button').nth(2).getAttribute('aria-pressed'), 'true');
    await page.locator('#canvas').focus();
    const focusSheet = await page.locator('#sheet').boundingBox();
    await page.mouse.move(focusSheet.x + 100, focusSheet.y + 100); await page.mouse.wheel(0, -300);
    await page.waitForFunction(() => window.__lab.view?.zoom > 1);
    const before = await page.evaluate(() => ({ view: window.__lab.view, downs: window.__studioMessages.filter(m => m.type === 'down').length }));
    await page.keyboard.down('Space'); await page.mouse.down(); await page.mouse.move(focusSheet.x + 150, focusSheet.y + 120); await page.mouse.up(); await page.keyboard.up('Space');
    const after = await page.evaluate(() => ({ view: window.__lab.view, downs: window.__studioMessages.filter(m => m.type === 'down').length }));
    assert.equal(after.downs, before.downs, 'pan does not paint'); assert.ok(after.view.panX > before.view.panX);
    await page.keyboard.press('Digit0'); assert.equal(await page.evaluate(() => window.__lab.view.zoom), 1);
    await page.keyboard.press('Space'); await page.waitForFunction(() => document.getElementById('pause').getAttribute('aria-pressed') === 'true');
    if (process.env.STUDIO_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.STUDIO_SCREENSHOT_DIR, 'studio-focus.png') });
    await page.keyboard.press('Escape'); assert.equal(await visible('#focus-dock'), false);
    for (const [width, height] of [[390, 844], [844, 390]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no overflow at ${width}`);
      await page.locator('#focus-view').click();
      const dock = await page.locator('#focus-dock').boundingBox();
      assert.ok(dock.x >= 0 && dock.x + dock.width <= width + 1); assert.ok(dock.y + dock.height <= height);
      await page.keyboard.press('Escape');
    }
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 1365, height: 900 });
    if (process.env.STUDIO_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.STUDIO_SCREENSHOT_DIR, 'studio-dark.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve));
  }
});
