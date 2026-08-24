import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = process.cwd();

/**
 * Phase 1 only.
 *
 * The renderer still runs with `nodeIntegration` and imports `electron` and
 * `electron-clipboard-extended` directly, which webpack used to arrange via its
 * `electron-renderer` target. Vite has no equivalent, so those two specifiers
 * are served as tiny ES modules that hand back the real CommonJS module through
 * Electron's renderer-side `require`.
 *
 * Phase 2 puts all of this behind a contextBridge preload and deletes it.
 */
function electronRendererRequire(): Plugin {
  const shims: Record<string, string> = {
    electron: [
      "const electron = window.require('electron');",
      'export const clipboard = electron.clipboard;',
      'export const ipcRenderer = electron.ipcRenderer;',
      'export const shell = electron.shell;',
      'export const webFrame = electron.webFrame;',
      'export default electron;',
    ].join('\n'),
    'electron-clipboard-extended': "export default window.require('electron-clipboard-extended');",
  };
  const PREFIX = '\0electron-renderer-require:';

  return {
    name: 'copy-pasta:electron-renderer-require',
    enforce: 'pre',
    resolveId(source) {
      return source in shims ? PREFIX + source : null;
    },
    load(id) {
      return id.startsWith(PREFIX) ? shims[id.slice(PREFIX.length)] : null;
    },
  };
}

export default defineConfig({
  root: path.resolve(projectRoot, 'src/renderer'),
  plugins: [electronRendererRequire(), react()],
  optimizeDeps: {
    exclude: ['electron', 'electron-clipboard-extended'],
  },
  build: {
    // `outDir` is resolved relative to `root`, so it must be absolute to land
    // where forge expects it (`.vite/renderer/<name>`).
    outDir: path.resolve(projectRoot, '.vite/renderer/main_window'),
    emptyOutDir: true,
  },
});
