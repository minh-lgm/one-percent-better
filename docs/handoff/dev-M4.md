# Dev handoff — M4 Review: heatmap năm, streak, thống kê, biểu đồ tuần/tháng

Ngày: 2026-10-10. Developer build theo `docs/plan/TASKS.md` M4 (T1…T7, AC1…AC11), `ARCHITECTURE.md` v1.3 (§2 recharts 3.10.1 lazy-load, §4 quy tắc streak/progress/pace/heatmap, §5.1 route `#/review`, §5.3 `StatsService`, §5.8 formatter, ADR-07, ADR-10), `DESIGN.md` §3.4, §4 S6, §5 (StatCard, Heatmap, BarChart, Select, ErrorState), §6 token `--heat-0..4`, §7 (`nav.review`, `common.retry`, `format.hours`, `today.streak`, `errors.loadView*`, `empty.review*`, `heatmap.*`, `chart.bar.*`, `stat.*`, `review.*`), §8 (grid/gridcell, bàn phím, tooltip, bảng ẩn), mockup `06-review.html` (oracle số liệu S1). Backlog M3-D1, M3-D2 sửa kèm.

## 1. Tóm tắt

- **Domain** `src/domain/stats.ts` (tổng phút theo ngày, ngày đạt, streak hiện tại/dài nhất theo goal và tổng, `goalStats`/`overallStats`, series 12 tuần ISO và 12 tháng) và `src/domain/heatmap.ts` (lưới 53 cột × 7 hàng Thứ Hai → Chủ nhật, mức 0–4 theo goal hoặc "All goals", trạng thái `logged`/`none`/`future`/`outside`, nhãn tháng, ô focus ban đầu). Hot path dùng số ngày nguyên (`dayNumber`/`isoFromDayNumber`/`weekdayIndex` thêm vào `dates.ts`) thay vì parse chuỗi, để đạt NFR-03.
- **`StatsService`** (`src/services/stats-service.ts`): `goalStats(goalId, year, today)`, `overallStats(year, today)`, `load()`, `watch()` (gộp `goals.watchAll()` + `entries.watchByDateRange(minStart, maxEnd)` — khoảng tính từ goal, không dùng ngày sentinel), helper tĩnh `currentStreak`/`allGoalStats` cho UI. Nối trong `container.ts`.
- **Màn Review** `#/review?goal=<id|all>&year=<YYYY>` (route `lazy` trong `router.tsx`, `errorElement` = `ViewError`): Select Goal (All goals + từng goal, hậu tố archived) / Year (từ năm sớm nhất có goal/entry tới năm hiện tại; năm trong URL hợp lệ được thêm vào danh sách), đồng bộ URL bằng `replace`; tham số sai → All goals + năm hiện tại, không lỗi. 4 stat card (All) / 6 (một goal: + Progress có progressbar, Pace dạng chữ chiếm cả hàng < 640 px). Heatmap tự vẽ (CSS grid, `role="grid"` + `role="row"` + `role="gridcell"`, `aria-rowcount=7`, một tab-stop roving, mũi tên/Home/End/Enter/Space, tooltip `role="tooltip"` khi hover/focus, ô ngoài năm là `span aria-hidden`, cuộn tới tuần hiện tại trên mobile, legend + ghi chú). Tóm tắt heatmap / `empty.reviewYear` / `review.outsideYear`. Hai `BarChart` Recharts **lazy** (`React.lazy` + `Suspense` + boundary lỗi chunk → ErrorState `Retry`), trục/tooltip định dạng bằng `useFormat`, `accessibilityLayer={false}` + container `aria-hidden`, `figcaption` = tóm tắt, bảng `.sr-only` có `caption`.
- **Today**: chip `{{n}}-day streak` (streak tổng) ở `page-head`, ẩn khi 0, cập nhật live. **TabBar**: thêm tab Review (icon mới).
- **Song ngữ**: 58 key mới `en`/`vi` nguyên văn DESIGN §7 (không thiếu bản `vi` nào, không tự dịch). Formatter thêm `hours`, `dateMonthDay`, `monthLong`, `monthYear`, `count` (xem Deviations). Quét vi component + E2E `vi-VN` 360 px: 0 phát hiện.
- **Hiệu năng/bundle** (số thật, mục 5): output `npm run build`: entry `index-*.js` **218,8 kB gzip** (M3 báo 214,9 theo cách đo zlib −9; cùng cách đo đó M4 là 211,2 — xem mục 5; giới hạn 250), `Review-*.js` 4,7 kB, `BarChart-*.js` (Recharts + d3) **101,7 kB gzip** chỉ tải khi Review hiện biểu đồ; benchmark 5 goal × 3 năm (5 449 entry): service với repository in-memory **4,5 ms**, với Dexie + fake-indexeddb 60,4 ms, model Review thuần (stats + heatmap All + 5 goal + 2 series) **8,0 ms**; E2E với `large-backup.json`: heatmap hiện sau **138–168 ms** (< 1 500).
- **Backlog fixed**: M3-D1 (ngoặc kép quanh why ở Goal detail: `app.css` dùng `"\201C"`/`"\201D"`, file giờ là ASCII thuần), M3-D2 (số ≥ 1000 trong D3 và toast import có dấu phân cách hàng nghìn qua `Formatters.count`).
- Kết quả lần chạy cuối: lint 0/0, typecheck 0, Vitest **483/483** (60 file), build OK, Playwright **250/250** (dev M1–M4 + QC M1–M3).

## 2. Task

| ID | Trạng thái | Ghi chú |
| :- | :- | :- |
| M4-T1 | DONE | `src/domain/stats.ts` + `stats.test.ts` (S1: streak G1 8/8, G2 2/10, tổng 8/10; +30 phút hôm nay → 9; 2026-10-10 → 0; ranh giới năm 2026→2027, năm nhuận 2028-02-29; tổng/progress/pace G1–G5; series tuần/tháng). `dates.ts` + test: `dayNumber`, `isoFromDayNumber`, `weekdayIndex` |
| M4-T2 | DONE | `src/domain/heatmap.ts` + `heatmap.test.ts` (2026: 365 ô, 53 cột, 01-01 hàng Thứ Năm, 12-31 hàng Thứ Năm cột 52; 2028: 366 ô, 01-01 hàng Thứ Bảy, có 02-29; mức theo goal và All; S1 09-15→1, 10-07→2, 03-02→3; `outside`, `future`) |
| M4-T3 | DONE | `src/services/stats-service.ts` + `stats-service.test.ts` (S1, `watch()` live + đổi khoảng, benchmark 3 kiểu), `scripts/gen-large-backup.mjs` → `e2e/fixtures/large-backup.json` (5 goal, 5 449 entry, 2023-10-10 → 2026-10-09, 0,88 MB), script `npm run fixtures:large` |
| M4-T4 | DONE | `src/ui/components/Heatmap.tsx` + `Heatmap.test.tsx` (grid/gridcell, accessible name, 1 tab-stop, mũi tên/Home/End/Enter/Space, click, tooltip, ô tương lai/outside `aria-disabled`, nhãn thứ/tháng en + vi) |
| M4-T5 | DONE | `src/ui/screens/Review.tsx` + `Review.test.tsx`, `ViewError.tsx`, `components/StatCard.tsx`, `Select.tsx`, `BarChart.tsx` (Recharts lazy), `ErrorState.tsx`, `router.tsx` (route lazy + errorElement), `AppShell.tsx` (tab), `Icon.tsx` (`review`), `app.css` |
| M4-T6 | DONE | `e2e/m4-review.spec.ts` (5 test: AC5/6/7, AC7 năm/param sai, AC8, AC9 chunk + AC10 360/1440, AC9 perf large), `e2e/m4-i18n.spec.ts` (2 test `vi-VN`). Số đo ở mục 5/6 |
| M4-T7 | DONE | `en.json`/`vi.json` (+58 key), `format.ts` (+`hours`, `dateMonthDay`, `monthLong`, `monthYear`, `count`) + test, `Today.tsx` chip + `Today.streak.test.tsx`, quét vi trong `Heatmap.test.tsx`, `Review.test.tsx`, `Today.streak.test.tsx`, E2E `m4-i18n.spec.ts` |
| Backlog M3-D1 | DONE | `src/ui/styles/app.css` `.gd-head .why::before/::after` → `"\201C"` / `"\201D"` |
| Backlog M3-D2 | DONE | `Formatters.count(key, n)` (`format.ts`), dùng trong `Settings.tsx` (D3 body + toast import); unit test `16,000 entries` / `16.000 lần ghi` |

## 3. File chính đã thêm/sửa

- Domain: **mới** `src/domain/stats.ts`, `heatmap.ts` (+ test); sửa `dates.ts` (+ test).
- Services: **mới** `src/services/stats-service.ts` (+ test, benchmark).
- App: `container.ts` (`statsService`), `router.tsx` (route `review` lazy, `errorElement`).
- UI: **mới** `screens/Review.tsx`, `ViewError.tsx`, `components/Heatmap.tsx`, `StatCard.tsx`, `BarChart.tsx`, `Select.tsx`, `ErrorState.tsx`; sửa `AppShell.tsx`, `Icon.tsx`, `Today.tsx`, `Settings.tsx` (M3-D2), `styles/app.css` (Review/heatmap/chart + M3-D1).
- i18n: `format.ts` (+ test), `resources/en.json`, `vi.json`.
- Test: `Heatmap.test.tsx`, `Review.test.tsx`, `Today.streak.test.tsx`, `stats.test.ts`, `heatmap.test.ts`, `stats-service.test.ts`, `dates.test.ts`, `format.test.ts`.
- E2E: `e2e/m4-review.spec.ts`, `e2e/m4-i18n.spec.ts`, `e2e/fixtures/large-backup.json`, `scripts/gen-large-backup.mjs`.
- Config/docs: `package.json` (+ `recharts` 3.10.1, `react-is` 19.3.0 pin exact; script `fixtures:large`), `package-lock.json`, `README.md` (mục Review, bundle/benchmark, fixture, layout). `.env.example` không đổi (không có biến mới).

## 4. Cách chạy

```bash
npm ci
npm run e2e:install            # Chromium vào node_modules (PLAYWRIGHT_BROWSERS_PATH=0)
npm run dev                    # http://localhost:5173
npm run build && npm run preview   # http://localhost:4173 (PWA)
```

Dữ liệu mẫu: Settings → Import backup… → `e2e/fixtures/sample-backup.json` (S1) hoặc `e2e/fixtures/large-backup.json` (NFR-03) → Replace all data → tab **Review**.

## 5. Cách test

Lệnh đã chạy tại `D:\minh\Coderschool\GitHub\one-percent-better` (2026-10-10), kết quả thật:

| Lệnh | Kết quả |
| :- | :- |
| `npm run lint` | exit 0, 0 lỗi, 0 warning |
| `npm run typecheck` | exit 0 |
| `npm test` | 60 file, **483 passed / 0 failed** (M4 thêm 71 test). Lần chạy đầu của suite đầy đủ có 1 fail nhịp (`Review.test.tsx` All goals: chờ chunk chart quá 1 s khi 60 file chạy song song) → đã nới `waitFor` lên 8 s cho các bước chờ chunk/dữ liệu; 2 lần chạy đầy đủ sau đó 483/483 |
| `npm run build` | exit 0. Output Vite (gzip mặc định của Vite): `index-*.js` 714,96 kB raw / **218,79 kB gzip** (entry trong `index.html`, ≤ 250), `Review-*.js` 12,74 kB / 4,66 kB gzip, `BarChart-*.js` 350,66 kB / **101,70 kB gzip** (chứa Recharts; chỉ import động từ Review, không có import tĩnh nào từ entry tới chunk này), CSS 5,48 kB gzip, `dist/sw.js` precache 17 entry. Đo lại bằng Node `zlib.gzipSync(level 9)` (cách M3 dùng để báo 214,9): index 211,2 / BarChart 98,2 / Review 4,5 kB. Vite cảnh báo chunk > 500 kB raw cho index (có từ M3) |
| `npm run check` | exit 0 (lint + typecheck + test + build) |
| `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test` | **250 passed / 0 failed** (1,1 phút): dev M1–M3 45 + dev M4 **7** + QC M1–M3 198 |
| Benchmark (`npx vitest run src/services/stats-service.test.ts --reporter=verbose`, chạy riêng) | `[bench] service overallStats + 5×goalStats (in-memory repos): median 4.5 ms` (6.8 / 6.3 / 4.5 / 4.3 / 3.3); `(fake-indexeddb): median 60.4 ms` (67.2 / 60.6 / 57.3 / 59.6 / 60.4); `pure review model (all + 5 goals): median 8.0 ms` (9.1 / 8.0 / 9.9 / 7.0 / 7.4) |
| E2E perf (`m4-review.spec.ts` "M4-AC9: with large-backup.json") | `[perf] Review heatmap visible after 138 ms` (lần 1) / `168 ms` (lần 2); đổi goal + năm 159–199 ms |

## 6. Tự kiểm AC

| AC | Kết quả | Bằng chứng (test / lệnh) |
| :- | :- | :- |
| M4-AC1 | PASS | `heatmap.test.ts` "2026: 365 cells, 53 columns, Jan 1 Thursday row, Dec 31 Thursday row of the last column" (col 52, row 3), "2028 (leap): 366 cells, Jan 1 Saturday row, has Feb 29" |
| M4-AC2 | PASS | `heatmap.test.ts` "one goal with dailyTarget 30" `[0,10,14,15,29,30,59,60] → [0,1,1,2,2,3,3,4]`, "all goals by total minutes" `[0,1,29,30,59,60,119,120] → [0,1,1,2,2,3,3,4]`, S1 All 09-15→1 (10), 10-07→2 (50), 03-02→3 (60), ngoài khoảng → `outside`. E2E "M4-AC5/AC6/AC7" kiểm class `l1/l2/l3` trên trang |
| M4-AC3 | PASS | `Heatmap.test.tsx`: ô 2026-10-07 accessible name `Wednesday, October 7, 2026: 50 min, target met`; Tab → ô hôm nay (1 tab-stop), ←/→ tuần, ↑/↓ ngày (qua ranh giới cột Chủ nhật → Thứ Hai), Home/End, Enter/Space. E2E "M4-AC8" lặp lại bằng bàn phím thật |
| M4-AC4 | PASS | `stats.test.ts` "S1 at 2026-10-09": G1 8/8, G2 2/10, tổng 8/10; +30 phút G1 hôm nay → G1 9, tổng 9; 2026-10-10 không có 10-09 → G1 0 (dài nhất 8). `stats-service.test.ts` cùng số qua service. Thêm: ranh giới năm, 2028-02-29 |
| M4-AC5 | PASS | `stats.test.ts` + `stats-service.test.ts`: G1 240 (4.0 h), 930, 25.8, −30; G2 250, 10.2, −530; G3 60, 1.0, −4734; G4 0. `Review.test.tsx` "selecting Read…": `4.0 h`, `Whole goal: 4.0 h`, `25.8%`, `240 of 930 min`, `30 min behind`, `Expected 270 min by today`; G2 `8 h 50 min behind`, G3 `1.0%` / `78 h 54 min behind`, G4 `On pace`. E2E "M4-AC5/AC6/AC7" cùng số trên bản build |
| M4-AC6 | PASS | `stats.test.ts`: tuần ISO từ 2026-10-05 = 160, 12 phần tử, phần tử cuối `current`; 12 tháng `[0,0,60,0,0,15,0,0,210,280,0,0]`. `Review.test.tsx`: 2 bảng ẩn 12 hàng, Recharts vẽ ≥ 4 cột tháng; E2E: 2 `svg.recharts-surface`, 12 hàng mỗi bảng, tóm tắt `2026: 9 h 25 min logged, busiest month October with 4 h 40 min.` |
| M4-AC7 | PASS | E2E "M4-AC5/AC6/AC7": chọn Read → `#/review?goal=g1&year=2026`, stat đổi; reload giữ lựa chọn. E2E "M4-AC7": `?goal=g1&year=2025` → 365 ô `.out`, `This goal doesn't run in 2025.`; `?goal=xyz&year=abc` và `?year=1800` → All goals/2026, 0 `pageerror`. Component "year 2025 for Read…" |
| M4-AC8 | PASS | E2E "M4-AC8": click ô 10-05 → `#/day/2026-10-05`; Tab → ô hôm nay, ↑×4 → 10-05, Enter → Day; ô 10-10 click (force) + Enter/Space → vẫn `#/review`. Component "clicking a past cell navigates…" |
| M4-AC9 | PASS | Benchmark mục 5 (median 4,5 ms in-memory / 8,0 ms model thuần, assert < 200; Dexie 60,4 ms ghi nhận). E2E perf 138–168 ms < 1 500. Build: entry 218,8 kB gzip (Vite) / 211,2 (zlib −9) ≤ 250; E2E "M4-AC9/AC10": sau Today + Goals không có request `Review-*.js`/`BarChart-*.js`, vào Review mới có cả hai |
| M4-AC10 | PASS | Playwright đầy đủ 250/250 (gồm spec M1–M3 dev + QC). axe Review All goals, Read (en, 360 và 1440), vi: 0 serious/critical. 360 px và 1440 px: `scrollWidth <= clientWidth` (All + Read); `.heatmap-scroll` cuộn riêng và đã cuộn tới ô hôm nay. 0 request ngoài origin trong luồng Review |
| M4-AC11 | PASS | `Heatmap.test.tsx` (vi): ô 10-07 All = `heatmap.cell.all` với `Intl vi-VN` có năm + `50 phút` + `đã đạt chỉ tiêu`; 12 nhãn tháng = `monthShort` vi-VN; 7 nhãn thứ = `weekdayShort` vi-VN từ Thứ Hai. `Review.test.tsx` (vi): `4,0 giờ`, `25,8%`, `Chậm 30 phút`, `8 ngày`; bảng ẩn/tóm tắt/`caption`/tooltip vi; quét vi All goals, một goal, chưa có goal, năm ngoài khoảng, ErrorState → 0. `Today.streak.test.tsx` vi `Chuỗi 8 ngày` + quét vi. E2E `m4-i18n.spec.ts` (`vi-VN`, 360×740): Today chip, Review All/Read, focus ô → tooltip hiện → quét vi 0, hover cột → tooltip `4 giờ`, năm ngoài khoảng, năm rỗng, axe 0, không cuộn ngang; đổi English ở Settings rồi Back → URL `?goal=g1&year=2026` giữ nguyên, mọi nhãn/stat/biểu đồ English, `window.__noReload` còn (không reload). Bundle entry 218,8 kB gzip (Vite) đã gồm i18n + 2 file dịch |

## 7. Deviations so với plan/design

1. **Đổi ngôn ngữ "ngay trên Review"** (M4-AC11): LanguageSwitcher chỉ có ở Settings và app không theo dõi kv `locale` từ tab khác (ngoài phạm vi M4), nên E2E kiểm bằng: Review (`?goal=g1&year=2026`) → Settings chọn English → `page.goBack()` → URL giữ nguyên, nội dung đổi ngay, không reload. Hành vi app không đổi so với M1.
2. **Formatter thêm ngoài bảng ARCH §5.8**: `hours(minutes)` (`format.hours`), `dateMonthDay` (DESIGN §7.1 "ngày ngắn không năm"), `monthLong`/`monthYear` (tên tháng cho tóm tắt/tooltip/bảng tháng — DESIGN §7.1 chỉ có `monthShort` cho trục), `count(key, n)` (M3-D2). `count` chọn dạng số nhiều bằng `Intl.PluralRules` và truyền qua `context` của i18next (`_one`/`_other`), vì `{{count}}` của i18next in số thô; copy JSON không đổi.
3. **Ô tương lai ưu tiên hơn `outside`** (một goal, ngày sau `endDate` nhưng > hôm nay → `future`), giống `info()` trong mockup 06. Vì vậy Read 2026 có 273 ô outside + 83 ô future.
4. **Năm trong URL ngoài danh sách** (vd. `year=2025` với S1 chỉ có 2026) được chấp nhận nếu là 4 chữ số trong 1970…năm hiện tại và được thêm vào Select (AC7 yêu cầu xem được 2025 cho Read); năm > hiện tại hoặc không hợp lệ → năm hiện tại.
5. **Retry = reload trang** cho ErrorState chunk lỗi (route lazy và chunk BarChart): trình duyệt cache kết quả import() thất bại nên "thử lại" trong trang không đáng tin; ErrorState do dữ liệu lỗi (repository ném) thì re-subscribe không reload.
6. **Benchmark**: assert `< 200 ms` trên `StatsService` với repository in-memory và trên model thuần (đúng phạm vi "tính thống kê" của NFR-03); số với Dexie + fake-indexeddb (structured clone ≈ 11 000 dòng, không đại diện cho IndexedDB thật) chỉ ghi nhận, không assert. Hai test thời gian có `retry: 2` vì Vitest chạy 60 file song song có thể làm phồng một lần đo (số chạy riêng ở mục 5 thấp hơn ngưỡng 20–40 lần).
7. `review.outsideYear` (DESIGN ghi MS = M5) được thêm ngay ở M4 vì trạng thái "năm ngoài khoảng goal" đã có trong AC7/AC11.
8. Nhãn thứ: render đủ 7 (`Mon…Sun`) nhưng chỉ Mon/Wed/Fri hiển thị (các nhãn khác `visibility: hidden` để giữ hàng), như mockup; tất cả `aria-hidden` (ô đã có tên đầy đủ).
9. `Heatmap` dùng hàng thật (`display: grid` mỗi `role="row"`) thay vì `display: contents` như mockup, để tránh vấn đề a11y tree của `display: contents`.
10. Recharts: `accessibilityLayer={false}` (mặc định `true` làm SVG focusable trong vùng `aria-hidden` → axe serious), `isAnimationActive={false}`, không dùng `ResponsiveContainer` (đo chiều rộng bằng `ResizeObserver`, fallback 320 px trong jsdom).
11. `react-is` 19.3.0 pin trực tiếp (peer của Recharts; npm tự kéo 17.0.2 qua `pretty-format`).

## 8. Known issues và giới hạn

- Today và Review mỗi màn mở một `statsService.watch()` (goals + mọi entry trong khoảng goal); với 5 449 entry, mỗi lần ghi entry sẽ tính lại streak (≈ vài ms). Nếu dữ liệu lớn hơn nhiều, memo theo (goalId, year) như ADR-07 gợi ý.
- Không có live update ngôn ngữ giữa các tab (từ M1); đổi ngôn ngữ ở tab khác chỉ áp dụng sau reload.
- Tooltip heatmap định vị `position: fixed` theo `getBoundingClientRect`; khi cuộn ngang trong `.hm-scroll` tooltip ẩn/hiện theo hover/focus nên không bị lệch, nhưng không tự dời khi cuộn bằng bàn phím trong lúc đang hover.
- Chromium ICU in `Thứ 2` cho `weekdayShort` vi-VN (Node in `Th 2`): nhãn thứ rộng hơn dự kiến ở DESIGN §3.4 nhưng cột nhãn `min-width: 28px; width: auto` nên không tràn (E2E 360 px không cuộn ngang).
- Test benchmark phụ thuộc máy; trên máy dev số đo cách ngưỡng rất xa.
- Kiểm thủ công chưa làm: Review trên Firefox/Safari/iOS thật (cuộn ngang bằng tay trên cảm ứng, tooltip khi chạm). Chromium 360 px đạt.

## 9. Dispute (nếu có)

- Không có. Không sửa `tests/qc/`.

## Assumptions

- A-M4-1: Chip streak ở Today hiện khi streak tổng ≥ 1 (ẩn khi 0), tính cả khi không có goal active.
- A-M4-2: "Busiest week/month" khi hoà chọn tuần/tháng sớm hơn.
- A-M4-3: Năm trong Select giảm dần (năm hiện tại trước), như mockup.
- A-M4-4: Entry sau hôm nay (chỉ có thể do import file sửa tay, M3-D3) bị bỏ qua trong series tuần/tháng; trong heatmap ngày đó là `future` nên cũng không hiện.

## Open questions

- Không có câu hỏi chặn. DESIGN §7 có đủ bản `vi` cho mọi chuỗi M4.

## Fix log

### Round 1 — theo report-M4-r1.md

| Defect | Nguyên nhân gốc | Cách sửa | Regression test |
| :- | :- | :- | :- |
| M4-D3 (Major) — `npm run check` đỏ ngẫu nhiên vì `document.title` | 10 chỗ trong 7 file test đọc `document.title` đồng bộ ngay sau `findByRole(heading)`, trong khi `useDocumentTitle` ghi title trong `useEffect` (chạy sau commit, có thể sau assertion khi máy tải nặng) | Đổi **mọi** chỗ cùng mẫu sang `await waitFor(() => expect(document.title).toBe(...))`: `Review.test.tsx`, `GoalDetail.test.tsx` (2), `Day.test.tsx` (2), `Goals.test.tsx`, `NotFound.test.tsx`, `Settings.test.tsx`, `Today.test.tsx` (2); thêm import `waitFor` ở file thiếu. `rg "expect\(document\.title\)" src` → 0 chỗ đồng bộ còn lại | Lặp `npx vitest run` **15 lần liên tiếp** (log trong scratchpad): 15/15 lần cùng kết quả `568 passed / 1 failed`, fail duy nhất mỗi lần là test QC `tests/qc/m4-r1-domain.test.ts` `it.fails` M4-D1 nay "passed unexpectedly" (xem dưới). Không còn fail nào về `document.title` |
| M4-D1 (Minor) — goal archived chưa bắt đầu có `elapsedDays` âm | `elapsedDays()` dựa vào `goalStatus()`; với goal archived hàm này trả `archived` trước `upcoming`, nên nhánh "chưa bắt đầu" không chạy và `daysInclusive(start, today)` âm | `src/domain/stats.ts` `elapsedDays`: `if (today < goal.startDate) return 0` (không phụ thuộc trạng thái archived); goal archived đang chạy/đã kết thúc giữ nguyên | `src/domain/stats.test.ts` "M4-D1: an archived goal that has not started has 0 elapsed days and pace 0" (elapsed 0, expected 0, pace 0 = goal upcoming; archived đang chạy 9 ngày, archived đã kết thúc 181 ngày). **QC cần gỡ** `it.fails` ở `tests/qc/m4-r1-domain.test.ts:235` và `test.fail()` ở `tests/qc/m4-r1.spec.ts:475` — hiện hai test này báo "Expect test to fail" / "Expected to fail, but passed" |
| M4-D2 (Minor) — `main` của Review thiếu class `wide` | `AppShell` render một `<main>` chung, chưa gắn `wide` cho route Review | `AppShell.tsx`: `useLocation()` → `className="wide"` khi pathname bắt đầu bằng `/review`. Thêm `app.css`: `@media (min-width: 1024px) main.wide { padding-left/right: 24px }` (960 − 48 − card 32 − cột nhãn thứ 34 = 846 ≥ 845 px của 53 cột 13 px + 52 khoảng 3 px) để heatmap vừa khít không cuộn ở desktop (mockup 06 vẫn che ≈ 28 px vì padding 40) | `e2e/m4-review.spec.ts` "M4-AC9/AC10": ở 1440×900 `main` có class `wide`, rộng ≥ 940 px, `heatmap-scroll.scrollWidth − clientWidth ≤ 2` (đo thật: 0), Today không có `wide`. **QC cần gỡ** `test.fail()` ở `tests/qc/m4-r1.spec.ts:363` (hiện "Expected to fail, but passed") |
| M4-D4 (Minor) — thiếu dấu cách trước "Whole goal" | Dấu `·` sinh bằng `::before { content: " \00B7 " }` trên span inline: khoảng trắng đầu của `content` bị gộp với khoảng trắng trước đó | Bỏ pseudo-element; `Review.tsx` render text thật `{' \u00B7 '}` giữa hai span (không chữ cái nên không vi phạm lint hardcode) | `Review.test.tsx` và `e2e/m4-review.spec.ts`: `toHaveTextContent('In 2026 · Whole goal: 4.0 h')` |

Kết quả sau fix (2026-10-10, project root): lint 0/0; typecheck 0; `npm run check` **exit 1 chỉ vì** test QC `it.fails` M4-D1 nay pass (Vitest 568/569, 61 file; lint/typecheck/build trong chuỗi đều exit 0, build không đổi kích thước bundle); Vitest lặp 15/15 lần ổn định như trên; Playwright đầy đủ **273 passed / 1 failed** — fail duy nhất là `tests/qc/m4-r1.spec.ts:362` (M4-D2, `test.fail()` nay pass). Một lần chạy đầy đủ trước đó có thêm 1 flake tải nặng ở `tests/qc/m3-r1.spec.ts:435` (D3 Escape/Cancel; chạy riêng và lần đầy đủ sau đó xanh) và 1 fail thật do comment CSS mới có ký tự ngoài ASCII (test QC smoke M3-D1 kiểm `app.css` thuần ASCII) — đã sửa comment, `app.css` lại 0 byte ≥ 0x80. Không sửa file nào trong `tests/qc/`.
