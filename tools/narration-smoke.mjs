import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { makeServer } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
const server = makeServer(new MemoryStore(), { staticDir: 'dist' });
let browser;
try {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await puppeteer.launch({
    executablePath:
      process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Force an audio failure to keep fallback coverage even after real MP3s are generated.
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().includes('/assets/voice/')) void request.respond({ status: 404, body: '' });
    else void request.continue();
  });
  await page.goto(base + '/narration-preview.html');
  await page.click('#preview-controls button:nth-child(6)'); // Oracle with deliberately unavailable audio.
  await page.waitForSelector('.narration-panel');
  await page.waitForFunction(() =>
    document.querySelector('.narration-state').textContent.startsWith('Text only'),
  );
  await page.keyboard.press('e');
  assert.equal(
    await page.$eval('.narration-text', (e) => e.querySelectorAll('span').length),
    await page.$$eval('.narration-text .visible', (e) => e.length),
  );
  await page.screenshot({ path: '/tmp/islandwarrior-narration-desktop.png' });
  await page.click('.narration-mute');
  assert.equal(await page.$eval('.narration-mute', (e) => e.getAttribute('aria-pressed')), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await page.$('.narration-panel'), null);
  await page.click('#preview-controls button:first-child');
  assert.equal(await page.$eval('.narration-mute', (e) => e.getAttribute('aria-pressed')), 'true');
  await page.keyboard.press('e');
  await page.click('.narration-continue');
  assert.equal(await page.$eval('.narration-counter', (e) => e.textContent), '2 / 2');
  await page.click('.narration-replay');
  assert.equal(await page.$eval('.narration-counter', (e) => e.textContent), '2 / 2');
  await page.keyboard.press('Escape');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.click('#preview-controls button:nth-child(6)');
  await page.keyboard.press('e');
  const box = await page.$eval('.narration-panel', (e) => {
    const r = e.getBoundingClientRect();
    return {
      x: r.x,
      right: r.right,
      bottom: r.bottom,
      width: innerWidth,
      height: innerHeight,
      scroll: e.scrollWidth,
      client: e.clientWidth,
    };
  });
  assert.ok(box.x >= 0 && box.right <= box.width && box.bottom <= box.height);
  assert.ok(box.scroll <= box.client + 1);
  await page.screenshot({ path: '/tmp/islandwarrior-narration-mobile.png' });
  await page.keyboard.press('Escape');
  // Synthetic audio lifecycle only; proves stopping/replay without claiming generated speech.
  await page.evaluateOnNewDocument(() => {
    window.__audio = [];
    window.Audio = class extends EventTarget {
      constructor(src) {
        super();
        this.src = src;
        this.duration = 4;
        this.paused = false;
        window.__audio.push(this);
      }
      async play() {
        this.dispatchEvent(new Event('loadedmetadata'));
        this.dispatchEvent(new Event('playing'));
      }
      pause() {
        this.paused = true;
      }
      removeAttribute() {
        this.src = '';
      }
      load() {}
    };
  });
  await page.reload();
  await page.evaluate(() => localStorage.removeItem('islandwarrior.narration.muted'));
  await page.click('#preview-controls button:first-child');
  await page.waitForFunction(
    () => document.querySelector('.narration-state').textContent === 'Speaking…',
  );
  await page.click('.narration-replay');
  assert.equal(await page.evaluate(() => window.__audio[0].paused), true);
  await page.keyboard.press('e');
  assert.equal(await page.evaluate(() => window.__audio.at(-1).paused), true);
  await page.click('.narration-continue');
  await page.click('.narration-close');
  assert.equal(await page.evaluate(() => window.__audio.every((a) => a.paused)), true);
  // A fresh page uses real browser audio to validate generated clips and playback readiness.
  const real = await browser.newPage();
  real.on('pageerror', (e) => errors.push(e.message));
  await real.goto(base + '/narration-preview.html');
  await real.evaluate(() => localStorage.removeItem('islandwarrior.narration.muted'));
  const manifest = await real.evaluate(async () => {
    const r = await fetch('/assets/voice/manifest.json');
    return r.ok ? r.json() : {};
  });
  const durations = await real.evaluate(
    async (manifest) =>
      Promise.all(
        Object.values(manifest).map(
          (clip) =>
            new Promise((resolve, reject) => {
              const a = new Audio('/assets/voice/' + clip.file);
              const timer = setTimeout(() => reject(Error('Audio metadata timeout')), 10000);
              a.onloadedmetadata = () => {
                clearTimeout(timer);
                const duration = a.duration;
                a.removeAttribute('src');
                a.load();
                resolve(duration);
              };
              a.onerror = () => {
                clearTimeout(timer);
                reject(Error('Generated MP3 cannot be decoded'));
              };
              a.load();
            }),
        ),
      ),
    manifest,
  );
  assert.ok(durations.every((d) => Number.isFinite(d) && d > 0));
  if (manifest.intro_1) {
    await real.click('#preview-controls button:first-child');
    await real.waitForFunction(
      () => document.querySelector('.narration-state').textContent === 'Speaking…',
    );
    await real.click('.narration-close');
  }
  console.log(
    `Validated ${durations.length} real generated MP3 durations and intro playback when available.`,
  );
  assert.deepEqual(errors, []);
  console.log(
    'Narration smoke passed: captions without audio, reveal/advance, mute persistence, replay/stop, close and mobile layout.',
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
