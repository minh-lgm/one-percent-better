# QC report — Final (scope: final, round 1)

**Verdict:** FAIL
**Ngày:** 2026-10-10  **Commit:** 78461fe (working tree: thêm `tests/qc/final-journey.spec.ts`, `tests/qc/final-nfr.spec.ts` của QC)

## 1. Tóm tắt
- **1 defect Major mở: F-D1.** Trên clone sạch ở đường dẫn ngắn, `npm ci` rồi `npm test` (hoặc `npm run check`) lần đầu **đỏ 2/2 lần** (2 test Vitest hết hạn chờ khi nạp chunk biểu đồ). Chạy lại ngay thì xanh. Đây đúng là kịch bản M5-D2 mà M5 r2 ghi FIXED nhưng chưa dựng lại (r2 mục 8). Hướng dẫn README (`npm run check`) vì vậy không chạy được ở lần đầu trên máy mới. Theo quy tắc verdict: FAIL.
- Mọi thứ khác đạt: clone sạch `npm ci`, `e2e:install`, lint, typecheck, build, `test:e2e` (342/342), `preview`, `dev` đều chạy; trên project root Vitest 681/681 x2, Playwright 346/346 x2 (dev 63 + QC 283), coverage dòng 99,58 %, bench 8,5 ms. Hành trình người dùng end-to-end xanh ở en-US và vi-VN, 360 px và 1440 px (4/4). NFR: bundle 219,2 kB JS gzip lúc tải lạnh Today, 0 request ngoài origin, `npm audit` 0, không secret, axe 0 serious/critical, không cuộn ngang.
- Không có AC nào ngoài M1-AC1 và M5-AC10 (cùng nguyên nhân F-D1) bị FAIL. Các phần thủ công vẫn `NOT VERIFIED` (mục 8); orchestrator cần hỏi user.
- Sau khi dev sửa F-D1, QC chỉ cần dựng lại clone sạch (2 clone mới, mỗi clone `npm ci && npm run check`) là có thể ra PASS; phần còn lại đã xanh và ổn định.

## 2. Cài đặt từ đầu theo README (clone sạch, đường dẫn ngắn)
Máy: Windows 11, 24 luồng CPU, Node v22.14.0, npm 10.9.2. `git clone` sang `C:\src\opb` (rồi `C:\src\opb2`), làm đúng từng bước README. Cả hai thư mục đã xoá xong; không cài gì global (`npm ls -g` chỉ còn các gói có sẵn từ trước: json-server, mongodb, netlify-cli, pnpm).

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Clone | `git clone <repo> C:\src\opb` | OK, commit 78461fe, working tree sạch |
| Cài | `npm ci` | exit 0, 19 s, `found 0 vulnerabilities` (chỉ cảnh báo deprecated của whatwg-encoding, glob) |
| Chromium | `npm run e2e:install` | exit 0, 31 s (tải 197,5 MiB vào `node_modules`) |
| Check (clone 1) | `npm run check` | **exit 1, 99 s**: lint OK, typecheck OK, Vitest **2 failed / 679 passed (681)**, dừng trước `build` (xem F-D1) |
| Vitest chạy lại ngay (clone 1) | `npx vitest run` | 681/681, 36,4 s |
| Vitest sau khi xoá `node_modules/.vite` và `.vite-temp` | `npx vitest run` | 681/681, 35,9 s (nên không phải cache transform) |
| Build | `npm run build` | exit 0, 4,7 s; `index-*.js` 214,92 kB + `useFormat-*.js` 6,69 kB gzip; `useRechartsWidth-*.js` 97,07 kB gzip; precache 22 entry |
| E2E (clone 1) | `npm run test:e2e` | **342 passed, 2,9 phút** (dev + QC trước vòng cuối) |
| Preview | `npm run preview` + `curl` | `http://localhost:4173/` 200 text/html, `manifest.webmanifest` 200, `sw.js` 200 |
| Dev | `npm run dev` + `curl` | `http://localhost:5173/` 200 |
| Audit | `npm audit` | 0 vulnerabilities |
| Clone 2 (lặp lại) | `git clone` → `npm ci` → `npm test` ngay | **2 failed / 679 passed**, 53 s (environment 112 s), cùng 2 test; chạy `npm test` lần hai: 681/681, 36 s |

Hướng dẫn README đúng ở mọi bước còn lại (đường dẫn ngắn, `legacy-peer-deps`, lệnh, cổng, kích thước bundle khớp số đo). Ngoài ra `engines` trong `package.json` là `>=22.13.0` còn README ghi "22.14 or later" (Minor, mục 9).

## 3. Acceptance criteria (M1–M5, 70 AC)
Cách làm lại: chạy lại toàn bộ Vitest (x2, 681/681), toàn bộ Playwright (x2, 346/346), thêm hành trình cuối (`final-journey`, 4 cấu hình) và `final-nfr`. Cột bằng chứng nêu spec/test chính; AC thủ công ghi rõ phần `NOT VERIFIED`. Report gốc: `report-M1-r2`, `-M2-r3`, `-M3-r1`, `-M4-r2`, `-M5-r2`.

| AC | Kết quả | Bằng chứng (chạy lại hôm nay) |
| :- | :- | :- |
| M1-AC1 | **FAIL** (F-D1) | Clone sạch: `npm ci`, `e2e:install`, lint, typecheck, build, `test:e2e` exit 0; `npm test` lần đầu exit 1 (2 test đỏ), lần hai exit 0. Không cài global |
| M1-AC2 … AC9 | PASS | `e2e/m1-goals.spec.ts`, `m1-today.spec.ts`, `tests/qc/m1-*.spec.ts`, `m1-domain.test.ts`, unit domain/service; xanh 2/2 lần; tạo goal, ghi, sửa, xoá còn được lặp lại trong `final-journey` (4 cấu hình) |
| M1-AC10 | PASS (tự động) / NOT VERIFIED (đóng hẳn Chrome) | E2E reload và `launchPersistentContext` xanh; journey xoá + import + reload xanh. Bước thủ công ở mục 8 |
| M1-AC11 | PASS (tự động) / NOT VERIFIED (nút Install) | `m1-pwa.spec.ts` manifest, SW, offline xanh; `final-journey` offline reload 7 route xanh |
| M1-AC12 | PASS | 0 request ngoài origin trong cả 4 hành trình + `final-nfr`; XSS literal; `dangerouslySetInnerHTML` trong `src` 0; axe; không cuộn ngang |
| M1-AC13, AC14 | PASS | lint tách lớp, ID UUID (unit); Not found và `#/` (e2e, sweep) |
| M1-AC15 … AC18 | PASS | `m1-i18n.spec.ts`, parity, i18n-scan; hành trình `vi-VN` quét vi sau mỗi bước (0 phát hiện) |
| M2-AC1 … AC5, AC7 | PASS | `m2-timer.spec.ts`, `m2-r2*`, `m2-r3-domain`, unit domain; timer qua reload và Stop/Save lặp lại trong journey (en, vi; 360, 1440) |
| M2-AC6 | PASS (tự động) / NOT VERIFIED (hộp xin quyền thật, popup giờ) | `m2-reminder.spec.ts` 4 trạng thái, 07:30, gõ phím; journey bật nhắc |
| M2-AC8 | PASS (tự động) / NOT VERIFIED (notification thật) | `showNotification` đúng 1 lần/ngày trong `m2-reminder`, `m2-notify`; journey: đúng 1 lần, `lang` = ngôn ngữ giao diện, body có tên goal |
| M2-AC9 | PASS (unit, SW tổng hợp) / NOT VERIFIED (bấm thật) | `notification-click.test.ts`, `m2-notify.spec.ts` |
| M2-AC10 | PASS | banner trong journey (permission cấp) và `m2-reminder` (denied) |
| M2-AC11 | PASS (tự động) / NOT VERIFIED (nhập vào lịch thật) | `ics` unit, e2e tải file đúng tên |
| M2-AC12, AC13 | PASS | `m2-i18n.spec.ts`, axe dialog Stop (journey, mọi cấu hình), 360 px không cuộn ngang |
| M3-AC1 … AC5 | PASS | `m3-day.spec.ts`, `m3-history.spec.ts`, `tests/qc/m3-r1*` |
| M3-AC6, AC7 | PASS (tự động) / NOT VERIFIED (hộp Save/Open của OS, trình duyệt khác) | `m3-backup.spec.ts`; journey export tên `1percent-better-backup-2026-10-09.json`, 2 goal, 4 entry, không có `locale`; xoá hết rồi import: `goals`/`entries` = 2/4, cùng id |
| M3-AC8, AC9, AC11 | PASS | `m3-backup`, `m3-r1-domain.test.ts` (40+ file xấu, rollback), XSS note |
| M3-AC10 | PASS | component test banner backup 30 ngày |
| M3-AC12, AC13 | PASS | axe, vi; import giữ ngôn ngữ (journey vi, en) |
| M3-AC14, AC15 | PASS | `m3-r1-domain.test.ts` (hai/ba tab, 20/20 lần), Vitest 681/681 x2 |
| M4-AC1 … AC6 | PASS | unit `heatmap`, `stats`; journey: ô 2026-10-08 và 10-09 có màu, streak 2, 12 cột chart |
| M4-AC7, AC8 | PASS | `m4-review.spec.ts`, `tests/qc/m4-r*.spec.ts` |
| M4-AC9 | PASS | bench: median 8,5 ms (in-memory), 80,4 ms (fake-indexeddb), 21,4 ms (review model), đều < 200 ms; `final-nfr`: tải lạnh Today 219,2 kB JS gzip, không tải Recharts; Review mới tải |
| M4-AC10, AC11 | PASS | axe và không cuộn ngang trong journey; `m4-i18n.spec.ts`; `m5-r1-sweep.spec.ts` 4 tổ hợp x 16 màn x 3 viewport |
| M5-AC1 … AC5 | PASS | `curve.test`, `m5-goal-detail.spec.ts`; journey: headline `+2.0% better` / `Tốt hơn +2,0%`, 2 line, history 3 hàng, archive qua export/import giữ nguyên |
| M5-AC6 | PASS | `m5-goal-detail.spec.ts`, StorageError (sweep) |
| M5-AC7 | PASS | `m5-journey.spec.ts` và `final-journey` (mở rộng: 2 goal, nhắc nhở, archive, xoá hết, import lại, offline 7 route, ghi offline 35/30 còn sau reload) |
| M5-AC8 | PASS | `m5-journey.spec.ts` bàn phím + axe + cuộn ngang; journey axe và scrollWidth <= clientWidth ở mỗi bước, 360 và 1440, en và vi |
| M5-AC9 | NOT VERIFIED | Firefox, Safari iOS, Chrome Android (mục 8) |
| M5-AC10 | **FAIL** (F-D1) | Làm theo README trên clone sạch: install, dev, build, preview, lint, typecheck, e2e đạt; `npm run check` đỏ ở lần chạy `npm test` đầu |
| M5-AC11 | PASS | 346/346 x2; 0 request ngoài origin |
| M5-AC12 | PASS | `m5-i18n.spec.ts`, sweep vi, journey `vi-VN` quét vi mỗi bước; đổi sang English khi offline rồi reload offline giữ nguyên (journey en) |
| M5-AC13 | PASS | `domain/goal.test`, `Today`, `Settings`, `Goals` component test (681/681) |

## 4. Defect
### F-D1 — Vitest lần đầu sau `npm ci` đỏ trên clone sạch (M5-D2 chưa dứt)  [Major]
- Bước tái hiện (làm 2 lần, 2 clone khác nhau): `git clone D:/minh/Coderschool/GitHub/one-percent-better C:\src\opb2`, `cd C:\src\opb2`, `npm ci`, `npm test` ngay sau đó (clone 1: `npm run check` sau `npm ci` và `e2e:install`). Không chạy gì khác song song.
- Mong đợi: M1-AC1 và M5-AC10 (`npm run check` exit 0 trên clone sạch); M5-D2 đã được ghi FIXED với tiêu chí clone sạch, cache nguội phải xanh.
- Thực tế: `Test Files 2 failed | 66 passed (68)`, `Tests 2 failed | 679 passed (681)`, 53 s (environment 112 s so với 31 s khi nóng), `npm run check` exit 1 và không tới `build`. Hai test đỏ ở cả hai clone:
  - `src/ui/screens/Review.test.tsx` test "All goals, 2026: 4 stat cards, streak 8/10, heatmap summary, two 12-column charts…": `Unable to find an element by: [data-testid="chart-weekly"]` (11–13 s)
  - `src/ui/screens/GoalDetail.curve.test.tsx` test "Read (S1): headline +8.3% better, …": `Unable to find an element by: [data-testid="curve-chart"]` (11–13 s)
  Chạy `npm test` lần hai ngay sau đó: 681/681, 36 s. Xoá `node_modules/.vite` và `.vite-temp` rồi chạy lại: vẫn xanh, nghĩa là không phải cache transform mà là lần nạp đầu của cây `node_modules` mới (nạp lazy Recharts trong jsdom, 8 worker cùng lúc, đĩa nguội) vượt `asyncUtilTimeout` 8 s.
- Vị trí nghi ngờ: `src/test/setup.ts:15` (`asyncUtilTimeout: 8000`), `src/ui/screens/Review.test.tsx:30-33` (`SLOW = { timeout: 8000 }`), `vite.config.ts:61-64` (`testTimeout`/`hookTimeout` 20 s, `maxWorkers: 8`); test của GoalDetail.curve dùng cùng cơ chế chờ chart lazy.
- Ghi chú: ở project root (máy đã nóng) 15+ lần Vitest đều xanh nên QC M5 r2 không thấy; chỉ lộ khi dựng lại clone sạch.

## 5. Kiểm lại defect các vòng trước (không tái phát)
| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| M1-D1 (Major, Goals cuộn ngang), M1-D2, M1-D3 | FIXED giữ nguyên | `tests/qc/m1-r2.spec.ts` (51 ca) xanh 2/2; journey 360 px không cuộn ngang |
| M2-D1 … M2-D4 | FIXED giữ nguyên | `m2-qc`, `m2-r2*`, `m2-r3-domain`, `m2-r2-dblclick` xanh 2/2 |
| M3-D1 (why rác), M3-D2 (dấu nghìn), M3-D3 (import vượt giới hạn), M3-D4 (tab thua cuộc đua) | FIXED giữ nguyên | `tests/qc/m3-r1.spec.ts`, `m3-r1-domain.test.ts` (đã re-target dòng 638, dispute M3-D3) xanh |
| M4-D1 … M4-D4 | FIXED giữ nguyên | `m4-r1*`, `m4-r2.spec.ts` xanh; không còn `test.fail` ẩn |
| M4-D5 (Vitest song song chạm timeout) | NOT FIXED trong dạng lần đầu | cùng họ với F-D1: chạy nóng ổn định, chạy lần đầu trên clone sạch đỏ |
| M5-D1 (Goal not found chớp), M5-D3 (Range padding) | FIXED giữ nguyên | `m5-r2.spec.ts` xanh |
| M5-D2 (Vitest không ổn định) | **REGRESSED / chưa dứt ở clone sạch** | xem F-D1 |

## 6. Regression
- Project root: lint, typecheck exit 0; build exit 0; Vitest 681/681 hai lần (31 s); Playwright **346 passed (2,7 phút) hai lần** (dev 63, QC 283, gồm 4 ca journey mới); `test:coverage` 99,58 % dòng toàn bộ, domain trên ngưỡng 90 %; `npm run bench` 10/10.
- Không có flake trong 3 lần Playwright (1 lần chỉ journey, 2 lần toàn bộ) và 2 lần Vitest nóng.

## 7. Bảo mật và NFR
| Hạng mục | Kết quả |
| :- | :- |
| Bundle entry (NFR-03) | build: `index-*.js` 214,92 + `useFormat-*.js` 6,69 = 221,6 kB gzip (+ css 5,82); `final-nfr` đo thực khi tải lạnh `#/today`: 219,2 kB JS, 225,5 kB cả HTML/CSS/JS gzip (dưới 250 kB). Không tải `useRechartsWidth`/`BarChart`/`CurveChart` ở Today; Review mới tải. SW precache toàn bộ chunk sau cài (đã được orchestrator chấp nhận 2026-10-10) |
| Request ngoài origin | 0 trong 4 hành trình, trong `final-nfr`, và trong 346 test; không có tên miền ngoài được fetch (chuỗi http trong `dist` chỉ là text lỗi hoặc comment thư viện) |
| `npm audit` | 0 vulnerabilities (toàn bộ và `--omit=dev`), cả trên clone sạch |
| Secret | `git ls-files` chỉ có `.env.example`; `.env` trong `.gitignore`; quét pattern khoá/token trong `src`, `e2e`, `scripts`, cấu hình: không có; không đọc `.env` |
| Injection / XSS | `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function` trong `src` (không tính test): 0; note và tên goal hiển thị literal (spec m1, m2, m3) |
| axe | 0 serious/critical ở mọi bước hành trình (4 cấu hình), và sweep 16 màn x en/vi x sáng/tối x 3 viewport |
| Cuộn ngang | `scrollWidth <= clientWidth` ở mọi bước hành trình, 360 và 1440 px, en và vi (có cả trang offline) |
| Console | 0 `pageerror`, 0 `console.error` (trước khi offline) trong hành trình |

## 8. Chưa kiểm chứng được (NOT VERIFIED) — danh sách cho user
Môi trường tự động chỉ có Chromium của Playwright. Cách tự kiểm đều dùng `npm run build && npm run preview`, mở `http://localhost:4173`, import `e2e/fixtures/sample-backup.json` qua Settings khi cần dữ liệu.

1. **Notification thật và bấm vào notification (M2-AC8/AC9).** Settings, bật Daily reminder, Allow; đặt giờ bằng giờ hiện tại cộng 1 phút; chờ tối đa 60 s hoặc chuyển tab rồi quay lại: có 1 notification kiểu "1% Better, N goal left today"; bấm vào: cửa sổ app lên trước ở `#/today`; đóng cửa sổ rồi bấm notification còn lại: mở cửa sổ mới ở Today. Trong ngày không có cái thứ hai.
2. **Nhập `.ics` vào lịch thật (M2-AC11).** Settings, Add reminder to calendar (.ics), mở bằng Google Calendar, Outlook hoặc Apple Calendar: sự kiện lặp hằng ngày từ ngày mai lúc giờ nhắc, dài 15 phút, nhắc lúc bắt đầu, tiêu đề theo ngôn ngữ đang chọn.
3. **Hộp xin quyền thật và popup chọn giờ (M2-AC6).** Bật switch lần đầu: hộp xin quyền; Allow thì chip Allowed, Block thì chip Blocked và banner vẫn hiện sau giờ nhắc. Bấm biểu tượng đồng hồ ở ô giờ, chọn 07:30: toast một lần, reload vẫn 07:30.
4. **Hộp Save/Open của hệ điều hành cho Export/Import (M3-AC6/AC7)** và file có BOM hoặc UTF-16 trên trình duyệt khác. Export: file `1percent-better-backup-YYYY-MM-DD.json` ở Downloads; Import đúng file đó ở profile khác: "5 goals, 23 entries", xác nhận, dữ liệu như nhau; thử file lưu từ Notepad (có BOM).
5. **Nút Install, cửa sổ app riêng, và đóng hẳn Chrome rồi mở lại (M1-AC10/AC11).** Chrome hoặc Edge desktop: biểu tượng Install ở thanh địa chỉ, cài, app mở cửa sổ riêng có tên và biểu tượng "1% Better"; tạo goal và ghi 10 phút, thoát hẳn Chrome (không còn tiến trình), mở lại cùng URL: dữ liệu còn; Settings, Storage hiện Protected khi đã cài.
6. **Firefox, Safari iOS (16.4+), Chrome Android (M5-AC9, NFR-06).** Qua HTTPS (README, mục "Install on a phone"): tạo goal, ghi entry, reload còn dữ liệu, Review hiển thị, chạm ô heatmap (tooltip), cuộn ngang heatmap, đường cong và Range, Archive, Export/Import, bấm đúp nhanh Start timer trên cảm ứng, bộ chọn giờ gốc.
7. **Screen reader thật (NVDA, VoiceOver).** Tab vào heatmap, dùng mũi tên và nghe tên ô; Tab vào đường cong, mũi tên nghe Ideal/You từng ngày; ghi đủ chỉ tiêu và nghe vùng "+1%"; xoá goal từ Goal detail và xác nhận không nghe "Goal not found".
8. **Chất lượng bản dịch tiếng Việt** (người bản ngữ): chỉ kiểm nguyên văn từ `vi.json`, rò rỉ chuỗi en, bố cục.
9. **UpdateToast khi có bản mới, hết quota IndexedDB thật, phóng chữ 200 % bằng cài đặt trình duyệt:** chưa dựng được tự động.

## 9. Backlog (Minor và đề xuất, không chặn), tổng hợp từ STATUS và các report
- **Test ổn định (liên quan F-D1):** M4-D5; `m3-r1-domain.test.ts:289` còn ngưỡng wall-clock 15 s (QC M5 r2).
- **Tài liệu:** M1-P3 (`docs/handoff/dev-M1.md` dòng 56 nhắc thư mục cũ); `engines` là `>=22.13.0` còn README ghi "22.14 or later"; DESIGN §6 nói heatmap vừa khít từ 1024 px nhưng 1024–1191 px vẫn cuộn nội bộ (designer sửa câu chữ hoặc ngưỡng); DESIGN `empty.day.noGoals` có dấu chấm cuối, `en.json` không có.
- **Code/UX:** M3-P1 (`exportBackup` thiếu `catch`; thêm assertion E2E cho dòng why và test số từ 1000 trở lên trong D3 và toast); M5-P1 (trục Y curve hiện `+0.0%` thay vì `+0%`; `focusHeading()` dùng `requestAnimationFrame`, nên đặt focus sau khi dialog đóng; lỗi import vượt giới hạn goal dùng chung `IMPORT_INVALID_SCHEMA`, nên có câu riêng); kiểm entry sau hôm nay khi import dùng ngày máy nhập, có thể từ chối nhầm backup từ múi giờ đi trước (hiếm); biểu đồ chưa có nhãn giá trị trên cột; thẻ Progress đứng riêng hàng ở 360 px khi chọn một goal; hai tab cùng ghi tay cùng goal và ngày có thể vượt 1440 phút (ARCH §10, đã ở mục Later).
- **Đã quyết định (không phải defect):** SW precache sẵn chunk Recharts (khoảng 101 kB) sau khi cài (STATUS 2026-10-10).
- **Đề xuất cho dev khi sửa F-D1:** làm nóng chunk Recharts trước khi các test chart bắt đầu (một `await import(...)` trong `beforeAll` với `hookTimeout` đủ lớn, hoặc nâng `asyncUtilTimeout` riêng cho 2 file), rồi thử lại trên clone sạch bằng đúng lệnh ở mục 4.

## Tệp QC thêm trong vòng cuối
- `tests/qc/final-journey.spec.ts`: 4 ca (en-US và vi-VN, 360 và 1440 px): lần cài đầu, tạo 2 goal (daily và total), ghi tay, timer qua reload, nhắc nhở (banner và đúng 1 notification), ghi bù hôm qua, Review, Goal detail, archive, export, xoá hết, import lại (id và số bản ghi khớp), offline reload 7 route, ghi offline; kiểm 0 request ngoài origin, 0 pageerror, 0 console error, axe và cuộn ngang ở từng bước, quét vi ở vi-VN. Chạy 3 lần, 4/4 xanh.
- `tests/qc/final-nfr.spec.ts`: đo gzip khi tải lạnh Today, không có chunk Recharts, chunk tải lazy ở Review.
