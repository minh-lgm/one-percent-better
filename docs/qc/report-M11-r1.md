# QC report — M11 round 1

**Verdict:** PASS (0 Critical, 0 Major mở; 1 Minor mới M11-D1). Ba mục NOT VERIFIED (NV-9, NV-10, NV-11) như kế hoạch dự kiến; **không deploy trước khi user làm U12.**
**Ngày:** 2026-10-19  **Commit:** `825628d` (HEAD; base trước M11 `2a632ca`). Working tree chỉ khác ở `docs/**` của orchestrator/designer/planner và `tests/qc/**` của QC.

## 1. Tóm tắt

- **14/14 AC PASS** với phần kiểm được trên máy này. AC8 PASS ở phần tĩnh (SQL đọc tay + test tĩnh), phần Postgres thật là NV-9; AC6/AC7 chỉ thiếu thiết bị thật (NV-10); AC9/AC11 chỉ thiếu điện thoại thật (NV-11). Không AC nào FAIL hay BLOCKED.
- Tôi tự chạy lại toàn bộ: lint 0, typecheck 0, `npm run check` exit 0, Vitest **123 file / 1.812 pass + 3 expected-fail**, Playwright đầy đủ (chromium + cloud, workers 8) **711 pass, 0 fail** (8,2 phút; 2 `test.fail` có chủ đích là M10-D6 và M11-D1), bench 13/13 (đều < 200 ms), coverage `src/domain` 100 % dòng, tải lạnh `#/today` **224,2 kB** (cloud tắt, 5 response) và **224,9 kB** (cloud bật, 8 response), ngưỡng 230 kB.
- **Re-target `tests/qc/**` xong, lý do đúng như handoff:** (1) `m10-r2-dates.test.ts`: `endDate: null` nay hợp lệ cho goal `daily` (FR-20 v4.0); (2) `m4-r1-domain.test.ts`, `m5-r1-domain.test.ts`: chỉ lỗi kiểu do `Goal.endDate: ISODate | null`. **Developer có thể bỏ 2 dòng exclude tạm trong `tsconfig.app.json` ngay**: tôi chạy `tsc -p` với cấu hình không có exclude (include `src`, `tests/qc/**/*.test.ts(x)`, `tests/db/**`) và được exit 0.
- **Defect mới: 1 Minor (M11-D1).** Goal không thời hạn không có giới hạn lùi về quá khứ (A-49), nên ngày bắt đầu gõ nhầm (ví dụ năm `0026` khi gõ "26" vào ô ngày) làm Goal detail đứng ~20 s, và năm < ~1830 cho "Ideal +∞%". Có workaround (Goals → Edit sửa ngày), không mất dữ liệu.
- **E2E chập chờn mà handoff nêu (không thuộc M11):** xác nhận. Cả hai lần chạy đầy đủ của tôi đều xanh. `tests/qc/cloud/m7-r1-converge.spec.ts` (test của QC) đọc `.amount`/danh sách một lần ngay sau Save/Sync, đỏ ổn định khi chạy riêng, cả trên commit gốc `2a632ca` (worktree sạch: 3 fail/8 lần 1, 4 fail/8 lần 2) lẫn HEAD (2–3 fail/8). Đây là lỗi thiết kế test của QC, không phải app; đã sửa bằng `expect.poll` (8/8 x3 sau sửa).

## 2. Môi trường và lệnh đã chạy

Windows 11, Node v22.14.0, npm 10.9.2, Playwright Chromium (`PLAYWRIGHT_BROWSERS_PATH=0`), không Docker; cloud dùng mock Supabase; `.env.local` không mở.

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Lint | `npm run lint` | exit 0 (cả sau khi thêm file QC) |
| Typecheck | `npm run typecheck` | exit 0 (có exclude tạm); không exclude: `tsc -p` cấu hình tạm (đã xoá) exit 0 |
| Vitest, trước khi re-target | `npm test` | 121 file, **1.651 pass / 1 fail**: đúng một test đỏ `m10-r2-dates` "non-string dates … do not throw" |
| Vitest, sau khi re-target + test QC mới | `npx vitest run --coverage` | **123 file, 1.812 pass + 3 expected-fail** (probe M11-D1), 0 fail; domain 100 % dòng (statements 99,55 %, branches 96,62 %, functions 100 %) |
| Check | `npm run check` | **exit 0** (lint, typecheck, test, `build:e2e`) |
| Playwright #1 (HEAD dev, trước file QC mới) | `npm run test:e2e` | **697 pass, 0 fail** (6,7 phút); 1 `test.fail` M10-D6 hiện "x" nhưng tính pass |
| Playwright #2 (sau khi thêm/sửa file QC) | `npm run test:e2e` | **711 pass, 0 fail** (8,2 phút); "x" = M10-D6 và M11-D1 (`test.fail`) |
| Chập chờn mà handoff nêu, chạy riêng | `playwright test --project=cloud tests/qc/cloud/m7-r1-converge.spec.ts e2e/cloud/m7-sync.spec.ts tests/qc/cloud/final2-journey.spec.ts` x2 | `m7-sync` M7-AC9 và `final2-journey` (4 biến thể, gồm vi-VN 360 px) **pass cả 2 lần**; `m7-r1-converge` đỏ 2/8 (500/503 hoặc 429) ổn định, nguyên nhân là test (mục 5) |
| Baseline `2a632ca` | worktree sạch + junction `node_modules` (đã gỡ), `playwright test --project=cloud tests/qc/cloud/m7-r1-converge.spec.ts` x2 | đỏ 3/8 và 4/8, **không phải do M11** |
| `m7-r1-converge` sau sửa | cùng lệnh, 3 lần | **8/8 x3** |
| Bench | `npm run bench` | 6×goalStats in-memory **6,1 ms**; goal không hạn 3.650 ngày (curve + stats) **4,5 ms**; fake-indexeddb 93,3 ms; model Review 10,5 ms; 13/13 pass |
| Build prod | `npm run build` | exit 0 |
| Tải lạnh `#/today` | `e2e/m10-bundle.spec.ts`, `e2e/cloud/m10-bundle.spec.ts`, `tests/qc/final-nfr.spec.ts`, `final2-cloudoff-nfr.spec.ts` (đọc số in ra) | cloud tắt: `/` 0,6 + css 7,1 + `dates` 9,4 + `useFormat` 6,9 + `index` 200,2 = **224,2 kB**; cloud bật chưa đăng nhập: `/` 0,6 + `types` 0,1 + `constants` 0,1 + `preload-helper` 0,8 + css 7,1 + `useFormat` 6,9 + `dates` 9,4 + `index` 199,8 = **224,9 kB**; không Recharts/SDK; 0 request tới mock. Trước M11: 222,6 kB |
| `test:db` | `npm run test:db` | "skipped" (không Docker), exit 0, tức NV-9 |
| Bảo mật | `npm audit --omit=dev`; `git grep -nE "service_role|sb_secret_" -- . ":!docs"`; `git ls-files ".env*"` | 0 vulnerabilities; 0 dòng; `.env.cloud-e2e`, `.env.e2e`, `.env.example` |
| Exploration | `tests/qc/m11-r1-explore.spec.ts` (14 test), `m11-r1-open-ended.test.ts` (155 test), `m11-r1-probe.test.ts` (6, 3 expected-fail) | tất cả như kỳ vọng (mục 3, 4) |

## 3. Acceptance criteria

| AC | Kết quả | Bằng chứng (tôi tự chạy) |
| :- | :- | :- |
| M11-AC1 validate | **PASS** | `goal.test.ts` (dev) pass trong 1.812; QC `m11-r1-open-ended.test.ts` lưới 2 loại x 4 start x 6 end (form = file = hàng cloud): `daily`/`total` với `null`, `''`, `2026-02-30` đúng spec; `total`+`null` bị từ chối. `tests/qc/m1-domain.test.ts` pass không sửa; `errors.GOAL_PERIOD_INVALID_openEndedTotal` có ở `en`/`vi` (so với DESIGN: khớp nguyên văn). |
| M11-AC2 trạng thái/thống kê | **PASS** | Oracle độc lập (UTC, brute force, không dùng code `src/domain`) 4 ngày hôm nay x 25 seed (gồm 2028-02-29, 2031-10-02, goal sắp bắt đầu, goal bắt đầu 2.500 ngày trước): `goalStatus` không bao giờ `ended`, `elapsedDays`, `totalTarget`, `pace`, `progressPercent`, `outsideYear`, streak, entry date (`DATE_OUTSIDE_GOAL_PERIOD` có `end: null`, `DATE_IN_FUTURE` thắng khi ngày > hôm nay), heatmap (`outside` chỉ trước `startDate`): 100 ca pass. `groupGoals` với O1 sau 6 năm: ở `active`, không ở `ended`. |
| M11-AC3 đường cong | **PASS** | Oracle QC: `periodDays = elapsed`, `ideal`/`actual` đúng độ dài, điểm cuối = hôm nay, không điểm tương lai, headline khớp phép chia trực tiếp; goal upcoming rỗng, 0; dev `curve.test.ts` O1 từng số pass. Bench 4,5 ms. |
| M11-AC4 service/repo | **PASS** | QC trên fake-indexeddb: create, hàng thô có key `endDate` = `null`; sửa xuống ngày trước entry thì `GOAL_PERIOD_EXCLUDES_ENTRIES` và `endDate` vẫn `null`; sang ngày hợp lệ ok; về `null` ok; dời `startDate` sau entry bị từ chối; entry start / hôm nay ok, trước start và ngày mai bị từ chối (key lỗi `errors.DATE_OUTSIDE_GOAL_PERIOD_openEnded`); đồng hồ 2031 vẫn ghi được. |
| M11-AC5 backup | **PASS** | E2E QC: import `sample-backup.json` rồi Export: `schemaVersion 1`, mọi goal có `endDate` chuỗi y như file gốc, không có `"endDate": null`. Import file `total`+`null`, thiếu key `endDate`, entry ngày mai, entry trước `startDate`: Alert, không mở D3, dữ liệu cũ nguyên. E2E dev: export O1 có `"endDate": null`. |
| M11-AC6 đồng bộ | **PASS** (NV-10 thiết bị thật) | `mapper.test.ts`, hợp đồng Fake + mock, `limits-parity` pass; QC lưới tương đương (form = file = `goalRowSchema` cho mọi tổ hợp, trừ chênh lệch **có sẵn từ M6**: hàng cloud không giới hạn 1.827 ngày cho goal có hạn, không phải M11); `sync-convergence` 20 seed; `e2e/cloud/m11-open-ended.spec.ts` pass cả hai lần chạy đầy đủ. |
| M11-AC7 thiết bị bản cũ | **PASS** (NV-10) | `sync-service.test.ts` "pull cursor reset once" + `sync-convergence.test.ts` (B `legacyMapper` rồi nâng cấp) pass trong lần chạy đầy đủ; tôi đọc code `resetPullCursorOnce` khớp ADR-33 (một `kv.update`, chỉ khi có kv `sync`, giữ `cursor.entries`). |
| M11-AC8 SQL | **PASS** tĩnh / **NOT VERIFIED** Postgres thật (NV-9) | File tồn tại; `git diff 2a632ca -- supabase/migrations/20261012000000_cloud_sync.sql` rỗng và sha256 (LF) khớp bản `2a632ca`; `cloud-migration.test.ts` 14/14. QC thêm: toàn file chỉ có đúng 6 câu lệnh (drop not null, khối `do`, 2 drop constraint if exists, 2 add constraint) trên `public.goals`; không `grant`/`revoke`/`anon`/`policy`/`trigger`/`row level security`/`delete`/`truncate`/`update`/`insert`/`security definer`/`create function`/`service_role`; khối `do` dùng `format('%I')`, chỉ chạm check constraint của `public.goals` có `end_date >= start_date` và loại trừ hai tên mới (chạy lần hai sạch). Đọc tay: ràng buộc M6 gốc là `check (end_date >= start_date)` cấp bảng (tên `goals_check`), khớp mẫu `ilike`. `test:db` skipped. |
| M11-AC9 form | **PASS** (NV-11 điện thoại thật) | E2E dev (3 radio, bàn phím, Total hours khoá + `aria-describedby`, về "This year" + `role=status`, sửa goal không hạn và có hạn) pass. QC thêm: sửa goal có hạn sang không hạn, rồi ngày quá sớm bị từ chối với Alert, dữ liệu không đổi, khôi phục: hàng Goals giống hệt ban đầu; sửa O1 sang Total hours: Ends "This year", lưu ra `2026-10-01 – 2026-12-31`; sửa goal bắt đầu 2024 sang Total hours: "This year" = 2024-12-31 loại entry 2026, Alert, goal giữ nguyên (không bao giờ `total`+`null`). Axe 0 serious/critical ở 360 px en/vi cả hai trạng thái. |
| M11-AC10 hiển thị | **PASS** | E2E dev pass (Goals, Goal detail, Review, Day, 2031). QC thêm: goal không hạn bắt đầu tương lai ở nhóm Upcoming "from 2026-11-01, no end date", không ở Today, Goal detail không có thẻ biểu đồ, không `Infinity`/`NaN`; Day 2026-10-10 và 2026-09-30 không liệt kê O1, 2026-10-03 có; ghi thêm 30 phút hôm nay: `30/10`, Progress `94.4%`; Review "All goals" với S1+O1 và chọn O1 (ghi chú `progressNoteOpen`, phụ đề `55 of 90 min expected so far`), chọn goal có hạn không hiện ghi chú biến thể. |
| M11-AC11 song ngữ/a11y/360 px | **PASS** (NV-11) | `parity`, `design-copy` pass; QC so 12 key mới của DESIGN v4.0 với `en.json`/`vi.json` bằng script độc lập: 12/12 khớp nguyên văn cả hai ngôn ngữ. Form 360x740 en/vi (radio "No end date", Total hours khoá + ghi chú): không cuộn ngang, nhóm Ends trong khung, axe sạch, quét vi 0 phát hiện; xem ảnh chụp bằng mắt: nhãn một dòng, mô tả 3 dòng thụt lề đúng DESIGN. Bàn phím: ở Total hours, mũi tên không chọn radio khoá. |
| M11-AC12 không regression | **PASS** | `npm run check` exit 0; Playwright 2 project 711/711; tải lạnh 224,2 / 224,9 kB <= 230.000; coverage domain 100 %; 0 request ngoài origin (spec chromium), cloud chỉ {4174, 54321}; secret grep 0; `.env*` như M10; `migration-v2.test.ts`, `e2e/m7-migration.spec.ts`, `tests/qc/m7-r1-migration.*` pass không sửa. Test dev đã đổi: tôi rà `git diff 2a632ca..HEAD`, chỉ bổ sung, trừ bench `stats-service.test.ts` (đổi nhãn log "5x" thành "6x", tách `fixtureGoals`, giữ nguyên mọi assert cũ trên fixture, thêm goal 3.650 ngày, đúng handoff mục 7.1) và `fake-remote-store.ts`/`two-devices.ts` (hạ tầng test). |
| M11-AC13 tài liệu | **PASS** | README: mục Goals mới, Backup (ghi `"endDate": null`, file mới bị app cũ từ chối), Import (`null` chỉ cho `daily`), Review (mẫu số tới hôm nay), Account & sync (migration trước deploy, khôi phục `dirty = 2`, rollback), U12. Đã kiểm hướng dẫn khôi phục: `GoalService.update` luôn ghi `dirty = 1` nên "Save changes" thật sự đẩy lại. Handoff đủ mục (task, số đo, test đã đổi, danh sách `tests/qc` cần re-target, NV-9 đến NV-11, nhắc U12). |
| M11-AC14 DESIGN v4.0 | **PASS** | Changelog v4.0 có đủ (1) đến (9); `goal.form.endsNever` `en` "No end date" / `vi` "Không có thời hạn"; quy tắc Total hours (khoá + ghi chú luôn hiện + về "This year" + thông báo SR, A-D52/D53); `goals.rowDailyOpen`; `goal.detail.subDayOpen`, `chartSummaryOpen`/`EmptyOpen`, bỏ Range, upcoming không thẻ biểu đồ (A-D55/A-D58); `stat.progressSubOpen`, `review.progressNoteOpen`; `errors.GOAL_PERIOD_INVALID_openEndedTotal`, `errors.DATE_OUTSIDE_GOAL_PERIOD_openEnded`; §8.2 a11y; mỗi key có `en` và `vi`. |

Tổng: **14 PASS** (AC8 chỉ phần tĩnh; NV-9/10/11 ở mục 8), 0 FAIL, 0 BLOCKED.

## 4. Defect

### M11-D1 — Goal không thời hạn có ngày bắt đầu rất xa (gõ nhầm năm) làm Goal detail đứng nhiều giây, năm < ~1830 hiện "+∞%"  [Minor]

- Bước tái hiện (dùng đúng Import hoặc form như app):
  1. Import file O1 (`e2e/fixtures/o1-open-ended-backup.json`) đã sửa `goals[0].startDate = "0026-10-01"` và dời entry đầu về cùng ngày; hoặc tạo bằng form: New goal, Minutes per day 10, Start date `0026-10-01` (Chrome cho ra năm 0026 khi người dùng chỉ gõ "26"), Ends = "No end date", Save. Đồng hồ 2026-10-09.
  2. Mở `#/goals/o1` (hoặc bấm tên goal ở Goals).
  3. Đo thời gian tới khi biểu đồ hiện.
- Mong đợi: màn hình dùng được trong vài giây như goal 3.650 ngày (NFR-01; bench M11-AC3); không số vô nghĩa. Trước M11 mọi goal bị chặn 1.827 ngày nên không xảy ra.
- Thực tế (`tests/qc/m11-r1-explore.spec.ts` test "start 0026-10-01", `m11-r1-probe.test.ts`): `ideal` ~740.000 điểm (`curve()` domain 0,5 s nhưng Recharts làm tab đứng): biểu đồ hiện sau **~20 s** (start 0026), **~14 s** (1000-01-01), 2,2 s (1800-01-01), 0,8 s (1926). Với start năm <= 1830: `idealFactor = Infinity`, Goal detail ghi "The ideal line is +∞%." và biểu đồ/trục hỏng (`curveYScale` trả domain `NaN`; ảnh chụp: khung biểu đồ gần trống, nhãn trục "Jan 1, Jul 1, Jul 1…"). Năm 1926: nhãn trục Y là số hơn 60 chữ số. Today, Goals, Review không bị ảnh hưởng (30–400 ms); sửa ngày bằng Goals → Edit vẫn dùng được; không mất dữ liệu.
- Vị trí nghi ngờ: `src/domain/goal.ts` `validateGoalInput` (không giới hạn `startDate` khi `endDate = null`, theo A-49); `src/domain/curve.ts` dòng 105-115 (`periodDays` = số ngày tới hôm nay, mảng `ideal` cấp đủ), `growth`/`curveYScale` (không chặn `Infinity`). Gốc là quyết định sản phẩm A-49 ("không giới hạn"), cần planner/user quyết định (chặn `startDate` lùi quá N năm cho goal không hạn, hoặc cắt số điểm vẽ). Không chặn milestone.

## 5. Kiểm lại defect vòng trước

Vòng đầu của M11: không có defect cũ. M10-D6 (Minor, ngoài phạm vi M11) vẫn mở, test `m10-r2-ui` M10-D6 vẫn `test.fail`, hành vi không đổi.

Việc sửa test QC (không phải defect của app):
- `tests/qc/m10-r2-dates.test.ts`: bỏ `null` khỏi vòng giá trị sai kiểu của `endDate` (giữ cho `startDate`); thêm 2 test: `endDate: null` của goal `daily` được nhận; `total` + `null` thì `IMPORT_INVALID_SCHEMA` key `errors.IMPORT_INVALID_SCHEMA_outOfRange`, thiếu key `endDate` thì key chung.
- `tests/qc/m4-r1-domain.test.ts`, `m5-r1-domain.test.ts`: thêm helper `endOf(goal)` (ném nếu `null`: oracle chỉ mô hình goal có hạn). Không đổi ý nghĩa.
- `tests/qc/cloud/m7-r1-converge.spec.ts`: 10 chỗ `expect(await amount(...))` và 6 chỗ `expect(await goalNames(...))` chuyển sang `expect.poll`, vì các phép đọc đó chạy một lần ngay sau Save/Sync (lỗi thiết kế test của QC từ M7; liên quan M10-P1).

## 6. Regression

M1–M10: toàn bộ spec cũ (`e2e/**`, `tests/qc/**`) pass không sửa assertion trong lần chạy đầy đủ (711/711), kể cả `migration-v2`, `m7-migration`, `final-journey`, `final2-journey` (4 biến thể), `m10-bundle`, NFR-03, hành trình cloud. Goal có hạn: DOM và giá trị không đổi (S1, R1 test cũ pass; export sample-backup giữ nguyên chuỗi `endDate`).

## 7. Bảo mật

- Migration: chỉ `ALTER TABLE public.goals` (nới NOT NULL, hai check); không đụng RLS, policy, grant, trigger, dữ liệu; không `anon`, không `for delete`; khối `do` không nối chuỗi (`format('%I')`).
- Biên đầu vào: `endDate` `null`/thiếu/`total`+`null`/ngày không có thật đều bị từ chối ở form, importer, mapper và (mô phỏng) mock `23514`; entry ngày tương lai hoặc trước `startDate` bị từ chối ở importer và service.
- Dữ liệu cloud thù địch: mapper bỏ hàng `total`+NULL, đếm `skippedInvalid`.
- Secret: `git grep` 0; `.env*` tracked chỉ gồm 3 file mẫu; `npm audit --omit=dev` 0 lỗ hổng; 0 request ngoài origin/mock.
- Hằng `OPEN_END_QUERY_MAX` (`9999-12-31`) chỉ là biên truy vấn trong bộ nhớ (grep source: chỉ `stats-service.ts`, `constants.ts`); test dev khẳng định không ghi vào storage.

## 8. Chưa kiểm chứng được (NOT VERIFIED)

| ID | Nội dung | Vì sao | Cách user tự kiểm |
| :- | :- | :- | :- |
| NV-9 (AC8) | Migration trên Postgres thật: tên ràng buộc M6 thực tế, chạy hai lần, dữ liệu cũ còn, `total` NULL cho 23514 | Không Docker, `test:db` skipped | **U12**: export backup; SQL Editor chạy file; chạy lại lần hai; `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.goals'::regclass and contype = 'c';` phải có `goals_period_check`, `goals_open_ended_daily_check`, không còn check cũ; `end_date` nullable; số hàng không đổi. **Phải xong trước khi push/deploy.** |
| NV-10 (AC6, AC7) | Hai thiết bị thật, thiết bị còn bản cũ gặp hàng NULL rồi cập nhật; hàng NULL lên/xuống cloud thật | Chỉ có mock/Fake | **U13 (1)(2)** sau deploy |
| NV-11 (AC9, AC11) | Form trên điện thoại thật (iOS/Android, `vi`) | Không có thiết bị thật | **U13 (3)** |

Hiển thị chỉ kiểm bằng Chromium (axe, ảnh chụp 360 px); không kiểm Safari/Firefox.

## 9. Đề xuất (không chặn)

- Xoá hai dòng exclude tạm (`tests/qc/m4-r1-domain.test.ts`, `m5-r1-domain.test.ts`) trong `tsconfig.app.json`: đã xác minh không còn lỗi kiểu.
- Quyết định M11-D1 ở mức sản phẩm (giới hạn lùi của `startDate` cho goal không hạn hoặc giới hạn số điểm vẽ); OQ-D21 của designer (Ideal `1.01^k` quá lớn với goal chạy lâu) cùng họ vấn đề.
- Handoff nói `npm run check` đỏ do `npm test`; sau re-target đã exit 0.
- `tests/qc/m11-r1-probe.test.ts` (`it.fails`) và test `test.fail` M11-D1 trong `m11-r1-explore.spec.ts` sẽ báo "unexpected pass" khi M11-D1 được sửa; lúc đó bỏ marker.
