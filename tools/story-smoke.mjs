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
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?canvas`);
  await page.waitForSelector('#story-begin');
  await page.waitForFunction(() => window.game?.scene.getScene('village')?.player);

  /** Finish each card through the real reveal/continue controls. */
  async function finishCards() {
    for (let i = 0; i < 12 && (await page.$('.narration-panel')); i++) {
      await page.click('.narration-continue');
      await pause(70);
    }
    assert.equal(await page.$('.narration-panel'), null);
    await pause(100);
  }

  /** Position the player for a real NPC interaction without replacing quest state. */
  async function talk(map, key) {
    await page.evaluate(
      ({ map, key }) => {
        const scene = window.game.scene.getScene(map),
          npc = scene.npcs.find((n) => n.dialogKey === key);
        scene.player.setPosition(npc.x, npc.y - 12);
        scene.player.face('down');
      },
      { map, key },
    );
    await pause(100);
    await page.keyboard.press('e');
    await page.waitForSelector('.narration-panel');
    await finishCards();
  }

  /** Change existing maps to isolate quest events; door collision is covered by the original game smoke. */
  async function enter(map) {
    await page.evaluate((map) => window.game.scene.start(map), map);
    await page.waitForFunction(
      (map) => window.game.scene.getScenes(true).some((s) => s.scene.key === map),
      {},
      map,
    );
    await pause(500);
  }

  await page.click('#story-begin');
  await page.keyboard.press('Escape');
  await pause(100);
  assert.equal(
    await page.evaluate(() => window.game.registry.get('odysseyStory')?.started ?? false),
    false,
  );
  await page.click('#story-begin');
  await finishCards();
  assert.equal(await page.evaluate(() => window.game.registry.get('odysseyStory').chapter), 0);
  await talk('village', 'kai');
  await talk('village', 'mira');
  await enter('cave');
  await talk('cave', 'fungus_king');
  await talk('cave', 'cleric');
  await enter('dungeon');
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('dungeon');
    window.game.registry.set('stats', {
      level: 1,
      xp: 0,
      hp: 999,
      maxHp: 999,
      atk: 999,
      potions: 3,
    });
    scene.startBattle(scene.enemies.find((e) => e.enemyId === 'gumball_golem'));
  });
  await page.waitForFunction(() => window.game.scene.isActive('battle'));
  await pause(1000);
  await page.keyboard.press('1');
  await page.waitForSelector('.narration-panel', { timeout: 10000 });
  await page.keyboard.press('Escape');
  await pause(100);
  assert.equal(await page.evaluate(() => window.game.registry.get('odysseyStory').chapter), 4);
  await page.click('#story-begin');
  await finishCards();
  await enter('village');
  await talk('village', 'wren');
  await talk('village', 'tobin');
  assert.equal(
    await page.evaluate(() => window.game.registry.get('odysseyStory').completed.length),
    7,
  );
  assert.ok(
    (await page.$eval('#story-objective', (e) => e.textContent)).includes('Homecoming complete'),
  );
  assert.deepEqual(errors, []);
  console.log(
    'Story smoke passed: opening/cancel, four NPC chapters, real guardian victory, recovery after cancellation, return and ending.',
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
