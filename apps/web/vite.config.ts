import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8040' },
  },
  // Niente asset inline in base64: la CSP accetta solo file dal proprio dominio
  build: { outDir: 'dist', sourcemap: false, assetsInlineLimit: 0 },
});
