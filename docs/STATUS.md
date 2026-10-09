# Build status — 1% better per day

**Yêu cầu gốc:** App tracking hoạt động. User đặt mục tiêu, sau đó ghi nhận lại thời gian thực hiện mỗi ngày để xem được quá trình phấn đấu nỗ lực của bản thân nhằm đạt mục tiêu, hoặc nhìn lại trong năm.
**Bắt đầu:** 2026-10-09   **Cập nhật:** 2026-10-09 2026-10-10 (thư mục đã đổi tên thành one-percent-better; M1 PASS r2; M2 bắt đầu)
**Next step:** qc M2 round 1 (report docs/qc/report-M2-r1.md)

## Quyết định của user
- 2026-10-09 — Nền tảng? → Web app (PWA, mở được trên điện thoại)
- 2026-10-09 — Stack? → Để planner chọn
- 2026-10-09 — Dữ liệu/tài khoản MVP? → 1 user, lưu cục bộ trên thiết bị, không đăng nhập, có export/import JSON
- 2026-10-09 — Gate 1: duyệt plan? → Duyệt, giữ giả định mặc định OQ-01..05 (nhắc chỉ khi app mở + .ics; không deploy; curve khắt khe để sau; UI tiếng Anh; không chỉ tiêu tuần)
- 2026-10-09 — Gate 2: có duyệt design không? → Có, trình design trước khi code
- 2026-10-09 — Gate 2: duyệt design? → Chưa, user muốn tự review Figma trước; đồng thời yêu cầu thêm ngôn ngữ tiếng Việt (đổi giả định OQ-04: UI song ngữ vi/en, mặc định theo ngôn ngữ trình duyệt, đổi trong Settings)
- 2026-10-09 — Gate 2 (lần 2): duyệt design song ngữ? → Duyệt, bắt đầu build M1
- 2026-10-09 — Thư mục `1%better` làm npx lỗi "URI malformed"? → User chọn đổi tên nhưng chưa làm; 2026-10-10 user nói "triển khai tiếp", orchestrator tạm tạo `subst Z:` nhưng user yêu cầu bỏ; đã gỡ Z:. Chốt: đổi tên thư mục thành `one-percent-better` — đã đổi 2026-10-10, npx chạy bình thường.
- 2026-10-09 — Phạm vi MVP? → (1) Goals + nhập phút mỗi ngày + heatmap năm + streak, (2) Timer đếm giờ trong app, (3) Biểu đồ đường cong 1% so với thực tế, (4) Nhắc nhở hằng ngày (notification)

## Tham chiếu
- Figma: https://www.figma.com/design/DrO15cZxPcb9hp1lGSUddd (team "Minh Lgm's team"); page "Mobile 360" = màn hình, page "Components" = component sets

## Môi trường
- Windows 11, Git Bash / PowerShell
- Node v22.14.0, npm 10.9.2, pnpm 9.15.4, Python 3.14.6
- Greenfield, git init 2026-10-09

## Tiến độ
| Bước | Trạng thái | Output | Ghi chú |
| :- | :- | :- | :- |
| Intake | DONE | docs/STATUS.md | |
| Plan | DONE v1.2 (duyệt 2026-10-09; revise song ngữ en/vi) | docs/plan/PRD.md, ARCHITECTURE.md, TASKS.md | 5 milestone, 34 task, 59 AC; lần gọi planner đầu bị ngắt, lần 2 hoàn tất |
| Design | DONE v1.1 (song ngữ, card Language) (duyệt 2026-10-09) | docs/design/DESIGN.md, docs/design/mockups/*.html | Figma: https://www.figma.com/design/DrO15cZxPcb9hp1lGSUddd (orchestrator đẩy từ mockup; 8 màn mobile 360 + 3 dialog + Dark mode + Today tiếng Việt + card Language, variables Light/Dark, components Button/Badge/PlusPill/TabBar) |
| M1 | PASS (round 2) | docs/qc/report-M1-r2.md | AC10/AC11 phần thủ công NOT VERIFIED (user tự kiểm, mục 8 report) | Dev tự kiểm: lint/typecheck/Vitest 128/build/Playwright 20 xanh trên bản sao sạch; AC10/AC11 phần thủ công NOT VERIFIED |
| M2 | DOING — dev DONE (commit f2e9cae), chờ QC r1 | docs/handoff/dev-M2.md | AC8/9/11 phần thủ công NOT VERIFIED |
| M3 | TODO | | |
| M4 | TODO | | |
| M5 | TODO | | |
| Final QC | TODO | | |

## Backlog (defect Minor, đề xuất chưa làm)
| ID | Mô tả | Nguồn |
| :- | :- | :- |
| M1-P1 | Today sort theo createdAt, chưa tie-break theo id/name khi trùng timestamp | QC r1 §9 |
| M1-P2 | Thêm `getById` vào EntryRepository (EntryService.update/remove đang quét theo khoảng ngày) — làm ở M3 | dev handoff M1, QC r1 §9 |
| M1-P3 | docs/handoff/dev-M1.md dòng 56 còn nhắc thư mục cũ `1%better` (lịch sử) | QC r2 |

## Ghi chú vận hành
- 2026-10-10 — Write tool của subagent `qc` bị harness từ chối ghi file report ("Subagents should return findings as text"). Orchestrator chép nguyên văn text QC trả về vào docs/qc/report-M1-r1.md, có ghi chú đầu file. Áp dụng tương tự cho các report sau nếu còn bị chặn.
