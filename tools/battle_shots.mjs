// Screenshots of the battle animations, one enemy at a time (needs a dev server).
// node tools/battle_shots.mjs [outDir]   env URL defaults to http://localhost:5173/?canvas
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.URL || 'http://localhost:5173/?canvas';
const OUT = process.argv[2] || 'cache';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.game?.scene?.getScene('village')?.player, {
  timeout: 20000,
});

for (const [enemy, move] of [
  ['polyphemus', 'Hurl Boulder'],
  ['siren', 'Bewitching Song'],
  ['shade', 'Spectral Spear'],
]) {
  await page.evaluate((enemyId) => {
    const g = window.game;
    g.scene.pause('village');
    g.scene.start('battle', { enemyId, mapKey: 'village' });
  }, enemy);
  await sleep(1300);
  await page.screenshot({ path: `${OUT}/battle_${enemy}_0_idle.png` });
  // force the enemy's signature move, then attack
  await page.evaluate((name) => {
    const b = window.game.scene.getScene('battle');
    const m = b.def.moves.find((x) => x.name === name);
    b.pickMove = () => m;
  }, move);
  await page.keyboard.press('Digit1');
  await sleep(330);
  await page.screenshot({ path: `${OUT}/battle_${enemy}_1_thrust.png` });
  await sleep(1150);
  await page.screenshot({ path: `${OUT}/battle_${enemy}_2_windup.png` });
  await sleep(enemy === 'polyphemus' ? 650 : 500);
  await page.screenshot({ path: `${OUT}/battle_${enemy}_3_attack.png` });
  await sleep(1500);
  await page.evaluate(() => {
    const g = window.game;
    g.scene.stop('battle');
    document.getElementById('battle').style.display = 'none';
  });
  await sleep(200);
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
