import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        intercept: resolve(__dirname, 'src/renderer/intercept.html'),
        preview: resolve(__dirname, 'src/renderer/preview.html'),
        settings: resolve(__dirname, 'src/renderer/settings.html'),
      },
    },
  },
});
