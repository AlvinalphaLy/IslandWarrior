import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: { rollupOptions: { input: { game: 'index.html', narration: 'narration-preview.html' } } },
});
