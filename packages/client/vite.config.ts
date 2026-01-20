import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Support PORT env var for running E2E tests on a different port
const port = parseInt(process.env['PORT'] ?? '3000', 10);
const serverPort = port + 1;

export default defineConfig({
  plugins: [react()],
  server: {
    port,
    host: true,
    proxy: {
      '/api': {
        target: `http://localhost:${serverPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
