import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const api = 'http://127.0.0.1:3112';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3111,
    strictPort: true,
    proxy: {
      '/api': api,
      '/robots.txt': api,
      '/sitemap.xml': api,
    },
  },
  preview: { port: 3111, strictPort: true },
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts'],
  },
});
