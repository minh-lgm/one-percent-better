# QC report — M4 round 2

**Verdict:** PASS
**Ngày:** 2026-10-10  **Commit:** 1405694 (fix ở be017d2; working tree: QC đổi `tests/qc/m2-notify.spec.ts`, `tests/qc/m4-r1-domain.test.ts`, `tests/qc/m4-r1.spec.ts`, thêm `tests/qc/m4-r2.spec.ts` và report này)

## 1. Tóm tắt
- M4-D1, D2, D3, D4: **FIXED**, không REGRESSED. D3 (Major, chặn ở vòng 1): `npx vitest run` tuần tự 15/15 lần xanh (569/569), `npm run check` 4/4 lần exit 0; mọi assertion `document.title` trong `src` đều bọc `waitFor` (rg).
- Playwright đầy đủ (dev + QC M1–M4, nay 281 test): 2 lần xanh 281/281, 1 lần có 1 flake `tests/qc/m1-qc-flows.spec.ts:152` (click treo 60 s, chạy riêng x10 xanh 10/10; flake hạ tầng, không liên quan M4). Hai lần chạy đầu (trước khi sửa test QC) còn 1 fail do chính test QC M4-D2 của tôi (mục 6), đã sửa.
- M4-AC1…AC11 vẫn PASS. Defect mới: chỉ **M4-D5 (Minor)**: biên thời gian 5 s của vài test nặng mỏng khi máy tải; không chặn.
- NOT VERIFIED giữ nguyên như vòng 1 (Firefox/Safari/iOS, cuộn cảm ứng, screen reader, bản dịch vi bởi người bản ngữ).

## 2. Môi trường và lệnh đã chạy
Windows 11, Node v22.14.0, npm 10.9.2, Chromium Playwright, dựng theo handoff (build + preview 4173).

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Gate | `npm run check` x4 (trước và sau khi sửa test QC) | 4/4 **exit 0**: eslint `--max-warnings 0` sạch, typecheck 0, Vitest 61 file, **569 passed (569)**, build OK |
| D3 lặp tuần tự | `npx vitest run` x15 | **15/15 pass**, mỗi lần 569/569, 0 fail `document.title` |
| D3 áp lực (thêm) | `npx vitest run` chạy song song 2 tiến trình x3 đợt; 3 tiến trình x4 đợt | 2 song song: 2/6 xanh, 4/6 có đúng 1 test hết 5000 ms; 3 song song: 0/12 xanh (1–6 test hết 5000 ms). **0 fail về `document.title`**; xem M4-D5 |
| Quét `document.title` | `rg "document.title" src` | 10 assertion (Day 2, GoalDetail 2, Goals, NotFound, Review, Settings, Today 2) đều `await waitFor(() => expect(document.title)...)`; 2 chỗ còn lại là `i18n-scan.test.ts` (gán, không assert) |
| E2E | `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test` | Lần 1, 2 (trước khi sửa test QC): 273 pass + 1 fail test M4-D2 của QC (race trong test, mục 6). Sau khi sửa: lần 1 **281/281**, lần 2 280 + 1 flake `m1-qc-flows.spec.ts:152` (treo click 60 s; chạy riêng `--repeat-each=10`: 10/10 xanh), lần 3 **281/281** |
| Test QC sửa lại | `playwright test tests/qc/m2-notify.spec.ts -g "synthetic notificationclick" --repeat-each=8` | 8/8 xanh (trước đây flake `getNotifications()`) |
| Test QC M4 round 2 mới | `playwright test tests/qc/m4-r2.spec.ts` | 7/7 xanh |
| Audit | `npm audit` | found 0 vulnerabilities |

## 3. Acceptance criteria
Chạy lại toàn bộ test QC M4 vòng 1 (85 unit oracle, 24 E2E) và dev E2E M4; không AC nào đổi trạng thái.

| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M4-AC1 lưới đúng lịch | PASS | `m4-r1-domain.test.ts` oracle brute force (3 mốc hôm nay x 3 seed x 3 năm gồm 2024, 2028) xanh; E2E 365/366 ô, 2028-02-29 mở `#/day/2028-02-29` xanh |
| M4-AC2 mức màu | PASS | oracle mức 0–4 từng goal và All goals xanh; S1 UI 09-15 l1, 10-07 l2, 03-02 l3 xanh |
| M4-AC3 nhãn truy cập, bàn phím | PASS | `m4-r1.spec.ts` "keyboard model, roving tab stop, tooltip, today border" xanh ở mọi lần chạy đầy đủ |
| M4-AC4 streak | PASS | oracle 72 bộ ngẫu nhiên + E2E qua ranh giới năm (9 ngày) và ngày nhuận 2028-02-29 (5 ngày) xanh |
| M4-AC5 tổng, tiến độ, pace | PASS | S1 từng goal khớp bảng oracle (Read `4.0 h`, `25.8%`, `30 min behind`, ...); sau fix D1 Marathon prep vẫn `On pace`, `Expected 0 min by today`; goal archived chưa bắt đầu nay cũng `On pace` |
| M4-AC6 biểu đồ tuần/tháng | PASS | bảng ẩn 12 hàng/bảng, giá trị khớp oracle, 2 `svg.recharts-surface` |
| M4-AC7 chọn goal/năm qua URL | PASS | URL hợp lệ/không hợp lệ (10 biến thể), reload giữ lựa chọn: xanh, 0 pageerror |
| M4-AC8 bấm ô mở Day | PASS | click/Enter/Space ô quá khứ mở Day; ô future/outside không điều hướng |
| M4-AC9 hiệu năng, bundle | PASS | QC perf `large-backup.json`: Review hiện sau 124, 157, 142, 134 ms; nạp lạnh `#/review` 261 ms; Today/Goals/Day/Settings 0 request chunk chart; 1 request `BarChart-` khi vào Review; be017d2 không đụng cấu hình build/bundle |
| M4-AC10 không regression, a11y, responsive | PASS | axe 0 serious/critical ở 360/768/1440 sáng và tối (`m4-r1.spec.ts` xanh, nay main `wide` ở 1440); không cuộn ngang trang ở 360, 768, 1024, 1100, 1200, 1280, 1440, 1920 (`m4-r2.spec.ts`) |
| M4-AC11 song ngữ | PASS | `m4-i18n.spec.ts` (dev) và QC vi 360 px xanh |

## 4. Defect
### M4-D5 — Biên thời gian của vài test nặng mỏng: chạy song song 2 tiến trình Vitest thì thường hết 5 s  [Minor]
- Bước tái hiện: từ root chạy đồng thời hai lệnh `npx vitest run` (máy 24 luồng logic; hoặc CI chia sẻ CPU).
- Mong đợi: gate `npm run check` ổn định cả khi máy hơi bận (TASKS §0 DoD mục 1).
- Thực tế: 4/6 lần có đúng 1 test báo `Test timed out in 5000ms`. Test hay dính (thời gian đo khi máy yên tĩnh): `Day.test.tsx` "M3-AC1: back-fills an entry ..." 2,7 s; `Heatmap.test.tsx` "keyboard: Tab reaches today ..." 2,0 s; `Review.test.tsx` "All goals, 2026 ..." 3,0 s và "selecting Read ..." 2,1 s; `stats-service.test.ts` benchmark Dexie 1,9 s; và (test QC) `tests/qc/m3-r1-domain.test.ts` "file just under the 5 MiB limit" 2,0 s. Chạy tuần tự 15/15 xanh nên không chặn; không còn lỗi `document.title`.
- Vị trí nghi ngờ: timeout mặc định 5 s của Vitest (cấu hình không đặt `testTimeout`). Chỉ để backlog (nâng `testTimeout` hoặc giảm việc mỗi test).

## 5. Kiểm lại defect vòng trước
| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| M4-D1 (pace goal archived chưa bắt đầu) | **FIXED** | Đã gỡ `it.fails` ở `m4-r1-domain.test.ts` và `test.fail()` ở `m4-r1.spec.ts`; cả hai xanh thật: `archived.elapsedDays = 0`, pace 0 như upcoming; UI `#/review?goal=a2` (archived, 2026-11-01..30) hiển thị `On pace` và `Expected 0 min by today`. Archived đang chạy/đã kết thúc không đổi (test cũ xanh: 181 ngày) |
| M4-D2 (cột Review hẹp, heatmap bị che) | **FIXED** | Đã gỡ `test.fail()`. `main` có class `wide` ở /review; rộng ≤ 960; ở 1200, 1280, 1440, 1920 px `scrollWidth - clientWidth` ≤ 2 (không cuộn); Today/Goals/Settings không có `wide`; quay lại Review có lại `wide`; không cuộn ngang trang ở 360–1920. Từ 1024 đến 1191 px sidebar 232 px chỉ chừa 792–959 px nên heatmap vẫn cuộn nội bộ (mục 9) |
| M4-D3 (unit test flaky `document.title`) | **FIXED** | 15/15 vitest tuần tự xanh (vòng 1: 4/17 đỏ); `npm run check` 4/4 exit 0; mọi assertion title dùng `waitFor`; test trình duyệt `toHaveTitle` cho Review và Goal detail xanh |
| M4-D4 (thiếu dấu cách trước "Whole goal") | **FIXED** | `innerText` chuẩn hoá là `In 2026 · Whole goal: 4.0 h` ở 360 và 768 px, `textContent` chứa `2026 · Whole goal` |
| M3-D3, M3-D4, M3-P1 | giữ nguyên Minor | không thuộc M4 |
| Dispute | không có | handoff vòng 1 không có mục Dispute |

## 6. Regression
- M1–M3: toàn bộ spec dev + QC xanh trong 3 lần chạy đầy đủ sau khi sửa test (281/281, 280 + 1 flake nêu ở mục 2, 281/281). Smoke luồng chính (import, Today, Goals, Goal detail, Day từ ô heatmap, Settings, Review) xanh.
- Test QC đã sửa vòng này (không phải lỗi app): (a) `tests/qc/m2-notify.spec.ts` AC9 nay đếm bằng spy `calls(page)` thay vì `getNotifications()` (8/8 xanh), và chờ `getNotifications()` có thông báo trước khi bắn `notificationclick`; (b) test M4-D2 trong `m4-r1.spec.ts` có race (đọc `heatmap-scroll` trước khi render, `null.scrollWidth`) mà `test.fail()` đã che; đã thêm chờ hiển thị và siết ngưỡng cuộn từ 60 xuống 2 px; (c) gỡ `it.fails`/`test.fail()` của D1, D2.
- Flake không thuộc M4: 1 lần `m1-qc-flows.spec.ts:152` (AC9 M1) treo ở `click` đến hết 60 s, không tái hiện (10/10 xanh riêng, hai lần chạy đầy đủ khác xanh).

## 7. Bảo mật
`npm audit`: 0 lỗ hổng. be017d2 chỉ chạm test, `stats.ts`, `AppShell.tsx`, `Review.tsx`, `app.css`: không thêm `fetch`, `innerHTML`, `dangerouslySetInnerHTML`; dấu `·` là text trong JSX. Test hostile-name vòng 1 vẫn xanh (không chèn img/script, 0 request ngoài origin). Không `.env` hay secret trong repo.

## 8. Chưa kiểm chứng được (NOT VERIFIED)
- Firefox, Safari, iOS: chỉ chạy Chromium. Tự kiểm: `npm run build && npm run preview`, mở trên thiết bị, import `e2e/fixtures/sample-backup.json`, vào Review: cuộn ngang heatmap bằng tay trên cảm ứng, chạm ô (tooltip), mở Day.
- Screen reader thật (NVDA/VoiceOver): chỉ kiểm cây a11y gián tiếp (role grid/gridcell, `aria-label`, bảng ẩn, axe). Tự kiểm: Tab vào heatmap, dùng mũi tên và nghe tên ô; đọc bảng ẩn dưới biểu đồ.
- Độ chính xác bản dịch tiếng Việt (người bản ngữ): chỉ kiểm nguyên văn từ `vi.json`, rò rỉ và bố cục.
- Focus/openWindow của notificationclick (M2): sự kiện giả lập không gọi được `WindowClient.focus()`; không thuộc M4.

## 9. Đề xuất (không chặn)
- Cho designer/planner: DESIGN §6 nói heatmap "vừa khít vùng nội dung 960 px ở ≥ 1024 px", nhưng ở 1024–1191 px sidebar 232 px chỉ chừa 792–959 px nên heatmap vẫn cuộn nội bộ (ẩn 169 px ở 1024). Khớp câu "tablet vẫn có thể cuộn"; nên chỉnh câu chữ hoặc đổi ngưỡng.
- Service worker precache tải `BarChart-*.js` ngay sau khi cài SW (vòng 1, mục 9): cần planner/user xác nhận có chấp nhận đánh đổi NFR-03 hay không.
- Biểu đồ chưa có nhãn giá trị trên cột (DESIGN); thẻ Progress đứng riêng một hàng ở 360 px khi chọn một goal.
