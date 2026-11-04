# QC report — M20 round 1

**Verdict:** FAIL
**Ngày:** 2026-11-05  **Commit:** 89fca67 (HEAD của developer; commit M20: 2e9534f, 4e34d06, 57ccce7, 98abeca, d4c55e0, e444fb6; baseline trước M20 = 2f6b376)

## 1. Tóm tắt

6/6 AC của M20 đạt ở happy path và ở các test độc lập của QC (template, checkpoint, hành trình Q1, đồng bộ cloud, ngân sách, a11y, quét vi). M19-D1 đã được sửa (FIXED). Tuy vậy có **1 defect Major mới (M20-D1)**: ngày bắt đầu mẫu ở cuối năm 9999 làm các tuần sau rơi sang năm 10000 → hàng được ghi với ngày không hợp lệ (`10000-02-11`), xem trước hiện `NaN-NaN-NaN`, và **file Export của chính app bị Import của chính app từ chối** ("This file doesn't look like a 1% Better backup"). Kèm 1 defect Minor (M20-D2: unit test `TemplateDialog.test.tsx` chập chờn làm `npm run check` thỉnh thoảng đỏ). Có defect Major mở nên verdict là FAIL; sửa M20-D1 (nhỏ) rồi QC vòng 2 kiểm lại.

Không kiểm được: NV-23 (U32) và NV-24 (U33) — cần thiết bị/dữ liệu thật của user (§8).

## 2. Môi trường và lệnh đã chạy

Windows 11, Node 22, npm, không Docker. Đồng hồ Playwright 2026-11-04T10:00+07:00.

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Lint | `npm run lint` | 0 lỗi (exit 0) |
| Typecheck | `npm run typecheck` | 0 lỗi (exit 0) |
| Vitest đầy đủ (lần 1) | `npx vitest run` | 208 file / 2.766 test: 2.765 pass, **1 đỏ** `src/ui/components/roadmap/TemplateDialog.test.tsx` (focus), chập chờn, xem M20-D2 |
| Check | `npm run check` | **exit 0**; Vitest 211 file / 2.787 test pass (kể cả 3 file QC mới); `build:e2e` ok |
| Bench NFR-26 | `npx cross-env BENCH_ASSERT=1 vitest run src/domain/roadmap-progress.bench.test.ts --reporter=verbose` | pass; median **2,2 ms** (min 2,1 ms) cho 200 mục / 50 checkpoint / 5.500 entry (< 50 ms) |
| Coverage | `npx vitest run --coverage src/domain` | 382 test pass; **All files 98,19 % stmt / 93,86 % branch / 99 % func / 99,18 % line** (≥ 90 %), khớp số dev |
| Unit QC mới | `npx vitest run tests/qc/m20-r1-template.test.ts tests/qc/m20-r1-copy.test.ts tests/qc/m20-r1-scan-mask.test.ts` | 13 pass + 1 expected-fail (M20-D1) / 7 / 1 |
| E2E QC chromium | `npm run test:e2e -- --project=chromium tests/qc/m20-r1-accept.spec.ts` | 9 pass (gồm 1 `test.fail` có chủ đích cho M20-D1) |
| E2E cloud | `--project=cloud tests/qc/cloud/m20-r1-sync.spec.ts e2e/cloud/m20-template-sync.spec.ts` | 2/2 pass |
| Ngân sách cloud tắt | `--project=chromium e2e/m10-bundle.spec.ts tests/qc/m17-r1-budget.spec.ts` | 3/3 pass; `BUDGET-EXACT chromium TOTAL 227160 responses 5` |
| Ngân sách cloud bật | `--project=cloud e2e/cloud/m10-bundle.spec.ts tests/qc/cloud/m17-r1-budget.spec.ts` | 4/4 pass; `BUDGET-EXACT cloud TOTAL 227564 responses 5` |
| E2E đủ 3 project | `npm run test:e2e` (nền, 10,2 phút) | **841 pass / 23 fail**, phân loại ở §6 (không ca nào do M20) |
| Chạy lại riêng | `--project=chromium --project=cloud tests/qc/m11-r1-explore.spec.ts:88 tests/qc/m5-r2.spec.ts:26 tests/qc/cloud/m6-r1-flow.spec.ts:142 tests/qc/m17-r1-explore.spec.ts:22 tests/qc/m19-r1-accept.spec.ts` | 16 pass, 1 đỏ (`m6-r1-flow:142`, đã biết, §6) |

Ngân sách chi tiết (gzip 9, 5 response; bytes):

| Bản | html | runtime | css | core | index | Tổng | Baseline M17 | Δ cả phase 8 | Còn tới 230.000 |
| :- | -: | -: | -: | -: | -: | -: | -: | -: | -: |
| cloud tắt | 576 | 428 | 9.860 | 18.178 | 198.118 | **227.160** | 229.454 | **−2.294** | 2.840 |
| cloud bật | 587 | 428 | 9.874 | 18.179 | 198.496 | **227.564** | 229.658 | **−2.094** | 2.436 |

Mục tiêu phase "≤ M17 + 800 B" đạt (thấp hơn baseline); giới hạn cứng 230.000 đạt cả hai bản. Δ M20 so M19 r1 (227.162 / 227.571): −2 / −7 B. `grep` trên `dist/assets` và `dist-cloud-e2e/assets`: các chuỗi `Weekly rhythm`, `Nhịp học mỗi tuần`, `Thi QPT chính thức`, `Official QPT exam`, `Create from QPT`, `cp-table`, `cp-hatch`, `createFromQptTemplate`, `Scores vs. thresholds`, `tpl.langNote`, `Checkpoint 2` **không** có trong `index-*.js`, `core-*.js`, `rolldown-runtime-*.js`, `index-*.css` (đường tải lạnh); nội dung mẫu chỉ nằm trong `roadmap-service-*.js` (lazy).

## 3. Acceptance criteria

| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M20-AC1 | PASS (kèm M20-D1 ở biên năm 9999) | `tests/qc/m20-r1-template.test.ts` (oracle đọc từ `docs/plan/ref/qpt-tracker.html` bằng `new Function` trên literal `PHASES`, và từ bảng DESIGN §7.9.3): `vi` 2026-10-27 → `weeklyTargetMinutes 480`, `milestoneLabel 'Thi QPT'`, `milestoneDate 2027-03-09`, note 7 dòng (dòng 1 `Nhịp học mỗi tuần`, dòng 7 `Quiz chưa đạt 80% thì chưa sang module mới.`, cả 7 dòng khớp ô DESIGN); 5 phase (tên + course = tracker); 21 tiêu đề = `PHASES[].weeks` (4/4/4/4/5); W1 `2026-10-27 – 2026-11-02`, W8 end `2026-12-21`, W16 `2027-02-15`, W18 `2027-03-01`, W19 `2027-03-08`, W20 `2027-03-09 – 2027-03-15`, W21 end `2027-03-22`, mọi mục 7 ngày liền nhau; 5 checkpoint đúng số/ngày/ghi chú; tổng 32 hàng. `en`: cùng cấu trúc/ngày/số, 21 tiêu đề = cột `en` DESIGN ("giống" = `vi`), dòng 1 `Weekly rhythm`, không có "Lấp lỗ hổng"/"Thi QPT chính thức"/"tuần"/"hồ sơ"/"Buffer Noel", không chữ cái riêng tiếng Việt. Start `2027-12-27` → W1 end `2028-01-02`, W10 `2028-02-28 – 2028-03-05`, W21 end `2028-05-21`; start `2028-02-29` → W1 end `2028-03-06`, milestone `2028-07-11`; `1999-12-31` đúng. Biên: start `9999-12-31` → ngày `10000-…` (M20-D1) |
| M20-AC2 | PASS (kèm M20-D1) | Service (`m20-r1-template.test.ts`): `createFromQptTemplate` với `gq` → `[1,5,21,5]` hàng, `dirty=1`, `goalId gq`; hook Dexie `creating` ném lỗi ở bảng checkpoint (và riêng ở bảng items) → reject, **0 hàng cả 4 bảng**; `gq` đã liên kết → `ROADMAP_GOAL_ALREADY_LINKED`, số hàng không đổi; 20 lộ trình → `ROADMAP_LIMIT_REACHED`, vẫn 20/100/420/100; ngày `''`, `2026-13-01`, `2026-02-29`, `2026-2-3`, `x` → `ROADMAP_DATE_INVALID`; hai mẫu không goal cùng tồn tại. E2E vi độc lập (`m20-r1-accept.spec.ts` "AC2+AC3+AC4"): trạng thái rỗng (đúng 1 button + link "Tạo lộ trình trống") → "Tạo từ mẫu QPT 21 tuần" → ngày mặc định `2026-11-04` → đổi `2026-10-27`, chọn "QPT study" → `0/21`, 5 phase, W20 "Thi QPT chính thức" `09/03 – 15/03/2027`, `125`, "16 giờ". Dev spec (không goal → giờ `—`; tạo ở en rồi đổi sang vi giữ nội dung en) pass lại trong full e2e |
| M20-AC3 | PASS | `m20-r1-accept.spec.ts` (vi, Q1): bảng 5 hàng đúng thứ tự `Diagnostic, Checkpoint 1, Checkpoint 2, Mock 1, Mock 2`; Diagnostic `24/09/2026` sau khi sửa ngày trong editor; CP1 `W8`; CP2 `≥ 20`; CP2 `18` → "Dưới ngưỡng" `−2` ngay và còn sau `reload`; `21` → "Đạt"; `7,5` → export ghi `7.5`; `33` → alert `ROADMAP_VI.errors.ROADMAP_SCORE_INVALID_range`; xoá ô → "Chưa có điểm". Biểu đồ: 5 cột, 3 vạch ngưỡng, `aria-label` chứa tên/điểm/ngưỡng (`Diagnostic: 5 trên 32`, `Checkpoint 2: 21 trên 32, ngưỡng 20`, `Mock 1: 7,5 trên 32, ngưỡng 24`, `Mock 2: chưa có điểm`). Editor (dev spec test 3 pass + QC): thêm `Mock 3` 12/03/2027 max 32 ngưỡng 28 → đúng thứ tự ngày; sửa max 10 khi điểm 18 → `range`, không lưu; xoá qua D11 + toast; max 100/1000 → `data-scale percent`, cột cao 0,75 / 0,5 |
| M20-AC4 | PASS | `m20-r1-accept.spec.ts` "AC2+AC3+AC4": import `q1-goal-only-backup.json` → mẫu 27/10/2026 + `gq` → W1 bắt đầu 27/10, kết thúc 01/11, Diagnostic 24/09/2026 điểm 5 → `{done '1/21', hours '5,8 giờ', plan 'Kế hoạch đến hết tuần này: 16 giờ', pace 'Đúng tiến độ', days '125', W1 'Sớm 1 ngày · học 6 ngày', tuần '75/480 phút', còn 'Còn 5 ngày', Diagnostic '5'}`. Export (`schemaVersion 2`, `Mock 1` = 7.5) → Import lại → cùng bộ số. Bỏ tick W1 → `0/21`; nhập kết thúc `2026-11-01` → lại đúng bộ số |
| M20-AC5 | PASS | Dev spec `e2e/cloud/m20-template-sync.spec.ts` pass; QC `tests/qc/cloud/m20-r1-sync.spec.ts` (biến thể: tạo ở A bằng vi không goal, thêm `Mock 3` qua editor, CP2 18, Sync now → mock `[1,5,21,6]`, title `QPT 21 tuần`; B Sync now → 21 mục, 6 checkpoint, CP2 18, Mock 3 ngưỡng 28; B (đồng hồ +90 s) sửa CP2 = 21 và xoá Mock 3 → Sync now; A Sync now → CP2 21, còn 5 hàng, tombstone Mock 3 ở mock; 0 lỗi trang; `rec.external()` rỗng, mọi URL ∈ {`localhost:4174`, `127.0.0.1:54321`}). Đồng hồ được tiến giữa các lần ghi; hành vi hoà (ADR-21) không tính là defect |
| M20-AC6 | PASS có điều kiện (còn M20-D1/D2 và U32/U33) | `npm run check` exit 0 (lần chạy thứ hai; lần `vitest` đầu có 1 đỏ chập chờn, M20-D2). Ngân sách, bench, coverage ở §2. E2E 3 project: 841 pass / 23 fail, 0 ca do M20 (§6). Re-target 2 spec QC đã làm (§6, §10). axe (`m20-r1-accept.spec.ts` "AC6 a11y/layout"): chi tiết có checkpoint (điểm 5 và 18) light + dark = 0 serious/critical, dialog mẫu light + dark = 0; quét vi dialog mẫu và bảng checkpoint = 0; 360 px vi: dialog và bảng `scrollWidth ≤ clientWidth`, `x + width ≤ 360`, dialog axe sạch; toast `Đã tạo lộ trình từ mẫu QPT`. README mục "Big goals / Mục tiêu lớn" có: mẫu (32 hàng một transaction, quy tắc ngày/ngôn ngữ), cách tính giờ + chồng khoảng (mỗi ngày vào đúng một mục), "Done ⇔ actual end date (A-81)", backup v2 + file v1 cũ, U31. Handoff `dev-M20.md` §11 có U32, U33, NV-23, NV-24 |

## 4. Defect

### M20-D1 — Ngày bắt đầu mẫu ở cuối năm 9999 ghi ngày không hợp lệ (`10000-…`), xem trước `NaN-NaN-NaN`, Export của chính app không Import lại được  [Major]
- Bước tái hiện: mở `#/roadmaps` (có thể import `e2e/fixtures/q1-goal-only-backup.json` trước) → "Create from QPT 21-week template" → gõ ngày bắt đầu `9999-12-31` (ô `<input type="date">` của Chromium nhận năm 4 chữ số) → quan sát dòng xem trước → "Create roadmap" → xem chi tiết → Settings › Export → chọn chính file vừa xuất ở Import.
- Mong đợi: ngày ngoài miền hợp lệ bị từ chối với `ROADMAP_DATE_INVALID` ngay trong dialog (DESIGN D7 liệt kê lỗi "ngày sai"; form thêm mục thủ công đã từ chối ngày như vậy), hoặc ít nhất mọi hàng ghi ra là ngày ISO hợp lệ; Export → Import luôn khép kín (FR-77).
- Thực tế: xem trước `Week 1: 9999-12-31. Week 20 (QPT exam): NaN-NaN-NaN. The last week ends NaN-NaN-NaN.`; tạo thành công không lỗi; chi tiết hiện `Passed On NaN-NaN-NaN`, `Planned NaN-NaN-NaN – -01-13`, chip "21 items behind"; file Export có `"plannedStart":"10000-02-11","plannedEnd":"10000-02-17"`; Import file đó → Alert "This file doesn't look like a 1% Better backup. Choose a file exported from this app. Nothing was changed." Hậu quả: một lần tạo mẫu với ngày này làm mọi bản sao lưu về sau không khôi phục được cho tới khi xoá lộ trình. Biên: mọi ngày bắt đầu mà tuần 21 (≈ start + 146 ngày) vượt 9999-12-31 (`9999-12-31` → 21/21 mục sai; `9999-06-01` ổn; `0001-01-01` ổn). Service: `createFromQptTemplate({startDate:'9999-12-31'})` trả `ok` và ghi 21 mục với `isValidISODate('10000-01-06') = false`.
- Vị trí nghi ngờ: `src/services/roadmap-service.ts:111-121` (`createFromQptTemplate` chỉ kiểm `isValidISODate(startDate)`, không kiểm ngày dẫn xuất, khác các đường `validate*Input` của form thủ công); `src/domain/roadmap-template.ts` (`qptWeekEnd`/`addDays` trả chuỗi năm 5 chữ số); `src/ui/components/roadmap/TemplateDialog.tsx` (~dòng 111, xem trước dùng `addDays` không kiểm kết quả).
- Test tái hiện (đang `it.fails`/`test.fail` để `check` xanh, sẽ đỏ khi đã sửa → QC lật thành test thường): `tests/qc/m20-r1-template.test.ts` "M20-D1: start 9999-12-31 …"; `tests/qc/m20-r1-accept.spec.ts` "M20-D1: far-future start date …".

### M20-D2 — `TemplateDialog.test.tsx` "errors stay in the dialog …" chập chờn (assert focus quá sớm)  [Minor]
- Bước tái hiện: `npx vitest run src/ui/components/roadmap/TemplateDialog.test.tsx` lặp lại (QC: 3 lần đỏ trong ~14 lần chạy; 1 lần đỏ trong lần `npx vitest run` toàn bộ đầu tiên; `npm run check` lần sau xanh).
- Mong đợi: test xác định để `npm run check` (lệnh DoD) luôn cho cùng kết quả.
- Thực tế: `Expected element with focus: <select …goal…>` nhưng focus đang ở nút "Create roadmap" (`TemplateDialog.test.tsx:113`, `expect(picker).toHaveFocus()` ngay sau `findByText` của thông báo lỗi). Hành vi ứng dụng đúng (focus chuyển vào field lỗi sau khi field hết `disabled`, `TemplateDialog.tsx:48-55`); test không chờ hiệu ứng đó.
- Vị trí nghi ngờ: `src/ui/components/roadmap/TemplateDialog.test.tsx:111-113` (cần `waitFor` quanh assert focus; kiểm tương tự các assert focus ngay sau cho ô ngày).

## 5. Kiểm lại defect vòng trước

| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| M19-D1 (Minor, nhãn mốc 40 ký tự liền cuộn ngang ở 360 px) | **FIXED** (2e9534f) | `tests/qc/m19-r1-accept.spec.ts:342` lật từ `test.fail` sang test thường và pass. Thêm `m20-r1-accept.spec.ts` "M19-D1 + whole-row click": nhãn mốc 40 chữ `M` + tiêu đề 80 chữ `T`, 360 px, en + vi, `#/roadmaps` và `#/roadmaps/rq` → `scrollWidth ≤ clientWidth`. Sửa kèm của dev (≥ 1024 px nửa phải hàng không bấm được): xác nhận cả hàng là link, `elementFromPoint` ở 1 %…99 % bề rộng hàng đều nằm trong `<a>` ở 360/700/1024/1440 px; click chuột ở 3/50/97 % của 1024 và 1440 px đều mở chi tiết |

## 6. Regression

- Full e2e 3 project: **841 pass / 23 fail**. Phân loại:
  - **Do M20: 0.**
  - **20 ca đỏ sẵn trên `main` (QC M17 §6), danh sách và số lượng không đổi** (so `report-M17-r1.md` §6 / `report-M18-r1.md`): `e2e/cloud/m7-sync:25, :165`; `m7-merge:79, :106, :137`; `m7-i18n:48`; `m15-d6-layout:36` ×2; `m14-delete-account:226`; `m8-prompts:242`; `tests/qc/cloud/final2-journey:109` ×4; `m14-r1-explore:282`; `m6-r1-flow:159`; `m6-r1-ui:74` ×2; `m7-r1-ui:233`; `tests/qc/native/m13-r1-native-shell:105`.
  - **Chập chờn theo tải đã biết, 3 ca**: `tests/qc/m11-r1-explore.spec.ts:88`, `tests/qc/m5-r2.spec.ts:26` — xanh khi chạy lại riêng; `tests/qc/cloud/m6-r1-flow.spec.ts:142` — đỏ cả khi chạy riêng, nhưng QC M15 r1/r2 đã ghi nhận đỏ cả trên commit trước M15 (72f3de0), nhạy môi trường (`setOffline` sau `goto`), không liên quan M20.
  - Hai dòng `x` khác trong log (`m10-r2-ui:63`, `m11-r1-explore:235`) là `test.fail` có chủ đích (đỏ như mong đợi), không tính fail.
- Re-target spec QC bị M20 làm lỗi thời (đã đối chiếu DESIGN S11: nút secondary `Create from QPT 21-week template` ở trạng thái rỗng, mockup 11 "trạng thái rỗng 2 lối tạo"):
  - `tests/qc/m17-r1-explore.spec.ts:22`: `getByRole('button')` từ 0 → đúng 1 và là `Create from QPT 21-week template`; `Create empty roadmap` vẫn là link.
  - `tests/qc/m19-r1-accept.spec.ts:343` → test thường (M19-D1 đã sửa).
  - Cả hai pass ở lần chạy lại.
- M17/M18/M19 PASS cũ: `e2e/m17-roadmap-data`, `e2e/m19-roadmap-ui` (9/9), `tests/qc/m19-r1-accept` (11/11), `tests/qc/m17-r1-*`, `m18-r1-*`, cloud sync roadmap đều xanh trong full run; ngân sách thấp hơn M19.
- `fixtures-q1`: dev báo `WRITE_FIXTURES=1 npx vitest run src/test/fixtures-q1.test.ts` không đổi byte 3 fixture Q1; QC không chạy lại (lệnh ghi vào `e2e/fixtures`), `git status` sạch cho thư mục này.

## 7. Bảo mật và test khám phá

**Bảo mật cơ bản:** nội dung mẫu là dữ liệu tĩnh, render dạng text (test M19 chống HTML injection); không secret mới, không biến môi trường mới (`.env.example` không đổi); cloud: mọi request của luồng mẫu/checkpoint chỉ tới {4174, 54321}; không có `.env` bị commit. `npm audit` không chạy (M20 không đổi dependency).

**Quét vi, rule mới của `src/test/i18n-scan.ts` (nhiệm vụ 5):** rule "bỏ qua giá trị `en` bằng **bất kỳ** giá trị `vi` ở key khác" được tính trên toàn bộ resource (chính + namespace `roadmap`, đúng `SCAN_DATA` của e2e). `tests/qc/m20-r1-scan-mask.test.ts` liệt kê các key bị che: hiện chỉ **1**, `roadmap.tpl.languageName = "English"` (trùng `settings.language.option.en`). Không chuỗi chưa dịch thật nào bị che, nên **không nâng thành defect**. Rủi ro tiềm ẩn: key `en` ngắn trong tương lai trùng một giá trị `vi` nào (vd. "OK", "Email", "Goals") sẽ không bị bắt. Rule hẹp hơn: §9. Test QC canh chừng: nếu danh sách bị che khác `['roadmap.tpl.languageName']` thì đỏ để người duyệt xem tay.

**Copy (nhiệm vụ 4):** `tests/qc/m20-r1-copy.test.ts` (tự parse bảng DESIGN §7.9.2, mọi hàng M17 + M19 + M20): mọi giá trị `en`/`vi` của `roadmap.{en,vi}.json` bằng DESIGN nguyên văn, không thiếu key, không key thừa, ≥ 40 hàng M20 có đủ hai ngôn ngữ; nội dung mẫu §7.9.3 khớp (AC1). `src/i18n/roadmap-parity.test.ts` nay là "covers every 7.9.2 row of M17, M19 and M20" (282 en / 268 vi), không còn khẳng định hàng M20 vắng.

**Nhập điểm nhanh (`m20-r1-accept.spec.ts` "exploratory: quick score entry", en và vi, mỗi giá trị: blur → reload):** `7,5` và `7.5` đều lưu 7.5 ở cả hai ngôn ngữ (hiển thị `7.5` ở en, `7,5` ở vi; deviation 10 của dev, chấp nhận); `" 12 "` → 12; `-1`, `1e1`, `+5`, `abc`, `1 2`, `٣`, `１２`, `5,`, `.5` → `range` inline, giá trị cũ giữ sau reload; `7,25`, `0.05`, `1,234` → `precision`; `0` lưu (dưới ngưỡng −20); `32`/`32.0` → 32; rỗng/khoảng trắng → "chưa có điểm". Gõ nhanh `1234567890` + Enter → `range`; `2`,`4` + Enter → lưu 24 (đạt); không bao giờ có `NaN`/`Infinity`/`undefined` trong body.

**Template dialog:** năm nhuận `2028-02-29` → W1 `2028-02-29 – 03-06`, W20 `2028-07-11 – 07-17`; quá khứ `1990-01-01` và tương lai `2099-12-31` tạo được, xem trước cập nhật; ngày rỗng → `Enter a valid date.` dưới ô, dialog ở lại; Esc đóng và trả focus về nút mở; picker không liệt kê goal đã liên kết (A-78); hai mẫu liên tiếp cùng tên "QPT 21 weeks" (§9); **năm 9999: M20-D1**. Tạo mẫu khi `context.setOffline(true)` chạy được, điểm CP2 18 lưu, online + reload còn nguyên.

**Biểu đồ/editor:** tất cả chưa có điểm → 5 cột pending, không `NaN`; max 1000 + điểm 500 → `data-scale percent`, cột 0,5, nhập 1000 hợp lệ, 1001 → `range`; editor từ chối max `10001`, `0`, `-5`, `x`, `1.25`, rỗng (aria-invalid); 50 checkpoint (import mutated) → bảng 50 hàng không cuộn ngang ở 360 px, "Add checkpoint" ở 50 → Alert "A roadmap can have up to 50 checkpoints." và form không mở; xoá checkpoint đã có điểm qua dialog ("can't be undone") → chart về `raw`, reload vẫn đã xoá.

## 8. Chưa kiểm chứng được (NOT VERIFIED)

| ID | Nội dung | Lý do / cách user tự kiểm |
| :- | :- | :- |
| NV-23 | Hai thiết bị thật (máy tính + điện thoại `vi`): nav 5 mục vừa 360 px thật; đồng bộ lộ trình/tick/điểm offline→online; xoá ở một máy; iOS TestFlight mở được Mục tiêu lớn | Cần thiết bị và tài khoản Supabase thật. User làm **U32** (handoff §11) |
| NV-24 | Dữ liệu thật: mẫu QPT 27/10/2026 + goal `7ea38fbe-…` + W1 + Diagnostic khớp tracker cũ (giờ đã học nay lấy từ goal nên có thể khác giờ nhập tay) | Cần dữ liệu thật. User làm **U33** |
| NV-22 | Migration `20261104000000_roadmaps.sql` trên Postgres thật | Không đổi ở M20; thuộc U31 |
| — | `<input type="date">` theo locale OS/trình duyệt thật; font Fraunces/Manrope thật ở chart; screen reader thật (VoiceOver/NVDA) đọc `aria-label` của chart | QC chỉ có Chromium (Playwright) + axe; kiểm tay trên thiết bị thật |

NV-23/NV-24 không làm 6 AC chuyển sang NOT VERIFIED, nhưng chưa tính là PASS thực tế: orchestrator hỏi user U32/U33 sau khi M20 lên Pages.

## 9. Đề xuất (không chặn)

- Quét vi: thay rule "mọi giá trị `vi`" bằng allowlist theo key (vd. `['roadmap:tpl.languageName']`) hoặc nhóm "tên ngôn ngữ", để chuỗi `en` ngắn trùng một giá trị `vi` ở key khác vẫn bị bắt.
- Hai lộ trình tạo từ mẫu cùng tên "QPT 21 weeks" khó phân biệt trong danh sách; cân nhắc gợi ý đổi tên (PRD không bắt buộc).
- Khi sửa M20-D1: validate toàn bộ hàng của mẫu bằng cùng các `validate*Input` ở service (test dev đã làm ở `roadmap-template.test.ts` nhưng service không gọi) hoặc đặt `max` cho ô ngày; kiểm tương tự "Add item gợi ý 7 ngày sau mục cuối" gần biên 9999 (QC chưa thấy hỏng vì lưu đi qua validator).
- 20 ca đỏ sẵn của `main` nên dọn ở một lần nợ kỹ thuật riêng; `m6-r1-flow:142` nên làm bền (chờ điều kiện thay vì thời điểm).

## 10. Thay đổi trong `tests/qc/` và lý do

| File | Thay đổi | Lý do |
| :- | :- | :- |
| `tests/qc/m20-r1-template.test.ts` (mới) | oracle AC1 (tracker HTML + DESIGN §7.9.3), service AC2, `it.fails` cho M20-D1 | độc lập với test của developer |
| `tests/qc/m20-r1-copy.test.ts` (mới) | khớp nguyên văn DESIGN §7.9.2 (M17+M19+M20) với `roadmap.{en,vi}.json` | nhiệm vụ 4 |
| `tests/qc/m20-r1-scan-mask.test.ts` (mới) | liệt kê key bị che bởi rule mới của `i18n-scan.ts`, canh chừng | nhiệm vụ 5 |
| `tests/qc/m20-r1-accept.spec.ts` (mới) | M19-D1 + click cả hàng, AC2–AC4 vi độc lập, nhập điểm nhanh, dialog mẫu khám phá, chart/50-cap/xoá, offline, a11y/360 px, `test.fail` M20-D1 | AC2–AC6, khám phá |
| `tests/qc/cloud/m20-r1-sync.spec.ts` (mới) | AC5 biến thể (vi, thêm/xoá checkpoint, LWW) | AC5 |
| `tests/qc/m19-r1-accept.spec.ts` | `test.fail` M19-D1 → `test` thường | M19-D1 đã sửa |
| `tests/qc/m17-r1-explore.spec.ts` | trạng thái rỗng: 0 button → đúng 1 button "Create from QPT 21-week template" | DESIGN S11 + M20 (2 lối tạo) |

## 11. Câu hỏi mở

- PM/orchestrator: M20-D1 xếp Major vì làm hỏng round-trip backup (dù điều kiện kích hoạt hiếm: ngày bắt đầu ≳ 9999-08). Nếu coi là Minor thì verdict có thể chuyển PASS với M20-D1 và M20-D2 vào backlog; cần quyết định.
- Phạm vi ngày hợp lệ của app là `0001-01-01 … 9999-12-31`; muốn dialog hạn chế hẹp hơn (vd. ± 50 năm quanh hôm nay) hay chỉ chặn tràn năm 10000?
