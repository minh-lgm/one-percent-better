# Architecture — 1% Better per Day

## 1. Tổng quan

App là SPA tĩnh (PWA), host trên GitHub Pages. Phase 1: không có backend, mọi dữ liệu nằm trong IndexedDB của trình duyệt. **Phase 2 (v2.0):** thêm backend được quản lý **Supabase** (Auth + Postgres + RLS) làm **tuỳ chọn**; IndexedDB vẫn là nguồn chính, cloud là bản sao đồng bộ (sơ đồ phase 2 ở cuối mục này).

```text
User (phone / desktop browser, installed PWA)
   │
   ▼
┌──────────────────────── Browser ─────────────────────────────────────────┐
│  UI layer (React, src/ui)  ── hash routes: #/today #/goals #/review ...   │
│        │  dùng hooks + services qua AppContext (DI)                       │
│        │  mọi chuỗi qua t() / format*() của src/i18n (en.json, vi.json)   │
│        ▼                                                                  │
│  Services (src/services)  ── orchestrate use case, validate ở biên        │
│        │                 │                                                │
│        ▼                 ▼                                                │
│  Domain (src/domain)   Repository interfaces (src/data/repositories.ts)   │
│  pure functions:            │                                             │
│  validation, stats,         ▼                                             │
│  streak, heatmap,      Dexie implementation (src/data/dexie) ──► IndexedDB│
│  curve, reminder rules                                                    │
│                                                                           │
│  Integration (src/integration) ── Notification API, Service Worker reg,   │
│        File download/upload, StorageManager.persist, .ics builder         │
│                                                                           │
│  Service Worker (src/sw.ts) ── precache app shell (offline),              │
│        notificationclick → focus/open #/today                             │
└───────────────────────────────────────────────────────────────────────────┘
External (phase 1): không có (không server, không CDN, không analytics, không dịch vụ dịch).
External (phase 2, chỉ khi cấu hình cloud và người dùng đăng nhập): Supabase project (`VITE_SUPABASE_URL`), Google OAuth (điều hướng toàn trang).
```

Luồng chính: UI gọi service → service dùng domain để validate/tính toán → service gọi repository để đọc/ghi → UI nhận dữ liệu mới qua subscription (live query) và render lại.

Ngôn ngữ (i18n): domain không chứa chữ hiển thị (chỉ trả mã lỗi và dữ liệu có cấu trúc). UI dịch qua `react-i18next`; service nào phải tự sinh chữ ngoài React (notification, `.ics`) nhận một `Translator` qua constructor. Lựa chọn ngôn ngữ lưu ở kv key `locale` (chi tiết §5.8, ADR-11 … ADR-13).

**Phase 2 — đăng nhập tuỳ chọn + đồng bộ (v2.0):**

```text
User ──► UI (Settings › Account, SyncIndicator, LoginPromptBanner)
           │ useServices()
           ▼
   AuthService ───────────► AuthPort (interface, src/services/auth-port.ts)
   SyncService ──┬────────► RemoteStore (interface, src/services/remote-store.ts)
   LoginPromptService      │                       ▲
           │               │                       │ cài đặt (chỉ nạp bằng import() động)
           ▼               │        src/integration/supabase/ ── @supabase/supabase-js (chunk riêng)
   LocalSyncStore (interface, src/data/repositories.ts)          │ HTTPS
           │                                                     ▼
   Dexie v2 (goals/entries có deletedAt + dirty, kv 'sync') ──  Supabase: Auth (Google OAuth, PKCE)
           ▼                                                    Postgres goals/entries + RLS + trigger LWW
       IndexedDB (nguồn chính)                                     │
                                                                Google accounts (điều hướng toàn trang khi đăng nhập)
```

- Mọi thao tác của người dùng vẫn đi UI → service → repository Dexie (không đổi so với phase 1); repository đánh dấu `dirty = 1` cho bản ghi vừa ghi.
- `SyncService` (chạy nền, theo trigger §5.10) đẩy bản ghi `dirty` lên `RemoteStore`, đọc lại bản ghi chuẩn từ server, kéo thay đổi mới theo con trỏ `server_updated_at`, áp vào IndexedDB qua `LocalSyncStore.applyRemote` (last-write-wins, ADR-21).
- Không có cấu hình Supabase (`VITE_SUPABASE_URL`/key) → `cloud = null` trong container: không tạo `AuthService`/`SyncService` thật, UI ẩn mọi phần tài khoản, không tải SDK (FR-38).
- SDK Supabase chỉ được nạp bằng `import()` động khi: người dùng bấm đăng nhập, URL là callback OAuth (`?auth=callback`), hoặc `localStorage` có key phiên `opb-auth` (ADR-18).

## 2. Stack và lý do

Version đã kiểm tra trên npm registry ngày 2026-10-09. Developer pin **exact** version (không `^`), commit `package-lock.json`.

| Lớp | Lựa chọn | Version | Lý do | Phương án đã loại |
| :- | :- | :- | :- | :- |
| Runtime/tooling | Node.js + npm | 22.14.0 / 10.9.2 (có sẵn) | Có sẵn trên máy; npm không cần corepack, ít bất ngờ nhất trên Windows | pnpm 9 (tốt nhưng thêm một biến số cho QC) |
| Ngôn ngữ | TypeScript | 6.0.x mới nhất (≥ 6.0.3) | Typed, bắt lỗi sớm | TS 7.0 (typescript-eslint 8.71 chỉ hỗ trợ `<6.1.0`) |
| UI | React + React DOM (+ `react-is` cho Recharts) | 19.3.0 | Phổ biến nhất, hệ sinh thái test tốt | Svelte/Vue (ít phổ biến hơn với đội), Preact |
| Build/dev | Vite + `@vitejs/plugin-react` | 8.3.4 / 6.1.2 | Nhanh, chuẩn cho SPA React; Node 22.14 thoả `>=22.12` | CRA (ngừng phát triển), Next.js (thừa SSR cho app không server) |
| PWA | `vite-plugin-pwa` (strategy `injectManifest`) + `workbox-precaching`, `workbox-window`, `workbox-build` | 2.0.0 / 7.4.1 | Sinh manifest + precache, hỗ trợ Vite 8; `injectManifest` cho phép tự viết handler `notificationclick` | Tự viết SW tay (dễ sai cache), strategy `generateSW` (không thêm handler notification gọn) |
| Routing | `react-router` (data router, `createHashRouter`) | 7.18.4 | Ổn định; hash routing chạy trên mọi static host không cần cấu hình rewrite | react-router 8.x (yêu cầu Node ≥ 22.22, máy có 22.14) |
| Lưu trữ | IndexedDB qua `dexie` | 4.4.6 | API transaction rõ ràng, `liveQuery` để UI tự cập nhật, test được với fake-indexeddb | localStorage (đồng bộ, giới hạn ~5 MB, không transaction), `idb` (ít tiện ích, phải tự viết live query) |
| Validate | `zod` | 4.6.5 | Schema cho form và file import, message rõ. **v3.1 (ADR-27):** chỉ dùng ở hai biên được nạp lười — file backup khi Import (`domain/backup.ts`) và hàng kéo từ cloud (`integration/supabase/mapper.ts`); form goal/entry và `config/env.ts` kiểm bằng TypeScript thuần (luật đơn giản: độ dài, khoảng số nguyên) để zod không nằm trên đường tải lạnh | Tự viết validate cho file import (dễ sót, đây là biên bảo mật), yup; `zod/mini` (đổi API toàn bộ schema, vẫn nằm trên đường tải lạnh nếu form dùng) |
| Ngày tháng | `date-fns` | 4.4.0 | Hàm thuần, tree-shake, xử lý ngày cục bộ an toàn (DST) | dayjs (plugin), tự tính bằng ms (lỗi DST) |
| i18n (chuỗi) | `i18next` + `react-i18next` | 26.4.2 / 17.0.16 | Phổ biến nhất cho React; nội suy, số nhiều qua `Intl.PluralRules` (hậu tố `_one`/`_other`; `vi` chỉ có `_other`), `changeLanguage` re-render toàn app ngay; key có kiểu (TS `CustomTypeOptions`) để bắt key sai lúc typecheck; peer `typescript ^5 \|\| ^6 \|\| ^7` hợp TS 6.0; ≈ 20 KB gzip, vừa ngân sách NFR-03. Resource import tĩnh từ JSON (không backend plugin, không request) | `i18next-browser-languagedetector` 8.2.1 (cache sẵn chỉ localStorage/cookie, trong khi quyết định là lưu ở kv IndexedDB; quy tắc FR-33 chỉ một dòng, tự viết dễ test hơn); tự viết `t()` (rẻ nhưng phải tự lo nội suy, số nhiều, re-render, kiểu key); `react-intl`/FormatJS (ICU message nặng hơn, cần polyfill/compile để gọn); Lingui (cần macro/compile step, thêm biến số cho toolchain) |
| i18n (định dạng) | `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.PluralRules` (có sẵn trong trình duyệt và Node 22 full-icu) | — | Không thêm dependency; đúng quy ước `en-US`/`vi-VN` | Định dạng tay bằng date-fns locale (thêm bundle, trùng với Intl) |
| Biểu đồ | `recharts` (lazy-load) | 3.10.1 | Phổ biến, khai báo bằng component, đủ cho line + bar | Chart.js (imperative), nivo (nặng). Heatmap tự vẽ bằng SVG/CSS grid (đơn giản, dễ test, dễ a11y) |
| Lint | ESLint + `@eslint/js` + `typescript-eslint` + `eslint-plugin-react-hooks` + `globals` | 10.12.0 / 10.0.1 / 8.71.1 / 7.1.1 / mới nhất lúc cài | Flat config; `no-restricted-imports` để cưỡng chế tách lớp. ESLint 10 cần Node ≥ 22.13 (máy có 22.14) | Biome (chưa có rule chặn import theo thư mục tương đương) |
| Unit/integration test | Vitest + `@vitest/coverage-v8` | 4.1.11 | Dùng chung config Vite; dòng 4.x đã trưởng thành | Vitest 5.0 (major mới ra), Jest (cấu hình ESM/TS phức tạp hơn) |
| DOM test | `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `@testing-library/jest-dom` | 26.1.0 / 16.3.3 / 10.x mới nhất / 14.6.7 / 7.0.1 | Chuẩn cho React | jsdom 30 (yêu cầu Node ≥ 22.22.2) |
| IndexedDB giả | `fake-indexeddb` | 6.2.5 | Chạy Dexie trong Node | Mock repository (không test được Dexie thật) |
| E2E | `@playwright/test` (Chromium) + `@axe-core/playwright` | 1.64.0 / 4.13.0 | Có `page.clock` (giả thời gian cho timer/nhắc nhở), `setOffline`, `grantPermissions`, bắt download | Cypress (yếu hơn với SW, nhiều tab, clock) |
| Script đa nền tảng | `cross-env` | 10.1.0 | Đặt `PLAYWRIGHT_BROWSERS_PATH=0` để browser nằm trong `node_modules` (không cài global) | Đặt env tay (khác nhau giữa PowerShell/Git Bash) |
| **Backend (v2.0)** | Supabase (dịch vụ quản lý: Auth + Postgres + RLS + PostgREST), gói Free | — | Quyết định của user/orchestrator 2026-10-12; không phải viết/host server; RLS theo `auth.uid()` cho phép client gọi thẳng DB an toàn; có Google OAuth sẵn; free tier đủ cho 1 người (500 MB DB) | Firebase (NoSQL, không RLS kiểu SQL, SDK nặng hơn); Dexie Cloud (trả phí, khoá vào vendor); PocketBase/tự viết API (phải host server); PowerSync/ElectricSQL (thêm dịch vụ đồng bộ riêng) |
| SDK cloud (v2.0) | `@supabase/supabase-js` (lazy chunk) | 2.117.3 (kiểm npm 2026-10-12; `engines: node >=22`) | SDK chính thức: `signInWithOAuth` + `exchangeCodeForSession` (PKCE), PostgREST query builder (upsert, keyset filter); pin exact | Gọi REST tay bằng `fetch` (phải tự lo PKCE, refresh token, lưu phiên); chỉ `@supabase/auth-js` + `@supabase/postgrest-js` (nhỏ hơn nhưng ít phổ biến, cân nhắc nếu chunk > 60 KB gzip — ghi trong handoff) |
| Supabase CLI (v2.0, chỉ test DB cục bộ) | `supabase` qua `npx --yes supabase@2.120.0` (không nằm trong `devDependencies`) | 2.120.0 (có binary `@supabase/cli-windows-x64`) | Chạy Supabase local trên Docker để áp migration và test RLS/trigger thật; không làm nặng `npm ci`; cache của npx không phải cài global | Thêm vào devDependencies (tải binary cho mọi máy, kể cả CI không cần); pgTAP (`supabase test db`, viết SQL test khó đọc hơn với đội) |
| Mock Supabase cho E2E (v2.0) | Server Node `http` thuần trong `e2e/mock-supabase/` | — (không thêm dependency) | Chạy OAuth PKCE + REST cần thiết không cần Docker/tài khoản thật (NFR-17); kiểm được cả luồng redirect trên sub-path | `page.route` chặn request (không mô phỏng được điều hướng toàn trang tới trang authorize); MSW (thêm dependency, chạy trong page) |

## 3. Component

| Component | Lớp (config/logic/data/integration) | Trách nhiệm | Phụ thuộc |
| :- | :- | :- | :- |
| `config/env.ts` | config | Đọc và validate `import.meta.env` (DB name, interval nhắc) với default. **v3.1:** kiểm bằng TS thuần, hành vi `parseEnv` giữ nguyên (M6-AC2) | ~~zod~~ — (v3.1) |
| `config/constants.ts` | config | Giới hạn nghiệp vụ (độ dài tên, phút tối đa, kích thước import, ngưỡng heatmap) | — |
| `domain/types.ts` | logic | Kiểu `Goal`, `LogEntry`, `ActiveTimer`, `Settings`, `ISODate`, `DomainError` | — |
| `domain/dates.ts` | logic | Ngày cục bộ ↔ `YYYY-MM-DD`, cộng/trừ ngày, khoảng ngày, tuần ISO | date-fns |
| `domain/goal.ts` | logic | Validate goal, `dailyTarget`, trạng thái goal, kiểm tra đổi khoảng thời gian | dates (v3.1: bỏ zod, ADR-27) |
| `domain/entry.ts` | logic | Validate entry, giới hạn 1440 phút/ngày, quy tắc ngày ghi bù | dates (v3.1: bỏ zod, ADR-27) |
| `domain/stats.ts` | logic | Tổng theo ngày/tuần/tháng, ngày đạt, streak, tiến độ, đi trước/chậm | dates |
| `domain/heatmap.ts` | logic | Lưới năm (cột tuần, hàng thứ Hai→Chủ nhật), mức màu 0–4 | dates, stats |
| `domain/curve.ts` | logic | Chuỗi điểm 1.01^k lý tưởng và thực tế, headline "+X%", miền trục Y. **v3.0 (M9):** thực tế = phút ngày có ghi gần nhất / phút ngày đầu có ghi (§4.5, ADR-26) | dates |
| `domain/timer.ts` | logic | Thời gian đã chạy, làm tròn phút, ngày quy về | dates |
| `domain/reminder.ts` | logic | `shouldNotify`, `shouldShowBanner`, dữ liệu nhắc có cấu trúc (`{ pendingCount, items: [{ goalName, minutes, target }] }`) — không sinh chữ; chữ do `ReminderService` dịch | stats |
| `domain/backup.ts` | logic | Schema file backup (zod), kiểm tra version và toàn vẹn tham chiếu. **v3.1 (ADR-27):** chỉ được nạp bằng `import()` từ `BackupService.parse`; re-export phần của `backup-file.ts` để code/test cũ import từ đây vẫn chạy | zod, entry, backup-file |
| `domain/backup-file.ts` (v3.1, M10) | logic | Phần **không zod** của backup, dùng trên đường tải lạnh: `backupReminder` (FR-21), `backupFileName`, `buildBackup`, `BACKUP_MIME_TYPE`, kiểu `BackupFile`, `BackupReminder` | dates, types |
| `domain/ics.ts` | logic | Sinh nội dung `.ics` (VEVENT lặp hằng ngày); nhận `summary` và `alarmDescription` đã dịch làm tham số, tự escape theo RFC 5545 | — |
| `i18n/types.ts` | config | Kiểu `Locale = 'en' \| 'vi'`, `MessageKey`, interface `Translator { locale: Locale; t(key, params?): string }` | — |
| `i18n/resources/en.json`, `vi.json` | config | Toàn bộ chuỗi UI theo key; nguồn sự thật cho copy (nguyên văn từ DESIGN.md) | — |
| `i18n/detect.ts` | config | `detectLocale(navigatorLanguage: string \| undefined): Locale` (FR-33), hàm thuần | — |
| `i18n/format.ts` | config | `createFormatters(locale)`: `dateLong`, `dateShort`, `weekdayShort`, `monthShort`, `number`, `decimal1`, `percent1`, `minutes`, `duration`, `hhmmss`; cache `Intl.*` theo locale | Intl |
| `i18n/instance.ts` | config | Khởi tạo i18next (resources tĩnh, `lng`, `fallbackLng: 'en'`, `returnNull: false`, `missingKeyHandler` ném lỗi ở test), `setLocale()` cập nhật i18next + `<html lang>`; `createTranslator(i18n)` → `Translator` | i18next |
| `services/locale-service.ts` | logic (application) | `resolve(navigatorLanguage)` (kv `locale` nếu có, ngược lại `detectLocale`), `set(locale)`, `watch()` | `KvRepository`, i18n/detect |
| `data/repositories.ts` | data | Interface `GoalRepository`, `EntryRepository`, `KvRepository` (có `update` nguyên tử, ADR-14), `TimerRepository` (M3, ADR-16), `BackupRepository`, `BackupData`, `Subscribable<T>` | domain/types |
| `data/dexie/*` | data | DB schema Dexie v1 và implementation các repository, cascade delete, `KvRepository.update` trong một transaction `rw`, `saveTimerEntry` trong một transaction `rw` trên `goals`+`entries`+`kv` (M3), replaceAll trong transaction | dexie |
| `services/*` | logic (application) | Use case: goal, entry, timer, settings, reminder, backup, stats; nhận repository qua constructor | domain, data interfaces |
| `services/settings-service.ts` | logic (application) | Bọc kv `settings`: `normalizeSettings` (dữ liệu hỏng → mặc định), đọc/ghi, claim/release ngày nhắc nguyên tử (ADR-15) | `KvRepository` |
| `services/mutex.ts` | logic (application) | `Mutex.run(task)` tuần tự hoá chuỗi kiểm-rồi-ghi **trong một tab** (không thay được transaction giữa các tab) | — |
| `services/notification-port.ts` | logic (application) | Interface `NotificationPort` (permission, requestPermission, `show → boolean`); cài đặt ở `integration/notifications.ts`, giả trong test | domain/reminder (kiểu) |
| `app/reminder-scheduler.ts` | config (composition) | `startReminderScheduler({ check, intervalMs, deps })` → hàm dừng; trigger: khởi động, interval, `visibilitychange`; trigger đến khi `check` đang chạy được ghi nhớ và chạy thêm đúng một lần | services (qua callback) |
| `integration/notifications.ts` | integration | Hỗ trợ/quyền/xin quyền, `showNotification` qua `ServiceWorkerRegistration` | Notification API, SW |
| `integration/sw-register.ts` | integration | Đăng ký SW (chỉ bản build), cập nhật SW | workbox-window |
| `integration/file-io.ts` | integration | Tải file (Blob + `<a download>`), đọc file người dùng chọn | File API |
| `integration/storage.ts` | integration | `navigator.storage.persist()`/`persisted()`, phát hiện IndexedDB không dùng được | StorageManager |
| `app/container.ts` | config (composition root) | Khởi tạo repository + service (truyền `Translator` cho service cần sinh chữ), cung cấp qua `AppContext` | data/dexie, services, integration, i18n |
| `app/bootstrap.ts` | config | Thứ tự khởi động: init i18n với `detectLocale` → mở DB (lỗi → `StorageError` đã dịch theo ngôn ngữ phát hiện) → `LocaleService.resolve` → `setLocale` → render router | i18n, container |
| `app/router.tsx` | UI | Khai báo route, lazy-load Review và Goal detail | react-router |
| `ui/screens/*`, `ui/components/*`, `ui/hooks/*` | UI | Màn hình, component, hook `useSubscribable`, `useNow`, `useT` (bọc `useTranslation`), `useFormat` (formatter theo locale hiện tại), `useDocumentTitle` | services (qua context), i18n |
| `ui/error-messages.ts` | UI | Ánh xạ `DomainError` (code + biến thể + tham số) → key i18n `errors.*` (thay cho `src/ui/copy.ts` nêu trong DESIGN.md) | i18n/types |
| `sw.ts` | integration | Precache (workbox), `notificationclick` → focus client hoặc mở `#/today` | workbox-precaching |

**Component mới ở phase 2 (v2.0):**

| Component | Lớp | Trách nhiệm | Phụ thuộc | Milestone |
| :- | :- | :- | :- | :- |
| `config/env.ts` (mở rộng) | config | Parse `VITE_SUPABASE_URL` (chỉ `https://…`, hoặc `http://localhost`/`http://127.0.0.1` cho test), `VITE_SUPABASE_PUBLISHABLE_KEY` (dự phòng `VITE_SUPABASE_ANON_KEY`), `VITE_SYNC_INTERVAL_MS`; trả `cloud: { url, key } \| null` (thiếu/sai → `null`, không ném lỗi) | zod | M6 |
| `domain/sync.ts` | logic (domain) | Hàm thuần: `resolveIncoming(local, remote) → 'apply' \| 'keep-local'` (ADR-21), `nextUpdatedAt(now, previous)`, `isNewer(a, b)` so sánh theo thời điểm (không so chuỗi), kiểu `SyncStatus` | — | M7 |
| `domain/login-prompt.ts` | logic (domain) | `shouldShowLoginPrompt(input) → boolean`, `shouldShowExportHint(input)` theo A-30 | dates | M8 |
| `services/auth-port.ts` | logic (application) | Interface `AuthPort`, kiểu `AuthSession`, `AuthEvent` (§5.9) | — | M6 |
| `services/remote-store.ts` | logic (application) | Interface `RemoteStore`, kiểu `RemoteChanges`, `PullCursor`, lỗi `RemoteError` (§5.10) | data/repositories (kiểu) | M7 |
| `services/auth-service.ts` | logic (application) | Máy trạng thái tài khoản (`unavailable` / `signed-out` / `signing-in` / `signed-in` / `expired`), `signIn(returnTo)`, `completeCallback(params)`, `signOut({ keepData })`, `watch()`; nạp `AuthPort` lười qua factory | `AuthPort` (qua factory), `LocalDataRepository`, `KvRepository` | M6 |
| `services/sync-service.ts` | logic (application) | Một chu kỳ đồng bộ (push → đọc lại bản ghi chuẩn → pull → dọn entry mồ côi), con trỏ, backoff, single-flight (qua `LockPort`), trạng thái `watchStatus()`, `syncNow()`, `prepareFirstSignIn()` (gộp/xác nhận đổi tài khoản), `finalSyncBeforeSignOut()` | `LocalSyncStore`, `RemoteStore` (qua factory), `KvRepository`, domain/sync | M7 |
| `services/login-prompt-service.ts` | logic (application) | Đọc/ghi kv `loginPrompt`, `dismiss(now)`, `claimExportHint(now)`, `state(now)` | `KvRepository`, `GoalRepository`, `EntryRepository`, domain/login-prompt | M8 |
| `services/lock-port.ts` | logic (application) | Interface `LockPort { runExclusive(name, fn) → Promise<'ran' \| 'busy'> }`; cài đặt bằng Web Locks API ở `integration/web-locks.ts` (không hỗ trợ → luôn chạy) | — | M7 |
| `data/dexie/db.ts` (v2) | data | Schema v2 + `upgrade()` (ADR-20, §4.2) | dexie | M7 |
| `data/dexie/*-repo.ts` (sửa) | data | Lọc bản ghi đã xoá ở mọi truy vấn; xoá = xoá mềm; ghi = `dirty = 1`; entry của goal đã xoá không trả ra | dexie, domain/sync | M7 |
| `data/dexie/local-data-repo.ts` | data | `LocalDataRepository.clearUserData()` (một transaction: `goals`, `entries`, kv trừ `locale`, `loginPrompt`), `countLive()` | dexie | M6 |
| `data/dexie/sync-store.ts` | data | `LocalSyncStore`: `getDirty`, `applyRemote` (một transaction/lô), `markAllDirty`, `watchPendingCount`, `tombstoneOrphanEntries` | dexie, domain/sync | M7 |
| `data/dexie/prefs-repo.ts` (v2.1) | data | `SyncedPrefsRepository`: ghi nhóm nhắc nhở (kv `settings`) hoặc ngôn ngữ (kv `locale`) **cùng** mốc đồng bộ (kv `prefsSync`) trong một transaction; `getDirty`, `applyRemote` theo nhóm (LWW), `markAllDirty`, `watch` | dexie, domain/sync | M7 |
| `integration/supabase/supabase-client.ts` | integration | **Chỉ file này (và cùng thư mục) import `@supabase/supabase-js`.** `createSupabase(cloud)` với `auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, storageKey: 'opb-auth' }`; export `SupabaseAuthPort`, `SupabaseRemoteStore` | `@supabase/supabase-js` | M6 (Auth), M7 (Remote) |
| `integration/supabase/mapper.ts` | integration | Hàng SQL (`snake_case`, `timestamptz`, `date`) ↔ bản ghi app (`camelCase`, ISO `…Z` có ms); validate hàng kéo về bằng zod; hàm thuần | zod, domain | M7 |
| `integration/supabase/loader.ts` | integration | `loadSupabase(cloud) = () => import('./supabase-client')` (memo một lần); `hasStoredSession(storage)` đọc `localStorage['opb-auth']` **không** nạp SDK | — | M6 |
| `integration/auth-callback.ts` | integration | `readAuthCallback(location) → { code } \| { error, description } \| null` (nhận diện `?auth=callback`), `cleanCallbackUrl(history, location)` (bỏ query, giữ hash), lưu/đọc `returnTo` trong `sessionStorage` key `opb-auth-return` | — | M6 |
| `integration/connectivity.ts` | integration | `isOnline()`, sự kiện `online`/`offline`, `visibilitychange` | — | M6/M7 |
| `app/sync-scheduler.ts` | config (composition) | Gắn trigger FR-46 vào `SyncService.syncNow`: khởi động, `online`, `visibilitychange`, debounce 2 s khi `watchPendingCount` tăng, interval khi đang hiển thị; trả hàm dừng | services (qua callback) | M7 |
| `ui/components/AccountCard.tsx`, `SignOutDialog.tsx`, `MergeAccountDialog.tsx`, `SyncIndicator.tsx`, `LoginPromptBanner.tsx`, `ExportSignInHint.tsx` | UI | Theo DESIGN.md (designer bổ sung ở lần revise v2) | services qua context, i18n | M6–M8 |
| `supabase/migrations/20261012000000_cloud_sync.sql`, `supabase/config.toml` | data (hạ tầng cloud) | Schema, trigger LWW, RLS, grant (§4.3); `config.toml` sinh bởi `supabase init` cho Supabase local | — | M6 |
| `e2e/mock-supabase/server.mjs` | test | Mock Supabase (Auth PKCE + REST tối thiểu + trang chọn tài khoản giả + endpoint `/__test/*`) (§8) | Node `http` | M6 (Auth), M7 (REST) |

**Component mới/sửa ở v3.1 (M10):**

| Component | Lớp | Trách nhiệm | Phụ thuộc | Milestone |
| :- | :- | :- | :- | :- |
| `domain/backup-file.ts` | logic | Phần không zod của backup (xem bảng trên) | dates, types | M10 |
| `domain/sync.ts` (mở rộng) | logic (domain) | Hàm thuần `isPurgeableTombstone(row, now, { neverSynced, retentionDays })` theo ADR-29 | — | M10 |
| `data/dexie/sync-store.ts` (mở rộng) | data | `purgeTombstones(now)`: MỘT transaction `rw` trên `goals`, `entries`, `kv`; đọc kv `sync` trong cùng transaction để biết `neverSynced`; xoá cứng hàng thoả `isPurgeableTombstone`; trả số hàng đã xoá | dexie, domain/sync | M10 |
| `app/maintenance.ts` | config (composition) | `startMaintenance({ purge, clock, schedule })`: chạy `purgeTombstones` **một lần** sau khi app đã render (không chặn khởi động; `requestIdleCallback`, thiếu thì `setTimeout` 2 s); lỗi bị bắt và ghi `console.warn`, không hiện UI | data (qua callback) | M10 |
| `integration/auth-callback.ts` (mở rộng) | integration | `clearPkceVerifier(storage)`: xoá `localStorage['opb-auth-code-verifier']` sau khi callback xử lý xong (thành công, huỷ, lỗi) | — | M10 |
| `integration/supabase/loader.ts` (sửa) | integration | Bản build **không** cấu hình cloud không phát ra chunk `supabase-client-*` (nhánh `import()` bị loại lúc build, ví dụ qua hằng `define` hoặc alias tới stub); bản cloud bật giữ nguyên lazy-load (ADR-18) | — | M10 |

**Quy tắc phụ thuộc (bắt buộc, cưỡng chế bằng ESLint `no-restricted-imports`):**

- `src/domain/**` không import `react`, `react-dom`, `dexie`, `recharts`, `i18next`, `react-i18next`, hay bất kỳ file nào trong `src/data`, `src/services`, `src/integration`, `src/ui`, `src/app`, `src/i18n` (domain không biết ngôn ngữ).
- `src/services/**` không import `dexie`, `react`, `i18next`, `react-i18next`, `src/data/dexie/**`, `src/ui/**`, `src/i18n/instance*`, `src/i18n/resources/**` (chỉ dùng interface trong `src/data/repositories.ts` và `src/i18n/types.ts`, `src/i18n/detect.ts`, `src/i18n/format.ts`; integration và `Translator` được truyền vào qua constructor).
- `src/ui/**` không import `dexie` hay `src/data/dexie/**`; không import `i18next` trực tiếp (dùng hook `useT`/`useFormat`).
- `src/i18n/**` không import `react`, `src/ui/**`, `src/services/**`, `src/data/**`.
- Chỉ `src/app/container.ts` (và `bootstrap.ts`) được ghép implementation cụ thể.
- **(v2.0)** `@supabase/*` chỉ được import (tĩnh) trong `src/integration/supabase/**`; mọi file khác import `@supabase/*` → lỗi lint. File ngoài `src/integration/supabase/**` không được import **tĩnh** `integration/supabase/supabase-client` (chỉ `loader.ts` dùng `import()` động; `no-restricted-imports` không xét `import()` nên quy tắc này giữ cho SDK nằm ngoài entry chunk). `src/services/**` thêm cấm `@supabase/*` và `src/integration/**` (integration được truyền qua constructor/factory). `src/domain/**` không đổi (thuần).
- **(v3.1, ADR-27)** `zod` chỉ được import trong `src/domain/backup.ts` và `src/integration/supabase/**` (cùng file test); mọi file khác import `zod` → lỗi `no-restricted-imports`. `src/ui/**`, `src/app/**`, `src/services/**`, `src/domain/**`, `src/data/**` không được import giá trị từ `src/domain/backup.ts` **tĩnh** (dùng `domain/backup-file.ts`; `import type` được phép, rule đặt `allowTypeImports: true`); chỉ `BackupService` nạp nó bằng `import()`.
- **(v3.1, M6-P1)** `import()` động tới `@supabase/*` hoặc tới `integration/supabase/supabase-client` ngoài `src/integration/supabase/**` → lỗi (ESLint `no-restricted-syntax`, selector `ImportExpression[source.value=/^@supabase\//]` và `ImportExpression[source.value=/supabase-client/]`; với `src/ui/**`, `src/app/**` phải gộp vào **cùng** khai báo `no-restricted-syntax` đang có, vì flat config ghi đè cả mảng selector).
- Rule tách lớp của `src/domain/**`, `src/services/**`, `src/ui/**` bỏ qua file `*.test.ts`/`*.test.tsx` (để test đọc `en.json`/`vi.json` và dựng repository Dexie thật trên fake-indexeddb). Code không phải test vẫn bị chặn (probe M1-AC13, M1-AC17 vẫn exit ≠ 0).

**Quy tắc chuỗi hiển thị (bắt buộc, cưỡng chế bằng ESLint + test, NFR-11):**

- Mọi chữ người dùng thấy hoặc screen reader đọc phải đến từ `t()` (key trong `en.json`/`vi.json`) hoặc từ formatter `format.ts`, hoặc là dữ liệu người dùng (tên goal, why, note).
- ESLint core `no-restricted-syntax` cho `src/ui/**/*.tsx`, `src/app/**/*.tsx`, trừ `**/*.test.tsx` (gộp cùng selector cấm `dangerouslySetInnerHTML` trong **một** khai báo rule, vì flat config ghi đè cả mảng selector):
  - `JSXText[value=/[A-Za-z]/]` → "Hardcoded UI text: use t()".
  - `JSXAttribute[name.name=/^(aria-label|aria-description|aria-valuetext|placeholder|title|alt|label)$/][value.type='Literal']` → "Hardcoded accessible text: use t()".
  - `JSXElement > JSXExpressionContainer > Literal[value=/[A-Za-z]/]` (chặn `{'Save'}`).
  - Ngoại lệ chỉ bằng `// eslint-disable-next-line no-restricted-syntax -- <lý do>` và phải liệt kê trong handoff.
- Chuỗi trong code không phải JSX (toast, `document.title`, nội dung notification) không bị lint bắt: được bảo vệ bằng test quét DOM ở chế độ `vi` (§8).

## 4. Data model

Kiểu dữ liệu (TypeScript, trong `src/domain/types.ts`):

```ts
type ISODate = string;      // 'YYYY-MM-DD' theo giờ cục bộ
type ISODateTime = string;  // new Date().toISOString()

interface Goal {
  id: string;                     // crypto.randomUUID()
  name: string;                   // trim, 1–60 ký tự
  why: string;                    // 0–280 ký tự
  targetType: 'daily' | 'total';
  targetMinutes: number;          // daily: 1–1440 (phút/ngày); total: 60–600000 (nhập theo giờ 1–10000)
  startDate: ISODate;
  endDate: ISODate;               // >= startDate, khoảng ≤ 1827 ngày
  archived: boolean;              // M5 dùng; M1 luôn false
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface LogEntry {
  id: string;
  goalId: string;
  date: ISODate;                  // startDate ≤ date ≤ min(endDate, today)
  minutes: number;                // số nguyên 1–1440; tổng theo (goalId, date) ≤ 1440
  note: string;                   // 0–280 ký tự
  source: 'manual' | 'timer';
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface ActiveTimer { goalId: string; startedAt: ISODateTime }   // kv key 'activeTimer'

interface Settings {                                                // kv key 'settings'
  reminderEnabled: boolean;       // default false
  reminderTime: string;           // 'HH:MM' 24h, default '20:00'
  lastReminderDate: ISODate | null;
  lastBackupAt: ISODateTime | null;
  plusOneShown: Record<string, ISODate>; // goalId → ngày đã hiện phản hồi +1% (M5)
}

type Locale = 'en' | 'vi';                                          // kv key 'locale' (src/i18n/types.ts)
// Chỉ ghi khi người dùng chọn trong Settings (A-16). Không thuộc Settings,
// không có trong file backup, import không đọc/không xoá key này (FR-34).
```

**Dexie schema v1** (DB name lấy từ `VITE_DB_NAME`, mặc định `one-percent-better`):

| Store | Khoá & index | Ghi chú |
| :- | :- | :- |
| `goals` | `id` | Không index trường boolean (IndexedDB không index được boolean) |
| `entries` | `id, goalId, date, [goalId+date]` | Truy vấn theo goal, theo ngày, theo khoảng ngày |
| `kv` | `key` | `{ key: 'settings' \| 'activeTimer' \| 'locale', value }` (thêm key không cần tăng version schema Dexie) |

Thay đổi schema sau này: tăng `db.version(n)` kèm `upgrade()`; tăng `schemaVersion` của file backup khi định dạng export đổi.

**Giá trị suy ra (không lưu, tính khi đọc):**

- `periodDays(goal)` = số ngày từ `startDate` tới `endDate`, tính cả hai đầu.
- `dailyTarget(goal)` = `targetType === 'daily' ? targetMinutes : ceil(targetMinutes / periodDays)`. Ví dụ 100 h, 2026-01-01→2026-12-31: `ceil(6000/365) = 17`.
- `totalTarget(goal)` = `daily ? targetMinutes × periodDays : targetMinutes`.
- `status(goal, today)`: `archived` nếu archived; `upcoming` nếu today < startDate; `ended` nếu today > endDate; còn lại `active`.
- Ngày đạt: tổng phút của goal trong ngày ≥ `dailyTarget`.
- `currentStreak`: số ngày đạt liên tiếp kết thúc ở hôm nay nếu hôm nay đạt, ngược lại kết thúc ở hôm qua. `longestStreak`: chuỗi dài nhất trong khoảng của goal. Streak tổng: ngày có ≥ 1 goal đạt.
- `progress%` = tổng phút trong khoảng / `totalTarget` × 100, làm tròn 1 chữ số thập phân, có thể > 100.
- `pace` = tổng phút tới hôm nay − `dailyTarget × số ngày đã trôi qua (startDate → min(today, endDate), tính cả hai đầu, tức là gồm cả hôm nay)`; dương = đi trước. Goal `upcoming`: pace = 0.
- Timer: số phút điền sẵn khi Stop = `clamp(round(elapsedMs / 60000), 1, 1440)` (làm tròn tới phút gần nhất, 30 s làm tròn lên; tối thiểu 1, tối đa 1440).
- Mức heatmap một goal: 0 = 0 phút; 1 = >0 và <50% `dailyTarget`; 2 = 50–<100%; 3 = 100–<200%; 4 = ≥200%. "All goals" theo tổng phút: 0 = 0; 1 = 1–29; 2 = 30–59; 3 = 60–119; 4 = ≥120. Ngày ngoài khoảng goal: trạng thái `outside`.
- Đường cong: với mỗi ngày d trong khoảng goal, `k` = thứ tự ngày (startDate là 1), `ideal = 1.01^k`. ~~Với d ≤ today, `n(d)` = số ngày đạt từ startDate tới d, `actual = 1.01^n(d)`. Headline: `(1.01^n(today) − 1) × 100`, 1 chữ số thập phân.~~ **v3.0 (M9):** `actual(d)` = phút ngày có ghi gần nhất ≤ d / phút ngày đầu tiên có ghi; công thức đầy đủ, làm tròn, ví dụ, contract và thang Y ở **§4.5**.

### 4.1 Kiểu domain ở phase 2 (v2.0)

`Goal`, `LogEntry`, `Settings`, `ActiveTimer` **không đổi** (domain, UI, file backup không biết về sync). Thêm:

```ts
// src/data/repositories.ts — chỉ lớp data/sync thấy
type SyncFlag = 0 | 1 | 2;                               // IndexedDB không index được boolean
                                                         // 0 = đã đồng bộ, 1 = chờ đẩy, 2 = cloud từ chối (M7-D1, ADR-28)
type GoalRow  = Goal     & { deletedAt: ISODateTime | null; dirty: SyncFlag };
type EntryRow = LogEntry & { deletedAt: ISODateTime | null; dirty: SyncFlag };
type SyncRecord<T> = T & { deletedAt: ISODateTime | null };   // dạng trao đổi với RemoteStore (không có dirty)

interface SyncMeta {                                       // kv key 'sync'
  userId: string | null;            // tài khoản đang đăng nhập (null khi đã đăng xuất)
  lastUserId: string | null;        // tài khoản gần nhất từng đồng bộ trên thiết bị (FR-47)
  account: { email: string; name: string } | null; // hiển thị ngay khi offline/trước khi SDK nạp (FR-40)
  cursor: { goals: PullCursor | null; entries: PullCursor | null };
  lastSyncedAt: ISODateTime | null;
  lastError: { code: SyncErrorCode; at: ISODateTime } | null;
}
interface PullCursor { serverUpdatedAt: ISODateTime; id: string }

interface LoginPromptState {                               // kv key 'loginPrompt' (M8)
  dismissCount: number;             // số lần "Not now" (tối đa 3 rồi không hiện trên Today)
  lastDismissedAt: ISODateTime | null;
  lastExportHintAt: ISODateTime | null;
}

// v2.1 — tuỳ chọn người dùng được đồng bộ (FR-55). Giá trị vẫn nằm ở chỗ cũ
// (settings.reminderEnabled/reminderTime trong kv 'settings', ngôn ngữ trong kv 'locale');
// kv 'prefsSync' chỉ giữ mốc đồng bộ của từng nhóm.
type PrefGroup = 'reminder' | 'locale';
interface PrefGroupMeta { updatedAt: ISODateTime | null; dirty: SyncFlag }   // updatedAt null = thiết bị chưa từng chọn
interface PrefsSyncState { reminder: PrefGroupMeta; locale: PrefGroupMeta }  // kv key 'prefsSync'
interface RemotePrefs {                                                      // một hàng bảng `settings` trên cloud
  reminder: { enabled: boolean; time: string; updatedAt: ISODateTime } | null;
  locale:   { value: Locale; updatedAt: ISODateTime } | null;
}

type KvKey = 'settings' | 'activeTimer' | 'locale' | 'sync' | 'loginPrompt' | 'prefsSync';
```

### 4.2 Dexie schema v2 (M7)

| Store | v1 | v2 | Ghi chú |
| :- | :- | :- | :- |
| `goals` | `id` | `id, dirty` | Thêm field `deletedAt` (không index), `dirty` (index để lấy bản ghi chờ đẩy) |
| `entries` | `id, goalId, date, [goalId+date]` | `id, goalId, date, [goalId+date], dirty` | Như trên |
| `kv` | `key` | `key` | Thêm key `sync`, `loginPrompt` (không cần đổi schema) |

`db.version(2).stores({...}).upgrade(tx => …)`: mọi goal/entry hiện có → `deletedAt = null`, `dirty = 1` (chưa từng lên cloud, nên lần đăng nhập đầu sẽ đẩy hết = gộp, FR-47). kv giữ nguyên giá trị; thêm kv `prefsSync` (v2.1, A-36): nhóm `locale` = `{ updatedAt: '1970-01-01T00:00:00.000Z', dirty: 1 }` nếu kv `locale` hợp lệ đã tồn tại, ngược lại `{ updatedAt: null, dirty: 0 }`; nhóm `reminder` = mốc 1970 + `dirty: 1` nếu `settings.reminderEnabled === true` hoặc `reminderTime !== '20:00'`, ngược lại `{ updatedAt: null, dirty: 0 }`. Dexie chạy `upgrade` trong transaction `versionchange`: lỗi giữa chừng → IndexedDB rollback về v1 nguyên vẹn, `openDatabase` ném `StorageError` (NFR-14). Dexie lưu version IndexedDB = version × 10 (v1 = 10, v2 = 20); test dựng DB v1 bằng API thô phải dùng version 10.

**Quy tắc chung cho mọi repository Dexie từ v2 (ADR-20):**

- **Đọc:** mọi `get*`/`watch*`/`sumMinutes`/`exportAll` bỏ qua hàng có `deletedAt != null`; entry chỉ trả ra nếu goal của nó còn sống (lọc theo tập id goal sống, đọc trong cùng truy vấn/transaction). Trả về **kiểu domain** (bỏ `deletedAt`, `dirty`).
- **Ghi** (`put`, `saveTimerEntry`, `replaceAll`): ghi hàng với `deletedAt = null`, `dirty = 1`.
- **Xoá** (`EntryRepository.delete`, `GoalRepository.deleteWithEntries`): xoá mềm: `deletedAt = updatedAt = nextUpdatedAt(clock(), hàng.updatedAt)`, `dirty = 1`; goal xoá kèm mọi entry còn sống của nó, cùng một transaction như phase 1. Repository nhận `clock: () => Date` qua constructor (mặc định `() => new Date()`).
- `replaceAll` (import): xoá mềm mọi goal/entry còn sống không có trong file, `bulkPut` bản ghi trong file (`dirty = 1`, `deletedAt = null`), giữ kv `locale`, `sync`, `loginPrompt`; v2.1: đặt `prefsSync.reminder = { updatedAt: clock(), dirty: 1 }` (A-37), không đụng `prefsSync.locale`; vẫn một transaction (M3-AC7/AC9 giữ nguyên vì repository trả kiểu domain).
- `clearUserData` (đăng xuất "xoá dữ liệu", v2.1): xoá thêm kv `prefsSync` (giữ kv `locale` để giao diện không đổi ngôn ngữ, nhưng máy trở về "chưa từng chọn" với tài khoản, A-37).
- **Hàng bị cloud từ chối (v3.1 ghi nhận, ADR-28):** `dirty = 2` — vẫn sống trong app và trong Export, không đếm vào "đang chờ", không đẩy lại tới khi được sửa (sửa → `dirty = 1`); `markAllDirty` thử lại một lần.
- **Dọn tombstone cục bộ (v3.1, M10, ADR-29):** `LocalSyncStore.purgeTombstones(now)` xoá **cứng** hàng `goals`/`entries` có `deletedAt != null` và `deletedAt ≤ now − 30 ngày` (`TOMBSTONE_RETENTION_DAYS = 30` trong `config/constants.ts`) **và** (`dirty ∈ {0, 2}` **hoặc** thiết bị chưa từng đồng bộ: kv `sync` không có hoặc `userId == null && lastUserId == null`). Hàng còn sống, hàng `dirty = 1` của thiết bị đã từng đồng bộ, và tombstone chưa đủ 30 ngày không bị đụng. Một transaction; lỗi → rollback. Không đổi cloud. Chạy một lần mỗi lần khởi động (`app/maintenance.ts`).
- **`nextUpdatedAt(now, previous)`** (`domain/sync.ts`): `now ≥ previous` → `now`; ngược lại `previous + 1 ms`. `GoalService.update`/`setArchived`, `EntryService.update` dùng hàm này thay cho `now.toISOString()` (với đồng hồ cố định trong test hiện có, kết quả không đổi).

### 4.3 Schema cloud (Supabase Postgres, M6) — `supabase/migrations/20261012000000_cloud_sync.sql`

```sql
-- Goals and entries per user. Mirrors the local model + sync columns.
create table public.goals (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                text not null check (char_length(id) between 1 and 64),  -- id cục bộ (UUID hoặc id của file backup cũ)
  name              text not null check (char_length(name) between 1 and 60),
  why               text not null default '' check (char_length(why) <= 280),
  target_type       text not null check (target_type in ('daily', 'total')),
  target_minutes    integer not null check (target_minutes between 1 and 600000),
  start_date        date not null,
  end_date          date not null check (end_date >= start_date),
  archived          boolean not null default false,
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table public.entries (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                text not null check (char_length(id) between 1 and 64),
  goal_id           text not null check (char_length(goal_id) between 1 and 64),  -- không FK (ADR-20)
  date              date not null,
  minutes           integer not null check (minutes between 1 and 1440),
  note              text not null default '' check (char_length(note) <= 280),
  source            text not null check (source in ('manual', 'timer')),
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index goals_pull_idx   on public.goals   (user_id, server_updated_at, id);
create index entries_pull_idx on public.entries (user_id, server_updated_at, id);

-- Last-write-wins + server cursor (ADR-21). Runs for plain INSERT, UPDATE and upsert (ON CONFLICT DO UPDATE).
create or replace function public.sync_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at <= old.updated_at then
      return null;                         -- incoming is older or equal: keep the server row (tie -> server)
    end if;
    new.user_id    := old.user_id;         -- owner and creation time never change
    new.created_at := old.created_at;
  else
    new.user_id := auth.uid();             -- never trust client-sent owner on insert
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

create trigger goals_sync_before_write   before insert or update on public.goals
  for each row execute function public.sync_before_write();
create trigger entries_sync_before_write before insert or update on public.entries
  for each row execute function public.sync_before_write();

alter table public.goals   enable row level security;
alter table public.entries enable row level security;

create policy goals_select_own on public.goals for select to authenticated
  using ((select auth.uid()) = user_id);
create policy goals_insert_own on public.goals for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy goals_update_own on public.goals for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy entries_select_own on public.entries for select to authenticated
  using ((select auth.uid()) = user_id);
create policy entries_insert_own on public.entries for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy entries_update_own on public.entries for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- No DELETE policy: clients only soft-delete (deleted_at). Hard delete = Dashboard (OQ-09).

-- Explicit Data API grants (Supabase no longer auto-exposes new public tables; applied to all projects from 2026-10-30).
revoke all on public.goals, public.entries from anon, authenticated;
grant select, insert, update on public.goals, public.entries to authenticated;

-- v2.1: synced user preferences (FR-55). One row per user, two independent LWW groups.
create table public.settings (
  user_id             uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  reminder_enabled    boolean,
  reminder_time       text check (reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  reminder_updated_at timestamptz,
  locale              text check (locale in ('en', 'vi')),
  locale_updated_at   timestamptz,
  server_updated_at   timestamptz not null default clock_timestamp(),
  -- a group is either fully set or fully empty
  check ((reminder_enabled is null) = (reminder_time is null)
     and (reminder_enabled is null) = (reminder_updated_at is null)),
  check ((locale is null) = (locale_updated_at is null))
);

create or replace function public.settings_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  changed boolean := false;
begin
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.server_updated_at := clock_timestamp();
    return new;
  end if;
  new.user_id := old.user_id;
  -- reminder group: take incoming only if strictly newer (tie -> server)
  if new.reminder_updated_at is not null
     and (old.reminder_updated_at is null or new.reminder_updated_at > old.reminder_updated_at) then
    changed := true;
  else
    new.reminder_enabled := old.reminder_enabled;
    new.reminder_time := old.reminder_time;
    new.reminder_updated_at := old.reminder_updated_at;
  end if;
  -- locale group
  if new.locale_updated_at is not null
     and (old.locale_updated_at is null or new.locale_updated_at > old.locale_updated_at) then
    changed := true;
  else
    new.locale := old.locale;
    new.locale_updated_at := old.locale_updated_at;
  end if;
  if not changed then
    return null;                                   -- nothing newer: keep the row untouched
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

create trigger settings_before_write before insert or update on public.settings
  for each row execute function public.settings_before_write();

alter table public.settings enable row level security;
create policy settings_select_own on public.settings for select to authenticated
  using ((select auth.uid()) = user_id);
create policy settings_insert_own on public.settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy settings_update_own on public.settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.settings from anon, authenticated;
grant select, insert, update on public.settings to authenticated;
```

Bảng `settings` (v2.1) nằm trong **cùng** file migration (user chỉ chạy SQL một lần ở U6). Client đẩy bằng upsert `onConflict: 'user_id'`, gửi `null` cho nhóm không `dirty` (trigger giữ giá trị cũ của nhóm đó). Không có `lastReminderDate`, `plusOneShown`, `lastBackupAt`, timer trong bảng.

Ghi chú: developer được chỉnh cú pháp cho chạy đúng trên Supabase local/hosted nhưng **không** được nới quyền (thêm grant cho `anon`, thêm DELETE, tắt RLS) hay đổi quy tắc LWW mà không cập nhật plan. Client gửi `user_id` = id phiên trong upsert (để `onConflict: 'user_id,id'` khớp khoá); trigger và RLS bảo đảm không ghi được hàng của người khác.

### 4.4 Cái gì được đồng bộ (FR-44, FR-55, ADR-22, ADR-25)

| Dữ liệu | Nơi lưu cục bộ | Bảng cloud | Đồng bộ | Lý do |
| :- | :- | :- | :- | :- |
| Goal (mọi field, gồm `archived`), Entry (gồm `source`) | `goals`, `entries` | `goals`, `entries` | **Có** (LWW theo bản ghi) | Là "target và process" user muốn giữ |
| Bản ghi đã xoá (`deletedAt`) | như trên | như trên | **Có** (tombstone) | Xoá lan truyền (FR-48) |
| `locale` (v2.1) | kv `locale` + mốc ở kv `prefsSync.locale` | `settings.locale`, `locale_updated_at` | **Có** (nhóm "locale", LWW riêng) | Quyết định user 2026-10-12 (OQ-07) |
| `settings.reminderEnabled` + `reminderTime` (v2.1) | kv `settings` + mốc ở kv `prefsSync.reminder` | `settings.reminder_enabled`, `reminder_time`, `reminder_updated_at` | **Có** (nhóm "reminder", LWW riêng) | Quyết định user 2026-10-12 (OQ-07) |
| `settings.lastReminderDate`, `plusOneShown` | kv `settings` | — | Không | Trạng thái hiển thị của từng thiết bị (claim nguyên tử cục bộ, ADR-15) |
| `settings.lastBackupAt` | kv `settings` | — | Không | Backup là file trên thiết bị đó |
| `activeTimer` | kv | — | Không | Timer chạy trên một thiết bị; entry sau Save mới đồng bộ |
| Quyền notification, trạng thái persist storage | trình duyệt | — | Không | Theo thiết bị |
| `sync`, `loginPrompt`, `prefsSync` | kv | — | Không | Metadata cục bộ |

**Quy tắc nhóm tuỳ chọn (FR-55)** — `resolvePrefGroup(local: PrefGroupMeta, remote: { updatedAt } | null)` trong `domain/sync.ts`:

| Thiết bị (`local.updatedAt`) | Cloud (nhóm) | Kết quả |
| :- | :- | :- |
| `null` (chưa từng chọn) | có giá trị | **áp cloud** (cloud thắng), `local.updatedAt = remote.updatedAt`, `dirty = 0` |
| có giá trị, `dirty = 1` | không có (`null`) | giữ local, đẩy lên |
| `null` | không có | không làm gì (thiết bị giữ mặc định: nhắc tắt/20:00, ngôn ngữ theo trình duyệt) |
| có giá trị | có giá trị, `remote ≥ local` | áp cloud, `dirty = 0` (bằng nhau → cloud thắng) |
| có giá trị | có giá trị, `remote < local` | giữ local (còn `dirty = 1` thì đẩy) |

Áp nhóm `locale` từ cloud: ghi kv `locale` → `LocaleService.watch` phát → container gọi `setLocale(i18n, locale)` ngay (đổi `<html lang>`, `document.title`, toàn app, không reload). Áp nhóm `reminder`: ghi `settings.reminderEnabled/reminderTime` (giữ nguyên các field khác của `settings`) → Settings và scheduler đọc giá trị mới; **không** gọi `Notification.requestPermission()`.
| Phiên Supabase | `localStorage['opb-auth']` (+ `opb-auth-code-verifier` trong lúc đăng nhập) | — | Do SDK quản lý (A-26) |

### 4.5 Đường cong 1% v3 (phase 3, M9; FR-27 v3.0, ADR-26)

Thay toàn bộ quy tắc "thực tế = 1.01^n (n = số ngày đạt chỉ tiêu)" của M5. Vẫn là hàm thuần `curve(goal, goalEntries, today): CurveData` trong `src/domain/curve.ts` (chữ ký giữ nguyên); `StatsService.curve(goalId, today)` giữ nguyên chữ ký. Không lưu gì, không đổi schema, backup, sync.

**Ký hiệu.**

- `last = lastElapsedDay(goal, today)` = `min(today, endDate)`; `today < startDate` → `null` (goal upcoming, không có điểm thực tế).
- `D` = các ngày `startDate … last` (tính cả hai đầu); `elapsedDays = |D|`.
- `m(d)` = tổng `minutes` của **mọi** entry còn sống của goal có `date = d`, với d ∈ D. Entry có ngày ngoài D bị bỏ qua (A-41).
- Ngày **có ghi**: `m(d) > 0`. `f` = ngày có ghi đầu tiên trong D (**baseline**). `p(d)` = ngày có ghi gần nhất ≤ d. `prev(d)` = ngày có ghi gần nhất < d.

**Công thức.**

| Đại lượng | Định nghĩa |
| :- | :- |
| `ideal(d)` (không đổi) | `1.01^k`, k = thứ tự ngày trong khoảng (startDate = 1), cho **mọi** ngày của khoảng |
| `actual(d)`, d ∈ D | `1` nếu chưa có `f` hoặc `d < f`; ngược lại `m(p(d)) / m(f)` |
| `changePercent(d)` | d có ghi và d > f: `pct(m(d), m(prev(d)))`; ngày baseline và ngày không ghi: `null` |
| `headlinePercent` | có `f`: `pct(m(p(last)), m(f))`; không có: `0` |
| `actualFactor` | `actual(last)` (1 khi chưa có ghi hoặc upcoming) |
| `idealPercent`, `idealFactor` (không đổi) | `growthPercent(1.01^elapsedDays)`, `1.01^elapsedDays` |

Cách đọc theo lời user: ngày đầu có ghi = +0%; mỗi ngày có ghi sau đó nhân giá trị với `m(hôm nay) / m(ngày có ghi trước)`; ngày 0 phút đi ngang (giữ giá trị, không trừ). Vì tích các tỉ lệ rút gọn (telescoping), giá trị = `m(ngày có ghi gần nhất) / m(ngày đầu có ghi)`. **Code phải tính bằng tỉ số trực tiếp** như bảng trên, không nhân dồn số thực (tránh sai số tích luỹ qua 1827 ngày).

**Làm tròn `pct(a, b)`** (a, b là số phút nguyên dương, kết quả là % có dấu, 1 chữ số thập phân): `y = (a − b) × 1000 / b`; `r = sign(y) × Math.round(|y|)` (nửa làm tròn **xa 0**, đối xứng âm/dương); kết quả `r / 10`; `−0` chuẩn hoá thành `0`. `ActualPoint.percent = pct(m(p(d)), m(f))` (hoặc `0` trước baseline). Ví dụ: `pct(17,16) = 6.3`, `pct(15,16) = −6.3`, `pct(27,14) = 92.9`, `pct(1440,1) = 143900`, `pct(1,1440) = −99.9`.

**Phạm vi giá trị.** Với dữ liệu hợp lệ (1–1440 phút/ngày, FR-07) `actual ∈ [1/1440, 1440]`, headline ∈ [−99.9, +143900.0]: không cần giới hạn nhân tạo, không tràn số. Dữ liệu gộp từ sync có thể vượt 1440/ngày (A-25): công thức giữ nguyên, không cắt. Đường lý tưởng vẫn có thể rất lớn (1.01^1827 ≈ 7,9·10^7), như M5.

**Contract (thay `ActualPoint`, `CurveData` của M5; `IdealPoint`, `growth`, `growthPercent`, `lastElapsedDay`, `DAILY_GROWTH` giữ nguyên):**

```ts
export interface ActualPoint {
  date: ISODate;
  k: number;                       // thứ tự ngày, 1-based
  minutes: number;                 // m(d); 0 nếu không ghi
  logged: boolean;                 // m(d) > 0
  value: number;                   // actual(d): hệ số so với baseline (1 trước/tại baseline)
  percent: number;                 // % có dấu, 1 chữ số thập phân (pct)
  changePercent: number | null;    // % so với ngày có ghi trước; null nếu không ghi hoặc là baseline
}
export interface LoggedDayRef { date: ISODate; minutes: number }
export interface CurveData {
  ideal: IdealPoint[];             // không đổi: mọi ngày của khoảng
  actual: ActualPoint[];           // startDate → last; [] khi upcoming
  periodDays: number;
  elapsedDays: number;
  loggedDays: number;              // số ngày có ghi trong D (thay daysOnTarget)
  baseline: LoggedDayRef | null;   // f
  latest: LoggedDayRef | null;     // p(last)
  previous: LoggedDayRef | null;   // prev(latest)
  latestChangePercent: number | null; // pct(latest, previous); null nếu previous = null
  actualFactor: number;
  idealFactor: number;
  headlinePercent: number;         // có dấu
  idealPercent: number;
}
/** Miền trục Y (đơn vị %) cho các điểm đang hiển thị sau khi lọc Range. */
export function curveYDomain(idealPercents: readonly number[], youPercents: readonly number[]): [number, number];
```

Bỏ khỏi contract: `ActualPoint.n`, `ActualPoint.met`, `CurveData.daysOnTarget` (số ngày đạt chỉ tiêu vẫn có ở `goalStats().daysOnTarget`, Stat card không đổi).

**Ví dụ (oracle cho test).** Ký hiệu % đã làm tròn bằng `pct`/`growthPercent`.

*Dataset R1 — dữ liệu thật của user* (goal daily 30 phút, 2026-10-10 → 2026-12-31, `periodDays` = 83; today = 2026-10-13):

| Ngày | k | m(d) | actual | percent | changePercent | ideal % |
| :- | :- | :- | :- | :- | :- | :- |
| 2026-10-10 | 1 | 5 | 1 | +0.0 | null | +1.0 |
| 2026-10-11 | 2 | 10 | 2 | +100.0 | +100.0 | +2.0 |
| 2026-10-12 | 3 | 14 | 2.8 | +180.0 | +40.0 | +3.0 |
| 2026-10-13 | 4 | 27 | 5.4 | +440.0 | +92.9 | +4.1 |

→ `headlinePercent = 440`, `actualFactor = 5.4` (×5,4), `baseline = {10-10, 5}`, `latest = {10-13, 27}`, `previous = {10-12, 14}`, `latestChangePercent = 92.9`, `loggedDays = 4`, `elapsedDays = 4`, `idealPercent = 4.1`.

- R1 với today = 2026-10-14 (chưa ghi): thêm điểm 10-14 `minutes 0, value 5.4, percent 440, changePercent null`; headline vẫn 440; `elapsedDays = 5`, `idealPercent = 5.1`.
- R1 khi 10-13 ghi thành hai entry 20 + 7 phút: kết quả giống hệt.
- R1 bỏ entry 10-12: 10-12 `value 2` (đi ngang, +100.0), 10-13 `value 5.4`, `changePercent = +170.0` (so với 10-11 = 10 phút), headline 440.
- Đi xuống: 10-10 5 phút, 10-11 3 phút → 10-11 `value 0.6`, `percent −40.0`, `changePercent −40.0`, headline −40.
- Ngày cực trị: 1 phút rồi 1440 phút → headline 143900; 1440 rồi 1 → headline −99.9.

*S1 tại 2026-10-09 (§0 TASKS):* G1 "Read" (30 phút mỗi ngày 10-01 … 10-08): 9 điểm, mọi `value = 1`, headline **0.0** (M5 là 8.3), `loggedDays = 8`, `idealPercent = 9.4`, `latest = {10-08, 30}`, `previous = {10-07, 30}`, `latestChangePercent = 0`. G2 "Guitar" (20 phút 09-01 … 09-10, 10 phút 09-15, 20 phút 10-07, 10-08): 39 điểm; 09-15 `value 0.5`, `percent −50.0`, `changePercent −50.0`; 09-16 … 10-06 đi ngang −50.0; 10-07 `value 1`, `changePercent +100.0`; headline **0.0**; `loggedDays = 13`; `idealPercent = 47.4`. G3 "Spanish" (một entry 03-02) và G5 "Old course" (một entry 06-30): headline **0.0** (M5 là 1.0). G4 upcoming: `actual = []`, headline 0.

**Hiển thị (copy do designer chốt ở DESIGN.md revise v3; plan chỉ nêu dữ liệu bắt buộc).**

- Headline: `headlinePercent` có dấu (`+` khi ≥ 0, `−` khi < 0; A-43), `decimal1` theo locale, có nhóm hàng nghìn (en `+143,900.0%`, vi `+143.900,0%`).
- Hệ số ×N (`actualFactor`): formatter mới `f.factor(v)` trong `src/i18n/format.ts`: v ≥ 1 → tối đa 2 chữ số thập phân, bỏ số 0 thừa (en `5.4`, `2.8`, `1,440`; vi `5,4`); v < 1 → 2 chữ số có nghĩa (`0.6`, `0.00069`).
- Phụ đề (thay `goal.detail.headlineSub` "Ngày k/N · n ngày đạt chỉ tiêu · 1,01^n = …"): phải nêu (a) ngày có ghi gần nhất và số phút; (b) % so với ngày có ghi trước đó (có dấu) và số phút ngày đó; (c) ×N kể từ ngày đầu có ghi và số phút ngày đầu. Biến thể: chưa có entry; chỉ một ngày có ghi (chỉ nêu điểm xuất phát); upcoming (giữ `goal.detail.upcoming`).
- Tóm tắt SR, legend "You", chú thích dưới chart, `empty.detail.curve`, tooltip (ngày có ghi: số phút + `changePercent`), nhãn trực tiếp tại hôm nay, bảng dữ liệu (thêm cột số phút): mọi % của "You" có dấu.
- Đường You: một điểm mỗi ngày, đi ngang qua ngày 0 phút, đổi giá trị tại ngày có ghi (có thể đi xuống); kiểu nét (linear/step) do designer chốt.

**Thang Y (giữ control Range của A-D4).** Tuyến tính, đơn vị % như M5. Miền tự co giãn theo **cả hai series đang hiển thị** (sau khi lọc Range): `curveYDomain` trả `[yMin, yMax]` với `yMin = min(0, min You%)`, `yMax = max(1, max Ideal%, max You%)`, mỗi đầu nới thêm 5% của `yMax − yMin` rồi làm tròn ra ngoài tới bội số "đẹp" (1, 2, 5 × 10^n); chart dùng làm `domain` (thay `[0, 'auto']` của M5) và có đường tham chiếu tại 0% (mức ngày đầu). Nhãn trục: % số nguyên có dấu; |v| ≥ 10.000 dùng `Intl.NumberFormat` `notation: 'compact'` để không tràn trục ở 360 px. Hệ quả chấp nhận: khi You vượt xa Ideal (R1: +440% so với +4,1%) đường Ideal nằm sát 0% (đúng thực tế); goal dài vẫn mặc định "So far" để Ideal không nuốt thang. Thang log: Later.

## 5. Interface contract

App không có HTTP API. Contract gồm: route, repository interface, service, mã lỗi, định dạng file backup, notification.

### 5.1 Route (hash)

| Route | Màn hình | Milestone |
| :- | :- | :- |
| `#/` | redirect `#/today` | M1 |
| `#/today` | Today | M1 |
| `#/goals` | Danh sách goal | M1 |
| `#/goals/new` | Form tạo goal | M1 |
| `#/goals/:id/edit` | Form sửa goal | M1 |
| `#/goals/:id` | Goal detail (M3: lịch sử; M5: đầy đủ + đường cong) | M3/M5 |
| `#/day/:date` | Day: ghi bù/sửa cho `YYYY-MM-DD` | M3 |
| `#/review?goal=<id\|all>&year=<YYYY>` | Review (mặc định `goal=all`, `year` = năm hiện tại) | M4 |
| `#/settings` | Settings (M1 placeholder; M2 nhắc nhở; M3 backup) | M1–M3 |
| khác | màn hình "Not found" có link về Today | M1 |
| `<BASE_URL>?auth=callback&code=…` (query, **trước** dấu `#`) | Không phải route: callback OAuth, `bootstrap` xử lý rồi xoá query, điều hướng tới `returnTo` (mặc định `#/settings`) — §5.9 | M6 |

Phase 2 không thêm route mới: card Account nằm trong `#/settings`.

### 5.2 Repository interface (`src/data/repositories.ts`)

```ts
interface Subscribable<T> { subscribe(onNext: (value: T) => void, onError?: (e: unknown) => void): () => void }

interface GoalRepository {
  getAll(): Promise<Goal[]>;
  getById(id: string): Promise<Goal | undefined>;
  put(goal: Goal): Promise<void>;
  deleteWithEntries(id: string): Promise<void>;      // một transaction trên goals + entries
  watchAll(): Subscribable<Goal[]>;
}
interface EntryRepository {
  getById(id: string): Promise<LogEntry | undefined>;   // M3 (M3-T7): đọc theo khoá chính, không quét
  getByGoal(goalId: string): Promise<LogEntry[]>;
  getByDateRange(from: ISODate, to: ISODate): Promise<LogEntry[]>;
  sumMinutes(goalId: string, date: ISODate, excludeEntryId?: string): Promise<number>;
  put(entry: LogEntry): Promise<void>;
  delete(id: string): Promise<void>;
  watchByDateRange(from: ISODate, to: ISODate): Subscribable<LogEntry[]>;
  watchByGoal(goalId: string): Subscribable<LogEntry[]>;
}
type KvKey = 'settings' | 'activeTimer' | 'locale';
interface KvRepository {
  get<T>(key: KvKey): Promise<T | undefined>;
  set<T>(key: KvKey, value: T): Promise<void>;
  // M2 (ADR-14): read-modify-write trong MỘT transaction rw (IndexedDB tuần tự hoá giữa các tab).
  // `fn` nhận giá trị hiện tại, trả giá trị mới, hoặc `undefined` để không ghi.
  // `fn` phải đồng bộ và thuần (không await, không side effect) vì có thể chạy trong transaction.
  update<T>(key: KvKey, fn: (current: T | undefined) => T | undefined):
    Promise<{ previous: T | undefined; written: boolean }>;
  delete(key: KvKey): Promise<void>;
  watch<T>(key: KvKey): Subscribable<T | undefined>;
}
// M3 (M3-T7, ADR-16): ghi entry từ timer và xoá activeTimer trong MỘT transaction rw trên goals + entries + kv.
// Trong transaction: (1) kv 'activeTimer' phải khớp `expected` (cùng goalId và startedAt), ngược lại 'timer-changed';
// (2) goal `entry.goalId` phải còn tồn tại, ngược lại 'goal-missing';
// (3) sumMinutes(entry.goalId, entry.date) + entry.minutes ≤ maxDayMinutes, ngược lại 'day-limit';
// (4) put(entry) + delete kv 'activeTimer'. Mọi nhánh khác 'saved' không ghi gì.
type SaveTimerEntryOutcome =
  | { status: 'saved' }
  | { status: 'timer-changed' }
  | { status: 'goal-missing' }
  | { status: 'day-limit'; existingMinutes: number };
interface TimerRepository {
  saveTimerEntry(expected: ActiveTimer, entry: LogEntry, maxDayMinutes: number): Promise<SaveTimerEntryOutcome>;
}
interface BackupData { goals: Goal[]; entries: LogEntry[]; settings: Settings }
interface BackupRepository {                              // M3
  exportAll(): Promise<BackupData>;
  replaceAll(data: BackupData): Promise<void>;            // một transaction, lỗi thì rollback; giữ nguyên kv 'locale'
}
```

**Bổ sung v2.0 (M6/M7).** Chữ ký các interface trên **không đổi**; hành vi đổi theo §4.2 (xoá mềm, lọc tombstone, `dirty`). `KvKey` thêm `'sync' | 'loginPrompt'`. Interface mới:

```ts
// M6
interface LocalDataRepository {
  /** Một transaction rw trên goals + entries + kv: xoá cứng mọi goal/entry (kể cả tombstone),
   *  kv 'settings', 'activeTimer', 'sync', 'prefsSync' (v2.1). Giữ kv 'locale', 'loginPrompt'. Lỗi → rollback. */
  clearUserData(): Promise<void>;
  /** Số goal/entry còn sống (cho hộp thoại gộp/đăng xuất). */
  countLive(): Promise<{ goals: number; entries: number }>;
}

// M7
interface RemoteChanges { goals: SyncRecord<Goal>[]; entries: SyncRecord<LogEntry>[] }
interface ApplyResult { applied: number; keptLocal: number; skippedInvalid: number }
interface LocalSyncStore {
  /** Tối đa `limit` hàng dirty mỗi bảng, goals trước. Gồm tombstone. */
  getDirty(limit: number): Promise<RemoteChanges>;
  /** MỘT transaction rw trên goals + entries: với mỗi hàng remote, `resolveIncoming(local, remote)`;
   *  'apply' → ghi hàng remote với dirty = 0; 'keep-local' → không đổi (dirty giữ nguyên).
   *  Hàng có cùng updatedAt và cùng deletedAt với hàng local → chỉ đặt dirty = 0.
   *  Áp tombstone goal → xoá mềm các entry còn sống của goal đó (dirty = 1). */
  applyRemote(changes: RemoteChanges): Promise<ApplyResult>;
  /** Đặt dirty = 1 cho mọi hàng còn sống (gộp vào tài khoản khác, FR-47). */
  markAllDirty(): Promise<number>;
  /** Xoá mềm entry còn sống mà goal đã bị xoá mềm (dọn cuối chu kỳ). */
  tombstoneOrphanEntries(now: Date): Promise<number>;
  /** v3.1 (M10, ADR-29): xoá cứng tombstone đủ điều kiện §4.2 trong MỘT transaction rw trên goals + entries + kv
   *  (đọc kv 'sync' trong cùng transaction). Trả số hàng đã xoá theo bảng. */
  purgeTombstones(now: Date): Promise<{ goals: number; entries: number }>;
  countDirty(): Promise<number>;
  watchPendingCount(): Subscribable<number>;   // v2.1: cộng thêm số nhóm tuỳ chọn đang dirty
}

// M7 (v2.1) — tuỳ chọn người dùng đồng bộ (FR-55)
interface SyncedPrefsRepository {
  /** MỘT transaction rw trên kv: cập nhật settings.reminderEnabled/reminderTime (giữ field khác)
   *  + prefsSync.reminder = { updatedAt: nextUpdatedAt(now, cũ), dirty: 1 }. Trả Settings mới. */
  setReminder(patch: { reminderEnabled?: boolean; reminderTime?: string }, now: Date): Promise<Settings>;
  /** MỘT transaction rw: kv 'locale' = locale + prefsSync.locale = { updatedAt: nextUpdatedAt(now, cũ), dirty: 1 }. */
  setLocale(locale: Locale, now: Date): Promise<void>;
  /** Nhóm đang dirty (null nếu không có nhóm nào). */
  getDirty(): Promise<RemotePrefs | null>;
  /** MỘT transaction rw: resolvePrefGroup cho từng nhóm; trả nhóm nào đã đổi giá trị cục bộ. */
  applyRemote(remote: RemotePrefs | null): Promise<{ reminderChanged: boolean; localeChanged: Locale | null }>;
  /** Đổi sang tài khoản khác (FR-47): nhóm có updatedAt ≠ null → dirty = 1. */
  markAllDirty(): Promise<void>;
  watchState(): Subscribable<PrefsSyncState>;
}
```

Hợp đồng `applyRemote`: nguyên tử theo lô và tuần tự hoá giữa các tab (transaction IndexedDB), giống ràng buộc bên dưới. Không await promise ngoài Dexie bên trong transaction (ADR-16).

**Ràng buộc cho mọi implementation repository (kể cả không phải Dexie, ví dụ adapter sync sau này):** `deleteWithEntries`, `KvRepository.update`, `TimerRepository.saveTimerEntry`, `BackupRepository.replaceAll` phải **nguyên tử và tuần tự hoá giữa các tab/tiến trình** (transaction, compare-and-set, hoặc khoá ngoài JS context). Một implementation chỉ dùng khoá trong bộ nhớ (như `Mutex`) là **không** đạt hợp đồng này. Test hợp đồng (chạy trên Dexie + fake-indexeddb) dùng hai instance repository trên cùng một DB để mô phỏng hai tab.

### 5.3 Service (chữ ký chính, `src/services/`)

Mọi hàm nghiệp vụ trả `Result<T> = { ok: true; value: T } | { ok: false; errors: DomainError[] }` với `DomainError = { code: ErrorCode; field?: string; message: string; params?: Record<string, string | number> }`. `params` (thêm ở M1) mang biến thể (`variant`: `daily` \| `total` \| `tooMuch` \| `endBeforeStart` \| `tooLong`) và tham số thô (`remaining`, `start`, `end`) để `src/ui/error-messages.ts` chọn key `errors.*` và định dạng theo locale; mã lỗi không đổi. Lỗi hạ tầng (IndexedDB) ném `StorageError` và được UI bắt hiển thị.

| Service | Constructor | Hàm | Milestone |
| :- | :- | :- | :- |
| `GoalService` | `(goals: GoalRepository, entries: EntryRepository, newId?: IdGenerator, kv?: KvRepository)` — `kv` tuỳ chọn (M2) để `remove` huỷ timer của goal bị xoá | `create(input, now)`, `update(id, input, now)`, `remove(id)`, `setArchived(id, archived, now)` | M1 (archive M5) |
| `EntryService` | `(entries: EntryRepository, goals: GoalRepository, newId?: IdGenerator)` | `add({goalId, date, minutes, note, source}, now)`, `update(id, {minutes, note}, now)`, `remove(id)`, `watchByDateRange(from, to)`. **M3 (M3-T7):** `update`/`remove` tìm entry bằng `EntryRepository.getById` (bỏ quét `getByDateRange('0000-01-01','9999-12-31')` hiện có); phần validate của `add` (goal tồn tại, field, ngày, tạo `LogEntry` với id/timestamp) tách thành hàm không ghi, ví dụ `prepareAdd(input, now) → Result<LogEntry>`, dùng chung cho `add` và `TimerService.save` | M1 (UI chọn ngày ≠ today từ M3; domain validate mọi ngày ngay từ M1 vì timer qua nửa đêm ở M2 ghi vào ngày hôm trước) |
| `TimerService` | Hiện tại `(kv: KvRepository, goals: GoalRepository, entries: EntryService)`; **M3** thêm `timers: TimerRepository` | `current() → ActiveTimer \| undefined` (bỏ qua giá trị hỏng), `start(goalId, now)`, `stop(now) → TimerPreview {goalId, date, minutes}` (chỉ xem trước, timer vẫn chạy), `save({minutes, note}, now) → Result<LogEntry>`, `discard()`, `watch()`. `start`/`save`/`discard` chạy qua một `Mutex` (tuần tự trong tab). `start` thay thế im lặng timer mồ côi (goal không còn). **M3 (ADR-16):** `save` = `prepareAdd` (validate) rồi `TimerRepository.saveTimerEntry(timerĐãĐọc, entry, DAY_MINUTES_LIMIT)` (1440); ánh xạ `timer-changed` → `TIMER_NOT_RUNNING`, `goal-missing` → `GOAL_NOT_FOUND`, `day-limit` → `ENTRY_DAY_LIMIT_EXCEEDED` (qua `checkDayLimit(existingMinutes, minutes)` để có `params.remaining`). `GoalService.remove` xoá luôn `activeTimer` nếu timer thuộc goal bị xoá | M2 (nguyên tử giữa tab: M3) |
| `SettingsService` | `(kv: KvRepository)` | `get() → Settings` (chuẩn hoá qua `normalizeSettings`), `update(patch)`, `setReminderEnabled(b)`, `setReminderTime('HH:MM')` (ném `RangeError` nếu sai định dạng; UI chỉ gửi giá trị hợp lệ), `claimReminderDay(date) → boolean` (qua `kv.update`: ghi `lastReminderDate = date` nếu chưa bằng `date`; `true` = caller thắng), `releaseReminderDay(date, previous)` (qua `kv.update`: trả `lastReminderDate` về `previous` chỉ khi nó vẫn là `date`), `watch()` | M2 |
| `LocaleService` | `(kv: KvRepository)` | `resolve(navigatorLanguage) → Locale`, `set(locale)`, `watch()` | M1 |
| `ReminderService` | `(settings: SettingsService, goals: GoalRepository, entries: EntryRepository, notifications: NotificationPort, translator: Translator, iconUrl?: string)` | `progress(now) → GoalProgress[]`; `check(now) → boolean` (qua `Mutex` riêng): nếu `shouldNotify` thì **claim ngày trước** (`claimReminderDay(today)`; thua claim → `false`), rồi `notifications.show(...)` với title/body dịch bằng `Translator` theo locale hiện tại; `show` trả `false` hoặc ném lỗi → `releaseReminderDay(today, lastReminderDateCũ)` để lần kiểm sau thử lại (ADR-15); `getBannerState(now)` trả dữ liệu, UI tự dịch; `body(data)` | M2 |
| `BackupService` | developer chọn (nhận `BackupRepository`, `SettingsService` hoặc `KvRepository`) | `export(now) → {fileName, json}`, `parse(text, sizeBytes) → Result<BackupPreview>`, `import(parsed, now)` | M3 |
| `StatsService` | developer chọn (repository qua constructor) | `goalStats(goalId, year, today)`, `overallStats(year, today)`, `curve(goalId, today)` | M4/M5 |
| `AuthService` (v2.0) | `(deps: { loadAuth: () => Promise<AuthPort>; storedSession: () => boolean; local: LocalDataRepository; kv: KvRepository; connectivity: { isOnline(): boolean }; returnTo: ReturnToStore })` | `state()`, `watch() → Subscribable<AuthState>`; `init()` (có phiên lưu sẵn → nạp port, `getSession`; không có → `signed-out`, **không** nạp port); `signIn(returnTo: string) → Result<void>` (offline → `AUTH_OFFLINE`; lưu `returnTo`; `port.signInWithGoogle(redirectUrl)` điều hướng đi); `completeCallback(cb) → Result<AuthSession>` (`error` → `AUTH_CANCELLED` nếu `access_denied`, ngược lại `AUTH_FAILED`; `code` → `port.exchangeCode(code)`); `signOut({ keepData }) → Result<void>` (M7: gọi `SyncService.finalSyncBeforeSignOut` trước); phản ứng `AuthEvent` `session-expired` → `expired`. Ghi `sync.account`, `sync.userId` khi đăng nhập | M6 |
| `SyncService` (v2.0; v2.1 thêm `prefs: SyncedPrefsRepository`) | `(deps: { local: LocalSyncStore; prefs: SyncedPrefsRepository; loadRemote: () => Promise<RemoteStore>; kv: KvRepository; auth: { currentUserId(): string \| null }; locks: LockPort; clock: () => Date; batchSize?: number /* 500 */ })` | `syncNow(reason) → Promise<SyncOutcome>` (single-flight trong tab + `LockPort` giữa tab); `watchStatus() → Subscribable<SyncStatus>`; `prepareFirstSignIn(userId) → 'merge-silently' \| 'confirm-merge' \| 'same-user'`; `confirmMerge()` (`markAllDirty` + reset cursor); `finalSyncBeforeSignOut() → { pending: number }`; `reset()` (xoá cursor/userId khi đăng xuất). Lỗi mạng/HTTP ánh xạ thành `SyncErrorCode`, không ném ra ngoài | M7 |
| `LoginPromptService` (v2.0) | `(kv: KvRepository, goals: GoalRepository, entries: EntryRepository)` | `state(now, ctx: { configured; signedIn; online }) → { banner: boolean; exportHint: boolean }`, `dismiss(now)`, `claimExportHint(now) → boolean` (qua `kv.update`, nguyên tử) | M8 |
| `SettingsService`, `LocaleService` (sửa v2.1) | thêm tham số tuỳ chọn `prefs?: SyncedPrefsRepository` (như `kv` tuỳ chọn của `GoalService`) | Có `prefs`: `setReminderEnabled`/`setReminderTime` đi qua `prefs.setReminder(patch, now)`, `LocaleService.set` đi qua `prefs.setLocale(locale, now)` (luôn ghi mốc, kể cả khi chưa đăng nhập: lựa chọn của người dùng là "đã chọn"). Không có `prefs` (test cũ) → hành vi M1/M2. `claimReminderDay`, `claimPlusOne`, `update({ lastBackupAt })` không đụng `prefsSync` | M7 |
| `BackupService` (sửa v2.0) | thêm tham số tuỳ chọn `isSignedIn: () => boolean` | `import(preview, now)`: khi đã đăng nhập, đặt `updatedAt = nextUpdatedAt(now, …)` cho mọi goal/entry trong file trước `replaceAll` (A-29); chưa đăng nhập → như M3 | M7 |
| `BackupService` (sửa v3.1, ADR-27) | thêm tham số tuỳ chọn `loadSchema?: () => Promise<typeof import('../domain/backup')>` (mặc định `() => import('../domain/backup')`, để test đếm số lần nạp) | **`parse(text, sizeBytes, today?) → Promise<Result<BackupPreview>>`** (trước là đồng bộ): kiểm kích thước trước (file > 5 MB → `IMPORT_FILE_TOO_LARGE`, không nạp schema), rồi nạp `domain/backup.ts` bằng `import()` (memo một lần), rồi `parseBackup` như cũ; nạp module lỗi (offline mà chunk chưa có trong cache) → ném lỗi, UI hiện lỗi đọc file như hiện tại. `export`, `import`, `counts` không đổi. Vi phạm giới hạn nghiệp vụ trong file (đúng kiểu JSON nhưng ngoài giới hạn §4/§5.4) vẫn là `IMPORT_INVALID_SCHEMA` nhưng có `params.variant = 'outOfRange'` (M5-P1) | M10 |
| `LoginPromptService` (sửa v3.1, A-46) | không đổi | `dismiss(now)`: trong `kv.update`, nếu trạng thái hiện tại đang ẩn (`isSnoozed(now, state)`) thì **không ghi** (không đếm thêm lượt). Domain `isSnoozed`/`shouldShowExportHint` coi mốc > `now + 24 h` là không có (`CLOCK_SKEW_TOLERANCE_MS = 86_400_000`) | M10 |

`AuthState = { kind: 'unavailable' } | { kind: 'signed-out'; lastError?: AuthErrorCode } | { kind: 'signing-in' } | { kind: 'signed-in'; userId; email; name } | { kind: 'expired'; email }`.

`SyncStatus = { kind: 'idle' | 'syncing' | 'offline' | 'error' | 'paused'; pending: number; lastSyncedAt: ISODateTime | null; error?: SyncErrorCode; nextRetryAt?: ISODateTime }` (`paused` = chưa đăng nhập hoặc `expired`).

`NotificationPort` (`src/services/notification-port.ts`): `permission() → NotificationPermissionState`, `requestPermission() → Promise<NotificationPermissionState>`, `show({ title, body, lang, tag, url, icon? }) → Promise<boolean>` (`false` khi không có SW registration, ví dụ `npm run dev`, hoặc trình duyệt từ chối hiển thị).

**Ghi nhận triển khai M1–M2 (đã qua QC, là một phần của contract từ v1.3):**

- **Tuần tự hoá trong tab:** `TimerService` (`start`/`save`/`discard`) và `ReminderService.check` dùng `Mutex` (`src/services/mutex.ts`). Mutex chỉ có tác dụng trong một JS context; tính đúng giữa các tab dựa vào transaction của repository (ADR-14 … ADR-16).
- **Scheduler nhắc** (`src/app/reminder-scheduler.ts`): một trigger (interval, `visibilitychange`) đến khi `check` đang chạy không bị bỏ mà được ghi nhớ và chạy thêm **đúng một** lần sau khi lần hiện tại kết thúc; lỗi của `check` bị nuốt ở scheduler (không dừng lịch).
- **UI Today chống bấm đúp Start:** `Today` giữ trạng thái lạc quan `pendingTimer` (kết quả `start()` thành công; `activeTimer = giá trị liveQuery ?? pendingTimer`), xoá khi liveQuery của kv `activeTimer` phát giá trị mới. `GoalCard` giữ cờ "đang start"; cờ chỉ được hạ bởi `useEffect` khi prop `timer` thực sự đổi khác `'none'`, hoặc khi `start()` trả lỗi (để thử lại). Không dựa vào timing.
- **Banner nhắc tính ở UI** từ dữ liệu live bằng `shouldShowBanner`/`reminderData` của domain; `ReminderService.getBannerState` vẫn giữ và có test nhưng Today không gọi.
- **`DomainError.params`** như mô tả ở đầu mục này.

### 5.4 Mã lỗi

| Code | Khi nào |
| :- | :- |
| `GOAL_NAME_REQUIRED` / `GOAL_NAME_TOO_LONG` | Tên rỗng sau trim / > 60 ký tự |
| `GOAL_WHY_TOO_LONG` | `why` > 280 ký tự |
| `GOAL_TARGET_INVALID` | Phút/ngày ngoài 1–1440, giờ tổng ngoài 1–10000, hoặc `dailyTarget` suy ra > 1440 |
| `GOAL_PERIOD_INVALID` | Ngày không hợp lệ, `endDate < startDate`, hoặc khoảng > 1827 ngày |
| `GOAL_PERIOD_EXCLUDES_ENTRIES` | Sửa khoảng thời gian làm entry đã có rơi ra ngoài |
| `GOAL_NOT_FOUND` / `ENTRY_NOT_FOUND` | Id không tồn tại |
| `ENTRY_MINUTES_INVALID` | Không phải số nguyên 1–1440 |
| `ENTRY_NOTE_TOO_LONG` | Ghi chú > 280 ký tự |
| `ENTRY_DAY_LIMIT_EXCEEDED` | Tổng phút của goal trong ngày > 1440 |
| `DATE_IN_FUTURE` | Ngày ghi > hôm nay |
| `DATE_OUTSIDE_GOAL_PERIOD` | Ngày ghi ngoài `startDate..endDate` |
| `GOAL_NOT_ACTIVE` | Start timer cho goal không `active` |
| `TIMER_ALREADY_RUNNING` / `TIMER_NOT_RUNNING` | Start khi đang chạy / Stop khi không chạy |
| `GOAL_TIMER_RUNNING` | Archive goal đang có timer chạy (phải Stop/Discard trước) — M5 |
| `IMPORT_FILE_TOO_LARGE` | File > 5 MB |
| `IMPORT_INVALID_JSON` | Không parse được JSON |
| `IMPORT_INVALID_SCHEMA` | Sai cấu trúc/kiểu, thiếu field, `app` sai, id dài hơn 64 ký tự. **v3.1 (M5-P1):** khi file đúng cấu trúc/kiểu nhưng một giá trị nằm ngoài giới hạn nghiệp vụ (tên/why/note quá dài hoặc tên rỗng, `targetMinutes` ngoài khoảng theo loại, `dailyTarget` suy ra > 1440, khoảng goal > 1827 ngày hoặc `endDate < startDate`, phút entry không phải số nguyên 1–1440) → vẫn mã này, thêm `params.variant = 'outOfRange'`; UI dùng key `errors.IMPORT_INVALID_SCHEMA_outOfRange` (copy DESIGN v3.1). Mã lỗi không đổi để test bám mã vẫn đúng |
| `IMPORT_UNSUPPORTED_VERSION` | `schemaVersion` khác 1 |
| `IMPORT_INTEGRITY` | Entry trỏ tới goal không tồn tại, id trùng, tổng phút/ngày > 1440, entry ngoài khoảng goal |
| `STORAGE_UNAVAILABLE` | Không mở được IndexedDB |
| `NOTIFICATIONS_UNSUPPORTED` / `NOTIFICATIONS_DENIED` | Trình duyệt không hỗ trợ / quyền bị chặn |
| `AUTH_OFFLINE` (v2.0, M6) | Bấm đăng nhập khi offline |
| `AUTH_CANCELLED` (M6) | Callback có `error=access_denied` (người dùng huỷ ở Google) |
| `AUTH_FAILED` (M6) | Callback lỗi khác, `exchangeCode` lỗi, code verifier mất (vd. mở callback ở trình duyệt khác) |
| `AUTH_SESSION_EXPIRED` (M6) | Refresh token không dùng được / server trả 401 cho phiên → trạng thái `expired` |
| `SYNC_OFFLINE` (M7) | Không có mạng (`navigator.onLine === false` hoặc `fetch` lỗi mạng) |
| `SYNC_UNREACHABLE` (M7) | Timeout 20 s, DNS/TLS lỗi, project bị tạm dừng (free tier), 5xx, 429 |
| `SYNC_UNAUTHORIZED` (M7) | 401/403 từ REST → chuyển `AuthService` sang `expired` |
| `SYNC_REMOTE_INVALID` (M7) | Hàng kéo về không qua zod (bị bỏ qua, đếm trong `ApplyResult.skippedInvalid`; chỉ ghi log + trạng thái, không chặn chu kỳ) |

Mã `AUTH_*`, `SYNC_*` thêm vào `ErrorCode` (domain/types) và có key `errors.<CODE>` ở cả `en.json`/`vi.json` (copy do designer chốt).

Message hiển thị (tiếng Anh và tiếng Việt) do designer chốt trong `DESIGN.md`; code ở trên là cố định để test bám vào. UI ánh xạ code → key `errors.<CODE>` (biến thể thêm hậu tố, vd. `errors.GOAL_TARGET_INVALID_daily`, `errors.GOAL_PERIOD_INVALID_tooLong`) trong `src/ui/error-messages.ts`; tham số (`remaining`, `start`, `end`, `v`) truyền vào `t()` sau khi đã qua formatter của locale. `DomainError.message` chỉ để log, không bao giờ hiển thị.

### 5.5 Định dạng file backup (schemaVersion 1)

Tên file: `1percent-better-backup-YYYY-MM-DD.json` (ngày export, giờ cục bộ). Kích thước import tối đa 5 MB.

```json
{
  "app": "one-percent-better",
  "schemaVersion": 1,
  "exportedAt": "2026-10-09T13:00:00.000Z",
  "goals": [ { "id": "…", "name": "Read", "why": "…", "targetType": "daily", "targetMinutes": 30,
               "startDate": "2026-01-01", "endDate": "2026-12-31", "archived": false,
               "createdAt": "…", "updatedAt": "…" } ],
  "entries": [ { "id": "…", "goalId": "…", "date": "2026-10-08", "minutes": 30, "note": "Ch. 3",
                 "source": "manual", "createdAt": "…", "updatedAt": "…" } ],
  "settings": { "reminderEnabled": false, "reminderTime": "20:00", "lastReminderDate": null,
                "lastBackupAt": null, "plusOneShown": {} }
}
```

Import: thay thế toàn bộ `goals`, `entries`, `settings`; xoá `activeTimer`; đặt `lastReminderDate = null`; giữ nguyên kv `locale` (ngôn ngữ là thiết lập của thiết bị, không có trong file backup). Field `plusOneShown` (thêm ở M5) là optional khi import, mặc định `{}`.

**v2.0 (M7):** định dạng file **không đổi** (`schemaVersion: 1`). Export chỉ gồm bản ghi còn sống, không có `deletedAt`, `dirty`, `user_id` hay kv `sync`/`loginPrompt`. Import giữ kv `locale`, `sync`, `loginPrompt`; bản ghi hiện có không nằm trong file bị **xoá mềm** (để việc thay thế lan truyền lên cloud). Khi đã đăng nhập, `BackupService.import` đặt `updatedAt` của mọi bản ghi trong file = thời điểm import (A-29) để thắng LWW; chưa đăng nhập thì giữ nguyên như file.

### 5.6 Notification và Service Worker

- Hiển thị qua `(await navigator.serviceWorker.ready).showNotification(title, options)` (bắt buộc trên Android Chrome; `new Notification()` không dùng).
- `title`: `"1% Better"` (thương hiệu, giống nhau ở hai ngôn ngữ); `body`: số goal chưa đạt và tiến độ, dịch theo locale đang chọn lúc gửi (key `notification.body`, số nhiều qua `_one`/`_other`), ví dụ `en`: `"2 goals left today: Read 10/30 min, Guitar 0/20 min"`; `vi`: theo copy trong DESIGN.md, tên goal giữ nguyên; `lang`: `"en"` hoặc `"vi"`; `tag`: `"daily-reminder"`; `data.url`: `"#/today"`; `icon`: icon 192 px.
- `sw.ts` xử lý `notificationclick`: đóng notification, focus client đang mở cùng scope và điều hướng tới `#/today`, nếu không có thì `clients.openWindow(scope + '#/today')`.
- Lịch kiểm tra nhắc (khi app đang mở): ngay khi app khởi động, mỗi `VITE_REMINDER_CHECK_INTERVAL_MS` (mặc định 60000 ms), và khi `visibilitychange` (trigger đến lúc đang kiểm được chạy bù một lần, §5.3). Thứ tự (ADR-15): `shouldNotify` → claim `lastReminderDate = today` nguyên tử qua `SettingsService.claimReminderDay` → `showNotification` → nếu không hiển thị được thì hoàn claim về giá trị cũ. Nhiều tab mở cùng lúc: tối đa một tab thắng claim mỗi ngày.
- `shouldNotify(now, settings, permission, activeGoalsProgress)` = `reminderEnabled && permission === 'granted' && hh:mm(now) ≥ reminderTime && lastReminderDate !== today && có ≥ 1 goal active chưa đạt`. `shouldShowBanner` = như trên nhưng không cần quyền và không xét `lastReminderDate`.

### 5.7 File `.ics` (FR-16)

Tên `1percent-better-reminder.ics`; nội dung tối thiểu: `BEGIN:VCALENDAR`, `VERSION:2.0`, `PRODID:-//1% Better//EN`, một `VEVENT` có `UID`, `DTSTAMP`, `DTSTART` (ngày mai, giờ nhắc, giờ "floating" cục bộ dạng `YYYYMMDDTHHMMSS`), `DURATION:PT15M`, `RRULE:FREQ=DAILY`, `SUMMARY:<key ics.summary theo locale>` (`en`: `1% Better — log today's time`; `vi`: theo DESIGN.md), `BEGIN:VALARM` với `TRIGGER:PT0M`, `ACTION:DISPLAY`, `DESCRIPTION:<key ics.alarm theo locale>`. Nội dung UTF-8 (tiếng Việt có dấu), escape `\`, `;`, `,`, xuống dòng theo RFC 5545, dòng dài hơn 75 octet được gập (folding) không cắt giữa ký tự UTF-8. `PRODID` giữ `-//1% Better//EN` ở cả hai ngôn ngữ (định danh sản phẩm, không phải chữ hiển thị). Dòng kết thúc CRLF. Tên file không đổi theo ngôn ngữ.

### 5.8 i18n contract

- **Locale:** `'en' | 'vi'`; tag cho `Intl`: `en` → `en-US`, `vi` → `vi-VN`.
- **Phát hiện (FR-33):** `detectLocale(lang) = lang?.toLowerCase().startsWith('vi') ? 'vi' : 'en'`, với `lang = navigator.language`.
- **Thứ tự quyết định:** kv `locale` (nếu hợp lệ) → `detectLocale(navigator.language)`. Giá trị kv không hợp lệ (vd. `'fr'`) bị bỏ qua (coi như chưa chọn), không crash.
- **Đổi ngôn ngữ (FR-32):** `LocaleService.set(locale)` ghi kv → `setLocale(locale)` gọi `i18next.changeLanguage` (đồng bộ vì resource đóng gói sẵn) + `document.documentElement.lang = locale` + cập nhật `document.title`. Mọi component dùng `useT`/`useFormat` re-render ngay; không reload.
- **Khởi động không nháy ngôn ngữ:** bootstrap đọc kv `locale` trước khi render router (lần đọc này nằm trong bước mở DB vốn đã có; DESIGN quy định 150 ms đầu không hiển thị nội dung). Màn `StorageError` dùng ngôn ngữ phát hiện từ trình duyệt.
- **Key:** phân cấp theo key đã có trong DESIGN.md §7 (`app.*`, `nav.*`, `toast.*`, `errors.*`, `empty.*`, `form.*`, `reminder.*`, `notification.*`, `heatmap.*`, `chart.*`, `ics.*`, `settings.language.*`, `screen.<tên>.*`). Nội suy `{{name}}`; số nhiều theo chuẩn i18next JSON v4 (`key_one`, `key_other`; `vi.json` chỉ cần `key_other`). Không ghép chuỗi bằng `+` trong UI (thứ tự từ khác nhau giữa hai ngôn ngữ): dùng một key có biến.
- **Tên ngôn ngữ trong Settings:** key `settings.language.option.en` = `English` và `settings.language.option.vi` = `Tiếng Việt` ở **cả hai** file (endonym), có `lang` attribute tương ứng trên từng lựa chọn.
- **Formatter (`src/i18n/format.ts`, mọi hàm nhận `locale`):**

| Hàm | `en` | `vi` | Cài đặt |
| :- | :- | :- | :- |
| `dateLong(d, {withYear})` | `Friday, October 9` / `Thursday, October 8, 2026` | kết quả `Intl.DateTimeFormat('vi-VN', {weekday:'long', day:'numeric', month:'long'[, year:'numeric']})`, vd. `Thứ Sáu, 9 tháng 10` | `Intl.DateTimeFormat` |
| `dateShort(d)` | `2026-10-01` (ISO, như DESIGN.md) | `01/10/2026` | `en`: chuỗi ISO; `vi`: `Intl.DateTimeFormat('vi-VN', {day:'2-digit', month:'2-digit', year:'numeric'})` |
| `dateRange(a, b)` | `2026-10-01 – 2026-10-31` | `01/10/2026 – 31/10/2026` | hai `dateShort` + en dash |
| `weekdayShort`, `monthShort` | `Mon`, `Oct` | theo `Intl` `vi-VN` | dùng cho nhãn heatmap/trục biểu đồ |
| `number(n)` | `1,440` | `1.440` | `Intl.NumberFormat` |
| `decimal1(n)` | `4.0` | `4,0` | `minimumFractionDigits: 1, maximumFractionDigits: 1` |
| `percent1(n)` | `25.8%` | `25,8%` | như trên + key `format.percent` (`{{value}}%`) để không phụ thuộc khoảng trắng của ICU |
| `minutes(n)`, `duration(min)` | `20 min`, `2 h 40 min` | theo key `format.minutes`, `format.duration` trong `vi.json` | key i18n + `number()` |
| `hhmmss(ms)`, giờ nhắc `HH:MM` | `00:25:31`, `20:00` | giống `en` | không qua Intl |

- Ngày lưu trữ (`ISODate`), dữ liệu file backup, tên file, mã lỗi luôn không phụ thuộc locale.

### 5.9 Auth contract (v2.0, M6)

```ts
// src/services/auth-port.ts
interface AuthSession { userId: string; email: string; name: string }   // name: user_metadata.full_name ?? name ?? phần trước '@'
type AuthEvent = { type: 'signed-in'; session: AuthSession } | { type: 'signed-out' } | { type: 'session-expired' };
interface AuthPort {
  getSession(): Promise<AuthSession | null>;               // đọc từ storage, không cần mạng
  signInWithGoogle(redirectTo: string): Promise<void>;      // điều hướng toàn trang; promise có thể không bao giờ resolve
  exchangeCode(code: string): Promise<AuthSession>;         // PKCE; ném lỗi → AUTH_FAILED
  signOut(): Promise<void>;                                 // scope 'local'; xoá phiên trong storage kể cả khi offline
  onEvent(cb: (e: AuthEvent) => void): () => void;
  accessToken(): Promise<string | null>;                    // cho RemoteStore (cùng client SDK)
}
interface ReturnToStore { save(hash: string): void; take(): string | null }  // sessionStorage 'opb-auth-return'
```

**Luồng đăng nhập (GitHub Pages sub-path + hash routing):**

1. UI gọi `AuthService.signIn(location.hash || '#/settings')` → lưu `returnTo` → nạp SDK (`loader.ts`) → `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })` với `redirectTo = new URL(import.meta.env.BASE_URL + '?auth=callback', location.origin).href`, ví dụ `https://minh-lgm.github.io/one-percent-better/?auth=callback`, local preview `http://localhost:4174/one-percent-better/?auth=callback`, dev `http://localhost:5173/?auth=callback`. **Không** đặt hash trong `redirectTo` (Supabase nối `code` vào query; hash do `returnTo` lo).
2. SDK lưu code verifier vào `localStorage['opb-auth-code-verifier']`, điều hướng tới `<SUPABASE_URL>/auth/v1/authorize?provider=google&redirect_to=…&code_challenge=…&code_challenge_method=s256` → Google → `<SUPABASE_URL>/auth/v1/callback` → về `…/one-percent-better/?auth=callback&code=<uuid>` (hoặc `&error=access_denied&error_description=…`).
3. GitHub Pages trả `index.html` cho `/one-percent-better/?…`; service worker không khớp precache vì có query nên lấy từ mạng (đang online). `bootstrap` (trước khi render router) gọi `readAuthCallback(location)`; nếu có → `cleanCallbackUrl` (thay URL bằng `BASE_URL + (returnTo ?? '#/settings')` qua `history.replaceState`, để reload không đổi lại code), render app, rồi chạy nền `AuthService.completeCallback(cb)` (Account card hiện `signing-in`).
4. Thành công → `signed-in`, ghi kv `sync.account`/`userId`; M7: `SyncService.prepareFirstSignIn` → gộp hoặc hỏi (FR-47) → `syncNow('sign-in')`.
5. `flowType: 'pkce'` bắt buộc (mặc định của SDK là `implicit`, sẽ đặt token vào `#…` và đụng hash router); `detectSessionInUrl: false` (app tự xử lý callback, test được bằng hàm thuần).

**Dọn code verifier (v3.1, M6-P1):** sau khi `completeCallback` kết thúc (thành công, `AUTH_CANCELLED`, `AUTH_FAILED`), lớp integration xoá `localStorage['opb-auth-code-verifier']` (`clearPkceVerifier`, gọi từ `bootstrap` sau khi promise callback settle). Phiên `opb-auth` không bị đụng. Bắt đầu đăng nhập lại thì SDK tạo verifier mới.

**Lazy-load (ADR-18):** `container` không import SDK; `AuthService.init()` chỉ nạp khi `hasStoredSession()` (có `localStorage['opb-auth']`) hoặc có callback. Trước khi SDK nạp xong, UI hiện `sync.account` đã lưu (không nháy trạng thái). Bản build không có cấu hình cloud: `AuthService` = stub `unavailable`, không có code nào gọi `loader`.

**Đăng xuất:** `AuthService.signOut({ keepData })` → (M7) `finalSyncBeforeSignOut` nếu online, timeout 10 s → `port.signOut()` → `SyncService.reset()` (giữ `lastUserId`) → nếu `!keepData` → `LocalDataRepository.clearUserData()` → `signed-out`. Lỗi mạng khi đăng xuất không chặn việc xoá phiên cục bộ.

**Hết hạn:** SDK phát `SIGNED_OUT` mà app không yêu cầu, hoặc REST trả 401 → `session-expired` → `expired` (giữ dữ liệu, `dirty` giữ nguyên, sync `paused`).

### 5.10 Sync protocol (v2.0, M7)

```ts
// src/services/remote-store.ts
interface RemoteStore {
  /** Upsert theo lô (≤ 500 hàng/bảng), goals trước entries. onConflict 'user_id,id'. Trigger server quyết LWW. */
  push(changes: RemoteChanges): Promise<void>;
  /** Đọc bản ghi chuẩn hiện có trên server cho các id vừa đẩy (lô ≤ 100 id/request). */
  fetchByIds(ids: { goals: string[]; entries: string[] }): Promise<RemoteChanges & { serverUpdatedAt: Record<string, ISODateTime> }>;
  /** Keyset: server_updated_at > c.serverUpdatedAt − 120 s, hoặc (= và id > c.id) …; order by server_updated_at, id; limit. */
  pull(table: 'goals' | 'entries', cursor: PullCursor | null, limit: number):
    Promise<{ rows: SyncRecord<Goal>[] | SyncRecord<LogEntry>[]; next: PullCursor | null; hasMore: boolean; skippedInvalid: number }>;
  /** v2.1: upsert hàng `settings` của user (onConflict 'user_id'); nhóm null = không gửi (trigger giữ cũ). Trả hàng chuẩn sau ghi. */
  pushPrefs(prefs: RemotePrefs): Promise<RemotePrefs>;
  /** v2.1: đọc hàng `settings` của user; chưa có hàng → null. Hàng sai schema → nhóm đó coi như null + skippedInvalid. */
  pullPrefs(): Promise<RemotePrefs | null>;
}
// Lỗi: ném RemoteError { code: 'SYNC_OFFLINE' | 'SYNC_UNREACHABLE' | 'SYNC_UNAUTHORIZED' }.
```

**Một chu kỳ `syncNow`** (chỉ khi `signed-in`, online; giữ `LockPort` tên `opb-sync`; nếu `busy` → trả `skipped`):

1. **Push:** lặp `local.getDirty(500)` → `remote.push` → `remote.fetchByIds(id vừa đẩy)` → `local.applyRemote(bản chuẩn)` (bản của mình được nhận → `dirty = 0`; server giữ bản mới hơn → ghi đè local, `dirty = 0`; local đã sửa tiếp trong lúc đẩy → giữ `dirty = 1`) cho tới khi hết dirty hoặc đã lặp 20 lô (phần còn lại để chu kỳ sau).
2. **Pull:** `goals` rồi `entries`, mỗi bảng lặp `remote.pull(cursor, 500)` → `local.applyRemote` → ghi `cursor` mới vào kv `sync` **sau** khi áp xong lô (crash giữa chừng thì kéo lại, idempotent).
3. **Dọn:** `local.tombstoneOrphanEntries(now)` (entry còn sống của goal đã xoá → xoá mềm, `dirty = 1`, đẩy ở chu kỳ sau).
3b. **Tuỳ chọn (v2.1, FR-55):** `prefs.getDirty()` khác null → `remote.pushPrefs(dirty)` → `prefs.applyRemote(hàng trả về)`; ngược lại `remote.pullPrefs()` → `prefs.applyRemote(...)`. Bảng chỉ một hàng nên luôn đọc lại toàn hàng mỗi chu kỳ (không cần con trỏ). `localeChanged` → (qua watch kv `locale`) container gọi `setLocale` ngay.
4. Ghi `lastSyncedAt`, xoá `lastError`; trạng thái `idle`. Lỗi ở bước nào → `lastError`, trạng thái `offline`/`error`, hẹn thử lại theo backoff 30 s, 60 s, 2 phút, 4 phút, 8 phút, 15 phút (trần); `syncNow('manual')` bỏ qua backoff.

**Con trỏ kéo:** theo `server_updated_at` do server đặt (không theo `updatedAt` của client, vì đồng hồ client lệch); lùi 120 s mỗi lần kéo để không sót hàng của transaction commit muộn; áp lại hàng trùng là vô hại (LWW idempotent).

**Trigger** (`app/sync-scheduler.ts`, FR-46): sau `signed-in`; khởi động có phiên; `online`; `visibilitychange` → `visible`; `watchPendingCount` tăng → debounce 2000 ms; interval `VITE_SYNC_INTERVAL_MS` (mặc định 300000, khoảng 60000–3600000) chỉ khi `document.visibilityState === 'visible'`. Trigger đến khi đang chạy được ghi nhớ và chạy thêm một lần (như reminder scheduler).

**Gộp khi đăng nhập (FR-47):** `prepareFirstSignIn(userId)`: `sync.lastUserId` null hoặc bằng `userId` → `merge-silently`/`same-user` (bản ghi tạo khi chưa đăng nhập đã có `dirty = 1` nên chu kỳ đầu tự đẩy lên = gộp; nhóm tuỳ chọn đã chọn trên máy cũng `dirty = 1` và đi theo bảng quy tắc §4.4); khác `userId` và `countLive() > 0` → `confirm-merge` (UI hiện hộp thoại; "Add to account" → `confirmMerge()` = `markAllDirty()` + `prefs.markAllDirty()` + reset cursor; "Cancel" → `AuthService.signOut({ keepData: true })`).

**Ánh xạ hàng (`integration/supabase/mapper.ts`):** `snake_case` ↔ `camelCase`; `timestamptz` → `new Date(v).toISOString()` (luôn dạng `YYYY-MM-DDTHH:mm:ss.sssZ`); `date` giữ `YYYY-MM-DD`; zod kiểm từng hàng theo giới hạn domain (độ dài, khoảng phút, enum), hàng sai → bỏ qua và đếm `skippedInvalid` (NFR-05).

### 5.11 Mock Supabase cho E2E (v2.0) — `e2e/mock-supabase/server.mjs`

Server Node `http`, cổng `54321`, dữ liệu trong bộ nhớ, CORS cho mọi origin `http://localhost:*`. Mô phỏng **đúng hành vi cần cho app**, không phải toàn bộ Supabase:

| Endpoint | Hành vi |
| :- | :- |
| `GET /auth/v1/authorize` | Kiểm `provider=google`, `code_challenge_method=s256`, `redirect_to` bắt đầu bằng origin được phép; trả trang HTML "chọn tài khoản" giả với nút `Minh Test` (u1), `Other User` (u2), `Cancel`. Chọn → 302 về `redirect_to` + `&code=<code>` (code gắn với `code_challenge`); `Cancel` → `&error=access_denied&error_description=…` |
| `POST /auth/v1/token?grant_type=pkce` | Kiểm `auth_code` + `code_verifier` (SHA-256 base64url khớp challenge), dùng một lần; trả session (`access_token` JWT ký HS256 bằng secret giả, `refresh_token`, `expires_in`, `expires_at`, `user` có `id`, `email`, `user_metadata.full_name`) |
| `POST /auth/v1/token?grant_type=refresh_token` | Đổi refresh token; có công tắc test để trả `400 invalid_grant` (mô phỏng phiên bị thu hồi) |
| `GET /auth/v1/user`, `POST /auth/v1/logout` | Theo session |
| `GET/POST /rest/v1/settings` (v2.1) | Một hàng/user, upsert theo `user_id`, **cùng quy tắc với trigger `settings_before_write`** (LWW theo từng nhóm, nhóm null giữ cũ, tie → server) |
| `GET/POST /rest/v1/goals`, `/rest/v1/entries` | Tập con PostgREST mà `SupabaseRemoteStore` dùng (upsert `Prefer: resolution=merge-duplicates`, `select`, `in`, `gt`/`gte`/`eq`, `or`, `order`, `limit`); **cùng quy tắc với trigger SQL** (LWW, tie → server, `server_updated_at` tăng dần) và lọc theo `sub` của JWT (mô phỏng RLS) |
| `/__test/reset`, `/__test/rows?user=`, `/__test/seed`, `/__test/fail?status=500&times=n`, `/__test/log` | Chỉ cho test: reset dữ liệu, đọc/ghi hàng, ép lỗi, xem log request (kích thước lô, số lần exchange) |

Người dùng giả: u1 `00000000-0000-4000-8000-000000000001` / `minh.test@example.com` / `Minh Test`; u2 `00000000-0000-4000-8000-000000000002` / `other.user@example.com` / `Other User`. Quy tắc LWW của mock và của `FakeRemoteStore` (Vitest) phải cùng chạy qua **một bộ test hợp đồng** (`src/services/remote-store.contract.ts`) để không lệch nhau; bộ này cũng chạy với Supabase local khi có Docker (`npm run test:db`).

## 6. Cấu trúc thư mục

```text
/
├── index.html
├── package.json / package-lock.json
├── .nvmrc                     # 22.14.0
├── .env.example
├── README.md
├── vite.config.ts             # gồm cấu hình Vitest và vite-plugin-pwa
├── playwright.config.ts
├── eslint.config.js
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── public/
│   ├── favicon.svg
│   ├── apple-touch-icon.png   # 180x180
│   └── icons/ pwa-192.png, pwa-512.png, pwa-maskable-512.png
├── src/
│   ├── main.tsx
│   ├── sw.ts
│   ├── app/                   # container.ts, bootstrap.ts, AppContext.tsx, router.tsx, ErrorBoundary.tsx, reminder-scheduler.ts
│   ├── config/                # env.ts, constants.ts
│   ├── i18n/                  # types.ts, detect.ts, format.ts, instance.ts, i18next.d.ts (kiểu key) (+ *.test.ts)
│   │   └── resources/         # en.json, vi.json (cùng tập key; nguyên văn copy từ DESIGN.md)
│   ├── domain/                # types, dates, goal, entry, stats, heatmap, curve, timer, reminder, backup, ics (+ *.test.ts)
│   ├── data/
│   │   ├── repositories.ts
│   │   └── dexie/             # db.ts, goal-repo.ts, entry-repo.ts, kv-repo.ts, timer-repo.ts (M3), backup-repo.ts (+ *.test.ts)
│   ├── services/              # goal-, entry-, timer-, settings-, reminder-, backup-, stats-, locale-service.ts,
│   │                          # mutex.ts, notification-port.ts (+ *.test.ts)
│   ├── integration/           # notifications.ts, sw-register.ts, file-io.ts, storage.ts (+ *.test.ts)
│   ├── ui/
│   │   ├── screens/           # Today, Goals, GoalForm, GoalDetail, Day, Review, Settings, NotFound, StorageError
│   │   ├── components/        # Heatmap, TimerCard, EntryForm, StatCard, CurveChart, BarChart, …
│   │   ├── hooks/             # useSubscribable, useNow, useServices, useT, useFormat, useDocumentTitle
│   │   ├── error-messages.ts  # DomainError → key errors.*
│   │   └── styles/
│   └── test/                  # setup.ts (jest-dom, fake-indexeddb/auto, i18n ở chế độ test), helpers, builders,
│                              # render-with-locale.tsx, i18n-scan.ts (quét DOM tìm chuỗi tiếng Anh/key thô)
├── e2e/                       # Playwright spec của developer; helpers/i18n-scan.ts (bản chạy trong page)
│   └── fixtures/              # sample-backup.json (M3), large-backup.json (M4)
└── tests/qc/                  # của QC: *.test.ts (Vitest) và *.spec.ts (Playwright)
```

Unit/integration test đặt cạnh file nguồn (`*.test.ts(x)`).

**Bổ sung v2.0:**

```text
/
├── .env.example               # + VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SYNC_INTERVAL_MS (để trống)
├── .env.e2e                   # commit: VITE_SUPABASE_URL= (rỗng) → build e2e chuẩn luôn tắt cloud, kể cả máy có .env.local
├── .env.cloud-e2e             # commit: URL mock http://127.0.0.1:54321 + key giả (không phải secret)
├── .github/workflows/pages.yml  # build nhận VITE_SUPABASE_* từ GitHub Actions secrets
├── supabase/
│   ├── config.toml            # từ `supabase init` (Supabase local)
│   └── migrations/20261012000000_cloud_sync.sql
├── src/
│   ├── domain/                # + sync.ts, login-prompt.ts
│   ├── data/dexie/            # db.ts (v2), + local-data-repo.ts, sync-store.ts
│   ├── services/              # + auth-port.ts, remote-store.ts, lock-port.ts, auth-service.ts, sync-service.ts,
│   │                          #   login-prompt-service.ts, remote-store.contract.ts (bộ test hợp đồng dùng chung)
│   ├── integration/           # + auth-callback.ts, connectivity.ts, web-locks.ts
│   │   └── supabase/          # supabase-client.ts, loader.ts, mapper.ts (+ test) — nơi DUY NHẤT import @supabase/*
│   ├── app/                   # + sync-scheduler.ts
│   ├── ui/components/         # + AccountCard, SignOutDialog, MergeAccountDialog, SyncIndicator, LoginPromptBanner, ExportSignInHint
│   └── test/                  # + fake-auth-port.ts, fake-remote-store.ts, two-devices.ts (dựng 2 DB + 1 remote)
├── e2e/
│   ├── mock-supabase/server.mjs
│   └── cloud/                 # spec chạy với project Playwright `cloud` (build cloud-e2e, sub-path)
└── tests/
    ├── qc/cloud/              # spec cloud của QC
    └── db/                    # test SQL/RLS với Supabase local (chỉ `npm run test:db`, không nằm trong `npm test`)
```

**Bổ sung v3.1 (M10):** `src/domain/backup-file.ts`; `src/app/maintenance.ts`; `e2e/m10-*.spec.ts` (project `chromium`) và `e2e/cloud/m10-*.spec.ts` (project `cloud`), gồm spec đo ngân sách tải lạnh.

## 7. Config và biến môi trường

Không có secret. Không biến nào bắt buộc; app chạy với giá trị mặc định khi không có `.env`.

| Biến | Mục đích | Bắt buộc | Ví dụ |
| :- | :- | :- | :- |
| `VITE_DB_NAME` | Tên IndexedDB database | Không (mặc định `one-percent-better`) | `one-percent-better` |
| `VITE_REMINDER_CHECK_INTERVAL_MS` | Chu kỳ kiểm tra nhắc nhở khi app mở (1000–3600000) | Không (mặc định `60000`) | `60000` |
| `BASE_PATH` | `base` của Vite khi host dưới subpath (đọc lúc build trong `vite.config.ts`) | Không (mặc định `/`) | `/one-percent-better/` |
| `VITE_SUPABASE_URL` (v2.0) | Project URL Supabase. Chỉ nhận `https://…` hoặc `http://localhost[:port]`/`http://127.0.0.1[:port]`; sai → cloud tắt | Không (thiếu → cloud tắt, FR-38) | `https://abcdefghijklmnop.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` (v2.0) | Publishable key (`sb_publishable_…`), công khai theo thiết kế, quyền bị giới hạn bởi RLS | Không (cần cùng URL để bật cloud) | `sb_publishable_xxx` |
| `VITE_SUPABASE_ANON_KEY` (v2.0) | Dự phòng cho project còn dùng anon key JWT cũ; chỉ đọc khi thiếu `…_PUBLISHABLE_KEY` | Không | `eyJhbGciOi…` |
| `VITE_SYNC_INTERVAL_MS` (v2.0) | Chu kỳ đồng bộ định kỳ khi app hiển thị (60000–3600000) | Không (mặc định `300000`) | `300000` |
| `SUPABASE_TEST_URL`, `SUPABASE_TEST_PUBLISHABLE_KEY`, `SUPABASE_TEST_SECRET_KEY` (v2.0, chỉ `npm run test:db`) | Kết nối Supabase **local** (giá trị in ra bởi `npx supabase status`); secret key local dùng để tạo user test | Chỉ cho `test:db` | `http://127.0.0.1:54321` |

Không có secret trong bundle: publishable/anon key là public (RLS bảo vệ dữ liệu). **Tuyệt đối không** đặt `service_role`/`sb_secret_…` của project thật vào bất kỳ biến `VITE_*` nào (Vite nhúng mọi `VITE_*` vào JS). `.env`, `.env.local`, `.env.*.local` nằm trong `.gitignore`; `.env.example`, `.env.e2e`, `.env.cloud-e2e` được commit (chỉ chứa giá trị rỗng/giả).

GitHub Actions (`pages.yml`, bước `npm run build`): `env: VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}`, `VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}` cạnh `BASE_PATH`. Secret chưa đặt → biến rỗng → bản deploy không có cloud (an toàn khi push code trước khi user setup xong).

Biến dùng trong script npm (đặt sẵn bằng `cross-env`, không cần `.env`): `PLAYWRIGHT_BROWSERS_PATH=0`.

## 8. Chiến lược test

| Loại | Công cụ | Phạm vi | Lệnh |
| :- | :- | :- | :- |
| Unit | Vitest (env `node`) | Toàn bộ `src/domain` (validate, dailyTarget, streak, heatmap, curve, timer, reminder, backup schema, ics). Coverage dòng `src/domain` ≥ 90% | `npm test`, `npm run test:coverage` |
| Integration | Vitest + `fake-indexeddb` | Repository Dexie (cascade, transaction, rollback), service với repository thật | `npm test` |
| Component | Vitest (env `jsdom`) + Testing Library | Form validate, Today, TimerCard (fake timers), Settings | `npm test` |
| E2E | Playwright Chromium, chạy trên bản build qua `vite preview` port 4173, `timezoneId: 'Asia/Ho_Chi_Minh'`, `locale: 'en-US'` mặc định (spec song ngữ dùng `test.use({ locale: 'vi-VN' })`) | Luồng chính mỗi milestone; `page.clock` cho timer/nhắc; `context.setOffline` cho offline; `grantPermissions(['notifications'])`; tải/nạp file backup; axe a11y; luồng chính chạy lại ở `vi-VN` + quét DOM | `npm run test:e2e` |
| i18n | Vitest + Testing Library + Playwright | (1) **Parity**: `en.json` và `vi.json` cùng tập key (sau khi gộp hậu tố số nhiều), cùng tập biến `{{…}}` theo từng key, không giá trị rỗng, không giá trị `vi` trùng `en` ngoài allowlist (`app.name`, `app.shortName`, `plusone.pill`, `settings.language.option.*`, chuỗi chỉ gồm số/ký hiệu; allowlist nằm trong file test, mục thêm mới phải nêu trong handoff). (2) **Unit** `detectLocale`, formatter cho cả hai locale. (3) **Missing key**: ở môi trường test, `missingKeyHandler` ném lỗi → mọi component test fail nếu dùng key không tồn tại. (4) **Quét DOM** (`src/test/i18n-scan.ts`, bản E2E `e2e/helpers/i18n-scan.ts`): render ở `vi`, thu mọi text node + thuộc tính `aria-label`, `aria-description`, `aria-valuetext`, `placeholder`, `title`, `alt` + `document.title`; fail nếu một chuỗi khớp **toàn bộ** một giá trị `en` (đã thay `{{biến}}` bằng wildcard) mà khác giá trị `vi` cùng key, hoặc trông như key thô (`/^[a-z]+(\.[A-Za-z0-9_]+)+$/`). Dữ liệu người dùng trong fixture không bị coi là lỗi vì so khớp toàn chuỗi | `npm test`, `npm run test:e2e` |
| QC | Như trên | `tests/qc/**/*.test.ts(x)` được Vitest include; `tests/qc/**/*.spec.ts` được Playwright include | (cùng lệnh) |

Quy ước test: mỗi test e2e dùng browser context mới (IndexedDB sạch); dữ liệu mẫu nạp qua màn hình Import (từ M3) hoặc qua UI. Thời gian trong test luôn cố định (`vi.setSystemTime` / `page.clock.setFixedTime` hoặc `install`), ví dụ `2026-10-09T10:00:00+07:00`.

**Bổ sung v2.0 (auth + sync):**

| Loại | Công cụ | Phạm vi | Lệnh |
| :- | :- | :- | :- |
| Unit | Vitest | `domain/sync.ts` (bảng `resolveIncoming`, `nextUpdatedAt`), `domain/login-prompt.ts`, `config/env.ts` (cloud), `integration/auth-callback.ts`, `integration/supabase/mapper.ts` (round-trip, chuẩn hoá thời gian, hàng sai) | `npm test` |
| Service | Vitest + `FakeAuthPort`, `FakeRemoteStore` (`src/test/`) + Dexie trên fake-indexeddb | `AuthService` (máy trạng thái, lazy: loader không được gọi khi không có phiên), `SyncService` (chu kỳ, backoff bằng fake timers, lỗi, single-flight), gộp khi đăng nhập | `npm test` |
| Hai thiết bị | Vitest, helper `src/test/two-devices.ts`: 2 DB fake-indexeddb (tên khác nhau) + 2 bộ repository/`SyncService` + 1 `FakeRemoteStore` | Kịch bản hội tụ, xung đột, xoá, offline, lệch đồng hồ; **test ngẫu nhiên có seed** (PRNG tự viết, không thêm dependency): 20 seed × 200 thao tác ngẫu nhiên (tạo/sửa/xoá goal/entry, archive, sync xen kẽ, offline) → sau khi sync A, B, A: tập bản ghi sống của A = B = remote | `npm test` |
| Hợp đồng `RemoteStore` | `src/services/remote-store.contract.ts` (hàm `describeRemoteStoreContract(factory)`) | Chạy với `FakeRemoteStore` và `SupabaseRemoteStore` → mock server (khởi động trong `beforeAll`, cổng ngẫu nhiên) trong `npm test`; chạy thêm với Supabase local trong `npm run test:db` | `npm test`, `npm run test:db` |
| Migration Dexie | Vitest + fake-indexeddb | Dựng DB v1 (schema v1 chép trong test) có S1 + timer + settings + locale → mở bằng `AppDatabase` v2 → dữ liệu domain deep-equal, `dirty = 1`, `deletedAt = null` | `npm test` |
| SQL/RLS | Vitest (`tests/db/**`, config riêng) + `@supabase/supabase-js` + Supabase local (Docker) | Áp migration, RLS (A không thấy/ghi được hàng B; `anon` bị từ chối), trigger LWW, không DELETE được | `npm run test:db` (thiếu Docker/`SUPABASE_TEST_URL` → in "skipped: Supabase local not running" và exit 0; QC ghi NOT VERIFIED) |
| Tĩnh (SQL) | Vitest đọc file migration | Có `enable row level security` cho cả ba bảng (`goals`, `entries`, `settings` — v2.1), không có `grant … to anon`, không có `for delete` policy, có trigger `sync_before_write` và `settings_before_write` | `npm test` |
| Tuỳ chọn đồng bộ (v2.1) | Vitest (unit + service + hai thiết bị) | Bảng quy tắc `resolvePrefGroup` (§4.4), `SyncedPrefsRepository` (transaction, migration mốc 1970), LWW theo nhóm (đổi locale ở A + đổi giờ nhắc ở B không ghi đè nhau); hợp đồng `pushPrefs`/`pullPrefs` cho Fake + mock | `npm test` |

**Môi trường hiện tại không có Docker (quyết định 2026-10-12, OQ-08):** `npm run test:db` sẽ in "skipped" và exit 0 trên máy user/QC; mọi AC SQL/RLS chạy trên Postgres thật là `NOT VERIFIED` và được kiểm tay ở U10. Dev/QC **không** phải cài Docker; bộ test `tests/db/**` vẫn được viết để chạy được khi có Docker sau này.
| E2E chuẩn | Playwright project `chromium` (như cũ) trên build `--mode e2e` (cloud **tắt**) cổng 4173 | Toàn bộ spec M1–M5 + kiểm "không có Account card" | `npm run test:e2e` |
| E2E cloud | Playwright project `cloud`: build `--mode cloud-e2e` với `BASE_PATH=/one-percent-better/`, `outDir: dist-cloud-e2e`, preview cổng 4174; mock Supabase cổng 54321 (đều là `webServer`) | `e2e/cloud/**`, `tests/qc/cloud/**`: đăng nhập PKCE qua sub-path, lazy-load, phiên bền/offline/hết hạn, đăng xuất, đồng bộ hai thiết bị (hai browser context), xoá lan truyền, offline → online, lỗi 500/401, import khi đã đăng nhập, nhắc đăng nhập, `vi-VN`, axe, 360 px, request chỉ tới {4174, 54321}. Mỗi test gọi `/__test/reset` (hoặc dùng user riêng) | `npm run test:e2e` (chạy cả hai project) |

**Bổ sung v3.1 (M10):**

| Loại | Công cụ | Phạm vi | Lệnh |
| :- | :- | :- | :- |
| Ngân sách tải lạnh (ADR-27) | Playwright, cùng phương pháp `tests/qc/final-nfr.spec.ts`: context mới, `freezeClock`, mở `#/today`, chờ `h1` + `networkidle`, cộng `gzipSync(body, { level: 9 })` của mọi response có content-type JS/CSS/HTML, bỏ URL `sw*`/`workbox*` | Project `chromium` (build `--mode e2e`, cloud tắt) và project `cloud` (cloud bật, chưa đăng nhập): tổng ≤ **230.000 byte**; không request chunk Recharts, SDK Supabase, hay chunk chứa zod; in danh sách request + số đo ra log | `npm run test:e2e` |
| Giới hạn chung form ↔ file | Vitest | Cùng một bảng giá trị biên (tên 60/61, why 280/281, daily 1440/1441, giờ tổng 10000/10001, phút entry 1440/1441, note 280/281, khoảng 1827/1828 ngày): validator form (`domain/goal.ts`, `entry.ts`, TS thuần) và `parseBackup` (zod) chấp nhận/từ chối giống nhau | `npm test` |
| Dọn tombstone (ADR-29) | Vitest + fake-indexeddb + `two-devices.ts` | Bảng quy tắc §4.2; rollback; hội tụ hai thiết bị sau khi dọn; thêm thao tác "tua 31 ngày + dọn" vào test ngẫu nhiên 20 seed | `npm test` |

`page.clock` trong spec cloud: chỉ dùng `install`/`fastForward` cho debounce/backoff; request tới mock vẫn là thật. Spec cloud không dùng Google thật; luồng Google thật, project thật, iOS/Android là kiểm thủ công (TASKS "User setup" U10, "NOT VERIFIED" của M6–M8).

Quy ước test song ngữ: component test mặc định render ở `en` (helper `renderWithLocale(ui, 'en' | 'vi')`). Test khẳng định chữ nên lấy chuỗi mong đợi từ resource (`t('toast.entrySaved')`) hoặc ghi literal `en` khi AC ghi literal; giá trị định dạng `vi` so với kết quả `Intl` tính trong test hoặc literal sau khi chuẩn hoá khoảng trắng (U+00A0, U+202F → space), vì chi tiết ICU có thể khác nhẹ giữa Node và Chromium.

## 9. Lệnh chuẩn

Developer phải làm cho tất cả lệnh sau chạy được từ thư mục gốc, trên PowerShell và Git Bash:

| Mục đích | Lệnh |
| :- | :- |
| Cài dependency | `npm ci` (lần đầu tạo lockfile: `npm install`) |
| Cài browser cho e2e (vào `node_modules`, không global) | `npm run e2e:install` → `cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright install chromium` |
| Dev server | `npm run dev` → http://localhost:5173 (SW tắt ở dev) |
| Build | `npm run build` → `tsc -b && vite build`, output `dist/` |
| Preview bản build (có SW/PWA) | `npm run preview` → http://localhost:4173 |
| Lint | `npm run lint` → `eslint . --max-warnings 0` |
| Typecheck | `npm run typecheck` → `tsc -b --noEmit` (hoặc tương đương) |
| Unit + integration | `npm test` → `vitest run` |
| Coverage | `npm run test:coverage` |
| E2E | `npm run test:e2e` → `cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test` (tự build + chạy preview qua `webServer`) |
| Kiểm tra tổng | `npm run check` → lint + typecheck + test + build. **v3.1 (M7-P1):** bước build trong `check` là `npm run build:e2e` (cloud luôn tắt, kết quả giống nhau dù máy có `.env.local` hay không); `npm run build` (dùng `.env.local` nếu có) vẫn là lệnh build chuẩn của CI/deploy (`pages.yml` chạy từng bước riêng, không dùng `check`) |
| Build cho E2E chuẩn (v2.0) | `npm run build:e2e` → `tsc -b && vite build --mode e2e` (cloud tắt dù máy có `.env.local`); `webServer` của project `chromium` đổi sang `npm run build:e2e && npm run preview` |
| Build + preview cloud E2E (v2.0) | `npm run build:cloud-e2e` → `cross-env BASE_PATH=/one-percent-better/ vite build --mode cloud-e2e --outDir dist-cloud-e2e`; `npm run preview:cloud-e2e` → `vite preview --outDir dist-cloud-e2e --port 4174 --strictPort` → http://localhost:4174/one-percent-better/ |
| Mock Supabase (v2.0) | `npm run mock:supabase` → `node e2e/mock-supabase/server.mjs` (cổng 54321); demo tay: chạy lệnh này + `npm run build:cloud-e2e && npm run preview:cloud-e2e` |
| Supabase local (v2.0, cần Docker) | `npm run db:start` → `npx --yes supabase@2.120.0 start`; `npm run db:stop`; `npm run db:reset` (áp lại migration) |
| Test SQL/RLS (v2.0) | `npm run test:db` → `vitest run --config vitest.db.config.ts` (tự bỏ qua có thông báo nếu không có Supabase local) |

## 10. Bảo mật và rủi ro

| Rủi ro | Khả năng | Ảnh hưởng | Giảm thiểu |
| :- | :- | :- | :- |
| Notification không tới khi app đóng hẳn (không có server push; Notification Triggers chưa phát hành, Periodic Background Sync chỉ Chromium và không đúng giờ) | Cao | Trung bình | Giới hạn ghi rõ (NFR-07); banner trong app; file `.ics` cho lịch; push server đưa vào Later (OQ-01). Xử lý sớm ở M2 |
| Notification trên iOS chỉ hoạt động khi đã "Add to Home Screen" (iOS ≥ 16.4); hành vi local notification trên iOS có thể khác Chrome | Cao | Trung bình | Settings hiển thị hướng dẫn; kiểm thủ công trên thiết bị thật, QC ghi `NOT VERIFIED` nếu không có máy |
| Trình duyệt dọn IndexedDB (Safari xoá dữ liệu site không dùng sau 7 ngày nếu chưa cài; áp lực bộ nhớ) | Trung bình | Cao (mất dữ liệu) | `storage.persist()`; khuyến khích cài PWA; export/import (M3); nhắc backup >30 ngày (FR-21) |
| Lỗi ngày/giờ (DST, nửa đêm, năm nhuận, đổi múi giờ khi đi lại) | Trung bình | Trung bình | Lưu ngày dạng `YYYY-MM-DD` cục bộ; mọi phép tính ngày qua date-fns; test năm nhuận 2028, ranh giới năm, timer qua nửa đêm; e2e cố định timezone |
| Timer bị trình duyệt throttle khi tab nền | Cao | Thấp | Không đếm bằng interval; luôn tính `now − startedAt` đã lưu |
| File import độc hại/hỏng | Thấp | Trung bình | Giới hạn 5 MB, `JSON.parse` trong try/catch, zod strict schema, kiểm tra toàn vẹn, transaction; không `eval`, không render HTML từ dữ liệu |
| XSS qua ghi chú/tên goal | Thấp | Trung bình | React escape mặc định; cấm `dangerouslySetInnerHTML` bằng ESLint core rule `no-restricted-syntax` với selector `JSXAttribute[name.name='dangerouslySetInnerHTML']` (không cần thêm `eslint-plugin-react`); QC grep thêm |
| SW cache cũ làm người dùng kẹt ở bản cũ | Trung bình | Thấp | `registerType: 'prompt'` hoặc `autoUpdate` + thông báo "New version available — Reload" |
| Toolchain mới (Vite 8, ESLint 10) có bug | Thấp | Trung bình | Pin exact version; đã chọn dòng ổn định hơn cho Vitest (4.1) và TS (6.0) |
| `page.clock`/`getNotifications()` không quan sát được notification trong headless | Trung bình | Thấp | Unit/integration test scheduler với adapter giả; e2e kiểm qua `registration.getNotifications()`; nếu không được thì QC kiểm thủ công theo bước trong handoff |
| Chuỗi bị hardcode hoặc thiếu bản dịch lọt vào bản build (nhất là chuỗi ngoài JSX: toast, title, notification) | Trung bình | Trung bình | Lint `no-restricted-syntax` cho JSX; parity test; `missingKeyHandler` ném lỗi khi test; quét DOM ở `vi` trong component test và E2E mỗi milestone; key có kiểu (typecheck bắt key sai) |
| Chuỗi tiếng Việt dài hơn gây tràn/xuống dòng xấu ở 360 px (nút, tab bar, stat card) | Trung bình | Thấp | Kiểm viewport 360 px ở `vi-VN` trong E2E (không cuộn ngang); designer chốt copy `vi` ngắn cho tab/nút; layout dùng wrap, không chiều rộng cố định cho chữ |
| Kết quả `Intl` khác nhau giữa Node (Vitest) và trình duyệt, hoặc giữa phiên bản ICU (khoảng trắng hẹp, viết hoa thứ) | Trung bình | Thấp | Test so với `Intl` tính tại chỗ hoặc chuẩn hoá khoảng trắng; phần trăm/phút dùng key i18n thay vì `style: 'percent'`/`unit` |
| Nháy ngôn ngữ khi khởi động (hiện `en` rồi đổi `vi`) | Thấp | Thấp | Đọc kv `locale` trước khi render router (§5.8); màn đầu tiên có 150 ms không hiển thị nội dung |
| Nhiều tab cùng mở ghi đua nhau (bấm Save timer đồng thời → 2 entry; hai tab cùng gửi nhắc) | Thấp | Trung bình (entry trùng làm sai thống kê) | Khoá trong tab bằng `Mutex`; giữa tab dựa vào transaction IndexedDB: `KvRepository.update` (ADR-14), claim-trước-gửi (ADR-15, đã làm M2), `TimerRepository.saveTimerEntry` (ADR-16, M3). Còn lại chấp nhận được: hai tab cùng `add` thủ công cùng goal/ngày có thể vượt 1440 phút một chút (kiểm giới hạn ngoài transaction) — Later nếu cần |
| Mã lỗi/notification sinh chữ trong service làm lẫn lớp | Thấp | Thấp | Domain chỉ trả dữ liệu; service chỉ dùng interface `Translator`; lint chặn import `i18next` ngoài `src/i18n` và `src/ui` (qua `react-i18next`) |
| **(v2.0)** Nâng Dexie v1 → v2 làm hỏng/mất dữ liệu thật của user đang dùng bản phase 1 | Thấp | Cao | `upgrade()` chỉ thêm field; transaction `versionchange` rollback khi lỗi; test migration với S1 + E2E dựng DB v1 bằng API thô; khuyến nghị user Export backup trước khi deploy M7 (README, TASKS "User setup" U0) |
| Callback OAuth hỏng trên GitHub Pages sub-path + hash routing (token rơi vào `#`, mất `code`, reload đổi code lần hai, SW trả bản cache) | Trung bình | Cao | PKCE (code ở query), `redirectTo` không có hash, `returnTo` qua `sessionStorage`, xoá query ngay sau khi đọc; E2E cloud chạy trên `/one-percent-better/` với mock; kiểm thủ công trên bản deploy (U10). Xử lý ở **M6** (rủi ro lớn nhất, làm sớm) |
| iOS: PWA đã cài (standalone) mở trang Google trong Safari/khung riêng, code verifier ở storage khác → exchange lỗi | Trung bình | Trung bình | Báo `AUTH_FAILED` rõ ràng, dữ liệu không đổi; README khuyên đăng nhập trên Safari thường (cùng origin, phiên dùng chung với PWA trên iOS ≥ 16.4 không được bảo đảm) rồi mở app; `NOT VERIFIED` cho tới khi user thử trên máy thật |
| Đồng bộ sai: mất thay đổi offline, ghi đè bản mới bằng bản cũ, xoá không lan truyền, entry mồ côi | Trung bình | Cao | Quy tắc LWW một chỗ (`domain/sync.ts`) + trigger SQL cùng quy tắc; bộ test hợp đồng chung cho Fake/mock/Supabase local; test hai thiết bị + test ngẫu nhiên 20 seed; `applyRemote` trong transaction; cursor ghi sau khi áp |
| Lệch đồng hồ giữa thiết bị làm LWW chọn sai | Trung bình | Trung bình | `nextUpdatedAt` luôn > phiên bản đang có trên máy; cursor kéo theo `server_updated_at` (đồng hồ server); chấp nhận phần còn lại (A-24) |
| Bất biến bị phá sau khi gộp (tổng > 1440 phút/ngày, entry ngoài khoảng goal) | Thấp | Thấp | A-25: hiển thị như dữ liệu, không tự sửa; validate cho lần ghi mới; thống kê không crash (test với dữ liệu vi phạm) |
| Supabase Free tạm dừng project sau ~7 ngày không hoạt động; quota/egress | Trung bình | Trung bình | App offline-first (NFR-15) nên vẫn dùng được; chỉ báo lỗi; README hướng dẫn khôi phục project; dữ liệu cục bộ vẫn đủ |
| SDK Supabase làm phình bundle ban đầu (> 250 KB) hoặc bị `modulepreload` | Trung bình | Trung bình | Chỉ `import()` trong `loader.ts`; lint cấm import tĩnh; E2E kiểm không có request chunk khi chưa đăng nhập; đo gzip trong handoff |
| Lộ secret (`service_role`) hoặc người lạ đọc dữ liệu | Thấp | Cao | Chỉ publishable key ở client; RLS + grant tối thiểu, không DELETE; trigger ép `user_id = auth.uid()`; `git grep` trong AC; test RLS (Docker) hoặc kiểm thủ công U10 (máy hiện tại không có Docker → bắt buộc kiểm tay); OQ-06 đã quyết không giới hạn đăng ký, nên RLS là lớp bảo vệ duy nhất giữa các tài khoản |
| Token phiên trong `localStorage` bị đọc qua XSS | Thấp | Cao | Giữ NFR-05 (không render HTML từ dữ liệu, kể cả dữ liệu kéo từ cloud); không thêm script bên thứ ba; CSP bằng `<meta>` để Later |
| Mock Supabase lệch hành vi thật (E2E xanh nhưng production lỗi) | Trung bình | Trung bình | Bộ test hợp đồng chạy cả với Supabase local; giữ mock tối thiểu theo đúng request SDK gửi; kiểm thủ công trên project thật (U10) trước khi coi phase 2 xong |
| Existing E2E (347 test) bị ảnh hưởng khi máy QC có `.env.local` thật | Trung bình | Trung bình | Build E2E chuẩn dùng `--mode e2e` + `.env.e2e` ép cloud tắt; spec cloud tách project riêng |
| (v2.1) Nhắc được bật từ máy khác nhưng máy này chưa cấp quyền notification → người dùng tưởng sẽ có notification | Trung bình | Thấp | Banner trong app vẫn hoạt động (FR-15); Settings hiện chip quyền + nút "Allow notifications"; không tự xin quyền |
| (v2.1) Thiết bị mới ghi đè ngôn ngữ/giờ nhắc của tài khoản bằng giá trị mặc định | Thấp | Thấp | Mốc `null` = chưa chọn → cloud luôn thắng; chỉ thao tác của người dùng mới đặt mốc; test bảng quy tắc §4.4 |
| Nhiều tab cùng đồng bộ gây request trùng | Trung bình | Thấp | Web Locks (`opb-sync`), không hỗ trợ thì chạy song song vẫn đúng (LWW idempotent, `applyRemote` trong transaction) |
| (v3.1) Bundle tải lạnh lại phình dần tới 250 KB khi thêm tính năng | Cao | Trung bình | Ngân sách làm việc 230 KB có spec Playwright riêng (fail khi vượt); lint chặn `zod` ngoài hai biên lazy; quy tắc ADR-27: tính năng không cần cho Today phải nằm sau `import()` |
| (v3.1) Lần Import đầu tiên khi offline mà chunk schema chưa có trong cache | Thấp | Thấp | Chunk nằm trong precache của SW (`globPatterns` `**/*.js`) nên có sau lần cài đầu; nạp lỗi → thông báo lỗi đọc file, dữ liệu không đổi; E2E import offline |
| (v3.1) Dọn tombstone làm bản ghi đã xoá "sống lại" | Thấp | Thấp | Chỉ dọn hàng đã được cloud xác nhận (`dirty = 0`, cloud giữ tombstone và LWW chặn bản cũ hơn), bị từ chối (`dirty = 2`), hoặc trên máy chưa từng đồng bộ; ngưỡng 30 ngày; test hội tụ + ngẫu nhiên; ca biên còn lại ghi ở A-34 |
| (v3.1) Hai cách validate (TS thuần cho form, zod cho file/cloud) lệch giới hạn (bài học M7-D1) | Trung bình | Trung bình | Mọi giới hạn lấy từ `config/constants.ts`; test "giới hạn chung form ↔ file" (§8) |

## 11. Quyết định kiến trúc

**ADR-01 — Local-first với IndexedDB (Dexie) sau repository interface.**
Bối cảnh: 1 user, không server, nhưng muốn thêm sync sau này. Lựa chọn: Dexie trong `src/data/dexie`, mọi truy cập qua interface ở `src/data/repositories.ts`; bản ghi có UUID + `createdAt`/`updatedAt`. Hệ quả: thêm sync sau = thêm implementation/adapter mới, không sửa domain/UI; chưa có tombstone cho xoá (cần thêm khi làm sync).

**ADR-02 — Hash routing.**
Bối cảnh: chưa chốt hosting (OQ-02), PWA offline cần navigation fallback. Lựa chọn: `createHashRouter`. Hệ quả: chạy trên mọi static host không cần rewrite; URL có `#`.

**ADR-03 — Nhắc nhở phía client, không server.**
Bối cảnh: quyết định "không server"; không có API web chuẩn để lên lịch notification cục bộ. Lựa chọn: scheduler trong app (khởi động, mỗi 60 s, `visibilitychange`) + `ServiceWorkerRegistration.showNotification` + banner trong app + file `.ics`. Hệ quả: chỉ đảm bảo khi app mở; ghi rõ cho user; nâng cấp lên Web Push cần server (Later).

**ADR-04 — Nhiều entry mỗi ngày (theo phiên).**
Bối cảnh: timer tạo nhiều phiên trong ngày. Lựa chọn: `LogEntry` là một phiên; tổng ngày = tổng các entry. Hệ quả: giữ được lịch sử phiên; cần ràng buộc tổng ≤ 1440 phút/goal/ngày.

**ADR-05 — Ngày là chuỗi `YYYY-MM-DD` theo giờ cục bộ.**
Bối cảnh: "một ngày" theo cảm nhận người dùng là ngày cục bộ. Lựa chọn: lưu chuỗi ngày, timestamp chỉ dùng cho `createdAt/updatedAt/startedAt`. Hệ quả: tránh lỗi lệch ngày do UTC; nếu user đổi múi giờ, entry giữ ngày đã ghi.

**ADR-06 — Service worker `injectManifest` viết bằng TypeScript.**
Bối cảnh: cần precache cho offline và handler `notificationclick`. Lựa chọn: `vite-plugin-pwa` strategy `injectManifest`, file `src/sw.ts` dùng `workbox-precaching`. SW chỉ bật ở bản build (`devOptions.enabled = false`). Hệ quả: e2e chạy trên `vite preview`.

**ADR-07 — Thống kê tính khi đọc, không lưu.**
Bối cảnh: dữ liệu nhỏ (vài nghìn entry). Lựa chọn: hàm thuần trong `domain/stats.ts`, `heatmap.ts`, `curve.ts`, có benchmark (NFR-03). Hệ quả: không có dữ liệu suy ra bị lệch; nếu chậm thì memo theo (goalId, year).

**ADR-08 — Import thay thế toàn bộ.**
Bối cảnh: merge cần giải quyết xung đột. Lựa chọn: validate đầy đủ rồi `replaceAll` trong một transaction sau khi user xác nhận. Hệ quả: đơn giản, an toàn; merge vào Later.

**ADR-09 — Chọn version toolchain theo môi trường Node 22.14.**
Bối cảnh: một số bản mới nhất yêu cầu Node ≥ 22.22 hoặc chưa được hệ sinh thái hỗ trợ. Lựa chọn: react-router 7.18.4 (không 8.x), jsdom 26.1.0 (không 30.x), TypeScript 6.0.x (không 7.0), Vitest 4.1.11 (không 5.0). Hệ quả: không cần nâng Node; nâng cấp sau khi đổi Node.

**ADR-10 — Biểu đồ lazy-load, heatmap tự vẽ.**
Bối cảnh: NFR-03 giới hạn bundle ban đầu. Lựa chọn: Recharts chỉ import trong route lazy (Review, Goal detail); heatmap là component SVG/CSS grid riêng. Hệ quả: Today mở nhanh; heatmap kiểm soát hoàn toàn a11y và test.

**ADR-11 — i18n bằng `i18next` + `react-i18next`, resource đóng gói tĩnh, không language detector plugin.**
Bối cảnh: Gate 2 yêu cầu song ngữ `en`/`vi`, đổi ngay không reload, không request ngoài, cần số nhiều và nội suy, key kiểm tra được bằng typecheck. Lựa chọn: `i18next` 26.4.2 + `react-i18next` 17.0.16; `en.json`, `vi.json` import tĩnh trong `src/i18n/instance.ts` (cả hai vào bundle chính, mỗi file vài KB gzip, có sẵn offline qua precache); phát hiện ngôn ngữ bằng hàm thuần `detectLocale` (không dùng `i18next-browser-languagedetector`); định dạng bằng `Intl` qua `src/i18n/format.ts`. Hệ quả: thêm ≈ 20 KB gzip vào bundle ban đầu (vẫn trong 250 KB); thêm ngôn ngữ sau này = thêm một file JSON + mở rộng `Locale`; nếu bundle chật có thể chuyển sang lazy-load resource của ngôn ngữ không dùng.

**ADR-12 — Lựa chọn ngôn ngữ là thiết lập thiết bị, lưu ở kv key `locale`.**
Bối cảnh: quyết định của user là lưu cục bộ trong kv store; import thay thế toàn bộ dữ liệu (ADR-08) không nên đổi ngôn ngữ của máy đích. Lựa chọn: key riêng `locale` trong store `kv`, không nằm trong `Settings`, không export, `replaceAll` không chạm tới; chỉ ghi khi người dùng chọn. Hệ quả: định dạng file backup giữ `schemaVersion: 1`; không cần migration Dexie; chuyển máy thì người dùng chọn lại ngôn ngữ (hoặc theo trình duyệt).

**ADR-13 — Domain không biết ngôn ngữ; chữ chỉ sinh ở UI hoặc qua `Translator`.**
Bối cảnh: notification và `.ics` sinh ngoài React; mã lỗi đã tách khỏi message (§5.4). Lựa chọn: domain trả mã lỗi + dữ liệu có cấu trúc; `ReminderService` (và nơi sinh `.ics`) nhận `Translator` từ composition root; UI dịch bằng hook. Hệ quả: domain test không phụ thuộc copy; đổi copy không làm vỡ test domain; service test dùng `Translator` giả hoặc instance i18n thật.

**ADR-14 — `KvRepository.update` là read-modify-write nguyên tử (M2).**
Bối cảnh: app có thể mở ở nhiều tab; chuỗi `get` → tính → `set` ở hai tab đọc cùng giá trị cũ rồi ghi đè nhau (QC M2 phát hiện hai tab cùng gửi nhắc). `Mutex` chỉ tuần tự trong một JS context. Lựa chọn: `update<T>(key, fn)` chạy đọc, gọi `fn`, ghi trong **một** transaction `rw` trên store `kv` (IndexedDB tuần tự hoá các transaction `rw` chồng phạm vi, kể cả giữa các tab); `fn` trả `undefined` = không ghi; trả `{ previous, written }`. Hệ quả: service dựng được "claim-if-absent", "release-if-equals" mà không biết Dexie; `fn` phải đồng bộ, thuần, không await (tránh transaction tự commit sớm). **Ràng buộc:** mọi `KvRepository` không phải Dexie (adapter sync, storage khác) phải cung cấp `update` có cùng bảo đảm (transaction, compare-and-set, hoặc khoá xuyên tiến trình); khoá trong bộ nhớ không đạt. Test hợp đồng: 20 `update` đồng thời không mất lần nào; hai instance repository trên cùng DB, claim đồng thời → đúng một `written: true`.

**ADR-15 — Nhắc nhở: claim ngày trước, gửi sau, hoàn claim khi gửi hỏng (M2).**
Bối cảnh: FR-14 cho tối đa 1 notification/ngày; cách cũ "gửi xong mới ghi `lastReminderDate`" để hở khoảng hai tab cùng thấy `shouldNotify = true`. Lựa chọn: `ReminderService.check` → `shouldNotify` → `SettingsService.claimReminderDay(today)` (dùng ADR-14; thua claim thì dừng) → `show` → nếu `show` trả `false` hoặc ném lỗi thì `releaseReminderDay(today, previous)` (chỉ hoàn nếu giá trị vẫn là `today`). Hệ quả: bảo đảm **at-most-once** mỗi ngày giữa các tab; hành vi bên ngoài không đổi (`check` trả boolean, ngày chỉ được đánh dấu khi đã hiển thị). Đánh đổi chấp nhận: nếu tab bị đóng giữa claim và show, hôm đó mất nhắc (không gửi lại); tab đã thua claim chỉ thử lại ở chu kỳ kế tiếp sau khi tab kia hoàn claim.

**ADR-16 — Lưu timer là một transaction trên `goals` + `entries` + `kv` (M3).**
Bối cảnh: `TimerService.save` hiện gọi `EntryService.add` (ghi `entries`) rồi `kv.delete('activeTimer')` ở hai transaction riêng; hai tab bấm Save cùng lúc đều thấy timer và tạo 2 entry; đây cũng là ghi đa bảng chưa nguyên tử (NFR-04). Lựa chọn: interface `TimerRepository.saveTimerEntry(expected, entry, maxDayMinutes)` (§5.2): trong một transaction `rw` kiểm `activeTimer` còn đúng là timer đã đọc (goalId + startedAt), goal còn tồn tại, tổng phút ngày còn trong giới hạn, rồi ghi entry và xoá `activeTimer`. Validate field/ngày vẫn ở domain/`EntryService` trước khi vào transaction; các điều kiện có thể bị tab khác làm đổi được kiểm lại trong transaction. Hệ quả: hai Save đồng thời (cùng tab hay khác tab) → đúng 1 entry, lần còn lại `TIMER_NOT_RUNNING`; Save đua Discard → tối đa 1 entry; repository mới phải giữ bảo đảm này (ràng buộc §5.2). `Mutex` trong `TimerService` giữ nguyên (rẻ, giữ thứ tự trong tab). Implementation Dexie không được await promise ngoài Dexie trong transaction.

**Ghi chú v2.0 cho ADR cũ.** ADR-01: tombstone (`deletedAt`) và `dirty` được thêm ở M7 (ADR-20), interface repository giữ nguyên. ADR-08: import vẫn "thay thế toàn bộ", nay thực hiện bằng xoá mềm để lan truyền lên cloud. ADR-10: service worker precache cả chunk lazy (Recharts, Supabase) sau khi cài — đã chấp nhận ngày 2026-10-10 (offline-first); ngân sách 250 KB chỉ áp cho tải trang ban đầu. ADR-12: `locale` vẫn lưu ở kv riêng, không có trong file backup, import không ghi đè; **v2.1:** khi đã đăng nhập, `locale` được đồng bộ qua bảng `settings` (ADR-25).

**ADR-17 — Supabase làm backend tuỳ chọn, bật theo cấu hình build (v2.0).**
Bối cảnh: user muốn lưu goal/quá trình trên cloud nhưng login phải tuỳ chọn; chưa có backend; app là static site trên GitHub Pages. Lựa chọn: Supabase gói Free (Auth Google + Postgres + RLS + PostgREST), client gọi trực tiếp, không server riêng; bật khi có `VITE_SUPABASE_URL` + key hợp lệ lúc build, ngược lại `cloud = null` và app giống phase 1. Hệ quả: không phải vận hành server; bảo mật dựa hoàn toàn vào RLS + grant (phải test); push code trước khi user setup là an toàn; phụ thuộc giới hạn Free (tạm dừng khi không hoạt động, A-31).

**ADR-18 — SDK Supabase nạp lười; nhận biết phiên mà không cần SDK (v2.0).**
Bối cảnh: NFR-03 (≤ 250 KB gzip ban đầu, hiện ≈ 215 KB); đa số lần mở app không cần cloud. Lựa chọn: chỉ `integration/supabase/loader.ts` gọi `import('./supabase-client')`; `storageKey: 'opb-auth'` cố định để `hasStoredSession()` chỉ cần đọc `localStorage`; nạp khi bấm đăng nhập, có callback, hoặc có phiên; thông tin tài khoản hiển thị từ kv `sync.account` trong lúc chờ. Hệ quả: người không đăng nhập không tải SDK, không request ngoài; có thêm một bước chờ (vài trăm ms) trước lần sync đầu sau khởi động; lint cưỡng chế import.

**ADR-19 — OAuth PKCE, callback bằng query trên base URL (v2.0).**
Bối cảnh: hash routing (`#/…`) và sub-path `/one-percent-better/`; flow mặc định `implicit` của SDK trả token trong fragment, xung đột router và lộ token trong URL. Lựa chọn: `flowType: 'pkce'`, `redirectTo = <origin><BASE_URL>?auth=callback` (không hash), `detectSessionInUrl: false`, app tự đọc `code`/`error`, xoá query bằng `history.replaceState`, quay về `returnTo` (sessionStorage). Supabase Redirect URLs (project thật, TASKS U5): `https://minh-lgm.github.io/one-percent-better/**`, `http://localhost:4173/**`, `http://localhost:5173/**` (cổng 4174 chỉ dùng với mock, mock tự cho phép `http://localhost:*`). Hệ quả: router không đổi; code dùng một lần, 5 phút; đổi trình duyệt giữa chừng (iOS PWA) → `AUTH_FAILED` (rủi ro §10).

**ADR-20 — Offline-first: IndexedDB là nguồn chính, đánh dấu `dirty`, xoá mềm (v2.0).**
Bối cảnh: app phải chạy đủ khi offline/không đăng nhập; cần biết bản ghi nào chưa lên cloud và lan truyền việc xoá. Lựa chọn: Dexie v2 thêm `deletedAt` + `dirty` (index) vào `goals`, `entries`; repository giữ chữ ký cũ nhưng xoá mềm và lọc tombstone; mọi ghi đặt `dirty = 1` (kể cả khi chưa đăng nhập — đăng nhập lần đầu tự thành gộp); không FK `entries.goal_id` trên server (thứ tự đến của hàng không bảo đảm), thay bằng lọc entry của goal đã xoá khi đọc + dọn mồ côi cuối chu kỳ. Hệ quả: UI/service/domain gần như không đổi; tombstone tích luỹ (nhỏ, dọn để Later); mọi truy vấn entry phải lọc theo goal sống (test benchmark NFR-03 lại).

**ADR-21 — Last-write-wins theo bản ghi, `updatedAt` đơn điệu, tie → server, quy tắc chung client/server (v2.0).**
Bối cảnh: một người dùng, vài thiết bị, xung đột hiếm; cần đơn giản, kiểm chứng được. Lựa chọn: so `updatedAt` (thời điểm, không so chuỗi); server (trigger `sync_before_write`) nhận bản đến khi `updatedAt` **lớn hơn** bản đang có, client (`resolveIncoming`) nhận bản server khi `updatedAt` **lớn hơn hoặc bằng** (nên bằng nhau thì cả hai theo server); xoá là một lần sửa; `nextUpdatedAt` chống lệch đồng hồ cục bộ; con trỏ kéo theo `server_updated_at` với cửa sổ lùi 120 s; sau mỗi lần đẩy đọc lại bản chuẩn theo id để thiết bị biết khi nó thua. Hệ quả: hội tụ bảo đảm (mọi bên áp cùng một thứ tự toàn phần); sửa đồng thời khác field vẫn mất một bên (chấp nhận, A-24); goal đã xoá có thể sống lại nếu có bản sửa mới hơn; không cần RPC riêng.

**ADR-22 — Chỉ đồng bộ goal và entry (v2.0).**
Bối cảnh: user nêu "target và process"; thiết lập như giờ nhắc, quyền notification, ngôn ngữ, timer gắn với thiết bị; đồng bộ blob settings sinh xung đột khó hiểu. Lựa chọn: bảng `goals`, `entries`; kv giữ nguyên cục bộ (§4.4). Hệ quả: schema đơn giản; muốn đồng bộ thêm thiết lập thì thêm bảng `user_settings` (Later, OQ-07). **Thay thế một phần bởi ADR-25 (v2.1):** user quyết định đồng bộ cả nhắc nhở và ngôn ngữ; phần còn lại của ADR này (không đồng bộ trạng thái riêng của thiết bị) vẫn giữ.

**ADR-25 — Đồng bộ tuỳ chọn người dùng: một hàng `settings`/user, hai nhóm LWW độc lập (v2.1).**
Bối cảnh: OQ-07 — user muốn giờ nhắc/bật-tắt nhắc và ngôn ngữ theo tài khoản. LWW cả hàng sẽ làm máy B (offline, chỉ đổi giờ nhắc) ghi đè ngôn ngữ mới của máy A bằng giá trị cũ của B. Thiết bị mới với giá trị mặc định không được ghi đè lựa chọn có sẵn trên cloud. Lựa chọn: bảng `settings` (PK `user_id`) với nhóm `reminder` (`reminder_enabled`, `reminder_time`, `reminder_updated_at`) và nhóm `locale` (`locale`, `locale_updated_at`); trigger `settings_before_write` áp LWW **theo nhóm** (nhóm gửi `null` hoặc không mới hơn → giữ cũ; tie → server); cục bộ giữ giá trị ở chỗ cũ (kv `settings`, kv `locale`) và mốc ở kv `prefsSync`, ghi cùng transaction qua `SyncedPrefsRepository`; "chưa từng chọn" = mốc `null` → cloud thắng; lựa chọn từ phase 1 mang mốc 1970 (A-36). Hệ quả: không cần con trỏ (một hàng); không thêm field vào kiểu `Settings`/file backup; thêm một kv key; trạng thái riêng của thiết bị (`lastReminderDate`, `plusOneShown`, `lastBackupAt`, timer, quyền notification) vẫn cục bộ; bật nhắc từ cloud không tự xin quyền (cần cử chỉ người dùng).

**ADR-23 — Kiểm thử không cần project thật: Fake + mock HTTP + Supabase local tuỳ chọn (v2.0).**
Bối cảnh: QC/dev không có tài khoản Supabase/Google thật; Docker có thể không có. Lựa chọn: interface `AuthPort`/`RemoteStore`/`LockPort` cho service test; mock Supabase Node (OAuth PKCE + tập con PostgREST + RLS giả) cho E2E trên sub-path; một bộ test hợp đồng `RemoteStore` chạy với Fake, mock, và Supabase local (`npm run test:db`, cần Docker). Hệ quả: CI/QC chạy được toàn bộ test mặc định; độ tin cậy với Supabase thật phụ thuộc test hợp đồng + kiểm thủ công (danh sách NOT VERIFIED rõ ràng ở TASKS).

**ADR-24 — Đăng nhập lần đầu = gộp; đăng xuất hỏi giữ/xoá, mặc định giữ (v2.0).**
Bối cảnh: user chốt "merge, không xoá"; máy dùng chung cần xoá được. Lựa chọn: bản ghi cục bộ đã `dirty = 1` nên chu kỳ đầu tự đẩy lên; đổi sang tài khoản khác thì hỏi và `markAllDirty`; đăng xuất: hộp thoại giữ (mặc định)/xoá (`clearUserData` một transaction), thử sync lần cuối trước. Hệ quả: không bao giờ mất dữ liệu do đăng nhập; dữ liệu của tài khoản cũ có thể bị gộp sang tài khoản mới nếu người dùng chọn "Add to account" (có cảnh báo số lượng).

**ADR-26 — Đường cong "Bạn" = tỉ lệ phút so với ngày có ghi trước, nhân dồn, tính bằng tỉ số trực tiếp (v3.0, M9).**
Bối cảnh: user xem Goal detail thật và thấy định nghĩa M5 (1.01^n, n = số ngày đạt chỉ tiêu) không khớp ý "better per day": user muốn so số phút hôm nay với ngày trước (5 → 6 phút = +20%), nhân dồn từ ngày đầu, ngày 0 phút đi ngang (quyết định 2026-10-13). Lựa chọn: `actual(d) = m(ngày có ghi gần nhất ≤ d) / m(ngày đầu có ghi)` (tương đương tích telescoping), tính trực tiếp từ hai số nguyên; làm tròn % nửa xa 0; contract `CurveData` đổi field (§4.5); trục Y tự co giãn theo cả hai series qua `curveYDomain`; đường lý tưởng và Range (A-D4) giữ nguyên. Phương án đã loại: (1) nhân dồn số thực từng ngày — sai số tích luỹ, kết quả giống hệt về toán; (2) so với "hôm qua" theo lịch (ngày 0 phút thành mẫu số 0 → vô nghĩa) — user chốt so với ngày có ghi gần nhất; (3) baseline = trung bình vài ngày đầu — user chốt ngày đầu. Hệ quả: đường cong không còn phụ thuộc chỉ tiêu ngày (A-42); có thể âm; một ngày ghi nhiều bất thường làm headline nhảy lớn (đúng định nghĩa); "+1%" trên Today vẫn theo chỉ tiêu (hai khái niệm tách biệt, copy phải nói rõ); test M5 về giá trị đường cong được thay bởi test M9 (TASKS M9).

**ADR-27 — Chiến lược chunk: zod chỉ ở biên lazy, ngân sách làm việc 230 KB cho tải lạnh Today (v3.1, M10).**
Bối cảnh: sau M9, tải lạnh `#/today` (JS + CSS + HTML, gzip 9, cách đo `tests/qc/final-nfr.spec.ts`) là 248,3 KB / ngưỡng 250 KB (F2-R1). Phần lớn nhất có thể bỏ là chunk `schemas-*.js` (zod, ≈ 34 KB gzip) bị Rolldown tách tự động nhưng vẫn `modulepreload`, vì đường tải lạnh import zod qua bốn chỗ: `config/env.ts` (parse lúc nạp module), `domain/goal.ts`, `domain/entry.ts` (vài schema số/chuỗi đơn giản) và `domain/backup.ts` (Today/Settings import `backupReminder`, `BACKUP_MIME_TYPE` từ đây). Lựa chọn: (1) `env.ts`, `goal.ts`, `entry.ts` kiểm bằng TypeScript thuần, giữ nguyên chữ ký, mã lỗi, `params`, giới hạn (từ `config/constants.ts`); (2) tách phần không zod của backup sang `domain/backup-file.ts`; `domain/backup.ts` (zod) chỉ được `BackupService.parse` nạp bằng `import()` (memo), nên `parse` thành async; (3) mapper cloud giữ zod trong chunk Supabase vốn đã lazy; (4) lint cấm `zod` ngoài `domain/backup.ts` và `integration/supabase/**`; (5) không cần `manualChunks`: ranh giới chunk do `import()` quyết định, spec ngân sách kiểm kết quả (nếu Rolldown gộp module lazy vào chunk dùng chung bị preload, mới thêm `manualChunks`/`advancedChunks` có chủ đích và ghi handoff); (6) ngân sách làm việc 230 KB (PRD NFR-03 v3.1) có spec Playwright riêng; ngưỡng cứng 250 KB giữ nguyên. Phương án đã loại: chuyển sang `zod/mini` (viết lại toàn bộ schema theo API hàm, form vẫn kéo zod vào đường tải lạnh, mức giảm không chắc); nâng ngưỡng 250 KB (chỉ hoãn vấn đề, trái NFR-03); lazy-load file dịch của ngôn ngữ không dùng (chỉ vài KB, thêm nguy cơ nháy ngôn ngữ — ADR-11 để ngỏ cho sau); đổi React sang Preact (thay đổi lớn, rủi ro cao); chỉ dùng `manualChunks` (không đưa zod ra khỏi đường tải lạnh). Hệ quả: dự kiến tải lạnh ≈ 214–216 KB (dư ≈ 34 KB dưới 250); lần Import đầu tải thêm ≈ 35 KB (đã precache nên vẫn offline); `BackupService.parse` đổi chữ ký sang Promise — test gọi đồng bộ phải `await` (test QC: re-target, TASKS M10); có hai kiểu validate (TS cho form, zod cho file/cloud) nên phải có test "giới hạn chung form ↔ file" để không lặp lại M7-D1.

**ADR-28 — Hàng bị cloud từ chối: `dirty = 2` (v3.1 ghi nhận quyết định M7-D1, 2026-10-12).**
Bối cảnh: dữ liệu cũ trên máy có thể vi phạm ràng buộc cloud (vd. id > 64 ký tự import trước M7); đổi id phá liên kết giữa các thiết bị, xoá thì mất dữ liệu; đẩy lại mãi thì một hàng hỏng chặn cả lô. Lựa chọn: `RemoteStore.push` trả `rejected` (kiểm từng hàng bằng schema trước khi gửi; server trả 400 SQLSTATE 22xxx/23xxx thì tách đôi lô tới từng hàng); `LocalSyncStore.markRejected` đặt `dirty = 2`: hàng vẫn dùng bình thường và có trong Export, không đếm vào "đang chờ", không đẩy lại tới khi người dùng sửa (→ `dirty = 1`), `markAllDirty` thử lại một lần; `SyncStatus.rejected` + `remoteSkipped` để card Account và D4 nói đúng nguyên nhân (key `settings.account.localRejected_*`, `auth.signOut.rejected*`, `removeDescRejected` — copy chốt ở DESIGN v3.1). Importer từ chối id > 64 ngay (`IMPORT_INVALID_SCHEMA`), một hằng `ID_MAX` dùng chung cho importer và mapper. Hệ quả: không mất dữ liệu, chu kỳ đồng bộ không bị chặn; người dùng tự sửa bằng Export → sửa id → Import; tombstone `dirty = 2` được dọn theo ADR-29.

**ADR-29 — Dọn tombstone cục bộ sau 30 ngày (v3.1, M10; thay phần "tombstone tích luỹ, dọn để Later" của ADR-20 và A-34 cũ).**
Bối cảnh: xoá mềm (ADR-20) để lan truyền việc xoá; khi cloud tắt hoặc chưa đăng nhập, tombstone không bao giờ được dùng nhưng ở lại IndexedDB mãi (QC M7 r1 §9.3), làm chậm các truy vấn lọc `isLive` và giữ dữ liệu người dùng đã xoá trên đĩa. Lựa chọn: xoá cứng tombstone khi `deletedAt` cũ hơn 30 ngày **và** một trong: `dirty = 0` (cloud đã nhận: server giữ tombstone, trigger LWW chặn bản cũ hơn, nên thiết bị khác vẫn nhận được việc xoá từ server), `dirty = 2` (cloud không bao giờ có hàng này), hoặc thiết bị chưa từng đồng bộ (`sync.userId` và `sync.lastUserId` đều `null` — không ai cần tombstone). Không dọn `dirty = 1` trên thiết bị đã từng đồng bộ (đăng nhập lại cùng tài khoản phải đẩy được việc xoá, A-33). Quy tắc là hàm thuần ở `domain/sync.ts`; `LocalSyncStore.purgeTombstones` làm trong một transaction, đọc kv `sync` trong cùng transaction (đua với đăng nhập vẫn đúng); chạy một lần mỗi lần khởi động, không chặn render. Cloud không đổi (không có DELETE; dọn cloud vẫn Later). Phương án đã loại: dọn ngay khi `dirty = 0` (thiết bị khác đang offline lâu vẫn đúng nhờ server, nhưng mất khả năng tự kiểm khi gỡ lỗi; 30 ngày rẻ); dọn cả `dirty = 1` sau N ngày (mất việc xoá khi đăng nhập lại); dọn trong chu kỳ sync (cloud tắt thì không có sync). Hệ quả: dung lượng và chi phí lọc giảm; entry sống mồ côi (goal đã bị dọn) vẫn bị ẩn vì goal không sống; ca biên "sống lại" ghi ở A-34; `applyRemote` có thể chèn lại tombstone kéo về (cửa sổ lùi 120 s, đổi tài khoản) — vô hại, sẽ được dọn lần sau.

**ADR-30 — Ghi nhận các deviation phase 2/3 đã được chấp nhận (v3.1).**
Bối cảnh: một số hành vi đã ship khác chữ của plan/design và đã được QC/orchestrator chấp nhận; ghi vào contract để các milestone sau không "sửa lại cho đúng plan". Lựa chọn (mỗi mục là contract từ v3.1):
- (a) **D7 (M7, STATUS 2026-10-12):** `prepareFirstSignIn` so với `sync.lastUserId` = tài khoản **gần nhất** đã đồng bộ. Đăng nhập lại cùng tài khoản ngay sau Sign out (Keep) → không hỏi D5; đã gộp sang tài khoản B rồi quay lại A → hỏi D5 (vì `lastUserId = B`). Cancel ở D5 giữ `lastUserId` cũ (`preserveLastUserId`).
- (b) **OQ-D12 (M8, A-44):** `claimExportHint` chỉ chạy khi online; offline → không hint, không tiêu lượt.
- (c) **Sync protocol (M7 D1–D3):** `pull` là keyset chính xác, cửa sổ lùi 120 s áp một lần ở đầu chu kỳ (`rewindCursor`) để phân trang > 500 hàng không lặp; `pullPrefs` trả `{ prefs, skippedInvalid }`; chu kỳ đẩy **lại** sau bước dọn nếu còn dirty (để "sync A, B, A" hội tụ với `pending = 0`).
- (d) **Toast (M7 D9):** vùng toast chỉ hiện một thông báo; lần đăng nhập đầu có dữ liệu gộp → `toast.mergeDone` thay cho "Signed in as …" (`willAnnounceMerge()` chỉ `true` sau khi chu kỳ gộp thành công); `Sync now` áp tuỳ chọn từ cloud → giữ `prefsFromAccount`, bỏ `syncNowDone`.
- (e) **Nhắc đăng nhập (M8 D1–D3, D5):** `LoginPromptService` đọc dữ liệu qua `StatsService` (không thêm hàm repository); Today dùng `watchData()` + `watchState()` + hàm thuần `shouldShowLoginPrompt`; banner giữ trạng thái `busy` khi bấm Google từ banner; hint sau Export tồn tại tới khi rời Settings.
- (f) **Đường cong (M9 D1, D5):** `curveYScale` bọc `curveYDomain` để trả thêm `ticks`/`step` (chữ ký `curveYDomain` không đổi); formatter `decimal3` bị bỏ.
- (g) **Brand (M7, orchestrator 2026-10-12/13):** brand mark là ảnh logo trên ô trắng bo góc (32/28 px, cả hai theme) thay cho ô xanh chữ "1%"; chữ cạnh mark là `app.name`; chi tiết hình ảnh do DESIGN v3.1 ghi.
- (h) **Precache (2026-10-10):** đã ghi ở ghi chú ADR-10 (SW precache chunk lazy; ngân sách chỉ áp tải trang ban đầu) — giữ.
- (i) **Mock** `/__test/token` nhận `email`/`name` để test tạo phiên hợp lệ với danh tính tuỳ ý (M7).
Hệ quả: QC/dev đối chiếu các hành vi trên với ADR này, không coi là defect; thay đổi chúng cần revise plan.

## Changelog

- 2026-10-09 — v1, tạo mới (mode `new`).
- 2026-10-09 — v1.1 (khi viết TASKS.md): làm rõ `pace` tính cả hôm nay; thêm quy tắc số phút điền sẵn của timer (1–1440); ghi rõ EntryService validate mọi ngày từ M1 (timer qua nửa đêm ở M2) và xoá goal thì xoá `activeTimer` liên quan; thêm mã lỗi `GOAL_TIMER_RUNNING` (M5); thay `react/no-danger` (plugin không có trong stack) bằng `no-restricted-syntax`.
- 2026-10-09 — v1.2 (mode `revise`, feedback Gate 2: song ngữ en/vi): §1 thêm luồng i18n; §2 thêm `i18next` 26.4.2 + `react-i18next` 17.0.16 và `Intl` (loại language detector plugin, tự viết, FormatJS, Lingui); §3 thêm component `src/i18n/*`, `LocaleService`, `bootstrap.ts`, `useT`/`useFormat`, `error-messages.ts`, sửa `domain/reminder.ts` (trả dữ liệu, không sinh chữ) và `domain/ics.ts` (nhận chuỗi đã dịch), mở rộng quy tắc phụ thuộc và thêm quy tắc chuỗi hiển thị (lint + test); §4 kv key `locale`; §5.2 `KvKey`; §5.3 `LocaleService`, `ReminderService` nhận `Translator`; §5.4 ánh xạ mã lỗi → key `errors.*`; §5.5 import giữ `locale`; §5.6 body notification theo locale; §5.7 `.ics` UTF-8, SUMMARY/DESCRIPTION theo locale; thêm §5.8 i18n contract; §6 thư mục `src/i18n/`, helper test; §8 chiến lược test i18n; §10 thêm 5 rủi ro; §11 thêm ADR-11 … ADR-13.
- 2026-10-10 — v1.3 (mode `revise`, ghi nhận deviation M1–M2 đã PASS QC, chuẩn bị M3): §3 thêm `settings-service`, `mutex`, `notification-port`, `app/reminder-scheduler`, cập nhật mô tả `data/*`; quy tắc lint tách lớp bỏ qua `*.test.ts(x)`. §5.2 `KvRepository.update` (nguyên tử, ADR-14), `EntryRepository.getById` (M3), interface mới `TimerRepository.saveTimerEntry` + `SaveTimerEntryOutcome` (M3), `BackupData`, ràng buộc nguyên tử cho mọi implementation repository. §5.3 thêm cột Constructor; `DomainError.params`; `GoalService` tham số `kv` tuỳ chọn; `EntryService` dùng `getById` + tách `prepareAdd` (M3); `TimerService` (`current`, `stop` chỉ xem trước, `Mutex`, `save` nguyên tử ở M3); thêm `SettingsService` (claim/release ngày nhắc), `NotificationPort`; `ReminderService.check` claim-trước-gửi; ghi nhận scheduler chạy bù trigger, `Today.pendingTimer` + cờ `GoalCard` hạ bởi effect, banner tính ở UI. §5.6 thứ tự claim → show → release. §6 thêm file. §10 thêm rủi ro ghi đua nhiều tab. §11 thêm ADR-14 … ADR-16. Không đổi phạm vi, không đổi mã lỗi.
- 2026-10-12 — v2.0 (mode `revise`, phase 2: đăng nhập Google tuỳ chọn + đồng bộ offline-first qua Supabase). §1 thêm sơ đồ và luồng phase 2; §2 thêm Supabase, `@supabase/supabase-js` 2.117.3 (lazy), Supabase CLI 2.120.0 qua npx, mock Supabase Node; §3 thêm component phase 2 (AuthPort/AuthService, RemoteStore/SyncService, LoginPromptService, LockPort, Dexie v2, LocalSyncStore, LocalDataRepository, integration/supabase, auth-callback, sync-scheduler, UI mới) và quy tắc lint `@supabase/*`; §4 thêm 4.1 kiểu sync + kv `sync`/`loginPrompt`, 4.2 Dexie v2 + quy tắc xoá mềm/`dirty`/`nextUpdatedAt`, 4.3 SQL migration (bảng, trigger LWW, RLS, grant), 4.4 bảng cái gì đồng bộ; §5.1 callback `?auth=callback`; §5.2 `LocalDataRepository`, `LocalSyncStore`; §5.3 `AuthService`, `SyncService`, `LoginPromptService`, sửa `BackupService`; §5.4 mã `AUTH_*`, `SYNC_*`; §5.5 export/import với tombstone; thêm §5.9 Auth contract, §5.10 Sync protocol, §5.11 mock Supabase; §6 thư mục mới; §7 biến `VITE_SUPABASE_*`, `VITE_SYNC_INTERVAL_MS`, biến test DB, secrets Actions; §8 chiến lược test auth/sync (Fake, hai thiết bị, hợp đồng, migration, SQL/RLS, project E2E `cloud`); §9 lệnh `build:e2e`, `build:cloud-e2e`, `preview:cloud-e2e`, `mock:supabase`, `db:*`, `test:db`; §10 thêm 12 rủi ro; §11 ghi chú ADR-01/08/10/12, thêm ADR-17 … ADR-24. Không đổi contract M1–M5 ngoài hành vi xoá mềm/lọc tombstone ở repository (chữ ký giữ nguyên).
- 2026-10-12 — v2.1 (mode `revise`, trả lời OQ-06 … OQ-09 sau Gate 1 phase 2). OQ-07 → đồng bộ nhắc nhở + ngôn ngữ: §3 thêm `data/dexie/prefs-repo.ts`; §4.1 thêm `PrefGroup`, `PrefsSyncState`, `RemotePrefs`, kv `prefsSync`; §4.2 migration đặt mốc tuỳ chọn (A-36), `replaceAll` đánh dấu nhóm reminder (A-37), `clearUserData` xoá `prefsSync`; §4.3 thêm bảng `settings` + trigger `settings_before_write` (LWW theo nhóm) + RLS + grant vào cùng file migration; §4.4 bảng đồng bộ viết lại + bảng quy tắc `resolvePrefGroup` + cách áp locale/reminder; §5.2 `SyncedPrefsRepository`; §5.3 `SettingsService`/`LocaleService` nhận `prefs` tuỳ chọn, `SyncService` nhận `prefs`; §5.10 `pushPrefs`/`pullPrefs` + bước 3b, gộp tài khoản đánh dấu tuỳ chọn; §5.11 mock `/rest/v1/settings`; §8 test tuỳ chọn + ghi chú không có Docker (OQ-08); §10 thêm 2 rủi ro; §11 ghi chú ADR-12, ADR-22, thêm ADR-25. OQ-06 (không giới hạn đăng nhập), OQ-09 (không nút xoá cloud): không đổi kiến trúc.
- 2026-10-13 — v3.0 (mode `revise`, phase 3: định nghĩa mới đường cong "Bạn", FR-27 v3.0). §3 sửa mô tả `domain/curve.ts` (bỏ phụ thuộc `stats`); §4 gạch quy tắc 1.01^n, trỏ sang **§4.5** mới (ký hiệu, công thức, làm tròn `pct` nửa xa 0, phạm vi giá trị, contract `ActualPoint`/`CurveData`/`curveYDomain`, oracle dataset R1 dữ liệu thật của user + S1, yêu cầu hiển thị, formatter `f.factor`, thang Y tự co giãn theo cả hai series); §11 thêm ADR-26. Không đổi schema, sync, backup, route, mã lỗi.
- 2026-10-17 — v3.1 (mode `revise`, phase 4: M10 backlog + ngân sách bundle). §2 hàng Validate: zod chỉ ở biên lazy. §3: `env.ts`, `goal.ts`, `entry.ts` bỏ zod; thêm `domain/backup-file.ts`; bảng component v3.1 (`isPurgeableTombstone`, `purgeTombstones`, `app/maintenance.ts`, `clearPkceVerifier`, loader không phát chunk SDK khi cloud tắt); quy tắc lint mới (cấm `zod` ngoài hai biên, cấm `import()` `@supabase/*`/`supabase-client` ngoài `integration/supabase`). §4.1 `SyncFlag` thêm `2`. §4.2 ghi nhận `dirty = 2`, thêm quy tắc dọn tombstone. §5.2 `LocalSyncStore.purgeTombstones`. §5.3 `BackupService.parse` async, `LoginPromptService.dismiss` không đếm khi đang ẩn + mốc tương lai > 24 h. §5.4 `IMPORT_INVALID_SCHEMA` biến thể `outOfRange`. §5.9 dọn code verifier. §6, §8 (spec ngân sách 230 KB, test giới hạn chung form ↔ file, test dọn tombstone), §9 (`check` dùng `build:e2e`), §10 thêm 4 rủi ro. §11 thêm **ADR-27** (chiến lược chunk), **ADR-28** (`dirty = 2`), **ADR-29** (dọn tombstone), **ADR-30** (ghi nhận deviation D7, OQ-D12, sync D1–D3, toast D9, M8, M9, brand, mock). Không đổi schema Dexie/cloud, route, định dạng backup, mã lỗi.
