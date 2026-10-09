# QC report — M1 round 2

**Verdict:** PASS
**Ngày:** 2026-10-10  **Commit:** 2e16914 (working tree: thêm `tests/qc/m1-r2.spec.ts` của QC)

## 1. Tóm tắt
- Cả 3 defect của round 1 đã sửa: M1-D1 (Major) FIXED, M1-D2 (Minor) FIXED, M1-D3 (Minor) FIXED. Không có defect mới, không có REGRESSED.
- Toolchain sạch: lint, typecheck, Vitest 175/175, build, Playwright 109/109 (20 dev + 38 QC round 1 + 51 QC round 2; gồm 2 test QC trước đó đỏ vì D1, nay xanh). `npm audit` 0 lỗ hổng.
- 18/18 AC đạt về mặt tự động. M1-AC10 (đóng hẳn Chrome rồi mở lại) và M1-AC11 (nút Install, cửa sổ app riêng) giữ `NOT VERIFIED` ở phần thủ công, hướng dẫn user ở mục 8; orchestrator cần hỏi user.
- Verdict PASS theo quy tắc: mọi AC tự động PASS có bằng chứng, build/lint/test sạch, không còn Critical/Major mở.

## 2. Môi trường và lệnh đã chạy
Windows 11, Node v22.14.0, npm 10.9.2, Playwright Chromium. Chạy tại project root `D:\minh\Coderschool\GitHub\one-percent-better`. Cổng 4173 không có preview cũ chiếm (chỉ còn socket TIME_WAIT).

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Lint | `npm run lint` | exit 0, 0 lỗi, 0 warning |
| Typecheck | `npm run typecheck` | exit 0 |
| Vitest | `npm test` | 24 file, 175 passed / 0 failed (gồm 19 test QC) |
| Build | `npm run build` | exit 0; `index-*.js` 647,63 kB raw / 199,19 kB gzip (≤ 250 kB); precache 15 entry; `dist/sw.js` |
| E2E dev + QC | `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test` (trước khi thêm spec r2) | 58 passed, 0 failed (17,2 s) |
| E2E sau khi thêm spec r2 | `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test` | 109 passed, 0 failed (20,8 s) |
| Spec r2 riêng | `playwright test tests/qc/m1-r2.spec.ts` | 51 passed (các lần đầu có fail do QC viết sai selector tiếng Việt, sai key `targetMinutes`, và giả định thứ tự hàng; đã sửa test, không phải lỗi app) |
| Audit | `npm audit` | found 0 vulnerabilities |
| Git | `git ls-files` lọc `.env` | rỗng (không có `.env` trong repo) |

## 3. Acceptance criteria
Regression nhanh bằng toàn bộ test tự động của round 1 (xanh nguyên), cộng test khám phá quanh vùng đã sửa.

| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M1-AC1 | PASS | `lint`, `typecheck`, `test`, `build`, `playwright test` đều exit 0 tại project root bằng đúng lệnh trong handoff/README. README đã bỏ callout cũ về ký tự phần trăm trong đường dẫn, chỉ còn một dòng "clone vào đường dẫn ngắn" (đúng với nguyên nhân MAX_PATH QC xác minh ở round 1). Clone sạch và `npm ls -g` kiểm ở round 1; commit 77c35c3 không đụng `package*.json` (`git show --stat`). |
| M1-AC2 | PASS | `m1-qc-flows.spec.ts` + dev E2E xanh. |
| M1-AC3 | PASS | `m1-domain.test.ts`, `m1-qc.spec.ts` (14 case form) xanh; thêm `m1-r2.spec.ts`: 17 giá trị sai cú pháp ở ô Minutes per day, 4 ở Total hours, đều `aria-invalid="true"`, URL vẫn `#/goals/new`, 0 goal trong IndexedDB. |
| M1-AC4 | PASS | Unit + E2E `0/17` xanh. |
| M1-AC5 | PASS | Unit `goalStatus` + E2E 5 goal xanh. |
| M1-AC6 | PASS | Round 1 xanh; thêm: ô Minutes của entry với `0x1E`, `1e1`, `0b11`, `+10`, `٣٠`, `10.`, `1,0`, `-5`, `0`, `1441`, `12.5`, rỗng đều bị từ chối, 0 entry; `10`, ` 10 `, `10.0`, `010` đều lưu `minutes = 10`. |
| M1-AC7 | PASS | E2E sửa/xoá entry không reload xanh. |
| M1-AC8 | PASS | Service + UI xanh; thêm: sửa goal đang có với `0x1E` → `aria-invalid`, bản ghi trong IndexedDB giữ nguyên (so `JSON.stringify` trước/sau). |
| M1-AC9 | PASS | Xoá + cascade + rollback xanh. |
| M1-AC10 | PASS (tự động) / NOT VERIFIED (thủ công) | Test reload, page mới, `launchPersistentContext` đóng/mở lại xanh. Chrome thật: mục 8. |
| M1-AC11 | PASS (tự động) / NOT VERIFIED (thủ công) | Manifest, SW, offline reload, installability xanh. Nút Install thật: mục 8. |
| M1-AC12 | PASS | 0 request ngoài `localhost:4173`, XSS literal, axe light/dark 0 serious/critical xanh. Ý 360×740 không cuộn ngang nay đạt kể cả Why dài (xem M1-D1). |
| M1-AC13 | PASS | Probe lint và UUID/timestamp: test xanh, `eslint.config.js` không đổi trong commit fix. |
| M1-AC14 | PASS | Route test xanh. |
| M1-AC15 | PASS | `detectLocale`, `LocaleService`, E2E `vi-VN` xanh. |
| M1-AC16 | PASS | Đổi ngôn ngữ không reload, bền qua reload, bàn phím: xanh. |
| M1-AC17 | PASS | Parity, quét vi, lint chuỗi cứng: xanh (`npm test` + E2E `vi-VN`). |
| M1-AC18 | PASS | Format en/vi, E2E `vi-VN`; 360 px vi-VN không cuộn ngang với Why dài (xem M1-D1). |

## 4. Defect
Không có defect mới (M1-D4 trở đi chưa dùng).

## 5. Kiểm lại defect vòng trước
| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| M1-D1 (Major) Goals cuộn ngang 360 px khi Why dài | **FIXED** | Làm đúng bước tái hiện round 1 (build + preview, viewport 360×740, tạo goal Why 20/40/55/60/80/100/280 ký tự có dấu cách, đọc `scrollWidth`/`clientWidth` ở `#/goals`): `scrollWidth <= clientWidth` ở mọi độ dài (round 1: 421 đến 1854). Chạy lại ở en và `vi-VN` (Why và tên có dấu tiếng Việt), 360 px và 320 px, cộng tên 60 ký tự liền nhau + Why 280 ký tự liền nhau, và 1440 px. Cả 8 hàng và mọi nút/link (Edit, Delete) nằm trong viewport; mọi `.why` có `text-overflow: ellipsis`; `.why` ≥ 60 ký tự bị cắt thật (`scrollWidth > clientWidth`) và nằm trong viewport. Today và Settings không cuộn ngang. Ảnh chụp 360 px: Why 280 ký tự hiện 1 dòng kết thúc bằng dấu chấm lửng, tên 60 ký tự xuống dòng trong card, badge và nút không bị cắt. Hai test QC round 1 từng đỏ (`DEFECT PROBE`, `long unbroken name / why / note`) nay xanh. Test: `tests/qc/m1-r2.spec.ts`. |
| M1-D2 (Minor) README ghi chú về ký tự phần trăm lỗi thời | **FIXED** | `README.md` mục Requirements: callout cũ đã bỏ, thay bằng 1 dòng về đường dẫn ngắn/MAX_PATH. Tìm trong README các từ `subst`, `any path`, `1%better`: không còn (chỉ còn tiêu đề "1% Better per Day"). `docs/handoff/dev-M1.md` mục 8, OQ-M1-1, AC1 đã sửa. Còn một ghi chú lịch sử ở dòng 56 handoff (bảng "Cách test", mô tả lần build đầu trong thư mục cũ); chỉ là lịch sử, không hướng dẫn sai, không tính defect. |
| M1-D3 (Minor) ô số nhận `0x1E`, `1e1`, `0b11` | **FIXED** | Qua UI thật, Minutes per day: `0x1E`, `1e1`, `0b11`, `0o17`, `٣٠`, `+30`, `-30`, `30.`, `.5`, `1,000`, `1_000`, `３０` (full-width), `Infinity`, `NaN`, `1e400`, `30 min`, `3 0` đều `aria-invalid="true"`, ở lại `#/goals/new`, 0 goal. `12.5` vẫn bị từ chối. `30`, ` 30 `, `30.0`, `030` lưu `targetMinutes = 30`; `1440` lưu 1440. Total hours: `0x1E`, `1e1`, `0b11`, `+10` bị từ chối; ` 10.0 ` được lưu. Entry Minutes: danh sách tương tự bị từ chối, 0 entry; `10`, ` 10 `, `10.0`, `010` → `minutes = 10`. Sửa goal bằng `0x1E` bị từ chối, bản ghi giữ nguyên. `vi-VN` cũng đánh dấu lỗi. Lưu ý (không phải lỗi): `+30` nay bị từ chối (round 1 được nhận); `30.0` và `030` vẫn được nhận, vô hại. |

Mục `Dispute` trong handoff: không có.

## 6. Regression
Không có milestone trước M1. Toàn bộ 175 test Vitest và 109 test Playwright xanh; AC1–AC18 chạy lại không thoái lui. Commit 77c35c3 chỉ đổi CSS (min-width: 0 cho `.goal-info` và `.gr-actions` trong `.goal-row`), `Goals.tsx` (thêm class), `number-input.ts` (mới, chỉ nhận số thập phân thường), `GoalForm.tsx`, `EntryForm.tsx`, test và docs; không đụng domain, data, i18n.

## 7. Bảo mật
- `npm audit`: 0 lỗ hổng. `.env` không có trong `git ls-files` (QC không đọc `.env`).
- Parse số mới cứng hơn trước (chỉ chữ số ASCII), không mở thêm bề mặt tấn công; domain vẫn validate lại (zod + service).
- XSS (`dangerouslySetInnerHTML` vẫn 0) và request ngoài origin (0) không đổi so với round 1; test tương ứng xanh.

## 8. Chưa kiểm chứng được (NOT VERIFIED)
Giữ nguyên từ round 1:
1. M1-AC10 phần thủ công "đóng hẳn Chrome rồi mở lại". Thay thế: `launchPersistentContext` đóng/mở lại cùng profile, dữ liệu còn. User tự kiểm: `npm run build && npm run preview`, mở `http://localhost:4173` trong Chrome, tạo goal "Read" và ghi 10 phút, thoát hẳn Chrome (Task Manager không còn tiến trình chrome), mở lại cùng URL, vào Today: dữ liệu còn. Settings → Storage hiện "Protected" khi đã cài app hoặc trình duyệt cấp quyền persist; chưa cài thì "Not protected" là bình thường.
2. M1-AC11 phần thủ công "nút Install, app mở cửa sổ riêng". Thay thế: CDP `Page.getInstallabilityErrors` = `[]`, manifest hợp lệ. User tự kiểm: mở `http://localhost:4173` trong Chrome/Edge desktop sau `npm run preview`, đợi vài giây, tìm icon Install ở thanh địa chỉ (hoặc menu ba chấm → "Install 1% Better per Day"), cài, kiểm app mở cửa sổ riêng không thanh địa chỉ, có icon và tên "1% Better".
3. UpdateToast khi có bản mới (T7, không phải AC): chưa tái hiện luồng service worker "waiting"; dev có `sw-register.test.ts`.
4. Safari iOS và Firefox (NFR-06): chỉ kiểm Chromium.
5. Screen reader thật: chỉ kiểm bằng axe và thuộc tính ARIA/`lang`.

## 9. Đề xuất (không chặn)
- Today sort theo `createdAt`: thêm tie-break theo `id` hoặc `name` khi hai goal trùng timestamp (chỉ xảy ra khi clock bị đóng băng như test; thứ tự hàng ở Goals cũng phụ thuộc điều này).
- `EntryService.update/remove` quét toàn bộ entry; thêm `EntryRepository.getById` ở M3.
- Handoff dòng 56 còn nhắc thư mục tên cũ (lịch sử); có thể rút gọn.
- Cân nhắc có chấp nhận số 0 đứng đầu (`030`) và `30.0` hay không: hiện được nhận, vô hại.

## Test QC bổ sung (`tests/qc/`)
| File | Nội dung |
| :- | :- |
| `tests/qc/m1-domain.test.ts` | (round 1) 19 test Vitest domain/service/locale/format |
| `tests/qc/m1-qc.spec.ts` | (round 1) Playwright: form, XSS, request ngoài origin, layout 360 px, route, ngôn ngữ, PWA/offline, axe |
| `tests/qc/m1-qc-flows.spec.ts` | (round 1) Playwright: luồng S1, qua nửa đêm, 2 tab, 1440 px, `vi-VN` |
| `tests/qc/m1-r2.spec.ts` | (round 2) 51 case: D1 en/vi-VN x 320/360 px + 1440 px; D3 ô Minutes per day, Total hours, Minutes của entry, sửa goal, `vi-VN` |
