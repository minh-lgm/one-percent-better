# PRD — 1% Better per Day

## 1. Bài toán và mục tiêu

**Bài toán.** Người muốn tiến bộ đều đặn (đọc sách, học ngoại ngữ, tập đàn, tập thể dục…) thường đặt mục tiêu rồi bỏ dở vì không thấy được nỗ lực tích luỹ của mình. Ghi chép rời rạc (sổ tay, note điện thoại) không cho cái nhìn tổng thể theo năm, không có streak, không có cảm giác "mỗi ngày tốt hơn một chút".

**Mục tiêu sản phẩm.** Một PWA cá nhân, chạy trên thiết bị (local-first), giúp người dùng:

1. Đặt một hoặc nhiều mục tiêu có chỉ tiêu thời gian rõ ràng (phút/ngày hoặc tổng giờ trong một khoảng thời gian).
2. Ghi lại thời gian thực hiện mỗi ngày nhanh nhất có thể (nhập tay hoặc bấm timer).
3. Nhìn lại quá trình: heatmap cả năm, streak, tổng giờ, % tiến độ, biểu đồ tuần/tháng.
4. Thấy được ý nghĩa "1% mỗi ngày": mỗi ngày đạt chỉ tiêu là một "+1%", so sánh đường cong lý tưởng 1.01^n với thực tế.
5. Được nhắc mỗi ngày nếu chưa làm.
6. **(Phase 2, v2.0)** Tuỳ chọn đăng nhập bằng Google để goal và entry được lưu lên cloud (Supabase) và đồng bộ giữa các thiết bị, không mất khi đổi máy hoặc trình duyệt xoá dữ liệu. Không đăng nhập thì app vẫn chạy đầy đủ như phase 1.

**Bài toán phase 2.** Dữ liệu phase 1 chỉ nằm trong IndexedDB của một trình duyệt: Safari có thể xoá sau 7 ngày không dùng nếu chưa cài app, đổi máy phải export/import tay, điện thoại và máy tính có dữ liệu rời nhau. User muốn "lưu trữ thông tin về target và process" an toàn hơn mà không bắt buộc tạo tài khoản.

## 2. Người dùng và bối cảnh sử dụng

- **Một người dùng duy nhất** trên mỗi thiết bị (chủ app). Tài khoản là **tuỳ chọn** (phase 2): không đăng nhập thì mọi thứ như phase 1; đăng nhập Google thì cùng một tài khoản dùng được trên nhiều thiết bị. Mỗi thiết bị chỉ đăng nhập một tài khoản tại một thời điểm.
- Dùng trên **điện thoại** (ghi nhanh trong ngày, bấm timer khi bắt đầu làm) và **máy tính** (xem review, đặt mục tiêu). Chưa đăng nhập: mỗi thiết bị có dữ liệu riêng, chuyển bằng export/import JSON. Đã đăng nhập: goal và entry tự đồng bộ giữa các thiết bị qua cloud.
- Bối cảnh: mở app 1–3 lần/ngày, mỗi lần dưới 30 giây để ghi; xem review vài lần/tuần.
- Có thể dùng khi offline (sau lần tải đầu tiên), kể cả khi đã đăng nhập: thay đổi được ghi cục bộ và tự đẩy lên cloud khi có mạng.
- App đang chạy công khai tại `https://minh-lgm.github.io/one-percent-better/` (GitHub Pages, sub-path, hash routing, PWA). Ai có link đều mở được app; dữ liệu cloud của mỗi tài khoản chỉ chủ tài khoản đọc/ghi được (RLS).

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
- **(Phase 2)** Đăng nhập **tuỳ chọn** bằng Google (chỉ Google) qua Supabase Auth; đồng bộ offline-first goal và entry giữa các thiết bị (IndexedDB vẫn là nguồn chính, cloud là bản sao đồng bộ); xoá lan truyền giữa thiết bị; giải quyết xung đột last-write-wins theo bản ghi; chỉ báo trạng thái đồng bộ; đăng xuất có lựa chọn giữ/xoá dữ liệu trên máy; nhắc đăng nhập nhẹ nhàng (không chặn) khi người dùng đã có nhiều dữ liệu.

### Non-goals

- Bắt buộc đăng nhập; bất kỳ tính năng phase 1 nào chỉ dùng được khi có tài khoản.
- Nhà cung cấp đăng nhập khác Google (email/mật khẩu, magic link, Apple, GitHub…); nhiều tài khoản cùng lúc trên một thiết bị.
- Backend tự viết, server riêng, Edge Function; push notification qua server (vẫn là Later, OQ-01).
- Đồng bộ thời gian thực (realtime/websocket); hợp nhất theo từng field hay UI giải quyết xung đột thủ công; lịch sử phiên bản.
- Đồng bộ thiết lập của thiết bị: ngôn ngữ, nhắc nhở (bật/tắt, giờ), timer đang chạy, trạng thái "+1%" đã hiện, ngày nhắc gần nhất, ngày backup gần nhất (xem FR-44, OQ-07).
- Xoá dữ liệu cloud hoặc xoá tài khoản ngay trong app (user làm trong Supabase Dashboard; Later, OQ-09).
- Nhiều người dùng chia sẻ dữ liệu, mạng xã hội, bảng xếp hạng.
- Theo dõi hoạt động tự động (tích hợp Google Fit, Apple Health, lịch…).
- Chỉ tiêu theo tuần hoặc theo ngày trong tuần (vd. chỉ T2–T6); chỉ tiêu dạng số lần/đơn vị khác ngoài thời gian.
- Gamification ngoài "+1%" (huy hiệu, điểm, cấp độ).
- Ngôn ngữ khác ngoài `en` và `vi`; ngôn ngữ viết từ phải sang trái (RTL); dịch nội dung do người dùng nhập (tên goal, why, ghi chú); dịch tự động hoặc dịch vụ dịch bên ngoài.
- Agent tự deploy hoặc `git push` (deploy GitHub Pages chạy tự động khi user/orchestrator push lên `main`; tạo project Supabase, OAuth client, secret là việc thủ công của user, xem TASKS "User setup").

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
| US-15 | người dùng chưa muốn tạo tài khoản | tiếp tục dùng đầy đủ app mà không đăng nhập | thử app và dùng riêng tư trên một máy, không bị ép đăng ký | Must |
| US-16 | người dùng đã có dữ liệu | đăng nhập bằng tài khoản Google của mình | goal và quá trình của tôi được lưu trên cloud, không mất khi đổi máy hoặc trình duyệt xoá dữ liệu | Must |
| US-17 | người dùng có điện thoại và máy tính | thấy cùng goal và entry trên mọi thiết bị đã đăng nhập, kể cả khi ghi lúc offline | ghi ở đâu cũng được, xem review ở đâu cũng đủ | Must |
| US-18 | người dùng đã đăng nhập | biết dữ liệu đã được đồng bộ hay còn thay đổi chưa đẩy lên | yên tâm trước khi đóng app hoặc đổi máy | Must |
| US-19 | người dùng trên máy dùng chung | khi đăng xuất chọn giữ hay xoá dữ liệu trên máy này | người khác không xem được dữ liệu của tôi | Must |
| US-20 | người dùng chưa đăng nhập | được nhắc nhẹ nhàng (không chặn, không lặp phiền) rằng có thể đăng nhập để khỏi mất dữ liệu | không mất dữ liệu vì không biết có lựa chọn này | Must |

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

**Phase 2 — Đăng nhập tuỳ chọn và đồng bộ cloud (v2.0).** FR-35, FR-36 áp dụng cho mọi chuỗi mới dưới đây (copy `en`/`vi` do designer chốt trong DESIGN.md).

| ID | Mô tả | Ưu tiên | Milestone |
| :- | :- | :- | :- |
| FR-37 | **Đăng nhập là tuỳ chọn:** không màn hình, tính năng hay luồng nào của FR-01 … FR-36 yêu cầu đăng nhập. Chưa đăng nhập thì dữ liệu vẫn ghi vào IndexedDB như phase 1; không có hộp thoại/màn hình chặn nào bắt đăng nhập. | Must | M6 |
| FR-38 | **Cloud bật theo cấu hình:** tính năng tài khoản chỉ xuất hiện khi bản build có `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY` (hoặc `VITE_SUPABASE_ANON_KEY`) hợp lệ. Thiếu hoặc sai thì app giống hệt phase 1: không có card Account, không nhắc đăng nhập, không tải code Supabase, 0 request ngoài origin. | Must | M6 |
| FR-39 | **Đăng nhập bằng Google:** từ card Account trong Settings (và từ lời nhắc ở FR-52, FR-53) bấm "Sign in with Google" → chuyển sang trang đăng nhập Google (OAuth PKCE qua Supabase Auth) → quay về app đúng màn hình đã bắt đầu (`#/settings` hoặc `#/today`), URL không còn tham số `code`/`auth`. Thành công: card Account hiện email và tên hiển thị. Người dùng huỷ hoặc lỗi: vẫn chưa đăng nhập, hiện thông báo lỗi theo mã (`AUTH_CANCELLED`, `AUTH_FAILED`), dữ liệu cục bộ không đổi. Khi offline, nút đăng nhập bị vô hiệu kèm giải thích. | Must | M6 |
| FR-40 | **Phiên đăng nhập bền:** còn đăng nhập sau reload, đóng tab, khởi động lại trình duyệt, và khi mở app offline (hiện thông tin tài khoản đã lưu, không báo lỗi). Phiên hết hạn hoặc bị thu hồi (refresh token không dùng được) → trạng thái "Cần đăng nhập lại", đồng bộ tạm dừng, dữ liệu cục bộ và thay đổi chưa đẩy lên được giữ nguyên. | Must | M6 |
| FR-41 | **Đăng xuất có lựa chọn dữ liệu:** "Sign out" mở hộp thoại hai lựa chọn: **giữ dữ liệu trên thiết bị này** (mặc định, được chọn/focus sẵn) hoặc **xoá dữ liệu khỏi thiết bị này** (xoá goal, entry, timer đang chạy, settings cục bộ trong một transaction; giữ lựa chọn ngôn ngữ). Từ M7: nếu còn thay đổi chưa đồng bộ, hộp thoại nêu số thay đổi và app thử đồng bộ lần cuối trước khi đăng xuất (khi có mạng). Đăng xuất không xoá dữ liệu trên cloud. | Must | M6 (cảnh báo chưa đồng bộ: M7) |
| FR-42 | **Card Account:** hiển thị trạng thái (chưa đăng nhập / đang đăng nhập / đã đăng nhập / cần đăng nhập lại), email và tên hiển thị của tài khoản Google; **không** hiển thị ảnh đại diện từ Google (tránh request ngoài, NFR-01) mà dùng chữ cái đầu. Card About cập nhật nội dung (không còn "No account"). | Must | M6 |
| FR-43 | **Dữ liệu cloud và quyền truy cập:** Supabase Postgres có bảng `goals`, `entries` theo người dùng; Row Level Security chỉ cho phép người dùng đã đăng nhập đọc/thêm/sửa hàng có `user_id = auth.uid()`; vai trò `anon` không có quyền; client không được xoá cứng hàng. Schema, RLS, trigger nằm trong file SQL migration trong repo để user chạy một lần. | Must | M6 |
| FR-44 | **Phạm vi đồng bộ:** chỉ đồng bộ **goal** (mọi field, gồm `archived`) và **entry**. **Không** đồng bộ (là thiết lập của thiết bị): ngôn ngữ (`locale`), nhắc nhở (`reminderEnabled`, `reminderTime`), `lastReminderDate`, `lastBackupAt`, `plusOneShown`, timer đang chạy (`activeTimer`), trạng thái nhắc đăng nhập, quyền notification, trạng thái persist storage. Entry tạo từ timer được đồng bộ như entry thường sau khi Save. | Must | M7 |
| FR-45 | **Offline-first:** mọi thao tác ghi (tạo/sửa/xoá goal, entry, archive, timer Save, import) ghi vào IndexedDB trước và UI cập nhật ngay, không chờ mạng; đồng bộ chạy nền. Mất mạng hoặc cloud lỗi không làm hỏng hay chặn thao tác nào. | Must | M7 |
| FR-46 | **Khi nào đồng bộ:** ngay sau khi đăng nhập; khi app khởi động có phiên; khi trình duyệt chuyển online; khi app trở lại foreground (`visibilitychange`); khoảng 2 giây sau một thay đổi cục bộ (gom nhiều thay đổi); định kỳ mỗi `VITE_SYNC_INTERVAL_MS` (mặc định 5 phút) khi app đang hiển thị; và khi người dùng bấm "Sync now". Lỗi thì thử lại với backoff tăng dần (30 s → tối đa 15 phút). Nhiều tab: tối đa một tab đồng bộ tại một thời điểm. | Must | M7 |
| FR-47 | **Đăng nhập lần đầu trên thiết bị đã có dữ liệu = gộp (merge), không xoá:** dữ liệu tạo khi chưa đăng nhập được đẩy lên tài khoản và gộp với dữ liệu sẵn có trên cloud; trùng `id` thì theo FR-49; không bản ghi nào bị xoá do việc đăng nhập. Sau khi gộp hiện toast tóm tắt. Nếu thiết bị trước đó đã đăng nhập **một tài khoản khác** (đăng xuất và giữ dữ liệu), hiện hộp thoại xác nhận nêu số goal/entry sẽ thêm vào tài khoản mới; "Cancel" → đăng xuất, không đẩy gì lên. | Must | M7 |
| FR-48 | **Xoá lan truyền:** xoá entry, xoá goal (kèm entry) trên một thiết bị → biến mất trên các thiết bị khác sau lần đồng bộ kế tiếp (xoá mềm bằng `deletedAt`, không hiển thị ở bất kỳ màn hình, thống kê, export nào). | Must | M7 |
| FR-49 | **Xung đột last-write-wins theo bản ghi:** cùng một goal/entry bị sửa ở hai nơi → bản có `updatedAt` mới hơn thắng (toàn bộ bản ghi, không gộp field); bằng nhau → bản trên cloud thắng. Xoá là một lần sửa (có `updatedAt`), nên sửa mới hơn lần xoá thì bản ghi được giữ lại. Sửa một bản ghi luôn tạo `updatedAt` lớn hơn phiên bản đang có trên máy (chống lệch đồng hồ giữa thiết bị). | Must | M7 |
| FR-50 | **Trạng thái đồng bộ:** khi đã đăng nhập, mọi màn hình chính có chỉ báo gọn, truy cập được (có text cho screen reader) với các trạng thái: đã đồng bộ (kèm thời điểm), đang đồng bộ, offline kèm số thay đổi chờ, lỗi (bấm để thử lại), cần đăng nhập lại. Card Account hiện chi tiết: lần đồng bộ gần nhất, số thay đổi chờ, lỗi gần nhất, nút "Sync now". | Must | M7 |
| FR-51 | **Backup khi đã đăng nhập:** Export không chứa bản ghi đã xoá và metadata đồng bộ (`schemaVersion` vẫn 1). Import khi đã đăng nhập thay thế dữ liệu **trên thiết bị và trong tài khoản** (bản ghi trong file được đánh dấu mới hơn; bản ghi hiện có không nằm trong file bị xoá mềm); hộp thoại D3 nói rõ điều này. Import khi chưa đăng nhập giữ hành vi M3. | Must | M7 |
| FR-52 | **Nhắc đăng nhập trên Today:** khi cloud được cấu hình, chưa đăng nhập, đang online, và (đã ≥ 7 ngày kể từ bản ghi đầu tiên **hoặc** có ≥ 10 entry): hiện banner nhẹ (không modal, không che nội dung) với "Sign in with Google" và "Not now". "Not now" ẩn 14 ngày; sau 3 lần "Not now" không hiện trên Today nữa (vẫn còn ở Settings). Khi đồng thời đủ điều kiện nhắc backup (FR-21), chỉ hiện banner đăng nhập. | Must | M8 |
| FR-53 | **Nhắc đăng nhập khi export:** khi cloud được cấu hình và chưa đăng nhập, sau khi Export thành công, card Backup hiện một dòng gợi ý có nút đăng nhập (đăng nhập để sao lưu tự động); tối đa 1 lần mỗi 30 ngày. | Must | M8 |
| FR-54 | **Lối vào cố định và copy cập nhật:** card Account (chưa đăng nhập) luôn có lời giải thích + nút đăng nhập, không có "Not now"; card Storage ở trạng thái "Not protected" gợi ý đăng nhập; mô tả card Backup và About đổi theo trạng thái đăng nhập. | Must | M8 (About: M6) |

## 6. Yêu cầu phi chức năng

| ID | Yêu cầu | Đo bằng |
| :- | :- | :- |
| NFR-01 | **Local-first, riêng tư** (sửa ở v2.0): (a) bản build không cấu hình cloud, hoặc người dùng chưa từng bấm đăng nhập và không có phiên: 0 request tới origin khác origin của app; (b) khi đăng nhập/đã đăng nhập: chỉ thêm request tới đúng origin của `VITE_SUPABASE_URL` (`/auth/v1/*`, `/rest/v1/*`) và điều hướng toàn trang tới trang đăng nhập Google (`accounts.google.com`) trong lúc đăng nhập; (c) không analytics, không font/CDN ngoài, không ảnh đại diện từ Google, không realtime websocket. | Playwright ghi mọi request: (a) project chuẩn và project cloud khi chưa đăng nhập: 0 request ngoài origin; (b) project cloud: mọi request có origin ∈ {app, mock Supabase}. |
| NFR-02 | **Offline:** sau lần tải đầu, mọi tính năng hoạt động khi mất mạng. | Playwright `context.setOffline(true)` + reload: app render và ghi entry được. |
| NFR-03 | **Hiệu năng:** tính toàn bộ thống kê Review cho 5 goal × 3 năm (≈ 5.500 entry) < 200 ms; Review hiển thị heatmap < 1,5 s sau khi điều hướng với dữ liệu đó (máy dev); JS tải ban đầu ≤ 250 KB gzip (đã gồm thư viện i18n và cả hai file dịch `en`, `vi`), thư viện biểu đồ chỉ tải khi vào Review/Goal detail. **v2.0:** SDK Supabase nằm trong chunk riêng, không `modulepreload`, chỉ được tải khi người dùng bấm đăng nhập, khi URL là callback OAuth, hoặc khi đã có phiên lưu sẵn; JS tải ban đầu vẫn ≤ 250 KB gzip trên bản build có cấu hình cloud; Today render không chờ mạng/đồng bộ. Ghi nhận (quyết định 2026-10-10): service worker precache cả chunk lazy (Recharts, Supabase) sau khi cài để chạy offline; ngân sách 250 KB chỉ áp cho tải trang ban đầu. | Unit benchmark; Playwright đo thời gian và theo dõi request chunk; output `vite build`. |
| NFR-04 | **Toàn vẹn dữ liệu:** mọi ghi đa bảng (xoá goal kèm entry, import) là một transaction; dữ liệu có `schemaVersion`; import lỗi không làm thay đổi dữ liệu. | Integration test với fake-indexeddb. |
| NFR-05 | **Bảo mật** (mở rộng ở v2.0): validate mọi input ở biên (form, file import ≤ 5 MB, **dữ liệu kéo từ cloud**: hàng sai schema bị bỏ qua và đếm, không ghi vào IndexedDB, không crash); không dùng `dangerouslySetInnerHTML`; ghi chú hiển thị dạng text. Cloud: RLS bật trên mọi bảng, chính sách theo `auth.uid()`; client chỉ dùng publishable/anon key (công khai theo thiết kế của Supabase); `service_role`/secret key không bao giờ nằm trong repo, bundle hay GitHub Actions; `.env`, `.env.local` không commit; key build lấy từ GitHub Actions secrets. OAuth dùng PKCE (không đưa token lên URL). Phiên Supabase lưu ở `localStorage` key `opb-auth` (chấp nhận, xem A-26). | Unit test, grep source/bundle, test RLS (`npm run test:db`, cần Docker; không có thì kiểm thủ công theo TASKS "User setup"). |
| NFR-06 | **Tương thích:** Chrome/Edge bản mới nhất (desktop, Android), Safari iOS ≥ 16.4 (notification chỉ khi đã "Add to Home Screen"), Firefox desktop bản mới nhất (không có cài app). Màn hình 360–1440 px không có thanh cuộn ngang. | Playwright Chromium (tự động); các trình duyệt khác kiểm thủ công. |
| NFR-07 | **Giới hạn nhắc nhở (chấp nhận trong MVP):** không có server nên notification chỉ được đảm bảo khi app đang mở (kể cả tab/cửa sổ ở nền). Khi app đóng hẳn, nhắc dựa vào file `.ics` (FR-16). | Ghi rõ trong README và màn hình Settings. |
| NFR-08 | **Accessibility:** WCAG 2.1 AA cơ bản: mọi control có nhãn, dùng được bằng bàn phím, heatmap có nhãn text cho từng ô; `<html lang>` luôn khớp ngôn ngữ đang hiển thị (`en` / `vi`). | `@axe-core/playwright`: 0 vi phạm mức serious/critical. |
| NFR-09 | **Vận hành:** cài đặt, build, lint, test bằng các lệnh npm trong README; không cần cài gì global; không cần biến môi trường bắt buộc (v2.0: cấu hình Supabase là tuỳ chọn; mọi test tự động mặc định chạy được **không cần** project Supabase thật, không cần Docker). | QC chạy theo README trên máy sạch. |
| NFR-10 | **Tách lớp cho sync** (cập nhật v2.0, sync đã được làm): mọi bản ghi có `id`, `createdAt`, `updatedAt`, và trong IndexedDB có thêm `deletedAt`, `dirty`; UI và logic chỉ truy cập dữ liệu qua repository interface; SDK Supabase chỉ được import trong `src/integration/supabase/**`; service chỉ dùng `AuthPort`/`RemoteStore` (interface). | Review code + lint rule chặn import chéo lớp (probe). |
| NFR-11 | **Chất lượng bản dịch và không hardcode chuỗi:** (a) `en` và `vi` có cùng tập key, cùng biến nội suy, không có giá trị rỗng; (b) không có chuỗi chữ hiển thị viết thẳng trong JSX của `src/ui`, `src/app`; (c) ở chế độ `vi`, DOM của mọi màn hình không chứa chuỗi tiếng Anh nào lấy từ bản `en` (trừ chuỗi giống nhau ở hai bản như tên thương hiệu, `+1%`) và không lộ key dịch thô; (d) file dịch đóng gói cùng app, hoạt động offline, 0 request ngoài origin (NFR-01 giữ nguyên); (e) giao diện `vi` (chuỗi thường dài hơn) không gây thanh cuộn ngang ở 360 px. | (a) unit test so sánh hai file; (b) ESLint `--max-warnings 0`; (c) test quét DOM (component + E2E) ở `vi-VN`; (d) Playwright đếm request; (e) Playwright viewport 360 px ở `vi-VN`. |
| NFR-12 | **Đúng đắn của đồng bộ (v2.0):** (a) hội tụ: sau khi mọi thiết bị đồng bộ xong và không có thay đổi mới, tập goal/entry còn sống trên mọi thiết bị và trên cloud giống hệt nhau (mọi field); (b) không mất thay đổi cục bộ: một thay đổi ghi offline chỉ bị thay bởi một thay đổi có `updatedAt` mới hơn (FR-49), không bao giờ bị xoá vì lỗi mạng, đăng nhập, hay hai tab cùng đồng bộ; (c) áp dữ liệu từ cloud vào IndexedDB theo lô trong một transaction. | Service test hai thiết bị (hai DB fake-indexeddb + remote giả), test ngẫu nhiên có seed (20 seed × 200 thao tác); E2E hai browser context với mock Supabase. |
| NFR-13 | **Hiệu năng đồng bộ:** đẩy/kéo theo lô ≤ 500 hàng; đồng bộ lần đầu dữ liệu `large-backup.json` (≈ 5.500 entry) với mock Supabase xong < 15 s trên máy dev; trong lúc đồng bộ vẫn ghi entry được trên Today; benchmark NFR-03 (< 200 ms) vẫn đạt với lớp lọc bản ghi đã xoá. | E2E đo thời gian + log kích thước lô ở mock; benchmark Vitest. |
| NFR-14 | **Nâng cấp dữ liệu an toàn:** nâng schema IndexedDB v1 → v2 giữ nguyên 100% goal, entry, settings, timer, `locale` của người dùng đang dùng bản phase 1; nâng cấp lỗi thì dữ liệu cũ không bị đổi (IndexedDB rollback) và app hiện màn `StorageError`. | Integration test mở DB v1 có dữ liệu S1 bằng app v2; E2E dựng DB v1 bằng IndexedDB API thô rồi mở app. |
| NFR-15 | **Chịu lỗi cloud:** Supabase không tới được (offline, project free tier bị tạm dừng sau 7 ngày không hoạt động, 5xx, 429, timeout 20 s) → chỉ báo lỗi, backoff, app dùng bình thường; không có unhandled promise rejection; 401/403 → trạng thái "Cần đăng nhập lại". | Service test với remote giả ném lỗi; E2E mock trả 500/401. |
| NFR-16 | **Tối thiểu dữ liệu:** cloud chỉ lưu field của goal/entry + `user_id` + mốc đồng bộ (`deleted_at`, `server_updated_at`); OAuth Google chỉ xin scope mặc định (`openid email profile`); app không gửi dữ liệu nào khác (thiết bị, vị trí, analytics). | Review migration SQL + test cột được đẩy lên (mock). |
| NFR-17 | **Kiểm thử không cần project thật:** unit/service test dùng `AuthPort`/`RemoteStore` giả; E2E dùng mock Supabase HTTP chạy cục bộ (Node, không Docker) cho cả luồng OAuth PKCE và REST; test SQL/RLS chạy được với Supabase local (`npx supabase`, cần Docker) qua lệnh riêng `npm run test:db` và được bỏ qua có thông báo khi thiếu Docker. Mọi thứ không kiểm được tự động (Google thật, project thật, RLS khi không có Docker, iOS) ghi `NOT VERIFIED` kèm bước kiểm thủ công. | QC chạy `npm run test:e2e` trên máy không có Docker và không có `.env.local`. |

## 7. Loại app và bề mặt người dùng

- **Web app dạng PWA**, có UI, responsive cho điện thoại và máy tính, cài được như app.
- Màn hình chính (chi tiết giao diện do designer quyết):
  - **Today** — goal đang chạy, tiến độ hôm nay, ghi nhanh, timer, banner nhắc.
  - **Goals** — danh sách goal theo trạng thái; tạo/sửa/xoá/archive; vào chi tiết goal.
  - **Goal detail** — why, tiến độ, streak, đường cong 1%, lịch sử.
  - **Review** — heatmap năm, streak, tổng giờ, % tiến độ, biểu đồ tuần/tháng.
  - **Day** — ghi bù/sửa entry cho một ngày bất kỳ đã qua.
  - **Settings** — nhắc nhở, file `.ics`, export/import, thông tin lưu trữ; **(v2.0)** card **Account**: đăng nhập Google, thông tin tài khoản, trạng thái đồng bộ chi tiết, "Sync now", đăng xuất.
- **(v2.0) Thành phần mới** (vị trí, hình thức do designer quyết; chỉ nêu yêu cầu):
  - Chỉ báo trạng thái đồng bộ gọn, thấy được từ mọi màn hình chính khi đã đăng nhập (FR-50).
  - Banner nhắc đăng nhập trên Today (FR-52); dòng gợi ý sau Export trong card Backup (FR-53).
  - Hộp thoại đăng xuất (giữ/xoá dữ liệu, cảnh báo thay đổi chưa đồng bộ) (FR-41); hộp thoại xác nhận gộp dữ liệu khi đổi tài khoản (FR-47); biến thể D3 khi đã đăng nhập (FR-51).
  - Trang đăng nhập là của Google (ngoài app); nút "Sign in with Google" theo hướng dẫn thương hiệu của Google.
- Luồng đăng nhập: Settings (hoặc banner Today) → Google → quay lại đúng màn hình đã bắt đầu → toast gộp dữ liệu (nếu có) → chỉ báo "Syncing" → "Synced".
- Ngôn ngữ UI: song ngữ **English / Tiếng Việt** (FR-32 … FR-36). Mặc định theo ngôn ngữ trình duyệt, đổi trong Settings. Copy tiếng Việt do designer chốt trong `DESIGN.md` cạnh copy tiếng Anh.

## 8. Chỉ số thành công

- Ghi một entry thủ công từ lúc mở app tới khi lưu: ≤ 3 thao tác và ≤ 10 giây.
- Trong 4 tuần đầu, người dùng ghi ít nhất 5/7 ngày mỗi tuần (tự xem trên heatmap).
- 0 sự cố mất dữ liệu: round-trip export → import khôi phục 100% goal và entry (kiểm bằng test).
- App cài được và mở offline trên ít nhất một điện thoại thật của user (Android hoặc iOS).
- **(v2.0)** User đăng nhập Google thành công trên máy tính và điện thoại qua bản GitHub Pages; một entry ghi trên điện thoại hiện trên máy tính trong ≤ 1 phút sau khi cả hai đang mở và online (hoặc ngay khi bấm "Sync now").
- **(v2.0)** 0 sự cố mất dữ liệu do đồng bộ: test hội tụ hai thiết bị (NFR-12) pass 20/20 seed; dữ liệu phase 1 của user còn nguyên sau khi nâng cấp lên v2 (NFR-14).
- **(v2.0)** Người không đăng nhập không thấy khác biệt nào ngoài card Account và tối đa 3 lần banner nhắc trên Today.

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
- A-11: (cập nhật v2.0) Agent không tự deploy. App được host trên GitHub Pages (`/one-percent-better/`), workflow `.github/workflows/pages.yml` deploy khi push lên `main` (user/orchestrator push). Push code M6/M7 lên `main` trước khi đặt GitHub secrets Supabase là an toàn: bản deploy không có cấu hình cloud nên giống phase 1 (FR-38).
- A-12: Nhắc backup (FR-21) hiện khi có ít nhất 1 goal và chưa từng export hoặc lần export gần nhất cách hơn 30 ngày.
- A-13: Không cho archive goal đang có timer chạy (phải Stop hoặc Discard trước). Xoá goal đang có timer chạy thì timer bị huỷ cùng goal.
- A-14: Timer chạy dưới 30 giây vẫn điền sẵn 1 phút; chạy quá 1440 phút thì điền sẵn 1440 (người dùng sửa được trước khi lưu).
- A-15: Tên thương hiệu "1% Better per Day" / "1% Better" và chuỗi `+1%` giống nhau ở cả hai ngôn ngữ. Web manifest là file tĩnh nên giữ một bản (tên thương hiệu, `lang: "en"`); tên app cài trên màn hình chính không đổi theo ngôn ngữ.
- A-16: Khi người dùng chưa chọn ngôn ngữ, app không ghi gì vào kv: mỗi lần khởi động lại áp dụng FR-33 (đổi ngôn ngữ trình duyệt thì app đổi theo). Chỉ khi người dùng chọn trong Settings mới lưu key `locale`.
- A-17: Các control do trình duyệt vẽ (`<input type="date">`, `<input type="time">`, hộp xin quyền notification, hộp chọn file) hiển thị theo ngôn ngữ của trình duyệt/hệ điều hành, không theo lựa chọn trong app. Label và lỗi quanh các control này vẫn được dịch.
- A-18: Copy tiếng Việt (giọng điệu, xưng hô) do designer chốt trong `DESIGN.md`; developer dùng nguyên văn. Mã lỗi, dữ liệu file backup và tên file giữ tiếng Anh/ASCII.
- A-19: Nội dung notification và file `.ics` dùng ngôn ngữ đang chọn tại thời điểm gửi/tải. Sự kiện lịch đã thêm trước đó không tự đổi ngôn ngữ (người dùng tải lại file nếu muốn).
- A-20 (v2.0): Backend là Supabase (Postgres + Auth + RLS, gói Free), một project do user tạo, region gần Việt Nam (Singapore). Không có server/Edge Function riêng.
- A-21: Chỉ Google OAuth; scope mặc định `openid email profile`. Tên hiển thị lấy từ metadata Google (`full_name`/`name`), thiếu thì dùng phần trước `@` của email.
- A-22: Một thiết bị đăng nhập tối đa một tài khoản tại một thời điểm. Các tab của cùng trình duyệt dùng chung phiên.
- A-23: Đồng bộ đúng phạm vi FR-44; thiết lập của thiết bị không đồng bộ. Đổi giờ nhắc/ngôn ngữ trên máy này không ảnh hưởng máy khác.
- A-24: Xung đột giải theo FR-49 (last-write-wins theo bản ghi, `updatedAt` do client đặt, có bù lệch đồng hồ cục bộ). Hệ quả chấp nhận: hai thiết bị sửa cùng goal lúc offline thì bản sửa sau cùng (theo đồng hồ) thắng toàn bộ; goal đã xoá có thể "sống lại" nếu thiết bị khác sửa nó sau thời điểm xoá (entry đã xoá kèm goal thì vẫn xoá).
- A-25: Dữ liệu sau khi gộp có thể vi phạm quy tắc chỉ áp khi nhập (vd. hai thiết bị offline cùng ghi khiến tổng một ngày > 1440 phút, hoặc entry nằm ngoài khoảng goal vừa bị sửa ở máy khác). App hiển thị và tính thống kê như dữ liệu hiện có, không tự sửa/xoá; validate vẫn áp cho mọi lần ghi mới. Entry thuộc goal đã xoá không hiển thị và không được tính.
- A-26: Token phiên Supabase lưu ở `localStorage` (key `opb-auth`) theo cách chuẩn của SDK, không nằm trong IndexedDB; đây là ngoại lệ có chủ đích của FR-09 (FR-09 nói về dữ liệu người dùng). Rủi ro XSS được giảm bằng NFR-05 (không render HTML từ dữ liệu).
- A-27: Đăng nhập lần đầu trên thiết bị chưa từng gắn tài khoản: gộp ngay, không hỏi (chỉ toast). Thiết bị từng gắn tài khoản khác: hỏi trước (FR-47).
- A-28: File export không chứa bản ghi đã xoá, `deletedAt`, `dirty` hay thông tin tài khoản; `schemaVersion` giữ 1, file phase 1 và phase 2 dùng lẫn được.
- A-29: Import khi đã đăng nhập "thay thế cả tài khoản" bằng cách đặt `updatedAt = thời điểm import` cho bản ghi trong file và xoá mềm bản ghi khác (FR-51). Import khi chưa đăng nhập giữ nguyên `id`/`updatedAt` như M3; nếu sau đó đăng nhập, dữ liệu được gộp theo FR-49 (bản trên cloud mới hơn sẽ thắng).
- A-30: Ngưỡng nhắc đăng nhập (FR-52, FR-53): "bản ghi đầu tiên" = `createdAt` nhỏ nhất trong goal/entry còn sống; đếm entry còn sống; ẩn 14 ngày sau mỗi "Not now"; tối đa 3 lần "Not now"; gợi ý sau export tối đa 1 lần/30 ngày. Trạng thái nhắc lưu cục bộ (kv `loginPrompt`), không đồng bộ, không nằm trong backup.
- A-31: Project Supabase gói Free bị tạm dừng sau khoảng 7 ngày không có hoạt động; khi đó app coi như cloud không tới được (NFR-15) và user khôi phục project trong Dashboard. Dữ liệu cục bộ không bị ảnh hưởng.
- A-32: Không dùng realtime; thay đổi từ thiết bị khác chỉ xuất hiện ở lần đồng bộ kế tiếp (FR-46).
- A-33: Đăng xuất mặc định **giữ** dữ liệu trên máy (FR-41). Dữ liệu giữ lại tiếp tục dùng được khi chưa đăng nhập; đăng nhập lại cùng tài khoản thì thay đổi trong lúc đã đăng xuất được đẩy lên.
- A-34: Bản ghi đã xoá (tombstone) được giữ vĩnh viễn ở cloud và trong IndexedDB trong MVP (dung lượng nhỏ); dọn dẹp để Later.

## 10. Open questions

- OQ-01: Chấp nhận giới hạn nhắc nhở của MVP (chỉ đảm bảo khi app đang mở + phương án file `.ics`) hay muốn nhắc tin cậy khi app đóng? Phương án sau cần một push server nhỏ (Web Push + VAPID) — trái với quyết định "không server". **Giả định hiện tại:** chấp nhận giới hạn.
- OQ-02: **Đã quyết (2026-10-11):** GitHub Pages `https://minh-lgm.github.io/one-percent-better/`, deploy bằng GitHub Actions khi push `main`, `BASE_PATH=/one-percent-better/`.
- OQ-03: Đường cong thực tế có muốn chế độ "khắt khe" (ngày lỡ nhân 0.99, minh hoạ 0.99^365 ≈ 0.03) không? **Giả định:** không trong MVP, đưa vào Later.
- OQ-04: **Đã quyết (2026-10-09, Gate 2, user yêu cầu):** UI song ngữ Anh/Việt trong MVP. Hai ngôn ngữ `en`, `vi`; mặc định lần đầu theo `navigator.language` (bắt đầu bằng "vi" → `vi`, còn lại `en`); đổi trong Settings, lưu cục bộ trong kv store, còn sau reload; mọi chuỗi UI (label, nút, lỗi, thông báo, notification, nội dung `.ics`, aria-label) đều dịch; ngày/giờ/số định dạng theo locale; tên goal và ghi chú của người dùng không dịch; không dùng dịch vụ dịch ngoài, mọi chuỗi nằm trong code. Xem FR-32 … FR-36, NFR-11, A-15 … A-19.
- OQ-05: Có cần chỉ tiêu theo tuần (vd. 3 giờ/tuần) hoặc chọn ngày trong tuần không? **Giả định:** không trong MVP.
- OQ-06 (v2.0): App công khai trên GitHub Pages nên **bất kỳ ai có tài khoản Google** đều đăng nhập được và dùng quota Free của project Supabase của user (dữ liệu vẫn tách nhau nhờ RLS). Có muốn chỉ cho phép tài khoản của chính user? Cách làm không cần code: sau khi tự đăng nhập lần đầu, tắt "Allow new users to sign up" trong Supabase Auth (bước tuỳ chọn U9 trong TASKS "User setup"); hoặc để Google OAuth consent ở chế độ "Testing" chỉ với email của user. **Giả định:** khuyến nghị giới hạn (làm U9), app không đổi.
- OQ-07: Có muốn đồng bộ thêm thiết lập (giờ nhắc, bật/tắt nhắc, ngôn ngữ) giữa các thiết bị không? **Giả định:** không (FR-44, A-23); để Later.
- OQ-08: Máy của user/QC có Docker Desktop không? Có → `npm run test:db` chạy SQL migration + test RLS/trigger trên Supabase local tự động. Không → các AC đó ghi `NOT VERIFIED`, user kiểm thủ công trên project thật theo bước U10 trong TASKS. **Giả định:** không có Docker.
- OQ-09: Có cần nút "Xoá dữ liệu cloud" / "Xoá tài khoản" trong app ở MVP không? Xoá cứng cần quyền DELETE (hiện không cấp) và cách báo cho thiết bị khác; xoá tài khoản Auth cần secret key (phải có server). **Giả định:** không trong MVP; user xoá trong Supabase Dashboard; để Later.
- OQ-10: Tên biến key: Supabase đang thay `anon` key (JWT `eyJ…`) bằng **publishable key** (`sb_publishable_…`), key cũ dự kiến ngừng cuối 2026. Plan dùng `VITE_SUPABASE_PUBLISHABLE_KEY` và vẫn nhận `VITE_SUPABASE_ANON_KEY` làm dự phòng. Không cần user trả lời; chỉ cần dán đúng key loại publishable khi làm U6/U7.

## Changelog

- 2026-10-09 — v1, tạo mới (mode `new`).
- 2026-10-09 — v1.1 (khi viết TASKS.md): thêm Assumptions A-12 (điều kiện nhắc backup), A-13 (archive/xoá goal khi timer đang chạy), A-14 (giới hạn số phút điền sẵn của timer). Không đổi FR/NFR.
- 2026-10-09 — v1.2 (mode `revise`, feedback Gate 2: thêm tiếng Việt): OQ-04 chuyển thành quyết định (song ngữ en/vi). Thêm Goal song ngữ, US-14, FR-32 … FR-36 (chọn ngôn ngữ, mặc định theo trình duyệt, lưu kv, phạm vi dịch, định dạng theo locale), NFR-11 (chất lượng bản dịch, cấm hardcode chuỗi), A-15 … A-19. Sửa Non-goals (bỏ "chỉ tiếng Anh"), §7 (ngôn ngữ UI), NFR-03 (ngân sách bundle gồm i18n), NFR-08 (`<html lang>`). Không đổi FR-01 … FR-31.
- 2026-10-12 — v2.0 (mode `revise`, phase 2: đăng nhập tuỳ chọn Google + đồng bộ cloud Supabase offline-first, theo quyết định user 2026-10-12). §1 thêm mục tiêu 6 và bài toán phase 2; §2 tài khoản tuỳ chọn, nhiều thiết bị, app công khai trên GitHub Pages; §3 Goals thêm phạm vi phase 2, Non-goals viết lại (bỏ "không tài khoản/sync", thêm provider khác, realtime, đồng bộ thiết lập thiết bị, xoá cloud trong app, agent không deploy); §4 thêm US-15 … US-20; §5 thêm FR-37 … FR-54 (M6: FR-37 … FR-43; M7: FR-44 … FR-51; M8: FR-52 … FR-54); §6 sửa NFR-01 (request ngoài chỉ tới Supabase/Google khi đăng nhập), NFR-03 (SDK Supabase lazy; ghi nhận quyết định precache 2026-10-10), NFR-05 (RLS, key, PKCE, validate dữ liệu cloud), NFR-09, NFR-10; thêm NFR-12 … NFR-17; §7 thêm card Account và thành phần mới; §8 thêm chỉ số v2.0; §9 sửa A-11, thêm A-20 … A-34; §10 OQ-02 đã quyết, thêm OQ-06 … OQ-10. Không đổi FR-01 … FR-36.
