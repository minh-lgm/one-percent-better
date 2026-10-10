# QC report — M5 round 2

**Verdict:** PASS
**Ngày:** 2026-10-10  **Commit:** 361dafb (code fix = 32a6df5); QC sửa/thêm file trong `tests/qc/` (chưa commit)

## 1. Tóm tắt

Cả ba defect của vòng 1 đã FIXED: M5-D2 (Major) Vitest ổn định, M5-D1 (Minor) không còn "Goal not found" chớp, M5-D3 (Minor) nút Range có đệm 14 px ở en và vi. Không có defect mới của app. Build, lint, typecheck, `npm run check` x5, Vitest x15 + 2 tiến trình song song x2, Playwright đầy đủ (dev + QC M1-M5) 342/342 ở 3 trong 4 lần chạy; lần thứ 3 (chạy đồng thời với Vitest, tải nặng) đỏ 1 test QC cũ do thiếu chờ, đã sửa test và lặp lại xanh. M5-AC1..AC13: PASS, trừ M5-AC9 NOT VERIFIED (chỉ Chromium; hướng dẫn tự kiểm ở mục 8).

## 2. Môi trường và lệnh đã chạy

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Vitest tuần tự | `npx vitest run` x15 | **15/15 exit 0**, mỗi lần 68 file, 681/681 test, 29,2-31,4 s |
| Vitest song song (M4-D5) | 2 tiến trình `npx vitest run` cùng lúc, x2 lần | **4/4 exit 0**, mỗi tiến trình 681/681, 38,8-41,4 s |
| Vitest dưới tải | `npx vitest run` trong khi Playwright đầy đủ đang chạy | exit 0, 681/681 (92 s) |
| Check | `npm run check` x5 | **5/5 exit 0**: lint 0/0, typecheck OK, Vitest 681/681, build OK (PWA precache 22 entries) |
| Lint, typecheck | `npm run lint`, `npx tsc -b --noEmit` (sau khi thêm test QC) | exit 0, 0 warning |
| Bench | `npm run bench` | 10/10; in-memory median 6,6 ms; fake-indexeddb median 79,7 ms; review model median 11,5 ms (< 200 ms, assert bật) |
| Playwright #1 | `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test` (dev M1-M5 + QC M1-M5) | exit 0, **342 passed**, 0 failed (2,5 phút) |
| Playwright #2 | như trên | exit 0, **342 passed** |
| Playwright #3 | như trên, chạy cùng lúc với một lần `vitest run` | 341 passed, **1 failed**: `tests/qc/m4-r1.spec.ts:572` "regression smoke M1..M3": `document.querySelector(".gd-head .why")` trả null ngay sau `gotoHash` vì test không chờ route lazy (lỗi của test QC, không phải của app). Đã sửa test (thêm `expect(locator).toBeVisible()`); chạy lại file với `--repeat-each 5`: 120/120 xanh |
| Playwright #4 | như trên, sau khi sửa test | exit 0, **342 passed** |
| Audit | `npm audit` | 0 vulnerabilities |
| Git | `git ls-files` | `.env` không bị track |

Test QC thay đổi/thêm trong vòng này: `tests/qc/m5-r2.spec.ts` (13 test: M5-D1 x6, M5-D3 x7), gỡ `test.fail` ở `tests/qc/m5-r1-flows.spec.ts:282`, thêm chờ ở `tests/qc/m4-r1.spec.ts:577`, nới ngưỡng wall-clock 1500 ms thành 10 000 ms ở `tests/qc/m5-r1-domain.test.ts:152` (cùng nguyên tắc M5-D2).

## 3. Acceptance criteria

| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M5-AC1 | PASS | `tests/qc/m5-r1-domain.test.ts` (48 test oracle độc lập) xanh trong 15/15 lần Vitest; `curve.test.ts` không còn assert thời gian |
| M5-AC2 | PASS | `m5-r1-curve.spec.ts` (9 test: bảng 31/9 hàng, toạ độ chấm Ideal/You, bàn phím) xanh ở mọi lần Playwright |
| M5-AC3 | PASS | `m5-r1-flows.spec.ts` +1 % (một lần, hai tab, hai goal) xanh |
| M5-AC4 | PASS | Archive/Restore (timer chạy, Review, Day, IndexedDB giữ entry) xanh |
| M5-AC5 | PASS | Empty/Not found states xanh |
| M5-AC6 | PASS | StorageError, lỗi ghi (Quota), Try again xanh |
| M5-AC7 | PASS | Offline toàn route (tab mới, reload) xanh |
| M5-AC8 | PASS | `m5-r1-sweep.spec.ts` axe 4 tổ hợp x 16 màn x 3 độ rộng, 0 vi phạm; nút Range mới không gây tràn ngang (đo ở D3) |
| M5-AC9 | NOT VERIFIED | Chỉ Chromium. Xem mục 8 |
| M5-AC10 | PASS (kèm ghi chú) | `npm run check` 5/5 exit 0; Vitest ổn định (D2 FIXED). Clone sạch với cache nguội (kịch bản đỏ ở vòng 1) không dựng lại ở vòng này; giảm rủi ro: `testTimeout` 20 s, `asyncUtilTimeout` 8 s, 4 lần song song 2 tiến trình và 1 lần dưới tải Playwright đều xanh. Vòng 1 đã xác nhận `npm ci`/dev/preview/README. `test:e2e` trong clone ở đường dẫn ngắn: NOT VERIFIED (mục 8) |
| M5-AC11 | PASS | Playwright 342/342 (lần 1, 2, 4); 0 request ngoài origin trong spec M5/QC; Vitest 681/681 x15 |
| M5-AC12 | PASS | `m5-i18n.spec.ts` và quét vi trong `m5-r1-sweep.spec.ts` xanh; D3/D1 kiểm lại ở vi |
| M5-AC13 | PASS | Tie-break, mô tả truy cập, pendingTimer xanh |

## 4. Defect

Không có defect mới của app (M5-D4 trở đi: none).

Ghi chú test QC (không phải defect app): `tests/qc/m4-r1.spec.ts:572` thiếu chờ (xem mục 2, Playwright #3), đã sửa tại chỗ.

## 5. Kiểm lại defect vòng trước

| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| M5-D2 (Major) Vitest không ổn định | **FIXED** | 15/15 `vitest run` xanh, 4/4 lần chạy song song 2 tiến trình xanh, `npm run check` 5/5, thêm 1 lần dưới tải Playwright xanh. Đã đọc `vite.config.ts`: `testTimeout`/`hookTimeout` 20 s, `maxWorkers: 8`; `src/test/setup.ts`: `configure({ asyncUtilTimeout: 8000 })`. grep `performance.now`, `Date.now`, `toBeLessThan` trong test: assert thời gian thật chỉ còn trong `stats-service.test.ts` và chỉ khi `BENCH_ASSERT` (ngưỡng trần 60 s trong suite); `curve.test.ts` không còn. Các `setTimeout` còn lại (`reminder-scheduler`, `settings-service`, `timer-service`, `ReminderTimeField`, `Today.timer`) chỉ là chờ nhả microtask/debounce, không assert thời gian. Assert toast: grep `toHaveTextContent` trên toast chỉ còn `Settings.backup.test.tsx` 123, 198, đều nằm trong `waitFor`. Chưa dựng lại kịch bản "clone sạch, cache transform nguội"; không có dấu hiệu tái phát |
| M5-D1 (Minor) "Goal not found" chớp khi xoá từ Goal detail | **FIXED** | Đã gỡ `test.fail` (`m5-r1-flows.spec.ts:282`), xanh. `m5-r2.spec.ts`: MutationObserver + rAF ghi mọi `h1` "Goal not found"/bản vi từ lúc bấm Confirm: `[]` ở CPU x1, x4, x6 (en) và x4 (vi); toast "goalDeleted" hiện, URL `#/goals`, không pageerror. Mở lại URL goal đã xoá vẫn ra "Goal not found" (cờ `deleting` không dính); Cancel ở D2 giữ goal; xoá từ tab khác sau khi Cancel hiện "Goal not found" ở tab này |
| M5-D3 (Minor) Range "Whole period" thiếu đệm | **FIXED** | Đo bằng `getComputedStyle` và `Range.getBoundingClientRect` ở 360/768/1440 px: en "Whole period" rộng 120,7 px, đệm trái/phải 14/14 px, `scrollWidth 121 = clientWidth 121`, khoảng cách chữ-mép 14 px; "So far" 67,8 px, 14/14. vi "Cả giai đoạn" 112,8 px, 14/14, `113 = 113`; "Đến nay" 83,8 px, 14/14. Không cuộn ngang trang; chuyển radio bằng `check()` vẫn chạy |

## 6. Regression

M1-M4: toàn bộ spec dev + QC xanh ở 342/342 (lần 1, 2, 4); lần 3 một test QC M4 đỏ do race của chính test (đã sửa, 120/120 xanh). Vitest M1-M5 681/681 x15. Smoke luồng chính (Today, Goals, Review, Day, Settings, import/export, timer, +1 %) nằm trong các spec trên.

## 7. Bảo mật

`npm audit` 0 lỗ hổng; `.env` không có trong git; 0 request ngoài origin trong spec M5/QC (assert trong `watch()`). Fix chỉ chạm `GoalDetail.tsx` (state `deleting`, điều hướng có `replace: true`) và CSS, không thêm đầu vào hay API mới. Các kiểm tra XSS/import/dữ liệu hỏng của vòng 1 vẫn nằm trong bộ spec và xanh.

## 8. Chưa kiểm chứng được (NOT VERIFIED)

- M5-AC9 Firefox/Safari iOS/Chrome Android: chỉ Chromium. Tự kiểm: `npm run build && npm run preview`, mở `http://localhost:4173` bằng Firefox desktop, import `e2e/fixtures/sample-backup.json`, mở Goals, chọn Read (đường cong, Range, bảng), ghi 30 phút ở Today, thấy "+1%", Archive một goal, reload; trên điện thoại cần HTTPS (README, mục "Install on a phone").
- Screen reader thật (NVDA/VoiceOver): chưa nghe vùng `aria-live` của "+1%" và `curve-reading`. Tự kiểm: Tab vào biểu đồ, bấm mũi tên và nghe giá trị Ideal/You của từng ngày; xoá goal từ Goal detail và xác nhận không nghe "Goal not found".
- `npm run test:e2e` trên clone sạch ở đường dẫn ngắn (Playwright không mở Chromium trong clone có đường dẫn quá 260 ký tự, đúng cảnh báo README). Tự kiểm: clone vào thư mục ngắn như C:/src/opb, rồi `npm ci`, `npm run e2e:install`, `npm run test:e2e`.
- Clone sạch với cache transform nguội cho Vitest (kịch bản đỏ ở vòng 1) chưa dựng lại ở vòng 2. Tự kiểm: clone vào thư mục mới, `npm ci && npm run check`.
- Chất lượng bản dịch vi (người bản ngữ), notification thật, hết quota IndexedDB thật, phóng chữ 200 % thật bằng cài đặt trình duyệt (thử giả lập bằng font-size trên html không có tác dụng vì CSS dùng px, nên không đưa vào kết quả).

## 9. Đề xuất (không chặn)

- Trục Y biểu đồ hiện `+0.0%`, `+10.0%`; mockup `07` dùng `+0%`, `+10%`.
- `focusHeading()` (Today) dùng `requestAnimationFrame`; nên đặt focus sau khi dialog đã đóng.
- Lỗi import vượt giới hạn goal dùng chung `IMPORT_INVALID_SCHEMA`; nên có câu riêng.
- Kiểm "entry sau hôm nay" khi import dùng ngày máy nhập, có thể từ chối nhầm backup từ múi giờ đi trước (hiếm).
- Test QC `m3-r1-domain.test.ts:289` còn ngưỡng wall-clock 15 s (rộng, chưa thấy flake).
