# Dev handoff — M7 Đồng bộ offline-first: Dexie v2, sync engine, last-write-wins, xoá lan truyền, trạng thái đồng bộ

Ngày: 2026-10-12 (WIP checkpoint commit `68330a6`, hoàn tất bởi developer kế tiếp cùng ngày). Build theo `docs/plan/TASKS.md` v2.1 (M7-T1…T6, M7-AC1…AC19, DoD 7–11, NV-2/3/5/6/7, U0/U7/U8/U10), `ARCHITECTURE.md` v2.1 (§4.1–4.4, §5.2, §5.3, §5.10, §5.11, §8, §9, ADR-20/21/24/25), `DESIGN.md` v2.0 (§2 F11/F13, §3.1 StatusRow, §4 S7 A5–A10 + D3/D4/D5, §5 SyncIndicator, §7.2/7.3/7.7, §8.1), `docs/handoff/dev-M6.md`, `docs/qc/report-M6-r1.md` (§4 M6-D1, §9). Quyết định orchestrator 2026-10-12: (1) test QC assert hard-delete do QC re-target, dev chỉ ghi dispute; (2) AC7 hiểu theo deviation D7.

## 1. Tóm tắt

- **T1 Dexie v2 + xoá mềm + dirty + prefs.** `db.ts` `version(2)` (`goals: id, dirty`, `entries: …, dirty`) + `upgradeToV2` (mọi hàng → `deletedAt: null, dirty: 1`; kv `prefsSync` theo A-36 với mốc `1970-01-01T00:00:00.000Z` cho nhóm đã có giá trị, `{updatedAt: null, dirty: 0}` cho nhóm mặc định); `upgradeProbe` test seam. Mọi repository (`goal-repo`, `entry-repo`, `timer-repo`, `backup-repo`, `local-data-repo`) xoá mềm, lọc tombstone và entry của goal đã xoá trong cùng transaction, `clock` qua constructor. `prefs-repo.ts` (`DexieSyncedPrefsRepository`: ghi giá trị + mốc trong một transaction). `domain/sync.ts` (`nextUpdatedAt`, `resolveIncoming`, `sameVersion`, `resolvePrefGroup`, `rewindCursor`, `backoffMs`, `SyncStatus`). `GoalService.update/setArchived`, `EntryService.update` dùng `nextUpdatedAt`; `SettingsService`/`LocaleService` đi qua `prefs`; `BackupService(…, isSignedIn)` stamp `updatedAt` = thời điểm import khi đã đăng nhập; `replaceAll` xoá mềm hàng không có trong file + nhóm reminder dirty (A-37).
- **T2 LocalSyncStore.** `data/dexie/sync-store.ts`: `getDirty` (goals trước entries), `applyRemote` một transaction/lô + cascade tombstone goal → entry, cùng version → chỉ hạ dirty, `markAllDirty`, `tombstoneOrphanEntries`, `countDirty` (+ nhóm prefs dirty), `watchPendingCount`.
- **T3 RemoteStore.** `services/remote-store.ts` (interface, `RemoteError`), `integration/supabase/mapper.ts` (zod, snake↔camel, chuẩn hoá timestamp, `skippedInvalid`), `SupabaseRemoteStore` (upsert lô ≤ 500 `onConflict user_id,id`, `fetchByIds` lô ≤ 100, `pull` keyset `limit+1` → `hasMore`, timeout 20 s, ánh xạ lỗi 401/403 → `SYNC_UNAUTHORIZED`, network → `SYNC_OFFLINE`, khác → `SYNC_UNREACHABLE`; `pushPrefs`/`pullPrefs`), `loader.createRemoteLoader`. `test/fake-remote-store.ts` (cùng quy tắc trigger). Mock REST `e2e/mock-supabase/server.mjs` (`/rest/v1/goals|entries|settings`, LWW như trigger, RLS theo JWT `sub`, check constraint → 400, `/__test/seed|rows|token|fail`). Bộ hợp đồng `services/remote-store.contract.ts` chạy với Fake + Supabase→mock (`npm test`) và **`tests/db/remote-store.test.ts`** (Supabase local, `describe.skipIf`, NV-2 — xem mục 8).
- **T4 SyncService + scheduler.** `services/sync-service.ts`: chu kỳ push → fetchByIds → applyRemote (≤ 20 lô) → pull goals/entries theo cursor (lùi 120 s đầu chu kỳ, ghi cursor sau mỗi trang) → `tombstoneOrphanEntries` → push lại nếu còn dirty → prefs push/pull → `lastSyncedAt`; backoff 30…900 s; single-flight trong tab + `LockPort` `opb-sync` (Web Locks); 401 → `AuthService.expire()` + paused; `watchStatus`, `onEvent` (`merge-done`, `prefs-applied`), `watchMergePrompt`, `prepareFirstSignIn`/`handleSignedIn`/`confirmMerge`/`cancelMerge`, **`willAnnounceMerge()`** (mới, mục 7 D9), `finalSyncBeforeSignOut` (10 s), `reset` (không tạo lại kv `sync` đã bị Remove xoá — fix mục 3), `pause`. `app/sync-scheduler.ts` (sign-in/startup, `online`, `visibilitychange`, debounce 2000 ms theo pending tăng, interval khi visible). `container.ts`: watch kv `locale` → `setLocale` ngay. `AuthService`: fix **M6-D1**, `expire()`, `signOut({ preserveLastUserId })`, dọn PKCE verifier (M6-P1). `test/two-devices.ts`, `sync-convergence.test.ts` (a–f + prefs + 20 seed × 200 thao tác).
- **T5 UI.** `SyncIndicator` (6 trạng thái, vùng `sr-only role=status aria-live=polite` debounce 1 s), `StatusRow` trong `AppShell`, `AccountCard` A5–A9 (`dl` Last synced/Waiting, `Sync now` `aria-disabled` khi syncing / `disabled` + `offlineSync` khi offline, Alert `errors.SYNC_*` + `nextRetry`, dòng `SYNC_REMOTE_INVALID`), `SignOutDialog` (cảnh báo chưa đồng bộ, `Remove anyway`), `MergeAccountDialog` (D5), `SyncFeedback` (toast `mergeDone`/`prefsFromAccount` + D5), `Settings` (Sync now → `syncNowDone` trừ khi chu kỳ đó áp tuỳ chọn từ cloud — D9; đăng xuất: `finalSyncBeforeSignOut`; D3 biến thể đã đăng nhập; syncNote Language/Reminders; `permission.defaultOnDesc`). Toàn bộ key M7 của DESIGN §7.2/7.3/7.7 vào `en.json`/`vi.json` (parity xanh).
- **T6 E2E + README + handoff (phần làm trong lần resume).** 6 spec M7 chạy lần đầu, sửa 4 lỗi spec (mục 7 D10); regression toàn bộ Playwright chạy 3 lần (mục 5); fix 3 regression thật do code M7 (mục 3); README mục "Account & sync (optional)" đầy đủ + "Testing cloud features (two devices)" + U0; `tests/db/remote-store.test.ts`; mock `/__test/token?email=&name=` cho QC re-target (mục 9).

## 2. Task

| ID | Trạng thái | Ghi chú |
| :- | :- | :- |
| M7-T1 | DONE | `migration-v2.test` (6), `soft-delete.test` (6), `prefs-repo.test` (9), `sync.test`; repos/backup/timer test cập nhật sang xoá mềm |
| M7-T2 | DONE | `sync-store.test` (8) |
| M7-T3 | DONE (Supabase local: NOT VERIFIED NV-2) | contract Fake + mock xanh (23 test); `mapper.test` (4); `remote-store.test` (7); `tests/db/remote-store.test.ts` viết xong, chưa chạy trên Postgres (không Docker) |
| M7-T4 | DONE | `sync-service.test` (19), `sync-convergence.test` (28, seed `20261009`…`20261028`), `sync-scheduler.test` (4), `auth-service.test` +6, `backup-service.test` +1 |
| M7-T5 | DONE | `SyncIndicator.test` (5), `MergeAccountDialog.test` (3), `SignOutDialog.m7.test` (4), `AccountCard.sync.test` (7), `Settings.sync.test` (12) |
| M7-T6 | DONE | `e2e/m7-migration.spec.ts` (1), `e2e/cloud/m7-merge` (3), `m7-sync` (5), `m7-import-perf` (2), `m7-prefs` (2), `m7-i18n` (2) — 15 test M7 xanh; README; handoff này |

## 3. File chính đã thêm/sửa (lần resume, trên nền commit `68330a6`)

- Code: `src/services/sync-service.ts` (`reset()` không tạo lại kv `sync`; `willAnnounceMerge()`), `src/ui/components/AuthFeedback.tsx` (bỏ toast `signedIn` khi toast gộp sẽ theo sau), `src/ui/screens/Settings.tsx` (bỏ `syncNowDone` khi chu kỳ áp tuỳ chọn; focus h2 Account sau khi D4 thật sự đóng), `src/ui/components/SyncFeedback.tsx` (focus sau khi D5 đóng), `src/ui/styles/app.css` (`.alert .stack-t { overflow-wrap: anywhere }` — A10 email dài tràn 360 px), `src/services/remote-store.contract.ts` (`seedRaw` tuỳ chọn), `e2e/mock-supabase/server.mjs` (`/__test/token?user=&email=&name=`).
- Test: `src/services/sync-service.test.ts` (+2), `src/ui/screens/Settings.sync.test.tsx` (+2), `tests/db/remote-store.test.ts` (mới), `e2e/cloud/m7-{sync,i18n,import-perf,prefs}.spec.ts` (sửa selector/timing), `e2e/cloud/m6-auth.spec.ts`, `m6-i18n.spec.ts` (toast sau đăng nhập có dữ liệu máy = toast gộp, DESIGN F11).
- Docs: `README.md`, `docs/handoff/dev-M7.md`.
- Toàn bộ file của WIP (T1–T5) liệt kê trong commit `68330a6`.

## 4. Cách chạy

```bash
npm ci
npm run e2e:install
# (a) demo hai thiết bị với mock, không cần tài khoản
npm run mock:supabase                                   # cổng 54321
npm run build:cloud-e2e && npm run preview:cloud-e2e    # http://localhost:4174/one-percent-better/
#   mở URL trong 2 profile (hoặc 1 cửa sổ thường + 1 ẩn danh) → Settings → Sign in with Google → "Minh Test" ở cả hai
#   A ghi 10 phút → chip "Syncing…" → "Synced hh:mm"; B bấm "Sync now" (hoặc đổi tab) → entry xuất hiện
#   A: DevTools → Network offline → ghi thêm → "Offline · 1 change waiting" → online → tự đồng bộ
#   B xoá goal → A "Sync now" → goal biến mất. A chọn Tiếng Việt + giờ nhắc 07:30 → B "Sync now" → B chuyển vi + 07:30
# (b) project thật (sau U1–U7): .env.local với VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY → npm run dev → http://localhost:5173/#/settings
# (c) không cấu hình = phase 1 (không card Account, không request ngoài origin)
npm run build && npm run preview                        # http://localhost:4173
```

Nâng cấp từ bản phase 1: lần mở đầu tiên nâng Dexie v1 → v2 tại chỗ, giữ nguyên dữ liệu (AC1). Khuyến nghị U0: Export backup trước khi deploy bản M7.

## 5. Cách test

| Lệnh | Kết quả lần chạy cuối (2026-10-12) |
| :- | :- |
| `npm run lint`, `npm run typecheck` | exit 0 |
| `npm test` (Vitest) | xem mục 5a — **chỉ 3 fail là test QC tranh chấp** (mục 9.1) |
| `npm run check` | lint + typecheck xanh, Vitest 3 fail tranh chấp (mục 9.1), build OK → exit 1 **chỉ vì** 3 test đó |
| `npm run test:e2e` (3 webServer tự dựng) | xem mục 5b — 3 lần chạy; mọi fail còn lại đều thuộc mục 9 (dispute) |
| `npm run test:db` | `test:db skipped: … (Supabase local not running)`, exit 0 — không Docker (NV-2) |
| `npm run bench` | fake-indexeddb median 70,7 ms < 200 ms (mục 5c) |
| `npm run build:cloud-e2e` | `index-*.js` 197,2 kB gzip + modulepreload `schemas-*.js` 34,6 (zod, dùng chung import backup + mapper) + `useFormat-*.js` 6,8 + `preload-helper-*.js` 0,8 + `types-*.js` 0,1 = **≈ 239,5 kB ≤ 250 kB**; chunk SDK `supabase-client-*.js` 57,7 kB gzip riêng, không modulepreload; precache 27 entry |

### 5a. Vitest (`npm run check`, 2026-10-12 ~20:30)

lint exit 0, typecheck exit 0; Vitest **97 file, 997 test: 994 pass / 3 fail** — 3 fail = `tests/qc/m1-domain.test.ts` (1) + `tests/qc/m3-r1-domain.test.ts` (2), mục 9.1. Vì `check` dùng `&&`, build chạy riêng: `npm run build` OK (máy này có `.env.local` thật nên bản build là cloud ON: `index-*.js` 197,24 kB gzip + preload `schemas` 34,62 + `useFormat` 6,77 + `preload-helper` 0,79 + `types` 0,10 ≈ **239,5 kB**; `supabase-client-*.js` 57,74 kB chunk riêng; precache 27 entry). M6 baseline 786 test → +211.

### 5b. Playwright (`npm run test:e2e`, 430 test = chromium 353 + cloud 77)

| Lần | Kết quả | Ghi chú |
| :- | :- | :- |
| 1 | 407 pass / 23 fail, 10,7 phút | chạy ngay sau khi 6 spec M7 xanh, **giữa chừng có sửa code** (chẩn đoán): phát hiện 3 regression thật (mục 3) |
| 2 | **409 pass / 21 fail**, 12,3 phút | sạch, sau mọi sửa; 21 fail = 9 (9.1) + 1 (9.3) + 1 (9.4) + 10 (9.2) |
| 3 | **408 pass / 22 fail**, 13,4 phút | như lần 2 + `m6-r1-ui.spec.ts:142` "D4 fits the viewport 360x740" (9.2, phụ thuộc timing: card chuyển `expired` sau chu kỳ sync đầu) |

Mọi test do developer sở hữu (`e2e/**`: M1–M7, cloud M6–M7) pass ở cả lần 2 và 3; không flaky. `[M7-AC14]` trong lần chạy đầy đủ: 3 885 ms / 3 871 ms (chạy riêng: 2 600 ms); lô lớn nhất 500 hàng, 13 upsert.

### 5c. Bench (`npm run bench`, máy rảnh)

`[bench] in-memory repos: median 5,3 ms`; `fake-indexeddb: median 70,7 ms` (M6: 57,1 — thêm lọc tombstone); `pure review model: median 9,7 ms` → **< 200 ms**, 10/10 pass.

## 6. Tự kiểm AC

| AC | Kết quả | Bằng chứng (lệnh + output rút gọn) |
| :- | :- | :- |
| M7-AC1 | PASS | `migration-v2.test.ts` (6): DB v1 chép schema + S1 + `activeTimer` + `settings` + `locale='vi'` → v2 `getAll` deep-equal 5 goal/23 entry, hàng thô `deletedAt null, dirty 1`, kv nguyên, `StatsService` đúng M4-AC4/5; `upgrade` ném → `StorageError`, mở lại v1 dữ liệu nguyên. E2E `e2e/m7-migration.spec.ts`: DB version 10 bằng IndexedDB thô (G1 + 8 entry + `locale vi`) → Today tiếng Việt "Read" `0/30`, Goal detail 8 dòng, version 20, `prefsSync` `{reminder:{null,0}, locale:{1970…,1}}`, 0 pageerror |
| M7-AC2 | PASS | `soft-delete.test.ts` (6) + `repos.test.ts`/`backup-repo.test.ts`/`timer-repo.test.ts`: deleteWithEntries → tombstone `deletedAt = updatedAt = clock`, `dirty 1`, 8 entry cùng `deletedAt`; `delete(id)` → `getById` undefined; `sumMinutes` bỏ tombstone; entry sống của goal đã xoá không ra ở `getByDateRange/watch/getByGoal/exportAll`; `saveTimerEntry` → `goal-missing`; export sau xoá G5 → 4/22, JSON không `deletedAt`/`dirty`; `replaceAll(S1)` với "Temp" → xoá mềm; M3-AC7 round-trip pass. Dev E2E M1–M6 pass không sửa assertion (project chromium). Test QC đọc hàng thô: mục 9.1 |
| M7-AC3 | PASS | `domain/sync.test.ts`: `resolveIncoming` 8 trường hợp (kể cả `+00:00` = `.000Z`); `nextUpdatedAt` 3 trường hợp; `goal-service.test.ts`: `updatedAt` = cũ + 1 ms khi clock lùi, = now với clock cố định |
| M7-AC4 | PASS | `sync-store.test.ts` (8): lô 500 lỗi hàng 300 → không đổi; dirty mới hơn giữ; cùng version → `dirty 0`; cascade tombstone; `getDirty(2)` thứ tự/giới hạn; `markAllDirty`; `watchPendingCount`; `tombstoneOrphanEntries`; 2 store đồng thời = tuần tự |
| M7-AC5 | PASS (Fake + mock) / NOT VERIFIED (Supabase local, NV-2) | `remote-store.contract.ts` chạy trong `fake-remote-store.test.ts` + `integration/supabase/remote-store.test.ts` (23/23): push 3 → pull có `serverUpdatedAt`; bản cũ thua, bằng → server giữ; 1.200 entry → 3 trang 500/500/200 đủ id, `hasMore` cuối false; cursor + cửa sổ 120 s; u2 không thấy u1. `mapper.test` (4): timestamp chuẩn hoá, `date` giữ, hàng sai bị bỏ + `skippedInvalid`. Lỗi: 500/503/429 → UNREACHABLE, `Failed to fetch` → OFFLINE, 401/403 → UNAUTHORIZED, timeout → UNREACHABLE |
| M7-AC6 | PASS | `sync-convergence.test.ts` (28): (a)–(f) đúng kịch bản TASKS (kể cả LockPort giả: một `ran` một `skipped`; không hỗ trợ lock: cả hai chạy, không trùng); ngẫu nhiên **20 seed × 200 thao tác** (`20261009`…`20261028`) → A = B = remote, 20/20 pass, seed in ra khi fail |
| M7-AC7 | PASS (mock; theo D7) | `e2e/cloud/m7-merge.spec.ts` AC7: C1 seed + import S1 → đăng nhập u1 → toast `Signed in. Your account now has 6 goals, 25 entries.`, `synced`, pending 0, Goals 6 (có "Cloud goal"), mock u1 6/25; context B đăng nhập → 6 goal; Sign out Keep → đăng nhập lại u1 → không D5; đăng nhập u2 → D5 `6 goals, 25 entries` + email, focus Cancel → Cancel → signed-out, u2 0 hàng, `opb-auth` null; lại → Add to account → u2 6/25, u1 không đổi; 0 pageerror |
| M7-AC8 | PASS | `m7-sync.spec.ts` AC8: ghi 10 phút → upsert `/rest/v1/entries` trong ≤ 5 s, chip `Synced hh:mm`, StatusRow `role=group` + `aria-label`, axe sạch; offline → `Offline · 1 change waiting` → online → mock 2 entry ≤ 5 s, pending 0; 500×100 → `error` + nút Retry (`retryAria`), card Alert `SYNC_UNREACHABLE` + `Trying again at hh:mm.`; Sync now khi backoff → log tăng ngay; gỡ lỗi → Sync now → `synced` + toast `syncNowDone`. `sync-service.test`/`sync-scheduler.test` (fake timers): backoff 30/60/120/240/480/900/900; 5 ghi trong 1,5 s → 1 chu kỳ; hidden → không interval; `online` → 1 chu kỳ; interval mặc định 300000 |
| M7-AC9 | PASS | `m7-sync.spec.ts` AC9 (2 context, clock cố định): A xoá "Read" → mock g1 `deleted_at`; B Sync now → Read mất ở Today/Goals, Review ô 2026-10-05 `l0`; A start timer + ghi đủ "Guitar" (+1%) → B Sync now + reload: không timer, `plus-one-live` rỗng, `plusOneShown/lastReminderDate/lastBackupAt` của B không đổi, `activeTimer` null; cột hàng mock = đúng danh sách §4.3 |
| M7-AC10 | PASS | `m7-sync.spec.ts` AC10: A, B offline; A → "Guitar A", ≥ 1,1 s sau B → "Guitar B"; online; sync A, B, A → cả hai "Guitar B"; mock 1 hàng sống g2 = "Guitar B" |
| M7-AC11 | PASS | `m7-import-perf.spec.ts` AC11: u1 có C1 → import S1 → D3 tiêu đề `import.titleSignedIn` + thân "once synced, everything in your account too" → Confirm → toast 5/23, synced, pending 0, Goals 5 không "Cloud goal"; mock c1-goal `deleted_at`, 5/23 sống với `updated_at ≥ thời điểm import`; B sync → 5 goal; Export → `schemaVersion 1`, 5/23, không `deletedAt|dirty|user_id`. M3-AC7/AC8 (chromium) pass |
| M7-AC12 | PASS (theo D8) | `m7-merge.spec.ts` AC12: offline + 2 entry → chip `Offline · 2 changes waiting` → D4 `2 changes haven't synced…` + `unsyncedOffline` → Keep → signed-out, Today 15/30, mock 0 entry → online + đăng nhập → mock 2 entry. Online + 1 pending (500 chặn push) → D4 `1 change hasn't synced…` + `unsyncedOnline` → Keep → log có POST `/rest/v1/entries`, mock 1 entry, phiên null (SDK `scope: local` không gọi `/logout`, M6 D4) |
| M7-AC13 | PASS (mock) / NV-5 (project tạm dừng thật) | `m7-sync.spec.ts` AC13: 401×100 → chip `expired`, card `expired` "Sign in again", Today vẫn 10/30; seed note `<img src=x onerror=alert(1)>` + `minutes 5000` → card `remote-invalid`, lịch sử 3 dòng, chuỗi hiện literal, 0 `img[src=x]`, không "5000", 0 dialog; mọi spec M7: `collectErrors` = [] |
| M7-AC14 | PASS | `m7-import-perf.spec.ts` AC14 (clock cố định): import `large-backup.json` (5 goal, 5.449 entry) → đăng nhập u1 → **pending 0 sau 2 600 ms** (< 15 s); lô lớn nhất **500 hàng, 13 upsert**; ghi 5 phút trên Today trong lúc đồng bộ → hiện < 1,5 s; mock 5 goal / 5.450 entry. Bundle cloud ≈ 239,5 kB gzip ≤ 250 (mục 5). Bench: mục 5c |
| M7-AC15 | PASS | Component quét vi: `SyncIndicator.test` 5 trạng thái (pending 1 và 3), `AccountCard.sync.test` (synced, error), `MergeAccountDialog.test`, `SignOutDialog.m7.test`, `Settings.sync.test` (D3 signed-in, Backup desc, toast gộp) → 0 phát hiện; `_one`/`_other` đúng (parity). `aria-live=polite` vùng riêng, không chiếm focus (`SyncIndicator.test`). E2E `m7-i18n.spec.ts` (vi-VN): luồng gộp (toast `Đã đăng nhập. Tài khoản của bạn hiện có 6 mục tiêu, 25 lần ghi.`, chip `Đã đồng bộ hh:mm`, `hôm nay lúc hh:mm`, `0 thay đổi`, D5 vi), offline→online (`Ngoại tuyến · 1 thay đổi đang chờ`, D4 cảnh báo) — `expectNoViLeaks`, axe 0 serious/critical (Today, Settings, D4, D5), 360 px không cuộn ngang; axe en trong `m7-sync.spec.ts` |
| M7-AC16 | PASS (trừ test QC tranh chấp, mục 9) / NOT VERIFIED (`test:db`, NV-2) | Mục 5b: project `chromium` (dev M1–M7 migration + QC) và `cloud` (dev M6/M7 + QC M6) — mọi test dev xanh; test QC fail = đúng danh sách mục 9 |
| M7-AC17 | PASS | `domain/sync.test.ts` `resolvePrefGroup` 5 dòng; `prefs-repo.test.ts` (9): `setLocale` một transaction (lỗi mốc → locale không đổi), `setReminder` giữ `lastReminderDate/plusOneShown/lastBackupAt`, `applyRemote` từng nhóm độc lập, `claimReminderDay/claimPlusOne/Export` không dirty; `migration-v2.test`: mốc 1970 + dirty 1 khi có giá trị, `{null, 0}` khi mặc định; `backup-service.test`: import → reminder dirty với mốc import, locale không đổi; `local-data-repo.test`: clearUserData xoá `prefsSync`, giữ `locale`; `sync-convergence.test` prefs: vi + 07:30 không ghi đè nhau; 06:00/21:00 → 21:00 |
| M7-AC18 | PASS | `m7-prefs.spec.ts` (2): A chọn Tiếng Việt + nhắc 07:30 → `settings` mock `{locale vi, reminder_enabled true, reminder_time 07:30}`; B (en-US, chưa chọn) đăng nhập → `<html lang=vi>` không reload (`__noReload` giữ, 0 sự kiện `load`), toast `prefsFromAccount` vi, switch bật + `07:30`, `requestPermission` 0 lần, chip "Chưa hỏi" + `defaultOnDesc` + nút cho phép; B → English → A Sync now → A `en` + toast; cloud trống: C chọn vi + 06:00 khi chưa đăng nhập (0 request `/rest/`) → đăng nhập u2 → mock `vi/06:00`; D mới đăng nhập u2 → vi + 06:00. Quét vi Settings sau khi áp: `Settings.sync.test` (FR-55) |
| M7-AC19 | PASS (Fake + mock) / NOT VERIFIED (Supabase local, NV-2 → U10 (6)) | Contract "(v2.1) prefs": `pullPrefs` null khi chưa có; push reminder → locale null; push locale không xoá reminder; reminder cũ/bằng T → giữ server; u2 cô lập; hàng `25:00`/`fr` → nhóm null + `skippedInvalid 2` (Fake/mock; Supabase thật: check constraint từ chối — `tests/db/remote-store.test.ts`) |

### NOT VERIFIED (cần project/thiết bị thật)

| ID | Nội dung | Bước kiểm thủ công |
| :- | :- | :- |
| NV-2 | Migration, RLS, trigger LWW (`sync_before_write`, `settings_before_write`) trên Postgres thật; `tests/db/remote-store.test.ts` + `rls.test.ts` chưa từng chạy (không Docker) | U10 (3)(4)(6): Table Editor có hàng `user_id` của anh; `curl "<Project URL>/rest/v1/goals?select=*" -H "apikey: <publishable key>"` và `…/rest/v1/settings…` → `[]`/lỗi quyền; bảng `settings` 1 hàng; Gmail khác không thấy dữ liệu |
| NV-3 | Đồng bộ hai thiết bị thật qua bản deploy (laptop + điện thoại), gồm ngôn ngữ + giờ nhắc | U10 (2)(5)(6) sau U8 |
| NV-5 | Project Free tạm dừng và khôi phục | U11: app báo `Sync error` ("Couldn't reach the cloud"), Restore project → Sync now |
| NV-6 | Phiên thật hết hạn 1 giờ được làm mới; offline lâu rồi mở lại | U10 |
| NV-7 | Độ trễ/giới hạn tốc độ thật khi đồng bộ dữ liệu lớn | U10 (2) với dữ liệu thật (mock: 5.449 entry trong 2,6 s) |

Hướng dẫn user: **U7** đã xong (đăng nhập thật OK). **U8** (sau Final QC phase 2): GitHub → Settings → Secrets and variables → Actions → `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` → push `main` hoặc Re-run workflow; bản Pages có card Account. **U0** trước U8: Export backup trên bản đang dùng. **U10**: danh sách trong TASKS (mục (6) thay test RLS tự động).

## 7. Deviations so với plan/design

- D1: `pull()` là keyset **chính xác**; cửa sổ lùi 120 s áp ở đầu chu kỳ bởi `SyncService` (`rewindCursor`) — áp trong `pull` thì phân trang > 500 hàng cùng 120 s lặp vô hạn.
- D2: `pullPrefs()` trả `{ prefs, skippedInvalid }` (ARCH ghi `RemotePrefs | null`) để đếm nhóm sai.
- D3: Chu kỳ push **lại** sau bước dọn nếu còn dirty (ARCH: "đẩy ở chu kỳ sau") để "sync A, B, A" hội tụ với dirty = 0.
- D4: `AuthService.signOut` có `preserveLastUserId` (D5 Cancel) và `applySignedIn` ghi `lastUserId` khi đổi tài khoản không qua đăng xuất.
- D5: `renderWithLocale` dùng RTL `wrapper`.
- D6: `Sync now` chỉ `disabled` khi offline (DESIGN "Loading": không có tín hiệu SDK đang nạp; chu kỳ chờ `authService.settled()`).
- D7: AC7 "đăng nhập lại u1 sau Sign out (Keep) → không D5" = ngay sau khi rời u1; sau khi đã gộp vào u2 rồi quay lại u1 thì có D5 (`lastUserId = u2`). Orchestrator chấp nhận 2026-10-12.
- D8: AC12 "upsert trước request logout": SDK `signOut({scope:'local'})` không gọi `/auth/v1/logout` (M6 D4) → spec kiểm upsert xảy ra và đăng xuất xong.
- **D9 (mới) — một toast, không đè nhau.** Vùng toast chỉ hiện một thông báo (DESIGN §5). (a) Lần đăng nhập đầu có dữ liệu máy: `merge-done` ("Signed in. Your account now has …", F11) hiện trong vài trăm ms sau `signedIn` ("Signed in as …", F9) và đè lên — gây flaky; nay `AuthFeedback` hỏi `SyncService.willAnnounceMerge()` và **bỏ** `signedIn` khi toast gộp sẽ theo sau (máy sạch hoặc D5 → vẫn `signedIn`). (b) `Sync now` mà chu kỳ áp ngôn ngữ/giờ nhắc từ cloud: giữ `prefsFromAccount`, bỏ `syncNowDone`. Designer có thể ghi vào DESIGN §5 Toast/F11.
- **D10 (mới) — sửa spec M7 sau lần chạy đầu** (không đổi hành vi app): AC14 cần `freezeClock` (goal của `large-backup.json` kết thúc 2026-10-09); AC8 kiểm chip bằng `toHaveText` (span không role không có accessible name — DESIGN "chữ hiển thị là tên truy cập" đúng cho `role=group` bao ngoài); AC18 mốc "không reload" đặt **sau** khi về từ callback (OAuth là full navigation) + đếm sự kiện `load` = 0; spec vi seed goal tên "Mục tiêu cloud" vì scanner vi bắt tên người dùng khớp mẫu `{{count}} goal`.
- **D11 (mới) — focus sau khi đóng dialog.** `dialog.close()` chạy trong effect của dialog và trả focus về phần tử mở (nút Sign out đã bị gỡ) **sau** rAF focus h2 → đôi khi mất focus. Nay Settings/SyncFeedback focus trong effect chạy sau khi dialog đã đóng (child effect trước) rồi rAF. Hành vi DESIGN §8.1 không đổi.
- **D12 (mới) — `tests/db` không `seedRaw`.** Trên Postgres thật trigger đặt `user_id := auth.uid()`/`server_updated_at` và check constraint chặn hàng sai, nên `ContractHarness.seedRaw` thành tuỳ chọn: phần contract cần seed thô bỏ qua trên DB thật (có ghi chú), thay bằng test "server từ chối hàng sai (400), push sai → `RemoteError SYNC_UNREACHABLE`". Fake/mock vẫn chạy đủ.
- Mock Supabase `/__test/token` thêm `email`/`name` (ghi đè danh tính, `sub` giữ nguyên) để test có thể tạo phiên **hợp lệ** với danh tính tuỳ ý — cần cho QC re-target (mục 9.2).
- Bundle: zod nay là chunk `schemas-*.js` (34,6 kB gzip) được modulepreload (dùng chung import backup + mapper) thay vì nằm trong entry; tổng entry + preload ≈ 239,5 kB (M6: 228,8) vẫn ≤ 250.

## 8. Known issues và giới hạn

- `tests/db/remote-store.test.ts` và `rls.test.ts` chưa chạy trên Postgres thật (không Docker). Cách chạy khi có Docker: `npm run db:start` → `npx --yes supabase@2.120.0 status` → export `SUPABASE_TEST_PUBLISHABLE_KEY`, `SUPABASE_TEST_SECRET_KEY` → `npm run test:db`.
- Điểm khác đã biết mock ↔ Supabase thật: mock cho phép seed hàng sai/`server_updated_at` tuỳ ý (test NFR-05); Supabase thật từ chối bằng check constraint → app không bao giờ thấy hàng sai từ server thật, nhưng `mapper` vẫn lọc (phòng thủ). Mock `signOut` giống SDK (không gọi `/logout` với `scope: local`).
- Hai tab cùng thiết bị: Web Locks `opb-sync` đảm bảo một chu kỳ; trình duyệt không có Web Locks (`noLocks`) → cả hai chạy, kết quả vẫn hội tụ (AC6 f).
- Token giả (không do mock ký) nay bị REST từ chối 401 → card `expired` ngay sau chu kỳ đầu (đúng với Supabase thật) — ảnh hưởng test QC M6 dùng `forgeSession` (mục 9.2).
- M6-D1 đã fix ở WIP: test QC `tests/qc/cloud/m6-r1-flow.spec.ts:81` có `test.fail` giờ báo "Expected to fail, but passed" → QC gỡ marker.
- Brand assets: tích hợp ở commit riêng `feat(brand)` sau M7 (xem mục "Brand assets" nếu có).

## 9. Dispute

### 9.1 Test QC assert hard delete trên hàng thô Dexie (trái ADR-20 / M7-T1 xoá mềm — quyết định orchestrator 2026-10-12: QC re-target, không tính defect)

Vitest (3 — đúng 3 test làm `npm run check` exit 1):
1. `tests/qc/m1-domain.test.ts` "deleteWithEntries removes entries of that goal only and rolls back on failure": `db.entries.where('goalId').equals(a).count()` kỳ vọng 0, `db.goals.count()` 1 — v2 giữ tombstone; inject lỗi qua `db.goals.delete` (v2 không gọi `delete`).
2. `tests/qc/m3-r1-domain.test.ts` "import racing a timer save…": `db.goals.count()` kỳ vọng 5 — "Racer" còn dạng tombstone (6).
3. `tests/qc/m3-r1-domain.test.ts` "Save racing deletion of the goal in another tab": `db.entries.where('goalId').equals('g1').count()` kỳ vọng 0 — 8 tombstone.

Playwright project `chromium` (9 — cùng nguyên nhân, đọc IndexedDB thô qua `dbAll`/`kvGet`):
4. `tests/qc/m1-qc-flows.spec.ts:152` AC9 delete — `remaining` kỳ vọng 0 (1 tombstone).
5. `tests/qc/m2-qc.spec.ts:162` AC5 — `dbAll('goals')` kỳ vọng 1 (goal đã xoá còn tombstone).
6. `tests/qc/m3-r1.spec.ts:281` Delete from Goal detail — entries của g2 kỳ vọng 0 (13 tombstone).
7. `tests/qc/m3-r1.spec.ts:435` D3 import file rỗng — `dbAll('goals')` kỳ vọng 0 (5 tombstone).
8. `tests/qc/m5-r1-flows.spec.ts:249` Delete from Goal detail — entries kỳ vọng [] (tombstone).
9–12. `tests/qc/final-journey.spec.ts:99` (4 biến thể en/vi × 1440/360) bước "delete all" — `{goals: 0, entries: 0}` nhận `{2, 4}` tombstone.

Đề nghị: đọc qua repository hoặc lọc `deletedAt == null` (như `src/data/dexie/repos.test.ts`, `soft-delete.test.ts`). Hành vi người dùng thấy không đổi (M7-AC2).

### 9.2 Test QC M6 giả phiên bằng token không ký (`forgeSession`) — M7 làm REST trả 401 → `expired` (đúng thiết kế FR-40 / NFR-15)

`tests/qc/cloud/m6-r1-ui.spec.ts`: 10 test "identity rendering at 360 px" (5 danh tính × en/vi, dòng 54), "D4 fits the viewport 640x360" (dòng 142), "Settings card order … 1440px" (dòng 174). Token `forged.access.token` không qua chữ ký của mock (và của Supabase thật) → chu kỳ sync đầu nhận 401 → card `expired` → các assert về avatar/nút Sign out fail. Phần "no horizontal scroll" đã **pass** sau fix CSS A10 (email dài trong khối "Sign in again" — lỗi thật, đã sửa). Đề nghị QC re-target: lấy phiên hợp lệ với danh tính tuỳ ý qua `GET /__test/token?user=u1&email=<email>&name=<name>` (`name=` rỗng = không có tên) rồi ghi vào `localStorage['opb-auth']` như `forgeSession` đang làm.

### 9.3 Test QC M6 kỳ vọng toast "Signed in as …" khi máy đã có dữ liệu

`tests/qc/cloud/m6-r1-flow.spec.ts:25` ("returnTo #/goals …"): tạo goal trước khi đăng nhập → M7 (DESIGN F11, D9) hiện toast gộp "Signed in. Your account now has 1 goal, 0 entries." thay cho "Signed in as minh.test@example.com". Dev đã đổi spec của mình tương ứng (`e2e/cloud/m6-auth.spec.ts:29`, `m6-i18n.spec.ts:32`). Đề nghị QC đổi chuỗi kỳ vọng (hoặc đăng nhập trên máy sạch nếu muốn giữ "Signed in as").

### 9.4 `tests/qc/cloud/m6-r1-flow.spec.ts:81` — M6-D1 đã fix

Test gắn `test.fail(true, …)` nay "Expected to fail, but passed" → QC gỡ marker (report M6 r1 §4 đã dự kiến).

## Brand assets (commit riêng `feat(brand)`, sau commit M7, theo chỉ dẫn orchestrator 2026-10-12)

- Nguồn: bộ icon orchestrator tạo từ logo sản phẩm (logo gốc `logo/`, git-ignored). Copy đè `public/icons/pwa-192.png`, `pwa-512.png` (logo 92 % trên nền trắng), `pwa-maskable-512.png` (72 %, vùng an toàn), `public/apple-touch-icon.png` (180, nền trắng), `public/favicon.svg` (bọc PNG 64 trong suốt); thêm `public/favicon-32.png`, `public/brand-mark-96.png` (trong suốt).
- `index.html`: thêm `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">` (Vite viết lại theo `base`, đã kiểm `dist-cloud-e2e/index.html` → `/one-percent-better/favicon-32.png`). `vite.config.ts` `includeAssets` thêm `favicon-32.png`, `brand-mark-96.png`; manifest icons không đổi (192/512/maskable — `e2e/m1-pwa.spec.ts`, `tests/qc/m1-qc.spec.ts` pass); precache 27 → **31 entry, 1 772 KiB** (pwa-512 170 KB, maskable 111 KB; không có test ngưỡng kích thước precache; không hạ chất lượng dưới 512 px).
- `AppShell` `.mark`: `<img src={BASE_URL + 'brand-mark-96.png'} width=28 height=28 alt="" decoding="async">` trong `<span class="mark" aria-hidden>`; CSS `.mark` 32 × 32, `background: #fff`, `border-radius: 9px`, `padding: 2px` ở **cả hai theme** (chữ logo màu đen), `img` `object-fit: contain`; `aria-label={app.name}` trên NavLink giữ nguyên. Brand chỉ hiện ở sidebar ≥ 1024 px (tab bar mobile không có brand, như cũ) → 360 px không đổi (nav 57 px, không cuộn ngang; ảnh chụp light/dark 360 và 1280 light/dark đã kiểm bằng mắt).
- `scripts/gen-icons.mjs`: không vẽ nữa — chỉ copy từ `logo/<tên file>` nếu tồn tại, ngược lại in hướng dẫn và thoát 0 (`npm run icons` đã chạy thử: "nothing to do"). README mục "Brand assets" thay mục "Icons".
- ESLint: rule "Hardcoded accessible text" nay cho phép literal **rỗng** (`alt=""` ảnh trang trí, không có chữ để dịch); probe `alt="Hello"` vẫn báo lỗi (exit 1).
- Kiểm: lint/typecheck xanh; Vitest SyncIndicator/Settings.sync/i18n 46/46; Playwright cloud `m7-i18n` (360 px vi, axe), `m6-lazy`, QC `m6-r1-ui` "axe light/dark" + privacy → 8/8; chromium `m1-pwa`, QC `m1-qc` (manifest), `m2-notify` (icon `/icons/pwa-192.png`), `m1-today` → 40/40.
- **Deviation so với DESIGN §5 Brand:** mark là ảnh logo trên ô trắng thay vì ô xanh `--primary` chữ "1%"; designer cập nhật DESIGN sau (orchestrator đã chấp nhận).

## Fix log

(chưa có)
