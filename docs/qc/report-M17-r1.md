# QC report — M17 round 1

**Verdict:** PASS (phạm vi M17, kèm điều kiện: xem mục 1, 6 và 10)
**Ngày:** 2026-11-04  **Commit:** 55a7744 (developer: 3c0db19 feat(M17), b0d6751 test(M17)); baseline 167324e

## 1. Tóm tắt

- M17 đạt AC1…AC10 về phần do M17 gây ra: domain, Dexie v3, backup v2, nav 5 mục, danh sách `#/roadmaps`, lazy namespace, copy, parity. Tôi tự chạy lại lint, typecheck, vitest toàn bộ (2.604 pass / 0 fail sau khi re-target 12 file `tests/qc/**` và thêm test mới), bench NFR-26, 3 project e2e (790 pass / 21 fail) và đo ngân sách cold-load bằng số byte chính xác.
- **Không có defect Critical/Major do M17 gây ra.** Một defect Minor: tăng ngân sách tải lạnh vượt mục tiêu +600 B (M17-D1: +989 B cloud tắt, +655 B cloud bật; cả hai vẫn ≤ 230.000 B, headroom còn 546 B / 342 B).
- Điều kiện của verdict: M17-AC9 có vế "`npm run test:e2e` pass cả 3 project". Vế này **chưa đạt** vì 20 spec đỏ sẵn trên `main` 167324e (đã kiểm trên worktree baseline: đúng 20 spec đó đỏ y hệt, không do M17) cộng 1 spec flaky khi chạy chung. Theo chỉ đạo của orchestrator tôi không tính chúng là defect M17, xếp riêng ở mục 6 với owner đề xuất. Trong đó có một lỗi sản phẩm thật (axe `color-contrast` serious ở D4/D6, token v7), nên **cần quyết định của orchestrator/user trước khi deploy**. Nếu coi AC9 là cổng cứng thì verdict đổi thành FAIL cho tới khi nhóm này xanh.
- `NOT VERIFIED`: hiển thị trên thiết bị thật (iOS/Android), screen reader thật, đánh giá thẩm mỹ bằng mắt (chỉ có Playwright headless: DOM, axe, kích thước, vài ảnh chụp).

## 2. Môi trường và lệnh đã chạy

Windows 11, Node 22, Playwright chromium headless (`npm run test:e2e` đặt `PLAYWRIGHT_BROWSERS_PATH=0`). Cây git sạch trừ `tests/qc/**` và `docs/qc/**`.

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Lint | `npm run lint` | exit 0, 0 warning (cả sau khi thêm file QC) |
| Typecheck | `npm run typecheck` | exit 0 |
| Unit trước re-target | `npx vitest run` | 2.586 pass / 4 fail / 2.590 (4 fail đều là `tests/qc/**` lỗi thời: m3-r1-domain x2, m10-r1-import-variant, m9-r1-copy) |
| Unit sau re-target + test QC mới | `npx vitest run` | **191 file, 2.604 pass, 0 fail** (58 s) |
| Bench NFR-26 | `npx cross-env BENCH_ASSERT=1 vitest run src/domain/roadmap-progress.bench.test.ts --reporter=verbose` | pass; lần chạy chung với e2e nền: median 5,3 ms (min 2,5 ms); dev báo 2,0 ms. Cả hai rất xa ngưỡng 50 ms |
| Ngân sách cloud tắt | `npm run test:e2e -- --project=chromium e2e/m10-bundle.spec.ts tests/qc/m10-r1-bundle.spec.ts` | 2 pass; 229,5 kB / 5 response |
| Ngân sách cloud bật | `npm run test:e2e -- --project=cloud e2e/cloud/m10-bundle.spec.ts` | pass; 229,7 kB / 5 response |
| Byte chính xác | `tests/qc/m17-r1-budget.spec.ts`, `tests/qc/cloud/m17-r1-budget.spec.ts` (chạy trên M17 và trên baseline 167324e) | bảng ở M17-D1 |
| E2E đầy đủ | `npm run test:e2e` (3 project) | **790 pass / 21 fail** (7,9 phút) |
| Phân loại 21 fail | chạy lại đúng các spec đó trên worktree 167324e (`git worktree add ../opb-baseline 167324e`, đã gỡ sau đó) | 20/21 đỏ y hệt trên baseline (mục 6); 1/21 (`tests/qc/cloud/m7-r1-probe.spec.ts:359`) xanh khi chạy riêng 2 lần và khi chạy cả file (16/16), tức flaky khi tải nặng |
| Probe ESLint lazy | `echo "import ... from '../../domain/roadmap-progress'" | npx eslint --stdin --stdin-filename src/ui/screens/Today.tsx` (và `services/roadmap-service`, `resources/roadmap.vi.json`, `./Roadmaps`; thêm `src/app/container.ts`) | cả 5 báo `no-restricted-imports` (ADR-53); `import type` không báo |
| `npm audit --omit=dev` | | 1 high: `zod < 4.6.6` (GHSA-mrhx-c7xc-m3w5), có từ trước M17 (`package.json` và lockfile không đổi) |

## 3. Acceptance criteria

"Dev test" nghĩa là tôi tự chạy test của developer (đều pass trong lần `vitest run` đầy đủ), kèm test QC độc lập khi có.

| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M17-AC1 | PASS | `tests/qc/m17-r1-validate.test.ts` (QC): tiêu đề `'  '` → `ROADMAP_TITLE_REQUIRED` field `title`; 81 ký tự → `ROADMAP_TEXT_TOO_LONG` `max 80`; `plannedEnd < plannedStart` → `variant 'order'`; 367 ngày → `itemTooLong`, 365 và 366 ngày (năm nhuận) ok; `actualEnd 2026-11-05` → `DATE_IN_FUTURE`; `actualEnd < actualStart` → `order` field `actualEnd`; `2026-02-30` → `format`; chỉ tiêu 0,25/168,5/7,3/0/-1/NaN → `ROADMAP_TARGET_INVALID`, 8 giờ → 480, 0,5 và 168 ok; `maxScore 0` → `max`, `score 33` → `range`, 7,25 → `precision`, 7,5/0/32 ok; `positionBetween` 0 / 1,5 / -1 / 4. Roadmap thứ 21 qua service: `ROADMAP_LIMIT_REACHED kind roadmap max 20`, xoá một cái thì tạo lại được (QC). Phase thứ 21: dev test `roadmap.test.ts` |
| M17-AC2 | PASS | `tests/qc/m17-r1-domain.test.ts`: từ chính fixture `q1-roadmap-backup.json` (tính tay: 50+60+90+120+45+30 = 395 phút goal) W1 **270**, W2 **75**, W3 0, tổng **345**; entry 10-20 không thuộc mục nào. Property test QC 300 lộ trình ngẫu nhiên có seed so với bản tham chiếu duyệt từng ngày (ưu tiên explicit, rồi bắt đầu muộn hơn, rồi `ord` trước): khớp từng mục, tổng mục = tổng. `linkState missing` → `hoursDoneMinutes null`, mọi `itemMinutes null`. `m17-r1-format.test.ts`: `f.hours(345)` = `5.8 h` / `5,8 giờ`; `hoursShort(345/270/75/960/0/4500)` = `5.8 h / 4.5 h / 1.3 h / 16 h / 0 h / 75 h`, vi `5,8 / 4,5 / 1,3 / 16 giờ`. Q1b/Q1c, cửa sổ rỗng, `archived`: dev test pass |
| M17-AC3 | PASS | QC: Q1 `doneCount 1`, `itemCount 21`, `plannedMinutesToDate 960`, `pace.kind onTrack`, `milestoneDays 125`, `linkState linked`. UI (QC e2e `m17-r1-explore.spec.ts`, 360x740 và 1440x900 en): `Done 1/21`, `On track`, `Studied 5.8 h of 16 h`, `Thi QPT: 125 days left`. Ca Q1b `overdue`, Q1d `notStarted` 134 ngày, 2027-03-09/10/23, khe `gap`, `weekBased false`, `empty`: dev test pass, chưa viết lại độc lập |
| M17-AC4 | PASS | QC `m17-r1-validate`: `checkpointState` → `recorded`; `pending`; 18/20 → `below -2`; 20 → `pass 0`; 21 → `pass`. `chartScale raw/percent` và thứ tự `(date, createdAt, id)`: dev test |
| M17-AC5 | PASS | QC `m17-r1-domain.test.ts` "Dexie v2 to v3": DB Dexie v1+v2 có goal, entry, kv `locale` → mở bằng `AppDatabase`: `verno 3`, `backendDB().version 30`, dữ liệu cũ nguyên vẹn, 4 bảng mới rỗng. A-79 độc lập: `goalService.remove('gq')` → `rq.goalId null`, `updatedAt` mới hơn, `dirty 1`, không xoá mềm, 21 mục còn sống, goal thành tombstone. Xoá dây chuyền / probe rollback / `clearUserData` / `countLive` / `purgeTombstones` / `watchPendingCount`: dev test `roadmap-repo.test.ts`, `migration-v3.test.ts` pass. E2E dev `m17-roadmap-data.spec.ts` (xoá goal ở UI → "No goal linked") pass trong lần chạy đầy đủ |
| M17-AC6 | PASS | QC `m17-r1-validate` (service qua `container.loadRoadmapService()`): link goal ok; roadmap thứ hai link cùng goal → `ROADMAP_GOAL_ALREADY_LINKED` `params.title 'One'`; goal `'nope'` → `GOAL_NOT_FOUND`. `setItemDone`, `moveItem` một lần ghi, 30 lần đánh lại vị trí trong một `putMany`, `watchDetail` < 100 ms: chỉ có dev test `roadmap-service.test.ts` (pass), chưa viết lại độc lập |
| M17-AC7 | PASS | QC `m17-r1-domain.test.ts`: fixture Q1 parse ra 6/29 và 1/5/21/5; export sau import Q1 là `schemaVersion 2`, 4 mảng 1/5/21/5, không có `"deletedAt"`/`"dirty"`, re-import round-trip trùng từng mảng; v1 `sample-backup.json` parse ok; **A-87**: import Q1 rồi import v1 → 5 goal sống, `rq` còn, `rq.goalId null`, 21 mục còn; lỗi toàn vẹn (mục trỏ phase lạ, checkpoint trỏ roadmap lạ, hai roadmap cùng `goalId`, `goalId` không có trong file) → `IMPORT_INTEGRITY`; tiêu đề mục 201 ký tự → `IMPORT_INVALID_SCHEMA` `outOfRange`; khoá lạ trong hàng mục → `IMPORT_INVALID_SCHEMA`; `schemaVersion 3` → `IMPORT_UNSUPPORTED_VERSION` `v '3'`; 13 biến thể sai kiểu/biên (target 7,5/-1/'480', ngày 2026-02-30, `plannedEnd` < start, `actualEnd` tương lai, score 33/7,25, `maxScore 0`, mảng null, object thay mảng, tiêu đề rỗng/81 ký tự) bị từ chối, không ném; 21 roadmap / 21 phase → `outOfRange`; file > 5 MiB bị từ chối; khoá `__proto__` không ô nhiễm prototype. File lỗi parse → 4 bảng + goal không đổi. QC e2e: file 5 MiB+, file khoá lạ, v3 qua input thật → không dialog, không crash, dữ liệu giữ nguyên. `v1-backup-with-roadmap-keys.json` và FR-51 đăng nhập: dev test/e2e pass |
| M17-AC8 | PASS (kèm M17-D1 Minor) | Nav: `.nav .item` = 5, thứ tự Today / Goals / **Big goals** / Review / Settings ở 360 (tab bar), 1024 (sidebar); mục thứ 3 có `aria-current="page"` ở `#/roadmaps`. Lazy: QC `m17-r1-explore.spec.ts` ghi request lúc tải lạnh `#/today` + `networkidle`: 0 request chứa `roadmap`; bấm tab Big goals → có `Roadmaps-*.js` và `roadmap.en-*.js`. Ngân sách: không có chunk roadmap trong cold load; số byte ở M17-D1. ESLint chặn import tĩnh (mục 2). Offline reload: e2e dev `m17-roadmap-data` pass. Component test `Roadmaps` (en/vi/Q1e/rỗng) pass. Trạng thái rỗng: câu giải thích, không nút (QC e2e) |
| M17-AC9 | PASS với ngoại lệ (mục 6, 10) | Parity namespace + resource chính, key khớp DESIGN, `error-messages.test.ts`: dev test pass. QC e2e 360x740 `vi`: tab bar cao 65 px (64 + viền 1), `scrollWidth 360 = clientWidth 360`, 5 nhãn nằm trong ô 72 px (`Mục tiêu lớn` rộng 67,7 px, 1 dòng, không bị cắt), không cuộn ngang; danh sách vi `5,8 giờ`/`16 giờ`, 125, `1/21`, quét vi = 0; axe `#/roadmaps` sáng + tối, 360 và 1440, en + vi = 0 serious/critical; axe `color-contrast` riêng cho `.nav` trên Today/Goals/Review/Settings ở dark = 0 vi phạm (với `--surface-glass` alpha .97). `npm run check` (lint + typecheck + vitest) xanh sau re-target. **Vế "`npm run test:e2e` pass cả 3 project" không đạt**: 20 đỏ trước M17 + 1 flaky. Coverage `src/domain` >= 90 %: không chạy riêng. Bench ở mục 2 |
| M17-AC10 | PASS | DESIGN v8.0 có Changelog v8.0; §3.1 `nav.roadmaps` en `Big goals` / vi `Mục tiêu lớn`; bảng 7.9.1 và 7.9.2; §7.9.0 ghi sẵn phương án chuyển 4 key sang namespace (đúng cái developer dùng). `roadmap.{en,vi}.json` so với DESIGN 7.9.2: dev test `roadmap-parity.test.ts` pass; tôi đọc `roadmap.en.json` và đối chiếu thủ công cấu trúc/nhóm key, khớp. Mockup mở offline: không kiểm (thuộc designer) |

## 4. Defect

### M17-D1 — Tăng ngân sách tải lạnh vượt mục tiêu +600 B  [Minor]

- Bước tái hiện: `npm run test:e2e -- --project=chromium --project=cloud tests/qc/m17-r1-budget.spec.ts tests/qc/cloud/m17-r1-budget.spec.ts` trên HEAD, rồi cùng lệnh trên worktree `167324e` (chép hai spec vào). Số byte gzip level 9 của các response `#/today`:

| Bản | Baseline 167324e | M17 (55a7744) | Tăng | Còn tới 230.000 |
| :- | :- | :- | :- | :- |
| cloud tắt | **228.465** B (6 response) | **229.454** B (5 response: html 573, rolldown-runtime 428, css 9.828, core 18.104, index 200.521) | **+989 B** | 546 B |
| cloud bật | **229.003** B (8 response) | **229.658** B (5 response: html 587, rolldown-runtime 428, css 9.843, core 18.105, index 200.695) | **+655 B** | 342 B |

  (Developer báo 229.448 / 229.658; chênh 6 B ở cloud tắt do cách đo.)
- Mong đợi: TASKS M17-AC8 / PRD NFR-25: <= 230.000 B là ngưỡng cứng; +600 B là mục tiêu M17, +800 B cho cả phase.
- Thực tế: ngưỡng cứng đạt ở cả hai bản. Mục tiêu +600 B vượt 389 B (cloud tắt) và 55 B (cloud bật). **Mới xong 1/4 milestone mà cloud tắt đã dùng 989 B so với mục tiêu 800 B cả phase; headroom cứng cloud bật còn 342 B.** Theo wording kế hoạch v8.1 đây không FAIL (Minor); handoff đã có bảng byte và phương án giảm (§8).
- Vị trí nghi ngờ: nhóm chunk `core` mới ở `vite.config.ts` (+400 B so với không chia, theo handoff) và `rolldown-runtime` 428 B tách riêng. Rủi ro cho M18 (đồng bộ chạm `sync-service`/`backup-repo`).

## 5. Kiểm lại defect vòng trước

Không có (vòng 1).

## 6. Regression và nhóm đỏ sẵn trên `main` (không phải defect M17)

**Regression:** vitest 2.604/2.604 pass; e2e 790 pass; mọi spec milestone trước (M1 đến M15, final, native) pass trừ 20 spec dưới đây vốn đỏ sẵn. Smoke luồng chính (Today, tạo goal, ghi giờ, Review, Settings, import/export) nằm trong các spec đó và xanh.

**20 spec đỏ sẵn trên `main` 167324e, xác nhận trên worktree baseline (`npm run test:e2e -- --project=cloud --project=native-web <13 file>` cho 20 failed / 135 passed, đúng danh sách của developer):**

| Spec (project cloud trừ khi ghi khác) | Nguyên nhân | Owner đề xuất |
| :- | :- | :- |
| `e2e/cloud/m7-sync.spec.ts:25, :165`; `m7-merge.spec.ts:79, :106, :137`; `m7-i18n.spec.ts:48` | Tạo goal "Read" 2026-10-01 đến 10-31 không `freezeClock`; ngày thật 2026-11-04 goal đã hết hạn nên Today không có card (trôi lịch) | developer (`e2e/**`: thêm `freezeClock`) |
| `e2e/cloud/m15-d6-layout.spec.ts:36` (360x740, 360x480), `m14-delete-account.spec.ts:226`, `m8-prompts.spec.ts:242`; QC `cloud/final2-journey.spec.ts:109` x4, `cloud/m14-r1-explore.spec.ts:282`, `cloud/m6-r1-ui.spec.ts:74` x2, `cloud/m7-r1-ui.spec.ts:233` | axe `color-contrast` serious ở `#...-remove-desc` trong D4/D6: `--text-muted` trên `--primary-soft`/`--danger-soft` khoảng 4,18 đến 4,31 < 4,5 (token v7). **Lỗi a11y thật trong sản phẩm, có sẵn trên `main`** | designer/planner mở defect riêng; developer sửa token hoặc màu chữ |
| `tests/qc/cloud/m6-r1-flow.spec.ts:159` | đỏ trên baseline (token hết hạn thời gian thật) | QC kiểm lại ở vòng milestone sau |
| `tests/qc/native/m13-r1-native-shell.spec.ts:105` (native-web) | kỳ vọng màu status bar `rgb(18,21,19)` là token trước v7 | QC re-target, cần developer xác nhận token đúng |

Ghi chú: `final2-journey.spec.ts:229` (`schemaVersion` thành 2) đã re-target nhưng spec đỏ từ bước trước nên dòng đó chưa được chạy tới (NOT VERIFIED riêng dòng đó).

**Flaky khi chạy chung:** `tests/qc/cloud/m7-r1-probe.spec.ts:359` (dialog D3 không hiện kịp trong lần chạy đầy đủ; xanh riêng 2 lần và cả file 16/16). `tests/qc/m5-r2.spec.ts:26` dev nêu là nhạy thời gian: lần này pass.

## 7. Bảo mật

- Không secret mới, không biến môi trường mới (`.env.example`, `package.json`, lockfile không đổi so với baseline). Tôi không đọc nội dung file `.env*`.
- Import: zod strict cho 4 mảng roadmap (khoá lạ cho `IMPORT_INVALID_SCHEMA`), trần số lượng và độ dài (`outOfRange`), toàn vẹn tham chiếu, file <= 5 MiB; `__proto__` không gây prototype pollution; HTML và script trong tiêu đề roadmap và `milestoneLabel` hiển thị dạng text (QC e2e: `window.__xss` không được đặt, 0 phần tử `b`/`img` tạo ra).
- `npm audit --omit=dev`: 1 high `zod < 4.6.6` (GHSA-mrhx-c7xc-m3w5, cạn bộ nhớ khi validate collection quá lớn). Có từ trước M17 và liên quan đường import; giảm nhẹ nhờ trần 5 MiB và trần số hàng. Đề xuất nâng zod >= 4.6.7 ở task riêng (Minor, ngoài M17).
- Không endpoint/quyền mới (M17 chưa đồng bộ roadmap).

## 8. Chưa kiểm chứng được (NOT VERIFIED)

- Hiển thị trên thiết bị thật (iOS Safari, Android, native shell): chỉ có Chromium headless. Tự kiểm: `npm run dev`, nạp `e2e/fixtures/q1-roadmap-backup.json` ở Settings, mở `#/roadmaps` ở 360 px, light/dark.
- Thẩm mỹ danh sách và quyết định `--surface-glass`: QC chỉ đo tương phản bằng axe.
- `tests/qc/cloud/final2-journey.spec.ts:229`: chưa chạy tới (spec đỏ sẵn trước dòng đó).
- Coverage `src/domain` >= 90 %: không chạy riêng.
- Mockup v8.0 mở offline (AC10, phần designer).
- Chưa viết lại độc lập: AC3 ca Q1b/Q1d/mốc/`gap`; AC5 xoá dây chuyền + probe rollback; AC6 `moveItem`/đánh lại vị trí/`watchDetail` (dựa vào dev test, đều pass).

## 9. Đề xuất (không chặn)

1. Ngân sách (M17-D1): áp dụng phương án giảm trong handoff §8 (tải lazy `SyncService`/`DexieSyncStore` khoảng -6 kB, hoặc gộp `rolldown-runtime` vào `core`) ngay đầu M18.
2. `--surface-glass` alpha .92 thành .97 (cả hai theme): axe nav label trên nội dung cuộn = 0 vi phạm ở dark nên không có defect tương phản; là thay đổi token ngoài DESIGN, cần designer xác nhận.
3. Deviation 2 (tra `roadmap:errors.*` ở `ui/roadmap-errors.ts` thay vì tham số `scope` của `errorMessage` như ARCH §4.8 j v8.2): hành vi đúng DESIGN và có test; M19/M20 phải dùng `roadmapErrorMessage` ở mọi chỗ hiện lỗi roadmap, nếu không `DATE_IN_FUTURE` ra câu "log time for a future date". Planner nên ghi vào TASKS M19.
4. Deviation 3 (`f.hoursShort` thay vì đổi `f.hours`): `f.hours(960)` vẫn `16.0 h`, `hoursShort(960)` = `16 h`. Hai formatter song song dễ dùng nhầm ở M19.
5. Hàng danh sách chưa là link (Deviation 4, chờ M19): chấp nhận cho M17; M19 phải kiểm thẻ a và truy cập bàn phím.
6. Nâng zod (mục 7); sửa các spec e2e trôi lịch bằng `freezeClock` (mục 6).

## 10. Câu hỏi mở

1. **Designer:** chấp nhận `--surface-glass` alpha .92 thành .97 hay chọn phương án khác của developer (nền đục `--surface`, hoặc nhãn tab inactive dùng `--text`)? Axe không báo lỗi với giá trị hiện tại.
2. **User/orchestrator:** 20 spec e2e đỏ sẵn trên `main` (trong đó lỗi tương phản D4/D6 là lỗi sản phẩm): sửa trước khi deploy M17 hay làm task riêng? AC9 literal ("3 project pass") chưa đạt vì chúng; verdict PASS giả định orchestrator chấp nhận; nếu AC9 là cổng cứng thì đổi thành FAIL.
3. **Planner/orchestrator:** mục tiêu phase +800 B đã vượt ngay M17 (cloud tắt +989 B). Nâng mục tiêu, hay bắt buộc phương án giảm trước M18?

## 11. File `tests/qc` đã re-target hoặc thêm

Re-target (thay đổi có kế hoạch; không nới assert nào bắt lỗi thật):

| File | Thay đổi | Lý do |
| :- | :- | :- |
| `tests/qc/m3-r1-domain.test.ts` | ví dụ "không hỗ trợ" 2 thành 3 (`v '3'`); export `schemaVersion` 1 thành 2; kết quả import thêm `roadmaps: 0` | ADR-49 backup v2 hợp lệ; `BackupCounts` có `roadmaps` |
| `tests/qc/m10-r1-import-variant.test.ts` | `schemaVersion: 2` thành 3 ở ca "unsupported" | như trên |
| `tests/qc/m9-r1-copy.test.ts` | ca "every other goal.detail.* row" bỏ qua key chứa `roadmap` | DESIGN v8.0 thêm hàng M19 (`goal.detail.roadmapLabel`, `goal.delete.roadmapNote`) chưa implement; đã đỏ trên `main` trước M17. **Quyết định phán đoán** (lọc theo tên key); M19 phải bỏ lọc |
| `tests/qc/m4-r2.spec.ts` | `main` <= 960 thành <= 1240 px (1360 px từ 1440 px) | v7.2 nới cột Review; assert heatmap không cuộn (<= 2 px) giữ nguyên |
| `tests/qc/m7-r1-brand.spec.ts` | chiều cao nav <= 64 thành <= 65 | tab bar 64 px + viền 1 px |
| `tests/qc/native/m13-r1-native-shell.spec.ts` | toast `bottom` `102px` thành `110px` | tab bar 64 + 34 + 12 |
| `tests/qc/m7-r1-migration.spec.ts` | `raw.version` 20 thành 30 (2 chỗ); export `schemaVersion` 1 thành 2 | Dexie v3; phần mô phỏng "nâng cấp bị ngắt" mở DB version 20 trên DB v1 giữ nguyên |
| `tests/qc/final-journey.spec.ts`, `m11-r1-explore.spec.ts`, `cloud/final2-journey.spec.ts`, `native/m12-r1-ios-emulation.spec.ts` | export `schemaVersion` 1 thành 2 | export ghi v2 |
| `tests/qc/m9-r1-explore.spec.ts` | link nav Goals thêm `exact: true` (2 chỗ) | nhãn vi "Mục tiêu lớn" chứa "Mục tiêu" |
| Không đổi | `m4-r1.spec.ts:371` (assert `main >= 940` vẫn đúng), `m9-r1-explore.spec.ts:258` (đọc file v1 có sẵn) | đã kiểm |

Thêm mới (chạy lại được ở vòng sau): `tests/qc/m17-r1-domain.test.ts` (14 test), `m17-r1-validate.test.ts` (7), `m17-r1-format.test.ts` (2), `m17-r1-explore.spec.ts` (10 e2e, project chromium), `m17-r1-budget.spec.ts` và `cloud/m17-r1-budget.spec.ts` (in số byte chính xác, assert <= 230.000 và không có chunk roadmap).
