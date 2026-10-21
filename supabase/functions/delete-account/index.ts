// Edge Function `delete-account` — Deno entry (ARCHITECTURE §4.7 d, ADR-39; M14). Deploy (owner, TASKS U23):
//   npx --yes supabase@2.120.0 functions deploy delete-account --project-ref <ref> --use-api --no-verify-jwt
// `verify_jwt = false` at the gateway (supabase/config.toml): the handler verifies the JWT itself with
// `auth.getUser(jwt)`, so a request without a valid token never reaches the deletion.
//
// Secrets (Supabase Dashboard → Edge Functions → Secrets): APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID (bundle id),
// APPLE_PRIVATE_KEY (the .p8 contents) — optional; missing → `appleRevoked: 'manual-required'`. ALLOWED_ORIGINS —
// optional, comma-separated override of the default CORS list. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are set by
// Supabase for every function. This file is outside the app's tsc/ESLint (Deno globals, `npm:` specifier).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { appleConfigFromEnv, exchangeCode, revokeToken } from './apple.ts';
import { DEFAULT_ALLOWED_ORIGINS, handleDeleteAccount } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? DEFAULT_ALLOWED_ORIGINS.join(','))
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

Deno.serve((req: Request) =>
  handleDeleteAccount(req, {
    allowedOrigins,
    getUser: async (jwt) => {
      const { data, error } = await admin.auth.getUser(jwt);
      if (error || !data.user) return null;
      const providers = (data.user.app_metadata?.providers as string[] | undefined) ?? [];
      return { id: data.user.id, providers };
    },
    deleteUser: async (id) => {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
    },
    apple: appleConfigFromEnv((k) => Deno.env.get(k)),
    exchangeAppleCode: (code, cfg) => exchangeCode(code, cfg),
    revokeAppleToken: (token, hint, cfg) => revokeToken(token, hint, cfg),
    log: (event) => console.log(JSON.stringify({ fn: 'delete-account', event })),
  }),
);
