import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run dev`          -> lokale dev-server met hot reload
// `npm run build`        -> normale build in dist/
// `npm run build:single` -> alles (code + sprites) in één HTML-bestand
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: { assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096, chunkSizeWarningLimit: 2000 },
}));
