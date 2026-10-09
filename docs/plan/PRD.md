# PRD — 1% Better per Day

## 1. Bài toán và mục tiêu

**Bài toán.** Người muốn tiến bộ đều đặn (đọc sách, học ngoại ngữ, tập đàn, tập thể dục…) thường đặt mục tiêu rồi bỏ dở vì không thấy được nỗ lực tích luỹ của mình. Ghi chép rời rạc (sổ tay, note điện thoại) không cho cái nhìn tổng thể theo năm, không có streak, không có cảm giác "mỗi ngày tốt hơn một chút".

**Mục tiêu sản phẩm.** Một PWA cá nhân, chạy hoàn toàn trên thiết bị, giúp người dùng:

1. Đặt một hoặc nhiều mục tiêu có chỉ tiêu thời gian rõ ràng (phút/ngày hoặc tổng giờ trong một khoảng thời gian).
2. Ghi lại thời gian thực hiện mỗi ngày nhanh nhất có thể (nhập tay hoặc bấm timer).
3. Nhìn lại quá trình: heatmap cả năm, streak, tổng giờ, % tiến độ, biểu đồ tuần/tháng.
4. Thấy được ý nghĩa "1% mỗi ngày": mỗi ngày đạt chỉ tiêu là một "+1%", so sánh đường cong lý tưởng 1.01^n với thực tế.
5. Được nhắc mỗi ngày nếu chưa làm.

## 2. Người dùng và bối cảnh sử dụng

- **Một người dùng duy nhất** trên mỗi thiết bị (chủ app). Không có tài khoản, không đăng nhập.
- Dùng trên **điện thoại** (ghi nhanh trong ngày, bấm timer khi bắt đầu làm) và **máy tính** (xem review, đặt mục tiêu). Mỗi thiết bị có dữ liệu riêng; chuyển dữ liệu giữa thiết bị bằng export/import JSON.
- Bối cảnh: mở app 1–3 lần/ngày, mỗi lần dưới 30 giây để ghi; xem review vài lần/tuần.
- Có thể dùng khi offline (sau lần tải đầu tiên).

## 3. Phạm vi

### Goals

- Quản lý nhiều goal cùng lúc: tên, lý do (why), chỉ tiêu (phút/ngày hoặc tổng giờ), khoảng thời gian (ngày bắt đầu → hạn chót hoặc "trong năm").
- Ghi thời gian theo ngày: nhập tay (phút + ghi chú) hoặc timer start/stop; sửa/xoá; ghi bù ngày đã qua.
- Review: heatmap kiểu GitHub cho cả năm, streak hiện tại/dài nhất, tổng giờ, % tiến độ so với chỉ tiêu, biểu đồ tuần/tháng.
- Đường cong 1%: 1.01^n lý tưởng so với thực tế cho từng goal.
- Nhắc nhở hằng ngày bằng web notification (best-effort, xem giới hạn ở mục 6 và 10) + banner trong app.
- Lưu cục bộ (IndexedDB), export/import JSON để backup và chuyển thiết bị.
- PWA: cài được như app trên điện thoại và máy tính, chạy offline.
- Giao diện song ngữ Anh/Việt (`en`, `vi`): mặc định theo ngôn ngữ trình duyệt, đổi trong Settings, ngày/giờ/số định dạng theo ngôn ngữ đang chọn.

### Non-goals

- Tài khoản, đăng nhập, đồng bộ giữa thiết bị qua server (data layer được tách để thêm sau).
- Server, backend, push notification qua server.
- Nhiều người dùng, chia sẻ, mạng xã hội, bảng xếp hạng.
- Theo dõi hoạt động tự động (tích hợp Google Fit, Apple Health, lịch…).
- Chỉ tiêu theo tuần hoặc theo ngày trong tuần (vd. chỉ T2–T6); chỉ tiêu dạng số lần/đơn vị khác ngoài thời gian.
- Gamification ngoài "+1%" (huy hiệu, điểm, cấp độ).
- Ngôn ngữ khác ngoài `en` và `vi`; ngôn ngữ viết từ phải sang trái (RTL); dịch nội dung do người dùng nhập (tên goal, why, ghi chú); dịch tự động hoặc dịch vụ dịch bên ngoài.
- Deploy lên hosting (ngoài phạm vi của đội build; xem Open questions).

## 4. User stories

| ID | Là… | Tôi muốn… | Để… | Ưu tiên (Must/Should/Could) |
| :- | :- | :- | :- | :- |
| US-01 | người dùng | tạo một goal với tên, lý do và chỉ tiêu thời gian | biết rõ mình cam kết làm gì, bao nhiêu, vì sao | Must |
| US-02 | người dùng | theo đuổi nhiều goal cùng lúc | quản lý mọi việc muốn tiến bộ ở một chỗ | Must |
| US-03 | người dùng | ghi nhanh số phút đã làm hôm nay kèm ghi chú ngắn | việc ghi không tốn công và tôi nhớ đã làm gì | Must |
| US-04 | người dùng | bấm Start/Stop timer khi bắt đầu/kết thúc | không phải tự tính thời gian | Must |
| US-05 | người dùng | ghi bù hoặc sửa cho ngày hôm trước | dữ liệu đúng dù tôi quên ghi | Must |
| US-06 | người dùng | xem heatmap cả năm và streak | thấy được sự đều đặn và không muốn đứt chuỗi | Must |
| US-07 | người dùng | xem tổng giờ, % tiến độ và biểu đồ tuần/tháng | biết mình đang nhanh hay chậm so với chỉ tiêu | Must |
| US-08 | người dùng | thấy đường cong 1.01^n so với thực tế | có động lực từ ý tưởng "1% mỗi ngày" | Must |
| US-09 | người dùng | được nhắc mỗi ngày nếu chưa đạt chỉ tiêu | không quên làm | Must |
| US-10 | người dùng | export/import dữ liệu ra file JSON | không mất dữ liệu và chuyển được sang máy khác | Must |
| US-11 | người dùng | cài app lên màn hình chính và dùng offline | mở nhanh như app thật, không cần mạng | Must |
| US-12 | người dùng | lưu trữ (archive) goal đã xong | Today gọn mà vẫn giữ lịch sử | Should |
| US-13 | người dùng | thêm lời nhắc hằng ngày vào lịch của tôi | vẫn được nhắc kể cả khi app đóng hẳn | Should |
| US-14 | người dùng nói tiếng Việt | dùng app bằng tiếng Việt (hoặc tiếng Anh nếu tôi muốn), với ngày tháng và số viết theo kiểu quen thuộc | hiểu ngay mọi màn hình, thông báo và lời nhắc mà không phải dịch trong đầu | Must |

## 5. Yêu cầu chức năng

| ID | Mô tả | Ưu tiên | Milestone |
| :- | :- | :- | :- |
| FR-01 | Tạo goal: `name` (bắt buộc, 1–60 ký tự sau trim), `why` (0–280), loại chỉ tiêu `daily` (1–1440 phút/ngày) hoặc `total` (1–10000 giờ trong khoảng thời gian), `startDate` (mặc định hôm nay), `endDate` chọn "This year" (= 31/12 của năm `startDate`) hoặc ngày cụ thể ≥ `startDate`; khoảng thời gian tối đa 1827 ngày. Lỗi hiển thị inline theo từng field, goal không được lưu khi còn lỗi. | Must | M1 |
| FR-02 | Chỉ tiêu ngày suy ra (`dailyTarget`): `daily` → chính giá trị đó; `total` → `ceil(targetMinutes / số ngày trong khoảng)`. `total` mà `dailyTarget` > 1440 thì không hợp lệ. | Must | M1 |
| FR-03 | Sửa goal (cùng quy tắc FR-01). Không cho đổi khoảng thời gian nếu khiến entry đã có nằm ngoài khoảng (báo lỗi rõ). | Must | M1 |
| FR-04 | Xoá goal sau khi người dùng xác nhận; xoá kèm toàn bộ entry của goal trong cùng một transaction. | Must | M1 |
| FR-05 | Danh sách goal kèm trạng thái: `active` (hôm nay nằm trong khoảng), `upcoming` (chưa tới `startDate`), `ended` (đã qua `endDate`), `archived`. | Must | M1 |
| FR-06 | Màn hình Today: liệt kê goal `active` chưa archive, mỗi goal hiện số phút hôm nay / `dailyTarget`, và chỉ báo "+1%" khi đạt (tổng phút ≥ `dailyTarget`). | Must | M1 |
| FR-07 | Ghi entry thủ công cho hôm nay: `minutes` số nguyên 1–1440, `note` 0–280 ký tự. Một goal có thể có nhiều entry/ngày; tổng phút của một goal trong một ngày ≤ 1440. | Must | M1 |
| FR-08 | Sửa và xoá entry; tổng hiển thị cập nhật ngay. | Must | M1 |
| FR-09 | Dữ liệu lưu cục bộ trong IndexedDB, còn nguyên sau reload, đóng tab, khởi động lại trình duyệt. App xin `navigator.storage.persist()` để giảm nguy cơ bị trình duyệt dọn dữ liệu. | Must | M1 |
| FR-10 | PWA: có web app manifest và service worker, cài được (Chrome/Edge desktop & Android, "Add to Home Screen" trên iOS Safari), mở được khi offline sau lần tải đầu. | Must | M1 |
| FR-11 | Timer: Start trên một goal `active`; hiển thị thời gian chạy (hh:mm:ss) cập nhật mỗi giây; chỉ một timer chạy tại một thời điểm; timer vẫn chạy đúng sau reload/đóng app (tính từ thời điểm bắt đầu đã lưu). | Must | M2 |
| FR-12 | Stop timer mở hộp xác nhận với số phút làm tròn đã điền sẵn (sửa được) và ô ghi chú; Save tạo entry `source = timer` vào ngày bắt đầu timer; Discard huỷ timer không tạo entry. | Must | M2 |
| FR-13 | Cài đặt nhắc nhở: bật/tắt (mặc định tắt), giờ nhắc `HH:MM` (mặc định 20:00), xin quyền notification khi bật; hiển thị rõ trạng thái quyền (chưa hỏi / cho phép / bị chặn / trình duyệt không hỗ trợ). | Must | M2 |
| FR-14 | Gửi notification nhắc khi: nhắc đang bật, quyền `granted`, đã qua giờ nhắc của hôm nay, còn ít nhất một goal `active` chưa đạt chỉ tiêu, và hôm nay chưa nhắc. Tối đa 1 notification/ngày. Nội dung nêu số goal chưa đạt và tiến độ. Bấm notification mở app ở Today. Chỉ đảm bảo khi app đang mở (kể cả tab nền); xem giới hạn ở NFR-07. | Must | M2 |
| FR-15 | Banner nhắc trong Today khi đã qua giờ nhắc và còn goal chưa đạt (hoạt động cả khi không có quyền notification). | Must | M2 |
| FR-16 | Tải file `.ics` tạo sự kiện lặp hằng ngày vào giờ nhắc để thêm vào lịch (phương án nhắc tin cậy khi app đóng). | Should | M2 |
| FR-17 | Ghi bù/sửa cho ngày khác hôm nay qua màn hình Day (chọn ngày): không cho ngày tương lai; ngày phải nằm trong khoảng của goal. | Must | M3 |
| FR-18 | Lịch sử entry của một goal (mới nhất trước): ngày, phút, ghi chú, nguồn (manual/timer). | Should | M3 |
| FR-19 | Export toàn bộ dữ liệu ra file JSON có `schemaVersion`. | Must | M3 |
| FR-20 | Import file JSON: kiểm tra định dạng, version, toàn vẹn tham chiếu; xem trước số goal/entry; xác nhận rồi **thay thế toàn bộ** dữ liệu trong một transaction; lỗi thì dữ liệu cũ giữ nguyên. | Must | M3 |
| FR-21 | Hiển thị "Last backup" và nhắc backup khi đã hơn 30 ngày chưa export. | Could | M3 |
| FR-22 | Review: heatmap cả năm (theo năm dương lịch, chọn được năm) cho một goal hoặc "All goals"; mỗi ô có nhãn truy cập được: ngày, số phút, đạt/chưa. | Must | M4 |
| FR-23 | Streak hiện tại và dài nhất cho từng goal và tổng (ngày có ít nhất một goal đạt). Hôm nay chưa đạt không làm đứt streak cho tới khi hết ngày. | Must | M4 |
| FR-24 | Thống kê: tổng giờ (trong năm đang xem và trong khoảng của goal), % tiến độ so với tổng chỉ tiêu, số phút đi trước/chậm hơn so với tiến độ kỳ vọng tới hôm nay. | Must | M4 |
| FR-25 | Biểu đồ cột: 12 tuần gần nhất (tổng phút/tuần) và 12 tháng của năm đang xem (tổng phút/tháng). | Must | M4 |
| FR-26 | Bấm một ô heatmap mở màn hình Day của ngày đó để xem/ghi bù. | Should | M4 |
| FR-27 | Đường cong 1% trên trang chi tiết goal: lý tưởng `1.01^k` (k = số ngày đã trôi qua trong khoảng) và thực tế `1.01^n` (n = số ngày đạt chỉ tiêu tính tới ngày đó); dòng tiêu đề "+X% better" với X = (1.01^n − 1) × 100. | Must | M5 |
| FR-28 | Trang chi tiết goal: why, khoảng thời gian, chỉ tiêu, tiến độ, streak, đường cong 1%, lịch sử entry. | Must | M5 |
| FR-29 | Phản hồi "+1%" trên Today đúng một lần khi một entry làm goal vừa đạt chỉ tiêu hôm nay. | Should | M5 |
| FR-30 | Archive/unarchive goal: goal archived ẩn khỏi Today và không tính vào nhắc nhở, dữ liệu giữ nguyên. | Should | M5 |
| FR-31 | Trạng thái rỗng và lỗi cho mọi màn hình chính; màn hình lỗi riêng khi IndexedDB không dùng được (vd. chế độ riêng tư chặn storage). | Must | M5 |
| FR-32 | **Chọn ngôn ngữ:** app hỗ trợ đúng hai ngôn ngữ `en` (English) và `vi` (Tiếng Việt). Settings có control chọn ngôn ngữ, mỗi lựa chọn hiển thị bằng chính ngôn ngữ đó ("English", "Tiếng Việt"). Đổi ngôn ngữ có hiệu lực ngay trên toàn app (màn hình đang mở, tab bar, toast, `document.title`, `<html lang>`), không cần reload, không mất dữ liệu đang hiển thị. | Must | M1 |
| FR-33 | **Ngôn ngữ mặc định:** khi người dùng chưa từng chọn, ngôn ngữ = `vi` nếu `navigator.language` (không phân biệt hoa thường) bắt đầu bằng `vi`, còn lại (kể cả không đọc được) = `en`. Quy tắc này cũng áp dụng cho màn hình lỗi IndexedDB (khi không đọc được lựa chọn đã lưu). | Must | M1 |
| FR-34 | **Lưu lựa chọn ngôn ngữ:** lựa chọn của người dùng lưu cục bộ trong kv store (IndexedDB), còn nguyên sau reload, đóng tab, khởi động lại trình duyệt và ưu tiên hơn ngôn ngữ trình duyệt. Lựa chọn ngôn ngữ là thiết lập của thiết bị: không nằm trong file export và không bị import ghi đè. | Must | M1 |
| FR-35 | **Phạm vi dịch:** mọi chuỗi giao diện đều có bản `en` và `vi`: tiêu đề, label, placeholder, nút, tab, badge, hint, lỗi validate và lỗi import, toast, banner, dialog, trạng thái rỗng/lỗi, tooltip và nhãn của heatmap/biểu đồ, text chỉ dành cho screen reader và `aria-label`, `document.title`, nội dung notification nhắc nhở, nội dung sự kiện trong file `.ics` (SUMMARY, mô tả nhắc). **Không dịch:** tên goal, why, ghi chú của người dùng; tên thương hiệu "1% Better per Day" / "1% Better" (gồm web manifest); tên file export/`.ics`; mã lỗi nội bộ. Mọi chuỗi nằm trong code của app, không gọi dịch vụ dịch bên ngoài. Hạ tầng và chuỗi của M1 làm ở M1; mỗi milestone sau dịch đủ chuỗi mới của mình. | Must | M1 (M2–M5 cho chuỗi mới) |
| FR-36 | **Định dạng theo locale:** ngày, giờ và số hiển thị theo ngôn ngữ đang chọn (`en` → `en-US`, `vi` → `vi-VN`) qua `Intl`: ngày dạng dài (thứ, ngày, tháng, năm), tên thứ/tháng trên heatmap và trục biểu đồ, số thập phân và hàng nghìn, phần trăm, số nhiều theo quy tắc ngôn ngữ. Ngày dạng ngắn (khoảng thời gian goal, lịch sử, "Last backup"): `en` giữ `YYYY-MM-DD` như DESIGN.md, `vi` dùng `dd/MM/yyyy`. Giờ nhắc 24h `HH:MM` và timer `hh:mm:ss` giống nhau ở cả hai ngôn ngữ. Tuần luôn bắt đầu thứ Hai (A-01). Đổi ngôn ngữ thì mọi giá trị đã định dạng cập nhật ngay. | Must | M1 (M2–M5 cho màn hình mới) |

## 6. Yêu cầu phi chức năng

| ID | Yêu cầu | Đo bằng |
| :- | :- | :- |
| NFR-01 | **Local-first, riêng tư:** không có request mạng nào tới origin khác ngoài origin của app; không analytics, không font/CDN ngoài. | Playwright ghi lại mọi request trong luồng e2e: 0 request ngoài origin. |
| NFR-02 | **Offline:** sau lần tải đầu, mọi tính năng hoạt động khi mất mạng. | Playwright `context.setOffline(true)` + reload: app render và ghi entry được. |
| NFR-03 | **Hiệu năng:** tính toàn bộ thống kê Review cho 5 goal × 3 năm (≈ 5.500 entry) < 200 ms; Review hiển thị heatmap < 1,5 s sau khi điều hướng với dữ liệu đó (máy dev); JS tải ban đầu ≤ 250 KB gzip (đã gồm thư viện i18n và cả hai file dịch `en`, `vi`), thư viện biểu đồ chỉ tải khi vào Review/Goal detail. | Unit benchmark; Playwright đo thời gian; output `vite build`. |
| NFR-04 | **Toàn vẹn dữ liệu:** mọi ghi đa bảng (xoá goal kèm entry, import) là một transaction; dữ liệu có `schemaVersion`; import lỗi không làm thay đổi dữ liệu. | Integration test với fake-indexeddb. |
| NFR-05 | **Bảo mật:** validate mọi input ở biên (form, file import ≤ 5 MB); không dùng `dangerouslySetInnerHTML`; ghi chú hiển thị dạng text. | Unit test, grep source. |
| NFR-06 | **Tương thích:** Chrome/Edge bản mới nhất (desktop, Android), Safari iOS ≥ 16.4 (notification chỉ khi đã "Add to Home Screen"), Firefox desktop bản mới nhất (không có cài app). Màn hình 360–1440 px không có thanh cuộn ngang. | Playwright Chromium (tự động); các trình duyệt khác kiểm thủ công. |
| NFR-07 | **Giới hạn nhắc nhở (chấp nhận trong MVP):** không có server nên notification chỉ được đảm bảo khi app đang mở (kể cả tab/cửa sổ ở nền). Khi app đóng hẳn, nhắc dựa vào file `.ics` (FR-16). | Ghi rõ trong README và màn hình Settings. |
| NFR-08 | **Accessibility:** WCAG 2.1 AA cơ bản: mọi control có nhãn, dùng được bằng bàn phím, heatmap có nhãn text cho từng ô; `<html lang>` luôn khớp ngôn ngữ đang hiển thị (`en` / `vi`). | `@axe-core/playwright`: 0 vi phạm mức serious/critical. |
| NFR-09 | **Vận hành:** cài đặt, build, lint, test bằng các lệnh npm trong README; không cần cài gì global; không cần biến môi trường bắt buộc. | QC chạy theo README trên máy sạch. |
| NFR-10 | **Sẵn sàng sync sau này:** mọi bản ghi có `id` UUID, `createdAt`, `updatedAt`; UI và logic chỉ truy cập dữ liệu qua repository interface. | Review code + lint rule chặn import chéo lớp. |
| NFR-11 | **Chất lượng bản dịch và không hardcode chuỗi:** (a) `en` và `vi` có cùng tập key, cùng biến nội suy, không có giá trị rỗng; (b) không có chuỗi chữ hiển thị viết thẳng trong JSX của `src/ui`, `src/app`; (c) ở chế độ `vi`, DOM của mọi màn hình không chứa chuỗi tiếng Anh nào lấy từ bản `en` (trừ chuỗi giống nhau ở hai bản như tên thương hiệu, `+1%`) và không lộ key dịch thô; (d) file dịch đóng gói cùng app, hoạt động offline, 0 request ngoài origin (NFR-01 giữ nguyên); (e) giao diện `vi` (chuỗi thường dài hơn) không gây thanh cuộn ngang ở 360 px. | (a) unit test so sánh hai file; (b) ESLint `--max-warnings 0`; (c) test quét DOM (component + E2E) ở `vi-VN`; (d) Playwright đếm request; (e) Playwright viewport 360 px ở `vi-VN`. |

## 7. Loại app và bề mặt người dùng

- **Web app dạng PWA**, có UI, responsive cho điện thoại và máy tính, cài được như app.
- Màn hình chính (chi tiết giao diện do designer quyết):
  - **Today** — goal đang chạy, tiến độ hôm nay, ghi nhanh, timer, banner nhắc.
  - **Goals** — danh sách goal theo trạng thái; tạo/sửa/xoá/archive; vào chi tiết goal.
  - **Goal detail** — why, tiến độ, streak, đường cong 1%, lịch sử.
  - **Review** — heatmap năm, streak, tổng giờ, % tiến độ, biểu đồ tuần/tháng.
  - **Day** — ghi bù/sửa entry cho một ngày bất kỳ đã qua.
  - **Settings** — nhắc nhở, file `.ics`, export/import, thông tin lưu trữ.
- Ngôn ngữ UI: song ngữ **English / Tiếng Việt** (FR-32 … FR-36). Mặc định theo ngôn ngữ trình duyệt, đổi trong Settings. Copy tiếng Việt do designer chốt trong `DESIGN.md` cạnh copy tiếng Anh.

## 8. Chỉ số thành công

- Ghi một entry thủ công từ lúc mở app tới khi lưu: ≤ 3 thao tác và ≤ 10 giây.
- Trong 4 tuần đầu, người dùng ghi ít nhất 5/7 ngày mỗi tuần (tự xem trên heatmap).
- 0 sự cố mất dữ liệu: round-trip export → import khôi phục 100% goal và entry (kiểm bằng test).
- App cài được và mở offline trên ít nhất một điện thoại thật của user (Android hoặc iOS).

## 9. Assumptions

- A-01: Ngày tính theo **múi giờ cục bộ** của thiết bị, lưu dạng chuỗi `YYYY-MM-DD`. Tuần bắt đầu thứ Hai (ISO).
- A-02: "+1%" chỉ cộng cho ngày đạt chỉ tiêu; ngày không đạt **không trừ** (đường thực tế = 1.01^n, không nhân 0.99 cho ngày lỡ).
- A-03: Thống kê luôn tính theo chỉ tiêu **hiện tại** của goal (không lưu lịch sử thay đổi chỉ tiêu).
- A-04: Mọi ngày trong khoảng của goal đều là ngày cần làm (không có ngày nghỉ).
- A-05: Timer qua nửa đêm: toàn bộ thời gian ghi vào ngày bắt đầu. Số phút = làm tròn tới phút gần nhất.
- A-06: Chỉ một timer chạy tại một thời điểm trên toàn app.
- A-07: Import = thay thế toàn bộ dữ liệu (không merge).
- A-08: Nhắc nhở mặc định tắt; giờ mặc định 20:00; một giờ nhắc chung cho mọi goal.
- A-09: Heatmap "All goals" phân mức theo tổng phút trong ngày; heatmap một goal phân mức theo % chỉ tiêu ngày.
- A-10: Tên app hiển thị "1% Better per Day", tên ngắn "1% Better".
- A-11: Không deploy trong phạm vi build; user tự chạy local hoặc tự chọn hosting (xem OQ-02).
- A-12: Nhắc backup (FR-21) hiện khi có ít nhất 1 goal và chưa từng export hoặc lần export gần nhất cách hơn 30 ngày.
- A-13: Không cho archive goal đang có timer chạy (phải Stop hoặc Discard trước). Xoá goal đang có timer chạy thì timer bị huỷ cùng goal.
- A-14: Timer chạy dưới 30 giây vẫn điền sẵn 1 phút; chạy quá 1440 phút thì điền sẵn 1440 (người dùng sửa được trước khi lưu).
- A-15: Tên thương hiệu "1% Better per Day" / "1% Better" và chuỗi `+1%` giống nhau ở cả hai ngôn ngữ. Web manifest là file tĩnh nên giữ một bản (tên thương hiệu, `lang: "en"`); tên app cài trên màn hình chính không đổi theo ngôn ngữ.
- A-16: Khi người dùng chưa chọn ngôn ngữ, app không ghi gì vào kv: mỗi lần khởi động lại áp dụng FR-33 (đổi ngôn ngữ trình duyệt thì app đổi theo). Chỉ khi người dùng chọn trong Settings mới lưu key `locale`.
- A-17: Các control do trình duyệt vẽ (`<input type="date">`, `<input type="time">`, hộp xin quyền notification, hộp chọn file) hiển thị theo ngôn ngữ của trình duyệt/hệ điều hành, không theo lựa chọn trong app. Label và lỗi quanh các control này vẫn được dịch.
- A-18: Copy tiếng Việt (giọng điệu, xưng hô) do designer chốt trong `DESIGN.md`; developer dùng nguyên văn. Mã lỗi, dữ liệu file backup và tên file giữ tiếng Anh/ASCII.
- A-19: Nội dung notification và file `.ics` dùng ngôn ngữ đang chọn tại thời điểm gửi/tải. Sự kiện lịch đã thêm trước đó không tự đổi ngôn ngữ (người dùng tải lại file nếu muốn).

## 10. Open questions

- OQ-01: Chấp nhận giới hạn nhắc nhở của MVP (chỉ đảm bảo khi app đang mở + phương án file `.ics`) hay muốn nhắc tin cậy khi app đóng? Phương án sau cần một push server nhỏ (Web Push + VAPID) — trái với quyết định "không server". **Giả định hiện tại:** chấp nhận giới hạn.
- OQ-02: Hosting: để dùng trên điện thoại và cài PWA cần HTTPS (localhost chỉ dùng được trên máy dev). User muốn host ở đâu (GitHub Pages, Netlify, Cloudflare Pages…) và có cần hướng dẫn deploy trong README không? Kiến trúc đã hỗ trợ đặt `BASE_PATH` cho subpath.
- OQ-03: Đường cong thực tế có muốn chế độ "khắt khe" (ngày lỡ nhân 0.99, minh hoạ 0.99^365 ≈ 0.03) không? **Giả định:** không trong MVP, đưa vào Later.
- OQ-04: **Đã quyết (2026-10-09, Gate 2, user yêu cầu):** UI song ngữ Anh/Việt trong MVP. Hai ngôn ngữ `en`, `vi`; mặc định lần đầu theo `navigator.language` (bắt đầu bằng "vi" → `vi`, còn lại `en`); đổi trong Settings, lưu cục bộ trong kv store, còn sau reload; mọi chuỗi UI (label, nút, lỗi, thông báo, notification, nội dung `.ics`, aria-label) đều dịch; ngày/giờ/số định dạng theo locale; tên goal và ghi chú của người dùng không dịch; không dùng dịch vụ dịch ngoài, mọi chuỗi nằm trong code. Xem FR-32 … FR-36, NFR-11, A-15 … A-19.
- OQ-05: Có cần chỉ tiêu theo tuần (vd. 3 giờ/tuần) hoặc chọn ngày trong tuần không? **Giả định:** không trong MVP.

## Changelog

- 2026-10-09 — v1, tạo mới (mode `new`).
- 2026-10-09 — v1.1 (khi viết TASKS.md): thêm Assumptions A-12 (điều kiện nhắc backup), A-13 (archive/xoá goal khi timer đang chạy), A-14 (giới hạn số phút điền sẵn của timer). Không đổi FR/NFR.
- 2026-10-09 — v1.2 (mode `revise`, feedback Gate 2: thêm tiếng Việt): OQ-04 chuyển thành quyết định (song ngữ en/vi). Thêm Goal song ngữ, US-14, FR-32 … FR-36 (chọn ngôn ngữ, mặc định theo trình duyệt, lưu kv, phạm vi dịch, định dạng theo locale), NFR-11 (chất lượng bản dịch, cấm hardcode chuỗi), A-15 … A-19. Sửa Non-goals (bỏ "chỉ tiếng Anh"), §7 (ngôn ngữ UI), NFR-03 (ngân sách bundle gồm i18n), NFR-08 (`<html lang>`). Không đổi FR-01 … FR-31.
