import path from 'node:path';
import { defineConfig } from 'vite';

const projectRoot = process.cwd();

// The landing page. Separate from the renderer build (vite.renderer.config.mts)
// because it is a public web page, not part of the packaged app: its only
// script is Buy Me a Coffee's third-party widget, and its output never goes
// into .vite/.
export default defineConfig({
  root: path.resolve(projectRoot, 'site'),
  // Relative asset URLs, so the built page works from any path a host serves
  // it at rather than assuming it sits at the domain root.
  base: './',
  build: {
    outDir: path.resolve(projectRoot, 'site/dist'),
    emptyOutDir: true,
  },
});
