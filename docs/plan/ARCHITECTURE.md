# Architecture — 1% Better per Day

## 1. Tổng quan

App là SPA tĩnh (PWA), không có backend. Mọi dữ liệu nằm trong IndexedDB của trình duyệt.

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
External: không có (không server, không CDN, không analytics, không dịch vụ dịch).
```

Luồng chính: UI gọi service → service dùng domain để validate/tính toán → service gọi repository để đọc/ghi → UI nhận dữ liệu mới qua subscription (live query) và render lại.

Ngôn ngữ (i18n): domain không chứa chữ hiển thị (chỉ trả mã lỗi và dữ liệu có cấu trúc). UI dịch qua `react-i18next`; service nào phải tự sinh chữ ngoài React (notification, `.ics`) nhận một `Translator` qua constructor. Lựa chọn ngôn ngữ lưu ở kv key `locale` (chi tiết §5.8, ADR-11 … ADR-13).

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
| Validate | `zod` | 4.6.5 | Schema cho form và file import, message rõ | Tự viết validate (dễ sót), yup |
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

## 3. Component

| Component | Lớp (config/logic/data/integration) | Trách nhiệm | Phụ thuộc |
| :- | :- | :- | :- |
| `config/env.ts` | config | Đọc và validate `import.meta.env` (DB name, interval nhắc) với default | zod |
| `config/constants.ts` | config | Giới hạn nghiệp vụ (độ dài tên, phút tối đa, kích thước import, ngưỡng heatmap) | — |
| `domain/types.ts` | logic | Kiểu `Goal`, `LogEntry`, `ActiveTimer`, `Settings`, `ISODate`, `DomainError` | — |
| `domain/dates.ts` | logic | Ngày cục bộ ↔ `YYYY-MM-DD`, cộng/trừ ngày, khoảng ngày, tuần ISO | date-fns |
| `domain/goal.ts` | logic | Validate goal, `dailyTarget`, trạng thái goal, kiểm tra đổi khoảng thời gian | zod, dates |
| `domain/entry.ts` | logic | Validate entry, giới hạn 1440 phút/ngày, quy tắc ngày ghi bù | zod, dates |
| `domain/stats.ts` | logic | Tổng theo ngày/tuần/tháng, ngày đạt, streak, tiến độ, đi trước/chậm | dates |
| `domain/heatmap.ts` | logic | Lưới năm (cột tuần, hàng thứ Hai→Chủ nhật), mức màu 0–4 | dates, stats |
| `domain/curve.ts` | logic | Chuỗi điểm 1.01^k lý tưởng và 1.01^n thực tế, headline "+X%" | dates, stats |
| `domain/timer.ts` | logic | Thời gian đã chạy, làm tròn phút, ngày quy về | dates |
| `domain/reminder.ts` | logic | `shouldNotify`, `shouldShowBanner`, dữ liệu nhắc có cấu trúc (`{ pendingCount, items: [{ goalName, minutes, target }] }`) — không sinh chữ; chữ do `ReminderService` dịch | stats |
| `domain/backup.ts` | logic | Schema file backup (zod), kiểm tra version và toàn vẹn tham chiếu | zod, entry |
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

**Quy tắc phụ thuộc (bắt buộc, cưỡng chế bằng ESLint `no-restricted-imports`):**

- `src/domain/**` không import `react`, `react-dom`, `dexie`, `recharts`, `i18next`, `react-i18next`, hay bất kỳ file nào trong `src/data`, `src/services`, `src/integration`, `src/ui`, `src/app`, `src/i18n` (domain không biết ngôn ngữ).
- `src/services/**` không import `dexie`, `react`, `i18next`, `react-i18next`, `src/data/dexie/**`, `src/ui/**`, `src/i18n/instance*`, `src/i18n/resources/**` (chỉ dùng interface trong `src/data/repositories.ts` và `src/i18n/types.ts`, `src/i18n/detect.ts`, `src/i18n/format.ts`; integration và `Translator` được truyền vào qua constructor).
- `src/ui/**` không import `dexie` hay `src/data/dexie/**`; không import `i18next` trực tiếp (dùng hook `useT`/`useFormat`).
- `src/i18n/**` không import `react`, `src/ui/**`, `src/services/**`, `src/data/**`.
- Chỉ `src/app/container.ts` (và `bootstrap.ts`) được ghép implementation cụ thể.
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
- Đường cong: với mỗi ngày d trong khoảng goal, `k` = thứ tự ngày (startDate là 1), `ideal = 1.01^k`; với d ≤ today, `n(d)` = số ngày đạt từ startDate tới d, `actual = 1.01^n(d)`. Headline: `(1.01^n(today) − 1) × 100`, 1 chữ số thập phân.

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
| `IMPORT_INVALID_SCHEMA` | Sai cấu trúc/kiểu, thiếu field, `app` sai |
| `IMPORT_UNSUPPORTED_VERSION` | `schemaVersion` khác 1 |
| `IMPORT_INTEGRITY` | Entry trỏ tới goal không tồn tại, id trùng, tổng phút/ngày > 1440, entry ngoài khoảng goal |
| `STORAGE_UNAVAILABLE` | Không mở được IndexedDB |
| `NOTIFICATIONS_UNSUPPORTED` / `NOTIFICATIONS_DENIED` | Trình duyệt không hỗ trợ / quyền bị chặn |

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

## 7. Config và biến môi trường

Không có secret. Không biến nào bắt buộc; app chạy với giá trị mặc định khi không có `.env`.

| Biến | Mục đích | Bắt buộc | Ví dụ |
| :- | :- | :- | :- |
| `VITE_DB_NAME` | Tên IndexedDB database | Không (mặc định `one-percent-better`) | `one-percent-better` |
| `VITE_REMINDER_CHECK_INTERVAL_MS` | Chu kỳ kiểm tra nhắc nhở khi app mở (1000–3600000) | Không (mặc định `60000`) | `60000` |
| `BASE_PATH` | `base` của Vite khi host dưới subpath (đọc lúc build trong `vite.config.ts`) | Không (mặc định `/`) | `/1percent-better/` |

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
| Kiểm tra tổng | `npm run check` → lint + typecheck + test + build |

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

## Changelog

- 2026-10-09 — v1, tạo mới (mode `new`).
- 2026-10-09 — v1.1 (khi viết TASKS.md): làm rõ `pace` tính cả hôm nay; thêm quy tắc số phút điền sẵn của timer (1–1440); ghi rõ EntryService validate mọi ngày từ M1 (timer qua nửa đêm ở M2) và xoá goal thì xoá `activeTimer` liên quan; thêm mã lỗi `GOAL_TIMER_RUNNING` (M5); thay `react/no-danger` (plugin không có trong stack) bằng `no-restricted-syntax`.
- 2026-10-09 — v1.2 (mode `revise`, feedback Gate 2: song ngữ en/vi): §1 thêm luồng i18n; §2 thêm `i18next` 26.4.2 + `react-i18next` 17.0.16 và `Intl` (loại language detector plugin, tự viết, FormatJS, Lingui); §3 thêm component `src/i18n/*`, `LocaleService`, `bootstrap.ts`, `useT`/`useFormat`, `error-messages.ts`, sửa `domain/reminder.ts` (trả dữ liệu, không sinh chữ) và `domain/ics.ts` (nhận chuỗi đã dịch), mở rộng quy tắc phụ thuộc và thêm quy tắc chuỗi hiển thị (lint + test); §4 kv key `locale`; §5.2 `KvKey`; §5.3 `LocaleService`, `ReminderService` nhận `Translator`; §5.4 ánh xạ mã lỗi → key `errors.*`; §5.5 import giữ `locale`; §5.6 body notification theo locale; §5.7 `.ics` UTF-8, SUMMARY/DESCRIPTION theo locale; thêm §5.8 i18n contract; §6 thư mục `src/i18n/`, helper test; §8 chiến lược test i18n; §10 thêm 5 rủi ro; §11 thêm ADR-11 … ADR-13.
- 2026-10-10 — v1.3 (mode `revise`, ghi nhận deviation M1–M2 đã PASS QC, chuẩn bị M3): §3 thêm `settings-service`, `mutex`, `notification-port`, `app/reminder-scheduler`, cập nhật mô tả `data/*`; quy tắc lint tách lớp bỏ qua `*.test.ts(x)`. §5.2 `KvRepository.update` (nguyên tử, ADR-14), `EntryRepository.getById` (M3), interface mới `TimerRepository.saveTimerEntry` + `SaveTimerEntryOutcome` (M3), `BackupData`, ràng buộc nguyên tử cho mọi implementation repository. §5.3 thêm cột Constructor; `DomainError.params`; `GoalService` tham số `kv` tuỳ chọn; `EntryService` dùng `getById` + tách `prepareAdd` (M3); `TimerService` (`current`, `stop` chỉ xem trước, `Mutex`, `save` nguyên tử ở M3); thêm `SettingsService` (claim/release ngày nhắc), `NotificationPort`; `ReminderService.check` claim-trước-gửi; ghi nhận scheduler chạy bù trigger, `Today.pendingTimer` + cờ `GoalCard` hạ bởi effect, banner tính ở UI. §5.6 thứ tự claim → show → release. §6 thêm file. §10 thêm rủi ro ghi đua nhiều tab. §11 thêm ADR-14 … ADR-16. Không đổi phạm vi, không đổi mã lỗi.
