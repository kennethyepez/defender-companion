import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { proxy: { '/api': 'http://127.0.0.1:4318' } },
  build: { sourcemap: true, target: 'es2022' },
});
