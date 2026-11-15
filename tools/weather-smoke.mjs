import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { makeServer } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';

const server = makeServer(new MemoryStore(), { staticDir: 'dist' });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser;
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  browser = await puppeteer.launch({
    executablePath:
      process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const url = `http://127.0.0.1:${server.address().port}/?canvas`;
  /** Wait for scene creation rather than treating a visible canvas as a ready game. */
  async function ready(map = 'village') {
    await page.waitForFunction(
      (key) => window.game?.scene.isActive(key) && window.game.scene.getScene(key).weather,
      {},
      map,
    );
  }
  await page.goto(url);
  await ready();
  await page.click('#weather');
  await pause(800);
  assert.ok(
    await page.evaluate(() => {
      const s = window.game.scene.getScene('village');
      return (
        s.weather.enabled &&
        !!s.weather.rain &&
        s.npcs.every((n) => !n.visible && !n.body.enable) &&
        s.campfires.every((c) => c.texture.key === 'campfire_out')
      );
    }),
  );
  // Exercise the real pending lightning callbacks, then turn them off before they execute.
  await page.evaluate(() => window.game.scene.getScene('village').weather.lightning());
  await page.click('#weather');
  await pause(1200);
  assert.ok(
    await page.evaluate(() => {
      const s = window.game.scene.getScene('village');
      return (
        !s.weather.enabled &&
        !s.weather.dark &&
        !s.weather.rain &&
        s.npcs.every((n) => n.visible && n.body.enable) &&
        s.campfires.every((c) => c.texture.key === 'campfire_ss' && c.anims.isPlaying)
      );
    }),
  );
  await page.keyboard.press('n');
  await page.reload();
  await ready();
  assert.equal(
    await page.evaluate(() => window.game.scene.getScene('village').weather.enabled),
    true,
  );
  await page.evaluate(() => window.game.scene.getScene('village').scene.start('cave'));
  await ready('cave');
  assert.ok(
    await page.evaluate(() => {
      const s = window.game.scene.getScene('cave');
      return (
        s.weather.enabled &&
        !s.weather.rain &&
        !s.weather.dark &&
        s.npcs.every((n) => n.visible && n.body.enable)
      );
    }),
  );
  await page.evaluate(() => window.game.scene.getScene('cave').scene.start('village'));
  await ready();
  assert.equal(
    await page.evaluate(() => !!window.game.scene.getScene('village').weather.rain),
    true,
  );
  await page.evaluate(() => window.game.scene.getScene('village').board());
  await page.waitForSelector('.narration-panel');
  await page.evaluate(() => document.getElementById('weather').click());
  assert.equal(
    await page.evaluate(() => window.game.scene.getScene('village').weather.enabled),
    true,
  );
  await page.keyboard.press('Escape');
  await pause(150);
  await page.click('#weather');
  assert.equal(
    await page.evaluate(() => window.game.scene.getScene('village').weather.enabled),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    'Weather smoke passed: night/day controls, lightning cancellation, NPC/fire restoration, persistence, indoor exclusion, scene restart and story input guard.',
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
