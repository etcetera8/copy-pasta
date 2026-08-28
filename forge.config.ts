import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';

const RUNTIME_MODULES = ['/node_modules/robotjs', '/node_modules/node-gyp-build'];

const config: ForgeConfig = {
  // The Vite plugin sets `ignore` to drop everything outside `.vite`, on the
  // assumption that Vite bundles every dependency. `robotjs` breaks that
  // assumption: it is a native module, so it stays external and must be
  // copied in as real files. The plugin only supplies its own `ignore` when
  // one is not already set, so defining it here replaces that behaviour
  // rather than fighting it.
  //
  // `node-gyp-build` is robotjs's runtime loader -- it picks the right
  // prebuild for the arch -- so it has to come along too.
  packagerConfig: {
    // Relative to the project root, which is where Forge runs. Note that a
    // path packager cannot resolve is only a warning -- it logs "skipping
    // this app icon format" and packages Electron's default -- so a typo
    // here produces a perfectly green build with the wrong icon. That is
    // what tools/check-app-icon.js exists to catch.
    icon: 'assets/appIcon.icns',
    asar: true,
    ignore: (file: string): boolean => {
      if (!file) return false;
      if (file === '/.vite' || file.startsWith('/.vite/')) return false;
      if (file === '/node_modules') return false;
      return !RUNTIME_MODULES.some(
        (m) => file === m || file.startsWith(`${m}/`),
      );
    },
  },
  // robotjs ships N-API prebuilds for every platform it supports, and
  // `node-gyp-build` selects the right one at runtime. Rebuilding from source
  // is therefore unnecessary, needs a full toolchain, and cannot work at all
  // when packaging for an architecture other than the host's.
  rebuildConfig: { onlyModules: [] },
  makers: [
    new MakerSquirrel({ name: 'pasta' }),
    new MakerZIP({}, ['darwin']),
    // `icon` here is the mounted volume's icon, not the app's -- the app's
    // comes from the bundle. Without it the disk that appears in Finder
    // when someone opens the DMG is a generic white drive.
    new MakerDMG({ format: 'ULFO', icon: 'assets/appIcon.icns' }, ['darwin']),
    new MakerDeb({}),
    new MakerRpm({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        { entry: 'src/main/index.ts',    config: 'vite.main.config.mts',    target: 'main' },
        { entry: 'src/preload/index.ts', config: 'vite.preload.config.mts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.mts' }],
    }),
  ],
};

export default config;
