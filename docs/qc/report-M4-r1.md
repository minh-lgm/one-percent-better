# QC report — M4 round 1

**Verdict:** FAIL
**Ngày:** 2026-10-10  **Commit:** a69e9e1 (code M4 ở 786a82f; working tree: QC thêm `tests/qc/m4-r1-domain.test.ts`, `tests/qc/m4-r1.spec.ts` và file report này)

## 1. Tóm tắt
- M4-AC1…AC11 đều đạt về chức năng, có bằng chứng tự chạy: oracle độc lập (brute force, không dùng code của dev) cho streak, thống kê, heatmap, series trên dữ liệu ngẫu nhiên qua ranh giới năm và năm nhuận khớp 100%; số liệu S1 từng goal khớp oracle mockup; Playwright đầy đủ **274/274** (dev M1–M4 + QC M1–M4), `npm run check` exit 0 ở lần chạy cuối.
- **FAIL vì 1 Major (M4-D3):** bộ unit test của dev không ổn định, `npm run check` (DoD mục 1) đỏ khoảng 1/4 số lần chạy (4/17 lần tôi chạy; mỗi lần một test `document.title` khác nhau, đều là race trong test, xem M4-D3). Dev đã gặp 1 lần và chỉ nới timeout.
- 3 Minor: M4-D1 (pace sai cho goal archived chưa bắt đầu, "16 h 30 min ahead"), M4-D2 (cột Review rộng 640 px thay vì 960 px, heatmap ở 1440 px bị che khoảng 1/3 sau thanh cuộn), M4-D4 (thiếu khoảng trắng trước "Whole goal").
- M3-D1 và M3-D2: FIXED (mục 5). Hiệu năng (Review hiện sau 132–191 ms với `large-backup.json`), bundle (entry 218,8 kB gzip theo Vite, 216,3 kB theo zlib -9, ≤ 250), lazy Recharts, a11y axe sáng/tối, i18n vi, bảo mật: đạt.
- NOT VERIFIED: Firefox/Safari/iOS, cuộn cảm ứng thật, screen reader thật (mục 8).

## 2. Môi trường và lệnh đã chạy
Windows 11, Node v22.14.0, npm 10.9.2, Chromium của Playwright, thư mục project; dựng theo handoff (build + preview 4173 qua `webServer`).

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Gate lần 1 | `npm run check` | **exit 1**: Vitest 482/483, fail `GoalDetail.test.tsx:30` (`document.title` là chuỗi rỗng) |
| Lặp Vitest (không đổi code) | `npx vitest run` x 17 lần (một phần có test QC mới) | 13 xanh, **4 đỏ**: `GoalDetail.test.tsx:30` (title rỗng), `Review.test.tsx:41` (title rỗng) x2, `GoalDetail.test.tsx:106` (title còn là `Read — 1% Better`); mỗi lần chỉ 1 test fail |
| Gate lần cuối | `npm run check` | **exit 0**: eslint `--max-warnings 0` sạch, typecheck 0, Vitest 61 file, 567 passed + 1 expected fail (test QC cố ý cho M4-D1), build OK |
| Build | `npm run build` + `zlib.gzipSync(level 9)` | `index-*.js` 714,96 kB raw / **218,79 kB gzip (Vite)** / 216,27 kB (zlib -9); `Review-*.js` 12,74 / 4,66 kB; `BarChart-*.js` (Recharts) 350,66 / **101,70 kB**; CSS 5,48 kB. `dist/index.html` chỉ có 1 script + 1 stylesheet, không modulepreload tới chunk chart |
| E2E đầy đủ | `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test` | 274 passed (1,2 phút) ở lần 1 và lần 3; lần 2: 273 passed + 1 fail `tests/qc/m2-notify.spec.ts:175` (`registration.getNotifications()` trả rỗng dưới tải, flake đã biết của test QC M2, mục 6) |
| Unit QC mới | `npx vitest run tests/qc/m4-r1-domain.test.ts` | 85 test: 84 xanh + 1 `it.fails` (M4-D1) |
| E2E QC mới | `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test tests/qc/m4-r1.spec.ts` | 24 test xanh (gồm 2 `test.fail()` cho M4-D1/M4-D2) |
| Audit | `npm audit` | found 0 vulnerabilities |
| Quét mã | đọc `Review.tsx`, `Heatmap.tsx`, `BarChart.tsx`; rg `dangerouslySetInnerHTML`, `fetch(`, `innerHTML` | không có; mọi chuỗi qua JSX; không `.env` bị commit |

## 3. Acceptance criteria

| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M4-AC1 lưới đúng lịch | PASS | QC oracle (`m4-r1-domain.test.ts`): 3 mốc "hôm nay" x 3 seed x 3 năm (gồm 2024, 2028 nhuận) x (All + từng goal), từng ô so với brute force: ngày, hàng (thứ Hai = 0), cột, số cột, 365/366 ô. QC E2E: 2026 = 365 ô, mỗi hàng 53 phần tử; 2028-01-01 ở hàng Thứ Bảy, 2028-02-29 tồn tại và mở `#/day/2028-02-29` |
| M4-AC2 mức màu | PASS | Oracle brute force mức 0–4 cho từng goal (ngưỡng 0.5/1/2 lần chỉ tiêu) và All goals (30/60/120) trên mọi ô; `outside`/`future`/`none`/`logged` đúng. S1 UI: 09-15 → l1, 10-07 → l2, 03-02 → l3, 06-30 → l1; hôm nay có class `today` và viền khác ô thường |
| M4-AC3 nhãn truy cập, bàn phím | PASS | Tên ô `Wednesday, October 7, 2026: 50 min, target met`. QC E2E bàn phím thật: đúng 1 tab-stop (1 ô `tabindex=0`, 364 ô `-1`), Tab từ Year vào ô hôm nay, Tab tiếp ra khỏi lưới, Shift+Tab quay lại cùng ô; ←/→ ±1 tuần; ↓ từ Chủ nhật sang Thứ Hai cột sau, ↑ ngược lại; Home/End = 01-01/12-31; ở ô đầu/cuối mũi tên không làm gì và không lỗi; Enter/Space mở Day với ô quá khứ, không điều hướng với ô future/outside; tooltip hiện khi focus (`role=tooltip`), roving tabindex theo ô đang focus; vòng focus hiện ở 320 px |
| M4-AC4 streak | PASS | Oracle brute force streak hiện tại/dài nhất (từng goal và tổng) trên 72 bộ dữ liệu ngẫu nhiên, "hôm nay" gồm 2028-02-29, 2027-01-01, 2025-12-31, 2024-03-01: khớp. UI: S1 8/10 (tổng), Read 8/8, Guitar 2/10; ghi 30 phút Read ở Today → chip `9-day streak`, Review Read 9/9, tổng 9/10 (live, không reload; cả khi ghi từ tab khác). Qua ranh giới năm (2025-12-25 → 2026-01-02 = 9; năm 2025: 7 ngày đạt, 2026: 2) và năm nhuận (2028-02-27 → 03-02 = 5); ngày hụt đặt lại streak hiện tại, giữ dài nhất; 29/30 phút không tính đạt |
| M4-AC5 tổng, tiến độ, pace | PASS | UI từng goal (S1, 2026-10-09): Read `4.0 h`, `Whole goal: 4.0 h`, 8 ngày, `25.8%`, `240 of 930 min`, `30 min behind`, `Expected 270 min by today` (tính cả hôm nay); Guitar 4.2 h, 12 ngày, 10.2%, `8 h 50 min behind`, expected 780; Spanish 1.0 h, 1.0%, `78 h 54 min behind`, expected 4,794; Marathon prep `On pace`, expected 0; Old course 0.6%, `45 h behind`. All goals: 9.4 h, 20 ngày, streak 8/10 (khớp oracle mockup 06). Số lớn có dấu phân cách (`1,025.6 h`) |
| M4-AC6 biểu đồ tuần/tháng | PASS | UI + bảng ẩn: 12 hàng mỗi bảng; tuần bắt đầu 2026-10-05 = `2 h 40 min`, tuần đầu `Jul 20`, tuần `Sep 28` = 2 h; 12 tháng 2026 = 0,0,1 h,0,0,15 min,0,0,3 h 30,4 h 40,0,0 (Sep 210 + Oct 280 phút khớp); 2 `svg.recharts-surface`; bảng ẩn bằng `position:absolute; clip:rect(0,0,0,0)`, svg `aria-hidden`, `figcaption` = tóm tắt. Oracle series trên dữ liệu ngẫu nhiên qua ranh giới năm: khớp |
| M4-AC7 chọn goal/năm qua URL | PASS | Chọn Read → `#/review?goal=g1&year=2026`; reload giữ lựa chọn; `goal=g1&year=2025` → 365 ô outside + dòng "This goal does not run in 2025." (copy trong en.json); `goal=xyz&year=abc`, `year=1800`, `year=2027`, `goal=&year=`, `goal=ALL`, `goal=g1&goal=g2`, `goal=<script>&year=-1`, `year=2026.5`, `year=02026`, `goal=__proto__` → mặc định, 0 pageerror/console error |
| M4-AC8 bấm ô mở Day | PASS | Click và Enter/Space ô 2026-10-05 → `#/day/2026-10-05`; ô 2026-10-10 (tương lai) và ô outside: click/Enter/Space không điều hướng, `aria-disabled=true`; Back về Review giữ goal/năm |
| M4-AC9 hiệu năng, bundle | PASS | Entry 218,79 kB gzip (Vite) / 216,27 (zlib -9) ≤ 250; Recharts trong chunk riêng 101,7 kB. QC E2E (service worker bị chặn để thấy mọi request của trang): Today, Goals, Goal detail, Day, Settings → 0 request `BarChart-`/`Review-`; vào Review → đúng 1 request `BarChart-`. `large-backup.json` (5 goal, 5.449 entry): Today → Review heatmap + stat hiện sau **156, 191, 154, 148 ms** (lần chạy khác 133, 157, 148, 132), nạp lại thẳng `#/review` 212–292 ms (< 1.500); số liệu năm 2023–2026, tiến độ goal tổng, chip streak 73 khớp tính độc lập từ file; benchmark của dev nằm trong Vitest xanh. Lưu ý: service worker precache có tải chunk chart nền (mục 9) |
| M4-AC10 không regression, a11y, responsive | PASS | Playwright 274/274 (lần 1, 3); axe 0 serious/critical trên Review (All, Read, Read 2025, Guitar) ở 360, 768, 1440 px, sáng và tối, và ở vi 360 px; `documentElement` không cuộn ngang ở 320, 360, 768, 1440 (en) và 360 (vi); `.hm-scroll` chỉ cuộn nội bộ; svg chart không vượt khỏi card; 0 request ngoài origin. Hạn chế bố cục desktop: M4-D2 (Minor) |
| M4-AC11 song ngữ | PASS | QC `vi-VN` 360 px: 8 biến thể Review (All, 5 goal, năm 2025 ngoài khoảng) quét vi 0 phát hiện, không cuộn ngang, nhãn tháng không đè nhau; `4,2 giờ`, `10,2%`, `250/2.440 phút`, `Chậm 8 giờ 50 phút`; 7 nhãn thứ bắt đầu `Thứ 2`, kết thúc `CN`/`Chủ nhật`; axe sạch; ảnh chụp kiểm tay (vi 360 px) đúng tiêu đề, chart, nhãn tháng, tóm tắt. Dev E2E `m4-i18n.spec.ts` (đổi sang English trên Review giữ URL, không reload) xanh trong lần chạy đầy đủ |

## 4. Defect

### M4-D1 — Pace của goal đã archive nhưng chưa bắt đầu bị tính là "ahead" rất lớn  [Minor]
- Bước tái hiện: import backup có goal `daily 45`, 2026-11-01 → 2026-11-30, `archived: true`, không có entry (hợp lệ theo schema; UI archive chỉ có từ M5 nên hiện chỉ tới được qua Import). Hôm nay 2026-10-09. Mở `#/review?goal=<id>&year=2026`.
- Mong đợi: như goal upcoming không archive: Pace `On pace`, `Expected 0 min by today` (ARCH §4: upcoming → pace 0).
- Thực tế: `Pace 16 h 30 min ahead`, `Expected -990 min by today` (số ngày trôi qua = -22). Goal archived đang chạy hoặc đã kết thúc thì đúng.
- Vị trí nghi ngờ: `src/domain/stats.ts` `elapsedDays()`: dựa vào `goalStatus()` trả `archived` nên nhánh `upcoming` không chạy khi `today < startDate`. Sẽ lộ rõ khi M5 thêm archive trên UI. Test QC giữ sẵn: `tests/qc/m4-r1-domain.test.ts` (`it.fails`) và `tests/qc/m4-r1.spec.ts` (`test.fail`); khi sửa xong, bỏ `.fails`/`test.fail()`.

### M4-D2 — Cột nội dung Review hẹp 640 px; heatmap ở desktop bị che sau thanh cuộn  [Minor]
- Bước tái hiện: import S1, mở `#/review` ở viewport 1440 x 900 (hoặc ≥ 1024 px).
- Mong đợi: DESIGN §3.2/S6 và mockup `06-review.html` (`<main class="wide">`): Review rộng tối đa 960 px, desktop "heatmap vừa khít không cần cuộn", chart cao 320 px. DESIGN chỉ cho phép cuộn nội bộ heatmap ở < 640 px.
- Thực tế: `main` rộng 720 px (nội dung 640 px); vùng heatmap rộng 573 px, nội dung 845 px nên tự cuộn tới tuần hiện tại và che Jan–Apr (~272 px, khoảng 17 cột); chart cao 210 px. Mockup ở 1440 px chỉ che ~28 px (đo bằng Playwright).
- Vị trí nghi ngờ: `main` của Review không có class `wide` (`src/ui/styles/app.css:156` định nghĩa `main.wide` nhưng không nơi nào dùng; xem `AppShell.tsx`). Test QC giữ sẵn: `m4-r1.spec.ts` "M4-D2" (`test.fail`).

### M4-D3 — Unit test không ổn định làm `npm run check` đỏ ngẫu nhiên  [Major]
- Bước tái hiện: từ root, `npx vitest run` lặp nhiều lần, không đổi gì. 4/17 lần đỏ, mỗi lần đúng 1 test fail.
- Mong đợi: DoD mục 1 (TASKS §0): `npm run check` exit 0, mọi lần.
- Thực tế: `src/ui/screens/Review.test.tsx:41`: expected "" to be "Review — 1% Better"; `GoalDetail.test.tsx:30`: expected "" to be "Guitar — 1% Better"; `GoalDetail.test.tsx:106`: expected "Read — 1% Better" to be "Guitar — 1% Better". Nguyên nhân: test `await findByRole(heading)` rồi đọc `document.title` ngay, trong khi `useDocumentTitle` cập nhật trong `useEffect` (`src/ui/hooks/useDocumentTitle.ts`) có thể chưa chạy. Chỉ là race của test (người dùng không thấy), nhưng gate không tin cậy; dev đã gặp một lần ở `Review.test.tsx` và chỉ nới `waitFor` của chunk chart, không đụng chỗ này.
- Vị trí nghi ngờ: cùng mẫu `expect(document.title).toBe(...)` đồng bộ ở `Review.test.tsx:41`, `GoalDetail.test.tsx:30,106`, `Day.test.tsx:32,165`, `Goals.test.tsx:138`, `NotFound.test.tsx:25`, `Settings.test.tsx:53`, `Today.test.tsx:30,164`. Số test tăng ở M4 làm xác suất lộ ra tăng.

### M4-D4 — Thiếu khoảng trắng trước "Whole goal" ở thẻ Time logged  [Minor]
- Bước tái hiện: Review, chọn một goal (en, 360 hoặc 768 px).
- Mong đợi: `In 2026 · Whole goal: 4.0 h` (mockup dùng khoảng trắng hai bên dấu chấm giữa).
- Thực tế: `In 2026 ·Whole goal: 4.0 h` (khoảng trắng đầu của `content` bị gộp).
- Vị trí nghi ngờ: `src/ui/styles/app.css:1276-1278` (`.stat .sub .stat-sep::before` với `content` bắt đầu bằng dấu cách, trên span inline).

## 5. Kiểm lại defect vòng trước
| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| M3-D1 (ký tự rác quanh why) | FIXED | `getComputedStyle(.gd-head .why, ::before/::after).content` là cặp dấu ngoặc kép cong; `src/ui/styles/app.css` chỉ gồm byte ASCII |
| M3-D2 (thiếu dấu phân cách hàng nghìn) | FIXED | Import 1.400 entry: dialog D3 và toast đều `1,400` (en). Dev có unit test vi `16.000 lần ghi` |
| M3-D3, M3-D4, M3-P1 | giữ nguyên Minor (không thuộc M4) | test QC M3 liên quan vẫn xanh |
| Dispute | không có | handoff mục 9: "Không có" |

## 6. Regression
- M1–M3: toàn bộ spec dev + QC xanh (274/274 ở lần 1 và 3). Lần 2 có 1 fail ở `tests/qc/m2-notify.spec.ts:175` (`shownNotifications()` đọc `registration.getNotifications()` rỗng khi máy đang tải nặng); đây là flake đã biết của test QC M2 (ghi trong comment helper `trackNotifications`), không liên quan M4; lần chạy lại xanh. Vòng sau QC sẽ đổi test đó sang `recordedNotifications`.
- Smoke luồng chính sau M4: import, Today (chip streak), ghi phút, Goals, Goal detail, Day (từ ô heatmap), Settings: xanh.

## 7. Bảo mật
- Tên goal độc hại (`<img onerror>`, `"><script>`, câu SQL `DROP TABLE`, tên 60 ký tự) hiển thị là văn bản trong select Goal, `aria-label` của lưới, tooltip, bảng ẩn; 0 `img`/`script` trong `main`, `window.__pwned` undefined, 0 JS dialog, 0 lỗi console.
- 0 request ngoài origin ở mọi luồng Review; không `fetch`/XHR/`innerHTML` trong code M4. Tham số URL xấu không gây lỗi (AC7). `npm audit`: 0 lỗ hổng. Không secret/`.env` trong repo.

## 8. Chưa kiểm chứng được (NOT VERIFIED)
- Firefox, Safari, iOS: chỉ chạy Chromium. Tự kiểm: `npm run build && npm run preview` rồi mở trên thiết bị, import `e2e/fixtures/sample-backup.json`, vào Review: cuộn ngang heatmap bằng tay trên cảm ứng, chạm ô (tooltip), mở Day.
- Screen reader thật (NVDA/VoiceOver): chỉ kiểm cây a11y gián tiếp (role grid/gridcell, `aria-label`, bảng ẩn, axe). Tự kiểm: Tab vào heatmap, dùng mũi tên và nghe tên ô; đọc bảng ẩn dưới biểu đồ.
- Độ chính xác bản dịch tiếng Việt (người bản ngữ): chỉ kiểm nguyên văn từ `vi.json`, quét rò rỉ và bố cục.

## 9. Đề xuất (không chặn)
- Service worker precache tải `BarChart-*.js` (~101 kB gzip) và `Review-*.js` ngay sau khi cài SW dù người dùng chưa vào Review (kiểm bằng sự kiện request của context và `request.serviceWorker()`); trang không request chúng nên AC9 đạt, nhưng NFR-03 "thư viện biểu đồ chỉ tải khi vào Review" cần planner/user xác nhận có chấp nhận đánh đổi offline này không.
- DESIGN "Cột biểu đồ có nhãn giá trị khi đủ chỗ" chưa có; tooltip cột chỉ khi hover, SVG ẩn khỏi AT (dữ liệu có ở bảng ẩn).
- Sửa mẫu `document.title` đồng bộ trong mọi test bằng `waitFor` thay vì chỉnh từng timeout (M4-D3).
- Ở 360 px với một goal, thẻ Progress đứng riêng một hàng (do thẻ Pace chiếm cả hàng): đúng thiết kế/mockup nhưng để một ô trống.
