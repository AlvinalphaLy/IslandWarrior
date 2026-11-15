import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { makeServer } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';

const server = makeServer(new MemoryStore(), { staticDir: 'dist' });
let browser;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  await page.evaluateOnNewDocument(() => {
    window.__storyBeats = [];
    window.addEventListener('odyssey:story', (event) => window.__storyBeats.push(event.detail.key));
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/?canvas`);

  /** Exercise the visible popup, including real audio and scene pausing, before returning to gameplay. */
  async function finishStory(expectAudio = false) {
    await page.waitForSelector('.narration-panel');
    if (expectAudio) {
      await page.waitForFunction(
        () => document.querySelector('.narration-state').textContent === 'Speaking…',
      );
    }
    for (let i = 0; i < 18 && (await page.$('.narration-panel')); i++) {
      await page.click('.narration-continue');
      await pause(70);
    }
    assert.equal(await page.$('.narration-panel'), null);
    await pause(150);
  }
  await page.waitForFunction(() => window.game?.scene.getScene('village')?.ship);
  assert.equal(await page.$('#story-widget'), null);

  // Use the existing boarding method; upstream gameplay smoke separately checks keyboard boarding/sailing.
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('village');
    scene.board();
  });
  assert.equal(
    await page.evaluate(() => window.game.registry.get('odysseyVoyage').stage),
    'sailing',
  );
  await page.waitForSelector('.narration-panel');
  assert.equal(await page.evaluate(() => window.game.scene.isPaused('village')), true);
  const before = await page.evaluate(() => window.game.scene.getScene('village').ship.pos.x);
  await page.keyboard.down('d');
  await pause(250);
  await page.keyboard.up('d');
  assert.equal(await page.evaluate(() => window.game.scene.getScene('village').ship.pos.x), before);
  await finishStory(true);

  // Enter Circe's existing sanctuary from the ship through the real transition code.
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('village');
    const statue = scene.statues.find((entry) => entry.it.target === 'circe');
    scene.ship.pos.set(304, 355);
    scene.enterStatue(statue.it, true);
  });
  await page.waitForFunction(() => window.game.scene.isActive('circe'));
  assert.equal(
    await page.evaluate(() => window.game.registry.get('odysseyVoyage').stage),
    'grotto',
  );

  await finishStory(true);

  // Only accepted battle outcomes should emit the victory beat.
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('circe');
    window.game.registry.set('stats', {
      level: 1,
      xp: 0,
      hp: 999,
      maxHp: 999,
      atk: 999,
      potions: 3,
    });
    for (const enemy of scene.enemies) enemy.stunnedUntil = 100000;
    scene.enemies[0].stunnedUntil = 0;
    scene.startBattle(scene.enemies[0]);
  });
  await page.waitForFunction(() => window.game.scene.isActive('battle'));
  await pause(1100);
  await page.keyboard.press('1');
  await page.waitForFunction(
    () => window.game.registry.get('odysseyVoyage').seen.includes('voyage_first_victory'),
    { timeout: 12000 },
  );

  await finishStory(true);

  // Recover the existing chest through interaction, keeping its original inventory rewards.
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('circe');
    const chest = scene.interactables.find((entry) => entry.dialog === 'chest_circe');
    scene.player.setPosition(chest.rect.centerX, chest.rect.bottom + 8);
    scene.player.face('up');
    scene.interact();
  });
  assert.equal(
    await page.evaluate(() => window.game.registry.get('odysseyVoyage').stage),
    'returning',
  );
  assert.ok(
    await page.evaluate(() => window.game.registry.get('openedChests').includes('chest_circe')),
  );

  // Close the ordinary chest dialogue before its queued voiced story takes over.
  for (
    let i = 0;
    i < 8 && (await page.evaluate(() => !!window.game.scene.getScene('circe').dialog));
    i++
  ) {
    await page.keyboard.press('e');
    await pause(80);
  }
  await finishStory(true);

  // Returning via the existing statue landing quietly boards the player and finishes this island only.
  await page.evaluate(() => window.game.scene.start('village', { from: 'circe_statue' }));
  await page.waitForFunction(() => window.game.registry.get('odysseyVoyage').stage === 'complete');
  await finishStory(true);
  const beats = await page.evaluate(() => window.__storyBeats);
  assert.equal(await page.evaluate(() => window.game.registry.get('odysseyStoryQueue').length), 0);
  assert.ok(beats.includes('voyage_departure'));
  assert.ok(beats.includes('voyage_landfall'));
  assert.ok(beats.includes('voyage_challenge'));
  assert.ok(beats.includes('voyage_moly'));
  assert.ok(beats.includes('voyage_departure_aeaea'));
  assert.equal(new Set(beats).size, beats.length);
  assert.deepEqual(errors, []);
  console.log(
    'Voyage smoke passed: board, island entry, real victory, moly chest, return to ship, visible voiced popups, paused movement and drained dialogue queue.',
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
