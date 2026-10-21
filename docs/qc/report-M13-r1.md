# QC report — M13 round 1

**Verdict:** FAIL
**Ngày:** 2026-10-21  **Commit:** 0ae25a4 (HEAD main; commit M13: 11f8ec4 … 0ae25a4)

## 1. Tóm tắt

- Dựng lại trên **clone sạch với cấu hình git mặc định của máy (core.autocrlf=true)**: npm ci, npm run e2e:install, npm run check, Playwright đủ 3 project, build:native, npx cap sync ios. Sau khi QC re-target 2 test dispute: `npm run check` exit 0 (Vitest 144 file / 2.025 pass / 3 expected fail), Playwright **734/734 pass** (chromium + cloud + native-web), bundle tải lạnh 226,5 / 227,1 kB (<= 230), dist/ và dist-cloud-e2e/ không chứa Capacitor.
- **M12-D2 FIXED**: clone autocrlf=true ra file toàn LF (0 ký tự CR) nhờ .gitattributes `* text=auto eol=lf`; không còn test đỏ vì CRLF. Hai test đỏ ở lần chạy đầu chỉ là 2 dispute (mục 6).
- **1 defect Major (M13-D1)**: trên app native, khi khởi động thất bại ở bước bootstrap (màn lỗi storage S8) thì SplashScreen.hide() không bao giờ được gọi và cũng không có mốc dự phòng 3 s, nên launch image (launchAutoHide: false) phủ kín màn lỗi. Tái hiện 3/3 lần bằng spec QC. M13-AC4 (nhánh dự phòng 3000 ms) không đạt cho đường lỗi này.
- 2 Minor (M13-D2, M13-D3). Không Critical.
- AC1, AC2, AC3, AC5, AC7, AC8 PASS (phần kiểm được trên Windows); AC4 **FAIL một phần** do M13-D1; AC6 NOT VERIFIED (cần NV-12/13/19).
- Không kiểm được trên máy này: build/ký/upload thật trên macos-26 (NV-12), iPhone thật (NV-13), App Store Connect processing (NV-19).

## 2. Môi trường và lệnh đã chạy

Windows 11, Node v22.14.0, npm 10.9.2, không Mac/Xcode/Docker. Clone sạch ở scratchpad (git clone mặc định, autocrlf=true, không .env.local). Lưu ý môi trường (không phải lỗi sản phẩm): đường dẫn scratchpad quá dài (exe Chromium 266 ký tự > 260) làm lần chạy e2e đầu ENOENT ngay lập tức; chạy lại bằng PLAYWRIGHT_BROWSERS_PATH trỏ tới thư mục browser của repo chính (giống M12), phần còn lại giống `npm run test:e2e`.

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Cài | npm ci; npm run e2e:install | exit 0; exit 0 |
| Line ending | đếm CR trong src/test/ci-workflows.test.ts trên clone autocrlf=true | 0 (checkout toàn LF) |
| Check lần 1 (trước re-target) | npm run check | exit 1: **chỉ 2 test** tests/qc/m12-r1-static.test.ts (dispute); 1.989 pass |
| Check sau re-target | npm run check | **exit 0**: lint 0/0, tsc 0, Vitest 144 file / 2.025 pass / 3 expected fail, build:e2e ok |
| E2E 3 project | playwright test (8 worker, 8,3 phút) | **734 passed, exit 0** (2 dòng x là test.fail đã biết: M10-D6, M11-D1, tính là pass) |
| native-web riêng | playwright test --project=native-web | 33 test pass (23 cũ + 10 spec QC mới, trong đó 1 là test.fail M13-D1), ổn định --repeat-each 3 |
| Bundle | e2e/m10-bundle.spec.ts (2 file) | chromium **226,5 kB**, cloud **227,1 kB** (ngưỡng 230; M12: 226,0 / 226,7; +0,5 / +0,4 kB) |
| Web không có Capacitor | grep Filesystem/SocialLogin/LocalNotifications/SplashScreen/StatusBar/Keyboard.addListener và capacitor (-i) trên dist, dist-cloud-e2e | 0 file mỗi lệnh; dist/sw.js, dist/manifest.webmanifest có |
| Native build | npm run build:native | exit 0; index-*.js 204,05 kB gzip, native-*.js 4,52 kB, index.css 7,33 kB; không sw.js/manifest |
| Cap sync | npx cap sync ios | exit 0, Found 6 Capacitor plugins (app, filesystem, keyboard, share, splash-screen, status-bar), Sync finished in 0.517s; không file tracked nào đổi |
| Icon/splash deterministic | node scripts/gen-ios-assets.mjs x2 (logo cục bộ copy vào clone) | cả 2 lần SHA-256 **trùng file đã commit**: icon 0df4fb89…, dark dd73b5d6…, light 8c11affd…; thiếu logo/ → thông báo rõ, exit 1 |
| ios-version CLI | 20 tình huống tag/input/version.json/offset (xem AC2) | đúng như AC |
| Audit | npm audit / --omit=dev | 3 moderate (dev, như M12) / **0** (prod) |
| CRLF thủ công | ép CRLF lên ~25 file text rồi chạy các test đọc file | 4 test đỏ (xem M13-D2); không xảy ra với checkout git vì .gitattributes |

## 3. Acceptance criteria

| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M13-AC1 | **PASS (tĩnh) / NOT VERIFIED (chạy thật, NV-12)** | YAML parse (PyYAML 6.0.3): 2 job; testflight: `if` có github.repository == minh-lgm/one-percent-better + lane/tag; macos-26; timeout-minutes 60; concurrency ios-release, cancel-in-progress false; 17 step đúng thứ tự npm ci → lint → typecheck → test → Xcode 26 → build:native → cap sync → ios-version → AuthKey.p8 → archive → exportArchive → cleanup. Archive và export đều có -allowProvisioningUpdates, -authenticationKeyPath/ID/IssuerID; kết quả kiểm bằng grep ARCHIVE/EXPORT SUCCEEDED trên log. Cleanup `if: always()` xoá AuthKey.p8, .p12, profile, keychain, export, archive. Test QC m13-r1-static.test.ts (độc lập test dev): mọi dòng secrets. toàn file đều là phép gán env (0 ngoại lệ); không echo/cat biến secret, không set -x, không upload-artifact/.ipa; job-level env chỉ có 2 giá trị Supabase public + MANUAL_SIGNING (boolean, so sánh secrets.IOS_DIST_CERT_P12_BASE64 với chuỗi rỗng); inputs.* đi qua env, không nội suy vào run; permissions contents: read, không job nào ghi đè; nhánh thủ công `if: env.MANUAL_SIGNING == true`, keychain tạm mật khẩu openssl rand, xoá .p12 ngay sau import, security import ghi ra /dev/null. 5 đột biến trên bản sao (thêm echo khoá, thêm upload-artifact, bỏ if always ở cleanup, thêm secret vào job env, thêm secret vào job simulator) đều làm test đỏ. ExportOptions.plist: app-store-connect, upload, automatic, teamID placeholder, manageAppVersionAndBuildNumber false; -manual.plist: manual, Apple Distribution, provisioningProfiles có khoá io.github.minhlgm.onepercentbetter. Job simulator: không secrets/vars/signing. Chưa chạy thật: NV-12 |
| M13-AC2 | **PASS** | CLI node scripts/ios-version.mjs với GITHUB_ENV tạm: tag ios-v2.3.4 + run 7 → 2.3.4/7; main + input 1.0.1 + run 8 → 1.0.1/8; không tag/input → 1.0.0 (file); tag ios-v1.0 / input 1.0.0-beta / tag -rc1 → exit 1 "must be X.Y.Z (digits only)"; run 0/abc/1.5/thiếu → exit 1 GITHUB_RUN_NUMBER…; offset 100 run 7 → 107; offset rỗng → 7; offset -1/x → exit 1; tag thắng input; input có xuống dòng + INJECT=1 bị từ chối, GITHUB_ENV không bị ghi (không injection); version.json v1.0.0 / {} / không phải JSON → exit 1 thông báo rõ. version.json = MARKETING_VERSION trong pbxproj (1.0.0) |
| M13-AC3 | **PASS (file) / NOT VERIFIED (iPhone, NV-13)** | Decoder PNG độc lập của QC: icon 1024x1024, 8-bit, **colour type 2**, không interlace, không tRNS; 4 góc + biên = #FFFFFF; hộp bao logo căn giữa ±12 px, lề >= 100 px; Contents.json {AppIcon-512@2x.png, universal, ios, 1024x1024}. ios:assets chạy lại 2 lần → SHA-256 trùng file đã commit (deterministic). Đã mở xem ảnh: logo đầy đủ trên nền trắng. Hiển thị trên máy: NV-13 |
| M13-AC4 | **FAIL (một phần) — M13-D1** | PASS: Splash.imageset có ảnh sáng + ảnh appearances luminosity dark, cả hai 2732x2732 RGB, 4 góc đúng #F7F6F2 / #121513, logo/ô trắng ở giữa (đã xem ảnh dark); LaunchScreen.storyboard ảnh Splash trên LaunchBackground (sáng F7F6F2, tối 121513), không label/spinner; launchAutoHide false. Emulation iOS (spec QC): SplashScreen.hide gọi **đúng 1 lần**, sau khi React đã commit (#root có nội dung tại thời điểm gọi, < 2,9 s), không gọi thêm sau 3,5 s / đổi route / đổi theme; web → 0 bridge. **FAIL**: đường bootstrap lỗi (S8) không bao giờ gọi hide và không có timer 3 s (M13-D1) |
| M13-AC5 | **PASS (Chromium + emulation) / NOT VERIFIED (iPhone, NV-13)** | CDP Emulation.setSafeAreaInsetsOverride (top 59, bottom 34) ở 360 px + vi-VN: env() thật đọc 59/34 → .nav padding-bottom 34, đáy nav = đáy viewport, item nav nằm trên vùng Home; main padding-top 75 (16+59); .toast-region bottom 102 (56+34+12); dialog.dialog padding-bottom 58, max-height vh-16-59; .error-page có padding-top > 0; cuộn tới cuối /goals thì block cuối nằm trên nav; không cuộn ngang; axe sạch. Left/right 44 px → nav/main padding 44. Status bar: sáng → style LIGHT, chuyển tối → DARK (nền body #121513), về sáng → LIGHT (#F7F6F2), mỗi lần đổi đúng 1 call; khởi động ở tối → DARK. Keyboard: 2 listener keyboardWillShow/Hide; show → body.keyboard-open, nav ẩn; hide → hiện lại; show lặp không chồng; thiếu plugin Keyboard → app vẫn chạy, nav còn, 0 lỗi. overscroll-behavior none (html/body), scroll-padding (app.css:26,38), viewport-fit=cover, 4 token env(). capacitor.config.ts: Keyboard.resize native, ios.contentInset never. Spec web 360/1440 px M1–M11 pass nguyên (734/734) |
| M13-AC6 | **NOT VERIFIED** | Cần U14…U18 + chạy lane thật (NV-12, NV-13, NV-19), mục 8 |
| M13-AC7 | **PASS** | npm run check exit 0 (sau re-target), test:e2e 3 project 734/734; DoD 13: web không có Capacitor, bundle 226,5 / 227,1 kB; DoD 14: git ls-files không có .p8/.p12/.mobileprovision/.cer/.jks/.keystore/.pem, git ls-files logo rỗng, không .env tracked, không PRIVATE KEY ngoài regex trong test; .gitignore có *.p8 *.p12 *.mobileprovision *.cer logo/; git grep service_role / AgEAMBMGByqGSM49 / sb_secret_ còn 2 dòng đều là regex trong test (M13-D3) |
| M13-AC8 | **PASS** | README iOS release (GitHub Actions) (dòng 250+): bảng secret/variable kèm U-step, lane simulator/testflight, tag ios-v1.0.0, tăng version (version.json/input/tag), lỗi thường gặp (Xcode không phải 26, quyền ký cloud, build number trùng), ký dự phòng U17b; .env.example; handoff đủ NV-12/13/19 kèm người kiểm và bước kiểm |

## 4. Defect

### M13-D1 — Launch image không bao giờ được ẩn khi app native khởi động thất bại ở bước bootstrap (màn lỗi storage S8)  [Major]
- Bước tái hiện: (1) npm run build:native-e2e && npm run preview:native-e2e; (2) mở trang với bridge Capacitor iOS giả (có StatusBar, SplashScreen, Keyboard, App) và indexedDB bị vô hiệu (Object.defineProperty trên window.indexedDB trả undefined) — đúng ca M13-D1 trong tests/qc/native/m13-r1-native-shell.spec.ts; (3) mở http://localhost:4175/; (4) ghi các lời gọi bridge trong 4 s.
- Mong đợi: M13-T4 / M13-AC4 / DESIGN Native shell 2: SplashScreen.hide() gọi đúng một lần sau render đầu, và **dự phòng tự ẩn sau 3 s** để launch image không che app (launchAutoHide: false làm điều này bắt buộc).
- Thực tế: màn S8 "Cannot open local storage" render (heading hiện) nhưng SplashScreen.hide **0 lần** (poll 4 s; 3/3 lần, --repeat-each 3). Trên iPhone thật, launch image sẽ phủ lên màn lỗi vĩnh viễn: người dùng không thấy lời giải thích hay nút Retry. Cũng không gọi StatusBar.setStyle / listener bàn phím vì systemUi.start() chỉ nằm trong startApp.
- Vị trí nghi ngờ: src/main.tsx:35-45 (nhánh !result.ok render StorageError rồi return trước startApp); mốc 3 s chỉ được đặt trong src/app/start.ts (hideSplashOnce), nên mọi đường không qua startApp (bootstrap lỗi; cả loadNativePlatform() ném lỗi) không có cách ẩn splash. Spec QC đang đánh dấu test.fail(true, M13-D1 …); khi sửa xong test sẽ đỏ "expected to fail but passed" → QC vòng sau gỡ đánh dấu.

### M13-D2 — Handoff nói đã chuẩn hoá CRLF trong cloud-migration.test.ts nhưng còn sót sql2  [Minor]
- Bước tái hiện: trong clone, ép CRLF cho supabase/migrations/*.sql rồi npx vitest run src/data/cloud-migration.test.ts.
- Mong đợi: handoff §1(a) / M12-D2: test đọc file chuẩn hoá CRLF → LF trước khi parse.
- Thực tế: 2 test của describe 20261019000000_goal_open_ended.sql (M11-AC8) đỏ vì sql2 = readFileSync(SQL2_PATH, utf8) không chuẩn hoá (chỉ biến sql ở dòng 10 có). Không ảnh hưởng clone git thật (.gitattributes ép LF), chỉ ảnh hưởng worktree CRLF cũ. 2 test QC tương ứng (tests/qc/m11-r1-open-ended.test.ts:252) cùng lỗi — **QC đã sửa** trong vòng này.
- Vị trí nghi ngờ: src/data/cloud-migration.test.ts:101.

### M13-D3 — DoD 14 git grep còn thêm một dòng regex trong test mới của dev  [Minor]
- Bước tái hiện: git grep -nE "AgEAMBMGByqGSM49|service_role|sb_secret_" -- . ":!docs".
- Mong đợi: DoD 14 (đã biết M12-D3: chỉ 1 dòng ở tests/qc/m11-r1-open-ended.test.ts:255).
- Thực tế: thêm src/test/ios-assets.test.ts:98 (regex chặn BEGIN PRIVATE KEY / AgEAMBMGByqGSM49, không phải secret). Cùng loại M12-D3; lệnh DoD nên loại trừ tests/** và src/test/** hoặc tách chuỗi.
- Vị trí nghi ngờ: src/test/ios-assets.test.ts:98.

## 5. Kiểm lại defect vòng trước

| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| M12-D1 (bundle +1,8 kB) | Giữ nguyên (backlog) | M13 thêm +0,5 / +0,4 kB; còn dự phòng ≈ 3,5 / 2,9 kB so với 230 kB trước M14 (33 key) — rủi ro cho M14 |
| M12-D2 (CRLF) | **FIXED** | Clone autocrlf=true toàn LF; npm run check xanh. Sót nhỏ: M13-D2 |
| M12-D3 (DoD 14) | Giữ nguyên (backlog) | Thêm 1 dòng cùng loại: M13-D3 |
| QC-NV randomUUID | **FIXED** | src/domain/uuid.ts; spec QC xoá crypto.randomUUID rồi tạo 2 goal: id đúng UUID v4, không trùng, 0 lỗi (3/3 lần) |
| QC-NV useNow/resume | Chưa làm (chủ định, chuyển M15) | Kiểm ở NV-13 mục mở lại app sau nửa đêm |

## 6. Regression và xử lý 2 dispute

- Regression: toàn bộ 734 e2e (M1…M12 + native) pass; Vitest 2.025 pass. Bench không chạy lại (không đổi domain).
- **Dispute 1 — m12-r1-static, package list đúng 3 plugin: ĐỒNG Ý.** TASKS M13-T4 ghi pin @capacitor/status-bar 8.0.4, @capacitor/splash-screen 8.0.2, @capacitor/keyboard 8.0.6 (khớp ARCH §2 v5.0) nên Package.swift phải có 6 plugin. QC re-target (QC sở hữu tests/qc/**): kỳ vọng 6 tên cụ thể **và** bằng đúng tập @capacitor/* trong dependencies (trừ core/ios), vẫn exact 8.5.3.
- **Dispute 2 — m12-r1-static, simulator lane không secrets: ĐỒNG Ý.** TASKS M13-T1 yêu cầu lane testflight dùng secrets.* (env VITE_*, APPLE_TEAM_ID…); assertion cũ quét toàn file trong khi tên test và M12-AC8 nói về job simulator. QC re-target: job simulator không có secrets. / vars.; toàn file vẫn không có id-token, pages:, contents: write. Bù lại m13-r1-static.test.ts kiểm lane testflight chặt hơn (AC1). Trong lúc sửa, QC phát hiện một regex của chính mình bị lẫn ký tự backspace (lỗi soạn) và đã sửa; lint sạch.
- Lưu ý cho orchestrator: lane testflight chạy npm test (gồm tests/qc/**) trên runner, nên **các sửa của QC phải được commit và push cùng**, nếu không lane dừng ngay ở npm test vì 2 test cũ.
- QC thêm/sửa: tests/qc/m12-r1-static.test.ts (re-target), tests/qc/m11-r1-open-ended.test.ts (chuẩn hoá CRLF), tests/qc/m13-r1-static.test.ts (mới, 35 ca), tests/qc/native/m13-r1-native-shell.spec.ts (mới, 10 ca, 1 ca test.fail cho M13-D1).

## 7. Bảo mật

- Không secret thật trong repo và ios/: không file khoá/chứng chỉ/profile tracked, không .env, không PRIVATE KEY; logo/ ngoài repo; teamID chỉ là placeholder trong plist.
- Workflow: mọi secrets.* chỉ ở dòng gán env; secret ký chỉ vào step cần dùng; inputs.marketing_version đi qua env và bị ios-version.mjs validate (thử chèn xuống dòng → bị từ chối, không ghi GITHUB_ENV); không artifact; không in giá trị; khoá .p8 ghi umask 077 + chmod 600, xoá if always. permissions contents: read. Action chỉ actions/*@v4. Rủi ro còn lại (không phải defect): job-level env đưa 2 secret Supabase (publishable, công khai, được RLS bảo vệ) vào mọi step kể cả npm ci.
- npm audit: 3 moderate (dev, uuid qua xcode qua @capacitor/cli), prod 0.
- git grep service_role: 2 dòng, đều là regex trong test (M12-D3 / M13-D3).

## 8. Chưa kiểm chứng được (NOT VERIFIED)

| ID | Nội dung | Ai kiểm, cách kiểm |
| :- | :- | :- |
| NV-12 / M13-AC1, AC6 | Lane testflight thật trên macos-26 (Xcode 26, ARCHIVE SUCCEEDED, EXPORT SUCCEEDED, ký cloud bằng API key, nhánh thủ công U17b, plutil -replace -json) | Orchestrator sau khi user xong U14…U18 và đã push main: Actions → iOS → Run workflow (lane testflight); chạy lane simulator trước. Ghi link run + số build vào STATUS |
| NV-13 / M13-AC3…AC5 | iPhone thật: icon, launch screen sáng/tối không nháy, safe area (Dynamic Island, Home indicator), status bar theo theme, bàn phím + tab bar ẩn/hiện, overscroll, offline, dữ liệu sau khi tắt app, mở lại sau nửa đêm, window.isSecureContext | User (U19) theo checklist handoff §9 |
| NV-19 / M13-AC6 | App Store Connect processing: không ITMS (icon alpha, encryption), build 1.0.0 (run_number), kích thước ≤ 25 MB | User đọc email/cảnh báo App Store Connect |
| — | env(safe-area-inset-*) trên WebKit thật (QC chỉ kiểm bằng CDP override trên Chromium); Keyboard.resize native có làm tab bar nhảy không | User (NV-13) |

## 9. Đề xuất (không chặn)

- M13-D1: gọi systemUi.hideSplash() (và start()) cũng ở nhánh bootstrap lỗi, hoặc đặt mốc 3 s trước bootstrap.
- computeIosVersion chấp nhận 01.00.000 (số 0 đứng đầu); cân nhắc từ chối.
- Bundle: dự phòng ≈ 2,9 kB cho M14 (33 key) rất mỏng; planner nên xét nới ngân sách hoặc tách chunk trước M14.
- Nhánh ký thủ công truyền CODE_SIGN_IDENTITY / PROVISIONING_PROFILE_SPECIFIER ở dòng lệnh áp cho cả target package SPM; nếu NV-12 báo does not support provisioning profiles thì đó là nguyên nhân (không kiểm được trên Windows).
- Splash fade chưa tôn trọng prefers-reduced-motion (dev đã ghi, để M15).
