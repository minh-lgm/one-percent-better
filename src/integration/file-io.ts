// Browser file download (used for the `.ics` reminder in M2 and JSON backups in M3).

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

export const ICS_MIME_TYPE = 'text/calendar;charset=utf-8';
export const JSON_MIME_TYPE = 'application/json;charset=utf-8';

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
