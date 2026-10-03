import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { target: 'esnext', chunkSizeWarningLimit: 2500, rollupOptions: { input: { main: 'index.html', dev: 'dev.html' } } },
  esbuild: { target: 'esnext' },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
