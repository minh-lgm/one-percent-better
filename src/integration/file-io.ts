// Browser file download (used for the `.ics` reminder in M2 and JSON backups in M3).
// v5.0 (ADR-42): `createWebFileExport` wraps it as the web `FileExportPort`; the native adapter lives in native/file-export.ts.
import { ICS_MIME_TYPE } from '../domain/ics';
import type { FileExportPort } from '../services/file-export-port';

export interface DownloadDeps {
  document: Pick<Document, 'createElement' | 'body'>;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  /** Delay before revoking the object URL (Safari needs the URL to outlive the click). */
  revokeDelayMs?: number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
}

const defaultDeps = (): DownloadDeps => ({
  document,
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
});

/** Trigger a download of `content` as a file named `fileName`. */
export function downloadTextFile(fileName: string, content: string, mimeType: string, deps: DownloadDeps = defaultDeps()): void {
  const blob = new Blob([content], { type: mimeType });
  const url = deps.createObjectURL(blob);
  const anchor = deps.document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  deps.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  const schedule = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  schedule(() => deps.revokeObjectURL(url), deps.revokeDelayMs ?? 1000);
}

/** Kept as a re-export (the constant moved to domain/ics.ts in v5.0 so the UI can use it without integration imports). */
export { ICS_MIME_TYPE };
export const JSON_MIME_TYPE = 'application/json;charset=utf-8';

/** Web `FileExportPort` (ARCHITECTURE §5.15): a download is "saved" as soon as the click went through. */
export function createWebFileExport(deps?: DownloadDeps): FileExportPort {
  return {
    async saveText(fileName, content, mimeType) {
      downloadTextFile(fileName, content, mimeType, deps ?? defaultDeps());
      return 'saved';
    },
  };
}

/** Read a user-selected file as UTF-8 text (`Blob.text()` where available, `FileReader` otherwise). */
export function readTextFile(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsText(file);
  });
}
