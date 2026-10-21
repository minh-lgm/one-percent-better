// M12-AC5: the native `FileExportPort` (ARCH §5.15, ADR-42) with @capacitor/filesystem and @capacitor/share mocked.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: vi.fn(async ({ path }: { path: string }) => ({ uri: `file:///cache/${path}` })) },
  Directory: { Cache: 'CACHE', Documents: 'DOCUMENTS' },
  Encoding: { UTF8: 'utf8' },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn(async () => ({ activityType: 'com.apple.DocumentManagerUICore.SaveToFiles' })) } }));

import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { BACKUP_MIME_TYPE } from '../../domain/backup-file';
import { ICS_MIME_TYPE } from '../../domain/ics';
import { datasetS1 } from '../../test/builders';
import { createTestContainer, type TestContainer } from '../../test/container';
import { createNativeFileExport, isShareCancellation } from './file-export';

let tc: TestContainer | undefined;
afterEach(async () => {
  vi.clearAllMocks();
  await tc?.dispose();
  tc = undefined;
});

describe('createNativeFileExport', () => {
  it('export S1: one writeFile into Directory.Cache (UTF-8) with the backup file name, then one share of that uri → shared', async () => {
    tc = await createTestContainer();
    const s1 = datasetS1();
    await tc.container.db.goals.bulkPut(s1.goals);
    await tc.container.db.entries.bulkPut(s1.entries);
    const { fileName, json } = await tc.container.backupService.export(new Date('2026-10-09T10:00:00+07:00'));

    const port = createNativeFileExport();
    await expect(port.saveText(fileName, json, BACKUP_MIME_TYPE)).resolves.toBe('shared');

    expect(Filesystem.writeFile).toHaveBeenCalledTimes(1);
    const write = vi.mocked(Filesystem.writeFile).mock.calls[0][0] as { path: string; data: string; directory: string; encoding: string };
    expect(write.path).toBe('1percent-better-backup-2026-10-09.json');
    expect(write.directory).toBe(Directory.Cache);
    expect(write.encoding).toBe(Encoding.UTF8);
    expect(JSON.parse(write.data)).toEqual(JSON.parse(json));
    expect(JSON.parse(write.data).goals).toHaveLength(5);

    expect(Share.share).toHaveBeenCalledTimes(1);
    const share = vi.mocked(Share.share).mock.calls[0][0];
    expect(share.files).toEqual(['file:///cache/1percent-better-backup-2026-10-09.json']);
    expect(share.title).toBe(fileName);
  });

  it('the user dismisses the share sheet ("Share canceled") → cancelled, nothing thrown', async () => {
    vi.mocked(Share.share).mockRejectedValueOnce(new Error('Share canceled'));
    const port = createNativeFileExport();
    await expect(port.saveText('x.ics', 'BEGIN:VCALENDAR', ICS_MIME_TYPE)).resolves.toBe('cancelled');
    expect(Filesystem.writeFile).toHaveBeenCalledTimes(1);
  });

  it('writeFile fails → rejects (the caller shows the export error)', async () => {
    vi.mocked(Filesystem.writeFile).mockRejectedValueOnce(new Error('No space left'));
    const port = createNativeFileExport();
    await expect(port.saveText('a.json', '{}', BACKUP_MIME_TYPE)).rejects.toThrow('No space left');
    expect(Share.share).toHaveBeenCalledTimes(0);
  });

  it('share fails for another reason → rejects', async () => {
    vi.mocked(Share.share).mockRejectedValueOnce(new Error('Sharing is not available'));
    await expect(createNativeFileExport().saveText('a.json', '{}', BACKUP_MIME_TYPE)).rejects.toThrow('Sharing is not available');
  });

  it('isShareCancellation: case-insensitive "cancel" in Error, string or plain object messages', () => {
    expect(isShareCancellation(new Error('Share canceled'))).toBe(true);
    expect(isShareCancellation(new Error('User CANCELLED'))).toBe(true);
    expect(isShareCancellation('cancelled')).toBe(true);
    expect(isShareCancellation({ message: 'Share canceled' })).toBe(true);
    expect(isShareCancellation(new Error('boom'))).toBe(false);
    expect(isShareCancellation(null)).toBe(false);
    expect(isShareCancellation(undefined)).toBe(false);
  });
});
