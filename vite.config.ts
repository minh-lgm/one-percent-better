/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH is read at build time only (ARCHITECTURE §7). Default '/'.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig(({ mode }) => {
  const plugins: PluginOption[] = [react()];
  // Cloud off at build time (FR-38). M10 (M6-P1): `__OPB_CLOUD__` gates the only `import()` of the SDK
  // (integration/supabase/loader.ts), so a cloud-off build emits no `supabase-client-*.js` at all;
  // Vitest always gets `true` so the SDK module can be loaded under mocks. The precache ignore stays
  // as belt and braces.
  const cloudOn = Boolean(loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL?.trim());
  const sdkInBuild = cloudOn || mode === 'test';

  // The PWA plugin is only needed for real builds/preview; keep it out of Vitest.
  if (mode !== 'test') {
    plugins.push(
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        injectRegister: null, // registration is done in src/integration/sw-register.ts
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'brand-mark-96.png'],
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
          globIgnores: cloudOn ? [] : ['**/supabase-client-*.js'],
        },
        devOptions: { enabled: false },
      }),
    );
  }

  return {
    base,
    plugins,
    define: {
      __OPB_CLOUD__: JSON.stringify(sdkInBuild),
    },
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
