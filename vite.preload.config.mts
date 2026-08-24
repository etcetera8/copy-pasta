import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      external: ['electron'],
      // Named explicitly so the output is `.vite/build/preload.js`; the plugin
      // default would be `index.js`, colliding with the main build.
      input: { preload: 'src/preload/index.ts' },
    },
  },
});
