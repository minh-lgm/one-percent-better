# QC report — M5 round 1

**Verdict:** FAIL
**Ngày:** 2026-10-10  **Commit:** 327a65d (code M5 = 0f1418a); QC thêm file trong `tests/qc/` (chưa commit)

## 1. Tóm tắt

Về chức năng, M5 đạt: cả 13 AC có bằng chứng tự chạy (AC9 NOT VERIFIED vì cần trình duyệt/thiết bị khác). Đường cong khớp oracle brute-force độc lập và oracle mockup (Read: ideal +9,4 %, you +8,3 %, 1,083, ở cả số liệu lẫn toạ độ pixel của hai chấm). +1 % đúng một lần (kể cả hai tab), archive, xoá từ Goal detail, empty/error/StorageError/ErrorBoundary, offline toàn route (tab mới, cold navigation), axe sáng/tối en/vi ở 16 màn x 360/768/1440 px, quét vi, bundle 219,6 kB gzip, bảo mật: tất cả đạt. Backlog M1-P1, M2-P2, M3-D3, M3-D4 xác nhận đã sửa. Test QC `tests/qc/m3-r1.spec.ts` (M3-D3) đã được re-target theo quyết định của orchestrator.

FAIL vì **M5-D2 (Major)**: bộ test đơn vị không ổn định; `npm run check` / `npm test` đỏ ngẫu nhiên (5 lần `npm run check`: 1 đỏ; 8 lần `vitest run` thêm: 2 đỏ; lần chạy đầu trên clone sạch: 3 test hết 5 s). Cùng loại M4-D3 (đã xếp Major). Hai defect Minor: M5-D1, M5-D3.

## 2. Môi trường và lệnh đã chạy

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Check #1 | `npm run check` | EXIT 1: lint 0/0, typecheck OK, Vitest 632/633, `Day.test.tsx:66` (M3-AC1) `getByRole('status')` rỗng, mong "Entry saved" (M5-D2) |
| Check #2 – #5 | `npm run check` x4 | EXIT 0, Vitest 633/633, build OK |
| Vitest lặp | `npx vitest run` x8 (681 test sau khi thêm 48 test QC) | 6 xanh; lần 6: `GoalDetail.test.tsx` "shows the empty history state..." không tìm thấy heading "Old course"; lần 7: `curve.test.ts:140` 221 ms > 200 ms (M5-D2) |
| Lint, typecheck với test QC | `npm run lint`, `npm run typecheck` | exit 0, 0 warning |
| Playwright #1 | `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test` (dev M1-M5 + QC M1-M4, sau re-target m3-r1) | 292 passed |
| Playwright #2 | như trên + test QC M5 | 326 passed, 1 failed: `tests/qc/m3-r1.spec.ts:435` (D3 focus trap, Tab ra ngoài dialog) khi máy tải; chạy riêng 12/12 và 30/30 xanh, coi là flake của test QC cũ |
| Playwright #3 | như trên | 330 passed / 0 failed (gồm M5-D1 là `test.fail` có chủ đích) |
| Đo bundle | script `zlib.gzip` trên `dist/index.html` + chunk | JS ban đầu `index` 212,9 + `useFormat` 6,7 = **219,6 kB gzip** (level 9: 219,2) <= 250; Recharts (`useRechartsWidth` 96,2 kB) không nằm trong entry |
| Audit | `npm audit` | 0 vulnerabilities |
| Clone sạch | `git clone` -> `npm ci`, `npm run check`, `npx vitest run` x2, `npm run dev`/`preview` (curl 200), `npm run e2e:install` | `npm ci` OK 0 lỗ hổng; lần `check` đầu **đỏ 3 test timeout 5 s** (M5-D2), 2 lần Vitest sau xanh 633/633; dev/preview HTTP 200; `test:e2e` trong clone không chạy được: đường dẫn clone dài > 260 ký tự (README đã cảnh báo MAX_PATH) -> NOT VERIFIED |

Test QC mới: `tests/qc/m5-r1-domain.test.ts` (48 test Vitest, oracle curve), `m5-r1-curve.spec.ts` (9), `m5-r1-flows.spec.ts` (24, gồm 1 `test.fail` cho M5-D1), `m5-r1-sweep.spec.ts` (5). Re-target `m3-r1.spec.ts` (xem mục 5).

## 3. Acceptance criteria

| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M5-AC1 | PASS | `m5-r1-domain.test.ts`: oracle viết riêng (UTC, nhân lặp): S1 G1 ideal(k=9)=1,0937, actual(n=8)=1,0829, headline 8,3, idealPercent 9,4, 31 điểm ideal/9 điểm actual (n = 1..8,8); 365 ngày đạt hết -> 3678,3; upcoming -> actual rỗng, 0,0; ended dừng 2026-06-30 (181 điểm); archived, goal 1 ngày (met/missed/upcoming/ended), năm nhuận 2028 (có 29/2), 1827 ngày (< 1,5 s), 40 bộ ngẫu nhiên (biên năm/nhuận), entry ngoài khoảng bị bỏ, goal `total` dùng ceil; làm tròn headline khớp `toFixed(1)` với mọi n 0..1827 |
| M5-AC2 | PASS | `m5-r1-curve.spec.ts` S1: 31 hàng bảng "Whole period" (ngày, Ideal, You từng hàng = oracle), 9 hàng "So far"; hai chấm marker nằm đúng y(+9,4 %) và y(+8,3 %) trên lưới (±2 px), cùng x; ideal có 31 đỉnh, You dạng bậc thang; why/khoảng/chỉ tiêu/25,8 %/streak/8 history: dev E2E + chụp màn hình khớp DESIGN S4 (copy kiểm từng chuỗi từ `innerText`). Recharts chỉ tải ở Review/Goal detail: dev E2E xanh 3 lần + đo bundle |
| M5-AC3 | PASS | Dev E2E xanh 3 lần. QC bổ sung: ghi một lần 45/30 -> 1; sửa entry 10->20 vượt chỉ tiêu -> 1; vào lại Today -> 0; `plusOneShown` = `{g1,g2}` ngày 2026-10-09; timer Save vượt chỉ tiêu -> 1; hai goal lần lượt -> 2; **hai tab** (tab A ghi 20, tab B ghi 10): tổng `data-count` = 1 (A=0, B=1), tab thứ ba mở sau = 0 |
| M5-AC4 | PASS | Dev E2E + QC: Archive từ Goal detail khi timer chạy -> `GOAL_TIMER_RUNNING`, goal vẫn Active; dừng timer rồi Archive -> toast, badge Archived, nút Restore; Today ẩn goal, "0 of 1 goal on target", banner nhắc đếm 1 goal; Review chọn goal archived "4.0 h"; Day 10-08 vẫn hiện goal archived (có entry); Restore từ danh sách -> về Today; `entries` trong IndexedDB giống hệt sau archive/restore; nhấp đúp Archive an toàn; nhóm Archived sắp updatedAt giảm dần |
| M5-AC5 | PASS | QC: DB trống -> Today/Goals/Review/Day đều có EmptyState + CTA, không console error, không cuộn ngang; Settings và `/goals/nope/edit` hiển thị; chỉ có goal archived/upcoming/ended -> "No active goals today", nhóm Goals đúng, Review/Day không lỗi; goal không entry -> `+0.0% better`, `empty.detail.curve`, "No entries yet", `1.01^0 = 1.000` |
| M5-AC6 | PASS | QC: `open` trả request lỗi bất đồng bộ -> StorageError; "Try again" thành công không reload khi storage hoạt động lại; ghi lỗi (`IDBObjectStore.add/put` ném `QuotaExceededError`) -> alert, ô Minutes/Note giữ nguyên giá trị, lưu lại sau khi hồi phục OK; dev E2E hai cách chặn IndexedDB xanh |
| M5-AC7 | PASS | Dev E2E hành trình + QC offline: sau khi SW điều khiển trang, `setOffline(true)`, mở **tab mới** và reload thật tới Goal detail, Review, Goals, Settings, Day, Today (chunk lazy lấy từ precache), 0 `requestfailed`/pageerror, chip offline, ghi 30 phút -> "+1%" -> online lại dữ liệu còn |
| M5-AC8 | PASS | `m5-r1-sweep.spec.ts`: 4 tổ hợp {en,vi} x {sáng,tối}, 16 màn (Today, Goals có Archived, form tạo/sửa, Goal detail đầy đủ/upcoming/ended/archived/rỗng với tên goal 55 ký tự liền, Review, Review goal archived, Day, Day tương lai, Settings, Not found, Goal not found) x 360/768/1440: 0 vi phạm axe serious/critical (360, 1440), 0 cuộn ngang (cả 768). Dialog (D2, D3), lỗi form, lỗi entry ở vi/tối: axe sạch. Bàn phím: Tab tới biểu đồ, mũi tên/Home/End/Esc, Range bằng mũi tên, D2 Esc trả focus về Delete |
| M5-AC9 | NOT VERIFIED | Chỉ Chromium. Xem mục 8 |
| M5-AC10 | FAIL (kéo theo M5-D2) | Trên clone sạch: `npm ci`, lint, typecheck, build, dev, preview chạy được; README đúng và đủ mục (PWA điện thoại/HTTPS, giới hạn nhắc, backup, `.env.example`, không cài global). Nhưng lần `npm test` đầu tiên trên clone sạch đỏ 3 test (M5-D2). `test:e2e` trong clone: NOT VERIFIED (MAX_PATH do đường dẫn scratch của QC, README đã nói trước) |
| M5-AC11 | PASS (Playwright); Vitest xem M5-D2 | Playwright 330/330 ở lần 3, 292/292 ở lần 1, lần 2 một flake của test QC M3 (mục 6); 0 request ngoài origin trong mọi spec M5 và QC |
| M5-AC12 | PASS | QC vi (context `vi-VN`, 360 px): headline "Tốt hơn +8,3%", phụ đề `1,01^8 = 1,083`, nhãn `+9,4%`/`+8,3%`, tooltip bàn phím `+9,4%`, bảng `+8,3%`; quét vi 0 phát hiện ở Goal detail (đầy đủ, upcoming, ended, archived, rỗng), toàn bộ 16 màn ở 360 px, dialog, form lỗi; axe vi sáng/tối 0; `rg` languagedetector/googleapis/deepl 0 (dev) |
| M5-AC13 | PASS | Unit của dev xanh. QC E2E: goal/entry cùng khoá sắp xếp, lưu theo thứ tự `[b,a]`, `[d,c]`, `[f,e]`, `[h,g]`, entry `e2,e1` -> Today `a,b`; Goals `a..h` đúng nhóm; Day entry `first` trước `second`. Ô Reminder time có accessible description `Adds a repeating daily event at 20:00.`; D2 khi có timer có mô tả chứa `goal.delete.timerNote`; `pendingTimer`: discard -> card biến mất, Start dùng được; tab khác huỷ timer -> card ở tab này biến mất |

## 4. Defect

### M5-D2 — Bộ unit test không ổn định: `npm run check`/`npm test` đỏ ngẫu nhiên  [Major]
- Bước tái hiện: từ root (máy dev, không chạy gì khác), `npm run check` hoặc `npx vitest run` lặp nhiều lần; hoặc `git clone` + `npm ci` + `npm run check` lần đầu.
- Mong đợi: DoD mục 1 (TASKS §0) và M5-AC10: exit 0 mỗi lần, kể cả trên clone sạch.
- Thực tế: 3 trên 13 lần chạy toàn bộ trong repo đỏ (mỗi lần 1 test khác nhau), cộng lần đầu trên clone sạch đỏ 3 test:
  1. `src/ui/screens/Day.test.tsx:66` (M3-AC1): `expect(screen.getByRole('status')).toHaveTextContent('Entry saved')` nhận chuỗi rỗng ngay sau `waitFor('30/20')` (toast chưa render).
  2. `src/ui/screens/GoalDetail.test.tsx:48` "shows the empty history state...": "Unable to find role=heading and name 'Old course'" (2 s, `findBy` hết 1 s).
  3. `src/domain/curve.test.ts:140`: `expected 221.15 to be less than 200` (tiêu đề test ghi "well under 50 ms"; assert thời gian thật khi các worker khác đang chạy).
  4. Clone sạch (cache transform nguội): `GoalDetail.test.tsx:48`, `Review.test.tsx:37`, `GoalDetail.curve.test.tsx:30` "Test timed out in 5000ms" (15-18 s). Lần chạy thứ 2 và 3 trên cùng clone xanh 633/633.
  Người dùng không thấy gì, nhưng cổng chất lượng không đáng tin; cùng họ M4-D3 (Major) và M4-D5.
- Vị trí nghi ngờ: `Day.test.tsx:66` (assert đồng bộ sau `waitFor` khác), `GoalDetail.test.tsx:48-50`, `curve.test.ts:127-141` (assert wall-clock), `testTimeout` mặc định 5 s ở `vite.config.ts` cho các test mount Recharts/lazy route.

### M5-D1 — Xoá goal từ Goal detail: thoáng hiện "Goal not found" trước khi về Goals  [Minor]
- Bước tái hiện: import S1 -> `#/goals/g1` -> Delete -> xác nhận (máy chậm; tái hiện ổn định bằng Chrome DevTools CPU throttle 4x; không throttle thì thấy khi máy tải). Test QC `m5-r1-flows.spec.ts` "M5-D1" (`test.fail`).
- Mong đợi: đi thẳng từ trang goal sang `#/goals` kèm toast (DESIGN S4 "Delete -> D2 (xong về #/goals)").
- Thực tế: lấy mẫu mỗi khung hình: `Read|#/goals/g1` -> `Goal not found|#/goals` (2-3 khung) -> `Goals|#/goals`; h1 "Goal not found" xuất hiện và cướp focus trước khi Goals render (người đọc màn hình có thể nghe "Goal not found").
- Vị trí nghi ngờ: `src/ui/screens/GoalDetail.tsx` (`confirmDelete`: live query bỏ goal trước khi `navigate('/goals')` được render; `GoalDetail` rơi vào `<NotFound variant="goal">`).

### M5-D3 — Nút "Whole period" của Range không có đệm, chữ chạm mép  [Minor]
- Bước tái hiện: Goal detail ở en, 360 hoặc 1440 px; nhìn control Range.
- Mong đợi: chữ trong segment có đệm như "So far" (DESIGN §5 SegmentedControl).
- Thực tế: hai segment rộng cố định 90 px, "Whole period" cần 91 px (`scrollWidth 91 > clientWidth 90`), chữ sát hai mép; "So far" có đệm. Ở vi (94 px) vừa khít. Có thể vỡ khi người dùng phóng chữ 200 %.
- Vị trí nghi ngờ: CSS `.range` / `SegmentedControl` trong `src/ui/styles/app.css`.

## 5. Kiểm lại defect vòng trước (backlog đã đóng trong M5)

| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| M1-P1 tie-break id | FIXED | E2E QC: Today, từng nhóm Goals, entry cùng ngày trên Day đều theo id tăng dần dù lưu `[b,a]` |
| M2-P2 aria-describedby / timerNote / pendingTimer | FIXED | Mô tả truy cập của Reminder time; D2 có timer chứa `timerNote`; card timer biến mất khi tab khác huỷ, Start dùng lại được |
| M3-D3 import vượt giới hạn | FIXED | Import goal daily 600000 và khoảng 2000-2099 -> Alert `IMPORT_INVALID_SCHEMA`; entry sau hôm nay -> `IMPORT_INTEGRITY`; D3 không mở, DB không đổi. **Test QC `m3-r1.spec.ts` (dòng 638) được re-target**: nay import dữ liệu vi phạm và kiểm lỗi `IMPORT_*` + dữ liệu cũ nguyên vẹn, sau đó goal archived hợp lệ vẫn import và mọi màn render; ý đồ gốc (dữ liệu app không cho tạo tay không được làm hỏng màn nào) giữ nguyên. Xanh ở 3/3 lần chạy |
| M3-D4 thua cuộc đua Save | FIXED | Dialog Stop của tab thua vẫn có tên "Guitar" khi timer đã bị tab kia lưu; bấm Save -> dialog đóng, Alert `TIMER_NOT_RUNNING` trên trang, focus h1, đúng +1 entry (8/8 lần lặp xanh; 1 lần lúc chạy cùng test khác focus h1 không nhận, xem mục 9) |

## 6. Regression

M1-M4: toàn bộ spec dev + QC xanh (292 ở lần 1, 330 ở lần 3). Lần 2: `tests/qc/m3-r1.spec.ts:435` (Tab thoát khỏi dialog D3 ngay sau khi mở) đỏ một lần khi chạy song song nhiều worker; chạy riêng 12 + 30 lần đều xanh. `ConfirmDialog` chỉ đổi `aria-describedby` trong M5, nên coi là flake của test dưới tải; theo dõi.

## 7. Bảo mật

- Không request ngoài origin ở bất kỳ spec QC/Goal detail/sweep/offline nào. Không `innerHTML`/`dangerouslySetInnerHTML`/`eval`/`fetch` trong `src`; `.env` không có trong git (`.gitignore`, chỉ `.env.example`); `npm audit` 0.
- XSS: tên goal, why, note chứa `<img onerror>`, `<script>`, nháy: hiển thị dạng text ở Goal detail (h1, History, tiêu đề tab, nhãn biểu đồ), Goals, Today; 0 dialog JS, 0 phần tử `img/script` chèn vào `main`. Route `/goals/%3Cb%3E...`, `/goals/%E0%A4%A` (URI hỏng) -> Not found trong shell.
- Import: giới hạn như form + entry tương lai bị từ chối (M3-D3). Ghi chú không chặn: kiểm "entry sau hôm nay" dùng ngày của máy nhập; backup xuất từ múi giờ đi trước máy nhập, có entry đúng ngày hôm nay, có thể bị từ chối `IMPORT_INTEGRITY` (hiếm).
- Dữ liệu hỏng ghi thẳng vào IndexedDB (startDate null, endDate rác, tên là số/đối tượng, target là chuỗi, khoảng 100 năm, daily 600000): không có trang trắng ở Today, Goals, Goal detail, form sửa, Day, Review, Settings; lỗi render hiện ErrorBoundary (`role="alert"`, h1, "Reload app", "Go to Today", axe sạch) hoặc ErrorState "Couldn't load this view" ở route lazy.

## 8. Chưa kiểm chứng được (NOT VERIFIED)

- M5-AC9 Firefox/Safari iOS/Chrome Android: chỉ Chromium. Tự kiểm: `npm run build && npm run preview`, mở `http://localhost:4173` bằng Firefox desktop, import `e2e/fixtures/sample-backup.json`, mở Goals -> Read (đường cong, Range, bảng), ghi 30 phút ở Today -> thấy "+1%", Archive một goal, reload; trên điện thoại cần HTTPS (README "Install on a phone").
- Screen reader thật (NVDA/VoiceOver): chưa nghe vùng `aria-live` của "+1%" và `curve-reading`; chỉ kiểm cây a11y, `aria-live`/`role` và axe. Tự kiểm: Tab vào biểu đồ, bấm mũi tên nghe "Oct 9 · Ideal +9.4% · You +8.3%".
- `npm run test:e2e` trên clone sạch ở đường dẫn ngắn: clone của QC nằm trong thư mục tạm quá dài (Playwright không mở được Chromium, ENOENT, đúng cảnh báo README). Tự kiểm: clone vào `C:\src\opb`, `npm ci`, `npm run e2e:install`, `npm run test:e2e`.
- Chất lượng bản dịch vi (người bản ngữ), notification thật, hết quota IndexedDB thật: chưa kiểm.

## 9. Đề xuất (không chặn)

- Trục Y biểu đồ hiện `+0.0%`, `+10.0%`; mockup `07` dùng `+0%`, `+10%` (bỏ phần thập phân khi bước là số nguyên).
- `focusHeading()` (Today) dùng `requestAnimationFrame`; một lần trong 12 lần chạy ở tab nền sau khi thua race Save không nhận focus ở h1. Nên đặt focus sau khi dialog đã đóng thay vì rAF.
- "+1%" chỉ bắn ở Today (Day của hôm nay không bắn): đã ghi trong handoff, phù hợp FR-29.
- Lỗi import vi phạm giới hạn goal dùng chung câu `IMPORT_INVALID_SCHEMA` ("không giống backup 1% Better"), dễ gây hiểu nhầm; nên có câu riêng chỉ ra goal vượt giới hạn.
- Test `m5-r1-flows.spec.ts` "M5-D1" là `test.fail`: khi dev sửa M5-D1 sẽ báo "unexpected pass", lúc đó gỡ `test.fail`.
