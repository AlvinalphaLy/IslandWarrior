import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { makeServer } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
const server = makeServer(new MemoryStore(), { harness: true, staticDir: 'dist' });
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
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/integrations');
  await page.click('#start');
  await page.waitForFunction(() => !document.querySelector('#event').disabled);
  await page.click('#event');
  await page.waitForFunction(() =>
    document.querySelector('#output').textContent.includes('inserted'),
  );
  await page.click('#finish');
  await page.waitForFunction(() => !document.querySelector('#start').disabled);
  await page.click('#recap');
  await page.waitForFunction(() =>
    document.querySelector('#output').textContent.includes('damageEvents'),
  );
  const recap = JSON.parse(await page.$eval('#output', (e) => e.textContent));
  assert.equal(recap.outcome, 'victory');
  assert.equal(recap.counts.harness, 1);
  assert.equal(recap.counts.chert, 0);
  assert.equal(recap.damageEvents.length, 1);
  await page.goto(base + '/game/?canvas');
  await page.waitForSelector('canvas');
  assert.deepEqual(errors, []);
  console.log('Browser smoke passed: harness start/event/finish/recap and existing game canvas.');
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
