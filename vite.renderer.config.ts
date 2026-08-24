import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = process.cwd();

export default defineConfig({
  root: path.resolve(projectRoot, 'src/renderer'),
  plugins: [react()],
  build: {
    // `outDir` is resolved relative to `root`, so it must be absolute to land
    // where forge expects it (`.vite/renderer/<name>`).
    outDir: path.resolve(projectRoot, '.vite/renderer/main_window'),
    emptyOutDir: true,
  },
});
