import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  build: {
    lib: {
      entry: '../components/xmb-browser.ts',
      formats: ['es'],
    },
    rollupOptions: {
      external: /^lit/,
    },
  },
});
