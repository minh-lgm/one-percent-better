/// <reference types="vitest/config" />
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH is read at build time only (ARCHITECTURE §7). Default '/'.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig(({ mode }) => {
  const plugins: PluginOption[] = [react()];

  // The PWA plugin is only needed for real builds/preview; keep it out of Vitest.
  if (mode !== 'test') {
    plugins.push(
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        injectRegister: null, // registration is done in src/integration/sw-register.ts
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: '1% Better per Day',
          short_name: '1% Better',
          description: 'Set goals, log your time every day, and watch 1% add up.',
          lang: 'en',
          start_url: base,
          scope: base,
          display: 'standalone',
          background_color: '#F7F6F2',
          theme_color: '#1F7A4D',
          icons: [
            { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        },
        devOptions: { enabled: false },
      }),
    );
  }

  return {
    base,
    plugins,
    build: {
      target: 'es2022',
      sourcemap: false,
    },
    preview: {
      port: 4173,
      strictPort: true,
    },
    test: {
      setupFiles: ['./src/test/setup.ts'],
      // M5-D2: component tests mount lazy routes + Recharts in jsdom; under load (many
      // workers, cold transform cache, a second Vitest process) 5 s is not enough.
      testTimeout: 20_000,
      hookTimeout: 20_000,
      // Cap the worker count: beyond ~8 jsdom workers the suite only gets slower and timing-sensitive.
      maxWorkers: 8,
      coverage: {
        provider: 'v8',
        include: ['src/domain/**/*.ts'],
        exclude: ['src/domain/**/*.test.ts'],
        reporter: ['text', 'html'],
      },
      projects: [
        {
          extends: true,
          test: {
            name: 'node',
            environment: 'node',
            include: ['src/**/*.test.ts', 'tests/qc/**/*.test.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'jsdom',
            environment: 'jsdom',
            include: ['src/**/*.test.tsx', 'tests/qc/**/*.test.tsx'],
          },
        },
      ],
    },
  };
});
