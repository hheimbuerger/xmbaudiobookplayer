import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';

// Build mode: 'lib' for reusable component, 'app' for self-hosted deployment
const BUILD_MODE = process.env.BUILD_MODE || 'lib';

// Parse additional allowed hosts from environment variable
// Format: VITE_ALLOWED_HOSTS="host1.ngrok.app,host2.example.com"
const additionalHosts = process.env.VITE_ALLOWED_HOSTS
  ? process.env.VITE_ALLOWED_HOSTS.split(',').map((h) => h.trim())
  : [];

// Always allow localhost and 127.0.0.1, plus any additional hosts
const allowedHosts =
  additionalHosts.length > 0
    ? ['localhost', '127.0.0.1', ...additionalHosts]
    : undefined; // undefined = Vite's default behavior

export default defineConfig({
  // Use relative paths so the app works regardless of hosting location
  base: './',
  server: allowedHosts ? { allowedHosts } : {},
  // Serve config.js in dev mode
  plugins: [
    {
      name: 'serve-config',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/config.js') {
            res.setHeader('Content-Type', 'application/javascript');
            const configPath = resolve(__dirname, 'config.js');
            if (existsSync(configPath)) {
              res.end(readFileSync(configPath, 'utf-8'));
            } else {
              res.statusCode = 404;
              res.end('config.js not found. Copy config.example.js to config.js');
            }
            return;
          }
          next();
        });
      },
    },
  ],
  // No resolve aliases needed
  build:
    BUILD_MODE === 'app'
      ? {
          // App mode: bundle app but keep config.js separate
          rollupOptions: {
            input: {
              main: resolve(__dirname, 'index.html'),
            },
            external: ['/config.js', './config.js', resolve(__dirname, 'config.js')],
          },
        }
      : {
          // Library mode: export as reusable component
          lib: {
            entry: 'src/app/podcast-player.ts',
            formats: ['es'],
          },
          rollupOptions: {
            external: /^lit/,
          },
        },
  // No plugins needed for app mode
});
