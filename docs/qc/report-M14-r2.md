# QC report — M14 round 2

**Verdict:** PASS
**Ngày:** 2026-10-22  **Commit:** 2569dcc (HEAD main; fix 6e6a175 + docs 2569dcc). Thay đổi QC chưa commit: tests/qc/m13-r1-static.test.ts, m14-r1-static.test.ts (re-target), m14-r1-{apple-key,service,ui}.test.ts(x), tests/qc/cloud/m14-r1-explore.spec.ts, và mới m14-r2-{service,ui}.test.ts(x), m14-r2-ios-emulation.pw.ts, playwright.m14r2.config.ts

## 1. Tóm tắt
- Kiểm lại 7 defect của r1 trên clone sạch (core.autocrlf=true) với góc nhìn độc lập: **D3 (Critical) FIXED, D1 (Major) FIXED, D2, D4, D5, D7 FIXED, D6 NOT FIXED (Minor)**. Không còn Critical/Major đang mở.
- D3: kịch bản đầy đủ Delete, Keep, đăng nhập tài khoản khác, dữ liệu lên tài khoản đó, Sign out Remove, đăng nhập lại còn goal: xanh ở 3 tầng (service, E2E web + mock, emulation iOS). Các biến thể (cùng email nhưng tài khoản mới, tài khoản sau đã có dữ liệu, làm việc khi signed-out giữa chừng, Keep rồi không đăng nhập, tombstone không hồi sinh, tài khoản Apple) đều xanh. Kiểm đột biến: bỏ hai dòng markAllDirty trong `SyncService.reset` thì 6 test service + 4 E2E web + 3 emulation đỏ, nên test thật sự bắt được lỗi.
- D1: build native không có VITE_GOOGLE_* và build chỉ có web id đều chỉ còn nút Apple ở Settings/Today/Export hint, Apple vẫn đăng nhập được; build có đủ hai id và web không đổi.
- Hồi quy trên clone sạch: `npm run check` exit 0 (163 file, 2.259 pass, 3 expected fail); Playwright 3 project 778 passed, 0 fail (9,3 phút); bundle 226,4 kB (chromium) / 227,0 kB (cloud), lặp 3 lần ổn định, <= 230; dist và dist-cloud-e2e không chứa Capacitor/social-login; build:native + `cap sync ios` exit 0, 7 plugin.
- Phát hiện mới (đều Minor, không chặn): M14-D8 README đoạn U23 bị hỏng định dạng (ký tự backslash-n thành xuống dòng thật), M14-D9 mock Supabase không ghi được REST cho tài khoản tạo bằng id_token, M14-D10 copy iOS vẫn nhắc "Apple or Google" khi nút Google bị ẩn.
- NOT VERIFIED: AC10 (NV-14/15/16) cần iPhone, Google/Apple thật, project Supabase thật; xem mục 8. AC10 không tính là PASS, orchestrator cần hỏi user (U20…U24).

## 2. Môi trường và lệnh đã chạy
Windows 11, Node v22.14.0, npm 10.9.2; không Mac/Xcode/Docker/Deno. Clone sạch ở scratchpad (`m14r2/repo`, từ HEAD 2569dcc, `core.autocrlf` = true), file QC mới/sửa được chép vào clone. Đường dẫn clone dài nên Chromium tải về clone không spawn được; các lượt Playwright chạy với `PLAYWRIGHT_BROWSERS_PATH` trỏ tới Chromium của repo chính (cùng phiên bản 1248). Cổng 54321, 54399, 4173-4178 trống trước khi chạy (không còn mock cũ).

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Cài | npm ci; npm run e2e:install | exit 0 |
| Check lần 1 (mã dev + test QC r1 đã gỡ it.fails) | npm run check | exit 1: 2 test QC tĩnh đỏ (m13-r1-static, m14-r1-static) vì README.md (đổi trong 6e6a175) nay chứa dòng tiêu đề PEM làm ví dụ, không có thân khoá. Không phải lỗ hổng; QC re-target regex (tiêu đề + thân base64 >= 40 ký tự). Phần README: xem M14-D8 |
| Check lần 2 | npm run check | **exit 0**: lint 0, typecheck 0, Vitest 163 file / 2.259 pass / 3 expected fail (cũ M10/M11), build:e2e ok |
| Test QC đơn vị, 3 lần | vitest tests/qc/m14-r1-{apple-key,service,ui,function,static}, m13/m12-r1-static, m14-r2-{service,ui}, supabase | 16 file / 176 pass, 3/3 lần ổn định |
| Playwright | npx playwright test (chromium + cloud + native-web) | **778 passed**, 0 fail (9,3 phút). 5 dòng x đều là test.fail đã biết: M10-D6, M11-D1, và 3 ca QC của M14-D6 |
| Emulation iOS r1 | playwright -c tests/qc/playwright.m14.config.ts (build native-e2e đủ hai id, mock 54399) | 11/11 pass, 3 lần liên tiếp |
| Emulation iOS r2 | QC_VARIANT=ids / noid / webonly với tests/qc/playwright.m14r2.config.ts (3 build native-e2e: đủ id, không id, chỉ web id) | ids 3/3, noid 4/4, webonly 4/4; mỗi biến thể 3 lần liên tiếp |
| Kiểm đột biến D3 | trong clone: thay hai lệnh markAllDirty ở SyncService.reset bằng comment; chạy lại | m14-r2-service 6 đỏ; E2E cloud (QC + dev) 4 đỏ; emulation ids 3 đỏ. Đã khôi phục nguồn (git status sạch ngoài tests/qc) và build lại |
| Bundle | e2e/m10-bundle.spec.ts + e2e/cloud/m10-bundle.spec.ts, repeat-each 3 | chromium 226,4 kB / 8 response; cloud 227,0 kB / 10 response (ngưỡng 230), 3/3 lần |
| Web không Capacitor | npm run build rồi grep capacitor/social-login/SocialLogin/LocalNotifications/SplashScreen/@capgo trên dist, dist-cloud-e2e | 0 file ở cả hai |
| Native | npm run build:native; npx cap sync ios | exit 0; "Found 7 Capacitor plugins for ios"; không file tracked đổi |
| D4 mock | script node: id_token sign-in + PUT /user + delete-account, rồi /__test/log, /__test/reset, /__test/log | trước reset [1,1,1], sau reset [0,0,0] |
| DoD 14 | git ls-files key/cert/.env; git grep AgEAMBMGByqGSM49, sb_secret_, VITE_* chứa APPLE/SERVICE/SECRET/PRIVATE ngoài docs và tests/qc | 0 file, 0 dòng; tên biến service-role chỉ ở supabase/functions/delete-account/index.ts (+ test tĩnh của dev) |
| Audit | npm audit --omit=dev; npm audit | 0 lỗ hổng ở dependency chạy thật; 5 moderate đều devDependency (@vitest/mocker, uuid qua @capacitor/cli/xcode), không đổi so với M12 |

## 3. Acceptance criteria
| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M14-AC1 | PASS | Không đổi so với r1; auth-service.native.test và emulation 11/11 xanh lại, 3 lần |
| M14-AC2 | PASS | Không đổi; social-login.test xanh, emulation (initialize 1 lần, nonce digest) xanh |
| M14-AC3 | PASS (mock) | Không đổi; emulation id_token, PUT /user, Google rồi Apple cùng email cùng user xanh. Thêm r2: Apple đăng nhập bằng email của u1, xoá Keep, rồi Google u2: Apple được hỏi đúng 2 lần |
| M14-AC4 | PASS | Không đổi (handler + apple.ts + 14 ca QC function xanh 3 lần). Thêm D7: PEM dạng backslash-n hai ký tự, ngoặc kép đơn/kép, CRLF, CRLF thoát, một dòng, newline thừa đều tạo client secret ES256 mà chữ ký verify được bằng khoá công khai tương ứng; chuỗi rác và chuỗi rỗng vẫn bị từ chối |
| M14-AC5 | PASS | M14-D3 và M14-D2 FIXED (mục 5). Service: 11 ca QC r2 + 4 ca QC r1 + ca của dev xanh; kịch bản D3 xanh ở 3 tầng; D2: clearUserData ném thì không ném lỗi, state signed-out, kết quả keepData true, dữ liệu vẫn ở máy |
| M14-AC6 | PASS (mock) | e2e/cloud/m14-delete-account và các ca khám phá QC r1 xanh trong 778; D5 FIXED; M14-D6 (Minor) còn mở, xem mục 4 |
| M14-AC7 | PASS (emulation + component); NOT VERIFIED (iPhone) | M14-D1 FIXED: capabilities.googleSignIn; 3 build x 3 lần. Emulation r1 (Apple trên Google, màu, cao >= 44, axe, vi) vẫn 11/11. Web 0 chữ Apple vẫn xanh |
| M14-AC8 | PASS (tĩnh) | Không đổi; 6e6a175 không đụng file iOS; test tĩnh m12/m13/m14 xanh sau re-target README |
| M14-AC9 | PASS | DoD 13/14 như mục 2; bundle 226,4 / 227,0 kB; không VITE_* chứa secret; chỉ Edge Function đọc service-role |
| M14-AC10 | NOT VERIFIED | NV-14/15/16, mục 8 |
| M14-AC11 | PASS | design-copy + parity xanh; vi + dark + 360 px của D6 (r1 + r2) axe 0, không rò vi; vi-VN emulation Apple-only xanh (M14-D10 là câu hỏi copy, không rò ngôn ngữ) |
| M14-AC12 | PASS | check exit 0, Playwright 778/778, bundle <= 230, build:native + cap sync ios exit 0; số đo trong handoff fix log khớp QC (bundle 226,4 / 227,0). Điểm trừ nhỏ: README U23 (M14-D8) |

## 4. Defect
### M14-D6 — D6 ở 360 x 740: Alert lỗi vẫn bị hàng nút dính che mất khoảng nửa dưới  [Minor]  (mở từ r1; fix 6e6a175 chưa đạt)
- Bước tái hiện (tự động hoá: 3 ca test.fail nhóm "QC M14 r2" trong tests/qc/cloud/m14-r1-explore.spec.ts): viewport 360 x 740 (cũng 360 x 480), đăng nhập, Settings, Delete account, ép function trả 500 (`/__test/fail?path=delete-account&status=500`), bấm xác nhận.
- Mong đợi: mockup D6-e và fix log: Alert nằm ngay trên hàng nút, đọc được hết.
- Thực tế: bounding box Alert y 507 đến 683, hàng `.actions` (sticky) y 602 đến 739: khoảng 81 px dưới của Alert nằm sau hàng nút, chữ cụt ("Check your" rồi bị che). `scrollTop` của dialog vẫn 0 sau khi lỗi hiện (dialog còn cuộn được 101 px: scrollHeight 823, clientHeight 722). Cùng kết quả ở vi + dark và ở 360 x 480 (Alert kết thúc ở y 467, hàng nút bắt đầu ở 342). Người dùng trình đọc màn hình vẫn nghe được qua role=alert; người dùng thường phải cuộn.
- Vị trí nghi ngờ: src/ui/components/DeleteAccountDialog.tsx effect lỗi (~dòng 60-66) gọi scrollIntoView với block 'nearest': Alert đã nằm trong khung nhìn của dialog nên trình duyệt không cuộn, trong khi hàng nút sticky (~137 px) phủ lên nó; `scroll-margin-bottom: 12px` ở src/ui/styles/app.css (`.dialog .alert`) nhỏ hơn nhiều so với chiều cao hàng nút.

### M14-D8 — README mục U23: đoạn Apple secrets bị hỏng định dạng, ký tự backslash-n trở thành xuống dòng thật  [Minor]
- Bước tái hiện: mở README.md dòng 198-201 (đoạn "Then Supabase Dashboard → Edge Functions → Secrets").
- Mong đợi: đoạn văn một khối, có ví dụ env-file với APPLE_PRIVATE_KEY nội dung .p8 xuống dòng bằng ký tự backslash-n, và câu "the two characters backslash-n" (đúng như handoff U23 dặn owner).
- Thực tế: dòng 198 dừng sau "The", dòng 199 là "…", dòng 200 bắt đầu bằng dòng END của PEM rồi câu "the two characters" kết thúc bằng dấu backtick mở, dòng 201 bắt đầu bằng backtick đóng. Tức mọi dấu backslash-n trong câu lệnh patch của dev đã thành xuống dòng thật. Người đọc không thấy ký tự cần gõ, ví dụ lệnh bị đứt. Hệ quả phụ: README nay chứa dòng tiêu đề PEM (không có thân khoá) làm hai test tĩnh QC đỏ cho tới khi re-target.
- Vị trí nghi ngờ: README.md ~dòng 198-201 (commit 6e6a175).

### M14-D9 — Mock Supabase: ghi REST (goals/entries/settings) thất bại 500 với tài khoản do grant id_token tạo  [Minor]  (hạ tầng test, không ảnh hưởng app thật)
- Bước tái hiện: build native-e2e với mock, đăng nhập Google (sheet giả) bằng email chưa có trong USERS (vd again@example.com), tạo goal, xem sync-indicator.
- Mong đợi: chú thích `keyFor` và ARCH 5.11: tài khoản tạo bằng id_token có dữ liệu giữ dưới user id, đồng bộ được.
- Thực tế: sync-indicator `error` ("Couldn't sync") ngay sau đăng nhập; log mock chỉ có OPTIONS + POST /rest/v1/goals rồi dừng. Nguyên nhân: `upsertRow` và `upsertSettings` đọc `USERS[userKey].id` nhưng userKey là user id sinh ngẫu nhiên nên `USERS[...]` là undefined. Hệ quả: test emulation r1 chỉ kiểm `sync-details` hiện (hiện cả khi lỗi) nên không phát hiện; QC r2 phải dùng u1/u2 cho kịch bản cần sync, và với "cùng email nhưng id mới" chỉ kiểm được việc app đã POST goals tới tài khoản mới.
- Vị trí nghi ngờ: e2e/mock-supabase/server.mjs ~dòng 340 và 355 (cũng dòng 698-700, seed).

### M14-D10 — Copy iOS vẫn nhắc "Apple or Google" khi nút Google bị ẩn  [Minor]
- Bước tái hiện: build native không có VITE_GOOGLE_* (lane simulator hoặc TestFlight trước U21), Settings khi chưa đăng nhập.
- Mong đợi: lời dẫn và ghi chú khớp với các nút đang có (chỉ Apple).
- Thực tế: `settings.account.descSignedOutIos` = "Sign in with Apple or Google to keep a copy ..." và `hideEmailNote` nói về "a Google account" trong khi chỉ có nút Apple. Dev chủ ý không thêm chuỗi mới nên đây là lựa chọn thiết kế cần designer/planner xác nhận; không ảnh hưởng bản có đủ client id.
- Vị trí nghi ngờ: src/i18n/resources/en.json và vi.json (khoá settings.account.descSignedOutIos, hideEmailNote), src/ui/components/AccountCard.tsx.

## 5. Kiểm lại defect vòng trước
| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| M14-D3 (Critical) | **FIXED** | Gỡ 2 test.fail; sửa ca đầu dùng `merge-dialog` (dialog luôn có trong DOM nên dùng toBeHidden thay vì count 0). E2E cloud: Keep rồi Other User: không D5, u2 có "Cloud goal" + entries, thiết bị còn goal; Sign out Remove rồi đăng nhập lại u2: goal còn. Biến thể xanh: u2 đã có goal trên server thì gộp thành 3 goal; Keep rồi tạo goal khi signed-out rồi đăng nhập; Keep không đăng nhập + reload (dữ liệu nguyên, signed-out, đúng 1 request xoá, u2 rỗng). Service (m14-r2-service, 11 ca): cùng email id mới, làm việc khi signed-out, tombstone không hồi sinh, Remove không upload, signOut Keep thường không đánh dấu dirty lại. Emulation iOS: Google cùng email sau Keep (tài khoản mới id khác): app POST goal lên tài khoản mới, không D5; Keep, u2, Remove, u2 lại: còn; Apple rồi Keep rồi Google u2: dữ liệu theo sang. Đột biến bỏ markAllDirty thì đỏ |
| M14-D1 (Major) | **FIXED** | capabilities.googleSignIn: web true, native đủ 2 id true, thiếu id false. Unit (m14-r1-ui gỡ it.fails; m14-r2-ui): AccountCard, Today banner, ExportSignInHint chỉ có Apple, bấm Apple vẫn qua sheet Apple không qua PKCE, web không đổi. Emulation build noid và webonly: đúng 1 nút trong card (cao >= 44), không có testid google-sign-in, axe 0, không cuộn ngang, vi-VN đủ, Apple đăng nhập đủ vòng, initialize không có cấu hình google, sau sign out vẫn không có nút Google |
| M14-D2 (Minor) | **FIXED** | Gỡ it.fails; clearUserData ném: không ném, state signed-out, kết quả `{ appleRevoked: 'not-applicable', hadApple: false, keepData: true }`, goal còn trên máy. Toast "Account deleted. Your data is still on this device." theo fix log và test của dev (QC kiểm tầng service) |
| M14-D4 (Minor) | **FIXED** | `/__test/reset` đưa idTokenSignIns/userUpdates/deletions về 0 (mục 2) |
| M14-D5 (Minor) | **FIXED** | E2E (en sáng, vi tối, 360 x 740): trạng thái busy có class delete-status, nền trong suốt, viền 0, màu trùng --text-muted, cỡ 14 px; sau đó lỗi hiện, focus ở nút xác nhận, axe 0, không cuộn ngang. Xanh 3 lần |
| M14-D6 (Minor) | **NOT FIXED** | Xem mục 4; 3 ca test.fail (en 360 x 740, vi tối 360 x 740, 360 x 480) ổn định 3/3 lần. Khi sửa xong, bỏ test.fail |
| M14-D7 (Minor) | **FIXED** | Gỡ it.fails; 9 biến thể dán khoá (xem AC4), chữ ký verify được, đầu vào rác vẫn bị từ chối. Cách dán mô tả trong README bị hỏng định dạng: M14-D8 |

## 6. Regression
- Playwright 778/778 (chromium + cloud + native-web) trên clone sạch: M1-M11 và native shell M12/M13 không đổi assertion; Google PKCE: E2E cloud đăng nhập/sync/sign out xanh; web không có Apple.
- Test QC cũ: re-target m13-r1-static và m14-r1-static (README chứa tiêu đề PEM ví dụ không còn bị coi là khoá; vẫn bắt mọi tiêu đề PEM kèm thân base64 >= 40 ký tự và tiền tố PKCS#8). Kiểm lại: không file khoá/cert/.env tracked.
- Lưu ý vận hành (như r1): thư mục build tạm trong repo (dist-qc-*) và file untracked chứa literal tên biến service-role làm đỏ test tĩnh của dev; QC build trong clone.
- Deviation ghi nhận (không phải defect): `AppCapabilities.googleSignIn` là field thêm ngoài ARCH 5.12; planner cập nhật ARCH ở lần revise sau.

## 7. Bảo mật
- Không secret/khoá/.env bị commit; DoD 14 sạch; 6e6a175 không đổi hành vi bảo mật của Edge Function (pemToPkcs8 chấp nhận thêm định dạng, đầu vào rác vẫn bị từ chối, log vẫn chỉ tên sự kiện cố định).
- `markAllDirty` khi forgetLastUser chỉ chạm hàng trên thiết bị; sau khi xoá, request chỉ đi với JWT tài khoản mới. Hàng của tài khoản đã xoá không còn trên mock (cascade).
- npm audit: 0 lỗ hổng dependency chạy thật; 5 moderate devDependency.
- Không đọc .env, không gọi project Supabase thật.

## 8. Chưa kiểm chứng được (NOT VERIFIED)
| ID | Lý do | Người kiểm và bước |
| :- | :- | :- |
| NV-14 Google native thật | Không iPhone/Xcode, không client id thật | User (U24 sau U21 + TestFlight M14): iPhone, Settings, Account, Sign in with Google, chọn tài khoản, card hiện Gmail; lỗi nonce thì bật Skip nonce check (ARCH mục 10). Bản không có VITE_GOOGLE_* chỉ được có nút Apple |
| NV-15 Apple thật | Như trên | User (U24 sau U20/U22): chia sẻ email thật thì có tên + email; đăng xuất, Google cùng email thì cùng dữ liệu; Hide My Email thì tài khoản riêng; link panel mở Safari |
| NV-16 Xoá thật trên Supabase | Edge Function chưa deploy (U23), cấm gọi project thật | User (U24 sau U23): tài khoản thử; Users biến mất, 0 hàng Table Editor; Apple: app biến khỏi Cài đặt, Apple ID, Đăng nhập và bảo mật; thiết bị 2 hiện Sign in again; curl không token trả 401; log function chỉ có event deleted. Thêm: Keep data rồi đăng nhập tài khoản khác thì dữ liệu lên tài khoản đó (D3 trên Supabase thật) |
| Xcode build thật với pbxproj/entitlements mới | Không có Mac | Lane simulator/testflight trên GitHub Actions (kiểm tĩnh đã đạt) |
| Glyph Apple chính thức (OQ-D28); hiển thị trên iPhone thật; D6 Alert trên iPhone (M14-D6) | Dev dùng SVG tự vẽ; WKWebView có thể cuộn khác Chromium | Designer/user trước khi nộp review |
| Hành vi GoTrue/PostgREST thật so với mock; ghi REST cho tài khoản id_token (M14-D9) | Mock không phải dịch vụ thật | NV-15/NV-16 |

## 9. Đề xuất (không chặn)
- Dev (backlog Minor): D6 (chừa chỗ cho hàng nút dính, vd scroll-margin-bottom bằng chiều cao hàng nút hoặc cuộn dialog tới cuối), D8 (sửa lại đoạn README), D9 (mock dùng keyFor/user id thay cho USERS[userKey].id), D10 (designer chốt copy khi Google ẩn).
- Planner: thêm AC kiểm hàng lên server sau Keep + đăng nhập lại (D3), AC ẩn nút Google khi thiếu client id (D1), ghi `googleSignIn` vào ARCH 5.12.
- Trước khi push web M14: U23 (deploy Edge Function + secrets), vì web M14 có nút Delete account gọi function đó.
