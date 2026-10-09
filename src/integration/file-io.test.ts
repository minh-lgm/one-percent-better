// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { downloadTextFile, ICS_MIME_TYPE } from './file-io';

describe('downloadTextFile', () => {
  it('creates an object URL, clicks a hidden download link and revokes the URL', () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:fake');
    const revokeObjectURL = vi.fn();
    const clicks: HTMLAnchorElement[] = [];
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      clicks.push(this);
    };
    let revoke: (() => void) | undefined;
    try {
      downloadTextFile('1percent-better-reminder.ics', 'BEGIN:VCALENDAR\r\n', ICS_MIME_TYPE, {
        document,
        createObjectURL,
        revokeObjectURL,
        setTimeout: (fn) => {
          revoke = fn;
        },
      });
    } finally {
      HTMLAnchorElement.prototype.click = originalClick;
    }
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe(ICS_MIME_TYPE);
    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe('1percent-better-reminder.ics');
    expect(clicks[0].href).toBe('blob:fake');
    expect(clicks[0].isConnected).toBe(false);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    revoke?.();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });
});
