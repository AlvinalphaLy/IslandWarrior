import Phaser from 'phaser';
import { PreloadScene } from './scenes/PreloadScene';
import { MapScene } from './scenes/MapScene';
import { BattleScene } from './scenes/BattleScene';
import { initUi } from './ui';

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
  // one MapScene per Tiled map in public/assets/maps (scene key = map name)
  scene: [PreloadScene, new MapScene('village'), new MapScene('cave'), new MapScene('dungeon'), new BattleScene()],
});

// exposed for the smoke test (tools/smoke.mjs) and console debugging
(window as unknown as { game: Phaser.Game }).game = game;
