# QC report — M19 round 1

**Verdict:** PASS
**Ngày:** 2026-11-04  **Commit:** 0c8ea7a (HEAD của developer; commit M19: 0388487, 4a3ad35, 20240ef, 3a4d7ae)

## 1. Tóm tắt

M19 đạt cả 8 AC với bằng chứng tự chạy. Không có defect Critical/Major. Có 1 defect Minor (M19-D1: nhãn mốc 40 ký tự liền không dấu cách gây cuộn ngang ở 360 px trên danh sách và tổng quan chi tiết). Build/lint/typecheck/Vitest (2.746 test) sạch, `npm run check` exit 0. Ngân sách tải lạnh khớp số của developer (227.162 / 227.571 B, trần 230.000). E2E 3 project: 816 pass / 22 fail, trong đó 20 là danh sách đỏ sẵn của M17 (không đổi), 2 còn lại là flaky đã biết (xem §6). Không có chuỗi hay CSS M19 nào trên đường tải lạnh.

Không kiểm được: NV-23 (thiết bị thật, U32); trạng thái `linkState = missing` (goal bị xoá ở máy khác) chỉ kiểm bằng component test của developer vì UI không tạo được trạng thái này (xoá goal qua app gỡ liên kết theo FR-80, đúng thiết kế).

## 2. Môi trường và lệnh đã chạy

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Lint | `npm run lint` | 0 lỗi |
| Typecheck | `npm run typecheck` | 0 lỗi |
| Unit/component | `npx vitest run` | 203 file / 2.739 test pass (trước khi thêm test QC) |
| Check (sau khi thêm test QC) | `npm run check` | exit 0; Vitest 204 file / 2.746 test pass; `build:e2e` ok |
| Bench NFR-26 | `npx cross-env BENCH_ASSERT=1 vitest run src/domain/roadmap-progress.bench.test.ts --reporter=verbose` | pass; median 3,4 ms (min 2,3 ms) cho 200 mục / 50 checkpoint / 5.500 entry, ngưỡng 50 ms |
| E2E đủ 3 project | `npm run test:e2e` (nền, 9,8 phút) | 816 pass / 22 fail (phân loại §6) |
| E2E dev M19 + 2 spec flaky chạy riêng | `--project=chromium tests/qc/m11-r1-explore.spec.ts:88 tests/qc/m5-r2.spec.ts:26 e2e/m19-roadmap-ui.spec.ts` | 11 pass, 1 fail (`m11-r1-explore:88`, xem §6) |
| E2E QC M19 | `--project=chromium tests/qc/m19-r1-accept.spec.ts` | 11 pass (gồm 1 `test.fail` có chủ đích cho M19-D1) |
| Ngân sách cloud tắt | `--project=chromium e2e/m10-bundle.spec.ts tests/qc/m17-r1-budget.spec.ts` | 3/3 pass; `BUDGET-EXACT chromium TOTAL 227162 responses 5` |
| Ngân sách cloud bật | `--project=cloud e2e/cloud/m10-bundle.spec.ts tests/qc/cloud/m17-r1-budget.spec.ts` | 4/4 pass; `BUDGET-EXACT cloud TOTAL 227571 responses 5` |
| Copy | `npx vitest run tests/qc/m9-r1-copy.test.ts tests/qc/m19-r1-copy.test.ts` | 33 + 7 pass |

Ngân sách chi tiết (gzip, bytes):

| Bản | html | runtime | css | core | index | Tổng | Δ vs M18 r2 | Δ vs baseline M17 (229.454 / 229.658) | Còn tới 230.000 |
| :- | -: | -: | -: | -: | -: | -: | -: | -: | -: |
| cloud tắt | 574 | 428 | 9.860 | 18.178 | 198.122 | **227.162** | +435 | −2.292 | 2.838 |
| cloud bật | 588 | 428 | 9.874 | 18.179 | 198.502 | **227.571** | +417 | −2.087 | 2.429 |

Mục tiêu phase "≤ +800 B so baseline M17" đạt (tổng thấp hơn baseline). Chuỗi/CSS M19 (`Roadmap items, in order`, `rd-strip`, `Save details`, `How study time is counted`, `Create empty roadmap`, `re-sub`, `rd-it`) chỉ nằm trong `roadmap.en-*.js` và `Roadmaps-*.js` / `Roadmaps-*.css` (grep trên `dist/assets`); cold load chỉ 5 response (html, css, runtime, core, index), spec `m10-bundle` có marker kiểm. Bốn màn (danh sách, chi tiết, new, editor) cùng nằm trong một chunk lazy `Roadmaps-*.js` (đúng deviation 3).

## 3. Acceptance criteria

| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M19-AC1 | PASS | `tests/qc/m19-r1-accept.spec.ts` "AC1/AC2 oracle": Q1 `1/21`, "On track", `5.8 h`, `16 h`, `125`; dải 21 `listitem` trong `list` có tên; ô 1 `done`, ô 2 `data-current`, 0 ô overdue; bấm ô 15 → `wq15` focus + trong viewport; thẻ tuần này chứa W2, `75/480`, `5 days`. Q1b (UI: xoá ngày kết thúc W1) → "1 week behind" class `warn`, ô 1 overdue; clock 2026-11-10 → "2 weeks behind" class `crit`; Q1d (10-26) → Not started + thẻ `notStarted`: spec của dev `e2e/m19-roadmap-ui.spec.ts` test 2 (chạy lại, pass). `gap`: component `RoadmapDetail.test.tsx` (pass trong 2.739). Tổng quan hiện sau điều hướng: assertion < 1 s trong spec dev (pass); dev báo 208–227 ms |
| M19-AC2 | PASS | Q1: 5 phase, `Done 1/4` + `Course 1 · 34h`; W1 "Early by 1 day · studied 6 days" `4.5 h`; W2 `1.3 h`; W3 `0 h`; ghi chú lộ trình 7 dòng (dev spec). Goal archived (tạo bằng UI): `5.8 h` + ghi chú archived (QC spec "AC2 archived"). Q1e (goal missing): `—` + câu + nút relink chỉ kiểm bằng component test dev (UI không tạo được trạng thái này), xem §8. Xoá goal bằng app → lộ trình hiện "No goal linked", `—` mọi mục, nút "Link a goal" (QC spec). Ghi chú/tiêu đề chứa `<b>x</b>` hiện nguyên văn; payload `<img src=x onerror=...>` đặt vào ghi chú mục, ghi chú lộ trình và tiêu đề mục: không có `<img>`/`<b>` trong `main`, cờ `window.__pwn` không đổi sau reload (QC spec) |
| M19-AC3 | PASS | QC spec "AC3 (vi)" chạy online rồi `context.setOffline(true)` + reload: tick W2 → `2/21`, kết thúc `2026-11-04`, "Sớm 5 ngày", không "học"; bỏ tick → `1/21`, hết nhãn; W3 "Hôm nay" → "Đang học", W3 `0,5 giờ`, W2 `0,8 giờ`, tổng `5,8 giờ`; kết thúc W3 `2026-11-05` → `role=alert` = `ROADMAP_VI.errors.DATE_IN_FUTURE` ("Ngày thực tế không được sau hôm nay."), khác chuỗi `VI.errors.DATE_IN_FUTURE` của resource chính (đã assert `not.toBe`), vẫn `1/21`; ghi chú "sai dấu" còn sau reload. Đo < 100 ms: dev spec `[M19 tick] 2/21 after 23–52 ms` (đo trong trang bằng `performance.now()` + MutationObserver), pass khi tôi chạy lại |
| M19-AC4 | PASS | Dev spec test 4 (chạy lại pass) bao Demo M19 đủ: Spanish B1, picker goal, 5 h, Exam 2027-06-01, phase Grammar, ba khoảng `2026-11-04 – 11-10`, `11-11 – 11-17`, `11-18 – 11-24`, Enter x2 đưa mục 3 lên đầu (focus ở lại nút, reload giữ), chuyển phase, xoá phase 2 mục (Cancel không đổi, Confirm xoá cả hai), xoá lộ trình → danh sách rỗng; lỗi tiêu đề rỗng + focus, `order`, `ROADMAP_TARGET_INVALID`. QC bổ sung: form `/new` tiêu đề rỗng + target 0.3 → focus Title, `aria-invalid`, lỗi `ROADMAP_TARGET_INVALID`; tiêu đề 81 ký tự → lỗi inline, 80 ký tự lưu được; nút "up" của mục đầu và "down" của mục cuối `aria-disabled=true`; xoá mục "tuần này" (W2) → chi tiết còn 20 ô và thẻ tuần này vẫn hiện; 20 phase / 200 mục (backup dựng bằng script): `Add phase` → `ROADMAP_LIMIT_REACHED_phase` (20), `Add item` → `ROADMAP_LIMIT_REACHED_item` (200); chi tiết 200 mục hiện 200 ô sau 123 ms |
| M19-AC5 | PASS | Dev spec test 5: picker `rq` = `[No goal, Marathon prep, Old course, QPT study, Spanish]`, không có goal archived hay goal của lộ trình khác; đổi sang Spanish → `0 h`; bỏ liên kết → `—`; `?focus=goal` focus picker. QC "AC5 stale picker" (hai tab cùng IndexedDB): tab 2 tạo Plan B gắn Read và xoá Spanish; tab 1 (picker cũ) chọn Read → lưu → `This goal is already linked to "Plan B"` + `aria-invalid`; chọn Spanish → `roadmap:errors.GOAL_NOT_FOUND` (chuỗi namespace). Service không cho tạo double link dù picker đọc một lần |
| M19-AC6 | PASS | Dev spec test 6 (vi): `#/goals/gq` "Thuộc lộ trình QPT 21 tuần", link → `#/roadmaps/rq`; dialog xoá nêu "QPT 21 tuần"; sau xác nhận `rq` hiện "Chưa liên kết mục tiêu"; `g1` không có dòng và không có `confirm-note`. QC: dialog xoá khi **offline** (SW đã cache) vẫn mở, có `confirm-note` cho `gq` (1) và không có cho `g1`. Spec cũ M5/M11/M1/M2 pass không sửa trong lần chạy 3 project |
| M19-AC7 | PASS | Parity + copy: `tests/qc/m19-r1-copy.test.ts` (mới, tự parse bảng DESIGN 7.9.2): mọi hàng M17 + M19 của `roadmap.en/vi.json` khớp nguyên văn, không thiếu key, không key thừa (ngoại lệ `importLine`, `importLineKept`: M17 đã chấp nhận); 2 key FR-80 ở `en.json`/`vi.json` khớp 7.9.1; `m9-r1-copy` bỏ lọc `roadmap` vẫn xanh. Quét vi = 0 trên `/roadmaps`, `/roadmaps/rq`, `/edit`, `/new`, `/goals/gq` ở 360x740; không cuộn ngang ở 5 màn này (dữ liệu bình thường); mọi `button/input/select/textarea/a` trong `main` có tên truy cập (đã mở hết vùng "Ngày & ghi chú"); nút Hôm nay có tên nêu mục (dev spec). Axe 0 serious/critical: chi tiết Q1 light + dark (QC), chi tiết Q1b (dev), `/new` light + dark (QC), editor dark (QC, 360 vi), editor light + form mục (dev) |
| M19-AC8 | PASS | `npm run check` exit 0; ngân sách 227.162 / 227.571 ≤ 230.000, −2.292 / −2.087 so M17; bench 3,4 ms; tổng quan hiện < 1 s (assert trong dev spec, pass); E2E 3 project: không còn lỗi do M19 (§6) |

## 4. Defect

### M19-D1 — Nhãn mốc 40 ký tự liền (không dấu cách) làm trang cuộn ngang ở 360 px, ở danh sách và tổng quan chi tiết  [Minor]
- Bước tái hiện: viewport 360x740; có một lộ trình với `milestoneLabel` = 40 ký tự `M` liền nhau (tối đa cho phép, `ROADMAP_MILESTONE_LABEL_MAX`; nhập qua editor hoặc import). Mở `#/roadmaps`, rồi `#/roadmaps/<id>`. Tái hiện tự động: `tests/qc/m19-r1-accept.spec.ts` test "M19-D1" (đánh dấu `test.fail`).
- Mong đợi: M19-AC7 và DESIGN §8.4: không cuộn ngang ở 360 px; chuỗi dài do người dùng nhập phải xuống dòng.
- Thực tế: `/roadmaps`: `scrollWidth 525 > clientWidth 360`, phần tử `span[data-testid=roadmap-milestone]`; `/roadmaps/rq`: `scrollWidth 644 > 360`, ô `div[data-testid=metric-milestone] > .eyebrow` (scrollWidth 456 trong ô rộng 156). Các trường dài khác (tiêu đề lộ trình 80 liền, ghi chú lộ trình 2.000 liền, tiêu đề phase 80, ghi chú phase 120, tiêu đề mục 200, ghi chú mục 1.000) không gây cuộn ngang; editor cũng không cuộn.
- Vị trí nghi ngờ: CSS của `.rm-stats` / `roadmap-milestone` (`src/ui/styles/roadmaps.css`, M17) và `.rd-m .eyebrow` (`src/ui/styles/roadmap-screens.css`); thiếu `overflow-wrap: anywhere` / `min-width: 0` cho nhãn mốc. Không chặn: nhãn thực tế thường có dấu cách và khi đó xuống dòng bình thường (đã kiểm với "Mm Mm ..." 39 ký tự).

## 5. Kiểm lại defect vòng trước

Không có (vòng 1).

## 6. Regression và phân loại E2E đầy đủ

`npm run test:e2e` (chromium + cloud + native-web, 9,8 phút): **816 pass / 22 fail**.

- **20 spec đỏ sẵn từ M17 r1 §6: danh sách không đổi**, đối chiếu từng dòng: `cloud/m14-delete-account:226`, `m15-d6-layout:36` x2, `m7-i18n:48`, `m7-merge:79/106/137`, `m7-sync:25/165`, `m8-prompts:242`, `qc/cloud/final2-journey:109` x4, `qc/cloud/m14-r1-explore:282`, `m6-r1-flow:159`, `m6-r1-ui:74` x2, `m7-r1-ui:233`, `qc/native/m13-r1-native-shell:105`. Không tính là defect M19.
- 2 spec còn lại, đều trong danh sách flaky đã biết: `tests/qc/m5-r2.spec.ts:26` (chạy lại riêng: pass); `tests/qc/m11-r1-explore.spec.ts:88`: chạy riêng lần 1 fail, lần 2 và 3 pass; với `--repeat-each=8` fail một phần (nhận `-14.6%` thay vì `-100.0%` trong `toHaveText(before)`). Nguyên nhân là chính test đọc `textContent` của hàng goal (`before`) khi số liệu tiến độ chưa tính xong (race trong spec, không dính roadmap; M19 chỉ gọi `loadRoadmapService` khi mở dialog xoá). Không quy cho M19; gợi ý ở §9. Chưa đối chiếu trên baseline c17500c (không dựng worktree).
- Regression milestone cũ: spec M1/M2/M5/M10/M11/M17 (`e2e/m17-roadmap-data.spec.ts`, `tests/qc/m17-r1-explore.spec.ts:140` thấy `Roadmaps-*.js`) pass trong lần chạy 3 project; Vitest `tests/qc/**` (M17, M18) xanh.

## 7. Bảo mật

- XSS: payload `<img onerror>` ở 3 chỗ nhập (ghi chú mục, ghi chú lộ trình, tiêu đề mục) hiện nguyên văn, không thực thi.
- Validate ở biên: tiêu đề 81 ký tự bị từ chối; target 0.3 bị từ chối; giới hạn 20 phase / 200 mục có kiểm.
- Double link: service chặn `ROADMAP_GOAL_ALREADY_LINKED` ngay cả khi picker cũ (hai tab).
- Không đọc `.env`; không biến môi trường mới. `npm audit` không chạy vòng này (M19 không thêm dependency theo handoff; chưa đối chiếu diff `package.json` bằng lệnh).

## 8. Chưa kiểm chứng được (NOT VERIFIED)

- NV-23 (U32): hai thiết bị thật, tick offline rồi đồng bộ; cần user làm sau khi deploy.
- `linkState = missing` (goal bị xoá ở máy khác) ở mức trình duyệt: UI không tạo được trạng thái này. Bằng chứng duy nhất là component test của developer (`RoadmapDetail.test.tsx`: Q1e → `—` mọi mục, "The linked goal was deleted.", link `/roadmaps/rq/edit?focus=goal`). User tự kiểm: máy A xoá goal, máy B Sync now.
- Hiển thị trên thiết bị thật (iOS Safari): chưa kiểm; chỉ có Chromium headless 360x740.

## 9. Đề xuất (không chặn)

- Ở D2 (Goals và Goal detail), `await loadRoadmapService()` chạy trước khi mở dialog. Offline và chunk đã cache: dialog vẫn mở có ghi chú (đã kiểm); chunk thất bại: mở không có ghi chú (đúng ý). Nếu request chunk treo mà không lỗi, dialog có thể đợi lâu; cân nhắc timeout ngắn. Chưa tái hiện được, không phải defect.
- "Part of roadmap" và picker đọc một lần, không live: chấp nhận được nhờ service kiểm lại khi lưu (đã kiểm).
- `tests/qc/m11-r1-explore.spec.ts:88` nên chờ số liệu hàng goal ổn định trước khi lấy `before` (flaky cả khi máy không tải); QC sẽ re-target.

## Thay đổi trong `tests/qc/` (và lý do)

- `tests/qc/m9-r1-copy.test.ts`: bỏ dòng lọc `/roadmap/i` (theo yêu cầu). Vẫn xanh (33).
- `tests/qc/m19-r1-copy.test.ts` (mới): tự parse DESIGN 7.9.2 và so khớp nguyên văn với `roadmap.{en,vi}.json`, cộng 2 key FR-80.
- `tests/qc/m19-r1-accept.spec.ts` (mới, 11 test, chromium): oracle Q1 + axe light/dark, goal archived / xoá goal + XSS, AC3 vi online + offline, giới hạn editor, validation `/new`, picker stale, dialog xoá offline, quét vi + 360 px + tên truy cập + axe dark, exploratory, chuỗi dài, và `test.fail` cho M19-D1.
