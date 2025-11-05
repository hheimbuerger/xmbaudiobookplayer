import { defineConfig } from 'vite';
import { existsSync } from 'fs';
import { resolve } from 'path';

export default defineConfig({
  server: {
    allowedHosts: ['mitral-transiliac-tracie.ngrok-free.dev'],
    // hmr: {
    //   protocol: 'wss',
    //   host: 'mitral-transiliac-tracie.ngrok-free.dev',
    //   clientPort: 443,
    // },
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
      entry: 'src/app/podcast-player.ts',
      formats: ['es'],
    },
    rollupOptions: {
      external: /^lit/,
    },
  },
});
