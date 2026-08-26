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
      // Both densities, and the exact filenames matter: `nativeImage` finds the
      // `@2x` variant by convention, and the `Template` suffix is what marks
      // the artwork as a macOS template image.
      for (const name of ['bowlTemplate.png', 'bowlTemplate@2x.png']) {
        this.emitFile({
          type: 'asset',
          fileName: name,
          source: fs.readFileSync(path.resolve(process.cwd(), 'src/main', name)),
        });
      }
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
      // Only these two cannot be bundled: `electron` is supplied by the
      // runtime, and `robotjs` is a native module whose .node binary Rollup
      // cannot inline. Everything else must be bundled, because the Forge
      // Vite plugin ships no node_modules -- see forge.config.ts.
      external: ['robotjs', 'electron'],
    },
  },
});
