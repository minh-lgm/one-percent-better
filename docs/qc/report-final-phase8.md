# QC report — Final phase 8 "Big goals / Mục tiêu lớn" (M17 + M18 + M19 + M20, round 1)

**Verdict:** PASS
**Ngày:** 2026-11-05  **Commit:** 9931d9a (`feat/phase8-big-goals`, chưa push; baseline `main` 8b9a1d7)

## 1. Tóm tắt

- **PASS.** 32/32 AC của M17–M20 đạt có bằng chứng tự chạy lại. Không có defect Critical hay Major. 2 defect Minor mới (P8-D1 README, P8-D2 O-1 đi được qua form Goal), cả hai không chặn.
- Clean-room clone đúng README: `npm ci` rồi `npm run check` exit 0 ngay lần đầu (không lặp lại F-D1 của phase 1), `npm run build` và `build:cloud-e2e` exit 0, `npm run test:e2e` 844 pass / 22 fail = 20 đỏ sẵn trên `main` + 2 ca chập chờn theo tải.
- Hành trình hai thiết bị phase 8 (spec mới, 4 biến thể en/vi x 360/1440 px, axe + mock Supabase) 4/4 xanh, chạy 2 lần liên tiếp.
- Ngân sách tải lạnh cả phase **giảm** so với `main`: -1.285 B (cloud tắt) / -1.417 B (cloud bật); ngưỡng cứng 230.000 B đạt, mục tiêu +800 B đạt.
- 20 spec đỏ sẵn: danh sách trùng khớp 100 % với `report-M17-r1.md` §6 và **đỏ y hệt trên worktree `main` 8b9a1d7** (20 failed / 119 passed trên 12 file).
- NOT VERIFIED (cần user): NV-22 (U31), NV-23 (U32), NV-24 (U33), thiết bị thật.

## 2. Môi trường và lệnh đã chạy

Windows 11, Node 22, npm 10, không Docker. Cây chính trừ khi ghi khác.

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Lint | `npm run lint` | exit 0, 0 warning (chạy lại sau khi thêm 3 spec QC: vẫn sạch) |
| Typecheck | `npm run typecheck` | exit 0 |
| Vitest đầy đủ | `npx vitest run` | 212 file, **2.813/2.813** pass (82 s) |
| Check | `npm run check` | exit 0 (lint + typecheck + vitest + `build:e2e`) |
| test:db | `npm run test:db` | skipped (không Docker), exit 0 như mong đợi |
| E2E đầy đủ 3 project | `npm run test:e2e` (nền, 10,5 phút) | **844 pass / 22 fail** (phân loại §6) |
| Coverage | `npx vitest run --coverage` | `src/domain`: statements 99,1 %, branches 96,55 %, functions 100 %, lines 100 % (>= 90 %) |
| Bench NFR-26 | `BENCH_ASSERT=1 vitest run src/domain/roadmap-progress.bench.test.ts` | median **2,3 ms** (min 2,1) cho 200 mục / 50 checkpoint / 5.500 entry (< 50 ms). `npm run bench` (stats): 7,9 ms / 5,3 ms |
| Build prod (env cloud bỏ trống) | `VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= VITE_SUPABASE_ANON_KEY= npm run build` | exit 0; `dist/assets` **không** có `sync-engine-*` hay `supabase-client-*` |
| Build prod mặc định | `npm run build` | exit 0; máy có `.env.local` (cloud bật) nên có `sync-engine-*`, `supabase-client-*` (đúng README: "uses .env.local when present") |
| Build cloud | `npm run build:cloud-e2e` | exit 0; có `sync-engine-*`, `supabase-client-*`, `Roadmaps-*.js/.css`, `roadmap.{en,vi}-*.js`; precache 54 entry |
| Audit | `npm audit --omit=dev` | **0 vulnerabilities** (zod nâng 4.6.5 -> 4.6.7 trong phase) |

## 3. Clean-room theo README

`git clone one-percent-better ../opb-final`, `git checkout feat/phase8-big-goals` (commit 9931d9a, đường dẫn ngắn). Làm theo README từng bước. Thư mục đã xoá (`rm -rf ../opb-final`), cây chính không bị đụng.

| Bước README | Lệnh | Kết quả |
| :- | :- | :- |
| Install | `npm ci` | exit 0, 15 s |
| Configure | `cp .env.example .env.local` (tuỳ chọn; giá trị rỗng = cloud tắt) | OK |
| Install browser | `npm run e2e:install` | exit 0 |
| Check | `npm run check` | **exit 0 lần đầu**, 2 phút (lint, typecheck, vitest 2.813, `build:e2e`) |
| Build | `npm run build` | exit 0 |
| Build cloud-e2e | `npm run build:cloud-e2e` | exit 0 |
| E2E | `npm run test:e2e` | 844 pass / 22 fail = 20 đỏ sẵn + `m5-r2:26` + `cloud/m6-r1-flow:142` (chập chờn đã biết; chạy riêng m5-r2:26 pass 3/3, m6-r1-flow:142 pass 3/3) |

README sai/thiếu/lỗi thời:
- **P8-D1 (Minor):** README dòng 5 vẫn ghi "Current milestone: **M15 — reminders by local notification…**" trong khi nhánh đã có phase 8 (M17–M20). Mục "Big goals" thì đúng và đầy đủ.
- Các bước README còn lại đúng (số bước, lệnh, cổng, kích thước bundle).

## 4. Acceptance criteria (32)

Bằng chứng gốc: Vitest 2.813/2.813 và E2E 844 pass chạy lại hôm nay; spec chính ở cột cuối. "QC" = file trong `tests/qc/`.

| AC | Kết quả | Bằng chứng / spec |
| :- | :- | :- |
| M17-AC1 | PASS | QC `m17-r1-validate.test.ts`, `src/domain/roadmap.test.ts` |
| M17-AC2 | PASS | QC `m17-r1-domain.test.ts` (Q1: W1 270, W2 75, tổng 345; property test 300 lộ trình), `roadmap-progress.test.ts` |
| M17-AC3 | PASS | `roadmap-progress.test.ts`, QC `m17-r1-explore.spec.ts` (1/21, On track, 5.8 h / 16 h, 125) |
| M17-AC4 | PASS | `m17-r1-validate.test.ts` (checkpointState), `roadmap-progress.test.ts` (chartScale) |
| M17-AC5 | PASS | `m17-r1-domain.test.ts` (Dexie v2 -> v3), `roadmap-repo.test.ts`, `migration-v2.test.ts` |
| M17-AC6 | PASS | `m17-r1-validate.test.ts`, `roadmap-service.test.ts`; `e2e/m19-roadmap-ui.spec.ts` |
| M17-AC7 | PASS | `m17-r1-domain.test.ts` (export v2, import v1, A-87), `e2e/m17-roadmap-data.spec.ts`, `m20-qpt-template.spec.ts` (export -> import) |
| M17-AC8 | PASS | `m17-roadmap-data.spec.ts`, `m17-r1-explore.spec.ts` (0 request roadmap lúc tải lạnh; 5 mục nav); ngân sách §7 |
| M17-AC9 | PASS | `roadmap-parity.test.ts`, `m17-roadmap-data.spec.ts` (vi 360 px, axe, quét vi), `final-phase8-journey` (axe + no scroll + quét vi trên list/detail/new) |
| M17-AC10 | PASS (mockup chưa mở bằng trình duyệt) | DESIGN.md có v8.0 (46 lần nhắc) và `nav.roadmaps` en+vi; 4 mockup `11…14-*.html` không có URL http(s) (grep) |
| M18-AC1 | PASS | `sync-store.test.ts`, QC `m18-r1-sync.test.ts` |
| M18-AC2 | PASS | `mapper.roadmap.test.ts`, contract Fake + mock |
| M18-AC3 | PASS | `sync-service.test.ts`, `m18-r1-sync.test.ts`; journey bước `roadmapTables:false` |
| M18-AC4 | PASS | `two-devices.ts` hội tụ + ngẫu nhiên 20 x 200; journey (B tick offline, A thấy 2/21) |
| M18-AC5 | PASS | service gộp/đăng xuất; `m14-delete-account` (trừ :226 đỏ sẵn); `m18-roadmap-sync.spec.ts` |
| M18-AC6 | PASS tĩnh / NOT VERIFIED trên Postgres | §8 và NV-22. `git diff 8b9a1d7` hai migration cũ rỗng; RLS review §8 |
| M18-AC7 | PASS | `e2e/cloud/m18-roadmap-sync.spec.ts`, QC `cloud/m18-r1-demo.spec.ts`, `m18-r2-failed-chunk.spec.ts` |
| M18-AC8 | PASS | check exit 0; 3 project (§6); budget §7; `git grep` §8; README có U31 (dòng 267) |
| M19-AC1 | PASS | QC `m19-r1-accept.spec.ts`, `e2e/m19-roadmap-ui.spec.ts` |
| M19-AC2 | PASS | như trên (M19-AC1/AC2/AC8 en) |
| M19-AC3 | PASS | `m19-r1-accept.spec.ts` "AC3 (vi) online then offline" |
| M19-AC4 | PASS | `m19-roadmap-ui.spec.ts` AC4 (Demo M19) |
| M19-AC5 | PASS | `m19-roadmap-ui.spec.ts`, QC "AC5 stale picker" |
| M19-AC6 | PASS | `m19-roadmap-ui.spec.ts` AC6 (vi) + QC dialog offline |
| M19-AC7 | PASS | `m19-r1-copy.test.ts`, `m9-r1-copy` (đã bỏ lọc `roadmap`) |
| M19-AC8 | PASS | check exit 0; `m19-roadmap-ui.spec.ts:477` lazy chunk; `:454` M19-D1 regression xanh |
| M20-AC1 | PASS | QC `m20-r1-template.test.ts` (oracle từ `qpt-tracker.html`; biên 9999-08-07) |
| M20-AC2 | PASS | `m20-qpt-template.spec.ts` (vi + en), service test (rollback, 0 hàng khi lỗi) |
| M20-AC3 | PASS | QC `m20-r1-accept.spec.ts` (bảng, biểu đồ, ngưỡng, validation, axe light/dark) |
| M20-AC4 | PASS | `m20-qpt-template.spec.ts` Demo M20 (vi): 1/21, 5,8 giờ, 125, W2 75/480 phút, Diagnostic 5; export -> import; **và** `final-phase8-journey` (en + vi) |
| M20-AC5 | PASS | `e2e/cloud/m20-template-sync.spec.ts`, QC `cloud/m20-r1-sync.spec.ts` |
| M20-AC6 | PASS | check exit 0; budget; axe; `m20-r1-scan-mask.test.ts`; README mục Big goals |

## 5. Hành trình cuối phase 8 (spec mới)

File: `tests/qc/cloud/final-phase8-journey.spec.ts` (đặt trong `tests/qc/cloud/` vì project `cloud` chỉ nhận thư mục đó; không phải `tests/qc/final-phase8-journey.spec.ts` như prompt). Project `cloud`, mock Supabase, 3 context (A, B, C). **4/4 pass, 2 lần chạy liên tiếp** (~32-36 s mỗi biến thể): en 360x740, en 1440x900, vi 360x740, vi 1440x900.

1. A: import `q1-goal-only-backup.json` -> tạo từ mẫu QPT (27/10/2026, goal "QPT study") -> W1 thực tế 27/10-01/11 -> Diagnostic 24/09/2026 điểm 5. Số Q1 trên **detail và list**: `1/21`, `5.8 h` / `5,8 giờ` trên kế hoạch 16 h, "On track", 125 ngày, W2 `75/480`, còn 5 ngày, Diagnostic 5 (2026-09-24 / 24/09/2026).
2. A đăng nhập + Sync now: mock có 1/5/21/5 hàng. B đăng nhập + Sync now: **cùng số liệu** trên list và detail.
3. B ngắt mạng, tick W2 (`2/21`), pending > 0; bật mạng, Sync now, pending 0; mock có 2 mục có `actual_end`. A Sync now -> detail và list `2/21`.
4. A xoá goal liên kết; Sync A, B, A. B: lộ trình "chưa liên kết", giờ `—` (`list.row.unlinked`, `hoursNone`), vẫn `2/21`. A cũng "chưa liên kết".
5. B Export (`schemaVersion 2`, 1 lộ trình, 21 mục) -> Import vào context C mới (chưa đăng nhập): C thấy cùng lộ trình (2/21, 21 mục, Diagnostic 5, không goal).
6. `roadmapTables:false`: A tạo goal "Late goal" và tick W3 -> Sync now: goal lên mock, **không** "Sign in again" / `auth-expired`, dòng gợi ý `roadmaps-unavailable` hiện đúng copy, pending > 0 (chỉ hàng roadmap). Bật lại bảng -> Sync now: gợi ý biến mất, **pending 0**; B sync được `3/21`.
7. axe (serious/critical) = 0 + không cuộn ngang + quét vi = 0 trên: danh sách rỗng, danh sách có dữ liệu (A và B), `#/roadmaps/new`, detail (A, B, C). 0 `pageerror` trên A/B/C, 0 request ngoài {app, mock} trên A/B.

Ghi chú về cách test (không phải defect): với đồng hồ đóng băng, sửa trên máy kia ở cùng `updatedAt` thì **hoà** và server giữ hàng cũ (ADR-21). Spec dịch đồng hồ +60/+120/+180 s trước mỗi sửa đổi liên thiết bị, giống `m20-template-sync.spec.ts`.

Spec QC mới khác: `tests/qc/final-phase8-offline.spec.ts` (precache + offline, §7) và `tests/qc/final-phase8-o1.spec.ts` (đo O-1, §9).

## 6. Regression E2E và nhóm đỏ sẵn trên `main`

**Cây chính (HEAD 9931d9a): 844 pass / 22 fail.**

| Nhóm | Số | Chi tiết |
| :- | :- | :- |
| Defect phase 8 | **0** | |
| Đỏ sẵn trên `main` | 20 | Khớp từng dòng với `report-M17-r1.md` §6: `cloud/m7-sync:25, :165`; `m7-merge:79, :106, :137`; `m7-i18n:48`; `m15-d6-layout:36` x2; `m14-delete-account:226`; `m8-prompts:242`; QC `cloud/final2-journey:109` x4; `cloud/m14-r1-explore:282`; `cloud/m6-r1-ui:74` x2; `cloud/m7-r1-ui:233`; `cloud/m6-r1-flow:159`; `native/m13-r1-native-shell:105` |
| Chập chờn theo tải | 2 | `tests/qc/m5-r2.spec.ts:26` và `tests/qc/m11-r1-explore.spec.ts:88`: pass riêng (3/3 mỗi ca). Khi chạy **cùng nhau** trong một lần gọi (m5-r2 là ca CPU x6), `m11-r1-explore:88` đỏ 2/2 và `cloud/m6-r1-flow:142` đỏ 2/3 (pass riêng 3/3): race đọc trước khi % tính xong, không liên quan roadmap |
| Clone sạch | 22 | 20 đỏ sẵn + `m5-r2:26` + `cloud/m6-r1-flow:142` (chập chờn, pass riêng 3/3) |

**Xác nhận đỏ sẵn trên `main`:** `git worktree add ../opb-main 8b9a1d7`, `npm ci`, `e2e:install`, chạy 12 file chứa 20 spec trên project `cloud` + `native-web`: **20 failed / 119 passed**; danh sách (project, file:dòng) **giống hệt** 20 spec đỏ trên nhánh phase 8 (`diff`: IDENTICAL). Worktree đã xoá (`git worktree remove --force`).

## 7. Phi chức năng

**Ngân sách tải lạnh `#/today` (gzip, byte chính xác, ngưỡng cứng 230.000 B, mục tiêu +800 B cho cả phase):**

| | `main` 8b9a1d7 (đo trên worktree) | phase 8 HEAD | Chênh |
| :- | -: | -: | -: |
| Cloud tắt (chromium) | 228.465 B (6 response) | **227.180 B** (5 response) | **-1.285 B** |
| Cloud bật, chưa đăng nhập (cloud) | 229.003 B (8 response) | **227.586 B** (5 response) | **-1.417 B** |

Chi tiết cloud tắt: index JS 198.121 + `core` 18.197 + css 9.860 + `rolldown-runtime` 428 + html 574. Cả hai build ≤ 230.000 (dư 2.820 / 2.414 B). 0 request chứa `roadmap` lúc tải lạnh: pass. `e2e/m10-bundle.spec.ts`, `e2e/cloud/m10-bundle.spec.ts`, `m17-r1-budget` (x2): pass. Build cloud tắt không có chunk `sync-engine`/`supabase-client`; build cloud có `sync-engine` lazy.
- `tests/qc/final-nfr.spec.ts` (giới hạn 250 KB): **pass**.
- Bench NFR-26: 2,3 ms (< 50 ms). Coverage `src/domain` >= 90 %: đạt (§2).

**Precache và offline:** `tests/qc/final-phase8-offline.spec.ts` pass: sau khi SW sẵn sàng chỉ ở `#/today`, `caches` chứa `Roadmaps-*.js`, `Roadmaps-*.css`, `roadmap.en-*.js`, `roadmap.vi-*.js` (42 entry). `sw.js` của build cloud liệt kê thêm `sync-engine-*` và `supabase-client-*`. Offline: import Q1, mở `#/roadmaps/rq`, `setOffline(true)`, reload: detail hiện `1/21`, tiêu đề "QPT 21 tuần", danh sách mở được. (QC `m19-r1-accept` "AC3 vi" còn tick W2 ngoại tuyến.)

## 8. Bảo mật

- Lệnh `git grep -nE "service_role|sb_secret_"` (loại trừ thư mục docs bằng pathspec): chỉ 2 dòng, đều là regex của QC (`tests/qc/m11-r1-open-ended.test.ts:298`, `tests/qc/m14-r1-static.test.ts:30`). 0 secret.
- `.env` không bị commit. File tracked khớp `.env*` chỉ là `.env.example`, `.env.e2e`, `.env.cloud-e2e`, `.env.native-e2e` (cấu hình mode mock); `.env.local` được git bỏ qua. Tôi không đọc nội dung `.env*`.
- RLS tĩnh `supabase/migrations/20261104000000_roadmaps.sql`: 4 bảng `create table if not exists`, `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`, `enable row level security` x4, 3 policy mỗi bảng (select/insert/update) `to authenticated` với `(select auth.uid()) = user_id`, **không `for delete`, không `to anon`**; `drop policy/trigger if exists` trước mỗi `create`; `revoke all ... from anon, authenticated` rồi `grant select, insert, update ... to authenticated`; 4 index kéo. Idempotent trên giấy; **chưa chạy trên Postgres thật** (NV-22).
- `git diff 8b9a1d7` trên hai migration `20261012000000_cloud_sync.sql` và `20261019000000_goal_open_ended.sql`: **rỗng**.
- `npm audit --omit=dev`: 0 vulnerabilities (đóng DEP audit zod của M17).
- Import: zod strict, trần số lượng/độ dài (M17 r1 §7); tiêu đề/ghi chú hiển thị dạng text (QC `m19-r1-accept`, `m17-r1-explore`). Không endpoint hay quyền mới ngoài 4 bảng có RLS.

## 9. Defect

### P8-D1 — README "Current milestone" lỗi thời  [Minor]
- Bước tái hiện: mở `README.md` dòng 5.
- Mong đợi: phản ánh trạng thái hiện tại (phase 8 / M17–M20, "Big goals").
- Thực tế: "Current milestone: **M15 — reminders by local notification, privacy manifest, App Store listing**…".
- Vị trí: `README.md:5`. Owner: developer (README).

### P8-D2 — O-1 đi được qua form Goal, không chỉ qua import  [Minor, có sẵn trên `main`]
- Bước tái hiện: `tests/qc/final-phase8-o1.spec.ts` (cùng file chạy trên `main` 8b9a1d7 và trên nhánh; biến môi trường `O1_FIXTURE=sample-backup.json O1_EXTRA=1 O1_WALK=/today,/goals,/review,/goals/x1,/goals/x2,/goals/x3`). (a) Goals > New goal, tên, daily 20, Start date = 0001-01-01, Save: **form chấp nhận**, không alert, về `#/goals` (cả `main` lẫn nhánh). (b) Import backup có mục tiêu mở start 0001-01-01 + 1 entry cùng ngày + các goal biên khác, đi lần lượt `/today, /goals, /review, /goals/x1, /goals/x2, /goals/x3` rồi mở `/goals/x4`.
- Mong đợi: Goal detail mở trong < 1 s như các route khác.
- Thực tế: **trên `main` 8b9a1d7: tiêu đề hiện sau 33.173 ms, luồng chính bận 57.002 ms. Trên nhánh phase 8: 33.901 ms / 57.105 ms** (không đổi). Mở `/goals/x4` ngay sau import, hoặc sau từng route riêng lẻ, chỉ mất 0,4-0,5 s: chỉ lặp lại sau cả chuỗi route trên (nghi vòng lặp theo ngày ~740 nghìn ngày trong GoalDetail/stats).
- Phán quyết: **có sẵn trước phase 8, không phải regression**. Nâng từ "chỉ tạo được qua import" (ghi chú M20 r2) thành "tạo được bằng form". Backlog, không chặn.

Defect Critical/Major: không.

## 10. Chưa kiểm chứng được (NOT VERIFIED)

| ID | Nội dung | Cách user tự kiểm |
| :- | :- | :- |
| NV-22 (U31) | Migration `20261104000000_roadmaps.sql` trên Postgres thật (tạo bảng, RLS, chạy 2 lần, bảng cũ nguyên vẹn); `test:db` skipped vì không Docker | README bước **U31** (dòng 267): SQL Editor, chạy 2 lần, kiểm 4 bảng RLS + 3 policy mỗi bảng + 4 trigger |
| NV-23 (U32) | Hai thiết bị thật (máy tính + điện thoại `vi`): tạo/tick/xoá đồng bộ qua project thật; 5 mục nav vừa 360 px thật; iOS mở được `#/roadmaps`; trạng thái `linkState = missing` (goal xoá ở máy khác) chỉ có component test | `docs/handoff/dev-M20.md` §11 (U32, 5 bước) |
| NV-24 (U33) | Dữ liệu thật: lộ trình QPT từ mẫu (27/10/2026) + W1 + Diagnostic + goal `7ea38fbe-…`; bỏ tracker HTML | `docs/handoff/dev-M20.md` §11 (U33) |
| Thiết bị thật | iOS Safari / Android / app native; `<input type="date">` theo OS; thẩm mỹ; screen reader đọc `aria-label` biểu đồ; mockup v8.0 mở bằng trình duyệt | kiểm tay |
| `final2-journey:229` | dòng `schemaVersion 2` (đã re-target) chưa chạy tới vì spec đỏ sẵn trước đó | khi 20 spec đỏ được sửa |

`docs/handoff/dev-M20.md` §11 có đủ U32, U33, NV-23, NV-24 (đã xác nhận). U31 nằm ở README dòng 267 và `dev-M18.md`.

## 11. Mục mang sang (carry-over) và phân loại

| # | Mục | Phân loại | Owner | Chặn? |
| :- | :- | :- | :- | :- |
| 1 | Chip khi thiếu bảng: TASKS Demo/DESIGN ghi "Synced", hành vi (và ARCH §4.8 h) là "N changes waiting to sync"; README:232 đã đúng hành vi; journey + `m18-roadmap-sync` xác nhận | Sửa tài liệu | planner (TASKS Demo M18) + designer (DESIGN) | Không |
| 2 | 404 không mã trên bảng roadmap coi là `tableMissing` (lenient hơn ARCH) | Chấp nhận, ghi vào ARCH | planner (ADR-52) | Không |
| 3 | `--surface-glass` .92 -> .97 (light và dark) | Sửa tài liệu | designer (token trong DESIGN) | Không |
| 4 | 2 deviation M17: 4 key D3 nằm trong namespace `roadmap`; `ui/roadmap-errors.ts` thay cho tham số `scope` | Sửa tài liệu | planner/designer (ARCH §4.8 j, DESIGN 7.9.1) | Không |
| 5 | Chữ AC "không đổi assertion" (M18-AC3, DoD): dev đổi 2 assertion đếm pull và 2 chờ thời gian ở `sync-service.test.ts` (+ `roadmap-repo.test.ts:209`) | Sửa tài liệu | planner (đổi chữ AC, thêm vào bảng test cũ bị ảnh hưởng) | Không |
| 6 | O-1 (xem P8-D2): đo trên `main` = 57 s, có sẵn, form Goal cho phép start 0001-01-01 | Backlog (Minor) | developer: chặn start quá xa ở form/import hoặc tối ưu vòng lặp ngày | Không |
| 7 | O-2 `addDays('0001-01-01', -1)` trả `0001-12-31` thay vì lỗi (không crash) | Backlog (Minor) | developer | Không |
| 8 | 20 spec đỏ sẵn (contrast D4/D6, 7 fixture trôi lịch, 1 token status bar, 1 token hết hạn) | Backlog đã có (task riêng của user) | designer chốt token; developer `freezeClock` + sửa màu | Không |
| 9 | `m11-r1-explore:88`, `cloud/m6-r1-flow:142`, `m5-r2:26` chập chờn khi chạy cùng nhau | Backlog (test) | QC | Không |
| 10 | P8-D1 README dòng 5 | Defect Minor | developer | Không |

Không mục nào chặn: không có bằng chứng mới ngoài việc P8-D2 xác nhận O-1 đã có sẵn.

## 12. Dòng backlog phase 8 trong `docs/STATUS.md` có thể đóng

| Dòng | Lý do đóng |
| :- | :- |
| M17-D1 (ngân sách tải lạnh) | Cuối phase -1.285 B / -1.417 B so `main` (ngưỡng 230.000, mục tiêu +800 B) |
| M18-D2 (ESLint chỉ chặn import tĩnh) | FIXED, xác nhận ở M18 r2 |
| M18-D3 (README chip "Synced") | FIXED: README:224 và :232 nay ghi "N changes waiting", rồi "Synced" sau migration. Phần còn lại là "M18 doc-mismatch" (mục 11.1) |
| M19-D1 (nhãn mốc 40 ký tự cuộn ngang 360 px) | FIXED; `m19-roadmap-ui.spec.ts:454` regression xanh |
| DEP audit zod | zod 4.6.7, `npm audit --omit=dev` 0 |
| PRE-M17 QC specs, phần `m9-r1-copy` đang lọc `roadmap` | M19 đã bỏ lọc; xanh |

Giữ mở: PRE-M17 a11y và fixtures (20 đỏ), `m13-r1:105`, `m6-r1-flow:159`, `final2-journey:229` NOT VERIFIED, M18 doc-mismatch, M19 NOT VERIFIED `linkState = missing` (U32), M19 test flaky (`m11-r1-explore:88`, vẫn tái hiện khi chạy cùng m5-r2), O-1 (cập nhật: đo trên `main`, form Goal cho phép), O-2, thêm P8-D1.

## 13. File QC thêm

- `tests/qc/cloud/final-phase8-journey.spec.ts` (hành trình, 4 biến thể)
- `tests/qc/final-phase8-offline.spec.ts` (precache + offline)
- `tests/qc/final-phase8-o1.spec.ts` (đo O-1; biến môi trường `O1_FIXTURE`, `O1_EXTRA`, `O1_WALK`; chạy được cả trên `main` với `O1_FIXTURE=sample-backup.json`)
