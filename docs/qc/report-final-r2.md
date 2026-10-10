# QC report — Final (scope: final, round 2)

**Verdict:** PASS
**Ngày:** 2026-10-10  **Commit:** 6b51487 (working tree sạch; QC không sửa gì ngoài `docs/qc/` và `tests/qc/`)

## 1. Tóm tắt
- **F-D1 (Major) đã FIXED.** Dựng lại đúng kịch bản round 1 trên 2 clone sạch mới ở đường dẫn ngắn (`C:\src\opb-c`, `C:\src\opb-d`): `npm ci && npm run check` lần đầu, cache nguội, **exit 0 cả hai** (686/686, build OK). Chạy thêm stress trên clone d: xoá `node_modules/.vite`, hai `vitest run` song song, cả hai xanh 686/686.
- Clone c còn chạy `e2e:install` + `test:e2e`: **347 passed**. Hai thư mục clone đã xoá, `C:\src` trống.
- Project root: `vitest run` 5/5 xanh, `npm run check` 2/2 exit 0, Playwright đầy đủ 2/2 **347 passed**; `final-journey` 4/4 và `final-nfr` xanh cả hai lần. `npm audit` 0.
- Không có defect mới. 2 Minor của round 1 (`engines`, M1-P3) đã sửa. Mọi AC giữ nguyên trạng thái round 1; M1-AC1 và M5-AC10 chuyển FAIL sang PASS. Các phần thủ công vẫn `NOT VERIFIED` (mục 8), orchestrator cần hỏi user.

## 2. Cài đặt từ đầu theo README (clone sạch, cache nguội)
Máy: Windows 11, Node v22.14.0, npm 10.9.2. `git clone` từ project root, commit 6b51487.

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Clone c: cài | `npm ci` | exit 0, 38 s, `found 0 vulnerabilities` |
| Clone c: check | `npm run check` (lần đầu) | **exit 0, 163 s**; lint 0, typecheck 0, Vitest 70 file / **686/686** (80,5 s), build OK, precache 22 entry |
| Clone c: Chromium | `npm run e2e:install` | exit 0, 37 s |
| Clone c: E2E | `npm run test:e2e` | exit 0, **347 passed**, 2,9 phút |
| Clone d: cài | `npm ci` | exit 0, 27 s, 0 vulnerabilities |
| Clone d: check | `npm run check` (lần đầu) | **exit 0, 129 s**; Vitest 70 file / **686/686** (63,5 s), build OK |
| Clone d: stress | xoá `node_modules/.vite`, `.vite-temp`; hai `npx vitest run` cùng lúc | cả hai exit 0, 686/686, 57 s |
| Dọn | xoá `C:\src\opb-c`, `C:\src\opb-d` | xong; `C:\src` trống; không cài global |

Hướng dẫn README khớp: `engines` `>=22.14.0` = README "Node.js 22.14 or later" = `.nvmrc` 22.14.0.

## 3. Acceptance criteria (M1–M5)
Bảng đầy đủ xem `docs/qc/report-final.md` mục 3; kết quả chạy lại hôm nay (Vitest 686/686 x5, Playwright 347/347 x2) không làm đổi dòng nào ngoài hai dòng sau.

| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M1-AC1 | **PASS** (round 1: FAIL) | 2 clone sạch: `npm ci`, `npm run check` lần đầu exit 0; `e2e:install`, `test:e2e` exit 0 (mục 2); không cài global |
| M5-AC10 | **PASS** (round 1: FAIL) | Làm theo README trên clone sạch: install, check (lint, typecheck, test, build), e2e, đạt cả hai lần |
| Các AC còn lại | Giữ nguyên round 1 | PASS; phần thủ công của M1-AC10/AC11, M2-AC6/AC8/AC9/AC11, M3-AC6/AC7, M5-AC9 vẫn NOT VERIFIED (mục 8) |

## 4. Defect
Không có defect mới (F-D2 không mở). Không còn Critical/Major đang mở.

## 5. Kiểm lại defect các vòng trước
| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| **F-D1** (Major) | **FIXED** | Xem đánh giá bên dưới |
| M5-D2 (Vitest không ổn định) | FIXED (xác nhận ở clone sạch) | 2 clone nguội + 2 vitest song song + 5 lần ở root, tất cả xanh |
| M4-D5 (Vitest song song chạm timeout) | FIXED trong thực tế | hai process song song trên cache nguội xanh 2/2; vẫn còn ngưỡng wall-clock ở `m3-r1-domain.test.ts` (backlog) |
| M1-D1…D3, M2-D1…D4, M3-D1…D4, M4-D1…D4, M5-D1, M5-D3 | FIXED giữ nguyên | `tests/qc/m1-r2`, `m2-*`, `m3-r1*`, `m4-r*`, `m5-r2` xanh trong 2 lần Playwright và 5 lần Vitest (gồm test `m3-r1.spec.ts:638` đã re-target theo dispute M3-D3) |
| Minor `engines` lệch README | FIXED | `package.json` `>=22.14.0` |
| M1-P3 (dev-M1.md nhắc `1%better`) | FIXED | dòng 56 và 113 nay là ghi chú lịch sử nêu rõ thư mục đã đổi tên; không còn nhắc sai ngữ cảnh |

### Đánh giá fix F-D1 (commit 5a73e18)
- Cách sửa: (a) `Review.test.tsx`, `GoalDetail.curve.test.tsx` mock module lazy bằng stub trong `src/test/stubs/`, màn hình không còn chờ Recharts; (b) `src/test/setup.ts` `await import('recharts')` làm nóng trước mọi test jsdom; (c) assert chi tiết chart chuyển sang `BarChart.test.tsx` (2 test) và `CurveChart.test.tsx` (4 test) import tĩnh nên việc nạp module nằm ở pha collect, không nằm trong timer; (d) `GoalDetail` tính default Range không qua effect (hết khung hình "Whole period" thoáng qua). Đã đọc diff: logic sản phẩm đổi rất nhỏ (Range, tách `BarChartTable`), bundle không đổi (`index` 214,92 kB gzip, `useRechartsWidth` 97,07 kB, `final-nfr` xanh).
- Độ phủ chunk Recharts thật: Vitest không còn bắt lỗi chunk lazy không nạp được (stub thay thế), nhưng E2E trên build thật bù lại: `e2e/m4-review`, `m4-i18n` (svg `recharts-surface`, `recharts-bar-rectangle`), `e2e/m5-goal-detail`, `m5-journey` (2 `recharts-line`, đường nét đứt, 2 `reference-dot`), `final-journey` (Review và Goal detail), `final-nfr` (Today không tải Recharts, Review mới tải). Cấu trúc nội bộ của chart có test riêng (6 test, xanh). Khoảng trống còn lại rất nhỏ: fallback Suspense của hai chart không có unit test. Chấp nhận được.
- Chi phí: warm-up thêm vài giây vào lần chạy Vitest nóng (27 đến 32 s), không đáng kể.

## 6. Regression
- Root: `npm run lint` 0/0, typecheck 0, build exit 0 (cảnh báo chunk size của Vite về `index-*.js` 704 kB raw, có từ trước, bundle gzip trong ngân sách), `npm audit` 0.
- Vitest 5 lần liên tiếp: 686/686, 27 đến 32 s, exit 0 mỗi lần. `npm run check` 2 lần: exit 0, 43 s và 38 s.
- Playwright (dev + `tests/qc`) 2 lần: **347 passed**, 2,5 phút mỗi lần, không flake. Có `final-journey` (en-US/vi-VN x 360/1440 px) 4/4 và `final-nfr` 1/1 ở cả hai lần.

## 7. Bảo mật
Không thay đổi so với round 1: `npm audit` 0 (cả trên 2 clone), không có secret mới (diff từ round 1 chỉ gồm test, stub, 2 file UI nhỏ, `engines`, docs), 0 request ngoài origin trong 347 test x 2, axe sạch, không cuộn ngang trong hành trình.

## 8. Chưa kiểm chứng được (NOT VERIFIED) — danh sách gọn cho user
Môi trường tự động chỉ có Chromium của Playwright. Chuẩn bị: `npm run build && npm run preview`, mở `http://localhost:4173`; cần dữ liệu thì import `e2e/fixtures/sample-backup.json` ở Settings.
1. **Notification thật và bấm vào (M2-AC8/AC9):** Settings, bật Daily reminder, Allow, đặt giờ = giờ hiện tại + 1 phút. Mong đợi 1 notification kiểu "1% Better, N goal left today"; bấm: cửa sổ app lên Today; đóng cửa sổ rồi bấm: mở cửa sổ mới ở Today; không có cái thứ hai trong ngày.
2. **Nhập .ics vào lịch thật (M2-AC11):** Settings, Add reminder to calendar (.ics), mở bằng Google/Outlook/Apple Calendar: sự kiện lặp hằng ngày từ ngày mai, 15 phút, nhắc lúc bắt đầu, tiêu đề theo ngôn ngữ đang chọn.
3. **Hộp xin quyền thật và popup chọn giờ (M2-AC6):** bật switch lần đầu có hộp xin quyền; Allow thành chip Allowed, Block thành Blocked và banner vẫn hiện; chọn 07:30 ở popup đồng hồ, toast một lần, reload vẫn 07:30.
4. **Hộp Save/Open của hệ điều hành (M3-AC6/AC7):** Export ra file 1percent-better-backup-YYYY-MM-DD.json ở Downloads; Import đúng file ở profile khác ra "5 goals, 23 entries" (với fixture mẫu), dữ liệu như nhau; thử file lưu từ Notepad (BOM).
5. **Install và đóng hẳn Chrome (M1-AC10/AC11):** Chrome/Edge desktop, bấm Install ở thanh địa chỉ, app mở cửa sổ riêng tên "1% Better"; tạo goal, ghi 10 phút, thoát hẳn Chrome, mở lại: dữ liệu còn; Settings, Storage hiện Protected.
6. **Firefox, Safari iOS 16.4+, Chrome Android (M5-AC9):** qua HTTPS (README, mục Install on a phone): tạo goal, ghi entry, reload còn dữ liệu, Review, chạm ô heatmap, cuộn ngang heatmap/đường cong/Range, Archive, Export/Import, bấm đúp nhanh Start timer, bộ chọn giờ gốc.
7. **Screen reader thật (NVDA, VoiceOver):** Tab vào heatmap, mũi tên nghe tên ô; Tab vào đường cong, mũi tên nghe Ideal/You; ghi đủ chỉ tiêu nghe vùng "+1%"; xoá goal từ Goal detail không nghe "Goal not found".
8. **Chất lượng bản dịch tiếng Việt** (người bản ngữ): đọc src/i18n/resources/vi.json, rò rỉ chuỗi en, bố cục.
9. **UpdateToast bản mới, hết quota IndexedDB thật, phóng chữ 200 %:** chưa dựng được tự động.

## 9. Backlog tổng hợp (Minor và đề xuất, không chặn)
- **Test:** `m3-r1-domain.test.ts:289` còn ngưỡng wall-clock 15 s (QC); fallback Suspense của hai chart chưa có unit test; Vitest setup nay nạp Recharts cho mọi file jsdom (thêm vài giây CPU, có thể giới hạn cho nhóm test chart nếu thời gian chạy thành vấn đề).
- **Tài liệu/design:** DESIGN §6 nói heatmap vừa ở từ 1024 px nhưng 1024 đến 1191 px vẫn cuộn nội bộ (designer sửa câu chữ hoặc ngưỡng); DESIGN `empty.day.noGoals` có dấu chấm cuối còn `en.json` không có; plan ghi nhận quyết định SW precache chunk Recharts (~101 kB).
- **Code/UX:** M3-P1 (`exportBackup` thiếu `catch`; assertion E2E cho dòng why và số từ 1000 trở lên); M5-P1 (trục Y curve `+0.0%` thay vì `+0%`; `focusHeading()` dùng `requestAnimationFrame`; lỗi import vượt giới hạn goal dùng chung `IMPORT_INVALID_SCHEMA`, nên có câu riêng); kiểm entry sau hôm nay khi import dùng ngày máy nhập (có thể từ chối nhầm backup từ múi giờ đi trước, hiếm); biểu đồ chưa có nhãn giá trị trên cột; thẻ Progress đứng riêng hàng ở 360 px khi chọn một goal; hai tab cùng ghi tay cùng goal/ngày có thể vượt 1440 phút (ARCH §10).
- **Đã quyết định (không phải defect):** SW precache sẵn chunk Recharts sau khi cài (STATUS 2026-10-10).

## Tệp QC
Không thêm test mới ở round 2. Đang dùng `tests/qc/final-journey.spec.ts`, `tests/qc/final-nfr.spec.ts` (đã chạy 2 lần, xanh).
