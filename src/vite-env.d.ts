/// <reference types="vite/client" />

/**
 * Build-time constant from vite.config `define` (M10-T3, M6-P1): `true` when the build carries a cloud
 * configuration (and in Vitest), `false` otherwise so the Supabase SDK chunk is never emitted.
 */
declare const __OPB_CLOUD__: boolean;
