// Native `FileExportPort` (ARCHITECTURE §5.15, ADR-42): the file is written to the app cache directory
// and handed to the iOS share sheet (Save to Files, AirDrop, Mail, …). Only this folder imports Capacitor.
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { FileExportOutcome, FileExportPort } from '../../services/file-export-port';

export interface NativeFileExportDeps {
  writeFile: (options: { path: string; data: string; directory: Directory; encoding: Encoding }) => Promise<{ uri: string }>;
  share: (options: { title: string; files: string[]; dialogTitle: string }) => Promise<unknown>;
}

const defaultDeps = (): NativeFileExportDeps => ({
  writeFile: (options) => Filesystem.writeFile(options),
  share: (options) => Share.share(options),
});

/** The plugin rejects with "Share canceled" (iOS) when the sheet is dismissed; any "cancel…" message counts. */
export function isShareCancellation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : String((error as { message?: unknown } | null)?.message ?? '');
  return /cancel/i.test(message);
}

export function createNativeFileExport(deps: NativeFileExportDeps = defaultDeps()): FileExportPort {
  return {
    async saveText(fileName, content, _mimeType): Promise<FileExportOutcome> {
      // A failed write rejects as-is: the caller shows the export error (A-65).
      const { uri } = await deps.writeFile({ path: fileName, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
      try {
        await deps.share({ title: fileName, files: [uri], dialogTitle: fileName });
        return 'shared';
      } catch (e) {
        if (isShareCancellation(e)) return 'cancelled';
        throw e;
      }
    },
  };
}
