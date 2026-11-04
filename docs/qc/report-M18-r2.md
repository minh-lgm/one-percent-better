# QC report — M18 round 2

**Verdict:** PASS
**Ngày:** 2026-11-04  **Commit:** 18e74dc (fix commit 82b7629; baseline trước M18 = 1fb3baf)

## 1. Tóm tắt
Cả 3 defect vòng 1 (M18-D1 Major, M18-D2 Minor, M18-D3 Minor) đã FIXED, có bằng chứng chạy lại. Không có defect mới. 8/8 AC PASS (AC6 chỉ kiểm tĩnh, Postgres NOT VERIFIED như vòng 1). Lint, typecheck, vitest (200 file, 2.711/2.711), `npm run check` đều xanh. Full e2e: 808 pass / 21 fail; 20 fail đúng bằng danh sách pre-existing §6 vòng 1, 1 fail (m5-r2:26) là load-flaky, chạy riêng pass. Budget (exact gzip): chromium 226.727, cloud 227.154 (≤ 230.000).

## 2. Môi trường và lệnh đã chạy
| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Lint | `npm run lint` | exit 0, 0 warning |
| Typecheck | `npm run typecheck` | exit 0 |
| Vitest | `npx vitest run` | 200 file, 2.711/2.711 pass (sau khi QC đổi test) |
| Lint-boundaries | `npx vitest run src/test/lint-boundaries.test.ts` | 49/49 pass |
| Check | `npm run check` | exit 0 |
| ESLint probe | `npx eslint --stdin --stdin-filename <file>` với `export const x = () => import('<spec>')` | xem D2 |
| E2E nhóm M18 | `--project=cloud` m6-lazy, m18-roadmap-sync, m18-r1-demo, m7-r1-converge, m7-r1-probe, m7-merge | 32 pass / 4 fail: m7-merge:79,:106,:137 thuộc pre-existing; 1 ca của m7-r1-probe fail dưới tải, chạy riêng pass 16/16 |
| Budget | chromium m10-bundle + m17-budget; cloud m10-bundle + m17-budget | 3 + 4 pass |
| E2E đầy đủ | `npm run test:e2e` (3 project, 7.9 phút) | 808 pass / 21 fail, phân loại ở §6 |
| QC spec mới | `--project=cloud tests/qc/cloud/m18-r2-failed-chunk.spec.ts` | 1/1 pass |

Budget exact bytes (BUDGET-EXACT): chromium TOTAL **226.727** (html 574, runtime 428, css 9.828, core 18.104, index 197.793). Cloud TOTAL **227.154** (html 586, runtime 428, css 9.843, core 18.105, index 198.192). Khớp số developer báo; +121 / +118 B so với vòng 1; headroom 3.273 / 2.846 B.

## 3. Acceptance criteria
| AC | Kết quả | Bằng chứng (chạy lại vòng 2) |
| :- | :- | :- |
| M18-AC1 | PASS | tests/qc/m18-r1-sync.test.ts + test dev trong vitest đầy đủ 2.711/2.711 (32 dirty row, cascade tombstone, markAllDirty, normalizeSyncMeta). |
| M18-AC2 | PASS | Cùng suite (mapper strict, round-trip 4 bảng, 403 42501 → tableMissing trên roadmap, SYNC_UNAUTHORIZED trên goals; contract Fake + mock). |
| M18-AC3 | PASS | Test dev + QC cho bảng thiếu: core dirty 0, roadmap dirty 1, không "Sign in again", re-enable → dirty 0. sync-store.test.ts (M7) không đổi. |
| M18-AC4 | PASS | Convergence A→B 6 bảng, delete roadmap vs offline add item, random 20×200 (vitest). |
| M18-AC5 | PASS | markAllDirty 32, clearUserData xoá 4 bảng, e2e delete account (m14-delete-account pass trừ :226 pre-existing). Ca chunk-load-failure nay đúng (xem D1). |
| M18-AC6 | PASS tĩnh / NOT VERIFIED trên Postgres | Không đổi so với vòng 1 (SQL không bị chạm ở 82b7629). |
| M18-AC7 | PASS | e2e cloud m18-roadmap-sync, m18-r1-demo pass (hint verbatim, pending 32 → 0, B nhận Q1, origin chỉ 4174 và 54321). |
| M18-AC8 | PASS | check exit 0; e2e phân loại; budget ≤ 230.000; README có U31 (dòng 259) và mô tả M18 (dòng 224). |

## 4. Defect
Không có defect mới (M18-D4 trở đi không phát sinh).

## 5. Kiểm lại defect vòng trước
| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| M18-D1 [Major] | **FIXED** | lazy-sync-engine.ts: handleSignedIn giữ pendingSignIn khi load lỗi và trả confirm-merge; syncNow sau load thành công settle trước (D5 prompt / merge / same-user), confirm-merge → {skipped, awaiting-merge}; reset()/pause() xoá pending. Ca it.fails M18-D1 đã đổi sang it và pass: {decision: confirm-merge, uploaded: 0}. Thêm 3 probe độc lập (a)(b)(c) bên dưới, tất cả pass. E2E: xem §8. |
| M18-D2 [Minor] | **FIXED** | import() của sync-service, lazy-sync-engine, dexie/sync-store (4 biến thể đường dẫn) đều bị no-restricted-syntax ("only allowed in src/app/container.ts") trong src/ui/screens/Today.tsx, src/app/sync-scheduler.ts, src/services/goal-service.ts (12/12 exit 1). Cùng 4 import trong src/app/container.ts → exit 0 (4/4). src/test/lint-boundaries.test.ts có probe import() và pass 49/49. |
| M18-D3 [Minor] | **FIXED** | README:224 nay nói chip hiện "N changes waiting to sync" (không Sync error / Sign in again) khi thiếu migration, về Synced sau U31; khớp hành vi. Dòng U31 (README:259) còn nguyên. |

### Test QC đổi và lý do (tests/qc/m18-r1-lazy.test.ts)
- it.fails → it cho ca M18-D1 (đã pass).
- Ca 1 (loader luôn lỗi): **đồng ý với dispute của developer**. Hợp đồng (FR-47/A-27, D5): một lần đăng nhập chưa quyết được không được resolve same-user và không được upload. Kỳ vọng cũ same-user chính là hành vi gây ra M18-D1, nên đổi sang confirm-merge là đúng, không làm yếu kiểm tra.
- Thêm 3 probe mới (describe "LazySyncEngine pending sign-in (QC round 2 probes)"):
  (a) load lỗi → engine nạp lại → syncNow x2 đều awaiting-merge, U2 = 0 hàng, prompt có userId U2; chỉ sau confirmMerge() U2 mới nhận đủ goals.
  (b) load lỗi rồi reset() (và riêng pause()) trước khi engine nạp → không còn pending, syncNow sau đó không sinh prompt.
  (c) session đã lưu của cùng user + load lỗi lúc khởi động → engine nạp, không có D5 prompt, sync chạy ok và U2 nhận đủ goals.
- Spec mới tests/qc/cloud/m18-r2-failed-chunk.spec.ts (xem §8).

## 6. Regression
- Full e2e: 808 pass / 21 fail. 20 fail trùng khít danh sách pre-existing vòng 1 §6, không phải defect M18: m7-sync:25,:165; m7-merge:79,:106,:137; m7-i18n:48; m15-d6-layout:36 x2; m14-delete-account:226; m8-prompts:242; final2-journey:109 x4; m14-r1-explore:282; m6-r1-ui:74 x2; m7-r1-ui:233; m6-r1-flow:159; native/m13-r1-native-shell:105.
- 1 fail thêm: tests/qc/m5-r2.spec.ts:26 (chromium), load-flaky đã biết; chạy riêng pass.
- m7-r1-probe (1 ca fail trong run nhóm) pass 16/16 chạy riêng.
- Vitest 2.711/2.711.

## 7. Bảo mật
Không secret mới; fix chỉ chạm lazy-sync-engine.ts, eslint.config.js, README và test. Consent bypass FR-47/A-27 (M18-D1) đã đóng: không còn đường upload dữ liệu U1 lên U2 khi chunk lỗi. Không chạy lại npm audit (không đổi dependency).

## 8. Chưa kiểm chứng được (NOT VERIFIED) và kiểm e2e D1
- E2E cho D1: Playwright route abort chunk sync-engine-*.js. Bấm Sign in cần engine (prepareFirstSignIn) nên abort từ đầu làm nút không điều hướng. Abort chỉ từ lúc tới trang provider (lúc OAuth callback tải lại trang): luồng auth tự **fail safe** ("Couldn't sign you in. Nothing on this device changed."), signed-out, không giữ session, U2 = 0 hàng, không có D5; gỡ abort rồi đăng nhập lại → D5 hiện trước khi upload, Cancel → U2 vẫn rỗng (spec pass). Đường "auth thành công nhưng handleSignedIn fail riêng" không tái hiện được ở mức e2e, nên dựa vào unit probe (a)(b)(c) + test dev. Ghi là **NOT VERIFIED ở mức e2e** cho riêng đường đó.
- SQL trên Postgres thật (AC6): cách tự kiểm ở U31 (chạy file 2 lần, thấy Success, chạy 3 câu verify cuối file).
- Hiển thị trên thiết bị thật; stale hashed chunk sau deploy thật (mô phỏng bằng loader giả / route abort).

## 9. Đề xuất và câu hỏi mở (không chặn)
1. Chữ chip khi thiếu migration: TASKS/DESIGN nói "Synced", ARCH §4.8 (h) buộc "N changes waiting". README đã theo hành vi; planner/designer chọn một.
2. Chấp nhận hay bỏ ánh xạ lenient 404-không-code → tableMissing (handoff §7.5): QC không coi là defect.
3. User phải làm U31 trước khi orchestrator push main (push sớm vẫn an toàn theo ADR-52).
4. 20 spec đỏ pre-existing nên có task riêng, ngoài M18.
5. TASKS M18-AC3 ghi "không đổi assertion" nhưng dev đã re-target vài assertion trong sync-service.test.ts (hợp lý, không làm yếu); planner có thể sửa chữ AC.
