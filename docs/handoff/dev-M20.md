# Dev handoff — M20 Mẫu "QPT 21 tuần", checkpoint điểm, hành trình cuối

Ngày: 2026-11-04. Build theo `docs/plan/TASKS.md` (M20-T1 … T3, M20-AC1 … AC6, Demo M20, "User setup phase 8" U31 … U33, "Phase 8 — Quy ước bổ sung"), `ARCHITECTURE.md` §4.8 (c) checkpoint/`chartScale`, (d) Q1, (e) mẫu, RoadmapService API, `PRD.md` (FR-75, FR-76, hồi quy FR-68 … 80; NFR-08, 11, 25 … 28; A-86, A-91), `DESIGN.md` v8.0 (S11, S12 banner, S13 "Checkpoint", S14 checkpoint, D7, D11, §5 `CheckpointTable`/`CheckpointChart`/`TemplateDialog`/`CheckpointEditor`, §7.9.0 định dạng, §7.9.2 hàng M20, §7.9.3 nội dung mẫu, §8.4; mockup 12, 14), `docs/plan/ref/qpt-tracker.html` (chỉ đọc), `docs/handoff/dev-M17.md`, `dev-M19.md`, `docs/qc/report-M19-r1.md` §4 (M19-D1).
Quyết định orchestrator: làm M19-D1 trước (commit riêng `fix(M19)`); chip "N changes waiting" khi thiếu bảng giữ nguyên; `--surface-glass` .97 giữ; 20 spec đỏ sẵn trên `main` không sửa.
Commit gốc trước M20: `2f6b376`. Commit (local, chưa push): `git log 2f6b376..HEAD` — `2e9534f` fix(M19) M19-D1, `4e34d06` T1, `57ccce7` T2, `98abeca` T3 e2e, `d4c55e0` README, + commit handoff/test(M20) cuối.

## 1. Tóm tắt

- **M19-D1 (Minor) đã sửa**: nhãn mốc 40 ký tự liền không còn làm cuộn ngang ở 360 px — `.rm-stats > span` có `min-width: 0; overflow-wrap: anywhere`, lưới tổng quan `.rd-ov` đổi `1fr 1fr` → `repeat(2, minmax(0, 1fr))` (cột `1fr` có min-content = chữ dài), `.rd-m .eyebrow` `overflow-wrap: anywhere`. Regression: `e2e/m19-roadmap-ui.spec.ts` test "M19-D1" (360 px, en + vi, danh sách + chi tiết, eyebrow không rộng hơn ô). `tests/qc/m19-r1-accept.spec.ts:343` (`test.fail`) nay báo "Expected to fail, but passed" → **QC lật thành test thường** (không chạm `tests/qc/**`).
- **T1 — mẫu QPT**: `src/domain/roadmap-template.ts` `buildQptTemplate(startDate, locale, ids, now)` → 32 hàng (1 roadmap / 5 phase / 21 mục 7 ngày liên tiếp / 5 checkpoint tối đa 32), nội dung `vi` nguyên văn tracker, `en` nguyên văn DESIGN §7.9.3 (designer đã cung cấp — developer không tự dịch). `RoadmapService.createFromQptTemplate({ startDate, goalId, locale }, today)`: giới hạn 20 → ngày bắt đầu → A-78 → **một** `putMany` (một transaction Dexie; probe lỗi giữa chừng → 0 hàng). D7 `TemplateDialog` mở từ trạng thái rỗng, header danh sách (khi có hàng) và banner `#/roadmaps/new`; ngày mặc định hôm nay + xem trước tuần 1/20/21 cập nhật ngay; picker goal tuỳ chọn; ghi chú ngôn ngữ; lỗi ở lại trong dialog; xong → toast + `#/roadmaps/:id` (focus h1). `datasetQ1` dùng `buildQptTemplate` (3 fixture Q1 sinh lại **không đổi byte**).
- **T2 — checkpoint**: chi tiết có khối *Điểm kiểm tra* đầu cột phải: `CheckpointTable` (`<table>` thật; tên + `W8`/ngày đầy đủ A-91 + ghi chú; ngưỡng `≥ 20`/`—`; ô điểm nhập nhanh lưu khi blur/Enter theo số locale, `7,5` → 7.5, xoá ô → chưa có điểm; trạng thái Đạt/Dưới ngưỡng/Đã ghi/Chưa có điểm + delta có dấu; lỗi `range`/`precision` inline) + `CheckpointChart` (SVG thuần, không Recharts; 4 kiểu cột không dựa vào màu + vạch ngưỡng nét đứt; `chartScale` raw/percent + `cp.scalePercent`; legend 5 mục; tóm tắt SR là `aria-label` của `<svg role="img">`). Editor có khối *Checkpoints*: thêm/sửa (`CheckpointEditor`: tên, ngày, tối đa, ngưỡng, điểm, ghi chú; lỗi inline theo field + `ed.summary`), xoá qua D11 + toast, Alert giới hạn 50.
- **T3**: `e2e/m20-qpt-template.spec.ts` (4 test, chromium, en + vi, 1280/360/1440) và `e2e/cloud/m20-template-sync.spec.ts` (hai context, LWW CP2 18 → 21); README mục **"Big goals / Mục tiêu lớn"**; bench, coverage, ngân sách (§6, §8).
- **Ngân sách `#/today`**: M19 (HEAD `2f6b376`, số QC) **227.162 B / 227.571 B** → sau M20 **227.160 B / 227.564 B** (−2 / −7 B); so baseline M17 229.454 / 229.658: **−2.294 / −2.094 B** (mục tiêu phase ≤ +800 B đạt). Không chuỗi/CSS/nội dung mẫu M20 nào trên đường tải lạnh (marker mới trong `e2e/m10-bundle.spec.ts`).

## 2. Task

| ID | Trạng thái | Ghi chú |
| :- | :- | :- |
| M19-D1 | DONE | `src/ui/styles/roadmaps.css`, `roadmap-screens.css`; test `e2e/m19-roadmap-ui.spec.ts` "M19-D1" (commit `2e9534f`) |
| M20-T1 | DONE | `src/domain/roadmap-template.ts` (+ `roadmap-template.test.ts`, 6 test), `roadmap-progress.ts` (`roadmapWeekOf`), `services/roadmap-service.ts` (`createFromQptTemplate`, + 4 test), `ui/components/roadmap/TemplateDialog.tsx` (+ test, 3), `GoalLinkPicker.tsx` (`disabled`), `screens/Roadmaps.tsx`, `RoadmapNew.tsx`, `src/test/builders.ts`, `roadmap.{en,vi}.json` (mọi hàng M20 của 7.9.2) |
| M20-T2 | DONE | `ui/components/roadmap/{CheckpointTable,CheckpointChart,CheckpointEditor}.tsx`, `score.ts`, `screens/RoadmapDetail.tsx`, `RoadmapEditor.tsx`, `styles/roadmap-screens.css`; test `RoadmapDetail.checkpoints.test.tsx` (3), `RoadmapEditor.checkpoints.test.tsx` (3); `src/test/i18n-scan.ts` (+ test) |
| M20-T3 | DONE | `e2e/m20-qpt-template.spec.ts`, `e2e/cloud/m20-template-sync.spec.ts`, `e2e/m10-bundle.spec.ts` (marker M20), README, handoff này; sửa kèm bug M19 hàng danh sách ≥ 1024 px (§7 mục 11) |

## 3. File chính đã thêm/sửa

- **Mới:** `src/domain/roadmap-template.ts`, `src/domain/roadmap-template.test.ts`; `src/ui/components/roadmap/TemplateDialog.tsx` (+ `.test.tsx`), `CheckpointTable.tsx`, `CheckpointChart.tsx`, `CheckpointEditor.tsx`, `score.ts`; `src/ui/screens/RoadmapDetail.checkpoints.test.tsx`, `RoadmapEditor.checkpoints.test.tsx`; `e2e/m20-qpt-template.spec.ts`, `e2e/cloud/m20-template-sync.spec.ts`; `docs/handoff/dev-M20.md`.
- **Sửa:** `src/domain/roadmap-progress.ts`; `src/services/roadmap-service.ts` (+ test); `src/ui/screens/Roadmaps.tsx`, `RoadmapNew.tsx`, `RoadmapDetail.tsx`, `RoadmapEditor.tsx`, `Roadmaps.test.tsx`; `src/ui/components/roadmap/GoalLinkPicker.tsx`; `src/ui/styles/roadmaps.css`, `roadmap-screens.css`; `src/i18n/resources/roadmap.en.json`, `roadmap.vi.json`, `src/i18n/roadmap-parity.test.ts`; `src/test/builders.ts`, `src/test/i18n-scan.ts` (+ test); `e2e/m10-bundle.spec.ts`, `e2e/m19-roadmap-ui.spec.ts`; `README.md`.

## 4. Cách chạy

```bash
npm ci                     # Node 22
cp .env.example .env.local # không có biến mới ở M20
npm run dev                # http://localhost:5173 → #/roadmaps → "Create from QPT 21-week template"
                           # (dữ liệu Q1 không lộ trình: Settings › Import e2e/fixtures/q1-goal-only-backup.json)
```

## 5. Cách test

```bash
npm run check                                   # lint + typecheck + vitest + build:e2e
npx vitest run src/domain/roadmap-template.test.ts src/services/roadmap-service.test.ts src/ui/components/roadmap src/ui/screens/Roadmap src/i18n src/test
npx cross-env BENCH_ASSERT=1 vitest run src/domain/roadmap-progress.bench.test.ts --reporter=verbose   # NFR-26
npx vitest run --coverage src/domain            # coverage src/domain
WRITE_FIXTURES=1 npx vitest run src/test/fixtures-q1.test.ts && git status --short e2e/fixtures   # fixture Q1 không đổi
npm run test:e2e -- --project=chromium e2e/m20-qpt-template.spec.ts e2e/m19-roadmap-ui.spec.ts
npm run test:e2e -- --project=cloud e2e/cloud/m20-template-sync.spec.ts
npm run test:e2e -- --project=chromium e2e/m10-bundle.spec.ts tests/qc/m17-r1-budget.spec.ts      # BUDGET-EXACT cloud tắt
npm run test:e2e -- --project=cloud e2e/cloud/m10-bundle.spec.ts tests/qc/cloud/m17-r1-budget.spec.ts  # BUDGET-EXACT cloud bật
npm run test:e2e                                # 3 project (~9 phút)
```

Kết quả lần chạy cuối: §10.

## 6. Tự kiểm AC

| AC | Kết quả | Bằng chứng (lệnh + output rút gọn) |
| :- | :- | :- |
| M20-AC1 | PASS | `npx vitest run src/domain/roadmap-template.test.ts` → 6/6: `vi` 2026-10-27 → roadmap `toEqual` (title `QPT 21 tuần`, `weeklyTargetMinutes 480`, `milestoneLabel 'Thi QPT'`, `milestoneDate '2027-03-09'`, note 7 dòng, dòng 1 `Nhịp học mỗi tuần`, dòng 7 `Quiz chưa đạt 80% thì chưa sang module mới.`, so khớp ô DESIGN §7.9.3 đọc từ file); 5 phase tiêu đề/ghi chú/thứ tự; 21 mục **so với `PHASES[].weeks` đọc + eval từ `docs/plan/ref/qpt-tracker.html`** (và `name`/`course` của phase, khối nhịp học, `MILESTONES` name/note); W1 `2026-10-27 – 2026-11-02`, W8 end `2026-12-21`, W16 `2027-02-15`, W18 `2027-03-01`, W19 `2027-03-08`, W20 `2027-03-09 – 03-15`, W21 end `2027-03-22`, mọi mục 7 ngày, liền nhau; 5 checkpoint (Diagnostic 10-27/32/—; CP1 12-21/32/—/`≥ 3/4 mỗi mảng LA, Calc`; CP2 02-15/32/20; Mock 1 03-01/24; Mock 2 03-08/26); `en`: cùng cấu trúc/ngày/số, dòng 1 `Weekly rhythm`, mọi tiêu đề W1…W21 = cột `en` DESIGN, JSON không chứa `Lấp lỗ hổng`, `Thi QPT chính thức`, `tuần`, `hồ sơ` và không chữ cái riêng tiếng Việt; start `2027-12-27` → W1 end `2028-01-02`, W10 `2028-02-28 – 03-05` (chứa 29/02), W20 `2028-05-08 – 05-14`, W21 end `2028-05-21`; mọi hàng qua `validate*Input` |
| M20-AC2 | PASS | Service (`roadmap-service.test.ts` "createFromQptTemplate", 4 test): gq → `[1, 5, 21, 5]` hàng, `goalId 'gq'`, 32 id mới, dirty, cùng stamp; hook Dexie `creating` ném lỗi ở bảng checkpoint → promise reject, **0 hàng ở cả 4 bảng**; gq đã liên kết → `ROADMAP_GOAL_ALREADY_LINKED` (title), số hàng không đổi; `nope` → `GOAL_NOT_FOUND`; `2026-02-30`/`''` → `ROADMAP_DATE_INVALID` format; 20 lộ trình → `ROADMAP_LIMIT_REACHED` kind roadmap. E2E `m20-qpt-template.spec.ts` test 1 (vi): rỗng → "Tạo từ mẫu QPT 21 tuần" → focus ô ngày, value `2026-11-04`, xem trước `Tuần 1: 04/11/2026. Tuần 20 (thi QPT): 17/03/2027. Tuần cuối kết thúc ngày 30/03/2027.` → `2026-10-27` → `…09/03/2027…22/03/2027` → "QPT study" → Tạo → toast `Đã tạo lộ trình từ mẫu QPT`, h1 focus, `0/21`, 5 phase, W20 `Thi QPT chính thức` `09/03 – 15/03/2027`, `125`, `Kế hoạch đến hết tuần này: 16 giờ`. Test 2 (en): từ banner `#/roadmaps/new`, không goal → `QPT 21 weeks`, giờ `—`, W20 `Official QPT exam` `2027-03-09 – 03-15`; đổi sang vi, mở lại → vẫn `QPT 21 weeks`/`Official QPT exam`/`Phase 5 · Close the gaps & sit the QPT`/`≥ 3/4 per area: LA, Calc`; tạo lộ trình thứ hai từ header ở vi → `QPT 21 tuần` (mặc định hôm nay → W20 `17/03 – 23/03/2027`, 133 ngày). Component `TemplateDialog.test.tsx`: Esc/Cancel → focus về nút mở; lỗi goal bị chiếm (picker cũ) dưới picker + `aria-invalid` + focus; ngày rỗng → `Enter a valid date.` dưới ô, không xem trước; 20 lộ trình → Alert, dữ liệu gõ giữ, 0 mục ghi |
| M20-AC3 | PASS | E2E test 1 (vi, Q1 dựng bằng UI): bảng 5 hàng theo ngày, Diagnostic `24/09/2026`, CP1 `W8`, CP2 `≥ 20`; CP2 `18` → `Dưới ngưỡng−2`, reload → còn; `21` → `Đạt+1`; Mock 1 `7,5` → export ghi `7.5`; Mock 2 `33` → alert `ROADMAP_VI.errors.ROADMAP_SCORE_INVALID_range` + `aria-invalid`; xoá ô → `Chưa có điểm`. Biểu đồ: `data-scale raw`, 5 cột, cột Diagnostic `data-height` ≈ 5/32, vạch ngưỡng `[0,0,1,1,1]`, `aria-label` = `5 điểm kiểm tra, theo thứ tự ngày. Diagnostic: 5 trên 32, không có ngưỡng; Checkpoint 1: chưa có điểm; Checkpoint 2: 21 trên 32, ngưỡng 20, đạt; Mock 1: 7,5 trên 32, ngưỡng 24, dưới ngưỡng; Mock 2: chưa có điểm`. Test 3 (editor, vi): thêm `Mock 3` 12/03/2027 / 32 / 28 → thứ tự `[Diagnostic, Checkpoint 1, Checkpoint 2, Mock 1, Mock 2, Mock 3]`, dòng `12/03/2027 · tối đa 32 · ngưỡng 28`; CP2 (điểm 18) max → 10 → `range` dưới ô Điểm (+ dưới Ngưỡng vì 20 > 10), không lưu (`tối đa 32` sau Cancel); xoá Mock 3 qua D11 (focus Hủy) → toast `Đã xóa điểm kiểm tra`, focus "Thêm điểm kiểm tra"; thêm `IELTS mock` max 100 điểm 75 → `data-scale percent` + `cp.scalePercent`, cột 6 cao 0,75, cột tuần `W21`. Component: `RoadmapDetail.checkpoints.test.tsx` (thêm `7,25` → `precision`, Enter lưu, `cp.saved` trong `detail-status`, khối ẩn khi 0 checkpoint), `RoadmapEditor.checkpoints.test.tsx` (max rỗng → `max` + focus, `17,5` lưu 17.5, 50 → `ROADMAP_LIMIT_REACHED_checkpoint`) |
| M20-AC4 | PASS | E2E test 1: import `q1-goal-only-backup.json` → mẫu (27/10/2026, gq) → W1 bắt đầu 2026-10-27, kết thúc 2026-11-01 → Diagnostic sửa ngày 2026-09-24 (editor) + điểm 5 (bảng) → `expectQ1Vi`: `1/21`, `5,8 giờ`, `Kế hoạch đến hết tuần này: 16 giờ`, `Đúng tiến độ`, `125`, W1 `Sớm 1 ngày · học 6 ngày` `4,5 giờ`, tuần này `75/480 phút` `Còn 5 ngày`, Diagnostic `5`, `24/09/2026`, `Đã ghi`. Export → `schemaVersion 2`, 1 roadmap (`goalId gq`), 21 mục, checkpoint `[Diagnostic 2026-09-24 5, CP2 21, Mock 1 7.5, Mock 2 null]` → Import lại chính file (D3 `Mục tiêu lớn: 1 trong bản sao lưu, hiện có 1 trên thiết bị này.`) → cùng số (+ CP2 `21`, Mock 1 `7,5`). Bỏ tick W1 → `0/21` + `Đang học`; nhập kết thúc 2026-11-01 → lại đúng mọi số Q1 |
| M20-AC5 | PASS | `npm run test:e2e -- --project=cloud e2e/cloud/m20-template-sync.spec.ts` → 1 passed: A đăng nhập → mẫu (27/10/2026, gq, en) + CP2 18 → Sync now → mock u1 `[1, 5, 21, 5]`, roadmap `goal_id gq`, `milestone_date 2027-03-09`, CP2 `threshold 20`, `score 18`; B đăng nhập + Sync now → `QPT 21 weeks`, 21 mục, 5 phase, 5 checkpoint, `5.8 h`, CP2 `18` below; B sửa CP2 = 21 (đồng hồ B +60 s) → Sync now → mock 21 → A Sync now → `21` `+1`; mock vẫn 32 hàng; `rec.external()` rỗng, mọi URL ∈ {`localhost:4174`, `127.0.0.1:54321`}; 0 lỗi trang |
| M20-AC6 | PASS (phạm vi dev; NV-24 chờ U33) | `npm run check` exit 0 (§10). Ngân sách 227.160 / 227.564 B ≤ 230.000; so M17 −2.294 / −2.094 B (§8). Coverage `npx vitest run --coverage src/domain`: **All files 98,19 % stmt / 93,86 % branch / 99 % func / 99,18 % line**; `roadmap-template.ts`, `roadmap-progress.ts` 100 % (reporter chỉ liệt kê file chưa đủ: `roadmap.ts` 96,59 / 91,26 / 100 / 98,13). Bench NFR-26: `median 2.3 ms (min 2.1 ms)` < 50 ms. E2E test 4 (360×740 vi): D7 bottom sheet rộng 360, đáy = 740, nút Tạo trong viewport; dialog, bảng checkpoint (có lỗi inline), chart, editor có form checkpoint mở, banner `/new`: `scrollWidth ≤ clientWidth`, quét vi = 0, axe 0 serious/critical (dialog mở, chi tiết có checkpoint, editor); mọi ô điểm có tên `Điểm của {title} (trên 32)`; 1440: chi tiết + dialog (rộng 480) axe sạch; không request chunk `Review`/`BarChart`/`CurveChart`/`useRechartsWidth`. README mục "Big goals / Mục tiêu lớn" (mẫu, cách tính giờ + chồng khoảng, hoàn thành ⇔ ngày kết thúc, backup v2 + file cũ, U31). §11 có U32, U33, NV-23, NV-24 |

## 7. Deviations so với plan/design

1. **Định dạng điểm ở module lazy `ui/components/roadmap/score.ts`** (`formatScore`, `scoreInputValue`, `parseScore`, `signedScore`, `formatPercent`) thay vì thêm `f.score` vào `Formatters` (`i18n/format.ts` nằm trong chunk `core` trên đường tải lạnh). Kết quả giống DESIGN 7.9.0 (`5`, `7,5`, `32`; nhóm hàng nghìn khi hiển thị, không nhóm trong ô nhập để đọc lại được).
2. **Delta có 1 chữ số thập phân** (`signedScore`: `−2`, `+1`, `+0`, `−16,5`, U+2212) thay vì `signed0` (làm tròn số nguyên) — điểm có thể có `.5` (A-91), `signed0` sẽ hiện `−17` cho 7,5 vs 24.
3. **`buildQptTemplate(startDate, locale, ids, now)`**: `ids` là hàm `(kind, n) => string` (service truyền UUID mới, test/builder truyền `rq`/`pq{n}`/`wq{n}`/`cq{n}`); `now` là `ISODateTime` dùng cho mọi `createdAt/updatedAt`; builder trả `goalId null`, service gán goal sau khi kiểm A-78. `TemplateLocale = 'en' | 'vi'` khai báo trong domain (ESLint cấm domain import `i18n/`).
4. **`createFromQptTemplate` kiểm ngày bắt đầu** → `ROADMAP_DATE_INVALID` variant `format`, `field: 'startDate'` (DESIGN D7 liệt kê lỗi này). Tham số `today` giữ theo chữ ký ARCH nhưng chưa dùng (không có giới hạn ngày bắt đầu).
5. **D7 là `<dialog>` riêng** (mẫu `StopTimerDialog`: mount khi mở, `showModal`, Esc = Cancel trừ lúc bận), không phải `ConfirmDialog` (không có field). Khối xem trước là `hint` của ô ngày (nối `aria-describedby`) tạo kiểu nền `--surface-2`; ẩn khi ngày rỗng/sai. Khi bận: nút Tạo `aria-disabled` + "Đang tạo…", field `disabled`; focus vào field lỗi sau khi field bật lại.
6. **`useTemplateDialog(service, today)`** dùng chung cho S11 và S12; picker đọc `linkableGoals(null)` **một lần mỗi lần mở** (như M19 deviation 8); service kiểm lại khi tạo (test "goal bị chiếm trong lúc dialog mở"). Header danh sách (khi có hàng) có cả hai nút trong `.rm-actions` (xếp dọc rộng đầy < 640 px).
7. **Khối Checkpoints ẩn hoàn toàn khi lộ trình không có checkpoint** (DESIGN chỉ ghi biểu đồ ẩn; bảng rỗng không có ý nghĩa; editor vẫn có `ed.noCheckpoints` + nút thêm). Ghi chú checkpoint ở dòng riêng dưới `W8` (mockup ghép `W8 · ghi chú`), tránh dấu nối không có trong copy.
8. **Biểu đồ**: nhãn trục X là **tiêu đề đầy đủ** trong một hàng HTML `aria-hidden` thẳng cột với SVG (xuống dòng được) thay vì chữ viết tắt `CP1`/`Diag` của mockup (không có trong copy, không áp được cho tên do người dùng đặt); thêm 3 vạch trục Y (0 / ½ / tối đa; percent: `0%`/`50%`/`100%` qua `Intl`); nhãn trên cột luôn là điểm thô; > 6 checkpoint → cuộn ngang **bên trong** figure (`role="group"` + `tabIndex 0`, axe scrollable-region) thay vì cột < 45 px; nhãn điểm có viền nền để đọc được khi trùng vạch ngưỡng.
9. **`CheckpointEditor` mặc định**: ngày = hôm nay, tối đa rỗng (bắt buộc), ngưỡng/điểm rỗng. DESIGN không nêu mặc định.
10. **Ô số (điểm, tối đa, ngưỡng) nhận cả `,` và `.` làm dấu thập phân ở cả hai ngôn ngữ** (như chỉ tiêu giờ của M19 `parseHours`); không nhận phân cách hàng nghìn.
11. **Sửa kèm bug M19 (không có trong report QC)**: ở ≥ 1024 px, rule `.rm { display: grid }` của `roadmaps.css` (đứng sau `@import`) thắng override `display: block` của M19, nên link của hàng chỉ chiếm cột trái — bấm nửa phải hàng (thanh + số liệu) không mở chi tiết. Sửa bằng `.rm-list > .rm { display: block }`; E2E test 4 bấm ở 85 % chiều rộng hàng ở 1440 px.
12. **Quét vi (`src/test/i18n-scan.ts`, dùng chung bởi Vitest và `e2e/helpers/app.ts`)**: bỏ qua giá trị `en` đồng thời là một giá trị `vi` ở key khác. Lý do: `roadmap:tpl.languageName` `en` = `English` trùng tên ngôn ngữ hiển thị nguyên văn ở Settings khi app ở `vi` (`settings.language.option.en` = `English` cả hai bản) → quét báo nhầm trên mọi màn Settings ở vi. Test mới trong `i18n-scan.test.ts` khẳng định chữ Anh khác vẫn bị bắt.
13. **LWW khi hai thiết bị có cùng đồng hồ cố định**: `nextUpdatedAt` trả `now` khi `now ≥ previous` nên hai lần ghi trong cùng mili-giây có cùng `updatedAt` và server giữ hàng cũ (ADR-21, hành vi có sẵn, không đổi). Spec cloud M20 tiến đồng hồ A +30 s trước khi nhập điểm và B +60 s trước khi sửa — giống thực tế (hai lần ghi cách nhau).

**Test cũ bị ảnh hưởng (dev đã sửa, không đổi hành vi cũ):**

| File | Thay đổi | Lý do |
| :- | :- | :- |
| `src/ui/screens/Roadmaps.test.tsx` | trạng thái rỗng: 1 link `Create empty roadmap` **và** 1 nút `Create from QPT 21-week template`; header không lặp cả hai | M20 (S11 rỗng có hai lối tạo) |
| `src/i18n/roadmap-parity.test.ts` | test "M20 rows are not shipped yet" → "covers every 7.9.2 row of M17, M19 and M20", đếm **282 en / 268 vi** (+2 key D3 dời từ 7.9.1); allowlist `cp.week` (= en) | thêm mọi hàng M20 |
| `src/test/builders.ts` | `QPT_VI` + dựng tay → `buildQptTemplate(…, 'vi', ids, stamp)`; `buildQptRoadmap`/`datasetQ1` giữ chữ ký | M20-T1; 3 fixture Q1 không đổi byte |
| `src/test/i18n-scan.ts` | quy tắc deviation 12 | `tpl.languageName` |
| `e2e/m10-bundle.spec.ts` | marker `Weekly rhythm`, `Nhịp học mỗi tuần`, `Thi QPT chính thức`, `Official QPT exam`, `Create from QPT 21-week template`, `Scores vs. thresholds`, `cp-table`, `cp-hatch` | nội dung mẫu/chuỗi/CSS M20 không được lọt vào tải lạnh |
| `e2e/m19-roadmap-ui.spec.ts` | thêm test "M19-D1" (không đổi test cũ) | regression M19-D1 |
| `e2e/m17-roadmap-data.spec.ts:128` | trạng thái rỗng sau import file không lộ trình: 0 nút → đúng 1 nút `Create from QPT 21-week template` | M20 (S11 rỗng có nút mẫu) |
| `tests/qc/m17-r1-explore.spec.ts:22` | **không chạm** — `getByRole('button')` = 0 ở trạng thái rỗng nay = 1 | QC re-target |
| `tests/qc/m19-r1-accept.spec.ts:343` | **không chạm** — `test.fail` nay báo "Expected to fail, but passed" | QC re-target (M19-D1 đã sửa) |

## 8. Known issues và giới hạn

**Ngân sách tải lạnh `#/today` cả phase 8 (gzip 9, `BUDGET-EXACT` của `tests/qc/*m17-r1-budget.spec.ts`, 5 response: html · rolldown-runtime · css · core · index).**

| Mốc | cloud tắt | cloud bật | Ghi chú |
| :- | -: | -: | :- |
| `main` 8b9a1d7 trước phase (TASKS v8.1) | ≈ 228.500 | ≈ 229.000 | 6 / 8 response |
| **Baseline M17** (mục tiêu phase tính từ đây) | **229.454** | **229.658** | html 573 · 428 · css 9.828 · core 18.104 · index 200.521 / html 587 · 428 · 9.843 · 18.105 · 200.695 |
| Sau M18 (QC r2) | 226.727 | 227.154 | sync engine lazy (−2,8 kB) |
| Sau M19 (QC r1, HEAD `2f6b376`) — baseline M20 | 227.162 | 227.571 | html 574 · 428 · css 9.860 · core 18.178 · index 198.122 / 588 · 428 · 9.874 · 18.179 · 198.502 |
| **Sau M20** | **227.160** | **227.564** | html 576 · 428 · css 9.860 · core 18.178 · index 198.118 / 587 · 428 · 9.874 · 18.179 · 198.496 |
| Δ M20 | −2 | −7 | nhiễu hash/tên chunk; M20 không thêm gì vào đường tải lạnh |
| Δ cả phase so baseline M17 | **−2.294** | **−2.094** | mục tiêu ≤ +800 B: đạt; headroom tới 230.000: 2.840 / 2.436 B |

Thành phần M20: mẫu QPT (`roadmap-template.ts`) nằm trong chunk service lazy (chỉ `roadmap-service.ts` import); `CheckpointTable/Chart/Editor`, `TemplateDialog`, `score.ts` và CSS trong chunk `Roadmaps-*` (nhóm `advancedChunks` có sẵn); 56 chuỗi M20 trong `roadmap.{en,vi}-*.js`. Không thêm key resource chính, không sửa `format.ts`.

**Khác:**
- Ô ngày (`<input type="date">`) hiển thị theo locale **trình duyệt/OS** (Chromium `en-US` của Playwright hiện `11/04/2026`), như mọi form ngày có sẵn của app; giá trị lưu ISO; xem trước và bảng theo locale app.
- Nhãn trục X của biểu đồ ngắt giữa từ ở 360 px khi tên dài (`Diagnosti/c`) — `overflow-wrap: anywhere` để không bao giờ tràn; tên đầy đủ có trong bảng và tóm tắt SR.
- Picker goal của D7 đọc một lần khi mở (deviation 6).
- 20 spec e2e đỏ sẵn trên `main` (QC report M17 §6) không sửa theo quyết định user; M20 không chạm các file đó.
- Không có biến môi trường mới; `.env.example` không đổi.

## 9. Dispute (nếu có)

Không.

## 10. Kết quả lần chạy cuối

- `npm run check` **exit 0**: lint 0, typecheck 0, Vitest **208 file / 2.766 test pass** (kể cả `tests/qc/**`, 1.000 test QC), `build:e2e` ok.
- `WRITE_FIXTURES=1 npx vitest run src/test/fixtures-q1.test.ts` → 6/6, `git status e2e/fixtures` sạch (3 fixture Q1 không đổi byte).
- Bench NFR-26: `median 2.3 ms (min 2.1 ms)`. Coverage `src/domain`: 98,19 / 93,86 / 99 / 99,18 % (§6).
- Ngân sách: `BUDGET-EXACT chromium TOTAL 227160 responses 5`, `BUDGET-EXACT cloud TOTAL 227564 responses 5` (7/7 pass).
- `e2e/m20-qpt-template.spec.ts` 4/4, `e2e/cloud/m20-template-sync.spec.ts` 1/1, `e2e/m19-roadmap-ui.spec.ts` 9/9 (gồm M19-D1).
- `npm run test:e2e` (3 project, 10,0 phút): **830 pass / 25 fail**. Phân loại:
  - (a) **do M20 (dev spec cần cập nhật): 1** — `e2e/m17-roadmap-data.spec.ts:113` khẳng định trạng thái rỗng 0 nút; M20 thêm nút mẫu (DESIGN S11) → đã sửa assertion thành đúng một nút `Create from QPT 21-week template`; chạy lại pass.
  - (b) **`tests/qc/**` cần QC re-target: 2** — `tests/qc/m19-r1-accept.spec.ts:343` (`test.fail` M19-D1: nay "Expected to fail, but passed" → lật thành test thường); `tests/qc/m17-r1-explore.spec.ts:22` ("empty state … no create button": `getByRole('button')` = 0 — từ M20 trạng thái rỗng có nút `Create from QPT 21-week template` theo DESIGN S11/M20-AC2; link `Create empty roadmap` của M19 không phải button nên trước đây vẫn xanh).
  - (c) **20 spec đỏ sẵn trên `main`** (QC report M17 §6, cùng danh sách dev-M19 §10 b, không sửa theo quyết định user): `e2e/cloud/m7-sync.spec.ts:25, :165`, `m7-merge.spec.ts:79, :106, :137`, `m7-i18n.spec.ts:48`, `m15-d6-layout.spec.ts:36` ×2, `m14-delete-account.spec.ts:226`, `m8-prompts.spec.ts:242`; QC `cloud/final2-journey.spec.ts:109` ×4, `cloud/m14-r1-explore.spec.ts:282`, `cloud/m6-r1-flow.spec.ts:159`, `cloud/m6-r1-ui.spec.ts:74` ×2, `cloud/m7-r1-ui.spec.ts:233`, `native/m13-r1-native-shell.spec.ts:105`.
  - (d) **flaky đã biết, xanh khi chạy lại riêng**: `tests/qc/m11-r1-explore.spec.ts:88`, `tests/qc/m5-r2.spec.ts:26` (CPU x6) — `npm run test:e2e -- --project=chromium --project=native-web e2e/m17-roadmap-data.spec.ts tests/qc/m11-r1-explore.spec.ts:88 tests/qc/m5-r2.spec.ts:26 e2e/m19-roadmap-ui.spec.ts` → **18/18 pass**.

## 11. Việc user làm thủ công (U32, U33) và NOT VERIFIED

**NOT VERIFIED (cần thiết bị/dữ liệu thật):**

| ID | Nội dung | Kiểm tay |
| :- | :- | :- |
| NV-22 | Migration `20261104000000_roadmaps.sql` trên Postgres thật | U31 (đã làm trước khi push M18 theo STATUS; không đổi ở M20) |
| NV-23 | Hai thiết bị thật (máy tính + điện thoại `vi`): tạo/tick/xoá lộ trình đồng bộ qua project thật; 5 mục nav vừa 360 px thật; app iOS (nếu có bản mới) mở được Mục tiêu lớn | **U32** |
| NV-24 | Dữ liệu thật của user: lộ trình QPT từ mẫu (27/10/2026) + W1 + Diagnostic + goal `7ea38fbe-ae99-4806-8325-ee4042f36835` cho số liệu khớp tracker cũ | **U33** |

**U32 — sau khi M20 lên GitHub Pages (hai thiết bị cùng tài khoản; điện thoại để Tiếng Việt):**

1. Điện thoại: thanh dưới có 5 mục (Hôm nay, Mục tiêu, **Mục tiêu lớn**, Tổng kết, Cài đặt) vừa màn, không cuộn ngang.
2. Máy tính: Mục tiêu lớn → "Create from QPT 21-week template" (hoặc "Create empty roadmap") → tạo một lộ trình **thử** → Settings › Sync now. Điện thoại: Cài đặt › Đồng bộ ngay → Mục tiêu lớn thấy đủ lộ trình (21 mục, 5 điểm kiểm tra).
3. Điện thoại tắt mạng (chế độ máy bay) → mở lộ trình thử → tick một mục, nhập một điểm kiểm tra → bật mạng (app tự đồng bộ, hoặc Đồng bộ ngay). Máy tính: Sync now → thấy tick và điểm.
4. Xoá lộ trình thử ở một máy (Sửa lộ trình › Xóa lộ trình) → máy kia Sync now → lộ trình biến mất.
5. Nếu có bản iOS mới qua TestFlight: mở **Mục tiêu lớn** một lần (danh sách hiện, không lỗi).
→ Đủ 5 bước = **NV-23 PASS**; báo orchestrator (ảnh chụp điện thoại bước 1 và 2).

**U33 — sau M20 lên Pages, với dữ liệu thật (bỏ tracker HTML):**

1. Mở app (đã đăng nhập, dữ liệu thật) → **Mục tiêu lớn** → "Tạo từ mẫu QPT 21 tuần".
2. Ngày bắt đầu **27/10/2026**; xem trước phải ghi "Tuần 20 (thi QPT): 09/03/2027 … Tuần cuối kết thúc ngày 22/03/2027". Mục tiêu liên kết: goal đang đếm giờ học (`7ea38fbe-ae99-4806-8325-ee4042f36835`) → **Tạo lộ trình**.
3. Ở mục **W1** → "Ngày & ghi chú": Bắt đầu thực tế **27/10/2026**, Kết thúc thực tế **01/11/2026** → W1 hiện "Sớm 1 ngày · học 6 ngày".
4. Bảng **Điểm kiểm tra** → Sửa lộ trình › Diagnostic › Sửa: Ngày **24/09/2026** → Lưu; quay lại chi tiết, ô điểm Diagnostic nhập **5** (rời ô) → "5 / 32 · Đã ghi"; biểu đồ có cột 5.
5. Đối chiếu với tracker cũ: số tuần xong (1/21 nếu chỉ W1 xong; tick thêm các tuần đã xong thật), trạng thái nhịp độ, "Thi QPT: còn N ngày" (09/03/2027), giờ đã học (nay lấy từ goal — có thể khác giờ nhập tay ở tracker; quy tắc tính ở README "How study time is counted"), các điểm đã ghi ở tracker (nhập vào bảng).
6. Khớp → có thể bỏ tracker HTML. Không khớp → chụp màn hình chi tiết + tracker, báo orchestrator.
→ **NV-24 PASS** khi bước 5 khớp.

## Fix log

### Round 1 — theo report-M20-r1.md

| Defect | Nguyên nhân gốc | Cách sửa | Regression test |
| :- | :- | :- | :- |
| M20-D1 [Major] | `createFromQptTemplate` chỉ kiểm `isValidISODate(startDate)`; `addDays` (date-fns `format`) trả năm 5 chữ số (`10000-01-06`) mà không báo lỗi, nên ngày bắt đầu ≥ 9999-08-08 ghi các mục/checkpoint với ngày mà Import (zod) từ chối; xem trước gọi `addDays` rồi `f.dateShort` → `NaN-NaN-NaN` | (1) `domain/dates.ts` `addDays` ném `RangeError` khi kết quả không còn dạng `YYYY-MM-DD` (như khi đầu vào sai). (2) `domain/roadmap.ts` `addDaysOrNull` + `LAST_ISO_DATE`. (3) `roadmap-template.ts` `qptTemplateFits(start)` (W21 kết thúc = start + 146 ≤ 9999-12-31; ngày cuối hợp lệ 9999-08-07). (4) Service: `!isValidISODate || !qptTemplateFits` → `ROADMAP_DATE_INVALID` variant `format`, field `startDate` (lỗi "ngày sai" của D7, cùng chuỗi `Enter a valid date.`), 0 hàng; thêm lớp phòng thủ: mọi hàng mẫu qua `validateRoadmapInput/PhaseInput/ItemInput/CheckpointInput` + `checkRoadmapSpan` trước `putMany`. (5) `TemplateDialog`: xem trước chỉ khi vừa (không bao giờ NaN); ngày hợp lệ nhưng tràn → lỗi namespace ngay dưới ô (`aria-invalid`); Create chỉ hiện lỗi + focus ô ngày, không gọi service. (6) Gợi ý A-83 (`RoadmapEditor` khi render, `RoadmapService.suggestedItemDates`): dùng `addDaysOrNull` và chặn ở 9999-12-31 (trước đây sẽ ném khi render sau thay đổi (1)). Các chỗ gọi `addDays` khác (`DateNav`, `Today`, `reminder-plan`, `ics`) đi từ hôm nay/ngày ≤ hôm nay, không chạm biên | `dates.test.ts` (9999-12-31 + 1 ném), `roadmap.test.ts` (`addDaysOrNull`), `roadmap-template.test.ts` (`qptTemplateFits` biên 9999-08-07/08, build 9999-12-31 ném), `roadmap-service.test.ts` (9999-12-31 và 9999-08-08 → lỗi, 0 hàng; 9999-08-07 → mọi ngày ISO, gợi ý sau 9999-12-31 = 9999-12-31), `TemplateDialog.test.tsx` (không NaN, lỗi ngay, Create không ghi, 9999-08-07 có xem trước), `RoadmapEditor.test.tsx` (mục cuối kết thúc 9999-12-31 → Add item mở với 9999-12-31, không crash) |
| M20-D2 [Minor] | `expect(picker).toHaveFocus()` ngay sau `findByText` — focus được chuyển trong effect sau khi field hết `disabled` | `waitFor` quanh mọi assert focus của `TemplateDialog.test.tsx` (ô ngày lúc mở, picker sau lỗi goal, ô ngày sau lỗi ngày, ca M20-D1) | `npx vitest run src/ui/components/roadmap/TemplateDialog.test.tsx` lặp **20/20 xanh** |
| QC §9 (quét vi) | rule M20 "mọi giá trị vi" che rộng | `src/test/i18n-scan.ts`: chỉ che key `roadmap.tpl.languageName` (allowlist tường minh) | `i18n-scan.test.ts`: một giá trị en trùng giá trị vi ở key khác vẫn bị bắt; `tests/qc/m20-r1-scan-mask.test.ts` xanh |

**Kết quả Round 1:**
- `npm run check`: lint 0, typecheck 0; Vitest **210 file pass, 1 fail = `tests/qc/m20-r1-template.test.ts` "M20-D1 …" (`it.fails`) báo "Expect test to fail"** (defect đã sửa → QC lật thành `it`); `npm run build:e2e` chạy riêng ok.
- `tests/qc/m20-r1-accept.spec.ts:400` "M20-D1 …" (`test.fail`): xem trước không còn NaN (assert đầu pass), nhưng test chờ `waitForURL` sau Create — nay Create bị từ chối đúng thiết kế nên test **timeout** (trạng thái `timedOut`, Playwright tính là fail thật, không phải "expected to fail but passed"). **QC cần viết lại** test này theo hành vi mới (lỗi `Enter a valid date.` trong dialog, 0 lộ trình), không chỉ lật.
- E2E (chromium + cloud): `e2e/m20-qpt-template`, `e2e/cloud/m20-template-sync`, `tests/qc/m20-r1-accept` (trừ :400 ở trên), `tests/qc/cloud/m20-r1-sync`, `e2e/m19-roadmap-ui`, `e2e/m17-roadmap-data`, budget specs → **35 pass / 1 fail (:400)**.
- Ngân sách: `BUDGET-EXACT chromium TOTAL 227180`, `cloud TOTAL 227586` (+20 / +22 B so QC r1: guard trong `addDays` của `dates.ts` nằm trên đường tải lạnh); so baseline M17 −2.274 / −2.072 B.
