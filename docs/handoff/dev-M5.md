# Dev handoff — M5 Đường cong 1%, Goal detail đầy đủ, archive, trạng thái rỗng/lỗi

Ngày: 2026-10-10. Developer build theo `docs/plan/TASKS.md` M5 (T1…T7, AC1…AC13), `ARCHITECTURE.md` v1.3 (§4 "Đường cong", §5.1 route lazy, §5.3 `GoalService.setArchived` / `StatsService.curve`, §5.4 `GOAL_TIMER_RUNNING`, §5.5 `plusOneShown`, ADR-10), `DESIGN.md` §4 S1/S2/S4/S6/S9, §5 (CurveChart, PlusOnePill `animate`, ErrorState, EmptyState), §7 (`goal.detail.*`, `goals.archive/restore`, `goals.groupArchived`, `goal.status.archived`, `toast.goalArchived/Restored`, `plusone.live`, `errors.GOAL_TIMER_RUNNING`, `empty.detail.curve`, `errorBoundary.*`), §7.4, §8 (biểu đồ, a11y), §10 A-D4 (Range), mockup `07-goal-detail.html` (oracle: Read tại 2026-10-09 ideal +9,4 %, you +8,3 %), `02-goals.html`. Backlog gộp: M1-P1, M2-P2 (M5-AC13); sửa thêm M3-D3, M3-D4.

## 1. Tóm tắt

- **Domain** `src/domain/curve.ts`: `curve(goal, entries, today)` → `ideal` (1 điểm/ngày cả khoảng, `1.01^k`, k = 1…periodDays), `actual` (startDate → min(today, endDate), `1.01^n(d)`, ngày lỡ không trừ), `headlinePercent` = `(1.01^n − 1) × 100` làm tròn 1 chữ số, `idealPercent`, `elapsedDays`, `daysOnTarget`, `actualFactor`. `src/domain/plusone.ts`: `newlyMetGoals` (goal vừa chuyển "chưa đạt → đạt" và chưa hiện hôm nay), `markPlusOneShown`. `src/domain/goal.ts`: tie-break `id` cho mọi phép sắp xếp (`byId`, `byCreatedAt`, dùng trong `groupGoals`/`activeGoals`, Today/Day). `src/domain/backup.ts` (M3-D3): goal trong file backup phải qua đúng giới hạn form (daily 1–1440, total 1–10 000 h, khoảng ≤ 1827 ngày, `dailyTarget` suy ra ≤ 1440 → `IMPORT_INVALID_SCHEMA`), entry sau hôm nay → `IMPORT_INTEGRITY` (`checkIntegrity(goals, entries, today?)`).
- **Services**: `GoalService.setArchived(id, archived, now)` (timer đang chạy của goal → `GOAL_TIMER_RUNNING`, goal không đổi), `SettingsService.claimPlusOne(goalId, date)` (kv `update` nguyên tử giữa tab, dọn ngày cũ), `StatsService.curve(goalId, today)`, `BackupService.parse(text, size, today?)`. Reminder/banner/`TimerService.start` đã loại goal archived qua `activeGoals`/`goalStatus` (có test).
- **UI**: `GoalDetail` thành route **lazy** (`GoalDetail-*.js`, `errorElement` = `ViewError`), đầy đủ: headline `+X% better` + phụ đề `Day k of N · n days on target · 1.01^n = …`, `CurveChart` (Recharts, lazy, cùng chunk cơ chế M4: `useRechartsWidth-*.js` chứa Recharts, dùng chung với `BarChart-*.js`/`CurveChart-*.js`), Range `Whole period`/`So far` (mặc định theo A-D4: ≤ 120 ngày → whole), legend, tóm tắt text, chú thích, `<details>` bảng Date/Ideal/You (vùng cuộn focus được), 4 StatCard (Progress có progressbar, Pace, Current/Longest streak), History, nút Edit/Archive|Restore/Delete, Alert `GOAL_TIMER_RUNNING`, ErrorState khi đọc lỗi; trạng thái rỗng (`empty.detail.curve`), upcoming (`goal.detail.upcoming`, chỉ đường Ideal, không Range), ended (actual dừng ở endDate), archived (badge + Restore). Biểu đồ: Ideal nét đứt xám, You `stepAfter` xanh, vạch hôm nay, 2 marker + nhãn trực tiếp `Ideal +9.4%`/`You +8.3%`, tooltip hover, `role="img"` + tên = tóm tắt, **bàn phím** ←/→/Home/End/Esc đọc từng điểm vào vùng `aria-live` (`curve-reading`), SVG `aria-hidden`.
- **Goals**: nhóm `Archived ({{n}})` (sắp theo `updatedAt` ↓, tie-break id), nút Archive/Restore (icon mới), toast `goalArchived`/`goalRestored`, Alert theo hàng khi `GOAL_TIMER_RUNNING`/lỗi ghi, ErrorState + Retry. **Today**: phản hồi "+1%" đúng một lần/goal/ngày (effect so snapshot "đạt" trong phiên với `plusOneShown` đã lưu; claim nguyên tử rồi mới hiện; pill `.entering` 240 ms, tắt khi reduced-motion; vùng `aria-live` `plusone.live` có `data-count` để kiểm), `pendingTimer` xoá ở **mọi** lần liveQuery phát (M2-P2), M3-D4 (dialog Stop giữ tên goal đã chụp lúc mở; `TIMER_NOT_RUNNING`/`GOAL_NOT_FOUND` khi Save → đóng dialog, Alert trên trang, focus h1), ErrorState khi đọc lỗi, entry cùng ngày sắp `createdAt` rồi `id`. **Day**: tie-break + ErrorState. **Settings**: ô Reminder time `aria-describedby` → `icsHint` (M2-P2). **D2**: `aria-describedby` gồm `goal.delete.timerNote` khi có timer. **ErrorBoundary** (`src/app/ErrorBoundary.tsx`): class boundary bọc app + `errorElement` route gốc (`RouteErrorFallback`, không còn trang lỗi mặc định của router), copy S9, nút `Reload app` / `Go to Today`. StorageError giữ M1 (đã kiểm E2E 2 cách chặn IndexedDB).
- **Song ngữ**: 37 key `en` / 36 key `vi` mới nguyên văn DESIGN §7 (chỉ `goal.detail.headlineSub_one` không có `vi`, đúng quy ước). Formatter thêm `decimal3`. Quét vi component + E2E `vi-VN` mọi màn/trạng thái: 0 phát hiện. Không có `i18next-browser-languagedetector`/`googleapis`/`deepl` trong `src`/`package.json` (rg → 0).
- **Bundle (đo thật, mục 5)**: entry `index-*.js` **214,92 kB gzip** + `useFormat-*.js` 6,69 kB (modulepreload) = **221,6 kB ≤ 250**; Recharts trong `useRechartsWidth-*.js` 97,07 kB chỉ tải ở Review/Goal detail; SW precache 22 entry (gồm mọi chunk lazy → offline toàn app).
- Kết quả lần chạy cuối: xem mục 5.

## 2. Task

| ID | Trạng thái | Ghi chú |
| :- | :- | :- |
| M5-T1 | DONE | `src/domain/curve.ts` + `curve.test.ts` (S1 khớp oracle mockup: ideal 1,0937 / actual 1,0829 / "8.3", 31 + 9 điểm, dạng bậc thang; 365 ngày → 3678,3; upcoming; ended dừng endDate; archived như thường; goal 1 ngày; không entry; ngày lỡ; 1827 ngày < 200 ms); `StatsService.curve` + test |
| M5-T2 | DONE | `GoalDetail.tsx` (route lazy), `components/CurveChart.tsx` (Recharts lazy), `hooks/useRechartsWidth.ts` (chung với BarChart), `router.tsx`, CSS; `GoalDetail.curve.test.tsx` (11 test) |
| M5-T3 | DONE | `domain/plusone.ts` + test, `SettingsService.claimPlusOne` + test, `Today.tsx`, `GoalCard.tsx`/`PlusOnePill.tsx` (`animate`), CSS `plus-in`; `Today.plusone.test.tsx` |
| M5-T4 | DONE | `GoalService.setArchived` + test; `Goals.tsx` (nhóm Archived, Archive/Restore, Alert), `GoalDetail.tsx`; test reminder/timer với goal archived; tie-break id (M1-P1) `goal.ts` + test, Today/Day; `Goals.archive.test.tsx` |
| M5-T5 | DONE | ErrorState ở Today/Goals/Day/Goal detail (Review có từ M4), `app/ErrorBoundary.tsx` + test, `App.tsx`, `router.tsx` `errorElement`; StorageError E2E (indexedDB `undefined` và `open` ném lỗi); lỗi ghi entry giữ form (test M5-AC6) |
| M5-T6 | DONE | `e2e/m5-journey.spec.ts` (hành trình đầy đủ + offline + bàn phím + axe sáng/tối + 360/1440 + dialog + StorageError tối), `e2e/m5-goal-detail.spec.ts`; M2-P2: `ReminderTimeField` `describedBy`, `ConfirmDialog` `aria-describedby` gồm note, `Today.pendingTimer` xoá mọi lần phát; README (PWA trên điện thoại/HTTPS, giới hạn nhắc, backup, biến môi trường, không cài global, Language) |
| M5-T7 | DONE | `en.json`/`vi.json` (+37/+36 key), `format.ts` `decimal3`, quét vi component (Goal detail đầy đủ/rỗng/upcoming/ended/archived/ErrorState, Goals Archived, Today +1%/ErrorState, Settings, D2, ErrorBoundary, StorageError), `e2e/m5-i18n.spec.ts` (`vi-VN`: hành trình đầy đủ + offline đổi English + axe/360/1440 mọi màn + StorageError vi) |
| Backlog M1-P1 | DONE | tie-break `id` (`byId`/`byCreatedAt`), test `goal.test.ts` "stable ordering", Today test e1/e2 |
| Backlog M2-P2 | DONE | `aria-describedby` Reminder time (test en/vi), `timerNote` trong mô tả D2 (test Goals), `pendingTimer` (test watch giả phát lại `undefined`) |
| Backlog M3-D3 | DONE | validate import như form (`backup.ts` `superRefine`, `checkIntegrity(…, today)`); test `backup.test.ts` "M3-D3"; Settings truyền `today`. **Xem Dispute**: test QC `tests/qc/m3-r1.spec.ts:638` dựa trên hành vi lỗi cũ nên nay đỏ |
| Backlog M3-D4 | DONE | `StopState.goalName` chụp lúc mở; Save trả `TIMER_NOT_RUNNING`/`GOAL_NOT_FOUND` → đóng dialog + Alert trên Today + focus h1 (test 2 ca: tab khác xoá timer thật, service giả) |

## 3. File chính đã thêm/sửa

- Domain: **mới** `src/domain/curve.ts`, `plusone.ts` (+ test); sửa `goal.ts` (+ test), `backup.ts` (+ test), `reminder.test.ts`.
- Services: sửa `goal-service.ts`, `settings-service.ts`, `stats-service.ts`, `backup-service.ts` (+ test mỗi file), `timer-service.test.ts`, `reminder-service.test.ts`.
- App: **mới** `src/app/ErrorBoundary.tsx` (+ test); sửa `App.tsx`, `router.tsx`.
- UI: **mới** `components/CurveChart.tsx`, `hooks/useRechartsWidth.ts`, `screens/GoalDetail.curve.test.tsx`, `screens/Goals.archive.test.tsx`, `screens/Today.plusone.test.tsx`; sửa `screens/GoalDetail.tsx`, `Goals.tsx`, `Today.tsx`, `Day.tsx`, `Settings.tsx`, `components/BarChart.tsx`, `ConfirmDialog.tsx`, `ReminderTimeField.tsx`, `GoalCard.tsx`, `PlusOnePill.tsx`, `Icon.tsx` (`archive`, `restore`), `error-messages.ts` (+ test), `styles/app.css` (ASCII thuần), `Settings.reminders.test.tsx`.
- i18n: `format.ts` (`decimal3`), `resources/en.json`, `vi.json`.
- E2E: **mới** `e2e/m5-goal-detail.spec.ts`, `m5-journey.spec.ts`, `m5-i18n.spec.ts`.
- Docs/config: `README.md`; `.env.example` không đổi (không có biến mới); `vite.config.ts` không đổi (xem Deviations 2).

## 4. Cách chạy

```bash
npm ci
npm run e2e:install            # Chromium vào node_modules (PLAYWRIGHT_BROWSERS_PATH=0)
npm run dev                    # http://localhost:5173
npm run build && npm run preview   # http://localhost:4173 (PWA, offline)
```

Dữ liệu mẫu: Settings → Import backup… → `e2e/fixtures/sample-backup.json` (S1) → Goals → "Read" (Goal detail: `+8.3% better`), Today ghi 30 phút cho Read → phản hồi "+1%"; Goals → Archive "Old course".

## 5. Cách test

Lệnh đã chạy tại `D:\minh\Coderschool\GitHub\one-percent-better` (2026-10-10), kết quả thật:

| Lệnh | Kết quả |
| :- | :- |
| `npm run lint` | exit 0, 0 lỗi, 0 warning |
| `npm run typecheck` | exit 0 |
| `npm test` | 67 file, **633 passed / 0 failed** (M4 QC r2: 569 → M5 thêm 64 test) |
| `npm run test:coverage` (`src/domain`) | exit 0; `src/domain`: **99,58 % statements, 95,46 % branches, 100 % functions, 100 % lines** (≥ 90 % DoD) |
| `npm run build` | exit 0. Output Vite (gzip mặc định): `index-*.js` 704,67 kB raw / **214,92 kB gzip**; `useFormat-*.js` 16,83 / 6,69 (được `modulepreload` → tính vào entry: **221,6 kB ≤ 250**); `useRechartsWidth-*.js` 330,51 / **97,07** (Recharts, chỉ tải ở Review/Goal detail); `BarChart-*.js` 7,54; `CurveChart-*.js` 8,00; `GoalDetail-*.js` 3,58; `Review-*.js` 4,53; `StatCard-*.js` 0,36; CSS 5,81; `dist/sw.js` precache 22 entry. Đo lại `zlib.gzipSync(level 9)` (cách M3/M4): index 207,5 / useFormat 6,5 / Recharts 93,8 / BarChart 7,3 / CurveChart 7,8 / GoalDetail 3,5 |
| `npm run check` (chạy tuần tự, 2 lần) | 2/2 lần **exit 0** (lint 0/0, typecheck 0, Vitest 633/633, build OK). Một lần chạy trước đó đỏ 1 test do race assert toast trong test mới của M5 → đã bọc `waitFor`; đồng thời sửa `claimPlusOne` không bắt lỗi khi DB đóng (unhandled rejection trong `Today.reminder.test.tsx`) |
| `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test` (dev M1–M5 + QC M1–M4) | **291 passed / 1 failed** (1,5 phút): dev M1–M4 + QC M1–M4 281 (như QC M4 r2) + dev M5 **11** (`m5-goal-detail` 5, `m5-journey` 4, `m5-i18n` 2); 291 xanh; fail duy nhất `tests/qc/m3-r1.spec.ts:638` (dữ liệu của M3-D3, nay bị từ chối khi import — Dispute mục 9). Lần chạy đầy đủ trước đó (trước khi đổi M3-D4 sang Alert): 290 pass + cùng test này + `tests/qc/m2-qc.spec.ts:283` (yêu cầu có `alert` sau Save thua cuộc đua — đã đổi từ toast sang Alert, xanh lại) |
| `rg -n "i18next-browser-languagedetector\|googleapis\|deepl" src package.json` | 0 kết quả |

## 6. Tự kiểm AC

| AC | Kết quả | Bằng chứng (test / lệnh) |
| :- | :- | :- |
| M5-AC1 | PASS | `src/domain/curve.test.ts`: G1 S1 tại 2026-10-09 ideal(k=9) ≈ 1,0937, actual(n=8) ≈ 1,0829, headline 8,3; `ideal` 31 điểm, `actual` 9 điểm (10-01 → 10-09), n theo ngày `[1..8,8]`; 365 ngày đạt hết → 3678,3; upcoming → actual rỗng, 0,0; ended (G5) → actual dừng 2026-06-30; archived = như thường; goal 1 ngày; 1827 ngày. `stats-service.test.ts` "StatsService.curve" |
| M5-AC2 | PASS | E2E `m5-goal-detail.spec.ts` "M5-AC2": why, `2026-10-01 – 2026-10-31`, `30 min/day`, 25.8 %, streak 8/8, `+8.3% better`, 2 `.recharts-line` (1 nét đứt), 2 marker, nhãn `Ideal +9.4%`/`You +8.3%`, 8 history row, tooltip, bàn phím, bảng 31 → 9 hàng (So far), axe 0; chunk `GoalDetail-`/`CurveChart-`/`useRechartsWidth-` không được tải ở Today/Goals/Settings, chỉ khi vào trang này (Review: `BarChart-` + `useRechartsWidth-`, test M4/QC M4 vẫn xanh). Component `GoalDetail.curve.test.tsx` |
| M5-AC3 | PASS | E2E "M5-AC3": 0/30 → 20 (không) → 10 (`data-count` 1, live `+1% for Read today.`, pill `.entering`) → +5 (vẫn 1) → reload (0, không chữ, không `.entering`) → xoá 10 + 5, ghi lại 10 (0) → 2026-10-10 ghi 30 → 1. Component `Today.plusone.test.tsx` (cùng kịch bản + timer save + vi + `plusOneShown` trong settings) |
| M5-AC4 | PASS | E2E "M5-AC4": Archive Spanish → mất khỏi Today (`0 of 2 goals on target`), nhóm `Archived (1)` + badge + Restore, Review chọn `Spanish (archived)` → `1.0 h`, ô 2026-03-02 `60 min, target met`; Restore → về Today; timer chạy trên Read → Archive → Alert `GOAL_TIMER_RUNNING`, Read vẫn Active. Unit: `reminder.test.ts`/`reminder-service.test.ts` (archived không vào progress/body/banner), `timer-service.test.ts` (`GOAL_NOT_ACTIVE`), `goal-service.test.ts` (`GOAL_TIMER_RUNNING`, goal không đổi) |
| M5-AC5 | PASS | E2E "M5-AC5": DB trống → Today/Goals/Review/Day đều EmptyState có link tạo goal, 0 `pageerror`/console error; goal không entry → `+0.0% better` + `No entries yet`; goal upcoming → `Starts 2026-11-01…`, không Range. Component: GoalDetail rỗng/upcoming/ended |
| M5-AC6 | PASS | E2E "M5-AC6" (2 biến thể: `window.indexedDB = undefined`, `IDBFactory.prototype.open` ném lỗi): màn StorageError (h1, body, 3 bước, Try again), không nav, axe 0, bấm Try again không crash. Component `Today.plusone.test.tsx` "M5-AC6": `entryService.add` ném `StorageError` → Alert `WRITE_FAILED`, ô Minutes/Note giữ `20`/`Ch. 3` |
| M5-AC7 | PASS | E2E `m5-journey.spec.ts` "M5-AC7": tạo Read → timer 30′ Save (`+1%` 1 lần) → Day 10-08 ghi 30 → Review ô 10-08 `30 min, target met`, streak 2 → Goal detail `+2.0% better`, history timer + manual → Export (1 goal, 2 entry) → context mới Import → Today 30/30, detail `+2.0%` → SW precache đủ chunk → offline reload: Today, Goals, Review (chart), Goal detail (curve) mở được, ghi 5 phút, reload offline còn 35/30; 0 request ngoài origin |
| M5-AC8 | PASS | E2E "M5-AC8": axe sáng **và tối** trên Today, Goals, GoalForm, Goal detail, Review, Day, Settings, Not found + D2 + dialog Stop + StorageError (tối, 360): 0 serious/critical; 360 và 1440 px không cuộn ngang ở 8 màn + dialog; bàn phím thuần: tạo goal (Tab/gõ/Enter) và ghi 20 + 10 phút (Enter/Esc trả focus) |
| M5-AC9 | NOT VERIFIED | Chỉ Chromium (Playwright). Tự kiểm: `npm run build && npm run preview`, Firefox desktop mở `http://localhost:4173`, tạo goal, ghi entry, reload, Review, Goal detail; Safari iOS/Chrome Android cần HTTPS (README "Install on a phone") |
| M5-AC10 | PASS (tự kiểm) | README: Install (không global), Configure (`.env.example`), Run, "Install on a phone (PWA)" (HTTPS), Test, Language (thêm/sửa chuỗi, parity), Goal detail/curve, Backup, Reminders: limitations. Lệnh trong README là lệnh đã chạy ở mục 5 trên cùng máy (chưa chạy trên clone sạch riêng ở M5) |
| M5-AC11 | PASS | Playwright đầy đủ (mục 5): mọi spec dev M1–M5 xanh; QC M1–M4 xanh trừ 1 test QC M3 đỏ **do sửa M3-D3** (Dispute). 0 request ngoài origin trong các spec M5 (assert trong `m5-goal-detail`, `m5-journey`, `m5-i18n`) |
| M5-AC12 | PASS | Component `GoalDetail.curve.test.tsx` (vi): `Tốt hơn +8,3%`, `Ngày 9/31 · 8 ngày đạt chỉ tiêu · 1,01^8 = 1,083`, tóm tắt/legend/Range/bảng/tooltip bàn phím `Lý tưởng +9,4% · Bạn +8,3%`; `Today.plusone.test.tsx` (vi) live `+1% cho Read hôm nay.`; quét vi: Goal detail (đầy đủ, rỗng, upcoming, ended, archived, Alert, ErrorState), Goals (Archived, Alert, D2), Today (+1%, ErrorState), Settings (describedby), ErrorBoundary, StorageError (test cũ) → 0. E2E `m5-i18n.spec.ts` (`vi-VN`): hành trình M5-AC7 bằng tiếng Việt, quét vi sau mỗi màn (gồm dialog Stop, D3, offline), offline đổi English → reload offline vẫn English (`<html lang="en">`); axe vi trên 10 màn (gồm detail archived/upcoming) 0; 360/1440 không cuộn ngang; StorageError vi 360 px. `rg` → 0; 0 request ngoài origin |
| M5-AC13 | PASS | `goal.test.ts` "stable ordering": `[b,a]`/`[a,b]` → `[a,b]` cho active (createdAt), upcoming (startDate), ended (endDate), archived (updatedAt). `Today.plusone.test.tsx`: e2/e1 cùng createdAt → e1 trước; watch giả phát `undefined` → Start → TimerCard (pendingTimer) → phát lại `undefined` → TimerCard biến mất, Start mọi goal dùng được. `Settings.reminders.test.tsx`: ô Reminder time `toHaveAccessibleDescription(icsHint 20:00 / 07:30)` en + vi. `Goals.archive.test.tsx`: D2 có timer → mô tả chứa `timerNote`, không timer → không chứa (en + vi) |

DoD: coverage `src/domain` xem mục 5 (ngưỡng ≥ 90 % dòng).

## 7. Deviations so với plan/design

1. **Tên chunk Recharts**: Vite 8 (Rolldown) tự tách phần dùng chung của hai import động (`BarChart`, `CurveChart`) thành một chunk đặt tên theo module `src` dùng chung → `useRechartsWidth-*.js` (hook đo chiều rộng, tách từ `BarChart`). Đã thử đặt tên `recharts` bằng `manualChunks` (Rollup API) và `codeSplitting.groups` (Rolldown): cả hai kéo React vào chunk đó và làm entry `modulepreload` Recharts (vi phạm M4-AC9) nên bỏ, giữ cấu hình build gốc. Test M4 dev/QC vẫn kiểm `BarChart-*.js` được tải đúng chỗ (xanh). README ghi rõ tên chunk.
2. **Bàn phím trên biểu đồ**: DESIGN §8 "mũi tên trái/phải di chuyển điểm đọc" làm bằng vùng `role="img"` focus được + `aria-live` đọc `goal.detail.tooltip` của điểm đang chọn (không dùng `accessibilityLayer` của Recharts vì SVG nằm trong `aria-hidden`, lý do như M4). Tooltip đồ hoạ cũng được đồng bộ qua `Tooltip defaultIndex/active`.
3. **Goal upcoming**: không hiện control Range (chỉ có đường Ideal, `So far` không có dữ liệu); dòng phụ đề headline và tóm tắt đều dùng `goal.detail.upcoming` thay vì `headlineSub`/`chartSummary` với k = 0.
4. **Bảng dữ liệu** chỉ mount khi `<details>` mở (tránh 1827 hàng DOM); vùng cuộn có `tabIndex=0`, `role="region"`, nhãn `goal.detail.showTable` (axe `scrollable-region-focusable`).
5. **M3-D4**: lỗi `TIMER_NOT_RUNNING`/`GOAL_NOT_FOUND` khi Save hiển thị bằng `Alert` (`role="alert"`) trên Today sau khi đóng dialog (DESIGN §7.3 ghi "Alert"; test QC M2 cũng yêu cầu có `alert`), xoá khi bấm Start/Stop tiếp theo.
6. **M3-D3**: vi phạm giới hạn goal trong file → `IMPORT_INVALID_SCHEMA` (zod `superRefine`), entry sau hôm nay → `IMPORT_INTEGRITY`; `BackupService.parse` nhận `today` tuỳ chọn (UI truyền), hàm thuần không có `today` giữ nguyên hành vi cũ. `endDate < startDate` vẫn là `IMPORT_INTEGRITY` như M3-AC9.
7. **Phản hồi "+1%" khi tải trang**: chỉ bắn khi quan sát được chuyển trạng thái trong phiên (snapshot trước ≠ null) và `plusOneShown[goal] !== today`; claim qua `kv.update` trước khi hiện để hai tab không cùng bắn. Vùng `aria-live` không dùng `role="status"` (tránh trùng với toast trong các test `getByRole('status')` cũ).
8. **Pace/streak trên Goal detail** tính bằng `goalStats(goal, entries, yearOf(today), today)` (năm hiện tại chỉ ảnh hưởng số liệu "trong năm" không hiển thị ở đây).
9. Formatter thêm `decimal3` (ngoài bảng ARCH §5.8) cho `1.01^n = 1.083`.
10. `goal.status.archived`: GoalDetail/Goals trước đây ánh xạ archived → `goal.status.ended`; nay dùng key riêng (DESIGN).

## 8. Known issues và giới hạn

- Phản hồi "+1%" chỉ xuất hiện trên Today (không trên Day khi ghi bù hôm nay qua `#/day/<today>`); `plusOneShown` vẫn được claim ở Today lần đầu thấy goal đạt trong phiên.
- Đổi ngôn ngữ giữa các tab vẫn không live (từ M1).
- Chunk Recharts (~97 kB gzip) được SW precache ngay sau khi cài (đã chấp nhận ở STATUS 2026-10-10).
- `tests/qc/m3-r1.spec.ts:638` đỏ do sửa M3-D3 (Dispute, mục 9). Nếu orchestrator muốn giữ test QC xanh thay vì sửa M3-D3: hoàn lại `superRefine` trong `src/domain/backup.ts`, tham số `today` của `checkIntegrity`/`parseBackup`/`BackupService.parse` và dòng gọi trong `Settings.tsx` (+ test "M3-D3" trong `backup.test.ts`).
- Kiểm thủ công chưa làm (M5-AC9): Firefox/Safari/iOS/Android thật; notification thật trên thiết bị (M2); màn hình đọc thật (NVDA/VoiceOver) cho biểu đồ.
- Vitest chạy 2 tiến trình song song vẫn có thể chạm timeout 5 s (M4-D5, backlog).

## 9. Dispute (nếu có)

- **`tests/qc/m3-r1.spec.ts:638` "goals the app itself would refuse (daily target 600000, 100-year period, archived, future entry) do not crash any screen"**: test nạp file có goal daily 600 000 phút, khoảng 2000→2099 và entry 2030-05-05 rồi chờ dialog D3 hiện để Confirm. Đây chính là dữ liệu của defect M3-D3 (QC M3 r1 §4) mà orchestrator yêu cầu sửa ở M5; sau khi sửa, `parse` trả `IMPORT_INVALID_SCHEMA` → app hiện Alert, không mở D3, nên test đỏ ở `importContent` (`expect(dialog).toBeVisible()`). Bằng chứng: `src/domain/backup.test.ts` "M3-D3" (4 test) và `pw.log`. Không sửa `tests/qc/`; đề nghị QC re-target test (kiểm Alert `errors.IMPORT_INVALID_SCHEMA` thay vì mở D3, hoặc nạp dữ liệu qua `db` trực tiếp để kiểm "không crash").

## Assumptions

- A-M5-1: Phản hồi "+1%" cũng áp dụng cho entry từ timer và khi tổng vượt chỉ tiêu (lần đầu đạt hoặc vượt).
- A-M5-2: Archive được phép cho goal ở mọi trạng thái (active/upcoming/ended); Restore không kiểm timer.
- A-M5-3: Mặc định Range theo A-D4 tính trên `periodDays` (≤ 120 → Whole period); goal đã kết thúc ở chế độ `So far` cũng hiện cả khoảng (vì đã trôi hết).
- A-M5-4: Tóm tắt SR/`role="img"` của biểu đồ dùng `goal.detail.chartSummary` (upcoming: `goal.detail.upcoming`).

## Open questions

- Không có câu hỏi chặn. DESIGN §7 có đủ bản `vi` cho mọi chuỗi M5 (chỉ dạng `_one` không có `vi`, đúng quy ước).
- Cho orchestrator: chọn giữa (a) giữ sửa M3-D3 và QC re-target `m3-r1.spec.ts:638`, hoặc (b) hoàn lại M3-D3 (mục 8).

## Fix log

### Round 1 — theo report-M5-r1.md

| Defect | Nguyên nhân gốc | Cách sửa | Regression test |
| :- | :- | :- | :- |
| M5-D2 (Major) — Vitest không ổn định (`npm run check` đỏ 1/5, `vitest run` đỏ 2/8, clone sạch 3 timeout 5 s) | (1) Assert thời gian thật trong unit test (`curve.test.ts` 200 ms, 2 benchmark `stats-service.test.ts` `< 200 ms` + `retry: 2`) chạy chung với ~20 worker jsdom; (2) 13 assert toast `expect(getByRole('status')).toHaveTextContent(...)` **đồng bộ** ngay sau `waitFor` của một điều kiện khác (toast được `show` sau khi liveQuery đã phát); (3) `findBy*`/`waitFor` mặc định 1 s và `testTimeout` 5 s quá ngắn cho test mount route lazy + Recharts khi cache transform nguội hoặc máy tải; (4) Vitest mở worker theo số CPU (24) → jsdom nghẽn | (a) Bỏ assert wall-clock khỏi `curve.test.ts`; benchmark `stats-service.test.ts` chỉ assert `< 200 ms` khi `BENCH_ASSERT=1` (script mới **`npm run bench`**, chạy file này một mình), trong suite chỉ log số đo + ngưỡng rất rộng (60 s), bỏ `retry`; (b) **mọi** assert toast trong `src/ui/**/*.test.tsx` → `await waitFor(() => …)` (Day, GoalDetail, GoalForm, Goals, Settings ×3, Today — 12 chỗ; giữ 1 assert phủ định "chưa có toast"); (c) `src/test/setup.ts`: `configure({ asyncUtilTimeout: 8000 })` cho toàn bộ `findBy*`/`waitFor`; `vite.config.ts`: `testTimeout: 20000`, `hookTimeout: 20000`; (d) `maxWorkers: 8` (suite 681 test ~28,5 s thay vì ~16 s, đổi lấy ổn định) | Chứng minh (2026-10-10, đã gồm 48 test QC M5): `npx vitest run` **15/15 lần xanh** (681/681 mỗi lần, 28,4–29,0 s); **2 tiến trình `vitest run` song song** (M4-D5): 2/2 xanh 681/681; `npm run check` **5/5 exit 0**; `npm run bench` (chạy riêng, assert 200 ms): [bench] service overallStats + 5×goalStats (in-memory repos): median 8.3 ms, runs 10.5 / 9.3 / 8.3 / 4.9 / 4.4; [bench] service overallStats + 5×goalStats (fake-indexeddb): median 79.7 ms, runs 88.9 / 79.7 / 77.3 / 79.4 / 80.5; [bench] pure review model (all + 5 goals): median 13.0 ms, runs 15.0 / 13.4 / 12.5 / 13.0 / 9.3 |
| M5-D1 (Minor) — xoá goal từ Goal detail thoáng hiện "Goal not found" | liveQuery `goals` bỏ goal trước khi `navigate('/goals')` được render → `GoalDetail` rơi vào `<NotFound variant="goal">` (h1 cướp focus) trong 2–3 khung hình | `GoalDetail.tsx`: state `deleting` ở wrapper; view gọi `onDeleting(true)` trước `goalService.remove`; khi goal biến mất mà đang xoá → render `null` (không NotFound); điều hướng `navigate('/goals', { replace: true })` sau khi xoá; xoá thất bại → `onDeleting(false)`. Toast giữ nguyên | `GoalDetail.test.tsx` "Delete opens D2 …": MutationObserver ghi mọi h1 = `notFound.goalTitle` từ lúc Confirm tới khi Goals hiện → `[]`. Playwright đầy đủ: `tests/qc/m5-r1-flows.spec.ts:282` (`test.fail` M5-D1) nay **"Expected to fail, but passed"** → **QC cần gỡ `test.fail`** |
| M5-D3 (Minor) — segment "Whole period" thiếu đệm (91 px trong 90 px) | `.seg label { flex: 1 }` chia đều chiều rộng (flex-basis 0) → nhãn dài hơn nửa control bị ép; `.seg span` padding 12 px | `app.css`: `.seg.range label { flex: 1 1 auto }` (rộng theo nhãn rồi mới chia phần dư), `.seg.range span { padding: 6px 14px; white-space: nowrap }` | `e2e/m5-goal-detail.spec.ts` AC2: mỗi `.seg.range span` có `padding-left: 14px` và `scrollWidth <= clientWidth`; `e2e/m5-i18n.spec.ts` kiểm cùng điều kiện ở vi |

Kết quả sau fix (2026-10-10, project root): lint 0/0; typecheck 0; `npm run check` 5/5 exit 0 (Vitest 681/681); `npx vitest run` 15/15 + 2 song song 2/2; Playwright đầy đủ (dev M1–M5 + QC M1–M5) **329 passed / 1 failed** — fail duy nhất là `tests/qc/m5-r1-flows.spec.ts:282` "Expected to fail, but passed" (M5-D1 đã sửa; QC gỡ `test.fail`). Không sửa file nào trong `tests/qc/`. Đề xuất §9 của QC (trục Y `+0%`, focus sau khi đóng dialog, câu lỗi riêng cho goal vượt giới hạn khi import) chưa làm — backlog.

