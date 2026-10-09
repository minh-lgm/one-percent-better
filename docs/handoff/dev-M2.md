# Dev handoff — M2 Timer và nhắc nhở hằng ngày

Ngày: 2026-10-10. Developer build theo `docs/plan/TASKS.md` M2 (T1…T7, AC1…AC13), `ARCHITECTURE.md` §4, §5.3, §5.6, §5.7, §5.8, `DESIGN.md` §4 S1/D1/S7, §7 (key `timer.*`, `reminder.*`, `notification.*`, `ics.*`, `settings.reminders.*`, `settings.permission.*`, `goalCard.*`, `goal.delete.timerNote`, `format.minSec`, `toast.*`, `errors.*`), mockup `04-timer.html`, `08-settings.html`.

## 1. Tóm tắt

- **Timer** (FR-11, FR-12): `TimerService` lưu `activeTimer {goalId, startedAt}` trong kv; thời gian chạy luôn là `now − startedAt` (không đếm bằng interval) nên đúng sau reload/đóng app. Một timer tại một thời điểm (`TIMER_ALREADY_RUNNING`), chỉ goal `active` (`GOAL_NOT_ACTIVE`). TimerCard ghim đầu Today (`role="timer"`, cập nhật mỗi giây, `Started at HH:MM`, nút Stop có `aria-label` đầy đủ); nút Start của goal khác `aria-disabled` + mô tả; goal đang chạy hiện badge. Stop mở D1 (`<dialog>` + `showModal`, focus vào Minutes, Esc = Keep running) điền sẵn `clamp(round(ms/60000), 1, 1440)`, hint "Rounded from m min s s", "Saved to <ngày bắt đầu>"; Save tạo entry `source = 'timer'` vào ngày bắt đầu qua `EntryService.add` (cùng validate; lỗi hiện trong dialog, timer còn nguyên); Discard huỷ. Xoá goal huỷ timer của goal đó (`GoalService.remove`), D2 có thêm dòng `goal.delete.timerNote`.
- **Nhắc nhở** (FR-13 … FR-15, NFR-07): `SettingsService` (kv `settings`, mặc định tắt / `20:00`, chuẩn hoá dữ liệu hỏng), `ReminderService.check(now)` (quy tắc `shouldNotify` trong domain, body dịch bằng `Translator` lúc gửi, `lang`, `tag: daily-reminder`, `data.url: #/today`, icon 192; ghi `lastReminderDate` chỉ khi notification thật sự được hiển thị), scheduler chạy lúc khởi động + mỗi `VITE_REMINDER_CHECK_INTERVAL_MS` + `visibilitychange`; `sw.ts` xử lý `notificationclick` (focus client cùng scope + gửi message `NAVIGATE` → `#/today`, hoặc `openWindow(scope + '#/today')`). Banner trong Today tính từ dữ liệu live (goal/entry/settings/now) bằng `shouldShowBanner`, không cần quyền notification, biến mất ngay khi mọi goal đạt. Card Reminders trong Settings: Switch, giờ `HH:MM` (lưu ngay + toast), chip 4 trạng thái quyền + mô tả, nút Allow (khi `default`), khung NFR-07 + mẹo iOS, nút `.ics` + hint.
- **`.ics`** (FR-16): `domain/ics.ts` sinh VCALENDAR (PRODID cố định, DTSTART ngày mai giờ nhắc dạng floating, DURATION PT15M, RRULE DAILY, VALARM DISPLAY), escape và folding 75 octet an toàn UTF-8, CRLF; tải bằng `integration/file-io.ts`.
- **Song ngữ**: 70 key mới `en`/`vi` nguyên văn DESIGN §7 (không tự dịch), parity test pass (allowlist thêm `notification.title` = en theo DESIGN). Quét vi component + E2E `vi-VN` cho TimerCard, Start vô hiệu, D1, ReminderBanner (1 và 3 goal), Settings Reminders 4 trạng thái → 0 phát hiện.
- Kết quả lần chạy cuối tại project root (mục 5): `npm run check` exit 0 (lint 0 lỗi/0 warning, typecheck 0 lỗi, Vitest **276/276**, build 206,5 kB gzip); `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test` **120/120** (20 dev M1 + 89 QC M1 + 11 dev M2).

## 2. Task

| ID | Trạng thái | Ghi chú |
| :- | :- | :- |
| M2-T1 | DONE | `src/domain/timer.ts` (`elapsedMs`, `roundedMinutes`, `splitMinSec`, `timerDate`, `previewTimer`, `clockTime`), `src/domain/reminder.ts` (`isValidReminderTime`, `isPastReminderTime`, `goalsNotOnTarget`, `reminderData` — dữ liệu có cấu trúc, tối đa 3 item + `more`, `shouldShowBanner`, `shouldNotify`) + test (bảng chân trị 5 điều kiện, qua nửa đêm, làm tròn 25:29/25:30/0:10/1500 phút) |
| M2-T2 | DONE | `src/services/timer-service.ts` (`current/start/stop/save/discard/watch`), `settings-service.ts`; `goal-service.ts` nhận `kv` tuỳ chọn để `remove` xoá `activeTimer` của goal bị xoá; test với Dexie thật trên fake-indexeddb |
| M2-T3 | DONE | `TimerCard.tsx`, `StopTimerDialog.tsx`, sửa `GoalCard.tsx` (prop `timer`, `onStartTimer`, Alert lỗi start), `Today.tsx`; test `Today.timer.test.tsx` (8 case, fake `Date`, tick thật) |
| M2-T4 | DONE | `src/services/notification-port.ts` (port), `src/integration/notifications.ts` (Notification API + `registration.showNotification`), `notification-click.ts` (hàm thuần dùng chung SW/test), `sw-messages.ts` (page nhận `NAVIGATE`), `src/services/reminder-service.ts`, `src/app/reminder-scheduler.ts`, `sw.ts`; `main.tsx` khởi động scheduler; test đủ cho từng file |
| M2-T5 | DONE | `Switch.tsx`, `ReminderBanner.tsx`, card Reminders trong `Settings.tsx` (thứ tự Language → Reminders → Storage → About), banner trong `Today.tsx`; test `Settings.reminders.test.tsx`, `Today.reminder.test.tsx` |
| M2-T6 | DONE | `src/domain/ics.ts` + test (en/vi, escape, folding), `src/integration/file-io.ts` + test, nút tải trong Settings |
| M2-T7 | DONE | `e2e/m2-timer.spec.ts` (5), `e2e/m2-reminder.spec.ts` (5), `e2e/m2-i18n.spec.ts` (1); helper mới trong `e2e/helpers/app.ts`; README mục Timer + "Reminders: limitations" |

## 3. File chính đã thêm/sửa

- i18n: `src/i18n/resources/en.json`, `vi.json` (+70 key M2), `src/i18n/parity.test.ts` (allowlist `notification.title`).
- Domain: `src/domain/timer.ts`, `reminder.ts`, `ics.ts` (+ `*.test.ts`).
- Services: `src/services/settings-service.ts`, `timer-service.ts`, `reminder-service.ts`, `notification-port.ts` (+ test); sửa `goal-service.ts`.
- Integration: `src/integration/notifications.ts`, `notification-click.ts`, `sw-messages.ts`, `file-io.ts` (+ test). `src/sw.ts`.
- App: `src/app/container.ts` (wire SettingsService/TimerService/ReminderService/NotificationPort), `reminder-scheduler.ts` (+ test), `src/main.tsx`.
- UI: `src/ui/components/TimerCard.tsx`, `StopTimerDialog.tsx`, `ReminderBanner.tsx`, `Switch.tsx`; sửa `GoalCard.tsx`, `ConfirmDialog.tsx` (prop `extra`), `Badge.tsx` (tone `danger`), `Icon.tsx` (stop/bell/cal), `error-messages.ts` (+5 mã), `hooks/useNow.ts` (làm mới khi `visibilitychange`), `screens/Today.tsx`, `Settings.tsx`, `Goals.tsx`, `styles/app.css`.
- Test helper: `src/test/container.ts` (fake notification port, option `permission`), `src/test/notifications.ts`; component test `Today.timer.test.tsx`, `Today.reminder.test.tsx`, `Settings.reminders.test.tsx`, sửa `Goals.test.tsx`, `error-messages.test.ts`.
- E2E: `e2e/m2-timer.spec.ts`, `m2-reminder.spec.ts`, `m2-i18n.spec.ts`, `e2e/helpers/app.ts` (`freezeClock(page, time)`, `at`, `advanceTo`, `kvGet`, `shownNotifications`, `fakeNotificationPermission`, `startTimer`, `timerCard`, `timerElapsed`, `stopDialog`).
- Config/docs: `eslint.config.js` (domain rule bỏ qua file test), `tsconfig.sw.json` (thêm `notification-click.ts`), `.env.example`, `README.md`.

## 4. Cách chạy

```bash
npm ci
npm run e2e:install            # Chromium + headless shell vào node_modules (PLAYWRIGHT_BROWSERS_PATH=0)
# không cần .env; tuỳ chọn VITE_REMINDER_CHECK_INTERVAL_MS (mặc định 60000)
npm run dev                    # http://localhost:5173 — KHÔNG có service worker: chỉ có banner, không có notification (xem mục 8)
npm run build && npm run preview   # http://localhost:4173 — có SW: notification, notificationclick, PWA
```

## 5. Cách test

| Lệnh | Kết quả lần chạy cuối (2026-10-10, project root) |
| :- | :- |
| `npm run lint` | exit 0, 0 lỗi, 0 warning |
| `npm run typecheck` | exit 0 (3 project app/sw/node) |
| `npm test` | 38 file, **276 passed / 0 failed** (gồm 19 test QC `tests/qc/m1-domain.test.ts`; M2 thêm 101 test) |
| `npm run build` | exit 0; `index-*.js` 671,6 kB raw / **206,5 kB gzip** (NFR-03 ≤ 250 kB), CSS 4,2 kB gzip, `dist/sw.js` |
| `npm run check` | exit 0 |
| `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test` | **120 passed / 0 failed** (27,7 s): `e2e/m1-*` 20, `tests/qc/*` 89, `e2e/m2-*` 11 |
| Ổn định | `vitest run src/ui` chạy 3 lần liên tiếp đều 83/83 |

Probe lint sau khi sửa `eslint.config.js` (AC13/AC17 M1 không đổi): `import Dexie from 'dexie'` và `import i18next from 'i18next'` ở `src/domain/probe.ts` → exit 1; `<button>Save</button>` ở `src/ui/probe.tsx` → exit 1; `import en from '../i18n/resources/en.json'` ở `src/domain/probe.test.ts` → exit 0 (chủ ý, xem Deviations 1). `rg dangerouslySetInnerHTML src` → 0.

## 6. Tự kiểm AC

| AC | Kết quả | Bằng chứng (test / lệnh) |
| :- | :- | :- |
| M2-AC1 | PASS | E2E `m2-timer.spec.ts` "M2-AC1": Start → `00:00:00`, `setFixedTime(+65 s)` → `00:01:05`, Start của Guitar `aria-disabled` + mô tả, click (force) không đổi timer. Unit `timer-service.test.ts`: `TIMER_ALREADY_RUNNING`, `GOAL_NOT_ACTIVE` (G4 upcoming, G5 ended), `GOAL_NOT_FOUND`, `TIMER_NOT_RUNNING` cho stop/save/discard. Component `Today.timer.test.tsx` "Start shows…" |
| M2-AC2 | PASS | E2E "M2-AC2": tua 25 phút → `00:25:00`, `page.reload()` → `00:25:00` rồi `00:25:02`; page mới cùng context → `00:25:10` và Start khác vẫn vô hiệu. Component "a running timer survives a remount" |
| M2-AC3 | PASS | E2E "M2-AC3": 25:31 → dialog điền `26`, hint làm tròn, "Saved to Friday, October 9", sửa 25 + "Pomodoro" → `25/30`, toast, entry hiện trong card; Discard sau 10 phút → không entry mới, timer biến mất, toast `Timer discarded`. Unit làm tròn `timer.test.ts` (25:29→25, 25:30→26, 0:10→1, 1500→1440); service test `save` ghi `source: 'timer'` |
| M2-AC4 | PASS | `timer-service.test.ts` "save across midnight": start 23:50 → save 00:20 → `date 2026-10-09`, 30 phút; "DATE_OUTSIDE_GOAL_PERIOD…timer stays" (goal đổi endDate) → lỗi, timer còn để Discard. Component "shows validation errors inside D1…" hiện Alert `That date is outside this goal's dates (2026-10-01 – 2026-10-08).` và Discard được |
| M2-AC5 | PASS | Service test "GoalService.remove discards the timer…" (xoá goal có timer → kv trống; timer goal khác giữ nguyên); E2E "M2-AC5" (D2 có `timerNote`, confirm → kv `activeTimer` null, Today không TimerCard, không alert); component `Goals.test.tsx` 2 case |
| M2-AC6 | PASS | Component `Settings.reminders.test.tsx`: mặc định tắt + `20:00` + ô giờ vô hiệu; bật → `requestPermission` đúng 1 lần (bật/tắt/bật vẫn 1); 4 trạng thái `default/granted/denied/unsupported` chip + mô tả; đổi `07:30` → kv + toast + hint `.ics`; text NFR-07 + iOS. E2E "M2-AC6" (reload giữ `07:30`, switch on, axe) và "four permission states" (default, unsupported qua init script; granted/denied ở test khác) |
| M2-AC7 | PASS | `reminder.test.ts` bảng chân trị với S1 tại 20:00:30 (true) và lần lượt tắt / denied|default|unsupported / 19:59 / `lastReminderDate = today` / mọi goal đạt → false; chỉ G1–G3 được tính. `reminder-service.test.ts`: body `en` = `3 goals left today: Read 0/30 min, Guitar 0/20 min, Spanish 0/17 min`; 1 goal → `1 goal left today: …`; 5 goal → `…, and 2 more` |
| M2-AC8 | PASS (tự động trên Chromium đầy đủ) / NOT VERIFIED (thủ công Chrome desktop) | E2E "M2-AC8" (`channel: 'chromium'`, `permissions: ['notifications']`): 19:59 → `getNotifications({tag})` rỗng; 20:01 (`visibilitychange`) → đúng 1 notification (`title 1% Better`, body, `lang en`, `tag`, `data.url #/today`), `lastReminderDate = 2026-10-09`; 3 lần kiểm nữa + reload → vẫn 1; ngày hôm sau gửi lại. Service test: 3 lần `check` sau khi gửi → false; hôm sau → true; không ghi `lastReminderDate` khi trình duyệt không hiển thị được. Scheduler: `reminder-scheduler.test.ts` (khởi động, mỗi interval, visibilitychange, không chồng chéo). Bước thủ công ở mục 8 |
| M2-AC9 | PASS (unit) / NOT VERIFIED (thủ công) | `notification-click.test.ts`: có client cùng scope → `close()`, `focus()`, `postMessage({type:'NAVIGATE', hash:'#/today'})`; không có → `openWindow(scope + '#/today')`; url lạ → `#/today`. `sw-messages.test.ts`: page đặt `location.hash` chỉ với hash hợp lệ. Thủ công: mục 8 |
| M2-AC10 | PASS | Component `Today.reminder.test.tsx` (denied, 20:01 → banner; 19:59 → không; ghi đủ → biến mất không reload; tắt → không; số nhiều). E2E "M2-AC10" (`Notification.permission` giả `denied` qua init script; 2 goal → 1 goal → tắt/bật → 0) |
| M2-AC11 | PASS (tự động) / NOT VERIFIED (import vào lịch thật) | `ics.test.ts`: đủ `BEGIN:VCALENDAR`, `VERSION:2.0`, `PRODID:-//1% Better//EN`, `UID:`, `DTSTAMP:`, `DTSTART:20261010T200000` (không `Z`), `DURATION:PT15M`, `RRULE:FREQ=DAILY`, `BEGIN:VALARM`, `TRIGGER:PT0M`, `ACTION:DISPLAY`, mọi dòng CRLF. E2E "M2-AC11": download tên `1percent-better-reminder.ics`, nội dung đúng. Component "downloads the .ics…" với giờ `07:30` |
| M2-AC12 | PASS | Toàn bộ spec M1 + QC pass (120/120). axe: Today với timer chạy (E2E "keep running + AC12"), D1 mở, Settings; Today có banner (E2E AC10); 0 request ngoài origin trong luồng timer |
| M2-AC13 | PASS | `reminder-service.test.ts` "translates body at send time in vi": body = `vi` của `notification.body_other` nội suy 3 goal, chứa `Read/Guitar/Spanish`, không chứa `goals left today`, `lang: 'vi'`; `en` số ít 1 goal. `ics.test.ts` "Vietnamese content": SUMMARY/DESCRIPTION giữ dấu, mọi dòng ≤ 75 octet, PRODID không đổi; escape `;` `,`. Quét vi component: TimerCard (gồm `aria-label` Stop), Start vô hiệu + mô tả, D1 mặc định và lỗi, banner 1/3 goal, Settings Reminders 4 trạng thái → 0; timer `00:01:05`, giờ `20:00` ở vi. E2E `m2-i18n.spec.ts` (`vi-VN`, 360×740): Start → 25:31 → D1 `26` → Save; bật nhắc (denied), 20:01 → banner vi; `.ics` SUMMARY vi; quét vi mỗi màn; axe D1/Settings/Today; không cuộn ngang; đổi ngôn ngữ khi timer chạy → vẫn `00:01:05` |

## 7. Deviations so với plan/design

1. **ESLint:** rule tách lớp của `src/domain/**` bỏ qua file `*.test.ts` để test domain đọc được `resources/en.json`/`vi.json` (AC11/AC13 yêu cầu test dùng chuỗi từ resource). Code domain thật vẫn bị chặn (probe exit 1).
2. **StopTimerDialog chỉ mount khi mở** (không giữ `<dialog>` đóng trong DOM): tránh nhân đôi nhãn `Minutes` trên trang — test QC M1 dùng `page.getByLabel(/^Minutes/)` toàn trang và strict mode sẽ vỡ nếu dialog đóng vẫn trong DOM.
3. **`notificationclick` điều hướng bằng `postMessage`** (`{type:'NAVIGATE', hash}`; page nghe qua `listenForNavigation`) thay vì `WindowClient.navigate()` — `navigate()` tải lại toàn bộ document, còn message chỉ đổi hash; không có client thì `clients.openWindow(scope + '#/today')` như ARCH §5.6.
4. **E2E dùng `page.clock.setFixedTime` + `visibilitychange`** thay vì `clock.install/fastForward`: clock tạm dừng của Playwright chặn cả `setTimeout(0)` mà Dexie liveQuery dùng để đẩy cập nhật, UI sẽ đứng. `advanceTo(page, t)` = đổi giờ cố định + phát `visibilitychange` (một trong 3 trigger thật của scheduler; `useNow` cũng làm mới khi tab hiện lại — cải thiện hành vi thật khi tab bị throttle). Đường interval được kiểm bằng unit test `reminder-scheduler.test.ts`.
5. **`e2e/m2-reminder.spec.ts` chạy trên Chromium đầy đủ (`test.use({ channel: 'chromium' })`, cấp file):** headless shell mặc định luôn trả `Notification.permission = 'denied'` kể cả sau `grantPermissions`. Chromium đầy đủ đã được `npm run e2e:install` tải sẵn (`node_modules/playwright-core/.local-browsers/chromium-1248`).
6. **Banner tính ở UI** từ dữ liệu live (goal, entry, settings, `now`) bằng `shouldShowBanner`/`reminderData` của domain để "biến mất không cần reload"; `ReminderService.getBannerState(now)` vẫn có theo ARCH §5.3 (được test) nhưng Today không gọi.
7. **`SettingsService`** (không có trong bảng ARCH §5.3) bọc kv `settings`: `get/update/setReminderEnabled/setReminderTime/watch`, chuẩn hoá dữ liệu hỏng về mặc định; `setReminderTime` ném `RangeError` với chuỗi không phải `HH:MM` (UI chỉ gửi giá trị hợp lệ từ `<input type="time">`).
8. **`GoalService` thêm tham số thứ 4 tuỳ chọn `kv`** (chữ ký cũ 2–3 tham số vẫn chạy, test QC M1 không đổi).
9. **`tsconfig.sw.json` include thêm `src/integration/notification-click.ts`** (file dùng chung SW và app, chỉ dùng kiểu structural).
10. **`notifications.show()` trả `false` khi không có SW registration** (dev server) hoặc `showNotification` ném lỗi → `check` không ghi `lastReminderDate`, lần kiểm sau thử lại. Không dùng `new Notification()` (ARCH §5.6).
11. **`aria-label` nút Stop đóng băng khi đang focus** (DESIGN §8 "cập nhật khi nhận focus") để SR không đọc lại mỗi giây; mất focus thì theo thời gian thật.
12. **Timer của goal không còn `active`** (goal bị sửa ngày sau khi start) vẫn hiện TimerCard để Stop/Discard; empty state "No active goals today" không hiện khi còn timer.
13. `.ics` có thêm `CALSCALE:GREGORIAN` và `METHOD:PUBLISH` (RFC 5545 khuyến nghị; không ảnh hưởng AC). `UID` = `<uuid>@one-percent-better`.
14. `Badge` thêm tone `danger` (chip `Blocked`, theo mockup 08).
15. Chip trạng thái quyền được đọc lại khi `focus`/`visibilitychange` (người dùng đổi quyền trong site settings rồi quay lại).
16. E2E click nút Start `aria-disabled` dùng `{ force: true }` (Playwright coi `aria-disabled` là chưa sẵn sàng và chờ vô hạn).

## 8. Known issues và giới hạn

- **Notification chỉ có ở bản build/preview** (cần service worker). `npm run dev` không có SW → chỉ có banner; không lỗi.
- **Kiểm thủ công chưa làm trong phiên này** (QC/user kiểm trên Chrome/Edge desktop với `npm run build && npm run preview`, mở `http://localhost:4173`):
  1. AC8/AC9: tạo goal; Settings → bật `Daily reminder`, bấm Allow trong hộp xin quyền; đặt `Reminder time` = giờ hiện tại + 1 phút; chờ ≤ 60 s (hoặc chuyển tab rồi quay lại) → notification "1% Better — 1 goal left today: …"; bấm vào notification → cửa sổ app được focus và ở `#/today`; đóng cửa sổ app rồi bấm notification (nếu còn) → mở cửa sổ mới ở Today. Trong cùng ngày không có notification thứ hai.
  2. AC11: import `1percent-better-reminder.ics` vào Google Calendar (Settings → Import & export) hoặc Outlook → sự kiện lặp hằng ngày từ ngày mai lúc giờ nhắc, có nhắc lúc bắt đầu.
  3. iOS/Android: không có thiết bị.
- Banner/notification có thể trễ tối đa `VITE_REMINDER_CHECK_INTERVAL_MS` (60 s) sau giờ nhắc khi tab mở liên tục; chuyển tab/quay lại thì kiểm ngay.
- `lastReminderDate` chỉ được ghi khi trình duyệt nhận notification; nếu `showNotification` lỗi liên tục (ví dụ Firefox chặn SW notification), app thử lại mỗi chu kỳ (không spam vì không hiện được).
- Headless shell của Playwright không hỗ trợ quyền notification → spec reminder chạy trên Chromium đầy đủ (chậm hơn ~1 s). QC viết test notification nên dùng `test.use({ channel: 'chromium' })` ở cấp file.
- Bundle 206,5 kB gzip (+7 kB so với M1), còn 43,5 kB cho M3–M5 trước khi phải lazy-load thêm.

## 9. Dispute (nếu có)

Không có.

## Assumptions

- A-M2-1: Khi bật switch mà quyền là `default`, app lưu `reminderEnabled = true` trước rồi mới xin quyền (dù bị từ chối, banner vẫn hoạt động theo FR-15).
- A-M2-2: Ô giờ dùng `<input type="time" step="60">`; giá trị rỗng/không hợp lệ từ trình duyệt bị bỏ qua, không lưu, không báo lỗi (không có mã lỗi trong ARCH §5.4).
- A-M2-3: Sau Save/Discard của D1, focus về `<h1>` Today (TimerCard đã biến mất, DESIGN §5); sau Keep running/Esc, focus về nút Stop.
- A-M2-4: Chip trạng thái quyền `denied` dùng tone `danger` (mockup 08 dùng `.badge.danger`).
- A-M2-5: `notification.body` dùng số nhiều i18next (`_one`/`_other`) với `count` = số goal chưa đạt; `notification.more` chỉ dùng khi > 3 goal.

## Open questions

- Không có câu hỏi chặn. Ghi nhận: DESIGN §7.5 không có `reminder.banner_one` cho `vi` (đúng quy tắc 7.0, `vi` chỉ có `_other`) — đã làm theo.

## Fix log

### Round 1 — theo report-M2-r1.md

| Defect | Nguyên nhân gốc | Cách sửa | Regression test |
| :- | :- | :- | :- |
| M2-D1 (Major) — gõ giờ nhắc bằng bàn phím ra giá trị sai (`0730AM` → `15:00`) | `<input type="time">` được kiểm soát bằng `reminderTime` lấy từ liveQuery; `onChange` ghi Dexie bất đồng bộ nên ngay sau mỗi phím React ghi lại giá trị cũ vào DOM, Chrome mất trạng thái soạn thảo từng phần của ô giờ (phím kế tiếp lại rơi vào phần giờ). Mỗi giá trị trung gian cũng hiện toast | Component mới `src/ui/components/ReminderTimeField.tsx`: khi ô đang focus, giá trị hiển thị là **draft cục bộ** phản ánh đúng những gì trình duyệt báo (kể cả `''` khi gõ dở), React không bao giờ ghi giá trị đã lưu đè lên lúc đang gõ; giá trị hợp lệ và khác giá trị đã lưu được lưu ngay (`SettingsService.setReminderTime`); toast `Reminder time saved` chỉ hiện **một lần** khi giá trị ổn định (700 ms sau phím cuối) hoặc khi blur; rời ô thì hiện lại giá trị đã lưu. `Settings.tsx` dùng component này | Component `src/ui/components/ReminderTimeField.test.tsx` (3 case: draft không bị echo liveQuery ghi đè, `''` không lưu, toast gộp, không lưu trùng/không hợp lệ); `Settings.reminders.test.tsx` "changing the time…" cập nhật (focus/blur, `''` hiển thị nhưng không lưu). E2E gõ phím thật: `e2e/m2-reminder.spec.ts` "M2-AC6" (`keyboard.type('0945PM')` → `21:45`, kv, toast, reload) và `e2e/m2-i18n.spec.ts` (`vi-VN`, `keyboard.type('0730')` + chỉnh SA/CH bằng ArrowDown nếu Chromium hiện bộ chọn 12 giờ → `07:30`, rồi `20:00`). QC `tests/qc/m2-qc.spec.ts` "M2-D1" nay **pass** |
| M2-D2 (Minor) — tên goal 60 ký tự liền nhau làm TimerCard kéo trang cuộn ngang ở 360 px | `h2` trong `.row` (flex) có `min-width: auto` mặc định và không ngắt từ dài — cùng cơ chế M1-D1 | `src/ui/styles/app.css`: `.timer h2 { min-width: 0; overflow-wrap: anywhere }`, `.dialog h2, .dialog p { overflow-wrap: anywhere }` (tóm tắt D1 và tiêu đề D2 cũng chứa tên goal) | E2E dev `e2e/m2-timer.spec.ts` "M2-D2 regression" (360×740, tên 60 `W`: Today, TimerCard, D1 mở, D2 xoá goal đều không cuộn ngang). **QC lưu ý:** `tests/qc/m2-qc.spec.ts` "M2-D2" đang `test.fail()` nên lần chạy này báo `Expected to fail, but passed` — vòng 2 bỏ dòng `test.fail()` |
| M2-D3 (Minor) — `TimerService.start/save` và `ReminderService.check` không nguyên tử khi gọi đồng thời | Chuỗi kiểm-rồi-ghi (`get` → `set`/`add`/`delete`, `shouldNotify` → `show` → `update`) không có khoá; hai lời gọi song song cùng thấy trạng thái cũ | `src/services/mutex.ts` (`Mutex.run` tuần tự hoá promise, sống sót khi task reject). `TimerService`: `start`, `save`, `discard` chạy qua một `Mutex` chung; `ReminderService.check` qua `Mutex` riêng. Kèm theo: `GoalCard` chặn double-click Start khi một lời gọi đang chạy (trước đây lần thứ hai cũng "ok" nên không thấy lỗi; sau khi tuần tự hoá, lần hai trả `TIMER_ALREADY_RUNNING` và sẽ hiện Alert — test QC "double-clicking Start gives one timer and no error alert" phát hiện, đã sửa) | `src/services/mutex.test.ts`; `timer-service.test.ts` "concurrent calls are serialised" (2 start → 1 ok + `TIMER_ALREADY_RUNNING`; 2 save → 1 entry + `TIMER_NOT_RUNNING`; save/discard đua → tối đa 1 thắng); `reminder-service.test.ts` "two simultaneous check()… send exactly once"; component `Today.timer.test.tsx` "double-clicking Start starts once". **QC lưu ý:** 3 test `it.fails` "M2-D3: …" trong `tests/qc/m2-domain.test.ts` nay pass nên Vitest báo đỏ "Error: Expect test to fail" — vòng 2 bỏ `.fails` |

Giới hạn còn lại của D3: khoá nằm trong một tab (một JS context). Hai **tab khác nhau** bấm Save đúng cùng lúc vẫn có thể tạo 2 entry vì IndexedDB không khoá được chuỗi kiểm-rồi-ghi giữa hai transaction riêng biệt; muốn chặn hẳn cần thêm thao tác nguyên tử ở `KvRepository` (ví dụ `putIfAbsent`/`deleteIfEquals` trong một transaction `rw` kv+entries) — đề xuất planner cân nhắc ở M3 cùng với `EntryRepository.getById`. Notification hai tab đã được trình duyệt gộp theo `tag`.

Lệnh đã chạy tại project root `D:\minh\Coderschool\GitHub\one-percent-better` (2026-10-10), kết quả thật:

| Lệnh | Kết quả |
| :- | :- |
| `npm run lint` | exit 0, 0 lỗi, 0 warning |
| `npm run typecheck` | exit 0 |
| `npm test` | 41 file; **313 passed / 3 failed** — 3 "failed" đúng là 3 `it.fails` M2-D3 của QC nay pass ("Error: Expect test to fail"). Chỉ test dev (`npx vitest run src`): 39 file, **266/266** |
| `npm run build` | exit 0; `index-*.js` 672,6 kB raw / **206,7 kB gzip**; `dist/sw.js` |
| `npm run check` | exit 1 **chỉ vì** bước `npm test` có 3 `it.fails` nói trên (chuỗi dừng trước build); lint/typecheck/build chạy riêng đều exit 0 |
| `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test` | **158 passed / 1 failed** (35,0 s) — 1 "failed" là QC "M2-D2" `test.fail()` nay báo "Expected to fail, but passed". QC "M2-D1" pass. Gồm 20 dev M1 + 89 QC M1 + 13 dev M2 + 37 QC M2 |

Không sửa file nào trong `tests/qc/`, `docs/qc/`, `docs/plan/`, `docs/design/`. Đề xuất không chặn của QC: (a) toast gộp khi đổi giờ — đã làm trong D1; (b) E2E gõ phím thật — đã thêm; (c) đếm `showNotification` bằng spy — giữ `getNotifications` ở E2E dev, phần đếm chính xác đã có ở service test + spec QC; (d) tie-break sort theo `createdAt` (M1-P1) và `timerNote` trong `aria-describedby` của D2 — để M3/M5 xem xét.
