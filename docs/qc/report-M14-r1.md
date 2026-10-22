# QC report — M14 round 1

**Verdict:** FAIL
**Ngày:** 2026-10-22  **Commit:** c6d7986 (HEAD main). Thay đổi QC chưa commit: tests/qc/m12-r1-static.test.ts, m13-r1-static.test.ts (re-target), tests/qc/m14-r1-{function,service,static,ui,apple-key}.test.ts(x), tests/qc/cloud/m14-r1-explore.spec.ts, tests/qc/m14-r1-ios-emulation.pw.ts, tests/qc/playwright.m14.config.ts

## 1. Tóm tắt
- Clone sạch (core.autocrlf=true): npm ci, e2e:install, build, lint, typecheck, Vitest, Playwright 3 project, bundle, build:native, cap sync đều chạy. Trên mã dev: `npm run check` đỏ đúng 3 test QC cũ (M12 x2, M13 x1) do thay đổi hợp lệ của M14. QC đã tự kiểm plan (Package.swift 7 plugin, CODE_SIGN_ENTITLEMENTS, entitlements Apple) và re-target; sau đó `npm run check` exit 0 (160 file, 2.230 pass, 5 expected fail).
- Playwright 3 project: 770 passed (8,6 phút), 0 fail; 4 dòng x đều là test.fail đã biết (M10-D6, M11-D1) hoặc của QC (M14-D3). Bundle tải lạnh 226,3 kB (chromium) / 226,9 kB (cloud), lặp 3 lần ổn định, <= 230. dist và dist-cloud-e2e không chứa Capacitor/social-login.
- Làm đúng: Edge Function (verify JWT trước khi xoá, thứ tự getUser, deleteUser, Apple; CORS; không log secret), web không có nút Apple, Google PKCE không hồi quy, D6 mọi trạng thái, emulation iOS bằng bridge giả 11/11 (3 lần liên tiếp).
- **FAIL vì 1 Critical + 1 Major còn mở**: M14-D3 (dữ liệu giữ lại sau khi xoá tài khoản không được đẩy lên tài khoản mới, dẫn tới mất dữ liệu im lặng) và M14-D1 (iOS vẫn hiện nút Google khi thiếu VITE_GOOGLE_*, trái M14-T2 và handoff mục 8). 5 Minor (D2, D4, D5, D6, D7) vào backlog.
- NOT VERIFIED: AC10 (NV-14/15/16) cần iPhone, Google/Apple thật, project Supabase thật; xem mục 8.

## 2. Môi trường và lệnh đã chạy
Windows 11, Node v22.14.0, npm 10.9.2; không Mac/Xcode/Docker/Deno. Clone sạch ở scratchpad. Đường dẫn clone quá dài nên Chromium tải về clone không spawn được (một lượt Playwright đầu 731 fail do không khởi chạy được trình duyệt, không phải lỗi app); các lượt chính chạy `npx playwright test` với `PLAYWRIGHT_BROWSERS_PATH` trỏ tới Chromium của repo chính (cùng phiên bản 1248). `npm run e2e:install` trong clone vẫn chạy thành công.

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Cài | npm ci; npm run e2e:install | exit 0 |
| Check (mã dev) | npm run check | lint 0, typecheck 0, Vitest 156 file / 2.193 pass / **3 fail** / 3 expected fail: m12-r1-static x2, m13-r1-static x1 (khớp handoff) |
| Check (sau re-target + test QC) | npm run check | exit 0: Vitest 160 file / 2.230 pass / 5 expected fail; build:e2e ok |
| Test QC cũ đỏ | vitest m12-r1-static, m13-r1-static, nhiều lần | đỏ ổn định trước re-target, xanh ổn định sau (3 lần) |
| Edge Function | vitest supabase/functions + tests/qc/m14-r1-function | dev 22/22; QC 14 ca (handler 9, index.ts qua Deno shim 5) xanh, 3 lần ổn định |
| Playwright | npx playwright test (chromium + cloud + native-web) | 770 passed, 0 fail (lượt cuối); lượt trước 766 passed + 3 fail của spec QC mới (đã sửa) |
| iOS emulation | playwright -c tests/qc/playwright.m14.config.ts (build native-e2e cloud ON, mock cổng 54399, bridge Capacitor giả + SocialLogin) | 11/11 pass, 3 lần liên tiếp |
| Bundle | e2e/m10-bundle.spec.ts + e2e/cloud/m10-bundle.spec.ts, repeat-each 3 | chromium 226,3 kB / 8 response; cloud 226,9 kB / 10 response (ngưỡng 230) |
| Web không Capacitor | grep capacitor/SocialLogin/Filesystem/LocalNotifications/SplashScreen trên dist, dist-cloud-e2e | 0 file |
| Native | npm run build:native; npx cap sync ios | exit 0; 7 plugin (có @capgo/capacitor-social-login 8.7.4); không file tracked đổi; native-*.js 13,4 kB gzip, index 168,2 kB |
| Bench | npm run bench | 13/13 pass |
| DoD 14 | git ls-files key/cert; git grep AgEAMBMGByqGSM49, service_role, sb_secret_ (loại docs, tests/qc) | 0 file key; 0 dòng; tên biến service-role của function chỉ ở supabase/functions/delete-account/index.ts (+ test tĩnh của dev) |
| Audit | không chạy lại | không đổi dependency ngoài @capgo 8.7.4; xem mục 9 |

## 3. Acceptance criteria
| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M14-AC1 | PASS | auth-service.native.test (12) xanh trong check; QC emulation: Apple, Google sheet, huỷ, lỗi, nonce sai (token gắn nonce khác) bị mock từ chối → thông báo AUTH_FAILED_native, offline vô hiệu nút; signOut gọi logout(provider) |
| M14-AC2 | PASS | social-login.test (14) xanh; QC emulation thấy initialize đúng 1 lần với apple useProperTokenExchange true, không clientId; login apple options scopes name+email, nonce 64 hex; mock kiểm sha256(raw) = claim nonce. Đối chiếu plugin 8.7.4: Swift AppleProvider trả authorizationCode ở top-level khi useProperTokenExchange, request.nonce = digest |
| M14-AC3 | PASS (mock) | supabase-client.m14.test xanh; emulation: 1 POST grant_type=id_token, đúng 1 PUT /user khi Apple trả tên (token Apple không có claim name, giống thật), Hide My Email → user riêng, Google rồi Apple cùng email → cùng user, "Signed in with Apple or Google". Mock khớp hiểu biết về tài liệu Supabase (nonce hex/raw, link theo email, PUT user); không tra cứu trực tuyến được trong phiên này |
| M14-AC4 | PASS | handler 15 + apple 7 xanh; QC bổ sung: JWT hết hạn/giả/user đã xoá → 401 có CORS; Bearer sai dạng → 401; Apple lỗi mạng/Abort/revoke lỗi sau deleteUser → 200 manual-required, tài khoản vẫn xoá, log chỉ tên sự kiện cố định; Apple không bị gọi trước khi deleteUser resolve; code gửi cho tài khoản không Apple bị bỏ qua; gọi lần 2 → 401; PATCH/PUT → 405; body JSON hỏng vẫn chỉ xoá chủ JWT; index.ts: 1 admin client persistSession=false, getUser(jwt) rồi deleteUser(id từ JWT, không từ body), lỗi admin → 500 không lộ chi tiết, ALLOWED_ORIGINS override. verify_jwt=false hợp lý: handler tự gọi getUser trước mọi thao tác xoá (test tĩnh QC thứ tự getUser < deleteUser < exchange). Hai request song song cùng JWT: một 200, một 500, không bao giờ hai 200 |
| M14-AC5 | **FAIL một phần** | Phần service (13 + 4 ca của dev) xanh, nhưng khi giữ dữ liệu rồi đăng nhập lại, dữ liệu không được đẩy lên tài khoản mới (M14-D3), trái A-61/A-27 "gộp im lặng như thiết bị mới". Thêm M14-D2 (Minor) |
| M14-AC6 | PASS (mock) | e2e/cloud/m14-delete-account 7/7 + m14-cloud-off xanh trong 770; QC explore: busy (aria-busy, aria-disabled giữ focus, Cancel + radio disabled, Esc và backdrop bị bỏ qua, bấm lại không gửi request thứ hai), 500 → Alert, focus confirm, thử lại thành công; 401 → ACCOUNT_DELETE_SESSION_EXPIRED; abort mạng → báo lỗi, thử lại ok; chậm > 20 s → ACCOUNT_DELETE_FAILED; hai tab; reload khi D6 mở; vi + dark + 360 px axe 0, không rò vi, không cuộn ngang. Điểm trình bày: M14-D5, M14-D6 (Minor) |
| M14-AC7 | PASS (emulation + component); NOT VERIFIED (iPhone) | Emulation 360 px sáng + tối: Apple trên Google, cùng rộng, cao >= 44, nền/chữ đúng (sáng đen/trắng, tối trắng/đen), cách >= 12, axe 0, không cuộn ngang, vi-VN đủ chữ; D6 có appleNote, confirm mở sheet Apple lần nữa và gửi authorizationCode, huỷ Apple → ACCOUNT_DELETE_CANCELLED không gửi request, không code → manual-required → panel có link https://support.apple.com/102571 target=_blank rel=noopener, Dismiss trả focus về h2. Web: 0 nút Apple, 0 chữ Apple ở Settings/Today (e2e QC). **Nhưng M14-D1 (Major):** nút Google vẫn hiện trên iOS khi Google native không khả dụng |
| M14-AC8 | PASS (tĩnh) | entitlements đúng 1 key applesignin = Default; pbxproj CODE_SIGN_ENTITLEMENTS x2 (Debug + Release), file ref không nằm trong build phase, id object duy nhất, ngoặc cân bằng, GOOGLE_IOS_URL_SCHEME placeholder x2; Info.plist CFBundleURLTypes chỉ biến GOOGLE_IOS_URL_SCHEME, không GIDClientID/client id thật; ios.yml VITE_GOOGLE_* từ vars, scheme truyền cho xcodebuild; capacitor.config facebook/twitter false; package.json 8.7.4. Không build Xcode thật (không có Mac): tính hợp lệ pbxproj chỉ kiểm tĩnh |
| M14-AC9 | PASS | DoD 13/14 như mục 2; không VITE_* nào chứa APPLE/SERVICE/SECRET/PRIVATE; chỉ 2 tên VITE_GOOGLE_* công khai, giá trị rỗng trong .env.example, không client id thật bị commit; verify_jwt=false chỉ cho delete-account; chunk SDK vẫn lazy; tải lạnh 226,3 / 226,9 kB |
| M14-AC10 | NOT VERIFIED | NV-14/15/16, mục 8 |
| M14-AC11 | PASS | design-copy.test + parity xanh; quét vi component và E2E (D6 vi, emulation vi-VN, vi + dark + 360) 0 rò chữ |
| M14-AC12 | PASS | check exit 0 (sau re-target), Playwright 770/770 gồm spec M6-M8 cloud không đổi; README có "Sign in on iOS", "Delete account", "Edge Function delete-account (owner)"; privacy.html có mục xoá tài khoản en + vi, giữ email liên hệ; handoff đầy đủ. Lưu ý handoff mục 8 nói Google native ẩn khi thiếu id: sai (M14-D1) |

## 4. Defect
### M14-D3 — Dữ liệu "giữ trên máy" sau khi xoá tài khoản không được gộp vào tài khoản đăng nhập sau; có thể mất dữ liệu im lặng  [Critical]
- Bước tái hiện (đã tự động hoá: tests/qc/cloud/m14-r1-explore.spec.ts, ca "after deletion", dùng test.fail): web cloud + mock; seed u1 một goal "Cloud goal"; đăng nhập Minh Test, đợi Synced; Settings → Delete account → chọn "Keep data on this device" → xác nhận; card về signed-out, Today còn "Cloud goal". Đăng nhập tiếp bằng "Other User". Không có hộp D5, card Synced.
- Mong đợi: PRD A-61 và A-27: đăng nhập sau khi xoá được "gộp im lặng như thiết bị mới", tức dữ liệu trên máy được đưa lên tài khoản mới.
- Thực tế: /__test/rows?user=u2 → goals rỗng (không có "Cloud goal"); card vẫn "Synced". Tiếp tục: Sign out → "Remove data from this device" (không có cảnh báo vì pending = 0, hộp D4 còn nói "Your account keeps everything") → đăng nhập lại Other User → "Cloud goal" biến mất vĩnh viễn (ca test.fail thứ hai).
- Vị trí nghi ngờ: src/services/sync-service.ts handleSignedIn (~dòng 207-217): merged chỉ tính khi decision là merge-silently và countDirty() > 0, bindUser(userId, true) chỉ reset cursor, không đánh dấu dirty các hàng đã đồng bộ của tài khoản cũ đã bị xoá; reset với forgetLastUser (~dòng 284) cũng không. Test của dev chỉ khẳng định prepareFirstSignIn trả merge-silently, không kiểm hàng có lên server.

### M14-D1 — Nút Google vẫn hiện trên iOS khi Google native không khả dụng (thiếu VITE_GOOGLE_*)  [Major]
- Bước tái hiện: tests/qc/m14-r1-ui.test.tsx (it.fails): container iOS với IdTokenProvider chỉ available cho apple (đúng như createSocialLogin báo khi thiếu 1 trong 2 client id), render AccountCard signed-out. Tương đương thực tế: bản iOS lane simulator (không có VITE_GOOGLE_*) hoặc lane testflight trước khi làm U21.
- Mong đợi: TASKS M14-T2 "thiếu → Google native không khả dụng, nút Google ẩn trên native"; dev-M14 mục 8 "app iOS chỉ có nút Apple (Google native ẩn), không lỗi".
- Thực tế: AccountCard, LoginPromptBanner, ExportSignInHint đều vẫn render nút "Sign in with Google" (SignInButtons luôn tạo GoogleSignInButton; capabilities chỉ có nativeAuth/appleSignIn, không có cờ cho Google). Bấm nút → AuthService.signIn với google thấy idTokens.available(google) = false nên rơi về PKCE redirect trong WKWebView (tests/qc/m14-r1-service.test.ts ghi lại: port.signIn gọi 1 lần, không có sheet), luồng mà plan nói không chạy trong WKWebView.
- Vị trí nghi ngờ: src/ui/components/SignInButtons.tsx:46-60; src/app/capabilities.ts:36-42.

### M14-D2 — Lỗi ghi local sau khi server đã xoá tài khoản làm deleteAccount ném lỗi và để trạng thái signed-in trên tài khoản đã chết  [Minor]
- Bước tái hiện: tests/qc/m14-r1-service.test.ts (it.fails): đăng nhập, làm DexieLocalDataRepository.clearUserData ném, gọi deleteAccount với keepData false.
- Mong đợi: sau khi server trả deleted, app thoát trạng thái signed-in và không ném (hoặc báo rõ đã xoá, dọn dữ liệu máy lỗi).
- Thực tế: promise bị reject "IndexedDB blocked", state vẫn signed-in (kv sync.userId đã null, phiên SDK đã xoá); Settings hiện ACCOUNT_DELETE_FAILED trong khi tài khoản đã mất; bấm lại → 401 → "đã xoá rồi".
- Vị trí nghi ngờ: src/services/auth-service.ts ~dòng 380-395 (khối try/finally không bắt lỗi clearUserData trước khi đặt signed-out).

### M14-D4 — /__test/reset của mock Supabase không xoá bộ đếm idTokenSignIns / userUpdates / deletions  [Minor]
- Bước tái hiện: gọi /__test/reset giữa hai test rồi /__test/log: các bộ đếm giữ giá trị cũ. Phát hiện khi emulation báo deletions = 1 trước khi xoá lần nào.
- Mong đợi: reset đưa mọi bộ đếm về 0 (ARCH 5.11). Thực tế: freshState() không có ba khoá đó nên Object.assign không ghi đè.
- Vị trí nghi ngờ: e2e/mock-supabase/server.mjs freshState (~dòng 174-190). Chưa làm đỏ test của dev (họ lọc theo log).

### M14-D5 — D6 trạng thái busy dùng khung đỏ nhạt thay cho chữ trạng thái trung tính theo mockup  [Minor]
- Bước tái hiện: 360 px, Delete account, bấm xác nhận khi function chậm.
- Mong đợi: mockup 09-account.html lớp d6-status: chữ muted 14/20, không nền. Thực tế: lớp remove-note (nền danger-soft, chữ đỏ đậm) nhìn như lỗi trong lúc đang xoá.
- Vị trí nghi ngờ: src/ui/components/DeleteAccountDialog.tsx:115; src/ui/styles/app.css:2196.

### M14-D6 — D6 ở 360 x 740: Alert lỗi bị hàng nút dính che mất nửa, focus ở nút xác nhận  [Minor]
- Bước tái hiện: 360 x 740, ép function lỗi 500, bấm xác nhận.
- Mong đợi: mockup D6-e: Alert ngay trên hàng nút, đọc được. Thực tế: nội dung Alert bị cắt, muốn đọc hết phải cuộn thân dialog; không tự cuộn tới Alert. Người dùng trình đọc màn hình vẫn nghe được qua role=alert.
- Vị trí nghi ngờ: DeleteAccountDialog.tsx (khối error trong dialog-body), app.css hàng nút dính của dialog.

### M14-D7 — APPLE_PRIVATE_KEY có xuống dòng dạng hai ký tự backslash-n làm thu hồi Apple lỗi im lặng  [Minor]
- Bước tái hiện: tests/qc/m14-r1-apple-key.test.ts (it.fails): createClientSecret với PEM mà xuống dòng là ký tự backslash + n.
- Mong đợi: chấp nhận cả hai dạng (handoff U23 dặn viết dạng backslash-n trong env-file). Thực tế: atob ném InvalidCharacterError, handler bắt và trả manual-required, chỉ log apple_revoke_failed.
- Vị trí nghi ngờ: supabase/functions/delete-account/apple.ts pemToPkcs8 (chỉ strip khoảng trắng). CLI thường tự bung dạng này trong ngoặc kép nên có thể không xảy ra; dán qua Dashboard chưa kiểm.

## 5. Kiểm lại defect vòng trước
Không có (vòng 1). Không hồi quy: spec native shell M13 và static M12/M13 xanh.

## 6. Regression
- Playwright 770/770 (chromium + cloud + native-web) gồm spec M6-M8 cloud, M9-M11, native shell M12/M13 không đổi assertion; Google PKCE: E2E cloud đăng nhập/sync/sign out xanh; web không Apple.
- 3 test QC cũ đỏ do M14: QC tự kiểm plan (TASKS M14-T2: Package.swift 7 plugin; M14-AC8: CODE_SIGN_ENTITLEMENTS = App/App.entitlements; ARCH 5.13) → đúng, nên re-target: m12-r1-static "seven after M14" (tên Capgo đọc từ Package.swift của package + pin 8.7.4) và "chỉ file entitlements Apple, không team/profile"; m13-r1-static "chỉ file entitlements Apple". Không phải defect.
- Ghi chú vận hành: test tĩnh của dev (native-auth-static) quét cả file untracked, nên file QC chứa literal tên biến service-role làm đỏ; QC đã tách chuỗi trong test của mình. Thư mục build tạm trong repo (vd dist-qc-native) làm lint và test tĩnh đỏ; QC build ở clone.

## 7. Bảo mật
- Không secret/khoá/.env bị commit; DoD 14 sạch; VITE_GOOGLE_* chỉ là client id công khai, không có client id thật trong repo.
- Edge Function: không chấp nhận request không Bearer; user luôn từ JWT; service-role chỉ trong index.ts; CORS allow-list đúng ARCH; log chỉ gồm fn và event; không echo lỗi nội bộ; Apple client secret ES256 header alg + kid, exp - iat = 300, chữ ký r||s; thứ tự xoá user rồi mới thu hồi Apple đúng spec (lỗi Apple không hoàn tác việc xoá, trả manual-required).
- Không đọc nội dung .env, không gọi project Supabase thật (grmcmidzyqwryaangpug).
- Rủi ro đã nêu: M14-D3 (mất dữ liệu), M14-D7.

## 8. Chưa kiểm chứng được (NOT VERIFIED)
| ID | Lý do | Người kiểm và bước |
| :- | :- | :- |
| NV-14 Google native thật | Không iPhone/Xcode, không client id thật | User (U24 sau U21 + TestFlight M14): iPhone, Settings → Account → Sign in with Google, chọn tài khoản, card hiện Gmail; lỗi nonce → bật Skip nonce check (ARCH mục 10) |
| NV-15 Apple thật | Như trên | User (U24 sau U20/U22): chia sẻ email thật → tên + email; đăng xuất → Google cùng email → cùng dữ liệu; Hide My Email → tài khoản riêng; link panel mở Safari |
| NV-16 Xoá thật trên Supabase | Edge Function chưa deploy (U23), cấm gọi project thật | User (U24 sau U23): tài khoản thử; Users biến mất, 0 hàng Table Editor; Apple: app biến khỏi Cài đặt → Apple ID → Đăng nhập và bảo mật; thiết bị 2 → Sign in again; curl không token → 401; log function chỉ có event deleted |
| Xcode build thật với pbxproj/entitlements mới | Không có Mac | Lane simulator/testflight trên GitHub Actions (kiểm tĩnh đã đạt) |
| Glyph Apple chính thức (OQ-D28), hiển thị trên iPhone thật | Dev dùng SVG tự vẽ | Designer/user trước khi nộp review |
| Hành vi GoTrue thật (app_metadata.providers, nonce) so với mock | Mock không phải GoTrue thật | NV-15/NV-16 |

## 9. Đề xuất (không chặn)
- Planner/dev: thêm AC kiểm hàng lên server sau Keep + đăng nhập lại (M14-D3), và AC ẩn nút Google khi native Google không khả dụng (M14-D1).
- README U23: ghi rõ cách đặt APPLE_PRIVATE_KEY (Dashboard dán nhiều dòng, hoặc env-file) và cách đọc log khi thấy apple_revoke_failed.
- npm audit không chạy lại vòng này; M12 ghi 3 moderate devDependency (uuid qua xcode).
- Mock: reset đầy đủ bộ đếm (M14-D4).
