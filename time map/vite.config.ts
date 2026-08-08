import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    // M3: proxy /api -> backend express server on :8787
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
