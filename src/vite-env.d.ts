/// <reference types="vite/client" />

/**
 * Build-time constant from vite.config `define` (M10-T3, M6-P1): `true` when the build carries a cloud
 * configuration (and in Vitest), `false` otherwise so the Supabase SDK chunk is never emitted.
 */
declare const __OPB_CLOUD__: boolean;

/**
 * Build-time constant from vite.config `define` (M12-T1, ADR-35): `true` only for `--mode native` /
 * `--mode native-e2e` (the Capacitor build). `false` on the web build and in Vitest, so the single
 * `import()` into `src/integration/native/**` (platform.ts) is dropped and no Capacitor code is emitted.
 */
declare const __OPB_NATIVE__: boolean;
