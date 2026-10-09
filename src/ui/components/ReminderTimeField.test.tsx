import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReminderTimeField } from './ReminderTimeField';

function setup(value = '20:00') {
  const onCommit = vi.fn(async () => undefined);
  const onSettled = vi.fn();
  const view = render(<ReminderTimeField id="t" label="Reminder time" value={value} onCommit={onCommit} onSettled={onSettled} settleMs={50} />);
  const input = screen.getByLabelText('Reminder time') as HTMLInputElement;
  const rerender = (next: string) => view.rerender(<ReminderTimeField id="t" label="Reminder time" value={next} onCommit={onCommit} onSettled={onSettled} settleMs={50} />);
  return { input, onCommit, onSettled, rerender };
}

describe('ReminderTimeField (M2-D1 regression)', () => {
  it('while focused, the input mirrors what the browser reports and the stored value never overwrites the draft', () => {
    const { input, onCommit, rerender } = setup('20:00');
    fireEvent.focus(input);
    // Half-typed hour segment: the browser reports '' — not saved, not reset to 20:00.
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    expect(onCommit).not.toHaveBeenCalled();
    // Intermediate valid value is saved immediately…
    fireEvent.change(input, { target: { value: '19:00' } });
    expect(onCommit).toHaveBeenCalledWith('19:00');
    // …the user keeps typing before the store echoes 19:00 back:
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: '07:30' } });
    expect(onCommit).toHaveBeenLastCalledWith('07:30');
    // The late live-query echo of the earlier value must not clobber the draft (this was M2-D1).
    rerender('19:00');
    expect(input.value).toBe('07:30');
    rerender('07:30');
    expect(input.value).toBe('07:30');
    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  it('settles once (single toast) after the value stops changing or on blur', async () => {
    const { input, onCommit, onSettled, rerender } = setup('20:00');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '19:00' } });
    fireEvent.change(input, { target: { value: '15:00' } });
    fireEvent.change(input, { target: { value: '07:30' } });
    expect(onSettled).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 120));
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledTimes(3);

    fireEvent.change(input, { target: { value: '08:00' } });
    fireEvent.blur(input);
    expect(onSettled).toHaveBeenCalledTimes(2);
    // After blur the field shows the stored value again.
    rerender('08:00');
    expect(input.value).toBe('08:00');
    rerender('09:15');
    expect(input.value).toBe('09:15');
  });

  it('does not commit the same value twice or an invalid value', () => {
    const { input, onCommit } = setup('20:00');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '20:00' } });
    fireEvent.change(input, { target: { value: '25:00' } });
    fireEvent.change(input, { target: { value: 'x' } });
    expect(onCommit).not.toHaveBeenCalled();
  });
});
