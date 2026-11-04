# QC report — M20 round 2

**Verdict:** PASS
**Ngày:** 2026-11-05  **Commit:** 5fd31ab (HEAD; fix của developer b1e5fb6; baseline trước M20 = 2f6b376)

## 1. Tóm tắt

Vòng độc lập, chạy lại toàn bộ. **M20-D1 FIXED, M20-D2 FIXED**, không có defect mới (M20-D3 không mở). 6/6 AC PASS có bằng chứng; lint, typecheck, `npm run check` (212 file / 2.813 test), E2E 3 project (843 pass / 22 fail: 20 ca đỏ sẵn của `main` + 2 ca chập chờn theo tải, xanh khi chạy riêng) và ngân sách (227.180 / 227.586 B) đều đạt. Audit rủi ro `addDays` (hợp đồng đổi từ trả chuỗi sai sang ném `RangeError`): không có đường nào mà input người dùng / import / sync tạo ra được làm app crash; 11 route jsdom + 1 spec E2E với dữ liệu ở biên 9999-12-31 / 0001-01-01 đều không ErrorBoundary, không NaN, không lỗi trang. Ghi nhận ngoài phạm vi M20 (có sẵn): `/goals/<id>` của mục tiêu mở start `0001-01-01` mất ~54 s (§4, O-1).

NV-23 (U32) và NV-24 (U33) vẫn chưa kiểm được (§8): orchestrator hỏi user.

## 2. Môi trường và lệnh đã chạy

Windows 11, Node 22, npm, không Docker. Đồng hồ Playwright 2026-11-04T10:00+07:00.

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Lint | `npm run lint` | 0 lỗi, 0 warning |
| Typecheck | `npm run typecheck` | 0 lỗi |
| Check (gồm Vitest đầy đủ + build:e2e) | `npm run check` | exit 0; **212 file / 2.813 test pass** (gồm test QC mới) |
| M20-D2 | `npx vitest run src/ui/components/roadmap/TemplateDialog.test.tsx` x15 | **15/15 xanh** (4 test mỗi lần) |
| Unit QC | `npx vitest run tests/qc/m20-r1-template.test.ts tests/qc/m20-r1-scan-mask.test.ts tests/qc/m20-r1-copy.test.ts` | 23 pass (D1 giờ là test thường) |
| Audit addDays | `npx vitest run tests/qc/m20-r2-adddays-audit.test.tsx` | 18/18 pass |
| E2E QC M20 r1 | `--project=chromium tests/qc/m20-r1-accept.spec.ts` | 9/9 pass (test D1 đã viết lại) |
| E2E extreme dates | `--project=chromium tests/qc/m20-r2-extreme-dates.spec.ts` | 1 pass (1,3 phút, do O-1) |
| E2E M20 | `--project=chromium e2e/m20-qpt-template.spec.ts` (cùng lượt chạy lại 2 ca flaky: 8 pass); `--project=cloud tests/qc/cloud/m20-r1-sync.spec.ts e2e/cloud/m20-template-sync.spec.ts` | pass / 2 pass |
| E2E đủ 3 project | `npm run test:e2e` (nền, 10,1 phút) | **843 pass / 22 fail**, phân loại ở §6 |
| Chạy lại riêng | `--project=chromium tests/qc/m11-r1-explore.spec.ts:88 tests/qc/m5-r2.spec.ts:26 e2e/m20-qpt-template.spec.ts` | 8 pass |
| Ngân sách chromium | `--project=chromium e2e/m10-bundle.spec.ts tests/qc/m17-r1-budget.spec.ts` | 3/3 pass |
| Ngân sách cloud | `--project=cloud e2e/cloud/m10-bundle.spec.ts tests/qc/cloud/m17-r1-budget.spec.ts` | 4/4 pass |

Ngân sách (gzip, 5 response; bytes):

| Bản | html | runtime | css | core | index | Tổng | Baseline M17 | Δ phase 8 | Còn tới 230.000 |
| :- | -: | -: | -: | -: | -: | -: | -: | -: | -: |
| cloud tắt | 574 | 428 | 9.860 | 18.197 | 198.121 | **227.180** | 229.454 | **−2.274** | 2.820 |
| cloud bật | 588 | 428 | 9.874 | 18.199 | 198.497 | **227.586** | 229.658 | **−2.072** | 2.414 |

Khớp số của developer; +20 / +22 B so QC r1 (guard trong `addDays` nằm trên đường tải lạnh). Đạt giới hạn cứng 230.000 và mục tiêu phase "tối đa M17 + 800 B".

## 3. Acceptance criteria

| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M20-AC1 | PASS | `m20-r1-template.test.ts` (oracle từ `docs/plan/ref/qpt-tracker.html` + DESIGN §7.9.3) pass lại: `vi` 2026-10-27 → 480 phút, mốc `Thi QPT` 2027-03-09, ghi chú 7 dòng, 5 phase, 21 tiêu đề, W1/W8/W16/W18/W19/W20/W21 đúng ngày, 5 checkpoint, 32 hàng; `en` cùng cấu trúc; năm nhuận 2028-02-29; 1999-12-31. Biên mới: 9999-08-07 → mọi ngày là ISO 4 chữ số hợp lệ, mục cuối kết thúc đúng `9999-12-31` |
| M20-AC2 | PASS | Service: `[1,5,21,5]` hàng; hook Dexie ném lỗi → 0 hàng cả 4 bảng; goal đã liên kết / 20 lộ trình / ngày sai → lỗi đúng mã, số hàng không đổi; mới: `9999-12-31` và `9999-08-08` → `ROADMAP_DATE_INVALID`, `[0,0,0,0]`. E2E vi "AC2+AC3+AC4" pass |
| M20-AC3 | PASS | `m20-r1-accept.spec.ts` pass lại: bảng 5 hàng, Đạt/Dưới ngưỡng, `7,5`, validation `range`/`precision`, biểu đồ 5 cột 3 vạch, editor thêm/sửa/xoá checkpoint, thang percent; quét vi sạch |
| M20-AC4 | PASS | Q1 vi: `1/21`, `5,8 giờ`, `16 giờ`, `Đúng tiến độ`, `125`, W1 `Sớm 1 ngày · học 6 ngày`, `75/480 phút`; Export → Import cùng bộ số; bỏ tick W1 → `0/21` rồi về lại |
| M20-AC5 | PASS | `e2e/cloud/m20-template-sync.spec.ts` + `tests/qc/cloud/m20-r1-sync.spec.ts` pass (2/2); không request ra ngoài {localhost:4174, 127.0.0.1:54321} |
| M20-AC6 | PASS | `npm run check` exit 0; ngân sách §2; E2E §6; axe light/dark + 360 px trong `m20-r1-accept` pass; README mục Big goals có. `src/test/i18n-scan.ts` dùng allowlist tường minh `roadmap.tpl.languageName`; `m20-r1-scan-mask.test.ts` xanh (danh sách che = `['roadmap.tpl.languageName']`) |

## 4. Defect

Không có defect mới. Không có M20-D3.

Ghi nhận ngoài phạm vi M20 (có sẵn từ trước, không do M20, không chặn):
- **O-1 (hiệu năng, có sẵn):** import backup có mục tiêu mở (`endDate: null`) bắt đầu `0001-01-01` rồi mở `#/goals/x4` mất **~54 s** (main thread bận, ~740 nghìn ngày); mọi route khác < 0,6 s. Suy luận có sẵn từ trước: `git diff 2f6b376 HEAD` không đổi `GoalDetail`, `goal.ts`, `stats-service`, và `GoalDetail` không gọi `addDays`. QC chưa kiểm form Goal có nhận `start = 0001-01-01` không (chỉ qua import) và chưa đo trên commit baseline. Đề nghị backlog (giới hạn start date hoặc tối ưu vòng lặp).
- **O-2 (có sẵn):** `addDays('0001-01-01', -1)` trả `0001-12-31` (date-fns định dạng năm 0 thành `0001`): sai nhưng không ném; DateNav prev từ `/day/0001-01-01` không crash.

## 5. Kiểm lại defect vòng trước

| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| M20-D1 (Major) | **FIXED** | Service: `9999-12-31` và `9999-08-08` → `ROADMAP_DATE_INVALID`, 0 hàng; `9999-08-07` thành công, mọi ngày hợp lệ (`m20-r1-template.test.ts`, đã lật `it.fails` thành `it`). E2E (viết lại `m20-r1-accept.spec.ts` "M20-D1 …"): nhập `9999-12-31` → dialog hiện `Enter a valid date.` ngay, không `NaN`; bấm Create → dialog ở lại, lỗi còn, ô ngày `aria-invalid=true` và nhận focus, URL vẫn `#/roadmaps`, **0 roadmap trong IndexedDB**; đổi `9999-08-07` → lỗi biến mất, tạo được, chi tiết không `NaN`; Export (không có năm 5 chữ số) → Import hiện dialog xác nhận bình thường (khép kín) |
| M20-D2 (Minor) | **FIXED** | 15/15 lần chạy riêng xanh; `npm run check` xanh; Vitest 2.813 pass |
| Quét vi (đề xuất §9 r1) | Đã làm | allowlist theo key |

## 6. Regression

**Audit `addDays`** (mọi nơi gọi trong `src/**`, không tính test; `dates.ts` không còn hàm nào khác dùng date-fns `addDays`; các helper thống kê, heatmap, streak, week dùng `dayNumber` / `isoFromDayNumber` số học, không ném):

| Nơi gọi | Input rủi ro | Kết quả | Test |
| :- | :- | :- | :- |
| `ui/components/DateNav.tsx` (prev/next) | `/day/9999-12-31` (FutureDay): prev; next | prev → `9999-12-30` đúng; next luôn `disabled` khi `date >= today` nên không bao giờ gọi `addDays(9999-12-31, 1)` | E2E extreme-dates (click prev ở 9999-12-31 và 0001-01-02); audit route `/day/9999-12-31`, `/day/0001-01-01` |
| `ui/screens/Today.tsx:186` `addDays(today,-1)` | today = đồng hồ máy | chỉ ném nếu đồng hồ máy < 0001; không đạt được | audit `/today` với goal cuối 9999 / mở |
| `domain/reminder-plan.ts:52` `addDays(today, i)`, i < 14 | goal kết thúc 9999-12-31 / mở; today thật | 14 ngày, không ném; chỉ ném nếu đồng hồ thiết bị ở cuối năm 9999 (không đạt được; là `RangeError` thay vì chuỗi sai) | audit unit (2 ca) |
| `domain/ics.ts:81` `addDays(today, 1)` | goal 9999 / mở; today thật | ok; ném chỉ khi đồng hồ = 9999-12-31 | audit unit |
| `app/start.ts:92`, `stats-service.ts` dùng `OPEN_END_QUERY_MAX` | mục tiêu mở, goal kết thúc 9999-12-31 | chỉ làm cận truy vấn (không `addDays` trên nó); `goalsDateRange` trả `9999-12-31` | audit unit; E2E Review/Today/Goals/Settings sau import |
| `domain/roadmap-template.ts` `qptWeekStart/End`, `qptTemplateFits` | start > 9999-08-07 | `qptTemplateFits` chặn trước; build ném `RangeError` nếu bỏ guard (có test dev) | `m20-r1-template.test.ts` biên 9999-08-07/08 |
| `services/roadmap-service.ts:238` gợi ý ngày | mục cuối kết thúc 9999-12-31 | `addDaysOrNull ?? LAST_ISO_DATE` → `9999-12-31`, không ném | unit dev + đọc source |
| `ui/screens/RoadmapEditor.tsx:185` | như trên (render) | không ném khi render | unit dev `RoadmapEditor.test.tsx` |
| `ui/components/roadmap/TemplateDialog.tsx` | `9999-12-31`, rỗng | `addDaysOrNull` → không NaN, lỗi inline | E2E D1 |
| `domain/roadmap.ts` `addDaysOrNull` | ngày sai / tràn | trả `null` | audit unit |
| Import backup: goal kết thúc 9999-12-31 (start 9995-01-01), mục tiêu mở start 2026-01-01, mục tiêu mở start 9999-12-31, mục tiêu mở start 0001-01-01 + entry 0001-01-01 | Today, Goals, Review, Goal detail x4, Day (4 ngày biên), Roadmaps, Settings, Export → Import lại | Không ErrorBoundary, không `NaN` / `Invalid Date`, 0 `pageerror`; Export chứa `9999-12-31` và Import lại được. Entry tương lai 9999-12-31 bị Import từ chối theo thiết kế (`checkIntegrity` "dated after today"), nên không tạo được qua import | `tests/qc/m20-r2-extreme-dates.spec.ts` |

Kết luận audit: không có crash nào đạt được bằng input hợp lệ. Hai đường (reminder-plan, ics) chỉ ném khi **đồng hồ thiết bị** ở năm 9999: Minor lý thuyết, ném `RangeError` tường minh thay vì sinh ngày năm 5 chữ số; không mở defect.

**E2E đủ 3 project: 843 pass / 22 fail. Do M20: 0.**
- **20 ca đỏ sẵn trên `main` (QC M17 §6), danh sách không đổi:** `e2e/cloud/m7-sync:25, :165`; `m7-merge:79, :106, :137`; `m7-i18n:48`; `m15-d6-layout:36` x2; `m14-delete-account:226`; `m8-prompts:242`; `tests/qc/cloud/final2-journey:109` x4; `m14-r1-explore:282`; `m6-r1-flow:159`; `m6-r1-ui:74` x2; `m7-r1-ui:233`; `tests/qc/native/m13-r1-native-shell:105`.
- **2 ca chập chờn theo tải:** `tests/qc/m11-r1-explore.spec.ts:88`, `tests/qc/m5-r2.spec.ts:26`: xanh khi chạy riêng (`m11-r1-explore:88` đỏ một lần khi chạy cùng spec mới, xanh ở lần chạy riêng cuối). `m6-r1-flow:142` xanh lần này.
- M17/M18/M19 PASS cũ vẫn xanh trong full run; ngân sách thấp hơn baseline M17.

## 7. Bảo mật

Không đổi dependency, secret, env. Dữ liệu mẫu vẫn là text tĩnh. Import vẫn từ chối ngày năm 5 chữ số và entry tương lai. Export → Import khép kín ở biên 9999. Không chạy `npm audit` (M20 không đổi dependency).

## 8. Chưa kiểm chứng được (NOT VERIFIED)

| ID | Nội dung | Cách tự kiểm |
| :- | :- | :- |
| NV-23 | Hai thiết bị thật (máy tính + điện thoại `vi`): nav 5 mục vừa 360 px thật; đồng bộ lộ trình/tick/điểm offline→online; xoá ở một máy; iOS TestFlight mở được Mục tiêu lớn | User làm **U32** (handoff `dev-M20.md` §11) |
| NV-24 | Dữ liệu thật: mẫu QPT 27/10/2026 + goal `7ea38fbe-…` + W1 + Diagnostic khớp tracker cũ | User làm **U33** |
| NV-22 | Migration `20261104000000_roadmaps.sql` trên Postgres thật | Không đổi ở M20; thuộc U31 |
| — | `<input type="date">` theo locale OS, font Fraunces/Manrope, screen reader thật đọc `aria-label` của chart; form Goal có nhận start `0001-01-01` không (O-1) | Kiểm tay trên thiết bị thật |

NV-23/NV-24 không làm AC nào thành NOT VERIFIED nhưng chưa tính PASS thực tế: orchestrator hỏi user U32/U33 khi M20 lên Pages.

## 9. Đề xuất (không chặn)

- O-1: giới hạn hoặc tối ưu vòng lặp theo ngày của GoalDetail cho mục tiêu mở start rất xa (backlog riêng).
- O-2: cân nhắc chặn `addDays` xuống dưới `0001-01-01` (hiện trả `0001-12-31`).
- 20 ca đỏ sẵn của `main` nên dọn trong một lần nợ kỹ thuật riêng.

## 10. Thay đổi trong `tests/qc/` và lý do

| File | Thay đổi | Lý do |
| :- | :- | :- |
| `tests/qc/m20-r1-template.test.ts` | `it.fails` D1 thành `it` (bị từ chối, 0 hàng) + test biên 9999-08-07 (ok, ngày hợp lệ) / 9999-08-08 (từ chối) | M20-D1 đã sửa |
| `tests/qc/m20-r1-accept.spec.ts` | Viết lại test D1: lỗi inline, focus ô ngày, `aria-invalid`, 0 roadmap trong IndexedDB, không NaN; rồi 9999-08-07 tạo được và Export → Import khép kín | Create bị từ chối theo thiết kế, test cũ chờ điều hướng |
| `tests/qc/m20-r2-adddays-audit.test.tsx` (mới) | Hợp đồng `addDays`, các caller từ "today", 11 route với goal ở biên (jsdom) | Audit regression |
| `tests/qc/m20-r2-extreme-dates.spec.ts` (mới) | E2E import goal 9999 / mở / 0001, đi 13 route, DateNav biên, Export → Import | Audit regression (timeout 240 s vì O-1) |

## 11. Câu hỏi mở

- Orchestrator: O-1 (54 s ở goal detail với mục tiêu mở start 0001-01-01) có đưa vào backlog không? QC không coi là defect của M20.
- User: U32 / U33 (NV-23 / NV-24) khi M20 đã lên Pages.
