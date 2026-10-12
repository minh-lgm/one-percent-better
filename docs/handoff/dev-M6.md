# Dev handoff — M6 Auth walking skeleton: cấu hình cloud, Supabase lazy-load, đăng nhập Google (PKCE trên sub-path), card Account, SQL + RLS

Ngày: 2026-10-12. Developer build theo `docs/plan/TASKS.md` v2.1 (Phase 2 quy ước bổ sung, M6-T1…T6, M6-AC1…AC13, DoD 7–11, NV-*, User setup U0–U11), `ARCHITECTURE.md` v2.1 (§2, §3 quy tắc lint, §4.1, §4.3, §5.1, §5.2 `LocalDataRepository`, §5.3 `AuthService`, §5.4 `AUTH_*`, §5.9, §5.11, §7, §8, §9, ADR-17…24), `PRD.md` v2.1 (FR-37…43, NFR-01/03/05/16/17, A-21, A-26, A-33, A-38), `DESIGN.md` v2.0 (§2 F9/F10/F12, §3.5, §4 S7 card Account A1–A10 + D4 + About/Backup/Storage theo trạng thái, §5 GoogleSignInButton/AccountCard/Avatar/SignOutDialog/Toast error+action, §6 token `--google-*`, §7.2/7.3/7.7 copy en/vi, §8.1), mockup `09-account.html`, `08-settings.html`, `docs/handoff/dev-M5.md` (quy ước test), `docs/qc/report-final-r2.md` §9. Bổ sung từ orchestrator (2026-10-12, không đổi AC): trang tĩnh `public/privacy.html` + link "Privacy policy" ở card About.

## 1. Tóm tắt

- **Config / tooling (T1).** `@supabase/supabase-js` pin `2.117.3` (exact). `src/config/env.ts`: `parseCloud` (chỉ `https://…` hoặc `http://localhost|127.0.0.1[:port]`, không path/query/userinfo; key publishable thắng anon; thiếu/sai → `cloud = null`) + `VITE_SYNC_INTERVAL_MS` (60000–3600000, mặc định 300000). `.env.example`, `.env.e2e` (rỗng → build e2e luôn tắt cloud), `.env.cloud-e2e` (URL mock + key giả), `.gitignore` (`.env.local`, `.env.*.local`, `dist-cloud-e2e/`, `supabase/.temp/`). ESLint: `@supabase/*` chỉ trong `src/integration/supabase/**`; cấm import tĩnh `supabase-client` ở mọi nơi khác; `src/services/**` cấm `src/integration/**`; áp cả cho test (`tests/db/**` ngoại lệ). Script: `build:e2e`, `build:cloud-e2e`, `preview:cloud-e2e`, `mock:supabase`, `db:start/stop/reset` (npx supabase@2.120.0), `test:db`. Playwright: 2 project (`chromium` cloud tắt, port 4173; `cloud` sub-path `/one-percent-better/` port 4174, `fullyParallel: false`), 3 `webServer`. `pages.yml` nhận `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` từ secrets ở bước build. `vite.config.ts`: khi build không có cloud, chunk SDK không vào precache.
- **Mock Supabase (T1, ARCH §5.11)** `e2e/mock-supabase/server.mjs` (Node `http`, 0 dependency): `/auth/v1/authorize` (kiểm `provider=google`, `code_challenge_method=s256`, `redirect_to` localhost) → trang chọn tài khoản `Minh Test` / `Other User` / `Cancel`; `/auth/v1/token?grant_type=pkce` (SHA-256 verifier, code dùng một lần, JWT HS256), `grant_type=refresh_token` (công tắc `invalid_grant`), `/auth/v1/user`, `/auth/v1/logout`; `/__test/reset|log|fail|session|seed|rows`. **Trạng thái phân vùng theo User-Agent** của worker Playwright (fixture `e2e/cloud/fixtures.ts`) — xem Deviations D3. REST `/rest/v1/*` là M7.
- **Logic + data (T2).** `src/services/auth-port.ts` (`AuthPort`, `AuthSession`, `AuthEvent`, `ReturnToStore`, `AuthCallbackParams`, `displayName` A-21). `src/services/auth-service.ts`: máy trạng thái `unavailable | signed-out(lastError?) | signing-in | signed-in | expired(email, lastError?)`; `init()` quyết định trạng thái đầu từ kv `sync` + `storedSession()` **không nạp SDK** khi không có phiên; có phiên → hiện tài khoản đã lưu ngay rồi xác minh nền; `signIn(returnTo)` (offline → `AUTH_OFFLINE`, không nạp SDK); `completeCallback(cb)` (đặt `signing-in` đồng bộ; `access_denied` → `AUTH_CANCELLED`, lỗi khác/exchange ném → `AUTH_FAILED`); `signOut({keepData})` (Remove → `clearUserData()` trước, lỗi ném ra để UI giữ dialog; lỗi mạng của port không chặn; `lastUserId` giữ khi Keep); `session-expired` → `expired`, giữ kv `sync.account`, không xoá gì; `onOutcome()` phát kết quả callback một lần cho UI (toast). `ErrorCode` + `AUTH_*`; `KvKey` + `sync | loginPrompt | prefsSync`; `SyncMeta` + `normalizeSyncMeta`; `LocalDataRepository` + `DexieLocalDataRepository` (`clearUserData` một transaction goals+entries+kv, giữ `locale`, `loginPrompt`; `countLive`). `src/test/fake-auth-port.ts` (`FakeAuthPort`, `MemoryReturnTo`, `fakeAuthLoader`); `createTestContainer({ cloud, authPort, authStored, online })`. `container.ts`: `cloud = null` → `AuthService.unavailable()`, không tạo loader.
- **Integration (T3).** `integration/supabase/loader.ts` (`hasStoredSession`/`clearStoredSession` chỉ đọc `localStorage['opb-auth…']`, `createSupabaseLoader` = `import('./supabase-client')` memo, retry được), `supabase-client.ts` (**file duy nhất import `@supabase/*`**: `createClient` với `flowType: 'pkce'`, `detectSessionInUrl: false`, `persistSession`, `autoRefreshToken`, `storageKey: 'opb-auth'`; `SupabaseAuthPort`: `getSession` (lỗi mạng retryable → rơi về phiên trong storage, FR-40), `signInWithGoogle` (SDK tự `location.assign`; test truyền `navigate`), `exchangeCode`, `signOut` scope `local` + dọn storage khi SDK lỗi, `onEvent` ánh xạ `SIGNED_OUT` không do app → `session-expired`). `integration/auth-callback.ts` (`readAuthCallback`, `cleanCallbackUrl` + `sanitizeReturnTo` chỉ nhận `#/…`, `sessionReturnTo` key `opb-auth-return`, `callbackRedirectUrl`). `integration/connectivity.ts`. `bootstrap.ts`: sau locale → `authService.init()` → nếu có callback: dọn URL (trước khi tạo hash router) rồi `completeCallback` nền. `main.tsx` đọc callback từ `window.location`.
- **UI (T5).** `GoogleSignInButton` (logo G 4 màu inline, `--google-*`, `aria-busy`, `aria-describedby` khi offline), `Avatar` (`initialOf`: grapheme đầu qua `Intl.Segmenter`, `toLocaleUpperCase`), `AccountCard` (A1, A2, A3, A4, A5, A10; `data-state`), `SignOutDialog` (D4: `<dialog>` + `showModal`, Keep chọn + focus sẵn, radio `aria-labelledby`/`aria-describedby`, nút đổi primary/danger, busy, Alert `WRITE_FAILED`, body cuộn + hàng nút dính đáy), `AuthFeedback` (toast `signedIn`; lỗi ở màn ≠ Settings → toast tone `error` 8 s + nút `Go to Account`), `Toast` thêm `tone`/`action`, `useOnline` (OfflineChip dùng chung). `Settings`: thứ tự Language → **Account** (ẩn khi `unavailable`) → Reminders → Backup → Storage → About; About: `desc` (cloud tắt) / `descCloud` + `privacy` / `descSignedIn` + `privacy`; link `privacyLink` → `privacy.html`; focus: sau Sign out → h2 Account, sau Cancel → nút Sign out, sau Dismiss → nút Google. 36 key mới en/vi nguyên văn DESIGN §7.2/7.3/7.7 (+1 key `settings.about.privacyLink` theo yêu cầu orchestrator). CSS phase 2 trong `app.css` (ASCII thuần), token `--google-*`, `--chip-h`.
- **SQL (T4).** `supabase/migrations/20261012000000_cloud_sync.sql` nguyên văn ARCH §4.3 (goals, entries, settings; trigger `sync_before_write`, `settings_before_write`; RLS select/insert/update `to authenticated`; không DELETE; `revoke all … from anon, authenticated` + `grant select, insert, update … to authenticated`). `supabase/config.toml` sinh bởi `npx --yes supabase@2.120.0 init` (chạy được, không prompt) rồi sửa `project_id` và tắt studio/storage/realtime/edge_runtime/analytics. Test tĩnh `src/data/cloud-migration.test.ts` (7 test, trong `npm test`). `tests/db/rls.test.ts` + `vitest.db.config.ts` + `scripts/test-db.mjs` (guard "skipped").
- **E2E (T6).** `e2e/cloud/m6-auth.spec.ts` (9), `m6-lazy.spec.ts` (2), `m6-i18n.spec.ts` (3, `vi-VN`), `e2e/m6-cloud-off.spec.ts` (1, project chromium). `e2e/helpers/app.ts`: `gotoHash` dùng `page.goto('#…')` tương đối theo `baseURL` (hành vi project chromium không đổi).
- **Privacy (bổ sung orchestrator).** `public/privacy.html` tự chứa, không JS, token màu app, `<html lang="en">` + khối `lang="vi"` cùng trang, cập nhật 2026-10-12; precache qua glob `**/*.html` sẵn có (kiểm: `dist/sw.js` có `privacy.html`).

## 2. Task

| ID | Trạng thái | Ghi chú |
| :- | :- | :- |
| M6-T1 | DONE | `package.json` (+ scripts, `@supabase/supabase-js` 2.117.3), `package-lock.json`, `env.ts` + 9 test cloud, `.env.example`/`.env.e2e`/`.env.cloud-e2e`, `.gitignore`, `eslint.config.js`, `playwright.config.ts`, `vite.config.ts` (precache), `vitest.db.config.ts`, `e2e/mock-supabase/server.mjs` + `server.d.mts`, `pages.yml` |
| M6-T2 | DONE | `auth-port.ts`, `auth-service.ts` + 24 test, `domain/types.ts` (`AUTH_*`, `AuthErrorCode`), `data/repositories.ts` (`KvKey`, `SyncMeta`, `LocalDataRepository`), `dexie/local-data-repo.ts` + 4 test (rollback), `test/fake-auth-port.ts`, `test/container.ts`, `app/container.ts` |
| M6-T3 | DONE | `supabase/loader.ts` + 3 test, `supabase/supabase-client.ts` + 9 test (mock in-process, cổng ngẫu nhiên), `auth-callback.ts` + 8 test, `connectivity.ts`, `bootstrap.ts` + 4 test mới, `main.tsx` |
| M6-T4 | DONE (phần Docker: NOT VERIFIED NV-2) | migration SQL, `config.toml`, `cloud-migration.test.ts` (7), `tests/db/rls.test.ts` (6 test, viết sẵn, `describe.skipIf`), `scripts/test-db.mjs`; README "Cloud setup (owner)" |
| M6-T5 | DONE | `AccountCard.tsx` + 16 test, `SignOutDialog.tsx` + 6 test, `GoogleSignInButton.tsx`, `Avatar.tsx`, `AuthFeedback.tsx`, `Toast.tsx`/`useToast.ts`, `useOnline.ts`, `Settings.tsx` + `Settings.account.test.tsx` (14), `error-messages.ts`, `en.json`/`vi.json`, `app.css`, `tokens.css`, `Icon.tsx` (`sync`, `lockOpen`) |
| M6-T6 | DONE | `e2e/cloud/*` (fixtures, helpers, 3 spec), `e2e/m6-cloud-off.spec.ts`, README mục "Account & sync (optional)", handoff này |

## 3. File chính đã thêm/sửa

- Config: `package.json`, `package-lock.json`, `.env.example`, `.env.e2e` (mới), `.env.cloud-e2e` (mới), `.gitignore`, `eslint.config.js`, `playwright.config.ts`, `vite.config.ts`, `vitest.db.config.ts` (mới), `tsconfig.app.json`, `tsconfig.node.json`, `.github/workflows/pages.yml`, `src/config/env.ts`, `constants.ts` (`TOAST_ERROR_DURATION_MS`).
- Domain/data: `src/domain/types.ts`, `src/data/repositories.ts`, `src/data/dexie/local-data-repo.ts` (mới), `src/data/cloud-migration.test.ts` (mới).
- Services: `src/services/auth-port.ts`, `auth-service.ts` (mới).
- Integration: `src/integration/auth-callback.ts`, `connectivity.ts`, `supabase/loader.ts`, `supabase/supabase-client.ts` (mới).
- App: `src/app/container.ts`, `bootstrap.ts`, `main.tsx`.
- UI: mới `AccountCard`, `SignOutDialog`, `GoogleSignInButton`, `Avatar`, `AuthFeedback`, `hooks/useOnline`; sửa `Settings.tsx`, `AppShell.tsx`, `Toast.tsx`, `hooks/useToast.ts`, `OfflineChip.tsx`, `Icon.tsx`, `error-messages.ts`, `styles/app.css`, `styles/tokens.css`; `i18n/resources/en.json`, `vi.json`.
- Test helper: `src/test/fake-auth-port.ts` (mới), `src/test/container.ts`.
- SQL: `supabase/config.toml`, `supabase/migrations/20261012000000_cloud_sync.sql`, `tests/db/rls.test.ts`, `scripts/test-db.mjs`.
- E2E: `e2e/mock-supabase/server.mjs`, `server.d.mts`, `e2e/cloud/fixtures.ts`, `helpers.ts`, `m6-auth.spec.ts`, `m6-lazy.spec.ts`, `m6-i18n.spec.ts`, `e2e/m6-cloud-off.spec.ts`, `e2e/helpers/app.ts` (`gotoHash`).
- Docs/static: `README.md`, `public/privacy.html`.

## 4. Cách chạy

```bash
npm ci
npm run e2e:install
# (a) demo với mock, không cần tài khoản
npm run mock:supabase                                   # cổng 54321
npm run build:cloud-e2e && npm run preview:cloud-e2e    # http://localhost:4174/one-percent-better/
#   → #/settings → Account → "Sign in with Google" → "Minh Test" → về #/settings, card hiện minh.test@example.com
# (b) project thật (sau U1–U7): tạo .env.local với VITE_SUPABASE_URL=https://grmcmidzyqwryaangpug.supabase.co
#     và VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>  →  npm run dev  →  http://localhost:5173/#/settings
# (c) không cấu hình = phase 1
npm run build && npm run preview                        # http://localhost:4173 — Settings không có card Account
```

## 5. Cách test

| Lệnh | Kết quả lần chạy cuối (2026-10-12) |
| :- | :- |
| `npm run check` (lint + typecheck + Vitest + build), chạy **3 lần** | 3/3 **exit 0**; Vitest **79 file, 786/786** (M5: 686; +100); lint 0 lỗi/0 cảnh báo; build OK |
| `npm run test:e2e` (webServer tự build/khởi động cả 3 server) | **363/363 pass, exit 0** (chromium 348 + cloud 15), 2 phút 44 giây — mục 5a |
| `npx playwright test --project cloud` (lần chạy riêng trước đó) | **15/15 pass** (m6-auth 9, m6-lazy 2, m6-i18n 3 + helpers); 15–25 s |
| `npx playwright test --project chromium` (dev M1–M5 + QC M1–M5 + final + m6-cloud-off) | **348/348 pass** (M5: 347 + 1), 2,9 phút |
| `npm run test:db` | in `test:db skipped: SUPABASE_TEST_PUBLISHABLE_KEY / SUPABASE_TEST_SECRET_KEY not set (Supabase local not running)` + hướng dẫn, **exit 0** (máy không có Docker — kết quả mong đợi, OQ-08) |
| `npm run bench` | [bench] in-memory median 4,5 ms; fake-indexeddb median 57,1 ms; pure model 7,3 ms (< 200 ms) |
| `npm run build` (cloud tắt) | `index-*.js` 727,00 kB / **221,32 kB gzip** + `useFormat-*.js` 6,69 kB + `preload-helper-*.js` 0,79 kB gzip = **≈ 228,8 kB ≤ 250 kB**; `supabase-client-*.js` 216,37 kB / **55,77 kB gzip** (chunk riêng, không `modulepreload`, không precache khi cloud tắt: `grep -c supabase-client dist/sw.js` = 0; precache 24 entry gồm `privacy.html`) |
| `npm run build:cloud-e2e` | entry 221,30 kB gzip (cùng ngân sách), chunk SDK 55,77 kB gzip; precache 24 entry có chunk SDK (offline-first, quyết định 2026-10-10) |

Quy ước test giữ như M5: `waitFor` cho toast/liveQuery, không assert wall-clock (test mock Supabase trong Vitest dùng `vi.setSystemTime` thay vì chờ thật; fetch giả nhảy đồng hồ để kết thúc vòng retry 30 s của SDK), ASCII trong `app.css`.

### 5a. `npm run test:e2e` lần cuối

Chạy 2026-10-12 sau khi tắt mọi server nền (Playwright tự `build:e2e` + `preview`, `build:cloud-e2e` + `preview:cloud-e2e`, `mock:supabase`): **363/363 pass** (project `chromium` 348 = dev M1–M6 + `tests/qc` M1–M5 + final; project `cloud` 15), 0 flaky, **exit 0**, 2 phút 44 giây kể cả build.

## 6. Tự kiểm AC

| AC | Kết quả | Bằng chứng (lệnh + output rút gọn) |
| :- | :- | :- |
| M6-AC1 | PASS (trên máy dev; clone sạch: QC kiểm) | `package.json`: `"@supabase/supabase-js": "2.117.3"`; `npm ls supabase` → `(empty)`; `npm ls @supabase/supabase-js` → `2.117.3`; không cài global (chỉ `npm install --save-exact` + `npx`); `npm run check` 3/3 exit 0; `npm run test:e2e` xem 5a |
| M6-AC2 | PASS | `src/config/env.test.ts` 9 test cloud: `{}` → null; https + publishable; chỉ anon; cả hai → publishable; `http://abc.supabase.co`, `javascript:alert(1)`, `abc`, `ftp://`, userinfo, có path → null; `http://127.0.0.1:54321`, `http://localhost:54321` hợp lệ; URL không key → null; `VITE_SYNC_INTERVAL_MS` thiếu/59999/abc → 300000, 60000 → 60000 |
| M6-AC3 | PASS | Project chromium 348/348 (không sửa assertion spec M1–M5; chỉ `webServer` + `gotoHash` tương đối theo baseURL); `e2e/m6-cloud-off.spec.ts`: không heading `Account`, không nút Google, 0 request ngoài origin, bundle không chứa `supabase.co`/`127.0.0.1:54321`; unit `bootstrap.test.ts` "cloud = null → unavailable, loader không được gọi"; **chống rò**: repo chưa có `.env.local` → tạo tạm với `fake-project` → `npm run build:e2e` exit 0 → `grep -rl fake-project dist` = 0 → đã xoá file tạm |
| M6-AC4 | PASS | Probe `createClient` từ `@supabase/supabase-js` ở `src/services/probe.ts`, `src/ui/probe.tsx`, `src/app/probe.ts`, `src/domain/probe.ts`, `src/data/probe.ts` → exit 1; `src/integration/supabase/probe.ts` → exit 0; import tĩnh `../integration/supabase/supabase-client` ở `src/app/probe.ts` → exit 1; `../integration/connectivity` ở `src/services/probe.ts` → exit 1; probe M1-AC13 (dexie trong domain), M1-AC17 (i18next trong services) → exit 1 |
| M6-AC5 | PASS | `m6-lazy.spec.ts`: 4 màn signed-out → 0 request tới 54321, 0 request khớp `/supabase-client-[^/]*\.js$/`, `index.html` không `modulepreload` chunk đó; bấm Sign in → chunk được tải đúng 1 lần rồi điều hướng tới mock. Build: xem mục 5. Unit `auth-service.test.ts` "no stored session → loader 0 lần, signed-out"; "stored session → loader đúng 1 lần (kể cả init lần 2)" |
| M6-AC6 | PASS (mock) / NV-1, NV-4 (Google thật, iOS) | `m6-auth.spec.ts` AC6: `page.url()` = `http://localhost:4174/one-percent-better/#/settings`; card `minh.test@example.com` / `Minh Test`; `/__test/log`: authorize có `code_challenge_method=s256`, `redirect_to=http://localhost:4174/one-percent-better/?auth=callback`, không `scopes`; đúng 1 POST `grant_type=pkce`; reload → vẫn đăng nhập, exchanges = 1; Today có "Read". Unit `auth-callback.test.ts`: `{code:'abc'}`, `{error, description}`, `?code=abc` → null, rỗng → null; `cleanCallbackUrl` `#/today` / mặc định `#/settings`, từ chối `https://…`, `#//…` |
| M6-AC7 | PASS (mock) | Cancel → `#/settings` không query, `signed-out`, Alert `errors.AUTH_CANCELLED`, Dismiss → focus nút Google, "Read" còn; `/__test/fail?path=token&status=500` → Alert `AUTH_FAILED`; mở thẳng `…/?auth=callback&code=bogus` → Alert `AUTH_FAILED`, h1 Settings render, 0 `pageerror`; callback lỗi khi returnTo `#/today` → toast error + "Go to Account" → Settings có Alert; `setOffline(true)` → nút `disabled` + `settings.account.offlineHint` nối `aria-describedby`. Service test: `signIn` offline → `AUTH_OFFLINE`, loader 0 lần |
| M6-AC8 | PASS (mock) / NV-6 (phiên thật 1 giờ) | Page mới cùng context → signed-in; SW ready → `setOffline(true)` + reload → Today render "Read", card hiện email, 0 Alert, 0 `pageerror`; mock `ttl=5&refresh=invalid_grant&now=<FIXED>` → tua `page.clock` +10 phút + reload → card `expired` ("Sign in again", `AUTH_SESSION_EXPIRED`, `Account: minh.test@example.com`), kv `sync.account` giữ, "Read" còn, Sign out từ expired hoạt động. Service test: `session-expired` → `expired`, kv giữ, goals không xoá |
| M6-AC9 | PASS (mock) | `m6-auth.spec.ts` AC9 (ngôn ngữ `vi` đã chọn, "Read" + entry 20 phút): D4 Keep checked + focused, nút "Đăng xuất" primary; Cancel → vẫn signed-in, focus về nút Sign out; Keep → signed-out, toast `signedOutKept`, focus h2 Tài khoản, `localStorage` không còn `opb-auth`, Today vẫn 20/30; đăng nhập lại → Remove → Today rỗng "Bắt đầu với một mục tiêu nhỏ", `<html lang="vi">` giữ sau reload, switch nhắc tắt, giờ 20:00, kv `sync` = null. Integration `local-data-repo.test.ts`: S1 + activeTimer + settings + locale + sync + loginPrompt + prefsSync → sau clear chỉ còn `locale`, `loginPrompt`; lỗi giữa transaction → mọi thứ nguyên |
| M6-AC10 | PASS phần tĩnh / **NOT VERIFIED** phần Docker (NV-2) | `src/data/cloud-migration.test.ts` (trong `npm test`): RLS enable cho 3 bảng; 9 policy select/insert/update `to authenticated` đều `(select auth.uid()) = user_id`; không `for delete`, không `to anon`/`to public`; grant chỉ `select, insert, update … to authenticated`, có `revoke all … from anon, authenticated`; trigger `sync_before_write` (goals, entries) + `settings_before_write`; `settings` không có `last_reminder_date`/`plus_one_shown`/`last_backup_at`/`active_timer`. `npm run test:db` → skipped, exit 0 (không Docker). Kiểm tay U10 |
| M6-AC11 | PASS | Component quét vi: `AccountCard.test.tsx` 8 trạng thái (signed-out, offline, signing-in, AUTH_CANCELLED/FAILED/OFFLINE, signed-in, expired) → 0 phát hiện; `SignOutDialog.test.tsx` vi Keep/Remove → 0; `Settings.account.test.tsx` vi signed-out/signed-in/expired → 0; parity pass (37 key mới). E2E `m6-i18n.spec.ts`: axe Settings (signed-out, signed-in, D4 mở) ở vi 0 serious/critical; `m6-auth.spec.ts` axe en (signed-out, signed-in, expired, D4); 360×740 vi: Settings signed-out/offline/signed-in + D4 (Remove) không cuộn ngang, dialog ≤ 360 px; bàn phím: Enter mở D4, focus Keep, mũi tên đổi lựa chọn, 6 lần Tab không rời dialog (native `showModal`), Escape đóng, focus về Sign out; luồng AC6 ở `vi-VN` → card chuỗi vi, toast `Đã đăng nhập: …` |
| M6-AC12 | PASS | `m6-auth.spec.ts` ghi mọi request AC6: origin ∈ {`http://localhost:4174`, `http://127.0.0.1:54321`}, 0 `googleusercontent.com`, card 0 `img`; authorize không có `scopes` (scope mặc định `openid email profile`); `git grep -nE "service_role|sb_secret_" -- . ":!docs"` → 0 (sau khi `git add`; `.env.example` đã đổi chữ thành "service-role"); `git ls-files ".env*"` sau add = `.env.cloud-e2e`, `.env.e2e`, `.env.example`; `pages.yml` có 2 biến `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` từ `secrets.*`, không biến nào tên chứa SECRET/SERVICE |
| M6-AC13 | PASS | Chromium 348/348 (dev + `tests/qc` M1–M5 + final); `npm run bench` < 200 ms; README có "Account & sync (optional)" và "Cloud setup (owner)" |

### NOT VERIFIED (cần project/thiết bị thật)

| ID | Nội dung | Bước kiểm thủ công |
| :- | :- | :- |
| NV-1 | Đăng nhập Google thật qua project `grmcmidzyqwryaangpug`, redirect về `https://minh-lgm.github.io/one-percent-better/` và `http://localhost:5173/` | U7 (local) và U10 (1) sau U8 |
| NV-2 | Migration, RLS, trigger LWW trên Postgres thật (máy không có Docker → `test:db` skipped) | U6 chạy SQL; U10 (3), (4), (6): `curl "https://grmcmidzyqwryaangpug.supabase.co/rest/v1/goals?select=*" -H "apikey: <publishable key>"` → `[]` hoặc lỗi quyền; Table Editor hàng có `user_id`; người dùng Gmail khác không thấy dữ liệu |
| NV-4 | Đăng nhập trên iOS Safari và PWA đã cài (iOS/Android) | U10 (1) |
| NV-6 | Phiên thật: access token hết hạn sau 1 giờ được làm mới; offline lâu rồi mở lại | U10 |

## 7. Deviations so với plan/design

- **D1 — `AuthState.expired` có `lastError?`** (ARCH §5.3 chỉ `{ kind: 'expired'; email }`). Khi đăng nhập lại từ trạng thái hết hạn mà huỷ/lỗi, card quay về A10 kèm Alert lỗi thay vì về A1 (kv `sync.userId` vẫn trỏ tài khoản); không đổi hành vi người dùng thấy ở các luồng AC.
- **D2 — `AuthService.onOutcome()`** (không có trong ARCH): kênh một lần cho UI nhận kết quả callback để hiện toast, vì `completeCallback` chạy trong `bootstrap` **trước** khi React mount nên không thể bắt chuyển trạng thái qua `watch()`.
- **D3 — Mock Supabase phân vùng trạng thái theo User-Agent.** ARCH §5.11 mô tả một mock dùng chung; Playwright chạy nhiều worker song song nên `/__test/reset` của test này xoá code/token đang dùng của test khác (đã quan sát: 4 lần exchange, `AUTH_FAILED`). Giải pháp: fixture `e2e/cloud/fixtures.ts` đặt UA chứa `opb-e2e-w<worker>-<pid>` cho mỗi worker, mock giữ state riêng theo marker đó (UA không có marker → partition `default`, dùng cho Vitest in-process, demo tay, spec không dùng fixture); project `cloud` `fullyParallel: false` (file song song, test trong file tuần tự). **QC viết spec cloud nên `import { test, expect } from '../../e2e/cloud/fixtures'` và dùng fixture `mock`**; spec dùng `@playwright/test` thẳng vẫn chạy nhưng chia partition `default` với nhau.
- **D4 — `signOut` scope `local` không gọi `/auth/v1/logout`** ở supabase-js 2.117 (SDK chỉ xoá phiên trên thiết bị; thiết bị khác giữ phiên — đúng FR-41). Test port kiểm "nếu có gọi thì không `global`". Khi SDK trả lỗi, port tự xoá `opb-auth*` trong storage (ARCH §5.9 "xoá phiên kể cả khi offline").
- **D5 — `lastUserId`** được ghi lúc **đăng xuất Keep** (= tài khoản vừa rời), không ghi lúc đăng nhập: để M7 `prepareFirstSignIn` so `lastUserId ≠ userId` trước khi gộp; Remove xoá kv `sync` nên máy chung không còn `lastUserId` (khớp thứ tự ARCH §5.9).
- **D6 — Dọn URL callback** dùng `history.replaceState(null, '', BASE_URL + returnTo)` trước khi tạo `createHashRouter` (bootstrap nhận `cleanCallbackUrl`), `returnTo` chỉ nhận `#/…` (không `#//`, không URL ngoài).
- **D7 — SDK chunk không precache khi cloud tắt** (`vite.config.ts` `globIgnores`): bản phase 1 không tải 216 kB chunk vô dụng; bản cloud vẫn precache (quyết định 2026-10-10).
- **D8 — Key mới ngoài DESIGN:** `settings.about.privacyLink` (en `Privacy policy` / vi `Chính sách quyền riêng tư`) + link tới `privacy.html` ở card About (yêu cầu orchestrator 2026-10-12). Trang `public/privacy.html` tự chứa, song ngữ, không JS. Designer có thể cập nhật DESIGN §7.7.5.
- **D9 — Toast có `action`** và tone `error` thêm nút `.act` trong `ToastRegion` (DESIGN §5 Toast v2); `toast.show(key, params, { tone, action })` giữ tương thích chữ ký cũ.
- **D10 — `e2e/helpers/app.ts#gotoHash`** đổi `page.goto('/#…')` → `page.goto('#…')` để chạy được trên baseURL sub-path; với project chromium (baseURL `http://localhost:4173`) URL kết quả không đổi (348/348).
- Không có ngoại lệ `eslint-disable no-restricted-syntax`. Một `eslint-disable-next-line no-empty-pattern` ở `e2e/cloud/fixtures.ts` (chữ ký fixture Playwright).
- `supabase/config.toml` sinh bởi CLI rồi chỉnh: `project_id = "one-percent-better"`, tắt studio/storage/realtime/edge_runtime/analytics (test DB không cần); không đụng project thật.

## 8. Known issues và giới hạn

- `tests/db/rls.test.ts` **chưa từng chạy trên Postgres thật** (không Docker); được viết theo API supabase-js (`admin.createUser`, `signInWithPassword`, upsert `onConflict`). Có thể cần chỉnh nhỏ khi chạy lần đầu với Docker. Chạy: `npm run db:start` → `npx --yes supabase@2.120.0 status` → export `SUPABASE_TEST_PUBLISHABLE_KEY`, `SUPABASE_TEST_SECRET_KEY` (giá trị local) → `npm run test:db`.
- Khi SDK không nạp được lúc khởi động (offline trước khi chunk được precache), app giữ hiển thị tài khoản đã lưu từ kv; sync (M7) sẽ thử nạp lại khi online.
- Nhiều tab: đăng xuất ở tab A → tab B nhận `SIGNED_OUT` qua BroadcastChannel của SDK; service đọc kv `sync.userId` (đã null) để chuyển `signed-out` thay vì `expired`. Chưa có E2E hai tab cho M6 (M7 có kịch bản hai context).
- Bản build phase 1 vẫn **chứa file** `supabase-client-*.js` trong `dist/` (dynamic import tồn tại trong `loader.ts`) nhưng không bao giờ được yêu cầu, không precache, không `modulepreload`.
- Mock: `/rest/v1/*`, `/__test/seed|rows` chỉ lưu bộ nhớ (M7 mới dùng); JWT ký bằng secret giả cố định (không phải secret thật).
- `test:db` guard dựa vào env + `/auth/v1/health`; nếu mock đang chạy ở 54321 thì script nhận ra (`name: mock-supabase`) và skipped.

## 9. Dispute (nếu có)

Không có.

## Assumptions

- A-M6-1: Dữ liệu phase 1 không cần migration Dexie ở M6 (kv `sync` thêm bằng `put`, schema v1 giữ nguyên; v2 ở M7).
- A-M6-2: `redirect_to` không gắn `sb_flow_id` (SDK 2.117 chỉ thêm khi bật `experimental.appendPkceFlowIdToRedirects`), nên khớp đúng chuỗi AC6 và Redirect URLs ở U5 không cần wildcard query.
- A-M6-3: Card Account ẩn khi `unavailable`; D4 và `AuthFeedback` cũng không mount khi cloud tắt.

## Open questions

- OQ-M6-1 (designer): key `settings.about.privacyLink` và vị trí link trong card About (deviation D8) — cần ghi vào DESIGN §7.7.5 để parity test/đối chiếu copy về sau có nguồn.

## Hướng dẫn user setup (U1–U7) đúng theo code

Trạng thái theo STATUS/orchestrator 2026-10-12: project Supabase `grmcmidzyqwryaangpug` (URL `https://grmcmidzyqwryaangpug.supabase.co`) đã tạo, Google client đã tạo, provider Google Enabled, Site URL + Redirect URLs đã cấu hình. Còn lại:

1. **U6 — chạy SQL một lần:** Dashboard → SQL Editor → New query → dán toàn bộ `supabase/migrations/20261012000000_cloud_sync.sql` → Run. Kiểm: Table Editor có `goals`, `entries`, `settings` với nhãn RLS enabled; Database → Functions có `sync_before_write`, `settings_before_write`. Không cần sửa gì trong file.
2. **U7 — tự kiểm trên máy:** tạo `.env.local` ở gốc repo (git-ignored) gồm:
   ```
   VITE_SUPABASE_URL=https://grmcmidzyqwryaangpug.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<sb_publishable_… lấy ở Project Settings → API Keys>
   ```
   → `npm run dev` → `http://localhost:5173/#/settings` → card Account → Sign in with Google → chọn Gmail → quay về `http://localhost:5173/#/settings`, URL không còn `?auth=callback&code=`, card hiện tên + email; Supabase → Authentication → Users có user. Lưu ý: `redirect_to` app gửi là `http://localhost:5173/?auth=callback` (khớp Redirect URL `http://localhost:5173/**`). Reload và tắt mạng vẫn thấy đã đăng nhập (chunk SDK được cache bởi trình duyệt; ở dev không có SW). Sign out → Keep/Remove.
3. **Kiểm nhanh RLS không cần đăng nhập (một phần U10):** `curl "https://grmcmidzyqwryaangpug.supabase.co/rest/v1/goals?select=*" -H "apikey: <publishable key>"` → `[]` hoặc lỗi quyền (không dữ liệu).
4. **U8 (sau M7 PASS):** GitHub → Settings → Secrets → `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` → push `main`; `pages.yml` đã đọc hai secret này ở bước build. Chưa đặt secret → bản deploy không có card Account (an toàn).
5. Không commit `.env.local`; không bao giờ đặt secret key / service-role vào biến `VITE_*`.
