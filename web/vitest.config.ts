import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Separate from vite.config.ts on purpose: the app build's manualChunks /
 * rollupOptions are meaningless to Vitest and Tailwind's plugin has nothing
 * to process here, since these tests exercise pure lib modules rather than
 * mounting components that pull in styles.css.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
