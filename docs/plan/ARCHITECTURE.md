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
External: không có (không server, không CDN, không analytics).
```

Luồng chính: UI gọi service → service dùng domain để validate/tính toán → service gọi repository để đọc/ghi → UI nhận dữ liệu mới qua subscription (live query) và render lại.

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
| `domain/reminder.ts` | logic | `shouldNotify`, `shouldShowBanner`, nội dung nhắc | stats |
| `domain/backup.ts` | logic | Schema file backup (zod), kiểm tra version và toàn vẹn tham chiếu | zod, entry |
| `domain/ics.ts` | logic | Sinh nội dung `.ics` (VEVENT lặp hằng ngày) | — |
| `data/repositories.ts` | data | Interface `GoalRepository`, `EntryRepository`, `KvRepository`, `BackupRepository`, `Subscribable<T>` | domain/types |
| `data/dexie/*` | data | DB schema Dexie v1 và implementation các repository, cascade delete, replaceAll trong transaction | dexie |
| `services/*` | logic (application) | Use case: goal, entry, timer, reminder, backup, stats; nhận repository qua constructor | domain, data interfaces |
| `integration/notifications.ts` | integration | Hỗ trợ/quyền/xin quyền, `showNotification` qua `ServiceWorkerRegistration` | Notification API, SW |
| `integration/sw-register.ts` | integration | Đăng ký SW (chỉ bản build), cập nhật SW | workbox-window |
| `integration/file-io.ts` | integration | Tải file (Blob + `<a download>`), đọc file người dùng chọn | File API |
| `integration/storage.ts` | integration | `navigator.storage.persist()`/`persisted()`, phát hiện IndexedDB không dùng được | StorageManager |
| `app/container.ts` | config (composition root) | Khởi tạo repository + service, cung cấp qua `AppContext` | data/dexie, services, integration |
| `app/router.tsx` | UI | Khai báo route, lazy-load Review và Goal detail | react-router |
| `ui/screens/*`, `ui/components/*`, `ui/hooks/*` | UI | Màn hình, component, hook `useSubscribable`, `useNow` | services (qua context) |
| `sw.ts` | integration | Precache (workbox), `notificationclick` → focus client hoặc mở `#/today` | workbox-precaching |

**Quy tắc phụ thuộc (bắt buộc, cưỡng chế bằng ESLint `no-restricted-imports`):**

- `src/domain/**` không import `react`, `react-dom`, `dexie`, `recharts`, hay bất kỳ file nào trong `src/data`, `src/services`, `src/integration`, `src/ui`, `src/app`.
- `src/services/**` không import `dexie`, `react`, `src/data/dexie/**`, `src/ui/**` (chỉ dùng interface trong `src/data/repositories.ts`; integration được truyền vào qua constructor).
- `src/ui/**` không import `dexie` hay `src/data/dexie/**`.
- Chỉ `src/app/container.ts` được ghép implementation cụ thể.

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
```

**Dexie schema v1** (DB name lấy từ `VITE_DB_NAME`, mặc định `one-percent-better`):

| Store | Khoá & index | Ghi chú |
| :- | :- | :- |
| `goals` | `id` | Không index trường boolean (IndexedDB không index được boolean) |
| `entries` | `id, goalId, date, [goalId+date]` | Truy vấn theo goal, theo ngày, theo khoảng ngày |
| `kv` | `key` | `{ key: 'settings' \| 'activeTimer', value }` |

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
  getByGoal(goalId: string): Promise<LogEntry[]>;
  getByDateRange(from: ISODate, to: ISODate): Promise<LogEntry[]>;
  sumMinutes(goalId: string, date: ISODate, excludeEntryId?: string): Promise<number>;
  put(entry: LogEntry): Promise<void>;
  delete(id: string): Promise<void>;
  watchByDateRange(from: ISODate, to: ISODate): Subscribable<LogEntry[]>;
  watchByGoal(goalId: string): Subscribable<LogEntry[]>;
}
interface KvRepository {
  get<T>(key: 'settings' | 'activeTimer'): Promise<T | undefined>;
  set<T>(key: 'settings' | 'activeTimer', value: T): Promise<void>;
  delete(key: 'settings' | 'activeTimer'): Promise<void>;
  watch<T>(key: 'settings' | 'activeTimer'): Subscribable<T | undefined>;
}
interface BackupRepository {
  exportAll(): Promise<{ goals: Goal[]; entries: LogEntry[]; settings: Settings }>;
  replaceAll(data: { goals: Goal[]; entries: LogEntry[]; settings: Settings }): Promise<void>; // một transaction, lỗi thì rollback
}
```

### 5.3 Service (chữ ký chính, `src/services/`)

Mọi hàm nghiệp vụ trả `Result<T> = { ok: true; value: T } | { ok: false; errors: DomainError[] }` với `DomainError = { code: ErrorCode; field?: string; message: string }`. Lỗi hạ tầng (IndexedDB) ném `StorageError` và được UI bắt hiển thị.

| Service | Hàm | Milestone |
| :- | :- | :- |
| `GoalService` | `create(input, now)`, `update(id, input, now)`, `remove(id)`, `setArchived(id, archived, now)` | M1 (archive M5) |
| `EntryService` | `add({goalId, date, minutes, note, source}, now)`, `update(id, {minutes, note}, now)`, `remove(id)` | M1 (UI chọn ngày ≠ today từ M3; domain validate mọi ngày ngay từ M1 vì timer qua nửa đêm ở M2 ghi vào ngày hôm trước) |
| `TimerService` | `start(goalId, now)`, `stop(now) → {goalId, date, minutes}`, `save({minutes, note}, now)`, `discard()`, `watch()`. `GoalService.remove` xoá luôn `activeTimer` nếu timer thuộc goal bị xoá | M2 |
| `ReminderService` | `check(now)` → gửi notification nếu `shouldNotify`; `getBannerState(now)` | M2 |
| `BackupService` | `export(now) → {fileName, json}`, `parse(text, sizeBytes) → Result<BackupPreview>`, `import(parsed, now)` | M3 |
| `StatsService` | `goalStats(goalId, year, today)`, `overallStats(year, today)`, `curve(goalId, today)` | M4/M5 |

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

Message hiển thị (tiếng Anh) do designer chốt trong `DESIGN.md`; code ở trên là cố định để test bám vào.

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

Import: thay thế toàn bộ `goals`, `entries`, `settings`; xoá `activeTimer`; đặt `lastReminderDate = null`. Field `plusOneShown` (thêm ở M5) là optional khi import, mặc định `{}`.

### 5.6 Notification và Service Worker

- Hiển thị qua `(await navigator.serviceWorker.ready).showNotification(title, options)` (bắt buộc trên Android Chrome; `new Notification()` không dùng).
- `title`: `"1% Better"`; `body`: số goal chưa đạt và tiến độ, ví dụ `"2 goals left today: Read 10/30 min, Guitar 0/20 min"`; `tag`: `"daily-reminder"`; `data.url`: `"#/today"`; `icon`: icon 192 px.
- `sw.ts` xử lý `notificationclick`: đóng notification, focus client đang mở cùng scope và điều hướng tới `#/today`, nếu không có thì `clients.openWindow(scope + '#/today')`.
- Lịch kiểm tra nhắc (khi app đang mở): ngay khi app khởi động, mỗi `VITE_REMINDER_CHECK_INTERVAL_MS` (mặc định 60000 ms), và khi `visibilitychange`. Gửi xong ghi `lastReminderDate = today`.
- `shouldNotify(now, settings, permission, activeGoalsProgress)` = `reminderEnabled && permission === 'granted' && hh:mm(now) ≥ reminderTime && lastReminderDate !== today && có ≥ 1 goal active chưa đạt`. `shouldShowBanner` = như trên nhưng không cần quyền và không xét `lastReminderDate`.

### 5.7 File `.ics` (FR-16)

Tên `1percent-better-reminder.ics`; nội dung tối thiểu: `BEGIN:VCALENDAR`, `VERSION:2.0`, `PRODID:-//1% Better//EN`, một `VEVENT` có `UID`, `DTSTAMP`, `DTSTART` (ngày mai, giờ nhắc, giờ "floating" cục bộ dạng `YYYYMMDDTHHMMSS`), `DURATION:PT15M`, `RRULE:FREQ=DAILY`, `SUMMARY:1% Better — log today's time`, `BEGIN:VALARM` với `TRIGGER:PT0M`, `ACTION:DISPLAY`. Dòng kết thúc CRLF.

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
│   ├── app/                   # container.ts, AppContext.tsx, router.tsx, ErrorBoundary.tsx
│   ├── config/                # env.ts, constants.ts
│   ├── domain/                # types, dates, goal, entry, stats, heatmap, curve, timer, reminder, backup, ics (+ *.test.ts)
│   ├── data/
│   │   ├── repositories.ts
│   │   └── dexie/             # db.ts, goal-repo.ts, entry-repo.ts, kv-repo.ts, backup-repo.ts (+ *.test.ts)
│   ├── services/              # goal-, entry-, timer-, reminder-, backup-, stats-service.ts (+ *.test.ts)
│   ├── integration/           # notifications.ts, sw-register.ts, file-io.ts, storage.ts (+ *.test.ts)
│   ├── ui/
│   │   ├── screens/           # Today, Goals, GoalForm, GoalDetail, Day, Review, Settings, NotFound, StorageError
│   │   ├── components/        # Heatmap, TimerCard, EntryForm, StatCard, CurveChart, BarChart, …
│   │   ├── hooks/             # useSubscribable, useNow, useServices
│   │   └── styles/
│   └── test/                  # setup.ts (jest-dom, fake-indexeddb/auto), helpers, builders
├── e2e/                       # Playwright spec của developer
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
| E2E | Playwright Chromium, chạy trên bản build qua `vite preview` port 4173, `timezoneId: 'Asia/Ho_Chi_Minh'`, `locale: 'en-US'` | Luồng chính mỗi milestone; `page.clock` cho timer/nhắc; `context.setOffline` cho offline; `grantPermissions(['notifications'])`; tải/nạp file backup; axe a11y | `npm run test:e2e` |
| QC | Như trên | `tests/qc/**/*.test.ts(x)` được Vitest include; `tests/qc/**/*.spec.ts` được Playwright include | (cùng lệnh) |

Quy ước test: mỗi test e2e dùng browser context mới (IndexedDB sạch); dữ liệu mẫu nạp qua màn hình Import (từ M3) hoặc qua UI. Thời gian trong test luôn cố định (`vi.setSystemTime` / `page.clock.setFixedTime` hoặc `install`), ví dụ `2026-10-09T10:00:00+07:00`.

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

## Changelog

- 2026-10-09 — v1, tạo mới (mode `new`).
- 2026-10-09 — v1.1 (khi viết TASKS.md): làm rõ `pace` tính cả hôm nay; thêm quy tắc số phút điền sẵn của timer (1–1440); ghi rõ EntryService validate mọi ngày từ M1 (timer qua nửa đêm ở M2) và xoá goal thì xoá `activeTimer` liên quan; thêm mã lỗi `GOAL_TIMER_RUNNING` (M5); thay `react/no-danger` (plugin không có trong stack) bằng `no-restricted-syntax`.
