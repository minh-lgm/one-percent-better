# Dev handoff — M21 Giờ lộ trình = toàn bộ giờ của goal liên kết; ô ngày hiện đủ năm (v8.3)

## 1. Tóm tắt

- **T2 (domain)**: `roadmapView` tính `hoursDoneMinutes` = tổng mọi entry còn sống của goal liên kết (không lọc theo cửa sổ hay `today`, = `goalStats.minutesTotal`); thêm `outsideMinutes` (= tổng − Σ giờ mục) và `beforeStartMinutes` (phần ngoài mục có ngày < `min plannedStart`; 0 khi không có mục). `attributeMinutes` giữ nguyên contract (`total` = phút đã gán) — `tests/qc/m17-r1-domain.test.ts:76–115` pass không sửa. `RoadmapListRow` vẫn dùng `hoursDoneMinutes` nên danh sách tự đổi số.
- **T3 (UI + copy)**: `OverviewMetrics` hiện dòng `hours-outside` (`<div class="rd-s rd-out">`, chữ thường, không `aria-live`/icon) giữa số giờ và dòng "Kế hoạch…", hai biến thể `overview.hoursOutsideBefore` / `overview.hoursOutside`; ẩn khi 0, khi giờ là "—", và khi lộ trình chưa có mục (OQ-D88). `howHours.body` viết lại `en`/`vi` nguyên văn DESIGN v8.3.
- **T4 (ô ngày, FR-81)**: token `--date-min`, class `date-fit` cho cả 7 `<input type="date">` của roadmap; ô thực tế S13 `flex: 0 0 auto; width: max-content` (thay `flex: 1 1 120px; min-width: 0` — gốc lỗi); `Today` + `Clear` bọc `.rd-btns` xuống dòng nguyên cặp; `.rd-det` lưới `auto-fit minmax(min(100%, 14rem), 1fr)`. Spec đo **FAIL trên code cũ** ở nhóm (1) mọi bề rộng × 2 locale (vi-VN 690 px: 140,3 < 175,0), **PASS sau sửa** (116/116 phép đo).
- **T5**: re-target `src/**` (6 file) + `e2e/**` (5 file) theo bảng TASKS; 2 spec mới `e2e/m21-roadmap-hours.spec.ts`, `e2e/m21-date-inputs.spec.ts`; README.
- **Ngân sách `#/today`**: 227.177 B / 227.591 B (−3 / +5 so 227.180 / 227.586) — trong ±50 B.

## 2. Task

| ID | Trạng thái | Ghi chú |
| :- | :- | :- |
| M21-T1 | (designer) DONE | DESIGN v8.3 — không thuộc developer |
| M21-T2 | DONE | `src/domain/roadmap-progress.ts` (+ test oracle v8.3, property test, so với `goalStats`), comment `src/test/builders.ts`; bench 2,4 ms |
| M21-T3 | DONE | `OverviewMetrics.tsx`, `roadmap.{en,vi}.json` (+2 key, `howHours.body`), `roadmap-parity.test.ts` (284/270), component test trong `RoadmapDetail.test.tsx` |
| M21-T4 | DONE | `roadmap-screens.css`, `RoadmapItemRow.tsx` (`.rd-btns` + `date-fit`), `ItemEditor.tsx`, `CheckpointEditor.tsx`, `RoadmapFields.tsx`, `TemplateDialog.tsx` (`date-fit`); `e2e/m21-date-inputs.spec.ts` |
| M21-T5 | DONE | re-target theo bảng; `e2e/m21-roadmap-hours.spec.ts`; README; handoff này + `docs/handoff/m21/` |

Commit: `73c43b5` feat (giờ), `7f145dc` feat (ô ngày), `8e11ab6` test (e2e), + commit docs của handoff này.

## 3. File chính đã thêm/sửa

- **Thêm:** `e2e/m21-roadmap-hours.spec.ts`, `e2e/m21-date-inputs.spec.ts`, `docs/handoff/m21/` (8 ảnh before/after + `ac5-before-fc9b547.txt`, `ac5-after.txt`).
- **Sửa (code):** `src/domain/roadmap-progress.ts`, `src/ui/components/roadmap/OverviewMetrics.tsx`, `RoadmapItemRow.tsx`, `ItemEditor.tsx`, `CheckpointEditor.tsx`, `RoadmapFields.tsx`, `TemplateDialog.tsx`, `src/ui/styles/roadmap-screens.css`, `src/i18n/resources/roadmap.en.json`, `roadmap.vi.json`, `README.md`.
- **Sửa (test):** `src/domain/roadmap-progress.test.ts`, `src/services/roadmap-service.test.ts`, `src/ui/screens/RoadmapDetail.test.tsx`, `Roadmaps.test.tsx`, `RoadmapEditor.test.tsx`, `src/ui/components/roadmap/TemplateDialog.test.tsx`, `src/i18n/roadmap-parity.test.ts`, `src/test/builders.ts` (comment); `e2e/m17-roadmap-data.spec.ts`, `e2e/m19-roadmap-ui.spec.ts`, `e2e/m20-qpt-template.spec.ts`, `e2e/cloud/m18-roadmap-sync.spec.ts`, `e2e/cloud/m20-template-sync.spec.ts`.
- **Không đổi:** schema Dexie, SQL Supabase, backup, sync, route, mã lỗi, `.env.example` (không có biến mới).

## 4. Cách chạy

```bash
npm ci                     # Node 22
cp .env.example .env.local # không có biến mới ở M21
npm run dev                # http://localhost:5173 → Settings › Import e2e/fixtures/q1-roadmap-backup.json → #/roadmaps
```

## 5. Cách test

```bash
npm run check                                                    # lint + typecheck + vitest + build:e2e
npx vitest run src/domain/roadmap-progress.test.ts tests/qc/m17-r1-domain.test.ts
npx vitest run src/ui/screens/RoadmapDetail.test.tsx src/i18n/roadmap-parity.test.ts
npx cross-env BENCH_ASSERT=1 vitest run src/domain/roadmap-progress.bench.test.ts --reporter=verbose   # NFR-26
npm run test:e2e -- --project=chromium e2e/m21-roadmap-hours.spec.ts e2e/m21-date-inputs.spec.ts
M21_SHOTS_DIR=docs/handoff/m21 npm run test:e2e -- --project=chromium e2e/m21-date-inputs.spec.ts     # ảnh nhóm (1) vi 690/360 light+dark
npm run test:e2e -- --project=chromium e2e/m10-bundle.spec.ts tests/qc/m17-r1-budget.spec.ts           # BUDGET-EXACT cloud tắt
npm run test:e2e -- --project=cloud e2e/cloud/m10-bundle.spec.ts tests/qc/cloud/m17-r1-budget.spec.ts # BUDGET-EXACT cloud bật
npm run test:e2e                                                 # 3 project (~10 phút)
```

Kết quả lần chạy cuối: §10.

## 6. Tự kiểm AC

| AC | Kết quả | Bằng chứng (lệnh + output rút gọn) |
| :- | :- | :- |
| M21-AC1 | PASS | `npx vitest run src/domain/roadmap-progress.test.ts` → 22/22. Q1 395 / outside 50 / before 50, W1 270 / W2 75 / W3 0; Q1b 395 (W1 345, W2 0); Q1c 395 (W1 315, W2 30); Q1d (today 10-26) 395, Σ mục 345; archived 395; Q1e và `goalId null` → `null`/`null`/`null`, mọi `itemMinutes null`; không mục + `gq` → 395 / 395 / 0; ca khe → 395, A 165, B 0, outside 230, before 200; Q1 + 30 phút 11-04 → 425, W2 105; `g3` → 60/60/60, + 100 phút 11-03 → 160. `hoursDoneMinutes` Q1 **=** `goalStats(gq, entries gq, 2026, '2026-11-04').minutesTotal` (395); `attributeMinutes(...).total` vẫn 345. Property test 200 lộ trình (seed 20261105; 0–9 mục, entry 09-01…12-29, `today` ngẫu nhiên, 20 % archived): `Σ itemMinutes + outside = hoursDone = Σ entry`, `0 ≤ before ≤ outside`, không mục → outside = tổng, before 0. `tests/qc/m17-r1-domain.test.ts` brute-force `:76–115` pass không sửa (chỉ `:57` đỏ — bảng TASKS). Bench NFR-26: `median 2.4 ms (min 2.0 ms)` < 50 ms |
| M21-AC2 | PASS | `e2e/m21-roadmap-hours.spec.ts` (chromium): vi-VN 360 — hàng `Đã học 6,6 giờ / 16 giờ`; `hours-value` `6,6 giờ`, `hours-outside` `Gồm 0,8 giờ từ trước ngày bắt đầu lộ trình.`, `hours-sub` `Kế hoạch đến hết tuần này: 16 giờ`; W1 `4,5 giờ` / W2 `1,3 giờ` / W3 `0 giờ`; `75/480 phút`. en-US 1440 — `Studied 6.6 h of 16 h`, `6.6 h`, `Includes 0.8 h from before the roadmap's start date.`, `4.5 h`/`1.3 h`/`0 h`, `75/480 min`. Component (`RoadmapDetail.test.tsx` "M21"): thứ tự DOM `hours-value → hours-outside → hours-sub`; ca khe → `Includes 3.8 h from days that fall outside every item.` / `Gồm 3,8 giờ ở những ngày không thuộc mục nào.`; Q1 bỏ entry 10-20 → `5.8 h`, không dòng; không mục → `6.6 h`, không dòng (OQ-D88); Q1e / none → `—`, không dòng; archived → dòng giữ + câu archived trong `hours-sub`. Liên kết Spanish (`e2e/m19-roadmap-ui.spec.ts` ~:357) → `1 h` + `Includes 1 h from before the roadmap's start date.` |
| M21-AC3 | PASS | `e2e/m21-roadmap-hours.spec.ts` (en 1440): `#/goals/gq` `stat-progress` chứa `395`; `#/roadmaps/rq` `6.6 h`. Today → Log time 30 phút "QPT study" (2026-11-04) → Goal detail `425`; lộ trình `7.1 h`, W2 `1.8 h`, `105/480 min`, `hours-outside` vẫn `0.8 h`; danh sách `Studied 7.1 h of 16 h`. Archive `gq` → `7.1 h` + `The linked goal is archived. Its time still counts. Planned through this week: 16 h`, `detail-goal` chứa `archived`. Delete `gq` → `—`, không `hours-outside`, W2 `—`. Chuyển màn bằng hash (không reload trang) |
| M21-AC4 | PASS | `how-hours` body = đúng chuỗi DESIGN v8.3 (component test so nguyên văn `en` + `vi`; e2e vi kiểm đoạn đầu); `git grep -nE "aren't counted here\|không tính ở đây" -- src` → 0 dòng; `roadmap-parity.test.ts` 7/7 (parity, verbatim với DESIGN 7.9.2, 284 en / 270 vi, có 3 hàng M21); quét vi chi tiết Q1 = `[]` (component + e2e 360); axe chi tiết Q1 có `hours-outside` ở vi-VN 360 light + dark và en 1440 light: 0 serious/critical. Dòng là chữ thường (không icon/màu) |
| M21-AC5 | PASS | Xem "Bằng chứng AC5" bên dưới. Sau sửa: `e2e/m21-date-inputs.spec.ts` 4/4, 116/116 phép đo `ok`, không cuộn ngang; trước sửa: FAIL nhóm (1) cả 7 bề rộng × 2 locale |
| M21-AC6 | PASS (phạm vi dev; `npm run check` chỉ đỏ đúng 3 assertion `tests/qc/**` — §8, §9) | Ngân sách: 227.177 / 227.591 B ≤ 230.000, Δ −3 / +5 (§8). `git diff abd6fd7 -- src/data/dexie/db.ts supabase/ src/domain/backup-file.ts src/domain/backup.ts src/services/sync-service.ts \| wc -l` → **0**. README mục "Big goals / Mục tiêu lớn": câu cách tính mới, không còn câu "not counted on the roadmap". E2E 3 project: §10 |
| M21-AC7 | n/a (designer) | DESIGN v8.3 có sẵn (commit ad95973) |

### Bằng chứng AC5 (spec đo bắt được lỗi user báo)

- **Phép đo** (`e2e/m21-date-inputs.spec.ts`, đúng tiêu chí TASKS): `actual = getBoundingClientRect().width`; `natural` = bề rộng bản clone cùng class, cùng cha, cùng `value`, `position:absolute; visibility:hidden; width:max-content; min-width:0; max-width:none; flex:none`; kỳ vọng `actual ≥ natural − 0.5` cho 5 nhóm / 7 ô × {360, 390, 690, 768, 1024, 1280, 1440} × {en-US, vi-VN}, cao 900; `expectNoHorizontalScroll` ở mỗi bề rộng. Dùng `expect.soft` để một lần chạy liệt kê đủ mọi tổ hợp bị cắt.
- **Trên code trước sửa** (cây làm việc với 6 file của commit `7f145dc` được `git stash` — `src/**` khi đó trùng byte với `fc9b547`/`abd6fd7` ở mọi file liên quan ô ngày): **2 failed / 2 passed** (2 test chính FAIL, 2 test "extra" chỉ log). Nhóm (1) **CUT ở cả 14 tổ hợp mỗi locale** — `vi-VN 690 (1) #1 2026-10-27: actual 140.3 natural 175.0 min-width 0px CUT` (= lỗi user báo); 360 px 121,3; 1024 px 114,0. Nhóm (2)–(5) đã `ok` từ trước (ô `.input.narrow` rộng 220 ≥ 214–215). Toàn bộ 116 dòng: `docs/handoff/m21/ac5-before-fc9b547.txt`.
- **Sau sửa**: 116/116 `ok`; nhóm (1) `actual 175.0 natural 175.0` ở mọi bề rộng/locale; nhóm (2)–(5) 220 / 214–215. File: `docs/handoff/m21/ac5-after.txt`.
- **Ảnh nhóm (1)** (`vi-VN`, Chromium `--lang=vi-VN` nên ô hiện `dd/mm/yyyy`): `docs/handoff/m21/m21-dates-vi-{690,360}-{light,dark}-{before,after}.png` — before: `27/10/202` / `01/11/202` bị cắt, nút cùng hàng; after: `27/10/2026`, `01/11/2026` đủ, `[Hôm nay] [Xóa]` xuống dòng nguyên cặp dưới ô.
- **Đo kèm (A-94, không chặn)**: GoalForm start/end ở 360/690/1440: `actual 220 natural 214` — ok; DateNav: `actual 180/200 natural 160` — ok (cả hai locale). Không có ô bị cắt.

## 7. Deviations so với plan/design

1. **OQ-D88 (orchestrator chấp nhận tạm):** UI ẩn `hours-outside` khi lộ trình chưa có mục (DESIGN A-D98), hẹp hơn ARCH §4.8 (c) "`outsideMinutes > 0` → một dòng". Domain vẫn đúng ARCH (không mục + `gq` → 395/395/0). Có component test "không mục → không có dòng". Planner cần sửa ARCH ở lần revise kế.
2. **Sàn `--date-min` nhỏ hơn bề rộng tự nhiên trên Chromium.** DESIGN §6.3 tính tay `calc(10ch + 56px)` ≈ 184 px (22 px) / 196 px (24 px) "> tự nhiên ≈ 163 / 177". Đo thật (log `min-width` trong spec): sàn = **166 px** (22 px Fraunces) / **176 px** (24 px), còn bề rộng tự nhiên = **175 px** / **214–215 px**. Tức sàn **không** phải lưới bảo hiểm; ô S13 đủ chữ là nhờ `width: max-content` (đúng DESIGN), 5 ô còn lại nhờ `width: 100%` + trần 220 px của `.input.narrow`. Giữ nguyên token theo DESIGN (không tự đổi giá trị); AC5 PASS. Đề xuất designer: nếu muốn sàn có tác dụng trên trình duyệt không hỗ trợ `max-content` cho ô date, nâng lên ≈ `calc(10ch + 72px)` (đo lại).
3. **`.date-fit` để specificity thấp (một class)** để `.input.narrow { max-width: 220px }` vẫn thắng `max-width: 100%` của `.date-fit` — 5 ô của editor/dialog giữ đúng 220 px như hiện nay (DESIGN: "giữ `width: 100%` … của `.input.narrow`"). Ô S13 khai báo `max-width: 100%` trong selector riêng `.rd-in .input.d` như DESIGN.
4. **`.rd-det` auto-fit** theo bảng DESIGN §6.3 (mockup 12 vẫn còn `@media 640 1fr 1fr` cũ — tôi theo văn bản DESIGN). Hệ quả: khung ≥ ≈ 696 px (vd. 768–1023 px không có aside) có 3 cột, hai ô ngày chiếm 2/3 — vẫn ≥ 224 px mỗi cột, không cắt.
5. **Ô ngày hiện theo `--lang` của Chromium, không theo `locale` của context Playwright.** Với chỉ `locale: 'vi-VN'`, Chromium headless vẫn vẽ `10/27/2026`. Spec M21-AC5 tự mở trình duyệt với `--lang=<locale>` (`playwright.chromium.launch`) để ảnh vi hiện `27/10/2026` như AC yêu cầu; phép đo cho cùng số ở hai cách.
6. **TASKS M21-T1 ghi "mockup 13 số Q1"** — số nằm ở mockup 11/12 (đã ghi ở STATUS, không ảnh hưởng code).

## 8. Known issues và giới hạn

**Ngân sách tải lạnh `#/today`** (`BUDGET-EXACT`, gzip, 5 response: html · rolldown-runtime · css · core · index):

| Mốc | cloud tắt | cloud bật | Ghi chú |
| :- | -: | -: | :- |
| Sau M20 / main abd6fd7 (mốc M21) | 227.180 | 227.586 | theo TASKS M21 |
| **Sau M21** | **227.177** | **227.591** | html 573 · 428 · css 9.860 · core 18.197 · index 198.119 / html 589 · 428 · css 9.874 · core 18.199 · index 198.501 |
| Δ | **−3** | **+5** | trong ±50 B; mọi thay đổi trong chunk lazy (roadmap-progress, màn roadmap, `roadmap-screens.css`, namespace `roadmap`); chênh do hash/tên chunk |

- **`npm run check` exit 1 cho tới khi QC re-target**: Vitest 212 file / **2.827 test, 3 fail, đều ở `tests/qc/**`** (§9). Lint 0, typecheck 0; `build:e2e` chạy qua webServer của Playwright (ok).
- **2 assertion QC đỏ ngoài bảng TASKS** (do 2 key mới, không phải defect): `tests/qc/m19-r1-copy.test.ts:56` và `tests/qc/m20-r1-copy.test.ts:56` ("resources contain no key that DESIGN 7.9.2 does not list") — parser QC chỉ nhận hàng `| \`key\` | M\d+ |`, còn DESIGN v8.3 ghi cột MS của 2 key mới là `**M21 *(mới v8.3)***` (in đậm) nên bị coi là key thừa. Copy khớp DESIGN nguyên văn (test parity của dev đọc được hàng này). QC sửa parser (chấp nhận `**M21`) hoặc designer bỏ in đậm.
- Safari/Firefox/iOS chưa đo ô ngày (AC5 chỉ Chromium; DESIGN A-D99 b) — xem bằng mắt khi lên Pages.
- Làm tròn hiển thị độc lập: tổng `6.6 h` ≠ `4.5 + 1.3 + 0.8 = 6.6` ở Q1 khớp, nhưng ca khác có thể lệch 0,1 giờ (ARCH bất biến v8.3, không phải lỗi).

## 9. Dispute (nếu có)

Không dispute. **Danh sách `tests/qc/**` cần QC re-target** (không sửa; đỏ đúng như dự kiến):

| File:dòng | Hiện kỳ vọng → mới | Trạng thái lần chạy cuối |
| :- | :- | :- |
| `tests/qc/m17-r1-domain.test.ts:57` (+ tên `:46`) | 345 → **395** | Vitest đỏ (`expected 395 to be 345`) |
| `tests/qc/m17-r1-explore.spec.ts:49` / `:53` (+ tên `:40`) | `Studied 5.8 h of 16 h` → **`Studied 6.6 h of 16 h`** / `5,8 giờ` → **`6,6 giờ`** | E2E — §10 |
| `tests/qc/m19-r1-accept.spec.ts:38`, `:69` / `:135` | `5.8 h` → **`6.6 h`** / `5,8 giờ` → **`6,6 giờ`** | E2E — §10 |
| `tests/qc/m20-r1-accept.spec.ts:132` | `hours: '5,8 giờ'` → **`'6,6 giờ'`** | E2E — §10 |
| `tests/qc/cloud/final-phase8-journey.spec.ts:44` / `:77` | `5,8 giờ`/`5.8 h` → **`6,6 giờ`/`6.6 h`**; `5,8`/`5.8` → **`6,6`/`6.6`** | E2E — §10 |
| *(ngoài bảng TASKS)* `tests/qc/m19-r1-copy.test.ts:56`, `tests/qc/m20-r1-copy.test.ts:56` | chấp nhận 2 key M21 (`overview.hoursOutsideBefore`, `overview.hoursOutside`) | Vitest đỏ — §8 |

`tests/qc/m17-r1-format.test.ts` (`f.hours(345)` chỉ là ví dụ định dạng) pass, không cần đổi.

## 10. Kết quả lần chạy cuối

Trên HEAD `5fc58cd` (= code `8e11ab6`), máy Windows dev.

- `npm run lint` 0 lỗi; `tsc -b --noEmit` 0 lỗi.
- `npx vitest run` (= bước test của `npm run check`): **212 file / 2.827 test — 2.824 pass, 3 fail**, cả 3 ở `tests/qc/**`: `m17-r1-domain.test.ts:57` (bảng TASKS) và `m19-r1-copy.test.ts:56`, `m20-r1-copy.test.ts:56` (2 key M21, §8). Không fail nào ở `src/**`. (Trước M21: 2.813 test.)
- Bench NFR-26: `median 2.4 ms (min 2.0 ms)`.
- Ngân sách: `BUDGET-EXACT chromium TOTAL 227177 responses 5`, `BUDGET-EXACT cloud TOTAL 227591 responses 5` (giống nhau ở lần chạy riêng và trong full e2e).
- Spec M21: `e2e/m21-roadmap-hours.spec.ts` 2/2, `e2e/m21-date-inputs.spec.ts` 4/4; chạy cùng re-target dev + budget (`m17-roadmap-data`, `m19-roadmap-ui`, `m20-qpt-template`, `cloud/m18-roadmap-sync`, `cloud/m20-template-sync`, 2 `m10-bundle`, 2 `m17-r1-budget`) → **35/35 pass**.
- `npm run test:e2e` (3 project, 9,4 phút): **846 pass / 32 fail**, 0 flaky. Phân loại:
  - (a) **Đỏ sẵn trên `main` (20, đúng danh sách docs/qc/report-final-phase8.md §6)**: `e2e/cloud/m7-sync.spec.ts:25, :165`; `m7-merge.spec.ts:79, :106, :137`; `m7-i18n.spec.ts:48`; `m15-d6-layout.spec.ts:36` ×2; `m14-delete-account.spec.ts:226`; `m8-prompts.spec.ts:242`; QC `cloud/final2-journey.spec.ts:109` ×4; `cloud/m14-r1-explore.spec.ts:282`; `cloud/m6-r1-ui.spec.ts:74` ×2; `cloud/m7-r1-ui.spec.ts:233`; `cloud/m6-r1-flow.spec.ts:159`; `native/m13-r1-native-shell.spec.ts:105`.
  - (b) **`tests/qc/**` chờ QC re-target (12 test, đỏ tại đúng assertion của bảng TASKS)**: `m17-r1-explore.spec.ts:40` ×4 (đỏ ở `:49` en ×2, `:53` vi ×2); `m19-r1-accept.spec.ts:33` (đỏ `:38`), `:64` (đỏ `:69`), `:109` (đỏ `:135`); `m20-r1-accept.spec.ts:82` (đỏ `:133`, giá trị từ `:132`); `cloud/final-phase8-journey.spec.ts:40` ×4 (đỏ `:64`, giá trị từ `:44`; `:77` chưa tới được vì test dừng ở `:64` — QC sửa cả hai).
  - (c) Do M21 ngoài bảng: **0** ở e2e.
  - (d) Flaky đã biết (`m5-r2:26`, `cloud/m6-r1-flow:142`, `m11-r1-explore:88`): lần này đều pass.

## 11. NOT VERIFIED

- Ô ngày trên Firefox, Safari desktop, Safari iOS (control hệ thống) — chỉ đo Chromium.
- Lộ trình QPT thật của user trên Pages (giờ = tổng goal `7ea38fbe-…`) — chờ deploy sau QC PASS (phần đối chiếu giờ của U33/NV-24).
