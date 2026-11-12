import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const apiPort = process.env.API_PORT || '8001';
  const apiTarget = `http://127.0.0.1:${apiPort}`;
  const isAdminVite = process.argv.some(arg => arg.includes('8000'));

  return {
    plugins: [react(), tailwindcss()],
    cacheDir: isAdminVite ? 'node_modules/.vite-admin' : 'node_modules/.vite-storefront',
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          xfwd: true,
        },
        '/uploads': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
