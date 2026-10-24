import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths, so the build also works from the native app bundle.
  base: './',
  build: {
    target: 'es2022',
  },
});
