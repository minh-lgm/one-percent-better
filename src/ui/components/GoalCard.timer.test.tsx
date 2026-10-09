import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '../../i18n/resources/en.json';
import { buildGoal } from '../../test/builders';
import { renderWithLocale } from '../../test/render-with-locale';
import type { TestContainer } from '../../test/container';
import { GoalCard, type GoalTimerState, type StartTimerResult } from './GoalCard';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

const noop = async () => ({ ok: true }) as const;

/** Parent stand-in: `api.setTimer` plays the role of the (possibly delayed) live query. */
function Harness({ initial, onStartTimer, api }: { initial: GoalTimerState; onStartTimer: () => Promise<StartTimerResult>; api: { setTimer: (t: GoalTimerState) => void } }) {
  const [timer, setTimer] = useState<GoalTimerState>(initial);
  api.setTimer = (t) => act(() => setTimer(t));
  return (
    <ul>
      <GoalCard goal={buildGoal({ id: 'g1', name: 'Read' })} target={30} minutes={0} entries={[]} timer={timer} onAdd={noop} onUpdate={noop} onDelete={async () => undefined} onStartTimer={onStartTimer} />
    </ul>
  );
}

async function mount(initial: GoalTimerState, onStartTimer: () => Promise<StartTimerResult>) {
  const api = { setTimer: (_t: GoalTimerState) => {} };
  const view = await renderWithLocale(<Harness initial={initial} onStartTimer={onStartTimer} api={api} />);
  tc = view.tc;
  const article = screen.getByRole('article', { name: 'Read' });
  const start = () => within(article).getByRole('button', { name: en.goalCard.startTimer });
  return { api, article, start };
}

describe('GoalCard Start guard (M2-D4 regression, deterministic)', () => {
  it('a second click before the parent reflects the running timer is ignored; the guard is released by the prop, not by time', async () => {
    const user = userEvent.setup();
    const onStartTimer = vi.fn(async (): Promise<StartTimerResult> => ({ ok: true }));
    const { api, article, start } = await mount('none', onStartTimer);

    await user.dblClick(start());
    expect(onStartTimer).toHaveBeenCalledTimes(1);
    // The parent has not re-rendered yet (live query still pending): a third click is still a no-op.
    await user.click(start());
    expect(onStartTimer).toHaveBeenCalledTimes(1);
    expect(within(article).queryByRole('alert')).toBeNull();

    // Parent catches up → running; later the timer is discarded → the guard must be released again.
    api.setTimer('running');
    expect(within(article).getByText(en.goalCard.timerRunningBadge)).toBeInTheDocument();
    api.setTimer('none');
    await user.click(start());
    expect(onStartTimer).toHaveBeenCalledTimes(2);
  });

  it('a failed start releases the guard so the user can retry', async () => {
    const user = userEvent.setup();
    const onStartTimer = vi
      .fn<() => Promise<StartTimerResult>>()
      .mockResolvedValueOnce({ ok: false, errors: [{ code: 'GOAL_NOT_ACTIVE', message: '' }] })
      .mockResolvedValue({ ok: true });
    const { article, start } = await mount('none', onStartTimer);
    await user.click(start());
    expect(await within(article).findByRole('alert')).toHaveTextContent(en.errors.GOAL_NOT_ACTIVE);
    await user.click(start());
    expect(onStartTimer).toHaveBeenCalledTimes(2);
    expect(within(article).queryByRole('alert')).toBeNull();
  });

  it("does not call start when another goal's timer runs (aria-disabled) and shows the reason", async () => {
    const user = userEvent.setup();
    const onStartTimer = vi.fn(async (): Promise<StartTimerResult> => ({ ok: true }));
    const { start } = await mount('other', onStartTimer);
    expect(start()).toHaveAttribute('aria-disabled', 'true');
    expect(start()).toHaveAccessibleDescription(en.goalCard.timerDisabled);
    await user.click(start());
    expect(onStartTimer).not.toHaveBeenCalled();
  });
});
