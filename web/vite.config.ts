import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:4180', changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Only the always-eager framework libs get a named vendor chunk — every
        // route depends on them identically, so there is no sync/async boundary
        // for Rollup to get wrong. Recharts is intentionally NOT forced into a
        // manual chunk: it is only reached through dynamic import() (see
        // components/tiles/registry.tsx and pages/Activity.tsx), and letting
        // Rollup's automatic code-splitting draw that boundary is what keeps its
        // shared dependencies (e.g. clsx) out of the eager bundle. A manual
        // 'recharts' chunk previously dragged clsx in with it, which made the
        // main entry statically import the whole chart chunk regardless.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
        },
      },
    },
  },
});
