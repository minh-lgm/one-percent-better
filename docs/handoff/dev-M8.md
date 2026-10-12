# Dev handoff — M8 Nhắc đăng nhập không phiền, copy cuối, hành trình đầy đủ phase 2

Ngày: 2026-10-13. Build theo `docs/plan/TASKS.md` v2.1 (M8-T1…T3, M8-AC1…AC7, DoD 7–11, NV-1…NV-7, U0/U8/U10), `PRD.md` v2.1 (FR-52…FR-54, FR-41, NFR-16/17, A-30), `ARCHITECTURE.md` v2.1 (§5.3 `LoginPromptService`, kv `loginPrompt`, `kv.update`), `DESIGN.md` v2.0 (§2 F14, §4 S1 LoginPromptBanner / S7 ExportSignInHint + bảng copy theo trạng thái, §7.7.4/7.7.5, §8.1, §3.5, OQ-D12, A-D27), `docs/handoff/dev-M7.md`, `docs/qc/report-M7-r2.md` (§4 M7-D5, §9). Kèm backlog **M7-D5** và **M7-P1** (mục "Backlog fixed").

## 1. Tóm tắt

- **T1 Quy tắc + service.** `src/domain/login-prompt.ts` (hàm thuần theo A-30: `shouldShowLoginPrompt`, `shouldShowExportHint`, `hasEnoughData`, `isSnoozed`, `dismissed`, `firstCreatedAt`, `normalizeLoginPrompt`, hằng 7 ngày / 10 entry / 14 ngày / 3 lần / 30 ngày). `src/services/login-prompt-service.ts`: kv `loginPrompt` (`dismissCount`, `lastDismissedAt`, `lastExportHintAt`), `loadData()`/`watchData()` (`firstDataAt` = `createdAt` nhỏ nhất của goal/entry **còn sống** — repository đã lọc tombstone; `entryCount`), `getState()`/`watchState()`, `state(now, ctx)`, `dismiss(now)` và `claimExportHint(now, ctx)` nguyên tử qua `kv.update`; chỉ claim khi **online** (OQ-D12). Nối `container.ts` (`loginPromptService`, luôn có; cloud tắt → quy tắc trả `false` vì `auth = 'unavailable'`). Kv `loginPrompt` không nằm trong backup, không bị import/`clearUserData` xoá (đã có từ M6/M7, kiểm lại trong test).
- **T2 UI + copy.** `LoginPromptBanner` (`<section aria-label>`, tone `promo`, không dialog/live/focus; nút Google `returnTo = '#/today'`, "Not now" → `dismiss` + toast `loginPrompt.snoozedToast` + focus `<h1>`), ưu tiên hơn `BackupBanner` trên Today (cả nhánh có goal active lẫn nhánh "No active goals"). `ExportSignInHint` (`role="group"`, hiện dưới nút Export/Import khi `claimExportHint` thắng; offline → nút vô hiệu + `settings.account.offlineHint`; tự ẩn khi đã đăng nhập). Settings: Backup `desc` / `descSignedOut` / `descSignedIn`, About `desc` / `descCloud` / `descSignedIn` (có từ M6), Storage "Not protected" + cloud bật + chưa đăng nhập → thêm `settings.storage.notProtectedSignIn` + nút `settings.account.goTo` (cuộn tới card Account, focus nút Google, không đổi hash). Card Account chưa đăng nhập giữ nguyên A1 (lời giải thích + nút, không "Not now"). Chuỗi mới `loginPrompt.*`, `exportHint.*`, `settings.backup.descSignedOut`, `settings.storage.notProtectedSignIn` **nguyên văn DESIGN §7.7.4/7.7.5** en/vi (parity xanh). CSS `.banner.promo` (icon cùng hàng tiêu đề < 640 px, cột trái từ 640 px — DESIGN 3.5), `.export-hint`.
- **T3 E2E + tài liệu.** `e2e/cloud/m8-prompts.spec.ts` (AC2, AC3, AC4 phần e2e, M7-D5/M7-P1), `e2e/cloud/m8-journey.spec.ts` (AC5: en-US và vi-VN, A 1440 × B 360, hành trình đầy đủ), `e2e/m8-cloud-off.spec.ts` (project `chromium`: không bao giờ hiện, M3-AC10 giữ nguyên). README: mục "Account & sync" thêm phần nhắc đăng nhập + cảnh báo hàng bị từ chối; "Cloud setup (owner)" viết lại thành bảng U0–U11 khớp code (redirect `?auth=callback`, `pages.yml`, Publish OAuth, ghi chú tắt sign-up U9, U10 kiểm tay, U11 restore). Handoff này gom NOT VERIFIED NV-1…NV-8.
- **Backlog fixed:** M7-D5 (D4 đếm hàng `dirty = 2`), M7-P1 (copy riêng cho hàng trên máy bị cloud từ chối) — mục "Backlog fixed".

## 2. Task

| ID | Trạng thái | Ghi chú |
| :- | :- | :- |
| M8-T1 | DONE | `login-prompt.test.ts` (18), `login-prompt-service.test.ts` (11, fake-indexeddb, 2 instance cùng DB cho `claimExportHint`) |
| M8-T2 | DONE | `Today.loginPrompt.test.tsx` (5), `Settings.prompts.test.tsx` (9), `SignOutDialog.rejected.test.tsx` (4), `AccountCard.rejected.test.tsx` (4); `Settings.sync.test.tsx` sửa 1 assertion sang `descSignedOut` |
| M8-T3 | DONE | 3 spec mới (14 test); README; handoff này |

## 3. File chính đã thêm/sửa

- Domain/service: `src/domain/login-prompt.ts` (+test), `src/services/login-prompt-service.ts` (+test), `src/app/container.ts`, `src/domain/sync.ts` (`SyncStatus.rejected`, `remoteSkipped`), `src/services/sync-service.ts` (`cycleRejected`, `countRejected()`, status mới), `src/i18n/format.ts` (`CountKey` thêm 2 key số nhiều).
- UI: `src/ui/components/LoginPromptBanner.tsx`, `ExportSignInHint.tsx` (mới); `Today.tsx`, `Settings.tsx`, `AccountCard.tsx`, `SignOutDialog.tsx`; `src/ui/styles/app.css` (cuối file).
- i18n: `src/i18n/resources/en.json`, `vi.json` (`loginPrompt.*`, `exportHint.*`, `settings.backup.descSignedOut`, `settings.storage.notProtectedSignIn`; đề xuất của dev: `settings.account.localRejected_one/_other`, `auth.signOut.rejected_one/_other`, `rejectedKeep`, `rejectedRemove`, `removeDescRejected`).
- Test: 6 file Vitest mới (mục 2), `e2e/cloud/m8-prompts.spec.ts`, `e2e/cloud/m8-journey.spec.ts`, `e2e/m8-cloud-off.spec.ts`.
- Docs: `README.md`, `docs/handoff/dev-M8.md`.

## 4. Cách chạy

```bash
npm ci
npm run e2e:install
# Demo M8 với mock, không cần tài khoản
npm run mock:supabase                                   # 54321
npm run build:cloud-e2e && npm run preview:cloud-e2e    # http://localhost:4174/one-percent-better/
#   Settings → Import backup… → e2e/fixtures/sample-backup.json → Today: banner "Keep your progress safe" (vẫn ghi entry/timer được)
#   "Not now" → toast, BackupBanner hiện lại; "Sign in with Google" trên banner → chọn "Minh Test" → về #/today đã đăng nhập, banner mất
#   Settings (chưa đăng nhập) → Export backup (JSON) → dòng gợi ý + nút Google dưới hai nút
# Project thật (sau U1–U7): .env.local → npm run dev → http://localhost:5173
# Không cấu hình = phase 1: npm run build:e2e && npm run preview → http://localhost:4173 (không banner/hint/copy cloud)
```

## 5. Cách test

| Lệnh | Kết quả lần chạy cuối (2026-10-13) |
| :- | :- |
| `npm run check` lần A | lint 0, typecheck 0; Vitest **107 file, 1134 test: 1134 pass** (M7: 1083 → +51); build OK (máy có `.env.local` → bản cloud ON: `index-*.js` 200,03 kB gzip, precache 31 entry 1 784 KiB) → exit 0 |
| `npm run check` lần B (sau Playwright lần 1) | như A: 107 file / 1134 pass, build OK, exit 0. Sau đó sửa 1 comment CSS (ASCII) + 1 assertion spec M7 + 1 câu README: `npm run lint`, `npm run typecheck` lại exit 0 (không đổi code TS) |
| `npm run test:e2e` lần 1 (workers 8, 514 test = chromium + cloud, gồm `tests/qc`) | **510 pass / 4 fail**, 6,0 phút: (1) `tests/qc/m4-r1.spec.ts:572` "app.css is pure ASCII" — comment CSS M8 có ký tự "→" → sửa thành "->"; (2) `e2e/cloud/m7-sync.spec.ts:237` (dev, M7-D1) assert câu cũ cho hàng bị từ chối → re-target sang `localRejected_other` (M7-P1); (3) `tests/qc/cloud/m7-r1-probe.spec.ts:492` — dispute mục 9; (4) `tests/qc/cloud/m7-r2-flagged.spec.ts:76` "Expected to fail, but passed" (M7-D5 đã fix) → QC gỡ marker |
| `npm run test:e2e` lần 2 (sau sửa (1)(2)) | **512 pass / 2 fail**, 5,9 phút — 2 fail = đúng (3) và (4). Mọi test dev (`e2e/**`, M1–M8) và mọi test QC khác xanh; không flaky giữa hai lần |
| Chạy riêng 3 spec M8 (lần 1 / lần 2 sau sửa spec) | 12 test: 10 pass / 2 fail journey (lỗi spec, mục 7 D4) → journey chạy lại 2/2 pass (en 34,0 s, vi 34,2 s) |
| `npm run bench` | in-memory repos median **5,8 ms**; fake-indexeddb median 106,9 ms; pure review model 16,9 ms → < 200 ms, 10/10 pass (máy đang chạy Playwright song song lúc đo → số fake-indexeddb cao hơn M7: 70,7) |
| `npm run test:db` | `skipped` (không Docker, NV-2), exit 0 — đúng DoD 8 |
| `npm run build:cloud-e2e` (ngân sách) | `index-*.js` **200,01 kB** gzip + modulepreload `schemas` 34,62 + `useFormat` 6,77 + `preload-helper` 0,81 + `types` 0,10 = **≈ 242,3 kB ≤ 250** (M7: 240,0); `supabase-client-*.js` 57,97 kB chunk riêng, không modulepreload; precache 31 entry (1 784,79 KiB) |
| Secret (DoD 9) | `git grep -nE "service_role\|sb_secret_" -- . ":!docs"` → 0 kết quả (lần đầu bắt một câu README mới → đã đổi thành "service-role"); `git ls-files ".env*"` → `.env.cloud-e2e`, `.env.e2e`, `.env.example` |

## 6. Tự kiểm AC

| AC | Kết quả | Bằng chứng (lệnh + output rút gọn) |
| :- | :- | :- |
| M8-AC1 | PASS | `src/domain/login-prompt.test.ts`: cơ sở (now 2026-10-09T10:00+07:00, firstDataAt = now − 7 ngày, 0 entry, dismissCount 0) → true; cloud tắt / đã đăng nhập / signing-in / `expired` / offline / (6 ngày 23 h + 9 entry) / không dữ liệu → false; 10 entry + firstDataAt = now → true; snooze −13 ngày false, −14 ngày true; dismissCount 3 + −100 ngày → false. `shouldShowExportHint`: null → true, −29 ngày false, −30 ngày true, signed-in/expired/signing-in/unavailable → false. Service (`login-prompt-service.test.ts`): goal tombstone `createdAt` cũ hơn + entry của goal đã xoá + entry tombstone không tính; hai `claimExportHint` đồng thời (2 instance, cùng DB) → đúng 1 `true`; offline không tiêu lượt; DB mới 1 goal hôm nay 0 entry → false |
| M8-AC2 | PASS | `m8-prompts.spec.ts` AC2 (clock 2026-10-09): import S1 → `<section aria-label="Sign-in suggestion">`, không `role`/`aria-modal`, 0 dialog, không chứa focus; ghi 10 phút "Read" khi banner hiện → 10/30; BackupBanner 0; "Not now" → banner 0, toast `OK. You can sign in any time from Settings.`, h1 focus, BackupBanner hiện, kv `{dismissCount 1, lastDismissedAt = FIXED}`; reload vẫn ẩn; +14 ngày hiện → Not now; +28 hiện → Not now (count 3); +142 ngày không hiện; card Account vẫn có nút + lời giải thích, không "Not now". Bấm Google trên banner → `…/#/today`, toast gộp 5/23, `synced`, chỉ báo hiện, reload vẫn không banner. DB mới 1 goal hôm nay → không; offline → không, online → hiện. 360 px không cuộn ngang, axe sạch. `e2e/m8-cloud-off.spec.ts` (chromium): BackupBanner hiện, 0 banner/nút Google/Not now, 0 request ngoài origin; `tests/qc/m3-r1.spec.ts` (M3-AC10) vẫn pass |
| M8-AC3 | PASS | `m8-prompts.spec.ts` AC3: chưa đăng nhập + S1: Export → `role=group` `aria-label="Automatic backup"` + nút Google; kv `lastExportHintAt = FIXED`; Export lần 2 cùng ngày → kv không đổi; reload + Export → không hint; +29 ngày không, +30 ngày có (`lastExportHintAt = +30d`); nút trong hint → mock → về `…/#/settings` đã đăng nhập, hint mất. Đã đăng nhập → Export chỉ toast, kv `loginPrompt` null. Component: offline export không hint/không tiêu lượt; hint đang hiện mà offline → nút `disabled` + `aria-describedby` offlineHint |
| M8-AC4 | PASS | `Settings.prompts.test.tsx`: chưa đăng nhập → card Account có `descSignedOut` + nút Google, không "Not now"; Storage `not-persisted` + cloud bật → `notProtectedDesc + notProtectedSignIn` + nút `Go to Account` → focus nút Google; Backup `descSignedOut`, About `descCloud`. Đã đăng nhập → không dòng/nút Storage, Backup `descSignedIn`, About `descSignedIn`. Cloud tắt → copy M1 (`backup.desc`, `about.desc`, không `privacy`). Storage `persisted` → không gợi ý. vi: không rò rỉ. E2E phần copy trong `m8-prompts.spec.ts` AC4 (Storage e2e có điều kiện vì headless Chromium thường cấp persist) |
| M8-AC5 | PASS | `m8-journey.spec.ts` × en-US/vi-VN: A 1440 import S1 → tạo "Piano" → banner → ghi 10 Today → timer 5 → Day 2026-10-07 ghi 20 → Goals/Review/Settings (axe, quét vi, không cuộn ngang) → đăng nhập u1 **từ banner** → `#/today`, toast gộp 6 goal/26 entry, `synced`, mock 6/26. B 360 đăng nhập u1 → 6 goal, Piano 15/20; B offline ghi 5 → `offline` → online → `synced`; A Sync now → Piano 20/20. B bật nhắc 07:30 → mock settings → A Sync now → 07:30 + switch bật. A Export (đã đăng nhập) → file đúng tên, không hint. A Sign out Keep → dữ liệu còn, không chỉ báo. B xoá "Read" → mock 5 goal. A đăng nhập lại u1 → không D5, Goals 5, không "Read". B Sign out Remove → D4 không cảnh báo (pending 0, rejected 0) → Today rỗng; mock vẫn 5 goal. Mỗi màn: axe 0 serious/critical, quét vi (vi-VN) 0, không cuộn ngang; 0 pageerror ở A và B; mọi request ∈ {4174, 54321} |
| M8-AC6 | PASS | README: "Account & sync (optional)" (đăng nhập, cái gì đồng bộ/không, LWW, đăng xuất Keep/Remove, offline, project tạm dừng, **nhắc đăng nhập M8**, hàng bị từ chối); "Cloud setup (owner)" bảng U0–U11 (redirect, SQL, secrets, Publish consent, ghi chú tắt sign-up); "Testing cloud features" (mock, `test:db`, Docker tuỳ chọn). Handoff này: NV-1…NV-8 + bước kiểm thủ công (mục 6b). Demo mock theo README: mục 4 (dev đã chạy tay trên bản preview cloud-e2e) |
| M8-AC7 | PASS (trừ 2 test QC cần re-target/gỡ marker, mục 9) / NOT VERIFIED (`test:db`, NV-2) | Mục 5: `npm run check` exit 0 ×2 (1134 test); Playwright 512/514 với 2 fail là dispute + marker; bundle cloud 242,3 kB ≤ 250; bench 5,8 ms < 200; `test:db` skipped |

### 6b. NOT VERIFIED (cần project/thiết bị thật) — tổng hợp phase 2

| ID | Nội dung | Bước kiểm thủ công (U10) |
| :- | :- | :- |
| NV-1 | Đăng nhập Google thật (consent, redirect về `https://minh-lgm.github.io/one-percent-better/` và `http://localhost:5173/`) | U7 đã xong (localhost, user xác nhận 2026-10-12). Sau U8: mở bản Pages → Settings → Sign in with Google → về đúng màn, URL sạch, card hiện Gmail |
| NV-2 | Migration, RLS, trigger LWW trên Postgres thật; `tests/db/*` chưa chạy (không Docker) | Table Editor có hàng `user_id` của anh + 1 hàng `settings`; `curl "<Project URL>/rest/v1/goals?select=*" -H "apikey: <publishable key>"` và `…/settings…` → `[]`/lỗi quyền; Gmail khác không thấy dữ liệu; (tuỳ chọn) chèn tay 1 goal id 70 ký tự bằng SQL để xem mã lỗi thật (mock giả lập 400 + 23514) |
| NV-3 | Đồng bộ hai thiết bị thật (laptop + điện thoại), gồm ngôn ngữ + giờ nhắc | Ghi trên điện thoại → laptop Sync now; xoá goal một máy → máy kia mất; đổi ngôn ngữ/giờ nhắc laptop → điện thoại theo |
| NV-4 | iOS Safari / PWA đã cài (Web Locks, Notification, OAuth cửa sổ standalone) | Đăng nhập từ app đã Add to Home Screen; quay về app đúng màn |
| NV-5 | Project Free tạm dừng và khôi phục | U11: app báo "Couldn't reach the cloud" → Restore project → Sync now |
| NV-6 | Phiên thật hết hạn 1 giờ được làm mới; offline lâu rồi mở lại | Để app mở > 1 giờ rồi ghi entry → vẫn synced; tắt mạng 1 ngày, mở lại → tự đồng bộ |
| NV-7 | Độ trễ/giới hạn tốc độ thật khi đồng bộ dữ liệu lớn | Import `large-backup.json` (5.449 entry) trên bản thật rồi đăng nhập → ghi thời gian tới `synced` (mock: 2,5 s) |
| NV-8 | PostgREST thật với id chứa `"`/`\` trong `in.()`; Firefox/Safari; screen reader thật; banner M8 với VoiceOver/NVDA | Import file có goal id `a"b` → Table Editor; đọc Today với screen reader: banner là vùng "Sign-in suggestion", không ngắt |

**M8 riêng:** banner/hint với Google thật chỉ khác ở trang chọn tài khoản (mock thay Google) — logic hiển thị và `returnTo` đã kiểm bằng mock; NOT VERIFIED phần trải nghiệm trên điện thoại thật (360 px thật, bàn phím ảo).

### 6c. Tổng kết phase 2 (FR-37 … FR-55)

| FR | Trạng thái | Ghi chú |
| :- | :- | :- |
| FR-37, FR-38 (cấu hình, cloud tắt = phase 1) | Làm (M6) | `e2e/m6-cloud-off`, `m8-cloud-off` |
| FR-39, FR-40 (đăng nhập Google PKCE, phiên) | Làm (M6) | NV-1, NV-4, NV-6 |
| FR-41 (đăng xuất Keep/Remove + cảnh báo) | Làm (M6/M7; M8 thêm hàng bị từ chối) | M7-D5 fixed |
| FR-42, FR-43 (card Account, About) | Làm (M6) | |
| FR-44 … FR-51 (sync offline-first, LWW, xoá lan truyền, chỉ báo, gộp, hết hạn, import khi đăng nhập) | Làm (M7) | NV-2, NV-3, NV-5, NV-7 |
| FR-52 (banner Today) | Làm (M8) | AC2 |
| FR-53 (gợi ý sau Export) | Làm (M8) | AC3; chỉ claim khi online (OQ-D12) |
| FR-54 (lối vào cố định, copy theo trạng thái) | Làm (M8) | AC4 |
| FR-55 (đồng bộ nhắc nhở + ngôn ngữ) | Làm (M7) | NV-3 |
| Chưa làm (Later) | — | Xoá cloud trong app (OQ-09), realtime, dọn tombstone cũ (mục 8), provider khác, CSP |

**Việc user còn phải làm:** U0 (Export backup trên bản đang dùng — trước khi deploy bản phase 2), U8 (GitHub Secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` → push/re-run workflow), U10 (bảng NV ở trên), U11 (định kỳ). U9 không làm (OQ-06).

## 7. Deviations so với plan/design

- D1: `LoginPromptService` tái dùng `StatsService(goals, entries)` để đọc/watch "goals + mọi entry trong khoảng goal" (một luồng đọc dùng chung với Review, không thêm phương thức mới vào `EntryRepository`); `firstDataAt`/`entryCount` suy ra từ dữ liệu đã lọc tombstone của repository. Chữ ký constructor vẫn `(kv, goals, entries)` như ARCH §5.3.
- D2: UI Today dùng `watchData()` + `watchState()` của service rồi gọi hàm thuần `shouldShowLoginPrompt` (giống `shouldShowBanner` của M2) thay vì `state(now, ctx)` một lần — để banner phản ứng tức thì khi entry/kv/online đổi; `state()` vẫn có (test + dùng ngoài React).
- D3: Sau khi bấm Google trên banner, trạng thái `signing-in` không còn là `signed-out` nên theo quy tắc banner sẽ biến mất ngay dưới con trỏ; Today giữ banner ở trạng thái `busy` **chỉ khi** lần bấm xuất phát từ banner (state cục bộ), tới khi điều hướng sang Google. Trở về từ callback trên `#/today`: banner không hiện (đúng A-D27/DESIGN).
- D4 (spec, không đổi hành vi): journey chờ pill "+1%" hết hiệu ứng `entering` trước khi chạy axe (màu chuyển tiếp của M5 bị axe bắt contrast 3,99:1 — không phải trạng thái nghỉ, M5 đã PASS axe ở trạng thái nghỉ); B tua clock +10 phút trước khi đổi giờ nhắc vì cả hai máy đóng băng cùng một thời điểm với mốc import của A (A-37) → hoà LWW, server giữ bản cũ (đúng thiết kế).
- D5: ExportSignInHint tồn tại tới khi rời màn Settings/đăng nhập (không có nút đóng, DESIGN không nêu); "Export lần 2 cùng ngày → không hiện lại" được hiểu là không claim thêm (kv không đổi) và sau reload Export không hiện hint.
- D6: Nút "Go to Account" của Storage dùng `scrollIntoView` + focus nút Google (DESIGN 8.1), bỏ qua êm nếu môi trường không có `scrollIntoView` (jsdom).
- D7 (copy không có trong DESIGN — đề xuất của dev, xem Open questions): 7 key cho hàng bị cloud từ chối (mục "Backlog fixed").
- Thứ tự journey: import S1 **trước** khi tạo goal/ghi entry (TASKS ghi "import thêm dữ liệu để banner hiện" sau; vì import thay thế toàn bộ nên đảo thứ tự để dữ liệu tự tạo còn lại khi đăng nhập). Banner hiện suốt phần dùng offline — cũng chứng minh "không chặn".

## 8. Known issues và giới hạn

- `tests/qc/cloud/m7-r2-flagged.spec.ts:76` có `test.fail(true, 'M7-D5 …')` → nay "Expected to fail, but passed" → QC gỡ marker. `tests/qc/cloud/m7-r1-probe.spec.ts:522` assert dòng `remote-invalid` chứa `errors.SYNC_REMOTE_INVALID` cho hàng **trên máy** bị từ chối → nay là `settings.account.localRejected` (mục 9).
- Dọn tombstone đã đồng bộ > 30 ngày: **không làm** trong M8 (không bắt buộc). Lý do: cần đảm bảo hàng bị xoá cứng cục bộ không được "hồi sinh" bởi thiết bị khác đẩy bản cũ (server giữ tombstone nhờ LWW nên an toàn về lý thuyết) và cần test hội tụ bổ sung; đề xuất ADR riêng ở lần revise sau. Backlog giữ nguyên.
- `remoteInvalid` giữ nghĩa cũ (có gì đó bị bỏ qua: hàng từ cloud sai **hoặc** hàng trên máy bị từ chối) để test M7 và QC không đổi; thêm `remoteSkipped` (hàng từ cloud) và `rejected` (số hàng trên máy) để chọn câu chữ.
- Storage "Not protected" trên headless Chromium thường không xảy ra (persist được cấp) nên phần e2e của AC4 là có điều kiện; component test bao phủ cả ba trạng thái.
- `npm run check` trên máy có `.env.local` kết thúc bằng bản build cloud ON (như M7-P1 ghi nhận) — số đo bundle lấy từ `build:cloud-e2e`.

## 9. Dispute

- `tests/qc/cloud/m7-r1-probe.spec.ts:522` ("legacy local data with a 70-char goal id …"): assert `remote-invalid` chứa `EN.errors.SYNC_REMOTE_INVALID`. QC report M7 r2 §9.2 và backlog M7-P1 yêu cầu **key riêng** cho trường hợp này; nay dòng đó hiện `settings.account.localRejected_other` ("2 items on this device couldn't be uploaded to your account and stay only here. Export a backup to keep a copy; everything else is synced.") với `data-reason="local"`; hàng từ cloud sai vẫn dùng `errors.SYNC_REMOTE_INVALID` (`data-reason="remote"`, `tests/qc/cloud/m7-r1-probe.spec.ts:330` vẫn pass). Đề nghị QC re-target dòng 522 sang `EN.settings.account.localRejected_other.replace('{{count}}', '2')`.
- `tests/qc/cloud/m7-r2-flagged.spec.ts:76`: marker `test.fail` cho M7-D5 → gỡ.

## Backlog fixed

| Defect | Nguyên nhân gốc | Cách sửa | Regression test |
| :- | :- | :- | :- |
| M7-D5 (Minor, QC M7 r2 §4) | D4 chỉ xét `pending` (= `countDirty`, chỉ `dirty = 1`); hàng `dirty = 2` không ở đâu ngoài máy nhưng không được đếm; mô tả Remove nói "Your account keeps everything" | `SyncService.countRejected()` (đọc tươi khi mở D4) + `SyncStatus.rejected`; `SignOutDialog` nhận `rejected`: khối cảnh báo `unsynced-warning` hiện khi `pending > 0 ∨ rejected > 0` (dòng `auth.signOut.rejected_*` + `rejectedKeep`, có `data-rejected`), mô tả Remove đổi sang `removeDescRejected`, chọn Remove → vùng `role=status` thêm `rejectedRemove` ("…will be lost. Export a backup first…"). Keep không đổi hành vi | `SignOutDialog.rejected.test.tsx` (4); e2e `m8-prompts.spec.ts` "M7-D5 …" (Remove: cảnh báo + xoá; Keep: hàng còn) |
| M7-P1 (QC M7 r1/r2 §9.2) | Một key `errors.SYNC_REMOTE_INVALID` ("items from your account couldn't be read") dùng cho cả hàng **trên máy** bị cloud từ chối | `SyncService` tách `cycleRejected` khỏi `skippedInvalid` → `SyncStatus.remoteSkipped` / `rejected`; `AccountCard` dòng `remote-invalid` có `data-reason` local/remote/both và câu `settings.account.localRejected_*` (nhắc Export) | `AccountCard.rejected.test.tsx` (4); e2e `m8-prompts.spec.ts` M7-D5 (`data-reason="local"`, text) |

Copy đề xuất (en/vi do dev viết — **Open question cho designer**, DESIGN v2.0 chưa có):

| Key | `en` | `vi` |
| :- | :- | :- |
| `settings.account.localRejected_one` | 1 item on this device couldn't be uploaded to your account and stays only here. Export a backup to keep a copy; everything else is synced. | — |
| `settings.account.localRejected_other` | {{count}} items on this device couldn't be uploaded to your account and stay only here. Export a backup to keep a copy; everything else is synced. | {{count}} mục trên thiết bị này không tải lên được tài khoản của bạn nên chỉ còn ở đây. Hãy xuất bản sao lưu để giữ một bản sao; mọi thứ còn lại đã được đồng bộ. |
| `auth.signOut.rejected_one` | 1 item on this device couldn't be uploaded to your account. | — |
| `auth.signOut.rejected_other` | {{count}} items on this device couldn't be uploaded to your account. | {{count}} mục trên thiết bị này không tải lên được tài khoản của bạn. |
| `auth.signOut.rejectedKeep` | It stays on this device if you keep the data here. Export a backup to keep a copy. | Chúng vẫn nằm trên thiết bị này nếu bạn giữ dữ liệu ở đây. Hãy xuất bản sao lưu để giữ một bản sao. |
| `auth.signOut.rejectedRemove` | If you remove the data from this device, these items will be lost. Export a backup first to keep them. | Nếu xóa dữ liệu khỏi thiết bị này, các mục đó sẽ mất. Hãy xuất bản sao lưu trước để giữ chúng. |
| `auth.signOut.removeDescRejected` | Deletes your goals, entries and reminder settings on this device. Choose this on a shared device. Items that couldn't be uploaded are not in your account. | Xóa mục tiêu, lần ghi và cài đặt nhắc nhở trên thiết bị này. Hãy chọn khi dùng máy chung. Các mục không tải lên được không có trong tài khoản của bạn. |

## Open questions

1. Designer: duyệt/sửa 7 chuỗi đề xuất ở "Backlog fixed" (DESIGN §7.7 chưa có); dev sẽ đổi theo khi có bản chính thức.
2. QC: re-target `m7-r1-probe.spec.ts:522` và gỡ marker `m7-r2-flagged.spec.ts:76` (mục 9).
3. Planner (không chặn): A-30 không nói hint sau Export có xét online hay không — M8 làm theo OQ-D12 (chỉ claim khi online); ghi nhận ở lần revise.
