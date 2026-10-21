> Ghi chú orchestrator (2026-10-21): harness từ chối Write tool của subagent qc ("subagents should return findings as text"), orchestrator chép nguyên văn report QC round 2 trả về vào file này.

# QC report — M13 round 2

**Verdict:** PASS
**Ngày:** 2026-10-21  **Commit:** faccf7f (fix 613e7af + docs faccf7f). Thay đổi QC chưa commit: tests/qc/native/m13-r1-native-shell.spec.ts, tests/qc/m13-r1-static.test.ts

## 1. Tóm tắt
- Clone sạch HEAD faccf7f, core.autocrlf=true: npm ci, npm run check exit 0 (lint 0, tsc 0, Vitest 144 file / 2.027 pass / 3 expected fail, build:e2e ok), Playwright 3 project 750/750 (2 dòng x là test.fail đã biết M10-D6, M11-D1), bundle 226,5 / 227,2 kB, dist và dist-cloud-e2e không chứa Capacitor, build:native + cap sync ios exit 0.
- M13-D1 FIXED: 6 ca QC mới phủ mọi đường khởi động (bình thường, bootstrap treo, ném, error event, Retry, web). Trên mã đã sửa pass 48/48 với --repeat-each 3; trên src cũ (4fa482c) 5 ca đỏ, nên spec phân biệt được lỗi và bản sửa.
- M13-D2, M13-D3 FIXED. Không defect mới. actions @v5 ở ios.yml/pages.yml không gây hồi quy; pages.yml đổi 2 dòng là deviation so với M12-AC2, đã được orchestrator yêu cầu, không tính defect.

## 2. Môi trường và lệnh đã chạy
Windows 11, Node v22.14.0, npm 10.9.2; không Mac/Xcode/Docker. Clone sạch ở scratchpad; Playwright dùng PLAYWRIGHT_BROWSERS_PATH trỏ tới browser của repo chính (đường dẫn scratchpad quá dài, như r1).

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Cài | npm ci | exit 0 |
| Check | npm run check | exit 0: Vitest 144 file / 2.027 pass / 3 expected fail; lint 0; tsc 0; build:e2e ok |
| E2E 3 project | npx playwright test | 750 passed, exit 0 (7,9 phút); 2 test.fail đã biết |
| Spec native shell | playwright test --project=native-web tests/qc/native/m13-r1-native-shell.spec.ts | lần đầu 15 pass / 1 fail (ca randomUUID, flake cold-start, xem mục 6); ca đó --repeat-each 6: 6/6; cả spec --repeat-each 3: 48/48 |
| Đối chứng mã cũ | git checkout 4fa482c -- src rồi -g "M13-D1" | 5 đỏ (ca S8 cũ, S8 throw, S8 errorEvent, Retry, bootstrap treo), 2 xanh (bình thường, web); đã khôi phục HEAD |
| Bundle | e2e/m10-bundle.spec.ts x2 | chromium 226,5 kB; cloud 227,2 kB (ngưỡng 230) |
| Web không Capacitor | grep capacitor và Filesystem/SocialLogin/LocalNotifications/SplashScreen/StatusBar/keyboardWillShow trên dist, dist-cloud-e2e | 0 file |
| Native build / sync | npm run build:native; npx cap sync ios | exit 0; 6 plugin; không file tracked đổi |
| CRLF thủ công | ép CRLF 2 migration SQL rồi vitest cloud-migration + m11-r1-open-ended | 169 pass (r1: 4 đỏ); đã khôi phục |
| DoD 14 | git grep -nE "AgEAMBMGByqGSM49\|service_role\|sb_secret_" -- . ":!docs" | 1 dòng: tests/qc/m11-r1-open-ended.test.ts:255 (M12-D3 đã chấp nhận) |
| Audit | npm audit --omit=dev / npm audit | 0 / 3 moderate (dev) |
| File nhạy cảm | git ls-files lọc .p8/.p12/.mobileprovision/.cer/.pem/.env/logo | 0 |

## 3. Acceptance criteria
| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M13-AC1 | PASS (tĩnh) / NOT VERIFIED (chạy thật, NV-12) | Chỉ đổi 4 dòng checkout/setup-node @v5; m13-r1-static (34 ca) và ci-workflows xanh; uses: chỉ checkout@v5, setup-node@v5, configure-pages@v5, upload-pages-artifact@v3, deploy-pages@v4 |
| M13-AC2 | PASS | scripts/ios-version.mjs không đổi; test xanh |
| M13-AC3 | PASS (file) / NOT VERIFIED (iPhone, NV-13) | Không đổi asset; ios-assets xanh |
| M13-AC4 | PASS (emulation) / NOT VERIFIED (iPhone, NV-13) | (a) bình thường: hide đúng 1 lần sau khi #root có nội dung, < 2,9 s, không gọi lại sau 3,6 s, setStyle 1 lần, 0 lỗi. (b) bootstrap treo: status bar và listener đã sẵn, hide 0 lần trước mốc, rồi đúng 1 lần ở 2,8…4,5 s khi #root trống. (c) indexedDB.open ném và (d) lỗi bằng error event: S8 hiện bản copy native, hide 1 lần < 2,9 s sau commit S8, không gọi lại. (e) Retry 2 lần khi còn lỗi rồi 1 lần thành công: hide vẫn 1, setStyle vẫn 1, listener Keyboard vẫn 2, app render, keyboard-open vẫn bật/tắt. (f) web không bridge: S8 bản trình duyệt, không có bridge. Tĩnh: Splash.imageset sáng/tối, LaunchScreen.storyboard, launchAutoHide false như r1 |
| M13-AC5 | PASS (Chromium + emulation) / NOT VERIFIED (iPhone, NV-13) | Safe area (CDP override), status bar theo theme, keyboard class: pass 3/3 trong repeat-each 3 và full run; mã CSS/system UI không đổi ngoài việc dời start() lên trước bootstrap |
| M13-AC6 | NOT VERIFIED | Cần U14…U18, NV-12, NV-13, NV-19 |
| M13-AC7 | PASS | check exit 0; Playwright 750/750; DoD 13: 226,5 / 227,2 kB; DoD 14 như mục 2 |
| M13-AC8 | PASS | README iOS release, .env.example, handoff §9 đủ NV; Fix log r1 khớp mã (đối chiếu git show 613e7af) |

## 4. Defect
Không có defect mới ở round 2.

## 5. Kiểm lại defect vòng trước
| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| M13-D1 (Major) | FIXED | main.tsx: startNativeShell gọi ngay sau loadNativePlatform(), trước bootstrap, có cờ shellArmed nên Retry không arm lại; FirstRenderSignal ở cả nhánh App và S8; mốc 3 s bao các đường còn lại. QC đã gỡ test.fail và thêm 6 ca; đối chứng src 4fa482c: 5 đỏ; faccf7f: xanh 48/48 |
| M13-D2 (Minor) | FIXED | cloud-migration.test.ts:101 có .replace(/\r\n/g, '\n'); ép CRLF cả 2 migration → 169 pass |
| M13-D3 (Minor) | FIXED | ios-assets.test.ts ghép chuỗi lúc chạy; git grep chỉ còn tests/qc (m11-r1-open-ended:255, M12-D3); QC tách dòng của mình ở m13-r1-static:317 |
| M12-D1 | Giữ nguyên (backlog) | M13 tổng +0,5 / +0,5 kB so với M12; dự phòng ~3,5 / 2,8 kB |
| M12-D2 | FIXED (từ r1) | autocrlf=true: 0 CR |
| M12-D3 | Giữ nguyên (backlog) | 1 dòng trong tests/qc |
| QC-NV useNow/resume | Chuyển M15 | Kiểm ở NV-13 |

Dispute: dev không mở dispute mới ở r2; 2 dispute r1 đã đồng ý và re-target.

## 6. Regression
- Playwright 750/750 và Vitest 2.027 pass: M1…M12 không hồi quy.
- Một lần đỏ không tái hiện: ca "crypto.randomUUID missing" của spec QC (createGoal không thấy heading "New goal" trong 10 s) ở lần chạy spec đầu ngay khi server vừa lên, 8 worker song song. Chạy lại riêng 6 lần, cả spec 3 lần, và full 750: không tái hiện. Phân loại flake cold-start (mẫu giống M7/M10), không gắn với mã M13; theo dõi nếu lặp lại.
- pages.yml: đúng 2 dòng @v4 → @v5 (git diff 3e1ed4e). Deviation so với M12-AC2, chấp nhận vì yêu cầu orchestrator (cảnh báo Node 20 run 39624708770); không đổi bước, path: dist, quyền. Chạy thật @v5 trên ubuntu-latest và macos-26: NOT VERIFIED tới run kế tiếp; rủi ro thấp.

## 7. Bảo mật
Không secret trong repo; workflow chỉ đổi 4 dòng uses: sang action chính thức của GitHub; test tĩnh secrets/permissions/cleanup xanh; S8 không rò thông tin; npm audit prod 0, 3 moderate dev (uuid qua xcode qua @capacitor/cli) như r1.

## 8. Chưa kiểm chứng được (NOT VERIFIED)
| ID | Nội dung | Ai kiểm, cách kiểm |
| :- | :- | :- |
| NV-12 / AC1, AC6 | Lane testflight thật trên macos-26 (ARCHIVE/EXPORT SUCCEEDED, ký cloud, nhánh thủ công U17b); checkout@v5/setup-node@v5 chạy thật | Orchestrator sau khi user xong U14…U18 và push main: Actions → iOS → Run workflow (simulator trước, rồi testflight); ghi link run + build vào STATUS. Run Pages sau push là bằng chứng cho pages.yml @v5 |
| NV-13 / AC3…AC5 | iPhone thật: icon, launch screen sáng/tối không nháy, launch image biến mất sau render đầu (và khi bộ nhớ trong lỗi), safe area, status bar theo theme, bàn phím + tab bar, overscroll, offline, dữ liệu sau khi tắt app, mở lại sau nửa đêm, isSecureContext | User (U19) theo checklist handoff §9 |
| NV-19 / AC6 | App Store Connect processing: không ITMS, build 1.0.0 (run_number), kích thước <= 25 MB | User (U19) đọc email/cảnh báo App Store Connect |
| — | env(safe-area-inset-*) trên WebKit thật; Keyboard.resize native có làm tab bar nhảy không | User (NV-13) |

## 9. Đề xuất (không chặn)
- main.tsx start() không có catch: nếu loadNativePlatform()/createNativePlatform() ném, bridge JS nằm trong chính chunk native nên không thể ẩn splash từ JS; trên bundle cục bộ gần như không xảy ra, chỉ ghi nhận.
- computeIosVersion chấp nhận 01.00.000; cân nhắc từ chối.
- Bundle: dự phòng ~2,8 kB cho M14 (33 key); planner xét nới ngân sách hoặc tách chunk.
- Nhánh ký thủ công truyền CODE_SIGN_IDENTITY / PROVISIONING_PROFILE_SPECIFIER cho cả target SPM; nếu NV-12 báo lỗi provisioning thì đây là nguyên nhân khả dĩ.
- Splash fade chưa tôn trọng prefers-reduced-motion (để M15).
- upload-pages-artifact@v3 / deploy-pages@v4 có thể còn cảnh báo Node 20 qua upload-artifact bên trong; xem log run Pages kế tiếp.
- Khi commit/push: commit các sửa QC của r1 và r2 (tests/qc/m12-r1-static.test.ts, m11-r1-open-ended.test.ts, m13-r1-static.test.ts, native/m13-r1-native-shell.spec.ts) cùng lúc, vì lane testflight chạy npm test gồm tests/qc/**.
