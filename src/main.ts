import Phaser from 'phaser';
import { PreloadScene } from './scenes/PreloadScene';
import { MapScene } from './scenes/MapScene';
import { BattleScene } from './scenes/BattleScene';
import { FightScene } from './scenes/FightScene';
import { BowScene } from './scenes/BowScene';
import { initUi } from './ui';
import { SITE_ROOT } from './siteRoot';

initUi();

const game = new Phaser.Game({
  // ?canvas forces the Canvas renderer (used by the headless smoke test)
  type: location.search.includes('canvas') ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 480,
    height: 270,
  },
  physics: { default: 'arcade', arcade: { debug: false } },
  // maps, tilesets and sprites are public/ files at the site root; the game page is game/index.html
  loader: { path: SITE_ROOT },
  // one MapScene per Tiled map in public/assets/maps (scene key = map name)
  scene: [
    PreloadScene,
    new MapScene('village'),
    new MapScene('cave'),
    new MapScene('dungeon'),
    new MapScene('circe'),
    new MapScene('cyclops'),
    new MapScene('telepylus'),
    new BattleScene(),
    new FightScene(),
    new BowScene(),
  ],
});

// exposed for the smoke test (tools/smoke.mjs) and console debugging
(window as unknown as { game: Phaser.Game }).game = game;
