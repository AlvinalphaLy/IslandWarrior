// Headless smoke test: loads the game, screenshots views, checks movement + collision.
// Usage: npm run dev (in another terminal), then: node tools/smoke.mjs
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// ?canvas: headless Chrome's software WebGL is flaky, the Canvas renderer is deterministic
const URL = process.env.URL || 'http://localhost:5173/?canvas';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 810 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.game?.scene?.getScene('village')?.player, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 800));
const state = () => page.evaluate(() => {
  const s = window.game.scene.getScene('village');
  return { x: Math.round(s.player.x), y: Math.round(s.player.y), npcs: s.npcs.length, doors: s.portals.length, objects: s.children.list.length };
});
const tap = async (key) => { await page.keyboard.press(key); await new Promise((r) => setTimeout(r, 150)); };
const hold = async (key, ms) => { await page.keyboard.down(key); await new Promise((r) => setTimeout(r, ms)); await page.keyboard.up(key); };
console.log('start', await state());
await page.screenshot({ path: 'cache/shot_start.png' });
await page.keyboard.press('KeyM'); await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: 'cache/shot_overview.png' });
await page.keyboard.press('F1'); await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: 'cache/shot_debug.png' });
await page.keyboard.press('F1'); await page.keyboard.press('KeyM');
const s0 = await state();
await hold('KeyD', 600); const s1 = await state();
console.log('walk right', s0, '->', s1, s1.x > s0.x ? 'OK' : 'FAIL');
await hold('KeyS', 3000); const s2 = await state();
console.log('walk down 3s (should stop at shore, not reach map bottom 400):', s2, s2.y < 395 ? 'OK' : 'FAIL');
await hold('KeyA', 3000); const s3 = await state();
console.log('walk left 3s:', s3);
await page.screenshot({ path: 'cache/shot_walk.png' });
// talk: put the NPC at home and the player just above it, facing down
await page.evaluate(() => {
  const s = window.game.scene.getScene('village'); const n = s.npcs.find((n) => n.displayName === 'Kai');
  n.talking = true; n.setPosition(n.home.x, n.home.y); s.player.setPosition(n.x, n.y - 12); s.player.face('down');
});
await new Promise((r) => setTimeout(r, 200));
await page.keyboard.press('KeyE'); await new Promise((r) => setTimeout(r, 300));
const dlg = await page.evaluate(() => { const d = document.getElementById('dialog'); return d.style.display + ' | ' + d.innerText.split(String.fromCharCode(10)).join(' '); });
console.log('dialog after E:', dlg, dlg.startsWith('block') ? 'OK' : 'FAIL');
await page.screenshot({ path: 'cache/shot_dialog.png' });
await tap('KeyE'); await tap('KeyE');
console.log('dialog closed:', await page.evaluate(() => document.getElementById('dialog').style.display));
// door -> cave: stand under the left red house door and walk up
const active = () => page.evaluate(() => window.game.scene.getScenes(true).map((x) => x.scene.key).join(','));
const doorId = await page.evaluate(() => {
  const s = window.game.scene.getScene('village'); const d = s.portals.find((d) => d.tile.x < 100 && d.tile.y > 150) || s.portals[0];
  s.player.setPosition(d.rect.centerX, d.rect.bottom + 8); s.player.face('up'); return d.id;
});
await page.keyboard.down('KeyW'); await new Promise((r) => setTimeout(r, 1600)); await page.keyboard.up('KeyW');
const inCave = await active();
console.log(`enter ${doorId}: active scene =`, inCave, inCave === 'cave' ? 'OK' : 'FAIL');
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: 'cache/shot_cave.png' });
await page.keyboard.press('KeyM'); await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: 'cache/shot_cave_overview.png' });
await page.keyboard.press('KeyM');
// talk to the Fungus King
await page.evaluate(() => {
  const s = window.game.scene.getScene('cave'); const n = s.npcs.find((n) => n.displayName === 'Fungus King');
  s.player.setPosition(n.x, n.y + 14); s.player.face('up');
});
await new Promise((r) => setTimeout(r, 200));
await page.keyboard.press('KeyE'); await new Promise((r) => setTimeout(r, 300));
const kingDlg = await page.evaluate(() => document.querySelector('#dialog .name').textContent + ' ' + document.getElementById('dialog').style.display);
console.log('cave dialog:', kingDlg, kingDlg.includes('Fungus King block') ? 'OK' : 'FAIL');
await page.screenshot({ path: 'cache/shot_cave_dialog.png' });
await tap('KeyE'); await tap('KeyE');
// ladder -> back to the same house door
await page.evaluate(() => {
  const s = window.game.scene.getScene('cave'); const e = s.portals.find((p) => p.kind === 'exit');
  s.player.setPosition(e.rect.centerX, e.rect.bottom + 10); s.player.face('up');
});
await page.keyboard.down('KeyW'); await new Promise((r) => setTimeout(r, 1500)); await page.keyboard.up('KeyW');
await new Promise((r) => setTimeout(r, 400));
const back = await page.evaluate(() => {
  const s = window.game.scene.getScene('village'); const d = s.portals.find((p) => p.id === s.arrival.from);
  return { scenes: window.game.scene.getScenes(true).map((x) => x.scene.key).join(','), from: s.arrival.from,
           dist: d ? Math.round(Math.hypot(s.player.x - d.rect.centerX, s.player.y - d.rect.bottom)) : -1 };
});
console.log('ladder exit:', back, back.scenes === 'village' && back.from === doorId && back.dist < 20 ? 'OK' : 'FAIL');
await page.screenshot({ path: 'cache/shot_back.png' });
// locked door: house_1 (top-left blue house) has no target
await page.evaluate(() => {
  const s = window.game.scene.getScene('village'); const d = s.portals.find((p) => p.id === 'house_1');
  s.player.setPosition(d.rect.centerX, d.rect.bottom + 8); s.player.face('up');
});
await new Promise((r) => setTimeout(r, 200));
await page.keyboard.down('KeyW'); await new Promise((r) => setTimeout(r, 600)); await page.keyboard.up('KeyW');
const locked = await page.evaluate(() => [document.getElementById('toast').innerText, window.game.scene.getScenes(true).map((x) => x.scene.key).join(',')]);
console.log('locked door:', locked, locked[0].includes('locked') && locked[1] === 'village' ? 'OK' : 'FAIL');
// dungeon: house_5
await page.evaluate(() => {
  const s = window.game.scene.getScene('village'); const d = s.portals.find((p) => p.id === 'house_5');
  s.player.setPosition(d.rect.centerX, d.rect.bottom + 8); s.player.face('up');
});
await new Promise((r) => setTimeout(r, 200));
await page.keyboard.down('KeyW'); await new Promise((r) => setTimeout(r, 1600)); await page.keyboard.up('KeyW');
await new Promise((r) => setTimeout(r, 500));
const inDungeon = await active();
console.log('enter house_5: active scene =', inDungeon, inDungeon === 'dungeon' ? 'OK' : 'FAIL');
await page.screenshot({ path: 'cache/shot_dungeon.png' });
await page.keyboard.press('KeyM'); await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: 'cache/shot_dungeon_overview.png' });
await page.keyboard.press('KeyM');
// battle: walk into the first mole
const enemiesBefore = await page.evaluate(() => {
  const s = window.game.scene.getScene('dungeon'); const e = s.enemies.find((e) => e.spawnName === 'mole_a');
  s.player.setPosition(e.x - 30, e.y); s.player.face('right'); return s.enemies.length;
});
await new Promise((r) => setTimeout(r, 200));
await page.keyboard.down('KeyD'); await new Promise((r) => setTimeout(r, 900)); await page.keyboard.up('KeyD');
await new Promise((r) => setTimeout(r, 1200));
const inBattle = await active();
console.log('battle started:', inBattle, inBattle.includes('battle') ? 'OK' : 'FAIL');
await page.screenshot({ path: 'cache/shot_battle.png' });
for (let i = 0; i < 12 && (await active()).includes('battle'); i++) { await page.keyboard.press('Digit1'); await new Promise((r) => setTimeout(r, 2000)); }
await new Promise((r) => setTimeout(r, 800));
const after = await page.evaluate(() => {
  const s = window.game.scene.getScene('dungeon');
  return { scenes: window.game.scene.getScenes(true).map((x) => x.scene.key).join(','), enemies: s.enemies.length,
           defeated: window.game.registry.get('defeated'), stats: window.game.registry.get('stats'), hud: document.getElementById('hud').innerText.replace(/\s+/g, ' ') };
});
console.log('after battle:', JSON.stringify(after), after.scenes === 'dungeon' && after.enemies === enemiesBefore - 1 ? 'OK' : 'FAIL');
await page.screenshot({ path: 'cache/shot_after_battle.png' });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
