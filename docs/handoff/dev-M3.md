# Dev handoff — M3 Ghi bù theo ngày, lịch sử, export/import JSON

Ngày: 2026-10-10. Developer build theo `docs/plan/TASKS.md` M3 (T1…T7, AC1…AC15; làm T7 đầu tiên), `ARCHITECTURE.md` v1.3 §5.2 (`EntryRepository.getById`, `TimerRepository.saveTimerEntry`, `BackupData`/`BackupRepository`), §5.3 (`prepareAdd`, `TimerService.save` nguyên tử, `BackupService`), §5.5 (file backup schemaVersion 1), ADR-08/12/14/15/16; `DESIGN.md` §4 S1 (link ghi bù, banner backup), S2 (tên goal = link), S4 (phần M3), S5 Day, S7 Backup + D3, §7 (key `day.*`, `goal.detail.*` M3, `entry.source.*`, `backup.banner.*`, `settings.backup.*`, `import.*`, `errors.IMPORT_*`, `empty.day.*`, `empty.detail.*`, `today.pastDayLink`, `goalCard.addEntry|plusOneSrDay|progressLabelDay`, `entry.form.labelAddDay`, `common.working|emptyValue`, `toast.backup*`), mockup `05-day.html`, `07-goal-detail.html`, `08-settings.html`.

## 1. Tóm tắt

- **M3-T7 (làm đầu tiên):** `EntryRepository.getById` (Dexie `entries.get(id)`); `EntryService.update/remove` dùng nó, bỏ hẳn quét `getByDateRange('0000-01-01', …)` (`rg "0000-01-01" src/services` → 0). `EntryService.prepareAdd(input, now)` = validate goal/field/ngày + dựng `LogEntry`, không ghi; `add` = `prepareAdd` → kiểm 1440 → `put`. Interface `TimerRepository.saveTimerEntry(expected, entry, maxDayMinutes)` + `DexieTimerRepository`: **một** transaction `rw` trên `goals + entries + kv`, kiểm `activeTimer` còn đúng (goalId + startedAt) → goal còn → tổng phút ngày ≤ 1440 → `put(entry)` + `delete('activeTimer')`; không await promise ngoài Dexie. `TimerService.save` = `prepareAdd` → `saveTimerEntry` → ánh xạ `timer-changed → TIMER_NOT_RUNNING`, `goal-missing → GOAL_NOT_FOUND`, `day-limit → ENTRY_DAY_LIMIT_EXCEEDED` (qua `checkDayLimit` để có `params.remaining`). Mutex trong tab giữ nguyên. `TimerService` nhận thêm tham số thứ 4 `timers: TimerRepository` (bắt buộc; nối trong `container.ts`).
- **Day `#/day/:date`** (FR-17): DateNav (Previous/Next + `<input type="date" max=today>`, Next vô hiệu ở hôm nay, focus giữ trên nút sau khi đổi ngày), heading `dateLong(date, {withYear})`, liệt kê **mọi** goal có khoảng chứa ngày (kể cả ended/archived) theo `createdAt`, GoalCard variant `day` (nút `Add entry`, `aria-label` progressbar `{goal} on {date}`, form `Add entry for {goal} on {date}`, badge nguồn Manual/Timer trên từng entry, pill +1% với chữ ẩn `Target reached`, dòng `No time logged…` khi 0 phút, không có timer, không có tiêu đề "Today's entries"). Ngày tương lai: thông báo `errors.DATE_IN_FUTURE` + `Go to today`, không form. Ngày sai (`abc`, `2026-13-40`, `2026-02-30`): màn `That date isn't valid.` + link `Go to Today`. Today có link `Missed a day? Log time for a past day` → `#/day/<hôm qua>`.
- **Goal detail `#/goals/:id`** (FR-18, phần M3): link `‹ Goals`, h1 tên + badge trạng thái, why (blockquote nghiêng, ngoặc kép bằng CSS), dòng `30 min/day · 2026-10-01 – 2026-10-31`, Edit (→ form) / Delete (D2, xong về `#/goals`), card **History**: bảng Date (link → Day) / Minutes / Note (`—` khi rỗng) / Source, mới nhất trước (date desc, cùng ngày thì `createdAt` desc), < 640 px xếp chồng; rỗng → `No entries yet`. Id không tồn tại → Not found (goal). Tên goal ở Goals là link.
- **Backup** (FR-19 … FR-21, NFR-04, NFR-05): `domain/backup.ts` (zod strict cho goal/entry, schema root/settings strip; thứ tự kiểm: kích thước > 5 MB → `IMPORT_FILE_TOO_LARGE`; `JSON.parse` → `IMPORT_INVALID_JSON`; không phải object / `app` sai / thiếu `schemaVersion` → `IMPORT_INVALID_SCHEMA`; `schemaVersion ≠ 1` → `IMPORT_UNSUPPORTED_VERSION` (params `v`); zod → `IMPORT_INVALID_SCHEMA`; `checkIntegrity` (id trùng, `goalId` lạ, entry ngoài khoảng goal, > 1440 phút/goal/ngày, `endDate < startDate`) → `IMPORT_INTEGRITY`); `backupReminder` (A-12). `DexieBackupRepository.exportAll/replaceAll` (một transaction `rw` goals+entries+kv: clear → bulkAdd → put `settings` → delete `activeTimer`; **không** chạm kv `locale`). `BackupService.export(now)` (file `1percent-better-backup-YYYY-MM-DD.json`, cập nhật `lastBackupAt`, ghi luôn vào file), `parse(text, sizeBytes) → BackupPreview`, `import(preview)` (`lastReminderDate = null`, settings chuẩn hoá), `counts()`. Settings card Backup: mô tả, banner nhắc (không nút), `Last backup: Never | <dateShort>`, nút Export (tải file + toast) / Import… (input file ẩn, `.json`), hint, Alert lỗi theo mã, D3 `Replace all data?` (ConfirmDialog, focus Cancel, body `import.body` với `format.*Count` số nhiều), toast `Backup imported: 5 goals, 23 entries`, nút `Working…` khi bận. Today: BackupBanner (có nút `Back up now` → Settings) dưới ReminderBanner.
- **Song ngữ:** 50 key mới `en`/`vi` nguyên văn DESIGN §7 (không tự dịch; không thiếu bản `vi` nào). Parity test pass không cần thêm allowlist (`common.emptyValue` = `—` không chứa chữ nên được miễn tự động). Quét vi component + E2E `vi-VN` 360 px trên Day (5 trạng thái), Goal detail (có/không lịch sử), Settings Backup (`Never`, > 30 ngày, D3, 5 Alert `IMPORT_*`), BackupBanner → 0 phát hiện.
- **Fixture E2E** `e2e/fixtures/`: `sample-backup.json` = dataset S1 (unit test `src/test/fixtures.test.ts` khẳng định deep-equal với `datasetS1()`), `invalid-json.json` (`{abc`), `invalid-schema.json` (thiếu `goals`, `minutes` chuỗi), `unsupported-version.json` (`schemaVersion: 2`), `invalid-integrity.json` (entry trỏ goal `ghost`), `xss-note.json` (1 goal "Read", 1 entry ngày 2026-10-08 note `<script>alert(1)</script>`). Helper `importBackup(page, fixture?, copy?)` / `chooseBackupFile(page, fixture)` / `fixturePath(name)` trong `e2e/helpers/app.ts` — từ M3 spec nạp dữ liệu qua Import thật.
- Kết quả lần chạy cuối tại project root (mục 5): lint 0/0, typecheck 0, build 214,9 kB gzip, Vitest **406/407** — 1 fail là test QC M2 `tests/qc/m2-r2-domain.test.ts` "entries.add throwing once" (xem mục 9 Dispute, không sửa test QC); Playwright **213/213** (dev M1–M3 + QC M1–M2).

## 2. Task

| ID | Trạng thái | Ghi chú |
| :- | :- | :- |
| M3-T7 | DONE | `src/data/repositories.ts` (+`getById`, `TimerRepository`, `SaveTimerEntryOutcome`, `BackupRepository` chú thích), `src/data/dexie/entry-repo.ts` (`getById`), `src/data/dexie/timer-repo.ts` + `timer-repo.test.ts`, `src/services/entry-service.ts` (`prepareAdd`, `getById`, `watchByGoal`), `timer-service.ts`, `src/services/timer-save-atomic.test.ts` (hai tab, ánh xạ outcome, spy getById), `container.ts` |
| M3-T1 | DONE | `src/ui/screens/Day.tsx` + `Day.test.tsx`, `src/ui/components/DateNav.tsx`, sửa `GoalCard.tsx` (variant `day`), `EntryRow.tsx` (`showSource`), `PlusOnePill.tsx` (`srKey`), `Today.tsx` (link ghi bù), `router.tsx` |
| M3-T2 | DONE | `src/ui/screens/GoalDetail.tsx` + `GoalDetail.test.tsx`, `src/ui/components/HistoryTable.tsx`, `EmptyState.tsx` (`compact`, `h3`), `Goals.tsx` (tên = link), `router.tsx` |
| M3-T3 | DONE | `src/domain/backup.ts` + test, `src/domain/settings.ts` (`normalizeSettings` chuyển từ service sang domain, service re-export), `src/data/dexie/backup-repo.ts` + test (rollback) |
| M3-T4 | DONE | `src/services/backup-service.ts` + test, `src/integration/file-io.ts` (`readTextFile`, `JSON_MIME_TYPE`), `Settings.tsx` (card Backup + D3), `Today.tsx` (BackupBanner), `src/ui/components/BackupBanner.tsx`, `Settings.backup.test.tsx` |
| M3-T5 | DONE | `e2e/fixtures/*.json`, `e2e/m3-day.spec.ts` (4), `m3-history.spec.ts` (3), `m3-backup.spec.ts` (5), `src/test/fixtures.test.ts` |
| M3-T6 | DONE | `src/i18n/resources/en.json`, `vi.json` (+50 key), `src/ui/error-messages.ts` (+5 mã `IMPORT_*`), `e2e/m3-i18n.spec.ts` (1 luồng dài ở `vi-VN`), quét vi trong component test |

## 3. File chính đã thêm/sửa

- Data: `src/data/repositories.ts`, `src/data/dexie/entry-repo.ts`, **mới** `timer-repo.ts`, `backup-repo.ts` (+ test).
- Domain: **mới** `src/domain/backup.ts`, `settings.ts` (+ test).
- Services: `entry-service.ts`, `timer-service.ts`, `settings-service.ts` (re-export `normalizeSettings`), **mới** `backup-service.ts`, test `timer-save-atomic.test.ts`, `backup-service.test.ts`; sửa `timer-service.test.ts` (constructor 4 tham số).
- App: `container.ts` (`DexieTimerRepository`, `BackupService`), `router.tsx` (`goals/:id`, `day/:date`).
- UI: **mới** `screens/Day.tsx`, `GoalDetail.tsx`, `components/DateNav.tsx`, `HistoryTable.tsx`, `BackupBanner.tsx`; sửa `GoalCard.tsx`, `EntryRow.tsx`, `PlusOnePill.tsx`, `EmptyState.tsx`, `Icon.tsx` (right/download/upload), `Goals.tsx`, `Today.tsx`, `Settings.tsx`, `error-messages.ts`, `styles/app.css`.
- Integration: `file-io.ts` (`readTextFile`, `JSON_MIME_TYPE`).
- i18n: `en.json`, `vi.json`.
- Test: `Day.test.tsx`, `GoalDetail.test.tsx`, `Settings.backup.test.tsx`, `src/test/fixtures.test.ts`; sửa `Settings.reminders.test.tsx` (thứ tự card có Backup), `error-messages.test.ts`.
- E2E: `e2e/fixtures/*`, `e2e/m3-*.spec.ts`, `e2e/helpers/app.ts`.
- Docs: `README.md` (mục "Past days and history", "Backup and restore" + khuyến nghị cài PWA, fixture). `.env.example` không đổi (không có biến mới).

## 4. Cách chạy

```bash
npm ci
npm run e2e:install            # Chromium vào node_modules (PLAYWRIGHT_BROWSERS_PATH=0)
npm run dev                    # http://localhost:5173
npm run build && npm run preview   # http://localhost:4173 (PWA)
```

Dữ liệu mẫu: Settings → Import backup… → chọn `e2e/fixtures/sample-backup.json` → Replace all data.

## 5. Cách test

Lệnh đã chạy tại `D:\minh\Coderschool\GitHub\one-percent-better` (2026-10-10), kết quả thật:

| Lệnh | Kết quả |
| :- | :- |
| `npm run lint` | exit 0, 0 lỗi, 0 warning |
| `npm run typecheck` | exit 0 |
| `npm test` | 53 file; **406 passed / 1 failed** — fail duy nhất: `tests/qc/m2-r2-domain.test.ts` › "TimerService.save: entries.add throwing once…" (test QC M2 gắn vào implementation cũ mà M3-T7 thay thế; mục 9). Test dev + QC còn lại xanh. M3 thêm 90 test |
| `npm run build` | exit 0; `index-*.js` 703,1 kB raw / **214,9 kB gzip** (NFR-03 ≤ 250 kB), CSS 4,7 kB gzip, `dist/sw.js` |
| `npm run check` | exit 1 **chỉ vì** test QC nói trên (chuỗi dừng ở `npm test`); lint/typecheck/test dev/build chạy riêng đều exit 0 |
| `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test` | Lần 2 (sạch): **213 passed / 0 failed** (58,1 s): dev M1+M2 32 + dev M3 **13** + QC M1/M2 168. Lần 1: 212 passed / 1 failed — `tests/qc/m2-notify.spec.ts` "hostile goal names…" timeout 60 s ngay ở bước setup `await page.evaluate(() => navigator.serviceWorker.ready)` khi máy đang chạy song song spec stress `m2-r2-dblclick` (28,9 s); chạy riêng `--repeat-each 3` → 3/3 pass. Không liên quan M3 (SW ready chậm dưới tải) |
| Ổn định | `Settings.backup` + `Day` + `GoalDetail` component test chạy 5 lần liên tiếp 23/23 |

## 6. Tự kiểm AC

| AC | Kết quả | Bằng chứng (test / lệnh) |
| :- | :- | :- |
| M3-AC1 | PASS | E2E `m3-day.spec.ts` "M3-AC1" (S1 import; `#/day/2026-10-05` Guitar 30 phút note Scales → `30/20`, +1%, nguồn Manual; Today Guitar vẫn `0/20`; quay lại Day thấy entry; sửa 1400 → `1,400/20`; thêm 41 → lỗi "up to 40 more"; xoá → `0/20`). Component `Day.test.tsx` "M3-AC1" (entry trong DB `date = 2026-10-05`, `source manual`, 1441 → `ENTRY_MINUTES_INVALID`, giới hạn 1440, xoá) |
| M3-AC2 | PASS | E2E "M3-AC2" (`#/day/2026-10-10`: thông báo, 0 nút Add entry, 0 form, Next vô hiệu; `#/day/2026-10-09` Next vô hiệu, Prev → 10-08 và giữ focus). Service `entry-service.test.ts` "validates every date" (`2026-10-10` → `DATE_IN_FUTURE`). Component "M3-AC2" |
| M3-AC3 | PASS | E2E "M3-AC3" (`2026-09-20`: Guitar + Spanish, không Read/Marathon; `2026-06-30`: Old course `15/15`; `2025-12-25`: empty + link Goals). Service test G1 ngày 2026-09-30 → `DATE_OUTSIDE_GOAL_PERIOD`. Component "M3-AC3" |
| M3-AC4 | PASS | E2E "M3-AC4 + M3-AC12" (`2026-13-40`, `abc` → `That date isn't valid.` + link `Go to Today` → Today, axe sạch). Component "M3-AC4" (+ `2026-02-30`) |
| M3-AC5 | PASS | E2E `m3-history.spec.ts` "M3-AC5" (Goals → link Guitar → `#/goals/g2`, 13 hàng, hàng đầu `2026-10-08`, cột Source; timer 25:31 Save → 14 hàng, hàng đầu `2026-10-09 · 26 min · Timer · —`; link ngày → Day; `#/goals/khong-ton-tai` → Not found). Component `GoalDetail.test.tsx` (sắp xếp cùng ngày theo `createdAt`, cột, empty, Not found, Delete D2) |
| M3-AC6 | PASS | E2E `m3-backup.spec.ts` "M3-AC6" (download `1percent-better-backup-2026-10-09.json`, `app`, `schemaVersion 1`, 5 goals, 23 entries, `settings`, không chứa `locale`; `Last backup: 2026-10-09` kể cả sau reload; banner biến mất; 0 request ngoài origin). Service `backup-service.test.ts` export; component `Settings.backup.test.tsx` (download qua anchor giả) |
| M3-AC7 | PASS | Integration `backup-repo.test.ts` "round-trip" + service "round-trip" (export → DB mới → import → goals/entries deep-equal mọi field). E2E "M3-AC7" (context mới, import sample → Read `0/30`, Guitar `0/20`, Spanish `0/17`) và "round-trip through the UI" (export → xoá Read → import file vừa tải → Read với 8 entry) |
| M3-AC8 | PASS | E2E "M3-AC8 + M3-AC12" (goal Temp + timer chạy; D3 "5 goals, 23 entries … (1 goal, 0 entries)", focus Cancel, axe; Cancel → chỉ Temp; Confirm → 5 goal S1, Temp mất, kv `activeTimer` null, không TimerCard). Service test "import replaces everything…" (`activeTimer` xoá, `lastReminderDate = null`). Component "M3-AC8" |
| M3-AC9 | PASS | Service "every parse error…" (5 MB+1 → `IMPORT_FILE_TOO_LARGE`; `{abc` → `IMPORT_INVALID_JSON`; thiếu goals / app sai / minutes chuỗi → `IMPORT_INVALID_SCHEMA`; `schemaVersion 2` → `IMPORT_UNSUPPORTED_VERSION`; goalId lạ / id trùng / 1441 phút / ngoài khoảng → `IMPORT_INTEGRITY`; DB nguyên vẹn). Domain `backup.test.ts`. Integration `backup-repo.test.ts` rollback (`bulkAdd` lỗi và id trùng). E2E "M3-AC9" (4 fixture lỗi → Alert đúng, không D3, Temp còn, Last backup Never). Component "M3-AC9" (gồm file 5 MB+1 thật) |
| M3-AC10 | PASS | Domain `backupReminder` (null+goal → never; 31 ngày → old 31; 29/30 ngày → null; 0 goal → null). Component `Settings.backup.test.tsx` "M3-AC10" (Settings 31 ngày hiện / 29 ngày không / không goal không; Today có nút `Back up now`) |
| M3-AC11 | PASS | E2E `m3-history.spec.ts` "M3-AC11" (import `xss-note.json` → ô Note = literal `<script>alert(1)</script>`, không `<script>` chứa `alert(1)` trong DOM, 0 dialog, Day cũng literal). Component "renders user notes as literal text". `rg dangerouslySetInnerHTML src` → 0 |
| M3-AC12 | PASS | Toàn bộ spec M1, M2 (dev + QC) pass trong lần chạy đầy đủ (mục 5). axe: Day (default, form mở, lỗi), Goal detail, Settings với D3 mở, Settings có Alert lỗi — 0 serious/critical. 0 request ngoài origin trong luồng export/import |
| M3-AC13 | PASS | Component quét vi: Day (mặc định, không goal, goal chưa entry, tương lai, sai định dạng), Goal detail (có/không lịch sử), Settings Backup (`Never`, 31 ngày, D3, 5 Alert `IMPORT_*`), BackupBanner → 0. Định dạng vi: heading Day = `Intl vi-VN` có năm; History `08/10/2026`; Last backup `08/09/2026`/`09/10/2026`; D3 en `5 goals, 23 entries` và `1 goal, 1 entry`, vi `5 mục tiêu, 23 lần ghi`. Service: file export không có `locale` (chuỗi JSON không chứa "locale"), `schemaVersion` 1; sau import kv `locale = 'vi'` giữ nguyên (repo + service test). E2E `m3-i18n.spec.ts` (`vi-VN`, 360×740): chọn Tiếng Việt → import (D3 vi) → Today → Day ghi bù → tương lai/sai → Goal detail → Export → `Lần sao lưu gần nhất: 09/10/2026` → `{abc` → Alert vi → import lại → reload vẫn vi; quét vi mỗi màn; axe Day/Goal detail/Settings; không cuộn ngang |
| M3-AC14 | PASS | `timer-repo.test.ts` "DexieEntryRepository.getById" (deep-equal `e-g1-5`, `khong-ton-tai` → undefined, sau delete → undefined). `timer-save-atomic.test.ts` "EntryService.update/remove use getById only" (spy: `getById` đúng 1 lần, `getByDateRange`/`getByGoal` 0 lần; id lạ → `ENTRY_NOT_FOUND`, DB không đổi). `entry-service.test.ts` M1-AC7 vẫn pass. `rg -n "0000-01-01" src/services` → 0 |
| M3-AC15 | PASS | `timer-save-atomic.test.ts` (hai tab = hai bộ repo + EntryService + TimerService trên **một** DB): `Promise.all` 2 save → đúng 1 ok + 1 `TIMER_NOT_RUNNING`, 1 entry `timer` 30 phút, `activeTimer` xoá, **20/20** vòng; save đua discard → 0/1 entry, timer xoá; timer bị thay bằng G2 → `timer-changed`, không entry G1, timer G2 nguyên; fake repo `timer-changed` → `TIMER_NOT_RUNNING`; `day-limit 1430` → `ENTRY_DAY_LIMIT_EXCEEDED` `remaining 10`; goal xoá → `GOAL_NOT_FOUND`, không entry mồ côi; validate lỗi không gọi repo; repo ném lỗi 1 lần → call đó reject, timer còn, call xếp hàng thành công. `timer-repo.test.ts`: `day-limit` khi G1 đã có 1420 phút → `{ status: 'day-limit', existingMinutes: 1420 }`, `activeTimer` còn; `goal-missing` sau `deleteWithEntries(G1)`; rollback khi `put` entry hoặc `delete` kv lỗi; 2 repo đua 20/20. Mọi test M2 dev + spec QC M2 (Playwright) pass; 1 test Vitest QC M2 xem mục 9 |

## 7. Deviations so với plan/design

1. **`normalizeSettings` chuyển sang `src/domain/settings.ts`** (data layer `DexieBackupRepository.exportAll` cần chuẩn hoá settings mà không được import `services`); `settings-service.ts` re-export nên `tests/qc/m2-domain.test.ts` và import cũ không đổi.
2. **`TimerService` constructor thêm tham số thứ 4 bắt buộc `timers: TimerRepository`** (ARCH §5.3 "M3 thêm"). Không có test QC nào khởi tạo `TimerService` trực tiếp.
3. **Dòng thông tin ở Goal detail** dùng lại key `goals.rowDaily`/`goals.rowTotal` (`30 min/day · 2026-10-01 – 2026-10-31`) vì DESIGN §7.6.4 không có key riêng cho dòng này; mockup 07 viết thứ tự ngược (`range · 30 min/day`) nhưng nội dung như nhau.
4. **Why ở Goal detail**: dấu ngoặc kép của mockup vẽ bằng CSS (`::before/::after`), không đưa vào JSX (tránh hardcode).
5. **Schema import**: zod `.strict()` cho bản ghi goal/entry (field lạ → `IMPORT_INVALID_SCHEMA`); object gốc và `settings` dùng mặc định strip (field lạ bị bỏ) và `settings` thiếu field thì về mặc định — cùng quy tắc với `normalizeSettings`. `id` giới hạn 1–200 ký tự, tối đa 10.000 goal / 200.000 entry trong một file (chặn file độc hại nhưng < 5 MB).
6. **Export ghi `lastBackupAt = now` vào cả file** (không chỉ kv) để máy đích sau khi import thấy ngày backup gần nhất; `import` giữ `lastBackupAt` trong file, chỉ reset `lastReminderDate` (theo ARCH §5.5).
7. **BackupBanner dùng `role="note"`** thay vì `role="status"` (DESIGN §5 ghi Banner tone neutral; ReminderBanner vẫn `status`): nhắc backup là nội dung tĩnh, và `status` thứ hai làm test M1/M2 (`getByRole('status')` cho toast) mơ hồ.
8. **Day: nút Previous/Next là `<button>` + `navigate()`** (mockup dùng `<a>`), để focus giữ trên nút sau khi đổi ngày (DESIGN S5) mà không remount; `<input type="date">` bỏ qua giá trị > hôm nay hoặc không hợp lệ (A-M3-1).
9. **Settings nạp thêm `goalService.watchAll()`** chỉ để đếm goal cho điều kiện A-12.
10. **EmptyState** thêm `compact` + `heading="h3"` (History rỗng nằm trong card có h2 `History`).
11. **`readTextFile`** trong `integration/file-io.ts` dùng `Blob.text()` nếu có, fallback `FileReader` (jsdom không có `Blob.text()`); kích thước kiểm bằng `file.size` trước khi đọc.
12. Cột `Source` trong History và badge nguồn trên Day dùng `entry.source.*`; ở Today (variant cũ) không hiện badge nguồn (DESIGN S1 không có).

## 8. Known issues và giới hạn

- Day nạp entry theo ngày qua `watchByDateRange(date, date)` và goal qua `watchAll()`; với vài nghìn entry vẫn nhẹ (chỉ 1 ngày).
- `lastBackupAt` hiển thị theo ngày cục bộ của máy đang xem (A-D11); file từ múi giờ khác có thể lệch một ngày.
- Nhập một file hợp lệ nhưng có goal `archived: true` (M5) được chấp nhận và hiện trong nhóm Ended ở Goals (M5 sẽ thêm nhóm Archived).
- Hai tab cùng `add` thủ công cùng goal/ngày vẫn có thể vượt 1440 một chút (giới hạn ARCH §10, ngoài phạm vi M3).
- Bundle 214,9 kB gzip (+7,9 kB so với M2), còn ≈ 35 kB cho M4–M5 trước khi phải lazy-load (ADR-10 đã dự kiến lazy-load chart).
- Kiểm thủ công chưa làm trong phiên này: mở `npm run preview`, Settings → Export trên Chrome thật (hộp thoại Save của trình duyệt), chọn file qua hộp chọn file hệ điều hành, import trên profile/trình duyệt khác (QC có thể dùng 2 context Playwright như E2E AC7). Trên iOS Safari: nút Export tải file vào Files; chưa có thiết bị.

## 9. Dispute (nếu có)

- **`tests/qc/m2-r2-domain.test.ts` › "TimerService.save: entries.add throwing once rejects that call, keeps the timer, and later start/save/discard still work"** nay đỏ (406/407). Test này `vi.spyOn(entryService, 'add').mockRejectedValueOnce(...)` và mong `save` thứ nhất reject, `save` thứ hai (xếp hàng) thành công — tức là gắn vào chi tiết cài đặt M2 "`save` gọi `EntryService.add`". ARCH v1.3 §5.3/ADR-16 và TASKS M3-T7(d) yêu cầu `save` = `prepareAdd` → `TimerRepository.saveTimerEntry` (một transaction), nên `save` **không còn** gọi `add`; spy không bao giờ được chạm, cả hai `save` chạy thật → lần hai nhận `TIMER_NOT_RUNNING` (đúng ADR-16) và assertion `queued.value.ok === true` thất bại. Hành vi mà test muốn bảo vệ (lỗi I/O giữa vùng khoá không làm kẹt Mutex, timer còn khi lỗi, lần gọi xếp hàng vẫn chạy) được giữ và kiểm bằng test dev mới `src/services/timer-save-atomic.test.ts` › "a throwing saveTimerEntry rejects that call, keeps the timer and does not wedge the Mutex; a queued save then succeeds" (mock `saveTimerEntry` ném lỗi một lần). Đề nghị QC cập nhật test này sang spy `saveTimerEntry` (hoặc `prepareAdd`) ở vòng QC M3. Không sửa file trong `tests/qc/`.

## Assumptions

- A-M3-1: `<input type="date">` trên Day có `max = hôm nay`; giá trị không hợp lệ hoặc trong tương lai do trình duyệt cho phép gõ bị bỏ qua (không điều hướng, không lỗi — không có mã lỗi trong ARCH §5.4 cho việc này).
- A-M3-2: Link "Missed a day?" trỏ tới **hôm qua**; hiện ở Today khi đã có goal (kể cả trạng thái "No active goals today"); không hiện khi chưa có goal nào.
- A-M3-3: History sắp xếp `date` giảm dần, cùng ngày thì `createdAt` giảm dần (mới nhất trước).
- A-M3-4: Sau Confirm/Cancel D3, focus trả về nút `Import backup…`; sau Delete ở Goal detail, điều hướng về `#/goals` (focus h1 Goals theo PageHeader).
- A-M3-5: Day liệt kê cả goal `archived` (DESIGN S5 "kể cả ended, archived"); M3 chưa có archive nên chưa có test riêng.

## Open questions

- Không có câu hỏi chặn. DESIGN §7 có đủ bản `vi` cho mọi chuỗi M3.

## Cách dựng test "hai tab" cho M3-AC15 (cho QC)

```ts
// Một DB fake-indexeddb, hai bộ repository/service độc lập (KHÔNG dùng chung TimerService, vì Mutex trong tab sẽ che lỗi).
const db = createTestDatabase(); await openDatabase(db);
function tab() {
  const goals = new DexieGoalRepository(db), entries = new DexieEntryRepository(db), kv = new DexieKvRepository(db);
  const entryService = new EntryService(entries, goals);
  return new TimerService(kv, goals, entryService, new DexieTimerRepository(db));
}
await db.kv.put({ key: 'activeTimer', value: { goalId: 'g1', startedAt: '2026-10-09T02:30:00.000Z' } });
const [a, b] = await Promise.all([tab().save({ minutes: 30, note: 'A' }, now), tab().save({ minutes: 30, note: 'B' }, now)]);
// đúng 1 ok, 1 TIMER_NOT_RUNNING; entries [goalId+date] = ['g1','2026-10-09'] có 1 bản ghi; kv activeTimer undefined
```

Gọi thẳng `new DexieTimerRepository(db).saveTimerEntry(expectedTimer, entry, 1440)` để kiểm các nhánh `timer-changed` / `goal-missing` / `day-limit` (xem `src/data/dexie/timer-repo.test.ts`). Fixture E2E sẵn có: `e2e/fixtures/sample-backup.json` (S1), `invalid-json.json`, `invalid-schema.json`, `unsupported-version.json`, `invalid-integrity.json`, `xss-note.json`; helper `importBackup(page)` nạp S1 qua UI.
