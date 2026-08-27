import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['.vite/**', 'out/**', 'dist/**', 'node_modules/**', '*.config.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The scripts under tools/ are plain CommonJS run by hand from a terminal,
    // not part of any bundle, so they need the Node globals that the default
    // browser-facing config leaves undeclared. `no-undef` is already off for
    // the .ts sources, which typescript-eslint handles. Listed out rather than
    // pulled from the `globals` package to avoid a dependency for six names.
    files: ['tools/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
  {
    // Vitest tests under tools/ are .mjs rather than CommonJS -- vitest
    // refuses to be require()'d, so a .js test there fails before any test
    // runs. sourceType is 'module' here (not 'commonjs' as above) so import
    // syntax parses; the Node globals list is shorter because ESM has no
    // require/module/__dirname of its own.
    files: ['tools/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
