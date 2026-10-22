# QC report — M15 round 2

**Verdict:** PASS
**Ngày:** 2026-10-22  **Commit:** 7fb0938 (HEAD main; fix của dev cho round 1). Thay đổi QC chưa commit: tests/qc/m15-r1-plan.test.ts (re-target theo độ chính xác giây, xem mục 5).

## 1. Tóm tắt
- M15-D2 FIXED, M15-D1 FIXED (hai điểm lệch DESIGN còn lại được đánh giá là deviation, không phải defect; xem mục 5 và 9). Không có defect mới. Không còn defect Critical/Major/Minor mở.
- AC1 … AC9, AC11, AC12 vẫn PASS. **M15-AC10 (NV-17 … NV-20) vẫn NOT VERIFIED**: cần iPhone, TestFlight, App Store Connect (user, U25/U26). Không tính là PASS; orchestrator cần hỏi user.
- Regression trên clone sạch (core.autocrlf=true): npm run check exit 0 (2.421 pass, 3 expected fail); Playwright 3 project 805 pass + 1 đỏ chập chờn (tests/qc/cloud/m7-r1-probe.spec.ts:359, chạy lại riêng 54/54 xanh); bundle 228,0 / 228,6 kB (<= 230); screenshot tái tạo byte-identical hai lần.

## 2. Môi trường và lệnh đã chạy
Windows 11, Node v22.14.0, npm 10.9.2; không Mac/Xcode. Clone sạch từ HEAD 7fb0938 (core.autocrlf = true), file QC đã re-target chép vào clone. Đường dẫn clone dài nên Chromium tải trong clone không spawn được (giới hạn MAX_PATH): Playwright chạy với PLAYWRIGHT_BROWSERS_PATH trỏ tới Chromium 1248 của repo chính; npm run store:screenshots bị cross-env ép PLAYWRIGHT_BROWSERS_PATH=0 nên chạy trực tiếp lệnh playwright test -c playwright.store.config.ts (cùng cấu hình, chỉ khác nguồn trình duyệt).

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Cài | npm ci | exit 0 |
| Check | npm run check | exit 0: lint 0, typecheck 0, Vitest 177 file, 2.421 pass, 3 expected fail (kể cả test QC đã re-target), build:e2e ok |
| Playwright | npx playwright test (chromium + cloud + native-web) | 805 passed, 1 failed (9,1 phút): tests/qc/cloud/m7-r1-probe.spec.ts:359 (import while signed in, offline; không thấy dialog trong 10 s) |
| Chạy lại ca đỏ | playwright --project=cloud m7-r1-probe.spec.ts --repeat-each=3, rồi -g của riêng ca đó --repeat-each=3 | 48/48 và 6/6 xanh: chập chờn theo tải, cùng họ với m6-r1-flow:142 đã ghi ở round 1 (setOffline ngay sau goto Settings). Không liên quan thay đổi round 1 (chỉ đổi domain plan, fixture, spec screenshot, README) |
| Domain, 9 múi giờ | QC_TZ = Asia/Ho_Chi_Minh, America/New_York, Europe/London, Pacific/Auckland, Australia/Lord_Howe, America/Sao_Paulo, UTC, Pacific/Kiritimati, America/St_Johns; vitest tests/qc/m15-r1-plan.test.ts | 4/4 mỗi múi giờ |
| Đột biến (repo chính, đã hoàn nguyên bằng git checkout) | (a) nới điều kiện thành todayAt < now - 59999 ms (quy tắc theo phút cũ); (b) đổi < thành <= | cả hai làm ca hand cases đỏ: test mới bắt được cả hai chiều của biên |
| Bundle | e2e/m10-bundle + e2e/cloud/m10-bundle + tests/qc/m10-r1-bundle + final-nfr, repeat-each 3, 1 worker | chromium 228,0 kB (8 response), cloud 228,6 kB (10 response); qc-cold 227.994 byte; 39/39 pass, ổn định 3 lần; không đổi so với round 1 |
| Screenshot | playwright test -c playwright.store.config.ts (2 lần, clone sạch) | 2 passed mỗi lần (40 s); git status không đổi: 10 JPEG byte-identical với bản commit; header SOF 1320x2868, kết thúc EOI, 191…310 kB |
| Web không Capacitor (DoD 13) | npm run build; npm run build:cloud-e2e; grep -rl Filesystem, SocialLogin, LocalNotifications, SplashScreen, @capgo, @capacitor, Capacitor trong dist, dist-cloud-e2e | 0 file mọi từ khoá |
| Native | npm run build:native; npx cap sync ios | exit 0; Found 8 Capacitor plugins for ios; không file tracked nào đổi |
| Bench | npm run bench | 13/13 pass |
| Audit | npm audit --omit=dev | 0 lỗ hổng |

## 3. Acceptance criteria
| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M15-AC1 | PASS | Quy tắc mới (hôm nay bị bỏ khi reminderDateTime < now theo mili-giây) vẫn đúng lời văn AC1: 20:00:00 đúng giữ hôm nay, 20:01 bắt đầu 2026-10-10 (13 ngày). Test QC re-target (oracle có giây) + 3.000 ca ngẫu nhiên + ca tay xanh ở 9 múi giờ gồm DST |
| M15-AC2 | PASS | Không đổi; reminder-service.replan.test.ts và 15 ca QC native-web M15 xanh trong lượt Playwright đầy đủ |
| M15-AC3 | PASS | Không đổi; xanh trong lượt đầy đủ |
| M15-AC4 | PASS | Không đổi; xanh trong lượt đầy đủ |
| M15-AC5 | PASS | Không đổi; xanh trong lượt đầy đủ (3 trạng thái quyền, vi, axe) |
| M15-AC6 | PASS (tĩnh); NOT VERIFIED (App Store Connect, NV-19) | m15-r1-store.test.ts xanh trong check |
| M15-AC7 | PASS | Không đổi (privacy.html, support.html); e2e m15-public-pages xanh |
| M15-AC8 | PASS | m15-r1-store.test.ts (9 tệp x 2 locale, byte-exact với DESIGN 7.8.7) xanh |
| M15-AC9 | PASS | Dataset: m15-r1-store.test.ts + src/test/store-fixtures.test.ts xanh sau khi đổi thứ tự createdAt (mảng goals vẫn theo bảng DESIGN, 429 entry khớp công thức). Screenshot tái tạo byte-identical 2/2. Đã xem bằng mắt 6 ảnh: en-US và vi 01, 02, 05 (mục 5) |
| M15-AC10 | NOT VERIFIED | NV-17 … NV-20: mục 8 |
| M15-AC11 | PASS | parity + design-copy xanh trong check; không đổi chuỗi (bundle không đổi 228,0 kB) |
| M15-AC12 | PASS | Mục 2: npm ci, check exit 0, Playwright 805/806 (1 chập chờn, xanh khi chạy lại), bench 13/13, bundle <= 230 kB, DoD 13 = 0 |

## 4. Defect
Không có defect mới. Không còn defect mở của M15.

## 5. Kiểm lại defect vòng trước
| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| M15-D2 (replan trong phút giờ nhắc phát ngay) | FIXED | Đọc diff src/domain/reminder-plan.ts: todayAt = reminderDateTime(today, reminderTime).getTime(), bỏ hôm nay khi todayAt < now.getTime(); không đổi adapter/service. Biên kiểm độc lập bằng QC (lúc 2026-10-09, giờ nhắc 20:00): 19:59:59 giữ hôm nay; 20:00:00 giữ; 20:00:01, 20:00:30, 20:00:59, 20:01:00 bắt đầu 10-10 (13 ngày); thêm 19:59:59.999 giữ, 20:00:00.001 bỏ. Bất biến: quét 3.600 s (bước 7 s) quanh giờ nhắc, mọi at của lịch >= now (không còn at quá khứ để plugin iOS giao ngay). Xanh 9 múi giờ. Đột biến hai chiều bị bắt. Ca QC tests/qc/m15-r1-plan.test.ts:90 (20:00:59 giữ hôm nay) đúng là mã hoá quy tắc cũ theo phút, mâu thuẫn chính D2: QC đã re-target (oracle thêm tham số giây: bỏ hôm nay khi phút > giờ nhắc hoặc phút = giờ nhắc và giây > 0; ca tay đổi thành các biên ở trên). Dispute của dev được chấp nhận |
| M15-D1 (screenshot 01/02/05 thiếu Spanish / nhóm Ended) | FIXED | Đã mở 6 ảnh. 01 (en, vi): tiêu đề Today, chip chuỗi, 2 of 3 goals on target, Read 30/30 (+1 %), **Spanish 10/15, thanh 67 %, 5 min to go / Còn 5 phút** trọn vẹn, Guitar lộ tiêu đề và pill +1 %. 02 en: TimerCard Timer running · Spanish 00:12:41, Read, Spanish 10/15 và 5 min to go sát tab bar nhưng còn thấy. 05 (en, vi): Active (Spanish from 2026-06-01, no end date; Guitar), **Upcoming (1) Piano, Ended (1) Stretch / Giãn cơ**; vi không rò tiếng Anh. Điểm D1 đã nêu ở round 1 (Spanish chưa đạt không thấy, nhóm Ended vắng) đã hết. Spec thêm toBeInViewport cho 01, 02, 05 |
| Lệch DESIGN do dev ghi (a): ảnh 05 không còn tiêu đề Goals, nút New goal, heading Active | Deviation, không phải defect | DESIGN 7.8.8 hàng 5 yêu cầu cả 3 nhóm và nút New goal; app thật không chứa cả hai ở 440x956 (3 card Active chiếm gần hết màn). Dev chọn đủ ba nhóm thay vì nút. Ảnh vẫn hợp lệ, đúng nội dung chính của hàng 5 (ba nhóm, mục tiêu không thời hạn). Chấp nhận; designer cần ghi nhận (mục 9) |
| Lệch (b): ảnh 02 bản vi, Còn 5 phút và thanh tiến độ nằm dưới tab bar | Deviation, không phải defect | DESIGN yêu cầu ở ảnh 02 Spanish card hiện 10/15 min: ảnh vi có tên Tiếng Tây Ban Nha và 10/15 phút thấy được. TimerCard vi cao hơn en vì chip Đang chạy xuống dòng riêng. Không sai thông tin, chỉ card bị cắt. Lưu ý chất lượng test: assertion toBeInViewport ratio 1 của dev chỉ so với viewport 956 px, không tính tab bar phủ lên, nên vẫn xanh dù chữ nằm dưới thanh tab (mục 9) |

## 6. Regression
- npm run check exit 0 trên clone sạch; không test dev nào phải sửa. Playwright 805/806 (chromium, cloud, native-web): ca đỏ duy nhất tests/qc/cloud/m7-r1-probe.spec.ts:359 là chập chờn theo tải (đỏ ở lượt chạy toàn bộ 9 phút, 54/54 xanh khi chạy riêng), cùng cơ chế với m6-r1-flow:142 và m7-sync M7-AC9 đã ghi ở round 1; lần này hai ca đó xanh.
- Test M2 (check + SW), M12 native (đã re-target ở round 1), M13/M14 emulation xanh trong lượt đầy đủ. Bundle 228,0 / 228,6 kB không đổi so với round 1 (dự phòng 2,0 / 1,4 kB).

## 7. Bảo mật
- Round 1 chỉ đổi domain plan, generator fixture, spec screenshot, README, ảnh JPEG, test. Không đổi surface bảo mật. DoD 13 = 0 (mục 2); npm audit --omit=dev: 0; diff 398a2cc..7fb0938 không chứa secret.
- Quy tắc mới không ảnh hưởng nội dung notification (vẫn tĩnh, không dữ liệu người dùng).

## 8. Chưa kiểm chứng được (NOT VERIFIED)
| ID | Nội dung | Vì sao không kiểm | Ai kiểm, bước kiểm |
| :- | :- | :- | :- |
| NV-17 | Notification thật tới đúng giờ khi app đóng hẳn; chạm mở Today; hôm nay đạt hết thì không có; tắt thì hết; quyền bị chặn hiện hướng dẫn; đổi ngôn ngữ; 3 ngày liên tiếp | Không có iPhone/TestFlight; QC chỉ kiểm bridge giả | User (U25 bước 1) theo handoff mục 9 NV-17. Thêm sau fix D2: ghi phút vài giây sau giờ nhắc không được sinh notification ngay; ghi mục tiêu cuối rồi khoá màn hình trong 2 giây: notification hôm đó còn tới không (debounce 2 s) |
| NV-18 | Share sheet Export/Import trên iPhone; card Reminders không còn nút .ics | Không có iPhone | User (U19/U25) |
| NV-19 | App Store Connect: build qua Processing không cảnh báo ITMS, kích thước cài <= 25 MB, App Review | Không có Mac/Xcode/tài khoản Apple. Phần tĩnh đã kiểm (round 1) | User (U25 bước 2-7, U26) |
| NV-20 | iOS dọn dữ liệu WKWebView khi thiếu bộ nhớ | Theo dõi sau phát hành | User |
| (phụ) | Screenshot hiển thị đúng khi tải lên App Store Connect (6,9 inch) | Chỉ kiểm file JPEG và xem ảnh trên máy dev | User khi nộp (U25 bước 8) |

## 9. Đề xuất (không chặn)
- Designer: cập nhật DESIGN 7.8.8 / mockup 10-store-screenshots.html theo giao diện thật: ảnh 01 hai card đầy đủ + đầu card Guitar; ảnh 02 tương tự với TimerCard; ảnh 05 là ba nhóm Active / Upcoming / Ended đã cuộn (không có tiêu đề Goals và nút New goal). Ghi nhận ảnh 02 vi cắt dòng Còn 5 phút.
- Dev (khi dọn nợ): assertion ảnh 02 nên đo chữ không bị thanh tab phủ (so bottom của phần tử với top của .nav), vì toBeInViewport không phát hiện vi 02 bị che.
- Các test chập chờn theo tải liên quan setOffline sau goto (m6-r1-flow:142, m7-r1-probe:359) và m7-sync M7-AC9 nên được làm bền ở một lần dọn nợ.
- Dự phòng bundle còn 2,0 / 1,4 kB so với 230 kB: milestone sau cần chốt phương án ngân sách trước khi thêm mã vào luồng tải đầu.
