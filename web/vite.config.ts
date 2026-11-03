import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Lokal leitet Vite /ws und /api an den Spielserver weiter – wie CloudFront in AWS.
const server = process.env.KUCKUCK_SERVER ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ws': { target: server, ws: true },
      '/api': { target: server },
      '/healthz': { target: server },
    },
  },
  build: { sourcemap: true },
});
