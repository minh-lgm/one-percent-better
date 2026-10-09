# Tasks — 1% Better per Day

Nguồn: `docs/plan/PRD.md` (FR/NFR), `docs/plan/ARCHITECTURE.md` (file, lệnh, mã lỗi). Giao diện cụ thể (layout, copy, màu) theo `docs/design/DESIGN.md`; task UI phải đọc file đó trước khi làm.

## 0. Quy ước chung cho mọi milestone

**Trạng thái task.** Cột `Trạng thái` trong file này là trạng thái kế hoạch (khởi tạo `TODO`). Developer báo trạng thái thực tế của từng task trong `docs/handoff/dev-M<n>.md`; orchestrator cập nhật `docs/STATUS.md`.

**Thời gian cố định khi test.** Trừ khi AC ghi khác: "hôm nay" = `2026-10-09` (thứ Sáu), giờ `2026-10-09T10:00:00+07:00`, timezone `Asia/Ho_Chi_Minh`, locale `en-US` (Vitest: `vi.setSystemTime`; Playwright: `page.clock`).

**Dataset S1** (dùng trong unit/integration test qua builder ở `src/test/`, và từ M3 là file `e2e/fixtures/sample-backup.json`):

| Goal | Chỉ tiêu | Khoảng | Entry | Trạng thái ngày 2026-10-09 |
| :- | :- | :- | :- | :- |
| G1 "Read" | daily 30 phút | 2026-10-01 → 2026-10-31 | 30 phút mỗi ngày 10-01 … 10-08 (8 entry) | active |
| G2 "Guitar" | daily 20 phút | 2026-09-01 → 2026-12-31 | 20 phút mỗi ngày 09-01 … 09-10 (10), 20 phút ngày 10-07 và 10-08 (2), 10 phút ngày 09-15 (1) | active |
| G3 "Spanish" | total 100 giờ | 2026-01-01 → 2026-12-31 | 60 phút ngày 2026-03-02 (1) | active, `dailyTarget` = 17 |
| G4 "Marathon prep" | daily 45 phút | 2026-11-01 → 2026-11-30 | không có | upcoming |
| G5 "Old course" | daily 15 phút | 2026-01-01 → 2026-06-30 | 15 phút ngày 2026-06-30 (1) | ended |

Tổng: 5 goal, 23 entry. Settings mặc định (`reminderEnabled=false`, `reminderTime='20:00'`).

**Definition of done áp dụng cho mọi milestone** (mỗi milestone liệt kê lại kèm phần riêng):

1. Từ thư mục gốc, trên máy đã `npm ci`: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` đều exit code 0 (tương đương `npm run check`). Lint với `--max-warnings 0`.
2. `npm run test:e2e` pass toàn bộ spec của milestone này và mọi milestone trước (không regression).
3. Toàn bộ AC của milestone có test tự động tương ứng, trừ AC ghi rõ "kiểm thủ công".
4. Có `docs/handoff/dev-M<n>.md`: task đã làm và trạng thái, lệnh chạy, cách kiểm từng AC (test nào cover AC nào), bước kiểm thủ công, giới hạn đã biết, thay đổi so với plan (nếu có).
5. `README.md` cập nhật phần liên quan; commit local theo Conventional Commits (`feat(M<n>): …`).

---

## M1 — Walking skeleton: goals + ghi phút thủ công + IndexedDB + PWA cơ bản

**Mục tiêu:** Bản chạy được tối thiểu xuyên suốt mọi lớp (UI → service → domain → Dexie/IndexedDB → service worker), có sẵn toolchain build/lint/test/e2e. Xử lý sớm rủi ro PWA/offline và tách lớp.
**Demo:** Mở `npm run preview`, tạo goal "Read" 30 phút/ngày "This year", vào Today ghi 20 phút rồi 10 phút, thấy `30/30` và chỉ báo "+1%". Reload, tắt mạng, reload lần nữa: dữ liệu vẫn còn và vẫn ghi entry được. Chrome hiện nút cài app.
**Phụ thuộc:** none (UI cần `docs/design/DESIGN.md`)
**FR:** FR-01 … FR-10. **NFR chạm tới:** NFR-01, 02, 05, 06, 08, 09, 10.

### Tasks

| ID | Task | Lớp/khu vực | File/module dự kiến | Ghi chú | Trạng thái |
| :- | :- | :- | :- | :- | :- |
| M1-T1 | Scaffold dự án và toolchain: dependency pin exact theo ARCH §2, toàn bộ script ở ARCH §9, ESLint flat config với rule tách lớp (`no-restricted-imports`) và cấm `dangerouslySetInnerHTML` (`no-restricted-syntax`), Vitest (node + jsdom, include `tests/qc/**`), Playwright (`webServer` = build + preview 4173, timezone/locale cố định, include `tests/qc/**/*.spec.ts`), `.nvmrc`, `.env.example`, README khung; config layer | config, tooling | `package.json`, `package-lock.json`, `vite.config.ts`, `playwright.config.ts`, `eslint.config.js`, `tsconfig*.json`, `.nvmrc`, `.env.example`, `README.md`, `src/config/env.ts`, `src/config/constants.ts`, `src/test/setup.ts` | Không cài global; `e2e:install` dùng `PLAYWRIGHT_BROWSERS_PATH=0`. Test cho `env.ts` (default + giá trị sai) | TODO |
| M1-T2 | Domain cho goal và entry: kiểu dữ liệu, tiện ích ngày cục bộ, validate goal (FR-01), `periodDays`/`dailyTarget`/`totalTarget` (FR-02), `status` (FR-05), kiểm tra đổi khoảng thời gian (FR-03), validate entry + giới hạn 1440 phút/ngày + quy tắc ngày (`DATE_IN_FUTURE`, `DATE_OUTSIDE_GOAL_PERIOD`) | logic (domain) | `src/domain/types.ts`, `dates.ts`, `goal.ts`, `entry.ts` + `*.test.ts` | Hàm thuần, không import ngoài zod/date-fns. Test năm nhuận 2028, ranh giới năm, khoảng 1827/1828 ngày | TODO |
| M1-T3 | Data layer: repository interface và implementation Dexie schema v1 (`goals`, `entries`, `kv`), `deleteWithEntries` trong một transaction, `sumMinutes`, live query `watch*` | data | `src/data/repositories.ts`, `src/data/dexie/db.ts`, `goal-repo.ts`, `entry-repo.ts`, `kv-repo.ts` + `*.test.ts` (fake-indexeddb) | `BackupRepository` để M3. Test rollback: lỗi giữa transaction xoá goal thì goal và entry còn nguyên | TODO |
| M1-T4 | Service và composition root: `Result<T>`, `GoalService` (create/update/remove), `EntryService` (add/update/remove), `container.ts`, `AppContext`, hook `useSubscribable`, `useNow`, `useServices` | logic (application), config | `src/services/goal-service.ts`, `entry-service.ts` + test; `src/app/container.ts`, `AppContext.tsx`; `src/ui/hooks/*` | Service test với repository Dexie thật trên fake-indexeddb. `EntryService.add` validate mọi ngày (không chỉ today) | TODO |
| M1-T5 | UI quản lý goal: router hash (`#/`, `#/today`, `#/goals`, `#/goals/new`, `#/goals/:id/edit`, `#/settings` placeholder, Not found), danh sách goal theo trạng thái, form tạo/sửa với lỗi inline theo field, xoá có xác nhận | UI | `src/app/router.tsx`, `src/ui/screens/Goals.tsx`, `GoalForm.tsx`, `Settings.tsx`, `NotFound.tsx`, `src/ui/components/*` + component test | Copy/layout theo DESIGN.md. Form test bằng Testing Library | TODO |
| M1-T6 | UI Today: liệt kê goal `active` (chưa archive), `phút hôm nay / dailyTarget`, chỉ báo "+1%" khi đạt, form ghi entry (phút + ghi chú), danh sách entry hôm nay với sửa/xoá, trạng thái rỗng tối thiểu (chưa có goal → link tạo goal) | UI | `src/ui/screens/Today.tsx`, `src/ui/components/EntryForm.tsx`, … + component test | Ghi chú hiển thị dạng text. Trạng thái rỗng/lỗi đầy đủ để M5 | TODO |
| M1-T7 | PWA và integration: manifest (name "1% Better per Day", short_name "1% Better", icon 192/512/maskable, `display: standalone`), `sw.ts` precache app shell (`injectManifest`), đăng ký SW chỉ ở bản build + thông báo có bản mới, `storage.persist()` lúc khởi động, phát hiện IndexedDB không mở được (thông báo tối thiểu, không crash), Settings hiện trạng thái "persisted"; e2e luồng M1 | integration, UI, e2e | `src/sw.ts`, `src/integration/sw-register.ts`, `src/integration/storage.ts` + test, `public/icons/*`, `public/apple-touch-icon.png`, `public/favicon.svg`, `index.html`, `src/main.tsx`, `e2e/m1-*.spec.ts` | E2E gồm: luồng chính, offline, 0 request ngoài origin, axe, viewport 360 px | TODO |

### Acceptance criteria

| ID | Tiêu chí | Cách kiểm chứng |
| :- | :- | :- |
| M1-AC1 | Toolchain chạy bằng lệnh chuẩn | Trên clone sạch: `npm ci`, `npm run e2e:install`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` đều exit 0. Không có package nào cài global (`npm ls -g --depth=0` không thay đổi trước/sau). |
| M1-AC2 | Tạo goal hợp lệ | UI: `#/goals/new`, nhập name "Read", why "Be smarter", Daily 30, end "This year", Save → `#/goals` hiện "Read" trạng thái active; `#/today` hiện "Read" với `0/30`. E2E `m1-goals.spec.ts`. |
| M1-AC3 | Validate form goal: lỗi hiển thị inline đúng field, goal không được lưu | Unit test `goal.test.ts` trả đúng mã lỗi cho: name rỗng/chỉ khoảng trắng → `GOAL_NAME_REQUIRED`; 61 ký tự → `GOAL_NAME_TOO_LONG` (60 ký tự hợp lệ); why 281 ký tự → `GOAL_WHY_TOO_LONG`; daily 0, 1441, 12.5 → `GOAL_TARGET_INVALID`; total 0 giờ, 10001 giờ → `GOAL_TARGET_INVALID`; total 100 giờ trong 1 ngày (`dailyTarget` 6000) → `GOAL_TARGET_INVALID`; endDate < startDate, khoảng 1828 ngày → `GOAL_PERIOD_INVALID` (1827 ngày hợp lệ). Component test: submit form name rỗng → thông báo lỗi gắn với ô name (`aria-describedby`/`aria-invalid`), danh sách goal trong DB vẫn rỗng. |
| M1-AC4 | `dailyTarget` suy ra đúng | Unit test: total 100 giờ, 2026-01-01→2026-12-31 → 17; total 100 giờ, 2028-01-01→2028-12-31 (366 ngày) → 17; daily 30 → 30; total 1 giờ trong 7 ngày → 9. UI: tạo G3 "Spanish" theo S1 → Today hiện `0/17`. |
| M1-AC5 | Trạng thái goal đúng và Today chỉ hiện goal active | Unit test `status()` với S1 tại 2026-10-09: G1–G3 active, G4 upcoming, G5 ended; biên: today = startDate và today = endDate → active. E2E: tạo G1, G4, G5 qua UI → `#/goals` hiện đủ 3 với nhãn trạng thái đúng; `#/today` chỉ hiện "Read". |
| M1-AC6 | Ghi entry thủ công và chỉ báo "+1%" | E2E: với G1, ghi 20 phút note "Ch. 3" → `20/30`, không có "+1%"; ghi tiếp 10 phút → `30/30` và có "+1%". Unit/component test lỗi: minutes 0, 1441, 12.5, rỗng → `ENTRY_MINUTES_INVALID`; note 281 ký tự → `ENTRY_NOTE_TOO_LONG`; đã có 1400 phút trong ngày, thêm 41 → `ENTRY_DAY_LIMIT_EXCEEDED` (thêm 40 hợp lệ). |
| M1-AC7 | Sửa/xoá entry cập nhật tổng ngay | E2E: từ trạng thái `30/30`, sửa entry 20 → 5 phút → `15/30`, "+1%" biến mất; xoá entry 5 phút → `10/30`, không cần reload. Unit test `update` với `excludeEntryId` khi kiểm tra giới hạn 1440. |
| M1-AC8 | Sửa goal không làm entry rơi ra ngoài khoảng | Service test: G1 có entry 2026-10-01; đổi startDate thành 2026-10-02 → `GOAL_PERIOD_EXCLUDES_ENTRIES`, goal trong DB không đổi. Đổi name/why/chỉ tiêu → lưu được, `updatedAt` đổi, `createdAt` giữ nguyên. Component test hiển thị lỗi này trên form. |
| M1-AC9 | Xoá goal có xác nhận, xoá kèm entry trong một transaction | E2E: bấm Delete trên "Read" rồi Cancel → goal còn; Delete rồi Confirm → goal biến mất khỏi Goals và Today. Integration test: sau `deleteWithEntries`, `entries.where('goalId')` = 0; giả lập lỗi khi xoá entries → goal và entry còn nguyên. |
| M1-AC10 | Dữ liệu bền qua reload và đóng tab | E2E: tạo goal + entry, `page.reload()` → còn; đóng page, mở page mới cùng context → còn. Kiểm thủ công: đóng hẳn Chrome, mở lại `http://localhost:4173` → dữ liệu còn. Unit test: khởi động app gọi `navigator.storage.persist()` đúng 1 lần (mock); Settings hiện trạng thái persisted. |
| M1-AC11 | PWA cài được và chạy offline | E2E trên preview: `GET /manifest.webmanifest` trả JSON có `name`, `short_name`, `start_url`, `display: "standalone"`, icon 192 và 512 (có một icon `purpose: maskable`); `navigator.serviceWorker.ready` resolve và có controller sau reload. Sau đó `context.setOffline(true)` + `page.reload()` → Today render, ghi được entry 15 phút. Kiểm thủ công: Chrome/Edge desktop hiện nút Install và app cài mở ở cửa sổ riêng. |
| M1-AC12 | Không request ngoài origin, an toàn hiển thị, a11y, responsive | E2E ghi mọi request trong luồng M1-AC2→AC7: 0 request có origin khác `http://localhost:4173`. Tạo goal name `<img src=x onerror=alert(1)>` → hiển thị đúng chuỗi literal, không có thẻ `img` trong DOM. `rg dangerouslySetInnerHTML src` → 0 kết quả. axe trên Today, Goals, GoalForm: 0 vi phạm serious/critical. Viewport 360×740 và 1440×900: `document.documentElement.scrollWidth <= clientWidth`. |
| M1-AC13 | Tách lớp được cưỡng chế bằng lint | `echo "import Dexie from 'dexie'; export const x = Dexie;" \| npx eslint --stdin --stdin-filename src/domain/probe.ts` → exit ≠ 0 với lỗi `no-restricted-imports`; tương tự import `dexie` từ `src/services/probe.ts` và `src/ui/probe.tsx` → lỗi; import `src/data/repositories` từ `src/services/probe.ts` → không lỗi. Mọi bản ghi tạo ra có `id` dạng UUID, `createdAt`, `updatedAt` (unit test). |
| M1-AC14 | Route không tồn tại | Mở `#/abc` → màn hình Not found có link về Today; `#/` chuyển tới `#/today`. |

### Definition of done

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` exit 0; `npm run test:e2e` pass toàn bộ spec M1.
- Mọi AC ở trên có test tự động hoặc bước kiểm thủ công ghi trong handoff.
- `docs/handoff/dev-M1.md` đầy đủ theo mục 0; README có hướng dẫn install, dev, build, preview, lint, test, e2e.

---

## M2 — Timer và nhắc nhở hằng ngày

**Mục tiêu:** Ghi thời gian bằng timer bền qua reload; nhắc nhở hằng ngày bằng notification (best-effort khi app mở), banner trong app và file `.ics`. Đây là rủi ro kỹ thuật lớn nhất còn lại (notification không server, SW `notificationclick`), xử lý ngay sau skeleton.
**Demo:** Bấm Start trên "Read", thấy đồng hồ chạy; reload vẫn chạy đúng; Stop → hộp xác nhận điền sẵn số phút → Save → Today cộng phút. Bật nhắc lúc 20:00 trong Settings, cho phép notification; khi qua 20:00 mà còn goal chưa đạt, nhận notification và thấy banner trong Today; bấm notification mở Today. Tải file `.ics` và thêm vào lịch.
**Phụ thuộc:** M1
**FR:** FR-11 … FR-16. **NFR chạm tới:** NFR-07.

### Tasks

| ID | Task | Lớp/khu vực | File/module dự kiến | Ghi chú | Trạng thái |
| :- | :- | :- | :- | :- | :- |
| M2-T1 | Domain timer và reminder: thời gian đã chạy, số phút điền sẵn `clamp(round, 1, 1440)`, ngày quy về (ngày bắt đầu); `shouldNotify`, `shouldShowBanner`, nội dung body notification | logic (domain) | `src/domain/timer.ts`, `src/domain/reminder.ts` + `*.test.ts` | Test bảng chân trị đủ 5 điều kiện của `shouldNotify`; test qua nửa đêm | TODO |
| M2-T2 | `TimerService` (start/stop/save/discard/watch, lưu `activeTimer` trong kv); `GoalService.remove` huỷ timer của goal bị xoá | logic (application) | `src/services/timer-service.ts` + test; sửa `goal-service.ts` | Không đếm bằng interval; luôn tính `now − startedAt`. Save tạo entry `source = 'timer'` qua `EntryService` (cùng validate) | TODO |
| M2-T3 | UI timer trên Today: Start cho goal active, hiển thị `hh:mm:ss` cập nhật mỗi giây, chỉ một timer (Start khác bị vô hiệu), Stop → dialog phút điền sẵn (sửa được) + ghi chú, Save / Discard | UI | `src/ui/components/TimerCard.tsx`, `StopTimerDialog.tsx`, sửa `Today.tsx` + component test (fake timers) | Dialog dùng được bằng bàn phím, focus trap theo DESIGN.md | TODO |
| M2-T4 | Notification và scheduler: hỗ trợ/quyền/xin quyền, `showNotification` qua `ServiceWorkerRegistration`, `ReminderService.check` chạy lúc khởi động + mỗi `VITE_REMINDER_CHECK_INTERVAL_MS` + `visibilitychange`, ghi `lastReminderDate`; `sw.ts` xử lý `notificationclick` (focus client hoặc mở `#/today`) | integration, logic (application) | `src/integration/notifications.ts` + test, `src/services/reminder-service.ts` + test, `src/sw.ts` | Tách logic `notificationclick` thành hàm nhận `clients`/`scope` để unit test | TODO |
| M2-T5 | Settings nhắc nhở + banner: bật/tắt (mặc định tắt), giờ `HH:MM` (mặc định 20:00), xin quyền khi bật, hiển thị 4 trạng thái quyền, text giới hạn NFR-07 và hướng dẫn iOS "Add to Home Screen"; banner trên Today (FR-15) | UI | sửa `src/ui/screens/Settings.tsx`, `Today.tsx`; `src/ui/components/ReminderBanner.tsx` + component test | Banner hoạt động cả khi không có quyền notification | TODO |
| M2-T6 | File `.ics`: sinh nội dung theo ARCH §5.7, nút tải trong Settings | logic (domain), integration, UI | `src/domain/ics.ts` + test, `src/integration/file-io.ts` + test, sửa `Settings.tsx` | CRLF, DTSTART = ngày mai lúc giờ nhắc (floating) | TODO |
| M2-T7 | E2E M2 và README: timer với `page.clock`, nhắc nhở với `grantPermissions` + `registration.getNotifications()`, tải `.ics`; README mục "Reminders: limitations" | e2e, docs | `e2e/m2-timer.spec.ts`, `e2e/m2-reminder.spec.ts`, `README.md` | Nếu headless không quan sát được notification: ghi rõ trong handoff + bước kiểm thủ công | TODO |

### Acceptance criteria

| ID | Tiêu chí | Cách kiểm chứng |
| :- | :- | :- |
| M2-AC1 | Start timer và hiển thị thời gian chạy | E2E (`page.clock` cài ở 2026-10-09T10:00:00+07:00): Start trên "Read" → hiện `00:00:00`; tua 65 s → `00:01:05`. Nút Start của goal khác bị vô hiệu. Unit test: `start` khi đã có timer → `TIMER_ALREADY_RUNNING`; `start` cho goal upcoming/ended → `GOAL_NOT_ACTIVE`; `stop` khi không có timer → `TIMER_NOT_RUNNING`. |
| M2-AC2 | Timer bền qua reload/đóng app | E2E: Start, tua 25 phút, `page.reload()` → hiển thị `00:25:00` (±1 s) và tiếp tục chạy; đóng page, mở page mới cùng context → vẫn chạy với thời gian đúng. |
| M2-AC3 | Stop, Save và Discard | E2E: Start, tua 25:31, Stop → dialog điền sẵn `26`; sửa thành 25, note "Pomodoro", Save → Today `25/30`; entry có `source = timer` (thấy trong lịch sử ở M3 hoặc kiểm qua unit test service). Lần khác: Start, tua 10 phút, Stop, Discard → không có entry mới, timer biến mất. Unit test làm tròn: 25:29 → 25; 25:30 → 26; 0:10 → 1; 1500 phút → 1440. |
| M2-AC4 | Timer qua nửa đêm ghi vào ngày bắt đầu | Unit/service test: start 2026-10-09T23:50+07:00, stop 2026-10-10T00:20+07:00, Save → entry `date = 2026-10-09`, `minutes = 30`. Nếu ngày bắt đầu ngoài khoảng goal (goal kết thúc trước đó do đã sửa) → `DATE_OUTSIDE_GOAL_PERIOD`, timer vẫn còn để Discard. |
| M2-AC5 | Xoá goal đang chạy timer thì timer bị huỷ | Service test + E2E: Start trên "Read", xoá goal "Read" (confirm) → kv `activeTimer` không còn, Today không hiện timer, không lỗi. |
| M2-AC6 | Settings nhắc nhở và trạng thái quyền | Component test với `Notification` mock: mặc định toggle tắt, giờ `20:00`; bật toggle → gọi `Notification.requestPermission()` đúng 1 lần; hiển thị đúng 4 trạng thái khi `permission` = `default` / `granted` / `denied` / không có `Notification` trong `window`. Đổi giờ thành `07:30` → lưu vào settings, còn sau reload (E2E). Màn Settings có đoạn text giới hạn nhắc khi app đóng (NFR-07). |
| M2-AC7 | Quy tắc gửi nhắc | Unit test `shouldNotify` với S1: tại 20:00:30, bật, `granted`, `lastReminderDate = null`, G1–G3 chưa đạt → true; lần lượt đổi từng điều kiện (tắt nhắc; `denied`; 19:59; `lastReminderDate = 2026-10-09`; mọi goal active đã đạt) → false. Goal upcoming/ended không được tính. Body chứa "3 goals left today" và `Read 0/30 min`, `Guitar 0/20 min`, `Spanish 0/17 min` (copy cuối theo DESIGN.md nhưng phải chứa số goal và tiến độ từng goal). |
| M2-AC8 | Gửi tối đa 1 notification/ngày khi app mở | E2E: `grantPermissions(['notifications'])`, bật nhắc 20:00, có G1 chưa đạt, clock 19:59:00 → `registration.getNotifications({tag: 'daily-reminder'})` rỗng; tua tới 20:01 → đúng 1 notification; tua thêm 3 chu kỳ kiểm tra → vẫn 1 lần gọi `showNotification` (đếm bằng spy hoặc kiểm `lastReminderDate = 2026-10-09`). Service test với adapter giả: ngày hôm sau gửi lại được. Nếu headless không hỗ trợ `getNotifications`, AC kiểm bằng service test + kiểm thủ công trên Chrome desktop (ghi trong handoff). |
| M2-AC9 | Bấm notification mở Today | Unit test hàm xử lý click: có client cùng scope → `focus()` và điều hướng `#/today`; không có → `clients.openWindow(scope + '#/today')`; notification được `close()`. Kiểm thủ công trên Chrome desktop với bản preview: bấm notification → cửa sổ app hiện ở Today. |
| M2-AC10 | Banner nhắc trong Today | Component/E2E: nhắc bật, quyền `denied`, 20:01, G1 chưa đạt → banner hiện; 19:59 → không hiện; ghi đủ chỉ tiêu cho mọi goal active → banner biến mất không cần reload; nhắc tắt → không hiện. |
| M2-AC11 | File `.ics` | Unit test `ics.ts` (giờ nhắc 20:00, today 2026-10-09): chứa `BEGIN:VCALENDAR`, `VERSION:2.0`, `PRODID:-//1% Better//EN`, `UID:`, `DTSTAMP:`, `DTSTART:20261010T200000` (không có `Z`), `DURATION:PT15M`, `RRULE:FREQ=DAILY`, `BEGIN:VALARM`, `TRIGGER:PT0M`, `ACTION:DISPLAY`; mọi dòng kết thúc `\r\n`. E2E: bấm nút tải → download tên `1percent-better-reminder.ics`. Kiểm thủ công: import file vào Google Calendar hoặc Outlook tạo sự kiện lặp hằng ngày (QC được ghi `NOT VERIFIED` nếu không có tài khoản lịch). |
| M2-AC12 | Không regression, a11y | Toàn bộ spec M1 pass. axe trên Today (đang chạy timer, có banner), dialog Stop, Settings: 0 vi phạm serious/critical. 0 request ngoài origin trong luồng M2. |

### Definition of done

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` exit 0; `npm run test:e2e` pass spec M1 + M2.
- `docs/handoff/dev-M2.md` có thêm: bước kiểm thủ công notification trên Chrome desktop (và iOS/Android nếu có máy), giới hạn đã biết về nhắc nhở.
- README có mục giới hạn nhắc nhở (NFR-07) và cách dùng file `.ics`.

---

## M3 — Ghi bù theo ngày, lịch sử, export/import JSON

**Mục tiêu:** Người dùng sửa/ghi bù cho ngày đã qua, xem lịch sử entry của một goal, và backup/chuyển thiết bị bằng file JSON an toàn (validate đầy đủ, thay thế trong một transaction).
**Demo:** Vào Day 2026-10-05, ghi bù 30 phút cho "Read". Mở chi tiết "Read" thấy lịch sử entry mới nhất trước. Vào Settings → Export tải file JSON; mở trình duyệt khác (profile sạch) → Import file đó, xem trước "5 goals, 23 entries", xác nhận → dữ liệu giống hệt.
**Phụ thuộc:** M1 (M2 cho việc import xoá `activeTimer`)
**FR:** FR-17 … FR-21. **NFR chạm tới:** NFR-04, NFR-05.

### Tasks

| ID | Task | Lớp/khu vực | File/module dự kiến | Ghi chú | Trạng thái |
| :- | :- | :- | :- | :- | :- |
| M3-T1 | Màn hình Day `#/day/:date`: chọn ngày (picker + ngày trước/sau), liệt kê goal có khoảng chứa ngày đó, thêm/sửa/xoá entry; chặn ngày tương lai; tham số ngày sai định dạng → thông báo lỗi có link về Today | UI, logic (application) | `src/ui/screens/Day.tsx`, sửa `router.tsx`, `EntryForm.tsx` + component test | Validate vẫn ở `EntryService`/`domain/entry.ts` (đã có từ M1); thêm link vào Day từ Today | TODO |
| M3-T2 | Goal detail cơ bản `#/goals/:id`: thông tin goal + lịch sử entry (mới nhất trước: ngày, phút, ghi chú, nguồn manual/timer), link từ Goals; id không tồn tại → Not found | UI | `src/ui/screens/GoalDetail.tsx` + component test, sửa `router.tsx` | M5 mở rộng màn này; chưa cần lazy-load ở M3 | TODO |
| M3-T3 | Domain backup + data layer: zod schema file backup v1 (ARCH §5.5), kiểm tra version và toàn vẹn tham chiếu; `BackupRepository` Dexie (`exportAll`, `replaceAll` trong một transaction trên `goals`, `entries`, `kv`) | logic (domain), data | `src/domain/backup.ts` + test, `src/data/dexie/backup-repo.ts` + test, sửa `repositories.ts` | Test rollback khi lỗi giữa `replaceAll` | TODO |
| M3-T4 | `BackupService` (`export`, `parse`, `import`) + Settings mục Backup: Export, Import (chọn file → xem trước số goal/entry → Confirm/Cancel), hiển thị lỗi theo mã, "Last backup" và nhắc backup (A-12) | logic (application), integration, UI | `src/services/backup-service.ts` + test, `src/integration/file-io.ts`, sửa `Settings.tsx`, `Today.tsx` (nhắc backup nếu DESIGN.md đặt ở đó) | Import: xoá `activeTimer`, `lastReminderDate = null`; Export cập nhật `lastBackupAt` | TODO |
| M3-T5 | Fixture và E2E: `e2e/fixtures/sample-backup.json` = dataset S1; các file import lỗi; spec Day, lịch sử, round-trip export/import | e2e | `e2e/fixtures/sample-backup.json`, `e2e/fixtures/invalid-*.json`, `e2e/m3-*.spec.ts` | Từ M3, e2e các milestone sau nạp dữ liệu qua Import | TODO |

### Acceptance criteria

| ID | Tiêu chí | Cách kiểm chứng |
| :- | :- | :- |
| M3-AC1 | Ghi bù cho ngày đã qua | E2E (S1 đã import): mở `#/day/2026-10-05`, ghi 30 phút cho "Guitar" → entry `date = 2026-10-05`; Today (2026-10-09) không đổi tổng; mở lại Day 2026-10-05 thấy entry. Sửa/xoá entry trên Day hoạt động, giới hạn 1440 phút/ngày vẫn áp dụng. |
| M3-AC2 | Không ghi cho ngày tương lai | E2E: `#/day/2026-10-10` → không có form ghi (hoặc bị vô hiệu) và có thông báo; nút "ngày sau" bị vô hiệu khi đang ở hôm nay. Service test: `add` với `date = 2026-10-10` → `DATE_IN_FUTURE`. |
| M3-AC3 | Chỉ ghi trong khoảng của goal | E2E: `#/day/2026-09-20` → không liệt kê "Read" (bắt đầu 10-01), có liệt kê "Guitar"; `#/day/2026-06-30` liệt kê "Old course" (ended). Service test: `add` cho G1 ngày 2026-09-30 → `DATE_OUTSIDE_GOAL_PERIOD`. |
| M3-AC4 | Route Day sai | `#/day/2026-13-40` và `#/day/abc` → thông báo ngày không hợp lệ có link về Today, không crash. |
| M3-AC5 | Lịch sử entry | E2E: `#/goals/<id G2>` hiện 13 entry, entry đầu là 2026-10-08, có cột/nhãn nguồn; entry tạo bằng timer (M2) hiện nguồn "timer". `#/goals/khong-ton-tai` → Not found. |
| M3-AC6 | Export | E2E (S1): bấm Export → download tên `1percent-better-backup-2026-10-09.json`; nội dung parse được, `app = "one-percent-better"`, `schemaVersion = 1`, 5 goals, 23 entries, có `settings`. Sau export, Settings hiện "Last backup" là 2026-10-09. |
| M3-AC7 | Round-trip không mất dữ liệu | Integration test: nạp S1 → `export` → DB mới → `import` → `goals` và `entries` deep-equal với ban đầu (mọi field, gồm `id`, `createdAt`, `updatedAt`). E2E: import `sample-backup.json` trong context mới → Today hiện Read `0/30`, Guitar `0/20`, Spanish `0/17`. |
| M3-AC8 | Xem trước và xác nhận import, thay thế toàn bộ | E2E: DB có 1 goal "Temp"; chọn `sample-backup.json` → xem trước "5 goals, 23 entries"; Cancel → vẫn chỉ có "Temp"; làm lại và Confirm → "Temp" biến mất, có 5 goal của S1. Sau import: không còn timer đang chạy, `lastReminderDate = null` (service test). |
| M3-AC9 | Import lỗi không thay đổi dữ liệu | Service test, mỗi trường hợp trả đúng mã và dữ liệu cũ giữ nguyên: file > 5 MB → `IMPORT_FILE_TOO_LARGE`; nội dung `{abc` → `IMPORT_INVALID_JSON`; thiếu `goals` hoặc `app` sai hoặc `minutes` là chuỗi → `IMPORT_INVALID_SCHEMA`; `schemaVersion: 2` → `IMPORT_UNSUPPORTED_VERSION`; entry có `goalId` không tồn tại, id trùng, tổng phút một goal/ngày 1441, entry ngoài khoảng goal → `IMPORT_INTEGRITY`. Integration test: giả lập lỗi trong `replaceAll` → rollback, dữ liệu cũ nguyên vẹn. E2E: import 1 file lỗi → hiện thông báo lỗi, dữ liệu không đổi. |
| M3-AC10 | Nhắc backup (A-12) | Component test: có goal, `lastBackupAt = null` → hiện nhắc; `lastBackupAt` = 2026-09-08T10:00 (31 ngày) → hiện; = 2026-09-10 (29 ngày) → không hiện; không có goal → không hiện. |
| M3-AC11 | An toàn khi hiển thị dữ liệu import | E2E: import file có note `<script>alert(1)</script>` → hiện literal trong lịch sử, không có dialog alert, không thêm thẻ `script` vào DOM. |
| M3-AC12 | Không regression, a11y | Spec M1, M2 pass. axe trên Day, Goal detail, Settings (có dialog xem trước import): 0 vi phạm serious/critical. |

### Definition of done

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` exit 0; `npm run test:e2e` pass spec M1 → M3.
- `docs/handoff/dev-M3.md` nêu fixture có sẵn (`e2e/fixtures/*`) để QC dùng.
- README có mục backup/restore và khuyến nghị cài PWA để tránh trình duyệt dọn dữ liệu.

---

## M4 — Review: heatmap năm, streak, thống kê, biểu đồ tuần/tháng

**Mục tiêu:** Người dùng nhìn lại cả năm: heatmap theo goal hoặc tất cả, streak, tổng giờ, % tiến độ, đi trước/chậm hơn, biểu đồ 12 tuần và 12 tháng; đạt mục tiêu hiệu năng với 3 năm dữ liệu.
**Demo:** Import S1, mở Review: heatmap 2026 "All goals" có ô màu ở tháng 3, 6, 9, 10; streak hiện tại 8, dài nhất 10. Chọn "Read": tổng 4.0 h, tiến độ 25.8%, chậm 30 phút. Bấm ô 2026-10-05 → mở Day của ngày đó.
**Phụ thuộc:** M3 (Day cho FR-26, Import để nạp fixture)
**FR:** FR-22 … FR-26. **NFR chạm tới:** NFR-03, NFR-08.

### Tasks

| ID | Task | Lớp/khu vực | File/module dự kiến | Ghi chú | Trạng thái |
| :- | :- | :- | :- | :- | :- |
| M4-T1 | Domain thống kê: tổng phút theo ngày/tuần ISO/tháng, ngày đạt, streak hiện tại/dài nhất (theo goal và tổng), tổng giờ, `progress%`, `pace` | logic (domain) | `src/domain/stats.ts` + test | Quy tắc ARCH §4; hôm nay chưa đạt không làm đứt streak | TODO |
| M4-T2 | Domain heatmap: lưới năm (cột tuần, hàng thứ Hai → Chủ nhật), mức 0–4 theo goal (% `dailyTarget`) và "All goals" (tổng phút), trạng thái `outside`, ngày tương lai | logic (domain) | `src/domain/heatmap.ts` + test | Test năm 2026 và 2028 (nhuận) | TODO |
| M4-T3 | `StatsService` (`goalStats`, `overallStats`) + benchmark NFR-03 + fixture `large-backup.json` (5 goal × ~3 năm ≈ 5.500 entry, ≤ 5 MB) | logic (application), e2e | `src/services/stats-service.ts` + test, `src/services/stats-service.bench.test.ts` (hoặc test có đo thời gian), `e2e/fixtures/large-backup.json` (+ script sinh nếu cần) | Dữ liệu 2023-10-10 → 2026-10-09 | TODO |
| M4-T4 | Component Heatmap: SVG/CSS grid, mỗi ô có nhãn truy cập được (ngày, phút, đạt/chưa), focus bằng bàn phím, Enter/click mở `#/day/:date` (không cho ô tương lai/outside) | UI | `src/ui/components/Heatmap.tsx` + component test | Không dùng Recharts cho heatmap (ADR-10) | TODO |
| M4-T5 | Màn Review (route lazy) `#/review?goal=<id\|all>&year=<YYYY>`: chọn goal/năm (đồng bộ URL), stat card, streak, biểu đồ cột 12 tuần và 12 tháng bằng Recharts (lazy) | UI | `src/ui/screens/Review.tsx`, `src/ui/components/StatCard.tsx`, `BarChart.tsx`, sửa `router.tsx` + component test | Tham số sai → về mặc định (`all`, năm hiện tại) | TODO |
| M4-T6 | E2E M4: Review với S1, click ô heatmap, hiệu năng với `large-backup.json`, kiểm bundle | e2e | `e2e/m4-*.spec.ts` | Ghi số đo thực tế vào handoff | TODO |

### Acceptance criteria

| ID | Tiêu chí | Cách kiểm chứng |
| :- | :- | :- |
| M4-AC1 | Lưới heatmap đúng lịch | Unit test: năm 2026 có đúng 365 ô trong năm, 53 cột, ô 2026-01-01 ở hàng thứ Năm, ô 2026-12-31 ở hàng thứ Năm cột cuối; năm 2028 có 366 ô, 2028-01-01 ở hàng thứ Bảy, có ô 2028-02-29. |
| M4-AC2 | Mức màu heatmap | Unit test một goal `dailyTarget = 30`: 0 → 0; 10 → 1; 14 → 1; 15 → 2; 29 → 2; 30 → 3; 59 → 3; 60 → 4. "All goals": 0 → 0; 1 → 1; 29 → 1; 30 → 2; 59 → 2; 60 → 3; 119 → 3; 120 → 4. Ngày ngoài khoảng goal → `outside`. Với S1 "All goals": 2026-09-15 → 1 (10 phút), 2026-10-07 → 2 (50 phút), 2026-03-02 → 3 (60 phút). |
| M4-AC3 | Nhãn truy cập được của ô | Component test: ô 2026-10-07 (All goals, S1) có accessible name chứa ngày, "50" phút và trạng thái đạt (copy theo DESIGN.md); điều hướng được bằng phím Tab/mũi tên theo DESIGN.md. |
| M4-AC4 | Streak | Unit test với S1 tại 2026-10-09 (hôm nay chưa ghi): G1 hiện tại 8, dài nhất 8; G2 hiện tại 2, dài nhất 10; tổng (ngày có ≥ 1 goal đạt) hiện tại 8, dài nhất 10. Sau khi ghi 30 phút cho G1 hôm nay: G1 hiện tại 9, tổng hiện tại 9. Tại 2026-10-10 không có entry ngày 10-09: G1 hiện tại 0. |
| M4-AC5 | Thống kê tổng, tiến độ, pace | Unit test với S1 tại 2026-10-09: G1 tổng 240 phút (4.0 h), `totalTarget` 930, progress 25.8%, pace −30; G2 tổng 250 phút, progress 10.2%, pace −530; G3 tổng 60 phút, progress 1.0%, pace −4734; G4 (upcoming) pace 0. Review hiện các số này (định dạng theo DESIGN.md). |
| M4-AC6 | Biểu đồ tuần/tháng | Unit test series với S1: tuần ISO bắt đầu 2026-10-05 = 160 phút; 12 phần tử, phần tử cuối là tuần hiện tại. 12 tháng năm 2026: Mar 60, Jun 15, Sep 210, Oct 280, các tháng khác 0. Component test: Review render 2 biểu đồ với đúng số cột (12). |
| M4-AC7 | Chọn goal/năm qua URL | E2E: chọn "Read" → URL `#/review?goal=<id>&year=2026` và stat đổi theo G1; chọn năm 2025 → heatmap rỗng cho Read (toàn ô `outside`). Mở `#/review?goal=xyz&year=abc` → hiển thị mặc định All goals, 2026, không crash. |
| M4-AC8 | Bấm ô heatmap mở Day | E2E: click (và Enter khi focus) ô 2026-10-05 → `#/day/2026-10-05`. Ô 2026-10-10 (tương lai) không điều hướng. |
| M4-AC9 | Hiệu năng và bundle (NFR-03) | Test benchmark: `overallStats` + `goalStats` cho 5 goal trên dữ liệu `large-backup.json` < 200 ms (trung vị 5 lần chạy, ghi số đo vào handoff). E2E: import `large-backup.json`, điều hướng tới Review → heatmap hiển thị trong < 1,5 s. Output `npm run build`: tổng JS của entry chunk + chunk import tĩnh ≤ 250 KB gzip; Recharts nằm trong chunk riêng không được tải ở `#/today` (E2E: không có request tới chunk đó khi chỉ mở Today). |
| M4-AC10 | Không regression, a11y, responsive | Spec M1 → M3 pass. axe trên Review (All goals và một goal): 0 vi phạm serious/critical. Viewport 360 px: trang không có thanh cuộn ngang (`scrollWidth <= clientWidth` của `documentElement`; heatmap được phép cuộn trong vùng chứa riêng nếu DESIGN.md quy định). 0 request ngoài origin. |

### Definition of done

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` exit 0; `npm run test:e2e` pass spec M1 → M4.
- `docs/handoff/dev-M4.md` có số đo hiệu năng thực tế (benchmark ms, thời gian hiển thị Review, kích thước bundle gzip).

---

## M5 — Đường cong 1%, Goal detail đầy đủ, archive, trạng thái rỗng/lỗi

**Mục tiêu:** Hoàn thiện ý tưởng "1% mỗi ngày" (đường cong lý tưởng vs thực tế, phản hồi "+1%"), quản lý goal đã xong bằng archive, và mọi màn hình có trạng thái rỗng/lỗi; chốt bản MVP.
**Demo:** Mở chi tiết "Read" (S1): tiêu đề "+8.3% better", biểu đồ hai đường 1.01^k và 1.01^n, streak, tiến độ, lịch sử. Ghi đủ 30 phút hôm nay trên Today → thấy phản hồi "+1%" một lần. Archive "Old course" → biến mất khỏi Goals active, vẫn xem được trong Review. Mở app ở chế độ chặn IndexedDB → màn hình lỗi rõ ràng.
**Phụ thuộc:** M4 (streak/stats dùng trong Goal detail)
**FR:** FR-27 … FR-31. **NFR chạm tới:** NFR-02, NFR-06, NFR-08 (rà toàn app).

### Tasks

| ID | Task | Lớp/khu vực | File/module dự kiến | Ghi chú | Trạng thái |
| :- | :- | :- | :- | :- | :- |
| M5-T1 | Domain đường cong + `StatsService.curve`: chuỗi `ideal = 1.01^k` cho mọi ngày trong khoảng, `actual = 1.01^n(d)` tới min(today, endDate), headline `(1.01^n − 1) × 100` 1 chữ số thập phân | logic (domain, application) | `src/domain/curve.ts` + test, sửa `stats-service.ts` | Hàm thuần, có test với khoảng 1827 ngày | TODO |
| M5-T2 | Goal detail đầy đủ (route lazy): why, khoảng thời gian, chỉ tiêu, tiến độ, streak, đường cong (Recharts lazy, có mô tả text thay thế), lịch sử entry, nút Edit/Archive/Delete | UI | sửa `src/ui/screens/GoalDetail.tsx`, `src/ui/components/CurveChart.tsx`, `router.tsx` + component test | Biểu đồ có tóm tắt text cho screen reader | TODO |
| M5-T3 | Phản hồi "+1%" trên Today đúng một lần/goal/ngày, lưu `plusOneShown` trong settings | logic (application), UI | sửa `entry-service.ts` hoặc service riêng, `Today.tsx`, `domain/types.ts` + test | Import thiếu `plusOneShown` → `{}` (ARCH §5.5) | TODO |
| M5-T4 | Archive/unarchive: `GoalService.setArchived` (chặn khi timer đang chạy → `GOAL_TIMER_RUNNING`), goal archived ẩn khỏi Today, không tính vào nhắc nhở/banner, không Start timer được; Goals có nhóm "Archived"; Review/Goal detail vẫn xem được | logic (application), UI | sửa `goal-service.ts`, `reminder.ts`, `Goals.tsx`, `GoalDetail.tsx`, `Today.tsx` + test | A-13 | TODO |
| M5-T5 | Trạng thái rỗng và lỗi cho Today, Goals, Goal detail, Review, Day, Settings; màn `StorageError` khi IndexedDB không dùng được; `ErrorBoundary` cho lỗi render và `StorageError` khi ghi | UI, integration | `src/ui/screens/StorageError.tsx`, `src/app/ErrorBoundary.tsx`, sửa các screen + component test | Copy theo DESIGN.md | TODO |
| M5-T6 | Rà soát cuối: e2e hành trình đầy đủ (tạo goal → timer → ghi bù → Review → curve → export/import → offline), axe trên mọi màn, README hoàn chỉnh (cài PWA trên điện thoại, HTTPS cần cho thiết bị thật, giới hạn nhắc, backup) | e2e, docs | `e2e/m5-*.spec.ts`, `README.md` | Hướng dẫn hosting chỉ ở mức ghi chú, chờ OQ-02 | TODO |

### Acceptance criteria

| ID | Tiêu chí | Cách kiểm chứng |
| :- | :- | :- |
| M5-AC1 | Giá trị đường cong | Unit test với G1 (S1) tại 2026-10-09: `ideal` tại 2026-10-09 (k = 9) = 1.0937 (±0.0001), `actual` (n = 8) = 1.0829 (±0.0001), headline "8.3"; series `ideal` có 31 điểm (cả khoảng), `actual` có 9 điểm (10-01 → 10-09). Goal 365 ngày đạt cả 365 → headline "3678.3". Goal upcoming → `actual` rỗng, headline "0.0". Goal ended → `actual` dừng ở `endDate`. |
| M5-AC2 | Goal detail đầy đủ | E2E (S1): `#/goals/<id G1>` hiện why, `2026-10-01 – 2026-10-31`, chỉ tiêu 30 min/day, tiến độ 25.8%, streak 8/8, tiêu đề chứa "+8.3% better", biểu đồ đường cong có 2 series, lịch sử 8 entry. Chunk Recharts chỉ được tải khi vào trang này hoặc Review. |
| M5-AC3 | Phản hồi "+1%" đúng một lần | E2E: G1 hôm nay 0/30; ghi 20 → không phản hồi; ghi 10 → phản hồi "+1%" xuất hiện 1 lần; ghi thêm 5 → không xuất hiện lại; reload → không xuất hiện lại; xoá entry 10 rồi ghi lại 10 cùng ngày → không xuất hiện lại. Tua clock sang 2026-10-10, ghi đủ 30 → xuất hiện lại. |
| M5-AC4 | Archive/unarchive | E2E (S1): Archive "Spanish" → không còn trên Today, nằm trong nhóm Archived ở Goals, Review chọn được "Spanish" và vẫn có dữ liệu 2026-03-02; Unarchive → quay lại Today. Unit test: goal archived không được tính trong `shouldNotify`/`shouldShowBanner` và body notification; `TimerService.start` cho goal archived → `GOAL_NOT_ACTIVE`; archive goal đang có timer chạy → `GOAL_TIMER_RUNNING`, goal không đổi. |
| M5-AC5 | Trạng thái rỗng | E2E với DB trống: Today, Goals, Review, `#/day/2026-10-09` đều hiện trạng thái rỗng có lời kêu gọi tạo goal (copy theo DESIGN.md), không có lỗi console. Goal không có entry → Goal detail hiện lịch sử rỗng và headline "+0.0% better". |
| M5-AC6 | IndexedDB không dùng được | E2E: `page.addInitScript` làm `indexedDB.open` ném lỗi (hoặc `window.indexedDB = undefined`) → hiện màn `StorageError` với hướng dẫn (vd. tắt chế độ riêng tư), không trắng trang. Component test: lỗi `StorageError` khi lưu entry → thông báo lỗi hiển thị, form giữ nguyên giá trị đã nhập. |
| M5-AC7 | Hành trình đầy đủ và offline | E2E: tạo goal → Start/Stop timer → ghi bù hôm qua trên Day → Review thấy ô hôm qua có màu → Goal detail thấy headline tăng → Export → context mới Import → dữ liệu giống. Sau đó `setOffline(true)` + reload: Today, Goals, Review, Goal detail đều mở được (chunk lazy đã được precache) và ghi entry được. |
| M5-AC8 | A11y và responsive toàn app | axe trên Today, Goals, GoalForm, Goal detail, Review, Day, Settings, StorageError, Not found: 0 vi phạm serious/critical. Viewport 360 px và 1440 px: không có thanh cuộn ngang ở mọi màn. Mọi luồng chính thực hiện được chỉ bằng bàn phím (E2E dùng `keyboard`, ít nhất cho tạo goal và ghi entry). |
| M5-AC9 | Tương thích ngoài Chromium (kiểm thủ công) | Trên Firefox desktop và (nếu có) Safari iOS ≥ 16.4 / Chrome Android qua HTTPS: tạo goal, ghi entry, reload còn dữ liệu, Review hiển thị. QC ghi `NOT VERIFIED` cho thiết bị không có. |
| M5-AC10 | README hoàn chỉnh | Làm theo README trên clone sạch chạy được install, dev, build, preview, lint, test, e2e; README có mục: cài PWA trên điện thoại (cần HTTPS), giới hạn nhắc nhở, backup/restore, biến môi trường (`.env.example`), không cần cài global. |
| M5-AC11 | Không regression | Toàn bộ spec M1 → M5 pass; 0 request ngoài origin trong mọi spec. |

### Definition of done

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` exit 0; `npm run test:coverage` cho `src/domain` ≥ 90% dòng; `npm run test:e2e` pass spec M1 → M5.
- `docs/handoff/dev-M5.md` gồm tổng kết MVP: FR đã làm/chưa làm, bước kiểm thủ công còn lại (notification trên thiết bị thật, iOS), giới hạn đã biết.

---

## Later (ngoài MVP)

- Nhắc nhở tin cậy khi app đóng bằng Web Push + VAPID (cần push server nhỏ) — OQ-01.
- Hướng dẫn/cấu hình deploy (GitHub Pages, Netlify, Cloudflare Pages) với `BASE_PATH` — OQ-02.
- Chế độ đường cong "khắt khe" (ngày lỡ nhân 0.99) — OQ-03.
- UI song ngữ Anh/Việt (i18n) — OQ-04.
- Chỉ tiêu theo tuần, chọn ngày trong tuần, ngày nghỉ — OQ-05.
- Đồng bộ giữa thiết bị (tài khoản, server, tombstone cho bản ghi đã xoá).
- Import dạng merge thay vì thay thế toàn bộ.
- Lưu lịch sử thay đổi chỉ tiêu (thống kê theo chỉ tiêu tại từng thời điểm).
- Periodic Background Sync (Chromium) để thử nhắc khi app đóng.
- Chỉ tiêu dạng số lần/đơn vị khác ngoài thời gian; gamification mở rộng.

## Changelog

- 2026-10-09 — v1, tạo mới (mode `new`, tiếp tục lần chạy bị ngắt). 5 milestone khớp cột Milestone của PRD §5.
