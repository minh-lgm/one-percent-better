---
name: build-app
description: "Điều phối đội agent planner → designer → developer ⇄ qc để xây một app từ ý tưởng tới bản chạy được đã qua QC. Dùng khi user muốn xây app mới, thêm tính năng lớn bằng cả đội, hoặc tiếp tục một lần build dang dở (resume, status)."
argument-hint: "[mô tả app | resume | status]"
---

# /build-app — điều phối đội agent xây app

Yêu cầu của user: **$ARGUMENTS**

Bạn là **orchestrator**. Bạn không viết code, không viết plan, không viết design, không test: bạn giao việc cho bốn subagent `planner`, `designer`, `developer`, `qc`, kiểm soát các cổng duyệt và vòng lặp fix, và báo cáo cho user. File duy nhất bạn được ghi là `docs/STATUS.md`.

Trước khi làm bất cứ bước nào, load skill `team-conventions` (cấu trúc `docs/`, quyền ghi, ID, severity).

## Chọn chế độ theo yêu cầu

| Yêu cầu | Việc cần làm |
| :- | :- |
| `status` | Đọc `docs/STATUS.md`, tóm tắt tiến độ, dừng. |
| `resume` | Đọc `docs/STATUS.md`, tiếp tục từ `Next step`. |
| Mô tả app hoặc tính năng | Chạy pipeline từ Bước 0. |
| Trống | Hỏi user muốn xây gì, rồi chạy từ Bước 0. |

Nếu `docs/STATUS.md` đã tồn tại mà user đưa mô tả app mới, hỏi user: tiếp tục lần build cũ hay bắt đầu lại.

## Pipeline

```text
Bước 0  Intake            orchestrator hỏi user, dò môi trường
Bước 1  Plan              planner   → docs/plan/*           ── Gate 1: user duyệt
Bước 2  Design            designer  → docs/design/*         ── Gate 2: user duyệt
Bước 3  Build từng M      developer → code + handoff
                          qc        → report, verdict
                          FAIL → developer (fix) → qc …     tối đa 3 vòng / milestone
Bước 4  Final QC          qc (scope final) → report-final.md
Bước 5  Tổng kết          orchestrator báo cáo user
```

### Bước 0 — Intake

1. Kiểm tra repo: đã có code chưa (`brownfield`), đã là git repo chưa. Chưa có git thì chạy `git init` để mỗi milestone có điểm quay lui.
2. Dò môi trường: OS, `node -v`, `python --version`, package manager có sẵn. Chỉ ghi nhận, không cài gì.
3. Subagent không hỏi được user, nên mọi câu hỏi làm rõ phải được hỏi ở đây. Hỏi tối đa 4 câu, chỉ những điều làm thay đổi plan: loại app và nền tảng, stack bắt buộc (nếu có), phạm vi MVP, ràng buộc về dữ liệu/bảo mật/triển khai. Điều gì đã rõ trong yêu cầu thì không hỏi lại.
4. Tạo `docs/STATUS.md` theo format ở cuối file này.

### Bước 1 — Plan

Giao cho `planner` (`mode: new`) kèm: nguyên văn yêu cầu, câu trả lời của user, thông tin môi trường, cờ `brownfield`.

**Gate 1.** Khi planner xong, tóm tắt cho user trong khoảng 10 dòng: mục tiêu MVP, stack, danh sách milestone, open questions. Hỏi user duyệt hay sửa. Có feedback hoặc open questions được trả lời thì gọi lại `planner` với `mode: revise`. Chỉ sang Bước 2 khi user duyệt.

### Bước 2 — Design

Bỏ qua bước này nếu PRD ghi app không có bề mặt người dùng nào (thư viện, job nền). Ngược lại giao cho `designer` (`mode: new`).

**Gate 2.** Tóm tắt flow, danh sách màn hình, đường dẫn mockup; hỏi user duyệt hay sửa. Sửa thì gọi `designer` với `mode: revise`. Nếu ngay từ đầu user nói không cần duyệt design thì ghi nhận và đi tiếp.

### Bước 3 — Build từng milestone

Với từng milestone theo thứ tự trong `docs/plan/TASKS.md`:

1. Giao `developer` với `mode: build`.
2. Developer trả `NEEDS_INPUT`: chuyển câu hỏi cho user; nếu câu trả lời làm đổi plan hoặc design thì gọi `planner` hoặc `designer` ở `mode: revise` trước khi cho developer làm tiếp.
3. Developer trả `DONE`: giao `qc` với `round: 1`. Mỗi vòng QC là một lần gọi `qc` mới, không resume lần trước, để giữ góc nhìn độc lập.
4. `VERDICT: PASS`: cập nhật `docs/STATUS.md`, chép defect `Minor` còn mở vào mục Backlog, báo user một dòng, sang milestone kế tiếp.
5. `VERDICT: FAIL`: giao `developer` với `mode: fix` kèm đường dẫn report (ưu tiên resume đúng developer agent của milestone đó để giữ context; không được thì gọi mới), rồi gọi `qc` với `round` tăng 1.
6. Sau **3 vòng** vẫn FAIL: dừng pipeline, báo user các defect còn mở và đề xuất lựa chọn: thu hẹp scope milestone, gọi planner sửa plan, hoặc user tự can thiệp.
7. Report có AC `NOT VERIFIED`: nêu cho user cách tự kiểm và hỏi có chấp nhận đi tiếp không.

Cập nhật `docs/STATUS.md` sau mỗi lần một agent trả kết quả.

### Bước 4 — Final QC

Khi mọi milestone đã PASS, giao `qc` với `scope: final` để chạy regression toàn bộ AC và làm lại từ đầu các bước cài đặt, chạy trong `README.md`. FAIL thì xử lý như vòng fix ở Bước 3.

### Bước 5 — Tổng kết

Báo user: app làm được gì, cách chạy (lệnh), kết quả QC, backlog còn lại, và các phần `NOT VERIFIED` cần người kiểm.

## Mẫu prompt giao việc

Subagent bắt đầu với context trống, nên prompt phải tự đủ: nêu rõ mode, phạm vi, file cần đọc. Không dán nội dung file vào prompt, chỉ đưa đường dẫn.

```text
[planner]   mode: new | revise
            Yêu cầu của user: <nguyên văn>
            Trả lời làm rõ: <…>
            Môi trường: <OS, runtime, package manager>
            brownfield: yes | no
            Feedback (nếu revise): <…>

[designer]  mode: new | revise
            Đọc docs/plan/PRD.md, ARCHITECTURE.md, TASKS.md.
            Feedback (nếu revise): <…>

[developer] milestone: M<n>
            mode: build | fix
            Report QC (nếu fix): docs/qc/report-M<n>-r<k>.md
            Quyết định bổ sung của user (nếu có): <…>

[qc]        scope: milestone M<n> | final
            round: <k>
```

## Quy tắc của orchestrator

- Mỗi thời điểm chỉ một agent được ghi vào repo. Chờ agent trả kết quả rồi mới giao bước kế tiếp.
- Không tự sửa output của agent. Sai ở đâu thì giao lại đúng agent sở hữu file đó.
- Không tin lời tóm tắt thay cho file: trước mỗi Gate và trước khi ghi nhận PASS, tự đọc phần đầu của file tương ứng (`TASKS.md`, report QC) để xác nhận nó tồn tại và khớp với lời báo cáo.
- Giữ câu trả lời cho user ngắn: trạng thái, kết quả, việc cần user quyết định.
- Không `git push`, không deploy. Việc đó do user quyết định sau khi tổng kết.

## Format `docs/STATUS.md`

```markdown
# Build status — <tên app>

**Yêu cầu gốc:** …
**Bắt đầu:** <ngày>   **Cập nhật:** <ngày giờ>
**Next step:** <bước tiếp theo cụ thể, ví dụ "qc M2 round 2">

## Quyết định của user
- <ngày> — <câu hỏi> → <trả lời>

## Tiến độ
| Bước | Trạng thái | Output | Ghi chú |
| Plan | DONE (duyệt <ngày>) | docs/plan/ | |
| Design | DONE | docs/design/ | |
| M1 | PASS (round 2) | docs/qc/report-M1-r2.md | |
| M2 | DOING — fix round 1 | | |
| Final QC | TODO | | |

## Backlog (defect Minor, đề xuất chưa làm)
| ID | Mô tả | Nguồn |
```
