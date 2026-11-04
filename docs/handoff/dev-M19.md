# Dev handoff — M19 Chi tiết lộ trình, thao tác nhanh, editor, liên kết goal

Ngày: 2026-11-04. Build theo `docs/plan/TASKS.md` ("Phase 8 — Quy ước bổ sung", M19-T1 … T5, M19-AC1 … AC8, Demo M19), `ARCHITECTURE.md` §4.8 (a … j, v8.2), §5.1 v8.0, §5.4 v8.0, `PRD.md` (FR-68, FR-70, FR-72, FR-73, FR-74, FR-80; NFR-08, 11, 25, 26; A-78, A-81, A-83, A-85), `DESIGN.md` v8.0 (S11 … S14, D8 … D10, "Phase 8 — chỉnh màn cũ", §3.7, §7.9.0 … 7.9.2, §8.4, A-D81 … A-D96; mockup 12, 13), `docs/handoff/dev-M17.md`, `dev-M18.md`. Quyết định bổ sung của orchestrator (2026-11-04): giữ chip "N changes waiting" khi cloud thiếu bảng; `--surface-glass` .97 giữ; 20 spec đỏ sẵn trên `main` không sửa; 2 key FR-80 có thể đặt ở resource chính hoặc namespace tuỳ số đo.
Commit gốc trước M19: `c17500c`. Commit M19 (local, chưa push): xem `git log c17500c..HEAD`.

## 1. Tóm tắt

- **Chi tiết `#/roadmaps/:id`** (lazy): tổng quan 4 chỉ số (mọi biến thể pace + câu phụ, giờ `—`/archived/kế hoạch, mốc `N days left` / `Today` / `Passed`, ẩn ô khi không mốc), `WeekStrip` (`ul[role=list] > li > button`, roving tabindex + mũi tên/Home/End, tên truy cập `strip.cell`, bấm → cuộn + focus hàng mục), thẻ "This week" (4 kind kể cả `gap` v8.2; thanh giờ `progressbar`; nút Mark done / Mark as not done), phase (`Done x/y`, ghi chú) + `RoadmapItemRow` (checkbox 44 px tên `item.checkAria`, tag This week / Overdue / Early·studied / On time / Late / In progress, `Planned {itemRange} · giờ`, ghi chú `pre-wrap`, vùng `Dates & note` với 2 DateField + Today + Clear + textarea), ghi chú lộ trình dạng text, `<details>` cách tính giờ, không tìm thấy, linkState none/missing (+ link "Link a goal" → editor với picker được focus) / archived.
- **Thao tác nhanh**: tick/bỏ (A-81), ngày thực tế (lưu ngay khi đủ ngày; ô rỗng lưu khi blur; Today; Clear), ghi chú (debounce 600 ms + blur). Mọi ghi qua `RoadmapService`, màn vẽ lại từ liveQuery (không optimistic); lỗi `DATE_IN_FUTURE` / `ROADMAP_DATE_INVALID_order` inline ngay dưới ô (`roadmap:errors.*` trước, `aria-invalid`, `aria-describedby`), ô giữ giá trị bị từ chối; vùng `role=status` ẩn đọc `item.statusDone/Undone`; focus không đổi khi render lại (draft ngày/ghi chú suy ra trong render, không trong effect). Đo E2E: tick → `2/21` sau **23–52 ms**; tổng quan hiện **~210 ms** sau khi bấm hàng danh sách (gồm nạp chunk lazy).
- **Editor + tạo trống**: `#/roadmaps/new` (form field lộ trình, `Create roadmap` → editor + toast), `#/roadmaps/:id/edit` (`RoadmapFields` + `Save details`; phase thêm/sửa/xoá/↑↓; mục thêm (đề xuất A-83 trong form + hint) /sửa (gồm select Phase → `moveItem(..., null)` = cuối phase đích)/xoá/↑↓; mỗi thao tác lưu ngay (A-D85); một form con mở tại một thời điểm, form đang gõ dở không bị đóng; focus trở về nút mở/nút `Add …`; `MoveButtons` giữ focus trên đúng nút vừa bấm sau khi hàng đổi chỗ (`pendingFocus` theo id) + `ed.movedStatus`; `ConfirmDialog` D8 (`count.*`), D9 (số mục / rỗng), D10; `ROADMAP_LIMIT_REACHED_*` Alert trên nút Add (kiểm số lượng trước khi mở form; service vẫn kiểm lại); `GoalLinkPicker` theo A-78 từ `RoadmapService.linkableGoals(roadmapId)` (mới), lỗi `ROADMAP_GOAL_ALREADY_LINKED` (nêu tên lộ trình kia) / `GOAL_NOT_FOUND` (chữ namespace) dưới picker + focus.
- **Danh sách + liên kết ngược**: hàng S11 là `<a>` bao cả hàng; nút `Create empty roadmap` ở header (khi có hàng) và trong trạng thái rỗng; Goal detail dòng `Part of roadmap` + link (`findByGoal`, `createdAt` sớm nhất, A-D92); D2 ở Goals và Goal detail thêm đoạn `goal.delete.roadmapNote` chỉ khi goal thuộc lộ trình (DOM cũ giữ nguyên khi không).
- **i18n**: namespace `roadmap` nay có **233 key** (toàn bộ hàng M17 + M19 + `errors.*` của DESIGN 7.9.2, sinh từ bảng DESIGN nên nguyên văn; hàng M20 chưa đưa vào — test parity khẳng định điều đó); 2 key FR-80 vào **resource chính** (7.9.1, phương án A); `f.dayMonth`, `f.itemRange` mới trong `Formatters`.
- **Ngân sách tải lạnh `#/today`**: baseline HEAD `c17500c` **226.727 B** (cloud tắt) / **227.154 B** (cloud bật) → sau M19 **227.162 B / 227.571 B** (5 response, +435 / +417 B; so M17 baseline 229.454/229.658: **−2.292 / −2.087 B**). Chi tiết §8.

## 2. Task

| ID | Trạng thái | Ghi chú |
| :- | :- | :- |
| M19-T1 | DONE | `src/ui/screens/RoadmapDetail.tsx`, `components/roadmap/{OverviewMetrics,WeekStrip,ThisWeekCard,RoadmapItemRow,RoadmapNotFound}.tsx`, `useRoadmapService.ts` (`useRoadmapDetail` gắn id vào emission), `useRoadmapErrors.ts`, `styles/roadmap-screens.css`, `router.tsx` (3 route lazy), `format.ts` (`dayMonth`, `itemRange`), `roadmap.{en,vi}.json`; test `RoadmapDetail.test.tsx` (10), `format.test.ts` |
| M19-T2 | DONE | `RoadmapItemRow.tsx` (DateControl, note debounce), `RoadmapDetail.tsx` (`run()` → lỗi inline theo mục, live region); test AC3 trong `RoadmapDetail.test.tsx` (vi) |
| M19-T3 | DONE | `screens/RoadmapNew.tsx`, `RoadmapEditor.tsx`, `components/roadmap/{RoadmapFields,GoalLinkPicker,MoveButtons,PhaseEditor,ItemEditor}.tsx`, `services/roadmap-service.ts` (`linkableGoals`, `findByGoal`), `hooks/useToast.ts` + `Toast.tsx` (kiểu `ToastKey` nhận `roadmap:toast.*`); test `RoadmapEditor.test.tsx` (10), `roadmap-service.test.ts` (+2) |
| M19-T4 | DONE | `screens/Roadmaps.tsx` (link + nút tạo), `GoalDetail.tsx`, `Goals.tsx`, `ui/goal-roadmap-link.ts`, `en.json`/`vi.json` (2 key), `app.css` (`.gd-roadmap`); test `Roadmaps.test.tsx` (sửa), `GoalDetail.roadmap.test.tsx` (3) |
| M19-T5 | DONE | `e2e/m19-roadmap-ui.spec.ts` (8 test, chromium, en + vi, 1280 + 360×740 + 1440×900), `e2e/m10-bundle.spec.ts` (marker mới), `vite.config.ts` (nhóm chunk `Roadmaps`), README, handoff này |

## 3. File chính đã thêm/sửa

- **UI mới:** `src/ui/screens/RoadmapDetail.tsx`, `RoadmapEditor.tsx`, `RoadmapNew.tsx`; `src/ui/components/roadmap/OverviewMetrics.tsx`, `WeekStrip.tsx`, `ThisWeekCard.tsx`, `RoadmapItemRow.tsx`, `RoadmapNotFound.tsx`, `RoadmapFields.tsx`, `GoalLinkPicker.tsx`, `MoveButtons.tsx`, `PhaseEditor.tsx`, `ItemEditor.tsx`, `useRoadmapService.ts`, `useRoadmapErrors.ts`; `src/ui/goal-roadmap-link.ts`; `src/ui/styles/roadmap-screens.css` (được `@import` từ `roadmaps.css`).
- **UI sửa:** `src/ui/screens/Roadmaps.tsx`, `GoalDetail.tsx`, `Goals.tsx`; `src/ui/components/Toast.tsx`, `src/ui/hooks/useToast.ts`; `src/ui/styles/app.css` (`.gd-roadmap`), `roadmaps.css`.
- **App/service/i18n:** `src/app/router.tsx`; `src/services/roadmap-service.ts`; `src/i18n/format.ts`; `src/i18n/resources/roadmap.en.json`, `roadmap.vi.json`, `en.json`, `vi.json`; `vite.config.ts`.
- **Test:** `src/ui/screens/RoadmapDetail.test.tsx`, `RoadmapEditor.test.tsx`, `GoalDetail.roadmap.test.tsx`, `Roadmaps.test.tsx`; `src/services/roadmap-service.test.ts`; `src/i18n/format.test.ts`, `roadmap-parity.test.ts`; `e2e/m19-roadmap-ui.spec.ts`, `e2e/m10-bundle.spec.ts`.
- **Docs:** `README.md` (mục "Big goals"), `docs/handoff/dev-M19.md`.

## 4. Cách chạy

```bash
npm ci                     # Node 22
cp .env.example .env.local # không có biến mới ở M19
npm run dev                # http://localhost:5173 → #/roadmaps → "Create empty roadmap", hoặc Settings › Import e2e/fixtures/q1-roadmap-backup.json → bấm hàng "QPT 21 tuần"
```

## 5. Cách test

```bash
npm run check                                   # lint + typecheck + vitest + build:e2e
npx vitest run src/ui/screens/RoadmapDetail.test.tsx src/ui/screens/RoadmapEditor.test.tsx src/ui/screens/GoalDetail.roadmap.test.tsx src/ui/screens/Roadmaps.test.tsx src/services/roadmap-service.test.ts src/i18n
npm run test:e2e -- --project=chromium e2e/m19-roadmap-ui.spec.ts e2e/m17-roadmap-data.spec.ts
npm run test:e2e -- --project=chromium --project=cloud e2e/m10-bundle.spec.ts tests/qc/m17-r1-budget.spec.ts e2e/cloud/m10-bundle.spec.ts tests/qc/cloud/m17-r1-budget.spec.ts   # ngân sách, in BUDGET-EXACT
npm run test:e2e                                # cả 3 project (~9 phút)
```

Kết quả lần chạy cuối: §10.

## 6. Tự kiểm AC

| AC | Kết quả | Bằng chứng (lệnh + output rút gọn) |
| :- | :- | :- |
| M19-AC1 | PASS | E2E `m19-roadmap-ui.spec.ts` test 1 (en, Q1): `done-value` `1/21`, chip `On track`, `5.8 h`, `Planned through this week: 16 h`, `125 days left`, `On 2027-03-09`; `ul[aria-label="Roadmap items, in order"]` 21 `listitem`; ô 1 `data-state=done`, ô 2 `data-current`, 0 ô overdue; tên ô 2 `Solving systems: elimination, row echelon form, rank, 11/03 – 11/09: this week`; bấm ô 15 → `[data-item=wq15]` `toBeFocused` + `toBeInViewport`; thẻ `This week · W2 · 2026-11-03 – 11-09`, `75/480 min`, `5 days left`. Test 2: Q1b (Clear actual end W1) → `1 week behind` class `warn`, ô 1 overdue, `pace.subWarn`; clock 2026-11-10 → `2 weeks behind` class `crit`, 2 ô overdue; 2026-10-26 → `Not started`, `Starts 2026-10-27`, thẻ `data-kind=notStarted` "Starts 2026-10-27. First up: …", 134 ngày. Component: `RoadmapDetail.test.tsx` "ThisWeekCard kind gap" → `Nothing is planned for today.` không chữ số |
| M19-AC2 | PASS | E2E test 1: 5 `phase`, phase 1 `Done 1/4` + `Course 1 · 34h`; W1 `Early by 1 day · studied 6 days`, `4.5 h`; W2 tag `This week`, `1.3 h`; W3 `0 h`; ghi chú 7 dòng (`innerText.split('\n')`), vi test 7: `Sớm 1 ngày · học 6 ngày`. Component: note `<b>bold?</b>` hiện nguyên văn, không `<b>`; Q1e → `—` mọi mục + `The linked goal was deleted.` + link `/roadmaps/rq/edit?focus=goal`; archived → `5.8 h` + `The linked goal is archived. Its time still counts.` + tag `archived` |
| M19-AC3 | PASS | E2E test 3 (vi) `quickActions()` online rồi offline (`context.setOffline(true)` sau khi SW cache): tick W2 → `2/21` sau **23–52 ms** (`performance.now()` + MutationObserver trong trang), end `2026-11-04`, `Sớm 5 ngày` (không "học"), nút `Bỏ đánh dấu xong`; bỏ tick → `1/21`, end rỗng, không nhãn; W3 "Hôm nay" → `Đang học`, `0,5 giờ`, W2 `0,8 giờ`, tổng `5,8 giờ`; W3 end `2026-11-05` → alert `Ngày thực tế không được sau hôm nay.` (= `ROADMAP_VI.errors.DATE_IN_FUTURE`), `aria-invalid`, vẫn `1/21`; ghi chú → reload còn (online và offline). Component `RoadmapDetail.test.tsx` (vi) thêm: focus ở lại checkbox / textarea sau render lại, `detail-status` đọc `Đã đánh dấu xong: …`, DB `wq3.actualEnd` null sau lỗi, `order` dưới ô kết thúc |
| M19-AC4 | PASS | E2E test 4 (en): rỗng → `Create empty roadmap` → lỗi `Fix 2 fields to save.` + `Enter a title.` + `ROADMAP_TARGET_INVALID` (0.3) + focus Title → tạo "Spanish B1"/Spanish/5/Exam/2027-06-01 → `#/roadmaps/<id>/edit` + toast `Roadmap created` + h1 focus; Add phase Grammar; 3 mục với ô ngày đề xuất `2026-11-04/11-10`, `11-11/11-17`, `11-18/11-24` + hint A-83; hàng hiện `2026-11-04 – 11-10` (`f.itemRange`); `plannedEnd < plannedStart` → `The end date can't be before the start date.` + focus Planned end; Cancel → focus về `Edit Subjunctive`; `Move Subjunctive up` + Enter ×2 → thứ tự `[Subjunctive, Present, Past]`, focus ở lại nút, `ed.movedStatus` "…position 2 of 3", `aria-disabled` ở đầu; reload giữ; chuyển `Past tenses` sang phase Vocabulary qua select; xoá phase Grammar → dialog `This deletes the phase and its 2 items.` Cancel giữ 3 mục, Confirm còn 1 + toast; Done → `0/1`, 1 ô; xoá lộ trình → D8 `1 phase, 1 item and 0 checkpoints` → `#/roadmaps` rỗng + toast + focus h1. Component `RoadmapEditor.test.tsx`: Demo đầy đủ tới `0/3` + 3 ô + `Planned through this week: 5 h`, D9 với 4 và 2 mục, D8 `4 phases, 16 items and 5 checkpoints`, `ROADMAP_LIMIT_REACHED_item` ở mục 201 |
| M19-AC5 | PASS | E2E test 5: archive Guitar + tạo "Reading plan" liên kết Read → picker `rq` = `[No goal, Marathon prep, Old course, QPT study, Spanish]` (không Read, không Guitar), picker ở `/new` 5 option (không QPT study); đổi sang Spanish → `Goal: Spanish`, `0 h`, `0/480 min`; bỏ liên kết → `No goal linked`, `—`, `Link a goal to count study time.`; "Link a goal" → `?focus=goal`, picker focus. Component: `ROADMAP_GOAL_ALREADY_LINKED` → `This goal is already linked to "QPT 21 tuần". Choose another goal, or unlink it there first.` + `aria-invalid` + focus; goal xoá trước khi lưu → `That goal doesn't exist anymore. Choose another goal, or leave this empty.`, `goalId` vẫn null. Service: `linkableGoals` 3 trường hợp, `findByGoal` thứ tự `createdAt` |
| M19-AC6 | PASS | E2E test 6 (vi): `#/goals/gq` → `goal-roadmap` `Thuộc lộ trình QPT 21 tuần`, link → `#/roadmaps/rq`; Goals → Xóa gq → `confirm-note` = `Mục tiêu này thuộc lộ trình "QPT 21 tuần". Lộ trình vẫn được giữ, nhưng sẽ mất liên kết và hiện giờ học là —.` → xác nhận → `#/roadmaps/rq` `Chưa liên kết mục tiêu`, `—`; `#/goals/g1` không có dòng, D2 không có `confirm-note`. `e2e/m5-goal-detail.spec.ts`, `m11-open-ended.spec.ts`, `m1-goals.spec.ts` không sửa (xem §10) |
| M19-AC7 | PASS | `roadmap-parity.test.ts` (parity namespace, không key tiền tố, mọi key = DESIGN 7.9.2 nguyên văn, đủ hàng M17 + M19 + errors, không hàng M20, 2 key 7.9.1 ở resource chính nguyên văn); quét vi (component + E2E) trên chi tiết, editor, `/new`, Goal detail = 0; axe 0 serious/critical trên chi tiết Q1 (1280 + 360 + 1440), Q1b, editor có form mục mở (360), `/new` (360); E2E test 7 360×740 vi: `scrollWidth ≤ clientWidth` ở 3 màn, dải 7 cột × 3 hàng ô ≥ 44 px cao, nút `Hôm nay: đặt ngày bắt đầu thực tế của Systems of linear equations…` có tên, `listitem` 21 |
| M19-AC8 | PASS | `npm run check` exit 0; 3 project: 0 fail do M19 (20 đỏ sẵn + 3 flaky xanh khi chạy lại, §10); tải lạnh **227.162 B / 227.571 B** ≤ 230.000, so M17 baseline −2.292 / −2.087 B (mục tiêu ≤ +800 đạt); E2E test 1 tổng quan hiện **~210 ms** sau khi bấm (< 1 s); bench NFR-26 không đổi (M17: median 2,0 ms, domain không sửa). NV-23 (U32) kiểm tay thiết bị thật |

## 7. Deviations so với plan/design

1. **2 key FR-80 ở resource chính** (`goal.detail.roadmapLabel`, `goal.delete.roadmapNote` — phương án A của DESIGN 7.9.0) vì số đo còn dư: toàn bộ M19 tăng +435 B cloud tắt. Chuỗi FR-80 chiếm ≈ 200 B trong đó; phương án B (namespace) vẫn mở nếu M20 chạm ngưỡng.
2. **`f.dayMonth` / `f.itemRange` đặt trong `Formatters` (`format.ts`, chunk `core` trên đường tải lạnh, ≈ 120 B)** theo DESIGN 7.9.0 "mọi số qua `useFormat`" — khác hướng `hoursShort` của M17 (cũng trong `format.ts`), nhất quán với nó.
3. **Một chunk lazy `Roadmaps-*.js` cho cả 4 màn roadmap + component + CSS** (nhóm `advancedChunks` trong `vite.config.ts`) thay vì 4 chunk riêng: list → detail → editor không cần request JS thêm; tên chunk giữ `Roadmaps-` nên `tests/qc/m17-r1-explore.spec.ts:140` và `e2e/m17-roadmap-data.spec.ts` vẫn đúng. Bài học ghi trong comment: lazy screen **không được** import tĩnh lazy screen khác (Goals → GoalDetail trong lúc làm M19 đã kéo react-router + Button + hooks ra chunk `useSubscribable-*.js` 32 kB → 7 response, +1,5 kB; sửa bằng `src/ui/goal-roadmap-link.ts`).
4. **Ghi chú mục lưu bằng debounce 600 ms + blur** (TASKS M19-T2 "blur/debounce"; DESIGN nói "lưu khi rời ô"): reload ngay sau khi gõ (E2E) vẫn giữ chữ. Ngày thực tế: ô đủ ngày lưu ngay khi `change`; ô rỗng chỉ lưu khi `blur` (gõ từng phần trong Chrome đi qua `''`).
5. **Draft ngày / ghi chú suy ra trong render** (`useState` "synced" + setState trong render) thay vì `useEffect`: emission liveQuery nằm ngoài `act()` nên effect chạy sau commit → ô hiện giá trị cũ một nhịp (lỗi bắt được ở component test).
6. **`useRoadmapDetail` gắn id vào emission**: `useSubscribable` giữ `data` cũ khi deps đổi, nên đi thẳng `#/roadmaps/a/edit` → `#/roadmaps/b/edit` từng seed form bằng lộ trình `a` (regression test trong `RoadmapEditor.test.tsx`).
7. **"Link a goal" → `#/roadmaps/:id/edit?focus=goal`** (query trong hash) để editor focus picker thay h1 (DESIGN "focus vào picker" không nói cách truyền).
8. **Picker đọc `linkableGoals()` một lần khi mở editor/new và sau mỗi `Save details`** (không `useLiveQuery` như DESIGN S12 ghi): đủ cho A-78; service vẫn kiểm lại khi lưu (test `ROADMAP_GOAL_ALREADY_LINKED` giả lập goal bị chiếm sau khi picker nạp).
9. **Giới hạn số lượng kiểm trước ở UI** khi bấm `Add phase`/`Add item` (Alert ngay trên nút, không mở form) + service kiểm lại; lỗi không có `field` từ form con hiện Alert đầu form con.
10. **Goal detail / D2 đọc liên kết một lần** (`findByGoal` qua `loadRoadmapService` khi mở màn / mở dialog), không live; chunk service nạp lần đầu khi mở Goal detail (lazy, cached) — nếu nạp thất bại (offline chưa cache) thì không hiện dòng, D2 như cũ.
11. **D2 dùng prop `note` có sẵn của `ConfirmDialog`** (`<p class="hint" data-testid="confirm-note">` sau `extra`), đúng vị trí DESIGN (sau câu timer); kiểu chữ `.hint` thay `<p>` thường.
12. **Label/counter/hint trong form con `.re-sub` dùng `--text`** (không `--text-muted`): trên nền `--surface-2` axe báo `color-contrast` serious (< 4,5:1).
13. **`ToastApi.show` nhận `MessageKey | RoadmapMessageKey`** (chỉ đổi kiểu; `ToastRegion` `t(key)` với key `roadmap:…` qua i18next namespace prefix).
14. Hàng S11 trước M19 chưa là link (deviation 4 của M17) → đã sửa; `Roadmaps.test.tsx` cập nhật (link hàng, nút tạo ở rỗng).
15. `app.css` thêm `.gd-roadmap` (≈ 80 B gzip trên đường tải lạnh) cho dòng FR-80.

**Test cũ bị ảnh hưởng (dev đã sửa, không đổi hành vi):**

| File | Thay đổi | Lý do |
| :- | :- | :- |
| `src/ui/screens/Roadmaps.test.tsx` | rỗng: thay "không link" bằng 1 link `Create empty roadmap`; hàng là link `/roadmaps/rq`; header có `roadmap-create` khi có hàng, không lặp khi rỗng | M19-T4 |
| `src/i18n/roadmap-parity.test.ts` | allowlist `now.eyebrowIndexed` (= en); coverage M17 + M19 + errors, khẳng định hàng M20 chưa có; kiểm 2 key 7.9.1 | key mới |
| `e2e/m10-bundle.spec.ts` | thêm marker `Roadmap items, in order`, `rd-strip`, `Save details`, `How study time is counted` | chuỗi/CSS M19 không được lọt vào tải lạnh |
| `tests/qc/**` | **không chạm**. `tests/qc/m9-r1-copy.test.ts` nay pass kể cả khi bỏ lọc `roadmap` (2 key trong `en.json`/`vi.json` nguyên văn). `tests/qc/m17-r1-explore.spec.ts:140` vẫn thấy `Roadmaps-*.js` | — |

## 8. Known issues và giới hạn

**Ngân sách tải lạnh `#/today` (gzip 9, `tests/qc/*m17-r1-budget.spec.ts`).**

| Bản | Baseline `c17500c` (sau M18) | Sau M19 | Δ M19 | Δ so M17 baseline | Headroom tới 230.000 |
| :- | :- | :- | :- | :- | :- |
| cloud tắt | **226.727 B** (html 574 · rolldown-runtime 428 · css 9.828 · core 18.104 · index 197.793) | **227.162 B** (html 574 · css 9.860 · rolldown-runtime 428 · core 18.178 · index 198.122) | **+435 B** | −2.292 B | 2.838 B |
| cloud bật | **227.154 B** (html 586 · 428 · css 9.843 · core 18.105 · index 198.192) | **227.571 B** (html 588 · 428 · css 9.874 · core 18.179 · index 198.502) | **+417 B** | −2.087 B | 2.429 B |

Ước lượng theo thành phần (±30 %): `goal.detail.roadmapLabel` + `goal.delete.roadmapNote` en/vi ≈ 200 B; 3 khai báo route lazy trong `router.tsx` ≈ 100 B; `f.dayMonth`/`f.itemRange` (chunk `core`) ≈ 70 B; `.gd-roadmap` CSS ≈ 30 B; GoalDetail/Goals/Toast: 0 (lazy / chỉ kiểu). Không có code màn roadmap nào trên đường tải lạnh (marker test `e2e/m10-bundle.spec.ts`). Phương án giảm nếu M20 chạm ngưỡng: (1) chuyển 2 key FR-80 sang namespace (−200 B, DESIGN 7.9.0 B); (2) các phương án của dev-M18 §8 (tách backup roadmap lazy ≈ −400 B, gộp `rolldown-runtime`).

**Khác:**
- Dòng "Part of roadmap" và đoạn D2 đọc một lần khi mở màn/dialog (không live) — nếu lộ trình đổi liên kết trong lúc đang xem Goal detail thì cần mở lại.
- `WeekStrip` ↑/↓ nhảy theo số ô đo được trên hàng đầu (7 ở < 640 px, theo `auto-fill` ở rộng hơn).
- Checkpoint (bảng, biểu đồ, editor), nút "From QPT template" và D7: **M20** — chưa có trên màn (không màn "sắp có"); `notFound.*`, `errors.ROADMAP_*_checkpoint` đã có chuỗi vì nằm trong `errors.*`/M19.
- 20 spec e2e đỏ sẵn trên `main` (QC report M17 §6) **không sửa** theo quyết định user; M19 không chạm file đó. Phân loại §10.
- Không có biến môi trường mới; `.env.example` không đổi.

## 9. Dispute (nếu có)

Không.

## 10. Kết quả lần chạy cuối

- `npm run check` **exit 0**: lint 0 lỗi, typecheck 0 lỗi, Vitest **203 file / 2.739 test pass** (kể cả `tests/qc/**`; `tests/qc/m9-r1-copy.test.ts` xanh), `build:e2e` ok.
- Ngân sách (`--project=chromium --project=cloud e2e/m10-bundle.spec.ts tests/qc/m17-r1-budget.spec.ts e2e/cloud/m10-bundle.spec.ts tests/qc/cloud/m17-r1-budget.spec.ts`, 7/7 pass): `BUDGET-EXACT chromium TOTAL 227162 responses 5`, `BUDGET-EXACT cloud TOTAL 227571 responses 5`.
- `e2e/m19-roadmap-ui.spec.ts` riêng: **8/8 pass** (`[M19 tick] 2/21 after 23–52 ms`, `[M19 detail] overview visible 208–227 ms`).
- `npm run test:e2e` (3 project, 7,8 phút): **815 pass / 23 fail**. Phân loại:
  - (a) **do M19: 0.**
  - (b) **20 spec đỏ sẵn trên `main`** (QC report M17 §6, đúng danh sách dev-M17 §10 c, không sửa theo quyết định user): `e2e/cloud/m7-sync.spec.ts:25, :165`, `m7-merge.spec.ts:79, :106, :137`, `m7-i18n.spec.ts:48`, `m15-d6-layout.spec.ts:36` ×2, `m14-delete-account.spec.ts:226`, `m8-prompts.spec.ts:242`; QC `cloud/final2-journey.spec.ts:109` ×4, `cloud/m14-r1-explore.spec.ts:282`, `cloud/m6-r1-flow.spec.ts:159`, `cloud/m6-r1-ui.spec.ts:74` ×2, `cloud/m7-r1-ui.spec.ts:233`, `native/m13-r1-native-shell.spec.ts:105`.
  - (c) **nhạy thời gian khi chạy chung, xanh khi chạy lại riêng** (`npm run test:e2e -- --project=cloud --project=native-web --project=chromium e2e/cloud/m7-sync.spec.ts:77 tests/qc/native/m13-r1-native-shell.spec.ts:309 tests/qc/m5-r2.spec.ts:26` → 5/5 pass): `tests/qc/m5-r2.spec.ts:26` (CPU x6, toast "Goal deleted" quá 10 s — đã biết từ M17), `e2e/cloud/m7-sync.spec.ts:77` (`plusOneShown` của thiết bị B ghi `g2` do đồng hồ thật lệch khi tải nặng — không liên quan roadmap), `tests/qc/native/m13-r1-native-shell.spec.ts:309` (heading `#/goals/new` chưa hiện trong 10 s).
  - (d) `tests/qc/**` cần re-target: **0**.
  - Spec cũ M5/M11/M1 về Goal detail và dialog xoá goal (`e2e/m5-goal-detail.spec.ts`, `m11-open-ended.spec.ts`, `m1-goals.spec.ts`, `m2-timer.spec.ts`) pass không sửa; `e2e/m17-roadmap-data.spec.ts` pass không sửa.
- **Rủi ro nhỏ cần QC để ý**: mở D2 ở Goals/Goal detail nay đợi `loadRoadmapService()` (chunk lazy, lần đầu ≈ vài chục ms, có cache) trước khi hiện dialog — có thể làm `m5-r2:26` (CPU x6) chậm thêm một chút; không làm đổi DOM khi goal không liên kết.
