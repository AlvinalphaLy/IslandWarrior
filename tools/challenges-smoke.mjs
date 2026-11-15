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
  await page.goto(`http://127.0.0.1:${server.address().port}/?canvas`);
  await page.waitForFunction(() => window.game?.scene.getScene('village')?.ship);

  /** Drive the visible narration controls, never replacing quest progress or reward registry data. */
  async function finishNarration(required = true) {
    if (required) await page.waitForSelector('.narration-panel');
    for (let i = 0; i < 50 && (await page.$('.narration-panel')); i++) {
      await page.click('.narration-continue');
      await pause(50);
    }
    assert.equal(await page.$('.narration-panel'), null);
    await pause(100);
  }
  /** Use real statue transitions; their decorative awakening animations are tested separately upstream. */
  async function enter(map) {
    await page.evaluate((map) => {
      const scene = window.game.scene.getScene('village');
      const statue = scene.statues.find((entry) => entry.it.target === map);
      scene.enterStatue(statue.it, true);
    }, map);
    await page.waitForFunction((map) => window.game.scene.isActive(map), {}, map);
    await pause(400);
    await finishNarration(false);
  }
  /** Wait through the existing victory banner and automatic ship return, then finish the success dialogue. */
  async function victoryReturn(map) {
    await page.waitForFunction(
      () =>
        document.getElementById('victory')?.classList.contains('show') &&
        window.game.scene.getScenes(true).some((s) => s.cutscene),
      { timeout: 15000 },
    );
    assert.equal(await page.$('.narration-panel'), null);
    await page.waitForFunction(() => window.game.scene.isActive('village'), { timeout: 15000 });
    await finishNarration();
    assert.ok(
      await page.evaluate((map) => window.game.registry.get('challengesWon').includes(map), map),
    );
  }
  await page.evaluate(() => window.game.scene.getScene('village').board());
  await finishNarration();

  await enter('circe');
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
    const boss = scene.enemies.find((enemy) => enemy.spawnName === 'siren_b');
    boss.stunnedUntil = 0;
    scene.startBattle(boss);
  });
  await page.waitForFunction(() => window.game.scene.isActive('battle'));
  await pause(1100);
  await page.keyboard.press('1');
  await victoryReturn('circe');
  assert.equal(await page.evaluate(() => window.game.registry.get('playerSkin')), 'faze');
  assert.ok(
    await page.evaluate(() => window.game.registry.get('openedChests').includes('chest_circe')),
  );

  await enter('cyclops');
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('cyclops');
    scene.player.setPosition(120, 84);
    scene.archery.pickUp();
  });
  for (
    let i = 0;
    i < 10 && (await page.evaluate(() => !!window.game.scene.getScene('cyclops').dialog));
    i++
  ) {
    await page.keyboard.press('e');
    await pause(80);
  }
  await finishNarration();
  const oldMax = await page.evaluate(() => window.game.registry.get('stats').maxHp);
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('cyclops');
    scene.player.setPosition(40, 256);
    scene.player.body.reset(40, 256);
    scene.player.setPosition(40, 256);
    scene.player.face('right');
  });
  await page.keyboard.press('f');
  await victoryReturn('cyclops');
  assert.equal(await page.evaluate(() => window.game.registry.get('stats').maxHp), oldMax + 10);
  assert.ok(
    await page.evaluate(() => window.game.registry.get('defeated').includes('cyclops:polyphemus')),
  );

  await enter('telepylus');
  // Actual hull-hit handler verifies wreck/retry feedback without waiting for a randomized throw.
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('telepylus');
    const stats = window.game.registry.get('stats');
    window.game.registry.set('stats', { ...stats, hp: 1 });
    scene.harbor.land(scene.ship.pos.x, scene.ship.pos.y);
  });
  await page.waitForFunction(() => window.game.scene.isActive('village'), { timeout: 10000 });
  await finishNarration();
  assert.equal(await page.evaluate(() => window.game.registry.get('shipLevel') ?? 0), 0);
  await enter('telepylus');
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('telepylus');
    scene.ship.pos.set(scene.physics.world.bounds.width / 2, scene.physics.world.bounds.height - 3);
  });
  await page.keyboard.down('s');
  await pause(400);
  await page.keyboard.up('s');
  await victoryReturn('telepylus');
  assert.equal(await page.evaluate(() => window.game.registry.get('shipLevel')), 1);
  const progress = await page.evaluate(() => window.game.registry.get('odysseyVoyage'));
  assert.deepEqual([...progress.completedChallenges].sort(), ['circe', 'cyclops', 'telepylus']);
  assert.deepEqual(errors, []);
  console.log(
    'Challenge smoke passed: Circe reward/return, real archery win and wine reward, harbor wreck/retry/escape, bronze ship prize, voiced story ordering.',
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
