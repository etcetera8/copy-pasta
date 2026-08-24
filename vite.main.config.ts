import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * The tray icon is read from disk at runtime by `new Tray(...)`, so it has to
 * exist as a real file next to the built main bundle. CopyWebpackPlugin used to
 * do this; Vite has no equivalent built in for a library-mode build.
 */
function copyTrayIcon(): Plugin {
  return {
    name: 'copy-pasta:copy-tray-icon',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'bowl.png',
        source: fs.readFileSync(path.resolve(process.cwd(), 'src/main/bowl.png')),
      });
    },
  };
}

export default defineConfig({
  plugins: [copyTrayIcon()],
  build: {
    // Named explicitly so the output is `.vite/build/main.js` (package.json
    // `main`). Left to the plugin default it would be `index.js`, which
    // collides with the preload build in the same directory.
    lib: {
      entry: { main: 'src/main/index.ts' },
      fileName: () => '[name].js',
      formats: ['cjs'],
    },
    rollupOptions: {
      external: ['robotjs', 'electron', 'electron-squirrel-startup', 'electron-updater'],
    },
  },
});
