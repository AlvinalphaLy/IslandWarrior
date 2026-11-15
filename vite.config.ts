import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The project folder with its drive letter as Windows stores it. From a shell opened in `d:\...`, Vite's root and
// inputs come out as `d:/...` while module ids are `D:/...`, and the build then can't find a page's inline <style>.
const root = realpathSync.native(process.cwd());

export default defineConfig({
  root,
  base: './',
  server: { port: 5173 },
  build: {
    rollupOptions: {
      // index.html = the Trojan Horse homepage (home/), game/index.html = the game
      input: {
        home: resolve(root, 'index.html'),
        game: resolve(root, 'game/index.html'),
        narration: resolve(root, 'narration-preview.html'),
      },
    },
  },
});
