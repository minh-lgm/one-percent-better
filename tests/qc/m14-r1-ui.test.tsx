// QC M14 round 1 - the Google button when Google native sign-in is NOT available (VITE_GOOGLE_* missing, as in the
// ios.yml `simulator` lane). TASKS M14-T2: "thieu -> Google native khong kha dung, nut Google an tren native"; dev handoff
// section 8: "Thieu hai VITE_GOOGLE_* -> app iOS chi co nut Apple (Google native an), khong loi".
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import en from '../../src/i18n/resources/en.json';
import { createTestContainer, type TestContainer } from '../../src/test/container';
import { FakeIdTokenProvider } from '../../src/test/fake-id-token-provider';
import { renderWithLocale } from '../../src/test/render-with-locale';
import { AccountCard } from '../../src/ui/components/AccountCard';

let tc: TestContainer | undefined;
afterEach(async () => {
  cleanup();
  await tc?.dispose();
  tc = undefined;
});

const noop = () => undefined;

describe('QC M14: iOS build without Google client ids', () => {
  // M14-D1: fixed in 6e6a175 (capabilities.googleSignIn); round 2 keeps it as a normal test.
  it('signed-out card on iOS where only Apple is available shows the Apple button and NO Google button', async () => {
    const sheets = new FakeIdTokenProvider(['apple']); // google unavailable, exactly what createSocialLogin reports without the two ids
    tc = await createTestContainer({ locale: 'en', cloud: true, native: 'ios', idTokens: sheets });
    await renderWithLocale(<AccountCard auth={{ kind: 'signed-out' }} online onSignIn={noop} onSignOut={noop} onDismissError={noop} onDeleteAccount={noop} onDismissRevoke={noop} revokePanel={false} />, 'en', { container: tc });
    expect(screen.queryByRole('button', { name: en.auth.signInApple })).not.toBeNull();
    expect(screen.queryByRole('button', { name: en.auth.signInGoogle })).toBeNull();
  });

  it('control: with both providers available the card shows Apple above Google', async () => {
    tc = await createTestContainer({ locale: 'en', cloud: true, native: 'ios', idTokens: true });
    await renderWithLocale(<AccountCard auth={{ kind: 'signed-out' }} online onSignIn={noop} onSignOut={noop} onDismissError={noop} onDeleteAccount={noop} onDismissRevoke={noop} revokePanel={false} />, 'en', { container: tc });
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(expect.arrayContaining([en.auth.signInApple, en.auth.signInGoogle]));
  });
});
