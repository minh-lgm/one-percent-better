# Dev handoff — M9 Đường cong "Bạn" v3: so phút với ngày có ghi trước, nhân dồn từ ngày đầu

Ngày: 2026-10-13. Build theo `docs/plan/TASKS.md` v3.0 (Phase 3, M9-T1…T5, M9-AC1…AC8, bảng "Test cũ bị thay thế", DoD), `PRD.md` v3.0 (FR-27, A-39…A-43, OQ-11 → A-39), `ARCHITECTURE.md` v3.0 (§4.5 công thức, `pct`, contract `ActualPoint`/`CurveData`/`curveYDomain`, oracle R1/S1; ADR-26), `DESIGN.md` v3.0 (S4, §7.1, §7.6.4, `empty.detail.curve`, A-D34…A-D40, OQ-D15, OQ-D17), `docs/design/mockups/07-goal-detail.html`, `docs/handoff/dev-M8.md`. Quyết định bổ sung của orchestrator đã áp dụng: OQ-D17 (đầu dưới trục Y chỉ nới khi có số âm), dấu trừ U+2212, nhãn compact `vi` theo A-D40, xoá 3 key cũ, chỉ sửa test dev theo bảng "Test cũ bị thay thế", không sửa `tests/qc/**`.

## 1. Tóm tắt

- **T1 Domain.** `src/domain/curve.ts` viết lại theo ARCH §4.5: `actual(d) = m(p(d)) / m(f)` tính bằng **tỉ số trực tiếp** hai số nguyên (không nhân dồn số thực), `pct(a, b)` làm tròn nửa xa 0 và chuẩn hoá −0, contract mới (`ActualPoint.minutes/logged/percent/changePercent`, `CurveData.loggedDays/baseline/latest/previous/latestChangePercent`; bỏ `n`, `met`, `daysOnTarget`), `curveYScale`/`curveYDomain` (miền + tick "đẹp" 1-2-5×10ⁿ, bước ≥ 1, luôn chứa 0; đầu dưới chỉ nới 5 % khi min < 0 — OQ-D17). `curve.ts` không còn import `stats.ts`. `StatsService.curve` giữ chữ ký. Builder `datasetR1()`, `datasetR3()`, `datasetR4()`, `TODAY_R1`, `FIXED_NOW_R1` trong `src/test/builders.ts`.
- **T2 Định dạng + chuỗi.** `src/i18n/format.ts`: `signed1` (`+440.0` / `−40.0` / `+143,900.0`, −0 → `+0.0`, dấu trừ U+2212 qua hằng `MINUS`), `factor` (`5.4`, `1,440`, `0.6`, `0.00069`), `axisPercent` (`0%`, `+500%`, `−50%`, `+1,000%`, compact `+144K%` / `+144 N%` khi |v| ≥ 10.000); bỏ `decimal3` (không còn dùng). `en.json`/`vi.json`: 12 key mới, 9 key sửa, 3 key bỏ (`goal.detail.headlineSub_one/_other`, `goal.detail.tooltip`) **nguyên văn DESIGN §7.6.4 / §7.4**; `rg` trong `src` → 0 tham chiếu key cũ; parity test pass.
- **T3 CurveChart v3.** Dữ liệu "You" = `ActualPoint.percent`, nét `stepAfter`, **không vẽ** khi chưa có baseline; chấm r = 3 ở ngày có ghi khi ≤ 45 điểm "You" hiển thị; `ReferenceLine y=0` (`.zero-line`, `--chart-zero` token mới = `--text-muted`); `YAxis domain/ticks` từ `curveYScale` của các điểm đang hiển thị, nhãn `f.axisPercent`, lề trái ≈ 6,6 px × số ký tự + 14 (min 44); nhãn trực tiếp có dấu với quy tắc chống đè (mặc định trên chấm, xuống dưới khi chạm đỉnh, hai chấm cách < 24 px → series cao ở trên/series thấp ở dưới — tính từ cùng hình học với Recharts: `XAxis height={30}` cố định); tooltip/đọc bằng phím 4 biến thể (`tooltipChange`/`tooltipBase`/`tooltipFlat`/`tooltipIdeal`). Thêm `data-y-min`/`data-y-max` trên wrapper để test đọc miền.
- **T4 GoalDetail v3.** Headline theo dấu (`headline` ≥ 0 màu `--primary`; `headlineDown` < 0 class `hl-down` màu `--text`, `data-sign`); phụ đề 2 dòng: `headline-day` (`subDay`, ẩn khi upcoming) + `headline-sub` với `data-variant` = `upcoming | empty | start | today | earlier` (`empty.detail.curve` giờ là dòng 2 của phụ đề, bỏ `curve-empty`); tóm tắt SR `chartSummary`/`chartSummaryEmpty`/`upcoming`; legend 3 mục (`legendZero` với swatch `.line-zero`); chú thích `curve-note`; bảng 5 cột (`Minutes`, `vs previous logged day`; ngày tương lai và trạng thái chưa có entry → `—`). Stat cards, History, nút không đổi.
- **T5 Test + tài liệu.** Fixture `e2e/fixtures/r1-real-backup.json`, `r1-first-day-backup.json`, `r3-down-backup.json`, `r4-extreme-backup.json` (schemaVersion 1); spec mới `e2e/m9-curve.spec.ts` (7 test: AC3/AC4/AC5/AC6/AC8, en + vi, 1440 và 360 px); sửa assertion đường cong trong `e2e/m5-goal-detail.spec.ts`, `e2e/m5-journey.spec.ts`, `e2e/m5-i18n.spec.ts` (ghi chú `superseded by M9-ACx`); README mục "Goal detail and the 1% curve" viết lại với ví dụ 5 → 10 → 14 → 27 = +440 %; handoff này.

## 2. Task

| ID | Trạng thái | Ghi chú |
| :- | :- | :- |
| M9-T1 | DONE | `curve.test.ts` viết lại (22 test: R1 + biến thể a–e, S1 G1–G5, biên, `pct`, R3/R4, 1827 ngày, `curveYDomain`); `stats-service.test.ts` phần curve sửa; bench 10/10 |
| M9-T2 | DONE | `format.test.ts` +3 test (`signed1`, `factor`, `axisPercent`); parity + lint hardcode pass |
| M9-T3 | DONE | `CurveChart.test.tsx` viết lại (7 test: R1, phím, S1/G2, R4 compact, không baseline/upcoming, chống đè nhãn, vi) |
| M9-T4 | DONE | `GoalDetail.curve.test.tsx` viết lại (16 test: R1 en/vi, 10-14 + ghi 3 phút, một ngày, R3, S1 bảng/G2, rỗng, upcoming, ended, archive, lỗi, quét vi) |
| M9-T5 | DONE | `e2e/m9-curve.spec.ts` 7/7; 3 spec M5 sửa; README; fixture R1/R3/R4 (+ R1 một ngày) |

## 3. File chính đã thêm/sửa

- Domain/test data: `src/domain/curve.ts`, `src/domain/curve.test.ts`, `src/test/builders.ts`, `src/services/stats-service.test.ts` (chỉ `describe('StatsService.curve …')`).
- i18n: `src/i18n/format.ts`, `src/i18n/format.test.ts`, `src/i18n/resources/en.json`, `vi.json`.
- UI: `src/ui/components/CurveChart.tsx` (+ `CurveChart.test.tsx`), `src/ui/screens/GoalDetail.tsx` (+ `GoalDetail.curve.test.tsx`), `src/ui/styles/tokens.css` (`--chart-zero`), `src/ui/styles/app.css` (`.hl.hl-down`, `.hl-day`, `.line-zero`).
- E2E: `e2e/m9-curve.spec.ts` (mới), `e2e/fixtures/r1-real-backup.json`, `r1-first-day-backup.json`, `r3-down-backup.json`, `r4-extreme-backup.json` (mới), `e2e/m5-goal-detail.spec.ts`, `e2e/m5-journey.spec.ts`, `e2e/m5-i18n.spec.ts` (chỉ assertion đường cong).
- Config: `tsconfig.app.json` — thêm `tests/qc/m5-r1-domain.test.ts` vào `exclude` (xem mục 8, lý do: file QC đọc field đã bỏ `n`/`daysOnTarget` làm `tsc -b` đỏ; Vitest vẫn chạy file đó).
- Docs: `README.md` (mục "Goal detail and the 1% curve", dòng "Current milestone"), `docs/handoff/dev-M9.md`.

## 4. Cách chạy

```bash
npm ci
npm run e2e:install
# Demo M9 với dữ liệu thật của user (R1) — bản phase 1, không cần cloud
npm run build:e2e && npm run preview        # http://localhost:4173
#   Settings → Import backup… → e2e/fixtures/r1-real-backup.json → Goals → "Đọc sách"
#   (để thấy đúng "+440.0% better" cần đồng hồ máy = 2026-10-13; ngày khác: headline vẫn +440.0 %, phụ đề "Last logged Oct 13: …")
#   Đổi Tiếng Việt ở Settings → "Tốt hơn +440,0%", "×5,4"
#   r3-down-backup.json → "−40.0% vs your first day"; r4-extreme-backup.json → "+143,900.0% better", trục Y "+144K%"
# Dev server: npm run dev → http://localhost:5173
```

## 5. Cách test

| Lệnh | Kết quả lần chạy cuối (2026-10-13) |
| :- | :- |
| `npm run lint` | exit 0 (0 lỗi, 0 cảnh báo) |
| `npm run typecheck` (`tsc -b --noEmit`) | exit 0 — sau khi loại `tests/qc/m5-r1-domain.test.ts` khỏi `tsconfig.app.json` (mục 8) |
| `npm test` (Vitest, gồm `tests/qc/**`) | **108 file: 107 pass, 1 fail; 1181 test: 1157 pass, 24 fail** — toàn bộ 24 fail nằm trong `tests/qc/m5-r1-domain.test.ts` (oracle 1.01^n của M5, bị thay thế — mục 7 của TASKS "Test cũ bị thay thế"). `npx vitest run src` (chỉ test dev): 107 file / 1157 pass |
| `npm run check` | **exit ≠ 0 chỉ vì bước `npm test`** ở trên; từng bước lint / typecheck / build đều exit 0 (build: xem dòng bundle) |
| `npm run bench` | in-memory repos median **3,8 ms**; fake-indexeddb 58,0 ms; pure review model 7,3 ms → < 200 ms, 10/10 pass |
| `npm run test:coverage` (src/domain) | Chạy toàn bộ: Vitest không in bảng coverage khi có test fail (24 fail của `tests/qc/m5-r1-domain.test.ts`). Chạy `npx vitest run src/domain --coverage --coverage.reporter=text` (177 test pass): **All files 99 % lines** (98,54 % stmts, 92,3 % branch); `curve.ts` **100 % lines** (98,7 % stmts, 94,8 % branch) ≥ 90 % (DoD) |
| `npm run test:e2e` (chromium + cloud, gồm `tests/qc/**`) | **575 test: 558 pass / 17 fail, 6,7 phút** (workers 8). **Toàn bộ 17 fail thuộc `tests/qc/**` và đều là assertion 1.01^n của M5** (bảng "Test cũ bị thay thế"): `tests/qc/final-journey.spec.ts:212` ×4 (en/vi × 360/1440: `/2[.,]0%/` → nhận `+0.0% better`), `tests/qc/m5-r1-curve.spec.ts` ×7 (dòng 55 `+8.3% better`, 114 aria-label cũ, 154 `+1,554.4% better`, 184 `curve-empty`, 200 `+1.0% better`, 231 `Day 9 of 31` trong `headline-sub` → nay ở `headline-day`, 272 `Tốt hơn 8,3%`), `tests/qc/m5-r1-flows.spec.ts:233` (`+8.3%`) và `:520` (G3 `+1.0%`), `tests/qc/cloud/final2-journey.spec.ts:212` ×4 (`/2[.,]0%/`). Mọi spec dev `e2e/**` (chromium + cloud) và mọi spec QC khác (M1–M8, final-nfr, sweep, m5-r2…) pass. `tests/qc/final-nfr.spec.ts` (NFR-03) pass: tải lạnh `#/today` **JS 240,7 kB, mọi text asset 248,3 kB ≤ 250** (M8: 247,3) |
| Chạy riêng `e2e/m9-curve.spec.ts` + 3 spec M5 đã sửa (chromium) | m9-curve **7/7**; m5-goal-detail, m5-journey, m5-i18n: tất cả pass (lần chạy 18/18 sau khi sửa 2 lỗi spec của chính m9-curve — mục 8) |
| `npm run build:cloud-e2e` (ngân sách NFR-03) | tải ban đầu = `index-*.js` **200,77 kB** + modulepreload `schemas` 26,03 + `dates` 9,52 + `useFormat` 6,89 + `types` 0,10 = **≈ 243,3 kB gzip ≤ 250** (M8: 242,3). Bundler tách lại chunk: `schemas` nhỏ đi (34,6 → 26,0), xuất hiện chunk `dates-*.js` 9,52 kB (date-fns) — tổng +1,0 kB. Chunk lazy không tính: `CurveChart` 8,47 (M8 ≈ 7), `GoalDetail` 3,99, `useRechartsWidth` (Recharts) 97,07, `supabase-client` 57,99. Precache 31 entry (1 790 KiB). `npm run build` (bản máy có `.env.local`): `index` 200,80 kB |

## 6. Tự kiểm AC

| AC | Kết quả | Bằng chứng (lệnh + output rút gọn) |
| :- | :- | :- |
| M9-AC1 | PASS | `src/domain/curve.test.ts` "R1": `minutes [5,10,14,27]`, `value [1,2,2.8,5.4]` (±1e-12), `percent [0,100,180,440]`, `changePercent [null,100,40,92.9]`, mọi `logged`; headline 440, `actualFactor` 5.4, `baseline {10-10,5}`, `latest {10-13,27}`, `previous {10-12,14}`, `latestChangePercent 92.9`, `loggedDays 4`, `elapsedDays 4`, `periodDays 83`, ideal 83 điểm, 4 điểm đầu `[1,2,3,4.1]`, `idealPercent 4.1`; đổi `targetMinutes` → `toEqual` (A-42). Biến thể (a) 10-14: 5 điểm, cuối `{0, false, 5.4, 440, null}`, headline 440, latest 10-13, ideal 5.1; (b) 20 + 7 → `toEqual`; (c) bỏ 10-12 → `{0, 2, 100, null}`, 10-13 change 170, previous 10-11, loggedDays 3; (d) 10-14 3 phút → headline −40, change −88.9, latest/previous đúng; (e) today 10-12 → 3 điểm, headline 180 |
| M9-AC2 | PASS | `curve.test.ts` "S1": G1 9 điểm value 1/percent 0, change `[null,0×7,null]`, headline 0 (`Object.is` 0), loggedDays 8, ideal 9.4, k=9 → 1.0937, 31 điểm; G2 39 điểm, 09-15 `−50/−50`, 09-16…10-06 flat −50 change null, 10-07 `0/+100`, headline 0, loggedDays 13, ideal 47.4; G3 282 điểm, baseline = latest {03-02, 60}, previous null; G5 181 điểm tới 06-30, headline 0; G4 `actual []`, factor 1, baseline null; G1 không entry → 9 điểm value 1, baseline null, loggedDays 0; entry 09-30 (và 10-10 tương lai) → `toEqual`; archived = không; `pct`: 17/16 → 6.3, 15/16 → −6.3, 1440/1 → 143900, 1/1440 → −99.9, 405/400 → 1.3, 395/400 → −1.3; hai ngày bằng phút → `Object.is(…, 0)`; R3 → −40 (value 0.6); R4 → 143900; 1827 ngày: 1827 điểm, cuối ≈ 1.01^1827, 1500 ngày có ghi tính đúng (tỉ số trực tiếp, factor 3 chính xác). `curveYDomain`: R1 so far → `[0, 500]` (yMin = 0 ∈ [−0.25S, 0], yMax 500 ∈ [440, 440 + 0.25S]); G2 so far → yMin < −50; G1 whole → yMin ≤ 0, yMax ≥ 36.1; toàn 0 → yMax > yMin; input rỗng → `[0, >0]`; bước ∈ {1,2,5}×10ⁿ, ≥ 1, ≤ 7 tick cho R4 và ideal 1827 ngày. `npm run bench`: 3,8 ms < 200 |
| M9-AC3 | PASS | `CurveChart.test.tsx`: R1 → tick `+500%` (max ≥ 440), `.recharts-reference-line.zero-line`, 2 `.recharts-line`, 4 `.curve-dot`; đọc bằng phím 10-12: `Oct 12 · 14 min, +40.0% vs previous logged day · You +180.0% since your first day · Ideal +3.0%`; G2 So far → tick khớp `/^[-−]/`, `data-y-min ≤ −50`; R4 → mọi nhãn trục ≤ 8 ký tự, có `…K%`. Bảng (GoalDetail.curve.test.tsx): Whole 83 hàng, hàng 10-13 `['+4.1%','+440.0%','27','+92.9%']`, So far 4 hàng; G2 hàng 09-15 `['+16.1%','−50.0%','10','−50.0%']`. E2E 360 px `m9-curve.spec.ts` "M9-AC3": en `+143,900.0% better`, vi `Tốt hơn +143.900,0%`, nhãn trục ≤ 8 ký tự, `expectNoHorizontalScroll` pass (cả khi mở bảng), axe sạch |
| M9-AC4 | PASS | `m9-curve.spec.ts` "M9-AC4 / AC3 / AC8" (clock 2026-10-13, import R1): headline `+440.0% better`; phụ đề `Today: 27 min, +92.9% vs Oct 12 (14 min). ×5.4 since Oct 10 (5 min).`; tóm tắt chứa `+440.0%` và `+4.1%`; 2 series; Range `Whole period`; Progress `2.2%` (`56 of 2,490 min`), streak `0 days`; đường "You" chỉ có đoạn ngang/dọc (stepAfter). "M9-AC4: S1": `#/goals/g1` `+0.0% better`, Progress 25.8 %, streak 8/8, Pace, 8 hàng lịch sử; `#/goals/g2` So far mặc định, hàng 09-15 `−50.0%`, headline `+0.0%`, tick âm. Chunk Recharts chỉ ở Goal detail/Review: `e2e/m5-goal-detail.spec.ts` M5-AC2 (không đổi phần này) pass |
| M9-AC5 | PASS | `GoalDetail.curve.test.tsx` vi R1: `Tốt hơn +440,0%`; phụ đề = `Hôm nay: 27 phút, +92,9% so với 12 thg 10 (14 phút). ×5,4 kể từ 10 thg 10 (5 phút).` (ngày qua `Intl`); bảng `+440,0%`, `+4,1%`, `+40,0%`; legend/chú thích/tóm tắt/`empty.detail.curve` = chuỗi `vi.json`; `scanVi()` = []. `CurveChart.test.tsx` vi: nhãn `Bạn +440,0%`, đọc phím vi, `Bạn −40,0%`. E2E `m9-curve.spec.ts` "M9-AC5" (vi-VN, 360 px): G1 không entry, R1, R3 (`−40,0% so với ngày đầu`), G2 (hàng 09-15 `−50,0%`), G4 → quét vi 0, axe 0 serious/critical, không cuộn ngang, 0 request ngoài origin. `src/i18n/parity.test.ts` pass; `rg "headlineSub|detail\.tooltip'" src` → 0 |
| M9-AC6 | PASS | `m9-curve.spec.ts` "M9-AC6": (1) goal tạo qua UI không entry → `+0.0% better`, `headline-sub` = `empty.detail.curve`, tóm tắt "nothing logged yet", 1 `.recharts-line` + vạch 0 %, bảng `—`; (2) `r1-first-day-backup.json` → `+0.0%`, `Starting point: 5 min on Oct 10. …`, không `×`; (3) R3 → `−40.0% vs your first day`, màu = màu chữ `body`, tick âm; (4) G4 → `goal.detail.upcoming`, 1 line, không chấm; (5) G5 → "You" dừng 06-30 (`Jun 30 · 15 min, your first logged day …`), headline `+0.0%`; (6) "M9-AC6 (6)": clock 10-14 import R1 → `+440.0%`, `Last logged Oct 13: …`, hàng 10-14 `['+5.1%','+440.0%','0','—']`, đọc `Oct 14 · Nothing logged, the line stays flat · You +440.0% · Ideal +5.1%`; Today ghi 3 phút → `−40.0% vs your first day` (A-39). Component test tương ứng trong `GoalDetail.curve.test.tsx` |
| M9-AC7 | PASS | `e2e/m5-journey.spec.ts` (M5-AC7): sau timer 30 + ghi bù 30 → `+0.0% better`, phụ đề `Today: 30 min, +0.0% vs Oct 8 (30 min). ×1 since Oct 8 (30 min).` (chứa `30`), các bước Export/Import/offline giữ nguyên, pass. `e2e/m5-i18n.spec.ts` (M5-AC12): `Tốt hơn +0,0%`, phụ đề `Hôm nay: 30 phút, +0,0% …`, quét vi + axe + offline giữ nguyên, pass. Các file `tests/qc/**` cần QC re-target: mục 8 |
| M9-AC8 | PASS (phần dev) / chờ QC re-target `tests/qc/**` | `git diff --stat 7cc51be..HEAD`: **không** đụng `src/domain/stats.test.ts`, `src/domain/heatmap.test.ts`, test "+1%" (`Today*.test.tsx`, `e2e/m5-goal-detail.spec.ts` M5-AC3), `e2e/m4-*.spec.ts`, `e2e/cloud/**`; `src/services/stats-service.test.ts` chỉ đổi `describe('StatsService.curve …')`. Lint 0, typecheck 0, Vitest dev 1157/1157, build OK; bundle 243,3 kB ≤ 250 (mục 5); `m9-curve.spec.ts` 0 request ngoài origin; axe Goal detail R1 en + vi 0 serious/critical (component + e2e). Playwright toàn bộ 558/575, 17 fail = QC M5 superseded (mục 5); `final-nfr` tải lạnh 248,3 kB ≤ 250 |

## 7. Deviations so với plan/design

- D1 (không đổi hành vi thấy được): `curveYDomain` được bọc quanh `curveYScale` (trả thêm `ticks` và `step`) để chart dùng đúng các vạch "đẹp" (DESIGN rule 3: 4–6 vạch, bước ≥ 1, luôn có 0) thay vì để Recharts tự chọn tick trong miền. Chữ ký `curveYDomain(ideal%, you%): [number, number]` giữ nguyên như ARCH §4.5.
- D2 (DOM/testid, DESIGN không quy định): phụ đề 2 dòng là hai `<p>`: `headline-day` (mới) và `headline-sub` (giữ testid cũ, thêm `data-variant`). `empty.detail.curve` là nội dung của `headline-sub` ở trạng thái chưa có entry nên **bỏ testid `curve-empty`** (M5); thêm `curve-note` cho chú thích, `data-sign` trên headline, `data-y-min`/`data-y-max` trên wrapper chart. Các test QC cũ dùng `curve-empty` sẽ fail (mục 8).
- D3: Khi chưa có entry, chart không render `<Line dataKey="you">` (đúng DESIGN A-D37) nên `.recharts-line` = 1 (M5 là 2, assertion M5-AC5 đã sửa và ghi chú).
- D4: Vị trí nhãn trực tiếp tính từ hình học suy ra (margin + `XAxis height={30}` cố định + miền Y của mình) thay vì hỏi Recharts; kiểm bằng test: offset nhãn so với chấm = −10 (trên) / +14 (dưới), khớp `cy` Recharts tới 0,01 px.
- D5: `decimal3` (M5, chỉ dùng cho `1,01^n = 1,083`) bị bỏ khỏi `Formatters` vì không còn nơi dùng (ARCH không yêu cầu giữ).
- D6 (test, không phải code): `tsconfig.app.json` exclude `tests/qc/m5-r1-domain.test.ts` để `tsc -b` (typecheck + build) xanh; Vitest vẫn chạy file đó. QC gỡ dòng exclude khi re-target (hoặc dev gỡ ở vòng fix).

## 8. Known issues và giới hạn

- **`tests/qc/**` sẽ fail vì định nghĩa mới (QC re-target ở round 1, không phải defect — TASKS "Test cũ bị thay thế"):**
  - `tests/qc/m5-r1-domain.test.ts` — 24 test: dùng `p.n`, `c.daysOnTarget`, oracle 1.01^n (dòng 37–143; cả `randomised dataset 1…40`). Cũng là lý do exclude trong `tsconfig.app.json` (TS2339 ở dòng 63, 77, 83, 132, 134, 143).
  - `tests/qc/m5-r1-curve.spec.ts` — dòng 37 (`pct` 1.01^n), 55 (`+8.3% better`), 74–93 (pixel oracle y(+9.4 %)/y(+8.3 %) — miền Y giờ là `[0, 40]` với G1 whole, điểm You tại 0 %), 114 (aria-label cũ), 122–143 (chuỗi đọc `Oct 9 · Ideal +9.4% · You +8.3%` → nay `Oct 9 · Nothing logged, the line stays flat · You +0.0% · Ideal +9.4%`; `Oct 1 · … You +1.0%` → `Oct 1 · 30 min, your first logged day · You +0.0% · Ideal +1.0%`), 154 (G3 `+1620.2%` → `+0.0% better`), 168 (G5 `+1.0%` → `+0.0%`), 184 (`curve-empty` → `headline-sub`), 186–187 (`0 days on target`, `1.01^0`), 200 (`+1.0% better`), 217/223 (goal không entry: `.recharts-line` 2 → 1), 235 (`8 days on target`), 273–280 (`1,01^8 = 1,083`, `+8,3%`).
  - `tests/qc/m5-r1-flows.spec.ts` — dòng 233 (`+8.3% better` → `+0.0% better`), 520 (G3 `+1.0% better` → `+0.0% better`).
  - `tests/qc/final-journey.spec.ts` — dòng 210–213 (`+2.0% better` sau timer + ghi bù → `+0.0% better`; `.recharts-line` 2 vẫn đúng vì goal có entry), các assert headline `2.0%` khác nếu có.
  - `tests/qc/cloud/final2-journey.spec.ts` — dòng 213 và các assert headline `+2.0%`/`2,0%` tương ứng (project `cloud`).
  - `tests/qc/m5-r2.spec.ts`, `tests/qc/m5-r1-sweep.spec.ts`, `tests/qc/m4-r1-domain.test.ts`: **pass** trong lần chạy toàn bộ (không phụ thuộc giá trị đường cong).
  - Kết quả thực tế của lần chạy toàn bộ Playwright (17 fail, từng dòng): mục 5. Vitest: 24 fail chỉ ở `m5-r1-domain.test.ts`.
- Ở màn hẹp (360 px), nếu đang đọc biểu đồ bằng bàn phím mà dòng aria-live dài 2–3 dòng rồi **bấm chuột** vào "Show data as table": mousedown làm chart blur → dòng đọc xoá (hành vi M5, QC `m5-r1-curve.spec.ts:132–136` kiểm) → layout nhảy lên trước mouseup nên lần bấm đầu không mở bảng (phải bấm lại). Không đổi hành vi M5 trong M9; spec `m9-curve` bấm Escape trước. Đề xuất backlog Minor: giữ dòng đọc tới khi Escape/đổi focus xong, hoặc `min-height` theo số dòng.
- Nhãn trục compact ở `vi` lấy đúng kết quả `Intl` của trình duyệt (`+144 N%` trên Node 22 và Chromium 1248); ICU khác có thể cho chuỗi khác — test chỉ kiểm ≤ 8 ký tự (A-D40).
- Khi ideal rất lớn (goal 1827 ngày, Whole period) trục Y lên tới `+79M%`: hợp lệ, "You" nằm sát 0 % (DESIGN rule 7; mặc định So far).
- Headline ở 360 px với giá trị cực trị (`+143,900.0% better`) xuống dòng nhờ `overflow-wrap: anywhere` (có từ M5) — kiểm `expectNoHorizontalScroll` pass.
- `npm run check` không exit 0 chừng nào `tests/qc/m5-r1-domain.test.ts` chưa được QC re-target (mục 5).

## 9. Dispute

- Không có. Các test QC fail đều thuộc danh sách "Test cũ bị thay thế" của TASKS (QC re-target), không phải dispute.
