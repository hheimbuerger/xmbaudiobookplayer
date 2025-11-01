import { defineConfig } from 'vite';
import { existsSync } from 'fs';
import { resolve } from 'path';

export default defineConfig({
  root: 'demo',
  server: {
    allowedHosts: ['mitral-transiliac-tracie.ngrok-free.dev'],
  },
  resolve: {
    alias: existsSync(resolve(__dirname, 'config.ts'))
      ? {
          './config.js': resolve(__dirname, 'config.ts'),
        }
      : {},
  },
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
