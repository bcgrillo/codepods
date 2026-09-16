import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@codepods/shared-types': fileURLToPath(
        new URL('../../packages/shared-types/src', import.meta.url),
      ),
      '@codepods/sdk': fileURLToPath(new URL('../../packages/sdk/src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/i18n/**',
        'src/test/**',
        '**/*.d.ts',
      ],
      thresholds: {
        statements: 5,
        branches: 25,
        functions: 40,
        lines: 5,
      },
    },
  },
});
