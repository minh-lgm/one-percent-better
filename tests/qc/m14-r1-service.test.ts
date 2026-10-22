// QC M14 round 1 - exploratory service-level cases around AuthService.deleteAccount / SyncService pause that the
// developer's suites do not cover: double invocation, a local failure after the server already deleted the account,
// an account whose Apple identity is only known from kv, and sign-in with a provider that is not available.
import { afterEach, describe, expect, it } from 'vitest';
import { DexieLocalDataRepository } from '../../src/data/dexie/local-data-repo';
import { buildEntry, buildGoal } from '../../src/test/builders';
import { createTestContainer, type TestContainer } from '../../src/test/container';
import { USER1 } from '../../src/test/fake-auth-port';

let tc: TestContainer | undefined;
afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

type Options = Parameters<typeof createTestContainer>[0];
async function signedIn(options: Options = {}, providers: Array<'google' | 'apple'> = ['google']) {
  tc = await createTestContainer({ cloud: true, authStored: true, ...options });
  tc.auth!.port.session = { ...USER1, providers };
  await tc.container.db.kv.put({ key: 'sync', value: { userId: USER1.userId, lastUserId: USER1.userId, account: { email: USER1.email, name: USER1.name } } });
  await tc.container.db.goals.put(buildGoal({ id: 'g1', name: 'Read' }));
  await tc.container.db.entries.put(buildEntry({ id: 'e1', goalId: 'g1', minutes: 20 }));
  await tc.container.authService.init();
  await tc.container.authService.settled();
  return tc;
}

describe('QC M14: deleteAccount exploratory', () => {
  it('two overlapping calls (double tap that bypasses the UI busy guard): the server is asked at most twice, the end state is signed-out and consistent', async () => {
    await signedIn();
    const { deletion } = tc!.auth!;
    let release: () => void = () => undefined;
    deletion.gate = new Promise<void>((r) => (release = r));
    const a = tc!.container.authService.deleteAccount({ keepData: false });
    const b = tc!.container.authService.deleteAccount({ keepData: false });
    await new Promise((r) => setTimeout(r, 10));
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(tc!.container.authService.state()).toEqual({ kind: 'signed-out' });
    expect(tc!.container.syncService!.isPausedForDeletion()).toBe(false);
    expect(await tc!.container.db.goals.count()).toBe(0);
    // Document what happened: both succeeded against the fake (the fake has no memory of deletion).
    expect([ra.ok, rb.ok]).toContain(true);
    expect(deletion.calls.length).toBeLessThanOrEqual(2);
  });

  // M14-D2 (Minor): known defect, kept as an expected failure until fixed.
  it.fails('server deleted the account but wiping local data throws: the state must not stay signed-in on a dead account, and the call must not throw', async () => {
    await signedIn();
    const proto = DexieLocalDataRepository.prototype;
    const original = proto.clearUserData;
    proto.clearUserData = async () => {
      throw new Error('IndexedDB blocked');
    };
    let thrown: unknown = null;
    try {
      await tc!.container.authService.deleteAccount({ keepData: false });
    } catch (e) {
      thrown = e;
    } finally {
      proto.clearUserData = original;
    }
    // Observed: deleteAccount rejects with "IndexedDB blocked" and the state stays signed-in (kv sync.userId already null).
    expect(thrown).toBeNull();
    expect(tc!.container.authService.state().kind).toBe('signed-out');
  });

  it('Apple identity known only from kv (session carries no providers): D6 still deletes, hadApple is false (no sheet), nothing crashes', async () => {
    await signedIn({ native: 'ios', idTokens: true }, ['google']);
    (tc!.auth!.port.session as { providers?: unknown }).providers = undefined;
    await tc!.container.db.kv.put({ key: 'sync', value: { userId: USER1.userId, lastUserId: USER1.userId, account: { email: USER1.email, name: USER1.name, provider: 'apple' } } });
    const r = await tc!.container.authService.deleteAccount({ keepData: true });
    expect(r.ok).toBe(true);
    expect(tc!.auth!.idTokens!.count('getIdToken', 'apple')).toBe(0);
  });

  it('signIn(google) when native Google is unavailable falls back to the PKCE redirect (documented behaviour behind M14-D1: the UI must not offer that button on iOS)', async () => {
    tc = await createTestContainer({ cloud: true, native: 'ios', idTokens: true });
    tc.auth!.idTokens!.providers.delete('google');
    await tc.container.authService.init();
    await tc.container.authService.settled();
    await tc.container.authService.signIn('#/settings', 'google');
    expect(tc.auth!.idTokens!.count('getIdToken', 'google')).toBe(0);
    expect(tc.auth!.port.calls.signIn).toBe(1);
  });
});
