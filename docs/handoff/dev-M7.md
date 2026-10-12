# Dev handoff — M7 Đồng bộ offline-first (WIP checkpoint — 2026-10-12, user tắt máy)

**Trạng thái: WIP, chưa xong.** Developer kế tiếp resume từ mục "Việc còn lại" (cuối file). Code hiện tại: lint + typecheck sạch; `vitest` 990/993 pass (3 fail là test QC cũ bị tranh chấp — mục 9); build cloud OK; E2E M7 **đã viết nhưng chưa chạy lần nào**.

Nguồn: TASKS v2.1 M7-T1…T6 / AC1…AC19, ARCH v2.1 §4.1–4.4, §5.2, §5.3, §5.10, §5.11, ADR-20/21/25, DESIGN v2.0 §2 F11/F13, §4 S7 A5–A10 + D3/D4/D5, §5 SyncIndicator, §7.2/7.3/7.7, §8.1.

## 1. Tóm tắt (những gì đã làm)

- **T1 Dexie v2 + xoá mềm + dirty + prefs (DONE):** `db.ts` version(2) (`goals: id, dirty`, `entries: …, dirty`) + `upgradeToV2` (rows → `deletedAt: null, dirty: 1`; kv `prefsSync` theo A-36, mốc `1970-01-01T00:00:00.000Z`); `upgradeProbe` test seam. `goal-repo`/`entry-repo`/`timer-repo`/`backup-repo`/`local-data-repo` xoá mềm, lọc tombstone + entry của goal đã xoá (đọc trong cùng transaction), `clock` qua constructor. `prefs-repo.ts` (`DexieSyncedPrefsRepository`). `domain/sync.ts` (`nextUpdatedAt`, `resolveIncoming`, `sameVersion`, `resolvePrefGroup`, `rewindCursor`, `backoffMs`, `SyncStatus`). `GoalService.update/setArchived`, `EntryService.update` dùng `nextUpdatedAt`; `SettingsService`/`LocaleService` nhận `prefs?` + `clock`; `BackupService(…, isSignedIn)` stamp `updatedAt` khi đã đăng nhập; `replaceAll` = xoá mềm hàng không có trong file + `bulkDelete` id trong file + `bulkAdd` (giữ reject trùng id) + `prefsSync.reminder` dirty.
- **T2 LocalSyncStore (DONE):** `data/dexie/sync-store.ts` (`getDirty`, `applyRemote` 1 transaction/lô + cascade tombstone goal → entry, cùng version → chỉ hạ dirty (nội dung khác → lấy bản server), `markAllDirty`, `tombstoneOrphanEntries`, `countDirty` (+ nhóm prefs dirty), `watchPendingCount`). Kiểu `GoalRow/EntryRow/SyncRecord/RemoteChanges/ApplyResult/LocalSyncStore/PrefsSyncState/RemotePrefs/SyncedPrefsRepository` trong `repositories.ts`.
- **T3 RemoteStore (DONE):** `services/remote-store.ts` (interface, `RemoteError`, `PullPage` có `serverUpdatedAt`, `PulledPrefs {prefs, skippedInvalid}`), `integration/supabase/mapper.ts` (zod, snake↔camel, chuẩn hoá timestamp), `SupabaseRemoteStore` trong `supabase-client.ts` (upsert lô ≤ 500 `onConflict user_id,id`, `fetchByIds` lô ≤ 100, `pull` keyset `or=(server_updated_at.gt…,and(…))` + `limit+1` → hasMore, timeout 20 s qua `abortSignal`, map lỗi 401/403 → UNAUTHORIZED, 0/abort → UNREACHABLE, network → OFFLINE, khác → UNREACHABLE; `pushPrefs` upsert `onConflict user_id` + `select`, `[]` → đọc lại), `createSupabaseRemoteStore`, `loader.createRemoteLoader` (dùng chung client SDK). `test/fake-remote-store.ts` (`FakeRemoteServer` + `FakeRemoteStore`, cùng quy tắc trigger, validate bằng mapper thật). Bộ hợp đồng `services/remote-store.contract.ts` chạy với Fake (`src/test/fake-remote-store.test.ts`) và Supabase→mock (`src/integration/supabase/remote-store.test.ts`) — **xanh**. Mock REST trong `e2e/mock-supabase/server.mjs` (`/rest/v1/goals|entries|settings`, filter `eq/in/or`, `order`, `limit`, LWW như trigger, RLS theo JWT `sub`, check constraint → 400; `/__test/seed` nhận camelCase/snake; `/__test/rows`; `/__test/token?user=`; `/__test/fail?...&delay=`, `?clear=1`; log có `rows` = kích thước lô). `tests/db/remote-store.test.ts` **chưa viết** (hợp đồng với Supabase local — không Docker, NV-2).
- **T4 SyncService + scheduler (DONE, chưa E2E):** `services/sync-service.ts` (chu kỳ push → fetchByIds → applyRemote (≤ 20 lô) → pull goals/entries theo cursor (rewind 120 s đầu chu kỳ, cursor ghi sau mỗi trang) → `tombstoneOrphanEntries` → **push lại nếu còn dirty** (để A,B,A hội tụ) → prefs push/pull → `lastSyncedAt`; backoff 30…900 s với `timers` dep; single-flight trong tab (`manual/sign-in/sign-out` chờ chu kỳ đang chạy rồi chạy, trigger khác → `skipped busy` + rerun 1 lần); `LockPort` `opb-sync`; 401 → `auth.onUnauthorized` (AuthService.expire) + paused; `watchStatus`, `onEvent` (`merge-done`, `prefs-applied`), `watchMergePrompt`, `prepareFirstSignIn`/`handleSignedIn`/`confirmMerge`/`cancelMerge`, `finalSyncBeforeSignOut` (10 s), `reset`, `pause`). `services/lock-port.ts` (`noLocks`, `MemoryLockPort`), `integration/web-locks.ts`. `app/sync-scheduler.ts` (sign-in/startup, online, visibilitychange, debounce 2000 ms theo pending tăng, interval khi visible; signed-out → reset, expired → pause) nối trong `main.tsx`. `container.ts`: prefs repo, `syncService` (null khi cloud tắt), watch kv `locale` → `setLocale` ngay, `dispose()`. `AuthService`: fix **M6-D1** (callback hỏng khi có phiên hợp lệ giữ `signed-in`, chỉ toast lỗi), `expire()`, `signOut({ preserveLastUserId })`, `applySignedIn` ghi `lastUserId` khi đổi tài khoản không đăng xuất, `clearPkceVerifier` dep. `test/two-devices.ts`, `services/sync-convergence.test.ts` (a–f + prefs + **20 seed × 200 thao tác xanh**, seed 20261009…20261028), `services/sync-service.test.ts`, `app/sync-scheduler.test.ts`.
- **T5 UI (DONE, chưa E2E):** `SyncIndicator.tsx` (6 trạng thái, `indicatorState`, vùng `sr-only role=status aria-live=polite` debounce 1 s, chỉ báo khi vào error/offline/expired và khi về synced sau đó), `StatusRow.tsx` trong `AppShell` (thay OfflineChip khi signing-in/signed-in/expired), `AccountCard` A5–A9 (dl Last synced/Waiting, `Sync now` aria-disabled khi syncing / disabled khi offline + `settings.account.offlineSync`, Alert `errors.SYNC_*` + `nextRetry`, dòng `SYNC_REMOTE_INVALID`), `SignOutDialog` (pending/online/syncFailed → khối cảnh báo, `role=status` luôn trong DOM, `Remove anyway`), `MergeAccountDialog` (D5), `SyncFeedback` (toast mergeDone/prefsFromAccount + D5), `Settings` (Sync now → toast `syncNowDone`; đăng xuất: `finalSyncBeforeSignOut` khi online & pending > 0, Remove còn pending → `syncFailed` + Remove anyway; D3 biến thể đã đăng nhập + `import.offlineNote`; syncNote Language/Reminders; `settings.permission.defaultOnDesc`; Backup desc/importHint signed-in). i18n: toàn bộ key M7 của DESIGN §7.2/7.3/7.7 đã vào `en.json`/`vi.json` (parity xanh; `_one` chỉ ở en). `format.ts`: `clock`, `syncedShort`, `syncedAt`; `CountKey` thêm `format.changesCount`, `sync.indicator.waiting/offline`, `auth.signOut.unsynced`. Icon `cloudCheck/cloudDot/cloudOff/warn`. CSS `.status-row`, `.sync.*`, `.account .dl`, `.sync-note`, D4/D5.
- **M6-P1:** ESLint chặn `import('@supabase/…')` và `import('…supabase-client')` ngoài `src/integration/supabase/**` (selector `ImportExpression`, probe đã kiểm exit 1); PKCE verifier được xoá sau `exchangeCode` (thành công hay lỗi) và sau callback lỗi.
- **E2E (ĐÃ VIẾT, CHƯA CHẠY):** `e2e/m7-migration.spec.ts` (chromium), `e2e/cloud/m7-merge.spec.ts` (AC7, AC12), `m7-sync.spec.ts` (AC8, AC9, AC10, AC13), `m7-import-perf.spec.ts` (AC11, AC14), `m7-prefs.spec.ts` (AC18), `m7-i18n.spec.ts` (AC15). Fixture `e2e/cloud/fixtures.ts` thêm `device()` (context thứ hai cùng partition UA) và `MockApi.seed/rows/liveRows/clearFailures`; `helpers.ts` thêm `C1`, `syncIndicator`, `expectSyncState`, `syncNow`, `pendingCount`, `collectErrors`. `tsc -p tsconfig.node.json` và eslint e2e đã sạch.

## 2. Task

| ID | Trạng thái | Ghi chú |
| :- | :- | :- |
| M7-T1 | DONE (unit) | migration-v2.test (6), soft-delete.test (6), prefs-repo.test (9), repos/backup/timer test đã cập nhật sang xoá mềm |
| M7-T2 | DONE (unit) | sync-store.test (8) |
| M7-T3 | DONE trừ `tests/db/remote-store.test.ts` (TODO, NV-2) | contract Fake + mock xanh; mapper.test (4); remote-store.test (7) |
| M7-T4 | DONE (unit) | sync-service.test (17), sync-convergence.test (28), sync-scheduler.test (4), auth-service.test +6, backup-service.test +1 |
| M7-T5 | DONE (component) | SyncIndicator.test (5), MergeAccountDialog.test (3), SignOutDialog.m7.test (4), AccountCard.sync.test (7), Settings.sync.test (9) |
| M7-T6 | DOING | spec đã viết, **chưa chạy**; README chưa cập nhật; handoff này là WIP |

## 3. Lệnh và kết quả lần chạy cuối (2026-10-12 ~17:50)

- `npm run lint` exit 0; `npm run typecheck` exit 0.
- `npm test`: **990 pass / 3 fail** — 3 fail đều là test QC cũ (mục 9), không phải code lỗi.
- `npm run build` + `npm run build:cloud-e2e` OK. Số đo cloud: `index-*.js` 636,6 kB / **197,0 kB gzip**; modulepreload: `types-*` (?), `useFormat-*` 6,77, `preload-helper-*` 0,81, `schemas-*` (?) — **cần cộng gzip của `types-*.js` và `schemas-*.js`** (chunk mới tách ra, chưa đo) để kết luận ≤ 250 kB; SDK `supabase-client-*.js` 222,9 kB / 57,7 kB gzip chunk riêng.
- `npm run test:e2e`: **CHƯA CHẠY** sau M7 (cả chromium lẫn cloud). Rủi ro: StatusRow/SyncFeedback mới trong AppShell có thể ảnh hưởng spec M6 (`tests/qc/cloud/*`), axe, 360 px.
- `npm run bench`: chưa chạy lại sau xoá mềm (cần < 200 ms).

## 4–6. Cách chạy / Tự kiểm AC

Chưa tự kiểm AC bằng E2E. Cách chạy demo như M6 (mock + `build:cloud-e2e` + `preview:cloud-e2e`), hai cửa sổ = hai profile/context. Bảng AC sẽ điền ở bản handoff đầy đủ.

## 7. Deviations (tạm)

- D1: `pull()` là keyset **chính xác**; cửa sổ lùi 120 s áp ở đầu chu kỳ bởi `SyncService` (`rewindCursor`) — nếu áp trong `pull` thì phân trang > 500 hàng trong cùng 120 s sẽ lặp vô hạn.
- D2: `pullPrefs()` trả `{ prefs, skippedInvalid }` (ARCH ghi `RemotePrefs | null`) để đếm nhóm sai.
- D3: Chu kỳ push **lại** sau bước dọn nếu còn dirty (ARCH nói "đẩy ở chu kỳ sau") để "sync A, B, A" hội tụ với dirty = 0.
- D4: `AuthService.signOut` có `preserveLastUserId` (D5 Cancel) và `applySignedIn` ghi `lastUserId` khi đổi tài khoản không qua đăng xuất.
- D5: `renderWithLocale` dùng RTL `wrapper` (rerender giữ provider).
- D6: `Sync now` chỉ `disabled` khi offline (DESIGN "Loading" nói vô hiệu khi SDK đang nạp — không có tín hiệu riêng; chu kỳ sẽ chờ `authService.settled()`).
- D7: AC7 "Đăng nhập lại u1 sau Sign out (Keep) → không D5" hiểu là ngay sau khi rời u1 (same-user); sau khi đã gộp vào u2 rồi quay lại u1 thì có D5 (lastUserId = u2).
- D8: AC12 "upsert trước request logout": SDK `signOut({scope:'local'})` không gọi `/auth/v1/logout` (M6 D4) → spec chỉ kiểm upsert xảy ra và đăng xuất xong.

## 8. Known issues

- `tests/qc` 3 test fail (mục 9). `large-backup` chưa đo thời gian thật. Brand assets chưa tích hợp (xem Việc còn lại).

## 9. Dispute

Ba test QC cũ assert **hard delete trên hàng thô Dexie**, trái với ADR-20/M7-T1 (xoá mềm, tombstone giữ lại để lan truyền):
1. `tests/qc/m1-domain.test.ts` "deleteWithEntries removes entries of that goal only and rolls back on failure": `db.entries.where('goalId').equals(a).count()` kỳ vọng 0 và `db.goals.count()` 1; v2 giữ tombstone (2 entry, 2 goal); đồng thời inject lỗi qua `db.goals.delete` (v2 không còn gọi `delete`).
2. `tests/qc/m3-r1-domain.test.ts` "import racing a timer save…": `db.goals.count()` kỳ vọng 5 — goal "Racer" còn dưới dạng tombstone (6).
3. `tests/qc/m3-r1-domain.test.ts` "Save racing deletion of the goal in another tab": `db.entries.where('goalId').equals('g1').count()` kỳ vọng 0 — 8 tombstone.
Đề nghị QC re-target sang đọc qua repository/`deletedAt == null` (như dev đã làm với test của mình: `src/data/dexie/repos.test.ts`, `backup-repo.test.ts`, `timer-repo.test.ts`, `goal-service.test.ts`…). Hành vi người dùng thấy không đổi (M7-AC2 soft-delete.test.ts chứng minh).

## Việc còn lại (theo thứ tự, cho developer kế tiếp)

1. Đo bundle: `npm run build:cloud-e2e` rồi cộng gzip `index + useFormat + preload-helper + types + schemas` (chunk `types-*`/`schemas-*` mới xuất hiện vì `mapper.ts` import zod — nếu vượt 250 kB thì cân nhắc tách mapper vào chunk SDK: hiện `supabase-client.ts` import `./mapper` (zod) nên zod có thể bị kéo vào entry qua `domain/backup.ts` vốn đã dùng zod; kiểm `dist-cloud-e2e/index.html` modulepreload).
2. `npm run bench` (< 200 ms).
3. Chạy `npm run test:e2e` (3 webServer tự dựng; ~4–6 phút) → sửa spec M7 mới (chưa chạy lần nào, chắc chắn có lỗi selector/timing), rồi regression M1–M6 + `tests/qc` (chú ý `tests/qc/cloud/m6-r1-flow.spec.ts` có `test.fail` cho M6-D1 → giờ sẽ "unexpectedly passed" → QC gỡ marker; ghi vào handoff).
4. Viết `tests/db/remote-store.test.ts` (chạy `describeRemoteStoreContract` với Supabase local; `describe.skipIf`), NV-2.
5. README: mục "Account & sync (optional)" đầy đủ (cái gì đồng bộ, LWW, đăng xuất, project tạm dừng, khuyến nghị Export trước khi lên M7 = U0), "Testing cloud features" (hai thiết bị = hai context/profile; `device()` fixture).
6. Handoff đầy đủ: bảng AC1–AC19 (PASS/NOT VERIFIED + bằng chứng), số đo (large-backup, lô lớn nhất, bundle, bench), seed random, NV-2/3/5/6/7, hướng dẫn user U7/U8/U10 (U8: set secrets rồi push; U10 (6) kiểm bảng `settings`), M6-D1 đã fix (QC gỡ `test.fail`), mục "Brand assets".
7. Commit `feat(M7): …`.
8. **Brand assets (commit riêng `feat(brand): use product logo for icons, favicon and brand mark`)** theo message orchestrator: nguồn `C:\Users\ADMIN\AppData\Local\Temp\claude\D--minh-Coderschool-GitHub-one-percent-better\333da398-34cc-4af2-8c8d-1e9f3941e9cd\scratchpad\logo\` (pwa-192/512/maskable, apple-touch-icon, favicon.svg, favicon-32.png, favicon-64.png, brand-mark-96.png) — copy đè `public/icons/*`, `public/apple-touch-icon.png`, `public/favicon.svg`; thêm `public/favicon-32.png`, `public/brand-mark-96.png`; `index.html` thêm `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">`; `vite.config.ts` `includeAssets` thêm `favicon-32.png`, `brand-mark-96.png`; `AppShell` `.mark` → `<img src={`${import.meta.env.BASE_URL}brand-mark-96.png`} width="28" height="28" alt="">` (CSS bo góc 6 px, không tăng chiều cao nav; `.mark` hiện 32×32 nền primary); `scripts/gen-icons.mjs` đổi thành copy từ `logo/` nếu có, không tự vẽ đè; `logo/` đã có trong `.gitignore` (đã làm). Kiểm e2e PWA manifest + precache size; ghi deviation.

## Fix log

(chưa có)
