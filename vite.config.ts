import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const apiPort = process.env.API_PORT || '8001';
  const apiTarget = `http://127.0.0.1:${apiPort}`;
  const isAdminVite = process.argv.some(arg => arg.includes('8000'));

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    cacheDir: isAdminVite ? 'node_modules/.vite-admin' : 'node_modules/.vite-storefront',
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('@embedpdf')) {
                return 'vendor-pdf-viewer';
              }
              if (id.includes('exceljs') || id.includes('pdfkit')) {
                return 'vendor-data-export';
              }
              if (id.includes('recharts')) {
                return 'vendor-charts';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('gsap') || id.includes('motion')) {
                return 'vendor-motion';
              }
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                return 'vendor-react';
              }
            }
          },
        },
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
